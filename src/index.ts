/**
 * Compiler entry point: `createCompiler` and high-level compiler operations.
 *
 * Supported public entry points (see the package README):
 *   `@aruzone/aze-forge`        this module — the compiler
 *   `@aruzone/aze-forge/contracts` — public types, JSON schemas and schema identifiers
 *   `@aruzone/aze-forge/adapters`   — registry/adapter contracts and the filesystem asset adapter
 *
 * Only documented exports are supported. Implementation helpers live in
 * non-public modules; do not reach into `dist` deep paths.
 */

export { createCompiler } from "./compiler.js";
export type {
  Compiler,
  CompilerOptions,
  CompilerPolicy,
  CompileOptions,
  CompileResult,
  ParseOptions,
  ParseResult,
  ParsedDocument,
  ValidationResult,
  FormatOptions,
  FormatResult,
  Diagnostic,
  DiagnosticFix,
  DiagnosticFixEdit,
  DiagnosticLimitOptions,
  DiagnosticLocation,
  DiagnosticSeverity,
  RelatedLocation,
  SourcePosition,
  SourceRange,
  Theme,
  Artifact,
  ArtifactHash,
  ArtifactFormat,
  ArtifactMetadata,
  HtmlArtifactMetadata,
  SvgArtifactMetadata,
  PngArtifactMetadata,
  PdfArtifactMetadata,
  AzeDocument,
  AzeBlock,
  ParsedBlock,
  ContentHash,
  Sha256Hash,
  AssetManifestEntry,
} from "./model.js";
export { DEFAULT_RENDER_TIMEOUT_MS } from "./compiler.js";
export { CompilerConfigurationError } from "./configuration-error.js";
export { DEFAULT_DIAGNOSTIC_LIMITS } from "./diagnostics.js";
export { MAX_NESTING_DEPTH } from "./parse.js";
export { builtInThemes, academicTheme, darkPresentationTheme, defaultTheme } from "./theme.js";
export {
  buildCapabilities,
  probeBrowserAvailability,
  probeExecutableAvailability,
  serializeCapabilities,
  CAPABILITY_COMMANDS,
  CAPABILITY_FORMATS,
} from "./capabilities.js";
export type { CapabilitiesReport, EngineAvailability } from "./capabilities.js";
export {
  HTML_MAX_BYTES,
  HTML_MIME_TYPE,
  HTML_PROFILE,
  HTML_SERIALIZER,
} from "./render-html.js";
export {
  SVG_MAX_BYTES,
  SVG_MAX_HEIGHT_PX,
  SVG_MIME_TYPE,
  SVG_PROFILE,
  SVG_SERIALIZER,
  SVG_REQUIRED_CAPABILITIES,
} from "./render-svg.js";
export {
  PNG_MAX_BYTES,
  PNG_MAX_CSS_HEIGHT_PX,
  PNG_MAX_PIXEL_DIMENSION,
  PNG_MAX_PIXELS,
  PNG_MIME_TYPE,
  PNG_PROFILE,
  PNG_SERIALIZER,
} from "./render-png.js";
export {
  PDF_MAX_HTML_BYTES,
  PDF_MIME_TYPE,
  PDF_PRINT_TIMEOUT_MS,
  PDF_PROFILE,
  PDF_SERIALIZER,
} from "./render-pdf.js";
export { TOOL_VERSION } from "./tool-version.js";
export {
  VERSION_SCHEMA_ID,
  VERSION_SCHEMA_VERSION,
  createVersionReport,
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
