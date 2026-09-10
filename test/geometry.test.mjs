import assert from "node:assert/strict";
import test from "node:test";

import { createCompiler } from "../dist/index.js";
import { buildCapabilities } from "../dist/capabilities.js";

const ALTITUDE = `---
azemark: 2
---

:::: geometry
id: isosceles-altitude
number: true
----
- kind: point
  name: base-left
  label: B
  x: -3
  y: 0
- kind: point
  name: base-right
  label: C
  x: 3
  y: 0
- kind: point
  name: apex
  label: A
  x: 0
  y: 4
- kind: line
  name: base-line
  through-first: base-left
  through-second: base-right
  visible: false
- kind: segment
  name: left-side
  from: apex
  to: base-left
- kind: segment
  name: right-side
  from: apex
  to: base-right
- kind: segment
  name: base
  from: base-left
  to: base-right
- kind: perpendicular-foot
  name: foot
  label: D
  from: apex
  to: base-line
- kind: segment
  name: altitude
  from: apex
  to: foot
  style: dashed
- kind: equal-marks
  group: legs
  segments:
    - left-side
    - right-side
- kind: right-angle-mark
  first: apex
  second: foot
  third: base-right
- kind: length-mark
  segment: base
  measure: length
- kind: length-mark
  from: apex
  to: foot
  label: h
::::
`;

const TANGENT = (pick) => `---
azemark: 2
---

:::: geometry
id: circle-tangent
----
- kind: point
  name: center
  label: O
  x: 0
  y: 0
- kind: circle
  name: main-circle
  center: center
  radius: 2
- kind: point
  name: touch
  label: T
  x: 0
  y: 2
- kind: tangent-line
  name: top-tangent
  circle: main-circle
  at: touch
- kind: point
  name: outside
  label: P
  x: 5
  y: 0
- kind: tangent-line
  name: upper-tangent
  circle: main-circle
  from: outside
  pick: ${pick}
::::
`;

function bodySource(body, header = "") {
  return `---\nazemark: 2\n---\n\n:::: geometry\n${header}----\n${body}\n::::\n`;
}

const point = (name, x, y) => `- kind: point\n  name: ${name}\n  x: ${x}\n  y: ${y}`;
test("isosceles altitude resolves with computed measure distinct from authored label", async () => {
  const compiler = createCompiler();
  const compiled = await compiler.compile(ALTITUDE, { format: "html" });
  assert.deepEqual(compiled.diagnostics, []);
  assert.equal(compiled.document.blocks.length, 1);
  const block = compiled.document.blocks[0];
  assert.equal(block?.kind, "geometry");
  assert.equal(block?.declarations.length, 13);
  // Authored order is construction order is identity: never sorted.
  assert.deepEqual(
    block?.declarations.map((entry) => entry.kind),
    ["point", "point", "point", "line", "segment", "segment", "segment", "perpendicular-foot", "segment", "equal-marks", "right-angle-mark", "length-mark", "length-mark"],
  );
  const html = Buffer.from(compiled.artifact.bytes).toString("utf8");
  assert.ok(html.includes('<figure class="aze-geometry"'));
  assert.ok(html.includes('role="img"'));
  // Computed base measure renders "6"; the authored altitude label stays literal "h".
  assert.ok(html.includes(">6<"), "computed base length renders");
  assert.ok(html.includes(">h<"), "authored label renders literally");
  assert.ok(html.includes('stroke-dasharray="6 4"'), "dashed altitude renders dashed");
  assert.ok(html.includes("3 points"), "description counts kinds");
  assert.ok(html.includes("perpendicular-foot foot"), "description lists constructions");
  assert.ok(html.includes("4 marks"), "description counts marks");
});

test("authored labels are never checked against computed measures", async () => {
  const compiler = createCompiler();
  const wrong = ALTITUDE.replace("  label: h", "  label: 999");
  const compiled = await compiler.compile(wrong, { format: "html" });
  assert.deepEqual(compiled.diagnostics, []);
  const html = Buffer.from(compiled.artifact.bytes).toString("utf8");
  assert.ok(html.includes(">999<"), "wrong authored label still renders literally");
  assert.ok(!html.includes(">4<"), "no computed altitude value leaks into the label");
});

test("circle tangent resolves both forms with mandatory characteristic-point pick", async () => {
  const compiler = createCompiler();
  const upper = await compiler.compile(TANGENT(2), { format: "html" });
  assert.deepEqual(upper.diagnostics, []);
  const lower = await compiler.compile(TANGENT(1), { format: "html" });
  assert.deepEqual(lower.diagnostics, []);
  // Ascending-y branch ordering: pick 1 is the lower tangent, pick 2 the upper.
  assert.notEqual(
    Buffer.from(upper.artifact.bytes).toString("utf8"),
    Buffer.from(lower.artifact.bytes).toString("utf8"),
  );
});

test("content hash is stable across renders and sensitive to declaration order", async () => {
  const compiler = createCompiler();
  const first = await compiler.compile(ALTITUDE, { format: "html" });
  const second = await compiler.compile(ALTITUDE, { format: "html" });
  assert.equal(first.contentHash, second.contentHash);
  // Rendering never mutates semantic identity: svg agrees on the content hash.
  const svg = await compiler.compile(ALTITUDE, { format: "svg" });
  assert.equal(svg.contentHash, first.contentHash);
  // Declaration order is construction order: swapping two points changes identity.
  const swapped = ALTITUDE.replace("  name: base-left\n  label: B", "  name: base-left\n  label: B2");
  const renamed = await compiler.compile(swapped, { format: "html" });
  assert.notEqual(renamed.contentHash, first.contentHash);
});

test("contradictory and degenerate inputs diagnose with stable codes", async () => {
  const compiler = createCompiler();
  const line = (name, a, b) => `- kind: line\n  name: ${name}\n  through-first: ${a}\n  through-second: ${b}`;
  const cases = [
    ["forward reference", `- kind: segment\n  name: s\n  from: p1\n  to: p2\n${point("p1", 0, 0)}\n${point("p2", 1, 0)}`, "azeforge.geometry#unresolved-reference"],
    ["parallel intersection", `${point("a", 0, 0)}\n${point("b", 1, 0)}\n${point("c", 0, 1)}\n${point("d", 1, 1)}\n${line("l1", "a", "b")}\n${line("l2", "c", "d")}\n- kind: intersection\n  name: x\n  first: l1\n  second: l2\n  pick: 1`, "azeforge.geometry#no-solution"],
    ["interior tangent", `${point("o", 0, 0)}\n- kind: circle\n  name: cc\n  center: o\n  radius: 2\n${point("i", 0, 0.5)}\n- kind: tangent-line\n  name: t\n  circle: cc\n  from: i`, "azeforge.geometry#no-solution"],
    ["off-circle tangent point", `${point("o", 0, 0)}\n- kind: circle\n  name: cc\n  center: o\n  radius: 2\n${point("q", 0, 3)}\n- kind: tangent-line\n  name: t\n  circle: cc\n  at: q`, "azeforge.geometry#no-solution"],
    ["ambiguous intersection", `${point("o", 0, 0)}\n- kind: circle\n  name: cc\n  center: o\n  radius: 1\n${point("a", -2, 0)}\n${point("b", 2, 0)}\n${line("ll", "a", "b")}\n- kind: intersection\n  name: x\n  first: ll\n  second: cc`, "azeforge.geometry#ambiguous-construction"],
    ["out-of-range pick", `${point("o", 0, 0)}\n- kind: circle\n  name: cc\n  center: o\n  radius: 1\n${point("a", -2, 0)}\n${point("b", 2, 0)}\n${line("ll", "a", "b")}\n- kind: intersection\n  name: x\n  first: ll\n  second: cc\n  pick: 3`, "azeforge.geometry#invalid-pick"],
    ["coincident line points", `${point("a", 0, 0)}\n${point("b", 0, 0)}\n${line("ll", "a", "b")}`, "azeforge.geometry#degenerate"],
    ["nonpositive radius", `${point("o", 0, 0)}\n- kind: circle\n  name: cc\n  center: o\n  radius: 0`, "azeforge.geometry#degenerate"],
    ["full-circle arc", `${point("o", 0, 0)}\n- kind: arc\n  name: aa\n  center: o\n  radius: 1\n  start-angle: 0\n  end-angle: 360\n  direction: ccw`, "azeforge.geometry#degenerate"],
    ["label plus measure", `${point("a", 0, 0)}\n${point("b", 1, 0)}\n- kind: length-mark\n  from: a\n  to: b\n  label: x\n  measure: length`, "azeforge.geometry#invalid-mark-content"],
    ["unknown direction", `${point("o", 0, 0)}\n- kind: arc\n  name: aa\n  center: o\n  radius: 1\n  start-angle: 0\n  end-angle: 90\n  direction: clockwise`, "azeforge.geometry#unknown-direction"],
    ["non-finite coordinate", `- kind: point\n  name: p\n  x: nan\n  y: 0`, "azeforge.geometry#invalid-coordinate"],
    ["duplicate name", `${point("a", 0, 0)}\n${point("a", 1, 1)}`, "azeforge.geometry#duplicate-name"],
    ["unknown kind", `- kind: triangle\n  name: t`, "azeforge.geometry#unknown-declaration"],
    ["empty block", ``, "azeforge.geometry#empty"],
    ["tangent-contact intersection", `${point("o", 0, 0)}\n- kind: circle\n  name: cc\n  center: o\n  radius: 1\n${point("a", -2, 1)}\n${point("b", 2, 1)}\n${line("ll", "a", "b")}\n- kind: intersection\n  name: x\n  first: ll\n  second: cc\n  pick: 1`, "azeforge.geometry#degenerate"],
    ["equal-marks on a point", `${point("a", 0, 0)}\n${point("b", 1, 0)}\n- kind: equal-marks\n  group: g\n  segments:\n    - a`, "azeforge.geometry#unresolved-reference"],
  ];
  for (const [name, body, code] of cases) {
    const compiled = await compiler.compile(bodySource(body), { format: "html" });
    assert.equal(compiled.document, undefined, name);
    assert.ok(
      compiled.diagnostics.some((diagnostic) => diagnostic.code === code),
      `${name}: expected ${code}, saw ${compiled.diagnostics.map((d) => d.code).join(", ")}`,
    );
  }
});

test("unused guides and out-of-bounds resolutions warn without failing", async () => {
  const compiler = createCompiler();
  const unused = bodySource(`${point("a", 0, 0)}\n${point("b", 1, 0)}\n- kind: line\n  name: guide\n  through-first: a\n  through-second: b\n  visible: false`);
  const unusedCompiled = await compiler.compile(unused, { format: "html" });
  assert.ok(unusedCompiled.document !== undefined);
  assert.ok(unusedCompiled.diagnostics.some((d) => d.code === "azeforge.geometry#unused-declaration" && d.severity === "warning"));

  const clipped = bodySource(`${point("a", 0, 0)}\n${point("b", 100, 100)}`, "bounds:\n  min-x: -1\n  min-y: -1\n  max-x: 1\n  max-y: 1\n");
  const clippedCompiled = await compiler.compile(clipped, { format: "html" });
  assert.ok(clippedCompiled.document !== undefined);
  assert.ok(clippedCompiled.diagnostics.some((d) => d.code === "azeforge.geometry#geometry-out-of-bounds" && d.severity === "warning"));
});

test("capabilities reports the versioned geometry evaluator and limits", async () => {
  const report = await buildCapabilities();
  assert.ok(report.plugins.some((plugin) => plugin.type === "geometry" && plugin.version === "1.0.0"));
  assert.equal(report.engines.geometry.emitter, "1.0.0");
  assert.equal(report.engines.geometry.eval, "geometry-eval/v1");
  assert.equal(report.engines.geometry.epsilon, 1e-9);
  assert.deepEqual(report.limits.blocks.geometry, {
    maxDeclarations: 256,
    maxPolygonVertices: 64,
    maxEqualMarkSegments: 16,
    maxEqualMarkGroups: 16,
    maxLabelChars: 500,
    maxCoordinateMagnitude: 1000000,
    maxDimensionPx: 4096,
  });
});
