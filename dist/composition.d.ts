import type { AzeDocument, CitationStyle, Diagnostic, ResolvedReferenceGroup } from "./model.js";
/**
 * Document composition (contract: issue #67): one identifier namespace, one
 * flat numbering class per object kind, prose reference/citation resolution,
 * endnote-rendered footnotes, and the derived numbering projection.
 */
export declare const COMPOSITION_SCHEMA_ID: "azeforge.composition/v1";
/** Fail-closed ceilings (contract: issue #67 §11). */
export declare const MAX_BIBLIOGRAPHY_ENTRIES = 512;
export declare const MAX_FOOTNOTE_DEFINITIONS = 256;
export declare const MAX_REFERENCE_GROUP_TARGETS = 8;
export declare const MAX_REFERENCE_TOKENS = 2048;
export declare const MAX_LOCATOR_VALUE_LENGTH = 32;
/** `numeric` is the versioned built-in default (contract: issue #67 §8). */
export declare const DEFAULT_CITATION_STYLE: CitationStyle;
export declare const CITATION_STYLES: readonly ["numeric", "author-year"];
/**
 * One flat numbering class per object kind, in canonical order. The six
 * statement kinds are six independent classes. A class's `word` is the
 * versioned built-in display word handed to the Theme layer.
 */
export declare const NUMBERING_CLASSES: Readonly<Record<string, Readonly<{
    readonly word: string;
}>>>;
export declare const NUMBERING_CLASS_ORDER: readonly string[];
/**
 * The parenthetical delimiters and separator a Citation group renders with
 * under one style. The Theme owns the final presentation (contract: §13).
 */
export declare function referenceGroupDelimiters(style: CitationStyle): ResolvedReferenceGroup;
export interface CompositionResult {
    readonly document: AzeDocument;
    readonly diagnostics: readonly Diagnostic[];
}
/**
 * Resolve the derived numbering projection: assign per-kind ordinals, resolve
 * every reference/citation target against the unified identifier namespace,
 * number footnote markers in first-reference order, and order the works-cited
 * list. Pure and deterministic; the result carries derived fields only.
 */
export declare function resolveDocumentComposition(document: AzeDocument): CompositionResult;
/** The document-end endnotes section required in HTML and PDF (issue #67 §6). */
export declare function renderEndnotesSection(document: AzeDocument): string;
