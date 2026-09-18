import type { AzeBlockPlugin, CircuitBlock, CircuitComponentKind, Diagnostic, SourceRange } from "./model.js";
export interface CircuitInputLine {
    readonly text: string;
    readonly range: SourceRange;
}
export declare const MAX_CIRCUIT_COMPONENTS = 64;
export declare const MAX_CIRCUIT_NODES = 128;
export declare const MAX_CIRCUIT_RELATIONS = 512;
export declare const MAX_CIRCUIT_ANNOTATIONS = 128;
export declare const HEADER_FIELDS: readonly string[];
export declare const FLOWS: readonly ["left-to-right", "top-to-bottom"];
export declare const NODE_ROLES: readonly ["signal", "reference"];
export declare const CURRENT_DIRECTIONS: readonly ["into", "out"];
export declare const GATE_INPUTS: readonly ["2", "3", "4"];
export declare const ORIENTATIONS: readonly ["left-to-right", "right-to-left", "top-to-bottom", "bottom-to-top"];
export declare const KINDS: readonly ["resistor", "capacitor", "inductor", "voltage-source", "current-source", "diode", "led", "switch", "dependent-source", "op-amp", "bjt", "mosfet", "and", "or", "nand", "nor", "xor", "xnor", "not", "buffer", "mux-2to1", "mux-4to1", "d-flip-flop", "digital-input", "digital-output"];
export type CircuitBodyKind = CircuitComponentKind | "node" | "connect" | "voltage-label" | "current-label";
/** Fields each body record kind accepts (closed vocabulary the validator enforces). */
export declare const FIELDS_BY_KIND: Readonly<Record<CircuitBodyKind, readonly string[]>>;
export declare const MODE_VALUES: Partial<Record<CircuitComponentKind, readonly string[]>>;
export declare function validateCircuitBlock(options: {
    readonly headerLines: readonly CircuitInputLine[];
    readonly bodyLines: readonly CircuitInputLine[];
    readonly blockRange: SourceRange;
    readonly sourceName?: string;
    readonly symbolConvention?: string;
    readonly defaults?: Readonly<Record<string, unknown>>;
}): {
    readonly block?: CircuitBlock;
    readonly diagnostics: readonly Diagnostic[];
};
export declare const circuitPlugin: AzeBlockPlugin;
