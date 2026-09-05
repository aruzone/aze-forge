import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  Browser as BrowserKind,
  computeExecutablePath,
} from "@puppeteer/browsers";
import puppeteer from "puppeteer-core";
import type { Browser, HTTPRequest, Page } from "puppeteer-core";

import { loadInterFontFaces } from "./font.js";
import type { Theme } from "./model.js";

export const CHROME_HEADLESS_SHELL_VERSION = "152.0.7977.75" as const;

const BROWSER_CACHE_DIRECTORY = join(homedir(), ".cache", "puppeteer");
const ALLOWED_REQUEST = /^(?:about:blank|data:font\/woff2;base64,)/;
const BROWSER_ARGS = Object.freeze([
  "--disable-background-networking",
  "--disable-breakpad",
  "--disable-component-update",
  "--disable-default-apps",
  "--disable-domain-reliability",
  "--disable-features=Translate,MediaRouter,OptimizationHints",
  "--disable-sync",
  "--font-render-hinting=none",
  "--metrics-recording-only",
  "--mute-audio",
  "--no-first-run",
]);

interface MermaidBrowserInput {
  readonly source: string;
  readonly elementId: string;
  readonly seed: string;
  readonly theme: Theme;
}

export interface MermaidBrowserOutput {
  readonly svg: string;
  readonly browserVersion: string;
  readonly requests: readonly string[];
}

export class MermaidBrowserUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MermaidBrowserUnavailableError";
  }
}

export class MermaidBrowserParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MermaidBrowserParseError";
  }
}

export class BrowserCapabilityError extends Error {
  readonly code = "AZE_CAPABILITY_DENIED";

  constructor(message: string) {
    super(message);
    this.name = "BrowserCapabilityError";
  }
}

export class MermaidCapabilityError extends BrowserCapabilityError {
  constructor(message: string) {
    super(message);
    this.name = "MermaidCapabilityError";
  }
}

export function throwIfDeniedBrowserRequest(
  deniedRequest: string | undefined,
): void {
  if (deniedRequest !== undefined) {
    throw new BrowserCapabilityError(
      `Layout requested an external resource: ${deniedRequest}`,
    );
  }
}

interface BrowserCapabilities {
  readonly resolveExecutable: () => string;
  readonly loadMermaidScript: () => Promise<string>;
  readonly loadFontCss: () => Promise<string>;
  readonly launch: (executablePath: string) => Promise<Browser>;
  readonly openPage: (browser: Browser) => Promise<{
    readonly page: Page;
    readonly close: () => Promise<void>;
  }>;
  readonly settleLayout: (page: Page, input: MermaidBrowserInput) => Promise<string>;
}

let mermaidScriptPromise: Promise<string> | undefined;
let fontCssPromise: Promise<string> | undefined;

function loadMermaidScript(): Promise<string> {
  mermaidScriptPromise ??= readFile(
    new URL(import.meta.resolve("mermaid/dist/mermaid.min.js")),
    "utf8",
  );
  return mermaidScriptPromise;
}

function loadFontCss(): Promise<string> {
  fontCssPromise ??= loadInterFontFaces().then((faces) =>
    faces
      .map(
        (face) =>
          `@font-face{font-family:Inter;font-style:normal;font-weight:${face.weight};font-display:block;src:url(data:font/woff2;base64,${face.data}) format("woff2");unicode-range:${face.unicodeRange}}`,
      )
      .join(""),
  );
  return fontCssPromise;
}

async function openIsolatedPage(browser: Browser): Promise<{
  readonly page: Page;
  readonly close: () => Promise<void>;
}> {
  const context = await browser.createBrowserContext();
  try {
    const page = await context.newPage();
    return {
      page,
      close: async () => {
        await context.close();
      },
    };
  } catch (error) {
    await context.close();
    throw error;
  }
}

async function renderAndSettle(
  page: Page,
  input: MermaidBrowserInput,
): Promise<string> {
  return page.evaluate(async (browserInput) => {
    interface MermaidGlobal {
      initialize(config: Record<string, unknown>): void;
      parse(source: string, options?: { suppressErrors?: boolean }): Promise<unknown>;
      render(
        id: string,
        source: string,
        container?: Element,
      ): Promise<{ svg: string }>;
    }

    // Well-known browser global: Mermaid UMD script installs window.mermaid.
    const browserGlobal = globalThis as unknown as Record<string, unknown>;
    const mermaid = browserGlobal["mermaid"] as MermaidGlobal | undefined;
    if (mermaid === undefined) throw new Error("Pinned Mermaid script did not load.");

    let state = Number.parseInt(browserInput.seed.slice(0, 8), 16) >>> 0;
    Math.random = () => {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return (state >>> 0) / 0x1_0000_0000;
    };
    Date.now = () => 0;

    const root = document.querySelector("#azeforge-mermaid-root");
    if (root === null) throw new Error("Mermaid render root is missing.");

    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      suppressErrorRendering: true,
      deterministicIds: true,
      deterministicIDSeed: browserInput.seed,
      htmlLabels: false,
      fontFamily: "Inter",
      theme: "base",
      themeVariables: {
        background: browserInput.theme.colors.background,
        primaryColor: browserInput.theme.colors.background,
        primaryTextColor: browserInput.theme.colors.foreground,
        primaryBorderColor: browserInput.theme.colors.foreground,
        lineColor: browserInput.theme.colors.muted,
        textColor: browserInput.theme.colors.foreground,
        fontFamily: "Inter",
      },
      flowchart: { htmlLabels: false },
    });

    try {
      await mermaid.parse(browserInput.source, { suppressErrors: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `AZE_MERMAID_PARSE_ERROR:${message}`;
    }

    const rendered = await mermaid.render(
      browserInput.elementId,
      browserInput.source,
      root,
    );
    root.innerHTML = rendered.svg;
    await document.fonts.ready;
    if (!document.fonts.check('16px "Inter"')) {
      throw new Error("Pinned Inter font did not become ready.");
    }

    const svg = root.querySelector("svg");
    if (svg === null) throw new Error("Mermaid produced no SVG root.");

    for (const foreignObject of [...svg.querySelectorAll("foreignObject")]) {
      const x = Number.parseFloat(foreignObject.getAttribute("x") ?? "");
      const y = Number.parseFloat(foreignObject.getAttribute("y") ?? "");
      const width = Number.parseFloat(foreignObject.getAttribute("width") ?? "");
      const height = Number.parseFloat(foreignObject.getAttribute("height") ?? "");
      const label = foreignObject.textContent?.trim() ?? "";
      if (
        ![x, y, width, height].every(Number.isFinite) ||
        width <= 0 ||
        height <= 0 ||
        label === ""
      ) {
        throw new Error("Mermaid produced an invalid HTML label.");
      }
      const sourceLabel = foreignObject.querySelector(".label") ?? foreignObject;
      const computed = getComputedStyle(sourceLabel);
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", String(x + width / 2));
      text.setAttribute("y", String(y + height / 2));
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("dominant-baseline", "central");
      text.setAttribute("fill", computed.color);
      text.setAttribute("font-family", "Inter");
      text.setAttribute("font-size", computed.fontSize);
      text.setAttribute("font-weight", computed.fontWeight);
      text.textContent = label;
      foreignObject.replaceWith(text);
    }

    const presentationProperties = [
      "fill",
      "fill-opacity",
      "fill-rule",
      "stroke",
      "stroke-width",
      "stroke-opacity",
      "stroke-dasharray",
      "stroke-dashoffset",
      "stroke-linecap",
      "stroke-linejoin",
      "opacity",
      "color",
      "flood-color",
      "flood-opacity",
      "font-family",
      "font-size",
      "font-style",
      "font-weight",
      "text-anchor",
      "dominant-baseline",
      "alignment-baseline",
      "paint-order",
      "shape-rendering",
      "visibility",
    ] as const;
    // Pass 1: snapshot computed presentation while Mermaid's selectors
    // still match. Mutating ancestors first (class removal below) would
    // otherwise break descendant selectors such as `.node rect`, and the
    // fallback inherited paint is visibly wrong (solid boxes, lost halos).
    const snapshot = new Map<Element, Record<string, string>>();
    for (const element of [svg, ...svg.querySelectorAll("*")]) {
      if (element.localName === "style") continue;
      const computed = getComputedStyle(element);
      const values: Record<string, string> = {};
      for (const property of presentationProperties) {
        const value = computed.getPropertyValue(property).trim();
        if (value !== "") values[property] = value;
      }
      snapshot.set(element, values);
    }
    // Pass 2: freeze the snapshot into attributes, then drop hooks.
    for (const [element, values] of snapshot) {
      for (const property of presentationProperties) {
        const value = values[property];
        if (value !== undefined) element.setAttribute(property, value);
      }
      for (const attribute of [...element.attributes]) {
        if (
          attribute.name === "class" ||
          attribute.name === "style" ||
          attribute.name === "name" ||
          attribute.name === "xmlns:xlink" ||
          attribute.name.startsWith("data-")
        ) {
          element.removeAttribute(attribute.name);
        }
      }
    }
    for (const style of [...svg.querySelectorAll("style")]) style.remove();
    svg.removeAttribute("width");
    svg.removeAttribute("height");

    const dimensions = () => {
      const viewBox = svg.viewBox.baseVal;
      const bounds = svg.getBoundingClientRect();
      return {
        viewBox: [viewBox.x, viewBox.y, viewBox.width, viewBox.height],
        bounds: [bounds.width, bounds.height],
      };
    };
    const first = dimensions();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const second = dimensions();
    if (JSON.stringify(first) !== JSON.stringify(second)) {
      throw new Error("Mermaid layout did not settle deterministically.");
    }
    const viewBoxWidth = first.viewBox[2] ?? Number.NaN;
    const viewBoxHeight = first.viewBox[3] ?? Number.NaN;
    const boundsWidth = first.bounds[0] ?? Number.NaN;
    const boundsHeight = first.bounds[1] ?? Number.NaN;
    if (
      [...first.viewBox, ...first.bounds].some(
        (value) => !Number.isFinite(value),
      ) ||
      viewBoxWidth <= 0 ||
      viewBoxHeight <= 0 ||
      boundsWidth <= 0 ||
      boundsHeight <= 0
    ) {
      throw new Error("Mermaid produced degenerate geometry.");
    }
    return svg.outerHTML;
  }, input);
}

const pinnedCapabilities: BrowserCapabilities = Object.freeze({
  resolveExecutable(): string {
    return computeExecutablePath({
      cacheDir: BROWSER_CACHE_DIRECTORY,
      browser: BrowserKind.CHROMEHEADLESSSHELL,
      buildId: CHROME_HEADLESS_SHELL_VERSION,
    });
  },
  loadMermaidScript,
  loadFontCss,
  async launch(executablePath: string): Promise<Browser> {
    return puppeteer.launch({
      executablePath,
      headless: "shell",
      args: [...BROWSER_ARGS],
      protocolTimeout: 15_000,
      timeout: 15_000,
    });
  },
  openPage: openIsolatedPage,
  settleLayout: renderAndSettle,
});

async function acquirePinnedBrowser(
  capabilities: BrowserCapabilities,
): Promise<{ readonly browser: Browser; readonly browserVersion: string }> {
  let browser: Browser;
  try {
    browser = await capabilities.launch(capabilities.resolveExecutable());
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new MermaidBrowserUnavailableError(
      `Pinned Chrome Headless Shell ${CHROME_HEADLESS_SHELL_VERSION} is unavailable. Reinstall AzeForge browser dependencies. ${detail}`,
    );
  }
  try {
    const browserVersion = await browser.version();
    if (browserVersion !== `HeadlessChrome/${CHROME_HEADLESS_SHELL_VERSION}`) {
      throw new MermaidBrowserUnavailableError(
        `Expected HeadlessChrome/${CHROME_HEADLESS_SHELL_VERSION}, received ${browserVersion}.`,
      );
    }
    return { browser, browserVersion };
  } catch (error) {
    await browser.close();
    if (error instanceof MermaidBrowserUnavailableError) throw error;
    const detail = error instanceof Error ? error.message : String(error);
    throw new MermaidBrowserUnavailableError(
      `Pinned Chrome Headless Shell ${CHROME_HEADLESS_SHELL_VERSION} could not be verified. Reinstall AzeForge browser dependencies. ${detail}`,
    );
  }
}

export async function launchPinnedBrowser(): Promise<Browser> {
  return (await acquirePinnedBrowser(pinnedCapabilities)).browser;
}

export async function renderMermaidInBrowser(
  input: MermaidBrowserInput,
  capabilities: BrowserCapabilities = pinnedCapabilities,
): Promise<MermaidBrowserOutput> {
  const { browser, browserVersion } = await acquirePinnedBrowser(capabilities);

  try {
    const isolated = await capabilities.openPage(browser);
    try {
      const requests: string[] = [];
      let deniedRequest: string | undefined;
      await isolated.page.setRequestInterception(true);
      isolated.page.on("request", (request: HTTPRequest) => {
        const url = request.url();
        requests.push(url);
        if (ALLOWED_REQUEST.test(url)) {
          void request.continue();
        } else {
          deniedRequest ??= url;
          void request.abort("blockedbyclient");
        }
      });
      const [script, fontCss] = await Promise.all([
        capabilities.loadMermaidScript(),
        capabilities.loadFontCss(),
      ]);
      await isolated.page.setContent(
        `<!doctype html><meta charset="utf-8"><style>${fontCss}*{animation:none!important;transition:none!important;caret-color:transparent!important}</style><main id="azeforge-mermaid-root"></main>`,
        { waitUntil: "domcontentloaded" },
      );
      await isolated.page.addScriptTag({ content: script });
      const svg = await capabilities.settleLayout(isolated.page, input);
      if (svg.startsWith("AZE_MERMAID_PARSE_ERROR:")) {
        throw new MermaidBrowserParseError(
          svg.slice("AZE_MERMAID_PARSE_ERROR:".length),
        );
      }
      if (deniedRequest !== undefined) {
        throw new MermaidCapabilityError(
          `Browser request was denied: ${deniedRequest}`,
        );
      }
      return Object.freeze({
        svg,
        browserVersion,
        requests: Object.freeze([...requests]),
      });
    } finally {
      await isolated.close();
    }
  } finally {
    await browser.close();
  }
}
