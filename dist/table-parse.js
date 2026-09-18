import { isAlias, isScalar, parseDocument as parseYamlDocument, visit } from "yaml";
import { createDiagnostic } from "./diagnostics.js";
import { inlineTextValue } from "./markdown.js";
import { parseNativeMath, projectMathNode } from "./math.js";
import { canonicalExactDecimal, parseQuantitySpelling, QuantityError, unitDimension, validateUnitExpression, } from "./quantity.js";
import { rangeFromLines, rangeFromLineSlice } from "./source-map.js";
/**
 * Typed table v2 body parsing (contract: issue #66 §§2–4, 10, 13). The body
 * is a shared declaration record; every diagnostic is stable-coded and ranged
 * over the offending row-record key and value, with related locations on the
 * column declarations a grouping failure cites.
 */
export const TABLE_COLUMN_KEY = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
/** The closed seven-type column system, in canonical order. */
export const TABLE_COLUMN_TYPES = Object.freeze([
    "prose",
    "text",
    "integer",
    "decimal",
    "quantity",
    "boolean",
    "math",
]);
/** The closed per-column declaration field set, in the parser's acceptance order. */
export const TABLE_COLUMN_FIELDS = Object.freeze([
    "key",
    "name",
    "type",
    "unit",
    "align",
]);
/** The closed per-group declaration field set. */
export const TABLE_GROUP_FIELDS = Object.freeze(["name", "columns"]);
export const MAX_TABLE_COLUMNS = 64;
export const MAX_TABLE_ROWS = 1000;
export const MAX_TABLE_TEXT_CELL_CHARS = 500;
export const MAX_TABLE_MATH_CELL_CHARS = 4000;
export const MAX_TABLE_GROUPS = 16;
/** Versioned built-in alignment per column type (contract: issue #66 §3). */
export const DEFAULT_ALIGNMENT = Object.freeze({
    prose: "left",
    text: "left",
    integer: "right",
    decimal: "right",
    quantity: "right",
    boolean: "center",
    math: "left",
});
/** The closed alignment spellings, in the order the grammar reports them. */
export const ALIGNMENTS = Object.freeze({
    left: true,
    center: true,
    right: true,
});
/** Whether `value` names one of the closed per-column declaration fields. */
function isTableColumnField(value) {
    return TABLE_COLUMN_FIELDS.some((field) => field === value);
}
/** Whether `value` names one of the closed per-group declaration fields. */
function isTableGroupField(value) {
    return TABLE_GROUP_FIELDS.some((field) => field === value);
}
/** A closed vocabulary in prose: `key, name, type, unit, or align`. */
function orList(values) {
    const head = values.slice(0, -1).join(", ");
    const last = values[values.length - 1] ?? "";
    return head === "" ? last : `${head}, or ${last}`;
}
function buildBodyMap(lines) {
    const starts = [];
    let text = "";
    for (const [index, line] of lines.entries()) {
        if (index > 0)
            text += "\n";
        starts.push(text.length);
        text += line.text;
    }
    const lineAt = (offset) => {
        let found = 0;
        for (let index = 0; index < lines.length; index += 1) {
            if (starts[index] <= offset)
                found = index;
            else
                break;
        }
        return found;
    };
    return {
        text,
        lineRange(index) {
            const line = lines[index];
            return line === undefined
                ? rangeFromLines(lines[0], lines[lines.length - 1])
                : rangeFromLines(line, line);
        },
        rangeAt(start, end) {
            if (lines.length === 0) {
                throw new Error("A table body always has at least one source line.");
            }
            const first = lineAt(Math.max(0, start));
            const lastOffset = Math.max(start, end - 1);
            const last = lineAt(lastOffset);
            if (first === last) {
                const line = lines[first];
                const from = Math.max(0, Math.min(line.text.length, start - starts[first]));
                const to = Math.max(from, Math.min(line.text.length, lastOffset + 1 - starts[first]));
                return rangeFromLineSlice(line, from, to);
            }
            return rangeFromLines(lines[first], lines[last]);
        },
    };
}
function isNode(value) {
    return (typeof value === "object" &&
        value !== null &&
        "range" in value &&
        Array.isArray(value.range));
}
function isScalarNode(value) {
    return isNode(value) && isScalar(value);
}
function isPairNode(value) {
    return (typeof value === "object" &&
        value !== null &&
        "key" in value &&
        "value" in value);
}
function mapPairs(node) {
    if (typeof node !== "object" || node === null || !("items" in node))
        return undefined;
    const items = node.items;
    if (!Array.isArray(items))
        return undefined;
    if (items.length === 0)
        return [];
    return items.every(isPairNode) ? items : undefined;
}
function sequenceItems(node) {
    if (typeof node !== "object" || node === null || !("items" in node))
        return undefined;
    const items = node.items;
    if (!Array.isArray(items))
        return undefined;
    if (items.length > 0 && items.every(isPairNode))
        return undefined;
    return items;
}
function scalarValue(node) {
    return isScalarNode(node) ? node.value : undefined;
}
function nodeRange(node, map) {
    if (!isNode(node))
        return undefined;
    const [start, , end] = node.range;
    return map.rangeAt(start, end);
}
/** The authored text of a scalar node plus the range of its source spelling. */
function scalarText(node, map) {
    if (!isScalarNode(node))
        return undefined;
    const [start, valueEnd] = node.range;
    const range = map.rangeAt(start, valueEnd);
    const quoted = node.type === "QUOTE_DOUBLE" || node.type === "QUOTE_SINGLE";
    if (node.value === null || node.value === undefined) {
        return { text: "", range, quoted };
    }
    if (typeof node.value === "object")
        return undefined;
    return { text: String(node.value), range, quoted };
}
function tableDiagnostic(code, message, range, sourceName, extra = {}) {
    return createDiagnostic(`azeforge.table#${code}`, "error", message, {
        location: sourceName === undefined ? { range } : { source: sourceName, range },
        ...(extra.data === undefined ? {} : { data: extra.data }),
        ...(extra.suggestion === undefined ? {} : { suggestion: extra.suggestion }),
        ...(extra.relatedLocations === undefined
            ? {}
            : {
                relatedLocations: extra.relatedLocations.map((related) => ({
                    ...(sourceName === undefined ? {} : { source: sourceName }),
                    range: related.range,
                    message: related.message,
                })),
            }),
    });
}
function parseColumns(node, map, sourceName, diagnostics) {
    const items = sequenceItems(node);
    if (items === undefined) {
        diagnostics.push(tableDiagnostic("missing-columns-or-rows", "A table Block body must declare `columns` and `rows` as collections.", nodeRange(node, map) ?? map.lineRange(0), sourceName));
        return undefined;
    }
    if (items.length === 0) {
        diagnostics.push(tableDiagnostic("empty-table", "A table Block must declare at least one column.", nodeRange(node, map) ?? map.lineRange(0), sourceName));
        return undefined;
    }
    if (items.length > MAX_TABLE_COLUMNS) {
        diagnostics.push(tableDiagnostic("too-many-columns", `A table Block declares at most ${MAX_TABLE_COLUMNS} columns.`, nodeRange(node, map) ?? map.lineRange(0), sourceName, { data: { columns: items.length, limit: MAX_TABLE_COLUMNS } }));
        return undefined;
    }
    const plans = [];
    const seen = new Map();
    for (const item of items) {
        const declarationRange = nodeRange(item, map) ?? map.lineRange(0);
        const pairs = mapPairs(item);
        if (pairs === undefined) {
            diagnostics.push(tableDiagnostic("invalid-column", "Each table column must be a record with a lowercase-kebab `key`.", declarationRange, sourceName));
            return undefined;
        }
        let key;
        let keyRange = declarationRange;
        const declared = {};
        for (const pair of pairs) {
            const keyText = isScalarNode(pair.key) ? String(pair.key.value ?? "") : "";
            if (!isTableColumnField(keyText)) {
                diagnostics.push(tableDiagnostic("unknown-column-field", `Table column field "${keyText}" is not supported.`, nodeRange(pair.key, map) ?? declarationRange, sourceName, { suggestion: `Use ${orList(TABLE_COLUMN_FIELDS)}.` }));
                return undefined;
            }
            const scalar = scalarText(pair.value, map);
            // `key` is the column's identity: its value range anchors every later
            // diagnostic, and an absent value reads as the empty key.
            if (keyText === "key") {
                key = scalar?.text ?? "";
                keyRange = scalar?.range ?? declarationRange;
            }
            else {
                declared[keyText] = scalar?.text;
            }
        }
        const name = declared.name;
        const type = declared.type;
        const unit = declared.unit;
        const align = declared.align;
        if (key === undefined || !TABLE_COLUMN_KEY.test(key)) {
            diagnostics.push(tableDiagnostic("invalid-column", "Table column `key` must be lowercase-kebab.", keyRange, sourceName, { data: { key: key ?? null } }));
            return undefined;
        }
        const first = seen.get(key);
        if (first !== undefined) {
            diagnostics.push(tableDiagnostic("duplicate-column", `Table column key "${key}" is declared more than once.`, keyRange, sourceName, {
                data: { key },
                relatedLocations: [
                    { range: first, message: `Column "${key}" was first declared here.` },
                ],
            }));
            return undefined;
        }
        seen.set(key, keyRange);
        if (name !== undefined && name.length === 0) {
            diagnostics.push(tableDiagnostic("invalid-column", `Table column "${key}" name must not be empty.`, declarationRange, sourceName, { data: { key } }));
            return undefined;
        }
        if (type === undefined ||
            !TABLE_COLUMN_TYPES.includes(type)) {
            diagnostics.push(tableDiagnostic("unknown-type", `Table column "${key}" type must be one of ${TABLE_COLUMN_TYPES.join(", ")}.`, declarationRange, sourceName, {
                data: { key, type: type ?? null },
                suggestion: `Use one of ${TABLE_COLUMN_TYPES.join(", ")}.`,
            }));
            return undefined;
        }
        const columnType = type;
        if (unit !== undefined && columnType !== "quantity") {
            diagnostics.push(tableDiagnostic("unit-in-column", `Table column "${key}" declares \`unit:\` on a ${columnType} column.`, declarationRange, sourceName, {
                data: { key, type: columnType },
                suggestion: "Only a `quantity` column carries a column unit.",
            }));
            return undefined;
        }
        if (unit !== undefined && unit.length === 0) {
            diagnostics.push(tableDiagnostic("invalid-quantity", `Table column "${key}" unit must not be empty.`, declarationRange, sourceName, { data: { key } }));
            return undefined;
        }
        let dimension;
        if (unit !== undefined) {
            try {
                validateUnitExpression(unit);
                dimension = unitDimension(unit);
            }
            catch (error) {
                diagnostics.push(tableDiagnostic("invalid-quantity", `Table column "${key}" unit "${unit}" is not registered.`, declarationRange, sourceName, {
                    data: { key, unit },
                    ...(error instanceof QuantityError ? { suggestion: error.message } : {}),
                }));
                return undefined;
            }
        }
        if (align !== undefined && ALIGNMENTS[align] !== true) {
            diagnostics.push(tableDiagnostic("invalid-column", `Table column "${key}" align must be ${orList(Object.keys(ALIGNMENTS))}.`, declarationRange, sourceName, { data: { key, align } }));
            return undefined;
        }
        const effectiveAlignment = align === undefined ? DEFAULT_ALIGNMENT[columnType] : align;
        const column = {
            key,
            type: columnType,
            align: effectiveAlignment,
            ...(name === undefined ? {} : { name }),
            ...(unit === undefined ? {} : { unit }),
        };
        plans.push({
            column,
            type: columnType,
            keyRange,
            declarationRange,
            ...(dimension === undefined ? {} : { unitDimension: dimension }),
        });
    }
    return plans;
}
function parseCellValue(plan, node, map, context, rowIndex, diagnostics) {
    const sourceName = context.sourceName;
    const scalar = scalarText(node, map);
    const range = scalar?.range ?? nodeRange(node, map) ?? map.lineRange(0);
    if (scalar === undefined) {
        diagnostics.push(tableDiagnostic("non-numeric-value", `Table cell for column "${plan.column.key}" must be a scalar value.`, range, sourceName, { data: { row: rowIndex + 1, column: plan.column.key } }));
        return { ok: false };
    }
    if (scalarValue(node) === null || scalarValue(node) === undefined) {
        diagnostics.push(tableDiagnostic("empty-value", `Table cell for column "${plan.column.key}" is empty.`, range, sourceName, {
            data: { row: rowIndex + 1, column: plan.column.key },
            suggestion: "Empty is not the missing shortcut: omit the cell from the row record instead.",
        }));
        return { ok: false };
    }
    const text = scalar.text;
    switch (plan.type) {
        case "prose": {
            if (text.length > MAX_TABLE_TEXT_CELL_CHARS) {
                diagnostics.push(tableDiagnostic("cell-too-long", `A prose cell holds at most ${MAX_TABLE_TEXT_CELL_CHARS} characters.`, range, sourceName, { data: { row: rowIndex + 1, column: plan.column.key } }));
                return { ok: false };
            }
            const nodes = context.parseInline(text, range);
            if (nodes === undefined)
                return { ok: false };
            return { ok: true, cell: { kind: "prose", value: nodes } };
        }
        case "text": {
            if (text.length > MAX_TABLE_TEXT_CELL_CHARS) {
                diagnostics.push(tableDiagnostic("cell-too-long", `A text cell holds at most ${MAX_TABLE_TEXT_CELL_CHARS} characters.`, range, sourceName, { data: { row: rowIndex + 1, column: plan.column.key } }));
                return { ok: false };
            }
            return { ok: true, cell: { kind: "text", value: text } };
        }
        case "integer":
        case "decimal": {
            let canonical;
            if (scalar.quoted) {
                diagnostics.push(tableDiagnostic("non-numeric-value", `Table cell for column "${plan.column.key}" (${plan.type}) must not be quoted.`, range, sourceName, { data: { row: rowIndex + 1, column: plan.column.key, value: text } }));
                return { ok: false };
            }
            try {
                canonical = canonicalExactDecimal(text);
            }
            catch {
                diagnostics.push(tableDiagnostic("non-numeric-value", `Table cell for column "${plan.column.key}" (${plan.type}) is not a number.`, range, sourceName, {
                    data: { row: rowIndex + 1, column: plan.column.key, value: text },
                    suggestion: `Write an exact decimal value.`,
                }));
                return { ok: false };
            }
            if (plan.type === "integer" && canonical.includes(".")) {
                diagnostics.push(tableDiagnostic("non-numeric-value", `Table cell for column "${plan.column.key}" (integer) is not a whole number.`, range, sourceName, { data: { row: rowIndex + 1, column: plan.column.key, value: text } }));
                return { ok: false };
            }
            return {
                ok: true,
                cell: plan.type === "integer"
                    ? { kind: "integer", value: canonical }
                    : { kind: "decimal", value: canonical },
            };
        }
        case "boolean": {
            const raw = scalarValue(node) ?? text;
            if (raw !== true && raw !== false) {
                diagnostics.push(tableDiagnostic("non-numeric-value", `Table cell for column "${plan.column.key}" (boolean) must be true or false.`, range, sourceName, { data: { row: rowIndex + 1, column: plan.column.key, value: text } }));
                return { ok: false };
            }
            return { ok: true, cell: { kind: "boolean", value: raw } };
        }
        case "quantity": {
            if (plan.column.unit !== undefined) {
                let canonical;
                if (scalar.quoted) {
                    diagnostics.push(tableDiagnostic("invalid-quantity", `Table cell for column "${plan.column.key}" must not be quoted.`, range, sourceName, { data: { row: rowIndex + 1, column: plan.column.key, value: text } }));
                    return { ok: false };
                }
                try {
                    canonical = canonicalExactDecimal(text);
                }
                catch {
                    diagnostics.push(tableDiagnostic("invalid-quantity", `Table cell for column "${plan.column.key}" must be a bare decimal in ${plan.column.unit}.`, range, sourceName, {
                        data: { row: rowIndex + 1, column: plan.column.key, value: text },
                        suggestion: `The column unit "${plan.column.unit}" applies; write the coefficient alone.`,
                    }));
                    return { ok: false };
                }
                return {
                    ok: true,
                    cell: { kind: "quantity", coefficient: canonical, unit: plan.column.unit },
                };
            }
            try {
                const parsed = parseQuantitySpelling(text);
                return {
                    ok: true,
                    cell: { kind: "quantity", coefficient: parsed.coefficient, unit: parsed.unit },
                    dimension: unitDimension(parsed.unit),
                };
            }
            catch (error) {
                diagnostics.push(tableDiagnostic("invalid-quantity", `Table cell for column "${plan.column.key}" is not a valid quantity.`, range, sourceName, {
                    data: { row: rowIndex + 1, column: plan.column.key, value: text },
                    ...(error instanceof QuantityError ? { suggestion: error.message } : {}),
                }));
                return { ok: false };
            }
        }
        case "math": {
            if (text.length > MAX_TABLE_MATH_CELL_CHARS) {
                diagnostics.push(tableDiagnostic("cell-too-long", `A math cell holds at most ${MAX_TABLE_MATH_CELL_CHARS} characters.`, range, sourceName, { data: { row: rowIndex + 1, column: plan.column.key } }));
                return { ok: false };
            }
            const parsed = parseNativeMath(text);
            if ("problems" in parsed) {
                for (const problem of parsed.problems) {
                    const start = problem.offset;
                    const end = problem.offset + Math.max(1, problem.length);
                    diagnostics.push(createDiagnostic(`azeforge.equation#${problem.code}`, problem.severity, problem.message, {
                        location: sourceName === undefined
                            ? { range: subRange(range, start, end) }
                            : { source: sourceName, range: subRange(range, start, end) },
                        data: {
                            row: rowIndex + 1,
                            column: plan.column.key,
                            ...(problem.data ?? {}),
                        },
                        ...(problem.suggestion === undefined
                            ? {}
                            : { suggestion: problem.suggestion }),
                    }));
                }
                return { ok: false };
            }
            return { ok: true, cell: { kind: "math", tree: projectMathNode(parsed.tree) } };
        }
    }
}
/**
 * Shift a cell's range by an offset inside the cell's own spelling, so a
 * mathematics problem is ranged at its own sub-range (the #57 rule).
 */
function subRange(range, start, end) {
    return {
        start: {
            line: range.start.line,
            column: range.start.column + start,
            offset: range.start.offset + start,
        },
        end: {
            line: range.start.line,
            column: range.start.column + end,
            offset: range.start.offset + end,
        },
    };
}
function parseGroups(node, columns, map, sourceName, diagnostics) {
    const items = sequenceItems(node);
    if (items === undefined) {
        diagnostics.push(tableDiagnostic("invalid-groups", "Table `groups` must be a collection.", nodeRange(node, map) ?? map.lineRange(0), sourceName));
        return undefined;
    }
    if (items.length > MAX_TABLE_GROUPS) {
        diagnostics.push(tableDiagnostic("invalid-groups", `A table Block declares at most ${MAX_TABLE_GROUPS} groups.`, nodeRange(node, map) ?? map.lineRange(0), sourceName, { data: { groups: items.length, limit: MAX_TABLE_GROUPS } }));
        return undefined;
    }
    const order = new Map();
    columns.forEach((plan, index) => order.set(plan.column.key, index));
    const claimed = new Map();
    const groups = [];
    const seenNames = new Set();
    for (const item of items) {
        const declarationRange = nodeRange(item, map) ?? map.lineRange(0);
        const pairs = mapPairs(item);
        if (pairs === undefined) {
            diagnostics.push(tableDiagnostic("invalid-group", "Each table group needs a `name` string and a `columns` collection.", declarationRange, sourceName));
            return undefined;
        }
        let name;
        let members;
        for (const pair of pairs) {
            const keyText = isScalarNode(pair.key) ? String(pair.key.value ?? "") : "";
            if (!isTableGroupField(keyText)) {
                diagnostics.push(tableDiagnostic("unknown-group-field", `Unknown table group field "${keyText}".`, nodeRange(pair.key, map) ?? declarationRange, sourceName));
                return undefined;
            }
            if (keyText === "name") {
                name = scalarText(pair.value, map)?.text;
            }
            else {
                // The one other declared group field, `columns`, lists the members.
                members = sequenceItems(pair.value);
                if (members === undefined) {
                    diagnostics.push(tableDiagnostic("invalid-group", "A table group `columns` must be a collection.", nodeRange(pair.value, map) ?? declarationRange, sourceName));
                    return undefined;
                }
            }
        }
        if (name === undefined || name.length === 0 || members === undefined) {
            diagnostics.push(tableDiagnostic("invalid-group", "Each table group needs a `name` string and a `columns` collection.", declarationRange, sourceName));
            return undefined;
        }
        if (seenNames.has(name)) {
            diagnostics.push(tableDiagnostic("duplicate-group", `Table group name "${name}" is declared more than once.`, declarationRange, sourceName, { data: { name } }));
            return undefined;
        }
        seenNames.add(name);
        const keys = [];
        const ranges = [];
        for (const member of members) {
            const scalar = scalarText(member, map);
            const key = scalar?.text ?? "";
            const range = scalar?.range ?? declarationRange;
            const plan = columns.find((candidate) => candidate.column.key === key);
            if (plan === undefined) {
                diagnostics.push(tableDiagnostic("unknown-group-column", `Table group references an unknown column "${key}".`, range, sourceName, { data: { name, column: key } }));
                return undefined;
            }
            if (keys.includes(key)) {
                diagnostics.push(tableDiagnostic("duplicate-group-member", `Table group "${name}" lists column "${key}" more than once.`, range, sourceName, {
                    data: { name, column: key },
                    relatedLocations: [
                        {
                            range: plan.declarationRange,
                            message: `Column "${key}" is declared here.`,
                        },
                    ],
                }));
                return undefined;
            }
            const owner = claimed.get(key);
            if (owner !== undefined) {
                diagnostics.push(tableDiagnostic("duplicate-group-member", `Table column "${key}" already belongs to another group.`, range, sourceName, {
                    data: { name, column: key },
                    relatedLocations: [
                        { range: owner, message: `Column "${key}" is grouped here.` },
                    ],
                }));
                return undefined;
            }
            keys.push(key);
            ranges.push(plan.declarationRange);
        }
        if (keys.length < 2) {
            diagnostics.push(tableDiagnostic("group-too-small", `Table group "${name}" must span at least two columns.`, declarationRange, sourceName, { data: { name, columns: keys.length } }));
            return undefined;
        }
        const indices = keys.map((key) => order.get(key));
        const adjacent = indices.every((value, position) => position === 0 || value === indices[position - 1] + 1);
        if (!adjacent) {
            diagnostics.push(tableDiagnostic("non-adjacent-group", `Table group "${name}" must cite adjacent columns in \`columns:\` order.`, declarationRange, sourceName, {
                data: { name, columns: keys },
                relatedLocations: ranges.map((range, index) => ({
                    range,
                    message: `Column "${keys[index]}" is declared here.`,
                })),
            }));
            return undefined;
        }
        const startIndex = indices[0];
        const ordered = columns.slice(startIndex, startIndex + keys.length);
        for (const plan of ordered)
            claimed.set(plan.column.key, plan.declarationRange);
        groups.push({ name, columns: keys });
    }
    return groups;
}
function parseRows(node, columns, map, context, diagnostics) {
    const sourceName = context.sourceName;
    const items = sequenceItems(node);
    if (items === undefined) {
        diagnostics.push(tableDiagnostic("missing-columns-or-rows", "A table Block body must declare `columns` and `rows` as collections.", nodeRange(node, map) ?? map.lineRange(0), sourceName));
        return undefined;
    }
    if (items.length > MAX_TABLE_ROWS) {
        diagnostics.push(tableDiagnostic("too-many-rows", `A table Block declares at most ${MAX_TABLE_ROWS} rows.`, nodeRange(node, map) ?? map.lineRange(0), sourceName, { data: { rows: items.length, limit: MAX_TABLE_ROWS } }));
        return undefined;
    }
    const columnsNode = node;
    const kinds = new Map(columns.map((plan) => [plan.column.key, plan]));
    const rows = [];
    // Dimension consistency is a per-column rule: every cell of one unitless
    // `quantity` column shares one dimension, and columns never constrain each
    // other (contract: issue #66 §3).
    const dimensions = new Map();
    for (const [rowIndex, item] of items.entries()) {
        const rowRange = nodeRange(item, map) ?? map.lineRange(0);
        const pairs = mapPairs(item);
        if (pairs === undefined) {
            diagnostics.push(tableDiagnostic("invalid-row", "Each table row must be a record keyed by column keys.", rowRange, sourceName, { data: { row: rowIndex + 1 } }));
            return undefined;
        }
        if (pairs.length === 0) {
            diagnostics.push(tableDiagnostic("empty-row", `Row ${rowIndex + 1} declares no cells.`, rowRange, sourceName, { data: { row: rowIndex + 1 } }));
            return undefined;
        }
        const row = {};
        for (const pair of pairs) {
            const keyText = isScalarNode(pair.key) ? String(pair.key.value ?? "") : "";
            const plan = kinds.get(keyText);
            if (plan === undefined) {
                diagnostics.push(tableDiagnostic("unknown-column-key", `Table row references unknown column "${keyText}".`, nodeRange(pair.key, map) ?? rowRange, sourceName, {
                    data: { row: rowIndex + 1, column: keyText },
                    relatedLocations: [
                        {
                            range: nodeRange(columnsNode, map) ?? map.lineRange(0),
                            message: `The declared columns are ${columns
                                .map((candidate) => `"${candidate.column.key}"`)
                                .join(", ")}.`,
                        },
                    ],
                }));
                return undefined;
            }
            const result = parseCellValue(plan, pair.value, map, context, rowIndex, diagnostics);
            if (!result.ok || result.cell === undefined)
                return undefined;
            if (result.dimension !== undefined) {
                const dimension = dimensions.get(plan.column.key);
                if (dimension === undefined)
                    dimensions.set(plan.column.key, result.dimension);
                else if (dimension !== result.dimension) {
                    diagnostics.push(tableDiagnostic("dimension-mismatch", `Column "${plan.column.key}" mixes quantities of different dimensions.`, nodeRange(pair.value, map) ?? rowRange, sourceName, {
                        data: {
                            row: rowIndex + 1,
                            column: plan.column.key,
                            expected: dimension,
                            found: result.dimension,
                        },
                        suggestion: "Author every cell of a unitless quantity column in one dimension.",
                    }));
                    return undefined;
                }
            }
            row[keyText] = result.cell;
        }
        rows.push(row);
    }
    return rows;
}
/**
 * Parse a typed table v2 body. Returns the typed data, or `undefined` after
 * pushing every stable-coded, source-ranged diagnostic the body earned.
 */
export function parseTypedTableData(bodyLines, blockRange, context) {
    const diagnostics = [];
    const map = buildBodyMap(bodyLines);
    if (map.text.trim().length === 0) {
        diagnostics.push(tableDiagnostic("empty-table", "A table Block must declare at least one column.", blockRange, context.sourceName, { suggestion: "Declare typed columns followed by typed rows." }));
        return { diagnostics };
    }
    const document = parseYamlDocument(map.text, {
        prettyErrors: false,
        strict: true,
        uniqueKeys: true,
    });
    for (const error of document.errors) {
        diagnostics.push(tableDiagnostic("invalid-yaml", "The table Block body contains invalid structural declarations.", blockRange, context.sourceName, { data: { detail: typeof error.message === "string" ? error.message : String(error) } }));
    }
    if (document.errors.length > 0)
        return { diagnostics };
    let refused = false;
    visit(document, {
        Alias() {
            refused = true;
            diagnostics.push(tableDiagnostic("alias-disabled", "Table declarations cannot use YAML aliases.", blockRange, context.sourceName));
        },
        Pair(_key, pair) {
            if (isScalar(pair.key) &&
                pair.key.value === "<<" &&
                pair.key.type === "PLAIN") {
                refused = true;
                diagnostics.push(tableDiagnostic("merge-key-disabled", "Table declarations cannot use YAML merge keys.", blockRange, context.sourceName));
            }
        },
        Node(_key, node) {
            if (!isAlias(node) && node.anchor !== undefined) {
                refused = true;
                diagnostics.push(tableDiagnostic("anchor-disabled", "Table declarations cannot use YAML anchors.", blockRange, context.sourceName));
            }
            if (node.tag !== undefined) {
                refused = true;
                diagnostics.push(tableDiagnostic("tag-disabled", "Table declarations cannot use YAML tags.", blockRange, context.sourceName));
            }
        },
    });
    if (refused)
        return { diagnostics };
    const pairs = mapPairs(document.contents);
    if (pairs === undefined) {
        diagnostics.push(tableDiagnostic("body-must-be-records", "A table Block body must be a declaration record, not a scalar or list.", blockRange, context.sourceName));
        return { diagnostics };
    }
    const known = new Map();
    for (const pair of pairs) {
        const keyText = isScalarNode(pair.key) ? String(pair.key.value ?? "") : "";
        if (keyText === "columns" || keyText === "rows" || keyText === "groups") {
            known.set(keyText, pair);
        }
        else {
            diagnostics.push(tableDiagnostic("unknown-body-field", `Unknown table body field "${keyText}".`, nodeRange(pair.key, map) ?? blockRange, context.sourceName, { suggestion: "Use columns, groups, or rows." }));
            return { diagnostics };
        }
    }
    const columnsPair = known.get("columns");
    if (columnsPair === undefined) {
        diagnostics.push(tableDiagnostic("missing-columns-or-rows", "A table Block body must declare `columns:`.", blockRange, context.sourceName));
        return { diagnostics };
    }
    const columns = parseColumns(columnsPair.value, map, context.sourceName, diagnostics);
    if (columns === undefined)
        return { diagnostics };
    const groupsPair = known.get("groups");
    const groups = groupsPair === undefined
        ? undefined
        : parseGroups(groupsPair.value, columns, map, context.sourceName, diagnostics);
    if (groupsPair !== undefined && groups === undefined)
        return { diagnostics };
    // A columns-only table with zero rows is legal and silent.
    const rowsPair = known.get("rows");
    const rows = rowsPair === undefined
        ? []
        : parseRows(rowsPair.value, columns, map, context, diagnostics);
    if (rows === undefined)
        return { diagnostics };
    return {
        data: {
            columns: columns.map((plan) => plan.column),
            ...(groups === undefined || groups.length === 0 ? {} : { groups }),
            rows,
        },
        diagnostics,
    };
}
/**
 * Mechanical v1 pipe-table migration (contract: issue #66 §12): a GFM header
 * row becomes `prose` columns with names verbatim, GFM alignment markers
 * become `align:` overrides, and every cell becomes a `prose` value with its
 * Inline content preserved. Provable equivalence, no unit inference.
 */
export function migrateGfmTable(data) {
    const keys = [];
    const used = new Set();
    data.header.forEach((cell, index) => {
        const label = inlineTextValue(cell).trim();
        let key = label
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");
        if (key === "" || !TABLE_COLUMN_KEY.test(key))
            key = `column-${index + 1}`;
        let candidate = key;
        let suffix = 2;
        while (used.has(candidate)) {
            candidate = `${key}-${suffix}`;
            suffix += 1;
        }
        used.add(candidate);
        keys.push(candidate);
    });
    const columns = data.header.map((cell, index) => {
        const alignment = data.align[index] ?? null;
        const label = inlineTextValue(cell).trim();
        return {
            key: keys[index],
            type: "prose",
            align: alignment ?? DEFAULT_ALIGNMENT.prose,
            ...(label === "" ? {} : { name: label }),
        };
    });
    const rows = data.rows.map((row) => {
        const record = {};
        row.forEach((cell, index) => {
            const key = keys[index];
            if (key === undefined)
                return;
            record[key] = { kind: "prose", value: cell };
        });
        return record;
    });
    return { columns, rows };
}
//# sourceMappingURL=table-parse.js.map