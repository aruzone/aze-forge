---
azemark: 2
title: Bad equation bodies
---

Missing integration variable (line-specific):

:::: equation
----
integral x=0..1 of x^2
::::

Unparseable body:

:::: equation
----
a } b
::::

Raw TeX inside a readable block:

:::: equation
----
x = \frac{a}{b}
::::
