import { arch, platform } from "node:os";

import type { Browser, HTTPRequest } from "puppeteer-core";
import { calloutHtmlBlockRenderer } from "./callout.js";
import { derivationHtmlBlockRenderer } from "./derivation.js";
import { equationHtmlBlockRenderer } from "./equation.js";

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

export const PDF_RENDERER_ID = "pdf" as const;
export const PDF_RENDERER_VERSION = "1.0.0" as const;
export const PDF_MIME_TYPE = "application/pdf" as const;
export const PDF_PROFILE = "azeforge.pdf.paged/v1" as const;
export const PDF_SERIALIZER = "azeforge-pdf/v1" as const;
const PDF_PRODUCER = `AzeForge pdf/1.0.0 (HeadlessChrome/${CHROME_HEADLESS_SHELL_VERSION})` as const;
const PDF_CREATOR = "AzeForge" as const;
export const PDF_REQUIRED_CAPABILITIES = Object.freeze(["pdf-paged"] as const);
export const PDF_MAX_BYTES = 128 * 1024 * 1024;
export const PDF_MAX_PAGES = 200;
export const PDF_MAX_HTML_BYTES = 64 * 1024 * 1024;
export const PDF_PRINT_TIMEOUT_MS = 30_000;
const ALLOWED_REQUEST = /^(?:about:blank|data:(?:font\/woff2|image\/(?:png|jpeg|svg\+xml));base64,)/;
const ATOMIC_SELECTOR = ".aze-equation,.aze-mermaid,figure,img";
/**
 * Renderer temporary-storage budget. It is accounted statically, not
 * metered: settled HTML is capped at 64 MiB in and canonical PDF at
 * 128 MiB out before publication, so browser profile, decoded images,
 * and print spool stay an order of magnitude under budget by
 * construction. The caps below are the enforcement.
 */
export const PDF_MAX_TEMP_BYTES = 512 * 1024 * 1024;
/**
 * Interim floor for the §10 minimum-readable-graphic-label contract.
 * Atomic graphics shrink proportionally to fit the page, but never below
 * half their authored size: the Theme model carries no per-theme minimum
 * label size, so anything needing a smaller scale errors instead of
 * shrinking into unreadability.
 */
const PDF_MIN_ATOMIC_SCALE = 0.5;

function pdfBlockRenderer(renderer: AnyBlockRenderer): AnyBlockRenderer {
  return Object.freeze({
    descriptor: Object.freeze({
      ...renderer.descriptor,
      id: renderer.descriptor.id.replace(".html/", ".pdf/"),
      rendererId: PDF_RENDERER_ID,
    }),
    render: renderer.render,
  }) as AnyBlockRenderer;
}

export const pdfBlockRenderers: readonly AnyBlockRenderer[] = Object.freeze([
  pdfBlockRenderer(equationHtmlBlockRenderer),
  pdfBlockRenderer(derivationHtmlBlockRenderer),
  pdfBlockRenderer(calloutHtmlBlockRenderer),
  pdfBlockRenderer(mermaidHtmlBlockRenderer),
  pdfBlockRenderer(tableHtmlBlockRenderer),
]);

export interface PdfBrowserCapability {
  readonly launch: () => Promise<Browser>;
}

export const pinnedPdfBrowserCapability: PdfBrowserCapability = Object.freeze({
  launch: launchPinnedBrowser,
});

export const pdfRendererDescriptor: RendererDescriptor = Object.freeze({
  id: PDF_RENDERER_ID,
  version: PDF_RENDERER_VERSION,
  formats: Object.freeze(["pdf"] as const),
  capabilities: Object.freeze(["browser"] as const),
});

export class PdfArtifactLimitError extends Error {
  readonly byteLength: number;

  constructor(byteLength: number, detail?: string) {
    super(
      detail ??
        `PDF Artifact is ${byteLength} bytes; the limit is ${PDF_MAX_BYTES} bytes.`,
    );
    this.name = "PdfArtifactLimitError";
    this.byteLength = byteLength;
  }
}

export interface PdfPageGeometry {
  readonly widthPt: number;
  readonly heightPt: number;
  readonly marginPt: number;
  readonly pageCss: string;
}

const PT_PER_MM = 72 / 25.4;
const PX_PER_PT = 96 / 72;

function roundPt(value: number): number {
  return Math.round(value * 1000) / 1000;
}
export function pdfPageGeometryForTheme(theme: Theme): PdfPageGeometry {
  if (theme.id === "academic") {
    return {
      widthPt: roundPt(210 * PT_PER_MM),
      heightPt: roundPt(297 * PT_PER_MM),
      marginPt: roundPt(22 * PT_PER_MM),
      pageCss: "size:A4;margin:22mm",
    };
  }
  if (theme.id === "dark-presentation") {
    return {
      widthPt: roundPt(13.333 * 72),
      heightPt: roundPt(7.5 * 72),
      marginPt: roundPt(0.5 * 72),
      pageCss: "size:13.333in 7.5in;margin:0.5in",
    };
  }
  return {
    widthPt: roundPt(210 * PT_PER_MM),
    heightPt: roundPt(297 * PT_PER_MM),
    marginPt: roundPt(18 * PT_PER_MM),
    pageCss: "size:A4;margin:18mm",
  };
}

function pdfContentHeightCssPx(geometry: PdfPageGeometry): number {
  return (geometry.heightPt - geometry.marginPt * 2) * PX_PER_PT;
}

/**
 * Paged print CSS layered over the shared continuous layout CSS. Normal
 * document flow owns pagination: headings stay with following content,
 * prose observes widows/orphans, table headers repeat with row splits,
 * fenced code splits between visual lines, equations/diagrams/images stay
 * atomic, long callouts split between children, and dark-presentation
 * level-one headings start new sections.
 */
export function pdfPagedCss(theme: Theme): string {
  const geometry = pdfPageGeometryForTheme(theme);
  const sectionBreak =
    theme.id === "dark-presentation"
      ? "article>h1:not(:first-child){break-before:page}"
      : "";
  return (
    `@page{${geometry.pageCss}}` +
    "html,body,main,article{print-color-adjust:exact;-webkit-print-color-adjust:exact}" +
    "h1,h2,h3,h4,h5,h6{break-after:avoid;break-inside:avoid}" +
    "p,li{orphans:3;widows:3}" +
    "thead{display:table-header-group}tr{break-inside:avoid}" +
    "pre{break-inside:auto}" +
    ".aze-equation,.aze-mermaid,figure,img{break-inside:avoid}" +
    ".aze-callout{break-inside:auto}" +
    sectionBreak
  );
}

function pdfLiteral(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function pdfHexText(value: string): string {
  const little = Buffer.from(value, "utf16le");
  const big = Buffer.alloc(little.length + 2);
  big[0] = 0xfe;
  big[1] = 0xff;
  for (let index = 0; index < little.length; index += 2) {
    big[index + 2] = little[index + 1] as number;
    big[index + 3] = little[index] as number;
  }
  return big.toString("hex").toUpperCase();
}

interface PdfObject {
  readonly num: number;
  readonly gen: number;
  readonly raw: string;
}

const PDF_WHITESPACE = new Set(["\0", "\t", "\n", "\f", "\r", " "]);

function skipPdfWhitespace(text: string, position: number): number {
  while (position < text.length && PDF_WHITESPACE.has(text[position] as string)) {
    position += 1;
  }
  return position;
}

function splitPdfObjects(text: string, xrefOffset: number): PdfObject[] {
  const objects: PdfObject[] = [];
  const first = /(\d+) (\d+) obj/.exec(text);
  if (first === null || first.index === undefined) {
    throw new Error("The PDF has no indirect objects.");
  }
  let position = first.index;
  while (position < xrefOffset) {
    position = skipPdfWhitespace(text, position);
    if (position >= xrefOffset) break;
    const header = /(\d+) (\d+) obj/.exec(text.slice(position, position + 32));
    if (header === null || header[1] === undefined || header[2] === undefined) {
      throw new Error("The PDF object numbering is not deterministic.");
    }
    const num = Number(header[1]);
    const gen = Number(header[2]);
    const dictStart = position + header[0].length;
    const window = text.slice(dictStart, Math.min(dictStart + 65536, xrefOffset));
    const streamIndex = (() => {
      const match = /stream(?:\r\n|\n|\r)/.exec(window);
      return match?.index;
    })();
    const endIndex = window.indexOf("endobj");
    if (streamIndex !== undefined && (endIndex === -1 || streamIndex < endIndex)) {
      const lengthMatch = /\/Length\s+(\d+)/.exec(window.slice(0, streamIndex));
      const streamEol = /stream(?:\r\n|\n|\r)/.exec(window.slice(streamIndex))?.[0];
      if (lengthMatch?.[1] !== undefined && streamEol !== undefined) {
        const dataStart = dictStart + streamIndex + streamEol.length;
        const dataEnd = dataStart + Number(lengthMatch[1]);
        const tail = text.slice(dataEnd, dataEnd + 16);
        const endMatch = /(?:\r\n|\n|\r)?endstream/.exec(tail);
        if (endMatch !== null && endMatch.index !== undefined) {
          const endObjAt = text.indexOf("endobj", dataEnd + endMatch.index);
          if (endObjAt !== -1 && endObjAt < xrefOffset) {
            objects.push({ num, gen, raw: text.slice(position, endObjAt + 6) });
            position = endObjAt + 6;
            continue;
          }
        }
      }
      throw new Error("The PDF object stream could not be parsed deterministically.");
    }
    if (endIndex === -1) {
      throw new Error("The PDF object stream could not be parsed deterministically.");
    }
    const endObjAt = dictStart + endIndex;
    objects.push({ num, gen, raw: text.slice(position, endObjAt + 6) });
    position = endObjAt + 6;
  }
  return objects;
}

export interface PdfCanonicalIdentity {
  readonly title: string;
  readonly authors: readonly string[];
  readonly documentId: string;
}

export interface CanonicalPdf {
  readonly bytes: Uint8Array;
  readonly pageCount: number;
  readonly pageWidthPt: number;
  readonly pageHeightPt: number;
}

/**
 * Deterministic PDF post-processing over pinned-browser bytes. Chromium
 * leaves only wall-clock CreationDate/ModDate nondeterministic; this
 * rebuilds the Info dictionary without dates, pins versioned
 * producer/creator plus semantic title/authors, derives the trailer
 * document ID from the full render identity, strips XMP metadata the P0
 * profile does not claim, and rebuilds the cross-reference table so
 * identical renders hash identically.
 * Blink also emits per-session structure-tree element IDs (`/ID (node…)`);
 * these are replaced with deterministic per-object IDs so identical renders
 * hash identically.
 */
function isPdfDocumentId(value: string): boolean {
  return /^[0-9a-f]{32}$/.test(value);
}
export function canonicalizePdf(
  raw: Uint8Array,
  identity: PdfCanonicalIdentity,
): CanonicalPdf {
  if (!isPdfDocumentId(identity.documentId)) {
    throw new Error("The PDF document ID must be 32 lowercase hex characters.");
  }
  if (raw.byteLength > PDF_MAX_BYTES) {
    throw new PdfArtifactLimitError(raw.byteLength);
  }
  const text = Buffer.from(raw).toString("latin1");
  if (!text.startsWith("%PDF-")) {
    throw new Error("The PDF header is invalid.");
  }
  const startxrefAt = text.lastIndexOf("startxref");
  if (startxrefAt === -1) {
    throw new Error("The PDF is missing its cross-reference offset.");
  }
  const xrefOffset = Number.parseInt(text.slice(startxrefAt + 9), 10);
  if (!Number.isInteger(xrefOffset) || xrefOffset <= 0 || xrefOffset >= raw.byteLength) {
    throw new Error("The PDF cross-reference offset is invalid.");
  }
  const trailerMatch = /trailer([\s\S]*?)startxref/.exec(text.slice(xrefOffset, startxrefAt + 32));
  if (trailerMatch?.[1] === undefined) {
    throw new Error("The PDF is missing its trailer dictionary.");
  }
  const trailer = trailerMatch[1];
  const sizeMatch = /\/Size\s+(\d+)/.exec(trailer);
  const rootMatch = /\/Root\s+(\d+) (\d+) R/.exec(trailer);
  const infoMatch = /\/Info\s+(\d+) (\d+) R/.exec(trailer);
  if (
    sizeMatch?.[1] === undefined ||
    rootMatch?.[1] === undefined ||
    rootMatch?.[2] === undefined ||
    infoMatch?.[1] === undefined ||
    infoMatch?.[2] === undefined
  ) {
    throw new Error("The PDF trailer must reference its Size, Root, and Info.");
  }
  const size = Number(sizeMatch[1]);
  const rootNum = Number(rootMatch[1]);
  const rootGen = Number(rootMatch[2]);
  const infoNum = Number(infoMatch[1]);
  const infoGen = Number(infoMatch[2]);

  const pageMatch = /\/Type\s*\/Pages\b[\s\S]{0,500}?\/Count\s+(\d+)/.exec(text);
  if (pageMatch?.[1] === undefined) {
    throw new Error("The PDF page tree is missing its page count.");
  }
  const pageCount = Number(pageMatch[1]);
  if (!Number.isInteger(pageCount) || pageCount < 1) {
    throw new Error("The PDF page count is invalid.");
  }
  if (pageCount > PDF_MAX_PAGES) {
    throw new PdfArtifactLimitError(
      raw.byteLength,
      `PDF Artifact has ${pageCount} pages; the limit is ${PDF_MAX_PAGES} pages.`,
    );
  }

  const objects = splitPdfObjects(text, xrefOffset);
  const byNumber = new Map(objects.map((object) => [object.num, object]));
  if (!byNumber.has(infoNum)) {
    throw new Error("The PDF is missing its document Info dictionary.");
  }
  const rootObject = byNumber.get(rootNum);
  if (rootObject === undefined) {
    throw new Error("The PDF is missing its document catalog.");
  }
  let catalog = rootObject.raw;
  const metadataMatch = /\/Metadata\s+(\d+) (\d+) R/.exec(catalog);
  const droppedMetadata = metadataMatch?.[1] === undefined ? undefined : Number(metadataMatch[1]);
  if (droppedMetadata !== undefined) {
    catalog = catalog.replace(/\s*\/Metadata\s+\d+ \d+ R/, "");
  }

  const authorEntry =
    identity.authors.length === 0
      ? ""
      : `\n/Author <${pdfHexText(identity.authors.join(", "))}>`;
  const infoRaw =
    `${infoNum} ${infoGen} obj\n<</Title <${pdfHexText(identity.title)}>${authorEntry}` +
    `\n/Creator (${pdfLiteral(PDF_CREATOR)})\n/Producer (${pdfLiteral(PDF_PRODUCER)})>>\nendobj`;

  const headerEnd = text.indexOf(`${objects[0]?.num} ${objects[0]?.gen} obj`);
  const header = text.slice(0, headerEnd);
  const chunks: string[] = [header];
  const offsets = new Map<number, number>();
  let position = header.length;
  const emit = (num: number, rawObject: string): void => {
    offsets.set(num, position);
    const chunk = `${rawObject}\n`;
    chunks.push(chunk);
    position += chunk.length;
  };
  // Blink numbers structure-tree element IDs per browser session, and
  // references them not only inside StructElem definitions but also in the
  // external structure tree (/ParentTree /Nums, /Names, /Limits). Map each
  // session-local node token to its defining object number so every
  // occurrence — definitions and references alike — rewrites to the same
  // deterministic ID.
  const structIdByNode = new Map<string, number>();
  for (const object of objects) {
    for (const match of object.raw.matchAll(/\/ID \(node(\d+)\)/g)) {
      structIdByNode.set(match[1] as string, object.num);
    }
  }
  const rewriteNodeTokens = (raw: string): string => {
    if (!raw.includes("(node")) return raw;
    return raw.replace(/\(node(\d+)\)/g, (_, digits: string) => {
      const defining = structIdByNode.get(digits);
      return `(azeforge-struct-${defining ?? digits})`;
    });
  };
  // Blink emits the structure NameTree /Names and /Limits entries in
  // run-dependent map order. Sort both arrays by the rewritten deterministic
  // token so identical renders hash identically.
  const sortStructNameTree = (raw: string): string => {
    if (!raw.includes("azeforge-struct-")) return raw;
    let next = raw;
    const names = /\/Names\s*\[([^\]]*)\]/.exec(next);
    if (names?.[1] !== undefined) {
      const pairs = [...names[1].matchAll(/\((azeforge-struct-\d+)\)\s+(\d+) (\d+) R/g)]
        .map((match) => ({
          id: Number.parseInt(match[1]?.slice("azeforge-struct-".length) ?? "", 10),
          text: match[0] ?? "",
        }))
        .sort((a, b) => a.id - b.id);
      next = next.replace(names[0], `/Names [${pairs.map((entry) => entry.text).join(" ")}]`);
      if (pairs.length > 0) {
        const first = pairs[0]?.id ?? 0;
        const last = pairs[pairs.length - 1]?.id ?? first;
        const limits = /\/Limits\s*\[[^\]]*\]/.exec(next);
        if (limits !== null) {
          next = next.replace(
            limits[0],
            `/Limits [(azeforge-struct-${first}) (azeforge-struct-${last})]`,
          );
        }
      }
      return next;
    }
    return next;
  };
  for (const object of objects) {
    if (object.num === droppedMetadata) continue;
    if (object.num === infoNum) {
      emit(object.num, infoRaw);
    } else if (object.num === rootNum) {
      emit(object.num, catalog);
    } else {
      emit(object.num, sortStructNameTree(rewriteNodeTokens(object.raw)));
    }
  }
  const xrefAt = position;
  let xref = `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (let num = 1; num < size; num += 1) {
    const offset = offsets.get(num);
    xref +=
      offset === undefined
        ? "0000000000 00000 f \n"
        : `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  const trailerOut =
    `trailer\n<</Size ${size}\n/Root ${rootNum} ${rootGen} R` +
    `\n/Info ${infoNum} ${infoGen} R\n/ID [<${identity.documentId}><${identity.documentId}>]>>\n` +
    `startxref\n${xrefAt}\n%%EOF\n`;
  const out = `${chunks.join("")}${xref}${trailerOut}`;
  const bytes = Uint8Array.from(Buffer.from(out, "latin1"));
  if (bytes.byteLength > PDF_MAX_BYTES) {
    throw new PdfArtifactLimitError(bytes.byteLength);
  }
  const boxMatch = /\/MediaBox\s*\[\s*(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s*\]/.exec(text);
  if (boxMatch?.[1] === undefined || boxMatch?.[2] === undefined || boxMatch?.[3] === undefined || boxMatch?.[4] === undefined) {
    throw new Error("The PDF pages are missing their media boxes.");
  }
  const pageWidthPt = roundPt(Number(boxMatch[3]) - Number(boxMatch[1]));
  const pageHeightPt = roundPt(Number(boxMatch[4]) - Number(boxMatch[2]));
  if (!Number.isFinite(pageWidthPt) || !Number.isFinite(pageHeightPt) || pageWidthPt <= 0 || pageHeightPt <= 0) {
    throw new Error("The PDF media box is invalid.");
  }
  return { bytes, pageCount, pageWidthPt, pageHeightPt };
}

function settlePagedHtml(layout: HtmlLayout, theme: Theme): string {
  return (
    `<!doctype html><html lang="und"><head><meta charset="utf-8"><title>${layout.title}</title>` +
    `<style>${layout.css}${pdfPagedCss(theme)}*{animation:none!important;transition:none!important;caret-color:transparent!important}</style></head>` +
    `<body>${layout.body}</body></html>`
  );
}

async function printPagedPdf(
  browser: Browser,
  html: string,
  geometry: PdfPageGeometry,
  contentHeightPx: number,
): Promise<Uint8Array> {
  const context = await browser.createBrowserContext();
  try {
    const page = await context.newPage();
    await page.setViewport({
      width: Math.ceil(geometry.widthPt * PX_PER_PT),
      height: Math.ceil(geometry.heightPt * PX_PER_PT),
      deviceScaleFactor: 1,
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
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    const overflow = await page.evaluate(
      async (input: { limit: number; selector: string; floor: number }) => {
        await document.fonts.ready;
        await Promise.all(
          [...document.images].map((image) =>
            image.complete ? Promise.resolve() : image.decode(),
          ),
        );
        const settle = async (): Promise<void> => {
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        };
        const measure = (): number[] => {
          const tallest: number[] = [];
          for (const element of document.querySelectorAll(input.selector)) {
            const box = element.getBoundingClientRect();
            if (Number.isFinite(box.height) && box.height > input.limit) {
              const scale = Math.floor((input.limit / box.height) * 1000) / 1000;
              if (scale >= input.floor) {
                (element as HTMLElement).style.setProperty("zoom", String(scale));
              } else {
                tallest.push(Math.round(box.height));
              }
            }
          }
          return tallest;
        };
        await settle();
        const refused = measure();
        if (refused.length === 0) {
          await settle();
          return measure();
        }
        return refused;
      },
      { limit: contentHeightPx, selector: ATOMIC_SELECTOR, floor: PDF_MIN_ATOMIC_SCALE },
    );
    throwIfDeniedBrowserRequest(deniedRequest);
    if (overflow.length > 0) {
      throw new PdfArtifactLimitError(
        Buffer.byteLength(html, "utf8"),
        `Atomic PDF content is ${Math.max(...overflow)}px tall at the minimum readable scale; the page content box is ${Math.floor(contentHeightPx)}px tall. Split or shrink the atomic content.`,
      );
    }
    const pdf = await page.pdf({
      preferCSSPageSize: true,
      printBackground: true,
      tagged: false,
      outline: true,
      timeout: PDF_PRINT_TIMEOUT_MS,
      waitForFonts: true,
    });
    return Uint8Array.from(pdf);
  } finally {
    await context.close();
  }
}

export interface PdfDocumentInfo {
  readonly title: string;
  readonly authors: readonly string[];
}

export async function renderPdf(
  layout: HtmlLayout,
  contentHash: ContentHash,
  theme: Theme,
  assetManifest: readonly AssetManifestEntry[],
  browserCapability: PdfBrowserCapability,
  info: PdfDocumentInfo,
): Promise<Artifact> {
  const geometry = pdfPageGeometryForTheme(theme);
  const html = settlePagedHtml(layout, theme);
  const htmlBytes = new TextEncoder().encode(html);
  if (htmlBytes.byteLength > PDF_MAX_HTML_BYTES) {
    throw new PdfArtifactLimitError(htmlBytes.byteLength);
  }
  const browser = await browserCapability.launch();
  let raw: Uint8Array;
  try {
    raw = await printPagedPdf(browser, html, geometry, pdfContentHeightCssPx(geometry));
  } finally {
    await browser.close();
  }
  const rendererFingerprint = sha256(
    canonicalJson({
      renderer: {
        id: PDF_RENDERER_ID,
        version: PDF_RENDERER_VERSION,
        serializer: PDF_SERIALIZER,
      },
      profile: PDF_PROFILE,
      layoutEngine: `HeadlessChrome/${CHROME_HEADLESS_SHELL_VERSION}`,
      platform: { os: platform(), architecture: arch() },
      requiredCapabilities: PDF_REQUIRED_CAPABILITIES,
      pageGeometry: {
        widthPt: geometry.widthPt,
        heightPt: geometry.heightPt,
        marginPt: geometry.marginPt,
      },
      ...(layout.fingerprintDependencies as Readonly<Record<string, JsonValue>>),
    }),
  );
  const identityHash = sha256(
    canonicalJson({
      contentHash,
      assetManifestHash: assetManifestHash(assetManifest),
      rendererFingerprint,
      title: info.title,
      authors: [...info.authors],
    }),
  );
  const hex = identityHash.slice("sha256:".length);
  const documentId = hex.slice(0, 32);
  if (!isPdfDocumentId(documentId)) {
    throw new Error("The PDF document identity is invalid.");
  }
  const { bytes, pageCount, pageWidthPt, pageHeightPt } = canonicalizePdf(raw, {
    title: info.title,
    authors: info.authors,
    documentId,
  });
  const pageGeometry = {
    widthPt: pageWidthPt,
    heightPt: pageHeightPt,
    marginPt: geometry.marginPt,
  };
  return {
    bytes,
    metadata: {
      format: "pdf",
      mimeType: PDF_MIME_TYPE,
      profile: PDF_PROFILE,
      byteLength: bytes.byteLength,
      contentHash,
      assetManifestHash: assetManifestHash(assetManifest),
      rendererFingerprint,
      artifactHash: artifactBytesHash(bytes),
      theme: { id: theme.id, version: theme.version },
      cssDimensions: { ...theme.geometry },
      pageCount,
      pageGeometry,
      requiredCapabilities: PDF_REQUIRED_CAPABILITIES,
    },
  };
}
