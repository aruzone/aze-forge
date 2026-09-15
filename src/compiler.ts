import { resolveProjectImages } from "./assets.js";
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
  loadCodeFontFaces,
  loadInterFontFaces,
} from "./font.js";
import type { EmbeddedFontFace } from "./font.js";
import { formatSource } from "./format.js";
import { documentContentHash } from "./hash.js";
import { inlineTextValue } from "./markdown.js";
import type {
  AzeBlock,
  AzeDocument,
  BlockRendererContext,
  CalloutBlock,
  ChartBlock,
  CircuitText,
  GeometryBlock,
  FormulaBlock,
  ReactionBlock,
  StructureBlock,
  CircuitBlock,
  DiagramBlock,
  TimingBlock,
  SequenceTimelineItem,
  StateScopedItem,
  StateTransition,
  CompileOptions,
  CompileResult,
  Compiler,
  CompilerOptions,
  CompilerPolicy,
  Diagnostic,
  FormatOptions,
  FormatResult,
  JsonValue,
  ParsedBlock,
  ParseOptions,
  ParseResult,
  TableBlock,
  Theme,
  PlotBlock,
  SourceRange,
  ValidationResult,
} from "./model.js";
import {
  EquationSanitizerError,
  katexDependencyClosure,
  sanitizeKatexHtml,
} from "./equation.js";
import type {
  DerivationBlock,
  DiagramBlockRenderer,
  EquationBlock,
  MermaidBlock,
  MermaidBlockRenderer,
} from "./model.js";
import {
  MermaidBrowserParseError,
  MermaidBrowserUnavailableError,
} from "./mermaid-browser.js";
import {
  MermaidSanitizerError,
  mermaidDependencyClosure,
  sanitizeMermaidFragment,
} from "./mermaid.js";
import { MERMAID_PLUGIN_TYPE } from "./mermaid-schemas.js";
import { DIAGRAM_PLUGIN_TYPE } from "./diagram-schemas.js";
import { DiagramRenderError, diagramDependencyClosure } from "./diagram-render.js";
import { DiagramLayoutError } from "./diagram-layout.js";
import { ControlRenderError, controlDependencyClosure } from "./control-render.js";
import { ControlLayoutError } from "./control-layout.js";
import { FreeBodyRenderError, freeBodyDependencyClosure } from "./free-body-render.js";
import { ModelsRenderError } from "./models-render.js";
import { isTypedTableData } from "./table.js";
import { DERIVATION_PLUGIN_TYPE } from "./derivation-schemas.js";
import { FragmentSecurityError } from "./html-fragment.js";
import {
  freezeRegistryForCompiler,
  resolveRegistry,
  satisfiesSemverRange,
} from "./registry.js";
import type { ResolvedRegistry } from "./registry.js";
import { parseSource } from "./parse.js";
import { ArtifactLimitError, createHtmlLayout, documentTitle, renderHtml } from "./render-html.js";
import {
  pinnedPdfBrowserCapability,
  PdfArtifactLimitError,
  renderPdf,
} from "./render-pdf.js";
import {
  pinnedSvgBrowserCapability,
  renderSvg,
  SvgArtifactLimitError,
} from "./render-svg.js";
import {
  pinnedPngBrowserCapability,
  PngArtifactLimitError,
  renderPng,
} from "./render-png.js";
import { validateBlockIds } from "./reference-validation.js";
import { builtInThemes, copyAndFreezeTheme } from "./theme.js";
import { validateDocumentSchema } from "./validate-document.js";
const THEME_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const SEMVER = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;
const BUILT_IN_RENDERER_VERSION_BY_FORMAT = {
  html: "1.0.0",
  svg: "1.0.0",
  png: "1.0.0",
  pdf: "1.0.0",
} as const;

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
  const blockRanges = collectBlockRanges(parsed.document.blocks);
  const referenceDiagnostics = validateBlockIds(
    collectBlockIds(parsed.document.blocks),
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

  const invalidBlockDiagnostics = containsInvalidBlock(parsed.document.blocks)
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

function sameFormatMeaning(
  before: ValidationResult,
  after: ValidationResult,
): boolean {
  if (before.document !== undefined) {
    return (
      after.document !== undefined &&
      documentContentHash(after.document) === documentContentHash(before.document)
    );
  }
  if (after.document !== undefined) return false;
  const beforeCodes = before.diagnostics.map(({ code }) => code);
  const afterCodes = after.diagnostics.map(({ code }) => code);
  return (
    beforeCodes.length === afterCodes.length &&
    beforeCodes.every((code, index) => code === afterCodes[index])
  );
}

function validateTheme(theme: Theme): void {
  const validScheme = theme.colorScheme === "light" || theme.colorScheme === "dark";
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
  if (!validScheme || !validColors || !validGeometry || !validTypography) {
    throw new CompilerConfigurationError(
      "AZE_CONFIG_THEME_VALUES",
      `Theme "${theme.id}" contains unsafe or invalid tokens.`,
    );
  }
}

export const DEFAULT_RENDER_TIMEOUT_MS = 5000;

class RenderTimeoutError extends Error {
  constructor() {
    super("The equation Block renderer timed out.");
    this.name = "RenderTimeoutError";
  }
}

function withRenderTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new RenderTimeoutError()), timeoutMs);
  });
  return Promise.race([work, timeout]).finally(() => {
    clearTimeout(timer);
  });
}

class BlockRendererSyncError extends Error {
  readonly adapterId: string;
  readonly blockType: string;

  constructor(adapterId: string, blockType: string) {
    super(`Block renderer "${adapterId}" must be synchronous.`);
    this.name = "AdapterSyncError";
    this.adapterId = adapterId;
    this.blockType = blockType;
  }
}

class CompilerCancelledError extends Error {
  constructor() {
    super("The operation was cancelled before publication.");
    this.name = "CompilerCancelledError";
  }
}

function throwIfCancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) throw new CompilerCancelledError();
}

function isCapabilityDenial(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if (!("code" in error)) return false;
  return error.code === "AZE_CAPABILITY_DENIED";
}

interface EquationTarget {
  readonly block: EquationBlock;
}
function walkBlocks(
  blocks: readonly ParsedBlock[],
  visit: (block: ParsedBlock) => void,
): void {
  for (const block of blocks) {
    visit(block);
    if (block.kind === "blockquote" || block.kind === "callout") {
      walkBlocks(block.children as readonly AzeBlock[], visit);
    } else if (block.kind === "list") {
      for (const item of block.items) {
        walkBlocks(item.blocks as readonly AzeBlock[], visit);
      }
    }
  }
}

function equationTargets(document: AzeDocument): readonly EquationTarget[] {
  const targets: EquationTarget[] = [];
  walkBlocks(document.blocks, (block) => {
    if (block.kind === "equation") targets.push({ block });
  });
  return targets;
}
interface DerivationTarget {
  readonly block: DerivationBlock;
}

function derivationTargets(document: AzeDocument): readonly DerivationTarget[] {
  const targets: DerivationTarget[] = [];
  walkBlocks(document.blocks, (block) => {
    if (block.kind === "derivation") targets.push({ block });
  });
  return targets;
}
interface DiagramTarget {
  readonly block: DiagramBlock;
  readonly ordinal: number;
}

function diagramTargets(document: AzeDocument): readonly DiagramTarget[] {
  const targets: DiagramTarget[] = [];
  walkBlocks(document.blocks, (block) => {
    if (block.kind === "diagram") {
      targets.push({ block, ordinal: targets.length });
    }
  });
  return targets;
}

interface MermaidTarget {
  readonly block: MermaidBlock;
  readonly ordinal: number;
}

function mermaidTargets(document: AzeDocument): readonly MermaidTarget[] {
  const targets: MermaidTarget[] = [];
  walkBlocks(document.blocks, (block) => {
    if (block.kind === "mermaid") {
      targets.push({ block, ordinal: targets.length });
    }
  });
  return targets;
}


function pluginBlocks(document: AzeDocument, blockType: string): readonly ParsedBlock[] {
  const targets: ParsedBlock[] = [];
  walkBlocks(document.blocks, (block) => {
    if (block.kind === blockType) targets.push(block);
  });
  return targets;
}

function collectBlockIds(blocks: readonly ParsedBlock[]): { id: string; range: SourceRange }[] {
  const occurrences: { id: string; range: SourceRange }[] = [];
  walkBlocks(blocks, (block) => {
    if (block.kind !== "invalid" && block.id !== undefined) {
      occurrences.push({ id: block.id, range: block.range });
    }
  });
  return occurrences;
}
function containsInvalidBlock(blocks: readonly ParsedBlock[]): boolean {
  let found = false;
  walkBlocks(blocks, (block) => {
    if (block.kind === "invalid") found = true;
  });
  return found;
}

function collectBlockRanges(blocks: readonly ParsedBlock[]): SourceRange[] {
  const ranges: SourceRange[] = [];
  walkBlocks(blocks, (block) => {
    ranges.push(block.range);
  });
  return ranges;
}

function collectRenderText(blocks: readonly AzeBlock[], out: string[]): void {
  for (const block of blocks) {
    switch (block.kind) {
      case "equation":
        if (block.notation === "latex") {
          if (block.tex !== undefined) out.push(block.tex);
        } else if (block.spelling !== undefined) {
          out.push(block.spelling);
        }
        break;
      case "derivation":
        for (const step of block.steps) {
          out.push(step.expression);
          if (step.annotation !== undefined) out.push(inlineTextValue(step.annotation));
        }
        break;
      case "mermaid":
        out.push(block.source);
        if (block.title !== undefined) out.push(block.title);
        if (block.description !== undefined) out.push(block.description);
        break;
      case "heading":
      case "paragraph":
        out.push(inlineTextValue(block.children));
        break;
      case "code":
        out.push(block.value);
        if (block.language !== undefined) out.push(block.language);
        break;
      case "thematicBreak":
        break;
      case "blockquote":
      case "callout":
        if (block.kind === "callout" && block.title !== undefined) {
          out.push(inlineTextValue(block.title));
        }
        collectRenderText(block.children as readonly AzeBlock[], out);
        break;
      case "list":
        for (const item of block.items) {
          collectRenderText(item.blocks as readonly AzeBlock[], out);
        }
        break;
      case "table":
        if (block.caption !== undefined) {
          out.push(inlineTextValue(block.caption));
        }
        if (isTypedTableData(block.data)) {
          for (const column of block.data.columns) {
            if (column.name !== undefined) out.push(column.name);
          }
          for (const row of block.data.rows) {
            for (const cell of Object.values(row)) {
              if (Array.isArray(cell)) out.push(inlineTextValue(cell));
              else if (cell !== null && cell !== undefined) out.push(String(cell));
            }
          }
        } else {
          for (const cell of block.data.header) {
            out.push(inlineTextValue(cell));
          }
          for (const row of block.data.rows) {
            for (const cell of row) {
              out.push(inlineTextValue(cell));
            }
          }
        }
        break;
      case "plot":
        if (block.id !== undefined) out.push(block.id);
        if (block.xAxis.label !== undefined) out.push(block.xAxis.label);
        if (block.yAxis.label !== undefined) out.push(block.yAxis.label);
        for (const entry of block.series) {
          if (entry.label !== undefined) out.push(entry.label);
          if (entry.kind === "function") out.push(entry.expression);
        }
        break;
      case "chart":
        if (block.id !== undefined) out.push(block.id);
        if (block.xLabel !== undefined) out.push(block.xLabel);
        if (block.yLabel !== undefined) out.push(block.yLabel);
        for (const entry of block.series) {
          if (entry.label !== undefined) out.push(entry.label);
          if (entry.kind === "bars") {
            for (const bar of entry.bars) out.push(bar.category);
          }
        }
        break;
      case "geometry":
        if (block.id !== undefined) out.push(block.id);
        for (const entry of block.declarations) {
          if (entry.name !== undefined) out.push(entry.name);
          if (entry.label !== undefined) out.push(entry.label);
        }
        break;
      case "formula":
        if (block.id !== undefined) out.push(block.id);
        out.push(block.expression);
        break;
      case "reaction":
        if (block.id !== undefined) out.push(block.id);
        for (const entry of block.reactants) out.push(entry.expression);
        for (const entry of block.products) out.push(entry.expression);
        break;
      case "structure":
        if (block.id !== undefined) out.push(block.id);
        for (const atom of block.atoms) {
          if (atom.element !== undefined) out.push(atom.element);
          if (atom.attach !== undefined) out.push(atom.attach);
        }
        for (const label of block.labels ?? []) out.push(label.text);
        break;
      case "circuit":
        if (block.id !== undefined) out.push(block.id);
        for (const run of block.title) {
          out.push(run.kind === "quantity" ? `${run.coefficient} ${run.prefix}${run.unit}` : run.value);
        }
        for (const component of block.components) {
          for (const text of [component.name, component.value]) {
            if (text === undefined) continue;
            for (const run of text) {
              out.push(run.kind === "quantity" ? `${run.coefficient} ${run.prefix}${run.unit}` : run.value);
            }
          }
        }
        break;
      case "diagram": {
        if (block.id !== undefined) out.push(block.id);
        const texts: CircuitText[] = [];
        const push = (value: CircuitText | undefined): void => {
          if (value !== undefined) texts.push(value);
        };
        push(block.title);
        push(block.description);
        for (const declaration of block.declarations) {
          if (declaration.kind === "node") {
            if (declaration.label === undefined) {
              out.push(declaration.name);
            } else {
              for (const line of declaration.label) texts.push(line);
            }
            for (const port of declaration.ports) out.push(port.name);
            continue;
          }
          if (declaration.kind === "group") {
            if (declaration.label === undefined) out.push(declaration.name);
            else for (const line of declaration.label) texts.push(line);
            continue;
          }
          if (declaration.label !== undefined) {
            for (const line of declaration.label) texts.push(line);
          }
        }
        for (const text of texts) {
          for (const run of text) {
            out.push(run.kind === "quantity" ? `${run.coefficient} ${run.prefix}${run.unit}` : run.value);
          }
        }
        break;
      }
      case "control": {
        if (block.id !== undefined) out.push(block.id);
        const texts: CircuitText[] = [];
        const push = (value: CircuitText | undefined): void => {
          if (value !== undefined) texts.push(value);
        };
        push(block.title);
        push(block.description);
        for (const declaration of block.declarations) {
          if (declaration.kind === "block") {
            texts.push(declaration.tf);
            push(declaration.label);
            continue;
          }
          if (declaration.kind === "edge") {
            push(declaration.label);
            continue;
          }
          if (declaration.kind === "sum") continue;
          texts.push(declaration.label);
        }
        for (const text of texts) {
          for (const run of text) {
            out.push(run.kind === "quantity" ? `${run.coefficient} ${run.prefix}${run.unit}` : run.value);
          }
        }
        break;
      }
      case "free-body": {
        if (block.id !== undefined) out.push(block.id);
        const texts: CircuitText[] = [];
        const push = (value: CircuitText | undefined): void => {
          if (value !== undefined) texts.push(value);
        };
        push(block.title);
        push(block.description);
        for (const declaration of block.declarations) {
          switch (declaration.kind) {
            case "point":
              push(declaration.label);
              break;
            case "force":
              push(declaration.label);
              break;
            case "moment":
              push(declaration.label);
              break;
            case "axes":
              texts.push(declaration.xLabel, declaration.yLabel);
              break;
            case "angle-mark":
              push(declaration.label);
              break;
            case "dimension":
              texts.push(declaration.label);
              break;
            default:
              break;
          }
        }
        for (const text of texts) {
          for (const run of text) {
            out.push(run.kind === "quantity" ? `${run.coefficient} ${run.prefix}${run.unit}` : run.value);
          }
        }
        break;
      }
      case "timing": {
        if (block.id !== undefined) out.push(block.id);
        const texts = [
          block.title,
          ...(block.description === undefined ? [] : [block.description]),
          ...block.signals.flatMap((signal) =>
            signal.intervals.flatMap((interval) => (interval.value === undefined ? [] : [interval.value])),
          ),
          ...block.groups.map((group) => group.label),
          ...block.markers.flatMap((marker) => (marker.label === undefined ? [] : [marker.label])),
          ...block.arrows.flatMap((arrow) => (arrow.label === undefined ? [] : [arrow.label])),
        ];
        for (const text of texts) {
          for (const run of text) {
            out.push(run.kind === "quantity" ? `${run.coefficient} ${run.prefix}${run.unit}` : run.value);
          }
        }
        for (const signal of block.signals) out.push(signal.ref);
        break;
      }

      case "sequence": {
        if (block.id !== undefined) out.push(block.id);
        if (block.title !== undefined) out.push(block.title);
        if (block.description !== undefined) out.push(block.description);
        for (const participant of block.participants) {
          out.push(participant.name);
          if (participant.label !== undefined) out.push(participant.label);
        }
        const timelineText = (items: readonly SequenceTimelineItem[]): void => {
          for (const item of items) {
            if (item.kind === "message") {
              if (item.text !== undefined) out.push(item.text);
              continue;
            }
            if (item.kind === "note") {
              out.push(item.text);
              continue;
            }
            if (item.kind === "loop") {
              if (item.condition !== undefined) out.push(item.condition);
              timelineText(item.body);
              continue;
            }
            for (const division of item.divisions) {
              if (division.condition !== undefined) out.push(division.condition);
              timelineText(division.body);
            }
          }
        };
        timelineText(block.timeline);
        break;
      }
      case "state": {
        if (block.id !== undefined) out.push(block.id);
        if (block.title !== undefined) out.push(block.title);
        if (block.description !== undefined) out.push(block.description);
        const stateText = (items: readonly (StateScopedItem | StateTransition)[]): void => {
          for (const item of items) {
            if (item.kind === "transition") {
              if (item.trigger !== undefined) out.push(item.trigger);
              if (item.guard !== undefined) out.push(item.guard);
              if (item.action !== undefined) out.push(item.action);
              continue;
            }
            out.push(item.name);
            if (item.kind === "state") {
              if (item.label !== undefined) out.push(item.label);
              stateText(item.states);
            }
          }
        };
        stateText(block.items);
        break;
      }
      case "entity": {
        if (block.id !== undefined) out.push(block.id);
        if (block.title !== undefined) out.push(block.title);
        if (block.description !== undefined) out.push(block.description);
        for (const item of block.items) {
          if (item.kind === "relationship") {
            if (item.label !== undefined) out.push(item.label);
            if (item.first.role !== undefined) out.push(item.first.role);
            if (item.second.role !== undefined) out.push(item.second.role);
            continue;
          }
          out.push(item.name);
          if (item.label !== undefined) out.push(item.label);
          for (const attribute of item.attributes ?? []) {
            out.push(attribute.name);
            if (attribute.type !== undefined) out.push(attribute.type);
          }
        }
        break;
      }
      case "class": {
        if (block.id !== undefined) out.push(block.id);
        if (block.title !== undefined) out.push(block.title);
        if (block.description !== undefined) out.push(block.description);
        for (const item of block.items) {
          if (item.kind === "relationship") {
            if (item.label !== undefined) out.push(item.label);
            continue;
          }
          out.push(item.name);
          if (item.label !== undefined) out.push(item.label);
          for (const attribute of item.attributes ?? []) {
            out.push(attribute.name);
            if (attribute.type !== undefined) out.push(attribute.type);
          }
          for (const operation of item.operations) {
            out.push(operation.name);
            if (operation.returnType !== undefined) out.push(operation.returnType);
            for (const parameter of operation.parameters ?? []) {
              out.push(parameter.name);
              if (parameter.type !== undefined) out.push(parameter.type);
            }
          }
        }
        break;
      }
    }
  }
}

function groupedAdapterDiagnostic(
  code: string,
  message: string,
  targets: readonly { readonly block: { readonly range: SourceRange } }[],
  sourceName: string | undefined,
  data: Readonly<Record<string, JsonValue>>,
  suggestion: string,
  noun = "equation",
): Diagnostic {
  const first = targets[0];
  const rest = targets.slice(1).map(({ block }) => ({
    ...(sourceName === undefined ? {} : { source: sourceName }),
    range: block.range,
    message: `Another affected ${noun} Block is here.`,
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
  rendererId: string,
  registry: ResolvedRegistry,
  policy: CompilerPolicy,
  sourceName: string | undefined,
  timeoutMs: number,
): Promise<{
  readonly fragments: ReadonlyMap<EquationBlock, string>;
  readonly diagnostics: readonly Diagnostic[];
}> {
  const targets = equationTargets(document);
  const rendererName = rendererId.toUpperCase();
  if (targets.length === 0) {
    return { fragments: new Map(), diagnostics: [] };
  }
  const renderer = registry.renderers.find(
    (entry) => entry.id === rendererId,
  );
  if (renderer === undefined) {
    return {
      fragments: new Map(),
      diagnostics: [
        groupedAdapterDiagnostic(
          "azeforge.renderer#adapter-missing",
          `No ${rendererName} Renderer is registered for equation Blocks.`,
          targets,
          sourceName,
          { blockType: "equation", rendererId },
          `Register the built-in ${rendererName} Renderer.`,
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
          `${rendererName} Renderer "${renderer.id}" is disabled by host policy.`,
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
      entry.descriptor.rendererId === rendererId,
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
          { blockType: "equation", rendererId },
          `Register the built-in equation ${rendererName} Block renderer.`,
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
          `Register a Block renderer compatible with equation v1 and ${rendererName} v1.`,
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
  // Safe: candidates were filtered to blockType "equation", so the render
  // implementation accepts EquationBlock even though the registry union is wider.
  const renderEquation = chosen.render as (
    block: EquationBlock,
    context: Readonly<{ sourceName?: string }>,
  ) => string | Promise<string>;
  const fragments = new Map<EquationBlock, string>();
  const diagnostics: Diagnostic[] = [];
  for (const target of targets) {
    const location = {
      ...(sourceName === undefined ? {} : { source: sourceName }),
      range: target.block.range,
    };
    try {
      const fragment = await withRenderTimeout(
        Promise.resolve(
          renderEquation(target.block, {
            ...(sourceName === undefined ? {} : { sourceName }),
          }),
        ),
        timeoutMs,
      );
      fragments.set(target.block, sanitizeKatexHtml(fragment));
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
              suggestion: "Retry the operation or adjust the host render timeout.",
            },
          ),
        );
      } else if (
        error instanceof EquationSanitizerError ||
        error instanceof FragmentSecurityError
      ) {
        diagnostics.push(
          createDiagnostic(
            "azeforge.security#sanitizer-rewrite",
            "error",
            "A Fragment failed final sanitization; refusing to publish.",
            {
              location,
              data: {
                adapterId: chosen.descriptor.id,
                blockType: "equation",
              },
              suggestion:
                "Remove the unsafe construct or report this Source as a sanitizer failure.",
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
async function renderDerivationFragments(
  document: AzeDocument,
  rendererId: string,
  registry: ResolvedRegistry,
  policy: CompilerPolicy,
  sourceName: string | undefined,
  timeoutMs: number,
): Promise<{
  readonly fragments: ReadonlyMap<DerivationBlock, string>;
  readonly diagnostics: readonly Diagnostic[];
}> {
  const targets = derivationTargets(document);
  const rendererName = rendererId.toUpperCase();
  if (targets.length === 0) {
    return { fragments: new Map(), diagnostics: [] };
  }
  const candidates = registry.blockRenderers.filter(
    (entry) =>
      entry.descriptor.blockType === DERIVATION_PLUGIN_TYPE &&
      entry.descriptor.rendererId === rendererId,
  );
  if (candidates.length === 0) {
    return {
      fragments: new Map(),
      diagnostics: [
        groupedAdapterDiagnostic(
          "azeforge.renderer#adapter-missing",
          `No Block renderer is registered for derivation Blocks.`,
          targets,
          sourceName,
          { blockType: DERIVATION_PLUGIN_TYPE, rendererId },
          `Register the built-in derivation ${rendererName} Block renderer.`,
          "derivation",
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
        registry.renderers.find(({ id }) => id === rendererId)?.version ?? "0.0.0",
        entry.descriptor.rendererVersionRange,
      ),
  );
  if (compatible.length === 0) {
    return {
      fragments: new Map(),
      diagnostics: [
        groupedAdapterDiagnostic(
          "azeforge.renderer#adapter-incompatible",
          "The registered derivation Block renderer is incompatible with this Document.",
          targets,
          sourceName,
          { blockType: DERIVATION_PLUGIN_TYPE, rendererId },
          `Register a Block renderer compatible with derivation v1 and ${rendererName} v1.`,
          "derivation",
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
          "More than one Block renderer matches derivation Blocks.",
          targets,
          sourceName,
          {
            blockType: DERIVATION_PLUGIN_TYPE,
            adapterIds: compatible.map((entry) => entry.descriptor.id),
          },
          "Register exactly one matching Block renderer.",
          "derivation",
        ),
      ],
    };
  }
  const chosen = compatible[0];
  if (chosen === undefined) {
    return { fragments: new Map(), diagnostics: [] };
  }
  if (policy.disabledBlockRendererIds?.includes(chosen.descriptor.id) === true) {
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
          "derivation",
        ),
      ],
    };
  }
  const render = chosen.render as (
    block: DerivationBlock,
    context: Readonly<{ sourceName?: string }>,
  ) => string | Promise<string>;
  const fragments = new Map<DerivationBlock, string>();
  const diagnostics: Diagnostic[] = [];
  for (const target of targets) {
    const location = {
      ...(sourceName === undefined ? {} : { source: sourceName }),
      range: target.block.range,
    };
    try {
      const fragment = await withRenderTimeout(
        Promise.resolve(
          render(target.block, {
            ...(sourceName === undefined ? {} : { sourceName }),
          }),
        ),
        timeoutMs,
      );
      fragments.set(target.block, sanitizeKatexHtml(fragment));
    } catch (error) {
      if (error instanceof RenderTimeoutError) {
        diagnostics.push(
          createDiagnostic(
            "azeforge.renderer#timeout",
            "error",
            `Block renderer "${chosen.descriptor.id}" timed out.`,
            {
              location,
              data: { adapterId: chosen.descriptor.id, timeoutMs },
              suggestion: "Retry the operation or adjust the host render timeout.",
            },
          ),
        );
      } else if (
        error instanceof EquationSanitizerError ||
        error instanceof FragmentSecurityError
      ) {
        diagnostics.push(
          createDiagnostic(
            "azeforge.security#sanitizer-rewrite",
            "error",
            "A Fragment failed final sanitization; refusing to publish.",
            {
              location,
              data: {
                adapterId: chosen.descriptor.id,
                blockType: DERIVATION_PLUGIN_TYPE,
              },
              suggestion:
                "Remove the unsafe construct or report this Source as a sanitizer failure.",
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
            "The derivation Block renderer failed unexpectedly.",
            {
              location,
              data: { adapterId: chosen.descriptor.id, blockType: DERIVATION_PLUGIN_TYPE },
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
  rendererId: string,
  registry: ResolvedRegistry,
  policy: CompilerPolicy,
  sourceName: string | undefined,
  timeoutMs: number,
  theme: Theme,
): Promise<{
  readonly fragments: ReadonlyMap<MermaidBlock, string>;
  readonly diagnostics: readonly Diagnostic[];
}> {
  const targets = mermaidTargets(document);
  const rendererName = rendererId.toUpperCase();
  if (targets.length === 0) {
    return { fragments: new Map(), diagnostics: [] };
  }
  const renderer = registry.renderers.find(
    (entry) => entry.id === rendererId,
  );
  if (renderer === undefined) {
    return {
      fragments: new Map(),
      diagnostics: [
        groupedAdapterDiagnostic(
          "azeforge.renderer#adapter-missing",
          `No ${rendererName} Renderer is registered for mermaid Blocks.`,
          targets,
          sourceName,
          { blockType: MERMAID_PLUGIN_TYPE, rendererId },
          `Register the built-in ${rendererName} Renderer.`,
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
          `${rendererName} Renderer "${renderer.id}" is disabled by host policy.`,
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
      entry.descriptor.rendererId === rendererId,
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
          { blockType: MERMAID_PLUGIN_TYPE, rendererId },
          `Register the built-in mermaid ${rendererName} Block renderer.`,
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
          `Register a Block renderer compatible with mermaid v1 and ${rendererName} v1.`,
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
  const fragments = new Map<MermaidBlock, string>();
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
            ordinal: target.ordinal,
            theme,
          }),
        ),
        timeoutMs,
      );
      fragments.set(
        target.block,
        sanitizeMermaidFragment(fragment, { ordinal: target.ordinal }),
      );
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
              suggestion: "Retry the operation or adjust the host render timeout.",
            },
          ),
        );
      } else if (error instanceof MermaidBrowserParseError) {
        diagnostics.push(
          createDiagnostic(
            "azeforge.mermaid#invalid-syntax",
            "error",
            "The mermaid diagram could not be parsed.",
            {
              location,
              suggestion: "Check node brackets, arrows, and participant declarations.",
              data: {
                diagramType: target.block.diagramType,
                detail: error.message,
              },
            },
          ),
        );
      } else if (error instanceof MermaidBrowserUnavailableError) {
        diagnostics.push(
          createDiagnostic(
            "azeforge.renderer#adapter-missing",
            "error",
            "The pinned Mermaid browser engine is unavailable.",
            {
              location,
              data: {
                blockType: MERMAID_PLUGIN_TYPE,
                engine: "HeadlessChrome",
              },
              suggestion: "Reinstall AzeForge browser dependencies and retry.",
            },
          ),
        );
      } else if (
        error instanceof MermaidSanitizerError ||
        error instanceof FragmentSecurityError
      ) {
        diagnostics.push(
          createDiagnostic(
            "azeforge.security#sanitizer-rewrite",
            "error",
            "A Fragment failed final sanitization; refusing to publish.",
            {
              location,
              data: {
                adapterId: chosen.descriptor.id,
                blockType: MERMAID_PLUGIN_TYPE,
              },
              suggestion:
                "Remove the unsafe construct or report this Source as a sanitizer failure.",
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

/**
 * One Block awaiting a family Fragment, tagged with the kind whose registered
 * Block renderer resolves it. Each family walks its own Blocks, but the
 * preflight below treats every family identically.
 */
interface FragmentTarget {
  readonly kind: string;
  readonly block: AzeBlock & { readonly pluginVersion: string };
}

/** The diagnostic fields a family's own render error carries. */
interface FragmentRenderFailure {
  readonly code: string;
  readonly message: string;
  readonly remedy: string;
}

/**
 * The per-family inputs of the shared Fragment preflight. `selectTargets`
 * walks the Document in order, so every kind's ordinal reproduces the emission
 * order; `synchronous` records whether that family's Block renderers must
 * answer without yielding to the microtask queue.
 */
interface FragmentFamily {
  readonly blockType: string;
  readonly label: string;
  readonly kinds: readonly string[];
  readonly selectTargets: (document: AzeDocument) => readonly FragmentTarget[];
  readonly synchronous: boolean;
  readonly failure: (error: unknown) => FragmentRenderFailure | undefined;
}

/**
 * The positional Fragment families share this preflight: each figure receives
 * its per-kind ordinal and this Document's Theme, because the emitter sizes
 * every box through the Advance metric, so layout and paint must agree on one
 * Theme. Running it before HTML assembly means a failure here publishes no
 * Artifact. Renderer, Block renderer and version compatibility are resolved
 * before any Block is rendered, so a family with no Block emits nothing while
 * a family whose Blocks cannot be resolved emits bounded adapter diagnostics
 * instead of a partial figure.
 */
async function renderFamilyFragments(
  document: AzeDocument,
  rendererId: string,
  registry: ResolvedRegistry,
  policy: CompilerPolicy,
  sourceName: string | undefined,
  theme: Theme,
  family: FragmentFamily,
): Promise<{
  readonly fragments: ReadonlyMap<AzeBlock, string>;
  readonly diagnostics: readonly Diagnostic[];
}> {
  const targets = family.selectTargets(document);
  if (targets.length === 0) {
    return { fragments: new Map(), diagnostics: [] };
  }
  const rendererName = rendererId.toUpperCase();
  const renderer = registry.renderers.find((entry) => entry.id === rendererId);
  if (renderer === undefined) {
    return {
      fragments: new Map(),
      diagnostics: [
        groupedAdapterDiagnostic(
          "azeforge.renderer#adapter-missing",
          `No ${rendererName} Renderer is registered for ${family.label} Blocks.`,
          targets,
          sourceName,
          { blockType: family.blockType, rendererId },
          `Register the built-in ${rendererName} Renderer.`,
          family.blockType,
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
          `${rendererName} Renderer "${renderer.id}" is disabled by host policy.`,
          targets,
          sourceName,
          { rendererId: renderer.id },
          "Enable the Renderer in Compiler policy.",
          family.blockType,
        ),
      ],
    };
  }
  const fragments = new Map<AzeBlock, string>();
  const diagnostics: Diagnostic[] = [];
  for (const kind of family.kinds) {
    const kindTargets = targets.filter((target) => target.kind === kind);
    if (kindTargets.length === 0) continue;
    const candidates = registry.blockRenderers.filter(
      (entry) => entry.descriptor.blockType === kind && entry.descriptor.rendererId === rendererId,
    );
    if (candidates.length === 0) {
      diagnostics.push(
        groupedAdapterDiagnostic(
          "azeforge.renderer#adapter-missing",
          `No Block renderer is registered for ${kind} Blocks.`,
          kindTargets,
          sourceName,
          { blockType: kind, rendererId },
          `Register the built-in ${kind} ${rendererName} Block renderer.`,
          kind,
        ),
      );
      continue;
    }
    const compatible = candidates.filter(
      (entry) =>
        kindTargets.every((target) =>
          satisfiesSemverRange(target.block.pluginVersion, entry.descriptor.pluginVersionRange),
        ) && satisfiesSemverRange(renderer.version, entry.descriptor.rendererVersionRange),
    );
    if (compatible.length === 0) {
      diagnostics.push(
        groupedAdapterDiagnostic(
          "azeforge.renderer#adapter-incompatible",
          `The registered ${kind} Block renderer is incompatible with this Document.`,
          kindTargets,
          sourceName,
          {
            blockType: kind,
            adapterIds: candidates.map((entry) => entry.descriptor.id),
          },
          "Register a Block renderer whose plugin and renderer ranges match.",
          kind,
        ),
      );
      continue;
    }
    if (compatible.length > 1) {
      diagnostics.push(
        groupedAdapterDiagnostic(
          "azeforge.renderer#adapter-ambiguous",
          `More than one ${kind} Block renderer matches this Document.`,
          kindTargets,
          sourceName,
          { blockType: kind, adapterIds: compatible.map((entry) => entry.descriptor.id) },
          "Register exactly one matching Block renderer.",
          kind,
        ),
      );
      continue;
    }
    const chosen = compatible[0]!;
    if (policy.disabledBlockRendererIds?.includes(chosen.descriptor.id) === true) {
      diagnostics.push(
        groupedAdapterDiagnostic(
          "azeforge.renderer#adapter-disabled",
          `Block renderer "${chosen.descriptor.id}" is disabled by host policy.`,
          kindTargets,
          sourceName,
          { adapterId: chosen.descriptor.id },
          "Enable the Block renderer in Compiler policy.",
          kind,
        ),
      );
      continue;
    }
    const render = chosen.render as (
      block: AzeBlock & { readonly pluginVersion: string },
      context: Readonly<{ sourceName?: string; ordinal?: number; theme?: Theme }>,
    ) => string | Promise<string>;
    let ordinal = 0;
    for (const target of kindTargets) {
      const location =
        sourceName === undefined
          ? { range: target.block.range }
          : { source: sourceName, range: target.block.range };
      try {
        const rendered = render(target.block, {
          ...(sourceName === undefined ? {} : { sourceName }),
          ordinal,
          theme,
        });
        // A synchronous family must not let the microtask queue launder a
        // Promise into a string, so its result is inspected before any await.
        const markup = family.synchronous ? rendered : await Promise.resolve(rendered);
        if (typeof markup !== "string") {
          throw new BlockRendererSyncError(chosen.descriptor.id, kind);
        }
        fragments.set(target.block, markup);
      } catch (error) {
        const failure = family.failure(error);
        if (failure !== undefined) {
          diagnostics.push(
            createDiagnostic(failure.code, "error", failure.message, {
              location,
              data: { adapterId: chosen.descriptor.id, blockType: kind },
              suggestion: failure.remedy,
            }),
          );
        } else if (error instanceof BlockRendererSyncError) {
          diagnostics.push(
            createDiagnostic(
              "azeforge.renderer#adapter-sync",
              "error",
              `Block renderer "${error.adapterId}" must be synchronous.`,
              {
                location,
                data: { adapterId: error.adapterId, blockType: kind },
                suggestion: "Register a synchronous Block renderer.",
              },
            ),
          );
        } else {
          diagnostics.push(
            createDiagnostic(
              "azeforge.renderer#unexpected-failure",
              "error",
              `The ${kind} Block renderer failed unexpectedly.`,
              { location, data: { adapterId: chosen.descriptor.id, blockType: kind } },
            ),
          );
        }
      }
      ordinal += 1;
    }
  }
  return { fragments, diagnostics };
}

const MODEL_KINDS = ["sequence", "state", "entity", "class"] as const;

function modelTargets(document: AzeDocument): readonly FragmentTarget[] {
  const targets: FragmentTarget[] = [];
  walkBlocks(document.blocks, (block) => {
    if (
      block.kind === "sequence" ||
      block.kind === "state" ||
      block.kind === "entity" ||
      block.kind === "class"
    ) {
      targets.push({ kind: block.kind, block });
    }
  });
  return targets;
}

/**
 * Model fragments are produced ahead of HTML assembly so each figure receives
 * its per-kind positional ordinal and this Document's Theme: the emitter sizes
 * every box through the Advance metric, so layout and paint must agree on one
 * Theme. A failure here publishes no Artifact.
 */
async function renderModelsFragments(
  document: AzeDocument,
  rendererId: string,
  registry: ResolvedRegistry,
  policy: CompilerPolicy,
  sourceName: string | undefined,
  theme: Theme,
): Promise<{
  readonly fragments: ReadonlyMap<AzeBlock, string>;
  readonly diagnostics: readonly Diagnostic[];
}> {
  return renderFamilyFragments(document, rendererId, registry, policy, sourceName, theme, {
    blockType: "models",
    label: "model",
    kinds: MODEL_KINDS,
    selectTargets: modelTargets,
    synchronous: true,
    failure: (error) =>
      error instanceof ModelsRenderError
        ? { code: error.code, message: error.message, remedy: error.remedy }
        : undefined,
  });
}

const ENGINEERING_KINDS = ["control", "free-body"] as const;

function engineeringTargets(document: AzeDocument): readonly FragmentTarget[] {
  const targets: FragmentTarget[] = [];
  walkBlocks(document.blocks, (block) => {
    if (block.kind === "control") {
      targets.push({ kind: "control", block });
    } else if (block.kind === "free-body") {
      targets.push({ kind: "free-body", block });
    }
  });
  return targets;
}

/**
 * Engineering fragments are produced ahead of HTML assembly: the control
 * layout engine is asynchronous, and both directives need their per-kind
 * positional ordinal and this Document's Theme (the Advance metric sizes every
 * control box, so layout and paint must agree on one Theme). A failure here
 * publishes no Artifact and never falls back to Mermaid.
 */
async function renderEngineeringFragments(
  document: AzeDocument,
  rendererId: string,
  registry: ResolvedRegistry,
  policy: CompilerPolicy,
  sourceName: string | undefined,
  theme: Theme,
): Promise<{
  readonly fragments: ReadonlyMap<AzeBlock, string>;
  readonly diagnostics: readonly Diagnostic[];
}> {
  return renderFamilyFragments(document, rendererId, registry, policy, sourceName, theme, {
    blockType: "engineering",
    label: "engineering",
    kinds: ENGINEERING_KINDS,
    selectTargets: engineeringTargets,
    synchronous: false,
    failure: (error) =>
      error instanceof ControlLayoutError ||
      error instanceof ControlRenderError ||
      error instanceof FreeBodyRenderError
        ? { code: error.code, message: error.message, remedy: error.remedy }
        : undefined,
  });
}

/**
 * Diagram fragments are produced ahead of HTML assembly because the pinned
 * layout engine is asynchronous: the renderer returns one `<figure>` per
 * Block, and the HTML assembler only ever reads the finished string. A
 * failure here publishes no Artifact and never falls back to Mermaid.
 */
async function renderDiagramFragments(
  document: AzeDocument,
  rendererId: string,
  registry: ResolvedRegistry,
  policy: CompilerPolicy,
  sourceName: string | undefined,
  timeoutMs: number,
  theme: Theme,
): Promise<{
  readonly fragments: ReadonlyMap<DiagramBlock, string>;
  readonly diagnostics: readonly Diagnostic[];
}> {
  const targets = diagramTargets(document);
  const rendererName = rendererId.toUpperCase();
  if (targets.length === 0) {
    return { fragments: new Map(), diagnostics: [] };
  }
  const renderer = registry.renderers.find((entry) => entry.id === rendererId);
  if (renderer === undefined) {
    return {
      fragments: new Map(),
      diagnostics: [
        groupedAdapterDiagnostic(
          "azeforge.renderer#adapter-missing",
          `No ${rendererName} Renderer is registered for diagram Blocks.`,
          targets,
          sourceName,
          { blockType: DIAGRAM_PLUGIN_TYPE, rendererId },
          `Register the built-in ${rendererName} Renderer.`,
          DIAGRAM_PLUGIN_TYPE,
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
          `${rendererName} Renderer "${renderer.id}" is disabled by host policy.`,
          targets,
          sourceName,
          { rendererId: renderer.id },
          "Enable the Renderer in Compiler policy.",
          DIAGRAM_PLUGIN_TYPE,
        ),
      ],
    };
  }
  const candidates = registry.blockRenderers.filter(
    (entry) =>
      entry.descriptor.blockType === DIAGRAM_PLUGIN_TYPE &&
      entry.descriptor.rendererId === rendererId,
  );
  if (candidates.length === 0) {
    return {
      fragments: new Map(),
      diagnostics: [
        groupedAdapterDiagnostic(
          "azeforge.renderer#adapter-missing",
          "No Block renderer is registered for diagram Blocks.",
          targets,
          sourceName,
          { blockType: DIAGRAM_PLUGIN_TYPE, rendererId },
          `Register the built-in diagram ${rendererName} Block renderer.`,
          DIAGRAM_PLUGIN_TYPE,
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
          "The registered diagram Block renderer is incompatible with this Document.",
          targets,
          sourceName,
          {
            blockType: DIAGRAM_PLUGIN_TYPE,
            ...(candidate === undefined
              ? {}
              : {
                  adapterId: candidate.descriptor.id,
                  pluginVersionRange: candidate.descriptor.pluginVersionRange,
                  rendererVersionRange: candidate.descriptor.rendererVersionRange,
                }),
          },
          `Register a Block renderer compatible with diagram v1 and ${rendererName} v1.`,
          DIAGRAM_PLUGIN_TYPE,
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
          "More than one Block renderer matches diagram Blocks.",
          targets,
          sourceName,
          {
            blockType: DIAGRAM_PLUGIN_TYPE,
            adapterIds: compatible.map((entry) => entry.descriptor.id),
          },
          "Register exactly one matching Block renderer.",
          DIAGRAM_PLUGIN_TYPE,
        ),
      ],
    };
  }
  const chosen = compatible[0];
  if (chosen === undefined) {
    return { fragments: new Map(), diagnostics: [] };
  }
  if (policy.disabledBlockRendererIds?.includes(chosen.descriptor.id) === true) {
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
          DIAGRAM_PLUGIN_TYPE,
        ),
      ],
    };
  }
  const fragments = new Map<DiagramBlock, string>();
  const diagnostics: Diagnostic[] = [];
  for (const target of targets) {
    const location = {
      ...(sourceName === undefined ? {} : { source: sourceName }),
      range: target.block.range,
    };
    try {
      const fragment = await withRenderTimeout(
        Promise.resolve(
          (chosen.render as DiagramBlockRenderer["render"])(target.block, {
            ...(sourceName === undefined ? {} : { sourceName }),
            ordinal: target.ordinal,
            theme,
          }),
        ),
        timeoutMs,
      );
      fragments.set(target.block, fragment);
    } catch (error) {
      if (error instanceof RenderTimeoutError) {
        diagnostics.push(
          createDiagnostic(
            "azeforge.renderer#timeout",
            "error",
            `Block renderer "${chosen.descriptor.id}" timed out.`,
            {
              location,
              data: { adapterId: chosen.descriptor.id, timeoutMs },
              suggestion: "Retry the operation or adjust the host render timeout.",
            },
          ),
        );
      } else if (
        error instanceof DiagramLayoutError ||
        error instanceof DiagramRenderError
      ) {
        diagnostics.push(
          createDiagnostic(error.code, "error", error.message, {
            location,
            data: {
              adapterId: chosen.descriptor.id,
              blockType: DIAGRAM_PLUGIN_TYPE,
            },
            suggestion: error.remedy,
          }),
        );
      } else {
        diagnostics.push(
          createDiagnostic(
            "azeforge.renderer#unexpected-failure",
            "error",
            "The diagram Block renderer failed unexpectedly.",
            {
              location,
              data: {
                adapterId: chosen.descriptor.id,
                blockType: DIAGRAM_PLUGIN_TYPE,
              },
            },
          ),
        );
      }
    }
  }
  return { fragments, diagnostics };
}

interface PluginAdapterResolution {
  readonly diagnostics: readonly Diagnostic[];
  readonly renderCallout?: (
    block: CalloutBlock,
    context: BlockRendererContext,
  ) => string;
  readonly renderTable?: (
    block: TableBlock,
    context: BlockRendererContext,
  ) => string;
  readonly renderPlot?: (
    block: PlotBlock,
    context: BlockRendererContext,
  ) => string;
  readonly renderChart?: (
    block: ChartBlock,
    context: BlockRendererContext,
  ) => string;
  readonly renderGeometry?: (
    block: GeometryBlock,
    context: BlockRendererContext,
  ) => string;
  readonly renderFormula?: (
    block: FormulaBlock,
    context: BlockRendererContext,
  ) => string;
  readonly renderReaction?: (
    block: ReactionBlock,
    context: BlockRendererContext,
  ) => string;
  readonly renderStructure?: (
    block: StructureBlock,
    context: BlockRendererContext,
  ) => string;
  readonly renderCircuit?: (
    block: CircuitBlock,
    context: BlockRendererContext,
  ) => string;
  readonly renderTiming?: (
    block: TimingBlock,
    context: BlockRendererContext,
  ) => string;
}

function checkPluginAdapters(
  document: AzeDocument,
  rendererId: string,
  registry: ResolvedRegistry,
  policy: CompilerPolicy,
  sourceName: string | undefined,
): PluginAdapterResolution {
  const rendererName = rendererId.toUpperCase();
  const diagnostics: Diagnostic[] = [];
  let renderCallout:
    | ((block: CalloutBlock, context: BlockRendererContext) => string)
    | undefined;
  let renderTable:
    | ((block: TableBlock, context: BlockRendererContext) => string)
    | undefined;
  let renderPlot:
    | ((block: PlotBlock, context: BlockRendererContext) => string)
    | undefined;
  let renderChart:
    | ((block: ChartBlock, context: BlockRendererContext) => string)
    | undefined;
  let renderGeometry:
    | ((block: GeometryBlock, context: BlockRendererContext) => string)
    | undefined;
  let renderFormula:
    | ((block: FormulaBlock, context: BlockRendererContext) => string)
    | undefined;
  let renderReaction:
    | ((block: ReactionBlock, context: BlockRendererContext) => string)
    | undefined;
  let renderStructure:
    | ((block: StructureBlock, context: BlockRendererContext) => string)
    | undefined;
  let renderCircuit:
    | ((block: CircuitBlock, context: BlockRendererContext) => string)
    | undefined;
  let renderTiming:
    | ((block: TimingBlock, context: BlockRendererContext) => string)
    | undefined;
  for (const entry of [
    { blockType: "callout", pluginVersion: "1.0.0" },
    { blockType: "table", pluginVersion: "2.0.0" },
    { blockType: "plot", pluginVersion: "1.0.0" },
    { blockType: "chart", pluginVersion: "1.0.0" },
    { blockType: "geometry", pluginVersion: "1.0.0" },
    { blockType: "formula", pluginVersion: "1.0.0" },
    { blockType: "reaction", pluginVersion: "1.0.0" },
    { blockType: "structure", pluginVersion: "1.0.0" },
    { blockType: "circuit", pluginVersion: "1.0.0" },
    { blockType: "timing", pluginVersion: "1.0.0" },
  ] as const) {
    const entryType: string = entry.blockType;
    const blocks = pluginBlocks(document, entry.blockType);
    if (blocks.length === 0) continue;
    const targets = blocks.map((block) => ({ block }));
    const renderer = registry.renderers.find((item) => item.id === rendererId);
    if (renderer === undefined) {
      diagnostics.push(
        groupedAdapterDiagnostic(
          "azeforge.renderer#adapter-missing",
          `No ${rendererName} Renderer is registered for ${entry.blockType} Blocks.`,
          targets,
          sourceName,
          { blockType: entry.blockType, rendererId },
          `Register the built-in ${rendererName} Renderer.`,
          entry.blockType,
        ),
      );
      continue;
    }
    if (policy.disabledRendererIds?.includes(renderer.id) === true) {
      diagnostics.push(
        groupedAdapterDiagnostic(
          "azeforge.renderer#adapter-disabled",
          `${rendererName} Renderer "${renderer.id}" is disabled by host policy.`,
          targets,
          sourceName,
          { rendererId: renderer.id },
          "Enable the Renderer in Compiler policy.",
          entry.blockType,
        ),
      );
      continue;
    }
    const candidates = registry.blockRenderers.filter(
      (item) =>
        item.descriptor.blockType === entry.blockType &&
        item.descriptor.rendererId === rendererId,
    );
    if (candidates.length === 0) {
      diagnostics.push(
        groupedAdapterDiagnostic(
          "azeforge.renderer#adapter-missing",
          `No Block renderer is registered for ${entry.blockType} Blocks.`,
          targets,
          sourceName,
          { blockType: entry.blockType, rendererId },
          `Register the built-in ${entry.blockType} ${rendererName} Block renderer.`,
          entry.blockType,
        ),
      );
      continue;
    }
    const compatible = candidates.filter(
      (item) =>
        satisfiesSemverRange(entry.pluginVersion, item.descriptor.pluginVersionRange) &&
        satisfiesSemverRange(renderer.version, item.descriptor.rendererVersionRange),
    );
    if (compatible.length === 0) {
      const candidate = candidates[0];
      diagnostics.push(
        groupedAdapterDiagnostic(
          "azeforge.renderer#adapter-incompatible",
          `The registered ${entry.blockType} Block renderer is incompatible with this Document.`,
          targets,
          sourceName,
          {
            blockType: entry.blockType,
            ...(candidate === undefined
              ? {}
              : {
                  adapterId: candidate.descriptor.id,
                  pluginVersionRange: candidate.descriptor.pluginVersionRange,
                  rendererVersionRange: candidate.descriptor.rendererVersionRange,
                }),
          },
          `Register a Block renderer compatible with ${entry.blockType} v1 and ${rendererName} v1.`,
          entry.blockType,
        ),
      );
      continue;
    }
    if (compatible.length > 1) {
      diagnostics.push(
        groupedAdapterDiagnostic(
          "azeforge.renderer#adapter-ambiguous",
          `More than one Block renderer matches ${entry.blockType} Blocks.`,
          targets,
          sourceName,
          {
            blockType: entry.blockType,
            adapterIds: compatible.map((item) => item.descriptor.id),
          },
          "Register exactly one matching Block renderer.",
          entry.blockType,
        ),
      );
      continue;
    }
    const chosen = compatible[0];
    if (chosen === undefined) continue;
    if (policy.disabledBlockRendererIds?.includes(chosen.descriptor.id) === true) {
      diagnostics.push(
        groupedAdapterDiagnostic(
          "azeforge.renderer#adapter-disabled",
          `Block renderer "${chosen.descriptor.id}" is disabled by host policy.`,
          targets,
          sourceName,
          { adapterId: chosen.descriptor.id },
          "Enable the Block renderer in Compiler policy.",
          entry.blockType,
        ),
      );
      continue;
    }
    if (entry.blockType === "callout") {
      const render = chosen.render as (
        block: CalloutBlock,
        context: BlockRendererContext,
      ) => string | Promise<string>;
      renderCallout = (block, context) => {
        const result = render(block, context);
        if (typeof result !== "string") {
          throw new BlockRendererSyncError(chosen.descriptor.id, "callout");
        }
        return result;
      };
    } else if (entry.blockType === "table") {
      const render = chosen.render as (
        block: TableBlock,
        context: BlockRendererContext,
      ) => string | Promise<string>;
      renderTable = (block, context) => {
        const result = render(block, context);
        if (typeof result !== "string") {
          throw new BlockRendererSyncError(chosen.descriptor.id, "table");
        }
        return result;
      };
    } else if (entry.blockType === "plot") {
      const render = chosen.render as (
        block: PlotBlock,
        context: BlockRendererContext,
      ) => string | Promise<string>;
      renderPlot = (block, context) => {
        const result = render(block, context);
        if (typeof result !== "string") {
          throw new BlockRendererSyncError(chosen.descriptor.id, "plot");
        }
        return result;
      };
    } else if (entry.blockType === "chart") {
      const render = chosen.render as (
        block: ChartBlock,
        context: BlockRendererContext,
      ) => string | Promise<string>;
      renderChart = (block, context) => {
        const result = render(block, context);
        if (typeof result !== "string") {
          throw new BlockRendererSyncError(chosen.descriptor.id, "chart");
        }
        return result;
      };
    } else if (entry.blockType === "geometry") {
      const render = chosen.render as (
        block: GeometryBlock,
        context: BlockRendererContext,
      ) => string | Promise<string>;
      renderGeometry = (block, context) => {
        const result = render(block, context);
        if (typeof result !== "string") {
          throw new BlockRendererSyncError(chosen.descriptor.id, "geometry");
        }
        return result;
      };
    } else if (entry.blockType === "formula") {
      const render = chosen.render as (
        block: FormulaBlock,
        context: BlockRendererContext,
      ) => string | Promise<string>;
      renderFormula = (block, context) => {
        const result = render(block, context);
        if (typeof result !== "string") {
          throw new BlockRendererSyncError(chosen.descriptor.id, "formula");
        }
        return result;
      };
    } else if (entry.blockType === "reaction") {
      const render = chosen.render as (
        block: ReactionBlock,
        context: BlockRendererContext,
      ) => string | Promise<string>;
      renderReaction = (block, context) => {
        const result = render(block, context);
        if (typeof result !== "string") {
          throw new BlockRendererSyncError(chosen.descriptor.id, "reaction");
        }
        return result;
      };
    } else if (entry.blockType === "structure") {
      const render = chosen.render as (
        block: StructureBlock,
        context: BlockRendererContext,
      ) => string | Promise<string>;
      renderStructure = (block, context) => {
        const result = render(block, context);
        if (typeof result !== "string") {
          throw new BlockRendererSyncError(chosen.descriptor.id, "structure");
        }
        return result;
      };
    } else if (entry.blockType === "circuit") {
      const render = chosen.render as (
        block: CircuitBlock,
        context: BlockRendererContext,
      ) => string | Promise<string>;
      renderCircuit = (block, context) => {
        const result = render(block, context);
        if (typeof result !== "string") {
          throw new BlockRendererSyncError(chosen.descriptor.id, "circuit");
        }
        return result;
      };
    } else if (entry.blockType === "timing") {
      const render = chosen.render as (
        block: TimingBlock,
        context: BlockRendererContext,
      ) => string | Promise<string>;
      renderTiming = (block, context) => {
        const result = render(block, context);
        if (typeof result !== "string") {
          throw new BlockRendererSyncError(chosen.descriptor.id, "timing");
        }
        return result;
      };
    } else {
      throw new CompilerConfigurationError(
        "AZE_CONFIG_ADAPTER_BLOCK_TYPE",
        `Plugin adapter entry for "${entryType}" has no sync renderer wiring.`,
      );
    }
  }
  return {
    diagnostics,
    ...(renderCallout === undefined ? {} : { renderCallout }),
    ...(renderTable === undefined ? {} : { renderTable }),
    ...(renderPlot === undefined ? {} : { renderPlot }),
    ...(renderChart === undefined ? {} : { renderChart }),
    ...(renderGeometry === undefined ? {} : { renderGeometry }),
    ...(renderFormula === undefined ? {} : { renderFormula }),
    ...(renderReaction === undefined ? {} : { renderReaction }),
    ...(renderStructure === undefined ? {} : { renderStructure }),
    ...(renderCircuit === undefined ? {} : { renderCircuit }),
    ...(renderTiming === undefined ? {} : { renderTiming }),
  };
}

export function createCompiler(options: CompilerOptions = {}): Compiler {
  const diagnosticLimits = resolveDiagnosticLimits(options);
  const configuredThemes = options.themes ?? builtInThemes;
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
    ...(options.policy?.disabledThemeIds === undefined
      ? {}
      : {
          disabledThemeIds: Object.freeze([...options.policy.disabledThemeIds]),
        }),
  });
  const renderTimeoutMs = options.renderTimeoutMs ?? DEFAULT_RENDER_TIMEOUT_MS;
  if (
    !Number.isInteger(renderTimeoutMs) ||
    renderTimeoutMs <= 0 ||
    renderTimeoutMs > DEFAULT_RENDER_TIMEOUT_MS
  ) {
    throw new CompilerConfigurationError(
      "azeforge.config#render-timeout",
      "Render timeout must be a positive integer no greater than the default (5000 ms).",
    );
  }

  let fontFacesPromise: Promise<readonly EmbeddedFontFace[]> | undefined;
  const compiler: Compiler = {
    parse(source: string, parseOptions: ParseOptions = {}): ParseResult {
      return limitParseResult(
        parseSource(source, {
          ...(parseOptions.sourceName === undefined
            ? {}
            : { sourceName: parseOptions.sourceName }),
          plugins: parseOptions.plugins ?? registry.plugins,
          ...(parseOptions.allowRawLatex === undefined
            ? {}
            : { allowRawLatex: parseOptions.allowRawLatex }),
        }),
        diagnosticLimits,
      );
    },
    validate(parsed: ParseResult): ValidationResult {
      return validateParsed(parsed, diagnosticLimits);
    },
    format(source: string, formatOptions: FormatOptions = {}): FormatResult {
      const before = validateParsed(
        limitParseResult(
          parseSource(source, {
            ...(formatOptions.sourceName === undefined
              ? {}
              : { sourceName: formatOptions.sourceName }),
            plugins: registry.plugins,
          }),
          diagnosticLimits,
        ),
        diagnosticLimits,
      );
      const rewritten = formatSource(source, {
        ...(formatOptions.sourceName === undefined
          ? {}
          : { sourceName: formatOptions.sourceName }),
      });
      if (rewritten.source === undefined) return rewritten;
      const after = validateParsed(
        limitParseResult(
          parseSource(rewritten.source, {
            ...(formatOptions.sourceName === undefined
              ? {}
              : { sourceName: formatOptions.sourceName }),
            plugins: registry.plugins,
          }),
          diagnosticLimits,
        ),
        diagnosticLimits,
      );
      if (!sameFormatMeaning(before, after)) {
        const range = {
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: 1, offset: 0 },
        };
        return {
          diagnostics: [
            createDiagnostic(
              "azeforge.format#ambiguous-structure",
              "error",
              "Formatting changed the semantic meaning of the Source.",
              {
                ...(formatOptions.sourceName === undefined
                  ? { location: { range } }
                  : { location: { source: formatOptions.sourceName, range } }),
                suggestion: "Report this Source as a formatter failure.",
              },
            ),
          ],
        };
      }
      return rewritten;
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
      if (compileOptions.format !== "html" && compileOptions.format !== "svg" && compileOptions.format !== "png" && compileOptions.format !== "pdf") {
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
      const selectedRenderer = registry.renderers.find((renderer) =>
        renderer.formats.includes(compileOptions.format),
      );
      if (selectedRenderer === undefined) {
        const unavailableRenderer = createDiagnostic(
          "azeforge.renderer#format-unsupported",
          "error",
          `No Renderer is registered for Artifact format \"${compileOptions.format}\".`,
          {
            ...(compileOptions.sourceName === undefined
              ? {}
              : { location: { source: compileOptions.sourceName } }),
            data: { format: compileOptions.format },
          },
        );
        return {
          diagnostics: normalizeAndLimitDiagnostics(
            [validation.diagnostics, [unavailableRenderer]],
            diagnosticLimits,
          ),
        };
      }
      if (
        selectedRenderer.id !== compileOptions.format ||
        selectedRenderer.version !==
          BUILT_IN_RENDERER_VERSION_BY_FORMAT[compileOptions.format]
      ) {
        const unavailableImplementation = createDiagnostic(
          "azeforge.renderer#adapter-missing",
          "error",
          `The registered Renderer for \"${compileOptions.format}\" has no trusted implementation.`,
          {
            ...(compileOptions.sourceName === undefined
              ? {}
              : { location: { source: compileOptions.sourceName } }),
            data: {
              format: compileOptions.format,
              rendererId: selectedRenderer.id,
              rendererVersion: selectedRenderer.version,
            },
            suggestion: `Register the built-in ${compileOptions.format.toUpperCase()} Renderer.`,
          },
        );
        return {
          diagnostics: normalizeAndLimitDiagnostics(
            [validation.diagnostics, [unavailableImplementation]],
            diagnosticLimits,
          ),
        };
      }
      if (policy.disabledRendererIds?.includes(selectedRenderer.id) === true) {
        const disabledRenderer = createDiagnostic(
          "azeforge.renderer#adapter-disabled",
          "error",
          `Renderer \"${selectedRenderer.id}\" is disabled by host policy.`,
          {
            ...(compileOptions.sourceName === undefined
              ? {}
              : { location: { source: compileOptions.sourceName } }),
            data: {
              format: compileOptions.format,
              rendererId: selectedRenderer.id,
            },
            suggestion: "Enable the Renderer in Compiler policy.",
          },
        );
        return {
          diagnostics: normalizeAndLimitDiagnostics(
            [validation.diagnostics, [disabledRenderer]],
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
          `Theme "${themeId}" is not registered.`,
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
      if (policy.disabledThemeIds?.includes(themeId) === true) {
        const disabledTheme = createDiagnostic(
          "azeforge.renderer#disabled-theme",
          "error",
          `Theme "${themeId}" is disabled.`,
          {
            ...(compileOptions.sourceName === undefined
              ? {}
              : { location: { source: compileOptions.sourceName } }),
            data: { theme: themeId },
          },
        );
        return {
          diagnostics: normalizeAndLimitDiagnostics(
            [validation.diagnostics, [disabledTheme]],
            diagnosticLimits,
          ),
        };
      }
      try {
        throwIfCancelled(compileOptions.signal);
        const equationPreflight = await renderEquationFragments(
          validation.document,
          selectedRenderer.id,
          registry,
          policy,
          compileOptions.sourceName,
          renderTimeoutMs,
        );
        const derivationPreflight = await renderDerivationFragments(
          validation.document,
          selectedRenderer.id,
          registry,
          policy,
          compileOptions.sourceName,
          renderTimeoutMs,
        );
        const mermaidPreflight = await renderMermaidFragments(
          validation.document,
          selectedRenderer.id,
          registry,
          policy,
          compileOptions.sourceName,
          renderTimeoutMs,
          theme,
        );
        const diagramPreflight = await renderDiagramFragments(
          validation.document,
          selectedRenderer.id,
          registry,
          policy,
          compileOptions.sourceName,
          renderTimeoutMs,
          theme,
        );
        const modelsPreflight = await renderModelsFragments(
          validation.document,
          selectedRenderer.id,
          registry,
          policy,
          compileOptions.sourceName,
          theme,
        );
        const engineeringPreflight = await renderEngineeringFragments(
          validation.document,
          selectedRenderer.id,
          registry,
          policy,
          compileOptions.sourceName,
          theme,
        );
        const pluginPreflight = checkPluginAdapters(
          validation.document,
          selectedRenderer.id,
          registry,
          policy,
          compileOptions.sourceName,
        );
        const preflightDiagnostics = [
          ...equationPreflight.diagnostics,
          ...derivationPreflight.diagnostics,
          ...mermaidPreflight.diagnostics,
          ...diagramPreflight.diagnostics,
          ...modelsPreflight.diagnostics,
          ...engineeringPreflight.diagnostics,
          ...pluginPreflight.diagnostics,
        ];
        if (preflightDiagnostics.length > 0) {
          return {
            diagnostics: normalizeAndLimitDiagnostics(
              [validation.diagnostics, preflightDiagnostics],
              diagnosticLimits,
              collectBlockRanges(validation.document.blocks),
            ),
          };
        }
        throwIfCancelled(compileOptions.signal);
        const imageResolution = await resolveProjectImages(validation.document, {
          ...(compileOptions.projectRoot === undefined
            ? {}
            : { projectRoot: compileOptions.projectRoot }),
          ...(compileOptions.sourceName === undefined
            ? {}
            : { sourceName: compileOptions.sourceName }),
        });
        if (
          imageResolution.diagnostics.length > 0 ||
          imageResolution.document === undefined ||
          imageResolution.manifest === undefined
        ) {
          return {
            diagnostics: normalizeAndLimitDiagnostics(
              [validation.diagnostics, imageResolution.diagnostics],
              diagnosticLimits,
              collectBlockRanges(validation.document.blocks),
            ),
          };
        }
        throwIfCancelled(compileOptions.signal);
        const renderedText = [
          ...(validation.document.metadata.title === undefined
            ? []
            : [validation.document.metadata.title]),

        ];
        collectRenderText(validation.document.blocks, renderedText);
        assertInterFontCoverage(renderedText);
        fontFacesPromise ??= Promise.all([
          loadInterFontFaces(),
          loadCodeFontFaces(),
        ]).then((faces) => faces.flat());
        const fontFaces = await fontFacesPromise;
        const contentHash = documentContentHash(validation.document);
        const pluginRenderers = {
          ...(pluginPreflight.renderCallout === undefined
            ? {}
            : { renderCallout: pluginPreflight.renderCallout }),
          ...(pluginPreflight.renderTable === undefined
            ? {}
            : { renderTable: pluginPreflight.renderTable }),
          ...(pluginPreflight.renderPlot === undefined
            ? {}
            : { renderPlot: pluginPreflight.renderPlot }),
          ...(pluginPreflight.renderChart === undefined
            ? {}
            : { renderChart: pluginPreflight.renderChart }),
          ...(pluginPreflight.renderGeometry === undefined
            ? {}
            : { renderGeometry: pluginPreflight.renderGeometry }),
          ...(pluginPreflight.renderFormula === undefined
            ? {}
            : { renderFormula: pluginPreflight.renderFormula }),
          ...(pluginPreflight.renderReaction === undefined
            ? {}
            : { renderReaction: pluginPreflight.renderReaction }),
          ...(pluginPreflight.renderStructure === undefined
            ? {}
            : { renderStructure: pluginPreflight.renderStructure }),
          ...(pluginPreflight.renderCircuit === undefined
            ? {}
            : { renderCircuit: pluginPreflight.renderCircuit }),
          ...(pluginPreflight.renderTiming === undefined
            ? {}
            : { renderTiming: pluginPreflight.renderTiming }),
        };
        const renderArguments = [
          imageResolution.document,
          contentHash,
          theme,
          fontFaces,
          equationPreflight.fragments,
          katexDependencyClosure(),
          derivationPreflight.fragments,
          mermaidPreflight.fragments,
          mermaidDependencyClosure(),
          diagramPreflight.fragments,
          diagramDependencyClosure(),
          modelsPreflight.fragments,
          engineeringPreflight.fragments,
          controlDependencyClosure(),
          freeBodyDependencyClosure(),
          pluginRenderers,
        ] as const;
        const htmlLayout = createHtmlLayout(
          renderArguments[0],
          renderArguments[2],
          renderArguments[3],
          renderArguments[4],
          renderArguments[5],
          renderArguments[6],
          renderArguments[7],
          renderArguments[8],
          renderArguments[9],
          renderArguments[10],
          renderArguments[11],
          renderArguments[12],
          renderArguments[13],
          renderArguments[14],
        );
        const artifact =
          compileOptions.format === "html"
            ? await renderHtml(...renderArguments, imageResolution.manifest)
            : compileOptions.format === "svg"
              ? await renderSvg(
                  htmlLayout,
                  contentHash,
                  theme,
                  imageResolution.manifest,
                  pinnedSvgBrowserCapability,
                )
              : compileOptions.format === "png"
                ? await renderPng(
                    htmlLayout,
                    contentHash,
                    theme,
                    imageResolution.manifest,
                    pinnedPngBrowserCapability,
                  )
                : await renderPdf(
                    htmlLayout,
                    contentHash,
                    theme,
                    imageResolution.manifest,
                    pinnedPdfBrowserCapability,
                    {
                      title: documentTitle(imageResolution.document),
                      authors: imageResolution.document.metadata.authors,
                    },
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
            : error instanceof ArtifactLimitError ||
                error instanceof SvgArtifactLimitError ||
                error instanceof PngArtifactLimitError ||
                error instanceof PdfArtifactLimitError
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
              : error instanceof ModelsRenderError
                ? createDiagnostic(error.code, "error", error.message, {
                    data: {
                      adapterId: selectedRenderer.id,
                      blockType: "models",
                    },
                    suggestion: error.remedy,
                    ...(compileOptions.sourceName === undefined
                      ? {}
                      : { location: { source: compileOptions.sourceName } }),
                  })
              : error instanceof MermaidBrowserUnavailableError
                ? createDiagnostic(
                    "azeforge.renderer#browser-unavailable",
                    "error",
                    `The pinned browser engine is unavailable: ${error.message}`,
                    {
                      data: { engine: "HeadlessChrome" },
                      suggestion:
                        "Reinstall AzeForge browser dependencies and retry.",
                      ...(compileOptions.sourceName === undefined
                        ? {}
                        : { location: { source: compileOptions.sourceName } }),
                    },
                  )
                : isCapabilityDenial(error)
                  ? createDiagnostic(
                      "azeforge.security#capability-denied",
                      "error",
                      `The ${compileOptions.format.toUpperCase()} Renderer was denied a capability; refusing to publish.`,
                      {
                        data: {
                          format: compileOptions.format,
                          rendererId: selectedRenderer.id,
                        },
                        ...(compileOptions.sourceName === undefined
                          ? {}
                          : { location: { source: compileOptions.sourceName } }),
                      },
                    )
                  : error instanceof EquationSanitizerError ||
                      error instanceof MermaidSanitizerError ||
                      error instanceof FragmentSecurityError
                    ? createDiagnostic(
                        "azeforge.security#sanitizer-rewrite",
                        "error",
                        "A Fragment failed final sanitization; refusing to publish.",
                        {
                          data: { format: compileOptions.format },
                          suggestion:
                            "Remove the unsafe construct or report this Source as a sanitizer failure.",
                          ...(compileOptions.sourceName === undefined
                            ? {}
                            : { location: { source: compileOptions.sourceName } }),
                        },
                      )
                    : error instanceof BlockRendererSyncError
                      ? createDiagnostic(
                          "azeforge.renderer#adapter-sync",
                          "error",
                          `Block renderer "${error.adapterId}" must be synchronous.`,
                          {
                            data: {
                              adapterId: error.adapterId,
                              blockType: error.blockType,
                            },
                            suggestion: "Register a synchronous Block renderer.",
                            ...(compileOptions.sourceName === undefined
                              ? {}
                              : { location: { source: compileOptions.sourceName } }),
                          },
                        )
                      : error instanceof CompilerCancelledError
                        ? createDiagnostic(
                            "azeforge.compiler#cancelled",
                            "error",
                            "The operation was cancelled before publication.",
                            {
                              ...(compileOptions.sourceName === undefined
                                ? {}
                                : { location: { source: compileOptions.sourceName } }),
                            },
                          )
                        : createDiagnostic(
                            "azeforge.renderer#unexpected-failure",
                            "error",
                            `The ${compileOptions.format.toUpperCase()} Renderer failed unexpectedly.`,
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
