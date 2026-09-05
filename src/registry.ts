import { calloutHtmlBlockRenderer, calloutPlugin } from "./callout.js";
import { CompilerConfigurationError } from "./configuration-error.js";
import {
  equationHtmlBlockRenderer,
  equationPlugin,
  htmlRendererDescriptor,
} from "./equation.js";
import { tableHtmlBlockRenderer, tablePlugin } from "./table.js";
import {
  mermaidHtmlBlockRenderer,
  mermaidPlugin,
} from "./mermaid.js";
import {
  svgBlockRenderers,
  svgRendererDescriptor,
} from "./render-svg.js";
import {
  pngBlockRenderers,
  pngRendererDescriptor,
} from "./render-png.js";
import type {
  AnyBlockRenderer,
  AzeBlockPlugin,
  RendererDescriptor,
} from "./model.js";

export const REGISTRY_CONFORMANCE_SEAM_VERSION = "1.0.0" as const;
const SEMVER = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;
const PLUGIN_TYPE = /^(?:@[a-z0-9-]+(?:\/[a-z][a-z0-9-]*)?|[a-z][a-z0-9]*(?:-[a-z0-9]+)*)$/;
const ADAPTER_ID =
  /^(?:@[a-z0-9-]+(?:\/[a-z][a-z0-9-.]*)?|[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[.-][a-z0-9]+)*)?)$/;
const RENDERER_CAPABILITY: Readonly<Record<string, true>> = {
  browser: true,
  filesystem: true,
  subprocess: true,
};
const NAMESPACE = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)*$/;

export interface ResolvedRegistry {
  readonly plugins: readonly AzeBlockPlugin[];
  readonly blockRenderers: readonly AnyBlockRenderer[];
  readonly renderers: readonly RendererDescriptor[];
}

export function getBuiltInRegistry(): ResolvedRegistry {
  return Object.freeze({
    plugins: Object.freeze([
      equationPlugin,
      calloutPlugin,
      mermaidPlugin,
      tablePlugin,
    ]),
    blockRenderers: Object.freeze([
      equationHtmlBlockRenderer,
      calloutHtmlBlockRenderer,
      mermaidHtmlBlockRenderer,
      tableHtmlBlockRenderer,
      ...svgBlockRenderers,
      ...pngBlockRenderers,
    ]),
    renderers: Object.freeze([
      htmlRendererDescriptor,
      svgRendererDescriptor,
      pngRendererDescriptor,
    ]),
  });
}

export function satisfiesSemverRange(
  version: string,
  range: string,
): boolean {
  const trimmed = range.trim();
  if (trimmed === version) return true;
  const caret = /^\^(\d+)\.(\d+)\.(\d+)$/.exec(trimmed);
  const current = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (caret === null || current === null) return false;
  const base = [caret[1], caret[2], caret[3]].map(Number);
  const mine = [current[1], current[2], current[3]].map(Number);
  const atLeastBase =
    mine[0] !== base[0]
      ? (mine[0] ?? 0) > (base[0] ?? 0)
      : mine[1] !== base[1]
        ? (mine[1] ?? 0) > (base[1] ?? 0)
        : (mine[2] ?? 0) >= (base[2] ?? 0);
  if (!atLeastBase) return false;
  if (base[0] !== 0) return mine[0] === base[0];
  if (base[1] !== 0) return mine[0] === 0 && mine[1] === base[1];
  return mine[0] === 0 && mine[1] === 0 && mine[2] === base[2];
}

export function isWellFormedVersionRange(range: string): boolean {
  const trimmed = range.trim();
  if (SEMVER.test(trimmed)) return true;
  return /^\^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(trimmed);
}

function rangeBaseVersion(range: string): string {
  const trimmed = range.trim();
  if (trimmed.startsWith("^")) return trimmed.slice(1);
  return trimmed;
}

function versionRangesOverlap(first: string, second: string): boolean {
  return (
    satisfiesSemverRange(rangeBaseVersion(first), second) ||
    satisfiesSemverRange(rangeBaseVersion(second), first)
  );
}

interface Violation {
  readonly key: string;
  readonly code: string;
  readonly message: string;
}

function isSchemaObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  if (!("$id" in value) || !("type" in value)) return false;
  return (
    typeof value.$id === "string" &&
    value.$id.length > 0 &&
    value.type === "object"
  );
}
export function validateRegistry(
  plugins: readonly AzeBlockPlugin[],
  blockRenderers: readonly AnyBlockRenderer[],
  renderers: readonly RendererDescriptor[],
): void {
  const violations: Violation[] = [];
  const sortedPlugins = [...plugins].sort((a, b) =>
    a.descriptor.type < b.descriptor.type ? -1 : 1,
  );
  const seenTypes = new Set<string>();
  const seenNamespaces = new Set<string>();
  for (const plugin of sortedPlugins) {
    const d = plugin.descriptor;
    const key = `plugin:${d.type}`;
    if (!PLUGIN_TYPE.test(d.type)) {
      violations.push({
        key,
        code: "azeforge.config#invalid-plugin-type",
        message: `Plugin type "${d.type}" is not a valid Plugin identity.`,
      });
    }
    if (!SEMVER.test(d.version)) {
      violations.push({
        key: `${key}:version`,
        code: "azeforge.config#invalid-plugin-version",
        message: `Plugin "${d.type}" version "${d.version}" is not SemVer.`,
      });
    }
    if (seenTypes.has(d.type)) {
      violations.push({
        key,
        code: "azeforge.config#duplicate-plugin",
        message: `Plugin type "${d.type}" is registered more than once.`,
      });
    }
    seenTypes.add(d.type);
    if (!NAMESPACE.test(d.diagnosticNamespace)) {
      violations.push({
        key: `${key}:namespace`,
        code: "azeforge.config#invalid-namespace",
        message: `Plugin "${d.type}" namespace is malformed.`,
      });
    } else if (seenNamespaces.has(d.diagnosticNamespace)) {
      violations.push({
        key: `${key}:namespace`,
        code: "azeforge.config#duplicate-namespace",
        message: `Diagnostic namespace "${d.diagnosticNamespace}" is registered more than once.`,
      });
    } else {
      seenNamespaces.add(d.diagnosticNamespace);
    }
    if (!isSchemaObject(d.sourceSchema)) {
      violations.push({
        key: `${key}:source-schema`,
        code: "azeforge.config#invalid-schema",
        message: `Plugin "${d.type}" sourceSchema is not a valid JSON Schema.`,
      });
    }
    if (!isSchemaObject(d.dataSchema)) {
      violations.push({
        key: `${key}:data-schema`,
        code: "azeforge.config#invalid-schema",
        message: `Plugin "${d.type}" dataSchema is not a valid JSON Schema.`,
      });
    }
    if (
      typeof d.bodySyntax?.id !== "string" ||
      d.bodySyntax.id.length === 0 ||
      typeof d.bodySyntax?.version !== "string" ||
      !SEMVER.test(d.bodySyntax.version)
    ) {
      violations.push({
        key: `${key}:body-syntax`,
        code: "azeforge.config#invalid-schema",
        message: `Plugin "${d.type}" bodySyntax identity is invalid.`,
      });
    }
  }

  const sortedRenderers = [...renderers].sort((a, b) =>
    a.id === b.id
      ? a.version < b.version
        ? -1
        : 1
      : a.id < b.id
        ? -1
        : 1,
  );
  const seenRendererKeys = new Set<string>();
  const formatOwners = new Map<string, string>();
  for (const renderer of sortedRenderers) {
    const key = `renderer:${renderer.id}@${renderer.version}`;
    if (!ADAPTER_ID.test(renderer.id)) {
      violations.push({
        key,
        code: "azeforge.config#invalid-renderer-id",
        message: `Renderer ID "${renderer.id}" is invalid.`,
      });
    }
    if (!SEMVER.test(renderer.version)) {
      violations.push({
        key,
        code: "azeforge.config#invalid-renderer-version",
        message: `Renderer "${renderer.id}" version is not SemVer.`,
      });
    }
    if (seenRendererKeys.has(key)) {
      violations.push({
        key,
        code: "azeforge.config#duplicate-renderer",
        message: `Renderer "${renderer.id}@${renderer.version}" is registered more than once.`,
      });
    }
    seenRendererKeys.add(key);
    if (
      !Array.isArray(renderer.capabilities) ||
      renderer.capabilities.some(
        (capability, index) =>
          RENDERER_CAPABILITY[capability] !== true ||
          renderer.capabilities.indexOf(capability) !== index,
      )
    ) {
      violations.push({
        key: `${key}:capabilities`,
        code: "azeforge.config#invalid-renderer-capability",
        message: `Renderer "${renderer.id}" has invalid capability declarations.`,
      });
    }
    for (const format of renderer.formats) {
      const owner = formatOwners.get(format);
      if (owner !== undefined && owner !== renderer.id) {
        violations.push({
          key: `renderer-format:${format}`,
          code: "azeforge.config#ambiguous-renderer",
          message: `Artifact format "${format}" maps to more than one Renderer.`,
        });
      } else {
        formatOwners.set(format, renderer.id);
      }
    }
  }

  const pluginByType = new Map(
    plugins.map((plugin) => [plugin.descriptor.type, plugin.descriptor]),
  );
  const rendererById = new Map(renderers.map((r) => [r.id, r]));
  const sortedBlockRenderers = [...blockRenderers].sort((a, b) =>
    a.descriptor.id < b.descriptor.id ? -1 : 1,
  );
  const seenBlockRendererIds = new Set<string>();
  const seenMatches = new Map<string, readonly string[]>();
  for (const blockRenderer of sortedBlockRenderers) {
    const d = blockRenderer.descriptor;
    const key = `block-renderer:${d.id}`;
    if (!ADAPTER_ID.test(d.id)) {
      violations.push({
        key,
        code: "azeforge.config#invalid-block-renderer-id",
        message: `Block-renderer ID "${d.id}" is invalid.`,
      });
    }
    if (!SEMVER.test(d.version)) {
      violations.push({
        key: `${key}:version`,
        code: "azeforge.config#invalid-block-renderer-version",
        message: `Block renderer "${d.id}" version is not SemVer.`,
      });
    }
    if (seenBlockRendererIds.has(d.id)) {
      violations.push({
        key,
        code: "azeforge.config#duplicate-block-renderer",
        message: `Block renderer "${d.id}" is registered more than once.`,
      });
    }
    seenBlockRendererIds.add(d.id);
    if (!pluginByType.has(d.blockType)) {
      violations.push({
        key: `${key}:block-type`,
        code: "azeforge.config#unknown-block-type",
        message: `Block renderer "${d.id}" targets unknown Block type "${d.blockType}".`,
      });
    }
    if (!rendererById.has(d.rendererId)) {
      violations.push({
        key: `${key}:renderer`,
        code: "azeforge.config#unknown-renderer",
        message: `Block renderer "${d.id}" targets unknown Renderer "${d.rendererId}".`,
      });
    }
    if (
      !isWellFormedVersionRange(d.pluginVersionRange) ||
      !isWellFormedVersionRange(d.rendererVersionRange)
    ) {
      violations.push({
        key: `${key}:range`,
        code: "azeforge.config#invalid-compatibility-range",
        message: `Block renderer "${d.id}" declares an invalid compatibility range.`,
      });
    }
    const matchKey = `${d.blockType}::${d.rendererId}`;
    const previous = seenMatches.get(matchKey) ?? [];
    if (
      previous.some((range) =>
        versionRangesOverlap(range, d.pluginVersionRange),
      )
    ) {
      violations.push({
        key: `${key}:overlap`,
        code: "azeforge.config#overlapping-block-renderer",
        message: `Block renderer "${d.id}" overlaps for Block type "${d.blockType}".`,
      });
    }
    seenMatches.set(matchKey, [...previous, d.pluginVersionRange]);
    if (typeof blockRenderer.render !== "function") {
      violations.push({
        key: `${key}:implementation`,
        code: "azeforge.config#invalid-block-renderer",
        message: `Block renderer "${d.id}" has no render implementation.`,
      });
    }
  }

  violations.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const first = violations[0];
  if (first !== undefined) {
    throw new CompilerConfigurationError(first.code, first.message);
  }
}

export function resolveRegistry(options: {
  readonly plugins?: readonly AzeBlockPlugin[];
  readonly blockRenderers?: readonly AnyBlockRenderer[];
  readonly renderers?: readonly RendererDescriptor[];
}): ResolvedRegistry {
  const builtIn = getBuiltInRegistry();
  const plugins = Object.freeze([...(options.plugins ?? builtIn.plugins)]);
  const blockRenderers = Object.freeze([
    ...(options.blockRenderers ?? builtIn.blockRenderers),
  ]);
  const renderers = Object.freeze([...(options.renderers ?? builtIn.renderers)]);
  validateRegistry(plugins, blockRenderers, renderers);
  return Object.freeze({ plugins, blockRenderers, renderers });
}

/**
 * Reusable conformance seam: verifies descriptors are inert, immutable,
 * and versioned. Built-in equation Plugin plus HTML Block renderer must
 * pass; third-party registries reuse the same entry point.
 */
export function assertRegistryDescriptorsImmutable(
  registry: ResolvedRegistry,
): void {
  const failures: string[] = [];
  for (const plugin of registry.plugins) {
    if (!Object.isFrozen(plugin) || !Object.isFrozen(plugin.descriptor)) {
      failures.push(`plugin:${plugin.descriptor.type}:mutable`);
    }
    if (!SEMVER.test(plugin.descriptor.version)) {
      failures.push(`plugin:${plugin.descriptor.type}:unversioned`);
    }
    if (typeof (plugin.descriptor as { render?: unknown }).render !== "undefined") {
      failures.push(`plugin:${plugin.descriptor.type}:renders`);
    }
  }
  for (const blockRenderer of registry.blockRenderers) {
    if (
      !Object.isFrozen(blockRenderer) ||
      !Object.isFrozen(blockRenderer.descriptor)
    ) {
      failures.push(`block-renderer:${blockRenderer.descriptor.id}:mutable`);
    }
    if (!SEMVER.test(blockRenderer.descriptor.version)) {
      failures.push(`block-renderer:${blockRenderer.descriptor.id}:unversioned`);
    }
  }
  for (const renderer of registry.renderers) {
    if (!Object.isFrozen(renderer)) {
      failures.push(`renderer:${renderer.id}:mutable`);
    }
  }
  if (failures.length > 0) {
    throw new CompilerConfigurationError(
      "azeforge.config#mutable-descriptor",
      `Registry descriptors failed conformance: ${failures.sort().join(", ")}.`,
    );
  }
}
function deepFreeze(value: unknown, seen: Set<object> = new Set()): void {
  if (typeof value !== "object" || value === null) return;
  if (seen.has(value) || Object.isFrozen(value)) return;
  seen.add(value);
  for (const entry of Object.values(value)) deepFreeze(entry, seen);
  Object.freeze(value);
}

/**
 * Defensive immutable snapshot for Compiler construction. Built-in
 * descriptors are already frozen; custom descriptors are cloned and
 * frozen so downstream reads observe immutability without mutating
 * caller-owned objects.
 */
export function freezeRegistryForCompiler(
  registry: ResolvedRegistry,
): ResolvedRegistry {
  return Object.freeze({
    plugins: Object.freeze(
      registry.plugins.map((plugin) =>
        Object.freeze({
          ...plugin,
          descriptor: (() => {
            const descriptor = structuredClone(plugin.descriptor);
            deepFreeze(descriptor);
            return descriptor;
          })(),
        }),
      ),
    ),
    blockRenderers: Object.freeze(
      registry.blockRenderers.map((blockRenderer) =>
        Object.freeze({
          ...blockRenderer,
          descriptor: (() => {
            const descriptor = structuredClone(blockRenderer.descriptor);
            deepFreeze(descriptor);
            return descriptor;
          })(),
        }),
      ),
    ),
    renderers: Object.freeze(
      registry.renderers.map((renderer) => {
        const snapshot = structuredClone(renderer);
        deepFreeze(snapshot);
        return Object.freeze(snapshot);
      }),
    ),
  });
}
