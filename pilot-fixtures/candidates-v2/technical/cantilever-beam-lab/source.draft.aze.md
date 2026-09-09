---
azemark: 2
title: Cantilever beam deflection lab
author: AzeForge clean-room fixture
theme: academic
outputs:
  - html
  - svg
  - png
  - pdf
x-fixture-status: synthetic-candidate
x-language-version: azemark-2
---

# Cantilever beam deflection lab

This lab compares measured end deflection with the small-deflection model for a rectangular cantilever. Record dimensions before loading, keep units consistent, and do not exceed the fixture's listed load range.

## Section properties

For a rectangular section of width `b` and thickness `h`, the second moment of area is:

:::: equation
id: second-moment-area
number: true
align: center
----
I = b h^3 / 12
::::

The ideal end deflection under force `F`, span `L`, elastic modulus `E`, and second moment `I` is:

:::: equation
id: cantilever-deflection
number: true
align: center
----
delta = F L^3 / (3 E I)
::::

The maximum fixed-end bending stress is:

:::: equation
id: bending-stress
number: true
align: center
----
sigma_max = 6 F L / (b h^2)
::::

## Observations

:::: table
caption: Cantilever load and end-deflection observations
----
columns:
  - key: load
    name: Load
    type: quantity
    unit: N
  - key: measured-deflection
    name: Measured deflection
    type: quantity
    unit: mm
  - key: model-deflection
    name: Model deflection
    type: quantity
    unit: mm
rows:
  - load: 2
    measured-deflection: 0.42
    model-deflection: 0.40
  - load: 4
    measured-deflection: 0.83
    model-deflection: 0.80
  - load: 6
    measured-deflection: 1.25
    model-deflection: 1.20
  - load: 8
    measured-deflection: 1.68
    model-deflection: 1.60
::::

## Procedure

1. Measure the free span and rectangular section.
2. Zero the displacement indicator before loading.
3. Apply each load and record deflection.
4. Remove the load and verify return to zero.

:::: mermaid
----
flowchart TD
  measure[Measure beam] --> zero[Zero indicator]
  zero --> load[Apply next load]
  load --> read[Record deflection]
  read --> more{More loads?}
  more -- Yes --> load
  more -- No --> unload[Unload and verify zero]
::::