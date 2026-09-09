/**
 * Public contracts entry point: types, JSON schemas and schema identifiers.
 *
 * This module imports no Node-only code and initializes no engine: it is
 * safe to import from any ESM environment. The runtime compiler itself
 * remains Node-oriented; a browser-safe contracts entry does not promise
 * browser compilation.
 */

export type {
  AnyBlockRenderer,
  Artifact,
  ArtifactHash,
  ArtifactFormat,
  ArtifactMetadata,
  AssetManifestEntry,
  AzeBlock,
  AzeBlockPlugin,
  AzeBlockRenderer,
  AzeDocument,
  BlockRendererContext,
  BlockRendererDescriptor,
  BlockquoteBlock,
  BreakInline,
  CalloutBlock,
  CodeBlock,
  CodeInline,
  ContentHash,
  DerivationBlock,
  DerivationStep,
  DocumentMetadata,
  EmphasisInline,
  EquationBlock,
  EquationBlockRenderer,
  BlockRenderer,
  HeadingBlock,
  HtmlArtifactMetadata,
  MermaidBlock,
  MermaidBlockRenderer,
  ImageInline,
  Inline,
  InvalidBlock,
  JsonPrimitive,
  JsonValue,
  LinkInline,
  ListBlock,
  ListItem,
  ParsedBlock,
  ParagraphBlock,
  ParsedDocument,
  PluginDescriptor,
  PdfArtifactMetadata,
  PngArtifactMetadata,
  RelatedLocation,
  RendererDescriptor,
  Sha256Hash,
  SourcePosition,
  SourceRange,
  StrongInline,
  TableAlignment,
  TableBlock,
  TableColumn,
  TableData,
  TableGroup,
  TextInline,
  ThematicBreakBlock,
  Theme,
  TypedTableData,
  TypedTableCell,
  SvgArtifactMetadata,
} from "./model.js";

export { TOOL_VERSION } from "./tool-version.js";

export {
  VERSION_SCHEMA_ID,
  VERSION_SCHEMA_VERSION,
  createVersionReport,
  publicSchemaVersions,
  versionJsonSchema,
} from "./version.js";
export type { VersionReport, VersionedSchema } from "./version.js";

export {
  CAPABILITIES_SCHEMA_ID,
  CAPABILITIES_SCHEMA_VERSION,
  capabilitiesJsonSchema,
} from "./capabilities-json.js";

export {
  DIAGNOSTICS_SCHEMA_ID,
  diagnosticsJsonSchema,
} from "./diagnostics-json.js";
export type { DiagnosticsReport } from "./diagnostics-json.js";

export {
  CANONICAL_ARCH,
  CANONICAL_NODE_VERSION,
  CANONICAL_OPERATING_SYSTEM,
  RUNTIME_SUPPORT,
  SUPPORTED_NODE_VERSIONS,
  SUPPORTED_OPERATING_SYSTEMS,
  runtimeSupportJsonSchema,
} from "./runtime-support.js";
export type { RuntimeSupport } from "./runtime-support.js";

export {
  ACCEPTANCE_CATALOG_ID,
  ACCEPTANCE_CATALOG_VERSION,
  ACCEPTANCE_ENTRIES,
  ACCEPTANCE_SCHEMA_ID,
  ACCEPTANCE_SCHEMA_VERSION,
  AUTOMATED_P0_IDS,
  REQUIRED_P0_IDS,
  acceptanceJsonSchema,
} from "./acceptance.js";
export type {
  AcceptanceCatalogDocument,
  AcceptanceEntry,
  AcceptanceEvidence,
  AcceptanceGate,
} from "./acceptance.js";

export { WATCH_EVENT_SCHEMA_ID } from "./watch-events.js";
export type {
  WatchCommand,
  WatchEvent,
  WatchEventKind,
  WatchResultEvent,
  WatchStartedEvent,
  WatchStoppedEvent,
} from "./watch-events.js";

export {
  CALLOUT_BODY_SYNTAX_ID,
  CALLOUT_BODY_SYNTAX_VERSION,
  CALLOUT_PLUGIN_TYPE,
  CALLOUT_PLUGIN_VERSION,
  CALLOUT_VARIANTS,
  calloutDataSchema,
  calloutSourceSchema,
} from "./callout-schemas.js";

export {
  DERIVATION_BODY_SYNTAX_ID,
  DERIVATION_BODY_SYNTAX_VERSION,
  DERIVATION_PLUGIN_TYPE,
  DERIVATION_PLUGIN_VERSION,
  derivationDataSchema,
  derivationSourceSchema,
} from "./derivation-schemas.js";

export {
  EQUATION_BODY_SYNTAX_ID,
  EQUATION_BODY_SYNTAX_VERSION,
  EQUATION_LATEX_LANGUAGE_VERSION,
  EQUATION_PLUGIN_TYPE,
  EQUATION_PLUGIN_VERSION,
  KATEX_VERSION,
  equationDataSchema,
  equationSourceSchema,
} from "./equation-schemas.js";

export {
  MERMAID_BODY_SYNTAX_ID,
  MERMAID_BODY_SYNTAX_VERSION,
  MERMAID_PLUGIN_TYPE,
  MERMAID_PLUGIN_VERSION,
  MERMAID_VERSION,
  mermaidDataSchema,
  mermaidSourceSchema,
} from "./mermaid-schemas.js";

export {
  TABLE_BODY_SYNTAX_ID,
  TABLE_BODY_SYNTAX_VERSION,
  TABLE_PLUGIN_TYPE,
  TABLE_PLUGIN_VERSION,
  tableDataSchema,
  tableSourceSchema,
} from "./table-schemas.js";
