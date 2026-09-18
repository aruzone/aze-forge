/**
 * Native control signal-flow diagrams (contract: issue #65 "Define native
 * control and free-body diagram semantics").
 *
 * One `:::: control` Block carries a single flat ordered declaration list of
 * SISO function blocks, summing junctions, directional boundary stubs and
 * anonymous signal edges over one Block-local name namespace. Summing signs
 * are a bounded domain expression that pairs positionally with a junction's
 * in-edges in authored declaration order, so the sign list is recorded on the
 * Block rather than left to the renderer. Takeoff points are implicit
 * fan-out — two or more out-edges from one item — and are never modelled as
 * entities. Feedback is an ordinary graph shape: the compiler records it and
 * never enforces it.
 *
 * Nothing here measures, lays out or renders: this module validates authored
 * source, resolves references two-pass (forward references are legal for edge
 * endpoints) and publishes one `ControlBlock`.
 *
 * Diagnostics posture: the family registers one error per structural fault and
 * a single warning that describes the shape of a valid Block. Warnings are
 * computed only when the declaration list is sound, because an error publishes
 * no `ControlBlock` and a warning about a graph that was never built is noise.
 */
import { parseCircuitText, circuitTextValue } from "./circuit-text.js";
import { CONTROL_BODY_SYNTAX_ID, CONTROL_BODY_SYNTAX_VERSION, CONTROL_PLUGIN_TYPE, CONTROL_PLUGIN_VERSION, controlDataSchema, controlSourceSchema, } from "./control-schemas.js";
import { createDiagnostic } from "./diagnostics.js";
import { didYouMean } from "./plot.js";
/* ------------------------------------------------------------------ *
 * Ceilings (contract §5). One code for every ceiling: `#limit-exceeded`.
 * ------------------------------------------------------------------ */
export const MAX_CONTROL_DECLARATIONS = 256;
export const MAX_CONTROL_BLOCKS = 64;
export const MAX_CONTROL_SUMS = 32;
export const MAX_CONTROL_STUBS = 32;
export const MAX_CONTROL_EDGES = 128;
export const MAX_CONTROL_SIGNS_PER_SUM = 8;
export const MAX_CONTROL_LABEL_CODE_POINTS = 500;
export const MAX_CONTROL_TOTAL_LABEL_CODE_POINTS = 16384;
/** The versioned built-in `flow:` value; omission carries no information. */
export const DEFAULT_CONTROL_FLOW = "left-to-right";
const NAMESPACE = "azeforge.control";
const FIELD = /^[ \t]*([A-Za-z][A-Za-z0-9-]*)[ \t]*:(.*)$/;
const ITEM = /^[ \t]*-[ \t]*(.*)$/;
const ENTRY = /^[ \t]*([A-Za-z][A-Za-z0-9-]*)[ \t]*:[ \t]*(.*)$/;
const COMMENT = /^[ \t]*\/\/(?:[ \t].*)?$/;
export const FLOWS = ["top-to-bottom", "bottom-to-top", "left-to-right", "right-to-left"];
export const SIGNS = ["+", "-"];
export const DECLARATION_KINDS = ["block", "sum", "input", "output", "edge"];
export const HEADER_FIELDS = Object.freeze(["flow", "id", "number", "title", "description"]);
export const BLOCK_FIELDS = Object.freeze(["name", "tf", "label"]);
export const SUM_FIELDS = Object.freeze(["name", "signs"]);
export const STUB_FIELDS = Object.freeze(["name", "label"]);
export const EDGE_FIELDS = Object.freeze(["from", "to", "label"]);
/**
 * Port vocabulary. Every port of every item warns once when no edge touches
 * it; an `input` stub sources edges and an `output` stub sinks them.
 */
const PORTS = Object.freeze({
    block: ["in", "out"],
    sum: ["in", "out"],
    input: ["out"],
    output: ["in"],
});
/* ------------------------------------------------------------------ *
 * Diagnostics
 * ------------------------------------------------------------------ */
function diag(code, message, range, sourceName, data, suggestion) {
    return createDiagnostic(`${NAMESPACE}#${code}`, "error", message, {
        location: sourceName === undefined ? { range } : { source: sourceName, range },
        ...(data === undefined ? {} : { data }),
        ...(suggestion === undefined ? {} : { suggestion }),
    });
}
/**
 * Did-you-mean over a registered vocabulary only: a proposal the reader can
 * act on, never an invented near-miss outside the contract's closed sets.
 */
function vocabularySuggestion(value, registered) {
    const spelled = didYouMean(value, registered);
    return spelled ?? `Registered values: ${registered.join(", ")}.`;
}
function warn(code, message, range, sourceName, data) {
    return createDiagnostic(`${NAMESPACE}#${code}`, "warning", message, {
        location: sourceName === undefined ? { range } : { source: sourceName, range },
        data,
    });
}
function limitExceeded(subject, count, limit, range, sourceName) {
    return diag("limit-exceeded", `Control ${subject} ${count} exceeds ${limit}.`, range, sourceName, { subject, count, limit });
}
function oneOf(values, value) {
    return values.includes(value);
}
/** Field key spelled by one authored line, for a diagnostic about that line. */
function declarationKey(text) {
    const match = /^[ \t]*(?:-[ \t]*)?([A-Za-z][A-Za-z0-9-]*)[ \t]*:/.exec(text);
    return match?.[1]?.toLowerCase() ?? text.trim();
}
const BODY_SHAPE = "Control body entries begin with `- kind:` and use flat `key: value` fields.";
/**
 * One pass over the body lines: a `- kind:` line opens an item, a `key: value`
 * line adds its field, and a structural `//` comment or blank line is
 * skipped. Every item is flat — a control declaration owns no nested
 * collection.
 */
function parseBody(lines, diagnostics, sourceName) {
    const items = [];
    let current;
    for (const line of lines) {
        if (/^[ \t]*$/.test(line.text) || COMMENT.test(line.text))
            continue;
        const item = ITEM.exec(line.text);
        if (item !== null) {
            const entry = ENTRY.exec((item[1] ?? "").trim());
            if (entry === null || (entry[1] ?? "").toLowerCase() !== "kind") {
                diagnostics.push(diag("unknown-declaration", BODY_SHAPE, line.range, sourceName, {
                    field: declarationKey(line.text),
                }));
                continue;
            }
            current = { kind: (entry[2] ?? "").trim().toLowerCase(), range: line.range, fields: [] };
            items.push(current);
            continue;
        }
        const field = FIELD.exec(line.text);
        if (field === null || current === undefined) {
            diagnostics.push(diag("unknown-declaration", BODY_SHAPE, line.range, sourceName, {
                field: declarationKey(line.text),
            }));
            continue;
        }
        current.fields.push({
            key: (field[1] ?? "").toLowerCase(),
            value: (field[2] ?? "").trim(),
            range: line.range,
        });
    }
    return items;
}
function fieldOf(fields, key) {
    return fields.find((field) => field.key === key);
}
/**
 * The item's registered fields, in authored order: a field outside the item's
 * closed set and a repeated field each report once and are dropped, so the
 * readers below see one field per key.
 */
function registeredFields(item, registered, owner, sourceName, diagnostics) {
    const kept = [];
    const seen = new Set();
    for (const field of item.fields) {
        if (!registered.includes(field.key)) {
            diagnostics.push(diag("unknown-field", `Control ${owner} field "${field.key}" is not supported.`, field.range, sourceName, { field: field.key }, vocabularySuggestion(field.key, registered)));
            continue;
        }
        if (seen.has(field.key)) {
            diagnostics.push(diag("duplicate-field", `Control field "${field.key}" is declared twice.`, field.range, sourceName, {
                field: field.key,
            }));
            continue;
        }
        seen.add(field.key);
        kept.push(field);
    }
    return kept;
}
/* ------------------------------------------------------------------ *
 * Field readers
 * ------------------------------------------------------------------ */
/** Read one required name; the family registers no name charset of its own. */
function readName(fields, owner, fallbackRange, sourceName, diagnostics) {
    const field = fieldOf(fields, "name");
    if (field === undefined || field.value === "") {
        diagnostics.push(diag("missing-field", `${owner} requires \`name:\`.`, field?.range ?? fallbackRange, sourceName, {
            field: "name",
        }));
        return undefined;
    }
    return field.value;
}
/** Read one CircuitText field through the shared inline vocabulary. */
function readInlineText(field, key, owner, required, fallbackRange, sourceName, diagnostics) {
    if (field === undefined) {
        if (required) {
            diagnostics.push(diag("missing-field", `${owner} requires \`${key}:\`.`, fallbackRange, sourceName, { field: key }));
        }
        return undefined;
    }
    return parseCircuitText({
        raw: field.value,
        limit: MAX_CONTROL_LABEL_CODE_POINTS,
        invalid: (message) => {
            diagnostics.push(diag("invalid-label", `Control \`${field.key}:\` is invalid inline text: ${message}`, field.range, sourceName, {
                field: field.key,
            }));
        },
        exceeded: (count) => {
            diagnostics.push(limitExceeded("label code points", count, MAX_CONTROL_LABEL_CODE_POINTS, field.range, sourceName));
        },
    });
}
/**
 * Read `signs:`, the bounded domain expression `signs: [+, -]`: a bracketed,
 * comma-separated list over the closed `+`/`-` token set, in authored order.
 * The list pairs positionally with the junction's in-edges, so its length and
 * order are hash-significant. One diagnostic per malformed list.
 */
function readSigns(field, fallbackRange, sourceName, diagnostics) {
    if (field === undefined) {
        diagnostics.push(diag("missing-field", "A control sum requires `signs:`.", fallbackRange, sourceName, { field: "signs" }));
        return undefined;
    }
    const raw = field.value;
    const invalid = (message, data) => {
        diagnostics.push(diag("invalid-signs", message, field.range, sourceName, data));
        return undefined;
    };
    if (raw.length < 2 || !raw.startsWith("[") || !raw.endsWith("]")) {
        return invalid("Control `signs:` is the bracketed list `[+, -]`.", { field: "signs", value: raw });
    }
    const inner = raw.slice(1, -1).trim();
    if (inner === "") {
        return invalid("Control `signs:` declares no signs.", { field: "signs", value: raw });
    }
    const signs = [];
    for (const token of inner.split(",").map((entry) => entry.trim())) {
        if (token === "") {
            return invalid("Control `signs:` has an empty entry.", { field: "signs", value: raw });
        }
        if (/\s/.test(token)) {
            return invalid("Control `signs:` entries are single `+` or `-` tokens; a nested `- -` collection is not readable.", { field: "signs", value: token });
        }
        if (!oneOf(SIGNS, token)) {
            diagnostics.push(diag("unknown-sign", `Control sign "${token}" is not registered.`, field.range, sourceName, { field: "signs", value: token }, vocabularySuggestion(token, SIGNS)));
            return undefined;
        }
        signs.push(token);
    }
    if (signs.length > MAX_CONTROL_SIGNS_PER_SUM) {
        diagnostics.push(limitExceeded("signs per sum", signs.length, MAX_CONTROL_SIGNS_PER_SUM, field.range, sourceName));
        return undefined;
    }
    return signs;
}
/**
 * The registered header properties, read in authored order: a repeated key and
 * a key outside the closed set each report once, and a registered key with an
 * unregistered value reports `#unknown-field` carrying the value. Omission of
 * `flow:` resolves to the versioned built-in default.
 *
 * The `title:`/`description:` text stays outside the Block's total label
 * budget, which the contract scopes to `tf:` and the body labels.
 */
function readHeader(headerLines, sourceName, diagnostics) {
    const seen = new Set();
    let flow = DEFAULT_CONTROL_FLOW;
    let id;
    let number;
    let title;
    let description;
    for (const line of headerLines) {
        if (/^[ \t]*$/.test(line.text) || COMMENT.test(line.text))
            continue;
        const match = FIELD.exec(line.text);
        if (match === null) {
            diagnostics.push(diag("unknown-field", "A control header entry is one `key: value` per line.", line.range, sourceName, {
                field: declarationKey(line.text),
            }));
            continue;
        }
        const key = (match[1] ?? "").toLowerCase();
        const value = (match[2] ?? "").trim();
        const range = line.range;
        if (!HEADER_FIELDS.includes(key)) {
            diagnostics.push(diag("unknown-field", `Control header field "${key}" is not supported.`, range, sourceName, { field: key }, vocabularySuggestion(key, HEADER_FIELDS)));
            continue;
        }
        if (seen.has(key)) {
            diagnostics.push(diag("duplicate-field", `Control header field "${key}" is declared twice.`, range, sourceName, {
                field: key,
            }));
            continue;
        }
        seen.add(key);
        if (key === "flow") {
            if (oneOf(FLOWS, value))
                flow = value;
            else {
                diagnostics.push(diag("unknown-field", `Control flow "${value}" is not registered.`, range, sourceName, { field: key, value }, vocabularySuggestion(value, FLOWS)));
            }
            continue;
        }
        if (key === "id") {
            if (value === "") {
                diagnostics.push(diag("missing-field", "Control `id:` requires a non-empty value.", range, sourceName, { field: key }));
                continue;
            }
            id = value;
            continue;
        }
        if (key === "number") {
            if (value !== "true" && value !== "false") {
                diagnostics.push(diag("unknown-field", `Control \`number:\` must be true or false, not "${value}".`, range, sourceName, { field: key, value }, vocabularySuggestion(value, ["true", "false"])));
                continue;
            }
            number = value === "true";
            continue;
        }
        const field = { key, value, range };
        const parsed = readInlineText(field, key, `Control header \`${key}:\``, false, range, sourceName, diagnostics);
        if (parsed === undefined)
            continue;
        if (key === "title")
            title = parsed;
        else
            description = parsed;
    }
    return { flow, id, number, title, description };
}
/**
 * Validate one `:::: control` Block: read the registered header properties,
 * read the flat declaration list, resolve the Block-local namespace and
 * publish a `ControlBlock`. Returns diagnostics alone when the declaration
 * list is empty or carries any error, because an invalid Block is never
 * partially published.
 */
export function validateControlBlock(options) {
    const { headerLines, bodyLines, blockRange, sourceName } = options;
    const diagnostics = [];
    let labelCodePoints = 0;
    const header = readHeader(headerLines, sourceName, diagnostics);
    /**
     * Read one CircuitText field and charge its decoded run text to the Block's
     * total label budget.
     */
    const text = (fields, key, owner, required, fallbackRange) => {
        const parsed = readInlineText(fieldOf(fields, key), key, owner, required, fallbackRange, sourceName, diagnostics);
        if (parsed !== undefined)
            labelCodePoints += [...circuitTextValue(parsed)].length;
        return parsed;
    };
    /* Field faults, per declaration, in authored order. Every declaration is
     * flat, so a declaration's own diagnostics precede the next one's. */
    const items = parseBody(bodyLines, diagnostics, sourceName);
    if (items.length === 0) {
        diagnostics.push(diag("empty", "A control Block requires at least one declaration.", blockRange, sourceName));
        return { diagnostics };
    }
    const declared = [];
    for (const item of items) {
        if (!oneOf(DECLARATION_KINDS, item.kind)) {
            diagnostics.push(diag("unknown-declaration", `Unknown control declaration "${item.kind}".`, item.range, sourceName, { kind: item.kind }, vocabularySuggestion(item.kind, DECLARATION_KINDS)));
            continue;
        }
        if (item.kind === "block") {
            const fields = registeredFields(item, BLOCK_FIELDS, "block", sourceName, diagnostics);
            const name = readName(fields, "A control block", item.range, sourceName, diagnostics);
            const tf = text(fields, "tf", "A control block", true, item.range);
            const label = text(fields, "label", "A control block", false, item.range);
            if (name === undefined || tf === undefined)
                continue;
            declared.push({ kind: "block", name, tf, label, range: item.range });
            continue;
        }
        if (item.kind === "sum") {
            const fields = registeredFields(item, SUM_FIELDS, "sum", sourceName, diagnostics);
            const name = readName(fields, "A control sum", item.range, sourceName, diagnostics);
            const signs = readSigns(fieldOf(fields, "signs"), item.range, sourceName, diagnostics);
            if (name === undefined || signs === undefined)
                continue;
            declared.push({ kind: "sum", name, signs, range: item.range });
            continue;
        }
        if (item.kind === "edge") {
            const fields = registeredFields(item, EDGE_FIELDS, "edge", sourceName, diagnostics);
            const fromField = fieldOf(fields, "from");
            const toField = fieldOf(fields, "to");
            const absentFrom = fromField === undefined || fromField.value === "";
            const absentTo = toField === undefined || toField.value === "";
            if (absentFrom) {
                diagnostics.push(diag("missing-field", "A control edge requires `from:`.", fromField?.range ?? item.range, sourceName, {
                    field: "from",
                }));
            }
            if (absentTo) {
                diagnostics.push(diag("missing-field", "A control edge requires `to:`.", toField?.range ?? item.range, sourceName, {
                    field: "to",
                }));
            }
            const label = text(fields, "label", "Control edge", false, item.range);
            if (absentFrom || absentTo || fromField === undefined || toField === undefined)
                continue;
            declared.push({ kind: "edge", range: item.range, fromField, toField, label });
            continue;
        }
        const owner = `A control ${item.kind} stub`;
        const fields = registeredFields(item, STUB_FIELDS, `${item.kind} stub`, sourceName, diagnostics);
        const name = readName(fields, owner, item.range, sourceName, diagnostics);
        const label = text(fields, "label", owner, true, item.range);
        if (name === undefined || label === undefined)
            continue;
        declared.push({ kind: item.kind, name, label, range: item.range });
    }
    /* One Block-local namespace over blocks, sums and stubs. The first
     * declaration wins a name; edges are anonymous and never named. */
    const names = new Map();
    for (const declaration of declared) {
        if (declaration.kind === "edge")
            continue;
        if (names.has(declaration.name)) {
            diagnostics.push(diag("duplicate-name", `Control name "${declaration.name}" is already declared in this Block.`, declaration.range, sourceName, { name: declaration.name }));
            continue;
        }
        names.set(declaration.name, declaration);
    }
    /* Resolution stays silent so that every diagnostic lands in authored order:
     * an endpoint resolves to a declared item or to nothing, and an implicit
     * item is never created. A resolved edge counts as an in-edge of its target
     * — a junction's signs pair with it and it touches that target's `in` port —
     * but a self-loop is a loopback rather than a second signal arriving at a
     * single-input port, so only a distinct source can trip `#port-fan-in`. */
    const endpoints = new Map();
    const incoming = new Map();
    const fanIn = new Map();
    const fanInIndex = new Map();
    for (const declaration of declared) {
        if (declaration.kind !== "edge")
            continue;
        const from = names.get(declaration.fromField.value)?.name;
        const to = names.get(declaration.toField.value)?.name;
        endpoints.set(declaration, { from, to });
        if (from === undefined || to === undefined)
            continue;
        const arriving = incoming.get(to);
        if (arriving === undefined)
            incoming.set(to, [declaration]);
        else
            arriving.push(declaration);
        if (from === to)
            continue;
        const distinct = fanIn.get(to);
        if (distinct === undefined) {
            fanInIndex.set(declaration, 0);
            fanIn.set(to, [declaration]);
            continue;
        }
        fanInIndex.set(declaration, distinct.length);
        distinct.push(declaration);
    }
    /* Structure, in authored order and bounded to the contract's four rules:
     * `#port-fan-in` on the offending edge, `#invalid-edge-endpoint` for an edge
     * that leaves an output stub or feeds an input stub, `#sum-no-inputs` on the
     * junction, and `#sign-count-mismatch` when the ordered sign list and the
     * junction's in-edges disagree. A self-loop is legal and never produces a
     * diagnostic of its own; nothing else about the graph — reachability,
     * cycles, dangling items — is ever judged. */
    const edges = [];
    for (const declaration of declared) {
        if (declaration.kind === "edge") {
            const settled = endpoints.get(declaration);
            const from = settled?.from;
            const to = settled?.to;
            if (from === undefined) {
                diagnostics.push(diag("unresolved-reference", `Control endpoint "${declaration.fromField.value}" does not name a declared item.`, declaration.fromField.range, sourceName, { name: declaration.fromField.value }));
            }
            if (to === undefined) {
                diagnostics.push(diag("unresolved-reference", `Control endpoint "${declaration.toField.value}" does not name a declared item.`, declaration.toField.range, sourceName, { name: declaration.toField.value }));
            }
            if (from === undefined || to === undefined)
                continue;
            const source = names.get(from);
            const target = names.get(to);
            const index = fanInIndex.get(declaration);
            if (index !== undefined && index > 0 && target !== undefined && (target.kind === "block" || target.kind === "output")) {
                diagnostics.push(diag("port-fan-in", `Control ${target.kind === "block" ? "block" : "output stub"} "${to}" receives more than one in-edge.`, declaration.range, sourceName, { item: to }));
            }
            if (target !== undefined && target.kind === "input") {
                diagnostics.push(diag("invalid-edge-endpoint", `Control edge "to:" cannot feed the input stub "${to}".`, declaration.toField.range, sourceName, { item: to }));
            }
            if (source !== undefined && source.kind === "output") {
                diagnostics.push(diag("invalid-edge-endpoint", `Control edge "from:" cannot leave the output stub "${from}".`, declaration.fromField.range, sourceName, { item: from }));
            }
            edges.push({ declaration, from, to });
            continue;
        }
        if (declaration.kind !== "sum")
            continue;
        const inputs = incoming.get(declaration.name) ?? [];
        if (inputs.length === 0) {
            diagnostics.push(diag("sum-no-inputs", `Control sum "${declaration.name}" has no in-edge.`, declaration.range, sourceName, {
                item: declaration.name,
            }));
            continue;
        }
        if (inputs.length !== declaration.signs.length) {
            diagnostics.push(diag("sign-count-mismatch", `Control sum "${declaration.name}" declares ${declaration.signs.length} signs for ${inputs.length} in-edges.`, declaration.range, sourceName, { signs: declaration.signs.length, inputs: inputs.length }));
        }
    }
    /* Ceilings, counted over the authored items: one error before any rendering,
     * never a partial diagram. */
    let blockCount = 0;
    let sumCount = 0;
    let stubCount = 0;
    let edgeCount = 0;
    for (const item of items) {
        if (item.kind === "block")
            blockCount += 1;
        else if (item.kind === "sum")
            sumCount += 1;
        else if (item.kind === "input" || item.kind === "output")
            stubCount += 1;
        else if (item.kind === "edge")
            edgeCount += 1;
    }
    if (items.length > MAX_CONTROL_DECLARATIONS) {
        diagnostics.push(limitExceeded("declaration count", items.length, MAX_CONTROL_DECLARATIONS, blockRange, sourceName));
    }
    if (blockCount > MAX_CONTROL_BLOCKS) {
        diagnostics.push(limitExceeded("block count", blockCount, MAX_CONTROL_BLOCKS, blockRange, sourceName));
    }
    if (sumCount > MAX_CONTROL_SUMS) {
        diagnostics.push(limitExceeded("sum count", sumCount, MAX_CONTROL_SUMS, blockRange, sourceName));
    }
    if (stubCount > MAX_CONTROL_STUBS) {
        diagnostics.push(limitExceeded("stub count", stubCount, MAX_CONTROL_STUBS, blockRange, sourceName));
    }
    if (edgeCount > MAX_CONTROL_EDGES) {
        diagnostics.push(limitExceeded("edge count", edgeCount, MAX_CONTROL_EDGES, blockRange, sourceName));
    }
    if (labelCodePoints > MAX_CONTROL_TOTAL_LABEL_CODE_POINTS) {
        diagnostics.push(limitExceeded("total label code points", labelCodePoints, MAX_CONTROL_TOTAL_LABEL_CODE_POINTS, blockRange, sourceName));
    }
    /* Warnings describe a Block that exists; an error publishes none. */
    const failed = diagnostics.some((diagnostic) => diagnostic.severity === "error");
    if (!failed) {
        const outgoing = new Map();
        for (const edge of edges)
            outgoing.set(edge.from, (outgoing.get(edge.from) ?? 0) + 1);
        for (const declaration of declared) {
            if (declaration.kind === "edge")
                continue;
            const inputs = incoming.get(declaration.name)?.length ?? 0;
            const outputs = outgoing.get(declaration.name) ?? 0;
            for (const port of PORTS[declaration.kind]) {
                const connected = port === "in" ? inputs > 0 : outputs > 0;
                if (connected)
                    continue;
                /* One diagnostic per defect: a sum whose `in` port already reported
                 * `#sum-no-inputs` is never warned about that same missing input. */
                if (declaration.kind === "sum" && port === "in")
                    continue;
                diagnostics.push(warn("unconnected-port", `Control ${declaration.kind} "${declaration.name}" has no edge on its \`${port}\` port.`, declaration.range, sourceName, { item: declaration.name, port }));
            }
        }
    }
    if (failed)
        return { diagnostics };
    const declarations = [];
    for (const declaration of declared) {
        if (declaration.kind === "block") {
            const block = {
                kind: "block",
                name: declaration.name,
                ...(declaration.label === undefined ? {} : { label: declaration.label }),
                tf: declaration.tf,
                range: declaration.range,
            };
            declarations.push(block);
            continue;
        }
        if (declaration.kind === "sum") {
            const sum = {
                kind: "sum",
                name: declaration.name,
                signs: declaration.signs,
                range: declaration.range,
            };
            declarations.push(sum);
            continue;
        }
        if (declaration.kind === "edge") {
            const settled = endpoints.get(declaration);
            const from = settled?.from;
            const to = settled?.to;
            if (from === undefined || to === undefined)
                continue;
            const edge = {
                kind: "edge",
                from,
                to,
                ...(declaration.label === undefined ? {} : { label: declaration.label }),
                range: declaration.range,
            };
            declarations.push(edge);
            continue;
        }
        const stub = {
            kind: declaration.kind,
            name: declaration.name,
            label: declaration.label,
            range: declaration.range,
        };
        declarations.push(stub);
    }
    return {
        diagnostics,
        block: {
            kind: "control",
            pluginVersion: CONTROL_PLUGIN_VERSION,
            range: blockRange,
            ...(header.id === undefined ? {} : { id: header.id }),
            ...(header.number === undefined ? {} : { number: header.number }),
            ...(header.title === undefined ? {} : { title: header.title }),
            ...(header.description === undefined ? {} : { description: header.description }),
            flow: header.flow,
            declarations,
        },
    };
}
/* ------------------------------------------------------------------ *
 * Plugin
 * ------------------------------------------------------------------ */
const descriptor = Object.freeze({
    type: CONTROL_PLUGIN_TYPE,
    version: CONTROL_PLUGIN_VERSION,
    title: "Control signal-flow diagrams",
    summary: "Control signal-flow diagrams: SISO function blocks, summing junctions, boundary stubs, and labelled signal edges over one Block-local namespace.",
    diagnosticNamespace: NAMESPACE,
    sourceSchema: controlSourceSchema,
    bodySyntax: Object.freeze({ id: CONTROL_BODY_SYNTAX_ID, version: CONTROL_BODY_SYNTAX_VERSION }),
    dataSchema: controlDataSchema,
});
export const controlPlugin = Object.freeze({ descriptor });
//# sourceMappingURL=control.js.map