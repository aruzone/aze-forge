import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_DIAGRAM_DECLARATIONS,
  MAX_DIAGRAM_EDGES,
  MAX_DIAGRAM_GROUPS,
  MAX_DIAGRAM_GROUP_DEPTH,
  MAX_DIAGRAM_LABEL_CODE_POINTS,
  MAX_DIAGRAM_LABEL_LINES,
  MAX_DIAGRAM_NODES,
  MAX_DIAGRAM_PARALLEL_EDGES,
  MAX_DIAGRAM_PORTS,
  MAX_DIAGRAM_PORTS_PER_NODE,
  MAX_DIAGRAM_TOTAL_LABEL_CODE_POINTS,
  validateDiagramBlock,
} from "../dist/diagram.js";

const BLOCK_RANGE = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 100, offset: 100 },
};

function toLines(text, startLine) {
  return text
    .split("\n")
    .filter((line) => line !== "")
    .map((line, index) => {
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

function validate(header, body) {
  return validateDiagramBlock({
    headerLines: toLines(header, 10),
    bodyLines: toLines(body, 100),
    blockRange: BLOCK_RANGE,
    sourceName: "diagram.aze.md",
  });
}

function diagram(result) {
  assert.notEqual(result.block, undefined, `expected a block, saw ${codes(result).join(", ")}`);
  return result.block;
}

function codes(result, severity = "error") {
  return result.diagnostics
    .filter((diagnostic) => diagnostic.severity === severity)
    .map((diagnostic) => diagnostic.code.replace("azeforge.diagram#", ""));
}

function assertCode(result, code, data) {
  const matches = result.diagnostics.filter(
    (diagnostic) => diagnostic.code === `azeforge.diagram#${code}`,
  );
  assert.equal(matches.length, 1, `expected one ${code}, saw [${result.diagnostics.map((d) => d.code).join(", ")}]`);
  if (data !== undefined) assert.deepEqual(matches[0].data, data);
  return matches[0];
}

function assertOnly(result, expected) {
  assert.deepEqual(codes(result).sort(), [...expected].sort());
  assert.deepEqual(codes(result, "warning"), [], "errors must not produce warnings");
}

function assertLimit(result, subject, count, limit) {
  const found = result.diagnostics.filter(
    (diagnostic) =>
      diagnostic.code === "azeforge.diagram#limit-exceeded" &&
      diagnostic.data.subject === subject,
  );
  assert.equal(found.length, 1, `expected one ${subject} ceiling, saw ${JSON.stringify(result.diagnostics.map((d) => d.data))}`);
  assert.deepEqual(found[0].data, { subject, count, limit });
}

const FLOWCHART_HEADER = "mode: flowchart\n";

/* ------------------------------------------------------------------ *
 * Contract scenarios
 * ------------------------------------------------------------------ */

const BRANCHING_PROCESS = `- kind: node
  name: intake
  label: Intake request
  shape: rounded
- kind: node
  name: review
  label: Review
  shape: diamond
  ports:
    - name: approve
      side: right
    - name: reject
      side: bottom
- kind: node
  name: revise
  label: Revise | draft
- kind: node
  name: publish
  label: Publish
  shape: hexagon
- kind: edge
  from: intake
  to: review
- kind: edge
  from: review.approve
  to: publish
  label: yes
- kind: edge
  from: review.reject
  to: revise
  label: no
- kind: edge
  from: revise
  to: review
  label: resubmit`;

test("a branching process with a cycle validates and keeps authored order", () => {
  const result = validate(
    "id: review-flow\nmode: flowchart\nnumber: true\nflow: top-to-bottom\n",
    BRANCHING_PROCESS,
  );
  assert.deepEqual(result.diagnostics, []);
  const block = diagram(result);
  assert.equal(block.kind, "diagram");
  assert.equal(block.pluginVersion, "1.0.0");
  assert.deepEqual(block.range, BLOCK_RANGE);
  assert.equal(block.id, "review-flow");
  assert.equal(block.number, true);
  assert.equal(block.mode, "flowchart");
  assert.equal(block.flow, "top-to-bottom");
  assert.deepEqual(
    block.declarations.map((declaration) => declaration.kind),
    ["node", "node", "node", "node", "edge", "edge", "edge", "edge"],
  );

  const review = block.declarations[1];
  assert.equal(review.name, "review");
  assert.equal(review.shape, "diamond");
  assert.deepEqual(
    review.ports.map((port) => [port.name, port.side ?? null]),
    [
      ["approve", "right"],
      ["reject", "bottom"],
    ],
  );
  assert.deepEqual(review.label, [[{ kind: "text", value: "Review" }]]);
  assert.equal(Object.hasOwn(review, "parent"), false);

  const intake = block.declarations[0];
  assert.equal(intake.shape, "rounded");
  assert.deepEqual(intake.ports, []);
  assert.deepEqual(intake.label, [[{ kind: "text", value: "Intake request" }]]);

  const revise = block.declarations[2];
  assert.equal(revise.shape, "rectangle");
  assert.deepEqual(revise.label, [
    [{ kind: "text", value: "Revise" }],
    [{ kind: "text", value: "draft" }],
  ]);

  const [first, second] = block.declarations.slice(4);
  assert.equal(first.from.name, "intake");
  assert.equal(Object.hasOwn(first.from, "port"), false);
  assert.equal(first.to.name, "review");
  assert.equal(first.direction, "directed");
  assert.equal(Object.hasOwn(first, "label"), false);
  assert.equal(second.from.name, "review");
  assert.equal(second.from.port, "approve");
  assert.deepEqual(second.label, [[{ kind: "text", value: "yes" }]]);
});

const TREE_WITH_FORWARD_REFERENCES = `- kind: edge
  from: root
  to: alpha
- kind: edge
  from: root
  to: beta
- kind: edge
  from: alpha
  to: leaf
  label: deep
- kind: node
  name: root
  label: Root
  shape: circle
- kind: node
  name: alpha
  label: Alpha
  parent: cluster
- kind: node
  name: beta
  label: Beta
  parent: cluster
- kind: node
  name: leaf
  label: Leaf
- kind: group
  name: cluster
  label: Cluster`;

test("a tree with forward references resolves in two passes", () => {
  const result = validate("mode: tree\n", TREE_WITH_FORWARD_REFERENCES);
  assert.deepEqual(result.diagnostics, []);
  const block = diagram(result);
  assert.equal(block.mode, "tree");
  assert.equal(block.flow, "top-to-bottom");
  assert.deepEqual(
    block.declarations.map((declaration) =>
      declaration.kind === "edge" ? `${declaration.from.name}->${declaration.to.name}` : declaration.name,
    ),
    ["root->alpha", "root->beta", "alpha->leaf", "root", "alpha", "beta", "leaf", "cluster"],
  );
  assert.equal(block.declarations[4].parent, "cluster");
  assert.equal(block.declarations[5].parent, "cluster");
  assert.equal(Object.hasOwn(block.declarations[6], "parent"), false);
  assert.deepEqual(block.declarations[2].label, [[{ kind: "text", value: "deep" }]]);
  assert.equal(block.declarations[7].kind, "group");
});

const GROUPED_ARCHITECTURE = `- kind: group
  name: edge-tier
  label: Edge tier
- kind: group
  name: service-tier
  label: Service tier
  parent: edge-tier
- kind: group
  name: data-tier
  label: Data tier
  parent: service-tier
- kind: group
  name: spare-tier
  label: Spare
- kind: node
  name: gateway
  label: Gateway
  parent: edge-tier
  ports:
    - name: north
      side: top
    - name: south
      side: bottom
- kind: node
  name: orders
  label: Orders
  parent: service-tier
  ports:
    - name: in
      side: left
    - name: out
      side: right
- kind: node
  name: store
  label: Store
  parent: data-tier
  ports:
    - name: conn
- kind: edge
  from: gateway.south
  to: orders.in
- kind: edge
  from: gateway.south
  to: orders.in
  direction: undirected
  label: fallback
- kind: edge
  from: orders.out
  to: store.conn
  direction: undirected`;

test("a grouped architecture holds nested groups, ports and undirected multi-edges", () => {
  const result = validate("id: tiered\nmode: architecture\n", GROUPED_ARCHITECTURE);
  assert.deepEqual(codes(result), []);
  const block = diagram(result);
  assert.equal(block.flow, "left-to-right");
  const groups = block.declarations.filter((declaration) => declaration.kind === "group");
  assert.deepEqual(
    groups.map((group) => group.parent ?? null),
    [null, "edge-tier", "service-tier", null],
  );
  const store = block.declarations.find((declaration) => declaration.kind === "node" && declaration.name === "store");
  assert.deepEqual(store.ports, [{ name: "conn", range: store.ports[0].range }]);
  const edges = block.declarations.filter((declaration) => declaration.kind === "edge");
  assert.equal(edges.length, 3);
  assert.deepEqual(edges.map((edge) => edge.direction), ["directed", "undirected", "undirected"]);
  assert.deepEqual(
    codes(result, "warning"),
    ["unused-port", "empty-group"],
  );
  assert.deepEqual(
    result.diagnostics.map((diagnostic) => diagnostic.data),
    [
      { name: "north", node: "gateway" },
      { name: "spare-tier" },
    ],
  );
});

/* ------------------------------------------------------------------ *
 * Envelope, header and field faults
 * ------------------------------------------------------------------ */

test("an empty body is #empty and publishes no block", () => {
  const result = validate(FLOWCHART_HEADER, "// nothing here\n");
  assertCode(result, "empty");
  assertOnly(result, ["empty"]);
  assert.equal(result.block, undefined);
});

test("a missing mode is #unknown-mode", () => {
  const absent = validate("id: x\n", "- kind: node\n  name: a");
  assertCode(absent, "unknown-mode", { field: "mode" });
  assertOnly(absent, ["unknown-mode"]);
  const unregistered = validate("mode: flowchart2\n", "- kind: node\n  name: a");
  assertCode(unregistered, "unknown-mode", { field: "mode" });
  assertOnly(unregistered, ["unknown-mode"]);
});

test("an unregistered flow is #unknown-flow and the mode default otherwise", () => {
  assertCode(validate("mode: flowchart\nflow: sideways\n", "- kind: node\n  name: a"), "unknown-flow", {
    field: "flow",
  });
  const selfLoop = "- kind: node\n  name: a\n- kind: edge\n  from: a\n  to: a";
  const tree = "- kind: node\n  name: r\n- kind: node\n  name: a\n- kind: edge\n  from: r\n  to: a";
  for (const [mode, flow, body] of [
    ["flowchart", "top-to-bottom", selfLoop],
    ["tree", "top-to-bottom", tree],
    ["graph", "left-to-right", selfLoop],
    ["architecture", "left-to-right", selfLoop],
  ]) {
    const result = validate(`mode: ${mode}\n`, body);
    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.block.flow, flow, `${mode} default flow`);
  }
  const explicit = validate("mode: graph\nflow: bottom-to-top\n", selfLoop);
  assert.equal(explicit.block.flow, "bottom-to-top");
});

test("unregistered header keys report #unknown-field while id/number pass through", () => {
  const stray = validate(
    "mode: flowchart\nnumber: maybe\ncolour: red\nnumber: true\n",
    "- kind: node\n  name: a\n- kind: edge\n  from: a\n  to: a",
  );
  assertCode(stray, "unknown-field", { field: "colour" });
  assertOnly(stray, ["unknown-field"]);

  // The same header without the stray key still compiles, and `id`/`number`
  // stay out of the block: this family reads them, it does not validate them.
  const result = validate(
    "mode: flowchart\nnumber: maybe\nnumber: true\n",
    "- kind: node\n  name: a\n- kind: edge\n  from: a\n  to: a",
  );
  assert.deepEqual(result.diagnostics, []);
  const block = diagram(result);
  assert.equal(Object.hasOwn(block, "number"), false);
  assert.equal(Object.hasOwn(block, "id"), false);
  assert.equal(Object.hasOwn(block, "title"), false);
  assert.deepEqual(Object.keys(block), [
    "kind",
    "pluginVersion",
    "range",
    "mode",
    "flow",
    "declarations",
  ]);
});

test("title and description parse as inline text and reject invalid characters", () => {
  const result = validate(
    "mode: flowchart\ntitle: Clocked logic\ndescription: t_{su} budget\n",
    "- kind: node\n  name: a",
  );
  const block = diagram(result);
  assert.deepEqual(block.title, [{ kind: "text", value: "Clocked logic" }]);
  assert.deepEqual(block.description, [
    { kind: "text", value: "t" },
    { kind: "subscript", value: "su" },
    { kind: "text", value: " budget" },
  ]);
  assertCode(validate("mode: flowchart\ntitle:\n", "- kind: node\n  name: a"), "invalid-label");
});

test("required body fields report #missing-field with the field name", () => {
  const missingName = validate(FLOWCHART_HEADER, "- kind: node\n  shape: circle");
  assertCode(missingName, "missing-field", { field: "name" });
  assertOnly(missingName, ["missing-field"]);

  const emptyName = validate(FLOWCHART_HEADER, "- kind: node\n  name:");
  assertCode(emptyName, "missing-field", { field: "name" });

  const missingGroupName = validate(FLOWCHART_HEADER, "- kind: group\n  label: Lost");
  assertCode(missingGroupName, "missing-field", { field: "name" });

  const missingTo = validate(FLOWCHART_HEADER, "- kind: node\n  name: a\n- kind: edge\n  from: a");
  assertCode(missingTo, "missing-field", { field: "to" });
  assertOnly(missingTo, ["missing-field"]);

  const missingFrom = validate(FLOWCHART_HEADER, "- kind: node\n  name: a\n- kind: edge\n  to: a");
  assertCode(missingFrom, "missing-field", { field: "from" });

  const missingPortName = validate(
    FLOWCHART_HEADER,
    "- kind: node\n  name: a\n  ports:\n    - name: x\n    - side: left",
  );
  assertCode(missingPortName, "missing-field", { field: "name" });
  assertOnly(missingPortName, ["missing-field"]);
});

test("unregistered declarations and fields report #unknown-declaration and #unknown-field", () => {
  const kind = validate(FLOWCHART_HEADER, "- kind: thing\n  name: a");
  assert.equal(kind.diagnostics[0].code, "azeforge.diagram#unknown-declaration");
  assert.deepEqual(kind.diagnostics[0].data, {});
  assertOnly(kind, ["unknown-declaration"]);

  const itemShape = validate(FLOWCHART_HEADER, "  name: a");
  assertOnly(itemShape, ["unknown-declaration", "empty"]);

  const strayRecord = validate(FLOWCHART_HEADER, "- kind: node\n  name: a\n  - name: b");
  assertOnly(strayRecord, ["unknown-declaration"]);

  const nodeField = validate(FLOWCHART_HEADER, "- kind: node\n  name: a\n  colour: red");
  assertCode(nodeField, "unknown-field", { field: "colour" });

  const groupField = validate(FLOWCHART_HEADER, "- kind: group\n  name: g\n  shape: circle");
  assertCode(groupField, "unknown-field", { field: "shape" });

  const edgeField = validate(FLOWCHART_HEADER, "- kind: node\n  name: a\n- kind: edge\n  from: a\n  to: a\n  name: e");
  assertCode(edgeField, "unknown-field", { field: "name" });

  const portField = validate(
    FLOWCHART_HEADER,
    "- kind: node\n  name: a\n  ports:\n    - name: x\n      direction: out",
  );
  assertCode(portField, "unknown-field", { field: "direction" });

  const direction = validate(
    FLOWCHART_HEADER,
    "- kind: node\n  name: a\n- kind: edge\n  from: a\n  to: a\n  direction: sideways",
  );
  assertCode(direction, "unknown-field", { field: "direction" });
  assertOnly(direction, ["unknown-field"]);
});

test("the closed shape and side vocabularies accept every registered value", () => {
  for (const shape of [
    "rectangle",
    "rounded",
    "diamond",
    "parallelogram",
    "circle",
    "hexagon",
    "cylinder",
  ]) {
    const result = validate(
      FLOWCHART_HEADER,
      `- kind: node\n  name: a\n  shape: ${shape}\n- kind: edge\n  from: a\n  to: a`,
    );
    assert.deepEqual(result.diagnostics, [], shape);
    assert.equal(diagram(result).declarations[0].shape, shape);
  }

  const ports = [
    "- kind: node\n  name: a\n  ports:",
    ...["left", "right", "top", "bottom"].map((side) => `    - name: ${side}\n      side: ${side}`),
    ...["left", "right", "top", "bottom"].map((side) => `- kind: edge\n  from: a.${side}\n  to: a.${side}`),
  ].join("\n");
  const result = validate(FLOWCHART_HEADER, ports);
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(
    diagram(result).declarations[0].ports.map((port) => [port.name, port.side]),
    [
      ["left", "left"],
      ["right", "right"],
      ["top", "top"],
      ["bottom", "bottom"],
    ],
  );

  assertCode(
    validate(FLOWCHART_HEADER, "- kind: node\n  name: a\n  shape: star"),
    "unknown-shape",
    { field: "shape" },
  );
  assertCode(
    validate(FLOWCHART_HEADER, "- kind: node\n  name: a\n  ports:\n    - name: out\n      side: sideways"),
    "unknown-side",
    { field: "side" },
  );
});

test("repeated fields and names report #duplicate-field, #duplicate-name and #duplicate-port", () => {
  const field = validate(FLOWCHART_HEADER, "- kind: node\n  name: a\n  name: b");
  assertCode(field, "duplicate-field", { field: "name" });

  const nodeNames = validate(FLOWCHART_HEADER, "- kind: node\n  name: a\n- kind: node\n  name: a");
  assertCode(nodeNames, "duplicate-name", { name: "a" });
  assertOnly(nodeNames, ["duplicate-name"]);

  const mixed = validate(FLOWCHART_HEADER, "- kind: group\n  name: a\n- kind: node\n  name: a");
  assertCode(mixed, "duplicate-name", { name: "a" });

  const port = validate(
    FLOWCHART_HEADER,
    "- kind: node\n  name: a\n  ports:\n    - name: out\n    - name: out",
  );
  assertCode(port, "duplicate-port", { name: "out", node: "a" });
});

test("reference resolution reports #unresolved-reference, #unresolved-port and #invalid-port-reference", () => {
  const endpoint = validate(
    FLOWCHART_HEADER,
    "- kind: node\n  name: a\n- kind: edge\n  from: a\n  to: ghost",
  );
  assertCode(endpoint, "unresolved-reference", { name: "ghost" });

  const parent = validate(FLOWCHART_HEADER, "- kind: node\n  name: a\n  parent: ghost");
  assertCode(parent, "unresolved-reference", { name: "ghost" });

  const parentNode = validate(FLOWCHART_HEADER, "- kind: node\n  name: a\n- kind: node\n  name: b\n  parent: a");
  assertCode(parentNode, "unresolved-reference", { name: "a" });

  const unresolvedPort = validate(
    FLOWCHART_HEADER,
    "- kind: node\n  name: a\n  ports:\n    - name: out\n- kind: edge\n  from: a.missing\n  to: a.out",
  );
  assertCode(unresolvedPort, "unresolved-port", { name: "a.missing" });

  for (const reference of ["a.b.c", "a..b", ".b", "a."]) {
    const result = validate(
      FLOWCHART_HEADER,
      `- kind: node\n  name: a\n- kind: edge\n  from: ${reference}\n  to: a`,
    );
    assertCode(result, "invalid-port-reference", { name: reference });
  }
});

test("groups are containers and containment cycles are reported", () => {
  const endpoint = validate(
    FLOWCHART_HEADER,
    "- kind: group\n  name: g1\n- kind: node\n  name: a\n  parent: g1\n- kind: edge\n  from: g1\n  to: a",
  );
  assertCode(endpoint, "group-endpoint", { name: "g1" });

  const cycle = validate(
    FLOWCHART_HEADER,
    "- kind: group\n  name: g1\n  parent: g2\n- kind: group\n  name: g2\n  parent: g1\n- kind: node\n  name: a\n  parent: g1",
  );
  assertCode(cycle, "group-cycle", { chain: ["g1", "g2", "g1"] });

  const selfCycle = validate(
    FLOWCHART_HEADER,
    "- kind: group\n  name: g1\n  parent: g1\n- kind: node\n  name: a\n  parent: g1",
  );
  assertCode(selfCycle, "group-cycle", { chain: ["g1", "g1"] });

  const acyclic = validate(
    FLOWCHART_HEADER,
    "- kind: group\n  name: outer\n- kind: group\n  name: inner\n  parent: outer\n- kind: node\n  name: a\n  parent: inner\n- kind: edge\n  from: a\n  to: a",
  );
  assert.deepEqual(acyclic.diagnostics, []);
});

test("#undirected-not-permitted is scoped to flowchart and tree", () => {
  const body = "- kind: node\n  name: a\n- kind: edge\n  from: a\n  to: a\n  direction: undirected";
  assertCode(validate("mode: flowchart\n", body), "undirected-not-permitted");
  assertCode(validate("mode: tree\n", body), "undirected-not-permitted");
  assert.deepEqual(validate("mode: graph\n", body).diagnostics, []);
  assert.deepEqual(validate("mode: architecture\n", body).diagnostics, []);
});

/* ------------------------------------------------------------------ *
 * Tree structure
 * ------------------------------------------------------------------ */

const VALID_TREE = "- kind: node\n  name: r\n- kind: node\n  name: a\n- kind: node\n  name: b\n- kind: edge\n  from: r\n  to: a\n- kind: edge\n  from: r\n  to: b";

test("a well-formed tree validates", () => {
  const result = validate("mode: tree\n", VALID_TREE);
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.block.mode, "tree");
});

test("every #invalid-tree reason is reachable", () => {
  const fixtures = {
    "no-root": "- kind: node\n  name: a\n- kind: node\n  name: b\n- kind: edge\n  from: a\n  to: b\n- kind: edge\n  from: b\n  to: a",
    "multiple-roots": "- kind: node\n  name: r\n- kind: node\n  name: a\n- kind: node\n  name: spare\n- kind: edge\n  from: r\n  to: a",
    "multiple-parents": "- kind: node\n  name: r\n- kind: node\n  name: a\n- kind: node\n  name: b\n- kind: edge\n  from: r\n  to: b\n- kind: edge\n  from: a\n  to: b",
    "self-loop": "- kind: node\n  name: a\n- kind: edge\n  from: a\n  to: a",
    cycle: "- kind: node\n  name: a\n- kind: node\n  name: b\n- kind: node\n  name: c\n- kind: edge\n  from: a\n  to: b\n- kind: edge\n  from: b\n  to: c\n- kind: edge\n  from: c\n  to: a",
    "not-connected": "- kind: node\n  name: r\n- kind: node\n  name: a\n- kind: node\n  name: spare\n- kind: edge\n  from: r\n  to: a",
  };
  for (const [reason, body] of Object.entries(fixtures)) {
    const result = validate("mode: tree\n", body);
    const found = result.diagnostics.filter(
      (diagnostic) => diagnostic.code === "azeforge.diagram#invalid-tree",
    );
    assert.ok(
      found.some((diagnostic) => diagnostic.data.reason === reason),
      `${reason}: saw ${JSON.stringify(result.diagnostics.map((diagnostic) => diagnostic.data))}`,
    );
    assert.equal(result.block, undefined, reason);
  }
});

/* ------------------------------------------------------------------ *
 * Labels
 * ------------------------------------------------------------------ */

test("labels are bounded inline text, one CircuitText per authored line", () => {
  const result = validate(
    FLOWCHART_HEADER,
    "- kind: node\n  name: a\n  label: t_{su} | yes\n- kind: node\n  name: b\n  label: plain",
  );
  assert.deepEqual(diagram(result).declarations[0].label, [
    [
      { kind: "text", value: "t" },
      { kind: "subscript", value: "su" },
    ],
    [{ kind: "text", value: "yes" }],
  ]);
  assert.deepEqual(diagram(result).declarations[1].label, [[{ kind: "text", value: "plain" }]]);
});

test("labels that fail the inline text subset report #invalid-label", () => {
  for (const body of [
    "- kind: node\n  name: a\n  label:",
    "- kind: node\n  name: a\n  label: a_{b",
    "- kind: node\n  name: a\n  label: a^{b{c}}",
    "- kind: node\n  name: a\n  label: _{}\n- kind: node\n  name: b",
  ]) {
    const result = validate(FLOWCHART_HEADER, body);
    assertCode(result, "invalid-label");
    assert.equal(result.block, undefined);
  }
});

/* ------------------------------------------------------------------ *
 * Warnings and their mode scoping
 * ------------------------------------------------------------------ */

test("isolated nodes are silent in graph and reported elsewhere", () => {
  const body = "- kind: node\n  name: a\n- kind: node\n  name: lonely\n- kind: edge\n  from: a\n  to: a";
  const flowchart = validate("mode: flowchart\n", body);
  assert.deepEqual(codes(flowchart, "warning"), ["disconnected-component", "isolated-node"]);
  assert.deepEqual(
    flowchart.diagnostics.find((diagnostic) => diagnostic.code === "azeforge.diagram#isolated-node").data,
    { name: "lonely" },
  );

  const graph = validate("mode: graph\n", body);
  assert.deepEqual(codes(graph, "warning"), ["disconnected-component"]);

  const tree = validate("mode: tree\n", "- kind: node\n  name: r\n- kind: node\n  name: a\n- kind: edge\n  from: r\n  to: a");
  assert.deepEqual(codes(tree, "warning"), []);
});

test("disconnected components are reported beyond the first, in authored order", () => {
  const body = [
    "- kind: node\n  name: alpha",
    "- kind: node\n  name: one",
    "- kind: node\n  name: two",
    "- kind: node\n  name: beta",
    "- kind: node\n  name: three",
    "- kind: edge\n  from: one\n  to: two",
    "- kind: edge\n  from: two\n  to: three",
  ].join("\n");
  const result = validate("mode: graph\n", body);
  assert.deepEqual(codes(result), []);
  assert.deepEqual(codes(result, "warning"), ["disconnected-component", "disconnected-component"]);
  assert.deepEqual(
    result.diagnostics.map((diagnostic) => diagnostic.data.names),
    [
      ["one", "two", "three"],
      ["beta"],
    ],
  );
});

test("warnings are computed only for a sound declaration list", () => {
  const result = validate(
    FLOWCHART_HEADER,
    "- kind: node\n  name: a\n- kind: group\n  name: g\n- kind: node\n  name: lonely\n- kind: edge\n  from: a\n  to: ghost",
  );
  assertOnly(result, ["unresolved-reference"]);
});

/* ------------------------------------------------------------------ *
 * Ceilings
 * ------------------------------------------------------------------ */

function nodes(count, extra = "") {
  return Array.from({ length: count }, (_, index) => `- kind: node\n  name: n${index}${extra}`).join("\n");
}

test("declaration, node, edge and group ceilings report their subjects", () => {
  const big = validate(FLOWCHART_HEADER, `${nodes(129)}\n- kind: edge\n  from: n0\n  to: n1`);
  assertLimit(big, "node count", 129, MAX_DIAGRAM_NODES);
  assert.equal(
    big.diagnostics.some((diagnostic) => diagnostic.data.subject === "declaration count"),
    false,
  );

  const manyEdges = Array.from(
    { length: MAX_DIAGRAM_EDGES + 1 },
    (_, index) => `- kind: edge\n  from: n${index % 20}\n  to: n${Math.floor(index / 20) % 20}`,
  ).join("\n");
  const edgeHeavy = validate(FLOWCHART_HEADER, `${nodes(20)}\n${manyEdges}`);
  assertLimit(edgeHeavy, "edge count", MAX_DIAGRAM_EDGES + 1, MAX_DIAGRAM_EDGES);

  const groups = Array.from(
    { length: MAX_DIAGRAM_GROUPS + 1 },
    (_, index) => `- kind: group\n  name: g${index}`,
  ).join("\n");
  const groupHeavy = validate(FLOWCHART_HEADER, `${groups}\n- kind: node\n  name: a`);
  assertLimit(groupHeavy, "group count", MAX_DIAGRAM_GROUPS + 1, MAX_DIAGRAM_GROUPS);

  const manyNodes = Array.from({ length: 200 }, (_, index) => `- kind: node\n  name: n${index}`).join("\n");
  const manyEdgesSmall = Array.from(
    { length: 314 },
    (_, index) => `- kind: edge\n  from: n${index % 200}\n  to: n${(index * 7 + 1) % 200}`,
  ).join("\n");
  const declarationHeavy = validate(FLOWCHART_HEADER, `${manyNodes}\n${manyEdgesSmall}`);
  assertLimit(declarationHeavy, "declaration count", 514, MAX_DIAGRAM_DECLARATIONS);
});

test("group depth, port and parallel-edge ceilings report their subjects", () => {
  const deep = [
    "- kind: group\n  name: g1",
    "- kind: group\n  name: g2\n  parent: g1",
    "- kind: group\n  name: g3\n  parent: g2",
    "- kind: group\n  name: g4\n  parent: g3",
    "- kind: group\n  name: g5\n  parent: g4",
    "- kind: node\n  name: a\n  parent: g5",
  ].join("\n");
  assertCode(validate(FLOWCHART_HEADER, deep), "limit-exceeded", {
    subject: "group depth",
    count: MAX_DIAGRAM_GROUP_DEPTH + 1,
    limit: MAX_DIAGRAM_GROUP_DEPTH,
  });

  const perNode = Array.from(
    { length: MAX_DIAGRAM_PORTS_PER_NODE + 1 },
    (_, index) => `    - name: p${index}`,
  ).join("\n");
  const wide = validate(FLOWCHART_HEADER, `- kind: node\n  name: a\n  ports:\n${perNode}`);
  assertCode(wide, "limit-exceeded", {
    subject: "ports per node",
    count: MAX_DIAGRAM_PORTS_PER_NODE + 1,
    limit: MAX_DIAGRAM_PORTS_PER_NODE,
  });

  const ported = Array.from(
    { length: 11 },
    (_, node) =>
      `- kind: node\n  name: n${node}\n  ports:\n${Array.from(
        { length: 12 },
        (_, port) => `    - name: p${port}`,
      ).join("\n")}`,
  ).join("\n");
  const total = validate(FLOWCHART_HEADER, ported);
  assertCode(total, "limit-exceeded", {
    subject: "port count",
    count: 132,
    limit: MAX_DIAGRAM_PORTS,
  });
  assert.equal(
    total.diagnostics.some((diagnostic) => diagnostic.data.subject === "ports per node"),
    false,
  );

  const parallel = validate(
    FLOWCHART_HEADER,
    `- kind: node\n  name: a\n- kind: node\n  name: b\n${Array.from(
      { length: MAX_DIAGRAM_PARALLEL_EDGES + 1 },
      () => "- kind: edge\n  from: a\n  to: b",
    ).join("\n")}`,
  );
  assertCode(parallel, "limit-exceeded", {
    subject: "parallel edges",
    count: MAX_DIAGRAM_PARALLEL_EDGES + 1,
    limit: MAX_DIAGRAM_PARALLEL_EDGES,
  });
});

test("label ceilings report code points, lines and the Block total", () => {
  const long = "x".repeat(MAX_DIAGRAM_LABEL_CODE_POINTS + 1);
  assertCode(validate(FLOWCHART_HEADER, `- kind: node\n  name: a\n  label: ${long}`), "limit-exceeded", {
    subject: "label code points",
    count: MAX_DIAGRAM_LABEL_CODE_POINTS + 1,
    limit: MAX_DIAGRAM_LABEL_CODE_POINTS,
  });

  const manyLines = Array.from({ length: MAX_DIAGRAM_LABEL_LINES + 1 }, () => "line").join(" | ");
  assertCode(validate(FLOWCHART_HEADER, `- kind: node\n  name: a\n  label: ${manyLines}`), "limit-exceeded", {
    subject: "label lines",
    count: MAX_DIAGRAM_LABEL_LINES + 1,
    limit: MAX_DIAGRAM_LABEL_LINES,
  });

  const full = "y".repeat(MAX_DIAGRAM_LABEL_CODE_POINTS);
  const heavy = Array.from(
    { length: 33 },
    (_, index) => `- kind: node\n  name: n${index}\n  label: ${full}`,
  ).join("\n");
  assertCode(validate(FLOWCHART_HEADER, heavy), "limit-exceeded", {
    subject: "total label code points",
    count: 33 * MAX_DIAGRAM_LABEL_CODE_POINTS,
    limit: MAX_DIAGRAM_TOTAL_LABEL_CODE_POINTS,
  });
});

test("did-you-mean stays inside the registered vocabularies", () => {
  const suggestion = (result, code) => {
    const diagnostic = result.diagnostics.find(
      (entry) => entry.code === `azeforge.diagram#${code}`,
    );
    assert.notEqual(diagnostic, undefined, `expected ${code}`);
    return diagnostic.suggestion ?? "";
  };

  assert.equal(
    suggestion(
      validate("mode: flowchart\n", "- kind: node\n  name: a\n  shape: diamon\n"),
      "unknown-shape",
    ),
    'Did you mean "diamond"?',
  );
  assert.equal(
    suggestion(validate("mode: state\n", "- kind: node\n  name: a\n"), "unknown-mode"),
    "Registered values: flowchart, graph, tree, architecture.",
  );
  assert.equal(
    suggestion(
      validate("mode: flowchart\n", "- kind: port\n  name: a\n"),
      "unknown-declaration",
    ),
    "Registered values: node, group, edge.",
  );
  assert.equal(
    suggestion(
      validate("mode: flowchart\n", "- kind: node\n  name: a\n  colour: red\n"),
      "unknown-field",
    ),
    "Registered values: name, label, shape, parent, ports.",
  );

  // Structural faults are not vocabulary faults: no suggestion is invented.
  const unresolved = validate("mode: flowchart\n", "- kind: edge\n  from: a\n  to: b\n");
  assert.ok(
    unresolved.diagnostics.every((diagnostic) => diagnostic.suggestion === undefined),
    "a structural fault carries no did-you-mean",
  );
});
