import {
  ACCEPTANCE_SCHEMA_ID,
  ACCEPTANCE_SCHEMA_VERSION,
} from "./acceptance.js";
import {
  CALLOUT_PLUGIN_VERSION,
  calloutDataSchema,
  calloutSourceSchema,
} from "./callout.js";
import { DIAGNOSTICS_SCHEMA_ID } from "./diagnostics-json.js";
import {
  EQUATION_PLUGIN_VERSION,
  equationDataSchema,
  equationSourceSchema,
} from "./equation.js";
import {
  MERMAID_PLUGIN_VERSION,
  mermaidDataSchema,
  mermaidSourceSchema,
} from "./mermaid.js";
import type { JsonValue } from "./model.js";
import {
  TABLE_PLUGIN_VERSION,
  tableDataSchema,
  tableSourceSchema,
} from "./table.js";
import { TOOL_VERSION } from "./tool-version.js";
import { WATCH_EVENT_SCHEMA_ID } from "./watch-events.js";
import { CAPABILITIES_SCHEMA_ID } from "./capabilities-json.js";

export const VERSION_SCHEMA_ID = "azeforge.version/v1" as const;
export const VERSION_SCHEMA_VERSION = 1 as const;

export interface VersionedSchema {
  readonly id: string;
  readonly version: number | string;
}

function schemaId(schema: JsonValue): string {
  return (schema as { readonly $id: string }).$id;
}

/**
 * Every public machine document schema in canonical order. Source/data
 * schema versions track their owning Plugin version; envelope schemas
 * carry their own schemaVersion.
 */
export function publicSchemaVersions(): readonly VersionedSchema[] {
  return Object.freeze([
    { id: DIAGNOSTICS_SCHEMA_ID, version: 1 },
    { id: CAPABILITIES_SCHEMA_ID, version: 1 },
    { id: VERSION_SCHEMA_ID, version: 1 },
    { id: ACCEPTANCE_SCHEMA_ID, version: ACCEPTANCE_SCHEMA_VERSION },
    { id: WATCH_EVENT_SCHEMA_ID, version: 1 },
    { id: schemaId(equationSourceSchema), version: EQUATION_PLUGIN_VERSION },
    { id: schemaId(equationDataSchema), version: EQUATION_PLUGIN_VERSION },
    { id: schemaId(mermaidSourceSchema), version: MERMAID_PLUGIN_VERSION },
    { id: schemaId(mermaidDataSchema), version: MERMAID_PLUGIN_VERSION },
    { id: schemaId(tableSourceSchema), version: TABLE_PLUGIN_VERSION },
    { id: schemaId(tableDataSchema), version: TABLE_PLUGIN_VERSION },
    { id: schemaId(calloutSourceSchema), version: CALLOUT_PLUGIN_VERSION },
    { id: schemaId(calloutDataSchema), version: CALLOUT_PLUGIN_VERSION },
  ]);
}

export interface VersionReport {
  readonly schema: typeof VERSION_SCHEMA_ID;
  readonly schemaVersion: typeof VERSION_SCHEMA_VERSION;
  readonly tool: Readonly<{ name: "azeforge"; version: typeof TOOL_VERSION }>;
  readonly source: Readonly<{ azemarkVersions: readonly [1] }>;
  readonly document: Readonly<{ schemaVersions: readonly [1] }>;
  readonly schemas: readonly VersionedSchema[];
}

/**
 * Canonical version document. Contains only release versions — never
 * workstation facts such as paths, platforms, or dependency state.
 */
export function createVersionReport(): VersionReport {
  return {
    schema: VERSION_SCHEMA_ID,
    schemaVersion: VERSION_SCHEMA_VERSION,
    tool: { name: "azeforge", version: TOOL_VERSION },
    source: { azemarkVersions: [1] },
    document: { schemaVersions: [1] },
    schemas: publicSchemaVersions(),
  };
}

export const versionJsonSchema: JsonValue = Object.freeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: VERSION_SCHEMA_ID,
  type: "object",
  required: ["schema", "schemaVersion", "tool", "source", "document", "schemas"],
  additionalProperties: false,
  properties: {
    schema: { const: VERSION_SCHEMA_ID },
    schemaVersion: { const: 1 },
    tool: {
      type: "object",
      required: ["name", "version"],
      additionalProperties: false,
      properties: {
        name: { const: "azeforge" },
        version: { type: "string", pattern: "^(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)$" },
      },
    },
    source: {
      type: "object",
      required: ["azemarkVersions"],
      additionalProperties: false,
      properties: {
        azemarkVersions: {
          type: "array",
          minItems: 1,
          items: { type: "integer", minimum: 1 },
        },
      },
    },
    document: {
      type: "object",
      required: ["schemaVersions"],
      additionalProperties: false,
      properties: {
        schemaVersions: {
          type: "array",
          minItems: 1,
          items: { type: "integer", minimum: 1 },
        },
      },
    },
    schemas: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["id", "version"],
        additionalProperties: false,
        properties: {
          id: { type: "string", minLength: 1 },
          version: { type: ["string", "number"] },
        },
      },
    },
  },
});
