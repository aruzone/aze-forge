import type { JsonValue } from "./model.js";
import { TOOL_VERSION } from "./tool-version.js";
import { type RuntimeSupport } from "./runtime-support.js";
export declare const VERSION_SCHEMA_ID: "azeforge.version/v1";
export declare const VERSION_SCHEMA_VERSION: 1;
export interface VersionedSchema {
    readonly id: string;
    readonly version: number | string;
}
/**
 * Every public machine document schema in canonical order. Source/data
 * schema versions track their owning Plugin version; envelope schemas
 * carry their own schemaVersion.
 */
export declare function publicSchemaVersions(): readonly VersionedSchema[];
export interface VersionReport {
    readonly schema: typeof VERSION_SCHEMA_ID;
    readonly schemaVersion: typeof VERSION_SCHEMA_VERSION;
    readonly tool: Readonly<{
        name: "azeforge";
        version: typeof TOOL_VERSION;
    }>;
    readonly runtime: RuntimeSupport;
    readonly source: Readonly<{
        azemarkVersions: readonly [2];
    }>;
    readonly document: Readonly<{
        schemaVersions: readonly [3];
    }>;
    readonly schemas: readonly VersionedSchema[];
}
/**
 * Canonical version document. Contains only release versions — never
 * workstation facts such as paths, platforms, or dependency state.
 */
export declare function createVersionReport(): VersionReport;
export declare const versionJsonSchema: JsonValue;
