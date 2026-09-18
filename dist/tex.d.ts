import type { AzeBlockPlugin, Diagnostic, SourceRange, TexBlock } from "./model.js";
import { type TexProfile } from "./tex-schemas.js";
export declare const TEX_HEADER_FIELDS: readonly ["id", "title", "description", "profile"];
export declare const MAX_TEX_BODY_LENGTH = 50000;
export interface TexBodyLine {
    readonly text: string;
    readonly range: SourceRange;
}
export interface TexHeader {
    readonly id?: string;
    readonly title?: string;
    readonly description?: string;
    readonly profile?: TexProfile;
    readonly diagnostics: readonly Diagnostic[];
}
export declare function parseTexHeader(entries: readonly {
    readonly key: string;
    readonly value: string;
    readonly range: SourceRange;
}[], sourceName: string | undefined): TexHeader;
export declare function validateTexBody(options: {
    readonly header: TexHeader;
    readonly bodyLines: readonly TexBodyLine[];
    readonly blockRange: SourceRange;
    readonly sourceName?: string;
}): {
    readonly block?: TexBlock;
    readonly diagnostics: readonly Diagnostic[];
};
export declare const texPlugin: AzeBlockPlugin;
