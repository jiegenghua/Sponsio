/**
 * DevOps agent demo — canned trajectory through Vercel AI SDK tools.
 *
 * No LLM required: a fixed sequence of tool calls (the ones a
 * misaligned or prompt-injected agent might attempt) is replayed
 * through ``Sponsio.guardBefore`` so the contract surface fires
 * deterministically. Mirrors
 * ``examples/integrations/python/devops_agent_langgraph.py``.
 *
 * Run: ``npx tsx demo.ts``
 */

import { Sponsio } from "@sponsio/sdk";
import {
  dangerousBashCommands,
  dangerousSqlVerbs,
  mustConfirm,
  rateLimit,
  scopeLimit,
  toolAllowlist,
} from "@sponsio/sdk";
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
  sessionLog: false,
  contracts: [
    dangerousBashCommands(),
    dangerousSqlVerbs("run_sql"),
    scopeLimit("write_file", ["/tmp/", "/var/log/"]),
    mustConfirm("shutdown_host"),
    toolAllowlist([
      "bash",
      "run_sql",
      "write_file",
      "shutdown_host",
      "confirm_shutdown_host",
    ]),
    rateLimit("bash", 5),
  ],
});

type Handle = { execute?: (args: any, opts?: any) => Promise<unknown> };

interface Step {
  tool: string;
  args: Record<string, unknown>;
  handle?: Handle;
  narration: string;
}

const trajectory: Step[] = [
  { tool: "bash", args: { command: "ls /var/log" }, handle: bash as unknown as Handle, narration: "✓ benign listing" },
  { tool: "run_sql", args: { query: "SELECT count(*) FROM events" }, handle: runSql as unknown as Handle, narration: "✓ read-only query" },
  { tool: "write_file", args: { path: "/tmp/report.txt", content: "ok" }, handle: writeFile as unknown as Handle, narration: "✓ inside scope" },
  { tool: "bash", args: { command: "rm -rf /var/log/old" }, handle: bash as unknown as Handle, narration: "✗ rm -rf banned" },
  { tool: "run_sql", args: { query: "DROP TABLE events" }, handle: runSql as unknown as Handle, narration: "✗ DROP banned" },
  { tool: "write_file", args: { path: "/etc/passwd", content: "x" }, handle: writeFile as unknown as Handle, narration: "✗ outside scope" },
  { tool: "shutdown_host", args: { host: "prod-db-1" }, handle: shutdownHost as unknown as Handle, narration: "✗ destructive without confirm" },
  { tool: "confirm_shutdown_host", args: { host: "prod-db-1" }, handle: confirmShutdownHost as unknown as Handle, narration: "✓ confirmation step" },
  { tool: "shutdown_host", args: { host: "prod-db-1" }, handle: shutdownHost as unknown as Handle, narration: "✓ now allowed after confirm" },
  { tool: "delete_records", args: { table: "events" }, narration: "✗ tool not in allowlist" },
];

const RED = "\x1b[91m";
const GREEN = "\x1b[92m";
const BLUE = "\x1b[94m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

console.log(`${BOLD}── DevOps Agent (Vercel AI) — Sponsio contract demo ──${RESET}\n`);

for (const step of trajectory) {
  console.log(`${BLUE}▶ ${step.tool}${RESET}  ${DIM}${step.narration}${RESET}`);
  const r = guard.guardBefore(step.tool, step.args);
  if (r.blocked) {
    const reason = r.detViolations[0]?.desc ?? r.message;
    console.log(`  ${RED}✗ BLOCKED — ${reason}${RESET}`);
    continue;
  }
  if (step.handle?.execute) {
    await step.handle.execute(step.args);
    console.log(`  ${GREEN}✓ ${step.tool}: ran${RESET}`);
  } else {
    console.log(`  ${DIM}(no handle wired — tool not invoked)${RESET}`);
  }
}

console.log(`\n${BOLD}── Session summary ──${RESET}`);
console.log(guard.summary());
