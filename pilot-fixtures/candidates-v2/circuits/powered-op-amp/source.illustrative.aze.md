---
azemark: 2
title: Powered non-inverting op-amp
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
x-language-version: azemark-2
---

# Powered non-inverting op-amp

A one-volt input drives a non-inverting amplifier with equal feedback resistors. Both supply terminals are explicit and connected to separate positive and negative rails.

:::: circuit
title: Powered non-inverting op-amp
flow: left-to-right
----
node gnd role reference
node vin label "Input"
node vminus
node vout label "Output"
node vcc label "+12 V rail"
node vee label "-12 V rail"

voltage-source V1 mode dc value 1 V orientation top-to-bottom
voltage-source V2 mode dc value 12 V orientation top-to-bottom
voltage-source V3 mode dc value 12 V orientation bottom-to-top
op-amp U1 model "ideal teaching model" orientation left-to-right
resistor R1 value 10 kOhm orientation left-to-right
resistor R2 value 10 kOhm orientation top-to-bottom

connect V1.positive to vin
connect V1.negative to gnd
connect V2.positive to vcc
connect V2.negative to gnd
connect V3.positive to gnd
connect V3.negative to vee
connect U1.nonInverting to vin
connect U1.inverting to vminus
connect U1.output to vout
connect U1.positiveSupply to vcc
connect U1.negativeSupply to vee
connect R1.a to vout
connect R1.b to vminus
connect R2.a to vminus
connect R2.b to gnd

voltage-label V_out positive vout negative gnd
::::