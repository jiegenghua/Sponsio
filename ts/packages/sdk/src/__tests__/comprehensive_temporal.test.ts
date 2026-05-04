/**
 * Comprehensive coverage — core temporal patterns (TS).
 *
 * Mirrors ``tests/comprehensive/test_patterns_temporal.py``. Each
 * pattern in the "core temporal" group of ``patterns.ts`` gets a
 * happy path + a violation path.
 */

import {
  alwaysFollowedBy,
  boundedRetry,
  cooldown,
  deadline,
  idempotent,
  loopDetection,
  mustConfirm,
  mustPrecede,
  mutualExclusion,
  noReversal,
  rateLimit,
  requiresPermission,
  segregationOfDuty,
} from "../core/patterns.js";
import { makeGuard, newScoreboard } from "./_comprehensive_helpers.js";

const board = newScoreboard();
const a = (cond: boolean, msg: string) => board.assert(cond, msg);

// ── must_precede ───────────────────────────────────────────────────
{
  const g = makeGuard([mustPrecede("check_policy", "issue_refund")]);
  a(g.guardBefore("issue_refund", { id: 1 }).blocked, "must_precede blocks before precondition");
}
{
  const g = makeGuard([mustPrecede("check_policy", "issue_refund")]);
  g.guardBefore("check_policy");
  a(!g.guardBefore("issue_refund").blocked, "must_precede allows after precondition");
}

// ── always_followed_by — passes when response runs ─────────────────
{
  const g = makeGuard([alwaysFollowedBy("send_email", "log_audit")]);
  g.guardBefore("send_email");
  a(!g.guardBefore("log_audit").blocked, "always_followed_by happy path");
}

// ── no_reversal ────────────────────────────────────────────────────
{
  const g = makeGuard([noReversal("approve_refund", "deny_refund")]);
  g.guardBefore("approve_refund");
  a(g.guardBefore("deny_refund").blocked, "no_reversal blocks contradicting action");
}
{
  const g = makeGuard([noReversal("approve_refund", "deny_refund")]);
  a(!g.guardBefore("deny_refund").blocked, "no_reversal allows when no commitment");
}

// ── requires_permission ────────────────────────────────────────────
{
  const g = makeGuard([requiresPermission("delete_account", "admin")]);
  a(g.guardBefore("delete_account").blocked, "requires_permission blocks without perm");
}

// ── mutual_exclusion ───────────────────────────────────────────────
{
  const g = makeGuard([mutualExclusion("approve", "reject")]);
  g.guardBefore("approve");
  a(g.guardBefore("reject").blocked, "mutual_exclusion blocks second choice");
}
{
  const g = makeGuard([mutualExclusion("approve", "reject")]);
  g.guardBefore("approve", { id: 1 });
  a(!g.guardBefore("approve", { id: 2 }).blocked, "mutual_exclusion allows repeating same side");
}

// ── rate_limit ─────────────────────────────────────────────────────
{
  const g = makeGuard([rateLimit("send_email", 2)]);
  a(!g.guardBefore("send_email").blocked, "rate_limit step 1");
  a(!g.guardBefore("send_email").blocked, "rate_limit step 2");
  a(g.guardBefore("send_email").blocked, "rate_limit step 3 blocked");
}

// ── idempotent ─────────────────────────────────────────────────────
{
  const g = makeGuard([idempotent("provision_account")]);
  a(!g.guardBefore("provision_account").blocked, "idempotent first allowed");
  a(g.guardBefore("provision_account").blocked, "idempotent second blocked");
}

// ── deadline ───────────────────────────────────────────────────────
{
  const g = makeGuard([deadline("auth", "transfer", 3)]);
  g.guardBefore("auth");
  a(!g.guardBefore("transfer").blocked, "deadline satisfied within window");
}
{
  const g = makeGuard([deadline("auth", "transfer", 1)]);
  g.guardBefore("auth");
  // ``transfer`` never runs — violating step is the next non-transfer call.
  const r = g.guardBefore("noise");
  // Liveness violation surfaces as a block at the deadline-exceeding step.
  a(r.blocked, "deadline violated when action never runs");
}

// ── must_confirm ───────────────────────────────────────────────────
{
  const g = makeGuard([mustConfirm("delete")]);
  a(g.guardBefore("delete").blocked, "must_confirm blocks without confirmation");
}
{
  const g = makeGuard([mustConfirm("delete")]);
  g.guardBefore("confirm_delete");
  a(!g.guardBefore("delete").blocked, "must_confirm allows after confirmation");
}

// ── cooldown ───────────────────────────────────────────────────────
{
  const g = makeGuard([cooldown("page_oncall", 2)]);
  g.guardBefore("page_oncall");
  a(g.guardBefore("page_oncall").blocked, "cooldown blocks repeat within window");
}

// ── segregation_of_duty ────────────────────────────────────────────
{
  const g = makeGuard([segregationOfDuty("submit", "approve")]);
  g.guardBefore("submit");
  a(g.guardBefore("approve").blocked, "segregation_of_duty blocks same-session swap");
}

// ── bounded_retry ──────────────────────────────────────────────────
{
  const g = makeGuard([boundedRetry("retry_payment", 2)]);
  a(!g.guardBefore("retry_payment").blocked, "bounded_retry 1");
  a(!g.guardBefore("retry_payment").blocked, "bounded_retry 2");
  a(g.guardBefore("retry_payment").blocked, "bounded_retry 3 blocked");
}

// ── loop_detection ─────────────────────────────────────────────────
{
  const g = makeGuard([loopDetection("poll", 3)]);
  for (let i = 0; i < 3; i++) {
    a(!g.guardBefore("poll").blocked, `loop_detection poll ${i + 1}`);
  }
  a(g.guardBefore("poll").blocked, "loop_detection blocks 4th consecutive poll");
}
{
  const g = makeGuard([loopDetection("poll", 2)]);
  g.guardBefore("poll");
  g.guardBefore("poll");
  g.guardBefore("done");
  a(!g.guardBefore("poll").blocked, "loop_detection counter resets on different tool");
  a(!g.guardBefore("poll").blocked, "loop_detection still in budget after reset");
}

board.summary("comprehensive_temporal");
