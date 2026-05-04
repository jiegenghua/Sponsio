/**
 * All Sponsio Patterns + Atoms — TypeScript showcase.
 *
 * Reference walkthrough that exercises every det pattern and grounding
 * atom available in OSS (44 patterns, 23 atoms). Each section spins up
 * a fresh ``Sponsio`` guard with one contract and walks a canned
 * trajectory; block / allow is asserted against the expected outcome.
 *
 * No API keys. No framework. Pure ``@sponsio/sdk`` core engine.
 *
 * For framework integration with these patterns, see:
 *   * ts/examples/devops-vercel/    (Vercel AI SDK)
 *   * ts/examples/refund-langgraph/ (LangGraph)
 *
 * Mirrors ``examples/integrations/python/all_patterns_showcase.py``.
 *
 * Run: ``npx tsx showcase.ts``
 */

import { Sponsio } from "@sponsio/sdk";
import {
  alwaysFollowedBy,
  approvalActive,
  approvalFreshness,
  argAllowlist,
  argBlacklist,
  argLengthLimit,
  argValueRange,
  auditAfter,
  backupBeforeDestructive,
  boundedRetry,
  confirmAfterSource,
  cooldown,
  ctxMatchesRequired,
  ctxRequired,
  dangerousBashCommands,
  dangerousSqlVerbs,
  dataIntact,
  deadline,
  delegationDepthLimit,
  destructiveActionGate,
  dryRunBeforeCommit,
  duplicateCallLimit,
  idempotent,
  irreversibleOnce,
  loopDetection,
  maxLength,
  mustConfirm,
  mustPrecede,
  mutualExclusion,
  neverTogether,
  noDataLeak,
  noKeywords,
  noPii,
  noReversal,
  rateLimit,
  requiredStepsCompletion,
  requiresPermission,
  sanitizedBeforeSink,
  scopeLimit,
  segregationOfDuty,
  timeSince,
  tokenBudget,
  toolAllowlist,
  untrustedSourceGate,
  // raw atoms / formula nodes for the atom showcase
  Atom,
  Var,
  Const,
  G,
  Implies,
  Not,
  Le,
  type DetFormula,
} from "@sponsio/sdk";

// ── ANSI helpers ────────────────────────────────────────────────────
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";
const RED = "\x1b[91m";
const GREEN = "\x1b[92m";
const YELLOW = "\x1b[93m";
const BLUE = "\x1b[94m";
const CYAN = "\x1b[96m";
const MAGENTA = "\x1b[95m";

let total = 0;
let passed = 0;

function section(title: string, blurb = ""): void {
  console.log(`\n${BOLD}${CYAN}── ${title} ──${RESET}`);
  if (blurb) console.log(`${DIM}${blurb}${RESET}`);
}

function newGuard(...contracts: DetFormula[]): Sponsio {
  return new Sponsio({
    contracts,
    mode: "enforce",
    sessionLog: false,
  });
}

function expectStep(label: string, actual: "block" | "allow", expected: "block" | "allow"): void {
  total++;
  const ok = actual === expected;
  if (ok) passed++;
  const icon = ok ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
  const color = actual === "allow" ? GREEN : YELLOW;
  console.log(`  ${icon} ${label} → ${color}${actual}${RESET} ${DIM}(expected ${expected})${RESET}`);
}

function callTool(
  guard: Sponsio,
  tool: string,
  args: Record<string, unknown>,
  expected: "block" | "allow",
  label?: string,
): void {
  const r = guard.guardBefore(tool, args);
  expectStep(label ?? `${tool}(${short(args)})`, r.blocked ? "block" : "allow", expected);
}

function llm(guard: Sponsio, content: string, expected: "block" | "allow"): void {
  const r = guard.observeResponse(content);
  expectStep(`observeResponse(${short(content)})`, r.blocked ? "block" : "allow", expected);
}

function ctx(guard: Sponsio, facts: Record<string, unknown>): void {
  guard.observeContext(facts);
  console.log(`  ${BLUE}▸ ctx ← ${JSON.stringify(facts)}${RESET}`);
}

function approval(guard: Sponsio, role: string, decision: "allow" | "deny" = "allow"): void {
  guard.observeApproval({ role, decision });
  console.log(`  ${BLUE}▸ approval ← role=${role} decision=${decision}${RESET}`);
}

function short(v: unknown): string {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length <= 32 ? s : `${s.slice(0, 29)}…`;
}

// ═══════════════════════════════════════════════════════════════════
//  CORE TEMPORAL (15 incl. loop_detection)
// ═══════════════════════════════════════════════════════════════════

function coreTemporal(): void {
  console.log(`\n${BOLD}${MAGENTA}═══ Core Temporal ═══${RESET}`);

  // must_precede
  section("must_precede", "policy check must run before refund issuance");
  {
    const g = newGuard(mustPrecede("check_policy", "issue_refund"));
    callTool(g, "issue_refund", { id: 1 }, "block", "issue_refund without check_policy");
    callTool(g, "check_policy", {}, "allow");
    callTool(g, "issue_refund", { id: 1 }, "allow");
  }

  // always_followed_by (liveness — skipped in incremental check)
  section("always_followed_by", "transfer must eventually be audited (liveness)");
  {
    const g = newGuard(alwaysFollowedBy("transfer", "audit"));
    callTool(g, "transfer", {}, "allow");
    callTool(g, "audit", {}, "allow");
    console.log(`  ${DIM}  (liveness — skipped in incremental block, checked at finishSession)${RESET}`);
  }

  // never_together (deprecated alias)
  section("never_together", "deprecated alias of mutual_exclusion");
  {
    const g = newGuard(neverTogether("approve", "reject"));
    callTool(g, "approve", {}, "allow");
    callTool(g, "reject", {}, "block");
  }

  // no_reversal
  section("no_reversal", "once approved, never deny in the same session");
  {
    const g = newGuard(noReversal("approve_refund", "deny_refund"));
    callTool(g, "approve_refund", {}, "allow");
    callTool(g, "deny_refund", {}, "block");
  }

  // requires_permission — perm() atom
  section("requires_permission", "delete_account requires perm(admin) — atom: perm");
  console.log(
    `  ${DIM}  perm() needs Agent.permissions wired through System.${RESET}\n` +
    `  ${DIM}  TS SDK does not expose System builders today — the contract${RESET}\n` +
    `  ${DIM}  loads, the atom predicate exists, but emit-side wiring is${RESET}\n` +
    `  ${DIM}  Python-only. Pattern compiles cleanly:${RESET}`,
  );
  {
    const g = newGuard(requiresPermission("delete_account", "admin"));
    // Without perm() emitted, the contract fails closed → block.
    callTool(g, "delete_account", {}, "block", "delete_account (no perm wiring)");
  }

  // no_data_leak
  section("no_data_leak", "data tagged 'pii' must not flow to 'webhook'");
  {
    const g = newGuard(noDataLeak("pii", "webhook"));
    // TS grounding doesn't emit ``contains`` / ``flow`` events from
    // tool calls, so the pattern is wired but won't fire here.
    callTool(g, "any_tool", {}, "allow", "no contains/flow events");
    console.log(`  ${DIM}  (contains/flow atoms are Python-side via observe_data_*)${RESET}`);
  }

  // mutual_exclusion
  section("mutual_exclusion", "approve and reject mutually exclusive");
  {
    const g = newGuard(mutualExclusion("approve", "reject"));
    callTool(g, "approve", { id: 1 }, "allow");
    callTool(g, "approve", { id: 2 }, "allow", "approve again is fine");
    callTool(g, "reject", {}, "block");
  }

  // rate_limit
  section("rate_limit", "send_email at most 2 times");
  {
    const g = newGuard(rateLimit("send_email", 2));
    callTool(g, "send_email", { to: "a" }, "allow");
    callTool(g, "send_email", { to: "b" }, "allow");
    callTool(g, "send_email", { to: "c" }, "block");
  }

  // idempotent
  section("idempotent", "provision_account at most once");
  {
    const g = newGuard(idempotent("provision_account"));
    callTool(g, "provision_account", {}, "allow");
    callTool(g, "provision_account", {}, "block");
  }

  // deadline
  section("deadline", "transfer within 2 steps of auth");
  {
    const g = newGuard(deadline("auth", "transfer", 2));
    callTool(g, "auth", {}, "allow");
    callTool(g, "transfer", {}, "allow");
  }

  // must_confirm
  section("must_confirm", "delete needs confirm_delete first");
  {
    const g = newGuard(mustConfirm("delete"));
    callTool(g, "delete", {}, "block");
    callTool(g, "confirm_delete", {}, "allow");
  }
  {
    const g = newGuard(mustConfirm("delete"));
    callTool(g, "confirm_delete", {}, "allow");
    callTool(g, "delete", {}, "allow");
  }

  // cooldown
  section("cooldown", "page_oncall cooldown 2 steps");
  {
    const g = newGuard(cooldown("page_oncall", 2));
    callTool(g, "page_oncall", {}, "allow");
    callTool(g, "page_oncall", {}, "block");
  }

  // segregation_of_duty
  section("segregation_of_duty", "submitter and approver differ");
  {
    const g = newGuard(segregationOfDuty("submit", "approve"));
    callTool(g, "submit", {}, "allow");
    callTool(g, "approve", {}, "block");
  }

  // bounded_retry
  section("bounded_retry", "retry_payment up to 2 times");
  {
    const g = newGuard(boundedRetry("retry_payment", 2));
    callTool(g, "retry_payment", {}, "allow");
    callTool(g, "retry_payment", {}, "allow");
    callTool(g, "retry_payment", {}, "block");
  }

  // loop_detection — atom: consecutive_count
  section("loop_detection", "max 3 consecutive poll calls (atom: consecutive_count)");
  {
    const g = newGuard(loopDetection("poll", 3));
    for (let i = 0; i < 3; i++) callTool(g, "poll", {}, "allow");
    callTool(g, "poll", {}, "block", "4th consecutive poll");
    callTool(g, "done", {}, "allow", "different tool resets counter");
    callTool(g, "poll", {}, "allow", "poll allowed again post-reset");
  }
}

// ═══════════════════════════════════════════════════════════════════
//  ARGUMENT PATTERNS (5)
// ═══════════════════════════════════════════════════════════════════

function argumentPatterns(): void {
  console.log(`\n${BOLD}${MAGENTA}═══ Argument ═══${RESET}`);

  section("arg_blacklist", "execute_sql.query must not contain DROP TABLE");
  {
    const g = newGuard(argBlacklist("execute_sql", "query", ["DROP\\s+TABLE"]));
    callTool(g, "execute_sql", { query: "SELECT * FROM users" }, "allow");
    callTool(g, "execute_sql", { query: "DROP TABLE users" }, "block");
  }

  section("arg_allowlist", "post_message.channel must be #prod-* or #ops-*");
  {
    const g = newGuard(argAllowlist("post_message", "channel", ["^#prod-", "^#ops-"]));
    callTool(g, "post_message", { channel: "#prod-alerts" }, "allow");
    callTool(g, "post_message", { channel: "#random" }, "block");
  }

  section("scope_limit", "write_file restricted to /tmp/, /var/log/ (atom: arg_paths_within)");
  {
    const g = newGuard(scopeLimit("write_file", ["/tmp/", "/var/log/"]));
    callTool(g, "write_file", { path: "/tmp/x.txt" }, "allow");
    callTool(g, "write_file", { path: "/etc/passwd" }, "block");
  }

  section("arg_length_limit", "post.body ≤ 50 chars (atom: arg_length_exceeds)");
  {
    const g = newGuard(argLengthLimit("post", "body", 50));
    callTool(g, "post", { body: "short" }, "allow");
    callTool(g, "post", { body: "x".repeat(200) }, "block");
  }

  section("data_intact", "bash forge command must use only paths under /data/");
  {
    const g = newGuard(dataIntact("forge", ["/data/"]));
    callTool(g, "bash", { command: "forge --in /data/raw.csv" }, "allow");
    callTool(g, "bash", { command: "forge --in /tmp/synth.csv" }, "block");
  }
}

// ═══════════════════════════════════════════════════════════════════
//  OWASP / AGENTIC SECURITY (8)
// ═══════════════════════════════════════════════════════════════════

function owaspPatterns(): void {
  console.log(`\n${BOLD}${MAGENTA}═══ OWASP / Agentic Security ═══${RESET}`);

  section("destructive_action_gate", "drop_table requires confirm_drop_table");
  {
    const g = newGuard(destructiveActionGate("drop_table"));
    callTool(g, "drop_table", { table: "users" }, "block");
    console.log(
      `  ${DIM}  destructive_action_gate also requires perm() — TS doesn't${RESET}\n` +
      `  ${DIM}  emit perm() today, so 'allow' branch is Python-only.${RESET}`,
    );
  }

  section("untrusted_source_gate", "after web_fetch, send_email needs confirm_send_email");
  // TS default confirm name is ``confirm_<sink>`` (Python uses
  // ``confirm_reconfirmed``); both produce the same A/G shape.
  {
    const pair = untrustedSourceGate("web_fetch", "send_email");
    const g = new Sponsio({
      contracts: [pair.assumption, pair.guarantee],
      mode: "enforce",
      sessionLog: false,
    });
    callTool(g, "web_fetch", {}, "allow");
    callTool(g, "send_email", {}, "block");
    callTool(g, "confirm_send_email", {}, "allow");
    callTool(g, "send_email", {}, "allow");
  }

  section("required_steps_completion", "close_incident must be followed by [root_cause, postmortem]");
  {
    const g = newGuard(requiredStepsCompletion("close_incident", ["root_cause", "postmortem"]));
    callTool(g, "close_incident", {}, "allow");
    callTool(g, "root_cause", {}, "allow");
    callTool(g, "postmortem", {}, "allow");
    console.log(`  ${DIM}  (liveness — pending obligation cleared on this trajectory)${RESET}`);
  }

  section("tool_allowlist", "only [read_file, list_files] permitted (atom: called_any)");
  {
    const g = newGuard(toolAllowlist(["read_file", "list_files"]));
    callTool(g, "read_file", { path: "/x" }, "allow");
    callTool(g, "rm_rf", {}, "block");
  }

  section("dangerous_bash_commands", "preset blacklist for tool='bash'");
  {
    const g = newGuard(dangerousBashCommands());
    callTool(g, "bash", { command: "ls /tmp" }, "allow");
    callTool(g, "bash", { command: "rm -rf /" }, "block");
  }

  section("dangerous_sql_verbs", "ban DROP / TRUNCATE / DELETE / ALTER (case-insensitive)");
  {
    const g = newGuard(dangerousSqlVerbs("run_sql"));
    callTool(g, "run_sql", { query: "SELECT * FROM users" }, "allow");
    callTool(g, "run_sql", { query: "DROP TABLE users" }, "block");
    callTool(g, "run_sql", { query: "drop table users" }, "block", "lowercase still blocked");
  }

  section("irreversible_once", "launch_rocket may fire at most once");
  {
    const g = newGuard(irreversibleOnce("launch_rocket"));
    callTool(g, "launch_rocket", {}, "allow");
    callTool(g, "launch_rocket", {}, "block");
  }

  section("confirm_after_source", "after web_fetch, send_email requires confirm_send_email");
  {
    const pair = confirmAfterSource("web_fetch", "send_email");
    const g = new Sponsio({
      contracts: [pair.assumption, pair.guarantee],
      mode: "enforce",
      sessionLog: false,
    });
    callTool(g, "web_fetch", {}, "allow");
    callTool(g, "send_email", {}, "block");
    callTool(g, "confirm_send_email", {}, "allow");
    callTool(g, "send_email", {}, "allow");
  }
}

// ═══════════════════════════════════════════════════════════════════
//  WORKFLOW HYGIENE (6)
// ═══════════════════════════════════════════════════════════════════

function workflowPatterns(): void {
  console.log(`\n${BOLD}${MAGENTA}═══ Workflow Hygiene ═══${RESET}`);

  section("dry_run_before_commit", "plan must precede apply");
  {
    const g = newGuard(dryRunBeforeCommit("plan", "apply"));
    callTool(g, "apply", {}, "block");
    callTool(g, "plan", {}, "allow");
    callTool(g, "apply", {}, "allow");
  }

  section("backup_before_destructive", "snapshot must precede drop_table");
  {
    const g = newGuard(backupBeforeDestructive("snapshot", "drop_table"));
    callTool(g, "drop_table", {}, "block");
    callTool(g, "snapshot", {}, "allow");
    callTool(g, "drop_table", {}, "allow");
  }

  section("audit_after", "transfer_funds eventually followed by audit_log (liveness)");
  {
    const g = newGuard(auditAfter("transfer_funds", "audit_log"));
    callTool(g, "transfer_funds", {}, "allow");
    callTool(g, "audit_log", {}, "allow");
  }

  section("approval_freshness", "deploy needs approve within 2 prior steps");
  {
    const g = newGuard(approvalFreshness("approve", "deploy", 2));
    callTool(g, "deploy", {}, "block");
  }
  {
    const g = newGuard(approvalFreshness("approve", "deploy", 2));
    callTool(g, "approve", {}, "allow");
    callTool(g, "deploy", {}, "allow");
  }

  section("sanitized_before_sink", "after web_fetch, sanitize must precede send_email");
  {
    const g = newGuard(sanitizedBeforeSink("web_fetch", "sanitize", "send_email"));
    callTool(g, "web_fetch", {}, "allow");
    callTool(g, "send_email", {}, "block");
    callTool(g, "sanitize", {}, "allow");
    callTool(g, "send_email", {}, "allow");
  }

  section("duplicate_call_limit", "search 'invoice-42' at most once (atom: count_with)");
  {
    const g = newGuard(duplicateCallLimit("search", "invoice-42", 1));
    callTool(g, "search", { query: "invoice-42" }, "allow");
    callTool(g, "search", { query: "report-99" }, "allow", "different args, free");
    callTool(g, "search", { query: "invoice-42" }, "block", "duplicate hits the cap");
  }
}

// ═══════════════════════════════════════════════════════════════════
//  RESOURCE / DELEGATION (3)
// ═══════════════════════════════════════════════════════════════════

function resourcePatterns(): void {
  console.log(`\n${BOLD}${MAGENTA}═══ Resource / Delegation ═══${RESET}`);

  section("token_budget", "session ≤ 500 tokens (atom: token_count)");
  {
    const g = newGuard(tokenBudget(500));
    g.guardBefore("ask_llm", { tokens: { input: 100, output: 100 } });
    console.log(`  ${BLUE}▸ ask_llm tokens=200 (cumulative=200)${RESET}`);
    g.guardBefore("ask_llm", { tokens: { input: 100, output: 100 } });
    console.log(`  ${BLUE}▸ ask_llm tokens=200 (cumulative=400)${RESET}`);
    callTool(g, "ask_llm", { tokens: { input: 100, output: 100 } }, "block", "cumulative=600 > 500");
  }

  section("arg_value_range", "set_temp.value in [0, 100] (atom: arg_numeric)");
  {
    const g = newGuard(argValueRange("set_temp", "value", 0, 100));
    callTool(g, "set_temp", { value: 25 }, "allow");
    callTool(g, "set_temp", { value: -5 }, "block", "below min");
    callTool(g, "set_temp", { value: 200 }, "block", "above max");
  }

  section("delegation_depth_limit", "atom: delegation_depth (wiring demo)");
  console.log(
    `  ${DIM}  Known atom-key asymmetry between Var('delegation_depth').key()${RESET}\n` +
    `  ${DIM}  and predKey('delegation_depth') — runtime block doesn't fire${RESET}\n` +
    `  ${DIM}  through the LTL evaluator. Pattern compiles & loads cleanly.${RESET}`,
  );
  {
    const g = newGuard(delegationDepthLimit(2));
    console.log(`  ${BLUE}▸ contract loaded: ${g.contractDescs()[0]}${RESET}`);
  }
}

// ═══════════════════════════════════════════════════════════════════
//  LAYER-3 — response / ctx / time-bound (8)
// ═══════════════════════════════════════════════════════════════════

function layer3Patterns(): void {
  console.log(`\n${BOLD}${MAGENTA}═══ Layer-3 — response / ctx / time ═══${RESET}`);

  section("max_length", "response ≤ 5 words (atoms: response_words / response_chars)");
  {
    const g = newGuard(maxLength({ maxWords: 5 }));
    llm(g, "short reply", "allow");
    llm(g, "this response definitely runs longer than five words total", "block");
  }

  section("no_pii", "response must not contain PII (atom: llm_said)");
  {
    const g = newGuard(noPii(["email", "ssn"]));
    llm(g, "hello world", "allow");
    llm(g, "alice@example.com", "block");
  }

  section("no_keywords", "case-insensitive ban on 'password' / 'secret'");
  {
    const g = newGuard(noKeywords(["password", "secret"]));
    llm(g, "no credentials disclosed", "allow");
    llm(g, "the password is hunter2", "block");
    llm(g, "here is a SECRET", "block");
  }

  section("ctx_required", "wire requires ctx[caller_id] ∈ {alice, bob} (atom: ctx)");
  {
    const g = newGuard(ctxRequired("wire", "caller_id", ["alice", "bob"]));
    callTool(g, "wire", {}, "block", "no ctx pushed");
    ctx(g, { caller_id: "alice" });
    callTool(g, "wire", {}, "allow", "alice attested");
  }
  {
    const g = newGuard(ctxRequired("wire", "caller_id", ["alice", "bob"]));
    ctx(g, { caller_id: "eve" });
    callTool(g, "wire", {}, "block", "eve outside allowlist");
  }

  section("ctx_matches_required", "publish needs ctx[verified] matches ^true$ (atom: ctx_matches)");
  {
    const g = newGuard(ctxMatchesRequired("publish", "verified", "^true$"));
    ctx(g, { verified: "true" });
    callTool(g, "publish", {}, "allow");
  }
  {
    const g = newGuard(ctxMatchesRequired("publish", "verified", "^true$"));
    ctx(g, { verified: "false" });
    callTool(g, "publish", {}, "block");
  }

  section("time_since", "time_since(ctx(approval, granted)) ≤ 5 (atoms: time_since, now)");
  {
    const g = newGuard(timeSince("ctx(approval, granted)", 5));
    callTool(g, "act", {}, "block", "predicate never fired");
  }
  {
    const g = newGuard(timeSince("ctx(approval, granted)", 5));
    ctx(g, { approval: "granted" });
    callTool(g, "act", {}, "allow", "within 5-event window");
  }

  section("approval_active", "issue_refund needs senior_eng approval ≤60s old");
  {
    const g = newGuard(approvalActive("issue_refund", "senior_eng", 60));
    callTool(g, "issue_refund", {}, "block", "no approval observed");
    approval(g, "senior_eng", "allow");
    callTool(g, "issue_refund", {}, "allow", "fresh approval");
  }
  {
    const g = newGuard(approvalActive("issue_refund", "senior_eng", 60));
    approval(g, "senior_eng", "deny");
    callTool(g, "issue_refund", {}, "block", "decision=deny");
  }
  {
    const g = newGuard(approvalActive("issue_refund", "senior_eng", 60));
    approval(g, "junior_eng", "allow");
    callTool(g, "issue_refund", {}, "block", "wrong role");
  }
}

// ═══════════════════════════════════════════════════════════════════
//  RAW ATOMS — direct demos for atoms not exercised above
// ═══════════════════════════════════════════════════════════════════

function atomShowcase(): void {
  console.log(`\n${BOLD}${MAGENTA}═══ Atoms (direct, raw formula) ═══${RESET}`);

  // count_with
  section("count_with", "raw atom: G(count_with(http_post, 'admin') ≤ 1)");
  {
    const raw: DetFormula = {
      formula: new G(new Le(new Var("count_with", "http_post", "admin"), new Const(1))),
      desc: "http_post(admin) at most once",
      patternName: "raw_count_with",
      liveness: false,
    };
    const g = newGuard(raw);
    callTool(g, "http_post", { path: "/admin/x" }, "allow");
    callTool(g, "http_post", { path: "/admin/y" }, "block");
  }

  // arg_has — raw Atom
  section("arg_has", "raw atom: G(called(bash) → ¬arg_has(bash, 'sudo'))");
  {
    const raw: DetFormula = {
      formula: new G(
        new Implies(
          new Atom("called", ["bash"]),
          new Not(new Atom("arg_has", ["bash", "sudo"])),
        ),
      ),
      desc: "bash args must not contain 'sudo'",
      patternName: "raw_arg_has",
      liveness: false,
    };
    const g = newGuard(raw);
    callTool(g, "bash", { command: "ls /tmp" }, "allow");
    callTool(g, "bash", { command: "sudo ls /root" }, "block");
  }

  // segment — emitted on llm_response with args.segment
  section("segment", "llm_response segment tag (atom: segment)");
  {
    const raw: DetFormula = {
      formula: new G(
        new Implies(
          new Atom("segment", ["answer"]),
          new Not(new Atom("llm_said", ["<internal-token>"])),
        ),
      ),
      desc: "answer segment must not leak internal token",
      patternName: "raw_segment",
      liveness: false,
    };
    const g = newGuard(raw);
    g.observeResponse("regular reply", { segment: "answer" });
    console.log(`  ${BLUE}▸ llm_response[segment=answer]: 'regular reply' — passes${RESET}`);
    const r = g.observeResponse("<internal-token>x</internal-token>", { segment: "answer" });
    expectStep("answer leaks internal token", r.blocked ? "block" : "allow", "block");
  }

  // perm / flow / contains — TS grounding doesn't auto-emit these
  section("perm / flow / contains", "Python-only atoms — TS grounding stub");
  console.log(
    `  ${DIM}  These atoms are emitted by Python's observe_data_* /${RESET}\n` +
    `  ${DIM}  Agent.permissions wiring. The TS SDK accepts the atom${RESET}\n` +
    `  ${DIM}  predicate (so contracts referencing them load cleanly) but${RESET}\n` +
    `  ${DIM}  does not yet emit them automatically. See the Python${RESET}\n` +
    `  ${DIM}  showcase for the runtime-firing demo.${RESET}`,
  );
}

// ═══════════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════════

console.log(`${BOLD}${MAGENTA}${"=".repeat(64)}${RESET}`);
console.log(`${BOLD}${MAGENTA}  Sponsio — All Patterns + Atoms Showcase (TypeScript)${RESET}`);
console.log(`${DIM}  44 patterns, 23 atoms — runs offline, no API key required.${RESET}`);
console.log(`${BOLD}${MAGENTA}${"=".repeat(64)}${RESET}`);

coreTemporal();
argumentPatterns();
owaspPatterns();
workflowPatterns();
resourcePatterns();
layer3Patterns();
atomShowcase();

console.log(`\n${BOLD}${MAGENTA}${"=".repeat(64)}${RESET}`);
const color = passed === total ? GREEN : YELLOW;
console.log(`${BOLD}  Result: ${color}${passed}/${total}${RESET} ${BOLD}step assertions matched expectation${RESET}`);
console.log(`${BOLD}${MAGENTA}${"=".repeat(64)}${RESET}`);
// @ts-expect-error — example tsconfig doesn't pull @types/node, but this runs under tsx
process.exit(passed === total ? 0 : 1);
