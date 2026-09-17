#!/bin/bash
set -eu

# The host supplies read-only rootfs, no network, dropped capabilities,
# no-new-privileges, and no host mounts. The image enforces per-batch limits.
ulimit -t 15
ulimit -v 524288
ulimit -u 64
ulimit -f 16384
umask 077
export HOME=/tmp
export TEXMFHOME=/tmp/texmf
export TEXMFVAR=/tmp/texmf-var
export openout_any=p
export openin_any=p

workspace=$(mktemp -d /tmp/azeforge-tex.XXXXXX)
cleanup() {
  if test -n "${renderer_pid:-}"; then kill -TERM -- "-$renderer_pid" 2>/dev/null || true; wait "$renderer_pid" 2>/dev/null || true; fi
  rm -rf "$workspace"
}
trap cleanup EXIT
trap 'exit 128' HUP INT TERM

cd "$workspace"
head -c 1048577 > figure.tex
if test "$(wc -c < figure.tex)" -gt 1048576; then
  printf '%s\n' "TeX request exceeds the 1 MiB renderer limit." >&2
  exit 1
fi

# A single session contains the entire fixed pipeline. GNU timeout terminates
# that managed process group on expiry; the file-size limit bounds the source,
# intermediate files, SVG, and combined TeX log.
setsid timeout --kill-after=1s 15s bash -c '
  latex -interaction=nonstopmode -halt-on-error -no-shell-escape -output-format=dvi figure.tex &&
  dvisvgm --page=1 --no-fonts=1 --precision=6 --output=output.svg figure.dvi
' >"$workspace/log" 2>&1 &
renderer_pid=$!
if ! wait "$renderer_pid"; then
  head -c 4194304 "$workspace/log" >&2
  exit 1
fi

test "$(wc -c < output.svg)" -le 8388608
cat output.svg
