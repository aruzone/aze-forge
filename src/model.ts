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

export interface TableBlock {
  readonly kind: "table";
  readonly data: TableData;
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
  readonly syntax: "readable" | "latex";
  readonly source: string;
  readonly tex: string;
  readonly number?: boolean;
  readonly align?: "left" | "center" | "right";
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
  | EquationBlock;
export type ArtifactFormat = "html" | "svg" | "png" | "pdf";

export interface DocumentMetadata {
  readonly authors: readonly string[];
  readonly extensions: Readonly<Record<string, JsonValue>>;
  readonly title?: string;
  readonly theme?: string;
  readonly outputs?: readonly ArtifactFormat[];
}

export interface ParsedDocument {
  readonly azemarkVersion: 1;
  readonly schemaVersion: 1;
  readonly metadata: DocumentMetadata;
  readonly blocks: readonly ParsedBlock[];
}

export interface AzeDocument {
  readonly azemarkVersion: 1;
  readonly schemaVersion: 1;
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

export interface Theme {
  readonly id: string;
  readonly version: string;
  readonly title: string;
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

export interface ArtifactMetadata {
  readonly format: "html";
  readonly mimeType: "text/html; charset=utf-8";
  readonly profile: "azeforge.html.self-contained/v1";
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

export interface Artifact {
  readonly bytes: Uint8Array;
  readonly metadata: ArtifactMetadata;
}

export interface CompileOptions extends ParseOptions {
  readonly format: "html";
  readonly theme?: string;
  readonly allowRawLatex?: boolean;
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
  | AzeBlockRenderer<CalloutBlock>
  | AzeBlockRenderer<TableBlock>;

export interface CompilerPolicy {
  readonly disabledBlockRendererIds?: readonly string[];
  readonly disabledRendererIds?: readonly string[];
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
  compile(source: string, options: CompileOptions): Promise<CompileResult>;
}
