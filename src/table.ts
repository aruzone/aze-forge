import {
  TABLE_PLUGIN_TYPE,
  TABLE_PLUGIN_VERSION,
  TABLE_BODY_SYNTAX_ID,
  TABLE_BODY_SYNTAX_VERSION,
  tableSourceSchema,
  tableDataSchema,
} from "./table-schemas.js";
import { escapeHtml, renderInlineHtml } from "./html-fragment.js";
import { canonicalExactDecimal } from "./quantity.js";
import type {
  AzeBlockPlugin,
  TableBlock,
  TableData,
  TypedTableData,
} from "./model.js";

export const TABLE_HTML_BLOCK_RENDERER_ID = "azeforge.table.html/v1" as const;
export const TABLE_HTML_BLOCK_RENDERER_VERSION = "1.0.0" as const;

/** Shared discriminators: typed table v2 has `columns`; GFM v1 tables do not. */
export function isTypedTableData(
  value: TableData | TypedTableData,
): value is TypedTableData {
  return "columns" in value;
}

const pluginDescriptor = Object.freeze({
  type: TABLE_PLUGIN_TYPE,
  version: TABLE_PLUGIN_VERSION,
  title: "Typed Table",
  summary: "Typed shared-record table v2 normalized through TableData.",
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
  pluginVersionRange: "2.0.0",
  rendererId: "html",
  rendererVersionRange: "1.0.0",
});

function canonicalCellText(cell: unknown, unit: string | undefined): string {
  const text = String(cell);
  if (unit === undefined || unit === "") return text;
  try {
    return canonicalExactDecimal(text);
  } catch {
    return text;
  }
}

function renderCellValue(cell: unknown, unit: string | undefined): string {
  if (Array.isArray(cell)) {
    return renderInlineHtml(cell);
  }
  if (cell === null || cell === undefined) return "";
  return escapeHtml(canonicalCellText(cell, unit));
}

function renderUnitHtml(unit: string): string {
  return escapeHtml(unit).replace(/\^(\d+)/g, "<sup>$1</sup>");
}

function renderTypedTableFragment(block: TableBlock, data: TypedTableData): string {
  const label = block.id === undefined ? "" : ` id="${escapeHtml(block.id)}"`;
  const caption =
    block.caption === undefined || block.caption.length === 0
      ? ""
      : `<caption>${renderInlineHtml(block.caption)}</caption>`;
  const columns = data.columns;
  let headerRows = "";
  if (data.groups !== undefined && data.groups.length > 0) {
    let groupHeader = "";
    for (const group of data.groups) {
      const colspan = group.columns.length;
      groupHeader += `<th scope="colgroup" colspan="${colspan}">${escapeHtml(group.name)}</th>`;
    }
    headerRows += `<tr>${groupHeader}</tr>`;
  }
  const headerCells = columns
    .map((column) => {
      const name =
        column.name === undefined || column.name === ""
          ? column.key
          : column.name;
      return `<th scope="col">${escapeHtml(name)}</th>`;
    })
    .join("");
  headerRows += `<tr>${headerCells}</tr>`;

  const bodyRows = data.rows
    .map((row) => {
      const cells = columns
        .map((column) => {
          const cell = row[column.key];
          if (cell === undefined) return "<td></td>";
          const unit =
            column.unit === undefined || column.unit === ""
              ? ""
              : ` <span class="aze-unit">${renderUnitHtml(column.unit)}</span>`;
          return `<td>${renderCellValue(cell, column.unit)}${unit}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");
  const table = `<table${label}>${caption}<thead>${headerRows}</thead><tbody>${bodyRows}</tbody></table>`;
  if (caption === "") return table;
  return `<figure class="aze-table">${table}</figure>`;
}

function renderGfmTableFragment(block: TableBlock): string {
  const data = block.data;
  if (isTypedTableData(data)) {
    return renderTypedTableFragment(block, data);
  }
  const label = block.id === undefined ? "" : ` id="${escapeHtml(block.id)}"`;
  const caption =
    block.caption === undefined || block.caption.length === 0
      ? ""
      : `<caption>${renderInlineHtml(block.caption)}</caption>`;
  const headerCells = data.header
    .map((cell) => `<th scope="col">${renderInlineHtml(cell)}</th>`)
    .join("");
  const bodyRows = data.rows
    .map(
      (row) =>
        `<tr>${row.map((cell) => `<td>${renderInlineHtml(cell)}</td>`).join("")}</tr>`,
    )
    .join("");
  const table = `<table${label}>${caption}<thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table>`;
  if (caption === "") return table;
  return `<figure class="aze-table">${table}</figure>`;
}

export function renderTableFragment(block: TableBlock): string {
  if (isTypedTableData(block.data)) {
    return renderTypedTableFragment(block, block.data);
  }
  return renderGfmTableFragment(block);
}

export const tableHtmlBlockRenderer = Object.freeze({
  descriptor: blockRendererDescriptor,
  render: renderTableFragment,
});
