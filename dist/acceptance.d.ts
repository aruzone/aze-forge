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
/**
 * The suite file that executes each required automated P0 entry's contract.
 *
 * The catalog says what must hold; this registry says where it is executed, so
 * the acceptance runner can report a result for every automated entry instead
 * of restating the contract in a second place. `test/acceptance.test.mjs`
 * proves the catalog, Golden, determinism, pagination, author-loop, and
 * visual-bound entries directly; the remaining entries name the suite file
 * that owns their observable contract.
 */
export interface AcceptanceSuiteEvidence {
    readonly id: string;
    readonly suite: string;
}
export declare const ACCEPTANCE_SUITE_EVIDENCE: readonly AcceptanceSuiteEvidence[];
/** Every declared suite file, deduplicated and sorted. */
export declare const ACCEPTANCE_SUITE_FILES: readonly string[];
/**
 * Coverage gate for the suite registry: every required automated P0 entry needs
 * exactly one suite, and no declaration may name an unknown or repeated ID.
 */
export declare function checkAcceptanceSuiteEvidence(declared: readonly AcceptanceSuiteEvidence[]): {
    readonly missing: readonly string[];
    readonly unknown: readonly string[];
    readonly duplicate: readonly string[];
};
export interface TestSummary {
    readonly pass: number;
    readonly fail: number;
    /** The first failing test line, for an actionable report detail. */
    readonly failure?: string;
}
/**
 * The summary a TAP `node --test` run prints, so a crashed suite is never
 * mistaken for a green one: `undefined` means the output carried no summary and
 * the caller must fall back to the exit status.
 */
export declare function parseTestSummary(output: string): TestSummary | undefined;
export interface AcceptanceSuiteOutcome {
    readonly suite: string;
    readonly pass: boolean;
    readonly detail: string;
}
export interface AcceptanceSuiteResult {
    readonly id: string;
    readonly name: string;
    readonly pass: boolean;
    readonly detail: string;
}
/**
 * One acceptance-report result per required automated P0 entry, from the
 * outcome of the suite that executes it. Entries the runner proved directly are
 * left out: the runner's own check is authoritative for them, and a report must
 * not carry two verdicts for one entry.
 */
export declare function catalogResultsFromSuites(outcomes: readonly AcceptanceSuiteOutcome[], executedIds?: readonly string[]): readonly AcceptanceSuiteResult[];
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
