import type { JsonValue } from "./model.js";
/** Pure plugin contract constants: no Node imports, no engine initialization. */
export declare const BIBLIOGRAPHY_PLUGIN_TYPE: "bibliography";
export declare const BIBLIOGRAPHY_PLUGIN_VERSION: "1.0.0";
export declare const BIBLIOGRAPHY_BODY_SYNTAX_ID: "azeforge.bibliography/v1";
export declare const BIBLIOGRAPHY_BODY_SYNTAX_VERSION: "1.0.0";
export declare const bibliographySourceSchema: JsonValue;
/**
 * The authored citation records, in declaration order. `worksCited` is the
 * derived composition projection and is deliberately absent here: it never
 * enters content identity (ADR 0007).
 */
export declare const bibliographyDataSchema: JsonValue;
