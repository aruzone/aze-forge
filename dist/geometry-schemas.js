/** Pure plugin contract constants: no Node imports, no engine initialization. */
export const GEOMETRY_PLUGIN_TYPE = "geometry";
export const GEOMETRY_PLUGIN_VERSION = "1.0.0";
export const GEOMETRY_BODY_SYNTAX_ID = "azeforge.geometry/v1";
export const GEOMETRY_BODY_SYNTAX_VERSION = "1.0.0";
/** Bounded construction evaluator version (contract §4, §9). */
export const GEOMETRY_EVAL_VERSION = "geometry-eval/v1";
/** Project-owned SVG emitter version (contract §9, plots emission reuse). */
export const GEOMETRY_EMITTER_VERSION = "1.0.0";
/** Registered relative epsilon governing every geometric predicate. */
export const GEOMETRY_EPSILON = 1e-9;
export const geometrySourceSchema = Object.freeze({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "azeforge.geometry/source/v1",
    type: "object",
    additionalProperties: false,
    properties: {
        id: { type: "string" },
        number: { type: "boolean" },
        width: { type: "number" },
        height: { type: "number" },
        bounds: {
            type: "object",
            additionalProperties: false,
            properties: {
                "min-x": { type: "number" },
                "min-y": { type: "number" },
                "max-x": { type: "number" },
                "max-y": { type: "number" },
            },
        },
        declarations: { type: "array" },
    },
});
export const geometryDataSchema = Object.freeze({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "azeforge.geometry/data/v1",
    type: "object",
    additionalProperties: false,
    required: ["kind", "declarations", "pluginVersion"],
    properties: {
        kind: { const: "geometry" },
        pluginVersion: { const: GEOMETRY_PLUGIN_VERSION },
        id: { type: "string" },
        number: { type: "boolean" },
        width: { type: "number" },
        height: { type: "number" },
        declarations: { type: "array" },
    },
});
//# sourceMappingURL=geometry-schemas.js.map