import { parseQuantitySpelling } from "./quantity.js";
import { createDiagnostic } from "./diagnostics.js";
import { CIRCUIT_BODY_SYNTAX_ID, CIRCUIT_BODY_SYNTAX_VERSION, CIRCUIT_PLUGIN_TYPE, CIRCUIT_PLUGIN_VERSION, circuitDataSchema, circuitSourceSchema } from "./circuit-schemas.js";
export const MAX_CIRCUIT_COMPONENTS = 64;
export const MAX_CIRCUIT_NODES = 128;
export const MAX_CIRCUIT_RELATIONS = 512;
export const MAX_CIRCUIT_ANNOTATIONS = 128;
const NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const COMPONENT_REF = /^[A-Z][A-Z0-9]*$/;
const FIELD = /^[ \t]*([A-Za-z][A-Za-z0-9-]*)[ \t]*:(.*)$/;
const ITEM = /^[ \t]*-[ \t]*kind[ \t]*:[ \t]*(.*)$/;
const COMMENT = /^[ \t]*\/\/(?:[ \t].*)?$/;
export const HEADER_FIELDS = Object.freeze(["id", "number", "title", "description", "flow"]);
export const FLOWS = ["left-to-right", "top-to-bottom"];
export const NODE_ROLES = ["signal", "reference"];
export const CURRENT_DIRECTIONS = ["into", "out"];
export const GATE_INPUTS = ["2", "3", "4"];
export const ORIENTATIONS = ["left-to-right", "right-to-left", "top-to-bottom", "bottom-to-top"];
const GATES = new Set(["and", "or", "nand", "nor", "xor", "xnor"]);
export const KINDS = ["resistor", "capacitor", "inductor", "voltage-source", "current-source", "diode", "led", "switch", "dependent-source", "op-amp", "bjt", "mosfet", "and", "or", "nand", "nor", "xor", "xnor", "not", "buffer", "mux-2to1", "mux-4to1", "d-flip-flop", "digital-input", "digital-output"];
/** Membership that narrows, for the closed vocabularies above. */
function oneOf(values, value) {
    return values.includes(value);
}
function diag(code, message, range, sourceName, severity = "error", data) {
    return createDiagnostic(`azeforge.circuit#${code}`, severity, message, { location: sourceName === undefined ? { range } : { source: sourceName, range }, ...(data === undefined ? {} : { data }) });
}
const QUANTITY_UNIT_NAMES = ["degC", "ohm", "mol", "kat", "min", "deg", "Wb", "Hz", "Bq", "Gy", "Sv", "m", "g", "s", "A", "K", "N", "Pa", "J", "W", "V", "F", "C", "T", "H", "L", "d", "%"];
const SI_PREFIXES = ["da", "Q", "R", "Y", "Z", "E", "P", "T", "G", "M", "k", "h", "d", "c", "m", "u", "µ", "n", "p", "f", "a", "z", "y", "r", "q"];
function quantityRun(spelling) {
    try {
        const quantity = parseQuantitySpelling(spelling);
        const compactUnit = quantity.unit.replace(/\s+/g, "");
        for (const prefix of SI_PREFIXES)
            for (const unit of QUANTITY_UNIT_NAMES) {
                if (compactUnit === `${prefix}${unit}`)
                    return { kind: "quantity", coefficient: quantity.coefficient, prefix, unit };
            }
        return { kind: "quantity", coefficient: quantity.coefficient, prefix: "", unit: compactUnit };
    }
    catch {
        return undefined;
    }
}
function text(raw, range, diagnostics, sourceName) {
    if (raw.length === 0 || /[\r\n\x00-\x1f\x7f]|<|>|[`\\]/.test(raw)) {
        diagnostics.push(diag("invalid-text", "Circuit text must be non-empty plain inline text.", range, sourceName));
        return undefined;
    }
    const runs = [];
    let index = 0;
    const pushText = (value) => {
        let consumed = 0;
        const candidates = /[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?[ \t]*[A-Za-zµ%][A-Za-zµ%*/·^() \t]*/g;
        for (const match of value.matchAll(candidates)) {
            const start = match.index ?? 0;
            const candidate = match[0];
            let quantity;
            let end = candidate.length;
            while (end > 0) {
                const spelling = candidate.slice(0, end);
                const suffix = candidate.slice(end);
                quantity = quantityRun(spelling);
                if (quantity !== undefined && !(/^[A-Za-zµ%]/.test(suffix) && /[A-Za-zµ%]$/.test(spelling)))
                    break;
                quantity = undefined;
                end -= 1;
            }
            if (quantity === undefined)
                continue;
            if (start > consumed)
                runs.push({ kind: "text", value: value.slice(consumed, start) });
            runs.push(quantity);
            consumed = start + end;
        }
        if (consumed < value.length)
            runs.push({ kind: "text", value: value.slice(consumed) });
    };
    while (index < raw.length) {
        const marker = raw[index];
        if (marker === "_" || marker === "^") {
            const start = index;
            index += 1;
            let value = "";
            if (raw[index] === "{") {
                const end = raw.indexOf("}", index + 1);
                if (end < 0 || raw.slice(index + 1, end).includes("{") || end === index + 1) {
                    diagnostics.push(diag("invalid-text", "Circuit script runs must be non-empty and non-nesting.", range, sourceName));
                    return undefined;
                }
                value = raw.slice(index + 1, end);
                index = end + 1;
            }
            else {
                while (index < raw.length && !/[ _^{}]/.test(raw[index] ?? ""))
                    index += 1;
                value = raw.slice(start + 1, index);
                if (value === "") {
                    diagnostics.push(diag("invalid-text", "Circuit script runs must have content.", range, sourceName));
                    return undefined;
                }
            }
            runs.push({ kind: marker === "_" ? "subscript" : "superscript", value });
            continue;
        }
        const start = index;
        while (index < raw.length && raw[index] !== "_" && raw[index] !== "^")
            index += 1;
        pushText(raw.slice(start, index));
    }
    if (runs.some((run) => run.kind !== "quantity" && [...run.value].length > 256)) {
        diagnostics.push(diag("limit-exceeded", "Circuit text run exceeds the limit of 256 code points.", range, sourceName));
        return undefined;
    }
    return runs;
}
function terminals(kind, inputs) {
    if (GATES.has(kind))
        return [...Array(inputs ?? 2).keys()].map((n) => `in${n + 1}`).concat("out");
    switch (kind) {
        case "resistor":
        case "capacitor":
        case "inductor":
        case "switch": return ["a", "b"];
        case "voltage-source":
        case "current-source": return ["positive", "negative"];
        case "diode":
        case "led": return ["anode", "cathode"];
        case "dependent-source": return ["positive", "negative", "controlPositive", "controlNegative"];
        case "op-amp": return ["nonInverting", "inverting", "output", "positiveSupply", "negativeSupply"];
        case "bjt": return ["collector", "base", "emitter"];
        case "mosfet": return ["drain", "gate", "source"];
        case "not":
        case "buffer": return ["in", "out"];
        case "mux-2to1": return ["d0", "d1", "s0", "out"];
        case "mux-4to1": return ["d0", "d1", "d2", "d3", "s0", "s1", "out"];
        case "d-flip-flop": return ["d", "clk", "q"];
        case "digital-input": return ["out"];
        case "digital-output": return ["in"];
    }
    return [];
}
/** Fields each body record kind accepts (closed vocabulary the validator enforces). */
export const FIELDS_BY_KIND = Object.freeze({
    node: ["ref", "role", "label"],
    connect: ["terminal", "node"],
    "voltage-label": ["positive", "negative"],
    "current-label": ["terminal", "direction"],
    resistor: ["ref", "orientation", "value"],
    capacitor: ["ref", "orientation", "value"],
    inductor: ["ref", "orientation", "value"],
    "voltage-source": ["ref", "orientation", "value", "mode"],
    "current-source": ["ref", "orientation", "value", "mode"],
    diode: ["ref", "orientation", "name"],
    led: ["ref", "orientation", "name"],
    switch: ["ref", "orientation", "name", "mode"],
    "dependent-source": ["ref", "orientation", "value", "mode"],
    "op-amp": ["ref", "orientation", "name"],
    bjt: ["ref", "orientation", "name", "mode"],
    mosfet: ["ref", "orientation", "name", "mode"],
    and: ["ref", "orientation", "inputs"],
    or: ["ref", "orientation", "inputs"],
    nand: ["ref", "orientation", "inputs"],
    nor: ["ref", "orientation", "inputs"],
    xor: ["ref", "orientation", "inputs"],
    xnor: ["ref", "orientation", "inputs"],
    not: ["ref", "orientation"],
    buffer: ["ref", "orientation"],
    "mux-2to1": ["ref", "orientation"],
    "mux-4to1": ["ref", "orientation"],
    "d-flip-flop": ["ref", "orientation"],
    "digital-input": ["ref", "orientation", "name"],
    "digital-output": ["ref", "orientation", "name"],
});
export const MODE_VALUES = {
    "voltage-source": ["dc", "ac"], "current-source": ["dc", "ac"], switch: ["normally-open", "normally-closed"],
    "dependent-source": ["VCVS", "VCCS", "CCVS", "CCCS"], bjt: ["npn", "pnp"], mosfet: ["nmos", "pmos"],
};
function validateAnalogValue(kind, mode, value, range, diagnostics, sourceName) {
    const requiresQuantity = kind === "resistor" || kind === "capacitor" || kind === "inductor" || kind === "voltage-source" || kind === "current-source" || kind === "dependent-source";
    if (!requiresQuantity)
        return;
    if (value === undefined) {
        diagnostics.push(diag("missing-field", `${kind} requires a quantity \`value:\`.`, range, sourceName));
        return;
    }
    let unit;
    if (kind === "resistor")
        unit = "ohm";
    else if (kind === "capacitor")
        unit = "F";
    else if (kind === "inductor")
        unit = "H";
    else if (kind === "voltage-source")
        unit = "V";
    else if (kind === "current-source")
        unit = "A";
    else if (kind === "dependent-source" && mode !== undefined)
        unit = mode === "VCCS" ? "S" : mode === "CCVS" ? "ohm" : "dimensionless";
    try {
        const quantity = parseQuantitySpelling(value);
        const normalizedUnit = quantity.unit.replace(/\s+/g, "");
        const validUnit = unit === undefined || (unit === "dimensionless" ? normalizedUnit === "1" : normalizedUnit === unit || (/^[A-Za-zµ]+$/.test(normalizedUnit) && normalizedUnit.endsWith(unit) && normalizedUnit.length > unit.length));
        if (quantity.coefficient === "0" || quantity.coefficient.startsWith("-") || !validUnit)
            diagnostics.push(diag("invalid-quantity", `${kind} value must be a positive${unit === undefined ? "" : ` ${unit}`} quantity.`, range, sourceName));
    }
    catch {
        diagnostics.push(diag("invalid-quantity", `${kind} value must be a valid positive quantity.`, range, sourceName));
    }
}
function parseBody(lines, diagnostics, sourceName) {
    const out = [];
    let current;
    for (const line of lines) {
        if (/^[ \t]*$/.test(line.text) || COMMENT.test(line.text))
            continue;
        const item = ITEM.exec(line.text);
        if (item !== null) {
            current = { kind: (item[1] ?? "").trim().toLowerCase(), fields: new Map(), range: line.range };
            out.push(current);
            continue;
        }
        const field = FIELD.exec(line.text);
        if (field === null || current === undefined) {
            diagnostics.push(diag("unknown-declaration", "Circuit body entries must begin with `- kind:` and use flat `key: value` fields.", line.range, sourceName));
            continue;
        }
        const key = (field[1] ?? "").toLowerCase();
        if (current.fields.has(key))
            diagnostics.push(diag("duplicate-field", `Circuit field "${key}" is declared twice.`, line.range, sourceName));
        else
            current.fields.set(key, { ...line, value: (field[2] ?? "").trim() });
    }
    return out;
}
export function validateCircuitBlock(options) {
    const { headerLines, bodyLines, blockRange, sourceName, symbolConvention, defaults } = options;
    const diagnostics = [];
    const header = new Map();
    for (const line of headerLines) {
        if (/^[ \t]*$/.test(line.text) || COMMENT.test(line.text))
            continue;
        const match = FIELD.exec(line.text);
        if (match === null) {
            diagnostics.push(diag("unknown-field", "Circuit header entries must be `key: value` fields.", line.range, sourceName));
            continue;
        }
        const key = (match[1] ?? "").toLowerCase();
        if (header.has(key))
            diagnostics.push(diag("duplicate-field", `Circuit header field "${key}" is declared twice.`, line.range, sourceName));
        else
            header.set(key, { ...line, value: (match[2] ?? "").trim() });
    }
    for (const key of header.keys())
        if (!HEADER_FIELDS.includes(key))
            diagnostics.push(diag("unknown-field", `Circuit header field "${key}" is not supported.`, header.get(key).range, sourceName));
    const titleLine = header.get("title");
    const title = titleLine === undefined ? (diagnostics.push(diag("missing-field", "Circuit header requires `title:`.", blockRange, sourceName)), undefined) : text(titleLine.value, titleLine.range, diagnostics, sourceName);
    const descriptionLine = header.get("description");
    const description = descriptionLine === undefined ? undefined : text(descriptionLine.value, descriptionLine.range, diagnostics, sourceName);
    const idLine = header.get("id");
    const id = idLine?.value;
    if (id !== undefined && !NAME.test(id))
        diagnostics.push(diag("invalid-id", "Circuit id must be lowercase-kebab.", idLine.range, sourceName));
    const numberLine = header.get("number");
    const number = numberLine === undefined ? undefined : numberLine.value === "true" ? true : numberLine.value === "false" ? false : (diagnostics.push(diag("invalid-field", "Circuit `number:` must be true or false.", numberLine.range, sourceName)), undefined);
    const flowLine = header.get("flow");
    const defaultFlow = typeof defaults?.flow === "string" ? defaults.flow : undefined;
    const flow = flowLine?.value ?? defaultFlow ?? "left-to-right";
    if (!oneOf(FLOWS, flow))
        diagnostics.push(diag("invalid-field", "Circuit `flow:` must be left-to-right or top-to-bottom.", flowLine?.range ?? blockRange, sourceName));
    if (symbolConvention !== "iec" && symbolConvention !== "ansi")
        diagnostics.push(diag("unsupported-symbol-convention", "Circuit documents require front matter `x-circuit-symbol-convention: iec | ansi`.", blockRange, sourceName));
    const raws = parseBody(bodyLines, diagnostics, sourceName);
    const nodes = [];
    const components = [];
    const relations = [];
    const annotations = [];
    const nodeRefs = new Map();
    const componentRefs = new Map();
    let labelCodePoints = [...(titleLine?.value ?? "")].length + [...(descriptionLine?.value ?? "")].length;
    for (const raw of raws) {
        const f = raw.fields;
        const get = (key) => f.get(key)?.value;
        const allowed = (...keys) => { for (const key of f.keys())
            if (!keys.includes(key))
                diagnostics.push(diag("unknown-field", `Circuit ${raw.kind} field "${key}" is not supported.`, f.get(key).range, sourceName)); };
        if (raw.kind === "node") {
            allowed(...FIELDS_BY_KIND.node);
            const ref = get("ref");
            if (ref === undefined || !NAME.test(ref)) {
                diagnostics.push(diag("invalid-node-ref", "Circuit node requires lowercase-kebab `ref:`.", raw.range, sourceName));
                continue;
            }
            const role = get("role") ?? "signal";
            if (!oneOf(NODE_ROLES, role))
                diagnostics.push(diag("invalid-field", "Circuit node role must be signal or reference.", f.get("role").range, sourceName));
            const labelLine = f.get("label");
            const label = labelLine === undefined ? undefined : text(labelLine.value, labelLine.range, diagnostics, sourceName);
            if (labelLine !== undefined)
                labelCodePoints += [...labelLine.value].length;
            const node = { ref, role: role === "reference" ? "reference" : "signal", ...(label === undefined ? {} : { label }), range: raw.range };
            if (nodeRefs.has(ref))
                diagnostics.push(diag("duplicate-node-ref", `Circuit node "${ref}" is declared twice.`, raw.range, sourceName));
            else {
                nodeRefs.set(ref, node);
                nodes.push(node);
            }
            continue;
        }
        if (raw.kind === "connect") {
            allowed(...FIELDS_BY_KIND.connect);
            const terminal = get("terminal"), node = get("node");
            if (terminal === undefined || node === undefined) {
                diagnostics.push(diag("missing-field", "Circuit connect requires `terminal:` and `node:`.", raw.range, sourceName));
                continue;
            }
            const dot = terminal.indexOf(".");
            if (dot <= 0 || dot === terminal.length - 1) {
                diagnostics.push(diag("invalid-terminal", "Circuit terminal must be a qualified component-terminal reference.", f.get("terminal").range, sourceName));
                continue;
            }
            relations.push({ componentRef: terminal.slice(0, dot), terminal: terminal.slice(dot + 1), nodeId: node, range: raw.range });
            continue;
        }
        if (raw.kind === "voltage-label") {
            allowed(...FIELDS_BY_KIND["voltage-label"]);
            const positive = get("positive"), negative = get("negative");
            if (positive === undefined || negative === undefined)
                diagnostics.push(diag("missing-field", "Voltage label requires `positive:` and `negative:`.", raw.range, sourceName));
            else
                annotations.push({ kind: "voltage-label", positive, negative, range: raw.range });
            continue;
        }
        if (raw.kind === "current-label") {
            allowed(...FIELDS_BY_KIND["current-label"]);
            const terminal = get("terminal"), direction = get("direction");
            const dot = terminal?.indexOf(".") ?? -1;
            if (dot <= 0 || direction === undefined || !oneOf(CURRENT_DIRECTIONS, direction))
                diagnostics.push(diag("invalid-annotation", "Current label requires a qualified terminal and direction into or out.", raw.range, sourceName));
            else
                annotations.push({ kind: "current-label", componentRef: terminal.slice(0, dot), terminal: terminal.slice(dot + 1), direction, range: raw.range });
            continue;
        }
        if (!oneOf(KINDS, raw.kind)) {
            diagnostics.push(diag("unknown-component-kind", `Circuit component kind "${raw.kind}" is not supported.`, raw.range, sourceName));
            continue;
        }
        const kind = raw.kind;
        const allowedFields = FIELDS_BY_KIND[kind];
        allowed(...allowedFields);
        const ref = get("ref");
        if (ref === undefined || !COMPONENT_REF.test(ref)) {
            diagnostics.push(diag("invalid-component-ref", "Circuit component requires uppercase alphanumeric `ref:`.", raw.range, sourceName));
            continue;
        }
        const inputsRaw = get("inputs");
        const inputs = inputsRaw !== undefined && oneOf(GATE_INPUTS, inputsRaw) ? Number(inputsRaw) : undefined;
        if (GATES.has(kind) ? inputsRaw !== undefined && inputs === undefined : inputsRaw !== undefined)
            diagnostics.push(diag("invalid-inputs", "Only logic gates accept `inputs: 2`, `3`, or `4`.", f.get("inputs").range, sourceName));
        const orientation = get("orientation");
        if (orientation !== undefined && !oneOf(ORIENTATIONS, orientation))
            diagnostics.push(diag("invalid-field", "Circuit orientation is invalid.", f.get("orientation").range, sourceName));
        const validOrientation = orientation !== undefined && oneOf(ORIENTATIONS, orientation) ? orientation : undefined;
        const nameLine = f.get("name");
        const valueLine = f.get("value");
        const name = nameLine === undefined ? undefined : text(nameLine.value, nameLine.range, diagnostics, sourceName);
        const value = valueLine === undefined ? undefined : text(valueLine.value, valueLine.range, diagnostics, sourceName);
        const mode = get("mode");
        if (nameLine !== undefined)
            labelCodePoints += [...nameLine.value].length;
        if (valueLine !== undefined)
            labelCodePoints += [...valueLine.value].length;
        const validModes = MODE_VALUES[kind];
        if (validModes !== undefined && mode !== undefined && !validModes.includes(mode))
            diagnostics.push(diag("invalid-field", `${kind} mode must be ${validModes.join(" | ")}.`, f.get("mode").range, sourceName));
        validateAnalogValue(kind, mode, valueLine?.value, valueLine?.range ?? raw.range, diagnostics, sourceName);
        if ((kind === "digital-input" || kind === "digital-output") && name === undefined)
            diagnostics.push(diag("missing-field", `${kind} requires \`name:\`.`, raw.range, sourceName));
        const component = { kind, ref, terminals: terminals(kind, inputs), ...(validOrientation === undefined ? {} : { orientation: validOrientation }), ...(inputs === undefined ? {} : { inputs }), ...(name === undefined ? {} : { name }), ...(value === undefined ? {} : { value }), ...(mode === undefined ? {} : { mode }), range: raw.range };
        if (componentRefs.has(ref))
            diagnostics.push(diag("duplicate-component-ref", `Circuit component "${ref}" is declared twice.`, raw.range, sourceName));
        else {
            componentRefs.set(ref, component);
            components.push(component);
        }
    }
    if (labelCodePoints > 4096)
        diagnostics.push(diag("limit-exceeded", `Circuit label content ${labelCodePoints} exceeds 4096 code points.`, blockRange, sourceName));
    if (components.length > MAX_CIRCUIT_COMPONENTS)
        diagnostics.push(diag("limit-exceeded", `Circuit component count ${components.length} exceeds ${MAX_CIRCUIT_COMPONENTS}.`, blockRange, sourceName));
    if (nodes.length > MAX_CIRCUIT_NODES)
        diagnostics.push(diag("limit-exceeded", `Circuit node count ${nodes.length} exceeds ${MAX_CIRCUIT_NODES}.`, blockRange, sourceName));
    if (relations.length > MAX_CIRCUIT_RELATIONS)
        diagnostics.push(diag("limit-exceeded", `Circuit relation count ${relations.length} exceeds ${MAX_CIRCUIT_RELATIONS}.`, blockRange, sourceName));
    if (annotations.length > MAX_CIRCUIT_ANNOTATIONS)
        diagnostics.push(diag("limit-exceeded", `Circuit annotation count ${annotations.length} exceeds ${MAX_CIRCUIT_ANNOTATIONS}.`, blockRange, sourceName));
    const bound = new Set();
    const usedNodes = new Set();
    const validRelations = [];
    for (const relation of relations) {
        const component = componentRefs.get(relation.componentRef);
        if (component === undefined) {
            diagnostics.push(diag("unknown-component-ref", `Circuit component "${relation.componentRef}" is not declared.`, relation.range, sourceName));
            continue;
        }
        if (!component.terminals.includes(relation.terminal)) {
            diagnostics.push(diag("unknown-terminal", `Circuit terminal "${relation.componentRef}.${relation.terminal}" is not declared.`, relation.range, sourceName));
            continue;
        }
        if (!nodeRefs.has(relation.nodeId)) {
            diagnostics.push(diag("unknown-node-ref", `Circuit node "${relation.nodeId}" is not declared.`, relation.range, sourceName));
            continue;
        }
        const key = `${relation.componentRef}.${relation.terminal}`;
        if (bound.has(key)) {
            diagnostics.push(diag("duplicate-terminal-binding", `Circuit terminal "${key}" is bound more than once.`, relation.range, sourceName));
            continue;
        }
        bound.add(key);
        usedNodes.add(relation.nodeId);
        validRelations.push(relation);
    }
    for (const component of components)
        for (const terminal of component.terminals)
            if (!bound.has(`${component.ref}.${terminal}`))
                diagnostics.push(diag("unbound-terminal", `Circuit terminal "${component.ref}.${terminal}" is not bound.`, component.range, sourceName));
    for (const node of nodes)
        if (!usedNodes.has(node.ref))
            diagnostics.push(diag("unused-node", `Circuit node "${node.ref}" is unused.`, node.range, sourceName, "warning"));
    const componentNodes = new Map();
    const nodeComponents = new Map();
    for (const relation of validRelations) {
        let componentNodeSet = componentNodes.get(relation.componentRef);
        if (componentNodeSet === undefined) {
            componentNodeSet = new Set();
            componentNodes.set(relation.componentRef, componentNodeSet);
        }
        componentNodeSet.add(relation.nodeId);
        let nodeComponentSet = nodeComponents.get(relation.nodeId);
        if (nodeComponentSet === undefined) {
            nodeComponentSet = new Set();
            nodeComponents.set(relation.nodeId, nodeComponentSet);
        }
        nodeComponentSet.add(relation.componentRef);
    }
    const seenComponents = new Set();
    const subgraphs = [];
    for (const component of components) {
        if (seenComponents.has(component.ref) || componentNodes.get(component.ref) === undefined)
            continue;
        const pending = [component.ref];
        const componentSet = new Set();
        const nodeSet = new Set();
        while (pending.length > 0) {
            const ref = pending.pop();
            if (seenComponents.has(ref))
                continue;
            seenComponents.add(ref);
            componentSet.add(ref);
            for (const node of componentNodes.get(ref) ?? []) {
                nodeSet.add(node);
                for (const neighbor of nodeComponents.get(node) ?? [])
                    if (!seenComponents.has(neighbor))
                        pending.push(neighbor);
            }
        }
        subgraphs.push({ components: components.filter((entry) => componentSet.has(entry.ref)).map((entry) => entry.ref), nodes: nodes.filter((entry) => nodeSet.has(entry.ref)).map((entry) => entry.ref), range: component.range });
    }
    if (subgraphs.length > 1)
        for (const subgraph of subgraphs)
            diagnostics.push(diag("disconnected-subgraph", `Circuit disconnected component subgraph contains ${subgraph.components.join(", ")} on nodes ${subgraph.nodes.join(", ")}.`, subgraph.range, sourceName, "warning"));
    if (nodes.filter((node) => node.role === "reference").length > 1)
        diagnostics.push(diag("multiple-reference-nodes", "Circuit may declare at most one reference node.", blockRange, sourceName));
    for (const annotation of annotations) {
        if (annotation.kind === "voltage-label") {
            if (!nodeRefs.has(annotation.positive) || !nodeRefs.has(annotation.negative))
                diagnostics.push(diag("invalid-annotation", "Voltage label targets must be declared nodes.", annotation.range, sourceName));
        }
        else {
            const component = componentRefs.get(annotation.componentRef);
            if (component === undefined || !component.terminals.includes(annotation.terminal))
                diagnostics.push(diag("invalid-annotation", "Current label target must be a declared component terminal.", annotation.range, sourceName));
        }
    }
    const errors = diagnostics.some((entry) => entry.severity === "error");
    if (errors || title === undefined || !oneOf(FLOWS, flow) || (symbolConvention !== "iec" && symbolConvention !== "ansi"))
        return { diagnostics };
    return { diagnostics, block: { kind: "circuit", pluginVersion: CIRCUIT_PLUGIN_VERSION, range: blockRange, ...(id === undefined ? {} : { id }), ...(number === undefined ? {} : { number }), title, ...(description === undefined ? {} : { description }), flow, symbolConvention, nodes, components, relations, annotations } };
}
const pluginDescriptor = Object.freeze({
    type: CIRCUIT_PLUGIN_TYPE,
    version: CIRCUIT_PLUGIN_VERSION,
    title: "Circuit",
    summary: "Native analog and digital circuit diagrams.",
    diagnosticNamespace: "azeforge.circuit",
    sourceSchema: circuitSourceSchema,
    bodySyntax: Object.freeze({ id: CIRCUIT_BODY_SYNTAX_ID, version: CIRCUIT_BODY_SYNTAX_VERSION }),
    dataSchema: circuitDataSchema,
});
export const circuitPlugin = Object.freeze({ descriptor: pluginDescriptor });
//# sourceMappingURL=circuit.js.map