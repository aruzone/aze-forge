---
azemark: 2
title: Engineering diagrams
author:
  - AzeForge examples
---

# Engineering diagrams

`control` draws signal-flow graphs and `free-body` draws force diagrams. They are
independent Plugins with separate Block-local namespaces: a `control` Block wires
single-input single-output blocks, summing junctions and boundary stubs with
anonymous signal edges, while a `free-body` Block places bodies, anchored vectors
and display marks in one y-up unitless frame. Neither directive judges topology
or physics — the compiler renders the structure and the quantities the author
wrote.

## Control

`control` authors one flat, ordered declaration list of blocks, summing
junctions, directional boundary stubs and edges. Every reference resolves in two
passes, so a forward reference is legal and an undeclared name is never guessed.

The smallest useful graph is an open loop: one input stub, one lag and one output stub, each joined by an edge.

:::: control
id: open-loop-heater
number: true
title: Open-loop heater
description: A single lag between the command and the measured outlet
flow: left-to-right
----
- kind: input
  name: cmd
  label: u(s)
- kind: block
  name: coil
  tf: 1/(1 + 3s)
- kind: output
  name: temp
  label: T(s)
- kind: edge
  from: cmd
  to: coil
  label: u(s)
- kind: edge
  from: coil
  to: temp
  label: T(s)
::::

Closing the loop adds a summing junction whose signs pair positionally with its in-edges in authored order, and the takeoff from the plant renders as a dot rather than a named node.

:::: control
id: pitch-loop
number: true
title: Pitch loop
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
  label: Θ_c(s)
- kind: edge
  from: err
  to: ctrl
  label: e(s)
- kind: edge
  from: ctrl
  to: plant
  label: u(s)
- kind: edge
  from: plant
  to: out
  label: Θ(s)
- kind: edge
  from: plant
  to: err
  label: Θ(s)
::::

A block may feed itself, and a stub that no edge reaches is reported as a warning instead of an error, so the Block still publishes.

:::: control
id: floating-trim
number: true
title: Trim with a floating block
flow: top-to-bottom
----
- kind: input
  name: cmd
  label: u_c
- kind: block
  name: trim
  tf: 1/(1 + T s)
  label: trim
- kind: output
  name: y
  label: y
- kind: edge
  from: cmd
  to: trim
  label: u_c
- kind: edge
  from: trim
  to: trim
  label: trim loop
::::

## Free body

`free-body` authors bodies and records in one y-up unitless frame. Bodies are
`block`, `circle`, `polygon` and `particle`; records are `point`, `line`,
`force`, `moment`, `axes`, `angle-mark` and `dimension`. `name:` lives only on
referenceables, so vectors and marks stay anonymous.

Without `scale:` every force authors a schematic `length:` and makes no quantity claim, so the arrows carry direction alone.

:::: free-body
id: trolley-push
number: true
title: Trolley push, schematic
description: Two forces on a trolley drawn to no shared scale
----
- kind: block
  name: trolley
  x: 0
  y: 0
  width: 2
  height: 1
- kind: point
  name: hub
  label: C
  x: 0
  y: 0
- kind: point
  name: rail
  x: -3
  y: -1
  visible: false
- kind: point
  name: rail-end
  x: 3
  y: -1
  visible: false
- kind: line
  name: rail-line
  visible: true
  style: dashed
  from: rail
  to: rail-end
- kind: force
  at: hub
  angle: 0
  length: 1.5
  label: F
- kind: force
  at: hub
  parallel-to: rail-line
  length: 1
  label: f
- kind: force
  at: hub
  angle: 270
  length: 1.2
  label: W
- kind: angle-mark
  first: rail
  vertex: hub
  third: rail-end
  label: φ
::::

`scale:` switches the frame to force units, so every force then authors `magnitude:` and its length is derived, and a force may take its ray from a named line instead of an angle.

:::: free-body
id: incline-block
number: true
title: Block on an inclined plane
scale: 0.15
----
- kind: point
  name: toe
  x: 0
  y: 0
  visible: false
- kind: point
  name: heel
  x: 6
  y: 0
  visible: false
- kind: point
  name: top
  x: 6
  y: 2.18
  visible: false
- kind: polygon
  name: wedge
  vertices:
    - toe
    - heel
    - top
- kind: block
  name: slider
  x: 2.83
  y: 1.56
  width: 1.6
  height: 1
  angle: 20
- kind: point
  name: com
  label: G
  x: 2.83
  y: 1.56
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
  at: com
  angle: 270
  magnitude: 19.6
  label: mg
- kind: force
  at: contact
  perpendicular-to: slope-face
  magnitude: 18.4
  label: N
- kind: force
  at: contact
  parallel-to: slope-face
  magnitude: 6.7
  label: f
- kind: axes
  at: com
  angle: 20
  x-label: x′
  y-label: y′
- kind: angle-mark
  first: heel
  vertex: toe
  third: top
  label: θ
- kind: dimension
  from: (2.08, 1.29)
  to: (3.58, 1.83)
  label: L
::::

A moment is exempt from scale and always schematic, `line` records stay invisible unless opted in, and an explicit canvas with `bounds:` overrides auto-fit.

:::: free-body
id: cantilever-end
number: true
title: Cantilever end, schematic
width: 480
height: 320
bounds:
  min-x: -1
  min-y: -2
  max-x: 5
  max-y: 3
----
- kind: block
  name: beam
  x: 2
  y: 0
  width: 4
  height: 0.4
- kind: point
  name: tip
  label: T
  x: 4
  y: 0.2
- kind: point
  name: pivot
  x: 0
  y: 0
- kind: point
  name: stub
  label: S
  x: 0
  y: 2
- kind: line
  name: beam-axis
  visible: true
  style: dashed
  from: pivot
  to: tip
- kind: force
  at: tip
  perpendicular-to: beam-axis
  length: 1.4
  label: P
- kind: moment
  at: tip
  direction: ccw
  label: M
- kind: axes
  at: pivot
  x-label: x
  y-label: y
- kind: axes
  at: tip
  angle: 90
  x-label: n
  y-label: t
- kind: angle-mark
  first: tip
  vertex: pivot
  third: stub
  label: φ
::::
