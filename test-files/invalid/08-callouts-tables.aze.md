---
azemark: 2
title: Callout and table directive failures
---

Before the failures.

:::: callout
variant: bogus
title: Unsupported variant
----
Body text.
::::

:::: table
caption: Missing table body
----
This is not a GFM table.
::::

:::: callout
variant: note
id: shared
----
[bad ftp link](ftp://files.example.com/x)
::::

:::: table
caption: Unknown header
width: full
----
columns:
  - key: a
    name: A
    type: text
rows:
  - a: "1"
::::

After the failures.
