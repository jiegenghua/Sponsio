"""Comprehensive coverage — argument patterns (Python).

Covers ``arg_blacklist``, ``arg_allowlist``, ``scope_limit``,
``arg_length_limit``, ``data_intact``. Mirrors
``ts/packages/sdk/src/__tests__/comprehensive_args.test.ts``.
"""

from __future__ import annotations

from sponsio.patterns.library import (
    arg_allowlist,
    arg_blacklist,
    arg_length_limit,
    data_intact,
    scope_limit,
)

from ._helpers import make_guard as _guard


# ── arg_blacklist ────────────────────────────────────────────────────


def test_arg_blacklist_blocks_matching_arg():
    g = _guard(arg_blacklist("execute_sql", "query", [r"DROP\s+TABLE"]))
    assert g.guard_before("execute_sql", {"query": "DROP TABLE users"}).blocked


def test_arg_blacklist_allows_clean_arg():
    g = _guard(arg_blacklist("execute_sql", "query", [r"DROP\s+TABLE"]))
    assert not g.guard_before("execute_sql", {"query": "SELECT * FROM users"}).blocked


# ── arg_allowlist ────────────────────────────────────────────────────


def test_arg_allowlist_blocks_outside_allowed_set():
    g = _guard(arg_allowlist("post_message", "channel", [r"^#prod-", r"^#ops-"]))
    assert g.guard_before("post_message", {"channel": "#random"}).blocked


def test_arg_allowlist_allows_matching_arg():
    g = _guard(arg_allowlist("post_message", "channel", [r"^#prod-", r"^#ops-"]))
    assert not g.guard_before("post_message", {"channel": "#prod-alerts"}).blocked


# ── scope_limit ──────────────────────────────────────────────────────


def test_scope_limit_blocks_outside_path():
    g = _guard(scope_limit("write_file", ["/tmp/", "/var/log/"]))
    assert g.guard_before("write_file", {"path": "/etc/passwd"}).blocked


def test_scope_limit_allows_inside_path():
    g = _guard(scope_limit("write_file", ["/tmp/", "/var/log/"]))
    assert not g.guard_before("write_file", {"path": "/tmp/output.txt"}).blocked


# ── arg_length_limit ─────────────────────────────────────────────────


def test_arg_length_limit_blocks_when_exceeded():
    g = _guard(arg_length_limit("post_message", "body", 50))
    assert g.guard_before("post_message", {"body": "x" * 200}).blocked


def test_arg_length_limit_allows_within_budget():
    g = _guard(arg_length_limit("post_message", "body", 50))
    assert not g.guard_before("post_message", {"body": "short"}).blocked


# ── data_intact ──────────────────────────────────────────────────────


def test_data_intact_blocks_when_using_synthetic_data():
    # ``data_intact`` is a bash-bound pattern: it requires that any
    # bash invocation containing the bound tool name uses only paths
    # under the original_paths whitelist. A bash call referencing
    # ``forge`` against a path *outside* the whitelist must block.
    g = _guard(data_intact("forge", ["/data/"]))
    assert g.guard_before("bash", {"command": "forge --in /tmp/synthetic.csv"}).blocked


def test_data_intact_allows_paths_inside_original():
    g = _guard(data_intact("forge", ["/data/"]))
    assert not g.guard_before("bash", {"command": "forge --in /data/raw.csv"}).blocked
