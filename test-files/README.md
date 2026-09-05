# AzeForge manual test files

Fixtures for everything the compiler implements so far (P0-01 through
P0-05). Each file lists its expected `validate` exit status, the
diagnostic codes a failing `render --diagnostics json` reports, and the
commands to run. All paths below are relative to the repo root.

## Run everything

```bash
npm run build
for f in test-files/valid/*.aze.md test-files/equations/*.aze.md test-files/mermaid/*.aze.md; do
  node dist/cli.js validate "$f" || echo "FAIL: $f"
done
node dist/cli.js validate test-files/equations/02-latex.aze.md --allow-raw-latex
node dist/cli.js render test-files/equations/02-latex.aze.md \
  --output /tmp/latex.html --allow-raw-latex
for f in test-files/invalid/*.aze.md; do
  node dist/cli.js validate "$f" >/dev/null 2>&1 && echo "UNEXPECTED PASS: $f"
done
```

Valid files exit `0` and stay silent. Invalid files exit `1` with human
diagnostics on stderr. Files with raw LaTeX need `--allow-raw-latex`.

## Valid

| File | Covers |
|---|---|
| `valid/01-prose.aze.md` | Front matter, ATX + Setext headings, paragraphs, deterministic HTML. |
| `equations/01-readable.aze.md` | Versioned equation Blocks with `id`/`number`/`align`; Greek, integral, sums, limits, matrices, sets through pinned KaTeX (visual HTML + MathML). |
| `equations/02-latex.aze.md` | Raw-LaTeX variant (`syntax: latex`); valid only with `--allow-raw-latex`, bounded KaTeX, `trust: false`, sanitized output. |
| `mermaid/01-flowchart.aze.md` | Flowchart Blocks (TD and LR) with `id`/`title`/`description` headers and without; decision diamonds, edge labels, loops; deterministic seed, namespaced IDs, accessible `<title>`/`<desc>`. |
| `mermaid/02-sequence.aze.md` | `sequenceDiagram` with participants, requests, and responses; deterministic participant/message layout. |

## Invalid (each exits `1`)

| File | Expected `render` codes |
|---|---|
| `invalid/01-equations-invalid.aze.md` | `azeforge.equation#missing-integration-variable` (line-specific), `azeforge.equation#invalid-syntax` × 2 (unparseable body, raw TeX in a readable block). |
| `invalid/02-latex-denied.aze.md` | `azeforge.security#raw-latex-disabled` (passes with `--allow-raw-latex`). |
| `invalid/03-directives.aze.md` | `azeforge.source#unknown-directive` (with `availableTypes: ["equation", "mermaid"]` plus a suggestion), `azeforge.source#unclosed-directive`. Surrounding valid Blocks survive in `ParsedDocument`; no `AzeDocument`, no Artifact. |
| `invalid/04-identifiers.aze.md` | `azeforge.reference#invalid-id` (`Bad-ID`), `azeforge.reference#duplicate-id` (`shared`, related to first definition). |
| `invalid/05-raw-html.aze.md` | `azeforge.security#raw-html-disabled`; markup never rendered. |
| `invalid/06-version.aze.md` | `azeforge.source#version-unsupported`; previous Artifact preserved. |
| `invalid/07-mermaid.aze.md` | `azeforge.mermaid#invalid-syntax` (malformed edge), `azeforge.mermaid#unsupported-diagram` (unknown keyword), `azeforge.mermaid#active-content` (script in a label), `azeforge.mermaid#external-resource` (`click` to https). One scoped diagnostic each, no error SVG, no Artifact; the trailing valid flowchart never renders. |

## Spot checks

```bash
# Visual math + MathML + equation anchors, no remote references:
node dist/cli.js render test-files/equations/01-readable.aze.md --output /tmp/eq.html
grep -o 'class="katex"\|<math\|data-equation-id="[a-z-]*"' /tmp/eq.html | sort | uniq -c
grep -c 'url(fonts/' /tmp/eq.html  # expect 0: KaTeX faces are embedded

# Offline diagrams: accessible SVG, deterministic IDs/seed, no active content:
node dist/cli.js render test-files/mermaid/01-flowchart.aze.md --output /tmp/flow.html
grep -o 'viewBox="0 0 [0-9.]* [0-9.]*"\|data-seed="[0-9a-f]*"\|data-mermaid-id="[a-z-]*"' /tmp/flow.html
grep -ci '<script\|<foreignobject\|onclick\|<animate\|href="http' /tmp/flow.html  # expect 0

# Same Source twice -> byte-identical Artifact (same fingerprint):
node dist/cli.js render test-files/mermaid/01-flowchart.aze.md --output /tmp/flow2.html
cmp /tmp/flow.html /tmp/flow2.html && echo "byte-identical"

# Invalid diagrams: four scoped diagnostics, no Artifact, exit 1:
node dist/cli.js render test-files/invalid/07-mermaid.aze.md \
  --output /tmp/flow.html --diagnostics json 2>/dev/null | \
  grep -o '"code":"azeforge.mermaid#[a-z-]*"' | sort | uniq -c

# Failed render never commits:
echo "last successful Artifact" > /tmp/out.html
node dist/cli.js render test-files/invalid/05-raw-html.aze.md --output /tmp/out.html
grep -qx "last successful Artifact" /tmp/out.html && echo "artifact preserved"
