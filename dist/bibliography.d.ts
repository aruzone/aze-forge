import { type HeaderEntry } from "./block-header.js";
import { type SourceLine } from "./source-map.js";
import type { AzeBlockPlugin, AzeBlockRenderer, BibliographyBlock, BibliographyEntry, BlockRendererContext, CitationStyle, Diagnostic, Inline, SourceRange } from "./model.js";
/**
 * The document-local Bibliography directive (contract: issue #67 §7). One
 * directive per document; records use the shared `-` item syntax of the
 * language contract (§4: two spaces per structural level, `name:` opens a
 * nested structure only where the schema permits it) and the closed
 * citation-record field set. The body is declarations, never YAML.
 *
 * Reading posture: `key:`, `type:` and `title:` are required; `authors:` is an
 * ordered collection of `- name:` records with an optional literal `family:`
 * sort/label key; `year:` is an integer or the one registered `unspecified`
 * spelling. Every other field is optional literal text, and `url:` must
 * satisfy the shared safe-link policy. A double-quoted value decodes §4
 * JSON escapes; every value is single-line, so a `|` multiline marker is
 * refused rather than guessed. Authors are literal display text: a surname is
 * never parsed out of `name:` (the author-year check is composition's).
 *
 * Diagnostics are the `azeforge.citation#` registry, every one source-ranged
 * to the field or record that caused it. Structural faults are errors: a
 * faulted body publishes no entries (fail-closed). Duplicate `key:` values
 * inside one block carry the earlier declaration as a relatedLocation. The
 * entry ceiling (512) is a fail-closed error and zero entries is legal and
 * silent.
 */
export declare const BIBLIOGRAPHY_HTML_BLOCK_RENDERER_ID: "azeforge.bibliography.html/v1";
export declare const BIBLIOGRAPHY_HTML_BLOCK_RENDERER_VERSION: "1.0.0";
export declare const BIBLIOGRAPHY_ENTRY_TYPES: readonly ["article", "book", "chapter", "report", "thesis", "web", "software", "standard", "other"];
/** The diagnostic registry this module reports in (contract: issue #67 §11). */
export declare const BIBLIOGRAPHY_NAMESPACE: "azeforge.citation";
/** The fail-closed entry ceiling (contract: issue #67 §11). */
export declare const MAX_BIBLIOGRAPHY_ENTRIES = 512;
/** Single-line text ceilings: a bound on authored input, never a truncation. */
export declare const MAX_CITATION_TEXT_CHARS = 2000;
export declare const MAX_CITATION_NAME_CHARS = 200;
/** The closed citation-record field set, in declaration order. */
export declare const BIBLIOGRAPHY_ENTRY_FIELDS: readonly string[];
/** The closed author-record field set. */
export declare const BIBLIOGRAPHY_AUTHOR_FIELDS: readonly string[];
export declare const bibliographyPlugin: AzeBlockPlugin;
export interface BibliographyHeader {
    readonly id?: string;
    readonly number?: boolean;
    readonly caption?: readonly Inline[];
    readonly diagnostics: readonly Diagnostic[];
}
export declare function parseBibliographyHeader(entries: readonly HeaderEntry[], _blockRange: SourceRange, sourceName: string | undefined, parseCaption: (text: string, range: SourceRange) => readonly Inline[] | undefined): BibliographyHeader;
export interface BibliographyBodyResult {
    readonly entries?: readonly BibliographyEntry[];
    readonly diagnostics: readonly Diagnostic[];
}
/**
 * Read one `:::: bibliography` body: an ordered collection of `- ` citation
 * records in the closed field set, at one structural indentation baseline.
 * Every record and field is checked, independent records keep validating
 * after a fault, and a faulted body publishes no entries.
 */
export declare function parseBibliographyBody(options: {
    readonly bodyLines: readonly SourceLine[];
    readonly blockRange: SourceRange;
    readonly sourceName?: string;
}): BibliographyBodyResult;
/** The registered rendering of a year: an integer, or `n.d.` when unspecified. */
export declare function bibliographyYearLabel(year: string | undefined): string;
/**
 * The citation labels for one rendered list, in the list's own order. Numeric
 * style labels each entry by its position; author-year labels it `Family year`
 * and suffixes colliding labels a/b/c in list order (contract: issue #67 §8).
 */
export declare function bibliographyCitationLabels(entries: readonly BibliographyEntry[], style: CitationStyle): readonly string[];
/**
 * The document-local references list, rendered where the directive stands
 * (contract: issue #67 §§7, 10). Entries follow `worksCited` when the
 * composition projection supplies it and the authored order otherwise; every
 * entry is anchored by its key. `style` selects the label form and defaults to
 * the versioned built-in `numeric`; the Theme owns the final presentation,
 * including the references-list heading word and whether the ordered-list
 * markers repeat the label span it is handed.
 */
export declare function renderBibliographyFragment(block: BibliographyBlock, _context: BlockRendererContext, style?: CitationStyle): string;
export declare const bibliographyHtmlBlockRenderer: AzeBlockRenderer<BibliographyBlock>;
