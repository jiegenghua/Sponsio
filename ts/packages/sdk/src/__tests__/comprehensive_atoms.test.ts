/**
 * Comprehensive coverage — grounding-layer atoms (TS).
 *
 * Mirrors ``tests/comprehensive/test_atoms.py``. Drives the
 * ``groundEvent`` kernel directly so each atom's emission contract
 * can be asserted in isolation without the full Sponsio guard wiring.
 *
 * TS atom catalogue (det-relevant, OSS):
 *   called(tool), called_any, count(tool)
 *   called_with(tool, pattern), count_with(tool, pattern)
 *   consecutive_count(tool)
 *   arg_has(tool, pattern), arg_field_has(tool, field, pattern)
 *   arg_length_exceeds(tool, field, max_chars)
 *   arg_numeric(tool, field), arg_paths_within(tool, *prefixes)
 *   token_count(scope)
 *   delegation_depth
 *   ctx(key, value), ctx_matches(key, pattern)
 *   llm_said(pattern), response_words / response_chars, segment(value)
 *   time_since(predicate_key)
 *   now
 *
 * Atoms that exist on the Python side but are not part of the TS
 * grounding kernel today (``perm`` / ``flow`` / ``contains``) are
 * exercised on the Python parity test only.
 */

import { Atom, Var } from "../core/formula.js";
import {
  collectContentAtoms,
  groundEvent,
  newGroundingState,
  type ToolEvent,
} from "../core/grounding.js";
import { newScoreboard } from "./_comprehensive_helpers.js";

const board = newScoreboard();
const a = (cond: boolean, msg: string) => board.assert(cond, msg);

function ground(events: ToolEvent[], formulas: (Atom | Var)[] = []) {
  const state = newGroundingState();
  const contentAtoms = formulas.length > 0 ? collectContentAtoms(formulas as never) : undefined;
  return events.map((ev) => groundEvent(ev, state, contentAtoms));
}

function tool(name: string, args?: Record<string, unknown>, ts?: number): ToolEvent {
  return { tool: name, args, ts };
}

// ── called / called_any / count ────────────────────────────────────
{
  const [v] = ground([tool("read_file")]);
  a(v["called(read_file)"] === true, "called(read_file) fires");
  a(v["called_any()"] === true, "called_any fires for any tool call");
}
{
  const vs = ground([tool("send_email"), tool("send_email"), tool("send_email")]);
  a(
    [vs[0]["count(send_email)"], vs[1]["count(send_email)"], vs[2]["count(send_email)"]].join(",") === "1,2,3",
    "count(send_email) accumulates per tool",
  );
}

// ── called_with / count_with ───────────────────────────────────────
{
  const formulas = [new Atom("called_with", ["send_email", "spam"])];
  const vs = ground(
    [tool("send_email", { to: "spam@evil.com" }), tool("send_email", { to: "ok@example.com" })],
    formulas,
  );
  a(vs[0]["called_with(send_email, spam)"] === true, "called_with fires on regex match");
  a(vs[1]["called_with(send_email, spam)"] === false, "called_with false on non-match");
}
{
  const formulas = [new Var("count_with", "send_email", "spam")];
  const vs = ground(
    [
      tool("send_email", { to: "spam@evil.com" }),
      tool("send_email", { to: "ok@example.com" }),
      tool("send_email", { to: "spam2@evil.com" }),
    ],
    formulas,
  );
  a(
    [vs[0]["count_with(send_email, spam)"], vs[1]["count_with(send_email, spam)"], vs[2]["count_with(send_email, spam)"]].join(",") === "1,1,2",
    "count_with accumulates pattern matches",
  );
}

// ── consecutive_count ──────────────────────────────────────────────
{
  const vs = ground([tool("poll"), tool("poll"), tool("done"), tool("poll")]);
  a(vs[0]["consecutive_count(poll)"] === 1, "consecutive_count step 1");
  a(vs[1]["consecutive_count(poll)"] === 2, "consecutive_count step 2");
  a(vs[3]["consecutive_count(poll)"] === 1, "consecutive_count resets after different tool");
}

// ── arg_has ────────────────────────────────────────────────────────
{
  const formulas = [new Atom("arg_has", ["execute_sql", "DROP"])];
  const [v] = ground([tool("execute_sql", { query: "DROP TABLE" })], formulas);
  a(v["arg_has(execute_sql, DROP)"] === true, "arg_has matches serialized args");
}

// ── arg_field_has ──────────────────────────────────────────────────
{
  const formulas = [new Atom("arg_field_has", ["post", "channel", "^#prod-"])];
  const [v] = ground([tool("post", { channel: "#prod-alerts" })], formulas);
  a(v["arg_field_has(post, channel, ^#prod-)"] === true, "arg_field_has matches named field");
}
{
  const formulas = [new Atom("arg_field_has", ["post", "channel", "^#prod-"])];
  const [v] = ground([tool("post", { channel: "#dev-only" })], formulas);
  a(v["arg_field_has(post, channel, ^#prod-)"] === false, "arg_field_has false on miss");
}

// ── arg_length_exceeds ─────────────────────────────────────────────
{
  const formulas = [new Atom("arg_length_exceeds", ["post", "body", "10"])];
  const long = tool("post", { body: "x".repeat(50) });
  const short = tool("post", { body: "ok" });
  const vs = ground([long, short], formulas);
  a(vs[0]["arg_length_exceeds(post, body, 10)"] === true, "arg_length_exceeds long body");
  a(vs[1]["arg_length_exceeds(post, body, 10)"] === false, "arg_length_exceeds short body");
}

// ── arg_numeric ────────────────────────────────────────────────────
{
  const formulas = [new Var("arg_numeric", "set_temp", "value")];
  const [v] = ground([tool("set_temp", { value: 42 })], formulas);
  a(v["arg_numeric(set_temp, value)"] === 42, "arg_numeric extracts int");
}
{
  const formulas = [new Var("arg_numeric", "bash", "rate")];
  const [v] = ground([tool("bash", { command: "send --rate 10 --batch 5" })], formulas);
  a(v["arg_numeric(bash, rate)"] === 10, "arg_numeric extracts CLI flag");
}

// ── arg_paths_within ───────────────────────────────────────────────
{
  const formulas = [new Atom("arg_paths_within", ["write_file", "/tmp/"])];
  const [v] = ground([tool("write_file", { path: "/tmp/output" })], formulas);
  a(v["arg_paths_within(write_file, /tmp/)"] === true, "arg_paths_within inside");
}
{
  const formulas = [new Atom("arg_paths_within", ["write_file", "/tmp/"])];
  const [v] = ground([tool("write_file", { path: "/etc/passwd" })], formulas);
  a(v["arg_paths_within(write_file, /tmp/)"] === false, "arg_paths_within outside");
}

// ── token_count ────────────────────────────────────────────────────
{
  const formulas = [new Var("token_count", "total")];
  const e1 = tool("ask_llm", { tokens: { input: 60, output: 40 } });
  const e2 = tool("ask_llm", { tokens: { input: 30, output: 20 } });
  const vs = ground([e1, e2], formulas);
  a(vs[0]["token_count(total)"] === 100, "token_count accumulates step 1");
  a(vs[1]["token_count(total)"] === 150, "token_count accumulates step 2");
}

// ── delegation_depth ───────────────────────────────────────────────
{
  const state = newGroundingState();
  groundEvent({ tool: "", event_type: "delegation" }, state);
  groundEvent({ tool: "", event_type: "delegation" }, state);
  groundEvent({ tool: "", event_type: "delegation" }, state);
  a(state.delegationDepth === 3, "delegation_depth increments per delegation event");
}

// ── ctx / ctx_matches ──────────────────────────────────────────────
{
  const state = newGroundingState();
  groundEvent({ tool: "", event_type: "context_update", args: { caller_id: "alice" } }, state);
  const v = groundEvent({ tool: "wire_transfer" }, state);
  a(v["ctx(caller_id, alice)"] === true, "ctx atom emitted across events");
}
{
  const formulas = [new Atom("ctx_matches", ["approval.role", "senior_eng"])];
  const state = newGroundingState();
  const contentAtoms = collectContentAtoms(formulas as never);
  groundEvent(
    { tool: "", event_type: "context_update", args: { "approval.role": "senior_eng" } },
    state,
    contentAtoms,
  );
  const v = groundEvent({ tool: "refund" }, state, contentAtoms);
  a(v["ctx_matches(approval.role, senior_eng)"] === true, "ctx_matches regex against ctx");
}

// ── llm_said / response_words / response_chars / segment ───────────
{
  const atom = new Atom("llm_said", ["\\bsecret\\b"]);
  const [v] = ground(
    [{ tool: "", event_type: "llm_response", content: "the secret is here" }],
    [atom],
  );
  a(v[atom.key()] === true, "llm_said matches regex against response");
}
{
  const [v] = ground([{ tool: "", event_type: "llm_response", content: "five word response is fine" }]);
  a(v["response_words"] === 5, "response_words counts words");
  a(v["response_chars"] === 26, "response_chars counts characters");
}
{
  const [v] = ground([
    { tool: "", event_type: "llm_response", content: "...", args: { segment: "thinking" } },
  ]);
  a(v["segment(thinking)"] === true, "segment atom for thinking tag");
}

// ── time_since ─────────────────────────────────────────────────────
{
  const v = new Var("time_since", "ctx(approval, granted)");
  const state = newGroundingState();
  const contentAtoms = collectContentAtoms([v] as never);
  const val = groundEvent(
    { tool: "", event_type: "context_update", args: { approval: "granted" }, ts: 1 },
    state,
    contentAtoms,
  );
  a(val[v.key()] === 0, "time_since=0 when predicate just fired");
}
{
  const v = new Var("time_since", "ctx(approval, granted)");
  const state = newGroundingState();
  const contentAtoms = collectContentAtoms([v] as never);
  groundEvent(
    { tool: "", event_type: "context_update", args: { approval: "granted" }, ts: 1 },
    state,
    contentAtoms,
  );
  const val = groundEvent({ tool: "act", ts: 10 }, state, contentAtoms);
  a(val[v.key()] === 9, "time_since advances with clock");
}
{
  const v = new Var("time_since", "ctx(approval, granted)");
  const [val] = ground([tool("act", undefined, 1)], [v]);
  a(val[v.key()] === 1e18, "time_since sentinel when predicate never fired");
}

// ── now ────────────────────────────────────────────────────────────
{
  const [v] = ground([tool("act", undefined, 42)]);
  a(v["now"] === 42, "now atom tracks event clock");
}

board.summary("comprehensive_atoms");
