/**
 * Native control-system layout (issue #65 §5, reusing the diagram layout
 * contract issue #60 §5 wholesale).
 *
 * One deterministic projection from a validated `ControlBlock` to measured
 * geometry, over the pinned ELK engine (`elkjs@0.12.0`, the bundled worker-free
 * build). The Block's declaration list is the model: authored order is handed
 * to the engine as model order, stays in the returned lists, and the engine
 * only ever sees positional ids, so an authored name cannot influence — or
 * leak out of — the computation.
 *
 * Three things this module owns:
 *
 * - measurement: every box is sized from the Advance metric and the Theme's
 *   `control` typography tokens, never from a font the compiler cannot observe;
 * - projection: the engine result is read through a narrow geometry-only view
 *   and every number is quantized to three decimals, so two runs on the same
 *   Block produce identical values;
 * - failure: any throw or any missing/non-finite coordinate becomes a
 *   `ControlLayoutError` with a remedy, and the caller publishes no Artifact.
 *
 * Layout is total over every valid Block — there is no `layout-unsupported`
 * path, and no special case for a feedback cycle or a self-loop: both are
 * ordinary engine edges. Positional engine ids are `n<item>` and `e<edge>`,
 * numbered in authored order of their own kind. They are internal: the
 * returned layout carries authored names for the renderer and geometry for the
 * emitter, and nothing else.
 */
import { advanceWidth } from "./advance-metric.js";
import { ELKJS_VERSION } from "./diagram-layout.js";
import { quantize } from "./plot.js";
export { ELKJS_VERSION };
/** One code for every layout refusal: the caller publishes no partial figure. */
export const CONTROL_LAYOUT_ERROR_CODE = "azeforge.renderer#control-layout";
/** Version of the option set below; it rides in the rendering fingerprint. */
export const CONTROL_LAYOUT_OPTIONS_VERSION = "control-options/v1";
/* ------------------------------------------------------------------ *
 * Registered geometry constants
 *
 * Tuned so the contract scenarios (the feedback controller with its fan-out
 * takeoff and back-edge, and every stub/sum combination) export legibly to PNG
 * and PDF at print size: boxes clear their transfer functions, a sum circle
 * seats every sign glyph it must show, and a stub glyph clears its label.
 * ------------------------------------------------------------------ */
/** Horizontal breathing room inside a block box, on each side of the `tf:` text. */
export const BLOCK_PADDING_X = 14;
/** Vertical breathing room inside a block box, above and below the `tf:` text. */
export const BLOCK_PADDING_Y = 10;
/** Smallest block box, so a short transfer function still reads as a block. */
export const MIN_BLOCK_WIDTH = 76;
export const MIN_BLOCK_HEIGHT = 40;
/** Arc length kept clear around each sign glyph on a sum circle's circumference. */
export const SUM_SIGN_GAP = 8;
/** Band between a sum sign glyph and the circle's stroke. */
export const SUM_SIGN_PADDING = 5;
/** Smallest sum circle, so a one- or two-sign junction still reads as a circle. */
export const MIN_SUM_DIAMETER = 32;
/** Side of the square boundary glyph a stub draws before its label. */
export const STUB_GLYPH_SIZE = 12;
/** Gap between a stub glyph and its label text. */
export const STUB_LABEL_GAP = 6;
/** Smallest stub box, so a one-letter label still reads as a boundary marker. */
export const MIN_STUB_WIDTH = 56;
export const MIN_STUB_HEIGHT = 28;
/** Gap between two items in one layer (the diagram family's value). */
export const NODE_SPACING = 28;
/** Gap between two layers (the diagram family's value). */
export const LAYER_SPACING = 48;
/** Gap an edge keeps from an item it does not touch. */
export const EDGE_NODE_SPACING = 16;
/** Gap between two parallel edges. */
export const EDGE_EDGE_SPACING = 12;
/** Gap between two disconnected components. */
export const COMPONENT_SPACING = 40;
/** Outer margin of the whole drawing. */
export const ROOT_PADDING = 16;
/** Fixed nonzero seed; layout must not vary between runs. */
export const ELK_RANDOM_SEED = 1;
/** Authored flow -> engine direction. */
const ELK_DIRECTION = Object.freeze({
    "top-to-bottom": "DOWN",
    "bottom-to-top": "UP",
    "left-to-right": "RIGHT",
    "right-to-left": "LEFT",
});
const ROOT_ID = "root";
const ROOT_PADDING_BOX = `[top=${ROOT_PADDING},left=${ROOT_PADDING},bottom=${ROOT_PADDING},right=${ROOT_PADDING}]`;
/**
 * `considerModelOrder` stays off (§5): the engine lays the rank/order out on
 * its own and authored order is model order it may only break ties with. The
 * random seed is fixed, so two runs on one Block cannot differ.
 */
const ROOT_LAYOUT_OPTIONS = Object.freeze({
    "elk.algorithm": "layered",
    "elk.edgeRouting": "ORTHOGONAL",
    "elk.randomSeed": String(ELK_RANDOM_SEED),
    "elk.padding": ROOT_PADDING_BOX,
    "elk.spacing.nodeNode": String(NODE_SPACING),
    "elk.spacing.edgeNode": String(EDGE_NODE_SPACING),
    "elk.spacing.edgeEdge": String(EDGE_EDGE_SPACING),
    "elk.spacing.componentComponent": String(COMPONENT_SPACING),
    "elk.layered.spacing.nodeNodeBetweenLayers": String(LAYER_SPACING),
    "elk.layered.spacing.edgeNodeBetweenLayers": String(EDGE_NODE_SPACING),
    "elk.layered.spacing.edgeEdgeBetweenLayers": String(EDGE_EDGE_SPACING),
});
/** The remedy every refusal carries: one sentence, an action the author owns. */
const LAYOUT_REMEDY = "Shorten the block's transfer-function and signal labels, or reduce its number of items and edges, then render the document again.";
/** Fail-closed layout refusal; the caller publishes no Artifact. */
export class ControlLayoutError extends Error {
    code;
    remedy;
    constructor(message, remedy = LAYOUT_REMEDY) {
        super(message);
        this.name = "ControlLayoutError";
        this.code = CONTROL_LAYOUT_ERROR_CODE;
        this.remedy = remedy;
    }
}
/* ------------------------------------------------------------------ *
 * Numbers
 * ------------------------------------------------------------------ */
function refusal(detail, remedy = LAYOUT_REMEDY) {
    return new ControlLayoutError(`Control layout failed: ${detail}`, remedy);
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
export function controlLabelTypography(theme) {
    const tokens = theme.control;
    const size = (value) => Math.max(value, tokens.minimumLabelFontSizePx);
    const blockFontSizePx = size(tokens.blockLabelFontSizePx);
    const signalFontSizePx = size(tokens.signalLabelFontSizePx);
    const sumSignFontSizePx = size(tokens.sumSignFontSizePx);
    const stubFontSizePx = size(tokens.stubLabelFontSizePx);
    return {
        blockFontSizePx,
        blockLineHeightPx: Math.max(tokens.blockLabelLineHeightPx, blockFontSizePx),
        signalFontSizePx,
        signalLineHeightPx: Math.max(tokens.signalLabelLineHeightPx, signalFontSizePx),
        sumSignFontSizePx,
        stubFontSizePx,
        stubLineHeightPx: Math.max(tokens.stubLabelLineHeightPx, stubFontSizePx),
    };
}
/**
 * Block box: the `tf:` text plus its band, widened and heightened by the
 * optional `label:` the emitter draws as a second line inside the same box
 * (measured in the signal set, exactly as `input`/`output` label text is).
 */
function blockBox(item, typography) {
    const tfAdvance = Math.max(advanceWidth(item.tf, typography.blockFontSizePx), 0);
    const labelAdvance = item.label === undefined
        ? 0
        : Math.max(advanceWidth(item.label, typography.signalFontSizePx), 0);
    const labelLines = item.label === undefined ? 0 : 1;
    return {
        width: Math.max(Math.max(tfAdvance, labelAdvance) + 2 * BLOCK_PADDING_X, MIN_BLOCK_WIDTH),
        height: Math.max(typography.blockLineHeightPx +
            labelLines * typography.signalLineHeightPx +
            2 * BLOCK_PADDING_Y, MIN_BLOCK_HEIGHT),
    };
}
/**
 * Sum box: a circle whose circumference seats every sign glyph it must show —
 * `signs.length` slots of the widest sign plus its clearance — never smaller
 * than a glyph plus its band, so the junction always reads as a circle.
 */
function sumBox(item, typography) {
    let widestSign = 0;
    for (const sign of item.signs) {
        widestSign = Math.max(widestSign, Math.max(advanceWidth([{ kind: "text", value: sign }], typography.sumSignFontSizePx), 0));
    }
    const seated = (item.signs.length * (widestSign + SUM_SIGN_GAP)) / Math.PI;
    const diameter = Math.max(seated, typography.sumSignFontSizePx + 2 * SUM_SIGN_PADDING, MIN_SUM_DIAMETER);
    return { width: diameter, height: diameter };
}
/** Stub box: the boundary glyph plus its label text. */
function stubBox(item, typography) {
    const advance = Math.max(advanceWidth(item.label, typography.stubFontSizePx), 0);
    return {
        width: Math.max(STUB_GLYPH_SIZE + STUB_LABEL_GAP + advance, MIN_STUB_WIDTH),
        height: Math.max(STUB_GLYPH_SIZE, typography.stubLineHeightPx, MIN_STUB_HEIGHT),
    };
}
/** Box of one drawable item; every kind is sized here and nowhere else. */
function nodeBox(item, typography) {
    switch (item.kind) {
        case "block":
            return blockBox(item, typography);
        case "sum":
            return sumBox(item, typography);
        default:
            return stubBox(item, typography);
    }
}
function nodeShell(planned, typography) {
    const box = nodeBox(planned.declaration, typography);
    return { id: planned.id, width: box.width, height: box.height };
}
/**
 * Build the engine graph in authored order: items first (identity and boxes),
 * then edges resolved against the completed name table. Siblings keep authored
 * order — the engine's model order — and an edge is handed to the engine for
 * its two endpoints only, so a self-loop is simply an edge whose endpoints
 * happen to be one item.
 */
function planGraph(block, theme) {
    const typography = controlLabelTypography(theme);
    const nodes = [];
    const edges = [];
    const nodeByName = new Map();
    const shells = [];
    const edgeDeclarations = [];
    let declarationIndex = 0;
    for (const declaration of block.declarations) {
        if (declaration.kind === "edge") {
            edgeDeclarations.push(declaration);
            declarationIndex += 1;
            continue;
        }
        if (nodeByName.has(declaration.name)) {
            throw refusal(`two items share the name "${declaration.name}".`);
        }
        const planned = { id: `n${nodes.length}`, declaration, declarationIndex };
        nodeByName.set(declaration.name, planned);
        shells.push(nodeShell(planned, typography));
        nodes.push(planned);
        declarationIndex += 1;
    }
    edgeDeclarations.forEach((declaration, index) => {
        const from = nodeByName.get(declaration.from);
        const to = nodeByName.get(declaration.to);
        if (from === undefined) {
            throw refusal(`the edge from "${declaration.from}" names no declared item.`);
        }
        if (to === undefined) {
            throw refusal(`the edge to "${declaration.to}" names no declared item.`);
        }
        edges.push({ id: `e${index}`, declaration, declarationIndex: index, from, to });
    });
    // Every item is a root child and every edge is a root edge: the control
    // model is flat, so it needs none of the diagram family's container walk.
    const root = {
        id: ROOT_ID,
        layoutOptions: { ...ROOT_LAYOUT_OPTIONS, "elk.direction": ELK_DIRECTION[block.flow] },
        children: shells,
        edges: edges.map((edge) => ({
            id: edge.id,
            sources: [edge.from.id],
            targets: [edge.to.id],
        })),
    };
    return { root, nodes, edges };
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
function projectNode(planned, index) {
    const element = index.elements.get(planned.id);
    const origin = index.origins.get(planned.id);
    if (element === undefined || origin === undefined) {
        throw refusal(`the layout engine returned no box for the item "${planned.declaration.name}".`);
    }
    const what = `item "${planned.declaration.name}"`;
    return {
        x: q(origin.x),
        y: q(origin.y),
        width: q(coordinate(element.width, `${what} width`)),
        height: q(coordinate(element.height, `${what} height`)),
        name: planned.declaration.name,
        kind: planned.declaration.kind,
        declarationIndex: planned.declarationIndex,
    };
}
function projectEdge(planned, index) {
    const edge = index.edges.get(planned.id);
    if (edge === undefined) {
        throw refusal(`the layout engine returned no route for the edge from "${planned.declaration.from}".`);
    }
    const sections = (edge.sections ?? []).map((section, sectionIndex) => {
        const what = `edge section ${sectionIndex}`;
        return {
            startPoint: projectPoint(section.startPoint, `${what} start`, { x: 0, y: 0 }),
            endPoint: projectPoint(section.endPoint, `${what} end`, { x: 0, y: 0 }),
            bendPoints: (section.bendPoints ?? []).map((point, pointIndex) => projectPoint(point, `${what} bend ${pointIndex}`, { x: 0, y: 0 })),
        };
    });
    return {
        declarationIndex: planned.declarationIndex,
        from: planned.declaration.from,
        to: planned.declaration.to,
        sections,
    };
}
/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */
/**
 * Measured, quantized layout for one Block. Deterministic; browser-free.
 *
 * Fails closed: the returned value is either a complete layout or a
 * `ControlLayoutError` carrying a remedy — never a partial one.
 */
export async function layoutControl(block, theme) {
    try {
        const graph = planGraph(block, theme);
        // A static import cannot serve this contract: §5 requires a missing
        // `elkjs` to surface as a structured ControlLayoutError at call time,
        // never as a load-time crash of every consumer that imports the package.
        // The bundled build is CommonJS, so under NodeNext interop the module's
        // `default` types as the namespace rather than the constructor; one cast
        // at that library boundary is what buys the narrow `ElkEngine` surface.
        const module = await import("elkjs/lib/elk.bundled.js");
        const ElkConstructor = module.default;
        const engine = new ElkConstructor();
        const raw = await engine.layout(graph.root);
        const index = indexEngine(raw);
        const width = coordinate(raw.width, "the drawing width");
        const height = coordinate(raw.height, "the drawing height");
        return {
            width: q(width),
            height: q(height),
            nodes: graph.nodes.map((node) => projectNode(node, index)),
            edges: graph.edges.map((edge) => projectEdge(edge, index)),
        };
    }
    catch (error) {
        if (error instanceof ControlLayoutError)
            throw error;
        throw refusal(error instanceof Error ? error.message : String(error));
    }
}
//# sourceMappingURL=control-layout.js.map