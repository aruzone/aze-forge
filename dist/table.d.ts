import type { AzeBlockPlugin, BlockRendererContext, TableBlock } from "./model.js";
export declare const TABLE_HTML_BLOCK_RENDERER_ID: "azeforge.table.html/v1";
export declare const TABLE_HTML_BLOCK_RENDERER_VERSION: "1.0.0";
export declare const tablePlugin: AzeBlockPlugin;
export declare function renderTableFragment(block: TableBlock, context: BlockRendererContext): string;
export declare const tableHtmlBlockRenderer: Readonly<{
    descriptor: Readonly<{
        id: "azeforge.table.html/v1";
        version: "1.0.0";
        blockType: "table";
        pluginVersionRange: "2.0.0";
        rendererId: "html";
        rendererVersionRange: "1.0.0";
    }>;
    render: typeof renderTableFragment;
}>;
