import type { Theme } from "./model.js";
export declare const defaultTheme: Theme;
export declare const academicTheme: Theme;
export declare const darkPresentationTheme: Theme;
export declare const builtInThemes: readonly Theme[];
export declare function copyAndFreezeTheme(theme: Theme): Theme;
