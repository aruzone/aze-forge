---
azemark: 2
title: Timing clocked-transaction scenarios
author: AzeForge Proto
---

# Timing scenarios

This document exercises the Timing family against the contract §13 clocked bus transaction. The same logical diagram is authored twice: once on the shared cycle scale and once on an equivalent explicit time scale, so scale independence is visible in one place.

// Clocked bus transaction (contract §13): a clocked exchange on the shared cycle scale. `clk` carries edge-state runs, `valid` and `ready` are single-bit handshakes written as one-cycle state runs, `addr` presents two bus values after an unknown start, and `data` shows a bus value with an unknown turnaround and a high-impedance window.

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

// Duration-equivalent twin of the same transaction: identical signal refs, authored order, group, marker position and arrow anchors, with every cycle count written as an explicit `ns` duration.

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

The family registers no warnings: every unsupported or contradictory declaration is an error, and every valid declaration renders. Arrows and markers are authored display facts that describe the transaction — the compiler never evaluates setup, hold or any other timing behavior, and never certifies a relationship you drew.
