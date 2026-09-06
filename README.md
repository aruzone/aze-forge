<p align="center">
  <img src="docs/assets/azeforge-logo-03-2.jpg" alt="AzeForge" width="160">
</p>

<h1 align="center">AzeForge</h1>
Write once in readable **AzeMark**, publish everywhere: deterministic,
self-contained **HTML**, **SVG**, **PNG**, and **PDF** from a single Source —
no build chain, no runtime dependencies in your output.

- **Deterministic.** The same Source always produces byte-identical
  Artifacts. Every Artifact carries the content hash of the Document it
  represents, so you can prove what you published.
- **Self-contained.** Fonts are embedded, scripts are never emitted, and
  Artifacts phone home to nothing. Send the file; it renders as-is.
- **Fail-closed.** Invalid Sources produce precise, ranged diagnostics —
  never a half-written Artifact, never a stack trace.
- **Offline math.** Equations render through a pinned, sandboxed KaTeX
  bundle. Readable aliases cover Greek, fractions, sums, integrals, limits,
  matrices, and more; raw LaTeX stays denied unless you explicitly opt in.
- **Diagrams included.** Mermaid flowcharts, GFM-style tables, and callouts
  are first-class Blocks rendered through a pinned browser engine.

## Install

```bash
npm install -g @aruzone/aze-forge
azeforge --help
```

Requires Node.js 22 or 24 on Ubuntu or macOS (Windows support is parked).
The install fetches a pinned browser engine for diagrams and visual formats;
on npm 11+ allow its install script once:

```bash
npm install -g @aruzone/aze-forge --allow-scripts=puppeteer
```

Details, offline installs, and uninstall live in
[docs/development.md](docs/development.md#browser-engine-and-offline-installs).

## Try it: your first document

Create a Source file — plain Markdown with a small front matter header:

```bash
cat > hello.aze.md <<'EOF'
---
azemark: 1
title: Hello AzeForge
author:
  - Test Author
theme: default
---

# Introduction

This document tests the current compiler.
EOF
```

Validate it (silence means valid) and render it:

```bash
azeforge validate hello.aze.md && echo VALID
azeforge render hello.aze.md --output hello.html && open hello.html
```

## Try it: equations

Readable math — no LaTeX required:

```bash
cat > equation.aze.md <<'EOF'
---
azemark: 1
title: Equation check
---

::::: equation
id: euler

F(omega) = integral x=0..infinity of x^2 dx
:::::
EOF

azeforge render equation.aze.md --output equation.html
```

Need raw LaTeX? It is denied by default and opt-in per command:

```bash
azeforge validate equation.aze.md --allow-raw-latex && echo ALLOWED
```

## Try it: tables and callouts

```bash
cat > blocks.aze.md <<'EOF'
---
azemark: 1
title: Blocks
---

::::: callout
variant: note
title: Determinism note

Callout bodies parse ordinary Markdown, including nested equations.
:::::

::::: table
caption: Thermal properties
id: materials

| material | density [kg/m^3] | conductivity [W/(m K)] |
| :--- | :---: | ---: |
| Aluminum | 2700 | 205 |
| Steel | 7850 | 50 |
:::::
EOF

azeforge render blocks.aze.md --output blocks.html
```

## Try it: diagrams

Mermaid flowcharts render through the pinned browser engine:

```bash
cat > diagram.aze.md <<'EOF'
---
azemark: 1
title: Diagram
---

:::::: mermaid
id: flow
title: Measurement flow

flowchart LR
  start[Start] --> inspect[Inspect setup]
  inspect --> done[Done]
::::::
EOF

azeforge render diagram.aze.md --output diagram.html
```

## Try it: every format and theme

One Source, four Artifacts, three themes (`default`, `academic`,
`dark-presentation`):

```bash
for format in html svg png pdf; do
  azeforge render hello.aze.md --output "hello.${format}"
done
azeforge render hello.aze.md --output hello-academic.html --theme academic
```

Artifacts embed their fonts and contain no scripts:

```bash
grep -o 'data:font/woff2;base64' hello.html | sort -u
grep -i '<script' hello.html || echo "no scripts"
```

## Try it: machine diagnostics

One JSON report on stdout, human text on stderr:

```bash
azeforge validate hello.aze.md --diagnostics json
```

Break something and watch it fail closed — exit `1`, previous Artifact
untouched:

```bash
printf -- '---\nazemark: 2\n---\n\nUnsupported.\n' > invalid.aze.md
printf 'previous Artifact' > preserved.html
azeforge render invalid.aze.md --output preserved.html; echo "exit: $?"
cat preserved.html
```

## Try it: live rebuild and preview

Recompile on every save, or preview in a loopback browser tab:

```bash
azeforge watch hello.aze.md --output hello.html
azeforge serve hello.aze.md --port 0
# serve: listening on http://127.0.0.1:62545/ for hello.aze.md
```

`watch` preserves the last successful Artifact through failed cycles; `serve`
binds loopback only and never shows stale content. Stop either with
`SIGINT` or `SIGTERM`.

## Try it: prove determinism

Render twice; the bytes — and their hashes — must match exactly:

```bash
azeforge render hello.aze.md --output hello-first.html
azeforge render hello.aze.md --output hello.html
cmp hello-first.html hello.html && echo IDENTICAL
shasum -a 256 hello-first.html hello.html
```

## Commands

| Command        | Purpose                                              |
| -------------- | ---------------------------------------------------- |
| `render`       | Compile a Source to `html`, `svg`, `png`, or `pdf`   |
| `validate`     | Check a Source; silent success, ranged diagnostics   |
| `format`       | Canonical LF/UTF-8 formatting (`--write`, `--check`) |
| `watch`        | Recompile on save, preserving last good Artifact     |
| `serve`        | Loopback live preview with reload                    |
| `capabilities` | Supported commands, formats, engines (`--probe`)     |
| `version`      | Tool, runtime, and schema versions (`--json`)        |

Exit statuses: `0` success (including warning-only validation), `1` the
operation was accepted but the Source failed, `2` the invocation itself was
malformed. Run `azeforge <command> --help` for full options.

## Uninstall

```bash
npm uninstall -g @aruzone/aze-forge
rm -rf ~/.cache/puppeteer  # optional: remove the downloaded browser engine
```

## Contribute

Development setup, the test seams, the acceptance runner, and the release
process are in [docs/development.md](docs/development.md). AzeForge is
[MIT](LICENSE)-licensed.
