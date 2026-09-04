# Circuit backend distribution and licensing — research findings

Ticket #5. Facts + distribution matrix only. No grammar design, no timing-block
design, no decision. Blueprint refs: §24 (P0.5 circuit scope, renderer decision,
acceptance criteria), §31 M4 (one-week spike), §36 (pilot-ready gates).

## 1. CircuiTikZ license and what it obliges

- CTAN lists CircuiTikZ 1.8.6 (2026-05-24) under **two** licenses: GNU General
  Public License and LaTeX Project Public License
  ([CTAN package page](https://ctan.org/pkg/circuitikz)).
- The upstream repo's README states the work "may be distributed and/or
  modified 1. under the LaTeX Project Public License **and/or** 2. under the
  GNU Public License" — i.e. the licensee chooses
  ([circuitikz README](https://github.com/circuitikz/circuitikz)); the repo
  ships both `doc/lppl-1-3c_license.txt` and `doc/gpl-3.0_license.txt`
  (same page, Files listing).
- TeX Live's package database records `catalogue-license lppl gpl`,
  `catalogue-version 1.8.6` for `circuitikz`
  (primary: `tlpkg/texlive.tlpdb` in the TeX Live network repo,
  [tlnet](https://mirror.ctan.org/systems/texlive/tlnet/tlpkg/texlive.tlpdb)).
- LPPL 1.3c obligations that matter for AzeForge (all from the
  [license text](https://www.latex-project.org/lppl/lppl-1-3c/)):
  - **Running is unrestricted.** Clause 1: "the act of running the Work is not
    restricted." Shelling out to a user's own TeX install triggers no
    obligation.
  - **Verbatim redistribution is allowed.** Clause 2: a complete, unmodified
    copy may be distributed as received. So vendoring the CTAN zip
    (4.4 MB, per the CTAN page) or pinning `circuitikz.sty` beside generated
    sources is permitted if shipped whole and unmodified.
  - **Modified copies carry conditions.** Clause 6 (non-maintainer): a
    replacement component must identify itself as modified when used
    interactively (6a), carry prominent change notices or a change log (6b),
    not imply author support (6c), and ship with (or point to) a complete
    unmodified copy of the Work (6d).
  - **Aggregation is free.** Clause 11: "no restrictions on aggregating such
    works with the Work by any means." An MIT-licensed adapter that *uses*
    CircuiTikZ without copying it is an aggregate, not a derived work.
- Practical consequence, stated as fact not advice: the adapter path needs no
  license grant beyond what CTAN/TUG already give, **provided** (a) we do not
  fork or patch `circuitikz.sty` (else 6a–6d bite), and (b) any vendored copy
  keeps the copyright/maintainer notices intact (CTAN names Massimo Redaelli,
  Stefan Erhardt, Stefan Lindner, Romano Giannetti as copyright holders).
- Declared upstream dependencies (same README): TikZ/PGF graphics library
  ≥ 3.1.5b, `xstring` (2009/03/13+), `siunitx` v2+. The README also notes
  CircuiTikZ "is included within the major latex distributions (Texlive,
  Miktex)" and otherwise is a single-file drop-in (`circuitikzgit.sty`).

## 2. What a minimal TeX install actually contains (tlpdb proof)

Membership of the P0.5-relevant TeX packages, read from `texlive.tlpdb`
(same tlnet source as above; `awk` on `depend` lines under each
`collection-*` entry):

| TeX package | Lives in | In scheme-small? | In scheme-medium? |
|---|---|---|---|
| `circuitikz` | `collection-pictures` | **No** | **No** |
| `pgf` (TikZ) | `collection-pictures` | **No** | **No** |
| `standalone` (doc class) | `collection-latexextra` | **No** | **No** |
| `xstring` | `collection-latexextra` | **No** | **No** |
| `siunitx` | `collection-mathscience` | **No** | Yes |
| `dvisvgm` (binary) | `collection-binextra` | **No** | Yes |

Scheme definitions from the same file: `scheme-basic` = `collection-basic` +
`collection-latex`; `scheme-small` = basic + latex + latexrecommended +
metapost + xetex + assorted extras ("small scheme (basic + xetex, metapost, a
few languages)"); `scheme-medium` adds binextra, mathscience, luatex, fonts,
more languages — but **not** pictures or latexextra. Only `scheme-full`
(and the full MacTeX/MiKTeX-complete installs) contain everything.

Conclusion that falls out of the data: **no minimal scheme ships the circuit
stack.** Every minimal path below must add, at minimum,
`circuitikz + pgf (auto-pulled) + standalone + xstring [+ siunitx]`, plus a
DVI/PDF→SVG converter, via the distribution's package manager after install.
The runtime payload itself is small (tlpdb `containersize 240324` bytes for
`circuitikz`; docs are 2.8 MB and can be skipped with `--no-doc-install`).

## 3. Minimal-distribution cost per OS

### macOS

| Option | Download | Installed | Admin? | Circuit extras |
|---|---|---|---|---|
| Full MacTeX 2026 | **6.4 GB** `.pkg` ([download page](https://www.tug.org/mactex/mactex-download.html)) | 7+ GB in `/usr/local/texlive/2026` (~10 min install, same page) | Yes (Apple installer pkg) | Included (full TeX Live) |
| BasicTeX 2026 | **134 MB** `.pkg` ([morepackages](https://www.tug.org/mactex/morepackages.html)) | Scheme-small class, **600+ MB** ([quickinstall](https://www.tug.org/texlive/quickinstall.html): "`--scheme=small` corresponds to the BasicTeX variant") | Yes (pkg to `/usr/local/texlive/2026basic`) | `tlmgr install circuitikz standalone xstring siunitx dvisvgm` after |
| MiKTeX macOS | **60.6 MB** `.dmg` ([download page](https://miktex.org/download)) | Basic system + on-demand packages | Drag-install; per-user setup offered | Auto-installed on first use (see §4) |
| TinyTeX macOS | **67 MB** (`TinyTeX-1`) / **210 MB** (full `TinyTeX`) `.tar.xz` ([size table](https://github.com/rstudio/tinytex-releases)) | Unpacks to `~/Library/TinyTeX` (default in [install-unx.sh](https://raw.githubusercontent.com/rstudio/tinytex/main/tools/install-unx.sh)) | **No** (user dir; only `--admin` uses sudo, same script) | `tlmgr install …` (tlmgr ships in every bundle; `TinyTeX-0` is infra-only + tlmgr) |

macOS 11+ required for MacTeX/BasicTeX 2026, Intel + Arm native
([MacTeX home](https://www.tug.org/mactex/)).

### Linux

- TeX Live net install, `install-tl --scheme=small` → 600+ MB; `--no-doc-install
  --no-src-install` shrinks further; `--texdir=` relocates anywhere; **root not
  required**, only a writable destination
  ([quickinstall](https://www.tug.org/texlive/quickinstall.html): "You do not
  need to be root … to install, use, or manage TeX Live"). Default full install
  is 7+ GB and "may take several hours" (same page).
- TinyTeX Linux x86_64/arm64/musl: **53–55 MB** (`TinyTeX-1`) /
  **148–158 MB** (full `TinyTeX`) archives; default `~/.TinyTeX`, no root
  ([releases README](https://github.com/rstudio/tinytex-releases),
  [install-unx.sh](https://raw.githubusercontent.com/rstudio/tinytex/main/tools/install-unx.sh)).
  TinyTeX is a TeX Live subset redistributed under GPL-2 with no TeX Live
  changes claimed ([same README, License section](https://github.com/rstudio/tinytex-releases)).
- MiKTeX Linux: per-distro apt/dnf repos; post-install setup explicitly offers
  **private (for you only)** vs shared (system-wide), defaulting to private
  ([download page](https://miktex.org/download), finish-the-setup section).
- Distro-packaged TeX (`apt install texlive-*`) exists but versions lag and
  updates flow through the distro, not CTAN
  ([acquire page](https://www.tug.org/texlive/acquire.html)) — unsuitable as
  the pinned pilot path.

### Windows

- Basic MiKTeX installer: **142 MB** `basic-miktex-25.12-x64.exe`
  ([download page](https://miktex.org/download)); full TeX Live via
  `install-tl-windows.exe` with GUI + Advanced options
  ([quickinstall](https://www.tug.org/texlive/quickinstall.html)).
- TinyTeX Windows: **74 MB** (`TinyTeX-1`) / **173 MB** (full) self-extracting
  `.exe`; also Chocolatey (`choco install tinytex`) and Scoop packages
  ([releases README](https://github.com/rstudio/tinytex-releases)).
- MiKTeX portable edition: rename the standard installer to
  `miktex-portable.exe` and run from portable storage — no installation step
  at all ([download page](https://miktex.org/download)).

### Managed university machines

- TeX Live: per-user install needs no admin rights (writable `--texdir`
  suffices); macOS is the exception where admin is "conventional"
  ([quickinstall](https://www.tug.org/texlive/quickinstall.html)).
- MiKTeX installer offers **private (per-user)** setup, which its own tutorial
  "highly recommend[s]" over shared setup, noting shared setup "requires
  administrator privileges" and is harder to maintain
  ([install tutorial](https://miktex.org/howto/install-miktex)).
- Org rollout without touching clients by hand: MiKTeX documents a
  local-package-repository + silent-install-script recipe
  (`miktexsetup_standalone … download`, share it, run
  `… --quiet … install` on clients)
  ([deployment howto](https://miktex.org/howto/deploy-miktex)); the Setup
  Utility binary for this is 2.6 MB ([download page](https://miktex.org/download)).
- TinyTeX needs no installer UI at all (unpack archive + `tlmgr path add`),
  which is why it is the lightest scripted per-user path — at the cost of
  R-ecosystem branding and GPL-2 (distribution) licensing.

## 4. Restricted-process compilation (what "restricted" actually means)

- TeX Live enables **restricted `\write18`** by default: only an allowlist
  (`repstopdf, makeindex, kpsewhich, bibtex, bibtex8, …`, defined in
  `texmf.cnf`) may run as child processes; environments that must disallow all
  of it run `tlmgr conf texmf shell_escape 0`
  ([TeX Live Guide](https://www.tug.org/texlive/doc/texlive-en/texlive-en.html)).
- MacTeX's own documentation ships a paper on exactly this boundary
  (Herbert Schulz, "Adding Fonts and Restricted Shell Escape",
  linked from the [MacTeX home page](https://www.tug.org/mactex/)).
- Adapter consequences (derived, not external claims):
  - AzeForge-generated circuit sources must contain **zero `\write18`**
    (nothing in a CircuiTikZ schematic needs it), so restricted mode is
    already a deny-by-default sandbox for our input class.
  - Invocation shape: `pdflatex -interaction=nonstopmode -halt-on-error
    -no-shell-escape -output-directory <tmp> <file>` (full disable, not just
    restricted), plus a wall-clock timeout owned by the adapter, a fresh temp
    dir per render, and stdout/stderr capture for diagnostics. `-no-shell-escape`
    is the documented engine flag spelling (pdfTeX/Web2C CLI).
  - Determinism inputs to pin: TeX Live year (frozen annual release), CircuiTikZ
    version (`\listfiles` / tlpdb revision, currently 1.8.6/r79172), and the
    five-component fixture set (§24) hashed SVG-to-SVG across runs.

## 5. The SVG pipeline and its moving parts

- Compile path: semantic AST → generated `.tex` (`standalone` class,
  `\usepackage{circuitikz}`) → `pdflatex` → PDF → **dvisvgm** → SVG.
- dvisvgm converts DVI, EPS, **and PDF** (`--pdf` option) to SVG, embeds glyph
  outlines (SVG/TTF/WOFF/WOFF2), computes tight bounding boxes, and ships in
  TeX Live, MiKTeX, and MacPorts
  ([dvisvgm README](https://github.com/mgieseki/dvisvgm)). dvisvgm itself is
  GPL-3.0 (same page) — fine as an external tool, relevant only if bundled.
- Ghostscript caveat on macOS: dvisvgm's PostScript handler needs the
  Ghostscript shared library, and MacTeX deliberately ships that as a separate
  **Ghostscript-Extras (71 MB)** package (`libgs` + `mutool`), not installed by
  default ([morepackages](https://www.tug.org/mactex/morepackages.html)).
  Pure-CircuiTikZ PDF→SVG avoids PS specials, but the pilot matrix must still
  verify `dvisvgm --pdf` output on a stock BasicTeX install, not just full
  MacTeX.
- Font consistency (§24 acceptance: labels legible across HTML/PNG/PDF):
  dvisvgm embeds outlines by default, so schematic SVG is self-contained; the
  built-in-renderer alternative (§6) must solve label typography itself.

## 6. Built-in SVG renderer option — scope from the blueprint itself

- §24 whitelists a closed set: DC/AC sources, ground + named nodes, R/C/L,
  diodes + LEDs, switches, dependent sources, op-amps, BJT/MOSFET symbols,
  refs + values, V/I/node labels, H/V orientation, series/parallel/branched
  topologies. That is on the order of **~15 symbol classes + a grid router** —
  the "deliberately small" bound is already written; the spike only has to
  confirm it, not re-scope it.
- In-repo precedent for dependency-free rendering: M2 already plans **KaTeX
  and Mermaid adapters** rendering to SVG with no external process
  (blueprint §31 M2: "Equation grammar and KaTeX adapter. Mermaid adapter. SVG
  and PNG rendering."). A built-in circuit renderer follows the same pattern:
  an npm-bundled pure-JS layout+SVG emitter behind the renderer-adapter seam
  (§24: "Use a renderer adapter rather than placing circuit layout in the
  document core"), keeping the main install TeX-free per §24/§36.
- Trade-off in one line each (facts, not recommendation): CircuiTikZ buys
  publication-grade symbols + IEC/ANSI-adjacent coverage at the cost of a
  134 MB–6.4 GB optional dependency; built-in buys zero-install determinism at
  the cost of hand-drawing ~15 symbols and owning label typography.

## 7. Container fallback shape (documented, no new infra)

All three primitives are documented by their upstreams today:

1. **TeX Live scripted install** — `install-tl --profile <file>
   --scheme small --no-doc-install --no-src-install` batch mode plus
   `tlmgr install circuitikz standalone xstring siunitx dvisvgm`; profiles are
   produced by any successful install (`tlpkg/texlive.profile`)
   ([quickinstall](https://www.tug.org/texlive/quickinstall.html),
   [install-tl docs](https://www.tug.org/texlive/doc/install-tl.html)).
   Dockerfile shape: version-pinned base + installer + profile + warm
   `tlmgr` layer + non-root user. Deterministic and CTAN-current.
2. **TinyTeX fetch** — direct per-platform archive URLs + unpack to a fixed
   path + `tlmgr path add` (see §3 table). Smallest image; trades TeX Live
   neutrality for the R-built bundle (GPL-2, §3).
3. **MiKTeX org repo** — local package repository + silent per-client install
   script ([deployment howto](https://miktex.org/howto/deploy-miktex));
   doubles as the answer for lab machines where Docker is banned but a file
   share exists.

## 8. One-engineering-week spike design (§31 M4)

### Must prove (each maps to a §24/§36 gate)

1. **Minimal-install cost per pilot OS** — wall time + bytes for the §3
   minimal path on macOS, Linux, Windows (§36.5: "optional-backend installation
   works on every supported pilot platform").
2. **Deterministic SVG pipeline** — same fixture + same pinned versions →
   byte-identical SVG across runs and across the three OSes (§24 acceptance:
   "rendered repeatedly, then the SVG is deterministic").
3. **Restricted-process safety** — generated `.tex` compiles with shell escape
   fully disabled; adapter timeout kills a hung compile; nothing outside the
   temp dir is read or written (§4; blueprint §24 "compile it in a restricted
   process").
4. **Five pilot circuits end-to-end** — the §24 fixture style (RC low-pass
   et al.) through AST → CircuiTikZ → SVG → HTML/PNG/PDF embed, legible labels
   (§24 acceptance × 3; §36.1–3).
5. **Missing-backend diagnostic** — exact remedy per platform (§9) while
   non-circuit documents keep rendering (§24 acceptance: "reports the exact
   installation remedy and continues to work for non-circuit documents").

### Pass/fail criteria

- **PASS (lock CircuiTikZ adapter):** all five circuits byte-deterministic on
  all pilot platforms; minimal install ≤ ~1 GB and ≤ ~30 min on each OS
  (BasicTeX-class numbers in §3 leave wide margin); missing-backend path
  prints the §9 remedy and exits non-circuit builds green.
- **FAIL (trigger the §24 fallback):** any platform where no reliable install
  fits the pilot's managed-machine constraints within the week, or
  non-deterministic SVG across runs/platforms, or label illegibility in any of
  HTML/PNG/PDF. Fallback: "implement a deliberately small SVG renderer for the
  whitelisted components instead of delaying P0" (§24 verbatim).
- **Out of scope for the spike** (explicit §24 non-goals): SPICE/simulation,
  PCB, EDA import, full IEC/ANSI coverage, auto-layout of large schematics.

## 9. Missing-backend diagnostic and remedy matrix

Diagnostic contract (§24 acceptance + §36.6): detect at capability-discovery
time (blueprint §31 M3 "Capability discovery"), name the missing piece
(engine binary vs TeX package), print the platform remedy, and continue green
for non-circuit documents. Proposed exact copy per platform (commands from
§3 sources):

| Platform | Detection | Remedy text (exact) |
|---|---|---|
| macOS (no TeX) | `pdflatex` absent | `Circuit rendering needs a TeX backend. Smallest path: install BasicTeX (134 MB, https://www.tug.org/mactex/morepackages.html), then: sudo tlmgr install circuitikz standalone xstring siunitx dvisvgm` |
| macOS (TeX, no circuitikz) | `kpsewhich circuitikz.sty` fails | `Your TeX install lacks CircuiTikZ. Run: sudo tlmgr install circuitikz standalone xstring siunitx dvisvgm` |
| Linux (no TeX) | `pdflatex` absent | `Circuit rendering needs a TeX backend. Per-user, no root: install TinyTeX (https://github.com/rstudio/tinytex-releases#installation, default ~/.TinyTeX), then: tlmgr install circuitikz standalone xstring siunitx dvisvgm — or: install-tl --scheme=small --no-doc-install --no-src-install` |
| Linux (TeX, no circuitikz) | `kpsewhich` fails | `tlmgr install circuitikz standalone xstring siunitx dvisvgm` |
| Windows (no TeX) | `pdflatex.exe` absent | `Circuit rendering needs a TeX backend. Install Basic MiKTeX (142 MB, https://miktex.org/download), choose private (per-user) setup, set package installer to Always` |
| Windows (TeX, no circuitikz) | `kpsewhich` fails | MiKTeX auto-installs on next render (set to Always), or `mpm --install=circuitikz` |
| Any (offline / locked-down lab) | package fetch fails | `No network TeX access detected. Ask your lab admin for the shared MiKTeX repository install, or use the documented container image (see §7). Non-circuit documents render normally.` |

MiKTeX-specific behaviors cited: private-vs-shared setup recommendation,
Always/Ask/Never package-install modes
([install tutorial](https://miktex.org/howto/install-miktex)).

## 10. WaveDrom (timing block) — facts only, no design

- License: **MIT**. `LICENSE` file: "The MIT License (MIT), Copyright (c)
  2011-2026 Aliaksei Chapyzhenka" with the standard permission + notice
  conditions
  ([LICENSE](https://raw.githubusercontent.com/wavedrom/wavedrom/trunk/LICENSE));
  `package.json` declares `"license": "MIT"`
  ([package.json](https://raw.githubusercontent.com/wavedrom/wavedrom/trunk/package.json)).
  GitHub repo header concurs (License: MIT)
  ([repo](https://github.com/wavedrom/wavedrom)).
- JS/CLI-to-SVG path, end to end in one file: `bin/cli.js` parses the input
  with `json5`, calls `lib.renderAny(0, source, skins)`, serializes with
  `onml.stringify(res, indent)` to **SVG on stdout**; `package.json` exposes it
  as the `wavedrom` bin
  ([cli.js](https://raw.githubusercontent.com/wavedrom/wavedrom/trunk/bin/cli.js),
  [package.json](https://raw.githubusercontent.com/wavedrom/wavedrom/trunk/package.json)).
  Documented usage: `npx wavedrom --input source.json5 > output.svg`
  ([README CLI section](https://github.com/wavedrom/wavedrom)); PNG via piping
  to `@resvg/resvg-js-cli` (same section). Runtime deps: `bit-field, json5,
  logidrom, onml, tspan`; engines: `node >= 20` (same package.json).
- Separation note (blueprint §24, quoted): "Timing diagrams and circuit
  schematics must remain separate semantic block types." Nothing in this
  section designs the `timing` block.

## Sources (primary only)

CTAN CircuiTikZ page; circuitikz GitHub repo + README; LPPL 1.3c text;
TeX Live `texlive.tlpdb` (tlnet); TeX Live Guide (texlive-en); quickinstall,
acquire, install-tl docs (tug.org/texlive); MacTeX home, download,
morepackages pages; MiKTeX download, install-tutorial, deploy howtos
(miktex.org); TinyTeX + tinytex-releases repos (install-unx.sh, size table,
license notes); dvisvgm repo README; WaveDrom repo (LICENSE, package.json,
bin/cli.js, README); azeforge-product-blueprint.md §§24, 30, 31-M4, 36.
