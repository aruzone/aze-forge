---
azemark: 2
title: Raw LaTeX probes
---

Quadratic formula:

:::: equation
id: quadratic
syntax: latex
----

x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}
::::

Gaussian integral, numbered:

:::: equation
id: gaussian
number: true
syntax: latex
----

\int_{-\infty}^{\infty} e^{-x^2} \, dx = \sqrt{\pi}
::::

Left-aligned rotation matrix:

:::: equation
id: rotation
align: left
syntax: latex
----

\begin{bmatrix} \cos\theta & -\sin\theta \\ \sin\theta & \cos\theta \end{bmatrix}
::::
