#!/usr/bin/env bash
# Runs inside `aze-forge-canonical-release` (Linux/amd64, Node 24). Two commands:
#
#   evidence <sealed-manifest> [output-directory]
#     Produces the canonical TeX renderer evidence and refuses to report success
#     unless the environment gate, the report flag, and the renderer identity all
#     hold.
#
#   refresh [output-directory]
#     Runs the developer-only Golden baseline refresh on this canonical host and
#     copies the rewritten baselines to the output directory for review. Only
#     this environment may rewrite `acceptance/expected.json` and
#     `acceptance/expected-png/`.
set -euo pipefail

mode="${1:?usage: canonical-release-entrypoint.sh <evidence|refresh> [sealed-manifest] [output-directory]}"

node -e 'if (process.platform !== "linux" || process.arch !== "x64") throw new Error(`not canonical: ${process.platform}/${process.arch}`)'
node -e 'if (Number(process.versions.node.split(".")[0]) !== 24) throw new Error(`not canonical: node ${process.versions.node}`)'

if [ "$mode" = "refresh" ]; then
  output="${2:-/out}"
  npm run acceptance:refresh --silent
  mkdir -p "$output/baseline"
  cp acceptance/expected.json "$output/baseline/expected.json"
  cp -R acceptance/expected-png "$output/baseline/expected-png"
  echo "refreshed baselines written to $output/baseline"
  exit 0
fi

if [ "$mode" != "evidence" ]; then
  echo "unknown command: $mode" >&2
  exit 2
fi

manifest="${2:?usage: canonical-release-entrypoint.sh evidence <sealed-manifest> [output-directory]}"
output="${3:-/out}"
report="$output/tex-canonical-report.json"

docker version >/dev/null ||
  {
    echo "the Docker socket is not mounted; the sealed renderer cannot be spawned" >&2
    exit 1
  }

echo "--- golden acceptance environment gate"
npm run acceptance --silent

echo "--- canonical render through the sealed image"
node scripts/tex-canonical-render.mjs \
  --source docs/language/14-tex.aze.md \
  --output "$output/tex-canonical-render.html" \
  --image "docker.io/kkumaresan/aze-forge-tex-renderer@$(
    node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).image.digest)' "$manifest"
  )" \
  --renderer-manifest "$manifest"

echo "--- canonical projection report"
node scripts/tex-canonical-verify.mjs --renderer-manifest "$manifest" --output "$report"

node - "$report" "$manifest" <<'NODE'
const [reportPath, manifestPath] = process.argv.slice(2);
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const report = JSON.parse(readFileSync(reportPath, "utf8"));
const identity = `sha256:${createHash("sha256").update(readFileSync(manifestPath)).digest("hex")}`;
if (report.canonical !== true) throw new Error("the report is not marked canonical");
if (report.rendererIdentity !== identity) {
  throw new Error(`report identity ${report.rendererIdentity} does not match the sealed manifest ${identity}`);
}
process.stdout.write(`canonical evidence OK: ${identity}\n`);
NODE