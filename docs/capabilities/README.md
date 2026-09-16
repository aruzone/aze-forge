# AzeForge capabilities

This is the first-level guide to the native AzeMark capabilities currently
registered by AzeForge. Each example is a small `azemark: 2` source fragment.
Native blocks preserve their domain meaning in the document model and can be
rendered to HTML, SVG, PNG, and PDF.

For the broader approved catalog, including roadmap families, see
[`docs/native-plugin-family-tree.md`](../native-plugin-family-tree.md). The
catalog is intentionally broader than the current built-in registry; this
guide labels the current registered plugins.

Every registered plugin below is also authored in this guide's example library,
one document per family, each graded from a minimal form to the deepest
registered form: [`docs/language/`](../language/README.md). Those documents are
compile-verified whole Sources, not fragments, and are the fastest way to see a
capability in context.

This guide is prose. The directives it describes, their header keys, their body
records and their field vocabularies are published as data — derived from the
tables the validators use — by `azeforge grammar [--json] [--directive <type>]`
(`.directives[]` in the machine document). When the two disagree, the command is
right.

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
│   ├── circuit
│   └── timing
├── Diagrams
│   ├── diagram
│   └── mermaid
├── Engineering diagrams
│   ├── control
│   └── free-body
├── Software and data models
│   ├── sequence
│   ├── state
│   ├── entity
│   └── class
├── Structured technical content
│   ├── table
│   ├── algorithm
│   ├── statement
│   └── example
├── Document composition
│   ├── figure
│   ├── bibliography
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

### `timing`

Timing blocks describe digital transactions over one shared scale: the integer
cycle grid, or an explicit duration axis with a registered unit. Clock and
single-bit signals carry edge states, buses carry authored values, and unknown
and high-impedance windows remain distinct states. Groups, markers, and
`signal@boundary` arrows are authored display facts.

```text
:::: timing
id: handshake
number: true
title: Clocked handshake
scale: cycles
----
- kind: signal
  ref: clk
  clock: true
  wave: 2p2n
- kind: signal
  ref: valid
  wave: 0011
- kind: signal
  ref: addr
  width: 8
  wave: x={A5}.
- kind: group
  label: Transaction
  signals: valid, addr
- kind: marker
  at: 0
  label: Reset
- kind: arrow
  from: addr@2
  to: valid@2
  label: t_{su}
::::
```

Signals, groups, markers, and arrows keep their authored order in the
Document. The family registers no warnings: every unsupported or
contradictory declaration is an error, and arrows and markers describe the
claimed transaction rather than certifying it.

## Engineering diagrams

### `control`

Native control-system diagrams author one flat, ordered declaration list of
SISO function blocks, summing junctions, directional boundary stubs and
anonymous signal edges. A block carries a plain-text transfer function, a
junction carries its signs as a bounded domain expression, and every reference
resolves in two passes, so forward references are legal and an undeclared name
is never guessed. A takeoff is implicit fan-out — several out-edges from one
item render as a dot — never a nameable entity. The compiler checks four
bounded structural rules and nothing else: feedback, reachability and topology
plausibility are the author's claim, not the compiler's judgement.

```text
:::: control
id: pitch-loop
flow: left-to-right
----
- kind: input
  name: ref
  label: Θ_c(s)
- kind: sum
  name: err
  signs: [+, -]
- kind: block
  name: ctrl
  tf: K_p (1 + 1/(T_i s))
- kind: block
  name: plant
  tf: 1/(s(s+2))
- kind: output
  name: out
  label: Θ(s)
- kind: edge
  from: ref
  to: err
- kind: edge
  from: err
  to: ctrl
- kind: edge
  from: ctrl
  to: plant
- kind: edge
  from: plant
  to: out
- kind: edge
  from: plant
  to: err
::::

```

`signs:` pairs positionally with the junction's in-edges in authored order, so
its length and order are hash-significant. Layout is the pinned elkjs layered
engine over the shared Advance metric: deterministic, total over every valid
Block, and never serialized — only the derived geometry is projected.

### `free-body`

Native free-body diagrams author bodies, anchored vectors and display marks in
one y-up unitless exact-decimal frame. Bodies are `block`, `circle`, `polygon`
and `particle`; records are `point`, `line`, `force`, `moment`, `axes`,
`angle-mark` and `dimension`. `name:` lives only on referenceables, so forces,
moments, axes and marks are anonymous. An attachment is exactly one point name
or a bounded `(x, y)` pair, and a force carries exactly one direction form:
`angle:`, or `parallel-to:`/`perpendicular-to:` naming a `line`, whose from–to
order picks the ray.

```text
:::: free-body
id: incline-block
scale: 0.15
----
- kind: polygon
  name: wedge
  vertices:
    - toe
    - heel
    - top
- kind: point
  name: contact
  x: 3
  y: 1.09
  visible: false
- kind: line
  name: slope-face
  from: toe
  to: top
- kind: force
  at: contact
  perpendicular-to: slope-face
  magnitude: 18.4
  label: N
- kind: axes
  at: contact
  angle: 20
- kind: dimension
  from: (2.08, 1.29)
  to: (3.58, 1.83)
  label: L
::::

```

`scale:` is the frame-units-per-force-unit switch: with it every force authors
`magnitude:` and its length is derived; without it every force authors a
schematic `length:` and no magnitude is permitted. Nothing in the Block is
computed into the Document and no `measure:` field exists — the compiler
renders the physics the author claims and judges nothing.

## Diagrams

### `diagram`

Native general diagrams author one flat, ordered declaration list of nodes,
groups, ports, and edges over one shared model. A required `mode:` selects the
structural rules and the layout regime — `flowchart`, `graph`, `tree`, or
`architecture` — and an optional `flow:` overrides the mode's default
direction. Node names and group names share one Block-local namespace, ports
live inside their node as `node.port`, and every reference resolves in two
passes, so forward references are legal and an undeclared name is never
guessed. Layout is deterministic and total: it is computed for every valid
Block, and placement never becomes connectivity.

```text
:::: diagram
id: auth-flow
number: true
title: Authentication flow
mode: flowchart
flow: top-to-bottom
----
- kind: node
  name: start
  label: Start
  shape: circle
- kind: node
  name: check-token
  label: Valid token?
  shape: diamond
- kind: node
  name: home
  label: Show home
- kind: edge
  from: start
  to: check-token
- kind: edge
  from: check-token
  to: home
  label: yes
::::
```

Groups nest up to four deep and are containers only — never edge endpoints —
while ports are named attachment points with no direction and no electrical
meaning. Shapes are a closed, semantically neutral vocabulary
(`rectangle`, `rounded`, `diamond`, `parallelogram`, `circle`, `hexagon`,
`cylinder`); a `diamond` does not demand two branches. `direction: undirected`
is permitted in `graph` and `architecture` and refused in `flowchart` and
`tree`. Four warnings report structure without failing a Block: an isolated
node, a disconnected component, an unused port, and an empty group.

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

## Software and data models

### `sequence`

Sequence diagrams author participants and then an ordered timeline of
messages, `alt` and `loop` fragments, and notes. The two orders are both live —
participant order is left-to-right lane order, timeline order is time — so
they are authored as separate `participants:` and `timeline:` sections.
`from:` and `to:` are always explicit and must name a declared participant;
`form:` is `sync`, `async`, or `return` and defaults to `sync`, and a `return`
carries its own authored direction instead of being paired with a preceding
call. Activations are explicit `activate:` and `deactivate:` flags, balanced
per scope: every `alt` division must end with the same set of open bars, and a
`loop` body must be activation-neutral.

```text
:::: sequence
id: order-handshake
number: true
title: Order handshake
----
participants:
  - name: client
    kind: actor
    label: Client
  - name: api
    label: API
timeline:
  - kind: message
    from: client
    to: api
    text: Submit order
    activate: true
  - kind: loop
    condition: Retry budget remains
    body:
      - kind: message
        from: api
        to: client
        form: return
        text: Retry later
  - kind: message
    from: api
    to: client
    form: return
    text: Order id
    deactivate: true
::::
```

Reading order is timeline order: every authored label is real SVG `<text>`,
while lifelines, arrowheads and activation bars are `aria-hidden` decoration,
because the relation they express is already in text. A message with `text:`
omitted renders an unlabeled arrow, and fragment conditions render `[condition]`
when authored. One warning reports structure without failing a Block: a
participant declared and never used. An unbalanced activation is an error, and
the timeline must end with an empty activation stack.

### `state`

State machines author one flat, ordered list of states, initial and final
pseudo-states, and transitions. A `state` may carry a nested `states:`
collection holding only states and pseudo-states, and names are flat and unique
across the whole Block, so a transition references any state at any depth.
`initial` renders as a filled dot and `final` as a bullseye, and neither shows
its name — the name exists because transitions reference it. `trigger:`,
`guard:` and `action:` are three separate authored fields; the renderer composes
them as `trigger [guard] / action`, and that composition is presentation, never
Document data.

```text
:::: state
id: order-lifecycle
number: true
title: Order lifecycle
----
- kind: initial
  name: entry
- kind: state
  name: Draft
  label: Draft order
- kind: state
  name: Shipped
- kind: final
  name: Completed
- kind: transition
  from: entry
  to: Draft
- kind: transition
  from: Draft
  to: Shipped
  trigger: checkout
  guard: cart is not empty
  action: reserve stock
- kind: transition
  from: Shipped
  to: Completed
  trigger: delivered
::::
```

Validation is structural only, because executable state-machine behavior is
deferred: exactly one `initial` per scope, no transition into an `initial` or
out of a `final`, and no shared name between an outer and an inner scope. Two
warnings report topology without failing a Block — a state unreachable from its
scope's `initial`, and a non-`final` state with no outgoing transition.

### `entity`

Entity-relationship Blocks author entities with attributes and keys, plus
relationships whose every end carries a cardinality. An attribute's `keys:` is a
collection over `primary`, `foreign`, and `unique`, so a junction table whose
primary key is also a foreign key is expressible without repeating a field.
`type:` is authored text and is never validated against any type system;
`references:` on a foreign key is validated against a real entity and attribute
in the same Block.

```text
:::: entity
id: shop-schema
number: true
title: Order schema
----
- kind: entity
  name: Customer
  attributes:
    - name: id
      type: uuid
      keys:
        - primary
    - name: email
      type: text
      keys:
        - unique
- kind: entity
  name: Order
  attributes:
    - name: id
      type: uuid
      keys:
        - primary
    - name: customer_id
      type: uuid
      keys:
        - foreign
      references:
        entity: Customer
        attribute: id
- kind: relationship
  label: places
  first:
    entity: Customer
    cardinality: one
  second:
    entity: Order
    cardinality: one-or-many
::::
```

Each end's `cardinality:` states how many instances of that end's entity
participate in one relationship instance, and renders at that end, so the
Block above reads "one customer places one-or-many orders". The cardinality
enum is shared verbatim with class association ends, and the authored words
never appear in output. Two warnings report topology without failing a Block —
an entity with no `primary` key, and an entity in no relationship.

### `class`

Class diagrams author classes and interfaces with ordered members, plus typed
relationships. A `class` may be `abstract:` and carries `attributes:` and
`operations:`; an `interface` is an operation contract only, so an attribute on
one is rejected rather than quietly accepted. An operation's `parameters:` is an
ordered collection of `name:` and optional `type:` records, and the renderer
always emits the parentheses, so an operation that omits both `parameters:` and
`return-type:` still renders as `total()`. `inheritance` and `implementation`
point from subtype to supertype with a hollow triangle at the target end and
`implementation` drawn dashed; `aggregation` and `composition` put the diamond
at the `from:` end; and `association` renders with no arrowhead at all, because
navigability is deferred and an invented arrow would claim a direction the
author never wrote.

```text
:::: class
id: payment-classes
number: true
title: Payment classes
----
- kind: interface
  name: PaymentGateway
  operations:
    - name: authorize
      parameters:
        - name: amount
          type: Money
        - name: source
          type: Account
      return-type: Authorization
- kind: class
  name: StripeGateway
  operations:
    - name: authorize
      visibility: public
      parameters:
        - name: amount
          type: Money
      return-type: Authorization
- kind: relationship
  form: implementation
  from: StripeGateway
  to: PaymentGateway
::::
```

Member order is display order, and `visibility:` and `static:` stay unspecified
when omitted rather than defaulting to public. `inheritance` requires both ends
to agree — two classes or two interfaces — `implementation` requires an
interface target, multiplicity is refused on both ranked forms, and an
inheritance cycle is an error listing its path. Multiple inheritance is legal
and unremarked, because the compiler claims no language semantics. One warning
reports topology without failing a Block: a class in no relationship.

## Structured technical content

### `table`

Typed tables declare a closed seven-type column system — `prose` (Markdown
Inline content), `text`, `integer`, `decimal`, `quantity`, `boolean` and
`math` — plus optional per-column `unit:` and `align:`. Alignment defaults to
the column type (`integer`/`decimal`/`quantity` right, `boolean` center, the
rest left). A cell omitted from a row record is a missing value, kept
distinct from `0`, from an empty string and from a misspelled key. One level
of grouped headers spans adjacent columns.

```text
:::: table
id: measurements
number: true
caption: Cooling measurements
----
columns:
  - key: trial
    name: Trial
    type: text
  - key: start-temp
    name: Start temp
    type: quantity
    unit: K
  - key: note
    name: Observation
    type: prose
groups:
  - name: Temperature
    columns:
      - start-temp
      - end-temp
rows:
  - trial: A1
    start-temp: 344.2
    note: lid on
  - trial: A2
    start-temp: 344.5
::::
```

Ordinary Markdown pipe tables keep working and migrate mechanically: the
header row becomes `prose` columns with their names verbatim and the GFM
alignment markers become `align:` overrides.

### `algorithm`

One procedure per Block, with a closed six-form statement set — `assign`,
`if` with `then:`/`else-if:`/`else:`, `for` with `to`/`downto`, `while` with
`do:`, `return` and the authored `text:` line — nested through the shared
two-space record tree. Expressions are parsed but never evaluated.

```text
:::: algorithm
id: binary-search
number: true
caption: Binary search over a sorted array
----
procedure: BinarySearch
parameters:
  - A
  - target
steps:
  - assign: lo = 0
  - assign: hi = length(A) - 1
  - while: lo <= hi
    do:
      - assign: mid = floor((lo + hi) / 2)
      - if: A[mid] == target
        then:
          - return: mid
        else-if: A[mid] < target
        then:
          - assign: lo = mid + 1
        else:
          - assign: hi = mid - 1
  - return: -1
::::
```

### `statement`

A theorem-family statement requires one closed `kind:` (`theorem`,
`definition`, `lemma`, `corollary`, `proposition`, `remark`) and contains at
most one proof. The QED mark is renderer-derived and never authored.

```text
:::: statement
id: triangle-inequality
number: true
kind: theorem
caption: Triangle inequality in the plane
----
text: |
  For any three points `A`, `B` and `C` in the plane, the sum of the lengths
  of two sides of a triangle is at least the length of the third side.
proof: |
  Place the points in a coordinate system. Then

  :: equation
  ----
  abs(A - C) <= abs(A - B) + abs(B - C)
  ::
::::
```

### `example`

A worked example composes problem, givens, ordered steps and result as one
numbered object, and composes the approved equation and derivation Blocks
inside its steps rather than redefining mathematics.

```text
:::: example
id: cooling-model
number: true
caption: Deriving the exponential cooling model
----
problem: |
  Fit Newton's law and predict the temperature at `600 s`.
givens:
  - ambient temperature held constant
steps:
  - text: |
      Evaluate at `t = 600 s`:

      :: equation
      ----
      T(600) = 295 + 49.2 * exp(-0.00334 * 600)
      ::
result: |
  `T(600) ~= 333.1 K`.
::::
```

## Document composition

### `figure`

`figure` numbers ordinary Markdown content and escape-hatch bodies such as a
Mermaid diagram. Its body holds one or more Markdown Blocks plus eligible
nested directives, and an empty body is refused.

```text
:::: figure
id: response
number: true
caption: Step response
----
![Step response](response.png)
::::
```

### `bibliography`

One `bibliography` directive declares the document-local reference list as
ordered records with the closed citation field set. The rendered list appears
where the directive stands, and uncited entries are excluded and warned.

```text
:::: bibliography
----
- key: knuth-1984
  type: book
  title: The TeXbook
  authors:
    - name: Donald E. Knuth
      family: Knuth
  year: 1984
::::
```

### Prose references, citations and footnotes

`@name` references an object or citation in one document-wide identifier
namespace; `[@name]` renders parenthetically and `[@a; @b]` is a mixed group
of up to eight targets. A locator attaches only to a Citation record:

```text
See @measurements for the trials and [@knuth-1984, page 23] for the source.[^method]

[^method]: The trials ran on one instrument.
```

Footnotes render as one endnotes section at the document end, with a backlink
per marker. `citation-style: numeric | author-year` in the front matter
selects the bibliography style; `numeric` is the built-in default.

### `callout`

Callouts provide titled informational and warning blocks over the closed variant
set `note`, `tip`, `important`, `warning` and `caution`; `note` is the default.
Their bodies use ordinary Markdown and can contain nested supported content.

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
