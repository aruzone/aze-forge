import { CALLOUT_PLUGIN_TYPE, CALLOUT_PLUGIN_VERSION, CALLOUT_BODY_SYNTAX_ID, CALLOUT_BODY_SYNTAX_VERSION, calloutSourceSchema, calloutDataSchema, } from "./callout-schemas.js";
import { escapeHtml, renderInlineHtml } from "./html-fragment.js";
export const CALLOUT_HTML_BLOCK_RENDERER_ID = "azeforge.callout.html/v1";
export const CALLOUT_HTML_BLOCK_RENDERER_VERSION = "1.0.0";
const pluginDescriptor = Object.freeze({
    type: CALLOUT_PLUGIN_TYPE,
    version: CALLOUT_PLUGIN_VERSION,
    title: "Callout",
    summary: "Admonition container with nested Markdown content.",
    diagnosticNamespace: "azeforge.callout",
    sourceSchema: calloutSourceSchema,
    bodySyntax: Object.freeze({
        id: CALLOUT_BODY_SYNTAX_ID,
        version: CALLOUT_BODY_SYNTAX_VERSION,
    }),
    dataSchema: calloutDataSchema,
});
export const calloutPlugin = Object.freeze({
    descriptor: pluginDescriptor,
});
const blockRendererDescriptor = Object.freeze({
    id: CALLOUT_HTML_BLOCK_RENDERER_ID,
    version: CALLOUT_HTML_BLOCK_RENDERER_VERSION,
    blockType: CALLOUT_PLUGIN_TYPE,
    pluginVersionRange: "1.0.0",
    rendererId: "html",
    rendererVersionRange: "1.0.0",
});
export function renderCalloutFragment(block, context) {
    const variant = escapeHtml(block.variant);
    const title = block.title === undefined || block.title.length === 0
        ? ""
        : `<p class="aze-callout-title">${renderInlineHtml(block.title)}</p>`;
    const body = context.renderBlocks(block.children);
    // The authored id is never an element id: document composition owns the one
    // anchor per Block, so a reference target never collides with a figure id.
    const label = block.id === undefined ? "" : ` data-callout-id="${escapeHtml(block.id)}"`;
    return `<aside class="aze-callout" data-variant="${variant}"${label}>${title}<div class="aze-callout-body">${body}</div></aside>`;
}
export const calloutHtmlBlockRenderer = Object.freeze({
    descriptor: blockRendererDescriptor,
    render: renderCalloutFragment,
});
//# sourceMappingURL=callout.js.map