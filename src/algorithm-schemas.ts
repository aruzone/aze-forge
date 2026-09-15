import type { JsonValue } from "./model.js";

/** Pure plugin contract constants: no Node imports, no engine initialization. */

export const ALGORITHM_PLUGIN_TYPE = "algorithm" as const;
export const ALGORITHM_PLUGIN_VERSION = "1.0.0" as const;
export const ALGORITHM_BODY_SYNTAX_ID = "azeforge.algorithm/v1" as const;
export const ALGORITHM_BODY_SYNTAX_VERSION = "1.0.0" as const;

export const algorithmSourceSchema: JsonValue = Object.freeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "azeforge.algorithm/source/v1",
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string", pattern: "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$" },
    number: { type: "boolean" },
    caption: { type: "string", minLength: 1, maxLength: 500 },
  },
});

export const algorithmDataSchema: JsonValue = Object.freeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "azeforge.algorithm/data/v1",
  type: "object",
  additionalProperties: false,
  required: ["procedure", "parameters", "steps", "pluginVersion"],
  properties: {
    kind: { const: "algorithm" },
    pluginVersion: { const: "1.0.0" },
    procedure: { type: "string", minLength: 1 },
    parameters: { type: "array", items: { type: "string", minLength: 1 } },
    steps: { type: "array", items: { type: "object", additionalProperties: true } },
  },
});
