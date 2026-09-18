import type { Compiler, CompilerOptions } from "./model.js";
export declare const DEFAULT_RENDER_TIMEOUT_MS = 5000;
/** Fixed deployment ceiling for one TeX renderer batch; hosts may only lower it. */
export declare const DEFAULT_TEX_RENDER_TIMEOUT_MS = 15000;
export declare function createCompiler(options?: CompilerOptions): Compiler;
