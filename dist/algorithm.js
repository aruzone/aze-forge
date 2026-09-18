import { ALGORITHM_PLUGIN_TYPE, ALGORITHM_PLUGIN_VERSION, ALGORITHM_BODY_SYNTAX_ID, ALGORITHM_BODY_SYNTAX_VERSION, algorithmSourceSchema, algorithmDataSchema, } from "./algorithm-schemas.js";
import { parseCompositionHeader } from "./block-header.js";
import { createDiagnostic } from "./diagnostics.js";
import { escapeAttribute, escapeHtml, numberingLabelHtml, renderInlineHtml, } from "./html-fragment.js";
import { rangeFromLineSlice } from "./source-map.js";
/**
 * Native algorithms/pseudocode (contract: issue #66 §§5–6). One procedure per
 * Block, a closed six-form statement set, and the bounded parsed-but-never
 * -evaluated pseudocode expression context.
 *
 * The six semantic codes fixed by issue #66 §10 keep their own spellings.
 * Declaration faults — an unknown, duplicated or mis-shaped record field —
 * follow the shared record rules of issue #52 §4 and report the shared
 * `#unknown-field` spelling every other family uses.
 */
export const ALGORITHM_HTML_BLOCK_RENDERER_ID = "azeforge.algorithm.html/v1";
export const ALGORITHM_HTML_BLOCK_RENDERER_VERSION = "1.0.0";
export const MAX_ALGORITHM_STATEMENTS = 256;
export const MAX_ALGORITHM_NESTING_DEPTH = 8;
export const MAX_ALGORITHM_PARAMETERS = 32;
export const MAX_PSEUDOCODE_EXPRESSION_LENGTH = 200;
/** The registered pseudocode function names (contract: issue #66 §6). */
export const PSEUDOCODE_FUNCTIONS = Object.freeze([
    "floor",
    "ceil",
    "abs",
    "min",
    "max",
    "sqrt",
    "gcd",
    "log",
    "length",
]);
/** The six statement keywords, in the order the remedy names them. */
export const ALGORITHM_STATEMENT_KEYS = Object.freeze([
    "assign",
    "if",
    "for",
    "while",
    "return",
    "text",
]);
const STATEMENT_FORMS = ALGORITHM_STATEMENT_KEYS.map((key) => `\`${key}:\``).join(", ");
const STATEMENT_SUGGESTION = `Use one of the six algorithm statements: ${STATEMENT_FORMS}.`;
const EXPRESSION_HINT = "Pseudocode expressions use identifiers, integer or decimal literals, " +
    "`+ - * / mod div`, `== != < <= > >=`, `and or not`, `A[expr]`, " +
    "`name(args)` and parentheses.";
const pluginDescriptor = Object.freeze({
    type: ALGORITHM_PLUGIN_TYPE,
    version: ALGORITHM_PLUGIN_VERSION,
    title: "Algorithm",
    summary: "One procedure with ordered statements in the pseudocode context.",
    diagnosticNamespace: "azeforge.algorithm",
    sourceSchema: algorithmSourceSchema,
    bodySyntax: Object.freeze({
        id: ALGORITHM_BODY_SYNTAX_ID,
        version: ALGORITHM_BODY_SYNTAX_VERSION,
    }),
    dataSchema: algorithmDataSchema,
});
export const algorithmPlugin = Object.freeze({
    descriptor: pluginDescriptor,
});
const blockRendererDescriptor = Object.freeze({
    id: ALGORITHM_HTML_BLOCK_RENDERER_ID,
    version: ALGORITHM_HTML_BLOCK_RENDERER_VERSION,
    blockType: ALGORITHM_PLUGIN_TYPE,
    pluginVersionRange: ALGORITHM_PLUGIN_VERSION,
    rendererId: "html",
    rendererVersionRange: "1.0.0",
});
export function parseAlgorithmHeader(entries, _blockRange, sourceName, parseCaption) {
    const header = parseCompositionHeader(entries, sourceName, {
        namespace: "azeforge.algorithm",
        known: [],
        parseCaption,
    });
    return {
        diagnostics: header.diagnostics,
        ...(header.id === undefined ? {} : { id: header.id }),
        ...(header.number === undefined ? {} : { number: header.number }),
        ...(header.caption === undefined ? {} : { caption: header.caption }),
    };
}
/* ------------------------------------------------------------------ *
 * Diagnostics
 * ------------------------------------------------------------------ */
function algorithmDiagnostic(code, message, range, sourceName, extra = {}) {
    return createDiagnostic(`azeforge.algorithm#${code}`, "error", message, {
        location: sourceName === undefined ? { range } : { source: sourceName, range },
        ...(extra.suggestion === undefined ? {} : { suggestion: extra.suggestion }),
        ...(extra.data === undefined ? {} : { data: extra.data }),
    });
}
/* ------------------------------------------------------------------ *
 * Shared declaration reader (contract: issue #52 §4)
 * ------------------------------------------------------------------ */
const FIELD = /^([A-Za-z][A-Za-z0-9-]*)[ \t]*:(.*)$/;
const ITEM = /^-([ \t]*)(.*)$/;
const STRUCTURAL_COMMENT = /^[ \t]*\/\/(?:[ \t].*)?$/;
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** Reader frames per statement level; a stack-safety net, never a language rule. */
const MAX_DECLARATION_FRAMES = 4 * (MAX_ALGORITHM_NESTING_DEPTH + 1);
function lineRange(line) {
    return rangeFromLineSlice(line, 0, line.text.length);
}
/** A sub-range inside `line`, clamped to the line's own extents. */
function subRange(line, start, length) {
    const from = Math.max(0, Math.min(start, line.text.length));
    const to = Math.max(from, Math.min(from + length, line.text.length));
    return rangeFromLineSlice(line, from, to);
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
function declarationKey(text) {
    const match = /^[ \t]*(?:-[ \t]*)?([A-Za-z][A-Za-z0-9-]*)[ \t]*:/.exec(text);
    return match?.[1]?.toLowerCase() ?? text.trim();
}
function baselineIndent(lines) {
    for (const line of lines) {
        if (line.text.trim() === "" || STRUCTURAL_COMMENT.test(line.text))
            continue;
        return leadingIndent(line.text) ?? 0;
    }
    return 0;
}
function indentationFault(ctx, line) {
    ctx.diagnostics.push(algorithmDiagnostic("unknown-field", "Declarations indent with spaces only, two per structural level.", lineRange(line), ctx.sourceName, { data: { field: declarationKey(line.text) } }));
}
function expectedDeclaration(ctx, line, message) {
    ctx.diagnostics.push(algorithmDiagnostic("unknown-field", message, lineRange(line), ctx.sourceName, {
        data: { field: declarationKey(line.text) },
    }));
}
/** One `key: value` declaration; an empty value opens the nested structure. */
function readField(ctx, start, indent, depth) {
    const line = ctx.lines[start];
    if (line === undefined)
        return undefined;
    const text = line.text;
    const lineIndent = leadingIndent(text);
    if (lineIndent === undefined)
        return undefined;
    const match = FIELD.exec(text.slice(lineIndent));
    if (match === null)
        return undefined;
    const key = (match[1] ?? "").toLowerCase();
    let valueStart = lineIndent + match[0].length - (match[2] ?? "").length;
    while (valueStart < text.length) {
        const character = text.charAt(valueStart);
        if (character !== " " && character !== "\t")
            break;
        valueStart += 1;
    }
    const value = text.slice(valueStart).trimEnd();
    const range = lineRange(line);
    if (value !== "") {
        return { field: { key, value, line, valueStart, range }, next: start + 1 };
    }
    let cursor = start + 1;
    while (cursor < ctx.lines.length) {
        const candidate = ctx.lines[cursor];
        if (candidate === undefined)
            break;
        if (candidate.text.trim() === "" || STRUCTURAL_COMMENT.test(candidate.text)) {
            cursor += 1;
            continue;
        }
        break;
    }
    const first = ctx.lines[cursor];
    const firstIndent = first === undefined ? undefined : leadingIndent(first.text);
    if (first !== undefined &&
        firstIndent !== undefined &&
        firstIndent - ctx.baseline === indent + 2 &&
        ITEM.test(first.text.slice(firstIndent))) {
        const nested = readEntries(ctx, start + 1, indent + 2, depth + 1);
        return {
            field: { key, value, line, valueStart, range, collection: nested.entries },
            next: nested.next,
        };
    }
    const nested = readFields(ctx, start + 1, indent + 2, depth + 1);
    if (nested.fields.length === 0) {
        return {
            field: { key, value, line, valueStart, range, collection: [] },
            next: nested.next,
        };
    }
    return {
        field: { key, value, line, valueStart, range, record: nested.fields },
        next: nested.next,
    };
}
/** Fields at exactly `indent`; each may open one nested structure one level in. */
function readFields(ctx, start, indent, depth) {
    if (depth > MAX_DECLARATION_FRAMES)
        return { fields: [], next: start };
    const fields = [];
    let index = start;
    while (index < ctx.lines.length) {
        const line = ctx.lines[index];
        if (line === undefined)
            break;
        const text = line.text;
        if (text.trim() === "" || STRUCTURAL_COMMENT.test(text)) {
            index += 1;
            continue;
        }
        const lineIndent = leadingIndent(text);
        if (lineIndent === undefined) {
            indentationFault(ctx, line);
            index += 1;
            continue;
        }
        const level = Math.max(0, lineIndent - ctx.baseline);
        if (level < indent)
            break;
        if (level > indent || ITEM.test(text.slice(lineIndent))) {
            expectedDeclaration(ctx, line, `Expected a \`key: value\` declaration at indentation ${indent}.`);
            index += 1;
            continue;
        }
        const read = readField(ctx, index, indent, depth);
        if (read === undefined) {
            expectedDeclaration(ctx, line, "Expected a `key: value` declaration.");
            index += 1;
            continue;
        }
        fields.push(read.field);
        index = read.next;
    }
    return { fields, next: index };
}
/** Ordered collection items at exactly `indent`: `- value` or `- key: value`. */
function readEntries(ctx, start, indent, depth) {
    if (depth > MAX_DECLARATION_FRAMES)
        return { entries: [], next: start };
    const entries = [];
    let index = start;
    while (index < ctx.lines.length) {
        const line = ctx.lines[index];
        if (line === undefined)
            break;
        const text = line.text;
        if (text.trim() === "" || STRUCTURAL_COMMENT.test(text)) {
            index += 1;
            continue;
        }
        const lineIndent = leadingIndent(text);
        if (lineIndent === undefined) {
            indentationFault(ctx, line);
            index += 1;
            continue;
        }
        const level = Math.max(0, lineIndent - ctx.baseline);
        if (level < indent)
            break;
        if (level > indent) {
            expectedDeclaration(ctx, line, `Expected a \`- \` collection item at indentation ${indent}.`);
            index += 1;
            continue;
        }
        const item = ITEM.exec(text.slice(lineIndent));
        if (item === null) {
            expectedDeclaration(ctx, line, "Expected a `- ` collection item.");
            index += 1;
            continue;
        }
        const content = item[2] ?? "";
        const contentStart = lineIndent + item[0].length - content.length;
        const contentText = content.trimEnd();
        const range = lineRange(line);
        const match = FIELD.exec(contentText);
        if (match === null) {
            entries.push({
                line,
                range,
                value: contentText,
                valueStart: contentStart,
                fields: [],
            });
            index += 1;
            continue;
        }
        const key = (match[1] ?? "").toLowerCase();
        let valueStart = contentStart + match[0].length - (match[2] ?? "").length;
        while (valueStart < text.length) {
            const character = text.charAt(valueStart);
            if (character !== " " && character !== "\t")
                break;
            valueStart += 1;
        }
        const value = text.slice(valueStart).trimEnd();
        if (value === "") {
            // The field sits on the item line, one structural level in: its own
            // nested collection therefore opens at `indent + 4`.
            const deeper = readEntries(ctx, index + 1, indent + 4, depth + 1);
            entries.push({
                line,
                range,
                value: "",
                valueStart,
                fields: [
                    {
                        key,
                        value: "",
                        line,
                        valueStart,
                        range,
                        collection: deeper.entries,
                    },
                ],
            });
            index = deeper.next;
            continue;
        }
        const nested = readFields(ctx, index + 1, indent + 2, depth + 1);
        const fields = [
            { key, value, line, valueStart, range },
            ...nested.fields,
        ];
        entries.push({
            line,
            range,
            value: contentText,
            valueStart: contentStart,
            fields,
        });
        index = nested.next;
    }
    return { entries, next: index };
}
const KEYWORD_OPERATORS = Object.freeze([
    "and",
    "or",
    "not",
    "mod",
    "div",
]);
const SYMBOL_OPERATORS = Object.freeze([
    "==",
    "!=",
    "<=",
    ">=",
    "<",
    ">",
    "+",
    "-",
    "*",
    "/",
]);
const COMPARISON_OPERATORS = Object.freeze([
    "==",
    "!=",
    "<=",
    ">=",
    "<",
    ">",
]);
const PUNCTUATION = "()[],";
function isDigit(character) {
    return character >= "0" && character <= "9";
}
function isIdentifierStart(character) {
    return ((character >= "a" && character <= "z") ||
        (character >= "A" && character <= "Z") ||
        character === "_");
}
function isIdentifierPart(character) {
    return isIdentifierStart(character) || isDigit(character);
}
/**
 * The whole tokenizer: identifiers (never case-folded), integer and decimal
 * literals, the two keyword operator families, the comparison and arithmetic
 * symbols, indexing/application punctuation and a lone `=`.
 */
function lexExpression(text) {
    const tokens = [];
    let index = 0;
    while (index < text.length) {
        const character = text.charAt(index);
        if (character === " " || character === "\t") {
            index += 1;
            continue;
        }
        if (isIdentifierStart(character)) {
            let end = index + 1;
            while (end < text.length && isIdentifierPart(text.charAt(end)))
                end += 1;
            const word = text.slice(index, end);
            const keyword = KEYWORD_OPERATORS.includes(word);
            tokens.push({
                kind: keyword ? "operator" : "ident",
                text: word,
                start: index,
                length: word.length,
            });
            index = end;
            continue;
        }
        if (isDigit(character)) {
            let end = index + 1;
            while (end < text.length && isDigit(text.charAt(end)))
                end += 1;
            if (text.charAt(end) === "." && isDigit(text.charAt(end + 1))) {
                end += 1;
                while (end < text.length && isDigit(text.charAt(end)))
                    end += 1;
            }
            tokens.push({
                kind: "number",
                text: text.slice(index, end),
                start: index,
                length: end - index,
            });
            index = end;
            continue;
        }
        const symbol = SYMBOL_OPERATORS.find((operator) => text.startsWith(operator, index));
        if (symbol !== undefined) {
            tokens.push({
                kind: "operator",
                text: symbol,
                start: index,
                length: symbol.length,
            });
            index += symbol.length;
            continue;
        }
        if (character === "=") {
            tokens.push({ kind: "equals", text: "=", start: index, length: 1 });
            index += 1;
            continue;
        }
        if (PUNCTUATION.includes(character)) {
            tokens.push({ kind: "punct", text: character, start: index, length: 1 });
            index += 1;
            continue;
        }
        return {
            tokens,
            fault: {
                code: "unknown-expression-token",
                message: `"${character}" is not part of the pseudocode expression context.`,
                suggestion: EXPRESSION_HINT,
                start: index,
                length: 1,
            },
        };
    }
    return { tokens };
}
function printExpression(node) {
    switch (node.kind) {
        case "ident":
            return node.name;
        case "number":
            return node.spelling;
        case "unary":
            return node.op === "not"
                ? `not ${printExpression(node.operand)}`
                : `-${printExpression(node.operand)}`;
        case "binary":
            return `${printExpression(node.left)} ${node.op} ${printExpression(node.right)}`;
        case "index":
            return `${printExpression(node.base)}[${printExpression(node.index)}]`;
        case "apply":
            return `${node.name}(${node.args.map(printExpression).join(", ")})`;
        case "group":
            return `(${printExpression(node.node)})`;
    }
}
class ExpressionSyntaxError extends Error {
    fault;
    constructor(fault) {
        super(fault.message);
        this.name = "ExpressionSyntaxError";
        this.fault = fault;
    }
}
function faultFor(token, mode) {
    if (token.kind === "equals" && mode === "condition") {
        return {
            code: "assignment-in-condition",
            message: "A condition must compare; a bare `=` assigns. Equality in conditions is `==`.",
            suggestion: "Write `==` for equality.",
            start: token.start,
            length: token.length,
        };
    }
    return {
        code: "unknown-expression-token",
        message: `Unexpected "${token.text}" in a pseudocode expression.`,
        suggestion: EXPRESSION_HINT,
        start: token.start,
        length: token.length,
    };
}
/**
 * Precedence-climbing structural validator. Every operand-free position is a
 * fault; the first fault is reported and the rest of the expression is not
 * re-interpreted, which keeps dependent cascades suppressed.
 */
class PseudocodeParser {
    tokens;
    mode;
    end;
    position = 0;
    constructor(tokens, mode, end) {
        this.tokens = tokens;
        this.mode = mode;
        this.end = end;
    }
    parse() {
        const node = this.parseOr();
        const token = this.peek();
        if (token !== undefined)
            this.fail(token);
        return node;
    }
    peek() {
        return this.tokens[this.position];
    }
    atPunct(text) {
        const token = this.peek();
        return token !== undefined && token.kind === "punct" && token.text === text;
    }
    atOperator(text) {
        const token = this.peek();
        return (token !== undefined && token.kind === "operator" && token.text === text);
    }
    atComparison() {
        const token = this.peek();
        return (token !== undefined &&
            token.kind === "operator" &&
            COMPARISON_OPERATORS.includes(token.text));
    }
    advance() {
        const token = this.tokens[this.position];
        if (token === undefined)
            this.failEnd();
        this.position += 1;
        return token;
    }
    /** Consume the closing punctuation an operand or argument list requires. */
    expectPunct(text) {
        const token = this.peek();
        if (token === undefined)
            this.failEnd();
        if (token.kind !== "punct" || token.text !== text)
            this.fail(token);
        this.advance();
    }
    fail(token) {
        throw new ExpressionSyntaxError(faultFor(token, this.mode));
    }
    failEnd() {
        throw new ExpressionSyntaxError({
            code: "unknown-expression-token",
            message: "A pseudocode expression ends before it is complete.",
            suggestion: EXPRESSION_HINT,
            start: this.end,
            length: 0,
        });
    }
    parseOr() {
        let node = this.parseAnd();
        while (this.atOperator("or")) {
            this.advance();
            node = { kind: "binary", op: "or", left: node, right: this.parseAnd() };
        }
        return node;
    }
    parseAnd() {
        let node = this.parseNot();
        while (this.atOperator("and")) {
            this.advance();
            node = { kind: "binary", op: "and", left: node, right: this.parseNot() };
        }
        return node;
    }
    parseNot() {
        if (this.atOperator("not")) {
            this.advance();
            return { kind: "unary", op: "not", operand: this.parseNot() };
        }
        return this.parseComparison();
    }
    parseComparison() {
        let node = this.parseAdditive();
        while (this.atComparison()) {
            const op = this.advance().text;
            node = {
                kind: "binary",
                op,
                left: node,
                right: this.parseAdditive(),
            };
        }
        return node;
    }
    parseAdditive() {
        let node = this.parseMultiplicative();
        while (this.atOperator("+") || this.atOperator("-")) {
            const op = this.advance().text;
            node = {
                kind: "binary",
                op,
                left: node,
                right: this.parseMultiplicative(),
            };
        }
        return node;
    }
    parseMultiplicative() {
        let node = this.parseUnary();
        while (this.atOperator("*") ||
            this.atOperator("/") ||
            this.atOperator("mod") ||
            this.atOperator("div")) {
            const op = this.advance().text;
            node = { kind: "binary", op, left: node, right: this.parseUnary() };
        }
        return node;
    }
    parseUnary() {
        if (this.atOperator("-")) {
            this.advance();
            return { kind: "unary", op: "-", operand: this.parseUnary() };
        }
        return this.parsePostfix();
    }
    parsePostfix() {
        let node = this.parsePrimary();
        while (this.atPunct("[")) {
            this.advance();
            const index = this.parseOr();
            this.expectPunct("]");
            node = { kind: "index", base: node, index };
        }
        return node;
    }
    parsePrimary() {
        const token = this.peek();
        if (token === undefined)
            this.failEnd();
        if (token.kind === "number") {
            this.advance();
            return { kind: "number", spelling: token.text };
        }
        if (token.kind === "ident") {
            this.advance();
            if (!this.atPunct("("))
                return { kind: "ident", name: token.text };
            this.advance();
            const args = [];
            if (!this.atPunct(")")) {
                args.push(this.parseOr());
                while (this.atPunct(",")) {
                    this.advance();
                    args.push(this.parseOr());
                }
            }
            this.expectPunct(")");
            return { kind: "apply", name: token.text, args };
        }
        if (token.kind === "punct" && token.text === "(") {
            this.advance();
            const inner = this.parseOr();
            this.expectPunct(")");
            return { kind: "group", node: inner };
        }
        this.fail(token);
    }
}
function parseTokenExpression(tokens, mode, end) {
    try {
        const node = new PseudocodeParser(tokens, mode, end).parse();
        return { spelling: printExpression(node) };
    }
    catch (error) {
        if (error instanceof ExpressionSyntaxError)
            return { fault: error.fault };
        throw error;
    }
}
function parsePseudocodeExpression(text, mode) {
    const lexed = lexExpression(text);
    if (lexed.fault !== undefined)
        return { fault: lexed.fault };
    return parseTokenExpression(lexed.tokens, mode, text.length);
}
function reportExpressionFault(ctx, fault, line, base) {
    ctx.diagnostics.push(algorithmDiagnostic(fault.code, fault.message, subRange(line, base + fault.start, fault.length), ctx.sourceName, { suggestion: fault.suggestion }));
}
/** The authored characters of one expression position, trimmed and located. */
function expressionSlice(field, from, to) {
    const raw = field.value.slice(from, Math.max(from, to));
    const lead = raw.length - raw.trimStart().length;
    return { text: raw.trim(), base: field.valueStart + from + lead };
}
/**
 * The issue #66 §13 ceiling for one pseudocode expression position, wherever
 * that position sits: a condition, an assignment side, a `for:` bound or
 * `by`, or a target's indexing level. False means the ceiling was reported
 * and the position must not be parsed further.
 */
function withinExpressionCeiling(ctx, field, slice) {
    if (slice.text.length <= MAX_PSEUDOCODE_EXPRESSION_LENGTH)
        return true;
    ctx.diagnostics.push(algorithmDiagnostic("limit-exceeded", `A pseudocode expression may be at most ${MAX_PSEUDOCODE_EXPRESSION_LENGTH} characters.`, subRange(field.line, slice.base, slice.text.length), ctx.sourceName, {
        data: {
            subject: "expression-length",
            count: slice.text.length,
            limit: MAX_PSEUDOCODE_EXPRESSION_LENGTH,
        },
    }));
    return false;
}
/** Validate one expression and return its canonical spelling. */
function expressionSpelling(ctx, field, text, base, mode) {
    if (!withinExpressionCeiling(ctx, field, { text, base }))
        return undefined;
    const parsed = parsePseudocodeExpression(text, mode);
    if ("fault" in parsed) {
        reportExpressionFault(ctx, parsed.fault, field.line, base);
        return undefined;
    }
    return parsed.spelling;
}
function conditionSpelling(ctx, field, keyword) {
    if (field.value === "") {
        ctx.diagnostics.push(algorithmDiagnostic("missing-body", `A \`${keyword}:\` statement requires a condition.`, field.range, ctx.sourceName, {
            data: { statement: keyword },
            suggestion: `Write \`${keyword}: lo <= hi\`.`,
        }));
        return undefined;
    }
    return expressionSpelling(ctx, field, field.value, field.valueStart, "condition");
}
function assignmentTarget(ctx, field, tokens, targetLength) {
    const range = subRange(field.line, field.valueStart, targetLength);
    const fail = (message) => {
        ctx.diagnostics.push(algorithmDiagnostic("invalid-assign-target", message, range, ctx.sourceName, {
            suggestion: "An assignment target is a name or one indexing level, such as `A[i]`.",
        }));
        return undefined;
    };
    const first = tokens[0];
    if (first === undefined)
        return fail("An assignment target must name a variable.");
    if (first.kind !== "ident") {
        return fail(`\`${first.text}\` is not an assignable name.`);
    }
    if (tokens.length === 1)
        return { name: first.text };
    let depth = 0;
    let close = -1;
    for (let index = 1; index < tokens.length; index += 1) {
        const token = tokens[index];
        if (token === undefined || token.kind !== "punct")
            continue;
        if (token.text === "[")
            depth += 1;
        else if (token.text === "]") {
            depth -= 1;
            if (depth === 0) {
                close = index;
                break;
            }
        }
    }
    const open = tokens[1];
    if (open === undefined ||
        open.kind !== "punct" ||
        open.text !== "[" ||
        close !== tokens.length - 1 ||
        close < 2) {
        return fail("An assignment target allows one indexing level, such as `A[i]`.");
    }
    const closeToken = tokens[close];
    const indexEnd = closeToken === undefined ? targetLength : closeToken.start;
    const indexSlice = expressionSlice(field, open.start + open.length, indexEnd);
    if (!withinExpressionCeiling(ctx, field, indexSlice))
        return undefined;
    const parsed = parseTokenExpression(tokens.slice(2, close), "expression", indexEnd);
    if ("fault" in parsed) {
        reportExpressionFault(ctx, parsed.fault, field.line, field.valueStart);
        return undefined;
    }
    return { name: first.text, index: parsed.spelling };
}
function rejectExtraFields(ctx, fields, from) {
    for (let index = from; index < fields.length; index += 1) {
        const field = fields[index];
        if (field === undefined)
            continue;
        ctx.diagnostics.push(algorithmDiagnostic("unknown-field", `An algorithm statement has no \`${field.key}:\` field.`, field.range, ctx.sourceName, {
            data: { field: field.key },
            suggestion: "A statement record declares only its own form's fields.",
        }));
    }
}
/** One `then:`/`do:`/`else:` body: a non-empty ordered statement collection. */
function branchStatements(ctx, field, depth) {
    if (field.record !== undefined) {
        ctx.diagnostics.push(algorithmDiagnostic("unknown-field", `\`${field.key}:\` holds an ordered collection of statements.`, field.range, ctx.sourceName, {
            data: { field: field.key },
            suggestion: `Write each statement as a \`- <keyword>:\` item one level under \`${field.key}:\`.`,
        }));
        return [];
    }
    const entries = field.collection ?? [];
    if (entries.length === 0) {
        ctx.diagnostics.push(algorithmDiagnostic("missing-body", `\`${field.key}:\` requires at least one statement.`, field.range, ctx.sourceName, { data: { field: field.key }, suggestion: STATEMENT_SUGGESTION }));
        return [];
    }
    return parseStatements(ctx, entries, depth + 1);
}
function parseStatements(ctx, entries, depth) {
    if (depth > MAX_ALGORITHM_NESTING_DEPTH) {
        if (!ctx.depthReported) {
            ctx.depthReported = true;
            const first = entries[0];
            ctx.diagnostics.push(algorithmDiagnostic("limit-exceeded", `An algorithm nests at most ${MAX_ALGORITHM_NESTING_DEPTH} statement levels.`, first === undefined ? ctx.blockRange : first.range, ctx.sourceName, {
                data: {
                    subject: "nesting-depth",
                    count: depth,
                    limit: MAX_ALGORITHM_NESTING_DEPTH,
                },
            }));
        }
        return [];
    }
    const statements = [];
    for (const entry of entries) {
        if (ctx.statementCount >= MAX_ALGORITHM_STATEMENTS) {
            if (!ctx.statementsReported) {
                ctx.statementsReported = true;
                ctx.diagnostics.push(algorithmDiagnostic("limit-exceeded", `An algorithm holds at most ${MAX_ALGORITHM_STATEMENTS} statements.`, entry.range, ctx.sourceName, {
                    data: {
                        subject: "statements",
                        count: ctx.statementCount + 1,
                        limit: MAX_ALGORITHM_STATEMENTS,
                    },
                }));
            }
            break;
        }
        const statement = parseStatement(ctx, entry, depth);
        if (statement === undefined)
            continue;
        ctx.statementCount += 1;
        statements.push(statement);
    }
    return statements;
}
function parseStatement(ctx, entry, depth) {
    const fields = entry.fields;
    const head = fields[0];
    if (head === undefined) {
        if (entry.value === "") {
            ctx.diagnostics.push(algorithmDiagnostic("missing-body", "An algorithm statement requires one of the six statement forms.", entry.range, ctx.sourceName, { suggestion: STATEMENT_SUGGESTION }));
        }
        else {
            ctx.diagnostics.push(algorithmDiagnostic("unknown-statement", `\`${entry.value}\` is not an algorithm statement.`, entry.range, ctx.sourceName, {
                data: { statement: entry.value },
                suggestion: STATEMENT_SUGGESTION,
            }));
        }
        return undefined;
    }
    switch (head.key) {
        case "assign":
            return parseAssignStatement(ctx, entry, head);
        case "if":
            return parseIfStatement(ctx, entry, fields, depth);
        case "for":
            return parseForStatement(ctx, entry, head, fields, depth);
        case "while":
            return parseWhileStatement(ctx, entry, fields, depth);
        case "return":
            return parseReturnStatement(ctx, entry, head);
        case "text":
            return parseTextStatement(ctx, entry, head);
        default:
            ctx.diagnostics.push(algorithmDiagnostic("unknown-statement", `\`${head.key}\` is not an algorithm statement.`, entry.range, ctx.sourceName, {
                data: { statement: head.key },
                suggestion: STATEMENT_SUGGESTION,
            }));
            return undefined;
    }
}
function parseAssignStatement(ctx, entry, head) {
    rejectExtraFields(ctx, entry.fields, 1);
    const missing = () => {
        ctx.diagnostics.push(algorithmDiagnostic("missing-body", "An `assign:` statement requires `target = expression`.", head.range, ctx.sourceName, { suggestion: "Write `assign: total = total + 1`." }));
        return undefined;
    };
    if (head.value === "")
        return missing();
    const lexed = lexExpression(head.value);
    if (lexed.fault !== undefined) {
        reportExpressionFault(ctx, lexed.fault, head.line, head.valueStart);
        return undefined;
    }
    const equals = lexed.tokens.findIndex((token) => token.kind === "equals");
    const equalsToken = equals < 0 ? undefined : lexed.tokens[equals];
    if (equalsToken === undefined)
        return missing();
    const target = assignmentTarget(ctx, head, lexed.tokens.slice(0, equals), equalsToken.start);
    if (target === undefined)
        return undefined;
    const rest = head.value.slice(equalsToken.start + equalsToken.length);
    const restLead = rest.length - rest.trimStart().length;
    const expressionText = rest.trim();
    const expressionBase = head.valueStart + equalsToken.start + equalsToken.length + restLead;
    if (expressionText === "") {
        ctx.diagnostics.push(algorithmDiagnostic("missing-body", "An `assign:` statement requires an expression after `=`.", subRange(head.line, head.valueStart + equalsToken.start, equalsToken.length), ctx.sourceName, { suggestion: "Write `assign: total = total + 1`." }));
        return undefined;
    }
    const expression = expressionSpelling(ctx, head, expressionText, expressionBase, "expression");
    if (expression === undefined)
        return undefined;
    return {
        kind: "assign",
        target: target.name,
        ...(target.index === undefined ? {} : { index: target.index }),
        expression,
        range: entry.range,
    };
}
function parseIfStatement(ctx, entry, fields, depth) {
    const head = fields[0];
    if (head === undefined)
        return undefined;
    const condition = conditionSpelling(ctx, head, "if");
    if (condition === undefined)
        return undefined;
    let index = 1;
    const thenField = fields[index];
    if (thenField === undefined || thenField.key !== "then") {
        ctx.diagnostics.push(algorithmDiagnostic("missing-body", "An `if:` statement requires `then:`.", head.range, ctx.sourceName, {
            data: { statement: "if", field: "then" },
            suggestion: "Add a `then:` collection holding the statements taken when the condition holds.",
        }));
        return undefined;
    }
    const then = branchStatements(ctx, thenField, depth);
    index += 1;
    const elseIf = [];
    while (true) {
        const branchField = fields[index];
        if (branchField === undefined || branchField.key !== "else-if")
            break;
        index += 1;
        const branchCondition = conditionSpelling(ctx, branchField, "else-if");
        const branchThen = fields[index];
        if (branchThen === undefined || branchThen.key !== "then") {
            ctx.diagnostics.push(algorithmDiagnostic("missing-body", "An `else-if:` branch requires `then:`.", branchField.range, ctx.sourceName, {
                data: { statement: "if", field: "then" },
                suggestion: "Add a `then:` collection holding the statements taken when the branch condition holds.",
            }));
            break;
        }
        index += 1;
        const statements = branchStatements(ctx, branchThen, depth);
        if (branchCondition !== undefined) {
            elseIf.push({
                condition: branchCondition,
                statements,
                range: branchField.range,
            });
        }
    }
    let elseStatements;
    const elseField = fields[index];
    if (elseField !== undefined && elseField.key === "else") {
        index += 1;
        elseStatements = branchStatements(ctx, elseField, depth);
    }
    rejectExtraFields(ctx, fields, index);
    return {
        kind: "if",
        condition,
        then,
        elseIf: Object.freeze(elseIf),
        ...(elseStatements === undefined ? {} : { else: elseStatements }),
        range: entry.range,
    };
}
function parseWhileStatement(ctx, entry, fields, depth) {
    const head = fields[0];
    if (head === undefined)
        return undefined;
    const condition = conditionSpelling(ctx, head, "while");
    if (condition === undefined)
        return undefined;
    const doField = fields[1];
    if (doField === undefined || doField.key !== "do") {
        ctx.diagnostics.push(algorithmDiagnostic("missing-body", "A `while:` statement requires `do:`.", head.range, ctx.sourceName, {
            data: { statement: "while", field: "do" },
            suggestion: "Add a `do:` collection holding the statements the loop repeats.",
        }));
        return undefined;
    }
    const statements = branchStatements(ctx, doField, depth);
    rejectExtraFields(ctx, fields, 2);
    return { kind: "while", condition, statements, range: entry.range };
}
function parseForStatement(ctx, entry, head, fields, depth) {
    const headerFault = (message) => {
        ctx.diagnostics.push(algorithmDiagnostic("missing-for-header", message, head.range, ctx.sourceName, {
            suggestion: "Write `for: i = 0 to n`, `for: i = n downto 0` or add `by <expression>`.",
        }));
        return undefined;
    };
    if (head.value === "") {
        return headerFault("A `for:` statement requires `var = start to|downto end`.");
    }
    const lexed = lexExpression(head.value);
    if (lexed.fault !== undefined) {
        reportExpressionFault(ctx, lexed.fault, head.line, head.valueStart);
        return undefined;
    }
    const tokens = lexed.tokens;
    const variable = tokens[0];
    if (variable === undefined || variable.kind !== "ident") {
        return headerFault("A `for:` statement requires a loop variable name.");
    }
    const equals = tokens[1];
    if (equals === undefined || equals.kind !== "equals") {
        return headerFault("A `for:` statement requires `var = start to|downto end`.");
    }
    let directionIndex = -1;
    for (let index = 2; index < tokens.length; index += 1) {
        const token = tokens[index];
        if (token !== undefined &&
            token.kind === "ident" &&
            (token.text === "to" || token.text === "downto")) {
            directionIndex = index;
            break;
        }
    }
    const directionToken = directionIndex < 0 ? undefined : tokens[directionIndex];
    if (directionToken === undefined) {
        return headerFault("A `for:` statement requires `to` or `downto` between its bounds.");
    }
    let byIndex = -1;
    for (let index = directionIndex + 1; index < tokens.length; index += 1) {
        const token = tokens[index];
        if (token !== undefined && token.kind === "ident" && token.text === "by") {
            byIndex = index;
            break;
        }
    }
    const fromTokens = tokens.slice(2, directionIndex);
    const toTokens = tokens.slice(directionIndex + 1, byIndex < 0 ? tokens.length : byIndex);
    if (fromTokens.length === 0 || toTokens.length === 0) {
        return headerFault("A `for:` statement requires an expression for each bound.");
    }
    const fromEnd = directionToken.start;
    const byToken = byIndex < 0 ? undefined : tokens[byIndex];
    const toEnd = byToken === undefined ? head.value.length : byToken.start;
    const fromSlice = expressionSlice(head, tokens[2]?.start ?? 0, fromEnd);
    const toSlice = expressionSlice(head, tokens[directionIndex + 1]?.start ?? fromEnd, toEnd);
    if (!withinExpressionCeiling(ctx, head, fromSlice) ||
        !withinExpressionCeiling(ctx, head, toSlice)) {
        return undefined;
    }
    const from = parseTokenExpression(fromTokens, "expression", fromEnd);
    if ("fault" in from) {
        reportExpressionFault(ctx, from.fault, head.line, head.valueStart);
        return undefined;
    }
    const to = parseTokenExpression(toTokens, "expression", toEnd);
    if ("fault" in to) {
        reportExpressionFault(ctx, to.fault, head.line, head.valueStart);
        return undefined;
    }
    let by;
    if (byIndex >= 0 && byToken !== undefined) {
        const byTokens = tokens.slice(byIndex + 1);
        if (byTokens.length === 0) {
            return headerFault("A `for:` statement requires an expression after `by`.");
        }
        const bySlice = expressionSlice(head, byToken.start + byToken.length, head.value.length);
        if (!withinExpressionCeiling(ctx, head, bySlice))
            return undefined;
        const parsedBy = parseTokenExpression(byTokens, "expression", head.value.length);
        if ("fault" in parsedBy) {
            reportExpressionFault(ctx, parsedBy.fault, head.line, head.valueStart);
            return undefined;
        }
        by = parsedBy.spelling;
    }
    const doField = fields[1];
    if (doField === undefined || doField.key !== "do") {
        ctx.diagnostics.push(algorithmDiagnostic("missing-body", "A `for:` statement requires `do:`.", head.range, ctx.sourceName, {
            data: { statement: "for", field: "do" },
            suggestion: "Add a `do:` collection holding the statements the loop repeats.",
        }));
        return undefined;
    }
    const statements = branchStatements(ctx, doField, depth);
    rejectExtraFields(ctx, fields, 2);
    return {
        kind: "for",
        variable: variable.text,
        from: from.spelling,
        direction: directionToken.text === "downto" ? "downto" : "to",
        to: to.spelling,
        ...(by === undefined ? {} : { by }),
        statements,
        range: entry.range,
    };
}
function parseReturnStatement(ctx, entry, head) {
    rejectExtraFields(ctx, entry.fields, 1);
    if ((head.collection ?? []).length > 0 || head.record !== undefined) {
        ctx.diagnostics.push(algorithmDiagnostic("unknown-field", "`return:` takes an optional expression, not a nested structure.", head.range, ctx.sourceName, {
            data: { field: "return" },
            suggestion: "Write `return: mid` or `return:` alone.",
        }));
        return undefined;
    }
    if (head.value === "")
        return { kind: "return", range: entry.range };
    const expression = expressionSpelling(ctx, head, head.value, head.valueStart, "expression");
    if (expression === undefined)
        return undefined;
    return { kind: "return", expression, range: entry.range };
}
function parseTextStatement(ctx, entry, head) {
    rejectExtraFields(ctx, entry.fields, 1);
    if (head.value === "") {
        ctx.diagnostics.push(algorithmDiagnostic("missing-body", "A `text:` statement requires an authored prose line.", head.range, ctx.sourceName, { suggestion: "Write `text: invariant: A is sorted ascending`." }));
        return undefined;
    }
    const nodes = ctx.parseInline(head.value, head.line);
    if (nodes === undefined) {
        ctx.inlineFailed = true;
        return undefined;
    }
    return { kind: "text", text: nodes, range: entry.range };
}
/* ------------------------------------------------------------------ *
 * Body
 * ------------------------------------------------------------------ */
/**
 * Parse one `:::: algorithm` body: required `procedure:`, optional bounded
 * `parameters:`, required non-empty `steps:`.
 */
export function parseAlgorithmBody(args) {
    const ctx = {
        lines: args.bodyLines,
        baseline: baselineIndent(args.bodyLines),
        sourceName: args.sourceName,
        blockRange: args.blockRange,
        diagnostics: [],
        parseInline: args.parseInline,
        depthReported: false,
        statementsReported: false,
        parametersReported: false,
        statementCount: 0,
        inlineFailed: false,
    };
    const { fields } = readFields(ctx, 0, 0, 1);
    let procedure;
    let parameters = [];
    let steps;
    const seen = new Set();
    for (const field of fields) {
        if (seen.has(field.key)) {
            ctx.diagnostics.push(algorithmDiagnostic("unknown-field", `Algorithm field "${field.key}" is declared twice.`, field.range, ctx.sourceName, {
                data: { field: field.key },
                suggestion: "An algorithm body declares `procedure:`, `parameters:` and `steps:` once each.",
            }));
            continue;
        }
        seen.add(field.key);
        if (field.key === "procedure") {
            if (field.record !== undefined || (field.collection ?? []).length > 0) {
                ctx.diagnostics.push(algorithmDiagnostic("unknown-field", "`procedure:` takes one plain name.", field.range, ctx.sourceName, {
                    data: { field: "procedure" },
                    suggestion: "Write `procedure: BinarySearch`.",
                }));
                continue;
            }
            if (field.value === "") {
                ctx.diagnostics.push(algorithmDiagnostic("missing-body", "An algorithm requires a procedure name.", field.range, ctx.sourceName, { suggestion: "Write `procedure: BinarySearch`." }));
                continue;
            }
            if (!IDENTIFIER.test(field.value)) {
                ctx.diagnostics.push(algorithmDiagnostic("unknown-field", `Procedure name "${field.value}" must start with a letter or underscore and continue with letters, digits or underscores.`, field.range, ctx.sourceName, { data: { field: "procedure", value: field.value } }));
                continue;
            }
            procedure = field.value;
            continue;
        }
        if (field.key === "parameters") {
            if (field.record !== undefined) {
                ctx.diagnostics.push(algorithmDiagnostic("unknown-field", "`parameters:` holds an ordered collection of names.", field.range, ctx.sourceName, {
                    data: { field: "parameters" },
                    suggestion: "Write each parameter as a `- A` item.",
                }));
                parameters = [];
                continue;
            }
            const names = [];
            for (const entry of field.collection ?? []) {
                if (entry.fields.length > 0 || entry.value === "") {
                    ctx.diagnostics.push(algorithmDiagnostic("unknown-field", "A parameter is a plain name such as `A`.", entry.range, ctx.sourceName, { data: { field: "parameters" } }));
                    continue;
                }
                if (!IDENTIFIER.test(entry.value)) {
                    ctx.diagnostics.push(algorithmDiagnostic("unknown-field", `Parameter name "${entry.value}" must start with a letter or underscore and continue with letters, digits or underscores.`, entry.range, ctx.sourceName, { data: { field: "parameters", value: entry.value } }));
                    continue;
                }
                names.push(entry.value);
            }
            if (names.length > MAX_ALGORITHM_PARAMETERS &&
                !ctx.parametersReported) {
                ctx.parametersReported = true;
                ctx.diagnostics.push(algorithmDiagnostic("limit-exceeded", `An algorithm takes at most ${MAX_ALGORITHM_PARAMETERS} parameters.`, field.range, ctx.sourceName, {
                    data: {
                        subject: "parameters",
                        count: names.length,
                        limit: MAX_ALGORITHM_PARAMETERS,
                    },
                }));
            }
            parameters = names;
            continue;
        }
        if (field.key === "steps") {
            if (field.record !== undefined) {
                ctx.diagnostics.push(algorithmDiagnostic("unknown-field", "`steps:` holds an ordered collection of statements.", field.range, ctx.sourceName, {
                    data: { field: "steps" },
                    suggestion: "Write each statement as a `- assign: ...` item.",
                }));
                continue;
            }
            const entries = field.collection ?? [];
            if (entries.length === 0) {
                ctx.diagnostics.push(algorithmDiagnostic("missing-body", "An algorithm requires at least one step.", field.range, ctx.sourceName, { data: { field: "steps" }, suggestion: STATEMENT_SUGGESTION }));
                continue;
            }
            steps = parseStatements(ctx, entries, 1);
            continue;
        }
        ctx.diagnostics.push(algorithmDiagnostic("unknown-field", `Algorithm field "${field.key}" is not supported.`, field.range, ctx.sourceName, {
            data: { field: field.key },
            suggestion: "An algorithm body declares `procedure:`, `parameters:` and `steps:`.",
        }));
    }
    if (procedure === undefined && !seen.has("procedure")) {
        ctx.diagnostics.push(algorithmDiagnostic("missing-body", "An algorithm requires `procedure:`.", args.blockRange, ctx.sourceName, { suggestion: "Write `procedure: BinarySearch`." }));
    }
    if (steps === undefined && !seen.has("steps")) {
        ctx.diagnostics.push(algorithmDiagnostic("missing-body", "An algorithm requires `steps:`.", args.blockRange, ctx.sourceName, { suggestion: "Add a `steps:` collection holding the statements." }));
    }
    const diagnostics = Object.freeze(ctx.diagnostics);
    if (diagnostics.length > 0 ||
        ctx.inlineFailed ||
        procedure === undefined ||
        steps === undefined) {
        return { diagnostics };
    }
    const body = Object.freeze({
        procedure,
        parameters: Object.freeze(parameters),
        steps: Object.freeze(steps),
    });
    return { body, block: body, diagnostics };
}
/* ------------------------------------------------------------------ *
 * HTML fragment renderer (contract: issue #66 §15)
 * ------------------------------------------------------------------ */
function keywordSpan(keyword) {
    return `<span class="aze-algorithm-keyword">${keyword}</span>`;
}
function expressionSpan(spelling) {
    return `<span class="aze-algorithm-expression">${escapeHtml(spelling)}</span>`;
}
function renderStatementList(statements) {
    return `<ol class="aze-algorithm-branch">${statements
        .map(renderStatement)
        .join("")}</ol>`;
}
function renderStatement(statement) {
    switch (statement.kind) {
        case "assign": {
            const index = statement.index === undefined
                ? ""
                : `[${expressionSpan(statement.index)}]`;
            return `<li class="aze-algorithm-statement aze-algorithm-assign"><span class="aze-algorithm-target">${escapeHtml(statement.target)}</span>${index} = ${expressionSpan(statement.expression)}</li>`;
        }
        case "if": {
            let html = `<li class="aze-algorithm-statement aze-algorithm-if">${keywordSpan("if")} ${expressionSpan(statement.condition)} ${keywordSpan("then")}${renderStatementList(statement.then)}`;
            for (const branch of statement.elseIf) {
                html += `${keywordSpan("else-if")} ${expressionSpan(branch.condition)} ${keywordSpan("then")}${renderStatementList(branch.statements)}`;
            }
            if (statement.else !== undefined) {
                html += `${keywordSpan("else")}${renderStatementList(statement.else)}`;
            }
            return `${html}</li>`;
        }
        case "for": {
            const by = statement.by === undefined
                ? ""
                : ` ${keywordSpan("by")} ${expressionSpan(statement.by)}`;
            return `<li class="aze-algorithm-statement aze-algorithm-for">${keywordSpan("for")} <span class="aze-algorithm-target">${escapeHtml(statement.variable)}</span> = ${expressionSpan(statement.from)} ${keywordSpan(statement.direction)} ${expressionSpan(statement.to)}${by}${renderStatementList(statement.statements)}</li>`;
        }
        case "while":
            return `<li class="aze-algorithm-statement aze-algorithm-while">${keywordSpan("while")} ${expressionSpan(statement.condition)} ${keywordSpan("do")}${renderStatementList(statement.statements)}</li>`;
        case "return":
            return `<li class="aze-algorithm-statement aze-algorithm-return">${keywordSpan("return")}${statement.expression === undefined ? "" : ` ${expressionSpan(statement.expression)}`}</li>`;
        case "text":
            return `<li class="aze-algorithm-statement aze-algorithm-text">${renderInlineHtml(statement.text)}</li>`;
    }
}
/**
 * The algorithm fragment: a figure carrying the numbering label and caption,
 * the procedure signature, and one ordered list per statement level so the
 * nesting and reading order survive a screen reader. The authored id never
 * becomes an element `id`; the composition layer owns anchors.
 */
export function renderAlgorithmFragment(block, _context) {
    const id = block.id === undefined ? "" : ` data-algorithm-id="${escapeAttribute(block.id)}"`;
    const number = block.number === true ? ' data-algorithm-number="true"' : "";
    const label = numberingLabelHtml(block.numberLabel);
    const captionText = block.caption === undefined || block.caption.length === 0
        ? ""
        : renderInlineHtml(block.caption);
    const figcaption = label === "" && captionText === ""
        ? ""
        : `<figcaption>${label}${captionText}</figcaption>`;
    const parameters = block.parameters
        .map((parameter) => `<span class="aze-algorithm-parameter">${escapeHtml(parameter)}</span>`)
        .join(", ");
    const signature = `<p class="aze-algorithm-signature">${keywordSpan("procedure")} <span class="aze-algorithm-name">${escapeHtml(block.procedure)}</span>(${parameters})</p>`;
    return `<figure class="aze-algorithm"${id}${number}>${figcaption}${signature}<ol class="aze-algorithm-steps">${block.steps
        .map(renderStatement)
        .join("")}</ol></figure>`;
}
export const algorithmHtmlBlockRenderer = Object.freeze({
    descriptor: blockRendererDescriptor,
    render: renderAlgorithmFragment,
});
//# sourceMappingURL=algorithm.js.map