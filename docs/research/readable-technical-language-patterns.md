# Survey: readable technical-language patterns

Research note for [Survey readable technical-language patterns](https://github.com/aruzone/aze-forge/issues/47),
on the [AzeMark comprehensive alpha route](https://github.com/aruzone/aze-forge/issues/44).

**Question.** Which conventions in primary specifications and official documentation
for readable mathematical, diagram, plotting, geometry, chemistry, circuit, and
structured-document languages best reduce author complexity while preserving
deterministic parsing, explicit semantics, inspectability, and useful diagnostics?

**Scope.** Cited comparison of reusable patterns and traps for AzeMark.
External-language facts are evidence, not AzeMark requirements. The application
paragraphs and synthesis propose candidates for later owner-approved decisions.
Existing AzeForge contracts remain binding unless a decision explicitly replaces
them. This corrected revision withdraws the original survey's unsupported mandates.
Vocabulary follows `CONTEXT.md` (Source, Document, Block, Technical object,
Plugin, Block renderer, Renderer, Fragment, Artifact, Content hash, Circuit,
Circuit component, Circuit node, Terminal–node relation, Golden report,
Pilot Circuit fixture, Acceptance catalog).

**Method.** Primary specifications and official documentation only.
Every external claim below links directly to the source that owns it.

The six review corrections and their downstream decision owners are indexed in
section 10. Implementation tickets must cite those corrections and the eventual
owner-approved decisions rather than importing external-language behavior wholesale.

---

## 1. Structured documents: CommonMark, MyST, reStructuredText, Jekyll front matter

### 1.1 Readability as the overriding goal (CommonMark)

Markdown's stated overriding design goal is that "a Markdown-formatted document
should be publishable as-is, as plain text, without looking like it's been marked
up with tags or formatting instructions", with nesting made apparent to the eye in
the Source itself via indentation rather than explicit continuation markers
([CommonMark spec 0.31.2, introduction](https://spec.commonmark.org/0.31.2/)).
The same spec is candid about the cost of ambiguity: because "nothing in Markdown
counts as a 'syntax error'", divergences between implementations often are not
discovered right away
([CommonMark spec 0.31.2, introduction](https://spec.commonmark.org/0.31.2/)).

To counter that, the spec ships many side-by-side Markdown/HTML examples that
"are intended to double as conformance tests", runnable against any implementation
with the accompanying `spec_tests.py`
([CommonMark spec 0.31.2, introduction](https://spec.commonmark.org/0.31.2/)).

**Candidate application.** Examples can expose ambiguous nesting and parser
disagreements before syntax is frozen. CommonMark's permissive parsing is not
itself a failure: its conformance examples specify how ambiguous input is handled.
For typed AzeMark declarations, compare permissive recovery with explicit
diagnostics without changing ordinary Markdown behavior.

### 1.2 Directive anatomy: name, arguments, options, content (MyST)

MyST is a superset of CommonMark that adds block-level **directives** and inline
**roles** ([MyST syntax overview](https://mystmd.org/guide/syntax-overview)).
Directives are multi-line containers with four distinct slots: identifier,
arguments (words after the name), options, and content
([MyST syntax overview](https://mystmd.org/guide/syntax-overview)).
Three conventions stand out:

- **Fence matches payload.** Colon fences (`:::`) are for Markdown content and
  degrade gracefully in renderers without MyST support; backtick fences
  (`` ``` ``) are for code-like content such as math or diagrams and protect
  against auto-formatters
  ([MyST syntax overview](https://mystmd.org/guide/syntax-overview)).
- **Three spellings for options.** `:key: value` pairs, a `---`-delimited YAML
  block, or inline options — the same information model in three authoring
  postures ([MyST syntax overview](https://mystmd.org/guide/syntax-overview)).
- **Additive nesting and graceful unknowns.** Nesting adds fence characters;
  unknown roles still parse rather than breaking the Document
  ([MyST syntax overview](https://mystmd.org/guide/syntax-overview)).

**Candidate application.** MyST's four-slot anatomy is one envelope design to
compare with AzeMark's existing directives. Positional arguments and multiple
fence styles add flexibility but also more forms to learn and normalize.
The language-contract decision owns that tradeoff. Unknown AzeMark Block types
already require diagnostics naming available alternatives; parsing recovery does
not authorize rendering an invalid Document.

### 1.3 One explicit-block marker (reStructuredText)

In reStructuredText, all explicit markup blocks (footnotes, targets, directives,
comments) begin with the same two-periods-and-space marker; a directive is
`.. name::` and options arrive as field lists (`:field:`) inside
([reStructuredText markup specification](https://docutils.sourceforge.io/docs/ref/rst/restructuredtext.html#directives)).
Indentation alone signals block quotes, definitions, and nested content, tabs are
converted to spaces with a configurable `tab_width`, and literal blocks are
introduced by `::`
([reStructuredText markup specification](https://docutils.sourceforge.io/docs/ref/rst/restructuredtext.html#directives)).

**Reusable for AzeMark.** A single recognizable Block opener keeps "easy for
parsers and humans to identify" true as the catalog grows. Whatever the opener,
whitespace policy (tabs, indentation significance) must be specified, not
inherited by accident.

### 1.4 Front matter envelope (Jekyll)

A file is processed as special when it starts with valid YAML between
triple-dashed lines; the front matter must be the first thing in the file, may
define custom variables alongside predefined ones, and even an empty block still
triggers processing ([Jekyll front matter docs](https://jekyllrb.com/docs/front-matter/)).
Repeated variables are factored out into front-matter defaults rather than
restated ([Jekyll front matter docs](https://jekyllrb.com/docs/front-matter/)).

**Candidate application.** Front-matter defaults could reduce repeated per-Block
options, but inheritance adds precedence and diagnostic rules. Compare explicit
Source values, versioned built-in defaults, and bounded inherited defaults in the
language-contract decision; this survey does not schedule a defaults mechanism.

---

## 2. Readable math: AsciiMath, Typst, KaTeX, MathML Core

### 2.1 Symbols that look like what they mean (AsciiMath)

AsciiMath is a markup language whose "symbols attempt to mimic in text what they
look like rendered, like `oo`", requires no preceding backslash, and still
offers TeX alternatives ([AsciiMath homepage](http://asciimath.org/)). Greek
letters are plain names (`alpha`, `Beta`), operations are ASCII approximations
(`<=`, `->`, `~~`), and text/font switches are explicit (`"hi"`, `bb`, `cc`)
([AsciiMath homepage](http://asciimath.org/)).

**Reusable for AzeMark.** The blueprint's readable ASCII aliases
(`integral x=0..1 of expr dx`, `sum i=1..n of expr`) follow exactly this
convention: shorthands approximate the glyph, words name the operator, and raw
backend syntax stays available but secondary.

### 2.2 Spacing and implicit rules carry meaning — document them or drop them (Typst)

Typst math is delimited by `$`, and a formula "will be typeset into [its] own
block if [it] start[s] and end[s] with at least one space (e.g. `$ x^2 $`)"
([Typst math docs](https://typst.app/docs/reference/math/)). Single letters
render as-is while multiple letters "are interpreted as variables and
functions", with quotes required for verbatim words
([Typst math docs](https://typst.app/docs/reference/math/)). Alignment points
(`&`) alternate right/left-aligned columns, and math calls support 2-D argument
lists where `;` merges comma-separated groups into arrays
([Typst math docs](https://typst.app/docs/reference/math/)). For accessibility,
equations take an explicit natural-language `alt` parameter today; automatic
descriptions are future work
([Typst math docs](https://typst.app/docs/reference/math/)).

**Candidate application.** Typst exposes two questions for the language contract:
whether whitespace should carry meaning, and how names differ from literal text.
Its `alt` field is a precedent for owner-supplied equation descriptions.
The selected object schemas and acceptance decision must determine AzeMark's
description requirements; the survey does not add a new field.

### 2.3 Publish the coverage boundary (KaTeX)

KaTeX maintains both a function-grouped supported-functions list and an
alphabetical support table that "lists both supported and un-supported
functions" ([KaTeX supported functions](https://katex.org/docs/supported.html)).
Display-only environments additionally render outside math delimiters via the
auto-render extension ([KaTeX supported functions](https://katex.org/docs/supported.html)).

**Candidate application.** A per-construct coverage table could give authors and
diagnostics one supported/unsupported boundary. The catalog decision owns that
inventory; readable native syntax and bounded escape hatches remain the map's
approved direction.

### 2.4 An explicit browser-rendering subset: MathML Core

MathML Core defines a subset suitable for browser implementation. Its introduction
focuses on precise visual rendering rules, browser integration, and automated tests
([MathML Core introduction](https://w3c.github.io/mathml-core/#introduction)).
The abstract's statement about capturing structure and content describes MathML
generally, not a guarantee that MathML Core supplies a domain-semantic expression
model.

**Candidate application.** Explicit subsetting and conformance tests are useful
precedents for sizing each Technical object. AzeForge's renderer-independent
Document remains its own contract; MathML rendering does not replace that model.

---

## 3. Diagrams: Mermaid flowcharts, Graphviz DOT

### 3.1 Separate identity from label; declare layout hints (Mermaid)

Mermaid flowcharts compose **nodes** (shapes) and **edges**, allow the displayed
text to differ from the node id (last definition wins), and declare orientation
explicitly (`TD`, `LR`, …)
([Mermaid flowchart syntax](https://mermaid.js.org/syntax/flowchart.html)).
When the shape catalog grew, Mermaid added a general `A@{ shape: rect }`
mechanism with a semantic-name/short-name/alias table rather than extending
one-off syntax per shape
([Mermaid flowchart syntax](https://mermaid.js.org/syntax/flowchart.html)).
Two documented traps: lowercase `end` inside a flowchart node breaks parsing, and
a leading `o`/`x` in a connection creates circle/cross edge terminators instead
of plain links
([Mermaid flowchart syntax](https://mermaid.js.org/syntax/flowchart.html)).

**Candidate application.** Separate node identity from displayed labels and compare
general shape properties with specialized syntax. Reserved identifiers need a
documented quoting or naming policy. Authored layout intent must not be confused
with electrical meaning: the approved
[Circuit semantic model and validation](https://github.com/aruzone/aze-forge/issues/11#issuecomment-5543076289)
retains `layout.flow`, optional component orientation, and declaration order in
Document data. Order enters `contentHash` and may break layout ties; none of these
fields creates or changes terminal connectivity. Renderer-generated coordinates
remain distinct from authored intent.

### 3.2 Grammar first; layout is not semantics (Graphviz DOT)

DOT is specified as an abstract grammar with terminals, nonterminals, and
optionality/grouping notation
([DOT language](https://graphviz.org/doc/info/lang.html)). Notable conventions:

- IDs come in four spellings (bare, numeral, double-quoted, HTML string) "with
  no semantic difference" between quoted and unquoted forms; keywords are
  case-independent; `;` and `,` aid readability but are not required; C++-style
  comments and `#` preprocessor lines are accepted
  ([DOT language](https://graphviz.org/doc/info/lang.html)).
- Directed graphs use `->`, undirected `--`, and `strict` forbids multi-edges
  so repeat statements merge attributes into one edge
  ([DOT language](https://graphviz.org/doc/info/lang.html)).
- Subgraphs have three roles: structural grouping (with edge shorthand
  `A -> {B C}` expanding to two edges), attribute-default context, and — only
  by the `cluster`-name convention honored by some layout engines — visual
  clustering. Cluster membership is explicitly "not part of the DOT language,
  but solely a syntactic convention"
  ([DOT language](https://graphviz.org/doc/info/lang.html)).
- Defaults inherit forward in time: objects inherit defaults set before them,
  and "a subgraph receives the attribute settings of its parent graph at the
  time of its definition", so a root label would leak into subgraphs unless
  definition is deferred
  ([DOT language](https://graphviz.org/doc/info/lang.html)).
- DOT assumes UTF-8 by default with a `charset` override, and HTML entities
  (`&beta;`) as an ASCII-safe fallback for labels
  ([DOT language](https://graphviz.org/doc/info/lang.html)).

**Candidate application.** DOT's grammar makes its alternatives and inheritance
rules inspectable. For AzeMark, compare scoped defaults and explicit values rather
than copying temporal inheritance. Layout hints can remain authored Document data
without defining connectivity. Encoding overrides and entity spellings are
external examples, not additions to AzeMark's Source contract.

---

## 4. Plots: Vega-Lite, matplotlib

### 4.1 Defaults with override; compile to a complete lower spec (Vega-Lite)

Vega-Lite is "a higher-level grammar for visual analysis that generates complete
Vega specifications" ([vega/vega-lite README](https://github.com/vega/vega-lite)).
Specifications map data variables to visual encoding channels, and the compiler
"produces default values for visualization components (e.g., scales, axes, and
legends) … using a rule-based approach, but users can explicit[ly] specify these
properties to override default values"
([Vega-Lite view specification](https://vega.github.io/vega-lite/docs/spec.html)).

**Candidate application.** Named data-to-channel mappings with rule-based defaults
could reduce plot boilerplate. The plot decision must distinguish semantic data,
authored presentation intent, and renderer-derived scales or geometry before
assigning responsibility. Vega-Lite's lower rendering specification is an analogy
for a compilation stage, not a replacement for AzeForge's Plugin/Renderer boundary.

### 4.2 Name the composition hierarchy; offer two interfaces honestly (matplotlib)

Matplotlib documents a strict containment hierarchy: a **Figure** (the whole)
contains **Axes** (plot regions with scales), which contain **Axis** objects
(ticks via Locator, labels via Formatter) and **Artists** (everything visible);
an Artist "cannot be shared by multiple Axes, or moved from one to another"
([Matplotlib quick start](https://matplotlib.org/stable/users/explain/quick_start.html)).
It offers two interfaces with stated tradeoffs — explicit object-oriented style
vs implicit pyplot state machine — recommending OO "particularly for
complicated plots, and functions and scripts that are intended to be reused",
pyplot "for quick interactive work", and strongly deprecating the old `pylab`
flat interface
([Matplotlib quick start](https://matplotlib.org/stable/users/explain/quick_start.html)).
Plotting functions also accept a `data` keyword so string-indexable objects
(dicts, data frames) can be referenced by variable name
([Matplotlib quick start](https://matplotlib.org/stable/users/explain/quick_start.html)).

**Candidate application.** Matplotlib illustrates why ownership should be explicit,
but its containment hierarchy is not AzeForge's model. A Document contains semantic
Blocks. A Block renderer consumes validated Block data and produces an opaque
Fragment owned by the document Renderer, as required by
[ADR 0003](../adr/0003-separate-plugins-from-renderers.md).
Fragments are not children of Blocks and do not enter the public Document, its
schema, or its content hash. Data-by-name and explicit versus convenience plot
forms remain candidates for the plot and language decisions.

---

## 5. Geometry: Asymptote

### 5.1 Coordinate framework, explicit path operators, deferred layout (Asymptote)

Asymptote is "a powerful descriptive vector graphics language that provides a
mathematical coordinate-based framework for technical drawing", typesets labels
with LaTeX "for overall document consistency", and targets PostScript, PDF,
SVG, WebGL, and ImageMagick formats from one Source
([Asymptote description](https://asymptote.sourceforge.io/doc/Description.html)).
It pairs a script language with a GUI that moves script-generated objects, and
resolves "overall size constraint issues between fixed-sized objects (labels
and arrowheads) and objects that should scale with figure size" via deferred
drawing using the simplex method
([Asymptote description](https://asymptote.sourceforge.io/doc/Description.html)).
Paths use explicit operators: `--` for straight segments, `..` for cubic
splines, `..cycle` for smooth cyclic closure, and `^^` to group disconnected
paths without drawing between them; a connected path is defined as equivalent
to a PostScript subpath
([Asymptote paths tutorial](https://asymptote.sourceforge.io/doc/Paths.html)).
Domain coverage arrives as in-language modules, including a `geometry` module
with "an extensive set of geometry routines, including `perpendicular` symbols
and a `triangle` structure"
([Asymptote geometry module](https://asymptote.sourceforge.io/doc/geometry.html)).

**Candidate application.** Compare named constructions, coordinate-based input,
and a bounded combination for the chosen geometry subset. Named constraints may
reduce manual placement; coordinates can preserve exact data or intentional
diagrams without requiring a general constraint solver. Asymptote supplies
precedents for coordinates and deferred sizing, not evidence for banning author
coordinates. The geometry decision owns allowed inputs and layout limits.
Fixed label sizes, scaling, and deterministic output need acceptance scenarios
under whichever approach the owner approves.

---

## 6. Chemistry: SMILES, InChI

### 6.1 Accept many, canonicalize to one; partial specification is allowed (SMILES)

SMILES is "a linguistic construct, rather than a computer data structure", "a
true language, albeit with a simple vocabulary (atom and bond symbols) and only
a few grammar rules"
([Daylight SMILES theory](https://www.daylight.com/dayhtml/doc/theory/theory.smiles.html)).
Its economy comes from principled omission: "SMILES notation consists of a
series of characters containing no spaces"; hydrogens are normally implied from
normal valences; single/aromatic bonds may be omitted
([Daylight SMILES theory](https://www.daylight.com/dayhtml/doc/theory/theory.smiles.html)).
Only the organic subset (B, C, N, O, P, S, halogens…) may appear unbracketed;
everything else — and any non-normal valence, charge, or hydrogen count — must
use brackets where "any attached hydrogens and formal charges must always be
specified" ([Daylight SMILES theory](https://www.daylight.com/dayhtml/doc/theory/theory.smiles.html)).
Five encoding rules cover atoms, bonds, branches (parentheses), ring closures
(reusable digits, `%` prefix past 10), and disconnection via `.`
([Daylight SMILES theory](https://www.daylight.com/dayhtml/doc/theory/theory.smiles.html)).
Three further conventions matter:

- **Information content and canonical spelling are separate axes.** Generic SMILES
  describes the labeled graph without isotope/chirality information; its canonical
  form is unique SMILES. Isomeric SMILES carries isotope/chirality specifications;
  its canonical form is absolute SMILES. Isomeric does not itself mean canonical.
  Thus generic → unique and isomeric → absolute are distinct normalization paths,
  not a generic → unique → absolute enrichment pipeline. Missing chirality cannot
  be recovered by canonicalization
  ([Daylight SMILES theory, §3.1](https://www.daylight.com/dayhtml/doc/theory/theory.smiles.html)).
- **Local, order-dependent chirality.** `@`/`@@` list neighbors
  anticlockwise/clockwise *in SMILES order*, so meaning is tied to string order
  and "the Daylight software is responsible for retaining the meaning of the
  chiral specification when the structure is modified or rearranged"
  ([Daylight SMILES theory](https://www.daylight.com/dayhtml/doc/theory/theory.smiles.html)).
  Absence of a marker means *unspecified*, and partial specifications are first
  class — critical because much real-world data has "incompletely resolved
  chiralities"
  ([Daylight SMILES theory](https://www.daylight.com/dayhtml/doc/theory/theory.smiles.html)).
- **Guarded intelligence.** Aromaticity is deduced by an extended Hückel rule
  from either aromatic or Kekulé input, but impossible inputs (e.g. `c1cccc1`,
  which no bond assignment can satisfy) are flagged as impossible
  ([Daylight SMILES theory](https://www.daylight.com/dayhtml/doc/theory/theory.smiles.html)).
  Reaction SMILES extend the grammar with exactly two `>` separators
  (`reactant > agent > product`), and atom maps (`[CH3:2]`) are explicitly
  "arbitrary class designations" that may be partial and are renumbered on
  canonicalization
  ([Daylight SMILES theory](https://www.daylight.com/dayhtml/doc/theory/theory.smiles.html)).

**Candidate application.** Distinguish information completeness from canonical
spelling. If chemistry enters the catalog, normalization must retain specified
isotopes and chirality and preserve unspecified attributes as unspecified.
For example, unspecified alanine chirality cannot become either specified
enantiomer through formatting; the two specified enantiomers cannot collapse
to the same semantic identity. Equivalence rules and the canonicalization
algorithm/version need an explicit contract. Omission, aromaticity, and validation
policies remain chemistry decisions, not rules inferred from other domains.

### 6.2 Machine identity is layered, fixed, and explicitly not readable (InChI)

InChI is "a structure-based chemical identifier" whose identifiers "describe
chemical substances in terms of layers of information — the atoms and their
bond connectivity, tautomeric information, isotope information,
stereochemistry and electronic charge", while "the InChIKey is a fixed length
(27 character) condensed digital representation … not designed to be
human-understandable"; both are open standards with open-source software
([InChI Trust, about the standard](https://www.inchi-trust.org/about-the-inchi-standard/)).
Interoperability came from *fixing* parameters: the 2009 standard versions
"took the original algorithm with its many variable parameters and fixed them
so that interoperability between databases and resources … could be achieved"
([InChI Trust, about the standard](https://www.inchi-trust.org/about-the-inchi-standard/)).

**Candidate application.** InChI illustrates the importance of defined identity
parameters, not a requirement for layered or deliberately unreadable AzeForge data.
[ADR 0002](../adr/0002-document-and-artifact-hashes.md) already defines the content
hash and separate Artifact hash. Preserve that contract; any new normalization
policy needs an explicit semantic equivalence and versioning decision.

---

## 7. Circuits: ngspice netlists, CircuiTikZ

### 7.1 Connectivity is named, typed, and topologically validated (ngspice)

An ngspice input file is element instance lines (topology + values) plus control
lines (models + run controls), with exactly two structural requirements: "the
first line … must be the title" and "the last line must be .end"; remaining
order is almost arbitrary
([ngspice manual v47, §2.1.1](https://ngspice.sourceforge.io/docs/ngspice-manual.pdf)).
Each instance line holds the element name, the Circuit nodes it connects to,
and its parameters; "the first letter of the element instance name specifies
the element type" (R resistor, C capacitor, V source, …)
([ngspice manual v47, §2.3](https://ngspice.sourceforge.io/docs/ngspice-manual.pdf)).
Node names are arbitrary strings (case-insensitive in batch mode), ground must
be `0` (`gnd` is accepted and converted), and — a classic trap — nodes are
strings, so "`0` and `00` are distinct nodes"
([ngspice manual v47, §2.1.3](https://ngspice.sourceforge.io/docs/ngspice-manual.pdf)).
Numbers take scale suffixes, but "letters immediately following a number that
are not scale factors are ignored", so `10`, `10V`, and `10Hz` are the same
number, and `M`/`m` mean *milli* — `meg` is required for mega
([ngspice manual v47, §2.1.3](https://ngspice.sourceforge.io/docs/ngspice-manual.pdf)).
The manual lists simulation topology constraints, including restrictions on
voltage-source/inductor loops, DC paths to ground, and node connections
([ngspice manual v47, §2.1.4](https://ngspice.sourceforge.io/docs/ngspice-manual.pdf)).
These are simulator constraints, not general requirements for drawing schematics.
The front end even scans for valid UTF-8 and warns on special leading
characters (escalatable to a hard error)
([ngspice manual v47, §2.1.2](https://ngspice.sourceforge.io/docs/ngspice-manual.pdf)).
Reuse is scoped: `.SUBCKT` parameters mask globals, subcircuit/model names are
global and must be unique, nesting to level 10, and brace expressions may not
parameterize node names
([ngspice manual v47, §2.11](https://ngspice.sourceforge.io/docs/ngspice-manual.pdf)).

**Existing AzeForge contract.** Named terminal-to-node relations are reusable
evidence for explicit connectivity, but ngspice's simulation rules do not transfer.
[Circuit semantic model and validation](https://github.com/aruzone/aze-forge/issues/11#issuecomment-5543076289)
permits floating Circuits and at most one reference node. An unused node warns;
each disconnected component-bearing subgraph warns. Duplicate references,
unknown nodes or terminals, unbound or multiply bound required terminals,
incompatible quantities, and the other specified invalid declarations remain
errors. A Circuit must not fail merely for lacking ground, a DC path, or
simulator-compatible topology. Readable syntax, unit spelling, and identifier
rules must follow the AzeForge decision rather than ngspice conventions.

### 7.2 State the defaults, version the migration, teach first (CircuiTikZ)

CircuiTikZ provides "a set of macros … for naturally typesetting electrical and
electronic networks", born for writing exercise books and exam sheets, "easy to
use, with a lean syntax, native to LaTeX, and supporting directly PDF output"
([CircuiTikZ README](https://github.com/circuitikz/circuitikz),
[CTAN package page](https://ctan.org/pkg/circuitikz)). The optional `siunitx`
integration is listed as a dependency "if used". The README recommends stating
a preferred voltage-direction option such as `RPvoltages`; it does not make that
choice a universal mandatory input
([CircuiTikZ README](https://github.com/circuitikz/circuitikz)). The project
ships a roll-back mechanism with a manual section on incompatibilities between
versions, plus tutorials and a hyperlinked HTML manual
([CircuiTikZ README](https://github.com/circuitikz/circuitikz)).

**Candidate application.** A common quantity parser could avoid inconsistent unit
rules across Plugins; per-domain parsers may offer narrower dependencies. Compare
those approaches rather than treating optional `siunitx` integration as a mandate.
Source-explicit settings and versioned defaults are also distinct choices.
Preserve existing Circuit requirements such as the explicit per-Document symbol
convention. Do not generalize that requirement to every setting, or introduce a
second Circuit data version beside its approved Plugin SemVer.

---

## 8. Diagnostics across the corpus

The blueprint requires diagnostics with stable code, severity, file, range,
message, suggestion, machine-applicable fix, and related locations in human and
JSON forms. The surveyed languages converge on the same anatomy:

- **rustc's diagnostic structure** is the most worked example: level, code
  (linked to long-form explanations viewable via `--explain` or the error
  index), standalone message, a window showing affected code with primary
  (self-sufficient, IDE-visible) and secondary spans, and sub-diagnostics for
  out-of-order explanations; `help` proposes fixes (with machine-applicability
  confidence), `note` gives context — and the fix suggestion never lives in the
  error text itself
  ([rustc dev guide, diagnostics](https://rustc-dev-guide.rust-lang.org/diagnostics.html)).
  The style guide adds: lowercase, no trailing punctuation, smallest sufficient
  span, no duplicate errors for one fault, backticks for code, and lint names
  that read correctly under `allow(...)`
  ([rustc dev guide, diagnostics](https://rustc-dev-guide.rust-lang.org/diagnostics.html)).
- **Levels need semantics.** rustc distinguishes fixed errors from user-leveled
  lints, warns against warning fatigue and false positives, and reserves
  allow-by-default for opinionated/experimental checks
  ([rustc dev guide, diagnostics](https://rustc-dev-guide.rust-lang.org/diagnostics.html)) —
  directly applicable to AzeMark warnings such as disconnected subgraphs.
- **Boundaries are diagnostics.** KaTeX's supported/unsupported table, SMILES'
  "impossible input" flag, ngspice's escalatable leading-character warning and
  topological constraints, and Mermaid's inline reserved-word warnings are all
  the same pattern: the compiler knows its edge and says so at the Source
  location ([KaTeX supported functions](https://katex.org/docs/supported.html);
  [Daylight SMILES theory](https://www.daylight.com/dayhtml/doc/theory/theory.smiles.html);
  [ngspice manual v47, §2.1.2/§2.1.4](https://ngspice.sourceforge.io/docs/ngspice-manual.pdf);
  [Mermaid flowchart syntax](https://mermaid.js.org/syntax/flowchart.html)).

---

## 9. Synthesis: candidate patterns and traps

These are inputs to decisions, not an approved syntax or implementation checklist.
The existing-contract qualifications in section 10 take precedence.

### Candidate patterns

- **P1. Consistent Block anatomy.** MyST separates type, arguments, options, and
  body. Compare that shape with existing AzeMark envelopes before adopting
  positional arguments or additional delimiters.
- **P2. Meaning-preserving normalization.** Daylight distinguishes generic →
  unique from isomeric → absolute. Canonicalization preserves known information;
  it cannot supply missing isotope or chirality specifications.
- **P3. Explicit relations with separate presentation intent.** Circuit connectivity
  comes from named terminal-to-node relations, not proximity, orientation, or order.
  Authored layout hints can remain in Document data.
- **P4. Rule-based defaults with overrides.** Vega-Lite demonstrates reduced
  boilerplate. Default values, precedence, and version identity still need an
  AzeMark decision.
- **P5. Unspecified is distinct from default.** SMILES permits partial information.
  Each selected domain must state whether an omission is valid partial knowledge,
  a documented default, or an error.
- **P6. Defined semantic identity.** InChI demonstrates fixed identity parameters.
  AzeForge's existing content/Artifact hash contract remains authoritative.
- **P7. Published coverage boundary.** KaTeX's supported/unsupported tables provide
  a precedent for an inspectable native subset and bounded escape hatches.
- **P8. Explicit configuration policy.** CircuiTikZ recommends visible conventions.
  Source-explicit values and versioned built-in defaults are alternatives; every
  global option need not be repeated in Source.
- **P9. Executable specification examples.** CommonMark uses examples for
  conformance. The alpha acceptance decision owns which AzeMark cases warrant
  persistent regression coverage.
- **P10. Consistent quantities.** Optional `siunitx` support is a precedent for
  shared unit formatting, not proof that AzeMark requires a particular library.
- **P11. Semantic descriptions.** Typst's equation `alt` is a candidate precedent;
  the selected object schemas and acceptance decision own AzeMark's requirements.
- **P12. Recovery without false success.** MyST demonstrates readable foreign
  fallback. AzeForge can recover parsing while still refusing to render an
  invalid Document under its existing validated-render boundary.

### Traps to consider

- **T1. Reserved tokens.** Mermaid's `end` and leading `o`/`x` show why quoting and
  identifier rules need examples. ngspice's device-prefix convention is not an
  AzeForge requirement.
- **T2. Order-dependent meaning.** SMILES chirality and DOT inheritance show why
  rewrites need an explicit equivalence rule. AzeForge Circuit order remains
  hash-significant and may guide layout without creating connectivity.
- **T3. Unit-blind suffixes.** ngspice treats `10V` and `10` alike and `M` as milli.
  AzeMark must not silently inherit these conventions.
- **T4. Identifier coercion.** ngspice distinguishes `0` and `00`. Compare identifier
  rules per domain; preserve the approved separate Circuit namespaces.
- **T5. Significant whitespace.** Typst and reStructuredText demonstrate both
  convenience and hidden rules. The language decision must choose and document
  the tradeoff rather than assume a ban.
- **T6. Implicit token interpretation.** Typst distinguishes single letters from
  multi-letter names. Explicit quoting is one candidate, not the only design.
- **T7. Presentation confused with meaning.** Layout must not change connectivity.
  This does not exclude authored layout intent from Document data or require a
  coordinate ban across all Technical objects.
- **T8. Silent semantic replacement.** Mermaid's last-definition-wins rule is a
  reason to specify duplicates. CommonMark's permissive syntax is not itself
  a defect to remove from ordinary Markdown.
- **T9. Uncontrolled configuration.** DOT's temporal inheritance complicates
  reasoning. Versioned defaults with defined precedence can be deterministic
  without repeating every setting in Source.
- **T10. Overlapping grammars.** ngspice's multiple expression parsers motivate
  comparing shared expression subsets with clearly delimited domain grammars,
  not mandating one grammar across every Plugin
  ([ngspice manual](https://ngspice.sourceforge.io/docs/ngspice-manual.pdf)).

## 10. Review corrections and decision handoff

The initial revision overstated external conventions as AzeMark requirements.
This revision corrects those statements. The following identifiers let downstream
tickets trace the correction without copying the entire research answer.

| Correction | Existing contract or corrected fact | Decision owners |
| --- | --- | --- |
| R1 | Floating Circuits are valid; unused nodes and disconnected component-bearing subgraphs warn. Do not import simulation topology gates. | [Define the alpha Technical object catalog](https://github.com/aruzone/aze-forge/issues/51), [Define owner-led alpha acceptance](https://github.com/aruzone/aze-forge/issues/53) |
| R2 | Retain approved `layout.flow`, optional orientation, and hash-significant declaration order. They never create connectivity. | [Define the controlled AzeMark language contract](https://github.com/aruzone/aze-forge/issues/52), [Map the compiler gap to the alpha catalog](https://github.com/aruzone/aze-forge/issues/45) |
| R3 | Documents contain Blocks. Block renderers produce opaque Fragments owned by document Renderers, not semantic Blocks. | [Define the compiler library and web service boundary](https://github.com/aruzone/aze-forge/issues/46), [Map the compiler gap to the alpha catalog](https://github.com/aruzone/aze-forge/issues/45) |
| R4 | Generic → unique and isomeric → absolute are separate canonicalization paths. Normalization cannot invent or erase isotope/chirality information. | [Define the controlled AzeMark language contract](https://github.com/aruzone/aze-forge/issues/52), [Define owner-led alpha acceptance](https://github.com/aruzone/aze-forge/issues/53) |
| R5 | `siunitx` is optional and explicit voltage-direction selection is recommended by CircuiTikZ, not universally required. | [Define the compiler library and web service boundary](https://github.com/aruzone/aze-forge/issues/46), [Map the compiler gap to the alpha catalog](https://github.com/aruzone/aze-forge/issues/45) |
| R6 | Geometry coordinates, default policy, expression-grammar sharing, quantity-library choice, and envelope syntax remain owner-approved decisions, not survey mandates. | [Define the controlled AzeMark language contract](https://github.com/aruzone/aze-forge/issues/52), [Taste representative AzeMark authoring forms](https://github.com/aruzone/aze-forge/issues/50) |

### Questions now explicit

- In selected geometry capabilities, should authors use named constructions,
  coordinates, or a bounded combination? What precision and solver/layout limits
  does each approach entail? The catalog chooses capability scope; the
  language-contract decision owns authoring-policy consistency.
- Which settings require explicit Source, and which may use versioned defaults?
  How are resolved values, precedence, and hash/fingerprint effects documented?
- Which expression and quantity rules can be shared, and where do delimited
  domain grammars need different semantics? What prevents ambiguous boundaries?
- Does the existing directive envelope suffice, or do positional arguments and
  alternate fences earn their complexity?

These questions belong to existing decision tickets. Detailed per-object schemas
and implementation slices still depend on the catalog; no new ticket is necessary.
[Sequence the alpha implementation handoff](https://github.com/aruzone/aze-forge/issues/48)
must map R1–R6 to the affected execution issues and acceptance evidence, or record
an explicit out-of-scope disposition. A research recommendation alone is not
authorization to replace an inherited contract.

## Sources

Primary specifications and official documentation consulted (all claims above
cite the linked page inline):

- CommonMark spec 0.31.2 — https://spec.commonmark.org/0.31.2/
- MyST syntax overview — https://mystmd.org/guide/syntax-overview
- reStructuredText markup specification — https://docutils.sourceforge.io/docs/ref/rst/restructuredtext.html
- Jekyll front matter — https://jekyllrb.com/docs/front-matter/
- AsciiMath — http://asciimath.org/
- Typst math — https://typst.app/docs/reference/math/
- KaTeX supported functions — https://katex.org/docs/supported.html
- MathML Core (W3C CR) — https://www.w3.org/TR/mathml-core/
- Mermaid flowchart syntax — https://mermaid.js.org/syntax/flowchart.html
- Graphviz DOT language — https://graphviz.org/doc/info/lang.html
- Vega-Lite (site + repo) — https://vega.github.io/vega-lite/docs/spec.html and https://github.com/vega/vega-lite
- Matplotlib quick start — https://matplotlib.org/stable/users/explain/quick_start.html
- Asymptote description / paths / geometry — https://asymptote.sourceforge.io/doc/Description.html ,
  https://asymptote.sourceforge.io/doc/Paths.html , https://asymptote.sourceforge.io/doc/geometry.html
- Daylight SMILES theory — https://www.daylight.com/dayhtml/doc/theory/theory.smiles.html
- InChI Trust, about the standard — https://www.inchi-trust.org/about-the-inchi-standard/
- ngspice user's manual v47 — https://ngspice.sourceforge.io/docs/ngspice-manual.pdf
- CircuiTikZ (CTAN + README) — https://ctan.org/pkg/circuitikz and https://github.com/circuitikz/circuitikz
- rustc dev guide, diagnostics — https://rustc-dev-guide.rust-lang.org/diagnostics.html
