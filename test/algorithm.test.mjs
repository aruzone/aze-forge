import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_ALGORITHM_NESTING_DEPTH,
  MAX_ALGORITHM_PARAMETERS,
  MAX_ALGORITHM_STATEMENTS,
  MAX_PSEUDOCODE_EXPRESSION_LENGTH,
  parseAlgorithmBody,
  renderAlgorithmFragment,
} from "../dist/algorithm.js";
import { sourceLines } from "../dist/source-map.js";

const BLOCK_RANGE = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 400, column: 1, offset: 9000 },
};

function parse(body) {
  return parseAlgorithmBody({
    bodyLines: sourceLines(body.endsWith("\n") ? body : `${body}\n`),
    blockRange: BLOCK_RANGE,
    sourceName: "algorithm.aze.md",
    parseInline: (text) => [{ kind: "text", value: text }],
  });
}

function found(result, code) {
  return result.diagnostics.filter(
    (diagnostic) => diagnostic.code === `azeforge.algorithm#${code}`,
  );
}

function one(result, code) {
  const matches = found(result, code);
  assert.equal(
    matches.length,
    1,
    `expected one ${code}, saw [${result.diagnostics
      .map((diagnostic) => diagnostic.code)
      .join(", ")}]`,
  );
  return matches[0];
}

/** The §16 binary search: a while/if ladder over one indexing level. */
const BINARY_SEARCH = `procedure: BinarySearch
parameters:
  - A
  - target
steps:
  - text: invariant: A is sorted ascending
  - assign: lo = 0
  - assign: hi = length(A) - 1
  - while: lo <= hi
    do:
      - assign: mid = floor((lo + hi) / 2)
      - if: A[mid] == target
        then:
          - return: mid
        else-if: A[mid] < target
        then:
          - assign: lo = mid + 1
        else:
          - assign: hi = mid - 1
  - return: -1`;

function binarySearchBlock() {
  const result = parse(BINARY_SEARCH);
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.body !== undefined);
  return result.body;
}

/* ------------------------------------------------------------------ *
 * The authored tree (contract: issue #66 §§5–6, §16)
 * ------------------------------------------------------------------ */

test("algorithm: the binary-search procedure keeps the authored statement tree", () => {
  const body = binarySearchBlock();
  assert.equal(body.procedure, "BinarySearch");
  assert.deepEqual(body.parameters, ["A", "target"]);

  const steps = body.steps;
  assert.deepEqual(
    steps.map((statement) => statement.kind),
    ["text", "assign", "assign", "while", "return"],
  );
  assert.deepEqual(steps[0].text, [
    { kind: "text", value: "invariant: A is sorted ascending" },
  ]);
  assert.equal(steps[1].target, "lo");
  assert.equal(steps[1].expression, "0");
  assert.equal(steps[2].expression, "length(A) - 1");
  assert.equal(steps[4].expression, "-1");

  const loop = steps[3];
  assert.equal(loop.condition, "lo <= hi");
  assert.deepEqual(
    loop.statements.map((statement) => statement.kind),
    ["assign", "if"],
  );
  assert.equal(loop.statements[0].expression, "floor((lo + hi) / 2)");

  const branch = loop.statements[1];
  assert.equal(branch.condition, "A[mid] == target");
  assert.deepEqual(
    branch.then.map((statement) => [statement.kind, statement.expression]),
    [["return", "mid"]],
  );
  assert.deepEqual(
    branch.elseIf.map((alternative) => [
      alternative.condition,
      alternative.statements.map((statement) => [statement.kind, statement.target, statement.expression]),
    ]),
    [["A[mid] < target", [["assign", "lo", "mid + 1"]]]],
  );
  assert.deepEqual(
    branch.else.map((statement) => [statement.kind, statement.target, statement.expression]),
    [["assign", "hi", "mid - 1"]],
  );

  // The record tree carries every authored statement: 5 top-level statements
  // and 10 in total, each ranged on the line it was authored on.
  const total = (statements) =>
    statements.reduce(
      (sum, statement) =>
        sum +
        1 +
        (statement.kind === "if"
          ? total(statement.then) +
            statement.elseIf.reduce(
              (inner, alternative) => inner + total(alternative.statements),
              0,
            ) +
            (statement.else === undefined ? 0 : total(statement.else))
          : statement.kind === "while" || statement.kind === "for"
            ? total(statement.statements)
            : 0),
      0,
    );
  assert.equal(total(steps), 10);
  assert.equal(branch.then[0].range.start.line, 14);
  assert.equal(branch.else[0].range.start.line, 19);
  assert.equal(steps[0].range.start.line, 6);
});

/* ------------------------------------------------------------------ *
 * The fragment (contract: issue #66 §15)
 * ------------------------------------------------------------------ */

test("algorithm: the fragment renders nested ordered lists, one item per statement", () => {
  const body = binarySearchBlock();
  const html = renderAlgorithmFragment(
    {
      kind: "algorithm",
      procedure: body.procedure,
      parameters: body.parameters,
      steps: body.steps,
      range: BLOCK_RANGE,
      id: "binary-search",
      number: true,
      caption: [{ kind: "text", value: "Binary search over a sorted array" }],
      numberLabel: "Algorithm 1",
      pluginVersion: "1.0.0",
    },
    { renderBlocks: () => "" },
  );

  assert.ok(
    html.startsWith(
      '<figure class="aze-algorithm" data-algorithm-id="binary-search" data-algorithm-number="true">',
    ),
    html.slice(0, 120),
  );
  assert.ok(
    html.includes(
      '<figcaption><span class="aze-number">Algorithm 1</span> Binary search over a sorted array</figcaption>',
    ),
  );
  assert.ok(html.includes(">procedure</span>"));
  assert.ok(html.includes(">BinarySearch</span>(<span"));
  assert.ok(html.includes(">A</span>, <span"));
  assert.ok(
    html.includes(
      '<li class="aze-algorithm-statement aze-algorithm-text">invariant: A is sorted ascending</li>',
    ),
  );
  assert.ok(
    html.includes('<span class="aze-algorithm-keyword">while</span>'),
    "keyword spans",
  );

  // One item per statement, and one nested list per authored branch: the
  // while body, the if `then:`, its `else-if:` `then:` and its `else:`.
  assert.equal((html.match(/<li class="aze-algorithm-statement/g) ?? []).length, 10);
  const branches = html.match(/<ol class="aze-algorithm-branch">/g) ?? [];
  assert.equal(branches.length, 4);
  assert.ok(html.includes('<span class="aze-algorithm-keyword">else-if</span>'));
  assert.ok(html.includes('<span class="aze-algorithm-keyword">downto</span>') === false);

  // The authored id becomes a data attribute, never an element id.
  assert.equal(html.includes(' id="'), false);
});

test("algorithm: a caption-less, unnumbered block omits the figcaption", () => {
  const body = binarySearchBlock();
  const html = renderAlgorithmFragment(
    {
      kind: "algorithm",
      procedure: body.procedure,
      parameters: [],
      steps: [],
      range: BLOCK_RANGE,
      pluginVersion: "1.0.0",
    },
    { renderBlocks: () => "" },
  );
  assert.equal(html.includes("<figcaption>"), false);
  assert.ok(html.startsWith('<figure class="aze-algorithm">'));
  assert.ok(html.includes(">BinarySearch</span>()"));
});

/* ------------------------------------------------------------------ *
 * The closed statement set (contract: issue #66 §5, §10)
 * ------------------------------------------------------------------ */

test("algorithm: a statement outside the six forms is refused with the allowed set named", () => {
  const result = parse(`procedure: Search
steps:
  - foreach: x in A
    do:
      - return: x`);
  const diagnostic = one(result, "unknown-statement");
  assert.match(diagnostic.suggestion, /`assign:`/);
  assert.match(diagnostic.suggestion, /`text:`/);
  assert.equal(result.body, undefined);
});

test("algorithm: a bare `=` in a condition is the assignment diagnostic", () => {
  const body = `procedure: P
steps:
  - if: lo = hi
    then:
      - return: 1`;
  const result = parse(body);
  const diagnostic = one(result, "assignment-in-condition");
  assert.match(diagnostic.message, /`==`/);
  const match = body.split("\n")[2];
  assert.equal(diagnostic.location.range.start.line, 3);
  assert.equal(diagnostic.location.range.start.column, match.indexOf("=") + 1);
  assert.equal(
    diagnostic.location.range.end.column,
    match.indexOf("=") + 2,
    "the range covers the offending `=` alone",
  );
});

test("algorithm: an assignment target is a name or one indexing level", () => {
  const compound = parse(`procedure: P
steps:
  - assign: 2 * n = x`);
  assert.match(one(compound, "invalid-assign-target").message, /assignable name/);

  const deep = parse(`procedure: P
steps:
  - assign: A[i][j] = 0`);
  assert.match(one(deep, "invalid-assign-target").message, /one indexing level/);

  const indexed = parse(`procedure: P
steps:
  - assign: A[mid] = B[i + 1]`);
  assert.deepEqual(indexed.diagnostics, []);
  assert.equal(indexed.body.steps[0].target, "A");
  assert.equal(indexed.body.steps[0].index, "mid");
  assert.equal(indexed.body.steps[0].expression, "B[i + 1]");
});

test("algorithm: `while:` without `do:` and `if:` without `then:` have no body", () => {
  const loop = parse(`procedure: P
steps:
  - while: lo <= hi
  - return: 1`);
  const loopDiagnostic = one(loop, "missing-body");
  assert.match(loopDiagnostic.message, /`do:`/);

  const branch = parse(`procedure: P
steps:
  - if: lo < hi`);
  assert.match(one(branch, "missing-body").message, /`then:`/);

  const empty = parse(`procedure: P
steps:
  - if: lo < hi
    then:
  - return: 1`);
  assert.equal(found(empty, "missing-body").length, 1);
});

/* ------------------------------------------------------------------ *
 * The pseudocode expression context (contract: issue #66 §6)
 * ------------------------------------------------------------------ */

test("algorithm: a token outside the expression context is refused at its own offset", () => {
  const body = `procedure: P
steps:
  - assign: x = a % b`;
  const result = parse(body);
  const diagnostic = one(result, "unknown-expression-token");
  const expression = body.split("\n")[2];
  assert.equal(diagnostic.location.range.start.column, expression.indexOf("%") + 1);
  assert.equal(diagnostic.location.range.end.column, expression.indexOf("%") + 2);
});

test("algorithm: whitespace reflow does not change the canonical spelling", () => {
  const tight = parse(`procedure: P
steps:
  - assign: x = a+b*2
  - assign: y = not(a and b)or c
  - assign: z = floor ( ( lo + hi ) / 2 )`);
  const loose = parse(`procedure: P
steps:
  - assign: x =   a  +  b  *  2
  - assign: y = not (a and b) or c
  - assign: z = floor((lo + hi) / 2)`);
  assert.deepEqual(tight.diagnostics, []);
  assert.deepEqual(loose.diagnostics, []);
  assert.deepEqual(
    tight.body.steps.map((statement) => statement.expression),
    loose.body.steps.map((statement) => statement.expression),
  );
  assert.deepEqual(
    tight.body.steps.map((statement) => statement.expression),
    ["a + b * 2", "not (a and b) or c", "floor((lo + hi) / 2)"],
  );
});

test("algorithm: the six statement forms parse, including `for:` bounds and `by`", () => {
  const result = parse(`procedure: Sum
parameters:
  - A
steps:
  - for: i = 0 to length(A) - 1 by 2
    do:
      - assign: total = total + A[i]
  - for: j = n downto 0
    do:
      - return:`);
  assert.deepEqual(result.diagnostics, []);
  const [ascending, descending] = result.body.steps;
  assert.deepEqual(
    [ascending.variable, ascending.from, ascending.direction, ascending.to, ascending.by],
    ["i", "0", "to", "length(A) - 1", "2"],
  );
  assert.deepEqual(
    [descending.variable, descending.direction, descending.to],
    ["j", "downto", "0"],
  );
  assert.equal(descending.statements[0].expression, undefined);
});

test("algorithm: a `for:` header that is not `var = start to|downto end` is refused", () => {
  const result = parse(`procedure: P
steps:
  - for: i = 0
    do:
      - return: 1`);
  assert.match(one(result, "missing-for-header").message, /`to` or `downto`/);
});

/* ------------------------------------------------------------------ *
 * Ceilings (contract: issue #66 §13)
 * ------------------------------------------------------------------ */

test("algorithm: every ceiling reports through limit-exceeded", () => {
  const parameters = Array.from(
    { length: MAX_ALGORITHM_PARAMETERS + 1 },
    (_, index) => `  - p${index}`,
  ).join("\n");
  const parameterResult = parse(
    `procedure: P\nparameters:\n${parameters}\nsteps:\n  - return:`,
  );
  const parameterDiagnostic = one(parameterResult, "limit-exceeded");
  assert.deepEqual(parameterDiagnostic.data, {
    subject: "parameters",
    count: MAX_ALGORITHM_PARAMETERS + 1,
    limit: MAX_ALGORITHM_PARAMETERS,
  });

  const statements = Array.from(
    { length: MAX_ALGORITHM_STATEMENTS + 1 },
    (_, index) => `  - assign: x${index} = ${index}`,
  ).join("\n");
  const statementResult = parse(`procedure: P\nsteps:\n${statements}`);
  assert.deepEqual(one(statementResult, "limit-exceeded").data, {
    subject: "statements",
    count: MAX_ALGORITHM_STATEMENTS + 1,
    limit: MAX_ALGORITHM_STATEMENTS,
  });

  const nested = (level) => {
    const indent = " ".repeat(4 * level - 2);
    if (level > MAX_ALGORITHM_NESTING_DEPTH) return `${indent}- assign: a = 1`;
    return [
      `${indent}- while: a < b`,
      `${" ".repeat(indent.length + 2)}do:`,
      nested(level + 1),
    ].join("\n");
  };
  const depthResult = parse(`procedure: P\nsteps:\n${nested(1)}`);
  assert.deepEqual(one(depthResult, "limit-exceeded").data, {
    subject: "nesting-depth",
    count: MAX_ALGORITHM_NESTING_DEPTH + 1,
    limit: MAX_ALGORITHM_NESTING_DEPTH,
  });

  const long = parse(
    `procedure: P\nsteps:\n  - assign: x = ${"a".repeat(
      MAX_PSEUDOCODE_EXPRESSION_LENGTH + 1,
    )}`,
  );
  assert.deepEqual(one(long, "limit-exceeded").data, {
    subject: "expression-length",
    count: MAX_PSEUDOCODE_EXPRESSION_LENGTH + 1,
    limit: MAX_PSEUDOCODE_EXPRESSION_LENGTH,
  });
});

test("algorithm: the expression ceiling covers every expression position", () => {
  const over = "a".repeat(MAX_PSEUDOCODE_EXPRESSION_LENGTH + 1);
  const atLimit = "a".repeat(MAX_PSEUDOCODE_EXPRESSION_LENGTH);
  const positions = (expression) => [
    `procedure: P\nsteps:\n  - for: i = 0 to ${expression}\n    do:\n      - return:`,
    `procedure: P\nsteps:\n  - for: i = 0 to n by ${expression}\n    do:\n      - return:`,
    `procedure: P\nsteps:\n  - assign: A[${expression}] = 0`,
  ];

  for (const body of positions(over)) {
    const result = parse(body);
    const diagnostic = one(result, "limit-exceeded");
    assert.deepEqual(diagnostic.data, {
      subject: "expression-length",
      count: over.length,
      limit: MAX_PSEUDOCODE_EXPRESSION_LENGTH,
    });
    assert.equal(
      diagnostic.location.range.end.column - diagnostic.location.range.start.column,
      over.length,
      "the range covers the offending expression",
    );
    assert.equal(result.body, undefined);
  }

  for (const body of positions(atLimit)) {
    const result = parse(body);
    assert.deepEqual(result.diagnostics, []);
    assert.ok(result.body !== undefined);
  }
});

/* ------------------------------------------------------------------ *
 * The body declaration rules (contract: issue #52 §4)
 * ------------------------------------------------------------------ */

test("algorithm: an empty or incomplete body publishes no Block", () => {
  for (const body of [
    "procedure: P\nsteps:",
    "steps:\n  - return:",
    "procedure: P",
    "procedure: P\nsteps:\n  - text:",
    "procedure: P\nsteps:\n  -",
  ]) {
    const result = parse(body);
    assert.ok(
      result.body === undefined && result.diagnostics.length > 0,
      `expected a refused body for ${JSON.stringify(body)}`,
    );
  }
});

test("algorithm: an unknown or duplicated body field is refused", () => {
  const unknown = parse(`procedure: P\nprocedur: Q\nsteps:\n  - return:`);
  assert.match(one(unknown, "unknown-field").message, /"procedur" is not supported/);

  const duplicate = parse(`procedure: P\nprocedure: Q\nsteps:\n  - return:`);
  assert.match(one(duplicate, "unknown-field").message, /declared twice/);
});
