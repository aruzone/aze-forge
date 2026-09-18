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
import { type MathNode } from "./math.js";
import type { AzeBlockPlugin, AzeBlockRenderer, BlockRendererContext, ChartBlock, Diagnostic, JsonValue, PlotBlock, PlotFunctionSeries, SourceRange } from "./model.js";
export declare const MAX_PLOT_SERIES = 16;
/** Shared per-Block series ceiling (contract §8: 16 for plots and charts alike). */
export declare const MAX_CHART_SERIES = 16;
export declare const MAX_POINTS_PER_SERIES = 5000;
export declare const MAX_HISTOGRAM_VALUES = 10000;
export declare const MAX_BINS = 256;
export declare const MAX_BAR_CATEGORIES = 256;
export declare const MAX_PARAMETERS = 64;
export declare const MAX_EXPRESSION_CHARS = 4000;
export declare const MAX_SAMPLES = 10000;
export declare const MIN_SAMPLES = 2;
export declare const DEFAULT_SAMPLES = 500;
export declare const MAX_LABEL_CHARS = 500;
export declare const MAX_DIMENSION_PX = 4096;
export declare const DEFAULT_PLOT_WIDTH = 640;
export declare const DEFAULT_PLOT_HEIGHT = 400;
/** Adjacent finite samples differing by more than this multiple of the
 * resolved visible range break the segment (registered constant, no knob). */
export declare const ASYMPTOTE_FACTOR = 4;
/** Source line handed from the envelope parser (text + exact line range). */
export interface PlotInputLine {
    readonly text: string;
    readonly range: SourceRange;
}
export declare function didYouMean(value: string, candidates: readonly string[]): string | undefined;
/**
 * Canonical exact-decimal form: `1.50` ≡ `1.5`, `1e3` → `1000`,
 * `1e-6` → `0.000001`. Returns undefined for non-decimal spellings
 * (`nan`, `inf`, fractions, prose) — the caller reports `#invalid-datum`.
 */
export declare function canonicalDecimal(spelling: string): string | undefined;
export interface EvalScope {
    readonly variable: string;
    readonly variableValue: number;
    readonly parameters: ReadonlyMap<string, number>;
}
export type EvalFailure = {
    readonly kind: "non-evaluable";
    readonly detail: string;
} | {
    readonly kind: "unbound";
    readonly name: string;
};
/**
 * `asin`/`acos`/`atan` are contract spellings; the native grammar registers
 * `arcsin`/`arccos`/`arctan`. Normalize on word boundaries before parsing so
 * the stored tree stays grammar-native.
 */
export declare function normalizeEvaluableSpelling(expression: string): string;
export declare function evaluateNode(node: MathNode, scope: EvalScope): {
    readonly value: number;
} | {
    readonly failure: EvalFailure;
};
/** Quantize to 3 decimals and emit minimal fixed-notation ASCII; never emits nonfinite. */
export declare function quantize(value: number): string;
export declare function escapeXml(text: string): string;
export interface SharedHeaderOptions {
    readonly id?: string;
    readonly number?: boolean;
    readonly width: number;
    readonly height: number;
    readonly legend: boolean;
    readonly grid: boolean;
}
export declare const PLOT_TOP_LEVEL_FIELDS: readonly string[];
export declare const AXIS_CHILD_FIELDS: readonly string[];
/** Axis scale spellings, in the order `parseAxisSection` accepts them. */
export declare const AXIS_SCALES: readonly ["linear", "log"];
export declare const PLOT_SERIES_KINDS: readonly string[];
export declare const FUNCTION_FIELDS: readonly string[];
export declare const POINT_SERIES_FIELDS: readonly string[];
export declare const DOMAIN_FIELDS: readonly string[];
export declare const POINT_FIELDS: readonly string[];
export interface ValidatedPlot {
    readonly block?: PlotBlock;
    readonly diagnostics: readonly Diagnostic[];
}
export declare function validatePlotBlock(options: {
    readonly headerLines: readonly PlotInputLine[];
    readonly bodyLines: readonly PlotInputLine[];
    readonly blockRange: SourceRange;
    readonly sourceName: string | undefined;
    readonly defaults?: PlotBlockDefaults;
}): ValidatedPlot;
export interface FunctionSamples {
    readonly xs: readonly number[];
    readonly values: readonly (number | undefined)[];
}
export declare function sampleFunctionSeries(series: PlotFunctionSeries, parameters: Readonly<Record<string, string>>): FunctionSamples;
export declare const CHART_TYPES: readonly string[];
export declare const CHART_TOP_LEVEL_FIELDS: readonly string[];
export declare const CHART_SERIES_OPENER_KEYS: readonly string[];
export declare const CHART_SERIES_FIELDS: readonly string[];
/** Chart series record kinds: the `ChartSeries` discriminants in the parsed Block. */
export declare const CHART_SERIES_KINDS: readonly string[];
/**
 * The keys each chart series kind accepts, in `CHART_SERIES_FIELDS` order. The
 * excluded keys are exactly the ones `validateChartBlock` refuses: `bars:` on a
 * histogram series, and `values:`/`edges:`/`bin-count:` on a bar-family series.
 */
export declare const CHART_SERIES_FIELDS_BY_KIND: Readonly<{
    bars: readonly string[];
    histogram: readonly string[];
}>;
export declare const BAR_FIELDS: readonly string[];
export interface ValidatedChart {
    readonly block?: ChartBlock;
    readonly diagnostics: readonly Diagnostic[];
}
export declare function validateChartBlock(options: {
    readonly headerLines: readonly PlotInputLine[];
    readonly bodyLines: readonly PlotInputLine[];
    readonly blockRange: SourceRange;
    readonly sourceName: string | undefined;
    readonly defaults?: PlotBlockDefaults;
}): ValidatedChart;
export declare class PlotSanitizerError extends Error {
    readonly code: "azeforge.plot#sanitizer-compromise";
    constructor(message: string);
}
/** Fail-closed norm extended to plot fragments: generated markup must never carry executable content. */
export declare function assertPlotFragmentSafe(svg: string): void;
/**
 * Render one plot Block to a static figure: browser-free deterministic SVG —
 * no scripts, no event attributes, no interactivity.
 */
export declare function renderPlotFragment(block: PlotBlock, _context: BlockRendererContext): string;
/**
 * Render one chart Block to a static figure: browser-free deterministic SVG.
 */
export declare function renderChartFragment(block: ChartBlock, _context: BlockRendererContext): string;
/** Renderer fingerprint slice: emitter + evaluator + pinned d3 modules (contract §11). */
export declare function plotDependencyClosure(): JsonValue;
export declare const plotPlugin: AzeBlockPlugin;
export declare const chartPlugin: AzeBlockPlugin;
export declare const PLOT_HTML_BLOCK_RENDERER_ID: "azeforge.plot.html/v1";
export declare const PLOT_HTML_BLOCK_RENDERER_VERSION: "1.0.0";
export declare const CHART_HTML_BLOCK_RENDERER_ID: "azeforge.chart.html/v1";
export declare const CHART_HTML_BLOCK_RENDERER_VERSION: "1.0.0";
export declare const PLOT_HTML_RENDERER_ID: "html";
export declare const PLOT_HTML_RENDERER_VERSION: "1.0.0";
export declare const plotHtmlBlockRenderer: AzeBlockRenderer<PlotBlock>;
export declare const chartHtmlBlockRenderer: AzeBlockRenderer<ChartBlock>;
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
export declare const EMPTY_DOCUMENT_DEFAULTS: PlotDocumentDefaults;
export declare const DEFAULT_SETTINGS_FIELDS: readonly string[];
/**
 * Validate the front matter `defaults:` mapping. Only the registered
 * plot/chart settings are defaultable; anything else is refused, never
 * silently dropped.
 */
export declare function parseDocumentDefaults(value: unknown, line: PlotInputLine, sourceName: string | undefined): {
    defaults: PlotDocumentDefaults;
    diagnostics: readonly Diagnostic[];
};
