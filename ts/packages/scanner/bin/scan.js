#!/usr/bin/env node
// DEPRECATED shim.  ``@sponsio/scan-ts`` was merged into ``@sponsio/sdk``;
// this forwards every invocation to the ``sponsio`` binary in the merged
// package so existing ``npm install -D @sponsio/scan-ts`` setups keep
// working without immediate migration.
//
// Drop ``@sponsio/scan-ts`` from your devDependencies and add
// ``@sponsio/sdk`` instead — same ``sponsio`` CLI, one less package.

process.stderr.write(
  "[sponsio] @sponsio/scan-ts is deprecated — merged into @sponsio/sdk.\n" +
  "          Run: npm uninstall @sponsio/scan-ts && npm install -D @sponsio/sdk\n",
);

// Forward through the merged package's CLI entry.  Using ``require``
// instead of ``spawn`` so argv passes through naturally and exit codes
// propagate without an extra process boundary.
require("@sponsio/sdk/dist/cli/cli.js");
