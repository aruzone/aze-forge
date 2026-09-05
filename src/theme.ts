import type { Theme } from "./model.js";

export const defaultTheme: Theme = Object.freeze({
  id: "default",
  version: "1.0.0",
  title: "Default",
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

export function copyAndFreezeTheme(theme: Theme): Theme {
  return Object.freeze({
    id: theme.id,
    version: theme.version,
    title: theme.title,
    colors: Object.freeze({ ...theme.colors }),
    typography: Object.freeze({ ...theme.typography }),
    geometry: Object.freeze({ ...theme.geometry }),
  });
}
