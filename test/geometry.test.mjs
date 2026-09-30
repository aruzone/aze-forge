import assert from "node:assert/strict";
import test from "node:test";

import { createCompiler } from "../dist/index.js";
import { buildCapabilities } from "../dist/capabilities.js";
import { advanceWidth } from "../dist/advance-metric.js";

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

/** Label boxes as the emitter claims them: measured advance by nominal height. */
function labelBoxes(html) {
  return [...html.matchAll(/<text x="([\d.-]+)" y="([\d.-]+)" text-anchor="middle" font-size="([\d.]+)"[^>]*>([^<]*)<\/text>/g)]
    .map((match) => {
      const x = Number(match[1]);
      const y = Number(match[2]);
      const size = Number(match[3]);
      const text = match[4];
      const halfWidth = advanceWidth([{ kind: "text", value: text }], size) / 2;
      return {
        text,
        minX: x - halfWidth + 0.5,
        maxX: x + halfWidth - 0.5,
        minY: y - size + 0.5,
        maxY: y + 0.5,
      };
    });
}

/** Dense samples of every drawn stroke, including point markers as disks. */
function drawnSamples(html) {
  const samples = [];
  const pushRun = (x1, y1, x2, y2, steps) => {
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      samples.push([x1 + (x2 - x1) * t, y1 + (y2 - y1) * t]);
    }
  };
  for (const match of html.matchAll(/<line x1="([\d.-]+)" y1="([\d.-]+)" x2="([\d.-]+)" y2="([\d.-]+)"/g)) {
    pushRun(Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4]), 400);
  }
  for (const match of html.matchAll(/<polygon points="([^"]+)"/g)) {
    const corners = match[1].split(" ").map((pair) => pair.split(",").map(Number));
    corners.forEach((corner, index) => {
      const next = corners[(index + 1) % corners.length];
      pushRun(corner[0], corner[1], next[0], next[1], 400);
    });
  }
  for (const match of html.matchAll(/<circle cx="([\d.-]+)" cy="([\d.-]+)" r="([\d.]+)"/g)) {
    const [cx, cy, r] = [Number(match[1]), Number(match[2]), Number(match[3])];
    // A marker is a filled dot, so its interior matters; a drawn circle is
    // only its circumference, and a label may sit inside a large one.
    const fill = r <= 8 ? [0, r / 2] : [];
    for (const radius of [...fill, r]) {
      for (let step = 0; step < 1440; step += 1) {
        const angle = (step / 1440) * Math.PI * 2;
        if (radius === 0) {
          samples.push([cx, cy]);
          break;
        }
        samples.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
      }
    }
  }
  return samples;
}

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
  assert.ok(/stroke-dasharray="[\d.]+ [\d.]+"/.test(html), "dashed altitude renders dashed");
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

test("right-angle mark opens into the angle its arms name", async () => {
  const compiler = createCompiler();
  const source = bodySource([
    point("v", 0, 0),
    point("a", -3, -3),
    point("b", 3, -3),
    "- kind: segment\n  name: va\n  from: v\n  to: a",
    "- kind: segment\n  name: vb\n  from: v\n  to: b",
    "- kind: right-angle-mark\n  first: a\n  second: v\n  third: b",
  ].join("\n"));
  const compiled = await compiler.compile(source, { format: "html" });
  assert.deepEqual(compiled.diagnostics, []);
  const html = Buffer.from(compiled.artifact.bytes).toString("utf8");
  const points = [...html.matchAll(/<circle cx="([\d.-]+)" cy="([\d.-]+)" r="[\d.]+" fill=/g)]
    .map((match) => [Number(match[1]), Number(match[2])]);
  assert.equal(points.length, 3);
  const mark = html.match(/<path d="M ([\d.-]+) ([\d.-]+) L ([\d.-]+) ([\d.-]+) L ([\d.-]+) ([\d.-]+)"[^>]*stroke="#b45309"/);
  assert.ok(mark, "right-angle mark renders a three-point square");
  const [v, a, b] = points;
  // Without an oriented square the mark lands up-left of the vertex, outside
  // the angle these arms open downward.
  const first = [Number(mark[1]), Number(mark[2])];
  const last = [Number(mark[5]), Number(mark[6])];
  const armUnit = (arm) => {
    const dx = arm[0] - v[0];
    const dy = arm[1] - v[1];
    const len = Math.hypot(dx, dy);
    return [dx / len, dy / len];
  };
  const legFrom = (leg, arm) => {
    const unit = armUnit(arm);
    const length = Math.hypot(leg[0] - v[0], leg[1] - v[1]);
    return { unit, length, end: [v[0] + unit[0] * length, v[1] + unit[1] * length] };
  };
  const firstLeg = legFrom(first, a);
  const lastLeg = legFrom(last, b);
  assert.ok(firstLeg.length > 4, "the square has a visible leg");
  assert.ok(
    Math.abs(firstLeg.end[0] - first[0]) < 0.01 && Math.abs(firstLeg.end[1] - first[1]) < 0.01,
    "first leg lies on the first arm",
  );
  assert.ok(
    Math.abs(lastLeg.end[0] - last[0]) < 0.01 && Math.abs(lastLeg.end[1] - last[1]) < 0.01,
    "last leg lies on the third arm",
  );
  assert.ok(Math.abs(lastLeg.length - firstLeg.length) < 0.01, "both legs share one length");
  assert.ok(
    Math.abs(Number(mark[3]) - (first[0] + last[0] - v[0])) < 0.01 &&
      Math.abs(Number(mark[4]) - (first[1] + last[1] - v[1])) < 0.01,
    "corner closes the square inside the angle",
  );
});

test("annotation size follows the drawn figure, not the canvas", async () => {
  const compiler = createCompiler();
  const framed = (bound) => bodySource(
    [
      point("a", 0, 0),
      point("b", 8, 0),
      point("c", 0, 8),
      "- kind: segment\n  name: ab\n  from: a\n  to: b",
      "- kind: segment\n  name: ac\n  from: a\n  to: c",
      "- kind: segment\n  name: bc\n  from: b\n  to: c",
    ].join("\n"),
    `bounds:\n  min-x: ${bound === "tight" ? 0 : -16}\n  min-y: ${bound === "tight" ? 0 : -16}\n  max-x: ${bound === "tight" ? 8 : 16}\n  max-y: ${bound === "tight" ? 8 : 16}\n`,
  );
  const tight = await compiler.compile(framed("tight"), { format: "html" });
  const loose = await compiler.compile(framed("loose"), { format: "html" });
  assert.deepEqual(tight.diagnostics, []);
  assert.deepEqual(loose.diagnostics, []);
  const metrics = (compiled) => {
    const html = Buffer.from(compiled.artifact.bytes).toString("utf8");
    return {
      label: Number(html.match(/font-size="([\d.]+)"/)?.[1]),
      dot: Number(html.match(/<circle cx="[\d.-]+" cy="[\d.-]+" r="([\d.]+)" fill=/)?.[1]),
      stroke: Number(html.match(/stroke-width="([\d.]+)"/)?.[1]),
    };
  };
  const filled = metrics(tight);
  const sparse = metrics(loose);
  // Same drawing, different share of the frame: every annotation metric moves
  // together, so a figure that fills its frame is not annotated as if it were
  // small.
  assert.ok(filled.label > sparse.label, "lettering follows the drawn figure");
  assert.ok(filled.dot > sparse.dot, "point markers follow the drawn figure");
  assert.ok(filled.stroke > sparse.stroke, "line weight follows the drawn figure");
  assert.ok(sparse.label >= 10, "lettering never falls below the minimum readable label size");
});

test("point labels clear the strokes and markers they annotate", async () => {
  const compiler = createCompiler();
  const source = bodySource([
    point("a", -2, 0),
    point("b", 2, 0),
    point("c", 0, 2),
    "- kind: circle\n  name: circumcircle\n  center: a\n  radius: 2",
    "- kind: circle\n  name: diameter-circle\n  center: b\n  radius: 2",
    "- kind: segment\n  name: ab\n  from: a\n  to: b",
    "- kind: segment\n  name: ac\n  from: a\n  to: c",
    "- kind: segment\n  name: bc\n  from: b\n  to: c",
  ].join("\n"));
  const compiled = await compiler.compile(source, { format: "html" });
  assert.deepEqual(compiled.diagnostics, []);
  const html = Buffer.from(compiled.artifact.bytes).toString("utf8");
  const labels = labelBoxes(html);
  assert.equal(labels.length, 3, "every point is labelled");
  const samples = drawnSamples(html);
  assert.ok(samples.length > 1000, "the figure draws strokes to clear");
  for (const label of labels) {
    const covered = samples.filter(([x, y]) =>
      x > label.minX && x < label.maxX && y > label.minY && y < label.maxY);
    assert.equal(covered.length, 0, `label ${label.text} clears every stroke and marker`);
  }
});

test("a crowded marker is an obstacle for a neighbouring label", async () => {
  const compiler = createCompiler();
  // The wide label's first free side is over the second marker without the
  // marker in the obstacle set.
  const source = bodySource([
    "- kind: point\n  name: a\n  label: BRAVO\n  x: 0\n  y: 0",
    "- kind: point\n  name: b\n  label: B\n  x: 0.4\n  y: 0.3",
    "- kind: point\n  name: c\n  label: C\n  x: -3\n  y: -3",
    "- kind: segment\n  name: ac\n  from: a\n  to: c",
  ].join("\n"));
  const compiled = await compiler.compile(source, { format: "html" });
  assert.deepEqual(compiled.diagnostics, []);
  const html = Buffer.from(compiled.artifact.bytes).toString("utf8");
  const labels = labelBoxes(html);
  const markers = [...html.matchAll(/<circle cx="([\d.-]+)" cy="([\d.-]+)" r="([\d.]+)"/g)]
    .map((match) => ({ cx: Number(match[1]), cy: Number(match[2]), r: Number(match[3]) }));
  assert.equal(markers.length, 3);
  for (const label of labels) {
    for (const marker of markers) {
      const covered =
        marker.cx + marker.r > label.minX &&
        marker.cx - marker.r < label.maxX &&
        marker.cy + marker.r > label.minY &&
        marker.cy - marker.r < label.maxY;
      assert.ok(!covered, `label ${label.text} clears marker at ${marker.cx},${marker.cy}`);
    }
  }
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

test("the header faults the parser raises reach the caller", async () => {
  const compiler = createCompiler();

  const stray = await compiler.compile(bodySource(point("a", 0, 0), "bogus: x\n"), {
    format: "html",
  });
  const unknown = stray.diagnostics.find(
    (diagnostic) => diagnostic.code === "azeforge.geometry#unknown-field",
  );
  assert.ok(unknown !== undefined, "a stray header key is reported");
  assert.match(unknown.message, /"bogus"/);

  const duplicate = await compiler.compile(
    bodySource(point("a", 0, 0), "number: true\nnumber: false\n"),
    { format: "html" },
  );
  assert.ok(
    duplicate.diagnostics.some((diagnostic) => diagnostic.code === "azeforge.geometry#duplicate-field"),
    "a repeated header field is reported",
  );

  const bounds = await compiler.compile(
    bodySource(point("a", 0, 0), "bounds:\n  min-x: 5\n  min-y: -1\n  max-x: -5\n  max-y: 1\n"),
    { format: "html" },
  );
  assert.ok(
    bounds.diagnostics.some((diagnostic) => diagnostic.code === "azeforge.geometry#invalid-bounds"),
    "invalid bounds are reported",
  );
});

test("capabilities reports the versioned geometry evaluator and limits", async () => {
  const report = await buildCapabilities();
  assert.ok(report.plugins.some((plugin) => plugin.type === "geometry" && plugin.version === "1.0.0"));
  assert.equal(report.engines.geometry.emitter, "1.1.0");
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
