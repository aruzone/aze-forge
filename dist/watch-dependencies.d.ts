import type { AzeDocument } from "./model.js";
/** Every image `src` referenced by a Document, in Source order. */
export declare function collectImageSources(document: AzeDocument): string[];
export interface WatchPaths {
    /** Existing root-confined files to watch directly. */
    readonly files: readonly string[];
    /** Root-confined candidate paths that do not exist yet. */
    readonly missing: readonly string[];
}
/**
 * Partition image references into existing files and missing root-confined
 * candidates. Remote, absolute, escaping, and unsupported-type references are
 * compile errors, not watch targets, so they are skipped here.
 */
export declare function resolveWatchPaths(projectRoot: string, imageSources: readonly string[]): Promise<WatchPaths>;
