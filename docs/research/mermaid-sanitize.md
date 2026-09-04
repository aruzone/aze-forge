# Offline Mermaid SVG sanitization — research findings

Ticket: #4 ("How should offline Mermaid diagrams become sanitized, deterministic SVG?").
Status: findings only; no decision taken. Every factual claim below cites the
primary source that owns it (upstream repo source, official docs, spec text).

## 1. Offline rendering path

**Pinned versions investigated:** `mermaid` 11.17.2
([package.json](https://github.com/mermaid-js/mermaid/raw/refs/heads/develop/packages/mermaid/package.json)),
`@mermaid-js/mermaid-cli` 11.17.0
([package.json](https://github.com/mermaid-js/mermaid-cli/raw/refs/heads/master/package.json)).
The CLI declares `mermaid: ^11.14.0`, `@mermaid-js/layout-elk`,
`@mermaid-js/mermaid-zenuml`, `katex`, FontAwesome, and `puppeteer` as a
*peer* dependency `^23 || ^24 || ^25`; engines are `node ^18.19 || >=20.0.0`
(same file). The CLI's own README warns its Node.js API "is not covered by
semver" because it tracks mermaid's versioning
([README](https://github.com/mermaid-js/mermaid-cli)readable at
`https://github.com/mermaid-js/mermaid-cli`, "Use Node.JS API" section) —
pin exact versions in AzeForge lockfiles rather than relying on the API shape.

**Headless requirements.** Rendering runs Mermaid's ESM bundles inside
headless Chromium driven by Puppeteer. The CLI launches with
`headless: "shell"` by default
([src/index.js](https://github.com/mermaid-js/mermaid-cli/raw/refs/heads/master/src/index.js)).
On Linux without a usable sandbox, Chrome refuses to start; the documented
workaround is a `puppeteer-config.json` containing
`{ "args": ["--no-sandbox"] }` passed via `-p`, with an explicit warning not
to run as root
([docs/linux-sandbox-issue.md](https://github.com/mermaid-js/mermaid-cli/raw/refs/heads/master/docs/linux-sandbox-issue.md)).
Implication for §22 ("disable network access during render by default",
"isolated process or container"): the Chromium dependency is the heaviest
offline-rendering cost and must be provisioned (system Chromium or Puppeteer
download) plus sandbox policy on CI/containers.

**Offline config.** The CLI needs no network for the base path: it serves the
local `mermaid.esm.mjs`, layout bundles, and CSS (FontAwesome, KaTeX) to the
page through a request interceptor that maps a dummy
`https://mermaid-cli-intercept.invalid` origin back to local files, with an
allow-list of directories enforced via `realpath` so arbitrary file access is
rejected
([src/puppeteerIntercept.js](https://github.com/mermaid-js/mermaid-cli/raw/refs/heads/master/src/puppeteerIntercept.js)).
Local ESM + `file://` + intercept is used deliberately to avoid standing up a
dummy HTTP server (same file). The two network exceptions are opt-in icon
packs: `--iconPacks` fetches `https://unpkg.com/<pack>/icons.json` and
`--iconPacksNamesAndUrls` fetches a caller-supplied URL at render time
([src/index.js](https://github.com/mermaid-js/mermaid-cli/raw/refs/heads/master/src/index.js)).
Offline rule: never enable icon packs unless the pack JSON is vendored; the
default render is fully local.

**Render entry points for reuse.** `mermaid.render(id, definition)` returns
`{ svg, bindFunctions }`; event binding is a separate post-insert step the
caller must invoke explicitly
([usage docs](https://mermaid.js.org/config/usage.html), "Binding events").
`mermaid.parse(text, parseOptions)` validates without rendering and throws on
invalid input unless `parseOptions.suppressErrors` is set, in which case it
returns `false`
(same page, "Syntax validation without rendering"). `mermaid.run` accepts
`suppressErrors: true` for the same purpose. For SVG bytes the CLI
serializes with `XMLSerializer` (not `innerHTML`) because HTML
`<foreignObject>` content such as `<br>` is not valid XML, and its test suite
asserts no bare `<br>` survives in output SVG
([src/index.js](https://github.com/mermaid-js/mermaid-cli/raw/refs/heads/master/src/index.js);
[run-tests.sh](https://github.com/mermaid-js/mermaid-cli/raw/refs/heads/master/run-tests.sh)).

## 2. SVG determinism

**IDs.** `deterministicIds` defaults to `false`: "the IDs are generated based
on the current date and thus are not deterministic… This matters if your files
are checked into source control e.g. git and should not change unless content
is changed"
([config schema](https://mermaid.js.org/schemas/config.schema.json),
`deterministicIds` description). Setting it `true` switches to a seeded
scheme; the optional `deterministicIDSeed` string selects the seed, otherwise
"a simple number iterator is used" (same schema). The CLI's own determinism
fixture is exactly `{ "deterministicIds": true }`
([test-positive/config-deterministic.json](https://github.com/mermaid-js/mermaid-cli/raw/refs/heads/master/test-positive/config-deterministic.json)).
AzeForge must set `deterministicIds: true` and a fixed `deterministicIDSeed`.

**Other randomness.** `handDrawnSeed` defaults to `0`, which "gives a random
seed"
([config schema](https://mermaid.js.org/schemas/config.schema.json)).
Pin a fixed nonzero `handDrawnSeed` whenever `look: "handDrawn"` is allowed.

**Fonts.** Default `fontFamily` is `"trebuchet ms", verdana, arial,
sans-serif` (same schema) — three system fonts that differ across
macOS/Linux/Windows, so cross-machine byte-identical SVG requires pinning a
bundled font stack. Two further primary-source facts: the CLI awaits
`document.fonts` loads before rendering
([src/index.js](https://github.com/mermaid-js/mermaid-cli/raw/refs/heads/master/src/index.js)),
and the usage docs warn that dynamically loaded webfonts render "labels out
of bounds" unless rendering waits for page load including font assets, and
that ambient page fonts leak into diagrams unless overridden
([usage docs](https://mermaid.js.org/config/usage.html), "Labels out of
bounds"). PNG output compounds this: pixel size comes from
`getBoundingClientRect()` of the laid-out SVG
([src/index.js](https://github.com/mermaid-js/mermaid-cli/raw/refs/heads/master/src/index.js)),
so font metrics shift PNG dimensions too.

**Sizing.** For stable rasterization the CLI's test harness notes "we must set
`useMaxWidth: false` in config to convert-svg-to-png for Percy CI"
([run-tests.sh](https://github.com/mermaid-js/mermaid-cli/raw/refs/heads/master/run-tests.sh));
responsive `useMaxWidth` sizing otherwise makes output viewport-dependent.
Theme (`default` unless set; enum includes `base/dark/forest/neutral/neo…`)
and `look` (`classic` default) also change output bytes and must be pinned
([config schema](https://mermaid.js.org/schemas/config.schema.json)).

**Layout backends.** Default `layout` is `dagre`; ELK layouts load from a
separate `@mermaid-js/layout-elk` bundle registered via
`registerLayoutLoaders`
([config schema](https://mermaid.js.org/schemas/config.schema.json);
[src/index.js](https://github.com/mermaid-js/mermaid-cli/raw/refs/heads/master/src/index.js)).
Pin the layout package version alongside mermaid: same source text can lay
out differently across layout-engine releases.

## 3. Sanitization story

There are three layers, and AzeForge needs all three because each covers a
different gap.

**Layer 1 — Mermaid's own level (necessary, not sufficient).**
`securityLevel` defaults to `strict`: "HTML tags in the text are encoded and
click functionality is disabled"; `antiscript` allows HTML but removes script
elements; `loose` allows HTML with clicks; `sandbox` renders everything in a
sandboxed iframe at the cost of interactivity
([config schema](https://mermaid.js.org/schemas/config.schema.json),
`securityLevel`; [usage docs](https://mermaid.js.org/config/usage.html),
"securityLevel"). Upstream is candid that built-in sanitization is
best-effort: "We still make an effort to sanitize the incoming code… but it
is hard to guarantee that there are no loop holes"
([README](https://github.com/mermaid-js/mermaid), "Security and safe
diagrams"). Keep `strict`, and rely on the `secure` array —
`["secure","securityLevel","startOnLoad","maxTextSize","suppressErrorRendering","maxEdges"]`
— which "controls which `currentConfig` keys… can only be changed via call to
`mermaid.initialize`" so "malicious graph directives" cannot override site
security defaults
([config schema](https://mermaid.js.org/schemas/config.schema.json), `secure`).
Untrusted diagram text must never reach `mermaid.initialize`.

**Layer 2 — DOMPurify post-pass on the emitted SVG (the ticket's core).**
Mermaid already depends on `dompurify ^3.4.12`
([package.json](https://github.com/mermaid-js/mermaid/raw/refs/heads/develop/packages/mermaid/package.json))
and exposes a `dompurifyConfig` object that is "Configuration options to pass
to the `dompurify` library"
([schema docs](https://mermaid.js.org/config/schema-docs/config-properties-dom-purify-configuration.html)),
but AzeForge must additionally sanitize the final SVG string itself with
DOMPurify (current release 3.4.14, per its
[README](https://github.com/cure53/DOMPurify)) because Mermaid's internal
pass protects labels, not the embedding context. The default lists give the
post-pass almost everything the ticket names for free:

- `script` and `foreignobject` are in `svgDisallowed`, alongside `animate`,
  `set`, `use`, `discard`, `cursor`, and others — known-but-blocked so
  namespace checks stay correct
  ([src/tags.ts](https://github.com/cure53/DOMPurify/raw/refs/heads/main/src/tags.ts)).
  They are therefore stripped from default-profile output.
- Event-handler attributes (`onclick`, …) appear in neither the HTML nor the
  SVG attribute allow-lists
  ([src/attrs.ts](https://github.com/cure53/DOMPurify/raw/refs/heads/main/src/attrs.ts)),
  and "anything not on the allow-list is implicitly removed"
  ([allow-list wiki](https://github.com/cure53/DOMPurify/wiki/Default-TAGs-ATTRIBUTEs-allow-list-&-blocklist)).
- `FORBID_TAGS` / `FORBID_ATTR` are empty by default and "always win over
  allow-lists" (same wiki) — the sketch in §6 uses them to go beyond
  defaults (`foreignObject` belt-and-braces, `style`-attr `url()` exfiltration
  is covered by URI checks below).
- URL attributes are constrained by the default `ALLOWED_URI_REGEXP`, which
  permits only `(protocol-)relative URLs, http, https, ftp, ftps, tel,
  mailto, callto, sms, cid, xmpp and matrix` — `javascript:` and other
  unknown schemes are rejected unless `ALLOW_UNKNOWN_PROTOCOLS` is set
  ([README](https://github.com/cure53/DOMPurify), "Control permitted
  attribute values"). Note `href` (SVG attrs) and `xlink:href` (XML attrs)
  *are* allow-listed, so remote `<image href>` / external paint-server refs
  survive sanitization when they use `https:` — an offline/privacy leak, not
  XSS. Strip or proxy them in the AzeForge pass (sketch §6).
- `style` attributes are allow-listed (both HTML and SVG lists), so inline
  `style="…url(https://…)…"` can phone home; handle with a hook or CSP, not
  by forbidding `style` outright (Mermaid output needs it).
- Server-side DOMPurify requires a real DOM: upstream "strongly recommend[s]
  the latest version of jsdom" because older jsdom had XSS-relevant bugs, and
  states happy-dom "is not considered safe" with DOMPurify
  ([README](https://github.com/cure53/DOMPurify), "Running DOMPurify on the
  server"). AzeForge's Node sanitizer must use current jsdom, never
  happy-dom.
- DOMPurify is not re-entrant: never call `sanitize()` inside a hook; use
  `setConfig` or sanitize collected fragments after the outer pass returns
  ([README](https://github.com/cure53/DOMPurify), "A note on calling
  `sanitize()` from a hook").

**Layer 3 — embedding context (spec-guaranteed).** SVG 2 defines processing
modes: SVG loaded via HTML `<img>` (or CSS image, SVG `<image>`) *must* use
secure animated/static mode — "script execution: no, external references: no,
interactivity: no" — consistent with HTML's requirement that image sources be
"non-interactive, optionally animated… neither paged nor scripted", while
*inline* SVG fragments "must use a processing mode that matches that of the
host document", i.e. fully dynamic, and `foreignObject` content inherits the
surrounding mode
([SVG2 conformance](https://www.w3.org/TR/SVG2/conform.html), §§2.2–2.3).
Consequences: file/SVG-fragment outputs referenced with `<img>` get a
spec-level script/interactivity kill-switch *in addition to* sanitization;
inline SVG in AzeForge HTML output is full-dynamic and therefore the DOMPurify
pass is load-bearing there, never optional.

**PNG/PDF.** Both derive from the rendered page (screenshot / `page.pdf`),
not from the SVG string
([src/index.js](https://github.com/mermaid-js/mermaid-cli/raw/refs/heads/master/src/index.js)),
so they inherit whatever the headless page executed — sanitize-before-raster
still matters for the shared SVG artifact, but raster outputs carry no live
script themselves.

## 4. CSP precedents

- MDN's CSP guide: policy is delivered via the `Content-Security-Policy`
  header (preferred; `<meta http-equiv>` "does not support all CSP
  features"), expressed as `directive value; …` rules; fetch directives
  (`script-src`, `style-src`, `img-src`, `default-src 'self'`, …) control
  which resource classes load; and CSP is explicitly "defense in depth" —
  "not an alternative to sanitizing input. Websites should sanitize input
  *and* set a CSP"
  ([MDN CSP guide](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)).
  The §22 "content-security policy on interactive components" maps to the
  browser editor / MCP App UI surfaces, not to static artifacts.
- Mermaid-specific precedent: the CLI README warns that `--cssFile` inline
  `<style>` "may be blocked by your browser, depending on the HTTP
  Content-Security-Policy header of the website that hosts your SVG"
  ([README](https://github.com/mermaid-js/mermaid-cli), "Animating an SVG
  file with custom CSS"). So custom `themeCSS`/CSS-file content and host CSPs
  interact: AzeForge themes must ship CSP-compatible styles (no inline event
  handlers; expect `style-src` restrictions on custom CSS).
- Trusted Types intersection for later interactive work: DOMPurify supports
  `RETURN_TRUSTED_TYPE` and `TRUSTED_TYPES_POLICY: null` (opt out of its
  internal `dompurify` policy when the host CSP allow-lists only the app's
  own policy)
  ([README](https://github.com/cure53/DOMPurify), Trusted Types section).
  Relevant to the deferred browser/MCP-App surface, not P0 static output.

## 5. Failure isolation (bad diagram block)

- Library level: `mermaid.render` throws on invalid definitions (the CLI
  source comments "should throw an error if mmd diagram is invalid" at the
  render call) and `mermaid.parse` throws unless `suppressErrors` is set
  ([src/index.js](https://github.com/mermaid-js/mermaid-cli/raw/refs/heads/master/src/index.js);
  [usage docs](https://mermaid.js.org/config/usage.html)).
- Default rendering inserts a 'Syntax error' diagram into the DOM instead of
  failing: `suppressErrorRendering` "Suppresses inserting 'Syntax error'
  diagram in the DOM", default `false`
  ([schema docs](https://mermaid.js.org/config/schema-docs/config-properties-suppresserrorrendering.html)).
  AzeForge batch builds should set it `true` and convert the thrown error
  into a per-block diagnostic (source line + message), never a crash.
- CLI precedent: invalid input is a first-class case — the repo keeps
  `test-negative/invalid.expect-error.mmd` (`sequenceDiagram /
  Nothing:Valid`) with a puppeteer-timeout config
  ([test-negative](https://github.com/mermaid-js/mermaid-cli)), and the CLI's
  `error()` helper prints to stderr and exits 1
  ([src/index.js](https://github.com/mermaid-js/mermaid-cli/raw/refs/heads/master/src/index.js)).
  Mirror that: per-diagram error object in JSON diagnostics, nonzero CLI
  exit, remaining blocks still render.
- Resource caps exist for hostile input: `maxTextSize` (default 50000
  characters) and `maxEdges` (default 500, minimum 0) bound input size and
  graph complexity, and both are in the `secure` array so directives cannot
  raise them
  ([config schema](https://mermaid.js.org/schemas/config.schema.json)).
  These complement §22 time/memory/recursion limits; they do not replace
  them (no wall-clock cap exists in Mermaid config — enforce timeouts around
  the render call, e.g. per-diagram Puppeteer timeout as in the CLI's
  negative-test config).

## 6. Sanitizer configuration sketch (adoptable)

```ts
import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom'; // current jsdom only; never happy-dom

const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

// Mermaid-side config (passed to mermaid.initialize; all security-relevant
// keys are `secure` so diagram directives cannot override them):
const mermaidConfig = {
  securityLevel: 'strict',
  deterministicIds: true,
  deterministicIDSeed: '<azeforge-pinned-seed>',
  handDrawnSeed: 7,           // only matters for look:"handDrawn" (default 0 = random)
  maxTextSize: 50000,
  maxEdges: 500,
  suppressErrorRendering: true, // we surface per-block diagnostics ourselves
  theme: 'default',             // pin; pin fontFamily stack + layout pkg version too
  startOnLoad: false,
};

// Post-render SVG sanitizer (load-bearing for inline-HTML embedding;
// defense-in-depth for <img>-referenced SVG, which is already
// secure-mode per SVG2):
const cleanSvg = DOMPurify.sanitize(dirtySvg, {
  USE_PROFILES: { svg: true },   // no HTML/MathML, no svgFilters needed
  FORBID_TAGS: ['foreignObject', 'style', 'image', 'use'],
  // foreignObject: HTML-in-SVG inherits host mode when inlined — strip.
  // image/use: external refs (https: hrefs survive the URI regexp) leak
  //   offline builds; re-allow only with vendored data: URIs if needed.
  FORBID_ATTR: ['style'],        // blocks style="url(...)" exfiltration…
  // …but Mermaid needs presentation attributes, which are NOT style attrs
  // (fill/stroke/... stay allow-listed). If dropping `style` breaks a pinned
  // theme, replace FORBID_ATTR with an uponSanitizeAttribute hook that strips
  // only url()/expression()/behavior values and KEEP_CONTENT default true.
  ALLOW_ARIA_ATTR: true,   // keeps <title>/<desc> accessibility metadata
  ALLOW_DATA_ATTR: false,  // diagrams don't need data-*; reduce surface
  KEEP_CONTENT: true,      // default: keep text when a wrapper is removed
});
// Throw (→ per-block diagnostic, exit≠0) if DOMPurify.removed reveals
// script/on*/javascript: attempts? No — `removed` is explicitly "just a
// little helper… do NOT use for security decisions" (DOMPurify README).
// Log it for telemetry only.
```

CSP for interactive surfaces (§22, browser editor / MCP App UI — *not*
static artifacts):

```http
Content-Security-Policy:
  default-src 'self';
  script-src 'self';
  object-src 'none';
  img-src 'self' data:;
  style-src 'self';
  trusted-types <app-policy>;
```

(Header delivery, not `<meta>`; fetch-directive and defense-in-depth
rationale per MDN. `object-src 'none'` blocks `<object>/<embed>` fallback
execution paths; inline-SVG pages get no `unsafe-inline` script.)

## 7. Notes for the output-strategy decision (#1)

1. Prefer `<img src="…svg">` (or rasterized PNG) over inline `<svg>` in HTML
   output wherever interactivity is not required — SVG2 secure-mode removes
   script/external/interaction at the UA level.
2. Inline SVG is the only case where the DOMPurify pass is load-bearing;
   keep it unconditional regardless of embedding choice so fragments stay
   safe to copy between contexts.
3. Determinism checklist: `deterministicIds: true` + fixed seed, fixed
   `handDrawnSeed`, pinned `theme`/`fontFamily` (bundled fonts),
   `useMaxWidth: false` for raster, pinned mermaid + layout + jsdom +
   DOMPurify versions, `XMLSerializer`-style serialization.
4. Failure contract: `suppressErrorRendering: true` + `mermaid.parse`
   pre-check → per-block `{ blockId, line, message }` diagnostic, nonzero
   exit, sibling blocks unaffected.

## Sources

- Mermaid source/config: `config.schema.json`
  (`https://mermaid.js.org/schemas/config.schema.json`); `packages/mermaid/
  package.json` v11.17.2; usage docs (`/config/usage.html`); schema property
  pages (`dompurifyConfig`, `suppressErrorRendering`); README "Security and
  safe diagrams".
- mermaid-cli: `src/index.js` (render pipeline), `src/puppeteerIntercept.js`
  (offline intercept), `package.json` v11.17.0, `run-tests.sh`,
  `test-positive/config-deterministic.json`,
  `test-negative/invalid.expect-error.mmd`, `docs/linux-sandbox-issue.md`.
- DOMPurify: README (config reference, server-side jsdom guidance,
  Trusted Types, non-reentrancy), `src/tags.ts`, `src/attrs.ts`, default
  allow-list wiki.
- MDN: Content Security Policy guide.
- W3C: SVG 2, Chapter 2 (Conformance Criteria / processing modes).
