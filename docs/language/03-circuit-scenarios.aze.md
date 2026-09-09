---
azemark: 2
title: Circuit floating and disconnected scenarios
author: AzeForge Proto
---

# Circuit scenarios

This document exercises the R1 correction: floating Circuits are valid; unused nodes and disconnected component-bearing subgraphs warn but do not error.

// Floating Circuit (R1): a valid circuit with unused declared nodes and no ground. The acceptance scenario from the Circuit contract.

:::: circuit
id: floating-clock-circuit
number: true
title: Floating clocked logic circuit
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
  ref: S1
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
- kind: digital-input
  name: S1
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
// bindings
- kind: connect
  terminal: DIN.out
  node: DIN
- kind: connect
  terminal: EN.out
  node: EN
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
- kind: connect
  terminal: S1.out
  node: S1
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
  node: S1
- kind: connect
  terminal: M1.out
  node: SEL
- kind: connect
  terminal: SEL.in
  node: SEL
::::

// Disconnected instructional schematic (R1): two separate subcircuits that are intentionally not connected, plus a declared-but-unused node. Should emit warnings, not errors.

:::: circuit
id: disconnected-instructional
number: true
title: Disconnected instructional schematic with warnings
----
- kind: node
  ref: N1
- kind: node
  ref: N2
- kind: node
  ref: N3
- kind: node
  ref: N4
- kind: node
  ref: N5
- kind: node
  ref: N6
  label: unused spare
// First component-bearing subgraph: simple RC low-pass.
- kind: voltage-source
  name: V1
  value: 5 V
- kind: resistor
  name: R1
  value: 1 kohm
- kind: capacitor
  name: C1
  value: 1 uF
// Second component-bearing subgraph: LED with series resistor.
- kind: voltage-source
  name: V2
  value: 3 V
- kind: resistor
  name: R2
  value: 220 ohm
- kind: led
  name: LED1
- kind: connect
  terminal: V1.positive
  node: N1
- kind: connect
  terminal: V1.negative
  node: N2
- kind: connect
  terminal: R1.a
  node: N1
- kind: connect
  terminal: R1.b
  node: N3
- kind: connect
  terminal: C1.a
  node: N3
- kind: connect
  terminal: C1.b
  node: N2
- kind: connect
  terminal: V2.positive
  node: N4
- kind: connect
  terminal: V2.negative
  node: N5
- kind: connect
  terminal: R2.a
  node: N4
- kind: connect
  terminal: R2.b
  node: N5
- kind: connect
  terminal: LED1.anode
  node: N5
- kind: connect
  terminal: LED1.cathode
  node: N4
::::
