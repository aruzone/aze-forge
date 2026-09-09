---
azemark: 2
title: Chemistry specified, unspecified and omitted information
author: AzeForge Proto
---

# Chemistry information

This document exercises R4: normalization cannot invent or erase isotope, charge, stereochemistry, or unspecified coefficients. Specified, explicitly unspecified, and omitted are three preserved states.

// Fully specified: isotope at a specific atom, wedge stereo, charge, and a checked balanced reaction.

:::: reaction
id: silver-chloride-balanced
number: true
caption: Precipitation with balance assertion
balance: check
----
Ag+(aq) + Cl-(aq) -> AgCl(s)
::::

:::: structure
id: alanine-specified
number: true
caption: (S)-Alanine-14C with every fact specified
----
- atom: ca
  element: C
  isotope: 14
  at: [1.2, -0.7]
- atom: cb
  element: C
  at: [0.0, 0.0]
- atom: cc
  element: C
  at: [-1.2, -0.7]
- atom: n
  element: N
  at: [0.0, 1.4]
- atom: o
  element: O
  at: [2.4, 0.0]
- atom: oh
  element: O
  at: [1.2, -2.1]
- atom: h
  element: H
  at: [2.4, -2.8]
- atom: side-h
  element: H
  at: [-1.2, 1.4]
- bond:
  from: cb
  to: n
  order: 1
  stereo: wedge
- bond:
  from: cb
  to: cc
  order: 1
- bond:
  from: cb
  to: ca
  order: 1
- bond:
  from: ca
  to: o
  order: 2
- bond:
  from: ca
  to: oh
  order: 1
- bond:
  from: oh
  to: h
  order: 1
- bond:
  from: cb
  to: side-h
  order: 1
- label:
  text: (S)
  at: [-0.5, 0.7]
::::

// Explicitly unspecified: a skeletal reaction with unknown coefficients, and a fragment with an attachment atom plus an explicitly unspecified stereocenter.

:::: reaction
id: aluminum-oxide-skeletal
number: true
caption: Skeletal equation with explicitly unspecified coefficients
----
? Al + ? O2 -> ? Al2O3
::::

:::: structure
id: phenethyl-fragment
number: true
caption: Fragment with attachment point and unspecified stereochemistry
----
- atom: c2
  element: C
  at: [0.0, 0.0]
  stereo: unspecified
- atom: a1
  attach: "*"
  at: [1.2, 0.7]
- atom: c1
  element: C
  at: [-1.2, -0.7]
- atom: h1
  element: H
  at: [-0.9, 1.3]
- atom: r1
  element: C
  at: [2.47, -0.78]
- atom: r2
  element: C
  at: [3.51, -1.38]
- atom: r3
  element: C
  at: [3.51, -2.58]
- atom: r4
  element: C
  at: [2.47, -3.18]
- atom: r5
  element: C
  at: [1.43, -2.58]
- atom: r6
  element: C
  at: [1.43, -1.38]
- bond:
  from: c2
  to: a1
  order: 1
- bond:
  from: c2
  to: c1
  order: 1
- bond:
  from: c2
  to: h1
  order: 1
- bond:
  from: c2
  to: r1
  order: 1
- bond:
  from: r1
  to: r2
  order: aromatic
- bond:
  from: r2
  to: r3
  order: aromatic
- bond:
  from: r3
  to: r4
  order: aromatic
- bond:
  from: r4
  to: r5
  order: aromatic
- bond:
  from: r5
  to: r6
  order: aromatic
- bond:
  from: r6
  to: r1
  order: aromatic
::::

// Omitted: a simple formula where charge and isotope are simply absent. This is distinct from specifying their absence.

:::: formula
id: water
number: true
----
H2O
::::
