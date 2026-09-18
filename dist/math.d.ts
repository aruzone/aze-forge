/**
 * Native mathematics grammar (catalog Mathematics family, contract #57).
 *
 * A closed readable expression grammar parsed into a typed semantic
 * expression tree. The parser is the validator: every malformed or
 * unsupported spelling is refused with a stable-coded, sub-ranged
 * diagnostic; KaTeX-shaped and unregistered notation never passes
 * through. TeX is a renderer-derived spelling — a total deterministic
 * function of the tree — produced by the HTML block renderer.
 */
import type { JsonValue, SourceRange } from "./model.js";
export declare const MAX_MATH_NESTING_DEPTH = 32;
export declare const MAX_CASES_BRANCHES = 32;
export declare const MAX_MATRIX_DIMENSION = 32;
declare const RELATION_TEX: Readonly<Record<string, string>>;
declare const SET_OP_TEX: Readonly<Record<string, string>>;
declare const BINDER_OPS: readonly ["sum", "product", "integral", "limit", "forall", "exists"];
type BinderOp = (typeof BINDER_OPS)[number];
export type RelationOp = keyof typeof RELATION_TEX;
export type SetOp = keyof typeof SET_OP_TEX;
export interface IdentNode {
    readonly kind: "ident";
    /** Single ASCII letter. */
    readonly name: string;
    /** Inline digit suffix, e.g. "0" in `v0`. */
    readonly digitSuffix?: string;
    /** Subscript rendering of digits or a lowercase word, e.g. "n" in `S_n`. */
    readonly subscript?: string;
    /** Authored primes, 1 or 2. */
    readonly primes?: 1 | 2;
}
export interface NumberNode {
    readonly kind: "number";
    /** Authored digits exactly. */
    readonly spelling: string;
}
export interface SymbolNode {
    readonly kind: "symbol";
    /** Canonical word alias, e.g. "alpha" for both `alpha` and `α`. */
    readonly name: string;
}
export interface UnaryNode {
    readonly kind: "unary";
    readonly op: "-";
    readonly node: MathNode;
}
export interface AddNode {
    readonly kind: "add";
    readonly left: MathNode;
    readonly right: MathNode;
}
export interface SubNode {
    readonly kind: "sub";
    readonly left: MathNode;
    readonly right: MathNode;
}
export interface MulNode {
    readonly kind: "mul";
    readonly left: MathNode;
    readonly right: MathNode;
}
export interface DivNode {
    readonly kind: "div";
    readonly left: MathNode;
    readonly right: MathNode;
}
export interface JuxtNode {
    readonly kind: "juxt";
    /** Authored juxtaposition order; two or more factors. */
    readonly factors: readonly MathNode[];
}
export interface ScriptNode {
    readonly kind: "script";
    readonly base: MathNode;
    readonly sub?: string;
    readonly sup?: MathNode;
    /** Authored primes, 1 or 2. */
    readonly primes?: 1 | 2;
}
export interface ChainNode {
    readonly kind: "chain";
    readonly head: MathNode;
    /** Ordered relational links; never evaluated. */
    readonly links: readonly {
        readonly op: RelationOp;
        readonly node: MathNode;
    }[];
}
export interface SetOpNode {
    readonly kind: "setop";
    readonly op: SetOp;
    readonly left: MathNode;
    readonly right: MathNode;
}
export interface FuncNode {
    readonly kind: "func";
    readonly name: string;
    readonly subscript?: string;
    readonly arg: MathNode;
}
export interface SqrtNode {
    readonly kind: "sqrt";
    readonly arg: MathNode;
}
export interface RootNode {
    readonly kind: "root";
    readonly index: MathNode;
    readonly arg: MathNode;
}
export interface FracNode {
    readonly kind: "frac";
    readonly num: MathNode;
    readonly den: MathNode;
}
export interface AbsNode {
    readonly kind: "abs";
    readonly arg: MathNode;
}
export interface VectorNode {
    readonly kind: "vector";
    readonly items: readonly MathNode[];
}
export interface MatrixNode {
    readonly kind: "matrix";
    readonly delimiter: "bracket" | "paren" | "bar";
    readonly rows: readonly (readonly MathNode[])[];
}
export interface CasesBranch {
    readonly expr: MathNode;
    readonly cond: MathNode | {
        readonly kind: "otherwise";
    };
}
export interface CasesNode {
    readonly kind: "cases";
    readonly branches: readonly CasesBranch[];
}
export interface GroupNode {
    readonly kind: "group";
    readonly node: MathNode;
}
export interface BinderNode {
    readonly kind: "binder";
    readonly op: BinderOp;
    /** Bound name; undefined only for an indefinite integral (`integral of ... dx`). */
    readonly name?: IdentNode;
    readonly from?: MathNode;
    readonly to?: MathNode;
    /** limit target. */
    readonly target?: MathNode;
    /** forall/exists set operand. */
    readonly set?: MathNode;
    /** integral differential variable (the letter of the terminal `dx`). */
    readonly differential?: string;
    readonly body: MathNode;
}
export type MathNode = IdentNode | NumberNode | SymbolNode | UnaryNode | AddNode | SubNode | MulNode | DivNode | JuxtNode | ScriptNode | ChainNode | SetOpNode | FuncNode | SqrtNode | RootNode | FracNode | AbsNode | VectorNode | MatrixNode | CasesNode | GroupNode | BinderNode;
export interface MathProblem {
    /** Stable code suffix under the enclosing Block's namespace. */
    readonly code: string;
    readonly severity: "error" | "warning";
    readonly message: string;
    /** Offset within the parsed source. */
    readonly offset: number;
    readonly length: number;
    readonly suggestion?: string;
    readonly data?: Readonly<Record<string, JsonValue>>;
}
export type MathParseResult = {
    readonly tree: MathNode;
    readonly warnings: readonly MathProblem[];
} | {
    readonly problems: readonly MathProblem[];
};
/**
 * Parse a mathematics body into a semantic expression tree. The parser
 * is the validator: any failure returns stable-coded, sub-ranged
 * problems; warnings ride along with a successful tree.
 */
export declare function parseNativeMath(source: string): MathParseResult;
export declare function canonicalSpelling(node: MathNode): string;
export declare function projectMathNode(node: MathNode): JsonValue;
export declare function treeToTex(node: MathNode): string;
/**
 * Rebuild a MathNode from its identity projection so renderers derive TeX
 * from the semantic tree the Block owns, exactly per contract §1/§12:
 * TeX is a total deterministic function of the tree.
 */
export declare function projectionToNode(value: JsonValue): MathNode | undefined;
/**
 * TeX from a tree projection; used by renderers so TeX is derived from
 * the semantic tree the Block owns. Falls back to empty only if the
 * projection is absent (never for native blocks).
 */
export declare function treeToTexFromProjection(projection: JsonValue | undefined): string;
/**
 * Map a parser offset (relative to a body's start) onto the exact
 * sub-range within the Block body so diagnostics stay body-scoped.
 * `bodyRanges` are the source ranges of the body's lines, whose start
 * offsets are absolute in the Source; the returned range uses the same
 * absolute space.
 */
export declare function rangeForOffset(bodyRanges: readonly SourceRange[], offset: number, length: number): SourceRange;
export {};
