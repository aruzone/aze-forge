#!/usr/bin/env node
// Regenerates `src/advance-metric-data.ts` from the pinned @fontsource/inter
// woff2 subsets that `src/font.ts` lists (`INTER_SUBSET_RANGES`), at weight 400.
//
// Diagram labels are measured in CSS pixels before layout, so the compiler
// needs the per-code-point advance widths of the same Inter bytes the browser
// is handed. Generating them here keeps the measurement browser-free and adds
// no dependency: the WOFF2 container is parsed directly with `node:zlib`
// (`brotliDecompressSync`) plus a small table-directory reader, then `head`
// (unitsPerEm), `hhea`/`maxp` (numberOfHMetrics), `hmtx` (advance widths) and
// `cmap` format 4 (code point -> glyph) are read.
//
// Output is byte-stable: code points are sorted ascending, subsets merge in
// `INTER_SUBSET_RANGES` order (the first subset covering a code point wins),
// and no timestamp, path or environment fact reaches the file.
//
// Usage: node scripts/generate-advance-metric.mjs

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliDecompressSync } from "node:zlib";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FONT_SOURCE_PATH = join(ROOT, "src", "font.ts");
const OUTPUT_PATH = join(ROOT, "src", "advance-metric-data.ts");

const PACKAGE_NAME = "@fontsource/inter";
const WEIGHT = 400;
const DEFAULT_CODE_POINT = 0x0078; // "x"
const WOFF2_SIGNATURE = 0x774f4632;

// WOFF2 `flags` bits 0-5 index this list; 0x3f means an explicit four-CC tag.
const KNOWN_TAGS = [
  "cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post",
  "cvt ", "fpgm", "glyf", "loca", "prep", "CFF ", "VORG", "EBDT",
  "EBLC", "gasp", "hdmx", "kern", "LTSH", "PCLT", "VDMX", "vhea",
  "vmtx", "BASE", "GDEF", "GPOS", "GSUB", "EBSC", "JSTF", "MATH",
  "CBDT", "CBLC", "COLR", "CPAL", "SVG ", "sbix", "acnt", "avar",
  "bdat", "bloc", "bsln", "cvar", "fdsc", "feat", "fmtx", "fvar",
  "gvar", "hsty", "just", "lcar", "mort", "morx", "opbd", "prop",
  "trak", "Zapf", "Silf", "Glat", "Gloc", "Feat", "Sill",
];
const TRANSFORMABLE_TAGS = new Set(["glyf", "loca"]);

/* ------------------------------------------------------------------ *
 * WOFF2 container
 * ------------------------------------------------------------------ */

function readUInt16(bytes, offset) {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUInt32(bytes, offset) {
  return (
    bytes[offset] * 0x1000000 +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3]
  );
}

/** UIntBase128 (WOFF2 §4.1) — at most five high-bit-chained bytes. */
function readBase128(bytes, cursor) {
  let value = 0;
  for (let index = 0; index < 5; index += 1) {
    const byte = bytes[cursor.offset];
    cursor.offset += 1;
    if (index === 0 && byte === 0x80) {
      throw new Error("WOFF2 UIntBase128 has a leading zero byte.");
    }
    if (value > 0x0fffffff) {
      throw new Error("WOFF2 UIntBase128 overflows 32 bits.");
    }
    value = value * 128 + (byte & 0x7f);
    if ((byte & 0x80) === 0) return value;
  }
  throw new Error("WOFF2 UIntBase128 is longer than five bytes.");
}

function readFourCc(bytes, offset) {
  return String.fromCharCode(
    bytes[offset],
    bytes[offset + 1],
    bytes[offset + 2],
    bytes[offset + 3],
  );
}

/** Splits one woff2 file into its raw (brotli-decompressed) table data. */
function readWoff2Tables(bytes, file) {
  if (bytes.length < 48 || readUInt32(bytes, 0) !== WOFF2_SIGNATURE) {
    throw new Error(`${file} is not a WOFF2 font.`);
  }
  const numTables = readUInt16(bytes, 12);
  const totalCompressedSize = readUInt32(bytes, 20);
  const cursor = { offset: 48 };
  const directory = [];
  for (let index = 0; index < numTables; index += 1) {
    const flags = bytes[cursor.offset];
    cursor.offset += 1;
    const tagIndex = flags & 0x3f;
    const transformVersion = (flags >> 6) & 0x03;
    let tag;
    if (tagIndex === 0x3f) {
      tag = readFourCc(bytes, cursor.offset);
      cursor.offset += 4;
    } else {
      tag = KNOWN_TAGS[tagIndex];
      if (tag === undefined) throw new Error(`${file} uses unknown table flags.`);
    }
    const origLength = readBase128(bytes, cursor);
    let transformLength;
    if (TRANSFORMABLE_TAGS.has(tag)) {
      // 0 = transformed (length present), 3 = null transform (length absent).
      if (transformVersion === 0) transformLength = readBase128(bytes, cursor);
      else if (transformVersion !== 3) {
        throw new Error(`${file} uses an unregistered ${tag} transform.`);
      }
    } else if (transformVersion !== 0) {
      throw new Error(`${file} transforms ${tag}, which must be untransformed.`);
    }
    directory.push({ tag, origLength, transformLength });
  }

  const stream = brotliDecompressSync(
    bytes.subarray(cursor.offset, cursor.offset + totalCompressedSize),
  );
  const tables = new Map();
  let streamOffset = 0;
  for (const entry of directory) {
    const length = entry.transformLength ?? entry.origLength;
    tables.set(entry.tag, stream.subarray(streamOffset, streamOffset + length));
    streamOffset += length;
  }
  return tables;
}

function requireTable(tables, tag, file) {
  const data = tables.get(tag);
  if (data === undefined) throw new Error(`${file} has no ${tag} table.`);
  return data;
}

/* ------------------------------------------------------------------ *
 * SFNT tables the table needs
 * ------------------------------------------------------------------ */

function readUnitsPerEm(head, file) {
  const unitsPerEm = readUInt16(head, 18);
  if (unitsPerEm === 0) throw new Error(`${file} declares unitsPerEm 0.`);
  return unitsPerEm;
}

function readAdvanceWidths(tables, file) {
  const numGlyphs = readUInt16(requireTable(tables, "maxp", file), 4);
  const numberOfHMetrics = readUInt16(requireTable(tables, "hhea", file), 34);
  if (numberOfHMetrics === 0 || numberOfHMetrics > numGlyphs) {
    throw new Error(`${file} declares ${numberOfHMetrics} horizontal metrics.`);
  }
  const hmtx = requireTable(tables, "hmtx", file);
  const widths = new Uint16Array(numGlyphs);
  for (let glyph = 0; glyph < numGlyphs; glyph += 1) {
    const index = glyph < numberOfHMetrics ? glyph : numberOfHMetrics - 1;
    widths[glyph] = readUInt16(hmtx, index * 4);
  }
  return widths;
}

/** Code point -> glyph id, from the best Unicode `cmap` format 4 subtable. */
function readCmapFormat4(tables, file) {
  const cmap = requireTable(tables, "cmap", file);
  const numTables = readUInt16(cmap, 2);
  let chosen;
  let chosenRank = Number.POSITIVE_INFINITY;
  for (let index = 0; index < numTables; index += 1) {
    const record = 4 + index * 8;
    const platformId = readUInt16(cmap, record);
    const encodingId = readUInt16(cmap, record + 2);
    const offset = readUInt32(cmap, record + 4);
    if (readUInt16(cmap, offset) !== 4) continue;
    const rank =
      platformId === 3 && (encodingId === 1 || encodingId === 10)
        ? 0
        : platformId === 0
          ? 1
          : 2;
    if (rank < chosenRank) {
      chosenRank = rank;
      chosen = offset;
    }
  }
  if (chosen === undefined) {
    throw new Error(`${file} has no Unicode cmap format 4 subtable.`);
  }

  const segCount = readUInt16(cmap, chosen + 6) / 2;
  const endCodes = chosen + 14;
  const startCodes = endCodes + segCount * 2 + 2;
  const idDeltas = startCodes + segCount * 2;
  const idRangeOffsets = idDeltas + segCount * 2;

  const glyphs = new Map();
  for (let segment = 0; segment < segCount; segment += 1) {
    const end = readUInt16(cmap, endCodes + segment * 2);
    const start = readUInt16(cmap, startCodes + segment * 2);
    if (start > end) continue;
    let delta = readUInt16(cmap, idDeltas + segment * 2);
    if (delta >= 0x8000) delta -= 0x10000;
    const rangeOffset = readUInt16(cmap, idRangeOffsets + segment * 2);
    for (let codePoint = start; codePoint <= end; codePoint += 1) {
      let glyph;
      if (rangeOffset === 0) {
        glyph = (codePoint + delta) & 0xffff;
      } else {
        const address =
          idRangeOffsets + segment * 2 + rangeOffset + (codePoint - start) * 2;
        if (address + 1 >= cmap.length) continue;
        glyph = readUInt16(cmap, address);
        if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
      }
      if (glyph !== 0) glyphs.set(codePoint, glyph);
    }
  }
  return glyphs;
}

/* ------------------------------------------------------------------ *
 * Subset discovery (src/font.ts is the single authority)
 * ------------------------------------------------------------------ */

async function readSubsetNames() {
  const source = await readFile(FONT_SOURCE_PATH, "utf8");
  const block = /const INTER_SUBSET_RANGES[\s\S]*?=\s*\[([\s\S]*?)\n\];/.exec(
    source,
  );
  if (block === null) {
    throw new Error("src/font.ts no longer declares INTER_SUBSET_RANGES.");
  }
  const names = [...block[1].matchAll(/name: "([^"]+)"/g)].map(
    (match) => match[1],
  );
  if (names.length === 0) {
    throw new Error("INTER_SUBSET_RANGES lists no subsets.");
  }
  return names;
}

async function readPackageVersion() {
  const manifest = JSON.parse(
    await readFile(
      join(ROOT, "node_modules", PACKAGE_NAME, "package.json"),
      "utf8",
    ),
  );
  if (typeof manifest.version !== "string") {
    throw new Error(`${PACKAGE_NAME} declares no version.`);
  }
  return manifest.version;
}

/* ------------------------------------------------------------------ *
 * Emission
 * ------------------------------------------------------------------ */

function freezeLiteral(value, depth) {
  const pad = "  ".repeat(depth + 1);
  const closePad = "  ".repeat(depth);
  if (Array.isArray(value)) {
    if (value.length === 0) return "Object.freeze([])";
    const items = value.map((item) => `${pad}${freezeLiteral(item, depth + 1)}`);
    return `Object.freeze([\n${items.join(",\n")},\n${closePad}])`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) return "Object.freeze({})";
    const items = entries.map(
      ([key, item]) => `${pad}${JSON.stringify(key)}: ${freezeLiteral(item, depth + 1)}`,
    );
    return `Object.freeze({\n${items.join(",\n")},\n${closePad}})`;
  }
  return JSON.stringify(value);
}

function renderModule(data) {
  return [
    "// generated by scripts/generate-advance-metric.mjs — do not edit by hand",
    'import type { AdvanceMetricTable } from "./advance-metric.js";',
    "",
    `export const ADVANCE_METRIC_DATA: AdvanceMetricTable = ${freezeLiteral(data, 0)};`,
    "",
  ].join("\n");
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */

async function main() {
  const subsetNames = await readSubsetNames();
  const version = await readPackageVersion();

  const advances = new Map();
  const sources = [];
  let unitsPerEm;

  for (const name of subsetNames) {
    const file = join(
      "node_modules",
      PACKAGE_NAME,
      "files",
      `inter-${name}-${WEIGHT}-normal.woff2`,
    );
    const bytes = await readFile(join(ROOT, file));
    sources.push({
      package: PACKAGE_NAME,
      version,
      hash: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    });

    const tables = readWoff2Tables(bytes, file);
    const subsetUnitsPerEm = readUnitsPerEm(requireTable(tables, "head", file), file);
    if (unitsPerEm === undefined) unitsPerEm = subsetUnitsPerEm;
    else if (subsetUnitsPerEm !== unitsPerEm) {
      throw new Error(
        `${file} declares unitsPerEm ${subsetUnitsPerEm}, not ${unitsPerEm}.`,
      );
    }

    const widths = readAdvanceWidths(tables, file);
    for (const [codePoint, glyph] of readCmapFormat4(tables, file)) {
      const width = widths[glyph];
      if (width === undefined) {
        throw new Error(`${file} maps U+${codePoint.toString(16)} past hmtx.`);
      }
      // First subset in INTER_SUBSET_RANGES order wins; subsets never disagree.
      if (!advances.has(codePoint)) advances.set(codePoint, width);
    }
  }

  const defaultAdvance = advances.get(DEFAULT_CODE_POINT);
  if (defaultAdvance === undefined) {
    throw new Error("Inter does not cover U+0078, so defaultAdvance is unknown.");
  }

  const sorted = {};
  for (const codePoint of [...advances.keys()].sort((a, b) => a - b)) {
    sorted[String(codePoint)] = advances.get(codePoint);
  }

  const data = {
    family: "Inter",
    weight: WEIGHT,
    unitsPerEm,
    defaultAdvance,
    advances: sorted,
    sources,
  };
  await writeFile(OUTPUT_PATH, renderModule(data));
  process.stdout.write(
    `advance metric: ${Object.keys(sorted).length} code points, unitsPerEm ${unitsPerEm}, defaultAdvance ${defaultAdvance}, ${subsetNames.length} subsets\n`,
  );
}

await main();
