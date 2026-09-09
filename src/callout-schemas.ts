import type { JsonValue } from "./model.js";

/** Pure plugin contract constants: no Node imports, no engine initialization. */

export const CALLOUT_PLUGIN_TYPE = "callout" as const;
export const CALLOUT_PLUGIN_VERSION = "1.0.0" as const;
export const CALLOUT_BODY_SYNTAX_ID = "azeforge.callout-markdown/v1" as const;
export const CALLOUT_BODY_SYNTAX_VERSION = "1.0.0" as const;
export const CALLOUT_VARIANTS = Object.freeze([
  "note",
  "tip",
  "important",
  "warning",
  "caution",
] as const);
export const calloutSourceSchema: JsonValue = Object.freeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "azeforge.callout/source/v1",
  type: "object",
  additionalProperties: false,
  properties: {
    id: {
      type: "string",
      pattern: "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$",
    },
    variant: { type: "string", enum: [...CALLOUT_VARIANTS] },
    title: { type: "string", minLength: 1, maxLength: 500 },
  },
});
export const calloutDataSchema: JsonValue = Object.freeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "azeforge.callout/data/v1",
  type: "object",
  additionalProperties: false,
  required: ["variant", "pluginVersion"],
  properties: {
    kind: { const: "callout" },
    variant: { type: "string", enum: [...CALLOUT_VARIANTS] },
    pluginVersion: { const: "1.0.0" },
  },
});
