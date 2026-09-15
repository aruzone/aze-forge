import { createHash } from "node:crypto";

import { addExactDecimals } from "./quantity.js";
import type {
  AlgorithmStatement,
  ArtifactHash,
  AzeBlock,
  AzeDocument,
  CircuitText,
  ContentHash,
  DiagramEndpoint,
  DiagramLabel,
  FreeBodyAttachment,
  FreeBodyDirection,
  Inline,
  JsonValue,
  ParsedBlock,
  SequenceMessage,
  SequenceTimelineItem,
  Sha256Hash,
  StateScopedItem,
  StateTransition,
  TimingInterval,
  TypedTableCell,
  TypedTableData,
} from "./model.js";

export function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Canonical JSON cannot encode a non-finite number.");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const object = value as { readonly [key: string]: JsonValue };
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key] ?? null)}`)
    .join(",")}}`;
}

export function sha256(bytes: string | Uint8Array): Sha256Hash {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export function artifactBytesHash(bytes: Uint8Array): ArtifactHash {
  return sha256(bytes) as ArtifactHash;
}

function projectInlineNode(node: Inline): JsonValue {
  switch (node.kind) {
    case "text":
    case "code":
      return { kind: node.kind, value: node.value };
    case "emphasis":
    case "strong":
      return { kind: node.kind, children: node.children.map(projectInlineNode) };
    case "break":
      return { kind: node.kind };
    case "link": {
      const projected: Record<string, JsonValue> = {
        kind: node.kind,
        href: node.href,
        children: node.children.map(projectInlineNode),
      };
      if (node.title !== undefined) projected.title = node.title;
      return projected;
    }
    case "image": {
      const projected: Record<string, JsonValue> = {
        kind: node.kind,
        src: node.src,
        alt: node.alt,
      };
      if (node.title !== undefined) projected.title = node.title;
      return projected;
    }
    // Authored spans only: the resolved auto label and anchor are derived and
    // never reach identity (ADR 0007).
    case "reference": {
      const projected: Record<string, JsonValue> = {
        kind: node.kind,
        target: node.target,
        form: node.form,
      };
      if (node.locator !== undefined) {
        projected.locator = { word: node.locator.word, value: node.locator.value };
      }
      return projected;
    }
    case "referenceGroup":
      return {
        kind: node.kind,
        targets: node.targets.map(projectInlineNode),
      };
    case "footnote":
      return { kind: node.kind, label: node.label };
  }
}

/** One typed cell in authored column order; the column type is the claim. */
function projectCellValue(cell: TypedTableCell): JsonValue {
  switch (cell.kind) {
    case "prose":
      return { kind: "prose", value: cell.value.map(projectInlineNode) };
    case "text":
    case "integer":
    case "decimal":
      return { kind: cell.kind, value: cell.value };
    case "quantity":
      return {
        kind: "quantity",
        coefficient: cell.coefficient,
        ...(cell.unit === undefined ? {} : { unit: cell.unit }),
      };
    case "boolean":
      return { kind: "boolean", value: cell.value };
    case "math":
      return { kind: "math", tree: cell.tree };
  }
}

function projectTableData(data: TypedTableData): JsonValue {
  return {
    kind: "typed",
      columns: data.columns.map((column) => ({
        key: column.key,
        ...(column.name === undefined ? {} : { name: column.name }),
        ...(column.type === undefined ? {} : { type: column.type }),
        ...(column.unit === undefined ? {} : { unit: column.unit }),
        ...(column.align === undefined ? {} : { align: column.align }),
      })),
      ...(data.groups === undefined || data.groups.length === 0
        ? {}
        : {
            groups: data.groups.map((group) => ({
              name: group.name,
              columns: [...group.columns],
            })),
          }),
      rows: data.rows.map((row) =>
        Object.fromEntries(
          data.columns.map((column) => [
            column.key,
            row[column.key] === undefined
              ? null
              : projectCellValue(row[column.key] as TypedTableCell),
          ]),
        ),
      ),
  };
}

/** Pseudocode statements keep authored order and branch attachment. */
function projectAlgorithmStatement(statement: AlgorithmStatement): JsonValue {
  switch (statement.kind) {
    case "assign":
      return {
        kind: "assign",
        target: statement.target,
        ...(statement.index === undefined ? {} : { index: statement.index }),
        expression: statement.expression,
      };
    case "if":
      return {
        kind: "if",
        condition: statement.condition,
        then: statement.then.map(projectAlgorithmStatement),
        "else-if": statement.elseIf.map((branch) => ({
          condition: branch.condition,
          then: branch.statements.map(projectAlgorithmStatement),
        })),
        ...(statement.else === undefined
          ? {}
          : { else: statement.else.map(projectAlgorithmStatement) }),
      };
    case "for":
      return {
        kind: "for",
        variable: statement.variable,
        from: statement.from,
        direction: statement.direction,
        to: statement.to,
        ...(statement.by === undefined ? {} : { by: statement.by }),
        statements: statement.statements.map(projectAlgorithmStatement),
      };
    case "while":
      return {
        kind: "while",
        condition: statement.condition,
        statements: statement.statements.map(projectAlgorithmStatement),
      };
    case "return":
      return {
        kind: "return",
        ...(statement.expression === undefined
          ? {}
          : { expression: statement.expression }),
      };
    case "text":
      return { kind: "text", text: statement.text.map(projectInlineNode) };
  }
}

/**
 * Fold adjacent intervals that share a state and value into one. The two
 * authoring surfaces meet here: `4.` and `....` are the same content, while
 * a different parse stays different content.
 */
function timingIntervals(intervals: readonly TimingInterval[]): readonly TimingInterval[] {
  const merged: TimingInterval[] = [];
  for (const interval of intervals) {
    const previous = merged[merged.length - 1];
    const sameText =
      previous !== undefined &&
      (previous.value === undefined || interval.value === undefined
        ? previous.value === interval.value
        : canonicalJson(previous.value as unknown as JsonValue) ===
          canonicalJson(interval.value as unknown as JsonValue));
    if (previous === undefined || previous.state !== interval.state || !sameText) {
      merged.push(interval);
      continue;
    }
    merged[merged.length - 1] = {
      state: previous.state,
      ...(previous.count === undefined
        ? {}
        : { count: addExactDecimals(previous.count, interval.count ?? "0") }),
      ...(previous.duration === undefined
        ? {}
        : { duration: addExactDecimals(previous.duration, interval.duration ?? "0") }),
      ...(previous.value === undefined ? {} : { value: previous.value }),
    };
  }
  return merged;
}

export function documentContentHash(document: AzeDocument): ContentHash {
  const metadata: Record<string, JsonValue> = {
    authors: document.metadata.authors,
    extensions: document.metadata.extensions,
  };
  if (document.metadata.title !== undefined) metadata.title = document.metadata.title;
  if (document.metadata.theme !== undefined) metadata.theme = document.metadata.theme;
  if (document.metadata.outputs !== undefined) metadata.outputs = document.metadata.outputs;
  if (document.metadata.citationStyle !== undefined) {
    metadata["citation-style"] = document.metadata.citationStyle;
  }

  function projectBlock(block: ParsedBlock | AzeBlock): JsonValue {
    /** The shared header fields every numberable Block contributes to identity. */
    const commonProjection = (value: {
      readonly id?: string;
      readonly number?: boolean;
      readonly title?: string;
      readonly description?: string;
    }): Record<string, JsonValue> => ({
      ...(value.id === undefined ? {} : { id: value.id }),
      ...(value.number === undefined ? {} : { number: value.number }),
      ...(value.title === undefined ? {} : { title: value.title }),
      ...(value.description === undefined ? {} : { description: value.description }),
    });
    if (block.kind === "timing") {
      // Parsed semantics only: states, lengths, text, widths, scale/unit/phase,
      // authored order. Anchors contribute their resolved signal and boundary;
      // source ranges and renderer geometry stay out of identity.
      const projected: Record<string, JsonValue> = {
        kind: block.kind,
        pluginVersion: block.pluginVersion,
        title: block.title as unknown as JsonValue,
        scale: block.scale,
        signals: block.signals.map((signal) => ({
          ref: signal.ref,
          clock: signal.clock,
          phase: signal.phase,
          ...(signal.width === undefined ? {} : { width: signal.width }),
          intervals: timingIntervals(signal.intervals).map((interval) => ({
            state: interval.state,
            ...(interval.count === undefined ? {} : { count: interval.count }),
            ...(interval.duration === undefined ? {} : { duration: interval.duration }),
            ...(interval.value === undefined
              ? {}
              : { value: interval.value as unknown as JsonValue }),
          })),
        })),
        groups: block.groups.map((group) => ({
          label: group.label as unknown as JsonValue,
          signals: [...group.signals],
        })),
        markers: block.markers.map((marker) => ({
          at: marker.at,
          ...(marker.label === undefined
            ? {}
            : { label: marker.label as unknown as JsonValue }),
        })),
        arrows: block.arrows.map((arrow) => ({
          from: { signal: arrow.from.signal, boundary: arrow.from.boundary },
          to: { signal: arrow.to.signal, boundary: arrow.to.boundary },
          ...(arrow.label === undefined
            ? {}
            : { label: arrow.label as unknown as JsonValue }),
        })),
      };
      if (block.id !== undefined) projected.id = block.id;
      if (block.number !== undefined) projected.number = block.number;
      if (block.description !== undefined) {
        projected.description = block.description as unknown as JsonValue;
      }
      if (block.unit !== undefined) projected.unit = block.unit;
      return projected;
    }
    if (block.kind === "diagram") {
      // Parsed semantics only: the mode, the flow, the declaration list in
      // authored order, and every name, reference, shape, label, port and
      // direction. Renderer-derived layout never reaches identity.
      const label = (value: DiagramLabel | undefined): JsonValue | undefined =>
        value === undefined ? undefined : (value as unknown as JsonValue);
      const endpoint = (value: DiagramEndpoint): JsonValue => ({
        name: value.name,
        ...(value.port === undefined ? {} : { port: value.port }),
      });
      const projected: Record<string, JsonValue> = {
        kind: block.kind,
        pluginVersion: block.pluginVersion,
        mode: block.mode,
        flow: block.flow,
        declarations: block.declarations.map((declaration) => {
          if (declaration.kind === "node") {
            const nodeLabel = label(declaration.label);
            return {
              kind: declaration.kind,
              name: declaration.name,
              shape: declaration.shape,
              ...(declaration.parent === undefined ? {} : { parent: declaration.parent }),
              ...(nodeLabel === undefined ? {} : { label: nodeLabel }),
              ports: declaration.ports.map((port) => ({
                name: port.name,
                ...(port.side === undefined ? {} : { side: port.side }),
              })),
            };
          }
          if (declaration.kind === "group") {
            const groupLabel = label(declaration.label);
            return {
              kind: declaration.kind,
              name: declaration.name,
              ...(declaration.parent === undefined ? {} : { parent: declaration.parent }),
              ...(groupLabel === undefined ? {} : { label: groupLabel }),
            };
          }
          const edgeLabel = label(declaration.label);
          return {
            kind: declaration.kind,
            from: endpoint(declaration.from),
            to: endpoint(declaration.to),
            direction: declaration.direction,
            ...(edgeLabel === undefined ? {} : { label: edgeLabel }),
          };
        }),
      };
      if (block.id !== undefined) projected.id = block.id;
      if (block.number !== undefined) projected.number = block.number;
      if (block.title !== undefined) projected.title = block.title as unknown as JsonValue;
      if (block.description !== undefined) {
        projected.description = block.description as unknown as JsonValue;
      }
      return projected;
    }
    if (block.kind === "sequence") {
      // Parsed semantics only: participant order and kinds, the timeline in
      // authored order at every nesting depth, every authored text field,
      // fragment structure and division order, and the resolved defaults.
      const message = (item: SequenceMessage): JsonValue => ({
        kind: item.kind,
        form: item.form,
        from: item.from,
        to: item.to,
        activate: item.activate,
        deactivate: item.deactivate,
        ...(item.text === undefined ? {} : { text: item.text }),
      });
      const timeline = (items: readonly SequenceTimelineItem[]): JsonValue =>
        items.map((item): JsonValue => {
          if (item.kind === "message") return message(item);
          if (item.kind === "note") return { kind: item.kind, over: [...item.over], text: item.text };
          if (item.kind === "loop") {
            return {
              kind: item.kind,
              ...(item.condition === undefined ? {} : { condition: item.condition }),
              body: timeline(item.body),
            };
          }
          return {
            kind: item.kind,
            divisions: item.divisions.map((division) => ({
              ...(division.condition === undefined ? {} : { condition: division.condition }),
              body: timeline(division.body),
            })),
          };
        });
      return {
        kind: block.kind,
        pluginVersion: block.pluginVersion,
        participants: block.participants.map((participant) => ({
          name: participant.name,
          kind: participant.kind,
          ...(participant.label === undefined ? {} : { label: participant.label }),
        })),
        timeline: timeline(block.timeline),
        ...commonProjection(block),
      };
    }
    if (block.kind === "state") {
      const items = (entries: readonly (StateScopedItem | StateTransition)[]): JsonValue =>
        entries.map((item): JsonValue => {
          if (item.kind === "transition") {
            return {
              kind: item.kind,
              from: item.from,
              to: item.to,
              ...(item.trigger === undefined ? {} : { trigger: item.trigger }),
              ...(item.guard === undefined ? {} : { guard: item.guard }),
              ...(item.action === undefined ? {} : { action: item.action }),
            };
          }
          if (item.kind === "state") {
            return {
              kind: item.kind,
              name: item.name,
              ...(item.label === undefined ? {} : { label: item.label }),
              states: items(item.states),
            };
          }
          return { kind: item.kind, name: item.name };
        });
      return { kind: block.kind, pluginVersion: block.pluginVersion, items: items(block.items), ...commonProjection(block) };
    }
    if (block.kind === "entity") {
      const items = block.items.map((item): JsonValue => {
        if (item.kind === "relationship") {
          return {
            kind: item.kind,
            ...(item.label === undefined ? {} : { label: item.label }),
            first: {
              entity: item.first.entity,
              cardinality: item.first.cardinality,
              ...(item.first.role === undefined ? {} : { role: item.first.role }),
            },
            second: {
              entity: item.second.entity,
              cardinality: item.second.cardinality,
              ...(item.second.role === undefined ? {} : { role: item.second.role }),
            },
          };
        }
        return {
          kind: item.kind,
          name: item.name,
          ...(item.label === undefined ? {} : { label: item.label }),
          ...(item.attributes === undefined
            ? {}
            : {
                attributes: item.attributes.map((attribute) => ({
                  name: attribute.name,
                  ...(attribute.type === undefined ? {} : { type: attribute.type }),
                  ...(attribute.keys === undefined ? {} : { keys: [...attribute.keys] }),
                  optional: attribute.optional,
                  ...(attribute.reference === undefined
                    ? {}
                    : {
                        reference: {
                          entity: attribute.reference.entity,
                          attribute: attribute.reference.attribute,
                        },
                      }),
                })),
              }),
        };
      });
      return { kind: block.kind, pluginVersion: block.pluginVersion, items, ...commonProjection(block) };
    }
    if (block.kind === "class") {
      const items = block.items.map((item): JsonValue => {
        if (item.kind === "relationship") {
          return {
            kind: item.kind,
            form: item.form,
            from: item.from,
            to: item.to,
            ...(item.label === undefined ? {} : { label: item.label }),
            ...(item.fromMultiplicity === undefined ? {} : { fromMultiplicity: item.fromMultiplicity }),
            ...(item.toMultiplicity === undefined ? {} : { toMultiplicity: item.toMultiplicity }),
          };
        }
        return {
          kind: item.kind,
          name: item.name,
          ...(item.label === undefined ? {} : { label: item.label }),
          ...(item.abstract === undefined ? {} : { abstract: item.abstract }),
          attributes: (item.attributes ?? []).map((attribute) => ({
            name: attribute.name,
            ...(attribute.type === undefined ? {} : { type: attribute.type }),
            ...(attribute.visibility === undefined ? {} : { visibility: attribute.visibility }),
            static: attribute.static,
          })),
          operations: item.operations.map((operation) => ({
            name: operation.name,
            ...(operation.visibility === undefined ? {} : { visibility: operation.visibility }),
            static: operation.static,
            ...(operation.parameters === undefined
              ? {}
              : {
                  parameters: operation.parameters.map((parameter) => ({
                    name: parameter.name,
                    ...(parameter.type === undefined ? {} : { type: parameter.type }),
                  })),
                }),
            ...(operation.returnType === undefined ? {} : { returnType: operation.returnType }),
          })),
        };
      });
      return { kind: block.kind, pluginVersion: block.pluginVersion, items, ...commonProjection(block) };
    }
    if (block.kind === "circuit") {
      const projected: Record<string, JsonValue> = {
        kind: block.kind,
        pluginVersion: block.pluginVersion,
        title: block.title as unknown as JsonValue,
        flow: block.flow,
        symbolConvention: block.symbolConvention,
        nodes: block.nodes.map(({ range: _range, ...node }) => node as unknown as JsonValue),
        components: block.components.map(({ range: _range, ...component }) => component as unknown as JsonValue),
        relations: block.relations.map(({ range: _range, ...relation }) => relation as unknown as JsonValue),
        annotations: block.annotations.map(({ range: _range, ...annotation }) => annotation as unknown as JsonValue),
      };
      if (block.id !== undefined) projected.id = block.id;
      if (block.number !== undefined) projected.number = block.number;
      if (block.description !== undefined) projected.description = block.description as unknown as JsonValue;
      return projected;
    }
    if (block.kind === "equation") {
      const projected: Record<string, JsonValue> = {
        kind: block.kind,
        pluginVersion: block.pluginVersion,
        notation: block.notation,
      };
      // Native identity is the semantic tree (spelling-normalized,
      // presentation-preserving); latex keeps its raw string hashed.
      if (block.notation === "latex") {
        if (block.tex !== undefined) projected.tex = block.tex;
      } else {
        if (block.tree !== undefined) projected.tree = block.tree;
      }
      if (block.id !== undefined) projected.id = block.id;
      if (block.number !== undefined) projected.number = block.number;
      if (block.align !== undefined) projected.align = block.align;
      return projected;
    }
    if (block.kind === "mermaid") {
      const projected: Record<string, JsonValue> = {
        kind: block.kind,
        pluginVersion: block.pluginVersion,
        diagramType: block.diagramType,
        source: block.source,
      };
      if (block.id !== undefined) projected.id = block.id;
      if (block.title !== undefined) projected.title = block.title;
      if (block.description !== undefined) projected.description = block.description;
      return projected;
    }
    if (block.kind === "derivation") {
      const projected: Record<string, JsonValue> = {
        kind: block.kind,
        pluginVersion: block.pluginVersion,
        steps: block.steps.map((step) => ({
          tree: step.tree,
          ...(step.annotation === undefined
            ? {}
            : { annotation: step.annotation.map(projectInlineNode) }),
        })),
      };
      if (block.id !== undefined) projected.id = block.id;
      if (block.number !== undefined) projected.number = block.number;
      if (block.align !== undefined) projected.align = block.align;
      return projected;
    }
    if (block.kind === "plot") {
      const projected: Record<string, JsonValue> = {
        kind: block.kind,
        pluginVersion: block.pluginVersion,
        width: block.width,
        height: block.height,
        legend: block.legend,
        grid: block.grid,
        parameters: block.parameters as unknown as JsonValue,
        xAxis: block.xAxis as unknown as JsonValue,
        yAxis: block.yAxis as unknown as JsonValue,
        series: block.series.map((entry) =>
          entry.kind === "function"
            ? {
                kind: entry.kind,
                ...(entry.label === undefined ? {} : { label: entry.label }),
                variable: entry.variable,
                tree: entry.tree,
                domainMin: entry.domainMin,
                domainMax: entry.domainMax,
                samples: entry.samples,
              }
            : {
                kind: entry.kind,
                ...(entry.label === undefined ? {} : { label: entry.label }),
                points: entry.points.map((point) => ({ ...point }) as unknown as JsonValue),
              },
        ),
      };
      if (block.id !== undefined) projected.id = block.id;
      if (block.number !== undefined) projected.number = block.number;
      return projected;
    }
    if (block.kind === "chart") {
      const projected: Record<string, JsonValue> = {
        kind: block.kind,
        pluginVersion: block.pluginVersion,
        chartType: block.chartType,
        width: block.width,
        height: block.height,
        legend: block.legend,
        grid: block.grid,
        series: block.series.map((entry) =>
          entry.kind === "bars"
            ? {
                kind: entry.kind,
                ...(entry.label === undefined ? {} : { label: entry.label }),
                bars: entry.bars.map((bar) => ({ ...bar }) as unknown as JsonValue),
              }
            : {
                kind: entry.kind,
                ...(entry.label === undefined ? {} : { label: entry.label }),
                values: [...entry.values] as unknown as JsonValue,
                edges: [...entry.edges] as unknown as JsonValue,
              },
        ),
      };
      if (block.id !== undefined) projected.id = block.id;
      if (block.number !== undefined) projected.number = block.number;
      if (block.xLabel !== undefined) projected.xLabel = block.xLabel;
      if (block.yLabel !== undefined) projected.yLabel = block.yLabel;
      if (block.yMin !== undefined) projected.yMin = block.yMin;
      if (block.yMax !== undefined) projected.yMax = block.yMax;
      return projected;
    }
    if (block.kind === "thematicBreak") {
      const projected: Record<string, JsonValue> = { kind: block.kind };
      if (block.id !== undefined) projected.id = block.id;
      return projected;
    }
    if (block.kind === "blockquote") {
      const projected: Record<string, JsonValue> = {
        kind: block.kind,
        children: block.children.map(projectBlock),
      };
      if (block.id !== undefined) projected.id = block.id;
      return projected;
    }
    if (block.kind === "list") {
      const projected: Record<string, JsonValue> = {
        kind: block.kind,
        ordered: block.ordered,
        items: block.items.map((item) => ({ blocks: item.blocks.map(projectBlock) })),
      };
      if (block.id !== undefined) projected.id = block.id;
      if (block.start !== undefined) projected.start = block.start;
      return projected;
    }
    if (block.kind === "code") {
      const projected: Record<string, JsonValue> = {
        kind: block.kind,
        value: block.value,
      };
      if (block.id !== undefined) projected.id = block.id;
      if (block.language !== undefined) projected.language = block.language;
      return projected;
    }
    if (block.kind === "table") {
      const projected: Record<string, JsonValue> = {
        kind: block.kind,
        data: projectTableData(block.data),
      };
      if (block.id !== undefined) projected.id = block.id;
      if (block.number !== undefined) projected.number = block.number;
      if (block.caption !== undefined) projected.caption = block.caption.map(projectInlineNode);
      if (block.pluginVersion !== undefined) projected.pluginVersion = block.pluginVersion;
      return projected;
    }
    if (block.kind === "callout") {
      const projected: Record<string, JsonValue> = {
        kind: block.kind,
        variant: block.variant,
        children: block.children.map(projectBlock),
        pluginVersion: block.pluginVersion,
      };
      if (block.id !== undefined) projected.id = block.id;
      if (block.title !== undefined) projected.title = block.title.map(projectInlineNode);
      return projected;
    }
    if (block.kind === "geometry") {
      const projected: Record<string, JsonValue> = {
        kind: block.kind,
        pluginVersion: block.pluginVersion,
        width: block.width,
        height: block.height,
        declarations: block.declarations.map((entry) => ({ ...entry }) as unknown as JsonValue),
      };
      if (block.id !== undefined) projected.id = block.id;
      if (block.number !== undefined) projected.number = block.number;
      if (block.bounds !== undefined) projected.bounds = { ...block.bounds } as unknown as JsonValue;
      return projected;
    }
    if (block.kind === "formula") {
      const projected: Record<string, JsonValue> = {
        kind: block.kind,
        pluginVersion: block.pluginVersion,
        expression: block.expression,
        units: block.units as unknown as JsonValue,
        charge: block.charge,
        chargeSpecified: block.chargeSpecified,
        electron: block.electron,
      };
      if (block.id !== undefined) projected.id = block.id;
      if (block.number !== undefined) projected.number = block.number;
      return projected;
    }
    if (block.kind === "reaction") {
      const projected: Record<string, JsonValue> = {
        kind: block.kind,
        pluginVersion: block.pluginVersion,
        arrow: block.arrow,
        balance: block.balance,
        reactants: block.reactants as unknown as JsonValue,
        products: block.products as unknown as JsonValue,
      };
      if (block.id !== undefined) projected.id = block.id;
      if (block.number !== undefined) projected.number = block.number;
      if (block.above !== undefined) projected.above = block.above;
      if (block.below !== undefined) projected.below = block.below;
      return projected;
    }
    if (block.kind === "structure") {
      const projected: Record<string, JsonValue> = {
        kind: block.kind,
        pluginVersion: block.pluginVersion,
        width: block.width,
        height: block.height,
        atoms: block.atoms as unknown as JsonValue,
        bonds: block.bonds as unknown as JsonValue,
      };
      if (block.id !== undefined) projected.id = block.id;
      if (block.number !== undefined) projected.number = block.number;
      if (block.labels !== undefined) projected.labels = block.labels as unknown as JsonValue;
      return projected;
    }
    if (block.kind === "control") {
      // Parsed semantics only: the flow, the declaration list in authored
      // order, every name and reference, the decoded `tf:`/label run lists, the
      // `signs:` list order and length, and edge authored order. No coordinate,
      // rank, bend point or positional id ever reaches identity.
      const runs = (text: CircuitText): JsonValue => text as unknown as JsonValue;
      const projected: Record<string, JsonValue> = {
        kind: block.kind,
        pluginVersion: block.pluginVersion,
        flow: block.flow,
        declarations: block.declarations.map((declaration): JsonValue => {
          if (declaration.kind === "block") {
            return {
              kind: declaration.kind,
              name: declaration.name,
              tf: runs(declaration.tf),
              ...(declaration.label === undefined ? {} : { label: runs(declaration.label) }),
            };
          }
          if (declaration.kind === "sum") {
            return {
              kind: declaration.kind,
              name: declaration.name,
              signs: [...declaration.signs],
            };
          }
          if (declaration.kind === "edge") {
            return {
              kind: declaration.kind,
              from: declaration.from,
              to: declaration.to,
              ...(declaration.label === undefined ? {} : { label: runs(declaration.label) }),
            };
          }
          return {
            kind: declaration.kind,
            name: declaration.name,
            label: runs(declaration.label),
          };
        }),
      };
      if (block.id !== undefined) projected.id = block.id;
      if (block.number !== undefined) projected.number = block.number;
      if (block.title !== undefined) projected.title = block.title as unknown as JsonValue;
      if (block.description !== undefined) {
        projected.description = block.description as unknown as JsonValue;
      }
      return projected;
    }
    if (block.kind === "free-body") {
      // Parsed semantics only: authored declaration order and kinds, names,
      // exact-decimal coordinates, angles, attach values, direction forms and
      // targets, magnitude/length numbers, the scale switch, `visible:`/`style:`
      // and the canvas. Resolved rays, arrow endpoints, the auto-fit viewBox,
      // the y-flip and positional ids stay out of identity, and coincident
      // points are never merged.
      const attachment = (value: FreeBodyAttachment): JsonValue =>
        value.kind === "point"
          ? { kind: value.kind, name: value.name }
          : { kind: value.kind, x: value.x, y: value.y };
      const direction = (value: FreeBodyDirection): JsonValue =>
        value.kind === "angle"
          ? { kind: value.kind, degrees: value.degrees }
          : { kind: value.kind, line: value.line };
      const label = (value: CircuitText | undefined): Record<string, JsonValue> =>
        value === undefined ? {} : { label: value as unknown as JsonValue };
      const projected: Record<string, JsonValue> = {
        kind: block.kind,
        pluginVersion: block.pluginVersion,
        width: block.width,
        height: block.height,
        declarations: block.declarations.map((declaration): JsonValue => {
          switch (declaration.kind) {
            case "block":
              return {
                kind: declaration.kind,
                name: declaration.name,
                x: declaration.x,
                y: declaration.y,
                width: declaration.width,
                height: declaration.height,
                angle: declaration.angle,
                visible: declaration.visible,
              };
            case "circle":
              return {
                kind: declaration.kind,
                name: declaration.name,
                x: declaration.x,
                y: declaration.y,
                radius: declaration.radius,
                visible: declaration.visible,
              };
            case "particle":
              return {
                kind: declaration.kind,
                name: declaration.name,
                x: declaration.x,
                y: declaration.y,
                visible: declaration.visible,
              };
            case "polygon":
              return {
                kind: declaration.kind,
                name: declaration.name,
                vertices: [...declaration.vertices],
                visible: declaration.visible,
              };
            case "point":
              return {
                kind: declaration.kind,
                name: declaration.name,
                x: declaration.x,
                y: declaration.y,
                visible: declaration.visible,
                ...label(declaration.label),
              };
            case "line":
              return {
                kind: declaration.kind,
                name: declaration.name,
                from: declaration.from,
                to: declaration.to,
                visible: declaration.visible,
                style: declaration.style,
              };
            case "force":
              return {
                kind: declaration.kind,
                at: attachment(declaration.at),
                direction: direction(declaration.direction),
                ...(declaration.magnitude === undefined
                  ? {}
                  : { magnitude: declaration.magnitude }),
                ...(declaration.length === undefined ? {} : { length: declaration.length }),
                ...label(declaration.label),
              };
            case "moment":
              return {
                kind: declaration.kind,
                at: attachment(declaration.at),
                direction: declaration.direction,
                ...label(declaration.label),
              };
            case "axes":
              return {
                kind: declaration.kind,
                at: attachment(declaration.at),
                angle: declaration.angle,
                xLabel: declaration.xLabel as unknown as JsonValue,
                yLabel: declaration.yLabel as unknown as JsonValue,
              };
            case "angle-mark":
              return {
                kind: declaration.kind,
                first: declaration.first,
                vertex: declaration.vertex,
                third: declaration.third,
                ...label(declaration.label),
              };
            default:
              return {
                kind: declaration.kind,
                from: attachment(declaration.from),
                to: attachment(declaration.to),
                label: declaration.label as unknown as JsonValue,
              };
          }
        }),
      };
      if (block.scale !== undefined) projected.scale = block.scale;
      if (block.bounds !== undefined) {
        projected.bounds = { ...block.bounds } as unknown as JsonValue;
      }
      if (block.id !== undefined) projected.id = block.id;
      if (block.number !== undefined) projected.number = block.number;
      if (block.title !== undefined) projected.title = block.title as unknown as JsonValue;
      if (block.description !== undefined) {
        projected.description = block.description as unknown as JsonValue;
      }
      return projected;
    }
    if (block.kind === "algorithm") {
      const projected: Record<string, JsonValue> = {
        kind: block.kind,
        pluginVersion: block.pluginVersion,
        procedure: block.procedure,
        parameters: [...block.parameters],
        steps: block.steps.map(projectAlgorithmStatement),
      };
      if (block.id !== undefined) projected.id = block.id;
      if (block.number !== undefined) projected.number = block.number;
      if (block.caption !== undefined) {
        projected.caption = block.caption.map(projectInlineNode);
      }
      return projected;
    }
    if (block.kind === "statement") {
      const projected: Record<string, JsonValue> = {
        kind: block.kind,
        pluginVersion: block.pluginVersion,
        statementKind: block.statementKind,
        text: block.text.map(projectBlock),
      };
      if (block.proof !== undefined) projected.proof = block.proof.map(projectBlock);
      if (block.id !== undefined) projected.id = block.id;
      if (block.number !== undefined) projected.number = block.number;
      if (block.caption !== undefined) {
        projected.caption = block.caption.map(projectInlineNode);
      }
      return projected;
    }
    if (block.kind === "example") {
      const projected: Record<string, JsonValue> = {
        kind: block.kind,
        pluginVersion: block.pluginVersion,
        problem: block.problem.map(projectBlock),
        givens: [...block.givens],
        steps: block.steps.map((step) => ({ text: step.text.map(projectBlock) })),
      };
      if (block.result !== undefined) projected.result = block.result.map(projectBlock);
      if (block.id !== undefined) projected.id = block.id;
      if (block.number !== undefined) projected.number = block.number;
      if (block.caption !== undefined) {
        projected.caption = block.caption.map(projectInlineNode);
      }
      return projected;
    }
    if (block.kind === "figure") {
      const projected: Record<string, JsonValue> = {
        kind: block.kind,
        pluginVersion: block.pluginVersion,
        children: block.children.map(projectBlock),
      };
      if (block.id !== undefined) projected.id = block.id;
      if (block.number !== undefined) projected.number = block.number;
      if (block.caption !== undefined) {
        projected.caption = block.caption.map(projectInlineNode);
      }
      return projected;
    }
    if (block.kind === "bibliography") {
      // The works-cited projection is derived; only authored records hash.
      const projected: Record<string, JsonValue> = {
        kind: block.kind,
        pluginVersion: block.pluginVersion,
        entries: block.entries.map(
          (entry): JsonValue => ({
            key: entry.key,
            type: entry.entryType,
            title: entry.title,
            authors: entry.authors.map((author) => ({
              name: author.name,
              ...(author.family === undefined ? {} : { family: author.family }),
            })),
            ...(entry.year === undefined ? {} : { year: entry.year }),
            ...(entry.venue === undefined ? {} : { venue: entry.venue }),
            ...(entry.publisher === undefined ? {} : { publisher: entry.publisher }),
            ...(entry.edition === undefined ? {} : { edition: entry.edition }),
            ...(entry.pages === undefined ? {} : { pages: entry.pages }),
            ...(entry.url === undefined ? {} : { url: entry.url }),
            ...(entry.doi === undefined ? {} : { doi: entry.doi }),
            ...(entry.note === undefined ? {} : { note: entry.note }),
          }),
        ),
      };
      if (block.id !== undefined) projected.id = block.id;
      if (block.number !== undefined) projected.number = block.number;
      if (block.caption !== undefined) {
        projected.caption = block.caption.map(projectInlineNode);
      }
      return projected;
    }
    if (block.kind === "footnoteDefinition") {
      return {
        kind: block.kind,
        label: block.label,
        children: block.children.map(projectInlineNode),
      };
    }
    if (block.kind === "invalid") {
      return { kind: block.kind, raw: block.raw };
    }
    // Future plugin-owned block kinds extend this projection so authored
    // records remain part of semantic identity; Renderer-owned Fragments
    // never appear in ParsedBlock/AzeBlock, so they cannot leak in.
    const projected: Record<string, JsonValue> = {
      kind: block.kind,
      children: block.children.map(projectInlineNode),
    };
    if (block.id !== undefined) projected.id = block.id;
    if (block.kind === "heading") projected.level = block.level;
    return projected;
  }

  const blocks: JsonValue[] = document.blocks.map((block) => projectBlock(block));

  return sha256(
    canonicalJson({
      azemarkVersion: document.azemarkVersion,
      schemaVersion: document.schemaVersion,
      metadata,
      blocks,
    }),
  ) as ContentHash;
}
