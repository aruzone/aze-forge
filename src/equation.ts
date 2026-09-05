import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import katex from "katex";

import { createDiagnostic } from "./diagnostics.js";
import { sha256 } from "./hash.js";
import type {
  AzeBlockPlugin,
  Diagnostic,
  EquationBlock,
  EquationBlockRenderer,
  JsonValue,
  RendererDescriptor,
  SourceRange,
} from "./model.js";

export const EQUATION_PLUGIN_TYPE = "equation" as const;
export const EQUATION_PLUGIN_VERSION = "1.0.0" as const;
export const EQUATION_BODY_SYNTAX_ID = "azeforge.readable-equation/v1" as const;
export const EQUATION_BODY_SYNTAX_VERSION = "1.0.0" as const;
export const EQUATION_LATEX_LANGUAGE_VERSION = "katex-0.18.5" as const;
export const KATEX_VERSION = "0.18.5" as const;
export const EQUATION_HTML_BLOCK_RENDERER_ID =
  "azeforge.equation.html/v1" as const;
export const EQUATION_HTML_BLOCK_RENDERER_VERSION = "1.0.0" as const;
export const HTML_RENDERER_ID = "html" as const;
export const HTML_RENDERER_VERSION = "1.0.0" as const;
export const MAX_EQUATION_TEX_LENGTH = 4000;
export const MAX_EQUATION_SOURCE_LENGTH = 4000;

export const equationSourceSchema: JsonValue = Object.freeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "azeforge.equation/source/v1",
  type: "object",
  additionalProperties: false,
  properties: {
    id: {
      type: "string",
      pattern: "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$",
    },
    number: { type: "boolean" },
    align: { type: "string", enum: ["left", "center", "right"] },
    syntax: { type: "string", enum: ["readable", "latex"] },
  },
});

export const equationDataSchema: JsonValue = Object.freeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "azeforge.equation/data/v1",
  type: "object",
  additionalProperties: false,
  required: ["syntax", "source", "tex", "pluginVersion"],
  properties: {
    kind: { const: "equation" },
    syntax: { type: "string", enum: ["readable", "latex"] },
    source: { type: "string", minLength: 1, maxLength: 4000 },
    tex: { type: "string", minLength: 1, maxLength: 4000 },
    pluginVersion: { const: "1.0.0" },
    number: { type: "boolean" },
    align: { type: "string", enum: ["left", "center", "right"] },
  },
});

const GREEK_LOWER: Readonly<Record<string, string>> = Object.freeze({
  alpha: "\\alpha",
  beta: "\\beta",
  gamma: "\\gamma",
  delta: "\\delta",
  epsilon: "\\epsilon",
  zeta: "\\zeta",
  eta: "\\eta",
  theta: "\\theta",
  iota: "\\iota",
  kappa: "\\kappa",
  lambda: "\\lambda",
  mu: "\\mu",
  nu: "\\nu",
  xi: "\\xi",
  pi: "\\pi",
  rho: "\\rho",
  sigma: "\\sigma",
  tau: "\\tau",
  upsilon: "\\upsilon",
  phi: "\\phi",
  chi: "\\chi",
  psi: "\\psi",
  omega: "\\omega",
});

const GREEK_UPPER: Readonly<Record<string, string>> = Object.freeze({
  Alpha: "\\Alpha",
  Beta: "\\Beta",
  Gamma: "\\Gamma",
  Delta: "\\Delta",
  Epsilon: "\\Epsilon",
  Zeta: "\\Zeta",
  Eta: "\\Eta",
  Theta: "\\Theta",
  Iota: "\\Iota",
  Kappa: "\\Kappa",
  Lambda: "\\Lambda",
  Mu: "\\Mu",
  Nu: "\\Nu",
  Xi: "\\Xi",
  Pi: "\\Pi",
  Rho: "\\Rho",
  Sigma: "\\Sigma",
  Tau: "\\Tau",
  Upsilon: "\\Upsilon",
  Phi: "\\Phi",
  Chi: "\\Chi",
  Psi: "\\Psi",
  Omega: "\\Omega",
});

function replaceWord(
  input: string,
  word: string,
  replacement: string,
): string {
  return input.replace(
    new RegExp(`(?<![A-Za-z])${word}(?![A-Za-z])`, "g"),
    replacement,
  );
}

function splitTopLevel(value: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of value) {
    if (char === "(" || char === "[") depth += 1;
    if (char === ")" || char === "]") depth -= 1;
    if (char === separator && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts;
}

function translateMatrix(body: string): string {
  return body.replace(
    /matrix\s*\[((?:\[[^\]]*\],?)+)\]/g,
    (_match, rows: string) => {
      const rowMatches = [...rows.matchAll(/\[([^\]]*)\]/g)].map((m) => m[1] ?? "");
      const texRows = rowMatches.map((row) =>
        splitTopLevel(row, ",")
          .map((cell) => cell.trim())
          .join(" & "),
      );
      return `\\begin{bmatrix}${texRows.join(" \\\\ ")} \\end{bmatrix}`;
    },
  );
}

function translateCases(body: string): string {
  return body.replace(
    /cases\s*\(\s*([^)]*)\s*\)/g,
    (_match, inner: string) => {
      const rows = splitTopLevel(inner, ";").map((row) => row.trim());
      return `\\begin{cases}${rows.join(" \\\\ ")} \\end{cases}`;
    },
  );
}

/**
 * Translate readable §12 equation Source into pinned KaTeX TeX.
 * Every alias maps to a KaTeX-native target; translation is pure
 * string rewriting and KaTeX remains the final validator.
 */
export function translateReadableToTex(source: string): string {
  let tex = source;
  tex = translateMatrix(tex);
  tex = translateCases(tex);
  tex = tex.replace(
    /root\s*\(\s*([^,()]+?)\s*,\s*([^()]+?)\s*\)/g,
    (_, n: string, x: string) => `\\sqrt[${n.trim()}]{${x.trim()}}`,
  );
  tex = tex.replace(
    /frac\s*\(\s*([^,()]+?)\s*,\s*([^()]+?)\s*\)/g,
    (_, a: string, b: string) => `\\frac{${a.trim()}}{${b.trim()}}`,
  );
  tex = tex.replace(
    /sqrt\s*\(\s*([^()]+?)\s*\)/g,
    (_, x: string) => `\\sqrt{${x.trim()}}`,
  );
  for (const fn of ["sin", "cos", "tan", "exp", "log", "ln"]) {
    tex = tex.replace(
      new RegExp(`(?<![A-Za-z\\\\])${fn}\\s*\\(`, "g"),
      `\\${fn}(`,
    );
  }
  tex = tex.replace(
    /limit\s+([A-Za-z]+)\s*->\s*([^\s]+)\s+of\s+/g,
    (_, variable: string, target: string) =>
      `\\lim_{${variable} \\to ${target}} `,
  );
  tex = tex.replace(
    /\b(sum|product)\s+([A-Za-z]+)\s*=\s*([^\s]+)\.\.([^\s]+)\s+of\s+/g,
    (_, op: string, variable: string, from: string, to: string) =>
      `${op === "sum" ? "\\sum" : "\\prod"}_{${variable}=${from}}^{${to}} `,
  );
  tex = tex.replace(
    /integral\s+[A-Za-z]+\s*=\s*([^\s]+)\.\.([^\s]+)\s+of\s+/g,
    (_, from: string, to: string) => `\\int_{${from}}^{${to}} `,
  );
  tex = tex.replace(/integral\s+of\s+/g, "\\int ");
  tex = tex.replace(
    /partial\s+([A-Za-z0-9()]+)\s*\/\s*partial\s+([A-Za-z]+)/g,
    (_, numerator: string, variable: string) =>
      `\\frac{\\partial ${numerator}}{\\partial ${variable}}`,
  );
  tex = tex.replace(
    /\bd\s*\/\s*d([A-Za-z])\s+([A-Za-z0-9()^_]+)/g,
    (_, variable: string, fn: string) =>
      `\\frac{d ${fn}}{d ${variable}}`,
  );
  for (const [name, target] of Object.entries(GREEK_LOWER)) {
    tex = replaceWord(tex, name, ` ${target} `);
  }
  for (const [name, target] of Object.entries(GREEK_UPPER)) {
    tex = replaceWord(tex, name, ` ${target} `);
  }
  tex = replaceWord(tex, "infinity", " \\infty ");
  tex = replaceWord(tex, "partial", " \\partial ");
  tex = replaceWord(tex, "in", " \\in ");
  tex = replaceWord(tex, "notin", " \\notin ");
  tex = replaceWord(tex, "subset", " \\subset ");
  tex = replaceWord(tex, "union", " \\cup ");
  tex = replaceWord(tex, "intersect", " \\cap ");
  tex = replaceWord(tex, "forall", " \\forall ");
  tex = replaceWord(tex, "exists", " \\exists ");
  tex = tex.replace(/!=/g, " \\neq ");
  tex = tex.replace(/<=/g, " \\leq ");
  tex = tex.replace(/>=/g, " \\geq ");
  tex = tex.replace(/\s+/g, " ").trim();
  return tex;
}

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

function hasIntegrationVariable(body: string): boolean {
  const clauses = body.split(/\\\\|;/);
  return clauses.every((clause) => {
    if (!clause.includes("integral") && !clause.includes("\\int")) return true;
    return /\bd\s*[A-Za-z]\b/.test(clause);
  });
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

/**
 * Final sanitization for KaTeX Fragments. KaTeX with trust:false never
 * emits scripts or remote loads; this deny-list pass discards execution
 * vectors deterministically while preserving visual HTML and MathML.
 */
export function sanitizeKatexHtml(html: string): string {
  let clean = html
    .replace(/<\s*(script|iframe|object|embed|link|meta|base)\b[^>]*>.*?<\s*\/\s*\1\s*>/gis, "")
    .replace(/<\s*(script|iframe|object|embed|link|meta|base)\b[^>]*\/?>/gi, "");
  clean = clean.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  clean = clean.replace(
    /\s(href|src|xlink:href)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi,
    (match, _attr: string, quoted: string) => {
      const url = quoted.replace(/^["']|["']$/g, "").trim().toLowerCase();
      if (
        url.startsWith("javascript:") ||
        url.startsWith("data:text/html") ||
        url.startsWith("vbscript:")
      ) {
        return "";
      }
      return match;
    },
  );
  return clean;
}

export interface ValidatedEquation {
  readonly block?: EquationBlock;
  readonly diagnostics: readonly Diagnostic[];
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
  if (header.syntax === "readable" && trimmed.includes("\\")) {
    return {
      diagnostics: [
        createDiagnostic(
          "azeforge.equation#invalid-syntax",
          "error",
          "The readable equation contains raw TeX markup.",
          {
            location: location(bodyRanges[0] ?? blockRange),
            suggestion:
              "Use readable aliases, or set syntax: latex with --allow-raw-latex.",
          },
        ),
      ],
    };
  }
  if (header.syntax === "readable" && !hasIntegrationVariable(trimmed)) {
    const lineIndex = body
      .split("\n")
      .findIndex(
        (line) =>
          (line.includes("integral") || line.includes("\\int")) &&
          !/\bd\s*[A-Za-z]\b/.test(line),
      );
    const range = bodyRanges[lineIndex >= 0 ? lineIndex : 0] ?? blockRange;
    return {
      diagnostics: [
        createDiagnostic(
          "azeforge.equation#missing-integration-variable",
          "error",
          "The integral is missing an integration variable.",
          {
            location: location(range),
            suggestion: "Add an integration variable such as dx to the integral.",
            data: { construct: "integral" },
          },
        ),
      ],
    };
  }
  const tex =
    header.syntax === "latex" ? trimmed : translateReadableToTex(trimmed);
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
  try {
    katex.renderToString(tex, { ...KATEX_RENDER_OPTIONS });
  } catch {
    return {
      diagnostics: [
        createDiagnostic(
          header.syntax === "latex"
            ? "azeforge.equation#invalid-latex"
            : "azeforge.equation#invalid-syntax",
          "error",
          header.syntax === "latex"
            ? "The raw LaTeX equation could not be parsed."
            : "The equation could not be parsed.",
          {
            location: location(bodyRanges[0] ?? blockRange),
            suggestion:
              header.syntax === "latex"
                ? "Check KaTeX-supported syntax without custom macros."
                : "Check the readable equation syntax against supported aliases.",
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
    syntax: header.syntax,
    source: trimmed,
    tex,
    ...(header.number === undefined ? {} : { number: header.number }),
    ...(header.align === undefined ? {} : { align: header.align }),
  };
  return { block: Object.freeze(block), diagnostics: [] };
}

const pluginDescriptor = Object.freeze({
  type: EQUATION_PLUGIN_TYPE,
  version: EQUATION_PLUGIN_VERSION,
  title: "Equation",
  summary: "Readable equations rendered through pinned KaTeX.",
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
  pluginVersionRange: "1.0.0",
  rendererId: HTML_RENDERER_ID,
  rendererVersionRange: "1.0.0",
});

function renderEquationFragment(
  block: EquationBlock,
  _context: Readonly<{ sourceName?: string }>,
): string {
  const fragment = renderEquationToHtml(block.tex);
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
});
export function katexDependencyClosure(): Record<string, JsonValue> {
  return {
    katex: KATEX_VERSION,
    language: EQUATION_LATEX_LANGUAGE_VERSION,
    options: { ...KATEX_RENDER_OPTIONS },
    css: sha256(getKatexCss()),
  };
}
