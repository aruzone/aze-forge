import type {
  AzeBlockRenderer,
  BlockRendererContext,
  CircuitBlock,
  CircuitComponent,
  CircuitText,
} from "./model.js";

export const CIRCUIT_HTML_BLOCK_RENDERER_ID = "azeforge.circuit.html/v1" as const;
export const CIRCUIT_HTML_BLOCK_RENDERER_VERSION = "1.0.0" as const;

function q(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? "0" : rounded.toFixed(3).replace(/\.000$/, "");
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&quot;");
}

function safeId(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "circuit";
}

function textValue(text: CircuitText): string {
  return text.map((run) => run.kind === "quantity" ? `${run.coefficient} ${run.prefix}${run.unit}` : run.value).join("");
}

function textRuns(text: CircuitText, x: number, y: number): string {
  return `<text x="${q(x)}" y="${q(y)}" text-anchor="middle" font-size="12" fill="currentColor" stroke="none">${text.map((run) => {
    const value = escapeXml(run.kind === "quantity" ? `${run.coefficient} ${run.prefix}${run.unit}` : run.value);
    return `<tspan dy="${run.kind === "subscript" ? "3" : run.kind === "superscript" ? "-4" : "0"}" font-size="${run.kind === "text" || run.kind === "quantity" ? "12" : "9"}">${value}</tspan>`;
  }).join("")}</text>`;
}

function textElement(value: string, x: number, y: number, size = 12): string {
  return `<text x="${q(x)}" y="${q(y)}" text-anchor="middle" font-size="${size}" fill="currentColor" stroke="none">${escapeXml(value)}</text>`;
}

type Point = { readonly x: number; readonly y: number };
type Port = Point & { readonly terminal: string };

function rotation(orientation: CircuitComponent["orientation"]): number {
  switch (orientation) {
    case "right-to-left": return 180;
    case "top-to-bottom": return 90;
    case "bottom-to-top": return -90;
    default: return 0;
  }
}

function rotate(point: Point, degrees: number): Point {
  if (degrees === 180) return { x: -point.x, y: -point.y };
  if (degrees === 90) return { x: -point.y, y: point.x };
  if (degrees === -90) return { x: point.y, y: -point.x };
  return point;
}

function portOffsets(component: CircuitComponent): readonly Port[] {
  const terminals = component.terminals;
  const inputRows = (names: readonly string[], x: number): Port[] => names.map((terminal, index) => ({
    terminal, x, y: (index - (names.length - 1) / 2) * 16,
  }));
  const side = (name: string, x: number, y = 0): Port => ({ terminal: name, x, y });
  switch (component.kind) {
    case "and": case "or": case "nand": case "nor": case "xor": case "xnor":
      return [...inputRows(terminals.filter((terminal) => terminal.startsWith("in")), -66), ...terminals.filter((terminal) => terminal === "out").map((terminal) => side(terminal, 66))];
    case "not": case "buffer": return [side("in", -66), side("out", 66)];
    case "mux-2to1": case "mux-4to1":
      return [...inputRows(terminals.filter((terminal) => terminal.startsWith("d")), -60), ...terminals.filter((terminal) => terminal.startsWith("s")).map((terminal, index) => side(terminal, -18 + index * 18, 46)), side("out", 66)];
    case "d-flip-flop": return [side("d", -66, -14), side("clk", -66, 14), side("q", 66)];
    case "op-amp": return [side("nonInverting", -66, -14), side("inverting", -66, 14), side("output", 66), side("positiveSupply", 0, -46), side("negativeSupply", 0, 46)];
    case "dependent-source": return [side("positive", 0, -46), side("negative", 0, 46), side("controlPositive", -66, -14), side("controlNegative", -66, 14)];
    case "bjt": return [side("collector", 0, -46), side("base", -66), side("emitter", 0, 46)];
    case "mosfet": return [side("drain", 0, -46), side("gate", -66), side("source", 0, 46)];
    case "voltage-source": case "current-source": return [side("positive", 0, -46), side("negative", 0, 46)];
    case "digital-input": return [side("out", 66)];
    case "digital-output": return [side("in", -66)];
    case "resistor": case "capacitor": case "inductor": case "diode": case "led": case "switch": return [side(terminals[0]!, -66), side(terminals[1]!, 66)];
  }
}

function body(component: CircuitComponent, convention: CircuitBlock["symbolConvention"]): string {
  const kind = component.kind;
  const inverted = kind === "nand" || kind === "nor" || kind === "xnor";
  const bubble = inverted || kind === "not" ? `<circle cx="53" cy="0" r="5" fill="var(--aze-circuit-bg,white)"/>` : "";
  if (kind === "and" || kind === "or" || kind === "nand" || kind === "nor" || kind === "xor" || kind === "xnor") {
    const fanIn = component.terminals.filter((terminal) => terminal.startsWith("in")).length;
    const fanInLabel = `<text class="aze-circuit-fan-in" x="0" y="16" text-anchor="middle" font-size="8" fill="currentColor" stroke="none">${fanIn}</text>`;
    if (convention === "iec") {
      const mark = kind === "and" || kind === "nand" ? "&" : kind === "or" || kind === "nor" ? "≥1" : "=1";
      return `<rect x="-48" y="-26" width="96" height="52" rx="2"/>${textElement(mark, 0, 0)}${fanInLabel}${bubble}`;
    }
    const xor = kind === "xor" || kind === "xnor" ? `<path d="M-52 -26Q-32 0 -52 26"/>` : "";
    const curve = kind === "and" || kind === "nand" ? `M-48 -26H8Q48 -26 48 0Q48 26 8 26H-48Z` : `M-48 -26Q-22 0 -48 26H4Q30 20 48 0Q30 -20 4 -26Z`;
    return `${xor}<path d="${curve}"/>${fanInLabel}${bubble}`;
  }
  switch (kind) {
    case "not": case "buffer": return `<path d="M-48 -26L48 0L-48 26Z"/>${bubble}`;
    case "mux-2to1": case "mux-4to1": return `<rect x="-48" y="-26" width="96" height="52"/>${textElement(kind === "mux-2to1" ? "2:1 MUX" : "4:1 MUX", 0, 4, 10)}`;
    case "d-flip-flop": return `<rect x="-48" y="-26" width="96" height="52"/>${textElement("D", -28, -10, 10)}${textElement("Q", 28, 4, 10)}<path d="M-48 8l9 6-9 6"/>`;
    case "digital-input": return `<path d="M-48 -16H20L28 0L20 16H-48Z"/>${textElement("IN", -8, 4, 10)}`;
    case "digital-output": return `<path d="M48 -16H-20L-28 0L-20 16H48Z"/>${textElement("OUT", 8, 4, 10)}`;
    case "resistor": return convention === "iec" ? `<rect x="-32" y="-10" width="64" height="20"/>` : `<path d="M-32 0l8-12 12 24 12-24 12 24 12-24 8 12"/>`;
    case "capacitor": return `<path d="M-8 -22V22M8 -22V22"/>`;
    case "inductor": return `<path d="M-32 0a8 12 0 0 1 16 0a8 12 0 0 1 16 0a8 12 0 0 1 16 0a8 12 0 0 1 16 0"/>`;
    case "voltage-source": return `<circle r="25"/>${textElement("+", 0, -7, 14)}${textElement("−", 0, 15, 14)}`;
    case "current-source": return `<circle r="25"/><path d="M0 13V-12m0 0-6 8m6-8 6 8"/>`;
    case "dependent-source": return `<path d="M0 -26L26 0L0 26L-26 0Z"/>`;
    case "diode": return `<path d="M-24 -22V22L18 0Z M28 -22V22"/>`;
    case "led": return `<path d="M-24 -22V22L18 0Z M28 -22V22M4 -30l9-9m-2 1 2 8m13-4 9-9m-2 1 2 8"/>`;
    case "switch": return `<circle cx="-25" cy="0" r="3"/><circle cx="25" cy="0" r="3"/><path d="M-22 -3L21 -20"/>`;
    case "op-amp": return `<path d="M-42 -28L48 0L-42 28Z"/>${textElement("+", -29, -9, 12)}${textElement("−", -29, 17, 12)}`;
    case "bjt": return `<circle r="26"/><path d="M-26 0h20m0 0V-18m0 18v18m0-18 22-18m-22 18 22 18m-8-4 8 4-8 4"/>`;
    case "mosfet": return `<path d="M-26 0h18m8-22v44m0-18h28m-18-26v52m-10-18h10"/>`;
  }
}

function componentShape(component: CircuitComponent, convention: CircuitBlock["symbolConvention"], position: Point, svgId: string): { readonly markup: string; readonly ports: readonly Port[] } {
  const degrees = rotation(component.orientation);
  const localPorts = portOffsets(component);
  const ports = localPorts.map((port) => {
    const offset = rotate(port, degrees);
    return { terminal: port.terminal, x: position.x + offset.x, y: position.y + offset.y };
  });
  const stubs = localPorts.map((port) => `<path id="${svgId}-port-${safeId(component.ref)}-${safeId(port.terminal)}" d="M${q(port.x * 0.73)} ${q(port.y * 0.73)}L${q(port.x)} ${q(port.y)}" class="aze-circuit-terminal"/>`).join("");
  const label = component.name ?? component.value;
  const transform = degrees === 0 ? `translate(${q(position.x)} ${q(position.y)})` : `translate(${q(position.x)} ${q(position.y)}) rotate(${degrees})`;
  return { ports, markup: `<g id="${svgId}-component-${safeId(component.ref)}" class="aze-circuit-component" aria-label="${escapeXml(`${component.ref}: ${component.kind}`)}" stroke="currentColor" fill="none" stroke-width="1.5" transform="${transform}">${stubs}${body(component, convention)}${textElement(component.ref, 0, -39, 11)}${label === undefined ? "" : textRuns(label, 0, 46)}</g>` };
}

export function renderCircuitFragment(block: CircuitBlock, _context: BlockRendererContext): string {
  const across = block.flow === "left-to-right" ? 4 : 3;
  const stepX = block.flow === "left-to-right" ? 168 : 144;
  const stepY = block.flow === "left-to-right" ? 124 : 152;
  const positions = new Map(block.components.map((component, index) => [component.ref, { x: 96 + index % across * stepX, y: 88 + Math.floor(index / across) * stepY }]));
  const rows = Math.max(1, Math.ceil(block.components.length / across));
  const width = Math.max(288, 192 + Math.min(across, Math.max(1, block.components.length)) * stepX);
  const height = Math.max(188, 140 + rows * stepY + Math.ceil(block.nodes.length / 6) * 28);
  const nodeY = height - 34;
  const nodePositions = new Map(block.nodes.map((node, index) => [node.ref, { x: 48 + index % 6 * ((width - 96) / 5), y: nodeY - Math.floor(index / 6) * 28 }]));
  const svgId = `aze-circuit-${safeId(block.id ?? `${textValue(block.title)}-${block.components.map(({ ref }) => ref).join("-")}`)}`;
  const rendered = new Map(block.components.map((component) => [component.ref, componentShape(component, block.symbolConvention, positions.get(component.ref)!, svgId)]));
  const portByRelation = new Map(block.relations.map((relation) => [`${relation.componentRef}\u0000${relation.terminal}`, rendered.get(relation.componentRef)?.ports.find((port) => port.terminal === relation.terminal)]));
  const wires = block.relations.map((relation, index) => {
    const port = portByRelation.get(`${relation.componentRef}\u0000${relation.terminal}`);
    const node = nodePositions.get(relation.nodeId);
    if (port === undefined || node === undefined) return "";
    const bendY = port.y + (node.y - port.y) / 2 + (index % 3 - 1) * 8;
    return `<path id="${svgId}-wire-${index}" d="M${q(port.x)} ${q(port.y)}V${q(bendY)}H${q(node.x)}V${q(node.y)}"/>`;
  }).join("");
  const annotations = block.annotations.map((annotation, index) => {
    if (annotation.kind === "voltage-label") {
      const positive = nodePositions.get(annotation.positive); const negative = nodePositions.get(annotation.negative);
      if (positive === undefined || negative === undefined) return "";
      return `<path id="${svgId}-annotation-${index}" d="M${q(positive.x)} ${q(positive.y - 10)}H${q(negative.x)}" stroke-dasharray="3 2"/>${textElement(`V(${annotation.positive}, ${annotation.negative})`, (positive.x + negative.x) / 2, Math.min(positive.y, negative.y) - 14, 9)}`;
    }
    const port = portByRelation.get(`${annotation.componentRef}\u0000${annotation.terminal}`);
    if (port === undefined) return "";
    return `<path id="${svgId}-annotation-${index}" d="M${q(port.x)} ${q(port.y)}l${q(annotation.direction === "into" ? -12 : 12)} -10m${q(annotation.direction === "into" ? -12 : 12)} -10l${q(annotation.direction === "into" ? 7 : -7)} 1m${q(annotation.direction === "into" ? -7 : 7)} -1l${q(annotation.direction === "into" ? -1 : 1)} 7"/>`;
  }).join("");
  const nodes = block.nodes.map((node) => {
    const position = nodePositions.get(node.ref)!;
    return `<g id="${svgId}-node-${safeId(node.ref)}"><circle cx="${q(position.x)}" cy="${q(position.y)}" r="${node.role === "reference" ? "4" : "3"}" fill="currentColor"/>${node.role === "reference" ? `<path d="M${q(position.x - 9)} ${q(position.y + 7)}h18m-14 4h10m-6 4h2"/>` : ""}${textElement(node.label === undefined ? node.ref : textValue(node.label), position.x, position.y + 18, 10)}</g>`;
  }).join("");
  const description = block.description === undefined ? `Circuit diagram: ${textValue(block.title)}` : textValue(block.description);
  return `<figure class="aze-circuit" id="${svgId}" data-circuit-convention="${block.symbolConvention}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${q(width)} ${q(height)}" role="img" aria-labelledby="${svgId}-title ${svgId}-desc"><title id="${svgId}-title">${escapeXml(textValue(block.title))}</title><desc id="${svgId}-desc">${escapeXml(description)}</desc><g class="aze-circuit-wires" stroke="currentColor" fill="none" stroke-width="1.25">${wires}${annotations}</g>${block.components.map((component) => rendered.get(component.ref)!.markup).join("")}<g class="aze-circuit-nodes" fill="currentColor">${nodes}</g></svg></figure>`;
}

export const circuitHtmlBlockRenderer: AzeBlockRenderer<CircuitBlock> = Object.freeze({
  descriptor: Object.freeze({
    id: CIRCUIT_HTML_BLOCK_RENDERER_ID,
    version: CIRCUIT_HTML_BLOCK_RENDERER_VERSION,
    blockType: "circuit",
    pluginVersionRange: "1.0.0",
    rendererId: "html",
    rendererVersionRange: "1.0.0",
  }),
  render(block: CircuitBlock, context: BlockRendererContext): string {
    return renderCircuitFragment(block, context);
  },
});
