import type { SourceRange } from "./model.js";
export interface SourceLine {
    readonly number: number;
    readonly text: string;
    readonly startIndex: number;
    readonly endIndex: number;
    readonly startOffset: number;
    readonly endOffset: number;
}
export declare function sourceLines(source: string): readonly SourceLine[];
export declare function rangeFromLines(first: SourceLine, last: SourceLine): SourceRange;
export declare function rangeFromLineSlice(line: SourceLine, startIndex: number, endIndex: number): SourceRange;
