/**
 * Native digital timing family (contract: issue #63 "Define native digital
 * timing semantics and authoring").
 *
 * One `:::: timing` Block carries a single scale — an integer cycle grid
 * starting at zero, or an exact-decimal duration axis in the Block unit.
 * Signals are ordered interval lists over that scale; bus values, groups,
 * markers and arrows are authored display facts. Nothing here evaluates
 * setup, hold or any other timing behavior: arrows and markers describe.
 *
 * Diagnostics posture: the family registers no warnings. Every unsupported
 * or contradictory declaration is an error, and every valid declaration
 * renders.
 */
import { canonicalDecimal } from "./plot.js";
import { createDiagnostic } from "./diagnostics.js";
import { TIMING_BODY_SYNTAX_ID, TIMING_BODY_SYNTAX_VERSION, TIMING_PLUGIN_TYPE, TIMING_PLUGIN_VERSION, timingDataSchema, timingSourceSchema, } from "./timing-schemas.js";
export const MAX_TIMING_SIGNALS = 32;
export const MAX_TIMING_INTERVALS = 256;
export const MAX_TIMING_TOTAL_INTERVALS = 2048;
export const MAX_TIMING_GROUPS = 16;
export const MAX_TIMING_GROUP_DEPTH = 2;
export const MAX_TIMING_MARKERS = 32;
export const MAX_TIMING_ARROWS = 32;
export const MAX_TIMING_WAVE_CHARS = 1024;
export const MAX_TIMING_TEXT_CODE_POINTS = 32;
export const MAX_TIMING_RUN_CODE_POINTS = 256;
export const MAX_TIMING_LABEL_CODE_POINTS = 4096;
export const MAX_TIMING_SPAN = 512;
export const MAX_TIMING_WIDTH = 64;
const NAMESPACE = "azeforge.timing";
const NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const FIELD = /^[ \t]*([A-Za-z][A-Za-z0-9-]*)[ \t]*:(.*)$/;
const ITEM = /^[ \t]*-[ \t]*(.*)$/;
const ENTRY = /^[ \t]*([A-Za-z][A-Za-z0-9-]*)[ \t]*:[ \t]*(.*)$/;
const COMMENT = /^[ \t]*\/\/(?:[ \t].*)?$/;
export const HEADER_FIELDS = Object.freeze(["id", "number", "title", "description", "scale", "unit"]);
export const SIGNAL_FIELDS = Object.freeze(["ref", "clock", "phase", "width", "wave", "intervals"]);
/** The body record kinds a timing body accepts, in dispatch order. */
export const TIMING_BODY_KINDS = Object.freeze(["signal", "group", "marker", "arrow"]);
export const GROUP_FIELDS = Object.freeze(["label", "signals"]);
export const MARKER_FIELDS = Object.freeze(["at", "label"]);
export const ARROW_FIELDS = Object.freeze(["from", "to", "label"]);
export const INTERVAL_FIELDS = Object.freeze(["state", "duration", "value"]);
export const TIME_UNITS = Object.freeze(["ns", "µs", "ms", "s"]);
/** Accepted `scale:` spellings, the vocabulary the block validator enforces. */
export const SCALE_WORDS = Object.freeze(["cycles", "time"]);
export const STATE_WORDS = Object.freeze({
    low: "low",
    high: "high",
    unknown: "unknown",
    impedance: "impedance",
    bus: "bus",
    continue: "continue",
    rise: "rise",
    fall: "fall",
});
const STATE_CHARACTERS = Object.freeze({
    "0": "low",
    "1": "high",
    x: "unknown",
    z: "impedance",
    "=": "bus",
    ".": "continue",
    p: "rise",
    n: "fall",
});
function diag(code, message, range, sourceName, data) {
    return createDiagnostic(`${NAMESPACE}#${code}`, "error", message, {
        location: sourceName === undefined ? { range } : { source: sourceName, range },
        ...(data === undefined ? {} : { data }),
    });
}
function limitExceeded(subject, count, limit, range, sourceName) {
    return diag("limit-exceeded", `Timing ${subject} ${count} exceeds ${limit}.`, range, sourceName, { subject, count, limit });
}
function codePoints(value) {
    return [...value].length;
}
/* ------------------------------------------------------------------ *
 * CircuitText inline subset (plain runs, `_`/`^` scripts, `{…}`
 * grouping, doubled braces literal)
 * ------------------------------------------------------------------ */
function scriptPayload(raw, index, range, sourceName, diagnostics) {
    if (raw[index] !== "{") {
        let end = index;
        while (end < raw.length && !/[_^{}]/.test(raw[end] ?? ""))
            end += 1;
        if (end === index) {
            diagnostics.push(diag("invalid-text", "Timing script runs must have content.", range, sourceName));
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
                diagnostics.push(diag("invalid-text", "Timing script runs must have content.", range, sourceName));
                return undefined;
            }
            return { value, next: cursor + 1 };
        }
        if (character === "{") {
            diagnostics.push(diag("invalid-text", "Timing script runs do not nest.", range, sourceName));
            return undefined;
        }
        value += character;
        cursor += 1;
    }
    diagnostics.push(diag("invalid-text", "Timing inline text has an unclosed script run.", range, sourceName));
    return undefined;
}
/**
 * Parse one bounded inline text field. Timing text carries plain runs and
 * `_`/`^` scripts only: no quantities, no Markdown, no HTML.
 */
function inlineText(raw, range, sourceName, diagnostics, limit = MAX_TIMING_TEXT_CODE_POINTS) {
    if (raw.length === 0 || /[\r\n\x00-\x1f\x7f]/.test(raw)) {
        diagnostics.push(diag("invalid-text", "Timing text must be non-empty plain inline text.", range, sourceName));
        return undefined;
    }
    if (codePoints(raw) > limit) {
        diagnostics.push(limitExceeded("text code points", codePoints(raw), limit, range, sourceName));
        return undefined;
    }
    const runs = [];
    let index = 0;
    while (index < raw.length) {
        const marker = raw[index];
        if (marker === "_" || marker === "^") {
            const payload = scriptPayload(raw, index + 1, range, sourceName, diagnostics);
            if (payload === undefined)
                return undefined;
            runs.push({ kind: marker === "_" ? "subscript" : "superscript", value: payload.value });
            index = payload.next;
            continue;
        }
        let end = index;
        while (end < raw.length && raw[end] !== "_" && raw[end] !== "^")
            end += 1;
        runs.push({ kind: "text", value: raw.slice(index, end) });
        index = end;
    }
    if (runs.some((run) => run.kind !== "quantity" && codePoints(run.value) > MAX_TIMING_RUN_CODE_POINTS)) {
        diagnostics.push(limitExceeded("text run code points", MAX_TIMING_RUN_CODE_POINTS + 1, MAX_TIMING_RUN_CODE_POINTS, range, sourceName));
        return undefined;
    }
    return runs;
}
function leadingIndent(text) {
    let indent = 0;
    for (const character of text) {
        if (character === " ")
            indent += 1;
        else if (character === "\t")
            return undefined;
        else
            return indent;
    }
    return indent;
}
const BODY_SHAPE = "Timing body entries begin with `- kind:` and use flat `key: value` fields.";
function parseBody(lines, diagnostics, sourceName) {
    const items = [];
    let current;
    let record;
    /** Indent of the item field that opened the active collection, if any. */
    let collectionIndent;
    let recordIndent = 0;
    for (const line of lines) {
        if (/^[ \t]*$/.test(line.text) || COMMENT.test(line.text))
            continue;
        const indent = leadingIndent(line.text);
        if (indent === undefined) {
            diagnostics.push(diag("unknown-declaration", "Timing declarations indent with spaces only.", line.range, sourceName));
            continue;
        }
        const item = ITEM.exec(line.text);
        if (item !== null) {
            const entry = ENTRY.exec((item[1] ?? "").trim());
            if (indent === 0) {
                if (entry === null || entry[1].toLowerCase() !== "kind") {
                    diagnostics.push(diag("unknown-declaration", BODY_SHAPE, line.range, sourceName));
                    continue;
                }
                current = { kind: (entry[2] ?? "").trim().toLowerCase(), range: line.range, fields: [], records: [] };
                items.push(current);
                record = undefined;
                collectionIndent = undefined;
                continue;
            }
            if (current === undefined || collectionIndent === undefined || indent <= collectionIndent || entry === null) {
                diagnostics.push(diag("unknown-declaration", "Timing collection records nest as `- key: value` under a collection field.", line.range, sourceName));
                continue;
            }
            record = { range: line.range, fields: [{ key: entry[1].toLowerCase(), value: (entry[2] ?? "").trim(), range: line.range }] };
            current.records.push(record);
            recordIndent = indent;
            continue;
        }
        const field = FIELD.exec(line.text);
        if (field === null || current === undefined) {
            diagnostics.push(diag("unknown-declaration", BODY_SHAPE, line.range, sourceName));
            continue;
        }
        const key = (field[1] ?? "").toLowerCase();
        const value = (field[2] ?? "").trim();
        if (record !== undefined && indent > recordIndent) {
            if (record.fields.some((entry) => entry.key === key)) {
                diagnostics.push(diag("duplicate-field", `Timing field "${key}" is declared twice.`, line.range, sourceName));
                continue;
            }
            record.fields.push({ key, value, range: line.range });
            continue;
        }
        record = undefined;
        collectionIndent = value === "" ? indent : undefined;
        if (current.fields.some((entry) => entry.key === key)) {
            diagnostics.push(diag("duplicate-field", `Timing field "${key}" is declared twice.`, line.range, sourceName));
            continue;
        }
        current.fields.push({ key, value, range: line.range });
    }
    return items;
}
function allowedFields(fields, registered, owner, sourceName, diagnostics) {
    for (const field of fields) {
        if (!registered.includes(field.key)) {
            diagnostics.push(diag("unknown-field", `Timing ${owner} field "${field.key}" is not supported.`, field.range, sourceName));
        }
    }
}
/* ------------------------------------------------------------------ *
 * Waveforms
 * ------------------------------------------------------------------ */
/**
 * Parse one bounded wave domain string.
 *
 * Grammar: a sequence of intervals, each an optional 1–3 digit count plus one
 * state character. `0` and `1` are both digits and states, so the reading is
 * fixed by the character that follows a maximal digit run: a run followed by
 * a non-digit state character is a count, while a run that ends the string is
 * a run of single-cycle `0`/`1` states (`1010` is high-low-high-low, `2p2n` is
 * two cycles of rise then two of fall).
 */
function parseWave(raw, range, sourceName, diagnostics) {
    if (codePoints(raw) > MAX_TIMING_WAVE_CHARS) {
        diagnostics.push(limitExceeded("wave code points", codePoints(raw), MAX_TIMING_WAVE_CHARS, range, sourceName));
        return [];
    }
    if (/\s/.test(raw)) {
        diagnostics.push(diag("invalid-wave", "Timing wave strings must be whitespace-free.", range, sourceName));
        return [];
    }
    const intervals = [];
    let index = 0;
    while (index < raw.length) {
        let digits = "";
        while (/[0-9]/.test(raw[index] ?? ""))
            digits += raw[index++];
        const character = raw[index];
        if (digits === "") {
            if (character === undefined)
                break;
            const state = STATE_CHARACTERS[character];
            if (state === undefined) {
                diagnostics.push(diag("invalid-wave", "Timing wave has an invalid interval.", range, sourceName));
                return [];
            }
            index += 1;
            if (state === "bus" && raw[index] === "{") {
                const closed = busValue(raw, index, range, sourceName, diagnostics);
                if (closed === undefined)
                    return [];
                index = closed.next;
                intervals.push({ count: "1", state, value: closed.value });
                continue;
            }
            intervals.push({ count: "1", state });
            continue;
        }
        if (character === undefined) {
            for (const digit of digits) {
                if (digit !== "0" && digit !== "1") {
                    diagnostics.push(diag("invalid-wave", "Timing wave has an invalid interval.", range, sourceName));
                    return [];
                }
                intervals.push({ count: "1", state: digit === "0" ? "low" : "high" });
            }
            break;
        }
        if (digits.length > 3 || digits === "0") {
            diagnostics.push(diag("invalid-wave", "Timing wave has an invalid interval.", range, sourceName));
            return [];
        }
        if (character === "=" && raw[index + 1] === "{") {
            const closed = busValue(raw, index + 1, range, sourceName, diagnostics);
            if (closed === undefined)
                return [];
            index = closed.next;
            intervals.push({ count: digits, state: "bus", value: closed.value });
            continue;
        }
        if (STATE_CHARACTERS[character] === undefined) {
            diagnostics.push(diag("invalid-wave", "Timing wave has an invalid interval.", range, sourceName));
            return [];
        }
        index += 1;
        intervals.push({ count: digits, state: STATE_CHARACTERS[character] });
    }
    if (intervals[0]?.state === "continue") {
        diagnostics.push(diag("invalid-wave", "The first timing interval may not continue.", range, sourceName));
        return [];
    }
    return intervals;
}
function busValue(raw, braceIndex, range, sourceName, diagnostics) {
    const end = raw.indexOf("}", braceIndex + 1);
    if (end < 0) {
        diagnostics.push(diag("invalid-wave", "Timing bus value is unclosed.", range, sourceName));
        return undefined;
    }
    const value = inlineText(raw.slice(braceIndex + 1, end), range, sourceName, diagnostics);
    if (value === undefined)
        return undefined;
    return { value, next: end + 1 };
}
function parseIntervals(item, sourceName, diagnostics) {
    if (item.records.length === 0) {
        diagnostics.push(diag("missing-field", "A time-scale timing signal requires an `intervals:` collection.", item.range, sourceName));
        return [];
    }
    const intervals = [];
    for (const record of item.records) {
        allowedFields(record.fields, INTERVAL_FIELDS, "interval", sourceName, diagnostics);
        const state = record.fields.find((field) => field.key === "state");
        const duration = record.fields.find((field) => field.key === "duration");
        const value = record.fields.find((field) => field.key === "value");
        if (state === undefined || duration === undefined) {
            diagnostics.push(diag("missing-field", "Timing intervals require `state:` and `duration:`.", record.range, sourceName));
            continue;
        }
        const resolved = STATE_WORDS[state.value];
        if (resolved === undefined) {
            diagnostics.push(diag("invalid-interval", `Timing interval state "${state.value}" is not registered.`, state.range, sourceName));
            continue;
        }
        const canonical = canonicalDecimal(duration.value);
        if (canonical === undefined || canonical.startsWith("-") || canonical === "0") {
            diagnostics.push(diag("invalid-interval", "Timing interval durations must be positive exact decimals.", duration.range, sourceName));
            continue;
        }
        let text;
        if (value !== undefined) {
            if (resolved !== "bus") {
                diagnostics.push(diag("invalid-interval", "Only bus intervals carry `value:`.", value.range, sourceName));
                continue;
            }
            text = inlineText(value.value, value.range, sourceName, diagnostics);
            if (text === undefined)
                continue;
        }
        intervals.push({ duration: canonical, state: resolved, ...(text === undefined ? {} : { value: text }) });
    }
    if (intervals[0]?.state === "continue") {
        diagnostics.push(diag("invalid-interval", "The first timing interval may not continue.", item.range, sourceName));
        return [];
    }
    return intervals;
}
function intervalSpan(interval) {
    return Number(interval.count ?? interval.duration ?? "0");
}
export function validateTimingBlock(options) {
    const { headerLines, bodyLines, blockRange, sourceName } = options;
    const diagnostics = [];
    const header = new Map();
    for (const line of headerLines) {
        if (/^[ \t]*$/.test(line.text) || COMMENT.test(line.text))
            continue;
        const match = FIELD.exec(line.text);
        if (match === null) {
            diagnostics.push(diag("unknown-field", "Timing header entries must be `key: value` fields.", line.range, sourceName));
            continue;
        }
        const key = (match[1] ?? "").toLowerCase();
        if (header.has(key)) {
            diagnostics.push(diag("duplicate-field", `Timing header field "${key}" is declared twice.`, line.range, sourceName));
            continue;
        }
        header.set(key, { key, value: (match[2] ?? "").trim(), range: line.range });
    }
    allowedFields([...header.values()], HEADER_FIELDS, "header", sourceName, diagnostics);
    let labelCodePoints = 0;
    const titleLine = header.get("title");
    const title = titleLine === undefined
        ? (diagnostics.push(diag("missing-field", "Timing header requires `title:`.", blockRange, sourceName)), undefined)
        : inlineText(titleLine.value, titleLine.range, sourceName, diagnostics, MAX_TIMING_LABEL_CODE_POINTS);
    if (titleLine !== undefined)
        labelCodePoints += codePoints(titleLine.value);
    const descriptionLine = header.get("description");
    const description = descriptionLine === undefined
        ? undefined
        : inlineText(descriptionLine.value, descriptionLine.range, sourceName, diagnostics, MAX_TIMING_LABEL_CODE_POINTS);
    if (descriptionLine !== undefined)
        labelCodePoints += codePoints(descriptionLine.value);
    const idLine = header.get("id");
    const id = idLine?.value;
    if (id !== undefined && !NAME.test(id)) {
        diagnostics.push(diag("invalid-id", "Timing id must be lowercase-kebab.", idLine.range, sourceName));
    }
    const numberLine = header.get("number");
    const number = numberLine === undefined
        ? undefined
        : numberLine.value === "true"
            ? true
            : numberLine.value === "false"
                ? false
                : (diagnostics.push(diag("invalid-field", "Timing `number:` must be true or false.", numberLine.range, sourceName)), undefined);
    const scaleLine = header.get("scale");
    const scaleText = scaleLine?.value ?? "cycles";
    if (!SCALE_WORDS.includes(scaleText)) {
        diagnostics.push(diag("invalid-field", "Timing `scale:` must be cycles or time.", scaleLine?.range ?? blockRange, sourceName));
    }
    const scale = scaleText === "time" ? "time" : "cycles";
    const unitLine = header.get("unit");
    const unit = unitLine?.value;
    if (scale === "time") {
        if (unit === undefined) {
            diagnostics.push(diag("missing-field", "Time-scale timing requires `unit:`.", unitLine?.range ?? scaleLine?.range ?? blockRange, sourceName));
        }
        else if (!TIME_UNITS.includes(unit)) {
            diagnostics.push(diag("invalid-field", `Timing unit "${unit}" is not registered.`, unitLine?.range ?? blockRange, sourceName));
        }
    }
    else if (unit !== undefined) {
        diagnostics.push(diag("invalid-field", "Timing `unit:` is only valid with `scale: time`.", unitLine?.range ?? blockRange, sourceName));
    }
    const raws = parseBody(bodyLines, diagnostics, sourceName);
    const signals = [];
    const signalRefs = new Map();
    const groups = [];
    const markers = [];
    const arrows = [];
    let totalIntervals = 0;
    let span = 0;
    for (const item of raws) {
        if (!TIMING_BODY_KINDS.includes(item.kind)) {
            diagnostics.push(diag("unknown-declaration", `Unknown timing declaration "${item.kind}".`, item.range, sourceName));
            continue;
        }
        if (item.kind === "signal") {
            allowedFields(item.fields, SIGNAL_FIELDS, "signal", sourceName, diagnostics);
            const get = (key) => item.fields.find((field) => field.key === key);
            const refField = get("ref");
            const ref = refField?.value;
            if (ref === undefined || !NAME.test(ref)) {
                diagnostics.push(diag("missing-field", "Timing signal requires a lowercase-kebab `ref:`.", refField?.range ?? item.range, sourceName));
                continue;
            }
            const clockField = get("clock");
            let clock = false;
            if (clockField !== undefined) {
                if (clockField.value !== "true" && clockField.value !== "false") {
                    diagnostics.push(diag("invalid-field", "Timing `clock:` must be true or false.", clockField.range, sourceName));
                }
                else {
                    clock = clockField.value === "true";
                }
            }
            const phaseField = get("phase");
            let phase = "0";
            if (phaseField !== undefined) {
                const canonical = canonicalDecimal(phaseField.value);
                if (canonical === undefined || canonical.startsWith("-")) {
                    diagnostics.push(diag("invalid-field", "Timing `phase:` must be a non-negative exact decimal.", phaseField.range, sourceName));
                }
                else {
                    phase = canonical;
                }
            }
            const widthField = get("width");
            let width;
            if (widthField !== undefined) {
                const parsed = /^[0-9]+$/.test(widthField.value) ? Number.parseInt(widthField.value, 10) : Number.NaN;
                if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > MAX_TIMING_WIDTH) {
                    diagnostics.push(diag("invalid-field", `Timing \`width:\` must be an integer 1–${MAX_TIMING_WIDTH}.`, widthField.range, sourceName));
                }
                else {
                    width = parsed;
                }
            }
            const waveField = get("wave");
            const intervalsField = get("intervals");
            let intervals = [];
            if (scale === "cycles") {
                if (intervalsField !== undefined) {
                    diagnostics.push(diag("invalid-field", "`intervals:` is only valid with `scale: time`.", intervalsField.range, sourceName));
                }
                if (waveField === undefined) {
                    diagnostics.push(diag("missing-field", "Timing signal requires `wave:`.", item.range, sourceName));
                }
                else {
                    intervals = parseWave(waveField.value, waveField.range, sourceName, diagnostics);
                }
            }
            else {
                if (waveField !== undefined) {
                    diagnostics.push(diag("invalid-field", "`wave:` is only valid with `scale: cycles`.", waveField.range, sourceName));
                }
                intervals = parseIntervals(item, sourceName, diagnostics);
            }
            if (intervals.length === 0)
                continue;
            if (intervals.length > MAX_TIMING_INTERVALS) {
                diagnostics.push(limitExceeded("interval count", intervals.length, MAX_TIMING_INTERVALS, item.range, sourceName));
                continue;
            }
            const signal = {
                ref,
                clock,
                phase,
                ...(width === undefined ? {} : { width }),
                intervals,
                range: item.range,
            };
            if (signalRefs.has(ref)) {
                diagnostics.push(diag("duplicate-signal-ref", `Timing signal "${ref}" is declared twice.`, item.range, sourceName));
                continue;
            }
            signalRefs.set(ref, signal);
            signals.push(signal);
            totalIntervals += intervals.length;
            span = Math.max(span, Number(phase) + intervals.reduce((total, interval) => total + intervalSpan(interval), 0));
            continue;
        }
        if (item.kind === "group") {
            allowedFields(item.fields, GROUP_FIELDS, "group", sourceName, diagnostics);
            const labelField = item.fields.find((field) => field.key === "label");
            const signalsField = item.fields.find((field) => field.key === "signals");
            if (signalsField === undefined) {
                diagnostics.push(diag("missing-field", "Timing group requires `signals:`.", item.range, sourceName));
                continue;
            }
            const label = labelField === undefined
                ? undefined
                : inlineText(labelField.value, labelField.range, sourceName, diagnostics);
            if (labelField !== undefined)
                labelCodePoints += codePoints(labelField.value);
            const members = signalsField.value.split(",").map((entry) => entry.trim()).filter((entry) => entry !== "");
            if (members.length === 0) {
                diagnostics.push(diag("missing-field", "Timing group requires at least one signal.", signalsField.range, sourceName));
                continue;
            }
            const positions = [];
            let resolved = true;
            for (const member of members) {
                const position = signals.findIndex((signal) => signal.ref === member);
                if (position < 0) {
                    diagnostics.push(diag("unknown-signal-ref", `Timing group member "${member}" is not a declared signal.`, signalsField.range, sourceName));
                    resolved = false;
                    continue;
                }
                positions.push(position);
            }
            if (!resolved)
                continue;
            if (positions.some((position, index) => index > 0 && position !== positions[index - 1] + 1)) {
                diagnostics.push(diag("invalid-group", "Timing group signals must be a contiguous authored run.", signalsField.range, sourceName));
                continue;
            }
            groups.push({ label: label ?? [], signals: members, range: item.range });
            continue;
        }
        if (item.kind === "marker") {
            allowedFields(item.fields, MARKER_FIELDS, "marker", sourceName, diagnostics);
            const atField = item.fields.find((field) => field.key === "at");
            if (atField === undefined) {
                diagnostics.push(diag("missing-field", "Timing marker requires `at:`.", item.range, sourceName));
                continue;
            }
            const canonical = canonicalDecimal(atField.value);
            if (canonical === undefined || canonical.startsWith("-")) {
                diagnostics.push(diag("invalid-marker", "Timing marker `at:` must be a non-negative exact decimal.", atField.range, sourceName));
                continue;
            }
            const labelField = item.fields.find((field) => field.key === "label");
            const label = labelField === undefined
                ? undefined
                : inlineText(labelField.value, labelField.range, sourceName, diagnostics);
            if (labelField !== undefined)
                labelCodePoints += codePoints(labelField.value);
            markers.push({ at: canonical, ...(label === undefined ? {} : { label }), range: item.range });
            continue;
        }
        if (item.kind === "arrow") {
            allowedFields(item.fields, ARROW_FIELDS, "arrow", sourceName, diagnostics);
            const fromField = item.fields.find((field) => field.key === "from");
            const toField = item.fields.find((field) => field.key === "to");
            if (fromField === undefined || toField === undefined) {
                diagnostics.push(diag("missing-field", "Timing arrow requires `from:` and `to:`.", item.range, sourceName));
                continue;
            }
            const anchors = [];
            let resolved = true;
            for (const field of [fromField, toField]) {
                const match = /^([a-z][a-z0-9-]*)@([0-9]+)$/.exec(field.value);
                const signal = match === null ? undefined : signalRefs.get(match[1]);
                if (match === null || signal === undefined || Number.parseInt(match[2], 10) > signal.intervals.length) {
                    diagnostics.push(diag("invalid-anchor", "Timing arrow anchors must be `signal@boundary` over a declared signal and in-range boundary.", field.range, sourceName));
                    resolved = false;
                    continue;
                }
                anchors.push({ signal: match[1], boundary: canonicalDecimal(match[2]) ?? match[2], range: field.range });
            }
            if (!resolved)
                continue;
            const labelField = item.fields.find((field) => field.key === "label");
            const label = labelField === undefined
                ? undefined
                : inlineText(labelField.value, labelField.range, sourceName, diagnostics);
            if (labelField !== undefined)
                labelCodePoints += codePoints(labelField.value);
            arrows.push({ from: anchors[0], to: anchors[1], ...(label === undefined ? {} : { label }), range: item.range });
            continue;
        }
    }
    if (groups.length > MAX_TIMING_GROUPS) {
        diagnostics.push(limitExceeded("group count", groups.length, MAX_TIMING_GROUPS, blockRange, sourceName));
    }
    const runs = groups.map((group) => group.signals.map((ref) => signals.findIndex((signal) => signal.ref === ref)));
    const depth = runs.map((run, index) => runs.filter((other, otherIndex) => otherIndex !== index &&
        other.length > run.length &&
        Math.min(...run) >= Math.min(...other) && Math.max(...run) <= Math.max(...other)).length + 1);
    if (depth.some((value) => value > MAX_TIMING_GROUP_DEPTH)) {
        diagnostics.push(diag("invalid-group", `Timing groups nest at most ${MAX_TIMING_GROUP_DEPTH} deep.`, blockRange, sourceName));
    }
    if (signals.length > MAX_TIMING_SIGNALS) {
        diagnostics.push(limitExceeded("signal count", signals.length, MAX_TIMING_SIGNALS, blockRange, sourceName));
    }
    if (totalIntervals > MAX_TIMING_TOTAL_INTERVALS) {
        diagnostics.push(limitExceeded("interval count", totalIntervals, MAX_TIMING_TOTAL_INTERVALS, blockRange, sourceName));
    }
    if (markers.length > MAX_TIMING_MARKERS) {
        diagnostics.push(limitExceeded("marker count", markers.length, MAX_TIMING_MARKERS, blockRange, sourceName));
    }
    if (arrows.length > MAX_TIMING_ARROWS) {
        diagnostics.push(limitExceeded("arrow count", arrows.length, MAX_TIMING_ARROWS, blockRange, sourceName));
    }
    if (labelCodePoints > MAX_TIMING_LABEL_CODE_POINTS) {
        diagnostics.push(limitExceeded("label code points", labelCodePoints, MAX_TIMING_LABEL_CODE_POINTS, blockRange, sourceName));
    }
    if (span > MAX_TIMING_SPAN) {
        diagnostics.push(limitExceeded("span", span, MAX_TIMING_SPAN, blockRange, sourceName));
    }
    if (diagnostics.length > 0 || title === undefined)
        return { diagnostics };
    return {
        diagnostics,
        block: {
            kind: "timing",
            pluginVersion: TIMING_PLUGIN_VERSION,
            range: blockRange,
            ...(id === undefined ? {} : { id }),
            ...(number === undefined ? {} : { number }),
            title,
            ...(description === undefined ? {} : { description }),
            scale,
            ...(unit === undefined ? {} : { unit }),
            signals,
            groups,
            markers,
            arrows,
        },
    };
}
const descriptor = Object.freeze({
    type: TIMING_PLUGIN_TYPE,
    version: TIMING_PLUGIN_VERSION,
    title: "Timing",
    summary: "Native digital timing diagrams.",
    diagnosticNamespace: NAMESPACE,
    sourceSchema: timingSourceSchema,
    bodySyntax: Object.freeze({ id: TIMING_BODY_SYNTAX_ID, version: TIMING_BODY_SYNTAX_VERSION }),
    dataSchema: timingDataSchema,
});
export const timingPlugin = Object.freeze({ descriptor });
//# sourceMappingURL=timing.js.map