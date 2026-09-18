import { createDiagnostic } from "./diagnostics.js";
function headerDiagnostic(namespace, code, message, range, sourceName, extra = {}) {
    return createDiagnostic(`${namespace}#${code}`, "error", message, {
        location: sourceName === undefined ? { range } : { source: sourceName, range },
        ...(extra.suggestion === undefined ? {} : { suggestion: extra.suggestion }),
        ...(extra.data === undefined ? {} : { data: extra.data }),
    });
}
export function parseCompositionHeader(entries, sourceName, options) {
    const diagnostics = [];
    const extra = {};
    let id;
    let number;
    let caption;
    for (const entry of entries) {
        if (entry.key === "id") {
            id = entry.value;
            continue;
        }
        if (entry.key === "number") {
            if (entry.value !== "true" && entry.value !== "false") {
                diagnostics.push(headerDiagnostic(options.namespace, "invalid-attribute", `Header attribute number must be true or false.`, entry.range, sourceName, { data: { attribute: "number", value: entry.value } }));
                continue;
            }
            number = entry.value === "true";
            continue;
        }
        if (entry.key === "caption") {
            if (entry.value.trim().length === 0) {
                diagnostics.push(headerDiagnostic(options.namespace, "empty-caption", "A caption must not be empty.", entry.range, sourceName));
                continue;
            }
            const nodes = options.parseCaption(entry.value, entry.range);
            if (nodes === undefined)
                return { extra, diagnostics };
            caption = nodes;
            continue;
        }
        if (options.known.includes(entry.key)) {
            extra[entry.key] = entry.value;
            continue;
        }
        diagnostics.push(headerDiagnostic(options.namespace, "unknown-header", `Header key "${entry.key}" is not supported.`, entry.range, sourceName, {
            data: { key: entry.key },
            suggestion: `Use ${["id", "number", "caption", ...options.known].join(", ")}.`,
        }));
        return { extra, diagnostics };
    }
    return {
        extra,
        diagnostics,
        ...(id === undefined || id === "" ? {} : { id }),
        ...(number === undefined ? {} : { number }),
        ...(caption === undefined ? {} : { caption }),
    };
}
//# sourceMappingURL=block-header.js.map