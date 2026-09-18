import type { JsonValue } from "./model.js";
/** Pure plugin contract constants: no Node imports, no engine initialization. */
export declare const PLOT_PLUGIN_TYPE: "plot";
export declare const PLOT_PLUGIN_VERSION: "1.0.0";
export declare const PLOT_BODY_SYNTAX_ID: "azeforge.plot/v1";
export declare const PLOT_BODY_SYNTAX_VERSION: "1.0.0";
export declare const CHART_PLUGIN_TYPE: "chart";
export declare const CHART_PLUGIN_VERSION: "1.0.0";
export declare const CHART_BODY_SYNTAX_ID: "azeforge.chart/v1";
export declare const CHART_BODY_SYNTAX_VERSION: "1.0.0";
/** Bounded evaluable expression language version (contract §7). */
export declare const PLOT_EVAL_VERSION: "plot-eval/v1";
/** Project-owned SVG emitter version (contract §7, §10). */
export declare const PLOT_EMITTER_VERSION: "1.0.1";
/** Exact-pinned d3 modules the emitter builds scales, ticks, and paths over. */
export declare const D3_ARRAY_VERSION: "3.2.4";
export declare const D3_SCALE_VERSION: "4.0.2";
export declare const D3_SHAPE_VERSION: "3.2.0";
export declare const plotSourceSchema: JsonValue;
export declare const plotDataSchema: JsonValue;
export declare const chartSourceSchema: JsonValue;
export declare const chartDataSchema: JsonValue;
