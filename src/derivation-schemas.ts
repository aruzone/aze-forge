import type { JsonValue } from "./model.js";

/** Pure plugin contract constants: no Node imports, no engine initialization. */

export const DERIVATION_PLUGIN_TYPE = "derivation" as const;
export const DERIVATION_PLUGIN_VERSION = "1.0.0" as const;
export const DERIVATION_BODY_SYNTAX_ID = "azeforge.derivation/v1" as const;
export const DERIVATION_BODY_SYNTAX_VERSION = "1.0.0" as const;
export const derivationSourceSchema: JsonValue = Object.freeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "azeforge.derivation/source/v1",
  type: "object",
  additionalProperties: false,
  properties: {
    id: {
      type: "string",
      pattern: "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$",
    },
    number: { type: "boolean" },
    align: { type: "string", enum: ["left", "center", "right"] },
  },
});
export const derivationDataSchema: JsonValue = Object.freeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "azeforge.derivation/data/v1",
  type: "object",
  additionalProperties: false,
  required: ["kind", "steps", "pluginVersion"],
  properties: {
    kind: { const: "derivation" },
    pluginVersion: { const: "1.0.0" },
    steps: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["expression", "tree"],
        properties: {
          expression: { type: "string", minLength: 1, maxLength: 4000 },
          tree: { type: "object" },
          annotation: {
            type: "array",
            minItems: 1,
            items: { type: "object" },
          },
        },
      },
    },
    number: { type: "boolean" },
    align: { type: "string", enum: ["left", "center", "right"] },
  },
});