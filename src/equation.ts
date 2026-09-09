import {
  EQUATION_PLUGIN_TYPE,
  EQUATION_PLUGIN_VERSION,
  EQUATION_BODY_SYNTAX_ID,
  EQUATION_BODY_SYNTAX_VERSION,
  EQUATION_LATEX_LANGUAGE_VERSION,
  KATEX_VERSION,
  equationSourceSchema,
  equationDataSchema,
} from "./equation-schemas.js";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import katex from "katex";

import { createDiagnostic } from "./diagnostics.js";
import { sha256 } from "./hash.js";
import {
  canonicalSpelling,
  parseNativeMath,
  projectMathNode,
  rangeForOffset,
  treeToTex,
  treeToTexFromProjection,
} from "./math.js";
import type { MathNode } from "./math.js";
import type {
  AzeBlockPlugin,
  Diagnostic,
  EquationBlock,
  EquationBlockRenderer,
  JsonValue,
  RendererDescriptor,
  SourceRange,
} from "./model.js";

export const EQUATION_HTML_BLOCK_RENDERER_ID =
  "azeforge.equation.html/v1" as const;
export const EQUATION_HTML_BLOCK_RENDERER_VERSION = "1.0.0" as const;
export const HTML_RENDERER_ID = "html" as const;
export const HTML_RENDERER_VERSION = "1.0.0" as const;
export const MAX_EQUATION_TEX_LENGTH = 4000;
export const MAX_EQUATION_SOURCE_LENGTH = 4000;

export interface EquationHeader {
  readonly id?: string;
  readonly number?: boolean;
  readonly align?: "left" | "center" | "right";
  readonly syntax: "readable" | "latex";
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

export function parseEquationHeader(
  entries: readonly { readonly key: string; readonly value: string; readonly range: SourceRange }[],
  _blockRange: SourceRange,
  sourceName: string | undefined,
): EquationHeader {
  const diagnostics: Diagnostic[] = [];
  let id: string | undefined;
  let number: boolean | undefined;
  let align: "left" | "center" | "right" | undefined;
  let syntax: "readable" | "latex" = "readable";
  for (const entry of entries) {
    if (entry.key === "id") {
      if (entry.value.length === 0) {
        diagnostics.push(
          headerDiagnostic(
            "azeforge.equation#invalid-attribute",
            "Equation attribute id must not be empty.",
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
            "azeforge.equation#invalid-attribute",
            'Equation attribute "number" must be true or false.',
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
            "azeforge.equation#invalid-attribute",
            'Equation attribute "align" must be left, center, or right.',
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
    if (entry.key === "syntax") {
      if (entry.value !== "readable" && entry.value !== "latex") {
        diagnostics.push(
          headerDiagnostic(
            "azeforge.equation#invalid-attribute",
            'Equation attribute "syntax" must be readable or latex.',
            entry.range,
            sourceName,
            { data: { attribute: "syntax", value: entry.value } },
          ),
        );
      } else {
        syntax = entry.value;
      }
      continue;
    }
    diagnostics.push(
      headerDiagnostic(
        "azeforge.equation#invalid-attribute",
        `Equation attribute "${entry.key}" is not a valid equation attribute.`,
        entry.range,
        sourceName,
        {
          suggestion: "Valid equation attributes are id, number, align, and syntax.",
          data: { attribute: entry.key },
        },
      ),
    );
  }
  return {
    ...(id === undefined ? {} : { id }),
    ...(number === undefined ? {} : { number }),
    ...(align === undefined ? {} : { align }),
    syntax,
    diagnostics,
  };
}

const KATEX_RENDER_OPTIONS = {
  displayMode: true,
  output: "htmlAndMathml",
  trust: false,
  strict: true,
  throwOnError: true,
  maxSize: 20,
  maxExpand: 1000,
} as const;
export class KatexCssError extends Error {
  constructor(message = "The pinned KaTeX stylesheet is unavailable.") {
    super(message);
    this.name = "KatexCssError";
  }
}

let cachedKatexCss: string | undefined;

/**
 * Pinned KaTeX stylesheet with every `@font-face` source replaced by an
 * embedded woff2 data URI (OFL faces from the pinned KaTeX package).
 * Operator glyphs such as the display integral only size correctly in
 * their own faces; embedding keeps Artifacts self-contained with no
 * font fetch while MathML stays screen-reader-only.
 */
export function getKatexCss(): string {
  if (cachedKatexCss !== undefined) return cachedKatexCss;
  const require = createRequire(import.meta.url);
  const cssPath = require.resolve("katex/dist/katex.min.css");
  const fontDirectory = cssPath.slice(0, cssPath.lastIndexOf("/") + 1);
  const css = readFileSync(cssPath, "utf8").replace(
    /@font-face\{[^}]*\}/g,
    (block) => {
      const match = /url\(fonts\/([^)]+?)\.woff2\)/.exec(block);
      const face = match?.[1];
      if (face === undefined) return "";
      const data = readFileSync(
        `${fontDirectory}fonts/${face}.woff2`,
      ).toString("base64");
      return block.replace(
        /src:[^;}]*;?/,
        `src:url(data:font/woff2;base64,${data}) format("woff2");`,
      );
    },
  );
  if (!css.includes(".katex-mathml") || /url\(fonts\//.test(css)) {
    throw new KatexCssError();
  }
  cachedKatexCss = css;
  return css;
}
export function renderEquationToHtml(tex: string): string {
  return sanitizeKatexHtml(katex.renderToString(tex, { ...KATEX_RENDER_OPTIONS }));
}

export type EquationSanitizerFinding = "executable-markup" | "unsafe-url";

export class EquationSanitizerError extends Error {
  readonly finding: EquationSanitizerFinding;

  constructor(finding: EquationSanitizerFinding) {
    super(
      finding === "executable-markup"
        ? "KaTeX Fragment failed final sanitization: executable markup is refused."
        : "KaTeX Fragment failed final sanitization: unsafe URL scheme is refused.",
    );
    this.name = "EquationSanitizerError";
    this.finding = finding;
  }
}

const UNSAFE_SANITIZER_URL_SCHEME =
  /^(?:javascript|vbscript|file|ftp|blob):|^data:text\/html/i;

/**
 * Final sanitization for KaTeX Fragments. KaTeX with trust:false never
 * emits scripts or remote loads, so any executable markup or unsafe URL
 * scheme is a compromise signal and fails closed instead of being
 * rewritten. Clean output passes through byte-identical.
 */
export function sanitizeKatexHtml(html: string): string {
  if (
    /<\s*(script|iframe|object|embed|link|meta|base)\b/i.test(html) ||
    /\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i.test(html)
  ) {
    throw new EquationSanitizerError("executable-markup");
  }
  const urlAttribute =
    /\s(?:href|src|xlink:href)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
  for (let match = urlAttribute.exec(html); match !== null; match = urlAttribute.exec(html)) {
    const raw = match[1] ?? "";
    const url = raw
      .replace(/^["']|["']$/g, "")
      .replace(/[\s\0-\x1f]+/g, "")
      .toLowerCase();
    if (UNSAFE_SANITIZER_URL_SCHEME.test(url)) {
      throw new EquationSanitizerError("unsafe-url");
    }
  }
  return html;
}

export interface ValidatedEquation {
  readonly block?: EquationBlock;
  readonly diagnostics: readonly Diagnostic[];
}

function buildNativeBlock(
  parsed: { tree: MathNode },
  header: EquationHeader,
  blockRange: SourceRange,
  bodyRanges: readonly SourceRange[],
  sourceName: string | undefined,
  warningProblems: readonly {
    readonly code: string;
    readonly message: string;
    readonly offset: number;
    readonly length: number;
    readonly suggestion?: string;
    readonly data?: Readonly<Record<string, JsonValue>>;
  }[],
): ValidatedEquation {
  const location = (range: SourceRange) =>
    sourceName === undefined ? { range } : { source: sourceName, range };
  const tex = treeToTex(parsed.tree);
  if (tex.length > MAX_EQUATION_TEX_LENGTH) {
    return {
      diagnostics: [
        createDiagnostic(
          "azeforge.equation#invalid-syntax",
          "error",
          "The equation Block exceeds the maximum supported length.",
          {
            location: location(bodyRanges[0] ?? blockRange),
            data: { length: tex.length },
          },
        ),
      ],
    };
  }
  const block: EquationBlock = {
    kind: "equation",
    range: blockRange,
    ...(header.id === undefined ? {} : { id: header.id }),
    pluginVersion: EQUATION_PLUGIN_VERSION,
    notation: "native",
    tree: projectMathNode(parsed.tree),
    spelling: canonicalSpelling(parsed.tree),
    ...(header.number === undefined ? {} : { number: header.number }),
    ...(header.align === undefined ? {} : { align: header.align }),
  };
  return {
    block: Object.freeze(block),
    diagnostics: warningProblems.map((problem) =>
      createDiagnostic(
        `azeforge.equation#${problem.code}`,
        "warning",
        problem.message,
        {
          location: location(rangeForOffset(bodyRanges, problem.offset, problem.length)),
          ...(problem.suggestion === undefined
            ? {}
            : { suggestion: problem.suggestion }),
          ...(problem.data === undefined ? {} : { data: problem.data }),
        },
      ),
    ),
  };
}

export function validateEquationBody(options: {
  readonly header: EquationHeader;
  readonly body: string;
  readonly bodyRanges: readonly SourceRange[];
  readonly blockRange: SourceRange;
  readonly sourceName: string | undefined;
  readonly allowRawLatex: boolean;
  readonly syntaxRange?: SourceRange;
}): ValidatedEquation {
  const { header, body, bodyRanges, blockRange, sourceName, allowRawLatex } =
    options;
  const location = (range: SourceRange) =>
    sourceName === undefined ? { range } : { source: sourceName, range };
  const trimmed = body.trim();
  if (trimmed.length === 0) {
    return {
      diagnostics: [
        createDiagnostic(
          "azeforge.equation#empty",
          "error",
          "The equation Block must contain equation Source.",
          {
            location: location(blockRange),
            suggestion: "Add a readable equation such as F(omega) = sqrt(pi).",
          },
        ),
      ],
    };
  }
  if (trimmed.length > MAX_EQUATION_SOURCE_LENGTH) {
    return {
      diagnostics: [
        createDiagnostic(
          "azeforge.equation#invalid-syntax",
          "error",
          "The equation Block exceeds the maximum supported length.",
          {
            location: location(bodyRanges[0] ?? blockRange),
            data: { length: trimmed.length },
          },
        ),
      ],
    };
  }
  if (header.syntax === "latex" && !allowRawLatex) {
    return {
      diagnostics: [
        createDiagnostic(
          "azeforge.security#raw-latex-disabled",
          "error",
          "Raw LaTeX equations require explicit trusted-local approval.",
          {
            location: location(options.syntaxRange ?? blockRange),
            suggestion: "Render again with --allow-raw-latex on a trusted machine.",
            data: { syntax: "latex" },
          },
        ),
      ],
    };
  }
  if (header.syntax === "readable") {
    const parsed = parseNativeMath(trimmed);
    if ("problems" in parsed) {
      const diagnostics = parsed.problems.map((problem) =>
        createDiagnostic(
          `azeforge.equation#${problem.code}`,
          "error",
          problem.message,
          {
            location: location(
              rangeForOffset(bodyRanges, problem.offset, problem.length),
            ),
            ...(problem.code === "unsupported-notation" && allowRawLatex
              ? {
                  suggestion: `${problem.suggestion ?? "Use registered native notation."} Or use \`syntax: latex\` with --allow-raw-latex on this trusted machine.`,
                }
              : problem.suggestion === undefined
                ? {}
                : { suggestion: problem.suggestion }),
            ...(problem.data === undefined ? {} : { data: problem.data }),
          },
        ),
      );
      return { diagnostics };
    }
    return buildNativeBlock(parsed, header, blockRange, bodyRanges, sourceName, parsed.warnings);
  }
  // Raw LaTeX escape hatch: KaTeX is the validator, raw string hashed.
  if (trimmed.length > MAX_EQUATION_TEX_LENGTH) {
    return {
      diagnostics: [
        createDiagnostic(
          "azeforge.equation#invalid-syntax",
          "error",
          "The equation Block exceeds the maximum supported length.",
          {
            location: location(bodyRanges[0] ?? blockRange),
            data: { length: trimmed.length },
          },
        ),
      ],
    };
  }
  try {
    katex.renderToString(trimmed, { ...KATEX_RENDER_OPTIONS });
  } catch {
    return {
      diagnostics: [
        createDiagnostic(
          "azeforge.equation#invalid-latex",
          "error",
          "The raw LaTeX equation could not be parsed.",
          {
            location: location(bodyRanges[0] ?? blockRange),
            suggestion: "Check KaTeX-supported syntax without custom macros.",
          },
        ),
      ],
    };
  }
  const block: EquationBlock = {
    kind: "equation",
    range: blockRange,
    ...(header.id === undefined ? {} : { id: header.id }),
    pluginVersion: EQUATION_PLUGIN_VERSION,
    notation: "latex",
    tex: trimmed,
    ...(header.number === undefined ? {} : { number: header.number }),
    ...(header.align === undefined ? {} : { align: header.align }),
  };
  return { block: Object.freeze(block), diagnostics: [] };
}

/** TeX for a Block: latex keeps its raw string; native derives from the semantic tree. */
export function equationBlockTex(block: EquationBlock): string {
  if (block.notation === "latex") return block.tex ?? "";
  return treeToTexFromProjection(block.tree);
}

const pluginDescriptor = Object.freeze({
  type: EQUATION_PLUGIN_TYPE,
  version: EQUATION_PLUGIN_VERSION,
  title: "Equation",
  summary: "Native readable equations parsed into semantic trees and rendered through pinned KaTeX.",
  diagnosticNamespace: "azeforge.equation",
  sourceSchema: equationSourceSchema,
  bodySyntax: Object.freeze({
    id: EQUATION_BODY_SYNTAX_ID,
    version: EQUATION_BODY_SYNTAX_VERSION,
  }),
  dataSchema: equationDataSchema,
});

export const equationPlugin: AzeBlockPlugin = Object.freeze({
  descriptor: pluginDescriptor,
});

const blockRendererDescriptor = Object.freeze({
  id: EQUATION_HTML_BLOCK_RENDERER_ID,
  version: EQUATION_HTML_BLOCK_RENDERER_VERSION,
  blockType: EQUATION_PLUGIN_TYPE,
  pluginVersionRange: "2.0.0",
  rendererId: HTML_RENDERER_ID,
  rendererVersionRange: "1.0.0",
});

function renderEquationFragment(
  block: EquationBlock,
  _context: Readonly<{ sourceName?: string }>,
): string {
  const fragment = renderEquationToHtml(equationBlockTex(block));
  const align = block.align ?? "center";
  const label = block.id === undefined ? "" : ` data-equation-id="${block.id}"`;
  const number = block.number === true ? ' data-equation-number="true"' : "";
  return `<figure class="aze-equation" data-align="${align}"${label}${number}>${fragment}</figure>`;
}

export const equationHtmlBlockRenderer: EquationBlockRenderer = Object.freeze({
  descriptor: blockRendererDescriptor,
  render: renderEquationFragment,
});

export const htmlRendererDescriptor: RendererDescriptor = Object.freeze({
  id: HTML_RENDERER_ID,
  version: HTML_RENDERER_VERSION,
  formats: Object.freeze(["html"] as const),
  capabilities: Object.freeze([]),
});
export function katexDependencyClosure(): Record<string, JsonValue> {
  return {
    katex: KATEX_VERSION,
    language: EQUATION_LATEX_LANGUAGE_VERSION,
    options: { ...KATEX_RENDER_OPTIONS },
    css: sha256(getKatexCss()),
  };
}