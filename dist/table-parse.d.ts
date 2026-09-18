import { type SourceLine } from "./source-map.js";
import type { Diagnostic, Inline, SourceRange, TableColumnAlignment, TableColumnType, TypedTableData } from "./model.js";
/**
 * Typed table v2 body parsing (contract: issue #66 §§2–4, 10, 13). The body
 * is a shared declaration record; every diagnostic is stable-coded and ranged
 * over the offending row-record key and value, with related locations on the
 * column declarations a grouping failure cites.
 */
export declare const TABLE_COLUMN_KEY: RegExp;
/** The closed seven-type column system, in canonical order. */
export declare const TABLE_COLUMN_TYPES: readonly ["prose", "text", "integer", "decimal", "quantity", "boolean", "math"];
/** The closed per-column declaration field set, in the parser's acceptance order. */
export declare const TABLE_COLUMN_FIELDS: readonly string[];
/** The closed per-group declaration field set. */
export declare const TABLE_GROUP_FIELDS: readonly string[];
export declare const MAX_TABLE_COLUMNS = 64;
export declare const MAX_TABLE_ROWS = 1000;
export declare const MAX_TABLE_TEXT_CELL_CHARS = 500;
export declare const MAX_TABLE_MATH_CELL_CHARS = 4000;
export declare const MAX_TABLE_GROUPS = 16;
/** Versioned built-in alignment per column type (contract: issue #66 §3). */
export declare const DEFAULT_ALIGNMENT: Readonly<Record<TableColumnType, TableColumnAlignment>>;
/** The closed alignment spellings, in the order the grammar reports them. */
export declare const ALIGNMENTS: Readonly<Record<string, true>>;
export interface TableBodyContext {
    readonly sourceName?: string;
    readonly parseInline: (text: string, range: SourceRange) => readonly Inline[] | undefined;
}
export interface TableBodyResult {
    readonly data?: TypedTableData;
    readonly diagnostics: readonly Diagnostic[];
}
/**
 * Parse a typed table v2 body. Returns the typed data, or `undefined` after
 * pushing every stable-coded, source-ranged diagnostic the body earned.
 */
export declare function parseTypedTableData(bodyLines: readonly SourceLine[], blockRange: SourceRange, context: TableBodyContext): TableBodyResult;
/**
 * Mechanical v1 pipe-table migration (contract: issue #66 §12): a GFM header
 * row becomes `prose` columns with names verbatim, GFM alignment markers
 * become `align:` overrides, and every cell becomes a `prose` value with its
 * Inline content preserved. Provable equivalence, no unit inference.
 */
export declare function migrateGfmTable(data: {
    readonly align: readonly (TableColumnAlignment | null)[];
    readonly header: readonly (readonly Inline[])[];
    readonly rows: readonly (readonly (readonly Inline[])[])[];
}): TypedTableData;
