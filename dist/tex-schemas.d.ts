import type { JsonValue } from "./model.js";
export declare const TEX_PLUGIN_TYPE: "tex";
export declare const TEX_PLUGIN_VERSION: "1.0.0";
export declare const TEX_BODY_SYNTAX_ID: "azeforge.tex/v1";
export declare const TEX_BODY_SYNTAX_VERSION: "1.0.0";
export declare const TEX_PROFILES: readonly ["circuitikz", "tikz", "pgfplots", "chemfig", "tikz-cd"];
export type TexProfile = (typeof TEX_PROFILES)[number];
export declare const texSourceSchema: JsonValue;
export declare const texDataSchema: JsonValue;
