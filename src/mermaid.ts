import { arch, platform } from "node:os";

import { createDiagnostic } from "./diagnostics.js";
import { sha256 } from "./hash.js";
import {
  CHROME_HEADLESS_SHELL_VERSION,
  MermaidBrowserParseError,
  MermaidBrowserUnavailableError,
  renderMermaidInBrowser,
} from "./mermaid-browser.js";
import type {
  AzeBlockPlugin,
  Diagnostic,
  JsonValue,
  MermaidBlock,
  MermaidBlockRenderer,
  SourceRange,
  Theme,
} from "./model.js";
import { SaxesParser } from "saxes";
import { defaultTheme } from "./theme.js";

export const MERMAID_PLUGIN_TYPE = "mermaid" as const;
export const MERMAID_PLUGIN_VERSION = "1.0.0" as const;
export const MERMAID_BODY_SYNTAX_ID = "azeforge.mermaid/v1" as const;
export const MERMAID_BODY_SYNTAX_VERSION = "1.0.0" as const;
/** Pinned Mermaid version per the HTML-first output decision (#10). */
export const MERMAID_VERSION = "11.17.2" as const;
export const MERMAID_HTML_BLOCK_RENDERER_ID =
  "azeforge.mermaid.html/v1" as const;
export const MERMAID_HTML_BLOCK_RENDERER_VERSION = "1.0.0" as const;
export const MAX_MERMAID_SOURCE_LENGTH = 8000;
export const MAX_MERMAID_TEXT_LENGTH = 8000;

export {
  CHROME_HEADLESS_SHELL_VERSION,
  MermaidBrowserParseError,
  MermaidBrowserUnavailableError,
};

export const mermaidSourceSchema: JsonValue = Object.freeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "azeforge.mermaid/source/v1",
  type: "object",
  additionalProperties: false,
  properties: {
    id: {
      type: "string",
      pattern: "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$",
    },
    title: { type: "string", minLength: 1, maxLength: 200 },
    description: { type: "string", minLength: 1, maxLength: 1000 },
  },
});

export const mermaidDataSchema: JsonValue = Object.freeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "azeforge.mermaid/data/v1",
  type: "object",
  additionalProperties: false,
  required: ["diagramType", "source", "pluginVersion"],
  properties: {
    kind: { const: "mermaid" },
    diagramType: { type: "string", minLength: 1 },
    source: { type: "string", minLength: 1, maxLength: 8000 },
    pluginVersion: { const: "1.0.0" },
    title: { type: "string", minLength: 1, maxLength: 200 },
    description: { type: "string", minLength: 1, maxLength: 1000 },
  },
});

export class MermaidSanitizerError extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(reason);
    this.reason = reason;
  }
}

export interface MermaidHeader {
  readonly id?: string;
  readonly title?: string;
  readonly description?: string;
  readonly diagnostics: readonly Diagnostic[];
}

function headerDiagnostic(
  code: string,
  message: string,
  range: SourceRange,
  sourceName: string | undefined,
  extra: {
    readonly suggestion?: string;
    readonly data?: Readonly<Record<string, JsonValue>>;
  } = {},
): Diagnostic {
  return createDiagnostic(code, "error", message, {
    location:
      sourceName === undefined ? { range } : { source: sourceName, range },
    ...(extra.suggestion === undefined
      ? {}
      : { suggestion: extra.suggestion }),
    ...(extra.data === undefined ? {} : { data: extra.data }),
  });
}

export function parseMermaidHeader(
  entries: readonly {
    readonly key: string;
    readonly value: string;
    readonly range: SourceRange;
  }[],
  _blockRange: SourceRange,
  sourceName: string | undefined,
): MermaidHeader {
  const diagnostics: Diagnostic[] = [];
  let id: string | undefined;
  let title: string | undefined;
  let description: string | undefined;
  for (const entry of entries) {
    if (entry.key === "id") {
      if (entry.value.length === 0) {
        diagnostics.push(
          headerDiagnostic(
            "azeforge.mermaid#invalid-attribute",
            "Mermaid attribute id must not be empty.",
            entry.range,
            sourceName,
            { data: { attribute: "id", value: entry.value } },
          ),
        );
      } else {
        id = entry.value;
      }
      continue;
    }
    if (entry.key === "title") {
      if (entry.value.length === 0 || entry.value.length > 200) {
        diagnostics.push(
          headerDiagnostic(
            "azeforge.mermaid#invalid-attribute",
            "Mermaid attribute title must be 1..200 characters.",
            entry.range,
            sourceName,
            { data: { attribute: "title" } },
          ),
        );
      } else {
        title = entry.value;
      }
      continue;
    }
    if (entry.key === "description") {
      if (entry.value.length === 0 || entry.value.length > 1000) {
        diagnostics.push(
          headerDiagnostic(
            "azeforge.mermaid#invalid-attribute",
            "Mermaid attribute description must be 1..1000 characters.",
            entry.range,
            sourceName,
            { data: { attribute: "description" } },
          ),
        );
      } else {
        description = entry.value;
      }
      continue;
    }
    diagnostics.push(
      headerDiagnostic(
        "azeforge.mermaid#invalid-attribute",
        `Mermaid attribute "${entry.key}" is not a valid mermaid attribute.`,
        entry.range,
        sourceName,
        {
          suggestion: "Valid mermaid attributes are id, title, and description.",
          data: { attribute: entry.key },
        },
      ),
    );
  }
  return {
    ...(id === undefined ? {} : { id }),
    ...(title === undefined ? {} : { title }),
    ...(description === undefined ? {} : { description }),
    diagnostics,
  };
}

const SUPPORTED_DIAGRAMS: Readonly<Record<string, true>> = {
  flowchart: true,
  graph: true,
  sequencediagram: true,
  classdiagram: true,
  statediagram: true,
  "statediagram-v2": true,
  erdiagram: true,
  pie: true,
  gantt: true,
  journey: true,
  mindmap: true,
};

function diagramKey(firstLine: string): string | undefined {
  const head = firstLine.trim().split(/[\s(:]+/, 2)[0]?.toLowerCase() ?? "";
  if (head === "") return undefined;
  // "flowchart TD" -> flowchart; "stateDiagram-v2" normalizes below.
  const normalized = head.replace(/_/g, "");
  if (SUPPORTED_DIAGRAMS[normalized] === true) return normalized;
  if (normalized === "statediagram-v2" || normalized === "statediagramv2") {
    return "statediagram-v2";
  }
  return undefined;
}

function canonicalDiagramType(key: string, firstLine: string): string {
  if (key === "flowchart" || key === "graph") {
    const direction = firstLine.trim().split(/\s+/)[1]?.toUpperCase();
    if (
      direction === "TD" ||
      direction === "TB" ||
      direction === "BT" ||
      direction === "LR" ||
      direction === "RL"
    ) {
      return key === "graph" ? `graph ${direction}` : `flowchart ${direction}`;
    }
    return key;
  }
  if (key === "sequencediagram") return "sequenceDiagram";
  if (key === "classdiagram") return "classDiagram";
  if (key === "statediagram" || key === "statediagram-v2") {
    return firstLine.trim().startsWith("stateDiagram-v2")
      ? "stateDiagram-v2"
      : "stateDiagram";
  }
  if (key === "erdiagram") return "erDiagram";
  return key;
}

const ACTIVE_CONTENT_PATTERNS: readonly { pattern: RegExp; kind: string }[] = [
  { pattern: /<\s*script[\s>]/i, kind: "script element" },
  { pattern: /<\s*(iframe|object|embed|foreignobject|math)[\s>]/i, kind: "embedded element" },
  { pattern: /\bon\w+\s*=/i, kind: "event handler" },
  { pattern: /javascript\s*:/i, kind: "javascript URL" },
  { pattern: /data\s*:\s*text\/html/i, kind: "data URL" },
  { pattern: /<\s*style[\s>]/i, kind: "style element" },
  { pattern: /url\s*\(\s*["']?(https?:|data:)/i, kind: "external style URL" },
];

export interface ValidatedMermaid {
  readonly block?: MermaidBlock;
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Synchronous Source preflight. Deep syntax is owned by pinned Mermaid in
 * the isolated browser at compile time; this gate rejects empty,
 * over-long, active-content, external-resource, and unknown-diagram input
 * so obvious failures surface at parse with a stable diagnostic.
 */
export function validateMermaidBody(options: {
  readonly header: MermaidHeader;
  readonly body: string;
  readonly bodyRanges: readonly SourceRange[];
  readonly blockRange: SourceRange;
  readonly sourceName: string | undefined;
}): ValidatedMermaid {
  const { header, body, bodyRanges, blockRange, sourceName } = options;
  const location = (range: SourceRange) =>
    sourceName === undefined ? { range } : { source: sourceName, range };
  const trimmed = body.trim();
  if (trimmed.length === 0) {
    return {
      diagnostics: [
        createDiagnostic(
          "azeforge.mermaid#empty",
          "error",
          "The mermaid Block must contain diagram Source.",
          {
            location: location(blockRange),
            suggestion: "Add a flowchart such as flowchart TD.",
          },
        ),
      ],
    };
  }
  if (trimmed.length > MAX_MERMAID_SOURCE_LENGTH) {
    return {
      diagnostics: [
        createDiagnostic(
          "azeforge.mermaid#invalid-syntax",
          "error",
          "The mermaid Block exceeds the maximum supported length.",
          {
            location: location(bodyRanges[0] ?? blockRange),
            data: { length: trimmed.length },
          },
        ),
      ],
    };
  }
  for (const { pattern, kind } of ACTIVE_CONTENT_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        diagnostics: [
          createDiagnostic(
            "azeforge.mermaid#active-content",
            "error",
            `The mermaid Block contains forbidden active content (${kind}).`,
            {
              location: location(bodyRanges[0] ?? blockRange),
              suggestion: "Remove executable markup; labels must be plain text.",
              data: { kind },
            },
          ),
        ],
      };
    }
  }
  if (/^\s*click\b/m.test(trimmed)) {
    return {
      diagnostics: [
        createDiagnostic(
          "azeforge.mermaid#external-resource",
          "error",
          "The mermaid Block links to an external resource.",
          {
            location: location(bodyRanges[0] ?? blockRange),
            suggestion: "Remove click directives; offline diagrams cannot dereference links.",
            data: { construct: "click" },
          },
        ),
      ],
    };
  }
  const lines = trimmed.split("\n").filter((line) => line.trim().length > 0);
  const firstContent = lines.find((line) => !line.trim().startsWith("%%")) ?? "";
  const key = diagramKey(firstContent);
  if (key === undefined) {
    return {
      diagnostics: [
        createDiagnostic(
          "azeforge.mermaid#unsupported-diagram",
          "error",
          "The mermaid Block names an unsupported diagram type.",
          {
            location: location(bodyRanges[0] ?? blockRange),
            suggestion:
              "Use flowchart, sequenceDiagram, classDiagram, stateDiagram, erDiagram, pie, gantt, journey, or mindmap.",
          },
        ),
      ],
    };
  }
  const diagramType = canonicalDiagramType(key, firstContent);
  const block: MermaidBlock = {
    kind: "mermaid",
    range: blockRange,
    ...(header.id === undefined ? {} : { id: header.id }),
    pluginVersion: MERMAID_PLUGIN_VERSION,
    diagramType,
    source: trimmed,
    ...(header.title === undefined ? {} : { title: header.title }),
    ...(header.description === undefined
      ? {}
      : { description: header.description }),
  };
  return { block: Object.freeze(block), diagnostics: [] };
}

export function deriveMermaidSeed(options: {
  readonly source: string;
  readonly ordinal: number;
  readonly pluginVersion: string;
  readonly theme: Pick<Theme, "id" | "version">;
  readonly mermaidVersion?: string;
}): string {
  return sha256(
    JSON.stringify({
      source: options.source,
      ordinal: options.ordinal,
      pluginVersion: options.pluginVersion,
      theme: `${options.theme.id}@${options.theme.version}`,
      mermaid: options.mermaidVersion ?? MERMAID_VERSION,
    }),
  ).slice("sha256:".length, "sha256:".length + 16);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function defaultAccessibleName(block: MermaidBlock): string {
  const firstNode = [...block.source.split("\n")]
    .map((line) => line.trim())
    .find(
      (line) =>
        line !== "" &&
        !line.startsWith("%%") &&
        !/^(flowchart|graph|sequencediagram|classdiagram|statediagram|erdiagram|pie|gantt|journey|mindmap)\b/i.test(
          line,
        ),
    );
  if (firstNode !== undefined) return firstNode.slice(0, 120);
  return `${block.diagramType} diagram`;
}

/**
 * Render pinned Mermaid in the isolated browser and return sanitized SVG.
 * Every advertised diagram family executes through real Mermaid 11.17.2;
 * deep syntax failures surface as MermaidBrowserParseError so the Compiler
 * can report one scoped invalid-syntax diagnostic with no Artifact.
 */
export async function renderMermaidSvg(
  block: MermaidBlock,
  options: {
    readonly ordinal: number;
    readonly theme: Theme;
  },
): Promise<string> {
  const seed = deriveMermaidSeed({
    source: block.source,
    ordinal: options.ordinal,
    pluginVersion: block.pluginVersion,
    theme: options.theme,
  });
  const rendered = await renderMermaidInBrowser({
    source: block.source,
    elementId: `aze-m-${options.ordinal}-render`,
    seed,
    theme: options.theme,
  });
  const namespaced = namespaceMermaidIds(rendered.svg, options.ordinal);
  const accessible = injectAccessibleName(namespaced, {
    ordinal: options.ordinal,
    title: block.title ?? defaultAccessibleName(block),
    ...(block.description === undefined
      ? {}
      : { description: block.description }),
    seed,
    diagramType: block.diagramType,
  });
  return sanitizeMermaidSvg(accessible, { ordinal: options.ordinal });
}

/**
 * Deterministically rewrite every surviving id into the
 * aze-m-<ordinal> namespace and update local references. Mermaid can emit
 * the same id more than once; each occurrence receives a unique name
 * (`-r<k>` suffix from the second occurrence on) while references resolve
 * to the first occurrence, matching document lookup behavior. Ordering is
 * stable because Mermaid output is deterministic under a fixed seed.
 */
function namespaceMermaidIds(svg: string, ordinal: number): string {
  const prefix = `aze-m-${ordinal}`;
  const renderId = `${prefix}-render`;
  let counter = 0;
  const firstNew = new Map<string, string>();
  const occurrences = new Map<string, number>();
  // Render-root id, when referenced, resolves to the namespaced root.
  firstNew.set(renderId, prefix);
  const out = svg.replace(/ id="([^"]+)"/g, (whole, old: string) => {
    if (old === "" || old === renderId) {
      return old === "" ? whole : ` id="${prefix}"`;
    }
    const seen = (occurrences.get(old) ?? 0) + 1;
    occurrences.set(old, seen);
    if (seen === 1) {
      counter += 1;
      const next = `${prefix}-n-${counter}`;
      firstNew.set(old, next);
      return ` id="${next}"`;
    }
    return ` id="${firstNew.get(old) ?? `${prefix}-n-0`}-r${seen}"`;
  });
  const resolveReference = (old: string): string => firstNew.get(old) ?? old;
  // url() and aria references are live (marker and accessibility hooks);
  // href/xlink:href are rejected unconditionally by the sanitizer, so no
  // rewriting for them exists here by design.
  const withReferences = out
    .replaceAll(/url\(#([^)]+)\)/g, (_whole: string, old: string) =>
      `url(#${resolveReference(old)})`,
    )
    .replaceAll(
      /aria-(labelledby|describedby)="([^"]*)"/g,
      (_whole: string, kind: string, refs: string) => {
        const rewritten = refs
          .split(/[\s,]+/)
          .filter((ref) => ref !== "")
          .map((ref) => resolveReference(ref))
          .join(" ");
        return `aria-${kind}="${rewritten}"`;
      },
    );
  // Defense in depth: the browser normalizer already strips these, but
  // raw Mermaid output must never contribute executable styling or
  // unnamespaced hooks to the Artifact.
  return withReferences
    .replaceAll(/ class="[^"]*"/g, "")
    .replaceAll(/ data-[a-zA-Z0-9_-]+="[^"]*"/g, "")
    .replaceAll(/ name="[^"]*"/g, "");
}

function injectAccessibleName(
  svg: string,
  options: {
    readonly ordinal: number;
    readonly title: string;
    readonly description?: string;
    readonly seed: string;
    readonly diagramType: string;
  },
): string {
  const prefix = `aze-m-${options.ordinal}`;
  const openMatch = /^<svg([^>]*)>/.exec(svg);
  if (openMatch === null) throw new MermaidSanitizerError("SVG misses its root element.");
  const rawAttrs = openMatch[1] ?? "";
  const kept = rawAttrs
    .replace(/ id="[^"]*"/g, "")
    .replace(/ class="[^"]*"/g, "")
    .replace(/ style="[^"]*"/g, "")
    .replace(/ width="[^"]*"/g, "")
    .replace(/ height="[^"]*"/g, "")
    .replace(/ role="[^"]*"/g, "")
    .replace(/ aria-[a-z-]*="[^"]*"/g, "");
  const describedby =
    options.description === undefined
      ? ""
      : ` aria-describedby="${prefix}-desc"`;
  const opening =
    `<svg${kept} id="${prefix}" role="img" aria-labelledby="${prefix}-title"${describedby}` +
    ` data-seed="${options.seed}" data-diagram="${escapeXml(options.diagramType)}">`;
  const title = `<title id="${prefix}-title">${escapeXml(options.title)}</title>`;
  const desc =
    options.description === undefined
      ? ""
      : `<desc id="${prefix}-desc">${escapeXml(options.description)}</desc>`;
  const rest = svg.slice(openMatch[0].length);
  return `${opening}${title}${desc}${rest}`;
}

const ALLOWED_ELEMENTS: Readonly<Record<string, true>> = {
  svg: true,
  g: true,
  defs: true,
  marker: true,
  filter: true,
  fedropshadow: true,
  fegaussianblur: true,
  lineargradient: true,
  radialgradient: true,
  stop: true,
  clippath: true,
  mask: true,
  symbol: true,
  switch: true,
  rect: true,
  circle: true,
  ellipse: true,
  polygon: true,
  polyline: true,
  line: true,
  path: true,
  text: true,
  tspan: true,
  textpath: true,
  title: true,
  desc: true,
};

const ROOT_ONLY_ATTRIBUTES: Readonly<Record<string, true>> = {
  xmlns: true,
  role: true,
  "aria-labelledby": true,
  "aria-describedby": true,
  "data-seed": true,
  "data-diagram": true,
};

const GLOBAL_ATTRIBUTES: Readonly<Record<string, true>> = {
  id: true,
  x: true,
  y: true,
  x1: true,
  y1: true,
  x2: true,
  y2: true,
  cx: true,
  cy: true,
  r: true,
  rx: true,
  ry: true,
  width: true,
  height: true,
  d: true,
  points: true,
  transform: true,
  "transform-origin": true,
  fill: true,
  "fill-opacity": true,
  viewbox: true,
  preserveaspectratio: true,
  "fill-rule": true,
  stroke: true,
  "stroke-width": true,
  "stroke-opacity": true,
  "stroke-dasharray": true,
  "stroke-dashoffset": true,
  "stroke-linecap": true,
  "stroke-linejoin": true,
  "stroke-miterlimit": true,
  opacity: true,
  color: true,
  "flood-color": true,
  "flood-opacity": true,
  "font-family": true,
  "font-size": true,
  "font-style": true,
  "font-weight": true,
  "text-anchor": true,
  "dominant-baseline": true,
  "alignment-baseline": true,
  "paint-order": true,
  "shape-rendering": true,
  "pointer-events": true,
  visibility: true,
  overflow: true,
  "clip-path": true,
  "clip-rule": true,
  "marker-end": true,
  "marker-start": true,
  orient: true,
  refx: true,
  refy: true,
  markerwidth: true,
  markerheight: true,
  markerunits: true,
  dx: true,
  dy: true,
  stddeviation: true,
  offset: true,
  "stop-color": true,
  "stop-opacity": true,
  gradientunits: true,
  gradienttransform: true,
  "mask-type": true,
};

const ID_PATTERN = /^aze-m-\d+(?:-title|-desc|-n-\d+(?:-r\d+)?)?$/;
const ROOT_ID_PATTERN = /^aze-m-\d+$/;

/**
 * Structural SVG sanitizer backed by a real XML parser. Strips only XML
 * comments (inert); any other visible or security-relevant finding throws
 * instead of silently rewriting meaning.
 */
export function sanitizeMermaidSvg(
  svg: string,
  options: { readonly ordinal: number },
): string {
  if (/<!DOCTYPE/i.test(svg)) throw new MermaidSanitizerError("SVG must not declare a document type.");
  if (/<\?/.test(svg)) throw new MermaidSanitizerError("SVG must not contain processing instructions.");
  if (/<!\[CDATA\[/.test(svg)) throw new MermaidSanitizerError("SVG must not contain CDATA sections.");
  const withoutComments = svg.replace(/<!--[\s\S]*?-->/g, "");
  const text = withoutComments.trim();
  if (!text.startsWith("<svg") || !text.endsWith("</svg>")) {
    throw new MermaidSanitizerError("SVG must be one root element.");
  }

  const parser = new SaxesParser({ xmlns: false, position: false });
  const ids = new Set<string>();
  const references: string[] = [];
  const stack: string[] = [];
  let rootSeen = false;
  let rootViewBox: string | undefined;
  let rootRole: string | undefined;
  let rootLabelledBy: string | undefined;
  let titleText = "";
  let titleId: string | undefined;
  let inTitle = false;
  let failures: string[] = [];
  let topLevelElements = 0;
  let topLevelText = "";

  parser.on("error", (error) => {
    failures.push(error.message);
  });
  parser.on("opentag", (tag) => {
    const name = tag.name.toLowerCase();
    if (ALLOWED_ELEMENTS[name] !== true) {
      failures.push(`Forbidden SVG element: ${name}.`);
      return;
    }
    const depth = stack.length;
    if (depth === 0) {
      topLevelElements += 1;
      if (name !== "svg") failures.push("SVG must be one root element.");
      if (rootSeen) failures.push("SVG must contain exactly one root element.");
      rootSeen = true;
    }
    stack.push(name);
    if (name === "title") {
      inTitle = titleId === undefined;
    }
    for (const [rawName, rawValue] of Object.entries(tag.attributes)) {
      const attrName = rawName.toLowerCase();
      const value = String(rawValue);
      if (attrName === "xmlns:xlink") {
        failures.push("Unused XML namespace declaration.");
        continue;
      }
      const rootOnly = ROOT_ONLY_ATTRIBUTES[attrName] === true;
      if (rootOnly && depth !== 0) {
        failures.push(`Root-only attribute ${attrName} on ${name}.`);
        continue;
      }
      if (GLOBAL_ATTRIBUTES[attrName] !== true && !rootOnly) {
        failures.push(`Forbidden attribute ${attrName} on ${name}.`);
        continue;
      }
      if (/^on/i.test(attrName) || attrName === "href" || attrName === "xlink:href") {
        failures.push(`Executable attribute: ${attrName}.`);
        continue;
      }
      if (attrName === "id") {
        const pattern = depth === 0 ? ROOT_ID_PATTERN : ID_PATTERN;
        if (!pattern.test(value) || !value.startsWith(`aze-m-${options.ordinal}`)) {
          failures.push(`Non-deterministic id: ${value}.`);
          continue;
        }
        if (ids.has(value)) {
          failures.push(`Duplicate id: ${value}.`);
          continue;
        }
        ids.add(value);
        if (depth === 0 && name === "svg" && value !== `aze-m-${options.ordinal}`) {
          failures.push(`Unexpected SVG root id: ${value}.`);
        }
        if (name === "title" && titleId === undefined) titleId = value;
        continue;
      }
      if (attrName === "xmlns") {
        if (value !== "http://www.w3.org/2000/svg") {
          failures.push(`Unexpected XML namespace: ${value}.`);
        }
        continue;
      }
      for (const ref of value.matchAll(/url\(#([^)]+)\)/g)) {
        references.push(ref[1] ?? "");
      }
      if (/https?:|data:|javascript:|file:|ftp:|vbscript:/i.test(value)) {
        failures.push(`External resource URL: ${value}.`);
        continue;
      }
      if (depth === 0 && name === "svg") {
        if (attrName === "viewbox") rootViewBox = value;
        if (attrName === "role") rootRole = value;
        if (attrName === "aria-labelledby") rootLabelledBy = value;
      }
    }
  });
  parser.on("closetag", () => {
    const closed = stack.pop();
    if (closed === "title") inTitle = false;
  });
  parser.on("text", (value) => {
    if (stack.length === 0) {
      topLevelText += value;
    } else if (inTitle) {
      titleText += value;
    }
  });
  parser.on("cdata", () => {
    failures.push("SVG must not contain CDATA sections.");
  });
  parser.on("comment", () => {});
  parser.write(withoutComments).close();

  if (failures.length > 0) {
    throw new MermaidSanitizerError(failures[0] ?? "Invalid SVG.");
  }
  if (topLevelElements !== 1) {
    throw new MermaidSanitizerError("SVG must contain exactly one root element.");
  }
  if (topLevelText.trim() !== "") {
    throw new MermaidSanitizerError("SVG must not contain top-level text.");
  }
  const viewBox = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)) ([+-]?(?:\d+(?:\.\d*)?|\.\d+)) ([+-]?(?:\d+(?:\.\d*)?|\.\d+)) ([+-]?(?:\d+(?:\.\d*)?|\.\d+))$/.exec(
    rootViewBox ?? "",
  );
  const width = Number(viewBox?.[3]);
  const height = Number(viewBox?.[4]);
  if (
    viewBox === null ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    width > 10000 ||
    height > 10000
  ) {
    throw new MermaidSanitizerError("SVG viewBox must be finite and nonzero.");
  }
  if (rootRole !== "img") {
    throw new MermaidSanitizerError("SVG root must carry role img.");
  }
  const expectedTitle = `aze-m-${options.ordinal}-title`;
  if (rootLabelledBy !== expectedTitle || titleId !== expectedTitle) {
    throw new MermaidSanitizerError("SVG misses an accessible name.");
  }
  if (titleText.trim() === "") {
    throw new MermaidSanitizerError("SVG misses an accessible name.");
  }
  for (const target of references) {
    if (!ids.has(target)) {
      throw new MermaidSanitizerError(`Dangling reference: ${target}.`);
    }
  }
  return withoutComments;
}

/**
 * Fragment post-pass for the Compiler: the Block renderer returns a
 * figure wrapping one sanitized SVG. The entire Fragment is validated —
 * wrapper attributes and embedded SVG alike — and any failure throws
 * instead of silently rewriting.
 */
export function sanitizeMermaidFragment(
  fragment: string,
  options: { readonly ordinal: number },
): string {
  const text = fragment.trim();
  const openEnd = text.indexOf(">");
  if (!text.startsWith("<figure") || openEnd < 0) {
    throw new MermaidSanitizerError("Fragment must be a figure wrapping one SVG.");
  }
  const opening = text.slice(0, openEnd + 1);
  const allowedFigure =
    new RegExp(
      `^<figure class="aze-mermaid" data-ordinal="${options.ordinal}" data-diagram="[^"]*"( data-mermaid-id="[a-z][a-z0-9]*(?:-[a-z0-9]+)*")?>$`,
    );
  if (!allowedFigure.test(opening)) {
    throw new MermaidSanitizerError("Fragment figure carries unexpected attributes.");
  }
  if (!text.endsWith("</figure>")) {
    throw new MermaidSanitizerError("Fragment must close its figure element.");
  }
  const inner = text.slice(openEnd + 1, -"</figure>".length);
  const innerTrimmed = inner.trim();
  if (!innerTrimmed.startsWith("<svg") || !innerTrimmed.endsWith("</svg>")) {
    throw new MermaidSanitizerError("Fragment misses embedded SVG.");
  }
  sanitizeMermaidSvg(innerTrimmed, options);
  if (/<figure[\s>]/i.test(innerTrimmed) || /<\/figure>/i.test(innerTrimmed)) {
    throw new MermaidSanitizerError("Fragment must wrap exactly one SVG.");
  }
  return fragment;
}

const pluginDescriptor = Object.freeze({
  type: MERMAID_PLUGIN_TYPE,
  version: MERMAID_PLUGIN_VERSION,
  title: "Mermaid",
  summary: "Offline deterministic diagrams rendered as sanitized SVG.",
  diagnosticNamespace: "azeforge.mermaid",
  sourceSchema: mermaidSourceSchema,
  bodySyntax: Object.freeze({
    id: MERMAID_BODY_SYNTAX_ID,
    version: MERMAID_BODY_SYNTAX_VERSION,
  }),
  dataSchema: mermaidDataSchema,
});

export const mermaidPlugin: AzeBlockPlugin = Object.freeze({
  descriptor: pluginDescriptor,
});

const blockRendererDescriptor = Object.freeze({
  id: MERMAID_HTML_BLOCK_RENDERER_ID,
  version: MERMAID_HTML_BLOCK_RENDERER_VERSION,
  blockType: MERMAID_PLUGIN_TYPE,
  pluginVersionRange: "1.0.0",
  rendererId: "html",
  rendererVersionRange: "1.0.0",
});

async function renderMermaidFragment(
  block: MermaidBlock,
  context: Readonly<{ sourceName?: string; ordinal?: number; theme?: Theme }>,
): Promise<string> {
  const ordinal = context.ordinal ?? 0;
  const theme = context.theme ?? defaultTheme;
  const svg = await renderMermaidSvg(block, { ordinal, theme });
  const label =
    block.id === undefined ? "" : ` data-mermaid-id="${escapeXml(block.id)}"`;
  return `<figure class="aze-mermaid" data-ordinal="${ordinal}" data-diagram="${escapeXml(block.diagramType)}"${label}>${svg}</figure>`;
}

export const mermaidHtmlBlockRenderer: MermaidBlockRenderer = Object.freeze({
  descriptor: blockRendererDescriptor,
  render: renderMermaidFragment,
});

export function mermaidDependencyClosure(): Record<string, JsonValue> {
  return {
    mermaid: MERMAID_VERSION,
    browser: `HeadlessChrome/${CHROME_HEADLESS_SHELL_VERSION}`,
    platform: { os: platform(), architecture: arch() },
    securityLevel: "strict",
    deterministicIds: true,
    suppressErrorRendering: true,
    fonts: ["Inter"],
    sanitizer: "azeforge-mermaid-svg/v2",
  };
}
