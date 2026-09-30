---
azemark: 2
title: Geometry theorem and rendering showcase
theme: default
---

# Geometry theorem and rendering showcase

Six geometry Blocks exercise figure-relative annotation metrics, collision-free
label placement, frame-clipped construction lines, and oriented marks. The
first four are mathematical constructions. The final pair draws the same
triangle at two frame scales to show which measurements follow the figure and
which follow the canvas.

## Thales theorem

An angle inscribed in a semicircle is a right angle. The right-angle mark opens
into the angle it names, and no label touches the circle or either chord.

:::: geometry
id: thales-circle
number: true
----
- kind: point
  name: o
  label: O
  x: 0
  y: 0
- kind: point
  name: a
  label: A
  x: -2
  y: 0
- kind: point
  name: b
  label: B
  x: 2
  y: 0
- kind: point
  name: c
  label: C
  x: 0
  y: 2
- kind: circle
  name: circumcircle
  center: o
  radius: 2
- kind: segment
  name: diameter
  from: a
  to: b
- kind: segment
  name: chord-ac
  from: a
  to: c
- kind: segment
  name: chord-bc
  from: b
  to: c
- kind: right-angle-mark
  first: a
  second: c
  third: b
::::

## Tangents from an external point

Two tangents leave one external point and touch the circle on separate
branches. The explicit `pick:` values preserve that branch choice. A radius to
a point of tangency meets the tangent at a right angle.

:::: geometry
id: tangent-pair
number: true
----
- kind: point
  name: center
  label: O
  x: 0
  y: 0
- kind: circle
  name: wheel
  center: center
  radius: 2
- kind: point
  name: touch
  label: T
  x: 0
  y: 2
- kind: tangent-line
  name: top-tangent
  circle: wheel
  at: touch
- kind: point
  name: outside
  label: P
  x: 7
  y: 2
- kind: tangent-line
  name: upper-tangent
  circle: wheel
  from: outside
  pick: 2
- kind: tangent-line
  name: lower-tangent
  circle: wheel
  from: outside
  pick: 1
- kind: segment
  name: radius-touch
  from: center
  to: touch
- kind: right-angle-mark
  first: center
  second: touch
  third: outside
::::

## Isosceles triangle marks and measurements

Equal-length ticks identify the two legs. The angle and length marks ask the
evaluator to compute their labels instead of repeating authored values.

:::: geometry
id: marked-triangle
number: true
----
- kind: point
  name: apex
  label: A
  x: 0
  y: 4
- kind: point
  name: left
  label: B
  x: -3
  y: 0
- kind: point
  name: right
  label: C
  x: 3
  y: 0
- kind: segment
  name: side-ab
  from: apex
  to: left
- kind: segment
  name: side-ac
  from: apex
  to: right
- kind: segment
  name: base-bc
  from: left
  to: right
- kind: equal-marks
  group: legs
  segments:
    - side-ab
    - side-ac
- kind: angle-mark
  first: left
  second: apex
  third: right
  measure: angle
- kind: length-mark
  segment: base-bc
  measure: length
::::

## Arc, ray, and sector

The sampled arc participates in label collision checks. The ray starts at its
origin, passes through the named contact point, and stops at the frame edge.

:::: geometry
id: sector-wedge
number: true
----
- kind: point
  name: origin
  label: O
  x: 0
  y: 0
- kind: point
  name: east
  label: E
  x: 6
  y: 0
- kind: point
  name: north-east
  label: N
  x: 4.2426
  y: 4.2426
- kind: point
  name: contact
  label: T
  x: 3.5
  y: 3.5
- kind: segment
  name: lower-arm
  from: origin
  to: east
- kind: segment
  name: upper-arm
  from: origin
  to: north-east
- kind: arc
  name: rim
  center: origin
  radius: 6
  start-angle: 0
  end-angle: 45
  direction: ccw
- kind: ray
  name: probe
  origin: origin
  through: contact
- kind: angle-mark
  first: east
  second: origin
  third: north-east
  measure: angle
::::

## Figure-relative annotations

The next two Blocks contain the same triangle. The first fills its inferred
frame. The second places it inside a `bounds:` window four times wider. Letter
height and line weight follow the drawn triangle rather than inflating to fill
the larger canvas. The readable floor still prevents tiny text.

### Frame-filled triangle

:::: geometry
id: frame-filled
number: true
----
- kind: point
  name: p
  label: P
  x: 0
  y: 0
- kind: point
  name: q
  label: Q
  x: 8
  y: 0
- kind: point
  name: r
  label: R
  x: 0
  y: 8
- kind: segment
  name: pq
  from: p
  to: q
- kind: segment
  name: pr
  from: p
  to: r
- kind: segment
  name: qr
  from: q
  to: r
- kind: right-angle-mark
  first: q
  second: p
  third: r
::::

### Sparse-frame triangle

:::: geometry
id: frame-sparse
number: true
bounds:
  min-x: -16
  min-y: -16
  max-x: 16
  max-y: 16
----
- kind: point
  name: p
  label: P
  x: 0
  y: 0
- kind: point
  name: q
  label: Q
  x: 8
  y: 0
- kind: point
  name: r
  label: R
  x: 0
  y: 8
- kind: segment
  name: pq
  from: p
  to: q
- kind: segment
  name: pr
  from: p
  to: r
- kind: segment
  name: qr
  from: q
  to: r
- kind: polygon
  name: body
  vertices:
    - p
    - q
    - r
::::
