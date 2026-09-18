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
import type { CircuitText, DiagramLabel, JsonValue } from "./model.js";
export declare const ADVANCE_METRIC_VERSION: "1.0.0";
/** Subscript and superscript runs measure at this many em. */
export declare const SCRIPT_SCALE = 0.7;
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
    readonly sources: readonly {
        readonly package: string;
        readonly version: string;
        readonly hash: string;
    }[];
}
export declare const advanceMetricTable: AdvanceMetricTable;
/**
 * The pinned font package versions the table was generated from, in the order
 * the subsets were read. A capability report states these so a metric change
 * is visible without reading the fingerprint.
 */
export declare const ADVANCE_METRIC_SOURCES: readonly string[];
/** Advance in px of one inline text value at `fontSizePx`; scripts at 0.7 em. */
export declare function advanceWidth(text: CircuitText, fontSizePx: number): number;
/** Advance in px of one label line-array: widest line, `|` breaks only. */
export declare function labelAdvance(label: DiagramLabel, fontSizePx: number): number;
/** Line count of a label (1 when absent). */
export declare function labelLines(label: DiagramLabel | undefined): number;
/** Fingerprint closure for the rendered-artifact hash (contract §7). */
export declare function advanceMetricDependencyClosure(): JsonValue;
