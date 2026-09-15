---
azemark: 2
title: Composition forms
author: AzeForge Proto
citation-style: numeric
---

# Composition forms

A report can reference a later object and cite a source at a specific page.
The reference resolves to the final number, and the citation carries its
locator into the rendered label.

See @trend-figure for the measured trend and [@knuth-1984, page 23] for the
typesetting convention.[^method]

## Numbered content

:::: figure
id: trend-figure
number: true
caption: Measured trend
----
The figure body holds ordinary Markdown, so an image or a pipe table becomes
numberable by wrapping it here.

| Step | Value |
| --- | ---: |
| 1 | 12 |
| 2 | 15 |
::::

A wrapped Mermaid diagram keeps its own identity as well:

:::: figure
id: wrapped-diagram
number: true
caption: Wrapped flowchart
----
  :: mermaid
  id: inner-flowchart
  ----
  flowchart LR
    a[Input] --> b[Output]
  ::
::::

:::: table
id: trial-table
number: true
caption: Trial summary
----
columns:
  - key: trial
    name: Trial
    type: text
  - key: reading
    name: Reading
    type: decimal
    align: center
rows:
  - trial: A1
    reading: 344.2
  - trial: A2
    reading: 344.5
::::

:::: algorithm
id: accumulate
number: true
caption: Accumulate
----
procedure: Accumulate
parameters:
  - values
steps:
  - assign: total = 0
  - for: i = 0 to length(values) - 1
    do:
      - assign: total = total + values[i]
  - return: total
::::

:::: statement
id: sum-bound
number: true
kind: lemma
caption: A bounded sum
----
text: |
  The accumulator never exceeds the sum of the authored values.
proof: |
  Each step adds one authored `values[i]` exactly once:

  :: equation
  ----
  T_n = sum i=1..n of v_i
  ::

  By induction on `n` the accumulator equals that partial sum.
::::

:::: example
id: worked-total
number: true
caption: Worked total
----
problem: |
  Total the readings `12` and `15`.
givens:
  - the readings are exact decimals
steps:
  - text: |
      Add the two readings:

      :: equation
      ----
      12 + 15 = 27
      ::
result: |
  The total is `27`.
::::

## Reference list

:::: bibliography
----
- key: knuth-1984
  type: book
  title: The TeXbook
  authors:
    - name: Donald E. Knuth
      family: Knuth
  year: 1984
  publisher: Addison-Wesley
::::

[^method]: The readings were taken on one instrument and never re-scaled.
