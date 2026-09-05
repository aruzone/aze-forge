import { isAlias, isScalar, parseDocument, visit } from "yaml";

import { createDiagnostic } from "./diagnostics.js";
import type {
  ArtifactFormat,
  Diagnostic,
  DiagnosticFix,
  DiagnosticLocation,
  DiagnosticSeverity,
  DocumentMetadata,
  JsonValue,
  ParseOptions,
  RelatedLocation,
  ParseResult,
  ParsedBlock,
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
const KNOWN_METADATA_KEYS: Readonly<Record<string, true>> = {
  azemark: true,
  author: true,
  title: true,
  theme: true,
  outputs: true,
};
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
    };
  }

  const record = value as Record<string, unknown>;
  const metadata: {
    authors: readonly string[];
    extensions: Record<string, JsonValue>;
    title?: string;
    theme?: string;
    outputs?: readonly ArtifactFormat[];
  } = { authors: [], extensions: {} };
  const metadataLine = lines[1] ?? firstLine;

  if (record.azemark !== undefined && record.azemark !== 1) {
    diagnostics.push(
      diagnostic(
        "azeforge.source#version-unsupported",
        'Front matter "azemark" must be the integer 1.',
        options,
        metadataLine,
      ),
    );
  }
  if (record.author !== undefined) {
    metadata.authors = parseAuthors(record.author, options, metadataLine, diagnostics);
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

  return {
    metadata,
    diagnostics,
    bodyStart: closingIndex + 1,
    versionDeclared: Object.prototype.hasOwnProperty.call(record, "azemark"),
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

function normalizedSoftWrappedText(lines: readonly SourceLine[]): string {
  return lines
    .map((line) => lineText(line).replace(/^[ \t]+|[ \t]+$/g, ""))
    .join(" ");
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

function parseBlocks(
  source: string,
  lines: readonly SourceLine[],
  bodyStart: number,
  options: ParseOptions,
  diagnostics: Diagnostic[],
): readonly ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  let index = bodyStart;

  while (index < lines.length) {
    const line = lines[index];
    if (line === undefined || /^[ \t]*$/.test(lineText(line))) {
      index += 1;
      continue;
    }

    const directive = /^ {0,3}:{4,}[ \t]*([^ \t:]*)/.exec(lineText(line));
    if (directive !== null) {
      const first = line;
      const originalType = directive[1] === "" ? undefined : directive[1];
      const closingIndex = lines.findIndex(
        (candidate, candidateIndex) =>
          candidateIndex >= index &&
          /^ {0,3}:{4,}[ \t]*$/.test(lineText(candidate)),
      );
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
      const diagnosticIndex = diagnostics.length;
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
            : "A directive Block must end with a closing `::::` delimiter.",
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
                : { type: originalType, availableTypes: [] },
            ...(!closed
              ? {
                  suggestion:
                    "Add a closing `::::` delimiter before the next Block.",
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
                                  ? `::::${newline}`
                                  : `${newline}::::`,
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
      blocks.push({
        kind: "heading",
        level: atxHeading.level,
        children: [{ kind: "text", value: atxHeading.text }],
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
      if (
        parseAtxHeading(lineText(next)) !== undefined ||
        /^ {0,3}:{4,}/.test(lineText(next))
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
    const text = normalizedSoftWrappedText(paragraphLines);
    if (setextLevel !== undefined && setextUnderline !== undefined) {
      blocks.push({
        kind: "heading",
        level: setextLevel,
        children: [{ kind: "text", value: text }],
        range: rangeFromLines(line, setextUnderline),
      });
      continue;
    }
    const last = paragraphLines.at(-1) ?? line;
    blocks.push({
      kind: "paragraph",

      children: [{ kind: "text", value: text }],
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
    if (
      opening === undefined ||
      !/^ {0,3}:{4,}[ \t]*[^ \t:]+/.test(lineText(opening))
    ) {
      continue;
    }
    for (let headerIndex = index + 1; headerIndex < lines.length; headerIndex += 1) {
      const header = lines[headerIndex];
      if (
        header === undefined ||
        /^[ \t]*$/.test(header.text) ||
        /^ {0,3}:{4,}[ \t]*$/.test(lineText(header))
      ) {
        break;
      }
      const idMatch = /^[ \t]*id[ \t]*:[ \t]*(.*?)[ \t]*$/.exec(header.text);
      const id = idMatch?.[1];
      if (id === undefined) continue;
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
    .some((line) => /^ {0,3}:{4,}/.test(lineText(line)));
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
    "Source with directive Blocks must declare AzeMark version 1.",
    options,
    insertionLine,
    "error",
    insertionRange,
    {
      fix: {
        title: "Declare AzeMark version 1.",
        applicability: "safe",
        edits: [
          {
            range: insertionRange,
            expectedText: "",
            replacementText:
              bodyStart === 0
                ? `---${newline}azemark: 1${newline}---${newline}${newline}`
                : `azemark: 1${newline}`,
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
  const blocks = parseBlocks(
    source,
    lines,
    frontMatter.bodyStart,
    options,
    diagnostics,
  );
  diagnostics.push(
    ...validateBlockIds(
      directiveIdOccurrences(lines, frontMatter.bodyStart, options),
    ),
  );
  return {
    document: {
      azemarkVersion: 1,
      schemaVersion: 1,
      metadata: frontMatter.metadata,
      blocks,
    },
    diagnostics,
  };
}
