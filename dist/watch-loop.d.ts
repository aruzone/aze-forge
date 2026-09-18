export interface CompileOutcome {
    /** Image `src` values observed in the latest Document, if any compiled. */
    readonly imageSources: readonly string[];
}
export interface WatchDriverOptions {
    /** Canonical Source path. */
    readonly sourcePath: string;
    /** Canonical project root. */
    readonly projectRoot: string;
    /** Milliseconds to coalesce rapid change notifications. */
    readonly debounceMs: number;
    /** Resolve watch paths for the latest compile outcome. */
    readonly watchPathsFor: (outcome: CompileOutcome | undefined) => Promise<{
        readonly files: readonly string[];
        readonly missing: readonly string[];
    }>;
    readonly onChange: () => void;
    readonly onWatcherFailed: (error: unknown) => void;
}
/**
 * Serialized, coalescing file watcher. Change notifications during an active
 * compile collapse into one scheduled follow-up cycle; the caller serializes
 * compiles and invokes `onChange` per settled trigger.
 */
export declare class WatchDriver {
    private readonly options;
    private watchers;
    private timer;
    private closed;
    private failed;
    private constructor();
    static start(options: WatchDriverOptions, initialOutcome: CompileOutcome | undefined): Promise<WatchDriver>;
    /** Signal that the current compile settled; watch paths refresh. */
    rearm(outcome: CompileOutcome | undefined): Promise<void>;
    private observe;
    private schedule;
    private fail;
    close(): Promise<void>;
}
