import type { AzeBlockPlugin, AzeBlockRenderer, BlockRendererContext, FigureBlock } from "./model.js";
/**
 * The composition-owned `figure` wrapper (contract: issue #67 §3): one or more
 * Markdown Blocks plus eligible nested directives, numbered as a Figure. It is
 * the numbering path for ordinary Markdown content — images and pipe tables —
 * and for escape-hatch content such as a Mermaid diagram.
 */
export declare const FIGURE_HTML_BLOCK_RENDERER_ID: "azeforge.figure.html/v1";
export declare const FIGURE_HTML_BLOCK_RENDERER_VERSION: "1.0.0";
/**
 * Header keys the figure envelope accepts: `id`, `number` and `caption` are
 * the universal composition-header set `parseCompositionHeader`
 * (src/block-header.ts) resolves for every composition kind; the figure
 * envelope declares no further keys (`known: []` in src/parse.ts).
 */
export declare const FIGURE_HEADER_FIELDS: readonly ["id", "number", "caption"];
export declare const figurePlugin: AzeBlockPlugin;
export declare function renderFigureFragment(block: FigureBlock, context: BlockRendererContext): string;
export declare const figureHtmlBlockRenderer: AzeBlockRenderer<FigureBlock>;
