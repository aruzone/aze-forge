/**
 * Native general-diagram emitter (contract: issue #76 §5; GH #60).
 *
 * One project-owned SVG emitter over the pinned ELK layout projection:
 * quantized 3-decimal coordinates, positional ids and an intrinsic finite
 * positive viewBox. The emitter registers no extent ceiling of its own —
 * layout is total, so every valid Block renders, and the Artifact-format
 * legs own their published byte and pixel limits. Placement is legibility, never
 * meaning: a reader who cannot see the pixels still gets mode, flow, counts,
 * nodes, edges and group membership from `<desc>`, and a directed edge differs
 * from an undirected one by geometry — an arrowhead polygon — rather than by
 * colour alone.
 *
 * The fragment carries no presentation attributes: every fill, stroke, width
 * and font size comes from the layout CSS in `render-html.ts`, so one fragment
 * serves every Theme. Zero scripts, zero event attributes, zero animation and
 * zero external references; every authored name is escaped and never becomes
 * an `id` (ids are positional, so two Blocks with the same names cannot
 * collide in one Document).
 */
import { advanceMetricDependencyClosure, labelAdvance, labelLines, } from "./advance-metric.js";
import { DIAGRAM_LAYOUT_VERSION, ELKJS_VERSION, diagramLabelTypography, layoutDiagram, } from "./diagram-layout.js";
import { escapeXml, quantize } from "./plot.js";
import { defaultTheme } from "./theme.js";
export const DIAGRAM_HTML_BLOCK_RENDERER_ID = "azeforge.diagram.html/v1";
export const DIAGRAM_HTML_BLOCK_RENDERER_VERSION = "1.0.0";
export const DIAGRAM_EMITTER_VERSION = "1.0.0";
/** The projection quantizes every coordinate through `quantize`, i.e. 3 decimals. */
const QUANTIZATION_DECIMALS = 3;
/** Layout-option fingerprint the projection was tuned with (issue #76 §4). */
const DIAGRAM_OPTIONS_VERSION = "diagram-options/v1";
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const ARROW_LENGTH_PX = 9;
const ARROW_HALF_WIDTH_PX = 4;
const GROUP_CORNER_RADIUS_PX = 6;
const GROUP_LABEL_INSET_PX = 8;
const ROUNDED_CORNER_RADIUS_PX = 8;
const EDGE_LABEL_BACKGROUND_RADIUS_PX = 2;
const EDGE_LABEL_PADDING_X_PX = 6;
const EDGE_LABEL_PADDING_Y_PX = 2;
const PARALLELOGRAM_SKEW_RATIO = 0.2;
const HEXAGON_INSET_RATIO = 0.22;
const CYLINDER_CAP_RATIO = 0.18;
const CYLINDER_MIN_CAP_PX = 4;
const NODE_LABEL_CLASS = "aze-diagram-label aze-diagram-node-label";
const GROUP_LABEL_CLASS = "aze-diagram-label aze-diagram-group-label";
const EDGE_LABEL_CLASS = "aze-diagram-label aze-diagram-edge-label";
/**
 * Fail-closed emitter fault. The caller publishes no Artifact and never sees a
 * partial figure: the extent guard runs before the first byte of markup.
 */
export class DiagramRenderError extends Error {
    code = "azeforge.renderer#diagram-render";
    remedy = "Re-check the diagram declaration list; a renderer failure publishes no Artifact.";
    constructor(message) {
        super(message);
        this.name = "DiagramRenderError";
    }
}
function textValue(text) {
    return text
        .map((run) => run.kind === "quantity" ? `${run.coefficient} ${run.prefix}${run.unit}` : run.value)
        .join("");
}
/** Flattened label text: one authored line, or lines joined for prose. */
function labelText(label) {
    return label === undefined ? "" : label.map(textValue).join(" / ");
}
function point(x, y) {
    return `${quantize(x)} ${quantize(y)}`;
}
function endpointText(endpoint) {
    return endpoint.port === undefined ? endpoint.name : `${endpoint.name}.${endpoint.port}`;
}
/* ------------------------------------------------------------------ *
 * Label text
 * ------------------------------------------------------------------ */
/**
 * One positioned label. `anchor` selects the vertical habit the layout CSS
 * gives the role: node and edge labels are centred on their point, group
 * labels hang from their point. Multi-line labels emit one `<tspan>` per
 * authored line, and the whole text is escaped.
 */
function labelMarkup(label, x, y, lineHeight, className, anchor) {
    if (label === undefined)
        return "";
    const lines = label.map(textValue);
    if (lines.every((line) => line === ""))
        return "";
    const top = anchor === "center" ? y - ((lines.length - 1) * lineHeight) / 2 : y;
    const spans = lines
        .map((line, index) => `<tspan x="${quantize(x)}" dy="${quantize(index === 0 ? 0 : lineHeight)}">${escapeXml(line)}</tspan>`)
        .join("");
    return `<text class="${className}" x="${quantize(x)}" y="${quantize(top)}">${spans}</text>`;
}
/* ------------------------------------------------------------------ *
 * Shapes
 * ------------------------------------------------------------------ */
/** One node shape drawn inside its layout box; never an authored name in an attribute. */
function shapeMarkup(shape, box, id) {
    const base = `aze-diagram-node-shape aze-diagram-shape-${shape}`;
    const x = box.x;
    const y = box.y;
    const width = box.width;
    const height = box.height;
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    const polygon = (points) => `<polygon id="${id}" class="${base}" points="${points.join(" ")}"/>`;
    switch (shape) {
        case "rectangle":
            return `<rect id="${id}" class="${base}" x="${quantize(x)}" y="${quantize(y)}" width="${quantize(width)}" height="${quantize(height)}"/>`;
        case "rounded":
            return (`<rect id="${id}" class="${base}" x="${quantize(x)}" y="${quantize(y)}"` +
                ` width="${quantize(width)}" height="${quantize(height)}"` +
                ` rx="${quantize(ROUNDED_CORNER_RADIUS_PX)}" ry="${quantize(ROUNDED_CORNER_RADIUS_PX)}"/>`);
        case "diamond":
            return polygon([
                point(x, centerY),
                point(centerX, y),
                point(x + width, centerY),
                point(centerX, y + height),
            ]);
        case "parallelogram": {
            const skew = width * PARALLELOGRAM_SKEW_RATIO;
            return polygon([
                point(x + skew, y),
                point(x + width, y),
                point(x + width - skew, y + height),
                point(x, y + height),
            ]);
        }
        case "circle":
            return (`<ellipse id="${id}" class="${base}" cx="${quantize(centerX)}" cy="${quantize(centerY)}"` +
                ` rx="${quantize(width / 2)}" ry="${quantize(height / 2)}"/>`);
        case "hexagon": {
            const inset = Math.min(width * HEXAGON_INSET_RATIO, height / 2);
            return polygon([
                point(x + inset, y),
                point(x + width - inset, y),
                point(x + width, centerY),
                point(x + width - inset, y + height),
                point(x + inset, y + height),
                point(x, centerY),
            ]);
        }
        case "cylinder": {
            const cap = Math.max(CYLINDER_MIN_CAP_PX, Math.min(height * CYLINDER_CAP_RATIO, height / 3));
            const radiusX = width / 2;
            const body = `M${point(x, y + cap)}` +
                `A${quantize(radiusX)} ${quantize(cap)} 0 0 1 ${point(x + width, y + cap)}` +
                `L${point(x + width, y + height - cap)}` +
                `A${quantize(radiusX)} ${quantize(cap)} 0 0 1 ${point(x, y + height - cap)}Z`;
            return (`<path id="${id}" class="${base}" d="${body}"/>` +
                `<ellipse class="${base}" cx="${quantize(centerX)}" cy="${quantize(y + cap)}" rx="${quantize(radiusX)}" ry="${quantize(cap)}"/>`);
        }
    }
}
/* ------------------------------------------------------------------ *
 * Edges
 * ------------------------------------------------------------------ */
function polyline(edge) {
    const points = [];
    for (const section of edge.sections) {
        points.push(section.startPoint);
        for (const bend of section.bendPoints)
            points.push(bend);
        points.push(section.endPoint);
    }
    return points;
}
/** Point half-way along the whole routed polyline, by arc length. */
function polylineMidpoint(points) {
    const first = points[0];
    if (first === undefined)
        return undefined;
    const last = points[points.length - 1];
    if (last === undefined || points.length === 1)
        return first;
    let total = 0;
    for (let index = 1; index < points.length; index += 1) {
        const from = points[index - 1];
        const to = points[index];
        if (from === undefined || to === undefined)
            continue;
        total += Math.hypot(to.x - from.x, to.y - from.y);
    }
    let remaining = total / 2;
    for (let index = 1; index < points.length; index += 1) {
        const from = points[index - 1];
        const to = points[index];
        if (from === undefined || to === undefined)
            continue;
        const length = Math.hypot(to.x - from.x, to.y - from.y);
        if (length >= remaining && length > 0) {
            const ratio = remaining / length;
            return {
                x: from.x + (to.x - from.x) * ratio,
                y: from.y + (to.y - from.y) * ratio,
            };
        }
        remaining -= length;
    }
    return last;
}
function pathData(edge) {
    const parts = [];
    for (const section of edge.sections) {
        parts.push(`M${point(section.startPoint.x, section.startPoint.y)}`);
        for (const bend of section.bendPoints)
            parts.push(`L${point(bend.x, bend.y)}`);
        parts.push(`L${point(section.endPoint.x, section.endPoint.y)}`);
    }
    return parts.join("");
}
/** Arrowhead at the routed end of a directed edge; `""` when the path has no direction. */
function arrowMarkup(edge) {
    const section = edge.sections[edge.sections.length - 1];
    if (section === undefined)
        return "";
    const tail = section.bendPoints.length === 0
        ? section.startPoint
        : section.bendPoints[section.bendPoints.length - 1];
    if (tail === undefined)
        return "";
    const tip = section.endPoint;
    const dx = tip.x - tail.x;
    const dy = tip.y - tail.y;
    const length = Math.hypot(dx, dy);
    if (!(length > 0))
        return "";
    const unitX = dx / length;
    const unitY = dy / length;
    const baseX = tip.x - unitX * ARROW_LENGTH_PX;
    const baseY = tip.y - unitY * ARROW_LENGTH_PX;
    const halfX = -unitY * ARROW_HALF_WIDTH_PX;
    const halfY = unitX * ARROW_HALF_WIDTH_PX;
    const points = [
        point(tip.x, tip.y),
        point(baseX + halfX, baseY + halfY),
        point(baseX - halfX, baseY - halfY),
    ].join(" ");
    return `<polygon class="aze-diagram-arrow" points="${points}"/>`;
}
/** Keep a label centre inside the figure so a wide label is never clipped away. */
function clampCenter(value, half, extent) {
    return half * 2 >= extent ? extent / 2 : Math.min(Math.max(value, half), extent - half);
}
/** Background rect followed by the label text at the polyline midpoint. */
function edgeLabelMarkup(label, at, theme, extent) {
    const width = labelAdvance(label, theme.diagram.edgeLabelFontSizePx) + 2 * EDGE_LABEL_PADDING_X_PX;
    const height = labelLines(label) * diagramLabelTypography(theme).edgeLineHeightPx +
        2 * EDGE_LABEL_PADDING_Y_PX;
    // A route can hug the canvas edge; the label still stays readable inside it.
    const centerX = clampCenter(at.x, width / 2, extent.width);
    const centerY = clampCenter(at.y, height / 2, extent.height);
    const text = labelMarkup(label, centerX, centerY, diagramLabelTypography(theme).edgeLineHeightPx, EDGE_LABEL_CLASS, "center");
    if (text === "")
        return "";
    return (`<rect class="aze-diagram-edge-label-background" x="${quantize(centerX - width / 2)}" y="${quantize(centerY - height / 2)}"` +
        ` width="${quantize(width)}" height="${quantize(height)}"` +
        ` rx="${quantize(EDGE_LABEL_BACKGROUND_RADIUS_PX)}" ry="${quantize(EDGE_LABEL_BACKGROUND_RADIUS_PX)}"/>` +
        text);
}
function entitiesOf(block) {
    const nodes = [];
    const groups = [];
    const edges = [];
    for (const declaration of block.declarations) {
        switch (declaration.kind) {
            case "node":
                nodes.push(declaration);
                break;
            case "group":
                groups.push(declaration);
                break;
            case "edge":
                edges.push(declaration);
                break;
        }
    }
    return { nodes, groups, edges };
}
function assertProjection(condition, detail) {
    if (!condition) {
        throw new DiagramRenderError(`The diagram layout does not match the authored Block: ${detail}.`);
    }
}
/** Flattened accessibility text: mode, flow, counts, ordered nodes, ordered edges, membership. */
function describeDiagram(block, entities, portCount) {
    const parts = [];
    const authored = block.description === undefined ? "" : textValue(block.description).trim();
    if (authored !== "")
        parts.push(`${authored}.`);
    parts.push(`${block.mode} diagram, flow ${block.flow.replace(/-/g, " ")}.`);
    parts.push(`${entities.nodes.length} nodes, ${entities.edges.length} edges, ` +
        `${entities.groups.length} groups, ${portCount} ports.`);
    parts.push(entities.nodes.length === 0
        ? "Nodes: none."
        : `Nodes in authored order: ${entities.nodes
            .map((node) => `${node.name}: ${labelText(node.label) || node.name}`)
            .join("; ")}.`);
    parts.push(entities.edges.length === 0
        ? "Edges: none."
        : `Edges in authored order: ${entities.edges
            .map((edge) => {
            const label = labelText(edge.label);
            return (`${endpointText(edge.from)} -> ${endpointText(edge.to)}` +
                (label === "" ? "" : ` (${label})`));
        })
            .join("; ")}.`);
    const membership = [];
    for (const declaration of block.declarations) {
        if (declaration.kind === "edge" || declaration.parent === undefined)
            continue;
        membership.push(`${declaration.parent} contains ${declaration.name}`);
    }
    parts.push(membership.length === 0
        ? "Group membership: none."
        : `Group membership: ${membership.join("; ")}.`);
    return parts.join(" ");
}
function diagramTitle(block, ordinal) {
    const authored = block.title === undefined ? "" : textValue(block.title);
    if (authored !== "")
        return authored;
    return block.id === undefined ? `Diagram ${quantize(ordinal)}` : `Diagram ${block.id}`;
}
/* ------------------------------------------------------------------ *
 * Emitter
 * ------------------------------------------------------------------ */
function emitDiagramFragment(block, layout, ordinal, theme) {
    const entities = entitiesOf(block);
    const width = layout.width;
    const height = layout.height;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        throw new DiagramRenderError(`The diagram layout has no positive finite extent (${quantize(width)} × ${quantize(height)} px).`);
    }
    assertProjection(layout.nodes.length === entities.nodes.length, `${layout.nodes.length} layout nodes for ${entities.nodes.length} authored nodes`);
    assertProjection(layout.groups.length === entities.groups.length, `${layout.groups.length} layout groups for ${entities.groups.length} authored groups`);
    assertProjection(layout.edges.length === entities.edges.length, `${layout.edges.length} layout edges for ${entities.edges.length} authored edges`);
    const svgId = `aze-d-${quantize(ordinal)}`;
    // Group containers paint shallowest first so a nested container sits over
    // its parent; membership never depends on paint order.
    const groups = layout.groups
        .map((group, index) => ({ group, authored: entities.groups[index], index }))
        .sort((left, right) => left.group.depth === right.group.depth
        ? left.index - right.index
        : left.group.depth - right.group.depth)
        .map(({ group, authored, index }) => {
        assertProjection(authored !== undefined && authored.name === group.name, `group ${index} is "${group.name}", not the authored "${authored?.name ?? "?"}"`);
        const depthClass = group.depth >= 1 && group.depth <= 3
            ? ` aze-diagram-group-depth-${group.depth}`
            : "";
        const rect = `<rect id="${svgId}-g-${index}" class="aze-diagram-group${depthClass}"` +
            ` x="${quantize(group.x)}" y="${quantize(group.y)}"` +
            ` width="${quantize(group.width)}" height="${quantize(group.height)}"` +
            ` rx="${quantize(GROUP_CORNER_RADIUS_PX)}" ry="${quantize(GROUP_CORNER_RADIUS_PX)}"/>`;
        const label = labelMarkup(authored?.label, group.x + GROUP_LABEL_INSET_PX, group.y + GROUP_LABEL_INSET_PX / 2, diagramLabelTypography(theme).groupLineHeightPx, GROUP_LABEL_CLASS, "top");
        return `${rect}${label}`;
    })
        .join("");
    let portIndex = 0;
    const nodes = layout.nodes
        .map((node, index) => {
        const authored = entities.nodes[index];
        assertProjection(authored !== undefined && authored.name === node.name, `node ${index} is "${node.name}", not the authored "${authored?.name ?? "?"}"`);
        assertProjection(node.ports.length === (authored?.ports.length ?? -1), `node "${node.name}" has ${node.ports.length} layout ports for ${authored?.ports.length ?? 0} authored ports`);
        const shape = shapeMarkup(node.shape, node, `${svgId}-n-${index}`);
        // An unlabelled node still reads: its name is its label.
        const authoredLabel = authored?.label;
        const label = authoredLabel === undefined
            ? [[{ kind: "text", value: node.name }]]
            : authoredLabel;
        const labelTextMarkup = labelMarkup(label, node.x + node.width / 2, node.y + node.height / 2, diagramLabelTypography(theme).nodeLineHeightPx, NODE_LABEL_CLASS, "center");
        const ports = node.ports
            .map((port) => {
            const markup = `<rect id="${svgId}-p-${portIndex}" class="aze-diagram-port"` +
                ` x="${quantize(port.x)}" y="${quantize(port.y)}"` +
                ` width="${quantize(port.width)}" height="${quantize(port.height)}"/>`;
            portIndex += 1;
            return markup;
        })
            .join("");
        return `${shape}${labelTextMarkup}${ports}`;
    })
        .join("");
    const edges = layout.edges
        .map((edge, index) => {
        const authored = entities.edges[index];
        if (authored === undefined)
            return "";
        const data = pathData(edge);
        if (data === "")
            return "";
        const path = `<path id="${svgId}-e-${index}" class="aze-diagram-edge" d="${data}"/>`;
        const arrow = authored.direction === "directed" ? arrowMarkup(edge) : "";
        const at = polylineMidpoint(polyline(edge));
        const label = authored.label === undefined || at === undefined
            ? ""
            : edgeLabelMarkup(authored.label, at, theme, { width, height });
        return `${path}${arrow}${label}`;
    })
        .join("");
    const portCount = entities.nodes.reduce((total, node) => total + node.ports.length, 0);
    const idAttribute = block.id === undefined ? "" : ` data-diagram-id="${escapeXml(block.id)}"`;
    const fragment = `<figure class="aze-diagram" data-ordinal="${quantize(ordinal)}"${idAttribute}` +
        ` data-diagram-mode="${escapeXml(block.mode)}">` +
        `<svg xmlns="${SVG_NAMESPACE}" viewBox="0 0 ${quantize(width)} ${quantize(height)}"` +
        ` width="${quantize(width)}" height="${quantize(height)}" role="img"` +
        ` aria-labelledby="${svgId}-title ${svgId}-desc">` +
        `<title id="${svgId}-title">${escapeXml(diagramTitle(block, ordinal))}</title>` +
        `<desc id="${svgId}-desc">${escapeXml(describeDiagram(block, entities, portCount))}</desc>` +
        `${groups}${nodes}` +
        (edges === "" ? "" : `<g class="aze-diagram-edges">${edges}</g>`) +
        `</svg></figure>`;
    return fragment;
}
/**
 * Render one diagram Block: a static, browser-free, deterministic figure over
 * the pinned ELK layout projection. This is the family's only async boundary.
 */
export async function renderDiagramFragment(block, context) {
    const ordinal = context.ordinal ?? 0;
    const theme = context.theme ?? defaultTheme;
    const layout = await layoutDiagram(block, theme);
    return emitDiagramFragment(block, layout, ordinal, theme);
}
/**
 * Fingerprint closure for the rendered-artifact hash (contract §12): the
 * layout language, the pinned engine, the emitter, the Advance metric and its
 * pinned font sources, the option set and the quantization.
 */
export function diagramDependencyClosure() {
    return Object.freeze({
        layout: DIAGRAM_LAYOUT_VERSION,
        elkjs: ELKJS_VERSION,
        emitter: DIAGRAM_EMITTER_VERSION,
        advanceMetric: advanceMetricDependencyClosure(),
        quantization: QUANTIZATION_DECIMALS,
        options: DIAGRAM_OPTIONS_VERSION,
    });
}
export const diagramHtmlBlockRenderer = Object.freeze({
    descriptor: Object.freeze({
        id: DIAGRAM_HTML_BLOCK_RENDERER_ID,
        version: DIAGRAM_HTML_BLOCK_RENDERER_VERSION,
        blockType: "diagram",
        pluginVersionRange: "1.0.0",
        rendererId: "html",
        rendererVersionRange: "1.0.0",
    }),
    render(block, context) {
        return renderDiagramFragment(block, context);
    },
});
//# sourceMappingURL=diagram-render.js.map