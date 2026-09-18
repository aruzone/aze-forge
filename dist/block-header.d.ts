import type { Diagnostic, Inline, SourceRange } from "./model.js";
/**
 * Shared header-field handling for the composition-owned directive kinds
 * (contract: issue #67 §2). `id`, `number` and `caption` register on every
 * kind that has not already resolved a caption-equivalent field; the owning
 * kind declares its remaining header keys through `known`.
 */
export interface HeaderEntry {
    readonly key: string;
    readonly value: string;
    readonly range: SourceRange;
}
export interface CompositionHeader {
    readonly id?: string;
    readonly number?: boolean;
    readonly caption?: readonly Inline[];
    /** The remaining declared header keys, keyed by name. */
    readonly extra: Readonly<Record<string, string>>;
    readonly diagnostics: readonly Diagnostic[];
}
export interface CompositionHeaderOptions {
    readonly namespace: string;
    readonly known: readonly string[];
    /** A `caption:` failure is the owning kind's core diagnostic when omitted. */
    readonly parseCaption: (text: string, range: SourceRange) => readonly Inline[] | undefined;
    readonly summary?: string;
}
export declare function parseCompositionHeader(entries: readonly HeaderEntry[], sourceName: string | undefined, options: CompositionHeaderOptions): CompositionHeader;
