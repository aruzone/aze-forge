import { type HeaderEntry } from "./block-header.js";
import { type SourceLine } from "./source-map.js";
import type { AzeBlockPlugin, AzeBlockRenderer, BlockRendererContext, Diagnostic, ExampleBlock, ExampleStep, Inline, ParsedBlock, SourceRange } from "./model.js";
/**
 * Worked examples (contract: issue #66 §8): problem, givens, ordered steps and
 * result, composing equation/derivation Blocks as one numbered object.
 */
export declare const EXAMPLE_HTML_BLOCK_RENDERER_ID: "azeforge.example.html/v1";
export declare const EXAMPLE_HTML_BLOCK_RENDERER_VERSION: "1.0.0";
export declare const MAX_EXAMPLE_STEPS = 64;
export declare const MAX_EXAMPLE_GIVENS = 64;
export declare const MAX_EXAMPLE_MARKDOWN_CHARS = 20000;
export declare const examplePlugin: AzeBlockPlugin;
export interface ExampleHeader {
    readonly id?: string;
    readonly number?: boolean;
    readonly caption?: readonly Inline[];
    readonly diagnostics: readonly Diagnostic[];
}
export declare function parseExampleHeader(entries: readonly HeaderEntry[], _blockRange: SourceRange, sourceName: string | undefined, parseCaption: (text: string, range: SourceRange) => readonly Inline[] | undefined): ExampleHeader;
export interface ExampleBody {
    readonly problem: readonly ParsedBlock[];
    readonly givens: readonly string[];
    readonly steps: readonly ExampleStep[];
    readonly result?: readonly ParsedBlock[];
}
export interface ExampleBodyResult {
    readonly body?: ExampleBody;
    readonly diagnostics: readonly Diagnostic[];
}
/** The four registered section fields, in canonical authored order. */
export declare const REGISTERED_FIELDS: readonly string[];
/** A step record carries exactly one field: its Markdown content. */
export declare const STEP_FIELDS: readonly string[];
export interface ExampleBodyArgs {
    readonly header: ExampleHeader;
    readonly bodyLines: readonly SourceLine[];
    readonly blockRange: SourceRange;
    readonly sourceName?: string;
    readonly parseBlocks: (lines: readonly SourceLine[]) => readonly ParsedBlock[] | undefined;
}
export declare function parseExampleBody(args: ExampleBodyArgs): ExampleBodyResult;
/**
 * One worked example: caption and numbering, the problem, its givens, its
 * ordered steps and its result. Containment only — nested equation/derivation
 * Blocks render through their own renderers and keep their own numbering.
 */
export declare function renderExampleFragment(block: ExampleBlock, context: BlockRendererContext): string;
export declare const exampleHtmlBlockRenderer: AzeBlockRenderer<ExampleBlock>;
