"""Refund Agent (vanilla Python loop) — Layer-3 pattern showcase.

Scenario: a customer-support agent that issues refunds. The risk is
*not* SQL injection or rm-rf; it's social engineering ("manager said
it's fine"), leaking PII in the LLM's reply, runaway responses, and
high-value refunds slipping past human approval.

Patterns demonstrated:
  * ``approval_active``       — high-value refund needs a fresh
                                ``senior_eng`` approval (event-clock
                                bounded; ``time_since`` semantics)
  * ``ctx_required``          — refunds must run under an attested
                                ``caller_id`` from the auth layer
  * ``rate_limit``             — at most 5 refunds per session
  * ``no_pii``                 — LLM reply must not leak email / SSN
  * ``max_length``             — LLM reply ≤ 200 words (cost / abuse cap)

The session is driven without a framework — a plain Python loop
that simulates an agent making decisions. ``observe_context`` is
how the host stack pushes attested identity / approval into the
contract layer; ``observe_llm_call`` is how the post-LLM response
gets checked against ``no_pii`` / ``max_length``.

Usage::

    python examples/integrations/python/refund_agent_vanilla.py
"""

from __future__ import annotations

import os
import sys
import warnings

warnings.filterwarnings("ignore")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))

from shared import (  # noqa: E402
    USE_MOCK,
    banner,
    print_action,
    print_blocked,
    print_ok,
    print_section,
)
from sponsio.patterns.library import (  # noqa: E402
    approval_active,
    ctx_required,
    max_length,
    no_pii,
    rate_limit,
)


# ── Contracts ────────────────────────────────────────────────────────


def build_contracts() -> list[dict]:
    return [
        # External fact: every refund must run under an attested caller.
        # The auth layer pushes ``caller_id`` via ``observe_context`` —
        # if it's missing or not in the allowlist, the call fails closed.
        {
            "guarantee": ctx_required(
                "issue_refund", "caller_id", ["agent-1", "agent-2"]
            )
        },
        # High-value refund needs an active senior-eng approval ≤60s old.
        # Pairs with ``observe_approval`` on the integration side.
        {"guarantee": approval_active("issue_refund_high_value", "senior_eng", 60)},
        # Cap the volume of any one session.
        {"guarantee": rate_limit("issue_refund", 5)},
        # Response-content checks, evaluated on every ``observe_llm_call``.
        {"guarantee": no_pii(fields=["email", "ssn", "credit_card"])},
        {"guarantee": max_length(max_words=200)},
    ]


CONTRACT_DESCS = [
    "issue_refund requires attested caller_id ∈ {agent-1, agent-2}",
    "issue_refund_high_value requires fresh senior_eng approval (≤60s)",
    "issue_refund at most 5 times per session",
    "LLM reply must not contain email / SSN / credit-card",
    "LLM reply ≤ 200 words",
]


# ── Tool implementations (stubs) ─────────────────────────────────────


def lookup_order(order_id: str) -> str:
    return f"Order {order_id}: $48.99 paid 2025-04-01"


def issue_refund(order_id: str, amount: float) -> str:
    return f"Refunded ${amount:.2f} for {order_id}"


def issue_refund_high_value(order_id: str, amount: float) -> str:
    return f"Refunded ${amount:.2f} (HIGH VALUE) for {order_id}"


TOOLS = {
    "lookup_order": lookup_order,
    "issue_refund": issue_refund,
    "issue_refund_high_value": issue_refund_high_value,
}


# ── Mock trajectory ─────────────────────────────────────────────────


def run_mock() -> None:
    import sponsio

    guard = sponsio.Sponsio(
        agent_id="refund_bot",
        contracts=build_contracts(),
        mode="enforce",
        verbose=False,
        init_banner=False,
        auto_summary=False,
    )

    # The host stack hasn't attested the caller yet — first refund attempt
    # should fail closed (``ctx_required`` violation).
    print_section("Step 1 — refund without attested caller")
    print_action("issue_refund", "amount=$48.99 — no observe_context yet")
    r = guard.guard_before("issue_refund", {"order_id": "ORD-1", "amount": 48.99})
    if r.blocked:
        print_blocked(r.det_violations[0].message.split("—", 1)[-1].strip())

    # Auth layer attests the caller via ``observe_context`` — a real
    # integration would pull this from your SPIFFE / Okta / mTLS layer.
    print_section("Step 2 — attest caller, retry refund")
    guard.observe_context({"caller_id": "agent-1"})
    print_action("issue_refund", "amount=$48.99 — caller attested")
    r = guard.guard_before("issue_refund", {"order_id": "ORD-1", "amount": 48.99})
    if not r.blocked:
        TOOLS["issue_refund"](order_id="ORD-1", amount=48.99)
        guard.guard_after("issue_refund", "ok")
        print_ok("issue_refund ran")

    # High-value refund without approval — `approval_active` blocks.
    print_section("Step 3 — high-value refund without approval")
    print_action("issue_refund_high_value", "amount=$2,500 — no approval")
    r = guard.guard_before(
        "issue_refund_high_value", {"order_id": "ORD-2", "amount": 2500}
    )
    if r.blocked:
        print_blocked(r.det_violations[0].message.split("—", 1)[-1].strip())

    # HITL grants approval — `observe_approval` pushes the structured
    # ``approval.role`` / ``approval.decision`` ctx + advances the
    # ``time_since`` clock. Now the same call clears.
    print_section("Step 4 — HITL grants senior_eng approval, retry")
    guard.observe_approval(role="senior_eng", decision="allow")
    print_action("issue_refund_high_value", "amount=$2,500 — approval fresh")
    r = guard.guard_before(
        "issue_refund_high_value", {"order_id": "ORD-2", "amount": 2500}
    )
    if not r.blocked:
        TOOLS["issue_refund_high_value"](order_id="ORD-2", amount=2500)
        guard.guard_after("issue_refund_high_value", "ok")
        print_ok("issue_refund_high_value ran")

    # Drive ``no_pii`` / ``max_length`` via the LLM reply checks.
    print_section("Step 5 — LLM reply with PII (will be blocked)")
    bad_reply = "We've refunded $48.99. Confirmation went to alice@customer.com."
    res = guard.observe_llm_call(response=bad_reply)
    if not res.allowed:
        print_blocked(res.det_violations[0].message.split("—", 1)[-1].strip())

    print_section("Step 6 — LLM reply that's clean")
    good_reply = "We've refunded $48.99 to your card. The amount will appear in 3-5 business days."
    res = guard.observe_llm_call(response=good_reply)
    if res.allowed:
        print_ok("LLM reply allowed")

    # Hit the rate-limit ceiling to demonstrate it.
    print_section("Step 7 — exhaust the rate limit")
    for n in range(5):
        r = guard.guard_before(
            "issue_refund", {"order_id": f"ORD-bulk-{n}", "amount": 10}
        )
        if r.blocked:
            reason = r.det_violations[0].message.split("—", 1)[-1].strip()
            print_blocked(f"#{n + 2}: {reason}")
            break
        TOOLS["issue_refund"](order_id=f"ORD-bulk-{n}", amount=10)
        guard.guard_after("issue_refund", "ok")
        print_ok(f"issue_refund #{n + 2}")

    print_section("Summary")
    guard.print_summary()


# ── Real LLM mode ───────────────────────────────────────────────────


def run_real() -> None:
    print(
        "Real-LLM mode for this example deliberately not implemented — "
        "it's a vanilla loop demo. To wrap a real model:\n"
        "  1. Build the guard exactly as ``run_mock`` does.\n"
        "  2. Replace the canned trajectory with your model's decisions:\n"
        "     observe_context once per request, guard_before per tool call,\n"
        "     observe_llm_call after every model response.\n"
        "Set USE_MOCK=1 (or unset) to run the canned demo."
    )


def main() -> None:
    banner(
        title="Refund Agent — Layer-3 pattern showcase",
        integration="vanilla Python loop (no framework)",
        contracts=CONTRACT_DESCS,
    )
    run_mock() if USE_MOCK else run_real()


if __name__ == "__main__":
    main()
