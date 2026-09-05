import { CompilerConfigurationError } from "./configuration-error.js";
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
  Diagnostic,
  ParseOptions,
  ParseResult,
  Theme,
  ValidationResult,
} from "./model.js";
import { parseSource } from "./parse.js";
import { ArtifactLimitError, renderHtml } from "./render-html.js";
import { copyAndFreezeTheme, defaultTheme } from "./theme.js";
import { validateDocumentSchema } from "./validate-document.js";

const THEME_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const SEMVER = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;

function validateParsed(parsed: ParseResult): ValidationResult {
  const schemaDiagnostics = validateDocumentSchema(parsed.document);
  const diagnostics = [...parsed.diagnostics, ...schemaDiagnostics];
  if (diagnostics.some(({ severity }) => severity === "error")) {
    return { diagnostics };
  }
  const seenIds = new Set<string>();
  for (const block of parsed.document.blocks) {
    if (block.kind === "invalid" || block.id === undefined) continue;
    if (seenIds.has(block.id)) {
      diagnostics.push({
        code: "AZE_BLOCK_ID_DUPLICATE",
        severity: "error",
        message: `Block ID "${block.id}" is used more than once.`,
        range: block.range,
      });
    } else {
      seenIds.add(block.id);
    }
  }
  if (diagnostics.some(({ severity }) => severity === "error")) {
    return { diagnostics };
  }
  const hasInvalidBlock = parsed.document.blocks.some((block) => block.kind === "invalid");
  if (hasInvalidBlock) {
    diagnostics.push({
      code: "AZE_INVALID_BLOCK",
      severity: "error",
      message: "The Source contains an invalid Block.",
    });
    return { diagnostics };
  }
  const document: AzeDocument = {
    azemarkVersion: parsed.document.azemarkVersion,
    schemaVersion: parsed.document.schemaVersion,
    metadata: parsed.document.metadata,
    blocks: parsed.document.blocks as readonly AzeBlock[],
  };
  return { document, diagnostics };
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
      return parseSource(source, parseOptions);
    },
    validate(parsed: ParseResult): ValidationResult {
      return validateParsed(parsed);
    },
    async compile(source: string, compileOptions: CompileOptions): Promise<CompileResult> {
      const validation = validateParsed(parseSource(source, compileOptions));
      if (validation.document === undefined) {
        return { diagnostics: validation.diagnostics };
      }
      if (compileOptions.format !== "html") {
        const unsupportedFormat: Diagnostic = {
          code: "AZE_FORMAT_UNSUPPORTED",
          severity: "error",
          message: `Artifact format \"${String(compileOptions.format)}\" is not supported.`,
          ...(compileOptions.sourceName === undefined
            ? {}
            : { source: compileOptions.sourceName }),
        };
        return { diagnostics: [...validation.diagnostics, unsupportedFormat] };
      }
      const themeId =
        compileOptions.theme ?? validation.document.metadata.theme ?? defaultThemeId;
      const theme = themes[themeId];
      if (theme === undefined) {
        const unknownTheme: Diagnostic = {
          code: "AZE_THEME_UNKNOWN",
          severity: "error",
          message: `Theme \"${themeId}\" is not registered.`,
          ...(compileOptions.sourceName === undefined
            ? {}
            : { source: compileOptions.sourceName }),
        };
        return { diagnostics: [...validation.diagnostics, unknownTheme] };
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
        const rendererFailure: Diagnostic = {
          code:
            error instanceof FontCoverageError
              ? "AZE_FONT_COVERAGE"
              : error instanceof ArtifactLimitError
                ? "AZE_ARTIFACT_LIMIT"
                : "AZE_RENDERER_FAILURE",
          severity: "error",
          message:
            error instanceof Error
              ? error.message
              : "The HTML Renderer failed unexpectedly.",
          ...(compileOptions.sourceName === undefined
            ? {}
            : { source: compileOptions.sourceName }),
        };
        return { diagnostics: [...validation.diagnostics, rendererFailure] };
      }
    },
  };
  return Object.freeze(compiler);
}
