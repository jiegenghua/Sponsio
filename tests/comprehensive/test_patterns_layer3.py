"""Comprehensive coverage — Layer-3 patterns (Python).

Covers ``max_length``, ``no_pii``, ``no_keywords``, ``ctx_required``,
``ctx_matches_required``, ``time_since``, ``approval_active``,
``never_together``. Mirrors
``ts/packages/sdk/src/__tests__/comprehensive_layer3.test.ts``.
"""

from __future__ import annotations

import warnings

from sponsio.patterns.library import (
    approval_active,
    ctx_matches_required,
    ctx_required,
    max_length,
    never_together,
    no_keywords,
    no_pii,
    time_since,
)

from ._helpers import make_guard as _guard


# ── max_length ───────────────────────────────────────────────────────
# ``observe_llm_call`` returns its violations directly via
# ``CheckResult`` (parallel to ``guard_after``); they are not folded
# into ``guard.violations`` (which only collects ``guard_before``
# decisions). We assert against the returned result.


def test_max_length_words_blocks_when_exceeded():
    g = _guard(max_length(max_words=5))
    res = g.observe_llm_call(
        response="this response definitely runs longer than five words total"
    )
    assert not res.allowed
    assert any("max_length" in (v.rule_id or "") for v in res.det_violations)


def test_max_length_words_allows_within_budget():
    g = _guard(max_length(max_words=10))
    res = g.observe_llm_call(response="short reply ok")
    assert res.allowed


def test_max_length_chars_blocks_when_exceeded():
    g = _guard(max_length(max_chars=20))
    res = g.observe_llm_call(response="this is way too long for the budget")
    assert not res.allowed


# ── no_pii ───────────────────────────────────────────────────────────


def test_no_pii_blocks_email():
    g = _guard(no_pii(fields=["email"]))
    res = g.observe_llm_call(response="contact me at alice@example.com")
    assert not res.allowed


def test_no_pii_blocks_ssn():
    g = _guard(no_pii(fields=["ssn"]))
    res = g.observe_llm_call(response="my ssn is 123-45-6789")
    assert not res.allowed


def test_no_pii_allows_clean_response():
    g = _guard(no_pii())
    res = g.observe_llm_call(response="hello world, no PII here")
    assert res.allowed


# ── no_keywords ──────────────────────────────────────────────────────


def test_no_keywords_blocks_match():
    g = _guard(no_keywords(["password", "secret"]))
    res = g.observe_llm_call(response="the password is hunter2")
    assert not res.allowed


def test_no_keywords_case_insensitive():
    g = _guard(no_keywords(["secret"]))
    res = g.observe_llm_call(response="here is a SECRET")
    assert not res.allowed


def test_no_keywords_allows_non_match():
    g = _guard(no_keywords(["password"]))
    res = g.observe_llm_call(response="no credentials disclosed")
    assert res.allowed


# ── ctx_required ─────────────────────────────────────────────────────


def test_ctx_required_blocks_without_ctx():
    g = _guard(ctx_required("wire_transfer", "caller_id", ["alice", "bob"]))
    assert g.guard_before("wire_transfer", {"amount": 1}).blocked


def test_ctx_required_allows_with_matching_ctx():
    g = _guard(ctx_required("wire_transfer", "caller_id", ["alice", "bob"]))
    g.observe_context({"caller_id": "alice"})
    assert not g.guard_before("wire_transfer", {"amount": 1}).blocked


def test_ctx_required_blocks_outside_allowlist():
    g = _guard(ctx_required("wire_transfer", "caller_id", ["alice"]))
    g.observe_context({"caller_id": "eve"})
    assert g.guard_before("wire_transfer", {}).blocked


# ── ctx_matches_required ─────────────────────────────────────────────


def test_ctx_matches_required_passes_on_match():
    g = _guard(ctx_matches_required("publish", "msg_verified", r"^true$"))
    g.observe_context({"msg_verified": "true"})
    assert not g.guard_before("publish", {}).blocked


def test_ctx_matches_required_blocks_on_mismatch():
    g = _guard(ctx_matches_required("publish", "msg_verified", r"^true$"))
    g.observe_context({"msg_verified": "false"})
    assert g.guard_before("publish", {}).blocked


# ── time_since ───────────────────────────────────────────────────────


def test_time_since_within_window_passes():
    g = _guard(time_since("ctx(approval, granted)", 5))
    g.observe_context({"approval": "granted"})
    assert not g.guard_before("act", {}).blocked


def test_time_since_blocks_when_predicate_never_fired():
    g = _guard(time_since("ctx(approval, granted)", 5))
    assert g.guard_before("act", {}).blocked


# ── approval_active ──────────────────────────────────────────────────


def test_approval_active_passes_with_fresh_approval():
    g = _guard(approval_active("issue_refund", "senior_eng", 100))
    g.observe_approval("senior_eng", "allow")
    assert not g.guard_before("issue_refund", {"amount": 100}).blocked


def test_approval_active_blocks_without_approval():
    g = _guard(approval_active("issue_refund", "senior_eng", 100))
    assert g.guard_before("issue_refund", {}).blocked


def test_approval_active_blocks_wrong_role():
    g = _guard(approval_active("issue_refund", "senior_eng", 100))
    g.observe_approval("junior_eng", "allow")
    assert g.guard_before("issue_refund", {}).blocked


def test_approval_active_blocks_when_decision_is_deny():
    g = _guard(approval_active("issue_refund", "senior_eng", 100))
    g.observe_approval("senior_eng", "deny")
    assert g.guard_before("issue_refund", {}).blocked


# ── never_together (deprecated alias of mutual_exclusion) ────────────


def test_never_together_blocks_second_after_first():
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", DeprecationWarning)
        contract = never_together("approve", "reject")
    g = _guard(contract)
    g.guard_before("approve", {})
    assert g.guard_before("reject", {}).blocked
