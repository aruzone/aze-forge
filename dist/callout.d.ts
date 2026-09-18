import type { AzeBlock, AzeBlockPlugin, CalloutBlock } from "./model.js";
export declare const CALLOUT_HTML_BLOCK_RENDERER_ID: "azeforge.callout.html/v1";
export declare const CALLOUT_HTML_BLOCK_RENDERER_VERSION: "1.0.0";
export declare const calloutPlugin: AzeBlockPlugin;
export interface CalloutRenderContext {
    readonly sourceName?: string;
    readonly renderBlocks: (blocks: readonly AzeBlock[]) => string;
}
export declare function renderCalloutFragment(block: CalloutBlock, context: CalloutRenderContext): string;
export declare const calloutHtmlBlockRenderer: Readonly<{
    descriptor: Readonly<{
        id: "azeforge.callout.html/v1";
        version: "1.0.0";
        blockType: "callout";
        pluginVersionRange: "1.0.0";
        rendererId: "html";
        rendererVersionRange: "1.0.0";
    }>;
    render: typeof renderCalloutFragment;
}>;
