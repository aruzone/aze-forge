---
azemark: 2
title: Pipe-flow pressure-loss lab
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

# Pipe-flow pressure-loss lab

This lab relates volumetric flow to pressure loss in a straight circular pipe. Inspect every connection before starting the pump and keep the test section free of trapped air.

## Governing relations

The circular flow area is:

:::: equation
id: pipe-area
number: true
align: center
----
A = pi D^2 / 4
::::

The Reynolds number compares inertial and viscous effects.

:::: equation
id: reynolds-number
number: true
align: center
----
Re = rho v D / mu
::::

The Darcy-Weisbach pressure-loss relation is:

:::: equation
id: pressure-loss
number: true
align: center
----
delta_p = f (L / D) rho v^2 / 2
::::

## Measurements

:::: table
caption: Flow and pressure-loss observations
----
columns:
  - key: flow-rate
    name: Flow rate
    type: quantity
    unit: L/min
  - key: mean-velocity
    name: Mean velocity
    type: quantity
    unit: m/s
  - key: pressure-loss
    name: Pressure loss
    type: quantity
    unit: kPa
rows:
  - flow-rate: 2
    mean-velocity: 0.42
    pressure-loss: 0.18
  - flow-rate: 4
    mean-velocity: 0.85
    pressure-loss: 0.71
  - flow-rate: 6
    mean-velocity: 1.27
    pressure-loss: 1.58
  - flow-rate: 8
    mean-velocity: 1.70
    pressure-loss: 2.82
::::

## Test sequence

:::: mermaid
----
flowchart TD
  inspect[Inspect tubing] --> purge[Purge trapped air]
  purge --> set[Set flow rate]
  set --> stable{Reading stable?}
  stable -- No --> wait[Wait]
  wait --> stable
  stable -- Yes --> record[Record pressure loss]
  record --> next{Next flow rate?}
  next -- Yes --> set
  next -- No --> stop[Stop pump]
::::