# All Patterns + Atoms — TypeScript reference walkthrough

A **single self-contained file** that runs every Sponsio deterministic
pattern and grounding atom available in OSS through a tiny canned
trajectory. Useful as:

- a **reference doc** — every pattern shown end-to-end with the same
  helper format, so you can scan and find the one you want
- a **regression check** — 114 step-level assertions; CI catches it if
  any pattern's behavior shifts
- an **onboarding example** — pure `@sponsio/sdk` core engine, no
  framework, no API key, runs offline in ~50ms

## What it covers

| Group | Count | Examples |
|---|---|---|
| Core temporal | 15 | `must_precede`, `rate_limit`, `mutual_exclusion`, `loop_detection`, `deadline`, … |
| Argument | 5 | `arg_blacklist`, `arg_allowlist`, `scope_limit`, `arg_length_limit`, `data_intact` |
| OWASP / Agentic Security | 8 | `dangerous_bash_commands`, `dangerous_sql_verbs`, `tool_allowlist`, `untrusted_source_gate`, `confirm_after_source`, … |
| Workflow hygiene | 6 | `dry_run_before_commit`, `audit_after`, `approval_freshness`, `sanitized_before_sink`, … |
| Resource | 3 | `token_budget`, `arg_value_range`, `delegation_depth_limit` |
| Layer-3 (response / ctx / time) | 8 | `max_length`, `no_pii`, `no_keywords`, `ctx_required`, `ctx_matches_required`, `time_since`, `approval_active`, `never_together` |
| Atoms (raw) | 3 | `count_with`, `arg_has`, `segment` |

Every other atom is exercised through one of the patterns above.

## Run

```bash
cd ts && npm install
cd examples/all-patterns
npx tsx showcase.ts
```

The output is a colorized walkthrough — each section shows the pattern
name, a one-line description, and 2-4 step assertions (`✓` matched
expectation, `✗` did not).

## Pairs with

- [`examples/integrations/python/all_patterns_showcase.py`](../../../examples/integrations/python/all_patterns_showcase.py)
  — same walkthrough on the Python side (115 steps; minor delta
  because Python emits a few atoms — `perm`, `flow`, `contains` — that
  the TS grounding kernel doesn't yet auto-emit)
- The five framework integration examples — `bec-backoffice/`,
  `bec-backoffice-langgraph/`, `devops-vercel/`,
  `refund-langgraph/`, plus the Python `examples/integrations/python/`
  set — show how to drop these patterns into a real agent.

## Known gaps documented inside the file

- `delegation_depth_limit` — atom-key asymmetry between `Var.key()`
  (bare name) and `predKey()` (parens form); pattern compiles, runtime
  block doesn't fire. Faithfully ported from Python's same quirk.
- `requires_permission` / `destructive_action_gate` (perm branch),
  `no_data_leak` (flow / contains branch) — TS grounding doesn't yet
  auto-emit `perm` / `flow` / `contains` atoms; the Python-side
  showcase does, via `observe_data_*` and `Agent.permissions`.
