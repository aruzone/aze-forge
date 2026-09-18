/**
 * Native general-diagram layout (issue #76, contract issue #60 §4).
 *
 * One deterministic projection from a validated `DiagramBlock` to measured
 * geometry, over the pinned ELK engine (`elkjs@0.12.0`, the bundled
 * worker-free build). The Block's declaration list is the model: authored
 * order is preserved, and the engine only ever sees positional ids, so an
 * authored name cannot influence — or leak out of — the computation.
 *
 * Three things this module owns:
 *
 * - measurement: every box is sized from the Advance metric and the Theme
 *   typography tokens, never from a font the compiler cannot observe;
 * - projection: the engine's parent-relative hierarchy is flattened to one
 *   absolute coordinate system, and every number is quantized to three
 *   decimals so two runs on the same Block produce identical values;
 * - failure: any throw or any missing/non-finite coordinate becomes a
 *   `DiagramLayoutError` with a remedy, and the caller publishes no Artifact.
 *
 * Positional engine ids are `n<node>`, `g<group>`, `p<node>-<port>` and
 * `e<edge>`, numbered in authored order of their own kind. They are internal:
 * the returned layout carries authored names for the renderer and geometry
 * for the emitter, and nothing else.
 */
import type { DiagramBlock, DiagramPortSide, DiagramShape, Theme } from "./model.js";
export declare const DIAGRAM_LAYOUT_VERSION: "diagram-layout/v1";
export declare const ELKJS_VERSION: "0.12.0";
/** One code for every layout refusal: the caller publishes no partial figure. */
export declare const DIAGRAM_LAYOUT_ERROR_CODE: "azeforge.renderer#diagram-layout";
/** Horizontal breathing room inside a node box, on a side without ports. */
export declare const NODE_PADDING_X = 14;
/** Vertical breathing room inside a node box, on a side without ports. */
export declare const NODE_PADDING_Y = 10;
/** Smallest node box, so a short or absent label still reads as a shape. */
export declare const MIN_NODE_WIDTH = 72;
export declare const MIN_NODE_HEIGHT = 36;
/** Band between a group's border and its members. */
export declare const GROUP_PADDING = 16;
/** Extra band between a group label and its members. */
export declare const GROUP_LABEL_GAP = 6;
/** Smallest empty group box (a group with no members still draws). */
export declare const MIN_GROUP_WIDTH = 96;
export declare const MIN_GROUP_HEIGHT = 56;
/** Gap between two nodes in one layer. */
export declare const NODE_SPACING = 28;
/** Gap between two layers. */
export declare const LAYER_SPACING = 48;
/** Gap an edge keeps from a node it does not touch. */
export declare const EDGE_NODE_SPACING = 16;
/** Gap between two parallel edges. */
export declare const EDGE_EDGE_SPACING = 12;
/** Gap between two disconnected components. */
export declare const COMPONENT_SPACING = 40;
/** Gap between two ports on one side of a node. */
export declare const PORT_SPACING = 8;
/** Outer margin of the whole drawing. */
export declare const ROOT_PADDING = 16;
/** Fixed nonzero seed; layout must not vary between runs. */
export declare const ELK_RANDOM_SEED = 1;
export interface DiagramLayoutPoint {
    readonly x: number;
    readonly y: number;
}
export interface DiagramLayoutBox {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}
export interface DiagramLayoutPort extends DiagramLayoutBox {
    readonly name: string;
    readonly side?: DiagramPortSide;
}
export interface DiagramLayoutNode extends DiagramLayoutBox {
    readonly name: string;
    readonly shape: DiagramShape;
    readonly ports: readonly DiagramLayoutPort[];
}
export interface DiagramLayoutGroup extends DiagramLayoutBox {
    readonly name: string;
    /** 0 for an outermost group. */
    readonly depth: number;
}
export interface DiagramLayoutSection {
    readonly startPoint: DiagramLayoutPoint;
    readonly endPoint: DiagramLayoutPoint;
    readonly bendPoints: readonly DiagramLayoutPoint[];
}
export interface DiagramLayoutEdge {
    readonly sections: readonly DiagramLayoutSection[];
}
export interface DiagramLayout {
    readonly width: number;
    readonly height: number;
    /** Authored declaration order. */
    readonly nodes: readonly DiagramLayoutNode[];
    /** Authored declaration order. */
    readonly groups: readonly DiagramLayoutGroup[];
    /** Authored declaration order. */
    readonly edges: readonly DiagramLayoutEdge[];
}
/** Fail-closed layout refusal; the caller publishes no Artifact. */
export declare class DiagramLayoutError extends Error {
    readonly code: string;
    readonly remedy: string;
    constructor(message: string, remedy?: string);
}
/**
 * Effective label typography: the Theme's three typography sets raised to its
 * declared minimum readable size, with a line never shorter than its text.
 * Layout, the emitted label line spacing and the layout CSS all read this one
 * derivation, so the measured box and the drawn text cannot disagree.
 */
export interface DiagramLabelTypography {
    readonly nodeFontSizePx: number;
    readonly nodeLineHeightPx: number;
    readonly groupFontSizePx: number;
    readonly groupLineHeightPx: number;
    readonly edgeFontSizePx: number;
    readonly edgeLineHeightPx: number;
}
export declare function diagramLabelTypography(theme: Theme): DiagramLabelTypography;
/**
 * Measured, quantized layout for one Block. Deterministic; browser-free.
 *
 * Fails closed: the returned value is either a complete layout or a
 * `DiagramLayoutError` carrying a remedy — never a partial one.
 */
export declare function layoutDiagram(block: DiagramBlock, theme: Theme): Promise<DiagramLayout>;
