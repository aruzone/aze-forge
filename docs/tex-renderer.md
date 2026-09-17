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

Install the configured TeX toolchain and SVG converter on the machine running `azeforge`. The toolchain must include the packages required by the selected profile. Aze Forge invokes it only when the document contains a `tex` Technical object.

Use the project's pinned renderer version where reproducible output matters. A locally installed TeX distribution may produce different SVG after package or font updates.

To render a local Source file through a sealed release manifest, use the exact
digest the manifest records:

```bash
node scripts/tex-local-render.mjs \
  --source report.aze.md \
  --output report.html \
  --image registry.example/aze-forge-tex-renderer@sha256:<published-image-digest> \
  --renderer-manifest release/tex-renderer-v1.manifest.json
```

The image reference must end in the manifest's `image.digest`; the wrapper
refuses a mutable image tag for a sealed manifest. A scratch manifest without
`image.digest` may use `aze-forge-tex-renderer:local`, but its output is a
noncanonical visual smoke.

This repository does not ship a published renderer image or sealed manifest, so
there is no current value for `<published-image-digest>`. For an immediate local
visual smoke, create a scratch manifest and use the locally built tag:

```bash
printf '%s\n' '{"kind":"local-render-smoke"}' >/tmp/tex-local-smoke.manifest.json
node scripts/tex-local-render.mjs \
  --source report.aze.md \
  --output report.html \
  --image aze-forge-tex-renderer:local \
  --renderer-manifest /tmp/tex-local-smoke.manifest.json
rm /tmp/tex-local-smoke.manifest.json
```

## Server and CI deployment

Run the pinned Aze Forge TeX-renderer container beside the Aze Forge compiler, or start it as a short-lived job for each compilation. The compiler sends the `tex` profile body and accessibility metadata to that renderer and embeds the returned SVG.

Do not expose a host TeX installation directly to document compilation requests. The renderer container must:

- disable TeX shell escape;
- have no network access;
- read and write only its temporary workspace;
- enforce CPU, memory, output-size, and wall-clock limits;
- include only the approved packages for supported profiles; and
- pin the TeX Live, package, font, and SVG conversion versions.

If the configured renderer is unavailable, compilation of a document that contains a `tex` Technical object must fail with an actionable diagnostic. It must not fall back to the native Circuit renderer or omit the object.

## Releasing the official renderer

Issue #97 remains open until the image and its sealed release assets exist.
Rendering through a locally tagged image only checks the compiler integration.
It does not create a canonical renderer identity.

`Dockerfile.tex-renderer` builds only for Linux/amd64. It requires the locally
retained `tex-renderer/texlive2026.iso` and verifies the TUG SHA-512 before
extracting it. The build compares the installed TeX Live closure with
`tex-renderer/package-closure.lock`, removes OS and TeX package-management
commands, and makes `/opt/texlive` read-only.

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
7. Run `scripts/tex-local-render.mjs` with the published image pinned to
   `IMAGE_DIGEST` and the sealed manifest. The result must report
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
