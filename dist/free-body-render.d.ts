/**
 * Native free-body diagram emitter (contract: issue #65 §6, §9, §10, §12).
 *
 * One deterministic projection from a validated `FreeBodyBlock` to a static
 * figure. The authored y-up frame is auto-fitted around the resolved extent of
 * every visible object — or an authored `bounds:` wins — and mapped to the SVG
 * y-down canvas by one uniform, aspect-preserving, centred scale; every emitted
 * number goes through `quantize`.
 *
 * Two norms hold everywhere. First, identity is positional: no authored name,
 * id or coordinate ever reaches an attribute, so a declaration's group is
 * `aze-fb-<ordinal>-n-<declarationIndex>` and the Block's own id rides on the
 * `<figure>` as data. Second, nothing is computed into the picture: an arrow is
 * the authored attachment and the authored direction resolved by the ray rule,
 * a length is `magnitude × scale` or the authored `length:`, and no force,
 * contact or equilibrium is ever inferred.
 *
 * Every glyph is a real `<text>` (never a path); `<path>`/`<polygon>` carry
 * arcs, strokes and arrowheads only; and the fragment carries no script, no
 * event attribute and no external reference — `assertFreeBodyFragmentSafe`
 * proves that before the caller sees a byte.
 *
 * Everything here is renderer-derived and fingerprint-only: no coordinate, no
 * positional id and no quantized number ever enters the Block or its
 * contentHash.
 */
import type { FigureBlockRenderer, FreeBodyBlock, JsonValue, Theme } from "./model.js";
export declare const FREE_BODY_HTML_BLOCK_RENDERER_ID: "azeforge.free-body.html/v1";
export declare const FREE_BODY_HTML_BLOCK_RENDERER_VERSION: "1.0.0";
/** Fail-closed emitter fault; the caller publishes no Artifact. */
export declare class FreeBodyRenderError extends Error {
    readonly code = "azeforge.renderer#free-body-render";
    readonly remedy = "Re-check the free-body declaration list and the Theme handed to the renderer; a renderer failure publishes no Artifact.";
    constructor(message: string);
}
/** Render context: positional ordinal, the Theme, and the Source name. */
type RenderContext = Readonly<{
    sourceName?: string;
    ordinal?: number;
    theme?: Theme;
}>;
/** Fail-closed norm extended to free-body fragments: generated markup must never carry executable content. */
export declare function assertFreeBodyFragmentSafe(svg: string): void;
export declare function renderFreeBodyFragment(block: FreeBodyBlock, context: RenderContext): string;
/**
 * Fingerprint closure for the rendered-artifact hash (contract §12): the
 * emitter version, the quantization rule, the evaluator version and the
 * `scale:` policy all ride in it, because each one can change a rendered
 * coordinate. Nothing here reads the Block.
 */
export declare function freeBodyDependencyClosure(): JsonValue;
/** The re-id pattern every format reuses: one renderer id, this version range. */
export declare const freeBodyHtmlBlockRenderer: FigureBlockRenderer<FreeBodyBlock>;
export {};
