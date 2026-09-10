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
