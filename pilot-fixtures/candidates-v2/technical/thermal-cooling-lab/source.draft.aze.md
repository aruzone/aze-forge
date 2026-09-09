---
azemark: 2
title: First-order cooling experiment
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

# First-order cooling experiment

This experiment estimates a thermal time constant from a cooling record. The model assumes a uniform specimen temperature, constant ambient temperature, and fixed thermal resistance over the observation interval.

## Model

The lumped thermal time constant is the product of thermal resistance and thermal capacitance.

:::: equation
id: thermal-time-constant
number: true
align: center
----
tau = R_th C_th
::::

The temperature response from initial temperature `T_0` toward ambient temperature `T_a` is:

:::: equation
id: cooling-response
number: true
align: center
----
T(t) = T_a + (T_0 - T_a) exp(-t / tau)
::::

The instantaneous heat-transfer rate follows:

:::: equation
id: heat-transfer-rate
number: true
align: center
----
q = (T - T_a) / R_th
::::

## Cooling record

:::: table
caption: Measured and predicted specimen temperature
----
columns:
  - key: time
    name: Time
    type: quantity
    unit: s
  - key: measured-temp
    name: Measured temperature
    type: quantity
    unit: degC
  - key: predicted-temp
    name: Predicted temperature
    type: quantity
    unit: degC
rows:
  - time: 0
    measured-temp: 80.0
    predicted-temp: 80.0
  - time: 60
    measured-temp: 61.2
    predicted-temp: 60.8
  - time: 120
    measured-temp: 49.6
    predicted-temp: 49.9
  - time: 180
    measured-temp: 42.2
    predicted-temp: 42.5
::::

## Acquisition sequence

- Confirm the temperature probe is secured.
- Start the timer when heating stops.
- Record at fixed intervals without reheating the specimen.

:::: mermaid
----
flowchart LR
  prepare[Secure probe] --> heat[Heat specimen]
  heat --> stop[Stop heating and start timer]
  stop --> sample[Record temperature]
  sample --> done{Final interval?}
  done -- No --> wait[Wait to next interval]
  wait --> sample
  done -- Yes --> fit[Fit time constant]
::::