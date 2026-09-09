import type { JsonValue } from "./model.js";

/** Pure plugin contract constants: no Node imports, no engine initialization. */

export const EQUATION_PLUGIN_TYPE = "equation" as const;
export const EQUATION_PLUGIN_VERSION = "1.0.0" as const;
export const EQUATION_BODY_SYNTAX_ID = "azeforge.readable-equation/v1" as const;
export const EQUATION_BODY_SYNTAX_VERSION = "1.0.0" as const;
export const EQUATION_LATEX_LANGUAGE_VERSION = "katex-0.18.5" as const;
export const KATEX_VERSION = "0.18.5" as const;
export const equationSourceSchema: JsonValue = Object.freeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "azeforge.equation/source/v1",
  type: "object",
  additionalProperties: false,
  properties: {
    id: {
      type: "string",
      pattern: "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$",
    },
    number: { type: "boolean" },
    align: { type: "string", enum: ["left", "center", "right"] },
    syntax: { type: "string", enum: ["readable", "latex"] },
  },
});
export const equationDataSchema: JsonValue = Object.freeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "azeforge.equation/data/v1",
  type: "object",
  additionalProperties: false,
  required: ["syntax", "source", "tex", "pluginVersion"],
  properties: {
    kind: { const: "equation" },
    syntax: { type: "string", enum: ["readable", "latex"] },
    source: { type: "string", minLength: 1, maxLength: 4000 },
    tex: { type: "string", minLength: 1, maxLength: 4000 },
    pluginVersion: { const: "1.0.0" },
    number: { type: "boolean" },
    align: { type: "string", enum: ["left", "center", "right"] },
  },
});
