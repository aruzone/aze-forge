---
azemark: 2
title: Structured technical content
author:
  - AzeForge examples
---

# Structured technical content

This document demonstrates the structured technical content family: typed
tables, algorithms, theorem-family statements and worked examples. Each section
introduces the directive, then walks from a minimal Block to the fullest form
the directive registers.

## Typed table

A typed table declares a closed column system, so every cell is validated,
canonicalized and aligned by its declared type rather than by the author's
spacing.

The first table is a small three-column record of text, integer and boolean
cells.

:::: table
id: pilot-line-yields
number: true
caption: Pilot line yields
----
columns:
  - key: batch
    name: Batch
    type: text
  - key: units
    name: Units
    type: integer
  - key: accepted
    name: Accepted
    type: boolean
rows:
  - batch: B-101
    units: 480
    accepted: true
  - batch: B-102
    units: 512
    accepted: false
  - batch: B-103
    units: 466
    accepted: true
::::

The second table mixes a `math` column, a `boolean` column and a numeric column
whose alignment overrides the type default.

:::: table
id: control-loop-gains
number: true
caption: Control loop gains and their responses
----
columns:
  - key: loop
    name: Loop
    type: text
  - key: gain
    name: Gain
    type: decimal
    align: right
  - key: response
    name: Response
    type: math
  - key: stable
    name: Stable
    type: boolean
rows:
  - loop: inner
    gain: 2.5
    response: 1 / (1 + s * tau)
    stable: true
  - loop: outer
    gain: -1.75
    response: k / (s * (s + 2))
    stable: false
::::

The third table is the fully typed form, with a column unit, a grouped header
over two adjacent columns, a missing cell and a prose cell that keeps Markdown.

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

## Algorithm

An algorithm Block holds one procedure whose statements come from a closed
six-form set and nest through the shared two-space record tree.

The first procedure is a single bounded loop that accumulates a total.

:::: algorithm
id: dot-product
number: true
caption: Dot product of two equal-length vectors
----
procedure: DotProduct
parameters:
  - A
  - B
steps:
  - assign: total = 0
  - for: i = 0 to length(A) - 1
    do:
      - assign: total = total + A[i] * B[i]
  - return: total
::::

The second procedure walks a vector backwards and resolves each element through
an `if`/`else-if`/`else` ladder, opened by an authored invariant line.

:::: algorithm
id: classify-deviations
number: true
caption: Classify deviations against tolerance bands
----
procedure: ClassifyDeviations
parameters:
  - deviations
  - tolerance
steps:
  - text: invariant: tolerance is non-negative
  - for: k = length(deviations) - 1 downto 0
    do:
      - if: abs(deviations[k]) <= tolerance
        then:
          - assign: verdict[k] = accept
        else-if: abs(deviations[k]) <= 2 * tolerance
        then:
          - assign: verdict[k] = rework
        else:
          - assign: verdict[k] = scrap
  - return: verdict
::::

The third procedure is the reference search, with an invariant line, a `while`
carrying an `if` ladder and an early return.

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

## Statement

A statement Block carries one closed `kind:` from the theorem family, the
authored text and, when the form admits one, a proof whose QED mark the
renderer derives.

The first statement is a definition, the only form that carries no proof.

:::: statement
id: trace-definition
number: true
kind: definition
caption: Trace of a square matrix
----
text: |
  The trace of a square matrix `M` is the sum of its diagonal entries,
  written `tr(M)`.
::::

The second statement is a lemma whose proof nests an equation Block.

:::: statement
id: even-sum-lemma
number: true
kind: lemma
caption: The sum of two even integers is even
----
text: |
  For any two even integers `m` and `n`, the sum `m + n` is even.
proof: |
  Write `m = 2 a` and `n = 2 b` for integers `a` and `b`, then collect the
  common factor:

  :: equation
  ----
  m + n = 2 a + 2 b = 2 (a + b)
  ::

  which exhibits `m + n` as twice the integer `a + b`.
::::

The third statement is the plane triangle inequality, whose proof ends in the
renderer-derived QED mark.

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
  abs(A - C) <= abs(A - B) + abs(B - C)
  ::

  by expanding each distance via the Pythagorean identity and comparing
  the squared lengths.
::::

## Worked example

A worked example composes a problem, its givens, ordered steps and a result
into one numbered object.

The first example answers its question in a single text step.

:::: example
id: molar-dilution
number: true
caption: Diluting a stock solution to a working concentration
----
problem: |
  A `2.0 mol/L` stock solution must become `250 mL` at `0.05 mol/L`.
givens:
  - stock concentration 2.0 mol/L
  - working concentration 0.05 mol/L
  - working volume 250 mL
steps:
  - text: |
      The dilution relation `C1 V1 = C2 V2` solves directly for the stock
      volume, so `V1 = (0.05 * 250) / 2.0 = 6.25 mL`.
result: |
  Measure `6.25 mL` of stock and dilute it to `250 mL`.
::::

The second example nests an equation Block inside its single step, so the
mathematics is composed rather than restated in prose.

:::: example
id: pendulum-period
number: true
caption: Period of a small-amplitude pendulum
----
problem: |
  A pendulum of length `1.2 m` swings with a small amplitude. Find its period.
givens:
  - length 1.2 m
  - gravitational acceleration 9.81 m/s^2
  - small-amplitude regime
steps:
  - text: |
      The period depends only on the length and the gravitational
      acceleration:

      :: equation
      ----
      T = 2 * pi * sqrt(L / g)
      ::

      Substituting the givens evaluates the period.
result: |
  `T ~= 2.20 s`.
::::

The third example is the full derivation, whose two steps compose a three-step
derivation Block and an equation Block.

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
