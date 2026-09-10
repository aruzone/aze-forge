import { arch, platform } from "node:os";

import { SaxesParser } from "saxes";
import type { Browser, HTTPRequest } from "puppeteer-core";
import { calloutHtmlBlockRenderer } from "./callout.js";
import { derivationHtmlBlockRenderer } from "./derivation.js";
import { equationHtmlBlockRenderer } from "./equation.js";
import { chartHtmlBlockRenderer, plotHtmlBlockRenderer } from "./plot.js";

import { assetManifestHash } from "./assets.js";
import { artifactBytesHash, canonicalJson, sha256 } from "./hash.js";
import { escapeHtml } from "./html-fragment.js";
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

export const SVG_RENDERER_ID = "svg" as const;
export const SVG_RENDERER_VERSION = "1.0.0" as const;
export const SVG_MIME_TYPE = "image/svg+xml" as const;
export const SVG_PROFILE = "azeforge.svg.foreign-object/v1" as const;
export const SVG_SERIALIZER = "azeforge-svg/v1" as const;
export const SVG_MAX_BYTES = 64 * 1024 * 1024;
export const SVG_MAX_HEIGHT_PX = 100_000;
export const SVG_REQUIRED_CAPABILITIES = Object.freeze([
  "svg2",
  "xhtml-foreign-object",
] as const);
const ALLOWED_REQUEST = /^(?:about:blank|data:(?:font\/woff2|image\/(?:png|jpeg|svg\+xml));base64,)/;
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const XHTML_NAMESPACE = "http://www.w3.org/1999/xhtml";

function svgBlockRenderer(renderer: AnyBlockRenderer): AnyBlockRenderer {
  return Object.freeze({
    descriptor: Object.freeze({
      ...renderer.descriptor,
      id: renderer.descriptor.id.replace(".html/", ".svg/"),
      rendererId: SVG_RENDERER_ID,
    }),
    render: renderer.render,
  }) as AnyBlockRenderer;
}

export const svgBlockRenderers: readonly AnyBlockRenderer[] = Object.freeze([
  svgBlockRenderer(equationHtmlBlockRenderer),
  svgBlockRenderer(derivationHtmlBlockRenderer),
  svgBlockRenderer(calloutHtmlBlockRenderer),
  svgBlockRenderer(mermaidHtmlBlockRenderer),
  svgBlockRenderer(tableHtmlBlockRenderer),
  svgBlockRenderer(plotHtmlBlockRenderer),
  svgBlockRenderer(chartHtmlBlockRenderer),
]);

export interface SvgBrowserCapability {
  readonly launch: () => Promise<Browser>;
}

export const pinnedSvgBrowserCapability: SvgBrowserCapability = Object.freeze({
  launch: launchPinnedBrowser,
});

export const svgRendererDescriptor: RendererDescriptor = Object.freeze({
  id: SVG_RENDERER_ID,
  version: SVG_RENDERER_VERSION,
  formats: Object.freeze(["svg"] as const),
  capabilities: Object.freeze(["browser"] as const),
});

export class SvgArtifactLimitError extends Error {
  readonly byteLength: number;

  constructor(byteLength: number) {
    super(`SVG Artifact is ${byteLength} bytes; the limit is ${SVG_MAX_BYTES} bytes.`);
    this.name = "SvgArtifactLimitError";
    this.byteLength = byteLength;
  }
}

function canonicalXhtmlBody(body: string): string {
  const canonical = body.replace(/<(br|hr|img)([^>]*)>/gi, "<$1$2 />");
  const failures: string[] = [];
  const parser = new SaxesParser({ xmlns: true, position: false });
  parser.on("error", (error) => failures.push(error.message));
  parser.on("opentag", (tag) => {
    const name = tag.local.toLowerCase();
    if (
      name === "script" ||
      name === "iframe" ||
      name === "object" ||
      name === "embed" ||
      name === "foreignobject"
    ) {
      failures.push(`Forbidden XHTML element: ${name}.`);
    }
    for (const attribute of Object.values(tag.attributes)) {
      const attributeName = attribute.local.toLowerCase();
      if (attributeName.startsWith("on")) {
        failures.push(`Executable XHTML attribute: ${attributeName}.`);
      }
      if (
        attributeName === "src" &&
        !/^data:image\/(?:png|jpeg|svg\+xml);base64,/.test(attribute.value)
      ) {
        failures.push(`External XHTML resource: ${attribute.value}.`);
      }
    }
  });
  parser.write(`<body xmlns="http://www.w3.org/1999/xhtml">${canonical}</body>`).close();
  if (failures.length > 0) {
    throw new Error(failures[0] ?? "The XHTML layout is invalid.");
  }
  return canonical;
}

export function sanitizeWholeDocumentSvg(svg: string): string {
  const failures: string[] = [];
  const stack: string[] = [];
  let foreignObjects = 0;
  let rootElements = 0;
  const parser = new SaxesParser({ xmlns: true, position: false });
  parser.on("error", (error) => failures.push(error.message));
  parser.on("opentag", (tag) => {
    const name = tag.local.toLowerCase();
    const depth = stack.length;
    if (depth === 0) {
      rootElements += 1;
      if (name !== "svg") failures.push("The Artifact root must be SVG.");
    }
    if (name === "foreignobject") {
      foreignObjects += 1;
      if (depth !== 1 || stack[0] !== "svg") {
        failures.push("Only the Renderer-owned root foreignObject is permitted.");
      }
    }
    if (name === "script" || name === "iframe" || name === "object" || name === "embed") {
      failures.push(`Forbidden Artifact element: ${name}.`);
    }
    for (const attribute of Object.values(tag.attributes)) {
      const attributeName = attribute.local.toLowerCase();
      if (attributeName.startsWith("on")) {
        failures.push(`Executable Artifact attribute: ${attributeName}.`);
      }
      if (
        attributeName === "src" &&
        !/^data:image\/(?:png|jpeg|svg\+xml);base64,/.test(attribute.value)
      ) {
        failures.push(`External Artifact resource: ${attribute.value}.`);
      }
      const readerLink =
        tag.uri === XHTML_NAMESPACE && name === "a" && attributeName === "href";
      const namespaceDeclaration =
        attribute.name === "xmlns" || attribute.prefix === "xmlns";
      if (
        (tag.uri === SVG_NAMESPACE && attributeName === "href") ||
        (!readerLink &&
          !namespaceDeclaration &&
          /^(?:https?:|file:|ftp:|javascript:|vbscript:|data:text\/html)/i.test(
            attribute.value,
          ))
      ) {
        failures.push(`Forbidden Artifact reference: ${attribute.value}.`);
      }
    }
    stack.push(name);
  });
  parser.on("closetag", () => {
    stack.pop();
  });
  parser.write(svg).close();
  if (rootElements !== 1 || foreignObjects !== 1) {
    failures.push("The Artifact must contain exactly one root foreignObject.");
  }
  if (failures.length > 0) {
    throw new Error(failures[0] ?? "The whole-Document SVG is invalid.");
  }
  return svg;
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
    await page.setContent(
      `<!doctype html><html lang="und"><head><meta charset="utf-8"><style>${layout.css}*{animation:none!important;transition:none!important;caret-color:transparent!important}</style></head><body>${layout.body}</body></html>`,
      { waitUntil: "domcontentloaded" },
    );
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
      second > SVG_MAX_HEIGHT_PX
    ) {
      throw new Error("The XHTML layout did not settle to finite controlled geometry.");
    }
    return second;
  } finally {
    await context.close();
  }
}

export async function renderSvg(
  layout: HtmlLayout,
  contentHash: ContentHash,
  theme: Theme,
  assetManifest: readonly AssetManifestEntry[],
  browserCapability: SvgBrowserCapability,
): Promise<Artifact> {
  const width = theme.geometry.canvasWidthPx;
  const browser = await browserCapability.launch();
  let height: number;
  try {
    height = await measureSettledLayout(browser, layout, width);
  } finally {
    await browser.close();
  }
  const rendererFingerprint = sha256(
    canonicalJson({
      renderer: {
        id: SVG_RENDERER_ID,
        version: SVG_RENDERER_VERSION,
        serializer: SVG_SERIALIZER,
      },
      profile: SVG_PROFILE,
      layoutEngine: `HeadlessChrome/${CHROME_HEADLESS_SHELL_VERSION}`,
      platform: { os: platform(), architecture: arch() },
      sanitizer: {
        wholeDocument: SVG_PROFILE,
        nestedSvg: "azeforge-mermaid-svg/v2",
      },
      requiredCapabilities: SVG_REQUIRED_CAPABILITIES,
      ...(layout.fingerprintDependencies as Readonly<Record<string, JsonValue>>),
    }),
  );
  const embeddedMetadata = escapeHtml(
    canonicalJson({
      contentHash,
      profile: SVG_PROFILE,
      requiredCapabilities: SVG_REQUIRED_CAPABILITIES,
    }),
  );
  const xhtmlBody = canonicalXhtmlBody(layout.body);
  const svg = sanitizeWholeDocumentSvg(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="azeforge:svg:title azeforge:svg:desc"><title id="azeforge:svg:title">${layout.title}</title><desc id="azeforge:svg:desc">${layout.description}</desc><metadata id="azeforge:svg:metadata">${embeddedMetadata}</metadata><foreignObject x="0" y="0" width="${width}" height="${height}"><html xmlns="http://www.w3.org/1999/xhtml" lang="und"><head><meta charset="utf-8" /><style>${escapeHtml(layout.css)}</style></head><body>${xhtmlBody}</body></html></foreignObject></svg>\n`,
  );
  const bytes = new TextEncoder().encode(svg);
  if (bytes.byteLength > SVG_MAX_BYTES) {
    throw new SvgArtifactLimitError(bytes.byteLength);
  }
  return {
    bytes,
    metadata: {
      format: "svg",
      mimeType: SVG_MIME_TYPE,
      profile: SVG_PROFILE,
      byteLength: bytes.byteLength,
      contentHash,
      assetManifestHash: assetManifestHash(assetManifest),
      rendererFingerprint,
      artifactHash: artifactBytesHash(bytes),
      theme: { id: theme.id, version: theme.version },
      cssDimensions: { ...theme.geometry },
      pixelDimensions: { width, height },
      requiredCapabilities: SVG_REQUIRED_CAPABILITIES,
    },
  };
}

