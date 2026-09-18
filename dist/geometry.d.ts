/**
 * Native geometry constructions and measurements (catalog Geometry family,
 * contract #59).
 *
 * One `:::: geometry` directive: an ordered backward-only declaration graph
 * over a y-up unitless exact-decimal frame. Construction intent lives in the
 * graph forever; resolved coordinates are renderer-derived and never hashed.
 * Rendering reuses the plots' owned SVG emission layer (fixed attribute
 * order, deterministic ids, quantized 3-decimal ASCII formatter, no text
 * measurement). Construction math is arithmetic plus `Math.sqrt`;
 * trigonometry appears only in arc parametrization and angle measures.
 */
import type { AzeBlockPlugin, AzeBlockRenderer, BlockRendererContext, Diagnostic, GeometryBlock, JsonValue, SourceRange } from "./model.js";
export declare const MAX_GEOMETRY_DECLARATIONS = 256;
export declare const MAX_POLYGON_VERTICES = 64;
export declare const MAX_EQUAL_MARK_SEGMENTS = 16;
export declare const MAX_EQUAL_MARK_GROUPS = 16;
export declare const MAX_GEOMETRY_LABEL_CHARS = 500;
export declare const MAX_COORDINATE_MAGNITUDE = 1000000;
export declare const MAX_GEOMETRY_DIMENSION_PX = 4096;
export declare const DEFAULT_GEOMETRY_WIDTH = 640;
export declare const DEFAULT_GEOMETRY_HEIGHT = 400;
/** Source line handed from the envelope parser (text + exact line range). */
export interface GeometryInputLine {
    readonly text: string;
    readonly range: SourceRange;
}
export declare const PRIMITIVE_KINDS: readonly ["point", "segment", "line", "ray", "circle", "arc", "polygon"];
export declare const CONSTRUCTION_KINDS: readonly ["midpoint", "intersection", "tangent-line", "perpendicular-foot", "perpendicular-line", "parallel-line"];
export declare const MARK_KINDS: readonly ["angle-mark", "length-mark", "equal-marks", "right-angle-mark"];
/** Fields each declaration kind accepts (contract §3, closed vocabulary). */
export declare const FIELDS_BY_KIND: Readonly<Record<string, readonly string[]>>;
/** Header keys `parseHeader` accepts, in the parser's acceptance order. */
export declare const GEOMETRY_HEADER_FIELDS: readonly ["id", "number", "width", "height", "bounds"];
/** `bounds:` opens a fixed group; every key in it is required once it does. */
export declare const GEOMETRY_BOUNDS_KEYS: readonly ["min-x", "min-y", "max-x", "max-y"];
interface Point {
    readonly x: number;
    readonly y: number;
}
interface Resolved {
    readonly point?: Point | undefined;
    readonly line?: {
        readonly px: number;
        readonly py: number;
        readonly dx: number;
        readonly dy: number;
    } | undefined;
    readonly circle?: {
        readonly cx: number;
        readonly cy: number;
        readonly r: number;
    } | undefined;
}
export interface ValidatedGeometry {
    readonly block?: GeometryBlock;
    readonly diagnostics: readonly Diagnostic[];
}
/**
 * Validate one geometry Block body: closed vocabulary, backward-only
 * references, canonical branch ordering, versioned epsilon predicates.
 */
export declare function validateGeometryBlock(options: {
    readonly headerLines: readonly GeometryInputLine[];
    readonly bodyLines: readonly GeometryInputLine[];
    readonly blockRange: SourceRange;
    readonly sourceName: string | undefined;
}): ValidatedGeometry;
export interface ResolvedGeometry {
    readonly points: ReadonlyMap<string, Point>;
    readonly lines: ReadonlyMap<string, NonNullable<Resolved["line"]>>;
    readonly circles: ReadonlyMap<string, NonNullable<Resolved["circle"]>>;
}
export declare function resolveGeometry(block: GeometryBlock): ResolvedGeometry;
export declare class GeometrySanitizerError extends Error {
    readonly code: "azeforge.geometry#sanitizer-compromise";
    constructor(message: string);
}
/** Fail-closed norm extended to geometry fragments: generated markup must never carry executable content. */
export declare function assertGeometryFragmentSafe(svg: string): void;
/**
 * Render one geometry Block to a static figure: browser-free deterministic
 * SVG — no scripts, no event attributes, no interactivity. Y-up authored
 * coordinates flip to SVG y-down at emission (renderer-derived placement).
 */
export declare function renderGeometryFragment(block: GeometryBlock, _context: BlockRendererContext): string;
/** Fingerprint closure joining the plot/katex/mermaid closures (contract §9). */
export declare function geometryDependencyClosure(): JsonValue;
export declare const geometryPlugin: AzeBlockPlugin;
export declare const GEOMETRY_HTML_BLOCK_RENDERER_ID: "azeforge.geometry.html/v1";
export declare const GEOMETRY_HTML_BLOCK_RENDERER_VERSION: "1.0.0";
export declare const geometryHtmlBlockRenderer: AzeBlockRenderer<GeometryBlock>;
export {};
