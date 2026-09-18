import type { Diagnostic, DiagnosticFix, DiagnosticLocation, DiagnosticSeverity, JsonValue, RelatedLocation, SourceRange } from "./model.js";
export interface DiagnosticLimits {
    readonly perBlock: number;
    readonly perDocument: number;
}
export declare const DEFAULT_DIAGNOSTIC_LIMITS: DiagnosticLimits;
interface DiagnosticDetails {
    readonly data?: Readonly<Record<string, JsonValue>>;
    readonly location?: DiagnosticLocation;
    readonly suggestion?: string;
    readonly fix?: DiagnosticFix;
    readonly relatedLocations?: readonly RelatedLocation[];
}
export declare function createDiagnostic(code: string, severity: DiagnosticSeverity, message: string, details?: DiagnosticDetails): Diagnostic;
export declare function normalizeAndLimitDiagnostics(phases: readonly (readonly Diagnostic[])[], limits?: DiagnosticLimits, blockRanges?: readonly SourceRange[]): readonly Diagnostic[];
export {};
