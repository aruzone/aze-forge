# AzeForge manual test files

Fixtures for everything the compiler implements so far (P0-01 through
P0-06). Each file lists its expected `validate` exit status, the
diagnostic codes a failing `render --diagnostics json` reports, and the
commands to run. All paths below are relative to the repo root.

## Run everything

```bash
npm run build
for f in test-files/valid/*.aze.md test-files/equations/01-readable.aze.md test-files/mermaid/*.aze.md test-files/images/01-project-images.aze.md; do
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
| `valid/02-rich-prose.aze.md` | P0-04 scoped Inline nodes (emphasis, strong, inline code, safe https/mailto/fragment/autolinks, two-space and backslash hard breaks), blockquotes with nested lists and quotes, ordered/unordered lists, thematic break, fenced code with language, plain GFM table, callouts (note + warning with `id`, nested equation directive), captioned typed `table` directive (columns/rows with quantity units). |
| `equations/01-readable.aze.md` | Versioned equation Blocks with `id`/`number`/`align`; Greek, integral, sums, limits, matrices, sets through pinned KaTeX (visual HTML + MathML). |
| `equations/02-latex.aze.md` | Raw-LaTeX variant (`syntax: latex`); valid only with `--allow-raw-latex`, bounded KaTeX, `trust: false`, sanitized output. |
| `mermaid/01-flowchart.aze.md` | Flowchart Blocks (TD and LR) with `id`/`title`/`description` headers and without; decision diamonds, edge labels, loops; deterministic seed, namespaced IDs, accessible `<title>`/`<desc>`. |
| `mermaid/02-sequence.aze.md` | `sequenceDiagram` with participants, requests, and responses; deterministic participant/message layout. |
| `images/01-project-images.aze.md` | P0-06: root-confined PNG plus sanitized SVG embedded as data under the `academic` metadata Theme; deterministic `assetManifestHash`. |

## Invalid (each exits `1`)

| File | Expected `render` codes |
|---|---|
| `invalid/01-equations-invalid.aze.md` | `azeforge.equation#missing-integration-variable` (line-specific), `azeforge.equation#unsupported-notation` (TeX braces, raw TeX in a readable block). |
| `invalid/02-latex-denied.aze.md` | `azeforge.security#raw-latex-disabled` (passes with `--allow-raw-latex`). |
| `invalid/03-directives.aze.md` | `azeforge.source#unknown-directive` (with `availableTypes: ["callout","equation","mermaid","table"]` plus a suggestion), `azeforge.source#unclosed-directive`. Surrounding valid Blocks survive in `ParsedDocument`; no `AzeDocument`, no Artifact. |
| `invalid/04-identifiers.aze.md` | `azeforge.reference#invalid-id` (`Bad-ID`), `azeforge.reference#duplicate-id` (`shared`, related to first definition). |
| `invalid/05-raw-html.aze.md` | `azeforge.security#raw-html-disabled`; markup never rendered. |
| `invalid/06-version.aze.md` | `azeforge.source#version-unsupported`; previous Artifact preserved. |
| `invalid/07-links.aze.md` | P0-04: `azeforge.link#unsafe-protocol` (`javascript:`; range spans the whole paragraph), `azeforge.security#raw-html-disabled` (markup outside code fences). The fenced ```` ``` ```` block containing `<div>` stays valid text. |
| `invalid/07-mermaid.aze.md` | `azeforge.mermaid#unsupported-diagram`, `azeforge.mermaid#active-content`, `azeforge.mermaid#external-resource` (parse-time; validation stops the pipeline, so no Artifact). Deep syntax errors surface at compile time instead: a lone `flowchart TD` block with `a - broken ???` renders exactly one `azeforge.mermaid#invalid-syntax` diagnostic and no Artifact. |
| `invalid/08-callouts-tables.aze.md` | P0-04: `azeforge.callout#unknown-variant` (range underlines `bogus`, help lists the five variants), `azeforge.table#body-must-be-records` (scalar body in a typed `table` Block), `azeforge.link#unsafe-protocol` (`ftp:` inside a callout), `azeforge.table#unknown-header` (`width:`, suggests `caption`/`id`). Valid Blocks before/after survive. |
| `invalid/09-nesting.aze.md` | P0-04: `azeforge.link#unsafe-protocol` (bad link inside a nested blockquote inside a callout — nested ranges still resolve), `azeforge.source#unclosed-directive` (trailing callout with no closing `::::`). |
| `invalid/10-unclosed-code.aze.md` | P0-04: `azeforge.source#unclosed-fence`; the range points to the opening fence and no Artifact is produced. |

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

# Invalid diagrams: scoped diagnostics, no Artifact, exit 1.
# The combined fixture reports the three parse-time codes; deep syntax is
# checked by pinned Mermaid at compile time, so a lone broken-syntax block
# reports exactly one invalid-syntax diagnostic:
node dist/cli.js render test-files/invalid/07-mermaid.aze.md \
  --output /tmp/flow.html --diagnostics json 2>/dev/null | \
  grep -o '"code":"azeforge.mermaid#[a-z-]*"' | sort | uniq -c
printf -- '---\nazemark: 2\n---\n\n:::: mermaid\n----\nflowchart TD\n  a - broken ???\n::::\n' > /tmp/broken-mermaid.aze.md
node dist/cli.js render /tmp/broken-mermaid.aze.md \
  --output /tmp/broken.html --diagnostics json 2>/dev/null | \
  grep -o '"code":"azeforge.mermaid#[a-z-]*"' | sort | uniq -c

# Failed render never commits:
echo "last successful Artifact" > /tmp/out.html
node dist/cli.js render test-files/invalid/05-raw-html.aze.md --output /tmp/out.html
grep -qx "last successful Artifact" /tmp/out.html && echo "artifact preserved"
```

## P0-04 manual walkthrough

Render the rich sampler and inspect its native HTML semantics:

```bash
npm run build
node dist/cli.js render test-files/valid/02-rich-prose.aze.md --output /tmp/rich.html
```

Structural assertions on the Artifact (run as-is; every line prints
`PASS` when the feature works):

```bash
python3 - <<'EOF'
html = open('/tmp/rich.html').read()
checks = {
  'emphasis': '<em>emphasis</em>' in html,
  'strong': '<strong>strong</strong>' in html,
  'inline code': '<code>inline code</code>' in html,
  'https link unfetched': '<a href="https://example.com/docs">' in html,
  'mailto link': '<a href="mailto:someone@example.com">' in html,
  'fragment link': '<a href="#hard-breaks">' in html,
  'autolink': '<a href="https://autolink.example.com">' in html,
  'blockquote': '<blockquote><p>A blockquote with <strong>bold</strong>' in html,
  'nested blockquote': 'quote inside the quote' in html,
  'unordered list': '<ul>' in html,
  'ordered list': '<ol>' in html,
  'thematic break': '<hr>' in html,
  'fenced code + language': 'class="language-python"' in html,
  'plain GFM table is bare': html.count('<table>') == 1,
  'captioned table is a figure': '<figure class="aze-table"><table id="materials"' in html,
  'table caption inlines': '<caption>Material <em>properties</em> with alignment</caption>' in html,
  'typed table column names': '<th scope="col">Density</th>' in html,
  'typed table quantity units': '<span class="aze-unit">kg/m^3</span>' in html,
  'callout variant data': 'data-variant="warning"' in html,
  'callout id anchor': 'id="careful"' in html,
  'callout title': '<p class="aze-callout-title">Nested directive content</p>' in html,
  'nested equation in callout': 'data-equation-id="pythagoras"' in html,
  'equation math': 'class="katex"' in html,
  'script-free': '<script' not in html,
}
for name, ok in checks.items():
  print(('PASS' if ok else 'FAIL'), name)
EOF
```

### Visual inspection

```bash
open /tmp/rich.html  # macOS
```

Check this Source order in the page:

1. “Rich prose” heading, formatted prose, and four visibly linked labels.
2. Two hard line breaks.
3. Blockquote containing a list and a deeper blockquote.
4. Separate unordered and ordered lists.
5. Horizontal thematic break and Python code block.
6. Plain GFM table followed by the typed Material properties table.
7. Note callout containing prose, a list, and a blockquote.
8. Warning callout containing the rendered Pythagorean equation and trailing prose.
9. Captioned typed Material properties table with column names, numbers, and quantity units.

Do not click the external links when testing offline behavior. The structural
check above confirms that the destinations survive compilation; rendering
itself never fetches them.

### Determinism

```bash
node dist/cli.js render test-files/valid/02-rich-prose.aze.md --output /tmp/rich2.html
cmp /tmp/rich.html /tmp/rich2.html && echo "byte-identical"
```

Callout body order is nested Source order (paragraph, then list, then
quote in the first callout; equation then prose in the second):

```bash
grep -o 'Plain note\|a list inside\|blockquote inside\|Nested directive\|pythagoras' /tmp/rich.html
```

Hard breaks render `<br>` (two-space and backslash forms):

```bash
grep -o '<br>' /tmp/rich.html | wc -l  # expect 2
```

Invalid fixtures print human diagnostics with line/column ranges and
exit `1`; JSON mode lists exactly the codes documented above:

```bash
node dist/cli.js validate test-files/invalid/07-links.aze.md
node dist/cli.js render test-files/invalid/08-callouts-tables.aze.md \
  --output /tmp/bad.html --diagnostics json | python3 -m json.tool
```

## P0-06 manual walkthrough

Render the image fixture under every Theme and inspect embedding,
hashes, and self-containment:

```bash
npm run build
for theme in default academic dark-presentation; do
  node dist/cli.js render test-files/images/01-project-images.aze.md \
    --output /tmp/images-$theme.html --theme $theme || echo "FAIL: $theme"
done
```

Structural assertions on the Artifacts (run as-is; every line prints
`PASS` when the feature works):

```bash
python3 - <<'EOF'
pages = {t: open(f'/tmp/images-{t}.html').read() for t in ('default', 'academic', 'dark-presentation')}
checks = {
  'png embedded': 'src="data:image/png;base64,' in pages['default'],
  'svg embedded': 'src="data:image/svg+xml;base64,' in pages['default'],
  'no project paths': all('test-files' not in p and 'figures/' not in p for p in pages.values()),
  'script-free': all('<script' not in p for p in pages.values()),
  'csp constrained': all('img-src data:' in p for p in pages.values()),
  'themes differ': len({pages['default'], pages['academic'], pages['dark-presentation']}) == 3,
  'dark scheme': 'color-scheme:dark' in pages['dark-presentation'],
  'responsive images': all('img{max-width:100%;height:auto}' in p for p in pages.values()),
}
for name, ok in checks.items():
  print(('PASS' if ok else 'FAIL'), name)
EOF
```

Manifest hash covers used bytes only; moving the project changes nothing:

```bash
node dist/cli.js render test-files/images/01-project-images.aze.md \
  --output /tmp/images.html --diagnostics json | \
  python3 -c "import json,sys; print(json.load(sys.stdin)['artifact']['assetManifestHash'])"
rm -rf /tmp/relocated && mkdir -p /tmp/relocated
cp test-files/images/01-project-images.aze.md test-files/images/plot.png \
  test-files/images/logo.svg /tmp/relocated/
node dist/cli.js render /tmp/relocated/01-project-images.aze.md --output /tmp/relocated.html
cmp /tmp/images.html /tmp/relocated.html && echo "relocatable byte-identical"
```

Abuse cases fail before Artifact publication (exit `1`, previous
Artifact preserved, one `azeforge.asset#` code each):

```bash
printf -- '---\nazemark: 2\n---\n\n# T\n\nBody.\n\n![x](https://example.com/x.png)\n' > /tmp/relocated/remote.aze.md
node dist/cli.js render /tmp/relocated/remote.aze.md --output /tmp/no.html --diagnostics json | \
  grep -o '"code":"azeforge.asset#[a-z-]*"'
printf -- '---\nazemark: 2\n---\n\n# T\n\nBody.\n\n![x](../outside.png)\n' > /tmp/relocated/escape.aze.md
node dist/cli.js render /tmp/relocated/escape.aze.md --output /tmp/no.html --diagnostics json | \
  grep -o '"code":"azeforge.asset#[a-z-]*"'
```
