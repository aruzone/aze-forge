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
import { ADVANCE_METRIC_DATA } from "./advance-metric-data.js";
export const ADVANCE_METRIC_VERSION = "1.0.0";
/** Subscript and superscript runs measure at this many em. */
export const SCRIPT_SCALE = 0.7;
export const advanceMetricTable = ADVANCE_METRIC_DATA;
/**
 * The pinned font package versions the table was generated from, in the order
 * the subsets were read. A capability report states these so a metric change
 * is visible without reading the fingerprint.
 */
export const ADVANCE_METRIC_SOURCES = Object.freeze([
    ...new Set(advanceMetricTable.sources.map((source) => `${source.package}@${source.version}`)),
]);
/**
 * Design units of one string, all of it at `scale` em; a code point the table
 * does not cover measures at `defaultAdvance`.
 */
function measureUnits(value, scale) {
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
function runAdvanceUnits(run) {
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
export function advanceWidth(text, fontSizePx) {
    let units = 0;
    for (const run of text)
        units += runAdvanceUnits(run);
    return (units / advanceMetricTable.unitsPerEm) * fontSizePx;
}
/** Advance in px of one label line-array: widest line, `|` breaks only. */
export function labelAdvance(label, fontSizePx) {
    let widest = 0;
    for (const line of label) {
        const width = advanceWidth(line, fontSizePx);
        if (width > widest)
            widest = width;
    }
    return widest;
}
/** Line count of a label (1 when absent). */
export function labelLines(label) {
    return label === undefined ? 1 : Math.max(label.length, 1);
}
/** Fingerprint closure for the rendered-artifact hash (contract §7). */
export function advanceMetricDependencyClosure() {
    const closure = {
        metric: ADVANCE_METRIC_VERSION,
        family: advanceMetricTable.family,
        weight: advanceMetricTable.weight,
        unitsPerEm: advanceMetricTable.unitsPerEm,
        monospace: advanceMetricTable.monospace,
    };
    closure.sources = advanceMetricTable.sources.map((source) => `${source.package}@${source.version}:${source.hash}`);
    return Object.freeze(closure);
}
//# sourceMappingURL=advance-metric.js.map