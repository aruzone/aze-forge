import { checkSvg } from "./assets.js";
import { isSafeLinkTarget } from "./markdown.js";
export class FragmentSecurityError extends Error {
    constructor(message) {
        super(message);
        this.name = "FragmentSecurityError";
    }
}
const SAFE_IMAGE_DATA_URL = /^data:image\/(?:png|jpeg|svg\+xml);base64,/i;
function checkedLinkTarget(href) {
    if (!isSafeLinkTarget(href)) {
        throw new FragmentSecurityError("Fragment contains an unsafe link target; refusing to emit.");
    }
    return href;
}
function checkedImageSource(src) {
    const trimmed = src.trim();
    if (SAFE_IMAGE_DATA_URL.test(trimmed)) {
        if (/^data:image\/svg\+xml;/i.test(trimmed)) {
            const payload = trimmed.slice(trimmed.indexOf(",") + 1);
            if (checkSvg(Buffer.from(payload, "base64").toString("utf8")) !== "ok") {
                throw new FragmentSecurityError("Fragment contains an unsafe image source; refusing to emit.");
            }
        }
        return src;
    }
    if (!isSafeLinkTarget(src)) {
        throw new FragmentSecurityError("Fragment contains an unsafe image source; refusing to emit.");
    }
    return src;
}
export function escapeHtml(value) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}
export function escapeAttribute(value) {
    return escapeHtml(value).replaceAll("'", "&#39;");
}
/**
 * The versioned built-in numbering label. The Theme owns display words,
 * number punctuation and placement (contract: issue #67 §13).
 */
export function numberingLabelHtml(label) {
    if (label === undefined || label === "")
        return "";
    return `<span class="aze-number">${escapeHtml(label)}</span> `;
}
export function renderInlineHtml(nodes) {
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
                const link = node;
                const title = link.title === undefined ? "" : ` title="${escapeAttribute(link.title)}"`;
                return `<a href="${escapeAttribute(checkedLinkTarget(link.href))}"${title}>${renderInlineHtml(link.children)}</a>`;
            }
            case "image": {
                const image = node;
                const title = image.title === undefined ? "" : ` title="${escapeAttribute(image.title)}"`;
                return `<img src="${escapeAttribute(checkedImageSource(image.src))}" alt="${escapeAttribute(image.alt)}"${title}>`;
            }
            // A reference is always an `<a>` to its target's anchor; only an
            // errored Document could leave `resolved` unset, and errors gate
            // rendering (contract: issue #67 §10).
            case "reference": {
                const label = node.resolved?.label ?? node.target;
                const href = node.resolved?.href;
                if (href === undefined)
                    return escapeHtml(label);
                return `<a class="aze-reference" href="${escapeAttribute(href)}">${escapeHtml(label)}</a>`;
            }
            case "referenceGroup": {
                const group = node.resolved;
                if (group === undefined) {
                    return escapeHtml(node.targets.map((target) => target.target).join("; "));
                }
                const inner = node.targets
                    .map((target) => renderInlineHtml([target]))
                    .join(escapeHtml(group.separator));
                return `<span class="aze-citation-group">${escapeHtml(group.open)}${inner}${escapeHtml(group.close)}</span>`;
            }
            case "footnote": {
                const resolved = node.resolved;
                if (resolved === undefined)
                    return "";
                return `<sup id="fnref-${escapeAttribute(node.label)}-${resolved.marker}" class="aze-footnote-ref"><a href="${escapeAttribute(resolved.href)}" role="doc-noteref">${resolved.number}</a></sup>`;
            }
        }
    })
        .join("");
}
//# sourceMappingURL=html-fragment.js.map