---
azemark: 1
title: Linear sensor calibration lab
author: AzeForge clean-room fixture
theme: academic
outputs:
  - html
  - svg
  - png
  - pdf
x-fixture-status: synthetic-candidate
---

# Linear sensor calibration lab

This lab compares a sensor indication with traceable reference values and records the fitted linear response. Apply reference points in increasing order, then repeat one point to check short-term repeatability.

## Calibration model

The fitted indication is a straight line with slope `m` and intercept `b`.

:::: equation
id: linear-model
number: true
align: center

y_hat = m x + b
::::

The residual at observation `i` is the reference-relative difference.

:::: equation
id: calibration-residual
number: true
align: center

e_i = y_i - y_hat_i
::::

The root-mean-square error summarizes all residuals.

:::: equation
id: calibration-rmse
number: true
align: center

RMSE = sqrt((sum i=1..n of e_i^2) / n)
::::

## Calibration record

:::: table
caption: Reference and indicated sensor values

| Reference [unit] | Indicated [unit] | Error [unit] |
| :--- | :---: | ---: |
| 0.0 | 0.1 | 0.1 |
| 25.0 | 25.2 | 0.2 |
| 50.0 | 50.1 | 0.1 |
| 75.0 | 74.8 | -0.2 |
| 100.0 | 99.7 | -0.3 |
::::

## Calibration workflow

1. Verify the reference and sensor are stable.
2. Record both readings without rounding during acquisition.
3. Fit the model only after all points are collected.

:::: mermaid
flowchart LR
  verify[Verify setup] --> apply[Apply reference]
  apply --> stable{Stable?}
  stable -- No --> apply
  stable -- Yes --> record[Record pair]
  record --> more{More points?}
  more -- Yes --> apply
  more -- No --> fit[Fit linear model]
  fit --> review[Review residuals]
::::
