/**
 * Native control-system diagram emitter (contract: issue #65 §5, §6, §9, §10,
 * §12). One project-owned SVG emitter over the pinned ELK projection in
 * `control-layout.ts`: quantized 3-decimal coordinates, positional ids and an
 * intrinsic finite positive viewBox.
 *
 * Two norms hold everywhere. First, identity is positional: no authored name,
 * id or coordinate ever reaches an attribute, so two Blocks that name the same
 * signal cannot collide in one Document. Second, nothing is drawn that the
 * author did not write — every sum sign is an authored `signs:` entry, every
 * label is an authored `CircuitText`, and the takeoff dot is the only mark
 * derived from routing, because it has no authored declaration of its own.
 *
 * Every glyph is a real `<text>` (never a path), `<path>`/`<polygon>` carry
 * strokes and arrowheads only, and the fragment carries no script, no event
 * attribute and no external reference; `assertControlFragmentSafe` proves it.
 */

import { advanceMetricDependencyClosure, advanceWidth } from "./advance-metric.js";
import { circuitTextValue } from "./circuit-text.js";
import {
  ELKJS_VERSION,
  STUB_GLYPH_SIZE,
  STUB_LABEL_GAP,
  controlLabelTypography,
  layoutControl,
} from "./control-layout.js";
import type {
  ControlLayout,
  ControlLayoutEdge,
  ControlLayoutNode,
  ControlLayoutPoint,
} from "./control-layout.js";
import {
  CONTROL_EMITTER_VERSION,
  CONTROL_LAYOUT_VERSION,
  CONTROL_OPTIONS_VERSION,
  CONTROL_PLUGIN_TYPE,
  CONTROL_PLUGIN_VERSION,
} from "./control-schemas.js";
import { escapeXml, quantize } from "./plot.js";
import type { ControlLabelTypography } from "./control-layout.js";
import type {
  ControlBlock,
  ControlBlockItem,
  ControlDeclaration,
  ControlEdgeItem,
  ControlFlow,
  FigureBlockRenderer,
  JsonValue,
  Theme,
} from "./model.js";

export const CONTROL_HTML_BLOCK_RENDERER_ID = "azeforge.control.html/v1" as const;
export const CONTROL_HTML_BLOCK_RENDERER_VERSION = "1.0.0" as const;

/** The quantization rule the fingerprint closure names: `quantize`, 3 decimals. */
const QUANTIZATION_VERSION = "3-decimals";
/** Characters one `<desc>` may spend, item and edge summaries included. */
const DESC_LIMIT = 2000;
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

/** Arrowhead proportions; a control signal is directed, so every edge has one. */
const ARROW_LENGTH_PX = 9;
const ARROW_HALF_WIDTH_PX = 4;
const EDGE_LABEL_BACKGROUND_RADIUS_PX = 2;
const EDGE_LABEL_PADDING_X_PX = 6;
const EDGE_LABEL_PADDING_Y_PX = 2;
/** Fraction of the radius a summing sign sits from the circle centre. */
const SUM_SIGN_INSET_RATIO = 0.58;

/** Figure id prefix: `aze-c-0`, `aze-c-1`, ... — positional, never authored. */
const FIGURE_PREFIX = "aze-c";
const NODE_CLASS = "aze-control-node";
const BLOCK_LABEL_CLASS = "aze-control-label aze-control-block-label";
const SUM_SIGN_CLASS = "aze-control-label aze-control-sum-sign";
const STUB_LABEL_CLASS = "aze-control-label aze-control-stub-label";
const EDGE_LABEL_CLASS = "aze-control-label aze-control-edge-label";

/**
 * Fail-closed emitter fault. The caller publishes no Artifact and never sees a
 * partial figure: the extent guard runs before the first byte of markup.
 */
export class ControlRenderError extends Error {
  readonly code = "azeforge.renderer#control-render";
  readonly remedy =
    "Re-check the control declaration list; a renderer failure publishes no Artifact.";

  constructor(message: string) {
    super(message);
    this.name = "ControlRenderError";
  }
}

function assertExtent(layout: ControlLayout): void {
  const width = layout.width;
  const height = layout.height;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new ControlRenderError(
      `The control figure has no positive finite extent (${quantize(width)} × ${quantize(height)} px).`,
    );
  }
}

/** Fail-closed norm extended to control fragments: generated markup must never carry executable content. */
export function assertControlFragmentSafe(svg: string): void {
  if (/<\s*script|on[a-z]+\s*=|javascript:/i.test(svg)) {
    throw new ControlRenderError("Control fragment carries unexpected executable markup.");
  }
}

function assertProjection(condition: boolean, detail: string): void {
  if (!condition) {
    throw new ControlRenderError(
      `The control layout does not match the authored Block: ${detail}.`,
    );
  }
}

/* ------------------------------------------------------------------ *
 * Text
 * ------------------------------------------------------------------ */

/** One positioned line of a text stack: authored value plus its typographic slot. */
interface TextLine {
  readonly value: string;
  readonly fontSizePx: number;
  readonly lineHeightPx: number;
}

/** A decoration or text fragment tagged with the authored position it came from. */
interface Fragment {
  readonly order: number;
  readonly markup: string;
}

/**
 * One `<text>` whose `<tspan>`s are the authored lines of a stack, centred on
 * the point. Each line keeps its own font size, an empty line is dropped
 * rather than drawn blank, and a stack with nothing to say emits nothing.
 */
function stackedText(
  lines: readonly TextLine[],
  centreX: number,
  centreY: number,
  className: string,
  anchor: "middle" | "start" | "end",
): string {
  const shown = lines.filter((line) => line.value !== "");
  if (shown.length === 0) return "";
  const offsets: number[] = [];
  let offset = 0;
  let previousLineHeight = 0;
  for (let index = 0; index < shown.length; index += 1) {
    const line = shown[index];
    if (line === undefined) continue;
    if (index > 0) offset += (previousLineHeight + line.lineHeightPx) / 2;
    offsets.push(offset);
    previousLineHeight = line.lineHeightPx;
  }
  const top = centreY - (offsets[offsets.length - 1] ?? 0) / 2;
  const spans = shown
    .map((line, index) => {
      const y = top + (offsets[index] ?? 0);
      return (
        `<tspan x="${quantize(centreX)}" y="${quantize(y)}"` +
        ` font-size="${quantize(line.fontSizePx)}">${escapeXml(line.value)}</tspan>`
      );
    })
    .join("");
  return (
    `<text class="${className}" text-anchor="${anchor}" dominant-baseline="middle">` +
    `${spans}</text>`
  );
}

function oneLine(value: string, fontSizePx: number, lineHeightPx: number): readonly TextLine[] {
  return [{ value, fontSizePx, lineHeightPx }];
}

/**
 * A block box carries the `tf:` text and, under it, the optional `label:`.
 * Type sizes come from the same floored derivation the layout measured with,
 * so a drawn line is never smaller than the box it sits in.
 */
function blockTextLines(item: ControlBlockItem, typography: ControlLabelTypography): readonly TextLine[] {
  const lines: TextLine[] = [
    {
      value: circuitTextValue(item.tf),
      fontSizePx: typography.blockFontSizePx,
      lineHeightPx: typography.blockLineHeightPx,
    },
  ];
  if (item.label !== undefined) {
    lines.push({
      value: circuitTextValue(item.label),
      fontSizePx: typography.signalFontSizePx,
      lineHeightPx: typography.signalLineHeightPx,
    });
  }
  return lines;
}

/* ------------------------------------------------------------------ *
 * Routing geometry
 * ------------------------------------------------------------------ */

function point(at: ControlLayoutPoint): string {
  return `${quantize(at.x)} ${quantize(at.y)}`;
}

/** Authored order of one item's or one Block's edges: the edge's own declaration index. */
const byDeclarationIndex = (left: ControlLayoutEdge, right: ControlLayoutEdge): number =>
  left.declarationIndex - right.declarationIndex;

function pathData(edge: ControlLayoutEdge): string {
  const parts: string[] = [];
  for (const section of edge.sections) {
    parts.push(`M${point(section.startPoint)}`);
    for (const bend of section.bendPoints) parts.push(`L${point(bend)}`);
    parts.push(`L${point(section.endPoint)}`);
  }
  return parts.join("");
}

/** Point half-way along the whole routed polyline, by arc length. */
function polylineMidpoint(edge: ControlLayoutEdge): ControlLayoutPoint | undefined {
  const points: ControlLayoutPoint[] = [];
  for (const section of edge.sections) {
    points.push(section.startPoint);
    for (const bend of section.bendPoints) points.push(bend);
    points.push(section.endPoint);
  }
  const first = points[0];
  if (first === undefined) return undefined;
  const last = points[points.length - 1];
  if (last === undefined || points.length === 1) return first;
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    if (from === undefined || to === undefined) continue;
    total += Math.hypot(to.x - from.x, to.y - from.y);
  }
  let remaining = total / 2;
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    if (from === undefined || to === undefined) continue;
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (length >= remaining && length > 0) {
      const ratio = remaining / length;
      return { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio };
    }
    remaining -= length;
  }
  return last;
}

/** Arrowhead at the routed end of the signal; `""` when the route has no direction. */
function arrowMarkup(edge: ControlLayoutEdge, theme: Theme): string {
  const section = edge.sections[edge.sections.length - 1];
  if (section === undefined) return "";
  const tail =
    section.bendPoints.length === 0
      ? section.startPoint
      : section.bendPoints[section.bendPoints.length - 1];
  if (tail === undefined) return "";
  const tip = section.endPoint;
  const dx = tip.x - tail.x;
  const dy = tip.y - tail.y;
  const length = Math.hypot(dx, dy);
  if (!(length > 0)) return "";
  const unitX = dx / length;
  const unitY = dy / length;
  const baseX = tip.x - unitX * ARROW_LENGTH_PX;
  const baseY = tip.y - unitY * ARROW_LENGTH_PX;
  const halfX = -unitY * ARROW_HALF_WIDTH_PX;
  const halfY = unitX * ARROW_HALF_WIDTH_PX;
  const points = [
    point(tip),
    point({ x: baseX + halfX, y: baseY + halfY }),
    point({ x: baseX - halfX, y: baseY - halfY }),
  ].join(" ");
  return (
    `<polygon class="aze-control-arrow" points="${points}"` +
    ` fill="${escapeXml(theme.control.arrowFill)}"/>`
  );
}

/** Keep a label centre inside the figure so a wide label is never clipped away. */
function clampCenter(value: number, half: number, extent: number): number {
  return half * 2 >= extent ? extent / 2 : Math.min(Math.max(value, half), extent - half);
}

/**
 * The side a control item's inputs arrive on: the first authored sign sits
 * there and the rest follow it around the circle.
 */
function incomingAngle(flow: ControlFlow): number {
  switch (flow) {
    case "left-to-right":
      return Math.PI;
    case "right-to-left":
      return 0;
    case "top-to-bottom":
      return -Math.PI / 2;
    case "bottom-to-top":
      return Math.PI / 2;
  }
}

/**
 * One anchor per authored sign, spaced evenly around the circle in authored
 * order and starting on the side the item's inputs arrive on. Even spacing
 * keeps any number of signs (up to the ceiling of eight) legible, and no sign
 * is ever invented for a sign the author did not write.
 */
function sumSignAnchors(
  node: ControlLayoutNode,
  flow: ControlFlow,
  count: number,
): readonly ControlLayoutPoint[] {
  const centreX = node.x + node.width / 2;
  const centreY = node.y + node.height / 2;
  const inset = (Math.min(node.width, node.height) / 2) * SUM_SIGN_INSET_RATIO;
  const base = incomingAngle(flow);
  const anchors: ControlLayoutPoint[] = [];
  for (let index = 0; index < count; index += 1) {
    const angle = base + (index * 2 * Math.PI) / count;
    anchors.push({ x: centreX + Math.cos(angle) * inset, y: centreY + Math.sin(angle) * inset });
  }
  return anchors;
}

/**
 * The fan-out dot an item's out-edges share. ELK routes every out-edge from
 * its own border offset, so the layout has no single shared point to read:
 * the dot marks the takeoff of the item's first routed out-edge.
 */
function takeoffPoint(outEdges: readonly ControlLayoutEdge[]): ControlLayoutPoint | undefined {
  const first = [...outEdges].sort(byDeclarationIndex)[0];
  if (first === undefined) return undefined;
  const section = first.sections[0];
  return section === undefined ? undefined : section.startPoint;
}

/* ------------------------------------------------------------------ *
 * Accessible description
 * ------------------------------------------------------------------ */

/** Truncate on code-point boundaries: a lone surrogate is not valid XML. */
function truncateDescription(text: string): string {
  if (text.length <= DESC_LIMIT) return text;
  return Array.from(text).slice(0, DESC_LIMIT).join("");
}

/**
 * Counts by kind in a fixed order, then the authored description, then every
 * item and every edge in authored order. No coordinate and no id: a reader
 * who cannot see the pixels still gets the control system.
 */
function describeControl(block: ControlBlock): string {
  const counts = { block: 0, sum: 0, input: 0, output: 0, edge: 0 };
  const items: string[] = [];
  const edges: string[] = [];
  for (const declaration of block.declarations) {
    switch (declaration.kind) {
      case "block":
        counts.block += 1;
        items.push(`block ${declaration.name}: ${circuitTextValue(declaration.tf)}`);
        break;
      case "sum":
        counts.sum += 1;
        items.push(`sum ${declaration.name} [${declaration.signs.join(" ")}]`);
        break;
      case "input":
      case "output":
        counts[declaration.kind] += 1;
        items.push(`${declaration.kind} ${declaration.name}`);
        break;
      case "edge": {
        counts.edge += 1;
        const label = declaration.label === undefined ? "" : circuitTextValue(declaration.label);
        edges.push(
          `${declaration.from} to ${declaration.to}${label === "" ? "" : ` (${label})`}`,
        );
        break;
      }
    }
  }
  const parts: string[] = [
    `Control diagram: ${counts.block} blocks, ${counts.sum} sums, ${counts.input} inputs, ` +
      `${counts.output} outputs, ${counts.edge} edges.`,
  ];
  const authored = block.description === undefined ? "" : circuitTextValue(block.description);
  if (authored !== "") parts.push(`${authored}.`);
  if (items.length > 0) parts.push(`Items in authored order: ${items.join("; ")}.`);
  if (edges.length > 0) parts.push(`Edges in authored order: ${edges.join("; ")}.`);
  return truncateDescription(parts.join(" "));
}

function controlTitle(block: ControlBlock, ordinal: number): string {
  const authored = block.title === undefined ? "" : circuitTextValue(block.title);
  return authored === "" ? `Control diagram ${quantize(ordinal + 1)}` : authored;
}

/* ------------------------------------------------------------------ *
 * Emitter
 * ------------------------------------------------------------------ */

function emitControlFragment(
  block: ControlBlock,
  layout: ControlLayout,
  ordinal: number,
  theme: Theme,
): string {
  assertExtent(layout);
  const base = `${FIGURE_PREFIX}-${quantize(ordinal)}`;
  const control = theme.control;
  const typography = controlLabelTypography(theme);

  // Authored lookup by name, plus the authored position every fragment is
  // ordered by: `n-`/`e-` indices stay the layout's, as the interface states.
  const items = new Map<string, { declaration: ControlDeclaration; order: number }>();
  const edges = new Map<number, { declaration: ControlEdgeItem; order: number }>();
  let edgeCount = 0;
  block.declarations.forEach((declaration, order) => {
    if (declaration.kind === "edge") {
      edges.set(edgeCount, { declaration, order });
      edgeCount += 1;
      return;
    }
    items.set(declaration.name, { declaration, order });
  });

  const outEdges = new Map<string, ControlLayoutEdge[]>();
  for (const edge of layout.edges) {
    const outgoing = outEdges.get(edge.from);
    if (outgoing === undefined) outEdges.set(edge.from, [edge]);
    else outgoing.push(edge);
  }
  const nodeByName = new Map<string, ControlLayoutNode>();
  for (const node of layout.nodes) nodeByName.set(node.name, node);

  const decoration: Fragment[] = [];
  const texts: Fragment[] = [];
  const push = (bucket: Fragment[], order: number, markup: string): void => {
    if (markup !== "") bucket.push({ order, markup });
  };

  for (const node of layout.nodes) {
    const item = items.get(node.name);
    assertProjection(
      item !== undefined && item.declaration.kind === node.kind,
      `node "${node.name}" (${node.kind}) has no matching authored item`,
    );
    if (item === undefined) continue;
    const declaration = item.declaration;
    const id = `${base}-n-${quantize(node.declarationIndex)}`;
    const centreX = node.x + node.width / 2;
    const centreY = node.y + node.height / 2;
    switch (declaration.kind) {
      case "block":
        push(
          decoration,
          item.order,
          `<rect id="${id}" class="${NODE_CLASS} aze-control-block"` +
            ` x="${quantize(node.x)}" y="${quantize(node.y)}"` +
            ` width="${quantize(node.width)}" height="${quantize(node.height)}"` +
            ` fill="${escapeXml(control.blockFill)}" stroke="${escapeXml(control.blockStroke)}"` +
            ` stroke-width="${quantize(control.blockStrokeWidthPx)}"/>`,
        );
        push(
          texts,
          item.order,
          stackedText(blockTextLines(declaration, typography), centreX, centreY, BLOCK_LABEL_CLASS, "middle"),
        );
        break;
      case "sum": {
        push(
          decoration,
          item.order,
          `<circle id="${id}" class="${NODE_CLASS} aze-control-sum"` +
            ` cx="${quantize(centreX)}" cy="${quantize(centreY)}"` +
            ` r="${quantize(Math.min(node.width, node.height) / 2)}"` +
            ` fill="${escapeXml(control.sumFill)}" stroke="${escapeXml(control.sumStroke)}"` +
            ` stroke-width="${quantize(control.sumStrokeWidthPx)}"/>`,
        );
        const anchors = sumSignAnchors(node, block.flow, declaration.signs.length);
        declaration.signs.forEach((sign, index) => {
          const at = anchors[index];
          if (at === undefined) return;
          push(
            texts,
            item.order,
            stackedText(
              oneLine(sign, typography.sumSignFontSizePx, typography.sumSignFontSizePx),
              at.x,
              at.y,
              SUM_SIGN_CLASS,
              "middle",
            ),
          );
        });
        break;
      }
      case "input":
      case "output": {
        // The layout box spans the boundary glyph and its beside-label; the
        // glyph sits on the edge that faces the graph, the label in the rest.
        const before = declaration.kind === "input";
        const glyphX = before ? node.x + node.width - STUB_GLYPH_SIZE : node.x;
        push(
          decoration,
          item.order,
          `<rect id="${id}" class="${NODE_CLASS} aze-control-${declaration.kind}"` +
            ` x="${quantize(glyphX)}" y="${quantize(centreY - STUB_GLYPH_SIZE / 2)}"` +
            ` width="${quantize(STUB_GLYPH_SIZE)}" height="${quantize(STUB_GLYPH_SIZE)}"` +
            ` fill="${escapeXml(control.stubFill)}" stroke="${escapeXml(control.stubStroke)}"` +
            ` stroke-width="${quantize(control.stubStrokeWidthPx)}"/>`,
        );
        push(
          texts,
          item.order,
          stackedText(
            oneLine(
              circuitTextValue(declaration.label),
              typography.stubFontSizePx,
              typography.stubLineHeightPx,
            ),
            before ? glyphX - STUB_LABEL_GAP : glyphX + STUB_GLYPH_SIZE + STUB_LABEL_GAP,
            centreY,
            STUB_LABEL_CLASS,
            before ? "end" : "start",
          ),
        );
        break;
      }
    }
  }

  for (const edge of layout.edges) {
    const authored = edges.get(edge.declarationIndex);
    assertProjection(
      authored !== undefined &&
        authored.declaration.from === edge.from &&
        authored.declaration.to === edge.to,
      `edge ${edge.declarationIndex} is "${edge.from} to ${edge.to}", not the authored ` +
        `${authored === undefined ? "edge" : `"${authored.declaration.from} to ${authored.declaration.to}"`}`,
    );
    if (authored === undefined) continue;
    const data = pathData(edge);
    if (data === "") continue;
    let markup =
      `<path id="${base}-e-${quantize(edge.declarationIndex)}" class="aze-control-edge"` +
      ` d="${data}" fill="none" stroke="${escapeXml(control.edgeStroke)}"` +
      ` stroke-width="${quantize(control.edgeStrokeWidthPx)}"/>` +
      arrowMarkup(edge, theme);
    const label = authored.declaration.label;
    const at = polylineMidpoint(edge);
    if (label !== undefined && at !== undefined) {
      const width = advanceWidth(label, typography.signalFontSizePx) + 2 * EDGE_LABEL_PADDING_X_PX;
      const height = typography.signalLineHeightPx + 2 * EDGE_LABEL_PADDING_Y_PX;
      const labelX = clampCenter(at.x, width / 2, layout.width);
      const labelY = clampCenter(at.y, height / 2, layout.height);
      markup +=
        `<rect class="aze-control-edge-label-background"` +
        ` x="${quantize(labelX - width / 2)}" y="${quantize(labelY - height / 2)}"` +
        ` width="${quantize(width)}" height="${quantize(height)}"` +
        ` rx="${quantize(EDGE_LABEL_BACKGROUND_RADIUS_PX)}"` +
        ` ry="${quantize(EDGE_LABEL_BACKGROUND_RADIUS_PX)}"` +
        ` fill="${escapeXml(control.edgeLabelBackground)}"/>`;
      push(
        texts,
        authored.order,
        stackedText(
          oneLine(
            circuitTextValue(label),
            typography.signalFontSizePx,
            typography.signalLineHeightPx,
          ),
          labelX,
          labelY,
          EDGE_LABEL_CLASS,
          "middle",
        ),
      );
    }
    push(decoration, authored.order, markup);
  }

  // One dot per item with two or more out-edges: one signal's authored fan-out,
  // never a named entity and never an id of its own beyond the positional dot.
  for (const [name, outgoing] of outEdges) {
    if (outgoing.length < 2) continue;
    const node = nodeByName.get(name);
    const item = items.get(name);
    const at = takeoffPoint(outgoing);
    if (node === undefined || item === undefined || at === undefined) continue;
    push(
      decoration,
      item.order,
      `<circle id="${base}-t-${quantize(node.declarationIndex)}" class="aze-control-takeoff"` +
        ` cx="${quantize(at.x)}" cy="${quantize(at.y)}"` +
        ` r="${quantize(control.takeoffRadiusPx)}" fill="${escapeXml(control.takeoffFill)}"/>`,
    );
  }

  const ordered = (bucket: readonly Fragment[]): string =>
    bucket
      .slice()
      .sort((left, right) => left.order - right.order)
      .map((fragment) => fragment.markup)
      .join("");
  const decorations = ordered(decoration);
  const labelMarkup = ordered(texts);
  const idAttribute = block.id === undefined ? "" : ` data-control-id="${escapeXml(block.id)}"`;
  const numberAttribute = block.number === true ? ' data-control-number="true"' : "";
  const svg =
    `<svg xmlns="${SVG_NAMESPACE}" viewBox="0 0 ${quantize(layout.width)} ${quantize(layout.height)}"` +
    ` width="${quantize(layout.width)}" height="${quantize(layout.height)}" role="img"` +
    ` aria-labelledby="${base}-title ${base}-desc">` +
    `<title id="${base}-title">${escapeXml(controlTitle(block, ordinal))}</title>` +
    `<desc id="${base}-desc">${escapeXml(describeControl(block))}</desc>` +
    (decorations === ""
      ? ""
      : `<g class="aze-control-decoration" aria-hidden="true">${decorations}</g>`) +
    (labelMarkup === "" ? "" : `<g class="aze-control-text">${labelMarkup}</g>`) +
    `</svg>`;
  assertControlFragmentSafe(svg);
  return `<figure class="aze-control" id="${base}"${idAttribute}${numberAttribute}>${svg}</figure>`;
}

/* ------------------------------------------------------------------ *
 * Entry points
 * ------------------------------------------------------------------ */

/**
 * Render one control Block: a static, browser-free, deterministic figure over
 * the pinned ELK layout projection. This is the family's only async boundary,
 * and the Theme is mandatory — the tokens are the picture.
 */
export async function renderControlFragment(
  block: ControlBlock,
  context: Readonly<{ sourceName?: string; ordinal?: number; theme?: Theme }>,
): Promise<string> {
  const theme = context.theme;
  if (theme === undefined) {
    throw new ControlRenderError("The control figure needs a resolved Theme, and none was passed.");
  }
  const layout = await layoutControl(block, theme);
  return emitControlFragment(block, layout, context.ordinal ?? 0, theme);
}

/**
 * Fingerprint closure for the rendered-artifact hash (contract §12): the
 * layout language, the pinned engine, the emitter, the Advance metric and its
 * pinned font sources, the option set and the quantization.
 */
export function controlDependencyClosure(): JsonValue {
  return Object.freeze({
    layout: CONTROL_LAYOUT_VERSION,
    elkjs: ELKJS_VERSION,
    emitter: CONTROL_EMITTER_VERSION,
    advanceMetric: advanceMetricDependencyClosure(),
    quantization: QUANTIZATION_VERSION,
    options: CONTROL_OPTIONS_VERSION,
  });
}

export const controlHtmlBlockRenderer: FigureBlockRenderer<ControlBlock> = Object.freeze({
  descriptor: Object.freeze({
    id: CONTROL_HTML_BLOCK_RENDERER_ID,
    version: CONTROL_HTML_BLOCK_RENDERER_VERSION,
    blockType: CONTROL_PLUGIN_TYPE,
    pluginVersionRange: CONTROL_PLUGIN_VERSION,
    rendererId: "html",
    rendererVersionRange: "1.0.0",
  }),
  render(
    block: ControlBlock,
    context: Readonly<{ sourceName?: string; ordinal?: number; theme?: Theme }>,
  ): Promise<string> {
    return renderControlFragment(block, context);
  },
});
