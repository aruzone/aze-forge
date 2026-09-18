import { DERIVATION_PLUGIN_TYPE, DERIVATION_PLUGIN_VERSION, DERIVATION_BODY_SYNTAX_ID, DERIVATION_BODY_SYNTAX_VERSION, derivationSourceSchema, derivationDataSchema, } from "./derivation-schemas.js";
import { createDiagnostic } from "./diagnostics.js";
import { MAX_EQUATION_SOURCE_LENGTH, MAX_EQUATION_TEX_LENGTH, renderEquationToHtml, } from "./equation.js";
import { canonicalSpelling, parseNativeMath, projectMathNode, projectionToNode, rangeForOffset, treeToTex, } from "./math.js";
import { escapeHtml } from "./html-fragment.js";
export const DERIVATION_HTML_BLOCK_RENDERER_ID = "azeforge.derivation.html/v1";
export const DERIVATION_HTML_BLOCK_RENDERER_VERSION = "1.0.0";
export const HTML_RENDERER_ID = "html";
export const HTML_RENDERER_VERSION = "1.0.0";
export const MAX_DERIVATION_STEPS = 64;
export const MAX_ANNOTATION_LENGTH = 500;
/** Header keys `parseDerivationHeader` accepts before the `----` separator. */
export const DERIVATION_HEADER_FIELDS = Object.freeze([
    "id",
    "number",
    "align",
]);
/** Step keys `validateDerivationBody` accepts in one `- expression:` step. */
export const DERIVATION_STEP_FIELDS = Object.freeze([
    "expression",
    "annotation",
]);
function headerDiagnostic(code, message, range, sourceName, extra = {}) {
    return createDiagnostic(code, "error", message, {
        location: sourceName === undefined ? { range } : { source: sourceName, range },
        ...(extra.suggestion === undefined
            ? {}
            : { suggestion: extra.suggestion }),
        ...(extra.data === undefined ? {} : { data: extra.data }),
    });
}
/**
 * Oxford-comma list of `fields`, the wording the unknown-attribute suggestion
 * uses; built from the parser's own field table.
 */
function fieldList(fields) {
    const last = fields[fields.length - 1] ?? "";
    if (fields.length < 2)
        return last;
    if (fields.length === 2)
        return `${fields[0] ?? ""} and ${last}`;
    return `${fields.slice(0, -1).join(", ")}, and ${last}`;
}
export function parseDerivationHeader(entries, _blockRange, sourceName) {
    const diagnostics = [];
    let id;
    let number;
    let align;
    for (const entry of entries) {
        // `DERIVATION_HEADER_FIELDS` is the accepted key set; the branches below
        // carry only the per-field value rules.
        if (!DERIVATION_HEADER_FIELDS.includes(entry.key)) {
            diagnostics.push(headerDiagnostic("azeforge.derivation#invalid-attribute", `Derivation attribute "${entry.key}" is not a valid derivation attribute.`, entry.range, sourceName, {
                suggestion: `Valid derivation attributes are ${fieldList(DERIVATION_HEADER_FIELDS)}.`,
                data: { attribute: entry.key },
            }));
            continue;
        }
        if (entry.key === "id") {
            if (entry.value.length === 0) {
                diagnostics.push(headerDiagnostic("azeforge.derivation#invalid-attribute", "Derivation attribute id must not be empty.", entry.range, sourceName, { data: { attribute: "id", value: entry.value } }));
            }
            else {
                id = entry.value;
            }
            continue;
        }
        if (entry.key === "number") {
            if (entry.value !== "true" && entry.value !== "false") {
                diagnostics.push(headerDiagnostic("azeforge.derivation#invalid-attribute", 'Derivation attribute "number" must be true or false.', entry.range, sourceName, { data: { attribute: "number", value: entry.value } }));
            }
            else {
                number = entry.value === "true";
            }
            continue;
        }
        if (entry.key === "align") {
            if (entry.value !== "left" && entry.value !== "center" && entry.value !== "right") {
                diagnostics.push(headerDiagnostic("azeforge.derivation#invalid-attribute", 'Derivation attribute "align" must be left, center, or right.', entry.range, sourceName, { data: { attribute: "align", value: entry.value } }));
            }
            else {
                align = entry.value;
            }
            continue;
        }
    }
    return {
        ...(id === undefined ? {} : { id }),
        ...(number === undefined ? {} : { number }),
        ...(align === undefined ? {} : { align }),
        diagnostics,
    };
}
/** The two step keys, in `DERIVATION_STEP_FIELDS` order: opener and annotation child. */
const [STEP_OPENER_FIELD, STEP_ANNOTATION_FIELD] = DERIVATION_STEP_FIELDS;
const EXPRESSION_ITEM = new RegExp(`^[ \\t]*-[ \\t]*${STEP_OPENER_FIELD}[ \\t]*:[ \\t]*(.*)$`);
const ANNOTATION_ITEM = new RegExp(`^[ \\t]{2,}${STEP_ANNOTATION_FIELD}[ \\t]*:[ \\t]*(.*)$`);
const UNKNOWN_ITEM = /^[ \t]*-[ \t]*([A-Za-z][A-Za-z0-9-]*)[ \t]*:/;
/**
 * Step record validation for the catalog derivation family. Each
 * `- expression:` step parses through the closed native mathematics
 * grammar into a semantic tree; annotations are literal plain text.
 */
export function validateDerivationBody(options) {
    const { header, body, bodyRanges, blockRange, sourceName, parseAnnotation } = options;
    const location = (range) => sourceName === undefined ? { range } : { source: sourceName, range };
    const stepLocation = (index) => location(bodyRanges[index] ?? blockRange);
    const stepRange = (index) => bodyRanges[index] ?? blockRange;
    const trimmed = body.trim();
    if (trimmed.length === 0) {
        return {
            diagnostics: [
                createDiagnostic("azeforge.derivation#empty", "error", `The derivation Block must contain at least one \`- ${STEP_OPENER_FIELD}:\` step.`, {
                    location: stepLocation(0),
                    suggestion: `Add a step such as \`- ${STEP_OPENER_FIELD}: x = y\`.`,
                }),
            ],
        };
    }
    const stepLines = body.split("\n");
    const items = [];
    for (const [index, line] of stepLines.entries()) {
        const match = EXPRESSION_ITEM.exec(line);
        if (match !== null) {
            const expression = (match[1] ?? "").trim();
            let annotation;
            if (index + 1 < stepLines.length) {
                const annotationMatch = ANNOTATION_ITEM.exec(stepLines[index + 1] ?? "");
                if (annotationMatch !== null) {
                    annotation = (annotationMatch[1] ?? "").trim();
                }
            }
            items.push({
                expression,
                ...(annotation === undefined || annotation.length === 0
                    ? {}
                    : { annotation }),
                lineIndex: index,
            });
            continue;
        }
        const unknown = UNKNOWN_ITEM.exec(line);
        if (unknown !== null) {
            return {
                diagnostics: [
                    createDiagnostic("azeforge.derivation#unknown-step-field", "error", `Step field "${unknown[1] ?? ""}" is not a valid derivation step field.`, { location: stepLocation(index) }),
                ],
            };
        }
        if (/^[ \t]*-/.test(line)) {
            return {
                diagnostics: [
                    createDiagnostic("azeforge.derivation#invalid-step", "error", `Each derivation step must open with \`- ${STEP_OPENER_FIELD}: <readable math>\`.`, { location: stepLocation(index) }),
                ],
            };
        }
    }
    if (items.length === 0) {
        return {
            diagnostics: [
                createDiagnostic("azeforge.derivation#empty", "error", `The derivation Block must contain at least one \`- ${STEP_OPENER_FIELD}:\` step.`, {
                    location: stepLocation(0),
                    suggestion: `Add a step such as \`- ${STEP_OPENER_FIELD}: x = y\`.`,
                }),
            ],
        };
    }
    if (items.length > MAX_DERIVATION_STEPS) {
        return {
            diagnostics: [
                createDiagnostic("azeforge.derivation#limit-exceeded", "error", `A derivation may hold at most ${MAX_DERIVATION_STEPS} steps.`, {
                    location: stepLocation(items[MAX_DERIVATION_STEPS]?.lineIndex ?? 0),
                    data: { limit: MAX_DERIVATION_STEPS },
                }),
            ],
        };
    }
    const steps = [];
    const warnings = [];
    for (const item of items) {
        const stepRangeHere = stepRange(item.lineIndex);
        if (item.expression.length > MAX_EQUATION_SOURCE_LENGTH) {
            return {
                diagnostics: [
                    createDiagnostic("azeforge.derivation#invalid-syntax", "error", "A derivation step exceeds the maximum supported length.", { location: stepLocation(item.lineIndex) }),
                ],
            };
        }
        const parsed = parseNativeMath(item.expression);
        if ("problems" in parsed) {
            const diagnostics = parsed.problems.map((problem) => createDiagnostic(`azeforge.derivation#${problem.code}`, "error", problem.message, {
                location: location(rangeForOffset(bodyRanges, problem.offset, problem.length)),
                ...(problem.suggestion === undefined
                    ? {}
                    : { suggestion: problem.suggestion }),
                ...(problem.data === undefined ? {} : { data: problem.data }),
            }));
            return { diagnostics };
        }
        for (const problem of parsed.warnings) {
            warnings.push(createDiagnostic(`azeforge.derivation#${problem.code}`, "warning", problem.message, {
                location: location(rangeForOffset(bodyRanges, problem.offset, problem.length)),
            }));
        }
        const tex = treeToTex(parsed.tree);
        if (tex.length > MAX_EQUATION_TEX_LENGTH) {
            return {
                diagnostics: [
                    createDiagnostic("azeforge.derivation#invalid-syntax", "error", "A derivation step exceeds the maximum supported length.", { location: stepLocation(item.lineIndex) }),
                ],
            };
        }
        const annotationRange = item.annotation === undefined
            ? undefined
            : bodyRanges[item.lineIndex + 1] ?? stepRangeHere;
        if (item.annotation !== undefined && annotationRange !== undefined) {
            if (item.annotation.length > MAX_ANNOTATION_LENGTH) {
                return {
                    diagnostics: [
                        createDiagnostic("azeforge.derivation#limit-exceeded", "error", `An annotation may be at most ${MAX_ANNOTATION_LENGTH} characters.`, { location: location(annotationRange) }),
                    ],
                };
            }
            const nodes = parseAnnotation(item.annotation, annotationRange);
            if (nodes === undefined)
                return { diagnostics: [] };
            steps.push({
                tree: projectMathNode(parsed.tree),
                expression: canonicalSpelling(parsed.tree),
                annotation: nodes,
            });
        }
        else {
            steps.push({
                tree: projectMathNode(parsed.tree),
                expression: canonicalSpelling(parsed.tree),
            });
        }
    }
    const block = {
        kind: "derivation",
        range: blockRange,
        ...(header.id === undefined ? {} : { id: header.id }),
        pluginVersion: DERIVATION_PLUGIN_VERSION,
        steps: Object.freeze(steps),
        ...(header.number === undefined ? {} : { number: header.number }),
        ...(header.align === undefined ? {} : { align: header.align }),
    };
    return { block: Object.freeze(block), diagnostics: warnings };
}
const RELATION_ROW = Object.freeze({
    "=": "=",
    "!=": "\\neq",
    "<": "<",
    ">": ">",
    "<=": "\\leq",
    ">=": "\\geq",
    "->": "\\to",
    approx: "\\approx",
    equiv: "\\equiv",
    "+-": "\\pm",
    in: "\\in",
    notin: "\\notin",
    subset: "\\subset",
    subseteq: "\\subseteq",
    supset: "\\supset",
});
/**
 * One aligned row: split at the step's first top-level relation so every
 * step in the derivation aligns at that relation; relation-free steps
 * align as a whole in the left column.
 */
function alignedRowTex(projection) {
    const node = projectionToNode(projection);
    if (node === undefined)
        return "&\\quad";
    if (node.kind === "chain" && node.links.length > 0) {
        const head = treeToTex(node.head);
        const first = node.links[0];
        if (first === undefined)
            return `${treeToTex(node)} &\\quad`;
        const rest = node.links.slice(1);
        let right = `${RELATION_ROW[first.op] ?? first.op} ${treeToTex(first.node)}`;
        for (const link of rest) {
            right += ` ${RELATION_ROW[link.op] ?? link.op} ${treeToTex(link.node)}`;
        }
        return `${head} &${right}`;
    }
    return `${treeToTex(node)} &\\quad`;
}
const pluginDescriptor = Object.freeze({
    type: DERIVATION_PLUGIN_TYPE,
    version: DERIVATION_PLUGIN_VERSION,
    title: "Derivation",
    summary: "Ordered native-equation steps rendered aligned through pinned KaTeX.",
    diagnosticNamespace: "azeforge.derivation",
    sourceSchema: derivationSourceSchema,
    bodySyntax: Object.freeze({
        id: DERIVATION_BODY_SYNTAX_ID,
        version: DERIVATION_BODY_SYNTAX_VERSION,
    }),
    dataSchema: derivationDataSchema,
});
export const derivationPlugin = Object.freeze({
    descriptor: pluginDescriptor,
});
const blockRendererDescriptor = Object.freeze({
    id: DERIVATION_HTML_BLOCK_RENDERER_ID,
    version: DERIVATION_HTML_BLOCK_RENDERER_VERSION,
    blockType: DERIVATION_PLUGIN_TYPE,
    pluginVersionRange: "1.0.0",
    rendererId: HTML_RENDERER_ID,
    rendererVersionRange: "1.0.0",
});
/**
 * Render an aligned environment at each step's first top-level relation.
 * Relation-free steps align as a whole; every equation stays page-atomic.
 */
export function renderDerivationFragment(block, _context) {
    const align = block.align ?? "center";
    const label = block.id === undefined ? "" : ` data-derivation-id="${block.id}"`;
    const number = block.number === true ? ' data-derivation-number="true"' : "";
    const steps = block.steps
        .map((step, index) => {
        const rowTex = `\\begin{aligned}${alignedRowTex(step.tree)}\\end{aligned}`;
        const math = renderEquationToHtml(rowTex);
        const annotation = step.annotation === undefined || step.annotation.length === 0
            ? ""
            : `<span class="aze-derivation-annotation">${renderAnnotationHtml(step.annotation)}</span>`;
        const stepIndex = block.steps.length > 1 ? ` data-step="${index + 1}"` : "";
        return `<li class="aze-derivation-step"${stepIndex}>${math}${annotation}</li>`;
    })
        .join("");
    return `<figure class="aze-derivation" data-align="${align}"${label}${number}><ol>${steps}</ol></figure>`;
}
function renderAnnotationHtml(nodes) {
    return nodes
        .map((node) => {
        switch (node.kind) {
            case "text":
            case "code":
                return escapeHtml(node.value);
            case "emphasis":
                return `<em>${renderAnnotationHtml(node.children)}</em>`;
            case "strong":
                return `<strong>${renderAnnotationHtml(node.children)}</strong>`;
            default:
                return "";
        }
    })
        .join("");
}
export const derivationHtmlBlockRenderer = Object.freeze({
    descriptor: blockRendererDescriptor,
    render: renderDerivationFragment,
});
//# sourceMappingURL=derivation.js.map