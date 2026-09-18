import type { Diagnostic, SourceRange } from "./model.js";
export interface BlockIdOccurrence {
    readonly id: string;
    readonly range: SourceRange;
    readonly source?: string;
}
export declare function validateBlockIds(occurrences: readonly BlockIdOccurrence[]): readonly Diagnostic[];
