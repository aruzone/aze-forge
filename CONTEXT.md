# AzeForge

Semantic technical publishing compiler: readable source in, deterministic shareable artifacts out.

## Language

**Source**:
Human- and agent-authored AzeMark text (`.aze.md`) plus optional front matter.
_Avoid_: Document, AST, input file

**AzeForge Web**:
The separate single-user web authoring product that consumes AzeForge through its public compiler-library contract.
_Avoid_: Browser mode, web compiler, AzeForge

**Document**:
The parsed, versioned semantic AST produced from Source; the pipeline's source of truth.
_Avoid_: Source, syntax tree, IR

**Block**:
One ordered semantic unit of a Document: an ordinary Markdown construct or a typed directive such as an equation, callout, or diagram.
_Avoid_: Node, element, widget

**Technical object**:
A Plugin-owned typed semantic Block, such as an equation, plot, geometry, Circuit, or chemistry structure. Ordinary Markdown Blocks compose the Document but are not Technical objects.
_Avoid_: Graphic, diagram, every Block

**Plugin**:
Code that parses and validates one directive Block type. It owns domain meaning but not document composition or output-format policy.
_Avoid_: Extension, handler, Renderer

**Block renderer**:
An adapter that renders one Plugin-owned Block type for one target family without changing its semantic data.
_Avoid_: Plugin, document Renderer

**Renderer**:
A replaceable adapter that composes a whole Document into one Artifact format, delegating Plugin-owned Blocks to Block renderers.
_Avoid_: Backend, exporter, Plugin

**Fragment**:
A Renderer-specific representation of one Block returned by a Block renderer for composition into a whole Artifact.
_Avoid_: Artifact, universal render node

**Artifact**:
Rendered output bytes (HTML, SVG, PNG, or PDF) plus their MIME type and artifact hash. An Artifact also points to the content hash of the Document it represents; diagnostics describe compilation separately.
_Avoid_: Output, build, file

**Content hash**:
The stable identity of an error-free Document's semantic content, distinct from the byte-level identity of any Artifact rendered from it.
_Avoid_: Artifact hash, file checksum

**Asset manifest**:
The canonical inventory of project images a Document uses, keyed by root-relative logical path with media types and byte hashes. Its hash identifies the used bytes separately from the content hash.
_Avoid_: File list, attachment bundle

**Circuit**:
A semantic schematic composed of Circuit components, Circuit nodes, explicit terminal–node relations, and typed annotations. Electrical connectivity never comes from drawing placement.
_Avoid_: Circuit drawing, schematic image, netlist

**Circuit component**:
- A whitelisted electrical or logic device identified by a unique reference and fixed named terminals.
_Avoid_: Symbol, element, part

**Circuit node**:
A named electrical net within one Circuit; one node may be its reference ground.
_Avoid_: Point, junction, coordinate

**Terminal–node relation**:
The explicit binding of one Circuit component terminal to one Circuit node.
_Avoid_: Wire, path, inferred connection

**Timing signal**:
A named ordered interval list over one Timing Block's shared scale; its authored order is its row order, and only its reference carries identity.
_Avoid_: Trace, channel, waveform file

**Interval state**:
One of the closed states — low, high, unknown, impedance, bus, continue, rise, fall — spanning one authored count or duration in a Timing signal.
_Avoid_: Wave character, edge event, logic level

**Native math notation**:
The closed readable expression grammar for mathematics that the compiler parses directly into semantic structure; notation outside it is refused with a diagnostic, never handed to a backend.
_Avoid_: readable LaTeX, TeX, KaTeX source

**Derivation**:
An ordered sequence of equation steps held as one referenceable object, each step carrying an optional plain-text annotation.
_Avoid_: proof, align block, steps

**Step annotation**:
The literal prose attached to one Derivation step; document content, not a comment, and never mathematics.
_Avoid_: comment, note, caption

**Bound variable**:
A name introduced by a binder — sum, product, integral, limit, quantifier — scoped to that binder's operand.
_Avoid_: index, dummy variable, declared symbol

**Plot**:
One numeric Cartesian coordinate system overlaying function curves and authored point series with shared axes and a legend.
_Avoid_: graph, chart, figure

**Chart**:
A bar-family rendering — bar, grouped bar, stacked bar, or histogram — over categorical or binned numeric data.
_Avoid_: plot, diagram, graph

**Series**:
One ordered draw layer of a Plot or Chart; its authored order is the draw order and part of document identity.
_Avoid_: dataset, trace, layer

**Evaluable subset**:
The restriction of native math notation to closed-form numeric evaluation for function series; distinct from every symbolic context, which never evaluates.
_Avoid_: script, code, formula

**Construction**:
A named geometric object derived by bounded classic operations from earlier-named objects; its intent is document content, and its resolved coordinates are renderer-derived.
_Avoid_: constraint, computed point, drawing command

**Computed measurement**:
A length or angle derived from resolved geometry for display on a mark, never conflated with an authored label and never checked against one.
_Avoid_: measured label, calculated dimension

**Construction guide**:
A declaration made invisible that carries construction intent, such as the auxiliary line an altitude's foot drops to.
_Avoid_: hidden layer, scaffolding

**Diagram**:
A bounded graph of named nodes, labeled edges, nested groups and ports, laid out deterministically; its identity and connectivity never come from placement.
_Avoid_: flowchart (as the family name), picture, drawing

**Diagram mode**:
The registered regime — flowchart, graph, tree, architecture — that selects a general Diagram's structural validation rules and its layout regime.
_Avoid_: kind, type, diagram type

**Diagram node**:
A named shaped vertex of a general Diagram, carrying an optional display label and optional ports.
_Avoid_: box, element, vertex

**Diagram group**:
A named container of nodes and groups inside a general Diagram; it is never an edge endpoint.
_Avoid_: cluster, subgraph, tier, layer

**Diagram port**:
A named attachment point declared on a Diagram node, referenced as `node.port`; it carries no direction and no electrical meaning.
_Avoid_: terminal, pin, connector, interface

**Diagram edge**:
A directed or undirected relation between two general-Diagram nodes or ports, optionally labeled; parallel edges are distinguished by authored order.
_Avoid_: link, arrow, wire, connection

**Diagram declaration order**:
The single authored order of a general Diagram's nodes, groups and edges; hash-significant, offered to the layout engine as model order, and never establishing adjacency or identity.
_Avoid_: model order, layout stable order

**Layout projection**:
The geometry-only reading of a layout engine's result that the renderer emits; the portion of that result a project never serializes can vary without affecting any Artifact.
_Avoid_: engine output, layout result

**Participant**:
A named lane of a sequence diagram; its authored order is its left-to-right order, and `actor` is the kind drawn as a human.
_Avoid_: lifeline, object, lane

**Message**:
One directed exchange between participants, placed on the timeline solely by its authored order.
_Avoid_: call, arrow, event

**Fragment**:
A nested alternative or loop region of a sequence timeline holding its own ordered items.
_Avoid_: combined fragment, alt block, group

**Activation**:
An execution bar on one participant's lifeline, opened and closed only by explicit authored flags on messages.
_Avoid_: execution, call stack, bar

**Composite state**:
A state containing its own nested states and its own single initial state.
_Avoid_: superstate, region, group

**Transition**:
A directed edge between two states of one state machine, carrying authored trigger, guard and action text.
_Avoid_: event, edge, arrow

**Cardinality**:
The closed word enum — one, zero-or-one, many, one-or-many — carried by an entity relationship end and, as a multiplicity, by a class association end.
_Avoid_: 0..*, crow's foot, range

**Entity**:
A named record of attributes inside an entity diagram; its attributes' authored order is their display order.
_Avoid_: table, record, class

**Relationship**:
A link between two ends, each carrying a cardinality and an optional role; in a class diagram its kind is inheritance, implementation, association, aggregation or composition.
_Avoid_: edge, association (as the only kind), link

**Class member**:
An attribute or operation of a class or interface, whose authored order is its display order.
_Avoid_: field, method, property

**Chemical formula**:
A one-line bounded expression over a closed element registry declaring composition, counts, an adduct structure and a trailing formal charge; its parse is a semantic tree, and isotope masses resolve only at unit start.
_Avoid_: equation, molecular string, SMILES

**Reaction**:
One species line of Chemical formulas with integer-or-unspecified coefficients, closed state labels and one registered arrow; optionally a Balance assertion over the author's own declarations.
_Avoid_: equation, transformation, balancing claim

**Molecular structure**:
A 2D graph of named atoms, bonds and display labels with mandatory authored coordinates; its depiction follows from authored facts, never from layout or valence inference.
_Avoid_: molecule, compound drawing, skeletal structure

**Attachment point**:
An atom slot in a Molecular structure declaring a labeled connection to content outside the structure; it is not an unknown element and carries no charge, isotope or wedge fact.
_Avoid_: wildcard atom, unknown element, R-group

**Stereo state**:
The authored out-of-plane information of a site — specified by a single-bond wedge or hash, explicitly unspecified by author declaration, or omitted — three distinct preserved states, never derived from or checked against coordinates or each other.
_Avoid_: chirality inference, R/S label, unknown as default

**Balance assertion**:
An author opt-in checking a Reaction's own declared species for atom-count and net-charge equality; its absence claims nothing in either direction.
_Avoid_: automatic balancing, validation default

**Authored text field**:
Literal prose in a semantic field — a guard, action, trigger, type or label — that the compiler never parses, validates for content, or compares against anything computed.
_Avoid_: expression, code, annotation

**Advance metric**:
The registered versioned character-advance table that sizes text-bearing diagram boxes without measuring a rendered font.
_Avoid_: text measurement, font metrics

**Control signal**:
An edge of a control-system diagram, with its optional authored label; label divergence across a takeoff is display intent, never a checked equality.
_Avoid_: wire, net, trace

**Summing junction**:
A control item combining incoming signals under an authored ordered sign list whose count must match its in-edges in authored order.
_Avoid_: summer, adder, mixer

**Takeoff point**:
One signal's authored fan-out — several out-edges from one control item, rendered as a dot, never a nameable entity or a placement fact.
_Avoid_: pickoff, branch node

**Boundary stub**:
A directional control source or sink; an input stub may only feed edges, an output stub may only receive them.
_Avoid_: terminal, port, pin

**Free body diagram**:
A unitless y-up Block of authored bodies, anchored vectors and display marks that renders the physics the author claims and derives nothing; vector lengths are schematic unless an explicit scale makes them derived.
_Avoid_: force diagram, sketch

**Direction line**:
An invisible-by-default authored finite segment naming the reference direction for parallel and perpendicular force forms; its from–to order picks the ray.
_Avoid_: axis, guide line

**Explicit scale**:
The Block-level frame-units-per-force-unit switch that makes every force length derived from its magnitude and authored length an error.
_Avoid_: legend, ruler

**Typed table**:
A table Technical object whose columns declare types from a closed set and whose rows are records keyed by column; ordinary Markdown pipe tables remain document composition.
_Avoid_: data table, GFM table

**Column type**:
One of the seven closed declarations — prose, text, integer, decimal, quantity, boolean, math — that governs how a column's cells interpret and default-align.
_Avoid_: cell format, data kind

**Missing value**:
A cell omitted from its row record — a preserved semantic state distinct from zero, from empty text, and from an unknown key.
_Avoid_: null, N/A, blank

**Header group**:
A named one-level span over two or more adjacent columns of a Typed table.
_Avoid_: colspan, merged header

**Algorithm**:
A single-procedure pseudocode Technical object whose statements form an ordered, structure-parsed record tree.
_Avoid_: pseudocode, program, procedure listing

**Procedure**:
The one named unit an Algorithm declares — a name, an ordered parameter list, and ordered statements.
_Avoid_: function, routine, method

**Algorithm statement**:
One of the six control records of a Procedure — assign, if, for, while, return, text — whose authored order is program order and identity.
_Avoid_: line, instruction, step

**Pseudocode expression**:
The bounded presentation grammar of a condition, value, or bound inside an Algorithm statement; parsed structurally, never evaluated.
_Avoid_: math (that is native math notation), evaluable subset

**Statement kind**:
The closed classification of a statement Block — theorem, definition, lemma, corollary, proposition, remark — feeding numbering classes.
_Avoid_: type, theorem label

**Proof**:
A statement's single contained authored body, rendered with a renderer-derived QED mark and never verified.
_Avoid_: derivation, argument

**Worked example**:
A pedagogical Technical object composing problem, givens, ordered steps, and result around embedded equation/derivation Blocks without redefining mathematics.
_Avoid_: derivation, example callout

**Figure**:
A composition-owned wrapper Block giving ordinary Markdown content a document identifier, caption and figure-class number.
_Avoid_: image, plot, illustration

**Numbering class**:
One flat document-order counter of one object kind; every numbered Block consumes exactly one value in appearance order, and no counter resets in the alpha.
_Avoid_: counter, chapter numbering, sequence

**Auto label**:
The derived text of a prose reference to its target: the caption if present, else the kind word with the derived number, else the kind word alone.
_Avoid_: display label, generated caption

**Reference token**:
A `@name` prose span resolving against the single document identifier namespace; bare is the in-text form, bracketed the parenthetical form.
_Avoid_: link, mention, at-reference

**Citation record**:
One document-local bibliography entry over a closed field set, whose key joins the document identifier namespace.
_Avoid_: BibTeX entry, source metadata, reference list

**Locator**:
A bounded page/chapter/section/line/note qualifier attaching authored data to one citation of a Citation record; legal only on citations.
_Avoid_: page number, anchor, pinpoint

**Citation style**:
The document-wide numeric-or-author-year setting selecting citation label forms and rendered bibliography order.
_Avoid_: CSL, citation format, style sheet

**Footnote**:
A labeled single-paragraph note defined once at document level and referenced by prose markers; its number is its first-reference order.
_Avoid_: endnote (its rendering), inline note, margin note

**Endnote**:
The alpha rendering of footnotes as one document-end section with superscript markers, standing in for page-bottom placement the print pipeline cannot produce.
_Avoid_: footnote section, references

**Derived numbering projection**:
The assigned class numbers, citation numbers and order, disambiguation suffixes, footnote marker numbers and auto labels computed deterministically from authored content; part of the Document, excluded from the content hash.
_Avoid_: resolved defaults, renderer geometry, fingerprint

**Golden report**:
The approved P0 Source fixture that proves the complete compiler path through every required Artifact format and Theme.
_Avoid_: Demo, sample document, smoke test

**Pilot Circuit fixture**:
One lecturer-reviewed Circuit Source paired with its expected semantic connectivity and rendering evidence.
_Avoid_: Screenshot, schematic image, visual fixture

**Acceptance catalog**:
The versioned normative inventory of P0 and P0.5 release criteria and the evidence required to satisfy each one.
_Avoid_: Checklist, test plan, release notes
