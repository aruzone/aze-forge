import { createHash } from "node:crypto";

import { isTypedTableData } from "./table.js";
import type {
  ArtifactHash,
  AzeBlock,
  AzeDocument,
  ContentHash,
  Inline,
  JsonValue,
  ParsedBlock,
  Sha256Hash,
  TableData,
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
  }
}

function isInline(node: unknown): node is Inline {
  return (
    typeof node === "object" &&
    node !== null &&
    "kind" in node &&
    typeof node.kind === "string"
  );
}

function projectCellValue(cell: unknown): JsonValue {
  if (Array.isArray(cell)) {
    return cell.map((node) => {
      if (isInline(node)) return projectInlineNode(node);
      return String(node);
    });
  }
  if (cell === null || cell === undefined) return null;
  if (typeof cell === "number") return Number.isFinite(cell) ? cell : String(cell);
  if (typeof cell === "boolean") return cell;
  return String(cell);
}

function projectTableData(data: TableData | TypedTableData): JsonValue {
  if (isTypedTableData(data)) {
    return {
      kind: "typed",
      columns: data.columns.map((column) => ({
        key: column.key,
        ...(column.name === undefined ? {} : { name: column.name }),
        ...(column.type === undefined ? {} : { type: column.type }),
        ...(column.unit === undefined ? {} : { unit: column.unit }),
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
          data.columns.map((column) => [column.key, projectCellValue(row[column.key])]),
        ),
      ),
    };
  }
  return {
    kind: "gfm",
    align: [...data.align],
    header: data.header.map((cell) => cell.map(projectInlineNode)),
    rows: data.rows.map((row) => row.map((cell) => cell.map(projectInlineNode))),
  };
}

export function documentContentHash(document: AzeDocument): ContentHash {
  const metadata: Record<string, JsonValue> = {
    authors: document.metadata.authors,
    extensions: document.metadata.extensions,
  };
  if (document.metadata.title !== undefined) metadata.title = document.metadata.title;
  if (document.metadata.theme !== undefined) metadata.theme = document.metadata.theme;
  if (document.metadata.outputs !== undefined) metadata.outputs = document.metadata.outputs;

  function projectBlock(block: ParsedBlock | AzeBlock): JsonValue {
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
