---
azemark: 1
title: First-order cooling experiment
author: AzeForge clean-room fixture
theme: academic
outputs:
  - html
  - svg
  - png
  - pdf
x-fixture-status: synthetic-candidate
---

# First-order cooling experiment

This experiment estimates a thermal time constant from a cooling record. The model assumes a uniform specimen temperature, constant ambient temperature, and fixed thermal resistance over the observation interval.

## Model

The lumped thermal time constant is the product of thermal resistance and thermal capacitance.

:::: equation
id: thermal-time-constant
number: true
align: center

tau = R_th C_th
::::

The temperature response from initial temperature `T_0` toward ambient temperature `T_a` is:

:::: equation
id: cooling-response
number: true
align: center

T(t) = T_a + (T_0 - T_a) exp(-t / tau)
::::

The instantaneous heat-transfer rate follows:

:::: equation
id: heat-transfer-rate
number: true
align: center

q = (T - T_a) / R_th
::::

## Cooling record

:::: table
caption: Measured and predicted specimen temperature

| Time [s] | Measured temperature [degC] | Predicted temperature [degC] |
| :--- | :---: | ---: |
| 0 | 80.0 | 80.0 |
| 60 | 61.2 | 60.8 |
| 120 | 49.6 | 49.9 |
| 180 | 42.2 | 42.5 |
::::

## Acquisition sequence

- Confirm the temperature probe is secured.
- Start the timer when heating stops.
- Record at fixed intervals without reheating the specimen.

:::: mermaid
flowchart LR
  prepare[Secure probe] --> heat[Heat specimen]
  heat --> stop[Stop heating and start timer]
  stop --> sample[Record temperature]
  sample --> done{Final interval?}
  done -- No --> wait[Wait to next interval]
  wait --> sample
  done -- Yes --> fit[Fit time constant]
::::
