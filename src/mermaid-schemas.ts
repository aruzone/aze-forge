import type { JsonValue } from "./model.js";

/** Pure plugin contract constants: no Node imports, no engine initialization. */

export const MERMAID_PLUGIN_TYPE = "mermaid" as const;
export const MERMAID_PLUGIN_VERSION = "1.0.0" as const;
export const MERMAID_BODY_SYNTAX_ID = "azeforge.mermaid/v1" as const;
export const MERMAID_BODY_SYNTAX_VERSION = "1.0.0" as const;
/** Pinned Mermaid version per the HTML-first output decision (#10). */
export const MERMAID_VERSION = "11.17.2" as const;
export const mermaidSourceSchema: JsonValue = Object.freeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "azeforge.mermaid/source/v1",
  type: "object",
  additionalProperties: false,
  properties: {
    id: {
      type: "string",
      pattern: "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$",
    },
    title: { type: "string", minLength: 1, maxLength: 200 },
    description: { type: "string", minLength: 1, maxLength: 1000 },
  },
});
export const mermaidDataSchema: JsonValue = Object.freeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "azeforge.mermaid/data/v1",
  type: "object",
  additionalProperties: false,
  required: ["diagramType", "source", "pluginVersion"],
  properties: {
    kind: { const: "mermaid" },
    diagramType: { type: "string", minLength: 1 },
    source: { type: "string", minLength: 1, maxLength: 8000 },
    pluginVersion: { const: "1.0.0" },
    title: { type: "string", minLength: 1, maxLength: 200 },
    description: { type: "string", minLength: 1, maxLength: 1000 },
  },
});
