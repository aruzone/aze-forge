import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createCompiler } from "../dist/index.js";
import { parseExampleBody, renderExampleFragment } from "../dist/example.js";
import { rangeFromLines, sourceLines } from "../dist/source-map.js";

const FRONT_MATTER = "---\nazemark: 2\n---\n\n";

function codes(result) {
  return result.diagnostics
    .filter((diagnostic) => diagnostic.severity === "error")
    .map((diagnostic) => diagnostic.code);
}

function exampleIn(source) {
  const parsed = createCompiler().parse(source);
  return {
    parsed,
    example: parsed.document.blocks.find((block) => block.kind === "example"),
  };
}

function inlineText(nodes) {
  return nodes
    .map((node) => {
      if (node.kind === "text" || node.kind === "code") return node.value;
      if (node.children !== undefined) return inlineText(node.children);
      return "";
    })
    .join("");
}

function paragraphText(blocks) {
  return blocks
    .filter((block) => block.kind === "paragraph")
    .map((block) => inlineText(block.children))
    .join("\n");
}

/** Drive the pure body parser over an authored body with real SourceLines. */
function body(parseBlocks, text) {
  const lines = sourceLines(text);
  return parseExampleBody({
    header: { diagnostics: [] },
    bodyLines: lines,
    blockRange: rangeFromLines(lines[0], lines[lines.length - 1]),
    sourceName: "example.aze.md",
    parseBlocks,
  });
}

async function exampleFromDoc(name, opening) {
  const text = await readFile(
    new URL(`../docs/language/${name}`, import.meta.url),
    "utf8",
  );
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === opening);
  const end = lines.findIndex((line, index) => index > start && line.trim() === "::::");
  assert.ok(start >= 0 && end > start, `expected a ${opening} block in ${name}`);
  return { text, lines, source: `${FRONT_MATTER}${lines.slice(start, end + 1).join("\n")}\n` };
}

test("the cooling-model example parses into problem, givens, steps and result", async () => {
  const { source } = await exampleFromDoc(
    "05-composition-report.aze.md",
    ":::: example",
  );
  const { parsed, example } = exampleIn(source);
  assert.deepEqual(parsed.diagnostics, []);
  assert.equal(example?.kind, "example");
  if (example?.kind !== "example") return;

  assert.equal(example.id, "cooling-model");
  assert.equal(example.number, true);
  assert.equal(
    inlineText(example.caption),
    "Deriving the exponential cooling model",
  );

  // Problem: one Markdown paragraph, unchanged.
  assert.match(paragraphText(example.problem), /Water cools from/);

  // Givens: an ordered collection of single-line text items.
  assert.deepEqual(example.givens, [
    "ambient temperature held constant",
    "Newton cooling law with unknown constant k",
  ]);

  // Steps: two ordered records; their mathematics is nested Block content.
  assert.equal(example.steps.length, 2);
  const [first, second] = example.steps;
  const firstKinds = first.text.map((block) => block.kind);
  assert.deepEqual(firstKinds, ["paragraph", "derivation"]);
  const derivation = first.text.find((block) => block.kind === "derivation");
  assert.equal(derivation.steps.length, 3);
  assert.deepEqual(
    derivation.steps.map((step) => step.expression),
    [
      "T(t) = T_amb + (T_0 - T_amb) * exp(-k * t)",
      "338.4 = 295 + 49.2 * exp(-300 * k)",
      "k = -ln((338.4 - 295) / 49.2) / 300",
    ],
  );
  const secondKinds = second.text.map((block) => block.kind);
  assert.deepEqual(secondKinds, ["paragraph", "equation"]);
  assert.ok(first.range.start.line < second.range.start.line);

  // Result: one Markdown paragraph.
  assert.match(paragraphText(example.result ?? []), /T\(600\) ~= 333\.1 K/);

  // Step order survives authoring order.
  assert.match(paragraphText(first.text), /Solve the law with the initial condition/);
  assert.match(paragraphText(second.text), /Evaluate at t = 600 s/);
});

test("the cooling-model example renders figure, labels, givens and step groups", async () => {
  const { source } = await exampleFromDoc(
    "05-composition-report.aze.md",
    ":::: example",
  );
  const result = await createCompiler().compile(source, {
    format: "html",
    sourceName: "05-composition-report.aze.md",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.artifact);
  const html = new TextDecoder().decode(result.artifact.bytes);

  assert.match(html, /<figure class="aze-example" data-example-id="cooling-model"/);
  assert.match(html, /data-example-number="true"/);
  assert.match(html, /class="aze-example-problem"><p class="aze-example-label">Problem<\/p>/);
  assert.match(html, /<ul class="aze-example-givens"><li>ambient temperature held constant<\/li>/);
  assert.match(html, /class="aze-example-result"><p class="aze-example-label">Result<\/p>/);
  assert.equal(html.match(/class="aze-example-step"/g).length, 2);

  // Each step group keeps its own nested mathematics; the example only composes.
  const groups = html.split('<li class="aze-example-step">').slice(1);
  assert.match(groups[0], /class="aze-derivation"/);
  assert.match(groups[1], /class="aze-equation"/);
});

test("a whitespace-only step reports azeforge.example#empty-step", async () => {
  const { text } = await exampleFromDoc(
    "06-corrective-diagnostics.aze.md",
    ":::: example",
  );
  const parsed = createCompiler().parse(text, {
    sourceName: "06-corrective-diagnostics.aze.md",
  });
  const emptySteps = parsed.diagnostics.filter(
    (diagnostic) => diagnostic.code === "azeforge.example#empty-step",
  );
  assert.equal(emptySteps.length, 1);
  const { line } = emptySteps[0].location.range.start;
  const physical = text.split(/\r?\n/)[line - 1];
  assert.notEqual(physical, "");
  assert.equal(physical.trim(), "");
});

test("a whitespace-only step is the only error of its own Block", () => {
  const result = body(
    () => [],
    [
      "problem: A trivial problem.",
      "steps:",
      "  - text: |",
      "      ",
      "result: Nothing to report.",
    ].join("\n"),
  );
  assert.equal(result.body, undefined);
  assert.deepEqual(codes(result), ["azeforge.example#empty-step"]);
  const { range } = result.diagnostics[0].location;
  assert.equal(range.start.line, 4);
  assert.equal(range.start.column, 1);
  assert.deepEqual(result.diagnostics[0].data, {});
});

test("absent problem: and steps: report their own codes", () => {
  const authored = "givens:\n  - only a given\n";
  const result = body(() => [], authored);
  assert.equal(result.body, undefined);
  assert.deepEqual(codes(result), [
    "azeforge.example#missing-problem",
    "azeforge.example#missing-steps",
  ]);
  assert.equal(
    result.diagnostics.filter(
      (diagnostic) => diagnostic.code === "azeforge.example#missing-steps",
    ).length,
    1,
  );

  const parsed = createCompiler().parse(
    `${FRONT_MATTER}:::: example\nid: bare\n----\n${authored}::::\n`,
    { sourceName: "bare.aze.md" },
  );
  const reported = parsed.diagnostics.map((diagnostic) => diagnostic.code);
  assert.ok(reported.includes("azeforge.example#missing-problem"));
  assert.ok(reported.includes("azeforge.example#missing-steps"));
});

test("a present-but-empty problem: or result: value is an empty value", () => {
  const result = body(
    () => [],
    [
      "problem: |",
      "  ",
      "steps:",
      "  - text: Do it.",
      "result: |",
    ].join("\n"),
  );
  assert.equal(result.body, undefined);
  assert.deepEqual(codes(result), [
    "azeforge.example#empty-value",
    "azeforge.example#empty-value",
  ]);
  assert.deepEqual(
    result.diagnostics.map((diagnostic) => diagnostic.data),
    [{ field: "problem" }, { field: "result" }],
  );
});

test("step order is the authored order", () => {
  const seen = [];
  const result = body((lines) => {
    seen.push(lines.map((line) => line.text).join("\n"));
    return [];
  }, [
    "problem: Which step is first?",
    "steps:",
    "  - text: first step body",
    "  - text: |",
    "      second step body",
    "  - text: third step body",
    "result: done",
  ].join("\n"));
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(seen, [
    "Which step is first?",
    "first step body",
    "second step body",
    "third step body",
    "done",
  ]);
  assert.deepEqual(
    result.body.steps.map((step) => step.range.start.line),
    [3, 4, 6],
  );
});

test("| content dedents one structural level with accurate source offsets", () => {
  const text = [
    "problem: |",
    "  Prove the identity.",
    "givens:",
    "  - the identity holds for every real x",
    "  - the limit exists",
    "steps:",
    "  - text: |",
    "      Solve it:",
    "",
    "      :: equation",
    "      ----",
    "      x = 1",
    "      ::",
    "result: Done.",
  ].join("\n");
  const received = [];
  const result = body((lines) => {
    received.push(lines);
    return [];
  }, text);
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(
    received[0].map((line) => line.text),
    ["Prove the identity."],
  );
  assert.deepEqual(
    received[1].map((line) => line.text),
    ["Solve it:", "", ":: equation", "----", "x = 1", "::"],
  );
  // The synthetic lines still point at their real source text.
  const equation = received[1][2];
  assert.equal(equation.number, 10);
  assert.equal(equation.startOffset, text.indexOf(":: equation"));
  const inner = received[1][4];
  assert.equal(inner.startOffset, text.indexOf("x = 1"));
  assert.equal(inner.endOffset, text.indexOf("x = 1") + "x = 1".length);
  assert.deepEqual(result.body.givens, [
    "the identity holds for every real x",
    "the limit exists",
  ]);
  assert.deepEqual(
    received.at(-1).map((line) => line.text),
    ["Done."],
  );
});

test("a failed nested parse invalidates the Block", () => {
  const result = body(
    () => undefined,
    ["problem: A problem.", "steps:", "  - text: One step."].join("\n"),
  );
  assert.equal(result.body, undefined);
  assert.deepEqual(result.diagnostics, []);
});

test("steps beyond the ceiling report one limit diagnostic", () => {
  const stepLines = [];
  for (let index = 0; index < 65; index += 1) {
    stepLines.push(`  - text: step ${index + 1}`);
  }
  const result = body(
    () => [],
    ["problem: Too many steps.", "steps:", ...stepLines].join("\n"),
  );
  assert.equal(result.body, undefined);
  const limits = result.diagnostics.filter(
    (diagnostic) => diagnostic.code === "azeforge.example#limit-exceeded",
  );
  assert.equal(limits.length, 1);
  assert.deepEqual(limits[0].data, {
    subject: "step count",
    count: 65,
    limit: 64,
  });
});

test("renderExampleFragment labels the sections and never emits the authored id", () => {
  const range = {
    start: { line: 1, column: 1, offset: 0 },
    end: { line: 1, column: 1, offset: 0 },
  };
  const problem = [{ kind: "invalid", value: "problem" }];
  const step = [{ kind: "invalid", value: "step" }];
  const result = [{ kind: "invalid", value: "result" }];
  const rendered = [];
  const fragment = renderExampleFragment(
    {
      kind: "example",
      id: "cooling-model",
      number: true,
      numberLabel: "Example 1",
      caption: [{ kind: "text", value: "Deriving the exponential cooling model" }],
      problem,
      givens: ["ambient temperature held constant"],
      steps: [{ text: step, range }],
      result,
      range,
      pluginVersion: "1.0.0",
    },
    {
      sourceName: "example.aze.md",
      renderBlocks: (blocks) => {
        rendered.push(blocks);
        return "<p>body</p>";
      },
    },
  );

  assert.match(fragment, /^<figure class="aze-example" data-example-id="cooling-model" data-example-number="true">/);
  assert.match(
    fragment,
    /<figcaption><span class="aze-number">Example 1<\/span> Deriving the exponential cooling model<\/figcaption>/,
  );
  assert.match(fragment, /<section class="aze-example-problem"><p class="aze-example-label">Problem<\/p><p>body<\/p><\/section>/);
  assert.match(fragment, /<ul class="aze-example-givens"><li>ambient temperature held constant<\/li><\/ul>/);
  assert.match(fragment, /<ol class="aze-example-steps"><li class="aze-example-step"><p>body<\/p><\/li><\/ol>/);
  assert.match(fragment, /<section class="aze-example-result"><p class="aze-example-label">Result<\/p><p>body<\/p><\/section>/);
  assert.doesNotMatch(fragment, /\sid="/);
  assert.doesNotMatch(fragment, /data-example-number="false"/);
  assert.deepEqual(rendered, [problem, step, result]);

  const bare = renderExampleFragment(
    {
      kind: "example",
      problem,
      givens: [],
      steps: [],
      range,
      pluginVersion: "1.0.0",
    },
    { renderBlocks: () => "<p>body</p>" },
  );
  assert.match(bare, /^<figure class="aze-example"><section class="aze-example-problem">/);
  assert.doesNotMatch(bare, /figcaption|aze-example-number|aze-example-steps/);
});
