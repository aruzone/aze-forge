export const DIAGRAM_PLUGIN_TYPE = "diagram";
export const DIAGRAM_PLUGIN_VERSION = "1.0.0";
export const DIAGRAM_BODY_SYNTAX_ID = "azeforge.diagram/v1";
export const DIAGRAM_BODY_SYNTAX_VERSION = "1.0.0";
export const diagramSourceSchema = Object.freeze({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "azeforge.diagram/source/v1",
    type: "object",
    additionalProperties: false,
    properties: {
        id: { type: "string" },
        number: { type: "boolean" },
        title: { type: "string" },
        description: { type: "string" },
        mode: { enum: ["flowchart", "graph", "tree", "architecture"] },
        flow: { enum: ["top-to-bottom", "bottom-to-top", "left-to-right", "right-to-left"] },
    },
    required: ["mode"],
});
export const diagramDataSchema = Object.freeze({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "azeforge.diagram/data/v1",
    type: "object",
    additionalProperties: false,
    required: ["kind", "pluginVersion", "mode", "flow", "declarations"],
    properties: {
        kind: { const: "diagram" },
        pluginVersion: { const: DIAGRAM_PLUGIN_VERSION },
        id: { type: "string" },
        number: { type: "boolean" },
        title: { type: "array" },
        description: { type: "array" },
        mode: { enum: ["flowchart", "graph", "tree", "architecture"] },
        flow: { enum: ["top-to-bottom", "bottom-to-top", "left-to-right", "right-to-left"] },
        declarations: { type: "array" },
    },
});
//# sourceMappingURL=diagram-schemas.js.map