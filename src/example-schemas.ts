import type { JsonValue } from "./model.js";

/** Pure plugin contract constants: no Node imports, no engine initialization. */

export const EXAMPLE_PLUGIN_TYPE = "example" as const;
export const EXAMPLE_PLUGIN_VERSION = "1.0.0" as const;
export const EXAMPLE_BODY_SYNTAX_ID = "azeforge.example/v1" as const;
export const EXAMPLE_BODY_SYNTAX_VERSION = "1.0.0" as const;

export const exampleSourceSchema: JsonValue = Object.freeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "azeforge.example/source/v1",
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string", pattern: "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$" },
    number: { type: "boolean" },
    caption: { type: "string", minLength: 1, maxLength: 500 },
  },
});

export const exampleDataSchema: JsonValue = Object.freeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "azeforge.example/data/v1",
  type: "object",
  additionalProperties: false,
  required: ["problem", "givens", "steps", "pluginVersion"],
  properties: {
    kind: { const: "example" },
    pluginVersion: { const: "1.0.0" },
    problem: { type: "array", items: { type: "object", additionalProperties: true } },
    givens: { type: "array", items: { type: "string" } },
    steps: { type: "array", items: { type: "object", additionalProperties: true } },
    result: { type: "array", items: { type: "object", additionalProperties: true } },
    number: { type: "boolean" },
  },
});
