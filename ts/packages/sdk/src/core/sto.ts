/**
 * Stub for the sto (stochastic / LLM-judge) pipeline.
 *
 * The real evaluator catalog (``tone`` / ``relevance`` / ``llm_judge`` /
 * ``hallucination_free`` …) and the OpenAI-compatible judge client are
 * Sponsio Cloud features, not bundled with the OSS engine. The OSS
 * ``Sponsio`` constructor logs-and-skips sto contracts at load time
 * with a one-time warning — matching Python's
 * ``sponsio.patterns.sto_catalog`` behaviour.
 *
 * This file exists so that:
 *   - imports in ``index.ts`` resolve cleanly
 *   - downstream consumers depending on the type names
 *     (``StoEvaluator``, ``JudgeClient``, …) compile against the
 *     same surface
 *   - any code path that *constructs* an evaluator or *builds* a
 *     judge fails loudly with ``CloudFeatureError`` rather than
 *     silently pretending to enforce
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

// ----- createJudge: stub ---------------------------------------------

/**
 * Stub. The OSS engine does not ship a managed judge client; calling
 * this throws ``CloudFeatureError``. The OSS ``Sponsio`` constructor
 * never reaches this — yaml ``judge:`` blocks and ``options.judge``
 * are routed through the ``skipped`` warning path instead.
 */
export function createJudge(_config: JudgeConfig): JudgeClient {
  throw new CloudFeatureError("createJudge()");
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

// ----- Evaluator class stubs -----------------------------------------
// Each class preserves the 3 public ``StoEvaluator`` fields that
// callers may inspect (``atom`` / ``desc`` / ``threshold``), but
// ``evaluate()`` rejects with ``CloudFeatureError``. The OSS Sponsio
// ctor never instantiates these — yaml sto specs flow through the
// ``skipped`` path before any evaluator is built.

abstract class _StubEvaluator implements StoEvaluator {
  abstract readonly atom: string;
  constructor(
    readonly desc: string,
    readonly threshold: number,
  ) {}
  evaluate(_input: StoInput): Promise<StoResult> {
    return Promise.reject(new CloudFeatureError(`${this.atom} evaluator`));
  }
}

export class LlmJudgeEvaluator extends _StubEvaluator {
  readonly atom = "llm_judge";
  constructor(
    desc: string,
    threshold: number,
    _judge: JudgeClient,
    _promptTemplate: string,
  ) {
    super(desc, threshold);
  }
}

export class ToneEvaluator extends _StubEvaluator {
  readonly atom = "tone";
  constructor(
    desc: string,
    threshold: number,
    _judge: JudgeClient,
    _targetTone: string,
  ) {
    super(desc, threshold);
  }
}

export class RelevanceEvaluator extends _StubEvaluator {
  readonly atom = "relevance";
  constructor(desc: string, threshold: number, _judge: JudgeClient) {
    super(desc, threshold);
  }
}

export class SemanticPiiFreeEvaluator extends _StubEvaluator {
  readonly atom = "semantic_pii_free";
  constructor(desc: string, threshold: number, _judge: JudgeClient) {
    super(desc, threshold);
  }
}

export class HallucinationFreeEvaluator extends _StubEvaluator {
  readonly atom = "hallucination_free";
  constructor(desc: string, threshold: number, _judge: JudgeClient) {
    super(desc, threshold);
  }
}

export class ScopeRespectEvaluator extends _StubEvaluator {
  readonly atom = "scope_respect";
  constructor(
    desc: string,
    threshold: number,
    _judge: JudgeClient,
    _defaultScope: string,
  ) {
    super(desc, threshold);
  }
}

export class MetricIntegrityEvaluator extends _StubEvaluator {
  readonly atom = "metric_integrity";
  constructor(desc: string, threshold: number, _judge: JudgeClient) {
    super(desc, threshold);
  }
}

export class InjectionFreeEvaluator extends _StubEvaluator {
  readonly atom = "injection_free";
  constructor(desc: string, threshold: number, _judge: JudgeClient) {
    super(desc, threshold);
  }
}
