import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_CONTROL_FLOW,
  MAX_CONTROL_BLOCKS,
  MAX_CONTROL_DECLARATIONS,
  MAX_CONTROL_LABEL_CODE_POINTS,
  MAX_CONTROL_SIGNS_PER_SUM,
  MAX_CONTROL_TOTAL_LABEL_CODE_POINTS,
  validateControlBlock,
} from "../dist/control.js";
import {
  MAX_FREE_BODY_COORDINATE_MAGNITUDE,
  MAX_FREE_BODY_DECLARATIONS,
  MAX_FREE_BODY_DIMENSION_PX,
  MAX_FREE_BODY_POLYGON_VERTICES,
  validateFreeBodyBlock,
} from "../dist/free-body.js";

const BLOCK_RANGE = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 100, offset: 100 },
};

function toLines(text, startLine) {
  const lines = text.split("\n");
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines.map((line, index) => {
    const number = startLine + index;
    return {
      text: line,
      range: {
        start: { line: number, column: 1, offset: 0 },
        end: { line: number, column: 1 + line.length, offset: line.length },
      },
    };
  });
}

function validateControl(header, body) {
  return validateControlBlock({
    headerLines: toLines(header, 10),
    bodyLines: toLines(body, 50),
    blockRange: BLOCK_RANGE,
    sourceName: "control.aze.md",
  });
}

function validateBody(header, body) {
  return validateFreeBodyBlock({
    headerLines: toLines(header, 10),
    bodyLines: toLines(body, 50),
    blockRange: BLOCK_RANGE,
    sourceName: "free-body.aze.md",
  });
}

function codes(result, severity = "error") {
  return result.diagnostics
    .filter((diagnostic) => diagnostic.severity === severity)
    .map((diagnostic) => diagnostic.code.replace(/^azeforge\.[a-z-]+#/, ""));
}

function assertCode(result, code, data) {
  const matches = result.diagnostics.filter((diagnostic) =>
    diagnostic.code.endsWith(`#${code}`),
  );
  assert.equal(
    matches.length,
    1,
    `expected one ${code}, saw [${result.diagnostics.map((diagnostic) => diagnostic.code).join(", ")}]`,
  );
  if (data !== undefined) assert.deepEqual(matches[0].data, data);
  return matches[0];
}

function assertLimit(result, subject, count, limit) {
  const found = result.diagnostics.filter(
    (diagnostic) =>
      diagnostic.code.endsWith("#limit-exceeded") && diagnostic.data.subject === subject,
  );
  assert.ok(found.length >= 1, `expected a ${subject} ceiling`);
  const match = found.find((diagnostic) => diagnostic.data.limit === limit);
  assert.ok(match !== undefined, `expected ${subject} to report limit ${limit}`);
  assert.equal(match.data.count, count);
}

function assertWarningCount(result, code, count) {
  const matches = result.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "warning" && diagnostic.code.endsWith(`#${code}`),
  );
  assert.equal(matches.length, count, `expected ${count} ${code} warnings`);
  return matches;
}

const FEEDBACK_BODY = `- kind: input
  name: ref
  label: Θ_c(s)
- kind: sum
  name: err
  signs: [+, -]
- kind: block
  name: ctrl
  tf: K_p (1 + 1/(T_i s))
- kind: block
  name: plant
  tf: 1/(s(s+2))
- kind: output
  name: out
  label: Θ(s)
- kind: edge
  from: ref
  to: err
  label: Θ_c(s)
- kind: edge
  from: err
  to: ctrl
  label: e(s)
- kind: edge
  from: ctrl
  to: plant
  label: u(s)
- kind: edge
  from: plant
  to: out
  label: Θ(s)
- kind: edge
  from: plant
  to: err
  label: Θ(s)`;

const INCLINE_BODY = `- kind: point
  name: toe
  x: 0
  y: 0
  visible: false
- kind: point
  name: heel
  x: 6
  y: 0
  visible: false
- kind: point
  name: top
  x: 6
  y: 2.18
  visible: false
- kind: polygon
  name: wedge
  vertices:
    - toe
    - heel
    - top
- kind: block
  name: slider
  x: 2.83
  y: 1.56
  width: 1.6
  height: 1
  angle: 20
- kind: point
  name: com
  label: G
  x: 2.83
  y: 1.56
- kind: point
  name: contact
  x: 3
  y: 1.09
  visible: false
- kind: line
  name: slope-face
  from: toe
  to: top
- kind: force
  at: com
  angle: 270
  magnitude: 19.6
  label: mg
- kind: force
  at: contact
  perpendicular-to: slope-face
  magnitude: 18.4
  label: N
- kind: force
  at: contact
  parallel-to: slope-face
  magnitude: 6.7
  label: f
- kind: axes
  at: com
  angle: 20
  x-label: x′
  y-label: y′
- kind: angle-mark
  first: heel
  vertex: toe
  third: top
  label: θ
- kind: dimension
  from: (2.08, 1.29)
  to: (3.58, 1.83)
  label: L`;

/* ------------------------------------------------------------------ *
 * Control — the published Block
 * ------------------------------------------------------------------ */

test("control: the feedback controller publishes with the default flow", () => {
  const result = validateControl("id: pitch-loop\nnumber: true\n", FEEDBACK_BODY);
  assert.deepEqual(result.diagnostics, []);
  const block = result.block;
  assert.ok(block !== undefined);
  assert.equal(block.kind, "control");
  assert.equal(block.pluginVersion, "1.0.0");
  assert.equal(block.id, "pitch-loop");
  assert.equal(block.number, true);
  assert.equal(block.flow, DEFAULT_CONTROL_FLOW);
  assert.equal(block.declarations.length, 10);
  assert.deepEqual(
    block.declarations.map((declaration) => declaration.kind),
    ["input", "sum", "block", "block", "output", "edge", "edge", "edge", "edge", "edge"],
  );
  const sum = block.declarations[1];
  assert.deepEqual(sum.signs, ["+", "-"]);
  const blockItem = block.declarations[2];
  assert.equal(blockItem.name, "ctrl");
  // The shared CircuitText vocabulary reads an unbraced `_`/`^` run greedily to
  // the next marker, so `K_p (1 + ...` is one subscript run; authors bound such
  // a run with braces (`K_{p}`) when they mean the shorter one.
  assert.deepEqual(blockItem.tf, [
    { kind: "text", value: "K" },
    { kind: "subscript", value: "p (1 + 1/(T" },
    { kind: "subscript", value: "i s))" },
  ]);
  assert.deepEqual(block.declarations[5].label, [
    { kind: "text", value: "Θ" },
    { kind: "subscript", value: "c(s)" },
  ]);
});

test("control: an authored flow wins over the default and forward references resolve", () => {
  const result = validateControl(
    "flow: bottom-to-top\n",
    `- kind: edge
  from: a
  to: b
- kind: block
  name: b
  tf: 1
- kind: block
  name: a
  tf: 2`,
  );
  assert.deepEqual(codes(result), []);
  assert.equal(result.block?.flow, "bottom-to-top");
  assert.equal(result.block?.declarations.length, 3);
});

test("control: an empty body publishes no Block", () => {
  const result = validateControl("flow: left-to-right\n", "// nothing here");
  assert.equal(result.block, undefined);
  assert.deepEqual(codes(result), ["empty"]);
});

/* ------------------------------------------------------------------ *
 * Control — structural rules and diagnostics
 * ------------------------------------------------------------------ */

test("control: the bounded topology rules are the only structural errors", () => {
  const fanIn = validateControl(
    "",
    `- kind: block
  name: ctrl
  tf: 1
- kind: edge
  from: ctrl
  to: ctrl
- kind: edge
  from: ctrl
  to: ctrl`,
  );
  assert.deepEqual(codes(fanIn), []);

  const bothIntoOne = validateControl(
    "",
    `- kind: block
  name: ctrl
  tf: 1
- kind: block
  name: other
  tf: 1
- kind: edge
  from: other
  to: ctrl
- kind: edge
  from: other
  to: ctrl`,
  );
  assertCode(bothIntoOne, "port-fan-in");

  const intoStub = validateControl("", `- kind: input\n  name: ref\n  label: r\n- kind: edge\n  from: ref\n  to: ref`);
  assertCode(intoStub, "invalid-edge-endpoint");

  const noInputs = validateControl("", `- kind: sum\n  name: err\n  signs: [+]\n`);
  assertCode(noInputs, "sum-no-inputs");

  const missing = validateControl(
    "",
    `- kind: input\n  name: ref\n  label: r\n- kind: edge\n  from: ref\n  to: nope`,
  );
  assertCode(missing, "unresolved-reference");
});

test("control: ordered summing signs pair with the junction's in-edges", () => {
  const mismatch = validateControl(
    "",
    `- kind: input
  name: ref
  label: r
- kind: input
  name: fb
  label: y
- kind: sum
  name: err
  signs: [+, -, +]
- kind: edge
  from: ref
  to: err
- kind: edge
  from: fb
  to: err`,
  );
  assertCode(mismatch, "sign-count-mismatch", { signs: 3, inputs: 2 });

  const unknownSign = validateControl("", `- kind: sum\n  name: err\n  signs: [+, 0]\n- kind: edge\n  from: err\n  to: err`);
  assertCode(unknownSign, "unknown-sign");

  const malformed = validateControl("", `- kind: sum\n  name: err\n  signs: +, -\n- kind: edge\n  from: err\n  to: err`);
  assertCode(malformed, "invalid-signs");

  const nested = validateControl("", `- kind: sum\n  name: err\n  signs: [+, - -]\n- kind: edge\n  from: err\n  to: err`);
  assertCode(nested, "invalid-signs");
});

test("control: grammar faults carry their own codes", () => {
  assertCode(
    validateControl("", "- kind: mystery\n  name: a"),
    "unknown-declaration",
  );
  assertCode(
    validateControl("", "- kind: block\n  name: a\n  tf: 1\n  shape: box"),
    "unknown-field",
  );
  assertCode(
    validateControl("", "- kind: block\n  name: a\n  tf: 1\n  tf: 2"),
    "duplicate-field",
  );
  assertCode(validateControl("", "- kind: block\n  name: a"), "missing-field");
  assertCode(
    validateControl("", "- kind: input\n  name: ref"),
    "missing-field",
  );
  assertCode(
    validateControl("", "- kind: block\n  name: a\n  tf: 1\n- kind: sum\n  name: a\n  signs: [+]\n"),
    "duplicate-name",
  );
  assertCode(
    validateControl("flow: diagonal\n", "- kind: block\n  name: a\n  tf: 1\n  label: x"),
    "unknown-field",
  );
  assertCode(
    validateControl("", "- kind: block\n  name: a\n  tf: 1\n  label: x_{unclosed"),
    "invalid-label",
  );
  assertCode(
    validateControl("", "- kind: block\n  name: a\n  tf: 1\n  label: x_"),
    "invalid-label",
  );
  // The shared vocabulary inherits its bans on Markdown, HTML and TeX
  // metacharacters, so a control label may not smuggle any of them in.
  for (const banned of ["a < b", "a > b", "a `b`", "a \\alpha"]) {
    assertCode(
      validateControl("", `- kind: block\n  name: a\n  tf: 1\n  label: ${banned}`),
      "invalid-label",
    );
  }
});

test("control: floating ports warn, never fail", () => {
  const dangling = validateControl(
    "",
    `- kind: input
  name: cmd
  label: u
- kind: block
  name: trim
  tf: 1
- kind: edge
  from: cmd
  to: trim`,
  );
  assert.deepEqual(codes(dangling), []);
  const warnings = assertWarningCount(dangling, "unconnected-port", 1);
  assert.deepEqual(warnings[0].data, { item: "trim", port: "out" });
  assert.ok(dangling.block !== undefined);
});

test("control: every ceiling reports through one code", () => {
  const many = Array.from({ length: 65 }, (_, index) => `- kind: block\n  name: b${index}\n  tf: 1`).join("\n");
  assertLimit(validateControl("", many), "block count", 65, MAX_CONTROL_BLOCKS);

  const declarations = Array.from({ length: 257 }, (_, index) => `- kind: block\n  name: b${index}\n  tf: 1`).join("\n");
  assertLimit(validateControl("", declarations), "declaration count", 257, MAX_CONTROL_DECLARATIONS);

  const signs = `[${Array.from({ length: 9 }, () => "+").join(", ")}]`;
  const wide = validateControl(
    "",
    Array.from({ length: 9 }, (_, index) => `- kind: block\n  name: s${index}\n  tf: 1`).join("\n") +
      `\n- kind: sum\n  name: err\n  signs: ${signs}\n` +
      Array.from({ length: 9 }, (_, index) => `- kind: edge\n  from: s${index}\n  to: err`).join("\n"),
  );
  assertLimit(wide, "signs per sum", 9, MAX_CONTROL_SIGNS_PER_SUM);

  const longLabel = "x".repeat(MAX_CONTROL_LABEL_CODE_POINTS + 1);
  assertLimit(
    validateControl("", `- kind: block\n  name: a\n  tf: 1\n  label: ${longLabel}`),
    "label code points",
    MAX_CONTROL_LABEL_CODE_POINTS + 1,
    MAX_CONTROL_LABEL_CODE_POINTS,
  );

  const bulk = Array.from(
    { length: 40 },
    (_, index) => `- kind: block\n  name: c${index}\n  tf: ${"y".repeat(450)}`,
  ).join("\n");
  assertLimit(
    validateControl("", bulk),
    "total label code points",
    18_000,
    MAX_CONTROL_TOTAL_LABEL_CODE_POINTS,
  );
});

/* ------------------------------------------------------------------ *
 * Free-body — the published Block
 * ------------------------------------------------------------------ */

test("free-body: the inclined plane publishes with resolved defaults", () => {
  const result = validateBody("id: incline-block\nnumber: true\nscale: 0.15\n", INCLINE_BODY);
  assert.deepEqual(result.diagnostics, []);
  const block = result.block;
  assert.ok(block !== undefined);
  assert.equal(block.kind, "free-body");
  assert.equal(block.pluginVersion, "1.0.0");
  assert.equal(block.scale, "0.15");
  assert.equal(block.width, 640);
  assert.equal(block.height, 400);
  assert.equal(block.declarations.length, 14);
  const slider = block.declarations[4];
  assert.equal(slider.kind, "block");
  assert.equal(slider.angle, "20");
  assert.equal(slider.visible, true);
  const line = block.declarations[7];
  assert.equal(line.kind, "line");
  assert.equal(line.visible, false);
  assert.equal(line.style, "solid");
  const normal = block.declarations[9];
  assert.deepEqual(normal.direction, { kind: "perpendicular-to", line: "slope-face" });
  assert.equal(normal.magnitude, "18.4");
  assert.equal(normal.length, undefined);
  const axes = block.declarations[11];
  assert.equal(axes.angle, "20");
  assert.deepEqual(axes.xLabel, [{ kind: "text", value: "x′" }]);
  const dimension = block.declarations[13];
  assert.deepEqual(dimension.from, { kind: "coordinates", x: "2.08", y: "1.29" });
  assert.deepEqual(dimension.to, { kind: "coordinates", x: "3.58", y: "1.83" });
});

test("free-body: coordinates canonicalize and angles wrap", () => {
  const result = validateBody(
    "scale: 0.15\n",
    `- kind: point
  name: a
  x: 1.50
  y: -0.0
- kind: point
  name: b
  x: 2
  y: 3
- kind: line
  name: axis
  from: a
  to: b
- kind: force
  at: a
  angle: 380
  magnitude: 2`,
  );
  assert.deepEqual(codes(result), []);
  const [first] = result.block.declarations;
  assert.equal(first.x, "1.5");
  assert.equal(first.y, "0");
  const force = result.block.declarations[3];
  assert.deepEqual(force.direction, { kind: "angle", degrees: "20" });
  assert.equal(result.block.scale, "0.15");
});

test("free-body: the axes labels default to x and y and the attachment may be a point", () => {
  const result = validateBody(
    "",
    `- kind: point
  name: o
  x: 0
  y: 0
- kind: axes
  at: o
- kind: force
  at: o
  angle: 0
  length: 1`,
  );
  assert.deepEqual(result.diagnostics, []);
  const axes = result.block.declarations[1];
  assert.equal(axes.angle, "0");
  assert.deepEqual(axes.xLabel, [{ kind: "text", value: "x" }]);
  assert.deepEqual(axes.yLabel, [{ kind: "text", value: "y" }]);
  assert.deepEqual(axes.at, { kind: "point", name: "o" });
});

test("free-body: an empty body publishes no Block", () => {
  const result = validateBody("", "// nothing here");
  assert.equal(result.block, undefined);
  assert.deepEqual(codes(result), ["empty"]);
});

/* ------------------------------------------------------------------ *
 * Free-body — the scale switch and reference rules
 * ------------------------------------------------------------------ */

test("free-body: the scale switch is exclusive", () => {
  const lengthWithScale = validateBody(
    "scale: 0.15\n",
    `- kind: point
  name: p
  x: 0
  y: 0
- kind: force
  at: p
  angle: 0
  length: 2`,
  );
  assertCode(lengthWithScale, "scale-conflict", { subject: "force[0]", reason: "length-with-scale" });

  const both = validateBody(
    "scale: 0.15\n",
    `- kind: point
  name: p
  x: 0
  y: 0
- kind: force
  at: p
  angle: 0
  magnitude: 2
  length: 3`,
  );
  assertCode(both, "scale-conflict", { subject: "force[0]", reason: "both" });

  const magnitudeWithoutScale = validateBody(
    "",
    `- kind: point
  name: p
  x: 0
  y: 0
- kind: force
  at: p
  angle: 0
  magnitude: 2`,
  );
  assertCode(magnitudeWithoutScale, "scale-conflict", {
    subject: "force[0]",
    reason: "magnitude-without-scale",
  });

  const missingLength = validateBody(
    "",
    `- kind: point
  name: p
  x: 0
  y: 0
- kind: force
  at: p
  angle: 0`,
  );
  assert.deepEqual(codes(missingLength), ["missing-field"]);
});

test("free-body: scale and direction faults carry their own codes", () => {
  assertCode(
    validateBody("scale: 0\n", `- kind: point\n  name: p\n  x: 0\n  y: 0`),
    "invalid-scale",
  );
  assertCode(
    validateBody(
      "scale: 0.15\n",
      `- kind: point
  name: p
  x: 0
  y: 0
- kind: point
  name: q
  x: 1
  y: 1
- kind: line
  name: l
  from: p
  to: q
- kind: force
  at: p
  angle: 0
  parallel-to: l
  magnitude: 1`,
    ),
    "conflicting-fields",
  );
  assertCode(
    validateBody(
      "scale: 0.15\n",
      `- kind: polygon
  name: wedge
  vertices:
    - a
    - b
    - c
- kind: point
  name: a
  x: 0
  y: 0
- kind: point
  name: b
  x: 1
  y: 0
- kind: point
  name: c
  x: 0
  y: 1
- kind: force
  at: a
  perpendicular-to: wedge
  magnitude: 1`,
    ),
    "invalid-reference-target",
  );
  assertCode(
    validateBody(
      "scale: 0.15\n",
      `- kind: point
  name: p
  x: 0
  y: 0
- kind: force
  at: nowhere
  angle: 0
  magnitude: 1`,
    ),
    "unresolved-reference",
  );
  assertCode(
    validateBody(
      "scale: 0.15\n",
      `- kind: point
  name: p
  x: 0
  y: 0
- kind: force
  at: (0, )
  angle: 0
  magnitude: 1`,
    ),
    "invalid-coordinate",
  );
  assertCode(
    validateBody(
      "scale: 0.15\n",
      `- kind: point
  name: p
  x: 0
  y: 0
- kind: moment
  at: p
  direction: sideways`,
    ),
    "unknown-direction",
  );
  assertCode(
    validateBody(
      "scale: 0.15\n",
      `- kind: point
  name: p
  x: 0
  y: 0
- kind: axes
  at: p
  angle: later`,
    ),
    "unknown-direction",
  );
});

test("free-body: labels carry the same shared vocabulary and its bans", () => {
  assertCode(
    validateBody(
      "",
      `- kind: point\n  name: p\n  x: 0\n  y: 0\n  label: x_{unclosed`,
    ),
    "invalid-label",
  );
  assertCode(
    validateBody(
      "",
      `- kind: point\n  name: p\n  x: 0\n  y: 0\n- kind: axes\n  at: p\n  x-label: a < b`,
    ),
    "invalid-label",
  );
});

test("free-body: only the two registered warnings exist", () => {
  const unused = validateBody(
    "",
    `- kind: point
  name: a
  x: 0
  y: 0
- kind: point
  name: b
  x: 1
  y: 0
- kind: line
  name: orphan
  from: a
  to: b`,
  );
  assert.deepEqual(codes(unused), []);
  assertWarningCount(unused, "unused-declaration", 1);

  const outOfBounds = validateBody(
    "width: 200\nheight: 200\nbounds:\n  min-x: 0\n  min-y: 0\n  max-x: 1\n  max-y: 1\n",
    `- kind: point
  name: a
  x: 0
  y: 0
- kind: point
  name: b
  x: 9
  y: 9
- kind: line
  name: reach
  from: a
  to: b`,
  );
  assert.deepEqual(codes(outOfBounds), []);
  const outside = assertWarningCount(outOfBounds, "out-of-bounds", 2);
  assert.deepEqual(
    outside.flatMap((diagnostic) => diagnostic.data.names).sort(),
    ["b", "reach"],
  );
});

test("free-body: every ceiling reports through one code", () => {
  const declarations = Array.from(
    { length: 257 },
    (_, index) => `- kind: point\n  name: p${index}\n  x: 0\n  y: 0`,
  ).join("\n");
  assertLimit(
    validateBody("", declarations),
    "declarations",
    257,
    MAX_FREE_BODY_DECLARATIONS,
  );

  const vertices = Array.from({ length: 65 }, (_, index) => `    - v${index}`).join("\n");
  const points = Array.from(
    { length: 65 },
    (_, index) => `- kind: point\n  name: v${index}\n  x: ${index}\n  y: 0`,
  ).join("\n");
  assertLimit(
    validateBody("", `${points}\n- kind: polygon\n  name: shape\n  vertices:\n${vertices}`),
    "polygon vertices",
    65,
    MAX_FREE_BODY_POLYGON_VERTICES,
  );

  assertLimit(
    validateBody(
      "",
      `- kind: point\n  name: p\n  x: ${MAX_FREE_BODY_COORDINATE_MAGNITUDE + 1}\n  y: 0`,
    ),
    "coordinate x",
    MAX_FREE_BODY_COORDINATE_MAGNITUDE + 1,
    MAX_FREE_BODY_COORDINATE_MAGNITUDE,
  );

  assertLimit(
    validateBody("width: 4097\n", `- kind: point\n  name: p\n  x: 0\n  y: 0`),
    "width",
    4097,
    MAX_FREE_BODY_DIMENSION_PX,
  );

  assertLimit(
    validateBody(
      "scale: 0.15\n",
      `- kind: point\n  name: p\n  x: 0\n  y: 0\n- kind: force\n  at: p\n  angle: 0\n  magnitude: 1\n  label: ${"z".repeat(501)}`,
    ),
    "label",
    501,
    500,
  );
});
