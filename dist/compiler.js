import { resolveProjectImages } from "./assets.js";
import { CompilerConfigurationError } from "./configuration-error.js";
import { createDiagnostic, DEFAULT_DIAGNOSTIC_LIMITS, normalizeAndLimitDiagnostics, } from "./diagnostics.js";
import { assertInterFontCoverage, FontCoverageError, loadCodeFontFaces, loadInterFontFaces, } from "./font.js";
import { formatSource } from "./format.js";
import { documentContentHash } from "./hash.js";
import { inlineTextValue } from "./markdown.js";
import { buildTexRenderRequest, runTexRendererBatch, TexAdapterCancelled, TexAdapterFailure, texBodyRange, texResultCategory, } from "./tex-adapter.js";
import { sourceLines } from "./source-map.js";
import { EquationSanitizerError, katexDependencyClosure, sanitizeKatexHtml, } from "./equation.js";
import { MermaidBrowserParseError, MermaidBrowserUnavailableError, } from "./mermaid-browser.js";
import { MermaidSanitizerError, mermaidDependencyClosure, sanitizeMermaidFragment, } from "./mermaid.js";
import { MERMAID_PLUGIN_TYPE } from "./mermaid-schemas.js";
import { TEX_PLUGIN_TYPE } from "./tex-schemas.js";
import { TexSvgError, texFigureFragment } from "./tex-svg.js";
import { DIAGRAM_PLUGIN_TYPE } from "./diagram-schemas.js";
import { DiagramRenderError, diagramDependencyClosure } from "./diagram-render.js";
import { DiagramLayoutError } from "./diagram-layout.js";
import { ControlRenderError, controlDependencyClosure } from "./control-render.js";
import { ControlLayoutError } from "./control-layout.js";
import { FreeBodyRenderError, freeBodyDependencyClosure } from "./free-body-render.js";
import { ModelsRenderError } from "./models-render.js";
import { DERIVATION_PLUGIN_TYPE } from "./derivation-schemas.js";
import { FragmentSecurityError } from "./html-fragment.js";
import { freezeRegistryForCompiler, resolveRegistry, satisfiesSemverRange, } from "./registry.js";
import { parseSource } from "./parse.js";
import { ArtifactLimitError, createHtmlLayout, documentTitle, renderHtml } from "./render-html.js";
import { pinnedPdfBrowserCapability, PdfArtifactLimitError, renderPdf, } from "./render-pdf.js";
import { pinnedSvgBrowserCapability, renderSvg, SvgArtifactLimitError, } from "./render-svg.js";
import { pinnedPngBrowserCapability, PngArtifactLimitError, renderPng, } from "./render-png.js";
import { builtInThemes, copyAndFreezeTheme } from "./theme.js";
import { validateDocumentSchema } from "./validate-document.js";
import { blockGroups, blockInlineRuns } from "./block-content.js";
import { resolveDocumentComposition } from "./composition.js";
const THEME_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const SEMVER = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;
const BUILT_IN_RENDERER_VERSION_BY_FORMAT = {
    html: "1.0.0",
    svg: "1.0.0",
    png: "1.0.0",
    pdf: "1.0.0",
};
function validateParsed(parsed, limits) {
    const schemaDiagnostics = validateDocumentSchema(parsed.document);
    if (schemaDiagnostics.some(({ severity }) => severity === "error")) {
        return {
            diagnostics: normalizeAndLimitDiagnostics([parsed.diagnostics, schemaDiagnostics], limits),
        };
    }
    const blockRanges = collectBlockRanges(parsed.document.blocks);
    // Document composition owns the unified identifier namespace and the derived
    // numbering projection the Renderers read. It runs on every schema-valid
    // Document, including one that already carries parse errors, so a duplicate
    // identifier is always reported by its one semantic owner.
    const composed = resolveDocumentComposition({
        azemarkVersion: parsed.document.azemarkVersion,
        schemaVersion: parsed.document.schemaVersion,
        metadata: parsed.document.metadata,
        blocks: parsed.document.blocks,
    });
    // The parse-time envelope scan is textual, so it still sees an `id:` on a
    // region that failed to parse; composition resolves the same namespace
    // semantically and carries every colliding site as a related location. When
    // both report one identifier the richer semantic diagnostic wins, and the
    // scan keeps its own for the identifiers composition cannot see.
    const resolvedIdentifiers = new Set(composed.diagnostics
        .filter(({ code }) => code === "azeforge.reference#invalid-id" ||
        code === "azeforge.reference#duplicate-id")
        .map(({ data }) => data.id)
        .filter((id) => typeof id === "string"));
    const sourceDiagnostics = [
        ...parsed.diagnostics.filter(({ code, data }) => !((code === "azeforge.reference#invalid-id" ||
            code === "azeforge.reference#duplicate-id") &&
            typeof data.id === "string" &&
            resolvedIdentifiers.has(data.id))),
        ...schemaDiagnostics,
    ];
    // A parse or composition error already names the fault; the invalid-Block
    // summary is a cascade, so it appears only when nothing else has failed.
    const priorError = [...sourceDiagnostics, ...composed.diagnostics].some(({ severity }) => severity === "error");
    const invalidBlockDiagnostics = !priorError && containsInvalidBlock(parsed.document.blocks)
        ? [
            createDiagnostic("azeforge.document#invalid-block", "error", "The Source contains an invalid Block."),
        ]
        : [];
    const diagnostics = normalizeAndLimitDiagnostics([sourceDiagnostics, composed.diagnostics, invalidBlockDiagnostics], limits, blockRanges);
    if (priorError || invalidBlockDiagnostics.length > 0)
        return { diagnostics };
    return { document: composed.document, diagnostics };
}
function resolveDiagnosticLimits(options) {
    const perBlock = options.diagnosticLimits?.perBlock ?? DEFAULT_DIAGNOSTIC_LIMITS.perBlock;
    const perDocument = options.diagnosticLimits?.perDocument ??
        DEFAULT_DIAGNOSTIC_LIMITS.perDocument;
    if (!Number.isInteger(perBlock) ||
        perBlock < 1 ||
        perBlock > DEFAULT_DIAGNOSTIC_LIMITS.perBlock ||
        !Number.isInteger(perDocument) ||
        perDocument < 1 ||
        perDocument > DEFAULT_DIAGNOSTIC_LIMITS.perDocument) {
        throw new CompilerConfigurationError("azeforge.config#diagnostic-limits", "Diagnostic limits must be positive integers no greater than the defaults.");
    }
    return Object.freeze({ perBlock, perDocument });
}
function limitParseResult(parsed, limits) {
    const sourceDiagnostics = parsed.diagnostics.filter(({ code }) => !code.startsWith("azeforge.reference#"));
    const referenceDiagnostics = parsed.diagnostics.filter(({ code }) => code.startsWith("azeforge.reference#"));
    const diagnostics = normalizeAndLimitDiagnostics([sourceDiagnostics, referenceDiagnostics], limits, parsed.document.blocks.map(({ range }) => range));
    const truncationIndex = diagnostics.findIndex(({ code }) => code === "azeforge.diagnostics#truncated");
    const blocks = parsed.document.blocks.map((block) => {
        if (block.kind === "invalid") {
            const mappedIndexes = block.diagnosticIndexes.map((index) => {
                const original = parsed.diagnostics[index];
                const retainedIndex = original === undefined ? -1 : diagnostics.indexOf(original);
                return retainedIndex >= 0 ? retainedIndex : truncationIndex;
            });
            return {
                ...block,
                diagnosticIndexes: [...new Set(mappedIndexes.filter((index) => index >= 0))],
            };
        }
        return block;
    });
    return {
        document: { ...parsed.document, blocks },
        diagnostics,
    };
}
function sameFormatMeaning(before, after) {
    if (before.document !== undefined) {
        return (after.document !== undefined &&
            documentContentHash(after.document) === documentContentHash(before.document));
    }
    if (after.document !== undefined)
        return false;
    const beforeCodes = before.diagnostics.map(({ code }) => code);
    const afterCodes = after.diagnostics.map(({ code }) => code);
    return (beforeCodes.length === afterCodes.length &&
        beforeCodes.every((code, index) => code === afterCodes[index]));
}
function validateTheme(theme) {
    const validScheme = theme.colorScheme === "light" || theme.colorScheme === "dark";
    const validColors = Object.values(theme.colors).every((color) => /^#[0-9a-f]{6}$/i.test(color));
    const { canvasWidthPx, contentWidthPx, paddingPx } = theme.geometry;
    const validGeometry = Number.isInteger(canvasWidthPx) &&
        canvasWidthPx > 0 &&
        Number.isInteger(contentWidthPx) &&
        contentWidthPx > 0 &&
        Number.isInteger(paddingPx) &&
        paddingPx >= 0 &&
        contentWidthPx + paddingPx * 2 <= canvasWidthPx;
    const validTypography = Number.isFinite(theme.typography.lineHeight) &&
        theme.typography.lineHeight >= 1 &&
        theme.typography.lineHeight <= 3 &&
        Number.isFinite(theme.typography.headingLineHeight) &&
        theme.typography.headingLineHeight >= 1 &&
        theme.typography.headingLineHeight <= 3 &&
        Number.isFinite(theme.typography.paragraphSpacingEm) &&
        theme.typography.paragraphSpacingEm >= 0 &&
        theme.typography.paragraphSpacingEm <= 4 &&
        theme.typography.bodyFontWeight === 400 &&
        theme.typography.headingFontWeight === 700 &&
        theme.typography.proseFontFamily === "Inter";
    if (!validScheme || !validColors || !validGeometry || !validTypography) {
        throw new CompilerConfigurationError("AZE_CONFIG_THEME_VALUES", `Theme "${theme.id}" contains unsafe or invalid tokens.`);
    }
}
export const DEFAULT_RENDER_TIMEOUT_MS = 5000;
/** Fixed deployment ceiling for one TeX renderer batch; hosts may only lower it. */
export const DEFAULT_TEX_RENDER_TIMEOUT_MS = 15000;
class RenderTimeoutError extends Error {
    constructor() {
        super("The equation Block renderer timed out.");
        this.name = "RenderTimeoutError";
    }
}
function withRenderTimeout(work, timeoutMs, onTimeout) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
            onTimeout?.();
            reject(new RenderTimeoutError());
        }, timeoutMs);
    });
    return Promise.race([work, timeout]).then((value) => { clearTimeout(timer); return value; }, (error) => { clearTimeout(timer); throw error; });
}
class BlockRendererSyncError extends Error {
    adapterId;
    blockType;
    constructor(adapterId, blockType) {
        super(`Block renderer "${adapterId}" must be synchronous.`);
        this.name = "AdapterSyncError";
        this.adapterId = adapterId;
        this.blockType = blockType;
    }
}
class CompilerCancelledError extends Error {
    constructor() {
        super("The operation was cancelled before publication.");
        this.name = "CompilerCancelledError";
    }
}
function throwIfCancelled(signal) {
    if (signal?.aborted === true)
        throw new CompilerCancelledError();
}
function isCapabilityDenial(error) {
    if (typeof error !== "object" || error === null)
        return false;
    if (!("code" in error))
        return false;
    return error.code === "AZE_CAPABILITY_DENIED";
}
function walkBlocks(blocks, visit) {
    for (const block of blocks) {
        visit(block);
        if (block.kind === "blockquote" ||
            block.kind === "callout" ||
            block.kind === "figure") {
            walkBlocks(block.children, visit);
        }
        else if (block.kind === "list") {
            for (const item of block.items) {
                walkBlocks(item.blocks, visit);
            }
        }
        else if (block.kind === "statement") {
            walkBlocks(block.text, visit);
            if (block.proof !== undefined) {
                walkBlocks(block.proof, visit);
            }
        }
        else if (block.kind === "example") {
            walkBlocks(block.problem, visit);
            for (const step of block.steps) {
                walkBlocks(step.text, visit);
            }
            if (block.result !== undefined) {
                walkBlocks(block.result, visit);
            }
        }
    }
}
function equationTargets(document) {
    const targets = [];
    walkBlocks(document.blocks, (block) => {
        if (block.kind === "equation")
            targets.push({ block });
    });
    return targets;
}
function derivationTargets(document) {
    const targets = [];
    walkBlocks(document.blocks, (block) => {
        if (block.kind === "derivation")
            targets.push({ block });
    });
    return targets;
}
function diagramTargets(document) {
    const targets = [];
    walkBlocks(document.blocks, (block) => {
        if (block.kind === "diagram") {
            targets.push({ block, ordinal: targets.length });
        }
    });
    return targets;
}
function mermaidTargets(document) {
    const targets = [];
    walkBlocks(document.blocks, (block) => {
        if (block.kind === "mermaid") {
            targets.push({ block, ordinal: targets.length });
        }
    });
    return targets;
}
function texTargets(document) {
    const targets = [];
    walkBlocks(document.blocks, (block) => {
        if (block.kind === TEX_PLUGIN_TYPE)
            targets.push(block);
    });
    return targets;
}
const TEX_FAILURE_DETAILS = {
    "adapter-unavailable": {
        message: "The trusted TeX renderer is unavailable.",
        suggestion: "Start the configured TeX renderer and verify its image or command is available.",
    },
    timeout: {
        message: "The trusted TeX renderer exceeded its time limit.",
        suggestion: "Simplify the TeX body to fit the renderer time limit.",
    },
    "resource-limit": {
        message: "The trusted TeX renderer exceeded a resource limit.",
        suggestion: "Simplify the TeX body to fit the renderer resource limits.",
    },
    "sandbox-denied": {
        message: "The trusted TeX renderer denied a sandboxed operation.",
        suggestion: "Remove the denied operation from the TeX body.",
    },
    "compile-failed": {
        message: "The trusted TeX renderer could not compile this TeX body.",
        suggestion: "Correct the TeX body and try again.",
    },
    "protocol-invalid": {
        message: "The trusted TeX renderer returned an invalid response.",
        suggestion: "Update or reconfigure the trusted TeX renderer.",
    },
};
function texRendererFailureDiagnostic(category, block, sourceName, range = block.range) {
    const detail = TEX_FAILURE_DETAILS[category];
    return createDiagnostic(`azeforge.tex#${category}`, "error", detail.message, {
        location: sourceName === undefined
            ? { range }
            : { source: sourceName, range },
        data: { profile: block.profile },
        suggestion: detail.suggestion,
    });
}
function texBatchFailureDiagnostics(category, targets, sourceName) {
    const detail = TEX_FAILURE_DETAILS[category];
    return [groupedAdapterDiagnostic(`azeforge.tex#${category}`, detail.message, targets.map((block) => ({ block })), sourceName, { blockType: TEX_PLUGIN_TYPE }, detail.suggestion, TEX_PLUGIN_TYPE)];
}
async function renderTexFragments(document, renderer, sourceName, source, timeoutMs, signal) {
    const targets = texTargets(document);
    if (targets.length === 0)
        return { fragments: new Map(), diagnostics: [] };
    if (renderer === undefined) {
        return {
            fragments: new Map(),
            diagnostics: [groupedAdapterDiagnostic("azeforge.renderer#adapter-missing", "No trusted TeX renderer is configured for tex Blocks.", targets.map((block) => ({ block })), sourceName, { blockType: TEX_PLUGIN_TYPE }, "Configure a trusted local TeX renderer or the pinned Aze Forge TeX-renderer container.", TEX_PLUGIN_TYPE)],
        };
    }
    if (!/^sha256:[a-f0-9]{64}$/.test(renderer.rendererIdentity)) {
        return {
            fragments: new Map(),
            diagnostics: [groupedAdapterDiagnostic("azeforge.tex#protocol-invalid", "The trusted TeX renderer did not provide an immutable manifest hash.", targets.map((block) => ({ block })), sourceName, { blockType: TEX_PLUGIN_TYPE }, "Configure rendererIdentity with the SHA-256 hash of the renderer release manifest.", TEX_PLUGIN_TYPE)],
        };
    }
    let response;
    try {
        response = await runTexRendererBatch(renderer, buildTexRenderRequest(targets), { timeoutMs, ...(signal === undefined ? {} : { signal }) });
    }
    catch (error) {
        if (error instanceof TexAdapterCancelled || error instanceof CompilerCancelledError) {
            throw new CompilerCancelledError();
        }
        const category = error instanceof TexAdapterFailure ? error.category : "compile-failed";
        return { fragments: new Map(), diagnostics: texBatchFailureDiagnostics(category, targets, sourceName) };
    }
    const lines = sourceLines(source);
    const fragments = new Map();
    const diagnostics = [];
    for (const result of response.results) {
        const block = targets[result.index];
        if (block === undefined)
            continue;
        if (result.status === "ok") {
            try {
                fragments.set(block, texFigureFragment({
                    svg: result.svg,
                    requestIndex: result.index,
                    profile: block.profile,
                    title: block.title,
                    description: block.description,
                }));
            }
            catch (error) {
                if (!(error instanceof TexSvgError))
                    throw error;
                diagnostics.push(texRendererFailureDiagnostic("protocol-invalid", block, sourceName));
            }
            continue;
        }
        diagnostics.push(texRendererFailureDiagnostic(texResultCategory(result), block, sourceName, result.diagnostic.bodyLocation === undefined
            ? block.range
            : texBodyRange(block, result.diagnostic.bodyLocation, lines)));
    }
    return { fragments, diagnostics };
}
function pluginBlocks(document, blockType) {
    const targets = [];
    walkBlocks(document.blocks, (block) => {
        if (block.kind === blockType)
            targets.push(block);
    });
    return targets;
}
function containsInvalidBlock(blocks) {
    let found = false;
    walkBlocks(blocks, (block) => {
        if (block.kind === "invalid")
            found = true;
    });
    return found;
}
function collectBlockRanges(blocks) {
    const ranges = [];
    walkBlocks(blocks, (block) => {
        ranges.push(block.range);
    });
    return ranges;
}
function collectRenderText(blocks, out) {
    for (const block of blocks) {
        // Nested inline content and contained Blocks come from the one place that
        // knows a Block's shape, so a new kind or content field cannot escape the
        // font-coverage guard.
        for (const run of blockInlineRuns(block))
            out.push(inlineTextValue(run));
        for (const group of blockGroups(block)) {
            collectRenderText(group, out);
        }
        switch (block.kind) {
            case "equation":
                if (block.notation === "latex") {
                    if (block.tex !== undefined)
                        out.push(block.tex);
                }
                else if (block.spelling !== undefined) {
                    out.push(block.spelling);
                }
                break;
            case "derivation":
                for (const step of block.steps)
                    out.push(step.expression);
                break;
            case "algorithm":
                out.push(block.procedure);
                for (const parameter of block.parameters)
                    out.push(parameter);
                break;
            case "footnoteDefinition":
                break;
            case "mermaid":
                out.push(block.source);
                if (block.title !== undefined)
                    out.push(block.title);
                if (block.description !== undefined)
                    out.push(block.description);
                break;
            case "code":
                out.push(block.value);
                if (block.language !== undefined)
                    out.push(block.language);
                break;
            case "thematicBreak":
                break;
            case "table":
                for (const column of block.data.columns) {
                    if (column.name !== undefined)
                        out.push(column.name);
                }
                for (const row of block.data.rows) {
                    for (const cell of Object.values(row)) {
                        if (cell.kind === "prose")
                            continue;
                        if (cell.kind === "quantity")
                            out.push(cell.coefficient);
                        else if (cell.kind === "boolean")
                            out.push(cell.value ? "true" : "false");
                        else if (cell.kind === "math")
                            continue;
                        else
                            out.push(cell.value);
                    }
                }
                break;
            case "plot":
                if (block.id !== undefined)
                    out.push(block.id);
                if (block.xAxis.label !== undefined)
                    out.push(block.xAxis.label);
                if (block.yAxis.label !== undefined)
                    out.push(block.yAxis.label);
                for (const entry of block.series) {
                    if (entry.label !== undefined)
                        out.push(entry.label);
                    if (entry.kind === "function")
                        out.push(entry.expression);
                }
                break;
            case "chart":
                if (block.id !== undefined)
                    out.push(block.id);
                if (block.xLabel !== undefined)
                    out.push(block.xLabel);
                if (block.yLabel !== undefined)
                    out.push(block.yLabel);
                for (const entry of block.series) {
                    if (entry.label !== undefined)
                        out.push(entry.label);
                    if (entry.kind === "bars") {
                        for (const bar of entry.bars)
                            out.push(bar.category);
                    }
                }
                break;
            case "geometry":
                if (block.id !== undefined)
                    out.push(block.id);
                for (const entry of block.declarations) {
                    if (entry.name !== undefined)
                        out.push(entry.name);
                    if (entry.label !== undefined)
                        out.push(entry.label);
                }
                break;
            case "formula":
                if (block.id !== undefined)
                    out.push(block.id);
                out.push(block.expression);
                break;
            case "reaction":
                if (block.id !== undefined)
                    out.push(block.id);
                for (const entry of block.reactants)
                    out.push(entry.expression);
                for (const entry of block.products)
                    out.push(entry.expression);
                break;
            case "structure":
                if (block.id !== undefined)
                    out.push(block.id);
                for (const atom of block.atoms) {
                    if (atom.element !== undefined)
                        out.push(atom.element);
                    if (atom.attach !== undefined)
                        out.push(atom.attach);
                }
                for (const label of block.labels ?? [])
                    out.push(label.text);
                break;
            case "circuit":
                if (block.id !== undefined)
                    out.push(block.id);
                for (const run of block.title) {
                    out.push(run.kind === "quantity" ? `${run.coefficient} ${run.prefix}${run.unit}` : run.value);
                }
                for (const component of block.components) {
                    for (const text of [component.name, component.value]) {
                        if (text === undefined)
                            continue;
                        for (const run of text) {
                            out.push(run.kind === "quantity" ? `${run.coefficient} ${run.prefix}${run.unit}` : run.value);
                        }
                    }
                }
                break;
            case "diagram": {
                if (block.id !== undefined)
                    out.push(block.id);
                const texts = [];
                const push = (value) => {
                    if (value !== undefined)
                        texts.push(value);
                };
                push(block.title);
                push(block.description);
                for (const declaration of block.declarations) {
                    if (declaration.kind === "node") {
                        if (declaration.label === undefined) {
                            out.push(declaration.name);
                        }
                        else {
                            for (const line of declaration.label)
                                texts.push(line);
                        }
                        for (const port of declaration.ports)
                            out.push(port.name);
                        continue;
                    }
                    if (declaration.kind === "group") {
                        if (declaration.label === undefined)
                            out.push(declaration.name);
                        else
                            for (const line of declaration.label)
                                texts.push(line);
                        continue;
                    }
                    if (declaration.label !== undefined) {
                        for (const line of declaration.label)
                            texts.push(line);
                    }
                }
                for (const text of texts) {
                    for (const run of text) {
                        out.push(run.kind === "quantity" ? `${run.coefficient} ${run.prefix}${run.unit}` : run.value);
                    }
                }
                break;
            }
            case "control": {
                if (block.id !== undefined)
                    out.push(block.id);
                const texts = [];
                const push = (value) => {
                    if (value !== undefined)
                        texts.push(value);
                };
                push(block.title);
                push(block.description);
                for (const declaration of block.declarations) {
                    if (declaration.kind === "block") {
                        texts.push(declaration.tf);
                        push(declaration.label);
                        continue;
                    }
                    if (declaration.kind === "edge") {
                        push(declaration.label);
                        continue;
                    }
                    if (declaration.kind === "sum")
                        continue;
                    texts.push(declaration.label);
                }
                for (const text of texts) {
                    for (const run of text) {
                        out.push(run.kind === "quantity" ? `${run.coefficient} ${run.prefix}${run.unit}` : run.value);
                    }
                }
                break;
            }
            case "free-body": {
                if (block.id !== undefined)
                    out.push(block.id);
                const texts = [];
                const push = (value) => {
                    if (value !== undefined)
                        texts.push(value);
                };
                push(block.title);
                push(block.description);
                for (const declaration of block.declarations) {
                    switch (declaration.kind) {
                        case "point":
                            push(declaration.label);
                            break;
                        case "force":
                            push(declaration.label);
                            break;
                        case "moment":
                            push(declaration.label);
                            break;
                        case "axes":
                            texts.push(declaration.xLabel, declaration.yLabel);
                            break;
                        case "angle-mark":
                            push(declaration.label);
                            break;
                        case "dimension":
                            texts.push(declaration.label);
                            break;
                        default:
                            break;
                    }
                }
                for (const text of texts) {
                    for (const run of text) {
                        out.push(run.kind === "quantity" ? `${run.coefficient} ${run.prefix}${run.unit}` : run.value);
                    }
                }
                break;
            }
            case "timing": {
                if (block.id !== undefined)
                    out.push(block.id);
                const texts = [
                    block.title,
                    ...(block.description === undefined ? [] : [block.description]),
                    ...block.signals.flatMap((signal) => signal.intervals.flatMap((interval) => (interval.value === undefined ? [] : [interval.value]))),
                    ...block.groups.map((group) => group.label),
                    ...block.markers.flatMap((marker) => (marker.label === undefined ? [] : [marker.label])),
                    ...block.arrows.flatMap((arrow) => (arrow.label === undefined ? [] : [arrow.label])),
                ];
                for (const text of texts) {
                    for (const run of text) {
                        out.push(run.kind === "quantity" ? `${run.coefficient} ${run.prefix}${run.unit}` : run.value);
                    }
                }
                for (const signal of block.signals)
                    out.push(signal.ref);
                break;
            }
            case "sequence": {
                if (block.id !== undefined)
                    out.push(block.id);
                if (block.title !== undefined)
                    out.push(block.title);
                if (block.description !== undefined)
                    out.push(block.description);
                for (const participant of block.participants) {
                    out.push(participant.name);
                    if (participant.label !== undefined)
                        out.push(participant.label);
                }
                const timelineText = (items) => {
                    for (const item of items) {
                        if (item.kind === "message") {
                            if (item.text !== undefined)
                                out.push(item.text);
                            continue;
                        }
                        if (item.kind === "note") {
                            out.push(item.text);
                            continue;
                        }
                        if (item.kind === "loop") {
                            if (item.condition !== undefined)
                                out.push(item.condition);
                            timelineText(item.body);
                            continue;
                        }
                        for (const division of item.divisions) {
                            if (division.condition !== undefined)
                                out.push(division.condition);
                            timelineText(division.body);
                        }
                    }
                };
                timelineText(block.timeline);
                break;
            }
            case "state": {
                if (block.id !== undefined)
                    out.push(block.id);
                if (block.title !== undefined)
                    out.push(block.title);
                if (block.description !== undefined)
                    out.push(block.description);
                const stateText = (items) => {
                    for (const item of items) {
                        if (item.kind === "transition") {
                            if (item.trigger !== undefined)
                                out.push(item.trigger);
                            if (item.guard !== undefined)
                                out.push(item.guard);
                            if (item.action !== undefined)
                                out.push(item.action);
                            continue;
                        }
                        out.push(item.name);
                        if (item.kind === "state") {
                            if (item.label !== undefined)
                                out.push(item.label);
                            stateText(item.states);
                        }
                    }
                };
                stateText(block.items);
                break;
            }
            case "entity": {
                if (block.id !== undefined)
                    out.push(block.id);
                if (block.title !== undefined)
                    out.push(block.title);
                if (block.description !== undefined)
                    out.push(block.description);
                for (const item of block.items) {
                    if (item.kind === "relationship") {
                        if (item.label !== undefined)
                            out.push(item.label);
                        if (item.first.role !== undefined)
                            out.push(item.first.role);
                        if (item.second.role !== undefined)
                            out.push(item.second.role);
                        continue;
                    }
                    out.push(item.name);
                    if (item.label !== undefined)
                        out.push(item.label);
                    for (const attribute of item.attributes ?? []) {
                        out.push(attribute.name);
                        if (attribute.type !== undefined)
                            out.push(attribute.type);
                    }
                }
                break;
            }
            case "class": {
                if (block.id !== undefined)
                    out.push(block.id);
                if (block.title !== undefined)
                    out.push(block.title);
                if (block.description !== undefined)
                    out.push(block.description);
                for (const item of block.items) {
                    if (item.kind === "relationship") {
                        if (item.label !== undefined)
                            out.push(item.label);
                        continue;
                    }
                    out.push(item.name);
                    if (item.label !== undefined)
                        out.push(item.label);
                    for (const attribute of item.attributes ?? []) {
                        out.push(attribute.name);
                        if (attribute.type !== undefined)
                            out.push(attribute.type);
                    }
                    for (const operation of item.operations) {
                        out.push(operation.name);
                        if (operation.returnType !== undefined)
                            out.push(operation.returnType);
                        for (const parameter of operation.parameters ?? []) {
                            out.push(parameter.name);
                            if (parameter.type !== undefined)
                                out.push(parameter.type);
                        }
                    }
                }
                break;
            }
        }
    }
}
function groupedAdapterDiagnostic(code, message, targets, sourceName, data, suggestion, noun = "equation") {
    const first = targets[0];
    const rest = targets.slice(1).map(({ block }) => ({
        ...(sourceName === undefined ? {} : { source: sourceName }),
        range: block.range,
        message: `Another affected ${noun} Block is here.`,
    }));
    return createDiagnostic(code, "error", message, {
        ...(first === undefined
            ? {}
            : {
                location: {
                    ...(sourceName === undefined ? {} : { source: sourceName }),
                    range: first.block.range,
                },
            }),
        data: { ...data, affectedBlocks: targets.length },
        suggestion,
        ...(rest.length === 0 ? {} : { relatedLocations: rest }),
    });
}
async function renderEquationFragments(document, rendererId, registry, policy, sourceName, timeoutMs) {
    const targets = equationTargets(document);
    const rendererName = rendererId.toUpperCase();
    if (targets.length === 0) {
        return { fragments: new Map(), diagnostics: [] };
    }
    const renderer = registry.renderers.find((entry) => entry.id === rendererId);
    if (renderer === undefined) {
        return {
            fragments: new Map(),
            diagnostics: [
                groupedAdapterDiagnostic("azeforge.renderer#adapter-missing", `No ${rendererName} Renderer is registered for equation Blocks.`, targets, sourceName, { blockType: "equation", rendererId }, `Register the built-in ${rendererName} Renderer.`),
            ],
        };
    }
    if (policy.disabledRendererIds?.includes(renderer.id) === true) {
        return {
            fragments: new Map(),
            diagnostics: [
                groupedAdapterDiagnostic("azeforge.renderer#adapter-disabled", `${rendererName} Renderer "${renderer.id}" is disabled by host policy.`, targets, sourceName, { rendererId: renderer.id }, "Enable the Renderer in Compiler policy."),
            ],
        };
    }
    const candidates = registry.blockRenderers.filter((entry) => entry.descriptor.blockType === "equation" &&
        entry.descriptor.rendererId === rendererId);
    if (candidates.length === 0) {
        return {
            fragments: new Map(),
            diagnostics: [
                groupedAdapterDiagnostic("azeforge.renderer#adapter-missing", "No Block renderer is registered for equation Blocks.", targets, sourceName, { blockType: "equation", rendererId }, `Register the built-in equation ${rendererName} Block renderer.`),
            ],
        };
    }
    const compatible = candidates.filter((entry) => targets.every((target) => satisfiesSemverRange(target.block.pluginVersion, entry.descriptor.pluginVersionRange)) &&
        satisfiesSemverRange(renderer.version, entry.descriptor.rendererVersionRange));
    if (compatible.length === 0) {
        const candidate = candidates[0];
        return {
            fragments: new Map(),
            diagnostics: [
                groupedAdapterDiagnostic("azeforge.renderer#adapter-incompatible", "The registered equation Block renderer is incompatible with this Document.", targets, sourceName, {
                    blockType: "equation",
                    ...(candidate === undefined
                        ? {}
                        : {
                            adapterId: candidate.descriptor.id,
                            pluginVersionRange: candidate.descriptor.pluginVersionRange,
                            rendererVersionRange: candidate.descriptor.rendererVersionRange,
                        }),
                }, `Register a Block renderer compatible with equation v1 and ${rendererName} v1.`),
            ],
        };
    }
    if (compatible.length > 1) {
        return {
            fragments: new Map(),
            diagnostics: [
                groupedAdapterDiagnostic("azeforge.renderer#adapter-ambiguous", "More than one Block renderer matches equation Blocks.", targets, sourceName, {
                    blockType: "equation",
                    adapterIds: compatible.map((entry) => entry.descriptor.id),
                }, "Register exactly one matching Block renderer."),
            ],
        };
    }
    const chosen = compatible[0];
    if (chosen === undefined) {
        return { fragments: new Map(), diagnostics: [] };
    }
    if (policy.disabledBlockRendererIds?.includes(chosen.descriptor.id) === true) {
        return {
            fragments: new Map(),
            diagnostics: [
                groupedAdapterDiagnostic("azeforge.renderer#adapter-disabled", `Block renderer "${chosen.descriptor.id}" is disabled by host policy.`, targets, sourceName, { adapterId: chosen.descriptor.id }, "Enable the Block renderer in Compiler policy."),
            ],
        };
    }
    // Safe: candidates were filtered to blockType "equation", so the render
    // implementation accepts EquationBlock even though the registry union is wider.
    const renderEquation = chosen.render;
    const fragments = new Map();
    const diagnostics = [];
    for (const target of targets) {
        const location = {
            ...(sourceName === undefined ? {} : { source: sourceName }),
            range: target.block.range,
        };
        try {
            const fragment = await withRenderTimeout(Promise.resolve(renderEquation(target.block, {
                ...(sourceName === undefined ? {} : { sourceName }),
            })), timeoutMs);
            fragments.set(target.block, sanitizeKatexHtml(fragment));
        }
        catch (error) {
            if (error instanceof RenderTimeoutError) {
                diagnostics.push(createDiagnostic("azeforge.renderer#timeout", "error", `Block renderer "${chosen.descriptor.id}" timed out.`, {
                    location,
                    data: {
                        adapterId: chosen.descriptor.id,
                        timeoutMs,
                    },
                    suggestion: "Retry the operation or adjust the host render timeout.",
                }));
            }
            else if (error instanceof EquationSanitizerError ||
                error instanceof FragmentSecurityError) {
                diagnostics.push(createDiagnostic("azeforge.security#sanitizer-rewrite", "error", "A Fragment failed final sanitization; refusing to publish.", {
                    location,
                    data: {
                        adapterId: chosen.descriptor.id,
                        blockType: "equation",
                    },
                    suggestion: "Remove the unsafe construct or report this Source as a sanitizer failure.",
                }));
            }
            else if (isCapabilityDenial(error)) {
                diagnostics.push(createDiagnostic("azeforge.security#capability-denied", "error", `Block renderer "${chosen.descriptor.id}" was denied a capability.`, {
                    location,
                    data: { adapterId: chosen.descriptor.id },
                }));
            }
            else {
                diagnostics.push(createDiagnostic("azeforge.renderer#unexpected-failure", "error", "The equation Block renderer failed unexpectedly.", {
                    location,
                    data: {
                        adapterId: chosen.descriptor.id,
                        blockType: "equation",
                    },
                }));
            }
        }
    }
    return { fragments, diagnostics };
}
async function renderDerivationFragments(document, rendererId, registry, policy, sourceName, timeoutMs) {
    const targets = derivationTargets(document);
    const rendererName = rendererId.toUpperCase();
    if (targets.length === 0) {
        return { fragments: new Map(), diagnostics: [] };
    }
    const candidates = registry.blockRenderers.filter((entry) => entry.descriptor.blockType === DERIVATION_PLUGIN_TYPE &&
        entry.descriptor.rendererId === rendererId);
    if (candidates.length === 0) {
        return {
            fragments: new Map(),
            diagnostics: [
                groupedAdapterDiagnostic("azeforge.renderer#adapter-missing", `No Block renderer is registered for derivation Blocks.`, targets, sourceName, { blockType: DERIVATION_PLUGIN_TYPE, rendererId }, `Register the built-in derivation ${rendererName} Block renderer.`, "derivation"),
            ],
        };
    }
    const compatible = candidates.filter((entry) => targets.every((target) => satisfiesSemverRange(target.block.pluginVersion, entry.descriptor.pluginVersionRange)) &&
        satisfiesSemverRange(registry.renderers.find(({ id }) => id === rendererId)?.version ?? "0.0.0", entry.descriptor.rendererVersionRange));
    if (compatible.length === 0) {
        return {
            fragments: new Map(),
            diagnostics: [
                groupedAdapterDiagnostic("azeforge.renderer#adapter-incompatible", "The registered derivation Block renderer is incompatible with this Document.", targets, sourceName, { blockType: DERIVATION_PLUGIN_TYPE, rendererId }, `Register a Block renderer compatible with derivation v1 and ${rendererName} v1.`, "derivation"),
            ],
        };
    }
    if (compatible.length > 1) {
        return {
            fragments: new Map(),
            diagnostics: [
                groupedAdapterDiagnostic("azeforge.renderer#adapter-ambiguous", "More than one Block renderer matches derivation Blocks.", targets, sourceName, {
                    blockType: DERIVATION_PLUGIN_TYPE,
                    adapterIds: compatible.map((entry) => entry.descriptor.id),
                }, "Register exactly one matching Block renderer.", "derivation"),
            ],
        };
    }
    const chosen = compatible[0];
    if (chosen === undefined) {
        return { fragments: new Map(), diagnostics: [] };
    }
    if (policy.disabledBlockRendererIds?.includes(chosen.descriptor.id) === true) {
        return {
            fragments: new Map(),
            diagnostics: [
                groupedAdapterDiagnostic("azeforge.renderer#adapter-disabled", `Block renderer "${chosen.descriptor.id}" is disabled by host policy.`, targets, sourceName, { adapterId: chosen.descriptor.id }, "Enable the Block renderer in Compiler policy.", "derivation"),
            ],
        };
    }
    const render = chosen.render;
    const fragments = new Map();
    const diagnostics = [];
    for (const target of targets) {
        const location = {
            ...(sourceName === undefined ? {} : { source: sourceName }),
            range: target.block.range,
        };
        try {
            const fragment = await withRenderTimeout(Promise.resolve(render(target.block, {
                ...(sourceName === undefined ? {} : { sourceName }),
            })), timeoutMs);
            fragments.set(target.block, sanitizeKatexHtml(fragment));
        }
        catch (error) {
            if (error instanceof RenderTimeoutError) {
                diagnostics.push(createDiagnostic("azeforge.renderer#timeout", "error", `Block renderer "${chosen.descriptor.id}" timed out.`, {
                    location,
                    data: { adapterId: chosen.descriptor.id, timeoutMs },
                    suggestion: "Retry the operation or adjust the host render timeout.",
                }));
            }
            else if (error instanceof EquationSanitizerError ||
                error instanceof FragmentSecurityError) {
                diagnostics.push(createDiagnostic("azeforge.security#sanitizer-rewrite", "error", "A Fragment failed final sanitization; refusing to publish.", {
                    location,
                    data: {
                        adapterId: chosen.descriptor.id,
                        blockType: DERIVATION_PLUGIN_TYPE,
                    },
                    suggestion: "Remove the unsafe construct or report this Source as a sanitizer failure.",
                }));
            }
            else if (isCapabilityDenial(error)) {
                diagnostics.push(createDiagnostic("azeforge.security#capability-denied", "error", `Block renderer "${chosen.descriptor.id}" was denied a capability.`, {
                    location,
                    data: { adapterId: chosen.descriptor.id },
                }));
            }
            else {
                diagnostics.push(createDiagnostic("azeforge.renderer#unexpected-failure", "error", "The derivation Block renderer failed unexpectedly.", {
                    location,
                    data: { adapterId: chosen.descriptor.id, blockType: DERIVATION_PLUGIN_TYPE },
                }));
            }
        }
    }
    return { fragments, diagnostics };
}
async function renderMermaidFragments(document, rendererId, registry, policy, sourceName, timeoutMs, theme) {
    const targets = mermaidTargets(document);
    const rendererName = rendererId.toUpperCase();
    if (targets.length === 0) {
        return { fragments: new Map(), diagnostics: [] };
    }
    const renderer = registry.renderers.find((entry) => entry.id === rendererId);
    if (renderer === undefined) {
        return {
            fragments: new Map(),
            diagnostics: [
                groupedAdapterDiagnostic("azeforge.renderer#adapter-missing", `No ${rendererName} Renderer is registered for mermaid Blocks.`, targets, sourceName, { blockType: MERMAID_PLUGIN_TYPE, rendererId }, `Register the built-in ${rendererName} Renderer.`),
            ],
        };
    }
    if (policy.disabledRendererIds?.includes(renderer.id) === true) {
        return {
            fragments: new Map(),
            diagnostics: [
                groupedAdapterDiagnostic("azeforge.renderer#adapter-disabled", `${rendererName} Renderer "${renderer.id}" is disabled by host policy.`, targets, sourceName, { rendererId: renderer.id }, "Enable the Renderer in Compiler policy."),
            ],
        };
    }
    const candidates = registry.blockRenderers.filter((entry) => entry.descriptor.blockType === MERMAID_PLUGIN_TYPE &&
        entry.descriptor.rendererId === rendererId);
    if (candidates.length === 0) {
        return {
            fragments: new Map(),
            diagnostics: [
                groupedAdapterDiagnostic("azeforge.renderer#adapter-missing", "No Block renderer is registered for mermaid Blocks.", targets, sourceName, { blockType: MERMAID_PLUGIN_TYPE, rendererId }, `Register the built-in mermaid ${rendererName} Block renderer.`),
            ],
        };
    }
    const compatible = candidates.filter((entry) => targets.every((target) => satisfiesSemverRange(target.block.pluginVersion, entry.descriptor.pluginVersionRange)) &&
        satisfiesSemverRange(renderer.version, entry.descriptor.rendererVersionRange));
    if (compatible.length === 0) {
        const candidate = candidates[0];
        return {
            fragments: new Map(),
            diagnostics: [
                groupedAdapterDiagnostic("azeforge.renderer#adapter-incompatible", "The registered mermaid Block renderer is incompatible with this Document.", targets, sourceName, {
                    blockType: MERMAID_PLUGIN_TYPE,
                    ...(candidate === undefined
                        ? {}
                        : {
                            adapterId: candidate.descriptor.id,
                            pluginVersionRange: candidate.descriptor.pluginVersionRange,
                            rendererVersionRange: candidate.descriptor.rendererVersionRange,
                        }),
                }, `Register a Block renderer compatible with mermaid v1 and ${rendererName} v1.`),
            ],
        };
    }
    if (compatible.length > 1) {
        return {
            fragments: new Map(),
            diagnostics: [
                groupedAdapterDiagnostic("azeforge.renderer#adapter-ambiguous", "More than one Block renderer matches mermaid Blocks.", targets, sourceName, {
                    blockType: MERMAID_PLUGIN_TYPE,
                    adapterIds: compatible.map((entry) => entry.descriptor.id),
                }, "Register exactly one matching Block renderer."),
            ],
        };
    }
    const chosen = compatible[0];
    if (chosen === undefined) {
        return { fragments: new Map(), diagnostics: [] };
    }
    if (policy.disabledBlockRendererIds?.includes(chosen.descriptor.id) === true) {
        return {
            fragments: new Map(),
            diagnostics: [
                groupedAdapterDiagnostic("azeforge.renderer#adapter-disabled", `Block renderer "${chosen.descriptor.id}" is disabled by host policy.`, targets, sourceName, { adapterId: chosen.descriptor.id }, "Enable the Block renderer in Compiler policy."),
            ],
        };
    }
    const fragments = new Map();
    const diagnostics = [];
    for (const target of targets) {
        const location = {
            ...(sourceName === undefined ? {} : { source: sourceName }),
            range: target.block.range,
        };
        try {
            const fragment = await withRenderTimeout(Promise.resolve(chosen.render(target.block, {
                ...(sourceName === undefined ? {} : { sourceName }),
                ordinal: target.ordinal,
                theme,
            })), timeoutMs);
            fragments.set(target.block, sanitizeMermaidFragment(fragment, { ordinal: target.ordinal }));
        }
        catch (error) {
            if (error instanceof RenderTimeoutError) {
                diagnostics.push(createDiagnostic("azeforge.renderer#timeout", "error", `Block renderer "${chosen.descriptor.id}" timed out.`, {
                    location,
                    data: {
                        adapterId: chosen.descriptor.id,
                        timeoutMs,
                    },
                    suggestion: "Retry the operation or adjust the host render timeout.",
                }));
            }
            else if (error instanceof MermaidBrowserParseError) {
                diagnostics.push(createDiagnostic("azeforge.mermaid#invalid-syntax", "error", "The mermaid diagram could not be parsed.", {
                    location,
                    suggestion: "Check node brackets, arrows, and participant declarations.",
                    data: {
                        diagramType: target.block.diagramType,
                        detail: error.message,
                    },
                }));
            }
            else if (error instanceof MermaidBrowserUnavailableError) {
                diagnostics.push(createDiagnostic("azeforge.renderer#adapter-missing", "error", "The pinned Mermaid browser engine is unavailable.", {
                    location,
                    data: {
                        blockType: MERMAID_PLUGIN_TYPE,
                        engine: "HeadlessChrome",
                    },
                    suggestion: "Reinstall AzeForge browser dependencies and retry.",
                }));
            }
            else if (error instanceof MermaidSanitizerError ||
                error instanceof FragmentSecurityError) {
                diagnostics.push(createDiagnostic("azeforge.security#sanitizer-rewrite", "error", "A Fragment failed final sanitization; refusing to publish.", {
                    location,
                    data: {
                        adapterId: chosen.descriptor.id,
                        blockType: MERMAID_PLUGIN_TYPE,
                    },
                    suggestion: "Remove the unsafe construct or report this Source as a sanitizer failure.",
                }));
            }
            else if (isCapabilityDenial(error)) {
                diagnostics.push(createDiagnostic("azeforge.security#capability-denied", "error", `Block renderer "${chosen.descriptor.id}" was denied a capability.`, {
                    location,
                    data: { adapterId: chosen.descriptor.id },
                }));
            }
            else {
                diagnostics.push(createDiagnostic("azeforge.renderer#unexpected-failure", "error", "The mermaid Block renderer failed unexpectedly.", {
                    location,
                    data: {
                        adapterId: chosen.descriptor.id,
                        blockType: MERMAID_PLUGIN_TYPE,
                    },
                }));
            }
        }
    }
    return { fragments, diagnostics };
}
/**
 * The positional Fragment families share this preflight: each figure receives
 * its per-kind ordinal and this Document's Theme, because the emitter sizes
 * every box through the Advance metric, so layout and paint must agree on one
 * Theme. Running it before HTML assembly means a failure here publishes no
 * Artifact. Renderer, Block renderer and version compatibility are resolved
 * before any Block is rendered, so a family with no Block emits nothing while
 * a family whose Blocks cannot be resolved emits bounded adapter diagnostics
 * instead of a partial figure.
 */
async function renderFamilyFragments(document, rendererId, registry, policy, sourceName, theme, family) {
    const targets = family.selectTargets(document);
    if (targets.length === 0) {
        return { fragments: new Map(), diagnostics: [] };
    }
    const rendererName = rendererId.toUpperCase();
    const renderer = registry.renderers.find((entry) => entry.id === rendererId);
    if (renderer === undefined) {
        return {
            fragments: new Map(),
            diagnostics: [
                groupedAdapterDiagnostic("azeforge.renderer#adapter-missing", `No ${rendererName} Renderer is registered for ${family.label} Blocks.`, targets, sourceName, { blockType: family.blockType, rendererId }, `Register the built-in ${rendererName} Renderer.`, family.blockType),
            ],
        };
    }
    if (policy.disabledRendererIds?.includes(renderer.id) === true) {
        return {
            fragments: new Map(),
            diagnostics: [
                groupedAdapterDiagnostic("azeforge.renderer#adapter-disabled", `${rendererName} Renderer "${renderer.id}" is disabled by host policy.`, targets, sourceName, { rendererId: renderer.id }, "Enable the Renderer in Compiler policy.", family.blockType),
            ],
        };
    }
    const fragments = new Map();
    const diagnostics = [];
    for (const kind of family.kinds) {
        const kindTargets = targets.filter((target) => target.kind === kind);
        if (kindTargets.length === 0)
            continue;
        const candidates = registry.blockRenderers.filter((entry) => entry.descriptor.blockType === kind && entry.descriptor.rendererId === rendererId);
        if (candidates.length === 0) {
            diagnostics.push(groupedAdapterDiagnostic("azeforge.renderer#adapter-missing", `No Block renderer is registered for ${kind} Blocks.`, kindTargets, sourceName, { blockType: kind, rendererId }, `Register the built-in ${kind} ${rendererName} Block renderer.`, kind));
            continue;
        }
        const compatible = candidates.filter((entry) => kindTargets.every((target) => satisfiesSemverRange(target.block.pluginVersion, entry.descriptor.pluginVersionRange)) && satisfiesSemverRange(renderer.version, entry.descriptor.rendererVersionRange));
        if (compatible.length === 0) {
            diagnostics.push(groupedAdapterDiagnostic("azeforge.renderer#adapter-incompatible", `The registered ${kind} Block renderer is incompatible with this Document.`, kindTargets, sourceName, {
                blockType: kind,
                adapterIds: candidates.map((entry) => entry.descriptor.id),
            }, "Register a Block renderer whose plugin and renderer ranges match.", kind));
            continue;
        }
        if (compatible.length > 1) {
            diagnostics.push(groupedAdapterDiagnostic("azeforge.renderer#adapter-ambiguous", `More than one ${kind} Block renderer matches this Document.`, kindTargets, sourceName, { blockType: kind, adapterIds: compatible.map((entry) => entry.descriptor.id) }, "Register exactly one matching Block renderer.", kind));
            continue;
        }
        const chosen = compatible[0];
        if (policy.disabledBlockRendererIds?.includes(chosen.descriptor.id) === true) {
            diagnostics.push(groupedAdapterDiagnostic("azeforge.renderer#adapter-disabled", `Block renderer "${chosen.descriptor.id}" is disabled by host policy.`, kindTargets, sourceName, { adapterId: chosen.descriptor.id }, "Enable the Block renderer in Compiler policy.", kind));
            continue;
        }
        const render = chosen.render;
        let ordinal = 0;
        for (const target of kindTargets) {
            const location = sourceName === undefined
                ? { range: target.block.range }
                : { source: sourceName, range: target.block.range };
            try {
                const rendered = render(target.block, {
                    ...(sourceName === undefined ? {} : { sourceName }),
                    ordinal,
                    theme,
                });
                // A synchronous family must not let the microtask queue launder a
                // Promise into a string, so its result is inspected before any await.
                const markup = family.synchronous ? rendered : await Promise.resolve(rendered);
                if (typeof markup !== "string") {
                    throw new BlockRendererSyncError(chosen.descriptor.id, kind);
                }
                fragments.set(target.block, markup);
            }
            catch (error) {
                const failure = family.failure(error);
                if (failure !== undefined) {
                    diagnostics.push(createDiagnostic(failure.code, "error", failure.message, {
                        location,
                        data: { adapterId: chosen.descriptor.id, blockType: kind },
                        suggestion: failure.remedy,
                    }));
                }
                else if (error instanceof BlockRendererSyncError) {
                    diagnostics.push(createDiagnostic("azeforge.renderer#adapter-sync", "error", `Block renderer "${error.adapterId}" must be synchronous.`, {
                        location,
                        data: { adapterId: error.adapterId, blockType: kind },
                        suggestion: "Register a synchronous Block renderer.",
                    }));
                }
                else {
                    diagnostics.push(createDiagnostic("azeforge.renderer#unexpected-failure", "error", `The ${kind} Block renderer failed unexpectedly.`, { location, data: { adapterId: chosen.descriptor.id, blockType: kind } }));
                }
            }
            ordinal += 1;
        }
    }
    return { fragments, diagnostics };
}
const MODEL_KINDS = ["sequence", "state", "entity", "class"];
function modelTargets(document) {
    const targets = [];
    walkBlocks(document.blocks, (block) => {
        if (block.kind === "sequence" ||
            block.kind === "state" ||
            block.kind === "entity" ||
            block.kind === "class") {
            targets.push({ kind: block.kind, block });
        }
    });
    return targets;
}
/**
 * Model fragments are produced ahead of HTML assembly so each figure receives
 * its per-kind positional ordinal and this Document's Theme: the emitter sizes
 * every box through the Advance metric, so layout and paint must agree on one
 * Theme. A failure here publishes no Artifact.
 */
async function renderModelsFragments(document, rendererId, registry, policy, sourceName, theme) {
    return renderFamilyFragments(document, rendererId, registry, policy, sourceName, theme, {
        blockType: "models",
        label: "model",
        kinds: MODEL_KINDS,
        selectTargets: modelTargets,
        synchronous: true,
        failure: (error) => error instanceof ModelsRenderError
            ? { code: error.code, message: error.message, remedy: error.remedy }
            : undefined,
    });
}
const ENGINEERING_KINDS = ["control", "free-body"];
function engineeringTargets(document) {
    const targets = [];
    walkBlocks(document.blocks, (block) => {
        if (block.kind === "control") {
            targets.push({ kind: "control", block });
        }
        else if (block.kind === "free-body") {
            targets.push({ kind: "free-body", block });
        }
    });
    return targets;
}
/**
 * Engineering fragments are produced ahead of HTML assembly: the control
 * layout engine is asynchronous, and both directives need their per-kind
 * positional ordinal and this Document's Theme (the Advance metric sizes every
 * control box, so layout and paint must agree on one Theme). A failure here
 * publishes no Artifact and never falls back to Mermaid.
 */
async function renderEngineeringFragments(document, rendererId, registry, policy, sourceName, theme) {
    return renderFamilyFragments(document, rendererId, registry, policy, sourceName, theme, {
        blockType: "engineering",
        label: "engineering",
        kinds: ENGINEERING_KINDS,
        selectTargets: engineeringTargets,
        synchronous: false,
        failure: (error) => error instanceof ControlLayoutError ||
            error instanceof ControlRenderError ||
            error instanceof FreeBodyRenderError
            ? { code: error.code, message: error.message, remedy: error.remedy }
            : undefined,
    });
}
/**
 * Diagram fragments are produced ahead of HTML assembly because the pinned
 * layout engine is asynchronous: the renderer returns one `<figure>` per
 * Block, and the HTML assembler only ever reads the finished string. A
 * failure here publishes no Artifact and never falls back to Mermaid.
 */
async function renderDiagramFragments(document, rendererId, registry, policy, sourceName, timeoutMs, theme) {
    const targets = diagramTargets(document);
    const rendererName = rendererId.toUpperCase();
    if (targets.length === 0) {
        return { fragments: new Map(), diagnostics: [] };
    }
    const renderer = registry.renderers.find((entry) => entry.id === rendererId);
    if (renderer === undefined) {
        return {
            fragments: new Map(),
            diagnostics: [
                groupedAdapterDiagnostic("azeforge.renderer#adapter-missing", `No ${rendererName} Renderer is registered for diagram Blocks.`, targets, sourceName, { blockType: DIAGRAM_PLUGIN_TYPE, rendererId }, `Register the built-in ${rendererName} Renderer.`, DIAGRAM_PLUGIN_TYPE),
            ],
        };
    }
    if (policy.disabledRendererIds?.includes(renderer.id) === true) {
        return {
            fragments: new Map(),
            diagnostics: [
                groupedAdapterDiagnostic("azeforge.renderer#adapter-disabled", `${rendererName} Renderer "${renderer.id}" is disabled by host policy.`, targets, sourceName, { rendererId: renderer.id }, "Enable the Renderer in Compiler policy.", DIAGRAM_PLUGIN_TYPE),
            ],
        };
    }
    const candidates = registry.blockRenderers.filter((entry) => entry.descriptor.blockType === DIAGRAM_PLUGIN_TYPE &&
        entry.descriptor.rendererId === rendererId);
    if (candidates.length === 0) {
        return {
            fragments: new Map(),
            diagnostics: [
                groupedAdapterDiagnostic("azeforge.renderer#adapter-missing", "No Block renderer is registered for diagram Blocks.", targets, sourceName, { blockType: DIAGRAM_PLUGIN_TYPE, rendererId }, `Register the built-in diagram ${rendererName} Block renderer.`, DIAGRAM_PLUGIN_TYPE),
            ],
        };
    }
    const compatible = candidates.filter((entry) => targets.every((target) => satisfiesSemverRange(target.block.pluginVersion, entry.descriptor.pluginVersionRange)) &&
        satisfiesSemverRange(renderer.version, entry.descriptor.rendererVersionRange));
    if (compatible.length === 0) {
        const candidate = candidates[0];
        return {
            fragments: new Map(),
            diagnostics: [
                groupedAdapterDiagnostic("azeforge.renderer#adapter-incompatible", "The registered diagram Block renderer is incompatible with this Document.", targets, sourceName, {
                    blockType: DIAGRAM_PLUGIN_TYPE,
                    ...(candidate === undefined
                        ? {}
                        : {
                            adapterId: candidate.descriptor.id,
                            pluginVersionRange: candidate.descriptor.pluginVersionRange,
                            rendererVersionRange: candidate.descriptor.rendererVersionRange,
                        }),
                }, `Register a Block renderer compatible with diagram v1 and ${rendererName} v1.`, DIAGRAM_PLUGIN_TYPE),
            ],
        };
    }
    if (compatible.length > 1) {
        return {
            fragments: new Map(),
            diagnostics: [
                groupedAdapterDiagnostic("azeforge.renderer#adapter-ambiguous", "More than one Block renderer matches diagram Blocks.", targets, sourceName, {
                    blockType: DIAGRAM_PLUGIN_TYPE,
                    adapterIds: compatible.map((entry) => entry.descriptor.id),
                }, "Register exactly one matching Block renderer.", DIAGRAM_PLUGIN_TYPE),
            ],
        };
    }
    const chosen = compatible[0];
    if (chosen === undefined) {
        return { fragments: new Map(), diagnostics: [] };
    }
    if (policy.disabledBlockRendererIds?.includes(chosen.descriptor.id) === true) {
        return {
            fragments: new Map(),
            diagnostics: [
                groupedAdapterDiagnostic("azeforge.renderer#adapter-disabled", `Block renderer "${chosen.descriptor.id}" is disabled by host policy.`, targets, sourceName, { adapterId: chosen.descriptor.id }, "Enable the Block renderer in Compiler policy.", DIAGRAM_PLUGIN_TYPE),
            ],
        };
    }
    const fragments = new Map();
    const diagnostics = [];
    for (const target of targets) {
        const location = {
            ...(sourceName === undefined ? {} : { source: sourceName }),
            range: target.block.range,
        };
        try {
            const fragment = await withRenderTimeout(Promise.resolve(chosen.render(target.block, {
                ...(sourceName === undefined ? {} : { sourceName }),
                ordinal: target.ordinal,
                theme,
            })), timeoutMs);
            fragments.set(target.block, fragment);
        }
        catch (error) {
            if (error instanceof RenderTimeoutError) {
                diagnostics.push(createDiagnostic("azeforge.renderer#timeout", "error", `Block renderer "${chosen.descriptor.id}" timed out.`, {
                    location,
                    data: { adapterId: chosen.descriptor.id, timeoutMs },
                    suggestion: "Retry the operation or adjust the host render timeout.",
                }));
            }
            else if (error instanceof DiagramLayoutError ||
                error instanceof DiagramRenderError) {
                diagnostics.push(createDiagnostic(error.code, "error", error.message, {
                    location,
                    data: {
                        adapterId: chosen.descriptor.id,
                        blockType: DIAGRAM_PLUGIN_TYPE,
                    },
                    suggestion: error.remedy,
                }));
            }
            else {
                diagnostics.push(createDiagnostic("azeforge.renderer#unexpected-failure", "error", "The diagram Block renderer failed unexpectedly.", {
                    location,
                    data: {
                        adapterId: chosen.descriptor.id,
                        blockType: DIAGRAM_PLUGIN_TYPE,
                    },
                }));
            }
        }
    }
    return { fragments, diagnostics };
}
function checkPluginAdapters(document, rendererId, registry, policy, sourceName) {
    const rendererName = rendererId.toUpperCase();
    const diagnostics = [];
    let renderCallout;
    let renderTable;
    let renderFigure;
    let renderBibliography;
    let renderAlgorithm;
    let renderStatement;
    let renderExample;
    let renderPlot;
    let renderChart;
    let renderGeometry;
    let renderFormula;
    let renderReaction;
    let renderStructure;
    let renderCircuit;
    let renderTiming;
    for (const entry of [
        { blockType: "callout", pluginVersion: "1.0.0" },
        { blockType: "table", pluginVersion: "2.0.0" },
        { blockType: "plot", pluginVersion: "1.0.0" },
        { blockType: "chart", pluginVersion: "1.0.0" },
        { blockType: "geometry", pluginVersion: "1.0.0" },
        { blockType: "formula", pluginVersion: "1.0.0" },
        { blockType: "reaction", pluginVersion: "1.0.0" },
        { blockType: "structure", pluginVersion: "1.0.0" },
        { blockType: "circuit", pluginVersion: "1.0.0" },
        { blockType: "timing", pluginVersion: "1.0.0" },
        { blockType: "algorithm", pluginVersion: "1.0.0" },
        { blockType: "statement", pluginVersion: "1.0.0" },
        { blockType: "example", pluginVersion: "1.0.0" },
        { blockType: "figure", pluginVersion: "1.0.0" },
        { blockType: "bibliography", pluginVersion: "1.0.0" },
    ]) {
        const entryType = entry.blockType;
        const blocks = pluginBlocks(document, entry.blockType);
        if (blocks.length === 0)
            continue;
        const targets = blocks.map((block) => ({ block }));
        const renderer = registry.renderers.find((item) => item.id === rendererId);
        if (renderer === undefined) {
            diagnostics.push(groupedAdapterDiagnostic("azeforge.renderer#adapter-missing", `No ${rendererName} Renderer is registered for ${entry.blockType} Blocks.`, targets, sourceName, { blockType: entry.blockType, rendererId }, `Register the built-in ${rendererName} Renderer.`, entry.blockType));
            continue;
        }
        if (policy.disabledRendererIds?.includes(renderer.id) === true) {
            diagnostics.push(groupedAdapterDiagnostic("azeforge.renderer#adapter-disabled", `${rendererName} Renderer "${renderer.id}" is disabled by host policy.`, targets, sourceName, { rendererId: renderer.id }, "Enable the Renderer in Compiler policy.", entry.blockType));
            continue;
        }
        const candidates = registry.blockRenderers.filter((item) => item.descriptor.blockType === entry.blockType &&
            item.descriptor.rendererId === rendererId);
        if (candidates.length === 0) {
            diagnostics.push(groupedAdapterDiagnostic("azeforge.renderer#adapter-missing", `No Block renderer is registered for ${entry.blockType} Blocks.`, targets, sourceName, { blockType: entry.blockType, rendererId }, `Register the built-in ${entry.blockType} ${rendererName} Block renderer.`, entry.blockType));
            continue;
        }
        const compatible = candidates.filter((item) => satisfiesSemverRange(entry.pluginVersion, item.descriptor.pluginVersionRange) &&
            satisfiesSemverRange(renderer.version, item.descriptor.rendererVersionRange));
        if (compatible.length === 0) {
            const candidate = candidates[0];
            diagnostics.push(groupedAdapterDiagnostic("azeforge.renderer#adapter-incompatible", `The registered ${entry.blockType} Block renderer is incompatible with this Document.`, targets, sourceName, {
                blockType: entry.blockType,
                ...(candidate === undefined
                    ? {}
                    : {
                        adapterId: candidate.descriptor.id,
                        pluginVersionRange: candidate.descriptor.pluginVersionRange,
                        rendererVersionRange: candidate.descriptor.rendererVersionRange,
                    }),
            }, `Register a Block renderer compatible with ${entry.blockType} v1 and ${rendererName} v1.`, entry.blockType));
            continue;
        }
        if (compatible.length > 1) {
            diagnostics.push(groupedAdapterDiagnostic("azeforge.renderer#adapter-ambiguous", `More than one Block renderer matches ${entry.blockType} Blocks.`, targets, sourceName, {
                blockType: entry.blockType,
                adapterIds: compatible.map((item) => item.descriptor.id),
            }, "Register exactly one matching Block renderer.", entry.blockType));
            continue;
        }
        const chosen = compatible[0];
        if (chosen === undefined)
            continue;
        if (policy.disabledBlockRendererIds?.includes(chosen.descriptor.id) === true) {
            diagnostics.push(groupedAdapterDiagnostic("azeforge.renderer#adapter-disabled", `Block renderer "${chosen.descriptor.id}" is disabled by host policy.`, targets, sourceName, { adapterId: chosen.descriptor.id }, "Enable the Block renderer in Compiler policy.", entry.blockType));
            continue;
        }
        if (entry.blockType === "callout") {
            const render = chosen.render;
            renderCallout = (block, context) => {
                const result = render(block, context);
                if (typeof result !== "string") {
                    throw new BlockRendererSyncError(chosen.descriptor.id, "callout");
                }
                return result;
            };
        }
        else if (entry.blockType === "table") {
            const render = chosen.render;
            renderTable = (block, context) => {
                const result = render(block, context);
                if (typeof result !== "string") {
                    throw new BlockRendererSyncError(chosen.descriptor.id, "table");
                }
                return result;
            };
        }
        else if (entry.blockType === "plot") {
            const render = chosen.render;
            renderPlot = (block, context) => {
                const result = render(block, context);
                if (typeof result !== "string") {
                    throw new BlockRendererSyncError(chosen.descriptor.id, "plot");
                }
                return result;
            };
        }
        else if (entry.blockType === "chart") {
            const render = chosen.render;
            renderChart = (block, context) => {
                const result = render(block, context);
                if (typeof result !== "string") {
                    throw new BlockRendererSyncError(chosen.descriptor.id, "chart");
                }
                return result;
            };
        }
        else if (entry.blockType === "geometry") {
            const render = chosen.render;
            renderGeometry = (block, context) => {
                const result = render(block, context);
                if (typeof result !== "string") {
                    throw new BlockRendererSyncError(chosen.descriptor.id, "geometry");
                }
                return result;
            };
        }
        else if (entry.blockType === "formula") {
            const render = chosen.render;
            renderFormula = (block, context) => {
                const result = render(block, context);
                if (typeof result !== "string") {
                    throw new BlockRendererSyncError(chosen.descriptor.id, "formula");
                }
                return result;
            };
        }
        else if (entry.blockType === "reaction") {
            const render = chosen.render;
            renderReaction = (block, context) => {
                const result = render(block, context);
                if (typeof result !== "string") {
                    throw new BlockRendererSyncError(chosen.descriptor.id, "reaction");
                }
                return result;
            };
        }
        else if (entry.blockType === "structure") {
            const render = chosen.render;
            renderStructure = (block, context) => {
                const result = render(block, context);
                if (typeof result !== "string") {
                    throw new BlockRendererSyncError(chosen.descriptor.id, "structure");
                }
                return result;
            };
        }
        else if (entry.blockType === "circuit") {
            const render = chosen.render;
            renderCircuit = (block, context) => {
                const result = render(block, context);
                if (typeof result !== "string") {
                    throw new BlockRendererSyncError(chosen.descriptor.id, "circuit");
                }
                return result;
            };
        }
        else if (entry.blockType === "timing") {
            const render = chosen.render;
            renderTiming = (block, context) => {
                const result = render(block, context);
                if (typeof result !== "string") {
                    throw new BlockRendererSyncError(chosen.descriptor.id, "timing");
                }
                return result;
            };
        }
        else if (entry.blockType === "figure") {
            const render = chosen.render;
            renderFigure = (block, context) => {
                const result = render(block, context);
                if (typeof result !== "string") {
                    throw new BlockRendererSyncError(chosen.descriptor.id, "figure");
                }
                return result;
            };
        }
        else if (entry.blockType === "bibliography") {
            const render = chosen.render;
            const citationStyle = document.composition?.citationStyle;
            renderBibliography = (block, context) => {
                const result = render(block, context, citationStyle);
                if (typeof result !== "string") {
                    throw new BlockRendererSyncError(chosen.descriptor.id, "bibliography");
                }
                return result;
            };
        }
        else if (entry.blockType === "algorithm") {
            const render = chosen.render;
            renderAlgorithm = (block, context) => {
                const result = render(block, context);
                if (typeof result !== "string") {
                    throw new BlockRendererSyncError(chosen.descriptor.id, "algorithm");
                }
                return result;
            };
        }
        else if (entry.blockType === "statement") {
            const render = chosen.render;
            renderStatement = (block, context) => {
                const result = render(block, context);
                if (typeof result !== "string") {
                    throw new BlockRendererSyncError(chosen.descriptor.id, "statement");
                }
                return result;
            };
        }
        else if (entry.blockType === "example") {
            const render = chosen.render;
            renderExample = (block, context) => {
                const result = render(block, context);
                if (typeof result !== "string") {
                    throw new BlockRendererSyncError(chosen.descriptor.id, "example");
                }
                return result;
            };
        }
        else {
            throw new CompilerConfigurationError("AZE_CONFIG_ADAPTER_BLOCK_TYPE", `Plugin adapter entry for "${entryType}" has no sync renderer wiring.`);
        }
    }
    return {
        diagnostics,
        ...(renderCallout === undefined ? {} : { renderCallout }),
        ...(renderTable === undefined ? {} : { renderTable }),
        ...(renderPlot === undefined ? {} : { renderPlot }),
        ...(renderChart === undefined ? {} : { renderChart }),
        ...(renderGeometry === undefined ? {} : { renderGeometry }),
        ...(renderFormula === undefined ? {} : { renderFormula }),
        ...(renderReaction === undefined ? {} : { renderReaction }),
        ...(renderStructure === undefined ? {} : { renderStructure }),
        ...(renderCircuit === undefined ? {} : { renderCircuit }),
        ...(renderTiming === undefined ? {} : { renderTiming }),
        ...(renderFigure === undefined ? {} : { renderFigure }),
        ...(renderBibliography === undefined ? {} : { renderBibliography }),
        ...(renderAlgorithm === undefined ? {} : { renderAlgorithm }),
        ...(renderStatement === undefined ? {} : { renderStatement }),
        ...(renderExample === undefined ? {} : { renderExample }),
    };
}
export function createCompiler(options = {}) {
    const diagnosticLimits = resolveDiagnosticLimits(options);
    const configuredThemes = options.themes ?? builtInThemes;
    const themes = {};
    for (const theme of configuredThemes) {
        if (!THEME_ID.test(theme.id) || !SEMVER.test(theme.version)) {
            throw new CompilerConfigurationError("AZE_CONFIG_THEME_IDENTITY", `Theme identity \"${theme.id}@${theme.version}\" is invalid.`);
        }
        validateTheme(theme);
        if (themes[theme.id] !== undefined) {
            throw new CompilerConfigurationError("AZE_CONFIG_THEME_DUPLICATE", `Theme \"${theme.id}\" is registered more than once.`);
        }
        themes[theme.id] = copyAndFreezeTheme(theme);
    }
    Object.freeze(themes);
    const defaultThemeId = options.defaultTheme ?? "default";
    if (themes[defaultThemeId] === undefined) {
        throw new CompilerConfigurationError("AZE_CONFIG_DEFAULT_THEME", `Default Theme \"${defaultThemeId}\" is not registered.`);
    }
    const registry = freezeRegistryForCompiler(resolveRegistry({
        ...(options.plugins === undefined ? {} : { plugins: options.plugins }),
        ...(options.blockRenderers === undefined
            ? {}
            : { blockRenderers: options.blockRenderers }),
        ...(options.renderers === undefined ? {} : { renderers: options.renderers }),
    }));
    const policy = Object.freeze({
        ...(options.policy?.disabledBlockRendererIds === undefined
            ? {}
            : {
                disabledBlockRendererIds: Object.freeze([
                    ...options.policy.disabledBlockRendererIds,
                ]),
            }),
        ...(options.policy?.disabledRendererIds === undefined
            ? {}
            : {
                disabledRendererIds: Object.freeze([
                    ...options.policy.disabledRendererIds,
                ]),
            }),
        ...(options.policy?.disabledThemeIds === undefined
            ? {}
            : {
                disabledThemeIds: Object.freeze([...options.policy.disabledThemeIds]),
            }),
    });
    const renderTimeoutMs = options.renderTimeoutMs ?? DEFAULT_RENDER_TIMEOUT_MS;
    if (!Number.isInteger(renderTimeoutMs) ||
        renderTimeoutMs <= 0 ||
        renderTimeoutMs > DEFAULT_RENDER_TIMEOUT_MS) {
        throw new CompilerConfigurationError("azeforge.config#render-timeout", "Render timeout must be a positive integer no greater than the default (5000 ms).");
    }
    const texRenderTimeoutMs = options.texRenderTimeoutMs ?? DEFAULT_TEX_RENDER_TIMEOUT_MS;
    if (!Number.isInteger(texRenderTimeoutMs) ||
        texRenderTimeoutMs <= 0 ||
        texRenderTimeoutMs > DEFAULT_TEX_RENDER_TIMEOUT_MS) {
        throw new CompilerConfigurationError("azeforge.config#tex-render-timeout", "TeX render timeout must be a positive integer no greater than the default (15000 ms).");
    }
    let fontFacesPromise;
    const compiler = {
        parse(source, parseOptions = {}) {
            return limitParseResult(parseSource(source, {
                ...(parseOptions.sourceName === undefined
                    ? {}
                    : { sourceName: parseOptions.sourceName }),
                plugins: parseOptions.plugins ?? registry.plugins,
                ...(parseOptions.allowRawLatex === undefined
                    ? {}
                    : { allowRawLatex: parseOptions.allowRawLatex }),
            }), diagnosticLimits);
        },
        validate(parsed) {
            return validateParsed(parsed, diagnosticLimits);
        },
        format(source, formatOptions = {}) {
            const before = validateParsed(limitParseResult(parseSource(source, {
                ...(formatOptions.sourceName === undefined
                    ? {}
                    : { sourceName: formatOptions.sourceName }),
                plugins: registry.plugins,
            }), diagnosticLimits), diagnosticLimits);
            const rewritten = formatSource(source, {
                ...(formatOptions.sourceName === undefined
                    ? {}
                    : { sourceName: formatOptions.sourceName }),
            });
            if (rewritten.source === undefined)
                return rewritten;
            const after = validateParsed(limitParseResult(parseSource(rewritten.source, {
                ...(formatOptions.sourceName === undefined
                    ? {}
                    : { sourceName: formatOptions.sourceName }),
                plugins: registry.plugins,
            }), diagnosticLimits), diagnosticLimits);
            if (!sameFormatMeaning(before, after)) {
                const range = {
                    start: { line: 1, column: 1, offset: 0 },
                    end: { line: 1, column: 1, offset: 0 },
                };
                return {
                    diagnostics: [
                        createDiagnostic("azeforge.format#ambiguous-structure", "error", "Formatting changed the semantic meaning of the Source.", {
                            ...(formatOptions.sourceName === undefined
                                ? { location: { range } }
                                : { location: { source: formatOptions.sourceName, range } }),
                            suggestion: "Report this Source as a formatter failure.",
                        }),
                    ],
                };
            }
            return rewritten;
        },
        async compile(source, compileOptions) {
            const validation = validateParsed(limitParseResult(parseSource(source, { ...compileOptions, plugins: registry.plugins }), diagnosticLimits), diagnosticLimits);
            if (validation.document === undefined) {
                return { diagnostics: validation.diagnostics };
            }
            if (compileOptions.format !== "html" && compileOptions.format !== "svg" && compileOptions.format !== "png" && compileOptions.format !== "pdf") {
                const unsupportedFormat = createDiagnostic("azeforge.renderer#format-unsupported", "error", `Artifact format \"${String(compileOptions.format)}\" is not supported.`, {
                    ...(compileOptions.sourceName === undefined
                        ? {}
                        : { location: { source: compileOptions.sourceName } }),
                    data: { format: String(compileOptions.format) },
                });
                return {
                    diagnostics: normalizeAndLimitDiagnostics([validation.diagnostics, [unsupportedFormat]], diagnosticLimits),
                };
            }
            const selectedRenderer = registry.renderers.find((renderer) => renderer.formats.includes(compileOptions.format));
            if (selectedRenderer === undefined) {
                const unavailableRenderer = createDiagnostic("azeforge.renderer#format-unsupported", "error", `No Renderer is registered for Artifact format \"${compileOptions.format}\".`, {
                    ...(compileOptions.sourceName === undefined
                        ? {}
                        : { location: { source: compileOptions.sourceName } }),
                    data: { format: compileOptions.format },
                });
                return {
                    diagnostics: normalizeAndLimitDiagnostics([validation.diagnostics, [unavailableRenderer]], diagnosticLimits),
                };
            }
            if (selectedRenderer.id !== compileOptions.format ||
                selectedRenderer.version !==
                    BUILT_IN_RENDERER_VERSION_BY_FORMAT[compileOptions.format]) {
                const unavailableImplementation = createDiagnostic("azeforge.renderer#adapter-missing", "error", `The registered Renderer for \"${compileOptions.format}\" has no trusted implementation.`, {
                    ...(compileOptions.sourceName === undefined
                        ? {}
                        : { location: { source: compileOptions.sourceName } }),
                    data: {
                        format: compileOptions.format,
                        rendererId: selectedRenderer.id,
                        rendererVersion: selectedRenderer.version,
                    },
                    suggestion: `Register the built-in ${compileOptions.format.toUpperCase()} Renderer.`,
                });
                return {
                    diagnostics: normalizeAndLimitDiagnostics([validation.diagnostics, [unavailableImplementation]], diagnosticLimits),
                };
            }
            if (policy.disabledRendererIds?.includes(selectedRenderer.id) === true) {
                const disabledRenderer = createDiagnostic("azeforge.renderer#adapter-disabled", "error", `Renderer \"${selectedRenderer.id}\" is disabled by host policy.`, {
                    ...(compileOptions.sourceName === undefined
                        ? {}
                        : { location: { source: compileOptions.sourceName } }),
                    data: {
                        format: compileOptions.format,
                        rendererId: selectedRenderer.id,
                    },
                    suggestion: "Enable the Renderer in Compiler policy.",
                });
                return {
                    diagnostics: normalizeAndLimitDiagnostics([validation.diagnostics, [disabledRenderer]], diagnosticLimits),
                };
            }
            const themeId = compileOptions.theme ?? validation.document.metadata.theme ?? defaultThemeId;
            const theme = themes[themeId];
            if (theme === undefined) {
                const unknownTheme = createDiagnostic("azeforge.renderer#unknown-theme", "error", `Theme "${themeId}" is not registered.`, {
                    ...(compileOptions.sourceName === undefined
                        ? {}
                        : { location: { source: compileOptions.sourceName } }),
                    data: { theme: themeId },
                });
                return {
                    diagnostics: normalizeAndLimitDiagnostics([validation.diagnostics, [unknownTheme]], diagnosticLimits),
                };
            }
            if (policy.disabledThemeIds?.includes(themeId) === true) {
                const disabledTheme = createDiagnostic("azeforge.renderer#disabled-theme", "error", `Theme "${themeId}" is disabled.`, {
                    ...(compileOptions.sourceName === undefined
                        ? {}
                        : { location: { source: compileOptions.sourceName } }),
                    data: { theme: themeId },
                });
                return {
                    diagnostics: normalizeAndLimitDiagnostics([validation.diagnostics, [disabledTheme]], diagnosticLimits),
                };
            }
            try {
                throwIfCancelled(compileOptions.signal);
                const equationPreflight = await renderEquationFragments(validation.document, selectedRenderer.id, registry, policy, compileOptions.sourceName, renderTimeoutMs);
                const texPreflight = await renderTexFragments(validation.document, options.texRenderer, compileOptions.sourceName, source, texRenderTimeoutMs, compileOptions.signal);
                const derivationPreflight = await renderDerivationFragments(validation.document, selectedRenderer.id, registry, policy, compileOptions.sourceName, renderTimeoutMs);
                const mermaidPreflight = await renderMermaidFragments(validation.document, selectedRenderer.id, registry, policy, compileOptions.sourceName, renderTimeoutMs, theme);
                const diagramPreflight = await renderDiagramFragments(validation.document, selectedRenderer.id, registry, policy, compileOptions.sourceName, renderTimeoutMs, theme);
                const modelsPreflight = await renderModelsFragments(validation.document, selectedRenderer.id, registry, policy, compileOptions.sourceName, theme);
                const engineeringPreflight = await renderEngineeringFragments(validation.document, selectedRenderer.id, registry, policy, compileOptions.sourceName, theme);
                const pluginPreflight = checkPluginAdapters(validation.document, selectedRenderer.id, registry, policy, compileOptions.sourceName);
                const preflightDiagnostics = [
                    ...equationPreflight.diagnostics,
                    ...derivationPreflight.diagnostics,
                    ...mermaidPreflight.diagnostics,
                    ...diagramPreflight.diagnostics,
                    ...modelsPreflight.diagnostics,
                    ...engineeringPreflight.diagnostics,
                    ...pluginPreflight.diagnostics,
                    ...texPreflight.diagnostics,
                ];
                if (preflightDiagnostics.length > 0) {
                    return {
                        diagnostics: normalizeAndLimitDiagnostics([validation.diagnostics, preflightDiagnostics], diagnosticLimits, collectBlockRanges(validation.document.blocks)),
                    };
                }
                throwIfCancelled(compileOptions.signal);
                const imageResolution = await resolveProjectImages(validation.document, {
                    ...(compileOptions.projectRoot === undefined
                        ? {}
                        : { projectRoot: compileOptions.projectRoot }),
                    ...(compileOptions.sourceName === undefined
                        ? {}
                        : { sourceName: compileOptions.sourceName }),
                });
                if (imageResolution.diagnostics.length > 0 ||
                    imageResolution.document === undefined ||
                    imageResolution.manifest === undefined) {
                    return {
                        diagnostics: normalizeAndLimitDiagnostics([validation.diagnostics, imageResolution.diagnostics], diagnosticLimits, collectBlockRanges(validation.document.blocks)),
                    };
                }
                throwIfCancelled(compileOptions.signal);
                const renderedText = [
                    ...(validation.document.metadata.title === undefined
                        ? []
                        : [validation.document.metadata.title]),
                ];
                collectRenderText(validation.document.blocks, renderedText);
                assertInterFontCoverage(renderedText);
                fontFacesPromise ??= Promise.all([
                    loadInterFontFaces(),
                    loadCodeFontFaces(),
                ]).then((faces) => faces.flat());
                const fontFaces = await fontFacesPromise;
                const contentHash = documentContentHash(validation.document);
                const pluginRenderers = {
                    ...(pluginPreflight.renderCallout === undefined
                        ? {}
                        : { renderCallout: pluginPreflight.renderCallout }),
                    ...(pluginPreflight.renderTable === undefined
                        ? {}
                        : { renderTable: pluginPreflight.renderTable }),
                    ...(pluginPreflight.renderPlot === undefined
                        ? {}
                        : { renderPlot: pluginPreflight.renderPlot }),
                    ...(pluginPreflight.renderChart === undefined
                        ? {}
                        : { renderChart: pluginPreflight.renderChart }),
                    ...(pluginPreflight.renderGeometry === undefined
                        ? {}
                        : { renderGeometry: pluginPreflight.renderGeometry }),
                    ...(pluginPreflight.renderFormula === undefined
                        ? {}
                        : { renderFormula: pluginPreflight.renderFormula }),
                    ...(pluginPreflight.renderReaction === undefined
                        ? {}
                        : { renderReaction: pluginPreflight.renderReaction }),
                    ...(pluginPreflight.renderStructure === undefined
                        ? {}
                        : { renderStructure: pluginPreflight.renderStructure }),
                    ...(pluginPreflight.renderCircuit === undefined
                        ? {}
                        : { renderCircuit: pluginPreflight.renderCircuit }),
                    ...(pluginPreflight.renderTiming === undefined
                        ? {}
                        : { renderTiming: pluginPreflight.renderTiming }),
                    ...(pluginPreflight.renderFigure === undefined
                        ? {}
                        : { renderFigure: pluginPreflight.renderFigure }),
                    ...(pluginPreflight.renderBibliography === undefined
                        ? {}
                        : { renderBibliography: pluginPreflight.renderBibliography }),
                    ...(pluginPreflight.renderAlgorithm === undefined
                        ? {}
                        : { renderAlgorithm: pluginPreflight.renderAlgorithm }),
                    ...(pluginPreflight.renderStatement === undefined
                        ? {}
                        : { renderStatement: pluginPreflight.renderStatement }),
                    ...(pluginPreflight.renderExample === undefined
                        ? {}
                        : { renderExample: pluginPreflight.renderExample }),
                };
                const renderArguments = [
                    imageResolution.document,
                    contentHash,
                    theme,
                    fontFaces,
                    equationPreflight.fragments,
                    katexDependencyClosure(),
                    derivationPreflight.fragments,
                    mermaidPreflight.fragments,
                    mermaidDependencyClosure(),
                    diagramPreflight.fragments,
                    diagramDependencyClosure(),
                    modelsPreflight.fragments,
                    engineeringPreflight.fragments,
                    controlDependencyClosure(),
                    freeBodyDependencyClosure(),
                    pluginRenderers,
                    texPreflight.fragments,
                    texTargets(validation.document).length === 0 ? undefined : options.texRenderer?.rendererIdentity,
                ];
                const htmlLayout = createHtmlLayout(renderArguments[0], renderArguments[2], renderArguments[3], renderArguments[4], renderArguments[5], renderArguments[6], renderArguments[7], renderArguments[8], renderArguments[9], renderArguments[10], renderArguments[11], renderArguments[12], renderArguments[13], renderArguments[14], renderArguments[15], renderArguments[16], renderArguments[17]);
                const artifact = compileOptions.format === "html"
                    ? await renderHtml(...renderArguments, imageResolution.manifest)
                    : compileOptions.format === "svg"
                        ? await renderSvg(htmlLayout, contentHash, theme, imageResolution.manifest, pinnedSvgBrowserCapability)
                        : compileOptions.format === "png"
                            ? await renderPng(htmlLayout, contentHash, theme, imageResolution.manifest, pinnedPngBrowserCapability)
                            : await renderPdf(htmlLayout, contentHash, theme, imageResolution.manifest, pinnedPdfBrowserCapability, {
                                title: documentTitle(imageResolution.document),
                                authors: imageResolution.document.metadata.authors,
                            });
                return {
                    diagnostics: validation.diagnostics,
                    document: validation.document,
                    contentHash,
                    artifact,
                };
            }
            catch (error) {
                const rendererFailure = error instanceof FontCoverageError
                    ? createDiagnostic("azeforge.renderer#font-coverage", "error", error.message, {
                        data: { codePoint: error.codePoint },
                        ...(compileOptions.sourceName === undefined
                            ? {}
                            : { location: { source: compileOptions.sourceName } }),
                    })
                    : error instanceof ArtifactLimitError ||
                        error instanceof SvgArtifactLimitError ||
                        error instanceof PngArtifactLimitError ||
                        error instanceof PdfArtifactLimitError
                        ? createDiagnostic("azeforge.renderer#artifact-limit", "error", error.message, {
                            data: { byteLength: error.byteLength },
                            ...(compileOptions.sourceName === undefined
                                ? {}
                                : { location: { source: compileOptions.sourceName } }),
                        })
                        : error instanceof ModelsRenderError
                            ? createDiagnostic(error.code, "error", error.message, {
                                data: {
                                    adapterId: selectedRenderer.id,
                                    blockType: "models",
                                },
                                suggestion: error.remedy,
                                ...(compileOptions.sourceName === undefined
                                    ? {}
                                    : { location: { source: compileOptions.sourceName } }),
                            })
                            : error instanceof MermaidBrowserUnavailableError
                                ? createDiagnostic("azeforge.renderer#browser-unavailable", "error", `The pinned browser engine is unavailable: ${error.message}`, {
                                    data: { engine: "HeadlessChrome" },
                                    suggestion: "Reinstall AzeForge browser dependencies and retry.",
                                    ...(compileOptions.sourceName === undefined
                                        ? {}
                                        : { location: { source: compileOptions.sourceName } }),
                                })
                                : isCapabilityDenial(error)
                                    ? createDiagnostic("azeforge.security#capability-denied", "error", `The ${compileOptions.format.toUpperCase()} Renderer was denied a capability; refusing to publish.`, {
                                        data: {
                                            format: compileOptions.format,
                                            rendererId: selectedRenderer.id,
                                        },
                                        ...(compileOptions.sourceName === undefined
                                            ? {}
                                            : { location: { source: compileOptions.sourceName } }),
                                    })
                                    : error instanceof EquationSanitizerError ||
                                        error instanceof MermaidSanitizerError ||
                                        error instanceof FragmentSecurityError
                                        ? createDiagnostic("azeforge.security#sanitizer-rewrite", "error", "A Fragment failed final sanitization; refusing to publish.", {
                                            data: { format: compileOptions.format },
                                            suggestion: "Remove the unsafe construct or report this Source as a sanitizer failure.",
                                            ...(compileOptions.sourceName === undefined
                                                ? {}
                                                : { location: { source: compileOptions.sourceName } }),
                                        })
                                        : error instanceof BlockRendererSyncError
                                            ? createDiagnostic("azeforge.renderer#adapter-sync", "error", `Block renderer "${error.adapterId}" must be synchronous.`, {
                                                data: {
                                                    adapterId: error.adapterId,
                                                    blockType: error.blockType,
                                                },
                                                suggestion: "Register a synchronous Block renderer.",
                                                ...(compileOptions.sourceName === undefined
                                                    ? {}
                                                    : { location: { source: compileOptions.sourceName } }),
                                            })
                                            : error instanceof CompilerCancelledError
                                                ? createDiagnostic("azeforge.compiler#cancelled", "error", "The operation was cancelled before publication.", {
                                                    ...(compileOptions.sourceName === undefined
                                                        ? {}
                                                        : { location: { source: compileOptions.sourceName } }),
                                                })
                                                : createDiagnostic("azeforge.renderer#unexpected-failure", "error", `The ${compileOptions.format.toUpperCase()} Renderer failed unexpectedly.`, {
                                                    ...(compileOptions.sourceName === undefined
                                                        ? {}
                                                        : { location: { source: compileOptions.sourceName } }),
                                                });
                return {
                    diagnostics: normalizeAndLimitDiagnostics([validation.diagnostics, [rendererFailure]], diagnosticLimits),
                };
            }
        },
    };
    return Object.freeze(compiler);
}
//# sourceMappingURL=compiler.js.map