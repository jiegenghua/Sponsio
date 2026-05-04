/**
 * Comprehensive coverage — workflow hygiene patterns (TS).
 *
 * Mirrors ``tests/comprehensive/test_patterns_workflow.py``.
 */

import {
  approvalFreshness,
  auditAfter,
  backupBeforeDestructive,
  dryRunBeforeCommit,
  duplicateCallLimit,
  sanitizedBeforeSink,
} from "../core/patterns.js";
import { makeGuard, newScoreboard } from "./_comprehensive_helpers.js";

const board = newScoreboard();
const a = (cond: boolean, msg: string) => board.assert(cond, msg);

// ── dry_run_before_commit ──────────────────────────────────────────
{
  const g = makeGuard([dryRunBeforeCommit("plan", "apply")]);
  a(g.guardBefore("apply").blocked, "dry_run_before_commit blocks without plan");
}
{
  const g = makeGuard([dryRunBeforeCommit("plan", "apply")]);
  g.guardBefore("plan");
  a(!g.guardBefore("apply").blocked, "dry_run_before_commit allows after plan");
}

// ── backup_before_destructive ──────────────────────────────────────
{
  const g = makeGuard([backupBeforeDestructive("snapshot", "drop_table")]);
  a(g.guardBefore("drop_table").blocked, "backup_before_destructive blocks unsafe drop");
}
{
  const g = makeGuard([backupBeforeDestructive("snapshot", "drop_table")]);
  g.guardBefore("snapshot");
  a(!g.guardBefore("drop_table").blocked, "backup_before_destructive allows after snapshot");
}

// ── audit_after — liveness; verify trigger doesn't block + audit completes ──
{
  const g = makeGuard([auditAfter("transfer_funds", "audit_log")]);
  a(!g.guardBefore("transfer_funds").blocked, "audit_after: trigger fires");
  a(!g.guardBefore("audit_log").blocked, "audit_after: audit step fires");
}

// ── approval_freshness ─────────────────────────────────────────────
{
  const g = makeGuard([approvalFreshness("approve", "deploy", 1)]);
  a(g.guardBefore("deploy").blocked, "approval_freshness blocks without approval");
}
{
  const g = makeGuard([approvalFreshness("approve", "deploy", 2)]);
  g.guardBefore("approve");
  a(!g.guardBefore("deploy").blocked, "approval_freshness allows within window");
}

// ── sanitized_before_sink ──────────────────────────────────────────
{
  const g = makeGuard([sanitizedBeforeSink("web_fetch", "sanitize", "send_email")]);
  g.guardBefore("web_fetch");
  a(g.guardBefore("send_email").blocked, "sanitized_before_sink blocks without sanitizer");
}
{
  const g = makeGuard([sanitizedBeforeSink("web_fetch", "sanitize", "send_email")]);
  g.guardBefore("web_fetch");
  g.guardBefore("sanitize");
  a(!g.guardBefore("send_email").blocked, "sanitized_before_sink allows after sanitize");
}

// ── duplicate_call_limit ───────────────────────────────────────────
{
  const g = makeGuard([duplicateCallLimit("search", "invoice-42", 1)]);
  a(!g.guardBefore("search", { query: "invoice-42" }).blocked, "duplicate_call_limit first allowed");
  a(g.guardBefore("search", { query: "invoice-42" }).blocked, "duplicate_call_limit second blocked");
}
{
  const g = makeGuard([duplicateCallLimit("search", "invoice-42", 1)]);
  g.guardBefore("search", { query: "invoice-42" });
  a(!g.guardBefore("search", { query: "report-99" }).blocked, "duplicate_call_limit allows different args");
}

board.summary("comprehensive_workflow");
