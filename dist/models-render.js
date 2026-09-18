/**
 * Native software- and data-model emitter (contract: issue #61 §11).
 *
 * One project-owned SVG emitter over the four layout projections: quantized
 * 3-decimal coordinates, positional ids and an intrinsic finite positive
 * viewBox. Layout is total, so every valid Block renders; the extent guard
 * here is the family's own ceiling, and exceeding it fails the render job
 * rather than fabricating a Source diagnostic.
 *
 * Accessibility is structural, not decorative: every authored string is a
 * real `<text>` in reading order (timeline order for `sequence`, declaration
 * order otherwise), every text node carries the `aze-models-label` contract
 * and a role name, and every shape — lifelines, arrowheads, diamonds, dots,
 * activation bars and frames — is `aria-hidden` decoration. `<desc>` restates
 * the counts by item kind and, for `sequence`, the ordered timeline, so a
 * reader who cannot see the pixels still gets the model.
 *
 * The fragment carries no presentation attributes and no inline styles:
 * colour, stroke width, dash pattern and font size all come from the per-kind
 * CSS in `render-html.ts`, which derives its typography from the same
 * `modelsLabelTypography` the layout measured with. Zero scripts, zero event
 * attributes, zero external references; ids are positional, so two Blocks
 * with the same authored names cannot collide in one Document.
 */
import { advanceMetricDependencyClosure } from "./advance-metric.js";
import { cardinalityDisplay } from "./models.js";
import { MODELS_LAYOUT_VERSION, MODELS_WRAP_VERSION, layoutClass, layoutEntity, layoutSequence, layoutState, transitionLabelText, } from "./models-layout.js";
import { escapeXml, quantize } from "./plot.js";
import { defaultTheme } from "./theme.js";
export const MODELS_EMITTER_VERSION = "1.0.0";
export const MODELS_HTML_BLOCK_RENDERER_VERSION = "1.0.0";
export const SEQUENCE_HTML_BLOCK_RENDERER_ID = "azeforge.sequence.html/v1";
export const STATE_HTML_BLOCK_RENDERER_ID = "azeforge.state.html/v1";
export const ENTITY_HTML_BLOCK_RENDERER_ID = "azeforge.entity.html/v1";
export const CLASS_HTML_BLOCK_RENDERER_ID = "azeforge.class.html/v1";
/** Per-Block pixel ceiling: above it the render job fails, naming the size. */
export const MODELS_MAX_WIDTH_PX = 4096;
export const MODELS_MAX_HEIGHT_PX = 16384;
/** The projection quantizes every coordinate through `quantize`, i.e. 3 decimals. */
const QUANTIZATION_DECIMALS = 3;
/** Characters one `<desc>` may spend, timeline summaries included. */
const DESC_LIMIT = 2000;
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const ARROW_HALF_WIDTH_RATIO = 0.5;
const DIAMOND_LENGTH_RATIO = 2;
const DIAMOND_HALF_WIDTH_RATIO = 0.5;
/** Figure id prefix: `aze-seq-0`, `aze-state-1`, ... — positional, never authored. */
const ID_PREFIX = Object.freeze({
    sequence: "seq",
    state: "state",
    entity: "entity",
    class: "class",
});
/** The word each kind's figure is named with in `<title>` and in refusals. */
const KIND_TITLE = Object.freeze({
    sequence: "Sequence",
    state: "State machine",
    entity: "Entity diagram",
    class: "Class diagram",
});
/** Fail-closed emitter fault. The caller publishes no Artifact. */
export class ModelsRenderError extends Error {
    code = "azeforge.renderer#models-render";
    remedy = "Re-check the model declaration list; a renderer failure publishes no Artifact.";
    constructor(message) {
        super(message);
        this.name = "ModelsRenderError";
    }
}
function assertExtent(layout) {
    const width = layout.widthPx;
    const height = layout.heightPx;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        throw new ModelsRenderError(`The ${layout.kind} figure has no positive finite extent (${quantize(width)} × ${quantize(height)} px).`);
    }
    if (width > MODELS_MAX_WIDTH_PX || height > MODELS_MAX_HEIGHT_PX) {
        throw new ModelsRenderError(`The ${layout.kind} figure is ${quantize(width)} × ${quantize(height)} px, over the ` +
            `${quantize(MODELS_MAX_WIDTH_PX)} × ${quantize(MODELS_MAX_HEIGHT_PX)} px ceiling.`);
    }
}
/* ------------------------------------------------------------------ *
 * The frozen class vocabulary
 *
 * The layout declares a semantic role and a marker kind; this is the only
 * place that knows what those are called in CSS. One closed table keeps the
 * emitted vocabulary stable while the projection stays geometry-only.
 * ------------------------------------------------------------------ */
const ROLE_CLASS = Object.freeze({
    participant: "aze-models-box aze-sequence-participant",
    "participant-name": "aze-models-label aze-sequence-participant-name aze-participant-label",
    "participant-label": "aze-models-label aze-models-caption aze-sequence-participant-label aze-participant-label",
    "actor-head": "aze-sequence-actor aze-sequence-actor-head",
    "actor-limb": "aze-sequence-actor aze-sequence-actor-limb",
    lifeline: "aze-sequence-lifeline",
    activation: "aze-sequence-activation",
    "message-sync": "aze-sequence-message aze-sequence-message-sync",
    "message-async": "aze-sequence-message aze-sequence-message-async",
    "message-return": "aze-sequence-message aze-sequence-message-return",
    "self-message-sync": "aze-sequence-message aze-sequence-message-sync aze-sequence-self-message",
    "self-message-async": "aze-sequence-message aze-sequence-message-async aze-sequence-self-message",
    "self-message-return": "aze-sequence-message aze-sequence-message-return aze-sequence-self-message",
    "message-label": "aze-models-label aze-sequence-message-label aze-lifeline-label",
    note: "aze-sequence-note",
    "note-label": "aze-models-label aze-sequence-note-text aze-note-label",
    fragment: "aze-sequence-fragment",
    "fragment-tab": "aze-sequence-fragment-tab",
    "fragment-division": "aze-sequence-fragment-division",
    "fragment-label": "aze-models-label aze-models-caption aze-sequence-fragment-label aze-fragment-label",
    "fragment-condition": "aze-models-label aze-sequence-fragment-condition aze-fragment-label",
    state: "aze-models-box aze-state-shape",
    "state-name": "aze-models-label aze-state-name aze-state-label",
    "state-label": "aze-models-label aze-models-caption aze-state-label",
    composite: "aze-models-box aze-state-shape aze-state-composite",
    "composite-title": "aze-models-header aze-state-composite-title",
    "state-divider": "aze-models-divider aze-state-divider",
    initial: "aze-state-initial",
    final: "aze-state-final",
    "final-inner": "aze-state-final-inner",
    transition: "aze-state-transition",
    "transition-label": "aze-models-label aze-models-member aze-state-transition-label aze-transition-label",
    entity: "aze-models-box aze-entity-box",
    "entity-header": "aze-models-header aze-entity-header",
    "entity-divider": "aze-models-divider aze-entity-divider",
    "entity-name": "aze-models-label aze-entity-name aze-entity-label",
    "entity-label": "aze-models-label aze-models-caption aze-entity-label",
    "entity-attribute": "aze-models-label aze-models-member aze-entity-attribute aze-attribute-label",
    "entity-optional": "aze-models-label aze-models-member aze-entity-attribute aze-entity-optional aze-attribute-label",
    "entity-key": "aze-models-label aze-models-marker aze-entity-key aze-attribute-label",
    "entity-relationship": "aze-entity-relationship",
    "entity-cardinality": "aze-models-label aze-models-marker aze-entity-cardinality aze-cardinality-label",
    "entity-role": "aze-models-label aze-models-marker aze-entity-role aze-role-label",
    "entity-relationship-label": "aze-models-label aze-models-caption aze-entity-relationship-label aze-relationship-label",
    class: "aze-models-box aze-class-box",
    "class-header": "aze-models-header aze-class-header",
    "class-header-interface": "aze-models-header aze-class-header aze-class-header-interface",
    "class-divider": "aze-models-divider aze-class-divider",
    "class-name": "aze-models-label aze-class-name aze-class-label",
    "class-abstract-name": "aze-models-label aze-class-name aze-class-label aze-class-abstract",
    "class-label": "aze-models-label aze-models-caption aze-class-label",
    "class-stereotype": "aze-models-label aze-models-caption aze-class-stereotype aze-class-label",
    "class-member": "aze-models-label aze-models-member aze-class-member aze-member-label",
    "class-static-member": "aze-models-label aze-models-member aze-class-member aze-member-label aze-class-marker aze-class-static",
    "class-visibility": "aze-models-label aze-models-member aze-class-visibility aze-class-marker aze-member-label",
    "class-multiplicity": "aze-models-label aze-models-marker aze-class-multiplicity aze-multiplicity-label",
    "class-relationship-label": "aze-models-label aze-models-caption aze-class-relationship-label aze-relationship-label",
    "class-relationship-inheritance": "aze-class-relationship aze-class-relationship-inheritance",
    "class-relationship-implementation": "aze-class-relationship aze-class-relationship-implementation",
    "class-relationship-association": "aze-class-relationship aze-class-relationship-association",
    "class-relationship-aggregation": "aze-class-relationship aze-class-relationship-aggregation",
    "class-relationship-composition": "aze-class-relationship aze-class-relationship-composition",
});
/** The arrow class of the role that drew it; the family is the role's. */
const ARROW_ROLE_CLASS = Object.freeze({
    "message-sync": "aze-sequence-arrow aze-sequence-arrow-sync",
    "message-async": "aze-sequence-arrow aze-sequence-arrow-async",
    "message-return": "aze-sequence-arrow aze-sequence-arrow-return",
    "self-message-sync": "aze-sequence-arrow aze-sequence-arrow-sync",
    "self-message-async": "aze-sequence-arrow aze-sequence-arrow-async",
    "self-message-return": "aze-sequence-arrow aze-sequence-arrow-return",
    transition: "aze-state-arrow",
});
/** Every marker shape except the arrow, whose class depends on its role. */
const MARKER_CLASS = Object.freeze({
    none: "",
    triangle: "aze-class-arrow aze-class-arrow-hollow",
    "diamond-hollow": "aze-class-diamond aze-class-diamond-hollow",
    "diamond-filled": "aze-class-diamond aze-class-diamond-filled",
});
function markerClass(path) {
    return path.markerKind === "arrow"
        ? ARROW_ROLE_CLASS[path.role] ?? ""
        : MARKER_CLASS[path.markerKind];
}
/* ------------------------------------------------------------------ *
 * Primitives
 * ------------------------------------------------------------------ */
function emitBox(box) {
    const radius = box.cornerRadiusPx > 0
        ? ` rx="${quantize(box.cornerRadiusPx)}" ry="${quantize(box.cornerRadiusPx)}"`
        : "";
    return (`<rect class="${ROLE_CLASS[box.role]}" x="${quantize(box.x)}" y="${quantize(box.y)}"` +
        ` width="${quantize(box.width)}" height="${quantize(box.height)}"${radius}` +
        ` aria-hidden="true"/>`);
}
function emitNestedBox(box) {
    const radius = box.cornerRadiusPx > 0
        ? ` rx="${quantize(box.cornerRadiusPx)}" ry="${quantize(box.cornerRadiusPx)}"`
        : "";
    const dividers = box.dividerYs
        .map((offset) => `<line class="${ROLE_CLASS[box.dividerRole]}" x1="${quantize(box.x)}" y1="${quantize(box.y + offset)}"` +
        ` x2="${quantize(box.x + box.width)}" y2="${quantize(box.y + offset)}" aria-hidden="true"/>`)
        .join("");
    return (`<rect class="${ROLE_CLASS[box.role]}" x="${quantize(box.x)}" y="${quantize(box.y)}"` +
        ` width="${quantize(box.width)}" height="${quantize(box.height)}"${radius}` +
        ` aria-hidden="true"/>` +
        `<rect class="${ROLE_CLASS[box.headerRole]}" x="${quantize(box.x)}" y="${quantize(box.y)}"` +
        ` width="${quantize(box.width)}" height="${quantize(box.headerHeightPx)}"${radius}` +
        ` aria-hidden="true"/>` +
        dividers);
}
function emitCircle(circle) {
    const outer = `<circle class="${ROLE_CLASS[circle.role]}" cx="${quantize(circle.cx)}" cy="${quantize(circle.cy)}"` +
        ` r="${quantize(circle.radiusPx)}" aria-hidden="true"/>`;
    if (circle.innerRadiusPx <= 0 || circle.innerRole === undefined)
        return outer;
    return (outer +
        `<circle class="${ROLE_CLASS[circle.innerRole]}" cx="${quantize(circle.cx)}" cy="${quantize(circle.cy)}"` +
        ` r="${quantize(circle.innerRadiusPx)}" aria-hidden="true"/>`);
}
function emitBar(bar) {
    return (`<rect class="${ROLE_CLASS[bar.role]}" x="${quantize(bar.x)}" y="${quantize(bar.y)}"` +
        ` width="${quantize(bar.width)}" height="${quantize(bar.height)}" aria-hidden="true"/>`);
}
function emitNote(note) {
    const points = note.points
        .map((entry) => `${quantize(entry.x)},${quantize(entry.y)}`)
        .join(" ");
    return `<polygon class="${ROLE_CLASS[note.role]}" points="${points}" aria-hidden="true"/>`;
}
function emitFragment(fragment) {
    const divisions = fragment.divisionYs
        .map((y) => `<line class="${ROLE_CLASS[fragment.divisionRole]}" x1="${quantize(fragment.x)}" y1="${quantize(y)}"` +
        ` x2="${quantize(fragment.x + fragment.width)}" y2="${quantize(y)}" aria-hidden="true"/>`)
        .join("");
    return (`<rect class="${ROLE_CLASS[fragment.role]}" x="${quantize(fragment.x)}" y="${quantize(fragment.y)}"` +
        ` width="${quantize(fragment.width)}" height="${quantize(fragment.height)}" aria-hidden="true"/>` +
        `<rect class="${ROLE_CLASS[fragment.tabRole]}" x="${quantize(fragment.x)}" y="${quantize(fragment.y)}"` +
        ` width="${quantize(fragment.tabWidthPx)}" height="${quantize(fragment.tabHeightPx)}"` +
        ` aria-hidden="true"/>` +
        divisions);
}
/**
 * The arrowhead or diamond decorating one end of a route. Marker geometry is
 * derived from the route's own last segment, so the emitter never re-derives
 * a coordinate the layout owns.
 */
function emitMarker(path) {
    if (path.marker === "none" || path.points.length < 2)
        return "";
    const atEnd = path.markerEnd === "end";
    const tip = atEnd ? path.points[path.points.length - 1] : path.points[0];
    const previous = atEnd ? path.points[path.points.length - 2] : path.points[1];
    if (tip === undefined || previous === undefined)
        return "";
    const deltaX = tip.x - previous.x;
    const deltaY = tip.y - previous.y;
    const distance = Math.hypot(deltaX, deltaY);
    if (distance === 0)
        return "";
    const unitX = deltaX / distance;
    const unitY = deltaY / distance;
    const perpendicularX = -unitY;
    const perpendicularY = unitX;
    const size = path.markerSizePx;
    if (path.marker === "arrow") {
        const half = size * ARROW_HALF_WIDTH_RATIO;
        const baseX = tip.x - unitX * size;
        const baseY = tip.y - unitY * size;
        return (`<path class="${markerClass(path)}" d="M${quantize(tip.x)} ${quantize(tip.y)}` +
            `L${quantize(baseX + perpendicularX * half)} ${quantize(baseY + perpendicularY * half)}` +
            `L${quantize(baseX - perpendicularX * half)} ${quantize(baseY - perpendicularY * half)}Z"` +
            ` aria-hidden="true"/>`);
    }
    const halfLength = (size * DIAMOND_LENGTH_RATIO) / 2;
    const halfWidth = size * DIAMOND_HALF_WIDTH_RATIO;
    const middleX = tip.x - unitX * halfLength;
    const middleY = tip.y - unitY * halfLength;
    const backX = tip.x - unitX * halfLength * 2;
    const backY = tip.y - unitY * halfLength * 2;
    return (`<path class="${markerClass(path)}" d="M${quantize(tip.x)} ${quantize(tip.y)}` +
        `L${quantize(middleX + perpendicularX * halfWidth)} ${quantize(middleY + perpendicularY * halfWidth)}` +
        `L${quantize(backX)} ${quantize(backY)}` +
        `L${quantize(middleX - perpendicularX * halfWidth)} ${quantize(middleY - perpendicularY * halfWidth)}Z"` +
        ` aria-hidden="true"/>`);
}
function emitPath(path) {
    const first = path.points[0];
    if (first === undefined)
        return "";
    const data = path.points
        .map((entry, index) => `${index === 0 ? "M" : "L"}${quantize(entry.x)} ${quantize(entry.y)}`)
        .join("");
    return (`<path class="${ROLE_CLASS[path.role]}" d="${data}${path.closed ? "Z" : ""}" aria-hidden="true"/>` +
        emitMarker(path));
}
function emitText(text) {
    return (`<text class="${ROLE_CLASS[text.role]}" x="${quantize(text.x)}" y="${quantize(text.y)}"` +
        ` text-anchor="${text.anchor}"${text.ariaHidden ? ' aria-hidden="true"' : ""}>` +
        `${escapeXml(text.text)}</text>`);
}
function emitGroup(className, inner) {
    return inner === "" ? "" : `<g class="${className}" aria-hidden="true">${inner}</g>`;
}
/* ------------------------------------------------------------------ *
 * Accessible descriptions
 *
 * `<desc>` restates what the pixels carry: the counts by item kind, the
 * entities of the model in authored order, and for `sequence` the ordered
 * timeline. One character budget bounds every description, so a large model
 * cannot inflate the Artifact with its own summary.
 * ------------------------------------------------------------------ */
/** Truncate on code-point boundaries: a lone surrogate is not valid XML. */
function truncateDescription(text) {
    if (text.length <= DESC_LIMIT)
        return text;
    return Array.from(text).slice(0, DESC_LIMIT).join("");
}
function describeSequence(block) {
    const timeline = [];
    let messages = 0;
    let notes = 0;
    let altDivisions = 0;
    let loops = 0;
    const walk = (items) => {
        for (const item of items) {
            if (item.kind === "message") {
                messages += 1;
                timeline.push(`${timeline.length + 1}. ${item.from} → ${item.to}${item.text === undefined ? "" : `: ${item.text}`}`);
                continue;
            }
            if (item.kind === "note") {
                notes += 1;
                timeline.push(`${timeline.length + 1}. note over ${item.over.join(", ")}: ${item.text}`);
                continue;
            }
            if (item.kind === "loop") {
                loops += 1;
                timeline.push(`${timeline.length + 1}. loop${item.condition === undefined ? "" : ` [${item.condition}]`}`);
                walk(item.body);
                continue;
            }
            for (const division of item.divisions) {
                altDivisions += 1;
                timeline.push(`${timeline.length + 1}. alt${division.condition === undefined ? "" : ` [${division.condition}]`}`);
                walk(division.body);
            }
        }
    };
    walk(block.timeline);
    const actors = block.participants.filter((participant) => participant.kind === "actor").length;
    const parts = [
        `Sequence diagram: ${block.participants.length} participants (${actors} actors), ` +
            `${messages} messages, ${notes} notes, ${altDivisions} alt divisions, ` +
            `${loops} loop fragments.`,
    ];
    if (block.participants.length > 0) {
        parts.push(`Lanes in order: ${block.participants
            .map((participant) => participant.label === undefined
            ? participant.name
            : `${participant.name} (${participant.label})`)
            .join("; ")}.`);
    }
    if (timeline.length > 0)
        parts.push(`Timeline in order: ${timeline.join("; ")}.`);
    return describeWith(block.description, parts);
}
function describeState(block) {
    const states = [];
    const transitions = [];
    let composites = 0;
    let initial = 0;
    let final = 0;
    const walk = (items) => {
        for (const item of items) {
            if (item.kind === "transition") {
                const words = transitionLabelText(item);
                transitions.push(`${item.from} → ${item.to}${words === "" ? "" : ` (${words})`}`);
                continue;
            }
            if (item.kind === "state") {
                composites += 1;
                states.push(`${item.name}${item.label === undefined ? "" : `: ${item.label}`}`);
                walk(item.states);
                continue;
            }
            // A pseudo-state renders as a dot or a bullseye; its name exists only so
            // transitions can reference it and never reaches output.
            if (item.kind === "initial")
                initial += 1;
            else
                final += 1;
        }
    };
    walk(block.items);
    const parts = [
        `State machine: ${states.length} states (${composites} composite), ${initial} initial, ` +
            `${final} final, ${transitions.length} transitions.`,
    ];
    if (states.length > 0)
        parts.push(`States in authored order: ${states.join("; ")}.`);
    if (transitions.length > 0) {
        parts.push(`Transitions in authored order: ${transitions.join("; ")}.`);
    }
    return describeWith(block.description, parts);
}
function describeEntity(block) {
    const entities = block.items.filter((item) => item.kind === "entity");
    const relationships = block.items.filter((item) => item.kind === "relationship");
    const attributeCount = entities.reduce((total, entity) => total + (entity.attributes?.length ?? 0), 0);
    const parts = [
        `Entity diagram: ${entities.length} entities, ${attributeCount} attributes, ` +
            `${relationships.length} relationships.`,
    ];
    if (entities.length > 0) {
        parts.push(`Entities in authored order: ${entities
            .map((entity) => entity.label === undefined ? entity.name : `${entity.name} (${entity.label})`)
            .join("; ")}.`);
    }
    if (relationships.length > 0) {
        parts.push(`Relationships in authored order: ${relationships
            .map((relationship) => `${relationship.first.entity} ${cardinalityDisplay(relationship.first.cardinality)}` +
            `${relationship.first.role === undefined ? "" : ` as ${relationship.first.role}`}` +
            ` → ${relationship.second.entity} ${cardinalityDisplay(relationship.second.cardinality)}` +
            `${relationship.second.role === undefined ? "" : ` as ${relationship.second.role}`}` +
            `${relationship.label === undefined ? "" : ` (${relationship.label})`}`)
            .join("; ")}.`);
    }
    return describeWith(block.description, parts);
}
function describeClass(block) {
    const classifiers = block.items.filter((item) => item.kind === "class");
    const relationships = block.items.filter((item) => item.kind === "relationship");
    const interfaces = classifiers.filter((classifier) => classifier.kind === "interface").length;
    const attributes = classifiers.reduce((total, classifier) => total + (classifier.attributes?.length ?? 0), 0);
    const operations = classifiers.reduce((total, classifier) => total + classifier.operations.length, 0);
    const parts = [
        `Class diagram: ${classifiers.length} classifiers (${interfaces} interfaces), ` +
            `${attributes} attributes, ${operations} operations, ${relationships.length} relationships.`,
    ];
    if (classifiers.length > 0) {
        parts.push(`Classifiers in authored order: ${classifiers
            .map((classifier) => {
            const stereotype = classifier.kind === "interface" ? "interface" : "class";
            const abstract = classifier.abstract === true ? ", abstract" : "";
            const label = classifier.label === undefined ? "" : ` (${classifier.label})`;
            return `${classifier.name} [${stereotype}${abstract}]${label}`;
        })
            .join("; ")}.`);
    }
    if (relationships.length > 0) {
        parts.push(`Relationships in authored order: ${relationships
            .map((relationship) => `${relationship.from} ${relationship.fromMultiplicity ?? ""} → ${relationship.to} ` +
            `${relationship.toMultiplicity ?? ""} (${relationship.form})` +
            `${relationship.label === undefined ? "" : ` ${relationship.label}`}`)
            .join("; ")}.`);
    }
    return describeWith(block.description, parts);
}
function describeWith(authored, parts) {
    const pieces = [];
    if (authored !== undefined && authored !== "")
        pieces.push(`${authored}.`);
    pieces.push(...parts);
    return truncateDescription(pieces.join(" "));
}
/**
 * One Block: a figure whose svg is the whole picture — decoration groups
 * first so text always paints last and reads in authored order, a positional
 * figure id, and the Block's own id as data rather than as an element id.
 */
function emitFigure(layout, meta) {
    assertExtent(layout);
    const base = `aze-${ID_PREFIX[meta.kind]}-${quantize(meta.ordinal)}`;
    const kind = meta.kind;
    const authoredTitle = meta.title ?? "";
    const title = authoredTitle === ""
        ? `${KIND_TITLE[kind]} ${meta.id ?? quantize(meta.ordinal)}`
        : authoredTitle;
    const idAttribute = meta.id === undefined ? "" : ` data-${kind}-id="${escapeXml(meta.id)}"`;
    const numberAttribute = meta.number === true ? ` data-${kind}-number="true"` : "";
    const shapes = [
        emitGroup(`aze-${kind}-fragments`, layout.fragments.map(emitFragment).join("")),
        emitGroup(`aze-${kind}-notes`, layout.notes.map(emitNote).join("")),
        emitGroup(`aze-${kind}-boxes`, layout.nestedBoxes.map(emitNestedBox).join("") + layout.boxes.map(emitBox).join("")),
        emitGroup(`aze-${kind}-paths`, layout.paths.map(emitPath).join("")),
        emitGroup(`aze-${kind}-bars`, layout.bars.map(emitBar).join("")),
        emitGroup(`aze-${kind}-circles`, layout.circles.map(emitCircle).join("")),
    ].join("");
    return (`<figure class="aze-${kind}" id="${base}"${idAttribute}${numberAttribute}>` +
        `<svg xmlns="${SVG_NAMESPACE}" viewBox="0 0 ${quantize(layout.widthPx)} ${quantize(layout.heightPx)}"` +
        ` width="${quantize(layout.widthPx)}" height="${quantize(layout.heightPx)}" role="img"` +
        ` aria-labelledby="${base}-title ${base}-desc">` +
        `<title id="${base}-title">${escapeXml(title)}</title>` +
        `<desc id="${base}-desc">${escapeXml(meta.description)}</desc>` +
        shapes +
        `<g class="aze-${kind}-text">${layout.texts.map(emitText).join("")}</g>` +
        `</svg></figure>`);
}
/* ------------------------------------------------------------------ *
 * Entry points
 * ------------------------------------------------------------------ */
/** The parts of a model Block every figure carries: its own id, number, title. */
function figureParts(block) {
    return {
        ...(block.id === undefined ? {} : { id: block.id }),
        ...(block.number === undefined ? {} : { number: block.number }),
        ...(block.title === undefined ? {} : { title: block.title }),
    };
}
export function renderSequenceFragment(block, context) {
    const layout = layoutSequence(block, context.theme ?? defaultTheme);
    return emitFigure(layout, {
        kind: "sequence",
        ordinal: context.ordinal ?? 0,
        ...figureParts(block),
        description: describeSequence(block),
    });
}
export function renderStateFragment(block, context) {
    const layout = layoutState(block, context.theme ?? defaultTheme);
    return emitFigure(layout, {
        kind: "state",
        ordinal: context.ordinal ?? 0,
        ...figureParts(block),
        description: describeState(block),
    });
}
export function renderEntityFragment(block, context) {
    const layout = layoutEntity(block, context.theme ?? defaultTheme);
    return emitFigure(layout, {
        kind: "entity",
        ordinal: context.ordinal ?? 0,
        ...figureParts(block),
        description: describeEntity(block),
    });
}
export function renderClassFragment(block, context) {
    const layout = layoutClass(block, context.theme ?? defaultTheme);
    return emitFigure(layout, {
        kind: "class",
        ordinal: context.ordinal ?? 0,
        ...figureParts(block),
        description: describeClass(block),
    });
}
/**
 * Fingerprint closure for the rendered-artifact hash (contract §12): the
 * layout language, the wrapping rule, the emitter, the Advance metric and its
 * pinned font sources, and the quantization. Geometry never sees this value:
 * it is a fingerprint of the rules, not of one figure.
 */
export function modelsDependencyClosure() {
    return Object.freeze({
        layout: MODELS_LAYOUT_VERSION,
        wrap: MODELS_WRAP_VERSION,
        emitter: MODELS_EMITTER_VERSION,
        advanceMetric: advanceMetricDependencyClosure(),
        quantization: QUANTIZATION_DECIMALS,
    });
}
/* ------------------------------------------------------------------ *
 * Block renderers
 * ------------------------------------------------------------------ */
function descriptor(id, blockType) {
    return Object.freeze({
        id,
        version: MODELS_HTML_BLOCK_RENDERER_VERSION,
        blockType,
        pluginVersionRange: "1.0.0",
        rendererId: "html",
        rendererVersionRange: "1.0.0",
    });
}
export const sequenceHtmlBlockRenderer = Object.freeze({
    descriptor: descriptor(SEQUENCE_HTML_BLOCK_RENDERER_ID, "sequence"),
    render(block, context) {
        return renderSequenceFragment(block, context);
    },
});
export const stateHtmlBlockRenderer = Object.freeze({
    descriptor: descriptor(STATE_HTML_BLOCK_RENDERER_ID, "state"),
    render(block, context) {
        return renderStateFragment(block, context);
    },
});
export const entityHtmlBlockRenderer = Object.freeze({
    descriptor: descriptor(ENTITY_HTML_BLOCK_RENDERER_ID, "entity"),
    render(block, context) {
        return renderEntityFragment(block, context);
    },
});
export const classHtmlBlockRenderer = Object.freeze({
    descriptor: descriptor(CLASS_HTML_BLOCK_RENDERER_ID, "class"),
    render(block, context) {
        return renderClassFragment(block, context);
    },
});
//# sourceMappingURL=models-render.js.map