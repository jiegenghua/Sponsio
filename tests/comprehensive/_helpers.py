"""Shared helpers for comprehensive pattern / atom tests."""

from __future__ import annotations

import sponsio


def make_guard(*contracts) -> sponsio.Sponsio:
    """Build a quiet ``Sponsio`` guard from a list of contracts.

    Each contract may be a plain ``DetFormula`` (wrapped into the
    canonical ``{"guarantee": det}`` dict expected by ``BaseGuard``)
    or a pre-built dict / NL string. Banners + auto-summary are
    suppressed so the test output stays clean.
    """
    wrapped = []
    for c in contracts:
        if hasattr(c, "formula"):
            wrapped.append({"guarantee": c})
        else:
            wrapped.append(c)
    return sponsio.Sponsio(
        contracts=wrapped,
        init_banner=False,
        verbose=False,
        auto_summary=False,
    )


def violation_text(g: sponsio.Sponsio) -> str:
    """Flatten ``guard.violations`` into a single string for substring asserts."""
    return " ".join(str(v) for v in g.violations)
