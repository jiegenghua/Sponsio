#!/usr/bin/env node
// Thin shim → compiled ``dist/cli/cli.js``.  Keeps ``npx`` invocations
// snappy and lets us publish a single pre-compiled artifact without
// shipping a ``tsx`` / ``esbuild`` dependency.
//
// Lives at ``bin/sponsio.cjs`` (CommonJS) so it can ``require()`` the
// CLI's compiled CJS output directly without an ESM detour.  The
// runtime SDK at ``dist/index.js`` is ESM; the CLI at ``dist/cli/cli.js``
// is CJS — two compile targets in one package, mapped through this
// shim and ``package.json``'s ``bin`` field.
require("../dist/cli/cli.js");
