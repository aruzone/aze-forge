# AzeMark language reference

Canonical, compile-verified AzeMark 2 (`azemark: 2`) example documents. Every
file here is a complete Source that the shipped compiler parses, validates, and
renders — not a fragment collection. They are the frozen authoring reference
implementation consumes, and they are intended for verbatim reuse as the
preloaded examples in the AzeForge Web authoring app.

Each document is graded: within a section, the first Block is the minimal
idiomatic form and the last exercises the deepest feature the directive
registers. Read top to bottom to go from simple to hard. Two sections carry
fewer or more Blocks than the pattern for structural reasons the language
imposes: a document declares at most one `bibliography`, and the diagnostics
sampler devotes a section to a whole family rather than to one directive.

Every document except `13-diagnostics.aze.md` validates silently:

```bash
for f in docs/language/*.aze.md; do
  case "$f" in *13-diagnostics*) continue ;; esac
  node dist/cli.js validate "$f" || echo "FAIL: $f"
done
```

Where a document intentionally registers a warning — the floating Circuit's
unused node, the disconnected subgraphs, the unconnected control port — the
prose names it. Nothing else warns.

## Files

| File | Purpose |
|---|---|
| `01-document-basics.aze.md` | Front matter, headings, inline emphasis and code, lists, code fences, links, blockquotes and thematic breaks, GFM pipe tables, and the callout directive with its closed variant set. Start here. |
| `02-mathematics.aze.md` | The `equation` and `derivation` directives: unnumbered relations, Greek and binder notation, bounded integrals and sums, `cases(...)` piecewise forms, and annotated multi-step derivations. |
| `03-visualization.aze.md` | The `plot` and `chart` directives: bounded function series, authored scatter and line series with symmetric and asymmetric error bars, `parameters:`, logarithmic axes, and the four chart types including a histogram with explicit edges. |
| `04-geometry.aze.md` | The `geometry` directive: the coordinate form and the named-construction form side by side, intersections and tangents with `pick:`, and the angle, length, equal and right-angle marks. |
| `05-chemistry.aze.md` | The `formula`, `reaction` and `structure` directives, carrying the three preserved information states: specified, explicitly unspecified, and omitted. |
| `06-circuit.aze.md` | The `circuit` directive under the IEC convention: analog schematics, gate and flip-flop digital schematics, an intentionally floating clocked Circuit, and a disconnected instructional schematic with its warnings. |
| `07-timing.aze.md` | The `timing` directive: the shared cycle scale with edge and bus wave notation, and the duration-equivalent twin authored on an explicit time scale. |
| `08-diagrams.aze.md` | The `diagram` directive in all four modes — flowchart, graph, tree, architecture — with nested groups, ports and undirected multi-edges, plus the bounded `mermaid` escape hatch. |
| `09-engineering.aze.md` | The `control` and `free-body` directives: summing junctions and takeoff fan-out, relative-ray force directions, explicit scale versus schematic length, moments, axes and dimensions. |
| `10-models.aze.md` | The four typed model directives — `sequence`, `state`, `entity` and `class` — covering activations, fragments and notes, composite states, junction tables, and all five relationship forms. |
| `11-structured-content.aze.md` | The `table`, `algorithm`, `statement` and `example` directives: typed columns with grouped headers and missing values, the six pseudocode statement forms, theorem-family statements with proofs, and worked examples composing nested mathematics. |
| `12-composition.aze.md` | The `figure` wrapper, the `bibliography` directive, `@`-references and parenthetical groups, citation locators, and endnote-rendered footnotes. |
| `13-diagnostics.aze.md` | The one intentionally invalid document: representative broken Blocks per family, each naming the exact diagnostic code and remedy the compiler produces. |
| `14-tex.aze.md` | Every isolated `tex` renderer profile — CircuitikZ, TikZ, PGFPlots, Chemfig, and TikZ-CD. Render it with the local wrapper and a local renderer image. |

## Approved constraints

Owner-approved and frozen in [issue #50](https://github.com/aruzone/aze-forge/issues/50):

- `azemark: 2` with fixed `::::` outer / `::` nested directives and mandatory `----` header/body separator.
- No positional directive arguments; no variable-width fences.
- Two-space structural indentation; standalone `//` structural comments where allowed.
- Quantity/unit spellings follow the language contract.
- Circuit remains coordinate-free; geometry, free-body declarations, and chemistry structure atoms carry authored coordinates.
- No backend source is presented as native AzeMark.
- Shared `- kind:` record idiom across the object families, with structured technical content keeping its own record shapes: typed tables use `columns:`/`groups:`/`rows:`, algorithms use `procedure:`/`parameters:`/`steps:` over the six statement keys, and statements and examples use header fields plus `text:`/`proof:`/`problem:`/`givens:`/`steps:`/`result:`.
- Corrective diagnostics sampler accepted as the representative author-facing diagnostic voice.

Implementation consumes these forms without reopening the underlying family,
language, or numbering contracts. `test/*.test.mjs` extracts specific Blocks by
`id:` from these documents, so a rewrite must preserve those ids and their
bodies; see `docs/development.md` for the test seams.
