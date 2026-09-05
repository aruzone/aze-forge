# AzeForge manual test files

Fixtures for everything the compiler implements so far (P0-01 through
P0-04). Each file lists its expected `validate` exit status, the
diagnostic codes a failing `render --diagnostics json` reports, and the
commands to run. All paths below are relative to the repo root.

## Run everything

```bash
npm run build
for f in test-files/valid/*.aze.md test-files/equations/01-readable.aze.md; do
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
| `valid/02-rich-prose.aze.md` | P0-04 scoped Inline nodes (emphasis, strong, inline code, safe https/mailto/fragment/autolinks, two-space and backslash hard breaks), blockquotes with nested lists and quotes, ordered/unordered lists, thematic break, fenced code with language, plain GFM table, callouts (note + warning with `id`, nested equation directive), captioned aligned `table` directive. |
| `equations/01-readable.aze.md` | Versioned equation Blocks with `id`/`number`/`align`; Greek, integral, sums, limits, matrices, sets through pinned KaTeX (visual HTML + MathML). |
| `equations/02-latex.aze.md` | Raw-LaTeX variant (`syntax: latex`); valid only with `--allow-raw-latex`, bounded KaTeX, `trust: false`, sanitized output. |

## Invalid (each exits `1`)

| File | Expected `render` codes |
|---|---|
| `invalid/01-equations-invalid.aze.md` | `azeforge.equation#missing-integration-variable` (line-specific), `azeforge.equation#invalid-syntax` × 2 (unparseable body, raw TeX in a readable block). |
| `invalid/02-latex-denied.aze.md` | `azeforge.security#raw-latex-disabled` (passes with `--allow-raw-latex`). |
| `invalid/03-directives.aze.md` | `azeforge.source#unknown-directive` (with `availableTypes: ["callout","equation","table"]` plus a suggestion), `azeforge.source#unclosed-directive`. Surrounding valid Blocks survive in `ParsedDocument`; no `AzeDocument`, no Artifact. |
| `invalid/04-identifiers.aze.md` | `azeforge.reference#invalid-id` (`Bad-ID`), `azeforge.reference#duplicate-id` (`shared`, related to first definition). |
| `invalid/05-raw-html.aze.md` | `azeforge.security#raw-html-disabled`; markup never rendered. |
| `invalid/06-version.aze.md` | `azeforge.source#version-unsupported`; previous Artifact preserved. |
| `invalid/07-links.aze.md` | P0-04: `azeforge.link#unsafe-protocol` (`javascript:`; range spans the whole paragraph), `azeforge.security#raw-html-disabled` (markup outside code fences). The fenced ```` ``` ```` block containing `<div>` stays valid text. |
| `invalid/08-callouts-tables.aze.md` | P0-04: `azeforge.callout#unknown-variant` (range underlines `bogus`, help lists the five variants), `azeforge.table#body-must-be-table` (non-GFM body), `azeforge.link#unsafe-protocol` (`ftp:` inside a callout), `azeforge.table#unknown-header` (`width:`, suggests `caption`/`id`). Valid Blocks before/after survive. |
| `invalid/09-nesting.aze.md` | P0-04: `azeforge.link#unsafe-protocol` (bad link inside a nested blockquote inside a callout — nested ranges still resolve), `azeforge.source#unclosed-directive` (trailing callout with no closing `::::`). |
| `invalid/10-unclosed-code.aze.md` | P0-04: `azeforge.source#unclosed-fence`; the range points to the opening fence and no Artifact is produced. |

## Spot checks

```bash
# Visual math + MathML + equation anchors, no remote references:
node dist/cli.js render test-files/equations/01-readable.aze.md --output /tmp/eq.html
grep -o 'class="katex"\|<math\|data-equation-id="[a-z-]*"' /tmp/eq.html | sort | uniq -c
grep -c 'url(fonts/' /tmp/eq.html  # expect 0: KaTeX faces are embedded

# Single finite JSON report on stdout, stderr clean:
node dist/cli.js render test-files/invalid/01-equations-invalid.aze.md \
  --output /tmp/bad.html --diagnostics json 2>/tmp/stderr.txt | tee /tmp/report.json
test ! -s /tmp/stderr.txt && echo "stderr clean in json mode"

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
  'table alignment left': 'style="text-align:left">material<' in html,
  'table alignment center': 'style="text-align:center">density<' in html,
  'table alignment right': 'style="text-align:right">conductivity<' in html,
  'plain GFM table is bare': html.count('<table>') == 1,
  'captioned table is a figure': '<figure class="aze-table"><table id="materials"' in html,
  'table caption inlines': '<caption>Material <em>properties</em> with alignment</caption>' in html,
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
6. Plain table with left, center, and right aligned columns.
7. Note callout containing prose, a list, and a blockquote.
8. Warning callout containing the rendered Pythagorean equation and trailing prose.
9. Captioned Material properties table with the same three alignments.

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
