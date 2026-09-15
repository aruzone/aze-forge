/**
 * Character-advance metric for diagram labels (issue #76, contract issue #60).
 *
 * Diagram layout must know how wide a label will be before anything is
 * rendered, and rendering happens in a browser the compiler does not drive.
 * The metric is therefore a generated table of Inter's advance widths, in
 * design units, keyed by code point: `src/advance-metric-data.ts` is produced
 * by `scripts/generate-advance-metric.mjs` from the pinned `@fontsource/inter`
 * woff2 subsets that `src/font.ts` embeds, so the measurement the compiler
 * uses is the measurement the reader will see.
 *
 * Two rules complete the model:
 *
 * - a run that is not plain text measures at its own size — scripts at
 *   `SCRIPT_SCALE` em, quantities as the plain text of their value;
 * - a code point the table does not cover measures at `defaultAdvance`, the
 *   advance of `x` (U+0078), the width of an arbitrary lowercase letter.
 *
 * Everything here is a pure function of the table and its inputs: the metric
 * never consults the DOM, the file system or the clock.
 */

import type {
  CircuitText,
  CircuitTextRun,
  DiagramLabel,
  JsonValue,
} from "./model.js";
import { ADVANCE_METRIC_DATA } from "./advance-metric-data.js";

export const ADVANCE_METRIC_VERSION = "1.0.0" as const;

/** Subscript and superscript runs measure at this many em. */
export const SCRIPT_SCALE = 0.7;

export interface AdvanceMetricTable {
  /** Proportional family the code-point table was generated from. */
  readonly family: "Inter";
  readonly weight: 400;
  /** Design units per em of the source font. */
  readonly unitsPerEm: number;
  /** Advance in design units for a code point the table does not cover. */
  readonly defaultAdvance: number;
  /** Code point (decimal string) -> advance in design units. */
  readonly advances: Readonly<Record<string, number>>;
  /**
   * The monospaced face of the same pinned stack. Its advance is one constant
   * across every code point it maps, so it is stored once; the metric is
   * shared with every family that sizes code text from it.
   */
  readonly monospace: Readonly<{
    readonly family: "JetBrains Mono";
    readonly weight: 400;
    readonly unitsPerEm: number;
    readonly advance: number;
    readonly codePoints: number;
  }>;
  /** `@fontsource` package versions and woff2 byte hashes the table came from. */
  readonly sources: readonly { readonly package: string; readonly version: string; readonly hash: string }[];
}

export const advanceMetricTable: AdvanceMetricTable = ADVANCE_METRIC_DATA;

/**
 * The pinned font package versions the table was generated from, in the order
 * the subsets were read. A capability report states these so a metric change
 * is visible without reading the fingerprint.
 */
export const ADVANCE_METRIC_SOURCES: readonly string[] = Object.freeze([
  ...new Set(advanceMetricTable.sources.map((source) => `${source.package}@${source.version}`)),
]);

/**
 * Design units of one string, all of it at `scale` em; a code point the table
 * does not cover measures at `defaultAdvance`.
 */
function measureUnits(value: string, scale: number): number {
  const { advances, defaultAdvance } = advanceMetricTable;
  let units = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined) {
      units += (advances[String(codePoint)] ?? defaultAdvance) * scale;
    }
  }
  return units;
}

function runAdvanceUnits(run: CircuitTextRun): number {
  switch (run.kind) {
    case "text":
      return measureUnits(run.value, 1);
    case "subscript":
    case "superscript":
      return measureUnits(run.value, SCRIPT_SCALE);
    case "quantity":
      return measureUnits(`${run.coefficient}${run.prefix}${run.unit}`, 1);
  }
}

/** Advance in px of one inline text value at `fontSizePx`; scripts at 0.7 em. */
export function advanceWidth(text: CircuitText, fontSizePx: number): number {
  let units = 0;
  for (const run of text) units += runAdvanceUnits(run);
  return (units / advanceMetricTable.unitsPerEm) * fontSizePx;
}

/** Advance in px of one label line-array: widest line, `|` breaks only. */
export function labelAdvance(label: DiagramLabel, fontSizePx: number): number {
  let widest = 0;
  for (const line of label) {
    const width = advanceWidth(line, fontSizePx);
    if (width > widest) widest = width;
  }
  return widest;
}

/** Line count of a label (1 when absent). */
export function labelLines(label: DiagramLabel | undefined): number {
  return label === undefined ? 1 : Math.max(label.length, 1);
}

/** Fingerprint closure for the rendered-artifact hash (contract §7). */
export function advanceMetricDependencyClosure(): JsonValue {
  const closure: Record<string, JsonValue> = {
    metric: ADVANCE_METRIC_VERSION,
    family: advanceMetricTable.family,
    weight: advanceMetricTable.weight,
    unitsPerEm: advanceMetricTable.unitsPerEm,
    monospace: advanceMetricTable.monospace as unknown as JsonValue,
  };
  closure.sources = advanceMetricTable.sources.map(
    (source) => `${source.package}@${source.version}:${source.hash}`,
  );
  return Object.freeze(closure);
}
