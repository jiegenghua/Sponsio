/**
 * OSS↔Cloud schema surface for the sto (stochastic / LLM-judge) pipeline.
 *
 * The TS SDK is **det-only**, mirroring Sponsio Python's OSS engine.
 * The managed evaluator catalog (``tone`` / ``relevance`` / ``llm_judge`` /
 * ``hallucination_free`` …), the OpenAI-compatible judge client, and the
 * per-evaluator scoring code are Sponsio Cloud features. They live in
 * the proprietary ``sponsio_cloud.sto.*`` Python package; a Cloud-TS
 * package will mirror them later.
 *
 * What this file ships in OSS:
 *
 *   - **Type contracts** — ``StoEvaluator`` / ``StoResult`` / ``StoInput`` /
 *     ``StoContract`` / ``JudgeClient`` / ``JudgeConfig`` /
 *     ``StoContextSnapshot``. Cloud subclasses / OSS callers consuming the
 *     schema (session loggers, dashboards) reference these.
 *   - ``CloudFeatureError`` — the exception any Cloud-only code path
 *     raises when reached on the OSS engine.
 *   - ``parseScore`` — a pure utility that converts a 0-1 score from a
 *     judge response. Kept because it never contacts an LLM.
 *
 * What this file does NOT ship in OSS (deleted alongside the Python
 * mirrors — ``RetryWithConstraint`` / ``RedirectToSafe`` /
 * ``FeedbackGenerator`` / the per-atom evaluator stubs):
 *
 *   - ``createJudge`` — judge construction
 *   - ``LlmJudgeEvaluator`` / ``ToneEvaluator`` / ``RelevanceEvaluator``
 *     / ``SemanticPiiFreeEvaluator`` / ``HallucinationFreeEvaluator``
 *     / ``ScopeRespectEvaluator`` / ``MetricIntegrityEvaluator``
 *     / ``InjectionFreeEvaluator``
 *
 * The Sponsio constructor rejects yaml-declared sto contracts and any
 * ``judge:`` option at config-load time, so OSS callers never reach a
 * code path that would have built one of these. Cloud installs will
 * supply real implementations of the same Protocol surface.
 *
 * Operators who want the sto pipeline:
 *
 *     pip install sponsio[cloud]
 *
 * or contact your Sponsio account team for managed sto access. See
 * ``docs/oss_scope.md`` for the OSS / Cloud boundary.
 */

// ----- Types (kept; parity with @sponsio/sdk public surface) ---------

export interface StoInput {
  toolName: string;
  output: string;
  /** Per-turn context (cloud-only atom grounding fields). */
  context?: StoContextSnapshot;
}

export interface StoContextSnapshot {
  query?: string;
  source?: string;
  scope?: string;
  history?: string;
}

export interface StoResult {
  score: number;
  passed: boolean;
  evidence?: string;
}

export interface StoEvaluator {
  readonly atom: string;
  readonly desc: string;
  readonly threshold: number;
  evaluate(input: StoInput): Promise<StoResult>;
}

export interface JudgeConfig {
  provider?: "openai";
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  fallbackMode?: "allow" | "deny" | "skip";
}

export interface JudgeClient {
  complete(prompt: string): Promise<string>;
}

export interface StoContract {
  desc: string;
  evaluator: StoEvaluator;
}

// ----- CloudFeatureError ---------------------------------------------

const CLOUD_HINT =
  "Sponsio's sto (LLM-judge) pipeline is a Cloud feature, not bundled " +
  "with the OSS engine. Install `sponsio[cloud]` (Python) or contact " +
  "your Sponsio account team for managed sto access. See " +
  "https://github.com/SponsioLabs/Sponsio/blob/main/docs/oss_scope.md.";

export class CloudFeatureError extends Error {
  constructor(featureName: string) {
    super(`[sponsio] ${featureName} is not available in OSS. ${CLOUD_HINT}`);
    this.name = "CloudFeatureError";
  }
}

// ----- parseScore: pure utility, kept --------------------------------

/**
 * Parse a 0–1 score from a judge response. Pure utility; safe to ship
 * because it never calls a judge. Kept so any user calling it
 * directly (rare) keeps working.
 */
export function parseScore(raw: string): number {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    try {
      const obj = JSON.parse(trimmed) as { score?: unknown };
      if (typeof obj.score === "number") return clamp01(obj.score);
    } catch {
      /* fall through */
    }
  }
  const m = trimmed.match(/([01](?:\.\d+)?|0?\.\d+)/);
  if (!m) {
    throw new Error(
      `unparseable score: ${JSON.stringify(trimmed.slice(0, 80))}`,
    );
  }
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) throw new Error(`non-finite score: ${m[1]}`);
  return clamp01(n);
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
