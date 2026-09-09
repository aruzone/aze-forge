---
azemark: 2
title: Sensor calibration exchange
---

## Calibration exchange

A sequence diagram rendered offline with deterministic IDs:

:::: mermaid
id: calibration-exchange
title: Reference comparison
----
sequenceDiagram
  participant Sensor
  participant Reference
  Sensor->>Reference: Request zero point
  Reference-->>Sensor: Zero point
  Sensor->>Reference: Apply next load
  Reference-->>Sensor: Measured value
::::
