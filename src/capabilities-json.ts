import type { JsonValue } from "./model.js";

export const CAPABILITIES_SCHEMA_ID = "azeforge.capabilities/v1" as const;
export const CAPABILITIES_SCHEMA_VERSION = 1 as const;

const versionPattern =
  "^(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)$";

const availability = { enum: ["unknown", "available", "unavailable"] };

const versionedSchema = {
  type: "object",
  required: ["id", "version"],
  additionalProperties: false,
  properties: {
    id: { type: "string", minLength: 1 },
    version: { type: ["string", "number"] },
  },
};

export const capabilitiesJsonSchema: JsonValue = Object.freeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: CAPABILITIES_SCHEMA_ID,
  type: "object",
  required: [
    "schema",
    "schemaVersion",
    "tool",
    "runtime",
    "commands",
    "source",
    "document",
    "plugins",
    "blockRenderers",
    "renderers",
    "themes",
    "formats",
    "profiles",
    "limits",
    "security",
    "engines",
    "policy",
    "schemas",
  ],
  additionalProperties: false,
  properties: {
    schema: { const: CAPABILITIES_SCHEMA_ID },
    schemaVersion: { const: 1 },
    tool: {
      type: "object",
      required: ["name", "version"],
      additionalProperties: false,
      properties: {
        name: { const: "azeforge" },
        version: { type: "string", pattern: versionPattern },
      },
    },
    runtime: {
      type: "object",
      required: ["node", "os", "canonical"],
      additionalProperties: false,
      properties: {
        node: {
          type: "object",
          required: ["supported", "canonical"],
          additionalProperties: false,
          properties: {
            supported: { const: [22, 24] },
            canonical: { const: 24 },
          },
        },
        os: {
          type: "object",
          required: ["supported", "canonical"],
          additionalProperties: false,
          properties: {
            supported: { const: ["ubuntu", "macos", "windows"] },
            canonical: { const: "ubuntu" },
          },
        },
        canonical: {
          type: "object",
          required: ["os", "arch", "node"],
          additionalProperties: false,
          properties: {
            os: { const: "ubuntu" },
            arch: { const: "x64" },
            node: { const: 24 },
          },
        },
      },
    },
    commands: {
      type: "array",
      minItems: 7,
      maxItems: 7,
      items: {
        type: "object",
        required: ["name", "summary", "usage"],
        additionalProperties: false,
        properties: {
          name: { type: "string", minLength: 1 },
          summary: { type: "string", minLength: 1 },
          usage: { type: "string", minLength: 1 },
        },
      },
    },
    source: {
      type: "object",
      required: ["azemarkVersions", "extension", "mimeType"],
      additionalProperties: false,
      properties: {
        azemarkVersions: {
          type: "array",
          minItems: 1,
          items: { type: "integer", minimum: 1 },
        },
        extension: { type: "string", minLength: 1 },
        mimeType: { type: "string", minLength: 1 },
      },
    },
    document: {
      type: "object",
      required: ["schemaVersions", "mimeType"],
      additionalProperties: false,
      properties: {
        schemaVersions: {
          type: "array",
          minItems: 1,
          items: { type: "integer", minimum: 1 },
        },
        mimeType: { type: "string", minLength: 1 },
      },
    },
    plugins: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["type", "version", "title", "namespace", "bodySyntax"],
        additionalProperties: false,
        properties: {
          type: { type: "string", minLength: 1 },
          version: { type: "string", pattern: versionPattern },
          title: { type: "string", minLength: 1 },
          namespace: { type: "string", minLength: 1 },
          bodySyntax: {
            type: "object",
            required: ["id", "version"],
            additionalProperties: false,
            properties: {
              id: { type: "string", minLength: 1 },
              version: { type: "string", pattern: versionPattern },
            },
          },
        },
      },
    },
    blockRenderers: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["id", "version", "blockType", "renderer"],
        additionalProperties: false,
        properties: {
          id: { type: "string", minLength: 1 },
          version: { type: "string", pattern: versionPattern },
          blockType: { type: "string", minLength: 1 },
          renderer: { type: "string", minLength: 1 },
        },
      },
    },
    renderers: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["id", "version", "formats", "capabilities"],
        additionalProperties: false,
        properties: {
          id: { type: "string", minLength: 1 },
          version: { type: "string", pattern: versionPattern },
          formats: {
            type: "array",
            minItems: 1,
            items: { type: "string", minLength: 1 },
          },
          capabilities: {
            type: "array",
            items: { type: "string", minLength: 1 },
          },
        },
      },
    },
    themes: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["id", "version", "title", "colorScheme"],
        additionalProperties: false,
        properties: {
          id: { type: "string", minLength: 1 },
          version: { type: "string", pattern: versionPattern },
          title: { type: "string", minLength: 1 },
          colorScheme: { enum: ["light", "dark"] },
        },
      },
    },
    formats: {
      type: "array",
      minItems: 1,
      items: { type: "string", minLength: 1 },
    },
    profiles: { type: "object" },
    limits: { type: "object" },
    security: { type: "object" },
    engines: {
      type: "object",
      required: ["browser", "katex", "mermaid", "fonts"],
      additionalProperties: false,
      properties: {
        browser: {
          type: "object",
          required: ["name", "pinnedVersion", "availability"],
          additionalProperties: false,
          properties: {
            name: { type: "string", minLength: 1 },
            pinnedVersion: { type: "string", minLength: 1 },
            availability,
            reason: { type: "string", minLength: 1 },
            remedy: { type: "string", minLength: 1 },
          },
        },
        katex: {
          type: "object",
          required: ["version", "availability"],
          additionalProperties: false,
          properties: {
            version: { type: "string", minLength: 1 },
            availability,
          },
        },
        mermaid: {
          type: "object",
          required: ["version", "availability"],
          additionalProperties: false,
          properties: {
            version: { type: "string", minLength: 1 },
            availability,
          },
        },
        fonts: { type: "array", items: { type: "object" } },
      },
    },
    policy: { type: "object" },
    schemas: {
      type: "array",
      minItems: 1,
      items: versionedSchema,
    },
  },
});
