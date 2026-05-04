"""Stochastic-evaluation Protocol surface.

The OSS engine doesn't ship an LLM-judged sto pipeline; that's a
proprietary feature shipped in the ``sponsio-cloud`` package
(``pip install sponsio[cloud]``). This module defines the abstract
contract a sto pipeline must honour. ``BaseGuard.__init__`` accepts an
optional ``sto_evaluator: StoEvaluator | None`` argument typed against
this Protocol — any object whose method signatures match is accepted,
regardless of inheritance.

Cloud / third-party implementations live in their own packages and
register themselves via the ``sponsio.evaluators`` entry-point group
so users get auto-discovery without explicit injection.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Protocol, runtime_checkable

from sponsio.models.trace import Trace


@dataclass
class StoResult:
    """Result of evaluating one sto constraint against a trace.

    Implementations return one of these per registered evaluator.
    OSS treats it as an opaque scored verdict; downstream rendering
    code (``sponsio explain``, dashboards) reads the fields directly,
    so the schema is part of the public contract.

    Attributes:
        score: Confidence score in ``[0.0, 1.0]``. Higher = more
            compliant. Compared against the per-evaluator threshold.
        evidence: Human-readable description of what triggered the
            score (e.g. "contains aggressive language at offset 42").
        suggestion: Actionable fix hint surfaced to the agent on
            retry-with-feedback.
        metadata: Free-form extras (model name, latency, cache hit,
            fallback marker). Reporters surface as OTel attributes.
    """

    score: float
    evidence: str
    suggestion: str
    metadata: dict = field(default_factory=dict)


@runtime_checkable
class StoEvaluator(Protocol):
    """Sto constraint evaluator interface — implemented out-of-tree.

    Sponsio Cloud's ``CloudStoEvaluator`` (in the proprietary
    ``sponsio-cloud`` package) is the canonical implementation. Third
    parties can implement this Protocol against their own LLM-judge
    backends; structural typing means no inheritance is required.

    The OSS runtime never instantiates an ``StoEvaluator``; it only
    *consumes* one passed in via ``BaseGuard(sto_evaluator=...)`` or
    discovered via the ``sponsio.evaluators`` entry-point group.
    """

    def register(
        self,
        prop_name: str,
        fn: Callable[[Trace], StoResult],
        threshold: float = 0.5,
        feedback_template: str | None = None,
    ) -> None:
        """Bind a scored evaluator to a constraint name."""
        ...

    def check(self, trace: Trace) -> dict[str, tuple[bool, StoResult]]:
        """Evaluate all registered constraints against ``trace``.

        Returns a dict mapping each constraint name to a
        ``(passed, StoResult)`` tuple. A constraint that the
        implementation skipped (e.g. circuit breaker open, fallback
        mode "skip") MAY be omitted from the dict — callers must not
        assume every registered name appears.
        """
        ...
