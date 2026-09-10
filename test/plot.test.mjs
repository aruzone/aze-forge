import assert from "node:assert/strict";
import test from "node:test";

import { createCompiler } from "../dist/index.js";

const RC_SOURCE = `---
azemark: 2
---

:::: plot
id: rc-step-response
number: true
parameters:
  V0: 5
  R: 1000
  C: 1e-6
x-axis:
  label: time (s)
  min: 0
  max: 0.005
y-axis:
  label: voltage (V)
  min: 0
----
- kind: function
  label: analytic step response
  variable: t
  expression: V0 * (1 - exp(-t / (R * C)))
  domain:
    min: 0
    max: 0.005
  samples: 400
- kind: scatter
  label: measured points
  points:
    - x: 0.0005
      y: 1.99
      error: 0.08
    - x: 0.001
      y: 3.11
      error: 0.10
    - x: 0.002
      y: 4.36
      error-low: 0.14
      error-high: 0.09
    - x: 0.003
      y: 4.71
      error: 0.12
::::
`;

function plotBody(body) {
  return `---\nazemark: 2\n---\n\n${body}\n`;
}

function errorCodes(source) {
  const compiler = createCompiler();
  const parsed = compiler.parse(plotBody(source), {});
  return parsed.diagnostics.map((diagnostic) => diagnostic.code);
}

test("rc-response plot parses, validates, and renders function plus measured points", async () => {
  const compiler = createCompiler();
  const parsed = compiler.parse(RC_SOURCE, { sourceName: "rc" });
  assert.deepEqual(
    parsed.diagnostics.filter((diagnostic) => diagnostic.severity === "error"),
    [],
  );
  const validated = compiler.validate(parsed);
  assert.deepEqual(validated.diagnostics, []);
  const block = validated.document.blocks[0];
  assert.equal(block.kind, "plot");
  assert.equal(block.series.length, 2);
  assert.equal(block.series[0].kind, "function");
  assert.equal(block.series[0].samples, 400);
  // Scientific-input normalization: authored 1e-6 is stored canonical.
  assert.equal(block.parameters.C, "0.000001");

  const compiled = await compiler.compile(RC_SOURCE, { format: "html" });
  assert.ok(compiled.artifact);
  const html = Buffer.from(compiled.artifact.bytes).toString("utf8");
  assert.match(html, /<figure class="aze-plot"/);
  assert.match(html, /analytic step response/);
  assert.match(html, /measured points/);
  // One function path, four scatter markers, error bars for every point.
  assert.equal(html.match(/<path /g)?.length, 1);
  assert.equal(html.match(/<circle /g)?.length, 4);
  assert.ok(html.includes("<title>") && html.includes("<desc>"));
  assert.ok(html.includes('role="img"'));
});

test("plot numerals canonicalize to exact decimals", () => {
  const compiler = createCompiler();
  const parsed = compiler.parse(RC_SOURCE, {});
  assert.deepEqual(
    parsed.diagnostics.filter((diagnostic) => diagnostic.severity === "error"),
    [],
  );
  const validated = compiler.validate(parsed);
  const block = validated.document.blocks[0];
  assert.equal(block.kind, "plot");
  // Authored spellings normalize: 1e-6, 1.50, and 1e3 forms collapse.
  assert.equal(block.parameters.C, "0.000001");
  const scatter = block.series[1];
  assert.equal(scatter.points[0].y, "1.99");

  const alternate = compiler.parse(RC_SOURCE.replace("C: 1e-6", "C: 0.000001"), {});
  const alternateBlock = compiler.validate(alternate).document.blocks[0];
  assert.equal(alternateBlock.parameters.C, "0.000001");
});

test("plot content hash is stable for canonical variants and order-sensitive", async () => {
  const compiler = createCompiler();
  const first = await compiler.compile(RC_SOURCE, { format: "html" });
  const canonical = RC_SOURCE.replace("C: 1e-6", "C: 0.000001").replace("y: 1.99", "y: 1.990");
  const second = await compiler.compile(canonical, { format: "html" });
  assert.ok(first.artifact && second.artifact);
  assert.equal(first.artifact.metadata.contentHash, second.artifact.metadata.contentHash);

  // Series order is draw order is identity: swapping series changes the hash.
  const lineFirst = plotBody(`:::: plot
id: order
----
- kind: line
  label: first
  points:
    - x: 0
      y: 0
    - x: 1
      y: 1
- kind: scatter
  label: second
  points:
    - x: 0
      y: 1
    - x: 1
      y: 0
::::`);
  const scatterFirst = plotBody(`:::: plot
id: order
----
- kind: scatter
  label: second
  points:
    - x: 0
      y: 1
    - x: 1
      y: 0
- kind: line
  label: first
  points:
    - x: 0
      y: 0
    - x: 1
      y: 1
::::`);
  const ordered = await compiler.compile(lineFirst, { format: "html" });
  const reordered = await compiler.compile(scatterFirst, { format: "html" });
  assert.ok(ordered.artifact && reordered.artifact);
  assert.notEqual(ordered.artifact.metadata.contentHash, reordered.artifact.metadata.contentHash);
});

test("plot compilation is byte-deterministic across runs", async () => {
  const compiler = createCompiler();
  const first = await compiler.compile(RC_SOURCE, { format: "html" });
  const second = await compiler.compile(RC_SOURCE, { format: "html" });
  assert.ok(first.artifact && second.artifact);
  assert.deepEqual(first.artifact.bytes, second.artifact.bytes);
  assert.equal(first.artifact.metadata.artifactHash, second.artifact.metadata.artifactHash);
});

test("undefined function regions gap instead of connecting", async () => {
  const compiler = createCompiler();
  const source = plotBody(`:::: plot
id: root-gap
----
- kind: function
  expression: sqrt(x^2 - 0.25)
  domain:
    min: -1
    max: 1
::::`);
  const parsed = compiler.parse(source, {});
  assert.deepEqual(
    parsed.diagnostics.filter((diagnostic) => diagnostic.severity === "error"),
    [],
  );
  const compiled = await compiler.compile(source, { format: "html" });
  assert.ok(compiled.artifact);
  const html = Buffer.from(compiled.artifact.bytes).toString("utf8");
  const path = /<path d="([^"]+)"/.exec(html)?.[1] ?? "";
  // One path element whose data breaks across the undefined region.
  assert.ok((path.match(/M/g) ?? []).length >= 2);
});

test("asymptotes break instead of drawing near-vertical connectors", async () => {
  const compiler = createCompiler();
  const source = plotBody(`:::: plot
id: asymptote
----
- kind: function
  expression: 1 / x
  domain:
    min: -1
    max: 1
::::`);
  const compiled = await compiler.compile(source, { format: "html" });
  assert.ok(compiled.artifact);
  const html = Buffer.from(compiled.artifact.bytes).toString("utf8");
  const paths = html.match(/<path d="([^"]+)"/g) ?? [];
  assert.ok(paths.length >= 1);
  // No single segment spans the full vertical range through the pole.
  for (const tag of paths) {
    const numbers = [...tag.matchAll(/-?\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
    const ys = numbers.filter((_, index) => index % 2 === 1);
    assert.ok(Math.max(...ys) - Math.min(...ys) < 2000);
  }
});

test("all-undefined function series warn but stay valid", () => {
  const compiler = createCompiler();
  const parsed = compiler.parse(
    plotBody(`:::: plot
id: absent-curve
----
- kind: function
  expression: sqrt(-(x^2) - 1)
  domain:
    min: -1
    max: 1
::::`),
    {},
  );
  assert.deepEqual(
    parsed.diagnostics.filter((diagnostic) => diagnostic.severity === "error"),
    [],
  );
  assert.deepEqual(
    parsed.diagnostics.map((diagnostic) => diagnostic.code),
    ["azeforge.plot#all-undefined-samples"],
  );
});

test("plot refuses invalid declarations with stable codes", () => {
  assert.deepEqual(
    errorCodes(`:::: plot
id: a
----
- kind: function
  expression: x + q
  domain:
    min: 0
    max: 1
::::`),
    ["azeforge.plot#unbound-variable"],
  );
  assert.deepEqual(
    errorCodes(`:::: plot
id: a
----
- kind: function
  expression: sum i=1..10 of i * x
  domain:
    min: 0
    max: 1
::::`),
    ["azeforge.plot#non-evaluable-construct"],
  );
  assert.deepEqual(
    errorCodes(`:::: plot
id: a
----
- kind: scatter
  points:
    - x: 0.001
      y: 1
    - x: 0.002
      y: nan
::::`),
    ["azeforge.plot#invalid-datum"],
  );
  assert.deepEqual(
    errorCodes(`:::: plot
id: a
----
- kind: scatter
  points:
    - x: 1
      y: 2
      error-low: 0.1
::::`),
    ["azeforge.plot#mismatched-error-fields"],
  );
  assert.deepEqual(
    errorCodes(`:::: plot
id: a
----
- kind: function
  expression: x
::::`),
    ["azeforge.plot#missing-domain"],
  );
  assert.deepEqual(
    errorCodes(`:::: plot
id: a
y-axis:
  scale: log
----
- kind: scatter
  points:
    - x: 1
      y: 0
::::`),
    ["azeforge.plot#log-axis-value"],
  );
  assert.deepEqual(
    errorCodes(`:::: plot
id: a
x-axis:
  scale: log
----
- kind: function
  expression: x
  domain:
    min: -1
    max: 1
::::`),
    ["azeforge.plot#log-domain-invalid"],
  );
  assert.deepEqual(
    errorCodes(`:::: plot
id: a
----
- kind: pie
  expression: x
::::`),
    ["azeforge.plot#unknown-series-kind"],
  );
  assert.deepEqual(
    errorCodes(`:::: plot
id: a
parameters:
  x: 2
----
- kind: function
  expression: x
  domain:
    min: 0
    max: 1
::::`),
    ["azeforge.plot#duplicate-parameter"],
  );
});

test("grouped-bar chart renders labeled series with error bars", async () => {
  const compiler = createCompiler();
  const source = plotBody(`:::: chart
id: bench-scores
type: grouped-bar
x-label: suite
y-label: score
----
- label: alpha
  bars:
    - category: parse
      value: 12
      error: 0.5
    - category: render
      value: 19
- label: beta
  bars:
    - category: parse
      value: 9
    - category: render
      value: 22
      error-low: 1
      error-high: 2
::::`);
  const parsed = compiler.parse(source, {});
  assert.deepEqual(
    parsed.diagnostics.filter((diagnostic) => diagnostic.severity === "error"),
    [],
  );
  const compiled = await compiler.compile(source, { format: "html" });
  assert.ok(compiled.artifact);
  const html = Buffer.from(compiled.artifact.bytes).toString("utf8");
  assert.match(html, /<figure class="aze-chart"/);
  assert.equal(html.match(/<rect /g)?.length, 6);
  assert.ok(html.includes("parse") && html.includes("render"));
});

test("histogram bins half-open with a closed last bin", async () => {
  const compiler = createCompiler();
  const source = plotBody(`:::: chart
id: latency-hist
type: histogram
----
- label: samples
  values:
    - 1.5
    - 2.5
    - 2.7
    - 10
  edges:
    - 0
    - 5
    - 10
::::`);
  const parsed = compiler.parse(source, {});
  assert.deepEqual(
    parsed.diagnostics.filter((diagnostic) => diagnostic.severity === "error"),
    [],
  );
  const validated = compiler.validate(parsed);
  const block = validated.document.blocks[0];
  assert.equal(block.kind, "chart");
  // The resolved edge list is Document data.
  assert.deepEqual(block.series[0].edges, ["0", "5", "10"]);

  const compiled = await compiler.compile(source, { format: "html" });
  assert.ok(compiled.artifact);
  const html = Buffer.from(compiled.artifact.bytes).toString("utf8");
  // Counts [3, 1]: the first bin bar is taller (smaller y) than the second.
  const rects = [...html.matchAll(/<rect x="[^"]+" y="([^"]+)" width="[^"]+" height="([^"]+)"/g)];
  assert.equal(rects.length, 3);
  const bars = rects.slice(0, 2).map((match) => Number(match[2]));
  assert.ok(bars[0] > bars[1]);
});

test("chart refuses invalid declarations with stable codes", () => {
  assert.deepEqual(
    errorCodes(`:::: chart
id: a
type: histogram
----
- values:
    - 12.5
  edges:
    - 0
    - 10
::::`),
    ["azeforge.chart#value-out-of-bin-range"],
  );
  assert.deepEqual(
    errorCodes(`:::: chart
id: a
type: histogram
----
- values:
    - 1
  edges:
    - 0
    - 5
    - 3
::::`),
    ["azeforge.chart#invalid-edges"],
  );
  assert.deepEqual(
    errorCodes(`:::: chart
id: a
type: pie
----
- label: x
  bars:
    - category: a
      value: 1
::::`),
    ["azeforge.chart#unknown-chart-type"],
  );
  assert.deepEqual(
    errorCodes(`:::: chart
id: a
type: bar
----
- label: x
  bars:
    - category: a
      value: nan
::::`),
    ["azeforge.chart#invalid-datum"],
  );
});

test("duplicate bar categories warn per series", () => {
  const compiler = createCompiler();
  const parsed = compiler.parse(
    plotBody(`:::: chart
id: dup-cats
type: bar
----
- label: x
  bars:
    - category: a
      value: 1
    - category: a
      value: 2
::::`),
    {},
  );
  assert.deepEqual(
    parsed.diagnostics.filter((diagnostic) => diagnostic.severity === "error"),
    [],
  );
  assert.deepEqual(
    parsed.diagnostics.map((diagnostic) => diagnostic.code),
    ["azeforge.chart#duplicate-category"],
  );
});

test("seventeen series exceed the registered ceiling", () => {
  const series = Array(17)
    .fill("- kind: scatter\n  points:\n    - x: 1\n      y: 2")
    .join("\n");
  const codes = errorCodes(`:::: plot\nid: many\n----\n${series}\n::::`);
  assert.deepEqual(codes, ["azeforge.plot#limit-exceeded"]);
});

test("capabilities report the plot engine with pinned modules", async () => {
  const { buildCapabilities } = await import("../dist/capabilities.js");
  const report = await buildCapabilities();
  assert.equal(report.engines.plot.emitter, "1.0.0");
  assert.equal(report.engines.plot.eval, "plot-eval/v1");
  assert.equal(report.engines.plot.d3array, "3.2.4");
  assert.equal(report.engines.plot.d3scale, "4.0.2");
  assert.equal(report.engines.plot.d3shape, "3.2.0");
  assert.equal(report.engines.plot.availability, "unknown");
  const types = report.plugins.map((plugin) => plugin.type);
  assert.ok(types.includes("plot") && types.includes("chart"));
});

test("plot fingerprint rides only plot documents", async () => {
  const compiler = createCompiler();
  const plain = await compiler.compile(
    "---\nazemark: 2\n---\n\n# Plain\n",
    { format: "html" },
  );
  const plotted = await compiler.compile(RC_SOURCE, { format: "html" });
  assert.ok(plain.artifact && plotted.artifact);
  assert.notEqual(
    plain.artifact.metadata.rendererFingerprint,
    plotted.artifact.metadata.rendererFingerprint,
  );
});

test("front-matter defaults apply unless the header overrides them", () => {
  const compiler = createCompiler();
  const source = `---
azemark: 2
defaults:
  plot:
    grid: true
  chart:
    legend: false
---

:::: plot
id: defaulted
----
- kind: scatter
  label: s
  points:
    - x: 1
      y: 2
::::

:::: plot
id: overridden
grid: false
----
- kind: scatter
  points:
    - x: 1
      y: 2
::::

:::: chart
id: defaulted-chart
type: bar
----
- label: s
  bars:
    - category: a
      value: 1
::::
`;
  const parsed = compiler.parse(source, {});
  assert.deepEqual(
    parsed.diagnostics.filter((diagnostic) => diagnostic.severity === "error"),
    [],
  );
  const validated = compiler.validate(parsed);
  const [defaulted, overridden, chart] = validated.document.blocks;
  assert.equal(defaulted.grid, true);
  assert.equal(overridden.grid, false);
  assert.equal(chart.legend, false);
});

test("front-matter defaults refuse unknown sections and keys", () => {
  const compiler = createCompiler();
  for (const defaults of ["maps:\n    legend: true", "plot:\n    bogus: true", "plot:\n    grid: yes"]) {
    const parsed = compiler.parse(`---\nazemark: 2\ndefaults:\n  ${defaults}\n---\n\n# Hi\n`, {});
    assert.ok(
      parsed.diagnostics.some((diagnostic) => diagnostic.severity === "error"),
      defaults,
    );
  }
});

test("excluded series kinds list the registered set without fuzzy hints", () => {
  const compiler = createCompiler();
  const parsed = compiler.parse(
    plotBody(`:::: plot
id: no-pie
----
- kind: pie
  expression: x
::::`),
    {},
  );
  const errors = parsed.diagnostics.filter((diagnostic) => diagnostic.severity === "error");
  assert.deepEqual(
    errors.map((diagnostic) => diagnostic.code),
    ["azeforge.plot#unknown-series-kind"],
  );
  assert.equal(errors[0].suggestion, "Registered series kinds: function, line, scatter.");
});

test("quantize emits fixed-notation ASCII at any magnitude", async () => {
  const { quantize } = await import("../dist/plot.js");
  assert.equal(quantize(0.1 + 0.2), "0.3");
  assert.equal(quantize(1000), "1000");
  assert.equal(quantize(2e21), "2000000000000000000000");
  assert.equal(quantize(1.5e-7), "0");
  assert.equal(quantize(Number.NaN), "0");
  assert.ok(!/[eE]/.test(quantize(1e21)) && !/[eE]/.test(quantize(0.00001)));
});
