import type { JsonValue } from "./model.js";
/** Pure plugin contract constants: no Node imports, no engine initialization. */
export declare const CALLOUT_PLUGIN_TYPE: "callout";
export declare const CALLOUT_PLUGIN_VERSION: "1.0.0";
export declare const CALLOUT_BODY_SYNTAX_ID: "azeforge.callout-markdown/v1";
export declare const CALLOUT_BODY_SYNTAX_VERSION: "1.0.0";
export declare const CALLOUT_VARIANTS: readonly ["note", "tip", "important", "warning", "caution"];
/** Header keys the callout envelope accepts before the `----` separator. */
export declare const CALLOUT_HEADER_FIELDS: readonly ["id", "variant", "title"];
export declare const calloutSourceSchema: JsonValue;
export declare const calloutDataSchema: JsonValue;
