import { access, constants as fsConstants } from "node:fs/promises";

import { CAPABILITIES_SCHEMA_ID, CAPABILITIES_SCHEMA_VERSION } from "./capabilities-json.js";
import { DEFAULT_DIAGNOSTIC_LIMITS } from "./diagnostics.js";
import {
  MAX_CIRCUIT_ANNOTATIONS,
  MAX_CIRCUIT_COMPONENTS,
  MAX_CIRCUIT_NODES,
  MAX_CIRCUIT_RELATIONS,
} from "./circuit.js";
import {
  MAX_TIMING_ARROWS,
  MAX_TIMING_GROUP_DEPTH,
  MAX_TIMING_GROUPS,
  MAX_TIMING_INTERVALS,
  MAX_TIMING_MARKERS,
  MAX_TIMING_SIGNALS,
  MAX_TIMING_SPAN,
  MAX_TIMING_TEXT_CODE_POINTS,
  MAX_TIMING_TOTAL_INTERVALS,
  MAX_TIMING_WAVE_CHARS,
  MAX_TIMING_WIDTH,
} from "./timing.js";
import {
  MAX_DIAGRAM_DECLARATIONS,
  MAX_DIAGRAM_EDGES,
  MAX_DIAGRAM_GROUPS,
  MAX_DIAGRAM_GROUP_DEPTH,
  MAX_DIAGRAM_LABEL_CODE_POINTS,
  MAX_DIAGRAM_LABEL_LINES,
  MAX_DIAGRAM_NODES,
  MAX_DIAGRAM_PARALLEL_EDGES,
  MAX_DIAGRAM_PORTS,
  MAX_DIAGRAM_PORTS_PER_NODE,
  MAX_DIAGRAM_TOTAL_LABEL_CODE_POINTS,
} from "./diagram.js";
import { TIMING_EMITTER_VERSION } from "./timing-render.js";
import {
  MAX_CLASS_ATTRIBUTES,
  MAX_CLASS_CLASSIFIERS,
  MAX_CLASS_OPERATIONS,
  MAX_CLASS_PARAMETERS,
  MAX_CLASS_RELATIONSHIPS,
  MAX_ENTITY_ATTRIBUTES,
  MAX_ENTITY_ENTITIES,
  MAX_ENTITY_RELATIONSHIPS,
  MAX_MODELS_NAME_CHARS,
  MAX_MODELS_TEXT_CHARS,
  MAX_SEQUENCE_ALT_DIVISIONS,
  MAX_SEQUENCE_FRAGMENT_DEPTH,
  MAX_SEQUENCE_NOTE_SPAN,
  MAX_SEQUENCE_NOTE_TEXT_CHARS,
  MAX_SEQUENCE_NOTE_TEXT_LINES,
  MAX_SEQUENCE_PARTICIPANTS,
  MAX_SEQUENCE_TIMELINE_ITEMS,
  MAX_STATE_DEPTH,
  MAX_STATE_STATES,
  MAX_STATE_TRANSITIONS,
} from "./models.js";
import { MODELS_LAYOUT_VERSION, MODELS_WRAP_VERSION } from "./models-layout.js";
import { MODELS_EMITTER_VERSION, MODELS_MAX_HEIGHT_PX, MODELS_MAX_WIDTH_PX } from "./models-render.js";
import { ADVANCE_METRIC_SOURCES, ADVANCE_METRIC_VERSION } from "./advance-metric.js";
import { DIAGRAM_LAYOUT_VERSION, ELKJS_VERSION } from "./diagram-layout.js";
import { DIAGRAM_EMITTER_VERSION } from "./diagram-render.js";
import {
  MAX_EQUATION_SOURCE_LENGTH,
  MAX_EQUATION_TEX_LENGTH,
} from "./equation.js";
import { EQUATION_LATEX_LANGUAGE_VERSION, KATEX_VERSION } from "./equation-schemas.js";
import {
  MAX_MERMAID_SOURCE_LENGTH,
  MAX_MERMAID_TEXT_LENGTH,
} from "./mermaid.js";
import { MERMAID_VERSION } from "./mermaid-schemas.js";
import {
  D3_ARRAY_VERSION,
  D3_SCALE_VERSION,
  D3_SHAPE_VERSION,
  PLOT_EMITTER_VERSION,
  PLOT_EVAL_VERSION,
} from "./plot-schemas.js";
import {
  GEOMETRY_EMITTER_VERSION,
  GEOMETRY_EPSILON,
  GEOMETRY_EVAL_VERSION,
} from "./geometry-schemas.js";
import { CHEMISTRY_EMITTER_VERSION } from "./chemistry-schemas.js";
import {
  MAX_COORDINATE_MAGNITUDE,
  MAX_EQUAL_MARK_GROUPS,
  MAX_EQUAL_MARK_SEGMENTS,
  MAX_GEOMETRY_DECLARATIONS,
  MAX_GEOMETRY_DIMENSION_PX,
  MAX_GEOMETRY_LABEL_CHARS,
  MAX_POLYGON_VERTICES,
} from "./geometry.js";
import {
  MAX_FORMULA_CHARGE,
  MAX_FORMULA_EXPRESSION_CHARS,
  MAX_GROUP_NESTING,
  MAX_ISOTOPE_MASS,
  MAX_REACTION_CONDITION_CHARS,
  MAX_REACTION_SPECIES,
  MAX_REACTION_SPECIES_CHARS,
  MAX_STRUCTURE_ATOMS,
  MAX_STRUCTURE_HEIGHT,
  MAX_STRUCTURE_LABEL_CHARS,
  MAX_STRUCTURE_WIDTH,
  MAX_SUBSCRIPT,
} from "./chemistry.js";
import {
  MAX_BAR_CATEGORIES,
  MAX_BINS,
  MAX_CHART_SERIES,
  MAX_HISTOGRAM_VALUES,
  MAX_LABEL_CHARS,
  MAX_PARAMETERS,
  MAX_PLOT_SERIES,
  MAX_POINTS_PER_SERIES,
  MAX_SAMPLES,
} from "./plot.js";
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
    azemarkVersions: readonly [2];
    extension: ".aze.md";
    mimeType: "text/x-azemark";
  }>;
  readonly document: Readonly<{
    schemaVersions: readonly [2];
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
    readonly plot: Readonly<{
      emitter: typeof PLOT_EMITTER_VERSION;
      eval: typeof PLOT_EVAL_VERSION;
      d3array: typeof D3_ARRAY_VERSION;
      d3scale: typeof D3_SCALE_VERSION;
      d3shape: typeof D3_SHAPE_VERSION;
      availability: EngineAvailability;
    }>;
    readonly geometry: Readonly<{
      emitter: typeof GEOMETRY_EMITTER_VERSION;
      eval: typeof GEOMETRY_EVAL_VERSION;
      epsilon: typeof GEOMETRY_EPSILON;
      availability: EngineAvailability;
    }>;
    readonly chemistry: Readonly<{
      emitter: typeof CHEMISTRY_EMITTER_VERSION;
      availability: EngineAvailability;
    }>;
    readonly timing: Readonly<{
      emitter: typeof TIMING_EMITTER_VERSION;
      availability: EngineAvailability;
    }>;
    readonly diagram: Readonly<{
      layout: typeof DIAGRAM_LAYOUT_VERSION;
      elkjs: typeof ELKJS_VERSION;
      emitter: typeof DIAGRAM_EMITTER_VERSION;
      advanceMetric: typeof ADVANCE_METRIC_VERSION;
      metricSource: readonly string[];
      availability: EngineAvailability;
    }>;
    readonly models: Readonly<{
      layout: typeof MODELS_LAYOUT_VERSION;
      wrap: typeof MODELS_WRAP_VERSION;
      emitter: typeof MODELS_EMITTER_VERSION;
      advanceMetric: typeof ADVANCE_METRIC_VERSION;
      metricSource: readonly string[];
      directiveTypes: readonly string[];
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
 * Optional-dependency probe pattern, adopted by the browser engine today.
 *
 * Every new optional engine repeats this shape: inspect the pinned
 * executable path only (no network, no package discovery, no process
 * launch, no workstation facts). Callers attach the stable
 * reason/remedy when the reported availability is "unavailable".
 */
export async function probeExecutableAvailability(options: {
  readonly resolveExecutable: () => string;
}): Promise<EngineAvailability> {
  let executable: string;
  try {
    executable = options.resolveExecutable();
  } catch {
    return "unavailable";
  }
  try {
    await access(executable, fsConstants.X_OK);
  } catch {
    return "unavailable";
  }
  return "available";
}

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
  const availability = await probeExecutableAvailability({
    resolveExecutable: resolvePinnedBrowserExecutable,
  });
  if (availability === "available") return { ...base, availability };
  return {
    ...base,
    availability,
    reason: BROWSER_UNAVAILABLE_REASON,
    remedy: BROWSER_UNAVAILABLE_REMEDY,
  };
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
      azemarkVersions: [2],
      extension: ".aze.md",
      mimeType: "text/x-azemark",
    },
    document: {
      schemaVersions: [2],
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
        derivation: {
          maxSourceChars: MAX_EQUATION_SOURCE_LENGTH,
          maxTexChars: MAX_EQUATION_TEX_LENGTH,
        },
        mermaid: {
          maxSourceChars: MAX_MERMAID_SOURCE_LENGTH,
          maxTextChars: MAX_MERMAID_TEXT_LENGTH,
        },
        plot: {
          maxSeries: MAX_PLOT_SERIES,
          maxPointsPerSeries: MAX_POINTS_PER_SERIES,
          maxSamples: MAX_SAMPLES,
          maxParameters: MAX_PARAMETERS,
          maxLabelChars: MAX_LABEL_CHARS,
        },
        chart: {
          maxSeries: MAX_CHART_SERIES,
          maxHistogramValues: MAX_HISTOGRAM_VALUES,
          maxBins: MAX_BINS,
          maxBarCategories: MAX_BAR_CATEGORIES,
          maxLabelChars: MAX_LABEL_CHARS,
        },
        geometry: {
          maxDeclarations: MAX_GEOMETRY_DECLARATIONS,
          maxPolygonVertices: MAX_POLYGON_VERTICES,
          maxEqualMarkSegments: MAX_EQUAL_MARK_SEGMENTS,
          maxEqualMarkGroups: MAX_EQUAL_MARK_GROUPS,
          maxLabelChars: MAX_GEOMETRY_LABEL_CHARS,
          maxCoordinateMagnitude: MAX_COORDINATE_MAGNITUDE,
          maxDimensionPx: MAX_GEOMETRY_DIMENSION_PX,
        },
        chemistry: {
          maxFormulaExpressionChars: MAX_FORMULA_EXPRESSION_CHARS,
          maxFormulaCharge: MAX_FORMULA_CHARGE,
          maxSubscript: MAX_SUBSCRIPT,
          maxGroupNesting: MAX_GROUP_NESTING,
          maxIsotopeMass: MAX_ISOTOPE_MASS,
          maxReactionSpecies: MAX_REACTION_SPECIES,
          maxReactionSpeciesChars: MAX_REACTION_SPECIES_CHARS,
          maxReactionConditionChars: MAX_REACTION_CONDITION_CHARS,
          maxStructureAtoms: MAX_STRUCTURE_ATOMS,
          maxStructureWidth: MAX_STRUCTURE_WIDTH,
          maxStructureHeight: MAX_STRUCTURE_HEIGHT,
          maxStructureLabelChars: MAX_STRUCTURE_LABEL_CHARS,
        },
        circuit: {
          maxComponents: MAX_CIRCUIT_COMPONENTS,
          maxNodes: MAX_CIRCUIT_NODES,
          maxRelations: MAX_CIRCUIT_RELATIONS,
          maxAnnotations: MAX_CIRCUIT_ANNOTATIONS,
        },
        diagram: {
          maxDeclarations: MAX_DIAGRAM_DECLARATIONS,
          maxNodes: MAX_DIAGRAM_NODES,
          maxEdges: MAX_DIAGRAM_EDGES,
          maxGroups: MAX_DIAGRAM_GROUPS,
          maxGroupDepth: MAX_DIAGRAM_GROUP_DEPTH,
          maxPortsPerNode: MAX_DIAGRAM_PORTS_PER_NODE,
          maxPorts: MAX_DIAGRAM_PORTS,
          maxParallelEdges: MAX_DIAGRAM_PARALLEL_EDGES,
          maxLabelCodePoints: MAX_DIAGRAM_LABEL_CODE_POINTS,
          maxLabelLines: MAX_DIAGRAM_LABEL_LINES,
          maxTotalLabelCodePoints: MAX_DIAGRAM_TOTAL_LABEL_CODE_POINTS,
        },
        models: {
          sequence: {
            maxParticipants: MAX_SEQUENCE_PARTICIPANTS,
            maxTimelineItems: MAX_SEQUENCE_TIMELINE_ITEMS,
            maxFragmentDepth: MAX_SEQUENCE_FRAGMENT_DEPTH,
            maxAltDivisions: MAX_SEQUENCE_ALT_DIVISIONS,
            maxNoteSpan: MAX_SEQUENCE_NOTE_SPAN,
            maxNoteTextChars: MAX_SEQUENCE_NOTE_TEXT_CHARS,
            maxNoteTextLines: MAX_SEQUENCE_NOTE_TEXT_LINES,
          },
          state: {
            maxStates: MAX_STATE_STATES,
            maxDepth: MAX_STATE_DEPTH,
            maxTransitions: MAX_STATE_TRANSITIONS,
          },
          entity: {
            maxEntities: MAX_ENTITY_ENTITIES,
            maxAttributesPerEntity: MAX_ENTITY_ATTRIBUTES,
            maxRelationships: MAX_ENTITY_RELATIONSHIPS,
          },
          class: {
            maxClassifiers: MAX_CLASS_CLASSIFIERS,
            maxAttributesPerClass: MAX_CLASS_ATTRIBUTES,
            maxOperationsPerClass: MAX_CLASS_OPERATIONS,
            maxParametersPerOperation: MAX_CLASS_PARAMETERS,
            maxRelationships: MAX_CLASS_RELATIONSHIPS,
          },
          maxTextChars: MAX_MODELS_TEXT_CHARS,
          maxNameChars: MAX_MODELS_NAME_CHARS,
          maxWidthPx: MODELS_MAX_WIDTH_PX,
          maxHeightPx: MODELS_MAX_HEIGHT_PX,
        },
        timing: {
          maxSignals: MAX_TIMING_SIGNALS,
          maxIntervals: MAX_TIMING_INTERVALS,
          maxTotalIntervals: MAX_TIMING_TOTAL_INTERVALS,
          maxGroups: MAX_TIMING_GROUPS,
          maxGroupDepth: MAX_TIMING_GROUP_DEPTH,
          maxMarkers: MAX_TIMING_MARKERS,
          maxArrows: MAX_TIMING_ARROWS,
          maxTextCodePoints: MAX_TIMING_TEXT_CODE_POINTS,
          maxWaveChars: MAX_TIMING_WAVE_CHARS,
          maxSpan: MAX_TIMING_SPAN,
          maxWidth: MAX_TIMING_WIDTH,
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
      plot: {
        emitter: PLOT_EMITTER_VERSION,
        eval: PLOT_EVAL_VERSION,
        d3array: D3_ARRAY_VERSION,
        d3scale: D3_SCALE_VERSION,
        d3shape: D3_SHAPE_VERSION,
        availability: bundled,
      },
      geometry: {
        emitter: GEOMETRY_EMITTER_VERSION,
        eval: GEOMETRY_EVAL_VERSION,
        epsilon: GEOMETRY_EPSILON,
        availability: bundled,
      },
      chemistry: {
        emitter: CHEMISTRY_EMITTER_VERSION,
        availability: bundled,
      },
      timing: {
        emitter: TIMING_EMITTER_VERSION,
        availability: bundled,
      },
      diagram: {
        layout: DIAGRAM_LAYOUT_VERSION,
        elkjs: ELKJS_VERSION,
        emitter: DIAGRAM_EMITTER_VERSION,
        advanceMetric: ADVANCE_METRIC_VERSION,
        metricSource: ADVANCE_METRIC_SOURCES,
        availability: bundled,
      },
      models: {
        layout: MODELS_LAYOUT_VERSION,
        wrap: MODELS_WRAP_VERSION,
        emitter: MODELS_EMITTER_VERSION,
        advanceMetric: ADVANCE_METRIC_VERSION,
        metricSource: ADVANCE_METRIC_SOURCES,
        directiveTypes: ["sequence", "state", "entity", "class"],
        availability: bundled,
      },
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
