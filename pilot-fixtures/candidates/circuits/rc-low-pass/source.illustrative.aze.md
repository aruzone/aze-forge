---
azemark: 1
title: RC low-pass filter
author: AzeForge clean-room fixture
theme: academic
outputs:
  - html
  - svg
  - png
  - pdf
x-fixture-status: synthetic-candidate
x-circuit-syntax-status: illustrative-unfrozen
x-circuit-symbol-convention: iec
x-symbol-convention-status: provisional-not-pilot-ruling
---

# RC low-pass filter

The filter uses one resistor and one capacitor. Connectivity is stated terminal by terminal; line order and visual placement carry no electrical meaning.

:::: circuit
title: RC low-pass filter
flow: left-to-right

node gnd role reference
node vin label "Input"
node vout label "Output"

voltage-source V1 mode dc value 5 V orientation top-to-bottom
resistor R1 value 1 kOhm orientation left-to-right
capacitor C1 value 100 nF orientation top-to-bottom

connect V1.positive to vin
connect V1.negative to gnd
connect R1.a to vin
connect R1.b to vout
connect C1.a to vout
connect C1.b to gnd

voltage-label V_out positive vout negative gnd
::::
