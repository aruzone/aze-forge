# Native plugin family tree

This document tracks implementation progress for AzeForge's approved native Technical object families. It keeps the capability tree from the [alpha Technical object catalog](https://github.com/aruzone/aze-forge/issues/51#issuecomment-5560416403) visible while implementation proceeds. A branch in this document is roadmap scope, not a claim that the current package implements it. Run `azeforge capabilities --json` for the package's supported plugins and renderers.

A native capability uses controlled AzeMark declarations, retains its domain meaning in the Document, reports domain-specific diagnostics, and previews or exports through the supported Artifact formats. Backend-source-only rendering is an escape hatch, not native coverage.

## Family tree

- Mathematics
  - Equations
  - Aligned derivations
  - Matrices
  - Cases
  - Calculus
  - Sets and relations
  - Scalar expressions, Greek symbols, fractions, roots, powers and subscripts
  - Common functions, sums, products, limits, integrals, derivatives, and vectors
  - Equation-step annotations
- Plots and data charts
  - Two-dimensional Cartesian function plots
  - Authored numeric series
  - Line, scatter, grouped bar, stacked bar, histogram, and error-bar charts
  - Multiple series, labels, legends, linear or logarithmic axes, explicit domains, and unit labels
  - Bounded deterministic mathematical-expression evaluation
- Geometry
  - Points, lines, segments, rays, circles, arcs, and polygons
  - Intersections, midpoints, parallel and perpendicular constructions
  - Angle and length annotations
  - Equal-length and right-angle marks
- General diagrams
  - Flowcharts
  - Directed and undirected labeled graphs
  - Trees
  - System architecture diagrams
  - Named nodes, standard shapes, groups, hierarchy, flow direction, and bounded layout hints
- Software and data models
  - Sequence diagrams with participants, ordered messages, activations, notes, alternatives, and loops
  - State machines with initial and final states, authored transition guards and actions, and nested states
  - Entity relationships with attributes, keys, optionality, and cardinality
  - Bounded class diagrams with attributes, operations, inheritance, association, aggregation, composition, and multiplicity
- Circuits
  - Instructional analog schematics with explicit terminal-to-node bindings
    - Resistors, capacitors, inductors, sources, diodes and LEDs, switches, dependent sources, op-amps, BJTs, and MOSFETs
  - Instructional digital schematics with explicit terminal-to-node bindings
    - AND, OR, NOT, NAND, NOR, XOR, and XNOR gates
    - Buffers, multiplexers, D flip-flops, and named digital input/output terminals
  - Both IEC and ANSI symbol conventions
  - Floating circuits remain valid. Unused nodes and disconnected component-bearing subgraphs warn.
  - [Implemented in Circuit PR #81](https://github.com/aruzone/aze-forge/pull/81). The detailed contract is in [issue #62](https://github.com/aruzone/aze-forge/issues/62#issuecomment-5583447148).
- Digital timing
  - Clock and single-bit signals
  - High, low, unknown, and high-impedance states
  - Labeled bus values, repeated intervals, signal groups, markers, and timing relationships
  - Shared cycle scale or explicit time scale
- Chemistry
  - Formulas with subscripts, charges, and isotopes
  - Reactions with coefficients, arrows, conditions, and state labels
  - Two-dimensional molecular structures with atoms, bonds, rings, aromatic notation, charges, isotope labels, and supplied stereochemistry
  - Explicitly unspecified stereochemistry and labeled attachment points for partial structures
  - No inferred completion of partial structures
- Engineering diagrams
  - Control-system blocks, summing junctions, takeoff points, labeled signals, and feedback connections
  - Two-dimensional free-body diagrams with simple bodies, force vectors, moments, axes, dimensions, and angle annotations
- Structured technical content
  - Typed tables with declared column types, units, missing values, and grouped headers
  - Algorithms and pseudocode with procedures, assignments, branches, loops, and return statements
  - Theorem, definition, and lemma statements with optional authored proofs
  - Worked examples with problem, givens, ordered steps, and result

## Shared document composition

These capabilities apply across the tree. They are composition features, not additional Technical object families.

- Object captions
- Stable identifiers
- Automatic numbering and cross-references
- Footnotes
- Document-local bibliography records with numeric and author-year citations and locators

## Boundaries

The approved roadmap defers 3D scenes, CAD, simulation, executable notebooks, automatic solving, journal templates, indexes, slide decks, and poster layout. Family-specific deferrals remain part of the [catalog decision](https://github.com/aruzone/aze-forge/issues/51#issuecomment-5560416403).

Bounded Mermaid support and the host-gated KaTeX-compatible math variant are escape hatches. Neither counts toward native coverage. Unsupported native capabilities must report a clear diagnostic rather than silently fall back to a backend language.
