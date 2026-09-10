---
azemark: 2
title: Benchmark chart fixture
author:
  - AzeForge clean-room fixture
---

# Benchmark charts

Grouped bars with symmetric and asymmetric error bars, plus a histogram
with explicit edges. Valid: categories keep authored order, the resolved
edge list is Document data, counts derive at render.

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

:::: chart
id: latency-hist
type: histogram
----
- label: samples
  values:
    - 1.5
    - 2.5
    - 2.7
    - 10
  edges:
    - 0
    - 5
    - 10
::::
