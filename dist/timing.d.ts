/**
 * Native digital timing family (contract: issue #63 "Define native digital
 * timing semantics and authoring").
 *
 * One `:::: timing` Block carries a single scale — an integer cycle grid
 * starting at zero, or an exact-decimal duration axis in the Block unit.
 * Signals are ordered interval lists over that scale; bus values, groups,
 * markers and arrows are authored display facts. Nothing here evaluates
 * setup, hold or any other timing behavior: arrows and markers describe.
 *
 * Diagnostics posture: the family registers no warnings. Every unsupported
 * or contradictory declaration is an error, and every valid declaration
 * renders.
 */
import type { AzeBlockPlugin, Diagnostic, SourceRange, TimingBlock, TimingIntervalState } from "./model.js";
export interface TimingInputLine {
    readonly text: string;
    readonly range: SourceRange;
}
export declare const MAX_TIMING_SIGNALS = 32;
export declare const MAX_TIMING_INTERVALS = 256;
export declare const MAX_TIMING_TOTAL_INTERVALS = 2048;
export declare const MAX_TIMING_GROUPS = 16;
export declare const MAX_TIMING_GROUP_DEPTH = 2;
export declare const MAX_TIMING_MARKERS = 32;
export declare const MAX_TIMING_ARROWS = 32;
export declare const MAX_TIMING_WAVE_CHARS = 1024;
export declare const MAX_TIMING_TEXT_CODE_POINTS = 32;
export declare const MAX_TIMING_RUN_CODE_POINTS = 256;
export declare const MAX_TIMING_LABEL_CODE_POINTS = 4096;
export declare const MAX_TIMING_SPAN = 512;
export declare const MAX_TIMING_WIDTH = 64;
export declare const HEADER_FIELDS: readonly string[];
export declare const SIGNAL_FIELDS: readonly string[];
/** The body record kinds a timing body accepts, in dispatch order. */
export declare const TIMING_BODY_KINDS: readonly string[];
export declare const GROUP_FIELDS: readonly string[];
export declare const MARKER_FIELDS: readonly string[];
export declare const ARROW_FIELDS: readonly string[];
export declare const INTERVAL_FIELDS: readonly string[];
export declare const TIME_UNITS: readonly string[];
/** Accepted `scale:` spellings, the vocabulary the block validator enforces. */
export declare const SCALE_WORDS: readonly string[];
export declare const STATE_WORDS: Readonly<Record<string, TimingIntervalState>>;
export interface TimingValidationOptions {
    readonly headerLines: readonly TimingInputLine[];
    readonly bodyLines: readonly TimingInputLine[];
    readonly blockRange: SourceRange;
    readonly sourceName?: string;
}
export declare function validateTimingBlock(options: TimingValidationOptions): {
    readonly block?: TimingBlock;
    readonly diagnostics: readonly Diagnostic[];
};
export declare const timingPlugin: AzeBlockPlugin;
