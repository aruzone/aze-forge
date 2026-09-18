import { watch } from "node:fs";
import { stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
async function nearestExistingAncestor(candidate) {
    let current = candidate;
    for (;;) {
        try {
            await stat(current);
            return current;
        }
        catch {
            const parent = dirname(current);
            if (parent === current)
                return current;
            current = parent;
        }
    }
}
/**
 * Serialized, coalescing file watcher. Change notifications during an active
 * compile collapse into one scheduled follow-up cycle; the caller serializes
 * compiles and invokes `onChange` per settled trigger.
 */
export class WatchDriver {
    options;
    watchers = [];
    timer;
    closed = false;
    failed = false;
    constructor(options) {
        this.options = options;
    }
    static async start(options, initialOutcome) {
        const driver = new WatchDriver(options);
        await driver.rearm(initialOutcome);
        return driver;
    }
    /** Signal that the current compile settled; watch paths refresh. */
    async rearm(outcome) {
        if (this.closed || this.failed)
            return;
        for (const watcher of this.watchers)
            watcher.close();
        this.watchers = [];
        let paths;
        try {
            paths = await this.options.watchPathsFor(outcome);
        }
        catch (error) {
            this.fail(error);
            return;
        }
        const targets = new Set(paths.files);
        targets.add(this.options.sourcePath);
        const ancestors = new Set();
        for (const missing of paths.missing) {
            const parent = dirname(resolve(missing));
            ancestors.add(await nearestExistingAncestor(parent));
        }
        ancestors.add(await nearestExistingAncestor(dirname(this.options.sourcePath)));
        for (const target of [...targets].sort())
            this.observe(target);
        for (const ancestor of [...ancestors].sort()) {
            if (!targets.has(ancestor))
                this.observe(ancestor);
        }
    }
    observe(target) {
        if (this.closed || this.failed)
            return;
        let watcher;
        try {
            watcher = watch(target, { persistent: true }, () => this.schedule());
        }
        catch (error) {
            this.fail(error);
            return;
        }
        watcher.on("error", (error) => this.fail(error));
        this.watchers.push(watcher);
    }
    schedule() {
        if (this.closed || this.failed)
            return;
        if (this.timer !== undefined)
            clearTimeout(this.timer);
        this.timer = setTimeout(() => {
            this.timer = undefined;
            this.options.onChange();
        }, this.options.debounceMs);
        this.timer.unref?.();
    }
    fail(error) {
        if (this.closed || this.failed)
            return;
        this.failed = true;
        if (this.timer !== undefined) {
            clearTimeout(this.timer);
            this.timer = undefined;
        }
        for (const watcher of this.watchers)
            watcher.close();
        this.watchers = [];
        this.options.onWatcherFailed(error);
    }
    async close() {
        this.closed = true;
        if (this.timer !== undefined) {
            clearTimeout(this.timer);
            this.timer = undefined;
        }
        for (const watcher of this.watchers)
            watcher.close();
        this.watchers = [];
    }
}
//# sourceMappingURL=watch-loop.js.map