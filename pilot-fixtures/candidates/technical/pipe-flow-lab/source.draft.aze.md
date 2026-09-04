---
azemark: 1
title: Pipe-flow pressure-loss lab
author: AzeForge clean-room fixture
theme: academic
outputs:
  - html
  - svg
  - png
  - pdf
x-fixture-status: synthetic-candidate
---

# Pipe-flow pressure-loss lab

This lab relates volumetric flow to pressure loss in a straight circular pipe. Inspect every connection before starting the pump and keep the test section free of trapped air.

## Governing relations

The circular flow area is:

:::: equation
id: pipe-area
number: true
align: center

A = pi D^2 / 4
::::

The Reynolds number compares inertial and viscous effects.

:::: equation
id: reynolds-number
number: true
align: center

Re = rho v D / mu
::::

The Darcy-Weisbach pressure-loss relation is:

:::: equation
id: pressure-loss
number: true
align: center

delta_p = f (L / D) rho v^2 / 2
::::

## Measurements

:::: table
caption: Flow and pressure-loss observations

| Flow rate [L/min] | Mean velocity [m/s] | Pressure loss [kPa] |
| :--- | :---: | ---: |
| 2 | 0.42 | 0.18 |
| 4 | 0.85 | 0.71 |
| 6 | 1.27 | 1.58 |
| 8 | 1.70 | 2.82 |
::::

## Test sequence

:::: mermaid
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
