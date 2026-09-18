import { CHROME_HEADLESS_SHELL_VERSION, MermaidBrowserParseError, MermaidBrowserUnavailableError } from "./mermaid-browser.js";
import type { AzeBlockPlugin, Diagnostic, JsonValue, MermaidBlock, MermaidBlockRenderer, SourceRange, Theme } from "./model.js";
export declare const MERMAID_HTML_BLOCK_RENDERER_ID: "azeforge.mermaid.html/v1";
export declare const MERMAID_HTML_BLOCK_RENDERER_VERSION: "1.0.0";
export declare const MAX_MERMAID_SOURCE_LENGTH = 8000;
export declare const MAX_MERMAID_TEXT_LENGTH = 8000;
/** Header keys `parseMermaidHeader` accepts before the `----` separator. */
export declare const MERMAID_HEADER_FIELDS: readonly ["id", "title", "description"];
export { CHROME_HEADLESS_SHELL_VERSION, MermaidBrowserParseError, MermaidBrowserUnavailableError, };
export declare class MermaidSanitizerError extends Error {
    readonly reason: string;
    constructor(reason: string);
}
export interface MermaidHeader {
    readonly id?: string;
    readonly title?: string;
    readonly description?: string;
    readonly diagnostics: readonly Diagnostic[];
}
export declare function parseMermaidHeader(entries: readonly {
    readonly key: string;
    readonly value: string;
    readonly range: SourceRange;
}[], _blockRange: SourceRange, sourceName: string | undefined): MermaidHeader;
export declare const SUPPORTED_DIAGRAMS: Readonly<Record<string, true>>;
export interface ValidatedMermaid {
    readonly block?: MermaidBlock;
    readonly diagnostics: readonly Diagnostic[];
}
/**
 * Synchronous Source preflight. Deep syntax is owned by pinned Mermaid in
 * the isolated browser at compile time; this gate rejects empty,
 * over-long, active-content, external-resource, and unknown-diagram input
 * so obvious failures surface at parse with a stable diagnostic.
 */
export declare function validateMermaidBody(options: {
    readonly header: MermaidHeader;
    readonly body: string;
    readonly bodyRanges: readonly SourceRange[];
    readonly blockRange: SourceRange;
    readonly sourceName: string | undefined;
}): ValidatedMermaid;
export declare function deriveMermaidSeed(options: {
    readonly source: string;
    readonly ordinal: number;
    readonly pluginVersion: string;
    readonly theme: Pick<Theme, "id" | "version">;
    readonly mermaidVersion?: string;
}): string;
/**
 * Render pinned Mermaid in the isolated browser and return sanitized SVG.
 * Every advertised diagram family executes through real Mermaid 11.17.2;
 * deep syntax failures surface as MermaidBrowserParseError so the Compiler
 * can report one scoped invalid-syntax diagnostic with no Artifact.
 */
export declare function renderMermaidSvg(block: MermaidBlock, options: {
    readonly ordinal: number;
    readonly theme: Theme;
}): Promise<string>;
/**
 * Structural SVG sanitizer backed by a real XML parser. Strips only XML
 * comments (inert); any other visible or security-relevant finding throws
 * instead of silently rewriting meaning.
 */
export declare function sanitizeMermaidSvg(svg: string, options: {
    readonly ordinal: number;
}): string;
/**
 * Fragment post-pass for the Compiler: the Block renderer returns a
 * figure wrapping one sanitized SVG. The entire Fragment is validated —
 * wrapper attributes and embedded SVG alike — and any failure throws
 * instead of silently rewriting.
 */
export declare function sanitizeMermaidFragment(fragment: string, options: {
    readonly ordinal: number;
}): string;
export declare const mermaidPlugin: AzeBlockPlugin;
export declare const mermaidHtmlBlockRenderer: MermaidBlockRenderer;
export declare function mermaidDependencyClosure(): Record<string, JsonValue>;
