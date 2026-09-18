import type { Browser } from "puppeteer-core";
import type { AnyBlockRenderer, Artifact, AssetManifestEntry, ContentHash, RendererDescriptor, Theme } from "./model.js";
import type { HtmlLayout } from "./render-html.js";
export declare const SVG_RENDERER_ID: "svg";
export declare const SVG_RENDERER_VERSION: "1.0.0";
export declare const SVG_MIME_TYPE: "image/svg+xml";
export declare const SVG_PROFILE: "azeforge.svg.foreign-object/v1";
export declare const SVG_SERIALIZER: "azeforge-svg/v1";
export declare const SVG_MAX_BYTES: number;
export declare const SVG_MAX_HEIGHT_PX = 100000;
export declare const SVG_REQUIRED_CAPABILITIES: readonly ["svg2", "xhtml-foreign-object"];
export declare const svgBlockRenderers: readonly AnyBlockRenderer[];
export interface SvgBrowserCapability {
    readonly launch: () => Promise<Browser>;
}
export declare const pinnedSvgBrowserCapability: SvgBrowserCapability;
export declare const svgRendererDescriptor: RendererDescriptor;
export declare class SvgArtifactLimitError extends Error {
    readonly byteLength: number;
    constructor(byteLength: number);
}
export declare function sanitizeWholeDocumentSvg(svg: string): string;
export declare function renderSvg(layout: HtmlLayout, contentHash: ContentHash, theme: Theme, assetManifest: readonly AssetManifestEntry[], browserCapability: SvgBrowserCapability): Promise<Artifact>;
