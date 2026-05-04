/**
 * Refund agent demo — canned trajectory through LangChain tools.
 *
 * No LLM required: a fixed sequence of tool calls + ``observeContext``
 * / ``observeApproval`` / ``observeResponse`` events drives the guard
 * deterministically. Mirrors
 * ``examples/integrations/python/refund_agent_vanilla.py``.
 *
 * Run: ``npx tsx demo.ts``
 */

import { Sponsio } from "@sponsio/sdk";
import {
  approvalActive,
  ctxRequired,
  maxLength,
  noPii,
  rateLimit,
} from "@sponsio/sdk";
import { issueRefund, issueRefundHighValue, lookupOrder } from "./tools.js";

const guard = new Sponsio({
  agentId: "refund_bot",
  mode: "enforce",
  sessionLog: false,
  contracts: [
    ctxRequired("issue_refund", "caller_id", ["agent-1", "agent-2"]),
    approvalActive("issue_refund_high_value", "senior_eng", 60),
    rateLimit("issue_refund", 5),
    noPii(["email", "ssn", "credit_card"]),
    maxLength({ maxWords: 200 }),
  ],
});

const RED = "\x1b[91m";
const GREEN = "\x1b[92m";
const BLUE = "\x1b[94m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

const section = (label: string) => console.log(`\n${BOLD}── ${label} ──${RESET}`);
const action = (tool: string, detail: string) =>
  console.log(`${BLUE}▶ ${tool}${RESET}  ${DIM}${detail}${RESET}`);
const ok = (msg: string) => console.log(`  ${GREEN}✓ ${msg}${RESET}`);
const blocked = (msg: string) => console.log(`  ${RED}✗ BLOCKED — ${msg}${RESET}`);

console.log(`${BOLD}── Refund Agent (LangGraph) — Sponsio Layer-3 demo ──${RESET}`);

// ── Step 1: refund without attested caller — ctx_required fails closed ──
section("Step 1 — refund without attested caller");
action("issue_refund", "amount=$48.99 — no observeContext yet");
{
  const r = guard.guardBefore("issue_refund", { orderId: "ORD-1", amount: 48.99 });
  if (r.blocked) blocked(r.detViolations[0].desc);
}

// ── Step 2: auth layer attests, retry ───────────────────────────────
section("Step 2 — attest caller, retry refund");
guard.observeContext({ caller_id: "agent-1" });
action("issue_refund", "amount=$48.99 — caller attested");
{
  const r = guard.guardBefore("issue_refund", { orderId: "ORD-1", amount: 48.99 });
  if (!r.blocked) {
    await issueRefund.invoke({ orderId: "ORD-1", amount: 48.99 });
    ok("issue_refund ran");
  } else {
    blocked(r.detViolations[0].desc);
  }
}

// ── Step 3: high-value refund without approval — approval_active fails ──
section("Step 3 — high-value refund without approval");
action("issue_refund_high_value", "amount=$2,500 — no approval");
{
  const r = guard.guardBefore("issue_refund_high_value", { orderId: "ORD-2", amount: 2500 });
  if (r.blocked) blocked(r.detViolations[0].desc);
}

// ── Step 4: HITL approval, retry ─────────────────────────────────────
section("Step 4 — HITL grants senior_eng approval, retry");
guard.observeApproval({ role: "senior_eng", decision: "allow" });
action("issue_refund_high_value", "amount=$2,500 — approval fresh");
{
  const r = guard.guardBefore("issue_refund_high_value", { orderId: "ORD-2", amount: 2500 });
  if (!r.blocked) {
    await issueRefundHighValue.invoke({ orderId: "ORD-2", amount: 2500 });
    ok("issue_refund_high_value ran");
  } else {
    blocked(r.detViolations[0].desc);
  }
}

// ── Step 5: PII reply blocked by no_pii ─────────────────────────────
section("Step 5 — LLM reply with PII");
{
  const res = guard.observeResponse(
    "We've refunded $48.99. Confirmation went to alice@customer.com.",
  );
  if (res.blocked) blocked(res.detViolations[0].desc);
}

// ── Step 6: clean reply ─────────────────────────────────────────────
section("Step 6 — LLM reply that's clean");
{
  const res = guard.observeResponse(
    "We've refunded $48.99 to your card. The amount will appear in 3-5 business days.",
  );
  if (!res.blocked) ok("LLM reply allowed");
}

// ── Step 7: hit rate-limit ceiling ──────────────────────────────────
section("Step 7 — exhaust the rate limit");
for (let n = 0; n < 5; n++) {
  // (We've already issued one refund in step 2, so this loop adds
  // four more before the cap fires on the fifth attempt below.)
  const r = guard.guardBefore("issue_refund", { orderId: `ORD-bulk-${n}`, amount: 10 });
  if (r.blocked) {
    blocked(`#${n + 2}: ${r.detViolations[0].desc}`);
    break;
  }
  await issueRefund.invoke({ orderId: `ORD-bulk-${n}`, amount: 10 });
  ok(`issue_refund #${n + 2}`);
}

// ── Lookup_order — verifies untracked tools still flow through ──────
section("Step 8 — lookup_order is untracked, runs freely");
{
  const r = guard.guardBefore("lookup_order", { orderId: "ORD-99" });
  if (!r.blocked) {
    const out = await lookupOrder.invoke({ orderId: "ORD-99" });
    ok(`lookup_order: ${out}`);
  }
}

console.log(`\n${BOLD}── Session summary ──${RESET}`);
console.log(guard.summary());
