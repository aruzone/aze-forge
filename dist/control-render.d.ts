/**
 * Native control-system diagram emitter (contract: issue #65 §5, §6, §9, §10,
 * §12). One project-owned SVG emitter over the pinned ELK projection in
 * `control-layout.ts`: quantized 3-decimal coordinates, positional ids and an
 * intrinsic finite positive viewBox.
 *
 * Two norms hold everywhere. First, identity is positional: no authored name,
 * id or coordinate ever reaches an attribute, so two Blocks that name the same
 * signal cannot collide in one Document. Second, nothing is drawn that the
 * author did not write — every sum sign is an authored `signs:` entry, every
 * label is an authored `CircuitText`, and the takeoff dot is the only mark
 * derived from routing, because it has no authored declaration of its own.
 *
 * Every glyph is a real `<text>` (never a path), `<path>`/`<polygon>` carry
 * strokes and arrowheads only, and the fragment carries no script, no event
 * attribute and no external reference; `assertControlFragmentSafe` proves it.
 */
import type { ControlBlock, FigureBlockRenderer, JsonValue, Theme } from "./model.js";
export declare const CONTROL_HTML_BLOCK_RENDERER_ID: "azeforge.control.html/v1";
export declare const CONTROL_HTML_BLOCK_RENDERER_VERSION: "1.0.0";
/**
 * Fail-closed emitter fault. The caller publishes no Artifact and never sees a
 * partial figure: the extent guard runs before the first byte of markup.
 */
export declare class ControlRenderError extends Error {
    readonly code = "azeforge.renderer#control-render";
    readonly remedy = "Re-check the control declaration list; a renderer failure publishes no Artifact.";
    constructor(message: string);
}
/** Fail-closed norm extended to control fragments: generated markup must never carry executable content. */
export declare function assertControlFragmentSafe(svg: string): void;
/**
 * Render one control Block: a static, browser-free, deterministic figure over
 * the pinned ELK layout projection. This is the family's only async boundary,
 * and the Theme is mandatory — the tokens are the picture.
 */
export declare function renderControlFragment(block: ControlBlock, context: Readonly<{
    sourceName?: string;
    ordinal?: number;
    theme?: Theme;
}>): Promise<string>;
/**
 * Fingerprint closure for the rendered-artifact hash (contract §12): the
 * layout language, the pinned engine, the emitter, the Advance metric and its
 * pinned font sources, the option set and the quantization.
 */
export declare function controlDependencyClosure(): JsonValue;
export declare const controlHtmlBlockRenderer: FigureBlockRenderer<ControlBlock>;
