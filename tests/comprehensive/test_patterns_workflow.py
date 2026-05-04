"""Comprehensive coverage — workflow hygiene patterns (Python).

Covers ``dry_run_before_commit``, ``backup_before_destructive``,
``audit_after``, ``approval_freshness``, ``sanitized_before_sink``,
``duplicate_call_limit``. Mirrors
``ts/packages/sdk/src/__tests__/comprehensive_workflow.test.ts``.
"""

from __future__ import annotations

from sponsio.patterns.library import (
    approval_freshness,
    audit_after,
    backup_before_destructive,
    dry_run_before_commit,
    duplicate_call_limit,
    sanitized_before_sink,
)

from ._helpers import make_guard as _guard


# ── dry_run_before_commit ────────────────────────────────────────────


def test_dry_run_before_commit_blocks_without_dry_run():
    g = _guard(dry_run_before_commit("plan", "apply"))
    assert g.guard_before("apply", {}).blocked


def test_dry_run_before_commit_allows_after_plan():
    g = _guard(dry_run_before_commit("plan", "apply"))
    g.guard_before("plan", {})
    assert not g.guard_before("apply", {}).blocked


# ── backup_before_destructive ────────────────────────────────────────


def test_backup_before_destructive_blocks_destructive_first():
    g = _guard(backup_before_destructive("snapshot", "drop_table"))
    assert g.guard_before("drop_table", {}).blocked


def test_backup_before_destructive_allows_after_snapshot():
    g = _guard(backup_before_destructive("snapshot", "drop_table"))
    g.guard_before("snapshot", {})
    assert not g.guard_before("drop_table", {}).blocked


# ── audit_after ──────────────────────────────────────────────────────


def test_audit_after_session_satisfied_when_audit_runs():
    g = _guard(audit_after("transfer_funds", "audit_log"))
    g.guard_before("transfer_funds", {})
    g.guard_before("audit_log", {})
    pending = g.finish_session()
    assert pending == []


def test_audit_after_violated_when_audit_missing():
    # Liveness — ``transfer_funds`` fired but the obligated audit
    # never came. Surface as a pending verdict at session end.
    g = _guard(audit_after("transfer_funds", "audit_log"))
    g.guard_before("transfer_funds", {})
    pending = g.finish_session()
    assert any("audit_log" in str(v) for v in pending)


# ── approval_freshness ───────────────────────────────────────────────


def test_approval_freshness_blocks_action_without_approval():
    g = _guard(approval_freshness("approve", "deploy", 1))
    assert g.guard_before("deploy", {}).blocked


def test_approval_freshness_allows_within_window():
    g = _guard(approval_freshness("approve", "deploy", 2))
    g.guard_before("approve", {})
    assert not g.guard_before("deploy", {}).blocked


# ── sanitized_before_sink ────────────────────────────────────────────


def test_sanitized_before_sink_blocks_when_sanitizer_skipped():
    g = _guard(sanitized_before_sink("web_fetch", "sanitize", "send_email"))
    g.guard_before("web_fetch", {})
    assert g.guard_before("send_email", {}).blocked


def test_sanitized_before_sink_allows_after_sanitize():
    g = _guard(sanitized_before_sink("web_fetch", "sanitize", "send_email"))
    g.guard_before("web_fetch", {})
    g.guard_before("sanitize", {})
    assert not g.guard_before("send_email", {}).blocked


# ── duplicate_call_limit ─────────────────────────────────────────────


def test_duplicate_call_limit_blocks_after_threshold():
    g = _guard(duplicate_call_limit("search", "invoice-42", 1))
    assert not g.guard_before("search", {"query": "invoice-42"}).blocked
    # Second matching call exceeds the budget.
    assert g.guard_before("search", {"query": "invoice-42"}).blocked


def test_duplicate_call_limit_allows_different_args():
    g = _guard(duplicate_call_limit("search", "invoice-42", 1))
    g.guard_before("search", {"query": "invoice-42"})
    # Different args don't match the bound pattern, so they're free.
    assert not g.guard_before("search", {"query": "report-99"}).blocked
