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
  ParseOptions,
  ParseResult,
  Theme,
  ValidationResult,
} from "./model.js";
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
    if (block.kind !== "invalid") return block;
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


  let fontFacesPromise: Promise<readonly EmbeddedFontFace[]> | undefined;
  const compiler: Compiler = {
    parse(source: string, parseOptions: ParseOptions = {}): ParseResult {
      return limitParseResult(parseSource(source, parseOptions), diagnosticLimits);
    },
    validate(parsed: ParseResult): ValidationResult {
      return validateParsed(parsed, diagnosticLimits);
    },
    async compile(source: string, compileOptions: CompileOptions): Promise<CompileResult> {
      const validation = validateParsed(
        limitParseResult(parseSource(source, compileOptions), diagnosticLimits),
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
        const renderedText = [
          ...(validation.document.metadata.title === undefined
            ? []
            : [validation.document.metadata.title]),
          ...validation.document.blocks.flatMap((block) =>
            block.children.map((child) => child.value),
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
