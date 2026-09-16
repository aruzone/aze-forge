---
azemark: 2
title: AzeMark circuit schematics
author:
  - AzeForge examples
x-circuit-symbol-convention: iec
---

# Circuit schematics

Circuit blocks describe analog and digital schematics without coordinates: components,
named nodes, and terminal bindings carry the topology, and the renderer resolves the
wires. Every file in this family fixes one symbol convention, here IEC, so the shapes
of sources, gates, and flip-flops stay consistent across the examples.

## Analog schematics

Analog sections bind passive elements, sources, and semiconductors to named nodes; a
terminal that is never bound is a compile error, so each example closes every pin it
declares.

The simplest analog form is a resistive divider that taps a fixed fraction of the supply rail.

:::: circuit
id: divider-bias-network
title: Resistive divider bias network
----
- kind: node
  ref: rail
- kind: node
  ref: tap
- kind: node
  ref: return
  role: reference
  label: 0 V return
- kind: voltage-source
  ref: V1
  value: 12 V
  mode: dc
- kind: resistor
  ref: R1
  value: 1 kohm
- kind: resistor
  ref: R2
  value: 2 kohm
- kind: connect
  terminal: V1.positive
  node: rail
- kind: connect
  terminal: V1.negative
  node: return
- kind: connect
  terminal: R1.a
  node: rail
- kind: connect
  terminal: R1.b
  node: tap
- kind: connect
  terminal: R2.a
  node: tap
- kind: connect
  terminal: R2.b
  node: return
::::

Filtering is the same topology with a capacitor in place of the lower resistor, plus a voltage annotation that names the two nodes it spans.

:::: circuit
id: rc-lowpass-filter
title: RC low-pass filter
description: single pole RC filter with a labeled output
----
- kind: node
  ref: drive
- kind: node
  ref: out
- kind: node
  ref: return
  role: reference
- kind: voltage-source
  ref: V1
  value: 5 V
  mode: dc
- kind: resistor
  ref: R1
  value: 1 kohm
- kind: capacitor
  ref: C1
  value: 100 nF
- kind: connect
  terminal: V1.positive
  node: drive
- kind: connect
  terminal: V1.negative
  node: return
- kind: connect
  terminal: R1.a
  node: drive
- kind: connect
  terminal: R1.b
  node: out
- kind: connect
  terminal: C1.a
  node: out
- kind: connect
  terminal: C1.b
  node: return
- kind: current-label
  terminal: R1.a
  direction: into
- kind: voltage-label
  positive: out
  negative: return
::::

The deepest analog form stages an amplifier with a dependent source: the op-amp senses a
divided fraction of its own output, and a transresistance stage converts the sensed drive
into a ground-referenced level across a load resistor.

:::: circuit
id: opamp-transresistance-stage
title: Op-amp stage with a transresistance dependent source
description: non-inverting amplifier buffering a CCVS stage
flow: left-to-right
----
- kind: node
  ref: input
- kind: node
  ref: feedback
- kind: node
  ref: drive
- kind: node
  ref: sense
- kind: node
  ref: rail-positive
- kind: node
  ref: rail-negative
- kind: node
  ref: return
  role: reference
- kind: voltage-source
  ref: V1
  value: 5 V
  mode: dc
- kind: voltage-source
  ref: V2
  value: 15 V
  mode: dc
- kind: voltage-source
  ref: V3
  value: 15 V
  mode: dc
- kind: resistor
  ref: R1
  value: 10 kohm
- kind: resistor
  ref: R2
  value: 1 kohm
- kind: resistor
  ref: R3
  value: 220 ohm
- kind: op-amp
  ref: U1
  name: gain stage
- kind: dependent-source
  ref: E1
  value: 1 kohm
  mode: CCVS
- kind: connect
  terminal: V1.positive
  node: input
- kind: connect
  terminal: V1.negative
  node: return
- kind: connect
  terminal: V2.positive
  node: rail-positive
- kind: connect
  terminal: V2.negative
  node: return
- kind: connect
  terminal: V3.positive
  node: rail-negative
- kind: connect
  terminal: V3.negative
  node: return
- kind: connect
  terminal: U1.nonInverting
  node: input
- kind: connect
  terminal: U1.inverting
  node: feedback
- kind: connect
  terminal: U1.output
  node: drive
- kind: connect
  terminal: U1.positiveSupply
  node: rail-positive
- kind: connect
  terminal: U1.negativeSupply
  node: rail-negative
- kind: connect
  terminal: R1.a
  node: drive
- kind: connect
  terminal: R1.b
  node: feedback
- kind: connect
  terminal: R2.a
  node: feedback
- kind: connect
  terminal: R2.b
  node: return
- kind: connect
  terminal: E1.controlPositive
  node: drive
- kind: connect
  terminal: E1.controlNegative
  node: return
- kind: connect
  terminal: E1.positive
  node: sense
- kind: connect
  terminal: E1.negative
  node: return
- kind: connect
  terminal: R3.a
  node: sense
- kind: connect
  terminal: R3.b
  node: return
::::

## Digital schematics

Digital sections use the same node and terminal model: gates, multiplexers, flip-flops,
and the digital input and output symbols that give a schematic its boundary pins.

A two-level gate network shows how a shared intermediate node feeds a second stage.

:::: circuit
id: gate-network-sum
title: Two-level gate network
----
- kind: node
  ref: a
- kind: node
  ref: b
- kind: node
  ref: c
- kind: node
  ref: partial
- kind: node
  ref: y
- kind: digital-input
  ref: A
  name: A
- kind: digital-input
  ref: B
  name: B
- kind: digital-input
  ref: C
  name: C
- kind: and
  ref: U1
  inputs: 2
- kind: or
  ref: U2
  inputs: 2
- kind: digital-output
  ref: Y
  name: Y
- kind: connect
  terminal: A.out
  node: a
- kind: connect
  terminal: B.out
  node: b
- kind: connect
  terminal: C.out
  node: c
- kind: connect
  terminal: U1.in1
  node: a
- kind: connect
  terminal: U1.in2
  node: b
- kind: connect
  terminal: U1.out
  node: partial
- kind: connect
  terminal: U2.in1
  node: partial
- kind: connect
  terminal: U2.in2
  node: c
- kind: connect
  terminal: U2.out
  node: y
- kind: connect
  terminal: Y.in
  node: y
::::

A flip-flop stage adds a clocked element, with the data and clock nets shared between the boundary pins and the register.

:::: circuit
id: flipflop-capture-stage
title: Clocked capture stage
description: one D flip-flop between boundary pins
----
- kind: node
  ref: data-net
- kind: node
  ref: clock-net
- kind: node
  ref: q-net
- kind: digital-input
  ref: D
  name: D
- kind: digital-input
  ref: CLK
  name: CLK
- kind: d-flip-flop
  ref: FF1
- kind: digital-output
  ref: Q
  name: Q
- kind: connect
  terminal: D.out
  node: data-net
- kind: connect
  terminal: CLK.out
  node: clock-net
- kind: connect
  terminal: FF1.d
  node: data-net
- kind: connect
  terminal: FF1.clk
  node: clock-net
- kind: connect
  terminal: FF1.q
  node: q-net
- kind: connect
  terminal: Q.in
  node: q-net
::::

The full clocked chain pairs two registers with a multiplexer that selects among the registered value, the second register, and two external inputs.

:::: circuit
id: clocked-logic
number: true
title: Clocked logic acceptance circuit
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

## Floating and disconnected Circuits

A Circuit is a graph, not a netlist check: a schematic with no reference node still
compiles, and two separate subcircuits in one block are legal. Those cases are reported as
warnings so an author can see them without the compiler rejecting the drawing.

A floating clocked circuit declares a spare node it never wires and omits any ground reference; the node is reported as unused while the block still compiles.

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

Disconnected teaching schematics place two unrelated subcircuits side by side, with a spare node left over from an earlier revision; both warning conditions fire and nothing is reported as an error.

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
