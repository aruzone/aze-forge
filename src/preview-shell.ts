import { createHash } from "node:crypto";

import { escapeHtml } from "./html-fragment.js";
import type { Diagnostic } from "./model.js";

/**
 * Fixed same-origin reload script injected into the serve preview shell. The
 * exact bytes are part of the preview CSP hash; change them only with a CSP
 * update in lockstep.
 */
export const PREVIEW_SSE_SCRIPT =
  `"use strict";\n` +
  `const source = new EventSource("/events");\n` +
  `source.addEventListener("reload", () => {\n` +
  `  window.location.reload();\n` +
  `});\n`;

export function previewScriptHash(): string {
  return createHash("sha256").update(PREVIEW_SSE_SCRIPT, "utf8").digest("base64");
}

export function previewContentSecurityPolicy(): string {
  return (
    "default-src 'none'; " +
    "style-src 'unsafe-inline'; " +
    "img-src data:; " +
    "font-src data:; " +
    `script-src 'sha256-${previewScriptHash()}'; ` +
    "connect-src http://127.0.0.1:*"
  );
}

const ARTIFACT_CSP_META =
  `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:">`;

function previewCspMeta(): string {
  return `<meta http-equiv="Content-Security-Policy" content="${previewContentSecurityPolicy()}">`;
}

function previewScriptTag(): string {
  return `<script>${PREVIEW_SSE_SCRIPT}</script>`;
}

/**
 * Wrap an immutable HTML Artifact in the unhashable preview shell. The Artifact
 * bytes are never mutated in place: the shell is derived in memory, served
 * only, and never written as an Artifact.
 */
export function wrapPreviewShell(artifactHtml: string): string {
  const withPolicy = artifactHtml.includes(ARTIFACT_CSP_META)
    ? artifactHtml.replace(ARTIFACT_CSP_META, previewCspMeta)
    : artifactHtml;
  const script = previewScriptTag();
  if (withPolicy.includes("</body>")) {
    return withPolicy.replace("</body>", `${script}</body>`);
  }
  return `${withPolicy}${script}`;
}

/** Current-diagnostics page replacing stale preview after a failed cycle. */
export function renderDiagnosticsPage(
  diagnostics: readonly Diagnostic[],
  sourceLabel: string,
): string {
  const items = diagnostics
    .map(
      (diagnostic) =>
        `<li><strong>${escapeHtml(diagnostic.severity)} [${escapeHtml(diagnostic.code)}]</strong> ` +
        `${escapeHtml(diagnostic.message)}${diagnostic.suggestion === undefined ? "" : ` Help: ${escapeHtml(diagnostic.suggestion)}`}</li>`,
    )
    .join("");
  return (
    `<!doctype html>\n` +
    `<html lang="und"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `${previewCspMeta()}` +
    `<title>AzeForge preview diagnostics</title>` +
    `<style>*{box-sizing:border-box}body{margin:0;font-family:sans-serif}main{max-width:800px;margin:0 auto;padding:24px}</style>` +
    `</head><body>${previewScriptTag()}<main><article>` +
    `<h1>Preview diagnostics for ${escapeHtml(sourceLabel)}</h1>` +
    `<p>The Source did not compile. The last successful preview was replaced by these current diagnostics.</p>` +
    `<ul>${items}</ul>` +
    `</article></main></body></html>\n`
  );
}


/** Transient first paint before the initial compile settles; reloads via SSE. */
export function renderStartingPage(sourceLabel: string): string {
  return (
    `<!doctype html>\n` +
    `<html lang="und"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `${previewCspMeta()}` +
    `<title>AzeForge preview</title>` +
    `<style>*{box-sizing:border-box}body{margin:0;font-family:sans-serif}main{max-width:800px;margin:0 auto;padding:24px}</style>` +
    `</head><body>${previewScriptTag()}<main><article>` +
    `<h1>Compiling ${escapeHtml(sourceLabel)}</h1>` +
    `<p>The preview appears automatically once the initial compile settles.</p>` +
    `</article></main></body></html>\n`
  );
}
export interface PreviewAsset {
  readonly token: string;
  readonly mediaType: string;
  readonly bytes: Uint8Array;
}

/**
 * Snapshot the project images embedded in an HTML Artifact as opaque
 * content-addressed assets. Tokens are byte hashes, never project paths.
 */
export function extractServedAssets(artifactHtml: string): PreviewAsset[] {
  const pattern = /data:(image\/png|image\/jpeg|image\/svg\+xml);base64,([A-Za-z0-9+/]+=*)/g;
  const assets = new Map<string, PreviewAsset>();
  for (let match = pattern.exec(artifactHtml); match !== null; match = pattern.exec(artifactHtml)) {
    const mediaType = match[1] ?? "";
    const payload = match[2] ?? "";
    let bytes: Buffer;
    try {
      bytes = Buffer.from(payload, "base64");
    } catch {
      continue;
    }
    if (bytes.byteLength === 0) continue;
    const token = createHash("sha256").update(bytes).digest("hex");
    if (!assets.has(token)) assets.set(token, { token, mediaType, bytes });
  }
  return [...assets.values()];
}
