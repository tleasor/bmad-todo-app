#!/usr/bin/env bash
# Enforces NFR-M5: each package must declare ≤ 25 direct dependencies
# (dependencies + devDependencies counted together per file).
set -euo pipefail

LIMIT=25

bun -e '
const fs = require("node:fs");
const limit = parseInt(process.argv[1], 10);
const files = process.argv.slice(2);
let failed = false;
for (const file of files) {
  const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
  const deps = Object.keys(pkg.dependencies ?? {}).length;
  const dev = Object.keys(pkg.devDependencies ?? {}).length;
  const total = deps + dev;
  const status = total > limit ? "FAIL" : "OK  ";
  console.log(`${status} ${file}: ${total} direct deps (limit ${limit})`);
  if (total > limit) failed = true;
}
if (failed) {
  console.error("Dep count check FAILED");
  process.exit(1);
}
console.log("Dep count check passed.");
' "$LIMIT" package.json apps/web/package.json apps/api/package.json
