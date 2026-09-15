import {
  BIBLIOGRAPHY_PLUGIN_TYPE,
  BIBLIOGRAPHY_PLUGIN_VERSION,
  BIBLIOGRAPHY_BODY_SYNTAX_ID,
  BIBLIOGRAPHY_BODY_SYNTAX_VERSION,
  bibliographySourceSchema,
  bibliographyDataSchema,
} from "./bibliography-schemas.js";
import { parseCompositionHeader, type HeaderEntry } from "./block-header.js";
import { createDiagnostic } from "./diagnostics.js";
import { escapeAttribute, escapeHtml, renderInlineHtml } from "./html-fragment.js";
import { isSafeLinkTarget } from "./markdown.js";
import { rangeFromLines, type SourceLine } from "./source-map.js";
import type {
  AzeBlockPlugin,
  AzeBlockRenderer,
  BibliographyAuthor,
  BibliographyBlock,
  BibliographyEntry,
  BibliographyEntryType,
  BlockRendererContext,
  CitationStyle,
  Diagnostic,
  Inline,
  JsonValue,
  RelatedLocation,
  SourceRange,
} from "./model.js";

/**
 * The document-local Bibliography directive (contract: issue #67 §7). One
 * directive per document; records use the shared `-` item syntax of the
 * language contract (§4: two spaces per structural level, `name:` opens a
 * nested structure only where the schema permits it) and the closed
 * citation-record field set. The body is declarations, never YAML.
 *
 * Reading posture: `key:`, `type:` and `title:` are required; `authors:` is an
 * ordered collection of `- name:` records with an optional literal `family:`
 * sort/label key; `year:` is an integer or the one registered `unspecified`
 * spelling. Every other field is optional literal text, and `url:` must
 * satisfy the shared safe-link policy. A double-quoted value decodes §4
 * JSON escapes; every value is single-line, so a `|` multiline marker is
 * refused rather than guessed. Authors are literal display text: a surname is
 * never parsed out of `name:` (the author-year check is composition's).
 *
 * Diagnostics are the `azeforge.citation#` registry, every one source-ranged
 * to the field or record that caused it. Structural faults are errors: a
 * faulted body publishes no entries (fail-closed). Duplicate `key:` values
 * inside one block carry the earlier declaration as a relatedLocation. The
 * entry ceiling (512) is a fail-closed error and zero entries is legal and
 * silent.
 */

export const BIBLIOGRAPHY_HTML_BLOCK_RENDERER_ID =
  "azeforge.bibliography.html/v1" as const;
export const BIBLIOGRAPHY_HTML_BLOCK_RENDERER_VERSION = "1.0.0" as const;

export const BIBLIOGRAPHY_ENTRY_TYPES = Object.freeze([
  "article",
  "book",
  "chapter",
  "report",
  "thesis",
  "web",
  "software",
  "standard",
  "other",
] as const);

/** The diagnostic registry this module reports in (contract: issue #67 §11). */
export const BIBLIOGRAPHY_NAMESPACE = "azeforge.citation" as const;

/** The fail-closed entry ceiling (contract: issue #67 §11). */
export const MAX_BIBLIOGRAPHY_ENTRIES = 512;

/** Single-line text ceilings: a bound on authored input, never a truncation. */
export const MAX_CITATION_TEXT_CHARS = 2000;
export const MAX_CITATION_NAME_CHARS = 200;

/** The closed citation-record field set, in declaration order. */
export const BIBLIOGRAPHY_ENTRY_FIELDS = Object.freeze([
  "key",
  "type",
  "title",
  "authors",
  "year",
  "venue",
  "publisher",
  "edition",
  "pages",
  "url",
  "doi",
  "note",
]);

/** The closed author-record field set. */
export const BIBLIOGRAPHY_AUTHOR_FIELDS = Object.freeze(["name", "family"]);

const pluginDescriptor = Object.freeze({
  type: BIBLIOGRAPHY_PLUGIN_TYPE,
  version: BIBLIOGRAPHY_PLUGIN_VERSION,
  title: "Bibliography",
  summary: "One document-local bibliography of closed-field citation records.",
  diagnosticNamespace: BIBLIOGRAPHY_NAMESPACE,
  sourceSchema: bibliographySourceSchema,
  bodySyntax: Object.freeze({
    id: BIBLIOGRAPHY_BODY_SYNTAX_ID,
    version: BIBLIOGRAPHY_BODY_SYNTAX_VERSION,
  }),
  dataSchema: bibliographyDataSchema,
});

export const bibliographyPlugin: AzeBlockPlugin = Object.freeze({
  descriptor: pluginDescriptor,
});

const blockRendererDescriptor = Object.freeze({
  id: BIBLIOGRAPHY_HTML_BLOCK_RENDERER_ID,
  version: BIBLIOGRAPHY_HTML_BLOCK_RENDERER_VERSION,
  blockType: BIBLIOGRAPHY_PLUGIN_TYPE,
  pluginVersionRange: BIBLIOGRAPHY_PLUGIN_VERSION,
  rendererId: "html",
  rendererVersionRange: "1.0.0",
});

export interface BibliographyHeader {
  readonly id?: string;
  readonly number?: boolean;
  readonly caption?: readonly Inline[];
  readonly diagnostics: readonly Diagnostic[];
}

export function parseBibliographyHeader(
  entries: readonly HeaderEntry[],
  _blockRange: SourceRange,
  sourceName: string | undefined,
  parseCaption: (
    text: string,
    range: SourceRange,
  ) => readonly Inline[] | undefined,
): BibliographyHeader {
  const header = parseCompositionHeader(entries, sourceName, {
    namespace: "azeforge.bibliography",
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

/* ------------------------------------------------------------------ *
 * Diagnostics
 * ------------------------------------------------------------------ */

interface DiagnosticExtra {
  readonly data?: Readonly<Record<string, JsonValue>>;
  readonly suggestion?: string;
  readonly relatedLocations?: readonly RelatedLocation[];
}

function citationDiagnostic(
  code: string,
  message: string,
  range: SourceRange,
  sourceName: string | undefined,
  extra: DiagnosticExtra = {},
): Diagnostic {
  return createDiagnostic(`${BIBLIOGRAPHY_NAMESPACE}#${code}`, "error", message, {
    location: sourceName === undefined ? { range } : { source: sourceName, range },
    ...(extra.data === undefined ? {} : { data: extra.data }),
    ...(extra.suggestion === undefined ? {} : { suggestion: extra.suggestion }),
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
    ...(sourceName === undefined ? {} : { source: sourceName }),
    range,
    message,
  };
}

/* ------------------------------------------------------------------ *
 * Body reading
 * ------------------------------------------------------------------ */

/** A significant body line: blank lines and structural comments never reach here. */
interface BodyLine {
  readonly text: string;
  readonly indent: number;
  readonly range: SourceRange;
  readonly line: SourceLine;
}

interface RawField {
  readonly key: string;
  readonly value: string;
  readonly range: SourceRange;
  /** Present only for a declared `authors:` collection. */
  readonly authors?: readonly RawAuthor[];
}

interface RawAuthor {
  readonly fields: readonly RawField[];
  readonly range: SourceRange;
}

interface RawRecord {
  readonly fields: readonly RawField[];
  readonly range: SourceRange;
}

interface BodySink {
  readonly diagnostics: Diagnostic[];
  readonly sourceName: string | undefined;
}

const FIELD = /^([A-Za-z][A-Za-z0-9-]*)[ \t]*:(.*)$/;
const ITEM = /^-([ \t]*)(.*)$/;
const COMMENT = /^[ \t]*\/\/(?:[ \t].*)?$/;
/** The shared lowercase-kebab identifier grammar (language contract §6). */
const LOWER_KEBAB = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const YEAR = /^[0-9]+$/;

function codePoints(value: string): number {
  return [...value].length;
}

function leadingIndent(text: string): number | undefined {
  let indent = 0;
  for (const character of text) {
    if (character === " ") indent += 1;
    else if (character === "\t") return undefined;
    else return indent;
  }
  return indent;
}

function fault(sink: BodySink, message: string, range: SourceRange): void {
  sink.diagnostics.push(
    citationDiagnostic("invalid-entry", message, range, sink.sourceName),
  );
}

/** Decode one authored value: double-quoted JSON-escape form, else literal text. */
function decodeText(raw: string): { readonly value: string; readonly invalid: boolean } {
  if (!raw.startsWith('"')) return { value: raw, invalid: false };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "string") return { value: raw, invalid: true };
    return { value: parsed, invalid: false };
  } catch {
    return { value: raw, invalid: true };
  }
}

/**
 * Ordered `- name:` author records at exactly `itemIndent`, their own fields
 * one structural level in. Author records never nest further: `name:` and
 * `family:` are literal single-line text.
 */
function readAuthorCollection(
  lines: readonly BodyLine[],
  start: number,
  itemIndent: number,
  sink: BodySink,
): { readonly authors: readonly RawAuthor[]; readonly next: number; readonly end: number } {
  const authors: RawAuthor[] = [];
  const fieldIndent = itemIndent + 2;
  let index = start;
  let end = start - 1;
  while (index < lines.length) {
    const line = lines[index];
    if (line === undefined) break;
    if (line.indent < itemIndent) break;
    if (line.indent > itemIndent) {
      fault(
        sink,
        `Expected a \`- name:\` author record at indentation ${itemIndent}.`,
        line.range,
      );
      index += 1;
      continue;
    }
    const item = ITEM.exec(line.text.slice(itemIndent));
    if (item === null) {
      fault(sink, "Expected a `- name:` author record.", line.range);
      index += 1;
      continue;
    }
    const fields: RawField[] = [];
    let itemEnd = index;
    const content = (item[2] ?? "").trim();
    if (content !== "") {
      const match = FIELD.exec(content);
      if (match === null) {
        fault(sink, "Expected a `name: value` author field.", line.range);
      } else {
        fields.push({
          key: (match[1] ?? "").toLowerCase(),
          value: (match[2] ?? "").trim(),
          range: line.range,
        });
      }
    }
    index += 1;
    while (index < lines.length) {
      const fieldLine = lines[index];
      if (fieldLine === undefined) break;
      if (fieldLine.indent < fieldIndent) break;
      if (fieldLine.indent > fieldIndent) {
        fault(
          sink,
          `Expected a \`name: value\` author field at indentation ${fieldIndent}.`,
          fieldLine.range,
        );
        index += 1;
        continue;
      }
      const match = FIELD.exec(fieldLine.text.slice(fieldIndent));
      if (match === null) {
        fault(sink, "Expected a `name: value` author field.", fieldLine.range);
        index += 1;
        continue;
      }
      fields.push({
        key: (match[1] ?? "").toLowerCase(),
        value: (match[2] ?? "").trim(),
        range: fieldLine.range,
      });
      itemEnd = index;
      index += 1;
    }
    if (fields.length === 0) {
      fault(
        sink,
        "An author record requires at least a `name:` field.",
        rangeFromLines(line.line, line.line),
      );
    }
    authors.push({
      fields,
      range: rangeFromLines(line.line, (lines[itemEnd] ?? line).line),
    });
    end = itemEnd;
  }
  return { authors, next: index, end };
}

/** One `- key: value` citation record: the item line plus its own fields. */
function readRecord(
  lines: readonly BodyLine[],
  start: number,
  itemLine: BodyLine,
  itemIndent: number,
  sink: BodySink,
): { readonly record: RawRecord; readonly next: number } {
  const fields: RawField[] = [];
  const fieldIndent = itemIndent + 2;
  let end = start;
  let index = start + 1;
  let pending: { readonly key: string; readonly value: string; readonly range: SourceRange } | undefined;
  const item = ITEM.exec(itemLine.text.slice(itemIndent));
  const content = item === null ? "" : (item[2] ?? "").trim();
  if (content !== "") {
    const match = FIELD.exec(content);
    if (match === null) {
      fault(sink, "Expected a `key: value` citation field.", itemLine.range);
    } else {
      pending = {
        key: (match[1] ?? "").toLowerCase(),
        value: (match[2] ?? "").trim(),
        range: itemLine.range,
      };
    }
  }
  while (pending !== undefined || index < lines.length) {
    if (pending === undefined) {
      const line = lines[index];
      if (line === undefined) break;
      if (line.indent < fieldIndent) break;
      if (line.indent > fieldIndent) {
        fault(
          sink,
          `Expected a \`key: value\` citation field at indentation ${fieldIndent}.`,
          line.range,
        );
        index += 1;
        continue;
      }
      const match = FIELD.exec(line.text.slice(fieldIndent));
      if (match === null) {
        fault(sink, "Expected a `key: value` citation field.", line.range);
        index += 1;
        continue;
      }
      pending = {
        key: (match[1] ?? "").toLowerCase(),
        value: (match[2] ?? "").trim(),
        range: line.range,
      };
      end = index;
      index += 1;
    }
    const intro = pending;
    pending = undefined;
    if (intro.key === "authors" && intro.value === "") {
      const collection = readAuthorCollection(lines, index, fieldIndent + 2, sink);
      fields.push({
        key: intro.key,
        value: "",
        range: intro.range,
        authors: collection.authors,
      });
      index = collection.next;
      if (collection.end >= start) end = Math.max(end, collection.end);
      continue;
    }
    fields.push({ key: intro.key, value: intro.value, range: intro.range });
  }
  return {
    record: {
      fields,
      range: rangeFromLines(itemLine.line, (lines[end] ?? itemLine).line),
    },
    next: index,
  };
}

/* ------------------------------------------------------------------ *
 * Field readers
 * ------------------------------------------------------------------ */

function fieldByName(
  fields: readonly RawField[],
  key: string,
): RawField | undefined {
  return fields.find((field) => field.key === key);
}

function missingField(
  sink: BodySink,
  field: string,
  recordRange: SourceRange,
): void {
  sink.diagnostics.push(
    citationDiagnostic(
      "missing-field",
      `A citation record requires a \`${field}:\` value.`,
      recordRange,
      sink.sourceName,
      { data: { field } },
    ),
  );
}

function invalidText(
  sink: BodySink,
  field: string,
  message: string,
  range: SourceRange,
): void {
  sink.diagnostics.push(
    citationDiagnostic("invalid-text", message, range, sink.sourceName, {
      data: { field },
    }),
  );
}

/**
 * One literal single-line text field. Declared-but-empty is not unspecified
 * (language contract §4): a required field reports `missing-field`, an
 * optional one `invalid-text`, and neither is silently repaired.
 */
function readText(
  sink: BodySink,
  fields: readonly RawField[],
  key: string,
  required: boolean,
  recordRange: SourceRange,
  limit: number = MAX_CITATION_TEXT_CHARS,
): string | undefined {
  const field = fieldByName(fields, key);
  if (field === undefined) {
    if (required) missingField(sink, key, recordRange);
    return undefined;
  }
  if (field.authors !== undefined) {
    invalidText(
      sink,
      key,
      `Citation field "${key}" requires a single-line value.`,
      field.range,
    );
    return undefined;
  }
  if (field.value === "|") {
    invalidText(
      sink,
      key,
      `Citation field "${key}" is single-line; a multiline \`|\` value is not supported.`,
      field.range,
    );
    return undefined;
  }
  const decoded = decodeText(field.value);
  if (decoded.invalid) {
    invalidText(
      sink,
      key,
      `Citation field "${key}" is not a well-formed quoted value.`,
      field.range,
    );
    return undefined;
  }
  const value = decoded.value;
  if (value === "") {
    if (required) missingField(sink, key, recordRange);
    else
      invalidText(
        sink,
        key,
        `Citation field "${key}" is declared without a value.`,
        field.range,
      );
    return undefined;
  }
  if (codePoints(value) > limit) {
    sink.diagnostics.push(
      citationDiagnostic(
        "invalid-text",
        `Citation field "${key}" is ${codePoints(value)} characters; the ceiling is ${limit}.`,
        field.range,
        sink.sourceName,
        { data: { field: key, count: codePoints(value), limit } },
      ),
    );
    return undefined;
  }
  return value;
}

function readKey(
  sink: BodySink,
  fields: readonly RawField[],
  recordRange: SourceRange,
): { readonly key: string; readonly range: SourceRange } | undefined {
  const value = readText(sink, fields, "key", true, recordRange);
  if (value === undefined) return undefined;
  const range = fieldByName(fields, "key")?.range ?? recordRange;
  if (!LOWER_KEBAB.test(value)) {
    sink.diagnostics.push(
      citationDiagnostic(
        "invalid-key",
        `Citation key "${value}" must be lowercase-kebab; display labels never establish identity.`,
        range,
        sink.sourceName,
        { data: { field: "key", value } },
      ),
    );
    return undefined;
  }
  return { key: value, range };
}

function readType(
  sink: BodySink,
  fields: readonly RawField[],
  recordRange: SourceRange,
): BibliographyEntryType | undefined {
  const value = readText(sink, fields, "type", true, recordRange);
  if (value === undefined) return undefined;
  if (!(BIBLIOGRAPHY_ENTRY_TYPES as readonly string[]).includes(value)) {
    sink.diagnostics.push(
      citationDiagnostic(
        "invalid-type",
        `Citation type "${value}" is not a registered entry type.`,
        fieldByName(fields, "type")?.range ?? recordRange,
        sink.sourceName,
        {
          data: {
            field: "type",
            value,
            registered: [...BIBLIOGRAPHY_ENTRY_TYPES],
          },
          suggestion: `Registered citation types: ${BIBLIOGRAPHY_ENTRY_TYPES.join(", ")}.`,
        },
      ),
    );
    return undefined;
  }
  return value as BibliographyEntryType;
}

function readYear(
  sink: BodySink,
  fields: readonly RawField[],
  recordRange: SourceRange,
): string | undefined {
  const value = readText(sink, fields, "year", false, recordRange);
  if (value === undefined) return undefined;
  if (value !== "unspecified" && !YEAR.test(value)) {
    sink.diagnostics.push(
      citationDiagnostic(
        "invalid-year",
        `Citation year "${value}" must be an integer or \`unspecified\`.`,
        fieldByName(fields, "year")?.range ?? recordRange,
        sink.sourceName,
        {
          data: { field: "year", value },
          suggestion: "Write an integer year, or `unspecified` for an unknown date.",
        },
      ),
    );
    return undefined;
  }
  return value;
}

function readUrl(
  sink: BodySink,
  fields: readonly RawField[],
  recordRange: SourceRange,
): string | undefined {
  const value = readText(sink, fields, "url", false, recordRange);
  if (value === undefined) return undefined;
  if (!isSafeLinkTarget(value)) {
    sink.diagnostics.push(
      citationDiagnostic(
        "unsafe-url",
        `Citation url "${value}" is not a permitted link target.`,
        fieldByName(fields, "url")?.range ?? recordRange,
        sink.sourceName,
        {
          data: { field: "url", value },
          suggestion: "Only http, https, mailto, fragment and relative targets are permitted.",
        },
      ),
    );
    return undefined;
  }
  return value;
}

function readAuthors(
  sink: BodySink,
  fields: readonly RawField[],
  recordRange: SourceRange,
): readonly BibliographyAuthor[] {
  const field = fieldByName(fields, "authors");
  if (field === undefined) return [];
  if (field.authors === undefined) {
    sink.diagnostics.push(
      citationDiagnostic(
        "invalid-entry",
        'Citation field "authors" requires an ordered collection of `- name:` records.',
        field.range,
        sink.sourceName,
        { data: { field: "authors" } },
      ),
    );
    return [];
  }
  if (field.authors.length === 0) {
    sink.diagnostics.push(
      citationDiagnostic(
        "invalid-entry",
        'Citation field "authors" requires at least one `- name:` record.',
        field.range,
        sink.sourceName,
        { data: { field: "authors" } },
      ),
    );
    return [];
  }
  const authors: BibliographyAuthor[] = [];
  for (const author of field.authors) {
    const known: RawField[] = [];
    for (const entry of author.fields) {
      if (!BIBLIOGRAPHY_AUTHOR_FIELDS.includes(entry.key)) {
        sink.diagnostics.push(
          citationDiagnostic(
            "unknown-field",
            `Author field "${entry.key}" is not supported.`,
            entry.range,
            sink.sourceName,
            {
              data: { field: entry.key },
              suggestion: `Registered author fields: ${BIBLIOGRAPHY_AUTHOR_FIELDS.join(", ")}.`,
            },
          ),
        );
        continue;
      }
      const first = known.find((candidate) => candidate.key === entry.key);
      if (first !== undefined) {
        sink.diagnostics.push(
          citationDiagnostic(
            "duplicate-field",
            `Author field "${entry.key}" is declared twice.`,
            entry.range,
            sink.sourceName,
            {
              data: { field: entry.key },
              relatedLocations: [
                relatedLocation(
                  first.range,
                  `"${entry.key}" is first declared here.`,
                  sink.sourceName,
                ),
              ],
            },
          ),
        );
        continue;
      }
      known.push(entry);
    }
    const nameRange = fieldByName(known, "name")?.range ?? recordRange;
    const name = readText(sink, known, "name", true, nameRange, MAX_CITATION_NAME_CHARS);
    const family = readText(
      sink,
      known,
      "family",
      false,
      author.range,
      MAX_CITATION_NAME_CHARS,
    );
    if (name === undefined) continue;
    authors.push({
      name,
      ...(family === undefined ? {} : { family }),
    });
  }
  return authors;
}

/** One citation record; the returned `keyRange` is the `key:` field's own range. */
function readEntry(
  sink: BodySink,
  record: RawRecord,
): { readonly entry: BibliographyEntry; readonly keyRange: SourceRange } | undefined {
  const before = sink.diagnostics.length;
  const known: RawField[] = [];
  for (const field of record.fields) {
    if (!BIBLIOGRAPHY_ENTRY_FIELDS.includes(field.key)) {
      sink.diagnostics.push(
        citationDiagnostic(
          "unknown-field",
          `Citation field "${field.key}" is not supported.`,
          field.range,
          sink.sourceName,
          {
            data: { field: field.key },
            suggestion: `Registered citation fields: ${BIBLIOGRAPHY_ENTRY_FIELDS.join(", ")}.`,
          },
        ),
      );
      continue;
    }
    const first = known.find((candidate) => candidate.key === field.key);
    if (first !== undefined) {
      sink.diagnostics.push(
        citationDiagnostic(
          "duplicate-field",
          `Citation field "${field.key}" is declared twice.`,
          field.range,
          sink.sourceName,
          {
            data: { field: field.key },
            relatedLocations: [
              relatedLocation(
                first.range,
                `"${field.key}" is first declared here.`,
                sink.sourceName,
              ),
            ],
          },
        ),
      );
      continue;
    }
    known.push(field);
  }

  const key = readKey(sink, known, record.range);
  const entryType = readType(sink, known, record.range);
  const title = readText(sink, known, "title", true, record.range);
  const authors = readAuthors(sink, known, record.range);
  const year = readYear(sink, known, record.range);
  const venue = readText(sink, known, "venue", false, record.range);
  const publisher = readText(sink, known, "publisher", false, record.range);
  const edition = readText(sink, known, "edition", false, record.range);
  const pages = readText(sink, known, "pages", false, record.range);
  const url = readUrl(sink, known, record.range);
  const doi = readText(sink, known, "doi", false, record.range);
  const note = readText(sink, known, "note", false, record.range);

  if (
    sink.diagnostics.length !== before ||
    key === undefined ||
    entryType === undefined ||
    title === undefined
  ) {
    return undefined;
  }
  return {
    keyRange: key.range,
    entry: {
      key: key.key,
      entryType,
      title,
      authors,
      ...(year === undefined ? {} : { year }),
      ...(venue === undefined ? {} : { venue }),
      ...(publisher === undefined ? {} : { publisher }),
      ...(edition === undefined ? {} : { edition }),
      ...(pages === undefined ? {} : { pages }),
      ...(url === undefined ? {} : { url }),
      ...(doi === undefined ? {} : { doi }),
      ...(note === undefined ? {} : { note }),
      range: record.range,
    },
  };
}

export interface BibliographyBodyResult {
  readonly entries?: readonly BibliographyEntry[];
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Read one `:::: bibliography` body: an ordered collection of `- ` citation
 * records in the closed field set, at one structural indentation baseline.
 * Every record and field is checked, independent records keep validating
 * after a fault, and a faulted body publishes no entries.
 */
export function parseBibliographyBody(options: {
  readonly bodyLines: readonly SourceLine[];
  readonly blockRange: SourceRange;
  readonly sourceName?: string;
}): BibliographyBodyResult {
  const sink: BodySink = {
    diagnostics: [],
    sourceName: options.sourceName,
  };
  const lines: BodyLine[] = [];
  for (const line of options.bodyLines) {
    if (line.text.trim() === "") continue;
    if (COMMENT.test(line.text)) continue;
    const indent = leadingIndent(line.text);
    if (indent === undefined) {
      fault(
        sink,
        "Declarations indent with spaces only, two per structural level.",
        rangeFromLines(line, line),
      );
      continue;
    }
    lines.push({
      text: line.text,
      indent,
      range: rangeFromLines(line, line),
      line,
    });
  }
  const first = lines[0];
  if (first === undefined) return { entries: [], diagnostics: sink.diagnostics };
  const baseline = lines.reduce(
    (min, line) => Math.min(min, line.indent),
    first.indent,
  );

  const records: RawRecord[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (line === undefined) break;
    if (line.indent > baseline) {
      fault(
        sink,
        `Expected a \`- \` citation record at indentation ${baseline}.`,
        line.range,
      );
      index += 1;
      continue;
    }
    if (ITEM.exec(line.text.slice(baseline)) === null) {
      fault(
        sink,
        "Expected a `- ` citation record.",
        line.range,
      );
      index += 1;
      continue;
    }
    const before = sink.diagnostics.length;
    const read = readRecord(lines, index, line, baseline, sink);
    index = read.next;
    if (read.record.fields.length === 0) {
      if (sink.diagnostics.length === before) {
        fault(
          sink,
          "A citation record requires at least a `key:` field.",
          read.record.range,
        );
      }
      continue;
    }
    records.push(read.record);
  }

  const entries: BibliographyEntry[] = [];
  const declaredKeys = new Map<string, SourceRange>();
  for (const record of records) {
    const read = readEntry(sink, record);
    if (read === undefined) continue;
    const earlier = declaredKeys.get(read.entry.key);
    if (earlier !== undefined) {
      sink.diagnostics.push(
        citationDiagnostic(
          "duplicate-key",
          `Citation key "${read.entry.key}" is declared twice in this bibliography.`,
          read.keyRange,
          sink.sourceName,
          {
            data: { key: read.entry.key },
            relatedLocations: [
              relatedLocation(
                earlier,
                `"${read.entry.key}" is first declared here.`,
                sink.sourceName,
              ),
            ],
          },
        ),
      );
    } else {
      declaredKeys.set(read.entry.key, read.keyRange);
    }
    entries.push(read.entry);
  }

  if (entries.length > MAX_BIBLIOGRAPHY_ENTRIES) {
    const offending = entries[MAX_BIBLIOGRAPHY_ENTRIES];
    sink.diagnostics.push(
      citationDiagnostic(
        "limit-exceeded",
        `A bibliography holds at most ${MAX_BIBLIOGRAPHY_ENTRIES} entries; this one declares ${entries.length}.`,
        offending?.range ?? options.blockRange,
        sink.sourceName,
        {
          data: {
            subject: "bibliography-entries",
            limit: MAX_BIBLIOGRAPHY_ENTRIES,
            count: entries.length,
          },
        },
      ),
    );
  }

  if (sink.diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    return { diagnostics: sink.diagnostics };
  }
  return { entries, diagnostics: sink.diagnostics };
}

/* ------------------------------------------------------------------ *
 * Rendering
 * ------------------------------------------------------------------ */

/** The registered rendering of a year: an integer, or `n.d.` when unspecified. */
export function bibliographyYearLabel(year: string | undefined): string {
  if (year === undefined || year === "" || year === "unspecified") return "n.d.";
  return year;
}

/**
 * The author-year label an entry renders and disambiguates on: the first
 * author's `family:` ?? `name:`, then the rendered year (contract: issue #67
 * §8 groups colliding labels, `n.d.` included).
 */
function citationLabel(entry: BibliographyEntry): string {
  const first = entry.authors[0];
  const author = first === undefined ? "" : (first.family ?? first.name);
  const year = bibliographyYearLabel(entry.year);
  return author === "" ? year : `${author} ${year}`;
}

/** Bijective base-26 disambiguation suffixes: a, b, … z, aa, … */
function alphaSuffix(index: number): string {
  let value = index + 1;
  let suffix = "";
  while (value > 0) {
    const digit = (value - 1) % 26;
    suffix = String.fromCharCode(97 + digit) + suffix;
    value = Math.floor((value - 1) / 26);
  }
  return suffix;
}

/**
 * The citation labels for one rendered list, in the list's own order. Numeric
 * style labels each entry by its position; author-year labels it `Family year`
 * and suffixes colliding labels a/b/c in list order (contract: issue #67 §8).
 */
export function bibliographyCitationLabels(
  entries: readonly BibliographyEntry[],
  style: CitationStyle,
): readonly string[] {
  if (style !== "author-year") {
    return entries.map((_, index) => String(index + 1));
  }
  const totals = new Map<string, number>();
  for (const entry of entries) {
    const label = citationLabel(entry);
    totals.set(label, (totals.get(label) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  return entries.map((entry) => {
    const label = citationLabel(entry);
    const ordinal = seen.get(label) ?? 0;
    seen.set(label, ordinal + 1);
    if ((totals.get(label) ?? 0) < 2) return label;
    return `${label}${alphaSuffix(ordinal)}`;
  });
}

/**
 * The safe href for a DOI: the raw value when it already carries a scheme and
 * passes the shared policy, otherwise the registered `doi.org` resolver.
 * An unsafe value yields no link at all.
 */
function doiHref(doi: string): string | undefined {
  const trimmed = doi.trim();
  if (trimmed === "" || !isSafeLinkTarget(trimmed)) return undefined;
  const scheme = /^[A-Za-z][A-Za-z0-9+.-]*:/.exec(trimmed)?.[0];
  if (scheme !== undefined && !/^https?:$/i.test(scheme)) return undefined;
  const href = scheme === undefined ? `https://doi.org/${trimmed}` : trimmed;
  return isSafeLinkTarget(href) ? href : undefined;
}

function linkHtml(href: string | undefined, text: string): string {
  if (href === undefined) return escapeHtml(text);
  return `<a href="${escapeAttribute(href)}">${escapeHtml(text)}</a>`;
}

/** One rendered citation: authors, year, title, the optional fields, the links. */
function renderEntryHtml(entry: BibliographyEntry): string {
  const segments: string[] = [];
  const year = escapeHtml(bibliographyYearLabel(entry.year));
  const authors = entry.authors
    .map((author) => escapeHtml(author.name))
    .join(", ");
  segments.push(authors === "" ? `(${year})` : `${authors} (${year})`);
  segments.push(
    `<span class="aze-citation-title">${escapeHtml(entry.title)}</span>`,
  );
  for (const value of [entry.venue, entry.publisher, entry.edition, entry.pages]) {
    if (value !== undefined && value !== "") segments.push(escapeHtml(value));
  }
  if (entry.url !== undefined && entry.url !== "") {
    segments.push(
      linkHtml(isSafeLinkTarget(entry.url) ? entry.url : undefined, entry.url),
    );
  }
  if (entry.doi !== undefined && entry.doi !== "") {
    segments.push(`doi: ${linkHtml(doiHref(entry.doi), entry.doi)}`);
  }
  if (entry.note !== undefined && entry.note !== "") {
    segments.push(
      `<span class="aze-citation-note">${escapeHtml(entry.note)}</span>`,
    );
  }
  return `<span class="aze-citation-entry">${segments.join(". ")}.</span>`;
}

/**
 * The document-local references list, rendered where the directive stands
 * (contract: issue #67 §§7, 10). Entries follow `worksCited` when the
 * composition projection supplies it and the authored order otherwise; every
 * entry is anchored by its key. `style` selects the label form and defaults to
 * the versioned built-in `numeric`; the Theme owns the final presentation,
 * including the references-list heading word and whether the ordered-list
 * markers repeat the label span it is handed.
 */
export function renderBibliographyFragment(
  block: BibliographyBlock,
  _context: BlockRendererContext,
  style: CitationStyle = "numeric",
): string {
  const listed = block.worksCited ?? block.entries;
  const labels = bibliographyCitationLabels(listed, style);
  const caption =
    block.caption === undefined || block.caption.length === 0
      ? ""
      : `<p class="aze-bibliography-caption">${renderInlineHtml(block.caption)}</p>`;
  const items = listed
    .map((entry, index) => {
      const label = labels[index] ?? "";
      return `<li id="${escapeAttribute(entry.key)}"><span class="aze-citation-label">${escapeHtml(label)}</span> ${renderEntryHtml(entry)}</li>`;
    })
    .join("");
  const tag = style === "author-year" ? "ul" : "ol";
  return `<section class="aze-bibliography">${caption}<${tag} class="aze-works-cited">${items}</${tag}></section>`;
}

export const bibliographyHtmlBlockRenderer: AzeBlockRenderer<BibliographyBlock> =
  Object.freeze({
    descriptor: blockRendererDescriptor,
    render: renderBibliographyFragment,
  });
