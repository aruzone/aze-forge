import { realpath } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { isAbsoluteSource, isContained, isRemoteSource } from "./assets.js";
import { blockGroups, blockInlineRuns } from "./block-content.js";
const SUPPORTED_IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".svg"]);
function collectInlineSources(nodes, out) {
    for (const node of nodes) {
        if (node.kind === "image") {
            out.push(node.src);
        }
        else if (node.kind === "link") {
            collectInlineSources(node.children, out);
        }
        else if (node.kind === "emphasis" || node.kind === "strong") {
            collectInlineSources(node.children, out);
        }
    }
}
function collectBlockSources(blocks, out) {
    for (const block of blocks) {
        // One shape walk: inline runs plus contained Blocks, so a new Block kind
        // can never hide an image from the watch dependency list.
        for (const run of blockInlineRuns(block))
            collectInlineSources(run, out);
        for (const group of blockGroups(block))
            collectBlockSources(group, out);
    }
}
/** Every image `src` referenced by a Document, in Source order. */
export function collectImageSources(document) {
    const out = [];
    collectBlockSources(document.blocks, out);
    return out;
}
/**
 * Partition image references into existing files and missing root-confined
 * candidates. Remote, absolute, escaping, and unsupported-type references are
 * compile errors, not watch targets, so they are skipped here.
 */
export async function resolveWatchPaths(projectRoot, imageSources) {
    const files = new Set();
    const missing = new Set();
    for (const src of imageSources) {
        if (src.trim() === "" || src.includes("\0"))
            continue;
        if (isAbsoluteSource(src) || isRemoteSource(src))
            continue;
        if (!SUPPORTED_IMAGE_EXTENSIONS.has(extname(src).toLowerCase()))
            continue;
        const candidate = resolve(projectRoot, src);
        if (!isContained(projectRoot, candidate))
            continue;
        let candidateReal;
        try {
            candidateReal = await realpath(candidate);
        }
        catch {
            missing.add(candidate);
            continue;
        }
        if (!isContained(projectRoot, candidateReal))
            continue;
        files.add(candidateReal);
    }
    return {
        files: [...files].sort(),
        missing: [...missing].sort(),
    };
}
//# sourceMappingURL=watch-dependencies.js.map