import type { JsonValue } from "./model.js";
/**
 * Software and data models family contract constants (issue #61). One
 * greenfield Plugin per directive, four diagnostic namespaces, no Node
 * imports and no engine initialization: the schemas travel with the registry
 * and are published, never executed.
 */
export declare const SEQUENCE_PLUGIN_TYPE: "sequence";
export declare const SEQUENCE_PLUGIN_VERSION: "1.0.0";
export declare const SEQUENCE_BODY_SYNTAX_ID: "azeforge.sequence/v1";
export declare const SEQUENCE_BODY_SYNTAX_VERSION: "1.0.0";
export declare const STATE_PLUGIN_TYPE: "state";
export declare const STATE_PLUGIN_VERSION: "1.0.0";
export declare const STATE_BODY_SYNTAX_ID: "azeforge.state/v1";
export declare const STATE_BODY_SYNTAX_VERSION: "1.0.0";
export declare const ENTITY_PLUGIN_TYPE: "entity";
export declare const ENTITY_PLUGIN_VERSION: "1.0.0";
export declare const ENTITY_BODY_SYNTAX_ID: "azeforge.entity/v1";
export declare const ENTITY_BODY_SYNTAX_VERSION: "1.0.0";
export declare const CLASS_PLUGIN_TYPE: "class";
export declare const CLASS_PLUGIN_VERSION: "1.0.0";
export declare const CLASS_BODY_SYNTAX_ID: "azeforge.class/v1";
export declare const CLASS_BODY_SYNTAX_VERSION: "1.0.0";
export declare const sequenceSourceSchema: JsonValue;
export declare const sequenceDataSchema: JsonValue;
export declare const stateSourceSchema: JsonValue;
export declare const stateDataSchema: JsonValue;
export declare const entitySourceSchema: JsonValue;
export declare const entityDataSchema: JsonValue;
export declare const classSourceSchema: JsonValue;
export declare const classDataSchema: JsonValue;
