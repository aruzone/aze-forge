import { CAPABILITIES_SCHEMA_ID, CAPABILITIES_SCHEMA_VERSION } from "./capabilities-json.js";
import { TIMING_EMITTER_VERSION } from "./timing-render.js";
import { MODELS_LAYOUT_VERSION, MODELS_WRAP_VERSION } from "./models-layout.js";
import { CONTROL_EMITTER_VERSION, CONTROL_EVALUATOR_VERSION, CONTROL_LAYOUT_VERSION, FREE_BODY_EMITTER_VERSION, FREE_BODY_EVALUATOR_VERSION, FREE_BODY_SCALE_POLICY_VERSION } from "./control-schemas.js";
import { MODELS_EMITTER_VERSION } from "./models-render.js";
import { ADVANCE_METRIC_VERSION } from "./advance-metric.js";
import { DIAGRAM_LAYOUT_VERSION, ELKJS_VERSION } from "./diagram-layout.js";
import { DIAGRAM_EMITTER_VERSION } from "./diagram-render.js";
import { EQUATION_LATEX_LANGUAGE_VERSION, KATEX_VERSION } from "./equation-schemas.js";
import { MERMAID_VERSION } from "./mermaid-schemas.js";
import { TEX_PROFILES } from "./tex-schemas.js";
import { D3_ARRAY_VERSION, D3_SCALE_VERSION, D3_SHAPE_VERSION, PLOT_EMITTER_VERSION, PLOT_EVAL_VERSION } from "./plot-schemas.js";
import { GEOMETRY_EMITTER_VERSION, GEOMETRY_EPSILON, GEOMETRY_EVAL_VERSION } from "./geometry-schemas.js";
import { CHEMISTRY_EMITTER_VERSION } from "./chemistry-schemas.js";
import { CHROME_HEADLESS_SHELL_VERSION } from "./mermaid-browser.js";
import type { ArtifactFormat } from "./model.js";
import { TOOL_VERSION } from "./tool-version.js";
import { type VersionedSchema } from "./version.js";
import { type RuntimeSupport } from "./runtime-support.js";
export type EngineAvailability = "unknown" | "available" | "unavailable";
export interface CommandEntry {
    readonly name: string;
    readonly summary: string;
    readonly usage: string;
}
/** Eight commands in canonical blueprint order. */
export declare const CAPABILITY_COMMANDS: readonly CommandEntry[];
export declare const CAPABILITY_FORMATS: readonly ArtifactFormat[];
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
    readonly tool: Readonly<{
        name: "azeforge";
        version: typeof TOOL_VERSION;
    }>;
    readonly runtime: RuntimeSupport;
    readonly commands: readonly CommandEntry[];
    readonly source: Readonly<{
        azemarkVersions: readonly [2];
        extension: ".aze.md";
        mimeType: "text/x-azemark";
    }>;
    readonly document: Readonly<{
        schemaVersions: readonly [3];
        mimeType: "application/vnd.azeforge.document+json";
    }>;
    readonly plugins: readonly {
        readonly type: string;
        readonly version: string;
        readonly title: string;
        readonly namespace: string;
        readonly bodySyntax: Readonly<{
            id: string;
            version: string;
        }>;
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
        readonly tex: Readonly<{
            profiles: typeof TEX_PROFILES;
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
        readonly control: Readonly<{
            layout: typeof CONTROL_LAYOUT_VERSION;
            elkjs: typeof ELKJS_VERSION;
            emitter: typeof CONTROL_EMITTER_VERSION;
            eval: typeof CONTROL_EVALUATOR_VERSION;
            advanceMetric: typeof ADVANCE_METRIC_VERSION;
            metricSource: readonly string[];
            availability: EngineAvailability;
        }>;
        readonly freeBody: Readonly<{
            emitter: typeof FREE_BODY_EMITTER_VERSION;
            eval: typeof FREE_BODY_EVALUATOR_VERSION;
            scale: typeof FREE_BODY_SCALE_POLICY_VERSION;
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
/**
 * Optional-dependency probe pattern, adopted by the browser engine today.
 *
 * Every new optional engine repeats this shape: inspect the pinned
 * executable path only (no network, no package discovery, no process
 * launch, no workstation facts). Callers attach the stable
 * reason/remedy when the reported availability is "unavailable".
 */
export declare function probeExecutableAvailability(options: {
    readonly resolveExecutable: () => string;
}): Promise<EngineAvailability>;
/**
 * Local-only availability check. Inspects only the pinned browser
 * executable path: no network access, no package discovery, no process
 * launch, and no workstation facts in the returned status.
 */
export declare function probeBrowserAvailability(): Promise<BrowserEngineStatus>;
/**
 * Build the canonical capabilities manifest in fixed key order. Static
 * output is deterministic and reports engine availability as unknown;
 * pass probe:true for local-only availability checks. Throws when the
 * built-in registry cannot be trusted.
 */
export declare function buildCapabilities(options?: Readonly<{
    probe?: boolean;
}>): Promise<CapabilitiesReport>;
/** Canonical machine serialization: one JSON document plus newline. */
export declare function serializeCapabilities(report: CapabilitiesReport): string;
