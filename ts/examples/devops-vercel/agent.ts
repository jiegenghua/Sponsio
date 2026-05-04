/**
 * DevOps agent — LLM-driven Vercel AI SDK variant.
 *
 * Drives the same five tools through ``generateText`` with a real
 * Gemini call. The Sponsio middleware (``sponsioMiddleware``) wraps
 * the language model so every requested tool call is checked before
 * the AI SDK actually invokes it. Anything blocked is dropped from
 * the call list and the model sees a follow-up note describing the
 * refusal.
 *
 * Run::
 *
 *     GOOGLE_API_KEY=AIza… npx tsx agent.ts
 */

import { google } from "@ai-sdk/google";
import { generateText, wrapLanguageModel } from "ai";
import { Sponsio } from "@sponsio/sdk";
import { sponsioMiddleware } from "@sponsio/sdk/vercel-ai";

import {
  bash,
  runSql,
  writeFile,
  shutdownHost,
  confirmShutdownHost,
} from "./tools.js";

const guard = new Sponsio({
  agentId: "devops_bot",
  mode: "enforce",
  // Loaded from yaml so the contract set lives in one place — the
  // same yaml the security team reviews ships with the CLI demo.
  config: new URL("./sponsio.reference.yaml", import.meta.url).pathname,
});

const model = wrapLanguageModel({
  model: google("gemini-2.0-flash"),
  middleware: sponsioMiddleware(guard),
});

const result = await generateText({
  model,
  tools: { bash, run_sql: runSql, write_file: writeFile, shutdown_host: shutdownHost, confirm_shutdown_host: confirmShutdownHost },
  system:
    "You are a DevOps agent. Clean up old log files and reduce table " +
    "bloat without breaking anything. If a tool is blocked by policy, " +
    "read the refusal and try a different approach.",
  prompt:
    "Old log table is bloated — please drop it and clean up /var/log. " +
    "If anything's blocked just retry with the necessary prep step.",
  maxSteps: 8,
});

console.log("\n── Agent summary ──");
console.log(result.text);
console.log();
console.log(guard.summary());
guard.finishSession();
