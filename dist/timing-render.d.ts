/**
 * Native digital timing emitter (contract: issue #63 §11).
 *
 * One project-owned SVG emitter over the shared plot/diagram machinery:
 * quantized 3-decimal coordinates, deterministic ids and an intrinsic
 * finite nonzero viewBox. Layout is total — every valid Block renders, so
 * the family registers no `layout-unsupported` code.
 *
 * State legibility is shape-first: unknown intervals are hatched, high
 * impedance is dashed, buses are filled bands with slash marks, and edges
 * are diagonals. Colour reinforces but never carries the distinction.
 * Every mark carries presentation attributes rather than stylesheet rules,
 * so the fragment is faithful as a standalone SVG.
 */
import type { AzeBlockRenderer, BlockRendererContext, JsonValue, TimingBlock } from "./model.js";
export declare const TIMING_HTML_BLOCK_RENDERER_ID: "azeforge.timing.html/v1";
export declare const TIMING_HTML_BLOCK_RENDERER_VERSION: "1.0.0";
export declare const TIMING_EMITTER_VERSION: "1.0.0";
/**
 * Render one timing Block: a static, browser-free deterministic figure over
 * one shared cycle or duration axis.
 */
export declare function renderTimingFragment(block: TimingBlock, _context: BlockRendererContext): string;
export declare function timingDependencyClosure(): JsonValue;
export declare const timingHtmlBlockRenderer: AzeBlockRenderer<TimingBlock>;
