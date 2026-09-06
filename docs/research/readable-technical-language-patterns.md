# Survey: readable technical-language patterns

Research note for [Survey readable technical-language patterns](https://github.com/aruzone/aze-forge/issues/47),
on the [AzeMark comprehensive alpha route](https://github.com/aruzone/aze-forge/issues/44).

**Question.** Which conventions in primary specifications and official documentation
for readable mathematical, diagram, plotting, geometry, chemistry, circuit, and
structured-document languages best reduce author complexity while preserving
deterministic parsing, explicit semantics, inspectability, and useful diagnostics?

**Scope.** Cited comparison of reusable patterns and traps for AzeMark.
This note deliberately does **not** choose the AzeMark Technical object catalog,
concrete declaration syntax, or any implementation slice.
Vocabulary follows `CONTEXT.md` (Source, Document, Block, Technical object,
Plugin, Block renderer, Renderer, Fragment, Artifact, Content hash, Circuit,
Circuit component, Circuit node, Terminal–node relation, Golden report,
Pilot Circuit fixture, Acceptance catalog).

**Method.** Primary specifications and official documentation only.
Every external claim below links directly to the source that owns it.

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

**Reusable for AzeMark.** (a) Keep ordinary prose readable as plain text; show
nesting through layout, not ceremony. (b) Every accepted Source form needs an
example oracle that doubles as a conformance test. (c) "Accept anything, reject
nothing" is a documented failure mode: silent divergence surfaces late, so
validation should fail loudly with alternatives rather than guess.

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

**Reusable for AzeMark.** A Technical object Block wants the same four-slot
anatomy (type, positional arguments, named options, body) so Plugins validate one
predictable shape. Fence choice should follow payload kind (prose-like vs
code-like), and unknown Block types should produce a diagnostic that names
available alternatives — the same posture the blueprint already requires for
unknown blocks.

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

**Reusable for AzeMark.** The Source envelope pattern (version key, title,
outputs, Theme selection) is proven; add a defaults mechanism early so repeated
per-Block options do not bloat Sources.

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

**Reusable for AzeMark.** (a) Never let significant whitespace or implicit
multi-character rules hide: Typst's space-delimited block vs inline and its
single-vs-multiple-letter rule are the two highest-risk traps to either adopt
consciously or forbid. (b) Accessibility descriptions belong in the semantic
model from the start (`alt` on the equation), not bolted onto a Renderer later.

### 2.3 Publish the coverage boundary (KaTeX)

KaTeX maintains both a function-grouped supported-functions list and an
alphabetical support table that "lists both supported and un-supported
functions" ([KaTeX supported functions](https://katex.org/docs/supported.html)).
Display-only environments additionally render outside math delimiters via the
auto-render extension ([KaTeX supported functions](https://katex.org/docs/supported.html)).

**Reusable for AzeMark.** A readable math core plus a raw-LaTeX escape hatch
needs exactly this artifact: a versioned, per-construct supported/unsupported
table so authors and diagnostics share one boundary definition. The escape hatch
stays bounded instead of becoming the language.

### 2.4 Structure *and* content, subsetted on purpose (MathML Core)

MathML Core is "a core subset of Mathematical Markup Language … suitable for
browser implementation", where "MathML is a markup language for describing
mathematical notation and capturing both its structure and content", with the
goal of letting mathematics "be served, received, and processed on the World
Wide Web, just as HTML has enabled this functionality for text"
([MathML Core, W3C Candidate Recommendation](https://www.w3.org/TR/mathml-core/)).

**Reusable for AzeMark.** The semantic Document should capture structure and
content (meaning), leaving presentation to Block renderers — and subsetting a
large standard into an explicit, implementable core is itself the pattern for
scoping each Technical object.

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

**Reusable for AzeMark.** (a) Node identity vs displayed label must be separate
fields. (b) Layout direction is a hint, not semantics — keep it out of the
semantic core. (c) Prefer one general extension mechanism (shape tables with
aliases) over per-shape syntax. (d) Maintain a linted reserved-word list from
day one; Mermaid's `end`/`o`/`x` traps show what happens without one.

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

**Reusable for AzeMark.** (a) Publish a real grammar, however small; DOT shows
how little it takes (one page) and how much it settles. (b) Mark every
layout-only construct as layout-only, the way DOT disowns `cluster`. (c) Make
default-inheritance time-explicit or scoped; the subgraph-label leak is the trap
to design out. (d) Fix the encoding story (UTF-8 default, named override,
entity fallback) once for all Technical objects.

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

**Reusable for AzeMark.** The plot authoring pattern is mappings-plus-defaults:
authors state data→channel intent, the Plugin fills scales/axes/legends by rule,
explicit values always win. Also a pipeline precedent: readable spec compiles to
a complete lower-level spec before rendering — the same shape as
Source → semantic Document → Renderer-specific Fragments.

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

**Reusable for AzeMark.** (a) A composition hierarchy with single ownership
(Document → Block → Fragment) prevents a whole class of aliasing bugs; state
the ownership rule. (b) If a terse convenience spelling ever appears beside the
explicit declaration form, document which is canonical and deprecate flat
alternatives loudly. (c) Data-by-name (`data` + column references) is the
readable-plot pattern to copy; scale generation (Locator) stays separate from
label formatting (Formatter).

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

**Reusable for AzeMark.** (a) Geometry authoring wants declared constraints and
named constructions (midpoints, perpendiculars, triangles), not raw
coordinates; Asymptote's module pattern (core language + domain modules written
in the language itself) mirrors Plugins owning Technical objects. (b) Path
operators should each mean exactly one thing (`--` vs `..` vs `..cycle`) with a
stated equivalence to the render model. (c) Fixed-size vs scalable-object
tension is real — solve it as deferred layout inside the Renderer, never by
letting authors hand-tune coordinates. (d) Label typography consistency across
targets is a requirement on Block renderers, not an accident.

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

- **Three name kinds.** Generic SMILES (graph only), unique SMILES (one
  canonical name per structure — "the name is universal"), and isomeric/absolute
  SMILES (with isotope/chiral specifications)
  ([Daylight SMILES theory](https://www.daylight.com/dayhtml/doc/theory/theory.smiles.html)).
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

**Reusable for AzeMark.** (a) The authoring-vs-canonical split is the deepest
pattern in this survey: accept many readable forms, canonicalize to one, and
keep both names (generic vs unique vs absolute). (b) Make omission rules
explicit and total (what may be implied, what must be bracketed). (c) Treat
*unspecified* as a value distinct from *default* wherever partial knowledge is
normal. (d) Wherever meaning depends on Source order, the compiler owns
meaning-preservation across rewrites. (e) Deduce-then-flag beats
deduce-then-guess: infer aromaticity if you must, but reject the impossible
with a diagnostic.

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

**Reusable for AzeMark.** Content identity (the Content hash analogue) must be a
separate, layered, parameter-fixed construct — never the readable Source
itself, and never tunable per document. A key that is "not designed to be
human-understandable" is a feature: it stops authors from hand-editing identity.

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
Topology itself is validated: no voltage-source/inductor loops, every node
needs a dc path to ground, every node needs at least two connections
([ngspice manual v47, §2.1.4](https://ngspice.sourceforge.io/docs/ngspice-manual.pdf)).
The front end even scans for valid UTF-8 and warns on special leading
characters (escalatable to a hard error)
([ngspice manual v47, §2.1.2](https://ngspice.sourceforge.io/docs/ngspice-manual.pdf)).
Reuse is scoped: `.SUBCKT` parameters mask globals, subcircuit/model names are
global and must be unique, nesting to level 10, and brace expressions may not
parameterize node names
([ngspice manual v47, §2.11](https://ngspice.sourceforge.io/docs/ngspice-manual.pdf)).

**Reusable for AzeMark.** This is the reference model for explicit Circuit
semantics: instance = reference + Terminal–node relations + values; node names
are the connectivity (never drawing placement); ground/reference is mandatory;
topology rules are validation errors, not layout warnings. Adopt the traps list
whole: unit-blind suffixes, `M`-means-milli, string-vs-number node identity,
and the discipline that names of connectivity may not be computed by
expressions.

### 7.2 State the defaults, version the migration, teach first (CircuiTikZ)

CircuiTikZ provides "a set of macros … for naturally typesetting electrical and
electronic networks", born for writing exercise books and exam sheets, "easy to
use, with a lean syntax, native to LaTeX, and supporting directly PDF output"
([CircuiTikZ README](https://github.com/circuitikz/circuitikz),
[CTAN package page](https://ctan.org/pkg/circuitikz)). Units go through a
dedicated library (`siunitx`), and authors must state at least a voltage
direction option such as `RPvoltages`
([CircuiTikZ README](https://github.com/circuitikz/circuitikz)). The project
ships a roll-back mechanism with a manual section on incompatibilities between
versions, plus tutorials and a hyperlinked HTML manual
([CircuiTikZ README](https://github.com/circuitikz/circuitikz)).

**Reusable for AzeMark.** (a) Route all units/values through one unit-aware
library rather than per-Plugin ad-hoc parsing. (b) Global orientation/polarity
defaults must be *stated in the Source*, never ambient. (c) Version every
Technical object schema with a documented migration path from day one.

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

## 9. Synthesis: reusable patterns and traps

### Reusable patterns (P)

- **P1 — Four-slot Block anatomy.** type / positional arguments / named options /
  body (MyST directives; ngspice instance lines; Vega-Lite mappings). One shape
  for every Plugin to parse and validate.
- **P2 — Authoring/canonical split.** Accept many readable forms; canonicalize
  to exactly one (SMILES generic→unique→absolute; Vega-Lite→Vega; readable
  math→core subset). Keep both names visible for inspectability.
- **P3 — Explicit relations, never spatial inference.** Connectivity from named
  Circuit nodes (ngspice), not drawing proximity; layout constructs marked
  layout-only (DOT `cluster`); direction as hint (Mermaid).
- **P4 — Rule-based defaults with explicit override.** Scales/axes/legends
  (Vega-Lite); figure sizing (Asymptote deferred drawing). Authors state intent;
  the compiler fills the rest; explicit values always win.
- **P5 — Unspecified ≠ default.** First-class partial specification (SMILES
  chirality absence; atom-map partiality). Diagnostics, not defaults, handle
  the gaps.
- **P6 — Identity is layered, fixed, and unreadable.** Parameter-fixed standard
  identifiers (InChI/standard InChIKey); never hand-editable, never per-document
  tunable. The Content hash analogue.
- **P7 — Published coverage boundary.** Supported/unsupported tables (KaTeX);
  bounded escape hatch for the rest (raw backend blocks).
- **P8 — Stated global defaults.** Voltage direction (CircuiTikZ `RPvoltages`);
  orientation; ground reference. Ambient defaults are a bug source.
- **P9 — Examples are conformance tests.** Spec examples executable against any
  implementation (CommonMark `spec_tests.py`); Golden report fixtures play this
  role per Technical object.
- **P10 — One unit library.** All quantities through a single unit-aware path
  (`siunitx` precedent); never per-Plugin suffix folklore.
- **P11 — Accessibility in the semantic model.** Natural-language `alt` on
  equations (Typst) from the start, available to every Renderer.
- **P12 — Graceful foreign fallback.** Markdown legible without the extension
  renderer (MyST colon fences); unknown constructs parse and diagnose with
  alternatives rather than aborting the whole Document.

### Traps (T)

- **T1 — Reserved words.** `end`, leading `o`/`x` (Mermaid); first-letter
  device typing (ngspice). Maintain a linted list; quote-or-rename diagnostics.
- **T2 — Order-dependent meaning.** `@`/`@@` chirality in SMILES order; DOT
  default inheritance at definition time. Whoever rewrites Source must preserve
  meaning (canonicalizer's burden).
- **T3 — Unit-blind suffixes.** `10V` = `10`; `M` = milli (ngspice). Require
  explicit units through P10.
- **T4 — String-vs-number identity.** `0` vs `00` distinct nodes; case folding
  (ngspice). Fix node-identity rules once, globally.
- **T5 — Significant whitespace.** Block-vs-inline `$ … $` (Typst); indentation
  (reST). Either specify exactly or reject.
- **T6 — Implicit multi-token rules.** Multi-letter = function (Typst). Prefer
  explicit operators/quoting over reader-must-know heuristics.
- **T7 — Layout leaking into semantics.** `cluster` naming, visual proximity
  (DOT). Keep a hard semantics/layout boundary per Technical object.
- **T8 — Silent acceptance.** Nothing-is-an-error divergence (CommonMark);
  last-definition-wins (Mermaid ids). Fail loudly with named alternatives.
- **T9 — Ambient, unstated configuration.** Root-label inheritance (DOT);
  unstated voltage direction (CircuiTikZ). Every global default is declared in
  Source or it does not exist.
- **T10 — Parallel overlapping grammars.** ngspice warns of "three expression
  parsers" with differing behavior; AzeMark should have exactly one expression
  grammar shared by all Plugins.

---

## 10. Non-decisions and fog status

No catalog, syntax, or implementation choice is made here — those belong to
later tickets on the map. The fog items on the map stay foggy: object-specific
schemas, declaration forms, Renderer constraints, and escape-hatch boundaries
still depend on the curated catalog decision, which this survey intentionally
does not pre-empt. No new tickets are created: no finding above makes a
previously foggy decision precisely stateable on its own.

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
