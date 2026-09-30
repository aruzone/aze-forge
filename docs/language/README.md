# AzeMark language documentation

This directory is the authoring reference for AzeMark 2. Start with
[`00-authoring-azemark.aze.md`](00-authoring-azemark.aze.md), then read the
category guide for the technical content you need. Use
[`directive-reference.md`](directive-reference.md) when you need an exact field
name, enum value, body record, or compiler limit.

Every `.aze.md` file is a complete Source. The shipped compiler parses,
validates, and renders these files, so the examples can be copied into a new
document without translating pseudocode into real syntax. Within each section,
the first Block is small and the later Blocks combine more of the directive's
grammar. The same files can become preloaded examples in AzeForge Web.

The grammar reference is generated from the compiler's registered grammar
tables. Category guides carry the explanation and examples; the generated page
carries the exhaustive field inventory. Keeping those jobs separate makes the
prose readable without letting the syntax tables drift.

Every document except `13-diagnostics.aze.md` validates successfully. The
Circuit and control guides contain a few intentional warnings that their prose
names. Nothing else warns.

```bash
for f in docs/language/*.aze.md; do
  case "$f" in *13-diagnostics*) continue ;; esac
  node dist/cli.js validate "$f" || echo "FAIL: $f"
done
```


## Files

| File | Purpose |
|---|---|
| `00-authoring-azemark.aze.md` | Start here: Source anatomy, fixed directive fences, indentation, values, identifiers, references, nesting, escape hatches, validation, and an authoring checklist. |
| `01-document-basics.aze.md` | Front matter, headings, inline emphasis and code, lists, code fences, links, blockquotes and thematic breaks, GFM pipe tables, and the callout directive with its closed variant set. |
| `02-mathematics.aze.md` | The `equation` and `derivation` directives: unnumbered relations, Greek and binder notation, bounded integrals and sums, `cases(...)` piecewise forms, and annotated multi-step derivations. |
| `03-visualization.aze.md` | The `plot` and `chart` directives: bounded function series, authored scatter and line series with symmetric and asymmetric error bars, `parameters:`, logarithmic axes, and the four chart types including a histogram with explicit edges. |
| `04-geometry.aze.md` | The `geometry` directive: the coordinate form and the named-construction form side by side, intersections and tangents with `pick:`, and the angle, length, equal and right-angle marks. |
| `05-chemistry.aze.md` | The `formula`, `reaction` and `structure` directives, carrying the three preserved information states: specified, explicitly unspecified, and omitted. |
| `06-circuit.aze.md` | The `circuit` directive under the IEC convention: analog schematics, gate and flip-flop digital schematics, an intentionally floating clocked Circuit, and a disconnected instructional schematic with its warnings. |
| `07-timing.aze.md` | The `timing` directive: the shared cycle scale with edge and bus wave notation, and the duration-equivalent twin authored on an explicit time scale. |
| `08-diagrams.aze.md` | The `diagram` directive in all four modes: flowchart, graph, tree and architecture. Examples include nested groups, ports and undirected multi-edges, plus the bounded `mermaid` escape hatch. |
| `09-engineering.aze.md` | The `control` and `free-body` directives: summing junctions and takeoff fan-out, relative-ray force directions, explicit scale versus schematic length, moments, axes and dimensions. |
| `10-models.aze.md` | The four typed model directives, `sequence`, `state`, `entity` and `class`, covering activations, fragments and notes, composite states, junction tables, and all five relationship forms. |
| `11-structured-content.aze.md` | The `table`, `algorithm`, `statement` and `example` directives: typed columns with grouped headers and missing values, the six pseudocode statement forms, theorem-family statements with proofs, and worked examples composing nested mathematics. |
| `12-composition.aze.md` | The `figure` wrapper, the `bibliography` directive, `@`-references and parenthetical groups, citation locators, and endnote-rendered footnotes. |
| `13-diagnostics.aze.md` | The one intentionally invalid document: representative broken Blocks per family, each naming the exact diagnostic code and remedy the compiler produces. |
| `14-tex.aze.md` | Every isolated `tex` renderer profile: CircuitikZ, TikZ, PGFPlots, Chemfig and TikZ-CD. It needs the renderer image; see [Local TeX rendering](../development.md#local-tex-rendering). |
| `15-showcase.aze.md` | Six geometry figures: Thales theorem, two tangent branches, computed triangle marks, an arc and frame-clipped ray, and a frame-scale comparison. |
| `directive-reference.md` | Generated exhaustive grammar tables for all 26 registered directives, including nested header fields, body record fields, enum values, required fields, and compiler limits. |
| [`../themes.md`](../themes.md) | Built-in and custom Theme figure colours, native figure colour policy, geometry annotation sizing, frame clipping, and categorical band axes. |

## Verification status

The compiler currently registers all capabilities named in the product
capability map: mathematics, visualization, geometry, chemistry, electrical
engineering, digital timing, general diagrams, engineering diagrams, software
and data models, structured technical content, and document composition. The
registered native directives are:

| Category | Registered directives |
| --- | --- |
| Mathematics | `equation`, `derivation` |
| Visualization | `plot`, `chart` |
| Geometry | `geometry` |
| Chemistry | `formula`, `reaction`, `structure` |
| Electrical engineering | `circuit` |
| Digital timing | `timing` |
| Diagrams | `diagram`, `mermaid` |
| Engineering diagrams | `control`, `free-body` |
| Software and data models | `sequence`, `state`, `entity`, `class` |
| Structured technical content | `table`, `algorithm`, `statement`, `example` |
| Document composition | `figure`, `bibliography`, `callout` |

The compiler also registers `tex` as a bounded backend-authored escape hatch.
It is documented separately because TeX source is not native AzeMark notation.

`test/grammar.test.mjs` proves that the published grammar and registered plugin
set match, that described fields and record kinds compile, and that the example
corpus uses only described syntax. `test/capabilities.test.mjs` proves that the
capability report exposes the registered plugin set. Run both after changing a
directive contract.

Regenerate the exhaustive reference after a grammar change:

```bash
npm run build --silent
node scripts/generate-language-reference.mjs
node scripts/generate-language-reference.mjs --check
```

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

## Examples by category

Each category guide starts with a small form and finishes with examples that
combine more records, references, layout rules, or validation. Names below
match the subject of the example rather than requiring readers to decode its
Block `id`.

### Mathematics

- `equation`: Ohm's law, sample variance, Einstein field equation form,
  bracketed Hamiltonian, hybrid mode weight, Schrödinger relation chain,
  rotation matrix and vector, binder catalog, and nested quantifiers.
- `derivation`: compound interest, linearized enzyme rate, and annuity present
  value.

### Visualization

- `plot`: logistic growth, measured cooling curve, RC step response, and
  logarithmic amplifier gain sweep.
- `chart`: payload mass by stage, grouped benchmark scores, stacked warehouse
  throughput, request latency histogram, and grain-size distribution.

### Geometry

- Core guide: optics wedge, radar sweep, coordinate triangle, rail midpoint and
  perpendicular, two-circle survey fix, constructed tangents, brace jig, roof
  truss, and isosceles altitude.
- Theorem and rendering showcase: Thales theorem, tangents from an external
  point, isosceles triangle marks and measurements, arc and frame-clipped ray,
  frame-filled triangle, and sparse-frame triangle.

### Chemistry

- `formula`: water, ferrocyanide hydrate, and calcium lactate pentahydrate.
- `reaction`: silver chloride precipitation, Haber equilibrium, and an
  aluminium oxide skeletal reaction with unspecified coefficients.
- `structure`: water, fully specified alanine stereochemistry, and a
  phenethyl fragment with an attachment point and aromatic bonds.

### Electrical engineering

- `circuit`: resistive divider bias network, RC low-pass filter, op-amp
  transresistance stage, combinational gate network, flip-flop capture stage,
  clocked logic, intentionally floating clock circuit, and disconnected
  instructional schematic.

### Digital timing

- `timing`: clock and enable, sampled bus window, clocked bus transaction,
  pulse budget on a time scale, and the duration-authored twin of the bus
  transaction.

### Diagrams

- `diagram` flowcharts: water treatment line, library quality control, and a
  branching process with a cycle.
- `diagram` graphs and trees: collaboration graph, substation links, specimen
  tree, and a tree with forward references.
- `diagram` architecture: build tiers, signalling rooms, and grouped service
  architecture with ports.
- `mermaid`: release flow, sensor exchange sequence, and connection states.

### Engineering diagrams

- `control`: open-loop heater, closed-loop pitch controller, and a controller
  with an intentionally floating trim output.
- `free-body`: trolley push, block on an inclined plane with a dimension, and
  cantilever with an end load, reaction moment, axes, and angle.

### Software and data models

- `sequence`: cache lookup, backup rotation, and login exchange with
  activations, alternatives, a loop, and a note.
- `state`: parcel lifecycle, culture incubation, and an order lifecycle with
  composite states and transitions.
- `entity`: sensor schema, enrollment schema, and shop schema with keys and
  relationships.
- `class`: vehicle classes, telemetry classes, and payment classes covering
  inheritance, implementation, association, aggregation, and composition.

### Structured technical content

- `table`: pilot-line yields, control-loop gains, and cooling measurements with
  typed columns, grouped headers, quantities, and missing values.
- `algorithm`: dot product, deviation classification, and binary search using
  all six statement forms across the set.
- `statement`: trace definition, even-sum lemma with proof, and triangle
  inequality theorem.
- `example`: molar dilution, pendulum period, and a multi-step cooling model.

### Document composition

- `figure`: measured trend table, wrapped Mermaid flowchart, and unnumbered
  instrument note.
- References and citations: grouped figure references, TeXbook page and chapter
  locators, forward Harel article citation, and ISO 32000 section locator.
- `bibliography`: book, article, and standard records in one document-local
  reference list.
- Footnotes: reused instrument-method note and calibration note.
- `callout`: steady-state note, probe-drift warning, and conductivity shortcut
  with nested mathematics.
