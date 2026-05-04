"""DevOps Agent (LangGraph) — argument + OWASP patterns showcase.

Scenario: an "infra cleanup" agent that runs shell commands, queries
the production database, and writes log files. Without contracts, a
prompt injection or model misstep can ``rm -rf /``, ``DROP TABLE``,
or scribble outside ``/tmp``. With Sponsio, every dangerous action is
gated *before* it reaches the tool.

Patterns demonstrated:
  * ``dangerous_bash_commands`` — bans ``rm -rf`` / ``chmod`` / ``> /app`` …
  * ``dangerous_sql_verbs``     — bans ``DROP``/``TRUNCATE``/``DELETE``/``ALTER``
  * ``scope_limit``             — ``write_file`` confined to ``/tmp/`` and ``/var/log/``
  * ``destructive_action_gate`` — ``shutdown_host`` requires a confirm step
  * ``tool_allowlist``          — only the four whitelisted tools may run
  * ``rate_limit``              — at most 5 ``bash`` invocations per session

Usage::

    python examples/integrations/python/devops_agent_langgraph.py
    USE_MOCK=0 GOOGLE_API_KEY=… python examples/integrations/python/devops_agent_langgraph.py
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
    dangerous_bash_commands,
    dangerous_sql_verbs,
    must_confirm,
    rate_limit,
    scope_limit,
    tool_allowlist,
)


# ── Contracts ────────────────────────────────────────────────────────


def build_contracts() -> list[dict]:
    """Wrap each DetFormula in the canonical ``{"guarantee": …}`` shape."""
    return [
        {"guarantee": dangerous_bash_commands()},
        {"guarantee": dangerous_sql_verbs(tool="run_sql")},
        {"guarantee": scope_limit("write_file", ["/tmp/", "/var/log/"])},
        # ``must_confirm`` is a simpler ``destructive_action_gate``
        # variant — no perm() requirement, just enforce that the
        # corresponding ``confirm_<tool>`` step runs first.
        {"guarantee": must_confirm("shutdown_host")},
        {
            "guarantee": tool_allowlist(
                [
                    "bash",
                    "run_sql",
                    "write_file",
                    "shutdown_host",
                    "confirm_shutdown_host",
                ]
            )
        },
        {"guarantee": rate_limit("bash", 5)},
    ]


CONTRACT_DESCS = [
    "ban dangerous bash commands (rm -rf, chmod, > /app, …)",
    "ban dangerous SQL verbs (DROP / TRUNCATE / DELETE / ALTER)",
    "write_file restricted to /tmp/ and /var/log/",
    "shutdown_host requires confirm_shutdown_host first",
    "tool whitelist (only the 5 expected tools)",
    "bash at most 5 times per session",
]


# ── Tool implementations (stubs) ─────────────────────────────────────


def bash(command: str) -> str:
    return f"$ {command}\n[stub] command executed"


def run_sql(query: str) -> str:
    return f"[stub] SQL: {query[:60]}…"


def write_file(path: str, content: str) -> str:
    return f"[stub] wrote {len(content)} bytes to {path}"


def shutdown_host(host: str) -> str:
    return f"[stub] {host} powering off"


def confirm_shutdown_host(host: str) -> str:
    return f"[stub] confirmed shutdown of {host}"


TOOLS = {
    "bash": bash,
    "run_sql": run_sql,
    "write_file": write_file,
    "shutdown_host": shutdown_host,
    "confirm_shutdown_host": confirm_shutdown_host,
}


# ── Mock trajectory ─────────────────────────────────────────────────
# Each step is a tool call the agent (a real LLM or the canned trace)
# would attempt. The contracts catch every dangerous one *before* it
# hits the underlying tool.


def mock_trajectory() -> list[tuple[str, dict, str]]:
    return [
        ("bash", {"command": "ls /var/log"}, "✓ benign listing"),
        ("run_sql", {"query": "SELECT count(*) FROM events"}, "✓ read-only query"),
        ("write_file", {"path": "/tmp/report.txt", "content": "ok"}, "✓ inside scope"),
        ("bash", {"command": "rm -rf /var/log/old"}, "✗ rm -rf banned"),
        ("run_sql", {"query": "DROP TABLE events"}, "✗ DROP banned"),
        ("write_file", {"path": "/etc/passwd", "content": "x"}, "✗ outside scope"),
        ("shutdown_host", {"host": "prod-db-1"}, "✗ destructive without confirm"),
        ("confirm_shutdown_host", {"host": "prod-db-1"}, "✓ confirmation step"),
        ("shutdown_host", {"host": "prod-db-1"}, "✓ now allowed after confirm"),
        ("delete_records", {"table": "events"}, "✗ tool not in allowlist"),
    ]


def run_mock() -> None:
    # Mock mode uses the vanilla ``sponsio.Sponsio`` entry point so the
    # demo runs without any framework dependency (no langchain, no
    # langgraph). The real-LLM path below uses ``sponsio.langgraph`` to
    # wrap a ``createReactAgent`` graph.
    import sponsio

    guard = sponsio.Sponsio(
        agent_id="devops_bot",
        contracts=build_contracts(),
        mode="enforce",
        verbose=False,
        init_banner=False,
        auto_summary=False,
    )

    print_section("Trajectory")
    for tool_name, args, narration in mock_trajectory():
        print_action(tool_name, narration)
        result = guard.guard_before(tool_name, args)
        if result.blocked:
            print_blocked(result.det_violations[0].message.split("—", 1)[-1].strip())
            continue
        if tool_name in TOOLS:
            TOOLS[tool_name](**args)
            guard.guard_after(tool_name, "ok")
            print_ok(f"{tool_name}: ran")
        else:
            print_ok(f"{tool_name}: (untracked tool, not invoked)")

    print_section("Summary")
    guard.print_summary()


# ── Real LLM mode (LangGraph + Gemini) ───────────────────────────────


def run_real() -> None:
    from langchain_core.tools import tool
    from langchain_google_genai import ChatGoogleGenerativeAI
    from langgraph.prebuilt import create_react_agent

    api_key = os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("ERROR: Set GOOGLE_API_KEY for real LLM mode.")
        sys.exit(1)

    @tool
    def bash_t(command: str) -> str:  # noqa: F811
        """Run a bash command on the host."""
        return bash(command)

    @tool
    def run_sql_t(query: str) -> str:  # noqa: F811
        """Run a SQL query against the prod database."""
        return run_sql(query)

    @tool
    def write_file_t(path: str, content: str) -> str:  # noqa: F811
        """Write content to a path on the host."""
        return write_file(path, content)

    @tool
    def shutdown_host_t(host: str) -> str:  # noqa: F811
        """Power off a host."""
        return shutdown_host(host)

    @tool
    def confirm_shutdown_host_t(host: str) -> str:  # noqa: F811
        """Confirm a pending host shutdown."""
        return confirm_shutdown_host(host)

    tools = [bash_t, run_sql_t, write_file_t, shutdown_host_t, confirm_shutdown_host_t]

    from sponsio.langgraph import Sponsio

    guard = Sponsio(agent_id="devops_bot", contracts=build_contracts())

    llm = ChatGoogleGenerativeAI(
        model="gemini-2.0-flash", api_key=api_key, temperature=0.0
    )
    agent = create_react_agent(llm, tools)

    user_msg = (
        "Old log table is bloated — please drop it and clean up /var/log. "
        "If anything's blocked just retry with the necessary prep step."
    )
    result = agent.invoke({"messages": [("user", user_msg)]})

    for msg in result["messages"]:
        cls = msg.__class__.__name__
        if cls == "ToolMessage":
            tag = "BLOCKED" if "BLOCKED" in str(msg.content) else "OK"
            print(f"  [{tag}] {msg.name}: {str(msg.content)[:100]}")

    print()
    guard.print_summary()


def main() -> None:
    banner(
        title="DevOps Agent — argument + OWASP pattern showcase",
        integration="LangGraph (mock canned) | LangGraph + Gemini (real)",
        contracts=CONTRACT_DESCS,
    )
    run_mock() if USE_MOCK else run_real()


if __name__ == "__main__":
    main()
