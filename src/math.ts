/**
 * Native mathematics grammar (catalog Mathematics family, contract #57).
 *
 * A closed readable expression grammar parsed into a typed semantic
 * expression tree. The parser is the validator: every malformed or
 * unsupported spelling is refused with a stable-coded, sub-ranged
 * diagnostic; KaTeX-shaped and unregistered notation never passes
 * through. TeX is a renderer-derived spelling — a total deterministic
 * function of the tree — produced by the HTML block renderer.
 */

import type { JsonValue, SourceRange } from "./model.js";

/* ------------------------------------------------------------------ *
 * Ceilings (contract §8)
 * ------------------------------------------------------------------ */

export const MAX_MATH_NESTING_DEPTH = 32;
export const MAX_CASES_BRANCHES = 32;
export const MAX_MATRIX_DIMENSION = 32;

/* ------------------------------------------------------------------ *
 * Registered vocabulary (contract §5)
 * ------------------------------------------------------------------ */

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

const GREEK_VARIANTS: Readonly<Record<string, string>> = Object.freeze({
  varepsilon: "\\varepsilon",
  vartheta: "\\vartheta",
  varphi: "\\varphi",
  varrho: "\\varrho",
  varsigma: "\\varsigma",
});

const GREEK_UPPER: Readonly<Record<string, string>> = Object.freeze({
  Gamma: "\\Gamma",
  Delta: "\\Delta",
  Theta: "\\Theta",
  Lambda: "\\Lambda",
  Xi: "\\Xi",
  Pi: "\\Pi",
  Sigma: "\\Sigma",
  Upsilon: "\\Upsilon",
  Phi: "\\Phi",
  Psi: "\\Psi",
  Omega: "\\Omega",
});

const SYMBOLS: Readonly<Record<string, string>> = Object.freeze({
  infinity: "\\infty",
  partial: "\\partial",
  emptyset: "\\emptyset",
});

const FUNCTIONS: Readonly<Record<string, string>> = Object.freeze({
  sin: "\\sin",
  cos: "\\cos",
  tan: "\\tan",
  cot: "\\cot",
  sec: "\\sec",
  csc: "\\csc",
  arcsin: "\\arcsin",
  arccos: "\\arccos",
  arctan: "\\arctan",
  sinh: "\\sinh",
  cosh: "\\cosh",
  tanh: "\\tanh",
  exp: "\\exp",
  ln: "\\ln",
  log: "\\log",
  max: "\\max",
  min: "\\min",
  gcd: "\\gcd",
  det: "\\det",
});

const RELATION_TEX: Readonly<Record<string, string>> = Object.freeze({
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

const RELATION_SPELLING: Readonly<Record<string, string>> = Object.freeze({
  "=": "=",
  "!=": "!=",
  "<": "<",
  ">": ">",
  "<=": "<=",
  ">=": ">=",
  "->": "->",
  approx: "approx",
  equiv: "equiv",
  "+-": "+-",
  in: "in",
  notin: "notin",
  subset: "subset",
  subseteq: "subseteq",
  supset: "supset",
});

const SET_OP_TEX: Readonly<Record<string, string>> = Object.freeze({
  union: "\\cup",
  intersect: "\\cap",
});

const BINDER_OPS = Object.freeze([
  "sum",
  "product",
  "integral",
  "limit",
  "forall",
  "exists",
] as const);
type BinderOp = (typeof BINDER_OPS)[number];

const MATRIX_NAMES = Object.freeze(["matrix", "pmatrix", "vmatrix"] as const);
type MatrixName = (typeof MATRIX_NAMES)[number];

const MATRIX_TEX: Readonly<Record<MatrixName, string>> = Object.freeze({
  matrix: "bmatrix",
  pmatrix: "pmatrix",
  vmatrix: "vmatrix",
});

const MATRIX_DELIMITER: Readonly<Record<MatrixName, string>> = Object.freeze({
  matrix: "bracket",
  pmatrix: "paren",
  vmatrix: "bar",
});

const CLAUSE_WORDS = Object.freeze(["when", "otherwise", "of"] as const);

function vocabulary(): Readonly<Record<string, string>> {
  const words: Record<string, string> = {
    ...GREEK_LOWER,
    ...GREEK_VARIANTS,
    ...GREEK_UPPER,
    ...SYMBOLS,
    ...FUNCTIONS,
  };
  for (const op of Object.keys(RELATION_TEX)) words[op] = op;
  for (const op of Object.keys(SET_OP_TEX)) words[op] = op;
  for (const op of BINDER_OPS) words[op] = op;
  for (const name of MATRIX_NAMES) words[name] = name;
  for (const word of [...CLAUSE_WORDS, "in", "sqrt", "root", "frac", "abs", "vector", "cases"]) {
    words[word] = word;
  }
  return Object.freeze(words);
}

const VOCABULARY = vocabulary();

/** Words that may begin an atom (symbols, functions, constructs, binders). */
const ATOM_WORDS: Readonly<Set<string>> = new Set([
  ...Object.keys(GREEK_LOWER),
  ...Object.keys(GREEK_VARIANTS),
  ...Object.keys(GREEK_UPPER),
  ...Object.keys(SYMBOLS),
  ...Object.keys(FUNCTIONS),
  "sqrt",
  "root",
  "frac",
  "abs",
  "vector",
  "cases",
  ...MATRIX_NAMES,
  ...BINDER_OPS,
]);

/** Accepted Unicode spellings, canonicalized to word aliases. */
const UNICODE: Readonly<Record<string, string>> = Object.freeze({
  "\u03B1": "alpha",
  "\u03B2": "beta",
  "\u03B3": "gamma",
  "\u03B4": "delta",
  "\u03B5": "epsilon",
  "\u03B6": "zeta",
  "\u03B7": "eta",
  "\u03B8": "theta",
  "\u03B9": "iota",
  "\u03BA": "kappa",
  "\u03BB": "lambda",
  "\u03BC": "mu",
  "\u03BD": "nu",
  "\u03BE": "xi",
  "\u03BF": "omicron",
  "\u03C0": "pi",
  "\u03C1": "rho",
  "\u03C3": "sigma",
  "\u03C4": "tau",
  "\u03C5": "upsilon",
  "\u03C6": "phi",
  "\u03C7": "chi",
  "\u03C8": "psi",
  "\u03C9": "omega",
  "\u03D1": "vartheta",
  "\u03D5": "varphi",
  "\u03F1": "varrho",
  "\u03C2": "varsigma",
  "\u0393": "Gamma",
  "\u0394": "Delta",
  "\u0398": "Theta",
  "\u039B": "Lambda",
  "\u039E": "Xi",
  "\u03A0": "Pi",
  "\u03A3": "Sigma",
  "\u03A5": "Upsilon",
  "\u03A6": "Phi",
  "\u03A8": "Psi",
  "\u03A9": "Omega",
  "\u221E": "infinity",
  "\u2202": "partial",
  "\u2205": "emptyset",
  "\u2260": "!=",
  "\u2264": "<=",
  "\u2265": ">=",
  "\u2192": "->",
  "\u2248": "approx",
  "\u2261": "equiv",
  "\u00B1": "+-",
  "\u2208": "in",
  "\u2209": "notin",
  "\u2282": "subset",
  "\u2286": "subseteq",
  "\u2283": "supset",
  "\u222A": "union",
  "\u2229": "intersect",
  "\u2200": "forall",
  "\u2203": "exists",
  "\u221A": "sqrt",
});

const SYMBOL_NAMES: Readonly<Set<string>> = new Set([
  ...Object.keys(GREEK_LOWER),
  ...Object.keys(GREEK_VARIANTS),
  ...Object.keys(GREEK_UPPER),
  ...Object.keys(SYMBOLS),
]);

export type RelationOp = keyof typeof RELATION_TEX;
export type SetOp = keyof typeof SET_OP_TEX;

/* ------------------------------------------------------------------ *
 * Semantic expression tree
 * ------------------------------------------------------------------ */

export interface IdentNode {
  readonly kind: "ident";
  /** Single ASCII letter. */
  readonly name: string;
  /** Inline digit suffix, e.g. "0" in `v0`. */
  readonly digitSuffix?: string;
  /** Subscript rendering of digits or a lowercase word, e.g. "n" in `S_n`. */
  readonly subscript?: string;
  /** Authored primes, 1 or 2. */
  readonly primes?: 1 | 2;
}

export interface NumberNode {
  readonly kind: "number";
  /** Authored digits exactly. */
  readonly spelling: string;
}

export interface SymbolNode {
  readonly kind: "symbol";
  /** Canonical word alias, e.g. "alpha" for both `alpha` and `α`. */
  readonly name: string;
}

export interface UnaryNode {
  readonly kind: "unary";
  readonly op: "-";
  readonly node: MathNode;
}

export interface AddNode {
  readonly kind: "add";
  readonly left: MathNode;
  readonly right: MathNode;
}
export interface SubNode {
  readonly kind: "sub";
  readonly left: MathNode;
  readonly right: MathNode;
}
export interface MulNode {
  readonly kind: "mul";
  readonly left: MathNode;
  readonly right: MathNode;
}
export interface DivNode {
  readonly kind: "div";
  readonly left: MathNode;
  readonly right: MathNode;
}
export interface JuxtNode {
  readonly kind: "juxt";
  /** Authored juxtaposition order; two or more factors. */
  readonly factors: readonly MathNode[];
}

export interface ScriptNode {
  readonly kind: "script";
  readonly base: MathNode;
  readonly sub?: string;
  readonly sup?: MathNode;
  /** Authored primes, 1 or 2. */
  readonly primes?: 1 | 2;
}

export interface ChainNode {
  readonly kind: "chain";
  readonly head: MathNode;
  /** Ordered relational links; never evaluated. */
  readonly links: readonly { readonly op: RelationOp; readonly node: MathNode }[];
}

export interface SetOpNode {
  readonly kind: "setop";
  readonly op: SetOp;
  readonly left: MathNode;
  readonly right: MathNode;
}

export interface FuncNode {
  readonly kind: "func";
  readonly name: string;
  readonly subscript?: string;
  readonly arg: MathNode;
}

export interface SqrtNode {
  readonly kind: "sqrt";
  readonly arg: MathNode;
}
export interface RootNode {
  readonly kind: "root";
  readonly index: MathNode;
  readonly arg: MathNode;
}
export interface FracNode {
  readonly kind: "frac";
  readonly num: MathNode;
  readonly den: MathNode;
}
export interface AbsNode {
  readonly kind: "abs";
  readonly arg: MathNode;
}

export interface VectorNode {
  readonly kind: "vector";
  readonly items: readonly MathNode[];
}

export interface MatrixNode {
  readonly kind: "matrix";
  readonly delimiter: "bracket" | "paren" | "bar";
  readonly rows: readonly (readonly MathNode[])[];
}

export interface CasesBranch {
  readonly expr: MathNode;
  readonly cond: MathNode | { readonly kind: "otherwise" };
}

export interface CasesNode {
  readonly kind: "cases";
  readonly branches: readonly CasesBranch[];
}

export interface GroupNode {
  readonly kind: "group";
  readonly node: MathNode;
}

export interface BinderNode {
  readonly kind: "binder";
  readonly op: BinderOp;
  /** Bound name; undefined only for an indefinite integral (`integral of ... dx`). */
  readonly name?: IdentNode;
  readonly from?: MathNode;
  readonly to?: MathNode;
  /** limit target. */
  readonly target?: MathNode;
  /** forall/exists set operand. */
  readonly set?: MathNode;
  /** integral differential variable (the letter of the terminal `dx`). */
  readonly differential?: string;
  readonly body: MathNode;
}

export type MathNode =
  | IdentNode
  | NumberNode
  | SymbolNode
  | UnaryNode
  | AddNode
  | SubNode
  | MulNode
  | DivNode
  | JuxtNode
  | ScriptNode
  | ChainNode
  | SetOpNode
  | FuncNode
  | SqrtNode
  | RootNode
  | FracNode
  | AbsNode
  | VectorNode
  | MatrixNode
  | CasesNode
  | GroupNode
  | BinderNode;

/* ------------------------------------------------------------------ *
 * Problems
 * ------------------------------------------------------------------ */

export interface MathProblem {
  /** Stable code suffix under the enclosing Block's namespace. */
  readonly code: string;
  readonly severity: "error" | "warning";
  readonly message: string;
  /** Offset within the parsed source. */
  readonly offset: number;
  readonly length: number;
  readonly suggestion?: string;
  readonly data?: Readonly<Record<string, JsonValue>>;
}

export type MathParseResult =
  | { readonly tree: MathNode; readonly warnings: readonly MathProblem[] }
  | { readonly problems: readonly MathProblem[] };

function problem(
  code: string,
  message: string,
  offset: number,
  length: number,
  extra: {
    readonly severity?: "error" | "warning";
    readonly suggestion?: string;
    readonly data?: Readonly<Record<string, JsonValue>>;
  } = {},
): MathProblem {
  return {
    code,
    severity: extra.severity ?? "error",
    message,
    offset,
    length,
    ...(extra.suggestion === undefined ? {} : { suggestion: extra.suggestion }),
    ...(extra.data === undefined ? {} : { data: extra.data }),
  };
}

/* ------------------------------------------------------------------ *
 * Lexer
 * ------------------------------------------------------------------ */

type TokenKind =
  | "word"
  | "number"
  | "punct"
  | "unicode"
  | "eof";

interface Token {
  readonly kind: TokenKind;
  /** Canonical spelling: word token text or punctuation operator key. */
  readonly text: string;
  readonly offset: number;
  readonly length: number;
}

const WORD_RE = /^[A-Za-z]+$/;

const PUNCT_TOKENS: Readonly<Record<string, string>> = Object.freeze({
  "+": "+",
  "-": "-",
  "*": "*",
  "/": "/",
  "=": "=",
  "!=": "!=",
  "<": "<",
  ">": ">",
  "<=": "<=",
  ">=": ">=",
  "->": "->",
  "+-": "+-",
  "(": "(",
  ")": ")",
  "[": "[",
  "]": "]",
  ",": ",",
  ";": ";",
  "..": "..",
  "^": "^",
  _: "_",
  "'": "'",
});

function lex(source: string): { tokens: readonly Token[]; problems: readonly MathProblem[] } {
  const tokens: Token[] = [];
  const problems: MathProblem[] = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index] ?? "";
    if (char === " " || char === "\t" || char === "\n" || char === "\r") {
      index += 1;
      continue;
    }
    if (WORD_RE.test(char)) {
      let end = index + 1;
      while (end < source.length && WORD_RE.test(source[end] ?? "")) end += 1;
      tokens.push({ kind: "word", text: source.slice(index, end), offset: index, length: end - index });
      index = end;
      continue;
    }
    if (char >= "0" && char <= "9") {
      let end = index + 1;
      while (end < source.length && /^[0-9]$/.test(source[end] ?? "")) end += 1;
      if (source[end] === "." && /^[0-9]$/.test(source[end + 1] ?? "")) {
        end += 1;
        while (end < source.length && /^[0-9]$/.test(source[end] ?? "")) end += 1;
      }
      tokens.push({ kind: "number", text: source.slice(index, end), offset: index, length: end - index });
      index = end;
      continue;
    }
    const two = source.slice(index, index + 2);
    if (PUNCT_TOKENS[two] !== undefined) {
      tokens.push({ kind: "punct", text: two, offset: index, length: 2 });
      index += 2;
      continue;
    }
    if (PUNCT_TOKENS[char] !== undefined) {
      tokens.push({ kind: "punct", text: char, offset: index, length: 1 });
      index += 1;
      continue;
    }
    if (UNICODE[char] !== undefined) {
      tokens.push({ kind: "unicode", text: UNICODE[char] ?? "", offset: index, length: 1 });
      index += 1;
      continue;
    }
    if (char === "{" || char === "\\") {
      problems.push(
        problem(
          "unsupported-notation",
          `"${char}" is TeX spelling; native notation is a closed vocabulary.`,
          index,
          1,
          {
            suggestion:
              char === "{"
                ? "Write x^(2) — braces are TeX spelling."
                : "Use registered native notation.",
          },
        ),
      );
      if (char === "\\") {
        index += 1;
        while (index < source.length && WORD_RE.test(source[index] ?? "")) index += 1;
      } else {
        const close = source.indexOf("}", index + 1);
        index = close < 0 ? index + 1 : close + 1;
      }
      continue;
    }
    problems.push(
      problem(
        "unsupported-notation",
        `"${char}" has no native alpha form; use registered constructs.`,
        index,
        1,
        {
          suggestion: "Use registered native notation.",
        },
      ),
    );
    index += 1;
  }
  tokens.push({ kind: "eof", text: "", offset: source.length, length: 0 });
  return { tokens, problems };
}

/* ------------------------------------------------------------------ *
 * Parser
 * ------------------------------------------------------------------ */

class Parser {
  private readonly source: string;
  private readonly tokens: readonly Token[];
  private position = 0;
  private warnings: MathProblem[] = [];
  private depth = 0;
  private readonly boundNames: { name: string }[] = [];

  constructor(source: string, tokens: readonly Token[]) {
    this.source = source;
    this.tokens = tokens;
  }

  /** Public entry: parse at the relation level. */
  parseFully(): MathNode {
    return this.parseRelation();
  }

  /** Public entry: the token after the parsed root. */
  following(): Token {
    return this.peek();
  }

  /** Public entry: accumulated warnings. */
  getWarnings(): readonly MathProblem[] {
    return this.warnings;
  }

  private peek(offset = 0): Token {
    return this.tokens[this.position + offset] ?? this.tokens[this.tokens.length - 1]!;
  }

  private advance(): Token {
    const token = this.peek();
    if (token.kind !== "eof") this.position += 1;
    return token;
  }

  private error(
    code: string,
    message: string,
    token: Token,
    extra: {
      readonly suggestion?: string;
      readonly data?: Readonly<Record<string, JsonValue>>;
    } = {},
  ): never {
    throw new MathSyntaxError(
      problem(code, message, token.offset, token.length, extra),
    );
  }

  private errorAtEnd(code: string, message: string, extra: { readonly suggestion?: string } = {}): never {
    const token = this.peek();
    throw new MathSyntaxError(
      problem(code, message, token.offset, 0, extra),
    );
  }

  private withDepth<T>(token: Token, fn: () => T): T {
    this.depth += 1;
    if (this.depth > MAX_MATH_NESTING_DEPTH) {
      this.depth -= 1;
      this.error(
        "limit-exceeded",
        `Nesting exceeds the maximum supported depth of ${MAX_MATH_NESTING_DEPTH}.`,
        token,
        { data: { limit: MAX_MATH_NESTING_DEPTH } },
      );
    }
    try {
      return fn();
    } finally {
      this.depth -= 1;
    }
  }

  private isAtomStart(token: Token): boolean {
    if (token.kind === "number") return true;
    if (token.kind === "unicode") {
      return (
        SYMBOL_NAMES.has(token.text) ||
        token.text === "sqrt" ||
        (BINDER_OPS as readonly string[]).includes(token.text as BinderOp)
      );
    }
    if (token.kind === "punct") return token.text === "(";
    if (token.kind !== "word") return false;
    if (token.text.length === 1) return true;
    if (token.text.length === 2 && VOCABULARY[token.text] === undefined) return true;
    return ATOM_WORDS.has(token.text);
  }

  /** Level 1 — relations: n-ary chain, order preserved. */
  private parseRelation(): MathNode {
    const head = this.parseSet();
    const links: { op: RelationOp; node: MathNode }[] = [];
    for (;;) {
      const token = this.peek();
      if (token.kind !== "word" && token.kind !== "punct" && token.kind !== "unicode") break;
      const op = RELATION_TEX[token.text];
      if (op === undefined) break;
      this.advance();
      const node = this.parseSet();
      links.push({ op: token.text as RelationOp, node });
    }
    if (links.length === 0) return head;
    return { kind: "chain", head, links };
  }

  /** Level 2 — set operations, left-associative. */
  private parseSet(): MathNode {
    let left = this.parseAdditive();
    for (;;) {
      const token = this.peek();
      if (token.kind !== "word" && token.kind !== "unicode") break;
      const op = SET_OP_TEX[token.text];
      if (op === undefined) break;
      this.advance();
      const right = this.parseAdditive();
      left = { kind: "setop", op: token.text as SetOp, left, right };
    }
    return left;
  }

  /** Level 3 — additive. */
  private parseAdditive(): MathNode {
    let left = this.parseMultiplicative();
    for (;;) {
      const token = this.peek();
      if (token.kind !== "punct") break;
      if (token.text === "+") {
        this.advance();
        left = { kind: "add", left, right: this.parseMultiplicative() };
        continue;
      }
      if (token.text === "-") {
        this.advance();
        left = { kind: "sub", left, right: this.parseMultiplicative() };
        continue;
      }
      break;
    }
    return left;
  }

  /** Level 4 — multiplicative: `*`, `/`, and juxtaposition. */
  private parseMultiplicative(): MathNode {
    let left = this.parseUnary();
    for (;;) {
      const token = this.peek();
      if (token.kind === "punct") {
        if (token.text === "*") {
          this.advance();
          left = { kind: "mul", left, right: this.parseUnary() };
          continue;
        }
        if (token.text === "/") {
          this.advance();
          left = { kind: "div", left, right: this.parseUnary() };
          continue;
        }
        if (token.text !== "(") break;
      }
      if (this.isAtomStart(token)) {
        const factors: MathNode[] = left.kind === "juxt" ? [...left.factors] : [left];
        factors.push(this.parseUnary());
        left = { kind: "juxt", factors };
        continue;
      }
      break;
    }
    return left;
  }

  /** Level 5/6 — unary minus and power/subscript/primes. */
  private parseUnary(): MathNode {
    const token = this.peek();
    if (token.kind === "punct" && token.text === "-") {
      this.advance();
      return { kind: "unary", op: "-", node: this.parseUnary() };
    }
    return this.parsePower();
  }

  /**
   * Exponent or script operand: a single atom (or unary minus over one),
   * never another script — `x^2^3` must error, not nest.
   */
  private parseExponentOperand(): MathNode {
    const token = this.peek();
    if (token.kind === "punct" && token.text === "-") {
      this.advance();
      return { kind: "unary", op: "-", node: this.parseExponentOperand() };
    }
    return this.parseAtom();
  }

  private parsePower(): MathNode {
    const base = this.parseAtom();
    let sub: string | undefined;
    let sup: MathNode | undefined;
    let primes: 1 | 2 | undefined;
    for (;;) {
      const token = this.peek();
      if (token.kind !== "punct") break;
      if (token.text === "^") {
        if (sup !== undefined || primes !== undefined) {
          this.error(
            "chained-power",
            "Chained powers are ambiguous; parenthesize the exponent.",
            token,
            { suggestion: "Parenthesize, for example x^(2^3)." },
          );
        }
        this.advance();
        sup = this.parseExponentOperand();
        continue;
      }
      if (token.text === "_") {
        if (sub !== undefined) {
          this.error(
            "chained-power",
            "Only one subscript per base is allowed; parenthesize nested subscripts.",
            token,
            { suggestion: "Parenthesize the subscript, for example x_(y)." },
          );
        }
        this.advance();
        sub = this.parseSubscript();
        continue;
      }
      if (token.text === "'") {
        if (sub !== undefined || sup !== undefined || primes !== undefined) {
          this.error(
            "chained-power",
            "Primes cannot combine with powers or subscripts on one base.",
            token,
          );
        }
        let count = 0;
        const first = token;
        while (this.peek().kind === "punct" && this.peek().text === "'") {
          this.advance();
          count += 1;
        }
        if (count > 2) {
          this.error(
            "chained-power",
            "At most two primes are supported per identifier.",
            first,
          );
        }
        primes = count as 1 | 2;
        continue;
      }
      break;
    }
    if (sub === undefined && sup === undefined && primes === undefined) return base;
    return {
      kind: "script",
      base,
      ...(sub === undefined ? {} : { sub }),
      ...(sup === undefined ? {} : { sup }),
      ...(primes === undefined ? {} : { primes }),
    };
  }

  private parseSubscript(): string {
    const token = this.peek();
    if (token.kind === "number") {
      this.advance();
      return token.text;
    }
    if (token.kind === "word" && /^[a-z]+$/.test(token.text)) {
      this.advance();
      return token.text;
    }
    this.error(
      "missing-operand",
      "A subscript must be digits or a lowercase word.",
      token,
    );
  }

  private parseIdentifier(): IdentNode {
    const token = this.peek();
    if (token.kind !== "word" || token.text.length !== 1) {
      this.error(
        "unexpected-token",
        "An identifier (one ASCII letter) is expected here.",
        token,
      );
    }
    this.advance();
    let digitSuffix: string | undefined;
    const next = this.peek();
    if (next.kind === "number") {
      this.advance();
      digitSuffix = next.text;
    }
    // Subscripts are consumed by parsePower so chained subscripts (`x_2_3`)
    // can be refused; identifiers never carry them directly.
    return {
      kind: "ident",
      name: token.text,
      ...(digitSuffix === undefined ? {} : { digitSuffix }),
    };
  }

  private parseBoundName(): IdentNode {
    const token = this.peek();
    if (token.kind !== "word" || token.text.length !== 1) {
      if (token.kind === "word" && VOCABULARY[token.text] !== undefined) {
        this.error(
          "reserved-identifier",
          `"${token.text}" is a reserved Greek or keyword alias; choose another bound name.`,
          token,
          { suggestion: "Registered aliases can never be identifiers." },
        );
      }
      this.error(
        "unexpected-token",
        "A bound name (one ASCII letter) is expected here.",
        token,
      );
    }
    return this.parseIdentifier();
  }

  /** Level 8 — atoms. */
  private parseAtom(): MathNode {
    const token = this.peek();
    if (token.kind === "number") {
      this.advance();
      return { kind: "number", spelling: token.text };
    }
    if (token.kind === "unicode") {
      return this.parseUnicodeToken(token);
    }
    if (token.kind === "punct") {
      if (token.text === "(") {
        return this.parseGroup();
      }
      this.error(
        "unexpected-token",
        `Unexpected token "${token.text}".`,
        token,
      );
    }
    if (token.kind === "word") {
      return this.parseWordToken(token);
    }
    this.error(
      "missing-operand",
      "An operand is expected here.",
      token,
    );
  }

  private parseUnicodeToken(token: Token): MathNode {
    this.advance();
    const key = token.text;
    if (key === "sqrt") return this.parseSqrt();
    if (SYMBOL_NAMES.has(key)) return { kind: "symbol", name: key };
    if (RELATION_TEX[key] !== undefined || SET_OP_TEX[key] !== undefined) {
      this.error(
        "unexpected-token",
        `"${token.text}" needs an operand before it.`,
        this.peek(),
      );
    }
    if ((BINDER_OPS as readonly string[]).includes(key as BinderOp)) {
      return this.parseBinder(key as BinderOp);
    }
    this.error(
      "unexpected-token",
      `Unexpected token "${token.text}".`,
      token,
    );
  }

  private parseWordToken(token: Token): MathNode {
    const text = token.text;
    if (text.length === 1) {
      return this.parseIdentifier();
    }
    if (text.length === 2 && VOCABULARY[text] === undefined) {
      // Two unknown letters read as identifier juxtaposition (`dx` = d·x).
      this.advance();
      return {
        kind: "juxt",
        factors: [
          { kind: "ident", name: text[0] ?? "" },
          { kind: "ident", name: text[1] ?? "" },
        ],
      };
    }
    const known = VOCABULARY[text] !== undefined;
    if (!known) {
      const nearest = nearestVocabulary(text);
      this.error(
        "unknown-word",
        `"${text}" is not in the native mathematics vocabulary.`,
        token,
        {
          suggestion:
            nearest.length === 0
              ? "Identifiers are single letters with optional digits, subscripts, and primes."
              : `Did you mean ${nearest.join(", ")}? Identifiers are single letters with optional digits, subscripts, and primes.`,
          data: { word: text },
        },
      );
    }
    this.advance();
    if (SYMBOL_NAMES.has(text)) {
      return { kind: "symbol", name: text };
    }
    if (FUNCTIONS[text] !== undefined) {
      return this.parseFunction(text);
    }
    if (text === "sqrt") return this.parseSqrt();
    if (text === "root") return this.parseRoot();
    if (text === "frac") return this.parseFrac();
    if (text === "abs") return this.parseAbs();
    if (text === "vector") return this.parseVector();
    if ((MATRIX_NAMES as readonly string[]).includes(text)) {
      return this.parseMatrix(text as MatrixName);
    }
    if (text === "cases") return this.parseCases();
    if ((BINDER_OPS as readonly string[]).includes(text)) {
      return this.parseBinder(text as BinderOp);
    }
    if (text === "in" || text === "when" || text === "otherwise" || text === "of") {
      this.error(
        "unexpected-token",
        `"${text}" cannot begin an expression.`,
        token,
      );
    }
    this.error(
      "unexpected-token",
      `Unexpected token "${text}".`,
      token,
    );
  }

  private expectPunct(text: string, message: string): Token {
    const token = this.peek();
    if (token.kind !== "punct" || token.text !== text) {
      this.error("unexpected-token", message, token);
    }
    return this.advance();
  }

  private expectClose(text: ")" | "]", message: string): Token {
    const token = this.peek();
    if (token.kind === "punct" && token.text === text) return this.advance();
    if (token.kind === "eof") {
      this.errorAtEnd("unbalanced-grouping", message);
    }
    this.error("unexpected-token", message, token);
  }

  private parseGroup(): MathNode {
    const open = this.advance();
    return this.withDepth(open, () => {
      if (this.peek().kind === "punct" && this.peek().text === ")") {
        this.error("missing-operand", "A group cannot be empty.", this.peek());
      }
      const node = this.parseRelation();
      const close = this.peek();
      if (close.kind !== "punct" || close.text !== ")") {
        this.errorAtEnd(
          "unbalanced-grouping",
          "Unbalanced grouping: missing a closing `)`.",
        );
      }
      this.advance();
      return { kind: "group", node };
    });
  }

  private parseSqrt(): MathNode {
    const open = this.peek();
    return this.withDepth(open, () => {
      if (this.peek().kind === "punct" && this.peek().text === "(") {
        this.advance();
        if (this.peek().kind === "punct" && this.peek().text === ")") {
          this.error("missing-operand", "`sqrt` needs an argument inside the parentheses.", this.peek());
        }
        const arg = this.parseRelation();
        this.expectClose(")", "Unbalanced grouping: missing a closing `)`.");
        return { kind: "sqrt", arg };
      }
      // Bare form (unicode √): `√x` reads sqrt(x).
      const arg = this.parsePower();
      return { kind: "sqrt", arg };
    });
  }

  private parseRoot(): MathNode {
    const open = this.peek();
    return this.withDepth(open, () => {
      this.expectPunct("(", "`root` requires root(n, x).");
      if (this.peek().kind === "punct" && this.peek().text === ")") {
        this.error("missing-operand", "`root` needs an index and an argument.", this.peek());
      }
      const index = this.parseRelation();
      this.expectPunct(",", "`root` requires root(n, x) with a comma between arguments.");
      if (this.peek().kind === "punct" && this.peek().text === ")") {
        this.error("missing-operand", "`root` needs an argument after the comma.", this.peek());
      }
      const arg = this.parseRelation();
      this.expectClose(")", "Unbalanced grouping: missing a closing `)`.");
      return { kind: "root", index, arg };
    });
  }

  private parseFrac(): MathNode {
    const open = this.peek();
    return this.withDepth(open, () => {
      this.expectPunct("(", "`frac` requires frac(a, b).");
      if (this.peek().kind === "punct" && this.peek().text === ")") {
        this.error("missing-operand", "`frac` needs a numerator and a denominator.", this.peek());
      }
      const num = this.parseRelation();
      this.expectPunct(",", "`frac` requires frac(a, b) with a comma between arguments.");
      if (this.peek().kind === "punct" && this.peek().text === ")") {
        this.error("missing-operand", "`frac` needs a denominator after the comma.", this.peek());
      }
      const den = this.parseRelation();
      this.expectClose(")", "Unbalanced grouping: missing a closing `)`.");
      return { kind: "frac", num, den };
    });
  }

  private parseAbs(): MathNode {
    const open = this.peek();
    return this.withDepth(open, () => {
      this.expectPunct("(", "`abs` requires a parenthesized argument: abs(x).");
      if (this.peek().kind === "punct" && this.peek().text === ")") {
        this.error("missing-operand", "`abs` needs an argument inside the parentheses.", this.peek());
      }
      const arg = this.parseRelation();
      this.expectClose(")", "Unbalanced grouping: missing a closing `)`.");
      return { kind: "abs", arg };
    });
  }

  private parseVector(): MathNode {
    const open = this.peek();
    return this.withDepth(open, () => {
      this.expectPunct("[", "`vector` requires vector [items]: vector [a, b, c].");
      const items: MathNode[] = [];
      for (;;) {
        const token = this.peek();
        if (token.kind === "punct" && token.text === "]") {
          this.advance();
          break;
        }
        if (items.length >= 16) {
          this.error(
            "limit-exceeded",
            "A vector may hold at most 16 items.",
            token,
            { data: { limit: 16 } },
          );
        }
        if (items.length > 0) {
          this.expectPunct(",", "A comma separates vector items.");
        }
        if (this.peek().kind === "punct" && this.peek().text === "]") {
          this.error(
            "missing-operand",
            "A vector item is expected here.",
            this.peek(),
          );
        }
        items.push(this.parseRelation());
      }
      if (items.length === 0) {
        this.error("missing-operand", "A vector needs at least one item.", open);
      }
      return { kind: "vector", items };
    });
  }

  private parseMatrix(name: MatrixName): MathNode {
    const open = this.peek();
    return this.withDepth(open, () => {
      this.expectPunct("[", `\`${name}\` requires ${name} [[row cells], [row cells]].`);
      const rows: MathNode[][] = [];
      let cellCount: number | undefined;
      while (this.peek().kind === "punct" && this.peek().text === "[") {
        if (rows.length >= MAX_MATRIX_DIMENSION) {
          this.error(
            "limit-exceeded",
            `A matrix may have at most ${MAX_MATRIX_DIMENSION} rows.`,
            this.peek(),
            { data: { limit: MAX_MATRIX_DIMENSION } },
          );
        }
        const rowStart = this.advance();
        const cells: MathNode[] = [];
        let firstCell = this.peek();
        for (;;) {
          const token = this.peek();
          if (token.kind === "punct" && token.text === "]") {
            this.advance();
            break;
          }
          if (cells.length >= MAX_MATRIX_DIMENSION) {
            this.error(
              "limit-exceeded",
              `A matrix may have at most ${MAX_MATRIX_DIMENSION} cells per row.`,
              token,
              { data: { limit: MAX_MATRIX_DIMENSION } },
            );
          }
          if (cells.length > 0) {
            this.expectPunct(",", "A comma separates matrix cells.");
          }
          if (this.peek().kind === "punct" && this.peek().text === "]") {
            this.error("empty-cell", "Matrix cells cannot be empty.", this.peek());
          }
          cells.push(this.parseRelation());
        }
        if (cells.length === 0) {
          this.error("empty-cell", "Matrix rows cannot be empty.", rowStart);
        }
        if (cellCount === undefined) {
          cellCount = cells.length;
        } else if (cells.length !== cellCount) {
          const at = firstCell.kind === "eof" ? rowStart : firstCell;
          this.error(
            "ragged-matrix",
            `Every row needs ${cellCount} cells; this row has ${cells.length}.`,
            at,
            { data: { row: rows.length + 1, expected: cellCount, found: cells.length } },
          );
        }
        rows.push(cells);
        if (this.peek().kind === "punct" && this.peek().text === ",") {
          this.advance();
          if (!(this.peek().kind === "punct" && this.peek().text === "[")) {
            this.error(
              "unexpected-token",
              "A matrix row must open with `[`.",
              this.peek(),
            );
          }
        }
      }
      this.expectClose("]", "Unbalanced grouping: missing a closing `]` after the matrix rows.");
      if (rows.length === 0) {
        this.error("missing-operand", "A matrix needs at least one row.", open);
      }
      return { kind: "matrix", delimiter: MATRIX_DELIMITER[name] as "bracket" | "paren" | "bar", rows };
    });
  }

  private parseCases(): MathNode {
    const open = this.peek();
    return this.withDepth(open, () => {
      this.expectPunct("(", "`cases` requires cases(expr when cond; expr otherwise).");
      const branches: CasesBranch[] = [];
      for (;;) {
        const token = this.peek();
        if (token.kind === "punct" && token.text === ")") {
          this.advance();
          break;
        }
        if (branches.length >= MAX_CASES_BRANCHES) {
          this.error(
            "limit-exceeded",
            `cases may have at most ${MAX_CASES_BRANCHES} branches.`,
            token,
            { data: { limit: MAX_CASES_BRANCHES } },
          );
        }
        if (branches.length > 0) {
          this.expectPunct(";", "A semicolon separates case branches.");
        }
        if (this.peek().kind === "punct" && (this.peek().text === ";" || this.peek().text === ")")) {
          this.error("empty-branch", "Case branches cannot be empty.", this.peek());
        }
        const expr = this.parseRelation();
        const next = this.peek();
        if (next.kind === "word" && next.text === "when") {
          this.advance();
          const cond = this.parseRelation();
          branches.push({ expr, cond });
          continue;
        }
        if (next.kind === "word" && next.text === "otherwise") {
          this.advance();
          branches.push({ expr, cond: { kind: "otherwise" } });
          continue;
        }
        this.error(
          "unexpected-token",
          "A case branch needs `when <condition>` or `otherwise`.",
          next,
        );
      }
      if (branches.length === 0) {
        this.error("missing-operand", "cases needs at least one branch.", open);
      }
      return { kind: "cases", branches };
    });
  }

  private parseFunction(name: string): MathNode {
    let subscript: string | undefined;
    if (this.peek().kind === "punct" && this.peek().text === "_") {
      this.advance();
      subscript = this.parseSubscript();
    }
    const token = this.peek();
    if (token.kind === "punct" && token.text === "(") {
      this.advance();
      const open = token;
      const arg = this.withDepth(open, () => {
        if (this.peek().kind === "punct" && this.peek().text === ")") {
          this.error(
            "missing-operand",
            `\`${name}\` needs an argument inside the parentheses.`,
            this.peek(),
          );
        }
        const inner = this.parseRelation();
        this.expectClose(")", "Unbalanced grouping: missing a closing `)`.");
        return inner;
      });
      return {
        kind: "func",
        name,
        ...(subscript === undefined ? {} : { subscript }),
        arg: { kind: "group", node: arg },
      };
    }
    const arg = this.parsePower();
    return { kind: "func", name, ...(subscript === undefined ? {} : { subscript }), arg };
  }

  private parseBinder(op: BinderOp): MathNode {
    // The keyword token was already consumed by parseWordToken/parseUnicodeToken.
    const open = this.peek();
    return this.withDepth(open, () => {
      const indefinite =
        op === "integral" &&
        this.peek().kind === "word" &&
        this.peek().text === "of";
      const name = indefinite ? undefined : this.parseBoundName();
      if (name !== undefined && this.boundNames.some((bound) => bound.name === name.name)) {
        const token = this.tokens[this.position - 1] ?? open;
        this.warn(
          "shadowed-bound-variable",
          `Bound variable "${name.name}" shadows an outer binder's ${name.name}; parenthesize to keep scopes explicit.`,
          token.offset,
          token.length,
        );
      }
      let from: MathNode | undefined;
      let to: MathNode | undefined;
      let target: MathNode | undefined;
      let set: MathNode | undefined;
      if (op === "sum" || op === "product" || op === "integral") {
        if (this.peek().kind === "punct" && this.peek().text === "=") {
          this.advance();
          from = this.parseAdditive();
          const dots = this.peek();
          if (!(dots.kind === "punct" && dots.text === "..")) {
            this.errorAtEnd(
              "unexpected-token",
              "A bound range needs `..` between the bounds.",
            );
          }
          this.advance();
          to = this.parseAdditive();
        }
      } else if (op === "limit") {
        const arrow = this.peek();
        if (!(arrow.kind === "punct" && arrow.text === "->")) {
          this.errorAtEnd(
            "unexpected-token",
            "`limit` requires a target: limit x->a of BODY.",
          );
        }
        this.advance();
        target = this.parseAdditive();
      } else {
        const inToken = this.peek();
        if (
          !(
            (inToken.kind === "word" || inToken.kind === "unicode") &&
            inToken.text === "in"
          )
        ) {
          this.errorAtEnd(
            "unexpected-token",
            `\`${op}\` requires a set: ${op} x in S of BODY.`,
          );
        }
        this.advance();
        set = this.parseMultiplicative();
      }
      const ofToken = this.peek();
      if (!(ofToken.kind === "word" && ofToken.text === "of")) {
        this.error(
          "missing-of-clause",
          `\`${op}\` requires an \`of\` clause before its body.`,
          ofToken,
          {
            suggestion:
              name === undefined
                ? `Write ${op} of BODY.`
                : `Write ${op} ${canonicalSpelling(name)} of BODY.`,
          },
        );
      }
      this.advance();
      if (name !== undefined) this.boundNames.push({ name: name.name });
      const body = this.parseMultiplicative();
      if (name !== undefined) this.boundNames.pop();
      this.checkAdditiveAfterOf();
      if (op === "integral") {
        return this.finishIntegral(name, body, from, to);
      }
      return {
        kind: "binder",
        op,
        ...(name === undefined ? {} : { name }),
        ...(from === undefined ? {} : { from }),
        ...(to === undefined ? {} : { to }),
        ...(target === undefined ? {} : { target }),
        ...(set === undefined ? {} : { set }),
        body,
      };
    });
  }

  private checkAdditiveAfterOf(): void {
    const token = this.peek();
    if (token.kind === "punct" && (token.text === "+" || token.text === "-")) {
      this.warn(
        "additive-after-of",
        `"${token.text}" binds outside the binder scope; parenthesize the operand.`,
        token.offset,
        token.length,
      );
    }
  }

  private finishIntegral(
    name: IdentNode | undefined,
    body: MathNode,
    from?: MathNode,
    to?: MathNode,
  ): MathNode {
    const factors = body.kind === "juxt" ? body.factors : [body];
    const last = factors[factors.length - 1];
    const prev = factors[factors.length - 2];
    let differential: IdentNode | undefined;
    let rest: MathNode[];
    if (last !== undefined && last.kind === "juxt" && last.factors.length === 2) {
      const [d, x] = last.factors;
      if (x !== undefined && d !== undefined && isPlainD(d) && x.kind === "ident") {
        differential = x;
        rest = factors.slice(0, -1);
      } else {
        this.missingDifferential();
        return { kind: "number", spelling: "0" } as MathNode;
      }
    } else if (
      last !== undefined &&
      prev !== undefined &&
      isPlainD(prev) &&
      last.kind === "ident"
    ) {
      differential = last;
      rest = factors.slice(0, -2);
    } else {
      this.missingDifferential();
      return { kind: "number", spelling: "0" } as MathNode;
    }
    const variable = differential.name;
    if (name !== undefined && name.name !== variable) {
      const differentialOffset = this.source.lastIndexOf(`d${variable}`);
      const token =
        this.tokens.find((candidate) => candidate.offset === differentialOffset) ??
        this.tokens[this.position - 1] ??
        this.peek();
      this.error(
        "differential-mismatch",
        `The integral binds "${name.name}" but the differential is d${variable}; use d${name.name} or rebind.`,
        token,
      );
    }
    if (rest.length === 0) {
      this.errorAtEnd(
        "missing-operand",
        "An integral needs an operand before the differential.",
      );
    }
    const bodyOnly: MathNode =
      rest.length === 1
        ? (rest[0] as MathNode)
        : { kind: "juxt", factors: rest };
    return {
      kind: "binder",
      op: "integral",
      ...(name === undefined ? {} : { name }),
      ...(from === undefined ? {} : { from }),
      ...(to === undefined ? {} : { to }),
      ...(differential === undefined ? {} : { differential: variable }),
      body: bodyOnly,
    };
  }

  private missingDifferential(): never {
    this.errorAtEnd(
      "missing-integration-variable",
      "The integral is missing a terminal differential such as dx.",
      { suggestion: "Add an integration variable such as dx to the integral." },
    );
  }

  private warn(code: string, message: string, offset: number, length: number): void {
    this.warnings.push(problem(code, message, offset, length, { severity: "warning" }));
  }
}

function isPlainD(node: MathNode): boolean {
  return (
    node.kind === "ident" &&
    node.name === "d" &&
    node.digitSuffix === undefined &&
    node.subscript === undefined &&
    node.primes === undefined
  );
}

class MathSyntaxError extends Error {
  readonly problem: MathProblem;

  constructor(problem: MathProblem) {
    super(problem.message);
    this.name = "MathSyntaxError";
    this.problem = problem;
  }
}

/**
 * Parse a mathematics body into a semantic expression tree. The parser
 * is the validator: any failure returns stable-coded, sub-ranged
 * problems; warnings ride along with a successful tree.
 */
export function parseNativeMath(source: string): MathParseResult {
  const { tokens, problems } = lex(source);
  if (problems.length > 0) {
    return { problems };
  }
  const parser = new Parser(source, tokens);
  try {
    const tree = parser.parseFully();
    const remaining = parser.following();
    if (remaining.kind !== "eof") {
      return {
        problems: [
          problem(
            "unexpected-token",
            `Unexpected token "${remaining.text}".`,
            remaining.offset,
            remaining.length,
          ),
        ],
      };
    }
    return { tree, warnings: parser.getWarnings() };
  } catch (error) {
    if (error instanceof MathSyntaxError) return { problems: [error.problem] };
    throw error;
  }
}

/* ------------------------------------------------------------------ *
 * Did-you-mean over the registered vocabulary
 * ------------------------------------------------------------------ */

function editDistance(a: string, b: string): number {
  const rows: number[][] = Array.from({ length: a.length + 1 }, () =>
    Array.from({ length: b.length + 1 }, () => 0),
  );
  for (let i = 0; i <= a.length; i += 1) rows[i]![0] = i;
  for (let j = 0; j <= b.length; j += 1) rows[0]![j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      rows[i]![j] = Math.min(
        rows[i - 1]![j]! + 1,
        rows[i]![j - 1]! + 1,
        rows[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return rows[a.length]![b.length]!;
}

function nearestVocabulary(word: string): string[] {
  const distances = Object.keys(VOCABULARY)
    .map((candidate) => ({ candidate, distance: editDistance(word, candidate) }))
    .sort((a, b) => a.distance - b.distance || a.candidate.localeCompare(b.candidate));
  const best = distances[0];
  if (best === undefined || best.distance > 2) return [];
  const cutoff = best.distance;
  return distances
    .filter(({ distance }) => distance === cutoff)
    .slice(0, 3)
    .map(({ candidate }) => `\`${candidate}\``);
}

/* ------------------------------------------------------------------ *
 * Tree → canonical spelling (formatter + idempotence)
 * ------------------------------------------------------------------ */

export function canonicalSpelling(node: MathNode): string {
  switch (node.kind) {
    case "ident": {
      let out = node.name;
      if (node.digitSuffix !== undefined) out += node.digitSuffix;
      if (node.subscript !== undefined) out += `_${node.subscript}`;
      if (node.primes !== undefined) out += "'".repeat(node.primes);
      return out;
    }
    case "number":
      return node.spelling;
    case "symbol":
      return node.name;
    case "unary":
      return `-${canonicalSpelling(node.node)}`;
    case "add":
      return `${canonicalSpelling(node.left)} + ${canonicalSpelling(node.right)}`;
    case "sub":
      return `${canonicalSpelling(node.left)} - ${canonicalSpelling(node.right)}`;
    case "mul":
      return `${canonicalSpelling(node.left)} * ${canonicalSpelling(node.right)}`;
    case "div":
      return `${canonicalSpelling(node.left)} / ${canonicalSpelling(node.right)}`;
    case "juxt":
      return node.factors
        .map((factor, index) => {
          const spelling = canonicalSpelling(factor);
          if (index === 0 || factor.kind === "group") return spelling;
          return ` ${spelling}`;
        })
        .join("");
    case "script": {
      const base = canonicalSpelling(node.base);
      const sub = node.sub === undefined ? "" : `_${node.sub}`;
      const sup = node.sup === undefined ? "" : `^${canonicalSpelling(node.sup)}`;
      const primes = node.primes === undefined ? "" : "'".repeat(node.primes);
      return `${base}${sub}${primes}${sup}`;
    }
    case "chain":
      return [
        canonicalSpelling(node.head),
        ...node.links.map(
          (link) =>
            `${RELATION_SPELLING[link.op] ?? link.op} ${canonicalSpelling(link.node)}`,
        ),
      ].join(" ");
    case "setop":
      return `${canonicalSpelling(node.left)} ${node.op} ${canonicalSpelling(node.right)}`;
    case "func": {
      const sub = node.subscript === undefined ? "" : `_${node.subscript}`;
      const arg =
        node.arg.kind === "group"
          ? canonicalSpelling(node.arg)
          : ` ${canonicalSpelling(node.arg)}`;
      return `${node.name}${sub}${arg}`;
    }
    case "sqrt":
      return `sqrt(${canonicalSpelling(node.arg)})`;
    case "root":
      return `root(${canonicalSpelling(node.index)}, ${canonicalSpelling(node.arg)})`;
    case "frac":
      return `frac(${canonicalSpelling(node.num)}, ${canonicalSpelling(node.den)})`;
    case "abs":
      return `abs(${canonicalSpelling(node.arg)})`;
    case "vector":
      return `vector [${node.items.map(canonicalSpelling).join(", ")}]`;
    case "matrix":
      return `${matrixName(node.delimiter)} [${node.rows
        .map((row) => `[${row.map(canonicalSpelling).join(", ")}]`)
        .join(", ")}]`;
    case "cases":
      return `cases(${node.branches
        .map((branch) =>
          branch.cond.kind === "otherwise"
            ? `${canonicalSpelling(branch.expr)} otherwise`
            : `${canonicalSpelling(branch.expr)} when ${canonicalSpelling(branch.cond)}`,
        )
        .join("; ")})`;
    case "group":
      return `(${canonicalSpelling(node.node)})`;
    case "binder": {
      const name = node.name === undefined ? "" : canonicalSpelling(node.name);
      let clause = name;
      if (node.from !== undefined && node.to !== undefined) {
        clause += `=${canonicalSpelling(node.from)}..${canonicalSpelling(node.to)}`;
      } else if (node.target !== undefined) {
        clause += `->${canonicalSpelling(node.target)}`;
      } else if (node.set !== undefined) {
        clause += ` in ${canonicalSpelling(node.set)}`;
      }
      const differential =
        node.differential === undefined ? "" : ` d${node.differential}`;
      return `${node.op} ${clause} of ${canonicalSpelling(node.body)}${differential}`;
    }
  }
}

function matrixName(delimiter: "bracket" | "paren" | "bar"): string {
  if (delimiter === "paren") return "pmatrix";
  if (delimiter === "bar") return "vmatrix";
  return "matrix";
}

/* ------------------------------------------------------------------ *
 * Identity projection (spelling-normalized, presentation-preserving)
 * ------------------------------------------------------------------ */

export function projectMathNode(node: MathNode): JsonValue {
  switch (node.kind) {
    case "ident":
      return {
        kind: "ident",
        name: node.name,
        ...(node.digitSuffix === undefined ? {} : { digitSuffix: node.digitSuffix }),
        ...(node.subscript === undefined ? {} : { subscript: node.subscript }),
        ...(node.primes === undefined ? {} : { primes: node.primes }),
      };
    case "number":
      return { kind: "number", spelling: node.spelling };
    case "symbol":
      return { kind: "symbol", name: node.name };
    case "unary":
      return { kind: "unary", op: node.op, node: projectMathNode(node.node) };
    case "add":
      return { kind: "add", left: projectMathNode(node.left), right: projectMathNode(node.right) };
    case "sub":
      return { kind: "sub", left: projectMathNode(node.left), right: projectMathNode(node.right) };
    case "mul":
      return { kind: "mul", left: projectMathNode(node.left), right: projectMathNode(node.right) };
    case "div":
      return { kind: "div", left: projectMathNode(node.left), right: projectMathNode(node.right) };
    case "juxt":
      return { kind: "juxt", factors: node.factors.map(projectMathNode) };
    case "script":
      return {
        kind: "script",
        base: projectMathNode(node.base),
        ...(node.sub === undefined ? {} : { sub: node.sub }),
        ...(node.sup === undefined ? {} : { sup: projectMathNode(node.sup) }),
      };
    case "chain":
      return {
        kind: "chain",
        head: projectMathNode(node.head),
        links: node.links.map((link) => ({ op: link.op, node: projectMathNode(link.node) })),
      };
    case "setop":
      return {
        kind: "setop",
        op: node.op,
        left: projectMathNode(node.left),
        right: projectMathNode(node.right),
      };
    case "func":
      return {
        kind: "func",
        name: node.name,
        ...(node.subscript === undefined ? {} : { subscript: node.subscript }),
        arg: projectMathNode(node.arg),
      };
    case "sqrt":
      return { kind: "sqrt", arg: projectMathNode(node.arg) };
    case "root":
      return { kind: "root", index: projectMathNode(node.index), arg: projectMathNode(node.arg) };
    case "frac":
      return { kind: "frac", num: projectMathNode(node.num), den: projectMathNode(node.den) };
    case "abs":
      return { kind: "abs", arg: projectMathNode(node.arg) };
    case "vector":
      return { kind: "vector", items: node.items.map(projectMathNode) };
    case "matrix":
      return {
        kind: "matrix",
        delimiter: node.delimiter,
        rows: node.rows.map((row) => row.map(projectMathNode)),
      };
    case "cases":
      return {
        kind: "cases",
        branches: node.branches.map((branch) => ({
          expr: projectMathNode(branch.expr),
          cond:
            branch.cond.kind === "otherwise"
              ? { kind: "otherwise" }
              : projectMathNode(branch.cond),
        })),
      };
    case "group":
      return { kind: "group", node: projectMathNode(node.node) };
    case "binder":
      return {
        kind: "binder",
        op: node.op,
        ...(node.name === undefined ? {} : { name: projectMathNode(node.name) }),
        ...(node.from === undefined ? {} : { from: projectMathNode(node.from) }),
        ...(node.to === undefined ? {} : { to: projectMathNode(node.to) }),
        ...(node.target === undefined ? {} : { target: projectMathNode(node.target) }),
        ...(node.set === undefined ? {} : { set: projectMathNode(node.set) }),
        ...(node.differential === undefined ? {} : { differential: node.differential }),
        body: projectMathNode(node.body),
      };
  }
}

/* ------------------------------------------------------------------ *
 * Tree → TeX (renderer-derived, total, deterministic)
 * ------------------------------------------------------------------ */

export function treeToTex(node: MathNode): string {
  switch (node.kind) {
    case "ident": {
      let out = node.name;
      if (node.digitSuffix !== undefined) out += node.digitSuffix;
      if (node.subscript !== undefined) out += subscriptTex(node.subscript);
      if (node.primes !== undefined) out += "'".repeat(node.primes);
      return out;
    }
    case "number":
      return node.spelling;
    case "symbol":
      return (
        GREEK_LOWER[node.name] ??
        GREEK_VARIANTS[node.name] ??
        GREEK_UPPER[node.name] ??
        SYMBOLS[node.name] ??
        node.name
      );
    case "unary":
      return `-${treeToTex(node.node)}`;
    case "add":
      return `${treeToTex(node.left)} + ${treeToTex(node.right)}`;
    case "sub":
      return `${treeToTex(node.left)} - ${treeToTex(node.right)}`;
    case "mul":
      return `${treeToTex(node.left)} * ${treeToTex(node.right)}`;
    case "div":
      return `${treeToTex(node.left)} / ${treeToTex(node.right)}`;
    case "juxt":
      return node.factors.map(treeToTex).join(" ");
    case "script": {
      const base = treeToTex(node.base);
      const sub = node.sub === undefined ? "" : subscriptTex(node.sub);
      const sup = node.sup === undefined ? "" : `^{${treeToTex(node.sup)}}`;
      const primes = node.primes === undefined ? "" : "'".repeat(node.primes);
      return `${base}${primes}${sub}${sup}`;
    }
    case "chain": {
      const parts: string[] = [treeToTex(node.head)];
      for (const link of node.links) {
        parts.push(RELATION_TEX[link.op] ?? link.op, treeToTex(link.node));
      }
      return parts.join(" ");
    }
    case "setop":
      return `${treeToTex(node.left)} ${SET_OP_TEX[node.op] ?? node.op} ${treeToTex(node.right)}`;
    case "func": {
      const fn = FUNCTIONS[node.name] ?? `\\operatorname{${node.name}}`;
      const sub = node.subscript === undefined ? "" : subscriptTex(node.subscript);
      return `${fn}${sub} ${treeToTex(node.arg)}`;
    }
    case "sqrt":
      return `\\sqrt{${treeToTex(node.arg)}}`;
    case "root":
      return `\\sqrt[${treeToTex(node.index)}]{${treeToTex(node.arg)}}`;
    case "frac":
      return `\\frac{${treeToTex(node.num)}}{${treeToTex(node.den)}}`;
    case "abs":
      return `\\left|${treeToTex(node.arg)}\\right|`;
    case "vector":
      return node.items.length === 1
        ? `\\vec{${treeToTex(node.items[0] ?? { kind: "number", spelling: "0" })}}`
        : `\\mathbf{${node.items.map(treeToTex).join(", ")}}`;
    case "matrix": {
      const env = MATRIX_TEX[matrixName(node.delimiter) as MatrixName] ?? "bmatrix";
      const rows = node.rows.map((row) => row.map(treeToTex).join(" & ")).join(" \\\\ ");
      return `\\begin{${env}}${rows}\\end{${env}}`;
    }
    case "cases": {
      const rows = node.branches
        .map((branch) =>
          branch.cond.kind === "otherwise"
            ? `${treeToTex(branch.expr)} & \\text{otherwise}`
            : `${treeToTex(branch.expr)} & ${treeToTex(branch.cond)}`,
        )
        .join(" \\\\ ");
      return `\\begin{cases}${rows}\\end{cases}`;
    }
    case "group":
      return `\\left(${treeToTex(node.node)}\\right)`;
    case "binder": {
      const name = node.name === undefined ? "" : treeToTex(node.name);
      let prefix: string;
      switch (node.op) {
        case "sum":
          prefix = `\\sum_{${name}} `;
          if (node.from !== undefined && node.to !== undefined) {
            prefix = `\\sum_{${name}=${treeToTex(node.from)}}^{${treeToTex(node.to)}} `;
          }
          break;
        case "product":
          prefix = `\\prod_{${name}} `;
          if (node.from !== undefined && node.to !== undefined) {
            prefix = `\\prod_{${name}=${treeToTex(node.from)}}^{${treeToTex(node.to)}} `;
          }
          break;
        case "integral":
          prefix = "\\int ";
          if (node.from !== undefined && node.to !== undefined) {
            prefix = `\\int_{${treeToTex(node.from)}}^{${treeToTex(node.to)}} `;
          }
          break;
        case "limit":
          prefix = `\\lim_{${name} \\to ${treeToTex(node.target ?? { kind: "number", spelling: "0" })}} `;
          break;
        case "forall":
          prefix = `\\forall ${name} \\in ${treeToTex(node.set ?? { kind: "number", spelling: "0" })}, `;
          break;
        case "exists":
          prefix = `\\exists ${name} \\in ${treeToTex(node.set ?? { kind: "number", spelling: "0" })}, `;
          break;
      }
      const differential =
        node.differential === undefined ? "" : ` \\, d${node.differential}`;
      return `${prefix}{${treeToTex(node.body)}}${differential}`;
    }
  }
}

function subscriptTex(subscript: string): string {
  return /^[0-9]+$/.test(subscript) || subscript.length === 1
    ? `_{${subscript}}`
    : `_{\\mathrm{${subscript}}}`;
}

/**
 * Rebuild a MathNode from its identity projection so renderers derive TeX
 * from the semantic tree the Block owns, exactly per contract §1/§12:
 * TeX is a total deterministic function of the tree.
 */
export function projectionToNode(value: JsonValue): MathNode | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const obj = value as Readonly<Record<string, unknown>>;
  const kind = obj.kind;
  switch (kind) {
    case "ident":
      return {
        kind: "ident",
        name: String(obj.name ?? ""),
        ...(obj.digitSuffix === undefined ? {} : { digitSuffix: String(obj.digitSuffix) }),
        ...(obj.subscript === undefined ? {} : { subscript: String(obj.subscript) }),
        ...(obj.primes === undefined ? {} : { primes: obj.primes as 1 | 2 }),
      };
    case "number":
      return { kind: "number", spelling: String(obj.spelling ?? "") };
    case "symbol":
      return { kind: "symbol", name: String(obj.name ?? "") };
    case "unary": {
      const node = projectionToNode(obj.node as JsonValue);
      if (node === undefined) return undefined;
      return { kind: "unary", op: "-", node };
    }
    case "add": {
      const left = projectionToNode(obj.left as JsonValue);
      const right = projectionToNode(obj.right as JsonValue);
      if (left === undefined || right === undefined) return undefined;
      return { kind: "add", left, right };
    }
    case "sub": {
      const left = projectionToNode(obj.left as JsonValue);
      const right = projectionToNode(obj.right as JsonValue);
      if (left === undefined || right === undefined) return undefined;
      return { kind: "sub", left, right };
    }
    case "mul": {
      const left = projectionToNode(obj.left as JsonValue);
      const right = projectionToNode(obj.right as JsonValue);
      if (left === undefined || right === undefined) return undefined;
      return { kind: "mul", left, right };
    }
    case "div": {
      const left = projectionToNode(obj.left as JsonValue);
      const right = projectionToNode(obj.right as JsonValue);
      if (left === undefined || right === undefined) return undefined;
      return { kind: "div", left, right };
    }
    case "juxt": {
      if (!Array.isArray(obj.factors)) return undefined;
      const factors: MathNode[] = [];
      for (const factor of obj.factors) {
        const node = projectionToNode(factor as JsonValue);
        if (node === undefined) return undefined;
        factors.push(node);
      }
      return { kind: "juxt", factors };
    }
    case "script": {
      const base = projectionToNode(obj.base as JsonValue);
      if (base === undefined) return undefined;
      const sup = obj.sup === undefined ? undefined : projectionToNode(obj.sup as JsonValue);
      if (obj.sup !== undefined && sup === undefined) return undefined;
      const sub = obj.sub === undefined ? undefined : String(obj.sub);
      const primes = obj.primes === undefined ? undefined : (obj.primes as 1 | 2);
      return {
        kind: "script",
        base,
        ...(sub === undefined ? {} : { sub }),
        ...(sup === undefined ? {} : { sup }),
        ...(primes === undefined ? {} : { primes }),
      };
    }
    case "chain": {
      const head = projectionToNode(obj.head as JsonValue);
      if (head === undefined || !Array.isArray(obj.links)) return undefined;
      const links: { op: RelationOp; node: MathNode }[] = [];
      for (const link of obj.links) {
        const entry = link as Readonly<Record<string, unknown>>;
        const node = projectionToNode((entry as { node: unknown }).node as JsonValue);
        if (node === undefined) return undefined;
        links.push({ op: String(entry.op ?? "") as RelationOp, node });
      }
      return { kind: "chain", head, links };
    }
    case "setop": {
      const left = projectionToNode(obj.left as JsonValue);
      const right = projectionToNode(obj.right as JsonValue);
      if (left === undefined || right === undefined) return undefined;
      return { kind: "setop", op: String(obj.op ?? "") as SetOp, left, right };
    }
    case "func": {
      const arg = projectionToNode(obj.arg as JsonValue);
      if (arg === undefined) return undefined;
      return {
        kind: "func",
        name: String(obj.name ?? ""),
        ...(obj.subscript === undefined ? {} : { subscript: String(obj.subscript) }),
        arg,
      };
    }
    case "sqrt": {
      const arg = projectionToNode(obj.arg as JsonValue);
      if (arg === undefined) return undefined;
      return { kind: "sqrt", arg };
    }
    case "root": {
      const index = projectionToNode(obj.index as JsonValue);
      const arg = projectionToNode(obj.arg as JsonValue);
      if (index === undefined || arg === undefined) return undefined;
      return { kind: "root", index, arg };
    }
    case "frac": {
      const num = projectionToNode(obj.num as JsonValue);
      const den = projectionToNode(obj.den as JsonValue);
      if (num === undefined || den === undefined) return undefined;
      return { kind: "frac", num, den };
    }
    case "abs": {
      const arg = projectionToNode(obj.arg as JsonValue);
      if (arg === undefined) return undefined;
      return { kind: "abs", arg };
    }
    case "vector": {
      if (!Array.isArray(obj.items)) return undefined;
      const items: MathNode[] = [];
      for (const item of obj.items) {
        const node = projectionToNode(item as JsonValue);
        if (node === undefined) return undefined;
        items.push(node);
      }
      return { kind: "vector", items };
    }
    case "matrix": {
      if (!Array.isArray(obj.rows)) return undefined;
      const rows: MathNode[][] = [];
      for (const row of obj.rows) {
        if (!Array.isArray(row)) return undefined;
        const cells: MathNode[] = [];
        for (const cell of row) {
          const node = projectionToNode(cell as JsonValue);
          if (node === undefined) return undefined;
          cells.push(node);
        }
        rows.push(cells);
      }
      return {
        kind: "matrix",
        delimiter: String(obj.delimiter ?? "bracket") as "bracket" | "paren" | "bar",
        rows,
      };
    }
    case "cases": {
      if (!Array.isArray(obj.branches)) return undefined;
      const branches: CasesBranch[] = [];
      for (const branch of obj.branches) {
        const entry = branch as Readonly<Record<string, unknown>>;
        const expr = projectionToNode((entry as { expr: unknown }).expr as JsonValue);
        if (expr === undefined) return undefined;
        const condValue = entry.cond;
        const cond =
          (condValue as Readonly<Record<string, unknown>> | undefined)?.kind === "otherwise"
            ? { kind: "otherwise" as const }
            : projectionToNode(condValue as JsonValue);
        if (cond === undefined) return undefined;
        branches.push({ expr, cond });
      }
      return { kind: "cases", branches };
    }
    case "group": {
      const node = projectionToNode(obj.node as JsonValue);
      if (node === undefined) return undefined;
      return { kind: "group", node };
    }
    case "binder": {
      const name = obj.name === undefined ? undefined : projectionToNode(obj.name as JsonValue);
      const body = projectionToNode(obj.body as JsonValue);
      if (body === undefined) return undefined;
      if (name === undefined && obj.name !== undefined) return undefined;
      if (name !== undefined && name.kind !== "ident") return undefined;
      const from = obj.from === undefined ? undefined : projectionToNode(obj.from as JsonValue);
      if (obj.from !== undefined && from === undefined) return undefined;
      const to = obj.to === undefined ? undefined : projectionToNode(obj.to as JsonValue);
      if (obj.to !== undefined && to === undefined) return undefined;
      const target = obj.target === undefined ? undefined : projectionToNode(obj.target as JsonValue);
      if (obj.target !== undefined && target === undefined) return undefined;
      const set = obj.set === undefined ? undefined : projectionToNode(obj.set as JsonValue);
      if (obj.set !== undefined && set === undefined) return undefined;
      const differential =
        obj.differential === undefined ? undefined : String(obj.differential);
      return {
        kind: "binder",
        op: String(obj.op ?? "") as BinderOp,
        ...(name === undefined ? {} : { name }),
        ...(from === undefined ? {} : { from }),
        ...(to === undefined ? {} : { to }),
        ...(target === undefined ? {} : { target }),
        ...(set === undefined ? {} : { set }),
        ...(differential === undefined ? {} : { differential }),
        body,
      };
    }
    default:
      return undefined;
  }
}

/**
 * TeX from a tree projection; used by renderers so TeX is derived from
 * the semantic tree the Block owns. Falls back to empty only if the
 * projection is absent (never for native blocks).
 */
export function treeToTexFromProjection(projection: JsonValue | undefined): string {
  if (projection === undefined) return "";
  const node = projectionToNode(projection);
  return node === undefined ? "" : treeToTex(node);
}

/* ------------------------------------------------------------------ *
 * Sub-ranged diagnostic helper
 * ------------------------------------------------------------------ */

/**
 * Map a parser offset (relative to a body's start) onto the exact
 * sub-range within the Block body so diagnostics stay body-scoped.
 * `bodyRanges` are the source ranges of the body's lines, whose start
 * offsets are absolute in the Source; the returned range uses the same
 * absolute space.
 */
export function rangeForOffset(
  bodyRanges: readonly SourceRange[],
  offset: number,
  length: number,
): SourceRange {
  if (bodyRanges.length === 0) {
    return {
      start: { line: 1, column: 1, offset: 0 },
      end: { line: 1, column: 1, offset: 0 },
    };
  }
  const base = bodyRanges[0]?.start.offset ?? 0;
  const lastIndex = bodyRanges.length - 1;
  for (let index = 0; index <= lastIndex; index += 1) {
    const range = bodyRanges[index];
    const next = bodyRanges[index + 1];
    const relStart = (range?.start.offset ?? base) - base;
    const relEnd =
      next === undefined ? Number.MAX_SAFE_INTEGER : (next.start.offset ?? base) - 1 - base;
    if (offset < relEnd || index === lastIndex) {
      const lineRange = bodyRanges[index];
      const column = offset - relStart + 1;
      return {
        start: {
          line: lineRange?.start.line ?? 1,
          column: Math.max(column, 1),
          offset: relStart + base + (offset - relStart),
        },
        end: {
          line: lineRange?.start.line ?? 1,
          column: Math.max(column + length, 1),
          offset: relStart + base + (offset - relStart) + length,
        },
      };
    }
  }
  const lineRange = bodyRanges[lastIndex];
  return {
    start: { line: lineRange?.start.line ?? 1, column: 1, offset: base },
    end: { line: lineRange?.start.line ?? 1, column: 1, offset: base + length },
  };
}