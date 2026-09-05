import { CompilerConfigurationError } from "./configuration-error.js";
import {
  createDiagnostic,
  DEFAULT_DIAGNOSTIC_LIMITS,
  normalizeAndLimitDiagnostics,
} from "./diagnostics.js";
import type { DiagnosticLimits } from "./diagnostics.js";
import {
  assertInterFontCoverage,
  FontCoverageError,
  loadInterFontFaces,
} from "./font.js";
import type { EmbeddedFontFace } from "./font.js";
import { documentContentHash } from "./hash.js";
import type {
  AzeBlock,
  AzeDocument,
  CompileOptions,
  CompileResult,
  Compiler,
  CompilerOptions,
  CompilerPolicy,
  Diagnostic,
  JsonValue,
  ParseOptions,
  ParseResult,
  Theme,
  ValidationResult,
} from "./model.js";
import {
  HTML_RENDERER_ID,
  katexDependencyClosure,
  sanitizeKatexHtml,
} from "./equation.js";
import type {
  EquationBlock,
  EquationBlockRenderer,
  MermaidBlock,
  MermaidBlockRenderer,
} from "./model.js";
import {
  MERMAID_PLUGIN_TYPE,
  mermaidDependencyClosure,
  sanitizeMermaidFragment,
} from "./mermaid.js";
import {
  freezeRegistryForCompiler,
  resolveRegistry,
  satisfiesSemverRange,
} from "./registry.js";
import type { ResolvedRegistry } from "./registry.js";
import { parseSource } from "./parse.js";
import { ArtifactLimitError, renderHtml } from "./render-html.js";
import { validateBlockIds } from "./reference-validation.js";
import { copyAndFreezeTheme, defaultTheme } from "./theme.js";
import { validateDocumentSchema } from "./validate-document.js";
const THEME_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const SEMVER = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;

function validateParsed(
  parsed: ParseResult,
  limits: DiagnosticLimits,
): ValidationResult {
  const schemaDiagnostics = validateDocumentSchema(parsed.document);
  if (
    [...parsed.diagnostics, ...schemaDiagnostics].some(
      ({ severity }) => severity === "error",
    )
  ) {
    return {
      diagnostics: normalizeAndLimitDiagnostics(
        [parsed.diagnostics, schemaDiagnostics],
        limits,
      ),
    };
  }
  const blockRanges = parsed.document.blocks.map(({ range }) => range);

  const referenceDiagnostics = validateBlockIds(
    parsed.document.blocks.flatMap((block) =>
      block.kind === "invalid" || block.id === undefined
        ? []
        : [{ id: block.id, range: block.range }],
    ),
  );
  if (referenceDiagnostics.some(({ severity }) => severity === "error")) {
    return {
      diagnostics: normalizeAndLimitDiagnostics(
        [parsed.diagnostics, schemaDiagnostics, referenceDiagnostics],
        limits,
        blockRanges,
      ),
    };
  }

  const invalidBlockDiagnostics = parsed.document.blocks.some(
    (block) => block.kind === "invalid",
  )
    ? [
        createDiagnostic(
          "azeforge.document#invalid-block",
          "error",
          "The Source contains an invalid Block.",
        ),
      ]
    : [];
  const diagnostics = normalizeAndLimitDiagnostics(
    [
      parsed.diagnostics,
      schemaDiagnostics,
      referenceDiagnostics,
      invalidBlockDiagnostics,
    ],
    limits,
    blockRanges,
  );
  if (invalidBlockDiagnostics.length > 0) return { diagnostics };

  const document: AzeDocument = {
    azemarkVersion: parsed.document.azemarkVersion,
    schemaVersion: parsed.document.schemaVersion,
    metadata: parsed.document.metadata,
    blocks: parsed.document.blocks as readonly AzeBlock[],
  };
  return { document, diagnostics };
}

function resolveDiagnosticLimits(options: CompilerOptions): DiagnosticLimits {
  const perBlock =
    options.diagnosticLimits?.perBlock ?? DEFAULT_DIAGNOSTIC_LIMITS.perBlock;
  const perDocument =
    options.diagnosticLimits?.perDocument ??
    DEFAULT_DIAGNOSTIC_LIMITS.perDocument;
  if (
    !Number.isInteger(perBlock) ||
    perBlock < 1 ||
    perBlock > DEFAULT_DIAGNOSTIC_LIMITS.perBlock ||
    !Number.isInteger(perDocument) ||
    perDocument < 1 ||
    perDocument > DEFAULT_DIAGNOSTIC_LIMITS.perDocument
  ) {
    throw new CompilerConfigurationError(
      "azeforge.config#diagnostic-limits",
      "Diagnostic limits must be positive integers no greater than the defaults.",
    );
  }
  return Object.freeze({ perBlock, perDocument });
}

function limitParseResult(
  parsed: ParseResult,
  limits: DiagnosticLimits,
): ParseResult {
  const sourceDiagnostics = parsed.diagnostics.filter(
    ({ code }) => !code.startsWith("azeforge.reference#"),
  );
  const referenceDiagnostics = parsed.diagnostics.filter(({ code }) =>
    code.startsWith("azeforge.reference#"),
  );
  const diagnostics = normalizeAndLimitDiagnostics(
    [sourceDiagnostics, referenceDiagnostics],
    limits,
    parsed.document.blocks.map(({ range }) => range),
  );
  const truncationIndex = diagnostics.findIndex(
    ({ code }) => code === "azeforge.diagnostics#truncated",
  );
  const blocks = parsed.document.blocks.map((block) => {
    if (block.kind === "invalid") {
      const mappedIndexes = block.diagnosticIndexes.map((index) => {
        const original = parsed.diagnostics[index];
        const retainedIndex =
          original === undefined ? -1 : diagnostics.indexOf(original);
        return retainedIndex >= 0 ? retainedIndex : truncationIndex;
      });
      return {
        ...block,
        diagnosticIndexes: [...new Set(mappedIndexes.filter((index) => index >= 0))],
      };
    }
    return block;
  });
  return {
    document: { ...parsed.document, blocks },
    diagnostics,
  };
}

function validateTheme(theme: Theme): void {
  const validColors = Object.values(theme.colors).every((color) =>
    /^#[0-9a-f]{6}$/i.test(color),
  );
  const { canvasWidthPx, contentWidthPx, paddingPx } = theme.geometry;
  const validGeometry =
    Number.isInteger(canvasWidthPx) &&
    canvasWidthPx > 0 &&
    Number.isInteger(contentWidthPx) &&
    contentWidthPx > 0 &&
    Number.isInteger(paddingPx) &&
    paddingPx >= 0 &&
    contentWidthPx + paddingPx * 2 <= canvasWidthPx;
  const validTypography =
    Number.isFinite(theme.typography.lineHeight) &&
    theme.typography.lineHeight >= 1 &&
    theme.typography.lineHeight <= 3 &&
    Number.isFinite(theme.typography.headingLineHeight) &&
    theme.typography.headingLineHeight >= 1 &&
    theme.typography.headingLineHeight <= 3 &&
    Number.isFinite(theme.typography.paragraphSpacingEm) &&
    theme.typography.paragraphSpacingEm >= 0 &&
    theme.typography.paragraphSpacingEm <= 4 &&
    theme.typography.bodyFontWeight === 400 &&
    theme.typography.headingFontWeight === 700 &&
    theme.typography.proseFontFamily === "Inter";
  if (!validColors || !validGeometry || !validTypography) {
    throw new CompilerConfigurationError(
      "AZE_CONFIG_THEME_VALUES",
      `Theme "${theme.id}" contains unsafe or invalid tokens.`,
    );
  }
}

const DEFAULT_RENDER_TIMEOUT_MS = 5000;

class RenderTimeoutError extends Error {
  constructor() {
    super("The equation Block renderer timed out.");
    this.name = "RenderTimeoutError";
  }
}

function withRenderTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new RenderTimeoutError()), timeoutMs);
  });
  return Promise.race([work, timeout]).finally(() => {
    clearTimeout(timer);
  });
}

function isCapabilityDenial(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if (!("code" in error)) return false;
  return error.code === "AZE_CAPABILITY_DENIED";
}

interface EquationTarget {
  readonly index: number;
  readonly block: EquationBlock;
}

function equationTargets(document: AzeDocument): readonly EquationTarget[] {
  const targets: EquationTarget[] = [];
  document.blocks.forEach((block, index) => {
    if (block.kind === "equation") targets.push({ index, block });
  });
  return targets;
}

interface MermaidTarget {
  readonly index: number;
  readonly block: MermaidBlock;
}

function mermaidTargets(document: AzeDocument): readonly MermaidTarget[] {
  const targets: MermaidTarget[] = [];
  document.blocks.forEach((block, index) => {
    if (block.kind === "mermaid") targets.push({ index, block });
  });
  return targets;
}

function groupedAdapterDiagnostic(
  code: string,
  message: string,
  targets: readonly { readonly block: { readonly range: EquationBlock["range"] } }[],
  sourceName: string | undefined,
  data: Readonly<Record<string, JsonValue>>,
  suggestion: string,
): Diagnostic {
  const first = targets[0];
  const rest = targets.slice(1).map(({ block }) => ({
    ...(sourceName === undefined ? {} : { source: sourceName }),
    range: block.range,
    message: "Another affected Block is here.",
  }));
  return createDiagnostic(code, "error", message, {
    ...(first === undefined
      ? {}
      : {
          location: {
            ...(sourceName === undefined ? {} : { source: sourceName }),
            range: first.block.range,
          },
        }),
    data: { ...data, affectedBlocks: targets.length },
    suggestion,
    ...(rest.length === 0 ? {} : { relatedLocations: rest }),
  });
}

async function renderEquationFragments(
  document: AzeDocument,
  registry: ResolvedRegistry,
  policy: CompilerPolicy,
  sourceName: string | undefined,
  timeoutMs: number,
): Promise<{
  readonly fragments: ReadonlyMap<number, string>;
  readonly diagnostics: readonly Diagnostic[];
}> {
  const targets = equationTargets(document);
  if (targets.length === 0) {
    return { fragments: new Map(), diagnostics: [] };
  }
  const renderer = registry.renderers.find(
    (entry) => entry.id === HTML_RENDERER_ID,
  );
  if (renderer === undefined) {
    return {
      fragments: new Map(),
      diagnostics: [
        groupedAdapterDiagnostic(
          "azeforge.renderer#adapter-missing",
          'No HTML Renderer is registered for equation Blocks.',
          targets,
          sourceName,
          { blockType: "equation", rendererId: HTML_RENDERER_ID },
          "Register the built-in HTML Renderer.",
        ),
      ],
    };
  }
  if (policy.disabledRendererIds?.includes(renderer.id) === true) {
    return {
      fragments: new Map(),
      diagnostics: [
        groupedAdapterDiagnostic(
          "azeforge.renderer#adapter-disabled",
          `HTML Renderer "${renderer.id}" is disabled by host policy.`,
          targets,
          sourceName,
          { rendererId: renderer.id },
          "Enable the Renderer in Compiler policy.",
        ),
      ],
    };
  }
  const candidates = registry.blockRenderers.filter(
    (entry) =>
      entry.descriptor.blockType === "equation" &&
      entry.descriptor.rendererId === HTML_RENDERER_ID,
  );
  if (candidates.length === 0) {
    return {
      fragments: new Map(),
      diagnostics: [
        groupedAdapterDiagnostic(
          "azeforge.renderer#adapter-missing",
          "No Block renderer is registered for equation Blocks.",
          targets,
          sourceName,
          { blockType: "equation", rendererId: HTML_RENDERER_ID },
          "Register the built-in equation HTML Block renderer.",
        ),
      ],
    };
  }
  const compatible = candidates.filter(
    (entry) =>
      targets.every((target) =>
        satisfiesSemverRange(
          target.block.pluginVersion,
          entry.descriptor.pluginVersionRange,
        ),
      ) &&
      satisfiesSemverRange(
        renderer.version,
        entry.descriptor.rendererVersionRange,
      ),
  );
  if (compatible.length === 0) {
    const candidate = candidates[0];
    return {
      fragments: new Map(),
      diagnostics: [
        groupedAdapterDiagnostic(
          "azeforge.renderer#adapter-incompatible",
          "The registered equation Block renderer is incompatible with this Document.",
          targets,
          sourceName,
          {
            blockType: "equation",
            ...(candidate === undefined
              ? {}
              : {
                  adapterId: candidate.descriptor.id,
                  pluginVersionRange: candidate.descriptor.pluginVersionRange,
                  rendererVersionRange:
                    candidate.descriptor.rendererVersionRange,
                }),
          },
          "Register a Block renderer compatible with equation v1 and HTML v1.",
        ),
      ],
    };
  }
  if (compatible.length > 1) {
    return {
      fragments: new Map(),
      diagnostics: [
        groupedAdapterDiagnostic(
          "azeforge.renderer#adapter-ambiguous",
          "More than one Block renderer matches equation Blocks.",
          targets,
          sourceName,
          {
            blockType: "equation",
            adapterIds: compatible.map((entry) => entry.descriptor.id),
          },
          "Register exactly one matching Block renderer.",
        ),
      ],
    };
  }
  const chosen = compatible[0];
  if (chosen === undefined) {
    return { fragments: new Map(), diagnostics: [] };
  }
  if (
    policy.disabledBlockRendererIds?.includes(chosen.descriptor.id) === true
  ) {
    return {
      fragments: new Map(),
      diagnostics: [
        groupedAdapterDiagnostic(
          "azeforge.renderer#adapter-disabled",
          `Block renderer "${chosen.descriptor.id}" is disabled by host policy.`,
          targets,
          sourceName,
          { adapterId: chosen.descriptor.id },
          "Enable the Block renderer in Compiler policy.",
        ),
      ],
    };
  }
  const fragments = new Map<number, string>();
  const diagnostics: Diagnostic[] = [];
  for (const target of targets) {
    const location = {
      ...(sourceName === undefined ? {} : { source: sourceName }),
      range: target.block.range,
    };
    try {
      const fragment = await withRenderTimeout(
        Promise.resolve(
          (chosen.render as EquationBlockRenderer["render"])(target.block, {
            ...(sourceName === undefined ? {} : { sourceName }),
          }),
        ),
        timeoutMs,
      );
      fragments.set(target.index, sanitizeKatexHtml(fragment));
    } catch (error) {
      if (error instanceof RenderTimeoutError) {
        diagnostics.push(
          createDiagnostic(
            "azeforge.renderer#timeout",
            "error",
            `Block renderer "${chosen.descriptor.id}" timed out.`,
            {
              location,
              data: {
                adapterId: chosen.descriptor.id,
                timeoutMs,
              },
              suggestion: "Retry the operation or raise the host render timeout.",
            },
          ),
        );
      } else if (isCapabilityDenial(error)) {
        diagnostics.push(
          createDiagnostic(
            "azeforge.security#capability-denied",
            "error",
            `Block renderer "${chosen.descriptor.id}" was denied a capability.`,
            {
              location,
              data: { adapterId: chosen.descriptor.id },
            },
          ),
        );
      } else {
        diagnostics.push(
          createDiagnostic(
            "azeforge.renderer#unexpected-failure",
            "error",
            "The equation Block renderer failed unexpectedly.",
            {
              location,
              data: {
                adapterId: chosen.descriptor.id,
                blockType: "equation",
              },
            },
          ),
        );
      }
    }
  }
  return { fragments, diagnostics };
}
async function renderMermaidFragments(
  document: AzeDocument,
  registry: ResolvedRegistry,
  policy: CompilerPolicy,
  sourceName: string | undefined,
  timeoutMs: number,
  theme: Theme,
): Promise<{
  readonly fragments: ReadonlyMap<number, string>;
  readonly diagnostics: readonly Diagnostic[];
}> {
  const targets = mermaidTargets(document);
  if (targets.length === 0) {
    return { fragments: new Map(), diagnostics: [] };
  }
  const renderer = registry.renderers.find(
    (entry) => entry.id === HTML_RENDERER_ID,
  );
  if (renderer === undefined) {
    return {
      fragments: new Map(),
      diagnostics: [
        groupedAdapterDiagnostic(
          "azeforge.renderer#adapter-missing",
          "No HTML Renderer is registered for mermaid Blocks.",
          targets,
          sourceName,
          { blockType: MERMAID_PLUGIN_TYPE, rendererId: HTML_RENDERER_ID },
          "Register the built-in HTML Renderer.",
        ),
      ],
    };
  }
  if (policy.disabledRendererIds?.includes(renderer.id) === true) {
    return {
      fragments: new Map(),
      diagnostics: [
        groupedAdapterDiagnostic(
          "azeforge.renderer#adapter-disabled",
          `HTML Renderer "${renderer.id}" is disabled by host policy.`,
          targets,
          sourceName,
          { rendererId: renderer.id },
          "Enable the Renderer in Compiler policy.",
        ),
      ],
    };
  }
  const candidates = registry.blockRenderers.filter(
    (entry) =>
      entry.descriptor.blockType === MERMAID_PLUGIN_TYPE &&
      entry.descriptor.rendererId === HTML_RENDERER_ID,
  );
  if (candidates.length === 0) {
    return {
      fragments: new Map(),
      diagnostics: [
        groupedAdapterDiagnostic(
          "azeforge.renderer#adapter-missing",
          "No Block renderer is registered for mermaid Blocks.",
          targets,
          sourceName,
          { blockType: MERMAID_PLUGIN_TYPE, rendererId: HTML_RENDERER_ID },
          "Register the built-in mermaid HTML Block renderer.",
        ),
      ],
    };
  }
  const compatible = candidates.filter(
    (entry) =>
      targets.every((target) =>
        satisfiesSemverRange(
          target.block.pluginVersion,
          entry.descriptor.pluginVersionRange,
        ),
      ) &&
      satisfiesSemverRange(
        renderer.version,
        entry.descriptor.rendererVersionRange,
      ),
  );
  if (compatible.length === 0) {
    const candidate = candidates[0];
    return {
      fragments: new Map(),
      diagnostics: [
        groupedAdapterDiagnostic(
          "azeforge.renderer#adapter-incompatible",
          "The registered mermaid Block renderer is incompatible with this Document.",
          targets,
          sourceName,
          {
            blockType: MERMAID_PLUGIN_TYPE,
            ...(candidate === undefined
              ? {}
              : {
                  adapterId: candidate.descriptor.id,
                  pluginVersionRange: candidate.descriptor.pluginVersionRange,
                  rendererVersionRange:
                    candidate.descriptor.rendererVersionRange,
                }),
          },
          "Register a Block renderer compatible with mermaid v1 and HTML v1.",
        ),
      ],
    };
  }
  if (compatible.length > 1) {
    return {
      fragments: new Map(),
      diagnostics: [
        groupedAdapterDiagnostic(
          "azeforge.renderer#adapter-ambiguous",
          "More than one Block renderer matches mermaid Blocks.",
          targets,
          sourceName,
          {
            blockType: MERMAID_PLUGIN_TYPE,
            adapterIds: compatible.map((entry) => entry.descriptor.id),
          },
          "Register exactly one matching Block renderer.",
        ),
      ],
    };
  }
  const chosen = compatible[0];
  if (chosen === undefined) {
    return { fragments: new Map(), diagnostics: [] };
  }
  if (
    policy.disabledBlockRendererIds?.includes(chosen.descriptor.id) === true
  ) {
    return {
      fragments: new Map(),
      diagnostics: [
        groupedAdapterDiagnostic(
          "azeforge.renderer#adapter-disabled",
          `Block renderer "${chosen.descriptor.id}" is disabled by host policy.`,
          targets,
          sourceName,
          { adapterId: chosen.descriptor.id },
          "Enable the Block renderer in Compiler policy.",
        ),
      ],
    };
  }
  const fragments = new Map<number, string>();
  const diagnostics: Diagnostic[] = [];
  for (const target of targets) {
    const location = {
      ...(sourceName === undefined ? {} : { source: sourceName }),
      range: target.block.range,
    };
    try {
      const fragment = await withRenderTimeout(
        Promise.resolve(
          (chosen.render as MermaidBlockRenderer["render"])(target.block, {
            ...(sourceName === undefined ? {} : { sourceName }),
            ordinal: target.index,
            theme,
          }),
        ),
        timeoutMs,
      );
      fragments.set(target.index, sanitizeMermaidFragment(fragment, { ordinal: target.index }));
    } catch (error) {
      if (error instanceof RenderTimeoutError) {
        diagnostics.push(
          createDiagnostic(
            "azeforge.renderer#timeout",
            "error",
            `Block renderer "${chosen.descriptor.id}" timed out.`,
            {
              location,
              data: {
                adapterId: chosen.descriptor.id,
                timeoutMs,
              },
              suggestion: "Retry the operation or raise the host render timeout.",
            },
          ),
        );
      } else if (isCapabilityDenial(error)) {
        diagnostics.push(
          createDiagnostic(
            "azeforge.security#capability-denied",
            "error",
            `Block renderer "${chosen.descriptor.id}" was denied a capability.`,
            {
              location,
              data: { adapterId: chosen.descriptor.id },
            },
          ),
        );
      } else {
        diagnostics.push(
          createDiagnostic(
            "azeforge.renderer#unexpected-failure",
            "error",
            "The mermaid Block renderer failed unexpectedly.",
            {
              location,
              data: {
                adapterId: chosen.descriptor.id,
                blockType: MERMAID_PLUGIN_TYPE,
              },
            },
          ),
        );
      }
    }
  }
  return { fragments, diagnostics };
}

export function createCompiler(options: CompilerOptions = {}): Compiler {
  const diagnosticLimits = resolveDiagnosticLimits(options);
  const configuredThemes = options.themes ?? [defaultTheme];
  const themes: Record<string, Theme> = {};
  for (const theme of configuredThemes) {
    if (!THEME_ID.test(theme.id) || !SEMVER.test(theme.version)) {
      throw new CompilerConfigurationError(
        "AZE_CONFIG_THEME_IDENTITY",
        `Theme identity \"${theme.id}@${theme.version}\" is invalid.`,
      );
    }
    validateTheme(theme);
    if (themes[theme.id] !== undefined) {
      throw new CompilerConfigurationError(
        "AZE_CONFIG_THEME_DUPLICATE",
        `Theme \"${theme.id}\" is registered more than once.`,
      );
    }
    themes[theme.id] = copyAndFreezeTheme(theme);
  }
  Object.freeze(themes);

  const defaultThemeId = options.defaultTheme ?? "default";
  if (themes[defaultThemeId] === undefined) {
    throw new CompilerConfigurationError(
      "AZE_CONFIG_DEFAULT_THEME",
      `Default Theme \"${defaultThemeId}\" is not registered.`,
    );
  }
  const registry = freezeRegistryForCompiler(
    resolveRegistry({
      ...(options.plugins === undefined ? {} : { plugins: options.plugins }),
      ...(options.blockRenderers === undefined
        ? {}
        : { blockRenderers: options.blockRenderers }),
      ...(options.renderers === undefined ? {} : { renderers: options.renderers }),
    }),
  );
  const policy: CompilerPolicy = Object.freeze({
    ...(options.policy?.disabledBlockRendererIds === undefined
      ? {}
      : {
          disabledBlockRendererIds: Object.freeze([
            ...options.policy.disabledBlockRendererIds,
          ]),
        }),
    ...(options.policy?.disabledRendererIds === undefined
      ? {}
      : {
          disabledRendererIds: Object.freeze([
            ...options.policy.disabledRendererIds,
          ]),
        }),
  });
  const renderTimeoutMs = options.renderTimeoutMs ?? DEFAULT_RENDER_TIMEOUT_MS;
  if (!Number.isInteger(renderTimeoutMs) || renderTimeoutMs <= 0) {
    throw new CompilerConfigurationError(
      "azeforge.config#render-timeout",
      "Render timeout must be a positive integer number of milliseconds.",
    );
  }

  let fontFacesPromise: Promise<readonly EmbeddedFontFace[]> | undefined;
  const compiler: Compiler = {
    parse(source: string, parseOptions: ParseOptions = {}): ParseResult {
      return limitParseResult(
        parseSource(source, {
          ...parseOptions,
          plugins: parseOptions.plugins ?? registry.plugins,
        }),
        diagnosticLimits,
      );
    },
    validate(parsed: ParseResult): ValidationResult {
      return validateParsed(parsed, diagnosticLimits);
    },
    async compile(source: string, compileOptions: CompileOptions): Promise<CompileResult> {
      const validation = validateParsed(
        limitParseResult(
          parseSource(source, { ...compileOptions, plugins: registry.plugins }),
          diagnosticLimits,
        ),
        diagnosticLimits,
      );
      if (validation.document === undefined) {
        return { diagnostics: validation.diagnostics };
      }
      if (compileOptions.format !== "html") {
        const unsupportedFormat = createDiagnostic(
          "azeforge.renderer#format-unsupported",
          "error",
          `Artifact format \"${String(compileOptions.format)}\" is not supported.`,
          {
            ...(compileOptions.sourceName === undefined
              ? {}
              : { location: { source: compileOptions.sourceName } }),
            data: { format: String(compileOptions.format) },
          },
        );
        return {
          diagnostics: normalizeAndLimitDiagnostics(
            [validation.diagnostics, [unsupportedFormat]],
            diagnosticLimits,
          ),
        };
      }
      const themeId =
        compileOptions.theme ?? validation.document.metadata.theme ?? defaultThemeId;
      const theme = themes[themeId];
      if (theme === undefined) {
        const unknownTheme = createDiagnostic(
          "azeforge.renderer#unknown-theme",
          "error",
          `Theme \"${themeId}\" is not registered.`,
          {
            ...(compileOptions.sourceName === undefined
              ? {}
              : { location: { source: compileOptions.sourceName } }),
            data: { theme: themeId },
          },
        );
        return {
          diagnostics: normalizeAndLimitDiagnostics(
            [validation.diagnostics, [unknownTheme]],
            diagnosticLimits,
          ),
        };
      }
      try {
        const equationPreflight = await renderEquationFragments(
          validation.document,
          registry,
          policy,
          compileOptions.sourceName,
          renderTimeoutMs,
        );
        const mermaidPreflight = await renderMermaidFragments(
          validation.document,
          registry,
          policy,
          compileOptions.sourceName,
          renderTimeoutMs,
          theme,
        );
        const preflightDiagnostics = [
          ...equationPreflight.diagnostics,
          ...mermaidPreflight.diagnostics,
        ];
        if (preflightDiagnostics.length > 0) {
          return {
            diagnostics: normalizeAndLimitDiagnostics(
              [validation.diagnostics, preflightDiagnostics],
              diagnosticLimits,
              validation.document.blocks.map(({ range }) => range),
            ),
          };
        }
        const renderedText = [
          ...(validation.document.metadata.title === undefined
            ? []
            : [validation.document.metadata.title]),
          ...validation.document.blocks.flatMap((block) =>
            block.kind === "equation"
              ? [block.source]
              : block.kind === "mermaid"
                ? [block.source, ...(block.title === undefined ? [] : [block.title])]
                : block.children.map((child) => child.value),
          ),
        ];
        assertInterFontCoverage(renderedText);
        fontFacesPromise ??= loadInterFontFaces();
        const fontFaces = await fontFacesPromise;
        const contentHash = documentContentHash(validation.document);
        const artifact = await renderHtml(
          validation.document,
          contentHash,
          theme,
          fontFaces,
          equationPreflight.fragments,
          katexDependencyClosure(),
          mermaidPreflight.fragments,
          mermaidDependencyClosure(),
        );
        return {
          diagnostics: validation.diagnostics,
          document: validation.document,
          contentHash,
          artifact,
        };
      } catch (error) {
        const rendererFailure =
          error instanceof FontCoverageError
            ? createDiagnostic(
                "azeforge.renderer#font-coverage",
                "error",
                error.message,
                {
                  data: { codePoint: error.codePoint },
                  ...(compileOptions.sourceName === undefined
                    ? {}
                    : { location: { source: compileOptions.sourceName } }),
                },
              )
            : error instanceof ArtifactLimitError
              ? createDiagnostic(
                  "azeforge.renderer#artifact-limit",
                  "error",
                  error.message,
                  {
                    data: { byteLength: error.byteLength },
                    ...(compileOptions.sourceName === undefined
                      ? {}
                      : { location: { source: compileOptions.sourceName } }),
                  },
                )
              : createDiagnostic(
                  "azeforge.renderer#unexpected-failure",
                  "error",
                  "The HTML Renderer failed unexpectedly.",
                  {
                    ...(compileOptions.sourceName === undefined
                      ? {}
                      : { location: { source: compileOptions.sourceName } }),
                  },
                );
        return {
          diagnostics: normalizeAndLimitDiagnostics(
            [validation.diagnostics, [rendererFailure]],
            diagnosticLimits,
          ),
        };
      }
    },
  };
  return Object.freeze(compiler);
}
