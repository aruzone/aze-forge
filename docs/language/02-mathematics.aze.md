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

The deepest supported form binds a continuous and a discrete variable at once
and mixes a root, a fraction, and a piecewise branch.

:::: equation
id: hybrid-mode-weight
number: true
align: left
----
integral x=0..L of (sqrt(x) + frac(1, 1 + x)) dx = sum k=1..n of cases(w_k x^k when k < m; 0 otherwise)
::::

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
