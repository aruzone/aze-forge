/**
 * Native control signal-flow diagrams (contract: issue #65 "Define native
 * control and free-body diagram semantics").
 *
 * One `:::: control` Block carries a single flat ordered declaration list of
 * SISO function blocks, summing junctions, directional boundary stubs and
 * anonymous signal edges over one Block-local name namespace. Summing signs
 * are a bounded domain expression that pairs positionally with a junction's
 * in-edges in authored declaration order, so the sign list is recorded on the
 * Block rather than left to the renderer. Takeoff points are implicit
 * fan-out — two or more out-edges from one item — and are never modelled as
 * entities. Feedback is an ordinary graph shape: the compiler records it and
 * never enforces it.
 *
 * Nothing here measures, lays out or renders: this module validates authored
 * source, resolves references two-pass (forward references are legal for edge
 * endpoints) and publishes one `ControlBlock`.
 *
 * Diagnostics posture: the family registers one error per structural fault and
 * a single warning that describes the shape of a valid Block. Warnings are
 * computed only when the declaration list is sound, because an error publishes
 * no `ControlBlock` and a warning about a graph that was never built is noise.
 */
import type { AzeBlockPlugin, ControlBlock, ControlFlow, Diagnostic, SourceRange } from "./model.js";
export interface ControlInputLine {
    readonly text: string;
    readonly range: SourceRange;
}
export declare const MAX_CONTROL_DECLARATIONS = 256;
export declare const MAX_CONTROL_BLOCKS = 64;
export declare const MAX_CONTROL_SUMS = 32;
export declare const MAX_CONTROL_STUBS = 32;
export declare const MAX_CONTROL_EDGES = 128;
export declare const MAX_CONTROL_SIGNS_PER_SUM = 8;
export declare const MAX_CONTROL_LABEL_CODE_POINTS = 500;
export declare const MAX_CONTROL_TOTAL_LABEL_CODE_POINTS = 16384;
/** The versioned built-in `flow:` value; omission carries no information. */
export declare const DEFAULT_CONTROL_FLOW: ControlFlow;
export declare const FLOWS: readonly ["top-to-bottom", "bottom-to-top", "left-to-right", "right-to-left"];
export declare const SIGNS: readonly ["+", "-"];
export declare const DECLARATION_KINDS: readonly ["block", "sum", "input", "output", "edge"];
export declare const HEADER_FIELDS: readonly string[];
export declare const BLOCK_FIELDS: readonly string[];
export declare const SUM_FIELDS: readonly string[];
export declare const STUB_FIELDS: readonly string[];
export declare const EDGE_FIELDS: readonly string[];
export interface ControlValidationOptions {
    readonly headerLines: readonly ControlInputLine[];
    readonly bodyLines: readonly ControlInputLine[];
    readonly blockRange: SourceRange;
    readonly sourceName?: string;
}
/**
 * Validate one `:::: control` Block: read the registered header properties,
 * read the flat declaration list, resolve the Block-local namespace and
 * publish a `ControlBlock`. Returns diagnostics alone when the declaration
 * list is empty or carries any error, because an invalid Block is never
 * partially published.
 */
export declare function validateControlBlock(options: ControlValidationOptions): {
    readonly block?: ControlBlock;
    readonly diagnostics: readonly Diagnostic[];
};
export declare const controlPlugin: AzeBlockPlugin;
