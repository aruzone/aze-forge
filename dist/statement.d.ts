import { type HeaderEntry } from "./block-header.js";
import { type SourceLine } from "./source-map.js";
import type { AzeBlockPlugin, AzeBlockRenderer, BlockRendererContext, Diagnostic, Inline, ParsedBlock, SourceRange, StatementBlock, StatementKind } from "./model.js";
/**
 * Theorem-family statements with at most one authored proof (contract:
 * issue #66 §7). The QED mark is renderer-derived and never authored.
 *
 * Body: `text:` (required) and `proof:` (optional), each a `|` multiline
 * Markdown field reading one structural level (issue #52 §5). Content is
 * dedented by the field's own indentation plus two spaces — preserving
 * additional indentation — and handed to the caller's `parseBlocks`, so
 * contained `:: equation` and `:: derivation` directives are legal and number
 * by their own fields. At most one proof exists, and it is contained, never
 * referenced.
 *
 * Diagnostics: `#unknown-kind`, `#missing-text` and `#empty-proof` are the
 * registered family codes. A header without the required `kind:` reports the
 * shared `#missing-field`; an unsupported body field `#unknown-field`, a
 * repeated one `#duplicate-field`, a `text:`/`proof:` that is not a `|` field
 * `#invalid-field`, and each Markdown ceiling the shared `#limit-exceeded`.
 */
export declare const STATEMENT_HTML_BLOCK_RENDERER_ID: "azeforge.statement.html/v1";
export declare const STATEMENT_HTML_BLOCK_RENDERER_VERSION: "1.0.0";
export declare const STATEMENT_KINDS: readonly ["theorem", "definition", "lemma", "corollary", "proposition", "remark"];
/** The statement-specific header keys; `id`, `number` and `caption` are shared. */
export declare const STATEMENT_HEADER_FIELDS: readonly string[];
export declare const MAX_STATEMENT_MARKDOWN_CHARS = 20000;
export declare const statementPlugin: AzeBlockPlugin;
export interface StatementHeader {
    readonly id?: string;
    readonly number?: boolean;
    readonly caption?: readonly Inline[];
    readonly statementKind?: StatementKind;
    readonly diagnostics: readonly Diagnostic[];
}
export declare function parseStatementHeader(entries: readonly HeaderEntry[], blockRange: SourceRange, sourceName: string | undefined, parseCaption: (text: string, range: SourceRange) => readonly Inline[] | undefined): StatementHeader;
export interface StatementBody {
    readonly statementKind: StatementKind;
    readonly text: readonly ParsedBlock[];
    readonly proof?: readonly ParsedBlock[];
}
export interface StatementBodyResult {
    readonly body?: StatementBody;
    readonly diagnostics: readonly Diagnostic[];
}
export interface StatementBodyArgs {
    readonly header: StatementHeader;
    readonly bodyLines: readonly SourceLine[];
    readonly blockRange: SourceRange;
    readonly sourceName?: string;
    readonly parseBlocks: (lines: readonly SourceLine[]) => readonly ParsedBlock[] | undefined;
}
/**
 * Parse the statement body. Markdown flows through the caller's `parseBlocks`
 * on the dedented content lines, in authored order, exactly once per field;
 * `proof:` is contained content with no reference form.
 */
export declare function parseStatementBody(args: StatementBodyArgs): StatementBodyResult;
/**
 * Render the statement as a real `<figure>`: the caption prefixed by the
 * resolved numbering label when the statement is numbered (the label already
 * spells the kind, so the kind word is never repeated), or by the bold kind
 * word when it is not, then the statement Markdown, then the contained proof
 * indented and closed by the renderer-derived QED mark. The authored `id` never
 * becomes an element `id`; it is published as a data attribute for consumers.
 */
export declare function renderStatementFragment(block: StatementBlock, context: BlockRendererContext): string;
export declare const statementHtmlBlockRenderer: AzeBlockRenderer<StatementBlock>;
