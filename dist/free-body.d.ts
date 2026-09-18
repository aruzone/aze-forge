/**
 * Native free-body diagrams (Engineering family; contract: issue #65 "Define
 * native control and free-body diagram semantics", §7–§9 and §11).
 *
 * One `:::: free-body` Block is one flat ordered `- kind:` declaration list
 * over a y-up, unitless exact-decimal frame with plot-numeral normalization
 * (`1.50` ≡ `1.5`) and authored angles wrapped to [0, 360). Bodies, points and
 * lines are referenceable; forces, moments, axes, angle-marks and dimensions
 * are anonymous because nothing in the language references them. The optional
 * `scale:` header property is a representation switch: with it every force
 * claims a `magnitude:` and the renderer derives the drawn length, without it
 * every force authors a schematic `length:`.
 *
 * Nothing here measures, lays out or renders, and nothing is inferred:
 * geometry's construction machinery (derivation graph, picks, solver) is not
 * reused, so an inclined plane is an authored `polygon` and contact is never
 * snapped, force magnitude is never checked against equilibrium, and a
 * relative direction stays the authored ray. References resolve two-pass, so
 * forward references are legal and no name is ever created implicitly.
 *
 * Diagnostics posture (the diagram precedent): an error publishes no Block, so
 * the two warnings are computed only for a sound declaration list, where every
 * reference resolved and every resolved object exists to be described.
 */
import type { AzeBlockPlugin, Diagnostic, FreeBodyBlock, SourceRange } from "./model.js";
export declare const MAX_FREE_BODY_DECLARATIONS = 256;
export declare const MAX_FREE_BODY_POLYGON_VERTICES = 64;
export declare const MAX_FREE_BODY_LABEL_CHARS = 500;
export declare const MAX_FREE_BODY_COORDINATE_MAGNITUDE = 1000000;
export declare const MAX_FREE_BODY_DIMENSION_PX = 4096;
export declare const DEFAULT_FREE_BODY_WIDTH = 640;
export declare const DEFAULT_FREE_BODY_HEIGHT = 400;
/** Source line handed from the envelope parser (text plus its exact range). */
export interface FreeBodyInputLine {
    readonly text: string;
    readonly range: SourceRange;
}
export declare const BODY_KINDS: readonly ["block", "circle", "polygon", "particle"];
export declare const RECORD_KINDS: readonly ["point", "line", "force", "moment", "axes", "angle-mark", "dimension"];
export declare const DECLARATION_KINDS: readonly string[];
/** Fields each declaration kind accepts (contract §7, closed vocabulary). */
export declare const FIELDS_BY_KIND: Readonly<Record<string, readonly string[]>>;
export declare const HEADER_FIELDS: readonly string[];
export declare const BOUNDS_KEYS: readonly string[];
export declare const STYLES: readonly ["solid", "dashed"];
export declare const MOMENT_DIRECTIONS: readonly ["cw", "ccw"];
/** The three closed direction forms; exactly one is authored per force. */
export declare const DIRECTION_FIELDS: readonly string[];
/**
 * Validate one `:::: free-body` Block: header, closed declaration vocabulary,
 * two-pass reference resolution, the scale switch, ceilings and the family's
 * two warnings. An error publishes no Block; warnings are computed only for a
 * sound declaration list.
 */
export declare function validateFreeBodyBlock(options: {
    readonly headerLines: readonly FreeBodyInputLine[];
    readonly bodyLines: readonly FreeBodyInputLine[];
    readonly blockRange: SourceRange;
    readonly sourceName?: string;
}): {
    readonly block?: FreeBodyBlock;
    readonly diagnostics: readonly Diagnostic[];
};
export declare const freeBodyPlugin: AzeBlockPlugin;
