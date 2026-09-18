import type { ArtifactHash, AzeDocument, ContentHash, JsonValue, Sha256Hash } from "./model.js";
export declare function canonicalJson(value: JsonValue): string;
export declare function sha256(bytes: string | Uint8Array): Sha256Hash;
export declare function artifactBytesHash(bytes: Uint8Array): ArtifactHash;
export declare function documentContentHash(document: AzeDocument): ContentHash;
