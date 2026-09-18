/**
 * TeX renderer batch transport: builds the compiler-owned request, spawns the
 * configured fixed-argv command once per compiler invocation, validates the
 * single JSON response, and maps adapter failures to stable categories.
 *
 * The command receives one UTF-8 JSON request on standard input and writes one
 * UTF-8 JSON response on standard output. Author Source never contributes an
 * executable, argv entry, path, or resource-limit setting.
 */
import type { SourceRange, TexBlock, TexBodyLocation, TexRenderRequest, TexRenderResponse, TexRenderResult, TexRenderer, TexRendererFailureCategory } from "./model.js";
import type { SourceLine } from "./source-map.js";
/** A stable, host-path-free TeX renderer failure category. */
export declare class TexAdapterFailure extends Error {
    readonly category: TexRendererFailureCategory;
    readonly name = "TexAdapterFailure";
    constructor(category: TexRendererFailureCategory);
}
/** The compiler cancelled the batch; the command process group is dead. */
export declare class TexAdapterCancelled extends Error {
    readonly name = "TexAdapterCancelled";
    constructor();
}
export declare function buildTexRenderRequest(blocks: readonly TexBlock[]): TexRenderRequest;
/**
 * Runs one renderer command for one compiler invocation. Resolves with the
 * validated response; every transport or protocol violation rejects with a
 * `TexAdapterFailure` whose category the compiler reports at the affected
 * Blocks.
 */
export declare function runTexRendererBatch(renderer: TexRenderer, request: TexRenderRequest, options: {
    readonly timeoutMs: number;
    readonly signal?: AbortSignal;
}): Promise<TexRenderResponse>;
/** The failure category an adapter-reported result carries, host-path-free. */
export declare function texResultCategory(result: Extract<TexRenderResult, {
    status: "error";
}>): TexRendererFailureCategory;
/**
 * Maps a body-relative TeX location onto the authored Source. The body is the
 * contiguous run of Source lines immediately preceding a tex Block's closing
 * fence, so its first line number follows from the block end and body length.
 */
export declare function texBodyRange(block: TexBlock, location: TexBodyLocation, lines: readonly SourceLine[]): SourceRange;
