import type { Browser, Page } from "puppeteer-core";
import type { Theme } from "./model.js";
export declare const CHROME_HEADLESS_SHELL_VERSION: "152.0.7977.75";
interface MermaidBrowserInput {
    readonly source: string;
    readonly elementId: string;
    readonly seed: string;
    readonly theme: Theme;
}
export interface MermaidBrowserOutput {
    readonly svg: string;
    readonly browserVersion: string;
    readonly requests: readonly string[];
}
export declare class MermaidBrowserUnavailableError extends Error {
    constructor(message: string);
}
export declare class MermaidBrowserParseError extends Error {
    constructor(message: string);
}
export declare class BrowserCapabilityError extends Error {
    readonly code = "AZE_CAPABILITY_DENIED";
    constructor(message: string);
}
export declare class MermaidCapabilityError extends BrowserCapabilityError {
    constructor(message: string);
}
export declare function throwIfDeniedBrowserRequest(deniedRequest: string | undefined): void;
interface BrowserCapabilities {
    readonly resolveExecutable: () => string;
    readonly loadMermaidScript: () => Promise<string>;
    readonly loadFontCss: () => Promise<string>;
    readonly launch: (executablePath: string) => Promise<Browser>;
    readonly openPage: (browser: Browser) => Promise<{
        readonly page: Page;
        readonly close: () => Promise<void>;
    }>;
    readonly settleLayout: (page: Page, input: MermaidBrowserInput) => Promise<string>;
}
export declare function resolvePinnedBrowserExecutable(): string;
export declare function launchPinnedBrowser(): Promise<Browser>;
export declare function renderMermaidInBrowser(input: MermaidBrowserInput, capabilities?: BrowserCapabilities): Promise<MermaidBrowserOutput>;
export {};
