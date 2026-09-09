import { createDiagnostic } from "./diagnostics.js";
import {
  MAX_EQUATION_SOURCE_LENGTH,
  MAX_EQUATION_TEX_LENGTH,
  renderReadableMathSource,
  validateEquationBody,
} from "./equation.js";
import { escapeHtml } from "./html-fragment.js";
import type {
  AzeBlockPlugin,
  DerivationBlock,
  DerivationStep,
  Diagnostic,
  Inline,
  JsonValue,
  SourceRange,
} from "./model.js";

export const DERIVATION_PLUGIN_TYPE = "derivation" as const;
export const DERIVATION_PLUGIN_VERSION = "1.0.0" as const;
export const DERIVATION_BODY_SYNTAX_ID = "azeforge.derivation/v1" as const;
export const DERIVATION_BODY_SYNTAX_VERSION = "1.0.0" as const;
export const DERIVATION_HTML_BLOCK_RENDERER_ID =
  "azeforge.derivation.html/v1" as const;
export const DERIVATION_HTML_BLOCK_RENDERER_VERSION = "1.0.0" as const;
export const HTML_RENDERER_ID = "html" as const;
export const HTML_RENDERER_VERSION = "1.0.0" as const;

export const derivationSourceSchema: JsonValue = Object.freeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "azeforge.derivation/source/v1",
  type: "object",
  additionalProperties: false,
  properties: {
    id: {
      type: "string",
      pattern: "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$",
    },
    number: { type: "boolean" },
    align: { type: "string", enum: ["left", "center", "right"] },
  },
});

export const derivationDataSchema: JsonValue = Object.freeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "azeforge.derivation/data/v1",
  type: "object",
  additionalProperties: false,
  required: ["steps", "pluginVersion"],
  properties: {
    kind: { const: "derivation" },
    pluginVersion: { const: "1.0.0" },
    steps: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["expression"],
        properties: {
          expression: { type: "string", minLength: 1, maxLength: 4000 },
          annotation: { type: "string", minLength: 1, maxLength: 500 },
        },
      },
    },
    number: { type: "boolean" },
    align: { type: "string", enum: ["left", "center", "right"] },
  },
});

export interface DerivationHeader {
  readonly id?: string;
  readonly number?: boolean;
  readonly align?: "left" | "center" | "right";
  readonly diagnostics: readonly Diagnostic[];
}

function headerDiagnostic(
  code: string,
  message: string,
  range: SourceRange,
  sourceName: string | undefined,
  extra: {
    readonly suggestion?: string;
    readonly data?: Readonly<Record<string, JsonValue>>;
  } = {},
): Diagnostic {
  return createDiagnostic(code, "error", message, {
    location:
      sourceName === undefined ? { range } : { source: sourceName, range },
    ...(extra.suggestion === undefined
      ? {}
      : { suggestion: extra.suggestion }),
    ...(extra.data === undefined ? {} : { data: extra.data }),
  });
}

export function parseDerivationHeader(
  entries: readonly {
    readonly key: string;
    readonly value: string;
    readonly range: SourceRange;
  }[],
  _blockRange: SourceRange,
  sourceName: string | undefined,
): DerivationHeader {
  const diagnostics: Diagnostic[] = [];
  let id: string | undefined;
  let number: boolean | undefined;
  let align: "left" | "center" | "right" | undefined;
  for (const entry of entries) {
    if (entry.key === "id") {
      if (entry.value.length === 0) {
        diagnostics.push(
          headerDiagnostic(
            "azeforge.derivation#invalid-attribute",
            "Derivation attribute id must not be empty.",
            entry.range,
            sourceName,
            { data: { attribute: "id", value: entry.value } },
          ),
        );
      } else {
        id = entry.value;
      }
      continue;
    }
    if (entry.key === "number") {
      if (entry.value !== "true" && entry.value !== "false") {
        diagnostics.push(
          headerDiagnostic(
            "azeforge.derivation#invalid-attribute",
            'Derivation attribute "number" must be true or false.',
            entry.range,
            sourceName,
            { data: { attribute: "number", value: entry.value } },
          ),
        );
      } else {
        number = entry.value === "true";
      }
      continue;
    }
    if (entry.key === "align") {
      if (entry.value !== "left" && entry.value !== "center" && entry.value !== "right") {
        diagnostics.push(
          headerDiagnostic(
            "azeforge.derivation#invalid-attribute",
            'Derivation attribute "align" must be left, center, or right.',
            entry.range,
            sourceName,
            { data: { attribute: "align", value: entry.value } },
          ),
        );
      } else {
        align = entry.value;
      }
      continue;
    }
    diagnostics.push(
      headerDiagnostic(
        "azeforge.derivation#invalid-attribute",
        `Derivation attribute "${entry.key}" is not a valid derivation attribute.`,
        entry.range,
        sourceName,
        {
          suggestion: "Valid derivation attributes are id, number, and align.",
          data: { attribute: entry.key },
        },
      ),
    );
  }
  return {
    ...(id === undefined ? {} : { id }),
    ...(number === undefined ? {} : { number }),
    ...(align === undefined ? {} : { align }),
    diagnostics,
  };
}

export interface ValidatedDerivation {
  readonly block?: DerivationBlock;
  readonly diagnostics: readonly Diagnostic[];
}

const EXPRESSION_ITEM = /^[ \t]*-[ \t]*expression[ \t]*:[ \t]*(.*)$/;

/**
 * Step record validation shared with the catalog derivation family. Each
 * `- expression:` step carries readable math plus an optional
 * annotation; expressions reuse the pinned KaTeX validation gate.
 */
export function validateDerivationBody(options: {
  readonly header: DerivationHeader;
  readonly body: string;
  readonly bodyRanges: readonly SourceRange[];
  readonly blockRange: SourceRange;
  readonly sourceName: string | undefined;
  readonly parseAnnotation: (
    text: string,
    range: SourceRange,
  ) => readonly Inline[] | undefined;
}): ValidatedDerivation {
  const { header, body, bodyRanges, blockRange, sourceName, parseAnnotation } = options;
  const diagnostics: Diagnostic[] = [];
  const trimmed = body.trim();
  if (trimmed.length === 0) {
    return {
      diagnostics: [
        createDiagnostic(
          "azeforge.derivation#empty",
          "error",
          "The derivation Block must contain at least one `- expression:` step.",
          {
            location: locationForIndex(bodyRanges, 0, blockRange, sourceName),
            suggestion: "Add a step such as `- expression: x = y`.",
          },
        ),
      ],
    };
  }
  const stepLines = body.split("\n");
  const items: {
    expression: string;
    annotation?: string;
    lineIndex: number;
  }[] = [];
  for (const [index, line] of stepLines.entries()) {
    const match = EXPRESSION_ITEM.exec(line);
    if (match === null) {
      if (/^[ \t]*-/.test(line)) {
        return {
          diagnostics: [
            createDiagnostic(
              "azeforge.derivation#invalid-step",
              "error",
              "Each derivation step must open with `- expression: <readable math>`.",
              {
                location: locationForIndex(bodyRanges, index, blockRange, sourceName),
              },
            ),
          ],
        };
      }
      continue;
    }
    const expression = (match[1] ?? "").trim();
    let annotation: string | undefined;
    if (index + 1 < stepLines.length) {
      const next = stepLines[index + 1] ?? "";
      const annotationMatch = /^[ \t]{2,}annotation[ \t]*:[ \t]*(.*)$/.exec(next);
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
  }
  if (items.length === 0) {
    return {
      diagnostics: [
        createDiagnostic(
          "azeforge.derivation#empty",
          "error",
          "The derivation Block must contain at least one `- expression:` step.",
          {
            location: locationForIndex(bodyRanges, 0, blockRange, sourceName),
            suggestion: "Add a step such as `- expression: x = y`.",
          },
        ),
      ],
    };
  }
  const steps: DerivationStep[] = [];
  for (const item of items) {
    const stepRange = bodyRanges[item.lineIndex] ?? blockRange;
    if (item.expression.length > MAX_EQUATION_SOURCE_LENGTH) {
      return {
        diagnostics: [
          createDiagnostic(
            "azeforge.derivation#invalid-syntax",
            "error",
            "A derivation step exceeds the maximum supported length.",
            {
              location: locationForIndex(bodyRanges, item.lineIndex, blockRange, sourceName),
            },
          ),
        ],
      };
    }
    const validated = validateEquationBody({
      header: { syntax: "readable", diagnostics: [] },
      body: item.expression,
      bodyRanges: [stepRange],
      blockRange: stepRange,
      sourceName,
      allowRawLatex: false,
    });
    if (validated.block === undefined) {
      diagnostics.push(...validated.diagnostics);
      return { diagnostics };
    }
    if (validated.block.tex.length > MAX_EQUATION_TEX_LENGTH) {
      return {
        diagnostics: [
          createDiagnostic(
            "azeforge.derivation#invalid-syntax",
            "error",
            "A derivation step exceeds the maximum supported length.",
            {
              location: locationForIndex(bodyRanges, item.lineIndex, blockRange, sourceName),
            },
          ),
        ],
      };
    }
    const annotationRange =
      item.annotation === undefined
        ? undefined
        : bodyRanges[item.lineIndex + 1] ?? stepRange;
    if (item.annotation !== undefined && annotationRange !== undefined) {
      const nodes = parseAnnotation(item.annotation, annotationRange);
      if (nodes === undefined) return { diagnostics };
      steps.push({ expression: item.expression, annotation: nodes });
    } else {
      steps.push({ expression: item.expression });
    }
  }
  const block: DerivationBlock = {
    kind: "derivation",
    range: blockRange,
    ...(header.id === undefined ? {} : { id: header.id }),
    pluginVersion: DERIVATION_PLUGIN_VERSION,
    steps: Object.freeze(steps),
    ...(header.number === undefined ? {} : { number: header.number }),
    ...(header.align === undefined ? {} : { align: header.align }),
  };
  return { block: Object.freeze(block), diagnostics };
}

function locationForIndex(
  bodyRanges: readonly SourceRange[],
  index: number,
  fallback: SourceRange,
  sourceName: string | undefined,
): { readonly source?: string; readonly range: SourceRange } {
  const range = bodyRanges[index] ?? fallback;
  return sourceName === undefined ? { range } : { source: sourceName, range };
}

const pluginDescriptor = Object.freeze({
  type: DERIVATION_PLUGIN_TYPE,
  version: DERIVATION_PLUGIN_VERSION,
  title: "Derivation",
  summary: "Ordered readable-equation steps rendered through pinned KaTeX.",
  diagnosticNamespace: "azeforge.derivation",
  sourceSchema: derivationSourceSchema,
  bodySyntax: Object.freeze({
    id: DERIVATION_BODY_SYNTAX_ID,
    version: DERIVATION_BODY_SYNTAX_VERSION,
  }),
  dataSchema: derivationDataSchema,
});

export const derivationPlugin: AzeBlockPlugin = Object.freeze({
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

export function renderDerivationFragment(
  block: DerivationBlock,
  _context: Readonly<{ sourceName?: string }>,
): string {
  const align = block.align ?? "center";
  const label = block.id === undefined ? "" : ` data-derivation-id="${block.id}"`;
  const number = block.number === true ? ' data-derivation-number="true"' : "";
  const steps = block.steps
    .map((step) => {
      const math = renderReadableMathSource(step.expression);
      const annotation =
        step.annotation === undefined || step.annotation.length === 0
          ? ""
          : `<span class="aze-derivation-annotation">${renderAnnotationHtml(step.annotation)}</span>`;
      return `<li class="aze-derivation-step">${math}${annotation}</li>`;
    })
    .join("");
  return `<figure class="aze-derivation" data-align="${align}"${label}${number}><ol>${steps}</ol></figure>`;
}

function renderAnnotationHtml(nodes: readonly Inline[]): string {
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