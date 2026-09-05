---
azemark: 1
title: Engineering notation sampler
author:
  - AzeForge acceptance
---

# Engineering notation sampler

Substantive prose on engineering notation with *emphasis*, **strong** text,
and `inline code`. Keep one retained [safe reference](https://example.com/engineering-notation)
for link proof.

Measurement notes:

- inspect the setup before recording
- correct unsafe conditions immediately

## Equations

:::: equation
id: gaussian-integral
number: true

integral x=-infinity..infinity of exp(-x^2) dx = sqrt(pi)
::::

:::: equation
id: arithmetic-series

sum i=1..n of i = n (n + 1) / 2
::::

:::: equation
id: heat-equation

partial T / partial t = alpha partial^2 T / partial x^2
::::

## Materials

:::: table
caption: Representative material properties for thermal design
id: materials

| material | density [kg/m^3] | thermal conductivity [W/(m K)] |
| :--- | :---: | ---: |
| Aluminum | 2700 | 205 |
| Steel | 7850 | 50 |
| Glass | 2500 | 1.0 |
::::

## Safety flow

::::: mermaid
id: safety-flow
title: Measurement safety flow
description: Inspect the setup, correct when unsafe, record, finish

flowchart LR
  start[Start] --> inspect[Inspect setup]
  inspect --> safe{Safe?}
  safe -- No --> correct[Correct setup]
  correct --> inspect
  safe -- Yes --> record[Record measurement]
  record --> finish[Finish]
:::::
