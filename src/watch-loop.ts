import { watch } from "node:fs";
import { stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { FSWatcher } from "node:fs";

export interface CompileOutcome {
  /** Image `src` values observed in the latest Document, if any compiled. */
  readonly imageSources: readonly string[];
}

async function nearestExistingAncestor(candidate: string): Promise<string> {
  let current = candidate;
  for (;;) {
    try {
      await stat(current);
      return current;
    } catch {
      const parent = dirname(current);
      if (parent === current) return current;
      current = parent;
    }
  }
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
export class WatchDriver {
  private watchers: FSWatcher[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private closed = false;
  private failed = false;

  private constructor(private readonly options: WatchDriverOptions) {}

  static async start(
    options: WatchDriverOptions,
    initialOutcome: CompileOutcome | undefined,
  ): Promise<WatchDriver> {
    const driver = new WatchDriver(options);
    await driver.rearm(initialOutcome);
    return driver;
  }

  /** Signal that the current compile settled; watch paths refresh. */
  async rearm(outcome: CompileOutcome | undefined): Promise<void> {
    if (this.closed || this.failed) return;
    for (const watcher of this.watchers) watcher.close();
    this.watchers = [];
    let paths: { readonly files: readonly string[]; readonly missing: readonly string[] };
    try {
      paths = await this.options.watchPathsFor(outcome);
    } catch (error) {
      this.fail(error);
      return;
    }
    const targets = new Set<string>(paths.files);
    targets.add(this.options.sourcePath);
    const ancestors = new Set<string>();
    for (const missing of paths.missing) {
      const parent = dirname(resolve(missing));
      ancestors.add(await nearestExistingAncestor(parent));
    }
    ancestors.add(await nearestExistingAncestor(dirname(this.options.sourcePath)));
    for (const target of [...targets].sort()) this.observe(target);
    for (const ancestor of [...ancestors].sort()) {
      if (!targets.has(ancestor)) this.observe(ancestor);
    }
  }

  private observe(target: string): void {
    if (this.closed || this.failed) return;
    let watcher: FSWatcher;
    try {
      watcher = watch(target, { persistent: true }, () => this.schedule());
    } catch (error) {
      this.fail(error);
      return;
    }
    watcher.on("error", (error) => this.fail(error));
    this.watchers.push(watcher);
  }

  private schedule(): void {
    if (this.closed || this.failed) return;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.options.onChange();
    }, this.options.debounceMs);
    this.timer.unref?.();
  }

  private fail(error: unknown): void {
    if (this.closed || this.failed) return;
    this.failed = true;
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    for (const watcher of this.watchers) watcher.close();
    this.watchers = [];
    this.options.onWatcherFailed(error);
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    for (const watcher of this.watchers) watcher.close();
    this.watchers = [];
  }
}
