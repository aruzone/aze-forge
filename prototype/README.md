# Taste representative AzeMark authoring forms

Prototype AzeMark (`.aze.md`) source files for [wayfinder ticket #50](https://github.com/aruzone/aze-forge/issues/50).

These files are **throwaway prototypes** for owner taste review. They exercise the approved `azemark: 2` envelope, shared language contract, and all ten native Technical object families, including structured technical content (typed tables, algorithms, statements, and worked examples) as the tenth. They are intentionally rough-but-coherent: readable, compact, editable, and internally consistent as far as the approved contracts allow.

## Files

| File | Purpose |
|---|---|
| `01-happy-paths.aze.md` | One representative happy path per native family in a single sampler Document. |
| `02-geometry-forms.aze.md` | Coordinate-based and named-construction geometry side by side, per R6. |
| `03-circuit-scenarios.aze.md` | Floating Circuit and a disconnected instructional schematic with warnings, per R1. |
| `04-chemistry-information.aze.md` | Specified versus unspecified/omitted chemistry information, per R4. |
| `05-composition-report.aze.md` | Table, algorithm, statement/proof, and worked example. |
| `06-corrective-diagnostics.aze.md` | Representative diagnostics that should appear under the approved contracts. |

## Constraints honored

- `azemark: 2` with fixed `::::` outer / `::` nested directives and mandatory `----` header/body separator.
- No positional directive arguments; no variable-width fences.
- Two-space structural indentation; standalone `//` structural comments where allowed.
- Quantity/unit spellings follow the language contract.
- Circuit remains coordinate-free; geometry, free-body declarations, and chemistry structure atoms carry authored coordinates.
- No backend source is presented as native AzeMark.

## Open for taste review

- Whether the `----` separator feels too ceremonial or just explicit enough.
- Whether the shared `- kind:` record idiom is readable across families.
- Whether free-body's invisible-by-default `line` convention (geometry's visible default inverted) feels natural in the inclined-plane scenario.
- Whether the chemistry `structure` atom/bond record list is compact enough for small molecules.
