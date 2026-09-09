---
azemark: 2
title: Half-wave rectifier with LED indicator
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

# Half-wave rectifier with LED indicator

The diode rectifies the AC source, the capacitor smooths the rectified node, and a resistor limits current through the LED branch.

:::: circuit
title: Half-wave rectifier with LED indicator
flow: left-to-right
----
node gnd role reference
node ac-in label "AC input"
node rectified label "Rectified output"
node led-anode

voltage-source V1 mode ac value 12 V orientation top-to-bottom
diode D1 model "1N4007" orientation left-to-right
capacitor C1 value 470 uF orientation top-to-bottom
resistor R1 value 1 kOhm orientation left-to-right
led LED1 model "red" orientation top-to-bottom

connect V1.positive to ac-in
connect V1.negative to gnd
connect D1.anode to ac-in
connect D1.cathode to rectified
connect C1.a to rectified
connect C1.b to gnd
connect R1.a to rectified
connect R1.b to led-anode
connect LED1.anode to led-anode
connect LED1.cathode to gnd

voltage-label V_rect positive rectified negative gnd
current-label I_LED component LED1 terminal anode direction into
::::