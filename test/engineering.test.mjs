import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createCompiler } from "../dist/index.js";

const SCENARIOS = readFileSync(
  new URL("../docs/language/10-engineering-scenarios.aze.md", import.meta.url),
  "utf8",
);
const SCENARIO_SOURCE = "docs/language/10-engineering-scenarios.aze.md";

function envelope(body, { header = "", fence = "::::", directive = "control" } = {}) {
  return `---\nazemark: 2\n---\n\n${fence} ${directive}\n${header}----\n${body}\n${fence}\n`;
}

function errorCodes(result) {
  return result.diagnostics
    .filter(({ severity }) => severity === "error")
    .map(({ code }) => code)
    .sort();
}

function warnings(result, prefix) {
  return result.diagnostics.filter(
    ({ severity, code }) => severity === "warning" && code.startsWith(prefix),
  );
}

function blockOf(result, kind) {
  const block = result.document.blocks.find((entry) => entry.kind === kind);
  assert.ok(block !== undefined, `expected a ${kind} Block`);
  assert.notEqual(block.kind, "invalid");
  return block;
}

/** Extract one documented scenario Block by id and re-wrap it as a Document. */
function documentedSource(directive, id) {
  for (const found of SCENARIOS.matchAll(new RegExp(`^:::: ${directive}\\r?\\n([\\s\\S]*?)^::::$`, "gm"))) {
    const [header, body] = found[1].split(/\r?\n----\r?\n/);
    if (!header.includes(`id: ${id}`)) continue;
    return envelope(body, { header: `${header}\n`, directive });
  }
  throw new Error(`no ${directive} Block with id ${id} in ${SCENARIO_SOURCE}`);
}

test("Engineering: the documented feedback controller compiles with no diagnostics", async () => {
  const compiler = createCompiler();
  const result = await compiler.compile(documentedSource("control", "pitch-loop"), {
    format: "html",
    sourceName: SCENARIO_SOURCE,
  });
  assert.deepEqual(result.diagnostics, []);
  const block = blockOf(result, "control");
  assert.equal(block.id, "pitch-loop");
  assert.equal(block.flow, "left-to-right");
  assert.equal(block.pluginVersion, "1.0.0");
  const html = Buffer.from(result.artifact.bytes).toString("utf8");
  assert.match(html, /data-control-id="pitch-loop"/);
  assert.match(html, /class="aze-control"/);
});

test("Engineering: the documented inclined plane compiles with no diagnostics", async () => {
  const compiler = createCompiler();
  const result = await compiler.compile(documentedSource("free-body", "incline-block"), {
    format: "html",
    sourceName: SCENARIO_SOURCE,
  });
  assert.deepEqual(result.diagnostics, []);
  const block = blockOf(result, "free-body");
  assert.equal(block.scale, "0.15");
  assert.equal(block.declarations.length, 14);
  const html = Buffer.from(result.artifact.bytes).toString("utf8");
  assert.match(html, /data-free-body-id="incline-block"/);
  assert.match(html, /class="aze-free-body"/);
});

test("Engineering: a floating port warns and still publishes the Block", async () => {
  const result = createCompiler().parse(
    documentedSource("control", "floating-trim"),
  );
  assert.deepEqual(errorCodes(result), []);
  assert.deepEqual(
    warnings(result, "azeforge.control#").map(({ code, data }) => [code, data]),
    [["azeforge.control#unconnected-port", { item: "y", port: "in" }]],
  );
  assert.equal(blockOf(result, "control").declarations.length, 5);
});

test("Engineering: structural faults carry their sub-ranged codes and publish nothing", () => {
  const cases = [
    [
      "unknown declaration",
      envelope("- kind: mystery\n  name: a"),
      "azeforge.control#unknown-declaration",
    ],
    [
      "sign count against three in-edges",
      envelope(
        "- kind: input\n  name: ref\n  label: r\n- kind: input\n  name: fb\n  label: y\n- kind: sum\n  name: err\n  signs: [+]\n- kind: edge\n  from: ref\n  to: err\n- kind: edge\n  from: fb\n  to: err",
      ),
      "azeforge.control#sign-count-mismatch",
    ],
    [
      "unknown sign token",
      envelope("- kind: sum\n  name: err\n  signs: [+, 0]\n- kind: edge\n  from: err\n  to: err"),
      "azeforge.control#unknown-sign",
    ],
    [
      "fan-in on a single-input block",
      envelope(
        "- kind: input\n  name: r1\n  label: u\n- kind: input\n  name: r2\n  label: v\n- kind: block\n  name: a\n  tf: 1\n- kind: edge\n  from: r1\n  to: a\n- kind: edge\n  from: r2\n  to: a",
      ),
      "azeforge.control#port-fan-in",
    ],
    [
      "edge into an input stub",
      envelope("- kind: input\n  name: ref\n  label: r\n- kind: edge\n  from: ref\n  to: ref"),
      "azeforge.control#invalid-edge-endpoint",
    ],
    [
      "unresolved reference",
      envelope("- kind: block\n  name: a\n  tf: 1\n- kind: edge\n  from: a\n  to: missing"),
      "azeforge.control#unresolved-reference",
    ],
    [
      "sum with no in-edges",
      envelope("- kind: sum\n  name: err\n  signs: [+]\n"),
      "azeforge.control#sum-no-inputs",
    ],
  ];
  for (const [name, source, code] of cases) {
    const result = createCompiler().parse(source);
    assert.ok(errorCodes(result).includes(code), `${name} expected ${code}, saw ${errorCodes(result)}`);
    assert.equal(result.document.blocks[0].kind, "invalid", `${name} must publish no Block`);
  }
});

test("Engineering: free-body faults carry their sub-ranged codes and publish nothing", () => {
  const cases = [
    [
      "relative direction onto a body",
      envelope(
        "- kind: polygon\n  name: wedge\n  vertices:\n    - a\n    - b\n    - c\n- kind: point\n  name: a\n  x: 0\n  y: 0\n- kind: point\n  name: b\n  x: 1\n  y: 0\n- kind: point\n  name: c\n  x: 0\n  y: 1\n- kind: force\n  at: a\n  perpendicular-to: wedge\n  magnitude: 1",
        { header: "scale: 0.15\n", directive: "free-body" },
      ),
      "azeforge.free-body#invalid-reference-target",
    ],
    [
      "authored length with an explicit scale",
      envelope("- kind: point\n  name: p\n  x: 0\n  y: 0\n- kind: force\n  at: p\n  angle: 0\n  length: 2", {
        header: "scale: 0.15\n",
        directive: "free-body",
      }),
      "azeforge.free-body#scale-conflict",
    ],
    [
      "non-positive scale",
      envelope("- kind: point\n  name: p\n  x: 0\n  y: 0", {
        header: "scale: 0\n",
        directive: "free-body",
      }),
      "azeforge.free-body#invalid-scale",
    ],
    [
      "two direction forms on one vector",
      envelope(
        "- kind: point\n  name: p\n  x: 0\n  y: 0\n- kind: point\n  name: q\n  x: 1\n  y: 1\n- kind: line\n  name: l\n  from: p\n  to: q\n- kind: force\n  at: p\n  angle: 0\n  parallel-to: l\n  length: 1",
        { directive: "free-body" },
      ),
      "azeforge.free-body#conflicting-fields",
    ],
    [
      "malformed attachment",
      envelope("- kind: point\n  name: p\n  x: 0\n  y: 0\n- kind: force\n  at: (0, )\n  angle: 0\n  length: 1", {
        directive: "free-body",
      }),
      "azeforge.free-body#invalid-coordinate",
    ],
  ];
  for (const [name, source, code] of cases) {
    const result = createCompiler().parse(source);
    assert.ok(errorCodes(result).includes(code), `${name} expected ${code}, saw ${errorCodes(result)}`);
    assert.equal(result.document.blocks[0].kind, "invalid", `${name} must publish no Block`);
  }
});

test("Engineering: the corrective sampler reports the documented codes", () => {
  const signMismatch = createCompiler().parse(
    envelope(
      "- kind: input\n  name: ref\n  label: r\n- kind: input\n  name: fb\n  label: y\n- kind: sum\n  name: err\n  signs: [+, -, +]\n- kind: edge\n  from: ref\n  to: err\n- kind: edge\n  from: fb\n  to: err",
      { header: "id: control-sign-mismatch\nnumber: false\n" },
    ),
  );
  const mismatch = signMismatch.diagnostics.find(
    ({ code }) => code === "azeforge.control#sign-count-mismatch",
  );
  assert.deepEqual(mismatch?.data, { signs: 3, inputs: 2 });

  const scaleConflict = createCompiler().parse(
    envelope(
      "- kind: point\n  name: p\n  x: 0\n  y: 0\n- kind: force\n  at: p\n  angle: 270\n  magnitude: 10\n  length: 2\n  label: F",
      { header: "id: free-body-scale-conflict\nnumber: false\nscale: 0.15\n", directive: "free-body" },
    ),
  );
  const conflict = scaleConflict.diagnostics.find(
    ({ code }) => code === "azeforge.free-body#scale-conflict",
  );
  assert.equal(conflict?.data.reason, "both");
});

test("Engineering: contentHash follows authored content, not rendering", async () => {
  const compiler = createCompiler();
  const source = documentedSource("control", "pitch-loop");
  const light = await compiler.compile(source, { format: "html", theme: "default" });
  const dark = await compiler.compile(source, { format: "html", theme: "dark-presentation" });
  assert.equal(light.contentHash, dark.contentHash);
  assert.notEqual(
    light.artifact.metadata.rendererFingerprint,
    dark.artifact.metadata.rendererFingerprint,
  );

  const svg = await compiler.compile(source, { format: "svg" });
  assert.equal(svg.contentHash, light.contentHash);

  const relabelled = compiler.compile(source.replace("  tf: 1/(s(s+2))", "  tf: 1/(s(s+3))"), {
    format: "html",
  });
  assert.notEqual(relabelled.contentHash, light.contentHash);
});

test("Engineering: free-body contentHash follows the scale switch and authored coordinates", async () => {
  const compiler = createCompiler();
  const source = documentedSource("free-body", "incline-block");
  const scaled = await compiler.compile(source, { format: "html" });
  const schematic = await compiler.compile(
    source
      .replace("scale: 0.15\n", "")
      .replace(/  magnitude: ([0-9.]+)/g, "  length: 2"),
    { format: "html" },
  );
  assert.notEqual(scaled.contentHash, schematic.contentHash);

  const moved = await compiler.compile(source.replace("  x: 2.83\n  y: 1.56\n  width: 1.6", "  x: 2.9\n  y: 1.56\n  width: 1.6"), {
    format: "html",
  });
  assert.notEqual(moved.contentHash, scaled.contentHash);
});

test("Engineering: both directives render as static SVG figures", async () => {
  const compiler = createCompiler();
  for (const [directive, id] of [
    ["control", "pitch-loop"],
    ["free-body", "incline-block"],
  ]) {
    const result = await compiler.compile(documentedSource(directive, id), { format: "svg" });
    const svg = Buffer.from(result.artifact.bytes).toString("utf8");
    assert.match(svg, new RegExp(`data-${directive}-id="${id}"`));
    assert.match(svg, /role="img"/);
    assert.doesNotMatch(svg, /<script/i);
    assert.doesNotMatch(svg, /\son[a-z]+=/i);
  }
});
