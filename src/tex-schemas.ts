import type { JsonValue } from "./model.js";

export const TEX_PLUGIN_TYPE = "tex" as const;
export const TEX_PLUGIN_VERSION = "1.0.0" as const;
export const TEX_BODY_SYNTAX_ID = "azeforge.tex/v1" as const;
export const TEX_BODY_SYNTAX_VERSION = "1.0.0" as const;
export const TEX_PROFILES = ["circuitikz", "tikz", "pgfplots", "chemfig", "tikz-cd"] as const;
export type TexProfile = (typeof TEX_PROFILES)[number];

export const texSourceSchema: JsonValue = Object.freeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "azeforge.tex/source/v1",
  type: "object",
  additionalProperties: false,
  required: ["title", "description", "profile"],
  properties: {
    id: { type: "string", pattern: "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$" },
    title: { type: "string", minLength: 1 },
    description: { type: "string", minLength: 1 },
    profile: { enum: [...TEX_PROFILES] },
  },
});
export const texDataSchema: JsonValue = Object.freeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "azeforge.tex/data/v1",
  type: "object",
  additionalProperties: false,
  required: ["kind", "pluginVersion", "title", "description", "profile", "body"],
  properties: {
    kind: { const: "tex" }, pluginVersion: { const: "1.0.0" },
    title: { type: "string", minLength: 1 },
    description: { type: "string", minLength: 1 },
    profile: { enum: [...TEX_PROFILES] }, body: { type: "string", minLength: 1, maxLength: 50000, pattern: "^[\\t\\n\\x20-\\x7e]+$" },
  },
});
