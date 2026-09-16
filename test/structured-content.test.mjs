import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createCompiler } from "../dist/index.js";

/**
 * Structured technical content (contract: issue #66): typed tables, algorithms,
 * statements with proofs and worked examples, driven through the real compiler
 * against the owner-approved authoring forms in `docs/language/`.
 */

const DOC_URL = new URL(
  "../docs/language/11-structured-content.aze.md",
  import.meta.url,
);

async function scenarioSource() {
  return readFile(DOC_URL, "utf8");
}

function envelope(source) {
  return `---\nazemark: 2\n---\n\n${source.trimEnd()}\n`;
}

async function compile(source, format = "html") {
  return createCompiler().compile(source, { format, sourceName: "content.aze.md" });
}

async function html(source) {
  const result = await compile(source);
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.artifact);
  return new TextDecoder().decode(result.artifact.bytes);
}

function codes(result) {
  return result.diagnostics.map(({ code }) => code);
}

function table(columns, rows, extra = "") {
  return `:::: table
id: sample
----
columns:
${columns}
${extra}rows:
${rows}
::::
`;
}

test("typed tables declare closed column types, units, alignment and groups", async () => {
  const source = await scenarioSource();
  const rendered = await html(source);

  // Grouped header: a colgroup span over the two adjacent temperature columns,
  // and every column header still carries its own `scope=col`.
  assert.match(
    rendered,
    /<th scope="colgroup" colspan="2" id="[^"]+">Temperature<\/th>/,
  );
  assert.match(rendered, /<th scope="col" id="[^"]+">Start temp<\/th>/);
  assert.match(rendered, /<th scope="col" id="[^"]+">End temp<\/th>/);
  // The subordinate header row contains only columns under a header group.
  // Ungrouped columns occupy both rows through `rowspan=2`.
  assert.match(
    rendered,
    /<thead><tr><th rowspan="2" scope="col" id="[^"]+">Trial<\/th><th scope="colgroup" colspan="2" id="[^"]+">Temperature<\/th><th rowspan="2" scope="col" id="[^"]+">Interval<\/th><th rowspan="2" scope="col" id="[^"]+">Observation<\/th><\/tr><tr><th scope="col" id="[^"]+">Start temp<\/th><th scope="col" id="[^"]+">End temp<\/th><\/tr><\/thead>/,
  );

  // Column types resolve their versioned alignment default.
  assert.match(rendered, /<th rowspan="2" scope="col" id="[^"]+">Trial<\/th>/);
  assert.match(rendered, /style="text-align:left"[^>]*>A1/);
  assert.match(rendered, /style="text-align:right"[^>]*>344\.2/);

  // A `unit:` column keeps its resolved quantity attached to the value.
  assert.match(rendered, /344\.2 <span class="aze-unit">K<\/span>/);

  // A2 omits `end-temp`: the missing value stays missing, three-way distinct
  // from a zero and from an empty string.
  assert.match(rendered, /<td class="aze-missing"[^>]*><\/td>/);

  // A prose cell keeps its Markdown inline content.
  assert.match(rendered, /lid off; <strong>probe drifted late in run<\/strong>/);
});

test("a table with no caption still renders a bare table and no figure", async () => {
  const rendered = await html(
    envelope(
      table("  - key: a\n    name: A\n    type: text", "  - a: one"),
    ),
  );
  assert.match(rendered, /<table class="aze-table"/);
  assert.doesNotMatch(rendered, /<figure class="aze-table-figure">/);
  assert.doesNotMatch(rendered, /<caption/);
  // A captionless table publishes no dangling description reference.
  assert.doesNotMatch(rendered, /aria-describedby/);
});

test("two unitless quantity columns never constrain each other", async () => {
  const result = await compile(
    envelope(
      table(
        "  - key: a\n    name: A\n    type: quantity\n  - key: b\n    name: B\n    type: quantity",
        "  - a: 1 s\n    b: 2 K",
      ),
    ),
  );
  assert.deepEqual(result.diagnostics, []);
});

test("a columns-only table with zero rows is legal and silent", async () => {
  const result = await compile(
    envelope(
      ":::: table\nid: header-only\n----\ncolumns:\n  - key: a\n    name: A\n    type: text\n::::",
    ),
  );
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.artifact);
});

test("algorithms parse the six statement forms and render nested lists", async () => {
  const rendered = await html(await scenarioSource());
  assert.match(rendered, /<figure class="aze-algorithm"/);
  assert.match(rendered, /aze-algorithm-keyword">while</);
  assert.match(rendered, /aze-algorithm-keyword">return</);
  // The `while` body and the `if` ladder nest as ordered lists.
  assert.match(rendered, /<ol class="aze-algorithm-branch">/);
});

test("a statement renders its kind, its proof and a renderer-derived QED", async () => {
  const rendered = await html(await scenarioSource());
  assert.match(rendered, /<figure class="aze-statement"/);
  assert.match(rendered, /data-statement-kind="theorem"/);
  assert.match(rendered, /aze-statement-proof/);
  assert.match(rendered, /aze-statement-qed">&#9633;</);
  // The nested `:: equation` inside the proof is its own equation Block.
  assert.match(rendered, /<figure class="aze-equation"/);
});

test("an example composes problem, givens, ordered steps and result", async () => {
  const rendered = await html(await scenarioSource());
  assert.match(rendered, /<figure class="aze-example"/);
  assert.match(rendered, /aze-example-problem/);
  assert.match(rendered, /aze-example-givens/);
  assert.match(rendered, /<ol class="aze-example-steps">/);
  // A worked derivation composes mathematics instead of redefining it: the
  // example holds a separate derivation Block and a separate equation Block.
  assert.match(rendered, /<figure class="aze-derivation"/);
  assert.match(rendered, /general solution/);
});

test("the structured technical content survives every Artifact format", async () => {
  const source = await scenarioSource();
  for (const format of ["svg", "png", "pdf"]) {
    const result = await compile(source, format);
    assert.deepEqual(codes(result), [], format);
    assert.ok(result.artifact, format);
    assert.ok(result.artifact.bytes.byteLength > 0, format);
  }
});

test("table diagnostics are stable-coded and source-ranged", async () => {
  const cases = [
    [
      table(
        "  - key: trial\n    name: Trial\n    type: text",
        "  - trial: A1\n    curent: 338.4",
      ),
      "azeforge.table#unknown-column-key",
    ],
    [table("  - key: a\n    name: A\n    type: text", "  - {}"), "azeforge.table#empty-row"],
    [
      table("  - key: a\n    name: A\n    type: percentage", "  - a: one"),
      "azeforge.table#unknown-type",
    ],
    [
      table("  - key: a\n    name: A\n    type: integer", "  - a: 1.5"),
      "azeforge.table#non-numeric-value",
    ],
    [
      table("  - key: a\n    name: A\n    type: quantity\n    unit: s", "  - a: 5 min"),
      "azeforge.table#invalid-quantity",
    ],
    [
      table("  - key: a\n    name: A\n    type: text\n    unit: s", "  - a: one"),
      "azeforge.table#unit-in-column",
    ],
    // Dimension consistency is a per-column rule.
    [
      table(
        "  - key: a\n    name: A\n    type: quantity",
        "  - a: 1 s\n  - a: 2 K",
      ),
      "azeforge.table#dimension-mismatch",
    ],
    // Two unitless quantity columns of different dimensions never constrain
    // each other, so this one is legal.
    [
      table(
        "  - key: a\n    name: A\n    type: quantity\n  - key: b\n    name: B\n    type: quantity",
        "  - a: 1 s\n    b: 2 K",
      ),
      undefined,
    ],
    // Empty is not the missing shortcut.
    [
      table("  - key: a\n    name: A\n    type: text", "  - a:"),
      "azeforge.table#empty-value",
    ],
    // Numeric fields do not coerce quoted numbers.
    [
      table("  - key: a\n    name: A\n    type: integer", '  - a: "3"'),
      "azeforge.table#non-numeric-value",
    ],
    [
      table(
        "  - key: a\n    name: A\n    type: text\n  - key: b\n    name: B\n    type: text",
        "  - a: one\n    b: two",
        "groups:\n  - name: One\n    columns:\n      - a\n",
      ),
      "azeforge.table#group-too-small",
    ],
    [
      table(
        "  - key: a\n    name: A\n    type: text\n  - key: b\n    name: B\n    type: text\n  - key: c\n    name: C\n    type: text",
        "  - a: one\n    b: two\n    c: three",
        "groups:\n  - name: Ends\n    columns:\n      - a\n      - c\n",
      ),
      "azeforge.table#non-adjacent-group",
    ],
  ];
  for (const [source, code] of cases) {
    const result = await compile(envelope(source));
    if (code === undefined) {
      assert.deepEqual(result.diagnostics, [], source);
      continue;
    }
    const diagnostic = result.diagnostics.find((item) => item.code === code);
    assert.ok(diagnostic, `${code} for ${source}`);
    assert.equal(diagnostic.severity, "error");
    assert.ok(Number.isInteger(diagnostic.location?.range?.start?.line), code);
    assert.equal(result.artifact, undefined, code);
  }
});

test("algorithm, statement and example diagnostics are stable-coded", async () => {
  const cases = [
    [
      ':::: algorithm\nid: a1\n----\nprocedure: Broken\nsteps:\n  - foreach: x in A\n::::',
      "azeforge.algorithm#unknown-statement",
    ],
    [
      ':::: algorithm\nid: a2\n----\nprocedure: Broken\nsteps:\n  - if: lo = hi\n    then:\n      - return: true\n::::',
      "azeforge.algorithm#assignment-in-condition",
    ],
    [
      ':::: algorithm\nid: a3\n----\nprocedure: Broken\nsteps:\n  - assign: 2 * n = x\n::::',
      "azeforge.algorithm#invalid-assign-target",
    ],
    [
      ':::: algorithm\nid: a4\n----\nprocedure: Broken\nsteps:\n  - while: lo <= hi\n::::',
      "azeforge.algorithm#missing-body",
    ],
    [
      ':::: statement\nid: s1\nkind: axiom\n----\ntext: |\n  Something.\n::::',
      "azeforge.statement#unknown-kind",
    ],
    [
      ':::: statement\nid: s2\nkind: lemma\n----\ntext: |\n  Something.\n\nproof: |\n::::',
      "azeforge.statement#empty-proof",
    ],
    [
      ':::: example\nid: e1\n----\nproblem: A trivial problem.\nsteps:\n  - text: |\n      \nresult: Nothing to report.\n::::',
      "azeforge.example#empty-step",
    ],
  ];
  for (const [source, code] of cases) {
    const result = await compile(envelope(source));
    if (code === undefined) {
      assert.deepEqual(result.diagnostics, [], source);
      continue;
    }
    const diagnostic = result.diagnostics.find((item) => item.code === code);
    assert.ok(diagnostic, `${code} for ${source}`);
    assert.ok(Number.isInteger(diagnostic.location?.range?.start?.line), code);
  }
});

test("the table ceiling is fail-closed", async () => {
  const columns = Array.from(
    { length: 2 },
    (_, index) => `  - key: c${index}\n    name: C${index}\n    type: text`,
  ).join("\n");
  const rows = Array.from({ length: 1001 }, () => "  - c0: a\n    c1: b").join("\n");
  const result = await compile(envelope(table(columns, rows)));
  assert.ok(codes(result).includes("azeforge.table#too-many-rows"));
  assert.equal(result.artifact, undefined);
});

test("element ids never collide with the composition anchor", async () => {
  const rendered = await html(await scenarioSource());
  for (const id of ["cooling-measurements", "binary-search", "triangle-inequality", "cooling-model"]) {
    const occurrences = rendered.split(` id="${id}"`).length - 1;
    assert.equal(occurrences, 1, id);
    assert.match(rendered, new RegExp(`<span class="aze-anchor" id="${id}"></span>`));
  }
});
