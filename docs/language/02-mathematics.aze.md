---
azemark: 2
title: Mathematics notation examples
author:
  - AzeForge examples
---

# Mathematics notation examples

Equations and derivations share one readable mathematics grammar, so the same
spellings appear in either directive. This document starts from the smallest
relation, adds bound variables, and closes with derivations whose annotations
stay prose rather than mathematics.

## Equation

The `equation` directive typesets one readable expression, and numbers or
aligns it without any markup of its own.

The simplest form is a single relation with no numbering.

:::: equation
id: ohm-relation
----
V = I * R
::::

Greek names, subscripts, and superscripts pass through unchanged in a counted
expression.

:::: equation
id: sample-variance
number: true
syntax: readable
----
sigma^2 = frac(1, n) sum i=1..n of (x_i - mu)^2
::::

Multi-index subscripts carry tensor indices in one subscript group, and the
physics symbols read as registered names.

:::: equation
id: field-equation-form
----
G_(mu, nu) = R_(mu, nu) - 1 / 2 R g_(mu, nu)
::::

A bracketed operator is one group under the same grammar, so Hamiltonians and
commutators keep their square delimiters in the rendered artifact, and a
comma inside a group lists arguments in evaluation order.

:::: equation
id: bracketed-hamiltonian
----
i hbar frac(partial, partial t) Psi(r, t) = [-frac(hbar^2, 2 m) nabla^2 + V(r, t)] Psi(r, t)
::::

A dense scalar form binds continuous and discrete variables in one relation and
mixes a root, a fraction and a piecewise branch.

:::: equation
id: hybrid-mode-weight
number: true
align: left
----
integral x=0..L of (sqrt(x) + frac(1, 1 + x)) dx = sum k=1..n of cases(w_k x^k when k < m; 0 otherwise)
::::

### Native notation grammar

Readable mathematics is a closed expression grammar, not LaTeX with the
backslashes removed. Operators have fixed precedence. Parentheses and square
brackets group expressions. A relation may form a left-to-right chain.

Registered symbols include lower and upper Greek names and physics names such
as `hbar`, `partial`, `nabla`, `infinity` and `emptyset`. One base may carry a
subscript, a power, or up to two primes. Put the base in parentheses before
combining those forms, as in `(x')^2`.

This Schrödinger relation combines registered symbols, grouped function
arguments, a square-bracket group, a fraction, derivatives and a relation
chain.

:::: equation
id: schrodinger-relation-chain
number: true
----
i hbar frac(partial, partial t) Psi(x, t) = [-frac(hbar^2, 2 m) nabla^2 + V(x)] Psi(x, t) = -frac(hbar^2, 2 m) frac(partial^2 Psi, partial x^2) + V(x) Psi(x, t)
::::

Function-like constructs use fixed names and argument shapes. The grammar
registers `frac`, `sqrt`, `root`, `abs`, `vector`, `matrix`, `pmatrix`,
`vmatrix` and `cases`. Matrix rows are bracket groups. A one-item `vector` is
an arrow vector, while a multi-item `vector` is a bold tuple.

:::: equation
id: rotation-matrix-vector
number: true
----
y_i = R_(i, j) x_j = pmatrix [[cos theta, -sin theta], [sin theta, cos theta]] vector [x, y] = vector [x cos theta - y sin theta, x sin theta + y cos theta]
::::

The binder forms are `sum`, `product`, `integral`, `limit`, `forall` and
`exists`. A bounded sum, product or integral writes `name=from..to`, then `of`,
then its body. An integral closes with a differential whose one-letter name
matches the bound name. A quantifier writes `name in set of body`.

:::: equation
id: binder-catalog
align: left
----
S_n = sum i=1..n of i^2 + product k=1..m of k + integral x=0..infinity of exp(-x^2) dx
::::

Quantifiers may nest. Set relations and operations include `in`, `notin`,
`subset`, `supset`, `subseteq`, `union`, `intersect` and `equiv`.

:::: equation
id: nested-quantifiers
----
forall e in R of exists M in R of (abs(x) <= M)
::::

Registered aliases are reserved and cannot become identifiers. Unknown
two-letter words are read as juxtaposed one-letter names, while unknown words
of three or more letters are diagnostics. This keeps a typo from silently
turning into a new function name.

## Derivation

A `derivation` holds ordered `- expression:` steps, each optionally followed by
an indented `annotation:` line of plain prose, and the renderer aligns the
expressions as one chain.

Two steps are enough to show how a chain reads.

:::: derivation
id: compound-interest-chain
----
- expression: A_1 = P_0 (1 + r)
- expression: A_n = P_0 (1 + r)^n
::::

Every step may carry an annotation, and `align` moves the column the relations
sit in.

:::: derivation
id: enzyme-rate-linearized
number: true
align: center
----
- expression: v = k_2 E_0 S / (K_m + S)
  annotation: steady-state rate before any rearrangement
- expression: v (K_m + S) = k_2 E_0 S
  annotation: clear the denominator
- expression: frac(K_m + S, S) = frac(k_2 E_0, v)
  annotation: collect the rate on one side
- expression: 1 / v = frac(K_m, k_2 E_0) (1 / S) + frac(1, k_2 E_0)
  annotation: invert both sides, and the reciprocal rate is affine in the reciprocal substrate
::::

A long chain finishes by taking a limit, which is where the prose of an
annotation stays visibly outside the mathematics.

:::: derivation
id: annuity-present-value
number: true
----
- expression: V_0 = sum i=1..n of C / (1 + r)^i
  annotation: present value as a bounded sum of discounted payments
- expression: V_0 = C / (1 + r) sum i=0..n-1 of (1 + r)^(-i)
  annotation: shift the index and factor out the first payment
- expression: S = sum i=0..n-1 of q^i
  annotation: name the geometric factor q = 1 / (1 + r)
- expression: S - q S = 1 - q^n
  annotation: subtract the shifted copy of the same sum
- expression: S = (1 - q^n) / (1 - q)
  annotation: divide by 1 - q, which is nonzero for every positive rate
- expression: limit n->infinity of V_0 = C / r
  annotation: the tail vanishes only while abs(q) < 1, stated here in prose
::::
