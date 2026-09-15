import type {
  Diagnostic,
  JsonValue,
  ParsedBlock,
  SourcePosition,
  SourceRange,
} from "./model.js";
import { isObjectRecord } from "./type-guards.js";
import { createDiagnostic } from "./diagnostics.js";
const OUTPUT_FORMATS: Readonly<Record<string, true>> = {
  html: true,
  svg: true,
  png: true,
  pdf: true,
};


function hasOnlyKeys(record: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(record).every((key) => allowed.includes(key));
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((item) => isJsonValue(item));
  return (
    isObjectRecord(value) &&
    Object.values(value).every((item) => isJsonValue(item))
  );
}

function isSourcePosition(value: unknown): value is SourcePosition {
  if (!isObjectRecord(value) || !hasOnlyKeys(value, ["line", "column", "offset"])) {
    return false;
  }
  return (
    Number.isInteger(value.line) &&
    (value.line as number) >= 1 &&
    Number.isInteger(value.column) &&
    (value.column as number) >= 1 &&
    Number.isInteger(value.offset) &&
    (value.offset as number) >= 0
  );
}

function isSourceRange(value: unknown): value is SourceRange {
  if (!isObjectRecord(value) || !hasOnlyKeys(value, ["start", "end"])) return false;
  if (!isSourcePosition(value.start) || !isSourcePosition(value.end)) return false;
  return (
    value.start.offset <= value.end.offset &&
    (value.start.line < value.end.line ||
      (value.start.line === value.end.line &&
        value.start.column <= value.end.column))
  );
}

function hasValidCommonBlockFields(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  return (
    hasOnlyKeys(value, allowed) &&
    isSourceRange(value.range) &&
    (value.id === undefined || typeof value.id === "string")
  );
}

function isInlineNode(value: unknown): boolean {
  if (!isObjectRecord(value)) return false;
  if (value.kind === "text" || value.kind === "code") {
    return (
      hasOnlyKeys(value, ["kind", "value"]) && typeof value.value === "string"
    );
  }
  if (value.kind === "emphasis" || value.kind === "strong") {
    return (
      hasOnlyKeys(value, ["kind", "children"]) &&
      Array.isArray(value.children) &&
      (value.children as unknown[]).every((child) => isInlineNode(child))
    );
  }
  if (value.kind === "break") {
    return hasOnlyKeys(value, ["kind"]);
  }
  if (value.kind === "link") {
    return (
      hasOnlyKeys(value, ["kind", "href", "children", "title", "range"]) &&
      typeof value.href === "string" &&
      (value.href as string).length > 0 &&
      Array.isArray(value.children) &&
      (value.children as unknown[]).every((child) => isInlineNode(child)) &&
      (value.title === undefined || typeof value.title === "string") &&
      (value.range === undefined || isSourceRange(value.range))
    );
  }
  if (value.kind === "image") {
    return (
      hasOnlyKeys(value, ["kind", "src", "alt", "title", "range"]) &&
      typeof value.src === "string" &&
      (value.src as string).length > 0 &&
      typeof value.alt === "string" &&
      (value.title === undefined || typeof value.title === "string") &&
      (value.range === undefined || isSourceRange(value.range))
    );
  }
  return false;
}

function hasInlineChildren(value: unknown): boolean {
  return Array.isArray(value) && value.every((child) => isInlineNode(child));
}

const CIRCUIT_COMPONENT_KINDS: Readonly<Record<string, true>> = {
  resistor: true,
  capacitor: true,
  inductor: true,
  "voltage-source": true,
  "current-source": true,
  diode: true,
  led: true,
  switch: true,
  "dependent-source": true,
  "op-amp": true,
  bjt: true,
  mosfet: true,
  and: true,
  or: true,
  nand: true,
  nor: true,
  xor: true,
  xnor: true,
  not: true,
  buffer: true,
  "mux-2to1": true,
  "mux-4to1": true,
  "d-flip-flop": true,
  "digital-input": true,
  "digital-output": true,
};

const CIRCUIT_GATE_KINDS: Readonly<Record<string, true>> = {
  and: true,
  or: true,
  nand: true,
  nor: true,
  xor: true,
  xnor: true,
};

function isCircuitText(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every((run) => {
      if (!isObjectRecord(run)) return false;
      if (
        run.kind === "text" ||
        run.kind === "subscript" ||
        run.kind === "superscript"
      ) {
        return (
          hasOnlyKeys(run, ["kind", "value"]) && typeof run.value === "string"
        );
      }
      return (
        run.kind === "quantity" &&
        hasOnlyKeys(run, ["kind", "coefficient", "prefix", "unit"]) &&
        typeof run.coefficient === "string" &&
        typeof run.prefix === "string" &&
        typeof run.unit === "string"
      );
    })
  );
}

const DIAGRAM_MODES: Readonly<Record<string, true>> = {
  flowchart: true,
  graph: true,
  tree: true,
  architecture: true,
};
const DIAGRAM_FLOWS: Readonly<Record<string, true>> = {
  "top-to-bottom": true,
  "bottom-to-top": true,
  "left-to-right": true,
  "right-to-left": true,
};
const DIAGRAM_SHAPES: Readonly<Record<string, true>> = {
  rectangle: true,
  rounded: true,
  diamond: true,
  parallelogram: true,
  circle: true,
  hexagon: true,
  cylinder: true,
};
const DIAGRAM_PORT_SIDES: Readonly<Record<string, true>> = {
  left: true,
  right: true,
  top: true,
  bottom: true,
};

function isDiagramLabel(value: unknown): boolean {
  return Array.isArray(value) && value.length >= 1 && value.every((line) => isCircuitText(line));
}

function isDiagramPort(value: unknown): boolean {
  if (!isObjectRecord(value) || !hasOnlyKeys(value, ["name", "side", "range"])) {
    return false;
  }
  return (
    typeof value.name === "string" &&
    (value.side === undefined || DIAGRAM_PORT_SIDES[value.side as string] === true) &&
    isSourceRange(value.range)
  );
}

function isDiagramEndpoint(value: unknown): boolean {
  if (!isObjectRecord(value) || !hasOnlyKeys(value, ["name", "port", "range"])) {
    return false;
  }
  return (
    typeof value.name === "string" &&
    (value.port === undefined || typeof value.port === "string") &&
    isSourceRange(value.range)
  );
}

function isDiagramDeclaration(value: unknown): boolean {
  if (!isObjectRecord(value)) return false;
  if (value.kind === "node") {
    return (
      hasOnlyKeys(value, ["kind", "name", "label", "shape", "parent", "ports", "range"]) &&
      typeof value.name === "string" &&
      (value.label === undefined || isDiagramLabel(value.label)) &&
      DIAGRAM_SHAPES[value.shape as string] === true &&
      (value.parent === undefined || typeof value.parent === "string") &&
      Array.isArray(value.ports) &&
      value.ports.every((port) => isDiagramPort(port)) &&
      isSourceRange(value.range)
    );
  }
  if (value.kind === "group") {
    return (
      hasOnlyKeys(value, ["kind", "name", "label", "parent", "range"]) &&
      typeof value.name === "string" &&
      (value.label === undefined || isDiagramLabel(value.label)) &&
      (value.parent === undefined || typeof value.parent === "string") &&
      isSourceRange(value.range)
    );
  }
  if (value.kind === "edge") {
    return (
      hasOnlyKeys(value, ["kind", "from", "to", "label", "direction", "range"]) &&
      isDiagramEndpoint(value.from) &&
      isDiagramEndpoint(value.to) &&
      (value.label === undefined || isDiagramLabel(value.label)) &&
      (value.direction === "directed" || value.direction === "undirected") &&
      isSourceRange(value.range)
    );
  }
  return false;
}

function isDiagramBlock(value: Record<string, unknown>): boolean {
  return (
    hasOnlyKeys(value, [
      "kind",
      "pluginVersion",
      "range",
      "id",
      "number",
      "title",
      "description",
      "mode",
      "flow",
      "declarations",
    ]) &&
    value.pluginVersion === "1.0.0" &&
    DIAGRAM_MODES[value.mode as string] === true &&
    DIAGRAM_FLOWS[value.flow as string] === true &&
    (value.id === undefined || typeof value.id === "string") &&
    (value.number === undefined || typeof value.number === "boolean") &&
    (value.title === undefined || isCircuitText(value.title)) &&
    (value.description === undefined || isCircuitText(value.description)) &&
    Array.isArray(value.declarations) &&
    value.declarations.every((declaration) => isDiagramDeclaration(declaration)) &&
    isSourceRange(value.range)
  );
}

function isCircuitComponent(value: unknown): boolean {
  if (!isObjectRecord(value)) return false;
  const kind = value.kind;
  return (
    typeof kind === "string" &&
    CIRCUIT_COMPONENT_KINDS[kind] === true &&
    hasOnlyKeys(value, [
      "kind",
      "ref",
      "terminals",
      "orientation",
      "inputs",
      "name",
      "value",
      "mode",
      "range",
    ]) &&
    typeof value.ref === "string" &&
    Array.isArray(value.terminals) &&
    value.terminals.every((terminal) => typeof terminal === "string") &&
    (value.orientation === undefined ||
      value.orientation === "left-to-right" ||
      value.orientation === "right-to-left" ||
      value.orientation === "top-to-bottom" ||
      value.orientation === "bottom-to-top") &&
    (value.inputs === undefined ||
      (CIRCUIT_GATE_KINDS[kind] === true &&
        (value.inputs === 2 || value.inputs === 3 || value.inputs === 4))) &&
    ((kind === "digital-input" || kind === "digital-output")
      ? isCircuitText(value.name)
      : value.name === undefined || isCircuitText(value.name)) &&
    (value.value === undefined || isCircuitText(value.value)) &&
    (value.mode === undefined || typeof value.mode === "string") &&
    isSourceRange(value.range)
  );
}

function isCircuitAnnotation(value: unknown): boolean {
  if (!isObjectRecord(value)) return false;
  if (value.kind === "voltage-label") {
    return (
      hasOnlyKeys(value, ["kind", "positive", "negative", "range"]) &&
      typeof value.positive === "string" &&
      typeof value.negative === "string" &&
      isSourceRange(value.range)
    );
  }
  if (value.kind === "current-label") {
    return (
      hasOnlyKeys(value, [
        "kind",
        "componentRef",
        "terminal",
        "direction",
        "range",
      ]) &&
      typeof value.componentRef === "string" &&
      typeof value.terminal === "string" &&
      (value.direction === "into" || value.direction === "out") &&
      isSourceRange(value.range)
    );
  }
  return false;
}


function isTimingIntervalState(value: unknown): boolean {
  return (
    value === "low" ||
    value === "high" ||
    value === "unknown" ||
    value === "impedance" ||
    value === "bus" ||
    value === "continue" ||
    value === "rise" ||
    value === "fall"
  );
}

function isTimingInterval(value: unknown): boolean {
  return (
    isObjectRecord(value) &&
    hasOnlyKeys(value, ["count", "duration", "state", "value"]) &&
    isTimingIntervalState(value.state) &&
    (value.count === undefined || typeof value.count === "string") &&
    (value.duration === undefined ||
      typeof value.duration === "string") &&
    value.count !== value.duration &&
    (value.value === undefined || isCircuitText(value.value))
  );
}

function isTimingSignal(value: unknown): boolean {
  return (
    isObjectRecord(value) &&
    hasOnlyKeys(value, [
      "ref",
      "clock",
      "phase",
      "width",
      "intervals",
      "range",
    ]) &&
    typeof value.ref === "string" &&
    typeof value.clock === "boolean" &&
    typeof value.phase === "string" &&
    (value.width === undefined || typeof value.width === "number") &&
    Array.isArray(value.intervals) &&
    value.intervals.every((interval) => isTimingInterval(interval)) &&
    isSourceRange(value.range)
  );
}

function isTimingAnchor(value: unknown): boolean {
  return (
    isObjectRecord(value) &&
    hasOnlyKeys(value, ["signal", "boundary", "range"]) &&
    typeof value.signal === "string" &&
    typeof value.boundary === "string" &&
    isSourceRange(value.range)
  );
}

function isTimingBlock(value: Record<string, unknown>): boolean {
  return (
    hasOnlyKeys(value, [
      "kind",
      "range",
      "id",
      "number",
      "pluginVersion",
      "title",
      "description",
      "scale",
      "unit",
      "signals",
      "groups",
      "markers",
      "arrows",
    ]) &&
    isSourceRange(value.range) &&
    (value.id === undefined || typeof value.id === "string") &&
    (value.number === undefined || typeof value.number === "boolean") &&
    value.pluginVersion === "1.0.0" &&
    isCircuitText(value.title) &&
    (value.description === undefined || isCircuitText(value.description)) &&
    (value.scale === "cycles" || value.scale === "time") &&
    (value.unit === undefined || typeof value.unit === "string") &&
    (value.scale === "time" ? typeof value.unit === "string" : value.unit === undefined) &&
    Array.isArray(value.signals) &&
    value.signals.every((signal) => isTimingSignal(signal)) &&
    Array.isArray(value.groups) &&
    value.groups.every(
      (group) =>
        isObjectRecord(group) &&
        hasOnlyKeys(group, ["label", "signals", "range"]) &&
        isCircuitText(group.label) &&
        Array.isArray(group.signals) &&
        group.signals.every((ref) => typeof ref === "string") &&
        isSourceRange(group.range),
    ) &&
    Array.isArray(value.markers) &&
    value.markers.every(
      (marker) =>
        isObjectRecord(marker) &&
        hasOnlyKeys(marker, ["at", "label", "range"]) &&
        typeof marker.at === "string" &&
        (marker.label === undefined || isCircuitText(marker.label)) &&
        isSourceRange(marker.range),
    ) &&
    Array.isArray(value.arrows) &&
    value.arrows.every(
      (arrow) =>
        isObjectRecord(arrow) &&
        hasOnlyKeys(arrow, ["from", "to", "label", "range"]) &&
        isTimingAnchor(arrow.from) &&
        isTimingAnchor(arrow.to) &&
        (arrow.label === undefined || isCircuitText(arrow.label)) &&
        isSourceRange(arrow.range),
    )
  );
}

const SEQUENCE_PARTICIPANT_KINDS: Readonly<Record<string, true>> = { participant: true, actor: true };
const SEQUENCE_MESSAGE_FORMS: Readonly<Record<string, true>> = { sync: true, async: true, return: true };
const CARDINALITY_VALUES: Readonly<Record<string, true>> = {
  "one": true,
  "zero-or-one": true,
  "many": true,
  "one-or-many": true,
};
const ENTITY_KEY_VALUES: Readonly<Record<string, true>> = { primary: true, foreign: true, unique: true };
const CLASS_VISIBILITY_VALUES: Readonly<Record<string, true>> = {
  public: true,
  private: true,
  protected: true,
  package: true,
};
const CLASS_RELATIONSHIP_FORMS: Readonly<Record<string, true>> = {
  inheritance: true,
  implementation: true,
  association: true,
  aggregation: true,
  composition: true,
};

function isModelsHeader(value: Record<string, unknown>, kind: string, keys: readonly string[]): boolean {
  return (
    hasOnlyKeys(value, keys) &&
    isSourceRange(value.range) &&
    value.pluginVersion === "1.0.0" &&
    value.kind === kind &&
    (value.id === undefined || typeof value.id === "string") &&
    (value.number === undefined || typeof value.number === "boolean") &&
    (value.title === undefined || typeof value.title === "string") &&
    (value.description === undefined || typeof value.description === "string")
  );
}

function isSequenceBlock(value: Record<string, unknown>): boolean {
  return (
    isModelsHeader(value, "sequence", [
      "kind",
      "range",
      "id",
      "number",
      "pluginVersion",
      "title",
      "description",
      "participants",
      "timeline",
    ]) &&
    Array.isArray(value.participants) &&
    value.participants.every(
      (participant) =>
        isObjectRecord(participant) &&
        hasOnlyKeys(participant, ["name", "kind", "label", "range"]) &&
        typeof participant.name === "string" &&
        SEQUENCE_PARTICIPANT_KINDS[participant.kind as string] === true &&
        (participant.label === undefined || typeof participant.label === "string") &&
        isSourceRange(participant.range),
    ) &&
    Array.isArray(value.timeline) &&
    value.timeline.every((item) => isSequenceTimelineItem(item))
  );
}

function isSequenceTimelineItem(value: unknown): boolean {
  if (!isObjectRecord(value) || !isSourceRange(value.range)) return false;
  if (value.kind === "message") {
    return (
      hasOnlyKeys(value, ["kind", "form", "from", "to", "text", "activate", "deactivate", "range"]) &&
      SEQUENCE_MESSAGE_FORMS[value.form as string] === true &&
      typeof value.from === "string" &&
      typeof value.to === "string" &&
      (value.text === undefined || typeof value.text === "string") &&
      typeof value.activate === "boolean" &&
      typeof value.deactivate === "boolean"
    );
  }
  if (value.kind === "note") {
    return (
      hasOnlyKeys(value, ["kind", "over", "text", "range"]) &&
      Array.isArray(value.over) &&
      value.over.every((name) => typeof name === "string") &&
      typeof value.text === "string"
    );
  }
  if (value.kind === "loop") {
    return (
      hasOnlyKeys(value, ["kind", "condition", "body", "range"]) &&
      (value.condition === undefined || typeof value.condition === "string") &&
      Array.isArray(value.body) &&
      value.body.every((item) => isSequenceTimelineItem(item))
    );
  }
  if (value.kind === "alt") {
    return (
      hasOnlyKeys(value, ["kind", "divisions", "range"]) &&
      Array.isArray(value.divisions) &&
      value.divisions.every(
        (division) =>
          isObjectRecord(division) &&
          hasOnlyKeys(division, ["condition", "body", "range"]) &&
          (division.condition === undefined || typeof division.condition === "string") &&
          Array.isArray(division.body) &&
          division.body.every((item) => isSequenceTimelineItem(item)) &&
          isSourceRange(division.range),
      )
    );
  }
  return false;
}

function isStateScopedItem(value: unknown): boolean {
  if (!isObjectRecord(value) || !isSourceRange(value.range) || typeof value.name !== "string") return false;
  if (value.kind === "state") {
    return (
      hasOnlyKeys(value, ["kind", "name", "label", "states", "range"]) &&
      (value.label === undefined || typeof value.label === "string") &&
      Array.isArray(value.states) &&
      value.states.every((item) => isStateScopedItem(item))
    );
  }
  return (value.kind === "initial" || value.kind === "final") && hasOnlyKeys(value, ["kind", "name", "range"]);
}

function isStateBlock(value: Record<string, unknown>): boolean {
  return (
    isModelsHeader(value, "state", [
      "kind",
      "range",
      "id",
      "number",
      "pluginVersion",
      "title",
      "description",
      "items",
    ]) &&
    Array.isArray(value.items) &&
    value.items.every((item) => {
      if (isObjectRecord(item) && item.kind === "transition") {
        return (
          isSourceRange(item.range) &&
          hasOnlyKeys(item, ["kind", "from", "to", "trigger", "guard", "action", "range"]) &&
          typeof item.from === "string" &&
          typeof item.to === "string" &&
          (item.trigger === undefined || typeof item.trigger === "string") &&
          (item.guard === undefined || typeof item.guard === "string") &&
          (item.action === undefined || typeof item.action === "string")
        );
      }
      return isStateScopedItem(item);
    })
  );
}

function isEntityAttribute(value: unknown): boolean {
  return (
    isObjectRecord(value) &&
    hasOnlyKeys(value, ["name", "type", "keys", "optional", "reference", "range"]) &&
    typeof value.name === "string" &&
    (value.type === undefined || typeof value.type === "string") &&
    (value.keys === undefined ||
      (Array.isArray(value.keys) && value.keys.every((key) => ENTITY_KEY_VALUES[key as string] === true))) &&
    typeof value.optional === "boolean" &&
    (value.reference === undefined ||
      (isObjectRecord(value.reference) &&
        hasOnlyKeys(value.reference, ["entity", "attribute"]) &&
        typeof value.reference.entity === "string" &&
        typeof value.reference.attribute === "string")) &&
    isSourceRange(value.range)
  );
}

function isEntityRelationshipEnd(value: unknown): boolean {
  return (
    isObjectRecord(value) &&
    hasOnlyKeys(value, ["entity", "cardinality", "role", "range"]) &&
    typeof value.entity === "string" &&
    CARDINALITY_VALUES[value.cardinality as string] === true &&
    (value.role === undefined || typeof value.role === "string") &&
    isSourceRange(value.range)
  );
}

function isEntityBlock(value: Record<string, unknown>): boolean {
  return (
    isModelsHeader(value, "entity", [
      "kind",
      "range",
      "id",
      "number",
      "pluginVersion",
      "title",
      "description",
      "items",
    ]) &&
    Array.isArray(value.items) &&
    value.items.every((item) => {
      if (!isObjectRecord(item) || !isSourceRange(item.range)) return false;
      if (item.kind === "entity") {
        return (
          hasOnlyKeys(item, ["kind", "name", "label", "attributes", "range"]) &&
          typeof item.name === "string" &&
          (item.label === undefined || typeof item.label === "string") &&
          (item.attributes === undefined ||
            (Array.isArray(item.attributes) &&
              item.attributes.every((attribute) => isEntityAttribute(attribute))))
        );
      }
      if (item.kind !== "relationship") return false;
      return (
        hasOnlyKeys(item, ["kind", "label", "first", "second", "range"]) &&
        (item.label === undefined || typeof item.label === "string") &&
        isEntityRelationshipEnd(item.first) &&
        isEntityRelationshipEnd(item.second)
      );
    })
  );
}

function isClassClassifier(value: Record<string, unknown>): boolean {
  if (value.kind === "class") {
    return (
      hasOnlyKeys(value, ["kind", "name", "label", "abstract", "attributes", "operations", "range"]) &&
      typeof value.abstract === "boolean" &&
      Array.isArray(value.attributes)
    );
  }
  if (value.kind === "interface") {
    return (
      hasOnlyKeys(value, ["kind", "name", "label", "operations", "range"]) &&
      Array.isArray(value.operations)
    );
  }
  return false;
}

function isClassMember(value: unknown): boolean {
  return (
    isObjectRecord(value) &&
    hasOnlyKeys(value, ["name", "type", "visibility", "static", "range"]) &&
    typeof value.name === "string" &&
    (value.type === undefined || typeof value.type === "string") &&
    (value.visibility === undefined || CLASS_VISIBILITY_VALUES[value.visibility as string] === true) &&
    typeof value.static === "boolean" &&
    isSourceRange(value.range)
  );
}

function isClassOperation(value: unknown): boolean {
  return (
    isObjectRecord(value) &&
    hasOnlyKeys(value, ["name", "visibility", "static", "parameters", "returnType", "range"]) &&
    typeof value.name === "string" &&
    (value.visibility === undefined || CLASS_VISIBILITY_VALUES[value.visibility as string] === true) &&
    typeof value.static === "boolean" &&
    (value.parameters === undefined ||
      (Array.isArray(value.parameters) &&
        value.parameters.every(
          (parameter) =>
            isObjectRecord(parameter) &&
            hasOnlyKeys(parameter, ["name", "type", "range"]) &&
            typeof parameter.name === "string" &&
            (parameter.type === undefined || typeof parameter.type === "string") &&
            isSourceRange(parameter.range),
        ))) &&
    (value.returnType === undefined || typeof value.returnType === "string") &&
    isSourceRange(value.range)
  );
}

function isClassBlock(value: Record<string, unknown>): boolean {
  return (
    isModelsHeader(value, "class", [
      "kind",
      "range",
      "id",
      "number",
      "pluginVersion",
      "title",
      "description",
      "items",
    ]) &&
    Array.isArray(value.items) &&
    value.items.every((item) => {
      if (!isObjectRecord(item) || !isSourceRange(item.range)) return false;
      if (item.kind === "relationship") {
        return (
          hasOnlyKeys(item, [
            "kind",
            "form",
            "from",
            "to",
            "label",
            "fromMultiplicity",
            "toMultiplicity",
            "range",
          ]) &&
          CLASS_RELATIONSHIP_FORMS[item.form as string] === true &&
          typeof item.from === "string" &&
          typeof item.to === "string" &&
          (item.label === undefined || typeof item.label === "string") &&
          (item.fromMultiplicity === undefined || CARDINALITY_VALUES[item.fromMultiplicity as string] === true) &&
          (item.toMultiplicity === undefined || CARDINALITY_VALUES[item.toMultiplicity as string] === true)
        );
      }
      if (!isClassClassifier(item)) return false;
      const attributes = item.attributes;
      const operations = item.operations;
      return (
        typeof item.name === "string" &&
        (item.label === undefined || typeof item.label === "string") &&
        (attributes === undefined ||
          (Array.isArray(attributes) && attributes.every((member) => isClassMember(member)))) &&
        (operations === undefined ||
          (Array.isArray(operations) && operations.every((operation) => isClassOperation(operation))))
      );
    })
  );
}

function isParsedBlock(value: unknown): value is ParsedBlock {
  if (!isObjectRecord(value)) return false;
  if (value.kind === "circuit") {
    return (
      hasOnlyKeys(value, ["kind", "range", "id", "number", "pluginVersion", "title", "description", "flow", "symbolConvention", "nodes", "components", "relations", "annotations"]) &&
      isSourceRange(value.range) &&
      (value.id === undefined || typeof value.id === "string") &&
      (value.number === undefined || typeof value.number === "boolean") &&
      value.pluginVersion === "1.0.0" &&
      isCircuitText(value.title) &&
      (value.description === undefined || isCircuitText(value.description)) &&
      (value.flow === "left-to-right" || value.flow === "top-to-bottom") &&
      (value.symbolConvention === "iec" || value.symbolConvention === "ansi") &&
      Array.isArray(value.nodes) &&
      value.nodes.every(
        (node) =>
          isObjectRecord(node) &&
          hasOnlyKeys(node, ["ref", "role", "label", "range"]) &&
          typeof node.ref === "string" &&
          (node.role === "signal" || node.role === "reference") &&
          (node.label === undefined || isCircuitText(node.label)) &&
          isSourceRange(node.range),
      ) &&
      Array.isArray(value.components) &&
      value.components.every((component) => isCircuitComponent(component)) &&
      Array.isArray(value.relations) &&
      value.relations.every((relation) => isObjectRecord(relation) && hasOnlyKeys(relation, ["componentRef", "terminal", "nodeId", "range"]) && typeof relation.componentRef === "string" && typeof relation.terminal === "string" && typeof relation.nodeId === "string" && isSourceRange(relation.range)) &&
      Array.isArray(value.annotations) &&
      value.annotations.every((annotation) => isCircuitAnnotation(annotation))
    );
  }
  if (value.kind === "timing") {
    return isTimingBlock(value);
  }
  if (value.kind === "diagram") {
    return isDiagramBlock(value);
  }
  if (value.kind === "sequence") {
    return isSequenceBlock(value);
  }
  if (value.kind === "state") {
    return isStateBlock(value);
  }
  if (value.kind === "entity") {
    return isEntityBlock(value);
  }
  if (value.kind === "class") {
    return isClassBlock(value);
  }
  if (value.kind === "heading") {
    return (
      hasValidCommonBlockFields(value, ["kind", "level", "children", "range", "id"]) &&
      Number.isInteger(value.level) &&
      (value.level as number) >= 1 &&
      (value.level as number) <= 6 &&
      hasInlineChildren(value.children)
    );
  }
  if (value.kind === "paragraph") {
    return (
      hasValidCommonBlockFields(value, ["kind", "children", "range", "id"]) &&
      hasInlineChildren(value.children)
    );
  }
  if (value.kind === "thematicBreak") {
    return hasValidCommonBlockFields(value, ["kind", "range", "id"]);
  }
  if (value.kind === "blockquote") {
    return (
      hasValidCommonBlockFields(value, ["kind", "children", "range", "id"]) &&
      Array.isArray(value.children) &&
      (value.children as unknown[]).every((child) => isParsedBlock(child))
    );
  }
  if (value.kind === "list") {
    return (
      hasValidCommonBlockFields(value, ["kind", "ordered", "items", "range", "id", "start"]) &&
      typeof value.ordered === "boolean" &&
      Array.isArray(value.items) &&
      (value.items as unknown[]).every(
        (item) =>
          isObjectRecord(item) &&
          hasOnlyKeys(item, ["blocks", "range"]) &&
          Array.isArray(item.blocks) &&
          (item.blocks as unknown[]).every((child) => isParsedBlock(child)) &&
          isSourceRange(item.range),
      ) &&
      (value.start === undefined ||
        (Number.isInteger(value.start) && (value.start as number) >= 0))
    );
  }
  if (value.kind === "code") {
    return (
      hasValidCommonBlockFields(value, ["kind", "value", "range", "id", "language"]) &&
      typeof value.value === "string" &&
      (value.language === undefined || typeof value.language === "string")
    );
  }
  if (value.kind === "table") {
    if (value.pluginVersion === "2.0.0") {
      return (
        hasValidCommonBlockFields(value, ["kind", "data", "range", "id", "caption", "pluginVersion"]) &&
        isObjectRecord(value.data) &&
        hasOnlyKeys(value.data, ["columns", "groups", "rows"]) &&
        Array.isArray(value.data.columns) &&
        (value.data.columns as unknown[]).length > 0 &&
        (value.data.columns as unknown[]).every(
          (column) =>
            isObjectRecord(column) &&
            hasOnlyKeys(column, ["key", "name", "type", "unit"]) &&
            typeof column.key === "string" &&
            (column.name === undefined || typeof column.name === "string") &&
            (column.type === undefined ||
              typeof column.type === "string") &&
            (column.unit === undefined || typeof column.unit === "string"),
        ) &&
        Array.isArray(value.data.rows) &&
        (value.data.rows as unknown[]).every(
          (row) =>
            isObjectRecord(row) &&
            Object.values(row).every(
              (cell) =>
                cell === null ||
                typeof cell === "string" ||
                typeof cell === "number" ||
                typeof cell === "boolean" ||
                (Array.isArray(cell) && (cell as unknown[]).every((node) => isInlineNode(node))),
            ),
        ) &&
        (value.data.groups === undefined ||
          (Array.isArray(value.data.groups) &&
            (value.data.groups as unknown[]).every(
              (group) =>
                isObjectRecord(group) &&
                hasOnlyKeys(group, ["name", "columns"]) &&
                typeof group.name === "string" &&
                Array.isArray(group.columns) &&
                (group.columns as unknown[]).every((key) => typeof key === "string"),
            ))) &&
        (value.caption === undefined ||
          (Array.isArray(value.caption) &&
            (value.caption as unknown[]).every((node) => isInlineNode(node))))
      );
    }
    return (
      hasValidCommonBlockFields(value, ["kind", "data", "range", "id", "caption", "pluginVersion"]) &&
      isObjectRecord(value.data) &&
      hasOnlyKeys(value.data, ["align", "header", "rows"]) &&
      Array.isArray(value.data.align) &&
      (value.data.align as unknown[]).every(
        (entry) =>
          entry === null || entry === "left" || entry === "center" || entry === "right",
      ) &&
      Array.isArray(value.data.header) &&
      (value.data.header as unknown[]).every(
        (cell) => Array.isArray(cell) && (cell as unknown[]).every((node) => isInlineNode(node)),
      ) &&
      Array.isArray(value.data.rows) &&
      (value.data.rows as unknown[]).every(
        (row) =>
          Array.isArray(row) &&
          (row as unknown[]).every(
            (cell) => Array.isArray(cell) && (cell as unknown[]).every((node) => isInlineNode(node)),
          ),
      ) &&
      (value.data.header as unknown[]).length === (value.data.align as unknown[]).length &&
      (value.caption === undefined ||
        (Array.isArray(value.caption) &&
          (value.caption as unknown[]).every((node) => isInlineNode(node)))) &&
      (value.pluginVersion === undefined || value.pluginVersion === "1.0.0")
    );
  }
  if (value.kind === "callout") {
    return (
      hasValidCommonBlockFields(value, ["kind", "variant", "children", "range", "id", "title", "pluginVersion"]) &&
      typeof value.variant === "string" &&
      (value.variant as string).length > 0 &&
      Array.isArray(value.children) &&
      (value.children as unknown[]).every((child) => isParsedBlock(child)) &&
      (value.title === undefined ||
        (Array.isArray(value.title) &&
          (value.title as unknown[]).every((node) => isInlineNode(node)))) &&
      value.pluginVersion === "1.0.0"
    );
  }
  if (value.kind === "equation") {
    return (
      hasOnlyKeys(value, [
        "kind",
        "range",
        "id",
        "pluginVersion",
        "notation",
        "tree",
        "spelling",
        "tex",
        "number",
        "align",
      ]) &&
      isSourceRange(value.range) &&
      (value.id === undefined || typeof value.id === "string") &&
      value.pluginVersion === "2.0.0" &&
      (value.notation === "native" || value.notation === "latex") &&
      (value.notation === "latex"
        ? typeof value.tex === "string" && value.tex.length > 0
        : isObjectRecord(value.tree) &&
          typeof value.spelling === "string" &&
          value.spelling.length > 0) &&
      (value.number === undefined || typeof value.number === "boolean") &&
      (value.align === undefined ||
        value.align === "left" ||
        value.align === "center" ||
        value.align === "right")
    );
  }
  if (value.kind === "mermaid") {
    return (
      hasOnlyKeys(value, [
        "kind",
        "range",
        "id",
        "pluginVersion",
        "diagramType",
        "source",
        "title",
        "description",
      ]) &&
      isSourceRange(value.range) &&
      (value.id === undefined || typeof value.id === "string") &&
      value.pluginVersion === "1.0.0" &&
      typeof value.diagramType === "string" &&
      value.diagramType.length > 0 &&
      typeof value.source === "string" &&
      value.source.length > 0 &&
      (value.title === undefined || typeof value.title === "string") &&
      (value.description === undefined || typeof value.description === "string")
    );
  }
  if (value.kind === "derivation") {
    return (
      hasOnlyKeys(value, [
        "kind",
        "range",
        "id",
        "pluginVersion",
        "steps",
        "number",
        "align",
      ]) &&
      isSourceRange(value.range) &&
      (value.id === undefined || typeof value.id === "string") &&
      value.pluginVersion === "1.0.0" &&
      Array.isArray(value.steps) &&
      value.steps.length > 0 &&
      value.steps.every((step) =>
        isObjectRecord(step) &&
        hasOnlyKeys(step, ["expression", "tree", "annotation"]) &&
        typeof step.expression === "string" &&
        isObjectRecord(step.tree) &&
        (step.annotation === undefined ||
          (Array.isArray(step.annotation) &&
            (step.annotation as unknown[]).every((node) => isInlineNode(node)))),
      ) &&
      (value.number === undefined || typeof value.number === "boolean") &&
      (value.align === undefined ||
        value.align === "left" ||
        value.align === "center" ||
        value.align === "right")
    );
  }
  if (value.kind === "plot") {
    return (
      hasOnlyKeys(value, [
        "kind",
        "range",
        "id",
        "pluginVersion",
        "number",
        "width",
        "height",
        "legend",
        "grid",
        "parameters",
        "xAxis",
        "yAxis",
        "series",
      ]) &&
      isSourceRange(value.range) &&
      (value.id === undefined || typeof value.id === "string") &&
      value.pluginVersion === "1.0.0" &&
      typeof value.width === "number" &&
      typeof value.height === "number" &&
      typeof value.legend === "boolean" &&
      typeof value.grid === "boolean" &&
      isObjectRecord(value.parameters) &&
      isObjectRecord(value.xAxis) &&
      isObjectRecord(value.yAxis) &&
      Array.isArray(value.series) &&
      value.series.length > 0 &&
      (value.number === undefined || typeof value.number === "boolean")
    );
  }
  if (value.kind === "chart") {
    return (
      hasOnlyKeys(value, [
        "kind",
        "range",
        "id",
        "pluginVersion",
        "chartType",
        "number",
        "width",
        "height",
        "legend",
        "grid",
        "xLabel",
        "yLabel",
        "yMin",
        "yMax",
        "series",
      ]) &&
      isSourceRange(value.range) &&
      (value.id === undefined || typeof value.id === "string") &&
      value.pluginVersion === "1.0.0" &&
      typeof value.chartType === "string" &&
      typeof value.width === "number" &&
      typeof value.height === "number" &&
      typeof value.legend === "boolean" &&
      typeof value.grid === "boolean" &&
      Array.isArray(value.series) &&
      value.series.length > 0 &&
      (value.number === undefined || typeof value.number === "boolean")
    );
  }
  if (value.kind === "geometry") {
    return (
      hasOnlyKeys(value, [
        "kind",
        "range",
        "id",
        "pluginVersion",
        "number",
        "width",
        "height",
        "bounds",
        "declarations",
      ]) &&
      isSourceRange(value.range) &&
      (value.id === undefined || typeof value.id === "string") &&
      value.pluginVersion === "1.0.0" &&
      typeof value.width === "number" &&
      typeof value.height === "number" &&
      (value.bounds === undefined || isObjectRecord(value.bounds)) &&
      Array.isArray(value.declarations) &&
      value.declarations.length > 0 &&
      (value.number === undefined || typeof value.number === "boolean")
    );
  }
  if (value.kind === "formula") {
    return (
      hasOnlyKeys(value, [
        "kind",
        "range",
        "id",
        "pluginVersion",
        "number",
        "expression",
        "units",
        "charge",
        "chargeSpecified",
        "electron",
      ]) &&
      isSourceRange(value.range) &&
      (value.id === undefined || typeof value.id === "string") &&
      value.pluginVersion === "1.0.0" &&
      typeof value.expression === "string" &&
      Array.isArray(value.units) &&
      typeof value.charge === "number" &&
      typeof value.chargeSpecified === "boolean" &&
      typeof value.electron === "boolean" &&
      (value.number === undefined || typeof value.number === "boolean")
    );
  }
  if (value.kind === "reaction") {
    return (
      hasOnlyKeys(value, [
        "kind",
        "range",
        "id",
        "pluginVersion",
        "number",
        "above",
        "below",
        "balance",
        "arrow",
        "reactants",
        "products",
      ]) &&
      isSourceRange(value.range) &&
      (value.id === undefined || typeof value.id === "string") &&
      value.pluginVersion === "1.0.0" &&
      (value.above === undefined || typeof value.above === "string") &&
      (value.below === undefined || typeof value.below === "string") &&
      (value.balance === "none" || value.balance === "check") &&
      (value.arrow === "->" || value.arrow === "<-" || value.arrow === "<->") &&
      Array.isArray(value.reactants) &&
      Array.isArray(value.products) &&
      (value.number === undefined || typeof value.number === "boolean")
    );
  }
  if (value.kind === "structure") {
    return (
      hasOnlyKeys(value, [
        "kind",
        "range",
        "id",
        "pluginVersion",
        "number",
        "width",
        "height",
        "atoms",
        "bonds",
        "labels",
      ]) &&
      isSourceRange(value.range) &&
      (value.id === undefined || typeof value.id === "string") &&
      value.pluginVersion === "1.0.0" &&
      typeof value.width === "number" &&
      typeof value.height === "number" &&
      Array.isArray(value.atoms) &&
      Array.isArray(value.bonds) &&
      (value.labels === undefined || Array.isArray(value.labels)) &&
      (value.number === undefined || typeof value.number === "boolean")
    );
  }
  if (value.kind === "invalid") {
    return (
      hasOnlyKeys(value, [
        "kind",
        "raw",
        "range",
        "diagnosticIndexes",
        "originalType",
      ]) &&
      typeof value.raw === "string" &&
      isSourceRange(value.range) &&
      Array.isArray(value.diagnosticIndexes) &&
      value.diagnosticIndexes.every(
        (index) => Number.isInteger(index) && index >= 0,
      ) &&
      (value.originalType === undefined || typeof value.originalType === "string")
    );
  }
  return false;
}

function isMetadata(value: unknown): boolean {
  if (
    !isObjectRecord(value) ||
    !hasOnlyKeys(value, ["authors", "extensions", "title", "theme", "outputs"]) ||
    !Array.isArray(value.authors) ||
    !value.authors.every((author) => typeof author === "string") ||
    !isObjectRecord(value.extensions) ||
    !Object.entries(value.extensions).every(
      ([key, extension]) =>
        /^x-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key) && isJsonValue(extension),
    ) ||
    (value.title !== undefined && typeof value.title !== "string") ||
    (value.theme !== undefined && typeof value.theme !== "string")
  ) {
    return false;
  }
  if (value.outputs === undefined) return true;
  return (
    Array.isArray(value.outputs) &&
    value.outputs.every(
      (output) => typeof output === "string" && OUTPUT_FORMATS[output] === true,
    ) &&
    new Set(value.outputs).size === value.outputs.length
  );
}

export function validateDocumentSchema(document: unknown): readonly Diagnostic[] {
  const valid =
    isObjectRecord(document) &&
    hasOnlyKeys(document, ["azemarkVersion", "schemaVersion", "metadata", "blocks"]) &&
    document.azemarkVersion === 2 &&
    document.schemaVersion === 2 &&
    isMetadata(document.metadata) &&
    Array.isArray(document.blocks) &&
    document.blocks.every((block) => isParsedBlock(block));
  if (valid) return [];
  return [
    createDiagnostic(
      "azeforge.document#schema-invalid",
      "error",
      "ParsedDocument does not conform to AzeMark Document schema v2.",
    ),
  ];
}

