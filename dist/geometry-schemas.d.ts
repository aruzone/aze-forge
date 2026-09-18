import type { JsonValue } from "./model.js";
/** Pure plugin contract constants: no Node imports, no engine initialization. */
export declare const GEOMETRY_PLUGIN_TYPE: "geometry";
export declare const GEOMETRY_PLUGIN_VERSION: "1.0.0";
export declare const GEOMETRY_BODY_SYNTAX_ID: "azeforge.geometry/v1";
export declare const GEOMETRY_BODY_SYNTAX_VERSION: "1.0.0";
/** Bounded construction evaluator version (contract §4, §9). */
export declare const GEOMETRY_EVAL_VERSION: "geometry-eval/v1";
/** Project-owned SVG emitter version (contract §9, plots emission reuse). */
export declare const GEOMETRY_EMITTER_VERSION: "1.0.0";
/** Registered relative epsilon governing every geometric predicate. */
export declare const GEOMETRY_EPSILON = 1e-9;
export declare const geometrySourceSchema: JsonValue;
export declare const geometryDataSchema: JsonValue;
