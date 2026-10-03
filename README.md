<p align="center">
  <img src="docs/assets/azeforge-logo-transparent.png" alt="AzeForge" width="160">
</p>

<h1 align="center">AzeForge</h1>

<p align="center"><strong>AzeMark: one language for technical notation.</strong></p>

AzeMark is the readable, typed language for technical Source. AzeForge validates
that Source and compiles self-contained **HTML**, **SVG**, **PNG**, and **PDF**
Artifacts.

<p align="center">
  <a href="https://azeforge.com/docs/0.6.4/">Documentation</a> ·
  <a href="https://azeforge.com/playground">Playground</a> ·
  <a href="#install">Install</a>
</p>

The hosted playground requires an access token. Use `azeforge serve` for a
local browser preview.

AzeForge is a deterministic technical publishing compiler. No build chain or
runtime dependencies travel with the output.

**Reproducible by design.** Same source. Same Artifact. Every time.

**Readable by humans. Generatable by AI.** AzeMark is simple enough to edit,
and its published machine-readable grammar gives generators a constrained
target.

- **Deterministic.** The same Source produces byte-identical Artifacts. Every
  Artifact carries the content hash of the Document it represents.
- **Self-contained.** Fonts are embedded, scripts are never emitted, and
  Artifacts make no network requests.
- **Fail-closed.** Invalid Source produces precise, ranged diagnostics. It
  never overwrites an Artifact with partial output or a stack trace.
- **Native technical notation.** Typed AzeMark Blocks preserve domain meaning
  and report domain-specific diagnostics.
- **Diagrams included.** Native `diagram` Blocks cover flowcharts, graphs,
  trees, and architecture diagrams. Bounded Mermaid Blocks render through a
  pinned browser engine.

## Native AzeMark families

| Family | Native Blocks |
| --- | --- |
| Math | `equation`, `derivation` |
| Science | `formula`, `reaction`, `structure` |
| Engineering | `circuit`, `timing`, `control`, `free-body` |
| Data | `plot`, `chart` |
| Geometry | `geometry` |
| Software | `sequence`, `state`, `entity`, `class` |
| Documents | `table`, `algorithm`, `statement`, `example`, `bibliography` |
| General diagrams | `diagram` |

`figure` and `callout` compose document content. Mermaid is a bounded escape
hatch, rather than a native technical family. See the
[native plugin family tree](docs/native-plugin-family-tree.md) for the detailed
catalog and family relationships.

## AzeMark and LaTeX

Native equations start as readable AzeMark notation. The compiler parses and
validates that notation, derives TeX deterministically, then renders it with a
pinned KaTeX bundle that produces HTML and MathML. Raw LaTeX in equations is
denied unless the command opts in with `--allow-raw-latex`.

For specialist figures, explicit `tex` Blocks support controlled `circuitikz`,
`tikz`, `pgfplots`, `chemfig`, and `tikz-cd` profiles. A deployment configures
the trusted TeX renderer. The author supplies only the figure body, not an
arbitrary TeX document or package list.

## How AzeForge compares

This is a capability comparison, not a benchmark. AzeForge check marks mean
built-in, typed AzeMark support. Other columns name their usual authoring or
extension path.

| Capability | AzeForge | Typst | Quarto | LaTeX |
| --- | :---: | :---: | :---: | :---: |
| Markdown-like authoring | ✓ | — | ✓ | — |
| Mathematics | ✓ | ✓ | ✓ | ✓ |
| Mermaid diagrams | ✓ | extensions | ✓ | tooling |
| Technical-domain diagrams | native typed Blocks | packages | external extensions | packages |
| Published JSON directive grammar | ✓ | — | — | — |
| Compiler npm API | ✓ | different ecosystem | — | — |
| Local live preview | ✓ | web app | editor integrations | tooling or Overleaf |
| Self-contained HTML, SVG, PNG, and PDF | ✓ | varies by output | varies by output | usually PDF |

## Install

```bash
npm install -g @aruzone/aze-forge
azeforge --help
```

Both the registry tarball and a Git spec (`npm install -g aruzone/aze-forge`)
ship a prebuilt `dist/`.

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
azemark: 2
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
azemark: 2
title: Equation check
---

:::: equation
id: euler
----
F(omega) = integral x=0..infinity of x^2 dx
::::
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
azemark: 2
title: Blocks
---

:::: callout
variant: note
title: Determinism note
----
Callout bodies parse ordinary Markdown, including nested equations.
::::

:::: table
caption: Thermal properties
id: materials
----
columns:
  - key: material
    name: Material
  - key: density
    name: Density [kg/m^3]
    type: quantity
    unit: kg/m^3
  - key: conductivity
    name: Conductivity [W/(m K)]
    type: quantity
    unit: W/(m K)
rows:
  - material: Aluminum
    density: 2700
    conductivity: 205
  - material: Steel
    density: 7850
    conductivity: 50
::::
EOF

azeforge render blocks.aze.md --output blocks.html
```

## Try it: diagrams

Mermaid flowcharts render through the pinned browser engine:

```bash
cat > diagram.aze.md <<'EOF'
---
azemark: 2
title: Diagram
---

:::: mermaid
id: flow
title: Measurement flow
----
flowchart LR
  start[Start] --> inspect[Inspect setup]
  inspect --> done[Done]
::::
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

See [Themes and native figure colour](docs/themes.md) for built-in tokens,
custom Theme registration, and native figure rendering policy.

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
printf -- '---\nazemark: 2\n---\n\n:::: mystery\nbody\n::::\n' > invalid.aze.md
printf 'previous Artifact' > preserved.html
azeforge render invalid.aze.md --output preserved.html; echo "exit: $?"
cat preserved.html
```

## Try it: ask what the language accepts

`azeforge grammar` publishes every registered directive as data — header keys,
body records, field vocabularies, ceilings — derived from the same tables the
validators use, so it cannot drift from what compiles:

```bash
azeforge grammar --json | jq '.directives | length'
# 26
azeforge grammar --json --directive plot | jq -c '.directives[0].header.fields | map(.key)'
# ["id","number","width","height","legend","grid","parameters","x-axis","y-axis"]
azeforge grammar --json --directive plot | jq -c '[.directives[0].body.records[].kind]'
# ["function","line","scatter"]
azeforge version --json | jq -c '.schemas[] | select(.id=="azeforge.grammar/v1")'
# {"id":"azeforge.grammar/v1","version":1}
```

`--directive <type>` narrows the report to one directive and an unknown type
exits `2`; without `--json` the human report goes to stderr and stdout stays
empty. The JSON document validates against the packaged
`schemas/grammar.json`.

For human-facing explanations and compile-verified examples, start with the
[AzeMark authoring guide](docs/language/00-authoring-azemark.aze.md). The
[language documentation index](docs/language/README.md) links one guide per
capability family, and the [directive grammar reference](docs/language/directive-reference.md)
lists every field and limit from the same grammar report.

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
| `grammar`      | Machine-readable AzeMark 2 directive grammar         |
| `version`      | Tool, runtime, and schema versions (`--json`)        |

Exit statuses: `0` success (including warning-only validation), `1` the
operation was accepted but the Source failed, `2` the invocation itself was
malformed. Run `azeforge <command> --help` for full options.

## Library

The published package exposes exactly three supported entry points; only
documented exports are supported, and implementation helpers are not
reachable through the package (deep imports resolve to nothing):

| Entry point | Responsibility |
| --- | --- |
| `@aruzone/aze-forge` | `createCompiler`, high-level compiler operations, and `buildGrammarDocument` |
| `@aruzone/aze-forge/contracts` | Public types, JSON schemas and schema identifiers, without Node-only imports or engine initialization |
| `@aruzone/aze-forge/adapters` | Trusted registry/adapter contracts and the root-confined filesystem asset adapter |

```js
import { createCompiler, buildGrammarDocument } from "@aruzone/aze-forge";
import { createVersionReport, GRAMMAR_SCHEMA_ID } from "@aruzone/aze-forge/contracts";
import { getBuiltInRegistry } from "@aruzone/aze-forge/adapters";
```

The runtime compiler is Node-oriented; a browser-safe `contracts` entry
does not promise browser compilation. Breaking library changes during
`0.x` require a minor-version increment; AzeForge Web pins the exact
published version.

## Uninstall

```bash
npm uninstall -g @aruzone/aze-forge
rm -rf ~/.cache/puppeteer  # optional: remove the downloaded browser engine
```

## Contribute

Development setup, the test seams, the acceptance runner, and the release
process are in [docs/development.md](docs/development.md). AzeForge is
[MIT](LICENSE)-licensed.
