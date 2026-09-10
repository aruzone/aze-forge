import { arch, platform } from "node:os";
import { deflateSync, inflateSync } from "node:zlib";

import type { Browser, HTTPRequest } from "puppeteer-core";
import { calloutHtmlBlockRenderer } from "./callout.js";
import { derivationHtmlBlockRenderer } from "./derivation.js";
import { equationHtmlBlockRenderer } from "./equation.js";
import { chartHtmlBlockRenderer, plotHtmlBlockRenderer } from "./plot.js";

import { assetManifestHash } from "./assets.js";
import { artifactBytesHash, canonicalJson, sha256 } from "./hash.js";
import {
  CHROME_HEADLESS_SHELL_VERSION,
  launchPinnedBrowser,
  throwIfDeniedBrowserRequest,
} from "./mermaid-browser.js";
import { mermaidHtmlBlockRenderer } from "./mermaid.js";
import type {
  AnyBlockRenderer,
  Artifact,
  AssetManifestEntry,
  ContentHash,
  JsonValue,
  RendererDescriptor,
  Theme,
} from "./model.js";
import type { HtmlLayout } from "./render-html.js";
import { tableHtmlBlockRenderer } from "./table.js";

export const PNG_RENDERER_ID = "png" as const;
export const PNG_RENDERER_VERSION = "1.0.0" as const;
export const PNG_MIME_TYPE = "image/png" as const;
export const PNG_PROFILE = "azeforge.png.continuous/v1" as const;
export const PNG_SERIALIZER = "azeforge-png/v1" as const;
export const PNG_DEVICE_SCALE_FACTOR = 2 as const;
export const PNG_MAX_BYTES = 64 * 1024 * 1024;
export const PNG_MAX_CSS_HEIGHT_PX = 100_000;
export const PNG_MAX_PIXEL_DIMENSION = 32_768;
export const PNG_MAX_PIXELS = 50_000_000;
const PNG_SRGB_INTENT = 0;
const PNG_DEFLATE_LEVEL = 9;
export const PNG_REQUIRED_CAPABILITIES = Object.freeze([
  "png-continuous",
  "srgb",
] as const);
const ALLOWED_REQUEST = /^(?:about:blank|data:(?:font\/woff2|image\/(?:png|jpeg|svg\+xml));base64,)/;
const PNG_SIGNATURE = Object.freeze([137, 80, 78, 71, 13, 10, 26, 10]);

function pngBlockRenderer(renderer: AnyBlockRenderer): AnyBlockRenderer {
  return Object.freeze({
    descriptor: Object.freeze({
      ...renderer.descriptor,
      id: renderer.descriptor.id.replace(".html/", ".png/"),
      rendererId: PNG_RENDERER_ID,
    }),
    render: renderer.render,
  }) as AnyBlockRenderer;
}

export const pngBlockRenderers: readonly AnyBlockRenderer[] = Object.freeze([
  pngBlockRenderer(equationHtmlBlockRenderer),
  pngBlockRenderer(derivationHtmlBlockRenderer),
  pngBlockRenderer(calloutHtmlBlockRenderer),
  pngBlockRenderer(mermaidHtmlBlockRenderer),
  pngBlockRenderer(tableHtmlBlockRenderer),
  pngBlockRenderer(plotHtmlBlockRenderer),
  pngBlockRenderer(chartHtmlBlockRenderer),
]);

export interface PngBrowserCapability {
  readonly launch: () => Promise<Browser>;
}

export const pinnedPngBrowserCapability: PngBrowserCapability = Object.freeze({
  launch: launchPinnedBrowser,
});

export const pngRendererDescriptor: RendererDescriptor = Object.freeze({
  id: PNG_RENDERER_ID,
  version: PNG_RENDERER_VERSION,
  formats: Object.freeze(["png"] as const),
  capabilities: Object.freeze(["browser"] as const),
});

export class PngArtifactLimitError extends Error {
  readonly byteLength: number;

  constructor(byteLength: number) {
    super(`PNG Artifact is ${byteLength} bytes; the limit is ${PNG_MAX_BYTES} bytes.`);
    this.name = "PngArtifactLimitError";
    this.byteLength = byteLength;
  }
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let value = 0; value < 256; value += 1) {
    let entry = value;
    for (let bit = 0; bit < 8; bit += 1) {
      entry = entry % 2 === 0 ? entry >>> 1 : (entry >>> 1) ^ 0xedb88320;
    }
    table[value] = entry >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xff_ff_ff_ff;
  for (const byte of bytes) {
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8);
  }
  return (crc ^ 0xff_ff_ff_ff) >>> 0;
}

function readU32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] as number) * 0x1_00_00_00 +
      ((bytes[offset + 1] as number) << 16) +
      ((bytes[offset + 2] as number) << 8) +
      (bytes[offset + 3] as number)) >>>
    0
  );
}

function writeU32BE(value: number): Uint8Array {
  return Uint8Array.from([
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ]);
}

function chunkType(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset] as number,
    bytes[offset + 1] as number,
    bytes[offset + 2] as number,
    bytes[offset + 3] as number,
  );
}

function buildChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = Uint8Array.from([
    type.charCodeAt(0),
    type.charCodeAt(1),
    type.charCodeAt(2),
    type.charCodeAt(3),
  ]);
  const combined = new Uint8Array(typeBytes.length + data.length);
  combined.set(typeBytes, 0);
  combined.set(data, typeBytes.length);
  const out = new Uint8Array(12 + data.length);
  out.set(writeU32BE(data.length), 0);
  out.set(combined, 4);
  out.set(writeU32BE(crc32(combined)), 8 + data.length);
  return out;
}

function bytesPerPixel(colorType: number): number | undefined {
  if (colorType === 2) return 3;
  if (colorType === 6) return 4;
  return undefined;
}

function paethPredictor(left: number, above: number, aboveLeft: number): number {
  const estimate = left + above - aboveLeft;
  const distanceLeft = Math.abs(estimate - left);
  const distanceAbove = Math.abs(estimate - above);
  const distanceAboveLeft = Math.abs(estimate - aboveLeft);
  if (distanceLeft <= distanceAbove && distanceLeft <= distanceAboveLeft) {
    return left;
  }
  if (distanceAbove <= distanceAboveLeft) return above;
  return aboveLeft;
}

function unfilterScanlines(
  filtered: Uint8Array,
  width: number,
  height: number,
  stride: number,
): Uint8Array {
  const rowLength = 1 + stride * width;
  if (filtered.length !== rowLength * height) {
    throw new Error("The PNG pixel data does not match its IHDR dimensions.");
  }
  const raw = new Uint8Array(stride * width * height);
  let previous = new Uint8Array(stride * width);
  for (let row = 0; row < height; row += 1) {
    const filter = filtered[row * rowLength] as number;
    if (filter > 4) {
      throw new Error("The PNG filter method is unsupported.");
    }
    const current = new Uint8Array(stride * width);
    for (let index = 0; index < stride * width; index += 1) {
      const filteredByte = filtered[row * rowLength + 1 + index] as number;
      const left = index < stride ? 0 : (current[index - stride] as number);
      const above = previous[index] as number;
      const aboveLeft = index < stride ? 0 : (previous[index - stride] as number);
      let restored: number;
      if (filter === 0) restored = filteredByte;
      else if (filter === 1) restored = filteredByte + left;
      else if (filter === 2) restored = filteredByte + above;
      else if (filter === 3) restored = filteredByte + ((left + above) >> 1);
      else restored = filteredByte + paethPredictor(left, above, aboveLeft);
      current[index] = restored & 0xff;
    }
    raw.set(current, row * stride * width);
    previous = current;
  }
  return raw;
}

/**
 * Deterministic PNG normalization: keeps the IHDR geometry, strips every
 * unstable or private ancillary chunk, emits one fixed sRGB chunk, and
 * re-encodes IDAT with fixed filtering and compression. Same decoded
 * pixels always produce identical bytes.
 */
export function normalizePng(bytes: Uint8Array): Uint8Array {
  for (let index = 0; index < PNG_SIGNATURE.length; index += 1) {
    if (bytes[index] !== PNG_SIGNATURE[index]) {
      throw new Error("The PNG signature is invalid.");
    }
  }
  let offset = 8;
  let ihdr: Uint8Array | undefined;
  const idatParts: Uint8Array[] = [];
  let idatLength = 0;
  while (offset + 8 <= bytes.length) {
    const length = readU32BE(bytes, offset);
    const type = chunkType(bytes, offset + 4);
    const end = offset + 12 + length;
    if (end > bytes.length) {
      throw new Error("The PNG chunk extends past the end of the file.");
    }
    const data = bytes.slice(offset + 8, offset + 8 + length);
    const expectedCrc = readU32BE(bytes, offset + 8 + length);
    const actualCrc = crc32(bytes.slice(offset + 4, offset + 8 + length));
    if (expectedCrc !== actualCrc) {
      throw new Error(`The PNG ${type} chunk failed its integrity check.`);
    }
    if (type === "IHDR") {
      if (ihdr !== undefined) throw new Error("The PNG has more than one IHDR chunk.");
      if (length !== 13) throw new Error("The PNG IHDR chunk is malformed.");
      ihdr = data.slice();
    } else if (type === "IDAT") {
      idatParts.push(data.slice());
      idatLength += data.length;
    } else if (type === "acTL" || type === "fcTL" || type === "fdAT") {
      throw new Error("Animated PNG output is not supported.");
    } else if (type === "IEND") {
      break;
    }
    offset = end;
  }
  if (ihdr === undefined) throw new Error("The PNG is missing its IHDR chunk.");
  const width = readU32BE(ihdr, 0);
  const height = readU32BE(ihdr, 4);
  const bitDepth = ihdr[8] as number;
  const colorType = ihdr[9] as number;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width > PNG_MAX_PIXEL_DIMENSION ||
    height > PNG_MAX_PIXEL_DIMENSION ||
    width * height > PNG_MAX_PIXELS
  ) {
    throw new PngArtifactLimitError(bytes.byteLength);
  }
  if (bitDepth !== 8) throw new Error("Only 8-bit PNG output is supported.");
  const stride = bytesPerPixel(colorType);
  if (stride === undefined) {
    throw new Error("Only truecolor PNG output is supported.");
  }
  const compressed = new Uint8Array(idatLength);
  let written = 0;
  for (const part of idatParts) {
    compressed.set(part, written);
    written += part.length;
  }
  let filtered: Uint8Array;
  try {
    filtered = Uint8Array.from(inflateSync(Buffer.from(compressed)));
  } catch {
    throw new Error("The PNG pixel data could not be decoded.");
  }
  const raw = unfilterScanlines(filtered, width, height, stride);
  const refiltered = new Uint8Array((1 + stride * width) * height);
  for (let row = 0; row < height; row += 1) {
    refiltered[row * (1 + stride * width)] = 0;
    refiltered.set(
      raw.slice(row * stride * width, (row + 1) * stride * width),
      row * (1 + stride * width) + 1,
    );
  }
  const recompressed = Uint8Array.from(
    deflateSync(Buffer.from(refiltered), { level: PNG_DEFLATE_LEVEL }),
  );
  const parts: Uint8Array[] = [
    Uint8Array.from(PNG_SIGNATURE),
    buildChunk("IHDR", ihdr),
    buildChunk("sRGB", Uint8Array.from([PNG_SRGB_INTENT])),
    buildChunk("IDAT", recompressed),
    buildChunk("IEND", new Uint8Array(0)),
  ];
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  if (total > PNG_MAX_BYTES) throw new PngArtifactLimitError(total);
  const out = new Uint8Array(total);
  let position = 0;
  for (const part of parts) {
    out.set(part, position);
    position += part.length;
  }
  return out;
}

function settlePageHtml(layout: HtmlLayout): string {
  return `<!doctype html><html lang="und"><head><meta charset="utf-8"><style>${layout.css}*{animation:none!important;transition:none!important;caret-color:transparent!important}</style></head><body>${layout.body}</body></html>`;
}

async function measureSettledLayout(
  browser: Browser,
  layout: HtmlLayout,
  width: number,
): Promise<number> {
  const context = await browser.createBrowserContext();
  try {
    const page = await context.newPage();
    await page.setViewport({ width, height: 1, deviceScaleFactor: 1 });
    let deniedRequest: string | undefined;
    await page.setRequestInterception(true);
    page.on("request", (request: HTTPRequest) => {
      const url = request.url();
      if (ALLOWED_REQUEST.test(url)) {
        void request.continue();
      } else {
        deniedRequest ??= url;
        void request.abort("blockedbyclient");
      }
    });
    await page.setContent(settlePageHtml(layout), {
      waitUntil: "domcontentloaded",
    });
    const heights = await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(
        [...document.images].map((image) =>
          image.complete ? Promise.resolve() : image.decode(),
        ),
      );
      const measure = () =>
        Math.ceil(
          Math.max(
            document.body.scrollHeight,
            document.body.getBoundingClientRect().height,
          ),
        );
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const first = measure();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      return [first, measure()];
    });
    throwIfDeniedBrowserRequest(deniedRequest);
    const [first, second] = heights;
    if (
      first === undefined ||
      second === undefined ||
      first !== second ||
      !Number.isFinite(second) ||
      second <= 0 ||
      second > PNG_MAX_CSS_HEIGHT_PX
    ) {
      throw new Error("The XHTML layout did not settle to finite controlled geometry.");
    }
    return second;
  } finally {
    await context.close();
  }
}

async function captureContinuousScreenshot(
  browser: Browser,
  layout: HtmlLayout,
  widthCss: number,
  heightCss: number,
): Promise<Uint8Array> {
  const context = await browser.createBrowserContext();
  try {
    const page = await context.newPage();
    await page.setViewport({
      width: widthCss,
      height: heightCss,
      deviceScaleFactor: PNG_DEVICE_SCALE_FACTOR,
    });
    let deniedRequest: string | undefined;
    await page.setRequestInterception(true);
    page.on("request", (request: HTTPRequest) => {
      const url = request.url();
      if (ALLOWED_REQUEST.test(url)) {
        void request.continue();
      } else {
        deniedRequest ??= url;
        void request.abort("blockedbyclient");
      }
    });
    await page.setContent(settlePageHtml(layout), {
      waitUntil: "domcontentloaded",
    });
    const settled = await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(
        [...document.images].map((image) =>
          image.complete ? Promise.resolve() : image.decode(),
        ),
      );
      const measure = () =>
        Math.ceil(
          Math.max(
            document.body.scrollHeight,
            document.body.getBoundingClientRect().height,
          ),
        );
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const first = measure();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      return [first, measure()];
    });
    throwIfDeniedBrowserRequest(deniedRequest);
    const [first, second] = settled;
    if (first !== heightCss || second !== heightCss) {
      throw new Error("The XHTML layout did not settle to finite controlled geometry.");
    }
    const screenshot = await page.screenshot({
      type: "png",
      captureBeyondViewport: false,
    });
    return Uint8Array.from(screenshot);
  } finally {
    await context.close();
  }
}

export async function renderPng(
  layout: HtmlLayout,
  contentHash: ContentHash,
  theme: Theme,
  assetManifest: readonly AssetManifestEntry[],
  browserCapability: PngBrowserCapability,
): Promise<Artifact> {
  const widthCss = theme.geometry.canvasWidthPx;
  if (!Number.isInteger(widthCss) || widthCss <= 0) {
    throw new Error("The XHTML layout did not settle to finite controlled geometry.");
  }
  const browser = await browserCapability.launch();
  let raw: Uint8Array;
  let heightCss: number;
  try {
    heightCss = await measureSettledLayout(browser, layout, widthCss);
    const widthPx = widthCss * PNG_DEVICE_SCALE_FACTOR;
    const heightPx = heightCss * PNG_DEVICE_SCALE_FACTOR;
    if (
      widthPx > PNG_MAX_PIXEL_DIMENSION ||
      heightPx > PNG_MAX_PIXEL_DIMENSION ||
      widthPx * heightPx > PNG_MAX_PIXELS
    ) {
      throw new PngArtifactLimitError(widthPx * heightPx * 4);
    }
    raw = await captureContinuousScreenshot(browser, layout, widthCss, heightCss);
  } finally {
    await browser.close();
  }
  const bytes = normalizePng(raw);
  const widthPx = widthCss * PNG_DEVICE_SCALE_FACTOR;
  const heightPx = heightCss * PNG_DEVICE_SCALE_FACTOR;
  const rendererFingerprint = sha256(
    canonicalJson({
      renderer: {
        id: PNG_RENDERER_ID,
        version: PNG_RENDERER_VERSION,
        serializer: PNG_SERIALIZER,
      },
      profile: PNG_PROFILE,
      layoutEngine: `HeadlessChrome/${CHROME_HEADLESS_SHELL_VERSION}`,
      deviceScaleFactor: PNG_DEVICE_SCALE_FACTOR,
      platform: { os: platform(), architecture: arch() },
      requiredCapabilities: PNG_REQUIRED_CAPABILITIES,
      ...(layout.fingerprintDependencies as Readonly<Record<string, JsonValue>>),
    }),
  );
  return {
    bytes,
    metadata: {
      format: "png",
      mimeType: PNG_MIME_TYPE,
      profile: PNG_PROFILE,
      byteLength: bytes.byteLength,
      contentHash,
      assetManifestHash: assetManifestHash(assetManifest),
      rendererFingerprint,
      artifactHash: artifactBytesHash(bytes),
      theme: { id: theme.id, version: theme.version },
      cssDimensions: { ...theme.geometry },
      pixelDimensions: { width: widthPx, height: heightPx },
      requiredCapabilities: PNG_REQUIRED_CAPABILITIES,
    },
  };
}
