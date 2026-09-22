#!/usr/bin/env bash
# Produce canonical TeX renderer evidence, or rewrite the Golden baselines, for
# a release without a GitHub runner. The whole check runs inside the canonical
# Linux/amd64 container (`Dockerfile.canonical`), and the sealed renderer image
# is spawned through the host's Docker socket exactly as the canonical wrapper
# does, so the evidence path matches a canonical x64 runner.
#
# Usage:
#   scripts/tex-canonical-release.sh [manifest] [output-directory]
#   scripts/tex-canonical-release.sh --refresh [output-directory]
#
# Defaults: release/tex-renderer-v2/tex-renderer-v1.manifest.json, artifacts/
#
# `--refresh` runs the developer-only baseline refresh on the canonical host and
# leaves the rewritten `acceptance/expected.json` and `acceptance/expected-png/`
# in `<output-directory>/baseline/` for review: a re-baseline is a reviewed
# commit, never an automatic write into the checkout.
#
# The container's equivalence to the canonical host is gated inside by the
# golden acceptance suite, which must reproduce the committed
# acceptance/expected.json hashes and acceptance/expected-png/ bytes. Expect
# several minutes of Chromium emulation on Apple silicon.
set -euo pipefail

cd "$(dirname "$0")/.."

mode="evidence"
if [ "${1:-}" = "--refresh" ]; then
  mode="refresh"
  shift
fi

if [ "$mode" = "refresh" ]; then
  manifest=""
  output_dir="${1:-artifacts}"
else
  manifest="${1:-release/tex-renderer-v2/tex-renderer-v1.manifest.json}"
  output_dir="${2:-artifacts}"
fi
image=""
if [ "$mode" = "evidence" ]; then
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
fi

echo "--- canonical environment"
docker build --platform linux/amd64 -f Dockerfile.canonical -t aze-forge-canonical .
docker build --platform linux/amd64 -f Dockerfile.canonical-release -t aze-forge-canonical-release .

if [ "$mode" = "evidence" ]; then
  echo "--- sealed renderer image: ${image}"
  docker pull "$image"
fi

# The container runs as `runner`; its output directory is the only host-visible
# write.
mkdir -p "$output_dir"
chmod 0777 "$output_dir"

# --privileged exists only for CI's own Chrome-sandbox sysctl; the socket mount
# is what lets the container spawn the sealed renderer image. Both are confined
# to this release tool, which runs repository-owned code only.
run_container() {
  docker run --rm --privileged --platform linux/amd64 \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v "$PWD/$output_dir:/out" \
    aze-forge-canonical-release "$@"
}

if [ "$mode" = "refresh" ]; then
  echo "--- canonical baseline refresh"
  run_container refresh /out
  echo "refreshed baselines: ${output_dir}/baseline — review, then copy them into acceptance/"
else
  echo "--- canonical evidence"
  run_container evidence "/repo/$manifest" /out
  echo "canonical report: ${output_dir}/tex-canonical-report.json"
fi