import { createDiagnostic } from "./diagnostics.js";
import type { FormatOptions, FormatResult, SourceRange } from "./model.js";

const AMBIGUOUS_STRUCTURE = "azeforge.format#ambiguous-structure" as const;
const EQUATION_TYPE = "equation" as const;

const BLANK = /^[ \t]*$/;
const FENCE = /^ {0,3}(?:`{3,}|~{3,})/;
const DIRECTIVE_FENCE = /^ {0,3}:{4,}/;
const DIRECTIVE_CLOSE = /^ {0,3}:{4,}[ \t]*$/;
const DIRECTIVE_OPEN = /^ {0,3}:{4,}[ \t]*([^ \t:]*)[ \t]*$/;
const HEADER_ENTRY = /^[ \t]*([A-Za-z][A-Za-z0-9-]*)[ \t]*:(.*)$/;
const ATX_HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*)|[ \t]*)$/;
const SETEXT_UNDERLINE = /^ {0,3}(=+|-+)[ \t]*$/;

interface FormatLine {
  readonly text: string;
  readonly ending: "\r\n" | "\n" | "\r" | "";
  readonly startIndex: number;
}

function splitLines(source: string): FormatLine[] {
  const lines: FormatLine[] = [];
  let start = 0;
  let index = 0;
  while (index < source.length) {
    const character = source[index];
    if (character === "\r" && source[index + 1] === "\n") {
      lines.push({ text: source.slice(start, index), ending: "\r\n", startIndex: start });
      index += 2;
      start = index;
    } else if (character === "\n" || character === "\r") {
      lines.push({
        text: source.slice(start, index),
        ending: character,
        startIndex: start,
      });
      index += 1;
      start = index;
    } else {
      index += 1;
    }
  }
  if (start < source.length) {
    lines.push({ text: source.slice(start), ending: "", startIndex: start });
  }
  return lines;
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function lineRange(source: string, line: FormatLine, lineNumber: number): SourceRange {
  const startOffset = byteLength(source.slice(0, line.startIndex));
  const endOffset = byteLength(source.slice(0, line.startIndex + line.text.length));
  return {
    start: { line: lineNumber, column: 1, offset: startOffset },
    end: {
      line: lineNumber,
      column: [...line.text].length + 1,
      offset: endOffset,
    },
  };
}

function ambiguous(
  source: string,
  line: FormatLine,
  lineNumber: number,
  message: string,
  suggestion: string,
  options: FormatOptions,
): FormatResult {
  const range = lineRange(source, line, lineNumber);
  return {
    diagnostics: [
      createDiagnostic(AMBIGUOUS_STRUCTURE, "error", message, {
        location:
          options.sourceName === undefined
            ? { range }
            : { source: options.sourceName, range },
        suggestion,
      }),
    ],
  };
}

function rawHtmlStartAt(text: string, index: number): number {
  const rest = text.slice(index);
  const match = /^(?:<!--|<![A-Za-z]|<\?|<\/?[A-Za-z][A-Za-z0-9-]*(?=[\s/>]))/.exec(rest);
  return match === null ? -1 : match[0].length;
}

function containsDeniedRawHtml(text: string): boolean {
  if (!text.includes("<")) return false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === "\\") {
      index += 1;
      continue;
    }
    if (character === "`") {
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
    if (character !== "<") continue;
    if (rawHtmlStartAt(text, index) >= 0) return true;
  }
  return false;
}

function trimLineEnd(text: string): string {
  return text.replace(/[ \t]+$/, "");
}

function trimLine(text: string): string {
  return text.replace(/^[ \t]+/, "").replace(/[ \t]+$/, "");
}

function parseAtxHeading(text: string): { level: number; body: string } | undefined {
  const match = ATX_HEADING.exec(text);
  const marker = match?.[1];
  if (marker === undefined) return undefined;
  const rawBody = (match?.[2] ?? "").replace(/[ \t]+$/, "");
  const body = /^#+$/.test(rawBody) ? "" : rawBody.replace(/[ \t]+#+$/, "");
  return { level: marker.length, body };
}

type OutLine = string;

function preserved(line: FormatLine): OutLine {
  return line.ending === "\r\n" ? `${line.text}\r` : line.text;
}

interface BlockCursor {
  lines: readonly FormatLine[];
  source: string;
  options: FormatOptions;
}

function isUnambiguousUnclosedTail(lines: readonly FormatLine[], openIndex: number): boolean {
  const recoveryIndex = lines.findIndex(
    (candidate, candidateIndex) => candidateIndex > openIndex && BLANK.test(candidate.text),
  );
  if (recoveryIndex < 0) return true;
  return lines
    .slice(recoveryIndex)
    .every((candidate) => BLANK.test(candidate.text));
}

function formatEquationEnvelope(
  lines: readonly FormatLine[],
  openIndex: number,
  closingIndex: number,
): OutLine[] {
  const emitted: OutLine[] = [`${":".repeat(4)} ${EQUATION_TYPE}`];
  let cursor = openIndex + 1;
  const entries: OutLine[] = [];
  while (cursor < closingIndex) {
    const header = lines[cursor];
    if (header === undefined) break;
    if (BLANK.test(header.text)) {
      cursor += 1;
      continue;
    }
    const match = HEADER_ENTRY.exec(header.text);
    if (match === null) break;
    const key = match[1] ?? "";
    const value = (match[2] ?? "").trim();
    entries.push(value.length === 0 ? `${key}:` : `${key}: ${value}`);
    cursor += 1;
  }
  emitted.push(...entries);
  while (cursor < closingIndex) {
    const blank = lines[cursor];
    if (blank !== undefined && !BLANK.test(blank.text)) break;
    cursor += 1;
  }
  const body = lines.slice(cursor, closingIndex);
  let bodyStart = 0;
  while (bodyStart < body.length) {
    const candidate = body[bodyStart];
    if (candidate !== undefined && !BLANK.test(candidate.text)) break;
    bodyStart += 1;
  }
  let bodyEnd = body.length;
  while (bodyEnd > bodyStart) {
    const candidate = body[bodyEnd - 1];
    if (candidate !== undefined && !BLANK.test(candidate.text)) break;
    bodyEnd -= 1;
  }
  const bodyLines = body.slice(bodyStart, bodyEnd).map((line) => trimLineEnd(line.text));
  if (entries.length > 0 && bodyLines.length > 0) emitted.push("");
  emitted.push(...bodyLines);
  emitted.push(":".repeat(4));
  return emitted;
}

function formatEnvelope(
  cursor: BlockCursor,
  openIndex: number,
): { emitted: OutLine[]; nextIndex: number } | FormatResult {
  const { lines, source, options } = cursor;
  const open = lines[openIndex];
  if (open === undefined) return { emitted: [], nextIndex: openIndex };
  const closingIndex = lines.findIndex(
    (candidate, candidateIndex) =>
      candidateIndex > openIndex && DIRECTIVE_CLOSE.test(candidate.text),
  );
  if (closingIndex < 0) {
    if (!isUnambiguousUnclosedTail(lines, openIndex)) {
      return ambiguous(
        source,
        open,
        openIndex + 1,
        "A directive Block must end with a closing `::::` delimiter.",
        "Add a closing `::::` delimiter before the next Block.",
        options,
      );
    }
    const recoveryIndex = lines.findIndex(
      (candidate, candidateIndex) =>
        candidateIndex > openIndex && BLANK.test(candidate.text),
    );
    const endIndex = recoveryIndex < 0 ? lines.length : recoveryIndex;
    return {
      emitted: lines.slice(openIndex, endIndex).map(preserved),
      nextIndex: endIndex,
    };
  }
  const typeMatch = DIRECTIVE_OPEN.exec(open.text);
  const declaredType = typeMatch?.[1] === "" ? undefined : typeMatch?.[1];
  if (declaredType === EQUATION_TYPE) {
    return {
      emitted: formatEquationEnvelope(lines, openIndex, closingIndex),
      nextIndex: closingIndex + 1,
    };
  }
  const emitted: OutLine[] = [
    declaredType === undefined ? ":".repeat(4) : `${":".repeat(4)} ${declaredType}`,
  ];
  for (let index = openIndex + 1; index < closingIndex; index += 1) {
    const inner = lines[index];
    if (inner !== undefined) emitted.push(preserved(inner));
  }
  emitted.push(":".repeat(4));
  return { emitted, nextIndex: closingIndex + 1 };
}

function formatFencedBlock(
  lines: readonly FormatLine[],
  openIndex: number,
): { emitted: OutLine[]; nextIndex: number } {
  const open = lines[openIndex];
  const fenceMatch = /^ {0,3}(`{3,}|~{3,})/.exec(open?.text ?? "");
  const fence = fenceMatch?.[1] ?? "```";
  const marker = fence[0] ?? "`";
  const length = fence.length;
  let closingIndex = -1;
  for (let index = openIndex + 1; index < lines.length; index += 1) {
    const text = lines[index]?.text ?? "";
    if (new RegExp(`^ {0,3}${marker}{${length},}[ \\t]*$`).test(text)) {
      closingIndex = index;
      break;
    }
  }
  const endIndex = closingIndex < 0 ? lines.length : closingIndex + 1;
  return {
    emitted: lines.slice(openIndex, endIndex).map(preserved),
    nextIndex: endIndex,
  };
}

export function formatSource(source: string, options: FormatOptions = {}): FormatResult {
  const stripped = source.startsWith("\uFEFF") ? source.slice(1) : source;
  const lines = splitLines(stripped);
  const blocks: OutLine[][] = [];
  let frontMatter: OutLine[] | undefined;

  let index = 0;
  if (lines[0] !== undefined && lines[0].text === "---") {
    const closingIndex = lines.findIndex(
      (candidate, candidateIndex) => candidateIndex > 0 && candidate.text === "---",
    );
    if (closingIndex < 0) {
      const first = lines[0];
      if (first === undefined) return { diagnostics: [] };
      return ambiguous(
        stripped,
        first,
        1,
        "Front matter must end with a --- delimiter.",
        "Add a closing `---` delimiter after the front matter.",
        options,
      );
    }
    frontMatter = [
      "---",
      ...lines.slice(1, closingIndex).map((line) => line.text),
      "---",
    ];
    index = closingIndex + 1;
  }

  const cursor: BlockCursor = { lines, source: stripped, options };
  while (index < lines.length && BLANK.test(lines[index]?.text ?? "")) index += 1;

  while (index < lines.length) {
    const line = lines[index];
    if (line === undefined) break;
    if (FENCE.test(line.text)) {
      const fenced = formatFencedBlock(lines, index);
      blocks.push(fenced.emitted);
      index = fenced.nextIndex;
    } else if (DIRECTIVE_FENCE.test(line.text)) {
      const envelope = formatEnvelope(cursor, index);
      if ("diagnostics" in envelope) return envelope;
      blocks.push(envelope.emitted);
      index = envelope.nextIndex;
    } else if (containsDeniedRawHtml(line.text)) {
      blocks.push([preserved(line)]);
      index += 1;
    } else {
      const heading = parseAtxHeading(line.text);
      if (heading !== undefined) {
        blocks.push([
          heading.body.length === 0
            ? "#".repeat(heading.level)
            : `${"#".repeat(heading.level)} ${heading.body}`,
        ]);
        index += 1;
      } else {
        const group: FormatLine[] = [line];
        index += 1;
        let underline: FormatLine | undefined;
        while (index < lines.length) {
          const next = lines[index];
          if (next === undefined || BLANK.test(next.text)) break;
          if (
            DIRECTIVE_FENCE.test(next.text) ||
            FENCE.test(next.text) ||
            parseAtxHeading(next.text) !== undefined
          ) {
            break;
          }
          const setext = SETEXT_UNDERLINE.exec(next.text);
          if (setext !== null) {
            underline = next;
            index += 1;
            break;
          }
          group.push(next);
          index += 1;
        }
        if (group.some((candidate) => containsDeniedRawHtml(candidate.text))) {
          blocks.push(group.map(preserved));
          if (underline !== undefined) {
            blocks.push([preserved(underline)]);
          }
        } else if (underline !== undefined) {
          blocks.push([...group.map((candidate) => trimLineEnd(candidate.text)), trimLineEnd(underline.text)]);
        } else {
          blocks.push(group.map((candidate) => trimLine(candidate.text)));
        }
      }
    }
    while (index < lines.length && BLANK.test(lines[index]?.text ?? "")) index += 1;
  }

  const emitted: OutLine[] = [];
  if (frontMatter !== undefined) emitted.push(...frontMatter);
  for (const block of blocks) {
    if (emitted.length > 0) emitted.push("");
    emitted.push(...block);
  }
  if (emitted.length === 0) return { source: "", diagnostics: [] };
  return { source: `${emitted.join("\n")}\n`, diagnostics: [] };
}
