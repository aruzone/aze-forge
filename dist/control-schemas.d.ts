import type { JsonValue } from "./model.js";
/**
 * Engineering diagrams family contract constants (issue #65). One identity,
 * version and body-syntax pair per directive, plus the published source and
 * data JSON Schemas. The schemas are descriptive artifacts: validation is
 * hand-rolled in `control.ts` and `free-body.ts`, and the registry only
 * requires an object schema with an `$id`.
 */
export declare const CONTROL_PLUGIN_TYPE: "control";
export declare const CONTROL_PLUGIN_VERSION: "1.0.0";
export declare const CONTROL_BODY_SYNTAX_ID: "azeforge.control/v1";
export declare const CONTROL_BODY_SYNTAX_VERSION: "1.0.0";
export declare const FREE_BODY_PLUGIN_TYPE: "free-body";
export declare const FREE_BODY_PLUGIN_VERSION: "1.0.0";
export declare const FREE_BODY_BODY_SYNTAX_ID: "azeforge.free-body/v1";
export declare const FREE_BODY_BODY_SYNTAX_VERSION: "1.0.0";
/** Versions carried into the rendering fingerprint by the dependency closures. */
export declare const CONTROL_LAYOUT_VERSION: "control-layout/v1";
export declare const CONTROL_EVALUATOR_VERSION: "control-eval/v1";
export declare const CONTROL_EMITTER_VERSION: "1.0.0";
export declare const CONTROL_OPTIONS_VERSION: "control-options/v1";
export declare const FREE_BODY_EVALUATOR_VERSION: "free-body-eval/v1";
export declare const FREE_BODY_EMITTER_VERSION: "1.0.0";
export declare const FREE_BODY_SCALE_POLICY_VERSION: "free-body-scale/v1";
export declare const controlSourceSchema: JsonValue;
export declare const controlDataSchema: JsonValue;
export declare const freeBodySourceSchema: JsonValue;
export declare const freeBodyDataSchema: JsonValue;
