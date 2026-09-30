import type { Theme } from "./model.js";
export declare const defaultTheme: Theme;
export declare const academicTheme: Theme;
export declare const darkPresentationTheme: Theme;
export declare const builtInThemes: readonly Theme[];
/**
 * The layout dimensions an Artifact reports. Named explicitly so a Theme's
 * colour tokens never leak into the capacity report.
 */
export declare function cssDimensionsOf(theme: Theme): {
    canvasWidthPx: number;
    contentWidthPx: number;
    paddingPx: number;
};
export declare function copyAndFreezeTheme(theme: Theme): Theme;
