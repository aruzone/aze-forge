import type { AzeBlockPlugin, Diagnostic, EquationBlock, EquationBlockRenderer, JsonValue, RendererDescriptor, SourceRange } from "./model.js";
export declare const EQUATION_HTML_BLOCK_RENDERER_ID: "azeforge.equation.html/v1";
export declare const EQUATION_HTML_BLOCK_RENDERER_VERSION: "1.0.0";
export declare const HTML_RENDERER_ID: "html";
export declare const HTML_RENDERER_VERSION: "1.0.0";
export declare const MAX_EQUATION_TEX_LENGTH = 4000;
export declare const MAX_EQUATION_SOURCE_LENGTH = 4000;
/** Header keys `parseEquationHeader` accepts before the `----` separator. */
export declare const EQUATION_HEADER_FIELDS: readonly ["id", "number", "align", "syntax"];
export interface EquationHeader {
    readonly id?: string;
    readonly number?: boolean;
    readonly align?: "left" | "center" | "right";
    readonly syntax: "readable" | "latex";
    readonly diagnostics: readonly Diagnostic[];
}
export declare function parseEquationHeader(entries: readonly {
    readonly key: string;
    readonly value: string;
    readonly range: SourceRange;
}[], _blockRange: SourceRange, sourceName: string | undefined): EquationHeader;
export declare class KatexCssError extends Error {
    constructor(message?: string);
}
/**
 * Pinned KaTeX stylesheet with every `@font-face` source replaced by an
 * embedded woff2 data URI (OFL faces from the pinned KaTeX package).
 * Operator glyphs such as the display integral only size correctly in
 * their own faces; embedding keeps Artifacts self-contained with no
 * font fetch while MathML stays screen-reader-only.
 */
export declare function getKatexCss(): string;
export declare function renderEquationToHtml(tex: string): string;
export type EquationSanitizerFinding = "executable-markup" | "unsafe-url";
export declare class EquationSanitizerError extends Error {
    readonly finding: EquationSanitizerFinding;
    constructor(finding: EquationSanitizerFinding);
}
/**
 * Final sanitization for KaTeX Fragments. KaTeX with trust:false never
 * emits scripts or remote loads, so any executable markup or unsafe URL
 * scheme is a compromise signal and fails closed instead of being
 * rewritten. Clean output passes through byte-identical.
 */
export declare function sanitizeKatexHtml(html: string): string;
export interface ValidatedEquation {
    readonly block?: EquationBlock;
    readonly diagnostics: readonly Diagnostic[];
}
export declare function validateEquationBody(options: {
    readonly header: EquationHeader;
    readonly body: string;
    readonly bodyRanges: readonly SourceRange[];
    readonly blockRange: SourceRange;
    readonly sourceName: string | undefined;
    readonly allowRawLatex: boolean;
    readonly syntaxRange?: SourceRange;
}): ValidatedEquation;
/** TeX for a Block: latex keeps its raw string; native derives from the semantic tree. */
export declare function equationBlockTex(block: EquationBlock): string;
export declare const equationPlugin: AzeBlockPlugin;
export declare const equationHtmlBlockRenderer: EquationBlockRenderer;
export declare const htmlRendererDescriptor: RendererDescriptor;
export declare function katexDependencyClosure(): Record<string, JsonValue>;
