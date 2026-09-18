/** Pure plugin contract constants: no Node imports, no engine initialization. */
export const PLOT_PLUGIN_TYPE = "plot";
export const PLOT_PLUGIN_VERSION = "1.0.0";
export const PLOT_BODY_SYNTAX_ID = "azeforge.plot/v1";
export const PLOT_BODY_SYNTAX_VERSION = "1.0.0";
export const CHART_PLUGIN_TYPE = "chart";
export const CHART_PLUGIN_VERSION = "1.0.0";
export const CHART_BODY_SYNTAX_ID = "azeforge.chart/v1";
export const CHART_BODY_SYNTAX_VERSION = "1.0.0";
/** Bounded evaluable expression language version (contract §7). */
export const PLOT_EVAL_VERSION = "plot-eval/v1";
/** Project-owned SVG emitter version (contract §7, §10). */
export const PLOT_EMITTER_VERSION = "1.0.1";
/** Exact-pinned d3 modules the emitter builds scales, ticks, and paths over. */
export const D3_ARRAY_VERSION = "3.2.4";
export const D3_SCALE_VERSION = "4.0.2";
export const D3_SHAPE_VERSION = "3.2.0";
export const plotSourceSchema = Object.freeze({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "azeforge.plot/source/v1",
    type: "object",
    additionalProperties: false,
    properties: {
        id: {
            type: "string",
            pattern: "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$",
        },
        number: { type: "boolean" },
        width: { type: "integer", minimum: 1, maximum: 4096 },
        height: { type: "integer", minimum: 1, maximum: 4096 },
        legend: { type: "boolean" },
        grid: { type: "boolean" },
    },
});
export const plotDataSchema = Object.freeze({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "azeforge.plot/data/v1",
    type: "object",
    additionalProperties: false,
    required: ["kind", "series", "pluginVersion"],
    properties: {
        kind: { const: "plot" },
        pluginVersion: { const: "1.0.0" },
        number: { type: "boolean" },
        width: { type: "integer" },
        height: { type: "integer" },
        legend: { type: "boolean" },
        grid: { type: "boolean" },
        parameters: { type: "object" },
        xAxis: { type: "object" },
        yAxis: { type: "object" },
        series: { type: "array", minItems: 1, maxItems: 16 },
    },
});
export const chartSourceSchema = Object.freeze({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "azeforge.chart/source/v1",
    type: "object",
    additionalProperties: false,
    properties: {
        id: {
            type: "string",
            pattern: "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$",
        },
        number: { type: "boolean" },
        type: {
            type: "string",
            enum: ["bar", "grouped-bar", "stacked-bar", "histogram"],
        },
        width: { type: "integer", minimum: 1, maximum: 4096 },
        height: { type: "integer", minimum: 1, maximum: 4096 },
        legend: { type: "boolean" },
        grid: { type: "boolean" },
    },
});
export const chartDataSchema = Object.freeze({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "azeforge.chart/data/v1",
    type: "object",
    additionalProperties: false,
    required: ["kind", "chartType", "series", "pluginVersion"],
    properties: {
        kind: { const: "chart" },
        chartType: {
            type: "string",
            enum: ["bar", "grouped-bar", "stacked-bar", "histogram"],
        },
        pluginVersion: { const: "1.0.0" },
        number: { type: "boolean" },
        width: { type: "integer" },
        height: { type: "integer" },
        legend: { type: "boolean" },
        grid: { type: "boolean" },
        series: { type: "array", minItems: 1, maxItems: 16 },
    },
});
//# sourceMappingURL=plot-schemas.js.map