/**
 * Native geometry constructions and measurements (catalog Geometry family,
 * contract #59).
 *
 * One `:::: geometry` directive: an ordered backward-only declaration graph
 * over a y-up unitless exact-decimal frame. Construction intent lives in the
 * graph forever; resolved coordinates are renderer-derived and never hashed.
 * Rendering reuses the plots' owned SVG emission layer (fixed attribute
 * order, deterministic ids, quantized 3-decimal ASCII formatter). Label boxes
 * combine the pinned Inter advance table with the nominal ISO 3098-1 lettering
 * height, so placement is a deterministic table lookup and no glyph is
 * rasterized or measured at render time. Construction math is arithmetic plus
 * `Math.sqrt`; trigonometry appears only in arc parametrization and angle
 * measures.
 */

import { advanceMetricDependencyClosure, advanceWidth } from "./advance-metric.js";
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

export const PRIMITIVE_KINDS = Object.freeze([
  "point",
  "segment",
  "line",
  "ray",
  "circle",
  "arc",
  "polygon",
] as const);
export const CONSTRUCTION_KINDS = Object.freeze([
  "midpoint",
  "intersection",
  "tangent-line",
  "perpendicular-foot",
  "perpendicular-line",
  "parallel-line",
] as const);
export const MARK_KINDS = Object.freeze([
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
export const FIELDS_BY_KIND: Readonly<Record<string, readonly string[]>> =
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

/** Header keys `parseHeader` accepts, in the parser's acceptance order. */
export const GEOMETRY_HEADER_FIELDS = Object.freeze([
  "id",
  "number",
  "width",
  "height",
  "bounds",
] as const);

/** `bounds:` opens a fixed group; every key in it is required once it does. */
export const GEOMETRY_BOUNDS_KEYS = Object.freeze([
  "min-x",
  "min-y",
  "max-x",
  "max-y",
] as const);

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
    if (boundsFields !== undefined && (GEOMETRY_BOUNDS_KEYS as readonly string[]).includes(key)) {
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
    if (!(GEOMETRY_HEADER_FIELDS as readonly string[]).includes(key)) {
      diagnostics.push(diag("unknown-field", `Geometry header field "${key}" is not supported.`, lineRange(line), sourceName, {
        suggestion: `Supported header fields: ${GEOMETRY_HEADER_FIELDS.map((field) => `"${field}"`).join(", ")}.`,
      }));
      continue;
    }
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
  const missing = GEOMETRY_BOUNDS_KEYS.filter((key) => values[key] === undefined);
  if (missing.length > 0) {
    const first = fields[0]?.line.range;
    diagnostics.push(diag("invalid-bounds", `Geometry bounds require ${GEOMETRY_BOUNDS_KEYS.join(", ")} (missing: ${missing.join(", ")}).`, first ?? ({ start: { line: 0, column: 0 }, end: { line: 0, column: 0 } } as SourceRange), sourceName));
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
  return { block, diagnostics: [...diagnostics, ...warnings] };
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

/* ------------------------------------------------------------------ *
 * Annotation metrics and label placement
 * ------------------------------------------------------------------ */

/**
 * Nominal label height as a fraction of the figure's characteristic length.
 * The remaining metrics derive from it at the ISO 3098-1 nominal height to
 * line width ratio (10:1), so lettering and strokes stay in one visual system.
 */
const LABEL_HEIGHT_RATIO = 0.045;
/** Matches the resolved minimum readable label size every Theme applies. */
const MIN_LABEL_SIZE = 10;
const MAX_LABEL_SIZE = 34;
const MIN_LINE_WIDTH = 1;
const MAX_LINE_WIDTH = 2;
const DOT_RADIUS_RATIO = 0.22;
const MIN_DOT_RADIUS = 1.6;
const MAX_DOT_RADIUS = 6;

/** Axis-aligned screen box in SVG user units. */
interface ScreenBox {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/** A drawn stroke a label must not cover. */
type ScreenObstacle =
  | { readonly kind: "segment"; readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number }
  | { readonly kind: "circle"; readonly cx: number; readonly cy: number; readonly r: number };

interface LabelRequest {
  readonly text: string;
  readonly anchorX: number;
  readonly anchorY: number;
  /** Radius around the anchor the label must clear (marker plus gap). */
  readonly clearance: number;
  readonly fill: string;
}

function clampNumber(value: number, lower: number, upper: number): number {
  return value < lower ? lower : value > upper ? upper : value;
}

/** Declaration kinds drawn as an unbounded or one-sided line. */
const LINE_LIKE_KINDS: Readonly<Record<string, true>> = Object.freeze({
  line: true,
  "perpendicular-line": true,
  "parallel-line": true,
  "tangent-line": true,
  ray: true,
});

/**
 * Liang–Barsky clip of a line or ray against the viewBox. A construction line
 * is drawn edge to edge instead of to an arbitrary reach, so no figure can emit
 * geometry outside its own frame.
 */
function lineChordWithinFrame(
  originX: number,
  originY: number,
  ux: number,
  uy: number,
  bidirectional: boolean,
  frame: { readonly width: number; readonly height: number },
): { readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number } | undefined {
  const p = [-ux, ux, -uy, uy];
  const q = [originX, frame.width - originX, originY, frame.height - originY];
  let enter = bidirectional ? Number.NEGATIVE_INFINITY : 0;
  let exit = Number.POSITIVE_INFINITY;
  for (let index = 0; index < 4; index += 1) {
    const pi = p[index] as number;
    const qi = q[index] as number;
    if (pi === 0) {
      if (qi < 0) return undefined;
      continue;
    }
    const ratio = qi / pi;
    if (pi < 0) {
      if (ratio > enter) enter = ratio;
    } else if (ratio < exit) {
      exit = ratio;
    }
  }
  if (enter > exit) return undefined;
  return { x1: originX + ux * enter, y1: originY + uy * enter, x2: originX + ux * exit, y2: originY + uy * exit };
}

/** Liang–Barsky clip: does the segment touch the box? */
function segmentHitsBox(obstacle: Extract<ScreenObstacle, { kind: "segment" }>, box: ScreenBox): boolean {
  const dx = obstacle.x2 - obstacle.x1;
  const dy = obstacle.y2 - obstacle.y1;
  if (dx === 0 && dy === 0) {
    return obstacle.x1 >= box.minX && obstacle.x1 <= box.maxX && obstacle.y1 >= box.minY && obstacle.y1 <= box.maxY;
  }
  const p = [-dx, dx, -dy, dy];
  const q = [obstacle.x1 - box.minX, box.maxX - obstacle.x1, obstacle.y1 - box.minY, box.maxY - obstacle.y1];
  let enter = 0;
  let exit = 1;
  for (let index = 0; index < 4; index += 1) {
    const pi = p[index] as number;
    const qi = q[index] as number;
    if (pi === 0) {
      if (qi < 0) return false;
      continue;
    }
    const ratio = qi / pi;
    if (pi < 0) {
      if (ratio > exit) return false;
      if (ratio > enter) enter = ratio;
    } else {
      if (ratio < enter) return false;
      if (ratio < exit) exit = ratio;
    }
  }
  return true;
}

/** Does the circle's circumference cross the box? A box wholly inside a large
 *  circle clears the stroke; only the arc itself is an obstacle. */
function circleHitsBox(obstacle: Extract<ScreenObstacle, { kind: "circle" }>, box: ScreenBox): boolean {
  const nearestX = Math.max(box.minX - obstacle.cx, 0, obstacle.cx - box.maxX);
  const nearestY = Math.max(box.minY - obstacle.cy, 0, obstacle.cy - box.maxY);
  if (Math.hypot(nearestX, nearestY) > obstacle.r) return false;
  const farthestX = Math.max(Math.abs(obstacle.cx - box.minX), Math.abs(obstacle.cx - box.maxX));
  const farthestY = Math.max(Math.abs(obstacle.cy - box.minY), Math.abs(obstacle.cy - box.maxY));
  return Math.hypot(farthestX, farthestY) >= obstacle.r;
}

/**
 * Candidate directions in preference order. The upper-right diagonal is the
 * conventional first choice for a point label, matching drafting practice of
 * keeping lettering off the construction it annotates.
 */
const LABEL_DIRECTIONS: ReadonlyArray<readonly [number, number]> = Object.freeze([
  [Math.SQRT1_2, -Math.SQRT1_2],
  [1, 0],
  [-Math.SQRT1_2, -Math.SQRT1_2],
  [Math.SQRT1_2, Math.SQRT1_2],
  [-1, 0],
  [0, -1],
  [0, 1],
  [-Math.SQRT1_2, Math.SQRT1_2],
] as const);

/** Box height as a fraction of the nominal letter height: cap height plus descent. */
const LABEL_BOX_RATIO = 1.15;

const OUTSIDE_FRAME_COST = 1000;
const LABEL_OVERLAP_COST = 100;
const STROKE_OVERLAP_COST = 10;

/**
 * Place one label on the first collision-free candidate direction, scoring the
 * rest. Leaving the viewBox costs more than covering another label, which costs
 * more than covering a stroke, so a crowded figure still places every label.
 */
function placeLabel(
  request: LabelRequest,
  labelSize: number,
  obstacles: readonly ScreenObstacle[],
  placed: readonly ScreenBox[],
  frame: { readonly width: number; readonly height: number },
): ScreenBox {
  const halfWidth = advanceWidth([{ kind: "text", value: request.text }], labelSize) / 2;
  const halfHeight = (labelSize * LABEL_BOX_RATIO) / 2;
  const candidates = LABEL_DIRECTIONS.map(([dx, dy]) => {
    const distance = request.clearance + Math.abs(dx) * halfWidth + Math.abs(dy) * halfHeight;
    const centerX = request.anchorX + dx * distance;
    const centerY = request.anchorY + dy * distance;
    const box: ScreenBox = {
      minX: centerX - halfWidth,
      minY: centerY - halfHeight,
      maxX: centerX + halfWidth,
      maxY: centerY + halfHeight,
    };
    let cost = 0;
    if (box.minX < 0 || box.minY < 0 || box.maxX > frame.width || box.maxY > frame.height) cost += OUTSIDE_FRAME_COST;
    for (const obstacle of obstacles) {
      const hits = obstacle.kind === "segment" ? segmentHitsBox(obstacle, box) : circleHitsBox(obstacle, box);
      if (hits) cost += STROKE_OVERLAP_COST;
    }
    for (const other of placed) {
      if (box.minX < other.maxX && other.minX < box.maxX && box.minY < other.maxY && other.minY < box.maxY) {
        cost += LABEL_OVERLAP_COST;
      }
    }
    return { box, cost };
  });
  return candidates.reduce((best, candidate) => (candidate.cost < best.cost ? candidate : best)).box;
}

/**
 * Emit the label text. The box carries the ISO 3098-1 nominal height: the box
 * top is the cap line and the box bottom sits one nominal height lower, which
 * is the text baseline.
 */
function labelMarkup(box: ScreenBox, labelSize: number, fill: string, text: string): string {
  const centerX = (box.minX + box.maxX) / 2;
  const baseline = box.minY + labelSize;
  return `<text x="${quantize(centerX)}" y="${quantize(baseline)}" text-anchor="middle" font-size="${labelSize}" fill="${fill}">${escapeXml(text)}</text>`;
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

  // Annotation metrics follow the drawn figure, not the fixed canvas or the
  // fitted window. The characteristic length is the geometric mean of the drawn
  // extents in screen space, clipped to the viewBox and including every line
  // drawn to the frame edge, so a small object inside a wide `bounds:` window is
  // annotated as the small figure it is and a full-frame figure is not.
  const resolvedMinX = Number.isFinite(minX) ? minX : fit.minX;
  const resolvedMaxX = Number.isFinite(maxX) ? maxX : fit.maxX;
  const resolvedMinY = Number.isFinite(minY) ? minY : fit.minY;
  const resolvedMaxY = Number.isFinite(maxY) ? maxY : fit.maxY;
  const screenX = (x: number): number => width / 2 + (x - centerX) * scale;
  const screenY = (y: number): number => height / 2 - (y - centerY) * scale;
  let drawnMinX = clampNumber(screenX(resolvedMinX), 0, width);
  let drawnMaxX = clampNumber(screenX(resolvedMaxX), 0, width);
  let drawnMinY = clampNumber(screenY(resolvedMaxY), 0, height);
  let drawnMaxY = clampNumber(screenY(resolvedMinY), 0, height);
  // Every line-like declaration is clipped once, and the same chord drives both
  // the drawn extent and the emitted element.
  const lineChords = new Map<number, { readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number }>();
  block.declarations.forEach((declaration, index) => {
    if (declaration.visible === false || LINE_LIKE_KINDS[declaration.kind] !== true) return;
    const line = declaration.name === undefined ? undefined : resolved.lines.get(declaration.name);
    if (line === undefined) return;
    const length = Math.hypot(line.dx, line.dy) || 1;
    const chord = lineChordWithinFrame(
      screenX(line.px),
      screenY(line.py),
      line.dx / length,
      -line.dy / length,
      declaration.kind !== "ray",
      { width, height },
    );
    if (chord === undefined) return;
    lineChords.set(index, chord);
    drawnMinX = Math.min(drawnMinX, chord.x1, chord.x2);
    drawnMaxX = Math.max(drawnMaxX, chord.x1, chord.x2);
    drawnMinY = Math.min(drawnMinY, chord.y1, chord.y2);
    drawnMaxY = Math.max(drawnMaxY, chord.y1, chord.y2);
  });
  const labelSize = clampNumber(
    Math.round(
      Math.sqrt(Math.max(drawnMaxX - drawnMinX, 0) * Math.max(drawnMaxY - drawnMinY, 0)) * LABEL_HEIGHT_RATIO,
    ),
    MIN_LABEL_SIZE,
    MAX_LABEL_SIZE,
  );
  const lineWidth = clampNumber(labelSize / 10, MIN_LINE_WIDTH, MAX_LINE_WIDTH);
  const dotRadius = clampNumber(labelSize * DOT_RADIUS_RATIO, MIN_DOT_RADIUS, MAX_DOT_RADIUS);
  const markSize = labelSize;
  const tickSize = labelSize * 0.3;
  const labelGap = labelSize * 0.5;
  const dashPattern = `${quantize(labelSize * 0.5)} ${quantize(labelSize * 0.33)}`;

  const parts: string[] = [];
  const obstacles: ScreenObstacle[] = [];
  const requests: LabelRequest[] = [];
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
    declaration.style === "dashed" ? ` stroke-dasharray="${dashPattern}"` : "";

  for (const [index, declaration] of block.declarations.entries()) {
    if (declaration.visible === false && declaration.kind !== "point") {
      // Invisible guides still emit nothing unless referenced; referenced
      // guides (e.g. base-line) stay out of the drawing.
      if (LINE_LIKE_KINDS[declaration.kind] === true) {
        continue;
      }
    }
    switch (declaration.kind) {
      case "point": {
        const point = declaration.name === undefined ? undefined : resolved.points.get(declaration.name);
        if (point === undefined) break;
        const projected = project(point);
        parts.push(`<circle cx="${projected.x}" cy="${projected.y}" r="${quantize(dotRadius)}" fill="${strokeFor(declaration)}"/>`);
        obstacles.push({ kind: "circle", cx: Number(projected.x), cy: Number(projected.y), r: dotRadius });
        const text = declaration.label ?? declaration.name ?? "";
        if (text !== "") {
          requests.push({
            text,
            anchorX: Number(projected.x),
            anchorY: Number(projected.y),
            clearance: dotRadius + labelGap,
            fill: strokeFor(declaration),
          });
        }
        break;
      }
      case "segment": {
        const from = declaration.from === undefined ? undefined : resolved.points.get(declaration.from as string);
        const to = declaration.to === undefined ? undefined : resolved.points.get(declaration.to as string);
        if (from === undefined || to === undefined) break;
        const a = project(from);
        const b = project(to);
        parts.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${strokeFor(declaration)}" stroke-width="${quantize(lineWidth)}"${dashFor(declaration)}/>`);
        obstacles.push({ kind: "segment", x1: Number(a.x), y1: Number(a.y), x2: Number(b.x), y2: Number(b.y) });
        break;
      }
      case "line":
      case "perpendicular-line":
      case "parallel-line":
      case "tangent-line":
      case "ray": {
        const chord = lineChords.get(index);
        if (chord === undefined) break;
        parts.push(`<line x1="${quantize(chord.x1)}" y1="${quantize(chord.y1)}" x2="${quantize(chord.x2)}" y2="${quantize(chord.y2)}" stroke="${strokeFor(declaration)}" stroke-width="${quantize(lineWidth)}"${dashFor(declaration)}/>`);
        obstacles.push({ kind: "segment", x1: chord.x1, y1: chord.y1, x2: chord.x2, y2: chord.y2 });
        break;
      }
      case "circle": {
        const circle = declaration.name === undefined ? undefined : resolved.circles.get(declaration.name);
        if (circle === undefined) break;
        const center = project({ x: circle.cx, y: circle.cy });
        parts.push(`<circle cx="${center.x}" cy="${center.y}" r="${quantize(circle.r * scale)}" fill="none" stroke="${strokeFor(declaration)}" stroke-width="${quantize(lineWidth)}"${dashFor(declaration)}/>`);
        obstacles.push({ kind: "circle", cx: Number(center.x), cy: Number(center.y), r: circle.r * scale });
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
        parts.push(`<path d="M ${startPt.x} ${startPt.y} A ${quantize(circle.r * scale)} ${quantize(circle.r * scale)} 0 ${largeArc} ${sweep} ${endPt.x} ${endPt.y}" fill="none" stroke="${strokeFor(declaration)}" stroke-width="${quantize(lineWidth)}"${dashFor(declaration)}/>`);
        // Sample the arc into short chords so labels clear the drawn curve.
        const screenRadius = circle.r * scale;
        const stepDeg = clampNumber(((8 / screenRadius) * 180) / Math.PI, 1, 30);
        const steps = Math.max(1, Math.ceil(span / stepDeg));
        let previous = startPt;
        for (let index = 1; index <= steps; index += 1) {
          const degrees = direction === "ccw" ? startDeg + (span * index) / steps : startDeg - (span * index) / steps;
          const current = project({ x: circle.cx + circle.r * Math.cos(toRad(degrees)), y: circle.cy + circle.r * Math.sin(toRad(degrees)) });
          obstacles.push({ kind: "segment", x1: Number(previous.x), y1: Number(previous.y), x2: Number(current.x), y2: Number(current.y) });
          previous = current;
        }
        break;
      }
      case "polygon": {
        const vertices = (declaration.vertices as readonly string[] | undefined) ?? [];
        const corners = vertices
          .map((vertex) => resolved.points.get(vertex))
          .filter((point): point is Point => point !== undefined)
          .map((point) => project(point));
        if (corners.length < 3) break;
        parts.push(`<polygon points="${corners.map((corner) => `${corner.x},${corner.y}`).join(" ")}" fill="none" stroke="${strokeFor(declaration)}" stroke-width="${quantize(lineWidth)}"${dashFor(declaration)}/>`);
        for (const [index, corner] of corners.entries()) {
          const next = corners[(index + 1) % corners.length] as { x: string; y: string };
          obstacles.push({ kind: "segment", x1: Number(corner.x), y1: Number(corner.y), x2: Number(next.x), y2: Number(next.y) });
        }
        break;
      }
      case "midpoint":
      case "intersection":
      case "perpendicular-foot": {
        const point = declaration.name === undefined ? undefined : resolved.points.get(declaration.name);
        if (point === undefined) break;
        const projected = project(point);
        parts.push(`<circle cx="${projected.x}" cy="${projected.y}" r="${quantize(dotRadius)}" fill="${strokeFor(declaration)}"/>`);
        obstacles.push({ kind: "circle", cx: Number(projected.x), cy: Number(projected.y), r: dotRadius });
        if (declaration.label !== undefined && declaration.label !== "") {
          requests.push({
            text: declaration.label,
            anchorX: Number(projected.x),
            anchorY: Number(projected.y),
            clearance: dotRadius + labelGap,
            fill: strokeFor(declaration),
          });
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
          requests.push({
            text: String(text),
            anchorX: Number(projected.x),
            anchorY: Number(projected.y),
            clearance: labelGap,
            fill: MARK_STROKE,
          });
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
        requests.push({
          text: String(text),
          anchorX: Number(projected.x),
          anchorY: Number(projected.y),
          clearance: labelGap,
          fill: MARK_STROKE,
        });
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
          const x = Number(projected.x);
          const y = Number(projected.y);
          parts.push(`<line x1="${quantize(x - tickSize)}" y1="${quantize(y - tickSize * 1.25)}" x2="${quantize(x + tickSize)}" y2="${quantize(y + tickSize * 1.25)}" stroke="${MARK_STROKE}" stroke-width="${quantize(lineWidth)}"/>`);
          obstacles.push({ kind: "segment", x1: x - tickSize, y1: y - tickSize * 1.25, x2: x + tickSize, y2: y + tickSize * 1.25 });
        });
        break;
      }
      case "right-angle-mark": {
        const first = declaration.first === undefined ? undefined : resolved.points.get(declaration.first as string);
        const vertex = declaration.second === undefined ? undefined : resolved.points.get(declaration.second as string);
        const third = declaration.third === undefined ? undefined : resolved.points.get(declaration.third as string);
        if (first === undefined || vertex === undefined || third === undefined) break;
        const projected = project(vertex);
        // Arm unit vectors in screen space, so the square opens into the angle
        // the declaration names rather than a fixed corner.
        const armUnit = (target: { x: string; y: string }): { x: number; y: number } | undefined => {
          const dx = Number(target.x) - Number(projected.x);
          const dy = Number(target.y) - Number(projected.y);
          const length = Math.hypot(dx, dy);
          return length === 0 ? undefined : { x: dx / length, y: dy / length };
        };
        const firstArm = armUnit(project(first));
        const thirdArm = armUnit(project(third));
        if (firstArm === undefined || thirdArm === undefined) break;
        const size = markSize;
        const vx = Number(projected.x);
        const vy = Number(projected.y);
        const onFirst = { x: vx + firstArm.x * size, y: vy + firstArm.y * size };
        const opposite = { x: onFirst.x + thirdArm.x * size, y: onFirst.y + thirdArm.y * size };
        const onThird = { x: vx + thirdArm.x * size, y: vy + thirdArm.y * size };
        parts.push(`<path d="M ${quantize(onFirst.x)} ${quantize(onFirst.y)} L ${quantize(opposite.x)} ${quantize(opposite.y)} L ${quantize(onThird.x)} ${quantize(onThird.y)}" fill="none" stroke="${MARK_STROKE}" stroke-width="${quantize(lineWidth)}"/>`);
        obstacles.push(
          { kind: "segment", x1: onFirst.x, y1: onFirst.y, x2: opposite.x, y2: opposite.y },
          { kind: "segment", x1: opposite.x, y1: opposite.y, x2: onThird.x, y2: onThird.y },
        );
        break;
      }
      default:
        break;
    }
  }

  // Labels are placed last so every stroke is a known obstacle and the text
  // sits above the geometry it annotates.
  const placed: ScreenBox[] = [];
  for (const request of requests) {
    const box = placeLabel(request, labelSize, obstacles, placed, { width, height });
    placed.push(box);
    parts.push(labelMarkup(box, labelSize, request.fill, request.text));
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
    advanceMetric: advanceMetricDependencyClosure(),
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
