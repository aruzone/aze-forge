import type { JsonValue } from "./model.js";
export declare const ACCEPTANCE_SCHEMA_ID: "azeforge.acceptance/v1";
export declare const ACCEPTANCE_SCHEMA_VERSION: 1;
export declare const ACCEPTANCE_CATALOG_ID: "azeforge.acceptance/v1";
export declare const ACCEPTANCE_CATALOG_VERSION: 1;
export type AcceptanceGate = "p0" | "p0.5";
export type AcceptanceEvidence = "automated" | "manual";
export interface AcceptanceEntry {
    readonly id: string;
    readonly gate: AcceptanceGate;
    readonly area: string;
    readonly given: string;
    readonly when: string;
    readonly then: readonly string[];
    readonly evidence: AcceptanceEvidence;
    readonly required: boolean;
    readonly contracts: readonly string[];
}
/**
 * Normative P0 release inventory from the golden-report acceptance gate.
 * P0.5 entries are required for their own gate only; a P0.5 failure never
 * delays or invalidates P0.
 */
export declare const ACCEPTANCE_ENTRIES: readonly AcceptanceEntry[];
export declare const REQUIRED_P0_IDS: readonly string[];
export declare const AUTOMATED_P0_IDS: readonly string[];
/**
 * Coverage gate: every required automated P0 entry needs declared evidence,
 * and no declaration may name an unknown ID.
 */
export declare function checkAcceptanceCoverage(declaredIds: readonly string[]): {
    readonly missing: readonly string[];
    readonly unknown: readonly string[];
};
export declare const acceptanceJsonSchema: JsonValue;
export interface AcceptanceCatalogDocument {
    readonly schema: typeof ACCEPTANCE_SCHEMA_ID;
    readonly schemaVersion: typeof ACCEPTANCE_SCHEMA_VERSION;
    readonly catalog: Readonly<{
        id: typeof ACCEPTANCE_CATALOG_ID;
        version: typeof ACCEPTANCE_CATALOG_VERSION;
    }>;
    readonly entries: readonly AcceptanceEntry[];
}
/**
 * Canonical catalog document with logical identity azeforge.acceptance/v1.
 */
export declare function createAcceptanceCatalog(): AcceptanceCatalogDocument;
