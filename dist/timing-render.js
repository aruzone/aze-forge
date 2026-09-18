/**
 * Native digital timing emitter (contract: issue #63 §11).
 *
 * One project-owned SVG emitter over the shared plot/diagram machinery:
 * quantized 3-decimal coordinates, deterministic ids and an intrinsic
 * finite nonzero viewBox. Layout is total — every valid Block renders, so
 * the family registers no `layout-unsupported` code.
 *
 * State legibility is shape-first: unknown intervals are hatched, high
 * impedance is dashed, buses are filled bands with slash marks, and edges
 * are diagonals. Colour reinforces but never carries the distinction.
 * Every mark carries presentation attributes rather than stylesheet rules,
 * so the fragment is faithful as a standalone SVG.
 */
import { escapeXml, quantize } from "./plot.js";
export const TIMING_HTML_BLOCK_RENDERER_ID = "azeforge.timing.html/v1";
export const TIMING_HTML_BLOCK_RENDERER_VERSION = "1.0.0";
export const TIMING_EMITTER_VERSION = "1.0.0";
const PAD = 16;
const GUTTER = 104;
const ROW_HEIGHT = 48;
const ROW_TOP = 52;
const AMPLITUDE = 16;
const CYCLE_PX = 36;
const MAX_WIDTH_PX = 4096;
const MAX_HEIGHT_PX = 16384;
const HATCH_STEP = 8;
const STROKE = 'fill="none" stroke="currentColor"';
function textValue(text) {
    return text
        .map((run) => run.kind === "quantity" ? `${run.coefficient} ${run.prefix}${run.unit}` : run.value)
        .join("");
}
function safeId(value) {
    return value.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "timing";
}
function textRuns(text, x, y, size, anchor) {
    const runs = text
        .map((run) => {
        const scripted = run.kind === "subscript" || run.kind === "superscript";
        const dy = run.kind === "subscript" ? 3 : run.kind === "superscript" ? -4 : 0;
        return `<tspan dy="${dy}" font-size="${quantize(scripted ? size * 0.72 : size)}">${escapeXml(run.kind === "quantity" ? `${run.coefficient} ${run.prefix}${run.unit}` : run.value)}</tspan>`;
    })
        .join("");
    return `<text x="${quantize(x)}" y="${quantize(y)}" text-anchor="${anchor}" font-size="${quantize(size)}" fill="currentColor" stroke="none">${runs}</text>`;
}
function intervalLength(interval) {
    return Number(interval.count ?? interval.duration ?? "0");
}
/** Level of an interval on its row: `-1` high, `+1` low, `0` mid-line. */
function levelOf(interval, previous) {
    switch (interval.state) {
        case "high":
            return -1;
        case "low":
            return 1;
        case "continue":
            return previous;
        case "rise":
            return -1;
        case "fall":
            return 1;
        default:
            return 0;
    }
}
function hatch(x0, x1, y) {
    const parts = [];
    for (let x = x0 + HATCH_STEP; x < x1 - 1; x += HATCH_STEP) {
        parts.push(`M${quantize(x - 3)} ${quantize(y + 3)}L${quantize(x + 3)} ${quantize(y - 3)}`);
    }
    return parts.length === 0 ? "" : `<path d="${parts.join("")}" ${STROKE} stroke-width="1"/>`;
}
function intervalMarkup(interval, x, width, y, previousState, previousLevel, signal) {
    const stateClass = `aze-timing-${interval.state}`;
    // A continue interval repeats its predecessor's shape; the class still
    // names the authored state so the geometry stays testable.
    const shape = interval.state === "continue" && previousState !== undefined ? previousState : interval.state;
    const line = (path, attributes = "") => `<path class="${stateClass}" d="${path}" ${STROKE} stroke-width="2"${attributes}/>`;
    const band = (fillLabel) => {
        const outline = `M${quantize(x)} ${quantize(y)}L${quantize(x + 6)} ${quantize(y - 10)}H${quantize(x + width - 6)}` +
            `L${quantize(x + width)} ${quantize(y)}L${quantize(x + width - 6)} ${quantize(y + 10)}H${quantize(x + 6)}Z`;
        const slashes = [];
        for (let index = 0; index < Math.max(1, signal.width ?? 1); index += 1) {
            const slashX = x + 8 + index * 5;
            if (slashX > x + width - 4)
                break;
            slashes.push(`M${quantize(slashX)} ${quantize(y + 9)}l4 -18`);
        }
        return (`<g class="${stateClass}">` +
            `<path d="${outline}" fill="currentColor" fill-opacity="0.12" stroke="currentColor" stroke-width="1.5"/>` +
            (slashes.length === 0
                ? ""
                : `<path class="aze-timing-slash" d="${slashes.join("")}" ${STROKE} stroke-width="1"/>`) +
            (fillLabel === undefined ? "" : textRuns(fillLabel, x + width / 2, y + 4, 11, "middle")) +
            "</g>");
    };
    switch (shape) {
        case "low":
            return line(`M${quantize(x)} ${quantize(y + AMPLITUDE)}H${quantize(x + width)}`);
        case "high":
            return line(`M${quantize(x)} ${quantize(y - AMPLITUDE)}H${quantize(x + width)}`);
        case "continue":
            return line(`M${quantize(x)} ${quantize(y + previousLevel * AMPLITUDE)}H${quantize(x + width)}`);
        case "rise":
            return line(`M${quantize(x)} ${quantize(y + AMPLITUDE)}L${quantize(x + width)} ${quantize(y - AMPLITUDE)}`);
        case "fall":
            return line(`M${quantize(x)} ${quantize(y - AMPLITUDE)}L${quantize(x + width)} ${quantize(y + AMPLITUDE)}`);
        case "unknown":
            return (`<path class="${stateClass}" d="M${quantize(x)} ${quantize(y)}H${quantize(x + width)}" ${STROKE} stroke-width="1"/>` +
                hatch(x, x + width, y));
        case "impedance":
            return line(`M${quantize(x)} ${quantize(y)}H${quantize(x + width)}`, ' stroke-dasharray="10 5"');
        case "bus":
            return band(interval.value);
        default:
            return "";
    }
}
function arrowHead(tipX, tipY, directionX, directionY) {
    const size = 8;
    const half = 4;
    const baseX = tipX - directionX * size;
    const baseY = tipY - directionY * size;
    const perpendicularX = -directionY * half;
    const perpendicularY = directionX * half;
    return (`<path d="M${quantize(tipX)} ${quantize(tipY)}` +
        `L${quantize(baseX + perpendicularX)} ${quantize(baseY + perpendicularY)}` +
        `L${quantize(baseX - perpendicularX)} ${quantize(baseY - perpendicularY)}Z" fill="currentColor" stroke="none"/>`);
}
/**
 * Render one timing Block: a static, browser-free deterministic figure over
 * one shared cycle or duration axis.
 */
export function renderTimingFragment(block, _context) {
    const spanUnits = block.signals.reduce((span, signal) => Math.max(span, Number(signal.phase) +
        signal.intervals.reduce((total, interval) => total + intervalLength(interval), 0)), 0);
    const available = MAX_WIDTH_PX - PAD * 2 - GUTTER;
    const gridWidth = Math.max(Math.min(spanUnits * CYCLE_PX, available), CYCLE_PX);
    const pxPerUnit = spanUnits === 0 ? CYCLE_PX : gridWidth / spanUnits;
    const gridLeft = PAD + GUTTER;
    const rowCenter = (index) => ROW_TOP + index * ROW_HEIGHT + ROW_HEIGHT / 2;
    const height = Math.min(ROW_TOP + block.signals.length * ROW_HEIGHT + PAD, MAX_HEIGHT_PX);
    const width = gridLeft + gridWidth + PAD;
    const svgId = `aze-timing-${safeId(block.id ?? textValue(block.title))}`;
    const xFor = (units) => gridLeft + units * pxPerUnit;
    const grid = [];
    for (let cycle = 0; cycle <= spanUnits; cycle += 1) {
        grid.push(`<path class="aze-timing-gridline" d="M${quantize(xFor(cycle))} ${quantize(ROW_TOP - 18)}V${quantize(height - PAD)}" ${STROKE} stroke-width="0.5" stroke-opacity="0.35"/>`);
    }
    const rows = block.signals
        .map((signal, index) => {
        const y = rowCenter(index);
        let cursor = Number(signal.phase);
        let previousState;
        let previousLevel = 0;
        const shapes = signal.intervals
            .map((interval) => {
            const length = intervalLength(interval);
            const markup = intervalMarkup(interval, xFor(cursor), length * pxPerUnit, y, previousState, previousLevel, signal);
            cursor += length;
            previousLevel = levelOf(interval, previousLevel);
            previousState = interval.state;
            return markup;
        })
            .join("");
        const edges = [];
        if (signal.clock) {
            let edgeX = xFor(Number(signal.phase));
            let level = 0;
            for (const interval of signal.intervals) {
                const next = levelOf(interval, level);
                if (level === 1 && next === -1) {
                    edges.push(`<path class="aze-timing-edge" d="M${quantize(edgeX - 5)} ${quantize(y + AMPLITUDE)}L${quantize(edgeX + 5)} ${quantize(y + AMPLITUDE)}L${quantize(edgeX)} ${quantize(y + AMPLITUDE - 9)}Z" fill="currentColor" stroke="none"/>`);
                }
                level = next;
                edgeX += intervalLength(interval) * pxPerUnit;
            }
        }
        const label = textRuns([{ kind: "text", value: signal.ref }], gridLeft - 8, y + 4, 12, "end");
        return `<g class="aze-timing-signal" id="${svgId}-signal-${safeId(signal.ref)}">${label}${shapes}${edges.join("")}</g>`;
    })
        .join("");
    const runs = block.groups.map((group) => group.signals.map((ref) => block.signals.findIndex((signal) => signal.ref === ref)));
    const groups = block.groups
        .map((group, index) => {
        const positions = runs[index] ?? [];
        if (positions.length === 0)
            return "";
        const depth = runs.filter((other, otherIndex) => otherIndex !== index &&
            other.length > positions.length &&
            Math.min(...positions) >= Math.min(...other) &&
            Math.max(...positions) <= Math.max(...other)).length + 1;
        const x = PAD + 6 + (depth - 1) * 10;
        const top = rowCenter(Math.min(...positions)) - AMPLITUDE - 6;
        const bottom = rowCenter(Math.max(...positions)) + AMPLITUDE + 6;
        const label = group.label.length === 0 ? "" : textRuns(group.label, x + 4, top - 5, 11, "start");
        return `<g class="aze-timing-group">${label}<path d="M${quantize(x + 6)} ${quantize(top)}H${quantize(x)}V${quantize(bottom)}H${quantize(x + 6)}" ${STROKE} stroke-width="1.5"/></g>`;
    })
        .join("");
    const markers = block.markers
        .map((marker) => {
        const x = xFor(Number(marker.at));
        const label = marker.label === undefined ? "" : textRuns(marker.label, x, ROW_TOP - 34, 11, "middle");
        return `<g class="aze-timing-marker">${label}<path d="M${quantize(x)} ${quantize(ROW_TOP - 26)}V${quantize(height - PAD)}" ${STROKE} stroke-width="1" stroke-dasharray="2 2"/></g>`;
    })
        .join("");
    const arrows = block.arrows
        .map((arrow) => {
        const endpoints = [arrow.from, arrow.to].map((anchor) => {
            const index = block.signals.findIndex((signal) => signal.ref === anchor.signal);
            const signal = block.signals[index];
            if (signal === undefined)
                return undefined;
            const units = Number(signal.phase) +
                signal.intervals
                    .slice(0, Number(anchor.boundary))
                    .reduce((total, interval) => total + intervalLength(interval), 0);
            return { x: xFor(units), y: rowCenter(index) - AMPLITUDE - 8 };
        });
        const [from, to] = endpoints;
        if (from === undefined || to === undefined)
            return "";
        const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
        const directionX = (to.x - from.x) / length;
        const directionY = (to.y - from.y) / length;
        const label = arrow.label === undefined
            ? ""
            : textRuns(arrow.label, (from.x + to.x) / 2, Math.min(from.y, to.y) - 6, 11, "middle");
        return (`<g class="aze-timing-arrow">${label}` +
            `<path d="M${quantize(from.x)} ${quantize(from.y)}L${quantize(to.x)} ${quantize(to.y)}" ${STROKE} stroke-width="1.25"/>` +
            `${arrowHead(from.x, from.y, -directionX, -directionY)}` +
            `${arrowHead(to.x, to.y, directionX, directionY)}</g>`);
    })
        .join("");
    const description = block.description === undefined
        ? `Timing diagram with ${block.signals.length} signals on a shared ${block.scale === "cycles" ? "cycle" : block.unit ?? "time"} axis`
        : textValue(block.description);
    const label = block.id === undefined ? "" : ` data-timing-id="${escapeXml(block.id)}"`;
    const number = block.number === true ? ' data-timing-number="true"' : "";
    return (`<figure class="aze-timing" id="${svgId}" data-timing-scale="${block.scale}"${label}${number}>` +
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${quantize(width)} ${quantize(height)}" role="img" aria-labelledby="${svgId}-title ${svgId}-desc">` +
        `<title id="${svgId}-title">${escapeXml(textValue(block.title))}</title>` +
        `<desc id="${svgId}-desc">${escapeXml(description)}</desc>` +
        `<g class="aze-timing-grid">${grid.join("")}</g>${groups}${markers}${rows}${arrows}</svg></figure>`);
}
export function timingDependencyClosure() {
    return Object.freeze({ emitter: TIMING_EMITTER_VERSION });
}
export const timingHtmlBlockRenderer = Object.freeze({
    descriptor: Object.freeze({
        id: TIMING_HTML_BLOCK_RENDERER_ID,
        version: TIMING_HTML_BLOCK_RENDERER_VERSION,
        blockType: "timing",
        pluginVersionRange: "1.0.0",
        rendererId: "html",
        rendererVersionRange: "1.0.0",
    }),
    render(block, context) {
        return renderTimingFragment(block, context);
    },
});
//# sourceMappingURL=timing-render.js.map