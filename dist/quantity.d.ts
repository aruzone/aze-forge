/**
 * Shared quantity grammar (AzeMark §7).
 *
 * Exact decimal semantics: coefficients are canonicalized with decimal
 * string arithmetic, never binary floating point. `1e3 ohm` becomes
 * `1000 ohm`; `1.00 kohm` becomes `1 kohm`; `1kohm` and `1 kohm` both
 * canonicalize to `1 kohm`. No locale commas, no silent dropping of
 * suffixes.
 *
 * Unit vocabulary is case-sensitive and versioned here; unknown suffixes
 * error. Compound units use `*`, `/`, `^` and balanced parentheses over
 * the registered vocabulary.
 */
export declare class QuantityError extends Error {
    readonly reason: "empty" | "invalid-number" | "unknown-unit" | "malformed-unit";
    constructor(reason: QuantityError["reason"], message: string);
}
/** Canonicalize an exact decimal coefficient string (`1.00` -> `1`, `1e3` -> `1000`). */
export declare function canonicalExactDecimal(input: string): string;
export interface ParsedQuantity {
    readonly coefficient: string;
    readonly unit: string;
}
/** Exact decimal addition over canonical non-negative spellings. */
export declare function addExactDecimals(left: string, right: string): string;
/**
 * Validate a unit expression against the registered vocabulary. A token
 * is accepted when it is a registered unit name or exactly one SI prefix
 * glued to one registered unit name. `kg/m^3`, `W/(m K)` and `kohm` all
 * validate; unknown suffixes throw.
 */
export declare function validateUnitExpression(expression: string): void;
/**
 * Parse a quantity spelling. `1kohm` and `1 kohm` both produce
 * coefficient `1` and unit `kohm`; the coefficient is canonicalized
 * exactly. A number alone (no unit) is rejected.
 */
export declare function parseQuantitySpelling(input: string): ParsedQuantity;
/** Render a quantity cell: exact coefficient plus one separating space. */
export declare function formatQuantityCell(coefficient: string, unit: string): string;
/**
 * Reduce a unit expression to its base-dimension signature. Two units share
 * a dimension when their signatures are equal, so `m` and `km` agree while
 * `s` and `K` do not. Throws `QuantityError` for an unparseable expression.
 */
export declare function unitDimension(expression: string): string;
