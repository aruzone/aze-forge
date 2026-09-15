import {
  EXAMPLE_PLUGIN_TYPE,
  EXAMPLE_PLUGIN_VERSION,
  EXAMPLE_BODY_SYNTAX_ID,
  EXAMPLE_BODY_SYNTAX_VERSION,
  exampleSourceSchema,
  exampleDataSchema,
} from "./example-schemas.js";
import { createDiagnostic } from "./diagnostics.js";
import { parseCompositionHeader, type HeaderEntry } from "./block-header.js";
import {
  escapeHtml,
  numberingLabelHtml,
  renderInlineHtml,
} from "./html-fragment.js";
import { didYouMean } from "./plot.js";
import {
  rangeFromLines,
  rangeFromLineSlice,
  type SourceLine,
} from "./source-map.js";
import type {
  AzeBlock,
  AzeBlockPlugin,
  AzeBlockRenderer,
  BlockRendererContext,
  Diagnostic,
  ExampleBlock,
  ExampleStep,
  Inline,
  JsonValue,
  ParsedBlock,
  SourceRange,
} from "./model.js";

/**
 * Worked examples (contract: issue #66 §8): problem, givens, ordered steps and
 * result, composing equation/derivation Blocks as one numbered object.
 */

export const EXAMPLE_HTML_BLOCK_RENDERER_ID =
  "azeforge.example.html/v1" as const;
export const EXAMPLE_HTML_BLOCK_RENDERER_VERSION = "1.0.0" as const;

export const MAX_EXAMPLE_STEPS = 64;
export const MAX_EXAMPLE_GIVENS = 64;
export const MAX_EXAMPLE_MARKDOWN_CHARS = 20000;

const pluginDescriptor = Object.freeze({
  type: EXAMPLE_PLUGIN_TYPE,
  version: EXAMPLE_PLUGIN_VERSION,
  title: "Worked example",
  summary: "Problem, givens, ordered steps and result as one numbered object.",
  diagnosticNamespace: "azeforge.example",
  sourceSchema: exampleSourceSchema,
  bodySyntax: Object.freeze({
    id: EXAMPLE_BODY_SYNTAX_ID,
    version: EXAMPLE_BODY_SYNTAX_VERSION,
  }),
  dataSchema: exampleDataSchema,
});

export const examplePlugin: AzeBlockPlugin = Object.freeze({
  descriptor: pluginDescriptor,
});

const blockRendererDescriptor = Object.freeze({
  id: EXAMPLE_HTML_BLOCK_RENDERER_ID,
  version: EXAMPLE_HTML_BLOCK_RENDERER_VERSION,
  blockType: EXAMPLE_PLUGIN_TYPE,
  pluginVersionRange: EXAMPLE_PLUGIN_VERSION,
  rendererId: "html",
  rendererVersionRange: "1.0.0",
});

export interface ExampleHeader {
  readonly id?: string;
  readonly number?: boolean;
  readonly caption?: readonly Inline[];
  readonly diagnostics: readonly Diagnostic[];
}

export function parseExampleHeader(
  entries: readonly HeaderEntry[],
  _blockRange: SourceRange,
  sourceName: string | undefined,
  parseCaption: (
    text: string,
    range: SourceRange,
  ) => readonly Inline[] | undefined,
): ExampleHeader {
  const header = parseCompositionHeader(entries, sourceName, {
    namespace: "azeforge.example",
    known: [],
    parseCaption,
  });
  return {
    diagnostics: header.diagnostics,
    ...(header.id === undefined ? {} : { id: header.id }),
    ...(header.number === undefined ? {} : { number: header.number }),
    ...(header.caption === undefined ? {} : { caption: header.caption }),
  };
}

export interface ExampleBody {
  readonly problem: readonly ParsedBlock[];
  readonly givens: readonly string[];
  readonly steps: readonly ExampleStep[];
  readonly result?: readonly ParsedBlock[];
}

export interface ExampleBodyResult {
  readonly body?: ExampleBody;
  readonly diagnostics: readonly Diagnostic[];
}

/* ------------------------------------------------------------------ *
 * Body: shared declarations plus Markdown fields (contract #66 §8, #52 §4–5)
 * ------------------------------------------------------------------ */

const NAMESPACE = "azeforge.example";

/** The four registered section fields, in canonical authored order. */
const REGISTERED_FIELDS: readonly string[] = Object.freeze([
  "problem",
  "givens",
  "steps",
  "result",
]);

/** A step record carries exactly one field: its Markdown content. */
const STEP_FIELDS: readonly string[] = Object.freeze(["text"]);

/** One `key: value` declaration; the value may be empty or the `|` marker. */
const FIELD = /^([A-Za-z][A-Za-z0-9-]*)[ \t]*:(.*)$/;
/** One `- item` collection entry; group 2 is the entry's content. */
const ITEM = /^-([ \t]*)(.*)$/;
/** One `- key: value` collection entry. */
const ITEM_FIELD = /^-([ \t]*)([A-Za-z][A-Za-z0-9-]*)[ \t]*:(.*)$/;
/** A standalone `//` structural comment line (language contract §5). */
const COMMENT = /^[ \t]*\/\/(?:[ \t].*)?$/;

/**
 * Structural indentation is spaces only, two per level (language contract §4).
 * `undefined` reports a tab standing in for structural indentation.
 */
function leadingIndent(text: string): number | undefined {
  let indent = 0;
  for (const character of text) {
    if (character === " ") indent += 1;
    else if (character === "\t") return undefined;
    else return indent;
  }
  return indent;
}

/**
 * Literal content indentation counts leading spaces only: a tab beyond the
 * structural part is preserved content, not a structural level.
 */
function contentIndent(text: string): number {
  let indent = 0;
  while (indent < text.length && text[indent] === " ") indent += 1;
  return indent;
}

function declarationKey(text: string): string {
  const match = /^[ \t]*(?:-[ \t]*)?([A-Za-z][A-Za-z0-9-]*)[ \t]*:/.exec(text);
  return match?.[1]?.toLowerCase() ?? text.trim();
}

/** A slice of one physical line, with the byte offsets of the slice. */
function sliced(line: SourceLine, startIndex: number, endIndex: number): SourceLine {
  const text = line.text.slice(startIndex, endIndex);
  const startOffset =
    line.startOffset + Buffer.byteLength(line.text.slice(0, startIndex), "utf8");
  return {
    number: line.number,
    text,
    startIndex: line.startIndex + startIndex,
    endIndex: line.startIndex + endIndex,
    startOffset,
    endOffset: startOffset + Buffer.byteLength(text, "utf8"),
  };
}

interface BodyContext {
  readonly bodyLines: readonly SourceLine[];
  readonly baseIndent: number;
  readonly blockRange: SourceRange;
  readonly sourceName: string | undefined;
  readonly parseBlocks: (
    lines: readonly SourceLine[],
  ) => readonly ParsedBlock[] | undefined;
  readonly diagnostics: Diagnostic[];
  nestedFailed: boolean;
}

/** The body baseline: the shallowest declaration indentation in the body. */
function bodyBaseline(lines: readonly SourceLine[]): number {
  let base = Number.POSITIVE_INFINITY;
  for (const line of lines) {
    if (line.text.trim().length === 0) continue;
    const indent = leadingIndent(line.text);
    if (indent === undefined) continue;
    if (indent < base) base = indent;
  }
  return Number.isFinite(base) ? base : 0;
}

interface DiagnosticDetails {
  readonly data?: Readonly<Record<string, JsonValue>>;
  readonly suggestion?: string;
}

function error(
  ctx: BodyContext,
  code: string,
  message: string,
  range: SourceRange,
  details: DiagnosticDetails = {},
): void {
  ctx.diagnostics.push(
    createDiagnostic(`${NAMESPACE}#${code}`, "error", message, {
      location:
        ctx.sourceName === undefined
          ? { range }
          : { source: ctx.sourceName, range },
      ...(details.data === undefined ? {} : { data: details.data }),
      ...(details.suggestion === undefined
        ? {}
        : { suggestion: details.suggestion }),
    }),
  );
}

function indentationFault(ctx: BodyContext, line: SourceLine): void {
  error(
    ctx,
    "unknown-field",
    "Declarations indent with spaces only, two per structural level.",
    rangeFromLines(line, line),
    { data: { field: declarationKey(line.text) } },
  );
}

/** One decoded authored value: double-quoted JSON escapes, else literal text. */
interface DecodedText {
  readonly value: string;
  readonly invalid: boolean;
}

function decodeText(raw: string): DecodedText {
  if (!raw.startsWith('"')) return { value: raw, invalid: false };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "string") return { value: raw, invalid: true };
    return { value: parsed, invalid: false };
  } catch {
    return { value: raw, invalid: true };
  }
}

/** Advance past a rejected entry's subtree so its cascades stay suppressed. */
function skipEntry(
  ctx: BodyContext,
  start: number,
  parentIndent: number,
): number {
  let index = start;
  while (index < ctx.bodyLines.length) {
    const line = ctx.bodyLines[index];
    if (line === undefined) break;
    if (line.text.trim().length === 0) {
      index += 1;
      continue;
    }
    if (contentIndent(line.text) <= parentIndent) break;
    index += 1;
  }
  return index;
}

interface LiteralRead {
  /** Dedented content lines handed to the Markdown/Block grammar. */
  readonly lines: readonly SourceLine[];
  readonly text: string;
  readonly next: number;
  readonly first?: SourceLine;
  readonly last?: SourceLine;
}

/**
 * The `|` multiline field (language contract §5): content indented one
 * structural level beneath the property, structural indentation removed, extra
 * indentation and internal line breaks preserved.
 */
function readLiteral(
  ctx: BodyContext,
  start: number,
  propertyIndent: number,
): LiteralRead {
  const lines: SourceLine[] = [];
  let index = start;
  let first: SourceLine | undefined;
  let last: SourceLine | undefined;
  while (index < ctx.bodyLines.length) {
    const line = ctx.bodyLines[index];
    if (line === undefined) break;
    if (line.text.trim().length === 0) {
      lines.push(sliced(line, line.text.length, line.text.length));
      first ??= line;
      last = line;
      index += 1;
      continue;
    }
    const indent = contentIndent(line.text);
    if (indent <= propertyIndent) break;
    lines.push(
      sliced(line, Math.min(indent, propertyIndent + 2), line.text.length),
    );
    first ??= line;
    last = line;
    index += 1;
  }
  while (
    lines.length > 0 &&
    (lines[lines.length - 1]?.text ?? "").trim().length === 0
  ) {
    lines.pop();
  }
  return {
    lines,
    text: lines.map((line) => line.text).join("\n"),
    next: index,
    ...(first === undefined ? {} : { first }),
    ...(last === undefined ? {} : { last }),
  };
}

interface FieldRead {
  readonly key: string;
  /** The trimmed single-line value; `"|"` reports the multiline marker. */
  readonly value: string;
  /** Content handed to the Markdown grammar: literal lines or one value line. */
  readonly content: readonly SourceLine[];
  readonly text: string;
  /** Range of the property line. */
  readonly line: SourceLine;
  readonly range: SourceRange;
  /** Range of the authored content, when the field carries any. */
  readonly contentRange?: SourceRange;
  readonly next: number;
}

function readField(
  ctx: BodyContext,
  start: number,
  indent: number,
): FieldRead | undefined {
  const line = ctx.bodyLines[start];
  if (line === undefined) return undefined;
  const match = FIELD.exec(line.text.slice(indent));
  if (match === null) return undefined;
  const key = (match[1] ?? "").toLowerCase();
  const rawValue = match[2] ?? "";
  const valueStart = indent + match[0].length - rawValue.length;
  const value = rawValue.trim();
  const valueFrom = valueStart + (rawValue.length - rawValue.trimStart().length);
  const lineRange = rangeFromLines(line, line);
  if (value === "|") {
    const literal = readLiteral(ctx, start + 1, indent);
    return {
      key,
      value,
      content: literal.lines,
      text: literal.text,
      line,
      range: lineRange,
      contentRange:
        literal.first === undefined || literal.last === undefined
          ? lineRange
          : rangeFromLines(literal.first, literal.last),
      next: literal.next,
    };
  }
  if (value === "") {
    return {
      key,
      value,
      content: [],
      text: "",
      line,
      range: lineRange,
      contentRange: lineRange,
      next: start + 1,
    };
  }
  const valueRange = rangeFromLineSlice(line, valueFrom, valueFrom + value.length);
  return {
    key,
    value,
    content: [sliced(line, valueFrom, valueFrom + value.length)],
    text: value,
    line,
    range: lineRange,
    contentRange: valueRange,
    next: start + 1,
  };
}

interface GivenRead {
  readonly text: string;
  readonly range: SourceRange;
}

/** `givens:` — an ordered collection of single-line plain-text items. */
function readGivens(
  ctx: BodyContext,
  start: number,
  itemIndent: number,
): { readonly givens: readonly GivenRead[]; readonly next: number } {
  const givens: GivenRead[] = [];
  let index = start;
  while (index < ctx.bodyLines.length) {
    const line = ctx.bodyLines[index];
    if (line === undefined) break;
    if (line.text.trim().length === 0 || COMMENT.test(line.text)) {
      index += 1;
      continue;
    }
    const indent = leadingIndent(line.text);
    if (indent === undefined) {
      indentationFault(ctx, line);
      index += 1;
      continue;
    }
    if (indent < itemIndent) break;
    if (indent > itemIndent) {
      error(
        ctx,
        "unknown-field",
        `Expected a \`- \` collection item at indentation ${itemIndent}.`,
        rangeFromLines(line, line),
        { data: { field: declarationKey(line.text) } },
      );
      index += 1;
      continue;
    }
    const item = ITEM.exec(line.text.slice(itemIndent));
    if (item === null) {
      error(
        ctx,
        "unknown-field",
        "Expected a `- ` collection item.",
        rangeFromLines(line, line),
        { data: { field: declarationKey(line.text) } },
      );
      index += 1;
      continue;
    }
    const rawItem = item[2] ?? "";
    const itemRange = rangeFromLines(line, line);
    const valueFrom =
      itemIndent + item[0].length - rawItem.length +
      (rawItem.length - rawItem.trimStart().length);
    const raw = rawItem.trim();
    if (raw === "") {
      error(
        ctx,
        "empty-value",
        "A `givens:` item must not be empty.",
        itemRange,
        { data: { field: "givens" } },
      );
      index += 1;
      continue;
    }
    const decoded = decodeText(raw);
    if (decoded.invalid) {
      error(
        ctx,
        "invalid-text",
        "A `givens:` item is not a well-formed quoted value.",
        rangeFromLineSlice(line, valueFrom, valueFrom + raw.length),
        { data: { field: "givens" } },
      );
      index += 1;
      continue;
    }
    givens.push({
      text: decoded.value,
      range: rangeFromLineSlice(line, valueFrom, valueFrom + raw.length),
    });
    index += 1;
  }
  return { givens, next: index };
}

interface StepRead {
  readonly content: readonly SourceLine[];
  readonly text: string;
  /** The whole step: its `- text:` line through its last content line. */
  readonly range: SourceRange;
  /** The authored content region, or the item line when there is none. */
  readonly contentRange: SourceRange;
}

/** `steps:` — an ordered collection of `- text:` Markdown records. */
function readSteps(
  ctx: BodyContext,
  start: number,
  itemIndent: number,
): { readonly steps: readonly StepRead[]; readonly next: number } {
  const steps: StepRead[] = [];
  let index = start;
  while (index < ctx.bodyLines.length) {
    const line = ctx.bodyLines[index];
    if (line === undefined) break;
    if (line.text.trim().length === 0 || COMMENT.test(line.text)) {
      index += 1;
      continue;
    }
    const indent = leadingIndent(line.text);
    if (indent === undefined) {
      indentationFault(ctx, line);
      index += 1;
      continue;
    }
    if (indent < itemIndent) break;
    if (indent > itemIndent) {
      error(
        ctx,
        "unknown-field",
        `Expected a \`- text:\` step at indentation ${itemIndent}.`,
        rangeFromLines(line, line),
        { data: { field: declarationKey(line.text) } },
      );
      index += 1;
      continue;
    }
    const itemRange = rangeFromLines(line, line);
    const item = ITEM_FIELD.exec(line.text.slice(itemIndent));
    if (item === null) {
      error(
        ctx,
        "unknown-field",
        "Each example step must open with `- text:`.",
        itemRange,
        { data: { field: declarationKey(line.text) } },
      );
      index = skipEntry(ctx, index + 1, itemIndent);
      continue;
    }
    const key = (item[2] ?? "").toLowerCase();
    const rawValue = item[3] ?? "";
    const value = rawValue.trim();
    if (key !== "text") {
      error(
        ctx,
        "unknown-field",
        `Step field "${key}" is not a supported example step field.`,
        itemRange,
        {
          data: { field: key },
          suggestion: `Registered step fields: ${STEP_FIELDS.join(", ")}.`,
        },
      );
      index = skipEntry(ctx, index + 1, itemIndent);
      continue;
    }
    if (value === "|") {
      const literal = readLiteral(ctx, index + 1, itemIndent + 2);
      steps.push({
        content: literal.lines,
        text: literal.text,
        range: rangeFromLines(line, literal.last ?? line),
        contentRange:
          literal.first === undefined || literal.last === undefined
            ? itemRange
            : rangeFromLines(literal.first, literal.last),
      });
      index = literal.next;
      continue;
    }
    const valueFrom =
      itemIndent + item[0].length - rawValue.length +
      (rawValue.length - rawValue.trimStart().length);
    if (value === "") {
      steps.push({
        content: [],
        text: "",
        range: itemRange,
        contentRange: itemRange,
      });
      index += 1;
      continue;
    }
    const valueRange = rangeFromLineSlice(
      line,
      valueFrom,
      valueFrom + value.length,
    );
    steps.push({
      content: [sliced(line, valueFrom, valueFrom + value.length)],
      text: value,
      range: itemRange,
      contentRange: valueRange,
    });
    index += 1;
  }
  return { steps, next: index };
}

/**
 * Parse one Markdown field into Blocks through the caller's Block grammar, so
 * nested `:: equation` / `:: derivation` directives become real Blocks.
 */
function markdownBlocks(
  ctx: BodyContext,
  field: FieldRead,
  label: string,
): readonly ParsedBlock[] | undefined {
  const range = field.contentRange ?? field.range;
  if (field.text.trim().length === 0) {
    error(
      ctx,
      "empty-value",
      `The example's \`${label}:\` field must not be empty.`,
      range,
      { data: { field: label } },
    );
    return undefined;
  }
  const length = [...field.text].length;
  if (length > MAX_EXAMPLE_MARKDOWN_CHARS) {
    error(
      ctx,
      "limit-exceeded",
      `This Block's ${label} length ${length} exceeds ${MAX_EXAMPLE_MARKDOWN_CHARS}.`,
      range,
      {
        data: {
          subject: `${label} length`,
          count: length,
          limit: MAX_EXAMPLE_MARKDOWN_CHARS,
        },
      },
    );
    return undefined;
  }
  const blocks = ctx.parseBlocks(field.content);
  if (blocks === undefined) {
    ctx.nestedFailed = true;
    return undefined;
  }
  return blocks;
}

export interface ExampleBodyArgs {
  readonly header: ExampleHeader;
  readonly bodyLines: readonly SourceLine[];
  readonly blockRange: SourceRange;
  readonly sourceName?: string;
  readonly parseBlocks: (
    lines: readonly SourceLine[],
  ) => readonly ParsedBlock[] | undefined;
}

export function parseExampleBody(args: ExampleBodyArgs): ExampleBodyResult {
  const ctx: BodyContext = {
    bodyLines: args.bodyLines,
    baseIndent: bodyBaseline(args.bodyLines),
    blockRange: args.blockRange,
    sourceName: args.sourceName,
    parseBlocks: args.parseBlocks,
    diagnostics: [],
    nestedFailed: false,
  };
  const base = ctx.baseIndent;

  let problem: FieldRead | undefined;
  let result: FieldRead | undefined;
  let givensField: FieldRead | undefined;
  let stepsField: FieldRead | undefined;
  let givenItems: readonly GivenRead[] = [];
  let stepItems: readonly StepRead[] = [];

  let index = 0;
  while (index < ctx.bodyLines.length) {
    const line = ctx.bodyLines[index];
    if (line === undefined) break;
    if (line.text.trim().length === 0 || COMMENT.test(line.text)) {
      index += 1;
      continue;
    }
    const indent = leadingIndent(line.text);
    if (indent === undefined) {
      indentationFault(ctx, line);
      index += 1;
      continue;
    }
    if (indent < base) {
      index += 1;
      continue;
    }
    if (indent > base) {
      error(
        ctx,
        "unknown-field",
        `Expected a \`key: value\` declaration at indentation ${base}.`,
        rangeFromLines(line, line),
        { data: { field: declarationKey(line.text) } },
      );
      index += 1;
      continue;
    }
    const read = readField(ctx, index, base);
    if (read === undefined) {
      error(
        ctx,
        "unknown-field",
        "Expected a `key: value` declaration.",
        rangeFromLines(line, line),
        { data: { field: declarationKey(line.text) } },
      );
      index += 1;
      continue;
    }
    index = read.next;

    if (!REGISTERED_FIELDS.includes(read.key)) {
      error(
        ctx,
        "unknown-field",
        `Example field "${read.key}" is not supported.`,
        read.range,
        {
          data: { field: read.key },
          suggestion:
            didYouMean(read.key, REGISTERED_FIELDS) ??
            `Registered fields: ${REGISTERED_FIELDS.join(", ")}.`,
        },
      );
      index = skipEntry(ctx, index, base);
      continue;
    }

    if (read.key === "givens") {
      if (givensField !== undefined) {
        error(
          ctx,
          "duplicate-field",
          `Field "givens" is declared twice.`,
          read.range,
          { data: { field: "givens" } },
        );
        continue;
      }
      givensField = read;
      if (read.value !== "") {
        error(
          ctx,
          "unknown-field",
          "`givens:` requires a `- ` collection of single-line items.",
          read.range,
          { data: { field: "givens" } },
        );
        index = skipEntry(ctx, index, base);
        continue;
      }
      const givens = readGivens(ctx, index, base + 2);
      givenItems = givens.givens;
      index = givens.next;
      continue;
    }

    if (read.key === "steps") {
      if (stepsField !== undefined) {
        error(
          ctx,
          "duplicate-field",
          `Field "steps" is declared twice.`,
          read.range,
          { data: { field: "steps" } },
        );
        continue;
      }
      stepsField = read;
      if (read.value !== "") {
        error(
          ctx,
          "unknown-field",
          "`steps:` requires a `- text:` collection.",
          read.range,
          { data: { field: "steps" } },
        );
        index = skipEntry(ctx, index, base);
        continue;
      }
      const steps = readSteps(ctx, index, base + 2);
      stepItems = steps.steps;
      index = steps.next;
      continue;
    }

    const existing = read.key === "problem" ? problem : result;
    if (existing !== undefined) {
      error(
        ctx,
        "duplicate-field",
        `Field "${read.key}" is declared twice.`,
        read.range,
        { data: { field: read.key } },
      );
      continue;
    }
    if (read.key === "problem") problem = read;
    else result = read;
  }

  let problemBlocks: readonly ParsedBlock[] | undefined;
  if (problem === undefined) {
    error(
      ctx,
      "missing-problem",
      "The example requires a `problem:` section.",
      ctx.blockRange,
      {
        data: { field: "problem" },
        suggestion:
          "Add a `problem:` field stating what the example works through.",
      },
    );
  } else {
    problemBlocks = markdownBlocks(ctx, problem, "problem");
  }

  if (givenItems.length > MAX_EXAMPLE_GIVENS) {
    const offender = givenItems[MAX_EXAMPLE_GIVENS];
    error(
      ctx,
      "limit-exceeded",
      `This Block's given count ${givenItems.length} exceeds ${MAX_EXAMPLE_GIVENS}.`,
      offender?.range ?? ctx.blockRange,
      {
        data: {
          subject: "given count",
          count: givenItems.length,
          limit: MAX_EXAMPLE_GIVENS,
        },
      },
    );
  }

  const steps: ExampleStep[] = [];
  if (stepsField === undefined) {
    error(
      ctx,
      "missing-steps",
      "The example requires a `steps:` collection with at least one `- text:` step.",
      ctx.blockRange,
      {
        data: { field: "steps" },
        suggestion: "Add a `steps:` collection of `- text:` records.",
      },
    );
  } else if (stepItems.length === 0) {
    error(
      ctx,
      "missing-steps",
      "The example requires a `steps:` collection with at least one `- text:` step.",
      stepsField.range,
      { data: { field: "steps" } },
    );
  } else if (stepItems.length > MAX_EXAMPLE_STEPS) {
    const offender = stepItems[MAX_EXAMPLE_STEPS];
    error(
      ctx,
      "limit-exceeded",
      `This Block's step count ${stepItems.length} exceeds ${MAX_EXAMPLE_STEPS}.`,
      offender?.range ?? stepsField.range,
      {
        data: {
          subject: "step count",
          count: stepItems.length,
          limit: MAX_EXAMPLE_STEPS,
        },
      },
    );
  } else {
    for (const item of stepItems) {
      if (item.text.trim().length === 0) {
        error(
          ctx,
          "empty-step",
          "An example step requires non-empty Markdown content.",
          item.contentRange,
          { suggestion: "Give the step content or remove the empty step." },
        );
        continue;
      }
      const length = [...item.text].length;
      if (length > MAX_EXAMPLE_MARKDOWN_CHARS) {
        error(
          ctx,
          "limit-exceeded",
          `This Block's step length ${length} exceeds ${MAX_EXAMPLE_MARKDOWN_CHARS}.`,
          item.contentRange,
          {
            data: {
              subject: "step length",
              count: length,
              limit: MAX_EXAMPLE_MARKDOWN_CHARS,
            },
          },
        );
        continue;
      }
      const blocks = ctx.parseBlocks(item.content);
      if (blocks === undefined) {
        ctx.nestedFailed = true;
        continue;
      }
      steps.push({ text: blocks, range: item.range });
    }
  }

  const resultBlocks =
    result === undefined ? undefined : markdownBlocks(ctx, result, "result");

  // Errors gate the Block; the caller keeps the diagnostics it already holds.
  if (
    ctx.nestedFailed ||
    ctx.diagnostics.some((diagnostic) => diagnostic.severity === "error")
  ) {
    return { diagnostics: ctx.diagnostics };
  }

  const body: ExampleBody = {
    problem: problemBlocks ?? [],
    givens: Object.freeze(givenItems.map((item) => item.text)),
    steps: Object.freeze(steps),
    ...(resultBlocks === undefined ? {} : { result: resultBlocks }),
  };
  return { body: Object.freeze(body), diagnostics: ctx.diagnostics };
}

/* ------------------------------------------------------------------ *
 * Rendering (contract: issue #66 §15)
 * ------------------------------------------------------------------ */

/**
 * One worked example: caption and numbering, the problem, its givens, its
 * ordered steps and its result. Containment only — nested equation/derivation
 * Blocks render through their own renderers and keep their own numbering.
 */
export function renderExampleFragment(
  block: ExampleBlock,
  context: BlockRendererContext,
): string {
  const id =
    block.id === undefined ? "" : ` data-example-id="${escapeHtml(block.id)}"`;
  const number = block.number === true ? ' data-example-number="true"' : "";
  const caption =
    block.caption === undefined || block.caption.length === 0
      ? ""
      : renderInlineHtml(block.caption);
  const numberLabel = numberingLabelHtml(block.numberLabel);
  const figcaption =
    caption === "" && numberLabel === ""
      ? ""
      : `<figcaption>${numberLabel}${caption}</figcaption>`;
  const problem = `<section class="aze-example-problem"><p class="aze-example-label">Problem</p>${context.renderBlocks(block.problem as readonly AzeBlock[])}</section>`;
  const givens =
    block.givens.length === 0
      ? ""
      : `<ul class="aze-example-givens">${block.givens
          .map((given) => `<li>${escapeHtml(given)}</li>`)
          .join("")}</ul>`;
  const steps =
    block.steps.length === 0
      ? ""
      : `<ol class="aze-example-steps">${block.steps
          .map(
            (step) =>
              `<li class="aze-example-step">${context.renderBlocks(step.text as readonly AzeBlock[])}</li>`,
          )
          .join("")}</ol>`;
  const result =
    block.result === undefined || block.result.length === 0
      ? ""
      : `<section class="aze-example-result"><p class="aze-example-label">Result</p>${context.renderBlocks(block.result as readonly AzeBlock[])}</section>`;
  return `<figure class="aze-example"${id}${number}>${figcaption}${problem}${givens}${steps}${result}</figure>`;
}

export const exampleHtmlBlockRenderer: AzeBlockRenderer<ExampleBlock> =
  Object.freeze({
    descriptor: blockRendererDescriptor,
    render: renderExampleFragment,
  });
