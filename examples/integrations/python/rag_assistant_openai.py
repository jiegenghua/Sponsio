"""RAG Assistant (OpenAI tool-calling) — provenance + time-bound patterns.

Scenario: an enterprise RAG agent that answers customer queries by
calling ``retrieve_doc`` (looks up a snippet) and then ``answer_user``
(writes the reply). Two real failure modes:

  1. **Provenance laundering** — the retrieval layer can return a
     snippet from any source (canonical KB, user-uploaded doc, web
     fetch). If ``answer_user`` runs against an untrusted source
     without confirmation, you've shipped a hallucination or worse,
     a prompt-injection-driven action.
  2. **Stale approval** — for tier-3 customers, an "escalate to
     human" approval is valid only for a minute or two. After that,
     the agent has to re-prompt the human; old approvals don't
     count.

Both are runtime properties the host stack already knows but the
LLM doesn't — Sponsio's ``observe_context`` is the bridge.

Patterns demonstrated:
  * ``ctx_required``           — caller_id must be one of two
                                 attested agent IDs
  * ``ctx_matches_required``   — every ``answer_user`` must run with
                                 ``content_source`` matching
                                 ``^canonical:/v\\d+$`` (no web-fetched
                                 / user-uploaded provenance)
  * ``time_since``             — escalate_human approval valid for 60s
                                 (event-clock — replay-deterministic)
  * ``confirm_after_source``   — after ``web_fetch`` the agent must
                                 explicitly ``confirm_answer_user``
                                 before answering (assumption + guarantee
                                 pair returned as a tuple)

Usage::

    python examples/integrations/python/rag_assistant_openai.py
    USE_MOCK=0 OPENAI_API_KEY=… python examples/integrations/python/rag_assistant_openai.py
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
from sponsio.formulas.formula import Le, Var, Const, G, Implies, Atom  # noqa: E402
from sponsio.patterns.library import (  # noqa: E402
    DetFormula,
    confirm_after_source,
    ctx_matches_required,
    ctx_required,
)


# ── Contracts ────────────────────────────────────────────────────────


def build_contracts() -> list[dict]:
    # ``confirm_after_source`` returns ``(assumption, guarantee)`` —
    # wrap into the canonical dict form.
    confirm_a, confirm_g = confirm_after_source("web_fetch", "answer_user")

    # Time-bound: any ``answer_user`` that the host stack has tagged
    # tier="3" must run within 60s of a ``ctx(approval.role,
    # human_supervisor)`` predicate becoming true. ``time_since`` is
    # composed inside an Implies so the gate fires only when the tier
    # ctx is set — the typical "tier-3 customers need fresh human OK"
    # business rule.
    role_key = "ctx(approval.role, human_supervisor)"
    tier3_gate_formula = G(
        Implies(
            Atom("called", "answer_user"),
            Implies(
                Atom("ctx", "tier", "3"),
                Le(Var("time_since", role_key), Const(60)),
            ),
        )
    )
    tier3_gate = DetFormula(
        formula=tier3_gate_formula,
        desc="tier-3 answer_user requires human_supervisor approval ≤60s old",
        pattern_name="custom",
        liveness=False,
    )

    return [
        {
            "guarantee": ctx_required(
                "answer_user", "caller_id", ["rag-agent-1", "rag-agent-2"]
            )
        },
        {
            "guarantee": ctx_matches_required(
                "answer_user", "content_source", r"^canonical:/v\d+$"
            )
        },
        {"assumption": confirm_a, "guarantee": confirm_g},
        {"guarantee": tier3_gate},
    ]


CONTRACT_DESCS = [
    "answer_user requires attested caller_id ∈ {rag-agent-1, rag-agent-2}",
    "answer_user requires content_source matching ^canonical:/v\\d+$",
    "after web_fetch, answer_user requires confirm_answer_user first",
    "tier-3 answer_user requires human_supervisor approval ≤60 events old",
]


# ── Tool implementations (stubs) ─────────────────────────────────────


def retrieve_doc(query: str, source: str) -> str:
    return f"[stub] snippet from {source} for: {query}"


def web_fetch(url: str) -> str:
    return f"[stub] fetched {url} (untrusted)"


def answer_user(text: str) -> str:
    return f"[stub] sent reply: {text[:60]}…"


def confirm_answer_user() -> str:
    return "[stub] supervisor confirmed reply"


TOOLS = {
    "retrieve_doc": retrieve_doc,
    "web_fetch": web_fetch,
    "answer_user": answer_user,
    "confirm_answer_user": confirm_answer_user,
}


# ── Mock trajectory ─────────────────────────────────────────────────


def run_mock() -> None:
    import sponsio

    guard = sponsio.Sponsio(
        agent_id="rag_bot",
        contracts=build_contracts(),
        mode="enforce",
        verbose=False,
        init_banner=False,
        auto_summary=False,
    )

    # The host stack attests the caller (every example example uses
    # this same hook — it's the bridge from your auth layer to the
    # contract). Without this the first answer_user fails ctx_required.
    print_section("Step 1 — auth layer attests the agent")
    guard.observe_context({"caller_id": "rag-agent-1"})
    print_ok("ctx(caller_id, rag-agent-1) set")

    # Tier-1 customer; canonical retrieval; clean reply.
    print_section("Step 2 — tier-1 query, canonical KB, clean reply")
    guard.observe_context({"tier": "1", "content_source": "canonical:/v3"})
    guard.guard_before(
        "retrieve_doc", {"query": "return policy", "source": "canonical:/v3"}
    )
    print_action("answer_user", "tier-1, canonical source")
    r = guard.guard_before("answer_user", {"text": "Returns within 30 days are free."})
    if not r.blocked:
        print_ok("answer_user ran")
    else:
        print_blocked(r.det_violations[0].message)

    # Tier-1 customer; web-fetched snippet; reply BLOCKED on
    # ``ctx_matches_required`` (web is not canonical) AND
    # ``confirm_after_source`` (web_fetch ran without the confirm step).
    print_section("Step 3 — web fetch + try to answer (double violation)")
    guard.observe_context({"content_source": "web:/forum-thread"})
    guard.guard_before("web_fetch", {"url": "https://random-blog.example.com"})
    print_action("answer_user", "untrusted source, no confirm")
    r = guard.guard_before("answer_user", {"text": "I read on a forum that…"})
    if r.blocked:
        print_blocked(r.det_violations[0].message)

    # Confirm + retry — confirm_after_source clears, ctx_matches still
    # fails (content_source still web). So we also flip back to
    # canonical to demonstrate the AND of the two gates.
    print_section("Step 4 — confirm + flip source to canonical")
    guard.guard_before("confirm_answer_user", {})
    guard.observe_context({"content_source": "canonical:/v3"})
    print_action("answer_user", "confirmed + canonical source")
    r = guard.guard_before(
        "answer_user",
        {"text": "Per the canonical policy: returns within 30 days are free."},
    )
    if not r.blocked:
        print_ok("answer_user ran")
    else:
        print_blocked(r.det_violations[0].message)

    # Tier-3 customer — extra time-bound human approval rule kicks in.
    print_section("Step 5 — tier-3 query without human approval (blocked)")
    guard.observe_context({"tier": "3"})
    print_action("answer_user", "tier-3, no human_supervisor approval")
    r = guard.guard_before("answer_user", {"text": "Tier-3 reply"})
    if r.blocked:
        print_blocked(r.det_violations[0].message)

    print_section("Step 6 — supervisor approves, retry")
    guard.observe_approval(role="human_supervisor", decision="allow")
    print_action("answer_user", "tier-3 with fresh approval")
    r = guard.guard_before(
        "answer_user", {"text": "Tier-3 reply with supervisor approval"}
    )
    if not r.blocked:
        print_ok("answer_user ran")
    else:
        print_blocked(r.det_violations[0].message)

    print_section("Summary")
    guard.print_summary()


# ── Real LLM mode (OpenAI Chat Completions) ─────────────────────────


def run_real() -> None:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("ERROR: Set OPENAI_API_KEY for real LLM mode.")
        sys.exit(1)

    import openai
    import sponsio

    guard = sponsio.Sponsio(
        agent_id="rag_bot", contracts=build_contracts(), mode="enforce"
    )
    guard.observe_context(
        {"caller_id": "rag-agent-1", "tier": "1", "content_source": "canonical:/v3"}
    )

    client = openai.OpenAI(api_key=api_key)

    tools = [
        {
            "type": "function",
            "function": {
                "name": "retrieve_doc",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string"},
                        "source": {"type": "string"},
                    },
                    "required": ["query"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "answer_user",
                "parameters": {
                    "type": "object",
                    "properties": {"text": {"type": "string"}},
                    "required": ["text"],
                },
            },
        },
    ]

    messages = [
        {
            "role": "system",
            "content": "You are a customer-support assistant. Use retrieve_doc to look things up, then answer_user.",
        },
        {"role": "user", "content": "What's the return policy?"},
    ]

    for _ in range(5):
        resp = client.chat.completions.create(
            model="gpt-4o-mini", messages=messages, tools=tools
        )
        msg = resp.choices[0].message
        if not msg.tool_calls:
            print(f"\nAgent: {msg.content}")
            break
        for call in msg.tool_calls:
            name, args = call.function.name, eval(call.function.arguments)
            r = guard.guard_before(name, args)
            if r.blocked:
                content = f"BLOCKED: {r.det_violations[0].message}"
            else:
                content = TOOLS[name](**args)
                guard.guard_after(name, str(content))
            messages.append({"role": "assistant", "tool_calls": [call.model_dump()]})
            messages.append(
                {"role": "tool", "tool_call_id": call.id, "content": str(content)}
            )

    guard.print_summary()


def main() -> None:
    banner(
        title="RAG Assistant — provenance + time-bound patterns",
        integration="OpenAI tool-calling (mock canned) | OpenAI + GPT-4o-mini (real)",
        contracts=CONTRACT_DESCS,
    )
    run_mock() if USE_MOCK else run_real()


if __name__ == "__main__":
    main()
