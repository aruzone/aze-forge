/**
 * Native plots and data charts (catalog Plots and data charts family, contract #58).
 *
 * Two greenfield plugins on the azemark:2 envelope:
 *
 * - `:::: plot` — one numeric Cartesian coordinate system carrying function
 *   series (bounded evaluable expression + explicit domain) and point series
 *   (line/scatter with optional error bars), overlayable, with shared axes.
 * - `:::: chart` — the bar family (`bar | grouped-bar | stacked-bar |
 *   histogram`) over categorical or binned numeric data.
 *
 * Function expressions reuse the native mathematics parse, restricted to the
 * evaluable subset, walked in IEEE 754 doubles — no code generation, nothing
 * executable. Rendering is a project-owned static SVG emitter over the exact
 * pinned d3-scale/d3-array/d3-shape modules (browser-free); every emitted
 * coordinate is quantized to 3 decimals through the owned ASCII formatter.
 */

import { line as d3Line, type Line } from "d3-shape";
import {
  scaleBand,
  scaleLinear,
  scaleLog,
  type ScaleBand,
  type ScaleLinear,
  type ScaleLogarithmic,
} from "d3-scale";

import { createDiagnostic } from "./diagnostics.js";
import { parseNativeMath, type MathNode } from "./math.js";
import type {
  AzeBlockPlugin,
  AzeBlockRenderer,
  BlockRendererContext,
  ChartBar,
  ChartBlock,
  ChartSeries,
  Diagnostic,
  JsonValue,
  PlotAxisConfig,
  PlotBlock,
  PlotDataPoint,
  PlotFunctionSeries,
  PlotPointSeries,
  PlotSeries,
  SourceRange,
} from "./model.js";
import {
  CHART_BODY_SYNTAX_ID,
  CHART_BODY_SYNTAX_VERSION,
  CHART_PLUGIN_TYPE,
  CHART_PLUGIN_VERSION,
  chartDataSchema,
  chartSourceSchema,
  D3_ARRAY_VERSION,
  D3_SCALE_VERSION,
  D3_SHAPE_VERSION,
  PLOT_BODY_SYNTAX_ID,
  PLOT_BODY_SYNTAX_VERSION,
  PLOT_EMITTER_VERSION,
  PLOT_EVAL_VERSION,
  PLOT_PLUGIN_TYPE,
  PLOT_PLUGIN_VERSION,
  plotDataSchema,
  plotSourceSchema,
} from "./plot-schemas.js";

/* ------------------------------------------------------------------ *
 * Ceilings (contract §8 — one stable code for all ceilings)
 * ------------------------------------------------------------------ */

export const MAX_PLOT_SERIES = 16;
/** Shared per-Block series ceiling (contract §8: 16 for plots and charts alike). */
export const MAX_CHART_SERIES = MAX_PLOT_SERIES;
export const MAX_POINTS_PER_SERIES = 5000;
export const MAX_HISTOGRAM_VALUES = 10000;
export const MAX_BINS = 256;
export const MAX_BAR_CATEGORIES = 256;
export const MAX_PARAMETERS = 64;
export const MAX_EXPRESSION_CHARS = 4000;
export const MAX_SAMPLES = 10000;
export const MIN_SAMPLES = 2;
export const DEFAULT_SAMPLES = 500;
export const MAX_LABEL_CHARS = 500;
export const MAX_DIMENSION_PX = 4096;
export const DEFAULT_PLOT_WIDTH = 640;
export const DEFAULT_PLOT_HEIGHT = 400;
/** Adjacent finite samples differing by more than this multiple of the
 * resolved visible range break the segment (registered constant, no knob). */
export const ASYMPTOTE_FACTOR = 4;

const PLOT_NAMESPACE = "azeforge.plot" as const;
const CHART_NAMESPACE = "azeforge.chart" as const;
const ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const PARAM_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9]*$/;
const BLANK = /^[ \t]*$/;
const COMMENT = /^[ \t]*\/[\/](?:[ \t].*)?$/;
const FIELD_LINE = /^([ \t]*)([A-Za-z][A-Za-z0-9-]*)[ \t]*:(.*)$/;
const SERIES_OPEN = /^([ \t]*)-[ \t]*([A-Za-z][A-Za-z0-9-]*)[ \t]*:(.*)$/;
const ITEM_OPEN = /^([ \t]*)-[ \t]*(.*)$/;

/** Source line handed from the envelope parser (text + exact line range). */
export interface PlotInputLine {
  readonly text: string;
  readonly range: SourceRange;
}

/* ------------------------------------------------------------------ *
 * Diagnostics
 * ------------------------------------------------------------------ */

function diag(
  namespace: string,
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
  return createDiagnostic(`${namespace}#${code}`, extra.severity ?? "error", message, {
    location:
      sourceName === undefined ? { range } : { source: sourceName, range },
    ...(extra.suggestion === undefined ? {} : { suggestion: extra.suggestion }),
    ...(extra.data === undefined ? {} : { data: extra.data }),
  });
}

function distance(left: string, right: string): number {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    const current = [leftIndex + 1];
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      const substitution =
        (previous[rightIndex] ?? Number.POSITIVE_INFINITY) +
        (left[leftIndex] === right[rightIndex] ? 0 : 1);
      current.push(
        Math.min(
          (previous[rightIndex + 1] ?? Number.POSITIVE_INFINITY) + 1,
          (current[rightIndex] ?? Number.POSITIVE_INFINITY) + 1,
          substitution,
        ),
      );
    }
    previous = current;
  }
  return previous[right.length] ?? right.length;
}

function didYouMean(value: string, candidates: readonly string[]): string | undefined {
  let best: string | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const candidateDistance = distance(value, candidate);
    if (candidateDistance < bestDistance) {
      best = candidate;
      bestDistance = candidateDistance;
    }
  }
  if (best === undefined || bestDistance > Math.max(2, Math.floor(best.length / 2))) {
    return undefined;
  }
  return `Did you mean "${best}"?`;
}

function kindWord(namespace: string): string {
  return namespace === CHART_NAMESPACE ? "Chart" : "Plot";
}

/** Value slice range within one input line (single-line, UTF-16 offsets). */
function valueRange(line: PlotInputLine, value: string): SourceRange {
  const startIndex = line.text.indexOf(value, line.text.indexOf(":") + 1);
  if (startIndex < 0) return line.range;
  const column = [...line.text.slice(0, startIndex)].length + 1;
  const start = {
    line: line.range.start.line,
    column,
    offset: line.range.start.offset + startIndex,
  };
  return {
    start,
    end: {
      line: line.range.start.line,
      column: column + [...value].length,
      offset: start.offset + value.length,
    },
  };
}

/* ------------------------------------------------------------------ *
 * Exact decimals (contract §6 — plot numerals are data, not notation)
 * ------------------------------------------------------------------ */

/**
 * Canonical exact-decimal form: `1.50` ≡ `1.5`, `1e3` → `1000`,
 * `1e-6` → `0.000001`. Returns undefined for non-decimal spellings
 * (`nan`, `inf`, fractions, prose) — the caller reports `#invalid-datum`.
 */
export function canonicalDecimal(spelling: string): string | undefined {
  const text = spelling.trim();
  const match = /^([+-]?)(?:(\d+)(?:\.(\d*))?|(\.(\d+)))(?:[eE]([+-]?\d+))?$/.exec(text);
  if (match === null) return undefined;
  const sign = match[1] === "-" ? "-" : "";
  let intPart = (match[2] ?? "").replace(/^0+(?=\d)/, "");
  if (intPart === "") intPart = "0";
  let fracPart = (match[3] ?? match[5] ?? "").replace(/0+$/, "");
  let exponent = match[6] === undefined ? 0 : Number.parseInt(match[6], 10);
  if (!Number.isSafeInteger(exponent)) return undefined;
  if (exponent > 0) {
    while (exponent > 0 && fracPart.length > 0) {
      intPart += fracPart[0];
      fracPart = fracPart.slice(1);
      exponent -= 1;
    }
    intPart += "0".repeat(Math.min(exponent, 10000));
    if (exponent > 10000) return undefined;
  } else {
    while (exponent < 0 && intPart.length > 0) {
      fracPart = `${intPart[intPart.length - 1] ?? ""}${fracPart}`;
      intPart = intPart.slice(0, -1);
      exponent += 1;
    }
    if (intPart === "") intPart = "0";
    if (exponent < 0) {
      fracPart = `${"0".repeat(Math.min(-exponent, 10000))}${fracPart}`;
      if (-exponent > 10000) return undefined;
    }
  }
  intPart = intPart.replace(/^0+(?=\d)/, "");
  if (intPart === "") intPart = "0";
  fracPart = fracPart.replace(/0+$/, "");
  const out = fracPart === "" ? intPart : `${intPart}.${fracPart}`;
  return sign === "-" && /^0(\.0*)?$/.test(out) ? out.slice(1) : `${sign}${out}`;
}

/* ------------------------------------------------------------------ *
 * Bounded evaluator (contract §2)
 * ------------------------------------------------------------------ */

const EVALUABLE_FUNCS: Readonly<Record<string, (...args: number[]) => number>> = Object.freeze({
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    asin: Math.asin,
    arcsin: Math.asin,
    acos: Math.acos,
    arccos: Math.acos,
    atan: Math.atan,
    arctan: Math.atan,
    sinh: Math.sinh,
    cosh: Math.cosh,
    tanh: Math.tanh,
    exp: Math.exp,
    ln: Math.log,
    log: Math.log10,
    max: Math.max,
    min: Math.min,
  });

export interface EvalScope {
  readonly variable: string;
  readonly variableValue: number;
  readonly parameters: ReadonlyMap<string, number>;
}

export type EvalFailure =
  | { readonly kind: "non-evaluable"; readonly detail: string }
  | { readonly kind: "unbound"; readonly name: string };

/**
 * `asin`/`acos`/`atan` are contract spellings; the native grammar registers
 * `arcsin`/`arccos`/`arctan`. Normalize on word boundaries before parsing so
 * the stored tree stays grammar-native.
 */
export function normalizeEvaluableSpelling(expression: string): string {
  return expression
    .replace(/\basin\b/g, "arcsin")
    .replace(/\bacos\b/g, "arccos")
    .replace(/\batan\b/g, "arctan");
}

function nonEvaluable(detail: string): { readonly failure: EvalFailure } {
  return { failure: { kind: "non-evaluable", detail } };
}

function juxtParameterName(factors: readonly MathNode[]): string | undefined {
  const [head, ...rest] = factors;
  if (head === undefined || head.kind !== "ident") return undefined;
  if (rest.length === 0) return undefined;
  let name = head.name;
  for (const factor of rest) {
    if (factor.kind !== "number" || !/^[0-9]+$/.test(factor.spelling)) return undefined;
    name += factor.spelling;
  }
  return name;
}

export function evaluateNode(
  node: MathNode,
  scope: EvalScope,
): { readonly value: number } | { readonly failure: EvalFailure } {
  switch (node.kind) {
    case "number":
      return { value: Number(canonicalDecimal(node.spelling) ?? node.spelling) };
    case "ident": {
      if (node.primes !== undefined) {
        return nonEvaluable("primes denote differentiation, which is symbolic-only");
      }
      // Inline digit suffixes (e.g. `V0`) are part of the authored name.
      const fullName = node.digitSuffix === undefined ? node.name : `${node.name}${node.digitSuffix}`;
      if (fullName === scope.variable && node.digitSuffix === undefined) {
        return { value: scope.variableValue };
      }
      const parameter = scope.parameters.get(fullName);
      if (parameter !== undefined) return { value: parameter };
      if ((fullName === "pi" || node.name === "pi") && node.digitSuffix === undefined) return { value: Math.PI };
      if (fullName === "e" && node.digitSuffix === undefined) return { value: Math.E };
      return { failure: { kind: "unbound", name: fullName } };
    }
    case "unary": {
      const inner = evaluateNode(node.node, scope);
      if ("failure" in inner) return inner;
      return { value: -inner.value };
    }
    case "add":
    case "sub":
    case "mul":
    case "div": {
      const left = evaluateNode(node.left, scope);
      if ("failure" in left) return left;
      const right = evaluateNode(node.right, scope);
      if ("failure" in right) return right;
      if (node.kind === "add") return { value: left.value + right.value };
      if (node.kind === "sub") return { value: left.value - right.value };
      if (node.kind === "mul") return { value: left.value * right.value };
      return { value: left.value / right.value };
    }
    case "juxt": {
      // Multi-letter parameter spellings (e.g. `V0`) lex as juxtaposed
      // ident+digits; a declared parameter shadows the product reading.
      const candidate = juxtParameterName(node.factors);
      if (candidate !== undefined) {
        const parameter = scope.parameters.get(candidate);
        if (parameter !== undefined) return { value: parameter };
      }
      let product = 1;
      for (const factor of node.factors) {
        const result = evaluateNode(factor, scope);
        if ("failure" in result) return result;
        product *= result.value;
      }
      return { value: product };
    }
    case "group":
      return evaluateNode(node.node, scope);
    case "func": {
      if (node.subscript !== undefined) {
        return nonEvaluable(`function "${node.name}" with a subscript is symbolic-only`);
      }
      const fn = EVALUABLE_FUNCS[node.name];
      if (fn === undefined) {
        return nonEvaluable(`function "${node.name}" is not evaluable`);
      }
      if ((node.name === "max" || node.name === "min") && node.arg.kind === "vector") {
        const values: number[] = [];
        for (const item of node.arg.items) {
          const result = evaluateNode(item, scope);
          if ("failure" in result) return result;
          values.push(result.value);
        }
        if (values.length === 0) return nonEvaluable(`function "${node.name}" needs arguments`);
        let acc = values[0] ?? 0;
        for (const value of values.slice(1)) acc = fn(acc, value);
        return { value: acc };
      }
      const arg = evaluateNode(node.arg, scope);
      if ("failure" in arg) return arg;
      return { value: fn(arg.value) };
    }
    case "sqrt": {
      const arg = evaluateNode(node.arg, scope);
      if ("failure" in arg) return arg;
      return { value: Math.sqrt(arg.value) };
    }
    case "root": {
      const index = node.index.kind === "group" ? node.index.node : node.index;
      if (index.kind !== "number") {
        return nonEvaluable("root index must be a numeric literal");
      }
      const arg = evaluateNode(node.arg, scope);
      if ("failure" in arg) return arg;
      return { value: Math.pow(arg.value, 1 / Number(canonicalDecimal(index.spelling) ?? index.spelling)) };
    }
    case "frac": {
      const num = evaluateNode(node.num, scope);
      if ("failure" in num) return num;
      const den = evaluateNode(node.den, scope);
      if ("failure" in den) return den;
      return { value: num.value / den.value };
    }
    case "abs": {
      const arg = evaluateNode(node.arg, scope);
      if ("failure" in arg) return arg;
      return { value: Math.abs(arg.value) };
    }
    case "script": {
      const script = node as Extract<MathNode, { kind: "script" }> & { readonly primes?: 1 | 2 };
      if (script.primes !== undefined) {
        return nonEvaluable("primes denote differentiation, which is symbolic-only");
      }
      if (node.sup === undefined) {
        // Digit-subscripted spellings (e.g. `V0`) parse as base+sub; a
        // declared parameter shadows the symbolic reading.
        if (node.base.kind === "ident" && node.sub !== undefined && /^[0-9]+$/.test(node.sub)) {
          const parameter = scope.parameters.get(`${node.base.name}${node.sub}`);
          if (parameter !== undefined) return { value: parameter };
        }
        return nonEvaluable("subscripts are symbolic-only");
      }
      const sup = node.sup.kind === "group" ? node.sup.node : node.sup;
      if (sup.kind !== "number") {
        return nonEvaluable("only numeric exponents evaluate");
      }
      const base = evaluateNode(node.base, scope);
      if ("failure" in base) return base;
      return {
        value: Math.pow(base.value, Number(canonicalDecimal(sup.spelling) ?? sup.spelling)),
      };
    }
    case "symbol": {
      // A declared parameter shadows the symbolic reading (e.g. `tau`).
      const parameter = scope.parameters.get(node.name);
      if (parameter !== undefined) return { value: parameter };
      if (node.name === "pi") return { value: Math.PI };
      return nonEvaluable(`symbol "${node.name}" is symbolic-only`);
    }
    default:
      return nonEvaluable(
        `${node.kind} constructs are symbolic-only; sample a closed form`,
      );
  }
}

/* ------------------------------------------------------------------ *
 * Owned number formatter (contract §7 — quantized 3-decimal ASCII)
 * ------------------------------------------------------------------ */

/** Quantize to 3 decimals and emit minimal fixed-notation ASCII; never emits nonfinite. */
export function quantize(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 1000) / 1000;
  const plain = canonicalDecimal(String(rounded === 0 ? 0 : rounded));
  return plain ?? "0";
}

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}


/* ------------------------------------------------------------------ *
 * Line cursor over header/body slices
 * ------------------------------------------------------------------ */

interface CursorLine {
  readonly line: PlotInputLine;
  readonly indent: number;
  readonly text: string;
}

function toCursorLines(lines: readonly PlotInputLine[]): CursorLine[] {
  const out: CursorLine[] = [];
  for (const line of lines) {
    if (BLANK.test(line.text) || COMMENT.test(line.text)) continue;
    const indent = (line.text.match(/^[ \t]*/) ?? [""])[0]?.length ?? 0;
    out.push({ line, indent, text: line.text });
  }
  return out;
}

function fieldMatch(text: string): { key: string; value: string } | undefined {
  const match = FIELD_LINE.exec(text);
  if (match === null) return undefined;
  return { key: match[2] ?? "", value: (match[3] ?? "").trim() };
}

function limitExceeded(
  namespace: string,
  subject: string,
  count: number,
  limit: number,
  range: SourceRange,
  sourceName: string | undefined,
): Diagnostic {
  return diag(
    namespace,
    "limit-exceeded",
    `Too many ${subject}: got ${count}, limit ${limit}.`,
    range,
    sourceName,
    { data: { subject, count, limit } },
  );
}

/* ------------------------------------------------------------------ *
 * Shared header (id/number/width/height/legend/grid)
 * ------------------------------------------------------------------ */

export interface SharedHeaderOptions {
  readonly id?: string;
  readonly number?: boolean;
  readonly width: number;
  readonly height: number;
  readonly legend: boolean;
  readonly grid: boolean;
}

function parseBooleanField(
  namespace: string,
  key: string,
  value: string,
  line: PlotInputLine,
  sourceName: string | undefined,
  diagnostics: Diagnostic[],
): boolean | undefined {
  if (value !== "true" && value !== "false") {
    diagnostics.push(
      diag(
        namespace,
        "invalid-attribute",
        `${kindWord(namespace)} attribute "${key}" must be true or false.`,
        valueRange(line, value),
        sourceName,
        { suggestion: `Use ${key}: true or ${key}: false.`, data: { attribute: key, value } },
      ),
    );
    return undefined;
  }
  return value === "true";
}

function parseDimensionField(
  namespace: string,
  key: string,
  value: string,
  line: PlotInputLine,
  sourceName: string | undefined,
  diagnostics: Diagnostic[],
): number | undefined {
  if (!/^[0-9]+$/.test(value)) {
    diagnostics.push(
      diag(
        namespace,
        "invalid-attribute",
        `${kindWord(namespace)} attribute "${key}" must be a positive integer number of CSS pixels.`,
        valueRange(line, value),
        sourceName,
        { data: { attribute: key, value } },
      ),
    );
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  if (parsed < 1) {
    diagnostics.push(
      diag(
        namespace,
        "invalid-attribute",
        `${kindWord(namespace)} attribute "${key}" must be at least 1.`,
        valueRange(line, value),
        sourceName,
        { data: { attribute: key, value } },
      ),
    );
    return undefined;
  }
  if (parsed > MAX_DIMENSION_PX) {
    diagnostics.push(
      limitExceeded(namespace, key, parsed, MAX_DIMENSION_PX, valueRange(line, value), sourceName),
    );
    return undefined;
  }
  return parsed;
}

function parseLabelField(
  namespace: string,
  key: string,
  value: string,
  line: PlotInputLine,
  sourceName: string | undefined,
  diagnostics: Diagnostic[],
): string | undefined {
  if (value.length === 0) {
    diagnostics.push(
      diag(namespace, "invalid-attribute", `${kindWord(namespace)} attribute "${key}" must not be empty.`, line.range, sourceName, {
        data: { attribute: key },
      }),
    );
    return undefined;
  }
  if (value.length > MAX_LABEL_CHARS) {
    diagnostics.push(
      limitExceeded(namespace, "label", value.length, MAX_LABEL_CHARS, valueRange(line, value), sourceName),
    );
    return undefined;
  }
  return value;
}

const PLOT_TOP_LEVEL_FIELDS = Object.freeze([
  "id",
  "number",
  "width",
  "height",
  "legend",
  "grid",
  "parameters",
  "x-axis",
  "y-axis",
]);

const AXIS_CHILD_FIELDS = Object.freeze(["label", "scale", "min", "max"]);

interface ParsedAxisFields {
  label?: string;
  scale: "linear" | "log";
  min?: string;
  max?: string;
}

function unknownField(
  namespace: string,
  kind: string,
  key: string,
  line: PlotInputLine,
  sourceName: string | undefined,
  registered: readonly string[],
  diagnostics: Diagnostic[],
): void {
  const suggestion = didYouMean(key, registered);
  diagnostics.push(
    diag(
      namespace,
      "unknown-field",
      `${kind} field "${key}" is not registered.`,
      line.range,
      sourceName,
      {
        ...(suggestion === undefined ? {} : { suggestion }),
        data: { field: key, registered: registered.join(",") },
      },
    ),
  );
}

function duplicateField(
  namespace: string,
  key: string,
  line: PlotInputLine,
  sourceName: string | undefined,
  diagnostics: Diagnostic[],
): void {
  diagnostics.push(
    diag(namespace, "duplicate-field", `${kindWord(namespace)} field "${key}" is declared more than once.`, line.range, sourceName, {
      data: { field: key },
    }),
  );
}

interface HeaderField {
  readonly key: string;
  readonly value: string;
  readonly line: PlotInputLine;
  readonly children: readonly HeaderField[];
}

function parseHeaderFields(
  namespace: string,
  kind: string,
  lines: readonly PlotInputLine[],
  nestedKeys: ReadonlySet<string>,
  registered: readonly string[],
  sourceName: string | undefined,
  diagnostics: Diagnostic[],
): HeaderField[] | undefined {
  const cursor = toCursorLines(lines);
  const fields: HeaderField[] = [];
  let failed = false;
  let index = 0;
  while (index < cursor.length) {
    const current = cursor[index];
    if (current === undefined) break;
    const parsed = fieldMatch(current.text);
    if (parsed === null || parsed === undefined || current.indent !== 0) {
      unknownField(
        namespace,
        kind,
        parsed?.key ?? current.text.trim(),
        current.line,
        sourceName,
        registered,
        diagnostics,
      );
      failed = true;
      index += 1;
      continue;
    }
    if (!registered.includes(parsed.key)) {
      unknownField(namespace, kind, parsed.key, current.line, sourceName, registered, diagnostics);
      failed = true;
      index += 1;
      continue;
    }
    if (nestedKeys.has(parsed.key)) {
      if (parsed.value !== "") {
        diagnostics.push(
          diag(
            namespace,
            "invalid-attribute",
            `${kindWord(namespace)} attribute "${parsed.key}" takes a nested mapping, not an inline value.`,
            valueRange(current.line, parsed.value),
            sourceName,
            { data: { attribute: parsed.key, value: parsed.value } },
          ),
        );
        failed = true;
        index += 1;
        continue;
      }
      const children: HeaderField[] = [];
      index += 1;
      while (index < cursor.length) {
        const child = cursor[index];
        if (child === undefined || child.indent === 0) break;
        const childParsed = fieldMatch(child.text);
        if (childParsed === undefined) {
          unknownField(namespace, kind, child.text.trim(), child.line, sourceName, registered, diagnostics);
          failed = true;
          index += 1;
          continue;
        }
        children.push({ key: childParsed.key, value: childParsed.value, line: child.line, children: [] });
        index += 1;
      }
      fields.push({ key: parsed.key, value: "", line: current.line, children });
      continue;
    }
    fields.push({ key: parsed.key, value: parsed.value, line: current.line, children: [] });
    index += 1;
  }
  return failed ? undefined : fields;
}

function applySharedHeader(
  namespace: string,
  fields: readonly HeaderField[],
  sourceName: string | undefined,
  diagnostics: Diagnostic[],
  defaults: PlotBlockDefaults = {},
): (SharedHeaderOptions & { failed: boolean }) | undefined {
  let id: string | undefined;
  let number: boolean | undefined;
  let width = defaults.width ?? DEFAULT_PLOT_WIDTH;
  let height = defaults.height ?? DEFAULT_PLOT_HEIGHT;
  let legend = defaults.legend ?? true;
  let grid = defaults.grid ?? false;
  let failed = false;
  const seen = new Set<string>();
  for (const field of fields) {
    if (!["id", "number", "width", "height", "legend", "grid"].includes(field.key)) continue;
    if (seen.has(field.key)) {
      duplicateField(namespace, field.key, field.line, sourceName, diagnostics);
      failed = true;
      continue;
    }
    seen.add(field.key);
    switch (field.key) {
      case "id": {
        if (!ID_PATTERN.test(field.value)) {
          diagnostics.push(
            diag(namespace, "invalid-attribute", `${kindWord(namespace)} attribute "id" must match ${ID_PATTERN.source}.`, valueRange(field.line, field.value), sourceName, {
              data: { attribute: "id", value: field.value },
            }),
          );
          failed = true;
        } else {
          id = field.value;
        }
        break;
      }
      case "number": {
        const parsed = parseBooleanField(namespace, "number", field.value, field.line, sourceName, diagnostics);
        if (parsed === undefined) failed = true;
        else number = parsed;
        break;
      }
      case "width": {
        const parsed = parseDimensionField(namespace, "width", field.value, field.line, sourceName, diagnostics);
        if (parsed === undefined) failed = true;
        else width = parsed;
        break;
      }
      case "height": {
        const parsed = parseDimensionField(namespace, "height", field.value, field.line, sourceName, diagnostics);
        if (parsed === undefined) failed = true;
        else height = parsed;
        break;
      }
      case "legend": {
        const parsed = parseBooleanField(namespace, "legend", field.value, field.line, sourceName, diagnostics);
        if (parsed === undefined) failed = true;
        else legend = parsed;
        break;
      }
      case "grid": {
        const parsed = parseBooleanField(namespace, "grid", field.value, field.line, sourceName, diagnostics);
        if (parsed === undefined) failed = true;
        else grid = parsed;
        break;
      }
    }
  }
  return { ...(id === undefined ? {} : { id }), ...(number === undefined ? {} : { number }), width, height, legend, grid, failed };
}

function parseParameters(
  fields: readonly HeaderField[],
  sourceName: string | undefined,
  diagnostics: Diagnostic[],
): { parameters: Record<string, string>; failed: boolean } {
  const parameters: Record<string, string> = {};
  let failed = false;
  const seen = new Set<string>();
  for (const field of fields) {
    if (field.key !== "parameters") continue;
    for (const child of field.children) {
      if (!PARAM_NAME_PATTERN.test(child.key)) {
        unknownField(PLOT_NAMESPACE, "Plot parameter", child.key, child.line, sourceName, ["<identifier>"], diagnostics);
        failed = true;
        continue;
      }
      if (seen.has(child.key)) {
        diagnostics.push(
          diag(
            PLOT_NAMESPACE,
            "duplicate-parameter",
            `Plot parameter "${child.key}" is declared more than once.`,
            child.line.range,
            sourceName,
            { data: { parameter: child.key } },
          ),
        );
        failed = true;
        continue;
      }
      seen.add(child.key);
      const canonical = canonicalDecimal(child.value);
      if (canonical === undefined) {
        diagnostics.push(
          diag(
            PLOT_NAMESPACE,
            "invalid-parameter",
            `Plot parameter "${child.key}" must be an exact decimal number.`,
            valueRange(child.line, child.value),
            sourceName,
            { data: { parameter: child.key, value: child.value } },
          ),
        );
        failed = true;
        continue;
      }
      parameters[child.key] = canonical;
    }
  }
  const count = Object.keys(parameters).length;
  const holder = fields.find((field) => field.key === "parameters");
  if (count > MAX_PARAMETERS && holder !== undefined) {
    diagnostics.push(
      limitExceeded(PLOT_NAMESPACE, "parameters", count, MAX_PARAMETERS, holder.line.range, sourceName),
    );
    failed = true;
  }
  return { parameters, failed };
}

function parseAxisSection(
  name: "x-axis" | "y-axis",
  fields: readonly HeaderField[],
  sourceName: string | undefined,
  diagnostics: Diagnostic[],
): { axis: ParsedAxisFields; failed: boolean } {
  const axis: ParsedAxisFields = { scale: "linear" };
  let failed = false;
  const seen = new Set<string>();
  for (const field of fields) {
    if (field.key !== name) continue;
    for (const child of field.children) {
      if (!AXIS_CHILD_FIELDS.includes(child.key)) {
        unknownField(PLOT_NAMESPACE, "Plot axis", child.key, child.line, sourceName, AXIS_CHILD_FIELDS, diagnostics);
        failed = true;
        continue;
      }
      if (seen.has(child.key)) {
        duplicateField(PLOT_NAMESPACE, `${name}.${child.key}`, child.line, sourceName, diagnostics);
        failed = true;
        continue;
      }
      seen.add(child.key);
      switch (child.key) {
        case "label": {
          const label = parseLabelField(PLOT_NAMESPACE, `${name}.label`, child.value, child.line, sourceName, diagnostics);
          if (label === undefined) failed = true;
          else axis.label = label;
          break;
        }
        case "scale": {
          if (child.value !== "linear" && child.value !== "log") {
            diagnostics.push(
              diag(
                PLOT_NAMESPACE,
                "invalid-attribute",
                `Plot axis "${name}" scale must be linear or log.`,
                valueRange(child.line, child.value),
                sourceName,
                { suggestion: "Use scale: linear or scale: log.", data: { axis: name, value: child.value } },
              ),
            );
            failed = true;
          } else {
            axis.scale = child.value;
          }
          break;
        }
        case "min":
        case "max": {
          const canonical = canonicalDecimal(child.value);
          if (canonical === undefined) {
            diagnostics.push(
              diag(
                PLOT_NAMESPACE,
                "invalid-domain",
                `Plot axis "${name}" ${child.key} must be an exact decimal number.`,
                valueRange(child.line, child.value),
                sourceName,
                { data: { axis: name, bound: child.key, value: child.value } },
              ),
            );
            failed = true;
          } else if (child.key === "min") {
            axis.min = canonical;
          } else {
            axis.max = canonical;
          }
          break;
        }
      }
    }
  }
  if (axis.min !== undefined && axis.max !== undefined && Number(axis.min) >= Number(axis.max)) {
    const holder = fields.find((field) => field.key === name);
    if (holder !== undefined) {
      diagnostics.push(
        diag(PLOT_NAMESPACE, "invalid-domain", `Plot axis "${name}" min must be less than max.`, holder.line.range, sourceName, {
          data: { axis: name, min: axis.min, max: axis.max },
        }),
      );
      failed = true;
    }
  }
  return { axis, failed };
}

/* ------------------------------------------------------------------ *
 * Plot body: series records
 * ------------------------------------------------------------------ */

const PLOT_SERIES_KINDS = Object.freeze(["function", "line", "scatter"]);
const FUNCTION_FIELDS = Object.freeze(["kind", "label", "variable", "expression", "domain", "samples"]);
const POINT_SERIES_FIELDS = Object.freeze(["kind", "label", "points"]);
const DOMAIN_FIELDS = Object.freeze(["min", "max"]);
const POINT_FIELDS = Object.freeze(["x", "y", "error", "error-low", "error-high"]);
const VARIABLE_PATTERN = /^[A-Za-z]$/;

interface BodyField {
  readonly key: string;
  readonly value: string;
  readonly line: PlotInputLine;
  readonly indent: number;
}

interface ParsedSeriesHead {
  readonly kindValue: string;
  readonly opener: PlotInputLine;
  readonly openerIndent: number;
  readonly fields: BodyField[];
  readonly nested: ReadonlyMap<string, CursorLine[]>;
}

function collectSeriesFields(
  namespace: string,
  seriesKind: string,
  cursor: CursorLine[],
  start: number,
  openerIndent: number,
  nestedKeys: ReadonlySet<string>,
  includeOpener: boolean,
  sourceName: string | undefined,
  diagnostics: Diagnostic[],
): { head: ParsedSeriesHead; next: number; failed: boolean } {
  const opener = cursor[start];
  const openerParsed = SERIES_OPEN.exec(opener?.text ?? "");
  const fields: BodyField[] = [];
  const nested = new Map<string, CursorLine[]>();
  let failed = false;
  let index = start + 1;
  const consumeGroup = (key: string, parentIndent: number): void => {
    const group: CursorLine[] = [];
    let itemIndent = -1;
    while (index < cursor.length) {
      const member = cursor[index];
      if (member === undefined || member.indent <= parentIndent) break;
      // A non-dash field dedented below the collection items belongs to
      // an outer level (e.g. `edges:` after a `values:` opener).
      if (itemIndent >= 0 && member.indent < itemIndent && SERIES_OPEN.exec(member.text) === null && fieldMatch(member.text) !== undefined) {
        break;
      }
      if (itemIndent < 0) itemIndent = member.indent;
      group.push(member);
      index += 1;
    }
    nested.set(key, group);
  };
  if (includeOpener && opener !== undefined && openerParsed !== null) {
    const openerKey = openerParsed[2] ?? "";
    const openerValue = (openerParsed[3] ?? "").trim();
    fields.push({ key: openerKey, value: openerValue, line: opener.line, indent: opener.indent });
    if (openerValue === "" && nestedKeys.has(openerKey)) {
      consumeGroup(openerKey, openerIndent);
    }
  }
  while (index < cursor.length) {
    const current = cursor[index];
    if (current === undefined) break;
    if (current.indent <= openerIndent) break;
    const dashOpen = SERIES_OPEN.exec(current.text);
    if (dashOpen !== null) {
      unknownField(namespace, seriesKind, "list item", current.line, sourceName, [...nestedKeys], diagnostics);
      failed = true;
      index += 1;
      continue;
    }
    const parsed = fieldMatch(current.text);
    if (parsed === undefined) {
      unknownField(namespace, seriesKind, current.text.trim(), current.line, sourceName, [...nestedKeys], diagnostics);
      failed = true;
      index += 1;
      continue;
    }
    if (parsed.value === "" && nestedKeys.has(parsed.key)) {
      const parentIndent = current.indent;
      fields.push({ key: parsed.key, value: "", line: current.line, indent: current.indent });
      index += 1;
      consumeGroup(parsed.key, parentIndent);
      continue;
    }
    fields.push({ key: parsed.key, value: parsed.value, line: current.line, indent: current.indent });
    index += 1;
  }
  return {
    head: {
      kindValue: openerParsed?.[2] !== undefined ? (openerParsed[3] ?? "").trim() : "",
      opener: opener?.line as PlotInputLine,
      openerIndent,
      fields,
      nested,
    },
    next: index,
    failed,
  };
}

function parseDecimalValue(
  namespace: string,
  code: string,
  value: string,
  line: PlotInputLine,
  sourceName: string | undefined,
  diagnostics: Diagnostic[],
  extraData: Readonly<Record<string, JsonValue>> = {},
): string | undefined {
  const canonical = canonicalDecimal(value);
  if (canonical === undefined) {
    diagnostics.push(
      diag(namespace, code, `Value "${value}" is not an exact decimal number.`, valueRange(line, value), sourceName, {
        data: { value, ...extraData },
      }),
    );
    return undefined;
  }
  return canonical;
}

function checkErrorFields(
  namespace: string,
  point: { error?: string | undefined; errorLow?: string | undefined; errorHigh?: string | undefined },
  line: PlotInputLine,
  index: number,
  sourceName: string | undefined,
  diagnostics: Diagnostic[],
): boolean {
  const hasLow = point.errorLow !== undefined;
  const hasHigh = point.errorHigh !== undefined;
  if (hasLow !== hasHigh) {
    diagnostics.push(
      diag(
        namespace,
        "mismatched-error-fields",
        `Point ${index} declares only one of error-low/error-high; use both or symmetric error:.`,
        line.range,
        sourceName,
        { data: { index } },
      ),
    );
    return false;
  }
  for (const [name, raw] of [
    ["error", point.error],
    ["error-low", point.errorLow],
    ["error-high", point.errorHigh],
  ] as const) {
    if (raw === undefined) continue;
    if (Number(raw) < 0) {
      diagnostics.push(
        diag(namespace, "negative-error", `Point ${index} field "${name}" must not be negative.`, line.range, sourceName, {
          data: { index, field: name, value: raw },
        }),
      );
      return false;
    }
  }
  return true;
}

function parsePointsGroup(
  namespace: string,
  group: readonly CursorLine[],
  holder: PlotInputLine,
  seriesIndex: number,
  xLog: boolean,
  yLog: boolean,
  sourceName: string | undefined,
  diagnostics: Diagnostic[],
): { points: PlotDataPoint[]; failed: boolean } {
  const points: PlotDataPoint[] = [];
  let failed = false;
  let index = 0;
  let pointIndex = 0;
  const badX: number[] = [];
  const badY: number[] = [];
  while (index < group.length) {
    const opener = group[index];
    if (opener === undefined) break;
    const openMatch = ITEM_OPEN.exec(opener.text);
    if (openMatch === null) {
      unknownField(namespace, "Plot points", opener.text.trim(), opener.line, sourceName, POINT_FIELDS, diagnostics);
      failed = true;
      index += 1;
      continue;
    }
    const openerField = fieldMatch(openMatch[2] ?? "");
    if (openerField === undefined || (openerField.key !== "x" && openerField.key !== "y")) {
      unknownField(namespace, "Plot points", (openMatch[2] ?? "").trim(), opener.line, sourceName, POINT_FIELDS, diagnostics);
      failed = true;
      index += 1;
      continue;
    }
    const record = new Map<string, { value: string; line: PlotInputLine }>();
    record.set(openerField.key, { value: openerField.value, line: opener.line });
    index += 1;
    while (index < group.length) {
      const member = group[index];
      if (member === undefined || member.indent <= opener.indent) break;
      const memberField = fieldMatch(member.text);
      if (memberField === undefined || member.text.trimStart().startsWith("-")) {
        unknownField(namespace, "Plot points", member.text.trim(), member.line, sourceName, POINT_FIELDS, diagnostics);
        failed = true;
        index += 1;
        continue;
      }
      if (!POINT_FIELDS.includes(memberField.key)) {
        unknownField(namespace, "Plot points", memberField.key, member.line, sourceName, POINT_FIELDS, diagnostics);
        failed = true;
        index += 1;
        continue;
      }
      if (record.has(memberField.key)) {
        duplicateField(namespace, memberField.key, member.line, sourceName, diagnostics);
        failed = true;
        index += 1;
        continue;
      }
      record.set(memberField.key, { value: memberField.value, line: member.line });
      index += 1;
    }
    const currentIndex = pointIndex;
    pointIndex += 1;
    const rawX = record.get("x");
    const rawY = record.get("y");
    if (rawX === undefined || rawY === undefined) {
      diagnostics.push(
        diag(namespace, "invalid-datum", `Point ${currentIndex} is missing ${rawX === undefined ? "x" : "y"}.`, opener.line.range, sourceName, {
          data: { index: currentIndex },
        }),
      );
      failed = true;
      continue;
    }
    const x = parseDecimalValue(namespace, "invalid-datum", rawX.value, rawX.line, sourceName, diagnostics, { index: currentIndex, field: "x" });
    const y = parseDecimalValue(namespace, "invalid-datum", rawY.value, rawY.line, sourceName, diagnostics, { index: currentIndex, field: "y" });
    if (x === undefined || y === undefined) {
      failed = true;
      continue;
    }
    const errorRaw = record.get("error");
    const lowRaw = record.get("error-low");
    const highRaw = record.get("error-high");
    let error: string | undefined;
    let errorLow: string | undefined;
    let errorHigh: string | undefined;
    if (errorRaw !== undefined) {
      error = parseDecimalValue(namespace, "invalid-datum", errorRaw.value, errorRaw.line, sourceName, diagnostics, {
        index: currentIndex,
        field: "error",
      });
      if (error === undefined) {
        failed = true;
        continue;
      }
    }
    if (lowRaw !== undefined) {
      errorLow = parseDecimalValue(namespace, "invalid-datum", lowRaw.value, lowRaw.line, sourceName, diagnostics, {
        index: currentIndex,
        field: "error-low",
      });
      if (errorLow === undefined) {
        failed = true;
        continue;
      }
    }
    if (highRaw !== undefined) {
      errorHigh = parseDecimalValue(namespace, "invalid-datum", highRaw.value, highRaw.line, sourceName, diagnostics, {
        index: currentIndex,
        field: "error-high",
      });
      if (errorHigh === undefined) {
        failed = true;
        continue;
      }
    }
    if (!checkErrorFields(namespace, { error, errorLow, errorHigh }, opener.line, currentIndex, sourceName, diagnostics)) {
      failed = true;
      continue;
    }
    if (xLog && Number(x) <= 0) badX.push(currentIndex);
    if (yLog && Number(y) <= 0) badY.push(currentIndex);
    points.push({
      x,
      y,
      ...(error === undefined ? {} : { error }),
      ...(errorLow === undefined ? {} : { errorLow }),
      ...(errorHigh === undefined ? {} : { errorHigh }),
    });
  }
  if (badX.length > 0) {
    diagnostics.push(
      diag(namespace, "log-axis-value", `Series ${seriesIndex} has non-positive x values on a log x-axis.`, holder.range, sourceName, {
        data: { series: seriesIndex, axis: "x", indexes: badX.join(",") },
      }),
    );
    failed = true;
  }
  if (badY.length > 0) {
    diagnostics.push(
      diag(namespace, "log-axis-value", `Series ${seriesIndex} has non-positive y values on a log y-axis.`, holder.range, sourceName, {
        data: { series: seriesIndex, axis: "y", indexes: badY.join(",") },
      }),
    );
    failed = true;
  }
  if (points.length === 0 && !failed) {
    diagnostics.push(
      diag(namespace, "empty-series", "Point series declares no points.", holder.range, sourceName, {}),
    );
    failed = true;
  }
  if (points.length > MAX_POINTS_PER_SERIES) {
    diagnostics.push(limitExceeded(namespace, "points", points.length, MAX_POINTS_PER_SERIES, holder.range, sourceName));
    failed = true;
  }
  return { points, failed };
}

function validateFunctionExpression(
  expression: string,
  variable: string,
  parameters: ReadonlyMap<string, number>,
  line: PlotInputLine,
  sourceName: string | undefined,
  diagnostics: Diagnostic[],
): MathNode | undefined {
  if (expression.length === 0) {
    diagnostics.push(
      diag(PLOT_NAMESPACE, "missing-expression", "Function series requires an expression.", line.range, sourceName, {}),
    );
    return undefined;
  }
  if (expression.length > MAX_EXPRESSION_CHARS) {
    diagnostics.push(
      limitExceeded(PLOT_NAMESPACE, "expression", expression.length, MAX_EXPRESSION_CHARS, valueRange(line, expression), sourceName),
    );
    return undefined;
  }
  const normalized = normalizeEvaluableSpelling(expression);
  const parsed = parseNativeMath(normalized);
  if (!("tree" in parsed)) {
    const first = parsed.problems[0];
    diagnostics.push(
      diag(
        PLOT_NAMESPACE,
        "non-evaluable-construct",
        `Expression does not parse as evaluable mathematics: ${first?.message ?? "invalid expression"}.`,
        line.range,
        sourceName,
        { suggestion: "Write a closed numeric form over the domain variable and declared parameters." },
      ),
    );
    return undefined;
  }
  // Static walk with a probe scope: every identifier must resolve, every
  // construct must evaluate. Probe values are finite and nonzero.
  const probe = new Map<string, number>();
  for (const name of parameters.keys()) probe.set(name, 1.5);
  const probeScope: EvalScope = { variable, variableValue: 1.5, parameters: probe };
  const failure = checkEvaluable(parsed.tree, probeScope);
  if (failure !== undefined) {
    if (failure.kind === "unbound") {
      diagnostics.push(
        diag(
          PLOT_NAMESPACE,
          "unbound-variable",
          `Expression names "${failure.name}": declare it under parameters: or use the domain variable "${variable}".`,
          line.range,
          sourceName,
          { data: { name: failure.name, variable } },
        ),
      );
    } else {
      diagnostics.push(
        diag(PLOT_NAMESPACE, "non-evaluable-construct", `Expression is not evaluable: ${failure.detail}.`, line.range, sourceName, {
          suggestion: "Binders, relations, sets, cases, matrices, and vectors are symbolic-only; sample a closed form.",
        }),
      );
    }
    return undefined;
  }
  return parsed.tree;
}

function checkEvaluable(node: MathNode, scope: EvalScope): EvalFailure | undefined {
  const result = evaluateNode(node, scope);
  if ("failure" in result) return result.failure;
  return undefined;
}

export interface ValidatedPlot {
  readonly block?: PlotBlock;
  readonly diagnostics: readonly Diagnostic[];
}

export function validatePlotBlock(options: {
  readonly headerLines: readonly PlotInputLine[];
  readonly bodyLines: readonly PlotInputLine[];
  readonly blockRange: SourceRange;
  readonly sourceName: string | undefined;
  readonly defaults?: PlotBlockDefaults;
}): ValidatedPlot {
  const { headerLines, bodyLines, blockRange, sourceName, defaults } = options;
  const diagnostics: Diagnostic[] = [];
  const fields = parseHeaderFields(PLOT_NAMESPACE, "Plot", headerLines, new Set(["parameters", "x-axis", "y-axis"]), PLOT_TOP_LEVEL_FIELDS, sourceName, diagnostics);
  if (fields === undefined) return { diagnostics };
  const seenTop = new Set<string>();
  for (const field of fields) {
    if (seenTop.has(field.key)) {
      duplicateField(PLOT_NAMESPACE, field.key, field.line, sourceName, diagnostics);
      return { diagnostics };
    }
    seenTop.add(field.key);
  }
  const shared = applySharedHeader(PLOT_NAMESPACE, fields, sourceName, diagnostics, defaults ?? {});
  if (shared === undefined || shared.failed) return { diagnostics };
  const { parameters, failed: parametersFailed } = parseParameters(fields, sourceName, diagnostics);
  const { axis: xAxisFields, failed: xFailed } = parseAxisSection("x-axis", fields, sourceName, diagnostics);
  const { axis: yAxisFields, failed: yFailed } = parseAxisSection("y-axis", fields, sourceName, diagnostics);
  if (parametersFailed || xFailed || yFailed) return { diagnostics };
  const parameterValues = new Map<string, number>();
  for (const [name, canonical] of Object.entries(parameters)) parameterValues.set(name, Number(canonical));

  const cursor = toCursorLines(bodyLines);
  const series: PlotSeries[] = [];
  let index = 0;
  let failed = false;
  while (index < cursor.length) {
    const opener = cursor[index];
    if (opener === undefined) break;
    const openMatch = SERIES_OPEN.exec(opener.text);
    const openField = openMatch === null ? undefined : fieldMatch(openMatch[2] === undefined ? "" : `${openMatch[2]}:${openMatch[3] ?? ""}`);
    if (openMatch === null || openField === undefined || openField.key !== "kind") {
      unknownField(PLOT_NAMESPACE, "Plot series", opener.text.trim(), opener.line, sourceName, PLOT_SERIES_KINDS, diagnostics);
      failed = true;
      index += 1;
      continue;
    }
    const kind = openField.value;
    if (kind !== "function" && kind !== "line" && kind !== "scatter") {
      // Excluded families get no fuzzy did-you-mean; the registered set is the suggestion.
      diagnostics.push(
        diag(PLOT_NAMESPACE, "unknown-series-kind", `Plot series kind "${kind}" is not registered.`, opener.line.range, sourceName, {
          suggestion: "Registered series kinds: function, line, scatter.",
          data: { kind, registered: PLOT_SERIES_KINDS.join(",") },
        }),
      );
      failed = true;
      // Consume the series body so its fields are not misread as new series.
      const skipped = collectSeriesFields(PLOT_NAMESPACE, "Plot series", cursor, index, opener.indent, new Set(["domain", "points"]), false, sourceName, []);
      index = skipped.next;
      continue;
    }
    const collected = collectSeriesFields(PLOT_NAMESPACE, "Plot series", cursor, index, opener.indent, new Set(["domain", "points"]), false, sourceName, diagnostics);
    index = collected.next;
    if (collected.failed) {
      failed = true;
      continue;
    }
    const { head } = collected;
    const registered = kind === "function" ? FUNCTION_FIELDS : POINT_SERIES_FIELDS;
    const seenFields = new Set<string>(["kind"]);
    let seriesFailed = false;
    const scalar = new Map<string, BodyField>();
    for (const field of head.fields) {
      if (!registered.includes(field.key)) {
        unknownField(PLOT_NAMESPACE, "Plot series", field.key, field.line, sourceName, registered, diagnostics);
        seriesFailed = true;
        continue;
      }
      if (seenFields.has(field.key)) {
        duplicateField(PLOT_NAMESPACE, field.key, field.line, sourceName, diagnostics);
        seriesFailed = true;
        continue;
      }
      seenFields.add(field.key);
      scalar.set(field.key, field);
    }
    if (seriesFailed) {
      failed = true;
      continue;
    }
    const labelRaw = scalar.get("label");
    let label: string | undefined;
    if (labelRaw !== undefined) {
      label = parseLabelField(PLOT_NAMESPACE, "label", labelRaw.value, labelRaw.line, sourceName, diagnostics);
      if (label === undefined) {
        failed = true;
        continue;
      }
    }
    if (kind === "function") {
      const variableRaw = scalar.get("variable");
      const variable = variableRaw === undefined ? "x" : variableRaw.value;
      if (variableRaw !== undefined && !VARIABLE_PATTERN.test(variable)) {
        diagnostics.push(
          diag(
            PLOT_NAMESPACE,
            "invalid-attribute",
            `Function series variable "${variable}" must be a single ASCII letter.`,
            valueRange(variableRaw.line, variableRaw.value),
            sourceName,
            { data: { variable } },
          ),
        );
        failed = true;
        continue;
      }
      if (parameterValues.has(variable)) {
        diagnostics.push(
          diag(
            PLOT_NAMESPACE,
            "duplicate-parameter",
            `Function series variable "${variable}" collides with a parameters: entry; one scope, one declaration per name.`,
            variableRaw === undefined ? head.opener.range : valueRange(variableRaw.line, variableRaw.value),
            sourceName,
            { data: { variable } },
          ),
        );
        failed = true;
        continue;
      }
      const expressionField = scalar.get("expression");
      if (expressionField === undefined) {
        diagnostics.push(
          diag(PLOT_NAMESPACE, "missing-expression", "Function series requires an expression.", head.opener.range, sourceName, {}),
        );
        failed = true;
        continue;
      }
      const tree = validateFunctionExpression(expressionField.value, variable, parameterValues, expressionField.line, sourceName, diagnostics);
      if (tree === undefined) {
        failed = true;
        continue;
      }
      const domainGroup = head.nested.get("domain");
      if (domainGroup === undefined) {
        diagnostics.push(
          diag(PLOT_NAMESPACE, "missing-domain", "Function series require an explicit domain.", head.opener.range, sourceName, {
            suggestion: "Add a domain: mapping with min: and max: bounds.",
          }),
        );
        failed = true;
        continue;
      }
      let domainMin: string | undefined;
      let domainMax: string | undefined;
      let domainFailed = false;
      const domainSeen = new Set<string>();
      for (const member of domainGroup) {
        const memberField = fieldMatch(member.text);
        if (memberField === undefined || !DOMAIN_FIELDS.includes(memberField.key)) {
          unknownField(PLOT_NAMESPACE, "Plot domain", memberField?.key ?? member.text.trim(), member.line, sourceName, DOMAIN_FIELDS, diagnostics);
          domainFailed = true;
          continue;
        }
        if (domainSeen.has(memberField.key)) {
          duplicateField(PLOT_NAMESPACE, memberField.key, member.line, sourceName, diagnostics);
          domainFailed = true;
          continue;
        }
        domainSeen.add(memberField.key);
        const canonical = parseDecimalValue(PLOT_NAMESPACE, "invalid-domain", memberField.value, member.line, sourceName, diagnostics, {
          bound: memberField.key,
        });
        if (canonical === undefined) {
          domainFailed = true;
          continue;
        }
        if (memberField.key === "min") domainMin = canonical;
        else domainMax = canonical;
      }
      if (domainFailed || domainMin === undefined || domainMax === undefined) {
        if (!domainFailed) {
          diagnostics.push(
            diag(PLOT_NAMESPACE, "missing-domain", "Function series domain requires min: and max: bounds.", head.opener.range, sourceName, {}),
          );
        }
        failed = true;
        continue;
      }
      if (Number(domainMin) >= Number(domainMax)) {
        diagnostics.push(
          diag(PLOT_NAMESPACE, "invalid-domain", "Function series domain min must be less than max.", head.opener.range, sourceName, {
            data: { min: domainMin, max: domainMax },
          }),
        );
        failed = true;
        continue;
      }
      if (xAxisFields.scale === "log" && Number(domainMin) <= 0) {
        diagnostics.push(
          diag(PLOT_NAMESPACE, "log-domain-invalid", "Function domain under a log x-axis must be positive.", head.opener.range, sourceName, {
            suggestion: "Choose a positive domain or a linear x-axis.",
            data: { min: domainMin, max: domainMax },
          }),
        );
        failed = true;
        continue;
      }
      let samples = DEFAULT_SAMPLES;
      const samplesRaw = scalar.get("samples");
      if (samplesRaw !== undefined) {
        if (!/^[0-9]+$/.test(samplesRaw.value)) {
          diagnostics.push(
            diag(PLOT_NAMESPACE, "invalid-samples", `Function series samples "${samplesRaw.value}" must be an integer.`, valueRange(samplesRaw.line, samplesRaw.value), sourceName, {
              data: { value: samplesRaw.value },
            }),
          );
          failed = true;
          continue;
        }
        samples = Number.parseInt(samplesRaw.value, 10);
        if (samples < MIN_SAMPLES) {
          diagnostics.push(
            diag(PLOT_NAMESPACE, "invalid-samples", `Function series samples must be at least ${MIN_SAMPLES}.`, valueRange(samplesRaw.line, samplesRaw.value), sourceName, {
              data: { value: samplesRaw.value },
            }),
          );
          failed = true;
          continue;
        }
        if (samples > MAX_SAMPLES) {
          diagnostics.push(
            limitExceeded(PLOT_NAMESPACE, "samples", samples, MAX_SAMPLES, valueRange(samplesRaw.line, samplesRaw.value), sourceName),
          );
          failed = true;
          continue;
        }
      }
      const functionSeries: PlotFunctionSeries = {
        kind: "function",
        ...(label === undefined ? {} : { label }),
        variable,
        expression: expressionField.value,
        tree: tree as unknown as JsonValue,
        domainMin,
        domainMax,
        samples,
      };
      series.push(functionSeries);
    } else {
      const pointsGroup = head.nested.get("points");
      if (pointsGroup === undefined) {
        diagnostics.push(
          diag(PLOT_NAMESPACE, "missing-points", `${kind} series require a points: collection.`, head.opener.range, sourceName, {}),
        );
        failed = true;
        continue;
      }
      const { points, failed: pointsFailed } = parsePointsGroup(PLOT_NAMESPACE, pointsGroup, head.opener, series.length, xAxisFields.scale === "log", yAxisFields.scale === "log", sourceName, diagnostics);
      if (pointsFailed) {
        failed = true;
        continue;
      }
      const pointSeries: PlotPointSeries = {
        kind,
        ...(label === undefined ? {} : { label }),
        points,
      };
      series.push(pointSeries);
    }
  }
  if (!failed && series.length === 0) {
    diagnostics.push(diag(PLOT_NAMESPACE, "empty", "Plot Block declares no series.", blockRange, sourceName, {}));
    return { diagnostics };
  }
  if (failed) return { diagnostics };
  if (series.length > MAX_PLOT_SERIES) {
    diagnostics.push(limitExceeded(PLOT_NAMESPACE, "series", series.length, MAX_PLOT_SERIES, blockRange, sourceName));
    return { diagnostics };
  }
  // Log-axis authored values were checked during point parsing; the
  // all-undefined warning is sampled below without failing the Document.
  const block: PlotBlock = {
    kind: "plot",
    range: blockRange,
    ...(shared.id === undefined ? {} : { id: shared.id }),
    pluginVersion: PLOT_PLUGIN_VERSION,
    ...(shared.number === undefined ? {} : { number: shared.number }),
    width: shared.width,
    height: shared.height,
    legend: shared.legend,
    grid: shared.grid,
    parameters,
    xAxis: {
      ...(xAxisFields.label === undefined ? {} : { label: xAxisFields.label }),
      scale: xAxisFields.scale,
      ...(xAxisFields.min === undefined ? {} : { min: xAxisFields.min }),
      ...(xAxisFields.max === undefined ? {} : { max: xAxisFields.max }),
    },
    yAxis: {
      ...(yAxisFields.label === undefined ? {} : { label: yAxisFields.label }),
      scale: yAxisFields.scale,
      ...(yAxisFields.min === undefined ? {} : { min: yAxisFields.min }),
      ...(yAxisFields.max === undefined ? {} : { max: yAxisFields.max }),
    },
    series,
  };
  const warnings = sampleFunctionWarnings(block, sourceName);
  return { block, diagnostics: warnings };
}

function sampleFunctionWarnings(block: PlotBlock, sourceName: string | undefined): Diagnostic[] {
  const warnings: Diagnostic[] = [];
  for (const entry of block.series) {
    if (entry.kind !== "function") continue;
    const samples = sampleFunctionSeries(entry, block.parameters);
    if (samples.values.every((value) => value === undefined)) {
      warnings.push(
        diag(
          PLOT_NAMESPACE,
          "all-undefined-samples",
          `Function series${entry.label === undefined ? "" : ` "${entry.label}"`} produced no finite samples; the curve renders absent.`,
          block.range,
          sourceName,
          { severity: "warning", data: { expression: entry.expression } },
        ),
      );
    }
  }
  return warnings;
}

/* ------------------------------------------------------------------ *
 * Sampling (contract §3 — uniform grid, gaps, asymptote breaks)
 * ------------------------------------------------------------------ */

export interface FunctionSamples {
  readonly xs: readonly number[];
  readonly values: readonly (number | undefined)[];
}

export function sampleFunctionSeries(
  series: PlotFunctionSeries,
  parameters: Readonly<Record<string, string>>,
): FunctionSamples {
  const min = Number(series.domainMin);
  const max = Number(series.domainMax);
  const count = series.samples;
  const scope = new Map<string, number>();
  for (const [name, canonical] of Object.entries(parameters)) scope.set(name, Number(canonical));
  const xs: number[] = [];
  const values: (number | undefined)[] = [];
  for (let i = 0; i < count; i += 1) {
    const x = count === 1 ? min : min + (i * (max - min)) / (count - 1);
    xs.push(x);
    const result = evaluateNode(series.tree as unknown as MathNode, {
      variable: series.variable,
      variableValue: x,
      parameters: scope,
    });
    if ("failure" in result || !Number.isFinite(result.value)) {
      values.push(undefined);
      continue;
    }
    values.push(result.value);
  }
  return { xs, values };
}

/* ------------------------------------------------------------------ *
 * Chart body: bar and histogram series
 * ------------------------------------------------------------------ */

const CHART_TYPES = Object.freeze(["bar", "grouped-bar", "stacked-bar", "histogram"]);
const CHART_TOP_LEVEL_FIELDS = Object.freeze([
  "id",
  "number",
  "type",
  "width",
  "height",
  "legend",
  "grid",
  "x-label",
  "y-label",
  "y-min",
  "y-max",
]);
const CHART_SERIES_OPENER_KEYS = Object.freeze(["label", "bars", "values"]);
const CHART_SERIES_FIELDS = Object.freeze(["label", "bars", "values", "edges", "bin-count", "min", "max"]);
const BAR_FIELDS = Object.freeze(["category", "value", "error", "error-low", "error-high"]);

function parseBarsGroup(
  group: readonly CursorLine[],
  holder: PlotInputLine,
  sourceName: string | undefined,
  diagnostics: Diagnostic[],
): { bars: ChartBar[]; failed: boolean } {
  const bars: ChartBar[] = [];
  let failed = false;
  let index = 0;
  let barIndex = 0;
  while (index < group.length) {
    const opener = group[index];
    if (opener === undefined) break;
    const openMatch = ITEM_OPEN.exec(opener.text);
    if (openMatch === null) {
      unknownField(CHART_NAMESPACE, "Chart bars", opener.text.trim(), opener.line, sourceName, BAR_FIELDS, diagnostics);
      failed = true;
      index += 1;
      continue;
    }
    const openerField = fieldMatch(openMatch[2] ?? "");
    if (openerField === undefined || (openerField.key !== "category" && openerField.key !== "value")) {
      unknownField(CHART_NAMESPACE, "Chart bars", (openMatch[2] ?? "").trim(), opener.line, sourceName, BAR_FIELDS, diagnostics);
      failed = true;
      index += 1;
      continue;
    }
    const record = new Map<string, { value: string; line: PlotInputLine }>();
    record.set(openerField.key, { value: openerField.value, line: opener.line });
    index += 1;
    while (index < group.length) {
      const member = group[index];
      if (member === undefined || member.indent <= opener.indent) break;
      const memberField = fieldMatch(member.text);
      if (memberField === undefined || member.text.trimStart().startsWith("-")) {
        unknownField(CHART_NAMESPACE, "Chart bars", member.text.trim(), member.line, sourceName, BAR_FIELDS, diagnostics);
        failed = true;
        index += 1;
        continue;
      }
      if (!BAR_FIELDS.includes(memberField.key)) {
        unknownField(CHART_NAMESPACE, "Chart bars", memberField.key, member.line, sourceName, BAR_FIELDS, diagnostics);
        failed = true;
        index += 1;
        continue;
      }
      if (record.has(memberField.key)) {
        duplicateField(CHART_NAMESPACE, memberField.key, member.line, sourceName, diagnostics);
        failed = true;
        index += 1;
        continue;
      }
      record.set(memberField.key, { value: memberField.value, line: member.line });
      index += 1;
    }
    const currentIndex = barIndex;
    barIndex += 1;
    const rawCategory = record.get("category");
    const rawValue = record.get("value");
    if (rawCategory === undefined || rawValue === undefined) {
      diagnostics.push(
        diag(CHART_NAMESPACE, "invalid-datum", `Bar ${currentIndex} is missing ${rawCategory === undefined ? "category" : "value"}.`, opener.line.range, sourceName, {
          data: { index: currentIndex },
        }),
      );
      failed = true;
      continue;
    }
    if (rawCategory.value.length === 0) {
      diagnostics.push(
        diag(CHART_NAMESPACE, "invalid-datum", `Bar ${currentIndex} category must not be empty.`, opener.line.range, sourceName, {
          data: { index: currentIndex },
        }),
      );
      failed = true;
      continue;
    }
    if (rawCategory.value.length > MAX_LABEL_CHARS) {
      diagnostics.push(
        limitExceeded(CHART_NAMESPACE, "label", rawCategory.value.length, MAX_LABEL_CHARS, opener.line.range, sourceName),
      );
      failed = true;
      continue;
    }
    const value = parseDecimalValue(CHART_NAMESPACE, "invalid-datum", rawValue.value, rawValue.line, sourceName, diagnostics, {
      index: currentIndex,
      field: "value",
    });
    if (value === undefined) {
      failed = true;
      continue;
    }
    const errorRaw = record.get("error");
    const lowRaw = record.get("error-low");
    const highRaw = record.get("error-high");
    let error: string | undefined;
    let errorLow: string | undefined;
    let errorHigh: string | undefined;
    if (errorRaw !== undefined) {
      error = parseDecimalValue(CHART_NAMESPACE, "invalid-datum", errorRaw.value, errorRaw.line, sourceName, diagnostics, {
        index: currentIndex,
        field: "error",
      });
      if (error === undefined) {
        failed = true;
        continue;
      }
    }
    if (lowRaw !== undefined) {
      errorLow = parseDecimalValue(CHART_NAMESPACE, "invalid-datum", lowRaw.value, lowRaw.line, sourceName, diagnostics, {
        index: currentIndex,
        field: "error-low",
      });
      if (errorLow === undefined) {
        failed = true;
        continue;
      }
    }
    if (highRaw !== undefined) {
      errorHigh = parseDecimalValue(CHART_NAMESPACE, "invalid-datum", highRaw.value, highRaw.line, sourceName, diagnostics, {
        index: currentIndex,
        field: "error-high",
      });
      if (errorHigh === undefined) {
        failed = true;
        continue;
      }
    }
    if (!checkErrorFields(CHART_NAMESPACE, { error, errorLow, errorHigh }, opener.line, currentIndex, sourceName, diagnostics)) {
      failed = true;
      continue;
    }
    bars.push({
      category: rawCategory.value,
      value,
      ...(error === undefined ? {} : { error }),
      ...(errorLow === undefined ? {} : { errorLow }),
      ...(errorHigh === undefined ? {} : { errorHigh }),
    });
  }
  if (bars.length === 0 && !failed) {
    diagnostics.push(diag(CHART_NAMESPACE, "empty-series", "Bar series declares no bars.", holder.range, sourceName, {}));
    failed = true;
  }
  return { bars, failed };
}

function parseScalarList(
  group: readonly CursorLine[],
  code: "invalid-datum" | "invalid-edges",
  sourceName: string | undefined,
  diagnostics: Diagnostic[],
): { values: { value: string; line: PlotInputLine }[]; failed: boolean } {
  const values: { value: string; line: PlotInputLine }[] = [];
  let failed = false;
  for (const member of group) {
    const openMatch = ITEM_OPEN.exec(member.text);
    if (openMatch === null || (openMatch[2] ?? "").trim() === "") {
      unknownField(CHART_NAMESPACE, "Chart values", member.text.trim(), member.line, sourceName, ["<decimal>"], diagnostics);
      failed = true;
      continue;
    }
    const raw = (openMatch[2] ?? "").trim();
    if (raw.includes(":")) {
      unknownField(CHART_NAMESPACE, "Chart values", raw, member.line, sourceName, ["<decimal>"], diagnostics);
      failed = true;
      continue;
    }
    const canonical = parseDecimalValue(CHART_NAMESPACE, code, raw, member.line, sourceName, diagnostics, {});
    if (canonical === undefined) {
      failed = true;
      continue;
    }
    values.push({ value: canonical, line: member.line });
  }
  return { values, failed };
}

export interface ValidatedChart {
  readonly block?: ChartBlock;
  readonly diagnostics: readonly Diagnostic[];
}

export function validateChartBlock(options: {
  readonly headerLines: readonly PlotInputLine[];
  readonly bodyLines: readonly PlotInputLine[];
  readonly blockRange: SourceRange;
  readonly sourceName: string | undefined;
  readonly defaults?: PlotBlockDefaults;
}): ValidatedChart {
  const { headerLines, bodyLines, blockRange, sourceName, defaults } = options;
  const diagnostics: Diagnostic[] = [];
  const fields = parseHeaderFields(CHART_NAMESPACE, "Chart", headerLines, new Set<string>(), CHART_TOP_LEVEL_FIELDS, sourceName, diagnostics);
  if (fields === undefined) return { diagnostics };
  const seenTop = new Set<string>();
  for (const field of fields) {
    if (seenTop.has(field.key)) {
      duplicateField(CHART_NAMESPACE, field.key, field.line, sourceName, diagnostics);
      return { diagnostics };
    }
    seenTop.add(field.key);
  }
  const shared = applySharedHeader(CHART_NAMESPACE, fields, sourceName, diagnostics, defaults ?? {});
  if (shared === undefined || shared.failed) return { diagnostics };
  const byKey = new Map(fields.map((field) => [field.key, field]));
  const typeField = byKey.get("type");
  if (typeField === undefined) {
    diagnostics.push(
      diag(CHART_NAMESPACE, "unknown-chart-type", "Chart Block requires a type: field.", blockRange, sourceName, {
        suggestion: "Use type: bar, grouped-bar, stacked-bar, or histogram.",
        data: { registered: CHART_TYPES.join(",") },
      }),
    );
    return { diagnostics };
  }
  if (!CHART_TYPES.includes(typeField.value)) {
    diagnostics.push(
      diag(CHART_NAMESPACE, "unknown-chart-type", `Chart type "${typeField.value}" is not registered.`, valueRange(typeField.line, typeField.value), sourceName, {
        suggestion: "Use type: bar, grouped-bar, stacked-bar, or histogram.",
        data: { type: typeField.value, registered: CHART_TYPES.join(",") },
      }),
    );
    return { diagnostics };
  }
  const chartType = typeField.value as ChartBlock["chartType"];
  let xLabel: string | undefined;
  let yLabel: string | undefined;
  let yMin: string | undefined;
  let yMax: string | undefined;
  for (const key of ["x-label", "y-label"] as const) {
    const field = byKey.get(key);
    if (field === undefined) continue;
    const label = parseLabelField(CHART_NAMESPACE, key, field.value, field.line, sourceName, diagnostics);
    if (label === undefined) return { diagnostics };
    if (key === "x-label") xLabel = label;
    else yLabel = label;
  }
  for (const key of ["y-min", "y-max"] as const) {
    const field = byKey.get(key);
    if (field === undefined) continue;
    const canonical = parseDecimalValue(CHART_NAMESPACE, "invalid-domain", field.value, field.line, sourceName, diagnostics, { bound: key });
    if (canonical === undefined) return { diagnostics };
    if (key === "y-min") yMin = canonical;
    else yMax = canonical;
  }
  if (yMin !== undefined && yMax !== undefined && Number(yMin) >= Number(yMax)) {
    diagnostics.push(
      diag(CHART_NAMESPACE, "invalid-domain", "Chart y-min must be less than y-max.", blockRange, sourceName, {
        data: { min: yMin, max: yMax },
      }),
    );
    return { diagnostics };
  }
  const cursor = toCursorLines(bodyLines);
  const series: ChartSeries[] = [];
  const categories = new Set<string>();
  let index = 0;
  let failed = false;
  while (index < cursor.length) {
    const opener = cursor[index];
    if (opener === undefined) break;
    const openMatch = SERIES_OPEN.exec(opener.text);
    const openField = openMatch === null ? undefined : fieldMatch(openMatch[2] === undefined ? "" : `${openMatch[2]}:${openMatch[3] ?? ""}`);
    if (openMatch === null || openField === undefined || !CHART_SERIES_OPENER_KEYS.includes(openField.key)) {
      unknownField(CHART_NAMESPACE, "Chart series", opener.text.trim(), opener.line, sourceName, CHART_SERIES_FIELDS, diagnostics);
      failed = true;
      // Consume the series body so its fields are not misread as new series.
      const skipped = collectSeriesFields(CHART_NAMESPACE, "Chart series", cursor, index, opener.indent, new Set(["bars", "values", "edges"]), true, sourceName, []);
      index = skipped.next;
      continue;
    }
    const collected = collectSeriesFields(CHART_NAMESPACE, "Chart series", cursor, index, opener.indent, new Set(["bars", "values", "edges"]), true, sourceName, diagnostics);
    index = collected.next;
    if (collected.failed) {
      failed = true;
      continue;
    }
    const { head } = collected;
    const seenFields = new Set<string>();
    let seriesFailed = false;
    const scalar = new Map<string, BodyField>();
    const nested = head.nested;
    for (const field of head.fields) {
      if (!CHART_SERIES_FIELDS.includes(field.key)) {
        unknownField(CHART_NAMESPACE, "Chart series", field.key, field.line, sourceName, CHART_SERIES_FIELDS, diagnostics);
        seriesFailed = true;
        continue;
      }
      if (seenFields.has(field.key)) {
        duplicateField(CHART_NAMESPACE, field.key, field.line, sourceName, diagnostics);
        seriesFailed = true;
        continue;
      }
      seenFields.add(field.key);
      scalar.set(field.key, field);
    }
    if (seriesFailed) {
      failed = true;
      continue;
    }
    const labelRaw = scalar.get("label");
    let label: string | undefined;
    if (labelRaw !== undefined) {
      label = parseLabelField(CHART_NAMESPACE, "label", labelRaw.value, labelRaw.line, sourceName, diagnostics);
      if (label === undefined) {
        failed = true;
        continue;
      }
    }
    if (chartType === "histogram") {
      if (scalar.has("bars")) {
        diagnostics.push(
          diag(CHART_NAMESPACE, "invalid-series", "Histogram series require values:, not bars:.", head.opener.range, sourceName, {}),
        );
        failed = true;
        continue;
      }
      const valuesGroup = nested.get("values");
      if (valuesGroup === undefined) {
        diagnostics.push(
          diag(CHART_NAMESPACE, "missing-values", "Histogram series require a values: collection.", head.opener.range, sourceName, {}),
        );
        failed = true;
        continue;
      }
      const { values, failed: valuesFailed } = parseScalarList(valuesGroup, "invalid-datum", sourceName, diagnostics);
      if (valuesFailed) {
        failed = true;
        continue;
      }
      if (values.length === 0) {
        diagnostics.push(diag(CHART_NAMESPACE, "empty-series", "Histogram series declares no values.", head.opener.range, sourceName, {}));
        failed = true;
        continue;
      }
      if (values.length > MAX_HISTOGRAM_VALUES) {
        diagnostics.push(limitExceeded(CHART_NAMESPACE, "values", values.length, MAX_HISTOGRAM_VALUES, head.opener.range, sourceName));
        failed = true;
        continue;
      }
      let edges: string[] | undefined;
      const edgesGroup = nested.get("edges");
      if (edgesGroup !== undefined) {
        const { values: edgeValues, failed: edgesFailed } = parseScalarList(edgesGroup, "invalid-edges", sourceName, diagnostics);
        if (edgesFailed) {
          failed = true;
          continue;
        }
        edges = edgeValues.map((entry) => entry.value);
      } else {
        const binCountRaw = scalar.get("bin-count");
        const minRaw = scalar.get("min");
        const maxRaw = scalar.get("max");
        if (binCountRaw === undefined || minRaw === undefined || maxRaw === undefined) {
          diagnostics.push(
            diag(CHART_NAMESPACE, "missing-binning", "Histogram series require edges: or bin-count: with min: and max:.", head.opener.range, sourceName, {}),
          );
          failed = true;
          continue;
        }
        if (!/^[0-9]+$/.test(binCountRaw.value) || Number.parseInt(binCountRaw.value, 10) < 1) {
          diagnostics.push(
            diag(CHART_NAMESPACE, "invalid-edges", `Histogram bin-count "${binCountRaw.value}" must be a positive integer.`, valueRange(binCountRaw.line, binCountRaw.value), sourceName, {
              data: { value: binCountRaw.value },
            }),
          );
          failed = true;
          continue;
        }
        const binCount = Number.parseInt(binCountRaw.value, 10);
        const min = parseDecimalValue(CHART_NAMESPACE, "invalid-edges", minRaw.value, minRaw.line, sourceName, diagnostics, { bound: "min" });
        const max = parseDecimalValue(CHART_NAMESPACE, "invalid-edges", maxRaw.value, maxRaw.line, sourceName, diagnostics, { bound: "max" });
        if (min === undefined || max === undefined) {
          failed = true;
          continue;
        }
        if (Number(min) >= Number(max)) {
          diagnostics.push(
            diag(CHART_NAMESPACE, "invalid-edges", "Histogram min must be less than max.", head.opener.range, sourceName, {
              data: { min, max },
            }),
          );
          failed = true;
          continue;
        }
        if (binCount > MAX_BINS) {
          diagnostics.push(limitExceeded(CHART_NAMESPACE, "bins", binCount, MAX_BINS, valueRange(binCountRaw.line, binCountRaw.value), sourceName));
          failed = true;
          continue;
        }
        // The resolved edge list is Document data; counts derive at render.
        edges = [];
        for (let b = 0; b <= binCount; b += 1) {
          edges.push(canonicalDecimal(String(Number(min) + (b * (Number(max) - Number(min))) / binCount)) ?? String(Number(min) + (b * (Number(max) - Number(min))) / binCount));
        }
      }
      if (edges === undefined || edges.length < 2) {
        diagnostics.push(diag(CHART_NAMESPACE, "invalid-edges", "Histogram edges require at least two boundaries.", head.opener.range, sourceName, {}));
        failed = true;
        continue;
      }
      if (edges.length - 1 > MAX_BINS) {
        diagnostics.push(limitExceeded(CHART_NAMESPACE, "bins", edges.length - 1, MAX_BINS, head.opener.range, sourceName));
        failed = true;
        continue;
      }
      for (let e = 1; e < edges.length; e += 1) {
        if (Number(edges[e] ?? 0) <= Number(edges[e - 1] ?? 0)) {
          diagnostics.push(
            diag(CHART_NAMESPACE, "invalid-edges", "Histogram edges must be strictly increasing.", head.opener.range, sourceName, {
              data: { edges: edges.join(",") },
            }),
          );
          failed = true;
          break;
        }
      }
      if (failed) continue;
      const lo = Number(edges[0] ?? 0);
      const hi = Number(edges[edges.length - 1] ?? 0);
      const outOfRange: number[] = [];
      values.forEach((entry, valueIndex) => {
        const numeric = Number(entry.value);
        if (numeric < lo || numeric > hi) outOfRange.push(valueIndex);
      });
      if (outOfRange.length > 0) {
        diagnostics.push(
          diag(CHART_NAMESPACE, "value-out-of-bin-range", `Histogram values fall outside the edges: indexes ${outOfRange.join(", ")}.`, head.opener.range, sourceName, {
            data: { indexes: outOfRange.join(","), edges: edges.join(",") },
          }),
        );
        failed = true;
        continue;
      }
      series.push({ kind: "histogram", ...(label === undefined ? {} : { label }), values: values.map((entry) => entry.value), edges });
    } else {
      if (scalar.has("values") || scalar.has("edges") || scalar.has("bin-count")) {
        diagnostics.push(
          diag(CHART_NAMESPACE, "invalid-series", `Bar-family series require bars:, not histogram data.`, head.opener.range, sourceName, {}),
        );
        failed = true;
        continue;
      }
      const barsGroup = nested.get("bars");
      if (barsGroup === undefined) {
        diagnostics.push(
          diag(CHART_NAMESPACE, "missing-bars", "Bar series require a bars: collection.", head.opener.range, sourceName, {}),
        );
        failed = true;
        continue;
      }
      const { bars, failed: barsFailed } = parseBarsGroup(barsGroup, head.opener, sourceName, diagnostics);
      if (barsFailed) {
        failed = true;
        continue;
      }
      const seenCategories = new Set<string>();
      for (const bar of bars) {
        if (seenCategories.has(bar.category)) {
          diagnostics.push(
            diag(CHART_NAMESPACE, "duplicate-category", `Bar category "${bar.category}" repeats within one series.`, head.opener.range, sourceName, {
              severity: "warning",
              data: { category: bar.category },
            }),
          );
        }
        seenCategories.add(bar.category);
        categories.add(bar.category);
      }
      series.push({ kind: "bars", ...(label === undefined ? {} : { label }), bars });
    }
  }
  if (!failed && series.length === 0) {
    diagnostics.push(diag(CHART_NAMESPACE, "empty", "Chart Block declares no series.", blockRange, sourceName, {}));
    return { diagnostics };
  }
  if (failed) return { diagnostics };
  if (series.length > MAX_CHART_SERIES) {
    diagnostics.push(limitExceeded(CHART_NAMESPACE, "series", series.length, MAX_CHART_SERIES, blockRange, sourceName));
    return { diagnostics };
  }
  if (categories.size > MAX_BAR_CATEGORIES) {
    diagnostics.push(limitExceeded(CHART_NAMESPACE, "categories", categories.size, MAX_BAR_CATEGORIES, blockRange, sourceName));
    return { diagnostics };
  }
  const block: ChartBlock = {
    kind: "chart",
    range: blockRange,
    ...(shared.id === undefined ? {} : { id: shared.id }),
    pluginVersion: CHART_PLUGIN_VERSION,
    chartType,
    ...(shared.number === undefined ? {} : { number: shared.number }),
    width: shared.width,
    height: shared.height,
    legend: shared.legend,
    grid: shared.grid,
    ...(xLabel === undefined ? {} : { xLabel }),
    ...(yLabel === undefined ? {} : { yLabel }),
    ...(yMin === undefined ? {} : { yMin }),
    ...(yMax === undefined ? {} : { yMax }),
    series,
  };
  return { block, diagnostics };
}

/* ------------------------------------------------------------------ *
 * Domain resolution (renderer-derived, fingerprint-only)
 * ------------------------------------------------------------------ */

function niceLinearDomain(lo: number, hi: number): [number, number] {
  if (!(lo < hi)) {
    lo -= 1;
    hi += 1;
  }
  const scale = scaleLinear().domain([lo, hi]).nice();
  const [niceLo, niceHi] = scale.domain();
  return [niceLo ?? lo, niceHi ?? hi];
}

function niceLogDomain(lo: number, hi: number): [number, number] {
  const positive = [lo, hi].filter((value) => value > 0);
  if (positive.length === 0) return [1, 10];
  let niceLo = Math.pow(10, Math.floor(Math.log10(positive[0] ?? 1)));
  let niceHi = Math.pow(10, Math.ceil(Math.log10(positive[positive.length - 1] ?? 10)));
  if (!(niceLo < niceHi)) niceHi = niceLo * 10;
  return [niceLo, niceHi];
}

function resolveAxisDomain(
  axis: PlotAxisConfig,
  fitted: readonly number[],
  logFallback: [number, number],
): [number, number] {
  const authoredMin = axis.min === undefined ? undefined : Number(axis.min);
  const authoredMax = axis.max === undefined ? undefined : Number(axis.max);
  if (authoredMin !== undefined && authoredMax !== undefined) return [authoredMin, authoredMax];
  const finite = fitted.filter((value) => Number.isFinite(value) && (axis.scale === "linear" || value > 0));
  let lo = authoredMin;
  let hi = authoredMax;
  if (lo === undefined || hi === undefined) {
    if (finite.length === 0) return axis.scale === "log" ? logFallback : [0, 1];
    const [fitLo, fitHi] = axis.scale === "log"
      ? niceLogDomain(Math.min(...finite), Math.max(...finite))
      : niceLinearDomain(Math.min(...finite), Math.max(...finite));
    if (lo === undefined) lo = fitLo;
    if (hi === undefined) hi = fitHi;
  }
  const finalLo = lo ?? 0;
  const finalHi = hi ?? 1;
  if (!(finalLo < finalHi)) return axis.scale === "log" ? niceLogDomain(finalLo, finalHi) : niceLinearDomain(finalLo, finalHi);
  return [finalLo, finalHi];
}

/* ------------------------------------------------------------------ *
 * Owned SVG emitter
 * ------------------------------------------------------------------ */

const PALETTE = Object.freeze(["#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed", "#0891b2"]);
const AXIS_COLOR = "#374151";
const GRID_COLOR = "#d1d5db";
const MARGIN = Object.freeze({ left: 64, right: 16, top: 16, bottom: 48 });

export class PlotSanitizerError extends Error {
  readonly code = "azeforge.plot#sanitizer-compromise" as const;
  constructor(message: string) {
    super(message);
    this.name = "PlotSanitizerError";
  }
}

/** Fail-closed norm extended to plot fragments: generated markup must never carry executable content. */
export function assertPlotFragmentSafe(svg: string): void {
  if (/<\s*script|on[a-z]+\s*=|javascript:/i.test(svg)) {
    throw new PlotSanitizerError("Plot fragment carries unexpected executable markup.");
  }
}

interface PlotGeometry {
  readonly width: number;
  readonly height: number;
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
}

function geometryOf(width: number, height: number): PlotGeometry {
  return {
    width,
    height,
    x0: MARGIN.left,
    x1: width - MARGIN.right,
    y0: height - MARGIN.bottom,
    y1: MARGIN.top,
  };
}

function seriesColor(index: number): string {
  return PALETTE[index % PALETTE.length] ?? "#2563eb";
}

function tickLabels(scale: ScaleLinear<number, number> | ScaleLogarithmic<number, number>, count: number): { value: number; label: string }[] {
  return scale.ticks(count).map((value) => ({ value, label: quantize(value) }));
}

function renderAxesFrame(options: {
  readonly geo: PlotGeometry;
  readonly xScale: ScaleLinear<number, number> | ScaleLogarithmic<number, number>;
  readonly yScale: ScaleLinear<number, number> | ScaleLogarithmic<number, number>;
  readonly xLabel?: string | undefined;
  readonly yLabel?: string | undefined;
  readonly grid: boolean;
}): string {
  const { geo, xScale, yScale, xLabel, yLabel, grid } = options;
  const parts: string[] = [];
  const xTicks = tickLabels(xScale, 6);
  const yTicks = tickLabels(yScale, 6);
  for (const tick of xTicks) {
    const px = quantize(xScale(tick.value));
    if (grid) {
      parts.push(`<line x1="${px}" y1="${quantize(geo.y1)}" x2="${px}" y2="${quantize(geo.y0)}" stroke="${GRID_COLOR}" stroke-width="1"/>`);
    }
    parts.push(`<line x1="${px}" y1="${quantize(geo.y0)}" x2="${px}" y2="${quantize(geo.y0 + 5)}" stroke="${AXIS_COLOR}" stroke-width="1"/>`);
    parts.push(
      `<text x="${px}" y="${quantize(geo.y0 + 18)}" text-anchor="middle" font-size="11" fill="${AXIS_COLOR}">${escapeXml(tick.label)}</text>`,
    );
  }
  for (const tick of yTicks) {
    const py = quantize(yScale(tick.value));
    if (grid) {
      parts.push(`<line x1="${quantize(geo.x0)}" y1="${py}" x2="${quantize(geo.x1)}" y2="${py}" stroke="${GRID_COLOR}" stroke-width="1"/>`);
    }
    parts.push(`<line x1="${quantize(geo.x0 - 5)}" y1="${py}" x2="${quantize(geo.x0)}" y2="${py}" stroke="${AXIS_COLOR}" stroke-width="1"/>`);
    parts.push(
      `<text x="${quantize(geo.x0 - 8)}" y="${quantize(Number(py) + 4)}" text-anchor="end" font-size="11" fill="${AXIS_COLOR}">${escapeXml(tick.label)}</text>`,
    );
  }
  parts.push(
    `<line x1="${quantize(geo.x0)}" y1="${quantize(geo.y0)}" x2="${quantize(geo.x1)}" y2="${quantize(geo.y0)}" stroke="${AXIS_COLOR}" stroke-width="1.5"/>`,
  );
  parts.push(
    `<line x1="${quantize(geo.x0)}" y1="${quantize(geo.y1)}" x2="${quantize(geo.x0)}" y2="${quantize(geo.y0)}" stroke="${AXIS_COLOR}" stroke-width="1.5"/>`,
  );
  if (xLabel !== undefined) {
    parts.push(
      `<text x="${quantize((geo.x0 + geo.x1) / 2)}" y="${quantize(geo.height - 8)}" text-anchor="middle" font-size="12" fill="${AXIS_COLOR}">${escapeXml(xLabel)}</text>`,
    );
  }
  if (yLabel !== undefined) {
    parts.push(
      `<text x="14" y="${quantize((geo.y1 + geo.y0) / 2)}" text-anchor="middle" font-size="12" fill="${AXIS_COLOR}" transform="rotate(-90 14 ${quantize((geo.y1 + geo.y0) / 2)})">${escapeXml(yLabel)}</text>`,
    );
  }
  return parts.join("");
}

function renderLegend(geo: PlotGeometry, labels: readonly (string | undefined)[], legend: boolean): string {
  if (!legend) return "";
  const entries = labels.map((label, index) => ({ label, index })).filter((entry) => entry.label !== undefined);
  if (entries.length === 0) return "";
  return entries
    .map((entry, row) => {
      const y = geo.y1 + 14 + row * 18;
      const textX = quantize(geo.x1 - 22);
      const swatchX = quantize(geo.x1 - 18);
      return (
        `<rect x="${swatchX}" y="${quantize(y - 9)}" width="14" height="10" fill="${seriesColor(entry.index)}"/>` +
        `<text x="${textX}" y="${quantize(y)}" text-anchor="end" font-size="12" fill="${AXIS_COLOR}">${escapeXml(entry.label ?? "")}</text>`
      );
    })
    .join("");
}

function renderErrorBar(
  px: number,
  loValue: number,
  hiValue: number,
  yScale: ScaleLinear<number, number> | ScaleLogarithmic<number, number>,
  color: string,
): string {
  const lo = quantize(yScale(loValue));
  const hi = quantize(yScale(hiValue));
  const x = quantize(px);
  const cap = 4;
  return (
    `<line x1="${x}" y1="${lo}" x2="${x}" y2="${hi}" stroke="${color}" stroke-width="1.5"/>` +
    `<line x1="${quantize(px - cap)}" y1="${lo}" x2="${quantize(px + cap)}" y2="${lo}" stroke="${color}" stroke-width="1.5"/>` +
    `<line x1="${quantize(px - cap)}" y1="${hi}" x2="${quantize(px + cap)}" y2="${hi}" stroke="${color}" stroke-width="1.5"/>`
  );
}

function errorSpan(point: PlotDataPoint): [number, number] {
  const y = Number(point.y);
  if (point.error !== undefined) {
    const half = Number(point.error);
    return [y - half, y + half];
  }
  return [y - Number(point.errorLow ?? 0), y + Number(point.errorHigh ?? 0)];
}

function hasError(point: PlotDataPoint): boolean {
  return point.error !== undefined || (point.errorLow !== undefined && point.errorHigh !== undefined);
}

function stableFigureId(kind: string, seed: string): string {
  // Content-derived only: figure ids must survive trivia moves (trailing
  // whitespace, block relocation) that preserve the content hash. Never
  // seed with source offsets. Byte-identical twin blocks share an id.
  let hash = 2166136261;
  const text = `${kind}:${seed}`;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${kind}-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function plotContentSeed(block: PlotBlock): string {
  const parameters: Record<string, string> = {};
  for (const key of Object.keys(block.parameters).sort()) {
    parameters[key] = block.parameters[key] ?? "";
  }
  return JSON.stringify({
    id: block.id ?? "",
    width: block.width,
    height: block.height,
    legend: block.legend,
    grid: block.grid,
    parameters,
    xAxis: block.xAxis,
    yAxis: block.yAxis,
    series: block.series,
  });
}

function chartContentSeed(block: ChartBlock): string {
  return JSON.stringify({
    id: block.id ?? "",
    chartType: block.chartType,
    width: block.width,
    height: block.height,
    legend: block.legend,
    grid: block.grid,
    xLabel: block.xLabel ?? "",
    yLabel: block.yLabel ?? "",
    yMin: block.yMin ?? "",
    yMax: block.yMax ?? "",
    series: block.series,
  });
}

type AnyScale = ScaleLinear<number, number> | ScaleLogarithmic<number, number>;

function makeScale(scale: "linear" | "log", domain: [number, number], range: [number, number]): AnyScale {
  return scale === "log" ? scaleLog().domain(domain).range(range) : scaleLinear().domain(domain).range(range);
}

/** Split finite samples into drawable segments: gaps stay gaps, asymptote jumps break. */
function functionSegments(
  samples: FunctionSamples,
  xScale: AnyScale,
  yScale: AnyScale,
  yLog: boolean,
  yRange: number,
): [number, number][][] {
  const segments: [number, number][][] = [];
  let current: [number, number][] = [];
  let previous: number | undefined;
  const transform = (value: number): number => (yLog ? Math.log10(value) : value);
  for (let i = 0; i < samples.xs.length; i += 1) {
    const value = samples.values[i];
    const x = samples.xs[i] ?? 0;
    if (value === undefined || (yLog && !(value > 0))) {
      if (current.length > 0) {
        segments.push(current);
        current = [];
      }
      previous = undefined;
      continue;
    }
    if (previous !== undefined && Math.abs(transform(value) - transform(previous)) > ASYMPTOTE_FACTOR * (yLog ? Math.abs(Math.log10(yRange)) : yRange)) {
      if (current.length > 0) {
        segments.push(current);
        current = [];
      }
    }
    current.push([Number(quantize(xScale(x))), Number(quantize(yScale(value)))]);
    previous = value;
  }
  if (current.length > 0) segments.push(current);
  return segments;
}

function pathFromSegments(segments: [number, number][][]): string {
  const generator: Line<[number, number]> = d3Line<[number, number]>();
  generator.x((point) => point[0]).y((point) => point[1]);
  return segments.map((segment) => generator(segment) ?? "").join("");
}

/**
 * Render one plot Block to a static figure: browser-free deterministic SVG —
 * no scripts, no event attributes, no interactivity.
 */
export function renderPlotFragment(block: PlotBlock, _context: BlockRendererContext): string {
  const geo = geometryOf(block.width, block.height);
  const sampled = block.series.map((entry) =>
    entry.kind === "function" ? sampleFunctionSeries(entry, block.parameters) : undefined,
  );
  const xFit: number[] = [];
  const yFit: number[] = [];
  block.series.forEach((entry, seriesIndex) => {
    if (entry.kind === "function") {
      xFit.push(Number(entry.domainMin), Number(entry.domainMax));
      for (const value of sampled[seriesIndex]?.values ?? []) {
        if (value !== undefined) yFit.push(value);
      }
    } else {
      for (const point of entry.points) {
        xFit.push(Number(point.x));
        yFit.push(Number(point.y));
      }
    }
  });
  const yLog = block.yAxis.scale === "log";
  const [x0, x1] = resolveAxisDomain(block.xAxis, xFit, [1, 10]);
  const [y0, y1] = resolveAxisDomain(block.yAxis, yFit, [1, 10]);
  const xScale = makeScale(block.xAxis.scale, [x0, x1], [geo.x0, geo.x1]);
  const yScale = makeScale(block.yAxis.scale, [y0, y1], [geo.y0, geo.y1]);
  const yRange = yLog ? y1 / y0 : y1 - y0;
  const parts: string[] = [renderAxesFrame({ geo, xScale, yScale, xLabel: block.xAxis.label, yLabel: block.yAxis.label, grid: block.grid })];
  const legendLabels: (string | undefined)[] = [];
  block.series.forEach((entry, seriesIndex) => {
    const color = seriesColor(seriesIndex);
    legendLabels.push(entry.label);
    if (entry.kind === "function") {
      const samples = sampled[seriesIndex];
      if (samples === undefined) return;
      const segments = functionSegments(samples, xScale, yScale, yLog, yRange <= 0 ? 1 : yRange);
      const path = pathFromSegments(segments);
      if (path !== "") {
        parts.push(`<path d="${path}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`);
      }
      return;
    }
    if (entry.kind === "line") {
      const points: [number, number][] = entry.points.map((point) => [
        Number(quantize(xScale(Number(point.x)))),
        Number(quantize(yScale(Number(point.y)))),
      ]);
      const path = pathFromSegments([points]);
      if (path !== "") {
        parts.push(`<path d="${path}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`);
      }
    } else {
      for (const point of entry.points) {
        const px = xScale(Number(point.x));
        const py = yScale(Number(point.y));
        parts.push(`<circle cx="${quantize(px)}" cy="${quantize(py)}" r="3" fill="${color}"/>`);
      }
    }
    for (const point of entry.points) {
      if (!hasError(point)) continue;
      const [lo, hi] = errorSpan(point);
      parts.push(renderErrorBar(xScale(Number(point.x)), lo, hi, yScale, color));
    }
  });
  parts.push(renderLegend(geo, legendLabels, block.legend));
  const figureId = stableFigureId("aze-plot", plotContentSeed(block));
  const title = `Plot${block.id === undefined ? "" : ` ${block.id}`} with ${block.series.length} series: ${block.series
    .map((entry) => entry.label ?? entry.kind)
    .join(", ")}`;
  const desc = `plot with ${block.series
    .map((entry) =>
      entry.kind === "function"
        ? `function series "${entry.label ?? entry.expression}" (${entry.samples} samples)`
        : `${entry.kind} series "${entry.label ?? "unlabeled"}" (${entry.points.length} points)`,
    )
    .join(", ")}; x axis${block.xAxis.label === undefined ? "" : ` "${block.xAxis.label}"`} ${block.xAxis.scale} [${quantize(x0)}, ${quantize(x1)}]; y axis${block.yAxis.label === undefined ? "" : ` "${block.yAxis.label}"`} ${block.yAxis.scale} [${quantize(y0)}, ${quantize(y1)}]`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${block.width}" height="${block.height}" viewBox="0 0 ${block.width} ${block.height}" role="img">` +
    `<title>${escapeXml(title)}</title><desc>${escapeXml(desc)}</desc>${parts.join("")}</svg>`;
  assertPlotFragmentSafe(svg);
  const label = block.id === undefined ? "" : ` data-plot-id="${escapeXml(block.id)}"`;
  const number = block.number === true ? ' data-plot-number="true"' : "";
  return `<figure class="aze-plot" id="${figureId}"${label}${number}>${svg}</figure>`;
}

function histogramCounts(values: readonly string[], edges: readonly string[]): number[] {
  const numericEdges = edges.map((edge) => Number(edge));
  const counts = new Array(numericEdges.length - 1).fill(0) as number[];
  for (const value of values) {
    const numeric = Number(value);
    for (let b = 0; b < counts.length; b += 1) {
      const lo = numericEdges[b] ?? 0;
      const hi = numericEdges[b + 1] ?? 0;
      const last = b === counts.length - 1;
      if ((numeric >= lo && (numeric < hi || (last && numeric <= hi))) || (last && numeric === hi)) {
        counts[b] = (counts[b] ?? 0) + 1;
        break;
      }
    }
  }
  return counts;
}

/**
 * Render one chart Block to a static figure: browser-free deterministic SVG.
 */
export function renderChartFragment(block: ChartBlock, _context: BlockRendererContext): string {
  const geo = geometryOf(block.width, block.height);
  const parts: string[] = [];
  const legendLabels: (string | undefined)[] = [];
  if (block.chartType === "histogram") {
    const histograms = block.series.filter((entry) => entry.kind === "histogram");
    const edgeValues =
      histograms.length === 0
        ? [0, 1]
        : [
            Math.min(...histograms.flatMap((entry) => entry.edges.map((edge) => Number(edge)))),
            Math.max(...histograms.flatMap((entry) => entry.edges.map((edge) => Number(edge)))),
          ];
    const extent0 = edgeValues[0] ?? 0;
    const extent1 = edgeValues[1] ?? 1;
    const [x0, x1] = extent0 === extent1 ? [extent0 - 1, extent1 + 1] : [extent0, extent1];
    const counts = histograms.map((entry) => histogramCounts(entry.values, entry.edges));
    const maxCount = Math.max(0, ...counts.flat());
    const yAuthoredMin = block.yMin === undefined ? undefined : Number(block.yMin);
    const yAuthoredMax = block.yMax === undefined ? undefined : Number(block.yMax);
    const [y0, y1] = niceLinearDomain(Math.min(0, yAuthoredMin ?? 0), yAuthoredMax ?? (maxCount === 0 ? 1 : maxCount));
    const xScale = scaleLinear().domain([x0, x1]).range([geo.x0, geo.x1]);
    const yScale = scaleLinear().domain([y0, y1]).range([geo.y0, geo.y1]);
    parts.push(renderAxesFrame({ geo, xScale, yScale, xLabel: block.xLabel, yLabel: block.yLabel, grid: block.grid }));
    histograms.forEach((entry, seriesIndex) => {
      const color = seriesColor(seriesIndex);
      legendLabels.push(entry.label);
      const seriesCounts = counts[seriesIndex] ?? [];
      const binCount = seriesCounts.length;
      seriesCounts.forEach((count, bin) => {
        const lo = Number(entry.edges[bin] ?? 0);
        const hi = Number(entry.edges[bin + 1] ?? 0);
        const slot0 = xScale(lo);
        const slot1 = xScale(hi);
        const slot = (slot1 - slot0) / Math.max(1, histograms.length);
        const bx = slot0 + seriesIndex * slot + 1;
        const width = Math.max(1, slot - 2);
        const by = yScale(count);
        parts.push(
          `<rect x="${quantize(bx)}" y="${quantize(by)}" width="${quantize(width)}" height="${quantize(Math.max(0, yScale(0) - by))}" fill="${color}"/>`,
        );
        void binCount;
      });
    });
  } else {
    const barSeries = block.series.filter((entry) => entry.kind === "bars");
    const categories: string[] = [];
    for (const entry of barSeries) {
      for (const bar of entry.bars) {
        if (!categories.includes(bar.category)) categories.push(bar.category);
      }
    }
    const allValues = barSeries.flatMap((entry) => entry.bars.map((bar) => Number(bar.value)));
    const dataMin = allValues.length === 0 ? 0 : Math.min(...allValues);
    const dataMax = allValues.length === 0 ? 1 : Math.max(...allValues);
    const yAuthoredMin = block.yMin === undefined ? undefined : Number(block.yMin);
    const yAuthoredMax = block.yMax === undefined ? undefined : Number(block.yMax);
    const [y0, y1] = niceLinearDomain(Math.min(0, yAuthoredMin ?? dataMin), yAuthoredMax ?? dataMax);
    const band: ScaleBand<string> = scaleBand().domain(categories).range([geo.x0, geo.x1]).paddingInner(block.chartType === "bar" && barSeries.length <= 1 ? 0.3 : 0.15).paddingOuter(0.1);
    const yScale = scaleLinear().domain([y0, y1]).range([geo.y0, geo.y1]);
    const xScale = scaleLinear().domain([0, Math.max(1, categories.length)]).range([geo.x0, geo.x1]);
    parts.push(renderAxesFrame({ geo, xScale, yScale, xLabel: block.xLabel, yLabel: block.yLabel, grid: block.grid }));
    const stacked = block.chartType === "stacked-bar";
    const cumulative = new Map<string, number>();
    // Category labels on the band axis.
    for (const category of categories) {
      const center = (band(category) ?? 0) + band.bandwidth() / 2;
      parts.push(
        `<text x="${quantize(center)}" y="${quantize(geo.y0 + 18)}" text-anchor="middle" font-size="10" fill="${AXIS_COLOR}">${escapeXml(category)}</text>`,
      );
    }
    barSeries.forEach((entry, seriesIndex) => {
      const color = seriesColor(seriesIndex);
      legendLabels.push(entry.label);
      const byCategory = new Map(entry.bars.map((bar) => [bar.category, bar]));
      categories.forEach((category) => {
        const bar = byCategory.get(category);
        const value = bar === undefined ? 0 : Number(bar.value);
        const base = stacked ? (cumulative.get(category) ?? 0) : 0;
        const top = base + value;
        if (stacked) cumulative.set(category, top);
        const slot = band(category) ?? 0;
        const slotWidth = band.bandwidth();
        const count = stacked ? 1 : barSeries.length;
        const bx = stacked ? slot + 1 : slot + (slotWidth / count) * seriesIndex + 1;
        const width = stacked ? Math.max(1, slotWidth - 2) : Math.max(1, slotWidth / count - 2);
        const yTop = yScale(Math.max(base, top));
        const yBase = yScale(Math.min(base, top));
        // Zero-fill for missing categories renders nothing visible.
        if (bar === undefined && !stacked) return;
        parts.push(
          `<rect x="${quantize(bx)}" y="${quantize(yTop)}" width="${quantize(width)}" height="${quantize(Math.max(0, yBase - yTop))}" fill="${color}"/>`,
        );
        if (bar !== undefined && (bar.error !== undefined || (bar.errorLow !== undefined && bar.errorHigh !== undefined))) {
          const span: [number, number] = bar.error !== undefined
            ? [value - Number(bar.error), value + Number(bar.error)]
            : [value - Number(bar.errorLow ?? 0), value + Number(bar.errorHigh ?? 0)];
          const center = stacked ? slot + slotWidth / 2 : slot + (slotWidth / count) * seriesIndex + slotWidth / count / 2;
          parts.push(renderErrorBar(center, span[0] + base, span[1] + base, yScale, color));
        }
      });
    });
  }
  parts.push(renderLegend(geo, legendLabels, block.legend));
  const figureId = stableFigureId("aze-chart", chartContentSeed(block));
  const title = `Chart${block.id === undefined ? "" : ` ${block.id}`} (${block.chartType}) with ${block.series.length} series: ${block.series
    .map((entry) => entry.label ?? entry.kind)
    .join(", ")}`;
  const desc = `${block.chartType} chart with ${block.series.length} series${block.xLabel === undefined ? "" : `; x label "${block.xLabel}"`}${block.yLabel === undefined ? "" : `; y label "${block.yLabel}"`}`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${block.width}" height="${block.height}" viewBox="0 0 ${block.width} ${block.height}" role="img">` +
    `<title>${escapeXml(title)}</title><desc>${escapeXml(desc)}</desc>${parts.join("")}</svg>`;
  assertPlotFragmentSafe(svg);
  const label = block.id === undefined ? "" : ` data-chart-id="${escapeXml(block.id)}"`;
  const number = block.number === true ? ' data-chart-number="true"' : "";
  return `<figure class="aze-chart" id="${figureId}"${label}${number}>${svg}</figure>`;
}

/** Renderer fingerprint slice: emitter + evaluator + pinned d3 modules (contract §11). */
export function plotDependencyClosure(): JsonValue {
  return Object.freeze({
    emitter: PLOT_EMITTER_VERSION,
    eval: PLOT_EVAL_VERSION,
    d3array: D3_ARRAY_VERSION,
    d3scale: D3_SCALE_VERSION,
    d3shape: D3_SHAPE_VERSION,
  });
}

const plotPluginDescriptor = Object.freeze({
  type: PLOT_PLUGIN_TYPE,
  version: PLOT_PLUGIN_VERSION,
  title: "Plot",
  summary: "Numeric Cartesian plots: evaluable function curves and point series with shared axes.",
  diagnosticNamespace: "azeforge.plot",
  sourceSchema: plotSourceSchema,
  bodySyntax: Object.freeze({
    id: PLOT_BODY_SYNTAX_ID,
    version: PLOT_BODY_SYNTAX_VERSION,
  }),
  dataSchema: plotDataSchema,
});

export const plotPlugin: AzeBlockPlugin = Object.freeze({
  descriptor: plotPluginDescriptor,
});

const chartPluginDescriptor = Object.freeze({
  type: CHART_PLUGIN_TYPE,
  version: CHART_PLUGIN_VERSION,
  title: "Chart",
  summary: "Bar-family data charts: bar, grouped-bar, stacked-bar, and histogram.",
  diagnosticNamespace: "azeforge.chart",
  sourceSchema: chartSourceSchema,
  bodySyntax: Object.freeze({
    id: CHART_BODY_SYNTAX_ID,
    version: CHART_BODY_SYNTAX_VERSION,
  }),
  dataSchema: chartDataSchema,
});

export const chartPlugin: AzeBlockPlugin = Object.freeze({
  descriptor: chartPluginDescriptor,
});

export const PLOT_HTML_BLOCK_RENDERER_ID = "azeforge.plot.html/v1" as const;
export const PLOT_HTML_BLOCK_RENDERER_VERSION = "1.0.0" as const;
export const CHART_HTML_BLOCK_RENDERER_ID = "azeforge.chart.html/v1" as const;
export const CHART_HTML_BLOCK_RENDERER_VERSION = "1.0.0" as const;
export const PLOT_HTML_RENDERER_ID = "html" as const;
export const PLOT_HTML_RENDERER_VERSION = "1.0.0" as const;

const plotBlockRendererDescriptor = Object.freeze({
  id: PLOT_HTML_BLOCK_RENDERER_ID,
  version: PLOT_HTML_BLOCK_RENDERER_VERSION,
  blockType: PLOT_PLUGIN_TYPE,
  pluginVersionRange: "1.0.0",
  rendererId: PLOT_HTML_RENDERER_ID,
  rendererVersionRange: "1.0.0",
});

const chartBlockRendererDescriptor = Object.freeze({
  id: CHART_HTML_BLOCK_RENDERER_ID,
  version: CHART_HTML_BLOCK_RENDERER_VERSION,
  blockType: CHART_PLUGIN_TYPE,
  pluginVersionRange: "1.0.0",
  rendererId: PLOT_HTML_RENDERER_ID,
  rendererVersionRange: "1.0.0",
});

export const plotHtmlBlockRenderer: AzeBlockRenderer<PlotBlock> = Object.freeze({
  descriptor: plotBlockRendererDescriptor,
  render: renderPlotFragment,
});

export const chartHtmlBlockRenderer: AzeBlockRenderer<ChartBlock> = Object.freeze({
  descriptor: chartBlockRendererDescriptor,
  render: renderChartFragment,
});

/* ------------------------------------------------------------------ *
 * Front-matter defaults (contract §5 — registered defaultable settings)
 * ------------------------------------------------------------------ */

export interface PlotBlockDefaults {
  readonly legend?: boolean;
  readonly grid?: boolean;
  readonly width?: number;
  readonly height?: number;
}

export interface PlotDocumentDefaults {
  readonly plot?: PlotBlockDefaults;
  readonly chart?: PlotBlockDefaults;
}

export const EMPTY_DOCUMENT_DEFAULTS: PlotDocumentDefaults = Object.freeze({});

const DEFAULT_SETTINGS_FIELDS = Object.freeze(["legend", "grid", "width", "height"]);
const DEFAULT_SECTIONS = Object.freeze(["plot", "chart"]);

function parseDefaultsSection(
  section: string,
  value: unknown,
  line: PlotInputLine,
  sourceName: string | undefined,
  diagnostics: Diagnostic[],
): PlotBlockDefaults | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    diagnostics.push(
      diag("azeforge.metadata", "invalid-defaults", `Front matter defaults.${section} must be a mapping.`, line.range, sourceName, {
        data: { section },
      }),
    );
    return undefined;
  }
  const settings: Record<string, boolean | number> = {};
  let failed = false;
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!DEFAULT_SETTINGS_FIELDS.includes(key)) {
      const suggestion = didYouMean(key, DEFAULT_SETTINGS_FIELDS);
      diagnostics.push(
        diag("azeforge.metadata", "unknown-key", `Unknown front matter defaults key "${key}".`, line.range, sourceName, {
          ...(suggestion === undefined ? {} : { suggestion }),
          data: { key },
        }),
      );
      failed = true;
      continue;
    }
    if (key === "legend" || key === "grid") {
      if (entry !== true && entry !== false) {
        diagnostics.push(
          diag("azeforge.metadata", "invalid-defaults", `Front matter defaults.${section}.${key} must be true or false.`, line.range, sourceName, {
            data: { section, key },
          }),
        );
        failed = true;
        continue;
      }
      settings[key] = entry;
      continue;
    }
    if (!Number.isInteger(entry) || (entry as number) < 1) {
      diagnostics.push(
        diag("azeforge.metadata", "invalid-defaults", `Front matter defaults.${section}.${key} must be a positive integer number of CSS pixels.`, line.range, sourceName, {
          data: { section, key },
        }),
      );
      failed = true;
      continue;
    }
    if ((entry as number) > MAX_DIMENSION_PX) {
      diagnostics.push(
        limitExceeded("azeforge.metadata", key, entry as number, MAX_DIMENSION_PX, line.range, sourceName),
      );
      failed = true;
      continue;
    }
    settings[key] = entry as number;
  }
  if (failed) return undefined;
  const out: Record<string, boolean | number> = {};
  for (const key of DEFAULT_SETTINGS_FIELDS) {
    if (settings[key] !== undefined) out[key] = settings[key] as boolean | number;
  }
  return out as PlotBlockDefaults;
}

/**
 * Validate the front matter `defaults:` mapping. Only the registered
 * plot/chart settings are defaultable; anything else is refused, never
 * silently dropped.
 */
export function parseDocumentDefaults(
  value: unknown,
  line: PlotInputLine,
  sourceName: string | undefined,
): { defaults: PlotDocumentDefaults; diagnostics: readonly Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    diagnostics.push(
      diag("azeforge.metadata", "invalid-defaults", "Front matter defaults: must be a mapping.", line.range, sourceName, {}),
    );
    return { defaults: EMPTY_DOCUMENT_DEFAULTS, diagnostics };
  }
  const defaults: Record<string, PlotBlockDefaults> = {};
  let failed = false;
  for (const [section, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!DEFAULT_SECTIONS.includes(section)) {
      const suggestion = didYouMean(section, DEFAULT_SECTIONS);
      diagnostics.push(
        diag("azeforge.metadata", "unknown-key", `Unknown front matter defaults section "${section}".`, line.range, sourceName, {
          ...(suggestion === undefined ? {} : { suggestion }),
          data: { section },
        }),
      );
      failed = true;
      continue;
    }
    const parsed = parseDefaultsSection(section, entry, line, sourceName, diagnostics);
    if (parsed === undefined) {
      failed = true;
      continue;
    }
    defaults[section] = parsed;
  }
  if (failed) return { defaults: EMPTY_DOCUMENT_DEFAULTS, diagnostics };
  return { defaults, diagnostics };
}