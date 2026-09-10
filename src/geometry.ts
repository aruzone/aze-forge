/**
 * Native geometry constructions and measurements (catalog Geometry family,
 * contract #59).
 *
 * One `:::: geometry` directive: an ordered backward-only declaration graph
 * over a y-up unitless exact-decimal frame. Construction intent lives in the
 * graph forever; resolved coordinates are renderer-derived and never hashed.
 * Rendering reuses the plots' owned SVG emission layer (fixed attribute
 * order, deterministic ids, quantized 3-decimal ASCII formatter, no text
 * measurement). Construction math is arithmetic plus `Math.sqrt`;
 * trigonometry appears only in arc parametrization and angle measures.
 */

import { createDiagnostic } from "./diagnostics.js";
import type {
  AzeBlockPlugin,
  AzeBlockRenderer,
  BlockRendererContext,
  Diagnostic,
  GeometryBlock,
  GeometryBounds,
  GeometryDeclaration,
  JsonValue,
  SourceRange,
} from "./model.js";
import {
  GEOMETRY_BODY_SYNTAX_ID,
  GEOMETRY_BODY_SYNTAX_VERSION,
  GEOMETRY_EMITTER_VERSION,
  GEOMETRY_EPSILON,
  GEOMETRY_EVAL_VERSION,
  GEOMETRY_PLUGIN_TYPE,
  GEOMETRY_PLUGIN_VERSION,
  geometryDataSchema,
  geometrySourceSchema,
} from "./geometry-schemas.js";
import { escapeXml, quantize } from "./plot.js";

/* ------------------------------------------------------------------ *
 * Ceilings (contract §7 — one stable code for all ceilings)
 * ------------------------------------------------------------------ */

export const MAX_GEOMETRY_DECLARATIONS = 256;
export const MAX_POLYGON_VERTICES = 64;
export const MAX_EQUAL_MARK_SEGMENTS = 16;
export const MAX_EQUAL_MARK_GROUPS = 16;
export const MAX_GEOMETRY_LABEL_CHARS = 500;
export const MAX_COORDINATE_MAGNITUDE = 1_000_000;
export const MAX_GEOMETRY_DIMENSION_PX = 4096;
export const DEFAULT_GEOMETRY_WIDTH = 640;
export const DEFAULT_GEOMETRY_HEIGHT = 400;

const NAMESPACE = "azeforge.geometry" as const;
const NAME_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const BLANK = /^[ \t]*$/;
const COMMENT = /^[ \t]*\/[\/](?:[ \t].*)?$/;
const FIELD_LINE = /^([ \t]*)([A-Za-z][A-Za-z0-9-]*)[ \t]*:(.*)$/;
const ITEM_OPEN = /^([ \t]*)-[ \t]*(.*)$/;

/** Source line handed from the envelope parser (text + exact line range). */
export interface GeometryInputLine {
  readonly text: string;
  readonly range: SourceRange;
}

const PRIMITIVE_KINDS = Object.freeze([
  "point",
  "segment",
  "line",
  "ray",
  "circle",
  "arc",
  "polygon",
] as const);
const CONSTRUCTION_KINDS = Object.freeze([
  "midpoint",
  "intersection",
  "tangent-line",
  "perpendicular-foot",
  "perpendicular-line",
  "parallel-line",
] as const);
const MARK_KINDS = Object.freeze([
  "angle-mark",
  "length-mark",
  "equal-marks",
  "right-angle-mark",
] as const);
const REGISTERED_KINDS: readonly string[] = Object.freeze([
  ...PRIMITIVE_KINDS,
  ...CONSTRUCTION_KINDS,
  ...MARK_KINDS,
]);

/** Fields each declaration kind accepts (contract §3, closed vocabulary). */
const FIELDS_BY_KIND: Readonly<Record<string, readonly string[]>> =
  Object.freeze({
    point: ["kind", "name", "label", "x", "y", "visible", "style"],
    segment: ["kind", "name", "label", "from", "to", "visible", "style"],
    line: ["kind", "name", "label", "through-first", "through-second", "visible", "style"],
    ray: ["kind", "name", "label", "origin", "through", "visible", "style"],
    circle: ["kind", "name", "label", "center", "radius", "point", "visible", "style"],
    arc: ["kind", "name", "label", "center", "radius", "start-angle", "end-angle", "direction", "visible", "style"],
    polygon: ["kind", "name", "label", "vertices", "visible", "style"],
    midpoint: ["kind", "name", "label", "from", "to", "visible", "style"],
    intersection: ["kind", "name", "label", "first", "second", "pick", "visible", "style"],
    "tangent-line": ["kind", "name", "label", "circle", "at", "from", "pick", "visible", "style"],
    "perpendicular-foot": ["kind", "name", "label", "from", "to", "visible", "style"],
    "perpendicular-line": ["kind", "name", "label", "through", "to", "visible", "style"],
    "parallel-line": ["kind", "name", "label", "through", "to", "visible", "style"],
    "angle-mark": ["kind", "first", "second", "third", "label", "measure", "visible", "style"],
    "length-mark": ["kind", "segment", "from", "to", "label", "measure", "visible", "style"],
    "equal-marks": ["kind", "group", "segments", "visible", "style"],
    "right-angle-mark": ["kind", "first", "second", "third", "visible", "style"],
  });

/* ------------------------------------------------------------------ *
 * Diagnostics
 * ------------------------------------------------------------------ */

function diag(
  code: string,
  message: string,
  range: SourceRange,
  sourceName: string | undefined,
  extra: {
    readonly severity?: "error" | "warning";
    readonly suggestion?: string;
    readonly data?: Readonly<Record<string, JsonValue>>;
  } = {},
): Diagnostic {
  return createDiagnostic(`${NAMESPACE}#${code}`, extra.severity ?? "error", message, {
    location:
      sourceName === undefined ? { range } : { source: sourceName, range },
    ...(extra.suggestion === undefined ? {} : { suggestion: extra.suggestion }),
    ...(extra.data === undefined ? {} : { data: extra.data }),
  });
}

function limitExceeded(
  subject: string,
  count: number,
  limit: number,
  range: SourceRange,
  sourceName: string | undefined,
): Diagnostic {
  return diag("limit-exceeded", `Geometry ${subject} count ${count} exceeds the limit of ${limit}.`, range, sourceName, {
    data: { subject, count, limit },
  });
}

function lineRange(line: GeometryInputLine): SourceRange {
  return line.range;
}

/* ------------------------------------------------------------------ *
 * Exact-decimal canonicalization (plot-numeral normalization)
 * ------------------------------------------------------------------ */

const DECIMAL_PATTERN = /^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/;
const NONFINITE_WORDS = new Set(["nan", "+nan", "-nan", "inf", "+inf", "-inf", "infinity", "+infinity", "-infinity"]);

function canonicalDecimal(raw: string): string | undefined {
  const text = raw.trim();
  if (text === "" || NONFINITE_WORDS.has(text.toLowerCase())) return undefined;
  if (!DECIMAL_PATTERN.test(text)) return undefined;
  const value = Number(text);
  if (!Number.isFinite(value)) return undefined;
  if (value === 0) return "0";
  let out = String(value);
  if (out.includes("e") || out.includes("E")) {
    // Keep exact-decimal canonical form without exponents where possible.
    const fixed = value.toPrecision(15);
    out = String(Number(fixed));
    if (out.includes("e") || out.includes("E")) return undefined;
  }
  return out;
}

function wrapAngle(raw: string): string | undefined {
  const canonical = canonicalDecimal(raw);
  if (canonical === undefined) return undefined;
  let value = Number(canonical) % 360;
  if (value < 0) value += 360;
  if (Object.is(value, -0)) value = 0;
  return canonicalDecimal(String(value)) ?? "0";
}

/* ------------------------------------------------------------------ *
 * Body parsing: `- kind:` items with flat fields + collections
 * ------------------------------------------------------------------ */

interface RawField {
  readonly key: string;
  readonly value: string;
  readonly line: GeometryInputLine;
}

interface RawDeclaration {
  readonly kind: string;
  readonly kindLine: GeometryInputLine;
  readonly fields: RawField[];
  /** Nested `- name` entries under a `key:` collection opener. */
  readonly collections: ReadonlyMap<string, readonly { value: string; line: GeometryInputLine }[]>;
  readonly order: number;
}


interface ParsedHeader {
  readonly id?: string;
  readonly number?: boolean;
  readonly width: number;
  readonly height: number;
  readonly bounds?: GeometryBounds;
}

function parseHeader(
  headerLines: readonly GeometryInputLine[],
  blockRange: SourceRange,
  sourceName: string | undefined,
): { header: ParsedHeader; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  let id: string | undefined;
  let number: boolean | undefined;
  let width = DEFAULT_GEOMETRY_WIDTH;
  let height = DEFAULT_GEOMETRY_HEIGHT;
  let bounds: GeometryBounds | undefined;
  const seen = new Set<string>();
  let boundsFields: { key: string; value: string; line: GeometryInputLine }[] | undefined;

  for (const line of headerLines) {
    const text = line.text;
    if (BLANK.test(text) || COMMENT.test(text)) continue;
    const match = FIELD_LINE.exec(text);
    if (match === null) {
      diagnostics.push(diag("unknown-field", `Geometry header line "${text.trim()}" is not a "key: value" field.`, lineRange(line), sourceName));
      continue;
    }
    const key = (match[2] ?? "").toLowerCase();
    const value = (match[3] ?? "").trim();
    if (key === "bounds") {
      if (seen.has("bounds")) {
        diagnostics.push(diag("duplicate-field", `Geometry header field "bounds" is declared twice.`, lineRange(line), sourceName));
        continue;
      }
      seen.add("bounds");
      boundsFields = [];
      continue;
    }
    if (boundsFields !== undefined && (key === "min-x" || key === "min-y" || key === "max-x" || key === "max-y")) {
      boundsFields.push({ key, value, line });
      continue;
    }
    if (boundsFields !== undefined) {
      // Close the bounds group: validate what was collected.
      const parsed = finishBounds(boundsFields, sourceName);
      diagnostics.push(...parsed.diagnostics);
      if (parsed.bounds !== undefined) bounds = parsed.bounds;
      boundsFields = undefined;
    }
    if (seen.has(key)) {
      diagnostics.push(diag("duplicate-field", `Geometry header field "${key}" is declared twice.`, lineRange(line), sourceName));
      continue;
    }
    seen.add(key);
    if (key === "id") {
      if (!NAME_PATTERN.test(value)) {
        diagnostics.push(diag("unknown-field", `Geometry id "${value}" must be lowercase-kebab.`, lineRange(line), sourceName));
        continue;
      }
      id = value;
    } else if (key === "number") {
      if (value !== "true" && value !== "false") {
        diagnostics.push(diag("unknown-field", `Geometry "number:" must be true or false.`, lineRange(line), sourceName));
        continue;
      }
      number = value === "true";
    } else if (key === "width" || key === "height") {
      if (!/^[0-9]+$/.test(value)) {
        diagnostics.push(diag("unknown-field", `Geometry "${key}:" must be a positive integer.`, lineRange(line), sourceName));
        continue;
      }
      const parsed = Number.parseInt(value, 10);
      if (parsed <= 0 || parsed > MAX_GEOMETRY_DIMENSION_PX) {
        diagnostics.push(limitExceeded(key, parsed, MAX_GEOMETRY_DIMENSION_PX, lineRange(line), sourceName));
        continue;
      }
      if (key === "width") width = parsed;
      else height = parsed;
    } else {
      diagnostics.push(diag("unknown-field", `Geometry header field "${key}" is not supported.`, lineRange(line), sourceName, {
        suggestion: 'Supported header fields: "id", "number", "width", "height", "bounds".',
      }));
    }
  }
  if (boundsFields !== undefined) {
    const parsed = finishBounds(boundsFields, sourceName);
    diagnostics.push(...parsed.diagnostics);
    if (parsed.bounds !== undefined) bounds = parsed.bounds;
  }
  void blockRange;
  return { header: { ...(id === undefined ? {} : { id }), ...(number === undefined ? {} : { number }), width, height, ...(bounds === undefined ? {} : { bounds }) }, diagnostics };
}

function finishBounds(
  fields: readonly { key: string; value: string; line: GeometryInputLine }[],
  sourceName: string | undefined,
): { bounds?: GeometryBounds; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const values: Record<string, string> = {};
  for (const field of fields) {
    if (values[field.key] !== undefined) {
      diagnostics.push(diag("duplicate-field", `Geometry bounds field "${field.key}" is declared twice.`, lineRange(field.line), sourceName));
      continue;
    }
    const canonical = canonicalDecimal(field.value);
    if (canonical === undefined) {
      diagnostics.push(diag("invalid-coordinate", `Geometry bounds field "${field.key}" value "${field.value}" is not a finite decimal.`, lineRange(field.line), sourceName));
      continue;
    }
    values[field.key] = canonical;
  }
  const missing = ["min-x", "min-y", "max-x", "max-y"].filter((key) => values[key] === undefined);
  if (missing.length > 0) {
    const first = fields[0]?.line.range;
    diagnostics.push(diag("invalid-bounds", `Geometry bounds require min-x, min-y, max-x, max-y (missing: ${missing.join(", ")}).`, first ?? ({ start: { line: 0, column: 0 }, end: { line: 0, column: 0 } } as SourceRange), sourceName));
    return { diagnostics };
  }
  const minX = Number(values["min-x"] ?? "0");
  const minY = Number(values["min-y"] ?? "0");
  const maxX = Number(values["max-x"] ?? "0");
  const maxY = Number(values["max-y"] ?? "0");
  if (!(minX < maxX && minY < maxY)) {
    const first = fields[0]?.line.range;
    diagnostics.push(diag("invalid-bounds", "Geometry bounds must be finite and nonempty (min < max).", first ?? ({ start: { line: 0, column: 0 }, end: { line: 0, column: 0 } } as SourceRange), sourceName));
    return { diagnostics };
  }
  const bounds: GeometryBounds = {
    minX: values["min-x"] as string,
    minY: values["min-y"] as string,
    maxX: values["max-x"] as string,
    maxY: values["max-y"] as string,
  };
  return { bounds, diagnostics };
}

/* ------------------------------------------------------------------ *
 * Evaluator: resolve the declaration graph in authored order
 * ------------------------------------------------------------------ */

interface Point { readonly x: number; readonly y: number }

interface Resolved {
  readonly point?: Point | undefined;
  readonly line?: { readonly px: number; readonly py: number; readonly dx: number; readonly dy: number } | undefined;
  readonly circle?: { readonly cx: number; readonly cy: number; readonly r: number } | undefined;
}

function tolerance(scale: number): number {
  return GEOMETRY_EPSILON * Math.max(1, Math.abs(scale));
}

function pointsCoincident(a: Point, b: Point): boolean {
  const tol = tolerance(Math.max(Math.abs(a.x), Math.abs(a.y), Math.abs(b.x), Math.abs(b.y)));
  return Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol;
}

function branchKey(p: Point): string {
  return `${quantize(p.x)}:${quantize(p.y)}`;
}

function orderBranches(points: readonly Point[]): Point[] {
  return [...points].sort((a, b) => {
    const ax = quantize(a.x);
    const bx = quantize(b.x);
    if (ax !== bx) return ax < bx ? -1 : 1;
    const ay = quantize(a.y);
    const by = quantize(b.y);
    if (ay !== by) return ay < by ? -1 : 1;
    return 0;
  });
}

export interface ValidatedGeometry {
  readonly block?: GeometryBlock;
  readonly diagnostics: readonly Diagnostic[];
}

function fieldMap(raw: RawDeclaration): Map<string, RawField> {
  const map = new Map<string, RawField>();
  for (const field of raw.fields) {
    if (!map.has(field.key)) map.set(field.key, field);
  }
  return map;
}

function duplicateFields(raw: RawDeclaration, sourceName: string | undefined, diagnostics: Diagnostic[]): void {
  const seen = new Set<string>();
  for (const field of raw.fields) {
    if (seen.has(field.key)) {
      diagnostics.push(diag("duplicate-field", `Geometry declaration "${field.key}" is declared twice.`, lineRange(field.line), sourceName));
    } else seen.add(field.key);
  }
}

/**
 * Validate one geometry Block body: closed vocabulary, backward-only
 * references, canonical branch ordering, versioned epsilon predicates.
 */
export function validateGeometryBlock(options: {
  readonly headerLines: readonly GeometryInputLine[];
  readonly bodyLines: readonly GeometryInputLine[];
  readonly blockRange: SourceRange;
  readonly sourceName: string | undefined;
}): ValidatedGeometry {
  const { headerLines, bodyLines, blockRange, sourceName } = options;
  const diagnostics: Diagnostic[] = [];
  const { header, diagnostics: headerDiagnostics } = parseHeader(headerLines, blockRange, sourceName);
  diagnostics.push(...headerDiagnostics);

  // --- Split body into `- kind:` items ---
  const raws: RawDeclaration[] = [];
  let current: { kind: string; kindLine: GeometryInputLine; fields: RawField[]; collections: Map<string, { value: string; line: GeometryInputLine }[]>; collectionKey?: string | undefined; order: number } | undefined;
  const flush = (): void => {
    if (current === undefined) return;
    const collections: RawDeclaration["collections"] = new Map(
      [...current.collections.entries()].map(([key, entries]) => [key, [...entries] as readonly { value: string; line: GeometryInputLine }[]]),
    );
    raws.push({ kind: current.kind, kindLine: current.kindLine, fields: [...current.fields], collections, order: current.order });
    current = undefined;
  };
  for (const line of bodyLines) {
    const text = line.text;
    if (BLANK.test(text) || COMMENT.test(text)) continue;
    const item = ITEM_OPEN.exec(text);
    if (item !== null) {
      const rest = (item[2] ?? "").trim();
      const kindMatch = /^kind[ \t]*:[ \t]*(.*)$/.exec(rest);
      if (kindMatch !== null) {
        flush();
        current = { kind: (kindMatch[1] ?? "").trim().toLowerCase(), kindLine: line, fields: [], collections: new Map(), order: raws.length };
        continue;
      }
      if (current !== undefined && current.collectionKey !== undefined) {
        const entry = current.collections.get(current.collectionKey);
        if (entry !== undefined) {
          entry.push({ value: rest, line });
          continue;
        }
      }
      // A `- ...` line outside a collection that is not `- kind:`: record
      // as an unknown declaration start so it errors below, never silently.
      flush();
      current = { kind: `\u0000invalid:${rest}`, kindLine: line, fields: [], collections: new Map(), order: raws.length };
      continue;
    }
    const field = FIELD_LINE.exec(text);
    if (field !== null && current !== undefined) {
      const key = (field[2] ?? "").toLowerCase();
      const value = (field[3] ?? "").trim();
      if (value === "" && (key === "vertices" || key === "segments")) {
        current.collections.set(key, []);
        current.collectionKey = key;
        continue;
      }
      current.collectionKey = undefined;
      current.fields.push({ key, value, line });
      continue;
    }
    if (current === undefined) {
      diagnostics.push(diag("unknown-declaration", `Geometry body line "${text.trim()}" must start a "- kind:" declaration.`, lineRange(line), sourceName));
      continue;
    }
    current.collectionKey = undefined;
    diagnostics.push(diag("unknown-field", `Geometry line "${text.trim()}" is not a "key: value" field.`, lineRange(line), sourceName));
  }
  flush();

  if (raws.length === 0) {
    diagnostics.push(diag("empty", "Geometry Block declares no declarations.", blockRange, sourceName));
    return { diagnostics };
  }
  if (raws.length > MAX_GEOMETRY_DECLARATIONS) {
    diagnostics.push(limitExceeded("declarations", raws.length, MAX_GEOMETRY_DECLARATIONS, blockRange, sourceName));
    return { diagnostics };
  }

  // --- Validate each declaration in order ---
  const declarations: GeometryDeclaration[] = [];
  const names = new Map<string, number>();
  const resolved = new Map<string, Resolved>();
  const points = new Map<string, Point>();
  const referenced = new Set<string>();
  const equalGroups = new Map<string, number>();
  let failed = false;

  const refPoint = (
    name: string,
    field: RawField,
  ): Point | undefined => {
    const target = points.get(name);
    if (target === undefined) {
      if (!names.has(name)) {
        diagnostics.push(diag("unresolved-reference", `Geometry reference "\`${name}\`" is not declared; declare \`${name}\` before referencing it.`, lineRange(field.line), sourceName, { data: { name } }));
      } else {
        diagnostics.push(diag("unresolved-reference", `Geometry reference "${name}" does not resolve to a point.`, lineRange(field.line), sourceName, { data: { name } }));
      }
      return undefined;
    }
    referenced.add(name);
    return target;
  };

  for (const raw of raws) {
    duplicateFields(raw, sourceName, diagnostics);
    if (raw.kind.startsWith("\u0000invalid:")) {
      diagnostics.push(diag("unknown-declaration", `Geometry declaration "${raw.kind.slice(9)}" is not registered.`, lineRange(raw.kindLine), sourceName, {
        suggestion: `Registered kinds: ${REGISTERED_KINDS.join(", ")}.`,
      }));
      failed = true;
      continue;
    }
    if (!REGISTERED_KINDS.includes(raw.kind)) {
      const candidates = REGISTERED_KINDS.filter((kind) => kind.startsWith(raw.kind.slice(0, 3))).slice(0, 3);
      diagnostics.push(diag("unknown-declaration", `Geometry declaration kind "${raw.kind}" is not registered.`, lineRange(raw.kindLine), sourceName, {
        ...(candidates.length > 0 ? { suggestion: `Did you mean ${candidates.map((c) => `"${c}"`).join(", ")}?` } : {}),
      }));
      failed = true;
      continue;
    }
    const allowed = FIELDS_BY_KIND[raw.kind] ?? [];
    const fields = fieldMap(raw);
    for (const field of raw.fields) {
      if (!allowed.includes(field.key)) {
        diagnostics.push(diag("unknown-field", `Geometry ${raw.kind} field "${field.key}" is not supported.`, lineRange(field.line), sourceName, {
          suggestion: `Supported fields: ${allowed.join(", ")}.`,
        }));
        failed = true;
      }
    }
    const requireField = (key: string): RawField | undefined => {
      const field = fields.get(key);
      if (field === undefined || field.value === "") {
        diagnostics.push(diag("missing-field", `Geometry ${raw.kind} requires a "${key}:" field.`, lineRange(raw.kindLine), sourceName));
        failed = true;
        return undefined;
      }
      return field;
    };

    const nameField = raw.kind === "angle-mark" || raw.kind === "length-mark" || raw.kind === "equal-marks" || raw.kind === "right-angle-mark"
      ? undefined
      : requireField("name");
    let name: string | undefined;
    if (nameField !== undefined) {
      name = nameField.value;
      if (!NAME_PATTERN.test(name)) {
        diagnostics.push(diag("unknown-field", `Geometry name "${name}" must be lowercase-kebab.`, lineRange(nameField.line), sourceName));
        failed = true;
        continue;
      }
      if (names.has(name)) {
        diagnostics.push(diag("duplicate-name", `Geometry name "${name}" is declared twice.`, lineRange(nameField.line), sourceName, { data: { name } }));
        failed = true;
        continue;
      }
    }

    const labelField = fields.get("label");
    const visibleField = fields.get("visible");
    const styleField = fields.get("style");
    let visible = true;
    if (visibleField !== undefined) {
      if (visibleField.value !== "true" && visibleField.value !== "false") {
        diagnostics.push(diag("unknown-field", `Geometry "visible:" must be true or false.`, lineRange(visibleField.line), sourceName));
        failed = true;
        continue;
      }
      visible = visibleField.value === "true";
    }
    let style: "solid" | "dashed" | undefined;
    if (styleField !== undefined) {
      if (styleField.value !== "solid" && styleField.value !== "dashed") {
        diagnostics.push(diag("unknown-style", `Geometry style "${styleField.value}" is not supported.`, lineRange(styleField.line), sourceName, { suggestion: 'Allowed: "solid", "dashed".' }));
        failed = true;
        continue;
      }
      style = styleField.value;
    }
    let label: string | undefined;
    if (labelField !== undefined) {
      if (labelField.value.length > MAX_GEOMETRY_LABEL_CHARS) {
        diagnostics.push(limitExceeded("label", labelField.value.length, MAX_GEOMETRY_LABEL_CHARS, lineRange(labelField.line), sourceName));
        failed = true;
        continue;
      }
      label = labelField.value;
    }

    const readDecimal = (key: string): { value: string; num: number; field: RawField } | undefined => {
      const field = requireField(key);
      if (field === undefined) return undefined;
      const canonical = canonicalDecimal(field.value);
      if (canonical === undefined) {
        diagnostics.push(diag("invalid-coordinate", `Geometry value "${field.value}" for "${key}" is not a finite decimal.`, lineRange(field.line), sourceName));
        failed = true;
        return undefined;
      }
      const num = Number(canonical);
      if (Math.abs(num) > MAX_COORDINATE_MAGNITUDE) {
        diagnostics.push(limitExceeded(`coordinate ${key}`, Math.abs(num), MAX_COORDINATE_MAGNITUDE, lineRange(field.line), sourceName));
        failed = true;
        return undefined;
      }
      return { value: canonical, num, field };
    };

    const readPointRef = (key: string): { name: string; point: Point; field: RawField } | undefined => {
      const field = requireField(key);
      if (field === undefined) return undefined;
      if (!NAME_PATTERN.test(field.value)) {
        diagnostics.push(diag("unresolved-reference", `Geometry reference "${field.value}" must be a lowercase-kebab name.`, lineRange(field.line), sourceName));
        failed = true;
        return undefined;
      }
      const targetOrder = names.get(field.value);
      if (targetOrder === undefined || targetOrder >= raw.order) {
        diagnostics.push(diag("unresolved-reference", `Geometry reference "\`${field.value}\`" is not declared; declare \`${field.value}\` before referencing it.`, lineRange(field.line), sourceName, { data: { name: field.value } }));
        failed = true;
        return undefined;
      }
      const point = refPoint(field.value, field);
      if (point === undefined) {
        failed = true;
        return undefined;
      }
      return { name: field.value, point, field };
    };

    const readLineish = (key: string): { name: string; line: NonNullable<Resolved["line"]>; field: RawField } | undefined => {
      const field = requireField(key);
      if (field === undefined) return undefined;
      const targetOrder = names.get(field.value);
      if (targetOrder === undefined || targetOrder >= raw.order) {
        diagnostics.push(diag("unresolved-reference", `Geometry reference "\`${field.value}\`" is not declared; declare \`${field.value}\` before referencing it.`, lineRange(field.line), sourceName, { data: { name: field.value } }));
        failed = true;
        return undefined;
      }
      referenced.add(field.value);
      const entry = resolved.get(field.value);
      const line = entry?.line;
      if (line === undefined) {
        diagnostics.push(diag("unresolved-reference", `Geometry reference "${field.value}" does not resolve to a line, segment, or ray.`, lineRange(field.line), sourceName, { data: { name: field.value } }));
        failed = true;
        return undefined;
      }
      return { name: field.value, line, field };
    };

    const readCircle = (key: string): { name: string; circle: NonNullable<Resolved["circle"]>; field: RawField } | undefined => {
      const field = requireField(key);
      if (field === undefined) return undefined;
      const targetOrder = names.get(field.value);
      if (targetOrder === undefined || targetOrder >= raw.order) {
        diagnostics.push(diag("unresolved-reference", `Geometry reference "\`${field.value}\`" is not declared; declare \`${field.value}\` before referencing it.`, lineRange(field.line), sourceName, { data: { name: field.value } }));
        failed = true;
        return undefined;
      }
      referenced.add(field.value);
      const entry = resolved.get(field.value);
      const circle = entry?.circle;
      if (circle === undefined) {
        diagnostics.push(diag("unresolved-reference", `Geometry reference "${field.value}" does not resolve to a circle.`, lineRange(field.line), sourceName, { data: { name: field.value } }));
        failed = true;
        return undefined;
      }
      return { name: field.value, circle, field };
    };

    const readShape = (key: string): { name: string; field: RawField } | undefined => {
      const field = requireField(key);
      if (field === undefined) return undefined;
      const targetOrder = names.get(field.value);
      if (targetOrder === undefined || targetOrder >= raw.order) {
        diagnostics.push(diag("unresolved-reference", `Geometry reference "\`${field.value}\`" is not declared; declare \`${field.value}\` before referencing it.`, lineRange(field.line), sourceName, { data: { name: field.value } }));
        failed = true;
        return undefined;
      }
      referenced.add(field.value);
      return { name: field.value, field };
    };

    const readPick = (branchCount: number, kindRange: SourceRange): number | undefined => {
      const field = fields.get("pick");
      if (branchCount > 1 && field === undefined) {
        diagnostics.push(diag("ambiguous-construction", `Geometry construction has ${branchCount} branches; add "pick: 1" or "pick: ${branchCount}".`, kindRange, sourceName, { data: { branches: branchCount } }));
        failed = true;
        return undefined;
      }
      if (field === undefined) return 1;
      if (!/^[0-9]+$/.test(field.value)) {
        diagnostics.push(diag("invalid-pick", `Geometry pick "${field.value}" must be a 1-based integer.`, lineRange(field.line), sourceName));
        failed = true;
        return undefined;
      }
      const pick = Number.parseInt(field.value, 10);
      if (pick < 1 || pick > branchCount) {
        diagnostics.push(diag("invalid-pick", `Geometry pick "${field.value}" is out of range for ${branchCount} branches.`, lineRange(field.line), sourceName, { data: { pick, branches: branchCount } }));
        failed = true;
        return undefined;
      }
      return pick;
    };

    const registerName = (entry: Resolved, extra: Omit<GeometryDeclaration, "kind" | "name">): void => {
      if (name === undefined) return;
      names.set(name, raw.order);
      resolved.set(name, entry);
      const declaration: GeometryDeclaration = {
        kind: raw.kind,
        name,
        ...(label === undefined ? {} : { label }),
        ...(visible === true ? {} : { visible }),
        ...(style === undefined ? {} : { style }),
        ...extra,
      };
      const point = entry.point;
      if (point !== undefined) points.set(name, point);
      declarations.push(declaration);
    };

    switch (raw.kind) {
      case "point": {
        const x = readDecimal("x");
        const y = readDecimal("y");
        if (x === undefined || y === undefined) break;
        registerName({ point: { x: x.num, y: y.num } }, { x: x.value, y: y.value });
        break;
      }
      case "segment":
      case "midpoint": {
        const from = readPointRef("from");
        const to = readPointRef("to");
        if (from === undefined || to === undefined) break;
        if (pointsCoincident(from.point, to.point)) {
          diagnostics.push(diag("degenerate", "Geometry segment endpoints coincide within epsilon.", lineRange(raw.kindLine), sourceName, { data: { reason: "coincident-points" } }));
          failed = true;
          break;
        }
        if (raw.kind === "segment") {
          const dx = to.point.x - from.point.x;
          const dy = to.point.y - from.point.y;
          registerName(
            { line: { px: from.point.x, py: from.point.y, dx, dy }, point: undefined },
            { from: from.name, to: to.name },
          );
        } else {
          const mid = { x: (from.point.x + to.point.x) / 2, y: (from.point.y + to.point.y) / 2 };
          registerName({ point: mid }, { from: from.name, to: to.name });
        }
        break;
      }
      case "line": {
        const first = readPointRef("through-first");
        const second = readPointRef("through-second");
        if (first === undefined || second === undefined) break;
        if (pointsCoincident(first.point, second.point)) {
          diagnostics.push(diag("degenerate", "Geometry line points coincide within epsilon.", lineRange(raw.kindLine), sourceName, { data: { reason: "coincident-points" } }));
          failed = true;
          break;
        }
        registerName(
          { line: { px: first.point.x, py: first.point.y, dx: second.point.x - first.point.x, dy: second.point.y - first.point.y } },
          { throughFirst: first.name, throughSecond: second.name },
        );
        break;
      }
      case "ray": {
        const origin = readPointRef("origin");
        const through = readPointRef("through");
        if (origin === undefined || through === undefined) break;
        if (pointsCoincident(origin.point, through.point)) {
          diagnostics.push(diag("degenerate", "Geometry ray points coincide within epsilon.", lineRange(raw.kindLine), sourceName, { data: { reason: "coincident-points" } }));
          failed = true;
          break;
        }
        registerName(
          { line: { px: origin.point.x, py: origin.point.y, dx: through.point.x - origin.point.x, dy: through.point.y - origin.point.y } },
          { origin: origin.name, through: through.name },
        );
        break;
      }
      case "circle": {
        const center = readPointRef("center");
        if (center === undefined) break;
        const radiusField = fields.get("radius");
        const onField = fields.get("point");
        if ((radiusField === undefined) === (onField === undefined)) {
          diagnostics.push(diag("missing-field", 'Geometry circle requires exactly one of "radius:" or "point:".', lineRange(raw.kindLine), sourceName));
          failed = true;
          break;
        }
        if (radiusField !== undefined) {
          const radius = readDecimal("radius");
          if (radius === undefined) break;
          if (!(radius.num > 0)) {
            diagnostics.push(diag("degenerate", "Geometry circle radius must be positive.", lineRange(radius.field.line), sourceName, { data: { reason: "nonpositive-radius" } }));
            failed = true;
            break;
          }
          registerName(
            { circle: { cx: center.point.x, cy: center.point.y, r: radius.num } },
            { center: center.name, radius: radius.value },
          );
        } else if (onField !== undefined) {
          const targetOrder = names.get(onField.value);
          if (targetOrder === undefined || targetOrder >= raw.order) {
            diagnostics.push(diag("unresolved-reference", `Geometry reference "\`${onField.value}\`" is not declared; declare \`${onField.value}\` before referencing it.`, lineRange(onField.line), sourceName, { data: { name: onField.value } }));
            failed = true;
            break;
          }
          const on = refPoint(onField.value, onField);
          if (on === undefined) {
            failed = true;
            break;
          }
          const r = Math.hypot(on.x - center.point.x, on.y - center.point.y);
          if (!(r > tolerance(Math.max(Math.abs(center.point.x), Math.abs(center.point.y))))) {
            diagnostics.push(diag("degenerate", "Geometry circle radius must be positive.", lineRange(raw.kindLine), sourceName, { data: { reason: "nonpositive-radius" } }));
            failed = true;
            break;
          }
          registerName(
            { circle: { cx: center.point.x, cy: center.point.y, r } },
            { center: center.name, point: onField.value },
          );
        }
        break;
      }
      case "arc": {
        const center = readPointRef("center");
        const radius = readDecimal("radius");
        const startField = requireField("start-angle");
        const endField = requireField("end-angle");
        const directionField = requireField("direction");
        if (center === undefined || radius === undefined || startField === undefined || endField === undefined || directionField === undefined) break;
        if (!(radius.num > 0)) {
          diagnostics.push(diag("degenerate", "Geometry arc radius must be positive.", lineRange(radius.field.line), sourceName, { data: { reason: "nonpositive-radius" } }));
          failed = true;
          break;
        }
        if (directionField.value !== "cw" && directionField.value !== "ccw") {
          diagnostics.push(diag("unknown-direction", `Geometry direction "${directionField.value}" is not supported.`, lineRange(directionField.line), sourceName, { suggestion: 'Allowed: "cw", "ccw".' }));
          failed = true;
          break;
        }
        const start = wrapAngle(startField.value);
        const end = wrapAngle(endField.value);
        if (start === undefined || end === undefined) {
          diagnostics.push(diag("invalid-coordinate", "Geometry arc angle must be a finite decimal in degrees.", lineRange(raw.kindLine), sourceName));
          failed = true;
          break;
        }
        const span = directionField.value === "ccw"
          ? (Number(end) - Number(start) + 360) % 360
          : (Number(start) - Number(end) + 360) % 360;
        if (!(span > 0) || span >= 360 - 1e-9) {
          diagnostics.push(diag("degenerate", "Geometry arc span must be below 360 degrees.", lineRange(raw.kindLine), sourceName, { data: { reason: "arc-span" } }));
          failed = true;
          break;
        }
        registerName(
          { circle: { cx: center.point.x, cy: center.point.y, r: radius.num } },
          { center: center.name, radius: radius.value, startAngle: start, endAngle: end, direction: directionField.value },
        );
        break;
      }
      case "polygon": {
        const entries = raw.collections.get("vertices");
        if (entries === undefined || entries.length === 0) {
          diagnostics.push(diag("missing-field", 'Geometry polygon requires a "vertices:" collection.', lineRange(raw.kindLine), sourceName));
          failed = true;
          break;
        }
        if (entries.length > MAX_POLYGON_VERTICES) {
          diagnostics.push(limitExceeded("polygon vertices", entries.length, MAX_POLYGON_VERTICES, lineRange(raw.kindLine), sourceName));
          failed = true;
          break;
        }
        const vertices: string[] = [];
        let ok = true;
        for (const entry of entries) {
          const targetOrder = names.get(entry.value);
          if (targetOrder === undefined || targetOrder >= raw.order || points.get(entry.value) === undefined) {
            diagnostics.push(diag("unresolved-reference", `Geometry reference "\`${entry.value}\`" is not declared; declare \`${entry.value}\` before referencing it.`, lineRange(entry.line), sourceName, { data: { name: entry.value } }));
            ok = false;
            continue;
          }
          referenced.add(entry.value);
          vertices.push(entry.value);
        }
        if (!ok) {
          failed = true;
          break;
        }
        const distinct = new Set(vertices.map((v) => branchKey(points.get(v) as Point)));
        if (vertices.length < 3 || distinct.size < 3) {
          diagnostics.push(diag("degenerate", "Geometry polygon requires at least 3 distinct vertices.", lineRange(raw.kindLine), sourceName, { data: { reason: "polygon-needs-3" } }));
          failed = true;
          break;
        }
        registerName({}, { vertices });
        break;
      }
      case "intersection": {
        const first = readShape("first");
        const second = readShape("second");
        if (first === undefined || second === undefined) break;
        const a = resolved.get(first.name);
        const b = resolved.get(second.name);
        if (a === undefined || b === undefined) {
          failed = true;
          break;
        }
        const candidates = intersectShapes(a, b, first.name, second.name, resolved, points);
        const bothLines = a.line !== undefined && b.line !== undefined;
        if (candidates === undefined) {
          diagnostics.push(diag("no-solution", bothLines ? "Geometry lines are parallel within epsilon." : "Geometry intersection has no solution.", lineRange(raw.kindLine), sourceName, { data: { reason: bothLines ? "parallel" : "no-intersection" } }));
          failed = true;
          break;
        }
        if (candidates.length === 0) {
          diagnostics.push(diag("no-solution", bothLines ? "Geometry lines are coincident within epsilon." : "Geometry intersection has no solution.", lineRange(raw.kindLine), sourceName, { data: { reason: bothLines ? "coincident" : "no-intersection" } }));
          failed = true;
          break;
        }
        if (candidates.length === 1 && ((a.line !== undefined && b.circle !== undefined) || (a.circle !== undefined && b.line !== undefined))) {
          diagnostics.push(diag("degenerate", "Geometry intersection is a tangent contact within epsilon; recovering a tangency point this way is refused.", lineRange(raw.kindLine), sourceName, { data: { reason: "tangent-contact" } }));
          failed = true;
          break;
        }
        if (candidates.length > 2) {
          diagnostics.push(diag("degenerate", "Geometry intersection is coincident within epsilon.", lineRange(raw.kindLine), sourceName, { data: { reason: "within-epsilon" } }));
          failed = true;
          break;
        }
        const pick = readPick(candidates.length, lineRange(raw.kindLine));
        if (pick === undefined) break;
        const ordered = orderBranches(candidates);
        const chosen = ordered[pick - 1] as Point;
        registerName({ point: chosen }, { first: first.name, second: second.name, ...(candidates.length > 1 ? { pick } : {}) });
        break;
      }
      case "tangent-line": {
        const circleRef = readCircle("circle");
        if (circleRef === undefined) break;
        const atField = fields.get("at");
        const fromField = fields.get("from");
        if ((atField === undefined) === (fromField === undefined)) {
          diagnostics.push(diag("missing-field", 'Geometry tangent-line requires exactly one of "at:" or "from:".', lineRange(raw.kindLine), sourceName));
          failed = true;
          break;
        }
        if (atField !== undefined && atField.value !== "") {
          const targetOrder = names.get(atField.value);
          if (targetOrder === undefined || targetOrder >= raw.order) {
            diagnostics.push(diag("unresolved-reference", `Geometry reference "\`${atField.value}\`" is not declared; declare \`${atField.value}\` before referencing it.`, lineRange(atField.line), sourceName, { data: { name: atField.value } }));
            failed = true;
            break;
          }
          const at = refPoint(atField.value, atField);
          if (at === undefined) {
            failed = true;
            break;
          }
          const dist = Math.hypot(at.x - circleRef.circle.cx, at.y - circleRef.circle.cy);
          const tol = tolerance(Math.max(Math.abs(circleRef.circle.r), Math.abs(dist)));
          if (Math.abs(dist - circleRef.circle.r) > tol) {
            diagnostics.push(diag("no-solution", "Geometry tangent point is not on the circle within epsilon.", lineRange(raw.kindLine), sourceName, { data: { reason: "point-not-on-circle" } }));
            failed = true;
            break;
          }
          const dx = at.x - circleRef.circle.cx;
          const dy = at.y - circleRef.circle.cy;
          registerName(
            { line: { px: at.x, py: at.y, dx: -dy, dy: dx } },
            { circle: circleRef.name, at: atField.value },
          );
        } else if (fromField !== undefined) {
          const targetOrder = names.get(fromField.value);
          if (targetOrder === undefined || targetOrder >= raw.order) {
            diagnostics.push(diag("unresolved-reference", `Geometry reference "\`${fromField.value}\`" is not declared; declare \`${fromField.value}\` before referencing it.`, lineRange(fromField.line), sourceName, { data: { name: fromField.value } }));
            failed = true;
            break;
          }
          const from = refPoint(fromField.value, fromField);
          if (from === undefined) {
            failed = true;
            break;
          }
          const tangency = tangentPointsFromExterior(circleRef.circle, from);
          if (tangency === undefined) {
            diagnostics.push(diag("no-solution", "Geometry tangent point is interior to the circle.", lineRange(raw.kindLine), sourceName, { data: { reason: "interior-point" } }));
            failed = true;
            break;
          }
          const pick = readPick(tangency.length, lineRange(raw.kindLine));
          if (pick === undefined) break;
          const ordered = orderBranches(tangency);
          const touch = ordered[pick - 1] as Point;
          registerName(
            { line: { px: from.x, py: from.y, dx: touch.x - from.x, dy: touch.y - from.y } },
            { circle: circleRef.name, from: fromField.value, pick },
          );
        }
        break;
      }
      case "perpendicular-foot": {
        const from = readPointRef("from");
        const to = readLineish("to");
        if (from === undefined || to === undefined) break;
        const foot = projectOntoLine(from.point, to.line);
        registerName({ point: foot }, { from: from.name, to: to.name });
        break;
      }
      case "perpendicular-line":
      case "parallel-line": {
        const through = readPointRef("through");
        const to = readLineish("to");
        if (through === undefined || to === undefined) break;
        const direction = raw.kind === "parallel-line"
          ? { dx: to.line.dx, dy: to.line.dy }
          : { dx: -to.line.dy, dy: to.line.dx };
        registerName(
          { line: { px: through.point.x, py: through.point.y, dx: direction.dx, dy: direction.dy } },
          { through: through.name, to: to.name },
        );
        break;
      }
      case "angle-mark":
      case "right-angle-mark": {
        const first = readPointRef("first");
        const second = readPointRef("second");
        const third = readPointRef("third");
        if (first === undefined || second === undefined || third === undefined) break;
        if (raw.kind === "right-angle-mark") {
          if (labelField !== undefined || fields.get("measure") !== undefined) {
            diagnostics.push(diag("invalid-mark-content", "Geometry right-angle-mark carries no label or measure.", lineRange(raw.kindLine), sourceName));
            failed = true;
            break;
          }
          declarations.push({ kind: raw.kind, first: first.name, second: second.name, third: third.name });
          break;
        }
        const measureField = fields.get("measure");
        if ((label === undefined) === (measureField === undefined)) {
          diagnostics.push(diag("invalid-mark-content", "Geometry mark requires exactly one of \"label:\" or \"measure:\".", lineRange(raw.kindLine), sourceName));
          failed = true;
          break;
        }
        if (measureField !== undefined && measureField.value !== "angle") {
          diagnostics.push(diag("unknown-measure", `Geometry measure "${measureField.value}" is not supported.`, lineRange(measureField.line), sourceName, { suggestion: 'Allowed: "angle".' }));
          failed = true;
          break;
        }
        declarations.push({
          kind: raw.kind,
          first: first.name,
          second: second.name,
          third: third.name,
          ...(label === undefined ? {} : { label }),
          ...(measureField === undefined ? {} : { measure: measureField.value }),
        });
        break;
      }
      case "length-mark": {
        const segmentField = fields.get("segment");
        const fromField = fields.get("from");
        const toField = fields.get("to");
        const measureField = fields.get("measure");
        if ((label === undefined) === (measureField === undefined)) {
          diagnostics.push(diag("invalid-mark-content", "Geometry mark requires exactly one of \"label:\" or \"measure:\".", lineRange(raw.kindLine), sourceName));
          failed = true;
          break;
        }
        if (measureField !== undefined && measureField.value !== "length") {
          diagnostics.push(diag("unknown-measure", `Geometry measure "${measureField.value}" is not supported.`, lineRange(measureField.line), sourceName, { suggestion: 'Allowed: "length".' }));
          failed = true;
          break;
        }
        if (segmentField !== undefined && segmentField.value !== "") {
          if (fromField !== undefined || toField !== undefined) {
            diagnostics.push(diag("missing-field", 'Geometry length-mark takes either "segment:" or "from:"/"to:", not both.', lineRange(raw.kindLine), sourceName));
            failed = true;
            break;
          }
          const target = readShape("segment");
          if (target === undefined) break;
          if (declarations.find((declared) => declared.name === target.name)?.kind !== "segment") {
            diagnostics.push(diag("unresolved-reference", `Geometry length-mark segment "${target.name}" does not resolve to a segment.`, lineRange(raw.kindLine), sourceName, { data: { name: target.name } }));
            failed = true;
            break;
          }
          declarations.push({
            kind: raw.kind,
            segment: target.name,
            ...(label === undefined ? {} : { label }),
            ...(measureField === undefined ? {} : { measure: measureField.value }),
          });
        } else {
          const from = readPointRef("from");
          const to = readPointRef("to");
          if (from === undefined || to === undefined) break;
          declarations.push({
            kind: raw.kind,
            from: from.name,
            to: to.name,
            ...(label === undefined ? {} : { label }),
            ...(measureField === undefined ? {} : { measure: measureField.value }),
          });
        }
        break;
      }
      case "equal-marks": {
        const groupField = requireField("group");
        const entries = raw.collections.get("segments");
        if (groupField === undefined) break;
        if (!NAME_PATTERN.test(groupField.value)) {
          diagnostics.push(diag("unknown-field", `Geometry group "${groupField.value}" must be lowercase-kebab.`, lineRange(groupField.line), sourceName));
          failed = true;
          break;
        }
        if (entries === undefined || entries.length === 0) {
          diagnostics.push(diag("missing-field", 'Geometry equal-marks requires a "segments:" collection.', lineRange(raw.kindLine), sourceName));
          failed = true;
          break;
        }
        if (entries.length > MAX_EQUAL_MARK_SEGMENTS) {
          diagnostics.push(limitExceeded("equal-marks segments", entries.length, MAX_EQUAL_MARK_SEGMENTS, lineRange(raw.kindLine), sourceName));
          failed = true;
          break;
        }
        if (!equalGroups.has(groupField.value) && equalGroups.size >= MAX_EQUAL_MARK_GROUPS) {
          diagnostics.push(limitExceeded("equal-marks groups", equalGroups.size + 1, MAX_EQUAL_MARK_GROUPS, lineRange(raw.kindLine), sourceName));
          failed = true;
          break;
        }
        const segments: string[] = [];
        let ok = true;
        for (const entry of entries) {
          const targetOrder = names.get(entry.value);
          if (targetOrder === undefined || targetOrder >= raw.order) {
            diagnostics.push(diag("unresolved-reference", `Geometry reference "\`${entry.value}\`" is not declared; declare \`${entry.value}\` before referencing it.`, lineRange(entry.line), sourceName, { data: { name: entry.value } }));
            ok = false;
            continue;
          }
          const target = declarations.find((declared) => declared.name === entry.value);
          if (target?.kind !== "segment") {
            diagnostics.push(diag("unresolved-reference", `Geometry equal-marks entry "${entry.value}" does not resolve to a segment.`, lineRange(entry.line), sourceName, { data: { name: entry.value } }));
            ok = false;
            continue;
          }
          referenced.add(entry.value);
          segments.push(entry.value);
        }
        if (!ok) {
          failed = true;
          break;
        }
        if (labelField !== undefined || fields.get("measure") !== undefined) {
          diagnostics.push(diag("invalid-mark-content", "Geometry equal-marks carries a group, never a label or measure.", lineRange(raw.kindLine), sourceName));
          failed = true;
          break;
        }
        equalGroups.set(groupField.value, (equalGroups.get(groupField.value) ?? 0) + 1);
        declarations.push({ kind: raw.kind, group: groupField.value, segments });
        break;
      }
      default:
        break;
    }
  }

  if (failed) return { diagnostics };

  const block: GeometryBlock = {
    kind: "geometry",
    range: blockRange,
    ...(header.id === undefined ? {} : { id: header.id }),
    pluginVersion: GEOMETRY_PLUGIN_VERSION,
    ...(header.number === undefined ? {} : { number: header.number }),
    width: header.width,
    height: header.height,
    ...(header.bounds === undefined ? {} : { bounds: header.bounds }),
    declarations,
  };

  // Warnings: unused invisible guides; explicit-bounds clipping.
  const warnings: Diagnostic[] = [];
  for (const declaration of declarations) {
    if (declaration.name !== undefined && (declaration.visible === false) && !referenced.has(declaration.name)) {
      warnings.push(diag("unused-declaration", `Geometry declaration "${declaration.name}" is invisible and never referenced.`, blockRange, sourceName, { severity: "warning" }));
    }
  }
  if (header.bounds !== undefined) {
    const outside: string[] = [];
    for (const declaration of declarations) {
      const point = declaration.name === undefined ? undefined : points.get(declaration.name);
      if (point === undefined) continue;
      if (
        point.x < Number(header.bounds.minX) || point.x > Number(header.bounds.maxX) ||
        point.y < Number(header.bounds.minY) || point.y > Number(header.bounds.maxY)
      ) {
        outside.push(declaration.name as string);
      }
    }
    if (outside.length > 0) {
      warnings.push(diag("geometry-out-of-bounds", `Geometry declarations outside explicit bounds are clipped: ${outside.join(", ")}.`, blockRange, sourceName, { severity: "warning", data: { names: outside as unknown as JsonValue } }));
    }
  }
  return { block, diagnostics: warnings };
}

/* ------------------------------------------------------------------ *
 * Shape intersection over supporting lines and circles
 * ------------------------------------------------------------------ */

function lineParams(entry: Resolved): NonNullable<Resolved["line"]> | undefined {
  return entry.line;
}

function intersectShapes(
  a: Resolved,
  b: Resolved,
  aName: string,
  bName: string,
  resolved: ReadonlyMap<string, Resolved>,
  points: ReadonlyMap<string, Point>,
): Point[] | undefined {
  void aName;
  void bName;
  void resolved;
  void points;
  const aLine = lineParams(a);
  const bLine = lineParams(b);
  if (aLine !== undefined && bLine !== undefined) {
    return intersectLines(aLine, bLine);
  }
  if (a.circle !== undefined && b.circle !== undefined) {
    return intersectCircles(a.circle, b.circle);
  }
  const line = aLine ?? bLine;
  const circle = a.circle ?? b.circle;
  if (line !== undefined && circle !== undefined) {
    return intersectLineCircle(line, circle);
  }
  return [];
}

function intersectLines(
  a: NonNullable<Resolved["line"]>,
  b: NonNullable<Resolved["line"]>,
): Point[] | undefined {
  const det = a.dx * -b.dy - (-b.dx) * a.dy;
  void det;
  const denom = a.dx * b.dy - a.dy * b.dx;
  const scale = Math.max(Math.abs(a.dx), Math.abs(a.dy), Math.abs(b.dx), Math.abs(b.dy), 1);
  if (Math.abs(denom) <= GEOMETRY_EPSILON * scale * scale) return undefined;
  const t = ((b.px - a.px) * b.dy - (b.py - a.py) * b.dx) / denom;
  return [{ x: a.px + t * a.dx, y: a.py + t * a.dy }];
}

function intersectLineCircle(
  line: NonNullable<Resolved["line"]>,
  circle: NonNullable<Resolved["circle"]>,
): Point[] | undefined {
  const len = Math.hypot(line.dx, line.dy);
  if (!(len > 0)) return undefined;
  const ux = line.dx / len;
  const uy = line.dy / len;
  const ox = line.px - circle.cx;
  const oy = line.py - circle.cy;
  const proj = ox * ux + oy * uy;
  const closestSq = ox * ox + oy * oy - proj * proj;
  const rSq = circle.r * circle.r;
  const tol = tolerance(Math.max(rSq, Math.abs(closestSq), 1));
  const discriminant = rSq - closestSq;
  if (discriminant < -tol) return undefined;
  if (Math.abs(discriminant) <= tol) {
    // Double root within epsilon: tangential contact is degenerate for
    // branch selection (contract §4) — the caller reports #invalid-pick or
    // the evaluator reports #degenerate via branch-count handling below.
    const t = -proj;
    return [{ x: line.px + t * ux, y: line.py + t * uy }];
  }
  const root = Math.sqrt(Math.max(0, discriminant));
  const t1 = -proj - root;
  const t2 = -proj + root;
  return [
    { x: line.px + t1 * ux, y: line.py + t1 * uy },
    { x: line.px + t2 * ux, y: line.py + t2 * uy },
  ];
}

function intersectCircles(
  a: NonNullable<Resolved["circle"]>,
  b: NonNullable<Resolved["circle"]>,
): Point[] | undefined {
  const dx = b.cx - a.cx;
  const dy = b.cy - a.cy;
  const dist = Math.hypot(dx, dy);
  const tol = tolerance(Math.max(a.r, b.r, dist, 1));
  if (dist <= tol) return [];
  if (dist > a.r + b.r + tol) return undefined;
  if (dist < Math.abs(a.r - b.r) - tol) return undefined;
  if (Math.abs(dist - (a.r + b.r)) <= tol || Math.abs(dist - Math.abs(a.r - b.r)) <= tol) {
    const t = a.r / dist;
    return [{ x: a.cx + dx * t, y: a.cy + dy * t }];
  }
  const a2 = (a.r * a.r - b.r * b.r + dist * dist) / (2 * dist);
  const hSq = a.r * a.r - a2 * a2;
  if (hSq < -tol) return undefined;
  const h = Math.sqrt(Math.max(0, hSq));
  const mx = a.cx + (dx * a2) / dist;
  const my = a.cy + (dy * a2) / dist;
  return [
    { x: mx - (dy * h) / dist, y: my + (dx * h) / dist },
    { x: mx + (dy * h) / dist, y: my - (dx * h) / dist },
  ];
}

function projectOntoLine(point: Point, line: NonNullable<Resolved["line"]>): Point {
  const lenSq = line.dx * line.dx + line.dy * line.dy;
  const t = ((point.x - line.px) * line.dx + (point.y - line.py) * line.dy) / lenSq;
  return { x: line.px + t * line.dx, y: line.py + t * line.dy };
}

function tangentPointsFromExterior(
  circle: NonNullable<Resolved["circle"]>,
  from: Point,
): Point[] | undefined {
  const dx = from.x - circle.cx;
  const dy = from.y - circle.cy;
  const distSq = dx * dx + dy * dy;
  const rSq = circle.r * circle.r;
  const tol = tolerance(Math.max(distSq, rSq, 1));
  if (distSq < rSq - tol) return undefined;
  if (Math.abs(distSq - rSq) <= tol) return undefined;
  const dist = Math.sqrt(distSq);
  const a2 = rSq / dist;
  const hSq = rSq - a2 * a2;
  if (hSq < -tol) return undefined;
  const h = Math.sqrt(Math.max(0, hSq));
  const mx = circle.cx + (dx * a2) / dist;
  const my = circle.cy + (dy * a2) / dist;
  return [
    { x: mx - (dy * h) / dist, y: my + (dx * h) / dist },
    { x: mx + (dy * h) / dist, y: my - (dx * h) / dist },
  ];
}

/* ------------------------------------------------------------------ *
 * Resolution for rendering (renderer-derived, never hashed)
 * ------------------------------------------------------------------ */

export interface ResolvedGeometry {
  readonly points: ReadonlyMap<string, Point>;
  readonly lines: ReadonlyMap<string, NonNullable<Resolved["line"]>>;
  readonly circles: ReadonlyMap<string, NonNullable<Resolved["circle"]>>;
}

export function resolveGeometry(block: GeometryBlock): ResolvedGeometry {
  const points = new Map<string, Point>();
  const lines = new Map<string, NonNullable<Resolved["line"]>>();
  const circles = new Map<string, NonNullable<Resolved["circle"]>>();
  const resolved = new Map<string, Resolved>();
  for (const declaration of block.declarations) {
    const kind = declaration.kind;
    const at = (name: string): Point | undefined => points.get(name);
    const lineAt = (name: string): NonNullable<Resolved["line"]> | undefined => resolved.get(name)?.line;
    const circleAt = (name: string): NonNullable<Resolved["circle"]> | undefined => resolved.get(name)?.circle;
    if (kind === "point" && declaration.name !== undefined) {
      const point = { x: Number(declaration.x ?? "0"), y: Number(declaration.y ?? "0") };
      points.set(declaration.name, point);
      resolved.set(declaration.name, { point });
    } else if (kind === "segment" && declaration.name !== undefined) {
      const from = at(declaration.from as string) as Point;
      const to = at(declaration.to as string) as Point;
      const entry = { px: from.x, py: from.y, dx: to.x - from.x, dy: to.y - from.y };
      lines.set(declaration.name, entry);
      resolved.set(declaration.name, { line: entry });
    } else if (kind === "line" && declaration.name !== undefined) {
      const first = at(declaration.throughFirst as string) as Point;
      const second = at(declaration.throughSecond as string) as Point;
      const entry = { px: first.x, py: first.y, dx: second.x - first.x, dy: second.y - first.y };
      lines.set(declaration.name, entry);
      resolved.set(declaration.name, { line: entry });
    } else if (kind === "ray" && declaration.name !== undefined) {
      const origin = at(declaration.origin as string) as Point;
      const through = at(declaration.through as string) as Point;
      const entry = { px: origin.x, py: origin.y, dx: through.x - origin.x, dy: through.y - origin.y };
      lines.set(declaration.name, entry);
      resolved.set(declaration.name, { line: entry });
    } else if (kind === "circle" && declaration.name !== undefined) {
      const center = at(declaration.center as string) as Point;
      const r = declaration.radius !== undefined
        ? Number(declaration.radius)
        : Math.hypot((at(declaration.point as string) as Point).x - center.x, (at(declaration.point as string) as Point).y - center.y);
      const entry = { cx: center.x, cy: center.y, r };
      circles.set(declaration.name, entry);
      resolved.set(declaration.name, { circle: entry });
    } else if (kind === "arc" && declaration.name !== undefined) {
      const center = at(declaration.center as string) as Point;
      const entry = { cx: center.x, cy: center.y, r: Number(declaration.radius ?? "0") };
      circles.set(declaration.name, entry);
      resolved.set(declaration.name, { circle: entry });
    } else if (kind === "midpoint" && declaration.name !== undefined) {
      const from = at(declaration.from as string) as Point;
      const to = at(declaration.to as string) as Point;
      const point = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
      points.set(declaration.name, point);
      resolved.set(declaration.name, { point });
    } else if (kind === "intersection" && declaration.name !== undefined) {
      const a = resolved.get(declaration.first as string) as Resolved;
      const b = resolved.get(declaration.second as string) as Resolved;
      const candidates = intersectShapes(a, b, "", "", resolved, points) ?? [];
      const ordered = orderBranches(candidates);
      const pick = (declaration.pick as number | undefined) ?? 1;
      const chosen = ordered[pick - 1] ?? ordered[0];
      if (chosen !== undefined) {
        points.set(declaration.name, chosen);
        resolved.set(declaration.name, { point: chosen });
      }
    } else if (kind === "tangent-line" && declaration.name !== undefined) {
      const circle = circleAt(declaration.circle as string) as NonNullable<Resolved["circle"]>;
      if (declaration.at !== undefined) {
        const touch = at(declaration.at as string) as Point;
        const entry = { px: touch.x, py: touch.y, dx: -(touch.y - circle.cy), dy: touch.x - circle.cx };
        lines.set(declaration.name, entry);
        resolved.set(declaration.name, { line: entry });
      } else {
        const from = at(declaration.from as string) as Point;
        const tangency = tangentPointsFromExterior(circle, from) ?? [];
        const ordered = orderBranches(tangency);
        const touch = ordered[((declaration.pick as number | undefined) ?? 1) - 1] ?? ordered[0];
        if (touch !== undefined) {
          const entry = { px: from.x, py: from.y, dx: touch.x - from.x, dy: touch.y - from.y };
          lines.set(declaration.name, entry);
          resolved.set(declaration.name, { line: entry });
        }
      }
    } else if (kind === "perpendicular-foot" && declaration.name !== undefined) {
      const from = at(declaration.from as string) as Point;
      const to = lineAt(declaration.to as string) as NonNullable<Resolved["line"]>;
      const foot = projectOntoLine(from, to);
      points.set(declaration.name, foot);
      resolved.set(declaration.name, { point: foot });
    } else if ((kind === "perpendicular-line" || kind === "parallel-line") && declaration.name !== undefined) {
      const through = at(declaration.through as string) as Point;
      const to = lineAt(declaration.to as string) as NonNullable<Resolved["line"]>;
      const entry = kind === "parallel-line"
        ? { px: through.x, py: through.y, dx: to.dx, dy: to.dy }
        : { px: through.x, py: through.y, dx: -to.dy, dy: to.dx };
      lines.set(declaration.name, entry);
      resolved.set(declaration.name, { line: entry });
    }
  }
  return { points, lines, circles };
}

/* ------------------------------------------------------------------ *
 * Owned SVG emitter (plots emission-layer reuse)
 * ------------------------------------------------------------------ */

export class GeometrySanitizerError extends Error {
  readonly code = "azeforge.geometry#sanitizer-compromise" as const;
  constructor(message: string) {
    super(message);
    this.name = "GeometrySanitizerError";
  }
}

/** Fail-closed norm extended to geometry fragments: generated markup must never carry executable content. */
export function assertGeometryFragmentSafe(svg: string): void {
  if (/<\s*script|on[a-z]+\s*=|javascript:/i.test(svg)) {
    throw new GeometrySanitizerError("Geometry fragment carries unexpected executable markup.");
  }
}

function stableFigureId(kind: string, seed: string): string {
  let hash = 2166136261;
  const text = `${kind}:${seed}`;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${kind}-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function geometryContentSeed(block: GeometryBlock): string {
  return JSON.stringify({
    id: block.id ?? "",
    width: block.width,
    height: block.height,
    bounds: block.bounds ?? null,
    declarations: block.declarations,
  });
}

const GEOMETRY_STROKE = "#1f2937";
const GUIDE_STROKE = "#9ca3af";
const MARK_STROKE = "#b45309";

function renderMeasuredLength(block: GeometryBlock, resolved: ResolvedGeometry, declaration: GeometryDeclaration): string | undefined {
  const at = (name: string): Point | undefined => resolved.points.get(name);
  if (declaration.segment !== undefined) {
    const target = block.declarations.find((entry) => entry.name === declaration.segment);
    if (target === undefined) return undefined;
    const from = target.from === undefined ? undefined : at(target.from as string);
    const to = target.to === undefined ? undefined : at(target.to as string);
    if (from === undefined || to === undefined) return undefined;
    return quantize(Math.hypot(to.x - from.x, to.y - from.y));
  }
  if (declaration.from !== undefined && declaration.to !== undefined) {
    const from = at(declaration.from as string);
    const to = at(declaration.to as string);
    if (from === undefined || to === undefined) return undefined;
    return quantize(Math.hypot(to.x - from.x, to.y - from.y));
  }
  return undefined;
}

function renderMeasuredAngle(resolved: ResolvedGeometry, declaration: GeometryDeclaration): string | undefined {
  const first = declaration.first === undefined ? undefined : resolved.points.get(declaration.first as string);
  const second = declaration.second === undefined ? undefined : resolved.points.get(declaration.second as string);
  const third = declaration.third === undefined ? undefined : resolved.points.get(declaration.third as string);
  if (first === undefined || second === undefined || third === undefined) return undefined;
  const v1x = first.x - second.x;
  const v1y = first.y - second.y;
  const v2x = third.x - second.x;
  const v2y = third.y - second.y;
  const dot = v1x * v2x + v1y * v2y;
  const cross = v1x * v2y - v1y * v2x;
  const angle = (Math.atan2(Math.abs(cross), dot) * 180) / Math.PI;
  return quantize(angle);
}

/**
 * Render one geometry Block to a static figure: browser-free deterministic
 * SVG — no scripts, no event attributes, no interactivity. Y-up authored
 * coordinates flip to SVG y-down at emission (renderer-derived placement).
 */
export function renderGeometryFragment(block: GeometryBlock, _context: BlockRendererContext): string {
  const resolved = resolveGeometry(block);
  const width = block.width;
  const height = block.height;

  // Resolved extent for auto-fit (points, circle extents, segment endpoints).
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  const extend = (x: number, y: number): void => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };
  for (const point of resolved.points.values()) extend(point.x, point.y);
  for (const circle of resolved.circles.values()) {
    extend(circle.cx - circle.r, circle.cy - circle.r);
    extend(circle.cx + circle.r, circle.cy + circle.r);
  }
  for (const declaration of block.declarations) {
    if (declaration.kind === "segment" && declaration.name !== undefined) {
      const from = declaration.from === undefined ? undefined : resolved.points.get(declaration.from as string);
      const to = declaration.to === undefined ? undefined : resolved.points.get(declaration.to as string);
      if (from !== undefined) extend(from.x, from.y);
      if (to !== undefined) extend(to.x, to.y);
    }
    if (declaration.kind === "polygon") {
      for (const vertex of (declaration.vertices as readonly string[] | undefined) ?? []) {
        const point = resolved.points.get(vertex);
        if (point !== undefined) extend(point.x, point.y);
      }
    }
  }
  const explicit = block.bounds === undefined ? undefined : {
    minX: Number(block.bounds.minX),
    minY: Number(block.bounds.minY),
    maxX: Number(block.bounds.maxX),
    maxY: Number(block.bounds.maxY),
  };
  const fit = explicit ?? (Number.isFinite(minX) && Number.isFinite(maxX) && maxX > minX
    ? { minX, minY, maxX, maxY }
    : { minX: -10, minY: -10, maxX: 10, maxY: 10 });
  const spanX = Math.max(fit.maxX - fit.minX, 1e-9);
  const spanY = Math.max(fit.maxY - fit.minY, 1e-9);
  const margin = 40;
  const scale = Math.min((width - margin * 2) / spanX, (height - margin * 2) / spanY);
  const centerX = (fit.minX + fit.maxX) / 2;
  const centerY = (fit.minY + fit.maxY) / 2;
  const project = (point: Point): { x: string; y: string } => ({
    x: quantize(width / 2 + (point.x - centerX) * scale),
    y: quantize(height / 2 - (point.y - centerY) * scale),
  });
  const projectRaw = (x: number, y: number): { x: string; y: string } => project({ x, y });

  const parts: string[] = [];
  const linePath = (line: NonNullable<Resolved["line"]>, span: number): string => {
    const len = Math.hypot(line.dx, line.dy) || 1;
    const ux = line.dx / len;
    const uy = line.dy / len;
    return { ux, uy, span } as unknown as string;
  };
  void linePath;

  const strokeFor = (declaration: GeometryDeclaration): string =>
    declaration.visible === false ? GUIDE_STROKE : GEOMETRY_STROKE;
  const dashFor = (declaration: GeometryDeclaration): string =>
    declaration.style === "dashed" ? ' stroke-dasharray="6 4"' : "";

  for (const declaration of block.declarations) {
    if (declaration.visible === false && declaration.kind !== "point") {
      // Invisible guides still emit nothing unless referenced; referenced
      // guides (e.g. base-line) stay out of the drawing.
      if (declaration.kind === "line" || declaration.kind === "perpendicular-line" || declaration.kind === "parallel-line" || declaration.kind === "ray" || declaration.kind === "tangent-line") {
        continue;
      }
    }
    switch (declaration.kind) {
      case "point": {
        const point = declaration.name === undefined ? undefined : resolved.points.get(declaration.name);
        if (point === undefined) break;
        const projected = project(point);
        parts.push(`<circle cx="${projected.x}" cy="${projected.y}" r="3" fill="${strokeFor(declaration)}"/>`);
        const text = declaration.label ?? declaration.name ?? "";
        if (text !== "") {
          parts.push(`<text x="${quantize(Number(projected.x) + 7)}" y="${quantize(Number(projected.y) - 7)}" text-anchor="start" font-size="12" fill="${strokeFor(declaration)}">${escapeXml(text)}</text>`);
        }
        break;
      }
      case "segment": {
        const from = declaration.from === undefined ? undefined : resolved.points.get(declaration.from as string);
        const to = declaration.to === undefined ? undefined : resolved.points.get(declaration.to as string);
        if (from === undefined || to === undefined) break;
        const a = project(from);
        const b = project(to);
        parts.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${strokeFor(declaration)}" stroke-width="1.5"${dashFor(declaration)}/>`);
        break;
      }
      case "line":
      case "perpendicular-line":
      case "parallel-line":
      case "tangent-line":
      case "ray": {
        const line = declaration.name === undefined ? undefined : resolved.lines.get(declaration.name);
        if (line === undefined) break;
        const len = Math.hypot(line.dx, line.dy) || 1;
        const ux = line.dx / len;
        const uy = line.dy / len;
        const reach = Math.max(spanX, spanY);
        const backward = declaration.kind === "ray" ? 0 : reach;
        const forward = reach;
        const start = projectRaw(line.px - ux * backward, line.py - uy * backward);
        const end = projectRaw(line.px + ux * forward, line.py + uy * forward);
        parts.push(`<line x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}" stroke="${strokeFor(declaration)}" stroke-width="1.5"${dashFor(declaration)}/>`);
        break;
      }
      case "circle": {
        const circle = declaration.name === undefined ? undefined : resolved.circles.get(declaration.name);
        if (circle === undefined) break;
        const center = project({ x: circle.cx, y: circle.cy });
        parts.push(`<circle cx="${center.x}" cy="${center.y}" r="${quantize(circle.r * scale)}" fill="none" stroke="${strokeFor(declaration)}" stroke-width="1.5"${dashFor(declaration)}/>`);
        break;
      }
      case "arc": {
        const circle = declaration.name === undefined ? undefined : resolved.circles.get(declaration.name);
        if (circle === undefined) break;
        const startDeg = Number(declaration.startAngle ?? "0");
        const endDeg = Number(declaration.endAngle ?? "0");
        const direction = declaration.direction ?? "ccw";
        const toRad = (deg: number): number => (deg * Math.PI) / 180;
        const startPt = project({ x: circle.cx + circle.r * Math.cos(toRad(startDeg)), y: circle.cy + circle.r * Math.sin(toRad(startDeg)) });
        const endPt = project({ x: circle.cx + circle.r * Math.cos(toRad(endDeg)), y: circle.cy + circle.r * Math.sin(toRad(endDeg)) });
        const span = direction === "ccw" ? (endDeg - startDeg + 360) % 360 : (startDeg - endDeg + 360) % 360;
        const largeArc = span > 180 ? 1 : 0;
        // SVG y-down flips sweep: ccw authored draws as sweep 0 after the flip.
        const sweep = direction === "ccw" ? 0 : 1;
        parts.push(`<path d="M ${startPt.x} ${startPt.y} A ${quantize(circle.r * scale)} ${quantize(circle.r * scale)} 0 ${largeArc} ${sweep} ${endPt.x} ${endPt.y}" fill="none" stroke="${strokeFor(declaration)}" stroke-width="1.5"${dashFor(declaration)}/>`);
        break;
      }
      case "polygon": {
        const vertices = (declaration.vertices as readonly string[] | undefined) ?? [];
        const projected = vertices
          .map((vertex) => resolved.points.get(vertex))
          .filter((point): point is Point => point !== undefined)
          .map((point) => {
            const p = project(point);
            return `${p.x},${p.y}`;
          });
        if (projected.length < 3) break;
        parts.push(`<polygon points="${projected.join(" ")}" fill="none" stroke="${strokeFor(declaration)}" stroke-width="1.5"${dashFor(declaration)}/>`);
        break;
      }
      case "midpoint":
      case "intersection":
      case "perpendicular-foot": {
        const point = declaration.name === undefined ? undefined : resolved.points.get(declaration.name);
        if (point === undefined) break;
        const projected = project(point);
        parts.push(`<circle cx="${projected.x}" cy="${projected.y}" r="3" fill="${strokeFor(declaration)}"/>`);
        if (declaration.label !== undefined && declaration.label !== "") {
          parts.push(`<text x="${quantize(Number(projected.x) + 7)}" y="${quantize(Number(projected.y) - 7)}" text-anchor="start" font-size="12" fill="${strokeFor(declaration)}">${escapeXml(declaration.label)}</text>`);
        }
        break;
      }
      case "angle-mark": {
        const vertex = declaration.second === undefined ? undefined : resolved.points.get(declaration.second as string);
        if (vertex === undefined) break;
        const projected = project(vertex);
        const text = declaration.label !== undefined
          ? declaration.label
          : declaration.measure !== undefined
            ? (renderMeasuredAngle(resolved, declaration) ?? "")
            : "";
        if (text !== "") {
          parts.push(`<text x="${projected.x}" y="${quantize(Number(projected.y) - 10)}" text-anchor="middle" font-size="12" fill="${MARK_STROKE}">${escapeXml(String(text))}</text>`);
        }
        break;
      }
      case "length-mark": {
        const text = declaration.label !== undefined
          ? declaration.label
          : declaration.measure !== undefined
            ? (renderMeasuredLength(block, resolved, declaration) ?? "")
            : "";
        if (text === "") break;
        // Place the measure/label at the segment midpoint (or from/to midpoint).
        let anchor: Point | undefined;
        if (declaration.segment !== undefined) {
          const target = block.declarations.find((entry) => entry.name === declaration.segment);
          const from = target?.from === undefined ? undefined : resolved.points.get(target.from as string);
          const to = target?.to === undefined ? undefined : resolved.points.get(target.to as string);
          if (from !== undefined && to !== undefined) anchor = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
        } else if (declaration.from !== undefined && declaration.to !== undefined) {
          const from = resolved.points.get(declaration.from as string);
          const to = resolved.points.get(declaration.to as string);
          if (from !== undefined && to !== undefined) anchor = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
        }
        if (anchor === undefined) break;
        const projected = project(anchor);
        parts.push(`<text x="${projected.x}" y="${quantize(Number(projected.y) - 6)}" text-anchor="middle" font-size="12" fill="${MARK_STROKE}">${escapeXml(String(text))}</text>`);
        break;
      }
      case "equal-marks": {
        const segments = (declaration.segments as readonly string[] | undefined) ?? [];
        segments.forEach((segmentName: string) => {
          const target = block.declarations.find((entry: GeometryDeclaration) => entry.name === segmentName);
          const from = target?.from === undefined ? undefined : resolved.points.get(target.from as string);
          const to = target?.to === undefined ? undefined : resolved.points.get(target.to as string);
          if (from === undefined || to === undefined) return;
          const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
          const projected = project(mid);
          parts.push(`<line x1="${quantize(Number(projected.x) - 4)}" y1="${quantize(Number(projected.y) - 5)}" x2="${quantize(Number(projected.x) + 4)}" y2="${quantize(Number(projected.y) + 5)}" stroke="${MARK_STROKE}" stroke-width="1.5"/>`);
        });
        break;
      }
      case "right-angle-mark": {
        const vertex = declaration.second === undefined ? undefined : resolved.points.get(declaration.second as string);
        if (vertex === undefined) break;
        const projected = project(vertex);
        const size = 8;
        parts.push(`<path d="M ${quantize(Number(projected.x) - size)} ${projected.y} L ${quantize(Number(projected.x) - size)} ${quantize(Number(projected.y) - size)} L ${projected.x} ${quantize(Number(projected.y) - size)}" fill="none" stroke="${MARK_STROKE}" stroke-width="1.5"/>`);
        break;
      }
      default:
        break;
    }
  }

  const figureId = stableFigureId("aze-geometry", geometryContentSeed(block));
  const counts = new Map<string, number>();
  for (const declaration of block.declarations) {
    counts.set(declaration.kind, (counts.get(declaration.kind) ?? 0) + 1);
  }
  const kindSummary = [...counts.entries()]
    .sort((left, right) => (left[0] < right[0] ? -1 : 1))
    .map(([kind, count]) => `${count} ${kind}${count === 1 ? "" : "s"}`)
    .join(", ");
  const constructions = block.declarations
    .filter((declaration) => declaration.name !== undefined && (CONSTRUCTION_KINDS as readonly string[]).includes(declaration.kind))
    .map((declaration) => `${declaration.kind} ${declaration.name as string}`);
  const marks = block.declarations.filter((declaration) => (MARK_KINDS as readonly string[]).includes(declaration.kind)).length;
  const title = `Geometry${block.id === undefined ? "" : ` ${block.id}`} with ${block.declarations.length} declarations`;
  const desc = `geometry with ${kindSummary}${constructions.length === 0 ? "" : `; constructions: ${constructions.join(", ")}`}${marks === 0 ? "" : `; ${marks} mark${marks === 1 ? "" : "s"}`}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img"><title>${escapeXml(title)}</title><desc>${escapeXml(desc)}</desc>${parts.join("")}</svg>`;
  assertGeometryFragmentSafe(svg);
  const label = block.id === undefined ? "" : ` data-geometry-id="${escapeXml(block.id)}"`;
  const number = block.number === true ? ' data-geometry-number="true"' : "";
  return `<figure class="aze-geometry" id="${figureId}"${label}${number}>${svg}</figure>`;
}

/** Fingerprint closure joining the plot/katex/mermaid closures (contract §9). */
export function geometryDependencyClosure(): JsonValue {
  return {
    eval: GEOMETRY_EVAL_VERSION,
    epsilon: GEOMETRY_EPSILON,
    emitter: GEOMETRY_EMITTER_VERSION,
  };
}

const pluginDescriptor = Object.freeze({
  type: GEOMETRY_PLUGIN_TYPE,
  version: GEOMETRY_PLUGIN_VERSION,
  title: "Geometry",
  summary: "Native geometry constructions and measurements.",
  diagnosticNamespace: NAMESPACE,
  sourceSchema: geometrySourceSchema,
  bodySyntax: Object.freeze({
    id: GEOMETRY_BODY_SYNTAX_ID,
    version: GEOMETRY_BODY_SYNTAX_VERSION,
  }),
  dataSchema: geometryDataSchema,
});

export const geometryPlugin: AzeBlockPlugin = Object.freeze({
  descriptor: pluginDescriptor,
});

export const GEOMETRY_HTML_BLOCK_RENDERER_ID = "azeforge.geometry.html/v1" as const;
export const GEOMETRY_HTML_BLOCK_RENDERER_VERSION = "1.0.0" as const;

const blockRendererDescriptor = Object.freeze({
  id: GEOMETRY_HTML_BLOCK_RENDERER_ID,
  version: GEOMETRY_HTML_BLOCK_RENDERER_VERSION,
  blockType: GEOMETRY_PLUGIN_TYPE,
  pluginVersionRange: "1.0.0",
  rendererId: "html",
  rendererVersionRange: "1.0.0",
});

export const geometryHtmlBlockRenderer: AzeBlockRenderer<GeometryBlock> = Object.freeze({
  descriptor: blockRendererDescriptor,
  render(block: GeometryBlock, context: BlockRendererContext): string {
    return renderGeometryFragment(block, context);
  },
});
