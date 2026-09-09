---
azemark: 2
title: Engineering notation sampler
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

# Engineering notation sampler

Technical publishing combines explanatory prose with notation, data, and process diagrams. This clean-room fixture deliberately places unrelated engineering examples in one short document so each semantic Block can be checked independently.

The examples use **readable equation Source**, *explicit table structure*, and `flowchart` syntax. SI notation follows the [NIST SI overview](https://www.nist.gov/pml/owm/si-units); rendering must not fetch that link.

## Calculus identity

The Gaussian integral exercises infinite bounds, an exponential, a power, and a square root.

:::: equation
id: gaussian-integral
number: true
align: center
----
integral x=-infinity..infinity of exp(-x^2) dx = sqrt(pi)
::::

## Finite series

The arithmetic-series identity exercises a bounded summation and grouped division.

:::: equation
id: arithmetic-series
number: true
align: center
----
sum i=1..n of i = n (n + 1) / 2
::::

## Diffusion model

The one-dimensional diffusion equation exercises partial derivatives, a Greek variable, subscripts, and superscripts.

:::: equation
id: diffusion-equation
number: true
align: center
----
partial T / partial t = alpha partial^2 T / partial x^2
::::

## Representative material properties

The values below are fixture data, not design recommendations. The typed table declares its quantity columns and units explicitly.

:::: table
caption: Representative material properties used by this fixture
----
columns:
  - key: material
    name: Material
    type: text
  - key: density
    name: Density
    type: quantity
    unit: kg/m^3
  - key: conductivity
    name: Thermal conductivity
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

## Measurement safety flow

- Inspect the setup before energizing it.
- Correct unsafe conditions before recording data.
- Preserve the decision branch in every Artifact.

:::: mermaid
----
flowchart LR
  start[Start] --> inspect[Inspect setup]
  inspect --> safe{Safe?}
  safe -- No --> correct[Correct setup]
  correct --> inspect
  safe -- Yes --> record[Record measurement]
  record --> finish[Finish]
::::