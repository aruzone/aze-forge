---
azemark: 1
title: Series RLC response circuit
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

# Series RLC response circuit

An AC source drives a resistor, inductor, and capacitor in one loop. The mixed orientations exercise layout without changing named-terminal meaning.

:::: circuit
title: Series RLC response circuit
flow: left-to-right

node gnd role reference
node vin label "Excitation"
node after-r
node after-l label "Capacitor input"

voltage-source V1 mode ac value 10 V orientation top-to-bottom
resistor R1 value 100 Ohm orientation left-to-right
inductor L1 value 10 mH orientation left-to-right
capacitor C1 value 1 uF orientation top-to-bottom

connect V1.positive to vin
connect V1.negative to gnd
connect R1.a to vin
connect R1.b to after-r
connect L1.a to after-r
connect L1.b to after-l
connect C1.a to after-l
connect C1.b to gnd

current-label I_loop component R1 terminal a direction into
voltage-label V_C positive after-l negative gnd
::::
