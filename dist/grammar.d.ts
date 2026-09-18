/**
 * Machine-readable AzeMark 2 grammar: the derivation seam behind
 * `azeforge grammar [--json] [--directive <type>]`.
 *
 * Every directive description is derived from the tables that gate
 * validation (see the family tables imported below); this module adds only
 * the vocabulary the tables do not carry — each field's `valueType`, whether
 * it is required, and the enumerations a validator accepts. Pure: no
 * filesystem, process, or engine access.
 */
import type { JsonValue } from "./model.js";
import { TOOL_VERSION } from "./tool-version.js";
import { GRAMMAR_SCHEMA_ID, GRAMMAR_SCHEMA_VERSION } from "./grammar-json.js";
/** Closed field-value vocabulary. Extend only when a validator gains a value kind. */
export type FieldValueType = "identifier" | "text" | "prose" | "integer" | "decimal" | "quantity" | "boolean" | "enum" | "expression" | "record" | "record-list" | "string-list" | "point-list" | "name";
export interface GrammarField {
    readonly key: string;
    readonly valueType: FieldValueType;
    readonly required: boolean;
    /** Closed accepted spellings, present for `enum` fields. */
    readonly values?: readonly string[];
}
/** A nested key group: the child keys a `record`/`record-list` field accepts. */
export interface GrammarGroup {
    readonly of: string;
    readonly fields?: readonly GrammarField[];
    /** Present when the named key is a section holding records, not one record. */
    readonly records?: readonly GrammarRecord[];
}
export interface GrammarHeader {
    readonly separator: "----";
    readonly fields: readonly GrammarField[];
    readonly groups?: readonly GrammarGroup[];
}
export interface GrammarRecord {
    readonly kind: string;
    readonly fields: readonly GrammarField[];
    readonly groups?: readonly GrammarGroup[];
}
export type GrammarBodyForm = "record-list" | "keyed-sections" | "scalar-lines" | "none";
export interface GrammarBodySpec {
    readonly form: GrammarBodyForm;
    /** The record opener spelling, present for `record-list` forms. */
    readonly recordOpener?: string;
    readonly records?: readonly GrammarRecord[];
    /** Leading `key: value` lines, for forms that allow them beside records. */
    readonly fields?: readonly GrammarField[];
    readonly groups?: readonly GrammarGroup[];
}
/** The body spec plus the JSON Schema of the parsed record collection. */
export interface GrammarBody extends GrammarBodySpec {
    readonly schema: JsonValue;
}
export interface GrammarDirective {
    readonly type: string;
    readonly title: string;
    readonly pluginVersion: string;
    readonly namespace: string;
    readonly bodySyntax: Readonly<{
        id: string;
        version: string;
    }>;
    readonly header: GrammarHeader;
    readonly body: GrammarBody;
    /** Per-directive ceilings, identical to the values `capabilities` reports. */
    readonly limits: Readonly<Record<string, JsonValue>>;
}
/** The hand-authored half of one directive: everything else comes from the registry. */
export interface DirectiveSpec {
    readonly header: GrammarHeader;
    readonly body: GrammarBodySpec;
    readonly limits: Readonly<Record<string, JsonValue>>;
}
export interface GrammarFrontMatter {
    readonly delimiters: readonly string[];
    readonly fields: readonly GrammarField[];
}
export interface GrammarDocumentEnvelope {
    readonly frontMatter: GrammarFrontMatter;
    readonly fences: Readonly<{
        readonly outer: string;
        readonly nested: string;
        readonly separator: string;
        readonly indent: number;
    }>;
    readonly comments: Readonly<{
        readonly prefix: string;
    }>;
    readonly identifier: Readonly<{
        readonly pattern: string;
        readonly scope: "document";
    }>;
}
export interface GrammarReport {
    readonly schema: typeof GRAMMAR_SCHEMA_ID;
    readonly schemaVersion: typeof GRAMMAR_SCHEMA_VERSION;
    readonly tool: Readonly<{
        name: "azeforge";
        version: typeof TOOL_VERSION;
    }>;
    readonly azemarkVersions: readonly [2];
    readonly document: GrammarDocumentEnvelope;
    readonly directives: readonly GrammarDirective[];
    readonly limits: Readonly<Record<string, JsonValue>>;
}
type FieldTypes = Readonly<Record<string, FieldValueType>>;
type FieldValues = Readonly<Record<string, readonly string[]>>;
/**
 * Build the field list for one key table. The key set (and its order) is the
 * parser's; `types` and `required` may only annotate keys the table declares.
 */
export declare function fieldsFrom(keys: readonly string[], types: FieldTypes, required?: readonly string[], values?: FieldValues): readonly GrammarField[];
/** The parser's key table for one record kind, or a loud failure. */
export declare function fieldKeys(table: Readonly<Record<string, readonly string[]>>, kind: string): readonly string[];
export declare function headerFrom(keys: readonly string[], types: FieldTypes, required?: readonly string[], values?: FieldValues, groups?: readonly GrammarGroup[]): GrammarHeader;
export declare function group(of: string, keys: readonly string[], types: FieldTypes, required?: readonly string[], values?: FieldValues): GrammarGroup;
/** A section key whose contents are records rather than one record's keys. */
export declare function sectionOf(of: string, records: readonly GrammarRecord[]): GrammarGroup;
export declare function record(kind: string, fields: readonly GrammarField[], groups?: readonly GrammarGroup[]): GrammarRecord;
/** Records derived from a parser kind table plus a per-kind field table. */
export declare function recordsFrom(kinds: readonly string[], fieldsByKind: Readonly<Record<string, readonly string[]>>, types: FieldTypes, required: Readonly<Record<string, readonly string[]>>, values?: FieldValues, groups?: Readonly<Record<string, readonly GrammarGroup[]>>): readonly GrammarRecord[];
export declare function recordList(recordOpener: string, records: readonly GrammarRecord[], extra?: {
    readonly fields?: readonly GrammarField[];
    readonly groups?: readonly GrammarGroup[];
}): GrammarBodySpec;
export declare function scalarLines(fields: readonly GrammarField[], groups?: readonly GrammarGroup[]): GrammarBodySpec;
export declare function keyedSections(fields: readonly GrammarField[], records?: readonly GrammarRecord[], groups?: readonly GrammarGroup[]): GrammarBodySpec;
/** The registered directive types, in canonical registry order. */
export declare function grammarDirectiveTypes(): readonly string[];
/**
 * Build the canonical grammar document. Deterministic: identical inputs
 * serialize byte-identically, and nothing derived from the workstation
 * (paths, timestamps, platform) enters the report.
 */
export declare function buildGrammarDocument(options?: Readonly<{
    directive?: string;
}>): GrammarReport;
/** Canonical machine serialization: one JSON document plus newline. */
export declare function serializeGrammar(report: GrammarReport): string;
export {};
