import { type HeaderEntry } from "./block-header.js";
import { type SourceLine } from "./source-map.js";
import type { AzeBlockPlugin, AzeBlockRenderer, AlgorithmBlock, AlgorithmStatement, BlockRendererContext, Diagnostic, Inline, SourceRange } from "./model.js";
/**
 * Native algorithms/pseudocode (contract: issue #66 §§5–6). One procedure per
 * Block, a closed six-form statement set, and the bounded parsed-but-never
 * -evaluated pseudocode expression context.
 *
 * The six semantic codes fixed by issue #66 §10 keep their own spellings.
 * Declaration faults — an unknown, duplicated or mis-shaped record field —
 * follow the shared record rules of issue #52 §4 and report the shared
 * `#unknown-field` spelling every other family uses.
 */
export declare const ALGORITHM_HTML_BLOCK_RENDERER_ID: "azeforge.algorithm.html/v1";
export declare const ALGORITHM_HTML_BLOCK_RENDERER_VERSION: "1.0.0";
export declare const MAX_ALGORITHM_STATEMENTS = 256;
export declare const MAX_ALGORITHM_NESTING_DEPTH = 8;
export declare const MAX_ALGORITHM_PARAMETERS = 32;
export declare const MAX_PSEUDOCODE_EXPRESSION_LENGTH = 200;
/** The registered pseudocode function names (contract: issue #66 §6). */
export declare const PSEUDOCODE_FUNCTIONS: readonly ["floor", "ceil", "abs", "min", "max", "sqrt", "gcd", "log", "length"];
/** The six statement keywords, in the order the remedy names them. */
export declare const ALGORITHM_STATEMENT_KEYS: readonly ["assign", "if", "for", "while", "return", "text"];
export declare const algorithmPlugin: AzeBlockPlugin;
export interface AlgorithmHeader {
    readonly id?: string;
    readonly number?: boolean;
    readonly caption?: readonly Inline[];
    readonly diagnostics: readonly Diagnostic[];
}
export declare function parseAlgorithmHeader(entries: readonly HeaderEntry[], _blockRange: SourceRange, sourceName: string | undefined, parseCaption: (text: string, range: SourceRange) => readonly Inline[] | undefined): AlgorithmHeader;
export interface AlgorithmBody {
    readonly procedure: string;
    readonly parameters: readonly string[];
    readonly steps: readonly AlgorithmStatement[];
}
export interface AlgorithmBodyResult {
    readonly body?: AlgorithmBody;
    /** The same value as `body`; the alias keeps both wiring shapes compiling. */
    readonly block?: AlgorithmBody;
    readonly diagnostics: readonly Diagnostic[];
}
/**
 * Parse one `:::: algorithm` body: required `procedure:`, optional bounded
 * `parameters:`, required non-empty `steps:`.
 */
export declare function parseAlgorithmBody(args: {
    readonly bodyLines: readonly SourceLine[];
    readonly blockRange: SourceRange;
    readonly sourceName?: string;
    readonly parseInline: (text: string, line: SourceLine) => readonly Inline[] | undefined;
}): AlgorithmBodyResult;
/**
 * The algorithm fragment: a figure carrying the numbering label and caption,
 * the procedure signature, and one ordered list per statement level so the
 * nesting and reading order survive a screen reader. The authored id never
 * becomes an element `id`; the composition layer owns anchors.
 */
export declare function renderAlgorithmFragment(block: AlgorithmBlock, _context: BlockRendererContext): string;
export declare const algorithmHtmlBlockRenderer: AzeBlockRenderer<AlgorithmBlock>;
