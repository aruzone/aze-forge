import type { JsonValue } from "./model.js";

export const ACCEPTANCE_SCHEMA_ID = "azeforge.acceptance/v1" as const;
export const ACCEPTANCE_SCHEMA_VERSION = 1 as const;
export const ACCEPTANCE_CATALOG_ID = "azeforge.acceptance/v1" as const;
export const ACCEPTANCE_CATALOG_VERSION = 1 as const;

export type AcceptanceGate = "p0" | "p0.5";
export type AcceptanceEvidence = "automated" | "manual";

export interface AcceptanceEntry {
  readonly id: string;
  readonly gate: AcceptanceGate;
  readonly area: string;
  readonly given: string;
  readonly when: string;
  readonly then: readonly string[];
  readonly evidence: AcceptanceEvidence;
  readonly required: boolean;
  readonly contracts: readonly string[];
}

function acceptanceEntry(
  id: string,
  gate: AcceptanceGate,
  area: string,
  given: string,
  when: string,
  then: readonly string[],
  evidence: AcceptanceEvidence,
  contracts: readonly string[],
): AcceptanceEntry {
  return { id, gate, area, given, when, then, evidence, required: true, contracts };
}

/**
 * Normative P0 release inventory from the golden-report acceptance gate.
 * P0.5 entries are required for their own gate only; a P0.5 failure never
 * delays or invalidates P0.
 */
export const ACCEPTANCE_ENTRIES: readonly AcceptanceEntry[] = Object.freeze([
  acceptanceEntry(
    "P0-DOC-001",
    "p0",
    "document",
    "Valid Engineering-notation Source",
    "the compiler parses and validates it",
    ["an error-free versioned serializable Document is produced"],
    "automated",
    ["#6"],
  ),
  acceptanceEntry(
    "P0-DOC-002",
    "p0",
    "document",
    "Source with invalid regions",
    "the compiler parses it",
    [
      "valid regions recover into the Document",
      "errors prevent AzeDocument and Artifact production",
    ],
    "automated",
    ["#6"],
  ),
  acceptanceEntry(
    "P0-DOC-003",
    "p0",
    "document",
    "Source with metadata, version, or unknown-directive failures",
    "the compiler reports Diagnostics",
    ["each Diagnostic carries the correct SourceRange and lists alternatives"],
    "automated",
    ["#6", "#9"],
  ),
  acceptanceEntry(
    "P0-DOC-004",
    "p0",
    "document",
    "Two Sources differing only in trivia, paths, diagnostics, ranges, or render options",
    "both Documents are hashed",
    ["both contentHashes are equal"],
    "automated",
    ["#6", "ADR 0002"],
  ),
  acceptanceEntry(
    "P0-DIAG-001",
    "p0",
    "diagnostics",
    "A failing compilation",
    "an author reads the human Diagnostic report",
    ["every Diagnostic is line-specific and author-facing"],
    "automated",
    ["#9"],
  ),
  acceptanceEntry(
    "P0-DIAG-002",
    "p0",
    "diagnostics",
    "A failing compilation",
    "a tool reads the JSON Diagnostic report",
    ["stable code, data, range, order, and fix semantics are preserved"],
    "automated",
    ["#9"],
  ),
  acceptanceEntry(
    "P0-DIAG-003",
    "p0",
    "diagnostics",
    "Malformed input or a component fault",
    "the compiler handles it",
    ["the fault is bounded, redacted, and contained without crashing"],
    "automated",
    ["#9"],
  ),
  acceptanceEntry(
    "P0-PLUGIN-001",
    "p0",
    "plugin",
    "The built-in registry, schemas, versions, and capabilities",
    "they are constructed",
    [
      "construction is deterministic",
      "ambiguous registrations are rejected with a stable error",
    ],
    "automated",
    ["#7"],
  ),
  acceptanceEntry(
    "P0-PLUGIN-002",
    "p0",
    "plugin",
    "A Plugin, Block renderer, or Renderer fault",
    "the fault fires mid-render",
    [
      "partial Artifacts are discarded",
      "ordered Diagnostics are preserved",
    ],
    "automated",
    ["#7"],
  ),
  acceptanceEntry(
    "P0-CLI-001",
    "p0",
    "cli",
    "A Source render",
    "it succeeds or fails",
    [
      "success atomically commits exactly one requested Artifact",
      "failure preserves the prior Artifact",
    ],
    "automated",
    ["#8"],
  ),
  acceptanceEntry(
    "P0-CLI-002",
    "p0",
    "cli",
    "Stdin, stdout, format, and destination modes",
    "they are exercised",
    ["behavior matches the CLI contract including binary-terminal denial"],
    "automated",
    ["#8"],
  ),
  acceptanceEntry(
    "P0-CLI-003",
    "p0",
    "cli",
    "Validate and format commands",
    "they run",
    ["each executes only its specified layers and write modes"],
    "automated",
    ["#8"],
  ),
  acceptanceEntry(
    "P0-CLI-004",
    "p0",
    "cli",
    "A watched Source with discovered and missing dependencies",
    "it changes and breaks",
    [
      "rebuilds serialize",
      "failure preserves the prior Artifact",
    ],
    "automated",
    ["#8"],
  ),
  acceptanceEntry(
    "P0-CLI-005",
    "p0",
    "cli",
    "A served Source",
    "it is previewed",
    [
      "the server is loopback-only and constrained",
      "it exposes current Diagnostics rather than stale content",
    ],
    "automated",
    ["#8"],
  ),
  acceptanceEntry(
    "P0-CLI-006",
    "p0",
    "cli",
    "Every CLI command",
    "it exits",
    [
      "exit codes, stdout purity, finite JSON, NDJSON lifecycle, quiet mode, and signal cleanup match the CLI contract",
    ],
    "automated",
    ["#8"],
  ),
  acceptanceEntry(
    "P0-CLI-007",
    "p0",
    "cli",
    "Capability and version reports",
    "they are requested",
    ["they are complete, deterministic, local-only, and truthful"],
    "automated",
    ["#8"],
  ),
  acceptanceEntry(
    "P0-EQN-001",
    "p0",
    "equation",
    "Readable equation Blocks",
    "they render",
    ["HTML carries visual plus MathML pairs and visual Artifacts stay consistent"],
    "automated",
    ["#7"],
  ),
  acceptanceEntry(
    "P0-EQN-002",
    "p0",
    "equation",
    "Invalid equations and raw LaTeX",
    "they are compiled",
    [
      "invalid equations diagnose precisely",
      "raw LaTeX is denied by default and bounded when explicitly trusted",
    ],
    "automated",
    ["#7", "#9"],
  ),
  acceptanceEntry(
    "P0-EQN-003",
    "p0",
    "equation",
    "Native mathematics grammar",
    "readable Source is compiled",
    [
      "closed-grammar Source parses into semantic trees with spelling-normalized identity",
      "unsupported notation is refused with stable-coded sub-ranged diagnostics and no silent fallback",
      "renderer-derived KaTeX TeX carries MathML for every native tree",
    ],
    "automated",
    ["#7", "#12"],
  ),
  acceptanceEntry(
    "P0-DRV-001",
    "p0",
    "derivation",
    "A derivation Block",
    "it is compiled",
    [
      "ordered `- expression:` steps parse into step trees with annotations and stable step-range diagnostics",
      "it renders aligned with annotations in step-then-annotation order",
    ],
    "automated",
    ["#7", "#12"],
  ),
  acceptanceEntry(
    "P0-MMD-001",
    "p0",
    "mermaid",
    "A Mermaid Block",
    "it renders offline",
    [
      "the SVG is deterministic, sanitized, and accessible",
      "active or invalid content fails safely",
    ],
    "automated",
    ["#7", "#9"],
  ),
  acceptanceEntry(
    "P0-PLT-001",
    "p0",
    "plot",
    "A native plot Block",
    "it is compiled",
    [
      "function and point series parse into authored-order series with evaluable trees and canonical exact decimals",
      "it renders deterministic browser-free SVG with gaps across undefined regions, error bars, legend, and accessible title and description",
    ],
    "automated",
    ["#51", "#58"],
  ),
  acceptanceEntry(
    "P0-PLT-002",
    "p0",
    "plot",
    "Invalid plot declarations and undefined regions",
    "they are compiled",
    [
      "unbound names, non-evaluable constructs, invalid data, and log-domain violations diagnose with stable codes and item ranges",
      "undefined samples gap without diagnostics and all-undefined series warn without failing",
    ],
    "automated",
    ["#51", "#58"],
  ),
  acceptanceEntry(
    "P0-CHT-001",
    "p0",
    "chart",
    "A bar-family chart Block",
    "it is compiled",
    [
      "bar, grouped-bar, stacked-bar, and histogram series parse with authored category order and resolved histogram edges",
      "bin counts derive deterministically at render while out-of-range values and unordered edges error",
    ],
    "automated",
    ["#51", "#58"],
  ),
  acceptanceEntry(
    "P0-GEO-001",
    "p0",
    "geometry",
    "A native geometry Block",
    "it is compiled",
    [
      "primitives, bounded constructions, and characteristic-point branch picks resolve in authored backward-only order with canonical exact decimals",
      "it renders deterministic browser-free SVG with computed measurements distinct from authored labels and an accessible title and description",
    ],
    "automated",
    ["#51", "#59"],
  ),
  acceptanceEntry(
    "P0-GEO-002",
    "p0",
    "geometry",
    "Invalid geometry declarations and contradictory constraints",
    "they are compiled",
    [
      "forward references, ambiguous branches, out-of-range picks, degenerate inputs, and contradictory constraints diagnose with stable codes and item ranges",
      "out-of-bounds resolutions and unused invisible guides warn without failing",
    ],
    "automated",
    ["#51", "#59"],
  ),
  acceptanceEntry(
    "P0-CHE-001",
    "p0",
    "chemistry",
    "Native formula, reaction, and structure Blocks",
    "they are compiled",
    [
      "formulas parse a case-sensitive deterministic expression grammar with isotope, charge, subscript, group, and adduct digit resolution into a semantic tree",
      "reactions parse one species line with the closed three-token arrow and registered state labels, plus an opt-in balance: check over the author's own declarations",
      "structures accept flat atom/bond/label records with mandatory authored coordinates and admitted wedge/hash stereo and attachment points",
    ],
    "automated",
    ["#51", "#64"],
  ),
  acceptanceEntry(
    "P0-CHE-002",
    "p0",
    "chemistry",
    "Invalid or information-diminishing chemistry declarations",
    "they are compiled or normalized",
    [
      "unknown elements, malformed syntax, unbalanced reactions, and unknowable attachment-atom facts diagnose with stable sub-ranged codes",
      "unspecified stereochemistry stays unspecified, specified enantiomers remain distinct, and isotopic distinctions survive normalization without invention or loss",
    ],
    "automated",
    ["#51", "#64"],
  ),
  acceptanceEntry(
    "P0-TIM-001",
    "p0",
    "timing",
    "Native timing Blocks over one shared cycle-or-time scale",
    "they are compiled",
    [
      "bounded wave: strings and intervals: duration records parse into authored-order intervals over one registered interval-state enum with edge states admitted as intervals",
      "bus value text and width stay authored display facts while contiguous groups and signal@boundary markers and arrows resolve against declared signals",
      "authored timing is preserved rather than certified",
    ],
    "automated",
    ["#51", "#63"],
  ),
  acceptanceEntry(
    "P0-TIM-002",
    "p0",
    "timing",
    "Invalid or over-limit timing declarations",
    "they are compiled",
    [
      "invalid interval spellings, wrong scale form, non-contiguous or over-nested groups, unresolvable anchors, and malformed text diagnose with stable sub-ranged azeforge.timing codes",
      "every exceeded ceiling diagnoses in the same sub-ranged namespace and the family registers no warnings",
    ],
    "automated",
    ["#51", "#63"],
  ),
  acceptanceEntry(
    "P0-DIA-001",
    "p0",
    "diagram",
    "Native general-diagram Blocks in the four registered modes",
    "they are compiled",
    [
      "one flat ordered declaration list resolves nodes, groups, ports and edges in two passes, so forward references are legal and an undeclared name is never guessed",
      "group containment, the closed shape vocabulary, authored-order edges and the Block-level flow hint parse into inspectable semantics while ports stay undirected attachment points",
      "layout is total and deterministic, and renderer-derived coordinates stay fingerprint-only so connectivity never comes from placement",
    ],
    "automated",
    ["#51", "#60"],
  ),
  acceptanceEntry(
    "P0-DIA-002",
    "p0",
    "diagram",
    "Invalid or over-limit diagram declarations",
    "they are compiled",
    [
      "unknown modes, shapes, sides and flows, duplicate names and ports, unresolved and qualified references, group endpoints and cycles, forbidden undirected edges and the invalid-tree reasons diagnose with stable sub-ranged azeforge.diagram codes",
      "every exceeded ceiling diagnoses in the same sub-ranged namespace and an invalid Block never yields a partial diagram",
      "the four mode-scoped warnings report isolated nodes, disconnected components, unused ports and empty groups without failing the Block",
    ],
    "automated",
    ["#51", "#60"],
  ),
  acceptanceEntry(
    "P0-MOD-001",
    "p0",
    "models",
    "Native sequence, state, entity and class Blocks in one models Plugin family",
    "they are compiled",
    [
      "sequence parses its two named body sections into participant order and an ordered timeline of messages, alt and loop fragments and notes, with per-scope activation balance and resolved defaults for message form and participant kind",
      "state parses one flat item collection with composite states, initial and final pseudo-states and transitions whose trigger, guard and action stay three separate authored fields, and validates reachability per scope",
      "entity parses entities with keys-collection attributes, validated references on foreign keys and cardinality-bearing relationships, and class parses classes and interfaces with ordered members, structured operation parameters and closed relationship forms",
      "every authored text field stays literal, authored order is hash-significant at every nesting depth, and renderer-derived geometry never enters contentHash",
    ],
    "automated",
    ["#51", "#61"],
  ),
  acceptanceEntry(
    "P0-MOD-002",
    "p0",
    "models",
    "Invalid or over-limit model declarations",
    "they are compiled",
    [
      "unknown item kinds, unknown and duplicate fields, invalid and duplicate names, unresolved references and values outside a registered enum diagnose with stable sub-ranged azeforge.sequence, azeforge.state, azeforge.entity and azeforge.class codes",
      "unbalanced activations, empty fragments, invalid note spans, missing or multiple initials, transitions into an initial or out of a final, invalid references, duplicate keys, inheritance cycles, invalid relationship targets and multiplicity on a ranked relationship all diagnose, and every exceeded count ceiling reports through limit-exceeded with its subject, count and limit while an over-ceiling text or name reports invalid-text or invalid-name with its own count and limit",
      "reachability, dead ends, unused participants, missing primary keys and unrelated classifiers stay warnings, and an invalid Block never yields a partial figure",
    ],
    "automated",
    ["#51", "#61"],
  ),
  acceptanceEntry(
    "P0-ENG-001",
    "p0",
    "engineering",
    "Native control and free-body Blocks",
    "they are compiled",
    [
      "control parses one flat ordered declaration list of SISO blocks, summing junctions and directional boundary stubs wired by anonymous signal edges, resolving every reference in two passes so forward references are legal and an undeclared name is never guessed",
      "the `signs:` domain expression pairs positionally with a junction's in-edges in authored declaration order, so its length and order are hash-significant, and a takeoff exists only as implicit fan-out expression plus render",
      "free-body parses a closed body, point, line, force, moment, axes, angle-mark and dimension vocabulary in one y-up unitless exact-decimal frame, with point-name or bounded `(x, y)` attachments and exactly one direction form per vector",
      "the `scale:` switch makes every force length derived from its magnitude and forbids authored lengths, while without it every force authors a schematic length and no magnitude is permitted",
      "both directives lay out and render deterministically, and renderer-derived rays, arrow endpoints, coordinates, ranks, viewBox and positional ids stay fingerprint-only so they never enter contentHash",
    ],
    "automated",
    ["#51", "#65"],
  ),
  acceptanceEntry(
    "P0-ENG-002",
    "p0",
    "engineering",
    "Invalid or over-limit engineering declarations",
    "they are compiled",
    [
      "unknown declarations, unknown and duplicate fields, missing required fields, duplicate names, unresolved references and malformed labels diagnose with stable sub-ranged azeforge.control and azeforge.free-body codes",
      "the four bounded control topology rules report a non-single in-edge into a single-input target, an edge into an input stub or out of an output stub, and a summing junction with no in-edges, while self-loops stay legal and no further topology plausibility is checked",
      "a summing-sign count that does not match the junction's in-edge count reports both counts, and an unknown or malformed sign token reports its own code",
      "free-body reports a relative direction form that does not name a line, an out-of-range or conflicting scale form, more than one direction form on one vector, a malformed attachment expression and every exceeded ceiling",
      "unconnected ports, unused invisible declarations and objects outside an explicit authored bounds report as the family's only warnings, and an invalid Block never yields a partial figure",
    ],
    "automated",
    ["#51", "#65"],
  ),
  acceptanceEntry(
    "P0-STR-001",
    "p0",
    "structured-content",
    "Native typed tables, algorithms, statements with proofs and worked examples",
    "they are compiled",
    [
      "the closed seven-type column system declares prose, text, integer, decimal, quantity, boolean and math columns, resolves each column's alignment from its type unless `align:` overrides it, and keeps a unitless quantity column dimensionally consistent without ever converting",
      "missing values stay missing: a cell omitted from a row record is three-way distinct from `0`, from an empty string and from a misspelled key, and every authored declaration order, group membership and statement order stays hash-significant",
      "one procedure per algorithm Block parses the six closed statement forms in the shared two-space record tree, and the pseudocode expression context is parsed but never evaluated, with a reflow-invariant canonical spelling so whitespace never changes identity",
      "a statement requires one closed `kind:` and contains at most one proof, whose QED mark is renderer-derived and never authored, and a worked example composes problem, givens, ordered steps and result as one numbered object holding separate equation and derivation Blocks",
      "all four directives render through HTML, SVG, PNG and PDF with their semantic content preserved: tables carry real `<caption>` and grouped headers, algorithms render nested ordered lists, and renderer-derived labels stay out of contentHash",
    ],
    "automated",
    ["#51", "#66"],
  ),
  acceptanceEntry(
    "P0-STR-002",
    "p0",
    "structured-content",
    "Invalid or over-limit structured technical content",
    "they are compiled",
    [
      "an unknown row key, an empty row, a value that does not match its column type, an unregistered column type, a unit on a non-quantity column and a column unit that is not registered all report stable-ranged azeforge.table codes, with related locations on the column declarations a grouping failure cites",
      "a group that spans non-adjacent columns, lists one column or repeats a member reports its own code, and a quantity cell that mixes dimensions in a unitless column reports the dimension mismatch without converting anything",
      "algorithm reports an unknown statement, a missing body, an assignment in a condition, an invalid assignment target and an unknown expression token at the token's own sub-range",
      "statement reports an unknown or absent kind, a missing text and a present-but-empty proof, while example reports a missing problem, missing steps and a whitespace-only step",
      "every family ceiling is fail-closed and reports through a stable limit code with its subject, count and limit, and an invalid Block never yields a partial figure",
    ],
    "automated",
    ["#51", "#66"],
  ),
  acceptanceEntry(
    "P0-CMP-001",
    "p0",
    "composition",
    "Document numbering, references and the figure wrapper",
    "they are compiled",
    [
      "one document-wide identifier namespace covers every Block id and every bibliography key, so a collision reports every site as a related location and an `@name` matching nothing reports an unresolved reference",
      "one flat numbering class per object kind assigns document-order numbers, including to Blocks nested inside figure, callout, blockquote, list, statement and example content, and `number: false` consumes no counter value",
      "a forward reference to a figure declared later resolves to the final number without a second pass by the author, and referencing an unnumbered target is legal and renders its caption or bare kind word",
      "the `:::: figure` wrapper numbers ordinary Markdown content and escape-hatch bodies, and a figure wrapping a numbered plot consumes both a figure number and a plot number",
      "every reference renders as a link to its target's anchor in HTML while the visible text and numbers survive unchanged in SVG, PNG and PDF",
    ],
    "automated",
    ["#51", "#67"],
  ),
  acceptanceEntry(
    "P0-CMP-002",
    "p0",
    "composition",
    "Citations, bibliography and endnote-rendered footnotes",
    "they are compiled",
    [
      "`@`-tokens are live only in Markdown prose contexts and inert inside code spans, mathematical payloads and literal fields, so a bare reference, a parenthetical group and a mixed group of object references and citations all resolve",
      "a locator attaches only to a Citation record and reports its own diagnostic on any other target, and a citation with no bibliography directive in the document is refused",
      "the numeric style numbers cited entries in first-citation order while author-year sorts by author, year and title, derives suffixes for colliding labels and errors per entry when an author has no family name",
      "an uncited bibliography entry is excluded from the rendered list and warns, and the bibliography is the only place the document-local reference list is declared",
      "footnote markers number in first-reference order, definitions render once in a document-end endnotes section with one backlink per marker, and missing, duplicate and nested definitions each report their own code",
    ],
    "automated",
    ["#51", "#67"],
  ),
  acceptanceEntry(
    "P0-OUT-001",
    "p0",
    "artifact",
    "The Golden report under all three Themes",
    "it renders to HTML, SVG, PNG, and PDF",
    ["every semantic object is present with format-appropriate proof"],
    "automated",
    ["#10", "#12"],
  ),
  acceptanceEntry(
    "P0-OUT-002",
    "p0",
    "artifact",
    "Every rendered Artifact",
    "its bytes and manifest are inspected",
    ["it is self-contained, profile/MIME/geometry-correct, and truthfully hashed"],
    "automated",
    ["#10", "ADR 0002"],
  ),
  acceptanceEntry(
    "P0-OUT-003",
    "p0",
    "artifact",
    "Pagination boundary fixtures",
    "they render to PDF",
    ["every keep, split, scaling, and oversize-error rule holds"],
    "automated",
    ["#10"],
  ),
  acceptanceEntry(
    "P0-OUT-004",
    "p0",
    "artifact",
    "Reference fixtures compiled twice in fresh directories under one fingerprint",
    "both builds are compared",
    [
      "contentHash, assetManifestHash, renderer fingerprint, Artifact bytes, and artifactHash are equal",
      "trivia and path moves preserve identity while semantic, Theme, asset, and dependency changes invalidate only the specified identities",
    ],
    "automated",
    ["#10", "ADR 0002"],
  ),
  acceptanceEntry(
    "P0-OUT-005",
    "p0",
    "artifact",
    "A missing browser or format adapter",
    "an affected format is requested",
    [
      "a structured remedy is reported",
      "unaffected formats remain usable",
    ],
    "automated",
    ["#10"],
  ),
  acceptanceEntry(
    "P0-SEC-001",
    "p0",
    "security",
    "Traversal and symlink escapes",
    "they are attempted",
    ["the root confinement rejects them without leaking host paths"],
    "automated",
    ["#9"],
  ),
  acceptanceEntry(
    "P0-SEC-002",
    "p0",
    "security",
    "An offline compilation",
    "its requests are observed",
    ["no non-loopback request or external name resolution occurs"],
    "automated",
    ["#9"],
  ),
  acceptanceEntry(
    "P0-SEC-003",
    "p0",
    "security",
    "Raw or embedded active content, unsafe protocols, malformed assets, and unsafe sanitizer rewrites",
    "they are compiled",
    ["each is rejected"],
    "automated",
    ["#9"],
  ),
  acceptanceEntry(
    "P0-SEC-004",
    "p0",
    "security",
    "Capability, time, memory, Diagnostic, asset, temp, and Artifact bounds",
    "a bound is exceeded",
    ["compilation fails closed without partial Artifacts"],
    "automated",
    ["#9"],
  ),
  acceptanceEntry(
    "P0-COMPAT-001",
    "p0",
    "compatibility",
    "Supported Node and OS combinations",
    "the suite runs",
    ["all pass and system fonts, locales, and timezones do not alter Artifact eligibility"],
    "automated",
    ["#10"],
  ),
  acceptanceEntry(
    "P0-AUTHOR-001",
    "p0",
    "author",
    "A temporary copy of the Golden report",
    "the modify-equation and table-value loop runs",
    [
      "edits change content and Artifact identities while presence checks still pass",
      "the missing-dx step fails line-specifically without committing an Artifact",
      "restoration passes",
    ],
    "automated",
    ["#12"],
  ),
  acceptanceEntry(
    "P05-CIR-001",
    "p0.5",
    "circuit",
    "Five approved Circuit Sources",
    "they normalize",
    ["each matches its exact semantic oracle and content hash"],
    "manual",
    ["#11"],
  ),
  acceptanceEntry(
    "P05-CIR-002",
    "p0.5",
    "circuit",
    "The closed component, value, and annotation union",
    "focused conformance runs",
    ["every member passes"],
    "manual",
    ["#11"],
  ),
  acceptanceEntry(
    "P05-CIR-003",
    "p0.5",
    "circuit",
    "Unknown, duplicate, terminal, quantity, limit, and convention failures",
    "they are compiled",
    ["stable typed ranged Diagnostics are emitted"],
    "manual",
    ["#11", "#9"],
  ),
  acceptanceEntry(
    "P05-CIR-004",
    "p0.5",
    "circuit",
    "Unused nodes and disconnected residual subgraphs",
    "they are compiled",
    ["each warns without cascades"],
    "manual",
    ["#11"],
  ),
  acceptanceEntry(
    "P05-CIR-005",
    "p0.5",
    "circuit",
    "Circuit topology",
    "it is derived",
    ["only explicit terminal-node relations create connectivity"],
    "manual",
    ["#11"],
  ),
  acceptanceEntry(
    "P05-CIR-006",
    "p0.5",
    "circuit",
    "Directional hints, limits, labels, reference ground, and unsupported layout",
    "they are compiled",
    ["behavior matches the Circuit contract"],
    "manual",
    ["#11"],
  ),
  acceptanceEntry(
    "P05-OUT-001",
    "p0.5",
    "circuit-artifact",
    "Five Circuits under the required convention and Theme matrix",
    "they render canonical accessible SVG",
    ["every cell passes"],
    "manual",
    ["#11"],
  ),
  acceptanceEntry(
    "P05-OUT-002",
    "p0.5",
    "circuit-artifact",
    "Five Circuits embedded through four formats",
    "they render",
    ["labels stay legible after semantic connectivity passes"],
    "manual",
    ["#11", "#10"],
  ),
  acceptanceEntry(
    "P05-OUT-003",
    "p0.5",
    "circuit-artifact",
    "Canonical Circuit SVG bytes across claimed pilot platforms",
    "they are compared",
    ["bytes match under the pinned closure"],
    "manual",
    ["#11"],
  ),
  acceptanceEntry(
    "P05-ADAPTER-001",
    "p0.5",
    "circuit-adapter",
    "The selected Circuit adapter",
    "probes run",
    ["restricted execution, cleanup, timeout, budget, and availability all pass"],
    "manual",
    ["#11"],
  ),
  acceptanceEntry(
    "P05-ADAPTER-002",
    "p0.5",
    "circuit-adapter",
    "Missing, disabled, or incompatible engines",
    "a Circuit render is requested",
    [
      "a structured exact remedy is reported",
      "non-Circuit Documents never probe the adapter",
    ],
    "manual",
    ["#11"],
  ),
  acceptanceEntry(
    "P05-PLATFORM-001",
    "p0.5",
    "circuit-platform",
    "Every supported-pilot-platform manifest row",
    "installation and remedy rehearsal run",
    ["every row passes"],
    "manual",
    ["#11"],
  ),
  acceptanceEntry(
    "P05-SYNTAX-001",
    "p0.5",
    "circuit-syntax",
    "Five lecturer-reviewed Source and semantic pairs",
    "they are approved",
    ["they freeze Circuit body syntax 1.0.0 as the conformance corpus"],
    "manual",
    ["#11"],
  ),
  acceptanceEntry(
    "P05-PILOT-001",
    "p0.5",
    "circuit-pilot",
    "The five-fixture set with immutable evidence",
    "lecturers review it",
    [
      "two lecturers approve the set",
      "one course owner approves usefulness and convention",
    ],
    "manual",
    ["#11"],
  ),
]);

export const REQUIRED_P0_IDS: readonly string[] = Object.freeze(
  ACCEPTANCE_ENTRIES.filter((item) => item.gate === "p0" && item.required).map(
    (item) => item.id,
  ),
);

export const AUTOMATED_P0_IDS: readonly string[] = Object.freeze(
  ACCEPTANCE_ENTRIES.filter(
    (item) => item.gate === "p0" && item.required && item.evidence === "automated",
  ).map((item) => item.id),
);

/**
 * Coverage gate: every required automated P0 entry needs declared evidence,
 * and no declaration may name an unknown ID.
 */
export function checkAcceptanceCoverage(
  declaredIds: readonly string[],
): { readonly missing: readonly string[]; readonly unknown: readonly string[] } {
  const known = new Set(ACCEPTANCE_ENTRIES.map((item) => item.id));
  const declared = new Set(declaredIds);
  return {
    missing: AUTOMATED_P0_IDS.filter((id) => !declared.has(id)),
    unknown: [...declared].filter((id) => !known.has(id)),
  };
}

/**
 * The suite file that executes each required automated P0 entry's contract.
 *
 * The catalog says what must hold; this registry says where it is executed, so
 * the acceptance runner can report a result for every automated entry instead
 * of restating the contract in a second place. `test/acceptance.test.mjs`
 * proves the catalog, Golden, determinism, pagination, author-loop, and
 * visual-bound entries directly; the remaining entries name the suite file
 * that owns their observable contract.
 */
export interface AcceptanceSuiteEvidence {
  readonly id: string;
  readonly suite: string;
}

export const ACCEPTANCE_SUITE_EVIDENCE: readonly AcceptanceSuiteEvidence[] = Object.freeze([
  { id: "P0-DOC-001", suite: "test/compiler.test.mjs" },
  { id: "P0-DOC-002", suite: "test/compiler.test.mjs" },
  { id: "P0-DOC-003", suite: "test/cli.test.mjs" },
  { id: "P0-DOC-004", suite: "test/acceptance.test.mjs" },
  { id: "P0-DIAG-001", suite: "test/cli.test.mjs" },
  { id: "P0-DIAG-002", suite: "test/cli.test.mjs" },
  { id: "P0-DIAG-003", suite: "test/fail-closed.test.mjs" },
  { id: "P0-PLUGIN-001", suite: "test/equation.test.mjs" },
  { id: "P0-PLUGIN-002", suite: "test/fail-closed.test.mjs" },
  { id: "P0-CLI-001", suite: "test/acceptance.test.mjs" },
  { id: "P0-CLI-002", suite: "test/cli.test.mjs" },
  { id: "P0-CLI-003", suite: "test/format.test.mjs" },
  { id: "P0-CLI-004", suite: "test/watch-serve.test.mjs" },
  { id: "P0-CLI-005", suite: "test/watch-serve.test.mjs" },
  { id: "P0-CLI-006", suite: "test/cli.test.mjs" },
  { id: "P0-CLI-007", suite: "test/acceptance.test.mjs" },
  { id: "P0-EQN-001", suite: "test/equation.test.mjs" },
  { id: "P0-EQN-002", suite: "test/equation.test.mjs" },
  { id: "P0-EQN-003", suite: "test/native-math.test.mjs" },
  { id: "P0-DRV-001", suite: "test/derivation.test.mjs" },
  { id: "P0-PLT-001", suite: "test/plot.test.mjs" },
  { id: "P0-PLT-002", suite: "test/plot.test.mjs" },
  { id: "P0-CHT-001", suite: "test/plot.test.mjs" },
  { id: "P0-GEO-001", suite: "test/geometry.test.mjs" },
  { id: "P0-GEO-002", suite: "test/geometry.test.mjs" },
  { id: "P0-CHE-001", suite: "test/chemistry.test.mjs" },
  { id: "P0-CHE-002", suite: "test/chemistry.test.mjs" },
  { id: "P0-TIM-001", suite: "test/timing.test.mjs" },
  { id: "P0-TIM-002", suite: "test/timing.test.mjs" },
  { id: "P0-DIA-001", suite: "test/diagram.test.mjs" },
  { id: "P0-DIA-002", suite: "test/diagram-block.test.mjs" },
  { id: "P0-MOD-001", suite: "test/models.test.mjs" },
  { id: "P0-MOD-002", suite: "test/models-block.test.mjs" },
  { id: "P0-ENG-001", suite: "test/engineering.test.mjs" },
  { id: "P0-ENG-002", suite: "test/engineering-block.test.mjs" },
  { id: "P0-STR-001", suite: "test/structured-content.test.mjs" },
  { id: "P0-STR-002", suite: "test/structured-content.test.mjs" },
  { id: "P0-CMP-001", suite: "test/composition.test.mjs" },
  { id: "P0-CMP-002", suite: "test/composition.test.mjs" },
  { id: "P0-MMD-001", suite: "test/mermaid.test.mjs" },
  { id: "P0-OUT-001", suite: "test/acceptance.test.mjs" },
  { id: "P0-OUT-002", suite: "test/acceptance.test.mjs" },
  { id: "P0-OUT-003", suite: "test/acceptance.test.mjs" },
  { id: "P0-OUT-004", suite: "test/acceptance.test.mjs" },
  { id: "P0-OUT-005", suite: "test/pdf.test.mjs" },
  { id: "P0-SEC-001", suite: "test/fail-closed.test.mjs" },
  { id: "P0-SEC-002", suite: "test/mermaid.test.mjs" },
  { id: "P0-SEC-003", suite: "test/equation.test.mjs" },
  { id: "P0-SEC-004", suite: "test/fail-closed.test.mjs" },
  { id: "P0-COMPAT-001", suite: "test/capabilities.test.mjs" },
  { id: "P0-AUTHOR-001", suite: "test/acceptance.test.mjs" },
]);

/** Every declared suite file, deduplicated and sorted. */
export const ACCEPTANCE_SUITE_FILES: readonly string[] = Object.freeze([
  ...new Set(ACCEPTANCE_SUITE_EVIDENCE.map((evidence) => evidence.suite)),
].sort());

const ENTRY_BY_ACCEPTANCE_ID: Record<string, AcceptanceEntry | undefined> = Object.fromEntries(
  ACCEPTANCE_ENTRIES.map((entry) => [entry.id, entry]),
);

/**
 * Coverage gate for the suite registry: every required automated P0 entry needs
 * exactly one suite, and no declaration may name an unknown or repeated ID.
 */
export function checkAcceptanceSuiteEvidence(
  declared: readonly AcceptanceSuiteEvidence[],
): {
  readonly missing: readonly string[];
  readonly unknown: readonly string[];
  readonly duplicate: readonly string[];
} {
  const seen = new Set<string>();
  const duplicate: string[] = [];
  for (const evidence of declared) {
    if (seen.has(evidence.id)) duplicate.push(evidence.id);
    seen.add(evidence.id);
  }
  return { ...checkAcceptanceCoverage([...seen]), duplicate };
}

export interface TestSummary {
  readonly pass: number;
  readonly fail: number;
  /** The first failing test line, for an actionable report detail. */
  readonly failure?: string;
}

/**
 * The summary a TAP `node --test` run prints, so a crashed suite is never
 * mistaken for a green one: `undefined` means the output carried no summary and
 * the caller must fall back to the exit status.
 */
export function parseTestSummary(output: string): TestSummary | undefined {
  const lines = output.split(/\r?\n/).map((line) => line.trim());
  const count = (label: "pass" | "fail"): number | undefined => {
    const pattern = new RegExp(`^#\\s*${label}\\s+(\\d+)$`);
    for (const line of lines) {
      const match = pattern.exec(line);
      if (match !== null) return Number(match[1]);
    }
    return undefined;
  };
  const pass = count("pass");
  const fail = count("fail");
  if (pass === undefined || fail === undefined) return undefined;
  const failure = lines.find((line) => line.startsWith("not ok "));
  return failure === undefined ? { pass, fail } : { pass, fail, failure };
}

export interface AcceptanceSuiteOutcome {
  readonly suite: string;
  readonly pass: boolean;
  readonly detail: string;
}

export interface AcceptanceSuiteResult {
  readonly id: string;
  readonly name: string;
  readonly pass: boolean;
  readonly detail: string;
}

/**
 * One acceptance-report result per required automated P0 entry, from the
 * outcome of the suite that executes it. Entries the runner proved directly are
 * left out: the runner's own check is authoritative for them, and a report must
 * not carry two verdicts for one entry.
 */
export function catalogResultsFromSuites(
  outcomes: readonly AcceptanceSuiteOutcome[],
  executedIds: readonly string[] = [],
): readonly AcceptanceSuiteResult[] {
  const executed = new Set(executedIds);
  const bySuite = new Map(outcomes.map((outcome) => [outcome.suite, outcome]));
  const results: AcceptanceSuiteResult[] = [];
  for (const evidence of ACCEPTANCE_SUITE_EVIDENCE) {
    if (executed.has(evidence.id)) continue;
    const outcome = bySuite.get(evidence.suite);
    results.push({
      id: evidence.id,
      name: ENTRY_BY_ACCEPTANCE_ID[evidence.id]?.when ?? evidence.id,
      pass: outcome?.pass === true,
      detail:
        outcome === undefined
          ? `${evidence.suite}: did not run`
          : `${evidence.suite}: ${outcome.detail}`,
    });
  }
  return results;
}

export const acceptanceJsonSchema: JsonValue = Object.freeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: ACCEPTANCE_SCHEMA_ID,
  type: "object",
  required: ["schema", "schemaVersion", "catalog", "entries"],
  additionalProperties: false,
  properties: {
    schema: { const: ACCEPTANCE_SCHEMA_ID },
    schemaVersion: { const: ACCEPTANCE_SCHEMA_VERSION },
    catalog: {
      type: "object",
      required: ["id", "version"],
      additionalProperties: false,
      properties: {
        id: { const: ACCEPTANCE_CATALOG_ID },
        version: { const: ACCEPTANCE_CATALOG_VERSION },
      },
    },
    entries: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: [
          "id",
          "gate",
          "area",
          "given",
          "when",
          "then",
          "evidence",
          "required",
          "contracts",
        ],
        additionalProperties: false,
        properties: {
          id: { type: "string", pattern: "^P0[A-Z0-9]*-[A-Z]+-[0-9]{3}$" },
          gate: { enum: ["p0", "p0.5"] },
          area: { type: "string", minLength: 1 },
          given: { type: "string", minLength: 1 },
          when: { type: "string", minLength: 1 },
          then: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
          evidence: { enum: ["automated", "manual"] },
          required: { const: true },
          contracts: {
            type: "array",
            minItems: 1,
            items: { type: "string", minLength: 1 },
          },
        },
      },
    },
  },
});

export interface AcceptanceCatalogDocument {
  readonly schema: typeof ACCEPTANCE_SCHEMA_ID;
  readonly schemaVersion: typeof ACCEPTANCE_SCHEMA_VERSION;
  readonly catalog: Readonly<{ id: typeof ACCEPTANCE_CATALOG_ID; version: typeof ACCEPTANCE_CATALOG_VERSION }>;
  readonly entries: readonly AcceptanceEntry[];
}

/**
 * Canonical catalog document with logical identity azeforge.acceptance/v1.
 */
export function createAcceptanceCatalog(): AcceptanceCatalogDocument {
  return {
    schema: ACCEPTANCE_SCHEMA_ID,
    schemaVersion: ACCEPTANCE_SCHEMA_VERSION,
    catalog: { id: ACCEPTANCE_CATALOG_ID, version: ACCEPTANCE_CATALOG_VERSION },
    entries: ACCEPTANCE_ENTRIES,
  };
}
