/**
 * Comprehensive coverage — argument patterns (TS).
 *
 * Mirrors ``tests/comprehensive/test_patterns_args.py``.
 */

import {
  argAllowlist,
  argBlacklist,
  argLengthLimit,
  dataIntact,
  scopeLimit,
} from "../core/patterns.js";
import { makeGuard, newScoreboard } from "./_comprehensive_helpers.js";

const board = newScoreboard();
const a = (cond: boolean, msg: string) => board.assert(cond, msg);

// ── arg_blacklist ──────────────────────────────────────────────────
{
  const g = makeGuard([argBlacklist("execute_sql", "query", ["DROP\\s+TABLE"])]);
  a(g.guardBefore("execute_sql", { query: "DROP TABLE users" }).blocked, "arg_blacklist blocks match");
}
{
  const g = makeGuard([argBlacklist("execute_sql", "query", ["DROP\\s+TABLE"])]);
  a(!g.guardBefore("execute_sql", { query: "SELECT * FROM users" }).blocked, "arg_blacklist allows clean");
}

// ── arg_allowlist ──────────────────────────────────────────────────
{
  const g = makeGuard([argAllowlist("post_message", "channel", ["^#prod-", "^#ops-"])]);
  a(g.guardBefore("post_message", { channel: "#random" }).blocked, "arg_allowlist blocks outside set");
}
{
  const g = makeGuard([argAllowlist("post_message", "channel", ["^#prod-", "^#ops-"])]);
  a(!g.guardBefore("post_message", { channel: "#prod-alerts" }).blocked, "arg_allowlist allows match");
}

// ── scope_limit ────────────────────────────────────────────────────
{
  const g = makeGuard([scopeLimit("write_file", ["/tmp/", "/var/log/"])]);
  a(g.guardBefore("write_file", { path: "/etc/passwd" }).blocked, "scope_limit blocks outside path");
}
{
  const g = makeGuard([scopeLimit("write_file", ["/tmp/", "/var/log/"])]);
  a(!g.guardBefore("write_file", { path: "/tmp/output.txt" }).blocked, "scope_limit allows inside path");
}

// ── arg_length_limit ───────────────────────────────────────────────
{
  const g = makeGuard([argLengthLimit("post_message", "body", 50)]);
  a(g.guardBefore("post_message", { body: "x".repeat(200) }).blocked, "arg_length_limit blocks oversized");
}
{
  const g = makeGuard([argLengthLimit("post_message", "body", 50)]);
  a(!g.guardBefore("post_message", { body: "short" }).blocked, "arg_length_limit allows within budget");
}

// ── data_intact ────────────────────────────────────────────────────
{
  const g = makeGuard([dataIntact("forge", ["/data/"])]);
  a(
    g.guardBefore("bash", { command: "forge --in /tmp/synthetic.csv" }).blocked,
    "data_intact blocks synthetic input",
  );
}
{
  const g = makeGuard([dataIntact("forge", ["/data/"])]);
  a(
    !g.guardBefore("bash", { command: "forge --in /data/raw.csv" }).blocked,
    "data_intact allows original path",
  );
}

board.summary("comprehensive_args");
