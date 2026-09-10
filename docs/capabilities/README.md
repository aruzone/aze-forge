# AzeForge capabilities

This is the first-level guide to the native AzeMark capabilities currently
registered by AzeForge. Each example is a small `azemark: 2` source fragment.
Native blocks preserve their domain meaning in the document model and can be
rendered to HTML, SVG, PNG, and PDF.

For the broader approved catalog, including roadmap families, see
[`docs/native-plugin-family-tree.md`](../native-plugin-family-tree.md). The
catalog is intentionally broader than the current built-in registry; this
guide labels the current registered plugins.

## Capability tree

```text
AzeForge
├── Mathematics
│   ├── equation
│   └── derivation
├── Visualization
│   ├── plot
│   └── chart
├── Geometry
│   └── geometry
├── Chemistry
│   ├── formula
│   ├── reaction
│   └── structure
├── Electrical engineering
│   └── circuit
├── Diagrams
│   └── mermaid
├── Data and composition
│   ├── table
│   └── callout
└── Ordinary Markdown
    ├── headings and paragraphs
    ├── lists and links
    ├── code and images
    └── emphasis and thematic breaks
```

## Mathematics

### `equation`

Readable native math is converted to typeset output. The grammar covers
expressions, powers, subscripts, Greek names, fractions, roots, common
functions, sums, integrals, limits, matrices, and piecewise expressions.

```text
:::: equation
id: exponential-decay
number: true
----
x(t) = c_1 (-cos(t) + sin(t) * 2 cos(t)) e^(2t)
::::
```

Raw LaTeX is a separately controlled escape hatch and is denied by default for
untrusted input.

### `derivation`

A derivation contains ordered expressions and optional annotations. It renders
as an aligned sequence rather than as unrelated equations.

```text
:::: derivation
id: geometric-series
----
- expression: S_n = sum i=0..n of r^i
  annotation: Define the partial sum
- expression: r * S_n = sum i=1..n+1 of r^i
  annotation: Multiply by r
- expression: S_n = (1 - r^(n+1)) / (1 - r)
  annotation: Rearrange
::::
```

## Visualization

### `plot`

Plots support bounded function evaluation and authored numeric series. A plot
can combine function curves, line series, scatter points, and uncertainty
values on shared axes.

```text
:::: plot
id: step-response
parameters:
  V0: 5
  R: 1000
  C: 1e-6
x-axis:
  label: time (s)
  min: 0
  max: 0.005
y-axis:
  label: voltage (V)
  min: 0
  max: 5
----
- kind: function
  label: response
  variable: t
  expression: V0 * (1 - exp(-t / (R * C)))
  domain:
    min: 0
    max: 0.005
  samples: 200
- kind: scatter
  label: measurements
  points:
    - x: 0.001
      y: 3.1
      error: 0.1
::::
```

Expressions are checked for bounded, evaluable behavior before rendering.

### `chart`

Charts cover categorical bars and numeric histograms. Supported bar variants
are `bar`, `grouped-bar`, and `stacked-bar`.

```text
:::: chart
id: materials
number: true
type: bar
x-label: material
y-label: mass (kg)
----
- kind: bars
  label: sample mass
  bars:
    - category: Aluminum
      value: 2700
    - category: Steel
      value: 7850
::::
```

## Geometry

### `geometry`

Geometry is authored as an ordered declaration graph. It supports points,
segments, lines, circles, polygons, intersections, perpendicular and parallel
constructions, labels, measurements, equal-length marks, and right-angle marks.

```text
:::: geometry
id: triangle-altitude
number: true
----
- kind: point
  name: a
  label: A
  x: 0
  y: 4
- kind: point
  name: b
  label: B
  x: -3
  y: 0
- kind: point
  name: c
  label: C
  x: 3
  y: 0
- kind: segment
  name: base
  from: b
  to: c
- kind: perpendicular-foot
  name: foot
  from: a
  to: base
- kind: segment
  name: altitude
  from: a
  to: foot
  style: dashed
- kind: right-angle-mark
  first: a
  second: foot
  third: c
::::
```

Construction references resolve backward in authored order, which makes
ambiguous or forward references diagnosable.

## Chemistry

### `formula`

Chemical formulas preserve authored element quantities and notation such as
subscripts, charges, and isotopes.

```text
:::: formula
id: water
number: true
----
H2O
::::
```

### `reaction`

Reactions support reactants, products, coefficients, arrows, state labels, and
optional balance checking.

```text
:::: reaction
id: neutralization
balance: check
----
HCl(aq) + NaOH(aq) -> NaCl(aq) + H2O(l)
::::
```

### `structure`

Molecular structures use explicit atom coordinates and bond records. The
renderer does not silently infer omitted structural facts.

```text
:::: structure
id: water-structure
----
- atom: o
  element: O
  at: [0, 0]
- atom: h1
  element: H
  at: [-1.2, 0.8]
- atom: h2
  element: H
  at: [1.2, 0.8]
- bond:
  from: o
  to: h1
  order: 1
- bond:
  from: o
  to: h2
  order: 1
::::
```

## Electrical engineering

### `circuit`

Circuit blocks describe instructional analog and digital schematics through
components, named nodes, terminal bindings, annotations, and a selected IEC or
ANSI symbol convention. Supported components include passive elements, sources,
semiconductor devices, logic gates, multiplexers, flip-flops, and digital
inputs and outputs.

```text
:::: circuit
id: voltage-divider
----
- kind: node
  ref: vcc
- kind: node
  ref: mid
- kind: node
  ref: ground
- kind: voltage-source
  ref: V1
  value: 12 V
- kind: resistor
  ref: R1
  value: 1 kohm
- kind: resistor
  ref: R2
  value: 2 kohm
- kind: connect
  terminal: V1.positive
  node: vcc
- kind: connect
  terminal: V1.negative
  node: ground
- kind: connect
  terminal: R1.a
  node: vcc
- kind: connect
  terminal: R1.b
  node: mid
- kind: connect
  terminal: R2.a
  node: mid
- kind: connect
  terminal: R2.b
  node: ground
::::
```

Circuit support is coordinate-free: the semantic connections are represented
by node and terminal relations rather than manually positioned wires.

## Diagrams

### `mermaid`

The Mermaid plugin accepts bounded Mermaid source, such as flowcharts. It is
rendered through the pinned browser path and is distinct from a native
coordinate-free diagram model.

```text
:::: mermaid
id: release-flow
title: Release flow
----
flowchart LR
  source[Write source] --> validate[Validate]
  validate --> render[Render]
  validate --> fix[Fix diagnostics]
  fix --> validate
::::
```

## Data and composition

### `table`

Typed tables support text, prose, quantity, and unit-aware columns. They also
support captions, grouped headers, missing cells, and deterministic formatting.

```text
:::: table
id: measurements
caption: Cooling measurements
----
columns:
  - key: trial
    name: Trial
    type: text
  - key: temperature
    name: Temperature
    type: quantity
    unit: K
rows:
  - trial: A1
    temperature: 344.2
  - trial: A2
    temperature: 338.4
::::
```

### `callout`

Callouts provide titled note, warning, and informational blocks. Their bodies
use ordinary Markdown and can contain nested supported content.

```text
:::: callout
variant: note
title: Determinism
----
The same Source produces byte-identical Artifacts.
::::
```

## Shared rendering behavior

Every registered native block can participate in a normal AzeMark document:

```text
---
azemark: 2
title: Engineering note
---

# Results

A paragraph can introduce the next block.

:::: equation
id: result
----
E = m c^2
::::
```

Use the CLI to inspect the package's exact supported plugin and renderer
capabilities:

```bash
azeforge capabilities --json
```

The current renderer targets are `html`, `svg`, `png`, and `pdf`. Unsupported
native declarations fail with diagnostics instead of silently falling back to
backend source.
