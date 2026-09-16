/**
 * Machine-readable AzeMark 2 grammar: the derivation seam behind
 * `azeforge grammar [--json] [--directive <type>]`.
 *
 * Every directive description is derived from the tables that gate
 * validation (see the family tables imported below); this module adds only
 * the vocabulary the tables do not carry — each field's `valueType`, whether
 * it is required, and the enumerations a validator accepts. Pure: no
 * filesystem, process, or engine access.
 */

import type { JsonValue } from "./model.js";
import { getBuiltInRegistry } from "./registry.js";
import { TOOL_VERSION } from "./tool-version.js";
import { GRAMMAR_SCHEMA_ID, GRAMMAR_SCHEMA_VERSION } from "./grammar-json.js";
import { MAX_IMAGE_BYTES, MAX_IMAGE_DIMENSION_PX, MAX_IMAGE_PIXELS } from "./assets.js";
import { CompilerConfigurationError } from "./configuration-error.js";
import { DEFAULT_DIAGNOSTIC_LIMITS } from "./diagnostics.js";
import { KNOWN_METADATA_KEYS, MAX_NESTING_DEPTH } from "./parse.js";
import {
  AXIS_CHILD_FIELDS,
  AXIS_SCALES,
  BAR_FIELDS,
  CHART_SERIES_FIELDS_BY_KIND,
  CHART_SERIES_KINDS,
  CHART_TOP_LEVEL_FIELDS,
  CHART_TYPES,
  DOMAIN_FIELDS,
  FUNCTION_FIELDS,
  MAX_BAR_CATEGORIES,
  MAX_BINS,
  MAX_CHART_SERIES,
  MAX_HISTOGRAM_VALUES,
  MAX_LABEL_CHARS,
  MAX_PARAMETERS,
  MAX_PLOT_SERIES,
  MAX_POINTS_PER_SERIES,
  MAX_SAMPLES,
  PLOT_SERIES_KINDS,
  PLOT_TOP_LEVEL_FIELDS,
  POINT_FIELDS,
  POINT_SERIES_FIELDS,
} from "./plot.js";
import {
  CONSTRUCTION_KINDS,
  FIELDS_BY_KIND as GEOMETRY_FIELDS_BY_KIND,
  GEOMETRY_BOUNDS_KEYS,
  GEOMETRY_HEADER_FIELDS,
  MARK_KINDS,
  MAX_COORDINATE_MAGNITUDE,
  MAX_EQUAL_MARK_GROUPS,
  MAX_EQUAL_MARK_SEGMENTS,
  MAX_GEOMETRY_DECLARATIONS,
  MAX_GEOMETRY_DIMENSION_PX,
  MAX_GEOMETRY_LABEL_CHARS,
  MAX_POLYGON_VERTICES,
  PRIMITIVE_KINDS,
} from "./geometry.js";
import {
  BLOCK_FIELDS,
  DECLARATION_KINDS as CONTROL_DECLARATION_KINDS,
  EDGE_FIELDS as CONTROL_EDGE_FIELDS,
  FLOWS as CONTROL_FLOWS,
  HEADER_FIELDS as CONTROL_HEADER_FIELDS,
  MAX_CONTROL_BLOCKS,
  MAX_CONTROL_DECLARATIONS,
  MAX_CONTROL_EDGES,
  MAX_CONTROL_LABEL_CODE_POINTS,
  MAX_CONTROL_SIGNS_PER_SUM,
  MAX_CONTROL_STUBS,
  MAX_CONTROL_SUMS,
  MAX_CONTROL_TOTAL_LABEL_CODE_POINTS,
  SIGNS,
  STUB_FIELDS,
  SUM_FIELDS,
} from "./control.js";
import {
  BOUNDS_KEYS,
  FIELDS_BY_KIND as FREE_BODY_FIELDS_BY_KIND,
  HEADER_FIELDS as FREE_BODY_HEADER_FIELDS,
  MAX_FREE_BODY_COORDINATE_MAGNITUDE,
  MAX_FREE_BODY_DECLARATIONS,
  MAX_FREE_BODY_DIMENSION_PX,
  MAX_FREE_BODY_LABEL_CHARS,
  MAX_FREE_BODY_POLYGON_VERTICES,
  MOMENT_DIRECTIONS,
  STYLES,
} from "./free-body.js";
import {
  DECLARATION_KINDS as DIAGRAM_DECLARATION_KINDS,
  DIAGRAM_HEADER_FIELDS,
  EDGE_FIELDS as DIAGRAM_EDGE_FIELDS,
  FLOWS as DIAGRAM_FLOWS,
  GROUP_FIELDS as DIAGRAM_GROUP_FIELDS,
  DIRECTIONS,
  MAX_DIAGRAM_DECLARATIONS,
  MAX_DIAGRAM_EDGES,
  MAX_DIAGRAM_GROUPS,
  MAX_DIAGRAM_GROUP_DEPTH,
  MAX_DIAGRAM_LABEL_CODE_POINTS,
  MAX_DIAGRAM_LABEL_LINES,
  MAX_DIAGRAM_NODES,
  MAX_DIAGRAM_PARALLEL_EDGES,
  MAX_DIAGRAM_PORTS,
  MAX_DIAGRAM_PORTS_PER_NODE,
  MAX_DIAGRAM_TOTAL_LABEL_CODE_POINTS,
  MODES,
  NODE_FIELDS,
  PORT_FIELDS,
  SHAPES,
  SIDES,
} from "./diagram.js";
import {
  ALT_FIELDS,
  ATTRIBUTE_FIELDS,
  CARDINALITIES,
  CLASS_ATTRIBUTE_FIELDS,
  CLASS_ITEM_FIELDS,
  CLASS_ITEM_KINDS,
  CLASS_RELATIONSHIP_FIELDS,
  CLASS_RELATIONSHIP_FORMS,
  DIVISION_FIELDS,
  ENTITY_ITEM_FIELDS,
  ENTITY_KEYS,
  ENTITY_RELATIONSHIP_FIELDS,
  LOOP_FIELDS,
  MAX_CLASS_ATTRIBUTES,
  MAX_CLASS_CLASSIFIERS,
  MAX_CLASS_OPERATIONS,
  MAX_CLASS_PARAMETERS,
  MAX_CLASS_RELATIONSHIPS,
  MAX_ENTITY_ATTRIBUTES,
  MAX_ENTITY_ENTITIES,
  MAX_ENTITY_RELATIONSHIPS,
  MAX_SEQUENCE_ALT_DIVISIONS,
  MAX_SEQUENCE_FRAGMENT_DEPTH,
  MAX_SEQUENCE_NOTE_SPAN,
  MAX_SEQUENCE_NOTE_TEXT_CHARS,
  MAX_SEQUENCE_NOTE_TEXT_LINES,
  MAX_SEQUENCE_PARTICIPANTS,
  MAX_SEQUENCE_TIMELINE_ITEMS,
  MAX_STATE_DEPTH,
  MAX_STATE_STATES,
  MAX_STATE_TRANSITIONS,
  MESSAGE_FIELDS,
  MESSAGE_FORMS,
  HEADER_FIELDS as MODELS_HEADER_FIELDS,
  MODELS_INTERFACE_FIELDS,
  MODELS_PSEUDO_STATE_FIELDS,
  NESTED_STATE_KINDS,
  NOTE_FIELDS,
  OPERATION_FIELDS,
  PARAMETER_FIELDS,
  PARTICIPANT_FIELDS,
  PARTICIPANT_KINDS,
  REFERENCE_FIELDS,
  RELATIONSHIP_END_FIELDS,
  SEQUENCE_SECTIONS,
  STATE_ITEM_FIELDS,
  TIMELINE_KINDS,
  TOP_LEVEL_STATE_KINDS,
  TRANSITION_FIELDS,
  VISIBILITIES,
} from "./models.js";
import {
  ARROW_FIELDS,
  INTERVAL_FIELDS,
  MARKER_FIELDS,
  MAX_TIMING_ARROWS,
  MAX_TIMING_GROUPS,
  MAX_TIMING_GROUP_DEPTH,
  MAX_TIMING_INTERVALS,
  MAX_TIMING_MARKERS,
  MAX_TIMING_SIGNALS,
  MAX_TIMING_SPAN,
  MAX_TIMING_TEXT_CODE_POINTS,
  MAX_TIMING_TOTAL_INTERVALS,
  MAX_TIMING_WAVE_CHARS,
  MAX_TIMING_WIDTH,
  SCALE_WORDS,
  SIGNAL_FIELDS,
  TIMING_BODY_KINDS,
  STATE_WORDS,
  TIME_UNITS,
  GROUP_FIELDS as TIMING_GROUP_FIELDS,
  HEADER_FIELDS as TIMING_HEADER_FIELDS,
} from "./timing.js";
import {
  FIELDS_BY_KIND as CIRCUIT_FIELDS_BY_KIND,
  FLOWS as CIRCUIT_FLOWS,
  HEADER_FIELDS as CIRCUIT_HEADER_FIELDS,
  CURRENT_DIRECTIONS,
  GATE_INPUTS,
  MAX_CIRCUIT_ANNOTATIONS,
  MAX_CIRCUIT_COMPONENTS,
  MAX_CIRCUIT_NODES,
  MAX_CIRCUIT_RELATIONS,
  MODE_VALUES,
  NODE_ROLES,
  ORIENTATIONS,
} from "./circuit.js";
import {
  FORMULA_HEADER_FIELDS,
  REACTION_HEADER_FIELDS,
  STRUCTURE_HEADER_FIELDS,
} from "./chemistry-schemas.js";
import {
  ATOM_FIELDS,
  BOND_FIELDS,
  ELEMENT_SYMBOLS,
  LABEL_FIELDS,
  MAX_FORMULA_CHARGE,
  MAX_FORMULA_EXPRESSION_CHARS,
  MAX_GROUP_NESTING,
  MAX_ISOTOPE_MASS,
  MAX_REACTION_CONDITION_CHARS,
  MAX_REACTION_SPECIES,
  MAX_REACTION_SPECIES_CHARS,
  MAX_STRUCTURE_ATOMS,
  MAX_STRUCTURE_HEIGHT,
  MAX_STRUCTURE_LABEL_CHARS,
  MAX_STRUCTURE_WIDTH,
  MAX_SUBSCRIPT,
  STRUCTURE_OPENERS,
} from "./chemistry.js";
import {
  CALLOUT_HEADER_FIELDS,
  CALLOUT_VARIANTS,
} from "./callout-schemas.js";
import {
  DERIVATION_HEADER_FIELDS,
  DERIVATION_STEP_FIELDS,
} from "./derivation.js";
import {
  EQUATION_HEADER_FIELDS,
  MAX_EQUATION_SOURCE_LENGTH,
  MAX_EQUATION_TEX_LENGTH,
} from "./equation.js";
import {
  FIGURE_HEADER_FIELDS,
} from "./figure.js";
import {
  MAX_MERMAID_SOURCE_LENGTH,
  MAX_MERMAID_TEXT_LENGTH,
  MERMAID_HEADER_FIELDS,
  SUPPORTED_DIAGRAMS,
} from "./mermaid.js";
import {
  ALIGNMENTS,
  MAX_TABLE_COLUMNS,
  MAX_TABLE_GROUPS,
  MAX_TABLE_MATH_CELL_CHARS,
  MAX_TABLE_ROWS,
  MAX_TABLE_TEXT_CELL_CHARS,
  TABLE_COLUMN_FIELDS,
  TABLE_COLUMN_TYPES,
  TABLE_GROUP_FIELDS,
} from "./table-parse.js";
import {
  BIBLIOGRAPHY_AUTHOR_FIELDS,
  BIBLIOGRAPHY_ENTRY_FIELDS,
  BIBLIOGRAPHY_ENTRY_TYPES,
  MAX_BIBLIOGRAPHY_ENTRIES,
} from "./bibliography.js";
import {
  ALGORITHM_STATEMENT_KEYS,
  MAX_ALGORITHM_NESTING_DEPTH,
  MAX_ALGORITHM_PARAMETERS,
  MAX_ALGORITHM_STATEMENTS,
  MAX_PSEUDOCODE_EXPRESSION_LENGTH,
} from "./algorithm.js";
import {
  MAX_STATEMENT_MARKDOWN_CHARS,
  STATEMENT_HEADER_FIELDS,
  STATEMENT_KINDS,
} from "./statement.js";
import {
  MAX_EXAMPLE_GIVENS,
  MAX_EXAMPLE_MARKDOWN_CHARS,
  MAX_EXAMPLE_STEPS,
  REGISTERED_FIELDS,
  STEP_FIELDS,
} from "./example.js";

/** Closed field-value vocabulary. Extend only when a validator gains a value kind. */
export type FieldValueType =
  | "identifier"
  | "text"
  | "prose"
  | "integer"
  | "decimal"
  | "quantity"
  | "boolean"
  | "enum"
  | "expression"
  | "record"
  | "record-list"
  | "string-list"
  | "point-list"
  | "name";

export interface GrammarField {
  readonly key: string;
  readonly valueType: FieldValueType;
  readonly required: boolean;
  /** Closed accepted spellings, present for `enum` fields. */
  readonly values?: readonly string[];
}

/** A nested key group: the child keys a `record`/`record-list` field accepts. */
export interface GrammarGroup {
  readonly of: string;
  readonly fields?: readonly GrammarField[];
  /** Present when the named key is a section holding records, not one record. */
  readonly records?: readonly GrammarRecord[];
}

export interface GrammarHeader {
  readonly separator: "----";
  readonly fields: readonly GrammarField[];
  readonly groups?: readonly GrammarGroup[];
}

export interface GrammarRecord {
  readonly kind: string;
  readonly fields: readonly GrammarField[];
  readonly groups?: readonly GrammarGroup[];
}

export type GrammarBodyForm =
  | "record-list"
  | "keyed-sections"
  | "scalar-lines"
  | "none";

export interface GrammarBodySpec {
  readonly form: GrammarBodyForm;
  /** The record opener spelling, present for `record-list` forms. */
  readonly recordOpener?: string;
  readonly records?: readonly GrammarRecord[];
  /** Leading `key: value` lines, for forms that allow them beside records. */
  readonly fields?: readonly GrammarField[];
  readonly groups?: readonly GrammarGroup[];
}

/** The body spec plus the JSON Schema of the parsed record collection. */
export interface GrammarBody extends GrammarBodySpec {
  readonly schema: JsonValue;
}

export interface GrammarDirective {
  readonly type: string;
  readonly title: string;
  readonly pluginVersion: string;
  readonly namespace: string;
  readonly bodySyntax: Readonly<{ id: string; version: string }>;
  readonly header: GrammarHeader;
  readonly body: GrammarBody;
  /** Per-directive ceilings, identical to the values `capabilities` reports. */
  readonly limits: Readonly<Record<string, JsonValue>>;
}

/** The hand-authored half of one directive: everything else comes from the registry. */
export interface DirectiveSpec {
  readonly header: GrammarHeader;
  readonly body: GrammarBodySpec;
  readonly limits: Readonly<Record<string, JsonValue>>;
}

export interface GrammarFrontMatter {
  readonly delimiters: readonly string[];
  readonly fields: readonly GrammarField[];
}

export interface GrammarDocumentEnvelope {
  readonly frontMatter: GrammarFrontMatter;
  readonly fences: Readonly<{
    readonly outer: string;
    readonly nested: string;
    readonly separator: string;
    readonly indent: number;
  }>;
  readonly comments: Readonly<{ readonly prefix: string }>;
  readonly identifier: Readonly<{ readonly pattern: string; readonly scope: "document" }>;
}

export interface GrammarReport {
  readonly schema: typeof GRAMMAR_SCHEMA_ID;
  readonly schemaVersion: typeof GRAMMAR_SCHEMA_VERSION;
  readonly tool: Readonly<{ name: "azeforge"; version: typeof TOOL_VERSION }>;
  readonly azemarkVersions: readonly [2];
  readonly document: GrammarDocumentEnvelope;
  readonly directives: readonly GrammarDirective[];
  readonly limits: Readonly<Record<string, JsonValue>>;
}

type FieldTypes = Readonly<Record<string, FieldValueType>>;
type FieldValues = Readonly<Record<string, readonly string[]>>;

/**
 * Build the field list for one key table. The key set (and its order) is the
 * parser's; `types` and `required` may only annotate keys the table declares.
 */
export function fieldsFrom(
  keys: readonly string[],
  types: FieldTypes,
  required: readonly string[] = [],
  values: FieldValues = {},
): readonly GrammarField[] {
  return Object.freeze(
    keys.map((key) => {
      const valueType = types[key];
      if (valueType === undefined) {
        throw new Error(`Grammar is missing a valueType for field "${key}".`);
      }
      const enumValues = values[key];
      return Object.freeze({
        key,
        valueType,
        required: required.includes(key),
        ...(enumValues === undefined ? {} : { values: enumValues }),
      });
    }),
  );
}

/** The parser's key table for one record kind, or a loud failure. */
export function fieldKeys(
  table: Readonly<Record<string, readonly string[]>>,
  kind: string,
): readonly string[] {
  const keys = table[kind];
  if (keys === undefined) {
    throw new Error(`Grammar is missing a field table for record "${kind}".`);
  }
  return keys;
}

export function headerFrom(
  keys: readonly string[],
  types: FieldTypes,
  required: readonly string[] = [],
  values: FieldValues = {},
  groups: readonly GrammarGroup[] = [],
): GrammarHeader {
  return Object.freeze({
    separator: "----",
    fields: fieldsFrom(keys, types, required, values),
    ...(groups.length === 0 ? {} : { groups }),
  });
}

export function group(
  of: string,
  keys: readonly string[],
  types: FieldTypes,
  required: readonly string[] = [],
  values: FieldValues = {},
): GrammarGroup {
  return Object.freeze({
    of,
    fields: fieldsFrom(keys, types, required, values),
  });
}

/** A section key whose contents are records rather than one record's keys. */
export function sectionOf(
  of: string,
  records: readonly GrammarRecord[],
): GrammarGroup {
  return Object.freeze({ of, records });
}

export function record(
  kind: string,
  fields: readonly GrammarField[],
  groups: readonly GrammarGroup[] = [],
): GrammarRecord {
  return Object.freeze({
    kind,
    fields,
    ...(groups.length === 0 ? {} : { groups }),
  });
}

/** Records derived from a parser kind table plus a per-kind field table. */
export function recordsFrom(
  kinds: readonly string[],
  fieldsByKind: Readonly<Record<string, readonly string[]>>,
  types: FieldTypes,
  required: Readonly<Record<string, readonly string[]>>,
  values: FieldValues = {},
  groups: Readonly<Record<string, readonly GrammarGroup[]>> = {},
): readonly GrammarRecord[] {
  return Object.freeze(
    kinds.map((kind) => {
      const keys = fieldsByKind[kind];
      if (keys === undefined) {
        throw new Error(`Grammar is missing a field table for record "${kind}".`);
      }
      return record(
        kind,
        fieldsFrom(keys, types, required[kind] ?? [], values),
        groups[kind] ?? [],
      );
    }),
  );
}

export function recordList(
  recordOpener: string,
  records: readonly GrammarRecord[],
  extra: {
    readonly fields?: readonly GrammarField[];
    readonly groups?: readonly GrammarGroup[];
  } = {},
): GrammarBodySpec {
  return Object.freeze({
    form: "record-list",
    recordOpener,
    records,
    ...extra,
  });
}

export function scalarLines(
  fields: readonly GrammarField[],
  groups: readonly GrammarGroup[] = [],
): GrammarBodySpec {
  return Object.freeze({
    form: "scalar-lines",
    fields,
    ...(groups.length === 0 ? {} : { groups }),
  });
}

export function keyedSections(
  fields: readonly GrammarField[],
  records: readonly GrammarRecord[] = [],
  groups: readonly GrammarGroup[] = [],
): GrammarBodySpec {
  return Object.freeze({
    form: "keyed-sections",
    fields,
    ...(records.length === 0 ? {} : { records }),
    ...(groups.length === 0 ? {} : { groups }),
  });
}

/**
 * Front matter is the document envelope, not a directive: the key set is the
 * parser's `KNOWN_METADATA_KEYS`; `x-*` extensions are the open tail.
 */
const FRONT_MATTER_TYPES: FieldTypes = Object.freeze({
  azemark: "integer",
  author: "string-list",
  title: "text",
  theme: "text",
  outputs: "string-list",
  defaults: "record",
  "citation-style": "enum",
});
const FRONT_MATTER_VALUES: FieldValues = Object.freeze({
  outputs: Object.freeze(["html", "svg", "png", "pdf"]),
  "citation-style": Object.freeze(["numeric", "author-year"]),
});

/** AzeMark 2 block identifier: one lower-kebab name, document-scoped. */
const BLOCK_IDENTIFIER_PATTERN = "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$";

/* ------------------------------------------------------------------ *
 * Plot
 * ------------------------------------------------------------------ */

const plotAxisTypes = { label: "text", scale: "enum", min: "decimal", max: "decimal" } as const;
const plotAxisValues = { scale: AXIS_SCALES } as const;

const plotAxisGroups = [
  group("x-axis", AXIS_CHILD_FIELDS, plotAxisTypes, [], plotAxisValues),
  group("y-axis", AXIS_CHILD_FIELDS, plotAxisTypes, [], plotAxisValues),
];

const plotPointTypes = {
  x: "decimal",
  y: "decimal",
  error: "decimal",
  "error-low": "decimal",
  "error-high": "decimal",
} as const;

/**
 * `kind` is the record discriminator: its spelling is the record's own kind
 * (`PLOT_SERIES_KINDS`), which the one series field table cannot express as a
 * per-kind `values` entry.
 */
const plotSeriesTypes = {
  kind: "enum",
  label: "text",
  variable: "identifier",
  expression: "expression",
  domain: "record",
  samples: "integer",
  points: "point-list",
} as const;

/**
 * A function series is refused without `expression:` (`#missing-expression`)
 * or `domain:` (`#missing-domain`); a point series without `points:`
 * (`#missing-points`). `variable:` is optional — it defaults to `x`.
 */
const plotSeriesRequired = {
  function: ["kind", "expression", "domain"],
  line: ["kind", "points"],
  scatter: ["kind", "points"],
} as const;

/**
 * `domain:` requires both bounds (`#missing-domain`); a point requires `x` and
 * `y` (`#invalid-datum`), and carries either one symmetric `error` or an
 * `error-low`/`error-high` pair (`#mismatched-error-fields`).
 */
const plotSeriesGroups = {
  function: [group("domain", DOMAIN_FIELDS, { min: "decimal", max: "decimal" }, ["min", "max"])],
  line: [group("points", POINT_FIELDS, plotPointTypes, ["x", "y"])],
  scatter: [group("points", POINT_FIELDS, plotPointTypes, ["x", "y"])],
};

const plotSpec: DirectiveSpec = {
  header: headerFrom(
    PLOT_TOP_LEVEL_FIELDS,
    {
      id: "identifier",
      number: "boolean",
      width: "integer",
      height: "integer",
      legend: "boolean",
      grid: "boolean",
      parameters: "record",
      "x-axis": "record",
      "y-axis": "record",
    },
    [],
    {},
    plotAxisGroups,
  ),
  body: recordList(
    "-",
    recordsFrom(
      PLOT_SERIES_KINDS,
      { function: FUNCTION_FIELDS, line: POINT_SERIES_FIELDS, scatter: POINT_SERIES_FIELDS },
      plotSeriesTypes,
      plotSeriesRequired,
      {},
      plotSeriesGroups,
    ),
  ),
  limits: {
    maxSeries: MAX_PLOT_SERIES,
    maxPointsPerSeries: MAX_POINTS_PER_SERIES,
    maxSamples: MAX_SAMPLES,
    maxParameters: MAX_PARAMETERS,
    maxLabelChars: MAX_LABEL_CHARS,
  },
};

/* ------------------------------------------------------------------ *
 * Chart
 * ------------------------------------------------------------------ */

const chartBarTypes = {
  category: "text",
  value: "decimal",
  error: "decimal",
  "error-low": "decimal",
  "error-high": "decimal",
} as const;

/** A bar requires `category` and `value` (`#invalid-datum`); `error` or
 * `error-low`/`error-high` carry the uncertainty (`#mismatched-error-fields`). */
const chartBarGroups = [group("bars", BAR_FIELDS, chartBarTypes, ["category", "value"])];

const chartSeriesTypes = {
  label: "text",
  bars: "record-list",
  values: "string-list",
  edges: "string-list",
  "bin-count": "integer",
  min: "decimal",
  max: "decimal",
} as const;

/**
 * A bar-family series requires `bars:` (`#missing-bars`); a histogram series
 * requires `values:` (`#missing-values`). `edges:` and `bin-count:`/`min:`/
 * `max:` are alternatives the validator pairs up (`#missing-binning`).
 */
const chartSeriesRequired = {
  bars: ["bars"],
  histogram: ["values"],
} as const;

const chartSpec: DirectiveSpec = {
  header: headerFrom(
    CHART_TOP_LEVEL_FIELDS,
    {
      id: "identifier",
      number: "boolean",
      type: "enum",
      width: "integer",
      height: "integer",
      legend: "boolean",
      grid: "boolean",
      "x-label": "text",
      "y-label": "text",
      "y-min": "decimal",
      "y-max": "decimal",
    },
    ["type"],
    { type: CHART_TYPES },
  ),
  body: recordList(
    "-",
    recordsFrom(
      CHART_SERIES_KINDS,
      CHART_SERIES_FIELDS_BY_KIND,
      chartSeriesTypes,
      chartSeriesRequired,
      {},
      { bars: chartBarGroups },
    ),
  ),
  limits: {
    maxSeries: MAX_CHART_SERIES,
    maxHistogramValues: MAX_HISTOGRAM_VALUES,
    maxBins: MAX_BINS,
    maxBarCategories: MAX_BAR_CATEGORIES,
    maxLabelChars: MAX_LABEL_CHARS,
  },
};




const GEOMETRY_HEADER_TYPES: Readonly<Record<string, FieldValueType>> = Object.freeze({
  id: "identifier",
  number: "boolean",
  width: "integer",
  height: "integer",
  bounds: "record",
});



const GEOMETRY_BOUNDS_TYPES: Readonly<Record<string, FieldValueType>> = Object.freeze({
  "min-x": "decimal",
  "min-y": "decimal",
  "max-x": "decimal",
  "max-y": "decimal",
});

/** The parser's `REGISTERED_KINDS`, in its order: primitives, constructions, marks. */
const GEOMETRY_KINDS = [...PRIMITIVE_KINDS, ...CONSTRUCTION_KINDS, ...MARK_KINDS] as const;

const GEOMETRY_FIELD_TYPES: Readonly<Record<string, FieldValueType>> = Object.freeze({
  kind: "enum",
  name: "identifier",
  label: "text",
  x: "decimal",
  y: "decimal",
  visible: "boolean",
  style: "enum",
  from: "name",
  to: "name",
  "through-first": "name",
  "through-second": "name",
  origin: "name",
  through: "name",
  center: "name",
  radius: "decimal",
  point: "name",
  "start-angle": "decimal",
  "end-angle": "decimal",
  direction: "enum",
  vertices: "string-list",
  first: "name",
  second: "name",
  third: "name",
  pick: "integer",
  circle: "name",
  at: "name",
  measure: "enum",
  segment: "name",
  group: "identifier",
  segments: "string-list",
});

/** `kind` opens every declaration (`- kind:`), so every record requires it. */
const GEOMETRY_REQUIRED: Readonly<Record<string, readonly string[]>> = Object.freeze({
  point: ["kind", "name", "x", "y"],
  segment: ["kind", "name", "from", "to"],
  line: ["kind", "name", "through-first", "through-second"],
  ray: ["kind", "name", "origin", "through"],
  // `radius:` and `point:` are one-of; neither is required on its own.
  circle: ["kind", "name", "center"],
  arc: ["kind", "name", "center", "radius", "start-angle", "end-angle", "direction"],
  polygon: ["kind", "name", "vertices"],
  midpoint: ["kind", "name", "from", "to"],
  intersection: ["kind", "name", "first", "second"],
  // `at:` and `from:` are one-of; neither is required on its own.
  "tangent-line": ["kind", "name", "circle"],
  "perpendicular-foot": ["kind", "name", "from", "to"],
  "perpendicular-line": ["kind", "name", "through", "to"],
  "parallel-line": ["kind", "name", "through", "to"],
  // `label:` and `measure:` are one-of; neither is required on its own.
  "angle-mark": ["kind", "first", "second", "third"],
  // `segment:` and `from:`/`to:` are one-of; neither is required on its own.
  "length-mark": ["kind"],
  "equal-marks": ["kind", "group", "segments"],
  "right-angle-mark": ["kind", "first", "second", "third"],
});

const GEOMETRY_VALUES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  kind: GEOMETRY_KINDS,
  style: ["solid", "dashed"],
  direction: ["cw", "ccw"],
});

const GEOMETRY_RECORDS: readonly GrammarRecord[] = [
  ...recordsFrom(
    PRIMITIVE_KINDS,
    GEOMETRY_FIELDS_BY_KIND,
    GEOMETRY_FIELD_TYPES,
    GEOMETRY_REQUIRED,
    GEOMETRY_VALUES,
  ),
  ...recordsFrom(
    CONSTRUCTION_KINDS,
    GEOMETRY_FIELDS_BY_KIND,
    GEOMETRY_FIELD_TYPES,
    GEOMETRY_REQUIRED,
    GEOMETRY_VALUES,
  ),
  // `measure:` is a per-kind selector, so each mark carries its own spelling.
  ...recordsFrom(["angle-mark"], GEOMETRY_FIELDS_BY_KIND, GEOMETRY_FIELD_TYPES, GEOMETRY_REQUIRED, {
    ...GEOMETRY_VALUES,
    measure: ["angle"],
  }),
  ...recordsFrom(["length-mark"], GEOMETRY_FIELDS_BY_KIND, GEOMETRY_FIELD_TYPES, GEOMETRY_REQUIRED, {
    ...GEOMETRY_VALUES,
    measure: ["length"],
  }),
  ...recordsFrom(
    ["equal-marks", "right-angle-mark"],
    GEOMETRY_FIELDS_BY_KIND,
    GEOMETRY_FIELD_TYPES,
    GEOMETRY_REQUIRED,
    GEOMETRY_VALUES,
  ),
];

const geometrySpec: DirectiveSpec = {
  header: headerFrom(GEOMETRY_HEADER_FIELDS, GEOMETRY_HEADER_TYPES, [], {}, [
    group("bounds", GEOMETRY_BOUNDS_KEYS, GEOMETRY_BOUNDS_TYPES, GEOMETRY_BOUNDS_KEYS),
  ]),
  body: recordList("-", GEOMETRY_RECORDS),
  limits: {
    maxDeclarations: MAX_GEOMETRY_DECLARATIONS,
    maxPolygonVertices: MAX_POLYGON_VERTICES,
    maxEqualMarkSegments: MAX_EQUAL_MARK_SEGMENTS,
    maxEqualMarkGroups: MAX_EQUAL_MARK_GROUPS,
    maxLabelChars: MAX_GEOMETRY_LABEL_CHARS,
    maxCoordinateMagnitude: MAX_COORDINATE_MAGNITUDE,
    maxDimensionPx: MAX_GEOMETRY_DIMENSION_PX,
  },
};

/**
 * `control` — src/control.ts. Header keys come from `CONTROL_HEADER_FIELDS`; the body
 * is the flat `- kind:` declaration list over `CONTROL_DECLARATION_KINDS`, each kind
 * carrying the closed field set the parser registers for it. Every declaration
 * is flat, so no body group exists.
 */
const controlSpec: DirectiveSpec = {
  header: headerFrom(
    CONTROL_HEADER_FIELDS,
    {
      flow: "enum",
      id: "identifier",
      number: "boolean",
      title: "text",
      description: "text",
    },
    [],
    { flow: CONTROL_FLOWS },
  ),
  body: recordList(
    "-",
    recordsFrom(
      CONTROL_DECLARATION_KINDS,
      {
        block: BLOCK_FIELDS,
        sum: SUM_FIELDS,
        input: STUB_FIELDS,
        output: STUB_FIELDS,
        edge: CONTROL_EDGE_FIELDS,
      },
      {
        name: "name",
        tf: "text",
        label: "text",
        signs: "string-list",
        from: "name",
        to: "name",
      },
      {
        block: ["name", "tf"],
        sum: ["name", "signs"],
        input: ["name", "label"],
        output: ["name", "label"],
        edge: ["from", "to"],
      },
      { signs: SIGNS },
    ),
  ),
  limits: {
    maxDeclarations: MAX_CONTROL_DECLARATIONS,
    maxBlocks: MAX_CONTROL_BLOCKS,
    maxSums: MAX_CONTROL_SUMS,
    maxStubs: MAX_CONTROL_STUBS,
    maxEdges: MAX_CONTROL_EDGES,
    maxSignsPerSum: MAX_CONTROL_SIGNS_PER_SUM,
    maxLabelCodePoints: MAX_CONTROL_LABEL_CODE_POINTS,
    maxTotalLabelCodePoints: MAX_CONTROL_TOTAL_LABEL_CODE_POINTS,
  },
};

/**
 * `free-body` — src/free-body.ts. Header keys come from `FREE_BODY_HEADER_FIELDS`,
 * which the parser reads before `----` (including the `scale:` representation
 * switch and the `width:`/`height:` frame); `bounds:` is the one header group,
 * closed over `BOUNDS_KEYS`. The body is the flat `- kind:` declaration list the
 * parser gates on `CONTROL_DECLARATION_KINDS`, spelled here one record per
 * `FREE_BODY_FIELDS_BY_KIND` entry.
 *
 * The records are one call at a time rather than a single `recordsFrom`:
 * `line.from`/`to` resolve to bare point names while `dimension.from`/`to` stay
 * `FreeBodyAttachment` objects, and the flat `types` map `recordsFrom` takes
 * cannot carry two valueTypes for one key.
 */
const freeBodySpec: DirectiveSpec = {
  header: headerFrom(
    FREE_BODY_HEADER_FIELDS,
    {
      scale: "decimal",
      id: "identifier",
      number: "boolean",
      title: "text",
      description: "text",
      width: "integer",
      height: "integer",
      bounds: "record",
    },
    [],
    {},
    [
      group(
        "bounds",
        BOUNDS_KEYS,
        {
          "min-x": "decimal",
          "min-y": "decimal",
          "max-x": "decimal",
          "max-y": "decimal",
        },
        ["min-x", "min-y", "max-x", "max-y"],
      ),
    ],
  ),
  body: recordList("-", [
    record(
      "block",
      fieldsFrom(
        fieldKeys(FREE_BODY_FIELDS_BY_KIND, "block"),
        {
          name: "name",
          x: "decimal",
          y: "decimal",
          width: "decimal",
          height: "decimal",
          angle: "decimal",
          visible: "boolean",
        },
        ["name", "x", "y", "width", "height"],
      ),
    ),
    record(
      "circle",
      fieldsFrom(
        fieldKeys(FREE_BODY_FIELDS_BY_KIND, "circle"),
        {
          name: "name",
          x: "decimal",
          y: "decimal",
          radius: "decimal",
          visible: "boolean",
        },
        ["name", "x", "y", "radius"],
      ),
    ),
    record(
      "polygon",
      fieldsFrom(
        fieldKeys(FREE_BODY_FIELDS_BY_KIND, "polygon"),
        {
          name: "name",
          vertices: "string-list",
          visible: "boolean",
        },
        ["name", "vertices"],
      ),
    ),
    record(
      "particle",
      fieldsFrom(
        fieldKeys(FREE_BODY_FIELDS_BY_KIND, "particle"),
        {
          name: "name",
          x: "decimal",
          y: "decimal",
          visible: "boolean",
        },
        ["name", "x", "y"],
      ),
    ),
    record(
      "point",
      fieldsFrom(
        fieldKeys(FREE_BODY_FIELDS_BY_KIND, "point"),
        {
          name: "name",
          x: "decimal",
          y: "decimal",
          label: "text",
          visible: "boolean",
        },
        ["name", "x", "y"],
      ),
    ),
    record(
      "line",
      fieldsFrom(
        fieldKeys(FREE_BODY_FIELDS_BY_KIND, "line"),
        {
          name: "name",
          from: "name",
          to: "name",
          visible: "boolean",
          style: "enum",
        },
        ["name", "from", "to"],
        { style: STYLES },
      ),
    ),
    record(
      "force",
      fieldsFrom(
        fieldKeys(FREE_BODY_FIELDS_BY_KIND, "force"),
        {
          at: "record",
          angle: "decimal",
          "parallel-to": "name",
          "perpendicular-to": "name",
          magnitude: "decimal",
          length: "decimal",
          label: "text",
        },
        ["at"],
      ),
    ),
    record(
      "moment",
      fieldsFrom(
        fieldKeys(FREE_BODY_FIELDS_BY_KIND, "moment"),
        {
          at: "record",
          direction: "enum",
          label: "text",
        },
        ["at", "direction"],
        { direction: MOMENT_DIRECTIONS },
      ),
    ),
    record(
      "axes",
      fieldsFrom(
        fieldKeys(FREE_BODY_FIELDS_BY_KIND, "axes"),
        {
          at: "record",
          angle: "decimal",
          "x-label": "text",
          "y-label": "text",
        },
        ["at"],
      ),
    ),
    record(
      "angle-mark",
      fieldsFrom(
        fieldKeys(FREE_BODY_FIELDS_BY_KIND, "angle-mark"),
        {
          first: "name",
          vertex: "name",
          third: "name",
          label: "text",
        },
        ["first", "vertex", "third"],
      ),
    ),
    record(
      "dimension",
      fieldsFrom(
        fieldKeys(FREE_BODY_FIELDS_BY_KIND, "dimension"),
        {
          from: "record",
          to: "record",
          label: "text",
        },
        ["from", "to", "label"],
      ),
    ),
  ]),
  limits: {
    maxDeclarations: MAX_FREE_BODY_DECLARATIONS,
    maxPolygonVertices: MAX_FREE_BODY_POLYGON_VERTICES,
    maxLabelChars: MAX_FREE_BODY_LABEL_CHARS,
    maxCoordinateMagnitude: MAX_FREE_BODY_COORDINATE_MAGNITUDE,
    maxDimensionPx: MAX_FREE_BODY_DIMENSION_PX,
  },
};


/**
 * Diagram (`src/diagram.ts`): a six-key header — `mode` required, `flow`
 * defaulted per mode — over one flat `- kind:` declaration list. Node `ports`
 * nest as `- name:` records; `parent`, `from` and `to` name a Node or Group in
 * the Block-local namespace, `from`/`to` additionally accepting `node.port`.
 *
 * The diagram family keeps no header table (unlike timing's `HEADER_FIELDS`):
 * the validator reads these six keys by name (`src/diagram.ts:514-556`) and
 * `diagramSourceSchema.properties` declares the same closed set, so the key
 * list is spelled here in that schema's order.
 */
const diagramSpec: DirectiveSpec = {
  header: headerFrom(
    DIAGRAM_HEADER_FIELDS,
    {
      id: "identifier",
      number: "boolean",
      title: "text",
      description: "text",
      mode: "enum",
      flow: "enum",
    },
    ["mode"],
    { mode: MODES, flow: DIAGRAM_FLOWS },
  ),
  body: recordList(
    "-",
    recordsFrom(
      DIAGRAM_DECLARATION_KINDS,
      { node: NODE_FIELDS, group: DIAGRAM_GROUP_FIELDS, edge: DIAGRAM_EDGE_FIELDS },
      {
        name: "name",
        label: "text",
        shape: "enum",
        parent: "name",
        ports: "record-list",
        from: "name",
        to: "name",
        direction: "enum",
      },
      { node: ["name"], group: ["name"], edge: ["from", "to"] },
      { shape: SHAPES, direction: DIRECTIONS },
      {
        node: [
          group("ports", PORT_FIELDS, { name: "name", side: "enum" }, ["name"], { side: SIDES }),
        ],
      },
    ),
  ),
  limits: {
    maxDeclarations: MAX_DIAGRAM_DECLARATIONS,
    maxNodes: MAX_DIAGRAM_NODES,
    maxEdges: MAX_DIAGRAM_EDGES,
    maxGroups: MAX_DIAGRAM_GROUPS,
    maxGroupDepth: MAX_DIAGRAM_GROUP_DEPTH,
    maxPortsPerNode: MAX_DIAGRAM_PORTS_PER_NODE,
    maxPorts: MAX_DIAGRAM_PORTS,
    maxParallelEdges: MAX_DIAGRAM_PARALLEL_EDGES,
    maxLabelCodePoints: MAX_DIAGRAM_LABEL_CODE_POINTS,
    maxLabelLines: MAX_DIAGRAM_LABEL_LINES,
    maxTotalLabelCodePoints: MAX_DIAGRAM_TOTAL_LABEL_CODE_POINTS,
  },
};


/**
 * `sequence`, `state`, `entity` and `class` — the software and data model
 * directives (`src/models.ts`). Every key set below is the parser's own table;
 * this fragment adds only value types, required keys and enum spellings.
 */

/** All four model directives read one header table, and no header key is required. */
const MODELS_HEADER_TYPES = {
  id: "identifier",
  number: "boolean",
  title: "text",
  description: "text",
} as const;

const MODELS_HEADER = headerFrom(MODELS_HEADER_FIELDS, MODELS_HEADER_TYPES);

/* ------------------------------------------------------------------ *
 * `sequence`
 * ------------------------------------------------------------------ */

/** `SEQUENCE_SECTIONS[0]`: the `participants:` opener every sequence Block requires. */
const MODELS_SEQUENCE_PARTICIPANTS_SECTION = SEQUENCE_SECTIONS[0]!;

const MODELS_SEQUENCE_TYPES = {
  kind: "enum",
  form: "enum",
  from: "name",
  to: "name",
  text: "text",
  activate: "boolean",
  deactivate: "boolean",
  over: "string-list",
  divisions: "record-list",
  condition: "text",
  body: "record-list",
  name: "name",
  label: "text",
} as const;

const MODELS_SEQUENCE_VALUES = {
  kind: TIMELINE_KINDS,
  form: MESSAGE_FORMS,
} as const;

const MODELS_SEQUENCE_REQUIRED = {
  message: ["kind", "from", "to"],
  note: ["kind", "over", "text"],
  alt: ["kind", "divisions"],
  loop: ["kind", "body"],
} as const;

const MODELS_SEQUENCE_TIMELINE_RECORDS = recordsFrom(
  TIMELINE_KINDS,
  {
    message: MESSAGE_FIELDS,
    note: NOTE_FIELDS,
    alt: ALT_FIELDS,
    loop: LOOP_FIELDS,
  },
  MODELS_SEQUENCE_TYPES,
  MODELS_SEQUENCE_REQUIRED,
  MODELS_SEQUENCE_VALUES,
  {
    alt: [group("divisions", DIVISION_FIELDS, MODELS_SEQUENCE_TYPES, ["body"])],
  },
);

/**
 * The body is two sections — `participants:` and `timeline:` — each holding
 * records, so the sections are groups over their own record shapes rather
 * than body-level records.
 */
const sequenceSpec: DirectiveSpec = {
  header: MODELS_HEADER,
  body: keyedSections(
    fieldsFrom(
      SEQUENCE_SECTIONS,
      { participants: "record-list", timeline: "record-list" },
      SEQUENCE_SECTIONS,
    ),
    [],
    [
      group(
        MODELS_SEQUENCE_PARTICIPANTS_SECTION,
        PARTICIPANT_FIELDS,
        MODELS_SEQUENCE_TYPES,
        ["name"],
        { kind: PARTICIPANT_KINDS },
      ),
      sectionOf(SEQUENCE_SECTIONS[1]!, MODELS_SEQUENCE_TIMELINE_RECORDS),
    ],
  ),
  limits: {
    maxParticipants: MAX_SEQUENCE_PARTICIPANTS,
    maxTimelineItems: MAX_SEQUENCE_TIMELINE_ITEMS,
    maxFragmentDepth: MAX_SEQUENCE_FRAGMENT_DEPTH,
    maxAltDivisions: MAX_SEQUENCE_ALT_DIVISIONS,
    maxNoteSpan: MAX_SEQUENCE_NOTE_SPAN,
    maxNoteTextChars: MAX_SEQUENCE_NOTE_TEXT_CHARS,
    maxNoteTextLines: MAX_SEQUENCE_NOTE_TEXT_LINES,
  },
};

/* ------------------------------------------------------------------ *
 * `state`
 * ------------------------------------------------------------------ */



const MODELS_STATE_TYPES = {
  kind: "enum",
  name: "name",
  label: "text",
  states: "record-list",
  from: "name",
  to: "name",
  trigger: "text",
  guard: "text",
  action: "text",
} as const;

const MODELS_STATE_VALUES = { kind: TOP_LEVEL_STATE_KINDS } as const;

const MODELS_STATE_REQUIRED = {
  state: ["kind", "name"],
  initial: ["kind", "name"],
  final: ["kind", "name"],
  transition: ["kind", "from", "to"],
} as const;

const stateSpec: DirectiveSpec = {
  header: MODELS_HEADER,
  body: recordList(
    "-",
    recordsFrom(
      TOP_LEVEL_STATE_KINDS,
      {
        state: STATE_ITEM_FIELDS,
        initial: MODELS_PSEUDO_STATE_FIELDS,
        final: MODELS_PSEUDO_STATE_FIELDS,
        transition: TRANSITION_FIELDS,
      },
      MODELS_STATE_TYPES,
      MODELS_STATE_REQUIRED,
      MODELS_STATE_VALUES,
      {
        // A nested scope holds the same items as the top level minus transitions,
        // so the nested key set is the state item table itself.
        state: [
          group("states", STATE_ITEM_FIELDS, MODELS_STATE_TYPES, ["kind", "name"], {
            kind: NESTED_STATE_KINDS,
          }),
        ],
      },
    ),
  ),
  limits: {
    maxStates: MAX_STATE_STATES,
    maxDepth: MAX_STATE_DEPTH,
    maxTransitions: MAX_STATE_TRANSITIONS,
  },
};

/* ------------------------------------------------------------------ *
 * `entity`
 * ------------------------------------------------------------------ */

/** The item kinds the entity parser spells inline. */
const MODELS_ENTITY_ITEM_KINDS = Object.freeze(["entity", "relationship"]);

const MODELS_ENTITY_TYPES = {
  kind: "enum",
  name: "name",
  label: "text",
  attributes: "record-list",
  type: "text",
  keys: "string-list",
  optional: "boolean",
  references: "record",
  entity: "name",
  attribute: "name",
  first: "record",
  second: "record",
  cardinality: "enum",
  role: "text",
} as const;

const MODELS_ENTITY_VALUES = {
  kind: MODELS_ENTITY_ITEM_KINDS,
  keys: ENTITY_KEYS,
  cardinality: CARDINALITIES,
} as const;

const MODELS_ENTITY_REQUIRED = {
  entity: ["kind", "name"],
  relationship: ["kind", "first", "second"],
} as const;

const entitySpec: DirectiveSpec = {
  header: MODELS_HEADER,
  body: recordList(
    "-",
    recordsFrom(
      MODELS_ENTITY_ITEM_KINDS,
      {
        entity: ENTITY_ITEM_FIELDS,
        relationship: ENTITY_RELATIONSHIP_FIELDS,
      },
      MODELS_ENTITY_TYPES,
      MODELS_ENTITY_REQUIRED,
      MODELS_ENTITY_VALUES,
      {
        entity: [
          group("attributes", ATTRIBUTE_FIELDS, MODELS_ENTITY_TYPES, ["name"], { keys: ENTITY_KEYS }),
          group("references", REFERENCE_FIELDS, MODELS_ENTITY_TYPES, ["entity", "attribute"]),
        ],
        relationship: [
          group("first", RELATIONSHIP_END_FIELDS, MODELS_ENTITY_TYPES, ["entity", "cardinality"], {
            cardinality: CARDINALITIES,
          }),
          group("second", RELATIONSHIP_END_FIELDS, MODELS_ENTITY_TYPES, ["entity", "cardinality"], {
            cardinality: CARDINALITIES,
          }),
        ],
      },
    ),
  ),
  limits: {
    maxEntities: MAX_ENTITY_ENTITIES,
    maxAttributesPerEntity: MAX_ENTITY_ATTRIBUTES,
    maxRelationships: MAX_ENTITY_RELATIONSHIPS,
  },
};

/* ------------------------------------------------------------------ *
 * `class`
 * ------------------------------------------------------------------ */



const MODELS_CLASS_TYPES = {
  kind: "enum",
  name: "name",
  label: "text",
  abstract: "boolean",
  attributes: "record-list",
  operations: "record-list",
  form: "enum",
  from: "name",
  to: "name",
  "from-multiplicity": "enum",
  "to-multiplicity": "enum",
  visibility: "enum",
  static: "boolean",
  parameters: "record-list",
  "return-type": "text",
  type: "text",
} as const;

const MODELS_CLASS_VALUES = {
  kind: CLASS_ITEM_KINDS,
  form: CLASS_RELATIONSHIP_FORMS,
  visibility: VISIBILITIES,
  "from-multiplicity": CARDINALITIES,
  "to-multiplicity": CARDINALITIES,
} as const;

const MODELS_CLASS_REQUIRED = {
  class: ["kind", "name"],
  interface: ["kind", "name"],
  relationship: ["kind", "form", "from", "to"],
} as const;

/** A classifier and an interface accept the same operation and parameter groups. */
const MODELS_CLASS_MEMBER_GROUPS = [
  group("operations", OPERATION_FIELDS, MODELS_CLASS_TYPES, ["name"], { visibility: VISIBILITIES }),
  group("parameters", PARAMETER_FIELDS, MODELS_CLASS_TYPES, ["name"]),
];

const classSpec: DirectiveSpec = {
  header: MODELS_HEADER,
  body: recordList(
    "-",
    recordsFrom(
      CLASS_ITEM_KINDS,
      {
        class: CLASS_ITEM_FIELDS,
        interface: MODELS_INTERFACE_FIELDS,
        relationship: CLASS_RELATIONSHIP_FIELDS,
      },
      MODELS_CLASS_TYPES,
      MODELS_CLASS_REQUIRED,
      MODELS_CLASS_VALUES,
      {
        class: [
          group("attributes", CLASS_ATTRIBUTE_FIELDS, MODELS_CLASS_TYPES, ["name"], {
            visibility: VISIBILITIES,
          }),
          ...MODELS_CLASS_MEMBER_GROUPS,
        ],
        interface: MODELS_CLASS_MEMBER_GROUPS,
      },
    ),
  ),
  limits: {
    maxClassifiers: MAX_CLASS_CLASSIFIERS,
    maxAttributesPerClass: MAX_CLASS_ATTRIBUTES,
    maxOperationsPerClass: MAX_CLASS_OPERATIONS,
    maxParametersPerOperation: MAX_CLASS_PARAMETERS,
    maxRelationships: MAX_CLASS_RELATIONSHIPS,
  },
};


/**
 * `timing` (`src/timing.ts`, contract: issue #63) and `circuit`
 * (`src/circuit.ts`, native analog and digital schematics).
 *
 * Both bodies are one flat declaration list opened by `- kind:`: timing
 * accepts `signal`, `group`, `marker` and `arrow`, circuit the four
 * declarations `node`, `connect`, `voltage-label`, `current-label` plus every
 * component kind. Key sets and their order come from the parsers' hoisted
 * field tables (`SIGNAL_FIELDS` … `ARROW_FIELDS`, `CIRCUIT_FIELDS_BY_KIND`); neither
 * parser lets `kind:` reach those tables, because both consume the opener
 * before field parsing, so the record kind is carried by `records[].kind`
 * rather than by a field.
 *
 * `required` is the key whose omission the validator always rejects, read from
 * the parser's own check. Two rules are deliberately absent because they are
 * scale- or cross-field invariants, not field presence: a cycles-scale timing
 * signal requires `wave:` while a time-scale one requires an `intervals:`
 * collection, and a timing arrow anchor must name a declared signal and an
 * in-range boundary.
 *
 * Timing `wave` is the opaque run string (`2p2n2p0`, `x={A5}z`), `signals` a
 * comma-separated ref list, `from`/`to` a `signal@boundary` anchor, and every
 * `intervals:` record a `state:` word from the parser's `STATE_WORDS` table.
 * Circuit `mode` is the one per-kind vocabulary: `MODE_VALUES` keys six
 * component kinds to different closed sets, and a single `recordsFrom` values
 * map cannot carry that, so each component record is built on its own. The
 * record order follows the parser's `KINDS` list.
 */

const STATE_VALUES = Object.keys(STATE_WORDS);

const timingSpec: DirectiveSpec = {
  header: headerFrom(
    TIMING_HEADER_FIELDS,
    {
      id: "identifier",
      number: "boolean",
      title: "text",
      description: "text",
      scale: "enum",
      unit: "enum",
    },
    ["title"],
    { scale: SCALE_WORDS, unit: TIME_UNITS },
  ),
  body: recordList(
    "-",
    recordsFrom(
      TIMING_BODY_KINDS,
      {
        signal: SIGNAL_FIELDS,
        group: TIMING_GROUP_FIELDS,
        marker: MARKER_FIELDS,
        arrow: ARROW_FIELDS,
      },
      {
        ref: "identifier",
        clock: "boolean",
        phase: "decimal",
        width: "integer",
        wave: "text",
        intervals: "record-list",
        label: "text",
        signals: "string-list",
        at: "decimal",
        from: "text",
        to: "text",
        state: "enum",
        duration: "decimal",
        value: "text",
      },
      { signal: ["ref"], group: ["signals"], marker: ["at"], arrow: ["from", "to"] },
      { state: STATE_VALUES },
      {
        signal: [
          group(
            "intervals",
            INTERVAL_FIELDS,
            { state: "enum", duration: "decimal", value: "text" },
            ["state", "duration"],
            { state: STATE_VALUES },
          ),
        ],
      },
    ),
  ),
  limits: {
    maxSignals: MAX_TIMING_SIGNALS,
    maxIntervals: MAX_TIMING_INTERVALS,
    maxTotalIntervals: MAX_TIMING_TOTAL_INTERVALS,
    maxGroups: MAX_TIMING_GROUPS,
    maxGroupDepth: MAX_TIMING_GROUP_DEPTH,
    maxMarkers: MAX_TIMING_MARKERS,
    maxArrows: MAX_TIMING_ARROWS,
    maxTextCodePoints: MAX_TIMING_TEXT_CODE_POINTS,
    maxWaveChars: MAX_TIMING_WAVE_CHARS,
    maxSpan: MAX_TIMING_SPAN,
    maxWidth: MAX_TIMING_WIDTH,
  },
};

/** `node` refs are kebab identifiers; component refs are uppercase name tokens. */
const DECLARATION_TYPES = {
  ref: "identifier",
  role: "enum",
  label: "text",
  terminal: "text",
  node: "identifier",
  positive: "identifier",
  negative: "identifier",
  direction: "enum",
} as const;

const COMPONENT_TYPES = {
  ref: "name",
  orientation: "enum",
  inputs: "enum",
  name: "text",
  value: "quantity",
  mode: "enum",
} as const;

const COMPONENT_VALUES = {
  orientation: ORIENTATIONS,
  inputs: GATE_INPUTS,
};

const circuitSpec: DirectiveSpec = {
  header: headerFrom(
    CIRCUIT_HEADER_FIELDS,
    {
      id: "identifier",
      number: "boolean",
      title: "text",
      description: "text",
      flow: "enum",
    },
    ["title"],
    { flow: CIRCUIT_FLOWS },
  ),
  body: recordList("-", [
    record(
      "node",
      fieldsFrom(CIRCUIT_FIELDS_BY_KIND.node, DECLARATION_TYPES, ["ref"], { role: NODE_ROLES }),
    ),
    record("connect", fieldsFrom(CIRCUIT_FIELDS_BY_KIND.connect, DECLARATION_TYPES, ["terminal", "node"])),
    record(
      "voltage-label",
      fieldsFrom(CIRCUIT_FIELDS_BY_KIND["voltage-label"], DECLARATION_TYPES, ["positive", "negative"]),
    ),
    record(
      "current-label",
      fieldsFrom(CIRCUIT_FIELDS_BY_KIND["current-label"], DECLARATION_TYPES, ["terminal", "direction"], {
        direction: CURRENT_DIRECTIONS,
      }),
    ),
    record(
      "resistor",
      fieldsFrom(CIRCUIT_FIELDS_BY_KIND.resistor, COMPONENT_TYPES, ["ref", "value"], COMPONENT_VALUES),
    ),
    record(
      "capacitor",
      fieldsFrom(CIRCUIT_FIELDS_BY_KIND.capacitor, COMPONENT_TYPES, ["ref", "value"], COMPONENT_VALUES),
    ),
    record(
      "inductor",
      fieldsFrom(CIRCUIT_FIELDS_BY_KIND.inductor, COMPONENT_TYPES, ["ref", "value"], COMPONENT_VALUES),
    ),
    record(
      "voltage-source",
      fieldsFrom(CIRCUIT_FIELDS_BY_KIND["voltage-source"], COMPONENT_TYPES, ["ref", "value"], {
        ...COMPONENT_VALUES,
        mode: MODE_VALUES["voltage-source"]!,
      }),
    ),
    record(
      "current-source",
      fieldsFrom(CIRCUIT_FIELDS_BY_KIND["current-source"], COMPONENT_TYPES, ["ref", "value"], {
        ...COMPONENT_VALUES,
        mode: MODE_VALUES["current-source"]!,
      }),
    ),
    record("diode", fieldsFrom(CIRCUIT_FIELDS_BY_KIND.diode, COMPONENT_TYPES, ["ref"], COMPONENT_VALUES)),
    record("led", fieldsFrom(CIRCUIT_FIELDS_BY_KIND.led, COMPONENT_TYPES, ["ref"], COMPONENT_VALUES)),
    record(
      "switch",
      fieldsFrom(CIRCUIT_FIELDS_BY_KIND.switch, COMPONENT_TYPES, ["ref"], {
        ...COMPONENT_VALUES,
        mode: MODE_VALUES.switch!,
      }),
    ),
    record(
      "dependent-source",
      fieldsFrom(CIRCUIT_FIELDS_BY_KIND["dependent-source"], COMPONENT_TYPES, ["ref", "value"], {
        ...COMPONENT_VALUES,
        mode: MODE_VALUES["dependent-source"]!,
      }),
    ),
    record("op-amp", fieldsFrom(CIRCUIT_FIELDS_BY_KIND["op-amp"], COMPONENT_TYPES, ["ref"], COMPONENT_VALUES)),
    record(
      "bjt",
      fieldsFrom(CIRCUIT_FIELDS_BY_KIND.bjt, COMPONENT_TYPES, ["ref"], {
        ...COMPONENT_VALUES,
        mode: MODE_VALUES.bjt!,
      }),
    ),
    record(
      "mosfet",
      fieldsFrom(CIRCUIT_FIELDS_BY_KIND.mosfet, COMPONENT_TYPES, ["ref"], {
        ...COMPONENT_VALUES,
        mode: MODE_VALUES.mosfet!,
      }),
    ),
    record("and", fieldsFrom(CIRCUIT_FIELDS_BY_KIND.and, COMPONENT_TYPES, ["ref"], COMPONENT_VALUES)),
    record("or", fieldsFrom(CIRCUIT_FIELDS_BY_KIND.or, COMPONENT_TYPES, ["ref"], COMPONENT_VALUES)),
    record("nand", fieldsFrom(CIRCUIT_FIELDS_BY_KIND.nand, COMPONENT_TYPES, ["ref"], COMPONENT_VALUES)),
    record("nor", fieldsFrom(CIRCUIT_FIELDS_BY_KIND.nor, COMPONENT_TYPES, ["ref"], COMPONENT_VALUES)),
    record("xor", fieldsFrom(CIRCUIT_FIELDS_BY_KIND.xor, COMPONENT_TYPES, ["ref"], COMPONENT_VALUES)),
    record("xnor", fieldsFrom(CIRCUIT_FIELDS_BY_KIND.xnor, COMPONENT_TYPES, ["ref"], COMPONENT_VALUES)),
    record("not", fieldsFrom(CIRCUIT_FIELDS_BY_KIND.not, COMPONENT_TYPES, ["ref"], COMPONENT_VALUES)),
    record("buffer", fieldsFrom(CIRCUIT_FIELDS_BY_KIND.buffer, COMPONENT_TYPES, ["ref"], COMPONENT_VALUES)),
    record(
      "mux-2to1",
      fieldsFrom(CIRCUIT_FIELDS_BY_KIND["mux-2to1"], COMPONENT_TYPES, ["ref"], COMPONENT_VALUES),
    ),
    record(
      "mux-4to1",
      fieldsFrom(CIRCUIT_FIELDS_BY_KIND["mux-4to1"], COMPONENT_TYPES, ["ref"], COMPONENT_VALUES),
    ),
    record(
      "d-flip-flop",
      fieldsFrom(CIRCUIT_FIELDS_BY_KIND["d-flip-flop"], COMPONENT_TYPES, ["ref"], COMPONENT_VALUES),
    ),
    record(
      "digital-input",
      fieldsFrom(CIRCUIT_FIELDS_BY_KIND["digital-input"], COMPONENT_TYPES, ["ref", "name"], COMPONENT_VALUES),
    ),
    record(
      "digital-output",
      fieldsFrom(
        CIRCUIT_FIELDS_BY_KIND["digital-output"],
        COMPONENT_TYPES,
        ["ref", "name"],
        COMPONENT_VALUES,
      ),
    ),
  ]),
  limits: {
    maxComponents: MAX_CIRCUIT_COMPONENTS,
    maxNodes: MAX_CIRCUIT_NODES,
    maxRelations: MAX_CIRCUIT_RELATIONS,
    maxAnnotations: MAX_CIRCUIT_ANNOTATIONS,
  },
};


const formulaSpec: DirectiveSpec = {
  header: headerFrom(
    FORMULA_HEADER_FIELDS,
    { id: "identifier", number: "boolean" },
  ),
  body: scalarLines(
    fieldsFrom(["expression"], { expression: "expression" }, ["expression"]),
  ),
  limits: {
    maxFormulaExpressionChars: MAX_FORMULA_EXPRESSION_CHARS,
    maxFormulaCharge: MAX_FORMULA_CHARGE,
    maxSubscript: MAX_SUBSCRIPT,
    maxGroupNesting: MAX_GROUP_NESTING,
    maxIsotopeMass: MAX_ISOTOPE_MASS,
  },
};

const reactionSpec: DirectiveSpec = {
  header: headerFrom(
    REACTION_HEADER_FIELDS,
    {
      id: "identifier",
      number: "boolean",
      above: "text",
      below: "text",
      balance: "enum",
    },
    [],
    { balance: ["none", "check"] },
  ),
  body: scalarLines(
    fieldsFrom(["equation"], { equation: "expression" }, ["equation"]),
  ),
  limits: {
    maxReactionSpecies: MAX_REACTION_SPECIES,
    maxReactionSpeciesChars: MAX_REACTION_SPECIES_CHARS,
    maxReactionConditionChars: MAX_REACTION_CONDITION_CHARS,
  },
};

// STRUCTURE_OPENERS is the parser's opener order; each opener pairs with the
// field table its own branch passes to checkFields (src/chemistry.ts:1018,
// 1149, 1217). Records are built one by one because the atom and bond `stereo`
// fields carry different closed spellings, which recordsFrom's single flat
// `values` map cannot express.
const structureSpec: DirectiveSpec = {
  header: headerFrom(
    STRUCTURE_HEADER_FIELDS,
    {
      id: "identifier",
      number: "boolean",
      width: "integer",
      height: "integer",
    },
  ),
  body: recordList("-", [
    record(STRUCTURE_OPENERS[0], fieldsFrom(
      ATOM_FIELDS,
      {
        element: "enum",
        attach: "text",
        charge: "integer",
        isotope: "integer",
        at: "point-list",
        stereo: "enum",
      },
      ["at"],
      { element: ELEMENT_SYMBOLS, stereo: ["unspecified"] },
    )),
    record(STRUCTURE_OPENERS[1], fieldsFrom(
      BOND_FIELDS,
      { from: "name", to: "name", order: "enum", stereo: "enum" },
      ["from", "to", "order"],
      { order: ["1", "2", "3", "aromatic"], stereo: ["wedge", "hash"] },
    )),
    record(STRUCTURE_OPENERS[2], fieldsFrom(
      LABEL_FIELDS,
      { text: "text", at: "point-list" },
      ["text", "at"],
    )),
  ]),
  limits: {
    maxStructureAtoms: MAX_STRUCTURE_ATOMS,
    maxStructureWidth: MAX_STRUCTURE_WIDTH,
    maxStructureHeight: MAX_STRUCTURE_HEIGHT,
    maxStructureLabelChars: MAX_STRUCTURE_LABEL_CHARS,
    maxFormulaCharge: MAX_FORMULA_CHARGE,
    maxIsotopeMass: MAX_ISOTOPE_MASS,
  },
};


/**
 * equation, derivation, figure, callout, mermaid.
 *
 * Header key sets are the parsers' hoisted field tables. Body shapes come from
 * the validators themselves: the equation/derivation/mermaid bodies are one
 * unkeyed scalar run (empty body -`#empty`), the figure body must hold at
 * least one nested Block (`#empty-body`), and the callout body may be empty.
 * Body `required` therefore marks the content an author must supply; values
 * the validator derives (mermaid's `diagramType`) are not required.
 *
 * Enum spellings are the parser's closed sets: align/syntax from
 * equationSourceSchema / derivationSourceSchema (the only tables that declare
 * them), variant from CALLOUT_VARIANTS, diagram types from SUPPORTED_DIAGRAMS.
 */

const equationSpec: DirectiveSpec = {
  header: headerFrom(
    EQUATION_HEADER_FIELDS,
    {
      id: "identifier",
      number: "boolean",
      align: "enum",
      syntax: "enum",
    },
    [],
    {
      align: ["left", "center", "right"],
      syntax: ["readable", "latex"],
    },
  ),
  body: scalarLines(
    fieldsFrom(["expression"], { expression: "expression" }, ["expression"]),
  ),
  // `syntax: latex` additionally requires --allow-raw-latex at compile time.
  limits: {
    maxSourceChars: MAX_EQUATION_SOURCE_LENGTH,
    maxTexChars: MAX_EQUATION_TEX_LENGTH,
  },
};

const derivationSpec: DirectiveSpec = {
  header: headerFrom(
    DERIVATION_HEADER_FIELDS,
    {
      id: "identifier",
      number: "boolean",
      align: "enum",
    },
    [],
    {
      align: ["left", "center", "right"],
    },
  ),
  // Steps are the body: one `- expression:` record each, with `annotation:` as
  // the indented child line of the step. At most MAX_DERIVATION_STEPS steps
  // and MAX_ANNOTATION_LENGTH annotation characters are enforced, but
  // `capabilities` reports the derivation family through the equation limits.
  body: {
    ...scalarLines([]),
    records: [
      record(
        "expression",
        fieldsFrom(
          DERIVATION_STEP_FIELDS,
          {
            expression: "expression",
            annotation: "prose",
          },
          ["expression"],
        ),
      ),
    ],
  },
  limits: {
    maxSourceChars: MAX_EQUATION_SOURCE_LENGTH,
    maxTexChars: MAX_EQUATION_TEX_LENGTH,
  },
};

const figureSpec: DirectiveSpec = {
  header: headerFrom(FIGURE_HEADER_FIELDS, {
    id: "identifier",
    number: "boolean",
    caption: "prose",
  }),
  // Keyed sections: Markdown plus any directive active in the document,
  // bounded by MAX_NESTING_DEPTH. `children` is what the body must hold.
  body: keyedSections(
    fieldsFrom(["children"], { children: "record-list" }, ["children"]),
  ),
  limits: {},
};

const calloutSpec: DirectiveSpec = {
  header: headerFrom(
    CALLOUT_HEADER_FIELDS,
    {
      id: "identifier",
      variant: "enum",
      title: "prose",
    },
    [],
    {
      variant: CALLOUT_VARIANTS,
    },
  ),
  // Markdown plus nested directives. Nothing is required: an absent `variant:`
  // resolves to `note` and an empty body is accepted.
  body: keyedSections(fieldsFrom(["children"], { children: "record-list" })),
  limits: {},
};

const mermaidSpec: DirectiveSpec = {
  header: headerFrom(MERMAID_HEADER_FIELDS, {
    id: "identifier",
    title: "text",
    description: "text",
  }),
  // Bounded Mermaid source; the first content line must name a supported
  // diagram, so `diagramType` is derived from `source` rather than authored.
  body: scalarLines(
    fieldsFrom(
      ["source", "diagramType"],
      {
        source: "text",
        diagramType: "enum",
      },
      ["source"],
      {
        diagramType: Object.keys(SUPPORTED_DIAGRAMS),
      },
    ),
  ),
  limits: {
    maxSourceChars: MAX_MERMAID_SOURCE_LENGTH,
    maxTextChars: MAX_MERMAID_TEXT_LENGTH,
  },
};


/**
 * Structured content: `table`, `bibliography`, `algorithm`, `statement` and
 * `example`. Every key set is the parser's own table; this file adds only each
 * field's value vocabulary, the required keys and the closed enumerations.
 */

const TABLE_COLUMN_FIELD_TYPES: Readonly<Record<string, FieldValueType>> = {
  key: "identifier",
  name: "text",
  type: "enum",
  unit: "text",
  align: "enum",
};

const TABLE_GROUP_FIELD_TYPES: Readonly<Record<string, FieldValueType>> = {
  name: "text",
  columns: "string-list",
};

const BIBLIOGRAPHY_ENTRY_FIELD_TYPES: Readonly<Record<string, FieldValueType>> = {
  key: "identifier",
  type: "enum",
  title: "text",
  authors: "record-list",
  year: "text",
  venue: "text",
  publisher: "text",
  edition: "text",
  pages: "text",
  url: "text",
  doi: "text",
  note: "text",
};

const BIBLIOGRAPHY_AUTHOR_FIELD_TYPES: Readonly<Record<string, FieldValueType>> = {
  name: "text",
  family: "text",
};

const ALGORITHM_STATEMENT_FIELD_TYPES: Readonly<Record<string, FieldValueType>> = {
  assign: "expression",
  if: "expression",
  for: "expression",
  while: "expression",
  return: "expression",
  text: "prose",
};

const EXAMPLE_FIELD_TYPES: Readonly<Record<string, FieldValueType>> = {
  problem: "prose",
  givens: "string-list",
  steps: "record-list",
  result: "prose",
};

const EXAMPLE_STEP_FIELD_TYPES: Readonly<Record<string, FieldValueType>> = {
  text: "prose",
};

/**
 * The body is one declaration record keyed `columns:`, `groups:` and `rows:`
 * — not a `- kind:` collection — so the form is `keyed-sections` and the
 * nested item shapes are the `columns` and `groups` child-key groups. A row is
 * keyed by the column keys the same body declares, so it has no fixed key set.
 */
const tableSpec: DirectiveSpec = {
  header: headerFrom(["id", "number", "caption"], {
    id: "identifier",
    number: "boolean",
    caption: "prose",
  }),
  body: keyedSections(
    fieldsFrom(
      ["columns", "groups", "rows"],
      { columns: "record-list", groups: "record-list", rows: "record-list" },
      ["columns"],
    ),
    [],
    [
      group("columns", TABLE_COLUMN_FIELDS, TABLE_COLUMN_FIELD_TYPES, ["key", "type"], {
        type: TABLE_COLUMN_TYPES,
        align: Object.keys(ALIGNMENTS),
      }),
      group("groups", TABLE_GROUP_FIELDS, TABLE_GROUP_FIELD_TYPES, ["name", "columns"]),
    ],
  ),
  limits: {
    maxColumns: MAX_TABLE_COLUMNS,
    maxRows: MAX_TABLE_ROWS,
    maxGroups: MAX_TABLE_GROUPS,
    maxTextCellChars: MAX_TABLE_TEXT_CELL_CHARS,
    maxMathCellChars: MAX_TABLE_MATH_CELL_CHARS,
  },
};

/**
 * One `- ` citation record in the closed field set. The nine entry types are
 * the values of the record's `type:` field, not record kinds: the opener is
 * `- ` for every type and no type varies the accepted field set.
 */
const bibliographySpec: DirectiveSpec = {
  header: headerFrom(["id", "number", "caption"], {
    id: "identifier",
    number: "boolean",
    caption: "prose",
  }),
  body: recordList("-", [
    record(
      "entry",
      fieldsFrom(BIBLIOGRAPHY_ENTRY_FIELDS, BIBLIOGRAPHY_ENTRY_FIELD_TYPES, [
        "key",
        "type",
        "title",
      ], { type: BIBLIOGRAPHY_ENTRY_TYPES }),
      [group("authors", BIBLIOGRAPHY_AUTHOR_FIELDS, BIBLIOGRAPHY_AUTHOR_FIELD_TYPES, ["name"])],
    ),
  ]),
  limits: { maxEntries: MAX_BIBLIOGRAPHY_ENTRIES },
};

/**
 * `procedure:`, `parameters:` and `steps:` are the leading scalar lines; each
 * statement keyword opens one record of the `steps:` collection. `if:`, `for:` and `while:`
 * carry a nested `do:` block holding the same six statement shapes.
 */
const ALGORITHM_BLOCK_STATEMENTS: readonly string[] = Object.freeze(["if", "for", "while"]);

const algorithmStepRecord = (key: string): GrammarRecord => {
  const nested = ALGORITHM_BLOCK_STATEMENTS.includes(key)
    ? [
        sectionOf(
          "do",
          ALGORITHM_STATEMENT_KEYS.map((word) =>
            record(word, fieldsFrom([word], ALGORITHM_STATEMENT_FIELD_TYPES, [word])),
          ),
        ),
      ]
    : [];
  const types = ALGORITHM_BLOCK_STATEMENTS.includes(key)
    ? { ...ALGORITHM_STATEMENT_FIELD_TYPES, do: "record-list" as const }
    : ALGORITHM_STATEMENT_FIELD_TYPES;
  const keys = ALGORITHM_BLOCK_STATEMENTS.includes(key) ? [key, "do"] : [key];
  return record(key, fieldsFrom(keys, types, [key]), nested);
};

const ALGORITHM_STEP_RECORDS: readonly GrammarRecord[] = ALGORITHM_STATEMENT_KEYS.map(
  algorithmStepRecord,
);

const algorithmSpec: DirectiveSpec = {
  header: headerFrom(["id", "number", "caption"], {
    id: "identifier",
    number: "boolean",
    caption: "prose",
  }),
  body: keyedSections(
    fieldsFrom(
      ["procedure", "parameters", "steps"],
      { procedure: "name", parameters: "string-list", steps: "record-list" },
      ["procedure", "steps"],
    ),
    [],
    [sectionOf("steps", ALGORITHM_STEP_RECORDS)],
  ),
  limits: {
    maxStatements: MAX_ALGORITHM_STATEMENTS,
    maxNestingDepth: MAX_ALGORITHM_NESTING_DEPTH,
    maxParameters: MAX_ALGORITHM_PARAMETERS,
    maxExpressionChars: MAX_PSEUDOCODE_EXPRESSION_LENGTH,
  },
};

const statementSpec: DirectiveSpec = {
  header: headerFrom(
    ["id", "number", "caption", ...STATEMENT_HEADER_FIELDS],
    { id: "identifier", number: "boolean", caption: "prose", kind: "enum" },
    ["kind"],
    { kind: STATEMENT_KINDS },
  ),
  body: keyedSections(
    fieldsFrom(["text", "proof"], { text: "prose", proof: "prose" }, ["text"]),
  ),
  limits: { maxMarkdownChars: MAX_STATEMENT_MARKDOWN_CHARS },
};

const exampleSpec: DirectiveSpec = {
  header: headerFrom(["id", "number", "caption"], {
    id: "identifier",
    number: "boolean",
    caption: "prose",
  }),
  body: keyedSections(
    fieldsFrom(REGISTERED_FIELDS, EXAMPLE_FIELD_TYPES, ["problem", "steps"]),
    [],
    [group("steps", STEP_FIELDS, EXAMPLE_STEP_FIELD_TYPES, ["text"])],
  ),
  limits: {
    maxSteps: MAX_EXAMPLE_STEPS,
    maxGivens: MAX_EXAMPLE_GIVENS,
    maxMarkdownChars: MAX_EXAMPLE_MARKDOWN_CHARS,
  },
};


/**
 * Every registered directive, in the registry's canonical order. The set is
 * keyed by Plugin type; `buildGrammarDocument` refuses to describe a registry
 * the table does not cover, so a new Plugin cannot ship undescribed.
 */
const DIRECTIVE_SPECS: Readonly<Record<string, DirectiveSpec>> = Object.freeze({
  equation: equationSpec,
  derivation: derivationSpec,
  callout: calloutSpec,
  mermaid: mermaidSpec,
  table: tableSpec,
  plot: plotSpec,
  chart: chartSpec,
  geometry: geometrySpec,
  formula: formulaSpec,
  reaction: reactionSpec,
  structure: structureSpec,
  circuit: circuitSpec,
  timing: timingSpec,
  diagram: diagramSpec,
  sequence: sequenceSpec,
  state: stateSpec,
  entity: entitySpec,
  class: classSpec,
  control: controlSpec,
  "free-body": freeBodySpec,
  figure: figureSpec,
  bibliography: bibliographySpec,
  algorithm: algorithmSpec,
  statement: statementSpec,
  example: exampleSpec,
});

const JSON_SCHEMA_DIALECT = "https://json-schema.org/draft/2020-12/schema";

function jsonTypeFor(field: GrammarField): JsonValue {
  switch (field.valueType) {
    // Exact-decimal canonicalization carries authored numerics as canonical
    // strings, so both spellings are truthful for the parsed body.
    case "integer":
      return { type: ["string", "integer"] };
    case "decimal":
      return { type: ["string", "number"] };
    case "boolean":
      return { type: "boolean" };
    case "enum":
      return field.values === undefined
        ? { type: "string" }
        : { type: "string", enum: [...field.values] };
    case "record":
      return { type: "object" };
    case "record-list":
      return { type: "array" };
    case "string-list":
      return { type: "array", items: { type: "string" } };
    case "point-list":
      return { type: "array", items: { type: "object" } };
    default:
      return { type: "string" };
  }
}

function propertiesFor(fields: readonly GrammarField[]): Readonly<Record<string, JsonValue>> {
  const properties: Record<string, JsonValue> = {};
  for (const field of fields) {
    properties[field.key] = jsonTypeFor(field);
  }
  return properties;
}

function requiredKeys(fields: readonly GrammarField[]): readonly string[] {
  return fields.filter((field) => field.required).map((field) => field.key);
}

function recordJsonSchema(record_: GrammarRecord): JsonValue {
  const properties: Record<string, JsonValue> = {};
  for (const field of record_.fields) {
    properties[field.key] =
      field.key === "kind" ? { const: record_.kind } : jsonTypeFor(field);
  }
  return {
    type: "object",
    additionalProperties: false,
    required: requiredKeys(record_.fields),
    properties,
  };
}

/** The JSON Schema of the parsed body: records when present, otherwise fields. */
function bodyJsonSchema(type: string, body: GrammarBodySpec): JsonValue {
  const $id = `azeforge.${type}/grammar/v1`;
  const records = body.records ?? [];
  if (body.form === "record-list" || records.length > 0) {
    return {
      $schema: JSON_SCHEMA_DIALECT,
      $id,
      type: "array",
      items: {
        oneOf: records.map(recordJsonSchema),
      },
    };
  }
  const fields = body.fields ?? [];
  return {
    $schema: JSON_SCHEMA_DIALECT,
    $id,
    type: "object",
    additionalProperties: false,
    required: requiredKeys(fields),
    properties: propertiesFor(fields),
  };
}

const GRAMMAR_LIMITS: Readonly<Record<string, JsonValue>> = Object.freeze({
  diagnostics: Object.freeze({
    perBlock: DEFAULT_DIAGNOSTIC_LIMITS.perBlock,
    perDocument: DEFAULT_DIAGNOSTIC_LIMITS.perDocument,
    policy: "lowerable-only",
  }),
  nesting: Object.freeze({ maxDepth: MAX_NESTING_DEPTH }),
  images: Object.freeze({
    maxBytes: MAX_IMAGE_BYTES,
    maxDimensionPx: MAX_IMAGE_DIMENSION_PX,
    maxPixels: MAX_IMAGE_PIXELS,
  }),
});

const GRAMMAR_DOCUMENT: GrammarDocumentEnvelope = Object.freeze({
  frontMatter: Object.freeze({
    delimiters: Object.freeze(["---"]),
    fields: fieldsFrom(
      Object.keys(KNOWN_METADATA_KEYS),
      FRONT_MATTER_TYPES,
      ["azemark"],
      FRONT_MATTER_VALUES,
    ),
  }),
  fences: Object.freeze({
    outer: "::::",
    nested: "::",
    separator: "----",
    indent: 2,
  }),
  comments: Object.freeze({ prefix: "//" }),
  identifier: Object.freeze({
    pattern: BLOCK_IDENTIFIER_PATTERN,
    scope: "document" as const,
  }),
});

/** The registered directive types, in canonical registry order. */
export function grammarDirectiveTypes(): readonly string[] {
  return Object.freeze(
    getBuiltInRegistry().plugins.map((plugin) => plugin.descriptor.type),
  );
}

/**
 * Build the canonical grammar document. Deterministic: identical inputs
 * serialize byte-identically, and nothing derived from the workstation
 * (paths, timestamps, platform) enters the report.
 */
export function buildGrammarDocument(
  options: Readonly<{ directive?: string }> = {},
): GrammarReport {
  const registry = getBuiltInRegistry();
  const selected = options.directive;
  if (
    selected !== undefined &&
    !Object.prototype.hasOwnProperty.call(DIRECTIVE_SPECS, selected)
  ) {
    throw new CompilerConfigurationError(
      "azeforge.grammar#unknown-directive",
      `Directive "${selected}" is not a registered AzeMark 2 directive.`,
    );
  }
  const directives: GrammarDirective[] = [];
  for (const plugin of registry.plugins) {
    const descriptor = plugin.descriptor;
    if (selected !== undefined && descriptor.type !== selected) continue;
    const spec = DIRECTIVE_SPECS[descriptor.type];
    if (spec === undefined) {
      throw new CompilerConfigurationError(
        "azeforge.grammar#missing-directive",
        `Registered directive "${descriptor.type}" has no grammar description.`,
      );
    }
    directives.push(
      Object.freeze({
        type: descriptor.type,
        title: descriptor.title,
        pluginVersion: descriptor.version,
        namespace: descriptor.diagnosticNamespace,
        bodySyntax: Object.freeze({ ...descriptor.bodySyntax }),
        header: spec.header,
        body: Object.freeze({
          ...spec.body,
          schema: bodyJsonSchema(descriptor.type, spec.body),
        }),
        limits: Object.freeze({ ...spec.limits }),
      }),
    );
  }
  return Object.freeze({
    schema: GRAMMAR_SCHEMA_ID,
    schemaVersion: GRAMMAR_SCHEMA_VERSION,
    tool: Object.freeze({ name: "azeforge" as const, version: TOOL_VERSION }),
    azemarkVersions: Object.freeze([2] as const),
    document: GRAMMAR_DOCUMENT,
    directives: Object.freeze(directives),
    limits: GRAMMAR_LIMITS,
  });
}

/** Canonical machine serialization: one JSON document plus newline. */
export function serializeGrammar(report: GrammarReport): string {
  return `${JSON.stringify(report)}\n`;
}
