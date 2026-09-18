/**
 * Software and data models family contract constants (issue #61). One
 * greenfield Plugin per directive, four diagnostic namespaces, no Node
 * imports and no engine initialization: the schemas travel with the registry
 * and are published, never executed.
 */
export const SEQUENCE_PLUGIN_TYPE = "sequence";
export const SEQUENCE_PLUGIN_VERSION = "1.0.0";
export const SEQUENCE_BODY_SYNTAX_ID = "azeforge.sequence/v1";
export const SEQUENCE_BODY_SYNTAX_VERSION = "1.0.0";
export const STATE_PLUGIN_TYPE = "state";
export const STATE_PLUGIN_VERSION = "1.0.0";
export const STATE_BODY_SYNTAX_ID = "azeforge.state/v1";
export const STATE_BODY_SYNTAX_VERSION = "1.0.0";
export const ENTITY_PLUGIN_TYPE = "entity";
export const ENTITY_PLUGIN_VERSION = "1.0.0";
export const ENTITY_BODY_SYNTAX_ID = "azeforge.entity/v1";
export const ENTITY_BODY_SYNTAX_VERSION = "1.0.0";
export const CLASS_PLUGIN_TYPE = "class";
export const CLASS_PLUGIN_VERSION = "1.0.0";
export const CLASS_BODY_SYNTAX_ID = "azeforge.class/v1";
export const CLASS_BODY_SYNTAX_VERSION = "1.0.0";
const HEADER_PROPERTIES = Object.freeze({
    id: { type: "string" },
    number: { type: "boolean" },
    title: { type: "string" },
    description: { type: "string" },
});
export const sequenceSourceSchema = Object.freeze({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "azeforge.sequence/source/v1",
    type: "object",
    additionalProperties: false,
    properties: HEADER_PROPERTIES,
});
export const sequenceDataSchema = Object.freeze({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "azeforge.sequence/data/v1",
    type: "object",
    additionalProperties: false,
    required: ["kind", "pluginVersion", "participants", "timeline"],
    properties: {
        kind: { const: "sequence" },
        pluginVersion: { const: SEQUENCE_PLUGIN_VERSION },
        ...HEADER_PROPERTIES,
        participants: { type: "array" },
        timeline: { type: "array" },
    },
});
export const stateSourceSchema = Object.freeze({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "azeforge.state/source/v1",
    type: "object",
    additionalProperties: false,
    properties: HEADER_PROPERTIES,
});
export const stateDataSchema = Object.freeze({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "azeforge.state/data/v1",
    type: "object",
    additionalProperties: false,
    required: ["kind", "pluginVersion", "items"],
    properties: {
        kind: { const: "state" },
        pluginVersion: { const: STATE_PLUGIN_VERSION },
        ...HEADER_PROPERTIES,
        items: { type: "array" },
    },
});
export const entitySourceSchema = Object.freeze({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "azeforge.entity/source/v1",
    type: "object",
    additionalProperties: false,
    properties: HEADER_PROPERTIES,
});
export const entityDataSchema = Object.freeze({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "azeforge.entity/data/v1",
    type: "object",
    additionalProperties: false,
    required: ["kind", "pluginVersion", "items"],
    properties: {
        kind: { const: "entity" },
        pluginVersion: { const: ENTITY_PLUGIN_VERSION },
        ...HEADER_PROPERTIES,
        items: { type: "array" },
    },
});
export const classSourceSchema = Object.freeze({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "azeforge.class/source/v1",
    type: "object",
    additionalProperties: false,
    properties: HEADER_PROPERTIES,
});
export const classDataSchema = Object.freeze({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "azeforge.class/data/v1",
    type: "object",
    additionalProperties: false,
    required: ["kind", "pluginVersion", "items"],
    properties: {
        kind: { const: "class" },
        pluginVersion: { const: CLASS_PLUGIN_VERSION },
        ...HEADER_PROPERTIES,
        items: { type: "array" },
    },
});
//# sourceMappingURL=models-schemas.js.map