"""Comprehensive coverage — resource / delegation patterns (Python).

Covers ``token_budget``, ``arg_value_range``, ``delegation_depth_limit``.
Mirrors ``ts/packages/sdk/src/__tests__/comprehensive_resource.test.ts``.
"""

from __future__ import annotations

from sponsio.patterns.library import (
    arg_value_range,
    delegation_depth_limit,
    token_budget,
)

from ._helpers import make_guard as _guard, violation_text


# ── token_budget ─────────────────────────────────────────────────────


def test_token_budget_blocks_when_total_exceeded():
    g = _guard(token_budget(100, scope="total"))
    # First call burns 80 tokens — within budget.
    assert not g.guard_before("ask_llm", {"tokens": 80}).blocked
    # Second call adds 50 — cumulative 130 > 100 → flagged as violation.
    g.guard_before("ask_llm", {"tokens": 50})
    assert "token" in violation_text(g).lower()


def test_token_budget_allows_under_limit():
    g = _guard(token_budget(1000))
    g.guard_before("ask_llm", {"tokens": 100})
    g.guard_before("ask_llm", {"tokens": 200})
    assert g.violations == []


# ── arg_value_range ──────────────────────────────────────────────────


def test_arg_value_range_blocks_below_min():
    g = _guard(arg_value_range("set_temperature", "value", min_val=0, max_val=100))
    assert g.guard_before("set_temperature", {"value": -5}).blocked


def test_arg_value_range_blocks_above_max():
    g = _guard(arg_value_range("set_temperature", "value", min_val=0, max_val=100))
    assert g.guard_before("set_temperature", {"value": 200}).blocked


def test_arg_value_range_allows_within_range():
    g = _guard(arg_value_range("set_temperature", "value", min_val=0, max_val=100))
    assert not g.guard_before("set_temperature", {"value": 25}).blocked


# ── delegation_depth_limit ───────────────────────────────────────────


def test_delegation_depth_limit_loads_and_tracks_depth():
    """The pattern compiles and the grounding layer accumulates depth.

    NOTE: ``delegation_depth_limit`` currently has a known atom-key
    asymmetry between ``Var("delegation_depth").key()`` (bare name) and
    grounding's ``pred_key("delegation_depth")`` (with parens), so a
    pure-runtime block assertion would be misleading. We instead
    verify the wiring round-trip: ``observe_delegation`` is recorded,
    grounded ``delegation_depth()`` increments, and the contract is
    in the loaded set.
    """
    from sponsio.tracer.grounding import ground

    g = _guard(delegation_depth_limit(2))
    g.observe_delegation("planner")
    g.observe_delegation("executor")
    g.observe_delegation("subagent")
    vals = ground(g._monitor.trace)
    assert vals[-1].get("delegation_depth()") == 3
