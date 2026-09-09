---
azemark: 2
title: Structured composition report
author: AzeForge Proto
---

# Composition report

This document exercises the structured technical content family: typed tables, algorithms, statements with proofs, and worked examples. It also demonstrates numbering and caption defaults.

:::: table
id: cooling-measurements
number: true
caption: Cooling trials, ambient held at 22 C
----
columns:
  - key: trial
    name: Trial
    type: text
  - key: start-temp
    name: Start temp
    type: quantity
    unit: K
  - key: end-temp
    name: End temp
    type: quantity
    unit: K
  - key: interval
    name: Interval
    type: quantity
    unit: s
  - key: note
    name: Observation
    type: prose
groups:
  - name: Temperature
    columns:
      - start-temp
      - end-temp
rows:
  - trial: A1
    start-temp: 344.2
    end-temp: 338.4
    interval: 300
    note: lid on
  - trial: A2
    start-temp: 344.5
    interval: 300
    note: lid off; **probe drifted late in run**
::::

:::: algorithm
id: binary-search
number: true
caption: Binary search over a sorted array
----
procedure: BinarySearch
parameters:
  - A
  - target
steps:
  - text: invariant: A is sorted ascending
  - assign: lo = 0
  - assign: hi = length(A) - 1
  - while: lo <= hi
    do:
      - assign: mid = floor((lo + hi) / 2)
      - if: A[mid] == target
        then:
          - return: mid
        else-if: A[mid] < target
        then:
          - assign: lo = mid + 1
        else:
          - assign: hi = mid - 1
  - return: -1
::::

:::: statement
id: triangle-inequality
number: true
kind: theorem
caption: Triangle inequality in the plane
----
text: |
  For any three points `A`, `B`, `C` in the Euclidean plane, the sum of
  the lengths of two sides of a triangle is at least the length of the
  third side.
proof: |
  Place the points in a coordinate system. Let `d(X, Y)` denote the
  Euclidean distance between points `X` and `Y`. Then

  :: equation
  ----
  d(A, C) <= d(A, B) + d(B, C)
  ::

  by expanding each distance via the Pythagorean identity and comparing
  the squared lengths.
::::

:::: example
id: cooling-model
number: true
caption: Deriving the exponential cooling model
----
problem: |
  Water cools from `344.2 K` to `338.4 K` in `300 s` in a `295 K` room.
  Fit Newton's law and predict the temperature at `600 s`.
givens:
  - ambient temperature held constant
  - Newton cooling law with unknown constant k
steps:
  - text: |
      Solve the law with the initial condition:

      :: derivation
      ----
      - expression: T(t) = T_amb + (T_0 - T_amb) * exp(-k * t)
        annotation: general solution
      - expression: 338.4 = 295 + 49.2 * exp(-300 * k)
        annotation: substitute the first measurement
      - expression: k = -ln((338.4 - 295) / 49.2) / 300
        annotation: solve for k
      ::
  - text: |
      Evaluate at `t = 600 s` using `k ~= 0.00334`:

      :: equation
      ----
      T(600) = 295 + 49.2 * exp(-0.00334 * 600)
      ::
result: |
  `T(600) ~= 333.1 K`. The fit uses two observations and claims nothing
  beyond them.
::::
