import { escapeHtml, renderInlineHtml } from "./html-fragment.js";
import type { AzeBlockPlugin, JsonValue, TableBlock } from "./model.js";

export const TABLE_PLUGIN_TYPE = "table" as const;
export const TABLE_PLUGIN_VERSION = "1.0.0" as const;
export const TABLE_BODY_SYNTAX_ID = "azeforge.gfm-table/v1" as const;
export const TABLE_BODY_SYNTAX_VERSION = "1.0.0" as const;
export const TABLE_HTML_BLOCK_RENDERER_ID = "azeforge.table.html/v1" as const;
export const TABLE_HTML_BLOCK_RENDERER_VERSION = "1.0.0" as const;

export const tableSourceSchema: JsonValue = Object.freeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "azeforge.table/source/v1",
  type: "object",
  additionalProperties: false,
  properties: {
    id: {
      type: "string",
      pattern: "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$",
    },
    caption: { type: "string", minLength: 1, maxLength: 500 },
  },
});

export const tableDataSchema: JsonValue = Object.freeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "azeforge.table/data/v1",
  type: "object",
  additionalProperties: false,
  required: ["pluginVersion"],
  properties: {
    kind: { const: "table" },
    pluginVersion: { const: "1.0.0" },
  },
});

const pluginDescriptor = Object.freeze({
  type: TABLE_PLUGIN_TYPE,
  version: TABLE_PLUGIN_VERSION,
  title: "Table",
  summary: "Captioned GFM table normalized through shared TableData.",
  diagnosticNamespace: "azeforge.table",
  sourceSchema: tableSourceSchema,
  bodySyntax: Object.freeze({
    id: TABLE_BODY_SYNTAX_ID,
    version: TABLE_BODY_SYNTAX_VERSION,
  }),
  dataSchema: tableDataSchema,
});

export const tablePlugin: AzeBlockPlugin = Object.freeze({
  descriptor: pluginDescriptor,
});

const blockRendererDescriptor = Object.freeze({
  id: TABLE_HTML_BLOCK_RENDERER_ID,
  version: TABLE_HTML_BLOCK_RENDERER_VERSION,
  blockType: TABLE_PLUGIN_TYPE,
  pluginVersionRange: "1.0.0",
  rendererId: "html",
  rendererVersionRange: "1.0.0",
});

function alignmentStyle(align: "left" | "center" | "right" | null): string {
  if (align === null) return "";
  return ` style="text-align:${align}"`;
}

export function renderTableFragment(block: TableBlock): string {
  const caption =
    block.caption === undefined || block.caption.length === 0
      ? ""
      : `<caption>${renderInlineHtml(block.caption)}</caption>`;
  const headerCells = block.data.header
    .map((cell, index) => {
      const align = block.data.align[index] ?? null;
      return `<th scope="col"${alignmentStyle(align)}>${renderInlineHtml(cell)}</th>`;
    })
    .join("");
  const bodyRows = block.data.rows
    .map(
      (row) =>
        `<tr>${row
          .map((cell, index) => {
            const align = block.data.align[index] ?? null;
            return `<td${alignmentStyle(align)}>${renderInlineHtml(cell)}</td>`;
          })
          .join("")}</tr>`,
    )
    .join("");
  const label = block.id === undefined ? "" : ` id="${escapeHtml(block.id)}"`;
  const table = `<table${label}>${caption}<thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table>`;
  if (block.caption !== undefined && block.caption.length > 0) {
    return `<figure class="aze-table">${table}</figure>`;
  }
  return table;
}

export const tableHtmlBlockRenderer = Object.freeze({
  descriptor: blockRendererDescriptor,
  render: renderTableFragment,
});
