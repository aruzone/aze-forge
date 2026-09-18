import type { Inline } from "./model.js";
export declare class FragmentSecurityError extends Error {
    constructor(message: string);
}
export declare function escapeHtml(value: string): string;
export declare function escapeAttribute(value: string): string;
/**
 * The versioned built-in numbering label. The Theme owns display words,
 * number punctuation and placement (contract: issue #67 §13).
 */
export declare function numberingLabelHtml(label: string | undefined): string;
export declare function renderInlineHtml(nodes: readonly Inline[]): string;
