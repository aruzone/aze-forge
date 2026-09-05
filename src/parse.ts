import { isAlias, isScalar, parseDocument, visit } from "yaml";

import type {
  ArtifactFormat,
  Diagnostic,
  DiagnosticSeverity,
  DocumentMetadata,
  JsonValue,
  ParseOptions,
  ParseResult,
  ParsedBlock,
} from "./model.js";
import { rangeFromLines, sourceLines, type SourceLine } from "./source-map.js";

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
}

function diagnostic(
  code: string,
  message: string,
  options: ParseOptions,
  line?: SourceLine,
  severity: DiagnosticSeverity = "error",
): Diagnostic {
  return {
    code,
    severity,
    message,
    ...(options.sourceName === undefined ? {} : { source: options.sourceName }),
    ...(line === undefined ? {} : { range: rangeFromLines(line, line) }),
  };
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
      "AZE_FRONT_MATTER_AUTHOR",
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
        "AZE_FRONT_MATTER_OUTPUTS",
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
        "AZE_FRONT_MATTER_OUTPUTS",
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
    return { metadata: emptyMetadata(), diagnostics: [], bodyStart: 0 };
  }
  const openingText = firstLine.text.startsWith("\uFEFF")
    ? firstLine.text.slice(1)
    : firstLine.text;
  if (openingText !== "---") {
    return { metadata: emptyMetadata(), diagnostics: [], bodyStart: 0 };
  }

  const closingIndex = lines.findIndex((line, index) => index > 0 && line.text === "---");
  if (closingIndex < 0) {
    return {
      metadata: emptyMetadata(),
      diagnostics: [
        diagnostic(
          "AZE_FRONT_MATTER_UNCLOSED",
          "Front matter must end with a --- delimiter.",
          options,
          firstLine,
        ),
      ],
      bodyStart: lines.length,
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
  const diagnostics: Diagnostic[] = parsed.errors.map((error) =>
    diagnostic(
      "AZE_FRONT_MATTER_YAML",
      `Invalid front matter: ${error.message}`,
      options,
      lines[1],
    ),
  );
  visit(parsed, {
    Alias() {
      diagnostics.push(
        diagnostic(
          "AZE_FRONT_MATTER_ALIAS",
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
            "AZE_FRONT_MATTER_MERGE_KEY",
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
            "AZE_FRONT_MATTER_ANCHOR",
            "Front matter anchors are not supported.",
            options,
            lines[1],
          ),
        );
      }
      if (node.tag !== undefined) {
        diagnostics.push(
          diagnostic(
            "AZE_FRONT_MATTER_TAG",
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
  } catch (error) {
    diagnostics.push(
      diagnostic(
        "AZE_FRONT_MATTER_YAML",
        `Invalid front matter: ${error instanceof Error ? error.message : "unsupported YAML value"}`,
        options,
        lines[1],
      ),
    );
  }

  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    diagnostics.push(
      diagnostic(
        "AZE_FRONT_MATTER_OBJECT",
        "Front matter must be a mapping.",
        options,
        lines[1] ?? firstLine,
      ),
    );
    return { metadata: emptyMetadata(), diagnostics, bodyStart: closingIndex + 1 };
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
        "AZE_VERSION_UNSUPPORTED",
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
          `AZE_FRONT_MATTER_${key.toUpperCase()}`,
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
      const keyDiagnostic = diagnostic(
        malformedExtension ? "AZE_FRONT_MATTER_EXTENSION_KEY" : "AZE_FRONT_MATTER_KEY",
        malformedExtension
          ? `Malformed front matter extension key "${key}".`
          : `Unknown front matter key "${key}".`,
        options,
        metadataLine,
        malformedExtension ? "error" : "warning",
      );
      diagnostics.push(
        malformedExtension
          ? keyDiagnostic
          : {
              ...keyDiagnostic,
              suggestion: `Did you mean "${nearestMetadataKey(key)}"?`,
            },
      );
      continue;
    }
    const extension = asJsonValue(item);
    if (extension === undefined) {
      diagnostics.push(
        diagnostic(
          "AZE_FRONT_MATTER_EXTENSION",
          `Front matter extension "${key}" must contain JSON-compatible values.`,
          options,
          metadataLine,
        ),
      );
    } else {
      metadata.extensions[key] = extension;
    }
  }

  return { metadata, diagnostics, bodyStart: closingIndex + 1 };
}

interface ParsedHeading {
  readonly level: 1 | 2 | 3 | 4 | 5 | 6;
  readonly text: string;
}

function lineText(line: SourceLine): string {
  return line.number === 1 && line.text.startsWith("\uFEFF")
    ? line.text.slice(1)
    : line.text;
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
      index += 1;
      while (index < lines.length) {
        const candidate = lines[index];
        if (
          candidate !== undefined &&
          /^ {0,3}:{4,}[ \t]*$/.test(lineText(candidate))
        ) {
          index += 1;
          break;
        }
        index += 1;
      }
      const last = lines[index - 1] ?? first;
      const diagnosticIndex = diagnostics.length;
      diagnostics.push(
        diagnostic(
          "AZE_DIRECTIVE_UNSUPPORTED",
          originalType === undefined
            ? "Directive Blocks are not supported by this Compiler."
            : `Directive Block type "${originalType}" is not supported by this Compiler.`,
          options,
          first,
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

export function parseSource(source: string, options: ParseOptions = {}): ParseResult {
  const lines = sourceLines(source);
  const frontMatter = parseFrontMatter(lines, options);
  const diagnostics = [...frontMatter.diagnostics];
  const blocks = parseBlocks(
    source,
    lines,
    frontMatter.bodyStart,
    options,
    diagnostics,
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
