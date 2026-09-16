---
azemark: 2
title: Corrective diagnostics sampler
author:
  - AzeForge examples
x-circuit-symbol-convention: iec
---

# Corrective diagnostics sampler

Every block below is intentionally invalid under the approved contracts, gathered in one place so an author can see the diagnostic voice across the families. Each block keeps the mandatory `----` separator and declares `number: false` where the directive accepts it, so the only defect is the authored body; the `// Expected:` comment after each block names the code the compiler reports and the remedy that clears it.

## Mathematics

Native notation is a closed vocabulary, so TeX spelling and chained exponents report rather than translate.

A TeX brace is not a registered operator, and the reported range covers the offending character.

:::: equation
id: math-unsupported
number: false
----
x^{2} = 4
::::

// Expected: azeforge.equation#unsupported-notation at the `{`, remedy: write `x^(2)`.

A chained exponent has no registered associativity, so it must be parenthesized explicitly.

:::: equation
id: math-chained-power
number: false
----
x^2^3
::::

// Expected: azeforge.equation#chained-power — remedy: parenthesize as `x^(2^3)`.

## Plots

A function series carries no implicit sampling range, and its expression is evaluated, never interpreted symbolically.

An unbounded function series must name the domain it is sampled over.

:::: plot
id: plot-missing-domain
number: false
----
- kind: function
  label: unbounded
  expression: sin(x)
::::

// Expected: azeforge.plot#missing-domain — function series require an explicit domain.

A binder construct is symbolic-only, so the expression fails at the point the evaluation reaches it.

:::: plot
id: plot-non-evaluable
number: false
----
- kind: function
  expression: sum i=1..10 of i * x
  domain:
    min: 0
    max: 1
::::

// Expected: azeforge.plot#non-evaluable-construct at the binder; binders are symbolic-only.

## Geometry

Declarations resolve in authoring order, and a construction that yields more than one branch must state which branch is meant.

Two circles of radius 1.5 centred two units apart meet twice, so the construction is ambiguous until one branch is picked.

:::: geometry
id: geom-ambiguous
number: false
----
- kind: point
  name: a
  x: 0
  y: 0
- kind: point
  name: b
  x: 2
  y: 0
- kind: circle
  name: c
  center: a
  radius: 1.5
- kind: circle
  name: d
  center: b
  radius: 1.5
- kind: intersection
  name: p
  first: c
  second: d
::::

// Expected: azeforge.geometry#ambiguous-construction — "2 branches; add `pick: 1` or `pick: 2`".

A reference to a name that is declared later in the same block is unresolved, not forward-resolved.

:::: geometry
id: geom-forward-ref
number: false
----
- kind: point
  name: a
  x: 0
  y: 0
- kind: segment
  name: s
  from: a
  to: b
- kind: point
  name: b
  x: 1
  y: 0
::::

// Expected: azeforge.geometry#unresolved-reference at `b` — declare names before referencing them.

## Diagrams

A group is a container that participates in layout only; edges connect nodes.

Routing an edge out of a group is rejected, and the range points at the group endpoint.

:::: diagram
id: diagram-group-endpoint
mode: flowchart
number: false
flow: top-to-bottom
----
- kind: group
  name: g1
- kind: node
  name: a
  parent: g1
- kind: node
  name: b
  parent: g1
- kind: edge
  from: g1
  to: a
::::

// Expected: azeforge.diagram#group-endpoint — groups are containers only.

An undirected edge is a `graph` or `architecture` fact, so the flowchart mode rejects it.

:::: diagram
id: diagram-undirected-flowchart
mode: flowchart
number: false
flow: left-to-right
----
- kind: node
  name: a
- kind: node
  name: b
- kind: edge
  from: a
  to: b
  direction: undirected
::::

// Expected: azeforge.diagram#undirected-not-permitted — undirected edges belong to `graph` or `architecture`.

## Software and data models

The four model directives share the `- kind:` record idiom, and each one resolves its own references before drawing.

A message endpoint must be a declared participant.

:::: sequence
id: seq-unknown-participant
number: false
----
participants:
  - name: user
  - name: web
timeline:
  - kind: message
    from: user
    to: database
    text: fetch user
::::

// Expected: azeforge.sequence#unresolved-reference at `database`.

A scope may declare at most one initial pseudo-state, so the second one is reported against the scope.

:::: state
id: state-multi-initial
number: false
----
- kind: initial
  name: start1
- kind: initial
  name: start2
- kind: state
  name: idle
- kind: transition
  from: start1
  to: idle
- kind: transition
  from: start2
  to: idle
::::

// Expected: azeforge.state#multiple-initials at the top-level scope.

Cardinality is a closed word list, and the display range is not an authoring form.

:::: entity
id: entity-range-cardinality
number: false
----
- kind: entity
  name: Customer
  attributes:
    - name: id
      keys:
        - primary
- kind: entity
  name: Order
  attributes:
    - name: id
      keys:
        - primary
- kind: relationship
  first:
    entity: Customer
    cardinality: one
  second:
    entity: Order
    cardinality: 0..*
::::

// Expected: azeforge.entity#unknown-kind — data: {field: "cardinality", value: "0..*"}, did-you-mean `many`; ranges are display forms, not authoring forms.

An inheritance relationship is ranked, not sized, so it carries no multiplicity.

:::: class
id: class-multiplicity-on-inheritance
number: false
----
- kind: class
  name: Animal
- kind: class
  name: Dog
- kind: relationship
  form: inheritance
  from: Dog
  to: Animal
  from-multiplicity: one
::::

// Expected: azeforge.class#multiplicity-on-ranked-relationship — multiplicity is not allowed on inheritance.

## Circuits

A circuit is coordinate-free, and every terminal of every declared component must be bound to a declared node.

A resistor with a single bound terminal is reported at the component, naming the terminal that is left floating.

:::: circuit
id: circuit-unbound-terminal
number: false
title: Unbound resistor terminal
----
- kind: node
  ref: n1
- kind: resistor
  ref: R1
  value: 1 kohm
- kind: connect
  terminal: R1.a
  node: n1
::::

// Expected: azeforge.circuit#unbound-terminal — terminal `R1.b` is declared but not bound.

A connect naming a terminal the component does not declare is reported at the relation.

:::: circuit
id: circuit-unknown-terminal
number: false
title: Unknown resistor terminal
----
- kind: node
  ref: n1
- kind: node
  ref: n2
- kind: resistor
  ref: R1
  value: 1 kohm
- kind: connect
  terminal: R1.a
  node: n1
- kind: connect
  terminal: R1.b
  node: n2
- kind: connect
  terminal: R1.c
  node: n1
::::

// Expected: azeforge.circuit#unknown-terminal — `R1` declares the terminals `a` and `b` only.

## Timing

One scale governs a timing block: the integer cycle grid takes a waveform string, and the duration axis takes authored intervals.

The cycle scale has no `intervals:` collection, so the field is rejected for the block.

:::: timing
id: timing-wrong-form
number: false
scale: cycles
title: Wrong waveform form for the cycle scale
----
- kind: signal
  ref: addr
  width: 8
  wave: 0011
  intervals:
    - state: bus
      duration: 1
      value: A5
::::

// Expected: azeforge.timing#invalid-field — `intervals:` is only valid with `scale: time`; the cycle scale takes the `wave:` string.

A waveform string is a dense run of registered interval characters, so embedded whitespace is rejected.

:::: timing
id: timing-malformed-wave
number: false
scale: cycles
title: Malformed waveform
----
- kind: signal
  ref: valid
  wave: 0 1
::::

// Expected: azeforge.timing#invalid-wave — wave strings are whitespace-free.

## Chemistry

A structure record states facts about atoms, and an attachment atom contributes a bond point only.

An attachment atom that also carries a charge contradicts itself and is rejected outright.

:::: structure
id: chem-attach-charge
number: false
----
- atom: a1
  attach: "*"
  charge: -1
  at: [0.0, 0.0]
- atom: c1
  element: C
  at: [1.0, 0.0]
- bond:
  from: a1
  to: c1
  order: 1
::::

// Expected: azeforge.chemistry.structure#chem-atom-spec-conflict — attachment atoms reject charge, isotope and wedge facts.

A reaction may assert its own balance, and the assertion is checked against the authored species.

:::: reaction
id: chem-unbalanced-reaction
number: false
balance: check
----
H2 + O2 -> H2O
::::

// Expected: azeforge.chemistry.reaction#chem-balance-atom-mismatch — oxygen totals two on the left and one on the right.

## Control

A summation node derives its arity from its in-edges, so the sign list is a claim about the diagram that must match it.

Three signs against two in-edges is the mismatch the diagnostic reports with both counts.

:::: control
id: control-sign-mismatch
number: false
----
- kind: input
  name: ref
  label: r
- kind: input
  name: fb
  label: y
- kind: sum
  name: err
  signs: [+, -, +]
- kind: edge
  from: ref
  to: err
- kind: edge
  from: fb
  to: err
::::

// Expected: azeforge.control#sign-count-mismatch — data: {signs: 3, inputs: 2}.

A summation node reads its arity from its in-edges, so a junction with none is reported on the junction.

:::: control
id: control-sum-no-inputs
number: false
----
- kind: input
  name: ref
  label: r
- kind: sum
  name: err
  signs: [+, -]
- kind: output
  name: y
  label: y
- kind: edge
  from: ref
  to: y
::::

// Expected: azeforge.control#sum-no-inputs — the sum draws no in-edge.

## Free body

With an explicit `scale:`, a vector is authored by `magnitude:` alone, because the scale already fixes its drawn length.

Authoring both a magnitude and a length leaves the drawn length undefined.

:::: free-body
id: free-body-scale-conflict
number: false
scale: 0.15
----
- kind: point
  name: p
  x: 0
  y: 0
- kind: force
  at: p
  angle: 270
  magnitude: 10
  length: 2
  label: F
::::

// Expected: azeforge.free-body#scale-conflict reason `both` — with `scale:`, use `magnitude:` only.

A vector takes one direction form, so an angle beside a `parallel-to:` reference is a contradiction.

:::: free-body
id: free-body-conflicting-direction
number: false
----
- kind: point
  name: p
  x: 0
  y: 0
- kind: point
  name: q
  x: 1
  y: 1
- kind: line
  name: l
  from: p
  to: q
- kind: force
  at: p
  angle: 0
  parallel-to: l
  length: 1
::::

// Expected: azeforge.free-body#conflicting-fields — author either `angle:` or `parallel-to:`, never both.

## Tables

A typed table declares its columns once, and every row key must be one of those declarations.

A row key that matches no column is reported at the key, with the column list as the related location.

:::: table
id: table-unknown-key
number: false
----
columns:
  - key: trial
    name: Trial
    type: text
  - key: end-temp
    name: End temp
    type: decimal
rows:
  - trial: A1
    curent: 338.4
::::

// Expected: azeforge.table#unknown-column-key at `curent`, with related location on the column declaration.

A typed column constrains every cell under it, so a decimal column rejects a non-numeric spelling.

:::: table
id: table-non-numeric-cell
number: false
----
columns:
  - key: trial
    name: Trial
    type: text
  - key: end-temp
    name: End temp
    type: decimal
rows:
  - trial: A2
    end-temp: warm
::::

// Expected: azeforge.table#non-numeric-value — the `end-temp` cell must be an exact decimal.

## Algorithms

A condition compares, so a bare `=` there is the assignment operator in the wrong position.

The reported range covers the offending `=` and the remedy is equality.

:::: algorithm
id: algorithm-assign-in-condition
number: false
----
procedure: Broken
parameters:
  - x
steps:
  - if: x = 0
    then:
      - return: true
::::

// Expected: azeforge.algorithm#assignment-in-condition — equality in conditions is `==`.

An assignment names a variable or one indexing level, so a doubly indexed target is rejected.

:::: algorithm
id: algorithm-invalid-assign-target
number: false
----
procedure: Broken
parameters:
  - A
steps:
  - assign: A[i][j] = 0
::::

// Expected: azeforge.algorithm#invalid-assign-target — one indexing level is allowed, as in `A[i]`.

## Examples

A worked example is prose end to end, so every step must carry content.

A step whose text is whitespace only is reported at that line rather than dropped from the rendering.

:::: example
id: example-empty-step
number: false
----
problem: A trivial problem.
steps:
  - text: |
      
result: Nothing to report.
::::

// Expected: azeforge.example#empty-step on the whitespace-only step.

An example states the problem it works through, so a step list without one is incomplete.

:::: example
id: example-missing-problem
number: false
----
steps:
  - text: Substitute the boundary condition.
result: The model cools to ambient.
::::

// Expected: azeforge.example#missing-problem — the example requires a `problem:` section.

Every diagnostic in this document is stable-coded, source-ranged and free of silent fallback: the code is part of the tested surface, the range points at the token that caused the report, and a Block that fails publishes nothing instead of a partial figure.
