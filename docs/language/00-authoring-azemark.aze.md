---
azemark: 2
title: Authoring AzeMark
author:
  - AzeForge examples
---

# Authoring AzeMark

AzeMark is the source language accepted by AzeForge. An `.aze.md` Source combines ordinary Markdown with typed directives for mathematics, diagrams, engineering notation, technical records, and document composition. AzeForge parses the Source, validates each typed Block, and renders the same meaning to HTML, SVG, PNG, or PDF.

Start here if you have not authored AzeMark before. The category guides linked below contain complete Sources and examples that progress from a small Block to a demanding one. The [directive grammar reference](directive-reference.md) lists every accepted field, enum value, body record, and compiler limit.

## A minimal Source

A document that uses directives starts with YAML front matter and declares AzeMark 2.

```yaml
---
azemark: 2
title: First lab note
author:
  - Ada Example
---
```

After front matter, write Markdown as usual.

```markdown
# First lab note

The measured resistance was **220 ohm** at `25 degC`.

- supply voltage: 5 V
- measured current: 22.7 mA
```

Add a typed Block when prose is not enough. This complete equation has an identifier and a readable mathematics body.

:::: equation
id: authoring-ohm-law
----
V = I * R
::::

The Source for that Block is:

```text
:::: equation
id: copy-of-ohm-law
----
V = I * R
::::
```

## Directive anatomy

Every document-level directive has four parts in this order.

1. An opening fence of exactly four colons, one space, and the directive type.
2. Zero or more header fields written as YAML-style `key: value` pairs.
3. The exact `----` separator.
4. A body whose grammar belongs to that directive, followed by a closing fence of exactly four colons.

The fence width is fixed. Three colons do not open a directive. Five colons are not an alternate spelling. Do not copy variable-width Markdown container syntax into AzeMark.

```text
:::: <directive-type>
header-key: value
----
directive body
::::
```

Header fields describe the Block as a whole. Body fields describe its technical content. For example, a plot puts canvas and axis settings in the header, then puts function or point series in the body.

```text
:::: plot
id: quadratic-sample
x-axis:
  label: x
y-axis:
  label: y
----
- kind: function
  expression: x^2
  domain:
    min: -2
    max: 2
::::
```

AzeMark refuses unknown header keys and body fields. This is deliberate. A misspelling cannot silently become metadata or disappear from the output.

## Indentation and records

Structural indentation is two spaces. A record list starts each record with `-`. Most technical object families use `- kind:` to select the record grammar.

```text
- kind: point
  name: origin
  label: O
  x: 0
  y: 0
- kind: point
  name: endpoint
  label: A
  x: 4
  y: 0
- kind: segment
  name: radius
  from: origin
  to: endpoint
```

Some families use named records instead of `kind`. Chemistry structures use `- atom:`, `- bond:`, and `- label:`. Typed tables use `columns:`, `groups:`, and `rows:`. Algorithms use `procedure:`, `parameters:`, and `steps:`. Follow the body form shown in the category guide or the grammar reference. Do not translate one family's record shape into another.

Lists nested inside a record add another two spaces at each level.

```text
- kind: polygon
  name: plate
  vertices:
    - lower-left
    - lower-right
    - upper-right
    - upper-left
```

Use spaces, not tabs, for structural indentation. Standalone `//` comments are accepted only where that directive grammar permits them. Markdown paragraphs still use ordinary Markdown syntax rather than structural comments.

## Values and names

AzeMark field types are closed. Common types include booleans such as `true`, integers, decimals, text, identifiers, enums, lists, and nested records. Enum spelling is exact. For example, a plot axis scale is `linear` or `log`; `logarithmic` is not an alias.

A document identifier starts with a lowercase letter and may continue with lowercase letters, digits, and single hyphen-separated parts. These are valid:

```text
water
figure-2
rc-step-response
```

These are invalid:

```text
2-water
RC_Response
water--sample
```

Identifiers share one document-wide namespace. Give a Block an `id` when prose, a figure, or a citation must refer to it. Technical declarations inside a Block use the local naming field defined by that family, commonly `name` or `ref`.

References are checked. A geometry segment cannot point to a missing point. A Circuit connection cannot name an unknown component terminal. A class relationship cannot name a class that was never declared. Many declaration-based families resolve references backward in authored order, so declare an object before the records that use it.

## Composition and nesting

Markdown Blocks and typed Blocks share one document order. Put prose before a directive to explain what the reader should notice, then put interpretation after it. Do not hide the conclusion in a diagram label.

A document-level directive uses four-colon fences. A directive nested inside a supported composition Block uses two-colon fences and two spaces of indentation.

:::: callout
id: authoring-nested-equation
variant: tip
title: Nested mathematics
----
Use a nested equation when the mathematics belongs to the callout rather than to the surrounding section.

  :: equation
  id: authoring-power-law
  ----
  P = V * I
  ::

The nested Block still has its own type, header, separator, body, identifier, and validation rules.
::::

Only composition directives that explicitly accept child Blocks may contain them. A record body such as `geometry`, `plot`, or `circuit` cannot contain arbitrary Markdown or another directive.

## Native notation and escape hatches

Use native AzeMark notation when a native directive covers the subject. Native Blocks preserve technical meaning and let AzeForge validate references, units, balance, topology, and other family rules.

Two bounded escape hatches exist:

- `mermaid` accepts supported Mermaid diagram source when the native `diagram` family does not express the needed diagram.
- `tex` accepts source for one registered TeX renderer profile. It requires the configured TeX renderer and is backend-authored content, not native AzeMark.

Raw LaTeX inside an `equation` also requires an explicit command opt-in. The readable mathematics grammar is the default and needs no opt-in.

## Capability guides

| Subject | Directives | Guide |
| --- | --- | --- |
| Mathematics | `equation`, `derivation` | [Mathematics](02-mathematics.aze.md) |
| Visualization | `plot`, `chart` | [Visualization](03-visualization.aze.md) |
| Geometry | `geometry` | [Geometry](04-geometry.aze.md) |
| Chemistry | `formula`, `reaction`, `structure` | [Chemistry](05-chemistry.aze.md) |
| Electrical engineering | `circuit` | [Circuits](06-circuit.aze.md) |
| Digital timing | `timing` | [Timing](07-timing.aze.md) |
| General diagrams | `diagram`, `mermaid` | [Diagrams](08-diagrams.aze.md) |
| Engineering diagrams | `control`, `free-body` | [Engineering](09-engineering.aze.md) |
| Software and data models | `sequence`, `state`, `entity`, `class` | [Models](10-models.aze.md) |
| Structured technical content | `table`, `algorithm`, `statement`, `example` | [Structured content](11-structured-content.aze.md) |
| Document composition | `figure`, `bibliography`, `callout` | [Composition](12-composition.aze.md) |

[Document basics](01-document-basics.aze.md) covers front matter, headings, paragraphs, emphasis, code, lists, links, blockquotes, thematic breaks, pipe tables, and callouts. [Diagnostics](13-diagnostics.aze.md) shows representative invalid Sources and the exact remedies. [TeX profiles](14-tex.aze.md) documents the optional backend-authored path.

## Validate while writing

Validate before rendering:

```bash
azeforge validate report.aze.md
```

Success is silent and exits with status `0`. Warnings also exit `0` and describe a condition the compiler can render but the author should inspect. Errors exit `1` and prevent a new artifact from replacing the last good one.

Use JSON diagnostics in an editor or another tool:

```bash
azeforge validate report.aze.md --diagnostics json
```

A diagnostic includes a stable code, severity, message, and source range. Fix the first structural error before chasing later errors. One missing separator or one wrong indentation level can change how the following lines parse.

Ask the installed compiler for its exact grammar when a field is in doubt:

```bash
azeforge grammar --json --directive geometry
azeforge grammar --json --directive circuit
```

The [generated directive reference](directive-reference.md) is the readable
snapshot of that same report. `azeforge capabilities --json` reports the
installed commands, plugins, renderers, formats, themes, engines, policy, and
schemas.

## Authoring checklist

Before sharing a Source:

- declare `azemark: 2` when the document contains a directive
- use exactly four colons for document-level directive fences
- keep the `----` separator between a directive header and body
- indent structural children by two spaces
- use only fields and enum values registered for that directive
- declare names before records that refer to them
- use document-wide unique identifiers
- state uncertainty explicitly where the family supports it instead of inventing a value
- run `azeforge validate`
- render the target format and inspect the actual artifact
