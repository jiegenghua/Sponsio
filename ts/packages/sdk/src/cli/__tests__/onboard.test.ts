// Onboard heuristics — pure unit tests for the bits that don't shell
// out to the Python CLI: NL contract suggestion, fallback yaml
// shape, and ``package.json``-driven framework detection.
//
// Migrated from ``ts/packages/scanner/tests/onboard.test.ts`` when
// scanner merged into ``@sponsio/sdk``.  Switched from vitest to
// node:test (matches the existing ``sdk/src/__tests__/*.test.ts``
// convention — single test runner per package).

import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { dump } from "js-yaml";

import {
  buildFallbackPayload,
  detectFramework,
  suggestDetNlContracts,
} from "../onboard";

describe("onboard heuristics", () => {
  it("suggestDetNlContracts prefers must_precede when a confirm tool exists", () => {
    const names = ["confirm_with_user", "delete_file"];
    const c = suggestDetNlContracts(names);
    assert.ok(c.length > 0);
    assert.ok(c[0]!.E.includes("must precede"));
  });

  it("buildFallbackPayload round-trips through js-yaml", () => {
    const p = buildFallbackPayload(
      ["delete_thing", "get_x"],
      { tools: [] },
      "agent",
      "observe",
    );
    const s = dump(p);
    assert.ok(s.includes("version: 1"));
    assert.ok(s.includes("mode: observe"));
  });

  it("detectFramework returns one of the known framework labels for cwd", () => {
    // Repo cwd may or may not have a recognised package.json; just
    // assert the return is a known label.
    const fw = detectFramework(process.cwd());
    assert.ok(
      ["none", "langgraph", "vercel", "openai", "mcp", "claude", "google_adk"].includes(fw),
    );
  });

  it("detectFramework sees Google ADK from package.json", () => {
    const dir = mkdtempSync(join(tmpdir(), "sponsio-adk-"));
    try {
      writeFileSync(
        join(dir, "package.json"),
        JSON.stringify({ dependencies: { "@google/adk": "^0.2.0" } }),
      );
      assert.equal(detectFramework(dir), "google_adk");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
