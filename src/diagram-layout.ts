/**
 * Native general-diagram layout (issue #76, contract issue #60 §4).
 *
 * One deterministic projection from a validated `DiagramBlock` to measured
 * geometry, over the pinned ELK engine (`elkjs@0.12.0`, the bundled
 * worker-free build). The Block's declaration list is the model: authored
 * order is preserved, and the engine only ever sees positional ids, so an
 * authored name cannot influence — or leak out of — the computation.
 *
 * Three things this module owns:
 *
 * - measurement: every box is sized from the Advance metric and the Theme
 *   typography tokens, never from a font the compiler cannot observe;
 * - projection: the engine's parent-relative hierarchy is flattened to one
 *   absolute coordinate system, and every number is quantized to three
 *   decimals so two runs on the same Block produce identical values;
 * - failure: any throw or any missing/non-finite coordinate becomes a
 *   `DiagramLayoutError` with a remedy, and the caller publishes no Artifact.
 *
 * Positional engine ids are `n<node>`, `g<group>`, `p<node>-<port>` and
 * `e<edge>`, numbered in authored order of their own kind. They are internal:
 * the returned layout carries authored names for the renderer and geometry
 * for the emitter, and nothing else.
 */

import type { ElkExtendedEdge, ElkNode, ElkPort } from "elkjs/lib/elk.bundled.js";

import { labelAdvance, labelLines } from "./advance-metric.js";
import { quantize } from "./plot.js";
import type {
  DiagramBlock,
  DiagramEdge,
  DiagramEndpoint,
  DiagramGroup,
  DiagramNode,
  DiagramPort,
  DiagramPortSide,
  DiagramShape,
  DiagramFlow,
  Theme,
} from "./model.js";

export const DIAGRAM_LAYOUT_VERSION = "diagram-layout/v1" as const;
export const ELKJS_VERSION = "0.12.0" as const;
/** One code for every layout refusal: the caller publishes no partial figure. */
export const DIAGRAM_LAYOUT_ERROR_CODE = "azeforge.renderer#diagram-layout" as const;

/* ------------------------------------------------------------------ *
 * Registered geometry constants
 *
 * Tuned so the contract scenarios (a branching process with a cycle, a tree
 * with forward references, a nested architecture with ports) export legibly
 * to PNG and PDF at print size: boxes clear their labels, ports sit on the
 * border without touching the label, and group bands stay readable at the
 * four permitted nesting levels.
 * ------------------------------------------------------------------ */

/** Horizontal breathing room inside a node box, on a side without ports. */
export const NODE_PADDING_X = 14;
/** Vertical breathing room inside a node box, on a side without ports. */
export const NODE_PADDING_Y = 10;
/** Smallest node box, so a short or absent label still reads as a shape. */
export const MIN_NODE_WIDTH = 72;
export const MIN_NODE_HEIGHT = 36;
/** Band between a group's border and its members. */
export const GROUP_PADDING = 16;
/** Extra band between a group label and its members. */
export const GROUP_LABEL_GAP = 6;
/** Smallest empty group box (a group with no members still draws). */
export const MIN_GROUP_WIDTH = 96;
export const MIN_GROUP_HEIGHT = 56;
/** Gap between two nodes in one layer. */
export const NODE_SPACING = 28;
/** Gap between two layers. */
export const LAYER_SPACING = 48;
/** Gap an edge keeps from a node it does not touch. */
export const EDGE_NODE_SPACING = 16;
/** Gap between two parallel edges. */
export const EDGE_EDGE_SPACING = 12;
/** Gap between two disconnected components. */
export const COMPONENT_SPACING = 40;
/** Gap between two ports on one side of a node. */
export const PORT_SPACING = 8;
/** Outer margin of the whole drawing. */
export const ROOT_PADDING = 16;
/** Fixed nonzero seed; layout must not vary between runs. */
export const ELK_RANDOM_SEED = 1;

/** Authored side -> engine side. Only authored sides are ever handed over. */
const ELK_PORT_SIDE: Readonly<Record<DiagramPortSide, string>> = Object.freeze({
  left: "WEST",
  right: "EAST",
  top: "NORTH",
  bottom: "SOUTH",
});

/** Authored flow -> engine direction. */
const ELK_DIRECTION: Readonly<Record<DiagramFlow, string>> = Object.freeze({
  "top-to-bottom": "DOWN",
  "bottom-to-top": "UP",
  "left-to-right": "RIGHT",
  "right-to-left": "LEFT",
});

/**
 * Authored sides are honoured only under `FIXED_SIDE`: without it the engine
 * puts every port on one side and ignores `elk.port.side`. A port with no
 * authored side carries no side option at all, so the engine still chooses.
 */
const PORT_CONSTRAINTS = "FIXED_SIDE";

const ROOT_ID = "root";
const ROOT_PADDING_BOX = `[top=${ROOT_PADDING},left=${ROOT_PADDING},bottom=${ROOT_PADDING},right=${ROOT_PADDING}]`;

const ROOT_LAYOUT_OPTIONS: Readonly<Record<string, string>> = Object.freeze({
  "elk.algorithm": "layered",
  "elk.edgeRouting": "ORTHOGONAL",
  "elk.hierarchyHandling": "INCLUDE_CHILDREN",
  "elk.randomSeed": String(ELK_RANDOM_SEED),
  "elk.padding": ROOT_PADDING_BOX,
  "elk.spacing.nodeNode": String(NODE_SPACING),
  "elk.spacing.edgeNode": String(EDGE_NODE_SPACING),
  "elk.spacing.edgeEdge": String(EDGE_EDGE_SPACING),
  "elk.spacing.componentComponent": String(COMPONENT_SPACING),
  "elk.spacing.portPort": String(PORT_SPACING),
  "elk.layered.spacing.nodeNodeBetweenLayers": String(LAYER_SPACING),
  "elk.layered.spacing.edgeNodeBetweenLayers": String(EDGE_NODE_SPACING),
  "elk.layered.spacing.edgeEdgeBetweenLayers": String(EDGE_EDGE_SPACING),
});

/** The remedy every refusal carries: one sentence, an action the author owns. */
const LAYOUT_REMEDY =
  "Shorten the diagram's labels, or reduce its node, port and group counts, then render the document again.";

/* ------------------------------------------------------------------ *
 * Returned geometry (contract §4 — frozen)
 * ------------------------------------------------------------------ */

export interface DiagramLayoutPoint { readonly x: number; readonly y: number }

export interface DiagramLayoutBox {
  readonly x: number; readonly y: number; readonly width: number; readonly height: number;
}

export interface DiagramLayoutPort extends DiagramLayoutBox {
  readonly name: string;
  readonly side?: DiagramPortSide;
}

export interface DiagramLayoutNode extends DiagramLayoutBox {
  readonly name: string;
  readonly shape: DiagramShape;
  readonly ports: readonly DiagramLayoutPort[];
}

export interface DiagramLayoutGroup extends DiagramLayoutBox {
  readonly name: string;
  /** 0 for an outermost group. */
  readonly depth: number;
}

export interface DiagramLayoutSection {
  readonly startPoint: DiagramLayoutPoint;
  readonly endPoint: DiagramLayoutPoint;
  readonly bendPoints: readonly DiagramLayoutPoint[];
}

export interface DiagramLayoutEdge { readonly sections: readonly DiagramLayoutSection[] }

export interface DiagramLayout {
  readonly width: number;
  readonly height: number;
  /** Authored declaration order. */
  readonly nodes: readonly DiagramLayoutNode[];
  /** Authored declaration order. */
  readonly groups: readonly DiagramLayoutGroup[];
  /** Authored declaration order. */
  readonly edges: readonly DiagramLayoutEdge[];
}

/** Fail-closed layout refusal; the caller publishes no Artifact. */
export class DiagramLayoutError extends Error {
  readonly code: string;
  readonly remedy: string;

  constructor(message: string, remedy: string = LAYOUT_REMEDY) {
    super(message);
    this.name = "DiagramLayoutError";
    this.code = DIAGRAM_LAYOUT_ERROR_CODE;
    this.remedy = remedy;
  }
}

/* ------------------------------------------------------------------ *
 * Numbers
 * ------------------------------------------------------------------ */

function refusal(detail: string, remedy: string = LAYOUT_REMEDY): DiagramLayoutError {
  return new DiagramLayoutError(`Diagram layout failed: ${detail}`, remedy);
}

/** Quantized 3-decimal value: the only number shape the renderer ever sees. */
function q(value: number): number {
  return Number(quantize(value));
}

/** Fail closed on a coordinate the engine did not supply or made non-finite. */
function coordinate(value: number | undefined, what: string): number {
  if (value === undefined || !Number.isFinite(value)) {
    throw refusal(`${what} is missing or not a finite number.`);
  }
  return value;
}

/* ------------------------------------------------------------------ *
 * Measurement
 * ------------------------------------------------------------------ */

interface Box { readonly width: number; readonly height: number }

/** Node box: the label plus its band, with port space reserved per side. */
function nodeBox(node: DiagramNode, theme: Theme): Box {
  const settings = theme.diagram;
  const half = settings.portSizePx / 2;
  const sides = new Set<DiagramPortSide>();
  for (const port of node.ports) {
    if (port.side !== undefined) sides.add(port.side);
  }
  const advance =
    node.label === undefined
      ? 0
      : Math.max(labelAdvance(node.label, settings.nodeLabelFontSizePx), 0);
  const lines = labelLines(node.label);
  return {
    width: Math.max(
      advance +
        NODE_PADDING_X +
        (sides.has("left") ? half : 0) +
        NODE_PADDING_X +
        (sides.has("right") ? half : 0),
      MIN_NODE_WIDTH,
    ),
    height: Math.max(
      lines * settings.nodeLabelLineHeightPx +
        NODE_PADDING_Y +
        (sides.has("top") ? half : 0) +
        NODE_PADDING_Y +
        (sides.has("bottom") ? half : 0),
      MIN_NODE_HEIGHT,
    ),
  };
}

/** An empty group still draws: its box holds its label and nothing else. */
function emptyGroupBox(group: DiagramGroup, theme: Theme): Box {
  const settings = theme.diagram;
  const advance =
    group.label === undefined
      ? 0
      : Math.max(labelAdvance(group.label, settings.groupLabelFontSizePx), 0);
  return {
    width: Math.max(advance + 2 * GROUP_PADDING, MIN_GROUP_WIDTH),
    height: Math.max(
      labelLines(group.label) * settings.groupLabelLineHeightPx + 2 * GROUP_PADDING,
      MIN_GROUP_HEIGHT,
    ),
  };
}

/** The group label is reserved as extra top padding, so it never sits on a member. */
function groupPadding(group: DiagramGroup, theme: Theme): string {
  const settings = theme.diagram;
  const labelHeight = group.label === undefined
    ? 0
    : labelLines(group.label) * settings.groupLabelLineHeightPx;
  const top = labelHeight === 0 ? GROUP_PADDING : GROUP_PADDING + labelHeight + GROUP_LABEL_GAP;
  return `[top=${top},left=${GROUP_PADDING},bottom=${GROUP_PADDING},right=${GROUP_PADDING}]`;
}

/* ------------------------------------------------------------------ *
 * Plan: authored declarations -> engine graph
 * ------------------------------------------------------------------ */

interface PlannedPort {
  readonly id: string;
  readonly declaration: DiagramPort;
}

interface PlannedNode {
  readonly id: string;
  readonly declaration: DiagramNode;
  readonly ports: readonly PlannedPort[];
}

interface PlannedGroup {
  readonly id: string;
  readonly declaration: DiagramGroup;
  readonly depth: number;
}

interface PlannedEdge {
  readonly id: string;
  readonly declaration: DiagramEdge;
  /** Deepest shared container; the engine routes relative to its origin. */
  readonly containerId: string;
}

interface PlannedGraph {
  readonly root: ElkNode;
  readonly nodes: readonly PlannedNode[];
  readonly groups: readonly PlannedGroup[];
  readonly edges: readonly PlannedEdge[];
  /** element id -> container id; absent for root-level elements. */
  readonly containerOf: ReadonlyMap<string, string>;
}

function portShell(planned: PlannedPort, portSizePx: number): ElkPort {
  const side = planned.declaration.side;
  const shell: ElkPort = { id: planned.id, width: portSizePx, height: portSizePx };
  if (side !== undefined) {
    shell.layoutOptions = { "elk.port.side": ELK_PORT_SIDE[side] };
  }
  return shell;
}

function nodeShell(planned: PlannedNode, theme: Theme): ElkNode {
  const box = nodeBox(planned.declaration, theme);
  const shell: ElkNode = { id: planned.id, width: box.width, height: box.height };
  if (planned.ports.length > 0) {
    shell.ports = planned.ports.map((port) => portShell(port, theme.diagram.portSizePx));
    shell.layoutOptions = { "elk.portConstraints": PORT_CONSTRAINTS };
  }
  return shell;
}

/** Container chain, outermost first; `containerOf` holds no root entry. */
function containerChain(
  containerOf: ReadonlyMap<string, string>,
  elementId: string,
): readonly string[] {
  const chain: string[] = [];
  const seen = new Set<string>([elementId]);
  let container = containerOf.get(elementId);
  while (container !== undefined && container !== ROOT_ID) {
    if (seen.has(container)) throw refusal(`group nesting around "${elementId}" is cyclic.`);
    seen.add(container);
    chain.push(container);
    container = containerOf.get(container);
  }
  chain.push(ROOT_ID);
  chain.reverse();
  return chain;
}

/** The engine attaches an edge to its endpoints' deepest shared container. */
function lowestCommonContainer(
  containerOf: ReadonlyMap<string, string>,
  left: string,
  right: string,
): string {
  const leftChain = containerChain(containerOf, left);
  const rightChain = containerChain(containerOf, right);
  const limit = Math.min(leftChain.length, rightChain.length);
  let common = ROOT_ID;
  for (let index = 0; index < limit; index += 1) {
    const step = leftChain[index];
    if (step === undefined || step !== rightChain[index]) break;
    common = step;
  }
  return common;
}

interface ResolvedEndpoint {
  readonly id: string;
  readonly nodeId: string;
}

function resolveEndpoint(
  endpoint: DiagramEndpoint,
  nodeByName: ReadonlyMap<string, PlannedNode>,
): ResolvedEndpoint {
  const node = nodeByName.get(endpoint.name);
  if (node === undefined) throw refusal(`edge endpoint "${endpoint.name}" names no node.`);
  if (endpoint.port === undefined) return { id: node.id, nodeId: node.id };
  const port = node.ports.find((candidate) => candidate.declaration.name === endpoint.port);
  if (port === undefined) {
    throw refusal(`edge endpoint "${endpoint.name}.${endpoint.port}" names no declared port.`);
  }
  return { id: port.id, nodeId: node.id };
}

/**
 * Build the engine graph in one authored-order pass for identity, one for
 * membership, then assemble containers. Siblings keep authored order (the
 * engine's model order) and every group is an engine parent node.
 */
function planGraph(block: DiagramBlock, theme: Theme): PlannedGraph {
  const nodes: PlannedNode[] = [];
  const groups: PlannedGroup[] = [];
  const edgeDeclarations: DiagramEdge[] = [];
  const shells = new Map<string, ElkNode>();
  const nodeByName = new Map<string, PlannedNode>();
  const groupIdByName = new Map<string, string>();

  let nodeIndex = 0;
  let groupIndex = 0;

  for (const declaration of block.declarations) {
    if (declaration.kind === "node") {
      const planned: PlannedNode = {
        id: `n${nodeIndex}`,
        declaration,
        ports: declaration.ports.map((port, index) => ({
          id: `p${nodeIndex}-${index}`,
          declaration: port,
        })),
      };
      nodeIndex += 1;
      if (nodeByName.has(declaration.name)) {
        throw refusal(`two nodes share the name "${declaration.name}".`);
      }
      nodeByName.set(declaration.name, planned);
      shells.set(planned.id, nodeShell(planned, theme));
      nodes.push(planned);
    } else if (declaration.kind === "group") {
      if (groupIdByName.has(declaration.name)) {
        throw refusal(`two groups share the name "${declaration.name}".`);
      }
      groupIdByName.set(declaration.name, `g${groupIndex}`);
      groups.push({ id: `g${groupIndex}`, declaration, depth: 0 });
      groupIndex += 1;
    } else {
      edgeDeclarations.push(declaration);
    }
  }

  // Membership: authored order, across both member kinds.
  const memberIds = new Map<string, string[]>();
  const containerOf = new Map<string, string>();
  const members: { readonly name: string; readonly id: string; readonly parent: string | undefined }[] = [];
  for (const declaration of block.declarations) {
    if (declaration.kind === "node") {
      members.push({
        name: declaration.name,
        id: nodeByName.get(declaration.name)?.id ?? "",
        parent: declaration.parent,
      });
    } else if (declaration.kind === "group") {
      members.push({
        name: declaration.name,
        id: groupIdByName.get(declaration.name) ?? "",
        parent: declaration.parent,
      });
    }
  }
  for (const member of members) {
    let container = ROOT_ID;
    if (member.parent !== undefined) {
      const parentId = groupIdByName.get(member.parent);
      if (parentId === undefined) {
        throw refusal(
          nodeByName.has(member.parent)
            ? `"${member.name}" is declared inside "${member.parent}", which is a node, not a group.`
            : `"${member.name}" is declared inside "${member.parent}", which is not a group.`,
        );
      }
      container = parentId;
      containerOf.set(member.id, container);
    }
    const siblings = memberIds.get(container);
    if (siblings === undefined) memberIds.set(container, [member.id]);
    else siblings.push(member.id);
  }

  const projectedGroups = groups.map((group) => ({
    ...group,
    depth: containerChain(containerOf, group.id).length - 1,
  }));

  // Deepest first: a nested group must have its box before its parent
  // assembles it, and the author is free to declare the outer group first.
  const assemblyOrder = [...projectedGroups].sort((left, right) => right.depth - left.depth);
  for (const group of assemblyOrder) {
    const children = memberIds.get(group.id) ?? [];
    const shell: ElkNode = { id: group.id };
    if (children.length > 0) {
      shell.children = children.map((id) => {
        const child = shells.get(id);
        if (child === undefined) throw refusal(`group "${group.declaration.name}" has no box.`);
        return child;
      });
      shell.layoutOptions = { "elk.padding": groupPadding(group.declaration, theme) };
    } else {
      const box = emptyGroupBox(group.declaration, theme);
      shell.width = box.width;
      shell.height = box.height;
    }
    shells.set(group.id, shell);
  }

  const rootChildren = (memberIds.get(ROOT_ID) ?? []).map((id) => {
    const child = shells.get(id);
    if (child === undefined) throw refusal(`"${id}" has no engine box.`);
    return child;
  });

  // Edges: positional distinct ids, attached to the container the engine
  // would choose for them, and routed in authored order.
  const edgeShells = new Map<string, ElkExtendedEdge[]>();
  const edges: PlannedEdge[] = edgeDeclarations.map((declaration, index) => {
    const from = resolveEndpoint(declaration.from, nodeByName);
    const to = resolveEndpoint(declaration.to, nodeByName);
    const id = `e${index}`;
    const containerId = lowestCommonContainer(containerOf, from.nodeId, to.nodeId);
    const engineEdge: ElkExtendedEdge = { id, sources: [from.id], targets: [to.id] };
    const hosted = edgeShells.get(containerId);
    if (hosted === undefined) edgeShells.set(containerId, [engineEdge]);
    else hosted.push(engineEdge);
    return { id, declaration, containerId };
  });

  const root: ElkNode = {
    id: ROOT_ID,
    layoutOptions: { ...ROOT_LAYOUT_OPTIONS, "elk.direction": ELK_DIRECTION[block.flow] },
    children: rootChildren,
    edges: edgeShells.get(ROOT_ID) ?? [],
  };
  for (const [containerId, hosted] of edgeShells) {
    if (containerId === ROOT_ID) continue;
    const shell = shells.get(containerId);
    if (shell === undefined) throw refusal(`edge container "${containerId}" has no box.`);
    shell.edges = hosted;
  }

  return { root, nodes, groups: projectedGroups, edges, containerOf };
}

/* ------------------------------------------------------------------ *
 * Engine seam — geometry reads only
 *
 * These shapes name the fields the projection reads. The engine's own result
 * also carries ids, layout options, `container` and an internal `$H`; none of
 * them is declared here, so none of them can reach the returned layout.
 * ------------------------------------------------------------------ */

interface EnginePoint {
  readonly x?: number;
  readonly y?: number;
}

interface EngineShape {
  readonly id?: string;
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
}

interface EngineSection {
  readonly startPoint?: EnginePoint;
  readonly endPoint?: EnginePoint;
  readonly bendPoints?: readonly EnginePoint[];
}

interface EngineEdge {
  readonly id?: string;
  readonly sections?: readonly EngineSection[];
}

interface EngineElement extends EngineShape {
  readonly children?: readonly EngineElement[];
  readonly ports?: readonly EngineShape[];
  readonly edges?: readonly EngineEdge[];
}

/**
 * The engine surface the projection drives. Typing the result as the narrow
 * view above — rather than the library's own node type — is what keeps the
 * raw payload (`$H`, ids, layout options, `container`) out of reach here.
 */
interface ElkEngine {
  layout(graph: ElkNode): Promise<EngineElement>;
}

interface EngineIndex {
  readonly elements: ReadonlyMap<string, EngineElement>;
  readonly edges: ReadonlyMap<string, EngineEdge>;
  /** element id -> absolute origin of its box. */
  readonly origins: ReadonlyMap<string, { readonly x: number; readonly y: number }>;
}

/** Walk the engine result once: index boxes, flatten parent-relative origins. */
function indexEngine(root: EngineElement): EngineIndex {
  const elements = new Map<string, EngineElement>();
  const edges = new Map<string, EngineEdge>();
  const origins = new Map<string, { readonly x: number; readonly y: number }>();

  const visit = (element: EngineElement, originX: number, originY: number): void => {
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
      if (edge.id !== undefined) edges.set(edge.id, edge);
    }
  };

  visit(root, 0, 0);
  return { elements, edges, origins };
}

function projectPoint(
  view: EnginePoint | undefined,
  what: string,
  origin: { readonly x: number; readonly y: number },
): DiagramLayoutPoint {
  return {
    x: q(origin.x + coordinate(view?.x, `${what} x`)),
    y: q(origin.y + coordinate(view?.y, `${what} y`)),
  };
}

function projectPorts(
  planned: PlannedNode,
  element: EngineElement,
  origin: { readonly x: number; readonly y: number },
): readonly DiagramLayoutPort[] {
  if (planned.ports.length === 0) return [];
  const returned = new Map<string, EngineShape>();
  for (const port of element.ports ?? []) {
    if (port.id !== undefined) returned.set(port.id, port);
  }
  return planned.ports.map((port) => {
    const view = returned.get(port.id);
    if (view === undefined) {
      throw refusal(`the layout engine returned no box for port "${port.declaration.name}".`);
    }
    const what = `port "${port.declaration.name}"`;
    const side = port.declaration.side;
    return {
      x: q(origin.x + coordinate(view.x, `${what} x`)),
      y: q(origin.y + coordinate(view.y, `${what} y`)),
      width: q(coordinate(view.width, `${what} width`)),
      height: q(coordinate(view.height, `${what} height`)),
      name: port.declaration.name,
      ...(side === undefined ? {} : { side }),
    };
  });
}

function projectNode(planned: PlannedNode, index: EngineIndex): DiagramLayoutNode {
  const element = index.elements.get(planned.id);
  const origin = index.origins.get(planned.id);
  if (element === undefined || origin === undefined) {
    throw refusal(`the layout engine returned no box for node "${planned.declaration.name}".`);
  }
  return {
    x: q(origin.x),
    y: q(origin.y),
    width: q(coordinate(element.width, `node "${planned.declaration.name}" width`)),
    height: q(coordinate(element.height, `node "${planned.declaration.name}" height`)),
    name: planned.declaration.name,
    shape: planned.declaration.shape,
    ports: projectPorts(planned, element, origin),
  };
}

function projectGroup(planned: PlannedGroup, index: EngineIndex): DiagramLayoutGroup {
  const element = index.elements.get(planned.id);
  const origin = index.origins.get(planned.id);
  if (element === undefined || origin === undefined) {
    throw refusal(`the layout engine returned no box for group "${planned.declaration.name}".`);
  }
  return {
    x: q(origin.x),
    y: q(origin.y),
    width: q(coordinate(element.width, `group "${planned.declaration.name}" width`)),
    height: q(coordinate(element.height, `group "${planned.declaration.name}" height`)),
    name: planned.declaration.name,
    depth: planned.depth,
  };
}

function projectEdge(planned: PlannedEdge, index: EngineIndex): DiagramLayoutEdge {
  const edge = index.edges.get(planned.id);
  if (edge === undefined) {
    throw refusal(
      `the layout engine returned no route for the edge from "${planned.declaration.from.name}".`,
    );
  }
  // Section points are relative to the container that hosts the edge.
  const origin = index.origins.get(planned.containerId) ?? { x: 0, y: 0 };
  const sections = (edge.sections ?? []).map((section, sectionIndex) => {
    const what = `edge section ${sectionIndex}`;
    return {
      startPoint: projectPoint(section.startPoint, `${what} start`, origin),
      endPoint: projectPoint(section.endPoint, `${what} end`, origin),
      bendPoints: (section.bendPoints ?? []).map((point, pointIndex) =>
        projectPoint(point, `${what} bend ${pointIndex}`, origin),
      ),
    };
  });
  return { sections };
}

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

/**
 * Measured, quantized layout for one Block. Deterministic; browser-free.
 *
 * Fails closed: the returned value is either a complete layout or a
 * `DiagramLayoutError` carrying a remedy — never a partial one.
 */
export async function layoutDiagram(block: DiagramBlock, theme: Theme): Promise<DiagramLayout> {
  try {
    const graph = planGraph(block, theme);
    // A static import cannot serve this contract: §4 requires a missing
    // `elkjs` to surface as a structured DiagramLayoutError at call time,
    // never as a load-time crash of every consumer that imports the package.
    // The bundled build is CommonJS, so under NodeNext interop the module's
    // `default` types as the namespace rather than the constructor; one cast
    // at that library boundary is what buys the narrow `ElkEngine` surface.
    const module = await import("elkjs/lib/elk.bundled.js");
    const ElkConstructor = module.default as unknown as new () => ElkEngine;
    const engine = new ElkConstructor();
    const raw = await engine.layout(graph.root);
    const index = indexEngine(raw);
    const width = coordinate(raw.width, "the diagram width");
    const height = coordinate(raw.height, "the diagram height");
    return {
      width: q(width),
      height: q(height),
      nodes: graph.nodes.map((node) => projectNode(node, index)),
      groups: graph.groups.map((group) => projectGroup(group, index)),
      edges: graph.edges.map((edge) => projectEdge(edge, index)),
    };
  } catch (error) {
    if (error instanceof DiagramLayoutError) throw error;
    throw refusal(error instanceof Error ? error.message : String(error));
  }
}
