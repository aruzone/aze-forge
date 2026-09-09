---
azemark: 2
title: AzeMark alpha happy-path sampler
author: AzeForge Proto
---

# Happy-path sampler

This document carries one readable example from each approved native family. It is meant to test whether the forms feel consistent and compact at a glance.

// Mathematics: a numbered derivation and a piecewise equation.

:::: derivation
id: geometric-series
number: true
----
- expression: S_n = sum i=0..n of r^i
  annotation: partial sum of the first n + 1 powers
- expression: r * S_n = sum i=1..n+1 of r^i
  annotation: multiply every term by r
- expression: S_n - r * S_n = 1 - r^(n+1)
  annotation: subtraction telescopes the interior terms
- expression: S_n = (1 - r^(n+1)) / (1 - r)
  annotation: closed form, valid for r != 1
::::

:::: equation
id: rc-step
number: true
----
v(t) = cases(0 when t < 0; V0 * (1 - exp(-(t / (R * C)))) when t >= 0)
::::

// Plots: analytic curve plus measured points with uncertainties.

:::: plot
id: rc-step-response
number: true
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
----
- kind: function
  label: analytic step response
  variable: t
  expression: V0 * (1 - exp(-t / (R * C)))
  domain:
    min: 0
    max: 0.005
  samples: 400
- kind: scatter
  label: measured points
  points:
    - x: 0.0005
      y: 1.99
      error: 0.08
    - x: 0.001
      y: 3.11
      error: 0.10
    - x: 0.002
      y: 4.36
      error-low: 0.14
      error-high: 0.09
    - x: 0.003
      y: 4.71
      error: 0.12
::::

// Geometry: isosceles triangle altitude using coordinates and constructions.

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

// General diagram: a small flowchart.

:::: diagram
id: auth-flow
mode: flowchart
number: true
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
  shape: rectangle
- kind: node
  name: login
  label: Show login
  shape: rectangle
- kind: edge
  from: start
  to: check-token
- kind: edge
  from: check-token
  to: home
  label: yes
- kind: edge
  from: check-token
  to: login
  label: no
::::

// Software / data models: login sequence.

:::: sequence
id: login-sequence
number: true
----
participants:
  - name: user
    kind: actor
  - name: web
  - name: api
  - name: db
timeline:
  - kind: message
    from: user
    to: web
    text: submit credentials
  - kind: message
    from: web
    to: api
    text: authenticate
    activate: true
  - kind: message
    from: api
    to: db
    text: fetch user
  - kind: message
    form: return
    from: db
    to: api
    text: user record
  - kind: message
    form: return
    from: api
    to: web
    text: token
    deactivate: true
  - kind: message
    from: web
    to: user
    text: redirect home
::::

// Circuit: clocked-logic acceptance circuit.

:::: circuit
id: clocked-logic
number: true
title: Clocked logic acceptance circuit
----
- kind: node
  ref: DIN
- kind: node
  ref: EN
- kind: node
  ref: CLK
- kind: node
  ref: U1-OUT
- kind: node
  ref: FF1-Q
- kind: node
  ref: FF2-Q
- kind: node
  ref: D2
- kind: node
  ref: D3
- kind: node
  ref: S0
- kind: node
  ref: SEL
- kind: digital-input
  name: DIN
- kind: digital-input
  name: EN
- kind: digital-input
  name: CLK
- kind: digital-input
  name: D2
- kind: digital-input
  name: D3
- kind: digital-input
  name: S0
- kind: digital-output
  name: SEL
- kind: and
  name: U1
  inputs: 2
- kind: d-flip-flop
  name: FF1
- kind: d-flip-flop
  name: FF2
- kind: mux-4to1
  name: M1
- kind: connect
  terminal: DIN.out
  node: DIN
- kind: connect
  terminal: EN.out
  node: EN
- kind: connect
  terminal: U1.in1
  node: DIN
- kind: connect
  terminal: U1.in2
  node: EN
- kind: connect
  terminal: U1.out
  node: U1-OUT
- kind: connect
  terminal: FF1.d
  node: U1-OUT
- kind: connect
  terminal: FF1.clk
  node: CLK
- kind: connect
  terminal: FF1.q
  node: FF1-Q
- kind: connect
  terminal: FF2.d
  node: FF1-Q
- kind: connect
  terminal: FF2.clk
  node: CLK
- kind: connect
  terminal: FF2.q
  node: FF2-Q
- kind: connect
  terminal: M1.d0
  node: FF1-Q
- kind: connect
  terminal: M1.d1
  node: FF2-Q
- kind: connect
  terminal: M1.d2
  node: D2
- kind: connect
  terminal: M1.d3
  node: D3
- kind: connect
  terminal: M1.s0
  node: S0
- kind: connect
  terminal: M1.s1
  node: S0
- kind: connect
  terminal: M1.out
  node: SEL
- kind: connect
  terminal: SEL.in
  node: SEL
- kind: connect
  terminal: CLK.out
  node: CLK
- kind: connect
  terminal: D2.out
  node: D2
- kind: connect
  terminal: D3.out
  node: D3
- kind: connect
  terminal: S0.out
  node: S0
::::

// Digital timing: clocked bus transaction.

:::: timing
id: bus-transaction
number: true
title: Clocked bus transaction
----
- kind: signal
  name: clk
  wave: 10n10n10n10
- kind: signal
  name: valid
  wave: 0..1..0...
- kind: signal
  name: ready
  wave: 0...1..0.
- kind: signal
  name: addr
  wave: x==={A5}={A6}=x....
  width: 8
- kind: signal
  name: data
  wave: x===={D0}xz....
  width: 8
- kind: group
  label: payload
  signals:
    - addr
    - data
- kind: marker
  at: 0
  label: reset
- kind: arrow
  from: addr@4
  to: valid@5
  label: t_su
::::

// Chemistry: precipitation reaction and a labeled structure.

:::: reaction
id: silver-chloride
number: true
caption: Precipitation of silver chloride
balance: check
----
Ag+(aq) + Cl-(aq) -> AgCl(s)
::::

:::: structure
id: alanine-14c
number: true
caption: (S)-Alanine with 14C at the carboxyl carbon
----
- atom: c2
  element: C
  at: [0.0, 0.0]
- atom: n1
  element: N
  at: [0.0, 1.4]
- atom: c1
  element: C
  at: [-1.2, -0.7]
- atom: c3
  element: C
  isotope: 14
  at: [1.2, -0.7]
- atom: o1
  element: O
  at: [2.4, 0.0]
- atom: o2
  element: O
  at: [1.2, -2.1]
- atom: h1
  element: H
  at: [2.4, -2.8]
- atom: h2
  element: H
  at: [-1.2, 1.4]
- bond:
  from: c2
  to: n1
  order: 1
  stereo: wedge
- bond:
  from: c2
  to: c1
  order: 1
- bond:
  from: c2
  to: h2
  order: 1
- bond:
  from: c2
  to: c3
  order: 1
- bond:
  from: c3
  to: o1
  order: 2
- bond:
  from: c3
  to: o2
  order: 1
- bond:
  from: o2
  to: h1
  order: 1
- label:
  text: (S)
  at: [-0.5, 0.7]
::::

// Engineering control: simple feedback loop.

:::: control
id: pitch-loop
number: true
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

// Engineering free-body: block on an inclined plane.

:::: free-body
id: incline-block
number: true
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
::::

// Composition: a typed measurement table.

:::: table
id: cooling-measurements
number: true
caption: Cooling trials, ambient held at 22 C
----
columns:
  - key: trial
    name: Trial
    type: text
  - key: start-temp
    name: Start temp
    type: quantity
    unit: K
  - key: end-temp
    name: End temp
    type: quantity
    unit: K
  - key: interval
    name: Interval
    type: quantity
    unit: s
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
    end-temp: 338.4
    interval: 300
    note: lid on
  - trial: A2
    start-temp: 344.5
    interval: 300
    note: lid off; **probe drifted late in run**
::::
