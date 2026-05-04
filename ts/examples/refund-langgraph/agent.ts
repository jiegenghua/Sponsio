/**
 * Refund agent — LLM-driven LangGraph variant.
 *
 * Uses ``createReactAgent`` from ``@langchain/langgraph`` and Sponsio's
 * ``wrapTools`` adapter so every tool's ``.invoke()`` is gated. A
 * blocked call returns ``"BLOCKED by Sponsio: …"`` as a normal tool
 * result, the agent sees it on its next step and can choose a
 * different path.
 *
 * Run::
 *
 *     GOOGLE_API_KEY=AIza… npx tsx agent.ts
 */

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { Sponsio } from "@sponsio/sdk";
import { wrapTools } from "@sponsio/sdk/langchain";

import { ALL_TOOLS } from "./tools.js";

const guard = new Sponsio({
  agentId: "refund_bot",
  mode: "enforce",
  config: new URL("./sponsio.reference.yaml", import.meta.url).pathname,
});

// Auth layer attests the caller — same hook the canned demo uses.
// In production this would come from your SPIFFE / Okta / mTLS layer.
guard.observeContext({ caller_id: "agent-1" });

// Cast: LangChain's ``DynamicStructuredTool`` has a more specific
// ``invoke`` signature than ``LangChainToolLike``'s ``unknown``-typed
// shape; the runtime contract is identical. Same pattern the BEC
// LangGraph example uses.
const tools = wrapTools(ALL_TOOLS as never, guard);

const llm = new ChatGoogleGenerativeAI({
  model: "gemini-2.0-flash",
  temperature: 0.0,
});

const agent = createReactAgent({ llm, tools: tools as never });

const result = await agent.invoke({
  messages: [
    [
      "user",
      "Customer says order ORD-1 was charged twice — please refund $48.99. " +
        "If a tool is blocked, read the refusal and decide whether to retry " +
        "after the prep step or escalate.",
    ],
  ],
});

for (const msg of result.messages) {
  const cls = msg.constructor.name;
  if (cls === "ToolMessage") {
    const content = String(msg.content).slice(0, 120);
    const tag = content.includes("BLOCKED") ? "BLOCKED" : "OK";
    console.log(`  [${tag}] ${(msg as any).name}: ${content}`);
  } else if (cls === "AIMessage" && msg.content && !(msg as any).tool_calls?.length) {
    console.log(`\nAgent: ${String(msg.content).slice(0, 200)}`);
  }
}

console.log("\n── Session summary ──");
console.log(guard.summary());
guard.finishSession();
