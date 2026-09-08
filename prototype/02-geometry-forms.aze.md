---
azemark: 2
title: Geometry coordinate-based and constructive forms
author: AzeForge Proto
---

# Geometry forms

This document isolates the two approved geometry representation modes side by side: typed coordinate data and named constructions with backward-only references.

// Coordinate-based form: everything is explicit. Works for instructional sketches where the author wants exact placement.

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

// Constructive form: constructions carry intent. The compiler resolves coordinates; the author declares what the objects mean.

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
