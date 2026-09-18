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
const SI_PREFIXES = Object.freeze({
    Q: true, R: true, Y: true, Z: true, E: true, P: true, T: true, G: true,
    M: true, k: true, h: true, da: true, d: true, c: true, m: true,
    u: true, "µ": true, n: true, p: true, f: true, a: true, z: true,
    y: true, r: true, q: true,
});
const REGISTERED_UNITS = Object.freeze({
    m: true, g: true, s: true, A: true, K: true, mol: true, cd: true,
    N: true, Pa: true, J: true, W: true, V: true, ohm: true, F: true,
    C: true, T: true, Wb: true, H: true, Hz: true, Bq: true, Gy: true,
    Sv: true, kat: true, L: true, min: true, h: true, d: true, deg: true,
    "%": true,
    /** Registered alias for degree Celsius (engineering source spelling). */
    degC: true,
});
function isRegisteredUnitName(name) {
    return REGISTERED_UNITS[name] === true;
}
function stripPrefix(name) {
    for (const prefix of Object.keys(SI_PREFIXES)) {
        if (name.startsWith(prefix)) {
            const rest = name.slice(prefix.length);
            if (rest.length > 0 && isRegisteredUnitName(rest))
                return rest;
        }
    }
    return name;
}
function isRegisteredUnitToken(token) {
    return token.length > 0 && isRegisteredUnitName(token) || stripPrefix(token) !== token;
}
export class QuantityError extends Error {
    reason;
    constructor(reason, message) {
        super(message);
        this.name = "QuantityError";
        this.reason = reason;
    }
}
const EXACT_DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
/** Canonicalize an exact decimal coefficient string (`1.00` -> `1`, `1e3` -> `1000`). */
export function canonicalExactDecimal(input) {
    const text = input.trim();
    if (EXACT_DECIMAL.test(text) === false) {
        throw new QuantityError("invalid-number", `"${input}" is not an exact decimal.`);
    }
    const negative = text.startsWith("-");
    const unsigned = text.replace(/^[+-]/, "");
    const [mantissaRaw = "0", exponentRaw] = unsigned.split(/[eE]/, 2);
    const dot = mantissaRaw.indexOf(".");
    const whole = dot < 0 ? mantissaRaw : mantissaRaw.slice(0, dot);
    const fraction = dot < 0 ? "" : mantissaRaw.slice(dot + 1);
    const exponent = exponentRaw === undefined ? 0 : Number.parseInt(exponentRaw, 10);
    if (!Number.isFinite(exponent) || exponent < -1_000_000 || exponent > 1_000_000) {
        throw new QuantityError("invalid-number", `"${input}" exponent is out of range.`);
    }
    // Concatenate digits verbatim; leading zeros are significant for the
    // decimal reference and are only trimmed from the final output.
    const rawDigits = whole + fraction;
    const digits = rawDigits === "" ? "0" : rawDigits;
    if (digits.replace(/^0+/, "").replace(/0+$/, "") === "") {
        return negative ? "-0" : "0";
    }
    const point = (dot < 0 ? mantissaRaw.length : dot) + exponent;
    let out;
    if (point <= 0) {
        out = `0.${"0".repeat(-point)}${digits}`;
    }
    else if (point >= digits.length) {
        out = digits + "0".repeat(point - digits.length);
    }
    else {
        out = `${digits.slice(0, point)}.${digits.slice(point)}`;
    }
    out = out.replace(/^0+(?=\d)/, "")
        .replace(/(\.\d*?)0+$/, "$1")
        .replace(/\.$/, "");
    if (out === "")
        out = "0";
    return negative && out !== "0" ? `-${out}` : out;
}
/** Exact decimal addition over canonical non-negative spellings. */
export function addExactDecimals(left, right) {
    const [leftInt = "0", leftFrac = ""] = left.split(".");
    const [rightInt = "0", rightFrac = ""] = right.split(".");
    const scale = Math.max(leftFrac.length, rightFrac.length);
    const units = BigInt(`${leftInt}${leftFrac.padEnd(scale, "0")}`) +
        BigInt(`${rightInt}${rightFrac.padEnd(scale, "0")}`);
    const digits = units.toString().padStart(scale + 1, "0");
    const whole = digits.slice(0, digits.length - scale);
    const fraction = scale === 0 ? "" : digits.slice(digits.length - scale);
    return canonicalExactDecimal(scale === 0 ? whole : `${whole}.${fraction}`);
}
function splitQuantity(input) {
    const trimmed = input.trim();
    const spaced = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)[ \t]+(\S.*)$/.exec(trimmed);
    if (spaced !== null)
        return { coefficient: spaced[1] ?? "", unit: spaced[2] ?? "" };
    const glued = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)([A-Za-zµ%].*)$/.exec(trimmed);
    if (glued !== null)
        return { coefficient: glued[1] ?? "", unit: glued[2] ?? "" };
    throw new QuantityError("invalid-number", `"${input}" must start with a numeric coefficient.`);
}
/**
 * Validate a unit expression against the registered vocabulary. A token
 * is accepted when it is a registered unit name or exactly one SI prefix
 * glued to one registered unit name. `kg/m^3`, `W/(m K)` and `kohm` all
 * validate; unknown suffixes throw.
 */
export function validateUnitExpression(expression) {
    const compact = expression.replace(/\s+/g, "");
    if (compact.length === 0) {
        throw new QuantityError("unknown-unit", "A unit is empty.");
    }
    const stack = [];
    let cursor = 0;
    while (cursor < compact.length) {
        const char = compact[cursor];
        if (char === "(") {
            stack.push(char);
            cursor += 1;
            continue;
        }
        if (char === ")") {
            if (stack.pop() !== "(") {
                throw new QuantityError("malformed-unit", `"${expression}" has unbalanced parentheses.`);
            }
            cursor += 1;
            continue;
        }
        if (char === "*" || char === "/" || char === "·") {
            cursor += 1;
            continue;
        }
        if (char === "^") {
            cursor += 1;
            const start = cursor;
            while (cursor < compact.length && /[0-9]/.test(compact[cursor]))
                cursor += 1;
            if (cursor === start) {
                throw new QuantityError("malformed-unit", `"${expression}" has a dangling exponent.`);
            }
            continue;
        }
        const start = cursor;
        while (cursor < compact.length && /[A-Za-zµ%]/.test(compact[cursor]))
            cursor += 1;
        const token = compact.slice(start, cursor);
        if (!isRegisteredUnitToken(token)) {
            throw new QuantityError("unknown-unit", `Unit token "${token}" in "${expression}" is not registered.`);
        }
    }
    if (stack.length !== 0) {
        throw new QuantityError("malformed-unit", `"${expression}" has unbalanced parentheses.`);
    }
}
/**
 * Parse a quantity spelling. `1kohm` and `1 kohm` both produce
 * coefficient `1` and unit `kohm`; the coefficient is canonicalized
 * exactly. A number alone (no unit) is rejected.
 */
export function parseQuantitySpelling(input) {
    const trimmed = input.trim();
    if (trimmed.length === 0) {
        throw new QuantityError("empty", "Quantity is empty.");
    }
    const { coefficient, unit } = splitQuantity(trimmed);
    validateUnitExpression(unit);
    return { coefficient: canonicalExactDecimal(coefficient), unit };
}
/** Render a quantity cell: exact coefficient plus one separating space. */
export function formatQuantityCell(coefficient, unit) {
    const normalized = canonicalExactDecimal(coefficient);
    return unit.length === 0 ? normalized : `${normalized} ${unit}`;
}
/**
 * Base-dimension expansion of the registered unit vocabulary, over the SI
 * base symbols `m`, `g`, `s`, `A`, `K`, `mol`, `cd`. Only dimensional
 * consistency is checked; no conversion is ever performed.
 */
const UNIT_DIMENSIONS = Object.freeze({
    m: Object.freeze({ m: 1 }),
    g: Object.freeze({ g: 1 }),
    s: Object.freeze({ s: 1 }),
    A: Object.freeze({ A: 1 }),
    K: Object.freeze({ K: 1 }),
    mol: Object.freeze({ mol: 1 }),
    cd: Object.freeze({ cd: 1 }),
    N: Object.freeze({ g: 1, m: 1, s: -2 }),
    Pa: Object.freeze({ g: 1, m: -1, s: -2 }),
    J: Object.freeze({ g: 1, m: 2, s: -2 }),
    W: Object.freeze({ g: 1, m: 2, s: -3 }),
    V: Object.freeze({ g: 1, m: 2, s: -3, A: -1 }),
    ohm: Object.freeze({ g: 1, m: 2, s: -3, A: -2 }),
    C: Object.freeze({ A: 1, s: 1 }),
    F: Object.freeze({ g: -1, m: -2, s: 4, A: 2 }),
    T: Object.freeze({ g: 1, s: -2, A: -1 }),
    Wb: Object.freeze({ g: 1, m: 2, s: -2, A: -1 }),
    H: Object.freeze({ g: 1, m: 2, s: -2, A: -2 }),
    Hz: Object.freeze({ s: -1 }),
    Bq: Object.freeze({ s: -1 }),
    Gy: Object.freeze({ m: 2, s: -2 }),
    Sv: Object.freeze({ m: 2, s: -2 }),
    kat: Object.freeze({ mol: 1, s: -1 }),
    L: Object.freeze({ m: 3 }),
    min: Object.freeze({ s: 1 }),
    h: Object.freeze({ s: 1 }),
    d: Object.freeze({ s: 1 }),
    deg: Object.freeze({}),
    degC: Object.freeze({}),
    "%": Object.freeze({}),
});
function unitFactor(cursor) {
    const text = cursor.text;
    if (text[cursor.index] === "(") {
        cursor.index += 1;
        const inner = unitExpression(cursor);
        if (text[cursor.index] === ")")
            cursor.index += 1;
        return inner;
    }
    const start = cursor.index;
    while (cursor.index < text.length && /[A-Za-zµ%]/.test(text[cursor.index])) {
        cursor.index += 1;
    }
    const token = text.slice(start, cursor.index);
    if (token.length === 0) {
        throw new QuantityError("malformed-unit", `"${text}" has a malformed unit expression.`);
    }
    const dims = UNIT_DIMENSIONS[stripPrefix(token)] ?? UNIT_DIMENSIONS[token];
    if (dims === undefined) {
        throw new QuantityError("unknown-unit", `Unit token "${token}" is not registered.`);
    }
    return dims;
}
function unitTerm(cursor) {
    let dims = unitFactor(cursor);
    if (cursor.text[cursor.index] === "^") {
        cursor.index += 1;
        const start = cursor.index;
        while (cursor.index < cursor.text.length && /[0-9]/.test(cursor.text[cursor.index])) {
            cursor.index += 1;
        }
        const exponent = Number.parseInt(cursor.text.slice(start, cursor.index), 10);
        const scaled = {};
        for (const [base, power] of Object.entries(dims)) {
            scaled[base] = power * (Number.isFinite(exponent) ? exponent : 1);
        }
        dims = scaled;
    }
    return dims;
}
function unitExpression(cursor) {
    const totals = new Map();
    let sign = 1;
    for (;;) {
        const dims = unitTerm(cursor);
        for (const [base, power] of Object.entries(dims)) {
            totals.set(base, (totals.get(base) ?? 0) + power * sign);
        }
        const next = cursor.text[cursor.index];
        if (next === "*" || next === "·") {
            sign = 1;
            cursor.index += 1;
            continue;
        }
        if (next === "/") {
            sign = -1;
            cursor.index += 1;
            continue;
        }
        const out = {};
        for (const [base, power] of totals) {
            if (power !== 0)
                out[base] = power;
        }
        return out;
    }
}
/**
 * Reduce a unit expression to its base-dimension signature. Two units share
 * a dimension when their signatures are equal, so `m` and `km` agree while
 * `s` and `K` do not. Throws `QuantityError` for an unparseable expression.
 */
export function unitDimension(expression) {
    const compact = expression.replace(/\s+/g, "");
    if (compact.length === 0) {
        throw new QuantityError("unknown-unit", "A unit is empty.");
    }
    const dims = unitExpression({ text: compact, index: 0 });
    return Object.keys(dims)
        .sort((left, right) => (left < right ? -1 : 1))
        .map((base) => `${base}^${dims[base]}`)
        .join("*");
}
//# sourceMappingURL=quantity.js.map