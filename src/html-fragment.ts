import { checkSvg } from "./assets.js";
import { isSafeLinkTarget } from "./markdown.js";
import type { ImageInline, Inline, LinkInline } from "./model.js";

export class FragmentSecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FragmentSecurityError";
  }
}

const SAFE_IMAGE_DATA_URL = /^data:image\/(?:png|jpeg|svg\+xml);base64,/i;

function checkedLinkTarget(href: string): string {
  if (!isSafeLinkTarget(href)) {
    throw new FragmentSecurityError(
      "Fragment contains an unsafe link target; refusing to emit.",
    );
  }
  return href;
}

function checkedImageSource(src: string): string {
  const trimmed = src.trim();
  if (SAFE_IMAGE_DATA_URL.test(trimmed)) {
    if (/^data:image\/svg\+xml;/i.test(trimmed)) {
      const payload = trimmed.slice(trimmed.indexOf(",") + 1);
      if (checkSvg(Buffer.from(payload, "base64").toString("utf8")) !== "ok") {
        throw new FragmentSecurityError(
          "Fragment contains an unsafe image source; refusing to emit.",
        );
      }
    }
    return src;
  }
  if (!isSafeLinkTarget(src)) {
    throw new FragmentSecurityError(
      "Fragment contains an unsafe image source; refusing to emit.",
    );
  }
  return src;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function escapeAttribute(value: string): string {
  return escapeHtml(value).replaceAll("'", "&#39;");
}

export function renderInlineHtml(nodes: readonly Inline[]): string {
  return nodes
    .map((node) => {
      switch (node.kind) {
        case "text":
          return escapeHtml(node.value);
        case "emphasis":
          return `<em>${renderInlineHtml(node.children)}</em>`;
        case "strong":
          return `<strong>${renderInlineHtml(node.children)}</strong>`;
        case "code":
          return `<code>${escapeHtml(node.value)}</code>`;
        case "break":
          return "<br>";
        case "link": {
          const link = node as LinkInline;
          const title =
            link.title === undefined ? "" : ` title="${escapeAttribute(link.title)}"`;
          return `<a href="${escapeAttribute(checkedLinkTarget(link.href))}"${title}>${renderInlineHtml(link.children)}</a>`;
        }
        case "image": {
          const image = node as ImageInline;
          const title =
            image.title === undefined ? "" : ` title="${escapeAttribute(image.title)}"`;
          return `<img src="${escapeAttribute(checkedImageSource(image.src))}" alt="${escapeAttribute(image.alt)}"${title}>`;
        }
      }
    })
    .join("");
}
