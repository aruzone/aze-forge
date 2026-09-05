---
azemark: 1
title: Invalid mermaid blocks
---

Four invalid diagrams; each gets exactly one scoped diagnostic and no
Artifact. The closing valid flowchart never renders because validation
stops at the first error Block.

::::: mermaid
id: broken-syntax

flowchart TD
  a - broken ???
:::::

::::: mermaid

piechart not a mermaid keyword
:::::

::::: mermaid

flowchart TD
  a[<script>alert(1)</script>] --> b[B]
:::::

::::: mermaid

flowchart TD
  a[Open guide] --> b[Done]
  click a https://example.com
:::::

::::: mermaid
flowchart TD
  ok[This one parses] --> fine[Fine]
:::::
