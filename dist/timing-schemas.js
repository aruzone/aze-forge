export const TIMING_PLUGIN_TYPE = "timing";
export const TIMING_PLUGIN_VERSION = "1.0.0";
export const TIMING_BODY_SYNTAX_ID = "azeforge.timing/v1";
export const TIMING_BODY_SYNTAX_VERSION = "1.0.0";
export const timingSourceSchema = Object.freeze({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "azeforge.timing/source/v1",
    type: "object",
    additionalProperties: false,
    properties: {
        id: { type: "string" },
        number: { type: "boolean" },
        title: { type: "string" },
        description: { type: "string" },
        scale: { enum: ["cycles", "time"] },
        unit: { enum: ["ns", "µs", "ms", "s"] },
    },
    required: ["title"],
});
export const timingDataSchema = Object.freeze({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "azeforge.timing/data/v1",
    type: "object",
    additionalProperties: false,
    required: [
        "kind",
        "pluginVersion",
        "title",
        "scale",
        "signals",
        "groups",
        "markers",
        "arrows",
    ],
    properties: {
        kind: { const: "timing" },
        pluginVersion: { const: TIMING_PLUGIN_VERSION },
        title: { type: "array" },
        description: { type: "array" },
        scale: { enum: ["cycles", "time"] },
        unit: { enum: ["ns", "µs", "ms", "s"] },
        signals: { type: "array" },
        groups: { type: "array" },
        markers: { type: "array" },
        arrows: { type: "array" },
    },
});
//# sourceMappingURL=timing-schemas.js.map