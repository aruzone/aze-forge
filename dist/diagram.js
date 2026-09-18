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
import { createDiagnostic } from "./diagnostics.js";
import { didYouMean } from "./plot.js";
import { DIAGRAM_BODY_SYNTAX_ID, DIAGRAM_BODY_SYNTAX_VERSION, DIAGRAM_PLUGIN_TYPE, DIAGRAM_PLUGIN_VERSION, diagramDataSchema, diagramSourceSchema, } from "./diagram-schemas.js";
export const MAX_DIAGRAM_DECLARATIONS = 512;
export const MAX_DIAGRAM_NODES = 128;
export const MAX_DIAGRAM_EDGES = 256;
export const MAX_DIAGRAM_GROUPS = 32;
export const MAX_DIAGRAM_GROUP_DEPTH = 4;
export const MAX_DIAGRAM_PORTS_PER_NODE = 12;
export const MAX_DIAGRAM_PORTS = 128;
export const MAX_DIAGRAM_PARALLEL_EDGES = 4;
export const MAX_DIAGRAM_LABEL_CODE_POINTS = 500;
export const MAX_DIAGRAM_LABEL_LINES = 8;
export const MAX_DIAGRAM_TOTAL_LABEL_CODE_POINTS = 16384;
const NAMESPACE = "azeforge.diagram";
const FIELD = /^[ \t]*([A-Za-z][A-Za-z0-9-]*)[ \t]*:(.*)$/;
const ITEM = /^[ \t]*-[ \t]*(.*)$/;
const ENTRY = /^[ \t]*([A-Za-z][A-Za-z0-9-]*)[ \t]*:[ \t]*(.*)$/;
const COMMENT = /^[ \t]*\/\/(?:[ \t].*)?$/;
export const MODES = ["flowchart", "graph", "tree", "architecture"];
export const SHAPES = [
    "rectangle",
    "rounded",
    "diamond",
    "parallelogram",
    "circle",
    "hexagon",
    "cylinder",
];
export const SIDES = ["left", "right", "top", "bottom"];
export const FLOWS = ["top-to-bottom", "bottom-to-top", "left-to-right", "right-to-left"];
export const DIRECTIONS = ["directed", "undirected"];
export const DECLARATION_KINDS = ["node", "group", "edge"];
/** Header keys `validateDiagramBlock` reads by name (the family's closed set). */
export const DIAGRAM_HEADER_FIELDS = Object.freeze([
    "id",
    "number",
    "title",
    "description",
    "mode",
    "flow",
]);
const DEFAULT_FLOW = Object.freeze({
    flowchart: "top-to-bottom",
    tree: "top-to-bottom",
    graph: "left-to-right",
    architecture: "left-to-right",
});
export const NODE_FIELDS = Object.freeze(["name", "label", "shape", "parent", "ports"]);
export const GROUP_FIELDS = Object.freeze(["name", "label", "parent"]);
export const EDGE_FIELDS = Object.freeze(["from", "to", "label", "direction"]);
export const PORT_FIELDS = Object.freeze(["name", "side"]);
const TREE_REASONS = Object.freeze({
    "no-root": "A tree requires exactly one root node, and this diagram has none.",
    "multiple-roots": "A tree requires exactly one root node, and this diagram has several.",
    "multiple-parents": "A tree requires every non-root node to have exactly one incoming edge.",
    "self-loop": "A tree does not permit an edge from a node to itself.",
    cycle: "A tree must be acyclic.",
    "not-connected": "A tree must be connected.",
});
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
    return diag("limit-exceeded", `Diagram ${subject} ${count} exceeds ${limit}.`, range, sourceName, { subject, count, limit });
}
function codePoints(value) {
    return [...value].length;
}
function oneOf(values, value) {
    return values.includes(value);
}
/* ------------------------------------------------------------------ *
 * CircuitText inline subset (plain runs, `_`/`^` scripts, `{…}`
 * grouping, doubled braces literal)
 * ------------------------------------------------------------------ */
function scriptPayload(raw, index, range, sourceName, diagnostics) {
    if (raw[index] !== "{") {
        let end = index;
        while (end < raw.length && !/[_^{}]/.test(raw[end] ?? ""))
            end += 1;
        if (end === index) {
            diagnostics.push(diag("invalid-label", "Diagram script runs must have content.", range, sourceName));
            return undefined;
        }
        return { value: raw.slice(index, end), next: end };
    }
    let cursor = index + 1;
    let value = "";
    while (cursor < raw.length) {
        const character = raw[cursor] ?? "";
        if (character === "}") {
            if (raw[cursor + 1] === "}") {
                value += "}";
                cursor += 2;
                continue;
            }
            if (value === "") {
                diagnostics.push(diag("invalid-label", "Diagram script runs must have content.", range, sourceName));
                return undefined;
            }
            return { value, next: cursor + 1 };
        }
        if (character === "{") {
            diagnostics.push(diag("invalid-label", "Diagram script runs do not nest.", range, sourceName));
            return undefined;
        }
        value += character;
        cursor += 1;
    }
    diagnostics.push(diag("invalid-label", "Diagram inline text has an unclosed script run.", range, sourceName));
    return undefined;
}
/**
 * Parse one bounded inline text field. Diagram text carries plain runs and
 * `_`/`^` scripts only: no quantities, no Markdown, no HTML.
 */
function inlineText(raw, range, sourceName, diagnostics, limit = MAX_DIAGRAM_LABEL_CODE_POINTS) {
    if (raw.length === 0 || /[\r\n\x00-\x1f\x7f]/.test(raw)) {
        diagnostics.push(diag("invalid-label", "Diagram text must be non-empty plain inline text.", range, sourceName));
        return undefined;
    }
    if (codePoints(raw) > limit) {
        diagnostics.push(limitExceeded("label code points", codePoints(raw), limit, range, sourceName));
        return undefined;
    }
    const runs = [];
    let index = 0;
    while (index < raw.length) {
        const marker = raw[index];
        if (marker === "_" || marker === "^") {
            const payload = scriptPayload(raw, index + 1, range, sourceName, diagnostics);
            if (payload === undefined)
                return undefined;
            runs.push({ kind: marker === "_" ? "subscript" : "superscript", value: payload.value });
            index = payload.next;
            continue;
        }
        let end = index;
        while (end < raw.length && raw[end] !== "_" && raw[end] !== "^")
            end += 1;
        runs.push({ kind: "text", value: raw.slice(index, end) });
        index = end;
    }
    return runs;
}
/**
 * Parse one `|`-separated multiline label field. The authored breaks are the
 * only breaks: one `CircuitText` per line, never wrapped, never reflowed.
 */
function parseLabel(field, sourceName, diagnostics) {
    const parts = field.value.split("|");
    if (parts.length > MAX_DIAGRAM_LABEL_LINES) {
        diagnostics.push(limitExceeded("label lines", parts.length, MAX_DIAGRAM_LABEL_LINES, field.range, sourceName));
        return undefined;
    }
    const measured = parts.reduce((total, part) => total + codePoints(part.trim()), 0);
    if (measured > MAX_DIAGRAM_LABEL_CODE_POINTS) {
        diagnostics.push(limitExceeded("label code points", measured, MAX_DIAGRAM_LABEL_CODE_POINTS, field.range, sourceName));
        return undefined;
    }
    const lines = [];
    for (const part of parts) {
        const line = inlineText(part.trim(), field.range, sourceName, diagnostics);
        if (line === undefined)
            return undefined;
        lines.push(line);
    }
    return lines;
}
function leadingIndent(text) {
    let indent = 0;
    for (const character of text) {
        if (character === " ")
            indent += 1;
        else if (character === "\t")
            return undefined;
        else
            return indent;
    }
    return indent;
}
const BODY_SHAPE = "Diagram body entries begin with `- kind:` and use flat `key: value` fields.";
function parseBody(lines, diagnostics, sourceName) {
    const items = [];
    let current;
    let record;
    let collectionIndent;
    let recordIndent = 0;
    for (const line of lines) {
        if (/^[ \t]*$/.test(line.text) || COMMENT.test(line.text))
            continue;
        const indent = leadingIndent(line.text);
        if (indent === undefined) {
            diagnostics.push(diag("unknown-declaration", "Diagram declarations indent with spaces only.", line.range, sourceName));
            continue;
        }
        const item = ITEM.exec(line.text);
        if (item !== null) {
            const entry = ENTRY.exec((item[1] ?? "").trim());
            if (indent === 0) {
                if (entry === null || entry[1].toLowerCase() !== "kind") {
                    diagnostics.push(diag("unknown-declaration", BODY_SHAPE, line.range, sourceName));
                    continue;
                }
                current = {
                    kind: (entry[2] ?? "").trim().toLowerCase(),
                    range: line.range,
                    fields: [],
                    records: [],
                    collection: undefined,
                };
                items.push(current);
                record = undefined;
                collectionIndent = undefined;
                continue;
            }
            if (current === undefined || collectionIndent === undefined || indent <= collectionIndent || entry === null) {
                diagnostics.push(diag("unknown-declaration", "Diagram collection records nest as `- key: value` under a collection field.", line.range, sourceName));
                continue;
            }
            record = { range: line.range, fields: [{ key: entry[1].toLowerCase(), value: (entry[2] ?? "").trim(), range: line.range }] };
            current.records.push({ collection: current.collection ?? "", range: line.range, fields: record.fields });
            recordIndent = indent;
            continue;
        }
        const field = FIELD.exec(line.text);
        if (field === null || current === undefined) {
            diagnostics.push(diag("unknown-declaration", BODY_SHAPE, line.range, sourceName));
            continue;
        }
        const key = (field[1] ?? "").toLowerCase();
        const value = (field[2] ?? "").trim();
        if (record !== undefined && indent > recordIndent) {
            if (record.fields.some((entry) => entry.key === key)) {
                diagnostics.push(diag("duplicate-field", `Diagram field "${key}" is declared twice.`, line.range, sourceName, { field: key }));
                continue;
            }
            record.fields.push({ key, value, range: line.range });
            continue;
        }
        record = undefined;
        collectionIndent = value === "" ? indent : undefined;
        current.collection = value === "" ? key : undefined;
        if (current.fields.some((entry) => entry.key === key)) {
            diagnostics.push(diag("duplicate-field", `Diagram field "${key}" is declared twice.`, line.range, sourceName, { field: key }));
            continue;
        }
        current.fields.push({ key, value, range: line.range });
    }
    return items;
}
function allowedFields(fields, registered, owner, sourceName, diagnostics) {
    for (const field of fields) {
        if (!registered.includes(field.key)) {
            diagnostics.push(diag("unknown-field", `Diagram ${owner} field "${field.key}" is not supported.`, field.range, sourceName, { field: field.key }, vocabularySuggestion(field.key, registered)));
        }
    }
}
export function validateDiagramBlock(options) {
    const { headerLines, bodyLines, blockRange, sourceName } = options;
    const diagnostics = [];
    let labelCodePoints = 0;
    /* Header faults are this family's to report: `allowedFields` below rejects a
     * key outside DIAGRAM_HEADER_FIELDS, the same way timing, control, plot,
     * circuit and geometry report theirs. Repeated keys keep first-wins silence,
     * and `id`/`number` are read as authored, never validated here. */
    const entries = [];
    const header = new Map();
    for (const line of headerLines) {
        if (/^[ \t]*$/.test(line.text) || COMMENT.test(line.text))
            continue;
        const match = FIELD.exec(line.text);
        if (match === null)
            continue;
        const key = (match[1] ?? "").toLowerCase();
        const field = { key, value: (match[2] ?? "").trim(), range: line.range };
        entries.push(field);
        if (!oneOf(DIAGRAM_HEADER_FIELDS, key))
            continue;
        if (header.has(key))
            continue;
        header.set(key, field);
    }
    allowedFields(entries, DIAGRAM_HEADER_FIELDS, "header", sourceName, diagnostics);
    const modeLine = header.get("mode");
    const modeText = modeLine?.value ?? "";
    const mode = oneOf(MODES, modeText) ? modeText : undefined;
    if (mode === undefined) {
        diagnostics.push(diag("unknown-mode", `Diagram \`mode:\` must be one of ${MODES.join(", ")}.`, modeLine?.range ?? blockRange, sourceName, { field: "mode" }, modeText === "" ? undefined : vocabularySuggestion(modeText, MODES)));
    }
    const flowLine = header.get("flow");
    const flowText = flowLine?.value;
    let flow;
    if (flowText === undefined) {
        flow = mode === undefined ? undefined : DEFAULT_FLOW[mode];
    }
    else if (oneOf(FLOWS, flowText)) {
        flow = flowText;
    }
    else {
        diagnostics.push(diag("unknown-flow", `Diagram flow "${flowText}" is not registered.`, flowLine?.range ?? blockRange, sourceName, { field: "flow" }, vocabularySuggestion(flowText, FLOWS)));
    }
    const idText = header.get("id")?.value ?? "";
    const id = idText === "" ? undefined : idText;
    const numberText = header.get("number")?.value;
    const number = numberText === "true" ? true : numberText === "false" ? false : undefined;
    const titleLine = header.get("title");
    const title = titleLine === undefined ? undefined : inlineText(titleLine.value, titleLine.range, sourceName, diagnostics);
    if (titleLine !== undefined)
        labelCodePoints += codePoints(titleLine.value);
    const descriptionLine = header.get("description");
    const description = descriptionLine === undefined
        ? undefined
        : inlineText(descriptionLine.value, descriptionLine.range, sourceName, diagnostics);
    if (descriptionLine !== undefined)
        labelCodePoints += codePoints(descriptionLine.value);
    /* Field faults, per record, in authored order. */
    const raws = parseBody(bodyLines, diagnostics, sourceName);
    if (raws.length === 0) {
        diagnostics.push(diag("empty", "A diagram requires at least one declaration.", blockRange, sourceName));
        return { diagnostics };
    }
    const declared = [];
    for (const item of raws) {
        if (item.kind === "node") {
            allowedFields(item.fields, NODE_FIELDS, "node", sourceName, diagnostics);
            const nameField = item.fields.find((field) => field.key === "name");
            const name = nameField?.value ?? "";
            if (name === "") {
                diagnostics.push(diag("missing-field", "A diagram node requires `name:`.", nameField?.range ?? item.range, sourceName, { field: "name" }));
                continue;
            }
            const labelField = item.fields.find((field) => field.key === "label");
            const label = labelField === undefined ? undefined : parseLabel(labelField, sourceName, diagnostics);
            if (labelField !== undefined)
                labelCodePoints += codePoints(labelField.value);
            const shapeField = item.fields.find((field) => field.key === "shape");
            let shape = "rectangle";
            if (shapeField !== undefined) {
                if (oneOf(SHAPES, shapeField.value))
                    shape = shapeField.value;
                else
                    diagnostics.push(diag("unknown-shape", `Diagram shape "${shapeField.value}" is not registered.`, shapeField.range, sourceName, { field: "shape" }, vocabularySuggestion(shapeField.value, SHAPES)));
            }
            const ports = [];
            for (const record of item.records) {
                if (record.collection !== "ports")
                    continue;
                allowedFields(record.fields, PORT_FIELDS, "port", sourceName, diagnostics);
                const portNameField = record.fields.find((field) => field.key === "name");
                const sideField = record.fields.find((field) => field.key === "side");
                let side;
                if (sideField !== undefined) {
                    if (oneOf(SIDES, sideField.value))
                        side = sideField.value;
                    else
                        diagnostics.push(diag("unknown-side", `Diagram port side "${sideField.value}" is not registered.`, sideField.range, sourceName, { field: "side" }, vocabularySuggestion(sideField.value, SIDES)));
                }
                const portName = portNameField?.value ?? "";
                if (portName === "") {
                    diagnostics.push(diag("missing-field", "A diagram port requires `name:`.", portNameField?.range ?? record.range, sourceName, { field: "name" }));
                    continue;
                }
                ports.push({ name: portName, ...(side === undefined ? {} : { side }), range: record.range });
            }
            declared.push({
                kind: "node",
                name,
                range: item.range,
                label,
                shape,
                parentField: item.fields.find((field) => field.key === "parent"),
                parent: undefined,
                ports,
            });
            continue;
        }
        if (item.kind === "group") {
            allowedFields(item.fields, GROUP_FIELDS, "group", sourceName, diagnostics);
            const nameField = item.fields.find((field) => field.key === "name");
            const name = nameField?.value ?? "";
            if (name === "") {
                diagnostics.push(diag("missing-field", "A diagram group requires `name:`.", nameField?.range ?? item.range, sourceName, { field: "name" }));
                continue;
            }
            const labelField = item.fields.find((field) => field.key === "label");
            const label = labelField === undefined ? undefined : parseLabel(labelField, sourceName, diagnostics);
            if (labelField !== undefined)
                labelCodePoints += codePoints(labelField.value);
            declared.push({
                kind: "group",
                name,
                range: item.range,
                label,
                parentField: item.fields.find((field) => field.key === "parent"),
                parent: undefined,
            });
            continue;
        }
        if (item.kind === "edge") {
            allowedFields(item.fields, EDGE_FIELDS, "edge", sourceName, diagnostics);
            const fromField = item.fields.find((field) => field.key === "from");
            const toField = item.fields.find((field) => field.key === "to");
            const absentFrom = fromField === undefined || fromField.value === "";
            const absentTo = toField === undefined || toField.value === "";
            if (absentFrom) {
                diagnostics.push(diag("missing-field", "A diagram edge requires `from:`.", fromField?.range ?? item.range, sourceName, { field: "from" }));
            }
            if (absentTo) {
                diagnostics.push(diag("missing-field", "A diagram edge requires `to:`.", toField?.range ?? item.range, sourceName, { field: "to" }));
            }
            const labelField = item.fields.find((field) => field.key === "label");
            const label = labelField === undefined ? undefined : parseLabel(labelField, sourceName, diagnostics);
            if (labelField !== undefined)
                labelCodePoints += codePoints(labelField.value);
            const directionField = item.fields.find((field) => field.key === "direction");
            let direction = "directed";
            if (directionField !== undefined) {
                if (oneOf(DIRECTIONS, directionField.value))
                    direction = directionField.value;
                else
                    diagnostics.push(diag("unknown-field", `Diagram edge direction "${directionField.value}" is not registered.`, directionField.range, sourceName, { field: "direction" }, vocabularySuggestion(directionField.value, DIRECTIONS)));
            }
            if (absentFrom || absentTo || fromField === undefined || toField === undefined)
                continue;
            declared.push({
                kind: "edge",
                range: item.range,
                fromField,
                toField,
                label,
                direction,
                directionField,
                from: undefined,
                to: undefined,
            });
            continue;
        }
        diagnostics.push(diag("unknown-declaration", `Unknown diagram declaration "${item.kind}".`, item.range, sourceName, undefined, vocabularySuggestion(item.kind, DECLARATION_KINDS)));
    }
    /* Name and port resolution — forward references are legal, nothing is
     * ever created implicitly, and the first declaration wins a name. */
    const names = new Map();
    for (const declaration of declared) {
        if (declaration.kind === "edge")
            continue;
        if (names.has(declaration.name)) {
            diagnostics.push(diag("duplicate-name", `Diagram name "${declaration.name}" is already declared in this Block.`, declaration.range, sourceName, { name: declaration.name }));
            continue;
        }
        names.set(declaration.name, declaration);
    }
    for (const declaration of declared) {
        if (declaration.kind !== "node")
            continue;
        const seen = new Set();
        const unique = [];
        for (const port of declaration.ports) {
            if (seen.has(port.name)) {
                diagnostics.push(diag("duplicate-port", `Diagram node "${declaration.name}" declares port "${port.name}" twice.`, port.range, sourceName, { name: port.name, node: declaration.name }));
                continue;
            }
            seen.add(port.name);
            unique.push(port);
        }
        declaration.ports = unique;
    }
    for (const declaration of declared) {
        if (declaration.kind === "edge")
            continue;
        const parentField = declaration.parentField;
        if (parentField === undefined || parentField.value === "")
            continue;
        const target = names.get(parentField.value);
        if (target === undefined || target.kind !== "group") {
            diagnostics.push(diag("unresolved-reference", `Diagram parent "${parentField.value}" does not name a declared group.`, parentField.range, sourceName, { name: parentField.value }));
            continue;
        }
        declaration.parent = target.name;
    }
    const reportedCycles = new Set();
    for (const declaration of declared) {
        if (declaration.kind !== "group" || reportedCycles.has(declaration.name))
            continue;
        const chain = [];
        let cursor = declaration;
        while (cursor !== undefined && cursor.kind === "group") {
            const index = chain.indexOf(cursor.name);
            if (index >= 0) {
                const loop = [...chain.slice(index), cursor.name];
                if (!loop.some((name) => reportedCycles.has(name))) {
                    diagnostics.push(diag("group-cycle", `Diagram groups form a containment cycle: ${loop.join(" -> ")}.`, cursor.range, sourceName, { chain: loop }));
                    for (const name of loop)
                        reportedCycles.add(name);
                }
                break;
            }
            chain.push(cursor.name);
            cursor = cursor.parent === undefined || cursor.parent === "" ? undefined : names.get(cursor.parent);
        }
    }
    const edges = [];
    for (const declaration of declared) {
        if (declaration.kind !== "edge")
            continue;
        const from = resolveEndpoint(declaration.fromField, names, sourceName, diagnostics);
        const to = resolveEndpoint(declaration.toField, names, sourceName, diagnostics);
        if (from === undefined || to === undefined)
            continue;
        declaration.from = from;
        declaration.to = to;
        edges.push({ declaration, from, to });
    }
    const declaredNodes = declared.filter((declaration) => declaration.kind === "node");
    const nodes = [];
    const seenNames = new Set();
    for (const node of declaredNodes) {
        if (seenNames.has(node.name))
            continue;
        seenNames.add(node.name);
        nodes.push(node);
    }
    const groups = declared.filter((declaration) => declaration.kind === "group").filter((group) => names.get(group.name) === group);
    const authoredEdges = declared.filter((declaration) => declaration.kind === "edge");
    /* Mode structure. */
    if (mode !== undefined && mode !== "graph" && mode !== "architecture") {
        for (const edge of edges) {
            if (edge.declaration.direction !== "undirected")
                continue;
            diagnostics.push(diag("undirected-not-permitted", `Diagram mode "${mode}" permits undirected edges only in graph or architecture.`, edge.declaration.directionField?.range ?? edge.declaration.range, sourceName));
        }
    }
    if (mode === "tree") {
        const incoming = new Map();
        for (const edge of edges)
            incoming.set(edge.to.name, (incoming.get(edge.to.name) ?? 0) + 1);
        const roots = nodes.filter((node) => (incoming.get(node.name) ?? 0) === 0);
        const reasons = [];
        if (edges.some((edge) => edge.from.name === edge.to.name))
            reasons.push("self-loop");
        if ([...incoming.values()].some((count) => count > 1))
            reasons.push("multiple-parents");
        if (roots.length === 0)
            reasons.push("no-root");
        else if (roots.length > 1)
            reasons.push("multiple-roots");
        if (treeHasCycle(nodes, edges))
            reasons.push("cycle");
        if (components(nodes, edges).length > 1)
            reasons.push("not-connected");
        for (const reason of reasons) {
            diagnostics.push(diag("invalid-tree", TREE_REASONS[reason] ?? "The tree structure is invalid.", blockRange, sourceName, { reason }));
        }
    }
    /* Ceilings. */
    if (declared.length > MAX_DIAGRAM_DECLARATIONS) {
        diagnostics.push(limitExceeded("declaration count", declared.length, MAX_DIAGRAM_DECLARATIONS, blockRange, sourceName));
    }
    if (declaredNodes.length > MAX_DIAGRAM_NODES) {
        diagnostics.push(limitExceeded("node count", declaredNodes.length, MAX_DIAGRAM_NODES, blockRange, sourceName));
    }
    if (authoredEdges.length > MAX_DIAGRAM_EDGES) {
        diagnostics.push(limitExceeded("edge count", authoredEdges.length, MAX_DIAGRAM_EDGES, blockRange, sourceName));
    }
    if (groups.length > MAX_DIAGRAM_GROUPS) {
        diagnostics.push(limitExceeded("group count", groups.length, MAX_DIAGRAM_GROUPS, blockRange, sourceName));
    }
    const depth = groups.reduce((deepest, group) => Math.max(deepest, groupDepth(group, names)), 0);
    if (depth > MAX_DIAGRAM_GROUP_DEPTH) {
        diagnostics.push(limitExceeded("group depth", depth, MAX_DIAGRAM_GROUP_DEPTH, blockRange, sourceName));
    }
    const portCount = nodes.reduce((total, node) => total + node.ports.length, 0);
    if (portCount > MAX_DIAGRAM_PORTS) {
        diagnostics.push(limitExceeded("port count", portCount, MAX_DIAGRAM_PORTS, blockRange, sourceName));
    }
    for (const node of nodes) {
        if (node.ports.length > MAX_DIAGRAM_PORTS_PER_NODE) {
            diagnostics.push(limitExceeded("ports per node", node.ports.length, MAX_DIAGRAM_PORTS_PER_NODE, node.range, sourceName));
        }
    }
    const bundles = new Map();
    for (const edge of edges) {
        const fromKey = edge.from.port === undefined ? edge.from.name : `${edge.from.name}.${edge.from.port}`;
        const toKey = edge.to.port === undefined ? edge.to.name : `${edge.to.name}.${edge.to.port}`;
        const key = `${fromKey}->${toKey}`;
        const bundle = bundles.get(key);
        if (bundle === undefined)
            bundles.set(key, [edge]);
        else
            bundle.push(edge);
    }
    for (const bundle of bundles.values()) {
        if (bundle.length > MAX_DIAGRAM_PARALLEL_EDGES) {
            diagnostics.push(limitExceeded("parallel edges", bundle.length, MAX_DIAGRAM_PARALLEL_EDGES, bundle[MAX_DIAGRAM_PARALLEL_EDGES]?.declaration.range ?? blockRange, sourceName));
        }
    }
    if (labelCodePoints > MAX_DIAGRAM_TOTAL_LABEL_CODE_POINTS) {
        diagnostics.push(limitExceeded("total label code points", labelCodePoints, MAX_DIAGRAM_TOTAL_LABEL_CODE_POINTS, blockRange, sourceName));
    }
    /* Warnings describe a Block that exists; an error publishes none. */
    const failed = diagnostics.length > 0;
    if (!failed) {
        const componentOfNode = components(nodes, edges);
        if (mode === "flowchart" || mode === "graph" || mode === "architecture") {
            const order = new Map(nodes.map((node, index) => [node.name, index]));
            for (const component of componentOfNode.slice(1)) {
                const ordered = [...component].sort((left, right) => (order.get(left) ?? 0) - (order.get(right) ?? 0));
                diagnostics.push(warn("disconnected-component", `Diagram component ${ordered.join(", ")} is disconnected from the rest.`, blockRange, sourceName, { names: ordered }));
            }
        }
        if (mode !== "graph") {
            const incident = new Set();
            for (const edge of edges) {
                incident.add(edge.from.name);
                incident.add(edge.to.name);
            }
            for (const node of nodes) {
                if (incident.has(node.name))
                    continue;
                diagnostics.push(warn("isolated-node", `Diagram node "${node.name}" has no incident edge.`, node.range, sourceName, { name: node.name }));
            }
        }
        const referencedPorts = new Set();
        for (const edge of edges) {
            for (const endpoint of [edge.from, edge.to]) {
                if (endpoint.port !== undefined)
                    referencedPorts.add(`${endpoint.name}.${endpoint.port}`);
            }
        }
        for (const node of nodes) {
            for (const port of node.ports) {
                if (referencedPorts.has(`${node.name}.${port.name}`))
                    continue;
                diagnostics.push(warn("unused-port", `Diagram port "${port.name}" of node "${node.name}" is never referenced by an edge.`, port.range, sourceName, { name: port.name, node: node.name }));
            }
        }
        const membered = new Set();
        for (const declaration of declared) {
            if (declaration.kind === "edge" || declaration.parent === undefined)
                continue;
            membered.add(declaration.parent);
        }
        for (const group of groups) {
            if (membered.has(group.name))
                continue;
            diagnostics.push(warn("empty-group", `Diagram group "${group.name}" contains nothing.`, group.range, sourceName, { name: group.name }));
        }
    }
    if (failed || mode === undefined || flow === undefined)
        return { diagnostics };
    const declarations = [];
    for (const declaration of declared) {
        if (declaration.kind === "node") {
            declarations.push({
                kind: "node",
                name: declaration.name,
                ...(declaration.label === undefined ? {} : { label: declaration.label }),
                shape: declaration.shape,
                ...(declaration.parent === undefined ? {} : { parent: declaration.parent }),
                ports: declaration.ports,
                range: declaration.range,
            });
            continue;
        }
        if (declaration.kind === "group") {
            declarations.push({
                kind: "group",
                name: declaration.name,
                ...(declaration.label === undefined ? {} : { label: declaration.label }),
                ...(declaration.parent === undefined ? {} : { parent: declaration.parent }),
                range: declaration.range,
            });
            continue;
        }
        const { from, to } = declaration;
        if (from === undefined || to === undefined)
            continue;
        const edge = {
            kind: "edge",
            from,
            to,
            ...(declaration.label === undefined ? {} : { label: declaration.label }),
            direction: declaration.direction,
            range: declaration.range,
        };
        declarations.push(edge);
    }
    return {
        diagnostics,
        block: {
            kind: "diagram",
            pluginVersion: DIAGRAM_PLUGIN_VERSION,
            range: blockRange,
            ...(id === undefined ? {} : { id }),
            ...(number === undefined ? {} : { number }),
            ...(title === undefined ? {} : { title }),
            ...(description === undefined ? {} : { description }),
            mode,
            flow,
            declarations,
        },
    };
}
/**
 * Resolve one authored endpoint: a node name, or `node.port` with exactly one
 * dot. Groups are containers and never endpoints.
 */
function resolveEndpoint(field, names, sourceName, diagnostics) {
    const raw = field.value;
    const segments = raw.split(".");
    if (segments.length > 2 || segments.some((segment) => segment === "")) {
        diagnostics.push(diag("invalid-port-reference", `Diagram reference "${raw}" must be a node name or a single \`node.port\` reference.`, field.range, sourceName, { name: raw }));
        return undefined;
    }
    const owner = names.get(segments[0] ?? "");
    if (owner === undefined) {
        diagnostics.push(diag("unresolved-reference", `Diagram endpoint "${raw}" does not name a declared node.`, field.range, sourceName, { name: raw }));
        return undefined;
    }
    if (owner.kind === "group") {
        diagnostics.push(diag("group-endpoint", `Diagram group "${owner.name}" is a container and never an edge endpoint.`, field.range, sourceName, { name: raw }));
        return undefined;
    }
    const portName = segments.length === 2 ? segments[1] : undefined;
    if (portName === undefined)
        return { name: owner.name, range: field.range };
    if (!owner.ports.some((port) => port.name === portName)) {
        diagnostics.push(diag("unresolved-port", `Diagram node "${owner.name}" declares no port "${portName}".`, field.range, sourceName, { name: raw }));
        return undefined;
    }
    return { name: owner.name, port: portName, range: field.range };
}
function groupDepth(group, names) {
    let depth = 1;
    const seen = new Set([group.name]);
    let cursor = group.parent === undefined || group.parent === "" ? undefined : names.get(group.parent);
    while (cursor !== undefined && cursor.kind === "group" && !seen.has(cursor.name)) {
        seen.add(cursor.name);
        depth += 1;
        cursor = cursor.parent === undefined || cursor.parent === "" ? undefined : names.get(cursor.parent);
    }
    return depth;
}
function treeHasCycle(nodes, edges) {
    const adjacency = new Map();
    for (const node of nodes)
        adjacency.set(node.name, []);
    for (const edge of edges)
        adjacency.get(edge.from.name)?.push(edge.to.name);
    const state = new Map();
    const visit = (name) => {
        const current = state.get(name);
        if (current === "visiting")
            return true;
        if (current === "done")
            return false;
        state.set(name, "visiting");
        for (const next of adjacency.get(name) ?? []) {
            if (visit(next))
                return true;
        }
        state.set(name, "done");
        return false;
    };
    for (const node of nodes) {
        if (visit(node.name))
            return true;
    }
    return false;
}
/** Connected components over declared nodes, in authored order of first member. */
function components(nodes, edges) {
    const adjacency = new Map();
    for (const node of nodes)
        adjacency.set(node.name, new Set());
    for (const edge of edges) {
        adjacency.get(edge.from.name)?.add(edge.to.name);
        adjacency.get(edge.to.name)?.add(edge.from.name);
    }
    const visited = new Set();
    const found = [];
    for (const node of nodes) {
        if (visited.has(node.name))
            continue;
        const members = [];
        const stack = [node.name];
        visited.add(node.name);
        while (stack.length > 0) {
            const current = stack.pop();
            if (current === undefined)
                break;
            members.push(current);
            for (const neighbour of adjacency.get(current) ?? []) {
                if (visited.has(neighbour))
                    continue;
                visited.add(neighbour);
                stack.push(neighbour);
            }
        }
        found.push(members);
    }
    return found;
}
const descriptor = Object.freeze({
    type: DIAGRAM_PLUGIN_TYPE,
    version: DIAGRAM_PLUGIN_VERSION,
    title: "Diagram",
    summary: "Native general diagrams.",
    diagnosticNamespace: NAMESPACE,
    sourceSchema: diagramSourceSchema,
    bodySyntax: Object.freeze({ id: DIAGRAM_BODY_SYNTAX_ID, version: DIAGRAM_BODY_SYNTAX_VERSION }),
    dataSchema: diagramDataSchema,
});
export const diagramPlugin = Object.freeze({ descriptor });
//# sourceMappingURL=diagram.js.map