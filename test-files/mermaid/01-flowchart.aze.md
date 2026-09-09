---
azemark: 2
title: Beam deflection procedure
author:
  - AzeForge clean-room fixture
---

# Beam deflection procedure

The lab workflow as an offline deterministic diagram:

:::: mermaid
id: beam-procedure
title: Beam loading loop
description: Zero, load, record, repeat until no more loads remain
----
flowchart TD
  measure[Measure beam] --> zero[Zero indicator]
  zero --> load[Apply next load]
  load --> read[Record deflection]
  read --> more{More loads?}
  more -- Yes --> load
  more -- No --> unload[Unload and verify zero]
::::

The same workflow left-to-right, without header attributes:

:::: mermaid
----
flowchart LR
  prepare[Secure probe] --> heat[Heat specimen]
  heat --> stop[Stop heating and start timer]
  stop --> cooled{Cooled to target?}
  cooled -- No --> stop
::::
