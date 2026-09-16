---
azemark: 2
title: Timing
author: [AzeForge examples]
---

# Timing

Timing blocks describe digital transactions over one shared scale: the integer cycle grid, or an explicit duration axis with a registered unit. Clock and single-bit signals carry edge states, buses carry authored values, and unknown and high-impedance windows stay distinct states. Groups, markers and `signal@boundary` arrows are authored display facts about the drawn transaction, never a claim the compiler evaluates.

## Cycle scale

A cycle-scale block places every interval on the shared integer cycle grid, so a waveform is authored as run lengths rather than durations.

The minimal block pairs one clock with one single-bit signal, each written as a `wave:` run string read left to right.

:::: timing
id: timing-clock-enable
number: true
title: Clocked enable
description: one clock, one gate
scale: cycles
----
- kind: signal
  ref: clk
  clock: true
  wave: 2p2n2p2n
- kind: signal
  ref: enable
  wave: 0011
::::

A bus signal adds a width and authored values after an unknown start, and a group brackets the contiguous pair while a marker pins the frame boundary.

:::: timing
id: timing-sample-window
number: true
title: Sampling window
description: bus capture after an unknown start
scale: cycles
----
- kind: signal
  ref: sclk
  clock: true
  wave: 2p2n2p2n
- kind: signal
  ref: sample
  wave: 00011100
- kind: signal
  ref: level
  width: 8
  wave: x={A5}={7C}z
- kind: group
  label: Capture
  signals: sample, level
- kind: marker
  at: 3
  label: Frame
::::

The deepest cycle-scale block combines handshake bits, a bus turnaround, an unknown start and a high-impedance window with a group, a marker and an anchored arrow.

:::: timing
id: timing-clocked-bus-transaction
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

## Time scale

A time-scale block keeps the same authored order but replaces run lengths with explicit `state:` and `duration:` interval records over one registered unit.

The smallest duration axis is a trigger with authored edges and a gate whose assertion is pinned by a marker in `µs`.

:::: timing
id: timing-pulse-budget
number: true
title: Pulse budget
description: authored durations in µs
scale: time
unit: µs
----
- kind: signal
  ref: trig
  intervals:
    - state: low
      duration: 5
    - state: rise
      duration: 0.1
    - state: high
      duration: 2
    - state: fall
      duration: 0.1
    - state: low
      duration: 5
- kind: signal
  ref: gate
  intervals:
    - state: low
      duration: 7.2
    - state: high
      duration: 2
    - state: low
      duration: 3
- kind: marker
  at: 7.2
  label: Gate
::::

The duration-equivalent twin of the cycle-scale transaction carries the same signal refs, authored order, group, marker position and arrow anchors, with every cycle count of the `cycles` grid written as an explicit `ns` duration on the `time` scale.

:::: timing
id: timing-transaction-time-scale
number: true
title: Clocked bus transaction
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
