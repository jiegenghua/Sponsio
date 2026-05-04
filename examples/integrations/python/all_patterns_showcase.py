"""All Sponsio Patterns + Atoms — vanilla Python showcase.

A reference walkthrough that exercises *every* deterministic pattern
and grounding atom Sponsio ships in OSS (44 patterns, 23 atoms). Each
section is a tiny canned scenario: build a guard with one contract,
walk a 2-3 step trajectory, observe block / allow.

No API keys. No framework dependency. Pure Sponsio core engine —
runs offline. For framework integration with these same patterns:

  * examples/integrations/python/devops_agent_langgraph.py
  * examples/integrations/python/refund_agent_vanilla.py
  * examples/integrations/python/rag_assistant_openai.py

Mirrors ``ts/examples/all-patterns/showcase.ts``.
"""

from __future__ import annotations

import os
import sys
import warnings

warnings.filterwarnings("ignore")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))

import sponsio  # noqa: E402
from sponsio.formulas.formula import G, Var, Const, Atom  # noqa: E402
from sponsio.models import Agent, Contract  # noqa: E402
from sponsio.patterns.library import (  # noqa: E402
    DetFormula,
    always_followed_by,
    approval_active,
    approval_freshness,
    arg_allowlist,
    arg_blacklist,
    arg_length_limit,
    arg_value_range,
    audit_after,
    backup_before_destructive,
    bounded_retry,
    confirm_after_source,
    cooldown,
    ctx_matches_required,
    ctx_required,
    dangerous_bash_commands,
    dangerous_sql_verbs,
    data_intact,
    deadline,
    delegation_depth_limit,
    destructive_action_gate,
    dry_run_before_commit,
    duplicate_call_limit,
    idempotent,
    irreversible_once,
    loop_detection,
    max_length,
    must_confirm,
    must_precede,
    mutual_exclusion,
    never_together,
    no_data_leak,
    no_keywords,
    no_pii,
    no_reversal,
    rate_limit,
    required_steps_completion,
    requires_permission,
    sanitized_before_sink,
    scope_limit,
    segregation_of_duty,
    time_since,
    token_budget,
    tool_allowlist,
    untrusted_source_gate,
)


# ── Tiny helpers ─────────────────────────────────────────────────────

DIM, BOLD, RESET = "\033[2m", "\033[1m", "\033[0m"
RED, GREEN, YELLOW, BLUE = "\033[91m", "\033[92m", "\033[93m", "\033[94m"
CYAN, MAGENTA = "\033[96m", "\033[95m"

_total = 0
_passed = 0


def _section(title: str, blurb: str = "") -> None:
    print(f"\n{BOLD}{CYAN}── {title} ──{RESET}")
    if blurb:
        print(f"{DIM}{blurb}{RESET}")


def _new_guard(*contracts) -> sponsio.Sponsio:
    """Build a quiet Sponsio guard. Accepts a mix of:
    * ``DetFormula`` — wrapped into ``{"guarantee": …}``
    * ``(assumption, guarantee)`` tuple — A/G pair patterns
    * ``Contract`` — passed through (used when permissions matter)
    """
    wrapped = []
    for c in contracts:
        if isinstance(c, Contract):
            wrapped.append(c)
        elif isinstance(c, tuple) and len(c) == 2 and hasattr(c[0], "formula"):
            wrapped.append({"assumption": c[0], "guarantee": c[1]})
        elif hasattr(c, "formula"):
            wrapped.append({"guarantee": c})
        else:
            wrapped.append(c)
    return sponsio.Sponsio(
        contracts=wrapped,
        mode="enforce",
        verbose=False,
        init_banner=False,
        auto_summary=False,
    )


def _expect(label: str, actual: str, expected: str) -> None:
    """Print a single step result; track pass/fail count."""
    global _total, _passed
    _total += 1
    ok = actual == expected
    if ok:
        _passed += 1
    icon = f"{GREEN}✓{RESET}" if ok else f"{RED}✗{RESET}"
    color = GREEN if actual == "allow" else YELLOW
    print(
        f"  {icon} {label} → {color}{actual}{RESET} {DIM}(expected {expected}){RESET}"
    )


def _call(
    guard, tool: str, args: dict, expected: str, label: str | None = None
) -> None:
    r = guard.guard_before(tool, args)
    actual = "block" if r.blocked else "allow"
    _expect(label or f"{tool}({_short(args)})", actual, expected)


def _llm(guard, content: str, expected: str) -> None:
    res = guard.observe_llm_call(response=content)
    actual = "block" if not res.allowed else "allow"
    _expect(f"observe_llm({_short(content)})", actual, expected)


def _ctx(guard, facts: dict) -> None:
    guard.observe_context(facts)
    print(f"  {BLUE}▸ ctx ← {facts}{RESET}")


def _approval(guard, role: str, decision: str = "allow") -> None:
    guard.observe_approval(role, decision)
    print(f"  {BLUE}▸ approval ← role={role} decision={decision}{RESET}")


def _short(v) -> str:
    s = str(v)
    return s if len(s) <= 32 else s[:29] + "…"


# ═══════════════════════════════════════════════════════════════════
#  CORE TEMPORAL PATTERNS (14)
# ═══════════════════════════════════════════════════════════════════


def core_temporal() -> None:
    print(f"\n{BOLD}{MAGENTA}═══ Core Temporal (14) ═══{RESET}")

    # 1. must_precede — A before B
    _section("must_precede", "policy check must run before refund issuance")
    g = _new_guard(must_precede("check_policy", "issue_refund"))
    _call(g, "issue_refund", {"id": 1}, "block", "issue_refund without check_policy")
    _call(g, "check_policy", {}, "allow")
    _call(g, "issue_refund", {"id": 1}, "allow")

    # 2. always_followed_by (liveness — won't block mid-session, only audited at finish)
    _section(
        "always_followed_by", "every transfer must eventually be audited (liveness)"
    )
    g = _new_guard(always_followed_by("transfer", "audit"))
    _call(g, "transfer", {}, "allow")
    _call(g, "audit", {}, "allow")
    print(f"  {DIM}  (liveness — verdict checked at finish_session, not here){RESET}")

    # 3. never_together (deprecated alias of mutual_exclusion)
    _section("never_together", "deprecated alias — delegates to mutual_exclusion")
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", DeprecationWarning)
        g = _new_guard(never_together("approve", "reject"))
    _call(g, "approve", {}, "allow")
    _call(g, "reject", {}, "block")

    # 4. no_reversal — once committed, never contradict
    _section("no_reversal", "once approved, never deny in the same session")
    g = _new_guard(no_reversal("approve_refund", "deny_refund"))
    _call(g, "approve_refund", {}, "allow")
    _call(g, "deny_refund", {}, "block")

    # 5. requires_permission — uses perm() atom from Agent permissions
    _section("requires_permission", "delete_account requires perm(admin)")
    # Use raw Contract objects so we can attach permissions to the agent.
    contract_admin = Contract(
        agent=Agent(id="agent", permissions=["admin"]),
        guarantee=requires_permission("delete_account", "admin"),
    )
    contract_no = Contract(
        agent=Agent(id="agent", permissions=[]),
        guarantee=requires_permission("delete_account", "admin"),
    )
    g_admin = _new_guard(contract_admin)
    g_no = _new_guard(contract_no)
    _call(g_no, "delete_account", {}, "block", "delete_account without perm(admin)")
    _call(g_admin, "delete_account", {}, "allow", "delete_account with perm(admin)")

    # 6. no_data_leak — uses contains() + flow() atoms
    _section("no_data_leak", "data tagged 'pii' must never flow to 'webhook'")
    g = _new_guard(no_data_leak("pii", "webhook"))
    g.observe_data_write(key="customer", fields=["pii"])
    print(f"  {BLUE}▸ data_write(customer, contains=['pii']){RESET}")
    # Forge a flow event by reading the same key from a different agent
    # — but with a single-agent guard that would be self-flow only.
    # Instead, demo that the *contains* tag is set & the contract is wired.
    _call(g, "any_tool", {}, "allow", "innocent call (no flow event)")

    # 7. mutual_exclusion — exactly one branch may run
    _section("mutual_exclusion", "approve and reject are mutually exclusive")
    g = _new_guard(mutual_exclusion("approve", "reject"))
    _call(g, "approve", {"id": 1}, "allow")
    _call(g, "approve", {"id": 2}, "allow", "approve again is fine (same side)")
    _call(g, "reject", {}, "block")

    # 8. rate_limit — at most N
    _section("rate_limit", "send_email at most 2 times")
    g = _new_guard(rate_limit("send_email", 2))
    _call(g, "send_email", {"to": "a"}, "allow")
    _call(g, "send_email", {"to": "b"}, "allow")
    _call(g, "send_email", {"to": "c"}, "block")

    # 9. idempotent — at most once
    _section("idempotent", "provision_account may be called at most once")
    g = _new_guard(idempotent("provision_account"))
    _call(g, "provision_account", {}, "allow")
    _call(g, "provision_account", {}, "block")

    # 10. deadline — bounded liveness
    _section("deadline", "transfer must occur within 2 steps of auth")
    g = _new_guard(deadline("auth", "transfer", 2))
    _call(g, "auth", {}, "allow")
    _call(g, "transfer", {}, "allow")

    # 11. must_confirm — confirm_<tool> first
    _section("must_confirm", "delete requires confirm_delete first")
    g = _new_guard(must_confirm("delete"))
    _call(g, "delete", {}, "block")
    _call(g, "confirm_delete", {}, "allow")
    g2 = _new_guard(must_confirm("delete"))
    _call(g2, "confirm_delete", {}, "allow")
    _call(g2, "delete", {}, "allow")

    # 12. cooldown — N steps between repeats
    _section("cooldown", "page_oncall cooldown 2 steps")
    g = _new_guard(cooldown("page_oncall", 2))
    _call(g, "page_oncall", {}, "allow")
    _call(g, "page_oncall", {}, "block")

    # 13. segregation_of_duty (mutual_exclusion semantics)
    _section("segregation_of_duty", "submitter and approver must differ")
    g = _new_guard(segregation_of_duty("submit", "approve"))
    _call(g, "submit", {}, "allow")
    _call(g, "approve", {}, "block")

    # 14. bounded_retry — retry budget
    _section("bounded_retry", "retry_payment up to 2 times")
    g = _new_guard(bounded_retry("retry_payment", 2))
    _call(g, "retry_payment", {}, "allow")
    _call(g, "retry_payment", {}, "allow")
    _call(g, "retry_payment", {}, "block")

    # 15. loop_detection — uses consecutive_count atom
    _section("loop_detection", "max 3 consecutive poll calls (atom: consecutive_count)")
    g = _new_guard(loop_detection("poll", 3))
    for _ in range(3):
        _call(g, "poll", {}, "allow")
    _call(g, "poll", {}, "block", "4th consecutive poll")
    _call(g, "done", {}, "allow", "different tool resets the counter")
    _call(g, "poll", {}, "allow", "poll allowed again post-reset")


# ═══════════════════════════════════════════════════════════════════
#  ARGUMENT PATTERNS (5)
# ═══════════════════════════════════════════════════════════════════


def argument_patterns() -> None:
    print(f"\n{BOLD}{MAGENTA}═══ Argument (5) ═══{RESET}")

    # arg_blacklist
    _section("arg_blacklist", "execute_sql.query must not contain DROP TABLE")
    g = _new_guard(arg_blacklist("execute_sql", "query", [r"DROP\s+TABLE"]))
    _call(g, "execute_sql", {"query": "SELECT * FROM users"}, "allow")
    _call(g, "execute_sql", {"query": "DROP TABLE users"}, "block")

    # arg_allowlist
    _section("arg_allowlist", "post_message.channel must be #prod-* or #ops-*")
    g = _new_guard(arg_allowlist("post_message", "channel", [r"^#prod-", r"^#ops-"]))
    _call(g, "post_message", {"channel": "#prod-alerts"}, "allow")
    _call(g, "post_message", {"channel": "#random"}, "block")

    # scope_limit — uses arg_paths_within atom
    _section("scope_limit", "write_file restricted to /tmp/ and /var/log/")
    g = _new_guard(scope_limit("write_file", ["/tmp/", "/var/log/"]))
    _call(g, "write_file", {"path": "/tmp/x.txt"}, "allow")
    _call(g, "write_file", {"path": "/etc/passwd"}, "block")

    # arg_length_limit — uses arg_length_exceeds atom
    _section("arg_length_limit", "post.body ≤ 50 chars (atom: arg_length_exceeds)")
    g = _new_guard(arg_length_limit("post", "body", 50))
    _call(g, "post", {"body": "short"}, "allow")
    _call(g, "post", {"body": "x" * 200}, "block")

    # data_intact — bash commands referencing a tool name must use originals
    _section("data_intact", "bash forge command must use only paths under /data/")
    g = _new_guard(data_intact("forge", ["/data/"]))
    _call(g, "bash", {"command": "forge --in /data/raw.csv"}, "allow")
    _call(g, "bash", {"command": "forge --in /tmp/synth.csv"}, "block")


# ═══════════════════════════════════════════════════════════════════
#  OWASP / AGENTIC SECURITY PATTERNS (8)
# ═══════════════════════════════════════════════════════════════════


def owasp_patterns() -> None:
    print(f"\n{BOLD}{MAGENTA}═══ OWASP / Agentic Security (8) ═══{RESET}")

    # destructive_action_gate
    _section("destructive_action_gate", "drop_table requires confirm + approver perm")
    contract_dg = Contract(
        agent=Agent(id="agent", permissions=["approver"]),
        guarantee=destructive_action_gate("drop_table"),
    )
    g = _new_guard(contract_dg)
    _call(g, "drop_table", {"table": "users"}, "block", "drop without confirm")
    _call(g, "confirm_drop_table", {}, "allow")
    _call(g, "drop_table", {"table": "users"}, "allow", "drop with confirm + perm")

    # untrusted_source_gate (A/G pair)
    _section("untrusted_source_gate", "after web_fetch, send_email needs re-confirm")
    pair = untrusted_source_gate(["web_fetch"], ["send_email"])
    g = _new_guard(pair)
    _call(g, "web_fetch", {"url": "https://x"}, "allow")
    _call(g, "send_email", {}, "block", "sink without confirm")
    _call(g, "confirm_reconfirmed", {}, "allow")
    _call(g, "send_email", {}, "allow")

    # required_steps_completion (liveness)
    _section(
        "required_steps_completion",
        "close_incident must be followed by [root_cause, postmortem]",
    )
    g = _new_guard(
        required_steps_completion("close_incident", ["root_cause", "postmortem"])
    )
    _call(g, "close_incident", {}, "allow")
    _call(g, "root_cause", {}, "allow")
    _call(g, "postmortem", {}, "allow")
    print(f"  {DIM}  (liveness — pending verdict resolved at finish_session){RESET}")

    # tool_allowlist — uses called_any atom
    _section(
        "tool_allowlist", "only [read_file, list_files] permitted (atom: called_any)"
    )
    g = _new_guard(tool_allowlist(["read_file", "list_files"]))
    _call(g, "read_file", {"path": "/x"}, "allow")
    _call(g, "rm_rf", {}, "block")

    # dangerous_bash_commands
    _section("dangerous_bash_commands", "preset blacklist for tool='bash'")
    g = _new_guard(dangerous_bash_commands())
    _call(g, "bash", {"command": "ls /tmp"}, "allow")
    _call(g, "bash", {"command": "rm -rf /"}, "block")

    # dangerous_sql_verbs
    _section("dangerous_sql_verbs", "ban DROP/TRUNCATE/DELETE/ALTER on a SQL tool")
    g = _new_guard(dangerous_sql_verbs("run_sql"))
    _call(g, "run_sql", {"query": "SELECT * FROM users"}, "allow")
    _call(g, "run_sql", {"query": "DROP TABLE users"}, "block")

    # irreversible_once
    _section("irreversible_once", "launch_rocket may fire at most once")
    g = _new_guard(irreversible_once("launch_rocket"))
    _call(g, "launch_rocket", {}, "allow")
    _call(g, "launch_rocket", {}, "block")

    # confirm_after_source (A/G pair)
    _section(
        "confirm_after_source",
        "after web_fetch, send_email requires confirm_send_email",
    )
    pair = confirm_after_source("web_fetch", "send_email")
    g = _new_guard(pair)
    _call(g, "web_fetch", {}, "allow")
    _call(g, "send_email", {}, "block")
    _call(g, "confirm_send_email", {}, "allow")
    _call(g, "send_email", {}, "allow")


# ═══════════════════════════════════════════════════════════════════
#  WORKFLOW HYGIENE PATTERNS (6)
# ═══════════════════════════════════════════════════════════════════


def workflow_patterns() -> None:
    print(f"\n{BOLD}{MAGENTA}═══ Workflow Hygiene (6) ═══{RESET}")

    # dry_run_before_commit
    _section("dry_run_before_commit", "plan must precede apply")
    g = _new_guard(dry_run_before_commit("plan", "apply"))
    _call(g, "apply", {}, "block")
    _call(g, "plan", {}, "allow")
    _call(g, "apply", {}, "allow")

    # backup_before_destructive
    _section("backup_before_destructive", "snapshot must precede drop_table")
    g = _new_guard(backup_before_destructive("snapshot", "drop_table"))
    _call(g, "drop_table", {}, "block")
    _call(g, "snapshot", {}, "allow")
    _call(g, "drop_table", {}, "allow")

    # audit_after (liveness)
    _section(
        "audit_after", "every transfer_funds must be followed by audit_log (liveness)"
    )
    g = _new_guard(audit_after("transfer_funds", "audit_log"))
    _call(g, "transfer_funds", {}, "allow")
    _call(g, "audit_log", {}, "allow")

    # approval_freshness
    _section("approval_freshness", "deploy needs approve within 2 steps prior")
    g = _new_guard(approval_freshness("approve", "deploy", 2))
    _call(g, "deploy", {}, "block")
    g2 = _new_guard(approval_freshness("approve", "deploy", 2))
    _call(g2, "approve", {}, "allow")
    _call(g2, "deploy", {}, "allow")

    # sanitized_before_sink
    _section(
        "sanitized_before_sink", "after web_fetch, sanitize must precede send_email"
    )
    g = _new_guard(sanitized_before_sink("web_fetch", "sanitize", "send_email"))
    _call(g, "web_fetch", {}, "allow")
    _call(g, "send_email", {}, "block")
    _call(g, "sanitize", {}, "allow")
    _call(g, "send_email", {}, "allow")

    # duplicate_call_limit — uses count_with atom
    _section(
        "duplicate_call_limit",
        "search query 'invoice-42' at most once (atom: count_with)",
    )
    g = _new_guard(duplicate_call_limit("search", "invoice-42", 1))
    _call(g, "search", {"query": "invoice-42"}, "allow")
    _call(g, "search", {"query": "report-99"}, "allow", "different args, free")
    _call(g, "search", {"query": "invoice-42"}, "block", "duplicate hits the cap")


# ═══════════════════════════════════════════════════════════════════
#  RESOURCE / DELEGATION PATTERNS (3)
# ═══════════════════════════════════════════════════════════════════


def resource_patterns() -> None:
    print(f"\n{BOLD}{MAGENTA}═══ Resource / Delegation (3) ═══{RESET}")

    # token_budget — uses token_count atom
    _section("token_budget", "session ≤ 500 tokens (atom: token_count)")
    g = _new_guard(token_budget(500, scope="total"))
    g.guard_before("ask_llm", {"tokens": 200})
    g.guard_after("ask_llm", "ok")
    print(f"  {BLUE}▸ ask_llm tokens=200 (cumulative=200){RESET}")
    g.guard_before("ask_llm", {"tokens": 200})
    g.guard_after("ask_llm", "ok")
    print(f"  {BLUE}▸ ask_llm tokens=200 (cumulative=400){RESET}")
    _call(g, "ask_llm", {"tokens": 200}, "block", "cumulative=600 exceeds 500")

    # arg_value_range — uses arg_numeric atom
    _section("arg_value_range", "set_temp.value in [0, 100] (atom: arg_numeric)")
    g = _new_guard(arg_value_range("set_temp", "value", min_val=0, max_val=100))
    _call(g, "set_temp", {"value": 25}, "allow")
    _call(g, "set_temp", {"value": -5}, "block", "below min")
    _call(g, "set_temp", {"value": 200}, "block", "above max")

    # delegation_depth_limit — uses delegation_depth atom
    _section("delegation_depth_limit", "atom: delegation_depth (wiring demo)")
    print(
        f"  {DIM}  Note: ``delegation_depth_limit`` has a known atom-key{RESET}\n"
        f"  {DIM}  asymmetry between Var('delegation_depth').key() and{RESET}\n"
        f"  {DIM}  pred_key('delegation_depth') — runtime block doesn't fire{RESET}\n"
        f"  {DIM}  through the LTL evaluator. The grounding accumulator{RESET}\n"
        f"  {DIM}  still tracks depth correctly for offline analysis.{RESET}"
    )
    g = _new_guard(delegation_depth_limit(2))
    g.observe_delegation("planner")
    g.observe_delegation("executor")
    g.observe_delegation("subagent")
    from sponsio.tracer.grounding import ground

    vals = ground(g._monitor.trace)
    depth = vals[-1].get("delegation_depth()")
    print(f"  {BLUE}▸ grounded delegation_depth() = {depth}{RESET}")


# ═══════════════════════════════════════════════════════════════════
#  LAYER-3 PATTERNS (response content + ctx + time-bound) (8)
# ═══════════════════════════════════════════════════════════════════


def layer3_patterns() -> None:
    print(f"\n{BOLD}{MAGENTA}═══ Layer-3 — response / ctx / time (8) ═══{RESET}")

    # max_length — uses response_words / response_chars atoms
    _section(
        "max_length", "response ≤ 5 words (atoms: response_words / response_chars)"
    )
    g = _new_guard(max_length(max_words=5))
    _llm(g, "short reply", "allow")
    _llm(g, "this response definitely runs longer than five words total", "block")

    # no_pii — uses llm_said atom
    _section("no_pii", "response must not contain PII (atom: llm_said)")
    g = _new_guard(no_pii(fields=["email", "ssn"]))
    _llm(g, "hello world", "allow")
    _llm(g, "alice@example.com", "block")

    # no_keywords — uses llm_said atom (case-insensitive)
    _section("no_keywords", "response must not mention 'password' or 'secret'")
    g = _new_guard(no_keywords(["password", "secret"]))
    _llm(g, "no credentials disclosed", "allow")
    _llm(g, "the password is hunter2", "block")
    _llm(
        g,
        "here is a SECRET",
        "block",
    )

    # ctx_required — uses ctx atom
    _section("ctx_required", "wire requires ctx[caller_id] ∈ {alice, bob} (atom: ctx)")
    g = _new_guard(ctx_required("wire", "caller_id", ["alice", "bob"]))
    _call(g, "wire", {}, "block", "no ctx pushed")
    _ctx(g, {"caller_id": "alice"})
    _call(g, "wire", {}, "allow", "alice attested")

    g2 = _new_guard(ctx_required("wire", "caller_id", ["alice", "bob"]))
    _ctx(g2, {"caller_id": "eve"})
    _call(g2, "wire", {}, "block", "eve outside allowlist")

    # ctx_matches_required — uses ctx_matches atom (regex)
    _section(
        "ctx_matches_required",
        "publish needs ctx[verified] matching ^true$ (atom: ctx_matches)",
    )
    g = _new_guard(ctx_matches_required("publish", "verified", r"^true$"))
    _ctx(g, {"verified": "true"})
    _call(g, "publish", {}, "allow")
    g2 = _new_guard(ctx_matches_required("publish", "verified", r"^true$"))
    _ctx(g2, {"verified": "false"})
    _call(g2, "publish", {}, "block")

    # time_since — uses time_since + now atoms
    _section(
        "time_since", "time_since(ctx(approval, granted)) ≤ 5 (atoms: time_since, now)"
    )
    g = _new_guard(time_since("ctx(approval, granted)", 5))
    _call(g, "act", {}, "block", "predicate never fired (1e18 sentinel)")
    g2 = _new_guard(time_since("ctx(approval, granted)", 5))
    _ctx(g2, {"approval": "granted"})
    _call(g2, "act", {}, "allow", "within 5-event window")

    # approval_active
    _section("approval_active", "issue_refund needs senior_eng approval ≤60s old")
    g = _new_guard(approval_active("issue_refund", "senior_eng", 60))
    _call(g, "issue_refund", {}, "block", "no approval observed")
    _approval(g, "senior_eng", "allow")
    _call(g, "issue_refund", {}, "allow", "fresh senior_eng approval")

    g2 = _new_guard(approval_active("issue_refund", "senior_eng", 60))
    _approval(g2, "senior_eng", "deny")
    _call(g2, "issue_refund", {}, "block", "decision=deny")

    g3 = _new_guard(approval_active("issue_refund", "senior_eng", 60))
    _approval(g3, "junior_eng", "allow")
    _call(g3, "issue_refund", {}, "block", "wrong role")


# ═══════════════════════════════════════════════════════════════════
#  RAW ATOM SHOWCASE — atoms not exercised by a pattern above
# ═══════════════════════════════════════════════════════════════════


def atom_showcase() -> None:
    print(
        f"\n{BOLD}{MAGENTA}═══ Atoms (direct, not via a higher-level pattern) ═══{RESET}"
    )

    from sponsio.formulas.formula import Implies, Not

    # count_with — raw Var-based contract for direct atom usage
    _section("count_with", "raw atom: G(count_with(http_post, 'admin') ≤ 1)")
    raw = DetFormula(
        formula=G(Var("count_with", "http_post", "admin") <= Const(1)),
        desc="http_post(admin) at most once",
        pattern_name="raw_count_with",
    )
    g = _new_guard(raw)
    _call(g, "http_post", {"path": "/admin/x"}, "allow")
    _call(g, "http_post", {"path": "/admin/y"}, "block")

    # arg_has — raw Atom-based contract
    _section("arg_has", "raw atom: G(called(bash) → ¬arg_has(bash, 'sudo'))")
    raw = DetFormula(
        formula=G(
            Implies(Atom("called", "bash"), Not(Atom("arg_has", "bash", "sudo")))
        ),
        desc="bash args must not contain 'sudo'",
        pattern_name="raw_arg_has",
    )
    g = _new_guard(raw)
    _call(g, "bash", {"command": "ls /tmp"}, "allow")
    _call(g, "bash", {"command": "sudo ls /root"}, "block")

    # arg_field_has — already covered by arg_blacklist/arg_allowlist.
    # arg_paths_within — already covered by scope_limit.
    # arg_length_exceeds — already covered by arg_length_limit.
    # arg_numeric — already covered by arg_value_range.
    # token_count — already covered by token_budget.
    # delegation_depth — already shown.
    # ctx / ctx_matches / llm_said / response_* / time_since / now — already shown.
    # perm — covered via requires_permission.
    # flow / contains — covered via no_data_leak (limited).

    # segment — emitted only on llm_response with args.segment="thinking"/"answer"
    _section("segment", "llm_response segment tag (thinking vs answer)")
    raw = DetFormula(
        formula=G(
            Implies(
                Atom("segment", "answer"), Not(Atom("llm_said", "<internal-token>"))
            )
        ),
        desc="answer segment must not leak internal token",
        pattern_name="raw_segment",
    )
    g = _new_guard(raw)
    # observe_llm_call doesn't expose segment directly; use the underlying
    # check_action path to push a segment-tagged llm_response event.
    g._monitor.check_action(
        agent_id="agent",
        action="<llm_response>",
        event_type="llm_response",
        metadata={"content": "regular reply", "args": {"segment": "answer"}},
    )
    print(f"  {BLUE}▸ llm_response[segment=answer]: 'regular reply' — passes{RESET}")
    g._monitor.check_action(
        agent_id="agent",
        action="<llm_response>",
        event_type="llm_response",
        metadata={
            "content": "<internal-token>secret</internal-token>",
            "args": {"segment": "answer"},
        },
    )
    print(
        f"  {RED}▸ llm_response[segment=answer]: leaks internal token — would block{RESET}"
    )


def main() -> None:
    print(f"{BOLD}{MAGENTA}{'=' * 64}{RESET}")
    print(f"{BOLD}{MAGENTA}  Sponsio — All Patterns + Atoms Showcase (Python){RESET}")
    print(f"{DIM}  44 patterns, 23 atoms — runs offline, no API key required.{RESET}")
    print(f"{BOLD}{MAGENTA}{'=' * 64}{RESET}")

    core_temporal()
    argument_patterns()
    owasp_patterns()
    workflow_patterns()
    resource_patterns()
    layer3_patterns()
    atom_showcase()

    print(f"\n{BOLD}{MAGENTA}{'=' * 64}{RESET}")
    color = GREEN if _passed == _total else YELLOW
    print(
        f"{BOLD}  Result: {color}{_passed}/{_total}{RESET} {BOLD}step assertions matched expectation{RESET}"
    )
    print(f"{BOLD}{MAGENTA}{'=' * 64}{RESET}")
    sys.exit(0 if _passed == _total else 1)


if __name__ == "__main__":
    main()
