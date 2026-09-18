import { createDiagnostic } from "./diagnostics.js";
import { escapeAttribute, renderInlineHtml } from "./html-fragment.js";
/**
 * Document composition (contract: issue #67): one identifier namespace, one
 * flat numbering class per object kind, prose reference/citation resolution,
 * endnote-rendered footnotes, and the derived numbering projection.
 */
export const COMPOSITION_SCHEMA_ID = "azeforge.composition/v1";
/** Fail-closed ceilings (contract: issue #67 §11). */
export const MAX_BIBLIOGRAPHY_ENTRIES = 512;
export const MAX_FOOTNOTE_DEFINITIONS = 256;
export const MAX_REFERENCE_GROUP_TARGETS = 8;
export const MAX_REFERENCE_TOKENS = 2048;
export const MAX_LOCATOR_VALUE_LENGTH = 32;
/** `numeric` is the versioned built-in default (contract: issue #67 §8). */
export const DEFAULT_CITATION_STYLE = "numeric";
export const CITATION_STYLES = Object.freeze([
    "numeric",
    "author-year",
]);
/**
 * One flat numbering class per object kind, in canonical order. The six
 * statement kinds are six independent classes. A class's `word` is the
 * versioned built-in display word handed to the Theme layer.
 */
export const NUMBERING_CLASSES = Object.freeze({
    figure: Object.freeze({ word: "Figure" }),
    table: Object.freeze({ word: "Table" }),
    equation: Object.freeze({ word: "Equation" }),
    derivation: Object.freeze({ word: "Derivation" }),
    plot: Object.freeze({ word: "Plot" }),
    chart: Object.freeze({ word: "Chart" }),
    geometry: Object.freeze({ word: "Geometry" }),
    diagram: Object.freeze({ word: "Diagram" }),
    sequence: Object.freeze({ word: "Sequence diagram" }),
    state: Object.freeze({ word: "State machine" }),
    entity: Object.freeze({ word: "Entity-relationship diagram" }),
    class: Object.freeze({ word: "Class diagram" }),
    circuit: Object.freeze({ word: "Circuit" }),
    timing: Object.freeze({ word: "Timing diagram" }),
    formula: Object.freeze({ word: "Formula" }),
    reaction: Object.freeze({ word: "Reaction" }),
    structure: Object.freeze({ word: "Structure" }),
    control: Object.freeze({ word: "Control diagram" }),
    "free-body": Object.freeze({ word: "Free-body diagram" }),
    algorithm: Object.freeze({ word: "Algorithm" }),
    example: Object.freeze({ word: "Example" }),
    theorem: Object.freeze({ word: "Theorem" }),
    definition: Object.freeze({ word: "Definition" }),
    lemma: Object.freeze({ word: "Lemma" }),
    corollary: Object.freeze({ word: "Corollary" }),
    proposition: Object.freeze({ word: "Proposition" }),
    remark: Object.freeze({ word: "Remark" }),
});
export const NUMBERING_CLASS_ORDER = Object.freeze(Object.keys(NUMBERING_CLASSES));
/**
 * The parenthetical delimiters and separator a Citation group renders with
 * under one style. The Theme owns the final presentation (contract: §13).
 */
export function referenceGroupDelimiters(style) {
    return style === "author-year"
        ? { open: "(", close: ")", separator: "; " }
        : { open: "[", close: "]", separator: "; " };
}
/**
 * Display words per numbering class. `NUMBERING_CLASSES` stays the contract's
 * registered object-kind registry; `bibliography` is the one composition-owned
 * directive whose Block type also declares a derived `numberLabel`, so it
 * numbers beside the object kinds without joining the exported registry.
 */
const NUMBERING_WORDS = Object.freeze({
    ...Object.fromEntries(Object.entries(NUMBERING_CLASSES).map(([kind, entry]) => [kind, entry.word])),
    bibliography: "Bibliography",
});
/** The closed locator-word shortcut set used by the numeric style. */
const LOCATOR_ABBREVIATIONS = Object.freeze({
    page: "p.",
    pages: "pp.",
    chapter: "chap.",
    section: "sec.",
    line: "l.",
    lines: "ll.",
    note: "n.",
});
const BLOCK_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const EMPTY_RANGE = Object.freeze({
    start: Object.freeze({ line: 1, column: 1, offset: 0 }),
    end: Object.freeze({ line: 1, column: 1, offset: 0 }),
});
function sharedFields(block) {
    return block;
}
/** The numbering class of one Block: its statement kind, else its Block kind. */
function numberingClass(block) {
    return block.kind === "statement" ? block.statementKind : block.kind;
}
function mapBlockList(blocks, map) {
    let changed = false;
    const mapped = blocks.map((block) => {
        const next = map(block);
        if (next !== block)
            changed = true;
        return next;
    });
    return changed ? mapped : blocks;
}
/**
 * Map every Block contained by one Block — the six containers the contract
 * names (figure, callout, blockquote, list, statement, example) — rebuilding
 * only containers that actually changed. `walkBlocks` reuses this as the
 * single source of truth for containment.
 */
function mapContainedBlocks(block, map) {
    switch (block.kind) {
        case "figure":
        case "callout":
        case "blockquote": {
            const children = block.children;
            const mapped = mapBlockList(children, map);
            return mapped === children ? block : { ...block, children: mapped };
        }
        case "list": {
            let changed = false;
            const items = block.items.map((item) => {
                const mapped = mapBlockList(item.blocks, map);
                if (mapped === item.blocks)
                    return item;
                changed = true;
                return { ...item, blocks: mapped };
            });
            return changed ? { ...block, items } : block;
        }
        case "statement": {
            const text = mapBlockList(block.text, map);
            const proof = block.proof === undefined
                ? undefined
                : mapBlockList(block.proof, map);
            if (text === block.text && (proof === undefined || proof === block.proof)) {
                return block;
            }
            return { ...block, text, ...(proof === undefined ? {} : { proof }) };
        }
        case "example": {
            const problem = mapBlockList(block.problem, map);
            let changed = problem !== block.problem;
            const steps = block.steps.map((step) => {
                const text = mapBlockList(step.text, map);
                if (text === step.text)
                    return step;
                changed = true;
                return { ...step, text };
            });
            const result = block.result === undefined
                ? undefined
                : mapBlockList(block.result, map);
            if (result !== undefined && result !== block.result)
                changed = true;
            if (!changed)
                return block;
            return {
                ...block,
                problem,
                steps,
                ...(result === undefined ? {} : { result }),
            };
        }
        default:
            return block;
    }
}
/** Pre-order walk over a Block list and every Block it contains. */
function walkBlocks(blocks, visit) {
    for (const block of blocks) {
        visit(block);
        mapContainedBlocks(block, (child) => {
            walkBlocks([child], visit);
            return child;
        });
    }
}
/* ------------------------------------------------------------------ *
 * Inline text projection
 * ------------------------------------------------------------------ */
/**
 * The plain-text projection of authored Inline content. A token projects to
 * its resolved auto label once resolution has run; before that it projects to
 * the authored target spelling, so auto labels never depend on the resolution
 * they take part in.
 */
function inlinePlainText(nodes) {
    let text = "";
    for (const node of nodes) {
        switch (node.kind) {
            case "text":
            case "code":
                text += node.value;
                break;
            case "emphasis":
            case "strong":
            case "link":
                text += inlinePlainText(node.children);
                break;
            case "image":
                text += node.alt;
                break;
            case "break":
                text += " ";
                break;
            case "reference":
                text += node.resolved?.label ?? node.target;
                break;
            case "referenceGroup":
                text += node.targets
                    .map((target) => target.resolved?.label ?? target.target)
                    .join(", ");
                break;
            case "footnote":
                break;
        }
    }
    return text;
}
/** One run of the shared inline label text (`CircuitText`). */
function circuitRunText(run) {
    if (typeof run !== "object" || run === null)
        return "";
    const record = run;
    if (typeof record["value"] === "string")
        return record["value"];
    const coefficient = record["coefficient"];
    const prefix = record["prefix"];
    const unit = record["unit"];
    if (typeof coefficient === "string" &&
        typeof prefix === "string" &&
        typeof unit === "string") {
        return `${coefficient} ${prefix}${unit}`;
    }
    return "";
}
/**
 * The caption a target projects: `caption:` when the kind carries it, else the
 * kind's caption-equivalent `title:` (contract: issue #67 §2).
 */
function captionText(block) {
    const fields = sharedFields(block);
    if (fields.caption !== undefined) {
        const text = inlinePlainText(fields.caption);
        return text.trim() === "" ? undefined : text;
    }
    const title = fields.title;
    if (typeof title === "string")
        return title.trim() === "" ? undefined : title;
    if (Array.isArray(title)) {
        const text = title.map(circuitRunText).join("");
        return text.trim() === "" ? undefined : text;
    }
    return undefined;
}
/** The display word of one numbering class, humanized for unregistered kinds. */
function kindWord(kind) {
    const registered = NUMBERING_WORDS[kind];
    if (registered !== undefined)
        return registered;
    const spaced = kind.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replaceAll("-", " ");
    return spaced.length === 0
        ? kind
        : spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
function createDeclarationState() {
    return {
        counters: new Map(),
        declarations: new Map(),
        occurrences: new Map(),
        invalidIds: [],
        bibliographies: [],
        entries: [],
        definitions: new Map(),
        definitionsSeen: [],
        duplicates: [],
    };
}
function addOccurrence(state, identifier, range) {
    const sites = state.occurrences.get(identifier);
    if (sites === undefined)
        state.occurrences.set(identifier, [range]);
    else
        sites.push(range);
}
function assignNumber(block, state) {
    if (sharedFields(block).number !== true)
        return undefined;
    const className = numberingClass(block);
    if (!Object.hasOwn(NUMBERING_WORDS, className))
        return undefined;
    const number = (state.counters.get(className) ?? 0) + 1;
    state.counters.set(className, number);
    return { word: kindWord(className), number };
}
/** An auto label: a numbered target spells its number, else its caption. */
function objectLabel(block, numbered) {
    if (numbered !== undefined)
        return `${numbered.word} ${numbered.number}`;
    return captionText(block) ?? kindWord(numberingClass(block));
}
function withNumberLabel(block, label) {
    switch (block.kind) {
        case "table":
        case "figure":
        case "algorithm":
        case "statement":
        case "example":
        case "bibliography":
            return { ...block, numberLabel: label };
        default:
            return block;
    }
}
function declareBlock(block, state) {
    const numbered = assignNumber(block, state);
    const identifier = sharedFields(block).id;
    if (identifier !== undefined) {
        if (!BLOCK_ID_PATTERN.test(identifier)) {
            state.invalidIds.push({ id: identifier, range: block.range });
        }
        else {
            addOccurrence(state, identifier, block.range);
            if (!state.declarations.has(identifier)) {
                state.declarations.set(identifier, {
                    identifier,
                    citation: false,
                    label: objectLabel(block, numbered),
                    range: block.range,
                });
            }
        }
    }
    switch (block.kind) {
        case "bibliography":
            declareBibliography(block, state);
            break;
        case "footnoteDefinition":
            declareFootnoteDefinition(block, state);
            break;
        default:
            break;
    }
    const mapped = mapContainedBlocks(block, (child) => declareBlock(child, state));
    return numbered === undefined
        ? mapped
        : withNumberLabel(mapped, `${numbered.word} ${numbered.number}`);
}
function declareBibliography(block, state) {
    state.bibliographies.push({ block, range: block.range });
    for (const entry of block.entries) {
        state.entries.push({ entry, declarationIndex: state.entries.length });
        addOccurrence(state, entry.key, entry.range);
        if (!state.declarations.has(entry.key)) {
            state.declarations.set(entry.key, {
                identifier: entry.key,
                citation: true,
                label: entry.key,
                range: entry.range,
            });
        }
    }
}
function declareFootnoteDefinition(block, state) {
    const record = { label: block.label, range: block.range };
    state.definitionsSeen.push(record);
    const existing = state.definitions.get(block.label);
    if (existing !== undefined) {
        state.duplicates.push({
            label: block.label,
            range: block.range,
            first: existing.range,
        });
        return;
    }
    state.definitions.set(block.label, record);
}
function declarationDiagnostics(state) {
    const diagnostics = [];
    for (const { id, range } of state.invalidIds) {
        diagnostics.push(createDiagnostic("azeforge.reference#invalid-id", "error", `Block ID "${id}" is not a valid AzeMark ID.`, {
            location: { range },
            data: { id },
            suggestion: "Use lowercase letters, digits, and single hyphens, starting with a letter.",
        }));
    }
    for (const [identifier, sites] of state.occurrences) {
        if (sites.length < 2)
            continue;
        const first = sites[0];
        if (first === undefined)
            continue;
        const relatedLocations = sites.map((range, index) => ({
            range,
            message: index === 0
                ? `Identifier "${identifier}" is declared here.`
                : `Identifier "${identifier}" is also declared here.`,
        }));
        diagnostics.push(createDiagnostic("azeforge.reference#duplicate-id", "error", `Identifier "${identifier}" is used more than once.`, {
            location: { range: first },
            data: { id: identifier, count: sites.length },
            relatedLocations,
        }));
    }
    const firstBibliography = state.bibliographies[0];
    for (const bibliography of state.bibliographies.slice(1)) {
        diagnostics.push(createDiagnostic("azeforge.citation#duplicate-bibliography", "error", "A document may declare at most one bibliography directive.", {
            location: { range: bibliography.range },
            data: { directives: state.bibliographies.length },
            relatedLocations: firstBibliography === undefined
                ? []
                : [
                    {
                        range: firstBibliography.range,
                        message: "The bibliography directive is already declared here.",
                    },
                ],
        }));
    }
    if (state.entries.length > MAX_BIBLIOGRAPHY_ENTRIES) {
        const over = state.entries[MAX_BIBLIOGRAPHY_ENTRIES];
        diagnostics.push(createDiagnostic("azeforge.citation#limit-exceeded", "error", `A bibliography may hold at most ${MAX_BIBLIOGRAPHY_ENTRIES} entries.`, {
            ...(over === undefined ? {} : { location: { range: over.entry.range } }),
            data: {
                subject: "bibliography-entries",
                count: state.entries.length,
                limit: MAX_BIBLIOGRAPHY_ENTRIES,
            },
        }));
    }
    if (state.definitionsSeen.length > MAX_FOOTNOTE_DEFINITIONS) {
        const over = state.definitionsSeen[MAX_FOOTNOTE_DEFINITIONS];
        diagnostics.push(createDiagnostic("azeforge.footnote#limit-exceeded", "error", `A document may hold at most ${MAX_FOOTNOTE_DEFINITIONS} footnote definitions.`, {
            ...(over === undefined ? {} : { location: { range: over.range } }),
            data: {
                subject: "footnote-definitions",
                count: state.definitionsSeen.length,
                limit: MAX_FOOTNOTE_DEFINITIONS,
            },
        }));
    }
    for (const duplicate of state.duplicates) {
        diagnostics.push(createDiagnostic("azeforge.footnote#duplicate-definition", "error", `Footnote "${duplicate.label}" is defined more than once.`, {
            location: { range: duplicate.range },
            data: { label: duplicate.label },
            relatedLocations: [
                {
                    range: duplicate.first,
                    message: `Footnote "${duplicate.label}" is first defined here.`,
                },
            ],
        }));
    }
    return diagnostics;
}
function isSourceRange(value) {
    if (typeof value !== "object" || value === null)
        return false;
    const record = value;
    return (typeof record["start"] === "object" &&
        record["start"] !== null &&
        typeof record["end"] === "object" &&
        record["end"] !== null);
}
/**
 * Map every Inline token in a Document subtree, rebuilding only the nodes that
 * changed. Blocks, ranges and domain records are walked generically; the three
 * composition token kinds are handed to `visit`, and a Bookmark's own range
 * becomes the fallback range for tokens that carry none.
 */
function mapValue(value, visit, context) {
    if (Array.isArray(value)) {
        let changed = false;
        const mapped = value.map((item) => {
            const next = mapValue(item, visit, context);
            if (next !== item)
                changed = true;
            return next;
        });
        return changed ? mapped : value;
    }
    if (typeof value !== "object" || value === null)
        return value;
    const record = value;
    const kind = record["kind"];
    const fallback = isSourceRange(record["range"]) ? record["range"] : context.fallback;
    const local = {
        fallback,
        inFootnote: context.inFootnote || kind === "footnoteDefinition",
        inCaption: context.inCaption,
    };
    if (kind === "referenceGroup") {
        const group = value;
        const mapped = mapValue(record["targets"], visit, local);
        const node = mapped === record["targets"]
            ? group
            : { ...group, targets: mapped };
        return visit(node, local);
    }
    if (kind === "reference" || kind === "footnote") {
        return visit(value, local);
    }
    let changed = false;
    const changedKeys = [];
    const mappedValues = new Map();
    for (const key of Object.keys(record)) {
        const child = record[key];
        if (child === null || typeof child !== "object")
            continue;
        const next = mapValue(child, visit, {
            ...local,
            inCaption: context.inCaption || key === "caption",
        });
        if (next === child)
            continue;
        changed = true;
        changedKeys.push(key);
        mappedValues.set(key, next);
    }
    if (!changed)
        return value;
    const rebuilt = { ...record };
    for (const key of changedKeys)
        rebuilt[key] = mappedValues.get(key);
    return rebuilt;
}
function scanVisitor(state, declarations, definitions, hasBibliography) {
    const report = (code, severity, message, range, data = {}) => {
        state.diagnostics.push(createDiagnostic(code, severity, message, { location: { range }, data }));
    };
    return (node, context) => {
        if (node.kind === "reference") {
            state.tokens += 1;
            if (state.tokens > MAX_REFERENCE_TOKENS && !state.tokenLimitReported) {
                state.tokenLimitReported = true;
                report("azeforge.reference#limit-exceeded", "error", `A document may hold at most ${MAX_REFERENCE_TOKENS} reference and citation tokens.`, node.range ?? context.fallback, {
                    subject: "reference-tokens",
                    count: state.tokens,
                    limit: MAX_REFERENCE_TOKENS,
                });
            }
            const range = node.range ?? context.fallback;
            const locatorLength = node.locator === undefined ? 0 : [...node.locator.value].length;
            if (locatorLength > MAX_LOCATOR_VALUE_LENGTH) {
                report("azeforge.citation#limit-exceeded", "error", `A locator value may be at most ${MAX_LOCATOR_VALUE_LENGTH} characters.`, range, {
                    subject: "locator-value",
                    count: locatorLength,
                    limit: MAX_LOCATOR_VALUE_LENGTH,
                });
            }
            const declaration = declarations.get(node.target);
            if (declaration === undefined) {
                if (!hasBibliography && node.locator !== undefined) {
                    report("azeforge.citation#missing-bibliography", "error", `Citation "@${node.target}" needs a :::: bibliography directive.`, range, { target: node.target });
                }
                else {
                    report("azeforge.reference#unresolved-reference", "error", `Reference "@${node.target}" does not match any identifier in this document.`, range, { target: node.target });
                }
                return node;
            }
            if (node.locator !== undefined && !declaration.citation) {
                report("azeforge.citation#locator-on-reference", "error", `A locator may only target a bibliography entry, not object "@${node.target}".`, range, { target: node.target });
            }
            if (declaration.citation && !state.cited.has(node.target)) {
                state.cited.add(node.target);
                state.citationOrder.push(node.target);
            }
            return node;
        }
        if (node.kind === "referenceGroup") {
            if (node.targets.length > MAX_REFERENCE_GROUP_TARGETS) {
                report("azeforge.reference#limit-exceeded", "error", `A reference group may hold at most ${MAX_REFERENCE_GROUP_TARGETS} targets.`, node.range ?? context.fallback, {
                    subject: "reference-group-targets",
                    count: node.targets.length,
                    limit: MAX_REFERENCE_GROUP_TARGETS,
                });
            }
            return node;
        }
        if (node.kind !== "footnote")
            return node;
        if (context.inFootnote) {
            report("azeforge.footnote#nested-marker", "error", "A footnote marker may not appear inside footnote content.", node.range ?? context.fallback, { label: node.label });
            return node;
        }
        if (context.inCaption) {
            report("azeforge.footnote#marker-in-caption", "error", "A footnote marker may not appear in a caption.", node.range ?? context.fallback, { label: node.label });
            return node;
        }
        if (!definitions.has(node.label)) {
            report("azeforge.footnote#missing-definition", "error", `Footnote "${node.label}" is referenced but never defined.`, node.range ?? context.fallback, { label: node.label });
            return node;
        }
        const count = (state.markerCounts.get(node.label) ?? 0) + 1;
        state.markerCounts.set(node.label, count);
        if (count === 1)
            state.markerOrder.push(node.label);
        return node;
    };
}
/* ------------------------------------------------------------------ *
 * Citation order and author-year labels
 * ------------------------------------------------------------------ */
function compareText(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}
function authorKey(entry) {
    const author = entry.authors[0];
    if (author === undefined)
        return "";
    return author.family ?? author.name;
}
function yearText(entry) {
    const year = entry.year;
    return year === undefined || year === "unspecified" ? "n.d." : year;
}
function yearValue(entry) {
    const year = entry.year;
    if (year === undefined || year === "unspecified")
        return undefined;
    const parsed = Number.parseInt(year, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
}
function compareYears(left, right) {
    if (left === undefined && right === undefined)
        return 0;
    if (left === undefined)
        return 1;
    if (right === undefined)
        return -1;
    return left < right ? -1 : left > right ? 1 : 0;
}
/** `0` -> `a`, `25` -> `z`, `26` -> `aa`: the derived disambiguation suffixes. */
function suffixLetters(index) {
    let remaining = index;
    let text = "";
    do {
        text = String.fromCharCode(97 + (remaining % 26)) + text;
        remaining = Math.floor(remaining / 26) - 1;
    } while (remaining >= 0);
    return text;
}
function citationGroupKey(entry) {
    return `${authorKey(entry)}\u0000${yearText(entry)}`;
}
function citationBaseLabel(entry) {
    const key = authorKey(entry);
    const year = yearText(entry);
    return key === "" ? year : `${key} ${year}`;
}
/**
 * Resolve citation labels and the works-cited order under one style
 * (contract: issue #67 §8). Numeric numbers cited records by first citation;
 * author-year sorts by (`family:` ?? `name:`, year, title, declaration order)
 * and derives `a`/`b`/`c` suffixes for colliding (author, year) labels.
 */
function citationProjection(style, state, citationOrder) {
    const records = new Map();
    for (const record of state.entries) {
        if (!records.has(record.entry.key))
            records.set(record.entry.key, record);
    }
    const cited = [];
    for (const key of citationOrder) {
        const record = records.get(key);
        if (record !== undefined)
            cited.push(record);
    }
    if (style === "numeric") {
        const labels = new Map();
        const order = [];
        cited.forEach((record, index) => {
            labels.set(record.entry.key, String(index + 1));
            order.push(record.entry.key);
        });
        return { labels, order };
    }
    const sorted = [...cited].sort((left, right) => {
        const author = compareText(authorKey(left.entry), authorKey(right.entry));
        if (author !== 0)
            return author;
        const year = compareYears(yearValue(left.entry), yearValue(right.entry));
        if (year !== 0)
            return year;
        const title = compareText(left.entry.title, right.entry.title);
        if (title !== 0)
            return title;
        return left.declarationIndex - right.declarationIndex;
    });
    const totals = new Map();
    for (const record of sorted) {
        const key = citationGroupKey(record.entry);
        totals.set(key, (totals.get(key) ?? 0) + 1);
    }
    const seen = new Map();
    const labels = new Map();
    const order = [];
    for (const record of sorted) {
        const key = citationGroupKey(record.entry);
        const index = seen.get(key) ?? 0;
        seen.set(key, index + 1);
        const suffix = (totals.get(key) ?? 0) > 1 ? suffixLetters(index) : "";
        labels.set(record.entry.key, `${citationBaseLabel(record.entry)}${suffix}`);
        order.push(record.entry.key);
    }
    return { labels, order };
}
function locatorSuffix(style, locator) {
    if (locator === undefined)
        return "";
    const word = style === "numeric"
        ? (LOCATOR_ABBREVIATIONS[locator.word] ?? locator.word)
        : locator.word;
    return `, ${word} ${locator.value}`;
}
function fillVisitor(state) {
    return (node, context) => {
        if (node.kind === "reference") {
            const declaration = state.declarations.get(node.target);
            if (declaration === undefined)
                return node;
            const label = declaration.citation
                ? `${state.citationLabels.get(node.target) ?? node.target}${locatorSuffix(state.style, node.locator)}`
                : declaration.label;
            return {
                ...node,
                resolved: {
                    href: `#${declaration.identifier}`,
                    label,
                    citation: declaration.citation,
                },
            };
        }
        if (node.kind === "referenceGroup") {
            return { ...node, resolved: referenceGroupDelimiters(state.style) };
        }
        if (node.kind !== "footnote")
            return node;
        if (context.inFootnote)
            return node;
        const number = state.footnoteNumbers.get(node.label);
        if (number === undefined)
            return node;
        const marker = (state.markerSequence.get(node.label) ?? 0) + 1;
        state.markerSequence.set(node.label, marker);
        return {
            ...node,
            resolved: { href: `#fn-${node.label}`, number, marker },
        };
    };
}
/* ------------------------------------------------------------------ *
 * Bibliography projection
 * ------------------------------------------------------------------ */
function patchBibliographies(blocks, lists) {
    let index = 0;
    const visit = (block) => {
        if (block.kind === "bibliography") {
            const worksCited = lists[index] ?? [];
            index += 1;
            return { ...block, worksCited };
        }
        return mapContainedBlocks(block, visit);
    };
    return mapBlockList(blocks, visit);
}
function worksCitedLists(state, order) {
    const position = new Map();
    order.forEach((key, index) => {
        if (!position.has(key))
            position.set(key, index);
    });
    return state.bibliographies.map(({ block }) => block.entries
        .filter((entry) => position.has(entry.key))
        .sort((left, right) => (position.get(left.key) ?? 0) - (position.get(right.key) ?? 0)));
}
/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */
/**
 * Resolve the derived numbering projection: assign per-kind ordinals, resolve
 * every reference/citation target against the unified identifier namespace,
 * number footnote markers in first-reference order, and order the works-cited
 * list. Pure and deterministic; the result carries derived fields only.
 */
export function resolveDocumentComposition(document) {
    const style = document.metadata.citationStyle ?? DEFAULT_CITATION_STYLE;
    const diagnostics = [];
    // Pass 1 — declarations and numbering, in document order.
    const state = createDeclarationState();
    const declared = mapBlockList(document.blocks, (block) => declareBlock(block, state));
    diagnostics.push(...declarationDiagnostics(state));
    const rootContext = {
        fallback: declared[0]?.range ?? EMPTY_RANGE,
        inFootnote: false,
        inCaption: false,
    };
    const hasBibliography = state.bibliographies.length > 0;
    // Pass 2 — the scan: forward references, citation order, marker order.
    const scan = {
        tokens: 0,
        tokenLimitReported: false,
        citationOrder: [],
        cited: new Set(),
        markerCounts: new Map(),
        markerOrder: [],
        diagnostics: [],
    };
    mapValue(declared, scanVisitor(scan, state.declarations, state.definitions, hasBibliography), rootContext);
    diagnostics.push(...scan.diagnostics);
    const projection = citationProjection(style, state, scan.citationOrder);
    const footnoteNumbers = new Map();
    scan.markerOrder.forEach((label, index) => footnoteNumbers.set(label, index + 1));
    // Pass 3 — fill the derived fields.
    const fill = {
        style,
        declarations: state.declarations,
        citationLabels: projection.labels,
        footnoteNumbers,
        markerSequence: new Map(),
    };
    const resolved = mapValue(declared, fillVisitor(fill), rootContext);
    const definitions = new Map();
    walkBlocks(resolved, (block) => {
        if (block.kind === "footnoteDefinition" && !definitions.has(block.label)) {
            definitions.set(block.label, block);
        }
    });
    const endnotes = [];
    for (const label of scan.markerOrder) {
        const definition = definitions.get(label);
        if (definition === undefined)
            continue;
        endnotes.push({
            label,
            number: footnoteNumbers.get(label) ?? endnotes.length + 1,
            children: definition.children,
            markers: scan.markerCounts.get(label) ?? 0,
        });
    }
    diagnostics.push(...citationDiagnostics(style, state, scan), ...footnoteWarnings(state, scan));
    const composition = { citationStyle: style, endnotes };
    return {
        document: {
            ...document,
            blocks: patchBibliographies(resolved, worksCitedLists(state, projection.order)),
            composition,
        },
        diagnostics,
    };
}
function citationDiagnostics(style, state, scan) {
    const diagnostics = [];
    for (const record of state.entries) {
        const { entry } = record;
        if (style === "author-year" &&
            (entry.authors.length === 0 ||
                entry.authors.some((author) => author.family === undefined))) {
            diagnostics.push(createDiagnostic("azeforge.citation#missing-family-name", "error", `Citation record "${entry.key}" is missing an author family name.`, {
                location: { range: entry.range },
                data: { key: entry.key },
                suggestion: "Add `family:` to every author record.",
            }));
        }
        if (!scan.cited.has(entry.key)) {
            diagnostics.push(createDiagnostic("azeforge.citation#uncited-entry", "warning", `Citation record "${entry.key}" is never cited.`, {
                location: { range: entry.range },
                data: { key: entry.key },
                suggestion: "Cite it or delete it; uncited entries are excluded from the list.",
            }));
        }
    }
    return diagnostics;
}
function footnoteWarnings(state, scan) {
    const diagnostics = [];
    for (const [label, record] of state.definitions) {
        if (scan.markerCounts.has(label))
            continue;
        diagnostics.push(createDiagnostic("azeforge.footnote#unreferenced-definition", "warning", `Footnote "${label}" is defined but never referenced.`, {
            location: { range: record.range },
            data: { label },
        }));
    }
    return diagnostics;
}
/** The document-end endnotes section required in HTML and PDF (issue #67 §6). */
export function renderEndnotesSection(document) {
    const endnotes = document.composition?.endnotes ?? [];
    if (endnotes.length === 0)
        return "";
    const items = endnotes.map((entry) => {
        const label = escapeAttribute(entry.label);
        const backlinks = [];
        for (let marker = 1; marker <= entry.markers; marker += 1) {
            backlinks.push(`<a class="aze-endnote-backlink" href="#fnref-${label}-${marker}" role="doc-backlink" aria-label="Back to reference ${marker} of note ${entry.number}">&#8617;</a>`);
        }
        const links = backlinks.length === 0
            ? ""
            : ` <span class="aze-endnote-backlinks">${backlinks.join(" ")}</span>`;
        return `<li id="fn-${label}" class="aze-endnote"><span class="aze-endnote-text">${renderInlineHtml(entry.children)}</span>${links}</li>`;
    });
    return `<section class="aze-endnotes" aria-label="Endnotes"><ol>${items.join("")}</ol></section>`;
}
//# sourceMappingURL=composition.js.map