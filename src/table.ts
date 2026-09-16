import {
  TABLE_PLUGIN_TYPE,
  TABLE_PLUGIN_VERSION,
  TABLE_BODY_SYNTAX_ID,
  TABLE_BODY_SYNTAX_VERSION,
  tableSourceSchema,
  tableDataSchema,
} from "./table-schemas.js";
import { renderEquationToHtml } from "./equation.js";
import { escapeHtml, numberingLabelHtml, renderInlineHtml } from "./html-fragment.js";
import { treeToTexFromProjection } from "./math.js";
import type {
  AzeBlockPlugin,
  BlockRendererContext,
  TableBlock,
  TableColumn,
  TypedTableCell,
} from "./model.js";

export const TABLE_HTML_BLOCK_RENDERER_ID = "azeforge.table.html/v1" as const;
export const TABLE_HTML_BLOCK_RENDERER_VERSION = "1.0.0" as const;

const pluginDescriptor = Object.freeze({
  type: TABLE_PLUGIN_TYPE,
  version: TABLE_PLUGIN_VERSION,
  title: "Typed Table",
  summary: "Typed shared-record table v2 normalized through TypedTableData.",
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
  pluginVersionRange: TABLE_PLUGIN_VERSION,
  rendererId: "html",
  rendererVersionRange: "1.0.0",
});

/**
 * Escape HTML and render caret exponents as superscripts, matching the
 * convention used everywhere else in the compiler (kg/m^3 -> kg/m<sup>3</sup>).
 */
function renderExponentHtml(text: string): string {
  return escapeHtml(text).replace(/\^(\d+)/g, "<sup>$1</sup>");
}

/** A present cell's authored text, canonicalized per its declared type. */
function renderCellValue(cell: TypedTableCell): string {
  switch (cell.kind) {
    case "prose":
      return renderInlineHtml(cell.value);
    case "text":
    case "integer":
    case "decimal":
      return escapeHtml(cell.value);
    case "quantity":
      return escapeHtml(cell.coefficient);
    case "boolean":
      return escapeHtml(cell.value ? "true" : "false");
    case "math":
      return `<span class="aze-table-math">${renderEquationToHtml(treeToTexFromProjection(cell.tree))}</span>`;
  }
}

/**
 * Typed table v2 (contract: issue #66 §15): a real `<caption>`, two header
 * rows at most with `scope=colgroup`/`scope=col`, per-cell header linkage,
 * the column unit adjacent to every value it applies to, and missing cells
 * left as empty `<td>` carrying the missing mark class.
 */
function renderTypedTableFragment(
  block: TableBlock,
  context: BlockRendererContext,
): string {
  const data = block.data;
  const ordinal = context.ordinal ?? 0;
  const base = `aze-table-${ordinal}`;
  const label =
    block.id === undefined ? "" : ` data-table-id="${escapeHtml(block.id)}"`;
  const number = block.number === true ? ' data-table-number="true"' : "";
  const captionText =
    block.caption === undefined || block.caption.length === 0
      ? ""
      : `${numberingLabelHtml(block.numberLabel)}${renderInlineHtml(block.caption)}`;

  const headerId = (column: TableColumn): string =>
    ` id="${base}-h-${escapeHtml(column.key)}"`;
  const columnName = (column: TableColumn): string =>
    column.name === undefined || column.name === ""
      ? column.key
      : column.name;

  const grouped = new Set(
    data.groups?.flatMap((group) => [...group.columns]) ?? [],
  );

  let headerRows = "";
  if (data.groups !== undefined && data.groups.length > 0) {
    const byKey = new Map(data.columns.map((column) => [column.key, column]));
    let cells = "";
    let index = 0;
    while (index < data.columns.length) {
      const column = data.columns[index];
      if (column === undefined) break;
      if (!grouped.has(column.key)) {
        cells += `<th rowspan="2" scope="col"${headerId(column)}>${renderExponentHtml(columnName(column))}</th>`;
        index += 1;
        continue;
      }
      const group = data.groups.find((candidate) =>
        candidate.columns.includes(column.key),
      );
      const members = group?.columns ?? [];
      const colspan = members.length;
      const first = byKey.get(members[0] as string);
      cells += `<th scope="colgroup" colspan="${colspan}" id="${base}-g-${escapeHtml(first?.key ?? String(index))}">${escapeHtml(group?.name ?? "")}</th>`;
      index += colspan;
    }
    headerRows += `<tr>${cells}</tr>`;
  }
  const headerCells = data.columns
    .filter((column) => data.groups === undefined || grouped.has(column.key))
    .map(
      (column) =>
        `<th scope="col"${headerId(column)}>${renderExponentHtml(columnName(column))}</th>`,
    )
    .join("");
  headerRows += `<tr>${headerCells}</tr>`;

  const bodyRows = data.rows
    .map((row) => {
      const cells = data.columns
        .map((column) => {
          const cell = row[column.key];
          const describe = ` headers="${base}-h-${escapeHtml(column.key)}"`;
          const align = ` style="text-align:${column.align ?? "left"}"`;
          if (cell === undefined) {
            return `<td class="aze-missing"${describe}${align}></td>`;
          }
          const unit =
            column.unit === undefined || column.unit === ""
              ? ""
              : ` <span class="aze-unit">${renderExponentHtml(column.unit)}</span>`;
          return `<td${describe}${align}>${renderCellValue(cell)}${unit}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  // The description reference exists only when the caption it names does, so a
  // captionless table never publishes a dangling IDREF.
  const caption =
    captionText === ""
      ? ""
      : `<caption id="${base}-caption">${captionText}</caption>`;
  const describedBy =
    caption === "" ? "" : ` aria-describedby="${base}-caption"`;
  const table = `<table class="aze-table"${label}${number}${describedBy}>${caption}<thead>${headerRows}</thead><tbody>${bodyRows}</tbody></table>`;
  if (caption === "") return table;
  return `<figure class="aze-table-figure">${table}</figure>`;
}

export function renderTableFragment(
  block: TableBlock,
  context: BlockRendererContext,
): string {
  return renderTypedTableFragment(block, context);
}

export const tableHtmlBlockRenderer = Object.freeze({
  descriptor: blockRendererDescriptor,
  render: renderTableFragment,
});
