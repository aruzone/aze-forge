/**
 * Native general-diagram emitter (contract: issue #76 §5; GH #60).
 *
 * One project-owned SVG emitter over the pinned ELK layout projection:
 * quantized 3-decimal coordinates, positional ids and an intrinsic finite
 * positive viewBox. The emitter registers no extent ceiling of its own —
 * layout is total, so every valid Block renders, and the Artifact-format
 * legs own their published byte and pixel limits. Placement is legibility, never
 * meaning: a reader who cannot see the pixels still gets mode, flow, counts,
 * nodes, edges and group membership from `<desc>`, and a directed edge differs
 * from an undirected one by geometry — an arrowhead polygon — rather than by
 * colour alone.
 *
 * The fragment carries no presentation attributes: every fill, stroke, width
 * and font size comes from the layout CSS in `render-html.ts`, so one fragment
 * serves every Theme. Zero scripts, zero event attributes, zero animation and
 * zero external references; every authored name is escaped and never becomes
 * an `id` (ids are positional, so two Blocks with the same names cannot
 * collide in one Document).
 */
import type { DiagramBlock, DiagramBlockRenderer, JsonValue, Theme } from "./model.js";
export declare const DIAGRAM_HTML_BLOCK_RENDERER_ID: "azeforge.diagram.html/v1";
export declare const DIAGRAM_HTML_BLOCK_RENDERER_VERSION: "1.0.0";
export declare const DIAGRAM_EMITTER_VERSION: "1.0.0";
/**
 * Fail-closed emitter fault. The caller publishes no Artifact and never sees a
 * partial figure: the extent guard runs before the first byte of markup.
 */
export declare class DiagramRenderError extends Error {
    readonly code = "azeforge.renderer#diagram-render";
    readonly remedy = "Re-check the diagram declaration list; a renderer failure publishes no Artifact.";
    constructor(message: string);
}
/**
 * Render one diagram Block: a static, browser-free, deterministic figure over
 * the pinned ELK layout projection. This is the family's only async boundary.
 */
export declare function renderDiagramFragment(block: DiagramBlock, context: Readonly<{
    sourceName?: string;
    ordinal?: number;
    theme?: Theme;
}>): Promise<string>;
/**
 * Fingerprint closure for the rendered-artifact hash (contract §12): the
 * layout language, the pinned engine, the emitter, the Advance metric and its
 * pinned font sources, the option set and the quantization.
 */
export declare function diagramDependencyClosure(): JsonValue;
export declare const diagramHtmlBlockRenderer: DiagramBlockRenderer;
