---
azemark: 2
title: Circuit floating and disconnected scenarios
author: AzeForge Proto
x-circuit-symbol-convention: iec
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
  ref: din
- kind: node
  ref: en
- kind: node
  ref: clk
- kind: node
  ref: u1-out
- kind: node
  ref: ff1-q
- kind: node
  ref: ff2-q
- kind: node
  ref: d2
- kind: node
  ref: d3
- kind: node
  ref: s0
- kind: node
  ref: s1
- kind: node
  ref: sel
- kind: node
  ref: spare
  label: intentionally unused
- kind: digital-input
  ref: DIN
  name: DIN
- kind: digital-input
  ref: EN
  name: EN
- kind: digital-input
  ref: CLK
  name: CLK
- kind: digital-input
  ref: D2
  name: D2
- kind: digital-input
  ref: D3
  name: D3
- kind: digital-input
  ref: S0
  name: S0
- kind: digital-input
  ref: S1
  name: S1
- kind: digital-output
  ref: SEL
  name: SEL
- kind: and
  ref: U1
  inputs: 2
- kind: d-flip-flop
  ref: FF1
- kind: d-flip-flop
  ref: FF2
- kind: mux-4to1
  ref: M1
// bindings
- kind: connect
  terminal: DIN.out
  node: din
- kind: connect
  terminal: EN.out
  node: en
- kind: connect
  terminal: CLK.out
  node: clk
- kind: connect
  terminal: D2.out
  node: d2
- kind: connect
  terminal: D3.out
  node: d3
- kind: connect
  terminal: S0.out
  node: s0
- kind: connect
  terminal: S1.out
  node: s1
- kind: connect
  terminal: U1.in1
  node: din
- kind: connect
  terminal: U1.in2
  node: en
- kind: connect
  terminal: U1.out
  node: u1-out
- kind: connect
  terminal: FF1.d
  node: u1-out
- kind: connect
  terminal: FF1.clk
  node: clk
- kind: connect
  terminal: FF1.q
  node: ff1-q
- kind: connect
  terminal: FF2.d
  node: ff1-q
- kind: connect
  terminal: FF2.clk
  node: clk
- kind: connect
  terminal: FF2.q
  node: ff2-q
- kind: connect
  terminal: M1.d0
  node: ff1-q
- kind: connect
  terminal: M1.d1
  node: ff2-q
- kind: connect
  terminal: M1.d2
  node: d2
- kind: connect
  terminal: M1.d3
  node: d3
- kind: connect
  terminal: M1.s0
  node: s0
- kind: connect
  terminal: M1.s1
  node: s1
- kind: connect
  terminal: M1.out
  node: sel
- kind: connect
  terminal: SEL.in
  node: sel
::::

// Disconnected instructional schematic (R1): two separate subcircuits that are intentionally not connected, plus a declared-but-unused node. Should emit warnings, not errors.

:::: circuit
id: disconnected-instructional
number: true
title: Disconnected instructional schematic with warnings
----
- kind: node
  ref: n1
- kind: node
  ref: n2
- kind: node
  ref: n3
- kind: node
  ref: n4
- kind: node
  ref: n5
- kind: node
  ref: n6
  label: unused spare
// First component-bearing subgraph: simple RC low-pass.
- kind: voltage-source
  ref: V1
  value: 5 V
- kind: resistor
  ref: R1
  value: 1 kohm
- kind: capacitor
  ref: C1
  value: 1 uF
// Second component-bearing subgraph: LED with series resistor.
- kind: voltage-source
  ref: V2
  value: 3 V
- kind: resistor
  ref: R2
  value: 220 ohm
- kind: led
  ref: LED1
- kind: connect
  terminal: V1.positive
  node: n1
- kind: connect
  terminal: V1.negative
  node: n2
- kind: connect
  terminal: R1.a
  node: n1
- kind: connect
  terminal: R1.b
  node: n3
- kind: connect
  terminal: C1.a
  node: n3
- kind: connect
  terminal: C1.b
  node: n2
- kind: connect
  terminal: V2.positive
  node: n4
- kind: connect
  terminal: V2.negative
  node: n5
- kind: connect
  terminal: R2.a
  node: n4
- kind: connect
  terminal: R2.b
  node: n5
- kind: connect
  terminal: LED1.anode
  node: n5
- kind: connect
  terminal: LED1.cathode
  node: n4
::::
