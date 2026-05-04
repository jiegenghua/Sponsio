/**
 * Comprehensive coverage — Layer-3 patterns (TS).
 *
 * Mirrors ``tests/comprehensive/test_patterns_layer3.py``: max_length,
 * no_pii, no_keywords, ctx_required, ctx_matches_required, time_since,
 * approval_active, never_together. Drives the new entry points
 * ``observeContext`` / ``observeApproval`` / ``observeResponse``.
 */

import {
  approvalActive,
  ctxMatchesRequired,
  ctxRequired,
  maxLength,
  neverTogether,
  noKeywords,
  noPii,
  timeSince,
} from "../core/patterns.js";
import { makeGuard, newScoreboard } from "./_comprehensive_helpers.js";

const board = newScoreboard();
const a = (cond: boolean, msg: string) => board.assert(cond, msg);

// ── max_length ─────────────────────────────────────────────────────
{
  const g = makeGuard([maxLength({ maxWords: 5 })]);
  const r = g.observeResponse("this response definitely runs longer than five words total");
  a(r.blocked, "max_length blocks oversize words");
}
{
  const g = makeGuard([maxLength({ maxWords: 10 })]);
  const r = g.observeResponse("short reply ok");
  a(!r.blocked, "max_length allows within budget");
}
{
  const g = makeGuard([maxLength({ maxChars: 20 })]);
  const r = g.observeResponse("this is way too long for the budget");
  a(r.blocked, "max_length blocks oversize chars");
}

// ── no_pii ─────────────────────────────────────────────────────────
{
  const g = makeGuard([noPii(["email"])]);
  a(g.observeResponse("contact me at alice@example.com").blocked, "no_pii blocks email");
}
{
  const g = makeGuard([noPii(["ssn"])]);
  a(g.observeResponse("the ssn is 123-45-6789 do not share").blocked, "no_pii blocks ssn");
}
{
  const g = makeGuard([noPii()]);
  a(!g.observeResponse("hello world, no PII here").blocked, "no_pii allows clean response");
}

// ── no_keywords ────────────────────────────────────────────────────
{
  const g = makeGuard([noKeywords(["password", "secret"])]);
  a(g.observeResponse("the password is hunter2").blocked, "no_keywords blocks match");
}
{
  const g = makeGuard([noKeywords(["secret"])]);
  a(g.observeResponse("here is a SECRET").blocked, "no_keywords case-insensitive");
}
{
  const g = makeGuard([noKeywords(["password"])]);
  a(!g.observeResponse("no credentials disclosed").blocked, "no_keywords allows non-match");
}

// ── ctx_required ───────────────────────────────────────────────────
{
  const g = makeGuard([ctxRequired("wire_transfer", "caller_id", ["alice", "bob"])]);
  a(g.guardBefore("wire_transfer", { amount: 1 }).blocked, "ctx_required blocks without ctx");
}
{
  const g = makeGuard([ctxRequired("wire_transfer", "caller_id", ["alice", "bob"])]);
  g.observeContext({ caller_id: "alice" });
  a(!g.guardBefore("wire_transfer", { amount: 1 }).blocked, "ctx_required allows alice");
}
{
  const g = makeGuard([ctxRequired("wire_transfer", "caller_id", ["alice"])]);
  g.observeContext({ caller_id: "eve" });
  a(g.guardBefore("wire_transfer").blocked, "ctx_required blocks eve");
}

// ── ctx_matches_required ───────────────────────────────────────────
{
  const g = makeGuard([ctxMatchesRequired("publish", "msg_verified", "^true$")]);
  g.observeContext({ msg_verified: "true" });
  a(!g.guardBefore("publish").blocked, "ctx_matches_required allows on match");
}
{
  const g = makeGuard([ctxMatchesRequired("publish", "msg_verified", "^true$")]);
  g.observeContext({ msg_verified: "false" });
  a(g.guardBefore("publish").blocked, "ctx_matches_required blocks on mismatch");
}

// ── time_since ─────────────────────────────────────────────────────
{
  const g = makeGuard([timeSince("ctx(approval, granted)", 5)]);
  g.observeContext({ approval: "granted" });
  a(!g.guardBefore("act").blocked, "time_since within window");
}
{
  const g = makeGuard([timeSince("ctx(approval, granted)", 5)]);
  a(g.guardBefore("act").blocked, "time_since blocks when never fired");
}

// ── approval_active ────────────────────────────────────────────────
{
  const g = makeGuard([approvalActive("issue_refund", "senior_eng", 100)]);
  g.observeApproval({ role: "senior_eng", decision: "allow" });
  a(!g.guardBefore("issue_refund", { amount: 100 }).blocked, "approval_active fresh allows");
}
{
  const g = makeGuard([approvalActive("issue_refund", "senior_eng", 100)]);
  a(g.guardBefore("issue_refund").blocked, "approval_active blocks without approval");
}
{
  const g = makeGuard([approvalActive("issue_refund", "senior_eng", 100)]);
  g.observeApproval({ role: "junior_eng", decision: "allow" });
  a(g.guardBefore("issue_refund").blocked, "approval_active blocks wrong role");
}
{
  const g = makeGuard([approvalActive("issue_refund", "senior_eng", 100)]);
  g.observeApproval({ role: "senior_eng", decision: "deny" });
  a(g.guardBefore("issue_refund").blocked, "approval_active blocks deny decision");
}

// ── never_together (deprecated alias of mutual_exclusion) ──────────
{
  const g = makeGuard([neverTogether("approve", "reject")]);
  g.guardBefore("approve");
  a(g.guardBefore("reject").blocked, "never_together blocks second");
}

board.summary("comprehensive_layer3");
