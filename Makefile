# Sponsio maintenance helpers.
#
# `make help` for the menu. Most contributors only need `make check`
# (run before pushing a PR) and `make install-dev` (set up a fresh
# clone). The rest are release / sync helpers documented in
# scripts/README.md.

.PHONY: help install-dev test test-fast lint fmt fmt-check check clean \
        bench docs ts-sync ts-parity ts-build ts-test \
        sync-examples sync-openclaw release-check

# ─── Default ──────────────────────────────────────────────────────

help:
	@echo "Sponsio maintenance commands"
	@echo ""
	@echo "  Setup"
	@echo "    install-dev     Install the project in editable mode with all extras"
	@echo ""
	@echo "  Daily dev loop"
	@echo "    test            Run the full pytest suite"
	@echo "    test-fast       Run pytest with -x (stop on first failure) and no coverage"
	@echo "    lint            Run ruff check"
	@echo "    fmt             Run ruff format (writes)"
	@echo "    fmt-check       Run ruff format --check (read-only)"
	@echo "    check           lint + fmt-check + test  (run before pushing)"
	@echo "    clean           Remove build artifacts and caches"
	@echo ""
	@echo "  TypeScript parity"
	@echo "    ts-build        Build the @sponsio/sdk TypeScript SDK"
	@echo "    ts-test         Run the TS test suite"
	@echo "    ts-sync         Mirror Python contracts/prompts/scaffolds → TS SDK"
	@echo "    ts-parity       Verify Python ↔ TS resources are in sync"
	@echo ""
	@echo "  Resource sync (run after editing the matching source)"
	@echo "    sync-examples   examples/eval/ → sponsio/init_examples/eval/"
	@echo "    sync-openclaw   plugins/sponsio-openclaw/dist/ → sponsio/plugin/openclaw_artifact/"
	@echo ""
	@echo "  Documentation"
	@echo "    docs            Regenerate llms-full.txt from README + docs/"
	@echo ""
	@echo "  Performance"
	@echo "    bench           Microbenchmark the verifier / DFA backend"
	@echo ""
	@echo "  Release"
	@echo "    release-check   lint + test + ts-parity + bench (gate before tagging)"

# ─── Setup ────────────────────────────────────────────────────────

install-dev:
	pip install -e ".[all]"
	@echo ""
	@echo "✓ Dev install complete. Run \`make check\` to verify your environment."

# ─── Daily dev loop ───────────────────────────────────────────────

test:
	pytest tests/ -q --no-cov

test-fast:
	pytest tests/ -q --no-cov -x

lint:
	ruff check sponsio/ tests/

fmt:
	ruff format sponsio/ tests/

fmt-check:
	ruff format --check sponsio/ tests/

check: lint fmt-check test
	@echo ""
	@echo "✓ All local checks passed."

clean:
	rm -rf build/ dist/ *.egg-info
	find . -type d -name '__pycache__' -prune -exec rm -rf {} +
	find . -type d -name '.pytest_cache' -prune -exec rm -rf {} +
	find . -type d -name '.ruff_cache' -prune -exec rm -rf {} +
	find . -type f -name '*.pyc' -delete

# ─── TypeScript parity ────────────────────────────────────────────

ts-build:
	cd ts/packages/sdk && npm run build

ts-test:
	cd ts/packages/sdk && npm test

ts-sync:
	bash scripts/sync-ts-mirror.sh

ts-parity:
	bash scripts/check-ts-parity.sh

# ─── Resource sync ────────────────────────────────────────────────

sync-examples:
	python scripts/sync_init_examples.py

sync-openclaw:
	python scripts/sync_openclaw_artifact.py

# ─── Docs / perf ──────────────────────────────────────────────────

docs:
	python scripts/build_llms_txt.py

bench:
	python scripts/bench_verifier.py

# ─── Release gate ─────────────────────────────────────────────────

release-check: lint fmt-check test ts-parity bench
	@echo ""
	@echo "✓ Release-check passed. Safe to tag and publish."
