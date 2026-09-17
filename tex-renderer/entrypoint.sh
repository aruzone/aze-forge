#!/bin/sh
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
cleanup() { rm -rf "$workspace"; }
trap cleanup EXIT HUP INT TERM
# A new session lets timeout kill the entire TeX/dvisvgm process group. File
# limits cap the response and captured stderr at 8 MiB and 4 MiB respectively.
if setsid timeout --kill-after=1s 15s "$@" >"$workspace/stdout" 2>"$workspace/stderr"; then
  test "$(wc -c <"$workspace/stdout")" -le 8388608
  cat "$workspace/stdout"
else
  cat "$workspace/stderr" >&2
  exit 1
fi
