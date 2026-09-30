import type { FigureBlockRenderer, CircuitBlock, ThemeFigureRendererContext } from "./model.js";
export declare const CIRCUIT_HTML_BLOCK_RENDERER_ID: "azeforge.circuit.html/v1";
export declare const CIRCUIT_HTML_BLOCK_RENDERER_VERSION: "1.0.0";
export declare function renderCircuitFragment(block: CircuitBlock, context: ThemeFigureRendererContext): string;
export declare const circuitHtmlBlockRenderer: FigureBlockRenderer<CircuitBlock>;
