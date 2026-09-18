import type { AssetManifestEntry, AzeDocument, Diagnostic, Sha256Hash } from "./model.js";
export declare const MAX_IMAGE_BYTES: number;
export declare const MAX_IMAGE_DIMENSION_PX = 10000;
export declare const MAX_IMAGE_PIXELS = 25000000;
export interface ImageResolution {
    readonly diagnostics: readonly Diagnostic[];
    readonly document?: AzeDocument;
    readonly manifest?: readonly AssetManifestEntry[];
}
export declare function isContained(root: string, candidate: string): boolean;
export declare function isRemoteSource(src: string): boolean;
export declare function isAbsoluteSource(src: string): boolean;
/**
 * Removes the BOM, a leading XML declaration, and leading comments so the SVG
 * root element is observable. Renderer output such as dvisvgm carries a
 * generator comment ahead of its root element.
 */
export declare function stripSvgPreamble(text: string): string;
export type SvgCheck = "ok" | "malformed" | "animated" | "active" | "external" | "dimensions";
export declare function checkSvg(text: string): SvgCheck;
export declare function assetManifestHash(manifest: readonly AssetManifestEntry[]): Sha256Hash;
export declare function resolveProjectImages(document: AzeDocument, options?: {
    readonly projectRoot?: string;
    readonly sourceName?: string;
}): Promise<ImageResolution>;
