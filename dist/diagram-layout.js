/**
 * Native general-diagram layout (issue #76, contract issue #60 §4).
 *
 * One deterministic projection from a validated `DiagramBlock` to measured
 * geometry, over the pinned ELK engine (`elkjs@0.12.0`, the bundled
 * worker-free build). The Block's declaration list is the model: authored
 * order is preserved, and the engine only ever sees positional ids, so an
 * authored name cannot influence — or leak out of — the computation.
 *
 * Three things this module owns:
 *
 * - measurement: every box is sized from the Advance metric and the Theme
 *   typography tokens, never from a font the compiler cannot observe;
 * - projection: the engine's parent-relative hierarchy is flattened to one
 *   absolute coordinate system, and every number is quantized to three
 *   decimals so two runs on the same Block produce identical values;
 * - failure: any throw or any missing/non-finite coordinate becomes a
 *   `DiagramLayoutError` with a remedy, and the caller publishes no Artifact.
 *
 * Positional engine ids are `n<node>`, `g<group>`, `p<node>-<port>` and
 * `e<edge>`, numbered in authored order of their own kind. They are internal:
 * the returned layout carries authored names for the renderer and geometry
 * for the emitter, and nothing else.
 */
import { labelAdvance, labelLines } from "./advance-metric.js";
import { quantize } from "./plot.js";
export const DIAGRAM_LAYOUT_VERSION = "diagram-layout/v1";
export const ELKJS_VERSION = "0.12.0";
/** One code for every layout refusal: the caller publishes no partial figure. */
export const DIAGRAM_LAYOUT_ERROR_CODE = "azeforge.renderer#diagram-layout";
/* ------------------------------------------------------------------ *
 * Registered geometry constants
 *
 * Tuned so the contract scenarios (a branching process with a cycle, a tree
 * with forward references, a nested architecture with ports) export legibly
 * to PNG and PDF at print size: boxes clear their labels, ports sit on the
 * border without touching the label, and group bands stay readable at the
 * four permitted nesting levels.
 * ------------------------------------------------------------------ */
/** Horizontal breathing room inside a node box, on a side without ports. */
export const NODE_PADDING_X = 14;
/** Vertical breathing room inside a node box, on a side without ports. */
export const NODE_PADDING_Y = 10;
/** Smallest node box, so a short or absent label still reads as a shape. */
export const MIN_NODE_WIDTH = 72;
export const MIN_NODE_HEIGHT = 36;
/** Band between a group's border and its members. */
export const GROUP_PADDING = 16;
/** Extra band between a group label and its members. */
export const GROUP_LABEL_GAP = 6;
/** Smallest empty group box (a group with no members still draws). */
export const MIN_GROUP_WIDTH = 96;
export const MIN_GROUP_HEIGHT = 56;
/** Gap between two nodes in one layer. */
export const NODE_SPACING = 28;
/** Gap between two layers. */
export const LAYER_SPACING = 48;
/** Gap an edge keeps from a node it does not touch. */
export const EDGE_NODE_SPACING = 16;
/** Gap between two parallel edges. */
export const EDGE_EDGE_SPACING = 12;
/** Gap between two disconnected components. */
export const COMPONENT_SPACING = 40;
/** Gap between two ports on one side of a node. */
export const PORT_SPACING = 8;
/** Outer margin of the whole drawing. */
export const ROOT_PADDING = 16;
/** Fixed nonzero seed; layout must not vary between runs. */
export const ELK_RANDOM_SEED = 1;
/** Authored side -> engine side. Only authored sides are ever handed over. */
const ELK_PORT_SIDE = Object.freeze({
    left: "WEST",
    right: "EAST",
    top: "NORTH",
    bottom: "SOUTH",
});
/** Authored flow -> engine direction. */
const ELK_DIRECTION = Object.freeze({
    "top-to-bottom": "DOWN",
    "bottom-to-top": "UP",
    "left-to-right": "RIGHT",
    "right-to-left": "LEFT",
});
/**
 * Authored sides are honoured only under `FIXED_SIDE`: without it the engine
 * puts every port on one side and ignores `elk.port.side`. A port with no
 * authored side carries no side option at all, so the engine still chooses.
 */
const PORT_CONSTRAINTS = "FIXED_SIDE";
const ROOT_ID = "root";
const ROOT_PADDING_BOX = `[top=${ROOT_PADDING},left=${ROOT_PADDING},bottom=${ROOT_PADDING},right=${ROOT_PADDING}]`;
const ROOT_LAYOUT_OPTIONS = Object.freeze({
    "elk.algorithm": "layered",
    "elk.edgeRouting": "ORTHOGONAL",
    "elk.hierarchyHandling": "INCLUDE_CHILDREN",
    "elk.randomSeed": String(ELK_RANDOM_SEED),
    "elk.padding": ROOT_PADDING_BOX,
    "elk.spacing.nodeNode": String(NODE_SPACING),
    "elk.spacing.edgeNode": String(EDGE_NODE_SPACING),
    "elk.spacing.edgeEdge": String(EDGE_EDGE_SPACING),
    "elk.spacing.componentComponent": String(COMPONENT_SPACING),
    "elk.spacing.portPort": String(PORT_SPACING),
    "elk.layered.spacing.nodeNodeBetweenLayers": String(LAYER_SPACING),
    "elk.layered.spacing.edgeNodeBetweenLayers": String(EDGE_NODE_SPACING),
    "elk.layered.spacing.edgeEdgeBetweenLayers": String(EDGE_EDGE_SPACING),
});
/** The remedy every refusal carries: one sentence, an action the author owns. */
const LAYOUT_REMEDY = "Shorten the diagram's labels, or reduce its node, port and group counts, then render the document again.";
/** Fail-closed layout refusal; the caller publishes no Artifact. */
export class DiagramLayoutError extends Error {
    code;
    remedy;
    constructor(message, remedy = LAYOUT_REMEDY) {
        super(message);
        this.name = "DiagramLayoutError";
        this.code = DIAGRAM_LAYOUT_ERROR_CODE;
        this.remedy = remedy;
    }
}
/* ------------------------------------------------------------------ *
 * Numbers
 * ------------------------------------------------------------------ */
function refusal(detail, remedy = LAYOUT_REMEDY) {
    return new DiagramLayoutError(`Diagram layout failed: ${detail}`, remedy);
}
/** Quantized 3-decimal value: the only number shape the renderer ever sees. */
function q(value) {
    return Number(quantize(value));
}
/** Fail closed on a coordinate the engine did not supply or made non-finite. */
function coordinate(value, what) {
    if (value === undefined || !Number.isFinite(value)) {
        throw refusal(`${what} is missing or not a finite number.`);
    }
    return value;
}
export function diagramLabelTypography(theme) {
    const tokens = theme.diagram;
    const floor = tokens.minimumLabelFontSizePx;
    const size = (value) => Math.max(value, floor);
    const nodeFontSizePx = size(tokens.nodeLabelFontSizePx);
    const groupFontSizePx = size(tokens.groupLabelFontSizePx);
    const edgeFontSizePx = size(tokens.edgeLabelFontSizePx);
    return {
        nodeFontSizePx,
        nodeLineHeightPx: Math.max(tokens.nodeLabelLineHeightPx, nodeFontSizePx),
        groupFontSizePx,
        groupLineHeightPx: Math.max(tokens.groupLabelLineHeightPx, groupFontSizePx),
        edgeFontSizePx,
        edgeLineHeightPx: Math.max(tokens.edgeLabelLineHeightPx, edgeFontSizePx),
    };
}
/** Node box: the label plus its band, with port space reserved per side. */
function nodeBox(node, theme) {
    const settings = theme.diagram;
    const label = diagramLabelTypography(theme);
    const half = settings.portSizePx / 2;
    const sides = new Set();
    for (const port of node.ports) {
        if (port.side !== undefined)
            sides.add(port.side);
    }
    const advance = node.label === undefined
        ? 0
        : Math.max(labelAdvance(node.label, label.nodeFontSizePx), 0);
    const lines = labelLines(node.label);
    return {
        width: Math.max(advance +
            NODE_PADDING_X +
            (sides.has("left") ? half : 0) +
            NODE_PADDING_X +
            (sides.has("right") ? half : 0), MIN_NODE_WIDTH),
        height: Math.max(lines * label.nodeLineHeightPx +
            NODE_PADDING_Y +
            (sides.has("top") ? half : 0) +
            NODE_PADDING_Y +
            (sides.has("bottom") ? half : 0), MIN_NODE_HEIGHT),
    };
}
/** An empty group still draws: its box holds its label and nothing else. */
function emptyGroupBox(group, theme) {
    const label = diagramLabelTypography(theme);
    const advance = group.label === undefined
        ? 0
        : Math.max(labelAdvance(group.label, label.groupFontSizePx), 0);
    return {
        width: Math.max(advance + 2 * GROUP_PADDING, MIN_GROUP_WIDTH),
        height: Math.max(labelLines(group.label) * label.groupLineHeightPx + 2 * GROUP_PADDING, MIN_GROUP_HEIGHT),
    };
}
/** The group label is reserved as extra top padding, so it never sits on a member. */
function groupPadding(group, theme) {
    const labelHeight = group.label === undefined
        ? 0
        : labelLines(group.label) * diagramLabelTypography(theme).groupLineHeightPx;
    const top = labelHeight === 0 ? GROUP_PADDING : GROUP_PADDING + labelHeight + GROUP_LABEL_GAP;
    return `[top=${top},left=${GROUP_PADDING},bottom=${GROUP_PADDING},right=${GROUP_PADDING}]`;
}
function portShell(planned, portSizePx) {
    const side = planned.declaration.side;
    const shell = { id: planned.id, width: portSizePx, height: portSizePx };
    if (side !== undefined) {
        shell.layoutOptions = { "elk.port.side": ELK_PORT_SIDE[side] };
    }
    return shell;
}
function nodeShell(planned, theme) {
    const box = nodeBox(planned.declaration, theme);
    const shell = { id: planned.id, width: box.width, height: box.height };
    if (planned.ports.length > 0) {
        shell.ports = planned.ports.map((port) => portShell(port, theme.diagram.portSizePx));
        shell.layoutOptions = { "elk.portConstraints": PORT_CONSTRAINTS };
    }
    return shell;
}
/** Container chain, outermost first; `containerOf` holds no root entry. */
function containerChain(containerOf, elementId) {
    const chain = [];
    const seen = new Set([elementId]);
    let container = containerOf.get(elementId);
    while (container !== undefined && container !== ROOT_ID) {
        if (seen.has(container))
            throw refusal(`group nesting around "${elementId}" is cyclic.`);
        seen.add(container);
        chain.push(container);
        container = containerOf.get(container);
    }
    chain.push(ROOT_ID);
    chain.reverse();
    return chain;
}
/** The engine attaches an edge to its endpoints' deepest shared container. */
function lowestCommonContainer(containerOf, left, right) {
    const leftChain = containerChain(containerOf, left);
    const rightChain = containerChain(containerOf, right);
    const limit = Math.min(leftChain.length, rightChain.length);
    let common = ROOT_ID;
    for (let index = 0; index < limit; index += 1) {
        const step = leftChain[index];
        if (step === undefined || step !== rightChain[index])
            break;
        common = step;
    }
    return common;
}
function resolveEndpoint(endpoint, nodeByName) {
    const node = nodeByName.get(endpoint.name);
    if (node === undefined)
        throw refusal(`edge endpoint "${endpoint.name}" names no node.`);
    if (endpoint.port === undefined)
        return { id: node.id, nodeId: node.id };
    const port = node.ports.find((candidate) => candidate.declaration.name === endpoint.port);
    if (port === undefined) {
        throw refusal(`edge endpoint "${endpoint.name}.${endpoint.port}" names no declared port.`);
    }
    return { id: port.id, nodeId: node.id };
}
/**
 * Build the engine graph in one authored-order pass for identity, one for
 * membership, then assemble containers. Siblings keep authored order (the
 * engine's model order) and every group is an engine parent node.
 */
function planGraph(block, theme) {
    const nodes = [];
    const groups = [];
    const edgeDeclarations = [];
    const shells = new Map();
    const nodeByName = new Map();
    const groupIdByName = new Map();
    let nodeIndex = 0;
    let groupIndex = 0;
    for (const declaration of block.declarations) {
        if (declaration.kind === "node") {
            const planned = {
                id: `n${nodeIndex}`,
                declaration,
                ports: declaration.ports.map((port, index) => ({
                    id: `p${nodeIndex}-${index}`,
                    declaration: port,
                })),
            };
            nodeIndex += 1;
            if (nodeByName.has(declaration.name)) {
                throw refusal(`two nodes share the name "${declaration.name}".`);
            }
            nodeByName.set(declaration.name, planned);
            shells.set(planned.id, nodeShell(planned, theme));
            nodes.push(planned);
        }
        else if (declaration.kind === "group") {
            if (groupIdByName.has(declaration.name)) {
                throw refusal(`two groups share the name "${declaration.name}".`);
            }
            groupIdByName.set(declaration.name, `g${groupIndex}`);
            groups.push({ id: `g${groupIndex}`, declaration, depth: 0 });
            groupIndex += 1;
        }
        else {
            edgeDeclarations.push(declaration);
        }
    }
    // Membership: authored order, across both member kinds.
    const memberIds = new Map();
    const containerOf = new Map();
    const members = [];
    for (const declaration of block.declarations) {
        if (declaration.kind === "node") {
            members.push({
                name: declaration.name,
                id: nodeByName.get(declaration.name)?.id ?? "",
                parent: declaration.parent,
            });
        }
        else if (declaration.kind === "group") {
            members.push({
                name: declaration.name,
                id: groupIdByName.get(declaration.name) ?? "",
                parent: declaration.parent,
            });
        }
    }
    for (const member of members) {
        let container = ROOT_ID;
        if (member.parent !== undefined) {
            const parentId = groupIdByName.get(member.parent);
            if (parentId === undefined) {
                throw refusal(nodeByName.has(member.parent)
                    ? `"${member.name}" is declared inside "${member.parent}", which is a node, not a group.`
                    : `"${member.name}" is declared inside "${member.parent}", which is not a group.`);
            }
            container = parentId;
            containerOf.set(member.id, container);
        }
        const siblings = memberIds.get(container);
        if (siblings === undefined)
            memberIds.set(container, [member.id]);
        else
            siblings.push(member.id);
    }
    const projectedGroups = groups.map((group) => ({
        ...group,
        depth: containerChain(containerOf, group.id).length - 1,
    }));
    // Deepest first: a nested group must have its box before its parent
    // assembles it, and the author is free to declare the outer group first.
    const assemblyOrder = [...projectedGroups].sort((left, right) => right.depth - left.depth);
    for (const group of assemblyOrder) {
        const children = memberIds.get(group.id) ?? [];
        const shell = { id: group.id };
        if (children.length > 0) {
            shell.children = children.map((id) => {
                const child = shells.get(id);
                if (child === undefined)
                    throw refusal(`group "${group.declaration.name}" has no box.`);
                return child;
            });
            shell.layoutOptions = { "elk.padding": groupPadding(group.declaration, theme) };
        }
        else {
            const box = emptyGroupBox(group.declaration, theme);
            shell.width = box.width;
            shell.height = box.height;
        }
        shells.set(group.id, shell);
    }
    const rootChildren = (memberIds.get(ROOT_ID) ?? []).map((id) => {
        const child = shells.get(id);
        if (child === undefined)
            throw refusal(`"${id}" has no engine box.`);
        return child;
    });
    // Edges: positional distinct ids, attached to the container the engine
    // would choose for them, and routed in authored order.
    const edgeShells = new Map();
    const edges = edgeDeclarations.map((declaration, index) => {
        const from = resolveEndpoint(declaration.from, nodeByName);
        const to = resolveEndpoint(declaration.to, nodeByName);
        const id = `e${index}`;
        const containerId = lowestCommonContainer(containerOf, from.nodeId, to.nodeId);
        const engineEdge = { id, sources: [from.id], targets: [to.id] };
        const hosted = edgeShells.get(containerId);
        if (hosted === undefined)
            edgeShells.set(containerId, [engineEdge]);
        else
            hosted.push(engineEdge);
        return { id, declaration, containerId };
    });
    const root = {
        id: ROOT_ID,
        layoutOptions: { ...ROOT_LAYOUT_OPTIONS, "elk.direction": ELK_DIRECTION[block.flow] },
        children: rootChildren,
        edges: edgeShells.get(ROOT_ID) ?? [],
    };
    for (const [containerId, hosted] of edgeShells) {
        if (containerId === ROOT_ID)
            continue;
        const shell = shells.get(containerId);
        if (shell === undefined)
            throw refusal(`edge container "${containerId}" has no box.`);
        shell.edges = hosted;
    }
    return { root, nodes, groups: projectedGroups, edges, containerOf };
}
/** Walk the engine result once: index boxes, flatten parent-relative origins. */
function indexEngine(root) {
    const elements = new Map();
    const edges = new Map();
    const origins = new Map();
    const visit = (element, originX, originY) => {
        if (element.id !== undefined) {
            elements.set(element.id, element);
            origins.set(element.id, { x: originX, y: originY });
        }
        for (const child of element.children ?? []) {
            const x = coordinate(child.x, "a child box x");
            const y = coordinate(child.y, "a child box y");
            visit(child, originX + x, originY + y);
        }
        for (const edge of element.edges ?? []) {
            if (edge.id !== undefined)
                edges.set(edge.id, edge);
        }
    };
    visit(root, 0, 0);
    return { elements, edges, origins };
}
function projectPoint(view, what, origin) {
    return {
        x: q(origin.x + coordinate(view?.x, `${what} x`)),
        y: q(origin.y + coordinate(view?.y, `${what} y`)),
    };
}
function projectPorts(planned, element, origin) {
    if (planned.ports.length === 0)
        return [];
    const returned = new Map();
    for (const port of element.ports ?? []) {
        if (port.id !== undefined)
            returned.set(port.id, port);
    }
    return planned.ports.map((port) => {
        const view = returned.get(port.id);
        if (view === undefined) {
            throw refusal(`the layout engine returned no box for port "${port.declaration.name}".`);
        }
        const what = `port "${port.declaration.name}"`;
        const side = port.declaration.side;
        return {
            x: q(origin.x + coordinate(view.x, `${what} x`)),
            y: q(origin.y + coordinate(view.y, `${what} y`)),
            width: q(coordinate(view.width, `${what} width`)),
            height: q(coordinate(view.height, `${what} height`)),
            name: port.declaration.name,
            ...(side === undefined ? {} : { side }),
        };
    });
}
function projectNode(planned, index) {
    const element = index.elements.get(planned.id);
    const origin = index.origins.get(planned.id);
    if (element === undefined || origin === undefined) {
        throw refusal(`the layout engine returned no box for node "${planned.declaration.name}".`);
    }
    return {
        x: q(origin.x),
        y: q(origin.y),
        width: q(coordinate(element.width, `node "${planned.declaration.name}" width`)),
        height: q(coordinate(element.height, `node "${planned.declaration.name}" height`)),
        name: planned.declaration.name,
        shape: planned.declaration.shape,
        ports: projectPorts(planned, element, origin),
    };
}
function projectGroup(planned, index) {
    const element = index.elements.get(planned.id);
    const origin = index.origins.get(planned.id);
    if (element === undefined || origin === undefined) {
        throw refusal(`the layout engine returned no box for group "${planned.declaration.name}".`);
    }
    return {
        x: q(origin.x),
        y: q(origin.y),
        width: q(coordinate(element.width, `group "${planned.declaration.name}" width`)),
        height: q(coordinate(element.height, `group "${planned.declaration.name}" height`)),
        name: planned.declaration.name,
        depth: planned.depth,
    };
}
function projectEdge(planned, index) {
    const edge = index.edges.get(planned.id);
    if (edge === undefined) {
        throw refusal(`the layout engine returned no route for the edge from "${planned.declaration.from.name}".`);
    }
    // Section points are relative to the container that hosts the edge.
    const origin = index.origins.get(planned.containerId) ?? { x: 0, y: 0 };
    const sections = (edge.sections ?? []).map((section, sectionIndex) => {
        const what = `edge section ${sectionIndex}`;
        return {
            startPoint: projectPoint(section.startPoint, `${what} start`, origin),
            endPoint: projectPoint(section.endPoint, `${what} end`, origin),
            bendPoints: (section.bendPoints ?? []).map((point, pointIndex) => projectPoint(point, `${what} bend ${pointIndex}`, origin)),
        };
    });
    return { sections };
}
/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */
/**
 * Measured, quantized layout for one Block. Deterministic; browser-free.
 *
 * Fails closed: the returned value is either a complete layout or a
 * `DiagramLayoutError` carrying a remedy — never a partial one.
 */
export async function layoutDiagram(block, theme) {
    try {
        const graph = planGraph(block, theme);
        // A static import cannot serve this contract: §4 requires a missing
        // `elkjs` to surface as a structured DiagramLayoutError at call time,
        // never as a load-time crash of every consumer that imports the package.
        // The bundled build is CommonJS, so under NodeNext interop the module's
        // `default` types as the namespace rather than the constructor; one cast
        // at that library boundary is what buys the narrow `ElkEngine` surface.
        const module = await import("elkjs/lib/elk.bundled.js");
        const ElkConstructor = module.default;
        const engine = new ElkConstructor();
        const raw = await engine.layout(graph.root);
        const index = indexEngine(raw);
        const width = coordinate(raw.width, "the diagram width");
        const height = coordinate(raw.height, "the diagram height");
        return {
            width: q(width),
            height: q(height),
            nodes: graph.nodes.map((node) => projectNode(node, index)),
            groups: graph.groups.map((group) => projectGroup(group, index)),
            edges: graph.edges.map((edge) => projectEdge(edge, index)),
        };
    }
    catch (error) {
        if (error instanceof DiagramLayoutError)
            throw error;
        throw refusal(error instanceof Error ? error.message : String(error));
    }
}
//# sourceMappingURL=diagram-layout.js.map