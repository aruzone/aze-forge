---
azemark: 2
title: Geometry primitives, constructions, and marks
author:
  - AzeForge examples
---

# Geometry

Every figure here is a `geometry` Block: an ordered list of `- kind:`
declarations that the compiler resolves once, in authored order, into an SVG
projection. Coordinates are authored, constructions are derived, marks
annotate what has been resolved, and a reference that points forward or at
nothing is a diagnostic rather than a guess. The three sections move from
single primitives through named constructions to the marks that measure them.

## Primitives

Primitives either carry authored coordinates or name a declaration that
already exists above them in the same Block.

The wedge below is the smallest complete figure: three authored points, two
segments forming the arms, and a polygon that closes them.

:::: geometry
id: optics-wedge
number: true
----
- kind: point
  name: vertex
  label: O
  x: 0
  y: 0
- kind: point
  name: arm-flat
  label: A
  x: 4
  y: 0
- kind: point
  name: arm-raised
  label: B
  x: 1.5
  y: 3.5
- kind: segment
  name: flat-arm
  from: vertex
  to: arm-flat
- kind: segment
  name: raised-arm
  from: vertex
  to: arm-raised
- kind: polygon
  name: wedge
  vertices:
    - vertex
    - arm-flat
    - arm-raised
::::

A tracking station reaches the rest of the primitive set: a ray for the beam,
a circle drawn through a beacon point instead of a radius, and a directed arc
for the sweep.

:::: geometry
id: radar-sweep
number: true
----
- kind: point
  name: station
  label: S
  x: 0
  y: 0
- kind: point
  name: beacon
  label: B
  x: 4
  y: 0
- kind: circle
  name: range-ring
  center: station
  point: beacon
- kind: point
  name: contact
  label: T
  x: 2.2943
  y: 3.2766
- kind: ray
  name: probe-beam
  origin: station
  through: contact
- kind: arc
  name: sweep
  center: station
  radius: 4
  start-angle: 0
  end-angle: 60
  direction: ccw
::::

The coordinate-based form writes every vertex as a literal pair, including the
altitude foot, which suits instructional sketches where exact placement is the
point and nothing should be inferred.

:::: geometry
id: coordinate-triangle
number: true
caption: Coordinate-based triangle with explicit altitude marks
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
- kind: point
  name: foot
  label: D
  x: 0
  y: 0
- kind: segment
  name: ab
  from: a
  to: b
- kind: segment
  name: ac
  from: a
  to: c
- kind: segment
  name: bc
  from: b
  to: c
- kind: segment
  name: altitude
  from: a
  to: foot
  style: dashed
- kind: right-angle-mark
  first: a
  second: foot
  third: c
- kind: length-mark
  segment: bc
  measure: length
- kind: length-mark
  from: a
  to: foot
  label: h
::::

## Constructions

A construction states the intent and lets the evaluator derive the
coordinates, so an author never restates a computed position; references
resolve backward through the declarations already authored.

A midpoint needs only the two endpoints it halves, and the perpendicular-line
beside it takes that derived point together with the segment it must square up
to.

:::: geometry
id: rail-junction
number: true
----
- kind: point
  name: rail-west
  label: W
  x: -6
  y: 0
- kind: point
  name: rail-east
  label: E
  x: 6
  y: 0
- kind: segment
  name: rail
  from: rail-west
  to: rail-east
- kind: midpoint
  name: rail-center
  label: M
  from: rail-west
  to: rail-east
- kind: perpendicular-line
  name: passing-loop
  through: rail-center
  to: rail
::::

Two circles cut each other in two places, so an intersection states which
branch it means with `pick:`, and leaving that out is an error rather than an
implicit first branch.

:::: geometry
id: survey-fix
number: true
bounds:
  min-x: -8
  min-y: -8
  max-x: 8
  max-y: 8
----
- kind: point
  name: mast-north
  label: N
  x: -2
  y: 0
- kind: point
  name: mast-south
  label: S
  x: 2
  y: 0
- kind: circle
  name: north-range
  center: mast-north
  radius: 5
- kind: circle
  name: south-range
  center: mast-south
  radius: 5
- kind: intersection
  name: fix
  label: F
  first: north-range
  second: south-range
  pick: 2
- kind: segment
  name: northern-bearing
  from: mast-north
  to: fix
- kind: segment
  name: southern-bearing
  from: mast-south
  to: fix
::::

Both tangent forms appear in one figure, and read beside the coordinate
triangle above it is the constructive twin of the same figure: the `at:` form
touches a named point already on the circle, while the `from:` form draws from
an exterior point and picks between its two branches.

:::: geometry
id: constructed-tangent
number: true
caption: Constructed circle tangent using backward-only references
----
- kind: point
  name: center
  label: O
  x: 0
  y: 0
- kind: circle
  name: main-circle
  center: center
  radius: 2
- kind: point
  name: touch
  label: T
  x: 0
  y: 2
- kind: tangent-line
  name: top-tangent
  circle: main-circle
  at: touch
- kind: point
  name: outside
  label: P
  x: 5
  y: 0
- kind: tangent-line
  name: upper-tangent
  circle: main-circle
  from: outside
  pick: 2
::::

## Marks and measurements

A mark never moves the geometry it annotates; it either carries an authored
label or asks the evaluator to measure, and it may not do both.

A right-angle-mark names the vertex between two arms, and a length-mark with
`measure: length` prints the computed span instead of an authored label.

:::: geometry
id: brace-jig
number: true
----
- kind: point
  name: corner
  label: C
  x: 0
  y: 0
- kind: point
  name: run-end
  label: R
  x: 4
  y: 0
- kind: point
  name: rise-end
  label: U
  x: 0
  y: 3
- kind: segment
  name: run
  from: corner
  to: run-end
- kind: segment
  name: rise
  from: corner
  to: rise-end
- kind: segment
  name: brace
  from: run-end
  to: rise-end
- kind: right-angle-mark
  first: rise-end
  second: corner
  third: run-end
- kind: length-mark
  segment: brace
  measure: length
::::

Equal-marks annotate a whole group of segments in one declaration, while an
angle-mark with `measure: angle` reports the angle whose vertex is the point
named second.

:::: geometry
id: roof-truss
number: true
----
- kind: point
  name: ridge
  label: R
  x: 0
  y: 3
- kind: point
  name: eave-left
  label: L
  x: -4
  y: 0
- kind: point
  name: eave-right
  label: E
  x: 4
  y: 0
- kind: segment
  name: rafter-left
  from: ridge
  to: eave-left
- kind: segment
  name: rafter-right
  from: ridge
  to: eave-right
- kind: segment
  name: tie-beam
  from: eave-left
  to: eave-right
- kind: equal-marks
  group: rafters
  segments:
    - rafter-left
    - rafter-right
- kind: angle-mark
  first: ridge
  second: eave-left
  third: eave-right
  measure: angle
::::

The closing figure mixes all three: an invisible base line exists only so the
perpendicular-foot can drop onto it, and the dashed altitude is the auxiliary
the reader actually sees.

:::: geometry
id: isosceles-altitude
number: true
----
- kind: point
  name: base-left
  label: B
  x: -3
  y: 0
- kind: point
  name: base-right
  label: C
  x: 3
  y: 0
- kind: point
  name: apex
  label: A
  x: 0
  y: 4
- kind: line
  name: base-line
  through-first: base-left
  through-second: base-right
  visible: false
- kind: segment
  name: left-side
  from: apex
  to: base-left
- kind: segment
  name: right-side
  from: apex
  to: base-right
- kind: segment
  name: base
  from: base-left
  to: base-right
- kind: perpendicular-foot
  name: foot
  label: D
  from: apex
  to: base-line
- kind: segment
  name: altitude
  from: apex
  to: foot
  style: dashed
- kind: equal-marks
  group: legs
  segments:
    - left-side
    - right-side
- kind: right-angle-mark
  first: apex
  second: foot
  third: base-right
- kind: length-mark
  segment: base
  measure: length
- kind: length-mark
  from: apex
  to: foot
  label: h
::::
