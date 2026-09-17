import { isAlias, isScalar, parseDocument, visit } from "yaml";

import { createDiagnostic } from "./diagnostics.js";
import { derivationPlugin, parseDerivationHeader, validateDerivationBody } from "./derivation.js";
import { DERIVATION_PLUGIN_TYPE } from "./derivation-schemas.js";
import { calloutPlugin } from "./callout.js";
import { parseCompositionHeader } from "./block-header.js";
import { algorithmPlugin, parseAlgorithmBody, parseAlgorithmHeader } from "./algorithm.js";
import {
  ALGORITHM_PLUGIN_TYPE,
  ALGORITHM_PLUGIN_VERSION,
} from "./algorithm-schemas.js";
import { statementPlugin, parseStatementBody, parseStatementHeader } from "./statement.js";
import {
  STATEMENT_PLUGIN_TYPE,
  STATEMENT_PLUGIN_VERSION,
} from "./statement-schemas.js";
import { examplePlugin, parseExampleBody, parseExampleHeader } from "./example.js";
import {
  EXAMPLE_PLUGIN_TYPE,
  EXAMPLE_PLUGIN_VERSION,
} from "./example-schemas.js";
import { figurePlugin } from "./figure.js";
import { FIGURE_PLUGIN_TYPE, FIGURE_PLUGIN_VERSION } from "./figure-schemas.js";
import { bibliographyPlugin, parseBibliographyBody, parseBibliographyHeader } from "./bibliography.js";
import { BIBLIOGRAPHY_PLUGIN_TYPE, BIBLIOGRAPHY_PLUGIN_VERSION } from "./bibliography-schemas.js";
import { migrateGfmTable, parseTypedTableData } from "./table-parse.js";
import { CALLOUT_PLUGIN_TYPE, CALLOUT_PLUGIN_VERSION, CALLOUT_VARIANTS } from "./callout-schemas.js";
import { tablePlugin } from "./table.js";
import { TABLE_PLUGIN_TYPE, TABLE_PLUGIN_VERSION } from "./table-schemas.js";
import {
  equationPlugin,
  parseEquationHeader,
  validateEquationBody,
} from "./equation.js";
import { EQUATION_PLUGIN_TYPE } from "./equation-schemas.js";
import {
  isGfmTableStart,
  parseInlineFragment,
  splitTableRow,
  tryParseGfmTable,
  type InlineRangeFor,
} from "./markdown.js";
import {
  mermaidPlugin,
  parseMermaidHeader,
  validateMermaidBody,
} from "./mermaid.js";
import { MERMAID_PLUGIN_TYPE } from "./mermaid-schemas.js";
import { texPlugin, parseTexHeader, validateTexBody } from "./tex.js";
import { TEX_PLUGIN_TYPE } from "./tex-schemas.js";
import { GEOMETRY_PLUGIN_TYPE } from "./geometry-schemas.js";
import { geometryPlugin, validateGeometryBlock, type GeometryInputLine } from "./geometry.js";
import { FORMULA_PLUGIN_TYPE, REACTION_PLUGIN_TYPE, STRUCTURE_PLUGIN_TYPE } from "./chemistry-schemas.js";
import {
  formulaPlugin,
  reactionPlugin,
  structurePlugin,
  validateFormulaBlock,
  validateReactionBlock,
  validateStructureBlock,
  type ChemistryInputLine,
} from "./chemistry.js";
import { CHART_PLUGIN_TYPE, PLOT_PLUGIN_TYPE } from "./plot-schemas.js";
import { EMPTY_DOCUMENT_DEFAULTS, chartPlugin, parseDocumentDefaults, plotPlugin, validateChartBlock, validatePlotBlock, type PlotBlockDefaults, type PlotDocumentDefaults, type PlotInputLine } from "./plot.js";
import { CIRCUIT_PLUGIN_TYPE } from "./circuit-schemas.js";
import { circuitPlugin, validateCircuitBlock, type CircuitInputLine } from "./circuit.js";
import { TIMING_PLUGIN_TYPE } from "./timing-schemas.js";
import { timingPlugin, validateTimingBlock, type TimingInputLine } from "./timing.js";
import { DIAGRAM_PLUGIN_TYPE } from "./diagram-schemas.js";
import { diagramPlugin, validateDiagramBlock, type DiagramInputLine } from "./diagram.js";
import { CONTROL_PLUGIN_TYPE, FREE_BODY_PLUGIN_TYPE } from "./control-schemas.js";
import { controlPlugin, validateControlBlock, type ControlInputLine } from "./control.js";
import { freeBodyPlugin, validateFreeBodyBlock, type FreeBodyInputLine } from "./free-body.js";
import {
  CLASS_PLUGIN_TYPE,
  ENTITY_PLUGIN_TYPE,
  SEQUENCE_PLUGIN_TYPE,
  STATE_PLUGIN_TYPE,
} from "./models-schemas.js";
import {
  classPlugin,
  entityPlugin,
  sequencePlugin,
  statePlugin,
  validateClassBlock,
  validateEntityBlock,
  validateSequenceBlock,
  validateStateBlock,
  type ModelsInputLine,
} from "./models.js";
import type {
  AlgorithmBlock,
  ArtifactFormat,
  BibliographyBlock,
  CalloutBlock,
  ChartBlock,
  CitationStyle,
  Diagnostic,
  DiagnosticFix,
  DiagnosticLocation,
  DiagnosticSeverity,
  DocumentMetadata,
  ExampleBlock,
  FigureBlock,
  Inline,
  JsonValue,
  ParsedBlock,
  ParseOptions,
  ParseResult,
  RelatedLocation,
  SourceRange,
  StatementBlock,
  PlotBlock,
  TableBlock,
  TableData,
} from "./model.js";
import {
  rangeFromLineSlice,
  rangeFromLines,
  sourceLines,
  type SourceLine,
} from "./source-map.js";
import {
  validateBlockIds,
  type BlockIdOccurrence,
} from "./reference-validation.js";

const OUTPUT_FORMATS: Readonly<Record<ArtifactFormat, true>> = {
  html: true,
  svg: true,
  png: true,
  pdf: true,
};
/** The closed front-matter vocabulary, in canonical order. */
export const KNOWN_METADATA_KEYS: Readonly<Record<string, true>> = {
  azemark: true,
  author: true,
  title: true,
  theme: true,
  outputs: true,
  defaults: true,
  "citation-style": true,
};
const BLANK = /^[ \t]*$/;
const STRUCTURAL_COMMENT = /^[ \t]*\/[\/](?:[ \t].*)?$/;
/** Fixed AzeMark 2 outer directive: exactly four colons, optional type. */
const OUTER_DIRECTIVE_OPEN = /^ {0,3}::::[ \t]*([^ \t:].*)?$/;
const OUTER_DIRECTIVE_CLOSE = /^ {0,3}::::[ \t]*$/;
/** Fixed AzeMark 2 nested directive: exactly two colons, optional type. */
const NESTED_DIRECTIVE_OPEN = /^ {0,3}::[ \t]*([^ \t:].*)?$/;
const NESTED_DIRECTIVE_CLOSE = /^ {0,3}::[ \t]*$/;
const HEADER_SEPARATOR = /^ {0,3}-{4}[ \t]*$/;
const HEADER_ENTRY = /^[ \t]*([A-Za-z][A-Za-z0-9-]*)[ \t]*:(.*)$/;
const EXTENSION_KEY = /^x-[a-z0-9]+(?:-[a-z0-9]+)*$/;

function metadataKeyDistance(left: string, right: string): number {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    const current = [leftIndex + 1];
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      const substitution =
        (previous[rightIndex] ?? Number.POSITIVE_INFINITY) +
        (left[leftIndex] === right[rightIndex] ? 0 : 1);
      current.push(
        Math.min(
          (previous[rightIndex + 1] ?? Number.POSITIVE_INFINITY) + 1,
          (current[rightIndex] ?? Number.POSITIVE_INFINITY) + 1,
          substitution,
        ),
      );
    }
    previous = current;
  }
  return previous[right.length] ?? right.length;
}

function nearestMetadataKey(value: string): string {
  let nearest = "azemark";
  let distance = Number.POSITIVE_INFINITY;
  for (const candidate of Object.keys(KNOWN_METADATA_KEYS)) {
    const candidateDistance = metadataKeyDistance(value, candidate);
    if (candidateDistance < distance) {
      nearest = candidate;
      distance = candidateDistance;
    }
  }
  return nearest;
}
interface ParsedFrontMatter {
  readonly metadata: DocumentMetadata;
  readonly diagnostics: readonly Diagnostic[];
  readonly bodyStart: number;
  readonly versionDeclared: boolean;
  readonly defaults: PlotDocumentDefaults;
}

function diagnostic(
  code: string,
  message: string,
  options: ParseOptions,
  line?: SourceLine,
  severity: DiagnosticSeverity = "error",
  range = line === undefined ? undefined : rangeFromLines(line, line),
  details: {
    readonly data?: Readonly<Record<string, JsonValue>>;
    readonly suggestion?: string;
    readonly fix?: DiagnosticFix;
    readonly relatedLocations?: readonly RelatedLocation[];
  } = {},
): Diagnostic {
  const location: DiagnosticLocation | undefined =
    options.sourceName === undefined && range === undefined
      ? undefined
      : options.sourceName === undefined
        ? { range: range as NonNullable<typeof range> }
        : range === undefined
          ? { source: options.sourceName }
          : { source: options.sourceName, range };
  return createDiagnostic(code, severity, message, {
    ...(details.data === undefined ? {} : { data: details.data }),
    ...(location === undefined ? {} : { location }),
    ...(details.suggestion === undefined
      ? {}
      : { suggestion: details.suggestion }),
    ...(details.fix === undefined ? {} : { fix: details.fix }),
    ...(details.relatedLocations === undefined
      ? {}
      : { relatedLocations: details.relatedLocations }),
  });
}

function emptyMetadata(): DocumentMetadata {
  return { authors: [], extensions: {} };
}

function asJsonValue(value: unknown): JsonValue | undefined {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (Array.isArray(value)) {
    const converted = value.map(asJsonValue);
    return converted.every((item) => item !== undefined)
      ? (converted as readonly JsonValue[])
      : undefined;
  }
  if (typeof value === "object") {
    const converted: Record<string, JsonValue> = {};
    for (const [key, item] of Object.entries(value)) {
      const jsonItem = asJsonValue(item);
      if (jsonItem === undefined) return undefined;
      converted[key] = jsonItem;
    }
    return converted;
  }
  return undefined;
}

function parseAuthors(
  value: unknown,
  options: ParseOptions,
  line: SourceLine,
  diagnostics: Diagnostic[],
): readonly string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value) && value.every((author) => typeof author === "string")) {
    return value;
  }
  diagnostics.push(
    diagnostic(
      "azeforge.metadata#invalid-author",
      'Front matter "author" must be a string or an array of strings.',
      options,
      line,
    ),
  );
  return [];
}

function parseOutputs(
  value: unknown,
  options: ParseOptions,
  line: SourceLine,
  diagnostics: Diagnostic[],
): readonly ArtifactFormat[] | undefined {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    diagnostics.push(
      diagnostic(
        "azeforge.metadata#invalid-outputs",
        'Front matter "outputs" must be an array of Artifact formats.',
        options,
        line,
      ),
    );
    return undefined;
  }
  const formats = value.filter(
    (item): item is ArtifactFormat =>
      OUTPUT_FORMATS[item as ArtifactFormat] === true,
  );
  if (formats.length !== value.length || new Set(formats).size !== formats.length) {
    diagnostics.push(
      diagnostic(
        "azeforge.metadata#invalid-outputs",
        'Front matter "outputs" must contain unique html, svg, png, or pdf values.',
        options,
        line,
      ),
    );
    return undefined;
  }
  return formats;
}

function parseFrontMatter(
  lines: readonly SourceLine[],
  options: ParseOptions,
): ParsedFrontMatter {
  const firstLine = lines[0];
  if (firstLine === undefined) {
    return {
      metadata: emptyMetadata(),
      diagnostics: [],
      bodyStart: 0,
      versionDeclared: false,
      defaults: EMPTY_DOCUMENT_DEFAULTS,
    };
  }
  const openingText = firstLine.text.startsWith("\uFEFF")
    ? firstLine.text.slice(1)
    : firstLine.text;
  if (openingText !== "---") {
    return {
      metadata: emptyMetadata(),
      diagnostics: [],
      bodyStart: 0,
      versionDeclared: false,
      defaults: EMPTY_DOCUMENT_DEFAULTS,
    };
  }

  const closingIndex = lines.findIndex((line, index) => index > 0 && line.text === "---");
  if (closingIndex < 0) {
    return {
      metadata: emptyMetadata(),
      diagnostics: [
        diagnostic(
          "azeforge.metadata#unclosed",
          "Front matter must end with a --- delimiter.",
          options,
          firstLine,
        ),
      ],
      bodyStart: Math.max(
        1,
        lines.findIndex(
          (line, index) => index > 0 && /^[ \t]*$/.test(line.text),
        ) + 1,
      ),
      versionDeclared: false,
      defaults: EMPTY_DOCUMENT_DEFAULTS,
    };
  }

  const yamlSource = lines
    .slice(1, closingIndex)
    .map((line) => line.text)
    .join("\n");
  const parsed = parseDocument(yamlSource, {
    prettyErrors: false,
    strict: true,
    uniqueKeys: true,
  });
  const diagnostics: Diagnostic[] = parsed.errors.map(() =>
    diagnostic(
      "azeforge.metadata#invalid-yaml",
      "Front matter contains invalid YAML.",
      options,
      lines[1],
    ),
  );
  visit(parsed, {
    Alias() {
      diagnostics.push(
        diagnostic(
          "azeforge.metadata#alias-disabled",
          "Front matter aliases are not supported.",
          options,
          lines[1],
        ),
      );
    },
    Pair(_key, pair) {
      if (
        isScalar(pair.key) &&
        pair.key.value === "<<" &&
        pair.key.type === "PLAIN"
      ) {
        diagnostics.push(
          diagnostic(
            "azeforge.metadata#merge-key-disabled",
            "Front matter merge keys are not supported.",
            options,
            lines[1],
          ),
        );
      }
    },
    Node(_key, node) {
      if (!isAlias(node) && node.anchor !== undefined) {
        diagnostics.push(
          diagnostic(
            "azeforge.metadata#anchor-disabled",
            "Front matter anchors are not supported.",
            options,
            lines[1],
          ),
        );
      }
      if (node.tag !== undefined) {
        diagnostics.push(
          diagnostic(
            "azeforge.metadata#tag-disabled",
            "Front matter tags are not supported.",
            options,
            lines[1],
          ),
        );
      }
    },
  });
  let value: unknown;
  try {
    value = parsed.toJS({ maxAliasCount: 0 });
  } catch {
    diagnostics.push(
      diagnostic(
        "azeforge.metadata#invalid-yaml",
        "Front matter contains invalid YAML.",
        options,
        lines[1],
      ),
    );
  }

  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    diagnostics.push(
      diagnostic(
        "azeforge.metadata#mapping-required",
        "Front matter must be a mapping.",
        options,
        lines[1] ?? firstLine,
      ),
    );
    return {
      metadata: emptyMetadata(),
      diagnostics,
      bodyStart: closingIndex + 1,
      versionDeclared: false,
      defaults: EMPTY_DOCUMENT_DEFAULTS,
    };
  }

  const record = value as Record<string, unknown>;
  const metadata: {
    authors: readonly string[];
    extensions: Record<string, JsonValue>;
    title?: string;
    theme?: string;
    outputs?: readonly ArtifactFormat[];
    citationStyle?: CitationStyle;
  } = { authors: [], extensions: {} };
  const metadataLine = lines[1] ?? firstLine;

if (record.azemark !== undefined && record.azemark !== 2) {
    diagnostics.push(
      diagnostic(
        "azeforge.source#version-unsupported",
        'Front matter "azemark" must be the integer 2.',
        options,
        metadataLine,
      ),
    );
  }
  if (record.author !== undefined) {
    metadata.authors = parseAuthors(record.author, options, metadataLine, diagnostics);
  }
  if (record["citation-style"] !== undefined) {
    const style = record["citation-style"];
    if (style !== "numeric" && style !== "author-year") {
      diagnostics.push(
        diagnostic(
          "azeforge.metadata#invalid-citation-style",
          'Front matter "citation-style" must be numeric or author-year.',
          options,
          metadataLine,
          "error",
          rangeFromLines(metadataLine, metadataLine),
          { data: { value: typeof style === "string" ? style : null } },
        ),
      );
    } else {
      metadata.citationStyle = style;
    }
  }
  for (const key of ["title", "theme"] as const) {
    const item = record[key];
    if (item === undefined) continue;
    if (typeof item !== "string") {
      diagnostics.push(
        diagnostic(
          `azeforge.metadata#invalid-${key}`,
          `Front matter "${key}" must be a string.`,
          options,
          metadataLine,
        ),
      );
    } else {
      metadata[key] = item;
    }
  }
  if (record.outputs !== undefined) {
    const outputs = parseOutputs(record.outputs, options, metadataLine, diagnostics);
    if (outputs !== undefined) metadata.outputs = outputs;
  }

  for (const [key, item] of Object.entries(record)) {
    if (KNOWN_METADATA_KEYS[key] === true) continue;
    if (!EXTENSION_KEY.test(key)) {
      const malformedExtension = key.startsWith("x-");
      diagnostics.push(
        diagnostic(
          malformedExtension
            ? "azeforge.metadata#malformed-extension-key"
            : "azeforge.metadata#unknown-key",
          malformedExtension
            ? `Malformed front matter extension key "${key}".`
            : `Unknown front matter key "${key}".`,
          options,
          metadataLine,
          malformedExtension ? "error" : "warning",
          rangeFromLines(metadataLine, metadataLine),
          {
            data: { key },
            ...(malformedExtension
              ? {}
              : { suggestion: `Did you mean "${nearestMetadataKey(key)}"?` }),
          },
        ),
      );
      continue;
    }
    const extension = asJsonValue(item);
    if (extension === undefined) {
      diagnostics.push(
        diagnostic(
          "azeforge.metadata#invalid-extension",
          `Front matter extension "${key}" must contain JSON-compatible values.`,
          options,
          metadataLine,
        ),
      );
    } else {
      metadata.extensions[key] = extension;
    }
  }
  let frontMatterDefaults: PlotDocumentDefaults = EMPTY_DOCUMENT_DEFAULTS;
  if (record.defaults !== undefined) {
    const parsed = parseDocumentDefaults(record.defaults, { text: "", range: rangeFromLines(metadataLine, metadataLine) }, options.sourceName);
    diagnostics.push(...parsed.diagnostics);
    if (parsed.diagnostics.every((entry) => entry.severity !== "error")) {
      frontMatterDefaults = parsed.defaults;
    }
  }

  return {
    metadata,
    diagnostics,
    bodyStart: closingIndex + 1,
    versionDeclared: Object.prototype.hasOwnProperty.call(record, "azemark"),
    defaults: frontMatterDefaults,
  };
}

interface ParsedHeading {
  readonly level: 1 | 2 | 3 | 4 | 5 | 6;
  readonly text: string;
}

function lineTextStartIndex(line: SourceLine): number {
  return line.number === 1 && line.text.startsWith("\uFEFF") ? 1 : 0;
}

function lineText(line: SourceLine): string {
  return line.text.slice(lineTextStartIndex(line));
}

function parseAtxHeading(text: string): ParsedHeading | undefined {
  const match = /^ {0,3}(#{1,6})(?:[ \t]+(.*)|[ \t]*)$/.exec(text);
  const marker = match?.[1];
  if (marker === undefined) return undefined;
  const rawHeadingText = (match?.[2] ?? "").replace(/[ \t]+$/, "");
  const headingText = /^#+$/.test(rawHeadingText)
    ? ""
    : rawHeadingText.replace(/[ \t]+#+$/, "");
  return {
    level: marker.length as 1 | 2 | 3 | 4 | 5 | 6,
    text: headingText,
  };
}


interface RawHtmlMatch {
  readonly line: SourceLine;
  readonly startIndex: number;
  readonly endIndex: number;
}

function findRawHtml(lines: readonly SourceLine[]): RawHtmlMatch | undefined {
  const rawHtmlStart =
    /^(?:<!--|<![A-Za-z]|<\?|<\/?[A-Za-z][A-Za-z0-9-]*(?=[\s/>]))/;
  for (const line of lines) {
    const text = lineText(line);
    if (/^ {0,3}(?:`{3,}|~{3,})/.test(text)) continue;
    for (let index = 0; index < text.length; index += 1) {
      if (text[index] === "\\") {
        index += 1;
        continue;
      }
      if (text[index] === "`") {
        let delimiterLength = 1;
        while (text[index + delimiterLength] === "`") delimiterLength += 1;
        const delimiter = "`".repeat(delimiterLength);
        const closingIndex = text.indexOf(delimiter, index + delimiterLength);
        if (closingIndex >= 0) {
          index = closingIndex + delimiterLength - 1;
        } else {
          index += delimiterLength - 1;
        }
        continue;
      }
      if (text[index] !== "<") continue;
      const match = rawHtmlStart.exec(text.slice(index));
      if (match === null) continue;
      const closeIndex = text.indexOf(">", index + match[0].length);
      const contentStartIndex = lineTextStartIndex(line);
      return {
        line,
        startIndex: contentStartIndex + index,
        endIndex:
          contentStartIndex +
          (closeIndex < 0 ? index + match[0].length : closeIndex + 1),
      };
    }
  }
  return undefined;
}

function rawHtmlInvalidBlock(
  source: string,
  lines: readonly SourceLine[],
  match: RawHtmlMatch,
  options: ParseOptions,
  diagnostics: Diagnostic[],
): ParsedBlock {
  const first = lines[0] ?? match.line;
  const last = lines.at(-1) ?? match.line;
  const diagnosticIndex = diagnostics.length;
  diagnostics.push(
    diagnostic(
      "azeforge.security#raw-html-disabled",
      "Raw HTML is disabled in AzeMark Source.",
      options,
      match.line,
      "error",
      rangeFromLineSlice(match.line, match.startIndex, match.endIndex),
    ),
  );
  return {
    kind: "invalid",
    raw: source.slice(first.startIndex, last.endIndex),
    range: rangeFromLines(first, last),
    diagnosticIndexes: [diagnosticIndex],
  };
}

function damerauDistance(left: string, right: string): number {
  const a = [...left];
  const b = [...right];
  const m = a.length;
  const n = b.length;
  const INF = m + n;
  const d: number[][] = Array.from({ length: m + 2 }, () =>
    new Array<number>(n + 2).fill(0),
  );
  const first = d[0];
  const second = d[1];
  if (first !== undefined && second !== undefined) {
    first[0] = INF;
    second[0] = INF;
  }
  for (let i = 0; i <= m; i += 1) {
    const row = d[i + 1];
    const next = d[i + 2];
    if (row !== undefined) {
      row[0] = INF;
      row[1] = i;
    }
    if (next !== undefined) next[0] = INF;
  }
  for (let j = 0; j <= n; j += 1) {
    const row0 = d[0];
    const row1 = d[1];
    if (row0 !== undefined) row0[j + 1] = INF;
    if (row1 !== undefined) row1[j + 1] = j;
  }
  const lastRow = new Map<string, number>();
  for (let i = 1; i <= m; i += 1) {
    let db = 0;
    for (let j = 1; j <= n; j += 1) {
      const i1 = lastRow.get(b[j - 1] ?? "") ?? 0;
      const j1 = db;
      let cost = 1;
      if ((a[i - 1] ?? "") === (b[j - 1] ?? "")) {
        cost = 0;
        db = j;
      }
      const substitution = (d[i]?.[j] ?? 0) + cost;
      const insertion = (d[i + 1]?.[j] ?? 0) + 1;
      const deletion = (d[i]?.[j + 1] ?? 0) + 1;
      const transposition =
        (d[i1]?.[j1] ?? INF) + (i - i1 - 1) + 1 + (j - j1 - 1);
      const cell = d[i + 1]?.[j + 1];
      if (cell !== undefined) {
        const row = d[i + 1];
        if (row !== undefined) {
          row[j + 1] = Math.min(substitution, insertion, deletion, transposition);
        }
      }
    }
    lastRow.set(a[i - 1] ?? "", i);
  }
  return (d[m + 1]?.[n + 1] ?? INF) as number;
}

function unknownDirectiveCandidates(
  type: string,
  availableTypes: readonly string[],
): readonly string[] {
  const typeLength = [...type].length;
  return availableTypes
    .map((candidate) => {
      const absolute = damerauDistance(type, candidate);
      const normalized =
        absolute / Math.max(typeLength, [...candidate].length, 1);
      return { candidate, absolute, normalized };
    })
    .filter(({ absolute, normalized }) => absolute <= 3 && normalized <= 0.34)
    .sort((x, y) =>
      x.normalized === y.normalized
        ? x.absolute === y.absolute
          ? x.candidate < y.candidate
            ? -1
            : 1
          : x.absolute - y.absolute
        : x.normalized - y.normalized,
    )
    .map(({ candidate }) => candidate);
}

function missingSeparatorDiagnostic(
  lines: readonly SourceLine[],
  openIndex: number,
  closingIndex: number,
  first: SourceLine,
  options: ParseOptions,
  diagnostics: Diagnostic[],
): void {
  let insertionIndex = openIndex + 1;
  while (insertionIndex < closingIndex) {
    const candidate = lines[insertionIndex];
    if (candidate === undefined) break;
    const text = lineText(candidate);
    if (BLANK.test(text) || STRUCTURAL_COMMENT.test(text)) {
      insertionIndex += 1;
      continue;
    }
    if (HEADER_ENTRY.test(text)) {
      insertionIndex += 1;
      continue;
    }
    break;
  }
  const insertionLine = lines[insertionIndex] ?? first;
  const insertionRange = rangeFromLineSlice(insertionLine, 0, 0);
  diagnostics.push(
    diagnostic(
      "azeforge.source#missing-separator",
      "A directive Block must separate its header from its body with a `----` line.",
      options,
      first,
      "error",
      rangeFromLines(first, first),
      {
        suggestion:
          "Insert a line containing exactly `----` between the header properties and the body.",
        fix: {
          title: "Insert the `----` header/body separator.",
          applicability: "safe" as const,
          edits: [
            {
              range: insertionRange,
              expectedText: "",
              replacementText: "----\n",
            },
          ],
        },
      },
    ),
  );
}

function parseEquationEnvelope(
  source: string,
  lines: readonly SourceLine[],
  openIndex: number,
  closingIndex: number,
  first: SourceLine,
  last: SourceLine,
  options: ParseOptions,
  allowRawLatex: boolean,
  diagnostics: Diagnostic[],
): ParsedBlock {
  const blockRange = rangeFromLines(first, last);
  const raw = source.slice(first.startIndex, last.endIndex);
  const startIndex = diagnostics.length;
  const finishInvalid = (): ParsedBlock => ({
    kind: "invalid",
    raw,
    range: blockRange,
    diagnosticIndexes: Array.from(
      { length: diagnostics.length - startIndex },
      (_, offset) => startIndex + offset,
    ),
    originalType: EQUATION_PLUGIN_TYPE,
  });
  const { entries, bodyStart, separatorFound } = splitHeaderEntries(
    lines,
    openIndex,
    closingIndex,
  );
  if (!separatorFound) {
    missingSeparatorDiagnostic(lines, openIndex, closingIndex, first, options, diagnostics);
    return finishInvalid();
  }
  const bodyLines = lines.slice(bodyStart, closingIndex);
  const body = bodyLines.map((entry) => lineText(entry)).join("\n");
  const bodyRanges = bodyLines.map((entry) => rangeFromLines(entry, entry));
  const syntaxRange = entries.find((entry) => entry.key === "syntax")?.range;
  const header = parseEquationHeader(entries, blockRange, options.sourceName);
  if (header.diagnostics.length > 0) {
    diagnostics.push(...header.diagnostics);
    return finishInvalid();
  }
  const validated = validateEquationBody({
    header,
    body,
    bodyRanges,
    blockRange,
    sourceName: options.sourceName,
    allowRawLatex,
    ...(syntaxRange === undefined ? {} : { syntaxRange }),
  });
  if (validated.block !== undefined) return validated.block;
  diagnostics.push(...validated.diagnostics);
  return finishInvalid();
}
export const MAX_NESTING_DEPTH = 8;

interface InlineSource {
  readonly text: string;
  /** Map a fragment-relative offset back to a real Source range. */
  readonly rangeFor: (offset: number, length: number) => SourceRange;
}

function inlineSourceWithRanges(lines: readonly SourceLine[]): InlineSource {
  const bases: { readonly outStart: number; readonly line: SourceLine; readonly indent: number; readonly text: string }[] = [];
  let out = "";
  let hardBreak = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] as SourceLine;
    const raw = lineText(line);
    const last = index === lines.length - 1;
    let stripped = raw;
    let hard = false;
    if (!last) {
      if (/\\[ \t]*$/.test(raw)) {
        hard = true;
        stripped = raw.replace(/\\[ \t]*$/, "");
      } else if (/[ \t]{2,}$/.test(raw)) {
        hard = true;
        stripped = raw.replace(/[ \t]+$/, "");
      }
    }
    const indent = /^[ \t]*/.exec(stripped)?.[0].length ?? 0;
    stripped = stripped.replace(/^[ \t]+|[ \t]+$/g, "");
    out += (index === 0 ? "" : hardBreak ? "\n" : " ") + stripped;
    bases.push({ outStart: out.length - stripped.length, line, indent, text: stripped });
    hardBreak = hard;
  }
  const locate = (offset: number): { readonly base: (typeof bases)[number]; readonly column: number } | undefined => {
    for (const base of bases) {
      if (offset >= base.outStart && offset <= base.outStart + base.text.length) {
        return { base, column: offset - base.outStart };
      }
    }
    const lastBase = bases[bases.length - 1];
    if (lastBase === undefined) return undefined;
    return { base: lastBase, column: lastBase.text.length };
  };
  return {
    text: out,
    rangeFor(offset: number, length: number): SourceRange {
      const from = locate(offset);
      const to = locate(offset + Math.max(1, length) - 1);
      if (from === undefined || to === undefined) {
        return rangeFromLines(lines[0] as SourceLine, lines[lines.length - 1] as SourceLine);
      }
      if (from.base.line === to.base.line) {
        return rangeFromLineSlice(
          from.base.line,
          from.base.indent + from.column,
          to.base.indent + to.column + 1,
        );
      }
      return rangeFromLines(from.base.line, to.base.line);
    },
  };
}

function parseInlineNodes(
  text: string,
  first: SourceLine,
  last: SourceLine,
  options: ParseOptions,
  diagnostics: Diagnostic[],
  rangeFor?: InlineRangeFor,
): Inline[] | undefined {
  const parsed = parseInlineFragment(text, rangeFor);
  if (parsed.unsafeTargets.length > 0) {
    const target = parsed.unsafeTargets[0] ?? "";
    diagnostics.push(
      diagnostic(
        "azeforge.link#unsafe-protocol",
        `Link target "${target}" uses a disallowed protocol.`,
        options,
        first,
        "error",
        rangeFromLines(first, last),
        {
          data: { href: target },
          suggestion: "Use an https:, http:, mailto:, or #fragment link.",
        },
      ),
    );
    return undefined;
  }
  return [...parsed.nodes];
}

function ensureInlineTargetsSafe(
  texts: readonly string[],
  first: SourceLine,
  last: SourceLine,
  options: ParseOptions,
  diagnostics: Diagnostic[],
): boolean {
  for (const text of texts) {
    const parsed = parseInlineFragment(text);
    if (parsed.unsafeTargets.length > 0) {
      const target = parsed.unsafeTargets[0] ?? "";
      diagnostics.push(
        diagnostic(
          "azeforge.link#unsafe-protocol",
          `Link target "${target}" uses a disallowed protocol.`,
          options,
          first,
          "error",
          rangeFromLines(first, last),
          {
            data: { href: target },
            suggestion: "Use an https:, http:, mailto:, or #fragment link.",
          },
        ),
      );
      return false;
    }
  }
  return true;
}

function invalidBlockFor(
  source: string,
  first: SourceLine,
  last: SourceLine,
  startIndex: number,
  diagnostics: readonly Diagnostic[],
  originalType?: string,
): ParsedBlock {
  return {
    kind: "invalid",
    raw: source.slice(first.startIndex, last.endIndex),
    range: rangeFromLines(first, last),
    diagnosticIndexes: Array.from(
      { length: diagnostics.length - startIndex },
      (_, offset) => startIndex + offset,
    ),
    ...(originalType === undefined ? {} : { originalType }),
  };
}

const FOOTNOTE_DEFINITION =
  /^ {0,3}\[\^([a-z][a-z0-9]*(?:-[a-z0-9]+)*)\]:[ \t]*(.*)$/;

/**
 * One `[^label]: text` definition: a top-level Block in any document position
 * whose paragraph runs to the next blank line and joins to one inline
 * paragraph (contract: issue #67 §6).
 */
function parseFootnoteDefinition(
  source: string,
  lines: readonly SourceLine[],
  index: number,
  options: ParseOptions,
  diagnostics: Diagnostic[],
): { readonly block: ParsedBlock; readonly next: number } | undefined {
  const first = lines[index];
  if (first === undefined) return undefined;
  const match = FOOTNOTE_DEFINITION.exec(lineText(first));
  if (match === null) return undefined;
  const label = match[1] as string;
  const parts: string[] = [match[2] ?? ""];
  let cursor = index + 1;
  while (cursor < lines.length) {
    const candidate = lines[cursor];
    if (candidate === undefined) break;
    const text = lineText(candidate);
    if (/^[ \t]*$/.test(text)) break;
    if (FOOTNOTE_DEFINITION.exec(text) !== null) break;
    if (OUTER_DIRECTIVE_OPEN.exec(text) !== null) break;
    if (NESTED_DIRECTIVE_OPEN.exec(text) !== null) break;
    parts.push(text.trim());
    cursor += 1;
  }
  const last = lines[cursor - 1] ?? first;
  const startIndex = diagnostics.length;
  const children = parseInlineNodes(parts.join(" "), first, last, options, diagnostics);
  const range = rangeFromLines(first, last);
  if (children === undefined) {
    return {
      block: invalidBlockFor(source, first, last, startIndex, diagnostics),
      next: cursor,
    };
  }
  return {
    block: { kind: "footnoteDefinition", label, children, range },
    next: cursor,
  };
}

function isThematicBreakText(text: string): boolean {
  return /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/.test(text);
}

function fenceOpen(text: string): { char: "`" | "~"; length: number; info: string } | undefined {
  const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(text);
  if (match === null) return undefined;
  const fence = match[1] ?? "";
  const char = fence[0] === "~" ? ("~" as const) : ("`" as const);
  const info = (match[2] ?? "").trim();
  if (char === "`" && info.includes("`")) return undefined;
  return { char, length: fence.length, info };
}

function isFenceClose(text: string, char: "`" | "~", length: number): boolean {
  const match = /^ {0,3}(`+|~+)[ \t]*$/.exec(text);
  if (match === null) return false;
  const run = match[1] ?? "";
  return run[0] === char && run.length >= length;
}

function parseFencedCode(
  source: string,
  lines: readonly SourceLine[],
  index: number,
  options: ParseOptions,
  diagnostics: Diagnostic[],
): { block: ParsedBlock; next: number } | undefined {
  const open = lines[index];
  if (open === undefined) return undefined;
  const fence = fenceOpen(lineText(open));
  if (fence === undefined) return undefined;
  let closing = -1;
  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    const candidate = lines[cursor];
    if (candidate !== undefined && isFenceClose(lineText(candidate), fence.char, fence.length)) {
      closing = cursor;
      break;
    }
  }
  if (closing < 0) {
    const startIndex = diagnostics.length;
    const last = lines.at(-1) ?? open;
    diagnostics.push(
      diagnostic(
        "azeforge.source#unclosed-fence",
        "A fenced code Block must end with a matching closing fence.",
        options,
        open,
        "error",
        rangeFromLines(open, open),
        { suggestion: "Close the fenced code Block with a matching fence." },
      ),
    );
    return {
      block: invalidBlockFor(source, open, last, startIndex, diagnostics),
      next: lines.length,
    };
  }
  const last = lines[closing] ?? open;
  const value = lines
    .slice(index + 1, closing)
    .map((line) => lineText(line as SourceLine))
    .join("\n");
  const language = fence.info.split(/[ \t]+/, 1)[0] ?? "";
  return {
    block: {
      kind: "code",
      value,
      range: rangeFromLines(open, last),
      ...(language === "" ? {} : { language }),
    },
    next: closing + 1,
  };
}

function stripQuotePrefix(text: string): string | undefined {
  const match = /^ {0,3}>[ \t]?/.exec(text);
  if (match === null) return undefined;
  return text.slice(match[0].length);
}

function syntheticLine(original: SourceLine, text: string, prefixChars: number): SourceLine {
  return {
    number: original.number,
    text,
    startIndex: original.startIndex + prefixChars,
    endIndex: original.endIndex,
    startOffset: original.startOffset + Buffer.byteLength(original.text.slice(0, prefixChars), "utf8"),
    endOffset: original.endOffset,
  };
}

function parseNestedBlocks(
  source: string,
  nested: readonly SourceLine[],
  first: SourceLine,
  last: SourceLine,
  options: ParseOptions,
  diagnostics: Diagnostic[],
  activeTypes: readonly string[],
  allowRawLatex: boolean,
  depth: number,
): readonly ParsedBlock[] | undefined {
  if (depth + 1 > MAX_NESTING_DEPTH) {
    diagnostics.push(
      diagnostic(
        "azeforge.source#nesting-too-deep",
        "Nested content exceeds the maximum supported depth.",
        options,
        first,
        "error",
        rangeFromLines(first, last),
      ),
    );
    return undefined;
  }
  return parseBlocks(source, nested, 0, options, diagnostics, activeTypes, allowRawLatex, depth + 1);
}

function parseBlockquote(
  source: string,
  lines: readonly SourceLine[],
  index: number,
  options: ParseOptions,
  diagnostics: Diagnostic[],
  activeTypes: readonly string[],
  allowRawLatex: boolean,
  depth: number,
): { block: ParsedBlock; next: number } | undefined {
  const first = lines[index];
  if (first === undefined || stripQuotePrefix(lineText(first)) === undefined) return undefined;
  const consumed: SourceLine[] = [];
  const inner: SourceLine[] = [];
  let cursor = index;
  while (cursor < lines.length) {
    const line = lines[cursor];
    if (line === undefined) break;
    const text = lineText(line);
    if (/^[ \t]*$/.test(text)) {
      consumed.push(line);
      inner.push(syntheticLine(line, "", 0));
      cursor += 1;
      continue;
    }
    const stripped = stripQuotePrefix(text);
    if (stripped === undefined) break;
    consumed.push(line);
    const prefixChars = text.length - stripped.length;
    inner.push(syntheticLine(line, stripped, prefixChars));
    cursor += 1;
  }
  while (inner.length > 0 && /^[ \t]*$/.test(inner[inner.length - 1]?.text ?? "")) {
    inner.pop();
    consumed.pop();
    cursor -= 1;
  }
  const last = consumed.at(-1) ?? first;
  const startIndex = diagnostics.length;
  const children = parseNestedBlocks(source, inner, first, last, options, diagnostics, activeTypes, allowRawLatex, depth);
  if (children === undefined) {
    return {
      block: invalidBlockFor(source, first, last, startIndex, diagnostics),
      next: cursor,
    };
  }
  return {
    block: { kind: "blockquote", children, range: rangeFromLines(first, last) },
    next: cursor,
  };
}

interface ListMarker {
  readonly ordered: boolean;
  readonly lead: number;
  readonly markerEnd: number;
  readonly start?: number;
}

function parseListMarker(text: string): ListMarker | undefined {
  const unordered = /^([ \t]*)([*+-])(?:[ \t]+|$)/.exec(text);
  if (unordered !== null) {
    const lead = (unordered[1] ?? "").replaceAll("\t", "    ").length;
    const markerEnd = (unordered[1] ?? "").length + 1 + ((/^[ \t]/.test(text.slice((unordered[1] ?? "").length + 1)) ? 1 : 0) as number);
    if (lead > 3 && markerEnd <= 0) return undefined;
    return { ordered: false, lead, markerEnd };
  }
  const ordered = /^([ \t]*)(\d{1,9})([.)])(?:[ \t]+|$)/.exec(text);
  if (ordered !== null) {
    const lead = (ordered[1] ?? "").replaceAll("\t", "    ").length;
    const digits = ordered[2] ?? "";
    const markerEnd = (ordered[1] ?? "").length + digits.length + 1 + ((/^[ \t]/.test(text.slice((ordered[1] ?? "").length + digits.length + 1)) ? 1 : 0) as number);
    if (lead > 3) return undefined;
    return { ordered: true, lead, markerEnd, start: Number.parseInt(digits, 10) };
  }
  return undefined;
}

function leadingSpaces(text: string): number {
  const match = /^[ \t]*/.exec(text);
  return (match?.[0] ?? "").length;
}

function parseList(
  source: string,
  lines: readonly SourceLine[],
  index: number,
  options: ParseOptions,
  diagnostics: Diagnostic[],
  activeTypes: readonly string[],
  allowRawLatex: boolean,
  depth: number,
): { block: ParsedBlock; next: number } | undefined {
  const first = lines[index];
  if (first === undefined) return undefined;
  const opener = parseListMarker(lineText(first));
  if (opener === undefined || opener.lead > 3) return undefined;
  const items: { blocks: readonly ParsedBlock[]; range: ReturnType<typeof rangeFromLines> }[] = [];
  const itemLineRuns: SourceLine[][] = [];
  const itemOriginals: SourceLine[][] = [];
  let cursor = index;
  let contentIndent = opener.markerEnd;
  let failed = false;
  while (cursor < lines.length) {
    const line = lines[cursor];
    if (line === undefined) break;
    const text = lineText(line);
    if (/^[ \t]*$/.test(text)) {
      if (itemLineRuns.length === 0) break;
      itemLineRuns[itemLineRuns.length - 1]?.push(syntheticLine(line, "", 0));
      itemOriginals[itemOriginals.length - 1]?.push(line);
      cursor += 1;
      continue;
    }
    const marker = parseListMarker(text);
    if (
      marker !== undefined &&
      marker.ordered === opener.ordered &&
      marker.lead < contentIndent &&
      itemLineRuns.length > 0
    ) {
      const innerFirst = text.slice(marker.markerEnd);
      const prefixChars = text.length - innerFirst.length;
      itemLineRuns.push([syntheticLine(line, innerFirst, prefixChars)]);
      itemOriginals.push([line]);
      contentIndent = marker.markerEnd;
      cursor += 1;
      continue;
    }
    if (itemLineRuns.length === 0) {
      const innerFirst = text.slice(opener.markerEnd);
      const prefixChars = text.length - innerFirst.length;
      itemLineRuns.push([syntheticLine(line, innerFirst, prefixChars)]);
      itemOriginals.push([line]);
      cursor += 1;
      continue;
    }
    if (leadingSpaces(text) >= contentIndent) {
      itemLineRuns[itemLineRuns.length - 1]?.push(syntheticLine(line, text.slice(contentIndent), contentIndent));
      itemOriginals[itemOriginals.length - 1]?.push(line);
      cursor += 1;
      continue;
    }
    break;
  }
  const last = lines[cursor - 1] ?? first;
  const startIndex = diagnostics.length;
  for (let itemIndex = 0; itemIndex < itemLineRuns.length; itemIndex += 1) {
    const run = (itemLineRuns[itemIndex] ?? []).filter((line, position, all) => {
      if (position < all.length - 1) return true;
      return !/^[ \t]*$/.test(line.text);
    });
    const originals = itemOriginals[itemIndex] ?? [];
    const itemFirst = originals[0] ?? first;
    const itemLast = originals.at(-1) ?? itemFirst;
    const children = parseNestedBlocks(source, run, itemFirst, itemLast, options, diagnostics, activeTypes, allowRawLatex, depth);
    if (children === undefined) {
      failed = true;
      break;
    }
    items.push({ blocks: children, range: rangeFromLines(itemFirst, itemLast) });
  }
  if (failed || items.length === 0) {
    return {
      block: invalidBlockFor(source, first, last, startIndex, diagnostics),
      next: cursor,
    };
  }
  return {
    block: {
      kind: "list",
      ordered: opener.ordered,
      items,
      range: rangeFromLines(first, last),
      ...(opener.ordered && opener.start !== undefined && opener.start !== 1 ? { start: opener.start } : {}),
    },
    next: cursor,
  };
}

function tryGfmTableAt(
  lines: readonly SourceLine[],
  index: number,
): { data: TableData; consumed: number } | undefined {
  const headerLine = lines[index];
  const delimiterLine = lines[index + 1];
  if (headerLine === undefined || delimiterLine === undefined) return undefined;
  if (!isGfmTableStart(lineText(headerLine), lineText(delimiterLine))) return undefined;
  const texts: string[] = [];
  let cursor = index;
  while (cursor < lines.length) {
    const line = lines[cursor];
    if (line === undefined) break;
    const text = lineText(line);
    if (/^[ \t]*$/.test(text)) break;
    if (cursor > index + 1 && !text.includes("|")) break;
    texts.push(text);
    cursor += 1;
  }
  const parsed = tryParseGfmTable(texts);
  if (parsed === undefined) return undefined;
  return { data: parsed.data, consumed: parsed.consumed };
}

interface SplitDirectiveHeader {
  readonly entries: { key: string; value: string; range: SourceRange }[];
  readonly bodyStart: number;
  /** True when a mandatory `----` header/body separator was found. */
  readonly separatorFound: boolean;
}

function splitHeaderEntries(
  lines: readonly SourceLine[],
  openIndex: number,
  closingIndex: number,
): SplitDirectiveHeader {
  const entries: { key: string; value: string; range: SourceRange }[] = [];
  let cursor = openIndex + 1;
  while (cursor < closingIndex) {
    const header = lines[cursor];
    if (header === undefined) break;
    const text = lineText(header);
    if (BLANK.test(text)) {
      cursor += 1;
      continue;
    }
    if (STRUCTURAL_COMMENT.test(text)) {
      cursor += 1;
      continue;
    }
    if (HEADER_SEPARATOR.test(text)) {
      return { entries, bodyStart: cursor + 1, separatorFound: true };
    }
    const match = HEADER_ENTRY.exec(text);
    if (match === null) break;
    const key = match[1] ?? "";
    const rawValue = match[2] ?? "";
    const value = rawValue.trim();
    const colonIndex = header.text.indexOf(":");
    const valueStart = colonIndex + 1 + (rawValue.length - rawValue.trimStart().length);
    entries.push({
      key,
      value,
      range: rangeFromLineSlice(header, valueStart, valueStart + value.length),
    });
    cursor += 1;
  }
  return { entries, bodyStart: closingIndex, separatorFound: false };
}
function parseMermaidEnvelope(
  source: string,
  lines: readonly SourceLine[],
  openIndex: number,
  closingIndex: number,
  first: SourceLine,
  last: SourceLine,
  options: ParseOptions,
  diagnostics: Diagnostic[],
): ParsedBlock {
  const blockRange = rangeFromLines(first, last);
  const startIndex = diagnostics.length;
  const finishInvalid = (): ParsedBlock =>
    invalidBlockFor(
      source,
      first,
      last,
      startIndex,
      diagnostics,
      MERMAID_PLUGIN_TYPE,
    );
  const { entries, bodyStart, separatorFound } = splitHeaderEntries(
    lines,
    openIndex,
    closingIndex,
  );
  if (!separatorFound) {
    missingSeparatorDiagnostic(lines, openIndex, closingIndex, first, options, diagnostics);
    return finishInvalid();
  }
  const header = parseMermaidHeader(
    entries,
    blockRange,
    options.sourceName,
  );
  if (header.diagnostics.length > 0) {
    diagnostics.push(...header.diagnostics);
    return finishInvalid();
  }
  const bodyLines = lines.slice(bodyStart, closingIndex);
  const validated = validateMermaidBody({
    header,
    body: bodyLines.map((line) => lineText(line)).join("\n"),
    bodyRanges: bodyLines.map((line) => rangeFromLines(line, line)),
    blockRange,
    sourceName: options.sourceName,
  });
  if (validated.block !== undefined) return validated.block;
  diagnostics.push(...validated.diagnostics);
  return finishInvalid();
}
function parseTexEnvelope(
  source: string,
  lines: readonly SourceLine[],
  openIndex: number,
  closingIndex: number,
  first: SourceLine,
  last: SourceLine,
  options: ParseOptions,
  diagnostics: Diagnostic[],
): ParsedBlock {
  const blockRange = rangeFromLines(first, last);
  const startIndex = diagnostics.length;
  const finishInvalid = (): ParsedBlock =>
    invalidBlockFor(source, first, last, startIndex, diagnostics, TEX_PLUGIN_TYPE);
  const { entries, bodyStart, separatorFound } = splitHeaderEntries(lines, openIndex, closingIndex);
  if (!separatorFound) {
    missingSeparatorDiagnostic(lines, openIndex, closingIndex, first, options, diagnostics);
    return finishInvalid();
  }
  const bodyLines = lines.slice(bodyStart, closingIndex);
  const validated = validateTexBody({
    header: parseTexHeader(entries, options.sourceName),
    bodyLines: bodyLines.map((line) => ({
      text: lineText(line),
      range: rangeFromLines(line, line),
    })),
    blockRange,
    ...(options.sourceName === undefined ? {} : { sourceName: options.sourceName }),
  });
  diagnostics.push(...validated.diagnostics);
  return validated.block ?? finishInvalid();
}



function parseDerivationEnvelope(
  source: string,
  lines: readonly SourceLine[],
  openIndex: number,
  closingIndex: number,
  first: SourceLine,
  last: SourceLine,
  options: ParseOptions,
  diagnostics: Diagnostic[],
): ParsedBlock {
  const blockRange = rangeFromLines(first, last);
  const startIndex = diagnostics.length;
  const finishInvalid = (): ParsedBlock =>
    invalidBlockFor(source, first, last, startIndex, diagnostics, DERIVATION_PLUGIN_TYPE);
  const { entries, bodyStart, separatorFound } = splitHeaderEntries(
    lines,
    openIndex,
    closingIndex,
  );
  if (!separatorFound) {
    missingSeparatorDiagnostic(lines, openIndex, closingIndex, first, options, diagnostics);
    return finishInvalid();
  }
  const header = parseDerivationHeader(entries, blockRange, options.sourceName);
  if (header.diagnostics.length > 0) {
    diagnostics.push(...header.diagnostics);
    return finishInvalid();
  }
  const bodyLines = lines.slice(bodyStart, closingIndex);
  const body = bodyLines.map((line) => lineText(line)).join("\n");
  const bodyRanges = bodyLines.map((line) => rangeFromLines(line, line));
  const validated = validateDerivationBody({
    header,
    body,
    bodyRanges,
    blockRange,
    sourceName: options.sourceName,
    parseAnnotation: (text, range) => {
      const lineIndex = bodyLines.findIndex(
        (line) =>
          rangeFromLines(line, line).start.offset === range.start.offset,
      );
      const annotationLine = bodyLines[lineIndex];
      const nodes = parseInlineNodes(
        text,
        annotationLine ?? first,
        annotationLine ?? last,
        options,
        diagnostics,
      );
      return nodes;
    },
  });
  if (validated.block !== undefined) return validated.block;
  diagnostics.push(...validated.diagnostics);
  return finishInvalid();
}

function parseCalloutEnvelope(
  source: string,
  lines: readonly SourceLine[],
  openIndex: number,
  closingIndex: number,
  first: SourceLine,
  last: SourceLine,
  options: ParseOptions,
  diagnostics: Diagnostic[],
  activeTypes: readonly string[],
  allowRawLatex: boolean,
  depth: number,
): ParsedBlock {
  const blockRange = rangeFromLines(first, last);
  const startIndex = diagnostics.length;
  const finishInvalid = (): ParsedBlock =>
    invalidBlockFor(source, first, last, startIndex, diagnostics, CALLOUT_PLUGIN_TYPE);
  const { entries, bodyStart, separatorFound } = splitHeaderEntries(lines, openIndex, closingIndex);
  if (!separatorFound) {
    missingSeparatorDiagnostic(lines, openIndex, closingIndex, first, options, diagnostics);
    return finishInvalid();
  }
  let variant = "note";
  let title: Inline[] | undefined;
  let id: string | undefined;
  for (const entry of entries) {
    if (entry.key === "variant") {
      if (!(CALLOUT_VARIANTS as readonly string[]).includes(entry.value)) {
        diagnostics.push(
          diagnostic(
            "azeforge.callout#unknown-variant",
            `Callout variant "${entry.value}" is not supported.`,
            options,
            first,
            "error",
            entry.range,
            {
              data: { variant: entry.value },
              suggestion: `Use one of ${(CALLOUT_VARIANTS as readonly string[]).join(", ")}.`,
            },
          ),
        );
        return finishInvalid();
      }
      variant = entry.value;
    } else if (entry.key === "title") {
      const nodes = parseInlineNodes(entry.value, first, last, options, diagnostics);
      if (nodes === undefined) return finishInvalid();
      title = nodes;
    } else if (entry.key === "id") {
      id = entry.value;
    } else {
      diagnostics.push(
        diagnostic(
          "azeforge.callout#unknown-header",
          `Callout header key "${entry.key}" is not supported.`,
          options,
          first,
          "error",
          entry.range,
          {
            data: { key: entry.key },
            suggestion: "Use variant, title, or id.",
          },
        ),
      );
      return finishInvalid();
    }
  }
  const bodyLines = lines.slice(bodyStart, closingIndex).filter((line) => !/^[ \t]*$/.test(lineText(line as SourceLine)));
  const children =
    bodyLines.length === 0
      ? []
      : parseNestedBlocks(source, bodyLines as SourceLine[], first, last, options, diagnostics, activeTypes, allowRawLatex, depth);
  if (children === undefined) return finishInvalid();
  const block: CalloutBlock = {
    kind: "callout",
    variant,
    children,
    range: blockRange,
    ...(id === undefined || id === "" ? {} : { id }),
    ...(title === undefined ? {} : { title }),
    pluginVersion: CALLOUT_PLUGIN_VERSION,
  };
  return block;
}

/** Inline parsing at an explicit source range, for declaration-shaped bodies. */
function parseInlineNodesInRange(
  text: string,
  range: SourceRange,
  options: ParseOptions,
  diagnostics: Diagnostic[],
): Inline[] | undefined {
  const parsed = parseInlineFragment(text, (offset, length) => ({
    start: {
      line: range.start.line,
      column: range.start.column + offset,
      offset: range.start.offset + offset,
    },
    end: {
      line: range.start.line,
      column: range.start.column + offset + Math.max(1, length),
      offset: range.start.offset + offset + Math.max(1, length),
    },
  }));
  if (parsed.unsafeTargets.length > 0) {
    const target = parsed.unsafeTargets[0] ?? "";
    diagnostics.push(
      createDiagnostic(
        "azeforge.link#unsafe-protocol",
        "error",
        `Link target "${target}" uses a disallowed protocol.`,
        {
          location: {
            ...(options.sourceName === undefined
              ? {}
              : { source: options.sourceName }),
            range,
          },
          data: { href: target },
          suggestion: "Use an https:, http:, mailto:, or #fragment link.",
        },
      ),
    );
    return undefined;
  }
  return [...parsed.nodes];
}

function parseTableEnvelope(
  source: string,
  lines: readonly SourceLine[],
  openIndex: number,
  closingIndex: number,
  first: SourceLine,
  last: SourceLine,
  options: ParseOptions,
  diagnostics: Diagnostic[],
): ParsedBlock {
  const blockRange = rangeFromLines(first, last);
  const startIndex = diagnostics.length;
  const finishInvalid = (): ParsedBlock =>
    invalidBlockFor(source, first, last, startIndex, diagnostics, TABLE_PLUGIN_TYPE);
  const { entries, bodyStart, separatorFound } = splitHeaderEntries(lines, openIndex, closingIndex);
  if (!separatorFound) {
    missingSeparatorDiagnostic(lines, openIndex, closingIndex, first, options, diagnostics);
    return finishInvalid();
  }
  const header = parseCompositionHeader(entries, options.sourceName, {
    namespace: "azeforge.table",
    known: [],
    parseCaption: (text, _range) => parseInlineNodes(text, first, last, options, diagnostics),
  });
  if (header.diagnostics.length > 0) {
    diagnostics.push(...header.diagnostics);
    return finishInvalid();
  }
  const bodyLines = lines.slice(bodyStart, closingIndex);
  const bodySourceLines = bodyLines.filter(
    (line) => !/^[ \t]*$/.test(lineText(line as SourceLine)),
  ) as SourceLine[];
  const bodyRawHtml = findRawHtml(bodySourceLines);
  if (bodyRawHtml !== undefined) {
    diagnostics.push(
      diagnostic(
        "azeforge.security#raw-html-disabled",
        "Raw HTML is disabled in AzeMark Source.",
        options,
        bodyRawHtml.line,
        "error",
        rangeFromLineSlice(bodyRawHtml.line, bodyRawHtml.startIndex, bodyRawHtml.endIndex),
      ),
    );
    return invalidBlockFor(source, first, last, startIndex, diagnostics, TABLE_PLUGIN_TYPE);
  }
  const parsed = parseTypedTableData(bodyLines as SourceLine[], blockRange, {
    ...(options.sourceName === undefined ? {} : { sourceName: options.sourceName }),
    parseInline: (text, range) =>
      parseInlineNodesInRange(text, range, options, diagnostics),
  });
  diagnostics.push(...parsed.diagnostics);
  if (parsed.data === undefined) return finishInvalid();
  const block: TableBlock = {
    kind: "table",
    data: parsed.data,
    range: blockRange,
    ...(header.id === undefined || header.id === "" ? {} : { id: header.id }),
    ...(header.number === undefined ? {} : { number: header.number }),
    ...(header.caption === undefined ? {} : { caption: header.caption }),
    pluginVersion: TABLE_PLUGIN_VERSION,
  };
  return block;
}

function parsePlotFamilyEnvelope(
  source: string,
  lines: readonly SourceLine[],
  openIndex: number,
  closingIndex: number,
  first: SourceLine,
  last: SourceLine,
  options: ParseOptions,
  diagnostics: Diagnostic[],
  pluginType: string,
  sectionDefaults: PlotBlockDefaults | undefined,
  validate: (args: {
    readonly headerLines: readonly PlotInputLine[];
    readonly bodyLines: readonly PlotInputLine[];
    readonly blockRange: SourceRange;
    readonly sourceName: string | undefined;
    readonly defaults?: PlotBlockDefaults;
  }) => {
    readonly block?: PlotBlock | ChartBlock;
    readonly diagnostics: readonly Diagnostic[];
  },
): ParsedBlock {
  const blockRange = rangeFromLines(first, last);
  const startIndex = diagnostics.length;
  const finishInvalid = (): ParsedBlock =>
    invalidBlockFor(source, first, last, startIndex, diagnostics, pluginType);
  const { bodyStart, separatorFound } = splitHeaderEntries(lines, openIndex, closingIndex);
  if (!separatorFound) {
    missingSeparatorDiagnostic(lines, openIndex, closingIndex, first, options, diagnostics);
    return finishInvalid();
  }
  const toInput = (line: SourceLine): PlotInputLine => ({
    text: lineText(line),
    range: rangeFromLines(line, line),
  });
  const headerLines = lines.slice(openIndex + 1, bodyStart - 1).map(toInput);
  const bodyLines = lines.slice(bodyStart, closingIndex).map(toInput);
  const validated = validate({
    headerLines,
    bodyLines,
    blockRange,
    sourceName: options.sourceName,
    ...(sectionDefaults === undefined ? {} : { defaults: sectionDefaults }),
  });
  diagnostics.push(...validated.diagnostics);
  if (validated.block !== undefined) return validated.block;
  return finishInvalid();
}

function parseGeometryEnvelope(
  source: string,
  lines: readonly SourceLine[],
  openIndex: number,
  closingIndex: number,
  first: SourceLine,
  last: SourceLine,
  options: ParseOptions,
  diagnostics: Diagnostic[],
): ParsedBlock {
  const blockRange = rangeFromLines(first, last);
  const startIndex = diagnostics.length;
  const finishInvalid = (): ParsedBlock =>
    invalidBlockFor(source, first, last, startIndex, diagnostics, GEOMETRY_PLUGIN_TYPE);
  const { bodyStart, separatorFound } = splitHeaderEntries(lines, openIndex, closingIndex);
  if (!separatorFound) {
    missingSeparatorDiagnostic(lines, openIndex, closingIndex, first, options, diagnostics);
    return finishInvalid();
  }
  const toInput = (line: SourceLine): GeometryInputLine => ({
    text: lineText(line),
    range: rangeFromLines(line, line),
  });
  const validated = validateGeometryBlock({
    headerLines: lines.slice(openIndex + 1, bodyStart - 1).map(toInput),
    bodyLines: lines.slice(bodyStart, closingIndex).map(toInput),
    blockRange,
    sourceName: options.sourceName,
  });
  diagnostics.push(...validated.diagnostics);
  if (validated.block !== undefined) return validated.block;
  return finishInvalid();
}

function parseCircuitEnvelope(
  source: string,
  lines: readonly SourceLine[],
  openIndex: number,
  closingIndex: number,
  first: SourceLine,
  last: SourceLine,
  options: ParseOptions,
  diagnostics: Diagnostic[],
  symbolConvention: unknown,
): ParsedBlock {
  const blockRange = rangeFromLines(first, last);
  const startIndex = diagnostics.length;
  const { bodyStart, separatorFound } = splitHeaderEntries(lines, openIndex, closingIndex);
  if (!separatorFound) {
    missingSeparatorDiagnostic(lines, openIndex, closingIndex, first, options, diagnostics);
    return invalidBlockFor(source, first, last, startIndex, diagnostics, CIRCUIT_PLUGIN_TYPE);
  }
  const toInput = (line: SourceLine): CircuitInputLine => ({
    text: lineText(line),
    range: rangeFromLines(line, line),
  });
  const validated = validateCircuitBlock({
    headerLines: lines.slice(openIndex + 1, bodyStart - 1).map(toInput),
    bodyLines: lines.slice(bodyStart, closingIndex).map(toInput),
    blockRange,
    ...(options.sourceName === undefined ? {} : { sourceName: options.sourceName }),
    ...(typeof symbolConvention === "string" ? { symbolConvention } : {}),
  });
  diagnostics.push(...validated.diagnostics);
  return validated.block ?? invalidBlockFor(source, first, last, startIndex, diagnostics, CIRCUIT_PLUGIN_TYPE);
}
function parseTimingEnvelope(
  source: string,
  lines: readonly SourceLine[],
  openIndex: number,
  closingIndex: number,
  first: SourceLine,
  last: SourceLine,
  options: ParseOptions,
  diagnostics: Diagnostic[],
): ParsedBlock {
  const blockRange = rangeFromLines(first, last);
  const startIndex = diagnostics.length;
  const { bodyStart, separatorFound } = splitHeaderEntries(lines, openIndex, closingIndex);
  if (!separatorFound) {
    missingSeparatorDiagnostic(lines, openIndex, closingIndex, first, options, diagnostics);
    return invalidBlockFor(source, first, last, startIndex, diagnostics, TIMING_PLUGIN_TYPE);
  }
  const toInput = (line: SourceLine): TimingInputLine => ({
    text: lineText(line),
    range: rangeFromLines(line, line),
  });
  const validated = validateTimingBlock({
    headerLines: lines.slice(openIndex + 1, bodyStart - 1).map(toInput),
    bodyLines: lines.slice(bodyStart, closingIndex).map(toInput),
    blockRange,
    ...(options.sourceName === undefined ? {} : { sourceName: options.sourceName }),
  });
  diagnostics.push(...validated.diagnostics);
  return validated.block ?? invalidBlockFor(source, first, last, startIndex, diagnostics, TIMING_PLUGIN_TYPE);
}


function parseModelsEnvelope(
  source: string,
  lines: readonly SourceLine[],
  openIndex: number,
  closingIndex: number,
  first: SourceLine,
  last: SourceLine,
  options: ParseOptions,
  diagnostics: Diagnostic[],
  pluginType: string,
  validate: (envelope: {
    readonly headerLines: readonly ModelsInputLine[];
    readonly bodyLines: readonly ModelsInputLine[];
    readonly blockRange: SourceRange;
    readonly sourceName?: string;
  }) => { readonly block?: ParsedBlock; readonly diagnostics: readonly Diagnostic[] },
): ParsedBlock {
  const blockRange = rangeFromLines(first, last);
  const startIndex = diagnostics.length;
  const { bodyStart, separatorFound } = splitHeaderEntries(lines, openIndex, closingIndex);
  if (!separatorFound) {
    missingSeparatorDiagnostic(lines, openIndex, closingIndex, first, options, diagnostics);
    return invalidBlockFor(source, first, last, startIndex, diagnostics, pluginType);
  }
  const toInput = (line: SourceLine): ModelsInputLine => ({
    text: lineText(line),
    range: rangeFromLines(line, line),
  });
  const validated = validate({
    headerLines: lines.slice(openIndex + 1, bodyStart - 1).map(toInput),
    bodyLines: lines.slice(bodyStart, closingIndex).map(toInput),
    blockRange,
    ...(options.sourceName === undefined ? {} : { sourceName: options.sourceName }),
  });
  diagnostics.push(...validated.diagnostics);
  return validated.block ?? invalidBlockFor(source, first, last, startIndex, diagnostics, pluginType);
}

function parseDiagramEnvelope(
  source: string,
  lines: readonly SourceLine[],
  openIndex: number,
  closingIndex: number,
  first: SourceLine,
  last: SourceLine,
  options: ParseOptions,
  diagnostics: Diagnostic[],
): ParsedBlock {
  const blockRange = rangeFromLines(first, last);
  const startIndex = diagnostics.length;
  const { bodyStart, separatorFound } = splitHeaderEntries(lines, openIndex, closingIndex);
  if (!separatorFound) {
    missingSeparatorDiagnostic(lines, openIndex, closingIndex, first, options, diagnostics);
    return invalidBlockFor(source, first, last, startIndex, diagnostics, DIAGRAM_PLUGIN_TYPE);
  }
  const toInput = (line: SourceLine): DiagramInputLine => ({
    text: lineText(line),
    range: rangeFromLines(line, line),
  });
  const validated = validateDiagramBlock({
    headerLines: lines.slice(openIndex + 1, bodyStart - 1).map(toInput),
    bodyLines: lines.slice(bodyStart, closingIndex).map(toInput),
    blockRange,
    ...(options.sourceName === undefined ? {} : { sourceName: options.sourceName }),
  });
  diagnostics.push(...validated.diagnostics);
  return validated.block ?? invalidBlockFor(source, first, last, startIndex, diagnostics, DIAGRAM_PLUGIN_TYPE);
}


function parseControlEnvelope(
  source: string,
  lines: readonly SourceLine[],
  openIndex: number,
  closingIndex: number,
  first: SourceLine,
  last: SourceLine,
  options: ParseOptions,
  diagnostics: Diagnostic[],
): ParsedBlock {
  const blockRange = rangeFromLines(first, last);
  const startIndex = diagnostics.length;
  const { bodyStart, separatorFound } = splitHeaderEntries(lines, openIndex, closingIndex);
  if (!separatorFound) {
    missingSeparatorDiagnostic(lines, openIndex, closingIndex, first, options, diagnostics);
    return invalidBlockFor(source, first, last, startIndex, diagnostics, CONTROL_PLUGIN_TYPE);
  }
  const toInput = (line: SourceLine): ControlInputLine => ({
    text: lineText(line),
    range: rangeFromLines(line, line),
  });
  const validated = validateControlBlock({
    headerLines: lines.slice(openIndex + 1, bodyStart - 1).map(toInput),
    bodyLines: lines.slice(bodyStart, closingIndex).map(toInput),
    blockRange,
    ...(options.sourceName === undefined ? {} : { sourceName: options.sourceName }),
  });
  diagnostics.push(...validated.diagnostics);
  return validated.block ?? invalidBlockFor(source, first, last, startIndex, diagnostics, CONTROL_PLUGIN_TYPE);
}

function parseFreeBodyEnvelope(
  source: string,
  lines: readonly SourceLine[],
  openIndex: number,
  closingIndex: number,
  first: SourceLine,
  last: SourceLine,
  options: ParseOptions,
  diagnostics: Diagnostic[],
): ParsedBlock {
  const blockRange = rangeFromLines(first, last);
  const startIndex = diagnostics.length;
  const { bodyStart, separatorFound } = splitHeaderEntries(lines, openIndex, closingIndex);
  if (!separatorFound) {
    missingSeparatorDiagnostic(lines, openIndex, closingIndex, first, options, diagnostics);
    return invalidBlockFor(source, first, last, startIndex, diagnostics, FREE_BODY_PLUGIN_TYPE);
  }
  const toInput = (line: SourceLine): FreeBodyInputLine => ({
    text: lineText(line),
    range: rangeFromLines(line, line),
  });
  const validated = validateFreeBodyBlock({
    headerLines: lines.slice(openIndex + 1, bodyStart - 1).map(toInput),
    bodyLines: lines.slice(bodyStart, closingIndex).map(toInput),
    blockRange,
    ...(options.sourceName === undefined ? {} : { sourceName: options.sourceName }),
  });
  diagnostics.push(...validated.diagnostics);
  return validated.block ?? invalidBlockFor(source, first, last, startIndex, diagnostics, FREE_BODY_PLUGIN_TYPE);
}

function parseChemistryEnvelope(
  source: string,
  lines: readonly SourceLine[],
  openIndex: number,
  closingIndex: number,
  first: SourceLine,
  last: SourceLine,
  options: ParseOptions,
  diagnostics: Diagnostic[],
  pluginType: string,
  validate: (options: {
    readonly headerLines: readonly ChemistryInputLine[];
    readonly bodyLines: readonly ChemistryInputLine[];
    readonly blockRange: SourceRange;
    readonly sourceName: string | undefined;
  }) => { readonly block?: ParsedBlock; readonly diagnostics: readonly Diagnostic[] },
): ParsedBlock {
  const blockRange = rangeFromLines(first, last);
  const startIndex = diagnostics.length;
  const finishInvalid = (): ParsedBlock =>
    invalidBlockFor(source, first, last, startIndex, diagnostics, pluginType);
  const { bodyStart, separatorFound } = splitHeaderEntries(lines, openIndex, closingIndex);
  if (!separatorFound) {
    missingSeparatorDiagnostic(lines, openIndex, closingIndex, first, options, diagnostics);
    return finishInvalid();
  }
  const toInput = (line: SourceLine): ChemistryInputLine => ({
    text: lineText(line),
    range: rangeFromLines(line, line),
  });
  const validated = validate({
    headerLines: lines.slice(openIndex + 1, bodyStart - 1).map(toInput),
    bodyLines: lines.slice(bodyStart, closingIndex).map(toInput),
    blockRange,
    sourceName: options.sourceName,
  });
  diagnostics.push(...validated.diagnostics);
  if (validated.block !== undefined) return validated.block;
  return finishInvalid();
}

/** Shared header handling for the composition-owned directive kinds. */
function compositionHeader(
  entries: readonly { readonly key: string; readonly value: string; readonly range: SourceRange }[],
  namespace: string,
  known: readonly string[],
  first: SourceLine,
  last: SourceLine,
  options: ParseOptions,
  diagnostics: Diagnostic[],
): ReturnType<typeof parseCompositionHeader> {
  return parseCompositionHeader(entries, options.sourceName, {
    namespace,
    known,
    parseCaption: (text, _range) =>
      parseInlineNodes(text, first, last, options, diagnostics),
  });
}

function parseFigureEnvelope(
  source: string,
  lines: readonly SourceLine[],
  openIndex: number,
  closingIndex: number,
  first: SourceLine,
  last: SourceLine,
  options: ParseOptions,
  diagnostics: Diagnostic[],
  activeTypes: readonly string[],
  allowRawLatex: boolean,
  depth: number,
): ParsedBlock {
  const blockRange = rangeFromLines(first, last);
  const startIndex = diagnostics.length;
  const finishInvalid = (): ParsedBlock =>
    invalidBlockFor(source, first, last, startIndex, diagnostics, FIGURE_PLUGIN_TYPE);
  const { entries, bodyStart, separatorFound } = splitHeaderEntries(lines, openIndex, closingIndex);
  if (!separatorFound) {
    missingSeparatorDiagnostic(lines, openIndex, closingIndex, first, options, diagnostics);
    return finishInvalid();
  }
  const header = compositionHeader(entries, "azeforge.figure", [], first, last, options, diagnostics);
  if (header.diagnostics.length > 0) {
    diagnostics.push(...header.diagnostics);
    return finishInvalid();
  }
  const bodyLines = lines
    .slice(bodyStart, closingIndex)
    .filter((line) => !/^[ \t]*$/.test(lineText(line as SourceLine))) as SourceLine[];
  if (bodyLines.length === 0) {
    diagnostics.push(
      diagnostic(
        "azeforge.figure#empty-body",
        "A figure Block body must contain at least one Block.",
        options,
        first,
        "error",
        blockRange,
        { suggestion: "Wrap the content the figure numbers." },
      ),
    );
    return finishInvalid();
  }
  const children = parseNestedBlocks(
    source,
    bodyLines,
    first,
    last,
    options,
    diagnostics,
    activeTypes,
    allowRawLatex,
    depth,
  );
  if (children === undefined) return finishInvalid();
  const block: FigureBlock = {
    kind: "figure",
    children,
    range: blockRange,
    ...(header.id === undefined || header.id === "" ? {} : { id: header.id }),
    ...(header.number === undefined ? {} : { number: header.number }),
    ...(header.caption === undefined ? {} : { caption: header.caption }),
    pluginVersion: FIGURE_PLUGIN_VERSION,
  };
  return block;
}

function parseBibliographyEnvelope(
  source: string,
  lines: readonly SourceLine[],
  openIndex: number,
  closingIndex: number,
  first: SourceLine,
  last: SourceLine,
  options: ParseOptions,
  diagnostics: Diagnostic[],
): ParsedBlock {
  const blockRange = rangeFromLines(first, last);
  const startIndex = diagnostics.length;
  const finishInvalid = (): ParsedBlock =>
    invalidBlockFor(source, first, last, startIndex, diagnostics, BIBLIOGRAPHY_PLUGIN_TYPE);
  const { entries, bodyStart, separatorFound } = splitHeaderEntries(lines, openIndex, closingIndex);
  if (!separatorFound) {
    missingSeparatorDiagnostic(lines, openIndex, closingIndex, first, options, diagnostics);
    return finishInvalid();
  }
  const header = parseBibliographyHeader(
    entries,
    blockRange,
    options.sourceName,
    (text, _range) => parseInlineNodes(text, first, last, options, diagnostics),
  );
  if (header.diagnostics.length > 0) {
    diagnostics.push(...header.diagnostics);
    return finishInvalid();
  }
  const parsed = parseBibliographyBody({
    bodyLines: lines.slice(bodyStart, closingIndex) as SourceLine[],
    blockRange,
    ...(options.sourceName === undefined ? {} : { sourceName: options.sourceName }),
  });
  diagnostics.push(...parsed.diagnostics);
  if (parsed.entries === undefined) return finishInvalid();
  const block: BibliographyBlock = {
    kind: "bibliography",
    entries: parsed.entries,
    range: blockRange,
    ...(header.id === undefined || header.id === "" ? {} : { id: header.id }),
    ...(header.number === undefined ? {} : { number: header.number }),
    ...(header.caption === undefined ? {} : { caption: header.caption }),
    pluginVersion: BIBLIOGRAPHY_PLUGIN_VERSION,
  };
  return block;
}

function parseAlgorithmEnvelope(
  source: string,
  lines: readonly SourceLine[],
  openIndex: number,
  closingIndex: number,
  first: SourceLine,
  last: SourceLine,
  options: ParseOptions,
  diagnostics: Diagnostic[],
): ParsedBlock {
  const blockRange = rangeFromLines(first, last);
  const startIndex = diagnostics.length;
  const finishInvalid = (): ParsedBlock =>
    invalidBlockFor(source, first, last, startIndex, diagnostics, ALGORITHM_PLUGIN_TYPE);
  const { entries, bodyStart, separatorFound } = splitHeaderEntries(lines, openIndex, closingIndex);
  if (!separatorFound) {
    missingSeparatorDiagnostic(lines, openIndex, closingIndex, first, options, diagnostics);
    return finishInvalid();
  }
  const header = parseAlgorithmHeader(
    entries,
    blockRange,
    options.sourceName,
    (text, _range) => parseInlineNodes(text, first, last, options, diagnostics),
  );
  if (header.diagnostics.length > 0) {
    diagnostics.push(...header.diagnostics);
    return finishInvalid();
  }
  const parsed = parseAlgorithmBody({
    bodyLines: lines.slice(bodyStart, closingIndex) as SourceLine[],
    blockRange,
    ...(options.sourceName === undefined ? {} : { sourceName: options.sourceName }),
    parseInline: (text, line) =>
      parseInlineNodes(text, line, line, options, diagnostics, inlineSourceWithRanges([line]).rangeFor),
  });
  diagnostics.push(...parsed.diagnostics);
  if (parsed.body === undefined) return finishInvalid();
  const block: AlgorithmBlock = {
    kind: "algorithm",
    procedure: parsed.body.procedure,
    parameters: parsed.body.parameters,
    steps: parsed.body.steps,
    range: blockRange,
    ...(header.id === undefined || header.id === "" ? {} : { id: header.id }),
    ...(header.number === undefined ? {} : { number: header.number }),
    ...(header.caption === undefined ? {} : { caption: header.caption }),
    pluginVersion: ALGORITHM_PLUGIN_VERSION,
  };
  return block;
}

function parseStatementEnvelope(
  source: string,
  lines: readonly SourceLine[],
  openIndex: number,
  closingIndex: number,
  first: SourceLine,
  last: SourceLine,
  options: ParseOptions,
  diagnostics: Diagnostic[],
  activeTypes: readonly string[],
  allowRawLatex: boolean,
  depth: number,
): ParsedBlock {
  const blockRange = rangeFromLines(first, last);
  const startIndex = diagnostics.length;
  const finishInvalid = (): ParsedBlock =>
    invalidBlockFor(source, first, last, startIndex, diagnostics, STATEMENT_PLUGIN_TYPE);
  const { entries, bodyStart, separatorFound } = splitHeaderEntries(lines, openIndex, closingIndex);
  if (!separatorFound) {
    missingSeparatorDiagnostic(lines, openIndex, closingIndex, first, options, diagnostics);
    return finishInvalid();
  }
  const header = parseStatementHeader(
    entries,
    blockRange,
    options.sourceName,
    (text, _range) => parseInlineNodes(text, first, last, options, diagnostics),
  );
  if (header.diagnostics.length > 0) {
    diagnostics.push(...header.diagnostics);
    return finishInvalid();
  }
  const parsed = parseStatementBody({
    header,
    bodyLines: lines.slice(bodyStart, closingIndex) as SourceLine[],
    blockRange,
    ...(options.sourceName === undefined ? {} : { sourceName: options.sourceName }),
    parseBlocks: (bodyLines) =>
      parseNestedBlocks(
        source,
        bodyLines,
        first,
        last,
        options,
        diagnostics,
        activeTypes,
        allowRawLatex,
        depth,
      ),
  });
  diagnostics.push(...parsed.diagnostics);
  if (parsed.body === undefined) return finishInvalid();
  const block: StatementBlock = {
    kind: "statement",
    statementKind: parsed.body.statementKind,
    text: parsed.body.text,
    ...(parsed.body.proof === undefined ? {} : { proof: parsed.body.proof }),
    range: blockRange,
    ...(header.id === undefined || header.id === "" ? {} : { id: header.id }),
    ...(header.number === undefined ? {} : { number: header.number }),
    ...(header.caption === undefined ? {} : { caption: header.caption }),
    pluginVersion: STATEMENT_PLUGIN_VERSION,
  };
  return block;
}

function parseExampleEnvelope(
  source: string,
  lines: readonly SourceLine[],
  openIndex: number,
  closingIndex: number,
  first: SourceLine,
  last: SourceLine,
  options: ParseOptions,
  diagnostics: Diagnostic[],
  activeTypes: readonly string[],
  allowRawLatex: boolean,
  depth: number,
): ParsedBlock {
  const blockRange = rangeFromLines(first, last);
  const startIndex = diagnostics.length;
  const finishInvalid = (): ParsedBlock =>
    invalidBlockFor(source, first, last, startIndex, diagnostics, EXAMPLE_PLUGIN_TYPE);
  const { entries, bodyStart, separatorFound } = splitHeaderEntries(lines, openIndex, closingIndex);
  if (!separatorFound) {
    missingSeparatorDiagnostic(lines, openIndex, closingIndex, first, options, diagnostics);
    return finishInvalid();
  }
  const header = parseExampleHeader(
    entries,
    blockRange,
    options.sourceName,
    (text, _range) => parseInlineNodes(text, first, last, options, diagnostics),
  );
  if (header.diagnostics.length > 0) {
    diagnostics.push(...header.diagnostics);
    return finishInvalid();
  }
  const parsed = parseExampleBody({
    header,
    bodyLines: lines.slice(bodyStart, closingIndex) as SourceLine[],
    blockRange,
    ...(options.sourceName === undefined ? {} : { sourceName: options.sourceName }),
    parseBlocks: (bodyLines) =>
      parseNestedBlocks(
        source,
        bodyLines,
        first,
        last,
        options,
        diagnostics,
        activeTypes,
        allowRawLatex,
        depth,
      ),
  });
  diagnostics.push(...parsed.diagnostics);
  if (parsed.body === undefined) return finishInvalid();
  const block: ExampleBlock = {
    kind: "example",
    problem: parsed.body.problem,
    givens: parsed.body.givens,
    steps: parsed.body.steps,
    ...(parsed.body.result === undefined ? {} : { result: parsed.body.result }),
    range: blockRange,
    ...(header.id === undefined || header.id === "" ? {} : { id: header.id }),
    ...(header.number === undefined ? {} : { number: header.number }),
    ...(header.caption === undefined ? {} : { caption: header.caption }),
    pluginVersion: EXAMPLE_PLUGIN_VERSION,
  };
  return block;
}

function parseBlocks(
  source: string,
  lines: readonly SourceLine[],
  bodyStart: number,
  options: ParseOptions,
  diagnostics: Diagnostic[],
  activeTypes: readonly string[],
  allowRawLatex: boolean,
  depth = 0,
  defaults: PlotDocumentDefaults = EMPTY_DOCUMENT_DEFAULTS,
  circuitConvention: unknown = undefined,
): readonly ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  let index = bodyStart;

  while (index < lines.length) {
    const line = lines[index];
    if (line === undefined || /^[ \t]*$/.test(lineText(line))) {
      index += 1;
      continue;
    }

    const candidateText = lineText(line);
    if (depth === 0 && NESTED_DIRECTIVE_OPEN.exec(candidateText) !== null) {
      const first = line;
      const diagnosticIndex = diagnostics.length;
      diagnostics.push(
        diagnostic(
          "azeforge.source#unexpected-nested-directive",
          "A nested `::` directive may only appear inside an enclosing directive Block.",
          options,
          first,
          "error",
          rangeFromLines(first, first),
        ),
      );
      blocks.push({
        kind: "invalid",
        raw: lineText(first),
        range: rangeFromLines(first, first),
        diagnosticIndexes: [diagnosticIndex],
      });
      index += 1;
      continue;
    }
    const directiveOpen = depth === 0
      ? OUTER_DIRECTIVE_OPEN.exec(candidateText)
      : NESTED_DIRECTIVE_OPEN.exec(candidateText);
    const directiveClose = depth === 0
      ? OUTER_DIRECTIVE_CLOSE
      : NESTED_DIRECTIVE_CLOSE;
    if (directiveOpen !== null) {
      const first = line;
      const openIndex = index;
      const rawType = directiveOpen[1] === undefined ? undefined : directiveOpen[1].trim();
      const originalType =
        rawType === undefined || rawType === "" || /^[ \t]*$/.test(rawType)
          ? undefined
          : rawType;
      let closingIndex = -1;
      {
        let scanDepth = 1;
        for (let scan = openIndex + 1; scan < lines.length; scan += 1) {
          const candidate = lineText(lines[scan] as SourceLine);
          if (directiveClose.test(candidate)) {
            scanDepth -= 1;
            if (scanDepth === 0) {
              closingIndex = scan;
              break;
            }
          } else if (
            depth === 0
              ? OUTER_DIRECTIVE_OPEN.exec(candidate) !== null
              : NESTED_DIRECTIVE_OPEN.exec(candidate) !== null
          ) {
            scanDepth += 1;
          }
        }
      }
      const closed = closingIndex >= 0;
      let unambiguousEnd = false;
      if (closed) {
        index = closingIndex + 1;
      } else {
        const recoveryIndex = lines.findIndex(
          (candidate, candidateIndex) =>
            candidateIndex > index && /^[ \t]*$/.test(lineText(candidate)),
        );
        unambiguousEnd =
          recoveryIndex < 0 ||
          lines
            .slice(recoveryIndex)
            .every((candidate) => /^[ \t]*$/.test(lineText(candidate)));
        index = recoveryIndex < 0 ? lines.length : recoveryIndex;
      }
      const last = closed
        ? (lines[closingIndex] ?? first)
        : (lines[index - 1] ?? first);
      if (
        closed &&
        originalType === EQUATION_PLUGIN_TYPE &&
        activeTypes.includes(EQUATION_PLUGIN_TYPE)
      ) {
        blocks.push(
          parseEquationEnvelope(
            source,
            lines,
            openIndex,
            closingIndex,
            first,
            last,
            options,
            allowRawLatex,
            diagnostics,
          ),
        );
        continue;
      }
      if (
        closed &&
        originalType === MERMAID_PLUGIN_TYPE &&
        activeTypes.includes(MERMAID_PLUGIN_TYPE)
      ) {
        blocks.push(
          parseMermaidEnvelope(
            source,
            lines,
            openIndex,
            closingIndex,
            first,
            last,
            options,
            diagnostics,
          ),
        );
        continue;
      }
      if (
        closed &&
        originalType === TEX_PLUGIN_TYPE &&
        activeTypes.includes(TEX_PLUGIN_TYPE)
      ) {
        blocks.push(parseTexEnvelope(source, lines, openIndex, closingIndex, first, last, options, diagnostics));
        continue;
      }

      if (
        closed &&
        originalType === CALLOUT_PLUGIN_TYPE &&
        activeTypes.includes(CALLOUT_PLUGIN_TYPE)
      ) {
        blocks.push(
          parseCalloutEnvelope(
            source,
            lines,
            openIndex,
            closingIndex,
            first,
            last,
            options,
            diagnostics,
            activeTypes,
            allowRawLatex,
            depth,
          ),
        );
        continue;
      }
      if (
        closed &&
        originalType === DERIVATION_PLUGIN_TYPE &&
        activeTypes.includes(DERIVATION_PLUGIN_TYPE)
      ) {
        blocks.push(
          parseDerivationEnvelope(
            source,
            lines,
            openIndex,
            closingIndex,
            first,
            last,
            options,
            diagnostics,
          ),
        );
        continue;
      }
      if (
        closed &&
        originalType === FIGURE_PLUGIN_TYPE &&
        activeTypes.includes(FIGURE_PLUGIN_TYPE)
      ) {
        blocks.push(
          parseFigureEnvelope(
            source,
            lines,
            openIndex,
            closingIndex,
            first,
            last,
            options,
            diagnostics,
            activeTypes,
            allowRawLatex,
            depth,
          ),
        );
        continue;
      }
      if (
        closed &&
        originalType === BIBLIOGRAPHY_PLUGIN_TYPE &&
        activeTypes.includes(BIBLIOGRAPHY_PLUGIN_TYPE)
      ) {
        blocks.push(
          parseBibliographyEnvelope(
            source,
            lines,
            openIndex,
            closingIndex,
            first,
            last,
            options,
            diagnostics,
          ),
        );
        continue;
      }
      if (
        closed &&
        originalType === ALGORITHM_PLUGIN_TYPE &&
        activeTypes.includes(ALGORITHM_PLUGIN_TYPE)
      ) {
        blocks.push(
          parseAlgorithmEnvelope(
            source,
            lines,
            openIndex,
            closingIndex,
            first,
            last,
            options,
            diagnostics,
          ),
        );
        continue;
      }
      if (
        closed &&
        originalType === STATEMENT_PLUGIN_TYPE &&
        activeTypes.includes(STATEMENT_PLUGIN_TYPE)
      ) {
        blocks.push(
          parseStatementEnvelope(
            source,
            lines,
            openIndex,
            closingIndex,
            first,
            last,
            options,
            diagnostics,
            activeTypes,
            allowRawLatex,
            depth,
          ),
        );
        continue;
      }
      if (
        closed &&
        originalType === EXAMPLE_PLUGIN_TYPE &&
        activeTypes.includes(EXAMPLE_PLUGIN_TYPE)
      ) {
        blocks.push(
          parseExampleEnvelope(
            source,
            lines,
            openIndex,
            closingIndex,
            first,
            last,
            options,
            diagnostics,
            activeTypes,
            allowRawLatex,
            depth,
          ),
        );
        continue;
      }
      if (
        closed &&
        originalType === TABLE_PLUGIN_TYPE &&
        activeTypes.includes(TABLE_PLUGIN_TYPE)
      ) {
        blocks.push(
          parseTableEnvelope(
            source,
            lines,
            openIndex,
            closingIndex,
            first,
            last,
            options,
            diagnostics,
          ),
        );
        continue;
      }
      if (
        closed &&
        originalType === PLOT_PLUGIN_TYPE &&
        activeTypes.includes(PLOT_PLUGIN_TYPE)
      ) {
        blocks.push(
          parsePlotFamilyEnvelope(
            source,
            lines,
            openIndex,
            closingIndex,
            first,
            last,
            options,
            diagnostics,
            PLOT_PLUGIN_TYPE,
            defaults.plot,
            validatePlotBlock,
          ),
        );
        continue;
      }
      if (
        closed &&
        originalType === CHART_PLUGIN_TYPE &&
        activeTypes.includes(CHART_PLUGIN_TYPE)
      ) {
        blocks.push(
          parsePlotFamilyEnvelope(
            source,
            lines,
            openIndex,
            closingIndex,
            first,
            last,
            options,
            diagnostics,
            CHART_PLUGIN_TYPE,
            defaults.chart,
            validateChartBlock,
          ),
        );
        continue;
      }
      if (closed && originalType === TIMING_PLUGIN_TYPE && activeTypes.includes(TIMING_PLUGIN_TYPE)) {
        blocks.push(parseTimingEnvelope(source, lines, openIndex, closingIndex, first, last, options, diagnostics));
        continue;
      }
      const modelsDirective =
        originalType === SEQUENCE_PLUGIN_TYPE
          ? { type: SEQUENCE_PLUGIN_TYPE, validate: validateSequenceBlock }
          : originalType === STATE_PLUGIN_TYPE
            ? { type: STATE_PLUGIN_TYPE, validate: validateStateBlock }
            : originalType === ENTITY_PLUGIN_TYPE
              ? { type: ENTITY_PLUGIN_TYPE, validate: validateEntityBlock }
              : originalType === CLASS_PLUGIN_TYPE
                ? { type: CLASS_PLUGIN_TYPE, validate: validateClassBlock }
                : undefined;
      if (closed && modelsDirective !== undefined && activeTypes.includes(modelsDirective.type)) {
        blocks.push(
          parseModelsEnvelope(
            source,
            lines,
            openIndex,
            closingIndex,
            first,
            last,
            options,
            diagnostics,
            modelsDirective.type,
            modelsDirective.validate,
          ),
        );
        continue;
      }
      if (closed && originalType === DIAGRAM_PLUGIN_TYPE && activeTypes.includes(DIAGRAM_PLUGIN_TYPE)) {
        blocks.push(parseDiagramEnvelope(source, lines, openIndex, closingIndex, first, last, options, diagnostics));
        continue;
      }
      if (closed && originalType === CONTROL_PLUGIN_TYPE && activeTypes.includes(CONTROL_PLUGIN_TYPE)) {
        blocks.push(parseControlEnvelope(source, lines, openIndex, closingIndex, first, last, options, diagnostics));
        continue;
      }
      if (closed && originalType === FREE_BODY_PLUGIN_TYPE && activeTypes.includes(FREE_BODY_PLUGIN_TYPE)) {
        blocks.push(parseFreeBodyEnvelope(source, lines, openIndex, closingIndex, first, last, options, diagnostics));
        continue;
      }
      if (
        closed &&
        originalType === CIRCUIT_PLUGIN_TYPE &&
        activeTypes.includes(CIRCUIT_PLUGIN_TYPE)
      ) {
        blocks.push(
          parseCircuitEnvelope(
            source, lines, openIndex, closingIndex, first, last, options,
            diagnostics, circuitConvention,
          ),
        );
        continue;
      }
      if (
        closed &&
        originalType === GEOMETRY_PLUGIN_TYPE &&
        activeTypes.includes(GEOMETRY_PLUGIN_TYPE)
      ) {
        blocks.push(
          parseGeometryEnvelope(
            source,
            lines,
            openIndex,
            closingIndex,
            first,
            last,
            options,
            diagnostics,
          ),
        );
        continue;
      }
      if (
        closed &&
        originalType === FORMULA_PLUGIN_TYPE &&
        activeTypes.includes(FORMULA_PLUGIN_TYPE)
      ) {
        blocks.push(
          parseChemistryEnvelope(
            source,
            lines,
            openIndex,
            closingIndex,
            first,
            last,
            options,
            diagnostics,
            FORMULA_PLUGIN_TYPE,
            validateFormulaBlock,
          ),
        );
        continue;
      }
      if (
        closed &&
        originalType === REACTION_PLUGIN_TYPE &&
        activeTypes.includes(REACTION_PLUGIN_TYPE)
      ) {
        blocks.push(
          parseChemistryEnvelope(
            source,
            lines,
            openIndex,
            closingIndex,
            first,
            last,
            options,
            diagnostics,
            REACTION_PLUGIN_TYPE,
            validateReactionBlock,
          ),
        );
        continue;
      }
      if (
        closed &&
        originalType === STRUCTURE_PLUGIN_TYPE &&
        activeTypes.includes(STRUCTURE_PLUGIN_TYPE)
      ) {
        blocks.push(
          parseChemistryEnvelope(
            source,
            lines,
            openIndex,
            closingIndex,
            first,
            last,
            options,
            diagnostics,
            STRUCTURE_PLUGIN_TYPE,
            validateStructureBlock,
          ),
        );
        continue;
      }
      const diagnosticIndex = diagnostics.length;
      const closingDelimiter = depth === 0 ? "::::" : "::";
      const typeStartIndex =
        originalType === undefined
          ? lineTextStartIndex(first)
          : lineTextStartIndex(first) + lineText(first).indexOf(originalType);
      const insertionLine = lines.at(-1) ?? last;
      const insertionRange = rangeFromLineSlice(
        insertionLine,
        insertionLine.text.length,
        insertionLine.text.length,
      );
      const newline = source.includes("\r\n") ? "\r\n" : "\n";
      diagnostics.push(
        diagnostic(
          closed
            ? originalType === undefined
              ? "azeforge.source#missing-directive-type"
              : "azeforge.source#unknown-directive"
            : "azeforge.source#unclosed-directive",
          closed
            ? originalType === undefined
              ? "A directive Block must name a type."
              : `Directive Block type "${originalType}" is not available.`
            : `A directive Block must end with a closing \`${closingDelimiter}\` delimiter.`,
          options,
          first,
          "error",
          originalType === undefined
            ? rangeFromLines(first, first)
            : rangeFromLineSlice(
                first,
                typeStartIndex,
                typeStartIndex + originalType.length,
              ),
          {
            data:
              !closed || originalType === undefined
                ? {}
                : { type: originalType, availableTypes: [...activeTypes] },
            ...(closed && originalType !== undefined
              ? (() => {
                  const candidates = unknownDirectiveCandidates(
                    originalType,
                    activeTypes,
                  );
                  const lowered = originalType.toLowerCase();
                  const caseMatch =
                    lowered !== originalType &&
                    activeTypes.includes(lowered)
                      ? lowered
                      : undefined;
                  const suggestion =
                    caseMatch !== undefined
                      ? `Did you mean "${caseMatch}"?`
                      : candidates.length > 0
                        ? `Did you mean ${candidates
                            .slice(0, 3)
                            .map((candidate) => `"${candidate}"`)
                            .join(", ")}?`
                        : activeTypes.length > 0
                          ? `Available directive types: ${activeTypes
                              .slice(0, 5)
                              .join(", ")}.`
                          : "No directive types are available.";
                  return {
                    suggestion,
                    ...(caseMatch === undefined
                      ? {}
                      : {
                          fix: {
                            title: `Use directive type "${caseMatch}".`,
                            applicability: "safe" as const,
                            edits: [
                              {
                                range: rangeFromLineSlice(
                                  first,
                                  typeStartIndex,
                                  typeStartIndex + originalType.length,
                                ),
                                expectedText: originalType,
                                replacementText: caseMatch,
                              },
                            ],
                          },
                        }),
                  };
                })()
              : {}),
            ...(!closed
              ? {
                  suggestion:
                    `Add a closing \`${closingDelimiter}\` delimiter before the next Block.`,
                  ...(unambiguousEnd
                    ? {
                        fix: {
                          title: "Add the closing directive delimiter.",
                          applicability: "safe" as const,
                          edits: [
                            {
                              range: insertionRange,
                              expectedText: "",
                              replacementText:
                                source.endsWith("\n") || source.endsWith("\r")
                                  ? `${closingDelimiter}${newline}`
                                  : `${newline}${closingDelimiter}`,
                            },
                          ],
                        },
                      }
                    : {}),
                }
              : {}),
          },
        ),
      );
      blocks.push({
        kind: "invalid",
        raw: source.slice(first.startIndex, last.endIndex),
        range: rangeFromLines(first, last),
        diagnosticIndexes: [diagnosticIndex],
        ...(originalType === undefined ? {} : { originalType }),
      });
      continue;
    }


    const fenced = parseFencedCode(source, lines, index, options, diagnostics);
    if (fenced !== undefined) {
      blocks.push(fenced.block);
      index = fenced.next;
      continue;
    }
    if (isThematicBreakText(lineText(line))) {
      blocks.push({ kind: "thematicBreak", range: rangeFromLines(line, line) });
      index += 1;
      continue;
    }
    const quoted = parseBlockquote(source, lines, index, options, diagnostics, activeTypes, allowRawLatex, depth);
    if (quoted !== undefined) {
      blocks.push(quoted.block);
      index = quoted.next;
      continue;
    }
    const listed = parseList(source, lines, index, options, diagnostics, activeTypes, allowRawLatex, depth);
    if (listed !== undefined) {
      blocks.push(listed.block);
      index = listed.next;
      continue;
    }
    const footnote = parseFootnoteDefinition(source, lines, index, options, diagnostics);
    if (footnote !== undefined) {
      blocks.push(footnote.block);
      index = footnote.next;
      continue;
    }
    const gfmTable = tryGfmTableAt(lines, index);
    if (gfmTable !== undefined) {
      const tableLines = lines.slice(index, index + gfmTable.consumed);
      const tableRawHtml = findRawHtml(tableLines as SourceLine[]);
      if (tableRawHtml !== undefined) {
        blocks.push(
          rawHtmlInvalidBlock(
            source,
            tableLines as SourceLine[],
            tableRawHtml,
            options,
            diagnostics,
          ),
        );
        index += gfmTable.consumed;
        continue;
      }
      const tableLast = lines[index + gfmTable.consumed - 1] ?? line;
      const startIndex = diagnostics.length;
      const safetyTexts: string[] = [];
      for (let rowOffset = 0; rowOffset < gfmTable.consumed; rowOffset += 1) {
        if (rowOffset === 1) continue;
        const cells = splitTableRow(lineText(lines[index + rowOffset] as SourceLine));
        if (cells !== undefined) safetyTexts.push(...cells);
      }
      if (!ensureInlineTargetsSafe(safetyTexts, line, tableLast, options, diagnostics)) {
        blocks.push(invalidBlockFor(source, line, tableLast, startIndex, diagnostics));
        index += gfmTable.consumed;
        continue;
      }
      blocks.push({
        kind: "table",
        data: migrateGfmTable(gfmTable.data),
        range: rangeFromLines(line, tableLast),
        pluginVersion: TABLE_PLUGIN_VERSION,
      });
      index += gfmTable.consumed;
      continue;
    }
    const headingRawHtml = findRawHtml([line]);
    if (headingRawHtml !== undefined) {
      blocks.push(
        rawHtmlInvalidBlock(
          source,
          [line],
          headingRawHtml,
          options,
          diagnostics,
        ),
      );
      index += 1;
      continue;
    }
    const atxHeading = parseAtxHeading(lineText(line));
    if (atxHeading !== undefined) {
      const startIndex = diagnostics.length;
      const children = parseInlineNodes(
        atxHeading.text,
        line,
        line,
        options,
        diagnostics,
        inlineSourceWithRanges([line]).rangeFor,
      );
      if (children === undefined) {
        blocks.push(invalidBlockFor(source, line, line, startIndex, diagnostics));
        index += 1;
        continue;
      }
      blocks.push({
        kind: "heading",
        level: atxHeading.level,
        children,
        range: rangeFromLines(line, line),
      });
      index += 1;
      continue;
    }

    const paragraphLines: SourceLine[] = [line];
    index += 1;
    let setextLevel: 1 | 2 | undefined;
    let setextUnderline: SourceLine | undefined;
    while (index < lines.length) {
      const next = lines[index];
      if (next === undefined || /^[ \t]*$/.test(lineText(next))) break;
      const setext = /^ {0,3}(=+|-+)[ \t]*$/.exec(lineText(next));
      if (setext !== null) {
        setextLevel = setext[1]?.startsWith("=") === true ? 1 : 2;
        setextUnderline = next;
        index += 1;
        break;
      }
      const nextText = lineText(next);
      const after = lines[index + 1];
      const nextIsDirective =
        depth === 0
          ? OUTER_DIRECTIVE_OPEN.exec(nextText) !== null
          : NESTED_DIRECTIVE_OPEN.exec(nextText) !== null;
      if (
        parseAtxHeading(nextText) !== undefined ||
        nextIsDirective ||
        fenceOpen(nextText) !== undefined ||
        isThematicBreakText(nextText) ||
        stripQuotePrefix(nextText) !== undefined ||
        (parseListMarker(nextText) !== undefined && (parseListMarker(nextText)?.lead ?? 4) <= 3) ||
        (after !== undefined && isGfmTableStart(nextText, lineText(after)))
      ) {
        break;
      }
      paragraphLines.push(next);
      index += 1;
    }
    const paragraphRawHtml = findRawHtml(paragraphLines);
    if (paragraphRawHtml !== undefined) {
      blocks.push(
        rawHtmlInvalidBlock(
          source,
          paragraphLines,
          paragraphRawHtml,
          options,
          diagnostics,
        ),
      );
      continue;
    }
    const inlineSource = inlineSourceWithRanges(paragraphLines);
    const text = inlineSource.text;
    const inlineStart = diagnostics.length;
    if (setextLevel !== undefined && setextUnderline !== undefined) {
      const headingChildren = parseInlineNodes(
        text,
        line,
        setextUnderline,
        options,
        diagnostics,
        inlineSource.rangeFor,
      );
      if (headingChildren === undefined) {
        blocks.push(invalidBlockFor(source, line, setextUnderline, inlineStart, diagnostics));
        continue;
      }
      blocks.push({
        kind: "heading",
        level: setextLevel,
        children: headingChildren,
        range: rangeFromLines(line, setextUnderline),
      });
      continue;
    }
    const last = paragraphLines.at(-1) ?? line;
    const children = parseInlineNodes(text, line, last, options, diagnostics);
    if (children === undefined) {
      blocks.push(invalidBlockFor(source, line, last, inlineStart, diagnostics));
      continue;
    }
    blocks.push({
      kind: "paragraph",
      children,
      range: rangeFromLines(line, last),
    });
  }

  return blocks;
}
function directiveIdOccurrences(
  lines: readonly SourceLine[],
  bodyStart: number,
  options: ParseOptions,
): readonly BlockIdOccurrence[] {
  const occurrences: BlockIdOccurrence[] = [];

  for (let index = bodyStart; index < lines.length; index += 1) {
    const opening = lines[index];
    if (opening === undefined) continue;
    if (
      OUTER_DIRECTIVE_OPEN.exec(lineText(opening)) === null &&
      NESTED_DIRECTIVE_OPEN.exec(lineText(opening)) === null
    ) {
      continue;
    }
    let closed = false;
    for (let headerIndex = index + 1; headerIndex < lines.length; headerIndex += 1) {
      const header = lines[headerIndex];
      if (header === undefined) break;
      const headerText = lineText(header);
      if (OUTER_DIRECTIVE_CLOSE.test(headerText) || NESTED_DIRECTIVE_CLOSE.test(headerText)) {
        closed = true;
        break;
      }
      if (HEADER_SEPARATOR.test(headerText)) break;
      if (BLANK.test(headerText) || STRUCTURAL_COMMENT.test(headerText)) continue;
      if (!HEADER_ENTRY.test(headerText)) break;
      const idMatch = /^[ \t]*id[ \t]*:[ \t]*(.*?)[ \t]*$/.exec(headerText);
      const id = idMatch?.[1];
      if (id === undefined) {
        if (/^[ \t]*id[ \t]*:/.test(headerText) && idMatch === null) {
          // An `id:` entry with no value still terminates header scanning;
          // its empty value is diagnosed by the owning plugin.
          break;
        }
        continue;
      }
      const startIndex = header.text.indexOf(id, header.text.indexOf(":") + 1);
      occurrences.push({
        id,
        range: rangeFromLineSlice(
          header,
          startIndex,
          startIndex + id.length,
        ),
        ...(options.sourceName === undefined
          ? {}
          : { source: options.sourceName }),
      });
      break;
    }
    if (!closed) {
      // Skip past an unclosed directive region so later occurrences are
      // still discovered; the block parser reports the unclosed error.
      const recoveryIndex = lines.findIndex(
        (candidate, candidateIndex) =>
          candidateIndex > index && BLANK.test(lineText(candidate)),
      );
      if (recoveryIndex >= 0) index = recoveryIndex - 1;
    }
  }
  return occurrences;
}

function requiredVersionDiagnostic(
  source: string,
  lines: readonly SourceLine[],
  bodyStart: number,
  versionDeclared: boolean,
  options: ParseOptions,
): Diagnostic | undefined {
  const containsDirective = lines
    .slice(bodyStart)
    .some(
      (line) =>
        OUTER_DIRECTIVE_OPEN.exec(lineText(line)) !== null ||
        NESTED_DIRECTIVE_OPEN.exec(lineText(line)) !== null,
    );
  if (!containsDirective) return undefined;

  if (versionDeclared) return undefined;

  const first = lines[0];
  if (first === undefined) return undefined;
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const insertionLine = bodyStart === 0 ? first : (lines[1] ?? first);
  const insertionIndex =
    bodyStart === 0 && insertionLine.text.startsWith("\uFEFF") ? 1 : 0;
  const insertionRange = rangeFromLineSlice(
    insertionLine,
    insertionIndex,
    insertionIndex,
  );
  return diagnostic(
    "azeforge.source#version-required",
    "Source with directive Blocks must declare AzeMark version 2.",
    options,
    insertionLine,
    "error",
    insertionRange,
    {
      fix: {
        title: "Declare AzeMark version 2.",
        applicability: "safe",
        edits: [
          {
            range: insertionRange,
            expectedText: "",
            replacementText:
              bodyStart === 0
                ? `---${newline}azemark: 2${newline}---${newline}${newline}`
                : `azemark: 2${newline}`,
          },
        ],
      },
    },
  );
}

export function parseSource(source: string, options: ParseOptions = {}): ParseResult {
  const lines = sourceLines(source);
  const frontMatter = parseFrontMatter(lines, options);
  const diagnostics = [...frontMatter.diagnostics];
  const versionDiagnostic = requiredVersionDiagnostic(
    source,
    lines,
    frontMatter.bodyStart,
    frontMatter.versionDeclared,
    options,
  );
  if (versionDiagnostic !== undefined) diagnostics.push(versionDiagnostic);
  const activePlugins = options.plugins ?? [
    figurePlugin,
    bibliographyPlugin,
    algorithmPlugin,
    statementPlugin,
    examplePlugin,
    equationPlugin,
    derivationPlugin,
    calloutPlugin,
    mermaidPlugin,
    tablePlugin,
    plotPlugin,
    chartPlugin,
    geometryPlugin,
    formulaPlugin,
    reactionPlugin,
    circuitPlugin,
    timingPlugin,
    diagramPlugin,
    sequencePlugin,
    statePlugin,
    entityPlugin,
    classPlugin,
    structurePlugin,
    controlPlugin,
    freeBodyPlugin,
    texPlugin,
  ];
  const activeTypes = [...new Set(activePlugins.map((plugin) => plugin.descriptor.type))].sort();
  const blocks = parseBlocks(
    source,
    lines,
    frontMatter.bodyStart,
    options,
    diagnostics,
    activeTypes,
    options.allowRawLatex ?? false,
    0,
    frontMatter.defaults,
    frontMatter.metadata.extensions["x-circuit-symbol-convention"],
  );
  diagnostics.push(
    ...validateBlockIds(
      directiveIdOccurrences(lines, frontMatter.bodyStart, options),
    ),
  );
  return {
    document: {
      azemarkVersion: 2,
      schemaVersion: 3,
      metadata: frontMatter.metadata,
      blocks,
    },
    diagnostics,
  };
}
