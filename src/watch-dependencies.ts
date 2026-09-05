import { realpath } from "node:fs/promises";
import { extname, resolve } from "node:path";

import type { AzeDocument, Inline, ParsedBlock } from "./model.js";

const SUPPORTED_IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".svg"]);

function collectInlineSources(nodes: readonly Inline[], out: string[]): void {
  for (const node of nodes) {
    if (node.kind === "image") {
      out.push(node.src);
    } else if (node.kind === "link") {
      collectInlineSources(node.children, out);
    } else if (node.kind === "emphasis" || node.kind === "strong") {
      collectInlineSources(node.children, out);
    }
  }
}

function collectBlockSources(blocks: readonly ParsedBlock[], out: string[]): void {
  for (const block of blocks) {
    switch (block.kind) {
      case "heading":
      case "paragraph":
        collectInlineSources(block.children, out);
        break;
      case "blockquote":
        collectBlockSources(block.children, out);
        break;
      case "list":
        for (const item of block.items) collectBlockSources(item.blocks, out);
        break;
      case "callout":
        collectBlockSources(block.children, out);
        if (block.title !== undefined) collectInlineSources(block.title, out);
        break;
      case "table":
        for (const row of block.data.header) collectInlineSources(row, out);
        for (const row of block.data.rows) {
          for (const cell of row) collectInlineSources(cell, out);
        }
        if (block.caption !== undefined) collectInlineSources(block.caption, out);
        break;
      default:
        break;
    }
  }
}

/** Every image `src` referenced by a Document, in Source order. */
export function collectImageSources(document: AzeDocument): string[] {
  const out: string[] = [];
  collectBlockSources(document.blocks, out);
  return out;
}

function isRemoteSource(src: string): boolean {
  return src.startsWith("//") || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(src);
}

function isAbsoluteSource(src: string): boolean {
  return (
    src.startsWith("/") ||
    /^[A-Za-z]:[\\/]/.test(src) ||
    src.startsWith("\\\\")
  );
}

function isContained(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}/`);
}

export interface WatchPaths {
  /** Existing root-confined files to watch directly. */
  readonly files: readonly string[];
  /** Root-confined candidate paths that do not exist yet. */
  readonly missing: readonly string[];
}

/**
 * Partition image references into existing files and missing root-confined
 * candidates. Remote, absolute, escaping, and unsupported-type references are
 * compile errors, not watch targets, so they are skipped here.
 */
export async function resolveWatchPaths(
  projectRoot: string,
  imageSources: readonly string[],
): Promise<WatchPaths> {
  const files = new Set<string>();
  const missing = new Set<string>();
  for (const src of imageSources) {
    if (src.trim() === "" || src.includes("\0")) continue;
    if (isAbsoluteSource(src) || isRemoteSource(src)) continue;
    if (!SUPPORTED_IMAGE_EXTENSIONS.has(extname(src).toLowerCase())) continue;
    const candidate = resolve(projectRoot, src);
    if (!isContained(projectRoot, candidate)) continue;
    let candidateReal: string;
    try {
      candidateReal = await realpath(candidate);
    } catch {
      missing.add(candidate);
      continue;
    }
    if (!isContained(projectRoot, candidateReal)) continue;
    files.add(candidateReal);
  }
  return {
    files: [...files].sort(),
    missing: [...missing].sort(),
  };
}
