import type { JsonValue } from "./model.js";

export const GRAMMAR_SCHEMA_ID = "azeforge.grammar/v1" as const;
export const GRAMMAR_SCHEMA_VERSION = 1 as const;

const fieldValueTypes = [
  "identifier",
  "text",
  "prose",
  "integer",
  "decimal",
  "quantity",
  "boolean",
  "enum",
  "expression",
  "record",
  "record-list",
  "string-list",
  "point-list",
  "name",
] as const;

const field = {
  type: "object",
  required: ["key", "valueType", "required"],
  additionalProperties: false,
  properties: {
    key: { type: "string", minLength: 1 },
    valueType: { enum: [...fieldValueTypes] },
    required: { type: "boolean" },
    values: { type: "array", minItems: 1, items: { type: "string" } },
  },
} as const;

// `record` and `group` nest into each other, so both are built with a bounded
// depth: a record holds groups of records (sequence's `timeline:` section),
// and anything deeper is an open object.
const SCHEMA_NESTING_DEPTH = 3;
const OPEN_OBJECT: JsonValue = { type: "object" };

function groupSchema(depth: number): JsonValue {
  return {
    type: "object",
    required: ["of"],
    additionalProperties: false,
    properties: {
      of: { type: "string", minLength: 1 },
      fields: { type: "array", items: field },
      records:
        depth === 0
          ? { type: "array", items: OPEN_OBJECT }
          : { type: "array", items: recordSchema(depth - 1) },
    },
  };
}

function recordSchema(depth: number): JsonValue {
  return {
    type: "object",
    required: ["kind", "fields"],
    additionalProperties: false,
    properties: {
      kind: { type: "string", minLength: 1 },
      fields: { type: "array", items: field },
      groups:
        depth === 0
          ? { type: "array", items: OPEN_OBJECT }
          : { type: "array", items: groupSchema(depth - 1) },
    },
  };
}

const record = recordSchema(SCHEMA_NESTING_DEPTH);
const group = groupSchema(SCHEMA_NESTING_DEPTH);

const directive = {
  type: "object",
  required: [
    "type",
    "title",
    "pluginVersion",
    "namespace",
    "bodySyntax",
    "header",
    "body",
    "limits",
  ],
  additionalProperties: false,
  properties: {
    type: { type: "string", minLength: 1 },
    title: { type: "string", minLength: 1 },
    pluginVersion: { type: "string", minLength: 1 },
    namespace: { type: "string", minLength: 1 },
    bodySyntax: {
      type: "object",
      required: ["id", "version"],
      additionalProperties: false,
      properties: {
        id: { type: "string", minLength: 1 },
        version: { type: "string", minLength: 1 },
      },
    },
    header: {
      type: "object",
      required: ["separator", "fields"],
      additionalProperties: false,
      properties: {
        separator: { const: "----" },
        fields: { type: "array", items: field },
        groups: { type: "array", items: group },
      },
    },
    body: {
      type: "object",
      required: ["form", "schema"],
      additionalProperties: false,
      properties: {
        form: {
          enum: ["record-list", "keyed-sections", "scalar-lines", "none"],
        },
        recordOpener: { type: "string", minLength: 1 },
        records: { type: "array", items: record },
        fields: { type: "array", items: field },
        groups: { type: "array", items: group },
        schema: { type: "object" },
      },
    },
    limits: { type: "object" },
  },
} as const;

export const grammarJsonSchema: JsonValue = Object.freeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: GRAMMAR_SCHEMA_ID,
  type: "object",
  required: [
    "schema",
    "schemaVersion",
    "tool",
    "azemarkVersions",
    "document",
    "directives",
    "limits",
  ],
  additionalProperties: false,
  properties: {
    schema: { const: GRAMMAR_SCHEMA_ID },
    schemaVersion: { const: 1 },
    tool: {
      type: "object",
      required: ["name", "version"],
      additionalProperties: false,
      properties: {
        name: { const: "azeforge" },
        version: { type: "string", minLength: 1 },
      },
    },
    azemarkVersions: {
      type: "array",
      minItems: 1,
      items: { type: "integer" },
    },
    document: {
      type: "object",
      required: ["frontMatter", "fences", "comments", "identifier"],
      additionalProperties: false,
      properties: {
        frontMatter: {
          type: "object",
          required: ["delimiters", "fields"],
          additionalProperties: false,
          properties: {
            delimiters: { type: "array", items: { type: "string" } },
            fields: { type: "array", items: field },
          },
        },
        fences: {
          type: "object",
          required: ["outer", "nested", "separator", "indent"],
          additionalProperties: false,
          properties: {
            outer: { type: "string" },
            nested: { type: "string" },
            separator: { type: "string" },
            indent: { type: "integer" },
          },
        },
        comments: {
          type: "object",
          required: ["prefix"],
          additionalProperties: false,
          properties: { prefix: { type: "string" } },
        },
        identifier: {
          type: "object",
          required: ["pattern", "scope"],
          additionalProperties: false,
          properties: {
            pattern: { type: "string", minLength: 1 },
            scope: { enum: ["document"] },
          },
        },
      },
    },
    directives: { type: "array", items: directive },
    limits: { type: "object" },
  },
});
