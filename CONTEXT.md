# AzeForge

Semantic technical publishing compiler: readable source in, deterministic shareable artifacts out.

## Language

**Source**:
Human- and agent-authored AzeMark text (`.aze.md`) plus optional front matter.
_Avoid_: Document, AST, input file

**Document**:
The parsed, versioned semantic AST produced from Source; the pipeline's source of truth.
_Avoid_: Source, syntax tree, IR

**Block**:
One ordered semantic unit of a Document: an ordinary Markdown construct or a typed directive such as an equation, callout, or diagram.
_Avoid_: Node, element, widget

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
A whitelisted electrical device identified by a unique reference and fixed named terminals.
_Avoid_: Symbol, element, part

**Circuit node**:
A named electrical net within one Circuit; one node may be its reference ground.
_Avoid_: Point, junction, coordinate

**Terminal–node relation**:
The explicit binding of one Circuit component terminal to one Circuit node.
_Avoid_: Wire, path, inferred connection

**Golden report**:
The approved P0 Source fixture that proves the complete compiler path through every required Artifact format and Theme.
_Avoid_: Demo, sample document, smoke test

**Pilot Circuit fixture**:
One lecturer-reviewed Circuit Source paired with its expected semantic connectivity and rendering evidence.
_Avoid_: Screenshot, schematic image, visual fixture

**Acceptance catalog**:
The versioned normative inventory of P0 and P0.5 release criteria and the evidence required to satisfy each one.
_Avoid_: Checklist, test plan, release notes
