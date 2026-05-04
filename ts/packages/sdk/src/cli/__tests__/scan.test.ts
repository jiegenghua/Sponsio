// AST scan extractors — Vercel AI / LangChain.js / generic /
// decorator paths.  Fixtures are TypeScript files with synthetic
// tool-shape patterns; ts-morph parses them as text without
// type-checking, which is why the fixtures live OUTSIDE ``src/``
// (under ``test-fixtures/``) where tsc can't see them.
//
// Migrated from ``ts/packages/scanner/tests/scan.test.ts`` when
// scanner merged into ``@sponsio/sdk``.  Switched from vitest to
// node:test.

import assert from "node:assert/strict";
import * as path from "node:path";
import { describe, it } from "node:test";

import { scan } from "../index";

// At runtime ``__dirname`` resolves under ``dist/cli/__tests__/``;
// fixtures live at ``test-fixtures/`` next to ``dist/``.  Walk up
// four levels: __tests__ → cli → dist → sdk-package-root.
const FIXTURES = path.resolve(__dirname, "..", "..", "..", "test-fixtures");

type ScanResult = Awaited<ReturnType<typeof scan>>;

function byName(tools: ScanResult["tools"]): Record<string, ScanResult["tools"][number]> {
  return Object.fromEntries(tools.map((t) => [t.function.name, t]));
}

describe("Vercel AI SDK extractor", () => {
  it("extracts tools defined via tool({...})", async () => {
    const { tools } = await scan([path.join(FIXTURES, "vercel.ts")]);
    const map = byName(tools);

    assert.deepStrictEqual(
      Object.keys(map).sort(),
      ["deleteAccount", "listOrders", "lookupCustomer"].sort(),
    );

    const lookup = map["lookupCustomer"];
    assert.ok(lookup.function.description.includes("Fetch a customer"));
    assert.ok("user_id" in lookup.function.parameters.properties);
    assert.equal(
      (lookup.function.parameters.properties as Record<string, { type: string }>).user_id.type,
      "string",
    );
    // .optional() → absent from required[]
    assert.ok(lookup.function.parameters.required!.includes("user_id"));
    assert.ok(!lookup.function.parameters.required!.includes("include_archived"));
  });

  it("converts z.enum to enum JSON schema", async () => {
    const { tools } = await scan([path.join(FIXTURES, "vercel.ts")]);
    const map = byName(tools);
    const status = (
      map["listOrders"].function.parameters.properties as Record<
        string,
        { type: string; enum?: string[] }
      >
    ).status;
    assert.equal(status.type, "string");
    assert.deepStrictEqual(status.enum, ["pending", "shipped", "delivered"]);
  });

  it("recognises z.number().int() as integer", async () => {
    const { tools } = await scan([path.join(FIXTURES, "vercel.ts")]);
    const map = byName(tools);
    const limit = (
      map["listOrders"].function.parameters.properties as Record<
        string,
        { type: string }
      >
    ).limit;
    assert.equal(limit.type, "integer");
  });
});

describe("LangChain.js extractor", () => {
  it("extracts new DynamicStructuredTool({...})", async () => {
    const { tools } = await scan([path.join(FIXTURES, "langchain.ts")]);
    const map = byName(tools);
    assert.ok("issue_refund" in map);
    assert.ok("order_id" in map["issue_refund"].function.parameters.properties);
    assert.ok("amount" in map["issue_refund"].function.parameters.properties);
  });

  it("extracts new DynamicTool({...}) without schema", async () => {
    const { tools } = await scan([path.join(FIXTURES, "langchain.ts")]);
    const map = byName(tools);
    assert.ok("check_policy" in map);
    assert.deepStrictEqual(map["check_policy"].function.parameters, {
      type: "object",
      properties: {},
    });
  });

  it("infers tool name from variable assignment when no name key is set", async () => {
    const { tools } = await scan([path.join(FIXTURES, "langchain.ts")]);
    const map = byName(tools);
    assert.ok("transferFunds" in map);
  });
});

describe("Generic fallback extractor", () => {
  it("extracts createTool({...}) calls", async () => {
    const { tools } = await scan([path.join(FIXTURES, "generic.ts")]);
    const map = byName(tools);
    assert.ok("lookup_order" in map);
    assert.ok(map["lookup_order"].function.description.includes("Look up"));
    assert.ok("order_id" in map["lookup_order"].function.parameters.properties);
    assert.ok(
      map["lookup_order"].function.parameters.required!.includes("order_id"),
    );
  });

  it("extracts dotted member access like Sponsio.tool({...})", async () => {
    const { tools } = await scan([path.join(FIXTURES, "generic.ts")]);
    const map = byName(tools);
    assert.ok("cancel_order" in map);
    assert.ok("order_id" in map["cancel_order"].function.parameters.properties);
  });

  it("extracts Google ADK new FunctionTool({...}) tools", async () => {
    const { tools } = await scan([path.join(FIXTURES, "generic.ts")]);
    const map = byName(tools);
    assert.ok("search_flights" in map);
    assert.ok(
      map["search_flights"].function.description.includes(
        "Search available flights",
      ),
    );
    assert.ok("origin" in map["search_flights"].function.parameters.properties);
    assert.ok(
      "destination" in map["search_flights"].function.parameters.properties,
    );
  });

  it("ignores call sites that lack the tool object shape", async () => {
    const { tools } = await scan([path.join(FIXTURES, "generic.ts")]);
    const map = byName(tools);
    assert.ok(!("notATool" in map));
    assert.ok(tools.every((t) => t.function.name.length > 0));
  });

  it("extracts methods decorated with @tool", async () => {
    const { tools } = await scan([path.join(FIXTURES, "generic.ts")]);
    const map = byName(tools);
    assert.ok("getCustomer" in map);
    assert.ok(
      map["getCustomer"].function.description.includes("Fetch customer profile"),
    );
  });

  it("@tool({...}) config wins over JSDoc description", async () => {
    const { tools } = await scan([path.join(FIXTURES, "generic.ts")]);
    const map = byName(tools);
    assert.ok("refund" in map);
    assert.ok(map["refund"].function.description.includes("config.description"));
    assert.ok("amount" in map["refund"].function.parameters.properties);
  });

  it("provenance is labelled generic / generic_decorator", async () => {
    const { provenance } = await scan([path.join(FIXTURES, "generic.ts")]);
    const labels = new Set(Object.values(provenance).map((p) => p.extractor));
    assert.ok(labels.has("generic"));
    assert.ok(labels.has("generic_decorator"));
  });

  it("framework-specific extractor wins over generic for the same call site", async () => {
    const { provenance } = await scan([path.join(FIXTURES, "vercel.ts")]);
    const labels = new Set(Object.values(provenance).map((p) => p.extractor));
    assert.ok(labels.has("vercel_ai"));
    assert.ok(!labels.has("generic"));
  });
});

describe("Output shape (OpenAI function-calling)", () => {
  it("produces tools with {type: 'function', function: {name, description, parameters}}", async () => {
    const { tools } = await scan([FIXTURES + "/*.ts"]);
    assert.ok(tools.length > 0);
    for (const t of tools) {
      assert.equal(t.type, "function");
      assert.ok(t.function.name);
      assert.equal(t.function.parameters.type, "object");
      assert.ok(t.function.parameters.properties !== undefined);
    }
  });

  it("provenance maps record filepath + extractor", async () => {
    const { provenance } = await scan([FIXTURES + "/*.ts"]);
    const values = Object.values(provenance);
    assert.ok(values.length > 0);
    const extractors = new Set(values.map((p) => p.extractor));
    assert.ok(extractors.has("vercel_ai"));
    assert.ok(extractors.has("langchain_js"));
  });
});
