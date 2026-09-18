# TeX renderer prerequisites

Aze Forge compiles the closed `tex` Technical object into self-contained SVG through a trusted renderer. Its approved profiles are `circuitikz` for circuit diagrams, `tikz` for custom vector figures, `pgfplots` for technical plots, `chemfig` for chemical structures, and `tikz-cd` for commutative diagrams.

`tex` is captionless and unnumbered. Its required `title` and `description` are unrestricted UTF-8 accessibility metadata, never visible captions. Use a `figure` wrapper when Figure numbering or a visible caption is required.

```azemark
:::: tex
id: optional-stable-id
title: Accessible title
description: Accessible description
profile: tikz
----
\draw (0,0) -- (1,1);
::::
```

The body is preserved after `----`, must be non-empty printable ASCII plus tabs/newlines, and is limited to 50,000 characters. Source rejects document/package declarations, filesystem/import commands, shell escape, and font selection; the profile-owned preamble and sandbox remain renderer responsibilities.

## Local authoring

The local wrapper is a reviewed opt-in path for authoring machines. It runs the
fixed-argv renderer image with a private tmpfs workspace, no network,
read-only root, dropped capabilities, `no-new-privileges`, one CPU, 512 MiB
memory, 64 processes, and a 15-second wall clock. Its result is always marked
`canonical:false`, including when an image digest matches a release manifest.

```bash
node scripts/tex-local-render.mjs \
  --source report.aze.md \
  --output report.html \
  --image aze-forge-tex-renderer:local \
  --renderer-manifest /tmp/tex-local.manifest.json
```

The local wrapper never executes a host TeX binary. It passes the profile-owned
TeX input on standard input to the image entrypoint; the entrypoint owns the
workspace, fixed TeX and dvisvgm argv, bounded logs and response, and
process-group cleanup.

## Server and CI deployment

Use only the canonical wrapper with the official image repository and the exact
digest named by the sealed release manifest:

```bash
node scripts/tex-canonical-render.mjs \
  --source report.aze.md \
  --output report.html \
  --image docker.io/kkumaresan/aze-forge-tex-renderer@sha256:befbadc886338638d5b2e6ac4e564a95c62bd47822f1118b226dee02deffad56 \
  --renderer-manifest release/tex-renderer-v1/tex-renderer-v1.manifest.json
```

It rejects every repository other than the official one, mutable tags, missing
manifest digest, and a digest mismatch. Its successful result is
`canonical:true`. Browser clients and the compiler never invoke TeX directly.

The canonical image disables shell escape and permits only its private
workspace. Each batch is capped at 15 seconds, one CPU, 512 MiB memory, 64
processes, 64 MiB workspace, 1 MiB request input, 8 MiB response output, and
4 MiB captured logs; hosts may lower, never raise, those limits. If a document
contains a `tex` Block and the renderer is unavailable, compilation emits an
actionable diagnostic and produces no Artifact. Documents without `tex` Blocks
do not require the renderer.

## Releasing the official renderer


`Dockerfile.tex-renderer` builds only for Linux/amd64. It requires the locally
retained `tex-renderer/texlive2026.iso` and verifies the TUG SHA-512 before
extracting it. The build compares the installed TeX Live closure with
`tex-renderer/package-closure.lock`, removes OS and TeX package-management
commands, and makes `/opt/texlive` read-only.

### Restoring the TeX Live ISO

The ISO is intentionally not stored in Git. Before building the renderer,
download the fixed release and verify it against the SHA-512 pinned in
`Dockerfile.tex-renderer`:

```bash
curl --fail --location --output tex-renderer/texlive2026.iso \
  https://tug.org/historic/systems/texlive/2026/texlive2026.iso
printf '%s  %s\n' \
  '4a9071bb567c3bdd6443378dedc8e485aea4a2f1203ec8ed7c17f6787093b9c37636a037032c0be63352e3d0bf98cf5616dab19fdcd7cb83f766b3e085b620ff' \
  tex-renderer/texlive2026.iso | sha512sum --check --strict
```

### Release procedure

1. Choose an OCI registry location and obtain permission to publish the image.
   Record its repository reference, for example
   `ghcr.io/aruzone/aze-forge-tex-renderer`.
2. Build the checked-out source for Linux/amd64 with the retained ISO. Run the
   renderer profile corpus and runtime-hardening checks against that image.
3. Publish that exact image. Copy the registry's OCI manifest digest as
   `IMAGE_DIGEST`. It must have the form `sha256:<64 lowercase hex characters>`.
   Do not use a mutable tag as release evidence.
4. Create evidence from the published digest. The collector rejects tags,
   extracts the installed TeX Live closure and font files from Linux/amd64,
   runs the five fixed profile fixtures, records the actual tool versions, and
   asks Docker Scout for an SPDX SBOM. It requires `docker scout sbom` and a
   human-maintained notices file:

   ```bash
   export IMAGE='docker.io/kkumaresan/aze-forge-tex-renderer@sha256:<published-image-digest>'

   node scripts/tex-release-evidence.mjs collect \
     --image "$IMAGE" \
     --output evidence \
     --notices <reviewed-notices-file> \
     --builder '<release-builder>' \
     --source-revision '<git-commit>'
   ```

   The output directory must not exist. The collector creates
   `texlive.tlpdb`, `packages.txt`, `corpus.json`, `tools.json`,
   `sbom.spdx.json`, `NOTICES`, `provenance.json`, `fonts/`, and
   `preambles/`. `provenance.json.imageDigest` equals the digest in `IMAGE`.
5. Complete GPL publication review. The review must name a durable,
   public corresponding-source URL and cover the generated SBOM and notices
   for CircuitikZ, dvisvgm, and PGFPlots.
6. Seal the release into a new output directory:

   ```bash
   node scripts/tex-release.mjs create \
     --input evidence \
     --output release/tex-renderer-v1 \
     --image-digest "$IMAGE_DIGEST" \
     --gpl-review gpl-review.json
   ```

   The command validates the evidence, writes the manifest, SBOM, notices,
   provenance, and GPL review once, then makes them read-only. It prints the
   manifest SHA-256 as `rendererIdentity`.
7. Run `scripts/tex-canonical-render.mjs` with the official image repository,
   published image digest, and sealed manifest. The result must report
   `canonical:true`, and its `rendererIdentity` must equal the SHA-256 of the
   manifest bytes. Comment with the image digest, release asset location,
   renderer identity, corresponding-source URL, and verification result, then
   close issue #97.

The collector creates machine-derived evidence. Do not replace its files with
test fixtures or guessed metadata. A human still supplies `NOTICES` and the
GPL publication review because those are legal review records.

`gpl-review.json` is review evidence, never a generated approval template. It
must have this shape:

```json
{
  "schema": "azeforge.tex-renderer.gpl-publication-review/v1",
  "imageDigest": "sha256:<published-image-digest>",
  "correspondingSource": "https://example.invalid/source-offer",
  "approvedBy": "Release reviewer",
  "approvedOn": "2026-09-17",
  "reviewedAssets": [
    "tex-renderer-v1.NOTICES",
    "tex-renderer-v1.provenance.json",
    "tex-renderer-v1.sbom.spdx.json"
  ]
}
```

## Web integration

`aze-forge-web` needs a renderer endpoint or container-job integration available to its compilation workers. Browser clients must never run TeX. The web application sends the authored TeX body, profile, title, and description to its trusted server-side compilation path, then serves only Aze Forge's final artifact.

The web deployment should treat TeX as an optional capability. Documents without `tex` Technical objects compile without this renderer. Documents with one require the pinned renderer before compilation begins.
