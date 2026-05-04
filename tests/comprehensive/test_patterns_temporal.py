"""Comprehensive coverage — core temporal patterns (Python).

Each pattern in ``sponsio.patterns.library`` that lives in the
"core temporal" group gets at least one happy path + one violation.
Tests use the public ``sponsio.Sponsio`` API end-to-end so they
also exercise the integrations.base + monitor wiring (not just the
LTL evaluator). Mirrors ``ts/packages/sdk/src/__tests__/comprehensive_temporal.test.ts``.
"""

from __future__ import annotations

from sponsio.patterns.library import (
    always_followed_by,
    bounded_retry,
    cooldown,
    deadline,
    idempotent,
    loop_detection,
    must_confirm,
    must_precede,
    mutual_exclusion,
    no_reversal,
    rate_limit,
    requires_permission,
    segregation_of_duty,
)

from ._helpers import make_guard as _guard
from ._helpers import violation_text  # used by deadline-violation assertion


# ── must_precede ─────────────────────────────────────────────────────


def test_must_precede_blocks_when_precondition_missing():
    g = _guard(must_precede("check_policy", "issue_refund"))
    assert g.guard_before("issue_refund", {"id": 1}).blocked


def test_must_precede_allows_after_precondition():
    g = _guard(must_precede("check_policy", "issue_refund"))
    g.guard_before("check_policy", {})
    assert not g.guard_before("issue_refund", {}).blocked


# ── always_followed_by ───────────────────────────────────────────────


def test_always_followed_by_passes_when_response_runs():
    g = _guard(always_followed_by("send_email", "log_audit"))
    g.guard_before("send_email", {})
    assert not g.guard_before("log_audit", {}).blocked


# ── no_reversal ──────────────────────────────────────────────────────


def test_no_reversal_blocks_contradicting_action():
    g = _guard(no_reversal("approve_refund", "deny_refund"))
    g.guard_before("approve_refund", {})
    assert g.guard_before("deny_refund", {}).blocked


def test_no_reversal_allows_when_no_commitment():
    g = _guard(no_reversal("approve_refund", "deny_refund"))
    assert not g.guard_before("deny_refund", {}).blocked


# ── requires_permission ──────────────────────────────────────────────


def test_requires_permission_blocks_without_perm():
    g = _guard(requires_permission("delete_account", "admin"))
    assert g.guard_before("delete_account", {}).blocked


# ── mutual_exclusion ─────────────────────────────────────────────────


def test_mutual_exclusion_blocks_second_choice():
    g = _guard(mutual_exclusion("approve", "reject"))
    g.guard_before("approve", {})
    assert g.guard_before("reject", {}).blocked


def test_mutual_exclusion_allows_repeating_same_side():
    g = _guard(mutual_exclusion("approve", "reject"))
    g.guard_before("approve", {"id": 1})
    assert not g.guard_before("approve", {"id": 2}).blocked


# ── rate_limit ───────────────────────────────────────────────────────


def test_rate_limit_blocks_after_threshold():
    g = _guard(rate_limit("send_email", 2))
    assert not g.guard_before("send_email", {}).blocked
    assert not g.guard_before("send_email", {}).blocked
    assert g.guard_before("send_email", {}).blocked


# ── idempotent ───────────────────────────────────────────────────────


def test_idempotent_allows_first_blocks_second():
    g = _guard(idempotent("provision_account"))
    assert not g.guard_before("provision_account", {}).blocked
    assert g.guard_before("provision_account", {}).blocked


# ── deadline ─────────────────────────────────────────────────────────


def test_deadline_satisfied_when_action_within_window():
    g = _guard(deadline("auth", "transfer", 3))
    g.guard_before("auth", {})
    g.guard_before("transfer", {})
    # ``deadline`` is a liveness pattern — checked at session end.
    pending = g.finish_session()
    assert pending == []


def test_deadline_violated_when_action_never_runs():
    g = _guard(deadline("auth", "transfer", 1))
    g.guard_before("auth", {})
    # Step out of the deadline window without calling the obligated action —
    # the verifier flags the constraint at this step.
    g.guard_before("noise", {})
    assert "transfer" in violation_text(g)


# ── must_confirm ─────────────────────────────────────────────────────


def test_must_confirm_blocks_without_confirmation():
    g = _guard(must_confirm("delete"))
    assert g.guard_before("delete", {}).blocked


def test_must_confirm_allows_after_confirmation():
    g = _guard(must_confirm("delete"))
    g.guard_before("confirm_delete", {})
    assert not g.guard_before("delete", {}).blocked


# ── cooldown ─────────────────────────────────────────────────────────


def test_cooldown_blocks_repeat_within_window():
    g = _guard(cooldown("page_oncall", 2))
    g.guard_before("page_oncall", {})
    # Next call in the cooldown window is the violation point.
    assert g.guard_before("page_oncall", {}).blocked


# ── segregation_of_duty ──────────────────────────────────────────────


def test_segregation_of_duty_blocks_same_session_swap():
    g = _guard(segregation_of_duty("submit", "approve"))
    g.guard_before("submit", {})
    assert g.guard_before("approve", {}).blocked


# ── bounded_retry ────────────────────────────────────────────────────


def test_bounded_retry_blocks_after_max():
    g = _guard(bounded_retry("retry_payment", 2))
    assert not g.guard_before("retry_payment", {}).blocked
    assert not g.guard_before("retry_payment", {}).blocked
    assert g.guard_before("retry_payment", {}).blocked


# ── loop_detection ───────────────────────────────────────────────────


def test_loop_detection_blocks_when_consecutive_runs_exceed():
    g = _guard(loop_detection("poll", 3))
    for _ in range(3):
        assert not g.guard_before("poll", {}).blocked
    assert g.guard_before("poll", {}).blocked


def test_loop_detection_resets_on_different_tool():
    g = _guard(loop_detection("poll", 2))
    g.guard_before("poll", {})
    g.guard_before("poll", {})
    g.guard_before("done", {})
    # Counter reset — another two polls allowed.
    assert not g.guard_before("poll", {}).blocked
    assert not g.guard_before("poll", {}).blocked
