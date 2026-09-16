import assert from "node:assert/strict";
import test from "node:test";

import { readFile } from "node:fs/promises";
import { createCompiler } from "../dist/index.js";

function modelsSource(body, { header = "", fence = "::::", directive = "sequence" } = {}) {
  return `---\nazemark: 2\n---\n\n${fence} ${directive}\n${header}----\n${body}\n${fence}\n`;
}

function errorCodes(result) {
  return result.diagnostics
    .filter((diagnostic) => diagnostic.severity === "error")
    .map((diagnostic) => diagnostic.code)
    .sort();
}

function warnings(result) {
  return result.diagnostics.filter((diagnostic) => diagnostic.severity === "warning");
}

function blockOf(result, kind) {
  const block = result.document?.blocks.find((entry) => entry.kind === kind);
  assert.ok(block, `expected a ${kind} Block`);
  return block;
}

async function documentedSource(id) {
  const source = await readFile(
    new URL("../docs/language/10-models.aze.md", import.meta.url),
    "utf8",
  );
  const directive = source.match(
    new RegExp(String.raw`(?<fence>:{4,}) (sequence|state|entity|class)\nid: ${id}\n[\s\S]*?\n\k<fence>(?=\n|$)`),
  );
  assert.ok(directive, `missing ${id} fixture in 10-models.aze.md`);
  return `---\nazemark: 2\n---\n\n${directive[0].replaceAll(directive.groups.fence, "::::")}\n`;
}

test("Models parses the documented login exchange from the scenario document", async () => {
  const result = createCompiler().parse(await documentedSource("login-exchange"));
  assert.deepEqual(errorCodes(result), []);
  assert.deepEqual(warnings(result), []);
  const block = blockOf(result, "sequence");
  assert.equal(block.id, "login-exchange");
  assert.equal(block.number, true);
  assert.deepEqual(
    block.participants.map((participant) => participant.name),
    ["user", "web", "auth", "store"],
  );
  assert.equal(block.timeline.length, 5);
});

test("Models parses the documented order lifecycle from the scenario document", async () => {
  const result = createCompiler().parse(await documentedSource("order-lifecycle"));
  assert.deepEqual(errorCodes(result), []);
  assert.deepEqual(warnings(result), []);
  const block = blockOf(result, "state");
  assert.equal(block.id, "order-lifecycle");
  const names = block.items.map((item) => item.name ?? `${item.from}->${item.to}`);
  assert.ok(names.includes("Payment"));
  assert.ok(names.includes("Draft->Payment"));
});

test("Models parses the documented shop schema and payment classes", async () => {
  const compiler = createCompiler();
  const schema = compiler.parse(await documentedSource("shop-schema"));
  assert.deepEqual(errorCodes(schema), []);
  assert.deepEqual(warnings(schema), []);
  const classes = compiler.parse(await documentedSource("payment-classes"));
  assert.deepEqual(errorCodes(classes), []);
  assert.deepEqual(warnings(classes), []);
  assert.equal(blockOf(classes, "class").id, "payment-classes");
});

test("The four models directives are registered capability types", async () => {
  const result = createCompiler().parse(
    modelsSource("timeline:", { header: "id: empty\n", directive: "sequence" }),
  );
  assert.deepEqual(errorCodes(result), ["azeforge.sequence#missing-field"]);
});

test("Models reports each negative contract scenario in its own namespace", () => {
  const compiler = createCompiler();
  const cases = [
    {
      name: "sequence unresolved participant",
      directive: "sequence",
      body: "participants:\n  - name: user\n  - name: web\ntimeline:\n  - kind: message\n    from: user\n    to: database\n    text: fetch user",
      codes: ["azeforge.sequence#unresolved-reference"],
    },
    {
      name: "sequence unbalanced activation",
      directive: "sequence",
      body: "participants:\n  - name: user\ntimeline:\n  - kind: message\n    from: user\n    to: user\n    activate: true",
      codes: ["azeforge.sequence#unbalanced-activation"],
    },
    {
      name: "state multiple initials",
      directive: "state",
      body: "- kind: initial\n  name: start1\n- kind: initial\n  name: start2\n- kind: state\n  name: idle\n- kind: transition\n  from: start1\n  to: idle\n- kind: transition\n  from: start2\n  to: idle",
      codes: ["azeforge.state#multiple-initials"],
    },
    {
      name: "entity authored range",
      directive: "entity",
      body: "- kind: entity\n  name: Customer\n  attributes:\n    - name: id\n      keys:\n        - primary\n- kind: entity\n  name: Order\n  attributes:\n    - name: id\n      keys:\n        - primary\n- kind: relationship\n  first:\n    entity: Customer\n    cardinality: one\n  second:\n    entity: Order\n    cardinality: 0..*",
      codes: ["azeforge.entity#unknown-kind"],
    },
    {
      name: "class multiplicity on inheritance",
      directive: "class",
      body: "- kind: class\n  name: Animal\n- kind: class\n  name: Dog\n- kind: relationship\n  form: inheritance\n  from: Dog\n  to: Animal\n  from-multiplicity: one",
      codes: ["azeforge.class#multiplicity-on-ranked-relationship"],
    },
  ];
  for (const entry of cases) {
    const result = compiler.parse(
      modelsSource(entry.body, { header: "id: contract-case\n", directive: entry.directive }),
    );
    assert.deepEqual(errorCodes(result), entry.codes, entry.name);
    assert.equal(
      result.document?.blocks.some((block) => block.kind === entry.directive),
      false,
      `${entry.name}: an invalid Block is never published`,
    );
  }
});

test("Models keeps warning-only topology out of the error path", () => {
  const result = createCompiler().parse(
    modelsSource("- kind: entity\n  name: Audit", { header: "id: warnings\n", directive: "entity" }),
  );
  assert.deepEqual(errorCodes(result), []);
  assert.deepEqual(
    warnings(result).map((diagnostic) => diagnostic.code).sort(),
    ["azeforge.entity#no-primary-key", "azeforge.entity#unrelated-entity"],
  );
  assert.equal(blockOf(result, "entity").name, undefined);
});

test("Models contentHash ignores rendering and follows authored content", async () => {
  const compiler = createCompiler();
  const source = await documentedSource("login-exchange");
  const light = await compiler.compile(source, { format: "html", theme: "default" });
  const dark = await compiler.compile(source, { format: "html", theme: "dark-presentation" });
  assert.equal(light.contentHash, dark.contentHash);
  assert.notEqual(
    light.artifact.metadata.rendererFingerprint,
    dark.artifact.metadata.rendererFingerprint,
  );

  const svg = await compiler.compile(source, { format: "svg" });
  assert.equal(svg.contentHash, light.contentHash);

  const reordered = await compiler.compile(
    source.replace("    text: Verify session", "    text: Verify session now"),
    { format: "html" },
  );
  assert.notEqual(reordered.contentHash, light.contentHash);
});

test("Models renders the documented sequence Block as a static figure", async () => {
  const compiler = createCompiler();
  const result = await compiler.compile(await documentedSource("login-exchange"), { format: "svg" });
  const svg = Buffer.from(result.artifact.bytes).toString("utf8");
  assert.match(svg, /class="aze-sequence"/);
  assert.match(svg, /data-sequence-id="login-exchange"/);
  assert.match(svg, /role="img"/);
  assert.doesNotMatch(svg, /<script/i);
  assert.doesNotMatch(svg, /\son[a-z]+=/i);
  const viewBox = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  assert.ok(viewBox, "the figure carries a viewBox");
  assert.ok(Number(viewBox[1]) <= 4096 && Number(viewBox[2]) <= 16384);
});
