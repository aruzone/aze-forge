#!/usr/bin/env bash
# Produce canonical TeX renderer evidence for one sealed release manifest
# without a GitHub runner. The whole check runs inside the canonical
# Linux/amd64 container (`Dockerfile.canonical`), and the sealed renderer image
# is spawned through the host's Docker socket exactly as the canonical wrapper
# does, so the evidence path matches a canonical x64 runner.
#
# Usage:
#   scripts/tex-canonical-release.sh [manifest] [output-directory]
#
# Defaults: release/tex-renderer-v2/tex-renderer-v1.manifest.json, artifacts/
#
# The container's equivalence to the canonical host is gated inside by the
# golden acceptance suite, which must reproduce the committed
# acceptance/expected.json hashes and acceptance/expected-png/ bytes. Expect
# several minutes of Chromium emulation on Apple silicon.
set -euo pipefail

cd "$(dirname "$0")/.."

manifest="${1:-release/tex-renderer-v2/tex-renderer-v1.manifest.json}"
output_dir="${2:-artifacts}"
test -f "$manifest" || {
  echo "missing sealed manifest: $manifest" >&2
  exit 2
}

digest="$(
  node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).image.digest)' "$manifest"
)"
case "$digest" in
  sha256:????????????????????????????????????????????????????????????????) ;;
  *) echo "the manifest does not pin an image digest: $manifest" >&2; exit 2 ;;
esac
image="docker.io/kkumaresan/aze-forge-tex-renderer@${digest}"

echo "--- canonical environment"
docker build --platform linux/amd64 -f Dockerfile.canonical -t aze-forge-canonical .
docker build --platform linux/amd64 -f Dockerfile.canonical-release -t aze-forge-canonical-release .

echo "--- sealed renderer image: ${image}"
docker pull "$image"

# The container runs as `runner`; the report is the only host-visible output.
mkdir -p "$output_dir"
chmod 0777 "$output_dir"

echo "--- canonical evidence"
# --privileged exists only for CI's own Chrome-sandbox sysctl; the socket mount
# is what lets the container spawn the sealed renderer image. Both are confined
# to this release tool, which runs repository-owned code only.
docker run --rm --privileged --platform linux/amd64 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v "$PWD/$output_dir:/out" \
  aze-forge-canonical-release "/repo/$manifest" /out

echo "canonical report: ${output_dir}/tex-canonical-report.json"