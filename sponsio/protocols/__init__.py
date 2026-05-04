"""Public protocol interfaces — the contract between OSS and out-of-tree extensions.

Anything in ``sponsio.protocols`` is part of the **stable public API**.
Cloud / proprietary / third-party packages implement these protocols and
inject their implementations into ``BaseGuard`` (and friends) via
constructor DI or the ``sponsio.evaluators`` entry-point group.

OSS never imports an extension's package. Extensions ``pip install sponsio``
and implement protocols defined here.
"""

from sponsio.protocols.sto import StoEvaluator, StoResult

__all__ = ["StoEvaluator", "StoResult"]
