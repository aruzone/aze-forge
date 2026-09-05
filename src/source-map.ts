import type { SourceRange } from "./model.js";

export interface SourceLine {
  readonly number: number;
  readonly text: string;
  readonly startIndex: number;
  readonly endIndex: number;
  readonly startOffset: number;
  readonly endOffset: number;
}

export function sourceLines(source: string): readonly SourceLine[] {
  const lines: SourceLine[] = [];
  let characterIndex = 0;
  let byteOffset = 0;
  let lineNumber = 1;

  while (characterIndex < source.length) {
    const startIndex = characterIndex;
    const startOffset = byteOffset;
    while (
      characterIndex < source.length &&
      source[characterIndex] !== "\n" &&
      source[characterIndex] !== "\r"
    ) {
      characterIndex += 1;
    }

    const text = source.slice(startIndex, characterIndex);
    byteOffset += Buffer.byteLength(text, "utf8");
    const endOffset = byteOffset;

    if (source.startsWith("\r\n", characterIndex)) {
      characterIndex += 2;
      byteOffset += 2;
    } else if (characterIndex < source.length) {
      const ending = source[characterIndex];
      characterIndex += 1;
      byteOffset += Buffer.byteLength(ending ?? "", "utf8");
    }

    lines.push({
      number: lineNumber,
      text,
      startIndex,
      endIndex: startIndex + text.length,
      startOffset,
      endOffset,
    });
    lineNumber += 1;
  }

  if (source.length === 0 || source.endsWith("\n") || source.endsWith("\r")) {
    lines.push({
      number: lineNumber,
      text: "",
      startIndex: source.length,
      endIndex: source.length,
      startOffset: byteOffset,
      endOffset: byteOffset,
    });
  }

  return lines;
}


export function rangeFromLines(first: SourceLine, last: SourceLine): SourceRange {
  return {
    start: { line: first.number, column: 1, offset: first.startOffset },
    end: {
      line: last.number,
      column: [...last.text].length + 1,
      offset: last.endOffset,
    },
  };
}

export function rangeFromLineSlice(
  line: SourceLine,
  startIndex: number,
  endIndex: number,
): SourceRange {
  const prefix = line.text.slice(0, startIndex);
  const value = line.text.slice(startIndex, endIndex);
  const startOffset = line.startOffset + Buffer.byteLength(prefix, "utf8");
  return {
    start: {
      line: line.number,
      column: [...prefix].length + 1,
      offset: startOffset,
    },
    end: {
      line: line.number,
      column: [...prefix, ...value].length + 1,
      offset: startOffset + Buffer.byteLength(value, "utf8"),
    },
  };
}
