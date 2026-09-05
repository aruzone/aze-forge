import type { Inline, TableAlignment, TableData } from "./model.js";

const SAFE_LINK_SCHEME = /^(?:https?|mailto):/i;

export function isSafeLinkTarget(href: string): boolean {
  const value = href.trim();
  if (value === "") return false;
  if (value.startsWith("#")) return value.length > 1;
  if (value.startsWith("/") || value.startsWith("./") || value.startsWith("../")) return true;
  const colon = value.indexOf(":");
  const slash = value.indexOf("/");
  const question = value.indexOf("?");
  const hash = value.indexOf("#");
  const firstDelim = [slash, question, hash].filter((i) => i >= 0).reduce(
    (min, i) => Math.min(min, i),
    Number.POSITIVE_INFINITY,
  );
  if (colon >= 0 && colon < firstDelim) {
    return SAFE_LINK_SCHEME.test(value);
  }
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)) {
    return SAFE_LINK_SCHEME.test(value);
  }
  return true;
}

interface InlineParser {
  text: string;
  index: number;
  unsafeTargets: string[];
}

function isEscapable(char: string | undefined): boolean {
  return char !== undefined && "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~".includes(char);
}

function parseInlineRecursive(parser: InlineParser, stop: string | undefined): Inline[] {
  const nodes: Inline[] = [];
  let literal = "";
  const flush = (): void => {
    if (literal !== "") {
      nodes.push({ kind: "text", value: literal });
      literal = "";
    }
  };
  const { text } = parser;
  while (parser.index < text.length) {
    const rest = text.slice(parser.index);
    if (stop !== undefined && rest.startsWith(stop)) break;
    const char = text[parser.index];
    if (char === "\n") {
      flush();
      nodes.push({ kind: "break" });
      parser.index += 1;
      continue;
    }
    if (char === "\\" && isEscapable(text[parser.index + 1])) {
      literal += text[parser.index + 1] ?? "";
      parser.index += 2;
      continue;
    }
    if (char === "`") {
      let length = 0;
      while (text[parser.index + length] === "`") length += 1;
      const delimiter = "`".repeat(length);
      const closing = text.indexOf(delimiter, parser.index + length);
      if (closing >= 0) {
        let content = text.slice(parser.index + length, closing);
        if (content.startsWith(" ") && content.endsWith(" ") && content.trim() !== "") {
          content = content.slice(1, -1);
        }
        flush();
        nodes.push({ kind: "code", value: content.replaceAll("\n", " ") });
        parser.index = closing + length;
        continue;
      }
      literal += char;
      parser.index += 1;
      continue;
    }
    if (char === "!" && rest.startsWith("![") === true) {
      const image = tryParseImage(parser);
      if (image !== undefined) {
        flush();
        nodes.push(image);
        continue;
      }
      literal += char;
      parser.index += 1;
      continue;
    }
    if (char === "[") {
      const link = tryParseLink(parser);
      if (link !== undefined) {
        flush();
        nodes.push(link);
        continue;
      }
      literal += char;
      parser.index += 1;
      continue;
    }
    if (char === "<") {
      const autolink = /^<(https?:\/\/[^<>\s]+|mailto:[^<>\s]+)>/.exec(rest);
      if (autolink !== null) {
        const href = autolink[1] ?? "";
        flush();
        if (!isSafeLinkTarget(href)) {
          parser.unsafeTargets.push(href);
          literal += href;
          parser.index += autolink[0].length;
          continue;
        }
        nodes.push({ kind: "link", href, children: [{ kind: "text", value: href }] });
        parser.index += autolink[0].length;
        continue;
      }
      literal += char;
      parser.index += 1;
      continue;
    }
    if (char === "*" || char === "_") {
      const strongDelim = rest.startsWith("**") || rest.startsWith("__") ? char + char : undefined;
      if (strongDelim !== undefined) {
        const saved = parser.index;
        parser.index += 2;
        const children = parseInlineRecursive(parser, strongDelim);
        if (text.slice(parser.index, parser.index + 2) === strongDelim && children.length > 0) {
          parser.index += 2;
          flush();
          nodes.push({ kind: "strong", children });
          continue;
        }
        parser.index = saved;
      }
      const saved = parser.index;
      parser.index += 1;
      const children = parseInlineRecursive(parser, char);
      if (text[parser.index] === char && children.length > 0) {
        if (char === "_" && isWordChar(text[saved - 1]) && isWordChar(text[parser.index + 1])) {
          parser.index = saved;
        } else {
          parser.index += 1;
          flush();
          nodes.push({ kind: "emphasis", children });
          continue;
        }
      } else {
        parser.index = saved;
      }
      literal += char;
      parser.index += 1;
      continue;
    }
    literal += char;
    parser.index += 1;
  }
  flush();
  return nodes;
}

function isWordChar(char: string | undefined): boolean {
  return char !== undefined && /[\p{L}\p{N}_]/u.test(char);
}

function findMatchingBracket(text: string, open: number): number {
  let depth = 0;
  let index = open;
  while (index < text.length) {
    const char = text[index];
    if (char === "\\") {
      index += 2;
      continue;
    }
    if (char === "`") {
      let length = 0;
      while (text[index + length] === "`") length += 1;
      const delimiter = "`".repeat(length);
      const closing = text.indexOf(delimiter, index + length);
      if (closing < 0) return -1;
      index = closing + length;
      continue;
    }
    if (char === "[") depth += 1;
    if (char === "]") {
      depth -= 1;
      if (depth === 0) return index;
    }
    index += 1;
  }
  return -1;
}

function parseLinkDestination(text: string, index: number): { href: string; title?: string; end: number } | undefined {
  let cursor = index;
  while (text[cursor] === " " || text[cursor] === "\n") cursor += 1;
  if (text[cursor] === "<") {
    const closing = text.indexOf(">", cursor + 1);
    if (closing < 0) return undefined;
    const href = text.slice(cursor + 1, closing);
    if (href === "" || href.includes("\n")) return undefined;
    cursor = closing + 1;
    return parseLinkTitle(text, href, cursor);
  }
  let href = "";
  let cursor2 = cursor;
  while (cursor2 < text.length) {
    const char = text[cursor2];
    if (char === " " || char === "\n" || char === ")") break;
    if (char === "\\" && cursor2 + 1 < text.length) {
      href += text[cursor2 + 1];
      cursor2 += 2;
      continue;
    }
    href += char;
    cursor2 += 1;
  }
  if (href === "") return undefined;
  return parseLinkTitle(text, href, cursor2);
}

function parseLinkTitle(text: string, href: string, index: number): { href: string; title?: string; end: number } | undefined {
  let cursor = index;
  while (text[cursor] === " " || text[cursor] === "\n") cursor += 1;
  if (text[cursor] !== ")") {
    const quote = text[cursor];
    if (quote !== "\"" && quote !== "'" && quote !== "(") return undefined;
    const closingQuote = quote === "(" ? ")" : quote;
    let title = "";
    cursor += 1;
    while (cursor < text.length && text[cursor] !== closingQuote) {
      if (text[cursor] === "\\" && cursor + 1 < text.length) {
        title += text[cursor + 1];
        cursor += 2;
        continue;
      }
      title += text[cursor];
      cursor += 1;
    }
    if (text[cursor] !== closingQuote) return undefined;
    cursor += 1;
    while (text[cursor] === " " || text[cursor] === "\n") cursor += 1;
    if (text[cursor] !== ")") return undefined;
    return { href, title, end: cursor + 1 };
  }
  return { href, end: cursor + 1 };
}

function tryParseLink(parser: InlineParser): Inline | undefined {
  const { text } = parser;
  const closing = findMatchingBracket(text, parser.index);
  if (closing < 0) return undefined;
  if (text[closing + 1] !== "(") return undefined;
  const dest = parseLinkDestination(text, closing + 2);
  if (dest === undefined) return undefined;
  const label = text.slice(parser.index + 1, closing);
  const childParser: InlineParser = { text: label, index: 0, unsafeTargets: parser.unsafeTargets };
  const children = parseInlineRecursive(childParser, undefined);
  if (!isSafeLinkTarget(dest.href)) {
    parser.unsafeTargets.push(dest.href);
    return undefined;
  }
  parser.index = dest.end;
  return {
    kind: "link",
    href: dest.href,
    children: children.length > 0 ? children : [{ kind: "text", value: label }],
    ...(dest.title === undefined ? {} : { title: dest.title }),
  };
}

function tryParseImage(parser: InlineParser): Inline | undefined {
  const { text } = parser;
  const labelOpen = parser.index + 1;
  const closing = findMatchingBracket(text, labelOpen);
  if (closing < 0) return undefined;
  if (text[closing + 1] !== "(") return undefined;
  const dest = parseLinkDestination(text, closing + 2);
  if (dest === undefined) return undefined;
  const alt = text.slice(labelOpen + 1, closing);
  if (!isSafeLinkTarget(dest.href)) {
    parser.unsafeTargets.push(dest.href);
    return undefined;
  }
  parser.index = dest.end;
  return {
    kind: "image",
    src: dest.href,
    alt,
    ...(dest.title === undefined ? {} : { title: dest.title }),
  };
}

export interface ParsedInline {
  readonly nodes: readonly Inline[];
  readonly unsafeTargets: readonly string[];
}

export function parseInlineFragment(text: string): ParsedInline {
  const parser: InlineParser = { text, index: 0, unsafeTargets: [] };
  const nodes = parseInlineRecursive(parser, undefined);
  return { nodes, unsafeTargets: [...parser.unsafeTargets] };
}

export function inlineTextValue(nodes: readonly Inline[]): string {
  return nodes
    .map((node) => {
      if (node.kind === "text" || node.kind === "code") return node.value;
      if (node.kind === "break") return " ";
      if (node.kind === "link") return inlineTextValue(node.children);
      if (node.kind === "image") return node.alt;
      return inlineTextValue(node.children);
    })
    .join("");
}

export function splitTableRow(line: string): string[] | undefined {
  const cells: string[] = [];
  let current = "";
  let index = 0;
  while (index < line.length) {
    const char = line[index];
    if (char === "\\" && index + 1 < line.length) {
      current += char + (line[index + 1] ?? "");
      continue;
    }
    if (char === "`") {
      let length = 0;
      while (line[index + length] === "`") length += 1;
      const delimiter = "`".repeat(length);
      const closing = line.indexOf(delimiter, index + length);
      if (closing >= 0) {
        current += line.slice(index, closing + length);
        index = closing + length;
        continue;
      }
      current += char;
      index += 1;
      continue;
    }
    if (char === "|") {
      cells.push(current);
      current = "";
      index += 1;
      continue;
    }
    current += char;
    index += 1;
  }
  cells.push(current);
  if (cells.length > 0 && cells[0] !== undefined && cells[0].trim() === "") cells.shift();
  if (cells.length > 0 && cells[cells.length - 1] !== undefined && (cells[cells.length - 1] ?? "").trim() === "") cells.pop();
  if (cells.length === 0) return undefined;
  return cells.map((cell) => cell.trim().replaceAll("\\|", "|"));
}

function parseDelimiterCell(cell: string): TableAlignment | undefined {
  const value = cell.trim();
  if (/^:?-+:?$/.test(value) === false) return undefined;
  if (value.startsWith(":") && value.endsWith(":") && value.length >= 3) return "center";
  if (value.startsWith(":")) return "left";
  if (value.endsWith(":")) return "right";
  return null;
}

export function tryParseGfmTable(lines: readonly string[]): { data: TableData; consumed: number } | undefined {
  if (lines.length < 2) return undefined;
  const headerCells = splitTableRow(lines[0] ?? "");
  const delimiterCells = splitTableRow(lines[1] ?? "");
  if (headerCells === undefined || delimiterCells === undefined) return undefined;
  if (headerCells.length === 0 || headerCells.length !== delimiterCells.length) return undefined;
  const align: TableAlignment[] = [];
  for (const cell of delimiterCells) {
    const parsed = parseDelimiterCell(cell);
    if (parsed === undefined) return undefined;
    align.push(parsed);
  }
  const width = headerCells.length;
  const header = headerCells.map((cell) => parseInlineFragment(cell).nodes);
  const rows: (readonly (readonly Inline[])[])[] = [];
  let consumed = 2;
  for (let i = 2; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (line.trim() === "") break;
    if (!line.includes("|")) break;
    const cells = splitTableRow(line);
    if (cells === undefined) break;
    const normalized = Array.from({ length: width }, (_, col) => cells[col] ?? "");
    rows.push(normalized.map((cell) => parseInlineFragment(cell).nodes));
    consumed += 1;
  }
  return {
    data: { align, header, rows },
    consumed,
  };
}
export function isGfmTableStart(headerLine: string, delimiterLine: string): boolean {
  if (!headerLine.includes("|") || !delimiterLine.includes("|")) return false;
  const headerCells = splitTableRow(headerLine);
  const delimiterCells = splitTableRow(delimiterLine);
  if (headerCells === undefined || delimiterCells === undefined) return false;
  if (headerCells.length === 0 || headerCells.length !== delimiterCells.length) {
    return false;
  }
  return delimiterCells.every((cell) => parseDelimiterCell(cell) !== undefined);
}
