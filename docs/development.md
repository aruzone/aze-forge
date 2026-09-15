# Development

Contributor and release notes for AzeForge. End users start at the
[README](../README.md); what follows is the checkout workflow.

## Build

Requires Node.js 22 or newer. Supported releases run on Node.js 22 and 24
(Ubuntu, macOS); Windows support is parked until platform-specific
verification lands (see issue #43). Canonical HTML/SVG/PNG/PDF golden and
visual evidence is built on pinned Ubuntu x64 with Node 24.
`azeforge capabilities --json` reports the exact support matrix under
`runtime`.

```bash
npm install
npm run build
```

Invoke the checkout build directly:

```bash
node dist/cli.js --help
```

To expose the `azeforge` command globally from this checkout, run `npm link`.
Prefer the published install (`npm install -g @aruzone/aze-forge`) when
testing the consumer path.

## Automated checks

```bash
npm run typecheck
npm test
```

`npm test` rebuilds `dist/` and runs the full suite (`test/*.test.mjs`).
Bare `node --test` reuses the last build, so rebuild after editing `src/`.
Target one layer while working:

```bash
npm run build
npm run test:compiler
npm run test:cli
npm run test:matrix
npm run test:browser-smoke
npm run test:canonical-suite
npm run test:canonical
node --test test/equation.test.mjs
```

- `test:matrix` is the browser-independent unit, schema, and installed-CLI
  compatibility seam.
- `test:browser-smoke` invokes the packaged pinned engine.
- `test:canonical-suite` and `test:canonical` own Golden report and visual
  evidence and are authoritative only on Ubuntu 24.04 x64 with Node 24.
- `test:canonical-local` runs those two suites in a local Docker replica
  of the canonical CI job (`Dockerfile.canonical`, Ubuntu 24.04 x64 +
  Node 24). The acceptance `--refresh` host gate passes inside the
  container. On ARM64 hosts Docker emulates x64: semantic evidence is
  green, but byte-identical PNG/fingerprint evidence and the pinned
  mermaid render timeouts do not reproduce under emulation — those
  cells still need real x64 (CI) before they count as canonical.
- `test/equation.test.mjs` is the equation seam: versioned Blocks, alias
  coverage, ranged diagnostics, raw-LaTeX policy, adapter failure modes,
  registry rejection, descriptor conformance, and real CLI calls.
- `test/native-math.test.mjs` is the closed native mathematics grammar
  seam: precedence, binders, constructs, normalization, identity
  projections, stable sub-ranged diagnostics, and ceilings.
- `test/derivation.test.mjs` is the derivation seam: ordered
  `- expression:` step records with annotations and aligned rendering.
- `test/plot.test.mjs` is the plots and data charts seam: bounded evaluable
  expressions, exact-decimal canonicalization, gap/asymptote sampling,
  bar-family binning, stable diagnostics, quantized deterministic SVG, and
  the plot capabilities engine.
- The general diagrams family has one seam per layer, because the layers are
  independently replaceable: `test/diagram-block.test.mjs` (the authored
  grammar, the diagnostic registry and the ceiling matrix),
  `test/diagram-layout.test.mjs` (pinned-elkjs graph projection, totality and
  determinism), `test/diagram-render.test.mjs` (the SVG emitter, positional
  ids, escaping and terminators), and `test/diagram.test.mjs` (the compiler
  path: two-pass reference resolution, mode-scoped warnings, content identity
  across Themes and formats, and the three contract scenarios).
- The software and data models family has one seam per layer, because the
  layers are independently replaceable: `test/models-block.test.mjs` (the four
  directive grammars — `sequence`, `state`, `entity`, `class` — with their
  diagnostic namespaces and per-kind ceilings), `test/models-layout.test.mjs`
  (deterministic per-kind geometry: figure containment, fragment-tab and
  label clearance, composite nesting, route avoidance and marker ends),
  `test/models-render.test.mjs`
  (the SVG emitter, intrinsic sizing from the advance metric, positional ids,
  escaping and terminators), and `test/models.test.mjs` (the compiler path:
  per-scope activation balance, per-scope state reachability, reference
  resolution, key and inheritance checks, content identity across Themes and
  formats, and the four contract scenarios).
- `test/advance-metric.test.mjs` is the Advance metric seam: the generated
  character-advance table over both pinned font packages, its
  uncovered-code-point rule, and the script scale that sizes diagram boxes
  without parsing a font at runtime.

## Acceptance runner

```bash
node scripts/acceptance.mjs [--json] [--refresh]
AZEFORGE_CLI=azeforge node scripts/acceptance.mjs [--json]
```

`AZEFORGE_CLI` points the runner at a consumer install on `PATH` instead of
the checkout build, so the acceptance gate runs identically post-install.
`--refresh` rewrites `acceptance/expected.json` with the current live
evidence; it is developer-only and refuses under CI.

The Golden report (`acceptance/golden-report.aze.md`) is the P0 corpus: every
approved native family authors its contract scenario there, and `P0-OUT-001`
proves each one reaches HTML, SVG, PNG, and PDF under all three Themes. Editing
the Golden report always invalidates the committed baselines, so the change and
its reviewed `--refresh` run belong in one commit, made on the canonical host —
an unrefreshed Golden edit leaves `test:canonical` red.

## Browser engine and offline installs

Browser-backed formats (`svg`, `png`, `pdf`, Mermaid diagrams) need the
pinned Chrome Headless Shell (`152.0.7977.75` under `~/.cache/puppeteer`),
normally fetched by the `puppeteer` postinstall at install time. npm 11+
skips install scripts on global installs unless allowed
(`--allow-scripts=puppeteer`). Without the engine those formats fail with
exit `1` and a structured `azeforge.renderer#browser-unavailable` (or
`adapter-missing`) diagnostic suggesting `Reinstall AzeForge browser
dependencies and retry` — never a stack trace. Plain-HTML rendering without
diagrams keeps working. Remedy: re-install with network access, or fetch
only the engine with
`npx puppeteer browsers install chrome-headless-shell@152.0.7977.75`.

Probe failure handling by hand: an unsupported `azemark` version must report
`azeforge.source#version-unsupported`, exit `1`, and leave a pre-seeded
Artifact untouched; raw HTML must report
`azeforge.security#raw-html-disabled` and never render the markup. Repeat the
probes with CRLF line endings and a BOM prefix; diagnostic ranges, columns,
and offsets must still line up in the `--diagnostics json` report.

## Release

`TOOL_VERSION` in `src/tool-version.ts` is the single source of truth for the
CLI version and must match `package.json` in the same change. Breaking
library changes during `0.x` require a minor-version increment; the
`exports` map in `package.json` is the only public import surface
(`@aruzone/aze-forge`, `/contracts`, `/adapters`) — implementation helpers
must never be re-added to it. `schemas.test.mjs` checks every packaged
schema is byte-identical to its public export, and the packed
entry-point consumer test in `installed-cli.test.mjs` resolves all three
package paths and denies deep imports. To release:

```bash
npm version patch --no-git-tag-version  # or minor
# sync src/tool-version.ts to the same version
npm run typecheck && npm test
git commit -am "chore: release 0.2.0"
git tag v0.2.0
npm publish --access public --otp=<code>  # 2FA or bypass-2FA token required
git push origin main v0.2.0
```

`prepublishOnly` rebuilds gitignored `dist/` so no publish can ship a stale
build. Tag pushes also trigger `publish.yml` (tag↔version assert, suite,
`npm publish --provenance`); it needs the `NPM_TOKEN` repo secret and
runners that can actually boot. The registry rejects republishing a version,
so every publish — docs-only included — takes a new number.
