import type { Diagnostic } from "./model.js";
/**
 * Fixed same-origin reload script injected into the serve preview shell. The
 * exact bytes are part of the preview CSP hash; change them only with a CSP
 * update in lockstep.
 */
export declare const PREVIEW_SSE_SCRIPT: string;
export declare function previewScriptHash(): string;
export declare function previewContentSecurityPolicy(): string;
/**
 * Wrap an immutable HTML Artifact in the unhashable preview shell. The Artifact
 * bytes are never mutated in place: the shell is derived in memory, served
 * only, and never written as an Artifact.
 */
export declare function wrapPreviewShell(artifactHtml: string): string;
/** Current-diagnostics page replacing stale preview after a failed cycle. */
export declare function renderDiagnosticsPage(diagnostics: readonly Diagnostic[], sourceLabel: string): string;
/** Transient first paint before the initial compile settles; reloads via SSE. */
export declare function renderStartingPage(sourceLabel: string): string;
export interface PreviewAsset {
    readonly token: string;
    readonly mediaType: string;
    readonly bytes: Uint8Array;
}
/**
 * Snapshot the project images embedded in an HTML Artifact as opaque
 * content-addressed assets. Tokens are byte hashes, never project paths.
 */
export declare function extractServedAssets(artifactHtml: string): PreviewAsset[];
