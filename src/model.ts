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

export type Inline = TextInline;

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

export interface InvalidBlock {
  readonly kind: "invalid";
  readonly raw: string;
  readonly range: SourceRange;
  readonly diagnosticIndexes: readonly number[];
  readonly originalType?: string;
}

export type ParsedBlock = HeadingBlock | ParagraphBlock | InvalidBlock;
export type AzeBlock = HeadingBlock | ParagraphBlock;
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

export interface CompilerOptions {
  readonly themes?: readonly Theme[];
  readonly defaultTheme?: string;
  readonly diagnosticLimits?: DiagnosticLimitOptions;
}

export interface Compiler {
  parse(source: string, options?: ParseOptions): ParseResult;
  validate(parsed: ParseResult): ValidationResult;
  compile(source: string, options: CompileOptions): Promise<CompileResult>;
}
