# AzeMark language reference

Canonical, owner-approved AzeMark authoring forms for the AzeMark 2
(`azemark: 2`) envelope. These files are the frozen reference that
implementation consumes; they were approved during the wayfinder taste
review for [issue #50](https://github.com/aruzone/aze-forge/issues/50) and
port the canonical assets from the `prototype/taste-authoring-forms` branch.

These forms are **not** compiler test fixtures. The compiler currently
validates AzeMark 1 (`azemark: 1`) exclusively, so these AzeMark 2 examples
do not yet pass `validate`; they document the target grammar for the AzeMark 2
cutover rather than exercising the shipped build. As family, language, and
numbering contracts are implemented, the approved forms become the source for
live `test-files/valid/` fixtures.

## Files

| File | Purpose |
|---|---|
| `01-happy-paths.aze.md` | One representative happy path per native family in a single sampler Document. |
| `02-geometry-forms.aze.md` | Coordinate-based and named-construction geometry side by side, per R6. |
| `03-circuit-scenarios.aze.md` | Floating Circuit and a disconnected instructional schematic with warnings, per R1. |
| `04-chemistry-information.aze.md` | Specified versus unspecified/omitted chemistry information, per R4. |
| `05-composition-report.aze.md` | Table, algorithm, statement/proof, and worked example. |
| `06-corrective-diagnostics.aze.md` | Representative diagnostics that should appear under the approved contracts. |

## Approved constraints

Owner-approved and frozen in [issue #50](https://github.com/aruzone/aze-forge/issues/50):

- `azemark: 2` with fixed `::::` outer / `::` nested directives and mandatory `----` header/body separator.
- No positional directive arguments; no variable-width fences.
- Two-space structural indentation; standalone `//` structural comments where allowed.
- Quantity/unit spellings follow the language contract.
- Circuit remains coordinate-free; geometry, free-body declarations, and chemistry structure atoms carry authored coordinates.
- No backend source is presented as native AzeMark.
- Shared `- kind:` record idiom across all ten native families (the tenth being structured technical content: typed tables, algorithms, statements, and worked examples).
- Corrective diagnostics sampler accepted as the representative author-facing diagnostic voice.

Implementation consumes these forms without reopening the underlying family,
language, or numbering contracts.