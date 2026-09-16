# Reproducible TeX figure toolchain

**Decision for issue #87 — 2026-09-16.** Build a dedicated, Linux/amd64 renderer image from a digest-pinned base image, install a deliberately small TeX Live 2025 tree from the final 2025 repository snapshot, and convert DVI to SVG with dvisvgm 3.4 built from its upstream tag commit. Record every resolved TeX Live package revision from `texlive.tlpdb`, the installer and converter hashes, and the final OCI image digest in the renderer release manifest. The immutable manifest and OCI digest—not a moving package name or a Docker tag—are the renderer version.

This choice meets the existing renderer prerequisite that the TeX Live, package, font, and SVG conversion versions be pinned, while avoiding an unbounded `scheme-full` installation. It is a recommendation for the future renderer image; it changes no runtime configuration.

## Decision

### Distribution and version boundary

- **Distribution:** TeX Live **2025**, installed using its release installer with a checked SHA-256 and a local copy of the TeX Live 2025 **final** `tlnet` snapshot. Do not install from `mirror.ctan.org` during an image build: TUG documents that mirrors are not perfectly synchronized, and `tlmgr update --all` makes the local tree match the repository. A moving mirror therefore is not a reproducible input.[^tlmgr]
- **Repository boundary:** obtain the final snapshot once, verify its signed repository metadata using `tlmgr --verify-repo=all`, store the snapshot (or a content-addressed internal mirror) and its `texlive.tlpdb` SHA-256, then build offline with that local repository. `tlmgr` documents both `--repository` (including local directories) and `--verify-repo=[none|main|all]`.[^tlmgr]
- **Image boundary:** use a digest-pinned Linux/amd64 base (`FROM …@sha256:…`), pin the installer archive SHA-256, install only the inventory below, run `mktexlsr`/format generation during the image build, and publish the resulting OCI digest. Retain the repository snapshot and build recipe; a year-only TeX Live pin is not sufficient.
- **No runtime package management:** remove or deny `tlmgr` in the runtime layer and give the renderer a read-only TeX tree. This prevents a compilation request from changing the toolchain.

### SVG path

Use the DVI route: `latex -interaction=nonstopmode -halt-on-error -no-shell-escape figure.tex`, followed by **dvisvgm 3.4** with an explicit, reviewed argument list (initially `--no-fonts --exact --bbox=min`). Pin the source tag to commit `12b62630e6acde953d0d11424f967ee38d0c5c6d`, build it in the image, and record the compiler/linker and native-library versions in the release manifest.[^dvisvgm-release]

`--no-fonts` makes text path data rather than relying on a client font, which is the safer default for byte/rendering stability and self-contained SVG. It increases SVG size and sacrifices selectable text; make that an explicit renderer contract rather than an accidental converter default. A profile acceptance corpus must settle the exact flags and compare normalized SVG/rendered pixels before this command becomes the public contract.

## Approved TeX Live inventory

Install by TeX Live package name, not by a broad collection. Let `tlmgr` resolve transitive dependencies **from the frozen local snapshot**, then retain the resulting `texlive.tlpdb` as the authoritative complete inventory. The following is the approved direct allowlist:

| Profile | Direct TeX Live package(s) | Why |
| --- | --- | --- |
| Shared LaTeX/DVI engine | `latex`, `latex-bin`, `graphics`, `xcolor`, `amsmath` | The document wrapper, DVI engine, colour/graphics primitives, and mathematical typesetting. |
| `tikz` | `pgf` | CTAN identifies TikZ as PGF's user-friendly syntax layer.[^pgf] |
| `circuitikz` | `circuitikz` | CircuiTikZ is based on PGF/TikZ and TeX Live distributes it as `circuitikz`.[^circuitikz] |
| `pgfplots` | `pgfplots` | PGFPlots is based on PGF/TikZ and TeX Live distributes it as `pgfplots`.[^pgfplots] |
| `chemfig` | `chemfig` | ChemFig uses TikZ for its drawing operations and TeX Live distributes it as `chemfig`.[^chemfig] |
| `tikz-cd` | `tikz-cd` | tikz-cd is a TikZ package and TeX Live distributes it as `tikz-cd`.[^tikzcd] |
| Fonts | `lm`, `cm`, `amsfonts` | Canonical Latin Modern / Computer Modern text and AMS math coverage for the generated SVG; do not permit host font discovery. |
| Conversion | `dvisvgm` | TeX Live integration for the DVI-to-SVG program; the executable is independently source-pinned as above. |

The *resolved* dependency closure, not this table, is the complete shipping inventory. CI must export `tlmgr info --only-installed --data name,revision` in sorted order, hash it, and fail if it differs from the committed lock/manifest. That catches silent additions such as a package dependency or font change.

Do **not** include `gnuplot`/externalization support in `pgfplots`, user-selected `fontspec`/system fonts, `minted`, or arbitrary TeX packages. They either introduce external execution, a host-font dependency, or expand the supported language beyond the five profiles.

## Version and evidence ledger

The final TeX Live snapshot, rather than CTAN's current package page, determines shipped versions. The package pages below establish package identity, upstream relationship, current license, and TeX Live package name; their current versions must not be substituted for the frozen snapshot's revision.

| Component | Frozen selection | Primary-source evidence |
| --- | --- | --- |
| TeX Live manager/repository | TeX Live 2025 final snapshot; local repository; signed metadata; `texlive.tlpdb` hash in manifest | `tlmgr` explicitly supports a local `--repository`, repository verification, and package revision reporting.[^tlmgr] |
| PGF/TikZ | `pgf` closure from that snapshot | CTAN: PGF includes the TikZ syntax layer and is TeX Live package `pgf`.[^pgf] |
| CircuiTikZ | `circuitikz` closure | CTAN: based on PGF/TikZ; TeX Live package `circuitikz`.[^circuitikz] |
| PGFPlots | `pgfplots` closure | CTAN: based on PGF/TikZ; TeX Live package `pgfplots`.[^pgfplots] |
| ChemFig | `chemfig` closure | CTAN: uses TikZ; TeX Live package `chemfig`.[^chemfig] |
| tikz-cd | `tikz-cd` closure | CTAN: TeX Live package `tikz-cd`.[^tikzcd] |
| SVG converter | dvisvgm 3.4, upstream tag commit `12b62630e6acde953d0d11424f967ee38d0c5c6d` | Upstream release identifies tag 3.4 and its commit.[^dvisvgm-release] |

## Licensing and distribution obligations

| Item | Upstream-declared license | Operational consequence |
| --- | --- | --- |
| TeX Live aggregate | Free software, but not one uniform license | Preserve the TeX Live license/notice material and retain the exact component inventory; TUG says redistribution is subject to its copying conditions and that the aggregate consists of free software, not a single license.[^texlive-copying] |
| PGF/TikZ | LPPL 1.3c, GFDL, GPL-2.0 (CTAN listing) | Preserve notices; inspect the frozen package's files when assembling an image/SBOM.[^pgf] |
| CircuiTikZ | GPL and LPPL (CTAN listing) | Treat as a GPL-bearing shipped component; legal review must decide the image's source/notice offer before public image distribution.[^circuitikz] |
| PGFPlots | GPL-3.0-or-later | Treat as GPL-3.0-or-later in the image SBOM and source/notice process.[^pgfplots] |
| ChemFig | LPPL 1.3c | Preserve its notice/license text.[^chemfig] |
| tikz-cd | LPPL 1.3 | Preserve its notice/license text.[^tikzcd] |
| dvisvgm 3.4 | GPL-3.0 | Its upstream `COPYING` is GPL v3; public distribution of the image needs the applicable GPL compliance path and corresponding source availability.[^dvisvgm-copying] |

Aze Forge need not change its own license merely by invoking these programs as a separate renderer service, but that is a legal conclusion outside this research. Before publishing a renderer image, obtain legal review of the GPL-bearing container distribution, generated SVG attribution/notice policy, and an SBOM based on the frozen tree.

## Risks and open facts before implementation

1. **Snapshot address and checksums:** the exact TeX Live 2025 final archive URL, installer SHA-256, snapshot SHA-256, package revisions, and base-image digest must be recorded in the renderer's future lock file. They cannot be honestly inferred from a release year.
2. **Converter output contract:** dvisvgm's output depends on its build and native libraries. Freeze those inputs and establish a representative corpus with byte-normalization and pixel comparison before promising reproducible SVG bytes.
3. **Font coverage:** the `lm`/`cm`/`amsfonts` baseline deliberately does not cover arbitrary Unicode or user font requests. The profile grammar needs a documented font policy and diagnostics for unsupported glyphs/fonts.
4. **Package closure:** `tlmgr` must resolve the allowlist against the chosen frozen snapshot and its exact closure must be committed. The direct list is intentionally not a hand-maintained dependency graph.
5. **Security posture:** the future container must enforce the existing no-network, no-shell-escape, temporary-workspace, resource-limit requirements. TeX profile allowlisting is not by itself a sandbox.

[^tlmgr]: TeX Users Group, [*tlmgr — the native TeX Live Manager*](https://www.tug.org/texlive/doc/tlmgr.html), accessed 2026-09-16. See `--repository`, `--verify-repo`, `info`, and the mirror synchronization caveat.
[^pgf]: CTAN, [*PGF — Create PostScript and PDF graphics in TeX*](https://ctan.org/pkg/pgf), accessed 2026-09-16.
[^circuitikz]: CTAN, [*CircuiTikZ — Draw electrical networks with TikZ*](https://ctan.org/pkg/circuitikz), accessed 2026-09-16.
[^pgfplots]: CTAN, [*PGFPlots — Create normal/logarithmic plots in two and three dimensions*](https://ctan.org/pkg/pgfplots), accessed 2026-09-16.
[^chemfig]: CTAN, [*ChemFig — Draw molecules with easy syntax*](https://ctan.org/pkg/chemfig), accessed 2026-09-16.
[^tikzcd]: CTAN, [*tikz-cd — Create commutative diagrams with TikZ*](https://ctan.org/pkg/tikz-cd), accessed 2026-09-16.
[^dvisvgm-release]: Martin Gieseking, [*dvisvgm 3.4 release*](https://github.com/mgieseki/dvisvgm/releases/tag/3.4), 2026-07-24; release tag points to commit `12b62630e6acde953d0d11424f967ee38d0c5c6d`.
[^dvisvgm-copying]: Martin Gieseking, [dvisvgm 3.4 `COPYING`](https://github.com/mgieseki/dvisvgm/blob/3.4/COPYING), GPL-3.0 text.
[^texlive-copying]: TeX Users Group, [*TeX Live licensing, copying, and redistribution*](https://tug.org/texlive/copying.html), updated 2025-04-18.
