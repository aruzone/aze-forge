/**
 * Native software and data models (contract: issue #61 "Define native software
 * and data model semantics"; implementation: issue #77).
 *
 * Four typed directives share one greenfield Plugin family: `:::: sequence`,
 * `:::: state`, `:::: entity` and `:::: class`. Nothing here measures, lays out
 * or renders; this module reads authored Source, validates it structurally and
 * publishes one frozen Block per directive.
 *
 * Shape: `state`, `entity` and `class` bodies are one bare flat collection of
 * `- kind: …` items with two-space structural indentation; `sequence` is the
 * one directive with two named body sections, `participants:` then `timeline:`,
 * because participant order is lane order and timeline order is time. A nested
 * collection opens on an empty `key:` value and holds either records
 * (`- name: …`) or bare values (`- primary`).
 *
 * Authored text is literal: `trigger:`, `guard:`, `action:`, every `type:` and
 * `return-type:`, `label:`, `role:`, `condition:` and note text are never
 * parsed, type-checked, executed or compared against anything computed. A
 * double-quoted value decodes §4 JSON escapes; everything else is the authored
 * text. Omission is meaning for every `label:`, `text:`, `type:`, `keys:`,
 * `visibility:`, `parameters:`, `return-type:`, `role:`, `condition:`,
 * `references:` and class `from-multiplicity:`/`to-multiplicity:`; omission of
 * `form`, participant `kind`, `optional`, `static` and `abstract` resolves to
 * the registered built-in default.
 *
 * Diagnostics posture: four namespaces — `azeforge.sequence`, `azeforge.state`,
 * `azeforge.entity`, `azeforge.class` — every code sub-ranged to the collection
 * item and field. Structural faults are errors and publish no Block;
 * reachability, dead ends, unused participants, missing primary keys and
 * unrelated classifiers are warnings. A value outside a registered enum or
 * boolean diagnoses as `#unknown-kind` with `data: {field, value}`. An
 * unresolved or duplicate name suppresses every check that consumes it while
 * independent items keep validating.
 */

import { createDiagnostic } from "./diagnostics.js";
import { didYouMean } from "./plot.js";
import {
  CLASS_BODY_SYNTAX_ID,
  CLASS_BODY_SYNTAX_VERSION,
  CLASS_PLUGIN_TYPE,
  CLASS_PLUGIN_VERSION,
  ENTITY_BODY_SYNTAX_ID,
  ENTITY_BODY_SYNTAX_VERSION,
  ENTITY_PLUGIN_TYPE,
  ENTITY_PLUGIN_VERSION,
  SEQUENCE_BODY_SYNTAX_ID,
  SEQUENCE_BODY_SYNTAX_VERSION,
  SEQUENCE_PLUGIN_TYPE,
  SEQUENCE_PLUGIN_VERSION,
  STATE_BODY_SYNTAX_ID,
  STATE_BODY_SYNTAX_VERSION,
  STATE_PLUGIN_TYPE,
  STATE_PLUGIN_VERSION,
  classDataSchema,
  classSourceSchema,
  entityDataSchema,
  entitySourceSchema,
  sequenceDataSchema,
  sequenceSourceSchema,
  stateDataSchema,
  stateSourceSchema,
} from "./models-schemas.js";
import type {
  AzeBlockPlugin,
  Cardinality,
  ClassAttribute,
  ClassBlock,
  ClassClassifier,
  ClassOperation,
  ClassParameter,
  ClassRelationship,
  ClassRelationshipForm,
  ClassVisibility,
  CompositeState,
  Diagnostic,
  EntityAttribute,
  EntityBlock,
  EntityEntity,
  EntityKey,
  EntityRelationship,
  EntityRelationshipEnd,
  JsonValue,
  SequenceAlt,
  SequenceBlock,
  SequenceDivision,
  SequenceLoop,
  SequenceMessage,
  SequenceMessageForm,
  SequenceNote,
  SequenceParticipant,
  SequenceParticipantKind,
  SequenceTimelineItem,
  SourceRange,
  StateBlock,
  StatePseudoState,
  StateScopedItem,
  StateTransition,
} from "./model.js";

export interface ModelsInputLine {
  readonly text: string;
  readonly range: SourceRange;
}

/* ------------------------------------------------------------------ *
 * Ceilings (contract §8). One code for every ceiling: `#limit-exceeded`.
 * ------------------------------------------------------------------ */

export const MAX_SEQUENCE_PARTICIPANTS = 12;
export const MAX_SEQUENCE_TIMELINE_ITEMS = 256;
export const MAX_SEQUENCE_FRAGMENT_DEPTH = 4;
export const MAX_SEQUENCE_ALT_DIVISIONS = 8;
export const MAX_SEQUENCE_NOTE_SPAN = 2;
export const MAX_SEQUENCE_NOTE_TEXT_CHARS = 1000;
export const MAX_SEQUENCE_NOTE_TEXT_LINES = 20;
export const MAX_MODELS_TEXT_CHARS = 200;
export const MAX_MODELS_NAME_CHARS = 64;
export const MAX_STATE_STATES = 64;
export const MAX_STATE_DEPTH = 3;
export const MAX_STATE_TRANSITIONS = 128;
export const MAX_ENTITY_ENTITIES = 32;
export const MAX_ENTITY_ATTRIBUTES = 64;
export const MAX_ENTITY_RELATIONSHIPS = 64;
export const MAX_CLASS_CLASSIFIERS = 32;
export const MAX_CLASS_ATTRIBUTES = 64;
export const MAX_CLASS_OPERATIONS = 64;
export const MAX_CLASS_PARAMETERS = 16;
export const MAX_CLASS_RELATIONSHIPS = 64;

const SEQUENCE_NAMESPACE = "azeforge.sequence";
const STATE_NAMESPACE = "azeforge.state";
const ENTITY_NAMESPACE = "azeforge.entity";
const CLASS_NAMESPACE = "azeforge.class";

const HEADER_FIELDS = Object.freeze(["id", "number", "title", "description"]);

const SEQUENCE_SECTIONS = Object.freeze(["participants", "timeline"]);
const PARTICIPANT_FIELDS = Object.freeze(["name", "label", "kind"]);
const MESSAGE_FIELDS = Object.freeze([
  "kind",
  "form",
  "from",
  "to",
  "text",
  "activate",
  "deactivate",
]);
const NOTE_FIELDS = Object.freeze(["kind", "over", "text"]);
const ALT_FIELDS = Object.freeze(["kind", "divisions"]);
const DIVISION_FIELDS = Object.freeze(["condition", "body"]);
const LOOP_FIELDS = Object.freeze(["kind", "condition", "body"]);

const PARTICIPANT_KINDS = ["participant", "actor"] as const;
const MESSAGE_FORMS = ["sync", "async", "return"] as const;
const TIMELINE_KINDS = ["message", "alt", "loop", "note"] as const;

const STATE_ITEM_FIELDS = Object.freeze(["kind", "name", "label", "states"]);
const TRANSITION_FIELDS = Object.freeze(["kind", "from", "to", "trigger", "guard", "action"]);
const TOP_LEVEL_STATE_KINDS = ["state", "initial", "final", "transition"] as const;
const NESTED_STATE_KINDS = ["state", "initial", "final"] as const;

const ENTITY_ITEM_FIELDS = Object.freeze(["kind", "name", "label", "attributes"]);
const ATTRIBUTE_FIELDS = Object.freeze(["name", "type", "keys", "optional", "references"]);
const REFERENCE_FIELDS = Object.freeze(["entity", "attribute"]);
const ENTITY_RELATIONSHIP_FIELDS = Object.freeze(["kind", "label", "first", "second"]);
const RELATIONSHIP_END_FIELDS = Object.freeze(["entity", "cardinality", "role"]);
const ENTITY_KEYS = ["primary", "foreign", "unique"] as const;

const CLASS_ITEM_FIELDS = Object.freeze([
  "kind",
  "name",
  "label",
  "abstract",
  "attributes",
  "operations",
]);
const CLASS_ATTRIBUTE_FIELDS = Object.freeze(["name", "type", "visibility", "static"]);
const OPERATION_FIELDS = Object.freeze(["name", "visibility", "static", "parameters", "return-type"]);
const PARAMETER_FIELDS = Object.freeze(["name", "type"]);
const CLASS_RELATIONSHIP_FIELDS = Object.freeze([
  "kind",
  "form",
  "from",
  "to",
  "label",
  "from-multiplicity",
  "to-multiplicity",
]);
const CLASS_ITEM_KINDS = ["class", "interface", "relationship"] as const;
const CLASS_RELATIONSHIP_FORMS = [
  "inheritance",
  "implementation",
  "association",
  "aggregation",
  "composition",
] as const;
const VISIBILITIES = ["public", "private", "protected", "package"] as const;
const CARDINALITIES = ["one", "zero-or-one", "many", "one-or-many"] as const;

const CARDINALITY_DISPLAY: Readonly<Record<Cardinality, string>> = Object.freeze({
  one: "1",
  "zero-or-one": "0..1",
  many: "0..*",
  "one-or-many": "1..*",
});

/** Registered display form of one cardinality, rendered at its relationship end. */
export function cardinalityDisplay(value: Cardinality): string {
  return CARDINALITY_DISPLAY[value];
}

const FIELD = /^([A-Za-z][A-Za-z0-9-]*)[ \t]*:(.*)$/;
const ITEM = /^-([ \t]*)(.*)$/;
const COMMENT = /^[ \t]*\/\/(?:[ \t].*)?$/;
/** Domain-spelled identifiers: Unicode letters, digits, space, `_`, `-`, `.`. */
const NAME = /^[\p{L}\p{N} _.-]+$/u;
const LOWER_KEBAB = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/* ------------------------------------------------------------------ *
 * Diagnostics
 * ------------------------------------------------------------------ */

function diag(
  namespace: string,
  code: string,
  message: string,
  range: SourceRange,
  sourceName: string | undefined,
  data?: Record<string, JsonValue>,
  suggestion?: string,
): Diagnostic {
  return createDiagnostic(`${namespace}#${code}`, "error", message, {
    location: sourceName === undefined ? { range } : { source: sourceName, range },
    ...(data === undefined ? {} : { data }),
    ...(suggestion === undefined ? {} : { suggestion }),
  });
}

function warn(
  namespace: string,
  code: string,
  message: string,
  range: SourceRange,
  sourceName: string | undefined,
  data: Record<string, JsonValue> = {},
): Diagnostic {
  return createDiagnostic(`${namespace}#${code}`, "warning", message, {
    location: sourceName === undefined ? { range } : { source: sourceName, range },
    data,
  });
}

function related(range: SourceRange, message: string, sourceName: string | undefined) {
  return {
    ...(sourceName === undefined ? {} : { source: sourceName }),
    range,
    message,
  };
}

/**
 * Did-you-mean over a registered vocabulary only: a proposal the reader can
 * act on, never an invented near-miss outside a closed set.
 */
function vocabularySuggestion(value: string, registered: readonly string[]): string {
  return didYouMean(value, registered) ?? `Registered values: ${registered.join(", ")}.`;
}

function limitExceeded(
  namespace: string,
  subject: string,
  count: number,
  limit: number,
  range: SourceRange,
  sourceName: string | undefined,
): Diagnostic {
  return diag(
    namespace,
    "limit-exceeded",
    `This Block's ${subject} count ${count} exceeds ${limit}.`,
    range,
    sourceName,
    { subject, count, limit },
  );
}

function unknownKind(
  namespace: string,
  field: string,
  value: string,
  registered: readonly string[],
  range: SourceRange,
  sourceName: string | undefined,
): Diagnostic {
  return diag(
    namespace,
    "unknown-kind",
    `"${value}" is not a registered ${field} value.`,
    range,
    sourceName,
    { field, value },
    vocabularySuggestion(value, registered),
  );
}

function codePoints(value: string): number {
  return [...value].length;
}

function oneOf<T extends string>(values: readonly T[], value: string): value is T {
  return (values as readonly string[]).includes(value);
}

function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === "error");
}

/* ------------------------------------------------------------------ *
 * Values: §4 text decoding and §5 multiline fields
 * ------------------------------------------------------------------ */

interface Decoded {
  readonly value: string;
  readonly invalid: boolean;
}

/** Decode one authored value: double-quoted JSON-escape form, else literal text. */
function decodeText(raw: string): Decoded {
  if (!raw.startsWith('"')) return { value: raw, invalid: false };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "string") return { value: raw, invalid: true };
    return { value: parsed, invalid: false };
  } catch {
    return { value: raw, invalid: true };
  }
}

interface Field {
  readonly key: string;
  readonly value: string;
  readonly range: SourceRange;
  readonly collection?: Collection;
  readonly record?: readonly Field[];
  readonly literal?: readonly string[];
}

interface Collection {
  readonly range: SourceRange;
  readonly entries: readonly Entry[];
}

interface Entry {
  readonly range: SourceRange;
  /** Set for a bare `- value` entry; a record entry carries `fields` instead. */
  readonly value?: string;
  readonly fields: readonly Field[];
}

interface BodyTarget {
  readonly namespace: string;
  readonly sourceName: string | undefined;
  readonly diagnostics: Diagnostic[];
  readonly bodyRange: SourceRange;
}

function fieldOf(entry: Entry, key: string): Field | undefined {
  return entry.fields.find((field) => field.key === key);
}

function fieldByName(fields: readonly Field[], key: string): Field | undefined {
  return fields.find((field) => field.key === key);
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

function declarationKey(text: string): string {
  const match = /^[ \t]*(?:-[ \t]*)?([A-Za-z][A-Za-z0-9-]*)[ \t]*:/.exec(text);
  return match?.[1]?.toLowerCase() ?? text.trim();
}

function indentationFault(target: BodyTarget, line: ModelsInputLine): void {
  target.diagnostics.push(
    diag(
      target.namespace,
      "unknown-field",
      "Declarations indent with spaces only, two per structural level.",
      line.range,
      target.sourceName,
      { field: declarationKey(line.text) },
    ),
  );
}

/**
 * The `|` multiline field: content indented one structural level beneath the
 * property, structural indentation removed, LF normalized and clip semantics
 * retaining one final newline for nonempty content.
 */
function readLiteral(
  lines: readonly ModelsInputLine[],
  start: number,
  indent: number,
  target: BodyTarget,
): { readonly lines: readonly string[]; readonly next: number } {
  const raw: string[] = [];
  let index = start;
  let end = start;
  while (index < lines.length) {
    const line = lines[index];
    if (line === undefined) break;
    if (line.text.trim() === "") {
      raw.push("");
      index += 1;
      continue;
    }
    const lineIndent = leadingIndent(line.text);
    if (lineIndent === undefined) {
      indentationFault(target, line);
      index += 1;
      continue;
    }
    if (lineIndent <= indent) break;
    raw.push(line.text.slice(Math.min(lineIndent, indent + 2)));
    end = index + 1;
    index += 1;
  }
  while (raw.length > 0 && raw[raw.length - 1] === "") raw.pop();
  return { lines: raw, next: end };
}

/** One `key: value` declaration; an empty value opens a nested collection. */
function readField(
  lines: readonly ModelsInputLine[],
  start: number,
  indent: number,
  target: BodyTarget,
): { readonly field: Field; readonly next: number } | undefined {
  const line = lines[start];
  if (line === undefined) return undefined;
  const match = FIELD.exec(line.text.slice(indent));
  if (match === null) return undefined;
  const key = (match[1] ?? "").toLowerCase();
  const raw = (match[2] ?? "").trim();
  if (raw === "|") {
    const literal = readLiteral(lines, start + 1, indent, target);
    return { field: { key, value: "", range: line.range, literal: literal.lines }, next: literal.next };
  }
  if (raw === "") {
    // An empty value opens the one nested structure the schema permits: an
    // ordered collection (`- item`) or a record (`key: value`), never both.
    let cursor = start + 1;
    while (cursor < lines.length) {
      const candidate = lines[cursor];
      if (candidate === undefined) break;
      if (candidate.text.trim() === "" || COMMENT.test(candidate.text)) {
        cursor += 1;
        continue;
      }
      break;
    }
    const first = lines[cursor];
    const opensCollection =
      first !== undefined && leadingIndent(first.text) === indent + 2 && ITEM.test(first.text.slice(indent + 2));
    if (opensCollection) {
      const nested = readEntries(lines, start + 1, indent + 2, target);
      return {
        field: {
          key,
          value: "",
          range: line.range,
          collection: { range: line.range, entries: nested.entries },
        },
        next: nested.next,
      };
    }
    const nested = readFields(lines, start + 1, indent + 2, target);
    if (nested.fields.length === 0) {
      return {
        field: { key, value: "", range: line.range, collection: { range: line.range, entries: [] } },
        next: nested.next,
      };
    }
    return { field: { key, value: "", range: line.range, record: nested.fields }, next: nested.next };
  }
  return { field: { key, value: raw, range: line.range }, next: start + 1 };
}

/** Fields at exactly `indent`; each opens its nested collection one level in. */
function readFields(
  lines: readonly ModelsInputLine[],
  start: number,
  indent: number,
  target: BodyTarget,
): { readonly fields: readonly Field[]; readonly next: number } {
  const fields: Field[] = [];
  let index = start;
  while (index < lines.length) {
    const line = lines[index];
    if (line === undefined) break;
    if (line.text.trim() === "" || COMMENT.test(line.text)) {
      index += 1;
      continue;
    }
    const lineIndent = leadingIndent(line.text);
    if (lineIndent === undefined) {
      indentationFault(target, line);
      index += 1;
      continue;
    }
    if (lineIndent < indent) break;
    if (lineIndent > indent || ITEM.test(line.text.slice(indent))) {
      target.diagnostics.push(
        diag(
          target.namespace,
          "unknown-field",
          `Expected a \`key: value\` declaration at indentation ${indent}.`,
          line.range,
          target.sourceName,
          { field: declarationKey(line.text) },
        ),
      );
      index += 1;
      continue;
    }
    const read = readField(lines, index, indent, target);
    if (read === undefined) {
      target.diagnostics.push(
        diag(target.namespace, "unknown-field", "Expected a `key: value` declaration.", line.range, target.sourceName, {
          field: declarationKey(line.text),
        }),
      );
      index += 1;
      continue;
    }
    if (fields.some((field) => field.key === read.field.key)) {
      target.diagnostics.push(
        diag(
          target.namespace,
          "duplicate-field",
          `Field "${read.field.key}" is declared twice.`,
          line.range,
          target.sourceName,
          { field: read.field.key },
        ),
      );
      index = read.next;
      continue;
    }
    fields.push(read.field);
    index = read.next;
  }
  return { fields, next: index };
}

/** Ordered collection entries at exactly `indent`: `- value` or `- key: value`. */
function readEntries(
  lines: readonly ModelsInputLine[],
  start: number,
  indent: number,
  target: BodyTarget,
): { readonly entries: readonly Entry[]; readonly next: number } {
  const entries: Entry[] = [];
  let index = start;
  while (index < lines.length) {
    const line = lines[index];
    if (line === undefined) break;
    if (line.text.trim() === "" || COMMENT.test(line.text)) {
      index += 1;
      continue;
    }
    const lineIndent = leadingIndent(line.text);
    if (lineIndent === undefined) {
      indentationFault(target, line);
      index += 1;
      continue;
    }
    if (lineIndent < indent) break;
    if (lineIndent > indent) {
      target.diagnostics.push(
        diag(
          target.namespace,
          "unknown-field",
          `Expected a \`- \` collection item at indentation ${indent}.`,
          line.range,
          target.sourceName,
          { field: declarationKey(line.text) },
        ),
      );
      index += 1;
      continue;
    }
    const item = ITEM.exec(line.text.slice(indent));
    if (item === null) {
      target.diagnostics.push(
        diag(target.namespace, "unknown-field", "Expected a `- ` collection item.", line.range, target.sourceName, {
          field: declarationKey(line.text),
        }),
      );
      index += 1;
      continue;
    }
    const content = (item[2] ?? "").trim();
    const match = FIELD.exec(content);
    if (match === null) {
      entries.push({ range: line.range, value: content, fields: [] });
      index += 1;
      continue;
    }
    const key = (match[1] ?? "").toLowerCase();
    const raw = (match[2] ?? "").trim();
    if (raw === "") {
      // The field is written on the item line, so it sits one structural level
      // in: `- body:` at indentation N holds its collection at N + 4.
      const deeper = readEntries(lines, index + 1, indent + 4, target);
      entries.push({
        range: line.range,
        fields: [{ key, value: "", range: line.range, collection: { range: line.range, entries: deeper.entries } }],
      });
      index = deeper.next;
      continue;
    }
    const nested = readFields(lines, index + 1, indent + 2, target);
    const fields: Field[] = [{ key, value: raw, range: line.range }];
    for (const field of nested.fields) {
      if (fields.some((entry) => entry.key === field.key)) {
        target.diagnostics.push(
          diag(
            target.namespace,
            "duplicate-field",
            `Field "${field.key}" is declared twice.`,
            field.range,
            target.sourceName,
            { field: field.key },
          ),
        );
        continue;
      }
      fields.push(field);
    }
    entries.push({ range: line.range, fields });
    index = nested.next;
  }
  return { entries, next: index };
}

function allowedFields(
  namespace: string,
  fields: readonly Field[],
  registered: readonly string[],
  owner: string,
  sourceName: string | undefined,
  diagnostics: Diagnostic[],
): void {
  for (const field of fields) {
    if (!registered.includes(field.key)) {
      diagnostics.push(
        diag(
          namespace,
          "unknown-field",
          `${owner} field "${field.key}" is not supported.`,
          field.range,
          sourceName,
          { field: field.key },
          vocabularySuggestion(field.key, registered),
        ),
      );
    }
  }
}

/* ------------------------------------------------------------------ *
 * Field readers
 * ------------------------------------------------------------------ */

/** Read one scalar text field, single-line unless it is the note's `|` field. */
function readTextField(
  namespace: string,
  field: Field | undefined,
  owner: string,
  required: boolean,
  fallbackRange: SourceRange,
  sourceName: string | undefined,
  diagnostics: Diagnostic[],
  limit = MAX_MODELS_TEXT_CHARS,
): string | undefined {
  if (field === undefined) {
    if (required) {
      diagnostics.push(diag(namespace, "missing-field", `${owner} requires a value.`, fallbackRange, sourceName));
    }
    return undefined;
  }
  if (field.collection !== undefined) {
    diagnostics.push(
      diag(
        namespace,
        required ? "missing-field" : "invalid-text",
        `${owner} requires a single-line value.`,
        field.range,
        sourceName,
        { field: field.key },
      ),
    );
    return undefined;
  }
  if (field.literal !== undefined) {
    const content = field.literal.join("\n");
    if (content === "" && required) {
      diagnostics.push(
        diag(namespace, "missing-field", `${owner} requires a value.`, field.range, sourceName, {
          field: field.key,
        }),
      );
      return undefined;
    }
    if (field.literal.length > 1) {
      diagnostics.push(
        diag(namespace, "invalid-text", `${owner} must be one line of plain text.`, field.range, sourceName, {
          field: field.key,
        }),
      );
      return undefined;
    }
    return content;
  }
  const decoded = decodeText(field.value);
  if (decoded.invalid) {
    diagnostics.push(
      diag(namespace, "invalid-text", `${owner} is not a well-formed quoted value.`, field.range, sourceName, {
        field: field.key,
      }),
    );
    return undefined;
  }
  const value = decoded.value;
  if (value === "") {
    diagnostics.push(
      diag(
        namespace,
        required ? "missing-field" : "invalid-text",
        required ? `${owner} requires a value.` : `${owner} is declared without a value.`,
        field.range,
        sourceName,
        { field: field.key },
      ),
    );
    return undefined;
  }
  if (codePoints(value) > limit) {
    diagnostics.push(
      diag(
        namespace,
        "invalid-text",
        `${owner} is ${codePoints(value)} characters; the ceiling is ${limit}.`,
        field.range,
        sourceName,
        { field: field.key, count: codePoints(value), limit },
      ),
    );
    return undefined;
  }
  if (/[\r\n\x00-\x1f\x7f]/.test(value)) {
    diagnostics.push(
      diag(namespace, "invalid-text", `${owner} must be one line of plain text.`, field.range, sourceName, {
        field: field.key,
      }),
    );
    return undefined;
  }
  return value;
}

/** Read one domain-spelled name: single line, registered charset, ≤ 64 chars. */
function readNameField(
  namespace: string,
  field: Field | undefined,
  owner: string,
  fallbackRange: SourceRange,
  sourceName: string | undefined,
  diagnostics: Diagnostic[],
): string | undefined {
  if (field === undefined || field.collection !== undefined || field.literal !== undefined) {
    diagnostics.push(
      diag(
        namespace,
        field === undefined ? "missing-field" : "invalid-name",
        `${owner} requires a name.`,
        field?.range ?? fallbackRange,
        sourceName,
      ),
    );
    return undefined;
  }
  const decoded = decodeText(field.value.trim());
  const value = decoded.value;
  if (decoded.invalid || value === "" || /[\r\n\x00-\x1f\x7f]/.test(value)) {
    diagnostics.push(
      diag(namespace, "invalid-name", `${owner} must be a single-line name.`, field.range, sourceName, {
        field: field.key,
        value,
      }),
    );
    return undefined;
  }
  if (!NAME.test(value) || value.trim() !== value) {
    diagnostics.push(
      diag(
        namespace,
        "invalid-name",
        `${owner} "${value}" uses characters outside letters, digits, space, \`_\`, \`-\` and \`.\`.`,
        field.range,
        sourceName,
        { field: field.key, value },
      ),
    );
    return undefined;
  }
  if (codePoints(value) > MAX_MODELS_NAME_CHARS) {
    diagnostics.push(
      diag(
        namespace,
        "invalid-name",
        `${owner} "${value}" is ${codePoints(value)} characters; the ceiling is ${MAX_MODELS_NAME_CHARS}.`,
        field.range,
        sourceName,
        { field: field.key, value, count: codePoints(value), limit: MAX_MODELS_NAME_CHARS },
      ),
    );
    return undefined;
  }
  return value;
}

/** Read one `true`/`false` field; omission resolves to the registered default. */
function readBooleanField(
  namespace: string,
  field: Field | undefined,
  fallback: boolean,
  sourceName: string | undefined,
  diagnostics: Diagnostic[],
): boolean {
  if (field === undefined) return fallback;
  if (field.value !== "true" && field.value !== "false") {
    diagnostics.push(unknownKind(namespace, field.key, field.value, ["true", "false"], field.range, sourceName));
    return fallback;
  }
  return field.value === "true";
}

/** Read a required enum field. */
function readEnumField<T extends string>(
  namespace: string,
  field: Field | undefined,
  owner: string,
  registered: readonly T[],
  fallbackRange: SourceRange,
  sourceName: string | undefined,
  diagnostics: Diagnostic[],
): T | undefined {
  if (field === undefined) {
    diagnostics.push(
      diag(namespace, "missing-field", `${owner} requires a registered value.`, fallbackRange, sourceName, {
        field: owner,
      }),
    );
    return undefined;
  }
  if (!oneOf(registered, field.value)) {
    diagnostics.push(unknownKind(namespace, field.key, field.value, registered, field.range, sourceName));
    return undefined;
  }
  return field.value;
}

/** Read a defaultable enum field; omission resolves to the registered default. */
function readDefaultEnumField<T extends string>(
  namespace: string,
  field: Field | undefined,
  registered: readonly T[],
  fallback: T,
  sourceName: string | undefined,
  diagnostics: Diagnostic[],
): T {
  if (field === undefined) return fallback;
  if (!oneOf(registered, field.value)) {
    diagnostics.push(unknownKind(namespace, field.key, field.value, registered, field.range, sourceName));
    return fallback;
  }
  return field.value;
}

interface HeaderFields {
  readonly id?: string;
  readonly number?: boolean;
  readonly title?: string;
  readonly description?: string;
}

/** The four shared header properties every numberable model Block carries. */
function readHeader(
  namespace: string,
  headerLines: readonly ModelsInputLine[],
  sourceName: string | undefined,
  diagnostics: Diagnostic[],
): HeaderFields {
  const header: { id?: string; number?: boolean; title?: string; description?: string } = {};
  const seen = new Set<string>();
  for (const line of headerLines) {
    const text = line.text.trim();
    if (text === "" || COMMENT.test(line.text)) continue;
    const match = FIELD.exec(text);
    if (match === null) {
      diagnostics.push(
        diag(namespace, "unknown-field", "A Block header is one `key: value` per line.", line.range, sourceName, {
          field: declarationKey(text),
        }),
      );
      continue;
    }
    const key = (match[1] ?? "").toLowerCase();
    const value = (match[2] ?? "").trim();
    const field: Field = { key, value, range: line.range };
    if (!HEADER_FIELDS.includes(key)) {
      diagnostics.push(
        diag(
          namespace,
          "unknown-field",
          `Block header field "${key}" is not supported.`,
          line.range,
          sourceName,
          { field: key },
          vocabularySuggestion(key, HEADER_FIELDS),
        ),
      );
      continue;
    }
    if (seen.has(key)) {
      diagnostics.push(
        diag(namespace, "duplicate-field", `Header field "${key}" is declared twice.`, line.range, sourceName, {
          field: key,
        }),
      );
      continue;
    }
    seen.add(key);
    if (key === "id") {
      if (!LOWER_KEBAB.test(value) || codePoints(value) > MAX_MODELS_NAME_CHARS) {
        diagnostics.push(
          diag(
            namespace,
            "invalid-name",
            `Block id "${value}" must be lowercase-kebab, at most ${MAX_MODELS_NAME_CHARS} characters.`,
            line.range,
            sourceName,
            { field: "id", value },
          ),
        );
        continue;
      }
      header.id = value;
      continue;
    }
    if (key === "number") {
      if (value !== "true" && value !== "false") {
        diagnostics.push(unknownKind(namespace, "number", value, ["true", "false"], line.range, sourceName));
        continue;
      }
      header.number = value === "true";
      continue;
    }
    const text_ = readTextField(
      namespace,
      field,
      key === "title" ? "Block `title:`" : "Block `description:`",
      false,
      line.range,
      sourceName,
      diagnostics,
    );
    if (text_ === undefined) continue;
    if (key === "title") header.title = text_;
    else header.description = text_;
  }
  return header;
}

interface BlockEnvelope {
  readonly headerLines: readonly ModelsInputLine[];
  readonly bodyLines: readonly ModelsInputLine[];
  readonly blockRange: SourceRange;
  readonly sourceName?: string;
}

function blockHeaderFields(header: HeaderFields): Record<string, JsonValue | undefined> {
  return {
    ...(header.id === undefined ? {} : { id: header.id }),
    ...(header.number === undefined ? {} : { number: header.number }),
    ...(header.title === undefined ? {} : { title: header.title }),
    ...(header.description === undefined ? {} : { description: header.description }),
  };
}

/* ------------------------------------------------------------------ *
 * `sequence`
 * ------------------------------------------------------------------ */

type ActivationStacks = Map<string, number>;

function cloneStacks(stacks: ActivationStacks): ActivationStacks {
  return new Map(stacks);
}

function stacksDiffer(left: ActivationStacks, right: ActivationStacks): boolean {
  const names = new Set([...left.keys(), ...right.keys()]);
  for (const name of names) {
    if ((left.get(name) ?? 0) !== (right.get(name) ?? 0)) return true;
  }
  return false;
}

export function validateSequenceBlock(options: BlockEnvelope): {
  readonly block?: SequenceBlock;
  readonly diagnostics: readonly Diagnostic[];
} {
  const diagnostics: Diagnostic[] = [];
  const sourceName = options.sourceName;
  const namespace = SEQUENCE_NAMESPACE;
  const target: BodyTarget = { namespace, sourceName, diagnostics, bodyRange: options.blockRange };
  const header = readHeader(namespace, options.headerLines, sourceName, diagnostics);
  const text = (
    field: Field | undefined,
    owner: string,
    required: boolean,
    range: SourceRange,
  ): string | undefined => readTextField(namespace, field, owner, required, range, sourceName, diagnostics);
  const nameOf = (field: Field | undefined, owner: string, range: SourceRange): string | undefined =>
    readNameField(namespace, field, owner, range, sourceName, diagnostics);
  const booleanOf = (field: Field | undefined, fallback: boolean): boolean =>
    readBooleanField(namespace, field, fallback, sourceName, diagnostics);

  const { fields } = readFields(options.bodyLines, 0, 0, target);
  allowedFields(namespace, fields, SEQUENCE_SECTIONS, "Sequence body", sourceName, diagnostics);

  const participantsField = fieldByName(fields, "participants");
  const timelineField = fieldByName(fields, "timeline");
  if (participantsField === undefined) {
    diagnostics.push(
      diag(namespace, "missing-field", "A sequence Block requires a `participants:` section.", options.blockRange, sourceName),
    );
  } else if (participantsField.collection === undefined) {
    diagnostics.push(
      diag(
        namespace,
        "missing-field",
        "`participants:` opens an ordered collection of `- name:` records.",
        participantsField.range,
        sourceName,
      ),
    );
  }
  if (timelineField === undefined) {
    diagnostics.push(
      diag(namespace, "missing-field", "A sequence Block requires a `timeline:` section.", options.blockRange, sourceName),
    );
  } else if (timelineField.collection === undefined) {
    diagnostics.push(
      diag(
        namespace,
        "missing-field",
        "`timeline:` opens an ordered collection of `- kind:` items.",
        timelineField.range,
        sourceName,
      ),
    );
  }
  if (participantsField?.collection === undefined || timelineField?.collection === undefined) {
    return { diagnostics };
  }
  const participantSection = participantsField.collection;
  const timelineSection = timelineField.collection;

  const participantEntries = participantSection.entries;
  if (participantEntries.length === 0) {
    diagnostics.push(
      diag(namespace, "empty", "A sequence Block declares no participants.", participantsField.range, sourceName),
    );
  }
  if (participantEntries.length > MAX_SEQUENCE_PARTICIPANTS) {
    diagnostics.push(
      limitExceeded(
        namespace,
        "participants",
        participantEntries.length,
        MAX_SEQUENCE_PARTICIPANTS,
        participantsField.range,
        sourceName,
      ),
    );
  }
  const participants: SequenceParticipant[] = [];
  const participantNames = new Map<string, SequenceParticipant>();
  for (const entry of participantEntries) {
    allowedFields(namespace, entry.fields, PARTICIPANT_FIELDS, "Participant", sourceName, diagnostics);
    const name = nameOf(fieldOf(entry, "name"), "A participant", entry.range);
    if (name === undefined) continue;
    const kind = readDefaultEnumField(
      namespace,
      fieldOf(entry, "kind"),
      PARTICIPANT_KINDS,
      "participant",
      sourceName,
      diagnostics,
    );
    const label = text(fieldOf(entry, "label"), "Participant `label:`", false, entry.range);
    const participant: SequenceParticipant = {
      name,
      kind: kind as SequenceParticipantKind,
      ...(label === undefined ? {} : { label }),
      range: entry.range,
    };
    const first = participantNames.get(name);
    if (first !== undefined) {
      diagnostics.push(
        createDiagnostic(`${namespace}#duplicate-name`, "error", `Participant "${name}" is declared more than once.`, {
          location: sourceName === undefined ? { range: entry.range } : { source: sourceName, range: entry.range },
          data: { namespace: "participant", name },
          relatedLocations: [related(first.range, `Participant "${name}" was first declared here.`, sourceName)],
        }),
      );
      continue;
    }
    participantNames.set(name, participant);
    participants.push(participant);
  }

  const timelineEntries = timelineSection.entries;
  if (timelineEntries.length === 0) {
    diagnostics.push(
      diag(namespace, "empty", "A sequence Block declares an empty timeline.", timelineField.range, sourceName),
    );
  }

  const used = new Set<string>();
  let itemCount = 0;

  const resolveParticipant = (field: Field | undefined, owner: string, range: SourceRange): string | undefined => {
    if (field === undefined) {
      diagnostics.push(diag(namespace, "missing-field", `${owner} requires a participant name.`, range, sourceName));
      return undefined;
    }
    const value = field.value.trim();
    const participant = participantNames.get(value);
    if (participant === undefined) {
      diagnostics.push(
        createDiagnostic(`${namespace}#unresolved-reference`, "error", `"${value}" is not a declared participant.`, {
          location: sourceName === undefined ? { range: field.range } : { source: sourceName, range: field.range },
          data: { namespace: "participant", name: value },
          relatedLocations: [related(participantsField.range, "Participants are declared here.", sourceName)],
        }),
      );
      return undefined;
    }
    used.add(participant.name);
    return participant.name;
  };

  const walk = (entries: readonly Entry[], fragmentDepth: number): SequenceTimelineItem[] => {
    const items: SequenceTimelineItem[] = [];
    for (const entry of entries) {
      itemCount += 1;
      const kindField = fieldOf(entry, "kind");
      const kind = kindField?.value ?? "";
      if (kindField === undefined || !oneOf(TIMELINE_KINDS, kind)) {
        diagnostics.push(
          kindField === undefined
            ? diag(namespace, "unknown-item", "A timeline item requires `- kind:`.", entry.range, sourceName, {
                value: kind,
              })
            : diag(
                namespace,
                "unknown-item",
                `"${kind}" is not a registered timeline item kind.`,
                kindField.range,
                sourceName,
                { value: kind },
                vocabularySuggestion(kind, TIMELINE_KINDS),
              ),
        );
        continue;
      }
      if (kind === "message") {
        allowedFields(namespace, entry.fields, MESSAGE_FIELDS, "Message", sourceName, diagnostics);
        const form = readDefaultEnumField(
          namespace,
          fieldOf(entry, "form"),
          MESSAGE_FORMS,
          "sync",
          sourceName,
          diagnostics,
        );
        const from = resolveParticipant(fieldOf(entry, "from"), "Message `from:`", entry.range);
        const to = resolveParticipant(fieldOf(entry, "to"), "Message `to:`", entry.range);
        const label = text(fieldOf(entry, "text"), "Message `text:`", false, entry.range);
        const activate = booleanOf(fieldOf(entry, "activate"), false);
        const deactivate = booleanOf(fieldOf(entry, "deactivate"), false);
        if (from === undefined || to === undefined) continue;
        const message: SequenceMessage = {
          kind: "message",
          form: form as SequenceMessageForm,
          from,
          to,
          activate,
          deactivate,
          ...(label === undefined ? {} : { text: label }),
          range: entry.range,
        };
        items.push(message);
        continue;
      }
      if (kind === "note") {
        allowedFields(namespace, entry.fields, NOTE_FIELDS, "Note", sourceName, diagnostics);
        const overField = fieldOf(entry, "over");
        const over: string[] = [];
        if (overField === undefined) {
          diagnostics.push(
            diag(namespace, "missing-field", "Note `over:` names one or two participants.", entry.range, sourceName),
          );
        } else if (overField.collection === undefined) {
          const span = resolveParticipant(overField, "Note `over:`", entry.range);
          if (span !== undefined) over.push(span);
        } else {
          for (const spanEntry of overField.collection.entries) {
            if (spanEntry.value === undefined) {
              diagnostics.push(
                diag(
                  namespace,
                  "invalid-note-span",
                  "Note `over:` entries are bare participant names.",
                  spanEntry.range,
                  sourceName,
                  { count: over.length, limit: MAX_SEQUENCE_NOTE_SPAN },
                ),
              );
              continue;
            }
            const span = resolveParticipant(
              { key: "over", value: spanEntry.value, range: spanEntry.range },
              "Note `over:`",
              spanEntry.range,
            );
            if (span !== undefined) over.push(span);
          }
        }
        if (over.length > MAX_SEQUENCE_NOTE_SPAN) {
          diagnostics.push(
            diag(
              namespace,
              "invalid-note-span",
              `A note spans ${over.length} participants; the limit is ${MAX_SEQUENCE_NOTE_SPAN}.`,
              overField?.range ?? entry.range,
              sourceName,
              { count: over.length, limit: MAX_SEQUENCE_NOTE_SPAN },
            ),
          );
        }
        const textField = fieldOf(entry, "text");
        let noteText: string | undefined;
        if (textField === undefined) {
          diagnostics.push(diag(namespace, "missing-field", "Note `text:` is required.", entry.range, sourceName));
        } else if (textField.literal === undefined) {
          diagnostics.push(
            diag(namespace, "invalid-text", "Note `text:` is a `|` multiline field.", textField.range, sourceName, {
              field: "text",
            }),
          );
        } else {
          const lines = textField.literal;
          const content = lines.join("\n");
          if (content === "") {
            diagnostics.push(diag(namespace, "missing-field", "Note `text:` is required.", textField.range, sourceName));
          } else if (codePoints(content) > MAX_SEQUENCE_NOTE_TEXT_CHARS) {
            diagnostics.push(
              diag(
                namespace,
                "invalid-text",
                `Note text is ${codePoints(content)} characters; the ceiling is ${MAX_SEQUENCE_NOTE_TEXT_CHARS}.`,
                textField.range,
                sourceName,
                { field: "text", count: codePoints(content), limit: MAX_SEQUENCE_NOTE_TEXT_CHARS },
              ),
            );
          } else if (lines.length > MAX_SEQUENCE_NOTE_TEXT_LINES) {
            diagnostics.push(
              diag(
                namespace,
                "invalid-text",
                `Note text is ${lines.length} lines; the ceiling is ${MAX_SEQUENCE_NOTE_TEXT_LINES}.`,
                textField.range,
                sourceName,
                { field: "text", count: lines.length, limit: MAX_SEQUENCE_NOTE_TEXT_LINES },
              ),
            );
          } else {
            noteText = `${content}\n`;
          }
        }
        if (over.length === 0 || noteText === undefined) continue;
        const note: SequenceNote = { kind: "note", over, text: noteText, range: entry.range };
        items.push(note);
        continue;
      }

      const bodyOf = (owner: string, range: SourceRange): SequenceTimelineItem[] | undefined => {
        const bodyField = fieldOf(entry, "body");
        if (bodyField === undefined || bodyField.collection === undefined) {
          diagnostics.push(
            diag(namespace, "missing-field", `${owner} requires a \`body:\` collection.`, range, sourceName),
          );
          return undefined;
        }
        // A fragment's own nesting level is the level of the list holding it:
        // top-level fragments are level 1, so four levels are legal.
        if (fragmentDepth > MAX_SEQUENCE_FRAGMENT_DEPTH) {
          diagnostics.push(
            limitExceeded(
              namespace,
              "fragment-depth",
              fragmentDepth,
              MAX_SEQUENCE_FRAGMENT_DEPTH,
              range,
              sourceName,
            ),
          );
        }
        return walk(bodyField.collection.entries, fragmentDepth + 1);
      };

      if (kind === "loop") {
        allowedFields(namespace, entry.fields, LOOP_FIELDS, "Loop fragment", sourceName, diagnostics);
        const condition = text(fieldOf(entry, "condition"), "Loop `condition:`", false, entry.range);
        const body = bodyOf("A loop fragment", entry.range);
        if (body === undefined) continue;
        const loop: SequenceLoop = {
          kind: "loop",
          ...(condition === undefined ? {} : { condition }),
          body,
          range: entry.range,
        };
        items.push(loop);
        continue;
      }

      allowedFields(namespace, entry.fields, ALT_FIELDS, "Alt fragment", sourceName, diagnostics);
      const divisionsField = fieldOf(entry, "divisions");
      if (divisionsField === undefined || divisionsField.collection === undefined) {
        diagnostics.push(
          diag(
            namespace,
            "missing-field",
            "An `alt` fragment requires a `divisions:` collection.",
            entry.range,
            sourceName,
          ),
        );
        continue;
      }
      const divisionEntries = divisionsField.collection.entries;
      if (divisionEntries.length > MAX_SEQUENCE_ALT_DIVISIONS) {
        diagnostics.push(
          limitExceeded(
            namespace,
            "alt-divisions",
            divisionEntries.length,
            MAX_SEQUENCE_ALT_DIVISIONS,
            divisionsField.range,
            sourceName,
          ),
        );
      }
      const divisions: SequenceDivision[] = [];
      let anyItem = false;
      for (const divisionEntry of divisionEntries) {
        allowedFields(namespace, divisionEntry.fields, DIVISION_FIELDS, "Alt division", sourceName, diagnostics);
        const condition = text(
          fieldOf(divisionEntry, "condition"),
          "Division `condition:`",
          false,
          divisionEntry.range,
        );
        const bodyField = fieldOf(divisionEntry, "body");
        if (bodyField === undefined || bodyField.collection === undefined) {
          diagnostics.push(
            diag(
              namespace,
              "missing-field",
              "An alt division requires a `body:` collection.",
              divisionEntry.range,
              sourceName,
            ),
          );
        }
        if (fragmentDepth > MAX_SEQUENCE_FRAGMENT_DEPTH) {
          diagnostics.push(
            limitExceeded(
              namespace,
              "fragment-depth",
              fragmentDepth,
              MAX_SEQUENCE_FRAGMENT_DEPTH,
              divisionEntry.range,
              sourceName,
            ),
          );
        }
        const body =
          bodyField?.collection === undefined ? [] : walk(bodyField.collection.entries, fragmentDepth + 1);
        if (body.length > 0) anyItem = true;
        divisions.push({
          ...(condition === undefined ? {} : { condition }),
          body,
          range: divisionEntry.range,
        });
      }
      if (!anyItem) {
        diagnostics.push(
          diag(namespace, "empty-fragment", "Every division of this `alt` fragment is empty.", entry.range, sourceName),
        );
      }
      const alt: SequenceAlt = { kind: "alt", divisions, range: entry.range };
      items.push(alt);
    }
    return items;
  };

  const timeline = walk(timelineEntries, 1);
  if (itemCount > MAX_SEQUENCE_TIMELINE_ITEMS) {
    diagnostics.push(
      limitExceeded(
        namespace,
        "timeline-items",
        itemCount,
        MAX_SEQUENCE_TIMELINE_ITEMS,
        timelineField.range,
        sourceName,
      ),
    );
  }

  // Activation balance consumes participant names, so an unresolved reference or
  // a duplicate participant name suppresses it while every other check stands.
  if (!hasErrors(diagnostics)) {
    checkActivationBalance(timeline, participants, timelineField.range, sourceName, diagnostics);
  }
  if (!hasErrors(diagnostics)) {
    for (const participant of participants) {
      if (!used.has(participant.name)) {
        diagnostics.push(
          warn(
            namespace,
            "unused-participant",
            `Participant "${participant.name}" carries no message or note.`,
            participant.range,
            sourceName,
            { name: participant.name },
          ),
        );
      }
    }
  }

  if (hasErrors(diagnostics)) return { diagnostics };
  return {
    diagnostics,
    block: {
      kind: "sequence",
      pluginVersion: SEQUENCE_PLUGIN_VERSION,
      range: options.blockRange,
      ...blockHeaderFields(header),
      participants,
      timeline,
    } as SequenceBlock,
  };
}

/**
 * Activation balance, one pass with per-participant bar counts — never path
 * enumeration. `activate:` pushes on the message's `to:`, `deactivate:` pops
 * the innermost bar on its `from:`; an `alt` evaluates every division from the
 * entry copy and they must all end alike, and a `loop` body must end with
 * exactly the entry stack.
 */
function checkActivationBalance(
  timeline: readonly SequenceTimelineItem[],
  participants: readonly SequenceParticipant[],
  timelineRange: SourceRange,
  sourceName: string | undefined,
  diagnostics: Diagnostic[],
): void {
  const walk = (items: readonly SequenceTimelineItem[], entry: ActivationStacks): ActivationStacks => {
    const stacks = cloneStacks(entry);
    for (const item of items) {
      if (item.kind === "message") {
        if (item.activate) stacks.set(item.to, (stacks.get(item.to) ?? 0) + 1);
        if (item.deactivate) {
          const current = stacks.get(item.from) ?? 0;
          if (current === 0) {
            diagnostics.push(
              diag(
                SEQUENCE_NAMESPACE,
                "unbalanced-activation",
                `Deactivation on "${item.from}" has no open activation to close.`,
                item.range,
                sourceName,
                { participant: item.from, reason: "no open activation" },
              ),
            );
          } else {
            stacks.set(item.from, current - 1);
          }
        }
        continue;
      }
      if (item.kind === "note") continue;
      if (item.kind === "loop") {
        const end = walk(item.body, stacks);
        if (stacksDiffer(end, stacks)) {
          const offender = participants.find(
            (participant) => (end.get(participant.name) ?? 0) !== (stacks.get(participant.name) ?? 0),
          );
          diagnostics.push(
            diag(
              SEQUENCE_NAMESPACE,
              "unbalanced-activation",
              "A loop body must be activation-neutral: every bar it opens closes inside the same iteration.",
              item.range,
              sourceName,
              { reason: "loop body is not activation-neutral", participant: offender?.name ?? "" },
            ),
          );
        }
        continue;
      }
      const ends = item.divisions.map((division) => walk(division.body, stacks));
      const first = ends[0];
      if (first === undefined) continue;
      const disagree = ends
        .map((end, index) => (index === 0 || !stacksDiffer(end, first) ? -1 : index + 1))
        .filter((index) => index > 0);
      if (disagree.length > 0) {
        diagnostics.push(
          diag(
            SEQUENCE_NAMESPACE,
            "unbalanced-activation",
            "Every `alt` division must end with the same set of open activations.",
            item.range,
            sourceName,
            { reason: "divisions disagree", divisions: [1, ...disagree] },
          ),
        );
      }
      for (const name of [...stacks.keys()]) {
        if (!first.has(name)) stacks.delete(name);
      }
      for (const [name, count] of first) stacks.set(name, count);
    }
    return stacks;
  };

  const end = walk(timeline, new Map<string, number>());
  for (const participant of participants) {
    if ((end.get(participant.name) ?? 0) > 0) {
      diagnostics.push(
        diag(
          SEQUENCE_NAMESPACE,
          "unbalanced-activation",
          `Activation on "${participant.name}" is still open at the end of the timeline.`,
          timelineRange,
          sourceName,
          { participant: participant.name, reason: "still open at end of timeline" },
        ),
      );
    }
  }
}
/* ------------------------------------------------------------------ *
 * `state`
 * ------------------------------------------------------------------ */

interface ScopedItems {
  /** `top-level`, or the composite state's name. */
  readonly scope: string;
  readonly depth: number;
  readonly items: readonly (StateScopedItem | StateTransition)[];
}

export function validateStateBlock(options: BlockEnvelope): {
  readonly block?: StateBlock;
  readonly diagnostics: readonly Diagnostic[];
} {
  const diagnostics: Diagnostic[] = [];
  const sourceName = options.sourceName;
  const namespace = STATE_NAMESPACE;
  const target: BodyTarget = { namespace, sourceName, diagnostics, bodyRange: options.blockRange };
  const header = readHeader(namespace, options.headerLines, sourceName, diagnostics);
  const text = (
    field: Field | undefined,
    owner: string,
    required: boolean,
    range: SourceRange,
  ): string | undefined => readTextField(namespace, field, owner, required, range, sourceName, diagnostics);
  const nameOf = (field: Field | undefined, owner: string, range: SourceRange): string | undefined =>
    readNameField(namespace, field, owner, range, sourceName, diagnostics);

  const { entries } = readEntries(options.bodyLines, 0, 0, target);

  /** Declared state names are flat across the whole Block, with no shadowing. */
  const declarations = new Map<string, { readonly kind: string; readonly range: SourceRange }>();
  let stateCount = 0;
  let transitionCount = 0;
  let maxDepth = 0;

  const declareName = (name: string, kind: string, range: SourceRange, owner: string): void => {
    const first = declarations.get(name);
    if (first !== undefined) {
      diagnostics.push(
        createDiagnostic(`${namespace}#duplicate-name`, "error", `${owner} "${name}" is declared more than once.`, {
          location: sourceName === undefined ? { range } : { source: sourceName, range },
          data: { namespace: "state", name },
          relatedLocations: [related(first.range, `"${name}" was first declared here.`, sourceName)],
        }),
      );
      return;
    }
    declarations.set(name, { kind, range });
  };

  const scopes: ScopedItems[] = [];
  const topLevel: (StateScopedItem | StateTransition)[] = [];

  const readScope = (
    entries: readonly Entry[],
    depth: number,
    allowedKinds: readonly string[],
  ): (StateScopedItem | StateTransition)[] => {
    const items: (StateScopedItem | StateTransition)[] = [];
    for (const entry of entries) {
      const kindField = fieldOf(entry, "kind");
      const kind = kindField?.value ?? "";
      if (kindField === undefined || !oneOf(allowedKinds, kind)) {
        diagnostics.push(
          diag(
            namespace,
            "unknown-item",
            `"${kind}" is not a registered item kind here.`,
            kindField?.range ?? entry.range,
            sourceName,
            { value: kind },
            vocabularySuggestion(kind, allowedKinds),
          ),
        );
        continue;
      }
      if (kind === "transition") {
        transitionCount += 1;
        allowedFields(namespace, entry.fields, TRANSITION_FIELDS, "Transition", sourceName, diagnostics);
        const from = nameOf(fieldOf(entry, "from"), "Transition `from:`", entry.range);
        const to = nameOf(fieldOf(entry, "to"), "Transition `to:`", entry.range);
        const trigger = text(fieldOf(entry, "trigger"), "Transition `trigger:`", false, entry.range);
        const guard = text(fieldOf(entry, "guard"), "Transition `guard:`", false, entry.range);
        const action = text(fieldOf(entry, "action"), "Transition `action:`", false, entry.range);
        if (from === undefined || to === undefined) continue;
        items.push({
          kind: "transition",
          from,
          to,
          ...(trigger === undefined ? {} : { trigger }),
          ...(guard === undefined ? {} : { guard }),
          ...(action === undefined ? {} : { action }),
          range: entry.range,
        });
        continue;
      }
      const pseudo = kind === "initial" || kind === "final";
      allowedFields(
        namespace,
        entry.fields,
        pseudo ? ["kind", "name"] : STATE_ITEM_FIELDS,
        pseudo ? `The \`${kind}\` pseudo-state` : "State",
        sourceName,
        diagnostics,
      );
      const name = nameOf(
        fieldOf(entry, "name"),
        pseudo ? `An \`${kind}\` pseudo-state` : "A state",
        entry.range,
      );
      if (name === undefined) continue;
      declareName(name, kind, entry.range, pseudo ? `Pseudo-state` : "State");
      if (pseudo) {
        items.push({ kind, name, range: entry.range });
        continue;
      }
      stateCount += 1;
      const label = text(fieldOf(entry, "label"), "State `label:`", false, entry.range);
      const statesField = fieldOf(entry, "states");
      let nested: StateScopedItem[] = [];
      if (statesField !== undefined && statesField.collection === undefined) {
        diagnostics.push(
          diag(
            namespace,
            "missing-field",
            `State "${name}" \`states:\` opens a collection of nested states.`,
            statesField.range,
            sourceName,
          ),
        );
      } else if (statesField?.collection !== undefined) {
        const inner = readScope(statesField.collection.entries, depth + 1, NESTED_STATE_KINDS);
        nested = inner.filter((item): item is StateScopedItem => item.kind !== "transition");
        scopes.push({ scope: name, depth: depth + 1, items: inner });
      }
      if (depth > maxDepth) maxDepth = depth;
      items.push({
        kind: "state",
        name,
        ...(label === undefined ? {} : { label }),
        states: nested,
        range: entry.range,
      });
    }
    return items;
  };

  topLevel.push(...readScope(entries, 1, TOP_LEVEL_STATE_KINDS));
  scopes.unshift({ scope: "top-level", depth: 1, items: topLevel });

  if (entries.length === 0) {
    diagnostics.push(diag(namespace, "empty", "A state Block declares no items.", options.blockRange, sourceName));
  }
  if (stateCount > MAX_STATE_STATES) {
    diagnostics.push(
      limitExceeded(namespace, "states", stateCount, MAX_STATE_STATES, options.blockRange, sourceName),
    );
  }
  if (transitionCount > MAX_STATE_TRANSITIONS) {
    diagnostics.push(
      limitExceeded(namespace, "transitions", transitionCount, MAX_STATE_TRANSITIONS, options.blockRange, sourceName),
    );
  }
  if (maxDepth > MAX_STATE_DEPTH) {
    diagnostics.push(
      limitExceeded(namespace, "state-depth", maxDepth, MAX_STATE_DEPTH, options.blockRange, sourceName),
    );
  }

  const transitions = collectTransitions(topLevel);

  // Exactly one `initial` per scope; entry into a composite targets the
  // composite, so every scope owns its own initial.
  for (const scope of scopes) {
    const pseudos = scope.items.filter(
      (item): item is StatePseudoState => item.kind === "initial" || item.kind === "final",
    );
    const initials = pseudos.filter((item) => item.kind === "initial");
    const first = initials[0];
    if (first === undefined) {
      diagnostics.push(
        diag(
          namespace,
          "missing-initial",
          `Scope ${describeScope(scope.scope)} declares no \`initial\` pseudo-state.`,
          options.blockRange,
          sourceName,
          { scope: scope.scope },
        ),
      );
    } else if (initials.length > 1) {
      diagnostics.push(
        createDiagnostic(
          `${namespace}#multiple-initials`,
          "error",
          `Scope ${describeScope(scope.scope)} declares ${initials.length} \`initial\` pseudo-states.`,
          {
            location: sourceName === undefined ? { range: initials[1]!.range } : { source: sourceName, range: initials[1]!.range },
            data: { scope: scope.scope, count: initials.length },
            relatedLocations: initials
              .slice(2)
              .map((item) => related(item.range, "Another `initial` pseudo-state is declared here.", sourceName)),
          },
        ),
      );
    }
  }

  const resolutions = transitions.map((transition) => ({
    transition,
    from: declarations.get(transition.from),
    to: declarations.get(transition.to),
  }));
  let unresolved = false;
  for (const { transition, from, to } of resolutions) {
    if (from === undefined) {
      unresolved = true;
      diagnostics.push(
        diag(namespace, "unresolved-reference", `"${transition.from}" is not a declared state.`, transition.range, sourceName, {
          namespace: "state",
          name: transition.from,
        }),
      );
    }
    if (to === undefined) {
      unresolved = true;
      diagnostics.push(
        diag(namespace, "unresolved-reference", `"${transition.to}" is not a declared state.`, transition.range, sourceName, {
          namespace: "state",
          name: transition.to,
        }),
      );
    }
  }

  const duplicated = hasErrors(diagnostics);
  if (!duplicated) {
    for (const { transition, to } of resolutions) {
      if (to?.kind !== "initial") continue;
      diagnostics.push(
        createDiagnostic(
          `${namespace}#initial-has-incoming`,
          "error",
          `A transition into the \`initial\` pseudo-state "${transition.to}" is not permitted.`,
          {
            location: sourceName === undefined ? { range: transition.range } : { source: sourceName, range: transition.range },
            data: { namespace: "state", name: transition.to },
            relatedLocations: [related(to.range, `"${transition.to}" is an \`initial\` pseudo-state.`, sourceName)],
          },
        ),
      );
    }
    for (const { transition, from } of resolutions) {
      if (from?.kind !== "final") continue;
      diagnostics.push(
        createDiagnostic(
          `${namespace}#final-has-outgoing`,
          "error",
          `A transition out of the \`final\` pseudo-state "${transition.from}" is not permitted.`,
          {
            location: sourceName === undefined ? { range: transition.range } : { source: sourceName, range: transition.range },
            data: { namespace: "state", name: transition.from },
            relatedLocations: [related(from.range, `"${transition.from}" is a \`final\` pseudo-state.`, sourceName)],
          },
        ),
      );
    }

    // Reachability is per scope: a composite counts as entered when reached, so
    // its inner states are reachable from its own initial, and a transition that
    // crosses a scope border counts from wherever it starts.
    const edges = new Map<string, string[]>();
    for (const { transition } of resolutions) {
      const list = edges.get(transition.from) ?? [];
      list.push(transition.to);
      edges.set(transition.from, list);
    }
    const owner = new Map<string, string>();
    for (const scope of scopes) {
      for (const item of scope.items) {
        if (item.kind === "state" || item.kind === "initial" || item.kind === "final") {
          owner.set(item.name, scope.scope);
        }
      }
    }
    const initialOf = new Map<string, string>();
    for (const scope of scopes) {
      const initial = scope.items.find((item) => item.kind === "initial");
      if (initial !== undefined && "name" in initial) initialOf.set(scope.scope, initial.name);
    }
    const entered = new Set<string>();
    const reachable = new Set<string>();
    const compositeScopes = new Set(scopes.map((scope) => scope.scope));
    const queue: string[] = [];
    const enter = (scope: string): void => {
      if (entered.has(scope)) return;
      entered.add(scope);
      const initial = initialOf.get(scope);
      if (initial !== undefined) queue.push(initial);
    };
    enter("top-level");
    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) break;
      if (reachable.has(current)) continue;
      reachable.add(current);
      const scope = owner.get(current);
      if (scope !== undefined) enter(scope);
      // A composite counts as entered when reached, so its own initial governs
      // entry into its nested scope.
      if (compositeScopes.has(current)) enter(current);
      for (const next of edges.get(current) ?? []) {
        const nextScope = owner.get(next);
        if (nextScope !== undefined) enter(nextScope);
        queue.push(next);
      }
    }
    const hasOutgoing = new Set<string>();
    for (const { transition } of resolutions) hasOutgoing.add(transition.from);

    for (const item of allStates(topLevel)) {
      if (!reachable.has(item.name)) {
        diagnostics.push(
          warn(
            namespace,
            "unreachable-state",
            `State "${item.name}" is unreachable from its scope's \`initial\`.`,
            item.range,
            sourceName,
            { name: item.name },
          ),
        );
      }
      if (!hasOutgoing.has(item.name)) {
        diagnostics.push(
          warn(
            namespace,
            "dead-end-state",
            `State "${item.name}" has no outgoing transition.`,
            item.range,
            sourceName,
            { name: item.name },
          ),
        );
      }
    }
  }
  if (unresolved) return { diagnostics };

  if (hasErrors(diagnostics)) return { diagnostics };
  return {
    diagnostics,
    block: {
      kind: "state",
      pluginVersion: STATE_PLUGIN_VERSION,
      range: options.blockRange,
      ...blockHeaderFields(header),
      items: topLevel,
    } as StateBlock,
  };
}

function describeScope(scope: string): string {
  return scope === "top-level" ? "`top-level`" : `\`${scope}\``;
}

function allStates(
  items: readonly (StateScopedItem | StateTransition)[],
): readonly CompositeState[] {
  const found: CompositeState[] = [];
  for (const item of items) {
    if (item.kind !== "state") continue;
    found.push(item);
    found.push(...allStates(item.states));
  }
  return found;
}

function collectTransitions(
  items: readonly (StateScopedItem | StateTransition)[],
): readonly StateTransition[] {
  return items.filter((item): item is StateTransition => item.kind === "transition");
}

/* ------------------------------------------------------------------ *
 * `entity`
 * ------------------------------------------------------------------ */

export function validateEntityBlock(options: BlockEnvelope): {
  readonly block?: EntityBlock;
  readonly diagnostics: readonly Diagnostic[];
} {
  const diagnostics: Diagnostic[] = [];
  const sourceName = options.sourceName;
  const namespace = ENTITY_NAMESPACE;
  const target: BodyTarget = { namespace, sourceName, diagnostics, bodyRange: options.blockRange };
  const header = readHeader(namespace, options.headerLines, sourceName, diagnostics);
  const text = (
    field: Field | undefined,
    owner: string,
    required: boolean,
    range: SourceRange,
  ): string | undefined => readTextField(namespace, field, owner, required, range, sourceName, diagnostics);
  const nameOf = (field: Field | undefined, owner: string, range: SourceRange): string | undefined =>
    readNameField(namespace, field, owner, range, sourceName, diagnostics);

  const { entries } = readEntries(options.bodyLines, 0, 0, target);
  if (entries.length === 0) {
    diagnostics.push(diag(namespace, "empty", "An entity Block declares no items.", options.blockRange, sourceName));
  }

  const items: (EntityEntity | EntityRelationship)[] = [];
  const entities = new Map<string, EntityEntity>();
  let relationshipCount = 0;

  interface RawEnd {
    readonly entry: Entry;
    readonly entityField: Field | undefined;
    readonly cardinalityField: Field | undefined;
  }
  const rawEnds: RawEnd[] = [];

  for (const entry of entries) {
    const kindField = fieldOf(entry, "kind");
    const kind = kindField?.value ?? "";
    if (kindField === undefined || (kind !== "entity" && kind !== "relationship")) {
      diagnostics.push(
        diag(
          namespace,
          "unknown-item",
          `"${kind}" is not a registered entity item kind.`,
          kindField?.range ?? entry.range,
          sourceName,
          { value: kind },
          vocabularySuggestion(kind, ["entity", "relationship"]),
        ),
      );
      continue;
    }
    if (kind === "relationship") {
      relationshipCount += 1;
      allowedFields(namespace, entry.fields, ENTITY_RELATIONSHIP_FIELDS, "Relationship", sourceName, diagnostics);
      const label = text(fieldOf(entry, "label"), "Relationship `label:`", false, entry.range);
      const first = readEnd(entry, "first", diagnostics, namespace, sourceName);
      const second = readEnd(entry, "second", diagnostics, namespace, sourceName);
      if (first === undefined || second === undefined) continue;
      rawEnds.push(first.end);
      rawEnds.push(second.end);
      const ends: EntityRelationshipEnd[] = [];
      for (const end of [first, second]) {
        const entity = end.entity;
        const cardinality = end.cardinality;
        if (entity === undefined || cardinality === undefined) break;
        ends.push({
          entity,
          cardinality,
          ...(end.role === undefined ? {} : { role: end.role }),
          range: end.range,
        });
      }
      if (ends.length < 2) continue;
      items.push({
        kind: "relationship",
        ...(label === undefined ? {} : { label }),
        first: ends[0]!,
        second: ends[1]!,
        range: entry.range,
      });
      continue;
    }
    allowedFields(namespace, entry.fields, ENTITY_ITEM_FIELDS, "Entity", sourceName, diagnostics);
    const name = nameOf(fieldOf(entry, "name"), "An entity", entry.range);
    if (name === undefined) continue;
    const label = text(fieldOf(entry, "label"), "Entity `label:`", false, entry.range);
    const first = entities.get(name);
    if (first !== undefined) {
      diagnostics.push(
        createDiagnostic(`${namespace}#duplicate-name`, "error", `Entity "${name}" is declared more than once.`, {
          location: sourceName === undefined ? { range: entry.range } : { source: sourceName, range: entry.range },
          data: { namespace: "entity", name },
          relatedLocations: [related(first.range, `Entity "${name}" was first declared here.`, sourceName)],
        }),
      );
      continue;
    }
    const attributesField = fieldOf(entry, "attributes");
    if (attributesField !== undefined && attributesField.collection === undefined) {
      diagnostics.push(
        diag(
          namespace,
          "missing-field",
          `Entity "${name}" \`attributes:\` opens a collection of attribute records.`,
          attributesField.range,
          sourceName,
        ),
      );
    }
    const attributeEntries = attributesField?.collection?.entries ?? [];
    if (attributeEntries.length > MAX_ENTITY_ATTRIBUTES) {
      diagnostics.push(
        limitExceeded(
          namespace,
          "attributes",
          attributeEntries.length,
          MAX_ENTITY_ATTRIBUTES,
          attributesField?.range ?? entry.range,
          sourceName,
        ),
      );
    }
    const attributes = attributesField === undefined ? undefined : readAttributes(attributeEntries, name, namespace, sourceName, diagnostics);
    const entity: EntityEntity = {
      kind: "entity",
      name,
      ...(label === undefined ? {} : { label }),
      ...(attributes === undefined ? {} : { attributes }),
      range: entry.range,
    };
    entities.set(name, entity);
    items.push(entity);
  }

  if (entities.size > MAX_ENTITY_ENTITIES) {
    diagnostics.push(
      limitExceeded(namespace, "entities", entities.size, MAX_ENTITY_ENTITIES, options.blockRange, sourceName),
    );
  }
  if (relationshipCount > MAX_ENTITY_RELATIONSHIPS) {
    diagnostics.push(
      limitExceeded(
        namespace,
        "relationships",
        relationshipCount,
        MAX_ENTITY_RELATIONSHIPS,
        options.blockRange,
        sourceName,
      ),
    );
  }

  // End references resolve against the Block-local entity namespace, so both
  // ends of every relationship are known before any of them is checked.
  let unresolved = false;
  const linked = new Set<string>();
  for (const end of rawEnds) {
    const value = end.entityField?.value.trim() ?? "";
    if (end.entityField === undefined) continue;
    if (!entities.has(value)) {
      unresolved = true;
      diagnostics.push(
        createDiagnostic(`${namespace}#unresolved-reference`, "error", `"${value}" is not a declared entity.`, {
          location: sourceName === undefined ? { range: end.entityField.range } : { source: sourceName, range: end.entityField.range },
          data: { namespace: "entity", name: value },
        }),
      );
      continue;
    }
    linked.add(value);
  }
  for (const entity of entities.values()) {
    for (const attribute of entity.attributes ?? []) {
      const reference = attribute.reference;
      if (reference === undefined) continue;
      const target = entities.get(reference.entity);
      const targetAttribute = target?.attributes?.find((entry) => entry.name === reference.attribute);
      if (targetAttribute === undefined) {
        unresolved = true;
        diagnostics.push(
          createDiagnostic(
            `${namespace}#unresolved-reference`,
            "error",
            `"${reference.entity}.${reference.attribute}" is not a declared attribute.`,
            {
              location:
                sourceName === undefined ? { range: attribute.range } : { source: sourceName, range: attribute.range },
              data: { entity: reference.entity, attribute: reference.attribute },
              ...(target === undefined
                ? {}
                : {
                    relatedLocations: [
                      related(target.range, `Entity "${reference.entity}" declares its attributes here.`, sourceName),
                    ],
                  }),
            },
          ),
        );
      }
    }
  }

  if (!unresolved && !hasErrors(diagnostics)) {
    for (const entity of entities.values()) {
      if (!(entity.attributes ?? []).some((attribute) => attribute.keys?.includes("primary") === true)) {
        diagnostics.push(
          warn(namespace, "no-primary-key", `Entity "${entity.name}" declares no \`primary\` key.`, entity.range, sourceName, {
            name: entity.name,
          }),
        );
      }
      if (!linked.has(entity.name)) {
        diagnostics.push(
          warn(
            namespace,
            "unrelated-entity",
            `Entity "${entity.name}" appears in no relationship.`,
            entity.range,
            sourceName,
            { name: entity.name },
          ),
        );
      }
    }
  }

  if (hasErrors(diagnostics)) return { diagnostics };
  return {
    diagnostics,
    block: {
      kind: "entity",
      pluginVersion: ENTITY_PLUGIN_VERSION,
      range: options.blockRange,
      ...blockHeaderFields(header),
      items,
    } as EntityBlock,
  };
}

interface ResolvedEnd {
  readonly range: SourceRange;
  readonly entity?: string;
  readonly cardinality?: Cardinality;
  readonly role?: string;
  readonly end: {
    readonly entry: Entry;
    readonly entityField: Field | undefined;
    readonly cardinalityField: Field | undefined;
  };
}

function readEnd(
  entry: Entry,
  key: string,
  diagnostics: Diagnostic[],
  namespace: string,
  sourceName: string | undefined,
): ResolvedEnd | undefined {
  const field = fieldOf(entry, key);
  if (field === undefined || field.record === undefined) {
    diagnostics.push(
      diag(
        namespace,
        "missing-field",
        `A relationship requires a \`${key}:\` end record with \`entity:\` and \`cardinality:\`.`,
        field?.range ?? entry.range,
        sourceName,
      ),
    );
    return undefined;
  }
  allowedFields(namespace, field.record, RELATIONSHIP_END_FIELDS, `\`${key}:\` end`, sourceName, diagnostics);
  const entityField = fieldByName(field.record, "entity");
  const cardinalityField = fieldByName(field.record, "cardinality");
  const entity = entityField?.value.trim();
  if (entityField === undefined || entity === undefined || entity === "") {
    diagnostics.push(
      diag(namespace, "missing-field", `The \`${key}:\` end requires an \`entity:\` reference.`, field.range, sourceName),
    );
  }
  let cardinality: Cardinality | undefined;
  if (cardinalityField === undefined) {
    diagnostics.push(
      diag(namespace, "missing-field", `The \`${key}:\` end requires a \`cardinality:\` value.`, field.range, sourceName),
    );
  } else if (!oneOf(CARDINALITIES, cardinalityField.value)) {
    diagnostics.push(
      unknownKind(namespace, "cardinality", cardinalityField.value, CARDINALITIES, cardinalityField.range, sourceName),
    );
  } else {
    cardinality = cardinalityField.value;
  }
  const role = readTextField(
    namespace,
    fieldByName(field.record, "role"),
    `The \`${key}:\` end \`role:\``,
    false,
    field.range,
    sourceName,
    diagnostics,
  );
  return {
    range: field.range,
    ...(entity === undefined || entity === "" ? {} : { entity }),
    ...(cardinality === undefined ? {} : { cardinality }),
    ...(role === undefined ? {} : { role }),
    end: { entry, entityField, cardinalityField },
  };
}

function readAttributes(
  entries: readonly Entry[],
  entityName: string,
  namespace: string,
  sourceName: string | undefined,
  diagnostics: Diagnostic[],
): EntityAttribute[] {
  const attributes: EntityAttribute[] = [];
  for (const entry of entries) {
    allowedFields(namespace, entry.fields, ATTRIBUTE_FIELDS, "Attribute", sourceName, diagnostics);
    const name = readNameField(
      namespace,
      fieldOf(entry, "name"),
      `An attribute of "${entityName}"`,
      entry.range,
      sourceName,
      diagnostics,
    );
    if (name === undefined) continue;
    const previous = attributes.find((attribute) => attribute.name === name);
    if (previous !== undefined) {
      diagnostics.push(
        createDiagnostic(
          `${namespace}#duplicate-name`,
          "error",
          `Attribute "${name}" is declared more than once on "${entityName}".`,
          {
            location: sourceName === undefined ? { range: entry.range } : { source: sourceName, range: entry.range },
            data: { namespace: "attribute", name },
            relatedLocations: [related(previous.range, `Attribute "${name}" was first declared here.`, sourceName)],
          },
        ),
      );
      continue;
    }
    const type = readTextField(
      namespace,
      fieldOf(entry, "type"),
      `Attribute "${name}" \`type:\``,
      false,
      entry.range,
      sourceName,
      diagnostics,
    );
    const keysField = fieldOf(entry, "keys");
    const keys: EntityKey[] = [];
    if (keysField !== undefined && keysField.collection === undefined) {
      diagnostics.push(
        diag(
          namespace,
          "missing-field",
          `Attribute "${name}" \`keys:\` opens a collection of registered key kinds.`,
          keysField.range,
          sourceName,
        ),
      );
    }
    for (const keyEntry of keysField?.collection?.entries ?? []) {
      if (keyEntry.value === undefined) {
        diagnostics.push(
          diag(
            namespace,
            "unknown-kind",
            "`keys:` entries are bare registered key kinds.",
            keyEntry.range,
            sourceName,
            { field: "keys", value: "" },
            vocabularySuggestion("", ENTITY_KEYS),
          ),
        );
        continue;
      }
      const value = keyEntry.value.trim();
      if (!oneOf(ENTITY_KEYS, value)) {
        diagnostics.push(unknownKind(namespace, "keys", value, ENTITY_KEYS, keyEntry.range, sourceName));
        continue;
      }
      if (keys.includes(value)) {
        diagnostics.push(
          diag(namespace, "duplicate-key", `Attribute "${name}" lists the key "${value}" twice.`, keyEntry.range, sourceName, {
            key: value,
            name,
          }),
        );
        continue;
      }
      keys.push(value);
    }
    const optional = readBooleanField(namespace, fieldOf(entry, "optional"), false, sourceName, diagnostics);
    const referencesField = fieldOf(entry, "references");
    let reference: { entity: string; attribute: string } | undefined;
    if (referencesField !== undefined) {
      if (referencesField.record === undefined) {
        diagnostics.push(
          diag(
            namespace,
            "missing-field",
            `Attribute "${name}" \`references:\` is a record of \`entity:\` and \`attribute:\`.`,
            referencesField.range,
            sourceName,
          ),
        );
      } else {
        allowedFields(namespace, referencesField.record, REFERENCE_FIELDS, "`references:`", sourceName, diagnostics);
        const targetEntity = fieldByName(referencesField.record, "entity")?.value.trim();
        const targetAttribute = fieldByName(referencesField.record, "attribute")?.value.trim();
        if (targetEntity === undefined || targetEntity === "" || targetAttribute === undefined || targetAttribute === "") {
          diagnostics.push(
            diag(
              namespace,
              "missing-field",
              `Attribute "${name}" \`references:\` requires an \`entity:\` and an \`attribute:\`.`,
              referencesField.range,
              sourceName,
            ),
          );
        } else if (!keys.includes("foreign")) {
          diagnostics.push(
            diag(
              namespace,
              "invalid-reference",
              `Attribute "${name}" declares \`references:\` without a \`foreign\` key.`,
              referencesField.range,
              sourceName,
              { reason: "requires key foreign" },
            ),
          );
        } else {
          reference = { entity: targetEntity, attribute: targetAttribute };
        }
      }
    }
    attributes.push({
      name,
      ...(type === undefined ? {} : { type }),
      ...(keysField === undefined ? {} : { keys }),
      optional,
      ...(reference === undefined ? {} : { reference }),
      range: entry.range,
    });
  }
  return attributes;
}

/* ------------------------------------------------------------------ *
 * `class`
 * ------------------------------------------------------------------ */

export function validateClassBlock(options: BlockEnvelope): {
  readonly block?: ClassBlock;
  readonly diagnostics: readonly Diagnostic[];
} {
  const diagnostics: Diagnostic[] = [];
  const sourceName = options.sourceName;
  const namespace = CLASS_NAMESPACE;
  const target: BodyTarget = { namespace, sourceName, diagnostics, bodyRange: options.blockRange };
  const header = readHeader(namespace, options.headerLines, sourceName, diagnostics);
  const text = (
    field: Field | undefined,
    owner: string,
    required: boolean,
    range: SourceRange,
  ): string | undefined => readTextField(namespace, field, owner, required, range, sourceName, diagnostics);
  const nameOf = (field: Field | undefined, owner: string, range: SourceRange): string | undefined =>
    readNameField(namespace, field, owner, range, sourceName, diagnostics);

  const { entries } = readEntries(options.bodyLines, 0, 0, target);
  if (entries.length === 0) {
    diagnostics.push(diag(namespace, "empty", "A class Block declares no items.", options.blockRange, sourceName));
  }

  const items: (ClassClassifier | ClassRelationship)[] = [];
  const classifiers = new Map<string, ClassClassifier>();
  const relationships: { readonly relationship: ClassRelationship; readonly entry: Entry }[] = [];

  for (const entry of entries) {
    const kindField = fieldOf(entry, "kind");
    const kind = kindField?.value ?? "";
    if (kindField === undefined || !oneOf(CLASS_ITEM_KINDS, kind)) {
      diagnostics.push(
        diag(
          namespace,
          "unknown-item",
          `"${kind}" is not a registered class item kind.`,
          kindField?.range ?? entry.range,
          sourceName,
          { value: kind },
          vocabularySuggestion(kind, CLASS_ITEM_KINDS),
        ),
      );
      continue;
    }
    if (kind === "relationship") {
      allowedFields(namespace, entry.fields, CLASS_RELATIONSHIP_FIELDS, "Relationship", sourceName, diagnostics);
      const form = readEnumField(
        namespace,
        fieldOf(entry, "form"),
        "A class relationship `form:`",
        CLASS_RELATIONSHIP_FORMS,
        entry.range,
        sourceName,
        diagnostics,
      );
      const from = nameOf(fieldOf(entry, "from"), "Relationship `from:`", entry.range);
      const to = nameOf(fieldOf(entry, "to"), "Relationship `to:`", entry.range);
      const label = text(fieldOf(entry, "label"), "Relationship `label:`", false, entry.range);
      const multiplicity = (
        key: "from-multiplicity" | "to-multiplicity",
      ): Cardinality | undefined => {
        const field = fieldOf(entry, key);
        if (field === undefined) return undefined;
        if (!oneOf(CARDINALITIES, field.value)) {
          diagnostics.push(unknownKind(namespace, key, field.value, CARDINALITIES, field.range, sourceName));
          return undefined;
        }
        return field.value;
      };
      const fromMultiplicity = multiplicity("from-multiplicity");
      const toMultiplicity = multiplicity("to-multiplicity");
      if (form === undefined || from === undefined || to === undefined) continue;
      if (
        (form === "inheritance" || form === "implementation") &&
        (fieldOf(entry, "from-multiplicity") !== undefined || fieldOf(entry, "to-multiplicity") !== undefined)
      ) {
        const field = fieldOf(entry, "from-multiplicity") ?? fieldOf(entry, "to-multiplicity");
        diagnostics.push(
          diag(
            namespace,
            "multiplicity-on-ranked-relationship",
            `A \`${form}\` relationship carries no multiplicity.`,
            field?.range ?? entry.range,
            sourceName,
            { field: field?.key ?? "from-multiplicity" },
          ),
        );
        continue;
      }
      const relationship: ClassRelationship = {
        kind: "relationship",
        form: form as ClassRelationshipForm,
        from,
        to,
        ...(label === undefined ? {} : { label }),
        ...(fromMultiplicity === undefined ? {} : { fromMultiplicity }),
        ...(toMultiplicity === undefined ? {} : { toMultiplicity }),
        range: entry.range,
      };
      items.push(relationship);
      relationships.push({ relationship, entry });
      continue;
    }

    const isInterface = kind === "interface";
    allowedFields(
      namespace,
      entry.fields,
      isInterface ? ["kind", "name", "label", "operations"] : CLASS_ITEM_FIELDS,
      isInterface ? "Interface" : "Class",
      sourceName,
      diagnostics,
    );
    const name = nameOf(fieldOf(entry, "name"), isInterface ? "An interface" : "A class", entry.range);
    if (name === undefined) continue;
    const first = classifiers.get(name);
    if (first !== undefined) {
      diagnostics.push(
        createDiagnostic(`${namespace}#duplicate-name`, "error", `"${name}" is declared more than once.`, {
          location: sourceName === undefined ? { range: entry.range } : { source: sourceName, range: entry.range },
          data: { namespace: "class", name },
          relatedLocations: [related(first.range, `"${name}" was first declared here.`, sourceName)],
        }),
      );
      continue;
    }
    const label = text(fieldOf(entry, "label"), `${isInterface ? "Interface" : "Class"} \`label:\``, false, entry.range);
    const abstract = isInterface
      ? false
      : readBooleanField(namespace, fieldOf(entry, "abstract"), false, sourceName, diagnostics);
    const attributesField = fieldOf(entry, "attributes");
    if (!isInterface && attributesField !== undefined && attributesField.collection === undefined) {
      diagnostics.push(
        diag(
          namespace,
          "missing-field",
          `"${name}" \`attributes:\` opens a collection of member records.`,
          attributesField.range,
          sourceName,
        ),
      );
    }
    const attributeEntries = attributesField?.collection?.entries ?? [];
    if (attributeEntries.length > MAX_CLASS_ATTRIBUTES) {
      diagnostics.push(
        limitExceeded(
          namespace,
          "attributes",
          attributeEntries.length,
          MAX_CLASS_ATTRIBUTES,
          attributesField?.range ?? entry.range,
          sourceName,
        ),
      );
    }
    const attributes = readClassAttributes(attributeEntries, name, namespace, sourceName, diagnostics);
    const operationsField = fieldOf(entry, "operations");
    if (operationsField !== undefined && operationsField.collection === undefined) {
      diagnostics.push(
        diag(
          namespace,
          "missing-field",
          `"${name}" \`operations:\` opens a collection of operation records.`,
          operationsField.range,
          sourceName,
        ),
      );
    }
    const operationEntries = operationsField?.collection?.entries ?? [];
    if (operationEntries.length > MAX_CLASS_OPERATIONS) {
      diagnostics.push(
        limitExceeded(
          namespace,
          "operations",
          operationEntries.length,
          MAX_CLASS_OPERATIONS,
          operationsField?.range ?? entry.range,
          sourceName,
        ),
      );
    }
    const operations = readClassOperations(
      operationEntries,
      name,
      attributes.map((attribute) => attribute.name),
      namespace,
      sourceName,
      diagnostics,
    );
    const classifier: ClassClassifier = {
      kind: isInterface ? "interface" : "class",
      name,
      ...(label === undefined ? {} : { label }),
      // An interface is an operation contract: it carries no `abstract` flag
      // and no attributes, so neither is published for one.
      ...(isInterface ? {} : { abstract, attributes }),
      operations,
      range: entry.range,
    };
    classifiers.set(name, classifier);
    items.push(classifier);
  }

  const classifierCount = classifiers.size;
  if (classifierCount > MAX_CLASS_CLASSIFIERS) {
    diagnostics.push(
      limitExceeded(namespace, "classes", classifierCount, MAX_CLASS_CLASSIFIERS, options.blockRange, sourceName),
    );
  }
  if (relationships.length > MAX_CLASS_RELATIONSHIPS) {
    diagnostics.push(
      limitExceeded(
        namespace,
        "relationships",
        relationships.length,
        MAX_CLASS_RELATIONSHIPS,
        options.blockRange,
        sourceName,
      ),
    );
  }

  let unresolved = false;
  const linked = new Set<string>();
  for (const { relationship, entry } of relationships) {
    for (const [key, value] of [
      ["from", relationship.from],
      ["to", relationship.to],
    ] as const) {
      const field = fieldOf(entry, key);
      const source = classifiers.get(value);
      if (source === undefined) {
        unresolved = true;
        diagnostics.push(
          createDiagnostic(`${namespace}#unresolved-reference`, "error", `"${value}" is not a declared class or interface.`, {
            location:
              sourceName === undefined || field === undefined
                ? { range: field?.range ?? relationship.range }
                : { source: sourceName, range: field.range },
            data: { namespace: "class", name: value },
          }),
        );
        continue;
      }
      linked.add(source.name);
    }
  }

  if (!unresolved) {
    for (const { relationship, entry } of relationships) {
      const from = classifiers.get(relationship.from);
      const to = classifiers.get(relationship.to);
      if (from === undefined || to === undefined) continue;
      if (relationship.form === "inheritance") {
        const sameKind = from.kind === to.kind;
        if (!sameKind) {
          diagnostics.push(
            diag(
              namespace,
              "invalid-relationship-target",
              `Inheritance between "${from.name}" (${from.kind}) and "${to.name}" (${to.kind}) mixes classifiers.`,
              entry.range,
              sourceName,
              { reason: "inheritance ends must both be classes or both be interfaces" },
            ),
          );
        }
      }
      if (relationship.form === "implementation" && to.kind !== "interface") {
        diagnostics.push(
          diag(
            namespace,
            "invalid-relationship-target",
            `Implementation target "${to.name}" is not an interface.`,
            entry.range,
            sourceName,
            { reason: "implementation target must be an interface" },
          ),
        );
      }
    }
  }

  if (!unresolved && !hasErrors(diagnostics)) {
    for (const classifier of classifiers.values()) {
      if (!linked.has(classifier.name)) {
        diagnostics.push(
          warn(
            namespace,
            "unrelated-class",
            `"${classifier.name}" appears in no relationship.`,
            classifier.range,
            sourceName,
            { name: classifier.name },
          ),
        );
      }
    }
    for (const cycle of inheritanceCycles(relationships)) {
      const participants = cycle.participants;
      const first = participants[0];
      if (first === undefined) continue;
      diagnostics.push(
        createDiagnostic(
          `${namespace}#inheritance-cycle`,
          "error",
          `Inheritance is cyclic: ${cycle.path.join(" → ")}.`,
          {
            location: sourceName === undefined ? { range: first } : { source: sourceName, range: first },
            data: { cycle: cycle.path },
            relatedLocations: participants
              .slice(1)
              .map((item) => related(item, "Another relationship in this inheritance cycle.", sourceName)),
          },
        ),
      );
    }
  }

  if (hasErrors(diagnostics)) return { diagnostics };
  return {
    diagnostics,
    block: {
      kind: "class",
      pluginVersion: CLASS_PLUGIN_VERSION,
      range: options.blockRange,
      ...blockHeaderFields(header),
      items,
    } as ClassBlock,
  };
}

function readClassAttributes(
  entries: readonly Entry[],
  className: string,
  namespace: string,
  sourceName: string | undefined,
  diagnostics: Diagnostic[],
): ClassAttribute[] {
  const attributes: ClassAttribute[] = [];
  for (const entry of entries) {
    allowedFields(namespace, entry.fields, CLASS_ATTRIBUTE_FIELDS, "Attribute", sourceName, diagnostics);
    const name = readNameField(
      namespace,
      fieldOf(entry, "name"),
      `An attribute of "${className}"`,
      entry.range,
      sourceName,
      diagnostics,
    );
    if (name === undefined) continue;
    const previous = attributes.find((attribute) => attribute.name === name);
    if (previous !== undefined) {
      diagnostics.push(
        createDiagnostic(
          `${namespace}#duplicate-name`,
          "error",
          `Attribute "${name}" is declared more than once on "${className}".`,
          {
            location: sourceName === undefined ? { range: entry.range } : { source: sourceName, range: entry.range },
            data: { namespace: "attribute", name },
            relatedLocations: [related(previous.range, `Attribute "${name}" was first declared here.`, sourceName)],
          },
        ),
      );
      continue;
    }
    const type = readTextField(
      namespace,
      fieldOf(entry, "type"),
      `Attribute "${name}" \`type:\``,
      false,
      entry.range,
      sourceName,
      diagnostics,
    );
    const visibility = readVisibility(fieldOf(entry, "visibility"), namespace, sourceName, diagnostics);
    attributes.push({
      name,
      ...(type === undefined ? {} : { type }),
      ...(visibility === undefined ? {} : { visibility }),
      static: readBooleanField(namespace, fieldOf(entry, "static"), false, sourceName, diagnostics),
      range: entry.range,
    });
  }
  return attributes;
}

function readClassOperations(
  entries: readonly Entry[],
  className: string,
  attributeNames: readonly string[],
  namespace: string,
  sourceName: string | undefined,
  diagnostics: Diagnostic[],
): ClassOperation[] {
  const operations: ClassOperation[] = [];
  for (const entry of entries) {
    allowedFields(namespace, entry.fields, OPERATION_FIELDS, "Operation", sourceName, diagnostics);
    const name = readNameField(
      namespace,
      fieldOf(entry, "name"),
      `An operation of "${className}"`,
      entry.range,
      sourceName,
      diagnostics,
    );
    if (name === undefined) continue;
    // Member names are unique within their class, so an operation may not
    // repeat a sibling operation or an attribute.
    const clash = operations.find((operation) => operation.name === name);
    const attributeClash = attributeNames.includes(name);
    if (clash !== undefined || attributeClash) {
      diagnostics.push(
        createDiagnostic(
          `${namespace}#duplicate-name`,
          "error",
          `Member "${name}" is declared more than once on "${className}".`,
          {
            location: sourceName === undefined ? { range: entry.range } : { source: sourceName, range: entry.range },
            data: { namespace: attributeClash ? "attribute" : "operation", name },
            ...(clash === undefined
              ? {}
              : {
                  relatedLocations: [
                    related(clash.range, `Member "${name}" was first declared here.`, sourceName),
                  ],
                }),
          },
        ),
      );
      continue;
    }
    const visibility = readVisibility(fieldOf(entry, "visibility"), namespace, sourceName, diagnostics);
    const returnType = readTextField(
      namespace,
      fieldOf(entry, "return-type"),
      `Operation "${name}" \`return-type:\``,
      false,
      entry.range,
      sourceName,
      diagnostics,
    );
    const parametersField = fieldOf(entry, "parameters");
    if (parametersField !== undefined && parametersField.collection === undefined) {
      diagnostics.push(
        diag(
          namespace,
          "missing-field",
          `Operation "${name}" \`parameters:\` opens a collection of parameter records.`,
          parametersField.range,
          sourceName,
        ),
      );
    }
    const parameterEntries = parametersField?.collection?.entries ?? [];
    if (parameterEntries.length > MAX_CLASS_PARAMETERS) {
      diagnostics.push(
        limitExceeded(
          namespace,
          "parameters",
          parameterEntries.length,
          MAX_CLASS_PARAMETERS,
          parametersField?.range ?? entry.range,
          sourceName,
        ),
      );
    }
    const parameters: ClassParameter[] = [];
    for (const parameterEntry of parameterEntries) {
      allowedFields(namespace, parameterEntry.fields, PARAMETER_FIELDS, "Parameter", sourceName, diagnostics);
      const parameterName = readNameField(
        namespace,
        fieldOf(parameterEntry, "name"),
        `A parameter of "${name}"`,
        parameterEntry.range,
        sourceName,
        diagnostics,
      );
      if (parameterName === undefined) continue;
      const previous = parameters.find((parameter) => parameter.name === parameterName);
      if (previous !== undefined) {
        diagnostics.push(
          createDiagnostic(
            `${namespace}#duplicate-name`,
            "error",
            `Parameter "${parameterName}" is declared more than once on "${name}".`,
            {
              location:
                sourceName === undefined
                  ? { range: parameterEntry.range }
                  : { source: sourceName, range: parameterEntry.range },
              data: { namespace: "parameter", name: parameterName },
              relatedLocations: [
                related(previous.range, `Parameter "${parameterName}" was first declared here.`, sourceName),
              ],
            },
          ),
        );
        continue;
      }
      const type = readTextField(
        namespace,
        fieldOf(parameterEntry, "type"),
        `Parameter "${parameterName}" \`type:\``,
        false,
        parameterEntry.range,
        sourceName,
        diagnostics,
      );
      parameters.push({
        name: parameterName,
        ...(type === undefined ? {} : { type }),
        range: parameterEntry.range,
      });
    }
    operations.push({
      name,
      ...(visibility === undefined ? {} : { visibility }),
      static: readBooleanField(namespace, fieldOf(entry, "static"), false, sourceName, diagnostics),
      ...(parametersField === undefined ? {} : { parameters }),
      ...(returnType === undefined ? {} : { returnType }),
      range: entry.range,
    });
  }
  return operations;
}

function readVisibility(
  field: Field | undefined,
  namespace: string,
  sourceName: string | undefined,
  diagnostics: Diagnostic[],
): ClassVisibility | undefined {
  if (field === undefined) return undefined;
  if (!oneOf(VISIBILITIES, field.value)) {
    diagnostics.push(unknownKind(namespace, "visibility", field.value, VISIBILITIES, field.range, sourceName));
    return undefined;
  }
  return field.value;
}

interface InheritanceCycle {
  readonly path: string[];
  readonly participants: readonly SourceRange[];
}

/**
 * Cycles and self-inheritance over the inheritance edges only. Multiple
 * inheritance is legal and unremarked: the compiler claims no language
 * semantics, so only a cycle is a structural fault.
 */
function inheritanceCycles(
  relationships: readonly { readonly relationship: ClassRelationship }[],
): readonly InheritanceCycle[] {
  const edges = relationships
    .map(({ relationship }) => relationship)
    .filter((relationship) => relationship.form === "inheritance");
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    const list = adjacency.get(edge.from) ?? [];
    list.push(edge.to);
    adjacency.set(edge.from, list);
  }
  const found = new Map<string, InheritanceCycle>();
  const state = new Map<string, "open" | "done">();
  const stack: string[] = [];
  const visit = (name: string): void => {
    state.set(name, "open");
    stack.push(name);
    for (const next of adjacency.get(name) ?? []) {
      if (state.get(next) === "open") {
        const start = stack.indexOf(next);
        const found_ = [...stack.slice(start), next];
        const path = rotateCycle(found_);
        const key = path.join("\u0000");
        if (!found.has(key)) {
          const participants: SourceRange[] = [];
          for (let index = 0; index + 1 < path.length; index += 1) {
            const from = path[index];
            const to = path[index + 1];
            const edge = edges.find(
              (candidate) => candidate.from === from && candidate.to === to,
            );
            if (edge !== undefined) participants.push(edge.range);
          }
          found.set(key, { path, participants });
        }
        continue;
      }
      if (state.get(next) === "done") continue;
      visit(next);
    }
    stack.pop();
    state.set(name, "done");
  };
  for (const name of adjacency.keys()) {
    if (state.get(name) === undefined) visit(name);
  }
  return [...found.values()];
}

/** Rotate a cycle to its lexicographically smallest start so one cycle reports once. */
function rotateCycle(path: string[]): string[] {
  const body = path.slice(0, -1);
  let best = body;
  for (let index = 1; index < body.length; index += 1) {
    const rotation = [...body.slice(index), ...body.slice(0, index)];
    if (rotation.join("\u0000") < best.join("\u0000")) best = rotation;
  }
  return [...best, best[0] ?? ""];
}

/* ------------------------------------------------------------------ *
 * Plugins
 * ------------------------------------------------------------------ */

const sequenceDescriptor = Object.freeze({
  type: SEQUENCE_PLUGIN_TYPE,
  version: SEQUENCE_PLUGIN_VERSION,
  title: "Sequence",
  summary: "Native sequence diagrams.",
  diagnosticNamespace: SEQUENCE_NAMESPACE,
  sourceSchema: sequenceSourceSchema,
  bodySyntax: Object.freeze({ id: SEQUENCE_BODY_SYNTAX_ID, version: SEQUENCE_BODY_SYNTAX_VERSION }),
  dataSchema: sequenceDataSchema,
});
export const sequencePlugin: AzeBlockPlugin = Object.freeze({ descriptor: sequenceDescriptor });

const stateDescriptor = Object.freeze({
  type: STATE_PLUGIN_TYPE,
  version: STATE_PLUGIN_VERSION,
  title: "State",
  summary: "Native state machines.",
  diagnosticNamespace: STATE_NAMESPACE,
  sourceSchema: stateSourceSchema,
  bodySyntax: Object.freeze({ id: STATE_BODY_SYNTAX_ID, version: STATE_BODY_SYNTAX_VERSION }),
  dataSchema: stateDataSchema,
});
export const statePlugin: AzeBlockPlugin = Object.freeze({ descriptor: stateDescriptor });

const entityDescriptor = Object.freeze({
  type: ENTITY_PLUGIN_TYPE,
  version: ENTITY_PLUGIN_VERSION,
  title: "Entity",
  summary: "Native entity relationships.",
  diagnosticNamespace: ENTITY_NAMESPACE,
  sourceSchema: entitySourceSchema,
  bodySyntax: Object.freeze({ id: ENTITY_BODY_SYNTAX_ID, version: ENTITY_BODY_SYNTAX_VERSION }),
  dataSchema: entityDataSchema,
});
export const entityPlugin: AzeBlockPlugin = Object.freeze({ descriptor: entityDescriptor });

const classDescriptor = Object.freeze({
  type: CLASS_PLUGIN_TYPE,
  version: CLASS_PLUGIN_VERSION,
  title: "Class",
  summary: "Native class diagrams.",
  diagnosticNamespace: CLASS_NAMESPACE,
  sourceSchema: classSourceSchema,
  bodySyntax: Object.freeze({ id: CLASS_BODY_SYNTAX_ID, version: CLASS_BODY_SYNTAX_VERSION }),
  dataSchema: classDataSchema,
});
export const classPlugin: AzeBlockPlugin = Object.freeze({ descriptor: classDescriptor });
