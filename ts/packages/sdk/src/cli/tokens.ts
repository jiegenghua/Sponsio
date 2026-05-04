/**
 * Truecolor palette mirroring ``sponsio/render/tokens.py`` so the TS
 * scanner's stdout matches the Python wizard / runtime trace output
 * pixel-for-pixel.  Single source of truth on the TS side — every
 * other module in this package imports these helpers instead of
 * sprinkling raw ``\x1b[31m`` / ``\x1b[32m`` codes.
 *
 * If you tweak the Python PALETTE, mirror the change here.  The
 * cross-language test suite doesn't enforce parity (no shared
 * runner), so it's a discipline thing.
 */

/* ─────────────────────────────────────────────────────────────────
 * Truecolor escape helpers — keep payload structure identical to
 * Python's so palette diffs read cleanly.
 * ──────────────────────────────────────────────────────────────── */

const RESET = "\x1b[0m";

function rgb(hex: string): string {
  // ``#7DD3FC`` → ``\x1b[38;2;125;211;252m``
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) throw new Error(`bad hex: ${hex}`);
  const [, r, g, b] = m;
  return `\x1b[38;2;${parseInt(r, 16)};${parseInt(g, 16)};${parseInt(b, 16)}m`;
}

/* ─────────────────────────────────────────────────────────────────
 * Palette — keep 1:1 with sponsio/render/tokens.py:PALETTE.
 * ──────────────────────────────────────────────────────────────── */

export const PALETTE = {
  brand: rgb("#7DD3FC"), // cyan-300   — banner titles, CTA arrow
  success: rgb("#86EFAC"), // green-300  — ✓, ACTIVE, PASS
  violation: rgb("#FCA5A5"), // red-300    — ✗, BLOCKED, VIOLATED
  warning: rgb("#FCD34D"), // amber-300  — soft fail, watchlist
  active: rgb("#C4B5FD"), // violet-300 — contract state transitions
  metadata: rgb("#64748B"), // slate-500  — timestamps, latencies, hints
  muted: rgb("#94A3B8"), // slate-400  — fallback service label, dim text
  rule: rgb("#475569"), // slate-600  — banner & divider lines
  fg: rgb("#E2E8F0"), // slate-200  — default foreground
} as const;

const BOLD = "\x1b[1m";

/* ─────────────────────────────────────────────────────────────────
 * Convenience wrappers — every place that wants to colorize a string
 * goes through these.  Centralized so we can short-circuit when
 * stdout isn't a TTY (`NO_COLOR` env var, piped output) without
 * touching every call site.
 * ──────────────────────────────────────────────────────────────── */

const colorEnabled = (): boolean => {
  if (process.env.NO_COLOR) return false;
  // ``TERM=dumb`` is the universal "no escapes" hint.
  if (process.env.TERM === "dumb") return false;
  // When stdout is a pipe (`| cat`, CI logs) most colour systems
  // turn off; do the same so byte-identical comparisons in tests
  // don't have to strip escapes.
  return Boolean(process.stdout.isTTY);
};

function paint(color: string, text: string, { bold = false }: { bold?: boolean } = {}): string {
  if (!colorEnabled()) return text;
  return (bold ? BOLD : "") + color + text + RESET;
}

export const style = {
  brand: (s: string, bold = false) => paint(PALETTE.brand, s, { bold }),
  success: (s: string, bold = false) => paint(PALETTE.success, s, { bold }),
  violation: (s: string, bold = false) => paint(PALETTE.violation, s, { bold }),
  warning: (s: string, bold = false) => paint(PALETTE.warning, s, { bold }),
  metadata: (s: string) => paint(PALETTE.metadata, s),
  fg: (s: string) => paint(PALETTE.fg, s),
};
