export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

declare const contentHashBrand: unique symbol;
declare const artifactHashBrand: unique symbol;

export type Sha256Hash = `sha256:${string}`;
export type ContentHash = Sha256Hash & {
  readonly [contentHashBrand]: "contentHash";
};
export type ArtifactHash = Sha256Hash & {
  readonly [artifactHashBrand]: "artifactHash";
};

export interface SourcePosition {
  readonly line: number;
  readonly column: number;
  readonly offset: number;
}

export interface SourceRange {
  readonly start: SourcePosition;
  readonly end: SourcePosition;
}

export interface TextInline {
  readonly kind: "text";
  readonly value: string;
}

export interface EmphasisInline {
  readonly kind: "emphasis";
  readonly children: readonly Inline[];
}

export interface StrongInline {
  readonly kind: "strong";
  readonly children: readonly Inline[];
}

export interface CodeInline {
  readonly kind: "code";
  readonly value: string;
}

export interface LinkInline {
  readonly kind: "link";
  readonly href: string;
  readonly children: readonly Inline[];
  readonly title?: string;
  readonly range?: SourceRange;
}

export interface ImageInline {
  readonly kind: "image";
  readonly src: string;
  readonly alt: string;
  readonly title?: string;
  readonly range?: SourceRange;
}

export interface BreakInline {
  readonly kind: "break";
}

export type Inline =
  | TextInline
  | EmphasisInline
  | StrongInline
  | CodeInline
  | LinkInline
  | ImageInline
  | BreakInline;

export interface HeadingBlock {
  readonly kind: "heading";
  readonly level: 1 | 2 | 3 | 4 | 5 | 6;
  readonly children: readonly Inline[];
  readonly range: SourceRange;
  readonly id?: string;
}

export interface ParagraphBlock {
  readonly kind: "paragraph";
  readonly children: readonly Inline[];
  readonly range: SourceRange;
  readonly id?: string;
}

export interface ThematicBreakBlock {
  readonly kind: "thematicBreak";
  readonly range: SourceRange;
  readonly id?: string;
}

export interface BlockquoteBlock {
  readonly kind: "blockquote";
  readonly children: readonly ParsedBlock[];
  readonly range: SourceRange;
  readonly id?: string;
}

export interface ListItem {
  readonly blocks: readonly ParsedBlock[];
  readonly range: SourceRange;
}

export interface ListBlock {
  readonly kind: "list";
  readonly ordered: boolean;
  readonly items: readonly ListItem[];
  readonly range: SourceRange;
  readonly id?: string;
  readonly start?: number;
}

export interface CodeBlock {
  readonly kind: "code";
  readonly value: string;
  readonly range: SourceRange;
  readonly id?: string;
  readonly language?: string;
}

export type TableAlignment = "left" | "center" | "right" | null;

export interface TableData {
  readonly align: readonly TableAlignment[];
  readonly header: readonly (readonly Inline[])[];
  readonly rows: readonly (readonly (readonly Inline[])[])[];
}

/** Typed table v2 shared record shape (catalog typed-table family). */
export interface TableColumn {
  readonly key: string;
  readonly name?: string;
  readonly type?: string;
  readonly unit?: string;
}

export interface TableGroup {
  readonly name: string;
  readonly columns: readonly string[];
}

export type TypedTableCell = readonly Inline[] | string | number | boolean | null;

export interface TypedTableData {
  readonly columns: readonly TableColumn[];
  readonly groups?: readonly TableGroup[];
  readonly rows: readonly (Readonly<Record<string, TypedTableCell>>)[];
}

export interface TableBlock {
  readonly kind: "table";
  readonly data: TableData | TypedTableData;
  readonly range: SourceRange;
  readonly id?: string;
  readonly caption?: readonly Inline[];
  readonly pluginVersion?: string;
}

export interface CalloutBlock {
  readonly kind: "callout";
  readonly variant: string;
  readonly children: readonly ParsedBlock[];
  readonly range: SourceRange;
  readonly id?: string;
  readonly title?: readonly Inline[];
  readonly pluginVersion: string;
}

export interface InvalidBlock {
  readonly kind: "invalid";
  readonly raw: string;
  readonly range: SourceRange;
  readonly diagnosticIndexes: readonly number[];
  readonly originalType?: string;
}
export interface EquationBlock {
  readonly kind: "equation";
  readonly range: SourceRange;
  readonly id?: string;
  readonly pluginVersion: string;
  /** Native equations carry a semantic expression tree; latex is the host-gated escape hatch. */
  readonly notation: "native" | "latex";
  /** Native: the closed-grammar semantic expression tree (identity carrier). */
  readonly tree?: JsonValue;
  /** Native: canonical spelling for formatter re-emission. */
  readonly spelling?: string;
  /** Latex escape hatch: the raw TeX string, hashed as today. */
  readonly tex?: string;
  readonly number?: boolean;
  readonly align?: "left" | "center" | "right";
}

export interface MermaidBlock {
  readonly kind: "mermaid";
  readonly range: SourceRange;
  readonly id?: string;
  readonly pluginVersion: string;
  readonly diagramType: string;
  readonly source: string;
  readonly title?: string;
  readonly description?: string;
}

export interface DerivationStep {
  /** Semantic expression tree of the step (identity carrier). */
  readonly tree: JsonValue;
  /** Canonical spelling of the step expression (formatter re-emission). */
  readonly expression: string;
  readonly annotation?: readonly Inline[];
}

export interface DerivationBlock {
  readonly kind: "derivation";
  readonly range: SourceRange;
  readonly id?: string;
  readonly pluginVersion: string;
  readonly steps: readonly DerivationStep[];
  readonly number?: boolean;
  readonly align?: "left" | "center" | "right";
}

export interface PlotAxisConfig {
  readonly label?: string;
  readonly scale: "linear" | "log";
  readonly min?: string;
  readonly max?: string;
}

export interface PlotFunctionSeries {
  readonly kind: "function";
  readonly label?: string;
  readonly variable: string;
  readonly expression: string;
  readonly tree: JsonValue;
  readonly domainMin: string;
  readonly domainMax: string;
  readonly samples: number;
}

export interface PlotDataPoint {
  readonly x: string;
  readonly y: string;
  readonly error?: string;
  readonly errorLow?: string;
  readonly errorHigh?: string;
}

export interface PlotPointSeries {
  readonly kind: "line" | "scatter";
  readonly label?: string;
  readonly points: readonly PlotDataPoint[];
}

export type PlotSeries = PlotFunctionSeries | PlotPointSeries;

export interface PlotBlock {
  readonly kind: "plot";
  readonly range: SourceRange;
  readonly id?: string;
  readonly pluginVersion: string;
  readonly number?: boolean;
  readonly width: number;
  readonly height: number;
  readonly legend: boolean;
  readonly grid: boolean;
  readonly parameters: Readonly<Record<string, string>>;
  readonly xAxis: PlotAxisConfig;
  readonly yAxis: PlotAxisConfig;
  readonly series: readonly PlotSeries[];
}

export interface ChartBar {
  readonly category: string;
  readonly value: string;
  readonly error?: string;
  readonly errorLow?: string;
  readonly errorHigh?: string;
}

export interface ChartBarSeries {
  readonly kind: "bars";
  readonly label?: string;
  readonly bars: readonly ChartBar[];
}

export interface ChartHistogramSeries {
  readonly kind: "histogram";
  readonly label?: string;
  readonly values: readonly string[];
  readonly edges: readonly string[];
}

export type ChartSeries = ChartBarSeries | ChartHistogramSeries;
export interface ChartBlock {
  readonly kind: "chart";
  readonly range: SourceRange;
  readonly id?: string;
  readonly pluginVersion: string;
  readonly chartType: "bar" | "grouped-bar" | "stacked-bar" | "histogram";
  readonly number?: boolean;
  readonly width: number;
  readonly height: number;
  readonly legend: boolean;
  readonly grid: boolean;
  readonly xLabel?: string;
  readonly yLabel?: string;
  readonly yMin?: string;
  readonly yMax?: string;
  readonly series: readonly ChartSeries[];
}

export interface GeometryBounds {
  readonly minX: string;
  readonly minY: string;
  readonly maxX: string;
  readonly maxY: string;
}

export interface GeometryDeclaration {
  readonly kind: string;
  readonly name?: string;
  readonly label?: string;
  readonly visible?: boolean;
  readonly style?: "solid" | "dashed";
  readonly x?: string;
  readonly y?: string;
  readonly from?: string;
  readonly to?: string;
  readonly throughFirst?: string;
  readonly throughSecond?: string;
  readonly origin?: string;
  readonly through?: string;
  readonly center?: string;
  readonly radius?: string;
  readonly point?: string;
  readonly startAngle?: string;
  readonly endAngle?: string;
  readonly direction?: "cw" | "ccw";
  readonly vertices?: readonly string[];
  readonly first?: string;
  readonly second?: string;
  readonly circle?: string;
  readonly at?: string;
  readonly pick?: number;
  readonly segment?: string;
  readonly measure?: string;
  readonly group?: string;
  readonly segments?: readonly string[];
  readonly third?: string;
}

export interface GeometryBlock {
  readonly kind: "geometry";
  readonly range: SourceRange;
  readonly id?: string;
  readonly pluginVersion: string;
  readonly number?: boolean;
  readonly width: number;
  readonly height: number;
  readonly bounds?: GeometryBounds;
  readonly declarations: readonly GeometryDeclaration[];
}

export type ParsedBlock =
  | HeadingBlock
  | ParagraphBlock
  | ThematicBreakBlock
  | BlockquoteBlock
  | ListBlock
  | CodeBlock
  | TableBlock
  | CalloutBlock
  | EquationBlock
  | MermaidBlock
  | DerivationBlock
  | PlotBlock
  | ChartBlock
  | GeometryBlock
  | InvalidBlock;

export type AzeBlock =
  | HeadingBlock
  | ParagraphBlock
  | ThematicBreakBlock
  | BlockquoteBlock
  | ListBlock
  | CodeBlock
  | TableBlock
  | CalloutBlock
  | EquationBlock
  | MermaidBlock
  | DerivationBlock
  | PlotBlock
  | ChartBlock
  | GeometryBlock;
export type ArtifactFormat = "html" | "svg" | "png" | "pdf";

export interface DocumentMetadata {
  readonly authors: readonly string[];
  readonly extensions: Readonly<Record<string, JsonValue>>;
  readonly title?: string;
  readonly theme?: string;
  readonly outputs?: readonly ArtifactFormat[];
}

export interface ParsedDocument {
  readonly azemarkVersion: 2;
  readonly schemaVersion: 2;
  readonly metadata: DocumentMetadata;
  readonly blocks: readonly ParsedBlock[];
}

export interface AzeDocument {
  readonly azemarkVersion: 2;
  readonly schemaVersion: 2;
  readonly metadata: DocumentMetadata;
  readonly blocks: readonly AzeBlock[];
}

export type DiagnosticSeverity = "error" | "warning" | "info";

export type DiagnosticLocation =
  | { readonly source: string; readonly range?: SourceRange }
  | { readonly source?: string; readonly range: SourceRange };

export interface RelatedLocation {
  readonly source?: string;
  readonly range: SourceRange;
  readonly message: string;
}

export interface DiagnosticFixEdit {
  readonly range: SourceRange;
  readonly expectedText: string;
  readonly replacementText: string;
}

export interface DiagnosticFix {
  readonly title: string;
  readonly applicability: "safe";
  readonly edits: readonly DiagnosticFixEdit[];
}

export interface Diagnostic {
  readonly code: string;
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  readonly data: Readonly<Record<string, JsonValue>>;
  readonly location?: DiagnosticLocation;
  readonly suggestion?: string;
  readonly fix?: DiagnosticFix;
  readonly relatedLocations: readonly RelatedLocation[];
}

export interface ParseOptions {
  readonly sourceName?: string;
  readonly plugins?: readonly AzeBlockPlugin[];
  readonly allowRawLatex?: boolean;
}

export interface ParseResult {
  readonly document: ParsedDocument;
  readonly diagnostics: readonly Diagnostic[];
}

export interface ValidationResult {
  readonly document?: AzeDocument;
  readonly diagnostics: readonly Diagnostic[];
}

export interface FormatOptions {
  readonly sourceName?: string;
}

export interface FormatResult {
  readonly source?: string;
  readonly diagnostics: readonly Diagnostic[];
}

export interface Theme {
  readonly id: string;
  readonly version: string;
  readonly title: string;
  readonly colorScheme: "light" | "dark";
  readonly colors: Readonly<{
    background: string;
    foreground: string;
    muted: string;
  }>;
  readonly typography: Readonly<{
    proseFontFamily: "Inter";
    bodyFontWeight: 400;
    headingFontWeight: 700;
    lineHeight: number;
    headingLineHeight: number;
    paragraphSpacingEm: number;
  }>;
  readonly geometry: Readonly<{
    canvasWidthPx: number;
    contentWidthPx: number;
    paddingPx: number;
  }>;
}

export interface AssetManifestEntry {
  readonly path: string;
  readonly mediaType: "image/png" | "image/jpeg" | "image/svg+xml";
  readonly byteLength: number;
  readonly bytesHash: Sha256Hash;
}

interface ArtifactMetadataBase {
  readonly byteLength: number;
  readonly contentHash: ContentHash;
  readonly assetManifestHash: Sha256Hash;
  readonly rendererFingerprint: Sha256Hash;
  readonly artifactHash: ArtifactHash;
  readonly theme: Readonly<{ id: string; version: string }>;
  readonly cssDimensions: Readonly<{
    canvasWidthPx: number;
    contentWidthPx: number;
    paddingPx: number;
  }>;
}

export interface HtmlArtifactMetadata extends ArtifactMetadataBase {
  readonly format: "html";
  readonly mimeType: "text/html; charset=utf-8";
  readonly profile: "azeforge.html.self-contained/v1";
}

export interface SvgArtifactMetadata extends ArtifactMetadataBase {
  readonly format: "svg";
  readonly mimeType: "image/svg+xml";
  readonly profile: "azeforge.svg.foreign-object/v1";
  readonly pixelDimensions: Readonly<{ width: number; height: number }>;
  readonly requiredCapabilities: readonly ["svg2", "xhtml-foreign-object"];
}

export interface PngArtifactMetadata extends ArtifactMetadataBase {
  readonly format: "png";
  readonly mimeType: "image/png";
  readonly profile: "azeforge.png.continuous/v1";
  readonly pixelDimensions: Readonly<{ width: number; height: number }>;
  readonly requiredCapabilities: readonly ["png-continuous", "srgb"];
}

export interface PdfArtifactMetadata extends ArtifactMetadataBase {
  readonly format: "pdf";
  readonly mimeType: "application/pdf";
  readonly profile: "azeforge.pdf.paged/v1";
  readonly pageCount: number;
  readonly pageGeometry: Readonly<{
    widthPt: number;
    heightPt: number;
    marginPt: number;
  }>;
  readonly requiredCapabilities: readonly ["pdf-paged"];
}

export type ArtifactMetadata =
  | HtmlArtifactMetadata
  | SvgArtifactMetadata
  | PngArtifactMetadata
  | PdfArtifactMetadata;

export interface Artifact {
  readonly bytes: Uint8Array;
  readonly metadata: ArtifactMetadata;
}

export interface CompileOptions extends ParseOptions {
  readonly format: "html" | "svg" | "png" | "pdf";
  readonly theme?: string;
  readonly allowRawLatex?: boolean;
  readonly projectRoot?: string;
  readonly signal?: AbortSignal;
}

export interface CompileResult {
  readonly diagnostics: readonly Diagnostic[];
  readonly document?: AzeDocument;
  readonly contentHash?: ContentHash;
  readonly artifact?: Artifact;
}

export interface DiagnosticLimitOptions {
  readonly perBlock?: number;
  readonly perDocument?: number;
}

export interface PluginDescriptor {
  readonly type: string;
  readonly version: string;
  readonly title: string;
  readonly summary: string;
  readonly diagnosticNamespace: string;
  readonly sourceSchema: JsonValue;
  readonly bodySyntax: Readonly<{ id: string; version: string }>;
  readonly dataSchema: JsonValue;
}

export interface BlockRendererDescriptor {
  readonly id: string;
  readonly version: string;
  readonly blockType: string;
  readonly pluginVersionRange: string;
  readonly rendererId: string;
  readonly rendererVersionRange: string;
}

export interface RendererDescriptor {
  readonly id: string;
  readonly version: string;
  readonly formats: readonly ArtifactFormat[];
  readonly capabilities: readonly ("browser" | "filesystem" | "subprocess")[];
}

export interface AzeBlockPlugin {
  readonly descriptor: PluginDescriptor;
}

export interface EquationBlockRenderer {
  readonly descriptor: BlockRendererDescriptor;
  readonly render: (
    block: EquationBlock,
    context: Readonly<{ sourceName?: string }>,
  ) => string | Promise<string>;
}
export interface MermaidBlockRenderer {
  readonly descriptor: BlockRendererDescriptor;
  readonly render: (
    block: MermaidBlock,
    context: Readonly<{
      sourceName?: string;
      ordinal?: number;
      theme?: Theme;
    }>,
  ) => string | Promise<string>;
}


export interface BlockRendererContext {
  readonly sourceName?: string;
  readonly renderBlocks: (blocks: readonly AzeBlock[]) => string;
}

export interface AzeBlockRenderer<TBlock extends object = AzeBlock> {
  readonly descriptor: BlockRendererDescriptor;
  readonly render: (
    block: TBlock,
    context: BlockRendererContext,
  ) => string | Promise<string>;
}

export type AnyBlockRenderer =
  | AzeBlockRenderer<AzeBlock>
  | AzeBlockRenderer<EquationBlock>
  | AzeBlockRenderer<DerivationBlock>
  | AzeBlockRenderer<CalloutBlock>
  | AzeBlockRenderer<TableBlock>
  | AzeBlockRenderer<PlotBlock>
  | AzeBlockRenderer<ChartBlock>
  | AzeBlockRenderer<GeometryBlock>
  | MermaidBlockRenderer;
export type BlockRenderer = AnyBlockRenderer;
export interface CompilerPolicy {
  readonly disabledBlockRendererIds?: readonly string[];
  readonly disabledRendererIds?: readonly string[];
  readonly disabledThemeIds?: readonly string[];
}

export interface CompilerOptions {
  readonly themes?: readonly Theme[];
  readonly defaultTheme?: string;
  readonly diagnosticLimits?: DiagnosticLimitOptions;
  readonly plugins?: readonly AzeBlockPlugin[];
  readonly blockRenderers?: readonly AnyBlockRenderer[];
  readonly renderers?: readonly RendererDescriptor[];
  readonly policy?: CompilerPolicy;
  readonly renderTimeoutMs?: number;
}

export interface Compiler {
  parse(source: string, options?: ParseOptions): ParseResult;
  validate(parsed: ParseResult): ValidationResult;
  format(source: string, options?: FormatOptions): FormatResult;
  compile(source: string, options: CompileOptions): Promise<CompileResult>;
}
