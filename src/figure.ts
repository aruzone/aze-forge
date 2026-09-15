import {
  FIGURE_PLUGIN_TYPE,
  FIGURE_PLUGIN_VERSION,
  FIGURE_BODY_SYNTAX_ID,
  FIGURE_BODY_SYNTAX_VERSION,
  figureSourceSchema,
  figureDataSchema,
} from "./figure-schemas.js";
import { numberingLabelHtml, renderInlineHtml } from "./html-fragment.js";
import type {
  AzeBlock,
  AzeBlockPlugin,
  AzeBlockRenderer,
  BlockRendererContext,
  FigureBlock,
} from "./model.js";

/**
 * The composition-owned `figure` wrapper (contract: issue #67 §3): one or more
 * Markdown Blocks plus eligible nested directives, numbered as a Figure. It is
 * the numbering path for ordinary Markdown content — images and pipe tables —
 * and for escape-hatch content such as a Mermaid diagram.
 */

export const FIGURE_HTML_BLOCK_RENDERER_ID = "azeforge.figure.html/v1" as const;
export const FIGURE_HTML_BLOCK_RENDERER_VERSION = "1.0.0" as const;

const pluginDescriptor = Object.freeze({
  type: FIGURE_PLUGIN_TYPE,
  version: FIGURE_PLUGIN_VERSION,
  title: "Figure",
  summary: "A numbered wrapper over Markdown content and eligible nested Blocks.",
  diagnosticNamespace: "azeforge.figure",
  sourceSchema: figureSourceSchema,
  bodySyntax: Object.freeze({
    id: FIGURE_BODY_SYNTAX_ID,
    version: FIGURE_BODY_SYNTAX_VERSION,
  }),
  dataSchema: figureDataSchema,
});

export const figurePlugin: AzeBlockPlugin = Object.freeze({
  descriptor: pluginDescriptor,
});

const blockRendererDescriptor = Object.freeze({
  id: FIGURE_HTML_BLOCK_RENDERER_ID,
  version: FIGURE_HTML_BLOCK_RENDERER_VERSION,
  blockType: FIGURE_PLUGIN_TYPE,
  pluginVersionRange: FIGURE_PLUGIN_VERSION,
  rendererId: "html",
  rendererVersionRange: "1.0.0",
});

export function renderFigureFragment(
  block: FigureBlock,
  context: BlockRendererContext,
): string {
  const caption =
    block.caption === undefined || block.caption.length === 0
      ? ""
      : `<figcaption>${numberingLabelHtml(block.numberLabel)}${renderInlineHtml(block.caption)}</figcaption>`;
  return `<figure class="aze-figure">${caption}${context.renderBlocks(block.children as readonly AzeBlock[])}</figure>`;
}

export const figureHtmlBlockRenderer: AzeBlockRenderer<FigureBlock> =
  Object.freeze({
    descriptor: blockRendererDescriptor,
    render: renderFigureFragment,
  });
