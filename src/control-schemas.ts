import type { JsonValue } from "./model.js";

/**
 * Engineering diagrams family contract constants (issue #65). One identity,
 * version and body-syntax pair per directive, plus the published source and
 * data JSON Schemas. The schemas are descriptive artifacts: validation is
 * hand-rolled in `control.ts` and `free-body.ts`, and the registry only
 * requires an object schema with an `$id`.
 */

export const CONTROL_PLUGIN_TYPE = "control" as const;
export const CONTROL_PLUGIN_VERSION = "1.0.0" as const;
export const CONTROL_BODY_SYNTAX_ID = "azeforge.control/v1" as const;
export const CONTROL_BODY_SYNTAX_VERSION = "1.0.0" as const;

export const FREE_BODY_PLUGIN_TYPE = "free-body" as const;
export const FREE_BODY_PLUGIN_VERSION = "1.0.0" as const;
export const FREE_BODY_BODY_SYNTAX_ID = "azeforge.free-body/v1" as const;
export const FREE_BODY_BODY_SYNTAX_VERSION = "1.0.0" as const;

/** Versions carried into the rendering fingerprint by the dependency closures. */
export const CONTROL_LAYOUT_VERSION = "control-layout/v1" as const;
export const CONTROL_EVALUATOR_VERSION = "control-eval/v1" as const;
export const CONTROL_EMITTER_VERSION = "1.0.0" as const;
export const CONTROL_OPTIONS_VERSION = "control-options/v1" as const;

export const FREE_BODY_EVALUATOR_VERSION = "free-body-eval/v1" as const;
export const FREE_BODY_EMITTER_VERSION = "1.0.0" as const;
export const FREE_BODY_SCALE_POLICY_VERSION = "free-body-scale/v1" as const;

const HEADER_PROPERTIES: JsonValue = Object.freeze({
  id: { type: "string" },
  number: { type: "boolean" },
  title: { type: "string" },
  description: { type: "string" },
});

export const controlSourceSchema: JsonValue = Object.freeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "azeforge.control/source/v1",
  type: "object",
  additionalProperties: false,
  properties: {
    ...HEADER_PROPERTIES,
    flow: {
      enum: ["top-to-bottom", "bottom-to-top", "left-to-right", "right-to-left"],
    },
  },
});

export const controlDataSchema: JsonValue = Object.freeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "azeforge.control/data/v1",
  type: "object",
  additionalProperties: false,
  required: ["kind", "pluginVersion", "flow", "declarations"],
  properties: {
    kind: { const: "control" },
    pluginVersion: { const: CONTROL_PLUGIN_VERSION },
    id: { type: "string" },
    number: { type: "boolean" },
    title: { type: "array" },
    description: { type: "array" },
    flow: {
      enum: ["top-to-bottom", "bottom-to-top", "left-to-right", "right-to-left"],
    },
    declarations: { type: "array" },
  },
});

export const freeBodySourceSchema: JsonValue = Object.freeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "azeforge.free-body/source/v1",
  type: "object",
  additionalProperties: false,
  properties: {
    ...HEADER_PROPERTIES,
    scale: { type: "string" },
    width: { type: "integer" },
    height: { type: "integer" },
    bounds: {
      type: "object",
      additionalProperties: false,
      properties: {
        "min-x": { type: "string" },
        "min-y": { type: "string" },
        "max-x": { type: "string" },
        "max-y": { type: "string" },
      },
      required: ["min-x", "min-y", "max-x", "max-y"],
    },
  },
});

export const freeBodyDataSchema: JsonValue = Object.freeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "azeforge.free-body/data/v1",
  type: "object",
  additionalProperties: false,
  required: ["kind", "pluginVersion", "width", "height", "declarations"],
  properties: {
    kind: { const: "free-body" },
    pluginVersion: { const: FREE_BODY_PLUGIN_VERSION },
    id: { type: "string" },
    number: { type: "boolean" },
    title: { type: "array" },
    description: { type: "array" },
    scale: { type: "string" },
    width: { type: "integer" },
    height: { type: "integer" },
    bounds: {
      type: "object",
      additionalProperties: false,
      properties: {
        "min-x": { type: "string" },
        "min-y": { type: "string" },
        "max-x": { type: "string" },
        "max-y": { type: "string" },
      },
      required: ["min-x", "min-y", "max-x", "max-y"],
    },
    declarations: { type: "array" },
  },
});
