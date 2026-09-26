/**
 * The compiler-owned canonical TeX SVG projection
 * (`azeforge.tex-svg-normalizer/v2`).
 *
 * The trusted TeX renderer returns dvisvgm-shaped XML: an XML declaration, a
 * generator comment, single-quoted attributes, per-page identifiers (`page1`,
 * `pgfcp1`), and six-decimal geometry. This module parses that document and
 * re-serializes one canonical projection rather than rewriting the text, so a
 * construct a textual rewrite cannot see — a nested `<script>`, an undeclared
 * prefix, an external reference, a reference to an identifier no element
 * declares — can never reach a published Artifact.
 *
 * Five rules hold for the projection:
 *
 * - every identifier is prefixed with the figure's batch index, so inline
 *   figures in one HTML Artifact share the document identifier space without
 *   collision;
 * - every reference (`#id`, `url(#id)`) is rewritten to its prefixed target,
 *   and a reference to an identifier the figure does not declare is refused;
 * - comments, the XML declaration, generator metadata, and whitespace-only
 *   formatting text are dropped, and attributes serialize in one fixed order
 *   with one escaping rule, so equivalent documents produce identical bytes;
 * - generated numbers — geometry attributes and path/transform data — are
 *   quantized to six decimal places, while authored text is never touched;
 * - the compiler injects the authored `title` and `description` as the root's
 *   accessible `<title>` and `<desc>` and marks the root `role="img"`.
 *
 * One projection is embedded unchanged in the HTML layout, so HTML, SVG, PNG,
 * and PDF Artifacts all derive from the same validated SVG.
 */
import type { TexProfile } from "./tex-schemas.js";
/** The frozen normalizer contract this module implements. */
export declare const TEX_SVG_NORMALIZER_VERSION: "azeforge.tex-svg-normalizer/v2";
/** One stable reason a renderer SVG cannot become a canonical projection. */
export type TexSvgRejection = "malformed" | "unsafe" | "external" | "reference" | "dimensions";
/** The renderer returned an SVG outside the canonical projection contract. */
export declare class TexSvgError extends Error {
    readonly rejection: TexSvgRejection;
    readonly name = "TexSvgError";
    constructor(rejection: TexSvgRejection);
}
export interface TexSvgProjectionOptions {
    /** The renderer's raw SVG document. */
    readonly svg: string;
    /** This figure's zero-based index in the one renderer batch. */
    readonly requestIndex: number;
    /** Authored accessible title; the compiler owns this text. */
    readonly title: string;
    /** Authored accessible description; the compiler owns this text. */
    readonly description: string;
}
export interface TexFigureFragmentOptions extends TexSvgProjectionOptions {
    readonly profile: TexProfile;
}
/**
 * Parses, validates, namespaces, and canonically re-serializes one renderer
 * SVG as the projection embedded in the HTML layout. Throws `TexSvgError` for
 * every rejection, so a caller never publishes a partial or unsafe figure.
 */
export declare function projectTexSvg(options: TexSvgProjectionOptions): string;
/**
 * The HTML layout fragment: the canonical projection inside the
 * compiler-owned figure that carries the profile the renderer was asked for.
 */
export declare function texFigureFragment(options: TexFigureFragmentOptions): string;
