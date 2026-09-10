import type { JsonValue } from "./model.js";

/** Pure chemistry family contract constants: no Node imports, no engine initialization. */

export const FORMULA_PLUGIN_TYPE = "formula" as const;
export const FORMULA_PLUGIN_VERSION = "1.0.0" as const;
export const FORMULA_BODY_SYNTAX_ID = "azeforge.formula/v1" as const;
export const FORMULA_BODY_SYNTAX_VERSION = "1.0.0" as const;

export const REACTION_PLUGIN_TYPE = "reaction" as const;
export const REACTION_PLUGIN_VERSION = "1.0.0" as const;
export const REACTION_BODY_SYNTAX_ID = "azeforge.reaction/v1" as const;
export const REACTION_BODY_SYNTAX_VERSION = "1.0.0" as const;

export const STRUCTURE_PLUGIN_TYPE = "structure" as const;
export const STRUCTURE_PLUGIN_VERSION = "1.0.0" as const;
export const STRUCTURE_BODY_SYNTAX_ID = "azeforge.structure/v1" as const;
export const STRUCTURE_BODY_SYNTAX_VERSION = "1.0.0" as const;

/** Project-owned SVG emitter version (contract §7, plot/geometry emission reuse). */
export const CHEMISTRY_EMITTER_VERSION = "1.0.2" as const;

export const formulaSourceSchema: JsonValue = Object.freeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "azeforge.formula/source/v1",
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    number: { type: "boolean" },
  },
});

export const formulaDataSchema: JsonValue = Object.freeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "azeforge.formula/data/v1",
  type: "object",
  additionalProperties: false,
  required: ["kind", "expression", "units", "pluginVersion"],
  properties: {
    kind: { const: "formula" },
    pluginVersion: { const: FORMULA_PLUGIN_VERSION },
    id: { type: "string" },
    number: { type: "boolean" },
    expression: { type: "string" },
    units: { type: "array" },
  },
});

export const reactionSourceSchema: JsonValue = Object.freeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "azeforge.reaction/source/v1",
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    number: { type: "boolean" },
    above: { type: "string" },
    below: { type: "string" },
    balance: { type: "string", enum: ["none", "check"] },
  },
});

export const reactionDataSchema: JsonValue = Object.freeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "azeforge.reaction/data/v1",
  type: "object",
  additionalProperties: false,
  required: ["kind", "arrow", "reactants", "products", "pluginVersion"],
  properties: {
    kind: { const: "reaction" },
    pluginVersion: { const: REACTION_PLUGIN_VERSION },
    id: { type: "string" },
    number: { type: "boolean" },
    above: { type: "string" },
    below: { type: "string" },
    balance: { type: "string", enum: ["none", "check"] },
    arrow: { type: "string", enum: ["->", "<-", "<->"] },
    reactants: { type: "array" },
    products: { type: "array" },
  },
});

export const structureSourceSchema: JsonValue = Object.freeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "azeforge.structure/source/v1",
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    number: { type: "boolean" },
    width: { type: "number" },
    height: { type: "number" },
  },
});

export const structureDataSchema: JsonValue = Object.freeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "azeforge.structure/data/v1",
  type: "object",
  additionalProperties: false,
  required: ["kind", "atoms", "bonds", "pluginVersion"],
  properties: {
    kind: { const: "structure" },
    pluginVersion: { const: STRUCTURE_PLUGIN_VERSION },
    id: { type: "string" },
    number: { type: "boolean" },
    width: { type: "number" },
    height: { type: "number" },
    atoms: { type: "array" },
    bonds: { type: "array" },
    labels: { type: "array" },
  },
});
