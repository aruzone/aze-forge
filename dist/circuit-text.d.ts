/**
 * The shared CircuitText inline vocabulary (language contract #52 §7, Circuit
 * contract #62 §7): plain runs plus `_…` subscript and `^…` superscript runs
 * with `{…}` grouping and doubled braces literal. The inherited bans hold
 * here too: line breaks, control characters, and the Markdown/HTML/TeX
 * metacharacters `<`, `>`, backtick and backslash are outside the vocabulary.
 *
 * The vocabulary is shared by the families that quote engineering text; each
 * family supplies its own diagnostic codes, so this module owns only the
 * scan and never a message.
 */
import type { CircuitText } from "./model.js";
export interface ParseCircuitTextOptions {
    /** One authored field value, already trimmed of the field's own syntax. */
    readonly raw: string;
    /** Code-point ceiling for the whole field. */
    readonly limit: number;
    /** The family's `invalid-label` diagnostic. */
    readonly invalid: (message: string) => void;
    /** The family's `limit-exceeded` diagnostic for the field's code points. */
    readonly exceeded: (count: number) => void;
}
/**
 * Parse one bounded inline text field into runs. Returns `undefined` after
 * pushing exactly one diagnostic, so the caller reports nothing twice.
 */
export declare function parseCircuitText(options: ParseCircuitTextOptions): CircuitText | undefined;
/** Flattened text of a parsed run list; used for accessibility and identity. */
export declare function circuitTextValue(text: CircuitText): string;
