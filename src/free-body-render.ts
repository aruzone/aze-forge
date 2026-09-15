/**
 * Native free-body diagram emitter (contract: issue #65 §6, §9, §10, §12).
 *
 * One deterministic projection from a validated `FreeBodyBlock` to a static
 * figure. The authored y-up frame is auto-fitted around the resolved extent of
 * every visible object — or an authored `bounds:` wins — and mapped to the SVG
 * y-down canvas by one uniform, aspect-preserving, centred scale; every emitted
 * number goes through `quantize`.
 *
 * Two norms hold everywhere. First, identity is positional: no authored name,
 * id or coordinate ever reaches an attribute, so a declaration's group is
 * `aze-fb-<ordinal>-n-<declarationIndex>` and the Block's own id rides on the
 * `<figure>` as data. Second, nothing is computed into the picture: an arrow is
 * the authored attachment and the authored direction resolved by the ray rule,
 * a length is `magnitude × scale` or the authored `length:`, and no force,
 * contact or equilibrium is ever inferred.
 *
 * Every glyph is a real `<text>` (never a path); `<path>`/`<polygon>` carry
 * arcs, strokes and arrowheads only; and the fragment carries no script, no
 * event attribute and no external reference — `assertFreeBodyFragmentSafe`
 * proves that before the caller sees a byte.
 *
 * Everything here is renderer-derived and fingerprint-only: no coordinate, no
 * positional id and no quantized number ever enters the Block or its
 * contentHash.
 */

import {
  FREE_BODY_EMITTER_VERSION,
  FREE_BODY_EVALUATOR_VERSION,
  FREE_BODY_PLUGIN_TYPE,
  FREE_BODY_PLUGIN_VERSION,
  FREE_BODY_SCALE_POLICY_VERSION,
} from "./control-schemas.js";
import { circuitTextValue } from "./circuit-text.js";
import { escapeXml, quantize } from "./plot.js";
import type {
  FigureBlockRenderer,
  FreeBodyAttachment,
  FreeBodyAxes,
  FreeBodyBlock,
  FreeBodyDeclaration,
  FreeBodyDirection,
  FreeBodyForce,
  JsonValue,
  Theme,
} from "./model.js";

export const FREE_BODY_HTML_BLOCK_RENDERER_ID = "azeforge.free-body.html/v1" as const;
export const FREE_BODY_HTML_BLOCK_RENDERER_VERSION = "1.0.0" as const;

/** The quantization rule the fingerprint closure names: `quantize`, 3 decimals. */
const QUANTIZATION_VERSION = "3-decimals";
/** Characters one `<desc>` may spend, vectors and moments included. */
const DESC_LIMIT = 2000;
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

/* ------------------------------------------------------------------ *
 * Registered rendering constants
 *
 * The contract fixes every one of these as a renderer constant, never an
 * author knob: a moment arc, a dimension glyph and an arrowhead look the same
 * in every free-body diagram of a document regardless of what the author drew
 * around them. `margin` is the geometry §6 canvas margin, `arrowheadMinLengthPx`
 * is the Theme's legibility floor for a head, and the two dash arrays keep
 * reference lines and axis crosses typographically distinct from force arrows.
 * ------------------------------------------------------------------ */

/** Canvas breathing room around the fitted frame, in pixels (geometry §6). */
const CANVAS_MARGIN_PX = 40;
/** The frame a degenerate extent falls back to: nothing resolved at all. */
const DEGENERATE_REGION = Object.freeze({ minX: -10, minY: -10, maxX: 10, maxY: 10 });
/** The span a degenerate axis reads as, so an `axes`-only Block still has one. */
const DEGENERATE_SPAN = 20;
/** Smallest span the projector divides by; a flat extent must not divide by zero. */
const MINIMUM_SPAN = 1e-9;
/** Particle marker radius: a body with no extent still has to be visible. */
const PARTICLE_RADIUS_PX = 3.5;

/** Radius and angular sweep of every schematic moment arc, in pixels. */
const MOMENT_ARC_RADIUS_PX = 20;
const MOMENT_ARC_START_DEGREES = 90;
const MOMENT_ARC_SWEEP_DEGREES = 270;
/** Dash array of a `style: dashed` reference line (`axisDash` is the Theme's). */
const LINE_DASH_ARRAY = "6 4";
/** Axis half-length as a fraction of the resolved extent: a local frame, not a plot. */
const AXES_REACH_RATIO = 0.12;
/** Arrowhead length in pixels, and its half-width as a fraction of that length. */
const ARROWHEAD_LENGTH_PX = 9;
const ARROWHEAD_HALF_WIDTH_RATIO = 0.5;
/** Angle-mark radius: a fraction of the shorter leg, capped so a long leg cannot dominate. */
const ANGLE_MARK_RADIUS_RATIO = 0.35;
const ANGLE_MARK_RADIUS_MAX_PX = 56;
/** Label offsets, in pixels. Fixed placement: the emitter never measures text. */
const POINT_LABEL_OFFSET_PX = 8;
const FORCE_LABEL_OFFSET_PX = 8;
const MOMENT_LABEL_OFFSET_PX = 10;
const AXIS_LABEL_OFFSET_PX = 10;
const ANGLE_LABEL_OFFSET_PX = 8;
const DIMENSION_LABEL_OFFSET_PX = 8;

/** The declaration kinds, in the one fixed order counts and summaries use. */
const KIND_ORDER = Object.freeze([
  "block",
  "circle",
  "polygon",
  "particle",
  "point",
  "line",
  "force",
  "moment",
  "axes",
  "angle-mark",
  "dimension",
] as const);

type FreeBodyKind = FreeBodyDeclaration["kind"];

/** Singular word of each kind; a count of one is not pluralized. */
const KIND_LABEL: Readonly<Record<FreeBodyKind, string>> = Object.freeze({
  block: "block",
  circle: "circle",
  polygon: "polygon",
  particle: "particle",
  point: "point",
  line: "line",
  force: "force",
  moment: "moment",
  axes: "axis pair",
  "angle-mark": "angle mark",
  dimension: "dimension",
});

/** Fail-closed emitter fault; the caller publishes no Artifact. */
export class FreeBodyRenderError extends Error {
  readonly code = "azeforge.renderer#free-body-render";
  readonly remedy =
    "Re-check the free-body declaration list and the Theme handed to the renderer; a renderer failure publishes no Artifact.";

  constructor(message: string) {
    super(message);
    this.name = "FreeBodyRenderError";
  }
}

/** Render context: positional ordinal, the Theme, and the Source name. */
type RenderContext = Readonly<{
  sourceName?: string;
  ordinal?: number;
  theme?: Theme;
}>;

/** Fail-closed norm extended to free-body fragments: generated markup must never carry executable content. */
export function assertFreeBodyFragmentSafe(svg: string): void {
  if (/<\s*script|on[a-z]+\s*=|javascript:/i.test(svg)) {
    throw new FreeBodyRenderError("Free-body fragment carries unexpected executable markup.");
  }
}

/* ------------------------------------------------------------------ *
 * Numbers, frames and pixels
 * ------------------------------------------------------------------ */

/** One authored y-up frame coordinate pair, in frame units. */
interface Frame {
  readonly x: number;
  readonly y: number;
}

/** One projected SVG y-down pixel coordinate pair. */
interface Px {
  readonly x: number;
  readonly y: number;
}

/**
 * One authored value. A validated Block carries only exact finite decimals, so
 * a value that is not one is an emitter fault rather than an author error.
 */
function decimal(raw: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new FreeBodyRenderError(`Free-body value "${raw}" is not a finite decimal.`);
  }
  return value;
}

function radians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Wrap an angle difference into (-π, π]: the sweep an angle mark draws. */
function normalizeAngle(value: number): number {
  let angle = value % (2 * Math.PI);
  if (angle > Math.PI) angle -= 2 * Math.PI;
  if (angle <= -Math.PI) angle += 2 * Math.PI;
  return angle;
}

/** Unit vector from `from` to `to`, or `undefined` when the two coincide. */
function unitVector(from: Px, to: Px): Px | undefined {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (!(length > 0)) return undefined;
  return { x: dx / length, y: dy / length };
}

function requireUnit(from: Px, to: Px, what: string): Px {
  const unit = unitVector(from, to);
  if (unit === undefined) {
    throw new FreeBodyRenderError(`Free-body ${what} has no direction: its two ends coincide.`);
  }
  return unit;
}

/* ------------------------------------------------------------------ *
 * Markup primitives
 *
 * `<path>` and `<polygon>` draw arcs, strokes and arrowheads only; every glyph
 * the author wrote is a `<text>`.
 * ------------------------------------------------------------------ */

/** One straight rule; `dash` is a registered or themed stroke-dasharray, `""` for solid. */
function lineMarkup(a: Px, b: Px, stroke: string, widthPx: number, dash: string): string {
  return (
    `<line x1="${quantize(a.x)}" y1="${quantize(a.y)}" x2="${quantize(b.x)}" y2="${quantize(b.y)}"` +
    ` stroke="${escapeXml(stroke)}" stroke-width="${quantize(widthPx)}"` +
    `${dash === "" ? "" : ` stroke-dasharray="${escapeXml(dash)}"`}/>`
  );
}

/** One stroked outline: a body, a moment arc's head, an axis or a dimension rule. */
function circleMarkup(center: Px, radiusPx: number, fill: string, stroke: string, widthPx: number): string {
  return (
    `<circle cx="${quantize(center.x)}" cy="${quantize(center.y)}" r="${quantize(radiusPx)}"` +
    ` fill="${escapeXml(fill)}" stroke="${escapeXml(stroke)}" stroke-width="${quantize(widthPx)}"/>`
  );
}

/** One filled marker: a point or a particle, drawn at the fixed theme radius. */
function dotMarkup(center: Px, radiusPx: number, fill: string, stroke: string): string {
  return (
    `<circle cx="${quantize(center.x)}" cy="${quantize(center.y)}" r="${quantize(radiusPx)}"` +
    ` fill="${escapeXml(fill)}" stroke="${escapeXml(stroke)}"/>`
  );
}

function polygonMarkup(points: readonly Px[], fill: string, stroke: string, widthPx: number): string {
  const coordinates = points.map((point) => `${quantize(point.x)},${quantize(point.y)}`).join(" ");
  return (
    `<polygon points="${coordinates}" fill="${escapeXml(fill)}"` +
    ` stroke="${escapeXml(stroke)}" stroke-width="${quantize(widthPx)}"/>`
  );
}

/**
 * The legible head length of an arrow: the registered pixel length raised to
 * the Theme's floor when a Theme asks for a larger one, and never so long that
 * `heads` of them overrun the tip they decorate.
 */
function arrowHeadLength(stemPx: number, floorPx: number, heads: number): number {
  return Math.min(stemPx / heads, Math.max(ARROWHEAD_LENGTH_PX, floorPx));
}

/** Filled arrowhead whose tip is `tip`, pointing along the unit vector `unit`. */
function arrowHeadMarkup(tip: Px, unit: Px, lengthPx: number, fill: string): string {
  if (!(lengthPx > 0)) return "";
  const base = { x: tip.x - unit.x * lengthPx, y: tip.y - unit.y * lengthPx };
  const halfX = -unit.y * lengthPx * ARROWHEAD_HALF_WIDTH_RATIO;
  const halfY = unit.x * lengthPx * ARROWHEAD_HALF_WIDTH_RATIO;
  const points = [
    `${quantize(tip.x)},${quantize(tip.y)}`,
    `${quantize(base.x + halfX)},${quantize(base.y + halfY)}`,
    `${quantize(base.x - halfX)},${quantize(base.y - halfY)}`,
  ].join(" ");
  return `<polygon points="${points}" fill="${escapeXml(fill)}"/>`;
}

interface LabelOptions {
  readonly id: string;
  readonly text: string;
  readonly at: Px;
  readonly anchor: "start" | "middle";
  readonly fill: string;
  readonly fontSizePx: number;
  readonly fontFamily: string;
}

function labelMarkup(options: LabelOptions): string {
  if (options.text === "") return "";
  return (
    `<text id="${options.id}" class="aze-free-body-label" x="${quantize(options.at.x)}"` +
    ` y="${quantize(options.at.y)}" text-anchor="${options.anchor}" dominant-baseline="central"` +
    ` font-family="${escapeXml(options.fontFamily)}" font-size="${quantize(options.fontSizePx)}"` +
    ` fill="${escapeXml(options.fill)}">${escapeXml(options.text)}</text>`
  );
}

interface ArcMarkup {
  /** The arc itself. */
  readonly path: string;
  /** The sweep end, where the arrowhead sits. */
  readonly end: Px;
  /** Unit tangent at the sweep end, in projected pixel space. */
  readonly tangent: Px;
}

/**
 * One circular arc in the authored y-up frame: endpoints on the circle of
 * radius `radiusFrame` at `startDegrees` and `startDegrees + sweepDegrees`.
 * The y-flip inverts SVG's sweep flag, so a frame-counterclockwise sweep
 * (`sweepDegrees > 0`) draws as `sweep-flag="0"`.
 */
function arcMarkup(
  center: Frame,
  radiusFrame: number,
  startDegrees: number,
  sweepDegrees: number,
  project: (point: Frame) => Px,
  scale: number,
  stroke: string,
  widthPx: number,
): ArcMarkup | undefined {
  if (!(radiusFrame > 0) || sweepDegrees === 0) return undefined;
  const startRadians = radians(startDegrees);
  const endRadians = radians(startDegrees + sweepDegrees);
  const start = project({
    x: center.x + radiusFrame * Math.cos(startRadians),
    y: center.y + radiusFrame * Math.sin(startRadians),
  });
  const end = project({
    x: center.x + radiusFrame * Math.cos(endRadians),
    y: center.y + radiusFrame * Math.sin(endRadians),
  });
  const largeArc = Math.abs(sweepDegrees) > 180 ? 1 : 0;
  const sweepFlag = sweepDegrees > 0 ? 0 : 1;
  const radiusPx = quantize(radiusFrame * scale);
  const path =
    `<path d="M ${quantize(start.x)} ${quantize(start.y)}` +
    ` A ${radiusPx} ${radiusPx} 0 ${largeArc} ${sweepFlag} ${quantize(end.x)} ${quantize(end.y)}"` +
    ` fill="none" stroke="${escapeXml(stroke)}" stroke-width="${quantize(widthPx)}"/>`;
  const tangentFrame =
    sweepDegrees > 0
      ? { x: -Math.sin(endRadians), y: Math.cos(endRadians) }
      : { x: Math.sin(endRadians), y: -Math.cos(endRadians) };
  return { path, end, tangent: { x: tangentFrame.x, y: -tangentFrame.y } };
}

/* ------------------------------------------------------------------ *
 * Resolution (renderer-derived, never hashed)
 * ------------------------------------------------------------------ */

interface ResolvedLine {
  readonly from: Frame;
  readonly to: Frame;
}

interface ResolvedFreeBody {
  readonly points: ReadonlyMap<string, Frame>;
  readonly lines: ReadonlyMap<string, ResolvedLine>;
}

function requirePoint(points: ReadonlyMap<string, Frame>, name: string): Frame {
  const point = points.get(name);
  if (point === undefined) {
    throw new FreeBodyRenderError(`Free-body reference "${name}" has no point declaration.`);
  }
  return point;
}

function requireLine(lines: ReadonlyMap<string, ResolvedLine>, name: string): ResolvedLine {
  const line = lines.get(name);
  if (line === undefined) {
    throw new FreeBodyRenderError(`Free-body reference "${name}" has no line declaration.`);
  }
  return line;
}

/** Every named point and every named line, in authored order; two passes, so forward references resolve. */
function resolveFreeBody(block: FreeBodyBlock): ResolvedFreeBody {
  const points = new Map<string, Frame>();
  const lines = new Map<string, ResolvedLine>();
  for (const declaration of block.declarations) {
    if (declaration.kind === "point") {
      points.set(declaration.name, { x: decimal(declaration.x), y: decimal(declaration.y) });
    }
  }
  for (const declaration of block.declarations) {
    if (declaration.kind === "line") {
      lines.set(declaration.name, {
        from: requirePoint(points, declaration.from),
        to: requirePoint(points, declaration.to),
      });
    }
  }
  return { points, lines };
}

/** One attachment value: exactly one named point or one authored coordinate pair. */
function attachmentFrame(attachment: FreeBodyAttachment, resolved: ResolvedFreeBody): Frame {
  switch (attachment.kind) {
    case "point":
      return requirePoint(resolved.points, attachment.name);
    case "coordinates":
      return { x: decimal(attachment.x), y: decimal(attachment.y) };
  }
}

/**
 * The authored direction of a vector, as a unit vector in the y-up frame.
 * `parallel-to:` is the named line's from→to ray; `perpendicular-to:` is that
 * ray rotated exactly +90° counterclockwise.
 */
function directionVector(direction: FreeBodyDirection, resolved: ResolvedFreeBody): Frame {
  switch (direction.kind) {
    case "angle": {
      const angle = radians(decimal(direction.degrees));
      return { x: Math.cos(angle), y: Math.sin(angle) };
    }
    case "parallel-to":
    case "perpendicular-to": {
      const line = requireLine(resolved.lines, direction.line);
      const dx = line.to.x - line.from.x;
      const dy = line.to.y - line.from.y;
      const length = Math.hypot(dx, dy);
      if (!(length > 0)) {
        throw new FreeBodyRenderError(
          `Free-body line "${direction.line}" has no direction: its two points coincide.`,
        );
      }
      const unitX = dx / length;
      const unitY = dy / length;
      return direction.kind === "parallel-to"
        ? { x: unitX, y: unitY }
        : { x: -unitY, y: unitX };
    }
  }
}

/** Frame units of one force arrow: `magnitude × scale`, or the authored schematic `length:`. */
function forceLength(block: FreeBodyBlock, declaration: FreeBodyForce): number {
  if (block.scale !== undefined) {
    if (declaration.magnitude === undefined) {
      throw new FreeBodyRenderError(
        "Free-body force under an explicit scale: carries no magnitude:.",
      );
    }
    return decimal(declaration.magnitude) * decimal(block.scale);
  }
  if (declaration.length === undefined) {
    throw new FreeBodyRenderError("Free-body force without a scale: carries no length:.");
  }
  return decimal(declaration.length);
}

/* ------------------------------------------------------------------ *
 * Extent (auto-fit input)
 * ------------------------------------------------------------------ */

interface Extent {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function extend(extent: Extent, x: number, y: number): void {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  if (x < extent.minX) extent.minX = x;
  if (y < extent.minY) extent.minY = y;
  if (x > extent.maxX) extent.maxX = x;
  if (y > extent.maxY) extent.maxY = y;
}

/**
 * The resolved extent of one declaration, in frame units. Only what the author
 * can see counts: an invisible body, point or line draws nothing, so it cannot
 * pull the fit — except where a visible object references it, which is where
 * the reference itself extends the extent.
 */
function extendDeclaration(
  extent: Extent,
  declaration: FreeBodyDeclaration,
  resolved: ResolvedFreeBody,
  block: FreeBodyBlock,
): void {
  switch (declaration.kind) {
    case "block": {
      if (!declaration.visible) return;
      const center = { x: decimal(declaration.x), y: decimal(declaration.y) };
      const halfWidth = decimal(declaration.width) / 2;
      const halfHeight = decimal(declaration.height) / 2;
      const angle = radians(decimal(declaration.angle));
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      for (const [dx, dy] of [[-halfWidth, -halfHeight], [halfWidth, -halfHeight], [halfWidth, halfHeight], [-halfWidth, halfHeight]] as const) {
        extend(extent, center.x + dx * cos - dy * sin, center.y + dx * sin + dy * cos);
      }
      return;
    }
    case "circle": {
      if (!declaration.visible) return;
      const center = { x: decimal(declaration.x), y: decimal(declaration.y) };
      const radius = decimal(declaration.radius);
      extend(extent, center.x - radius, center.y - radius);
      extend(extent, center.x + radius, center.y + radius);
      return;
    }
    case "polygon": {
      if (!declaration.visible) return;
      for (const name of declaration.vertices) {
        const vertex = requirePoint(resolved.points, name);
        extend(extent, vertex.x, vertex.y);
      }
      return;
    }
    case "particle": {
      if (!declaration.visible) return;
      extend(extent, decimal(declaration.x), decimal(declaration.y));
      return;
    }
    case "point": {
      if (!declaration.visible) return;
      extend(extent, decimal(declaration.x), decimal(declaration.y));
      return;
    }
    case "line": {
      if (!declaration.visible) return;
      const line = requireLine(resolved.lines, declaration.name);
      extend(extent, line.from.x, line.from.y);
      extend(extent, line.to.x, line.to.y);
      return;
    }
    case "force": {
      const at = attachmentFrame(declaration.at, resolved);
      const direction = directionVector(declaration.direction, resolved);
      const length = forceLength(block, declaration);
      extend(extent, at.x, at.y);
      extend(extent, at.x + direction.x * length, at.y + direction.y * length);
      return;
    }
    case "moment": {
      const at = attachmentFrame(declaration.at, resolved);
      extend(extent, at.x, at.y);
      return;
    }
    case "angle-mark": {
      for (const name of [declaration.first, declaration.vertex, declaration.third]) {
        const leg = requirePoint(resolved.points, name);
        extend(extent, leg.x, leg.y);
      }
      return;
    }
    case "dimension": {
      const from = attachmentFrame(declaration.from, resolved);
      const to = attachmentFrame(declaration.to, resolved);
      extend(extent, from.x, from.y);
      extend(extent, to.x, to.y);
      return;
    }
    case "axes":
      // Handled by the caller: its reach is a fraction of the extent it must
      // not itself inflate, so its arms are added once that fraction is known.
      return;
  }
}

/** The four arm ends of an axis cross at `origin`, rotated by `angle` in the y-up frame. */
function axesArms(origin: Frame, angle: number, half: number): readonly Frame[] {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [
    { x: origin.x + cos * half, y: origin.y + sin * half },
    { x: origin.x - cos * half, y: origin.y - sin * half },
    { x: origin.x - sin * half, y: origin.y + cos * half },
    { x: origin.x + sin * half, y: origin.y - cos * half },
  ];
}

/* ------------------------------------------------------------------ *
 * Declaration emitters
 * ------------------------------------------------------------------ */

/** What one declaration contributes: decoration first, then its label text. */
interface Marks {
  readonly shapes: string;
  readonly text: string;
}

const NO_MARKS: Marks = Object.freeze({ shapes: "", text: "" });

interface Emitter {
  readonly block: FreeBodyBlock;
  readonly resolved: ResolvedFreeBody;
  readonly tokens: Theme["freeBody"];
  /** Authored y-up frame -> SVG y-down pixels. The flip lives here and nowhere else. */
  readonly project: (point: Frame) => Px;
  readonly scale: number;
  /** Figure id prefix: `aze-fb-0`, `aze-fb-1`, ... — positional, never authored. */
  readonly base: string;
  /** Half-length of an axis arm, in frame units (a registered fraction of the extent). */
  readonly axesHalf: number;
}

/** One authored label, at its declaration's positional id. */
function textMarkup(
  env: Emitter,
  index: number,
  suffix: string,
  text: string,
  at: Px,
  anchor: "start" | "middle",
  fill: string,
  fontSizePx: number,
): string {
  return labelMarkup({
    id: `${env.base}-n-${quantize(index)}${suffix}`,
    text,
    at,
    anchor,
    fill,
    fontSizePx,
    fontFamily: env.tokens.labelFontFamily,
  });
}

function emitForce(declaration: FreeBodyForce, index: number, env: Emitter): Marks {
  const tokens = env.tokens;
  const attachment = attachmentFrame(declaration.at, env.resolved);
  const direction = directionVector(declaration.direction, env.resolved);
  const length = forceLength(env.block, declaration);
  const tip = {
    x: attachment.x + direction.x * length,
    y: attachment.y + direction.y * length,
  };
  const tailPx = env.project(attachment);
  const tipPx = env.project(tip);
  const stemPx = Math.hypot(tipPx.x - tailPx.x, tipPx.y - tailPx.y);
  const shapes: string[] = [];
  let labelAt: Px | undefined;
  if (stemPx > 0) {
    const unit = { x: (tipPx.x - tailPx.x) / stemPx, y: (tipPx.y - tailPx.y) / stemPx };
    const headPx = arrowHeadLength(stemPx, tokens.arrowheadMinLengthPx, 1);
    if (headPx < stemPx) {
      shapes.push(
        lineMarkup(
          tailPx,
          { x: tipPx.x - unit.x * headPx, y: tipPx.y - unit.y * headPx },
          tokens.forceStroke,
          tokens.forceStrokeWidthPx,
          "",
        ),
      );
    }
    shapes.push(arrowHeadMarkup(tipPx, unit, headPx, tokens.forceArrowFill));
    labelAt = {
      x: tipPx.x + unit.x * FORCE_LABEL_OFFSET_PX,
      y: tipPx.y + unit.y * FORCE_LABEL_OFFSET_PX,
    };
  }
  const label = declaration.label === undefined ? "" : circuitTextValue(declaration.label);
  const text =
    labelAt === undefined
      ? ""
      : textMarkup(env, index, "-label", label, labelAt, "middle", tokens.forceStroke, tokens.labelFontSizePx);
  return { shapes: shapes.join(""), text };
}

function emitMoment(declaration: Extract<FreeBodyDeclaration, { kind: "moment" }>, index: number, env: Emitter): Marks {
  const tokens = env.tokens;
  const center = attachmentFrame(declaration.at, env.resolved);
  // Moments are schematic: the radius is a pixel constant, so the arc keeps its
  // size whatever `scale:` does to the vector arrows, and is never read from it.
  const radiusFrame = MOMENT_ARC_RADIUS_PX / env.scale;
  const sweep = declaration.direction === "ccw" ? MOMENT_ARC_SWEEP_DEGREES : -MOMENT_ARC_SWEEP_DEGREES;
  const arc = arcMarkup(
    center,
    radiusFrame,
    MOMENT_ARC_START_DEGREES,
    sweep,
    env.project,
    env.scale,
    tokens.momentStroke,
    tokens.momentStrokeWidthPx,
  );
  if (arc === undefined) return NO_MARKS;
  const startRadians = radians(MOMENT_ARC_START_DEGREES);
  const startPx = env.project({
    x: center.x + radiusFrame * Math.cos(startRadians),
    y: center.y + radiusFrame * Math.sin(startRadians),
  });
  const labelAt = {
    x: startPx.x + Math.cos(startRadians) * MOMENT_LABEL_OFFSET_PX,
    y: startPx.y - Math.sin(startRadians) * MOMENT_LABEL_OFFSET_PX,
  };
  const label = declaration.label === undefined ? "" : circuitTextValue(declaration.label);
  const headPx = arrowHeadLength(
    MOMENT_ARC_RADIUS_PX * Math.abs(radians(sweep)),
    tokens.arrowheadMinLengthPx,
    1,
  );
  return {
    shapes: arc.path + arrowHeadMarkup(arc.end, arc.tangent, headPx, tokens.momentFill),
    text: textMarkup(env, index, "-label", label, labelAt, "middle", tokens.momentStroke, tokens.labelFontSizePx),
  };
}

function emitAxes(declaration: FreeBodyAxes, index: number, env: Emitter): Marks {
  const tokens = env.tokens;
  const origin = attachmentFrame(declaration.at, env.resolved);
  const angle = radians(decimal(declaration.angle));
  const half = env.axesHalf;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const originPx = env.project(origin);
  const xEnd = env.project({ x: origin.x + cos * half, y: origin.y + sin * half });
  const yEnd = env.project({ x: origin.x - sin * half, y: origin.y + cos * half });
  const shapes =
    lineMarkup(
      env.project({ x: origin.x - cos * half, y: origin.y - sin * half }),
      xEnd,
      tokens.axisStroke,
      tokens.axisStrokeWidthPx,
      tokens.axisDash,
    ) +
    lineMarkup(
      env.project({ x: origin.x + sin * half, y: origin.y - cos * half }),
      yEnd,
      tokens.axisStroke,
      tokens.axisStrokeWidthPx,
      tokens.axisDash,
    );
  const xUnit = requireUnit(originPx, xEnd, "axis");
  const yUnit = requireUnit(originPx, yEnd, "axis");
  const text =
    textMarkup(
      env,
      index,
      "-label-x",
      circuitTextValue(declaration.xLabel),
      { x: xEnd.x + xUnit.x * AXIS_LABEL_OFFSET_PX, y: xEnd.y + xUnit.y * AXIS_LABEL_OFFSET_PX },
      "middle",
      tokens.axisStroke,
      tokens.labelFontSizePx,
    ) +
    textMarkup(
      env,
      index,
      "-label-y",
      circuitTextValue(declaration.yLabel),
      { x: yEnd.x + yUnit.x * AXIS_LABEL_OFFSET_PX, y: yEnd.y + yUnit.y * AXIS_LABEL_OFFSET_PX },
      "middle",
      tokens.axisStroke,
      tokens.labelFontSizePx,
    );
  return { shapes, text };
}

function emitAngleMark(
  declaration: Extract<FreeBodyDeclaration, { kind: "angle-mark" }>,
  index: number,
  env: Emitter,
): Marks {
  const tokens = env.tokens;
  const vertex = requirePoint(env.resolved.points, declaration.vertex);
  const first = requirePoint(env.resolved.points, declaration.first);
  const third = requirePoint(env.resolved.points, declaration.third);
  const firstLeg = Math.hypot(first.x - vertex.x, first.y - vertex.y);
  const thirdLeg = Math.hypot(third.x - vertex.x, third.y - vertex.y);
  const shortestLeg = Math.min(firstLeg, thirdLeg);
  if (!(shortestLeg > 0)) return NO_MARKS;
  const theta = Math.atan2(first.y - vertex.y, first.x - vertex.x);
  const sweep = normalizeAngle(Math.atan2(third.y - vertex.y, third.x - vertex.x) - theta);
  if (sweep === 0) return NO_MARKS;
  const radiusFrame = Math.min(ANGLE_MARK_RADIUS_MAX_PX / env.scale, ANGLE_MARK_RADIUS_RATIO * shortestLeg);
  const arc = arcMarkup(
    vertex,
    radiusFrame,
    (theta * 180) / Math.PI,
    (sweep * 180) / Math.PI,
    env.project,
    env.scale,
    tokens.bodyStroke,
    tokens.bodyStrokeWidthPx,
  );
  if (arc === undefined) return NO_MARKS;
  const midRadians = theta + sweep / 2;
  const midPx = env.project({
    x: vertex.x + radiusFrame * Math.cos(midRadians),
    y: vertex.y + radiusFrame * Math.sin(midRadians),
  });
  const radial = requireUnit(env.project(vertex), midPx, "angle-mark arc");
  const labelAt = {
    x: midPx.x + radial.x * ANGLE_LABEL_OFFSET_PX,
    y: midPx.y + radial.y * ANGLE_LABEL_OFFSET_PX,
  };
  const label = declaration.label === undefined ? "" : circuitTextValue(declaration.label);
  const headPx = arrowHeadLength(
    radiusFrame * env.scale * Math.abs(sweep),
    tokens.arrowheadMinLengthPx,
    1,
  );
  return {
    shapes: arc.path + arrowHeadMarkup(arc.end, arc.tangent, headPx, tokens.bodyStroke),
    text: textMarkup(env, index, "-label", label, labelAt, "middle", tokens.bodyStroke, tokens.markFontSizePx),
  };
}

function emitDimension(
  declaration: Extract<FreeBodyDeclaration, { kind: "dimension" }>,
  index: number,
  env: Emitter,
): Marks {
  const tokens = env.tokens;
  const fromPx = env.project(attachmentFrame(declaration.from, env.resolved));
  const toPx = env.project(attachmentFrame(declaration.to, env.resolved));
  const unit = unitVector(fromPx, toPx);
  if (unit === undefined) return NO_MARKS;
  const spanPx = Math.hypot(toPx.x - fromPx.x, toPx.y - fromPx.y);
  /** Perpendicular of the rule; `(1, 0)` measures toward the top of the canvas. */
  const normal = { x: unit.y, y: -unit.x };
  const tick = tokens.tickSizePx;
  const headPx = arrowHeadLength(spanPx, tokens.arrowheadMinLengthPx, 2);
  const stroke = tokens.dimensionStroke;
  const width = tokens.dimensionStrokeWidthPx;
  const stub = (at: Px): string =>
    lineMarkup(
      { x: at.x - normal.x * tick, y: at.y - normal.y * tick },
      { x: at.x + normal.x * tick, y: at.y + normal.y * tick },
      stroke,
      width,
      "",
    );
  const shapes = [stub(fromPx), stub(toPx)];
  if (headPx > 0 && headPx * 2 < spanPx) {
    shapes.push(
      lineMarkup(
        { x: fromPx.x + unit.x * headPx, y: fromPx.y + unit.y * headPx },
        { x: toPx.x - unit.x * headPx, y: toPx.y - unit.y * headPx },
        stroke,
        width,
        "",
      ),
    );
  }
  shapes.push(arrowHeadMarkup(fromPx, { x: -unit.x, y: -unit.y }, headPx, stroke));
  shapes.push(arrowHeadMarkup(toPx, unit, headPx, stroke));
  const labelAt = {
    x: (fromPx.x + toPx.x) / 2 + normal.x * DIMENSION_LABEL_OFFSET_PX,
    y: (fromPx.y + toPx.y) / 2 + normal.y * DIMENSION_LABEL_OFFSET_PX,
  };
  return {
    shapes: shapes.join(""),
    text: textMarkup(
      env,
      index,
      "-label",
      circuitTextValue(declaration.label),
      labelAt,
      "middle",
      stroke,
      tokens.labelFontSizePx,
    ),
  };
}

/** One declaration's decoration and label, in the emitter's positional vocabulary. */
function emitDeclaration(declaration: FreeBodyDeclaration, index: number, env: Emitter): Marks {
  const tokens = env.tokens;
  switch (declaration.kind) {
    case "block": {
      if (!declaration.visible) return NO_MARKS;
      const halfWidth = decimal(declaration.width) / 2;
      const halfHeight = decimal(declaration.height) / 2;
      if (!(halfWidth > 0) || !(halfHeight > 0)) return NO_MARKS;
      const center = { x: decimal(declaration.x), y: decimal(declaration.y) };
      const angle = radians(decimal(declaration.angle));
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const corners = ([[-halfWidth, -halfHeight], [halfWidth, -halfHeight], [halfWidth, halfHeight], [-halfWidth, halfHeight]] as const)
        .map(([dx, dy]) => env.project({
          x: center.x + dx * cos - dy * sin,
          y: center.y + dx * sin + dy * cos,
        }));
      return {
        shapes: polygonMarkup(corners, tokens.bodyFill, tokens.bodyStroke, tokens.bodyStrokeWidthPx),
        text: "",
      };
    }
    case "circle": {
      if (!declaration.visible) return NO_MARKS;
      const radiusPx = decimal(declaration.radius) * env.scale;
      if (!(radiusPx > 0)) return NO_MARKS;
      const center = env.project({ x: decimal(declaration.x), y: decimal(declaration.y) });
      return {
        shapes: circleMarkup(center, radiusPx, tokens.bodyFill, tokens.bodyStroke, tokens.bodyStrokeWidthPx),
        text: "",
      };
    }
    case "polygon": {
      if (!declaration.visible || declaration.vertices.length < 3) return NO_MARKS;
      const vertices = declaration.vertices.map((name) =>
        env.project(requirePoint(env.resolved.points, name)),
      );
      return {
        shapes: polygonMarkup(vertices, tokens.bodyFill, tokens.bodyStroke, tokens.bodyStrokeWidthPx),
        text: "",
      };
    }
    case "particle": {
      if (!declaration.visible) return NO_MARKS;
      const center = env.project({ x: decimal(declaration.x), y: decimal(declaration.y) });
      return {
        shapes: circleMarkup(center, PARTICLE_RADIUS_PX, tokens.bodyFill, tokens.bodyStroke, tokens.bodyStrokeWidthPx),
        text: "",
      };
    }
    case "point": {
      if (!declaration.visible) return NO_MARKS;
      const at = env.project({ x: decimal(declaration.x), y: decimal(declaration.y) });
      const label = declaration.label === undefined ? "" : circuitTextValue(declaration.label);
      return {
        shapes: dotMarkup(at, tokens.pointRadiusPx, tokens.pointFill, tokens.pointStroke),
        text: textMarkup(
          env,
          index,
          "-label",
          label,
          { x: at.x + POINT_LABEL_OFFSET_PX, y: at.y - POINT_LABEL_OFFSET_PX },
          "start",
          tokens.bodyStroke,
          tokens.labelFontSizePx,
        ),
      };
    }
    case "line": {
      if (!declaration.visible) return NO_MARKS;
      const line = requireLine(env.resolved.lines, declaration.name);
      return {
        shapes: lineMarkup(
          env.project(line.from),
          env.project(line.to),
          tokens.bodyStroke,
          tokens.bodyStrokeWidthPx,
          declaration.style === "dashed" ? LINE_DASH_ARRAY : "",
        ),
        text: "",
      };
    }
    case "force":
      return emitForce(declaration, index, env);
    case "moment":
      return emitMoment(declaration, index, env);
    case "axes":
      return emitAxes(declaration, index, env);
    case "angle-mark":
      return emitAngleMark(declaration, index, env);
    case "dimension":
      return emitDimension(declaration, index, env);
  }
}

/* ------------------------------------------------------------------ *
 * Accessible description
 *
 * Fixed order, no coordinates from the projector and no positional id: a
 * reader who cannot see the pixels still gets the declared picture — and only
 * what the author declared, never a resolved pixel.
 * ------------------------------------------------------------------ */

/** Truncate on code-point boundaries: a lone surrogate is not valid XML. */
function truncateDescription(text: string): string {
  if (text.length <= DESC_LIMIT) return text;
  return Array.from(text).slice(0, DESC_LIMIT).join("");
}

/** One attachment as the author wrote it: a named point or a coordinate pair. */
function attachmentText(attachment: FreeBodyAttachment): string {
  switch (attachment.kind) {
    case "point":
      return attachment.name;
    case "coordinates":
      return `(${attachment.x}, ${attachment.y})`;
  }
}

function directionText(direction: FreeBodyDirection): string {
  switch (direction.kind) {
    case "angle":
      return `angle ${direction.degrees} degrees`;
    case "parallel-to":
      return `parallel to ${direction.line}`;
    case "perpendicular-to":
      return `perpendicular to ${direction.line}`;
  }
}

function describeFreeBody(block: FreeBodyBlock): string {
  const parts: string[] = [];
  const authored = block.description === undefined ? "" : circuitTextValue(block.description);
  if (authored !== "") parts.push(`${authored}.`);

  const counts: Record<FreeBodyKind, number> = {
    block: 0,
    circle: 0,
    polygon: 0,
    particle: 0,
    point: 0,
    line: 0,
    force: 0,
    moment: 0,
    axes: 0,
    "angle-mark": 0,
    dimension: 0,
  };
  for (const declaration of block.declarations) counts[declaration.kind] += 1;
  const counted = KIND_ORDER.filter((kind) => counts[kind] > 0).map(
    (kind) => `${counts[kind]} ${KIND_LABEL[kind]}${counts[kind] === 1 ? "" : "s"}`,
  );
  parts.push(counted.length === 0 ? "No declarations." : `Declarations: ${counted.join(", ")}.`);

  parts.push(
    block.scale === undefined
      ? "Schematic vector lengths: no explicit scale is authored, so every arrow carries its authored length."
      : `Explicit scale: ${block.scale} frame units per force unit.`,
  );

  const forces: string[] = [];
  const moments: string[] = [];
  const axes: string[] = [];
  const objects: string[] = [];
  for (const declaration of block.declarations) {
    switch (declaration.kind) {
      case "force": {
        // A vector reads by its label, and by its 1-based authored position when it has none.
        const label = declaration.label === undefined ? "" : circuitTextValue(declaration.label);
        const name = label === "" ? String(forces.length + 1) : label;
        forces.push(
          `force ${name} at ${attachmentText(declaration.at)} ${directionText(declaration.direction)}`,
        );
        break;
      }
      case "moment":
        moments.push(
          `moment ${moments.length + 1} at ${attachmentText(declaration.at)} ${declaration.direction}`,
        );
        break;
      case "axes":
        axes.push(
          `axes ${axes.length + 1} at ${attachmentText(declaration.at)} angle ${declaration.angle} degrees`,
        );
        break;
      case "block":
      case "circle":
      case "particle":
        objects.push(`${declaration.kind} ${declaration.name}`);
        break;
      case "polygon":
        objects.push(`polygon ${declaration.name} (${declaration.vertices.length} vertices)`);
        break;
      case "point": {
        const label = declaration.label === undefined ? "" : circuitTextValue(declaration.label);
        objects.push(`point ${declaration.name}${label === "" ? "" : ` (${label})`}`);
        break;
      }
      case "line":
        objects.push(`line ${declaration.name} from ${declaration.from} to ${declaration.to}`);
        break;
      case "angle-mark":
        objects.push(
          `angle-mark ${declaration.vertex} between ${declaration.first} and ${declaration.third}`,
        );
        break;
      case "dimension":
        objects.push(
          `dimension ${circuitTextValue(declaration.label)} from ${attachmentText(declaration.from)}` +
            ` to ${attachmentText(declaration.to)}`,
        );
        break;
    }
  }
  if (forces.length > 0) parts.push(`Forces in authored order: ${forces.join("; ")}.`);
  if (moments.length > 0) parts.push(`Moments in authored order: ${moments.join("; ")}.`);
  if (axes.length > 0) parts.push(`Axes in authored order: ${axes.join("; ")}.`);
  if (objects.length > 0) {
    parts.push(
      "Bodies, points, lines, angle marks and dimensions in authored order: " +
        `${objects.join("; ")}.`,
    );
  }
  return truncateDescription(parts.join(" "));
}

function freeBodyTitle(block: FreeBodyBlock, ordinal: number): string {
  const authored = block.title === undefined ? "" : circuitTextValue(block.title);
  return authored === "" ? `Free-body diagram ${quantize(ordinal + 1)}` : authored;
}

/* ------------------------------------------------------------------ *
 * Entry points
 * ------------------------------------------------------------------ */

/**
 * Render one free-body Block to a static figure: browser-free deterministic
 * SVG over the authored y-up frame. The Theme is mandatory — the tokens are
 * the picture — and the clip that honours an authored `bounds:` is emitted
 * before any object, so an out-of-bounds object is clipped, never dropped.
 */
/**
 * Effective label typography: the Theme's free-body sizes raised to its
 * declared minimum readable size, so no drawn label falls below the floor the
 * Theme sets for the family.
 */
function freeBodyTokens(theme: Theme): Theme["freeBody"] {
  const tokens = theme.freeBody;
  return {
    ...tokens,
    labelFontSizePx: Math.max(tokens.labelFontSizePx, tokens.minimumLabelFontSizePx),
    markFontSizePx: Math.max(tokens.markFontSizePx, tokens.minimumLabelFontSizePx),
  };
}

export function renderFreeBodyFragment(block: FreeBodyBlock, context: RenderContext): string {
  const theme = context.theme;
  if (theme === undefined) {
    throw new FreeBodyRenderError(
      "The free-body renderer needs a resolved Theme; none was supplied.",
    );
  }
  const ordinal = context.ordinal ?? 0;
  const base = `aze-fb-${quantize(ordinal)}`;
  const tokens = freeBodyTokens(theme);
  const resolved = resolveFreeBody(block);

  /* ---- canvas (geometry §6) ------------------------------------- */

  const extent: Extent = {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  };
  const axesDeclarations: FreeBodyAxes[] = [];
  for (const declaration of block.declarations) {
    if (declaration.kind === "axes") {
      axesDeclarations.push(declaration);
      continue;
    }
    extendDeclaration(extent, declaration, resolved, block);
  }
  const baseSpanX = extent.maxX > extent.minX ? extent.maxX - extent.minX : DEGENERATE_SPAN;
  const baseSpanY = extent.maxY > extent.minY ? extent.maxY - extent.minY : DEGENERATE_SPAN;
  const axesHalf = AXES_REACH_RATIO * Math.max(baseSpanX, baseSpanY);
  for (const declaration of axesDeclarations) {
    const origin = attachmentFrame(declaration.at, resolved);
    for (const arm of axesArms(origin, radians(decimal(declaration.angle)), axesHalf)) {
      extend(extent, arm.x, arm.y);
    }
  }

  const authoredBounds = block.bounds;
  const bounds =
    authoredBounds === undefined
      ? undefined
      : {
          minX: decimal(authoredBounds.minX),
          minY: decimal(authoredBounds.minY),
          maxX: decimal(authoredBounds.maxX),
          maxY: decimal(authoredBounds.maxY),
        };
  const fitted =
    Number.isFinite(extent.minX) &&
    Number.isFinite(extent.maxX) &&
    (extent.maxX > extent.minX || extent.maxY > extent.minY)
      ? { minX: extent.minX, minY: extent.minY, maxX: extent.maxX, maxY: extent.maxY }
      : DEGENERATE_REGION;
  const region = bounds ?? fitted;

  const width = block.width;
  const height = block.height;
  // The registered margin, never more than a quarter of a dimension: a very
  // small canvas still fits rather than inverting its own scale.
  const margin = Math.min(CANVAS_MARGIN_PX, width / 4, height / 4);
  const spanX = Math.max(region.maxX - region.minX, MINIMUM_SPAN);
  const spanY = Math.max(region.maxY - region.minY, MINIMUM_SPAN);
  const scale = Math.min((width - margin * 2) / spanX, (height - margin * 2) / spanY);
  if (!Number.isFinite(scale) || !(scale > 0)) {
    throw new FreeBodyRenderError(
      `The free-body canvas (${quantize(width)} × ${quantize(height)} px) cannot hold the diagram.`,
    );
  }
  const centerX = (region.minX + region.maxX) / 2;
  const centerY = (region.minY + region.maxY) / 2;
  const project = (point: Frame): Px => ({
    x: width / 2 + (point.x - centerX) * scale,
    y: height / 2 - (point.y - centerY) * scale,
  });

  /* ---- declarations -------------------------------------------- */

  const env: Emitter = { block, resolved, tokens, project, scale, base, axesHalf };
  const decoration: string[] = [];
  const labels: string[] = [];
  block.declarations.forEach((declaration, index) => {
    const emitted = emitDeclaration(declaration, index, env);
    if (emitted.shapes !== "") {
      decoration.push(
        `<g id="${base}-n-${quantize(index)}" class="aze-free-body-${declaration.kind}"` +
          ` aria-hidden="true">${emitted.shapes}</g>`,
      );
    }
    if (emitted.text !== "") labels.push(emitted.text);
  });

  // An authored `bounds:` clips: an object outside it is clipped, never dropped.
  const clipId = `${base}-clip`;
  const clipCorner =
    authoredBounds === undefined ? undefined : project({ x: region.minX, y: region.maxY });
  const defs =
    clipCorner === undefined
      ? ""
      : `<defs><clipPath id="${clipId}"><rect x="${quantize(clipCorner.x)}"` +
        ` y="${quantize(clipCorner.y)}"` +
        ` width="${quantize((region.maxX - region.minX) * scale)}"` +
        ` height="${quantize((region.maxY - region.minY) * scale)}"/></clipPath></defs>`;
  const clip = clipCorner === undefined ? "" : ` clip-path="url(#${clipId})"`;

  const authoredId = block.id;
  const idAttribute = authoredId === undefined ? "" : ` data-free-body-id="${escapeXml(authoredId)}"`;
  const numberAttribute = block.number === true ? ' data-free-body-number="true"' : "";
  const svg =
    `<svg xmlns="${SVG_NAMESPACE}" viewBox="0 0 ${quantize(width)} ${quantize(height)}"` +
    ` width="${quantize(width)}" height="${quantize(height)}" role="img"` +
    ` aria-labelledby="${base}-title ${base}-desc">` +
    `<title id="${base}-title">${escapeXml(freeBodyTitle(block, ordinal))}</title>` +
    `<desc id="${base}-desc">${escapeXml(describeFreeBody(block))}</desc>` +
    defs +
    (decoration.length === 0
      ? ""
      : `<g class="aze-free-body-decoration"${clip} aria-hidden="true">${decoration.join("")}</g>`) +
    (labels.length === 0 ? "" : `<g class="aze-free-body-text"${clip}>${labels.join("")}</g>`) +
    `</svg>`;
  assertFreeBodyFragmentSafe(svg);
  return `<figure class="aze-free-body" id="${base}"${idAttribute}${numberAttribute}>${svg}</figure>`;
}

/**
 * Fingerprint closure for the rendered-artifact hash (contract §12): the
 * emitter version, the quantization rule, the evaluator version and the
 * `scale:` policy all ride in it, because each one can change a rendered
 * coordinate. Nothing here reads the Block.
 */
export function freeBodyDependencyClosure(): JsonValue {
  return Object.freeze({
    emitter: FREE_BODY_EMITTER_VERSION,
    quantization: QUANTIZATION_VERSION,
    eval: FREE_BODY_EVALUATOR_VERSION,
    scale: FREE_BODY_SCALE_POLICY_VERSION,
  });
}

/** The re-id pattern every format reuses: one renderer id, this version range. */
export const freeBodyHtmlBlockRenderer: FigureBlockRenderer<FreeBodyBlock> = Object.freeze({
  descriptor: Object.freeze({
    id: FREE_BODY_HTML_BLOCK_RENDERER_ID,
    version: FREE_BODY_HTML_BLOCK_RENDERER_VERSION,
    blockType: FREE_BODY_PLUGIN_TYPE,
    pluginVersionRange: FREE_BODY_PLUGIN_VERSION,
    rendererId: "html",
    rendererVersionRange: "1.0.0",
  }),
  render(block: FreeBodyBlock, context: RenderContext): string {
    return renderFreeBodyFragment(block, context);
  },
});
