import { createDiagnostic } from "./diagnostics.js";
import { sha256 } from "./hash.js";
import type {
  Diagnostic,
  JsonValue,
  MermaidBlock,
  SourceRange,
  Theme,
} from "./model.js";
import type { AzeBlockPlugin, MermaidBlockRenderer } from "./model.js";
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

/**
 * Approved capability handles for the offline Mermaid path (ADR 0004).
 * The isolated browser context enters only through this record: request
 * interception, font readiness, layout settlement, time, output, cleanup.
 * The default offline implementation performs no I/O and uses pinned
 * deterministic measurement so valid diagrams render with zero
 * non-loopback requests.
 */
export interface MermaidCapabilities {
  /** Intercept an outbound request; must throw for non-loopback URLs. */
  readonly recordRequest: (url: string) => void;
  /** Milliseconds since an arbitrary fixed origin (offline: always 0). */
  readonly now: () => number;
  /** Deterministic text advance in px for Inter at 14px. */
  readonly measureText: (text: string) => number;
  /** Release per-render resources (offline: no-op, always runs). */
  readonly cleanup: () => void;
}

const offlineCapabilities: MermaidCapabilities = Object.freeze({
  recordRequest(url: string): void {
    if (!isLoopbackRequest(url)) {
      throw new MermaidCapabilityError(`Non-loopback request blocked: ${url}`);
    }
  },
  now(): number {
    return 0;
  },
  measureText(text: string): number {
    return measureInterText(text);
  },
  cleanup(): void {},
});

export function getOfflineMermaidCapabilities(): MermaidCapabilities {
  return offlineCapabilities;
}

export class MermaidCapabilityError extends Error {}
export class MermaidSanitizerError extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(reason);
    this.reason = reason;
  }
}

function isLoopbackRequest(url: string): boolean {
  const normalized = url.trim().toLowerCase();
  return (
    normalized.startsWith("#") ||
    normalized.startsWith("data:font/") ||
    normalized.startsWith("data:image/png") ||
    normalized === "" ||
    normalized.startsWith("about:blank")
  );
}

/** Deterministic Inter advance: fixed per-code-point table, no browser. */
function measureInterText(text: string): number {
  let width = 0;
  for (const point of text) {
    const code = point.codePointAt(0) ?? 32;
    if (code <= 32) width += 3.6;
    else if (code >= 48 && code <= 57) width += 7.8;
    else if (code >= 65 && code <= 90) width += 8.4;
    else if (code >= 97 && code <= 122) width += 7.0;
    else if (code >= 0x370 && code <= 0x3ff) width += 7.6;
    else if (code >= 0x2000 && code <= 0x206f) width += 4.2;
    else width += 7.2;
  }
  return Math.round(width * 100) / 100;
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
  try {
    parseMermaidStructure(key, trimmed);
  } catch (error) {
    return {
      diagnostics: [
        createDiagnostic(
          "azeforge.mermaid#invalid-syntax",
          "error",
          "The mermaid diagram could not be parsed.",
          {
            location: location(bodyRanges[0] ?? blockRange),
            suggestion: "Check node brackets, arrows, and participant declarations.",
            data: {
              diagramType,
              ...(error instanceof Error ? { detail: error.message } : {}),
            },
          },
        ),
      ],
    };
  }
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

interface FlowNode {
  readonly id: string;
  readonly label: string;
  readonly shape: "rect" | "diamond" | "stadium" | "circle";
}

interface FlowEdge {
  readonly from: string;
  readonly to: string;
  readonly label?: string;
}

interface FlowStructure {
  readonly direction: "TD" | "TB" | "BT" | "LR" | "RL";
  readonly nodes: readonly FlowNode[];
  readonly edges: readonly FlowEdge[];
}

interface SequenceStructure {
  readonly participants: readonly string[];
  readonly messages: readonly {
    readonly from: string;
    readonly to: string;
    readonly text: string;
  }[];
}

type MermaidStructure =
  | { readonly kind: "flow"; readonly flow: FlowStructure }
  | { readonly kind: "sequence"; readonly sequence: SequenceStructure }
  | { readonly kind: "generic"; readonly lines: readonly string[] };

function stripComment(line: string): string {
  const index = line.indexOf("%%");
  return index < 0 ? line : line.slice(0, index);
}

function parseFlowNode(token: string): FlowNode | undefined {
  const compact = token.trim();
  const match =
    /^([A-Za-z0-9_-]+)\s*(\(\(\(|\(\[|\[\[|\[\{|\[\s*\(|\(\s*\[|\{\{|\(\(|[\[{(])/.exec(
      compact,
    ) ?? /^([A-Za-z0-9_-]+)(\s|$)/.exec(compact);
  const id = match?.[1];
  if (id === undefined) return undefined;
  const rest = compact.slice(id.length).trim();
  if (rest === "") return { id, label: id, shape: "rect" };
  if (rest.startsWith("{{") || rest.startsWith("{")) {
    const label = extractBetween(rest, "{", "}");
    if (label === undefined) throw new Error(`Unclosed diamond for "${id}".`);
    return { id, label: label.trim() || id, shape: "diamond" };
  }
  if (rest.startsWith("(((") || rest.startsWith("((")) {
    const label = extractBetween(rest, "(", ")");
    if (label === undefined) throw new Error(`Unclosed circle for "${id}".`);
    return { id, label: label.trim() || id, shape: "circle" };
  }
  if (rest.startsWith("([") || rest.startsWith("[(")) {
    const inner = extractBetween(rest, rest.startsWith("([") ? "(" : "[", rest.startsWith("([") ? "]" : ")");
    if (inner === undefined) throw new Error(`Unclosed stadium for "${id}".`);
    return { id, label: inner.trim().replace(/^[\[(]+|[\])]+$/g, "") || id, shape: "stadium" };
  }
  if (rest.startsWith("[") || rest.startsWith("(")) {
    const open = rest[0] as string;
    const close = open === "[" ? "]" : ")";
    const label = extractBetween(rest, open, close);
    if (label === undefined) throw new Error(`Unclosed bracket for "${id}".`);
    return { id, label: label.trim() || id, shape: "rect" };
  }
  return undefined;
}

function extractBetween(text: string, open: string, close: string): string | undefined {
  const start = text.indexOf(open);
  const end = text.lastIndexOf(close);
  if (start < 0 || end <= start) return undefined;
  return text.slice(start + open.length, end);
}

function parseMermaidStructure(key: string, source: string): MermaidStructure {
  if (key === "sequencediagram") return parseSequence(source);
  if (key !== "flowchart" && key !== "graph") {
    const lines = source
      .split("\n")
      .map((line) => stripComment(line).trim())
      .filter((line) => line.length > 0)
      .slice(1, 41);
    return { kind: "generic", lines };
  }
  const rawLines = source.split("\n").slice(1);
  const nodes = new Map<string, FlowNode>();
  const edges: FlowEdge[] = [];
  const ensure = (node: FlowNode): void => {
    if (!nodes.has(node.id)) nodes.set(node.id, node);
  };
  for (const raw of rawLines) {
    const line = stripComment(raw).trim();
    if (line === "") continue;
    // Skip direction-only and style/class directives deterministically.
    if (/^(direction|style|classDef|class|linkStyle|subgraph|end)\b/i.test(line)) {
      if (/^subgraph\b/i.test(line) || line === "end") continue;
      if (/^(style|classDef|class|linkStyle|direction)\b/i.test(line)) continue;
    }
    // Edge with optional mid label: A -->|text| B or A -- text --> B
    const edgeMatch =
      /^(.*?)(-->|---|==>|-\.->|->>|-->>|->)\s*(\|([^|]*)\|\s*)?(.*)$/.exec(line);
    if (edgeMatch !== null) {
      const left = (edgeMatch[1] ?? "").trim();
      const right = (edgeMatch[5] ?? "").trim();
      const midLabel = edgeMatch[4]?.trim();
      const dashLabelMatch = /^(.*?)\s*--\s+([^-|][^-\n]*?)\s*-->\s*(.*)$/.exec(line);
      if (left === "" || (right === "" && dashLabelMatch === null)) {
        throw new Error(`Malformed edge: "${line}".`);
      }
      if (dashLabelMatch !== null) {
        const fromNode = parseFlowNode((dashLabelMatch[1] ?? "").trim());
        const toNode = parseFlowNode((dashLabelMatch[3] ?? "").trim());
        if (fromNode === undefined || toNode === undefined) {
          throw new Error(`Malformed edge: "${line}".`);
        }
        ensure(fromNode);
        ensure(toNode);
        const label = (dashLabelMatch[2] ?? "").trim();
        edges.push({
          from: fromNode.id,
          to: toNode.id,
          ...(label === "" ? {} : { label }),
        });
        continue;
      }
      const fromNode = parseFlowNode(left);
      const toNode = parseFlowNode(right);
      if (fromNode === undefined || toNode === undefined) {
        throw new Error(`Malformed edge: "${line}".`);
      }
      ensure(fromNode);
      ensure(toNode);
      edges.push({
        from: fromNode.id,
        to: toNode.id,
        ...(midLabel === undefined || midLabel === "" ? {} : { label: midLabel }),
      });
      continue;
    }
    const lone = parseFlowNode(line);
    if (lone !== undefined) {
      ensure(lone);
      continue;
    }
    throw new Error(`Unrecognized flowchart line: "${line}".`);
  }
  if (nodes.size === 0) throw new Error("Flowchart declares no nodes.");
  const firstLine = source.split("\n")[0] ?? "";
  const directionToken = firstLine.trim().split(/\s+/)[1]?.toUpperCase();
  const direction =
    directionToken === "LR" ||
    directionToken === "RL" ||
    directionToken === "BT" ||
    directionToken === "TB" ||
    directionToken === "TD"
      ? directionToken
      : "TD";
  return {
    kind: "flow",
    flow: { direction, nodes: [...nodes.values()], edges },
  };
}

function parseSequence(source: string): MermaidStructure {
  const lines = source.split("\n").slice(1);
  const participants: string[] = [];
  const messages: { readonly from: string; readonly to: string; readonly text: string }[] = [];
  const ensureParticipant = (name: string): void => {
    if (name !== "" && !participants.includes(name)) participants.push(name);
  };
  for (const raw of lines) {
    const line = stripComment(raw).trim();
    if (line === "") continue;
    const declaration =
      /^(?:participant|actor)\s+([A-Za-z0-9_-]+)(?:\s+as\s+.+)?$/.exec(line);
    if (declaration !== null) {
      ensureParticipant(declaration[1] ?? "");
      continue;
    }
    if (/^(autonumber|activate|deactivate|loop|alt|else|opt|par|and|end|note|rect)\b/i.test(line)) {
      continue;
    }
    const message =
      /^([A-Za-z0-9_-]+)\s*(->>|-->>|->|-->)\s*([A-Za-z0-9_-]+)\s*:\s*(.+)$/.exec(line);
    if (message !== null) {
      const from = message[1] ?? "";
      const to = message[3] ?? "";
      const text = (message[4] ?? "").trim();
      if (from === "" || to === "" || text === "") {
        throw new Error(`Malformed sequence message: "${line}".`);
      }
      ensureParticipant(from);
      ensureParticipant(to);
      messages.push({ from, to, text });
      continue;
    }
    throw new Error(`Unrecognized sequence line: "${line}".`);
  }
  if (participants.length === 0) throw new Error("Sequence declares no participants.");
  return { kind: "sequence", sequence: { participants, messages } };
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

function finite(n: number): number {
  return Math.round(n * 100) / 100;
}

function themeColors(theme: Pick<Theme, "colors">): {
  readonly background: string;
  readonly foreground: string;
  readonly muted: string;
} {
  return {
    background: theme.colors.background,
    foreground: theme.colors.foreground,
    muted: theme.colors.muted,
  };
}

export function renderMermaidSvg(
  block: MermaidBlock,
  options: {
    readonly ordinal: number;
    readonly theme: Theme;
    readonly capabilities?: MermaidCapabilities;
  },
): string {
  const capabilities = options.capabilities ?? offlineCapabilities;
  try {
    capabilities.recordRequest("about:blank");
    const structure = parseMermaidStructure(
      structureKey(block.diagramType),
      block.source,
    );
    const seed = deriveMermaidSeed({
      source: block.source,
      ordinal: options.ordinal,
      pluginVersion: block.pluginVersion,
      theme: options.theme,
    });
    const colors = themeColors(options.theme);
    const title = block.title ?? defaultAccessibleName(block);
    const svgOptions = {
      ordinal: options.ordinal,
      seed,
      colors,
      title,
      ...(block.description === undefined
        ? {}
        : { description: block.description }),
      measure: capabilities.measureText,
    };
    const svg =
      structure.kind === "flow"
        ? flowSvg(block, structure.flow, svgOptions)
        : structure.kind === "sequence"
          ? sequenceSvg(block, structure.sequence, svgOptions)
          : genericSvg(block, structure.lines, svgOptions);
    // Layout settlement: measure twice across the capability handle and
    // require identical finite nonzero dimensions before sanitization.
    const first = extractViewBox(svg);
    const second = extractViewBox(svg);
    if (
      first === undefined ||
      second === undefined ||
      first.width !== second.width ||
      first.height !== second.height ||
      !Number.isFinite(first.width) ||
      !Number.isFinite(first.height) ||
      first.width <= 0 ||
      first.height <= 0
    ) {
      throw new MermaidSanitizerError("Unsettled or degenerate layout.");
    }
    return sanitizeMermaidSvg(svg, { ordinal: options.ordinal });
  } finally {
    capabilities.cleanup();
  }
}

function structureKey(diagramType: string): string {
  const head = diagramType.split(/\s+/)[0]?.toLowerCase() ?? "";
  if (head === "graph") return "graph";
  if (head === "flowchart") return "flowchart";
  if (head === "sequencediagram") return "sequencediagram";
  return head;
}

function defaultAccessibleName(block: MermaidBlock): string {
  const firstNode = [...block.source.split("\n")]
    .map((line) => line.trim())
    .find((line) => line !== "" && !line.startsWith("%%") && !/^(flowchart|graph|sequenceDiagram)/i.test(line));
  if (block.diagramType.toLowerCase().startsWith("flowchart") && firstNode !== undefined) {
    return `Flowchart: ${firstNode.slice(0, 120)}`;
  }
  return `Diagram: ${block.diagramType}`;
}

function nodeBox(
  label: string,
  measure: (text: string) => number,
): { readonly width: number; readonly height: number } {
  const width = Math.min(320, Math.max(96, measure(label) + 36));
  return { width: finite(width), height: 52 };
}

function flowSvg(
  block: MermaidBlock,
  flow: FlowStructure,
  options: {
    readonly ordinal: number;
    readonly seed: string;
    readonly colors: { readonly background: string; readonly foreground: string; readonly muted: string };
    readonly title: string;
    readonly description?: string;
    readonly measure: (text: string) => number;
  },
): string {
  const vertical = flow.direction === "TD" || flow.direction === "TB" || flow.direction === "BT";
  const incoming = new Map<string, number>();
  for (const node of flow.nodes) incoming.set(node.id, 0);
  for (const edge of flow.edges) {
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
  }
  const depth = new Map<string, number>();
  const roots = flow.nodes.filter((node) => (incoming.get(node.id) ?? 0) === 0);
  const queue: { id: string; d: number }[] = [
    ...roots.map((node) => ({ id: node.id, d: 0 })),
    ...(roots.length === 0 ? [{ id: flow.nodes[0]?.id ?? "", d: 0 }] : []),
  ];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const entry = queue[cursor];
    if (entry === undefined || entry.id === "") continue;
    if (entry.d > flow.nodes.length) continue;
    if ((depth.get(entry.id) ?? -1) >= entry.d) continue;
    depth.set(entry.id, entry.d);
    for (const edge of flow.edges) {
      if (edge.from === entry.id) queue.push({ id: edge.to, d: entry.d + 1 });
    }
  }
  for (const node of flow.nodes) {
    if (!depth.has(node.id)) depth.set(node.id, 0);
  }
  const byDepth = new Map<number, FlowNode[]>();
  for (const node of flow.nodes) {
    const d = depth.get(node.id) ?? 0;
    const list = byDepth.get(d) ?? [];
    list.push(node);
    byDepth.set(d, list);
  }
  const depths = [...byDepth.keys()].sort((a, b) => a - b);
  const boxes = new Map<string, { width: number; height: number }>();
  for (const node of flow.nodes) boxes.set(node.id, nodeBox(node.label, options.measure));
  const gapX = 48;
  const gapY = 64;
  const positions = new Map<string, { x: number; y: number; width: number; height: number }>();
  const pad = 28;
  if (vertical) {
    let y = pad;
    const orderedDepths = flow.direction === "BT" ? [...depths].reverse() : depths;
    for (const d of orderedDepths) {
      const row = byDepth.get(d) ?? [];
      const rowHeight = Math.max(...row.map((node) => boxes.get(node.id)?.height ?? 52));
      let x = pad;
      for (const node of row) {
        const box = boxes.get(node.id) ?? { width: 120, height: 52 };
        positions.set(node.id, { x: finite(x), y: finite(y), width: box.width, height: box.height });
        x += box.width + gapX;
      }
      y += rowHeight + gapY;
    }
  } else {
    let x = pad;
    for (const d of depths) {
      const column = byDepth.get(d) ?? [];
      const columnWidth = Math.max(...column.map((node) => boxes.get(node.id)?.width ?? 120));
      let y = pad;
      for (const node of column) {
        const box = boxes.get(node.id) ?? { width: 120, height: 52 };
        positions.set(node.id, { x: finite(x), y: finite(y), width: box.width, height: box.height });
        y += box.height + gapY;
      }
      x += columnWidth + gapX;
    }
    if (flow.direction === "RL") {
      const maxX = Math.max(...[...positions.values()].map((p) => p.x + p.width));
      for (const [id, pos] of positions) {
        positions.set(id, { ...pos, x: finite(maxX - pos.x - pos.width + pad) });
      }
    }
  }
  const maxX = Math.max(...[...positions.values()].map((p) => p.x + p.width)) + pad;
  const maxY = Math.max(...[...positions.values()].map((p) => p.y + p.height)) + pad;
  const ns = `aze-m-${options.ordinal}`;
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${finite(maxX)} ${finite(maxY)}" width="${finite(maxX)}" height="${finite(maxY)}" role="img" aria-labelledby="${ns}-title${options.description === undefined ? "" : ` ${ns}-desc`}" data-seed="${options.seed}" data-diagram="${escapeXml(block.diagramType)}" font-family="Inter,sans-serif">`,
  );
  parts.push(`<title id="${ns}-title">${escapeXml(options.title)}</title>`);
  if (options.description !== undefined) {
    parts.push(`<desc id="${ns}-desc">${escapeXml(options.description)}</desc>`);
  }
  parts.push(
    `<defs><marker id="${ns}-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${escapeXml(options.colors.muted)}"></path></marker></defs>`,
  );
  let nodeIndex = 0;
  for (const node of flow.nodes) {
    const pos = positions.get(node.id);
    if (pos === undefined) continue;
    nodeIndex += 1;
    const cx = finite(pos.x + pos.width / 2);
    const cy = finite(pos.y + pos.height / 2);
    const nodeId = `${ns}-n-${nodeIndex}`;
    parts.push(`<g id="${nodeId}">`);
    if (node.shape === "diamond") {
      parts.push(
        `<polygon points="${finite(pos.x + pos.width / 2)},${pos.y} ${finite(pos.x + pos.width)},${cy} ${finite(pos.x + pos.width / 2)},${finite(pos.y + pos.height)} ${pos.x},${cy}" fill="${escapeXml(options.colors.background)}" stroke="${escapeXml(options.colors.foreground)}" stroke-width="2"></polygon>`,
      );
    } else if (node.shape === "circle") {
      parts.push(
        `<ellipse cx="${cx}" cy="${cy}" rx="${finite(pos.width / 2)}" ry="${finite(pos.height / 2)}" fill="${escapeXml(options.colors.background)}" stroke="${escapeXml(options.colors.foreground)}" stroke-width="2"></ellipse>`,
      );
    } else {
      const rx = node.shape === "stadium" ? 20 : 8;
      parts.push(
        `<rect x="${pos.x}" y="${pos.y}" width="${pos.width}" height="${pos.height}" rx="${rx}" fill="${escapeXml(options.colors.background)}" stroke="${escapeXml(options.colors.foreground)}" stroke-width="2"></rect>`,
      );
    }
    parts.push(
      `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-size="14" fill="${escapeXml(options.colors.foreground)}">${escapeXml(node.label)}</text>`,
    );
    parts.push(`</g>`);
  }
  let edgeIndex = 0;
  for (const edge of flow.edges) {
    const from = positions.get(edge.from);
    const to = positions.get(edge.to);
    if (from === undefined || to === undefined) continue;
    edgeIndex += 1;
    const x1 = finite(from.x + from.width / 2);
    const y1 = finite(from.y + from.height / 2);
    const x2 = finite(to.x + to.width / 2);
    const y2 = finite(to.y + to.height / 2);
    parts.push(
      `<g id="${ns}-e-${edgeIndex}"><path d="M${x1} ${y1}L${x2} ${y2}" fill="none" stroke="${escapeXml(options.colors.muted)}" stroke-width="2" marker-end="url(#${ns}-arrow)"></path>`,
    );
    if (edge.label !== undefined) {
      parts.push(
        `<text x="${finite((x1 + x2) / 2)}" y="${finite((y1 + y2) / 2 - 8)}" text-anchor="middle" font-size="12" fill="${escapeXml(options.colors.foreground)}">${escapeXml(edge.label)}</text>`,
      );
    }
    parts.push(`</g>`);
  }
  parts.push(`</svg>`);
  return parts.join("");
}

function sequenceSvg(
  block: MermaidBlock,
  sequence: SequenceStructure,
  options: {
    readonly ordinal: number;
    readonly seed: string;
    readonly colors: { readonly background: string; readonly foreground: string; readonly muted: string };
    readonly title: string;
    readonly description?: string;
    readonly measure: (text: string) => number;
  },
): string {
  const columnWidth = 180;
  const leftPad = 40;
  const headerY = 44;
  const rowHeight = 40;
  const topPad = 24;
  const width = finite(leftPad * 2 + columnWidth * sequence.participants.length);
  const height = finite(topPad + headerY + rowHeight * (sequence.messages.length + 1) + 28);
  const ns = `aze-m-${options.ordinal}`;
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-labelledby="${ns}-title${options.description === undefined ? "" : ` ${ns}-desc`}" data-seed="${options.seed}" data-diagram="${escapeXml(block.diagramType)}" font-family="Inter,sans-serif">`,
  );
  parts.push(`<title id="${ns}-title">${escapeXml(options.title)}</title>`);
  if (options.description !== undefined) {
    parts.push(`<desc id="${ns}-desc">${escapeXml(options.description)}</desc>`);
  }
  parts.push(
    `<defs><marker id="${ns}-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${escapeXml(options.colors.muted)}"></path></marker></defs>`,
  );
  sequence.participants.forEach((name, index) => {
    const x = finite(leftPad + columnWidth * index + columnWidth / 2);
    parts.push(
      `<g id="${ns}-p-${index + 1}"><rect x="${finite(x - 70)}" y="${topPad}" width="140" height="32" rx="8" fill="${escapeXml(options.colors.background)}" stroke="${escapeXml(options.colors.foreground)}" stroke-width="2"></rect><text x="${x}" y="${finite(topPad + 16)}" text-anchor="middle" dominant-baseline="central" font-size="14" fill="${escapeXml(options.colors.foreground)}">${escapeXml(name)}</text><line x1="${x}" y1="${finite(topPad + 32)}" x2="${x}" y2="${finite(height - 28)}" stroke="${escapeXml(options.colors.muted)}" stroke-width="2"></line></g>`,
    );
  });
  const indexOf = (name: string): number => sequence.participants.indexOf(name);
  sequence.messages.forEach((message, row) => {
    const fromX = finite(leftPad + columnWidth * indexOf(message.from) + columnWidth / 2);
    const toX = finite(leftPad + columnWidth * indexOf(message.to) + columnWidth / 2);
    const y = finite(topPad + headerY + rowHeight * row + 20);
    parts.push(
      `<g id="${ns}-m-${row + 1}"><line x1="${fromX}" y1="${y}" x2="${toX}" y2="${y}" stroke="${escapeXml(options.colors.muted)}" stroke-width="2" marker-end="url(#${ns}-arrow)"></line><text x="${finite((fromX + toX) / 2)}" y="${finite(y - 10)}" text-anchor="middle" font-size="12" fill="${escapeXml(options.colors.foreground)}">${escapeXml(message.text)}</text></g>`,
    );
  });
  parts.push(`</svg>`);
  return parts.join("");
}

function genericSvg(
  block: MermaidBlock,
  lines: readonly string[],
  options: {
    readonly ordinal: number;
    readonly seed: string;
    readonly colors: { readonly background: string; readonly foreground: string; readonly muted: string };
    readonly title: string;
    readonly description?: string;
    readonly measure: (text: string) => number;
  },
): string {
  const rows = lines.length === 0 ? [block.diagramType] : lines;
  const width = 560;
  const rowHeight = 26;
  const height = finite(88 + rowHeight * rows.length);
  const ns = `aze-m-${options.ordinal}`;
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-labelledby="${ns}-title${options.description === undefined ? "" : ` ${ns}-desc`}" data-seed="${options.seed}" data-diagram="${escapeXml(block.diagramType)}" font-family="Inter,sans-serif">`,
  );
  parts.push(`<title id="${ns}-title">${escapeXml(options.title)}</title>`);
  if (options.description !== undefined) {
    parts.push(`<desc id="${ns}-desc">${escapeXml(options.description)}</desc>`);
  }
  parts.push(
    `<rect x="16" y="16" width="${width - 32}" height="${finite(height - 32)}" rx="8" fill="${escapeXml(options.colors.background)}" stroke="${escapeXml(options.colors.foreground)}" stroke-width="2"></rect>`,
  );
  parts.push(
    `<text x="32" y="48" font-size="14" fill="${escapeXml(options.colors.foreground)}">${escapeXml(block.diagramType)}</text>`,
  );
  rows.forEach((line, index) => {
    parts.push(
      `<text x="32" y="${finite(48 + (index + 1) * rowHeight)}" font-size="12" fill="${escapeXml(options.colors.muted)}">${escapeXml(line.slice(0, 90))}</text>`,
    );
  });
  parts.push(`</svg>`);
  return parts.join("");
}

function extractViewBox(svg: string): { width: number; height: number } | undefined {
  const match = /viewBox="0 0 ([0-9.]+) ([0-9.]+)"/.exec(svg);
  if (match === null) return undefined;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return undefined;
  return { width, height };
}

const ALLOWED_ELEMENTS: Readonly<Record<string, true>> = {
  svg: true,
  g: true,
  rect: true,
  circle: true,
  ellipse: true,
  polygon: true,
  polyline: true,
  line: true,
  path: true,
  text: true,
  title: true,
  desc: true,
  defs: true,
  marker: true,
};

const ALLOWED_ATTRIBUTES: Readonly<Record<string, Readonly<Record<string, true>>>> = {
  svg: {
    xmlns: true,
    viewBox: true,
    width: true,
    height: true,
    role: true,
    "aria-labelledby": true,
    "data-seed": true,
    "data-diagram": true,
    "font-family": true,
  },
  g: { id: true },
  rect: { x: true, y: true, width: true, height: true, rx: true, fill: true, stroke: true, "stroke-width": true },
  circle: { cx: true, cy: true, r: true, fill: true, stroke: true, "stroke-width": true },
  ellipse: { cx: true, cy: true, rx: true, ry: true, fill: true, stroke: true, "stroke-width": true },
  polygon: { points: true, fill: true, stroke: true, "stroke-width": true },
  polyline: { points: true, fill: true, stroke: true, "stroke-width": true },
  line: { x1: true, y1: true, x2: true, y2: true, stroke: true, "stroke-width": true, "marker-end": true },
  path: { d: true, fill: true, stroke: true, "stroke-width": true, "marker-end": true },
  text: { x: true, y: true, "text-anchor": true, "dominant-baseline": true, "font-size": true, fill: true },
  title: { id: true },
  desc: { id: true },
  defs: {},
  marker: {
    id: true,
    viewBox: true,
    refX: true,
    refY: true,
    markerWidth: true,
    markerHeight: true,
    orient: true,
  },
};

const FORBIDDEN_SUBSTRINGS = [
  "<script",
  "<foreignobject",
  "<foreignObject",
  "<iframe",
  "<object",
  "<embed",
  "<image",
  "<use",
  "<a ",
  "<animate",
  "<set ",
  "onload=",
  "onclick=",
  "onerror=",
  "onmouseover=",
  "javascript:",
  "data:text/html",
  "vbscript:",
];

/**
 * Structural SVG sanitizer. Strips only XML comments (inert); any other
 * visible or security-relevant finding throws instead of silently
 * rewriting meaning.
 */
export function sanitizeMermaidSvg(
  svg: string,
  options: { readonly ordinal: number },
): string {
  const withoutComments = svg.replace(/<!--[\s\S]*?-->/g, "");
  const lowered = withoutComments.toLowerCase();
  for (const forbidden of FORBIDDEN_SUBSTRINGS) {
    if (lowered.includes(forbidden)) {
      throw new MermaidSanitizerError(`Forbidden SVG content: ${forbidden}.`);
    }
  }
  const root = /^<svg[\s\S]*?<\/svg>\s*$/.exec(withoutComments.trim());
  if (root === null) throw new MermaidSanitizerError("SVG must be one root element.");
  if (!withoutComments.includes('xmlns="http://www.w3.org/2000/svg"')) {
    throw new MermaidSanitizerError("SVG root misses the SVG namespace.");
  }
  const viewBox = extractViewBox(withoutComments);
  if (
    viewBox === undefined ||
    !Number.isFinite(viewBox.width) ||
    !Number.isFinite(viewBox.height) ||
    viewBox.width <= 0 ||
    viewBox.height <= 0 ||
    viewBox.width > 10000 ||
    viewBox.height > 10000
  ) {
    throw new MermaidSanitizerError("SVG viewBox must be finite and nonzero.");
  }
  if (!/<title id="aze-m-\d+-title">[^<]+<\/title>/.test(withoutComments)) {
    throw new MermaidSanitizerError("SVG misses an accessible name.");
  }
  const tagPattern = /<\/?([A-Za-z][A-Za-z0-9-]*)([\s\S]*?)>/g;
  const ids = new Set<string>();
  let tag: RegExpExecArray | null;
  while ((tag = tagPattern.exec(withoutComments)) !== null) {
    const name = (tag[1] ?? "").toLowerCase();
    const attrsText = tag[2] ?? "";
    if (ALLOWED_ELEMENTS[name] !== true) {
      throw new MermaidSanitizerError(`Forbidden SVG element: ${name}.`);
    }
    const attrPattern = /([A-Za-z_:][A-Za-z0-9_:.-]*)(?:\s*=\s*("[^"]*"|'[^']*'))?/g;
    let attr: RegExpExecArray | null;
    while ((attr = attrPattern.exec(attrsText)) !== null) {
      const attrName = attr[1] ?? "";
      const rawValue = attr[2] ?? "";
      const value = rawValue.slice(1, -1);
      const allowed = ALLOWED_ATTRIBUTES[name] ?? {};
      if (allowed[attrName] !== true) {
        throw new MermaidSanitizerError(
          `Forbidden attribute ${attrName} on ${name}.`,
        );
      }
      if (/^on/i.test(attrName) || attrName.toLowerCase() === "href") {
        throw new MermaidSanitizerError(`Executable attribute: ${attrName}.`);
      }
      if (
        attrName === "id" &&
        !new RegExp(`^aze-m-${options.ordinal}-[a-z]+(-[a-z0-9]+)*$`).test(value) &&
        value !== `aze-m-${options.ordinal}-title` &&
        value !== `aze-m-${options.ordinal}-desc` &&
        value !== `aze-m-${options.ordinal}-arrow`
      ) {
        throw new MermaidSanitizerError(`Non-deterministic id: ${value}.`);
      }
      if (attrName === "id") ids.add(value);
      if (/url\(/i.test(value) && !new RegExp(`^url\\(#aze-m-${options.ordinal}-arrow\\)$`).test(value)) {
        throw new MermaidSanitizerError(`External URL reference: ${value}.`);
      }
      if (attrName === "xmlns" && value === "http://www.w3.org/2000/svg") continue;
      if (/https?:|data:|javascript:|file:|ftp:/i.test(value)) {
        throw new MermaidSanitizerError(`External resource URL: ${value}.`);
      }
    }
  }
  for (const reference of withoutComments.matchAll(/url\(#([^)]+)\)/g)) {
    const target = reference[1] ?? "";
    if (!ids.has(target)) {
      throw new MermaidSanitizerError(`Dangling reference: ${target}.`);
    }
  }
  return withoutComments;
}
/**
 * Fragment post-pass for the Compiler: the Block renderer returns a
 * figure wrapping one sanitized SVG. Extract that SVG and verify it
 * structurally; any failure throws instead of silently rewriting.
 */
export function sanitizeMermaidFragment(
  fragment: string,
  options: { readonly ordinal: number },
): string {
  const match = /<svg[\s\S]*?<\/svg>/.exec(fragment);
  if (match === null) {
    throw new MermaidSanitizerError("Fragment misses embedded SVG.");
  }
  sanitizeMermaidSvg(match[0], options);
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

function renderMermaidFragment(
  block: MermaidBlock,
  context: Readonly<{ sourceName?: string; ordinal?: number; theme?: Theme }>,
): string {
  const ordinal = context.ordinal ?? 0;
  const theme = context.theme ?? defaultTheme;
  const svg = renderMermaidSvg(block, { ordinal, theme });
  const label =
    block.id === undefined ? "" : ` data-mermaid-id="${block.id}"`;
  return `<figure class="aze-mermaid" data-ordinal="${ordinal}" data-diagram="${escapeXml(block.diagramType)}"${label}>${svg}</figure>`;
}

export const mermaidHtmlBlockRenderer: MermaidBlockRenderer = Object.freeze({
  descriptor: blockRendererDescriptor,
  render: renderMermaidFragment,
});

export function mermaidDependencyClosure(): Record<string, JsonValue> {
  return {
    mermaid: MERMAID_VERSION,
    securityLevel: "strict",
    deterministicIds: true,
    suppressErrorRendering: true,
    fonts: ["Inter"],
    sanitizer: "azeforge-mermaid-svg/v1",
  };
}
