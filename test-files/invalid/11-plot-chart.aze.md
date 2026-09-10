---
azemark: 2
title: Invalid plot and chart blocks
---

Four invalid Blocks; each gets exactly one scoped diagnostic and no
Artifact. Nothing is silently dropped: undeclared names, missing domains,
log violations, and out-of-range histogram values are all refused.

:::: plot
id: unbound-name
----
- kind: function
  expression: x + q
  domain:
    min: 0
    max: 1
::::

:::: plot
id: missing-domain
----
- kind: function
  expression: x
::::

:::: plot
id: log-violation
y-axis:
  scale: log
----
- kind: scatter
  points:
    - x: 1
      y: 0
::::

:::: chart
id: histogram-out-of-range
type: histogram
----
- values:
    - 12.5
  edges:
    - 0
    - 10
::::
