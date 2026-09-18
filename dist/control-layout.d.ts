/**
 * Native control-system layout (issue #65 §5, reusing the diagram layout
 * contract issue #60 §5 wholesale).
 *
 * One deterministic projection from a validated `ControlBlock` to measured
 * geometry, over the pinned ELK engine (`elkjs@0.12.0`, the bundled worker-free
 * build). The Block's declaration list is the model: authored order is handed
 * to the engine as model order, stays in the returned lists, and the engine
 * only ever sees positional ids, so an authored name cannot influence — or
 * leak out of — the computation.
 *
 * Three things this module owns:
 *
 * - measurement: every box is sized from the Advance metric and the Theme's
 *   `control` typography tokens, never from a font the compiler cannot observe;
 * - projection: the engine result is read through a narrow geometry-only view
 *   and every number is quantized to three decimals, so two runs on the same
 *   Block produce identical values;
 * - failure: any throw or any missing/non-finite coordinate becomes a
 *   `ControlLayoutError` with a remedy, and the caller publishes no Artifact.
 *
 * Layout is total over every valid Block — there is no `layout-unsupported`
 * path, and no special case for a feedback cycle or a self-loop: both are
 * ordinary engine edges. Positional engine ids are `n<item>` and `e<edge>`,
 * numbered in authored order of their own kind. They are internal: the
 * returned layout carries authored names for the renderer and geometry for the
 * emitter, and nothing else.
 */
import { ELKJS_VERSION } from "./diagram-layout.js";
import type { ControlBlock, Theme } from "./model.js";
export { ELKJS_VERSION };
/** One code for every layout refusal: the caller publishes no partial figure. */
export declare const CONTROL_LAYOUT_ERROR_CODE: "azeforge.renderer#control-layout";
/** Version of the option set below; it rides in the rendering fingerprint. */
export declare const CONTROL_LAYOUT_OPTIONS_VERSION: "control-options/v1";
/** Horizontal breathing room inside a block box, on each side of the `tf:` text. */
export declare const BLOCK_PADDING_X = 14;
/** Vertical breathing room inside a block box, above and below the `tf:` text. */
export declare const BLOCK_PADDING_Y = 10;
/** Smallest block box, so a short transfer function still reads as a block. */
export declare const MIN_BLOCK_WIDTH = 76;
export declare const MIN_BLOCK_HEIGHT = 40;
/** Arc length kept clear around each sign glyph on a sum circle's circumference. */
export declare const SUM_SIGN_GAP = 8;
/** Band between a sum sign glyph and the circle's stroke. */
export declare const SUM_SIGN_PADDING = 5;
/** Smallest sum circle, so a one- or two-sign junction still reads as a circle. */
export declare const MIN_SUM_DIAMETER = 32;
/** Side of the square boundary glyph a stub draws before its label. */
export declare const STUB_GLYPH_SIZE = 12;
/** Gap between a stub glyph and its label text. */
export declare const STUB_LABEL_GAP = 6;
/** Smallest stub box, so a one-letter label still reads as a boundary marker. */
export declare const MIN_STUB_WIDTH = 56;
export declare const MIN_STUB_HEIGHT = 28;
/** Gap between two items in one layer (the diagram family's value). */
export declare const NODE_SPACING = 28;
/** Gap between two layers (the diagram family's value). */
export declare const LAYER_SPACING = 48;
/** Gap an edge keeps from an item it does not touch. */
export declare const EDGE_NODE_SPACING = 16;
/** Gap between two parallel edges. */
export declare const EDGE_EDGE_SPACING = 12;
/** Gap between two disconnected components. */
export declare const COMPONENT_SPACING = 40;
/** Outer margin of the whole drawing. */
export declare const ROOT_PADDING = 16;
/** Fixed nonzero seed; layout must not vary between runs. */
export declare const ELK_RANDOM_SEED = 1;
export interface ControlLayoutPoint {
    readonly x: number;
    readonly y: number;
}
export interface ControlLayoutBox {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}
export interface ControlLayoutNode extends ControlLayoutBox {
    /** Authored item name (block, sum or stub). */
    readonly name: string;
    readonly kind: "block" | "sum" | "input" | "output";
    /** 0-based index of the item in authored declaration order. */
    readonly declarationIndex: number;
}
export interface ControlLayoutSection {
    readonly startPoint: ControlLayoutPoint;
    readonly endPoint: ControlLayoutPoint;
    readonly bendPoints: readonly ControlLayoutPoint[];
}
export interface ControlLayoutEdge {
    /** 0-based index among the Block's `edge` declarations, in authored order. */
    readonly declarationIndex: number;
    readonly from: string;
    readonly to: string;
    readonly sections: readonly ControlLayoutSection[];
}
export interface ControlLayout {
    readonly width: number;
    readonly height: number;
    /** Authored declaration order. */
    readonly nodes: readonly ControlLayoutNode[];
    /** Authored declaration order. */
    readonly edges: readonly ControlLayoutEdge[];
}
/** Fail-closed layout refusal; the caller publishes no Artifact. */
export declare class ControlLayoutError extends Error {
    readonly code: string;
    readonly remedy: string;
    constructor(message: string, remedy?: string);
}
/**
 * Effective label typography: the Theme's `control` types raised to its
 * declared minimum readable size. Layout reads this one derivation, so the
 * measured box and the drawn text cannot disagree.
 */
export interface ControlLabelTypography {
    readonly blockFontSizePx: number;
    readonly blockLineHeightPx: number;
    readonly signalFontSizePx: number;
    readonly signalLineHeightPx: number;
    readonly sumSignFontSizePx: number;
    readonly stubFontSizePx: number;
    readonly stubLineHeightPx: number;
}
export declare function controlLabelTypography(theme: Theme): ControlLabelTypography;
/**
 * Measured, quantized layout for one Block. Deterministic; browser-free.
 *
 * Fails closed: the returned value is either a complete layout or a
 * `ControlLayoutError` carrying a remedy — never a partial one.
 */
export declare function layoutControl(block: ControlBlock, theme: Theme): Promise<ControlLayout>;
