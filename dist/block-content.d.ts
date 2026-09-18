import type { AzeBlock, Inline, ParsedBlock } from "./model.js";
/**
 * The one place that knows which fields of a Block carry nested content.
 *
 * Every walker that reaches inside Blocks — asset collection and embedding,
 * watch dependencies, font coverage — reads this shape instead of switching on
 * `block.kind` again, so a new Block kind or a new content field is taught once
 * rather than remembered in four places.
 */
/** Every inline run a Block owns directly, in authored order. */
export declare function blockInlineRuns(block: AzeBlock | ParsedBlock): readonly (readonly Inline[])[];
/** Every Block list a Block contains, in authored order. */
export declare function blockGroups(block: AzeBlock | ParsedBlock): readonly (readonly ParsedBlock[])[];
