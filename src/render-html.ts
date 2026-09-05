import { assetManifestHash } from "./assets.js";
import { renderCalloutFragment } from "./callout.js";
import { KATEX_VERSION, getKatexCss } from "./equation.js";
import { MERMAID_VERSION } from "./mermaid.js";
import type { EmbeddedFontFace } from "./font.js";
import { artifactBytesHash, canonicalJson, sha256 } from "./hash.js";
import { escapeHtml, renderInlineHtml } from "./html-fragment.js";
import { inlineTextValue } from "./markdown.js";
import type {
  Artifact,
  AssetManifestEntry,
  AzeBlock,
  AzeDocument,
  BlockRendererContext,
  CalloutBlock,
  ContentHash,
  EquationBlock,
  JsonValue,
  TableBlock,
  MermaidBlock,
  Theme,
} from "./model.js";
import { renderTableFragment } from "./table.js";

const HTML_MIME_TYPE = "text/html; charset=utf-8";
const HTML_PROFILE = "azeforge.html.self-contained/v1";
const HTML_MAX_BYTES = 64 * 1024 * 1024;

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
}

interface RenderContext {
  readonly sourceName?: string;
  readonly equationFragments: ReadonlyMap<EquationBlock, string>;
  readonly mermaidFragments: ReadonlyMap<MermaidBlock, string>;
  readonly renderCallout: (
    block: CalloutBlock,
    context: BlockRendererContext,
  ) => string;
  readonly renderTable: (
    block: TableBlock,
    context: BlockRendererContext,
  ) => string;
}

export function documentTitle(document: AzeDocument): string {
  const metadataTitle = document.metadata.title?.trim();
  if (metadataTitle !== undefined && metadataTitle !== "") return metadataTitle;
  const firstHeading = document.blocks.find((block) => block.kind === "heading");
  if (firstHeading?.kind !== "heading") return "AzeForge document";
  const text = inlineTextValue(firstHeading.children).trim();
  return text === "" ? "AzeForge document" : text;
}


function idAttribute(id: string | undefined): string {
  return id === undefined ? "" : ` id="${escapeHtml(id)}"`;
}

function renderBlock(block: AzeBlock, context: RenderContext): string {
  switch (block.kind) {
    case "equation":
      return (
        context.equationFragments.get(block) ?? '<figure class="aze-equation"></figure>'
      );
    case "mermaid":
      return (
        context.mermaidFragments.get(block) ??
        '<figure class="aze-mermaid"></figure>'
      );
    case "heading":
      return `<h${block.level}${idAttribute(block.id)}>${renderInlineHtml(block.children)}</h${block.level}>`;
    case "paragraph":
      return `<p${idAttribute(block.id)}>${renderInlineHtml(block.children)}</p>`;
    case "thematicBreak":
      return `<hr${idAttribute(block.id)}>`;
    case "blockquote":
      return `<blockquote${idAttribute(block.id)}>${renderBlocks(block.children as readonly AzeBlock[], context)}</blockquote>`;
    case "list": {
      const tag = block.ordered ? "ol" : "ul";
      const start =
        block.ordered && block.start !== undefined ? ` start="${block.start}"` : "";
      const items = block.items
        .map((item) => `<li>${renderBlocks(item.blocks as readonly AzeBlock[], context)}</li>`)
        .join("");
      return `<${tag}${idAttribute(block.id)}${start}>${items}</${tag}>`;
    }
    case "code": {
      const language =
        block.language === undefined ? "" : ` class="language-${escapeHtml(block.language)}"`;
      return `<pre${idAttribute(block.id)}><code${language}>${escapeHtml(block.value)}</code></pre>`;
    }
    case "table":
      return context.renderTable(block, {
        ...(context.sourceName === undefined ? {} : { sourceName: context.sourceName }),
        renderBlocks: (children) => renderBlocks(children, context),
      });
    case "callout":
      return context.renderCallout(block, {
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
  mermaidFragments: ReadonlyMap<MermaidBlock, string> = new Map(),
  mermaidDependencyClosure: JsonValue = { mermaid: MERMAID_VERSION },
  pluginRenderers: HtmlPluginRenderers = {},
): HtmlLayout {
  const renderCallout =
    pluginRenderers.renderCallout ?? renderCalloutFragment;
  const renderTable =
    pluginRenderers.renderTable ?? ((block: TableBlock): string => renderTableFragment(block));
  const context: RenderContext = {
    equationFragments,
    mermaidFragments,
    renderCallout,
    renderTable,
  };
  return {
    title: escapeHtml(documentTitle(document)),
    description: "AzeForge whole-Document Artifact",
    css: `${embeddedFontCss(fontFaces)}${themeCss(theme)}${getKatexCss()}.aze-equation{margin:1em 0;text-align:center}.aze-equation[data-align="left"]{text-align:left}.aze-equation[data-align="right"]{text-align:right}.aze-mermaid{margin:1em 0}.aze-mermaid svg{display:block;max-width:100%;height:auto;margin:0 auto}`,
    body: `<main><article>${renderBlocks(document.blocks, context)}</article></main>`,
    fingerprintDependencies: {
      theme: theme as unknown as JsonValue,
      fonts: fontFaces.map(({ name, weight, sourceHash }) => ({
        name,
        weight,
        sourceHash,
      })),
      equations: equationDependencyClosure,
      diagrams: mermaidDependencyClosure,
      prose: {
        serializer: "azeforge-prose/v1",
        callout: "1.0.0",
        table: "1.0.0",
      },
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
  mermaidFragments: ReadonlyMap<MermaidBlock, string> = new Map(),
  mermaidDependencyClosure: JsonValue = { mermaid: MERMAID_VERSION },
  pluginRenderers: HtmlPluginRenderers = {},
  assetManifest: readonly AssetManifestEntry[] = [],
): Promise<Artifact> {
  const layout = createHtmlLayout(
    document,
    theme,
    fontFaces,
    equationFragments,
    equationDependencyClosure,
    mermaidFragments,
    mermaidDependencyClosure,
    pluginRenderers,
  );
  const rendererFingerprint = sha256(
    canonicalJson({
      renderer: { id: "html", version: "1.0.0", serializer: "azeforge-html/v2" },
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
