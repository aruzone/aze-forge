# PDF backend options for the offline CLI (ticket #2)

Scope: ticket #2 question — which PDF production path the P0 build-ready spec should lock for the
Node 22+ TypeScript CLI, offline, with no TeX install for non-circuit documents — against blueprint
§19 (output strategy), §28 (acceptance criteria), and §32.1 (default: HTML/CSS through a controlled
headless browser). Non-goals: math pipeline (#3), Mermaid (#4), circuit backend (#5), and any final
decision — facts plus a recommendation only.

## Recommendation (for the later output-strategy decision, not a decision)

Lock P0 PDF to **paged HTML → `page.pdf()` via `puppeteer-core` driving a pinned
`chrome-headless-shell` binary from Chrome for Testing (CfT)**, with **`pdf-lib` as a
post-processor** for deterministic metadata (fixed `CreationDate`/`ModDate`/producer). Rationale:

1. It is the only path that satisfies all of §19 (HTML-first, no TeX install), §28 (offline, no
   overlap/disappearance at page boundaries, PDF page-count/metadata assertions), and §32.1
   (controlled headless browser default) with one shared HTML→print pipeline for preview and PDF.
2. `chrome-headless-shell` is the smallest supported Chromium download (~40% smaller zips than full
   Chrome, measured below), and `puppeteer-core` avoids Puppeteer's automatic browser download so the
   CLI fully owns the pinned binary.
3. `Page.pdf()`/`PDFOptions` expose every pagination lever the golden report needs (`@page` size via
   `preferCSSPageSize`, margins, header/footer templates, tagged output), and `pdf-lib` closes the
   one gap Chromium leaves open (no creation-date override).

## Candidate paths compared

### A (recommended): `puppeteer-core` + pinned `chrome-headless-shell`, print CSS → `page.pdf()`

- `Page.pdf()` "generates a PDF of the page with the `print` CSS media type" and returns
  `Promise<Uint8Array>`; calling `page.emulateMediaType('screen')` first switches to screen media
  ([Page.pdf()](https://pptr.dev/api/puppeteer.page.pdf)).
- Puppeteer "downloads and uses a specific version of Chrome so its API is guaranteed to work out of
  the box", and an alternate executable can be passed via `launch({ executablePath })`
  ([Configuration](https://pptr.dev/guides/configuration)). `puppeteer-core` ignores Puppeteer's
  configuration files and environment variables ([Configuration](https://pptr.dev/guides/configuration)),
  which is exactly what we want: the CLI resolves the CfT-pinned binary itself and passes
  `executablePath`, so installs are reproducible and never implicitly re-downloaded.
- `chrome-headless-shell` is the old headless mode shipped as a separate binary, selected with
  `headless: 'shell'`; it "does not match the behavior of the regular Chrome completely but it is
  currently more performant for automation tasks where the complete Chrome feature set is not
  needed" ([Headless mode](https://pptr.dev/guides/headless-modes)). Since Chrome 132 the old
  headless ships only as the `chrome-headless-shell` binary downloadable from the Chrome for Testing
  dashboard ([Chrome Headless mode](https://developer.chrome.com/docs/automation-and-testing/headless)).
- Version pinning story: `@puppeteer/browsers install chrome@116.0.5793.0` downloads one exact CfT
  build; `chrome@117` / `chrome@stable` resolve within a milestone/channel
  ([@puppeteer/browsers](https://pptr.dev/browsers-api/)); the CfT project publishes
  `known-good-versions-with-downloads.json`, `last-known-good-versions-with-downloads.json`,
  per-milestone/per-build endpoints, and per-version files (e.g. `123.0.6309.0.json`) covering the
  binary × platform matrix, with `chrome-headless-shell` supported since v120.0.6098.0 on
  `linux64`, `mac-arm64`, `mac-x64`, `win32`, `win64` (plus `linux-arm64` since v153)
  ([chrome-for-testing](https://github.com/GoogleChromeLabs/chrome-for-testing)).
  Browsers cache to `~/.cache/puppeteer` since Puppeteer v19, relocatable via `cacheDirectory` /
  `PUPPETEER_CACHE_DIR` ([Configuration](https://pptr.dev/guides/configuration),
  [Troubleshooting](https://pptr.dev/troubleshooting)).
- Node fit: current `puppeteer` declares `engines: { node: ">=22.12.0" }` (npm registry metadata for
  `puppeteer@25.10.0`, checked 2026-09-04), matching the Node 22+ CLI floor.
- Offline: render via `page.setContent()` or `file://` with local assets only; Chrome's
  `HttpsFirstBalancedModeAutoEnable` can fail remote `http://` navigations with
  `net::ERR_BLOCKED_BY_CLIENT`, while "local HTTP hosts do not trigger a warning"
  ([Troubleshooting](https://pptr.dev/troubleshooting)) — another reason to keep the P0 path on
  `setContent`/`file://` plus a `--disable-features=HttpsFirstBalancedModeAutoEnable` escape hatch.

### B: Playwright (`playwright-core`) + its Chromium build

- Playwright "needs specific versions of browser binaries"; bare `npx playwright install` installs
  the default browsers, and each Playwright release may require re-running install
  ([Browsers](https://playwright.dev/docs/browsers)). Default set spans Chromium, WebKit, and
  Firefox ([Browsers § Configure](https://playwright.dev/docs/browsers)), so a naive install is far
  heavier than Puppeteer's Chrome-only download.
- Mitigations exist: `--only-shell` installs only the headless shell for headless runs, `--no-shell`
  skips the shell when using the new headless mode ([Browsers](https://playwright.dev/docs/browsers)).
  `playwright-core@1.62.1` declares `engines: { node: ">=20" }` (npm registry metadata), so Node 22
  is fine.
- Verdict: viable fallback, but heavier default distribution and a second browser-revision lockfile
  to track for zero PDF advantage (same Chromium print engine). Prefer A; keep B as the documented
  escape hatch if Puppeteer's CfT supply ever lags.

### C: raw CLI `--print-to-pdf` against a system Chrome

- Headless Chrome exposes `--print-to-pdf` (and `--dump-dom`, `--screenshot`) with no Node API
  ([Headless Chrome shell](https://developer.chrome.com/docs/automation-and-testing/headless-chrome-shell)).
- Verdict: same engine, but no programmatic control of paper/margins/header-footer, no
  `document.fonts.ready` gating, and it depends on whatever Chrome the user happens to have —
  violates the "controlled" in §32.1. Useful only as a smoke-test tool, not the P0 backend.

### D: pure-JS PDF construction (`pdf-lib`, PDFKit) as the renderer

- `pdf-lib`'s model is imperative and manual: `addPage(page?)`, `embedFont`/`embedStandardFont`,
  `drawText`, and explicit metadata setters (`setTitle`, `setAuthor`, `setSubject`, `setKeywords`,
  `setProducer`, `setCreator`, `setCreationDate`, `setModificationDate`, `setLanguage`)
  ([PDFDocument](https://pdf-lib.js.org/docs/api/classes/pdfdocument)). There is no HTML/CSS layout,
  pagination, or fragmentation engine — the CLI would hand-roll page breaking for prose, tables,
  equations, and diagrams.
- Verdict: reject as the P0 *renderer* (fails §28 pagination acceptance by construction); adopt as
  the *post-processor* for deterministic metadata (see Determinism).

### E (deferred per blueprint): LaTeX / Typst backends

- Blueprint §19 explicitly defers "publication-grade LaTeX or Typst backends" until after the source
  model and plugin boundaries stabilize, to avoid requiring a TeX installation
  (`azeforge-product-blueprint.md` §19). No further investigation needed for P0.

## Distribution story and install footprint (macOS / Linux / Windows)

- CfT ships `chrome` and `chrome-headless-shell` zips for `linux64`, `mac-arm64`, `mac-x64`,
  `win32`, `win64` ([chrome-for-testing](https://github.com/GoogleChromeLabs/chrome-for-testing)).
- Measured 2026-09-04 against Stable `152.0.7977.82` first-party CfT URLs (HEAD `content-length`):
  - `linux64`: full Chrome `194,031,103` B (~185.0 MiB) vs headless shell `119,454,769` B (~113.9 MiB).
  - `mac-arm64`: full Chrome `187,616,945` B (~178.9 MiB) vs headless shell `97,760,996` B (~93.2 MiB).
  - Unzipped on disk is roughly 1.5–2× the zip; treat the numbers above as compressed-transfer cost.
- Linux additionally needs system shared libraries (Debian list includes `ca-certificates`,
  `fonts-liberation`, `libnss3`, `libgbm1`, etc.) diagnosable with `ldd chrome | grep not`; the
  authoritative list lives in Chromium's `dist_package_versions.json`
  ([Troubleshooting](https://pptr.dev/troubleshooting)). No `arm64` Linux binaries are provided for
  the default download — "Linux binaries downloaded by default will not work on Linux arm64"
  ([Troubleshooting](https://pptr.dev/troubleshooting)); note CfT added `linux-arm64` only recently
  (v153+) ([chrome-for-testing](https://github.com/GoogleChromeLabs/chrome-for-testing)), so gate
  that platform on the pinned milestone.
- Windows needs sandbox ACLs on the downloaded files (`icacls … /grant *S-1-15-2-1:(OI)(CI)(RX)`,
  auto-applied since Puppeteer v22.14.0 via the bundled `setup.exe`)
  ([Troubleshooting](https://pptr.dev/troubleshooting)); macOS browser-downloaded zips may trip
  Gatekeeper (`xattr -cr`, avoided by downloading via `@puppeteer/browsers`/`curl`/`wget`)
  ([chrome-for-testing](https://github.com/GoogleChromeLabs/chrome-for-testing)).
- Package managers that block install scripts (npm with script-blocking, pnpm, Yarn Berry, Bun,
  Deno) skip Puppeteer's postinstall browser download; recovery is `npx puppeteer browsers install`
  ([Troubleshooting](https://pptr.dev/troubleshooting)). Using `puppeteer-core` plus an explicit
  first-run `azeforge setup` / lazy-download step sidesteps this class entirely and keeps the base
  npm package free of a ~100–185 MiB binary (cf. blueprint decision 13, no heavy bundled payloads).
- P0.5 note: none of this covers the circuit backend's TeX distribution question (#5); keep the PDF
  binary story independent of it.

## Determinism levers (fonts, timestamps, metadata)

- Fonts: `PDFOptions.waitForFonts` (default `true`) "waits for `document.fonts.ready` to resolve"
  ([PDFOptions](https://pptr.dev/api/puppeteer.pdfoptions)). P0 should additionally (a) ship or pin
  the report fonts and load them via `@font-face` from local files (never system-font fallback, which
  varies per OS — the Linux dependency list itself ships `fonts-liberation`
  ([Troubleshooting](https://pptr.dev/troubleshooting))), (b) keep `waitForFonts: true` and bring the
  page to front if backgrounded, and (c) record the font package hash in build metadata so
  "deterministic tests pass across repeated builds on the same platform" (blueprint §30) is actually
  testable. Cross-platform byte-identical PDFs are a non-goal (blueprint §7 disclaims pixel-perfect
  parity); same-platform content-hash equality is the §28 bar
  (`azeforge-product-blueprint.md` §28: "same source and compiler version … content hashes match").
- Colors: `page.pdf()` "generates a pdf with modified colors for printing" by default; force exact
  colors with `-webkit-print-color-adjust`
  ([Page.pdf()](https://pptr.dev/api/puppeteer.page.pdf)). The standard property is
  `print-color-adjust: exact` ("appearance … should not be changed except by the user's request";
  default `economy` lets the agent drop backgrounds/remap colors)
  ([MDN print-color-adjust](https://developer.mozilla.org/en-US/docs/Web/CSS/print-color-adjust)).
  The report stylesheet must set `print-color-adjust: exact` (+ `-webkit-` prefix) on themed blocks
  and pass `printBackground: true`, or KaTeX/Mermaid colors will shift between HTML preview and PDF.
- Timestamps/metadata: `PDFOptions` exposes no creation-date override — its full property list is
  `displayHeaderFooter`, `footerTemplate`, `format`, `headerTemplate`, `height`, `landscape`,
  `margin`, `omitBackground`, `outline`, `pageRanges`, `path`, `preferCSSPageSize`,
  `printBackground`, `scale`, `tagged`, `timeout`, `waitForFonts`, `width`
  ([PDFOptions](https://pptr.dev/api/puppeteer.pdfoptions)). So Chromium-stamped dates/IDs must be
  normalized after the fact: reload the bytes in `pdf-lib` and call `setCreationDate`,
  `setModificationDate` (fixed value, e.g. `SOURCE_DATE_EPOCH` or a CLI `--fixed-date`), plus
  `setProducer`/`setCreator`/`setTitle` as needed
  ([PDFDocument](https://pdf-lib.js.org/docs/api/classes/pdfdocument)). This two-step
  (render → normalize → hash) is what makes the §28 content-hash acceptance criterion achievable and
  gives the §29 "PDF metadata and page-count assertions" golden test a stable target.
- Bonus: `tagged: true` (default) and experimental `outline: true` in `PDFOptions`
  ([PDFOptions](https://pptr.dev/api/puppeteer.pdfoptions)) give accessible, navigable PDFs nearly
  free — wire headings into the outline and assert on it in golden tests.

## Pagination control for multi-page reports (§28: headings, tables, technical objects)

- Page geometry: `@page` sets "page's dimensions, orientation, and margins", with `:left`/`:right`/
  `:first` pseudo-classes and named pages via the `page` property
  ([MDN @page](https://developer.mozilla.org/en-US/docs/Web/CSS/@page)). Chromium also honors
  `@page { size: … }` when `preferCSSPageSize: true` — otherwise content is scaled to the
  `PDFOptions` `format`/`width`/`height` (default `format: 'letter'`)
  ([PDFOptions](https://pptr.dev/api/puppeteer.pdfoptions)). P0 should own geometry in CSS
  (`@page { size: A4; margin: … }` + `preferCSSPageSize: true`) so preview CSS and PDF agree.
- Keep-together: `break-inside: avoid` (legacy alias `page-break-inside: avoid`) "avoids any break
  … inserted within the principal box"; the `break-before`/`break-after`/`break-inside` triple
  jointly decides each breakpoint, with forced values (`page`, …) taking precedence over avoid
  values ([MDN break-inside](https://developer.mozilla.org/en-US/docs/Web/CSS/break-inside)). This
  is the mechanism for the §28 rule that "headings, tables, and technical objects do not overlap or
  disappear at page boundaries": apply `break-inside: avoid` to tables, figures, equation blocks,
  and diagram containers; `break-after: avoid` / `break-before: avoid-page` on headings;
  `orphans`/`widows` floors on prose (CSS Fragmentation, [css-break-3](https://www.w3.org/TR/css-break-3/)).
- Chrome-provided pagination chrome: `displayHeaderFooter` with `headerTemplate`/`footerTemplate`
  supporting `pageNumber`/`totalPages` (plus `date`/`title`/`url`)
  ([PDFOptions](https://pptr.dev/api/puppeteer.pdfoptions)) covers running heads/feet and "Page X of
  Y" without hand-rolled margin boxes. Note `date` defaults to the current date — either omit it or
  feed a fixed value, or determinism breaks.
- Limits to encode in the later spec: over-constrained `avoid` rules can push large tables/figures
  onto overflow pages or clip them; oversized SVG/PNG technical objects need max-height + scale-down
  rules; `scale` must stay in `0.1–2` ([PDFOptions](https://pptr.dev/api/puppeteer.pdfoptions)).
  `pageRanges` (e.g. `1-5, 8, 11-13`) ([PDFOptions](https://pptr.dev/api/puppeteer.pdfoptions)) is a
  useful diagnostics/repro lever, not a default.
- PNG shares the path: `--screenshot` renders the same HTML ([Headless Chrome shell](https://developer.chrome.com/docs/automation-and-testing/headless-chrome-shell)),
  consistent with blueprint §19 ("Produced from HTML or SVG").

## Performance and resource limits

- Prefer the shell binary where full Chrome is unneeded (performance rationale,
  [Headless mode](https://pptr.dev/guides/headless-modes)); caveat: "chrome-headless-shell disables
  GPU compositing" unless launched with `--enable-gpu`
  ([Troubleshooting](https://pptr.dev/troubleshooting)) — irrelevant for the print-to-PDF path but
  relevant if PNG previews ever need GPU compositing.
- `PDFOptions.timeout` defaults to `30_000` ms, `0` disables
  ([PDFOptions](https://pptr.dev/api/puppeteer.pdfoptions)); the CLI must set an explicit budget,
  kill hung renders, and surface the timeout as a diagnostic (cf. §29 "untrusted input and timeout
  cases"). Run one browser instance per CLI invocation, one page per document, `setContent` with
  `waitUntil: networkidle0`-style settling plus `waitForFonts`, then close — no persistent daemon in P0.
- Memory scales with page count and embedded SVG/PNG size; cap input asset dimensions at validation
  time and reuse the same caps for PNG export.

## Failure modes with actionable diagnostics (CLI must map each to an error code + fix hint)

| Failure | Primary-source signal | Diagnostic to emit |
|---|---|---|
| Browser binary missing (`~/.cache/puppeteer` absent, new machine) | `Could not find expected browser locally`; fix via `PUPPETEER_CACHE_DIR=…` or `.puppeteerrc` `cacheDirectory` + reinstall ([Troubleshooting](https://pptr.dev/troubleshooting)) | `E_PDF_BROWSER_MISSING`: print expected path, pinned revision, and the exact `install chrome-headless-shell@<rev>` command |
| Install scripts blocked (pnpm/Yarn Berry/Bun/Deno) so no browser downloaded | "manually download … `npx puppeteer browsers install`" ([Troubleshooting](https://pptr.dev/troubleshooting)) | `E_PDF_BROWSER_MISSING` variant pointing at `azeforge setup` |
| `No usable sandbox!` on Linux (user namespaces, Docker, Ubuntu 23.10+ AppArmor) | "If you absolutely trust the content … `--no-sandbox`", "strongly discouraged", AppArmor profile `/etc/apparmor.d/chrome` blocks CfT user namespaces ([Troubleshooting](https://pptr.dev/troubleshooting)) | `E_PDF_SANDBOX`: prefer sandbox setup (non-root user per the Docker guide's `pptruser` pattern) over `--no-sandbox`; link the AppArmor workaround |
| Missing system libs on Linux | `ldd chrome \| grep not` + Debian/CentOS dependency lists ([Troubleshooting](https://pptr.dev/troubleshooting)) | `E_PDF_SYS_DEPS`: list missing `.so`s and the `apt`/`yum` packages |
| Windows sandbox ACL errors | `sandbox_win.cc … Access is denied`, `icacls` grant ([Troubleshooting](https://pptr.dev/troubleshooting)) | `E_PDF_SANDBOX` with the `icacls` command |
| macOS "damaged app" Gatekeeper quarantine | `xattr -cr` after browser-based zip download ([chrome-for-testing](https://github.com/GoogleChromeLabs/chrome-for-testing)) | `E_PDF_BROWSER_QUARANTINED` with the `xattr` command |
| Remote-URL navigation blocked (`ERR_BLOCKED_BY_CLIENT`) | `HttpsFirstBalancedModeAutoEnable`; local hosts unaffected ([Troubleshooting](https://pptr.dev/troubleshooting)) | `E_PDF_OFFLINE`: refuse remote URLs in offline mode, render from `setContent`/`file://` |
| Fonts not ready / FOUT in PDF | `waitForFonts` waits on `document.fonts.ready` ([PDFOptions](https://pptr.dev/api/puppeteer.pdfoptions)) | `E_PDF_FONTS`: name the missing `@font-face` source; fail closed rather than shipping fallback-font output |
| Render timeout / hung page | `timeout` default `30_000` ([PDFOptions](https://pptr.dev/api/puppeteer.pdfoptions)) | `E_PDF_TIMEOUT`: report budget, page/asset that hung, and retry flags |
| Read-only container profile writes fail | `chrome_crashpad_handler: --database is required`; set `XDG_CONFIG_HOME`/`XDG_CACHE_HOME` and `userDataDir` to writable paths ([Troubleshooting](https://pptr.dev/troubleshooting)) | `E_PDF_PROFILE_DIR` with the env overrides |
| Alpine Linux | "Chrome does not support Alpine out of the box" ([Troubleshooting](https://pptr.dev/troubleshooting)) | `E_PDF_UNSUPPORTED_PLATFORM`, early and explicit |

## Open questions for the build-ready spec (not this ticket)

1. Pin one CfT revision per release in the CLI manifest; define the update cadence (Playwright
   re-pins every release — [Browsers](https://playwright.dev/docs/browsers) — we should adopt the
   same discipline on our own schedule).
2. Decide `puppeteer-core` vs a raw CDP client for driving `Page.printToPDF` long-term; both sit on
   the same protocol, Puppeteer just owns the launch/version matrix today.
3. Define the fixed-date policy (`SOURCE_DATE_EPOCH` vs explicit flag) and which metadata fields the
   content hash covers.
4. Specify the pagination stylesheet contract (which blocks get `break-inside: avoid`, `@page`
   sizes per doctype) as testable CSS, with golden fixtures that force page-boundary collisions.

## Sources (primary only)

- Puppeteer: `Page.pdf()` / `PDFOptions` / `Configuration` / `Headless mode` / `@puppeteer/browsers` /
  `Troubleshooting` — https://pptr.dev/
- Chrome Headless mode & Headless shell CLI (`--print-to-pdf`, `--screenshot`, `--headless`) —
  https://developer.chrome.com/docs/automation-and-testing/headless,
  https://developer.chrome.com/docs/automation-and-testing/headless-chrome-shell
- Chrome for Testing JSON endpoints, supported binaries/platforms, macOS Gatekeeper note —
  https://github.com/GoogleChromeLabs/chrome-for-testing
- Playwright Browsers (`install`, `--only-shell`/`--no-shell`, Chromium/WebKit/Firefox set) and
  `Page` API — https://playwright.dev/docs/browsers
- CDP `Page.printToPDF` domain (underlying protocol method) —
  https://chromedevtools.github.io/devtools-protocol/tot/Page/#method-printToPDF
- CSS Paged Media 3 (`@page`), CSS Fragmentation (`break-inside`, forced/avoid precedence) —
  https://www.w3.org/TR/css-page-3/, https://www.w3.org/TR/css-break-3/ ; MDN `@page`,
  `break-inside`, `print-color-adjust` — https://developer.mozilla.org/
- `pdf-lib` `PDFDocument` (post-process metadata setters) — https://pdf-lib.js.org/docs/api/classes/pdfdocument
- Package metadata (`puppeteer@25.10.0` engines `node >=22.12.0`,
  `playwright-core@1.62.1` engines `node >=20`) — https://registry.npmjs.org/
- CfT Stable `152.0.7977.82` asset sizes via HEAD on
  `https://storage.googleapis.com/chrome-for-testing-public/…` (first-party CfT storage),
  measured 2026-09-04.
- Blueprint requirements: `azeforge-product-blueprint.md` §§19, 28, 30, 32.1.
