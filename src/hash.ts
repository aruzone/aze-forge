import { createHash } from "node:crypto";

import type {
  ArtifactHash,
  AzeDocument,
  ContentHash,
  JsonValue,
  Sha256Hash,
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

export function documentContentHash(document: AzeDocument): ContentHash {
  const metadata: Record<string, JsonValue> = {
    authors: document.metadata.authors,
    extensions: document.metadata.extensions,
  };
  if (document.metadata.title !== undefined) metadata.title = document.metadata.title;
  if (document.metadata.theme !== undefined) metadata.theme = document.metadata.theme;
  if (document.metadata.outputs !== undefined) metadata.outputs = document.metadata.outputs;

  const blocks: JsonValue[] = document.blocks.map((block) => {
    if (block.kind === "equation") {
      const projected: Record<string, JsonValue> = {
        kind: block.kind,
        pluginVersion: block.pluginVersion,
        syntax: block.syntax,
        source: block.source,
        tex: block.tex,
      };
      if (block.id !== undefined) projected.id = block.id;
      if (block.number !== undefined) projected.number = block.number;
      if (block.align !== undefined) projected.align = block.align;
      return projected;
    }
    const projected: Record<string, JsonValue> = {
      kind: block.kind,
      children: block.children.map((child) => ({ kind: child.kind, value: child.value })),
    };
    if (block.id !== undefined) projected.id = block.id;
    if (block.kind === "heading") projected.level = block.level;
    return projected;
  });

  return sha256(
    canonicalJson({
      azemarkVersion: document.azemarkVersion,
      schemaVersion: document.schemaVersion,
      metadata,
      blocks,
    }),
  ) as ContentHash;
}
