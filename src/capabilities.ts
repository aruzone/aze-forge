import { access, constants as fsConstants } from "node:fs/promises";

import { CAPABILITIES_SCHEMA_ID, CAPABILITIES_SCHEMA_VERSION } from "./capabilities-json.js";
import { DEFAULT_DIAGNOSTIC_LIMITS } from "./diagnostics.js";
import {
  MAX_EQUATION_SOURCE_LENGTH,
  MAX_EQUATION_TEX_LENGTH,
  KATEX_VERSION,
  EQUATION_LATEX_LANGUAGE_VERSION,
} from "./equation.js";
import {
  MAX_MERMAID_SOURCE_LENGTH,
  MAX_MERMAID_TEXT_LENGTH,
  MERMAID_VERSION,
} from "./mermaid.js";
import {
  CHROME_HEADLESS_SHELL_VERSION,
  resolvePinnedBrowserExecutable,
} from "./mermaid-browser.js";
import type { ArtifactFormat } from "./model.js";
import { MAX_NESTING_DEPTH } from "./parse.js";
import { getBuiltInRegistry, validateRegistry } from "./registry.js";
import {
  HTML_MAX_BYTES,
  HTML_MIME_TYPE,
  HTML_PROFILE,
  HTML_SERIALIZER,
} from "./render-html.js";
import {
  PDF_MAX_BYTES,
  PDF_MAX_HTML_BYTES,
  PDF_MAX_PAGES,
  PDF_MAX_TEMP_BYTES,
  PDF_MIME_TYPE,
  PDF_PROFILE,
  PDF_SERIALIZER,
} from "./render-pdf.js";
import {
  PNG_MAX_BYTES,
  PNG_MAX_CSS_HEIGHT_PX,
  PNG_MAX_PIXEL_DIMENSION,
  PNG_MAX_PIXELS,
  PNG_DEVICE_SCALE_FACTOR,
  PNG_MIME_TYPE,
  PNG_PROFILE,
  PNG_SERIALIZER,
} from "./render-png.js";
import {
  SVG_MAX_BYTES,
  SVG_MAX_HEIGHT_PX,
  SVG_MIME_TYPE,
  SVG_PROFILE,
  SVG_SERIALIZER,
} from "./render-svg.js";
import { MAX_IMAGE_BYTES, MAX_IMAGE_DIMENSION_PX, MAX_IMAGE_PIXELS } from "./assets.js";
import { builtInThemes } from "./theme.js";
import { DEFAULT_RENDER_TIMEOUT_MS } from "./compiler.js";
import { TOOL_VERSION } from "./tool-version.js";
import { publicSchemaVersions, type VersionedSchema } from "./version.js";
import { RUNTIME_SUPPORT, type RuntimeSupport } from "./runtime-support.js";

export type EngineAvailability = "unknown" | "available" | "unavailable";

export interface CommandEntry {
  readonly name: string;
  readonly summary: string;
  readonly usage: string;
}

/** Seven P0 commands in canonical blueprint order. */
export const CAPABILITY_COMMANDS: readonly CommandEntry[] = Object.freeze([
  {
    name: "render",
    summary: "Compile Source into one deterministic Artifact.",
    usage:
      "azeforge render <source> (--output <artifact> | --stdout --format <format>) [--format <format>] [--theme <theme>] [--allow-raw-latex] [--diagnostics json]",
  },
  {
    name: "validate",
    summary: "Check Source without writing an Artifact.",
    usage: "azeforge validate <source> [--allow-raw-latex] [--diagnostics json]",
  },
  {
    name: "watch",
    summary: "Rebuild one Artifact on every Source change.",
    usage:
      "azeforge watch <source> --output <artifact> [--format <format>] [--theme <theme>] [--allow-raw-latex] [--diagnostics json]",
  },
  {
    name: "serve",
    summary: "Preview Source through a loopback preview server.",
    usage:
      "azeforge serve <source> [--port <port>] [--theme <theme>] [--allow-raw-latex] [--diagnostics json]",
  },
  {
    name: "format",
    summary: "Format Source deterministically.",
    usage:
      "azeforge format <source> [--write | --check] | azeforge format --stdin [--check] [--diagnostics json]",
  },
  {
    name: "capabilities",
    summary: "Report supported versions, adapters, limits, and policy.",
    usage: "azeforge capabilities [--probe] [--json]",
  },
  {
    name: "version",
    summary: "Report the CLI version and public schema versions.",
    usage: "azeforge version [--json]",
  },
]);

export const CAPABILITY_FORMATS: readonly ArtifactFormat[] = Object.freeze([
  "html",
  "svg",
  "png",
  "pdf",
]);


export interface BrowserEngineStatus {
  readonly name: "chrome-headless-shell";
  readonly pinnedVersion: typeof CHROME_HEADLESS_SHELL_VERSION;
  readonly availability: EngineAvailability;
  readonly reason?: string;
  readonly remedy?: string;
}

export interface CapabilitiesReport {
  readonly schema: typeof CAPABILITIES_SCHEMA_ID;
  readonly schemaVersion: typeof CAPABILITIES_SCHEMA_VERSION;
  readonly tool: Readonly<{ name: "azeforge"; version: typeof TOOL_VERSION }>;
  readonly runtime: RuntimeSupport;
  readonly commands: readonly CommandEntry[];
  readonly source: Readonly<{
    azemarkVersions: readonly [1];
    extension: ".aze.md";
    mimeType: "text/x-azemark";
  }>;
  readonly document: Readonly<{
    schemaVersions: readonly [1];
    mimeType: "application/vnd.azeforge.document+json";
  }>;
  readonly plugins: readonly {
    readonly type: string;
    readonly version: string;
    readonly title: string;
    readonly namespace: string;
    readonly bodySyntax: Readonly<{ id: string; version: string }>;
  }[];
  readonly blockRenderers: readonly {
    readonly id: string;
    readonly version: string;
    readonly blockType: string;
    readonly renderer: string;
  }[];
  readonly renderers: readonly {
    readonly id: string;
    readonly version: string;
    readonly formats: readonly string[];
    readonly capabilities: readonly string[];
  }[];
  readonly themes: readonly {
    readonly id: string;
    readonly version: string;
    readonly title: string;
    readonly colorScheme: "light" | "dark";
  }[];
  readonly formats: readonly ArtifactFormat[];
  readonly profiles: Readonly<Record<string, unknown>>;
  readonly limits: Readonly<Record<string, unknown>>;
  readonly security: Readonly<Record<string, unknown>>;
  readonly engines: {
    readonly browser: BrowserEngineStatus;
    readonly katex: Readonly<{
      version: typeof KATEX_VERSION;
      language: typeof EQUATION_LATEX_LANGUAGE_VERSION;
      availability: EngineAvailability;
    }>;
    readonly mermaid: Readonly<{
      version: typeof MERMAID_VERSION;
      availability: EngineAvailability;
    }>;
    readonly fonts: readonly {
      readonly family: string;
      readonly weights: readonly number[];
    }[];
  };
  readonly policy: Readonly<Record<string, unknown>>;
  readonly schemas: readonly VersionedSchema[];
}

const BROWSER_UNAVAILABLE_REASON =
  `Pinned Chrome Headless Shell ${CHROME_HEADLESS_SHELL_VERSION} is unavailable.` as const;
const BROWSER_UNAVAILABLE_REMEDY =
  "Reinstall AzeForge browser dependencies to enable svg, png, pdf, and mermaid rendering; html rendering without diagrams remains available." as const;

/**
 * Local-only availability check. Inspects only the pinned browser
 * executable path: no network access, no package discovery, no process
 * launch, and no workstation facts in the returned status.
 */
export async function probeBrowserAvailability(): Promise<BrowserEngineStatus> {
  const base = {
    name: "chrome-headless-shell",
    pinnedVersion: CHROME_HEADLESS_SHELL_VERSION,
  } as const;
  let executable: string;
  try {
    executable = resolvePinnedBrowserExecutable();
  } catch {
    return {
      ...base,
      availability: "unavailable",
      reason: BROWSER_UNAVAILABLE_REASON,
      remedy: BROWSER_UNAVAILABLE_REMEDY,
    };
  }
  try {
    await access(executable, fsConstants.X_OK);
  } catch {
    return {
      ...base,
      availability: "unavailable",
      reason: BROWSER_UNAVAILABLE_REASON,
      remedy: BROWSER_UNAVAILABLE_REMEDY,
    };
  }
  return { ...base, availability: "available" };
}

/**
 * Build the canonical capabilities manifest in fixed key order. Static
 * output is deterministic and reports engine availability as unknown;
 * pass probe:true for local-only availability checks. Throws when the
 * built-in registry cannot be trusted.
 */
export async function buildCapabilities(
  options: Readonly<{ probe?: boolean }> = {},
): Promise<CapabilitiesReport> {
  const registry = getBuiltInRegistry();
  validateRegistry(registry.plugins, registry.blockRenderers, registry.renderers);

  const probe = options.probe === true;
  const browser: BrowserEngineStatus = probe
    ? await probeBrowserAvailability()
    : {
        name: "chrome-headless-shell",
        pinnedVersion: CHROME_HEADLESS_SHELL_VERSION,
        availability: "unknown",
      };
  const bundled: EngineAvailability = probe ? "available" : "unknown";

  return {
    schema: CAPABILITIES_SCHEMA_ID,
    schemaVersion: CAPABILITIES_SCHEMA_VERSION,
    tool: { name: "azeforge", version: TOOL_VERSION },
    runtime: RUNTIME_SUPPORT,
    commands: CAPABILITY_COMMANDS,
    source: {
      azemarkVersions: [1],
      extension: ".aze.md",
      mimeType: "text/x-azemark",
    },
    document: {
      schemaVersions: [1],
      mimeType: "application/vnd.azeforge.document+json",
    },
    plugins: [...registry.plugins]
      .sort((a, b) => (a.descriptor.type < b.descriptor.type ? -1 : 1))
      .map((plugin) => ({
        type: plugin.descriptor.type,
        version: plugin.descriptor.version,
        title: plugin.descriptor.title,
        namespace: plugin.descriptor.diagnosticNamespace,
        bodySyntax: { ...plugin.descriptor.bodySyntax },
      })),
    blockRenderers: [...registry.blockRenderers]
      .sort((a, b) => (a.descriptor.id < b.descriptor.id ? -1 : 1))
      .map((renderer) => ({
        id: renderer.descriptor.id,
        version: renderer.descriptor.version,
        blockType: renderer.descriptor.blockType,
        renderer: renderer.descriptor.rendererId,
      })),
    renderers: [...registry.renderers]
      .sort((a, b) => (a.id < b.id ? -1 : 1))
      .map((renderer) => ({
        id: renderer.id,
        version: renderer.version,
        formats: [...renderer.formats],
        capabilities: [...renderer.capabilities],
      })),
    themes: [...builtInThemes]
      .sort((a, b) => (a.id < b.id ? -1 : 1))
      .map((theme) => ({
        id: theme.id,
        version: theme.version,
        title: theme.title,
        colorScheme: theme.colorScheme,
      })),
    formats: CAPABILITY_FORMATS,
    profiles: {
      html: {
        profile: HTML_PROFILE,
        mimeType: HTML_MIME_TYPE,
        serializer: HTML_SERIALIZER,
        maxBytes: HTML_MAX_BYTES,
      },
      svg: {
        profile: SVG_PROFILE,
        mimeType: SVG_MIME_TYPE,
        serializer: SVG_SERIALIZER,
        maxBytes: SVG_MAX_BYTES,
        maxHeightPx: SVG_MAX_HEIGHT_PX,
      },
      png: {
        profile: PNG_PROFILE,
        mimeType: PNG_MIME_TYPE,
        serializer: PNG_SERIALIZER,
        maxBytes: PNG_MAX_BYTES,
        maxCssHeightPx: PNG_MAX_CSS_HEIGHT_PX,
        maxPixelDimension: PNG_MAX_PIXEL_DIMENSION,
        maxPixels: PNG_MAX_PIXELS,
        deviceScaleFactor: PNG_DEVICE_SCALE_FACTOR,
      },
      pdf: {
        profile: PDF_PROFILE,
        mimeType: PDF_MIME_TYPE,
        serializer: PDF_SERIALIZER,
        maxBytes: PDF_MAX_BYTES,
        maxPages: PDF_MAX_PAGES,
        maxHtmlBytes: PDF_MAX_HTML_BYTES,
        maxTempBytes: PDF_MAX_TEMP_BYTES,
      },
    },
    limits: {
      diagnostics: {
        perBlock: DEFAULT_DIAGNOSTIC_LIMITS.perBlock,
        perDocument: DEFAULT_DIAGNOSTIC_LIMITS.perDocument,
        policy: "lowerable-only",
      },
      renderTimeoutMs: {
        default: DEFAULT_RENDER_TIMEOUT_MS,
        policy: "lowerable-only",
      },
      nesting: { maxDepth: MAX_NESTING_DEPTH },
      images: {
        maxBytes: MAX_IMAGE_BYTES,
        maxDimensionPx: MAX_IMAGE_DIMENSION_PX,
        maxPixels: MAX_IMAGE_PIXELS,
      },
      blocks: {
        equation: {
          maxSourceChars: MAX_EQUATION_SOURCE_LENGTH,
          maxTexChars: MAX_EQUATION_TEX_LENGTH,
        },
        mermaid: {
          maxSourceChars: MAX_MERMAID_SOURCE_LENGTH,
          maxTextChars: MAX_MERMAID_TEXT_LENGTH,
        },
      },
      serve: { bind: "127.0.0.1", port: { min: 0, max: 65535, default: 0 } },
    },
    security: {
      sourceModel: "untrusted",
      javascriptSandbox: false,
      filesystem: "root-confined",
      network: { compile: "deny", preview: "loopback-only" },
      subprocess: "approved-argv-only",
      browsers: "isolated-contexts",
      temporaryStorage: "per-compile-cleanup",
      sanitizers: "fail-closed",
      partialArtifacts: "never-published",
    },
    engines: {
      browser,
      katex: {
        version: KATEX_VERSION,
        language: EQUATION_LATEX_LANGUAGE_VERSION,
        availability: bundled,
      },
      mermaid: { version: MERMAID_VERSION, availability: bundled },
      fonts: [
        { family: "Inter", weights: [400, 700] },
        { family: "JetBrains Mono", weights: [400] },
      ],
    },
    policy: {
      active: {
        disabledBlockRendererIds: [],
        disabledRendererIds: [],
        disabledThemeIds: [],
        diagnosticLimits: { ...DEFAULT_DIAGNOSTIC_LIMITS },
        renderTimeoutMs: DEFAULT_RENDER_TIMEOUT_MS,
      },
      note: "Host policy may only lower limits and disable adapters; it cannot raise limits.",
    },
    schemas: publicSchemaVersions(),
  };
}

/** Canonical machine serialization: one JSON document plus newline. */
export function serializeCapabilities(report: CapabilitiesReport): string {
  return `${JSON.stringify(report)}\n`;
}
