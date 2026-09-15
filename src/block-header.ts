import { createDiagnostic } from "./diagnostics.js";
import type { Diagnostic, Inline, JsonValue, SourceRange } from "./model.js";

/**
 * Shared header-field handling for the composition-owned directive kinds
 * (contract: issue #67 §2). `id`, `number` and `caption` register on every
 * kind that has not already resolved a caption-equivalent field; the owning
 * kind declares its remaining header keys through `known`.
 */
export interface HeaderEntry {
  readonly key: string;
  readonly value: string;
  readonly range: SourceRange;
}

export interface CompositionHeader {
  readonly id?: string;
  readonly number?: boolean;
  readonly caption?: readonly Inline[];
  /** The remaining declared header keys, keyed by name. */
  readonly extra: Readonly<Record<string, string>>;
  readonly diagnostics: readonly Diagnostic[];
}

export interface CompositionHeaderOptions {
  readonly namespace: string;
  readonly known: readonly string[];
  /** A `caption:` failure is the owning kind's core diagnostic when omitted. */
  readonly parseCaption: (
    text: string,
    range: SourceRange,
  ) => readonly Inline[] | undefined;
  readonly summary?: string;
}

function headerDiagnostic(
  namespace: string,
  code: string,
  message: string,
  range: SourceRange,
  sourceName: string | undefined,
  extra: {
    readonly suggestion?: string;
    readonly data?: Readonly<Record<string, JsonValue>>;
  } = {},
): Diagnostic {
  return createDiagnostic(`${namespace}#${code}`, "error", message, {
    location:
      sourceName === undefined ? { range } : { source: sourceName, range },
    ...(extra.suggestion === undefined ? {} : { suggestion: extra.suggestion }),
    ...(extra.data === undefined ? {} : { data: extra.data }),
  });
}

export function parseCompositionHeader(
  entries: readonly HeaderEntry[],
  sourceName: string | undefined,
  options: CompositionHeaderOptions,
): CompositionHeader {
  const diagnostics: Diagnostic[] = [];
  const extra: Record<string, string> = {};
  let id: string | undefined;
  let number: boolean | undefined;
  let caption: readonly Inline[] | undefined;

  for (const entry of entries) {
    if (entry.key === "id") {
      id = entry.value;
      continue;
    }
    if (entry.key === "number") {
      if (entry.value !== "true" && entry.value !== "false") {
        diagnostics.push(
          headerDiagnostic(
            options.namespace,
            "invalid-attribute",
            `Header attribute number must be true or false.`,
            entry.range,
            sourceName,
            { data: { attribute: "number", value: entry.value } },
          ),
        );
        continue;
      }
      number = entry.value === "true";
      continue;
    }
    if (entry.key === "caption") {
      if (entry.value.trim().length === 0) {
        diagnostics.push(
          headerDiagnostic(
            options.namespace,
            "empty-caption",
            "A caption must not be empty.",
            entry.range,
            sourceName,
          ),
        );
        continue;
      }
      const nodes = options.parseCaption(entry.value, entry.range);
      if (nodes === undefined) return { extra, diagnostics };
      caption = nodes;
      continue;
    }
    if (options.known.includes(entry.key)) {
      extra[entry.key] = entry.value;
      continue;
    }
    diagnostics.push(
      headerDiagnostic(
        options.namespace,
        "unknown-header",
        `Header key "${entry.key}" is not supported.`,
        entry.range,
        sourceName,
        {
          data: { key: entry.key },
          suggestion: `Use ${["id", "number", "caption", ...options.known].join(", ")}.`,
        },
      ),
    );
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
