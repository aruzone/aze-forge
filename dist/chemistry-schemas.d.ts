import type { JsonValue } from "./model.js";
/** Pure chemistry family contract constants: no Node imports, no engine initialization. */
export declare const FORMULA_PLUGIN_TYPE: "formula";
export declare const FORMULA_PLUGIN_VERSION: "1.0.0";
export declare const FORMULA_BODY_SYNTAX_ID: "azeforge.formula/v1";
export declare const FORMULA_BODY_SYNTAX_VERSION: "1.0.0";
export declare const REACTION_PLUGIN_TYPE: "reaction";
export declare const REACTION_PLUGIN_VERSION: "1.0.0";
export declare const REACTION_BODY_SYNTAX_ID: "azeforge.reaction/v1";
export declare const REACTION_BODY_SYNTAX_VERSION: "1.0.0";
export declare const STRUCTURE_PLUGIN_TYPE: "structure";
export declare const STRUCTURE_PLUGIN_VERSION: "1.0.0";
export declare const STRUCTURE_BODY_SYNTAX_ID: "azeforge.structure/v1";
export declare const STRUCTURE_BODY_SYNTAX_VERSION: "1.0.0";
/** Project-owned SVG emitter version (contract §7, plot/geometry emission reuse). */
export declare const CHEMISTRY_EMITTER_VERSION: "1.0.4";
/** Formula header keys, in the order the Source schema declares them. */
export declare const FORMULA_HEADER_FIELDS: readonly ["id", "number"];
export declare const formulaSourceSchema: JsonValue;
export declare const formulaDataSchema: JsonValue;
/** Reaction header keys, in the order the Source schema declares them. */
export declare const REACTION_HEADER_FIELDS: readonly ["id", "number", "above", "below", "balance"];
export declare const reactionSourceSchema: JsonValue;
export declare const reactionDataSchema: JsonValue;
/** Structure header keys, in the order the Source schema declares them. */
export declare const STRUCTURE_HEADER_FIELDS: readonly ["id", "number", "width", "height"];
export declare const structureSourceSchema: JsonValue;
export declare const structureDataSchema: JsonValue;
