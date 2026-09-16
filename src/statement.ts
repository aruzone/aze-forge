import {
  STATEMENT_PLUGIN_TYPE,
  STATEMENT_PLUGIN_VERSION,
  STATEMENT_BODY_SYNTAX_ID,
  STATEMENT_BODY_SYNTAX_VERSION,
  statementSourceSchema,
  statementDataSchema,
} from "./statement-schemas.js";
import { createDiagnostic } from "./diagnostics.js";
import { parseCompositionHeader, type HeaderEntry } from "./block-header.js";
import {
  escapeAttribute,
  numberingLabelHtml,
  renderInlineHtml,
} from "./html-fragment.js";
import {
  rangeFromLineSlice,
  rangeFromLines,
  type SourceLine,
} from "./source-map.js";
import type {
  AzeBlock,
  AzeBlockPlugin,
  AzeBlockRenderer,
  BlockRendererContext,
  Diagnostic,
  Inline,
  JsonValue,
  ParsedBlock,
  RelatedLocation,
  SourceRange,
  StatementBlock,
  StatementKind,
} from "./model.js";

/**
 * Theorem-family statements with at most one authored proof (contract:
 * issue #66 §7). The QED mark is renderer-derived and never authored.
 *
 * Body: `text:` (required) and `proof:` (optional), each a `|` multiline
 * Markdown field reading one structural level (issue #52 §5). Content is
 * dedented by the field's own indentation plus two spaces — preserving
 * additional indentation — and handed to the caller's `parseBlocks`, so
 * contained `:: equation` and `:: derivation` directives are legal and number
 * by their own fields. At most one proof exists, and it is contained, never
 * referenced.
 *
 * Diagnostics: `#unknown-kind`, `#missing-text` and `#empty-proof` are the
 * registered family codes. A header without the required `kind:` reports the
 * shared `#missing-field`; an unsupported body field `#unknown-field`, a
 * repeated one `#duplicate-field`, a `text:`/`proof:` that is not a `|` field
 * `#invalid-field`, and each Markdown ceiling the shared `#limit-exceeded`.
 */

export const STATEMENT_HTML_BLOCK_RENDERER_ID =
  "azeforge.statement.html/v1" as const;
export const STATEMENT_HTML_BLOCK_RENDERER_VERSION = "1.0.0" as const;

export const STATEMENT_KINDS = Object.freeze([
  "theorem",
  "definition",
  "lemma",
  "corollary",
  "proposition",
  "remark",
] as const);

/** The statement-specific header keys; `id`, `number` and `caption` are shared. */
export const STATEMENT_HEADER_FIELDS: readonly string[] = Object.freeze(["kind"]);

export const MAX_STATEMENT_MARKDOWN_CHARS = 20000;

const STATEMENT_NAMESPACE = "azeforge.statement";
const BLANK = /^[ \t]*$/;
const STRUCTURAL_COMMENT = /^[ \t]*\/\/(?:[ \t].*)?$/;
const BODY_DECLARATION = /^([A-Za-z][A-Za-z0-9-]*)[ \t]*:(.*)$/;
const MULTILINE_MARKER = "|";

/** The capitalized kind word the caption's bold kind span renders. */
const STATEMENT_KIND_WORDS: Readonly<Record<StatementKind, string>> =
  Object.freeze({
    theorem: "Theorem",
    definition: "Definition",
    lemma: "Lemma",
    corollary: "Corollary",
    proposition: "Proposition",
    remark: "Remark",
  });

const pluginDescriptor = Object.freeze({
  type: STATEMENT_PLUGIN_TYPE,
  version: STATEMENT_PLUGIN_VERSION,
  title: "Statement",
  summary: "A theorem-family statement with an optional authored proof.",
  diagnosticNamespace: "azeforge.statement",
  sourceSchema: statementSourceSchema,
  bodySyntax: Object.freeze({
    id: STATEMENT_BODY_SYNTAX_ID,
    version: STATEMENT_BODY_SYNTAX_VERSION,
  }),
  dataSchema: statementDataSchema,
});

export const statementPlugin: AzeBlockPlugin = Object.freeze({
  descriptor: pluginDescriptor,
});

const blockRendererDescriptor = Object.freeze({
  id: STATEMENT_HTML_BLOCK_RENDERER_ID,
  version: STATEMENT_HTML_BLOCK_RENDERER_VERSION,
  blockType: STATEMENT_PLUGIN_TYPE,
  pluginVersionRange: STATEMENT_PLUGIN_VERSION,
  rendererId: "html",
  rendererVersionRange: "1.0.0",
});

function statementDiagnostic(
  code: string,
  message: string,
  range: SourceRange,
  sourceName: string | undefined,
  extra: {
    readonly suggestion?: string;
    readonly data?: Readonly<Record<string, JsonValue>>;
    readonly relatedLocations?: readonly RelatedLocation[];
  } = {},
): Diagnostic {
  return createDiagnostic(`${STATEMENT_NAMESPACE}#${code}`, "error", message, {
    location:
      sourceName === undefined ? { range } : { source: sourceName, range },
    ...(extra.suggestion === undefined ? {} : { suggestion: extra.suggestion }),
    ...(extra.data === undefined ? {} : { data: extra.data }),
    ...(extra.relatedLocations === undefined
      ? {}
      : { relatedLocations: extra.relatedLocations }),
  });
}

function relatedLocation(
  range: SourceRange,
  message: string,
  sourceName: string | undefined,
): RelatedLocation {
  return {
    range,
    message,
    ...(sourceName === undefined ? {} : { source: sourceName }),
  };
}

function lastEntryFor(
  entries: readonly HeaderEntry[],
  key: string,
): HeaderEntry | undefined {
  let found: HeaderEntry | undefined;
  for (const entry of entries) {
    if (entry.key === key) found = entry;
  }
  return found;
}

export interface StatementHeader {
  readonly id?: string;
  readonly number?: boolean;
  readonly caption?: readonly Inline[];
  readonly statementKind?: StatementKind;
  readonly diagnostics: readonly Diagnostic[];
}

export function parseStatementHeader(
  entries: readonly HeaderEntry[],
  blockRange: SourceRange,
  sourceName: string | undefined,
  parseCaption: (
    text: string,
    range: SourceRange,
  ) => readonly Inline[] | undefined,
): StatementHeader {
  const header = parseCompositionHeader(entries, sourceName, {
    namespace: STATEMENT_NAMESPACE,
    known: STATEMENT_HEADER_FIELDS,
    parseCaption,
  });
  const diagnostics = [...header.diagnostics];
  const kindEntry = lastEntryFor(entries, "kind");
  let statementKind: StatementKind | undefined;
  if (kindEntry === undefined) {
    diagnostics.push(
      statementDiagnostic(
        "missing-field",
        "A statement header requires `kind:`.",
        blockRange,
        sourceName,
        {
          data: { field: "kind" },
          suggestion: `Use one of ${STATEMENT_KINDS.join(", ")}.`,
        },
      ),
    );
  } else if ((STATEMENT_KINDS as readonly string[]).includes(kindEntry.value)) {
    statementKind = kindEntry.value as StatementKind;
  } else {
    diagnostics.push(
      statementDiagnostic(
        "unknown-kind",
        `Statement kind "${kindEntry.value}" is not supported.`,
        kindEntry.range,
        sourceName,
        {
          data: { kind: kindEntry.value },
          suggestion: `Use one of ${STATEMENT_KINDS.join(", ")}.`,
        },
      ),
    );
  }
  return {
    diagnostics,
    ...(header.id === undefined ? {} : { id: header.id }),
    ...(header.number === undefined ? {} : { number: header.number }),
    ...(header.caption === undefined ? {} : { caption: header.caption }),
    ...(statementKind === undefined ? {} : { statementKind }),
  };
}

export interface StatementBody {
  readonly statementKind: StatementKind;
  readonly text: readonly ParsedBlock[];
  readonly proof?: readonly ParsedBlock[];
}

export interface StatementBodyResult {
  readonly body?: StatementBody;
  readonly diagnostics: readonly Diagnostic[];
}

export interface StatementBodyArgs {
  readonly header: StatementHeader;
  readonly bodyLines: readonly SourceLine[];
  readonly blockRange: SourceRange;
  readonly sourceName?: string;
  readonly parseBlocks: (
    lines: readonly SourceLine[],
  ) => readonly ParsedBlock[] | undefined;
}

/** One body declaration: the field's `|`-marker range and its content lines. */
interface StatementBodyField {
  readonly key: string;
  readonly declarationRange: SourceRange;
  readonly valueRange: SourceRange;
  readonly lines: readonly SourceLine[];
  readonly contentRange: SourceRange | undefined;
  readonly empty: boolean;
}

interface LiteralContent {
  readonly lines: readonly SourceLine[];
  readonly contentRange: SourceRange | undefined;
  readonly next: number;
  readonly empty: boolean;
}

/** Leading structural indentation in columns; a tab counts as one column. */
function indentation(text: string): { readonly columns: number; readonly tabbed: boolean } {
  let columns = 0;
  let tabbed = false;
  for (const character of text) {
    if (character === " ") {
      columns += 1;
    } else if (character === "\t") {
      tabbed = true;
      columns += 1;
    } else {
      break;
    }
  }
  return { columns, tabbed };
}

/**
 * Shift one line's indices past the removed structural prefix. The authored
 * text is the only text: the synthetic line keeps the original `number` and
 * the character/byte positions of the content that survives.
 */
function syntheticLine(
  original: SourceLine,
  text: string,
  prefixChars: number,
): SourceLine {
  return {
    number: original.number,
    text,
    startIndex: original.startIndex + prefixChars,
    endIndex: original.endIndex,
    startOffset:
      original.startOffset +
      Buffer.byteLength(original.text.slice(0, prefixChars), "utf8"),
    endOffset: original.endOffset,
  };
}

/**
 * Read one `|` multiline field: content indented one structural level beneath
 * its property, that level removed, additional indentation preserved, and
 * interior blank lines kept. Trailing blank lines belong to neither field.
 */
function readLiteralContent(
  bodyLines: readonly SourceLine[],
  start: number,
  propertyIndent: number,
): LiteralContent {
  const prefix = propertyIndent + 2;
  const content: SourceLine[] = [];
  let pendingBlanks: SourceLine[] = [];
  let first: SourceLine | undefined;
  let last: SourceLine | undefined;
  let index = start;
  while (index < bodyLines.length) {
    const line = bodyLines[index];
    if (line === undefined) break;
    if (BLANK.test(line.text)) {
      pendingBlanks.push(syntheticLine(line, "", 0));
      index += 1;
      continue;
    }
    const { columns } = indentation(line.text);
    if (columns <= propertyIndent) break;
    content.push(...pendingBlanks);
    pendingBlanks = [];
    const removed = Math.min(columns, prefix);
    const shifted = syntheticLine(line, line.text.slice(removed), removed);
    if (first === undefined) first = shifted;
    content.push(shifted);
    last = shifted;
    index += 1;
  }
  return {
    lines: content,
    contentRange:
      first === undefined || last === undefined
        ? undefined
        : rangeFromLines(first, last),
    next: index,
    empty: content.length === 0,
  };
}

function markdownChars(lines: readonly SourceLine[]): number {
  let count = 0;
  for (const [position, line] of lines.entries()) {
    if (position > 0) count += 1;
    count += [...line.text].length;
  }
  return count;
}

/**
 * Parse the statement body. Markdown flows through the caller's `parseBlocks`
 * on the dedented content lines, in authored order, exactly once per field;
 * `proof:` is contained content with no reference form.
 */
export function parseStatementBody(
  args: StatementBodyArgs,
): StatementBodyResult {
  const { header, bodyLines, blockRange, parseBlocks } = args;
  const sourceName = args.sourceName;
  const statementKind = header.statementKind;
  // The header owns the `kind:` fault; without one there is nothing to build.
  if (statementKind === undefined) return { diagnostics: [] };

  const diagnostics: Diagnostic[] = [];
  let textDeclared = false;
  let textField: StatementBodyField | undefined;
  let proofField: StatementBodyField | undefined;
  const bodyRange =
    bodyLines.length === 0
      ? blockRange
      : rangeFromLines(
          bodyLines[0] as SourceLine,
          bodyLines[bodyLines.length - 1] as SourceLine,
        );
  let bodyIndent: number | undefined;
  let cursor = 0;
  // One fault reports once: a rejected declaration still consumes its content.
  const nextAfterField = (
    index: number,
    propertyIndent: number,
    multiline: boolean,
  ): number =>
    multiline
      ? readLiteralContent(bodyLines, index + 1, propertyIndent).next
      : index + 1;
  while (cursor < bodyLines.length) {
    const line = bodyLines[cursor];
    if (line === undefined) break;
    if (BLANK.test(line.text) || STRUCTURAL_COMMENT.test(line.text)) {
      cursor += 1;
      continue;
    }
    const { columns, tabbed } = indentation(line.text);
    if (tabbed) {
      diagnostics.push(
        statementDiagnostic(
          "invalid-field",
          "Statement body declarations indent with spaces only, two per structural level.",
          rangeFromLines(line, line),
          sourceName,
        ),
      );
      cursor += 1;
      continue;
    }
    if (bodyIndent === undefined) bodyIndent = columns;
    const declaration = BODY_DECLARATION.exec(line.text.slice(columns));
    if (declaration === null || columns !== bodyIndent) {
      diagnostics.push(
        statementDiagnostic(
          "unknown-field",
          "Statement body declarations use the shared `key:` form.",
          rangeFromLineSlice(line, columns, line.text.length),
          sourceName,
        ),
      );
      cursor += 1;
      continue;
    }
    const key = declaration[1] ?? "";
    const rawValue = declaration[2] ?? "";
    const leading = rawValue.length - rawValue.trimStart().length;
    const value = rawValue.trim();
    const valueStart = line.text.length - rawValue.length + leading;
    const keyRange = rangeFromLineSlice(line, columns, columns + key.length);
    const valueRange = rangeFromLineSlice(
      line,
      valueStart,
      valueStart + value.length,
    );
    if (key !== "text" && key !== "proof") {
      diagnostics.push(
        statementDiagnostic(
          "unknown-field",
          `Statement body field "${key}" is not supported.`,
          keyRange,
          sourceName,
          { data: { field: key }, suggestion: "Use text or proof." },
        ),
      );
      cursor = nextAfterField(cursor, columns, value === MULTILINE_MARKER);
      continue;
    }
    if (key === "text") textDeclared = true;
    const previous = key === "text" ? textField : proofField;
    if (previous !== undefined) {
      diagnostics.push(
        statementDiagnostic(
          "duplicate-field",
          `Statement body field "${key}" is declared twice.`,
          keyRange,
          sourceName,
          {
            data: { field: key },
            relatedLocations: [
              relatedLocation(
                previous.declarationRange,
                `"${key}" was first declared here.`,
                sourceName,
              ),
            ],
          },
        ),
      );
      cursor = nextAfterField(cursor, columns, value === MULTILINE_MARKER);
      continue;
    }
    let field: StatementBodyField;
    if (value !== MULTILINE_MARKER) {
      if (value.length === 0) {
        // Present with no content at all: the field's own emptiness rule applies.
        field = {
          key,
          declarationRange: keyRange,
          valueRange,
          lines: [],
          contentRange: undefined,
          empty: true,
        };
      } else {
        diagnostics.push(
          statementDiagnostic(
            "invalid-field",
            `Statement field "${key}" is a \`|\` multiline Markdown field.`,
            valueRange,
            sourceName,
            { data: { field: key } },
          ),
        );
        cursor = nextAfterField(cursor, columns, value === MULTILINE_MARKER);
        continue;
      }
    } else {
      const literal = readLiteralContent(bodyLines, cursor + 1, columns);
      field = {
        key,
        declarationRange: keyRange,
        valueRange,
        lines: literal.lines,
        contentRange: literal.contentRange,
        empty: literal.empty,
      };
      cursor = literal.next;
      if (key === "text") textField = field;
      else proofField = field;
      continue;
    }
    if (key === "text") textField = field;
    else proofField = field;
    cursor += 1;
  }

  if (textField === undefined) {
    if (!textDeclared) {
      diagnostics.push(
        statementDiagnostic(
          "missing-text",
          "A statement requires a `text:` field.",
          bodyRange,
          sourceName,
          {
            data: { field: "text" },
            suggestion: "Add the statement as a `text: |` Markdown field.",
          },
        ),
      );
    }
  } else if (textField.empty) {
    diagnostics.push(
      statementDiagnostic(
        "missing-text",
        "Statement `text:` must contain Markdown content.",
        textField.valueRange,
        sourceName,
        {
          data: { field: "text" },
          suggestion: "Add the statement as a `text: |` Markdown field.",
        },
      ),
    );
  }
  if (proofField !== undefined && proofField.empty) {
    diagnostics.push(
      statementDiagnostic(
        "empty-proof",
        "Statement `proof:` is present but empty.",
        proofField.contentRange ?? proofField.valueRange,
        sourceName,
        {
          data: { field: "proof" },
          suggestion: "Remove the empty `proof:` field, or author the proof.",
        },
      ),
    );
  }
  for (const authored of [textField, proofField]) {
    if (authored === undefined || authored.empty) continue;
    const count = markdownChars(authored.lines);
    if (count > MAX_STATEMENT_MARKDOWN_CHARS) {
      diagnostics.push(
        statementDiagnostic(
          "limit-exceeded",
          `A statement Block's ${authored.key} Markdown ${count} characters exceeds ${MAX_STATEMENT_MARKDOWN_CHARS}.`,
          authored.contentRange ?? authored.valueRange,
          sourceName,
          {
            data: {
              subject: authored.key,
              count,
              limit: MAX_STATEMENT_MARKDOWN_CHARS,
            },
          },
        ),
      );
    }
  }
  if (diagnostics.length > 0) return { diagnostics };

  if (textField === undefined) return { diagnostics };
  const text = parseBlocks(textField.lines);
  if (text === undefined) return { diagnostics };
  const proof =
    proofField === undefined ? undefined : parseBlocks(proofField.lines);
  if (proofField !== undefined && proof === undefined) return { diagnostics };
  return {
    diagnostics,
    body: {
      statementKind,
      text,
      ...(proof === undefined ? {} : { proof }),
    },
  };
}

/**
 * Render the statement as a real `<figure>`: the caption prefixed by the
 * resolved numbering label when the statement is numbered (the label already
 * spells the kind, so the kind word is never repeated), or by the bold kind
 * word when it is not, then the statement Markdown, then the contained proof
 * indented and closed by the renderer-derived QED mark. The authored `id` never
 * becomes an element `id`; it is published as a data attribute for consumers.
 */
export function renderStatementFragment(
  block: StatementBlock,
  context: BlockRendererContext,
): string {
  const labelled = block.numberLabel !== undefined && block.numberLabel !== "";
  const caption =
    block.caption === undefined || block.caption.length === 0
      ? ""
      : renderInlineHtml(block.caption);
  const hasCaption = caption !== "";
  const kind = STATEMENT_KIND_WORDS[block.statementKind];
  const prefix = labelled
    ? numberingLabelHtml(block.numberLabel).trimEnd()
    : `<strong><span class="aze-statement-kind">${kind}</span></strong>`;
  const figcaption =
    labelled || hasCaption
      ? `<figcaption>${prefix}${hasCaption ? ` ${caption}` : ""}</figcaption>`
      : "";
  const attributes =
    (block.id === undefined
      ? ""
      : ` data-statement-id="${escapeAttribute(block.id)}"`) +
    (block.number === true ? ' data-statement-number="true"' : "") +
    ` data-statement-kind="${escapeAttribute(block.statementKind)}"`;
  const text = context.renderBlocks(block.text as readonly AzeBlock[]);
  const proof =
    block.proof === undefined
      ? ""
      : `<div class="aze-statement-proof">${context.renderBlocks(block.proof as readonly AzeBlock[])}<span class="aze-statement-qed">&#9633;</span></div>`;
  return `<figure class="aze-statement"${attributes}>${figcaption}${text}${proof}</figure>`;
}

export const statementHtmlBlockRenderer: AzeBlockRenderer<StatementBlock> =
  Object.freeze({
    descriptor: blockRendererDescriptor,
    render: renderStatementFragment,
  });
