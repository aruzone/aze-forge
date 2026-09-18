/**
 * Native software- and data-model layout (contract: issue #61 §11).
 *
 * One deterministic projection from each validated model Block to measured
 * geometry, over the Advance metric and the Theme's `models` tokens. Nothing
 * is authored as a dimension: every box sizes to its wrapped content, every
 * lane takes its pitch from the widest lane header, and every rank comes from
 * a graph distance, so two runs on the same Block produce identical numbers.
 *
 * Three things this module owns:
 *
 * - measurement: text is wrapped at the Theme's `wrapWidthPx` and measured
 *   through the pinned Advance metric, never through a font the compiler
 *   cannot observe;
 * - projection: authored order is the only tie-break, ids are positional, and
 *   every stored number is quantized to three decimals;
 * - totality: every valid Block lays out — an unresolved reference narrows
 *   what is drawn, never whether the Block renders.
 *
 * The returned geometry carries everything the emitter needs: the emitter
 * never re-measures a string and never derives a coordinate. Decoration is
 * typed `ariaHidden: true`, so the accessibility floor is enforced by the
 * return type rather than by the caller's discipline.
 */
import type { ClassBlock, EntityBlock, SequenceBlock, StateBlock, StateTransition, Theme } from "./model.js";
export declare const MODELS_LAYOUT_VERSION: "models-layout/v1";
export declare const MODELS_WRAP_VERSION: "models-wrap/v1";
/**
 * The closed semantic role of every primitive. Geometry never names a CSS
 * class: the emitter maps these roles and marker kinds to the frozen
 * `aze-*` vocabulary, so a Theme or a stylesheet can change without the
 * projection changing at all.
 */
export type ModelsRole = "participant" | "participant-name" | "participant-label" | "actor-head" | "actor-limb" | "lifeline" | "activation" | "message-sync" | "message-async" | "message-return" | "self-message-sync" | "self-message-async" | "self-message-return" | "message-label" | "note" | "note-label" | "fragment" | "fragment-tab" | "fragment-division" | "fragment-label" | "fragment-condition" | "state" | "state-name" | "state-label" | "composite" | "composite-title" | "state-divider" | "initial" | "final" | "final-inner" | "transition" | "transition-label" | "entity" | "entity-header" | "entity-divider" | "entity-name" | "entity-label" | "entity-attribute" | "entity-optional" | "entity-key" | "entity-relationship" | "entity-cardinality" | "entity-role" | "entity-relationship-label" | "class" | "class-header" | "class-header-interface" | "class-divider" | "class-name" | "class-abstract-name" | "class-label" | "class-stereotype" | "class-member" | "class-static-member" | "class-visibility" | "class-multiplicity" | "class-relationship-label" | "class-relationship-inheritance" | "class-relationship-implementation" | "class-relationship-association" | "class-relationship-aggregation" | "class-relationship-composition";
/** Marker shapes; `diamond-hollow` and `diamond-filled` are distinct claims. */
export type ModelsMarkerKind = "arrow" | "triangle" | "diamond-hollow" | "diamond-filled" | "none";
export type ModelsLayoutKind = "sequence" | "state" | "entity" | "class";
export interface ModelsLayoutPoint {
    readonly x: number;
    readonly y: number;
}
export interface ModelsLayoutBox {
    readonly kind: "box";
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    /** `0` for a square corner. */
    readonly cornerRadiusPx: number;
    readonly role: ModelsRole;
    readonly ariaHidden: true;
}
/**
 * A box with a title band: a composite state, an entity or a classifier. The
 * band separator and every further section separator are horizontal offsets
 * from `y`, so the emitter draws them without knowing what they divide.
 */
export interface ModelsLayoutNestedBox {
    readonly kind: "nested-box";
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly cornerRadiusPx: number;
    readonly headerHeightPx: number;
    readonly dividerYs: readonly number[];
    readonly role: ModelsRole;
    readonly headerRole: ModelsRole;
    readonly dividerRole: ModelsRole;
    readonly ariaHidden: true;
}
/** A filled initial dot, or a bullseye when `innerRadiusPx` is above zero. */
export interface ModelsLayoutCircle {
    readonly kind: "circle";
    readonly cx: number;
    readonly cy: number;
    readonly radiusPx: number;
    readonly innerRadiusPx: number;
    readonly role: ModelsRole;
    /** Absent when the circle carries no filled core. */
    readonly innerRole?: ModelsRole;
    readonly ariaHidden: true;
}
/**
 * One orthogonal route: a lifeline, a message, a transition, a relationship
 * or a stick-figure limb. `markerKind` and `markerEnd` place its marker.
 */
export interface ModelsLayoutPath {
    readonly kind: "path";
    readonly points: readonly ModelsLayoutPoint[];
    readonly closed: boolean;
    readonly marker: "arrow" | "diamond" | "none";
    readonly markerEnd: "start" | "end";
    readonly markerSizePx: number;
    /** Shape of the marker: the emitter maps it, with the role, to a class. */
    readonly markerKind: ModelsMarkerKind;
    readonly dashed: boolean;
    readonly role: ModelsRole;
    readonly ariaHidden: true;
}
/** An activation bar on a lifeline. */
export interface ModelsLayoutBar {
    readonly kind: "bar";
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly role: ModelsRole;
    readonly ariaHidden: true;
}
/** A note, as the five-point outline of its clipped corner. */
export interface ModelsLayoutNote {
    readonly kind: "note";
    readonly points: readonly ModelsLayoutPoint[];
    readonly role: ModelsRole;
    readonly ariaHidden: true;
}
/** A combined-fragment frame: the frame, its operator tab and its divisions. */
export interface ModelsLayoutFragment {
    readonly kind: "fragment";
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly tabWidthPx: number;
    readonly tabHeightPx: number;
    /** Absolute y of every division separator, after the first division. */
    readonly divisionYs: readonly number[];
    readonly role: ModelsRole;
    readonly tabRole: ModelsRole;
    readonly divisionRole: ModelsRole;
    readonly ariaHidden: true;
}
export interface ModelsLayoutText {
    readonly kind: "text";
    readonly x: number;
    readonly y: number;
    readonly text: string;
    readonly anchor: "start" | "middle" | "end";
    readonly role: ModelsRole;
    /**
     * `true` only for text that repeats decoration. Every authored field and
     * every semantics-bearing marker stays readable.
     */
    readonly ariaHidden: boolean;
}
export interface ModelsLayoutGeometry {
    readonly widthPx: number;
    readonly heightPx: number;
    readonly boxes: readonly ModelsLayoutBox[];
    readonly nestedBoxes: readonly ModelsLayoutNestedBox[];
    readonly circles: readonly ModelsLayoutCircle[];
    readonly paths: readonly ModelsLayoutPath[];
    readonly bars: readonly ModelsLayoutBar[];
    readonly notes: readonly ModelsLayoutNote[];
    readonly fragments: readonly ModelsLayoutFragment[];
    readonly texts: readonly ModelsLayoutText[];
}
export interface SequenceLayout extends ModelsLayoutGeometry {
    readonly kind: "sequence";
}
export interface StateLayout extends ModelsLayoutGeometry {
    readonly kind: "state";
}
export interface EntityLayout extends ModelsLayoutGeometry {
    readonly kind: "entity";
}
export interface ClassLayout extends ModelsLayoutGeometry {
    readonly kind: "class";
}
export type ModelsLayout = SequenceLayout | StateLayout | EntityLayout | ClassLayout;
/**
 * Wrap one authored field to `maxWidthPx`.
 *
 * Whitespace runs separate words; a word that alone exceeds the limit is
 * hard-broken at code-point boundaries, so no line is ever wider than the
 * limit unless a single code point is. No code point of a word is dropped,
 * and no hyphen is ever invented. The result always holds at least one line.
 */
export declare function wrapText(text: string, maxWidthPx: number, fontSizePx: number): readonly string[];
/**
 * Effective models typography: the Theme's four sets raised to its declared
 * minimum readable size, with a line never shorter than its own text. Layout
 * and the layout CSS read this one derivation, so the measured box and the
 * drawn text cannot disagree. The caption and marker sets carry no line
 * height of their own; they take the pitch of the set they annotate.
 */
export interface ModelsLabelTypography {
    readonly labelFontSizePx: number;
    readonly labelLineHeightPx: number;
    readonly memberFontSizePx: number;
    readonly memberLineHeightPx: number;
    readonly captionFontSizePx: number;
    readonly captionLineHeightPx: number;
    readonly markerFontSizePx: number;
    readonly markerLineHeightPx: number;
}
export declare function modelsLabelTypography(theme: Theme): ModelsLabelTypography;
/**
 * The composed transition label: trigger, guard in brackets, action after a
 * slash, in that order, each omitted when unauthored. Layout, the emitter's
 * `<desc>` and the drawn `<text>` all read this one composition.
 */
export declare function transitionLabelText(transition: StateTransition): string;
/**
 * One sequence figure: lanes in participant order at the pitch of the widest
 * lane header, timeline rows in item order, fragment frames spanning their own
 * items, activation bars spanning their open and close messages, and notes
 * spanning the lanes they name.
 */
export declare function layoutSequence(block: SequenceBlock, theme: Theme): SequenceLayout;
/**
 * One state machine: ranks by longest-path distance from each scope's
 * `initial`, composites nested inside their own box with a title bar,
 * orthogonally routed transitions, an initial filled dot and a final bullseye
 * that show no name.
 */
export declare function layoutState(block: StateBlock, theme: Theme): StateLayout;
/**
 * One entity graph: entities layered by the relationship graph, relationship
 * edges carrying the compact cardinality of each end, its optional role and
 * the relationship label at the middle.
 */
export declare function layoutEntity(block: EntityBlock, theme: Theme): EntityLayout;
/**
 * One class diagram: classifiers ranked by inheritance and implementation
 * depth with supertypes above subtypes, then the association, aggregation and
 * composition edges, and members composed with their parentheses always
 * present.
 */
export declare function layoutClass(block: ClassBlock, theme: Theme): ClassLayout;
