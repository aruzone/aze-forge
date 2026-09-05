import type {
  Diagnostic,
  JsonValue,
  ParsedBlock,
  SourcePosition,
  SourceRange,
} from "./model.js";
import { isObjectRecord } from "./type-guards.js";
import { createDiagnostic } from "./diagnostics.js";
const OUTPUT_FORMATS: Readonly<Record<string, true>> = {
  html: true,
  svg: true,
  png: true,
  pdf: true,
};


function hasOnlyKeys(record: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(record).every((key) => allowed.includes(key));
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((item) => isJsonValue(item));
  return (
    isObjectRecord(value) &&
    Object.values(value).every((item) => isJsonValue(item))
  );
}

function isSourcePosition(value: unknown): value is SourcePosition {
  if (!isObjectRecord(value) || !hasOnlyKeys(value, ["line", "column", "offset"])) {
    return false;
  }
  return (
    Number.isInteger(value.line) &&
    (value.line as number) >= 1 &&
    Number.isInteger(value.column) &&
    (value.column as number) >= 1 &&
    Number.isInteger(value.offset) &&
    (value.offset as number) >= 0
  );
}

function isSourceRange(value: unknown): value is SourceRange {
  if (!isObjectRecord(value) || !hasOnlyKeys(value, ["start", "end"])) return false;
  if (!isSourcePosition(value.start) || !isSourcePosition(value.end)) return false;
  return (
    value.start.offset <= value.end.offset &&
    (value.start.line < value.end.line ||
      (value.start.line === value.end.line &&
        value.start.column <= value.end.column))
  );
}

function hasValidCommonBlockFields(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  return (
    hasOnlyKeys(value, allowed) &&
    isSourceRange(value.range) &&
    (value.id === undefined || typeof value.id === "string")
  );
}

function isInlineNode(value: unknown): boolean {
  if (!isObjectRecord(value)) return false;
  if (value.kind === "text" || value.kind === "code") {
    return (
      hasOnlyKeys(value, ["kind", "value"]) && typeof value.value === "string"
    );
  }
  if (value.kind === "emphasis" || value.kind === "strong") {
    return (
      hasOnlyKeys(value, ["kind", "children"]) &&
      Array.isArray(value.children) &&
      (value.children as unknown[]).every((child) => isInlineNode(child))
    );
  }
  if (value.kind === "break") {
    return hasOnlyKeys(value, ["kind"]);
  }
  if (value.kind === "link") {
    return (
      hasOnlyKeys(value, ["kind", "href", "children", "title", "range"]) &&
      typeof value.href === "string" &&
      (value.href as string).length > 0 &&
      Array.isArray(value.children) &&
      (value.children as unknown[]).every((child) => isInlineNode(child)) &&
      (value.title === undefined || typeof value.title === "string") &&
      (value.range === undefined || isSourceRange(value.range))
    );
  }
  if (value.kind === "image") {
    return (
      hasOnlyKeys(value, ["kind", "src", "alt", "title", "range"]) &&
      typeof value.src === "string" &&
      (value.src as string).length > 0 &&
      typeof value.alt === "string" &&
      (value.title === undefined || typeof value.title === "string") &&
      (value.range === undefined || isSourceRange(value.range))
    );
  }
  return false;
}

function hasInlineChildren(value: unknown): boolean {
  return Array.isArray(value) && value.every((child) => isInlineNode(child));
}


function isParsedBlock(value: unknown): value is ParsedBlock {
  if (!isObjectRecord(value)) return false;
  if (value.kind === "heading") {
    return (
      hasValidCommonBlockFields(value, ["kind", "level", "children", "range", "id"]) &&
      Number.isInteger(value.level) &&
      (value.level as number) >= 1 &&
      (value.level as number) <= 6 &&
      hasInlineChildren(value.children)
    );
  }
  if (value.kind === "paragraph") {
    return (
      hasValidCommonBlockFields(value, ["kind", "children", "range", "id"]) &&
      hasInlineChildren(value.children)
    );
  }
  if (value.kind === "thematicBreak") {
    return hasValidCommonBlockFields(value, ["kind", "range", "id"]);
  }
  if (value.kind === "blockquote") {
    return (
      hasValidCommonBlockFields(value, ["kind", "children", "range", "id"]) &&
      Array.isArray(value.children) &&
      (value.children as unknown[]).every((child) => isParsedBlock(child))
    );
  }
  if (value.kind === "list") {
    return (
      hasValidCommonBlockFields(value, ["kind", "ordered", "items", "range", "id", "start"]) &&
      typeof value.ordered === "boolean" &&
      Array.isArray(value.items) &&
      (value.items as unknown[]).every(
        (item) =>
          isObjectRecord(item) &&
          hasOnlyKeys(item, ["blocks", "range"]) &&
          Array.isArray(item.blocks) &&
          (item.blocks as unknown[]).every((child) => isParsedBlock(child)) &&
          isSourceRange(item.range),
      ) &&
      (value.start === undefined ||
        (Number.isInteger(value.start) && (value.start as number) >= 0))
    );
  }
  if (value.kind === "code") {
    return (
      hasValidCommonBlockFields(value, ["kind", "value", "range", "id", "language"]) &&
      typeof value.value === "string" &&
      (value.language === undefined || typeof value.language === "string")
    );
  }
  if (value.kind === "table") {
    return (
      hasValidCommonBlockFields(value, ["kind", "data", "range", "id", "caption", "pluginVersion"]) &&
      isObjectRecord(value.data) &&
      hasOnlyKeys(value.data, ["align", "header", "rows"]) &&
      Array.isArray(value.data.align) &&
      (value.data.align as unknown[]).every(
        (entry) =>
          entry === null || entry === "left" || entry === "center" || entry === "right",
      ) &&
      Array.isArray(value.data.header) &&
      (value.data.header as unknown[]).every(
        (cell) => Array.isArray(cell) && (cell as unknown[]).every((node) => isInlineNode(node)),
      ) &&
      Array.isArray(value.data.rows) &&
      (value.data.rows as unknown[]).every(
        (row) =>
          Array.isArray(row) &&
          (row as unknown[]).every(
            (cell) => Array.isArray(cell) && (cell as unknown[]).every((node) => isInlineNode(node)),
          ),
      ) &&
      (value.data.header as unknown[]).length === (value.data.align as unknown[]).length &&
      (value.caption === undefined ||
        (Array.isArray(value.caption) &&
          (value.caption as unknown[]).every((node) => isInlineNode(node)))) &&
      (value.pluginVersion === undefined || value.pluginVersion === "1.0.0")
    );
  }
  if (value.kind === "callout") {
    return (
      hasValidCommonBlockFields(value, ["kind", "variant", "children", "range", "id", "title", "pluginVersion"]) &&
      typeof value.variant === "string" &&
      (value.variant as string).length > 0 &&
      Array.isArray(value.children) &&
      (value.children as unknown[]).every((child) => isParsedBlock(child)) &&
      (value.title === undefined ||
        (Array.isArray(value.title) &&
          (value.title as unknown[]).every((node) => isInlineNode(node)))) &&
      value.pluginVersion === "1.0.0"
    );
  }
  if (value.kind === "equation") {
    return (
      hasOnlyKeys(value, [
        "kind",
        "range",
        "id",
        "pluginVersion",
        "syntax",
        "source",
        "tex",
        "number",
        "align",
      ]) &&
      isSourceRange(value.range) &&
      (value.id === undefined || typeof value.id === "string") &&
      value.pluginVersion === "1.0.0" &&
      (value.syntax === "readable" || value.syntax === "latex") &&
      typeof value.source === "string" &&
      value.source.length > 0 &&
      typeof value.tex === "string" &&
      value.tex.length > 0 &&
      (value.number === undefined || typeof value.number === "boolean") &&
      (value.align === undefined ||
        value.align === "left" ||
        value.align === "center" ||
        value.align === "right")
    );
  }
  if (value.kind === "mermaid") {
    return (
      hasOnlyKeys(value, [
        "kind",
        "range",
        "id",
        "pluginVersion",
        "diagramType",
        "source",
        "title",
        "description",
      ]) &&
      isSourceRange(value.range) &&
      (value.id === undefined || typeof value.id === "string") &&
      value.pluginVersion === "1.0.0" &&
      typeof value.diagramType === "string" &&
      value.diagramType.length > 0 &&
      typeof value.source === "string" &&
      value.source.length > 0 &&
      (value.title === undefined || typeof value.title === "string") &&
      (value.description === undefined || typeof value.description === "string")
    );
  }
  if (value.kind === "invalid") {
    return (
      hasOnlyKeys(value, [
        "kind",
        "raw",
        "range",
        "diagnosticIndexes",
        "originalType",
      ]) &&
      typeof value.raw === "string" &&
      isSourceRange(value.range) &&
      Array.isArray(value.diagnosticIndexes) &&
      value.diagnosticIndexes.every(
        (index) => Number.isInteger(index) && index >= 0,
      ) &&
      (value.originalType === undefined || typeof value.originalType === "string")
    );
  }
  return false;
}

function isMetadata(value: unknown): boolean {
  if (
    !isObjectRecord(value) ||
    !hasOnlyKeys(value, ["authors", "extensions", "title", "theme", "outputs"]) ||
    !Array.isArray(value.authors) ||
    !value.authors.every((author) => typeof author === "string") ||
    !isObjectRecord(value.extensions) ||
    !Object.entries(value.extensions).every(
      ([key, extension]) =>
        /^x-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key) && isJsonValue(extension),
    ) ||
    (value.title !== undefined && typeof value.title !== "string") ||
    (value.theme !== undefined && typeof value.theme !== "string")
  ) {
    return false;
  }
  if (value.outputs === undefined) return true;
  return (
    Array.isArray(value.outputs) &&
    value.outputs.every(
      (output) => typeof output === "string" && OUTPUT_FORMATS[output] === true,
    ) &&
    new Set(value.outputs).size === value.outputs.length
  );
}

export function validateDocumentSchema(document: unknown): readonly Diagnostic[] {
  const valid =
    isObjectRecord(document) &&
    hasOnlyKeys(document, ["azemarkVersion", "schemaVersion", "metadata", "blocks"]) &&
    document.azemarkVersion === 1 &&
    document.schemaVersion === 1 &&
    isMetadata(document.metadata) &&
    Array.isArray(document.blocks) &&
    document.blocks.every((block) => isParsedBlock(block));
  if (valid) return [];
  return [
    createDiagnostic(
      "azeforge.document#schema-invalid",
      "error",
      "ParsedDocument does not conform to AzeMark Document schema v1.",
    ),
  ];
}

