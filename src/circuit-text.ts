/**
 * The shared CircuitText inline vocabulary (language contract #52 §7, Circuit
 * contract #62 §7): plain runs plus `_…` subscript and `^…` superscript runs
 * with `{…}` grouping and doubled braces literal. The inherited bans hold
 * here too: line breaks, control characters, and the Markdown/HTML/TeX
 * metacharacters `<`, `>`, backtick and backslash are outside the vocabulary.
 *
 * The vocabulary is shared by the families that quote engineering text; each
 * family supplies its own diagnostic codes, so this module owns only the
 * scan and never a message.
 */

import type { CircuitText, CircuitTextRun } from "./model.js";

export interface ParseCircuitTextOptions {
  /** One authored field value, already trimmed of the field's own syntax. */
  readonly raw: string;
  /** Code-point ceiling for the whole field. */
  readonly limit: number;
  /** The family's `invalid-label` diagnostic. */
  readonly invalid: (message: string) => void;
  /** The family's `limit-exceeded` diagnostic for the field's code points. */
  readonly exceeded: (count: number) => void;
}

function codePoints(value: string): number {
  return [...value].length;
}

/** A `_`/`^` payload: one unbraced run, or a `{…}` group with doubled braces literal. */
function scriptPayload(
  raw: string,
  index: number,
  invalid: (message: string) => void,
): { readonly value: string; readonly next: number } | undefined {
  if (raw[index] !== "{") {
    let end = index;
    while (end < raw.length && !/[_^{}]/.test(raw[end] ?? "")) end += 1;
    if (end === index) {
      invalid("Script runs must have content.");
      return undefined;
    }
    return { value: raw.slice(index, end), next: end };
  }
  let cursor = index + 1;
  let value = "";
  while (cursor < raw.length) {
    const character = raw[cursor] ?? "";
    if (character === "}") {
      if (raw[cursor + 1] === "}") {
        value += "}";
        cursor += 2;
        continue;
      }
      if (value === "") {
        invalid("Script runs must have content.");
        return undefined;
      }
      return { value, next: cursor + 1 };
    }
    if (character === "{") {
      invalid("Script runs do not nest.");
      return undefined;
    }
    value += character;
    cursor += 1;
  }
  invalid("Inline text has an unclosed script run.");
  return undefined;
}

/**
 * Parse one bounded inline text field into runs. Returns `undefined` after
 * pushing exactly one diagnostic, so the caller reports nothing twice.
 */
export function parseCircuitText(
  options: ParseCircuitTextOptions,
): CircuitText | undefined {
  const { raw, limit, invalid, exceeded } = options;
  if (raw.length === 0 || /[\r\n\x00-\x1f\x7f]|[<>`\\]/.test(raw)) {
    invalid("Text must be non-empty plain inline text.");
    return undefined;
  }
  if (codePoints(raw) > limit) {
    exceeded(codePoints(raw));
    return undefined;
  }
  const runs: CircuitTextRun[] = [];
  let index = 0;
  while (index < raw.length) {
    const marker = raw[index];
    if (marker === "_" || marker === "^") {
      const payload = scriptPayload(raw, index + 1, invalid);
      if (payload === undefined) return undefined;
      runs.push({
        kind: marker === "_" ? "subscript" : "superscript",
        value: payload.value,
      });
      index = payload.next;
      continue;
    }
    let end = index;
    while (end < raw.length && raw[end] !== "_" && raw[end] !== "^") end += 1;
    runs.push({ kind: "text", value: raw.slice(index, end) });
    index = end;
  }
  return runs;
}

/** Flattened text of a parsed run list; used for accessibility and identity. */
export function circuitTextValue(text: CircuitText): string {
  return text
    .map((run) =>
      run.kind === "quantity" ? `${run.coefficient}${run.prefix}${run.unit}` : run.value,
    )
    .join("");
}
