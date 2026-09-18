import type { Browser } from "puppeteer-core";
import type { AnyBlockRenderer, Artifact, AssetManifestEntry, ContentHash, RendererDescriptor, Theme } from "./model.js";
import type { HtmlLayout } from "./render-html.js";
export declare const PDF_RENDERER_ID: "pdf";
export declare const PDF_RENDERER_VERSION: "1.0.0";
export declare const PDF_MIME_TYPE: "application/pdf";
export declare const PDF_PROFILE: "azeforge.pdf.paged/v1";
export declare const PDF_SERIALIZER: "azeforge-pdf/v1";
export declare const PDF_REQUIRED_CAPABILITIES: readonly ["pdf-paged"];
export declare const PDF_MAX_BYTES: number;
export declare const PDF_MAX_PAGES = 200;
export declare const PDF_MAX_HTML_BYTES: number;
export declare const PDF_PRINT_TIMEOUT_MS = 30000;
/**
 * Renderer temporary-storage budget. It is accounted statically, not
 * metered: settled HTML is capped at 64 MiB in and canonical PDF at
 * 128 MiB out before publication, so browser profile, decoded images,
 * and print spool stay an order of magnitude under budget by
 * construction. The caps below are the enforcement.
 */
export declare const PDF_MAX_TEMP_BYTES: number;
export declare const pdfBlockRenderers: readonly AnyBlockRenderer[];
export interface PdfBrowserCapability {
    readonly launch: () => Promise<Browser>;
}
export declare const pinnedPdfBrowserCapability: PdfBrowserCapability;
export declare const pdfRendererDescriptor: RendererDescriptor;
export declare class PdfArtifactLimitError extends Error {
    readonly byteLength: number;
    constructor(byteLength: number, detail?: string);
}
export interface PdfPageGeometry {
    readonly widthPt: number;
    readonly heightPt: number;
    readonly marginPt: number;
    readonly pageCss: string;
}
export declare function pdfPageGeometryForTheme(theme: Theme): PdfPageGeometry;
/**
 * Paged print CSS layered over the shared continuous layout CSS. Normal
 * document flow owns pagination: headings stay with following content,
 * prose observes widows/orphans, table headers repeat with row splits,
 * fenced code splits between visual lines, equations/diagrams/images stay
 * atomic, long callouts split between children, and dark-presentation
 * level-one headings start new sections.
 */
export declare function pdfPagedCss(theme: Theme): string;
export interface PdfCanonicalIdentity {
    readonly title: string;
    readonly authors: readonly string[];
    readonly documentId: string;
}
export interface CanonicalPdf {
    readonly bytes: Uint8Array;
    readonly pageCount: number;
    readonly pageWidthPt: number;
    readonly pageHeightPt: number;
}
export declare function canonicalizePdf(raw: Uint8Array, identity: PdfCanonicalIdentity): CanonicalPdf;
export interface PdfDocumentInfo {
    readonly title: string;
    readonly authors: readonly string[];
}
export declare function renderPdf(layout: HtmlLayout, contentHash: ContentHash, theme: Theme, assetManifest: readonly AssetManifestEntry[], browserCapability: PdfBrowserCapability, info: PdfDocumentInfo): Promise<Artifact>;
