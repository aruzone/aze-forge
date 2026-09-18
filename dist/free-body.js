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
import { parseCircuitText } from "./circuit-text.js";
import { FREE_BODY_BODY_SYNTAX_ID, FREE_BODY_BODY_SYNTAX_VERSION, FREE_BODY_PLUGIN_TYPE, FREE_BODY_PLUGIN_VERSION, freeBodyDataSchema, freeBodySourceSchema, } from "./control-schemas.js";
import { createDiagnostic } from "./diagnostics.js";
import { canonicalDecimal, didYouMean } from "./plot.js";
/* ------------------------------------------------------------------ *
 * Ceilings (contract §9 — one stable code for all ceilings)
 * ------------------------------------------------------------------ */
export const MAX_FREE_BODY_DECLARATIONS = 256;
export const MAX_FREE_BODY_POLYGON_VERTICES = 64;
export const MAX_FREE_BODY_LABEL_CHARS = 500;
export const MAX_FREE_BODY_COORDINATE_MAGNITUDE = 1_000_000;
export const MAX_FREE_BODY_DIMENSION_PX = 4096;
export const DEFAULT_FREE_BODY_WIDTH = 640;
export const DEFAULT_FREE_BODY_HEIGHT = 400;
const NAMESPACE = "azeforge.free-body";
const BLANK = /^[ \t]*$/;
const COMMENT = /^[ \t]*\/\/[^\n]*$/;
const FIELD_LINE = /^([ \t]*)([A-Za-z][A-Za-z0-9-]*)[ \t]*:(.*)$/;
const ITEM_OPEN = /^([ \t]*)-[ \t]*(.*)$/;
const KIND_OPEN = /^kind[ \t]*:[ \t]*(.*)$/;
const POSITIVE_INTEGER = /^[0-9]+$/;
/** One bounded coordinate domain-expression: `(x, y)`, brackets required. */
const COORDINATE_ATTACHMENT = /^\([ \t]*([^,()]*?)[ \t]*,[ \t]*([^,()]*?)[ \t]*\)$/;
export const BODY_KINDS = Object.freeze(["block", "circle", "polygon", "particle"]);
export const RECORD_KINDS = Object.freeze([
    "point",
    "line",
    "force",
    "moment",
    "axes",
    "angle-mark",
    "dimension",
]);
export const DECLARATION_KINDS = Object.freeze([
    ...BODY_KINDS,
    ...RECORD_KINDS,
]);
/** Fields each declaration kind accepts (contract §7, closed vocabulary). */
export const FIELDS_BY_KIND = Object.freeze({
    block: ["name", "x", "y", "width", "height", "angle", "visible"],
    circle: ["name", "x", "y", "radius", "visible"],
    polygon: ["name", "vertices", "visible"],
    particle: ["name", "x", "y", "visible"],
    point: ["name", "x", "y", "label", "visible"],
    line: ["name", "from", "to", "visible", "style"],
    force: ["at", "angle", "parallel-to", "perpendicular-to", "magnitude", "length", "label"],
    moment: ["at", "direction", "label"],
    axes: ["at", "angle", "x-label", "y-label"],
    "angle-mark": ["first", "vertex", "third", "label"],
    dimension: ["from", "to", "label"],
});
export const HEADER_FIELDS = Object.freeze([
    "scale",
    "id",
    "number",
    "title",
    "description",
    "width",
    "height",
    "bounds",
]);
export const BOUNDS_KEYS = Object.freeze(["min-x", "min-y", "max-x", "max-y"]);
export const STYLES = Object.freeze(["solid", "dashed"]);
export const MOMENT_DIRECTIONS = Object.freeze(["cw", "ccw"]);
/** The three closed direction forms; exactly one is authored per force. */
export const DIRECTION_FIELDS = Object.freeze([
    "angle",
    "parallel-to",
    "perpendicular-to",
]);
const DEFAULT_X_LABEL = "x";
const DEFAULT_Y_LABEL = "y";
/* ------------------------------------------------------------------ *
 * Diagnostics
 * ------------------------------------------------------------------ */
function diag(code, message, range, sourceName, extra = {}) {
    return createDiagnostic(`${NAMESPACE}#${code}`, extra.severity ?? "error", message, {
        location: sourceName === undefined ? { range } : { source: sourceName, range },
        ...(extra.suggestion === undefined ? {} : { suggestion: extra.suggestion }),
        ...(extra.data === undefined ? {} : { data: extra.data }),
    });
}
function limitExceeded(subject, count, limit, range, sourceName) {
    return diag("limit-exceeded", `Free-body ${subject} ${count} exceeds the limit of ${limit}.`, range, sourceName, { data: { subject, count, limit } });
}
/**
 * One spelling outside a closed set — a field outside the kind's registered
 * set, or a value outside a registered value set — as `#unknown-field` with
 * the key, the authored value and a did-you-mean over the vocabulary.
 */
function unregisteredField(owner, spelling, field, registered, sourceName) {
    return diag("unknown-field", `Free-body ${owner} "${spelling}" is not registered.`, field.range, sourceName, {
        data: { field: field.key, value: field.value },
        suggestion: vocabularySuggestion(spelling, registered),
    });
}
/** Did-you-mean over a registered vocabulary only, never an invented near-miss. */
function vocabularySuggestion(value, registered) {
    const spelled = didYouMean(value, registered);
    return spelled ?? `Registered values: ${registered.join(", ")}.`;
}
/**
 * The shared exact-decimal canonicalizer under the plot-numeral reading
 * (`1.50` ≡ `1.5`, and the one negative zero is `0`).
 */
function canonicalNumber(spelling) {
    return canonicalDecimal(spelling);
}
/**
 * Read one exact decimal: canonical plot-numeral form, finite, and inside the
 * family's coordinate ceiling when the caller declares a ceiling subject.
 */
function readDecimal(field, sourceName, diagnostics, ceilingSubject) {
    const text = canonicalNumber(field.value);
    const value = text === undefined ? Number.NaN : Number(text);
    if (text === undefined || !Number.isFinite(value)) {
        diagnostics.push(diag("invalid-coordinate", `Free-body value "${field.value}" for "${field.key}" is not a finite exact decimal.`, field.range, sourceName, { data: { field: field.key, value: field.value } }));
        return undefined;
    }
    if (ceilingSubject !== undefined && Math.abs(value) > MAX_FREE_BODY_COORDINATE_MAGNITUDE) {
        diagnostics.push(limitExceeded(ceilingSubject, Math.abs(value), MAX_FREE_BODY_COORDINATE_MAGNITUDE, field.range, sourceName));
        return undefined;
    }
    return { text, value };
}
/**
 * Read one authored angle: an exact decimal in degrees wrapped to [0, 360).
 * `#unknown-direction` is the family's single code for an angle or a direction
 * word that is not in its registered form — the contract registers no separate
 * angle code, and every one of these values picks a direction or a rotation.
 */
function readAngle(field, sourceName, diagnostics) {
    const canonical = canonicalNumber(field.value);
    if (canonical === undefined || !Number.isFinite(Number(canonical))) {
        diagnostics.push(diag("unknown-direction", `Free-body angle "${field.value}" is not an exact decimal in degrees.`, field.range, sourceName, { data: { field: field.key, value: field.value } }));
        return undefined;
    }
    let degrees = Number(canonical) % 360;
    if (degrees < 0)
        degrees += 360;
    if (Object.is(degrees, -0))
        degrees = 0;
    return canonicalDecimal(String(degrees)) ?? "0";
}
/** One authored inline text field, bounded and scanned by the shared vocabulary. */
function readText(field, owner, sourceName, diagnostics) {
    return parseCircuitText({
        raw: field.value,
        limit: MAX_FREE_BODY_LABEL_CHARS,
        invalid: (message) => {
            diagnostics.push(diag("invalid-label", `Free-body ${owner} is not plain single-line text. ${message}`, field.range, sourceName, { data: { field: field.key } }));
        },
        exceeded: (count) => {
            diagnostics.push(limitExceeded(field.key, count, MAX_FREE_BODY_LABEL_CHARS, field.range, sourceName));
        },
    });
}
/**
 * Validate the `bounds:` group into a `GeometryBounds`. Geometry's §6 group
 * shape is mirrored exactly (contiguous canonical-decimal keys, `bounds:`
 * declared once, the group closed by the next header field); the contract
 * assigns `#invalid-coordinate` to an absent or unusable key and reserves
 * `#invalid-bounds` for a box that is not strictly non-empty.
 */
function finishBounds(opener, fields, sourceName) {
    const diagnostics = [];
    const values = new Map();
    const authored = new Set();
    for (const field of fields) {
        if (authored.has(field.key)) {
            diagnostics.push(diag("duplicate-field", `Free-body bounds field "${field.key}" is declared twice.`, field.range, sourceName, { data: { field: field.key } }));
            continue;
        }
        authored.add(field.key);
        const canonical = canonicalNumber(field.value);
        if (canonical === undefined || !Number.isFinite(Number(canonical))) {
            diagnostics.push(diag("invalid-coordinate", `Free-body bounds field "${field.key}" value "${field.value}" is not a finite exact decimal.`, field.range, sourceName, { data: { field: field.key, value: field.value } }));
            continue;
        }
        values.set(field.key, canonical);
    }
    const missing = BOUNDS_KEYS.filter((key) => !authored.has(key));
    if (missing.length > 0) {
        diagnostics.push(diag("invalid-coordinate", `Free-body bounds require min-x, min-y, max-x, max-y (missing: ${missing.join(", ")}).`, opener, sourceName, { data: { field: "bounds", missing: [...missing] } }));
        return { diagnostics };
    }
    const minX = values.get("min-x") ?? "0";
    const minY = values.get("min-y") ?? "0";
    const maxX = values.get("max-x") ?? "0";
    const maxY = values.get("max-y") ?? "0";
    if (!(Number(minX) < Number(maxX) && Number(minY) < Number(maxY))) {
        diagnostics.push(diag("invalid-bounds", "Free-body bounds must be finite and non-empty (min < max on both axes).", opener, sourceName, { data: { field: "bounds" } }));
        return { diagnostics };
    }
    return { bounds: { minX, minY, maxX, maxY }, diagnostics };
}
function parseHeader(headerLines, sourceName) {
    const diagnostics = [];
    let id;
    let number;
    let title;
    let description;
    let scale;
    let width = DEFAULT_FREE_BODY_WIDTH;
    let height = DEFAULT_FREE_BODY_HEIGHT;
    let bounds;
    const seen = new Set();
    let boundsOpener;
    let boundsFields;
    const closeBounds = () => {
        if (boundsOpener === undefined || boundsFields === undefined)
            return;
        const parsed = finishBounds(boundsOpener, boundsFields, sourceName);
        diagnostics.push(...parsed.diagnostics);
        if (parsed.bounds !== undefined)
            bounds = parsed.bounds;
        boundsOpener = undefined;
        boundsFields = undefined;
    };
    for (const line of headerLines) {
        if (BLANK.test(line.text) || COMMENT.test(line.text))
            continue;
        const match = FIELD_LINE.exec(line.text);
        if (match === null) {
            diagnostics.push(diag("unknown-field", "A free-body header is one `key: value` field per line.", line.range, sourceName));
            continue;
        }
        const key = (match[2] ?? "").toLowerCase();
        const value = (match[3] ?? "").trim();
        if (key === "bounds") {
            closeBounds();
            if (seen.has("bounds")) {
                diagnostics.push(diag("duplicate-field", "Free-body header field \"bounds\" is declared twice.", line.range, sourceName, {
                    data: { field: "bounds" },
                }));
                continue;
            }
            seen.add("bounds");
            boundsOpener = line.range;
            boundsFields = [];
            continue;
        }
        if (boundsFields !== undefined && BOUNDS_KEYS.includes(key)) {
            boundsFields.push({ key, value, range: line.range });
            continue;
        }
        closeBounds();
        if (!HEADER_FIELDS.includes(key)) {
            diagnostics.push(diag("unknown-field", `Free-body header field "${key}" is not registered.`, line.range, sourceName, {
                data: { field: key, value },
                suggestion: vocabularySuggestion(key, HEADER_FIELDS),
            }));
            continue;
        }
        if (seen.has(key)) {
            diagnostics.push(diag("duplicate-field", `Free-body header field "${key}" is declared twice.`, line.range, sourceName, { data: { field: key } }));
            continue;
        }
        seen.add(key);
        const field = { key, value, range: line.range };
        if (key === "scale") {
            const canonical = canonicalNumber(value);
            if (canonical === undefined || !(Number(canonical) > 0)) {
                diagnostics.push(diag("invalid-scale", `Free-body scale "${value}" must be a finite exact decimal greater than 0.`, line.range, sourceName, { data: { field: "scale", value } }));
                continue;
            }
            scale = canonical;
            continue;
        }
        if (key === "id") {
            if (value === "") {
                diagnostics.push(diag("missing-field", "Free-body `id:` requires a value.", line.range, sourceName, {
                    data: { field: "id" },
                }));
                continue;
            }
            id = value;
            continue;
        }
        if (key === "number") {
            if (value !== "true" && value !== "false") {
                diagnostics.push(diag("unknown-field", 'Free-body "number:" must be true or false.', line.range, sourceName, { data: { field: "number", value } }));
                continue;
            }
            number = value === "true";
            continue;
        }
        if (key === "width" || key === "height") {
            if (!POSITIVE_INTEGER.test(value)) {
                diagnostics.push(diag("unknown-field", `Free-body "${key}:" must be a positive integer.`, line.range, sourceName, { data: { field: key, value } }));
                continue;
            }
            const parsed = Number.parseInt(value, 10);
            if (parsed <= 0 || parsed > MAX_FREE_BODY_DIMENSION_PX) {
                diagnostics.push(limitExceeded(key, parsed, MAX_FREE_BODY_DIMENSION_PX, line.range, sourceName));
                continue;
            }
            if (key === "width")
                width = parsed;
            else
                height = parsed;
            continue;
        }
        const text = readText(field, `\`${key}:\``, sourceName, diagnostics);
        if (text === undefined)
            continue;
        if (key === "title")
            title = text;
        else
            description = text;
    }
    closeBounds();
    return {
        header: {
            ...(id === undefined ? {} : { id }),
            ...(number === undefined ? {} : { number }),
            ...(title === undefined ? {} : { title }),
            ...(description === undefined ? {} : { description }),
            ...(scale === undefined ? {} : { scale }),
            width,
            height,
            ...(bounds === undefined ? {} : { bounds }),
        },
        diagnostics,
    };
}
const BODY_SHAPE = "Free-body body entries begin with `- kind:` and use flat `key: value` fields.";
function parseBody(bodyLines, diagnostics, sourceName) {
    const items = [];
    let kind;
    let kindRange;
    let fields = [];
    let collections = new Map();
    let openCollection;
    const flush = () => {
        if (kind === undefined || kindRange === undefined)
            return;
        items.push({ kind, range: kindRange, fields: [...fields], collections });
        kind = undefined;
        kindRange = undefined;
        fields = [];
        collections = new Map();
        openCollection = undefined;
    };
    for (const line of bodyLines) {
        if (BLANK.test(line.text) || COMMENT.test(line.text))
            continue;
        const item = ITEM_OPEN.exec(line.text);
        if (item !== null) {
            const rest = (item[2] ?? "").trim();
            const opened = KIND_OPEN.exec(rest);
            if (opened !== null) {
                flush();
                kind = (opened[1] ?? "").trim().toLowerCase();
                kindRange = line.range;
                continue;
            }
            if (openCollection !== undefined) {
                collections.get(openCollection)?.push({ value: rest, range: line.range });
                continue;
            }
            diagnostics.push(diag("unknown-declaration", BODY_SHAPE, line.range, sourceName));
            continue;
        }
        const field = FIELD_LINE.exec(line.text);
        if (field === null || kind === undefined) {
            diagnostics.push(diag(kind === undefined ? "unknown-declaration" : "unknown-field", kind === undefined
                ? BODY_SHAPE
                : `Free-body line "${line.text.trim()}" is not a "key: value" field.`, line.range, sourceName));
            continue;
        }
        const key = (field[2] ?? "").toLowerCase();
        const value = (field[3] ?? "").trim();
        if (value === "" && key === "vertices") {
            openCollection = key;
            collections.set(key, []);
            continue;
        }
        openCollection = undefined;
        fields.push({ key, value, range: line.range });
    }
    flush();
    return items;
}
const REFERENCEABLE = Object.freeze({
    block: "body",
    circle: "body",
    polygon: "body",
    particle: "body",
    point: "point",
    line: "line",
});
/* ------------------------------------------------------------------ *
 * Field reading
 * ------------------------------------------------------------------ */
function fieldMap(fields) {
    const map = new Map();
    for (const field of fields) {
        if (!map.has(field.key))
            map.set(field.key, field);
    }
    return map;
}
/** A required field: absent, or authored empty, is a missing field. */
function requireField(kind, fields, range, key, sourceName, diagnostics) {
    const field = fields.get(key);
    if (field === undefined || field.value === "") {
        diagnostics.push(diag("missing-field", `Free-body ${kind} requires a "${key}:" field.`, range, sourceName, {
            data: { field: key },
        }));
        return undefined;
    }
    return field;
}
/** An optional field: absent or authored empty carries no information. */
function optionalField(fields, key) {
    const field = fields.get(key);
    if (field === undefined || field.value === "")
        return undefined;
    return field;
}
function readVisible(kind, fields, fallback, sourceName, diagnostics) {
    const field = optionalField(fields, "visible");
    if (field === undefined)
        return fallback;
    if (field.value !== "true" && field.value !== "false") {
        diagnostics.push(diag("unknown-field", `Free-body ${kind} "visible:" must be true or false.`, field.range, sourceName, { data: { field: "visible", value: field.value } }));
        return fallback;
    }
    return field.value === "true";
}
/**
 * Read one attachment value: exactly one point name, or one bounded `(x, y)`
 * coordinate expression. A value that carries bracket or comma syntax and does
 * not parse as a coordinate pair is `#invalid-coordinate`, never a name.
 */
function readAttachment(field, sourceName, diagnostics) {
    const raw = field.value;
    const match = COORDINATE_ATTACHMENT.exec(raw);
    if (match !== null) {
        const x = canonicalNumber(match[1] ?? "");
        const y = canonicalNumber(match[2] ?? "");
        if (x !== undefined &&
            y !== undefined &&
            Number.isFinite(Number(x)) &&
            Number.isFinite(Number(y))) {
            const exceeded = [
                ["coordinate x", Number(x)],
                ["coordinate y", Number(y)],
            ].find(([, value]) => Math.abs(value) > MAX_FREE_BODY_COORDINATE_MAGNITUDE);
            if (exceeded !== undefined) {
                diagnostics.push(limitExceeded(exceeded[0], Math.abs(exceeded[1]), MAX_FREE_BODY_COORDINATE_MAGNITUDE, field.range, sourceName));
                return undefined;
            }
            return { kind: "coordinates", x, y, range: field.range };
        }
        diagnostics.push(diag("invalid-coordinate", `Free-body "${field.key}:" value "${raw}" is not a bounded \`(x, y)\` coordinate pair.`, field.range, sourceName, { data: { field: field.key, value: raw } }));
        return undefined;
    }
    if (raw.includes(",") || raw.includes("(") || raw.includes(")")) {
        diagnostics.push(diag("invalid-coordinate", `Free-body "${field.key}:" value "${raw}" is not a bounded \`(x, y)\` coordinate pair.`, field.range, sourceName, { data: { field: field.key, value: raw } }));
        return undefined;
    }
    return { kind: "point", name: raw, range: field.range };
}
/**
 * Resolve one point-name reference. A name no declaration owns is
 * `#unresolved-reference`; a name that owns a body or a line where the grammar
 * requires a point is `#invalid-reference-target`.
 */
function resolvePoint(name, range, names, sourceName, diagnostics) {
    const target = names.get(name);
    if (target === undefined) {
        diagnostics.push(diag("unresolved-reference", `Free-body reference "${name}" does not name a declared point.`, range, sourceName, { data: { name } }));
        return undefined;
    }
    if (target.reference !== "point") {
        diagnostics.push(diag("invalid-reference-target", `Free-body reference "${name}" names a ${target.reference}; a point is required here.`, range, sourceName, { data: { name, expected: "point" } }));
        return undefined;
    }
    return target.name;
}
/** Resolve one relative direction target: it must name a `line` record. */
function resolveLine(name, range, names, sourceName, diagnostics) {
    const target = names.get(name);
    if (target === undefined) {
        diagnostics.push(diag("unresolved-reference", `Free-body reference "${name}" does not name a declared line.`, range, sourceName, { data: { name } }));
        return undefined;
    }
    if (target.reference !== "line") {
        diagnostics.push(diag("invalid-reference-target", `Free-body direction target "${name}" names a ${target.reference}; a line is required.`, range, sourceName, { data: { name, expected: "line" } }));
        return undefined;
    }
    return target.name;
}
/** The scale switch (contract §8) reads presence, not values. */
function readScaleSwitch(context, subject) {
    const { fields, diagnostics, sourceName } = context;
    const magnitudeField = optionalField(fields, "magnitude");
    const lengthField = optionalField(fields, "length");
    const magnitude = magnitudeField === undefined
        ? undefined
        : readDecimal(magnitudeField, sourceName, diagnostics);
    const length = lengthField === undefined ? undefined : readDecimal(lengthField, sourceName, diagnostics);
    if (length !== undefined && !(length.value > 0)) {
        diagnostics.push(diag("invalid-coordinate", `Free-body schematic length "${lengthField?.value ?? ""}" must be an exact decimal greater than 0.`, lengthField?.range ?? context.raw.range, sourceName, { data: { field: "length", value: lengthField?.value ?? "" } }));
    }
    const conflict = (subject, reason, field) => {
        diagnostics.push(diag("scale-conflict", reason === "both"
            ? `Free-body ${subject} authors both \`magnitude:\` and \`length:\`; exactly one is permitted.`
            : reason === "length-with-scale"
                ? `Free-body ${subject} is under \`scale:\`, so its length is derived from \`magnitude:\` and \`length:\` is not permitted.`
                : `Free-body ${subject} has no \`scale:\`, so it is schematic: author \`length:\`, not \`magnitude:\`.`, field?.range ?? context.raw.range, sourceName, { data: { subject, reason } }));
    };
    if (magnitudeField !== undefined && lengthField !== undefined) {
        // The later of the two authored fields carries the conflict.
        const magnitudeOrder = context.raw.fields.findIndex((field) => field.key === "magnitude");
        const lengthOrder = context.raw.fields.findIndex((field) => field.key === "length");
        conflict(subject, "both", magnitudeOrder < lengthOrder ? lengthField : magnitudeField);
    }
    else if (context.scalePresent) {
        if (lengthField !== undefined)
            conflict(subject, "length-with-scale", lengthField);
        else if (magnitudeField === undefined) {
            diagnostics.push(diag("missing-field", `Free-body ${subject} is under \`scale:\` and requires a "magnitude:" field.`, context.raw.range, sourceName, { data: { field: "magnitude" } }));
        }
    }
    else if (magnitudeField !== undefined) {
        conflict(subject, "magnitude-without-scale", magnitudeField);
    }
    else if (lengthField === undefined) {
        diagnostics.push(diag("missing-field", `Free-body ${subject} is schematic and requires a positive "length:" field.`, context.raw.range, sourceName, { data: { field: "length" } }));
    }
    return { magnitude: magnitude?.text, length: length?.text };
}
/**
 * Exactly one of `angle:`, `parallel-to:`, `perpendicular-to:` (contract §7).
 * A relative form is checked for shape here and resolved by name in the
 * resolution pass, so a force may point at a line declared later.
 */
function readDirection(context, subject) {
    const { fields, diagnostics, sourceName } = context;
    const authored = DIRECTION_FIELDS.map((key) => fields.get(key)).filter((field) => field !== undefined);
    if (authored.length === 0) {
        diagnostics.push(diag("missing-field", `Free-body ${subject} requires exactly one direction form.`, context.raw.range, sourceName, { data: { fields: [...DIRECTION_FIELDS] } }));
        return undefined;
    }
    if (authored.length > 1) {
        diagnostics.push(diag("conflicting-fields", `Free-body ${subject} authors more than one direction form; exactly one is permitted.`, authored[1]?.range ?? context.raw.range, sourceName, { data: { fields: authored.map((field) => field.key) } }));
        return undefined;
    }
    const field = authored[0];
    if (field === undefined)
        return undefined;
    if (field.key === "angle") {
        if (field.value === "") {
            diagnostics.push(diag("missing-field", `Free-body ${subject} requires a value for "angle:".`, field.range, sourceName, {
                data: { field: "angle" },
            }));
            return undefined;
        }
        const degrees = readAngle(field, sourceName, diagnostics);
        if (degrees === undefined) {
            return undefined;
        }
        return { kind: "angle", degrees };
    }
    if (field.value === "") {
        diagnostics.push(diag("missing-field", `Free-body ${subject} requires a value for "${field.key}:".`, field.range, sourceName, { data: { field: field.key } }));
        return undefined;
    }
    return field.key === "parallel-to"
        ? { kind: "parallel-to", field }
        : { kind: "perpendicular-to", field };
}
function validateDeclaration(raw, context, index) {
    const { diagnostics, sourceName } = context;
    const fields = fieldMap(raw.fields);
    const allowed = FIELDS_BY_KIND[raw.kind] ?? [];
    const state = { ...context, raw, fields };
    const seenKeys = new Set();
    for (const field of raw.fields) {
        if (seenKeys.has(field.key)) {
            diagnostics.push(diag("duplicate-field", `Free-body ${raw.kind} field "${field.key}" is declared twice.`, field.range, sourceName, { data: { field: field.key } }));
            continue;
        }
        seenKeys.add(field.key);
        if (!allowed.includes(field.key)) {
            diagnostics.push(unregisteredField(`${raw.kind} field`, field.key, field, allowed, sourceName));
        }
    }
    const labelField = optionalField(fields, "label");
    const readLabel = (owner) => labelField === undefined ? undefined : readText(labelField, owner, sourceName, diagnostics);
    const reference = REFERENCEABLE[raw.kind];
    let name = "";
    if (reference !== undefined) {
        const nameField = requireField(raw.kind, fields, raw.range, "name", sourceName, diagnostics);
        if (nameField === undefined)
            return undefined;
        name = nameField.value;
    }
    const readOffset = (key) => {
        const field = requireField(raw.kind, fields, raw.range, key, sourceName, diagnostics);
        if (field === undefined)
            return undefined;
        return readDecimal(field, sourceName, diagnostics, `coordinate ${key}`);
    };
    const readAngleField = (key, fallback) => {
        const field = optionalField(fields, key);
        if (field === undefined)
            return fallback;
        return readAngle(field, sourceName, diagnostics);
    };
    switch (raw.kind) {
        case "block": {
            const x = readOffset("x");
            const y = readOffset("y");
            const width = readSize(fields, raw.range, "width", sourceName, diagnostics);
            const height = readSize(fields, raw.range, "height", sourceName, diagnostics);
            const angle = readAngleField("angle", "0");
            const visible = readVisible(raw.kind, fields, true, sourceName, diagnostics);
            if (x === undefined || y === undefined || width === undefined || height === undefined || angle === undefined) {
                return undefined;
            }
            return { kind: "block", range: raw.range, index, name, x: x.text, y: y.text, width, height, angle, visible };
        }
        case "circle": {
            const x = readOffset("x");
            const y = readOffset("y");
            const radius = readRadius(fields, raw.range, sourceName, diagnostics);
            const visible = readVisible(raw.kind, fields, true, sourceName, diagnostics);
            if (x === undefined || y === undefined || radius === undefined)
                return undefined;
            return { kind: "circle", range: raw.range, index, name, x: x.text, y: y.text, radius, visible };
        }
        case "particle": {
            const x = readOffset("x");
            const y = readOffset("y");
            const visible = readVisible(raw.kind, fields, true, sourceName, diagnostics);
            if (x === undefined || y === undefined)
                return undefined;
            return { kind: "particle", range: raw.range, index, name, x: x.text, y: y.text, visible };
        }
        case "point": {
            const x = readOffset("x");
            const y = readOffset("y");
            const label = readLabel(`point \`label:\``);
            const visible = readVisible(raw.kind, fields, true, sourceName, diagnostics);
            if (x === undefined || y === undefined)
                return undefined;
            return { kind: "point", range: raw.range, index, name, x: x.text, y: y.text, label, visible };
        }
        case "polygon": {
            const entries = raw.collections.get("vertices");
            const visible = readVisible(raw.kind, fields, true, sourceName, diagnostics);
            if (entries === undefined || entries.length === 0) {
                diagnostics.push(diag("missing-field", 'Free-body polygon requires a "vertices:" collection of point references.', raw.range, sourceName, { data: { field: "vertices", count: 0 } }));
                return undefined;
            }
            if (entries.length > MAX_FREE_BODY_POLYGON_VERTICES) {
                diagnostics.push(limitExceeded("polygon vertices", entries.length, MAX_FREE_BODY_POLYGON_VERTICES, raw.range, sourceName));
                return undefined;
            }
            if (entries.length < 3) {
                diagnostics.push(diag("missing-field", `Free-body polygon requires at least 3 vertex references and authors ${entries.length}.`, raw.range, sourceName, { data: { field: "vertices", count: entries.length } }));
                return undefined;
            }
            return { kind: "polygon", range: raw.range, index, name, visible, vertices: entries, resolvedVertices: [] };
        }
        case "line": {
            const from = requireField(raw.kind, fields, raw.range, "from", sourceName, diagnostics);
            const to = requireField(raw.kind, fields, raw.range, "to", sourceName, diagnostics);
            const styleField = optionalField(fields, "style");
            let style = "solid";
            if (styleField !== undefined) {
                if (!STYLES.includes(styleField.value)) {
                    diagnostics.push(unregisteredField("line style", styleField.value, styleField, STYLES, sourceName));
                }
                else {
                    style = styleField.value;
                }
            }
            const visible = readVisible(raw.kind, fields, false, sourceName, diagnostics);
            if (from === undefined || to === undefined)
                return undefined;
            return {
                kind: "line",
                range: raw.range,
                index,
                name,
                visible,
                style,
                from,
                to,
                resolvedFrom: undefined,
                resolvedTo: undefined,
            };
        }
        case "force": {
            const subject = `force[${index}]`;
            const atField = requireField(raw.kind, fields, raw.range, "at", sourceName, diagnostics);
            const at = atField === undefined ? undefined : readAttachment(atField, sourceName, diagnostics);
            const direction = readDirection(state, subject);
            const { magnitude, length } = readScaleSwitch(state, subject);
            const label = readLabel(`force \`label:\``);
            if (at === undefined || direction === undefined)
                return undefined;
            return {
                kind: "force",
                range: raw.range,
                index,
                at,
                direction,
                magnitude,
                length,
                label,
                resolvedAt: undefined,
                resolvedDirection: undefined,
            };
        }
        case "moment": {
            const atField = requireField(raw.kind, fields, raw.range, "at", sourceName, diagnostics);
            const at = atField === undefined ? undefined : readAttachment(atField, sourceName, diagnostics);
            const directionField = requireField(raw.kind, fields, raw.range, "direction", sourceName, diagnostics);
            let direction;
            if (directionField !== undefined) {
                if (directionField.value === "cw" || directionField.value === "ccw") {
                    direction = directionField.value;
                }
                else {
                    diagnostics.push(diag("unknown-direction", `Free-body moment direction "${directionField.value}" is not registered.`, directionField.range, sourceName, {
                        data: { field: "direction", value: directionField.value },
                        suggestion: vocabularySuggestion(directionField.value, MOMENT_DIRECTIONS),
                    }));
                }
            }
            const label = readLabel(`moment \`label:\``);
            if (at === undefined || direction === undefined)
                return undefined;
            return { kind: "moment", range: raw.range, index, at, direction, label, resolvedAt: undefined };
        }
        case "axes": {
            const atField = requireField(raw.kind, fields, raw.range, "at", sourceName, diagnostics);
            const at = atField === undefined ? undefined : readAttachment(atField, sourceName, diagnostics);
            const angle = readAngleField("angle", "0");
            const xLabel = readAxisLabel(fields, "x-label", DEFAULT_X_LABEL, sourceName, diagnostics);
            const yLabel = readAxisLabel(fields, "y-label", DEFAULT_Y_LABEL, sourceName, diagnostics);
            if (at === undefined || angle === undefined)
                return undefined;
            return { kind: "axes", range: raw.range, index, at, angle, xLabel, yLabel, resolvedAt: undefined };
        }
        case "angle-mark": {
            const first = requireField(raw.kind, fields, raw.range, "first", sourceName, diagnostics);
            const vertex = requireField(raw.kind, fields, raw.range, "vertex", sourceName, diagnostics);
            const third = requireField(raw.kind, fields, raw.range, "third", sourceName, diagnostics);
            const label = readLabel(`angle-mark \`label:\``);
            if (first === undefined || vertex === undefined || third === undefined)
                return undefined;
            return {
                kind: "angle-mark",
                range: raw.range,
                index,
                first,
                vertex,
                third,
                label,
                resolvedFirst: undefined,
                resolvedVertex: undefined,
                resolvedThird: undefined,
            };
        }
        case "dimension": {
            const fromField = requireField(raw.kind, fields, raw.range, "from", sourceName, diagnostics);
            const toField = requireField(raw.kind, fields, raw.range, "to", sourceName, diagnostics);
            const from = fromField === undefined ? undefined : readAttachment(fromField, sourceName, diagnostics);
            const to = toField === undefined ? undefined : readAttachment(toField, sourceName, diagnostics);
            const labelFieldRequired = requireField(raw.kind, fields, raw.range, "label", sourceName, diagnostics);
            const label = labelFieldRequired === undefined
                ? undefined
                : readText(labelFieldRequired, "dimension `label:`", sourceName, diagnostics);
            if (from === undefined || to === undefined || label === undefined)
                return undefined;
            return { kind: "dimension", range: raw.range, index, from, to, label, resolvedFrom: undefined, resolvedTo: undefined };
        }
        default:
            return undefined;
    }
}
/** A body size: an exact decimal, canonicalized, with no magnitude ceiling. */
function readSize(fields, range, key, sourceName, diagnostics) {
    const field = requireField("block", fields, range, key, sourceName, diagnostics);
    if (field === undefined)
        return undefined;
    return readDecimal(field, sourceName, diagnostics)?.text;
}
function readRadius(fields, range, sourceName, diagnostics) {
    const field = requireField("circle", fields, range, "radius", sourceName, diagnostics);
    if (field === undefined)
        return undefined;
    return readDecimal(field, sourceName, diagnostics, "radius")?.text;
}
function readAxisLabel(fields, key, fallback, sourceName, diagnostics) {
    const field = optionalField(fields, key);
    if (field === undefined)
        return [{ kind: "text", value: fallback }];
    return readText(field, `axes \`${key}:\``, sourceName, diagnostics) ?? [
        { kind: "text", value: fallback },
    ];
}
function attachmentPosition(attachment, points) {
    if (attachment === undefined)
        return undefined;
    if (attachment.kind === "coordinates") {
        return { x: Number(attachment.x), y: Number(attachment.y) };
    }
    return points.get(attachment.name);
}
/**
 * Sample points that describe one resolved object's extent. Rotation is
 * trigonometry on authored facts; a vector's drawn tip is deliberately absent
 * because it depends on the ray rule and the scale switch, which are
 * resolution arithmetic rather than authored coordinates.
 */
function extents(declaration, points) {
    switch (declaration.kind) {
        case "block": {
            const cx = Number(declaration.x);
            const cy = Number(declaration.y);
            const halfWidth = Number(declaration.width) / 2;
            const halfHeight = Number(declaration.height) / 2;
            const radians = (Number(declaration.angle) * Math.PI) / 180;
            const cos = Math.cos(radians);
            const sin = Math.sin(radians);
            return [
                [halfWidth, halfHeight],
                [-halfWidth, halfHeight],
                [-halfWidth, -halfHeight],
                [halfWidth, -halfHeight],
            ].map(([dx = 0, dy = 0]) => ({
                x: cx + dx * cos - dy * sin,
                y: cy + dx * sin + dy * cos,
            }));
        }
        case "circle": {
            const cx = Number(declaration.x);
            const cy = Number(declaration.y);
            const radius = Number(declaration.radius);
            return [
                { x: cx - radius, y: cy },
                { x: cx + radius, y: cy },
                { x: cx, y: cy - radius },
                { x: cx, y: cy + radius },
            ];
        }
        case "polygon":
            return declaration.resolvedVertices
                .map((name) => points.get(name))
                .filter((point) => point !== undefined);
        case "particle":
            return [{ x: Number(declaration.x), y: Number(declaration.y) }];
        case "point":
            return [{ x: Number(declaration.x), y: Number(declaration.y) }];
        case "line":
            return [declaration.resolvedFrom, declaration.resolvedTo]
                .map((name) => (name === undefined ? undefined : points.get(name)))
                .filter((point) => point !== undefined);
        case "angle-mark":
            return [declaration.resolvedFirst, declaration.resolvedVertex, declaration.resolvedThird]
                .map((name) => (name === undefined ? undefined : points.get(name)))
                .filter((point) => point !== undefined);
        case "force":
        case "moment":
        case "axes": {
            const position = attachmentPosition(declaration.resolvedAt, points);
            return position === undefined ? [] : [position];
        }
        case "dimension": {
            const from = attachmentPosition(declaration.resolvedFrom, points);
            const to = attachmentPosition(declaration.resolvedTo, points);
            return [from, to].filter((point) => point !== undefined);
        }
    }
}
/**
 * The label a warning names this declaration by: its authored name for the
 * referenceables, a positional `kind[index]` label for the anonymous records
 * (forces, moments, axes, angle-marks and dimensions), which carry no name.
 */
function declarationLabel(declaration) {
    return "name" in declaration ? declaration.name : `${declaration.kind}[${declaration.index}]`;
}
/* ------------------------------------------------------------------ *
 * Block validation
 * ------------------------------------------------------------------ */
/**
 * Validate one `:::: free-body` Block: header, closed declaration vocabulary,
 * two-pass reference resolution, the scale switch, ceilings and the family's
 * two warnings. An error publishes no Block; warnings are computed only for a
 * sound declaration list.
 */
export function validateFreeBodyBlock(options) {
    const { headerLines, bodyLines, blockRange, sourceName } = options;
    const diagnostics = [];
    const parsedHeader = parseHeader(headerLines, sourceName);
    diagnostics.push(...parsedHeader.diagnostics);
    const header = parsedHeader.header;
    const items = parseBody(bodyLines, diagnostics, sourceName);
    if (items.length === 0) {
        diagnostics.push(diag("empty", "A free-body Block requires at least one declaration.", blockRange, sourceName));
        return { diagnostics };
    }
    if (items.length > MAX_FREE_BODY_DECLARATIONS) {
        diagnostics.push(limitExceeded("declarations", items.length, MAX_FREE_BODY_DECLARATIONS, blockRange, sourceName));
    }
    /* Pass 1 — names. One Block-local namespace over the referenceables, in
     * authored order, first declaration wins; no name is created implicitly. */
    const names = new Map();
    const points = new Map();
    const seenKinds = new Map();
    const declarations = [];
    for (const raw of items) {
        if (!DECLARATION_KINDS.includes(raw.kind)) {
            diagnostics.push(diag("unknown-declaration", `Free-body declaration kind "${raw.kind}" is not registered.`, raw.range, sourceName, {
                data: { kind: raw.kind },
                suggestion: vocabularySuggestion(raw.kind, DECLARATION_KINDS),
            }));
            continue;
        }
        const index = seenKinds.get(raw.kind) ?? 0;
        seenKinds.set(raw.kind, index + 1);
        const declaration = validateDeclaration(raw, { scalePresent: header.scale !== undefined, sourceName, diagnostics }, index);
        if (declaration === undefined) {
            continue;
        }
        declarations.push(declaration);
        const name = "name" in declaration ? declaration.name : undefined;
        if (name !== undefined) {
            if (names.has(name)) {
                diagnostics.push(diag("duplicate-name", `Free-body name "${name}" is already declared in this Block.`, declaration.range, sourceName, { data: { name } }));
            }
            else {
                const reference = REFERENCEABLE[declaration.kind];
                if (reference !== undefined)
                    names.set(name, { name, reference });
                if (declaration.kind === "point") {
                    points.set(name, { x: Number(declaration.x), y: Number(declaration.y) });
                }
            }
        }
    }
    /* Pass 2 — references, in authored order; forward references are legal. */
    const referenced = new Set();
    for (const declaration of declarations) {
        switch (declaration.kind) {
            case "polygon": {
                const resolved = [];
                for (const entry of declaration.vertices) {
                    const name = resolvePoint(entry.value, entry.range, names, sourceName, diagnostics);
                    if (name === undefined) {
                        continue;
                    }
                    resolved.push(name);
                    referenced.add(name);
                }
                declaration.resolvedVertices = resolved;
                break;
            }
            case "line": {
                const from = resolvePoint(declaration.from.value, declaration.from.range, names, sourceName, diagnostics);
                const to = resolvePoint(declaration.to.value, declaration.to.range, names, sourceName, diagnostics);
                if (from === undefined || to === undefined) {
                    break;
                }
                declaration.resolvedFrom = from;
                declaration.resolvedTo = to;
                referenced.add(from);
                referenced.add(to);
                break;
            }
            case "angle-mark": {
                const first = resolvePoint(declaration.first.value, declaration.first.range, names, sourceName, diagnostics);
                const vertex = resolvePoint(declaration.vertex.value, declaration.vertex.range, names, sourceName, diagnostics);
                const third = resolvePoint(declaration.third.value, declaration.third.range, names, sourceName, diagnostics);
                if (first === undefined || vertex === undefined || third === undefined) {
                    break;
                }
                declaration.resolvedFirst = first;
                declaration.resolvedVertex = vertex;
                declaration.resolvedThird = third;
                referenced.add(first);
                referenced.add(vertex);
                referenced.add(third);
                break;
            }
            case "force": {
                const direction = declaration.direction;
                const at = resolveAttachment(declaration.at, names, sourceName, diagnostics);
                let resolved;
                if (direction !== undefined && direction.kind === "angle") {
                    resolved = { kind: "angle", degrees: direction.degrees };
                }
                else if (direction !== undefined) {
                    const line = resolveLine(direction.field.value, direction.field.range, names, sourceName, diagnostics);
                    if (line !== undefined) {
                        resolved = { kind: direction.kind, line };
                        referenced.add(line);
                    }
                }
                if (at === undefined || resolved === undefined) {
                    break;
                }
                declaration.resolvedAt = at;
                declaration.resolvedDirection = resolved;
                if (at.kind === "point")
                    referenced.add(at.name);
                break;
            }
            case "moment":
            case "axes": {
                const at = resolveAttachment(declaration.at, names, sourceName, diagnostics);
                if (at === undefined) {
                    break;
                }
                declaration.resolvedAt = at;
                if (at.kind === "point")
                    referenced.add(at.name);
                break;
            }
            case "dimension": {
                const from = resolveAttachment(declaration.from, names, sourceName, diagnostics);
                const to = resolveAttachment(declaration.to, names, sourceName, diagnostics);
                if (from === undefined || to === undefined) {
                    break;
                }
                declaration.resolvedFrom = from;
                declaration.resolvedTo = to;
                for (const attachment of [from, to]) {
                    if (attachment.kind === "point")
                        referenced.add(attachment.name);
                }
                break;
            }
            default:
                break;
        }
    }
    /* Warnings describe a Block that exists; an error publishes none. */
    const errored = diagnostics.some((diagnostic) => diagnostic.severity === "error");
    if (!errored) {
        for (const declaration of declarations) {
            const name = "name" in declaration ? declaration.name : undefined;
            const invisible = "visible" in declaration && !declaration.visible;
            if (name !== undefined && invisible && !referenced.has(name)) {
                diagnostics.push(diag("unused-declaration", `Free-body ${declaration.kind} "${name}" is invisible and referenced by nothing.`, declaration.range, sourceName, { severity: "warning", data: { name } }));
            }
            const bounds = header.bounds;
            if (bounds === undefined)
                continue;
            const minX = Number(bounds.minX);
            const maxX = Number(bounds.maxX);
            const minY = Number(bounds.minY);
            const maxY = Number(bounds.maxY);
            const escaped = extents(declaration, points).some((point) => point.x < minX || point.x > maxX || point.y < minY || point.y > maxY);
            if (escaped) {
                const label = declarationLabel(declaration);
                diagnostics.push(diag("out-of-bounds", `Free-body ${label} lies outside the authored bounds.`, declaration.range, sourceName, { severity: "warning", data: { names: [label] } }));
            }
        }
    }
    if (errored)
        return { diagnostics };
    return { diagnostics, block: publishBlock(header, blockRange, declarations) };
}
function resolveAttachment(attachment, names, sourceName, diagnostics) {
    if (attachment.kind === "coordinates") {
        return { kind: "coordinates", x: attachment.x, y: attachment.y };
    }
    const name = resolvePoint(attachment.name, attachment.range, names, sourceName, diagnostics);
    return name === undefined ? undefined : { kind: "point", name };
}
/* ------------------------------------------------------------------ *
 * Block publication
 * ------------------------------------------------------------------ */
function publishDeclaration(declaration) {
    switch (declaration.kind) {
        case "block": {
            const body = {
                kind: "block",
                name: declaration.name,
                x: declaration.x,
                y: declaration.y,
                width: declaration.width,
                height: declaration.height,
                angle: declaration.angle,
                visible: declaration.visible,
                range: declaration.range,
            };
            return body;
        }
        case "circle": {
            const body = {
                kind: "circle",
                name: declaration.name,
                x: declaration.x,
                y: declaration.y,
                radius: declaration.radius,
                visible: declaration.visible,
                range: declaration.range,
            };
            return body;
        }
        case "particle": {
            const body = {
                kind: "particle",
                name: declaration.name,
                x: declaration.x,
                y: declaration.y,
                visible: declaration.visible,
                range: declaration.range,
            };
            return body;
        }
        case "polygon": {
            const body = {
                kind: "polygon",
                name: declaration.name,
                vertices: declaration.resolvedVertices,
                visible: declaration.visible,
                range: declaration.range,
            };
            return body;
        }
        case "point": {
            const point = {
                kind: "point",
                name: declaration.name,
                ...(declaration.label === undefined ? {} : { label: declaration.label }),
                x: declaration.x,
                y: declaration.y,
                visible: declaration.visible,
                range: declaration.range,
            };
            return point;
        }
        case "line": {
            if (declaration.resolvedFrom === undefined || declaration.resolvedTo === undefined)
                return undefined;
            const line = {
                kind: "line",
                name: declaration.name,
                from: declaration.resolvedFrom,
                to: declaration.resolvedTo,
                visible: declaration.visible,
                style: declaration.style,
                range: declaration.range,
            };
            return line;
        }
        case "force": {
            if (declaration.resolvedAt === undefined || declaration.resolvedDirection === undefined) {
                return undefined;
            }
            const force = {
                kind: "force",
                at: declaration.resolvedAt,
                direction: declaration.resolvedDirection,
                ...(declaration.magnitude === undefined ? {} : { magnitude: declaration.magnitude }),
                ...(declaration.length === undefined ? {} : { length: declaration.length }),
                ...(declaration.label === undefined ? {} : { label: declaration.label }),
                range: declaration.range,
            };
            return force;
        }
        case "moment": {
            if (declaration.resolvedAt === undefined)
                return undefined;
            const moment = {
                kind: "moment",
                at: declaration.resolvedAt,
                direction: declaration.direction,
                ...(declaration.label === undefined ? {} : { label: declaration.label }),
                range: declaration.range,
            };
            return moment;
        }
        case "axes": {
            if (declaration.resolvedAt === undefined)
                return undefined;
            const axes = {
                kind: "axes",
                at: declaration.resolvedAt,
                angle: declaration.angle,
                xLabel: declaration.xLabel,
                yLabel: declaration.yLabel,
                range: declaration.range,
            };
            return axes;
        }
        case "angle-mark": {
            if (declaration.resolvedFirst === undefined ||
                declaration.resolvedVertex === undefined ||
                declaration.resolvedThird === undefined) {
                return undefined;
            }
            const mark = {
                kind: "angle-mark",
                first: declaration.resolvedFirst,
                vertex: declaration.resolvedVertex,
                third: declaration.resolvedThird,
                ...(declaration.label === undefined ? {} : { label: declaration.label }),
                range: declaration.range,
            };
            return mark;
        }
        case "dimension": {
            if (declaration.resolvedFrom === undefined || declaration.resolvedTo === undefined)
                return undefined;
            const dimension = {
                kind: "dimension",
                from: declaration.resolvedFrom,
                to: declaration.resolvedTo,
                label: declaration.label,
                range: declaration.range,
            };
            return dimension;
        }
    }
}
function publishBlock(header, blockRange, declarations) {
    const published = [];
    for (const declaration of declarations) {
        const item = publishDeclaration(declaration);
        if (item !== undefined)
            published.push(item);
    }
    return {
        kind: "free-body",
        pluginVersion: FREE_BODY_PLUGIN_VERSION,
        range: blockRange,
        ...(header.id === undefined ? {} : { id: header.id }),
        ...(header.number === undefined ? {} : { number: header.number }),
        ...(header.title === undefined ? {} : { title: header.title }),
        ...(header.description === undefined ? {} : { description: header.description }),
        ...(header.scale === undefined ? {} : { scale: header.scale }),
        width: header.width,
        height: header.height,
        ...(header.bounds === undefined ? {} : { bounds: header.bounds }),
        declarations: published,
    };
}
/* ------------------------------------------------------------------ *
 * Plugin descriptor
 * ------------------------------------------------------------------ */
const descriptor = Object.freeze({
    type: FREE_BODY_PLUGIN_TYPE,
    version: FREE_BODY_PLUGIN_VERSION,
    title: "Free-body diagrams",
    summary: "Native two-dimensional free-body diagrams: authored bodies, points and lines carrying force vectors, moments, axes, angle marks and dimensions over an exact-decimal frame, with an explicit `scale:` switching forces from schematic length to magnitude.",
    diagnosticNamespace: NAMESPACE,
    sourceSchema: freeBodySourceSchema,
    bodySyntax: Object.freeze({
        id: FREE_BODY_BODY_SYNTAX_ID,
        version: FREE_BODY_BODY_SYNTAX_VERSION,
    }),
    dataSchema: freeBodyDataSchema,
});
export const freeBodyPlugin = Object.freeze({ descriptor });
//# sourceMappingURL=free-body.js.map