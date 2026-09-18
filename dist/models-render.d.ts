/**
 * Native software- and data-model emitter (contract: issue #61 §11).
 *
 * One project-owned SVG emitter over the four layout projections: quantized
 * 3-decimal coordinates, positional ids and an intrinsic finite positive
 * viewBox. Layout is total, so every valid Block renders; the extent guard
 * here is the family's own ceiling, and exceeding it fails the render job
 * rather than fabricating a Source diagnostic.
 *
 * Accessibility is structural, not decorative: every authored string is a
 * real `<text>` in reading order (timeline order for `sequence`, declaration
 * order otherwise), every text node carries the `aze-models-label` contract
 * and a role name, and every shape — lifelines, arrowheads, diamonds, dots,
 * activation bars and frames — is `aria-hidden` decoration. `<desc>` restates
 * the counts by item kind and, for `sequence`, the ordered timeline, so a
 * reader who cannot see the pixels still gets the model.
 *
 * The fragment carries no presentation attributes and no inline styles:
 * colour, stroke width, dash pattern and font size all come from the per-kind
 * CSS in `render-html.ts`, which derives its typography from the same
 * `modelsLabelTypography` the layout measured with. Zero scripts, zero event
 * attributes, zero external references; ids are positional, so two Blocks
 * with the same authored names cannot collide in one Document.
 */
import type { AzeBlockRenderer, ClassBlock, EntityBlock, JsonValue, SequenceBlock, StateBlock, Theme } from "./model.js";
export declare const MODELS_EMITTER_VERSION: "1.0.0";
export declare const MODELS_HTML_BLOCK_RENDERER_VERSION: "1.0.0";
export declare const SEQUENCE_HTML_BLOCK_RENDERER_ID: "azeforge.sequence.html/v1";
export declare const STATE_HTML_BLOCK_RENDERER_ID: "azeforge.state.html/v1";
export declare const ENTITY_HTML_BLOCK_RENDERER_ID: "azeforge.entity.html/v1";
export declare const CLASS_HTML_BLOCK_RENDERER_ID: "azeforge.class.html/v1";
/** Per-Block pixel ceiling: above it the render job fails, naming the size. */
export declare const MODELS_MAX_WIDTH_PX = 4096;
export declare const MODELS_MAX_HEIGHT_PX = 16384;
/** Fail-closed emitter fault. The caller publishes no Artifact. */
export declare class ModelsRenderError extends Error {
    readonly code = "azeforge.renderer#models-render";
    readonly remedy = "Re-check the model declaration list; a renderer failure publishes no Artifact.";
    constructor(message: string);
}
/** Render context: positional ordinal, the Theme, and the Source name. */
export type ModelsRenderContext = Readonly<{
    sourceName?: string;
    ordinal?: number;
    theme?: Theme;
}>;
export declare function renderSequenceFragment(block: SequenceBlock, context: ModelsRenderContext): string;
export declare function renderStateFragment(block: StateBlock, context: ModelsRenderContext): string;
export declare function renderEntityFragment(block: EntityBlock, context: ModelsRenderContext): string;
export declare function renderClassFragment(block: ClassBlock, context: ModelsRenderContext): string;
/**
 * Fingerprint closure for the rendered-artifact hash (contract §12): the
 * layout language, the wrapping rule, the emitter, the Advance metric and its
 * pinned font sources, and the quantization. Geometry never sees this value:
 * it is a fingerprint of the rules, not of one figure.
 */
export declare function modelsDependencyClosure(): JsonValue;
export declare const sequenceHtmlBlockRenderer: AzeBlockRenderer<SequenceBlock>;
export declare const stateHtmlBlockRenderer: AzeBlockRenderer<StateBlock>;
export declare const entityHtmlBlockRenderer: AzeBlockRenderer<EntityBlock>;
export declare const classHtmlBlockRenderer: AzeBlockRenderer<ClassBlock>;
