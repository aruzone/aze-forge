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

const SI_PREFIXES: Readonly<Record<string, true>> = Object.freeze({
  Q: true, R: true, Y: true, Z: true, E: true, P: true, T: true, G: true,
  M: true, k: true, h: true, da: true, d: true, c: true, m: true,
  u: true, "µ": true, n: true, p: true, f: true, a: true, z: true,
  y: true, r: true, q: true,
});

const REGISTERED_UNITS: Readonly<Record<string, true>> = Object.freeze({
  m: true, g: true, s: true, A: true, K: true, mol: true, cd: true,
  N: true, Pa: true, J: true, W: true, V: true, ohm: true, F: true,
  C: true, T: true, Wb: true, H: true, Hz: true, Bq: true, Gy: true,
  Sv: true, kat: true, L: true, min: true, h: true, d: true, deg: true,
  "%": true,
});

function isRegisteredUnitName(name: string): boolean {
  return REGISTERED_UNITS[name] === true;
}

function stripPrefix(name: string): string {
  for (const prefix of Object.keys(SI_PREFIXES)) {
    if (name.startsWith(prefix)) {
      const rest = name.slice(prefix.length);
      if (rest.length > 0 && isRegisteredUnitName(rest)) return rest;
    }
  }
  return name;
}

function isRegisteredUnitToken(token: string): boolean {
  return token.length > 0 && isRegisteredUnitName(token) || stripPrefix(token) !== token;
}

export class QuantityError extends Error {
  readonly reason: "empty" | "invalid-number" | "unknown-unit" | "malformed-unit";

  constructor(reason: QuantityError["reason"], message: string) {
    super(message);
    this.name = "QuantityError";
    this.reason = reason;
  }
}

const EXACT_DECIMAL =
  /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

/** Canonicalize an exact decimal coefficient string (`1.00` -> `1`, `1e3` -> `1000`). */
export function canonicalExactDecimal(input: string): string {
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
  let out: string;
  if (point <= 0) {
    out = `0.${"0".repeat(-point)}${digits}`;
  } else if (point >= digits.length) {
    out = digits + "0".repeat(point - digits.length);
  } else {
    out = `${digits.slice(0, point)}.${digits.slice(point)}`;
  }
  out = out.replace(/^0+(?=\d)/, "")
    .replace(/(\.\d*?)0+$/, "$1")
    .replace(/\.$/, "");
  if (out === "") out = "0";
  return negative && out !== "0" ? `-${out}` : out;
}

export interface ParsedQuantity {
  readonly coefficient: string;
  readonly unit: string;
}

interface Split {
  readonly coefficient: string;
  readonly unit: string;
}

function splitQuantity(input: string): Split {
  const trimmed = input.trim();
  const spaced = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)[ \t]+(\S.*)$/.exec(trimmed);
  if (spaced !== null) return { coefficient: spaced[1] ?? "", unit: spaced[2] ?? "" };
  const glued = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)([A-Za-zµ%].*)$/.exec(trimmed);
  if (glued !== null) return { coefficient: glued[1] ?? "", unit: glued[2] ?? "" };
  throw new QuantityError("invalid-number", `"${input}" must start with a numeric coefficient.`);
}

/**
 * Validate a unit expression against the registered vocabulary. A token
 * is accepted when it is a registered unit name or exactly one SI prefix
 * glued to one registered unit name. `kg/m^3`, `W/(m K)` and `kohm` all
 * validate; unknown suffixes throw.
 */
export function validateUnitExpression(expression: string): void {
  const compact = expression.replace(/\s+/g, "");
  if (compact.length === 0) {
    throw new QuantityError("unknown-unit", "A unit is empty.");
  }
  const stack: string[] = [];
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
      while (cursor < compact.length && /[0-9]/.test(compact[cursor] as string)) cursor += 1;
      if (cursor === start) {
        throw new QuantityError("malformed-unit", `"${expression}" has a dangling exponent.`);
      }
      continue;
    }
    const start = cursor;
    while (cursor < compact.length && /[A-Za-zµ%]/.test(compact[cursor] as string)) cursor += 1;
    const token = compact.slice(start, cursor);
    if (!isRegisteredUnitToken(token)) {
      throw new QuantityError(
        "unknown-unit",
        `Unit token "${token}" in "${expression}" is not registered.`,
      );
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
export function parseQuantitySpelling(input: string): ParsedQuantity {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    throw new QuantityError("empty", "Quantity is empty.");
  }
  const { coefficient, unit } = splitQuantity(trimmed);
  validateUnitExpression(unit);
  return { coefficient: canonicalExactDecimal(coefficient), unit };
}

/** Render a quantity cell: exact coefficient plus one separating space. */
export function formatQuantityCell(coefficient: string, unit: string): string {
  const normalized = canonicalExactDecimal(coefficient);
  return unit.length === 0 ? normalized : `${normalized} ${unit}`;
}