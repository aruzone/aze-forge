---
azemark: 2
title: Engineering diagram scenarios
author: AzeForge Proto
---

# Engineering diagram scenarios

This document exercises the Engineering diagrams family against the resolved contract ([issue #65](https://github.com/aruzone/aze-forge/issues/65#issuecomment-5584266572)). The family is two directives registered under `azemark: 2`: `control` signal-flow graphs and `free-body` diagrams. They share no objects, validation or renderer, so they are separate Plugins with separate Block-local namespaces — a `control` Block declares SISO blocks, summing junctions and directional boundary stubs wired by anonymous signal edges, and a `free-body` Block declares bodies, anchored vectors and display marks in one y-up unitless frame. Neither directive checks topology plausibility or physics: the compiler renders the structure and the claims the author wrote.

// Feedback controller (contract §13, scenario A). The takeoff is the two `plant`
// out-edges rendered as a dot; `[+, -]` pairs positionally with `ref -> err`
// then `plant -> err` in authored edge order. Zero warnings.

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

// A second control Block: a self-loop is legal and renders as a loopback, and
// the `y` output stub that no edge reaches warns `unconnected-port` — a
// floating port is a warning, never an error, and the Block still publishes.

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

// Inclined-plane free body (contract §13, scenario B). With `scale:` every force
// authors `magnitude:` and its length is derived; the invisible wedge corners are
// named anchors; the slope-face line is invisible by default; `N` and `f` use the
// relative ray rule with no author-computed angles.

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

// A schematic free body: no `scale:`, so every force authors `length:` and the
// arrow carries no quantity claim. A moment is exempt from scale and always
// schematic; an explicit canvas overrides auto-fit, the beam-axis segment is
// visible by opt-in, and two `axes` records prove the multi-axes allowance.

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
