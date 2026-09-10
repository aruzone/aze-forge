---
azemark: 2
title: RC step response fixture
author:
  - AzeForge clean-room fixture
---

# RC step response

Analytic curve with measured points and uncertainties in one coordinate
system. Valid: samples at undefined regions gap, error bars render.

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
