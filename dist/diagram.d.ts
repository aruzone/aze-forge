/**
 * Native general diagrams (contract: issue #60 "Define native general diagram
 * semantics and layout").
 *
 * One `:::: diagram` Block carries a single flat ordered declaration list of
 * nodes, groups and edges over one Block-local name namespace. A node may
 * declare nested ports; an edge endpoint names a node or a qualified
 * `node.port`. The mode selects structural validation and the layout regime,
 * and `flow` selects the layout direction, so both are recorded on the Block
 * rather than left to the renderer.
 *
 * Nothing here measures, lays out or renders: this module validates authored
 * source, resolves references two-pass (forward references are legal for
 * `parent:` and for edge endpoints) and publishes one frozen `DiagramBlock`.
 *
 * Diagnostics posture: the family registers one error per structural fault,
 * and four warnings that describe the shape of a valid Block. Warnings are
 * computed only when the declaration list is sound, because an error
 * publishes no DiagramBlock and a warning about a graph that was never built
 * is noise.
 */
import type { AzeBlockPlugin, Diagnostic, DiagramBlock, SourceRange } from "./model.js";
export interface DiagramInputLine {
    readonly text: string;
    readonly range: SourceRange;
}
export declare const MAX_DIAGRAM_DECLARATIONS = 512;
export declare const MAX_DIAGRAM_NODES = 128;
export declare const MAX_DIAGRAM_EDGES = 256;
export declare const MAX_DIAGRAM_GROUPS = 32;
export declare const MAX_DIAGRAM_GROUP_DEPTH = 4;
export declare const MAX_DIAGRAM_PORTS_PER_NODE = 12;
export declare const MAX_DIAGRAM_PORTS = 128;
export declare const MAX_DIAGRAM_PARALLEL_EDGES = 4;
export declare const MAX_DIAGRAM_LABEL_CODE_POINTS = 500;
export declare const MAX_DIAGRAM_LABEL_LINES = 8;
export declare const MAX_DIAGRAM_TOTAL_LABEL_CODE_POINTS = 16384;
export declare const MODES: readonly ["flowchart", "graph", "tree", "architecture"];
export declare const SHAPES: readonly ["rectangle", "rounded", "diamond", "parallelogram", "circle", "hexagon", "cylinder"];
export declare const SIDES: readonly ["left", "right", "top", "bottom"];
export declare const FLOWS: readonly ["top-to-bottom", "bottom-to-top", "left-to-right", "right-to-left"];
export declare const DIRECTIONS: readonly ["directed", "undirected"];
export declare const DECLARATION_KINDS: readonly ["node", "group", "edge"];
/** Header keys `validateDiagramBlock` reads by name (the family's closed set). */
export declare const DIAGRAM_HEADER_FIELDS: readonly ["id", "number", "title", "description", "mode", "flow"];
export declare const NODE_FIELDS: readonly string[];
export declare const GROUP_FIELDS: readonly string[];
export declare const EDGE_FIELDS: readonly string[];
export declare const PORT_FIELDS: readonly string[];
export interface DiagramValidationOptions {
    readonly headerLines: readonly DiagramInputLine[];
    readonly bodyLines: readonly DiagramInputLine[];
    readonly blockRange: SourceRange;
    readonly sourceName?: string;
}
export declare function validateDiagramBlock(options: DiagramValidationOptions): {
    readonly block?: DiagramBlock;
    readonly diagnostics: readonly Diagnostic[];
};
export declare const diagramPlugin: AzeBlockPlugin;
