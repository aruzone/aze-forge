import type { ArtifactMetadata, ContentHash, Diagnostic, JsonValue } from "./model.js";
import { TOOL_VERSION } from "./tool-version.js";
export declare const DIAGNOSTICS_SCHEMA_ID: "azeforge.diagnostics/v1";
export interface DiagnosticsReport {
    readonly schema: typeof DIAGNOSTICS_SCHEMA_ID;
    readonly schemaVersion: 1;
    readonly tool: Readonly<{
        name: "azeforge";
        version: typeof TOOL_VERSION;
    }>;
    readonly command: string;
    readonly success: boolean;
    readonly diagnostics: readonly Diagnostic[];
    readonly contentHash?: ContentHash;
    readonly artifact?: ArtifactMetadata;
}
interface DiagnosticsReportDetails {
    readonly contentHash?: ContentHash;
    readonly artifact?: ArtifactMetadata;
}
export declare function createDiagnosticsReport(command: string, success: boolean, diagnostics: readonly Diagnostic[], details?: DiagnosticsReportDetails): DiagnosticsReport;
export declare const diagnosticsJsonSchema: JsonValue;
export {};
