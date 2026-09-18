import type { JsonValue } from "./model.js";
/** Pure plugin contract constants: no Node imports, no engine initialization. */
export declare const MERMAID_PLUGIN_TYPE: "mermaid";
export declare const MERMAID_PLUGIN_VERSION: "1.0.0";
export declare const MERMAID_BODY_SYNTAX_ID: "azeforge.mermaid/v1";
export declare const MERMAID_BODY_SYNTAX_VERSION: "1.0.0";
/** Pinned Mermaid version per the HTML-first output decision (#10). */
export declare const MERMAID_VERSION: "11.17.2";
export declare const mermaidSourceSchema: JsonValue;
export declare const mermaidDataSchema: JsonValue;
