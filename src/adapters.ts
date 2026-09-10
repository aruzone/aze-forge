/**
 * Trusted adapter entry point: registry/adapter contracts, reviewed
 * built-ins, and the root-confined filesystem asset adapter.
 *
 * Construction is side-effect-free: no import-time registration, package
 * discovery, npm lookup, or ambient machine probing. Bad trusted
 * configuration is a configuration error, distinct from Source diagnostics.
 * The runtime compiler remains Node-oriented; hosts supply their own
 * read-only asset resolvers for non-filesystem assets.
 */

export {
  REGISTRY_CONFORMANCE_SEAM_VERSION,
  assertRegistryDescriptorsImmutable,
  freezeRegistryForCompiler,
  getBuiltInRegistry,
  isWellFormedVersionRange,
  resolveRegistry,
  satisfiesSemverRange,
  validateRegistry,
} from "./registry.js";
export type { ResolvedRegistry } from "./registry.js";

export {
  MAX_IMAGE_BYTES,
  MAX_IMAGE_DIMENSION_PX,
  MAX_IMAGE_PIXELS,
  assetManifestHash,
  checkSvg,
  isAbsoluteSource,
  isContained,
  isRemoteSource,
  resolveProjectImages,
} from "./assets.js";
export type { ImageResolution, SvgCheck } from "./assets.js";

export {
  CALLOUT_HTML_BLOCK_RENDERER_ID,
  CALLOUT_HTML_BLOCK_RENDERER_VERSION,
  calloutHtmlBlockRenderer,
  calloutPlugin,
} from "./callout.js";
export {
  DERIVATION_HTML_BLOCK_RENDERER_ID,
  DERIVATION_HTML_BLOCK_RENDERER_VERSION,
  derivationHtmlBlockRenderer,
  derivationPlugin,
} from "./derivation.js";
export {
  EQUATION_HTML_BLOCK_RENDERER_ID,
  EQUATION_HTML_BLOCK_RENDERER_VERSION,
  EquationSanitizerError,
  HTML_RENDERER_ID,
  HTML_RENDERER_VERSION,
  KatexCssError,
  equationHtmlBlockRenderer,
  equationPlugin,
  htmlRendererDescriptor,
} from "./equation.js";
export {
  MERMAID_HTML_BLOCK_RENDERER_ID,
  MERMAID_HTML_BLOCK_RENDERER_VERSION,
  MermaidSanitizerError,
  mermaidHtmlBlockRenderer,
  mermaidPlugin,
} from "./mermaid.js";
export {
  BrowserCapabilityError,
  CHROME_HEADLESS_SHELL_VERSION,
  MermaidBrowserParseError,
  MermaidBrowserUnavailableError,
  MermaidCapabilityError,
} from "./mermaid-browser.js";
export {
  PDF_MAX_PAGES,
  PDF_RENDERER_ID,
  PDF_RENDERER_VERSION,
  PDF_REQUIRED_CAPABILITIES,
  PdfArtifactLimitError,
  pdfBlockRenderers,
  pdfRendererDescriptor,
  pinnedPdfBrowserCapability,
} from "./render-pdf.js";
export {
  PNG_DEVICE_SCALE_FACTOR,
  PNG_RENDERER_ID,
  PNG_RENDERER_VERSION,
  PNG_REQUIRED_CAPABILITIES,
  pinnedPngBrowserCapability,
  pngBlockRenderers,
  pngRendererDescriptor,
} from "./render-png.js";
export {
  SVG_RENDERER_ID,
  SVG_RENDERER_VERSION,
  svgBlockRenderers,
  svgRendererDescriptor,
} from "./render-svg.js";
export {
  TABLE_HTML_BLOCK_RENDERER_ID,
  TABLE_HTML_BLOCK_RENDERER_VERSION,
  tableHtmlBlockRenderer,
  tablePlugin,
} from "./table.js";
export {
  CHART_HTML_BLOCK_RENDERER_ID,
  CHART_HTML_BLOCK_RENDERER_VERSION,
  PLOT_HTML_BLOCK_RENDERER_ID,
  PLOT_HTML_BLOCK_RENDERER_VERSION,
  PlotSanitizerError,
  assertPlotFragmentSafe,
  chartHtmlBlockRenderer,
  chartPlugin,
  plotDependencyClosure,
  plotHtmlBlockRenderer,
  plotPlugin,
  renderChartFragment,
  renderPlotFragment,
} from "./plot.js";

export type {
  AnyBlockRenderer,
  AzeBlockPlugin,
  AzeBlockRenderer,
  BlockRendererContext,
  BlockRendererDescriptor,
  PluginDescriptor,
  RendererDescriptor,
} from "./model.js";
