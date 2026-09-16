---
azemark: 2
title: Chemistry
author: [AzeForge examples]
---

# Chemistry

Formulas, reactions and structures are authored as declarations: the compiler renders what the source states and infers nothing. Three states stay distinct across this family, a value the author specified, a value the author marked explicitly unspecified, and a value the author omitted.

## Formula

A formula Block carries exactly one expression line, and its digits resolve deterministically: a leading run opens the first unit as an isotope mass, digits after an element or a group are subscript counts, digits after `·` open an adduct unit as its multiplier, and a trailing sign takes the last digit of the preceding run as the charge magnitude.

The shortest block states one composition and nothing else, leaving the charge omitted rather than written as a zero.

:::: formula
id: water
number: true
----
H2O
::::

A trailing sign closes the expression, so `Fe(CN)6·2H2O4-` is hexacyanoferrate(II) dihydrate at 4−: the charge digit is read from the end, `(CN)6` keeps its group subscript, and `2` opens the adduct as its multiplier.

:::: formula
id: ferrocyanide-hydrate
number: true
----
Fe(CN)6·2H2O4-
::::

Isotope, nesting and adduct compose in one expression: `44Ca` opens the first unit as the isotope mass, `(OH)` nests inside the lactate group, and `·5H2O` attaches five waters of crystallisation.

:::: formula
id: calcium-lactate-pentahydrate
number: true
----
44Ca(CH3CH(OH)COO)2·5H2O
::::

## Reaction

A reaction Block is one species line: a species may carry an integer coefficient and a registered `(s)`, `(l)`, `(g)` or `(aq)` state label, the arrow is one of `->`, `<-` or `<->`, and `above:` and `below:` hold the condition text drawn around the arrow. `balance: check` asserts atom and charge equality over the author's own declarations, an omitted `balance:` asserts nothing, and a `?` coefficient is explicitly unspecified, which skips the check instead of guessing a count.

The first block is a balanced equation that asserts nothing about its own counts.

:::: reaction
id: silver-chloride-precipitation
number: true
----
Ag+(aq) + Cl-(aq) -> AgCl(s)
::::

Condition text rides above and below the arrow, and the reversible arrow marks the equilibrium that the balance check goes on to verify.

:::: reaction
id: haber-equilibrium
number: true
above: 400 °C, 200 atm
below: iron catalyst
balance: check
----
N2(g) + 3 H2(g) <-> 2 NH3(g)
::::

Unknown amounts stay unknown: `?` marks each coefficient as explicitly unspecified, and the left-pointing arrow keeps the product on the left, so the block reads as aluminium oxide formed from its elements.

:::: reaction
id: aluminum-oxide-skeletal
number: true
----
? Al2O3 <- ? Al + ? O2
::::

## Structure

A structure Block is a flat list of `- atom:`, `- bond:` and `- label:` records: every atom carries authored coordinates and exactly one of `element:` or `attach:`, plus optional `charge:` and `isotope:`, and atom-level `stereo: unspecified`, while wedge and hash stereo belong to single bonds. The renderer draws what the records declare, so an omitted charge, isotope or stereo mark stays absent rather than defaulting to a value.

The smallest useful block declares three atoms, two bonds, and the drawing box its coordinates are scaled into.

:::: structure
id: water-structure
number: true
width: 320
height: 240
----
- atom: o
  element: O
  at: [0, 0]
- atom: h1
  element: H
  at: [-1.2, 0.8]
- atom: h2
  element: H
  at: [1.2, 0.8]
- bond:
  from: o
  to: h1
  order: 1
- bond:
  from: o
  to: h2
  order: 1
::::

Every fact is specified here: one carbon carries the isotope, a wedge bond marks the stereocentre, and `- label:` states the configuration as drawn text beside it.

:::: structure
id: alanine-specified
number: true
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

Deliberate absence and deliberate ambiguity both appear in this fragment: the `attach: "*"` atom bonds to chemistry outside the Block, `stereo: unspecified` marks a centre with no assigned configuration, and the ring bonds stay authored as `order: aromatic`.

:::: structure
id: phenethyl-fragment
number: true
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
