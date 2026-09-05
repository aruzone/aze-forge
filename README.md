# AzeForge

AzeForge currently compiles AzeMark prose into deterministic, self-contained HTML. This README documents the first CLI tracer bullet. Broader product documentation will replace it later.

## Supported syntax

The current compiler supports:

- AzeMark v1 YAML front matter
- ATX headings such as `# Heading`
- Setext headings
- paragraphs
- plain inline text

Directive envelopes are recovered as `InvalidBlock` values until Plugins are registered. Raw HTML is denied and never rendered as text or markup. Lists, equations, Mermaid, images, and other Markdown constructs are not implemented yet.

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

## Automated checks

```bash
npm run typecheck
npm test
```
