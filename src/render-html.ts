import { KATEX_VERSION, getKatexCss } from "./equation.js";
import type { EmbeddedFontFace } from "./font.js";
import { artifactBytesHash, canonicalJson, sha256 } from "./hash.js";
import type {
  Artifact,
  AzeDocument,
  ContentHash,
  JsonValue,
  Theme,
} from "./model.js";

const HTML_MIME_TYPE = "text/html; charset=utf-8";
const HTML_PROFILE = "azeforge.html.self-contained/v1";
const EMPTY_ASSET_MANIFEST_HASH = sha256("[]");
const HTML_MAX_BYTES = 64 * 1024 * 1024;

export class ArtifactLimitError extends Error {
  readonly byteLength: number;

  constructor(byteLength: number) {
    super(`HTML Artifact is ${byteLength} bytes; the limit is ${HTML_MAX_BYTES} bytes.`);
    this.name = "ArtifactLimitError";
    this.byteLength = byteLength;
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function documentTitle(document: AzeDocument): string {
  if (document.metadata.title !== undefined) return document.metadata.title;
  const firstHeading = document.blocks.find((block) => block.kind === "heading");
  return firstHeading?.children.map((child) => child.value).join("") ?? "AzeForge document";
}

function renderBlocks(
  document: AzeDocument,
  equationFragments: ReadonlyMap<number, string> = new Map(),
): string {
  return document.blocks
    .map((block, index) => {
      if (block.kind === "equation") {
        return equationFragments.get(index) ?? "<figure class=\"aze-equation\"></figure>";
      }
      const text = block.children.map((child) => escapeHtml(child.value)).join("");
      if (block.kind === "heading") {
        return `<h${block.level}>${text}</h${block.level}>`;
      }
      return `<p>${text}</p>`;
    })
    .join("");
}

function embeddedFontCss(fontFaces: readonly EmbeddedFontFace[]): string {
  return fontFaces
    .map(
      (font) =>
        `@font-face{font-family:Inter;font-style:normal;font-weight:${font.weight};font-display:block;src:url(data:font/woff2;base64,${font.data}) format(\"woff2\");unicode-range:${font.unicodeRange}}`,
    )
    .join("");
}

function themeCss(theme: Theme): string {
  const { colors, geometry, typography } = theme;
  return `:root{color-scheme:light;background:${colors.background};color:${colors.foreground};font-family:${typography.proseFontFamily};font-weight:${typography.bodyFontWeight};line-height:${typography.lineHeight}}*{box-sizing:border-box}body{margin:0;background:${colors.background}}main{max-width:${geometry.canvasWidthPx}px;margin:0 auto;padding:${geometry.paddingPx}px}article{max-width:${geometry.contentWidthPx}px;margin:0 auto}h1,h2,h3,h4,h5,h6{font-weight:${typography.headingFontWeight};line-height:${typography.headingLineHeight}}p{margin:${typography.paragraphSpacingEm}em 0;color:${colors.foreground}}`;
}

export async function renderHtml(
  document: AzeDocument,
  contentHash: ContentHash,
  theme: Theme,
  fontFaces: readonly EmbeddedFontFace[],
  equationFragments: ReadonlyMap<number, string> = new Map(),
  equationDependencyClosure: JsonValue = { katex: KATEX_VERSION },
): Promise<Artifact> {
  const rendererFingerprint = sha256(
    canonicalJson({
      renderer: { id: "html", version: "1.0.0", serializer: "azeforge-html/v1" },
      profile: HTML_PROFILE,
      theme: theme as unknown as JsonValue,
      fonts: fontFaces.map(({ name, weight, sourceHash }) => ({
        name,
        weight,
        sourceHash,
      })),
      equations: equationDependencyClosure,
    }),
  );
  const title = escapeHtml(documentTitle(document));
  const css = `${embeddedFontCss(fontFaces)}${themeCss(theme)}${getKatexCss()}.aze-equation{margin:1em 0;text-align:center}.aze-equation[data-align="left"]{text-align:left}.aze-equation[data-align="right"]{text-align:right}`;
  const html = `<!doctype html>\n<html lang="und"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:"><meta name="azeforge-content-hash" content="${contentHash}"><title>${title}</title><style>${css}</style></head><body><main><article>${renderBlocks(document, equationFragments)}</article></main></body></html>\n`;
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
      assetManifestHash: EMPTY_ASSET_MANIFEST_HASH,
      rendererFingerprint,
      artifactHash,
      theme: { id: theme.id, version: theme.version },
      cssDimensions: { ...theme.geometry },
    },
  };
}
