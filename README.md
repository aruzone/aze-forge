# AzeForge

AzeForge currently compiles AzeMark prose into deterministic, self-contained HTML. This README documents the first CLI tracer bullet. Broader product documentation will replace it later.

## Supported syntax

- AzeMark v1 YAML front matter
- ATX headings such as `# Heading`
- Setext headings
- paragraphs
- plain inline text
- equation directive Blocks (readable aliases plus trusted-local raw LaTeX)

Readable equation example:

```text
:::: equation
id: euler
number: true
align: center

F(omega) =
  integral t=-infinity..infinity of
  f(t) exp(-i omega t) dt
::::
```

Header attributes are `id`, `number: true|false`, `align: left|center|right`,
and `syntax: readable|latex` (default `readable`). Readable aliases cover
Greek letters, `sqrt`/`frac`/`root`, `sum`/`product`, `integral`, `limit`,
derivatives, `matrix`, `cases`, and relations/sets; they render through
pinned KaTeX (`0.18.5`, offline `htmlAndMathml`, `trust: false`, bounded,
sanitized). Raw LaTeX is denied by default with
`azeforge.security#raw-latex-disabled` and renders only with
`--allow-raw-latex` on `validate` or `render`:

```text
:::: equation
syntax: latex

\frac{a}{b}
::::
```

Directive envelopes are recovered as `InvalidBlock` values until Plugins are registered. Raw HTML is denied and never rendered as text or markup. Lists, Mermaid, images, and other Markdown constructs are not implemented yet.

## Build

The project requires Node.js 22 or newer.

```bash
npm install
npm run build
```

The examples below invoke the built CLI directly:

```bash
node dist/cli.js
```

To expose the `azeforge` command globally from this checkout, run `npm link`.

## Create a Source file

```bash
cat >/tmp/manual.aze.md <<'EOF'
---
azemark: 1
title: Manual AzeForge test
author:
  - Test Author
theme: default
outputs:
  - html
---

# Introduction

This document tests the current compiler.

Results
-------

The render is deterministic.
EOF
```

## Validate

```bash
node dist/cli.js validate /tmp/manual.aze.md
echo $?
```

A valid Source produces no stdout or stderr and exits with status `0`.

Add `--diagnostics json` to `validate` or file-targeted `render` to emit exactly one `azeforge.diagnostics/v1` report on stdout. The package exports `diagnosticsJsonSchema` for JSON Schema 2020-12 validation. Human diagnostics remain on stderr.

## Format Source

```bash
# Write LF-formatted UTF-8 Source to stdout.
node dist/cli.js format /tmp/manual.aze.md

# Atomically replace a file.
node dist/cli.js format /tmp/manual.aze.md --write

# Emit no Source; exit 1 only when formatting is required.
node dist/cli.js format /tmp/manual.aze.md --check

# Stdin is explicit; `-` is not an alias.
cat /tmp/manual.aze.md | node dist/cli.js format --stdin
```

Formatting removes a leading BOM, emits LF line endings, preserves comments,
unknown directive bodies, invalid regions, and denied raw content, and writes
nothing when structural syntax is ambiguous. `--write` rejects stdin, and
`--write` and `--check` cannot be combined.

## Render to a file

```bash
node dist/cli.js render \
  /tmp/manual.aze.md \
  --output /tmp/manual.html

echo $?
open /tmp/manual.html
```

A successful render exits with status `0` and atomically replaces `/tmp/manual.html`.

Check that the Artifact embeds its fonts and contains no scripts:

```bash
grep -o 'data:font/woff2;base64' /tmp/manual.html | sort -u
grep -i '<script' /tmp/manual.html
```

The first command prints `data:font/woff2;base64`. The second prints nothing.

## Render to stdout

```bash
node dist/cli.js render \
  /tmp/manual.aze.md \
  --stdout \
  --format html \
  >/tmp/manual-stdout.html

cmp /tmp/manual.html /tmp/manual-stdout.html
echo $?
```

`cmp` produces no output and exits with status `0`.

## Check deterministic output

```bash
cp /tmp/manual.html /tmp/manual-first.html

node dist/cli.js render \
  /tmp/manual.aze.md \
  --output /tmp/manual.html

cmp /tmp/manual-first.html /tmp/manual.html
shasum -a 256 /tmp/manual-first.html /tmp/manual.html
```

The files must be byte-identical and have the same SHA-256 value.

The HTML also records the semantic content hash:

```bash
grep -o 'name="azeforge-content-hash" content="sha256:[^"]*"' \
  /tmp/manual.html
```

## Check failure handling

```bash
cat >/tmp/invalid.aze.md <<'EOF'
---
azemark: 2
---

This version is unsupported.
EOF

printf 'previous successful Artifact' >/tmp/preserved.html

node dist/cli.js render \
  /tmp/invalid.aze.md \
  --output /tmp/preserved.html

echo "exit: $?"
cat /tmp/preserved.html
```

The command reports `azeforge.source#version-unsupported`, exits with status `1`, and leaves the previous Artifact unchanged.

CLI exit statuses:

- `0`: the operation succeeded, including warning-only validation
- `1`: an accepted operation failed on Source or component diagnostics
- `2`: arguments or options could not form an operation

## Test invalid Source recovery

Exercise the recovery seam with malformed UTF-8, malformed front matter, duplicate IDs, unknown directives, raw HTML, CRLF, and multi-error Source:

```bash
node dist/cli.js validate /tmp/bad.aze.md; echo "exit=$?"
node dist/cli.js validate /tmp/bad.aze.md --diagnostics json > /tmp/report.json; echo "exit=$?"
node dist/cli.js render /tmp/bad.aze.md --output /tmp/bad.html --diagnostics json; echo "exit=$?"
```

Exit `2` is reserved for malformed operations (bad flags or arguments). Exit `1` means an accepted operation failed on Source or component diagnostics. Exit `0` with no stdout or stderr means a valid Source.

Confirm the JSON report is the single finite `azeforge.diagnostics/v1` document on stdout while human diagnostics stay on stderr, and validate it against the exported `diagnosticsJsonSchema` (JSON Schema 2020-12):

```bash
node dist/cli.js render /tmp/bad.aze.md --output /tmp/bad.html --diagnostics json 2>/tmp/stderr.txt | tee /tmp/report.json
test ! -s /tmp/stderr.txt && echo "stderr clean in json mode"
```

Confirm a failed render never commits an Artifact by pre-seeding the destination:

```bash
echo "last successful Artifact" > /tmp/out.html
node dist/cli.js render /tmp/bad.aze.md --output /tmp/out.html; echo "exit=$?"
grep -qx "last successful Artifact" /tmp/out.html && echo "artifact preserved"
```

Probe raw HTML denial, which must report `azeforge.security#raw-html-disabled`, exit `1`, and never render the markup:

```bash
printf -- '---\nazemark: 1\n---\n\nBefore\n\n<div>\n\nAfter\n' > /tmp/html.aze.md
node dist/cli.js render /tmp/html.aze.md --output /tmp/html.html --diagnostics json
grep -i '<script\|<div' /tmp/html.html || echo "no raw html rendered"
```

Repeat the probes with CRLF line endings and a BOM prefix; diagnostic ranges, columns, and offsets must still line up in the JSON report.

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
node --test test/equation.test.mjs
```

`test/equation.test.mjs` is the equation seam: versioned Blocks, alias
coverage, ranged diagnostics, raw-LaTeX policy, adapter failure modes,
registry rejection, descriptor conformance, and real CLI calls.

Probe equations by hand:

```bash
cat >/tmp/eq.aze.md <<'EOF'
---
azemark: 1
title: Equation check
---

:::: equation
id: euler

F(omega) = integral x=0..infinity of x^2 dx
::::
EOF

node dist/cli.js validate /tmp/eq.aze.md && echo VALID
node dist/cli.js render /tmp/eq.aze.md --output /tmp/eq.html
grep -o 'class="katex"\|<math\|<annotation' /tmp/eq.html | sort | uniq -c
```

Probe the raw-LaTeX gate (denied by default, trusted-local opt-in):

```bash
cat >/tmp/raw.aze.md <<'EOF'
---
azemark: 1
---

:::: equation
syntax: latex

\frac{a}{b}
::::
EOF

node dist/cli.js validate /tmp/raw.aze.md; echo "exit=$? (expect 1)"
node dist/cli.js validate /tmp/raw.aze.md --allow-raw-latex && echo ALLOWED
node dist/cli.js render /tmp/raw.aze.md --output /tmp/raw.html --allow-raw-latex
```
