---
azemark: 2
title: Engineering notation sampler
author:
  - AzeForge acceptance
---

# Engineering notation sampler

Substantive prose on engineering notation with *emphasis*, **strong** text,
and `inline code`. Keep one retained [safe reference](https://example.com/engineering-notation)
for link proof.

Measurement notes:

- inspect the setup before recording
- correct unsafe conditions immediately

## Equations

:::: equation
id: gaussian-integral
number: true
----
integral x=-infinity..infinity of exp(-x^2) dx = sqrt(pi)
::::

:::: equation
id: arithmetic-series
----
sum i=1..n of i = n (n + 1) / 2
::::

:::: equation
id: heat-equation
----
partial T / partial t = alpha partial^2 T / partial x^2
::::

:::: derivation
id: geometric-series-sum
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
- expression: limit n->infinity of S_n = 1 / (1 - r)
  annotation: converges when abs(r) < 1
::::

## Response data

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

:::: chart
id: bench-scores
type: grouped-bar
x-label: suite
y-label: score
----
- label: alpha
  bars:
    - category: parse
      value: 12
      error: 0.5
    - category: render
      value: 19
- label: beta
  bars:
    - category: parse
      value: 9
    - category: render
      value: 22
      error-low: 1
      error-high: 2
::::

## Materials

:::: table
caption: Representative material properties for thermal design
id: materials
----
columns:
  - key: material
    name: Material
    type: text
  - key: density
    name: Density [kg/m^3]
    type: quantity
    unit: kg/m^3
  - key: conductivity
    name: Thermal conductivity [W/(m K)]
    type: quantity
    unit: W/(m K)
rows:
  - material: Aluminum
    density: 2700
    conductivity: 205
  - material: Steel
    density: 7850
    conductivity: 50
  - material: Glass
    density: 2500
    conductivity: 1.0
::::

## Safety flow

:::: mermaid
id: safety-flow
title: Measurement safety flow
description: Inspect the setup, correct when unsafe, record, finish
----
flowchart LR
  start[Start] --> inspect[Inspect setup]
  inspect --> safe{Safe?}
  safe -- No --> correct[Correct setup]
  correct --> inspect
  safe -- Yes --> record[Record measurement]
  record --> finish[Finish]
::::

## Timing

The clocked bus transaction exercises native digital timing on both surfaces of
the one shared scale: `clk` carries edge-state runs, `valid` and `ready` are
single-bit handshakes, `addr` presents two bus values after an unknown start,
and `data` shows a bus value with an unknown turnaround and a high-impedance
window. The second figure authors the same transaction with explicit `ns`
durations, so scale independence is visible in one rendered document.

:::: timing
id: clocked-bus-transaction
number: true
title: Clocked bus transaction
description: single handshake
scale: cycles
----
- kind: signal
  ref: clk
  clock: true
  wave: 2p2n2p2n
- kind: signal
  ref: valid
  wave: 00000111
- kind: signal
  ref: ready
  wave: 00000011
- kind: signal
  ref: addr
  width: 8
  wave: x={A5}={A6}.
- kind: signal
  ref: data
  width: 8
  phase: 1
  wave: ={D0}xz.
- kind: group
  label: Transaction
  signals: addr, data
- kind: marker
  at: 0
  label: Reset
- kind: arrow
  from: addr@4
  to: valid@5
  label: t_{su}
::::

:::: timing
id: clocked-bus-transaction-time-scale
number: true
title: Clocked bus transaction time scale
description: single handshake
scale: time
unit: ns
----
- kind: signal
  ref: clk
  clock: true
  intervals:
    - state: rise
      duration: 2
    - state: fall
      duration: 2
    - state: rise
      duration: 2
    - state: fall
      duration: 2
- kind: signal
  ref: valid
  intervals:
    - state: low
      duration: 1
    - state: low
      duration: 1
    - state: low
      duration: 1
    - state: low
      duration: 1
    - state: low
      duration: 1
    - state: high
      duration: 1
    - state: high
      duration: 1
    - state: high
      duration: 1
- kind: signal
  ref: ready
  intervals:
    - state: low
      duration: 1
    - state: low
      duration: 1
    - state: low
      duration: 1
    - state: low
      duration: 1
    - state: low
      duration: 1
    - state: low
      duration: 1
    - state: high
      duration: 1
    - state: high
      duration: 1
- kind: signal
  ref: addr
  width: 8
  intervals:
    - state: unknown
      duration: 1
    - state: bus
      duration: 1
      value: A5
    - state: bus
      duration: 1
      value: A6
    - state: continue
      duration: 1
- kind: signal
  ref: data
  width: 8
  phase: 1
  intervals:
    - state: bus
      duration: 1
      value: D0
    - state: unknown
      duration: 1
    - state: impedance
      duration: 1
    - state: continue
      duration: 1
- kind: group
  label: Transaction
  signals: addr, data
- kind: marker
  at: 0
  label: Reset
- kind: arrow
  from: addr@4
  to: valid@5
  label: t_{su}
::::
