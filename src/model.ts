export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

declare const contentHashBrand: unique symbol;
declare const artifactHashBrand: unique symbol;

export type Sha256Hash = `sha256:${string}`;
export type ContentHash = Sha256Hash & {
  readonly [contentHashBrand]: "contentHash";
};
export type ArtifactHash = Sha256Hash & {
  readonly [artifactHashBrand]: "artifactHash";
};

export interface SourcePosition {
  readonly line: number;
  readonly column: number;
  readonly offset: number;
}

export interface SourceRange {
  readonly start: SourcePosition;
  readonly end: SourcePosition;
}

export interface TextInline {
  readonly kind: "text";
  readonly value: string;
}

export interface EmphasisInline {
  readonly kind: "emphasis";
  readonly children: readonly Inline[];
}

export interface StrongInline {
  readonly kind: "strong";
  readonly children: readonly Inline[];
}

export interface CodeInline {
  readonly kind: "code";
  readonly value: string;
}

export interface LinkInline {
  readonly kind: "link";
  readonly href: string;
  readonly children: readonly Inline[];
  readonly title?: string;
  readonly range?: SourceRange;
}

export interface ImageInline {
  readonly kind: "image";
  readonly src: string;
  readonly alt: string;
  readonly title?: string;
  readonly range?: SourceRange;
}

export interface BreakInline {
  readonly kind: "break";
}

/* ------------------------------------------------------------------ *
 * Document composition inline spans (contract: issue #67)
 * ------------------------------------------------------------------ */

/** The closed locator-word set; a locator rides only on a Citation target. */
export type LocatorWord =
  | "page"
  | "pages"
  | "chapter"
  | "section"
  | "line"
  | "lines"
  | "note";

export interface Locator {
  readonly word: LocatorWord;
  readonly value: string;
}

/** Bare `@name` is the in-text form; any `[@…]` occurrence is parenthetical. */
export type ReferenceForm = "in-text" | "parenthetical";

/**
 * One `@`-token target. `resolved` is derived: the auto label and anchor are
 * recomputed on every compile and excluded from `contentHash`.
 */
export interface ReferenceInline {
  readonly kind: "reference";
  readonly target: string;
  readonly form: ReferenceForm;
  readonly locator?: Locator;
  readonly range?: SourceRange;
  readonly resolved?: ResolvedReference;
}

/** Derived resolution of one reference or citation target. */
export interface ResolvedReference {
  readonly href: string;
  readonly label: string;
  /** True when the target is a Citation record rather than an object Block. */
  readonly citation: boolean;
}

/** Derived delimiters for one parenthetical group under the document's style. */
export interface ResolvedReferenceGroup {
  readonly open: string;
  readonly close: string;
  readonly separator: string;
}

/** A mixed `[@a; @b]` group of up to eight targets, each rendering its own label. */
export interface ReferenceGroupInline {
  readonly kind: "referenceGroup";
  readonly targets: readonly ReferenceInline[];
  readonly range?: SourceRange;
  readonly resolved?: ResolvedReferenceGroup;
}

/** One `[^label]` marker; numbering and backlink target are derived. */
export interface FootnoteInline {
  readonly kind: "footnote";
  readonly label: string;
  readonly range?: SourceRange;
  readonly resolved?: {
    readonly href: string;
    readonly number: number;
    /** 1-based occurrence of this label's markers, in document order. */
    readonly marker: number;
  };
}

export type Inline =
  | TextInline
  | EmphasisInline
  | StrongInline
  | CodeInline
  | LinkInline
  | ImageInline
  | BreakInline
  | ReferenceInline
  | ReferenceGroupInline
  | FootnoteInline;

export interface HeadingBlock {
  readonly kind: "heading";
  readonly level: 1 | 2 | 3 | 4 | 5 | 6;
  readonly children: readonly Inline[];
  readonly range: SourceRange;
  readonly id?: string;
}

export interface ParagraphBlock {
  readonly kind: "paragraph";
  readonly children: readonly Inline[];
  readonly range: SourceRange;
  readonly id?: string;
}

export interface ThematicBreakBlock {
  readonly kind: "thematicBreak";
  readonly range: SourceRange;
  readonly id?: string;
}

export interface BlockquoteBlock {
  readonly kind: "blockquote";
  readonly children: readonly ParsedBlock[];
  readonly range: SourceRange;
  readonly id?: string;
}

export interface ListItem {
  readonly blocks: readonly ParsedBlock[];
  readonly range: SourceRange;
}

export interface ListBlock {
  readonly kind: "list";
  readonly ordered: boolean;
  readonly items: readonly ListItem[];
  readonly range: SourceRange;
  readonly id?: string;
  readonly start?: number;
}

export interface CodeBlock {
  readonly kind: "code";
  readonly value: string;
  readonly range: SourceRange;
  readonly id?: string;
  readonly language?: string;
}

export type TableAlignment = "left" | "center" | "right" | null;

export interface TableData {
  readonly align: readonly TableAlignment[];
  readonly header: readonly (readonly Inline[])[];
  readonly rows: readonly (readonly (readonly Inline[])[])[];
}

/** The closed seven-type column system (contract: issue #66 §3). */
export type TableColumnType =
  | "prose"
  | "text"
  | "integer"
  | "decimal"
  | "quantity"
  | "boolean"
  | "math";

/** Per-column alignment override; resolved to the type default when omitted. */
export type TableColumnAlignment = "left" | "center" | "right";

/** Typed table v2 shared record shape (catalog typed-table family). */
export interface TableColumn {
  readonly key: string;
  readonly name?: string;
  readonly type?: TableColumnType;
  readonly unit?: string;
  readonly align?: TableColumnAlignment;
}

export interface TableGroup {
  readonly name: string;
  readonly columns: readonly string[];
}

/**
 * One typed cell. The column type selects the member: `prose` holds Inline
 * content, `text` a plain label, `integer`/`decimal` a canonical exact-decimal
 * spelling, `quantity` a canonical coefficient with the resolved unit,
 * `boolean` a literal, and `math` one native-notation expression tree.
 */
export type TypedTableCell =
  | { readonly kind: "prose"; readonly value: readonly Inline[] }
  | { readonly kind: "text"; readonly value: string }
  | { readonly kind: "integer"; readonly value: string }
  | { readonly kind: "decimal"; readonly value: string }
  | {
      readonly kind: "quantity";
      readonly coefficient: string;
      readonly unit?: string;
    }
  | { readonly kind: "boolean"; readonly value: boolean }
  | { readonly kind: "math"; readonly tree: JsonValue };

export interface TypedTableData {
  readonly columns: readonly TableColumn[];
  readonly groups?: readonly TableGroup[];
  readonly rows: readonly (Readonly<Record<string, TypedTableCell>>)[];
}

export interface TableBlock {
  readonly kind: "table";
  readonly data: TypedTableData;
  readonly range: SourceRange;
  readonly id?: string;
  readonly caption?: readonly Inline[];
  readonly number?: boolean;
  /** Derived numbering label such as `Table 2`; excluded from `contentHash`. */
  readonly numberLabel?: string;
  readonly pluginVersion?: string;
}

export interface CalloutBlock {
  readonly kind: "callout";
  readonly variant: string;
  readonly children: readonly ParsedBlock[];
  readonly range: SourceRange;
  readonly id?: string;
  readonly title?: readonly Inline[];
  readonly pluginVersion: string;
}

export interface InvalidBlock {
  readonly kind: "invalid";
  readonly raw: string;
  readonly range: SourceRange;
  readonly diagnosticIndexes: readonly number[];
  readonly originalType?: string;
}
export interface EquationBlock {
  readonly kind: "equation";
  readonly range: SourceRange;
  readonly id?: string;
  readonly pluginVersion: string;
  /** Native equations carry a semantic expression tree; latex is the host-gated escape hatch. */
  readonly notation: "native" | "latex";
  /** Native: the closed-grammar semantic expression tree (identity carrier). */
  readonly tree?: JsonValue;
  /** Native: canonical spelling for formatter re-emission. */
  readonly spelling?: string;
  /** Latex escape hatch: the raw TeX string, hashed as today. */
  readonly tex?: string;
  readonly number?: boolean;
  readonly align?: "left" | "center" | "right";
}

export interface MermaidBlock {
  readonly kind: "mermaid";
  readonly range: SourceRange;
  readonly id?: string;
  readonly pluginVersion: string;
  readonly diagramType: string;
  readonly source: string;
  readonly title?: string;
  readonly description?: string;
}
export interface TexBlock {
  readonly kind: "tex";
  readonly range: SourceRange;
  readonly id?: string;
  readonly pluginVersion: string;
  readonly title: string;
  readonly description: string;
  readonly profile: "circuitikz" | "tikz" | "pgfplots" | "chemfig" | "tikz-cd";
  readonly body: string;
}


export interface DerivationStep {
  /** Semantic expression tree of the step (identity carrier). */
  readonly tree: JsonValue;
  /** Canonical spelling of the step expression (formatter re-emission). */
  readonly expression: string;
  readonly annotation?: readonly Inline[];
}

export interface DerivationBlock {
  readonly kind: "derivation";
  readonly range: SourceRange;
  readonly id?: string;
  readonly pluginVersion: string;
  readonly steps: readonly DerivationStep[];
  readonly number?: boolean;
  readonly align?: "left" | "center" | "right";
}

export interface PlotAxisConfig {
  readonly label?: string;
  readonly scale: "linear" | "log";
  readonly min?: string;
  readonly max?: string;
}

export interface PlotFunctionSeries {
  readonly kind: "function";
  readonly label?: string;
  readonly variable: string;
  readonly expression: string;
  readonly tree: JsonValue;
  readonly domainMin: string;
  readonly domainMax: string;
  readonly samples: number;
}

export interface PlotDataPoint {
  readonly x: string;
  readonly y: string;
  readonly error?: string;
  readonly errorLow?: string;
  readonly errorHigh?: string;
}

export interface PlotPointSeries {
  readonly kind: "line" | "scatter";
  readonly label?: string;
  readonly points: readonly PlotDataPoint[];
}

export type PlotSeries = PlotFunctionSeries | PlotPointSeries;

export interface PlotBlock {
  readonly kind: "plot";
  readonly range: SourceRange;
  readonly id?: string;
  readonly pluginVersion: string;
  readonly number?: boolean;
  readonly width: number;
  readonly height: number;
  readonly legend: boolean;
  readonly grid: boolean;
  readonly parameters: Readonly<Record<string, string>>;
  readonly xAxis: PlotAxisConfig;
  readonly yAxis: PlotAxisConfig;
  readonly series: readonly PlotSeries[];
}

export interface ChartBar {
  readonly category: string;
  readonly value: string;
  readonly error?: string;
  readonly errorLow?: string;
  readonly errorHigh?: string;
}

export interface ChartBarSeries {
  readonly kind: "bars";
  readonly label?: string;
  readonly bars: readonly ChartBar[];
}

export interface ChartHistogramSeries {
  readonly kind: "histogram";
  readonly label?: string;
  readonly values: readonly string[];
  readonly edges: readonly string[];
}

export type ChartSeries = ChartBarSeries | ChartHistogramSeries;
export interface ChartBlock {
  readonly kind: "chart";
  readonly range: SourceRange;
  readonly id?: string;
  readonly pluginVersion: string;
  readonly chartType: "bar" | "grouped-bar" | "stacked-bar" | "histogram";
  readonly number?: boolean;
  readonly width: number;
  readonly height: number;
  readonly legend: boolean;
  readonly grid: boolean;
  readonly xLabel?: string;
  readonly yLabel?: string;
  readonly yMin?: string;
  readonly yMax?: string;
  readonly series: readonly ChartSeries[];
}

export interface GeometryBounds {
  readonly minX: string;
  readonly minY: string;
  readonly maxX: string;
  readonly maxY: string;
}

export interface GeometryDeclaration {
  readonly kind: string;
  readonly name?: string;
  readonly label?: string;
  readonly visible?: boolean;
  readonly style?: "solid" | "dashed";
  readonly x?: string;
  readonly y?: string;
  readonly from?: string;
  readonly to?: string;
  readonly throughFirst?: string;
  readonly throughSecond?: string;
  readonly origin?: string;
  readonly through?: string;
  readonly center?: string;
  readonly radius?: string;
  readonly point?: string;
  readonly startAngle?: string;
  readonly endAngle?: string;
  readonly direction?: "cw" | "ccw";
  readonly vertices?: readonly string[];
  readonly first?: string;
  readonly second?: string;
  readonly circle?: string;
  readonly at?: string;
  readonly pick?: number;
  readonly segment?: string;
  readonly measure?: string;
  readonly group?: string;
  readonly segments?: readonly string[];
  readonly third?: string;
}

export interface ChemistryFormulaPart {
  readonly kind: "element" | "group";
  readonly symbol?: string;
  readonly parts?: readonly ChemistryFormulaPart[];
  readonly count: number;
}

export interface ChemistryFormulaUnit {
  readonly multiplier: number;
  readonly isotope?: number;
  readonly parts: readonly ChemistryFormulaPart[];
}

export interface FormulaBlock {
  readonly kind: "formula";
  readonly range: SourceRange;
  readonly id?: string;
  readonly pluginVersion: string;
  readonly number?: boolean;
  readonly expression: string;
  readonly units: readonly ChemistryFormulaUnit[];
  readonly charge: number;
  readonly chargeSpecified: boolean;
  readonly electron: boolean;
}

export interface ReactionSpecies {
  readonly coefficient?: number;
  readonly unspecifiedCoefficient: boolean;
  readonly expression: string;
  readonly state?: "s" | "l" | "g" | "aq";
  readonly units: readonly ChemistryFormulaUnit[];
  readonly charge: number;
  readonly chargeSpecified: boolean;
  readonly electron: boolean;
}

export interface ReactionBlock {
  readonly kind: "reaction";
  readonly range: SourceRange;
  readonly id?: string;
  readonly pluginVersion: string;
  readonly number?: boolean;
  readonly above?: string;
  readonly below?: string;
  readonly balance: "none" | "check";
  readonly arrow: "->" | "<-" | "<->";
  readonly reactants: readonly ReactionSpecies[];
  readonly products: readonly ReactionSpecies[];
}

export interface ChemistryAtom {
  readonly name: string;
  readonly element?: string;
  readonly attach?: string;
  readonly charge?: number;
  readonly isotope?: number;
  readonly x: string;
  readonly y: string;
  readonly stereo?: "unspecified";
}

export interface ChemistryBond {
  readonly from: string;
  readonly to: string;
  readonly order: "1" | "2" | "3" | "aromatic";
  readonly stereo?: "wedge" | "hash";
}

export interface ChemistryLabel {
  readonly text: string;
  readonly x: string;
  readonly y: string;
}

export interface StructureBlock {
  readonly kind: "structure";
  readonly range: SourceRange;
  readonly id?: string;
  readonly pluginVersion: string;
  readonly number?: boolean;
  readonly width: number;
  readonly height: number;
  readonly atoms: readonly ChemistryAtom[];
  readonly bonds: readonly ChemistryBond[];
  readonly labels?: readonly ChemistryLabel[];
}

export interface GeometryBlock {
  readonly kind: "geometry";
  readonly range: SourceRange;
  readonly id?: string;
  readonly pluginVersion: string;
  readonly number?: boolean;
  readonly width: number;
  readonly height: number;
  readonly bounds?: GeometryBounds;
  readonly declarations: readonly GeometryDeclaration[];
}
export type CircuitTextRun =
  | { readonly kind: "text" | "subscript" | "superscript"; readonly value: string }
  | { readonly kind: "quantity"; readonly coefficient: string; readonly prefix: string; readonly unit: string };
export type CircuitText = readonly CircuitTextRun[];
export type CircuitComponentKind =
  | "resistor" | "capacitor" | "inductor" | "voltage-source" | "current-source"
  | "diode" | "led" | "switch" | "dependent-source" | "op-amp" | "bjt" | "mosfet"
  | "and" | "or" | "nand" | "nor" | "xor" | "xnor" | "not" | "buffer"
  | "mux-2to1" | "mux-4to1" | "d-flip-flop" | "digital-input" | "digital-output";
export interface CircuitNode { readonly ref: string; readonly role: "signal" | "reference"; readonly label?: CircuitText; readonly range: SourceRange }
export interface CircuitComponent {
  readonly kind: CircuitComponentKind; readonly ref: string; readonly terminals: readonly string[];
  readonly orientation?: "left-to-right" | "right-to-left" | "top-to-bottom" | "bottom-to-top";
  readonly inputs?: 2 | 3 | 4; readonly name?: CircuitText; readonly value?: CircuitText;
  readonly mode?: string; readonly range: SourceRange;
}
export interface CircuitRelation { readonly componentRef: string; readonly terminal: string; readonly nodeId: string; readonly range: SourceRange }
export type CircuitAnnotation =
  | { readonly kind: "voltage-label"; readonly positive: string; readonly negative: string; readonly range: SourceRange }
  | { readonly kind: "current-label"; readonly componentRef: string; readonly terminal: string; readonly direction: "into" | "out"; readonly range: SourceRange };
export interface CircuitBlock {
  readonly kind: "circuit"; readonly pluginVersion: "1.0.0"; readonly range: SourceRange; readonly id?: string; readonly number?: boolean;
  readonly title: CircuitText; readonly description?: CircuitText; readonly flow: "left-to-right" | "top-to-bottom";
  readonly symbolConvention: "iec" | "ansi"; readonly nodes: readonly CircuitNode[]; readonly components: readonly CircuitComponent[];
  readonly relations: readonly CircuitRelation[]; readonly annotations: readonly CircuitAnnotation[];
}
/** One registered timing interval state; character and word spellings are two surfaces of this enum. */
export type TimingIntervalState =
  | "low" | "high" | "unknown" | "impedance" | "bus" | "continue" | "rise" | "fall";
export interface TimingInterval {
  /** Whole-cycle length on the `cycles` scale; absent on the `time` scale. */
  readonly count?: string;
  /** Exact decimal length in the Block unit on the `time` scale; absent on `cycles`. */
  readonly duration?: string;
  readonly state: TimingIntervalState;
  /** Authored bus display label; never parsed as binary and never checked against `width`. */
  readonly value?: CircuitText;
}
export interface TimingSignal {
  readonly ref: string;
  readonly clock: boolean;
  /** Exact decimal offset from grid zero; `0` when unauthored. */
  readonly phase: string;
  /** Authored bus width in bits; sizes bus-slash marks only. */
  readonly width?: number;
  readonly intervals: readonly TimingInterval[];
  readonly range: SourceRange;
}
export interface TimingGroup {
  readonly label: CircuitText;
  readonly signals: readonly string[];
  readonly range: SourceRange;
}
export interface TimingMarker {
  /** Exact decimal cycle position, or the duration equivalent on the `time` scale. */
  readonly at: string;
  readonly label?: CircuitText;
  readonly range: SourceRange;
}
/** One resolved `signal@boundary` anchor; the boundary indexes interval edges after `phase`. */
export interface TimingAnchor {
  readonly signal: string;
  readonly boundary: string;
  readonly range: SourceRange;
}
export interface TimingArrow {
  readonly from: TimingAnchor;
  readonly to: TimingAnchor;
  readonly label?: CircuitText;
  readonly range: SourceRange;
}
export interface TimingBlock {
  readonly kind: "timing"; readonly pluginVersion: "1.0.0"; readonly range: SourceRange;
  readonly id?: string; readonly number?: boolean;
  readonly title: CircuitText; readonly description?: CircuitText;
  readonly scale: "cycles" | "time"; readonly unit?: string;
  readonly signals: readonly TimingSignal[]; readonly groups: readonly TimingGroup[];
  readonly markers: readonly TimingMarker[]; readonly arrows: readonly TimingArrow[];
}



/** Registered diagram regimes: the mode selects structural validation and layout. */
export type DiagramMode = "flowchart" | "graph" | "tree" | "architecture";
/** Closed shape vocabulary; shapes carry no semantic validation. */
export type DiagramShape =
  | "rectangle"
  | "rounded"
  | "diamond"
  | "parallelogram"
  | "circle"
  | "hexagon"
  | "cylinder";
/** Authored port attachment side; omission lets the layout engine choose. */
export type DiagramPortSide = "left" | "right" | "top" | "bottom";
/** Authored flow direction; the per-mode default applies when omitted. */
export type DiagramFlow =
  | "top-to-bottom"
  | "bottom-to-top"
  | "left-to-right"
  | "right-to-left";
/** Edge direction; undirected edges are permitted only in graph and architecture. */
export type DiagramEdgeDirection = "directed" | "undirected";
/**
 * One authored label line, in the shared inline text subset. A label is one
 * line, or several lines from a `|` multiline field whose authored breaks are
 * the only breaks.
 */
export type DiagramLabel = readonly CircuitText[];

/** A named attachment point on a Diagram node; it carries no direction. */
export interface DiagramPort {
  readonly name: string;
  readonly side?: DiagramPortSide;
  readonly range: SourceRange;
}

export interface DiagramNode {
  readonly kind: "node";
  readonly name: string;
  readonly label?: DiagramLabel;
  readonly shape: DiagramShape;
  /** Containing group name, resolved after the whole declaration list is read. */
  readonly parent?: string;
  readonly ports: readonly DiagramPort[];
  readonly range: SourceRange;
}

export interface DiagramGroup {
  readonly kind: "group";
  readonly name: string;
  readonly label?: DiagramLabel;
  readonly parent?: string;
  readonly range: SourceRange;
}

/** One edge endpoint: a node name, or a qualified `node.port` reference. */
export interface DiagramEndpoint {
  readonly name: string;
  readonly port?: string;
  readonly range: SourceRange;
}

export interface DiagramEdge {
  readonly kind: "edge";
  readonly from: DiagramEndpoint;
  readonly to: DiagramEndpoint;
  readonly label?: DiagramLabel;
  readonly direction: DiagramEdgeDirection;
  readonly range: SourceRange;
}

export type DiagramDeclaration = DiagramNode | DiagramGroup | DiagramEdge;

export interface DiagramBlock {
  readonly kind: "diagram"; readonly pluginVersion: "1.0.0"; readonly range: SourceRange;
  readonly id?: string; readonly number?: boolean;
  readonly title?: CircuitText; readonly description?: CircuitText;
  readonly mode: DiagramMode; readonly flow: DiagramFlow;
  readonly declarations: readonly DiagramDeclaration[];
}

/* ------------------------------------------------------------------ *
 * Native software and data models (contract: issue #61)
 * ------------------------------------------------------------------ */

/**
 * Authored text in this family is literal: never parsed as code, an
 * expression or a type, never executed, never compared against anything
 * computed. It is preserved exactly after envelope decoding and enters
 * contentHash verbatim.
 */
export type ModelsText = string;

/** One closed word enum, shared verbatim by ER ends and class associations. */
export type Cardinality = "one" | "zero-or-one" | "many" | "one-or-many";

export type SequenceParticipantKind = "participant" | "actor";
export interface SequenceParticipant {
  readonly name: string;
  readonly kind: SequenceParticipantKind;
  readonly label?: ModelsText;
  readonly range: SourceRange;
}

export type SequenceMessageForm = "sync" | "async" | "return";
export interface SequenceMessage {
  readonly kind: "message";
  readonly form: SequenceMessageForm;
  readonly from: string;
  readonly to: string;
  readonly text?: ModelsText;
  readonly activate: boolean;
  readonly deactivate: boolean;
  readonly range: SourceRange;
}

/** A note spans its authored `over:` participants; one or two only. */
export interface SequenceNote {
  readonly kind: "note";
  readonly over: readonly string[];
  readonly text: ModelsText;
  readonly range: SourceRange;
}

/** One ordered `alt` division; an omitted `condition:` is unspecified. */
export interface SequenceDivision {
  readonly condition?: ModelsText;
  readonly body: readonly SequenceTimelineItem[];
  readonly range: SourceRange;
}

export interface SequenceAlt {
  readonly kind: "alt";
  readonly divisions: readonly SequenceDivision[];
  readonly range: SourceRange;
}

export interface SequenceLoop {
  readonly kind: "loop";
  readonly condition?: ModelsText;
  readonly body: readonly SequenceTimelineItem[];
  readonly range: SourceRange;
}

export type SequenceTimelineItem = SequenceMessage | SequenceAlt | SequenceLoop | SequenceNote;

export interface SequenceBlock {
  readonly kind: "sequence"; readonly pluginVersion: "1.0.0"; readonly range: SourceRange;
  readonly id?: string; readonly number?: boolean;
  readonly title?: ModelsText; readonly description?: ModelsText;
  /** Authored lane order is left-to-right order; resolved kind carries the default. */
  readonly participants: readonly SequenceParticipant[];
  readonly timeline: readonly SequenceTimelineItem[];
}

export interface StatePseudoState {
  readonly kind: "initial" | "final";
  readonly name: string;
  readonly range: SourceRange;
}

export interface CompositeState {
  readonly kind: "state";
  readonly name: string;
  readonly label?: ModelsText;
  /** Nested scope; only states and pseudo-states live here. */
  readonly states: readonly StateScopedItem[];
  readonly range: SourceRange;
}

export type StateScopedItem = CompositeState | StatePseudoState;

export interface StateTransition {
  readonly kind: "transition";
  readonly from: string;
  readonly to: string;
  readonly trigger?: ModelsText;
  readonly guard?: ModelsText;
  readonly action?: ModelsText;
  readonly range: SourceRange;
}

export interface StateBlock {
  readonly kind: "state"; readonly pluginVersion: "1.0.0"; readonly range: SourceRange;
  readonly id?: string; readonly number?: boolean;
  readonly title?: ModelsText; readonly description?: ModelsText;
  /** One flat ordered collection: states, pseudo-states and transitions. */
  readonly items: readonly (StateScopedItem | StateTransition)[];
}

export type EntityKey = "primary" | "foreign" | "unique";
export interface EntityReference {
  readonly entity: string;
  readonly attribute: string;
}
export interface EntityAttribute {
  readonly name: string;
  readonly type?: ModelsText;
  /** Omission is meaning: a written-but-empty `keys:` is not the same value. */
  readonly keys?: readonly EntityKey[];
  readonly optional: boolean;
  readonly reference?: EntityReference;
  readonly range: SourceRange;
}
export interface EntityEntity {
  readonly kind: "entity";
  readonly name: string;
  readonly label?: ModelsText;
  /** Omission is meaning: an entity named but not yet detailed has none. */
  readonly attributes?: readonly EntityAttribute[];
  readonly range: SourceRange;
}
/** Each end states how many instances of its own entity participate. */
export interface EntityRelationshipEnd {
  readonly entity: string;
  readonly cardinality: Cardinality;
  readonly role?: ModelsText;
  readonly range: SourceRange;
}
export interface EntityRelationship {
  readonly kind: "relationship";
  readonly label?: ModelsText;
  readonly first: EntityRelationshipEnd;
  readonly second: EntityRelationshipEnd;
  readonly range: SourceRange;
}
export interface EntityBlock {
  readonly kind: "entity"; readonly pluginVersion: "1.0.0"; readonly range: SourceRange;
  readonly id?: string; readonly number?: boolean;
  readonly title?: ModelsText; readonly description?: ModelsText;
  readonly items: readonly (EntityEntity | EntityRelationship)[];
}

export type ClassVisibility = "public" | "private" | "protected" | "package";
export interface ClassAttribute {
  readonly name: string;
  readonly type?: ModelsText;
  readonly visibility?: ClassVisibility;
  readonly static: boolean;
  readonly range: SourceRange;
}
export interface ClassParameter {
  readonly name: string;
  readonly type?: ModelsText;
  readonly range: SourceRange;
}
export interface ClassOperation {
  readonly name: string;
  readonly visibility?: ClassVisibility;
  readonly static: boolean;
  /** Omitted, never defaulted: an unspecified parameter list is not an empty one. */
  readonly parameters?: readonly ClassParameter[];
  readonly returnType?: ModelsText;
  readonly range: SourceRange;
}
export interface ClassClassifier {
  readonly kind: "class" | "interface";
  readonly name: string;
  readonly label?: ModelsText;
  /** Only a class carries the flag; an interface is implicitly abstract. */
  readonly abstract?: boolean;
  /** An interface is an operation contract and declares no attributes. */
  readonly attributes?: readonly ClassAttribute[];
  readonly operations: readonly ClassOperation[];
  readonly range: SourceRange;
}
export type ClassRelationshipForm =
  | "inheritance" | "implementation" | "association" | "aggregation" | "composition";
export interface ClassRelationship {
  readonly kind: "relationship";
  readonly form: ClassRelationshipForm;
  readonly from: string;
  readonly to: string;
  readonly label?: ModelsText;
  readonly fromMultiplicity?: Cardinality;
  readonly toMultiplicity?: Cardinality;
  readonly range: SourceRange;
}
export interface ClassBlock {
  readonly kind: "class"; readonly pluginVersion: "1.0.0"; readonly range: SourceRange;
  readonly id?: string; readonly number?: boolean;
  readonly title?: ModelsText; readonly description?: ModelsText;
  readonly items: readonly (ClassClassifier | ClassRelationship)[];
}

/* ------------------------------------------------------------------ *
 * Native engineering diagrams (contract: issue #65)
 * ------------------------------------------------------------------ */

/** Authored control flow direction; the versioned built-in default is left-to-right. */
export type ControlFlow =
  | "top-to-bottom"
  | "bottom-to-top"
  | "left-to-right"
  | "right-to-left";

/** The closed summing-sign vocabulary; the list pairs positionally with in-edges. */
export type ControlSign = "+" | "-";

/** A SISO function block: one implicit input, one implicit output, plain-text `tf:`. */
export interface ControlBlockItem {
  readonly kind: "block";
  readonly name: string;
  readonly label?: CircuitText;
  readonly tf: CircuitText;
  readonly range: SourceRange;
}

/**
 * A summing junction. `signs` pairs positionally with the junction's in-edges
 * in authored declaration order, so its length and order are hash-significant.
 */
export interface ControlSumItem {
  readonly kind: "sum";
  readonly name: string;
  readonly signs: readonly ControlSign[];
  readonly range: SourceRange;
}

/** A directional boundary stub: an input only feeds edges, an output only receives them. */
export interface ControlStubItem {
  readonly kind: "input" | "output";
  readonly name: string;
  readonly label: CircuitText;
  readonly range: SourceRange;
}

/** An anonymous signal edge; nothing references an edge, so it carries no `name:`. */
export interface ControlEdgeItem {
  readonly kind: "edge";
  readonly from: string;
  readonly to: string;
  readonly label?: CircuitText;
  readonly range: SourceRange;
}

export type ControlDeclaration =
  | ControlBlockItem
  | ControlSumItem
  | ControlStubItem
  | ControlEdgeItem;

export interface ControlBlock {
  readonly kind: "control";
  readonly pluginVersion: "1.0.0";
  readonly range: SourceRange;
  readonly id?: string;
  readonly number?: boolean;
  readonly title?: CircuitText;
  readonly description?: CircuitText;
  readonly flow: ControlFlow;
  readonly declarations: readonly ControlDeclaration[];
}

/** One attachment value: exactly one point name or a bounded `(x, y)` pair. */
export type FreeBodyAttachment =
  | { readonly kind: "point"; readonly name: string }
  | { readonly kind: "coordinates"; readonly x: string; readonly y: string };

/**
 * The three closed direction forms. A relative form names a `line` record and
 * resolves by the ray rule; exactly one form is authored per vector.
 */
export type FreeBodyDirection =
  | { readonly kind: "angle"; readonly degrees: string }
  | { readonly kind: "parallel-to"; readonly line: string }
  | { readonly kind: "perpendicular-to"; readonly line: string };

export type FreeBodyBodyKind = "block" | "circle" | "polygon" | "particle";

/** An axis-aligned box body, optionally rotated about its center. */
export interface FreeBodyBoxBody {
  readonly kind: "block";
  readonly name: string;
  readonly x: string;
  readonly y: string;
  readonly width: string;
  readonly height: string;
  readonly angle: string;
  readonly visible: boolean;
  readonly range: SourceRange;
}

export interface FreeBodyCircleBody {
  readonly kind: "circle";
  readonly name: string;
  readonly x: string;
  readonly y: string;
  readonly radius: string;
  readonly visible: boolean;
  readonly range: SourceRange;
}

export interface FreeBodyPolygonBody {
  readonly kind: "polygon";
  readonly name: string;
  readonly vertices: readonly string[];
  readonly visible: boolean;
  readonly range: SourceRange;
}

/** A massless body at one authored coordinate. */
export interface FreeBodyParticleBody {
  readonly kind: "particle";
  readonly name: string;
  readonly x: string;
  readonly y: string;
  readonly visible: boolean;
  readonly range: SourceRange;
}

export type FreeBodyBody =
  | FreeBodyBoxBody
  | FreeBodyCircleBody
  | FreeBodyPolygonBody
  | FreeBodyParticleBody;

export interface FreeBodyPoint {
  readonly kind: "point";
  readonly name: string;
  readonly label?: CircuitText;
  readonly x: string;
  readonly y: string;
  readonly visible: boolean;
  readonly range: SourceRange;
}

/** A finite segment, invisible by default: its from–to order picks the ray. */
export interface FreeBodyLine {
  readonly kind: "line";
  readonly name: string;
  readonly from: string;
  readonly to: string;
  readonly visible: boolean;
  readonly style: "solid" | "dashed";
  readonly range: SourceRange;
}

export interface FreeBodyForce {
  readonly kind: "force";
  readonly at: FreeBodyAttachment;
  readonly direction: FreeBodyDirection;
  readonly magnitude?: string;
  readonly length?: string;
  readonly label?: CircuitText;
  readonly range: SourceRange;
}

/** Moments are always schematic and exempt from `scale:`; `direction` is cw or ccw. */
export interface FreeBodyMoment {
  readonly kind: "moment";
  readonly at: FreeBodyAttachment;
  readonly direction: "cw" | "ccw";
  readonly label?: CircuitText;
  readonly range: SourceRange;
}

export interface FreeBodyAxes {
  readonly kind: "axes";
  readonly at: FreeBodyAttachment;
  readonly angle: string;
  readonly xLabel: CircuitText;
  readonly yLabel: CircuitText;
  readonly range: SourceRange;
}

export interface FreeBodyAngleMark {
  readonly kind: "angle-mark";
  readonly first: string;
  readonly vertex: string;
  readonly third: string;
  readonly label?: CircuitText;
  readonly range: SourceRange;
}

export interface FreeBodyDimension {
  readonly kind: "dimension";
  readonly from: FreeBodyAttachment;
  readonly to: FreeBodyAttachment;
  readonly label: CircuitText;
  readonly range: SourceRange;
}

export type FreeBodyDeclaration =
  | FreeBodyBody
  | FreeBodyPoint
  | FreeBodyLine
  | FreeBodyForce
  | FreeBodyMoment
  | FreeBodyAxes
  | FreeBodyAngleMark
  | FreeBodyDimension;

export interface FreeBodyBlock {
  readonly kind: "free-body";
  readonly pluginVersion: "1.0.0";
  readonly range: SourceRange;
  readonly id?: string;
  readonly number?: boolean;
  readonly title?: CircuitText;
  readonly description?: CircuitText;
  /** Frame units per force unit; present only when every force authors `magnitude:`. */
  readonly scale?: string;
  readonly width: number;
  readonly height: number;
  readonly bounds?: GeometryBounds;
  readonly declarations: readonly FreeBodyDeclaration[];
}

/* ------------------------------------------------------------------ *
 * Structured technical content (contract: issue #66)
 * ------------------------------------------------------------------ */

/** The six closed pseudocode statement forms (contract: issue #66 §5). */
export type AlgorithmStatementKind =
  | "assign"
  | "if"
  | "for"
  | "while"
  | "return"
  | "text";

/**
 * `target = expression`. A target is a name or one indexing level; the stored
 * `expression` is the canonical spelling of the parsed-but-never-evaluated
 * pseudocode expression context.
 */
export interface AlgorithmAssignStatement {
  readonly kind: "assign";
  readonly target: string;
  readonly index?: string;
  readonly expression: string;
  readonly range: SourceRange;
}

/** One `else-if:` condition with its own nested statement list. */
export interface AlgorithmIfBranch {
  readonly condition: string;
  readonly statements: readonly AlgorithmStatement[];
  readonly range: SourceRange;
}

export interface AlgorithmIfStatement {
  readonly kind: "if";
  readonly condition: string;
  readonly then: readonly AlgorithmStatement[];
  readonly elseIf: readonly AlgorithmIfBranch[];
  readonly else?: readonly AlgorithmStatement[];
  readonly range: SourceRange;
}

export interface AlgorithmForStatement {
  readonly kind: "for";
  readonly variable: string;
  readonly from: string;
  readonly direction: "to" | "downto";
  readonly to: string;
  readonly by?: string;
  readonly statements: readonly AlgorithmStatement[];
  readonly range: SourceRange;
}

export interface AlgorithmWhileStatement {
  readonly kind: "while";
  readonly condition: string;
  readonly statements: readonly AlgorithmStatement[];
  readonly range: SourceRange;
}

export interface AlgorithmReturnStatement {
  readonly kind: "return";
  readonly expression?: string;
  readonly range: SourceRange;
}

/** An authored prose line: semantic content, never a comment. */
export interface AlgorithmTextStatement {
  readonly kind: "text";
  readonly text: readonly Inline[];
  readonly range: SourceRange;
}

export type AlgorithmStatement =
  | AlgorithmAssignStatement
  | AlgorithmIfStatement
  | AlgorithmForStatement
  | AlgorithmWhileStatement
  | AlgorithmReturnStatement
  | AlgorithmTextStatement;

export interface AlgorithmBlock {
  readonly kind: "algorithm";
  readonly procedure: string;
  readonly parameters: readonly string[];
  readonly steps: readonly AlgorithmStatement[];
  readonly range: SourceRange;
  readonly id?: string;
  readonly number?: boolean;
  readonly caption?: readonly Inline[];
  readonly numberLabel?: string;
  readonly pluginVersion: string;
}

/** The closed statement-kind enum; family vocabulary inside the catalog line. */
export type StatementKind =
  | "theorem"
  | "definition"
  | "lemma"
  | "corollary"
  | "proposition"
  | "remark";

export interface StatementBlock {
  readonly kind: "statement";
  readonly statementKind: StatementKind;
  readonly text: readonly ParsedBlock[];
  readonly proof?: readonly ParsedBlock[];
  readonly range: SourceRange;
  readonly id?: string;
  readonly number?: boolean;
  readonly caption?: readonly Inline[];
  readonly numberLabel?: string;
  readonly pluginVersion: string;
}

/** One ordered example step; its mathematics lives in the nested Block content. */
export interface ExampleStep {
  readonly text: readonly ParsedBlock[];
  readonly range: SourceRange;
}

export interface ExampleBlock {
  readonly kind: "example";
  readonly problem: readonly ParsedBlock[];
  readonly givens: readonly string[];
  readonly steps: readonly ExampleStep[];
  readonly result?: readonly ParsedBlock[];
  readonly range: SourceRange;
  readonly id?: string;
  readonly number?: boolean;
  readonly caption?: readonly Inline[];
  readonly numberLabel?: string;
  readonly pluginVersion: string;
}

/* ------------------------------------------------------------------ *
 * Document composition (contract: issue #67)
 * ------------------------------------------------------------------ */

/** The numbering path for ordinary Markdown content and escape-hatch bodies. */
export interface FigureBlock {
  readonly kind: "figure";
  readonly children: readonly ParsedBlock[];
  readonly range: SourceRange;
  readonly id?: string;
  readonly number?: boolean;
  readonly caption?: readonly Inline[];
  readonly numberLabel?: string;
  readonly pluginVersion: string;
}

export type BibliographyEntryType =
  | "article"
  | "book"
  | "chapter"
  | "report"
  | "thesis"
  | "web"
  | "software"
  | "standard"
  | "other";

export interface BibliographyAuthor {
  readonly name: string;
  readonly family?: string;
}

/** One closed-field Citation record; `key` joins the document identifier namespace. */
export interface BibliographyEntry {
  readonly key: string;
  readonly entryType: BibliographyEntryType;
  readonly title: string;
  readonly authors: readonly BibliographyAuthor[];
  readonly year?: string;
  readonly venue?: string;
  readonly publisher?: string;
  readonly edition?: string;
  readonly pages?: string;
  readonly url?: string;
  readonly doi?: string;
  readonly note?: string;
  readonly range: SourceRange;
}

export interface BibliographyBlock {
  readonly kind: "bibliography";
  readonly entries: readonly BibliographyEntry[];
  readonly range: SourceRange;
  readonly id?: string;
  readonly number?: boolean;
  readonly caption?: readonly Inline[];
  readonly numberLabel?: string;
  /** Derived: the works-cited projection in rendered-list order. */
  readonly worksCited?: readonly BibliographyEntry[];
  readonly pluginVersion: string;
}

/** One `[^label]: text` definition: a single inline paragraph, never nested Blocks. */
export interface FootnoteDefinitionBlock {
  readonly kind: "footnoteDefinition";
  readonly label: string;
  readonly children: readonly Inline[];
  readonly range: SourceRange;
}

export type ParsedBlock =
  | HeadingBlock
  | ParagraphBlock
  | ThematicBreakBlock
  | BlockquoteBlock
  | ListBlock
  | CodeBlock
  | TableBlock
  | CalloutBlock
  | EquationBlock
  | MermaidBlock
  | TexBlock
  | DerivationBlock
  | PlotBlock
  | ChartBlock
  | GeometryBlock
  | FormulaBlock
  | ReactionBlock
  | StructureBlock
  | TimingBlock
  | DiagramBlock
  | SequenceBlock
  | StateBlock
  | EntityBlock
  | ClassBlock
  | CircuitBlock
  | ControlBlock
  | FreeBodyBlock
  | AlgorithmBlock
  | StatementBlock
  | ExampleBlock
  | FigureBlock
  | BibliographyBlock
  | FootnoteDefinitionBlock
  | InvalidBlock;

export type AzeBlock =
  | HeadingBlock
  | ParagraphBlock
  | ThematicBreakBlock
  | BlockquoteBlock
  | ListBlock
  | CodeBlock
  | TableBlock
  | CalloutBlock
  | EquationBlock
  | MermaidBlock
  | TexBlock
  | DerivationBlock
  | PlotBlock
  | ChartBlock
  | GeometryBlock
  | FormulaBlock
  | ReactionBlock
  | TimingBlock
  | DiagramBlock
  | SequenceBlock
  | StateBlock
  | EntityBlock
  | ClassBlock
  | CircuitBlock
  | StructureBlock
  | ControlBlock
  | FreeBodyBlock
  | AlgorithmBlock
  | StatementBlock
  | ExampleBlock
  | FigureBlock
  | BibliographyBlock
  | FootnoteDefinitionBlock;
export type ArtifactFormat = "html" | "svg" | "png" | "pdf";

export interface DocumentMetadata {
  readonly authors: readonly string[];
  readonly extensions: Readonly<Record<string, JsonValue>>;
  readonly title?: string;
  readonly theme?: string;
  readonly outputs?: readonly ArtifactFormat[];
  /** Semantic document setting, not a Renderer choice (contract: issue #67 §8). */
  readonly citationStyle?: CitationStyle;
}

/** The two supported bibliography styles; `numeric` is the versioned default. */
export type CitationStyle = "numeric" | "author-year";

/** One endnote-rendered footnote definition in first-reference order. */
export interface EndnoteEntry {
  readonly label: string;
  readonly number: number;
  readonly children: readonly Inline[];
  /** How many `[^label]` markers point at this definition. */
  readonly markers: number;
}

/**
 * Derived composition projection: numbering labels, citation order, endnote
 * order and the resolved citation style. Deterministic, recomputed on every
 * compile, format-independent, and excluded from `contentHash` (ADR 0007).
 */
export interface DocumentComposition {
  readonly citationStyle: CitationStyle;
  readonly endnotes: readonly EndnoteEntry[];
}

export interface ParsedDocument {
  readonly azemarkVersion: 2;
  readonly schemaVersion: 3;
  readonly metadata: DocumentMetadata;
  readonly blocks: readonly ParsedBlock[];
}

export interface AzeDocument {
  readonly azemarkVersion: 2;
  readonly schemaVersion: 3;
  readonly metadata: DocumentMetadata;
  readonly blocks: readonly AzeBlock[];
  readonly composition?: DocumentComposition;
}

export type DiagnosticSeverity = "error" | "warning" | "info";

export type DiagnosticLocation =
  | { readonly source: string; readonly range?: SourceRange }
  | { readonly source?: string; readonly range: SourceRange };

export interface RelatedLocation {
  readonly source?: string;
  readonly range: SourceRange;
  readonly message: string;
}

export interface DiagnosticFixEdit {
  readonly range: SourceRange;
  readonly expectedText: string;
  readonly replacementText: string;
}

export interface DiagnosticFix {
  readonly title: string;
  readonly applicability: "safe";
  readonly edits: readonly DiagnosticFixEdit[];
}

export interface Diagnostic {
  readonly code: string;
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  readonly data: Readonly<Record<string, JsonValue>>;
  readonly location?: DiagnosticLocation;
  readonly suggestion?: string;
  readonly fix?: DiagnosticFix;
  readonly relatedLocations: readonly RelatedLocation[];
}

export interface ParseOptions {
  readonly sourceName?: string;
  readonly plugins?: readonly AzeBlockPlugin[];
  readonly allowRawLatex?: boolean;
}

export interface ParseResult {
  readonly document: ParsedDocument;
  readonly diagnostics: readonly Diagnostic[];
}

export interface ValidationResult {
  readonly document?: AzeDocument;
  readonly diagnostics: readonly Diagnostic[];
}

export interface FormatOptions {
  readonly sourceName?: string;
}

export interface FormatResult {
  readonly source?: string;
  readonly diagnostics: readonly Diagnostic[];
}

export interface Theme {
  readonly id: string;
  readonly version: string;
  readonly title: string;
  readonly colorScheme: "light" | "dark";
  readonly colors: Readonly<{
    background: string;
    foreground: string;
    muted: string;
  }>;
  readonly typography: Readonly<{
    proseFontFamily: "Inter";
    bodyFontWeight: 400;
    headingFontWeight: 700;
    lineHeight: number;
    headingLineHeight: number;
    paragraphSpacingEm: number;
  }>;
  readonly geometry: Readonly<{
    canvasWidthPx: number;
    contentWidthPx: number;
    paddingPx: number;
  }>;
  /**
   * General-diagram tokens. The three label typography sets are layout
   * inputs: label size derives from them through the Advance metric, so a
   * Theme change re-lays-out diagrams. Identities are Theme-owned; the
   * diagram family selects none of them.
   */
  readonly diagram: Readonly<{
    nodeFill: string;
    nodeStroke: string;
    nodeStrokeWidthPx: number;
    nodeLabelFontSizePx: number;
    nodeLabelLineHeightPx: number;
    groupFill: string;
    groupStroke: string;
    groupStrokeWidthPx: number;
    groupLabelFontSizePx: number;
    groupLabelLineHeightPx: number;
    groupDepthOpacityStep: number;
    edgeStroke: string;
    edgeStrokeWidthPx: number;
    edgeLabelFontSizePx: number;
    edgeLabelLineHeightPx: number;
    edgeLabelBackground: string;
    arrowFill: string;
    portFill: string;
    portStroke: string;
    portStrokeWidthPx: number;
    portSizePx: number;
    labelFontFamily: "Inter";
    minimumLabelFontSizePx: number;
  }>;
  /**
   * Software- and data-model tokens (contract: issue #61 §11). The label and
   * member typography sets are layout inputs measured through the Advance
   * metric, so a Theme change re-lays-out the four directive kinds. Every box
   * sizes to its content: there is no authored dimension field to scale.
   */
  readonly models: Readonly<{
    boxFill: string;
    boxStroke: string;
    boxStrokeWidthPx: number;
    boxCornerRadiusPx: number;
    headerFill: string;
    dividerStroke: string;
    dividerStrokeWidthPx: number;
    labelFontFamily: "Inter";
    labelFontSizePx: number;
    labelLineHeightPx: number;
    memberFontSizePx: number;
    memberLineHeightPx: number;
    captionFontSizePx: number;
    markerFontSizePx: number;
    markerInk: string;
    paddingXPx: number;
    paddingYPx: number;
    columnGapPx: number;
    wrapWidthPx: number;
    lifelineStroke: string;
    lifelineStrokeWidthPx: number;
    lifelineDash: string;
    activationFill: string;
    activationStroke: string;
    activationWidthPx: number;
    messageStroke: string;
    messageStrokeWidthPx: number;
    arrowFill: string;
    selfMessageWidthPx: number;
    noteFill: string;
    noteStroke: string;
    fragmentStroke: string;
    fragmentStrokeWidthPx: number;
    fragmentDash: string;
    fragmentLabelFill: string;
    rankGapPx: number;
    rowGapPx: number;
    diamondSizePx: number;
    minimumFontSizePx: number;
  }>;
  /**
   * Control-system diagram tokens (contract: issue #65 §14). `blockLabel*`
   * (`tf:` text) and `signalLabel*` (edge and stub labels) are two distinct
   * typographic sets, and both are layout inputs measured through the Advance
   * metric, so a Theme change re-lays-out control Blocks.
   */
  readonly control: Readonly<{
    blockFill: string;
    blockStroke: string;
    blockStrokeWidthPx: number;
    blockLabelFontSizePx: number;
    blockLabelLineHeightPx: number;
    signalLabelFontSizePx: number;
    signalLabelLineHeightPx: number;
    edgeStroke: string;
    edgeStrokeWidthPx: number;
    edgeLabelBackground: string;
    arrowFill: string;
    sumFill: string;
    sumStroke: string;
    sumStrokeWidthPx: number;
    sumSignFontSizePx: number;
    takeoffFill: string;
    takeoffRadiusPx: number;
    stubFill: string;
    stubStroke: string;
    stubStrokeWidthPx: number;
    stubLabelFontSizePx: number;
    stubLabelLineHeightPx: number;
    labelFontFamily: "Inter";
    minimumLabelFontSizePx: number;
  }>;
  /**
   * Free-body diagram tokens (contract: issue #65 §14). One body fill/stroke
   * set is shared by every body kind; axes are visually distinct from force
   * arrows by token, never by author choice.
   */
  readonly freeBody: Readonly<{
    bodyFill: string;
    bodyStroke: string;
    bodyStrokeWidthPx: number;
    pointRadiusPx: number;
    pointFill: string;
    pointStroke: string;
    forceStroke: string;
    forceStrokeWidthPx: number;
    forceArrowFill: string;
    arrowheadMinLengthPx: number;
    momentStroke: string;
    momentStrokeWidthPx: number;
    momentFill: string;
    axisStroke: string;
    axisStrokeWidthPx: number;
    axisDash: string;
    dimensionStroke: string;
    dimensionStrokeWidthPx: number;
    tickSizePx: number;
    labelFontFamily: "Inter";
    labelFontSizePx: number;
    markFontSizePx: number;
    minimumLabelFontSizePx: number;
  }>;
}

export interface AssetManifestEntry {
  readonly path: string;
  readonly mediaType: "image/png" | "image/jpeg" | "image/svg+xml";
  readonly byteLength: number;
  readonly bytesHash: Sha256Hash;
}

interface ArtifactMetadataBase {
  readonly byteLength: number;
  readonly contentHash: ContentHash;
  readonly assetManifestHash: Sha256Hash;
  readonly rendererFingerprint: Sha256Hash;
  readonly artifactHash: ArtifactHash;
  readonly theme: Readonly<{ id: string; version: string }>;
  readonly cssDimensions: Readonly<{
    canvasWidthPx: number;
    contentWidthPx: number;
    paddingPx: number;
  }>;
}

export interface HtmlArtifactMetadata extends ArtifactMetadataBase {
  readonly format: "html";
  readonly mimeType: "text/html; charset=utf-8";
  readonly profile: "azeforge.html.self-contained/v1";
}

export interface SvgArtifactMetadata extends ArtifactMetadataBase {
  readonly format: "svg";
  readonly mimeType: "image/svg+xml";
  readonly profile: "azeforge.svg.foreign-object/v1";
  readonly pixelDimensions: Readonly<{ width: number; height: number }>;
  readonly requiredCapabilities: readonly ["svg2", "xhtml-foreign-object"];
}

export interface PngArtifactMetadata extends ArtifactMetadataBase {
  readonly format: "png";
  readonly mimeType: "image/png";
  readonly profile: "azeforge.png.continuous/v1";
  readonly pixelDimensions: Readonly<{ width: number; height: number }>;
  readonly requiredCapabilities: readonly ["png-continuous", "srgb"];
}

export interface PdfArtifactMetadata extends ArtifactMetadataBase {
  readonly format: "pdf";
  readonly mimeType: "application/pdf";
  readonly profile: "azeforge.pdf.paged/v1";
  readonly pageCount: number;
  readonly pageGeometry: Readonly<{
    widthPt: number;
    heightPt: number;
    marginPt: number;
  }>;
  readonly requiredCapabilities: readonly ["pdf-paged"];
}

export type ArtifactMetadata =
  | HtmlArtifactMetadata
  | SvgArtifactMetadata
  | PngArtifactMetadata
  | PdfArtifactMetadata;

export interface Artifact {
  readonly bytes: Uint8Array;
  readonly metadata: ArtifactMetadata;
}

export interface CompileOptions extends ParseOptions {
  readonly format: "html" | "svg" | "png" | "pdf";
  readonly theme?: string;
  readonly allowRawLatex?: boolean;
  readonly projectRoot?: string;
  readonly signal?: AbortSignal;
}

export interface CompileResult {
  readonly diagnostics: readonly Diagnostic[];
  readonly document?: AzeDocument;
  readonly contentHash?: ContentHash;
  readonly artifact?: Artifact;
}

export interface DiagnosticLimitOptions {
  readonly perBlock?: number;
  readonly perDocument?: number;
}

export interface PluginDescriptor {
  readonly type: string;
  readonly version: string;
  readonly title: string;
  readonly summary: string;
  readonly diagnosticNamespace: string;
  readonly sourceSchema: JsonValue;
  readonly bodySyntax: Readonly<{ id: string; version: string }>;
  readonly dataSchema: JsonValue;
}

export interface BlockRendererDescriptor {
  readonly id: string;
  readonly version: string;
  readonly blockType: string;
  readonly pluginVersionRange: string;
  readonly rendererId: string;
  readonly rendererVersionRange: string;
}

export interface RendererDescriptor {
  readonly id: string;
  readonly version: string;
  readonly formats: readonly ArtifactFormat[];
  readonly capabilities: readonly ("browser" | "filesystem" | "subprocess")[];
}

export interface AzeBlockPlugin {
  readonly descriptor: PluginDescriptor;
}

export interface EquationBlockRenderer {
  readonly descriptor: BlockRendererDescriptor;
  readonly render: (
    block: EquationBlock,
    context: Readonly<{ sourceName?: string }>,
  ) => string | Promise<string>;
}

export interface TexRenderer {
  readonly render: (input: Readonly<{
    readonly profile: TexBlock["profile"];
    readonly title: string;
    readonly description: string;
    readonly body: string;
  }>) => string | Promise<string>;
}
export interface MermaidBlockRenderer {
  readonly descriptor: BlockRendererDescriptor;
  readonly render: (
    block: MermaidBlock,
    context: Readonly<{
      sourceName?: string;
      ordinal?: number;
      theme?: Theme;
    }>,
  ) => string | Promise<string>;
}


export interface BlockRendererContext {
  readonly sourceName?: string;
  readonly renderBlocks: (blocks: readonly AzeBlock[]) => string;
  /**
   * This Block's zero-based position among Blocks of its own kind in document
   * order, so a renderer can mint deterministic per-kind element ids without
   * reaching outside its own Block.
   */
  readonly ordinal?: number;
}
export interface DiagramBlockRenderer {
  readonly descriptor: BlockRendererDescriptor;
  readonly render: (
    block: DiagramBlock,
    context: Readonly<{
      sourceName?: string;
      ordinal?: number;
      theme?: Theme;
    }>,
  ) => string | Promise<string>;
}

export interface AzeBlockRenderer<TBlock extends object = AzeBlock> {
  readonly descriptor: BlockRendererDescriptor;
  readonly render: (
    block: TBlock,
    context: BlockRendererContext,
  ) => string | Promise<string>;
}

/**
 * A Block renderer whose figure needs the Document-wide per-kind ordinal and
 * the resolved Theme, i.e. families that emit positional ids. The engineering
 * family's two directives both receive the ordinal assigned by the fragment
 * preflight.
 */
export interface FigureBlockRenderer<TBlock extends object> {
  readonly descriptor: BlockRendererDescriptor;
  readonly render: (
    block: TBlock,
    context: Readonly<{
      sourceName?: string;
      ordinal?: number;
      theme?: Theme;
    }>,
  ) => string | Promise<string>;
}

export type AnyBlockRenderer =
  | AzeBlockRenderer<AzeBlock>
  | AzeBlockRenderer<EquationBlock>
  | AzeBlockRenderer<DerivationBlock>
  | AzeBlockRenderer<CalloutBlock>
  | AzeBlockRenderer<TableBlock>
  | AzeBlockRenderer<PlotBlock>
  | AzeBlockRenderer<ChartBlock>
  | AzeBlockRenderer<GeometryBlock>
  | AzeBlockRenderer<FormulaBlock>
  | AzeBlockRenderer<ReactionBlock>
  | AzeBlockRenderer<StructureBlock>
  | AzeBlockRenderer<CircuitBlock>
  | AzeBlockRenderer<TimingBlock>
  | AzeBlockRenderer<SequenceBlock>
  | AzeBlockRenderer<StateBlock>
  | AzeBlockRenderer<EntityBlock>
  | AzeBlockRenderer<ClassBlock>
  | AzeBlockRenderer<AlgorithmBlock>
  | AzeBlockRenderer<StatementBlock>
  | AzeBlockRenderer<ExampleBlock>
  | AzeBlockRenderer<FigureBlock>
  | AzeBlockRenderer<BibliographyBlock>
  | DiagramBlockRenderer
  | FigureBlockRenderer<ControlBlock>
  | FigureBlockRenderer<FreeBodyBlock>
  | MermaidBlockRenderer;
export type BlockRenderer = AnyBlockRenderer;
export interface CompilerPolicy {
  readonly disabledBlockRendererIds?: readonly string[];
  readonly disabledRendererIds?: readonly string[];
  readonly disabledThemeIds?: readonly string[];
}

export interface CompilerOptions {
  readonly themes?: readonly Theme[];
  readonly defaultTheme?: string;
  readonly diagnosticLimits?: DiagnosticLimitOptions;
  readonly plugins?: readonly AzeBlockPlugin[];
  readonly blockRenderers?: readonly AnyBlockRenderer[];
  readonly renderers?: readonly RendererDescriptor[];
  readonly policy?: CompilerPolicy;
  readonly renderTimeoutMs?: number;
  readonly texRenderer?: TexRenderer;
}

export interface Compiler {
  parse(source: string, options?: ParseOptions): ParseResult;
  validate(parsed: ParseResult): ValidationResult;
  format(source: string, options?: FormatOptions): FormatResult;
  compile(source: string, options: CompileOptions): Promise<CompileResult>;
}
