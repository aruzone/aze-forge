/**
 * Native software and data models (contract: issue #61 "Define native software
 * and data model semantics"; implementation: issue #77).
 *
 * Four typed directives share one greenfield Plugin family: `:::: sequence`,
 * `:::: state`, `:::: entity` and `:::: class`. Nothing here measures, lays out
 * or renders; this module reads authored Source, validates it structurally and
 * publishes one frozen Block per directive.
 *
 * Shape: `state`, `entity` and `class` bodies are one bare flat collection of
 * `- kind: …` items with two-space structural indentation; `sequence` is the
 * one directive with two named body sections, `participants:` then `timeline:`,
 * because participant order is lane order and timeline order is time. A nested
 * collection opens on an empty `key:` value and holds either records
 * (`- name: …`) or bare values (`- primary`).
 *
 * Authored text is literal: `trigger:`, `guard:`, `action:`, every `type:` and
 * `return-type:`, `label:`, `role:`, `condition:` and note text are never
 * parsed, type-checked, executed or compared against anything computed. A
 * double-quoted value decodes §4 JSON escapes; everything else is the authored
 * text. Omission is meaning for every `label:`, `text:`, `type:`, `keys:`,
 * `visibility:`, `parameters:`, `return-type:`, `role:`, `condition:`,
 * `references:` and class `from-multiplicity:`/`to-multiplicity:`; omission of
 * `form`, participant `kind`, `optional`, `static` and `abstract` resolves to
 * the registered built-in default.
 *
 * Diagnostics posture: four namespaces — `azeforge.sequence`, `azeforge.state`,
 * `azeforge.entity`, `azeforge.class` — every code sub-ranged to the collection
 * item and field. Structural faults are errors and publish no Block;
 * reachability, dead ends, unused participants, missing primary keys and
 * unrelated classifiers are warnings. A value outside a registered enum or
 * boolean diagnoses as `#unknown-kind` with `data: {field, value}`. An
 * unresolved or duplicate name suppresses every check that consumes it while
 * independent items keep validating.
 */
import type { AzeBlockPlugin, Cardinality, ClassBlock, Diagnostic, EntityBlock, SequenceBlock, SourceRange, StateBlock } from "./model.js";
export interface ModelsInputLine {
    readonly text: string;
    readonly range: SourceRange;
}
export declare const MAX_SEQUENCE_PARTICIPANTS = 12;
export declare const MAX_SEQUENCE_TIMELINE_ITEMS = 256;
export declare const MAX_SEQUENCE_FRAGMENT_DEPTH = 4;
export declare const MAX_SEQUENCE_ALT_DIVISIONS = 8;
export declare const MAX_SEQUENCE_NOTE_SPAN = 2;
export declare const MAX_SEQUENCE_NOTE_TEXT_CHARS = 1000;
export declare const MAX_SEQUENCE_NOTE_TEXT_LINES = 20;
export declare const MAX_MODELS_TEXT_CHARS = 200;
export declare const MAX_MODELS_NAME_CHARS = 64;
export declare const MAX_STATE_STATES = 64;
export declare const MAX_STATE_DEPTH = 3;
export declare const MAX_STATE_TRANSITIONS = 128;
export declare const MAX_ENTITY_ENTITIES = 32;
export declare const MAX_ENTITY_ATTRIBUTES = 64;
export declare const MAX_ENTITY_RELATIONSHIPS = 64;
export declare const MAX_CLASS_CLASSIFIERS = 32;
export declare const MAX_CLASS_ATTRIBUTES = 64;
export declare const MAX_CLASS_OPERATIONS = 64;
export declare const MAX_CLASS_PARAMETERS = 16;
export declare const MAX_CLASS_RELATIONSHIPS = 64;
export declare const HEADER_FIELDS: readonly string[];
export declare const SEQUENCE_SECTIONS: readonly string[];
export declare const PARTICIPANT_FIELDS: readonly string[];
export declare const MESSAGE_FIELDS: readonly string[];
export declare const NOTE_FIELDS: readonly string[];
export declare const ALT_FIELDS: readonly string[];
export declare const DIVISION_FIELDS: readonly string[];
export declare const LOOP_FIELDS: readonly string[];
export declare const PARTICIPANT_KINDS: readonly ["participant", "actor"];
export declare const MESSAGE_FORMS: readonly ["sync", "async", "return"];
export declare const TIMELINE_KINDS: readonly ["message", "alt", "loop", "note"];
export declare const STATE_ITEM_FIELDS: readonly string[];
/** The `initial`/`final` pseudo-state key set: no `label`, no `states`. */
export declare const MODELS_PSEUDO_STATE_FIELDS: readonly string[];
export declare const TRANSITION_FIELDS: readonly string[];
export declare const TOP_LEVEL_STATE_KINDS: readonly ["state", "initial", "final", "transition"];
export declare const NESTED_STATE_KINDS: readonly ["state", "initial", "final"];
export declare const ENTITY_ITEM_FIELDS: readonly string[];
export declare const ATTRIBUTE_FIELDS: readonly string[];
export declare const REFERENCE_FIELDS: readonly string[];
export declare const ENTITY_RELATIONSHIP_FIELDS: readonly string[];
export declare const RELATIONSHIP_END_FIELDS: readonly string[];
export declare const ENTITY_KEYS: readonly ["primary", "foreign", "unique"];
export declare const CLASS_ITEM_FIELDS: readonly string[];
/** The interface key set: no `abstract`, no `attributes`. */
export declare const MODELS_INTERFACE_FIELDS: readonly string[];
export declare const CLASS_ATTRIBUTE_FIELDS: readonly string[];
export declare const OPERATION_FIELDS: readonly string[];
export declare const PARAMETER_FIELDS: readonly string[];
export declare const CLASS_RELATIONSHIP_FIELDS: readonly string[];
export declare const CLASS_ITEM_KINDS: readonly ["class", "interface", "relationship"];
export declare const CLASS_RELATIONSHIP_FORMS: readonly ["inheritance", "implementation", "association", "aggregation", "composition"];
export declare const VISIBILITIES: readonly ["public", "private", "protected", "package"];
export declare const CARDINALITIES: readonly ["one", "zero-or-one", "many", "one-or-many"];
/** Registered display form of one cardinality, rendered at its relationship end. */
export declare function cardinalityDisplay(value: Cardinality): string;
interface BlockEnvelope {
    readonly headerLines: readonly ModelsInputLine[];
    readonly bodyLines: readonly ModelsInputLine[];
    readonly blockRange: SourceRange;
    readonly sourceName?: string;
}
export declare function validateSequenceBlock(options: BlockEnvelope): {
    readonly block?: SequenceBlock;
    readonly diagnostics: readonly Diagnostic[];
};
export declare function validateStateBlock(options: BlockEnvelope): {
    readonly block?: StateBlock;
    readonly diagnostics: readonly Diagnostic[];
};
export declare function validateEntityBlock(options: BlockEnvelope): {
    readonly block?: EntityBlock;
    readonly diagnostics: readonly Diagnostic[];
};
export declare function validateClassBlock(options: BlockEnvelope): {
    readonly block?: ClassBlock;
    readonly diagnostics: readonly Diagnostic[];
};
export declare const sequencePlugin: AzeBlockPlugin;
export declare const statePlugin: AzeBlockPlugin;
export declare const entityPlugin: AzeBlockPlugin;
export declare const classPlugin: AzeBlockPlugin;
export {};
