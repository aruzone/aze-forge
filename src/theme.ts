import type { Theme } from "./model.js";

export const defaultTheme: Theme = Object.freeze({
  id: "default",
  version: "1.0.0",
  title: "Default",
  colorScheme: "light",
  colors: Object.freeze({
    background: "#ffffff",
    foreground: "#171717",
    muted: "#5f6368",
  }),
  typography: Object.freeze({
    proseFontFamily: "Inter",
    bodyFontWeight: 400,
    headingFontWeight: 700,
    lineHeight: 1.6,
    headingLineHeight: 1.2,
    paragraphSpacingEm: 1,
  }),
  geometry: Object.freeze({
    canvasWidthPx: 960,
    contentWidthPx: 800,
    paddingPx: 48,
  }),
});

export const academicTheme: Theme = Object.freeze({
  id: "academic",
  version: "1.0.0",
  title: "Academic",
  colorScheme: "light",
  colors: Object.freeze({
    background: "#fdfcf9",
    foreground: "#1c1917",
    muted: "#78716c",
  }),
  typography: Object.freeze({
    proseFontFamily: "Inter",
    bodyFontWeight: 400,
    headingFontWeight: 700,
    lineHeight: 1.7,
    headingLineHeight: 1.3,
    paragraphSpacingEm: 1.1,
  }),
  geometry: Object.freeze({
    canvasWidthPx: 880,
    contentWidthPx: 700,
    paddingPx: 56,
  }),
});

export const darkPresentationTheme: Theme = Object.freeze({
  id: "dark-presentation",
  version: "1.0.0",
  title: "Dark Presentation",
  colorScheme: "dark",
  colors: Object.freeze({
    background: "#0f172a",
    foreground: "#e2e8f0",
    muted: "#94a3b8",
  }),
  typography: Object.freeze({
    proseFontFamily: "Inter",
    bodyFontWeight: 400,
    headingFontWeight: 700,
    lineHeight: 1.5,
    headingLineHeight: 1.2,
    paragraphSpacingEm: 1,
  }),
  geometry: Object.freeze({
    canvasWidthPx: 1280,
    contentWidthPx: 1024,
    paddingPx: 64,
  }),
});

export const builtInThemes: readonly Theme[] = Object.freeze([
  defaultTheme,
  academicTheme,
  darkPresentationTheme,
]);

export function copyAndFreezeTheme(theme: Theme): Theme {
  return Object.freeze({
    id: theme.id,
    version: theme.version,
    title: theme.title,
    colorScheme: theme.colorScheme,
    colors: Object.freeze({ ...theme.colors }),
    typography: Object.freeze({ ...theme.typography }),
    geometry: Object.freeze({ ...theme.geometry }),
  });
}
