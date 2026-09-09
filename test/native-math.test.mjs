import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_CASES_BRANCHES,
  MAX_MATH_NESTING_DEPTH,
  MAX_MATRIX_DIMENSION,
  canonicalSpelling,
  parseNativeMath,
  projectMathNode,
  treeToTex,
} from "../dist/math.js";

function parseOk(body, label = body) {
  const result = parseNativeMath(body);
  assert.equal(
    "tree" in result,
    true,
    `expected parse success: ${label}`,
  );
  return result;
}

function parseProblems(body) {
  const result = parseNativeMath(body);
  assert.equal(
    "problems" in result,
    true,
    `expected parse failure: ${body}`,
  );
  return result.problems;
}

function tree(body) {
  return parseOk(body).tree;
}

function tex(body) {
  return treeToTex(tree(body));
}

function spelling(body) {
  return canonicalSpelling(tree(body));
}

function projection(body) {
  return projectMathNode(tree(body));
}

function problemsIndexed(body, code) {
  return parseProblems(body)
    .map((problem) => ({ ...problem }))
    .filter((problem) => problem.code === code);
}

test("relations chain at one level and preserve authored order", () => {
  assert.equal(tex("0 <= x < 1"), "0 \\leq x < 1");
  assert.equal(tex("a = b = c"), "a = b = c");
  const chain = tree("0 <= x < 1");
  assert.equal(chain.kind, "chain");
  assert.equal(chain.links.length, 2);
  assert.equal(chain.links[0]?.op, "<=");
});

test("set relations and set operations bind tighter than relations", () => {
  assert.equal(tex("x in A union B"), "x \\in A \\cup B");
  assert.equal(tex("A union B intersect C"), "A \\cup B \\cap C");
  assert.equal(tex("x notin S"), "x \\notin S");
  assert.equal(tex("S subseteq T"), "S \\subseteq T");
  assert.equal(tex("S supset T"), "S \\supset T");
  assert.equal(tex("S subset T"), "S \\subset T");
});

test("additive is left-associative and explicit product stays distinct", () => {
  assert.equal(tex("x + y"), "x + y");
  assert.equal(tex("x - y * z"), "x - y * z");
  assert.equal(tex("m a"), "m a");
  assert.equal(tex("m * a"), "m * a");
  assert.notDeepEqual(projection("m a"), projection("m * a"));
});

test("slash division is a distinct presentation from stacked fractions", () => {
  assert.equal(tex("a / b"), "a / b");
  assert.equal(tex("frac(a, b)"), "\\frac{a}{b}");
  assert.notDeepEqual(projection("a / b"), projection("frac(a, b)"));
});

test("unary minus binds looser than power", () => {
  const unary = tree("-x^2");
  assert.equal(unary.kind, "unary");
  assert.equal(unary.node.kind, "script");
  assert.equal(tex("-x^2"), "-x^{2}");
});

test("powers are non-associative and take one sub plus one sup", () => {
  assert.deepEqual(
    parseProblems("x^2^3").map(({ code }) => code),
    ["chained-power"],
  );
  const chained = problemsIndexed("x^2^3", "chained-power")[0];
  assert.equal(chained.offset, 3);
  assert.deepEqual(
    parseProblems("x_2_3").map(({ code }) => code),
    ["chained-power"],
  );
  assert.equal(tex("x^2_i"), "x_{i}^{2}");
  assert.equal(tex("x_i^2"), "x_{i}^{2}");
  assert.deepEqual(projection("x^2_i"), projection("x_i^2"));
});

test("identifiers carry digit suffixes, word subscripts, and primes", () => {
  assert.equal(tex("S_n"), "S_{n}");
  assert.equal(tex("x_max"), "x_{\\mathrm{max}}");
  assert.equal(tex("v0"), "v0");
  assert.equal(tex("V0"), "V0");
  assert.equal(tex("y''"), "y''");
  assert.equal(tex("y'"), "y'");
  assert.notDeepEqual(projection("v0"), projection("v_0"));
});

test("registered function applications accept parens or a bare term", () => {
  assert.equal(tex("sin(x)"), "\\sin \\left(x\\right)");
  assert.equal(tex("sin x^2"), "\\sin x^{2}");
  assert.equal(tex("log_2 x"), "\\log_{2} x");
  assert.equal(tex("arctan(x)"), "\\arctan \\left(x\\right)");
  assert.equal(tex("det(A)"), "\\det \\left(A\\right)");
});

test("unregistered function-like spellings read as juxtaposition", () => {
  const juxt = tree("f(x)");
  assert.equal(juxt.kind, "juxt");
  assert.equal(tex("f(x)"), "f \\left(x\\right)");
  assert.equal(tex("v(t)"), "v \\left(t\\right)");
});

test("constructs: sqrt, root, abs, vector, matrix family, cases", () => {
  assert.equal(tex("sqrt(x)"), "\\sqrt{x}");
  assert.equal(tex("root(3, x)"), "\\sqrt[3]{x}");
  assert.equal(tex("abs(x)"), "\\left|x\\right|");
  assert.equal(tex("vector [v]"), "\\vec{v}");
  assert.equal(tex("vector [a, b]"), "\\mathbf{a, b}");
  assert.equal(
    tex("matrix [[a,b],[c,d]]"),
    "\\begin{bmatrix}a & b \\\\ c & d\\end{bmatrix}",
  );
  assert.equal(
    tex("pmatrix [[a,b],[c,d]]"),
    "\\begin{pmatrix}a & b \\\\ c & d\\end{pmatrix}",
  );
  assert.equal(
    tex("vmatrix [[a,b],[c,d]]"),
    "\\begin{vmatrix}a & b \\\\ c & d\\end{vmatrix}",
  );
  assert.notDeepEqual(
    projection("matrix [[a],[b]]"),
    projection("pmatrix [[a],[b]]"),
  );
  assert.notDeepEqual(projection("sqrt(x)"), projection("root(2, x)"));
});

test("cases branches keep expression/condition ordering and otherwise", () => {
  assert.equal(
    tex("cases(x^2 when x >= 0; -x otherwise)"),
    "\\begin{cases}x^{2} & x \\geq 0 \\\\ -x & \\text{otherwise}\\end{cases}",
  );
  assert.equal(
    tex("cases(0 when t < 0; V0 when t >= 0)"),
    "\\begin{cases}0 & t < 0 \\\\ V0 & t \\geq 0\\end{cases}",
  );
});

test("binders scope bound names with optional bounds", () => {
  assert.equal(tex("sum i=1..n of i^2"), "\\sum_{i=1}^{n} {i^{2}}");
  assert.equal(tex("product k=1..m of k"), "\\prod_{k=1}^{m} {k}");
  assert.equal(tex("sum i of x_i"), "\\sum_{i} {x_{i}}");
  assert.equal(
    tex("integral x=0..infinity of exp(-x^2) dx"),
    "\\int_{0}^{\\infty} {\\exp \\left(-x^{2}\\right)} \\, dx",
  );
  assert.equal(tex("integral of f(t) dt"), "\\int {f \\left(t\\right)} \\, dt");
  assert.equal(
    tex("limit x->0 of sin(x)"),
    "\\lim_{x \\to 0} {\\sin \\left(x\\right)}",
  );
  assert.equal(tex("forall x in S of P(x)"), "\\forall x \\in S, {P \\left(x\\right)}");
  assert.equal(tex("exists x in S of P(x)"), "\\exists x \\in S, {P \\left(x\\right)}");
});

test("the plus-minus relation renders and stays distinct", () => {
  assert.equal(tex("x = -b +- sqrt(b^2 - 4 * a * c)"), "x = -b \\pm \\sqrt{b^{2} - 4 * a * c}");
  assert.equal(tex("a +- b"), "a \\pm b");
  assert.notDeepEqual(projection("x +- y"), projection("x + y"));
});

test("relation vocabulary maps to pinned TeX", () => {
  assert.equal(tex("a != b"), "a \\neq b");
  assert.equal(tex("x -> y"), "x \\to y");
  assert.equal(tex("a approx b"), "a \\approx b");
  assert.equal(tex("a equiv b"), "a \\equiv b");
  assert.equal(tex("a <= b"), "a \\leq b");
  assert.equal(tex("a >= b"), "a \\geq b");
  assert.equal(tex("a < b > c"), "a < b > c");
});

test("Greek, symbols, and function vocabulary map to pinned TeX", () => {
  assert.equal(tex("alpha + Gamma"), "\\alpha + \\Gamma");
  assert.equal(tex("varepsilon + varphi"), "\\varepsilon + \\varphi");
  assert.equal(tex("infinity + partial + emptyset"), "\\infty + \\partial + \\emptyset");
});

test("accepted Unicode spellings normalize to word spellings", () => {
  for (const glyph of ["α", "β", "Γ", "∞", "∂", "∅"]) {
    assert.equal("tree" in parseNativeMath(glyph), true, glyph);
  }
  assert.equal("tree" in parseNativeMath("√x"), true);
  assert.deepEqual(projection("α + β"), projection("alpha + beta"));
  assert.deepEqual(projection("√x"), projection("sqrt(x)"));
  assert.deepEqual(projection("x ± y"), projection("x +- y"));
  assert.deepEqual(projection("x ∈ A ∪ B"), projection("x in A union B"));
  assert.deepEqual(projection("a ≠ b"), projection("a != b"));
  assert.deepEqual(projection("a ≤ b"), projection("a <= b"));
  assert.deepEqual(projection("a ≥ b"), projection("a >= b"));
  assert.deepEqual(projection("a → b"), projection("a -> b"));
  assert.deepEqual(projection("a ≈ b"), projection("a approx b"));
  assert.deepEqual(projection("a ≡ b"), projection("a equiv b"));
  assert.deepEqual(projection("x ∉ S"), projection("x notin S"));
  assert.deepEqual(projection("S ⊂ T"), projection("S subset T"));
  assert.deepEqual(projection("S ⊆ T"), projection("S subseteq T"));
  assert.deepEqual(projection("S ⊃ T"), projection("S supset T"));
  assert.deepEqual(projection("∀ x in S of x"), projection("forall x in S of x"));
  assert.deepEqual(projection("∃ x in S of x"), projection("exists x in S of x"));
});

test("whitespace and layout are trivia for identity", () => {
  assert.deepEqual(projection("x + y"), projection("x+y"));
  assert.deepEqual(projection("x + y"), projection("x +\ny"));
  assert.deepEqual(projection("F = x + 1"), projection("F =\n  x + 1"));
});

test("preserved distinctions never normalize", () => {
  assert.notDeepEqual(projection("x^2"), projection("x * x"));
  assert.notDeepEqual(projection("a / b"), projection("frac(a, b)"));
  assert.notDeepEqual(projection("sin(x)"), projection("sin x"));
});

test("TeX braces are refused as unsupported notation at each brace", () => {
  assert.deepEqual(
    parseProblems("x^{2} + y^{2} = r^{2}").map(({ code }) => code),
    ["unsupported-notation", "unsupported-notation", "unsupported-notation"],
  );
  const first = problemsIndexed("x^{2} + y^{2}", "unsupported-notation")[0];
  assert.equal(first.offset, 2);
  assert.equal(first.length, 1);
  const second = problemsIndexed("x^{2} + y^{2}", "unsupported-notation")[1];
  assert.equal(second.offset, 10);
  assert.match(first.message, /braces|TeX/);
  assert.match(first.suggestion, /x\^\(2\)/);
});

test("backslashes and TeX spellings are refused, never passed through", () => {
  const problems = problemsIndexed("x = \\frac{a}{b}", "unsupported-notation");
  assert.ok(problems.length >= 1);
  assert.equal(problems[0]?.offset, 4);
  assert.equal(problems[0]?.length, 1);
  assert.ok(
    parseProblems("x = \\frac{a}{b}").every(({ code }) => code === "unsupported-notation"),
  );
});

test("unbalanced grouping points at the end-of-body offset", () => {
  assert.deepEqual(
    parseProblems("frac(a+b, c").map(({ code }) => code),
    ["unbalanced-grouping"],
  );
  const problem = problemsIndexed("frac(a+b, c", "unbalanced-grouping")[0];
  assert.equal(problem.offset, "frac(a+b, c".length);
  assert.deepEqual(parseProblems("sqrt(x").map(({ code }) => code), ["unbalanced-grouping"]);
  assert.deepEqual(parseProblems("a ) b").map(({ code }) => code), ["unexpected-token"]);
});

test("ragged matrices point at the offending row", () => {
  const problems = problemsIndexed("matrix [[a, b], [c]]", "ragged-matrix");
  assert.equal(problems.length, 1);
  assert.equal(problems[0].offset, 17);
  assert.equal(problems[0].length, 1);
  assert.match(problems[0].message, /2 cells/);
});

test("empty matrix cells and case branches diagnose precisely", () => {
  assert.deepEqual(
    parseProblems("matrix [[a,], [b, c]]").map(({ code }) => code),
    ["empty-cell"],
  );
  const cell = problemsIndexed("matrix [[a,], [b, c]]", "empty-cell")[0];
  assert.equal(cell.offset, 11);
  assert.deepEqual(
    parseProblems("matrix [[]]").map(({ code }) => code),
    ["empty-cell"],
  );
  assert.deepEqual(
    parseProblems("cases(; x when y)").map(({ code }) => code),
    ["empty-branch"],
  );
});

test("missing operands across constructs stay stable-coded", () => {
  assert.deepEqual(parseProblems("x +").map(({ code }) => code), ["missing-operand"]);
  assert.deepEqual(parseProblems("()").map(({ code }) => code), ["missing-operand"]);
  assert.deepEqual(parseProblems("vector []").map(({ code }) => code), ["missing-operand"]);
  assert.deepEqual(parseProblems("x + sin").map(({ code }) => code), ["missing-operand"]);
  assert.deepEqual(parseProblems("sqrt()").map(({ code }) => code), ["missing-operand"]);
});

test("integral differentials must be present and match the bound variable", () => {
  assert.deepEqual(
    parseProblems("integral x=0..1 of x^2").map(({ code }) => code),
    ["missing-integration-variable"],
  );
  assert.deepEqual(
    parseProblems("integral x=0..1 of f(t) dt").map(({ code }) => code),
    ["differential-mismatch"],
  );
  const mismatch = problemsIndexed("integral x=0..1 of f(t) dt", "differential-mismatch");
  assert.equal(mismatch.length, 1);
  assert.equal(mismatch[0].offset, 24);
  assert.match(mismatch[0].message, /x/);
  assert.match(mismatch[0].message, /t/);
});

test("unknown and reserved words carry suggestions", () => {
  const unknown = problemsIndexed("mass = 5", "unknown-word");
  assert.equal(unknown.length, 1);
  assert.equal(unknown[0].offset, 0);
  assert.equal(unknown[0].data?.word, "mass");
  assert.ok(unknown[0].suggestion);
  const reserved = problemsIndexed("sum alpha=1..3 of x_alpha", "reserved-identifier");
  assert.equal(reserved.length, 1);
  assert.equal(reserved[0].offset, 4);
  assert.ok(reserved[0].suggestion);
});

test("binders must have an of clause with the splat spelling", () => {
  assert.deepEqual(
    parseProblems("sum i=1..n x_i").map(({ code }) => code),
    ["missing-of-clause"],
  );
  assert.deepEqual(
    parseProblems("forall x in S x").map(({ code }) => code),
    ["missing-of-clause"],
  );
});

test("additive directly after an of operand warns but stays valid", () => {
  const result = parseOk("sum i=1..n of i^2 + 1");
  assert.deepEqual(
    result.warnings.map(({ code }) => code),
    ["additive-after-of"],
  );
  assert.equal(result.warnings[0]?.offset, 18);
  assert.equal(parseOk("sum i=1..n of (i^2 + 1)").warnings.length, 0);
});

test("shadowed bound variables warn but stay valid", () => {
  const result = parseOk("sum i=1..2 of sum i=1..3 of a_ij");
  assert.deepEqual(result.warnings.map(({ code }) => code), ["shadowed-bound-variable"]);
  assert.equal(result.warnings[0]?.offset, 18);
  assert.equal(parseOk("sum i=1..2 of sum j=1..3 of a_ij").warnings.length, 0);
});

test("limit requires its target", () => {
  assert.deepEqual(
    parseProblems("limit x of x").map(({ code }) => code),
    ["unexpected-token"],
  );
});

test("undefined `..` outside bound clauses is refused", () => {
  assert.deepEqual(parseProblems("x .. y").map(({ code }) => code), ["unexpected-token"]);
});

test("the quadratic-formula step parses natively", () => {
  const body = "x = (-b +- sqrt(b^2 - 4 * a * c)) / (2 * a)";
  assert.equal("tree" in parseNativeMath(body), true);
  assert.equal(
    tex(body),
    "x = \\left(-b \\pm \\sqrt{b^{2} - 4 * a * c}\\right) / \\left(2 * a\\right)",
  );
});

test("the RC piecewise response parses natively", () => {
  const body = "v(t) = cases(0 when t < 0; V0 * (1 - exp(-(t / (R * C)))) when t >= 0)";
  assert.equal("tree" in parseNativeMath(body), true);
});

test("the worked derivation steps parse natively", () => {
  const bodies = [
    "S_n = sum i=0..n of r^i",
    "r * S_n = sum i=1..n+1 of r^i",
    "S_n - r * S_n = 1 - r^(n+1)",
    "S_n = (1 - r^(n+1)) / (1 - r)",
    "limit n->infinity of S_n = 1 / (1 - r)",
  ];
  for (const body of bodies) {
    assert.equal("tree" in parseNativeMath(body), true, body);
  }
});

test("canonical spelling round-trips idempotently", () => {
  for (const body of [
    "x + y",
    "S_n = sum i=0..n of r^i",
    "v(t) = cases(0 when t < 0; V0 * (1 - exp(-(t / (R * C)))) when t >= 0)",
    "integral x=0..infinity of exp(-x^2) dx = sqrt(pi)",
    "matrix [[a, b], [c, d]]",
    "x = (-b +- sqrt(b^2 - 4 * a * c)) / (2 * a)",
    "0 <= x < 1",
  ]) {
    const once = spelling(body);
    const twice = spelling(once);
    assert.equal(twice, once, body);
    assert.deepEqual(projection(once), projection(body), body);
    assert.equal(treeToTex(tree(once)), treeToTex(tree(body)), body);
  }
});

test("math ceilings are stable-coded parse errors", () => {
  const deep = `${"(".repeat(MAX_MATH_NESTING_DEPTH + 1)}x${")".repeat(MAX_MATH_NESTING_DEPTH + 1)}`;
  const nesting = problemsIndexed(deep, "limit-exceeded");
  assert.equal(nesting.length, 1);
  assert.equal(nesting[0].offset, MAX_MATH_NESTING_DEPTH);
  assert.equal(nesting[0].data?.limit, MAX_MATH_NESTING_DEPTH);
  assert.equal(parseNativeMath(`${"(".repeat(MAX_MATH_NESTING_DEPTH)}x${")".repeat(MAX_MATH_NESTING_DEPTH)}`).tree !== undefined, true);

  const branches = Array.from({ length: MAX_CASES_BRANCHES + 1 }, (_, index) => `${index} when x > 0`).join("; ");
  assert.deepEqual(
    parseProblems(`cases(${branches})`).map(({ code }) => code),
    ["limit-exceeded"],
  );
  assert.equal(
    parseNativeMath(`cases(${Array.from({ length: MAX_CASES_BRANCHES }, (_, index) => `${index} when x > 0`).join("; ")})`).tree !== undefined,
    true,
  );

  const wideRow = Array.from({ length: MAX_MATRIX_DIMENSION + 1 }, (_, index) => `${index}`).join(",");
  assert.deepEqual(
    parseProblems(`matrix [[${wideRow}]]`).map(({ code }) => code),
    ["limit-exceeded"],
  );
  const tall = Array.from({ length: MAX_MATRIX_DIMENSION + 1 }, () => "[0]").join(",");
  assert.deepEqual(
    parseProblems(`matrix [${tall}]`).map(({ code }) => code),
    ["limit-exceeded"],
  );
  assert.equal(
    parseNativeMath(`matrix [${Array.from({ length: MAX_MATRIX_DIMENSION }, () => "[0]").join(",")}]`).tree !== undefined,
    true,
  );
});

test("unaccepted Unicode is refused without silent fallback", () => {
  assert.deepEqual(parseProblems("sum x=1..3 of x + ½").map(({ code }) => code), ["unsupported-notation"]);
  assert.deepEqual(parseProblems("∑ x").map(({ code }) => code), ["unsupported-notation"]);
});