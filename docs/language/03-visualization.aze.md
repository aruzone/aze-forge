---
azemark: 2
title: Visualization examples
author:
  - AzeForge examples
---

# Visualization examples

This document gathers the two native numeric-visualization families. A `plot` draws evaluable function curves and authored point series on shared Cartesian axes; a `chart` draws categorical bars or a numeric histogram. Each section moves from the smallest useful declaration to the most demanding form the family registers.

## Plot

The `plot` directive draws a figure from ordered series records that share one x-axis and one y-axis, with optional `parameters:` bound once for every expression in the Block.

The simplest plot samples one analytic function over an explicit `domain`, which the author must state because the family never invents a range.

:::: plot
id: logistic-growth
x-axis:
  label: time (h)
y-axis:
  label: population (10^6 cells)
----
- kind: function
  label: logistic growth
  variable: t
  expression: 40 / (1 + 39 * exp(-0.6 * t))
  domain:
    min: 0
    max: 12
  samples: 240
::::

Measured points sit on the same axes as the curve, and each point carries either one symmetric `error` or an `error-low`/`error-high` pair when the uncertainty is asymmetric.

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

At full depth a plot shares named `parameters` across every expression, puts the x-axis on a logarithmic `scale`, and overlays two function series with one measured series.

:::: plot
id: amplifier-gain-sweep
number: true
width: 720
height: 440
grid: true
parameters:
  a0: 100000
  f0: 1000
x-axis:
  label: frequency (Hz)
  scale: log
  min: 10
  max: 100000
y-axis:
  label: gain (V/V)
  scale: log
----
- kind: function
  label: single-pole magnitude
  variable: f
  expression: a0 / sqrt(1 + (f / f0)^2)
  domain:
    min: 10
    max: 100000
  samples: 400
- kind: function
  label: asymptotic roll-off
  variable: f
  expression: a0 / (f / f0)
  domain:
    min: 10
    max: 100000
  samples: 400
- kind: scatter
  label: swept measurements
  points:
    - x: 100
      y: 70400
      error: 2500
    - x: 1000
      y: 70600
      error-low: 1800
      error-high: 2400
    - x: 10000
      y: 9900
      error: 400
::::

## Chart

The `chart` directive draws categorical and distributional figures. Its `type` selects the variant, and the header carries the axis labels and bounds that the body data does not. The three bar-family variants live here; a `histogram` bins raw values instead and has its own section below.

One bar series is enough to compare a single quantity across categories.

:::: chart
id: payload-mass-by-stage
type: bar
x-label: launch stage
y-label: payload mass (kg)
grid: true
----
- label: payload mass
  bars:
    - category: Stage 1
      value: 2400
    - category: Stage 2
      value: 1150
    - category: Upper stage
      value: 480
::::

A `grouped-bar` chart puts several series side by side within each category, and a single bar may carry a symmetric `error` or an `error-low`/`error-high` pair.

:::: chart
id: bench-scores
type: grouped-bar
x-label: suite
y-label: score
----
- label: alpha
  bars:
    - category: parse
      value: 12
      error: 0.5
    - category: render
      value: 19
- label: beta
  bars:
    - category: parse
      value: 9
    - category: render
      value: 22
      error-low: 1
      error-high: 2
::::

A `stacked-bar` chart composes its series into one column per category, so the reading is the whole rather than the parts.

:::: chart
id: warehouse-throughput
number: true
width: 720
height: 400
type: stacked-bar
x-label: shift
y-label: parcels handled
----
- label: automated line
  bars:
    - category: Morning
      value: 1240
    - category: Afternoon
      value: 1180
    - category: Night
      value: 640
- label: manual line
  bars:
    - category: Morning
      value: 310
    - category: Afternoon
      value: 420
    - category: Night
      value: 180
::::

## Histogram

A `histogram` series takes raw `values` and explicit `edges`, which fixes every bin boundary in the source rather than in the renderer. Values below the first edge or at or above the last are refused, so the authored range is a claim the compiler checks.

Binning one sample against four fixed edges gives the distribution its coarsest useful reading.

:::: chart
id: request-latency-distribution
type: histogram
x-label: request latency (ms)
y-label: requests
y-min: 0
y-max: 8
----
- label: sampled requests
  values:
    - 12
    - 18
    - 22
    - 27
    - 31
    - 35
    - 38
    - 44
    - 47
    - 52
    - 58
    - 63
    - 71
    - 76
    - 88
    - 94
    - 103
    - 112
    - 121
    - 138
  edges:
    - 0
    - 40
    - 80
    - 120
    - 160
::::

A numbered histogram with a tighter bin pitch, an explicit canvas and a legend shows the same series read at a resolution the reader can act on.

:::: chart
id: grain-size-distribution
number: true
width: 720
height: 400
legend: true
grid: true
type: histogram
x-label: grain diameter (µm)
y-label: counts
y-min: 0
y-max: 12
----
- label: sieve sample
  values:
    - 41
    - 44
    - 47
    - 49
    - 51
    - 52
    - 54
    - 55
    - 56
    - 58
    - 59
    - 61
    - 62
    - 64
    - 67
    - 69
    - 71
    - 74
    - 78
    - 83
  edges:
    - 40
    - 45
    - 50
    - 55
    - 60
    - 65
    - 70
    - 75
    - 80
    - 85
::::
