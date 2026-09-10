import assert from "node:assert/strict";
import test from "node:test";

import { readFile } from "node:fs/promises";
import { createCompiler } from "../dist/index.js";

function circuitSource(body, { convention = "iec", header = "title: Test circuit\n", fence = "::::" } = {}) {
  return `---\nazemark: 2\nx-circuit-symbol-convention: ${convention}\n---\n\n${fence} circuit\n${header}----\n${body}\n${fence}\n`;
}

function diagnosticCodes(result) {
  return result.diagnostics.map(({ code }) => code);
}

function errorCodes(result) {
  return result.diagnostics.filter(({ severity }) => severity === "error").map(({ code }) => code);
}

function circuitBlock(document) {
  const block = document.blocks.find((candidate) => candidate.kind === "circuit");
  assert.ok(block, "missing circuit block");
  return block;
}

async function documentedCircuitSource(documentName, id) {
  const source = await readFile(new URL(`../docs/language/${documentName}`, import.meta.url), "utf8");
  assert.match(source, /^---\n(?:.*\n)*x-circuit-symbol-convention: iec\n/m);
  const directive = source.match(new RegExp(String.raw`(?<fence>:{4,}) circuit\nid: ${id}\n[\s\S]*?\n\k<fence>(?=\n|$)`));
  assert.ok(directive, `missing ${id} circuit fixture in ${documentName}`);
  const fence = directive.groups?.fence;
  assert.ok(fence);
  const normalizedDirective = directive[0].replaceAll(fence, "::::");
  return `---\nazemark: 2\nx-circuit-symbol-convention: iec\n---\n\n${normalizedDirective}\n`;
}

const ANALOG_BODY = `- kind: node
  ref: supply
- kind: node
  ref: output
- kind: node
  ref: ground
  role: reference
- kind: voltage-source
  ref: V1
  value: 5 V
- kind: resistor
  ref: R1
  value: 1 kohm
- kind: capacitor
  ref: C1
  value: 1 uF
- kind: connect
  terminal: V1.positive
  node: supply
- kind: connect
  terminal: V1.negative
  node: ground
- kind: connect
  terminal: R1.a
  node: supply
- kind: connect
  terminal: R1.b
  node: output
- kind: connect
  terminal: C1.a
  node: output
- kind: connect
  terminal: C1.b
  node: ground`;

const DIGITAL_COMPONENTS = [
  ["and", "AND", 2, ["in1", "in2", "out"]],
  ["or", "OR", 3, ["in1", "in2", "in3", "out"]],
  ["nand", "NAND", 4, ["in1", "in2", "in3", "in4", "out"]],
  ["nor", "NOR", 2, ["in1", "in2", "out"]],
  ["xor", "XOR", 3, ["in1", "in2", "in3", "out"]],
  ["xnor", "XNOR", 4, ["in1", "in2", "in3", "in4", "out"]],
  ["not", "NOT", undefined, ["in", "out"]],
  ["buffer", "BUF", undefined, ["in", "out"]],
  ["mux-2to1", "M2", undefined, ["d0", "d1", "s0", "out"]],
  ["mux-4to1", "M4", undefined, ["d0", "d1", "d2", "d3", "s0", "s1", "out"]],
  ["d-flip-flop", "FF", undefined, ["d", "clk", "q"]],
];

const DIGITAL_BODY = [
  "- kind: node\n  ref: net",
  "- kind: digital-input\n  ref: IN\n  name: IN",
  "- kind: digital-output\n  ref: OUT\n  name: OUT",
  ...DIGITAL_COMPONENTS.map(([kind, ref, inputs]) => `- kind: ${kind}\n  ref: ${ref}${inputs === undefined ? "" : `\n  inputs: ${inputs}`}`),
  "- kind: connect\n  terminal: IN.out\n  node: net",
  "- kind: connect\n  terminal: OUT.in\n  node: net",
  ...DIGITAL_COMPONENTS.flatMap(([, name, , terminals]) =>
    terminals.map((terminal) => `- kind: connect\n  terminal: ${name}.${terminal}\n  node: net`),
  ),
].join("\n");

test("Circuit accepts explicitly bound analog components and preserves incidence order", () => {
  const compiler = createCompiler();
  const parsed = compiler.parse(circuitSource(ANALOG_BODY), { sourceName: "analog.aze.md" });
  assert.deepEqual(errorCodes(parsed), []);

  const validated = compiler.validate(parsed);
  assert.deepEqual(validated.diagnostics, []);
  const [block] = validated.document.blocks;
  assert.equal(block.kind, "circuit");
  assert.equal(block.components.length, 3);
  assert.equal(block.relations.length, 6);
  assert.deepEqual(
    block.relations.map(({ componentRef, terminal, nodeId }) => `${componentRef}.${terminal}:${nodeId}`),
    ["V1.positive:supply", "V1.negative:ground", "R1.a:supply", "R1.b:output", "C1.a:output", "C1.b:ground"],
  );
});

test("Circuit accepts the closed digital vocabulary with every terminal explicitly bound", () => {
  const compiler = createCompiler();
  const parsed = compiler.parse(circuitSource(DIGITAL_BODY), { sourceName: "digital.aze.md" });
  assert.deepEqual(errorCodes(parsed), []);

  const validated = compiler.validate(parsed);
  assert.deepEqual(validated.diagnostics, []);
  const [block] = validated.document.blocks;
  assert.equal(block.kind, "circuit");
  assert.deepEqual(
    block.components.map(({ kind }) => kind),
    ["digital-input", "digital-output", ...DIGITAL_COMPONENTS.map(([kind]) => kind)],
  );
});

test("Canonical clocked, floating, and disconnected circuit fixtures retain their semantic scenarios", async () => {
  const compiler = createCompiler();
  const clocked = await compiler.compile(await documentedCircuitSource("01-happy-paths.aze.md", "clocked-logic"), { format: "html" });
  assert.ok(clocked.document);
  assert.deepEqual(errorCodes(clocked), []);
  const clockedBlock = circuitBlock(clocked.document);
  assert.equal(clockedBlock.kind, "circuit");
  assert.deepEqual(
    clockedBlock.components.map(({ ref }) => ref),
    ["DIN", "EN", "CLK", "D2", "D3", "S0", "S1", "SEL", "U1", "FF1", "FF2", "M1"],
  );
  assert.deepEqual(
    clockedBlock.relations.filter(({ componentRef }) => componentRef === "M1").map(({ terminal, nodeId }) => `${terminal}:${nodeId}`),
    ["d0:ff1-q", "d1:ff2-q", "d2:d2", "d3:d3", "s0:s0", "s1:s1", "out:sel"],
  );

  const floating = await compiler.compile(await documentedCircuitSource("03-circuit-scenarios.aze.md", "floating-clock-circuit"), { format: "html" });
  assert.ok(floating.document);
  assert.deepEqual(errorCodes(floating), []);
  const floatingBlock = circuitBlock(floating.document);
  assert.equal(floatingBlock.kind, "circuit");
  assert.equal(floatingBlock.nodes.some(({ role }) => role === "reference"), false);
  assert.ok(diagnosticCodes(floating).includes("azeforge.circuit#unused-node"));

  const disconnected = await compiler.compile(await documentedCircuitSource("03-circuit-scenarios.aze.md", "disconnected-instructional"), { format: "html" });
  assert.ok(disconnected.document);
  assert.deepEqual(errorCodes(disconnected), []);
  assert.equal(diagnosticCodes(disconnected).filter((code) => code === "azeforge.circuit#unused-node").length, 1);
  assert.equal(diagnosticCodes(disconnected).filter((code) => code === "azeforge.circuit#disconnected-subgraph").length, 2);
});

test("Circuit rejects malformed declarations and incomplete terminal bindings", async () => {
  const cases = [
    ["unknown component", ANALOG_BODY.replace("- kind: resistor", "- kind: transformer"), "azeforge.circuit#unknown-component-kind"],
    ["unknown terminal", ANALOG_BODY.replace("terminal: R1.a", "terminal: R1.wiper"), "azeforge.circuit#unknown-terminal"],
    ["duplicate terminal binding", ANALOG_BODY.replace("terminal: R1.b", "terminal: R1.a"), "azeforge.circuit#duplicate-terminal-binding"],
    ["unbound terminal", ANALOG_BODY.replace("- kind: connect\n  terminal: C1.b\n  node: ground", ""), "azeforge.circuit#unbound-terminal"],
    ["unsupported fixed digital component field", DIGITAL_BODY.replace("ref: NOT", "ref: NOT\n  name: NOT"), "azeforge.circuit#unknown-field"],
    ["invalid gate fan-in", DIGITAL_BODY.replace("ref: AND\n  inputs: 2", "ref: AND\n  inputs: 5"), "azeforge.circuit#invalid-inputs"],
  ];

  const compiler = createCompiler();
  for (const [name, body, code] of cases) {
    const compiled = await compiler.compile(circuitSource(body), { format: "html" });
    assert.equal(compiled.document, undefined, name);
    assert.ok(errorCodes(compiled).includes(code), `${name}: ${diagnosticCodes(compiled).join(", ")}`);
  }
});

test("Circuit requires its title, document convention, and directive separator", async () => {
  const compiler = createCompiler();
  const sources = [
    circuitSource(ANALOG_BODY, { header: "" }),
    `---\nazemark: 2\n---\n\n:::: circuit\ntitle: Test circuit\n----\n${ANALOG_BODY}\n::::\n`,
    `---\nazemark: 2\nx-circuit-symbol-convention: iec\n---\n\n:::: circuit\ntitle: Test circuit\n${ANALOG_BODY}\n::::\n`,
  ];
  for (const source of sources) {
    const compiled = await compiler.compile(source, { format: "html" });
    assert.equal(compiled.document, undefined);
    assert.ok(errorCodes(compiled).length > 0, diagnosticCodes(compiled).join(", "));
  }
});

test("Circuit warns for unused nodes and disconnected component-bearing subgraphs without rejecting floating designs", async () => {
  const compiler = createCompiler();
  const floating = await compiler.compile(
    circuitSource(`${ANALOG_BODY}\n- kind: node\n  ref: spare`),
    { format: "html" },
  );
  assert.ok(floating.document);
  assert.equal(errorCodes(floating).length, 0);
  assert.ok(diagnosticCodes(floating).includes("azeforge.circuit#unused-node"));

  const disconnected = await compiler.compile(
    circuitSource(`- kind: node
  ref: left-a
- kind: node
  ref: left-b
- kind: node
  ref: right-a
- kind: node
  ref: right-b
- kind: resistor
  ref: R1
  value: 1 ohm
- kind: resistor
  ref: R2
  value: 2 ohm
- kind: connect
  terminal: R1.a
  node: left-a
- kind: connect
  terminal: R1.b
  node: left-b
- kind: connect
  terminal: R2.a
  node: right-a
- kind: connect
  terminal: R2.b
  node: right-b`),
    { format: "html" },
  );
  assert.ok(disconnected.document);
  assert.equal(errorCodes(disconnected).length, 0);
  assert.ok(diagnosticCodes(disconnected).includes("azeforge.circuit#disconnected-subgraph"));
});

test("Circuit enforces the 512 explicit relation ceiling before rendering", async () => {
  const relations = Array.from({ length: 513 }, () => "- kind: connect\n  terminal: R1.a\n  node: n").join("\n");
  const source = circuitSource(`- kind: node
  ref: n
- kind: resistor
  ref: R1
  value: 1 ohm
- kind: connect
  terminal: R1.b
  node: n
${relations}`);
  const compiled = await createCompiler().compile(source, { format: "html" });
  assert.equal(compiled.document, undefined);
  assert.ok(errorCodes(compiled).includes("azeforge.circuit#limit-exceeded"), diagnosticCodes(compiled).join(", "));
});

test("Circuit identity is stable, includes its convention, and renders terminal ports and digital symbol labels", async () => {
  const compiler = createCompiler();
  const iec = circuitSource(ANALOG_BODY, { convention: "iec" });
  const ansi = circuitSource(ANALOG_BODY, { convention: "ansi" });
  const [first, second, svg, ansiHtml, ansiSvg, digitalSvg] = await Promise.all([
    compiler.compile(iec, { format: "html" }),
    compiler.compile(iec, { format: "html" }),
    compiler.compile(iec, { format: "svg" }),
    compiler.compile(ansi, { format: "html" }),
    compiler.compile(ansi, { format: "svg" }),
    compiler.compile(circuitSource(DIGITAL_BODY), { format: "svg" }),
  ]);

  for (const result of [first, second, svg, ansiHtml, ansiSvg, digitalSvg]) {
    assert.deepEqual(result.diagnostics, []);
    assert.ok(result.artifact);
  }
  assert.equal(first.contentHash, second.contentHash);
  assert.equal(first.contentHash, svg.contentHash);
  assert.notEqual(first.contentHash, ansiHtml.contentHash);
  assert.equal(ansiHtml.contentHash, ansiSvg.contentHash);
  assert.deepEqual(first.artifact.bytes, second.artifact.bytes);
  assert.equal(first.artifact.metadata.artifactHash, second.artifact.metadata.artifactHash);

  const html = Buffer.from(first.artifact.bytes).toString("utf8");
  const svgText = Buffer.from(svg.artifact.bytes).toString("utf8");
  assert.match(html, /<figure class="aze-circuit"/);
  assert.match(html, /<svg\b/);
  assert.match(html, /role="img"/);
  assert.match(svgText, /<svg\b/);
  assert.match(svgText, /role="img"/);
  const digitalSvgText = Buffer.from(digitalSvg.artifact.bytes).toString("utf8");
  assert.match(svgText, /class="aze-circuit-terminal"/);
  assert.match(svgText, /id="aze-circuit-[^"]+-port-V1-positive"/);
  assert.match(digitalSvgText, /id="aze-circuit-[^"]+-port-FF-d"/);
  assert.match(digitalSvgText, /id="aze-circuit-[^"]+-port-M4-s1"/);
  assert.match(digitalSvgText, />&amp;<\/text>/);
  assert.match(digitalSvgText, />4:1 MUX<\/text>/);
  assert.match(digitalSvgText, />D<\/text>/);
  assert.match(digitalSvgText, />Q<\/text>/);
});
