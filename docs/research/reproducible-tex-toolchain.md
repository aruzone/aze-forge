# Reproducible TeX figure toolchain

**Decision for issue #87 — 2026-09-16.** Build a dedicated, Linux/amd64 renderer image from a digest-pinned base image, install the approved package closure from the immutable **TeX Live 2026 ISO**, and use its bundled dvisvgm. Verify and retain the ISO's signed SHA-512 (`4a9071bb567c3bdd6443378dedc8e485aea4a2f1203ec8ed7c17f6787093b9c37636a037032c0be63352e3d0bf98cf5616dab19fdcd7cb83f766b3e085b620ff`), record every resolved TeX Live package revision from `texlive.tlpdb`, and publish the final OCI image digest in the renderer release manifest. The immutable ISO, manifest, and OCI digest—not a moving package name or Docker tag—are the renderer version.

This choice meets the existing renderer prerequisite that the TeX Live, package, font, and SVG conversion versions be pinned, while avoiding an unbounded `scheme-full` runtime image. It is a recommendation for the future renderer image; it changes no runtime configuration.

## Decision

### Distribution and version boundary

- **Distribution:** TeX Live **2026** from TUG's `texlive2026.iso`, verified against TUG's signed SHA-512. TUG states that an ISO is not updated after release and can therefore be a stable marker in TeX development.[^tliso] Do not install from `mirror.ctan.org` or run `tlmgr update` during an image build: TUG documents that mirrors are not perfectly synchronized, and `tlmgr update --all` makes the local tree match the repository.[^tlmgr]
- **Repository boundary:** install the approved allowlist from the verified ISO (or an internally retained, content-addressed copy of it), then retain the installed `texlive.tlpdb` SHA-256. `tlmgr` supports a local `--repository` and `--verify-repo=[none|main|all]`; use both if a local snapshot is needed to make the reduced installation.[^tlmgr]
- **Image boundary:** use a digest-pinned Linux/amd64 base (`FROM …@sha256:…`), pin the ISO SHA-512, install only the inventory below, run `mktexlsr`/format generation during the image build, and publish the resulting OCI digest. Retain the ISO and build recipe; a release-year-only pin is not sufficient.
- **No runtime package management:** remove or deny `tlmgr` in the runtime layer and give the renderer a read-only TeX tree. This prevents a compilation request from changing the toolchain.

### SVG path

Use the DVI route: `latex -interaction=nonstopmode -halt-on-error -no-shell-escape -output-format=dvi figure.tex`, followed by the **dvisvgm bundled in the frozen TeX Live 2026 ISO** with an explicit, reviewed argument list (initially `--page=1 --no-fonts=1 --precision=6 --output=output.svg`). Its version is fixed by the ISO and must be recorded from `dvisvgm --version` in the release manifest. This avoids mixing a host/package-manager converter with TeX Live's kpathsea and font tree.[^dvisvgm]

`--no-fonts=1` makes text path data rather than relying on a client font, which is the safer default for byte/rendering stability and self-contained SVG. It increases SVG size and sacrifices selectable text; make that an explicit renderer contract rather than an accidental converter default. A profile acceptance corpus must settle the exact flags and compare normalized SVG/rendered pixels before this command becomes the public contract.

## Approved TeX Live inventory

Install by TeX Live package name, not by a broad collection. Let `tlmgr` resolve transitive dependencies **from the frozen local snapshot**, then retain the resulting `texlive.tlpdb` as the authoritative complete inventory. The following is the approved direct allowlist:

| Profile | Direct TeX Live package(s) | Why |
| --- | --- | --- |
| Shared LaTeX/DVI engine | `latex`, `latex-bin`, `graphics`, `xcolor`, `amsmath` | The document wrapper, DVI engine, colour/graphics primitives, and mathematical typesetting. |
| `tikz` | `pgf` | CTAN identifies TikZ as PGF's user-friendly syntax layer.[^pgf] |
| `circuitikz` | `circuitikz`, `xstring`; add `siunitx` only when its CircuitikZ syntax is enabled | CircuiTikZ is based on PGF/TikZ and TeX Live distributes it as `circuitikz`; its upstream README requires `xstring` and makes `siunitx` conditional.[^circuitikz] |
| `pgfplots` | `pgfplots` | PGFPlots is based on PGF/TikZ and TeX Live distributes it as `pgfplots`.[^pgfplots] |
| `chemfig` | `chemfig` | ChemFig uses TikZ for its drawing operations and TeX Live distributes it as `chemfig`.[^chemfig] |
| `tikz-cd` | `tikz-cd` | tikz-cd is a TikZ package and TeX Live distributes it as `tikz-cd`.[^tikzcd] |
| Fonts | `lm`, `cm`, `amsfonts` | Canonical Latin Modern / Computer Modern text and AMS math coverage for the generated SVG; do not permit host font discovery. |
| Conversion | `dvisvgm` | TeX Live's DVI-to-SVG program; it is pinned by the ISO, not independently upgraded. |

The *resolved* dependency closure, not this table, is the complete shipping inventory. CI must export `tlmgr info --only-installed --data name,revision` in sorted order, hash it, and fail if it differs from the committed lock/manifest. That catches silent additions such as a package dependency or font change.

Do **not** include `gnuplot`/externalization support in `pgfplots`, user-selected `fontspec`/system fonts, `minted`, or arbitrary TeX packages. They either introduce external execution, a host-font dependency, or expand the supported language beyond the five profiles.

## Version and evidence ledger

The final TeX Live snapshot, rather than CTAN's current package page, determines shipped versions. The package pages below establish package identity, upstream relationship, current license, and TeX Live package name; their current versions must not be substituted for the frozen snapshot's revision.

| Component | Frozen selection | Primary-source evidence |
| --- | --- | --- |
| TeX Live manager/repository | TeX Live 2026 ISO; published signed SHA-512; installed `texlive.tlpdb` hash in manifest | TUG calls the ISO a stable development marker; `tlmgr` supports a local repository, verification, and package revision reporting.[^tliso][^tlmgr] |
| PGF/TikZ | `pgf` closure from that ISO | CTAN: PGF includes the TikZ syntax layer and is TeX Live package `pgf`.[^pgf] |
| CircuiTikZ | `circuitikz`, `xstring`, conditional `siunitx` closure | CTAN: based on PGF/TikZ; upstream README specifies `xstring` and conditional `siunitx`.[^circuitikz] |
| PGFPlots | `pgfplots` closure | CTAN: based on PGF/TikZ; TeX Live package `pgfplots`.[^pgfplots] |
| ChemFig | `chemfig` closure | CTAN: uses TikZ; TeX Live package `chemfig`.[^chemfig] |
| tikz-cd | `tikz-cd` closure | CTAN: TeX Live package `tikz-cd`.[^tikzcd] |
| SVG converter | dvisvgm bundled by the ISO; exact `dvisvgm --version` in manifest | dvisvgm is a DVI/EPS/PDF-to-SVG CLI and uses the TeX installation's kpathsea/font tree.[^dvisvgm] |

## Licensing and distribution obligations

| Item | Upstream-declared license | Operational consequence |
| --- | --- | --- |
| TeX Live aggregate | Free software, but not one uniform license | Preserve the TeX Live license/notice material and retain the exact component inventory; TUG says redistribution is subject to its copying conditions and that the aggregate consists of free software, not a single license.[^texlive-copying] |
| PGF/TikZ | LPPL 1.3c, GFDL, GPL-2.0 (CTAN listing) | Preserve notices; inspect the frozen package's files when assembling an image/SBOM.[^pgf] |
| CircuiTikZ | GPL and LPPL (CTAN listing) | Treat as a GPL-bearing shipped component; legal review must decide the image's source/notice offer before public image distribution.[^circuitikz] |
| PGFPlots | GPL-3.0-or-later | Treat as GPL-3.0-or-later in the image SBOM and source/notice process.[^pgfplots] |
| ChemFig | LPPL 1.3c | Preserve its notice/license text.[^chemfig] |
| tikz-cd | LPPL 1.3 | Preserve its notice/license text.[^tikzcd] |
| dvisvgm in TeX Live | GPL-3.0-or-later | CTAN lists GPL-3.0-or-later; public distribution of the image needs the applicable GPL compliance path and corresponding source availability.[^dvisvgm] |

Aze Forge need not change its own license merely by invoking these programs as a separate renderer service, but that is a legal conclusion outside this research. Before publishing a renderer image, obtain legal review of the GPL-bearing container distribution, generated SVG attribution/notice policy, and an SBOM based on the frozen tree.

## Risks and open facts before implementation

1. **Installation artifact:** the ISO's SHA-512 is fixed above, but implementation must record its signed-checksum verification, the installer invocation, exact package revisions/dependency closure, and base-image digest in the renderer lock file.
2. **Converter output contract:** dvisvgm's output depends on its build and native libraries. Freeze those inputs and establish a representative corpus with byte-normalization and pixel comparison before promising reproducible SVG bytes.
3. **Font coverage:** the `lm`/`cm`/`amsfonts` baseline deliberately does not cover arbitrary Unicode or user font requests. The profile grammar needs a documented font policy and diagnostics for unsupported glyphs/fonts.
4. **Package closure:** `tlmgr` must resolve the allowlist against the chosen frozen snapshot and its exact closure must be committed. The direct list is intentionally not a hand-maintained dependency graph.
5. **Security posture:** the future container must enforce the existing no-network, no-shell-escape, temporary-workspace, resource-limit requirements. TeX profile allowlisting is not by itself a sandbox.

[^tlmgr]: TeX Users Group, [*tlmgr — the native TeX Live Manager*](https://www.tug.org/texlive/doc/tlmgr.html), accessed 2026-09-16. See `--repository`, `--verify-repo`, `info`, and the mirror synchronization caveat.
[^pgf]: CTAN, [*PGF — Create PostScript and PDF graphics in TeX*](https://ctan.org/pkg/pgf), accessed 2026-09-16.
[^circuitikz]: CTAN, [*CircuiTikZ — Draw electrical networks with TikZ*](https://ctan.org/pkg/circuitikz), accessed 2026-09-16; CircuiTikZ, [upstream README](https://raw.githubusercontent.com/circuitikz/circuitikz/master/README.md), accessed 2026-09-16.
[^pgfplots]: CTAN, [*PGFPlots — Create normal/logarithmic plots in two and three dimensions*](https://ctan.org/pkg/pgfplots), accessed 2026-09-16.
[^chemfig]: CTAN, [*ChemFig — Draw molecules with easy syntax*](https://ctan.org/pkg/chemfig), accessed 2026-09-16.
[^tikzcd]: CTAN, [*tikz-cd — Create commutative diagrams with TikZ*](https://ctan.org/pkg/tikz-cd), accessed 2026-09-16.
[^dvisvgm]: CTAN, [*dvisvgm — Convert DVI files to SVG*](https://ctan.org/pkg/dvisvgm), accessed 2026-09-16; Martin Gieseking, [dvisvgm README](https://raw.githubusercontent.com/mgieseki/dvisvgm/master/README.md), accessed 2026-09-16.
[^tliso]: TeX Users Group, [*TeX Live ISO image*](https://tug.org/texlive/acquire-iso.html), accessed 2026-09-16; [published `texlive2026.iso` SHA-512](https://tug.org/texlive/Images/texlive2026.iso.sha512).
[^texlive-copying]: TeX Users Group, [*TeX Live licensing, copying, and redistribution*](https://tug.org/texlive/copying.html), updated 2025-04-18.
