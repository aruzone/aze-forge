---
azemark: 2
title: BJT low-side LED switch
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

# BJT low-side LED switch

A logic-level source drives an NPN base through a resistor. The transistor switches current through the series load resistor and LED from the five-volt rail.

:::: circuit
title: BJT low-side LED switch
flow: left-to-right
----
node gnd role reference
node vcc label "+5 V rail"
node drive label "Logic input"
node base
node led-anode
node collector label "Switched output"

voltage-source V1 mode dc value 5 V orientation top-to-bottom
voltage-source V2 mode dc value 3.3 V orientation top-to-bottom
resistor R1 value 4.7 kOhm orientation left-to-right
resistor R2 value 330 Ohm orientation top-to-bottom
led LED1 model "red" orientation top-to-bottom
bjt Q1 variant npn model "2N3904" orientation top-to-bottom

connect V1.positive to vcc
connect V1.negative to gnd
connect V2.positive to drive
connect V2.negative to gnd
connect R1.a to drive
connect R1.b to base
connect R2.a to vcc
connect R2.b to led-anode
connect LED1.anode to led-anode
connect LED1.cathode to collector
connect Q1.collector to collector
connect Q1.base to base
connect Q1.emitter to gnd

current-label I_C component Q1 terminal collector direction into
node-label V_out node collector
::::