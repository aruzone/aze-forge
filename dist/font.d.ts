import type { Sha256Hash } from "./model.js";
interface FontSubsetDescriptor {
    readonly family: "Inter" | "JetBrains Mono";
    readonly name: string;
    readonly unicodeRange: string;
    readonly weight: 400 | 700;
}
export interface EmbeddedFontFace extends FontSubsetDescriptor {
    readonly data: string;
    readonly sourceHash: Sha256Hash;
}
export declare class FontCoverageError extends Error {
    readonly codePoint: number;
    constructor(codePoint: number);
}
export declare function assertInterFontCoverage(values: readonly string[]): void;
export declare function loadInterFontFaces(): Promise<readonly EmbeddedFontFace[]>;
export declare function loadCodeFontFaces(): Promise<readonly EmbeddedFontFace[]>;
export {};
