/** Pure plugin contract constants: no Node imports, no engine initialization. */
export const FIGURE_PLUGIN_TYPE = "figure";
export const FIGURE_PLUGIN_VERSION = "1.0.0";
export const FIGURE_BODY_SYNTAX_ID = "azeforge.figure/v1";
export const FIGURE_BODY_SYNTAX_VERSION = "1.0.0";
export const figureSourceSchema = Object.freeze({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "azeforge.figure/source/v1",
    type: "object",
    additionalProperties: false,
    properties: {
        id: { type: "string", pattern: "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$" },
        number: { type: "boolean" },
        caption: { type: "string", minLength: 1, maxLength: 500 },
    },
});
export const figureDataSchema = Object.freeze({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "azeforge.figure/data/v1",
    type: "object",
    additionalProperties: false,
    required: ["children", "pluginVersion"],
    properties: {
        kind: { const: "figure" },
        pluginVersion: { const: "1.0.0" },
        children: {
            type: "array",
            minItems: 1,
            items: { type: "object", additionalProperties: true },
        },
    },
});
//# sourceMappingURL=figure-schemas.js.map