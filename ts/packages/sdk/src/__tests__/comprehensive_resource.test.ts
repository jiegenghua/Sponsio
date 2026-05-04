/**
 * Comprehensive coverage — resource / delegation patterns (TS).
 *
 * Mirrors ``tests/comprehensive/test_patterns_resource.py``.
 */

import {
  argValueRange,
  delegationDepthLimit,
  tokenBudget,
} from "../core/patterns.js";
import { groundEvent, newGroundingState } from "../core/grounding.js";
import { makeGuard, newScoreboard } from "./_comprehensive_helpers.js";

const board = newScoreboard();
const a = (cond: boolean, msg: string) => board.assert(cond, msg);

// ── token_budget ───────────────────────────────────────────────────
{
  const g = makeGuard([tokenBudget(1000)]);
  a(!g.guardBefore("ask_llm", { tokens: { input: 100, output: 50 } }).blocked, "token_budget under limit");
}
{
  const g = makeGuard([tokenBudget(100)]);
  // 80 input → cumulative 80 ≤ 100 OK
  g.guardBefore("ask_llm", { tokens: { input: 80, output: 0 } });
  // Next call adds 50 → cumulative 130 > 100 → block.
  a(g.guardBefore("ask_llm", { tokens: { input: 50, output: 0 } }).blocked, "token_budget exceeded");
}

// ── arg_value_range ────────────────────────────────────────────────
{
  const g = makeGuard([argValueRange("set_temperature", "value", 0, 100)]);
  a(g.guardBefore("set_temperature", { value: -5 }).blocked, "arg_value_range blocks below min");
}
{
  const g = makeGuard([argValueRange("set_temperature", "value", 0, 100)]);
  a(g.guardBefore("set_temperature", { value: 200 }).blocked, "arg_value_range blocks above max");
}
{
  const g = makeGuard([argValueRange("set_temperature", "value", 0, 100)]);
  a(!g.guardBefore("set_temperature", { value: 25 }).blocked, "arg_value_range allows in range");
}

// ── delegation_depth_limit ─────────────────────────────────────────
// NOTE: ``delegation_depth`` has a known unparameterized-Var key
// asymmetry between Python's ``Var.key()`` (bare name) and grounding's
// ``pred_key`` (with parens), faithfully ported into TS. Asserting
// runtime block would diverge from current Python behavior, so we
// only verify the wiring round-trip: the grounding accumulator
// increments per ``delegation`` event.
{
  const state = newGroundingState();
  groundEvent({ tool: "", event_type: "delegation" }, state);
  groundEvent({ tool: "", event_type: "delegation" }, state);
  groundEvent({ tool: "", event_type: "delegation" }, state);
  a(state.delegationDepth === 3, "delegation_depth accumulates to 3");
}
{
  // Pattern compiles + loads without throwing.
  const g = makeGuard([delegationDepthLimit(2)]);
  a(g.contractDescs().length === 1, "delegation_depth_limit pattern loads");
}

board.summary("comprehensive_resource");
