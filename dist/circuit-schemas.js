export const CIRCUIT_PLUGIN_TYPE = "circuit";
export const CIRCUIT_PLUGIN_VERSION = "1.0.0";
export const CIRCUIT_BODY_SYNTAX_ID = "azeforge.circuit/v1";
export const CIRCUIT_BODY_SYNTAX_VERSION = "1.0.0";
export const circuitSourceSchema = Object.freeze({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "azeforge.circuit/source/v1",
    type: "object",
    additionalProperties: false,
    properties: { id: { type: "string" }, number: { type: "boolean" }, title: { type: "string" }, description: { type: "string" }, flow: { enum: ["left-to-right", "top-to-bottom"] } },
    required: ["title"],
});
export const circuitDataSchema = Object.freeze({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "azeforge.circuit/data/v1",
    type: "object",
    additionalProperties: false,
    required: ["kind", "pluginVersion", "title", "flow", "nodes", "components", "relations", "annotations", "symbolConvention"],
    properties: { kind: { const: "circuit" }, pluginVersion: { const: CIRCUIT_PLUGIN_VERSION }, title: { type: "array" }, description: { type: "array" }, flow: { enum: ["left-to-right", "top-to-bottom"] }, nodes: { type: "array" }, components: { type: "array" }, relations: { type: "array" }, annotations: { type: "array" }, symbolConvention: { enum: ["iec", "ansi"] } },
});
//# sourceMappingURL=circuit-schemas.js.map