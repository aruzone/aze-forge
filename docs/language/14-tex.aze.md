---
azemark: 2
---

# TeX renderer coverage

This Source exercises every approved `tex` profile through the isolated TeX renderer. It is a local renderer smoke Source, not a canonical Artifact.

## CircuitikZ

:::: tex
id: rc-low-pass
title: RC low-pass filter
description: A resistor and capacitor connected as a low-pass filter.
profile: circuitikz
----
\draw (0,0) to[R=$R$] (2,0) to[C=$C$] (2,-2) -- (0,-2) -- cycle;
::::

## TikZ

:::: tex
id: coordinate-triangle
title: Coordinate triangle
description: A triangle with labeled vertices on Cartesian axes.
profile: tikz
----
\draw[->] (-0.2,0) -- (3,0) node[right] {$x$};
\draw[->] (0,-0.2) -- (0,2.5) node[above] {$y$};
\draw[thick,blue] (0.5,0.5) -- (2.5,0.5) -- (1.5,2) -- cycle;
\foreach \point/\label in {(0.5,0.5)/A,(2.5,0.5)/B,(1.5,2)/C}
  \fill \point circle (1.5pt) node[above] {$\label$};
::::

## PGFPlots

:::: tex
id: parabola-plot
title: Parabola plot
description: A plot of y equals x squared over the interval minus two to two.
profile: pgfplots
----
\begin{axis}[width=8cm, xlabel={$x$}, ylabel={$y$}, grid=major]
  \addplot[domain=-2:2, samples=80, thick, red] {x^2};
\end{axis}
::::

## Chemfig

:::: tex
id: ethanol-structure
title: Ethanol structure
description: A structural formula for ethanol.
profile: chemfig
----
\chemfig{H_3C-CH_2-OH}
::::

## TikZ-CD

:::: tex
id: commutative-square
title: Commutative square
description: A square diagram with two paths from A to D.
profile: tikz-cd
----
\begin{tikzcd}
A \arrow[r, "f"] \arrow[d, "g"'] & B \arrow[d, "h"] \\
C \arrow[r, "k"'] & D
\end{tikzcd}
::::
