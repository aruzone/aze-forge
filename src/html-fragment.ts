import type { ImageInline, Inline, LinkInline } from "./model.js";

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
          return `<a href="${escapeAttribute(link.href)}"${title}>${renderInlineHtml(link.children)}</a>`;
        }
        case "image": {
          const image = node as ImageInline;
          const title =
            image.title === undefined ? "" : ` title="${escapeAttribute(image.title)}"`;
          return `<img src="${escapeAttribute(image.src)}" alt="${escapeAttribute(image.alt)}"${title}>`;
        }
      }
    })
    .join("");
}
