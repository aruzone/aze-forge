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

const CIRCUIT_COMPONENT_KINDS: Readonly<Record<string, true>> = {
  resistor: true,
  capacitor: true,
  inductor: true,
  "voltage-source": true,
  "current-source": true,
  diode: true,
  led: true,
  switch: true,
  "dependent-source": true,
  "op-amp": true,
  bjt: true,
  mosfet: true,
  and: true,
  or: true,
  nand: true,
  nor: true,
  xor: true,
  xnor: true,
  not: true,
  buffer: true,
  "mux-2to1": true,
  "mux-4to1": true,
  "d-flip-flop": true,
  "digital-input": true,
  "digital-output": true,
};

const CIRCUIT_GATE_KINDS: Readonly<Record<string, true>> = {
  and: true,
  or: true,
  nand: true,
  nor: true,
  xor: true,
  xnor: true,
};

function isCircuitText(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every((run) => {
      if (!isObjectRecord(run)) return false;
      if (
        run.kind === "text" ||
        run.kind === "subscript" ||
        run.kind === "superscript"
      ) {
        return (
          hasOnlyKeys(run, ["kind", "value"]) && typeof run.value === "string"
        );
      }
      return (
        run.kind === "quantity" &&
        hasOnlyKeys(run, ["kind", "coefficient", "prefix", "unit"]) &&
        typeof run.coefficient === "string" &&
        typeof run.prefix === "string" &&
        typeof run.unit === "string"
      );
    })
  );
}

function isCircuitComponent(value: unknown): boolean {
  if (!isObjectRecord(value)) return false;
  const kind = value.kind;
  return (
    typeof kind === "string" &&
    CIRCUIT_COMPONENT_KINDS[kind] === true &&
    hasOnlyKeys(value, [
      "kind",
      "ref",
      "terminals",
      "orientation",
      "inputs",
      "name",
      "value",
      "mode",
      "range",
    ]) &&
    typeof value.ref === "string" &&
    Array.isArray(value.terminals) &&
    value.terminals.every((terminal) => typeof terminal === "string") &&
    (value.orientation === undefined ||
      value.orientation === "left-to-right" ||
      value.orientation === "right-to-left" ||
      value.orientation === "top-to-bottom" ||
      value.orientation === "bottom-to-top") &&
    (value.inputs === undefined ||
      (CIRCUIT_GATE_KINDS[kind] === true &&
        (value.inputs === 2 || value.inputs === 3 || value.inputs === 4))) &&
    ((kind === "digital-input" || kind === "digital-output")
      ? isCircuitText(value.name)
      : value.name === undefined || isCircuitText(value.name)) &&
    (value.value === undefined || isCircuitText(value.value)) &&
    (value.mode === undefined || typeof value.mode === "string") &&
    isSourceRange(value.range)
  );
}

function isCircuitAnnotation(value: unknown): boolean {
  if (!isObjectRecord(value)) return false;
  if (value.kind === "voltage-label") {
    return (
      hasOnlyKeys(value, ["kind", "positive", "negative", "range"]) &&
      typeof value.positive === "string" &&
      typeof value.negative === "string" &&
      isSourceRange(value.range)
    );
  }
  if (value.kind === "current-label") {
    return (
      hasOnlyKeys(value, [
        "kind",
        "componentRef",
        "terminal",
        "direction",
        "range",
      ]) &&
      typeof value.componentRef === "string" &&
      typeof value.terminal === "string" &&
      (value.direction === "into" || value.direction === "out") &&
      isSourceRange(value.range)
    );
  }
  return false;
}


function isParsedBlock(value: unknown): value is ParsedBlock {
  if (!isObjectRecord(value)) return false;
  if (value.kind === "circuit") {
    return (
      hasOnlyKeys(value, ["kind", "range", "id", "number", "pluginVersion", "title", "description", "flow", "symbolConvention", "nodes", "components", "relations", "annotations"]) &&
      isSourceRange(value.range) &&
      (value.id === undefined || typeof value.id === "string") &&
      (value.number === undefined || typeof value.number === "boolean") &&
      value.pluginVersion === "1.0.0" &&
      isCircuitText(value.title) &&
      (value.description === undefined || isCircuitText(value.description)) &&
      (value.flow === "left-to-right" || value.flow === "top-to-bottom") &&
      (value.symbolConvention === "iec" || value.symbolConvention === "ansi") &&
      Array.isArray(value.nodes) &&
      value.nodes.every(
        (node) =>
          isObjectRecord(node) &&
          hasOnlyKeys(node, ["ref", "role", "label", "range"]) &&
          typeof node.ref === "string" &&
          (node.role === "signal" || node.role === "reference") &&
          (node.label === undefined || isCircuitText(node.label)) &&
          isSourceRange(node.range),
      ) &&
      Array.isArray(value.components) &&
      value.components.every((component) => isCircuitComponent(component)) &&
      Array.isArray(value.relations) &&
      value.relations.every((relation) => isObjectRecord(relation) && hasOnlyKeys(relation, ["componentRef", "terminal", "nodeId", "range"]) && typeof relation.componentRef === "string" && typeof relation.terminal === "string" && typeof relation.nodeId === "string" && isSourceRange(relation.range)) &&
      Array.isArray(value.annotations) &&
      value.annotations.every((annotation) => isCircuitAnnotation(annotation))
    );
  }
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
    if (value.pluginVersion === "2.0.0") {
      return (
        hasValidCommonBlockFields(value, ["kind", "data", "range", "id", "caption", "pluginVersion"]) &&
        isObjectRecord(value.data) &&
        hasOnlyKeys(value.data, ["columns", "groups", "rows"]) &&
        Array.isArray(value.data.columns) &&
        (value.data.columns as unknown[]).length > 0 &&
        (value.data.columns as unknown[]).every(
          (column) =>
            isObjectRecord(column) &&
            hasOnlyKeys(column, ["key", "name", "type", "unit"]) &&
            typeof column.key === "string" &&
            (column.name === undefined || typeof column.name === "string") &&
            (column.type === undefined ||
              typeof column.type === "string") &&
            (column.unit === undefined || typeof column.unit === "string"),
        ) &&
        Array.isArray(value.data.rows) &&
        (value.data.rows as unknown[]).every(
          (row) =>
            isObjectRecord(row) &&
            Object.values(row).every(
              (cell) =>
                cell === null ||
                typeof cell === "string" ||
                typeof cell === "number" ||
                typeof cell === "boolean" ||
                (Array.isArray(cell) && (cell as unknown[]).every((node) => isInlineNode(node))),
            ),
        ) &&
        (value.data.groups === undefined ||
          (Array.isArray(value.data.groups) &&
            (value.data.groups as unknown[]).every(
              (group) =>
                isObjectRecord(group) &&
                hasOnlyKeys(group, ["name", "columns"]) &&
                typeof group.name === "string" &&
                Array.isArray(group.columns) &&
                (group.columns as unknown[]).every((key) => typeof key === "string"),
            ))) &&
        (value.caption === undefined ||
          (Array.isArray(value.caption) &&
            (value.caption as unknown[]).every((node) => isInlineNode(node))))
      );
    }
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
        "notation",
        "tree",
        "spelling",
        "tex",
        "number",
        "align",
      ]) &&
      isSourceRange(value.range) &&
      (value.id === undefined || typeof value.id === "string") &&
      value.pluginVersion === "2.0.0" &&
      (value.notation === "native" || value.notation === "latex") &&
      (value.notation === "latex"
        ? typeof value.tex === "string" && value.tex.length > 0
        : isObjectRecord(value.tree) &&
          typeof value.spelling === "string" &&
          value.spelling.length > 0) &&
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
  if (value.kind === "derivation") {
    return (
      hasOnlyKeys(value, [
        "kind",
        "range",
        "id",
        "pluginVersion",
        "steps",
        "number",
        "align",
      ]) &&
      isSourceRange(value.range) &&
      (value.id === undefined || typeof value.id === "string") &&
      value.pluginVersion === "1.0.0" &&
      Array.isArray(value.steps) &&
      value.steps.length > 0 &&
      value.steps.every((step) =>
        isObjectRecord(step) &&
        hasOnlyKeys(step, ["expression", "tree", "annotation"]) &&
        typeof step.expression === "string" &&
        isObjectRecord(step.tree) &&
        (step.annotation === undefined ||
          (Array.isArray(step.annotation) &&
            (step.annotation as unknown[]).every((node) => isInlineNode(node)))),
      ) &&
      (value.number === undefined || typeof value.number === "boolean") &&
      (value.align === undefined ||
        value.align === "left" ||
        value.align === "center" ||
        value.align === "right")
    );
  }
  if (value.kind === "plot") {
    return (
      hasOnlyKeys(value, [
        "kind",
        "range",
        "id",
        "pluginVersion",
        "number",
        "width",
        "height",
        "legend",
        "grid",
        "parameters",
        "xAxis",
        "yAxis",
        "series",
      ]) &&
      isSourceRange(value.range) &&
      (value.id === undefined || typeof value.id === "string") &&
      value.pluginVersion === "1.0.0" &&
      typeof value.width === "number" &&
      typeof value.height === "number" &&
      typeof value.legend === "boolean" &&
      typeof value.grid === "boolean" &&
      isObjectRecord(value.parameters) &&
      isObjectRecord(value.xAxis) &&
      isObjectRecord(value.yAxis) &&
      Array.isArray(value.series) &&
      value.series.length > 0 &&
      (value.number === undefined || typeof value.number === "boolean")
    );
  }
  if (value.kind === "chart") {
    return (
      hasOnlyKeys(value, [
        "kind",
        "range",
        "id",
        "pluginVersion",
        "chartType",
        "number",
        "width",
        "height",
        "legend",
        "grid",
        "xLabel",
        "yLabel",
        "yMin",
        "yMax",
        "series",
      ]) &&
      isSourceRange(value.range) &&
      (value.id === undefined || typeof value.id === "string") &&
      value.pluginVersion === "1.0.0" &&
      typeof value.chartType === "string" &&
      typeof value.width === "number" &&
      typeof value.height === "number" &&
      typeof value.legend === "boolean" &&
      typeof value.grid === "boolean" &&
      Array.isArray(value.series) &&
      value.series.length > 0 &&
      (value.number === undefined || typeof value.number === "boolean")
    );
  }
  if (value.kind === "geometry") {
    return (
      hasOnlyKeys(value, [
        "kind",
        "range",
        "id",
        "pluginVersion",
        "number",
        "width",
        "height",
        "bounds",
        "declarations",
      ]) &&
      isSourceRange(value.range) &&
      (value.id === undefined || typeof value.id === "string") &&
      value.pluginVersion === "1.0.0" &&
      typeof value.width === "number" &&
      typeof value.height === "number" &&
      (value.bounds === undefined || isObjectRecord(value.bounds)) &&
      Array.isArray(value.declarations) &&
      value.declarations.length > 0 &&
      (value.number === undefined || typeof value.number === "boolean")
    );
  }
  if (value.kind === "formula") {
    return (
      hasOnlyKeys(value, [
        "kind",
        "range",
        "id",
        "pluginVersion",
        "number",
        "expression",
        "units",
        "charge",
        "chargeSpecified",
        "electron",
      ]) &&
      isSourceRange(value.range) &&
      (value.id === undefined || typeof value.id === "string") &&
      value.pluginVersion === "1.0.0" &&
      typeof value.expression === "string" &&
      Array.isArray(value.units) &&
      typeof value.charge === "number" &&
      typeof value.chargeSpecified === "boolean" &&
      typeof value.electron === "boolean" &&
      (value.number === undefined || typeof value.number === "boolean")
    );
  }
  if (value.kind === "reaction") {
    return (
      hasOnlyKeys(value, [
        "kind",
        "range",
        "id",
        "pluginVersion",
        "number",
        "above",
        "below",
        "balance",
        "arrow",
        "reactants",
        "products",
      ]) &&
      isSourceRange(value.range) &&
      (value.id === undefined || typeof value.id === "string") &&
      value.pluginVersion === "1.0.0" &&
      (value.above === undefined || typeof value.above === "string") &&
      (value.below === undefined || typeof value.below === "string") &&
      (value.balance === "none" || value.balance === "check") &&
      (value.arrow === "->" || value.arrow === "<-" || value.arrow === "<->") &&
      Array.isArray(value.reactants) &&
      Array.isArray(value.products) &&
      (value.number === undefined || typeof value.number === "boolean")
    );
  }
  if (value.kind === "structure") {
    return (
      hasOnlyKeys(value, [
        "kind",
        "range",
        "id",
        "pluginVersion",
        "number",
        "width",
        "height",
        "atoms",
        "bonds",
        "labels",
      ]) &&
      isSourceRange(value.range) &&
      (value.id === undefined || typeof value.id === "string") &&
      value.pluginVersion === "1.0.0" &&
      typeof value.width === "number" &&
      typeof value.height === "number" &&
      Array.isArray(value.atoms) &&
      Array.isArray(value.bonds) &&
      (value.labels === undefined || Array.isArray(value.labels)) &&
      (value.number === undefined || typeof value.number === "boolean")
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
    document.azemarkVersion === 2 &&
    document.schemaVersion === 2 &&
    isMetadata(document.metadata) &&
    Array.isArray(document.blocks) &&
    document.blocks.every((block) => isParsedBlock(block));
  if (valid) return [];
  return [
    createDiagnostic(
      "azeforge.document#schema-invalid",
      "error",
      "ParsedDocument does not conform to AzeMark Document schema v2.",
    ),
  ];
}

