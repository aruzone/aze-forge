---
azemark: 2
title: Corrective diagnostics sampler
author: AzeForge Proto
---

# Corrective diagnostics sampler

Each block below is intentionally invalid under the approved contracts. They are gathered in one place so an author can see the diagnostic voice across families. Every diagnostic is expected to be stable-coded, source-ranged, and free of silent fallback.

// MATHEMATICS — unsupported notation (TeX braces) and chained power.

:::: equation
id: math-unsupported
number: false
----
x^{2} + y^{2} = r^{2}
::::
// Expected: azeforge.equation#unsupported-notation at each `{`, remedy: write `x^(2)`.

:::: equation
id: math-chained-power
number: false
----
x^2^3
::::
// Expected: azeforge.equation#chained-power, remedy: parenthesize as `x^(2^3)`.

// PLOTS — function series missing domain and a non-evaluable construct.

:::: plot
id: plot-missing-domain
number: false
----
- kind: function
  label: unbounded
  expression: sin(x)
::::
// Expected: azeforge.plot#missing-domain — function series require an explicit domain.

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

// GEOMETRY — ambiguous construction missing pick, and forward reference.

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
  radius: 1
- kind: circle
  name: d
  center: b
  radius: 1
- kind: intersection
  name: p
  first: c
  second: d
::::
// Expected: azeforge.geometry#ambiguous-construction — "2 branches; add `pick: 1` or `pick: 2`".

:::: geometry
id: geom-forward-ref
number: false
----
- kind: segment
  name: s
  from: p
  to: q
- kind: point
  name: p
  x: 0
  y: 0
- kind: point
  name: q
  x: 1
  y: 0
::::
// Expected: azeforge.geometry#unresolved-reference at `p` — declare names before referencing them.

// DIAGRAM — group used as edge endpoint.

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

// SEQUENCE — message to an undeclared participant.

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

// STATE — multiple initial pseudo-states in the top-level scope.

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

// ENTITY — an authored UML range instead of the registered cardinality word.

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

// CLASS — multiplicity on an inheritance relationship.

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

// CIRCUIT — terminal left unbound.

:::: circuit
id: circuit-unbound-terminal
number: false
title: Unbound resistor terminal
----
- kind: node
  ref: N1
- kind: resistor
  name: R1
  value: 1 kohm
- kind: connect
  terminal: R1.a
  node: N1
::::
// Expected: existing Circuit diagnostic — terminal `R1.b` is declared but not bound.

// TIMING — bus interval on the cycles scale written as a word instead of a character.

:::: timing
id: timing-wrong-form
number: false
scale: cycles
title: Wrong waveform form for cycles scale
----
- kind: signal
  name: data
  intervals:
    - state: bus
      duration: 2
      value: A5
::::
// Expected: azeforge.timing error — cycles scale requires the `wave:` string form, not `intervals:`.

// CHEMISTRY — attachment atom carrying charge.

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
// Expected: azeforge.structure#chem-atom-spec-conflict — attachment atoms reject charge, isotope and wedge facts.

// CONTROL — sign list length does not match in-edge count.

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
// Expected: azeforge.control#sign-count-mismatch, data: {signs: 3, inputs: 2}.

// FREE-BODY — both magnitude and length present when scale is set.

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

// TABLE — unknown column key in a row.

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

// ALGORITHM — assignment operator used in a condition.

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

// EXAMPLE — empty step text.

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
