/**
 * The compiler-owned canonical TeX SVG projection
 * (`azeforge.tex-svg-normalizer/v2`).
 *
 * The trusted TeX renderer returns dvisvgm-shaped XML: an XML declaration, a
 * generator comment, single-quoted attributes, per-page identifiers (`page1`,
 * `pgfcp1`), and six-decimal geometry. This module parses that document and
 * re-serializes one canonical projection rather than rewriting the text, so a
 * construct a textual rewrite cannot see — a nested `<script>`, an undeclared
 * prefix, an external reference, a reference to an identifier no element
 * declares — can never reach a published Artifact.
 *
 * Five rules hold for the projection:
 *
 * - every identifier is prefixed with the figure's batch index, so inline
 *   figures in one HTML Artifact share the document identifier space without
 *   collision;
 * - every reference (`#id`, `url(#id)`) is rewritten to its prefixed target,
 *   and a reference to an identifier the figure does not declare is refused;
 * - comments, the XML declaration, generator metadata, and whitespace-only
 *   formatting text are dropped, and attributes serialize in one fixed order
 *   with one escaping rule, so equivalent documents produce identical bytes;
 * - generated numbers — geometry attributes and path/transform data — are
 *   quantized to six decimal places, while authored text is never touched;
 * - the compiler injects the authored `title` and `description` as the root's
 *   accessible `<title>` and `<desc>` and marks the root `role="img"`.
 *
 * One projection is embedded unchanged in the HTML layout, so HTML, SVG, PNG,
 * and PDF Artifacts all derive from the same validated SVG.
 */

import { SaxesParser } from "saxes";

import { MAX_IMAGE_DIMENSION_PX } from "./assets.js";
import type { TexProfile } from "./tex-schemas.js";

/** The frozen normalizer contract this module implements. */
export const TEX_SVG_NORMALIZER_VERSION = "azeforge.tex-svg-normalizer/v2" as const;

/** One stable reason a renderer SVG cannot become a canonical projection. */
export type TexSvgRejection =
  | "malformed"
  | "unsafe"
  | "external"
  | "reference"
  | "dimensions";

/** The renderer returned an SVG outside the canonical projection contract. */
export class TexSvgError extends Error {
  override readonly name = "TexSvgError";

  constructor(readonly rejection: TexSvgRejection) {
    super(rejection);
  }
}

export interface TexSvgProjectionOptions {
  /** The renderer's raw SVG document. */
  readonly svg: string;
  /** This figure's zero-based index in the one renderer batch. */
  readonly requestIndex: number;
  /** Authored accessible title; the compiler owns this text. */
  readonly title: string;
  /** Authored accessible description; the compiler owns this text. */
  readonly description: string;
}

export interface TexFigureFragmentOptions extends TexSvgProjectionOptions {
  readonly profile: TexProfile;
}

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const NAMESPACE_ATTRIBUTE = /^xmlns(?::|$)/;

/**
 * Elements that make the figure executable, remote, animated, or dependent on
 * selectors the projection cannot rewrite. The renderer never produces them;
 * their presence means output is outside the contract. An internal `<style>`
 * element is refused because it addresses identifiers and references textually
 * — the projection namespaces those, so a preserved stylesheet could silently
 * stop applying.
 */
const FORBIDDEN_ELEMENTS: Readonly<Record<string, true>> = {
  animate: true,
  animatecolor: true,
  animatemotion: true,
  animatetransform: true,
  audio: true,
  discard: true,
  embed: true,
  foreignobject: true,
  handler: true,
  iframe: true,
  listener: true,
  object: true,
  script: true,
  set: true,
  style: true,
  video: true,
};

/** Elements whose text content is significant and never treated as indentation. */
const TEXT_CONTENT_ELEMENTS: Readonly<Record<string, true>> = {
  altglyph: true,
  desc: true,
  text: true,
  textpath: true,
  title: true,
  tref: true,
  tspan: true,
};

/**
 * Attributes whose values are generated numbers — a scalar, a unit-suffixed
 * length, a number list, or path/transform grammar. Only these are quantized:
 * every other attribute (an identifier, a paint, a class, an accessible name,
 * a CSS `style`) is carried through exactly as the renderer wrote it, so
 * text-bearing values keep their authored precision.
 */
const NUMERIC_ATTRIBUTES: Readonly<Record<string, true>> = {
  amplitude: true,
  "baseline-shift": true,
  basefrequency: true,
  cx: true,
  cy: true,
  d: true,
  diffuseconstant: true,
  dx: true,
  dy: true,
  exponent: true,
  "fill-opacity": true,
  "flood-opacity": true,
  "font-size": true,
  gradienttransform: true,
  height: true,
  "horiz-adv-x": true,
  "horiz-origin-x": true,
  "horiz-origin-y": true,
  k1: true,
  k2: true,
  k3: true,
  k4: true,
  kernelmatrix: true,
  kernelunitlength: true,
  keysplines: true,
  keytimes: true,
  "letter-spacing": true,
  limitingconeangle: true,
  markerheight: true,
  markerwidth: true,
  offset: true,
  opacity: true,
  pathlength: true,
  patterntransform: true,
  points: true,
  pointsatx: true,
  pointsaty: true,
  pointsatz: true,
  r: true,
  refx: true,
  refy: true,
  rx: true,
  ry: true,
  scale: true,
  specularconstant: true,
  specularexponent: true,
  startoffset: true,
  stddeviation: true,
  "stop-opacity": true,
  "stroke-dasharray": true,
  "stroke-dashoffset": true,
  "stroke-miterlimit": true,
  "stroke-opacity": true,
  "stroke-width": true,
  surfacescale: true,
  tablevalues: true,
  targetx: true,
  targety: true,
  textlength: true,
  transform: true,
  values: true,
  "vert-adv-y": true,
  "vert-origin-x": true,
  "vert-origin-y": true,
  viewbox: true,
  width: true,
  "word-spacing": true,
  x: true,
  x1: true,
  x2: true,
  y: true,
  y1: true,
  y2: true,
  z: true,
};

/** The one escaping table for text nodes and attribute values. */
const XML_ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

const NUMBER_TOKEN = /-?(?:\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?/g;
const URL_REFERENCE = /url\(\s*(?:'([^']*)'|"([^"]*)"|([^)"'\s]*))\s*\)/gi;
const EXTERNAL_STYLE = /@import/i;
const SVG_LENGTH = /^([+-]?(?:\d+\.?\d*|\.\d+))(px|pt|pc|mm|cm|in|em|ex)?$/;



interface ElementNode {
  readonly name: string;
  readonly attributes: Map<string, string>;
  children: (ElementNode | TextNode)[];
}

interface TextNode {
  readonly text: string;
}

type Node = ElementNode | TextNode;

function isElement(node: Node): node is ElementNode {
  return "name" in node;
}

/** The local part of a qualified XML name (`xlink:href` → `href`). */
function localName(name: string): string {
  const colon = name.indexOf(":");
  return colon < 0 ? name : name.slice(colon + 1);
}

/** One numeric token, quantized to six decimals in a canonical decimal spelling. */
function quantizeToken(raw: string): string {
  const value = Number(raw);
  if (!Number.isFinite(value) || Math.abs(value) >= 1e21) return raw;
  const rounded = Math.round(value * 1e6) / 1e6;
  if (Object.is(rounded, -0)) return "0";
  const fixed = rounded.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
  return fixed === "" || fixed === "-" ? "0" : fixed;
}

/**
 * Parses the renderer document into a node tree. A parse error, a document
 * type declaration, and a document without exactly one root element are all
 * `malformed`: the normalizer never repairs XML it cannot read.
 */
function parseDocument(svg: string): ElementNode {
  const failures: TexSvgRejection[] = [];
  const roots: ElementNode[] = [];
  const stack: ElementNode[] = [];
  const parser = new SaxesParser({ xmlns: false, position: false });
  const append = (node: Node): void => {
    const parent = stack[stack.length - 1];
    if (parent !== undefined) {
      parent.children.push(node);
    } else if (isElement(node)) {
      roots.push(node);
    }
  };
  parser.on("error", () => {
    failures.push("malformed");
  });
  parser.on("doctype", () => {
    failures.push("malformed");
  });
  parser.on("opentag", (tag) => {
    const attributes = new Map<string, string>();
    for (const [name, value] of Object.entries(tag.attributes)) {
      attributes.set(name, value);
    }
    const node: ElementNode = { name: tag.name, attributes, children: [] };
    append(node);
    stack.push(node);
  });
  parser.on("closetag", () => {
    stack.pop();
  });
  parser.on("text", (value) => {
    append({ text: value });
  });
  parser.on("cdata", (value) => {
    append({ text: value });
  });
  parser.write(svg).close();
  const failure = failures[0];
  if (failure !== undefined) throw new TexSvgError(failure);
  const root = roots[0];
  if (root === undefined || roots.length !== 1 || stack.length !== 0) {
    throw new TexSvgError("malformed");
  }
  return root;
}

function findAttribute(element: ElementNode, local: string): string | undefined {
  for (const [name, value] of element.attributes) {
    if (localName(name).toLowerCase() === local) return value;
  }
  return undefined;
}

interface Scan {
  readonly prefixes: Set<string>;
  readonly identifiers: Set<string>;
  readonly references: string[];
}

/**
 * Walks the whole tree once, refusing every construct the projection contract
 * forbids and collecting the identifier/reference pairs the rewrite needs.
 * Validation is total: no later step inspects the input again.
 */
function scanElement(element: ElementNode, scan: Scan): void {
  const name = localName(element.name).toLowerCase();
  const elementColon = element.name.indexOf(":");
  if (elementColon >= 0 && !scan.prefixes.has(element.name.slice(0, elementColon))) {
    throw new TexSvgError("malformed");
  }
  if (FORBIDDEN_ELEMENTS[name] === true) throw new TexSvgError("unsafe");
  for (const [attribute, value] of element.attributes) {
    if (NAMESPACE_ATTRIBUTE.test(attribute)) {
      if (attribute.startsWith("xmlns:")) scan.prefixes.add(attribute.slice("xmlns:".length));
      continue;
    }
    const colon = attribute.indexOf(":");
    if (colon >= 0 && !scan.prefixes.has(attribute.slice(0, colon))) {
      throw new TexSvgError("malformed");
    }
    const local = localName(attribute).toLowerCase();
    if (/^on[a-z]/.test(local)) throw new TexSvgError("unsafe");
    if (local === "id") scan.identifiers.add(value);
    if (local === "style" && EXTERNAL_STYLE.test(value)) throw new TexSvgError("external");
    if (local === "href") {
      if (value.startsWith("#")) scan.references.push(value.slice(1));
      else if (!value.startsWith("data:image/")) throw new TexSvgError("external");
    }
    for (const reference of value.matchAll(URL_REFERENCE)) {
      const target = reference[1] ?? reference[2] ?? reference[3] ?? "";
      if (target.startsWith("#")) scan.references.push(target.slice(1));
      else if (!target.startsWith("data:image/")) throw new TexSvgError("external");
    }
  }
  for (const child of element.children) {
    if (isElement(child)) scanElement(child, scan);
  }
}

/** Rewrites one tree into its canonical, namespaced, quantized projection. */
function normalizeElement(element: ElementNode, prefix: string): ElementNode | undefined {
  const name = localName(element.name).toLowerCase();
  // Generator metadata is non-visual; the projection carries its own.
  if (name === "metadata") return undefined;
  const attributes = new Map<string, string>();
  for (const [attribute, raw] of element.attributes) {
    const local = localName(attribute).toLowerCase();
    let value = raw;
    if (local === "id") {
      value = `${prefix}${value}`;
    } else if (local === "href" && value.startsWith("#")) {
      value = `#${prefix}${value.slice(1)}`;
    } else if (value.includes("url(")) {
      value = value.replace(
        URL_REFERENCE,
        (match, single: string | undefined, double: string | undefined, bare: string | undefined) => {
          const target = single ?? double ?? bare ?? "";
          return target.startsWith("#") ? `url(#${prefix}${target.slice(1)})` : match;
        },
      );
    }
    // Replace dvisvgm's fixed default ink so the figure inherits its Artifact theme.
    if ((local === "fill" || local === "stroke") && /^(?:#000|#000000|black)$/i.test(value)) {
      value = "currentColor";
    }
    if (NUMERIC_ATTRIBUTES[local] === true) {
      value = value.replace(NUMBER_TOKEN, quantizeToken);
    }
    attributes.set(attribute, value);
  }
  const children: (ElementNode | TextNode)[] = [];
  for (const child of element.children) {
    if (isElement(child)) {
      const normalized = normalizeElement(child, prefix);
      if (normalized !== undefined) children.push(normalized);
      continue;
    }
    // The renderer's pretty-printing indentation is not document content.
    if (child.text.trim() === "" && TEXT_CONTENT_ELEMENTS[name] !== true) continue;
    children.push(child);
  }
  return { name: element.name, attributes, children };
}

function serializeNode(node: Node): string {
  if (!isElement(node)) {
    return node.text.replace(/[&<>"]/g, (character) => XML_ESCAPES[character] ?? character);
  }
  const names = [...node.attributes.keys()].sort((left, right) => {
    const leftNamespace = NAMESPACE_ATTRIBUTE.test(left) ? 0 : 1;
    const rightNamespace = NAMESPACE_ATTRIBUTE.test(right) ? 0 : 1;
    if (leftNamespace !== rightNamespace) return leftNamespace - rightNamespace;
    return left < right ? -1 : left > right ? 1 : 0;
  });
  const attributes = names
    .map((name) => {
      const value = (node.attributes.get(name) ?? "").replace(
        /[&<>"]/g,
        (character) => XML_ESCAPES[character] ?? character,
      );
      return ` ${name}="${value}"`;
    })
    .join("");
  if (node.children.length === 0) return `<${node.name}${attributes}/>`;
  return `<${node.name}${attributes}>${node.children.map(serializeNode).join("")}</${node.name}>`;
}

/** Refuses a figure without finite, bounded intrinsic geometry. */
function assertIntrinsicExtent(root: ElementNode): void {
  const viewBox = findAttribute(root, "viewbox");
  if (viewBox !== undefined) {
    const parts = viewBox.trim().split(/[\s,]+/).map(Number);
    const width = parts[2];
    const height = parts[3];
    if (
      parts.length !== 4 ||
      parts.some((part) => !Number.isFinite(part)) ||
      width === undefined ||
      height === undefined ||
      width <= 0 ||
      height <= 0 ||
      width > MAX_IMAGE_DIMENSION_PX ||
      height > MAX_IMAGE_DIMENSION_PX
    ) {
      throw new TexSvgError("dimensions");
    }
    return;
  }
  for (const attribute of ["width", "height"] as const) {
    const raw = findAttribute(root, attribute);
    const match = raw === undefined ? null : SVG_LENGTH.exec(raw.trim());
    const value = match?.[1] === undefined ? undefined : Number(match[1]);
    if (
      value === undefined ||
      !Number.isFinite(value) ||
      value <= 0 ||
      value > MAX_IMAGE_DIMENSION_PX
    ) {
      throw new TexSvgError("dimensions");
    }
  }
}

/**
 * Parses, validates, namespaces, and canonically re-serializes one renderer
 * SVG as the projection embedded in the HTML layout. Throws `TexSvgError` for
 * every rejection, so a caller never publishes a partial or unsafe figure.
 */
export function projectTexSvg(options: TexSvgProjectionOptions): string {
  const root = parseDocument(options.svg);
  if (localName(root.name).toLowerCase() !== "svg") throw new TexSvgError("malformed");
  if (root.attributes.get("xmlns") !== SVG_NAMESPACE) throw new TexSvgError("malformed");
  const scan: Scan = {
    // `xml` is bound implicitly by XML itself (`xml:space`, `xml:lang`).
    prefixes: new Set(["xml"]),
    identifiers: new Set(),
    references: [],
  };
  scanElement(root, scan);
  for (const reference of scan.references) {
    if (!scan.identifiers.has(reference)) throw new TexSvgError("reference");
  }
  const prefix = `tex-${options.requestIndex}-`;
  const normalized = normalizeElement(root, prefix);
  if (normalized === undefined) throw new TexSvgError("malformed");
  if (normalized.attributes.get("role") === undefined) normalized.attributes.set("role", "img");
  // The compiler owns accessibility metadata: a renderer's own root-level
  // `<title>`/`<desc>` are replaced, never duplicated.
  normalized.children = normalized.children.filter((child) => {
    if (!isElement(child)) return true;
    const local = localName(child.name).toLowerCase();
    return local !== "title" && local !== "desc";
  });
  normalized.children.unshift(
    { name: "title", attributes: new Map(), children: [{ text: options.title }] },
    { name: "desc", attributes: new Map(), children: [{ text: options.description }] },
  );
  assertIntrinsicExtent(normalized);
  return serializeNode(normalized);
}

/**
 * The HTML layout fragment: the canonical projection inside the
 * compiler-owned figure that carries the profile the renderer was asked for.
 */
export function texFigureFragment(options: TexFigureFragmentOptions): string {
  return `<figure class="aze-tex" data-tex-profile="${options.profile}">${projectTexSvg(options)}</figure>`;
}
