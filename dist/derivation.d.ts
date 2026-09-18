import type { AzeBlockPlugin, DerivationBlock, Diagnostic, Inline, SourceRange } from "./model.js";
export declare const DERIVATION_HTML_BLOCK_RENDERER_ID: "azeforge.derivation.html/v1";
export declare const DERIVATION_HTML_BLOCK_RENDERER_VERSION: "1.0.0";
export declare const HTML_RENDERER_ID: "html";
export declare const HTML_RENDERER_VERSION: "1.0.0";
export declare const MAX_DERIVATION_STEPS = 64;
export declare const MAX_ANNOTATION_LENGTH = 500;
/** Header keys `parseDerivationHeader` accepts before the `----` separator. */
export declare const DERIVATION_HEADER_FIELDS: readonly ["id", "number", "align"];
/** Step keys `validateDerivationBody` accepts in one `- expression:` step. */
export declare const DERIVATION_STEP_FIELDS: readonly ["expression", "annotation"];
export interface DerivationHeader {
    readonly id?: string;
    readonly number?: boolean;
    readonly align?: "left" | "center" | "right";
    readonly diagnostics: readonly Diagnostic[];
}
export declare function parseDerivationHeader(entries: readonly {
    readonly key: string;
    readonly value: string;
    readonly range: SourceRange;
}[], _blockRange: SourceRange, sourceName: string | undefined): DerivationHeader;
export interface ValidatedDerivation {
    readonly block?: DerivationBlock;
    readonly diagnostics: readonly Diagnostic[];
}
/**
 * Step record validation for the catalog derivation family. Each
 * `- expression:` step parses through the closed native mathematics
 * grammar into a semantic tree; annotations are literal plain text.
 */
export declare function validateDerivationBody(options: {
    readonly header: DerivationHeader;
    readonly body: string;
    readonly bodyRanges: readonly SourceRange[];
    readonly blockRange: SourceRange;
    readonly sourceName: string | undefined;
    readonly parseAnnotation: (text: string, range: SourceRange) => readonly Inline[] | undefined;
}): ValidatedDerivation;
export declare const derivationPlugin: AzeBlockPlugin;
/**
 * Render an aligned environment at each step's first top-level relation.
 * Relation-free steps align as a whole; every equation stays page-atomic.
 */
export declare function renderDerivationFragment(block: DerivationBlock, _context: Readonly<{
    sourceName?: string;
}>): string;
export declare const derivationHtmlBlockRenderer: Readonly<{
    descriptor: Readonly<{
        id: "azeforge.derivation.html/v1";
        version: "1.0.0";
        blockType: "derivation";
        pluginVersionRange: "1.0.0";
        rendererId: "html";
        rendererVersionRange: "1.0.0";
    }>;
    render: typeof renderDerivationFragment;
}>;
