#!/usr/bin/env bash
# Runs inside `aze-forge-canonical-release` (Linux/amd64, Node 24). Produces the
# canonical TeX renderer evidence and refuses to report success unless the
# environment gate, the report flag, and the renderer identity all hold.
set -euo pipefail

manifest="${1:?usage: canonical-release-entrypoint.sh <sealed-manifest> [output-directory]}"
output="${2:-/out}"
report="$output/tex-canonical-report.json"

node -e 'if (process.platform !== "linux" || process.arch !== "x64") throw new Error(`not canonical: ${process.platform}/${process.arch}`)'
node -e 'if (Number(process.versions.node.split(".")[0]) !== 24) throw new Error(`not canonical: node ${process.versions.node}`)'
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