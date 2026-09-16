---
azemark: 2
title: Composition and citation
author:
  - AzeForge examples
citation-style: numeric
---

# Composition and citation

Prose reaches other parts of a document by name: `@name` points at a numbered
object or at a cited record, and the compiler resolves each name to the label
the finished document assigns. The sections below walk the whole path — the
numbering wrapper, the reference forms, the citation locators, the reference
list and the endnotes.

## Figure

A figure numbers ordinary Markdown, so a pipe table written into its body
becomes a numbered object without any further ceremony.

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

The same wrapper carries an escape-hatch diagram and leaves the nested
directive its own identity inside the figure.

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

A third figure wraps Markdown that needs a caption but no place in the figure
counter, because `number: false` consumes no counter value.

:::: figure
id: quote-panel
number: false
caption: Instrument note
----
> The readings were taken on one instrument and never re-scaled.
::::

## Prose references

An in-text reference reads as one more word of the sentence it belongs to.

See @trend-figure for the measured trend and [@knuth-1984, page 23] for the
typesetting convention.[^method]

The parenthetical form carries the same resolution without interrupting the
sentence, and a reference written before its target still resolves to the label
the target finally receives.

The wrapped flowchart resolves as [@wrapped-diagram], and @harel-1988 is
written here although the bibliography declares that record further down.

A group collects several targets in one bracket and keeps each resolved label
in authored order.

Both figures are ready for review: [@trend-figure; @wrapped-diagram].

## Citations and locators

A locator rides on a citation and on nothing else, and the numeric style
abbreviates the locator word in the rendered label.

The page locator on the typesetting convention renders beside its number as
[@knuth-1984, page 23], while the same work cited without a locator names the
whole record: [@harel-1988] reaches the paper on its own.

A chapter locator narrows a book to one part of it, and a standard takes a
section locator the same way: [@knuth-1984, chapter 3] and
[@iso-32000, section 7.5].

## Bibliography

A document declares at most one bibliography Block and a second is refused.
That Block declares the document-local reference list as ordered records from
the closed citation field set, and the rendered list appears where the
directive stands.

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
- key: harel-1988
  type: article
  title: On visual formalisms
  authors:
    - name: David Harel
      family: Harel
  year: 1988
  venue: Communications of the ACM
  pages: 514-520
- key: iso-32000
  type: standard
  title: Document management - Portable document format
  authors:
    - name: International Organization for Standardization
  year: 2008
  publisher: ISO
  edition: First edition
  note: Part 1 of the published standard.
::::

Every declared record needs at least one citation, because an uncited record
is dropped from the rendered list and reported as a warning.

## Footnotes

A footnote marker references a label defined once, and markers number in
first-reference order rather than in the order the definitions appear.

This line refers to the instrument note a second time [^method], reusing the
number its first reference assigned, and the calibration note [^calibration]
takes the next free number.

[^method]: The readings were taken on one instrument and never re-scaled.

[^calibration]: The instrument was checked against a reference standard before each run.
