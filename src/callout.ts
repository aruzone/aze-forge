import { escapeHtml, renderInlineHtml } from "./html-fragment.js";
import type {
  AzeBlock,
  AzeBlockPlugin,
  CalloutBlock,
  JsonValue,
} from "./model.js";

export const CALLOUT_PLUGIN_TYPE = "callout" as const;
export const CALLOUT_PLUGIN_VERSION = "1.0.0" as const;
export const CALLOUT_BODY_SYNTAX_ID = "azeforge.callout-markdown/v1" as const;
export const CALLOUT_BODY_SYNTAX_VERSION = "1.0.0" as const;
export const CALLOUT_HTML_BLOCK_RENDERER_ID = "azeforge.callout.html/v1" as const;
export const CALLOUT_HTML_BLOCK_RENDERER_VERSION = "1.0.0" as const;

export const CALLOUT_VARIANTS = Object.freeze([
  "note",
  "tip",
  "important",
  "warning",
  "caution",
] as const);

export const calloutSourceSchema: JsonValue = Object.freeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "azeforge.callout/source/v1",
  type: "object",
  additionalProperties: false,
  properties: {
    id: {
      type: "string",
      pattern: "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$",
    },
    variant: { type: "string", enum: [...CALLOUT_VARIANTS] },
    title: { type: "string", minLength: 1, maxLength: 500 },
  },
});

export const calloutDataSchema: JsonValue = Object.freeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "azeforge.callout/data/v1",
  type: "object",
  additionalProperties: false,
  required: ["variant", "pluginVersion"],
  properties: {
    kind: { const: "callout" },
    variant: { type: "string", enum: [...CALLOUT_VARIANTS] },
    pluginVersion: { const: "1.0.0" },
  },
});

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

export const calloutPlugin: AzeBlockPlugin = Object.freeze({
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

export interface CalloutRenderContext {
  readonly sourceName?: string;
  readonly renderBlocks: (blocks: readonly AzeBlock[]) => string;
}

export function renderCalloutFragment(
  block: CalloutBlock,
  context: CalloutRenderContext,
): string {
  const variant = escapeHtml(block.variant);
  const title =
    block.title === undefined || block.title.length === 0
      ? ""
      : `<p class="aze-callout-title">${renderInlineHtml(block.title)}</p>`;
  const body = context.renderBlocks(block.children as readonly AzeBlock[]);
  const label = block.id === undefined ? "" : ` id="${escapeHtml(block.id)}"`;
  return `<aside class="aze-callout" data-variant="${variant}"${label}>${title}<div class="aze-callout-body">${body}</div></aside>`;
}

export const calloutHtmlBlockRenderer = Object.freeze({
  descriptor: blockRendererDescriptor,
  render: renderCalloutFragment,
});
