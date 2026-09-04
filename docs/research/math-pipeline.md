# Math pipeline research (ticket #3)

Scope: which math pipeline the spec can lock for readable aliases plus a raw-LaTeX
escape hatch. Facts only; no decision. All KaTeX observations pinned to v0.18.5
and verified 2026-09-04 unless noted. Empirical rows marked [probe] were rendered
with `katex.renderToString(tex, {throwOnError: true})` in plain Node (no DOM,
no network); every one returned HTML containing `<math` MathML plus
`<annotation encoding="application/x-tex">`.

## 1. KaTeX Node SSR works offline

- `const katex = require('katex')` (CommonJS) or `import katex from 'katex'`
  (ES module, may need transpiling for old environments) is the documented
  Node import path. Source: https://katex.org/docs/node.html#importing
- `katex.renderToString(tex, opts)` returns an HTML string server-side; this is
  the documented server path. Source: https://katex.org/docs/api.html#server-side-rendering-or-rendering-to-a-string
- SSR output still needs the CSS file, the font files on the client, and the
  HTML5 doctype; `katex.js` itself is not needed client-side after SSR.
  Source: https://katex.org/docs/node.html#including-in-webpages
- No network is involved in `renderToString` (pure string-to-string call;
  [probe] ran in bare `node` with no jsdom). Offline self-hosting is via
  `npm install katex` (`node_modules/katex/dist/`) or the GitHub release
  archives `katex.tar.gz` / `katex.zip` (not the auto-generated "Source code"
  download, which lacks built files).
  Source: https://katex.org/docs/browser.html#download--host-things-yourself
- KaTeX ships a `cli.js` binary (`"bin": "cli.js"`) with flags for display
  mode, output format, throw-on-error, strict, trust, max-size, max-expand,
  macros, input/output files — a usable precedent for AzeForge CLI flag naming.
  Sources: https://github.com/KaTeX/KaTeX/blob/main/package.json (`"bin"`,
  `"version": "0.18.5"`), https://katex.org/docs/cli.html#options

## 2. §12 alias coverage table

"KaTeX target" is the LaTeX the alias compiler must emit. Status
`supported` means KaTeX renders it with `throwOnError: true` ([probe] plus
the cited support row); `needs-escape` means it must go through the
`:::: latex` raw block instead.

| §12 alias (blueprint §12) | KaTeX target | Status | Evidence |
|---|---|---|---|
| `alpha`, `beta` (named Greek) | `\alpha`, `\beta` | supported | Support-table rows `\alpha`, `\beta` render; source: https://katex.org/docs/support_table.html#a · [probe] `greek: OK` |
| `infinity` | `\infty` | supported | [probe] `greek: OK` (includes `\pi`, `\infty`) |
| `x^2`, `x_i` (caret/underscore) | `x^2`, `x_i`, `x^{2n}_{i=1}` | supported | Support-table rows `^`, `\_` (`x^i`, `x_i`); source: https://katex.org/docs/support_table.html#symbols · [probe] `super_sub: OK` |
| common functions | `\sin` `\cos` `\log` `\ln` `\exp` | supported | Support-table rows `\arccos`, `\arcsin`, `\arg`, etc.; source: https://katex.org/docs/support_table.html#a · [probe] `functions: OK` |
| fractions | `\frac{a}{b}`, `\dfrac`, `\cfrac` | supported | [probe] `fraction: OK`; `\above`/`\atop` also listed as supported in https://katex.org/docs/support_table.html#a |
| `sqrt(x)`, n-th roots | `\sqrt{x}`, `\sqrt[3]{x}` | supported | [probe] `roots: OK` |
| `limit x->0 of expr` | `\lim_{x \to 0} f(x)` | supported | [probe] `limits: OK`; `\lim` ships in the a11y string map as "limit", source: https://github.com/KaTeX/KaTeX/blob/main/contrib/render-a11y-string/render-a11y-string.ts |
| `sum i=1..n of expr` | `\sum_{i=1}^{n}` | supported | [probe] `sum_prod: OK`; `\sum` maps to "sum" in https://github.com/KaTeX/KaTeX/blob/main/contrib/render-a11y-string/render-a11y-string.ts |
| products | `\prod_{i=1}^{n}` | supported | [probe] `sum_prod: OK` |
| `integral x=0..1 of expr dx` | `\int_{0}^{1}`, plus `\iint` `\iiint` `\oint` | supported | [probe] `integrals: OK`; `\int` maps to "integral" in https://github.com/KaTeX/KaTeX/blob/main/contrib/render-a11y-string/render-a11y-string.ts |
| `partial f / partial x`, derivatives | `\frac{\partial f}{\partial x}`, `\frac{df}{dx}`, `\nabla` | supported | [probe] `derivatives: OK` |
| `matrix [[a,b],[c,d]]` | `\begin{pmatrix}…\end{pmatrix}`, `bmatrix`, `vmatrix`, `Vmatrix`, `Bmatrix`, `smallmatrix`, `array` | supported | Environments table documents `matrix`, `pmatrix`, `bmatrix`, `vmatrix`, `Vmatrix`, `Bmatrix`, `array`, `smallmatrix`; source: https://katex.org/docs/supported.html#environments · [probe] `matrix: OK`, `mat_variants: OK` |
| cases | `\begin{cases}…\end{cases}` (and `rcases`) | supported | Environments table documents `cases`/`rcases`; source: https://katex.org/docs/supported.html#environments · [probe] `cases: OK` |
| relations and sets (`in`, `subset`, `cup`, `cap`, `<=`, `!=`, `~=`) | `\in` `\subset` `\cup` `\cap` `\leq` `\neq` `\approx` | supported | [probe] `relations_sets: OK`; `\approx`, `\And` rows in https://katex.org/docs/support_table.html#a |
| multi-line derivations | `\begin{align}`, `align*`, `aligned`, `gather`, `split`, `equation` | supported (no escape needed for these) | Environments table documents them; source: https://katex.org/docs/supported.html#environments · [probe] `align_env: OK` |
| file / system primitives (`\input`, `\include`) | n/a | not supported (good: nothing to sandbox at KaTeX level) | [probe] `\input{foo}` throws `Undefined control sequence: \input` |
| `\includegraphics`, `\url`, `\href`, `\htmlClass/Id/Style/Data` | n/a | gated, not freely supported (see §5) | Rendered in error color under default `trust: false`; source: https://katex.org/docs/options.html (`trust`); [probe] confirmed red `#cc0000` output, and real `<img>` only with `trust: true` |
| explicitly unsupported macros (`\abovewithdelims`, `\atopwithdelims`, `\bbox`, `\bfseries`, `\Arrowvert`/`\arrowvert`, `\and`, `\ang`, `\array` as command) | n/a | needs-escape (or omit) | Each marked "Not supported" in https://katex.org/docs/support_table.html |
| package-level LaTeX (`\usepackage`, TikZ, pgfplots, numbering/counters, `\write18` shell-escape class) | n/a | needs-escape via future full-TeX backend only | Absent from https://katex.org/docs/supported.html and https://katex.org/docs/support_table.html; KaTeX has no file/system primitives ([probe] `\input` undefined), so there is no shell-escape surface in KaTeX itself |

Net: every §12 alias and every §12 parser bullet (Greek, super/subscripts,
common functions, fractions, roots, limits, sums/products, integrals,
derivatives/partials, matrices, cases, relations/sets) maps to a KaTeX-native
target. The escape hatch is needed only for package-level or explicitly
unsupported macros, not for §12 itself.

## 3. Font distribution (offline bundling)

- npm package `katex@0.18.5`, MIT license (`"license": "MIT"`).
  Source: https://github.com/KaTeX/KaTeX/blob/main/package.json
- Three font formats ship: `ttf` (very old browsers / local install), `woff`
  (widest support), `woff2` (smallest, modern browsers); inclusion is gated by
  Browserslist config or `USE_(FONT)` build env vars / Sass `$use-ttf` etc.
  Source: https://katex.org/docs/font.html#kinds-of-fonts-used
- [probe] `node_modules/katex/dist/fonts` contains 60 files (v0.18.5).
- The `fonts/` directory must stay alongside the CSS file (`katex.min.css`
  references fonts via relative URLs such as
  `url("fonts/KaTeX_AMS-Regular.woff2")`); moving/renaming it breaks rendering.
  Source: https://katex.org/docs/browser.html#serving-the-files
- Math renders 1.21× larger than surrounding text by default (super/subscript
  legibility); tunable via `.katex { font-size: … }`. All TeX units supported;
  absolute units scale from a 10pt TeX base.
  Source: https://katex.org/docs/font.html#font-size-and-lengths

## 4. Accessibility story

- `output` option: `html` (visual only), `mathml` (MathML only),
  `htmlAndMathml` (visual HTML plus MathML for accessibility) — the default.
  Source: https://katex.org/docs/options.html (`output`)
- Every render embeds `<annotation encoding="application/x-tex">` carrying the
  TeX source inside the MathML (visible in all support-doc equations and
  confirmed by [probe] `annotation=true` on all 14 construct groups).
  Source: https://katex.org/docs/supported.html (per-equation MathML comments)
- The shipped visual HTML marks itself `aria-hidden` (string present in
  `dist/katex.js`; [probe] grep `aria-hidden: true`), so screen readers use
  the MathML/annotation side rather than double-reading styled spans.
- `contrib/render-a11y-string` converts a parse tree to a spoken string, e.g.
  `\frac{1}{2}` → `"start fraction, 1, divided by, 2, end fraction"`.
  Source: https://github.com/KaTeX/KaTeX/blob/main/contrib/render-a11y-string/render-a11y-string.ts (header comment + `stringMap`/`relMap`)
- `contrib/copy-tex` exists for copy/paste fidelity; both contribs ship in the
  release `katex/` folder as `.js`/`.min.js`/`.mjs`.
  Source: https://katex.org/docs/browser.html#option-1-pre-built-release-from-github (folder listing)
- Implication for the spec (fact, not decision): keeping the default
  `htmlAndMathml` preserves the accessibility side for free; switching to
  `output: "html"` would drop it.

## 5. Raw-LaTeX gating precedents (KaTeX-native controls)

All of these exist today in KaTeX options; the blueprint default (§32.3:
raw HTML/LaTeX disabled for untrusted source, opt-in for trusted local;
§11: raw backend blocks disabled or sandboxed when untrusted) can be built
from them without inventing a model:

- `trust` (default `false`): blocks `\includegraphics`, `\url`, `\href`,
  `\htmlClass`, `\htmlId`, `\htmlStyle`, `\htmlData`, rendering them in
  `errorColor` instead. `true` allows all; a function allows per-command /
  per-protocol (e.g. only `https` + `_relative`, never `file:`).
  Source: https://katex.org/docs/options.html (`trust`) · [probe] default
  renders all four test commands red; `trust: true` yields a real `<img>`
- `strict` (default `"warn"`): `"error"`/`true` throws on non-LaTeX-faithful
  input (`unknownSymbol`, `unicodeTextInMathMode`, `htmlExtension`, …);
  accepts a handler `(errorCode, errorMsg, token)`.
  Source: https://katex.org/docs/options.html (`strict`) · [probe] observed
  console warning `strict mode is set to 'warn': HTML extension is disabled`
- `maxSize` (default `Infinity`): caps user sizes like `\rule{500em}{500em}`
  against visual-affront DoS. Source: https://katex.org/docs/options.html
  (`maxSize`), https://katex.org/docs/security.html
- `maxExpand` (default `1000`): caps macro expansion against infinite-loop
  DoS. Source: https://katex.org/docs/options.html (`maxExpand`),
  https://katex.org/docs/security.html
- `throwOnError` (default `true`): throws `katex.ParseError` on invalid or
  unsupported input; `false` renders source in `errorColor` with hover text.
  Source: https://katex.org/docs/options.html (`throwOnError`),
  https://katex.org/docs/api.html#handling-errors
- `ParseError` messages embed unescaped LaTeX source: escape `&`, `<`, `>`
  before putting them in HTML/DOM or leave a `<script>`-injection hole with
  untrusted source. Source: https://katex.org/docs/error.html
- Generated HTML "should" be safe from `<script>`/code injection, but KaTeX
  still advises sanitizing with a generous whitelist including SVG and MathML.
  Source: https://katex.org/docs/security.html
- Persistent macros (`\gdef` shared via one `macros` object across renders)
  change KaTeX behavior, so they must be scoped to one trust domain (e.g. one
  document), never shared across users/messages.
  Source: https://katex.org/docs/api.html#security-of-persistent-macros
- Sandboxing/shell-escape: KaTeX has no `\write18` equivalent and no file
  primitives at all ([probe] `\input` is an undefined control sequence), so
  the KaTeX tier needs gating, not sandboxing. True sandboxing (no shell
  escape, temp-dir isolation) only becomes relevant if a full-TeX backend is
  added later for the escape hatch [INFERENCE].
