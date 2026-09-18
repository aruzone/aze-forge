import type { EmbeddedFontFace } from "./font.js";
import type { Artifact, AssetManifestEntry, AzeBlock, AzeDocument, AlgorithmBlock, BibliographyBlock, BlockRendererContext, CalloutBlock, ChartBlock, ExampleBlock, GeometryBlock, FormulaBlock, ReactionBlock, StatementBlock, StructureBlock, ContentHash, DerivationBlock, EquationBlock, JsonValue, TableBlock, PlotBlock, MermaidBlock, TexBlock, Theme, CircuitBlock, DiagramBlock, TimingBlock, Sha256Hash } from "./model.js";
export declare const HTML_MIME_TYPE = "text/html; charset=utf-8";
export declare const HTML_PROFILE = "azeforge.html.self-contained/v1";
export declare const HTML_SERIALIZER: "azeforge-html/v2";
export declare const HTML_MAX_BYTES: number;
export declare class ArtifactLimitError extends Error {
    readonly byteLength: number;
    constructor(byteLength: number);
}
export interface HtmlPluginRenderers {
    readonly renderCallout?: (block: CalloutBlock, context: BlockRendererContext) => string;
    readonly renderTable?: (block: TableBlock, context: BlockRendererContext) => string;
    readonly renderPlot?: (block: PlotBlock, context: BlockRendererContext) => string;
    readonly renderChart?: (block: ChartBlock, context: BlockRendererContext) => string;
    readonly renderGeometry?: (block: GeometryBlock, context: BlockRendererContext) => string;
    readonly renderFormula?: (block: FormulaBlock, context: BlockRendererContext) => string;
    readonly renderReaction?: (block: ReactionBlock, context: BlockRendererContext) => string;
    readonly renderStructure?: (block: StructureBlock, context: BlockRendererContext) => string;
    readonly renderCircuit?: (block: CircuitBlock, context: BlockRendererContext) => string;
    readonly renderTiming?: (block: TimingBlock, context: BlockRendererContext) => string;
    readonly renderAlgorithm?: (block: AlgorithmBlock, context: BlockRendererContext) => string;
    readonly renderStatement?: (block: StatementBlock, context: BlockRendererContext) => string;
    readonly renderExample?: (block: ExampleBlock, context: BlockRendererContext) => string;
    readonly renderBibliography?: (block: BibliographyBlock, context: BlockRendererContext) => string;
    readonly modelsFragments?: ReadonlyMap<AzeBlock, string>;
}
export declare function documentTitle(document: AzeDocument): string;
export interface HtmlLayout {
    readonly title: string;
    readonly description: string;
    readonly css: string;
    readonly body: string;
    readonly fingerprintDependencies: JsonValue;
}
export declare function createHtmlLayout(document: AzeDocument, theme: Theme, fontFaces: readonly EmbeddedFontFace[], equationFragments?: ReadonlyMap<EquationBlock, string>, equationDependencyClosure?: JsonValue, derivationFragments?: ReadonlyMap<DerivationBlock, string>, mermaidFragments?: ReadonlyMap<MermaidBlock, string>, mermaidDependencyClosure?: JsonValue, diagramFragments?: ReadonlyMap<DiagramBlock, string>, diagramDependencyClosure?: JsonValue, modelsFragments?: ReadonlyMap<AzeBlock, string>, engineeringFragments?: ReadonlyMap<AzeBlock, string>, controlDependencyClosureValue?: JsonValue, freeBodyDependencyClosureValue?: JsonValue, pluginRenderers?: HtmlPluginRenderers, texFragments?: ReadonlyMap<TexBlock, string>, texRendererIdentity?: Sha256Hash): HtmlLayout;
export declare function renderHtml(document: AzeDocument, contentHash: ContentHash, theme: Theme, fontFaces: readonly EmbeddedFontFace[], equationFragments?: ReadonlyMap<EquationBlock, string>, equationDependencyClosure?: JsonValue, derivationFragments?: ReadonlyMap<DerivationBlock, string>, mermaidFragments?: ReadonlyMap<MermaidBlock, string>, mermaidDependencyClosure?: JsonValue, diagramFragments?: ReadonlyMap<DiagramBlock, string>, diagramDependencyClosure?: JsonValue, modelsFragments?: ReadonlyMap<AzeBlock, string>, engineeringFragments?: ReadonlyMap<AzeBlock, string>, controlDependencyClosureValue?: JsonValue, freeBodyDependencyClosureValue?: JsonValue, pluginRenderers?: HtmlPluginRenderers, texFragments?: ReadonlyMap<TexBlock, string>, texRendererIdentity?: Sha256Hash, assetManifest?: readonly AssetManifestEntry[]): Promise<Artifact>;
