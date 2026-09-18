/**
 * Native software- and data-model layout (contract: issue #61 §11).
 *
 * One deterministic projection from each validated model Block to measured
 * geometry, over the Advance metric and the Theme's `models` tokens. Nothing
 * is authored as a dimension: every box sizes to its wrapped content, every
 * lane takes its pitch from the widest lane header, and every rank comes from
 * a graph distance, so two runs on the same Block produce identical numbers.
 *
 * Three things this module owns:
 *
 * - measurement: text is wrapped at the Theme's `wrapWidthPx` and measured
 *   through the pinned Advance metric, never through a font the compiler
 *   cannot observe;
 * - projection: authored order is the only tie-break, ids are positional, and
 *   every stored number is quantized to three decimals;
 * - totality: every valid Block lays out — an unresolved reference narrows
 *   what is drawn, never whether the Block renders.
 *
 * The returned geometry carries everything the emitter needs: the emitter
 * never re-measures a string and never derives a coordinate. Decoration is
 * typed `ariaHidden: true`, so the accessibility floor is enforced by the
 * return type rather than by the caller's discipline.
 */
import { advanceWidth, labelAdvance } from "./advance-metric.js";
import { cardinalityDisplay } from "./models.js";
import { quantize } from "./plot.js";
export const MODELS_LAYOUT_VERSION = "models-layout/v1";
export const MODELS_WRAP_VERSION = "models-wrap/v1";
/* ------------------------------------------------------------------ *
 * Registered geometry constants
 *
 * Tuned so the contract scenarios (a login sequence with fragments, a nested
 * state machine, an entity graph and a class hierarchy) export legibly to PNG
 * and PDF at print size: boxes clear their labels, lifelines clear their
 * lanes, and a routed edge never doubles back through the node it left.
 * ------------------------------------------------------------------ */
/** Outer margin of the whole drawing, on every side. */
const MARGIN_PX = 16;
/** Band between a fragment frame and the bands it spans. */
const FRAME_PAD_PX = 8;
/** Horizontal inset of a nested fragment frame, per nesting level. */
const FRAME_DEPTH_INSET_PX = 8;
/** Gap above and below a message's own text inside its row. */
const MESSAGE_GAP_PX = 6;
/** Fold of a note's clipped corner. */
const NOTE_CORNER_PX = 10;
/** Outward depth of a self message, self relationship or self transition. */
const SELF_LOOP_PX = 24;
/** Half-height of a self transition's loop back into the same box. */
const TRANSITION_LOOP_HALF_PX = 10;
/** Stick-figure metrics for an `actor` lane header. */
const ACTOR_HEAD_RADIUS_PX = 5;
const ACTOR_ARM_HALF_SPAN_PX = 10;
const ACTOR_BODY_LENGTH_PX = 12;
const ACTOR_LEG_LENGTH_PX = 12;
const ACTOR_NECK_GAP_PX = 4;
const ACTOR_FIGURE_HEIGHT_PX = 2 * ACTOR_HEAD_RADIUS_PX + ACTOR_NECK_GAP_PX + ACTOR_BODY_LENGTH_PX + ACTOR_LEG_LENGTH_PX;
/** Gap between an actor figure and its name. */
const ACTOR_NAME_GAP_PX = 4;
/** Bands reserved by an empty member section, in member lines. */
const MIN_SECTION_LINES = 1;
/** A bullseye is this much larger than the filled initial dot. */
const FINAL_DIAMETER_RATIO = 1.8;
const FINAL_INNER_RATIO = 0.55;
/** Distance between two relationships that join the same pair of boxes. */
const PARALLEL_EDGE_GAP_PX = 14;
const WHITESPACE = /\s+/u;
const SEQUENCE_PARTICIPANT_NAME_ROLE = "participant-name";
const SEQUENCE_PARTICIPANT_LABEL_ROLE = "participant-label";
const SEQUENCE_MESSAGE_ROLE = "message-label";
const SEQUENCE_NOTE_ROLE = "note-label";
const SEQUENCE_FRAGMENT_LABEL_ROLE = "fragment-label";
const SEQUENCE_FRAGMENT_CONDITION_ROLE = "fragment-condition";
const STATE_NAME_ROLE = "state-name";
const STATE_LABEL_ROLE = "state-label";
const STATE_TRANSITION_ROLE = "transition-label";
const ENTITY_NAME_ROLE = "entity-name";
const ENTITY_LABEL_ROLE = "entity-label";
const ENTITY_ATTRIBUTE_ROLE = "entity-attribute";
const ENTITY_OPTIONAL_ROLE = "entity-optional";
const ENTITY_KEY_ROLE = "entity-key";
const ENTITY_CARDINALITY_ROLE = "entity-cardinality";
const ENTITY_ROLE_ROLE = "entity-role";
const ENTITY_RELATIONSHIP_LABEL_ROLE = "entity-relationship-label";
const CLASS_NAME_ROLE = "class-name";
const CLASS_ABSTRACT_NAME_ROLE = "class-abstract-name";
const CLASS_LABEL_ROLE = "class-label";
const CLASS_STEREOTYPE_ROLE = "class-stereotype";
const CLASS_MEMBER_ROLE = "class-member";
const CLASS_STATIC_MEMBER_ROLE = "class-static-member";
const CLASS_VISIBILITY_ROLE = "class-visibility";
const CLASS_MULTIPLICITY_ROLE = "class-multiplicity";
const CLASS_RELATIONSHIP_LABEL_ROLE = "class-relationship-label";
/* ------------------------------------------------------------------ *
 * Measurement
 * ------------------------------------------------------------------ */
/** Advance of one literal string at one size, through the pinned metric. */
function measureText(value, fontSizePx) {
    return advanceWidth([{ kind: "text", value }], fontSizePx);
}
/** Widest of several lines, through the same Advance metric as one line. */
function widestLine(lines, fontSizePx) {
    return labelAdvance(lines.map((line) => [{ kind: "text", value: line }]), fontSizePx);
}
/**
 * Wrap one authored field to `maxWidthPx`.
 *
 * Whitespace runs separate words; a word that alone exceeds the limit is
 * hard-broken at code-point boundaries, so no line is ever wider than the
 * limit unless a single code point is. No code point of a word is dropped,
 * and no hyphen is ever invented. The result always holds at least one line.
 */
export function wrapText(text, maxWidthPx, fontSizePx) {
    const words = [];
    for (const word of text.split(WHITESPACE)) {
        if (word !== "")
            words.push(word);
    }
    if (words.length === 0)
        return Object.freeze([""]);
    const limit = Number.isFinite(maxWidthPx) && maxWidthPx > 0 ? maxWidthPx : 0;
    const lines = [];
    let current = "";
    const flush = () => {
        if (current !== "") {
            lines.push(current);
            current = "";
        }
    };
    for (const word of words) {
        const candidate = current === "" ? word : `${current} ${word}`;
        if (measureText(candidate, fontSizePx) <= limit) {
            current = candidate;
            continue;
        }
        flush();
        if (measureText(word, fontSizePx) <= limit) {
            current = word;
            continue;
        }
        let chunk = "";
        for (const codePoint of word) {
            const grown = `${chunk}${codePoint}`;
            if (chunk !== "" && measureText(grown, fontSizePx) > limit) {
                lines.push(chunk);
                chunk = codePoint;
            }
            else {
                chunk = grown;
            }
        }
        current = chunk;
    }
    flush();
    return Object.freeze(lines.length === 0 ? [""] : lines);
}
export function modelsLabelTypography(theme) {
    const tokens = theme.models;
    const floor = tokens.minimumFontSizePx;
    const size = (value) => Math.max(value, floor);
    const labelFontSizePx = size(tokens.labelFontSizePx);
    const memberFontSizePx = size(tokens.memberFontSizePx);
    const captionFontSizePx = size(tokens.captionFontSizePx);
    const markerFontSizePx = size(tokens.markerFontSizePx);
    return {
        labelFontSizePx,
        labelLineHeightPx: Math.max(tokens.labelLineHeightPx, labelFontSizePx),
        memberFontSizePx,
        memberLineHeightPx: Math.max(tokens.memberLineHeightPx, memberFontSizePx),
        captionFontSizePx,
        captionLineHeightPx: Math.max(tokens.labelLineHeightPx, captionFontSizePx),
        markerFontSizePx,
        markerLineHeightPx: Math.max(tokens.memberLineHeightPx, markerFontSizePx),
    };
}
function createSink() {
    return {
        boxes: [],
        nestedBoxes: [],
        circles: [],
        paths: [],
        bars: [],
        notes: [],
        fragments: [],
        texts: [],
    };
}
/** Quantized 3-decimal value: the only number shape the emitter ever sees. */
function q(value) {
    return Number(quantize(value));
}
function point(x, y) {
    return Object.freeze({ x: q(x), y: q(y) });
}
function addBox(sink, init) {
    sink.boxes.push(Object.freeze({
        kind: "box",
        ariaHidden: true,
        ...init,
        x: q(init.x),
        y: q(init.y),
        width: q(init.width),
        height: q(init.height),
    }));
}
function addNestedBox(sink, init) {
    sink.nestedBoxes.push(Object.freeze({
        kind: "nested-box",
        ariaHidden: true,
        ...init,
        x: q(init.x),
        y: q(init.y),
        width: q(init.width),
        height: q(init.height),
        dividerYs: Object.freeze(init.dividerYs.map((offset) => q(offset))),
    }));
}
function addCircle(sink, init) {
    sink.circles.push(Object.freeze({ kind: "circle", ariaHidden: true, ...init }));
}
function addPath(sink, init) {
    sink.paths.push(Object.freeze({
        kind: "path",
        ariaHidden: true,
        ...init,
        points: Object.freeze(init.points.map((entry) => Object.freeze({ x: q(entry.x), y: q(entry.y) }))),
    }));
}
function addBar(sink, init) {
    sink.bars.push(Object.freeze({
        kind: "bar",
        ariaHidden: true,
        ...init,
        x: q(init.x),
        y: q(init.y),
        width: q(init.width),
        height: q(init.height),
    }));
}
function addNote(sink, init) {
    sink.notes.push(Object.freeze({
        kind: "note",
        ariaHidden: true,
        ...init,
        points: Object.freeze(init.points.map((entry) => Object.freeze({ x: q(entry.x), y: q(entry.y) }))),
    }));
}
function addFragment(sink, init) {
    sink.fragments.push(Object.freeze({
        kind: "fragment",
        ariaHidden: true,
        ...init,
        x: q(init.x),
        y: q(init.y),
        width: q(init.width),
        height: q(init.height),
        divisionYs: Object.freeze(init.divisionYs.map((offset) => q(offset))),
    }));
}
function addText(sink, init) {
    sink.texts.push(Object.freeze({ kind: "text", ...init, x: q(init.x), y: q(init.y) }));
}
/**
 * Keep one text line inside the drawing, whichever end it is anchored at. A
 * line wider than the canvas is centred, which is the only placement that
 * still shows both ends.
 */
function clampX(x, textWidth, anchor, canvasWidth) {
    const offset = anchor === "start" ? 0 : anchor === "end" ? textWidth : textWidth / 2;
    const low = offset;
    const high = canvasWidth - (textWidth - offset);
    if (low > high)
        return q((canvasWidth - textWidth) / 2);
    return q(Math.min(Math.max(x, low), high));
}
/**
 * Push one wrapped field as a stack of lines whose first line box starts at
 * `top`; line centres sit at half a line height inside their own box.
 */
function pushLines(sink, lines, x, top, lineHeightPx, anchor, role, canvasWidth, fontSizePx) {
    lines.forEach((line, index) => {
        if (line === "")
            return;
        addText(sink, {
            x: clampX(x, measureText(line, fontSizePx), anchor, canvasWidth),
            y: top + lineHeightPx * (index + 0.5),
            text: line,
            anchor,
            role,
            ariaHidden: false,
        });
    });
}
function freezeLayout(kind, sink, widthPx, heightPx) {
    const geometry = {
        kind,
        widthPx: q(widthPx),
        heightPx: q(heightPx),
        boxes: Object.freeze(sink.boxes),
        nestedBoxes: Object.freeze(sink.nestedBoxes),
        circles: Object.freeze(sink.circles),
        paths: Object.freeze(sink.paths),
        bars: Object.freeze(sink.bars),
        notes: Object.freeze(sink.notes),
        fragments: Object.freeze(sink.fragments),
        texts: Object.freeze(sink.texts),
    };
    // Every member of the union differs only in `kind`, which is the parameter.
    return Object.freeze(geometry);
}
/**
 * Longest-path ranks over `count` nodes, relaxed once per node in the given
 * edge order. A graph with a cycle saturates instead of diverging, and an
 * unchanged pass ends the loop early.
 */
function rankByLongestPath(count, edges) {
    const rank = new Array(count).fill(0);
    for (let pass = 0; pass < count; pass += 1) {
        let changed = false;
        for (const edge of edges) {
            if (edge.from === edge.to)
                continue;
            const source = rank[edge.from] ?? 0;
            const target = rank[edge.to] ?? 0;
            if (source + 1 <= count - 1 && target < source + 1) {
                rank[edge.to] = source + 1;
                changed = true;
            }
        }
        if (!changed)
            break;
    }
    return rank;
}
/**
 * One orthogonal route between two boxes: down and across for a target below,
 * a left-hand detour for a target above, and a straight horizontal run inside
 * a shared rank. Every route leaves and enters a box through a border.
 */
function routeBetween(from, to, gapPx) {
    const fromCenterX = from.x + from.width / 2;
    const fromCenterY = from.y + from.height / 2;
    const toCenterX = to.x + to.width / 2;
    const toCenterY = to.y + to.height / 2;
    if (toCenterY > fromCenterY + 1) {
        const start = point(fromCenterX, from.y + from.height);
        const end = point(toCenterX, to.y);
        if (start.x === end.x)
            return Object.freeze([start, end]);
        const midY = q((start.y + end.y) / 2);
        return Object.freeze([start, point(start.x, midY), point(end.x, midY), end]);
    }
    if (toCenterY < fromCenterY - 1) {
        const start = point(from.x, fromCenterY);
        const end = point(to.x, toCenterY);
        const bendX = q(Math.max(4, Math.min(start.x, end.x) - gapPx / 2));
        return Object.freeze([start, point(bendX, start.y), point(bendX, end.y), end]);
    }
    if (toCenterX >= fromCenterX) {
        return Object.freeze([point(from.x + from.width, fromCenterY), point(to.x, toCenterY)]);
    }
    return Object.freeze([point(from.x, fromCenterY), point(to.x + to.width, toCenterY)]);
}
/** A loop that leaves a box's right border and re-enters it at the same rank. */
function routeSelfLoop(box, canvasWidth, halfHeightPx) {
    const depth = Math.min(SELF_LOOP_PX, Math.max(8, canvasWidth - 4 - (box.x + box.width)));
    const centerY = box.y + box.height / 2;
    const right = box.x + box.width;
    const half = Math.min(halfHeightPx, box.height / 2);
    return Object.freeze([
        point(right, centerY - half),
        point(right + depth, centerY - half),
        point(right + depth, centerY + half),
        point(right, centerY + half),
    ]);
}
/**
 * Shift a route sideways so two relationships joining the same pair of boxes
 * stay distinguishable. The shift follows the route's dominant axis, so the
 * result stays orthogonal and still meets both borders.
 */
function offsetRoute(points, delta) {
    if (delta === 0)
        return points;
    const first = points[0];
    const last = points[points.length - 1];
    if (first === undefined || last === undefined)
        return points;
    const vertical = Math.abs(last.y - first.y) >= Math.abs(last.x - first.x);
    return Object.freeze(points.map((entry) => Object.freeze(vertical ? { x: q(entry.x + delta), y: entry.y } : { x: entry.x, y: q(entry.y + delta) })));
}
/**
 * Offsets for every relationship keyed by its ordered endpoints, in authored
 * order: a key with `n` relationships spreads them evenly about the pair.
 */
function parallelOffsets(keys) {
    const counts = new Map();
    for (const key of keys)
        counts.set(key, (counts.get(key) ?? 0) + 1);
    const seen = new Map();
    return keys.map((key) => {
        const count = counts.get(key) ?? 1;
        const index = seen.get(key) ?? 0;
        seen.set(key, index + 1);
        return count === 1 ? 0 : q((index - (count - 1) / 2) * PARALLEL_EDGE_GAP_PX);
    });
}
function rectsOverlap(a, b, padPx) {
    return (a.x - padPx < b.x + b.width &&
        b.x < a.x + a.width + padPx &&
        a.y - padPx < b.y + b.height &&
        b.y < a.y + a.height + padPx);
}
/** Fractions one annotation slides through, outwards from the route's middle. */
const LABEL_FRACTION_STEPS = 12;
const LABEL_FRACTION_STEP = 0.035;
/**
 * Where one annotation sits beside a route: the midpoint when that covers no
 * box and no annotation already placed for this figure, otherwise the first
 * point along the same route that runs clear, trying the near side before the
 * far one. The scan is a fixed sequence and the footprints it accepts are
 * recorded in placement order — authored order — so the choice stays a pure,
 * deterministic function of the geometry and everything placed before it.
 */
function freeLabelAnchor(points, offsetPx, textWidth, textHeight, obstacles, placedLabels) {
    const footprint = (at) => {
        const left = at.anchor === "start" ? at.x : at.anchor === "end" ? at.x - textWidth : at.x - textWidth / 2;
        return { x: left, y: at.y - textHeight / 2, width: textWidth, height: textHeight };
    };
    const free = (box) => !obstacles.some((obstacle) => rectsOverlap(box, obstacle, 2)) &&
        !placedLabels.some((label) => rectsOverlap(box, label, 2));
    for (let step = 0; step <= LABEL_FRACTION_STEPS; step += 1) {
        const deltas = step === 0 ? [0] : [-step * LABEL_FRACTION_STEP, step * LABEL_FRACTION_STEP];
        for (const delta of deltas) {
            const fraction = 0.5 + delta;
            if (fraction <= 0.02 || fraction >= 0.98)
                continue;
            for (const side of [offsetPx, -offsetPx]) {
                const at = routeAnchor(points, fraction, side);
                const box = footprint(at);
                if (free(box)) {
                    placedLabels.push(box);
                    return at;
                }
            }
        }
    }
    const fallback = routeAnchor(points, 0.5, offsetPx);
    placedLabels.push(footprint(fallback));
    return fallback;
}
function bandTopsPush(bands, top, height) {
    bands.tops.push(top);
    bands.bottoms.push(top + height);
}
/** Vertical middle of the free band below one rank, inside the figure. */
function bandGapBelow(bands, rank, canvasHeight) {
    const bottom = bands.bottoms[rank];
    const nextTop = bands.tops[rank + 1];
    if (bottom === undefined)
        return canvasHeight / 2;
    if (nextTop === undefined)
        return Math.min(canvasHeight - 4, bottom + 16);
    return (bottom + nextTop) / 2;
}
/** Vertical middle of the free band above one rank, inside the figure. */
function bandGapAbove(bands, rank) {
    const top = bands.tops[rank];
    const previousBottom = bands.bottoms[rank - 1];
    if (top === undefined)
        return 4;
    if (previousBottom === undefined)
        return Math.max(4, top - 16);
    return (previousBottom + top) / 2;
}
/**
 * One route that leaves a border port, travels in the free bands between rank
 * rows — and, when the ranks are not adjacent, along the outer margin — and
 * enters the other box's border port. It never crosses a box rectangle, so a
 * relationship never runs through another classifier's member rows. Parallel
 * relationships shift their ports along the border instead of overlapping.
 */
function routeThroughBands(from, to, bands, canvasWidth, canvasHeight, portOffsetPx) {
    const portX = (box, offset) => Math.min(Math.max(box.x + box.width / 2 + offset, box.x + 4), box.x + box.width - 4);
    const startX = portX(from, portOffsetPx);
    const endX = portX(to, portOffsetPx);
    if (to.rank > from.rank) {
        const firstGate = bandGapBelow(bands, from.rank, canvasHeight);
        if (to.rank === from.rank + 1) {
            return Object.freeze([
                point(startX, from.y + from.height),
                point(startX, firstGate),
                point(endX, firstGate),
                point(endX, to.y),
            ]);
        }
        const corridorX = endX >= startX ? canvasWidth - MARGIN_PX / 2 : MARGIN_PX / 2;
        const approach = bandGapAbove(bands, to.rank);
        return Object.freeze([
            point(startX, from.y + from.height),
            point(startX, firstGate),
            point(corridorX, firstGate),
            point(corridorX, approach),
            point(endX, approach),
            point(endX, to.y),
        ]);
    }
    if (to.rank < from.rank) {
        const firstGate = bandGapAbove(bands, from.rank);
        if (to.rank === from.rank - 1) {
            return Object.freeze([
                point(startX, from.y),
                point(startX, firstGate),
                point(endX, firstGate),
                point(endX, to.y + to.height),
            ]);
        }
        const corridorX = endX >= startX ? canvasWidth - MARGIN_PX / 2 : MARGIN_PX / 2;
        const approach = bandGapBelow(bands, to.rank, canvasHeight);
        return Object.freeze([
            point(startX, from.y),
            point(startX, firstGate),
            point(corridorX, firstGate),
            point(corridorX, approach),
            point(endX, approach),
            point(endX, to.y + to.height),
        ]);
    }
    // One rank: dip into the free band below the row and come back up into the
    // target's own bottom border, never into its interior.
    const gate = bandGapBelow(bands, from.rank, canvasHeight);
    return Object.freeze([
        point(startX, from.y + from.height),
        point(startX, gate),
        point(endX, gate),
        point(endX, to.y + to.height),
    ]);
}
/** The width one edge label may wrap at without leaving the figure. */
function edgeWrapWidth(contentWidth, wrapWidthPx) {
    return Math.max(Math.min(wrapWidthPx, contentWidth), 1);
}
/**
 * Where one annotation sits beside a route: the point at `fraction` of the
 * polyline, pushed clear of it, and the anchor that keeps its text on that
 * side. A vertical segment is annotated to its side with a start or end
 * anchor — never centred, or the text would sit on the line, its arrowhead,
 * its diamond or its cardinality.
 */
function routeAnchor(points, fraction, offsetPx) {
    const first = points[0];
    if (first === undefined)
        return { x: 0, y: 0, anchor: "middle" };
    let total = 0;
    for (let index = 1; index < points.length; index += 1) {
        const previous = points[index - 1];
        const current = points[index];
        if (previous === undefined || current === undefined)
            continue;
        total += Math.hypot(current.x - previous.x, current.y - previous.y);
    }
    if (total <= 0)
        return { x: first.x, y: first.y, anchor: "middle" };
    let remaining = total * fraction;
    for (let index = 1; index < points.length; index += 1) {
        const previous = points[index - 1];
        const current = points[index];
        if (previous === undefined || current === undefined)
            continue;
        const deltaX = current.x - previous.x;
        const deltaY = current.y - previous.y;
        const length = Math.hypot(deltaX, deltaY);
        if (length === 0)
            continue;
        if (remaining > length && index < points.length - 1) {
            remaining -= length;
            continue;
        }
        const ratio = Math.min(Math.max(remaining / length, 0), 1);
        const x = previous.x + deltaX * ratio;
        const y = previous.y + deltaY * ratio;
        if (Math.abs(deltaY) >= Math.abs(deltaX)) {
            const shifted = (deltaY / length) * offsetPx;
            return { x: x + shifted, y, anchor: shifted >= 0 ? "start" : "end" };
        }
        return { x, y: y - (deltaX / length) * offsetPx, anchor: "middle" };
    }
    const last = points[points.length - 1] ?? first;
    return { x: last.x, y: last.y, anchor: "middle" };
}
/* ------------------------------------------------------------------ *
 * Display forms
 * ------------------------------------------------------------------ */
const ENTITY_KEY_DISPLAY = Object.freeze({
    primary: "PK",
    foreign: "FK",
    unique: "UQ",
});
const VISIBILITY_DISPLAY = Object.freeze({
    public: "+",
    private: "-",
    protected: "#",
    package: "~",
});
const INTERFACE_STEREOTYPE = "«interface»";
/**
 * The composed transition label: trigger, guard in brackets, action after a
 * slash, in that order, each omitted when unauthored. Layout, the emitter's
 * `<desc>` and the drawn `<text>` all read this one composition.
 */
export function transitionLabelText(transition) {
    const parts = [];
    if (transition.trigger !== undefined)
        parts.push(transition.trigger);
    if (transition.guard !== undefined)
        parts.push(`[${transition.guard}]`);
    if (transition.action !== undefined)
        parts.push(`/ ${transition.action}`);
    return parts.join(" ");
}
/** Positional index of the first occurrence of each name. */
function nameIndex(names) {
    const index = new Map();
    names.forEach((name, position) => {
        if (!index.has(name))
            index.set(name, position);
    });
    return index;
}
function headerLines(name, label, theme, nameRole, labelRole) {
    const tokens = theme.models;
    const typography = modelsLabelTypography(theme);
    const lines = wrapText(name, tokens.wrapWidthPx, typography.labelFontSizePx).map((text) => ({ text, role: nameRole, fontSizePx: typography.labelFontSizePx }));
    if (label !== undefined) {
        for (const text of wrapText(label, tokens.wrapWidthPx, typography.captionFontSizePx)) {
            lines.push({ text, role: labelRole, fontSizePx: typography.captionFontSizePx });
        }
    }
    return lines;
}
function widestHeaderLine(lines) {
    let widest = 0;
    for (const line of lines)
        widest = Math.max(widest, measureText(line.text, line.fontSizePx));
    return widest;
}
/** One stacked title band, drawn at the same pitch its height was measured at. */
function pushHeaderLines(sink, lines, x, top, typography, canvasWidth) {
    let cursor = top;
    for (const line of lines) {
        addText(sink, {
            x: clampX(x, measureText(line.text, line.fontSizePx), "middle", canvasWidth),
            y: cursor + typography.labelLineHeightPx / 2,
            text: line.text,
            anchor: "middle",
            role: line.role,
            ariaHidden: false,
        });
        cursor += typography.labelLineHeightPx;
    }
}
function headerBandHeight(lines, typography, paddingYPx) {
    return lines.length * typography.labelLineHeightPx + 2 * paddingYPx;
}
/**
 * One sequence figure: lanes in participant order at the pitch of the widest
 * lane header, timeline rows in item order, fragment frames spanning their own
 * items, activation bars spanning their open and close messages, and notes
 * spanning the lanes they name.
 */
export function layoutSequence(block, theme) {
    const tokens = theme.models;
    const typography = modelsLabelTypography(theme);
    const sink = createSink();
    const lanePlans = block.participants.map((participant) => {
        const nameLines = wrapText(participant.name, tokens.wrapWidthPx, typography.labelFontSizePx);
        const labelLines = participant.label === undefined
            ? []
            : wrapText(participant.label, tokens.wrapWidthPx, typography.captionFontSizePx);
        const textWidth = Math.max(widestLine(nameLines, typography.labelFontSizePx), widestLine(labelLines, typography.captionFontSizePx));
        const contentWidth = participant.kind === "actor"
            ? Math.max(2 * ACTOR_ARM_HALF_SPAN_PX, textWidth)
            : textWidth;
        const textHeight = headerBandHeight(headerLines(participant.name, participant.label, theme, SEQUENCE_PARTICIPANT_NAME_ROLE, SEQUENCE_PARTICIPANT_LABEL_ROLE), typography, participant.kind === "actor" ? 0 : tokens.paddingYPx);
        const headerHeight = participant.kind === "actor"
            ? ACTOR_FIGURE_HEIGHT_PX + ACTOR_NAME_GAP_PX + textHeight
            : textHeight;
        return { participant, contentWidth, headerHeight };
    });
    const laneWidth = (lanePlans.length === 0
        ? 0
        : Math.max(...lanePlans.map((lane) => lane.contentWidth))) +
        2 * tokens.paddingXPx;
    const pitch = laneWidth + tokens.columnGapPx;
    const laneSpan = lanePlans.length === 0 ? 0 : lanePlans.length * pitch - tokens.columnGapPx;
    const width = MARGIN_PX * 2 + Math.max(laneSpan, tokens.wrapWidthPx);
    const headerHeight = lanePlans.length === 0 ? 0 : Math.max(...lanePlans.map((lane) => lane.headerHeight));
    const headerBottom = MARGIN_PX + headerHeight;
    /** Left border of the lane at `index`; every lane has the same width. */
    const laneLeft = (index) => MARGIN_PX + index * pitch;
    /** Lifeline of the lane at `index`. */
    const laneCenter = (index) => laneLeft(index) + laneWidth / 2;
    const laneOf = nameIndex(block.participants.map((participant) => participant.name));
    /* Timeline bands ------------------------------------------------ */
    const bands = [];
    const frames = [];
    const messageWrap = (message) => {
        const from = laneOf.get(message.from);
        const to = laneOf.get(message.to);
        if (from === undefined || to === undefined)
            return tokens.wrapWidthPx;
        const span = Math.abs(laneCenter(to) - laneCenter(from));
        return Math.max(Math.min(tokens.wrapWidthPx, span), typography.labelFontSizePx * 6);
    };
    const noteSpan = (note) => {
        const indexes = note.over
            .map((name) => laneOf.get(name))
            .filter((index) => index !== undefined);
        const first = indexes.length === 0 ? 0 : Math.min(...indexes);
        const last = indexes.length === 0 ? lanePlans.length - 1 : Math.max(...indexes);
        return {
            left: laneLeft(first),
            right: laneLeft(last) + laneWidth,
            indexes,
        };
    };
    const walk = (items, depth) => {
        for (const item of items) {
            if (item.kind === "message") {
                const lines = wrapText(item.text ?? "", messageWrap(item), typography.labelFontSizePx);
                bands.push({
                    message: item,
                    lines,
                    height: lines.length * typography.labelLineHeightPx + 2 * MESSAGE_GAP_PX,
                    y: 0,
                });
                continue;
            }
            if (item.kind === "note") {
                const span = noteSpan(item);
                const lines = wrapText(item.text, Math.max(span.right - span.left - 2 * tokens.paddingXPx, typography.labelFontSizePx), typography.labelFontSizePx);
                bands.push({
                    note: item,
                    lines,
                    height: lines.length * typography.labelLineHeightPx + 2 * tokens.paddingYPx,
                    y: 0,
                });
                continue;
            }
            const tabWidth = measureText(item.kind, typography.captionFontSizePx) + 2 * tokens.paddingXPx;
            const tabHeight = typography.captionLineHeightPx + tokens.paddingYPx;
            const frameLeft = MARGIN_PX - FRAME_PAD_PX + depth * FRAME_DEPTH_INSET_PX;
            const frameRight = MARGIN_PX + laneSpan + FRAME_PAD_PX - depth * FRAME_DEPTH_INSET_PX;
            // The operator sits in a tab at the frame's top-left, so the first
            // division's own text starts to the right of that tab, never under it.
            const conditionWidth = (afterTab) => Math.max(frameRight -
                frameLeft -
                2 * tokens.paddingXPx -
                (afterTab ? tabWidth + tokens.paddingXPx : 0), typography.labelFontSizePx * 4);
            const conditionLines = (condition, afterTab) => condition === undefined
                ? []
                : wrapText(condition, conditionWidth(afterTab), typography.labelFontSizePx);
            /**
             * What a division's own line reads: the authored condition in brackets,
             * `else` for a later unauthored division, and nothing at all for the
             * first one, whose tab already names the fragment.
             */
            const divisionLabel = (condition, position) => condition === undefined ? (position > 0 ? "else" : undefined) : `[${condition}]`;
            const conditionBandHeight = (lines, afterTab) => Math.max(lines.length * typography.labelLineHeightPx, afterTab ? tabHeight : 0) +
                MESSAGE_GAP_PX;
            if (item.kind === "loop") {
                const lines = conditionLines(item.condition, true);
                const start = bands.length;
                bands.push({
                    operator: item.kind,
                    ...(item.condition === undefined ? {} : { condition: item.condition }),
                    lines,
                    height: conditionBandHeight(lines, true),
                    y: 0,
                });
                walk(item.body, depth + 1);
                frames.push({
                    start,
                    end: bands.length - 1,
                    operator: item.kind,
                    depth,
                    tabWidth,
                    tabHeight,
                    divisions: [{ band: start, afterTab: true, separator: false }],
                });
                continue;
            }
            const start = bands.length;
            const divisions = [];
            // An `alt` with no divisions still draws its frame: layout is total.
            const sources = item.divisions.length === 0 ? [undefined] : item.divisions;
            sources.forEach((division, position) => {
                const afterTab = position === 0;
                const text = divisionLabel(division?.condition, position);
                const lines = conditionLines(text, afterTab);
                const band = bands.length;
                bands.push({
                    operator: item.kind,
                    ...(text === undefined ? {} : { condition: text }),
                    lines,
                    height: conditionBandHeight(lines, afterTab),
                    y: 0,
                });
                divisions.push({ band, afterTab, separator: position > 0 });
                walk(division?.body ?? [], depth + 1);
            });
            if (divisions.length > 0) {
                frames.push({
                    start,
                    end: bands.length - 1,
                    operator: item.kind,
                    depth,
                    tabWidth,
                    tabHeight,
                    divisions,
                });
            }
        }
    };
    walk(block.timeline, 0);
    let bandCursor = headerBottom + (bands.length === 0 ? 0 : tokens.rowGapPx);
    const placedBands = bands.map((band) => {
        const positioned = { ...band, y: bandCursor };
        bandCursor += band.height + tokens.rowGapPx;
        return positioned;
    });
    const timelineBottom = bands.length === 0 ? headerBottom : bandCursor - tokens.rowGapPx;
    const height = Math.max(timelineBottom + MARGIN_PX, headerBottom + MARGIN_PX);
    /* Lane headers -------------------------------------------------- */
    lanePlans.forEach((lane, index) => {
        const left = laneLeft(index);
        const center = laneCenter(index);
        const top = MARGIN_PX + headerHeight - lane.headerHeight;
        if (lane.participant.kind !== "actor") {
            addBox(sink, {
                x: left,
                y: top,
                width: laneWidth,
                height: lane.headerHeight,
                cornerRadiusPx: 0,
                role: "participant",
            });
            pushHeaderLines(sink, headerLines(lane.participant.name, lane.participant.label, theme, SEQUENCE_PARTICIPANT_NAME_ROLE, SEQUENCE_PARTICIPANT_LABEL_ROLE), center, top + tokens.paddingYPx, typography, width);
            return;
        }
        const headCenterY = top + ACTOR_HEAD_RADIUS_PX;
        const shoulderY = top + 2 * ACTOR_HEAD_RADIUS_PX + ACTOR_NECK_GAP_PX;
        const hipY = shoulderY + ACTOR_BODY_LENGTH_PX;
        addCircle(sink, {
            cx: center,
            cy: headCenterY,
            radiusPx: ACTOR_HEAD_RADIUS_PX,
            innerRadiusPx: 0,
            role: "actor-head",
        });
        addPath(sink, {
            points: [point(center, shoulderY), point(center, hipY)],
            closed: false,
            marker: "none",
            markerEnd: "end",
            markerSizePx: tokens.diamondSizePx,
            markerKind: "none",
            dashed: false,
            role: "actor-limb",
        });
        addPath(sink, {
            points: [
                point(center - ACTOR_ARM_HALF_SPAN_PX, shoulderY),
                point(center, shoulderY),
                point(center + ACTOR_ARM_HALF_SPAN_PX, shoulderY),
            ],
            closed: false,
            marker: "none",
            markerEnd: "end",
            markerSizePx: tokens.diamondSizePx,
            markerKind: "none",
            dashed: false,
            role: "actor-limb",
        });
        addPath(sink, {
            points: [
                point(center - ACTOR_ARM_HALF_SPAN_PX, hipY + ACTOR_LEG_LENGTH_PX),
                point(center, hipY),
                point(center + ACTOR_ARM_HALF_SPAN_PX, hipY + ACTOR_LEG_LENGTH_PX),
            ],
            closed: false,
            marker: "none",
            markerEnd: "end",
            markerSizePx: tokens.diamondSizePx,
            markerKind: "none",
            dashed: false,
            role: "actor-limb",
        });
        pushHeaderLines(sink, headerLines(lane.participant.name, lane.participant.label, theme, SEQUENCE_PARTICIPANT_NAME_ROLE, SEQUENCE_PARTICIPANT_LABEL_ROLE), center, top + ACTOR_FIGURE_HEIGHT_PX + ACTOR_NAME_GAP_PX, typography, width);
    });
    /* Lifelines ----------------------------------------------------- */
    for (let index = 0; index < lanePlans.length; index += 1) {
        addPath(sink, {
            points: [
                point(laneCenter(index), headerBottom),
                point(laneCenter(index), Math.max(timelineBottom, headerBottom)),
            ],
            closed: false,
            marker: "none",
            markerEnd: "end",
            markerSizePx: tokens.diamondSizePx,
            markerKind: "none",
            dashed: true,
            role: "lifeline",
        });
    }
    /* Notes --------------------------------------------------------- */
    for (const band of placedBands) {
        const note = band.note;
        if (note === undefined || lanePlans.length === 0)
            continue;
        const span = noteSpan(note);
        const corner = Math.min(NOTE_CORNER_PX, (span.right - span.left) / 2, band.height / 2);
        addNote(sink, {
            points: [
                point(span.left, band.y),
                point(span.right - corner, band.y),
                point(span.right, band.y + corner),
                point(span.right, band.y + band.height),
                point(span.left, band.y + band.height),
            ],
            role: "note",
        });
        pushLines(sink, band.lines, span.left + tokens.paddingXPx, band.y + tokens.paddingYPx, typography.labelLineHeightPx, "start", SEQUENCE_NOTE_ROLE, width, typography.labelFontSizePx);
    }
    /* Messages, and the activation bars their flags open and close ---- */
    const openBars = new Map();
    for (const band of placedBands) {
        const message = band.message;
        if (message === undefined)
            continue;
        const fromIndex = laneOf.get(message.from);
        const toIndex = laneOf.get(message.to);
        const arrowY = band.y + band.lines.length * typography.labelLineHeightPx + MESSAGE_GAP_PX;
        const labelClass = SEQUENCE_MESSAGE_ROLE;
        if (fromIndex === undefined || toIndex === undefined) {
            pushLines(sink, band.lines, width / 2, band.y, typography.labelLineHeightPx, "middle", labelClass, width, typography.labelFontSizePx);
            continue;
        }
        const fromX = laneCenter(fromIndex);
        const toX = laneCenter(toIndex);
        const messageRole = message.form === "sync"
            ? "message-sync"
            : message.form === "async"
                ? "message-async"
                : "message-return";
        const selfRole = message.form === "sync"
            ? "self-message-sync"
            : message.form === "async"
                ? "self-message-async"
                : "self-message-return";
        if (fromIndex === toIndex) {
            const loopWidth = Math.min(tokens.selfMessageWidthPx, Math.max(8, width - toX - 4));
            addPath(sink, {
                points: [
                    point(fromX, arrowY),
                    point(fromX + loopWidth, arrowY),
                    point(fromX + loopWidth, arrowY + typography.labelLineHeightPx),
                    point(fromX, arrowY + typography.labelLineHeightPx),
                ],
                closed: false,
                marker: "arrow",
                markerEnd: "end",
                markerSizePx: tokens.diamondSizePx,
                markerKind: "arrow",
                dashed: message.form === "return",
                role: selfRole,
            });
            pushLines(sink, band.lines, fromX + loopWidth + MESSAGE_GAP_PX, band.y, typography.labelLineHeightPx, "start", labelClass, width, typography.labelFontSizePx);
        }
        else {
            addPath(sink, {
                points: [point(fromX, arrowY), point(toX, arrowY)],
                closed: false,
                marker: "arrow",
                markerEnd: "end",
                markerSizePx: tokens.diamondSizePx,
                markerKind: "arrow",
                dashed: message.form === "return",
                role: messageRole,
            });
            pushLines(sink, band.lines, (fromX + toX) / 2, band.y, typography.labelLineHeightPx, "middle", labelClass, width, typography.labelFontSizePx);
        }
        if (message.activate) {
            const open = openBars.get(toIndex) ?? [];
            open.push(arrowY);
            openBars.set(toIndex, open);
        }
        if (message.deactivate) {
            const started = openBars.get(fromIndex)?.pop();
            if (started !== undefined) {
                addBar(sink, {
                    x: laneCenter(fromIndex) - tokens.activationWidthPx / 2,
                    y: started,
                    width: tokens.activationWidthPx,
                    height: Math.max(arrowY - started, 1),
                    role: "activation",
                });
            }
        }
    }
    for (const [index, stack] of openBars) {
        for (const started of stack) {
            addBar(sink, {
                x: laneCenter(index) - tokens.activationWidthPx / 2,
                y: started,
                width: tokens.activationWidthPx,
                height: Math.max(timelineBottom - started, 1),
                role: "activation",
            });
        }
    }
    /* Fragment frames, outermost first so a nested frame paints inside its own */
    const orderedFrames = [...frames].sort((left, right) => left.start - right.start || right.end - left.end);
    for (const frame of orderedFrames) {
        const firstBand = placedBands[frame.start];
        const lastBand = placedBands[frame.end];
        if (firstBand === undefined || lastBand === undefined)
            continue;
        const left = MARGIN_PX - FRAME_PAD_PX + frame.depth * FRAME_DEPTH_INSET_PX;
        const right = MARGIN_PX + laneSpan + FRAME_PAD_PX - frame.depth * FRAME_DEPTH_INSET_PX;
        const top = firstBand.y - FRAME_PAD_PX + (frame.depth * FRAME_DEPTH_INSET_PX) / 2;
        const bottomOfFrame = lastBand.y + lastBand.height + FRAME_PAD_PX - (frame.depth * FRAME_DEPTH_INSET_PX) / 2;
        const divisionYs = [];
        for (const division of frame.divisions) {
            const band = placedBands[division.band];
            if (!division.separator || band === undefined)
                continue;
            divisionYs.push(band.y - tokens.rowGapPx / 2);
        }
        addFragment(sink, {
            x: left,
            y: top,
            width: Math.max(right - left, 1),
            height: Math.max(bottomOfFrame - top, frame.tabHeight),
            tabWidthPx: frame.tabWidth,
            tabHeightPx: frame.tabHeight,
            divisionYs,
            role: "fragment",
            tabRole: "fragment-tab",
            divisionRole: "fragment-division",
        });
        addText(sink, {
            x: clampX(left + tokens.paddingXPx / 2, measureText(frame.operator, typography.captionFontSizePx), "start", width),
            y: top + frame.tabHeight / 2,
            text: frame.operator,
            anchor: "start",
            role: SEQUENCE_FRAGMENT_LABEL_ROLE,
            ariaHidden: false,
        });
        for (const division of frame.divisions) {
            const band = placedBands[division.band];
            if (band === undefined || band.lines.length === 0)
                continue;
            pushLines(sink, band.lines, left + tokens.paddingXPx + (division.afterTab ? frame.tabWidth + tokens.paddingXPx : 0), band.y, typography.labelLineHeightPx, "start", SEQUENCE_FRAGMENT_CONDITION_ROLE, width, typography.labelFontSizePx);
        }
    }
    return freezeLayout("sequence", sink, width, height);
}
/**
 * One state machine: ranks by longest-path distance from each scope's
 * `initial`, composites nested inside their own box with a title bar,
 * orthogonally routed transitions, an initial filled dot and a final bullseye
 * that show no name.
 */
export function layoutState(block, theme) {
    const tokens = theme.models;
    const typography = modelsLabelTypography(theme);
    const sink = createSink();
    const transitions = block.items.filter((item) => item.kind === "transition");
    const convert = (scoped) => scoped.map((item) => item.kind === "state"
        ? {
            kind: "state",
            name: item.name,
            ...(item.label === undefined ? {} : { label: item.label }),
            children: convert(item.states),
        }
        : { kind: item.kind, name: item.name, children: Object.freeze([]) });
    const rootNodes = convert(block.items.filter((item) => item.kind !== "transition"));
    const plan = planStateScope(rootNodes, transitions, theme);
    const width = plan.width + 2 * MARGIN_PX;
    const height = plan.height + 2 * MARGIN_PX;
    const emitScope = (scope, offsetX, offsetY) => {
        for (const entry of scope.nodes) {
            const x = entry.x + offsetX;
            const y = entry.y + offsetY;
            if (entry.node.kind === "state") {
                const lines = headerLines(entry.node.name, entry.node.label, theme, STATE_NAME_ROLE, STATE_LABEL_ROLE);
                addNestedBox(sink, {
                    x,
                    y,
                    width: entry.width,
                    height: entry.height,
                    cornerRadiusPx: tokens.boxCornerRadiusPx,
                    headerHeightPx: entry.headerHeight,
                    dividerYs: [entry.headerHeight],
                    role: "composite",
                    headerRole: "composite-title",
                    dividerRole: "state-divider",
                });
                pushHeaderLines(sink, lines, x + entry.width / 2, y + tokens.paddingYPx, typography, width);
                if (entry.inner !== undefined) {
                    emitScope(entry.inner, x + tokens.paddingXPx, y + entry.headerHeight + tokens.paddingYPx);
                }
                continue;
            }
            const diameter = Math.min(entry.width, entry.height);
            if (entry.node.kind === "initial") {
                addCircle(sink, {
                    cx: x + entry.width / 2,
                    cy: y + entry.height / 2,
                    radiusPx: diameter / 2,
                    innerRadiusPx: 0,
                    role: "initial",
                });
                continue;
            }
            addCircle(sink, {
                cx: x + entry.width / 2,
                cy: y + entry.height / 2,
                radiusPx: diameter / 2,
                innerRadiusPx: (diameter * FINAL_INNER_RATIO) / 2,
                role: "final",
                innerRole: "final-inner",
            });
        }
    };
    emitScope(plan, MARGIN_PX, MARGIN_PX);
    const byName = new Map();
    // A transition label may sit on a route, but never over a state's own box;
    // a composite counts only for its title bar, so nested routes still find
    // room inside the composite they belong to.
    const labelObstacles = [];
    const placedLabels = [];
    const indexNames = (scope, offsetX, offsetY) => {
        for (const entry of scope.nodes) {
            const placed = { ...entry, x: entry.x + offsetX, y: entry.y + offsetY };
            if (!byName.has(entry.node.name))
                byName.set(entry.node.name, placed);
            labelObstacles.push(entry.inner === undefined
                ? { x: placed.x, y: placed.y, width: placed.width, height: placed.height }
                : { x: placed.x, y: placed.y, width: placed.width, height: entry.headerHeight });
            if (entry.inner !== undefined) {
                indexNames(entry.inner, placed.x + tokens.paddingXPx, placed.y + entry.headerHeight + tokens.paddingYPx);
            }
        }
    };
    indexNames(plan, MARGIN_PX, MARGIN_PX);
    const transitionOffsets = parallelOffsets(transitions.map((transition) => `${transition.from}|${transition.to}`));
    transitions.forEach((transition, position) => {
        const from = byName.get(transition.from);
        const to = byName.get(transition.to);
        if (from === undefined || to === undefined)
            return;
        const points = transition.from === transition.to
            ? routeSelfLoop(from, width, TRANSITION_LOOP_HALF_PX)
            : offsetRoute(routeBetween(from, to, tokens.columnGapPx), transitionOffsets[position] ?? 0);
        addPath(sink, {
            points,
            closed: false,
            marker: "arrow",
            markerEnd: "end",
            markerSizePx: tokens.diamondSizePx,
            markerKind: "arrow",
            dashed: false,
            role: "transition",
        });
        const label = transitionLabelText(transition);
        if (label === "")
            return;
        const lines = wrapText(label, edgeWrapWidth(plan.width, tokens.wrapWidthPx), typography.memberFontSizePx);
        const at = freeLabelAnchor(points, typography.memberLineHeightPx / 2 + 2, widestLine(lines, typography.memberFontSizePx), lines.length * typography.memberLineHeightPx, labelObstacles, placedLabels);
        pushLines(sink, lines, at.x, at.y - (lines.length * typography.memberLineHeightPx) / 2, typography.memberLineHeightPx, at.anchor, STATE_TRANSITION_ROLE, width, typography.memberFontSizePx);
    });
    return freezeLayout("state", sink, width, height);
}
/**
 * Ranks one scope bottom-up: rank is the longest-path distance from the
 * scope's `initial`, a scope without one ranks from its own entry states, and
 * a state no transition can reach trails the reachable ones.
 */
function planStateScope(nodes, transitions, theme) {
    const tokens = theme.models;
    const typography = modelsLabelTypography(theme);
    if (nodes.length === 0)
        return { width: 0, height: 0, nodes: Object.freeze([]) };
    const index = nameIndex(nodes.map((node) => node.name));
    const edges = [];
    const outgoing = new Map();
    for (const transition of transitions) {
        const from = index.get(transition.from);
        const to = index.get(transition.to);
        if (from === undefined || to === undefined)
            continue;
        edges.push({ from, to });
        const list = outgoing.get(from) ?? [];
        list.push(to);
        outgoing.set(from, list);
    }
    const rank = rankByLongestPath(nodes.length, edges);
    const initial = nodes.findIndex((node) => node.kind === "initial");
    if (initial >= 0) {
        const reachable = new Set([initial]);
        const queue = [initial];
        while (queue.length > 0) {
            const current = queue.shift();
            if (current === undefined)
                continue;
            for (const next of outgoing.get(current) ?? []) {
                if (reachable.has(next))
                    continue;
                reachable.add(next);
                queue.push(next);
            }
        }
        let maxReachable = 0;
        for (const position of reachable)
            maxReachable = Math.max(maxReachable, rank[position] ?? 0);
        nodes.forEach((_, position) => {
            if (!reachable.has(position))
                rank[position] = maxReachable + 1;
        });
    }
    const sizes = nodes.map((node) => {
        if (node.kind !== "state") {
            const diameter = node.kind === "initial" ? tokens.diamondSizePx : tokens.diamondSizePx * FINAL_DIAMETER_RATIO;
            return {
                width: diameter,
                height: diameter,
                headerHeight: 0,
                inner: undefined,
            };
        }
        const inner = planStateScope(node.children, transitions, theme);
        const lines = headerLines(node.name, node.label, theme, STATE_NAME_ROLE, STATE_LABEL_ROLE);
        const band = headerBandHeight(lines, typography, tokens.paddingYPx);
        return {
            width: Math.max(widestHeaderLine(lines), inner.width) + 2 * tokens.paddingXPx,
            height: band + inner.height + (inner.height === 0 ? tokens.paddingYPx : 2 * tokens.paddingYPx),
            headerHeight: band,
            inner,
        };
    });
    const ranks = [...new Set(rank)].sort((left, right) => left - right);
    const rows = ranks.map((value) => nodes
        .map((node, position) => ({ node, position }))
        .filter(({ position }) => rank[position] === value));
    const rowHeights = rows.map((row) => row.reduce((tallest, { position }) => Math.max(tallest, sizes[position]?.height ?? 0), 0));
    const rowWidths = rows.map((row) => row.reduce((total, { position }, positionInRow) => total + (positionInRow === 0 ? 0 : tokens.columnGapPx) + (sizes[position]?.width ?? 0), 0));
    const contentWidth = rowWidths.length === 0 ? 0 : Math.max(...rowWidths);
    const placed = [];
    let cursorY = 0;
    rows.forEach((row, rowIndex) => {
        const rowHeight = rowHeights[rowIndex] ?? 0;
        let cursorX = (contentWidth - (rowWidths[rowIndex] ?? 0)) / 2;
        for (const { position } of row) {
            const size = sizes[position];
            const node = nodes[position];
            if (size === undefined || node === undefined)
                continue;
            placed.push({
                node,
                x: cursorX,
                y: cursorY + (rowHeight - size.height) / 2,
                width: size.width,
                height: size.height,
                headerHeight: size.headerHeight,
                ...(size.inner === undefined ? {} : { inner: size.inner }),
            });
            cursorX += size.width + tokens.columnGapPx;
        }
        cursorY += rowHeight + tokens.rankGapPx;
    });
    const height = rows.length === 0 ? 0 : Math.max(cursorY - tokens.rankGapPx, 0);
    return { width: contentWidth, height, nodes: Object.freeze(placed) };
}
/* ------------------------------------------------------------------ *
 * Entity layout
 * ------------------------------------------------------------------ */
/**
 * One entity graph: entities layered by the relationship graph, relationship
 * edges carrying the compact cardinality of each end, its optional role and
 * the relationship label at the middle.
 */
export function layoutEntity(block, theme) {
    const tokens = theme.models;
    const typography = modelsLabelTypography(theme);
    const sink = createSink();
    const entities = [];
    const relationships = [];
    const seen = new Set();
    for (const item of block.items) {
        if (item.kind === "relationship") {
            relationships.push(item);
            continue;
        }
        if (seen.has(item.name))
            continue;
        seen.add(item.name);
        entities.push(item);
    }
    const index = nameIndex(entities.map((entity) => entity.name));
    const edges = [];
    for (const relationship of relationships) {
        const from = index.get(relationship.first.entity);
        const to = index.get(relationship.second.entity);
        if (from === undefined || to === undefined)
            continue;
        edges.push({ from, to });
    }
    const rank = rankByLongestPath(entities.length, edges);
    const sizes = entities.map((entity) => entitySize(entity, theme));
    const ranks = [...new Set(rank)].sort((left, right) => left - right);
    const rows = ranks.map((value) => entities
        .map((entity, position) => ({ entity, position }))
        .filter(({ position }) => rank[position] === value));
    const rowHeights = rows.map((row) => row.reduce((tallest, { position }) => Math.max(tallest, sizes[position]?.height ?? 0), 0));
    const rowWidths = rows.map((row) => row.reduce((total, { position }, positionInRow) => total + (positionInRow === 0 ? 0 : tokens.columnGapPx) + (sizes[position]?.width ?? 0), 0));
    const contentWidth = rowWidths.length === 0 ? 0 : Math.max(...rowWidths);
    const width = contentWidth + 2 * MARGIN_PX;
    const placed = [];
    const rankBands = { tops: [], bottoms: [] };
    let cursorY = MARGIN_PX;
    rows.forEach((row, rowIndex) => {
        const rowHeight = rowHeights[rowIndex] ?? 0;
        bandTopsPush(rankBands, cursorY, rowHeight);
        let cursorX = MARGIN_PX + (contentWidth - (rowWidths[rowIndex] ?? 0)) / 2;
        for (const { position } of row) {
            const size = sizes[position];
            const entity = entities[position];
            if (size === undefined || entity === undefined)
                continue;
            placed.push({
                entity,
                rank: ranks[rowIndex] ?? 0,
                x: cursorX,
                y: cursorY + (rowHeight - size.height) / 2,
                width: size.width,
                height: size.height,
            });
            cursorX += size.width + tokens.columnGapPx;
        }
        cursorY += rowHeight + tokens.rankGapPx;
    });
    const height = (rows.length === 0 ? MARGIN_PX : cursorY - tokens.rankGapPx) + MARGIN_PX;
    for (const box of placed) {
        const lines = headerLines(box.entity.name, box.entity.label, theme, ENTITY_NAME_ROLE, ENTITY_LABEL_ROLE);
        const headerHeight = headerBandHeight(lines, typography, tokens.paddingYPx);
        addNestedBox(sink, {
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height,
            cornerRadiusPx: tokens.boxCornerRadiusPx,
            headerHeightPx: headerHeight,
            dividerYs: [headerHeight],
            role: "entity",
            headerRole: "entity-header",
            dividerRole: "entity-divider",
        });
        pushHeaderLines(sink, lines, box.x + box.width / 2, box.y + tokens.paddingYPx, typography, width);
        let memberY = box.y + headerHeight;
        for (const attribute of box.entity.attributes ?? []) {
            const memberLines = wrapText(attributeText(attribute), tokens.wrapWidthPx, typography.memberFontSizePx);
            pushLines(sink, memberLines, box.x + tokens.paddingXPx, memberY, typography.memberLineHeightPx, "start", attribute.optional ? ENTITY_OPTIONAL_ROLE : ENTITY_ATTRIBUTE_ROLE, width, typography.memberFontSizePx);
            const marker = attributeMarker(attribute);
            if (marker !== "") {
                addText(sink, {
                    x: q(box.x + box.width - tokens.paddingXPx),
                    y: memberY + typography.memberLineHeightPx * memberLines.length - typography.memberLineHeightPx / 2,
                    text: marker,
                    anchor: "end",
                    role: ENTITY_KEY_ROLE,
                    ariaHidden: false,
                });
            }
            memberY += typography.memberLineHeightPx * memberLines.length;
        }
    }
    const placedLabels = [];
    const relationshipOffsets = parallelOffsets(relationships.map((relationship) => `${relationship.first.entity}|${relationship.second.entity}`));
    relationships.forEach((relationship, position) => {
        const from = placed.find((box) => box.entity.name === relationship.first.entity);
        const to = placed.find((box) => box.entity.name === relationship.second.entity);
        if (from === undefined || to === undefined)
            return;
        const points = relationship.first.entity === relationship.second.entity
            ? routeSelfLoop(from, width, typography.memberLineHeightPx)
            : routeThroughBands(from, to, rankBands, width, height, relationshipOffsets[position] ?? 0);
        addPath(sink, {
            points,
            closed: false,
            marker: "none",
            markerEnd: "end",
            markerSizePx: tokens.diamondSizePx,
            markerKind: "none",
            dashed: false,
            role: "entity-relationship",
        });
        // Cardinality and role take opposite sides of the route, and the
        // relationship's own name sits further out again, so a short edge still
        // shows all three without stacking them on one another.
        const markerOffset = typography.markerLineHeightPx / 2 + 2;
        const ends = [
            { end: relationship.first, fraction: 0.15 },
            { end: relationship.second, fraction: 0.85 },
        ];
        for (const { end, fraction } of ends) {
            const at = routeAnchor(points, fraction, markerOffset);
            pushLines(sink, [cardinalityDisplay(end.cardinality)], at.x, at.y - typography.markerLineHeightPx / 2, typography.markerLineHeightPx, at.anchor, ENTITY_CARDINALITY_ROLE, width, typography.markerFontSizePx);
        }
        const roles = [
            { role: relationship.first.role, fraction: 0.35 },
            { role: relationship.second.role, fraction: 0.65 },
        ];
        for (const { role, fraction } of roles) {
            if (role === undefined)
                continue;
            const at = routeAnchor(points, fraction, -markerOffset);
            const lines = wrapText(role, edgeWrapWidth(contentWidth, tokens.wrapWidthPx), typography.markerFontSizePx);
            pushLines(sink, lines, at.x, at.y - (lines.length * typography.markerLineHeightPx) / 2, typography.markerLineHeightPx, at.anchor, ENTITY_ROLE_ROLE, width, typography.markerFontSizePx);
        }
        if (relationship.label === undefined)
            return;
        const lines = wrapText(relationship.label, edgeWrapWidth(contentWidth, tokens.wrapWidthPx), typography.captionFontSizePx);
        const at = freeLabelAnchor(points, markerOffset * 2, widestLine(lines, typography.captionFontSizePx), lines.length * typography.captionLineHeightPx, placed, placedLabels);
        pushLines(sink, lines, at.x, at.y - (lines.length * typography.captionLineHeightPx) / 2, typography.captionLineHeightPx, at.anchor, ENTITY_RELATIONSHIP_LABEL_ROLE, width, typography.captionFontSizePx);
    });
    return freezeLayout("entity", sink, width, height);
}
/** `name?` and its type, before wrapping; the key markers follow separately. */
function attributeText(attribute) {
    return (`${attribute.name}${attribute.optional ? "?" : ""}` +
        (attribute.type === undefined ? "" : `: ${attribute.type}`));
}
/** Key markers, then the foreign key's target, in authored key order. */
function attributeMarker(attribute) {
    const parts = (attribute.keys ?? []).map((key) => ENTITY_KEY_DISPLAY[key]);
    if (attribute.reference !== undefined) {
        parts.push(`${attribute.reference.entity}.${attribute.reference.attribute}`);
    }
    return parts.join(" ");
}
function entitySize(entity, theme) {
    const tokens = theme.models;
    const typography = modelsLabelTypography(theme);
    const lines = headerLines(entity.name, entity.label, theme, ENTITY_NAME_ROLE, ENTITY_LABEL_ROLE);
    const headerHeight = headerBandHeight(lines, typography, tokens.paddingYPx);
    let memberWidth = 0;
    let memberHeight = 0;
    for (const attribute of entity.attributes ?? []) {
        const memberLines = wrapText(attributeText(attribute), tokens.wrapWidthPx, typography.memberFontSizePx);
        const marker = attributeMarker(attribute);
        memberWidth = Math.max(memberWidth, widestLine(memberLines, typography.memberFontSizePx) +
            (marker === "" ? 0 : tokens.paddingXPx + measureText(marker, typography.markerFontSizePx)));
        memberHeight += memberLines.length * typography.memberLineHeightPx;
    }
    return {
        width: Math.max(widestHeaderLine(lines), memberWidth) + 2 * tokens.paddingXPx,
        height: headerHeight +
            ((entity.attributes ?? []).length === 0
                ? MIN_SECTION_LINES * typography.memberLineHeightPx
                : memberHeight) +
            tokens.paddingYPx,
    };
}
const CLASS_FORMS = Object.freeze({
    inheritance: { marker: "arrow", markerEnd: "end", markerKind: "triangle", dashed: false },
    implementation: { marker: "arrow", markerEnd: "end", markerKind: "triangle", dashed: true },
    association: { marker: "none", markerEnd: "end", markerKind: "none", dashed: false },
    aggregation: { marker: "diamond", markerEnd: "start", markerKind: "diamond-hollow", dashed: false },
    composition: { marker: "diamond", markerEnd: "start", markerKind: "diamond-filled", dashed: false },
});
/** The role one relationship form gives its own route. */
function classRelationshipRole(form) {
    switch (form) {
        case "inheritance":
            return "class-relationship-inheritance";
        case "implementation":
            return "class-relationship-implementation";
        case "association":
            return "class-relationship-association";
        case "aggregation":
            return "class-relationship-aggregation";
        default:
            return "class-relationship-composition";
    }
}
/**
 * One class diagram: classifiers ranked by inheritance and implementation
 * depth with supertypes above subtypes, then the association, aggregation and
 * composition edges, and members composed with their parentheses always
 * present.
 */
export function layoutClass(block, theme) {
    const tokens = theme.models;
    const typography = modelsLabelTypography(theme);
    const sink = createSink();
    const classifiers = [];
    const relationships = [];
    const seen = new Set();
    for (const item of block.items) {
        if (item.kind === "relationship") {
            relationships.push(item);
            continue;
        }
        if (seen.has(item.name))
            continue;
        seen.add(item.name);
        classifiers.push(item);
    }
    const index = nameIndex(classifiers.map((classifier) => classifier.name));
    const ranked = [];
    for (const relationship of relationships) {
        if (relationship.form !== "inheritance" && relationship.form !== "implementation")
            continue;
        const subtype = index.get(relationship.from);
        const supertype = index.get(relationship.to);
        if (subtype === undefined || supertype === undefined)
            continue;
        // Supertypes sit above subtypes, so the ranked edge runs supertype -> subtype.
        ranked.push({ from: supertype, to: subtype });
    }
    const rank = rankByLongestPath(classifiers.length, ranked);
    const sizes = classifiers.map((classifier) => classSize(classifier, theme));
    const ranks = [...new Set(rank)].sort((left, right) => left - right);
    const rows = ranks.map((value) => classifiers
        .map((classifier, position) => ({ classifier, position }))
        .filter(({ position }) => rank[position] === value));
    const rowHeights = rows.map((row) => row.reduce((tallest, { position }) => Math.max(tallest, sizes[position]?.height ?? 0), 0));
    const rowWidths = rows.map((row) => row.reduce((total, { position }, positionInRow) => total + (positionInRow === 0 ? 0 : tokens.columnGapPx) + (sizes[position]?.width ?? 0), 0));
    const contentWidth = rowWidths.length === 0 ? 0 : Math.max(...rowWidths);
    const width = contentWidth + 2 * MARGIN_PX;
    const placed = [];
    const rankBands = { tops: [], bottoms: [] };
    let cursorY = MARGIN_PX;
    rows.forEach((row, rowIndex) => {
        const rowHeight = rowHeights[rowIndex] ?? 0;
        bandTopsPush(rankBands, cursorY, rowHeight);
        let cursorX = MARGIN_PX + (contentWidth - (rowWidths[rowIndex] ?? 0)) / 2;
        for (const { position } of row) {
            const size = sizes[position];
            const classifier = classifiers[position];
            if (size === undefined || classifier === undefined)
                continue;
            placed.push({
                classifier,
                rank: ranks[rowIndex] ?? 0,
                x: cursorX,
                y: cursorY + (rowHeight - size.height) / 2,
                width: size.width,
                height: size.height,
            });
            cursorX += size.width + tokens.columnGapPx;
        }
        cursorY += rowHeight + tokens.rankGapPx;
    });
    const height = (rows.length === 0 ? MARGIN_PX : cursorY - tokens.rankGapPx) + MARGIN_PX;
    for (const box of placed) {
        const growth = classGrowth(box.classifier, theme);
        addNestedBox(sink, {
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height,
            cornerRadiusPx: tokens.boxCornerRadiusPx,
            headerHeightPx: growth.headerHeight,
            dividerYs: [growth.headerHeight, growth.headerHeight + growth.attributesHeight],
            role: "class",
            headerRole: box.classifier.kind === "interface" ? "class-header-interface" : "class-header",
            dividerRole: "class-divider",
        });
        let lineY = box.y + tokens.paddingYPx;
        if (box.classifier.kind === "interface") {
            addText(sink, {
                x: clampX(box.x + box.width / 2, measureText(INTERFACE_STEREOTYPE, typography.captionFontSizePx), "middle", width),
                y: lineY + typography.captionLineHeightPx / 2,
                text: INTERFACE_STEREOTYPE,
                anchor: "middle",
                role: CLASS_STEREOTYPE_ROLE,
                ariaHidden: false,
            });
            lineY += typography.captionLineHeightPx;
        }
        const nameLines = wrapText(box.classifier.name, tokens.wrapWidthPx, typography.labelFontSizePx);
        pushLines(sink, nameLines, box.x + box.width / 2, lineY, typography.labelLineHeightPx, "middle", box.classifier.abstract === true ? CLASS_ABSTRACT_NAME_ROLE : CLASS_NAME_ROLE, width, typography.labelFontSizePx);
        lineY += nameLines.length * typography.labelLineHeightPx;
        if (box.classifier.label !== undefined) {
            pushLines(sink, wrapText(box.classifier.label, tokens.wrapWidthPx, typography.captionFontSizePx), box.x + box.width / 2, lineY, typography.captionLineHeightPx, "middle", CLASS_LABEL_ROLE, width, typography.captionFontSizePx);
        }
        let memberY = box.y + growth.headerHeight;
        for (const attribute of box.classifier.attributes ?? []) {
            memberY = emitClassMember(sink, memberY, box, width, classAttributeText(attribute), attribute.visibility, attribute.static, theme);
        }
        memberY = box.y + growth.headerHeight + growth.attributesHeight;
        for (const operation of box.classifier.operations) {
            memberY = emitClassMember(sink, memberY, box, width, classOperationText(operation), operation.visibility, operation.static, theme);
        }
    }
    const placedLabels = [];
    const relationshipOffsets = parallelOffsets(relationships.map((relationship) => `${relationship.from}|${relationship.to}`));
    relationships.forEach((relationship, position) => {
        const from = placed.find((box) => box.classifier.name === relationship.from);
        const to = placed.find((box) => box.classifier.name === relationship.to);
        if (from === undefined || to === undefined)
            return;
        const form = CLASS_FORMS[relationship.form];
        const points = relationship.from === relationship.to
            ? routeSelfLoop(from, width, typography.memberLineHeightPx)
            : routeThroughBands(from, to, rankBands, width, height, relationshipOffsets[position] ?? 0);
        addPath(sink, {
            points,
            closed: false,
            marker: form.marker,
            markerEnd: form.markerEnd,
            markerSizePx: tokens.diamondSizePx,
            markerKind: form.markerKind,
            dashed: form.dashed,
            role: classRelationshipRole(relationship.form),
        });
        const markerOffset = typography.markerLineHeightPx / 2 + 2;
        const ends = [
            { cardinality: relationship.fromMultiplicity, fraction: 0.15 },
            { cardinality: relationship.toMultiplicity, fraction: 0.85 },
        ];
        for (const { cardinality, fraction } of ends) {
            if (cardinality === undefined)
                continue;
            const at = routeAnchor(points, fraction, markerOffset);
            pushLines(sink, [cardinalityDisplay(cardinality)], at.x, at.y - typography.markerLineHeightPx / 2, typography.markerLineHeightPx, at.anchor, CLASS_MULTIPLICITY_ROLE, width, typography.markerFontSizePx);
        }
        if (relationship.label === undefined)
            return;
        const lines = wrapText(relationship.label, edgeWrapWidth(contentWidth, tokens.wrapWidthPx), typography.captionFontSizePx);
        const at = freeLabelAnchor(points, -markerOffset, widestLine(lines, typography.captionFontSizePx), lines.length * typography.captionLineHeightPx, placed, placedLabels);
        pushLines(sink, lines, at.x, at.y - (lines.length * typography.captionLineHeightPx) / 2, typography.captionLineHeightPx, at.anchor, CLASS_RELATIONSHIP_LABEL_ROLE, width, typography.captionFontSizePx);
    });
    return freezeLayout("class", sink, width, height);
}
/** Effective width left for a member line once its visibility marker is placed. */
function memberWrapWidth(text, visibility, theme) {
    const tokens = theme.models;
    const typography = modelsLabelTypography(theme);
    const markerText = visibility === undefined ? "" : VISIBILITY_DISPLAY[visibility];
    const markerWidth = markerText === "" ? 0 : measureText(markerText, typography.memberFontSizePx) + 4;
    return {
        markerText,
        markerWidth,
        lines: wrapText(text, Math.max(tokens.wrapWidthPx - markerWidth, typography.memberFontSizePx * 4), typography.memberFontSizePx),
    };
}
/** One attribute or operation line, with its visibility marker, returning the next top. */
function emitClassMember(sink, top, box, canvasWidth, text, visibility, isStatic, theme) {
    const tokens = theme.models;
    const typography = modelsLabelTypography(theme);
    const { markerText, markerWidth, lines } = memberWrapWidth(text, visibility, theme);
    if (markerText !== "") {
        addText(sink, {
            x: clampX(box.x + tokens.paddingXPx, measureText(markerText, typography.memberFontSizePx), "start", canvasWidth),
            y: top + typography.memberLineHeightPx / 2,
            text: markerText,
            anchor: "start",
            role: CLASS_VISIBILITY_ROLE,
            ariaHidden: false,
        });
    }
    pushLines(sink, lines, box.x + tokens.paddingXPx + markerWidth, top, typography.memberLineHeightPx, "start", isStatic ? CLASS_STATIC_MEMBER_ROLE : CLASS_MEMBER_ROLE, canvasWidth, typography.memberFontSizePx);
    return top + lines.length * typography.memberLineHeightPx;
}
function classAttributeText(attribute) {
    return `${attribute.name}${attribute.type === undefined ? "" : `: ${attribute.type}`}`;
}
/** Parentheses are always emitted, even for an unspecified parameter list. */
function classOperationText(operation) {
    const parameters = (operation.parameters ?? [])
        .map((parameter) => parameter.type === undefined ? parameter.name : `${parameter.name}: ${parameter.type}`)
        .join(", ");
    const returns = operation.returnType === undefined ? "" : `: ${operation.returnType}`;
    return `${operation.name}(${parameters})${returns}`;
}
/** Section bands at their real (wrapped) height; an empty section keeps one line. */
function classGrowth(classifier, theme) {
    const tokens = theme.models;
    const typography = modelsLabelTypography(theme);
    const attributeLines = (classifier.attributes ?? []).reduce((total, attribute) => total + memberWrapWidth(classAttributeText(attribute), attribute.visibility, theme).lines.length, 0);
    const operationLines = classifier.operations.reduce((total, operation) => total + memberWrapWidth(classOperationText(operation), operation.visibility, theme).lines.length, 0);
    const nameLines = wrapText(classifier.name, tokens.wrapWidthPx, typography.labelFontSizePx).length;
    const labelLines = classifier.label === undefined
        ? 0
        : wrapText(classifier.label, tokens.wrapWidthPx, typography.captionFontSizePx).length;
    const headerLines = nameLines + labelLines + (classifier.kind === "interface" ? 1 : 0);
    return {
        headerHeight: headerLines * typography.labelLineHeightPx + 2 * tokens.paddingYPx,
        attributesHeight: Math.max(attributeLines, MIN_SECTION_LINES) * typography.memberLineHeightPx,
        operationsHeight: Math.max(operationLines, MIN_SECTION_LINES) * typography.memberLineHeightPx,
    };
}
function classSize(classifier, theme) {
    const tokens = theme.models;
    const typography = modelsLabelTypography(theme);
    const growth = classGrowth(classifier, theme);
    const lines = headerLines(classifier.name, classifier.label, theme, CLASS_NAME_ROLE, CLASS_LABEL_ROLE);
    const stereotypeWidth = classifier.kind === "interface" ? measureText(INTERFACE_STEREOTYPE, typography.captionFontSizePx) : 0;
    const memberWidth = [
        ...(classifier.attributes ?? []).map((attribute) => memberWrapWidth(classAttributeText(attribute), attribute.visibility, theme)),
        ...classifier.operations.map((operation) => memberWrapWidth(classOperationText(operation), operation.visibility, theme)),
    ].reduce((widest, member) => Math.max(widest, member.markerWidth + widestLine(member.lines, typography.memberFontSizePx)), 0);
    return {
        width: Math.max(widestHeaderLine(lines), stereotypeWidth, memberWidth) +
            2 * tokens.paddingXPx,
        height: growth.headerHeight + growth.attributesHeight + growth.operationsHeight,
    };
}
//# sourceMappingURL=models-layout.js.map