import { readFile, realpath } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";

import { createDiagnostic } from "./diagnostics.js";
import { canonicalJson, sha256 } from "./hash.js";
import type {
  AssetManifestEntry,
  AzeBlock,
  AzeDocument,
  Diagnostic,
  ImageInline,
  Inline,
  Sha256Hash,
  SourceRange,
} from "./model.js";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_DIMENSION_PX = 10000;
const MAX_IMAGE_PIXELS = 25_000_000;

const EXTENSION_MEDIA_TYPES: Readonly<Record<string, AssetManifestEntry["mediaType"]>> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

const PNG_MAGIC = [137, 80, 78, 71, 13, 10, 26, 10];

export interface ImageResolution {
  readonly diagnostics: readonly Diagnostic[];
  readonly document?: AzeDocument;
  readonly manifest?: readonly AssetManifestEntry[];
}

interface ImageTarget {
  readonly node: ImageInline;
  readonly range: SourceRange;
}

function collectInlineImages(
  nodes: readonly Inline[],
  range: SourceRange,
  out: ImageTarget[],
): void {
  for (const node of nodes) {
    if (node.kind === "image") {
      out.push({ node, range });
    } else if (
      node.kind === "link" ||
      node.kind === "emphasis" ||
      node.kind === "strong"
    ) {
      collectInlineImages(node.children, range, out);
    }
  }
}

function collectBlockImages(blocks: readonly AzeBlock[], out: ImageTarget[]): void {
  for (const block of blocks) {
    switch (block.kind) {
      case "heading":
      case "paragraph":
        collectInlineImages(block.children, block.range, out);
        break;
      case "blockquote":
        collectBlockImages(block.children as readonly AzeBlock[], out);
        break;
      case "callout":
        if (block.title !== undefined) {
          collectInlineImages(block.title, block.range, out);
        }
        collectBlockImages(block.children as readonly AzeBlock[], out);
        break;
      case "list":
        for (const item of block.items) {
          collectBlockImages(item.blocks as readonly AzeBlock[], out);
        }
        break;
      case "table":
        if (block.caption !== undefined) {
          collectInlineImages(block.caption, block.range, out);
        }
        for (const cell of block.data.header) {
          collectInlineImages(cell, block.range, out);
        }
        for (const row of block.data.rows) {
          for (const cell of row) {
            collectInlineImages(cell, block.range, out);
          }
        }
        break;
      case "equation":
      case "mermaid":
      case "code":
      case "thematicBreak":
        break;
    }
  }
}

export function isContained(root: string, candidate: string): boolean {
  const distance = relative(root, candidate);
  return distance !== "" && !distance.startsWith("..") && !isAbsolute(distance);
}

export function isRemoteSource(src: string): boolean {
  return src.startsWith("//") || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(src);
}

export function isAbsoluteSource(src: string): boolean {
  return (
    isAbsolute(src) ||
    src.startsWith("/") ||
    src.startsWith("\\") ||
    /^[A-Za-z]:[\\/]/.test(src)
  );
}

function pngDimensions(
  bytes: Buffer,
): { width: number; height: number; animated: boolean } | undefined {
  for (let index = 0; index < PNG_MAGIC.length; index += 1) {
    if (bytes[index] !== PNG_MAGIC[index]) return undefined;
  }
  let offset = 8;
  let animated = false;
  let dimensions: { width: number; height: number } | undefined;
  let ended = false;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) return undefined;
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    const dataStart = offset + 8;
    if (dataStart + length + 4 > bytes.length) return undefined;
    if (type === "IHDR") {
      if (offset !== 8 || length !== 13) return undefined;
      dimensions = {
        width: bytes.readUInt32BE(dataStart),
        height: bytes.readUInt32BE(dataStart + 4),
      };
    } else if (type === "acTL") {
      animated = true;
    } else if (type === "IEND") {
      ended = true;
      break;
    }
    offset = dataStart + length + 4;
  }
  if (dimensions === undefined || !ended) return undefined;
  return { ...dimensions, animated };
}

function jpegDimensions(bytes: Buffer): { width: number; height: number } | undefined {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined;
  let offset = 2;
  const markerAt = (at: number): number | undefined =>
    at + 1 < bytes.length && bytes[at] === 0xff ? bytes[at + 1] : undefined;
  while (offset < bytes.length) {
    let marker = markerAt(offset);
    if (marker === undefined) return undefined;
    while (marker === 0xff) {
      offset += 1;
      marker = markerAt(offset);
      if (marker === undefined) return undefined;
    }
    if (marker === 0xd9) break;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    if (offset + 3 >= bytes.length) return undefined;
    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > bytes.length) return undefined;
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      if (length < 7) return undefined;
      return {
        height: bytes.readUInt16BE(offset + 5),
        width: bytes.readUInt16BE(offset + 7),
      };
    }
    offset += 2 + length;
  }
  return undefined;
}

type SniffedMedia = AssetManifestEntry["mediaType"] | undefined;

function stripSvgPreamble(text: string): string {
  const withoutBom = text.replace(/^﻿/, "").trimStart();
  return withoutBom.startsWith("<?xml")
    ? withoutBom.replace(/^<\?xml\s[^?]*\?>\s*/, "")
    : withoutBom;
}

function sniffMediaType(bytes: Buffer): SniffedMedia {
  if (bytes.length >= 8 && PNG_MAGIC.every((magic, index) => bytes[index] === magic)) {
    return "image/png";
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    return "image/jpeg";
  }
  if (/^<svg[\s>]/.test(stripSvgPreamble(bytes.toString("utf8")))) {
    return "image/svg+xml";
  }
  return undefined;
}

function parseSvgLength(value: string): number | undefined {
  const match = /^(\d+(?:\.\d+)?)(px)?$/.exec(value.trim());
  if (match?.[1] === undefined) return undefined;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export type SvgCheck = "ok" | "malformed" | "animated" | "active" | "external" | "dimensions";

function hasExternalSvgReference(body: string): boolean {
  const references = body.matchAll(
    /(?<![-\w])(?:xlink:href|href|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
  );
  for (const match of references) {
    const target = (match[1] ?? match[2] ?? match[3] ?? "").trim();
    if (target !== "" && !target.startsWith("#") && !target.startsWith("data:image/")) {
      return true;
    }
  }
  return false;
}

export function checkSvg(text: string): SvgCheck {
  const body = stripSvgPreamble(text);
  if (!/^<svg[\s>]/.test(body)) return "malformed";
  if (/<!DOCTYPE/i.test(body) || /<!ENTITY/i.test(body)) return "malformed";
  if (/<script[\s>]/i.test(body)) return "active";
  if (/<foreignObject[\s>]/i.test(body)) return "active";
  if (/\son[a-z]+\s*=/i.test(body)) return "active";
  if (/<animate[\s>]|<animateTransform[\s>]|<animateMotion[\s>]|<set[\s>]/i.test(body)) {
    return "animated";
  }
  if (/@keyframes/i.test(body) || /\banimation\s*:/i.test(body)) {
    return "animated";
  }
  if (/@import/i.test(body) || /url\(\s*["']?(?!#)/i.test(body)) {
    return "external";
  }
  if (hasExternalSvgReference(body)) {
    return "external";
  }
  const viewBox = /viewBox\s*=\s*["']([^"']+)["']/i.exec(body)?.[1];
  if (viewBox !== undefined) {
    const parts = viewBox.trim().split(/[\s,]+/).map(Number);
    if (
      parts.length !== 4 ||
      parts.some((part) => !Number.isFinite(part)) ||
      (parts[2] ?? 0) <= 0 ||
      (parts[3] ?? 0) <= 0 ||
      (parts[2] ?? 0) > MAX_IMAGE_DIMENSION_PX ||
      (parts[3] ?? 0) > MAX_IMAGE_DIMENSION_PX
    ) {
      return "dimensions";
    }
    return "ok";
  }
  const width = /<svg[^>]*\swidth\s*=\s*["']([^"']+)["']/i.exec(body)?.[1];
  const height = /<svg[^>]*\sheight\s*=\s*["']([^"']+)["']/i.exec(body)?.[1];
  const parsedWidth = width === undefined ? undefined : parseSvgLength(width);
  const parsedHeight = height === undefined ? undefined : parseSvgLength(height);
  if (
    parsedWidth === undefined ||
    parsedHeight === undefined ||
    parsedWidth <= 0 ||
    parsedHeight <= 0 ||
    parsedWidth > MAX_IMAGE_DIMENSION_PX ||
    parsedHeight > MAX_IMAGE_DIMENSION_PX
  ) {
    return "dimensions";
  }
  return "ok";
}

function failure(
  code: string,
  message: string,
  target: ImageTarget,
  sourceName: string | undefined,
  suggestion: string,
): Diagnostic {
  return createDiagnostic(code, "error", message, {
    location: {
      ...(sourceName === undefined ? {} : { source: sourceName }),
      range: target.range,
    },
    data: { src: target.node.src },
    suggestion,
  });
}

function embedInlineImages(
  nodes: readonly Inline[],
  embedded: ReadonlyMap<ImageInline, string>,
): readonly Inline[] {
  return nodes.map((node) => {
    if (node.kind === "image") {
      const src = embedded.get(node) ?? node.src;
      return Object.freeze({ ...node, src });
    }
    if (node.kind === "link" || node.kind === "emphasis" || node.kind === "strong") {
      return Object.freeze({
        ...node,
        children: embedInlineImages(node.children, embedded),
      });
    }
    return node;
  });
}

function embedBlockImages(
  blocks: readonly AzeBlock[],
  embedded: ReadonlyMap<ImageInline, string>,
): readonly AzeBlock[] {
  return blocks.map((block) => {
    switch (block.kind) {
      case "heading":
      case "paragraph":
        return Object.freeze({
          ...block,
          children: embedInlineImages(block.children, embedded),
        });
      case "blockquote":
        return Object.freeze({
          ...block,
          children: embedBlockImages(block.children as readonly AzeBlock[], embedded),
        });
      case "callout":
        return Object.freeze({
          ...block,
          ...(block.title === undefined
            ? {}
            : { title: embedInlineImages(block.title, embedded) }),
          children: embedBlockImages(block.children as readonly AzeBlock[], embedded),
        });
      case "list":
        return Object.freeze({
          ...block,
          items: block.items.map((item) =>
            Object.freeze({
              ...item,
              blocks: embedBlockImages(item.blocks as readonly AzeBlock[], embedded),
            }),
          ),
        });
      case "table":
        return Object.freeze({
          ...block,
          ...(block.caption === undefined
            ? {}
            : { caption: embedInlineImages(block.caption, embedded) }),
          data: Object.freeze({
            ...block.data,
            header: block.data.header.map((cell) => embedInlineImages(cell, embedded)),
            rows: block.data.rows.map((row) =>
              row.map((cell) => embedInlineImages(cell, embedded)),
            ),
          }),
        });
      default:
        return block;
    }
  });
}

export function assetManifestHash(manifest: readonly AssetManifestEntry[]): Sha256Hash {
  const entries = [...manifest].sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  );
  return sha256(
    canonicalJson(
      entries.map((entry) => ({
        bytesHash: entry.bytesHash,
        byteLength: entry.byteLength,
        mediaType: entry.mediaType,
        path: entry.path,
      })),
    ),
  );
}

function checkRasterDimensions(
  dimensions: { width: number; height: number } | undefined,
): "ok" | "malformed" | "bomb" {
  if (dimensions === undefined) return "malformed";
  const { width, height } = dimensions;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    return "malformed";
  }
  if (
    width > MAX_IMAGE_DIMENSION_PX ||
    height > MAX_IMAGE_DIMENSION_PX ||
    width * height > MAX_IMAGE_PIXELS
  ) {
    return "bomb";
  }
  return "ok";
}

export async function resolveProjectImages(
  document: AzeDocument,
  options: { readonly projectRoot?: string; readonly sourceName?: string } = {},
): Promise<ImageResolution> {
  const targets: ImageTarget[] = [];
  collectBlockImages(document.blocks, targets);
  if (targets.length === 0) {
    return { diagnostics: [], document, manifest: [] };
  }
  if (options.projectRoot === undefined) {
    return {
      diagnostics: [
        createDiagnostic(
          "azeforge.asset#root-required",
          "error",
          "Project images need a project root before Artifact publication.",
          {
            ...(options.sourceName === undefined
              ? {}
              : { location: { source: options.sourceName } }),
            data: { images: targets.length },
            suggestion:
              "Render through the CLI so images resolve inside the Source directory.",
          },
        ),
      ],
    };
  }
  let root: string;
  try {
    root = await realpath(resolve(options.projectRoot));
  } catch {
    return {
      diagnostics: [
        createDiagnostic(
          "azeforge.asset#root-required",
          "error",
          "The project root could not be resolved.",
          {
            ...(options.sourceName === undefined
              ? {}
              : { location: { source: options.sourceName } }),
            data: {},
            suggestion:
              "Render through the CLI so images resolve inside the Source directory.",
          },
        ),
      ],
    };
  }

  const diagnostics: Diagnostic[] = [];
  const embedded = new Map<ImageInline, string>();
  const embeddedByPath = new Map<string, string>();
  const manifestByPath = new Map<string, AssetManifestEntry>();

  for (const target of targets) {
    if (embedded.has(target.node)) continue;
    const src = target.node.src;
    const fail = (code: string, message: string, suggestion: string): void => {
      diagnostics.push(
        failure(`azeforge.asset#${code}`, message, target, options.sourceName, suggestion),
      );
    };
    if (src.trim() === "" || src.includes(String.fromCharCode(0))) {
      fail(
        "unsupported-type",
        "Image source is empty.",
        "Reference a project PNG, JPEG, or SVG image with a relative path.",
      );
      continue;
    }
    if (isAbsoluteSource(src)) {
      fail(
        "path-escape",
        `Image "${src}" escapes the project root; absolute image paths are rejected.`,
        "Reference the image with a relative path inside the project directory.",
      );
      continue;
    }
    if (isRemoteSource(src)) {
      fail(
        "unsupported-type",
        `Image "${src}" is remote; project images must be local files.`,
        "Add the image to the project directory and reference it with a relative path.",
      );
      continue;
    }
    const expected = EXTENSION_MEDIA_TYPES[extname(src).toLowerCase()];
    if (expected === undefined) {
      fail(
        "unsupported-type",
        `Image "${src}" has an unsupported type; P0 images are PNG, JPEG, or SVG.`,
        "Convert the image to PNG, JPEG, or SVG inside the project directory.",
      );
      continue;
    }
    const candidate = resolve(root, src);
    if (!isContained(root, candidate)) {
      fail(
        "path-escape",
        `Image "${src}" escapes the project root.`,
        "Reference the image with a relative path inside the project directory.",
      );
      continue;
    }
    let candidateReal: string;
    try {
      candidateReal = await realpath(candidate);
    } catch {
      fail(
        "unreadable",
        `Image "${src}" could not be read.`,
        "Check that the image exists inside the project directory.",
      );
      continue;
    }
    if (!isContained(root, candidateReal)) {
      fail(
        "path-escape",
        `Image "${src}" escapes the project root through a symlink.`,
        "Keep project images as real files inside the project directory.",
      );
      continue;
    }
    let bytes: Buffer;
    try {
      bytes = await readFile(candidateReal);
    } catch {
      fail(
        "unreadable",
        `Image "${src}" could not be read.`,
        "Check that the image exists inside the project directory.",
      );
      continue;
    }
    if (bytes.length > MAX_IMAGE_BYTES) {
      fail(
        "decompression-bomb",
        `Image "${src}" exceeds the ${MAX_IMAGE_BYTES} byte image limit.`,
        "Shrink the image before referencing it from project Source.",
      );
      continue;
    }
    const sniffed = sniffMediaType(bytes);
    if (sniffed === undefined) {
      fail(
        "unsupported-type",
        `Image "${src}" is not a readable PNG, JPEG, or SVG image.`,
        "Replace it with a valid static PNG, JPEG, or SVG image.",
      );
      continue;
    }
    if (sniffed !== expected) {
      fail(
        "mime-mismatch",
        `Image "${src}" ends in ${extname(src).toLowerCase()} but its bytes are ${sniffed}.`,
        "Rename the image so its extension matches its bytes.",
      );
      continue;
    }
    if (sniffed === "image/png" || sniffed === "image/jpeg") {
      const dimensions =
        sniffed === "image/png" ? pngDimensions(bytes) : jpegDimensions(bytes);
      if (sniffed === "image/png" && dimensions !== undefined && "animated" in dimensions && dimensions.animated) {
        fail(
          "animated",
          `Image "${src}" is animated; P0 images are static.`,
          "Replace it with a static PNG, JPEG, or SVG image.",
        );
        continue;
      }
      const verdict = checkRasterDimensions(dimensions);
      if (verdict === "malformed") {
        fail(
          "malformed",
          `Image "${src}" is a malformed ${sniffed === "image/png" ? "PNG" : "JPEG"} image.`,
          "Replace it with a valid static PNG, JPEG, or SVG image.",
        );
        continue;
      }
      if (verdict === "bomb") {
        fail(
          "decompression-bomb",
          `Image "${src}" exceeds the P0 image dimension limits.`,
          "Shrink the image before referencing it from project Source.",
        );
        continue;
      }
    } else {
      const verdict = checkSvg(bytes.toString("utf8"));
      if (verdict === "animated") {
        fail(
          "animated",
          `Image "${src}" is animated; P0 images are static.`,
          "Replace it with a static PNG, JPEG, or SVG image.",
        );
        continue;
      }
      if (verdict === "active") {
        fail(
          "active-content",
          `Image "${src}" contains scripted SVG content.`,
          "Remove scripts, event handlers, and foreign objects from the SVG.",
        );
        continue;
      }
      if (verdict === "external") {
        fail(
          "external-resource",
          `Image "${src}" references resources outside the SVG.`,
          "Inline every resource the SVG needs so the Artifact stays self-contained.",
        );
        continue;
      }
      if (verdict === "malformed" || verdict === "dimensions") {
        fail(
          "malformed",
          verdict === "dimensions"
            ? `Image "${src}" has invalid SVG dimensions.`
            : `Image "${src}" is a malformed SVG image.`,
          verdict === "dimensions"
            ? "Give the SVG a valid viewBox or positive width and height."
            : "Replace it with a valid static SVG image.",
        );
        continue;
      }
    }
    const logicalPath = relative(root, candidateReal).split(sep).join("/");
    const cached = embeddedByPath.get(logicalPath);
    if (cached !== undefined) {
      embedded.set(target.node, cached);
      continue;
    }
    const dataUrl = `data:${sniffed};base64,${bytes.toString("base64")}`;
    embedded.set(target.node, dataUrl);
    embeddedByPath.set(logicalPath, dataUrl);
    manifestByPath.set(logicalPath, {
      path: logicalPath,
      mediaType: sniffed,
      byteLength: bytes.length,
      bytesHash: sha256(bytes),
    });
  }

  if (diagnostics.length > 0) {
    return { diagnostics };
  }
  const manifest = [...manifestByPath.values()].sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  );
  return {
    diagnostics: [],
    document: Object.freeze({ ...document, blocks: embedBlockImages(document.blocks, embedded) }),
    manifest,
  };
}
