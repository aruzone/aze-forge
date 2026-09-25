# Producing canonical TeX renderer evidence

The canonical TeX acceptance needs a Linux/amd64 environment: byte-identical
normalized SVG across two corpus renders, PNG pixel identity, PDF byte
identity, and identical projections for all five approved profiles. A GitHub
runner is not required. This document is the procedure to follow on a Linux
machine (or inside the container harness on any Docker host).

Everything below is driven by the sealed release manifest for the current
renderer:

```text
manifest   release/tex-renderer-v2/tex-renderer-v1.manifest.json
digest     sha256:89386319c33f4e386289cfb4e79460a82946c255d0a344da1233e6d17a61e4e4
image      docker.io/kkumaresan/aze-forge-tex-renderer@sha256:89386319c33f4e386289cfb4e79460a82946c255d0a344da1233e6d17a61e4e4
identity   sha256:12d8fdb40b0b8632d5049476e8ff0c61b51731e2f4ff7ddc7afe1775a930ff25
profiles   circuitikz, tikz, pgfplots, chemfig, tikz-cd
```

`identity` is the SHA-256 of the manifest bytes, so it changes whenever the
manifest is re-sealed. Read it from the file rather than this page:

```bash
sha256sum release/tex-renderer-v2/tex-renderer-v1.manifest.json
```

## Option A — native Linux/amd64 host (preferred)

Fast, uncontroversial, and identical to what `.github/workflows/ci.yml` runs in
its `canonical` job. Ubuntu 24.04 x64 with Node 24 is the canonical host.

```bash
# 1. Toolchain
sudo apt-get update
sudo apt-get install -y docker.io git curl jq
node --version                       # must be 24.x

# 2. Source
git clone git@github.com:aruzone/aze-forge.git
cd aze-forge
git checkout main                    # or the release commit being evidenced

# 3. Dependencies, compiler, pinned browser
npm ci                               # downloads chrome-headless-shell 152.0.7977.75
npm run build --silent
npx puppeteer browsers install chrome-headless-shell@152.0.7977.75   # only if npm ci skipped it

# Ubuntu 24.04 restricts unprivileged user namespaces, which blocks Chrome's
# sandbox. CI applies this per-run; it is ephemeral host configuration.
sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0

# 4. The sealed renderer image
docker pull docker.io/kkumaresan/aze-forge-tex-renderer@sha256:89386319c33f4e386289cfb4e79460a82946c255d0a344da1233e6d17a61e4e4

# 5. Environment gate: the committed golden baselines must reproduce
npm run acceptance                   # exits 1 on any mismatch — stop if it fails
```

When step 5 fails only on `P0-OUT-002` cells, the committed baselines are stale
relative to the renderers: refresh them on this host, review, and commit before
going further — `npm run acceptance:refresh` prints one `DIFF` line per changed
field and rewrites `acceptance/expected.json` and `acceptance/expected-png/`
only. A refresh is a reviewed commit that belongs with the change that
invalidated the baselines; see "Rewriting the Golden baselines". Every other
`P0-OUT-002` symptom is a genuine environment mismatch and no report from that
run may be used.

Then produce the evidence:

```bash
MANIFEST=release/tex-renderer-v2/tex-renderer-v1.manifest.json
IMAGE=docker.io/kkumaresan/aze-forge-tex-renderer@sha256:89386319c33f4e386289cfb4e79460a82946c255d0a344da1233e6d17a61e4e4

node scripts/tex-canonical-render.mjs \
  --source docs/language/14-tex.aze.md \
  --output /tmp/tex-canonical-render.html \
  --image "$IMAGE" \
  --renderer-manifest "$MANIFEST"      # must print "canonical":true

node scripts/tex-canonical-verify.mjs \
  --renderer-manifest "$MANIFEST" \
  --output tex-canonical-report.json

jq -r '.canonical' tex-canonical-report.json        # must be true
```

## Option B — container harness on any Docker host

Use this on Apple silicon, where no x64 Linux machine is at hand. The whole
check runs inside the canonical image, and the sealed renderer image is spawned
through the host's Docker socket exactly as the canonical wrapper does.

```bash
git clone git@github.com:aruzone/aze-forge.git
cd aze-forge
node --version                       # any supported Node, host-side only

npm run test:canonical-tex           # sealed v2 manifest, writes artifacts/
# or, explicitly:
bash scripts/tex-canonical-release.sh \
  release/tex-renderer-v2/tex-renderer-v1.manifest.json artifacts
```

What the harness does:

1. builds `Dockerfile.canonical` (Ubuntu 24.04 x64 + Node 24 + the pinned
   browser) and `Dockerfile.canonical-release` (that image plus the Docker CLI);
2. pulls the digest the manifest pins;
3. runs `scripts/canonical-release-entrypoint.sh` inside the container, which
   refuses to continue outside Linux/x64 with Node 24, runs `npm run acceptance`
   as the environment gate, then runs the canonical render and the projection
   report, and finally requires the report to be `canonical:true` with a
   `rendererIdentity` equal to the SHA-256 of the sealed manifest.

Expect minutes to tens of minutes: Chromium renders run under amd64 emulation.
The run ends with `canonical evidence OK: sha256:…` and writes
`artifacts/tex-canonical-report.json` plus `artifacts/tex-canonical-render.html`.

Two conditions must hold before that line can be reached:

- The container's `runner` user must be able to reach the host Docker daemon.
  On Linux that means the release user is in the `docker` group, so the wrapper
  can read the socket's gid and pass it as `--group-add`; then a stock
  `root:docker` socket works without changing permissions. Docker Desktop grants
  the socket to root only, so there the entrypoint stops with
  `the sealed renderer cannot be spawned: docker is unreachable …` and the
  sealed renderer is never spawned. A TCP relay in front of the socket is not a
  substitute: `docker version` succeeds, but the interactive attach loses the
  batch stream and every TeX block fails with
  `azeforge.tex#protocol-invalid`. Use a Linux host whose socket is writable by
  the container user.
- The committed `acceptance/expected.json` and `acceptance/expected-png/` must
  be current, because the entrypoint runs `npm run acceptance` as its
  environment gate; a stale baseline fails the gate on every host (see
  "Rewriting the Golden baselines").

The container is `--privileged` (CI's own Chrome-sandbox sysctl) and holds
`/var/run/docker.sock` (to spawn the renderer image). Treat this harness as a
release tool that runs repository-owned code only.

## Rewriting the Golden baselines

`acceptance/expected.json` and `acceptance/expected-png/` may only be rewritten
on the canonical host, and a rewrite is a reviewed commit that belongs with the
change which invalidated the baselines.

On a native Ubuntu 24.04 x64 / Node 24 host the refresh rewrites the baselines
in place:

```bash
npm run acceptance:refresh                 # one "DIFF <cell>: <field> <old> -> <new>" line per changed field
git diff acceptance                        # review every changed hash and PNG byte
git add acceptance/expected.json acceptance/expected-png
git commit -m "acceptance: refresh the canonical Golden baselines"
npm run acceptance                         # regression: every check must be green again
```

The container harness writes them to `artifacts/baseline/` instead, because the
container's checkout is disposable:

```bash
npm run acceptance:refresh-canonical       # writes artifacts/baseline/
diff -u acceptance/expected.json artifacts/baseline/expected.json
cp artifacts/baseline/expected.json acceptance/expected.json
cp -R artifacts/baseline/expected-png/. acceptance/expected-png/
# review, then commit with the commands above
```

Emulated x64 (Docker Desktop on Apple silicon) passes the refresh host gate, but
its browser-derived bytes — PNG pixels, PDF/SVG/HTML bytes, pagination — are not
established as canonical, so treat that output as a preview; confirm it with
`npm run acceptance` on a native x64 host before committing.

The refresh is refused under CI and outside the canonical host (Linux/x64, Node
24, Ubuntu 24.04). Until the reviewed baselines are committed, the acceptance
report keeps failing its `P0-OUT-002` cells — that drift is exactly what the
`aze-forge-web` cutover clause refuses, and it is the one thing a code change
cannot fix.

## What a passing report means

`tex-canonical-report.json` carries `canonical`, `image`, `rendererIdentity`
and one entry per profile:

| Field | Requirement |
| --- | --- |
| `canonical` | `true` — only a Linux/x64 run may report this |
| `rendererIdentity` | equals the SHA-256 of the sealed manifest bytes |
| `rendererSvgSha256` | byte-identical across two corpus renders, and equal to the manifest's `corpus.fixtures[].outputHash` for that profile |
| `projectionSha256` | byte-identical across both renders |
| `png.artifactHash` | pixel-identical across two compilations |
| `pdfArtifactHash` | byte-identical across two compilations |

`tex-canonical-verify.mjs` asserts all of this plus: HTML and SVG carry the same
`<figure class="aze-tex" data-tex-profile="…">` projection, and each compilation
invokes TeX exactly once. It exits non-zero on the first failure and writes no
report.

The acceptance report is separate: `node scripts/acceptance.mjs --json` writes
one result per automated P0 catalog entry (51 today) — the runner's own Golden,
pagination, author-loop and determinism checks for the IDs it executes directly,
and the declared suite's outcome for the rest — so the cutover clause finds a
green automated entry in every family area.

Attach the report to the release record (issue #95 and the release procedure)
together with the image digest, the corresponding-source URL and the renderer
identity.

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| `"canonical": false` from a run you expected to be canonical | The host is not Linux/x64. That is expected on macOS/arm64 and is not release evidence. |
| `docker: command not found` inside the container | The Docker socket is not mounted; run through `scripts/tex-canonical-release.sh`. |
| `the sealed renderer cannot be spawned: docker is unreachable from this container` | The message quotes the daemon's own reason. On Docker Desktop for macOS that reason is `permission denied`: Docker Desktop serves the socket to root only, and `chmod`/`--group-add` do not change that. Run the harness on a Linux host. |
| the harness can reach the socket but the container is still refused on Linux | The release user is not in the socket's group, so the wrapper could not derive its gid: `sudo usermod -aG docker "$USER"`, re-login, and check `stat -c '%g' /var/run/docker.sock`. |
| `no matching manifest for linux/arm64/v8` while pulling the sealed image | The sealed image is linux/amd64 only, and a bare `docker pull` resolves the host platform on Apple silicon. `scripts/tex-canonical-release.sh` pins `--platform linux/amd64`. |
| every TeX block fails with `azeforge.tex#protocol-invalid` under a TCP socket relay | The relay passes `docker version` but truncates the interactive attach stream back to the container, so the renderer's response is empty. Do not relay the socket; give the container direct access to a writable socket. |
| `npm run acceptance` fails, or reports mismatched `png/*` cells | Either the baselines are stale (then refresh — see "Rewriting the Golden baselines") or the environment does not reproduce them (then check the Node major version, the pinned browser version and the OS/arch, and use no report from that run). |
| `REFUSE --refresh under CI: baselines are developer-only` | Re-baselining is a reviewed developer act. Run it by hand on the canonical host with `CI` unset; no CI job may rewrite the baselines. |
| `REFUSE --refresh outside Ubuntu 24.04 x64 with Node 24` | Run the refresh on a native canonical host, or through `npm run acceptance:refresh-canonical` on one. `--refresh` never rewrites anything anywhere else. |
| `azeforge.renderer#browser-unavailable` or a Chrome launch failure on Ubuntu 24.04 | Apply `sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0`. |
| Chrome or puppeteer cannot find the engine | `npx puppeteer browsers install chrome-headless-shell@152.0.7977.75`. |
| `Cannot connect to the Docker daemon` / I/O errors during a build | Docker's disk image is full or corrupt. `docker system prune -a` (and restart Docker Desktop on macOS). |
| A build takes forever and the host disk fills | The build context is shipping the 6.3 GB `tex-renderer/texlive2026.iso`. The canonical builds exclude it through `Dockerfile.canonical.dockerignore` and `Dockerfile.canonical-release.dockerignore`; do not delete `.dockerignore` for `Dockerfile.tex-renderer`, which does need the ISO. |
| `tex-canonical-verify.mjs --refresh` refuses to run | `--refresh` rewrites the golden baselines and is refused outside the canonical host. Never use it to produce evidence. |

## Do not use as evidence

- A report from any non-Linux/x64 host, even when the profile hashes match
  (the PNG and PDF hashes come from the host's browser).
- `--local` runs: they validate a candidate image against the sealed corpus
  hashes before publishing, and are always `canonical:false`.
- A `canonical:true` report whose `rendererIdentity` does not equal the SHA-256
  of the sealed manifest bytes.
