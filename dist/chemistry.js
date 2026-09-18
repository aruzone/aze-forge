/**
 * Native chemistry formulas, reactions, and 2D molecular structures
 * (catalog Chemistry family, contract #64).
 *
 * One family module owns three plain-name directives — `:::: formula`,
 * `:::: reaction`, `:::: structure` — each a standalone captionable,
 * numbered, referenceable Technical object. Formulas parse a bounded
 * case-sensitive expression grammar into a semantic tree; reactions hold
 * one species line with a closed arrow registry and an opt-in balance
 * assertion over the author's own declarations; structures hold flat
 * atom/bond/label records with mandatory authored coordinates and
 * zero-inference identity. Rendering reuses the plots' owned SVG emission
 * layer (fixed attribute order, deterministic ids, quantized 3-decimal
 * ASCII formatter, no text measurement).
 *
 * R4 is satisfied by construction: normalization touches only expression
 * whitespace and the registered `.`/`·` alias; there is no
 * canonicalization path, and specified / explicitly-unspecified / omitted
 * stereo, isotope, charge, element order, and Kekulé/aromatic forms stay
 * distinct in the hashed semantic tree.
 */
import { createDiagnostic } from "./diagnostics.js";
import { CHEMISTRY_EMITTER_VERSION, FORMULA_BODY_SYNTAX_ID, FORMULA_BODY_SYNTAX_VERSION, FORMULA_HEADER_FIELDS, FORMULA_PLUGIN_TYPE, FORMULA_PLUGIN_VERSION, formulaDataSchema, formulaSourceSchema, REACTION_BODY_SYNTAX_ID, REACTION_BODY_SYNTAX_VERSION, REACTION_HEADER_FIELDS, REACTION_PLUGIN_TYPE, REACTION_PLUGIN_VERSION, reactionDataSchema, reactionSourceSchema, STRUCTURE_BODY_SYNTAX_ID, STRUCTURE_BODY_SYNTAX_VERSION, STRUCTURE_HEADER_FIELDS, STRUCTURE_PLUGIN_TYPE, STRUCTURE_PLUGIN_VERSION, structureDataSchema, structureSourceSchema, } from "./chemistry-schemas.js";
import { escapeXml, quantize } from "./plot.js";
/* ------------------------------------------------------------------ *
 * Ceilings (contract §2–§4)
 * ------------------------------------------------------------------ */
export const MAX_FORMULA_EXPRESSION_CHARS = 512;
export const MAX_REACTION_SPECIES = 32;
export const MAX_REACTION_SPECIES_CHARS = 128;
export const MAX_REACTION_CONDITION_CHARS = 256;
export const MAX_STRUCTURE_ATOMS = 512;
export const MAX_STRUCTURE_WIDTH = 4096;
export const MAX_STRUCTURE_HEIGHT = 4096;
export const MAX_STRUCTURE_LABEL_CHARS = 500;
export const MAX_ISOTOPE_MASS = 299;
export const MAX_FORMULA_CHARGE = 8;
export const MAX_SUBSCRIPT = 999;
export const MAX_GROUP_NESTING = 3;
export const MAX_COEFFICIENT = 999;
/** Stereo wedges remain legible without dominating their single bond. */
const WEDGE_LENGTH_RATIO = 0.4;
export const DEFAULT_STRUCTURE_WIDTH = 640;
export const DEFAULT_STRUCTURE_HEIGHT = 400;
const FORMULA_NAMESPACE = "azeforge.chemistry.formula";
const REACTION_NAMESPACE = "azeforge.chemistry.reaction";
const STRUCTURE_NAMESPACE = "azeforge.chemistry.structure";
const NAME_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const BLANK = /^[ \t]*$/;
const COMMENT = /^[ \t]*\/[\/](?:[ \t].*)?$/;
const FIELD_LINE = /^([ \t]*)([A-Za-z][A-Za-z0-9-]*)[ \t]*:(.*)$/;
const ITEM_OPEN = /^([ \t]*)-[ \t]*(.*)$/;
/** Closed element registry Z=1–118; case-sensitive, no folding. */
const ELEMENTS = new Set([
    "H", "He", "Li", "Be", "B", "C", "N", "O", "F", "Ne",
    "Na", "Mg", "Al", "Si", "P", "S", "Cl", "Ar", "K", "Ca",
    "Sc", "Ti", "V", "Cr", "Mn", "Fe", "Co", "Ni", "Cu", "Zn",
    "Ga", "Ge", "As", "Se", "Br", "Kr", "Rb", "Sr", "Y", "Zr",
    "Nb", "Mo", "Tc", "Ru", "Rh", "Pd", "Ag", "Cd", "In", "Sn",
    "Sb", "Te", "I", "Xe", "Cs", "Ba", "La", "Ce", "Pr", "Nd",
    "Pm", "Sm", "Eu", "Gd", "Tb", "Dy", "Ho", "Er", "Tm", "Yb",
    "Lu", "Hf", "Ta", "W", "Re", "Os", "Ir", "Pt", "Au", "Hg",
    "Tl", "Pb", "Bi", "Po", "At", "Rn", "Fr", "Ra", "Ac", "Th",
    "Pa", "U", "Np", "Pu", "Am", "Cm", "Bk", "Cf", "Es", "Fm",
    "Md", "No", "Lr", "Rf", "Db", "Sg", "Bh", "Hs", "Mt", "Ds",
    "Rg", "Cn", "Nh", "Fl", "Mc", "Lv", "Ts", "Og",
]);
/** The registry as the ordered spelling list the grammar publishes. */
export const ELEMENT_SYMBOLS = Object.freeze([...ELEMENTS]);
export const REACTION_STATES = Object.freeze(["s", "l", "g", "aq"]);
const REACTION_ARROWS = Object.freeze(["->", "<-", "<->"]);
const ARROW_GLYPH = Object.freeze({
    "->": "→",
    "<-": "←",
    "<->": "⇌",
});
/* ------------------------------------------------------------------ *
 * Diagnostics
 * ------------------------------------------------------------------ */
function diag(namespace, code, message, range, sourceName, extra = {}) {
    return createDiagnostic(`${namespace}#${code}`, extra.severity ?? "error", message, {
        location: sourceName === undefined ? { range } : { source: sourceName, range },
        ...(extra.suggestion === undefined ? {} : { suggestion: extra.suggestion }),
        ...(extra.data === undefined ? {} : { data: extra.data }),
    });
}
function limitExceeded(namespace, subject, count, limit, range, sourceName) {
    return diag(namespace, "limit-exceeded", `Chemistry ${subject} count ${count} exceeds the limit of ${limit}.`, range, sourceName, {
        data: { subject, count, limit },
    });
}
function lineRange(line) {
    return line.range;
}
/** Sub-range within one single-line body line (UTF-16 columns). */
function subRange(line, startColumn, endColumn) {
    const base = line.range.start;
    return {
        start: { line: base.line, column: base.column + startColumn, offset: base.offset + startColumn },
        end: { line: base.line, column: base.column + endColumn, offset: base.offset + endColumn },
    };
}
/* ------------------------------------------------------------------ *
 * Exact-decimal canonicalization (plot-numeral normalization)
 * ------------------------------------------------------------------ */
const DECIMAL_PATTERN = /^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/;
const NONFINITE_WORDS = new Set(["nan", "+nan", "-nan", "inf", "+inf", "-inf", "infinity", "+infinity", "-infinity"]);
function canonicalDecimal(raw) {
    const text = raw.trim();
    if (text === "" || NONFINITE_WORDS.has(text.toLowerCase()))
        return undefined;
    if (!DECIMAL_PATTERN.test(text))
        return undefined;
    const value = Number(text);
    if (!Number.isFinite(value))
        return undefined;
    if (value === 0)
        return "0";
    let out = String(value);
    if (out.includes("e") || out.includes("E")) {
        const fixed = value.toPrecision(15);
        out = String(Number(fixed));
        if (out.includes("e") || out.includes("E"))
            return undefined;
    }
    return out;
}
/** Normalize only whitespace and the registered `.`/`·` alias. */
function normalizeExpression(raw) {
    return raw.replace(/\s+/g, "").replace(/\./g, "·");
}
function parseElementToken(cursor) {
    const { text } = cursor;
    const start = cursor.index;
    const first = text[start];
    if (first === undefined || !/[A-Z]/.test(first))
        return undefined;
    let end = start + 1;
    while (end < text.length && /[a-z]/.test(text[end] ?? ""))
        end += 1;
    return { symbol: text.slice(start, end), start, end };
}
function parseDigitRun(cursor) {
    const start = cursor.index;
    let end = start;
    while (end < cursor.text.length && /[0-9]/.test(cursor.text[end] ?? ""))
        end += 1;
    if (end === start)
        return undefined;
    return { value: cursor.text.slice(start, end), start, end };
}
function parseSubscript(cursor, owner, ownerStart, ownerEnd) {
    const run = parseDigitRun(cursor);
    if (run === undefined)
        return 1;
    cursor.index = run.end;
    if (run.value.length > 1 && run.value.startsWith("0")) {
        cursor.diagnostics.push(diag(cursor.namespace, "chem-formula-syntax", `Formula subscript "${run.value}" on ${owner} must not have leading zeros.`, subRange(cursor.line, cursor.baseColumn + run.start, cursor.baseColumn + run.end), cursor.sourceName));
        cursor.failed = true;
        return undefined;
    }
    const count = Number.parseInt(run.value, 10);
    if (count < 1 || count > MAX_SUBSCRIPT) {
        cursor.diagnostics.push(diag(cursor.namespace, "chem-formula-syntax", `Formula subscript "${run.value}" on ${owner} must be 1–${MAX_SUBSCRIPT}.`, subRange(cursor.line, cursor.baseColumn + run.start, cursor.baseColumn + run.end), cursor.sourceName, { data: { value: run.value } }));
        cursor.failed = true;
        return undefined;
    }
    void ownerStart;
    void ownerEnd;
    return count;
}
function parseSequence(cursor, depth) {
    const parts = [];
    for (;;) {
        const char = cursor.text[cursor.index];
        if (char === undefined || char === ")" || char === "·")
            break;
        if (char === "(") {
            if (depth + 1 > MAX_GROUP_NESTING) {
                cursor.diagnostics.push(diag(cursor.namespace, "chem-formula-syntax", `Formula group nesting exceeds ${MAX_GROUP_NESTING} levels.`, subRange(cursor.line, cursor.baseColumn + cursor.index, cursor.baseColumn + cursor.index + 1), cursor.sourceName));
                cursor.failed = true;
                return undefined;
            }
            const open = cursor.index;
            cursor.index += 1;
            const inner = parseSequence(cursor, depth + 1);
            if (inner === undefined)
                return undefined;
            if (cursor.text[cursor.index] !== ")") {
                cursor.diagnostics.push(diag(cursor.namespace, "chem-formula-syntax", "Formula group is missing its closing parenthesis.", subRange(cursor.line, cursor.baseColumn + open, cursor.baseColumn + cursor.index), cursor.sourceName));
                cursor.failed = true;
                return undefined;
            }
            if (inner.length === 0) {
                cursor.diagnostics.push(diag(cursor.namespace, "chem-formula-syntax", "Formula group must not be empty.", subRange(cursor.line, cursor.baseColumn + open, cursor.baseColumn + cursor.index + 1), cursor.sourceName));
                cursor.failed = true;
                return undefined;
            }
            cursor.index += 1;
            const count = parseSubscript(cursor, "group", open, cursor.index);
            if (count === undefined)
                return undefined;
            parts.push({ kind: "group", parts: inner, count });
            continue;
        }
        const token = parseElementToken(cursor);
        if (token === undefined) {
            const bad = cursor.text[cursor.index] ?? "";
            cursor.diagnostics.push(diag(cursor.namespace, "chem-formula-syntax", `Formula character "${bad}" does not parse: expected an element symbol or parenthesized group.`, subRange(cursor.line, cursor.baseColumn + cursor.index, cursor.baseColumn + cursor.index + 1), cursor.sourceName, { data: { character: bad } }));
            cursor.failed = true;
            return undefined;
        }
        if (!ELEMENTS.has(token.symbol)) {
            cursor.diagnostics.push(diag(cursor.namespace, "chem-formula-unknown-element", `Formula element "${token.symbol}" is not in the closed element registry.`, subRange(cursor.line, cursor.baseColumn + token.start, cursor.baseColumn + token.end), cursor.sourceName, { data: { symbol: token.symbol } }));
            cursor.failed = true;
            return undefined;
        }
        cursor.index = token.end;
        const count = parseSubscript(cursor, `element "${token.symbol}"`, token.start, token.end);
        if (count === undefined)
            return undefined;
        const part = { kind: "element", symbol: token.symbol, count };
        parts.push(part);
    }
    return parts;
}
function parseUnit(cursor, allowMultiplier) {
    let multiplier = 1;
    if (allowMultiplier) {
        const saved = cursor.index;
        const run = parseDigitRun(cursor);
        if (run !== undefined && cursor.text[run.end] !== undefined && cursor.text[run.end] !== "·") {
            // Leading run of an adduct unit is its multiplier.
            cursor.index = run.end;
            if (run.value.length > 1 && run.value.startsWith("0")) {
                cursor.diagnostics.push(diag(cursor.namespace, "chem-formula-syntax", `Formula adduct multiplier "${run.value}" must not have leading zeros.`, subRange(cursor.line, cursor.baseColumn + run.start, cursor.baseColumn + run.end), cursor.sourceName));
                cursor.failed = true;
                return undefined;
            }
            multiplier = Number.parseInt(run.value, 10);
            if (multiplier < 1 || multiplier > MAX_SUBSCRIPT) {
                cursor.diagnostics.push(diag(cursor.namespace, "chem-formula-syntax", `Formula adduct multiplier "${run.value}" must be 1–${MAX_SUBSCRIPT}.`, subRange(cursor.line, cursor.baseColumn + run.start, cursor.baseColumn + run.end), cursor.sourceName));
                cursor.failed = true;
                return undefined;
            }
        }
        else {
            cursor.index = saved;
        }
    }
    // Leading run at unit start is an isotope mass on the first element.
    let isotope;
    let isotopeSpecified = false;
    const saved = cursor.index;
    const run = parseDigitRun(cursor);
    if (run !== undefined) {
        const next = cursor.text[run.end];
        if (next !== undefined && /[A-Z(]/.test(next)) {
            if (run.value.length > 1 && run.value.startsWith("0")) {
                cursor.diagnostics.push(diag(cursor.namespace, "chem-formula-syntax", `Formula isotope mass "${run.value}" must not have leading zeros.`, subRange(cursor.line, cursor.baseColumn + run.start, cursor.baseColumn + run.end), cursor.sourceName));
                cursor.failed = true;
                return undefined;
            }
            const mass = Number.parseInt(run.value, 10);
            if (mass < 1 || mass > MAX_ISOTOPE_MASS) {
                cursor.diagnostics.push(diag(cursor.namespace, "chem-formula-syntax", `Formula isotope mass "${run.value}" must be 1–${MAX_ISOTOPE_MASS}.`, subRange(cursor.line, cursor.baseColumn + run.start, cursor.baseColumn + run.end), cursor.sourceName, { data: { value: run.value } }));
                cursor.failed = true;
                return undefined;
            }
            cursor.index = run.end;
            isotope = mass;
            isotopeSpecified = true;
        }
        else {
            cursor.index = saved;
        }
    }
    void isotopeSpecified;
    const parts = parseSequence(cursor, 0);
    if (parts === undefined)
        return undefined;
    if (parts.length === 0) {
        cursor.diagnostics.push(diag(cursor.namespace, "chem-formula-syntax", "Formula adduct unit must declare at least one element or group.", subRange(cursor.line, cursor.baseColumn + saved, cursor.baseColumn + cursor.index), cursor.sourceName));
        cursor.failed = true;
        return undefined;
    }
    return {
        ...{ multiplier },
        ...(isotope === undefined ? {} : { isotope }),
        parts,
    };
}
/**
 * Parse one normalized formula expression. chargeText carries the peeled
 * trailing charge suffix (sign plus optional magnitude digit).
 */
export function parseFormulaExpression(options) {
    const { raw, line, columnOffset, namespace, sourceName, diagnostics } = options;
    if (raw.length > MAX_FORMULA_EXPRESSION_CHARS) {
        diagnostics.push(limitExceeded(namespace, "expression", raw.length, MAX_FORMULA_EXPRESSION_CHARS, lineRange(line), sourceName));
        return undefined;
    }
    const expression = normalizeExpression(raw);
    if (expression === "") {
        diagnostics.push(diag(namespace, "chem-formula-syntax", "Formula expression must not be empty.", lineRange(line), sourceName));
        return undefined;
    }
    if (expression === "e-") {
        return { expression, units: [], charge: -1, chargeSpecified: true, electron: true };
    }
    // Trailing charge suffix only: peel the sign, then the last digit of a
    // preceding run is the charge magnitude while earlier digits stay a
    // subscript (SO42- is SO4 with charge 2-; Fe3+ is Fe with charge 3+).
    let body = expression;
    let charge = 0;
    let chargeSpecified = false;
    const sign = body.endsWith("+") || body.endsWith("-") ? body[body.length - 1] : undefined;
    if (sign !== undefined) {
        body = body.slice(0, -1);
        if (body === "" || body.endsWith("·")) {
            diagnostics.push(diag(namespace, "chem-formula-syntax", `Formula expression "${raw.trim()}" has a charge sign with no species.`, lineRange(line), sourceName));
            return undefined;
        }
        const run = /([0-9]+)$/.exec(body);
        if (run !== null) {
            const digits = run[1] ?? "";
            const magnitude = Number.parseInt(digits[digits.length - 1], 10);
            if (magnitude < 1 || magnitude > MAX_FORMULA_CHARGE) {
                diagnostics.push(diag(namespace, "chem-formula-syntax", `Formula charge magnitude "${magnitude}" must be 1–${MAX_FORMULA_CHARGE}.`, lineRange(line), sourceName, { data: { magnitude } }));
                return undefined;
            }
            charge = sign === "+" ? magnitude : -magnitude;
            chargeSpecified = true;
            body = body.slice(0, body.length - 1);
        }
        else {
            charge = sign === "+" ? 1 : -1;
            chargeSpecified = true;
        }
    }
    if (body === "") {
        diagnostics.push(diag(namespace, "chem-formula-syntax", `Formula expression "${raw.trim()}" declares no composition.`, lineRange(line), sourceName));
        return undefined;
    }
    const cursor = { text: body, baseColumn: columnOffset, line, namespace, sourceName, diagnostics, index: 0, failed: false };
    const units = [];
    const first = parseUnit(cursor, false);
    if (first === undefined || cursor.failed)
        return undefined;
    units.push(first);
    while (cursor.index < cursor.text.length) {
        const separator = cursor.text[cursor.index];
        if (separator !== "·") {
            diagnostics.push(diag(namespace, "chem-formula-syntax", `Formula character "${separator}" does not parse: expected "·" between adduct units.`, subRange(line, columnOffset + cursor.index, columnOffset + cursor.index + 1), sourceName, { data: { character: separator ?? "" } }));
            return undefined;
        }
        cursor.index += 1;
        if (cursor.index >= cursor.text.length) {
            diagnostics.push(diag(namespace, "chem-formula-syntax", "Formula adduct separator must be followed by another unit.", subRange(line, columnOffset + cursor.index - 1, columnOffset + cursor.index), sourceName));
            return undefined;
        }
        const unit = parseUnit(cursor, true);
        if (unit === undefined || cursor.failed)
            return undefined;
        units.push(unit);
    }
    return { expression, units, charge, chargeSpecified, electron: false };
}
/** Element-count multiset of one parsed formula (adduct multipliers applied). */
export function formulaAtomCounts(formula) {
    const totals = new Map();
    const add = (symbol, count) => {
        totals.set(symbol, (totals.get(symbol) ?? 0) + count);
    };
    const addParts = (parts, factor) => {
        for (const part of parts) {
            if (part.kind === "element")
                add(part.symbol, part.count * factor);
            else
                addParts(part.parts, part.count * factor);
        }
    };
    for (const unit of formula.units)
        addParts(unit.parts, unit.multiplier);
    return totals;
}
function parseSharedHeader(namespace, kindWord, headerLines, allowed, sourceName, diagnostics) {
    const values = {};
    const seen = new Set();
    for (const line of headerLines) {
        const text = line.text;
        if (BLANK.test(text) || COMMENT.test(text))
            continue;
        const match = FIELD_LINE.exec(text);
        if (match === null) {
            diagnostics.push(diag(namespace, "unknown-field", `${kindWord} header line "${text.trim()}" is not a "key: value" field.`, lineRange(line), sourceName));
            continue;
        }
        const key = (match[2] ?? "").toLowerCase();
        const value = (match[3] ?? "").trim();
        if (!allowed.includes(key)) {
            diagnostics.push(diag(namespace, "unknown-field", `${kindWord} header field "${key}" is not supported.`, lineRange(line), sourceName, {
                suggestion: `Supported header fields: ${allowed.join(", ")}.`,
            }));
            continue;
        }
        if (seen.has(key)) {
            diagnostics.push(diag(namespace, "duplicate-field", `${kindWord} header field "${key}" is declared twice.`, lineRange(line), sourceName));
            continue;
        }
        seen.add(key);
        values[key] = value;
    }
    const header = {};
    if (values.id !== undefined) {
        if (!NAME_PATTERN.test(values.id)) {
            diagnostics.push(diag(namespace, "unknown-field", `${kindWord} id "${values.id}" must be lowercase-kebab.`, lineRange(headerLines.find((line) => line.text.includes("id:")) ?? headerLines[0]), sourceName));
        }
        else
            header.id = values.id;
    }
    if (values.number !== undefined) {
        if (values.number !== "true" && values.number !== "false") {
            diagnostics.push(diag(namespace, "unknown-field", `${kindWord} "number:" must be true or false.`, lineRange(headerLines[0]), sourceName));
        }
        else
            header.number = values.number === "true";
    }
    for (const [key, value] of Object.entries(values)) {
        if (key !== "id" && key !== "number")
            header[key] = value;
    }
    return header;
}
function bodyTextLines(bodyLines) {
    return bodyLines.filter((line) => !BLANK.test(line.text) && !COMMENT.test(line.text));
}
export function validateFormulaBlock(options) {
    const { headerLines, bodyLines, blockRange, sourceName } = options;
    const diagnostics = [];
    const header = parseSharedHeader(FORMULA_NAMESPACE, "Formula", headerLines, FORMULA_HEADER_FIELDS, sourceName, diagnostics);
    if (header === undefined)
        return { diagnostics };
    const lines = bodyTextLines(bodyLines);
    if (lines.length === 0) {
        diagnostics.push(diag(FORMULA_NAMESPACE, "empty", "Formula Block declares no expression.", blockRange, sourceName));
        return { diagnostics };
    }
    if (lines.length > 1) {
        diagnostics.push(diag(FORMULA_NAMESPACE, "chem-formula-syntax", "Formula body must be exactly one expression line.", lineRange(lines[1]), sourceName));
        return { diagnostics };
    }
    const line = lines[0];
    const raw = line.text.trim();
    const indent = line.text.length - line.text.trimStart().length;
    const parsed = parseFormulaExpression({ raw, line, columnOffset: indent, namespace: FORMULA_NAMESPACE, sourceName, diagnostics });
    if (parsed === undefined)
        return { diagnostics };
    if (diagnostics.length > 0)
        return { diagnostics };
    const block = {
        kind: "formula",
        range: blockRange,
        pluginVersion: FORMULA_PLUGIN_VERSION,
        ...(header.id === undefined ? {} : { id: header.id }),
        ...(header.number === undefined ? {} : { number: header.number }),
        expression: parsed.expression,
        units: parsed.units,
        charge: parsed.charge,
        chargeSpecified: parsed.chargeSpecified,
        electron: parsed.electron,
    };
    return { block, diagnostics };
}
/* ------------------------------------------------------------------ *
 * Reaction directive (§3)
 * ------------------------------------------------------------------ */
function findArrow(text) {
    for (let index = 0; index < text.length; index += 1) {
        if (text.startsWith("<->", index))
            return { arrow: "<->", index };
        if (text.startsWith("->", index))
            return { arrow: "->", index };
        if (text.startsWith("<-", index))
            return { arrow: "<-", index };
    }
    return undefined;
}
function parseSpeciesToken(options) {
    const { token, tokenColumn, line, sourceName, diagnostics } = options;
    if (token.length > MAX_REACTION_SPECIES_CHARS) {
        diagnostics.push(limitExceeded(REACTION_NAMESPACE, "species expression", token.length, MAX_REACTION_SPECIES_CHARS, subRange(line, tokenColumn, tokenColumn + token.length), sourceName));
        return undefined;
    }
    let rest = token;
    let restColumn = tokenColumn;
    let coefficient;
    let unspecified = false;
    if (rest.startsWith("?")) {
        unspecified = true;
        rest = rest.slice(1).trimStart();
        restColumn = tokenColumn + (token.length - rest.length);
        if (rest === "") {
            diagnostics.push(diag(REACTION_NAMESPACE, "chem-reaction-coefficient-invalid", "Reaction coefficient \"?\" must immediately precede a species.", subRange(line, tokenColumn, tokenColumn + 1), sourceName));
            return undefined;
        }
    }
    else {
        const count = /^([0-9]+)([\s]+|$)/.exec(rest);
        if (count !== null) {
            const digits = count[1] ?? "";
            const value = Number.parseInt(digits, 10);
            if (value < 1 || value > MAX_COEFFICIENT) {
                diagnostics.push(diag(REACTION_NAMESPACE, "chem-reaction-coefficient-invalid", `Reaction coefficient "${digits}" must be 1–${MAX_COEFFICIENT} or "?".`, subRange(line, tokenColumn, tokenColumn + digits.length), sourceName, { data: { value: digits } }));
                return undefined;
            }
            coefficient = value;
            rest = rest.slice(count[0].length);
            restColumn = tokenColumn + count[0].length;
            if (/^[0-9]/.test(rest)) {
                diagnostics.push(diag(REACTION_NAMESPACE, "chem-reaction-coefficient-invalid", `Reaction coefficient "${digits}" must be followed by a species, not more digits.`, subRange(line, tokenColumn, tokenColumn + count[0].length + 1), sourceName));
                return undefined;
            }
            if (rest === "") {
                diagnostics.push(diag(REACTION_NAMESPACE, "chem-reaction-coefficient-invalid", `Reaction coefficient "${digits}" must precede a species.`, subRange(line, tokenColumn, tokenColumn + digits.length), sourceName));
                return undefined;
            }
        }
    }
    // Closed state labels attach directly: Ca(OH)2(s). Because no state
    // code forms a valid group body, a trailing state strip is unambiguous.
    let state;
    let expressionText = rest;
    const stateMatch = /\((s|l|g|aq)\)$/.exec(rest);
    if (stateMatch !== null) {
        state = stateMatch[1];
        expressionText = rest.slice(0, rest.length - stateMatch[0].length);
        if (expressionText === "") {
            diagnostics.push(diag(REACTION_NAMESPACE, "chem-reaction-syntax", `Reaction species "(${stateMatch[1]})" has a state label with no formula.`, subRange(line, restColumn, restColumn + rest.length), sourceName));
            return undefined;
        }
    }
    else {
        const trailing = /\(([^()]*)\)$/.exec(rest);
        if (trailing !== null) {
            const candidate = rest.slice(0, rest.length - trailing[0].length);
            const probe = [];
            const parsed = candidate === "" ? undefined : parseFormulaExpression({ raw: candidate, line, columnOffset: restColumn, namespace: REACTION_NAMESPACE, sourceName, diagnostics: probe });
            if (parsed !== undefined) {
                diagnostics.push(diag(REACTION_NAMESPACE, "chem-reaction-state-unknown", `Reaction state "(${trailing[1]})" is not registered.`, subRange(line, restColumn + candidate.length, restColumn + rest.length), sourceName, {
                    suggestion: `Registered states: ${REACTION_STATES.map((entry) => `(${entry})`).join(", ")}.`,
                    data: { state: trailing[1] ?? "" },
                }));
                return undefined;
            }
        }
    }
    const parsed = parseFormulaExpression({ raw: expressionText, line, columnOffset: restColumn, namespace: REACTION_NAMESPACE, sourceName, diagnostics });
    if (parsed === undefined) {
        // A formula-unknown-element inside a species is still a formula
        // problem; anything else about the species line is reaction syntax.
        const last = diagnostics[diagnostics.length - 1];
        if (last !== undefined && !last.code.endsWith("#chem-formula-unknown-element")) {
            diagnostics.push(diag(REACTION_NAMESPACE, "chem-reaction-syntax", `Reaction species "${token}" does not parse as a coefficient, formula, and state.`, subRange(line, tokenColumn, tokenColumn + token.length), sourceName));
        }
        return undefined;
    }
    return {
        ...(coefficient === undefined ? {} : { coefficient }),
        unspecifiedCoefficient: unspecified,
        expression: parsed.expression,
        ...(state === undefined ? {} : { state }),
        units: parsed.units,
        charge: parsed.charge,
        chargeSpecified: parsed.chargeSpecified,
        electron: parsed.electron,
    };
}
export function validateReactionBlock(options) {
    const { headerLines, bodyLines, blockRange, sourceName } = options;
    const diagnostics = [];
    const header = parseSharedHeader(REACTION_NAMESPACE, "Reaction", headerLines, REACTION_HEADER_FIELDS, sourceName, diagnostics);
    if (header === undefined)
        return { diagnostics };
    let balance = "none";
    if (header.balance !== undefined) {
        if (header.balance !== "none" && header.balance !== "check") {
            diagnostics.push(diag(REACTION_NAMESPACE, "chem-reaction-syntax", `Reaction "balance:" must be "none" or "check".`, lineRange(headerLines[0]), sourceName, {
                suggestion: 'Use "balance: check" to assert atom and charge equality, or omit it to claim nothing.',
            }));
        }
        else
            balance = header.balance;
    }
    const condition = (key) => {
        const value = header[key];
        if (value === undefined)
            return undefined;
        if (value === "") {
            diagnostics.push(diag(REACTION_NAMESPACE, "chem-reaction-syntax", `Reaction "${key}:" must not be empty.`, lineRange(headerLines[0]), sourceName));
            return undefined;
        }
        if (value.length > MAX_REACTION_CONDITION_CHARS) {
            diagnostics.push(limitExceeded(REACTION_NAMESPACE, `condition "${key}"`, value.length, MAX_REACTION_CONDITION_CHARS, lineRange(headerLines[0]), sourceName));
            return undefined;
        }
        return value;
    };
    const above = condition("above");
    const below = condition("below");
    const lines = bodyTextLines(bodyLines);
    if (lines.length === 0) {
        diagnostics.push(diag(REACTION_NAMESPACE, "chem-reaction-syntax", "Reaction Block declares no species line.", blockRange, sourceName));
        return { diagnostics };
    }
    if (lines.length > 1) {
        diagnostics.push(diag(REACTION_NAMESPACE, "chem-reaction-syntax", "Reaction body must be exactly one species line.", lineRange(lines[1]), sourceName));
        return { diagnostics };
    }
    if (diagnostics.length > 0)
        return { diagnostics };
    const line = lines[0];
    const text = line.text.trim();
    const indent = line.text.length - line.text.trimStart().length;
    const arrow = findArrow(text);
    if (arrow === undefined) {
        diagnostics.push(diag(REACTION_NAMESPACE, "chem-reaction-syntax", `Reaction species line has no registered arrow.`, lineRange(line), sourceName, {
            suggestion: `Registered arrows: ${REACTION_ARROWS.join(", ")}.`,
        }));
        return { diagnostics };
    }
    const leftText = text.slice(0, arrow.index).trim();
    const rightText = text.slice(arrow.index + arrow.arrow.length).trim();
    if (leftText === "" || rightText === "") {
        diagnostics.push(diag(REACTION_NAMESPACE, "chem-reaction-syntax", `Reaction arrow "${arrow.arrow}" requires species on both sides.`, subRange(line, indent + arrow.index, indent + arrow.index + arrow.arrow.length), sourceName));
        return { diagnostics };
    }
    if (findArrow(leftText) !== undefined || findArrow(rightText) !== undefined) {
        diagnostics.push(diag(REACTION_NAMESPACE, "chem-reaction-syntax", "Reaction species line must carry exactly one arrow.", lineRange(line), sourceName));
        return { diagnostics };
    }
    const parseSide = (side, sideColumn) => {
        const tokens = side.split(/\s+\+\s+/);
        const species = [];
        let column = sideColumn;
        for (const token of tokens) {
            const start = side.indexOf(token, column - sideColumn);
            const tokenColumn = column + (start < 0 ? 0 : start);
            const parsed = parseSpeciesToken({ token, tokenColumn, line, sourceName, diagnostics });
            if (parsed === undefined)
                return undefined;
            species.push(parsed);
            column = tokenColumn + token.length + 3;
        }
        return species;
    };
    const leftColumn = indent + text.indexOf(leftText);
    const reactants = parseSide(leftText, leftColumn);
    if (reactants === undefined)
        return { diagnostics };
    const rightColumn = indent + text.indexOf(rightText, leftText.length);
    const products = parseSide(rightText, rightColumn);
    if (products === undefined)
        return { diagnostics };
    if (reactants.length + products.length > MAX_REACTION_SPECIES) {
        diagnostics.push(limitExceeded(REACTION_NAMESPACE, "species", reactants.length + products.length, MAX_REACTION_SPECIES, lineRange(line), sourceName));
        return { diagnostics };
    }
    if (diagnostics.length > 0)
        return { diagnostics };
    // Balance assertion over the author's own declarations only. Omission
    // claims nothing; any explicitly-unspecified coefficient skips
    // verification with a warning instead of inventing a count.
    if (balance === "check") {
        const sides = [...reactants, ...products];
        if (sides.some((entry) => entry.unspecifiedCoefficient)) {
            diagnostics.push(diag(REACTION_NAMESPACE, "chem-balance-check-skipped", "Balance check skipped: a coefficient is explicitly unspecified (?).", lineRange(line), sourceName, { severity: "warning" }));
        }
        else {
            const factor = (entry) => entry.coefficient ?? 1;
            const leftCounts = new Map();
            const rightCounts = new Map();
            let leftCharge = 0;
            let rightCharge = 0;
            const accumulate = (entry, totals) => {
                if (!entry.electron) {
                    for (const [symbol, count] of formulaAtomCounts({ expression: entry.expression, units: entry.units, charge: entry.charge, chargeSpecified: entry.chargeSpecified, electron: false })) {
                        totals.set(symbol, (totals.get(symbol) ?? 0) + count * factor(entry));
                    }
                }
                return entry.charge * factor(entry);
            };
            for (const entry of reactants)
                leftCharge += accumulate(entry, leftCounts);
            for (const entry of products)
                rightCharge += accumulate(entry, rightCounts);
            const symbols = new Set([...leftCounts.keys(), ...rightCounts.keys()]);
            for (const symbol of symbols) {
                if ((leftCounts.get(symbol) ?? 0) !== (rightCounts.get(symbol) ?? 0)) {
                    diagnostics.push(diag(REACTION_NAMESPACE, "chem-balance-atom-mismatch", `Balance check fails: element "${symbol}" totals ${leftCounts.get(symbol) ?? 0} on the left and ${rightCounts.get(symbol) ?? 0} on the right.`, lineRange(line), sourceName, {
                        data: { element: symbol, left: leftCounts.get(symbol) ?? 0, right: rightCounts.get(symbol) ?? 0 },
                    }));
                }
            }
            if (leftCharge !== rightCharge) {
                diagnostics.push(diag(REACTION_NAMESPACE, "chem-balance-charge-mismatch", `Balance check fails: net charge totals ${leftCharge} on the left and ${rightCharge} on the right.`, lineRange(line), sourceName, {
                    data: { left: leftCharge, right: rightCharge },
                }));
            }
            if (diagnostics.some((entry) => entry.severity === "error"))
                return { diagnostics };
        }
    }
    const block = {
        kind: "reaction",
        range: blockRange,
        pluginVersion: REACTION_PLUGIN_VERSION,
        ...(header.id === undefined ? {} : { id: header.id }),
        ...(header.number === undefined ? {} : { number: header.number }),
        ...(above === undefined ? {} : { above }),
        ...(below === undefined ? {} : { below }),
        balance,
        arrow: arrow.arrow,
        reactants,
        products,
    };
    return { block, diagnostics };
}
export const STRUCTURE_OPENERS = Object.freeze(["atom", "bond", "label"]);
export const ATOM_FIELDS = Object.freeze(["element", "attach", "charge", "isotope", "at", "stereo"]);
export const BOND_FIELDS = Object.freeze(["from", "to", "order", "stereo"]);
export const LABEL_FIELDS = Object.freeze(["text", "at"]);
function splitRecords(namespace, kindWord, bodyLines, sourceName, diagnostics) {
    const records = [];
    let current;
    const flush = () => {
        if (current === undefined)
            return;
        records.push({ opener: current.opener, name: current.name, openerLine: current.openerLine, fields: [...current.fields] });
        current = undefined;
    };
    for (const line of bodyLines) {
        const text = line.text;
        if (BLANK.test(text) || COMMENT.test(text))
            continue;
        const item = ITEM_OPEN.exec(text);
        if (item !== null) {
            const rest = (item[2] ?? "").trim();
            const opener = /^([A-Za-z]+)[ \t]*:[ \t]*(.*)$/.exec(rest);
            if (opener !== null && STRUCTURE_OPENERS.includes((opener[1] ?? "").toLowerCase())) {
                flush();
                current = { opener: (opener[1] ?? "").toLowerCase(), name: (opener[2] ?? "").trim(), openerLine: line, fields: [] };
                continue;
            }
            flush();
            current = { opener: `\u0000invalid:${rest}`, name: "", openerLine: line, fields: [] };
            continue;
        }
        const field = FIELD_LINE.exec(text);
        if (field !== null && current !== undefined) {
            current.fields.push({ key: (field[2] ?? "").toLowerCase(), value: (field[3] ?? "").trim(), line });
            continue;
        }
        if (current === undefined) {
            diagnostics.push(diag(namespace, "unknown-declaration", `${kindWord} body line "${text.trim()}" must start a "- atom:", "- bond:", or "- label:" record.`, lineRange(line), sourceName));
            continue;
        }
        diagnostics.push(diag(namespace, "chem-structure-syntax", `${kindWord} line "${text.trim()}" is not a "key: value" field.`, lineRange(line), sourceName));
    }
    flush();
    return records;
}
function decodeQuotedText(value) {
    if (!value.startsWith("\"") || !value.endsWith("\""))
        return value;
    try {
        const decoded = JSON.parse(value);
        return typeof decoded === "string" ? decoded : undefined;
    }
    catch {
        return undefined;
    }
}
function parseAtValue(value) {
    const match = /^\[\s*(.+?)\s*,\s*(.+?)\s*\]$/.exec(value);
    if (match === null)
        return undefined;
    const x = canonicalDecimal(match[1] ?? "");
    const y = canonicalDecimal(match[2] ?? "");
    if (x === undefined || y === undefined)
        return undefined;
    return { x, y };
}
export function validateStructureBlock(options) {
    const { headerLines, bodyLines, blockRange, sourceName } = options;
    const diagnostics = [];
    const header = parseSharedHeader(STRUCTURE_NAMESPACE, "Structure", headerLines, STRUCTURE_HEADER_FIELDS, sourceName, diagnostics);
    if (header === undefined)
        return { diagnostics };
    let width = DEFAULT_STRUCTURE_WIDTH;
    let height = DEFAULT_STRUCTURE_HEIGHT;
    for (const key of ["width", "height"]) {
        const raw = header[key];
        if (raw === undefined)
            continue;
        if (!/^[0-9]+$/.test(raw)) {
            diagnostics.push(diag(STRUCTURE_NAMESPACE, "chem-structure-syntax", `Structure "${key}:" must be a positive integer.`, lineRange(headerLines[0]), sourceName));
            continue;
        }
        const parsed = Number.parseInt(raw, 10);
        const limit = key === "width" ? MAX_STRUCTURE_WIDTH : MAX_STRUCTURE_HEIGHT;
        if (parsed <= 0 || parsed > limit) {
            diagnostics.push(limitExceeded(STRUCTURE_NAMESPACE, key, parsed, limit, lineRange(headerLines[0]), sourceName));
            continue;
        }
        if (key === "width")
            width = parsed;
        else
            height = parsed;
    }
    const records = splitRecords(STRUCTURE_NAMESPACE, "Structure", bodyLines, sourceName, diagnostics);
    if (records === undefined)
        return { diagnostics };
    if (records.length === 0) {
        diagnostics.push(diag(STRUCTURE_NAMESPACE, "empty", "Structure Block declares no records.", blockRange, sourceName));
        return { diagnostics };
    }
    let failed = diagnostics.length > 0;
    const atoms = [];
    const bonds = [];
    const labels = [];
    const names = new Set();
    const fieldMap = (record) => {
        const map = new Map();
        for (const field of record.fields) {
            if (!map.has(field.key))
                map.set(field.key, field);
        }
        return map;
    };
    const checkFields = (record, allowed) => {
        const seen = new Set();
        for (const field of record.fields) {
            if (seen.has(field.key)) {
                diagnostics.push(diag(STRUCTURE_NAMESPACE, "duplicate-field", `Structure ${record.opener} field "${field.key}" is declared twice.`, lineRange(field.line), sourceName));
                failed = true;
            }
            else
                seen.add(field.key);
            if (!allowed.includes(field.key)) {
                diagnostics.push(diag(STRUCTURE_NAMESPACE, "unknown-field", `Structure ${record.opener} field "${field.key}" is not supported.`, lineRange(field.line), sourceName, {
                    suggestion: `Supported fields: ${allowed.join(", ")}.`,
                }));
                failed = true;
            }
        }
        return fieldMap(record);
    };
    for (const record of records) {
        if (record.opener.startsWith("\u0000invalid:")) {
            diagnostics.push(diag(STRUCTURE_NAMESPACE, "unknown-declaration", `Structure record "${record.opener.slice(9)}" is not registered.`, lineRange(record.openerLine), sourceName, {
                suggestion: "Registered records: atom, bond, label.",
            }));
            failed = true;
            continue;
        }
        if (record.opener === "atom") {
            const fields = checkFields(record, ATOM_FIELDS);
            if (fields === undefined) {
                failed = true;
                continue;
            }
            if (record.name === "") {
                diagnostics.push(diag(STRUCTURE_NAMESPACE, "chem-structure-syntax", 'Structure atom requires a name ("- atom: <name>").', lineRange(record.openerLine), sourceName));
                failed = true;
                continue;
            }
            if (!NAME_PATTERN.test(record.name)) {
                diagnostics.push(diag(STRUCTURE_NAMESPACE, "chem-structure-syntax", `Structure atom name "${record.name}" must be lowercase-kebab.`, lineRange(record.openerLine), sourceName));
                failed = true;
                continue;
            }
            if (names.has(record.name)) {
                diagnostics.push(diag(STRUCTURE_NAMESPACE, "chem-atom-name-duplicate", `Structure atom "${record.name}" is declared twice.`, lineRange(record.openerLine), sourceName, { data: { name: record.name } }));
                failed = true;
                continue;
            }
            names.add(record.name);
            const element = fields.get("element");
            const attach = fields.get("attach");
            if ((element === undefined) === (attach === undefined)) {
                diagnostics.push(diag(STRUCTURE_NAMESPACE, "chem-atom-spec-conflict", `Structure atom "${record.name}" carries exactly one of "element:" or "attach:".`, lineRange(record.openerLine), sourceName, { data: { name: record.name } }));
                failed = true;
                continue;
            }
            let symbol;
            let attachText;
            if (element !== undefined) {
                if (!/^[A-Za-z]+$/.test(element.value)) {
                    diagnostics.push(diag(STRUCTURE_NAMESPACE, "chem-structure-syntax", `Structure atom "${record.name}" element "${element.value}" must be letters.`, lineRange(element.line), sourceName));
                    failed = true;
                    continue;
                }
                if (!ELEMENTS.has(element.value)) {
                    diagnostics.push(diag(STRUCTURE_NAMESPACE, "chem-formula-unknown-element", `Structure atom "${record.name}" element "${element.value}" is not in the closed element registry.`, lineRange(element.line), sourceName, { data: { symbol: element.value } }));
                    failed = true;
                    continue;
                }
                symbol = element.value;
            }
            else {
                const decodedAttachment = decodeQuotedText(attach.value);
                if (decodedAttachment === undefined || decodedAttachment === "") {
                    diagnostics.push(diag(STRUCTURE_NAMESPACE, "chem-structure-syntax", `Structure atom "${record.name}" attach label must be non-empty text.`, lineRange(attach.line), sourceName));
                    failed = true;
                    continue;
                }
                attachText = decodedAttachment;
            }
            const isAttachment = attachText !== undefined;
            let charge;
            const chargeField = fields.get("charge");
            if (chargeField !== undefined) {
                if (isAttachment) {
                    diagnostics.push(diag(STRUCTURE_NAMESPACE, "chem-atom-spec-conflict", `Structure attachment atom "${record.name}" must not carry a charge: its content is outside the structure.`, lineRange(chargeField.line), sourceName, { data: { name: record.name } }));
                    failed = true;
                    continue;
                }
                if (!/^[+-]?[0-9]+$/.test(chargeField.value)) {
                    diagnostics.push(diag(STRUCTURE_NAMESPACE, "chem-structure-syntax", `Structure atom "${record.name}" charge "${chargeField.value}" must be an integer.`, lineRange(chargeField.line), sourceName));
                    failed = true;
                    continue;
                }
                const parsed = Number.parseInt(chargeField.value, 10);
                if (Math.abs(parsed) > MAX_FORMULA_CHARGE) {
                    diagnostics.push(diag(STRUCTURE_NAMESPACE, "chem-structure-syntax", `Structure atom "${record.name}" charge magnitude must be ≤ ${MAX_FORMULA_CHARGE}.`, lineRange(chargeField.line), sourceName, { data: { value: chargeField.value } }));
                    failed = true;
                    continue;
                }
                charge = parsed;
            }
            let isotope;
            const isotopeField = fields.get("isotope");
            if (isotopeField !== undefined) {
                if (isAttachment) {
                    diagnostics.push(diag(STRUCTURE_NAMESPACE, "chem-atom-spec-conflict", `Structure attachment atom "${record.name}" must not carry an isotope: its content is outside the structure.`, lineRange(isotopeField.line), sourceName, { data: { name: record.name } }));
                    failed = true;
                    continue;
                }
                if (!/^[0-9]+$/.test(isotopeField.value)) {
                    diagnostics.push(diag(STRUCTURE_NAMESPACE, "chem-structure-syntax", `Structure atom "${record.name}" isotope "${isotopeField.value}" must be a mass number.`, lineRange(isotopeField.line), sourceName));
                    failed = true;
                    continue;
                }
                const parsed = Number.parseInt(isotopeField.value, 10);
                if (parsed < 1 || parsed > MAX_ISOTOPE_MASS) {
                    diagnostics.push(diag(STRUCTURE_NAMESPACE, "chem-structure-syntax", `Structure atom "${record.name}" isotope mass must be 1–${MAX_ISOTOPE_MASS}.`, lineRange(isotopeField.line), sourceName, { data: { value: isotopeField.value } }));
                    failed = true;
                    continue;
                }
                isotope = parsed;
            }
            const atField = fields.get("at");
            if (atField === undefined || atField.value === "") {
                diagnostics.push(diag(STRUCTURE_NAMESPACE, "chem-structure-syntax", `Structure atom "${record.name}" requires "at: [x, y]" coordinates: a 2D structure without placement is not a 2D structure.`, lineRange(record.openerLine), sourceName, { data: { name: record.name } }));
                failed = true;
                continue;
            }
            const at = parseAtValue(atField.value);
            if (at === undefined) {
                diagnostics.push(diag(STRUCTURE_NAMESPACE, "chem-structure-syntax", `Structure atom "${record.name}" coordinates "${atField.value}" must be "at: [x, y]" exact decimals.`, lineRange(atField.line), sourceName));
                failed = true;
                continue;
            }
            let stereo;
            const stereoField = fields.get("stereo");
            if (stereoField !== undefined) {
                if (stereoField.value !== "unspecified") {
                    diagnostics.push(diag(STRUCTURE_NAMESPACE, "chem-structure-syntax", `Structure atom "${record.name}" stereo "${stereoField.value}" is not registered: the only atom-level stereo value is "unspecified".`, lineRange(stereoField.line), sourceName, {
                        suggestion: 'Wedge and hash stereo live on single bonds; E/Z geometry is carried by authored coordinates.',
                    }));
                    failed = true;
                    continue;
                }
                stereo = "unspecified";
            }
            atoms.push({
                name: record.name,
                ...(symbol === undefined ? {} : { element: symbol }),
                ...(attachText === undefined ? {} : { attach: attachText }),
                ...(charge === undefined ? {} : { charge }),
                ...(isotope === undefined ? {} : { isotope }),
                x: at.x,
                y: at.y,
                ...(stereo === undefined ? {} : { stereo }),
            });
            continue;
        }
        if (record.opener === "bond") {
            const fields = checkFields(record, BOND_FIELDS);
            if (fields === undefined) {
                failed = true;
                continue;
            }
            const from = fields.get("from");
            const to = fields.get("to");
            const order = fields.get("order");
            if (from === undefined || from.value === "" || to === undefined || to.value === "") {
                diagnostics.push(diag(STRUCTURE_NAMESPACE, "chem-structure-syntax", 'Structure bond requires "from:" and "to:" atom references.', lineRange(record.openerLine), sourceName));
                failed = true;
                continue;
            }
            if (order === undefined || order.value === "") {
                diagnostics.push(diag(STRUCTURE_NAMESPACE, "chem-structure-syntax", 'Structure bond requires "order: 1 | 2 | 3 | aromatic".', lineRange(record.openerLine), sourceName));
                failed = true;
                continue;
            }
            if (!names.has(from.value)) {
                diagnostics.push(diag(STRUCTURE_NAMESPACE, "chem-bond-endpoint-unknown", `Structure bond endpoint "${from.value}" names no declared atom.`, lineRange(from.line), sourceName, { data: { endpoint: from.value } }));
                failed = true;
                continue;
            }
            if (!names.has(to.value)) {
                diagnostics.push(diag(STRUCTURE_NAMESPACE, "chem-bond-endpoint-unknown", `Structure bond endpoint "${to.value}" names no declared atom.`, lineRange(to.line), sourceName, { data: { endpoint: to.value } }));
                failed = true;
                continue;
            }
            if (from.value === to.value) {
                diagnostics.push(diag(STRUCTURE_NAMESPACE, "chem-bond-self", `Structure bond from "${from.value}" to itself is not admitted.`, lineRange(record.openerLine), sourceName, { data: { atom: from.value } }));
                failed = true;
                continue;
            }
            if (order.value !== "1" && order.value !== "2" && order.value !== "3" && order.value !== "aromatic") {
                diagnostics.push(diag(STRUCTURE_NAMESPACE, "chem-structure-syntax", `Structure bond order "${order.value}" is not registered: use 1, 2, 3, or aromatic.`, lineRange(order.line), sourceName));
                failed = true;
                continue;
            }
            const pair = [from.value, to.value].sort().join(" ");
            if (bonds.some((entry) => [entry.from, entry.to].sort().join(" ") === pair)) {
                diagnostics.push(diag(STRUCTURE_NAMESPACE, "chem-bond-duplicate", `Structure bond "${from.value}–${to.value}" repeats an authored pair.`, lineRange(record.openerLine), sourceName, { data: { from: from.value, to: to.value } }));
                failed = true;
                continue;
            }
            let stereo;
            const stereoField = fields.get("stereo");
            if (stereoField !== undefined) {
                if (stereoField.value !== "wedge" && stereoField.value !== "hash") {
                    diagnostics.push(diag(STRUCTURE_NAMESPACE, "chem-structure-syntax", `Structure bond stereo "${stereoField.value}" is not registered: use wedge or hash.`, lineRange(stereoField.line), sourceName));
                    failed = true;
                    continue;
                }
                if (order.value !== "1") {
                    diagnostics.push(diag(STRUCTURE_NAMESPACE, "chem-bond-stereo-order-conflict", `Structure bond stereo "${stereoField.value}" is legal only with "order: 1".`, lineRange(stereoField.line), sourceName, { data: { order: order.value } }));
                    failed = true;
                    continue;
                }
                stereo = stereoField.value;
            }
            bonds.push({
                from: from.value,
                to: to.value,
                order: order.value,
                ...(stereo === undefined ? {} : { stereo }),
            });
            continue;
        }
        // label: display-only record; the compiler never derives it.
        const fields = checkFields(record, LABEL_FIELDS);
        if (fields === undefined) {
            failed = true;
            continue;
        }
        const text = fields.get("text");
        const atField = fields.get("at");
        if (text === undefined) {
            diagnostics.push(diag(STRUCTURE_NAMESPACE, "chem-structure-syntax", 'Structure label requires "text:".', lineRange(record.openerLine), sourceName));
            failed = true;
            continue;
        }
        const labelText = decodeQuotedText(text.value);
        if (labelText === undefined || labelText === "") {
            diagnostics.push(diag(STRUCTURE_NAMESPACE, "chem-structure-syntax", 'Structure label requires "text:".', lineRange(record.openerLine), sourceName));
            failed = true;
            continue;
        }
        if (labelText.length > MAX_STRUCTURE_LABEL_CHARS) {
            diagnostics.push(limitExceeded(STRUCTURE_NAMESPACE, "label text", labelText.length, MAX_STRUCTURE_LABEL_CHARS, lineRange(text.line), sourceName));
            failed = true;
            continue;
        }
        if (atField === undefined || atField.value === "") {
            diagnostics.push(diag(STRUCTURE_NAMESPACE, "chem-structure-syntax", 'Structure label requires "at: [x, y]" coordinates.', lineRange(record.openerLine), sourceName));
            failed = true;
            continue;
        }
        const at = parseAtValue(atField.value);
        if (at === undefined) {
            diagnostics.push(diag(STRUCTURE_NAMESPACE, "chem-structure-syntax", `Structure label coordinates "${atField.value}" must be "at: [x, y]" exact decimals.`, lineRange(atField.line), sourceName));
            failed = true;
            continue;
        }
        labels.push({ text: labelText, x: at.x, y: at.y });
    }
    if (failed)
        return { diagnostics };
    if (atoms.length > MAX_STRUCTURE_ATOMS) {
        diagnostics.push(limitExceeded(STRUCTURE_NAMESPACE, "atoms", atoms.length, MAX_STRUCTURE_ATOMS, blockRange, sourceName));
        return { diagnostics };
    }
    if (bonds.length > 2 * Math.max(atoms.length, 1)) {
        diagnostics.push(limitExceeded(STRUCTURE_NAMESPACE, "bonds", bonds.length, 2 * Math.max(atoms.length, 1), blockRange, sourceName));
        return { diagnostics };
    }
    // Warning-only connectivity: multiple fragments in one structure are
    // authored display intent, never an error.
    if (atoms.length > 1) {
        const adjacency = new Map();
        for (const atom of atoms)
            adjacency.set(atom.name, new Set());
        for (const bond of bonds) {
            adjacency.get(bond.from)?.add(bond.to);
            adjacency.get(bond.to)?.add(bond.from);
        }
        const seen = new Set();
        let fragments = 0;
        for (const atom of atoms) {
            if (seen.has(atom.name))
                continue;
            fragments += 1;
            const queue = [atom.name];
            seen.add(atom.name);
            while (queue.length > 0) {
                const current = queue.pop();
                for (const next of adjacency.get(current) ?? []) {
                    if (!seen.has(next)) {
                        seen.add(next);
                        queue.push(next);
                    }
                }
            }
        }
        if (fragments > 1) {
            diagnostics.push(diag(STRUCTURE_NAMESPACE, "chem-structure-disconnected", `Structure declares ${fragments} disconnected fragments in one Block.`, blockRange, sourceName, {
                severity: "warning",
                data: { fragments },
            }));
        }
    }
    const block = {
        kind: "structure",
        range: blockRange,
        pluginVersion: STRUCTURE_PLUGIN_VERSION,
        ...(header.id === undefined ? {} : { id: header.id }),
        ...(header.number === undefined ? {} : { number: header.number }),
        width,
        height,
        atoms,
        bonds,
        ...(labels.length === 0 ? {} : { labels }),
    };
    return { block, diagnostics };
}
/* ------------------------------------------------------------------ *
 * Rendering: project-owned SVG emission (contract §7)
 * ------------------------------------------------------------------ */
export class ChemistrySanitizerError extends Error {
    code = "azeforge.chemistry#sanitizer-compromise";
    constructor(message) {
        super(message);
        this.name = "ChemistrySanitizerError";
    }
}
export function assertChemistryFragmentSafe(svg) {
    if (/<\s*script|on[a-z]+\s*=|javascript:/i.test(svg)) {
        throw new ChemistrySanitizerError("Chemistry fragment carries unexpected executable markup.");
    }
}
function stableFigureId(kind, seed) {
    let hash = 2166136261;
    const text = `${kind}:${seed}`;
    for (let i = 0; i < text.length; i += 1) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return `${kind}-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
/** Render one parsed unit as element symbols with subscript counts. */
function renderUnitParts(parts) {
    return parts.map((part) => {
        if (part.kind === "element") {
            const count = part.count === 1 ? "" : `<sub>${part.count}</sub>`;
            return `${escapeXml(part.symbol)}${count}`;
        }
        const count = part.count === 1 ? "" : `<sub>${part.count}</sub>`;
        return `(${renderUnitParts(part.parts)})${count}`;
    }).join("");
}
function renderFormulaInline(units, isotopeFirst) {
    return units.map((unit, index) => {
        const multiplier = unit.multiplier === 1 ? "" : `${unit.multiplier}`;
        const isotope = index === 0 && isotopeFirst !== undefined ? `<sup>${isotopeFirst}</sup>` : "";
        const dot = index === 0 ? "" : " · ";
        return `${dot}${multiplier}${isotope}${renderUnitParts(unit.parts)}`;
    }).join("");
}
function formulaContentSeed(block) {
    return JSON.stringify({ id: block.id ?? "", expression: block.expression, charge: block.charge, electron: block.electron });
}
export function renderFormulaFragment(block, _context) {
    const isotopeFirst = block.units[0]?.isotope;
    const body = block.electron ? "e<sup>−</sup>" : renderFormulaInline(block.units, isotopeFirst);
    const charge = !block.chargeSpecified || block.charge === 0
        ? ""
        : block.charge === 1
            ? "<sup>+</sup>"
            : block.charge === -1
                ? "<sup>−</sup>"
                : block.charge > 0
                    ? `<sup>${block.charge}+</sup>`
                    : `<sup>${Math.abs(block.charge)}−</sup>`;
    const figureId = stableFigureId("aze-formula", formulaContentSeed(block));
    const label = block.id === undefined ? "" : ` data-formula-id="${escapeXml(block.id)}"`;
    const number = block.number === true ? ' data-formula-number="true"' : "";
    const html = `<figure class="aze-formula" id="${figureId}"${label}${number}><span class="aze-formula-expression">${body}${charge}</span></figure>`;
    assertChemistryFragmentSafe(html);
    return html;
}
function renderSpeciesInline(species) {
    const isotopeFirst = species.units[0]?.isotope;
    const coefficient = species.unspecifiedCoefficient ? "? " : species.coefficient === undefined ? "" : `${species.coefficient} `;
    const body = species.electron ? "e<sup>−</sup>" : renderFormulaInline(species.units, isotopeFirst);
    const charge = !species.chargeSpecified || species.charge === 0
        ? ""
        : species.charge === 1
            ? "<sup>+</sup>"
            : species.charge === -1
                ? "<sup>−</sup>"
                : species.charge > 0
                    ? `<sup>${species.charge}+</sup>`
                    : `<sup>${Math.abs(species.charge)}−</sup>`;
    const state = species.state === undefined ? "" : `<sub>(${species.state})</sub>`;
    return `${coefficient}${body}${charge}${state}`;
}
function reactionContentSeed(block) {
    return JSON.stringify({
        id: block.id ?? "",
        arrow: block.arrow,
        above: block.above ?? "",
        below: block.below ?? "",
        reactants: block.reactants,
        products: block.products,
    });
}
export function renderReactionFragment(block, _context) {
    const left = block.reactants.map(renderSpeciesInline).join(" + ");
    const right = block.products.map(renderSpeciesInline).join(" + ");
    const glyph = ARROW_GLYPH[block.arrow] ?? block.arrow;
    const conditions = block.above !== undefined || block.below !== undefined
        ? `<span class="aze-reaction-conditions">${block.above === undefined ? "" : `<span class="aze-reaction-above">${escapeXml(block.above)}</span>`}${block.below === undefined ? "" : `<span class="aze-reaction-below">${escapeXml(block.below)}</span>`}</span>`
        : "";
    const figureId = stableFigureId("aze-reaction", reactionContentSeed(block));
    const label = block.id === undefined ? "" : ` data-reaction-id="${escapeXml(block.id)}"`;
    const number = block.number === true ? ' data-reaction-number="true"' : "";
    const html = `<figure class="aze-reaction" id="${figureId}"${label}${number}><span class="aze-reaction-side">${left}</span> <span class="aze-reaction-arrow">${glyph}</span>${conditions} <span class="aze-reaction-side">${right}</span></figure>`;
    assertChemistryFragmentSafe(html);
    return html;
}
function structureContentSeed(block) {
    return JSON.stringify({
        id: block.id ?? "",
        width: block.width,
        height: block.height,
        atoms: block.atoms,
        bonds: block.bonds,
        labels: block.labels ?? [],
    });
}
export function renderStructureFragment(block, _context) {
    const width = block.width;
    const height = block.height;
    const placed = new Map();
    const xs = block.atoms.map((atom) => Number(atom.x));
    const ys = block.atoms.map((atom) => Number(atom.y));
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const spanX = Math.max(maxX - minX, 1e-9);
    const spanY = Math.max(maxY - minY, 1e-9);
    const margin = 48;
    const scale = Math.min((width - margin * 2) / spanX, (height - margin * 2) / spanY);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    for (const atom of block.atoms) {
        placed.set(atom.name, {
            atom,
            x: width / 2 + (Number(atom.x) - centerX) * scale,
            y: height / 2 - (Number(atom.y) - centerY) * scale,
        });
    }
    const parts = [];
    const stroke = "currentColor";
    const offsetParallel = (ax, ay, bx, by, distance) => {
        const dx = bx - ax;
        const dy = by - ay;
        const len = Math.hypot(dx, dy) || 1;
        return [ax - (dy / len) * distance, ay + (dx / len) * distance, bx - (dy / len) * distance, by + (dx / len) * distance];
    };
    for (const bond of block.bonds) {
        const from = placed.get(bond.from);
        const to = placed.get(bond.to);
        if (from === undefined || to === undefined)
            continue;
        const ax = quantize(from.x);
        const ay = quantize(from.y);
        const bx = quantize(to.x);
        const by = quantize(to.y);
        if (bond.stereo === "wedge") {
            // A short tapered wedge marks the stereocenter without obscuring its bonded atom.
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const len = Math.hypot(dx, dy) || 1;
            const wedgeEnd = WEDGE_LENGTH_RATIO;
            const endX = from.x + dx * wedgeEnd;
            const endY = from.y + dy * wedgeEnd;
            const px = (-dy / len) * 5;
            const py = (dx / len) * 5;
            parts.push(`<line x1="${quantize(endX)}" y1="${quantize(endY)}" x2="${bx}" y2="${by}" stroke="${stroke}" stroke-width="1.5"/><polygon points="${ax},${ay} ${quantize(endX + px)},${quantize(endY + py)} ${quantize(endX - px)},${quantize(endY - py)}" fill="${stroke}"/>`);
            continue;
        }
        if (bond.stereo === "hash") {
            // Perpendicular bars widen away from the stereocenter as a conventional hashed wedge.
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const len = Math.hypot(dx, dy) || 1;
            const px = -dy / len;
            const py = dx / len;
            for (let bar = 0; bar < 5; bar += 1) {
                const t = 0.2 + bar * 0.15;
                const halfWidth = 1 + t * 5;
                const centerX = from.x + dx * t;
                const centerY = from.y + dy * t;
                parts.push(`<line x1="${quantize(centerX + px * halfWidth)}" y1="${quantize(centerY + py * halfWidth)}" x2="${quantize(centerX - px * halfWidth)}" y2="${quantize(centerY - py * halfWidth)}" stroke="${stroke}" stroke-width="2"/>`);
            }
            continue;
        }
        if (bond.order === "1") {
            parts.push(`<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="${stroke}" stroke-width="1.5"/>`);
        }
        else if (bond.order === "2") {
            const [cax, cay, cbx, cby] = offsetParallel(from.x, from.y, to.x, to.y, 3);
            const [dax, day, dbx, dby] = offsetParallel(from.x, from.y, to.x, to.y, -3);
            parts.push(`<line x1="${quantize(cax)}" y1="${quantize(cay)}" x2="${quantize(cbx)}" y2="${quantize(cby)}" stroke="${stroke}" stroke-width="1.5"/><line x1="${quantize(dax)}" y1="${quantize(day)}" x2="${quantize(dbx)}" y2="${quantize(dby)}" stroke="${stroke}" stroke-width="1.5"/>`);
        }
        else if (bond.order === "3") {
            const [cax, cay, cbx, cby] = offsetParallel(from.x, from.y, to.x, to.y, 5);
            const [dax, day, dbx, dby] = offsetParallel(from.x, from.y, to.x, to.y, -5);
            parts.push(`<line x1="${quantize(cax)}" y1="${quantize(cay)}" x2="${quantize(cbx)}" y2="${quantize(cby)}" stroke="${stroke}" stroke-width="1.5"/><line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="${stroke}" stroke-width="1.5"/><line x1="${quantize(dax)}" y1="${quantize(day)}" x2="${quantize(dbx)}" y2="${quantize(dby)}" stroke="${stroke}" stroke-width="1.5"/>`);
        }
        else {
            // Aromatic renders as authored: solid plus inner dashed parallel.
            const [cax, cay, cbx, cby] = offsetParallel(from.x, from.y, to.x, to.y, 4);
            parts.push(`<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="${stroke}" stroke-width="1.5"/><line x1="${quantize(cax)}" y1="${quantize(cay)}" x2="${quantize(cbx)}" y2="${quantize(cby)}" stroke="${stroke}" stroke-width="1.5" stroke-dasharray="4 3"/>`);
        }
    }
    for (const placedAtom of placed.values()) {
        const { atom } = placedAtom;
        const x = quantize(placedAtom.x);
        const y = quantize(placedAtom.y);
        const text = atom.element ?? atom.attach ?? "";
        const isotope = atom.isotope === undefined ? "" : `<tspan baseline-shift="super" font-size="10">${atom.isotope}</tspan>`;
        const charge = atom.charge === undefined || atom.charge === 0
            ? ""
            : atom.charge === 1
                ? `<tspan baseline-shift="super" font-size="10">+</tspan>`
                : atom.charge === -1
                    ? `<tspan baseline-shift="super" font-size="10">−</tspan>`
                    : atom.charge > 0
                        ? `<tspan baseline-shift="super" font-size="10">${atom.charge}+</tspan>`
                        : `<tspan baseline-shift="super" font-size="10">${Math.abs(atom.charge)}−</tspan>`;
        const stereoMark = atom.stereo === "unspecified" ? `<title>stereochemistry explicitly unspecified</title>` : "";
        parts.push(`<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" font-size="16" fill="${stroke}" stroke="Canvas" stroke-width="4" paint-order="stroke" stroke-linejoin="round">${stereoMark}${isotope}${escapeXml(text)}${charge}</text>`);
    }
    for (const label of block.labels ?? []) {
        const x = width / 2 + (Number(label.x) - centerX) * scale;
        const y = height / 2 - (Number(label.y) - centerY) * scale;
        parts.push(`<text x="${quantize(x)}" y="${quantize(y)}" text-anchor="middle" font-size="14" font-style="italic" fill="currentColor" stroke="Canvas" stroke-width="3" paint-order="stroke" stroke-linejoin="round">${escapeXml(label.text)}</text>`);
    }
    const figureId = stableFigureId("aze-structure", structureContentSeed(block));
    const title = `Chemical structure${block.id === undefined ? "" : ` ${block.id}`} with ${block.atoms.length} atoms and ${block.bonds.length} bonds`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img"><title>${escapeXml(title)}</title><desc>${escapeXml(`${block.atoms.length} atoms, ${block.bonds.length} bonds in authored coordinates`)}</desc>${parts.join("")}</svg>`;
    assertChemistryFragmentSafe(svg);
    const label = block.id === undefined ? "" : ` data-structure-id="${escapeXml(block.id)}"`;
    const number = block.number === true ? ' data-structure-number="true"' : "";
    return `<figure class="aze-structure" id="${figureId}"${label}${number}>${svg}</figure>`;
}
/** Fingerprint closure joining the plot/geometry closures (contract §7). */
export function chemistryDependencyClosure() {
    return { emitter: CHEMISTRY_EMITTER_VERSION };
}
/* ------------------------------------------------------------------ *
 * Plugin descriptors (one family module, three plain-name directives)
 * ------------------------------------------------------------------ */
const formulaDescriptor = Object.freeze({
    type: FORMULA_PLUGIN_TYPE,
    version: FORMULA_PLUGIN_VERSION,
    title: "Chemical formula",
    summary: "Native chemical formulas parsed into semantic composition trees.",
    diagnosticNamespace: FORMULA_NAMESPACE,
    sourceSchema: formulaSourceSchema,
    bodySyntax: Object.freeze({
        id: FORMULA_BODY_SYNTAX_ID,
        version: FORMULA_BODY_SYNTAX_VERSION,
    }),
    dataSchema: formulaDataSchema,
});
export const formulaPlugin = Object.freeze({
    descriptor: formulaDescriptor,
});
const reactionDescriptor = Object.freeze({
    type: REACTION_PLUGIN_TYPE,
    version: REACTION_PLUGIN_VERSION,
    title: "Chemical reaction",
    summary: "Native reaction species lines with opt-in balance assertions.",
    diagnosticNamespace: REACTION_NAMESPACE,
    sourceSchema: reactionSourceSchema,
    bodySyntax: Object.freeze({
        id: REACTION_BODY_SYNTAX_ID,
        version: REACTION_BODY_SYNTAX_VERSION,
    }),
    dataSchema: reactionDataSchema,
});
export const reactionPlugin = Object.freeze({
    descriptor: reactionDescriptor,
});
const structureDescriptor = Object.freeze({
    type: STRUCTURE_PLUGIN_TYPE,
    version: STRUCTURE_PLUGIN_VERSION,
    title: "Molecular structure",
    summary: "Native 2D molecular graphs with authored coordinates and zero inference.",
    diagnosticNamespace: STRUCTURE_NAMESPACE,
    sourceSchema: structureSourceSchema,
    bodySyntax: Object.freeze({
        id: STRUCTURE_BODY_SYNTAX_ID,
        version: STRUCTURE_BODY_SYNTAX_VERSION,
    }),
    dataSchema: structureDataSchema,
});
export const structurePlugin = Object.freeze({
    descriptor: structureDescriptor,
});
export const FORMULA_HTML_BLOCK_RENDERER_ID = "azeforge.formula.html/v1";
export const REACTION_HTML_BLOCK_RENDERER_ID = "azeforge.reaction.html/v1";
export const STRUCTURE_HTML_BLOCK_RENDERER_ID = "azeforge.structure.html/v1";
export const CHEMISTRY_HTML_BLOCK_RENDERER_VERSION = "1.0.3";
export const formulaHtmlBlockRenderer = Object.freeze({
    descriptor: Object.freeze({
        id: FORMULA_HTML_BLOCK_RENDERER_ID,
        version: CHEMISTRY_HTML_BLOCK_RENDERER_VERSION,
        blockType: FORMULA_PLUGIN_TYPE,
        pluginVersionRange: "1.0.0",
        rendererId: "html",
        rendererVersionRange: "1.0.0",
    }),
    render(block, context) {
        return renderFormulaFragment(block, context);
    },
});
export const reactionHtmlBlockRenderer = Object.freeze({
    descriptor: Object.freeze({
        id: REACTION_HTML_BLOCK_RENDERER_ID,
        version: CHEMISTRY_HTML_BLOCK_RENDERER_VERSION,
        blockType: REACTION_PLUGIN_TYPE,
        pluginVersionRange: "1.0.0",
        rendererId: "html",
        rendererVersionRange: "1.0.0",
    }),
    render(block, context) {
        return renderReactionFragment(block, context);
    },
});
export const structureHtmlBlockRenderer = Object.freeze({
    descriptor: Object.freeze({
        id: STRUCTURE_HTML_BLOCK_RENDERER_ID,
        version: CHEMISTRY_HTML_BLOCK_RENDERER_VERSION,
        blockType: STRUCTURE_PLUGIN_TYPE,
        pluginVersionRange: "1.0.0",
        rendererId: "html",
        rendererVersionRange: "1.0.0",
    }),
    render(block, context) {
        return renderStructureFragment(block, context);
    },
});
//# sourceMappingURL=chemistry.js.map