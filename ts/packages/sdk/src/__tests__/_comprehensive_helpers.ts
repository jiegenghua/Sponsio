/**
 * Shared helpers for the comprehensive pattern / atom test suite.
 * Mirrors ``tests/comprehensive/_helpers.py`` on the Python side.
 *
 * Each test file owns its own pass/fail counters via ``newScoreboard``
 * (the file's ``main()`` calls ``board.summary("…")`` at the end so a
 * non-zero failure flips the process exit code). Sharing a single
 * module-scoped scoreboard across files would conflate counts when
 * ``npm run test`` runs them in parallel.
 */

import { Sponsio } from "../index.js";
import type { DetFormula } from "../core/patterns.js";

export interface SponsoOptionsOverride {
  mode?: "enforce" | "observe";
}

export function makeGuard(
  contracts: DetFormula[],
  opts: SponsoOptionsOverride = {},
): Sponsio {
  return new Sponsio({
    contracts,
    mode: opts.mode ?? "enforce",
    sessionLog: false,
  });
}

export interface Scoreboard {
  assert(cond: boolean, msg: string): void;
  summary(label: string): void;
}

export function newScoreboard(): Scoreboard {
  let passed = 0;
  let failed = 0;
  return {
    assert(cond: boolean, msg: string) {
      if (cond) passed++;
      else {
        failed++;
        console.error(`FAIL: ${msg}`);
      }
    },
    summary(label: string) {
      console.log(`\n${"=".repeat(40)}`);
      console.log(`${label}: ${passed} passed, ${failed} failed`);
      if (failed > 0) process.exit(1);
    },
  };
}
