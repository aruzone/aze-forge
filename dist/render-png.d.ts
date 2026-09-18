import type { Browser } from "puppeteer-core";
import type { AnyBlockRenderer, Artifact, AssetManifestEntry, ContentHash, RendererDescriptor, Theme } from "./model.js";
import type { HtmlLayout } from "./render-html.js";
export declare const PNG_RENDERER_ID: "png";
export declare const PNG_RENDERER_VERSION: "1.0.0";
export declare const PNG_MIME_TYPE: "image/png";
export declare const PNG_PROFILE: "azeforge.png.continuous/v1";
export declare const PNG_SERIALIZER: "azeforge-png/v1";
export declare const PNG_DEVICE_SCALE_FACTOR: 2;
export declare const PNG_MAX_BYTES: number;
export declare const PNG_MAX_CSS_HEIGHT_PX = 100000;
export declare const PNG_MAX_PIXEL_DIMENSION = 32768;
export declare const PNG_MAX_PIXELS = 50000000;
export declare const PNG_REQUIRED_CAPABILITIES: readonly ["png-continuous", "srgb"];
export declare const pngBlockRenderers: readonly AnyBlockRenderer[];
export interface PngBrowserCapability {
    readonly launch: () => Promise<Browser>;
}
export declare const pinnedPngBrowserCapability: PngBrowserCapability;
export declare const pngRendererDescriptor: RendererDescriptor;
export declare class PngArtifactLimitError extends Error {
    readonly byteLength: number;
    constructor(byteLength: number);
}
/**
 * Deterministic PNG normalization: keeps the IHDR geometry, strips every
 * unstable or private ancillary chunk, emits one fixed sRGB chunk, and
 * re-encodes IDAT with fixed filtering and compression. Same decoded
 * pixels always produce identical bytes.
 */
export declare function normalizePng(bytes: Uint8Array): Uint8Array;
export declare function renderPng(layout: HtmlLayout, contentHash: ContentHash, theme: Theme, assetManifest: readonly AssetManifestEntry[], browserCapability: PngBrowserCapability): Promise<Artifact>;
