import { assetManifestHash } from "./assets.js";
import { renderCalloutFragment } from "./callout.js";
import { getKatexCss } from "./equation.js";
import { KATEX_VERSION } from "./equation-schemas.js";
import { MERMAID_VERSION } from "./mermaid-schemas.js";
import { plotDependencyClosure, renderChartFragment, renderPlotFragment } from "./plot.js";
import { geometryDependencyClosure, renderGeometryFragment } from "./geometry.js";
import {
  chemistryDependencyClosure,
  renderFormulaFragment,
  renderReactionFragment,
  renderStructureFragment,
} from "./chemistry.js";
import { renderCircuitFragment } from "./circuit-render.js";
import type { EmbeddedFontFace } from "./font.js";
import { renderTimingFragment, timingDependencyClosure } from "./timing-render.js";
import { diagramLabelTypography } from "./diagram-layout.js";
import {
  modelsDependencyClosure,
} from "./models-render.js";
import { modelsLabelTypography } from "./models-layout.js";
import { artifactBytesHash, canonicalJson, sha256 } from "./hash.js";
import { escapeHtml, renderInlineHtml } from "./html-fragment.js";
import { inlineTextValue } from "./markdown.js";
import type {
  Artifact,
  AssetManifestEntry,
  AzeBlock,
  AzeDocument,
  AlgorithmBlock,
  BibliographyBlock,
  BlockRendererContext,
  CalloutBlock,
  ChartBlock,
  ExampleBlock,
  FigureBlock,
  GeometryBlock,
  FormulaBlock,
  ReactionBlock,
  StatementBlock,
  StructureBlock,
  ContentHash,
  DerivationBlock,
  EquationBlock,
  JsonValue,
  TableBlock,
  PlotBlock,
  MermaidBlock,
  TexBlock,
  Theme,
  CircuitBlock,
  DiagramBlock,
  TimingBlock,
} from "./model.js";
import { renderTableFragment } from "./table.js";
import { renderAlgorithmFragment } from "./algorithm.js";
import { renderStatementFragment } from "./statement.js";
import { renderExampleFragment } from "./example.js";
import { renderBibliographyFragment } from "./bibliography.js";
import { DEFAULT_CITATION_STYLE, renderEndnotesSection } from "./composition.js";
import { renderFigureFragment } from "./figure.js";

export const HTML_MIME_TYPE = "text/html; charset=utf-8";
export const HTML_PROFILE = "azeforge.html.self-contained/v1";
export const HTML_SERIALIZER = "azeforge-html/v2" as const;
export const HTML_MAX_BYTES = 64 * 1024 * 1024;

export class ArtifactLimitError extends Error {
  readonly byteLength: number;

  constructor(byteLength: number) {
    super(`HTML Artifact is ${byteLength} bytes; the limit is ${HTML_MAX_BYTES} bytes.`);
    this.name = "ArtifactLimitError";
    this.byteLength = byteLength;
  }
}

export interface HtmlPluginRenderers {
  readonly renderCallout?: (
    block: CalloutBlock,
    context: BlockRendererContext,
  ) => string;
  readonly renderTable?: (
    block: TableBlock,
    context: BlockRendererContext,
  ) => string;
  readonly renderPlot?: (
    block: PlotBlock,
    context: BlockRendererContext,
  ) => string;
  readonly renderChart?: (
    block: ChartBlock,
    context: BlockRendererContext,
  ) => string;
  readonly renderGeometry?: (
    block: GeometryBlock,
    context: BlockRendererContext,
  ) => string;
  readonly renderFormula?: (
    block: FormulaBlock,
    context: BlockRendererContext,
  ) => string;
  readonly renderReaction?: (
    block: ReactionBlock,
    context: BlockRendererContext,
  ) => string;
  readonly renderStructure?: (
    block: StructureBlock,
    context: BlockRendererContext,
  ) => string;
  readonly renderCircuit?: (
    block: CircuitBlock,
    context: BlockRendererContext,
  ) => string;
  readonly renderTiming?: (
    block: TimingBlock,
    context: BlockRendererContext,
  ) => string;
  readonly renderAlgorithm?: (
    block: AlgorithmBlock,
    context: BlockRendererContext,
  ) => string;
  readonly renderStatement?: (
    block: StatementBlock,
    context: BlockRendererContext,
  ) => string;
  readonly renderExample?: (
    block: ExampleBlock,
    context: BlockRendererContext,
  ) => string;
  readonly renderBibliography?: (
    block: BibliographyBlock,
    context: BlockRendererContext,
  ) => string;
  readonly modelsFragments?: ReadonlyMap<AzeBlock, string>;
}

interface RenderContext {
  readonly sourceName?: string;
  readonly equationFragments: ReadonlyMap<EquationBlock, string>;
  readonly derivationFragments: ReadonlyMap<DerivationBlock, string>;
  readonly mermaidFragments: ReadonlyMap<MermaidBlock, string>;
  readonly texFragments: ReadonlyMap<TexBlock, string>;
  readonly diagramFragments: ReadonlyMap<DiagramBlock, string>;
  readonly renderCallout: (
    block: CalloutBlock,
    context: BlockRendererContext,
  ) => string;
  readonly renderTable: (
    block: TableBlock,
    context: BlockRendererContext,
  ) => string;
  readonly renderPlot: (
    block: PlotBlock,
    context: BlockRendererContext,
  ) => string;
  readonly renderChart: (
    block: ChartBlock,
    context: BlockRendererContext,
  ) => string;
  readonly renderGeometry: (
    block: GeometryBlock,
    context: BlockRendererContext,
  ) => string;
  readonly renderFormula: (
    block: FormulaBlock,
    context: BlockRendererContext,
  ) => string;
  readonly renderReaction: (
    block: ReactionBlock,
    context: BlockRendererContext,
  ) => string;
  readonly renderStructure: (
    block: StructureBlock,
    context: BlockRendererContext,
  ) => string;
  readonly renderCircuit: (
    block: CircuitBlock,
    context: BlockRendererContext,
  ) => string;
  readonly renderTiming: (
    block: TimingBlock,
    context: BlockRendererContext,
  ) => string;
  readonly modelsFragments: ReadonlyMap<AzeBlock, string>;
  readonly engineeringFragments: ReadonlyMap<AzeBlock, string>;
  /** Per-kind document-order counters, so each Block learns its own ordinal. */
  readonly kindOrdinals: Map<string, number>;
  readonly renderFigure: (
    block: FigureBlock,
    context: BlockRendererContext,
  ) => string;
  readonly renderAlgorithm: (
    block: AlgorithmBlock,
    context: BlockRendererContext,
  ) => string;
  readonly renderStatement: (
    block: StatementBlock,
    context: BlockRendererContext,
  ) => string;
  readonly renderExample: (
    block: ExampleBlock,
    context: BlockRendererContext,
  ) => string;
  readonly renderBibliography: (
    block: BibliographyBlock,
    context: BlockRendererContext,
  ) => string;
  /** This Block's zero-based ordinal among Blocks of its own kind. */
  readonly ordinal: number;
}

export function documentTitle(document: AzeDocument): string {
  const metadataTitle = document.metadata.title?.trim();
  if (metadataTitle !== undefined && metadataTitle !== "") return metadataTitle;
  const firstHeading = document.blocks.find((block) => block.kind === "heading");
  if (firstHeading?.kind !== "heading") return "AzeForge document";
  const text = inlineTextValue(firstHeading.children).trim();
  return text === "" ? "AzeForge document" : text;
}


/**
 * Document composition owns anchors (contract: issue #67 §10): every Block
 * with an authored `id` receives exactly one anchor element, so a reference,
 * citation or footnote marker always has a target to point at regardless of
 * which family owns the Block's opaque Fragment.
 */
function anchorAttribute(block: AzeBlock): string {
  if (!("id" in block)) return "";
  const id = block.id;
  if (typeof id !== "string" || id.length === 0) return "";
  return `<span class="aze-anchor" id="${escapeHtml(id)}"></span>`;
}

function renderBlock(block: AzeBlock, context: RenderContext): string {
  const ordinal = context.kindOrdinals.get(block.kind) ?? 0;
  context.kindOrdinals.set(block.kind, ordinal + 1);
  return `${anchorAttribute(block)}${renderBlockBody(block, {
    ...context,
    ordinal,
  })}`;
}

function renderBlockBody(block: AzeBlock, context: RenderContext): string {
  const ordinal = context.ordinal;
  switch (block.kind) {
    case "equation":
      return (
        context.equationFragments.get(block) ?? '<figure class="aze-equation"></figure>'
      );
    case "derivation":
      return (
        context.derivationFragments.get(block) ??
        '<figure class="aze-derivation"></figure>'
      );
    case "mermaid":
      return (
        context.mermaidFragments.get(block) ??
        '<figure class="aze-mermaid"></figure>'
      );
    case "tex":
      return context.texFragments.get(block) ?? '<figure class="aze-tex"></figure>';
    case "diagram":
      return (
        context.diagramFragments.get(block) ??
        '<figure class="aze-diagram"></figure>'
      );
    case "heading":
      return `<h${block.level}>${renderInlineHtml(block.children)}</h${block.level}>`;
    case "paragraph":
      return `<p>${renderInlineHtml(block.children)}</p>`;
    case "thematicBreak":
      return "<hr>";
    case "blockquote":
      return `<blockquote>${renderBlocks(block.children as readonly AzeBlock[], context)}</blockquote>`;
    case "list": {
      const tag = block.ordered ? "ol" : "ul";
      const start =
        block.ordered && block.start !== undefined ? ` start="${block.start}"` : "";
      const items = block.items
        .map((item) => `<li>${renderBlocks(item.blocks as readonly AzeBlock[], context)}</li>`)
        .join("");
      return `<${tag}${start}>${items}</${tag}>`;
    }
    case "code": {
      const language =
        block.language === undefined ? "" : ` class="language-${escapeHtml(block.language)}"`;
      return `<pre><code${language}>${escapeHtml(block.value)}</code></pre>`;
    }
    case "figure":
      return context.renderFigure(block, {
        ...(context.sourceName === undefined ? {} : { sourceName: context.sourceName }),
        renderBlocks: (children) => renderBlocks(children, context),
      });
    case "algorithm":
      return context.renderAlgorithm(block, {
        ...(context.sourceName === undefined ? {} : { sourceName: context.sourceName }),
        renderBlocks: (children) => renderBlocks(children, context),
      });
    case "statement":
      return context.renderStatement(block, {
        ...(context.sourceName === undefined ? {} : { sourceName: context.sourceName }),
        renderBlocks: (children) => renderBlocks(children, context),
      });
    case "example":
      return context.renderExample(block, {
        ...(context.sourceName === undefined ? {} : { sourceName: context.sourceName }),
        renderBlocks: (children) => renderBlocks(children, context),
      });
    case "bibliography":
      return context.renderBibliography(block, {
        ...(context.sourceName === undefined ? {} : { sourceName: context.sourceName }),
        renderBlocks: (children) => renderBlocks(children, context),
      });
    case "footnoteDefinition":
      // Definitions render once, in the document-end endnotes section.
      return "";
    case "table":
      return context.renderTable(block, {
        ...(context.sourceName === undefined ? {} : { sourceName: context.sourceName }),
        renderBlocks: (children) => renderBlocks(children, context),
        ordinal,
      });
    case "callout":
      return context.renderCallout(block, {
        ...(context.sourceName === undefined ? {} : { sourceName: context.sourceName }),
        renderBlocks: (children) => renderBlocks(children, context),
        ordinal,
      });
    case "plot":
      return context.renderPlot(block, {
        ...(context.sourceName === undefined ? {} : { sourceName: context.sourceName }),
        renderBlocks: (children) => renderBlocks(children, context),
      });
    case "chart":
      return context.renderChart(block, {
        ...(context.sourceName === undefined ? {} : { sourceName: context.sourceName }),
        renderBlocks: (children) => renderBlocks(children, context),
      });
    case "geometry":
      return context.renderGeometry(block, {
        ...(context.sourceName === undefined ? {} : { sourceName: context.sourceName }),
        renderBlocks: (children) => renderBlocks(children, context),
      });
    case "formula":
      return context.renderFormula(block, {
        ...(context.sourceName === undefined ? {} : { sourceName: context.sourceName }),
        renderBlocks: (children) => renderBlocks(children, context),
      });
    case "reaction":
      return context.renderReaction(block, {
        ...(context.sourceName === undefined ? {} : { sourceName: context.sourceName }),
        renderBlocks: (children) => renderBlocks(children, context),
      });
    case "circuit":
      return context.renderCircuit(block, {
        ...(context.sourceName === undefined ? {} : { sourceName: context.sourceName }),
        renderBlocks: (children) => renderBlocks(children, context),
      });
    case "timing":
      return context.renderTiming(block, {
        ...(context.sourceName === undefined ? {} : { sourceName: context.sourceName }),
        renderBlocks: (children) => renderBlocks(children, context),
      });
    case "sequence":
    case "state":
    case "entity":
    case "class":
      return context.modelsFragments.get(block) ?? `<figure class="aze-${block.kind}"></figure>`;
    case "control":
    case "free-body":
      return context.engineeringFragments.get(block) ?? `<figure class="aze-${block.kind}"></figure>`;
    case "structure":
      return context.renderStructure(block, {
        ...(context.sourceName === undefined ? {} : { sourceName: context.sourceName }),
        renderBlocks: (children) => renderBlocks(children, context),
      });
  }
}

function renderBlocks(blocks: readonly AzeBlock[], context: RenderContext): string {
  return blocks.map((block) => renderBlock(block, context)).join("");
}

function embeddedFontCss(fontFaces: readonly EmbeddedFontFace[]): string {
  return fontFaces
    .map((font) => {
      const family = font.family.includes(" ") ? `"${font.family}"` : font.family;
      return `@font-face{font-family:${family};font-style:normal;font-weight:${font.weight};font-display:block;src:url(data:font/woff2;base64,${font.data}) format("woff2");unicode-range:${font.unicodeRange}}`;
    })
    .join("");
}

/**
 * General-diagram CSS. The three label typography sets are the same Theme
 * tokens the Advance metric measures with, so a Theme change re-lays-out the
 * figure rather than rescaling it. Group depth is distinguished by stroke
 * pattern and fill opacity together, never by colour alone.
 */
function diagramCss(theme: Theme): string {
  const tokens = theme.diagram;
  const typography = diagramLabelTypography(theme);
  const label = `font-family:"${tokens.labelFontFamily}";fill:currentColor`;
  const depth = (level: number, dash: string): string => {
    const opacity = 1 - tokens.groupDepthOpacityStep * level;
    return `.aze-diagram-group-depth-${level}{stroke-dasharray:${dash};fill-opacity:${opacity.toFixed(3)}}`;
  };
  return [
    ".aze-diagram{margin:1em 0}",
    ".aze-diagram svg{display:block;max-width:100%;height:auto;margin:0 auto}",
    `.aze-diagram-node-shape{fill:${tokens.nodeFill};stroke:${tokens.nodeStroke};stroke-width:${tokens.nodeStrokeWidthPx}px;stroke-linejoin:round}`,
    `.aze-diagram-group{fill:${tokens.groupFill};stroke:${tokens.groupStroke};stroke-width:${tokens.groupStrokeWidthPx}px;stroke-linejoin:round}`,
    depth(1, "6 3"),
    depth(2, "2 3"),
    depth(3, "6 2 2 2"),
    `.aze-diagram-port{fill:${tokens.portFill};stroke:${tokens.portStroke};stroke-width:${tokens.portStrokeWidthPx}px}`,
    `.aze-diagram-edge{fill:none;stroke:${tokens.edgeStroke};stroke-width:${tokens.edgeStrokeWidthPx}px;stroke-linejoin:round}`,
    `.aze-diagram-arrow{fill:${tokens.arrowFill};stroke:none}`,
    `.aze-diagram-edge-label-background{fill:${tokens.edgeLabelBackground}}`,
    `.aze-diagram-label{${label}}`,
    `.aze-diagram-node-label{font-size:${typography.nodeFontSizePx}px;text-anchor:middle;dominant-baseline:central}`,
    `.aze-diagram-group-label{font-size:${typography.groupFontSizePx}px;text-anchor:start;dominant-baseline:hanging}`,
    `.aze-diagram-edge-label{font-size:${typography.edgeFontSizePx}px;text-anchor:middle;dominant-baseline:middle}`,
  ].join("");
}

/**
 * Software- and data-model CSS. Every size, line height and dash pattern
 * comes from the same `modelsLabelTypography(theme)` and the same `models`
 * tokens the layout measured with, so a Theme change re-lays-out a figure and
 * repaints it in lockstep. Distinctions never rest on colour alone: messages
 * differ by arrowhead and dash, interfaces by a dashed header, abstract
 * classes by italic names, static members by an underline, and aggregation by
 * a hollow diamond.
 */
/**
 * Engineering-diagram CSS. The figures carry their own geometry and their own
 * token-driven stroke and fill inline, because control measures through the
 * Advance metric and free-body resolves an authored frame; what the document
 * must still supply is the ink for control's label text and the block-level
 * sizing both figures share. `fill:currentColor` mirrors the diagram and model
 * families, so a label is legible under every Theme without a colour token.
 */
function engineeringCss(theme: Theme): string {
  const tokens = theme.control;
  return [
    ".aze-control,.aze-free-body{margin:1em 0}",
    ".aze-control svg,.aze-free-body svg{display:block;max-width:100%;height:auto;margin:0 auto}",
    `.aze-control-label{font-family:"${tokens.labelFontFamily}";fill:currentColor}`,
  ].join("");
}

function modelsCss(theme: Theme): string {
  const tokens = theme.models;
  const typography = modelsLabelTypography(theme);
  const label = `font-family:"${tokens.labelFontFamily}";fill:currentColor`;
  const stroke = `fill:none;stroke:${tokens.messageStroke};stroke-width:${tokens.messageStrokeWidthPx}px`;
  const marker = `fill:none;stroke:${tokens.messageStroke};stroke-width:${tokens.messageStrokeWidthPx}px`;
  return [
    ".aze-sequence,.aze-state,.aze-entity,.aze-class{margin:1em 0}",
    ".aze-sequence svg,.aze-state svg,.aze-entity svg,.aze-class svg{display:block;max-width:100%;height:auto;margin:0 auto}",
    `.aze-models-label{${label};font-size:${typography.labelFontSizePx}px;dominant-baseline:middle}`,
    `.aze-models-member{font-size:${typography.memberFontSizePx}px}`,
    `.aze-models-caption{font-size:${typography.captionFontSizePx}px}`,
    `.aze-models-marker{font-size:${typography.markerFontSizePx}px}`,
    `.aze-models-box{fill:${tokens.boxFill};stroke:${tokens.boxStroke};stroke-width:${tokens.boxStrokeWidthPx}px;stroke-linejoin:round}`,
    `.aze-models-header{fill:${tokens.headerFill};stroke:${tokens.boxStroke};stroke-width:${tokens.boxStrokeWidthPx}px;stroke-linejoin:round}`,
    `.aze-models-divider{stroke:${tokens.dividerStroke};stroke-width:${tokens.dividerStrokeWidthPx}px}`,
    `.aze-models-header,.aze-state-shape,.aze-entity-box,.aze-class-box{rx:${tokens.boxCornerRadiusPx}px}`,
    `.aze-sequence-participant{rx:0}`,
    `.aze-sequence-actor{fill:none;stroke:${tokens.boxStroke};stroke-width:${tokens.boxStrokeWidthPx}px;stroke-linejoin:round}`,
    `.aze-sequence-actor-head{fill:${tokens.boxFill}}`,
    `.aze-sequence-lifeline{fill:none;stroke:${tokens.lifelineStroke};stroke-width:${tokens.lifelineStrokeWidthPx}px;stroke-dasharray:${tokens.lifelineDash}}`,
    `.aze-sequence-activation{fill:${tokens.activationFill};stroke:${tokens.activationStroke};stroke-width:${tokens.boxStrokeWidthPx}px}`,
    `.aze-sequence-message{${stroke}}`,
    `.aze-sequence-message-return{stroke-dasharray:6 4}`,
    `.aze-sequence-self-message{stroke-linejoin:round}`,
    `.aze-sequence-arrow{fill:${tokens.arrowFill};stroke:none}`,
    `.aze-sequence-arrow-async{fill:none;stroke:${tokens.messageStroke};stroke-width:${tokens.messageStrokeWidthPx}px}`,
    `.aze-sequence-note{fill:${tokens.noteFill};stroke:${tokens.noteStroke};stroke-width:${tokens.boxStrokeWidthPx}px;stroke-linejoin:round;rx:${tokens.boxCornerRadiusPx}px}`,
    `.aze-sequence-fragment{fill:none;stroke:${tokens.fragmentStroke};stroke-width:${tokens.fragmentStrokeWidthPx}px;stroke-dasharray:${tokens.fragmentDash}}`,
    `.aze-sequence-fragment-tab{fill:${tokens.fragmentLabelFill};stroke:${tokens.fragmentStroke};stroke-width:${tokens.fragmentStrokeWidthPx}px}`,
    `.aze-sequence-fragment-division{stroke:${tokens.fragmentStroke};stroke-width:${tokens.fragmentStrokeWidthPx}px;stroke-dasharray:${tokens.fragmentDash}}`,
    `.aze-state-shape{fill:${tokens.boxFill};stroke:${tokens.boxStroke};stroke-width:${tokens.boxStrokeWidthPx}px;stroke-linejoin:round}`,
    `.aze-state-composite-title{fill:${tokens.headerFill};stroke:${tokens.boxStroke};stroke-width:${tokens.boxStrokeWidthPx}px;stroke-linejoin:round}`,
    `.aze-state-divider{stroke:${tokens.dividerStroke};stroke-width:${tokens.dividerStrokeWidthPx}px}`,
    `.aze-state-transition{${stroke}}`,
    `.aze-state-arrow{fill:${tokens.arrowFill};stroke:none}`,
    `.aze-state-initial{fill:${tokens.markerInk};stroke:${tokens.markerInk};stroke-width:${tokens.boxStrokeWidthPx}px}`,
    `.aze-state-final{fill:none;stroke:${tokens.markerInk};stroke-width:${tokens.boxStrokeWidthPx}px}`,
    `.aze-state-final-inner{fill:${tokens.markerInk};stroke:none}`,
    `.aze-entity-box{fill:${tokens.boxFill};stroke:${tokens.boxStroke};stroke-width:${tokens.boxStrokeWidthPx}px;stroke-linejoin:round}`,
    `.aze-entity-header{fill:${tokens.headerFill};stroke:${tokens.boxStroke};stroke-width:${tokens.boxStrokeWidthPx}px;stroke-linejoin:round}`,
    `.aze-entity-divider{stroke:${tokens.dividerStroke};stroke-width:${tokens.dividerStrokeWidthPx}px}`,
    `.aze-entity-relationship{${stroke}}`,
    `.aze-entity-diamond{${marker}}`,
    `.aze-entity-attribute{fill:currentColor}`,
    `.aze-entity-optional{font-style:italic}`,
    `.aze-entity-key{fill:${tokens.markerInk};font-weight:700}`,
    `.aze-entity-cardinality{fill:${tokens.markerInk}}`,
    `.aze-entity-role{fill:${tokens.markerInk}}`,
    `.aze-entity-relationship-label{fill:currentColor}`,
    `.aze-class-box{fill:${tokens.boxFill};stroke:${tokens.boxStroke};stroke-width:${tokens.boxStrokeWidthPx}px;stroke-linejoin:round}`,
    `.aze-class-header{fill:${tokens.headerFill};stroke:${tokens.boxStroke};stroke-width:${tokens.boxStrokeWidthPx}px;stroke-linejoin:round}`,
    `.aze-class-header-interface{fill:${tokens.boxFill};stroke-dasharray:5 3}`,
    `.aze-class-divider{stroke:${tokens.dividerStroke};stroke-width:${tokens.dividerStrokeWidthPx}px}`,
    `.aze-class-marker{fill:${tokens.markerInk};font-weight:600}`,
    `.aze-class-member{fill:currentColor}`,
    `.aze-class-visibility{fill:${tokens.markerInk}}`,
    `.aze-class-static{text-decoration:underline}`,
    `.aze-class-abstract{font-style:italic}`,
    `.aze-class-stereotype{fill:${tokens.markerInk}}`,
    `.aze-class-relationship{${stroke}}`,
    `.aze-class-relationship-implementation{stroke-dasharray:6 4}`,
    `.aze-class-arrow{fill:${tokens.arrowFill};stroke:none}`,
    `.aze-class-arrow-hollow{fill:${tokens.boxFill};stroke:${tokens.messageStroke};stroke-width:${tokens.messageStrokeWidthPx}px}`,
    `.aze-class-diamond{${marker}}`,
    `.aze-class-diamond-filled{fill:${tokens.markerInk}}`,
    `.aze-class-diamond-hollow{fill:${tokens.boxFill}}`,
    `.aze-class-multiplicity{fill:${tokens.markerInk}}`,
    `.aze-class-relationship-label{fill:currentColor}`,
    `.aze-cardinality-label,.aze-role-label,.aze-multiplicity-label{fill:${tokens.markerInk}}`,
  ].join("");
}

/**
 * Composition and structured-content CSS. Anchors, numbering labels, the
 * figure wrapper, endnotes and the references list keep their full meaning in
 * every Artifact format; print attachment rules live in the PDF page CSS.
 */
function compositionCss(): string {
  return [
    ".aze-anchor{display:inline-block;width:0;height:0;overflow:hidden}",
    ".aze-number{font-weight:600;margin-right:.35em}",
    ".aze-figure{margin:1em 0}",
    ".aze-figure>figcaption{font-style:italic;margin-bottom:.35em}",
    ".aze-algorithm{margin:1em 0}",
    ".aze-algorithm>figcaption{font-style:italic;margin-bottom:.35em}",
    ".aze-algorithm .aze-algorithm-procedure{font-weight:600}",
    ".aze-algorithm ol{list-style:decimal;padding-left:1.6em;margin:.35em 0}",
    ".aze-algorithm li{margin:.15em 0}",
    ".aze-algorithm .aze-algorithm-keyword{font-weight:600;font-family:inherit}",
    ".aze-algorithm .aze-algorithm-expression{font-style:normal}",
    ".aze-statement{margin:1em 0}",
    ".aze-statement>figcaption{font-style:italic}",
    ".aze-statement .aze-statement-kind{font-weight:700}",
    ".aze-statement .aze-statement-proof{margin:.5em 0 .5em 1.5em}",
    ".aze-statement .aze-statement-qed{display:block;text-align:right;font-weight:600}",
    ".aze-example{margin:1em 0}",
    ".aze-example>figcaption{font-style:italic;margin-bottom:.35em}",
    ".aze-example .aze-example-label{font-weight:600}",
    ".aze-example .aze-example-step{margin:.5em 0 .5em 1.5em}",
    ".aze-bibliography{margin:1em 0}",
    ".aze-bibliography ol{padding-left:1.6em}",
    ".aze-bibliography li{margin:.2em 0}",
    ".aze-endnotes{margin:2em 0 0;border-top:1px solid currentColor;padding-top:.5em;font-size:.9em}",
    ".aze-endnotes ol{padding-left:1.6em}",
    ".aze-reference{text-decoration:inherit}",
    ".aze-citation-group{white-space:nowrap}",
    ".aze-footnote-ref{font-size:.75em;vertical-align:super}",
  ].join("");
}

function themeCss(theme: Theme): string {
  const { colors, geometry, typography } = theme;
  const colorScheme = theme.colorScheme;
  return `:root{color-scheme:${colorScheme};background:${colors.background};color:${colors.foreground};font-family:${typography.proseFontFamily};font-weight:${typography.bodyFontWeight};line-height:${typography.lineHeight};font-size:11pt}}*{box-sizing:border-box}body{margin:0;background:${colors.background}}main{max-width:${geometry.canvasWidthPx}px;margin:0 auto;padding:${geometry.paddingPx}px}article{max-width:${geometry.contentWidthPx}px;margin:0 auto}h1,h2,h3,h4,h5,h6{font-weight:${typography.headingFontWeight};line-height:${typography.headingLineHeight}}h1{font-size:20pt;margin:.9em 0 .45em}h2{font-size:16pt;margin:1em 0 .5em}h3{font-size:13pt;margin:1em 0 .5em}h4,h5,h6{font-size:11pt;margin:1.1em 0 .55em}p{margin:${typography.paragraphSpacingEm}em 0;color:${colors.foreground}}a{color:inherit}img{max-width:100%;height:auto}hr{border:none;border-top:1px solid ${colors.muted};margin:1.5em 0}blockquote{margin:1em 0;padding:0 0 0 1em;border-left:3px solid ${colors.muted}}ul,ol{margin:1em 0;padding-left:2em}li{margin:0.25em 0}li>p{margin:0.25em 0}pre{margin:1em 0;padding:1em;overflow-x:auto;background:rgba(127,127,127,.08)}pre code{font-family:"JetBrains Mono",Inter}code{font-family:"JetBrains Mono",Inter;font-size:.9em}table{border-collapse:collapse;margin:1em 0;width:100%}caption{caption-side:top;text-align:left;font-weight:${typography.headingFontWeight};padding:.5em 0}th,td{border:1px solid ${colors.muted};padding:.5em .75em;text-align:left}thead th{background:rgba(127,127,127,.08)}figure.aze-table{margin:1em 0}.aze-callout{margin:1em 0;padding:.75em 1em;border:1px solid ${colors.muted};border-left-width:4px}.aze-callout-title{margin:0 0 .5em;font-weight:${typography.headingFontWeight}}.aze-callout-body>:first-child{margin-top:0}.aze-callout-body>:last-child{margin-bottom:0}`;
}

export interface HtmlLayout {
  readonly title: string;
  readonly description: string;
  readonly css: string;
  readonly body: string;
  readonly fingerprintDependencies: JsonValue;
}

export function createHtmlLayout(
  document: AzeDocument,
  theme: Theme,
  fontFaces: readonly EmbeddedFontFace[],
  equationFragments: ReadonlyMap<EquationBlock, string> = new Map(),
  equationDependencyClosure: JsonValue = { katex: KATEX_VERSION },
  derivationFragments: ReadonlyMap<DerivationBlock, string> = new Map(),
  mermaidFragments: ReadonlyMap<MermaidBlock, string> = new Map(),
  mermaidDependencyClosure: JsonValue = { mermaid: MERMAID_VERSION },
  diagramFragments: ReadonlyMap<DiagramBlock, string> = new Map(),
  diagramDependencyClosure: JsonValue = {},
  modelsFragments: ReadonlyMap<AzeBlock, string> = new Map(),
  engineeringFragments: ReadonlyMap<AzeBlock, string> = new Map(),
  controlDependencyClosureValue: JsonValue = {},
  freeBodyDependencyClosureValue: JsonValue = {},
  pluginRenderers: HtmlPluginRenderers = {},
  texFragments: ReadonlyMap<TexBlock, string> = new Map(),
): HtmlLayout {
  const renderCallout =
    pluginRenderers.renderCallout ?? renderCalloutFragment;
  const renderTable =
    pluginRenderers.renderTable ??
    ((block: TableBlock, context: BlockRendererContext): string =>
      renderTableFragment(block, context));
  const renderPlot =
    pluginRenderers.renderPlot ?? ((block: PlotBlock, context: BlockRendererContext): string => renderPlotFragment(block, context));
  const renderChart =
    pluginRenderers.renderChart ?? ((block: ChartBlock, context: BlockRendererContext): string => renderChartFragment(block, context));
  const renderGeometry =
    pluginRenderers.renderGeometry ?? ((block: GeometryBlock, context: BlockRendererContext): string => renderGeometryFragment(block, context));
  const renderFormula =
    pluginRenderers.renderFormula ?? ((block: FormulaBlock, context: BlockRendererContext): string => renderFormulaFragment(block, context));
  const renderReaction =
    pluginRenderers.renderReaction ?? ((block: ReactionBlock, context: BlockRendererContext): string => renderReactionFragment(block, context));
  const renderStructure =
    pluginRenderers.renderStructure ?? ((block: StructureBlock, context: BlockRendererContext): string => renderStructureFragment(block, context));
  const renderCircuit =
    pluginRenderers.renderCircuit ?? ((block: CircuitBlock, context: BlockRendererContext): string => renderCircuitFragment(block, context));
  const renderTiming =
    pluginRenderers.renderTiming ?? ((block: TimingBlock, context: BlockRendererContext): string => renderTimingFragment(block, context));
  const renderAlgorithm =
    pluginRenderers.renderAlgorithm ?? ((block: AlgorithmBlock, context: BlockRendererContext): string => renderAlgorithmFragment(block, context));
  const renderStatement =
    pluginRenderers.renderStatement ?? ((block: StatementBlock, context: BlockRendererContext): string => renderStatementFragment(block, context));
  const renderExample =
    pluginRenderers.renderExample ?? ((block: ExampleBlock, context: BlockRendererContext): string => renderExampleFragment(block, context));
  // The works-cited list renders under the document's own citation style; the
  // block itself never carries one (contract: issue #67 §8).
  const citationStyle = document.composition?.citationStyle ?? DEFAULT_CITATION_STYLE;
  const renderBibliography =
    pluginRenderers.renderBibliography ??
    ((block: BibliographyBlock, context: BlockRendererContext): string =>
      renderBibliographyFragment(block, context, citationStyle));
  const context: RenderContext = {
    equationFragments,
    derivationFragments,
    mermaidFragments,
    texFragments,
    diagramFragments,
    renderCallout,
    renderPlot,
    renderChart,
    renderGeometry,
    renderFormula,
    renderReaction,
    renderStructure,
    renderCircuit,
    renderTiming,
    modelsFragments,
    engineeringFragments,
    kindOrdinals: new Map(),
    ordinal: 0,
    renderTable,
    renderFigure: renderFigureFragment,
    renderAlgorithm,
    renderStatement,
    renderExample,
    renderBibliography,
  };
  return {
    title: escapeHtml(documentTitle(document)),
    description: "AzeForge whole-Document Artifact",
    css: `${embeddedFontCss(fontFaces)}${themeCss(theme)}${diagramCss(theme)}${modelsCss(theme)}${engineeringCss(theme)}${compositionCss()}${getKatexCss()}.aze-equation{margin:1em 0;text-align:center}.aze-equation[data-align="left"]{text-align:left}.aze-equation[data-align="right"]{text-align:right}.aze-derivation{margin:1em 0}.aze-derivation ol{list-style:none;padding:0;margin:0}.aze-derivation li{display:block;text-align:center;margin:.35em 0}.aze-derivation[data-align="left"] li{text-align:left}.aze-derivation[data-align="right"] li{text-align:right}.aze-derivation .aze-derivation-annotation{display:block;font-style:italic;color:#666;font-size:.9em}.aze-mermaid{margin:1em 0}.aze-mermaid svg{display:block;max-width:100%;max-height:520px;width:auto;height:auto;margin:0 auto}.aze-plot{margin:1em 0}.aze-plot svg{display:block;max-width:100%;height:auto;margin:0 auto}.aze-chart{margin:1em 0}.aze-chart svg{display:block;max-width:100%;height:auto;margin:0 auto}.aze-geometry{margin:1em 0}.aze-geometry svg{display:block;max-width:100%;height:auto;margin:0 auto}.aze-circuit{margin:1em 0;color:inherit}.aze-circuit svg{display:block;max-width:100%;height:auto}.aze-timing{margin:1em 0;color:inherit}.aze-timing svg{display:block;max-width:100%;height:auto;margin:0 auto}.aze-formula{margin:1em 0;text-align:center}.aze-formula .aze-formula-expression{font-size:1.05em}.aze-reaction{margin:1em 0;text-align:center}.aze-reaction .aze-reaction-arrow{font-size:1.1em}.aze-reaction .aze-reaction-conditions{display:inline-block;font-size:.85em;font-style:italic;color:#666}.aze-structure{margin:1em 0}.aze-structure svg{display:block;max-width:100%;height:auto;margin:0 auto}`,
    body: `<main><article>${renderBlocks(document.blocks, context)}</article>${renderEndnotesSection(document)}</main>`,
    fingerprintDependencies: {
      theme: theme as unknown as JsonValue,
      fonts: fontFaces.map(({ name, weight, sourceHash }) => ({
        name,
        weight,
        sourceHash,
      })),
      equations: equationDependencyClosure,
      derivation: equationDependencyClosure,
      diagrams: {
        mermaid: mermaidDependencyClosure,
        native: diagramDependencyClosure,
      },
      ...(document.blocks.some((block) => block.kind === "plot" || block.kind === "chart")
        ? { plots: plotDependencyClosure() }
        : {}),
      ...(document.blocks.some((block) => block.kind === "geometry")
        ? { geometry: geometryDependencyClosure() }
        : {}),
      ...(document.blocks.some((block) => block.kind === "formula" || block.kind === "reaction" || block.kind === "structure")
        ? { chemistry: chemistryDependencyClosure() }
        : {}),
      ...(document.blocks.some((block) => block.kind === "timing")
        ? { timing: timingDependencyClosure() }
        : {}),
      ...(document.blocks.some((block) =>
        ["sequence", "state", "entity", "class"].includes(block.kind),
      )
        ? { models: modelsDependencyClosure() }
        : {}),
      prose: {
        serializer: "azeforge-prose/v1",
        callout: "1.0.0",
        table: "1.0.0",
        algorithm: "1.0.0",
        statement: "1.0.0",
        example: "1.0.0",
        figure: "1.0.0",
        bibliography: "1.0.0",
      },
      ...(document.blocks.some((block) => block.kind === "control" || block.kind === "free-body")
        ? {
            engineering: {
              control: controlDependencyClosureValue,
              freeBody: freeBodyDependencyClosureValue,
            },
          }
        : {}),
    },
  };
}

export async function renderHtml(
  document: AzeDocument,
  contentHash: ContentHash,
  theme: Theme,
  fontFaces: readonly EmbeddedFontFace[],
  equationFragments: ReadonlyMap<EquationBlock, string> = new Map(),
  equationDependencyClosure: JsonValue = { katex: KATEX_VERSION },
  derivationFragments: ReadonlyMap<DerivationBlock, string> = new Map(),
  mermaidFragments: ReadonlyMap<MermaidBlock, string> = new Map(),
  mermaidDependencyClosure: JsonValue = { mermaid: MERMAID_VERSION },
  diagramFragments: ReadonlyMap<DiagramBlock, string> = new Map(),
  diagramDependencyClosure: JsonValue = {},
  modelsFragments: ReadonlyMap<AzeBlock, string> = new Map(),
  engineeringFragments: ReadonlyMap<AzeBlock, string> = new Map(),
  controlDependencyClosureValue: JsonValue = {},
  freeBodyDependencyClosureValue: JsonValue = {},
  pluginRenderers: HtmlPluginRenderers = {},
  texFragments: ReadonlyMap<TexBlock, string> = new Map(),
  assetManifest: readonly AssetManifestEntry[] = [],
): Promise<Artifact> {
  const layout = createHtmlLayout(
    document,
    theme,
    fontFaces,
    equationFragments,
    equationDependencyClosure,
    derivationFragments,
    mermaidFragments,
    mermaidDependencyClosure,
    diagramFragments,
    diagramDependencyClosure,
    modelsFragments,
    engineeringFragments,
    controlDependencyClosureValue,
    freeBodyDependencyClosureValue,
    pluginRenderers,
    texFragments,
  );
  const rendererFingerprint = sha256(
    canonicalJson({
      renderer: { id: "html", version: "1.0.0", serializer: HTML_SERIALIZER },
      profile: HTML_PROFILE,
      ...(layout.fingerprintDependencies as Readonly<Record<string, JsonValue>>),
    }),
  );
  const html = `<!doctype html>\n<html lang="und"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:"><meta name="azeforge-content-hash" content="${contentHash}"><title>${layout.title}</title><style>${layout.css}</style></head><body>${layout.body}</body></html>\n`;
  const bytes = new TextEncoder().encode(html);
  if (bytes.byteLength > HTML_MAX_BYTES) {
    throw new ArtifactLimitError(bytes.byteLength);
  }
  const artifactHash = artifactBytesHash(bytes);

  return {
    bytes,
    metadata: {
      format: "html",
      mimeType: HTML_MIME_TYPE,
      profile: HTML_PROFILE,
      byteLength: bytes.byteLength,
      contentHash,
      assetManifestHash: assetManifestHash(assetManifest),
      rendererFingerprint,
      artifactHash,
      theme: { id: theme.id, version: theme.version },
      cssDimensions: { ...theme.geometry },
    },
  };
}
