import type { Inline, SourceRange, TableData } from "./model.js";
/** Resolves a fragment-relative offset into a real Source range. */
export type InlineRangeFor = (offset: number, length: number) => SourceRange;
export declare function isSafeLinkTarget(href: string): boolean;
export interface ParsedInline {
    readonly nodes: readonly Inline[];
    readonly unsafeTargets: readonly string[];
}
export declare function parseInlineFragment(text: string, rangeFor?: InlineRangeFor): ParsedInline;
export declare function inlineTextValue(nodes: readonly Inline[]): string;
export declare function splitTableRow(line: string): string[] | undefined;
export declare function tryParseGfmTable(lines: readonly string[]): {
    data: TableData;
    consumed: number;
} | undefined;
export declare function isGfmTableStart(headerLine: string, delimiterLine: string): boolean;
