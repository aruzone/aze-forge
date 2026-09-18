import type { ParseOptions, ParseResult } from "./model.js";
/** The closed front-matter vocabulary, in canonical order. */
export declare const KNOWN_METADATA_KEYS: Readonly<Record<string, true>>;
export declare const MAX_NESTING_DEPTH = 8;
export declare function parseSource(source: string, options?: ParseOptions): ParseResult;
