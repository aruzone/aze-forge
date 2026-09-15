import assert from "node:assert/strict";
import test from "node:test";

import { readFile } from "node:fs/promises";
import { createCompiler } from "../dist/index.js";

function diagramSource(
  body,
  { header = "mode: flowchart\n", fence = "::::" } = {},
) {
  return `---\nazemark: 2\n---\n\n${fence} diagram\n${header}----\n${body}\n${fence}\n`;
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

function diagramBlock(result) {
  const block = result.document?.blocks.find((entry) => entry.kind === "diagram");
  assert.ok(block, "expected a diagram Block");
  return block;
}

async function documentedDiagramSource(documentName, id) {
  const source = await readFile(
    new URL(`../docs/language/${documentName}`, import.meta.url),
    "utf8",
  );
  const directive = source.match(
    new RegExp(String.raw`(?<fence>:{4,}) diagram\nid: ${id}\n[\s\S]*?\n\k<fence>(?=\n|$)`),
  );
  assert.ok(directive, `missing ${id} diagram fixture in ${documentName}`);
  return `---\nazemark: 2\n---\n\n${directive[0]}\n`;
}

const BRANCHING_PROCESS = `- kind: node
  name: start
  label: Start
  shape: circle
- kind: node
  name: classify
  label: Classify request?
  shape: diamond
- kind: node
  name: cache
  label: Serve from cache
- kind: node
  name: origin
  label: Fetch from origin
- kind: node
  name: store
  label: Store result
  shape: cylinder
- kind: edge
  from: start
  to: classify
- kind: edge
  from: classify
  to: cache
  label: hit
- kind: edge
  from: classify
  to: origin
  label: miss
- kind: edge
  from: origin
  to: store
- kind: edge
  from: store
  to: cache
  label: warm
- kind: edge
  from: cache
  to: classify
  label: recheck`;

const SERVICE_ARCHITECTURE = `- kind: group
  name: edge-tier
  label: Edge tier
- kind: group
  name: data-tier
  label: Data tier
- kind: group
  name: persistence
  label: Persistence
  parent: data-tier
- kind: node
  name: client
  label: Browser
  parent: edge-tier
- kind: node
  name: gateway
  label: API gateway
  parent: edge-tier
  shape: hexagon
  ports:
    - name: inbound
      side: left
    - name: upstream
      side: right
- kind: node
  name: primary
  label: Primary database
  parent: persistence
  shape: cylinder
- kind: node
  name: replica
  label: Read replica
  parent: persistence
  shape: cylinder
- kind: edge
  from: client
  to: gateway.inbound
- kind: edge
  from: gateway.upstream
  to: primary
  direction: undirected
- kind: edge
  from: gateway.upstream
  to: replica
  direction: undirected
- kind: edge
  from: gateway.upstream
  to: replica
  label: fallback
  direction: undirected`;

test("Diagram parses the branching process into inspectable declaration semantics", async () => {
  const compiler = createCompiler();
  const parsed = compiler.parse(
    diagramSource(BRANCHING_PROCESS, {
      header: "id: branching\nnumber: true\nmode: flowchart\nflow: top-to-bottom\n",
    }),
  );

  assert.deepEqual(errorCodes(parsed), []);
  assert.deepEqual(warnings(parsed), []);
  const block = diagramBlock(parsed);
  assert.equal(block.id, "branching");
  assert.equal(block.number, true);
  assert.equal(block.mode, "flowchart");
  assert.equal(block.flow, "top-to-bottom");
  assert.deepEqual(
    block.declarations.map((declaration) => declaration.kind),
    ["node", "node", "node", "node", "node", "edge", "edge", "edge", "edge", "edge", "edge"],
  );
  const nodes = block.declarations.filter((declaration) => declaration.kind === "node");
  assert.deepEqual(
    nodes.map(({ name, shape }) => ({ name, shape })),
    [
      { name: "start", shape: "circle" },
      { name: "classify", shape: "diamond" },
      { name: "cache", shape: "rectangle" },
      { name: "origin", shape: "rectangle" },
      { name: "store", shape: "cylinder" },
    ],
  );
  assert.equal(nodes[1].label[0][0].value, "Classify request?");
  const edges = block.declarations.filter((declaration) => declaration.kind === "edge");
  assert.equal(edges.length, 6);
  assert.equal(edges[5].from.name, "cache");
  assert.equal(edges[5].to.name, "classify");
  assert.equal(edges[5].direction, "directed");
  assert.equal(edges[5].label[0][0].value, "recheck");
});

test("Diagram resolves forward references across the whole declaration list", async () => {
  const compiler = createCompiler();
  const result = compiler.parse(
    await documentedDiagramSource("08-diagram-scenarios.aze.md", "diagram-tree-forward-refs"),
  );

  assert.deepEqual(errorCodes(result), []);
  assert.deepEqual(warnings(result), []);
  const block = diagramBlock(result);
  assert.equal(block.mode, "tree");
  const nodes = block.declarations.filter((declaration) => declaration.kind === "node");
  assert.equal(nodes.length, 7);
  const printing = block.declarations.find(
    (declaration) => declaration.kind === "group" && declaration.name === "printing",
  );
  assert.ok(printing);
  const pdfWriter = nodes.find(({ name }) => name === "pdf-writer");
  assert.equal(pdfWriter.parent, "printing");
});

test("Diagram keeps ports, nested groups, undirected multi-edges and flow distinct", async () => {
  const compiler = createCompiler();
  const result = compiler.parse(
    await documentedDiagramSource("08-diagram-scenarios.aze.md", "diagram-service-architecture"),
  );

  assert.deepEqual(errorCodes(result), []);
  assert.deepEqual(warnings(result), []);
  const block = diagramBlock(result);
  assert.equal(block.mode, "architecture");
  assert.equal(block.flow, "left-to-right");
  const gateway = block.declarations.find(
    (declaration) => declaration.kind === "node" && declaration.name === "gateway",
  );
  assert.deepEqual(
    gateway.ports.map(({ name, side }) => ({ name, side })),
    [
      { name: "inbound", side: "left" },
      { name: "upstream", side: "right" },
    ],
  );
  const persistence = block.declarations.find(
    (declaration) => declaration.kind === "group" && declaration.name === "persistence",
  );
  assert.equal(persistence.parent, "data-tier");
  const edges = block.declarations.filter((declaration) => declaration.kind === "edge");
  assert.equal(edges.length, 7);
  const parallel = edges.filter(
    (declaration) =>
      declaration.from.name === "catalog" && declaration.to.name === "replica",
  );
  assert.equal(parallel.length, 2);
  assert.deepEqual(parallel.map(({ direction }) => direction), ["undirected", "undirected"]);
  assert.equal(edges[0].to.name, "gateway");
  assert.equal(edges[0].to.port, "inbound");
});

test("Diagram defaults flow per mode and keeps authored order hash-significant", async () => {
  const compiler = createCompiler();
  const flowchart = await compiler.compile(diagramSource(BRANCHING_PROCESS), { format: "html" });
  const graph = await compiler.compile(
    diagramSource(BRANCHING_PROCESS, { header: "mode: graph\n" }),
    { format: "html" },
  );
  assert.equal(diagramBlock(flowchart).flow, "top-to-bottom");
  assert.equal(diagramBlock(graph).flow, "left-to-right");
  assert.notEqual(flowchart.contentHash, graph.contentHash);

  const moved = await compiler.compile(
    diagramSource(`${BRANCHING_PROCESS}\n- kind: node\n  name: audit\n  label: Audit\n`),
    { format: "html" },
  );
  assert.notEqual(moved.contentHash, flowchart.contentHash);
  const resized = await compiler.compile(
    diagramSource(BRANCHING_PROCESS.replace("shape: cylinder", "shape: hexagon")),
    { format: "html" },
  );
  assert.notEqual(resized.contentHash, flowchart.contentHash);
});

test("Diagram identity is Theme-invariant and never carries layout geometry", async () => {
  const compiler = createCompiler();
  const results = [];
  for (const theme of ["default", "academic", "dark-presentation"]) {
    results.push(await compiler.compile(diagramSource(SERVICE_ARCHITECTURE, {
      header: "mode: architecture\n",
    }), { format: "html", theme }));
  }
  const [first, ...rest] = results;
  for (const other of rest) {
    assert.equal(other.contentHash, first.contentHash, "Theme is layout-only");
  }
  // Cross-theme geometry is allowed to move, so the renderer fingerprints must
  // differ when the Theme's measurement inputs differ.
  assert.notEqual(
    first.artifact.metadata.rendererFingerprint,
    rest[1].artifact?.metadata.rendererFingerprint,
  );
  const html = Buffer.from(first.artifact.bytes).toString("utf8");
  assert.match(html, /class="aze-diagram"/);
  assert.doesNotMatch(html, /\$H/);
});

test("Diagram renders shapes, ports, groups, arrowheads and accessible names", async () => {
  const compiler = createCompiler();
  const result = await compiler.compile(
    diagramSource(SERVICE_ARCHITECTURE, {
      header: "id: services\nmode: architecture\n",
    }),
    { format: "svg" },
  );
  assert.deepEqual(errorCodes(result), []);
  const svg = Buffer.from(result.artifact.bytes).toString("utf8");

  assert.match(svg, /class="aze-diagram"/);
  assert.match(svg, /data-diagram-id="services"/);
  assert.match(svg, /data-diagram-mode="architecture"/);
  assert.match(svg, /role="img"/);
  for (const shape of ["hexagon", "cylinder", "rectangle"]) {
    assert.match(svg, new RegExp(`aze-diagram-shape-${shape}`), `missing ${shape}`);
  }
  assert.match(svg, /class="aze-diagram-group/);
  assert.match(svg, /aze-diagram-group-depth-1/);
  assert.match(svg, /class="aze-diagram-port"/);
  assert.match(svg, /class="aze-diagram-edge"/);
  assert.match(svg, /class="aze-diagram-arrow"/);
  assert.match(svg, /API gateway/);
  assert.match(svg, /Read replica/);
  assert.match(svg, /fallback/);
  assert.match(svg, /<desc[ >]/);
  assert.match(svg, /architecture/);
  assert.doesNotMatch(svg, /<script/i);
  assert.doesNotMatch(svg, /\son[a-z]+=/i);
});

test("Diagram undirected edges carry no terminator while directed edges do", async () => {
  const compiler = createCompiler();
  const undirectedOnly = `- kind: node
  name: a
  label: A
- kind: node
  name: b
  label: B
- kind: edge
  from: a
  to: b
  direction: undirected`;
  const result = await compiler.compile(
    diagramSource(undirectedOnly, { header: "mode: graph\n" }),
    { format: "svg" },
  );
  assert.deepEqual(errorCodes(result), []);
  const svg = Buffer.from(result.artifact.bytes).toString("utf8");
  assert.match(svg, /class="aze-diagram-edge"/);
  assert.doesNotMatch(svg, /class="aze-diagram-arrow"/);

  const directed = await compiler.compile(
    diagramSource(undirectedOnly.replace("  direction: undirected", "  direction: directed"), {
      header: "mode: graph\n",
    }),
    { format: "svg" },
  );
  assert.deepEqual(errorCodes(directed), []);
  assert.match(
    Buffer.from(directed.artifact.bytes).toString("utf8"),
    /class="aze-diagram-arrow"/,
  );
});

test("Diagram diagnoses invalid declarations through the compiler and never yields a partial Block", async () => {
  // The full code registry and the ceiling matrix are the validator seam
  // (test/diagram-block.test.mjs); these four cases prove the same diagnostics
  // reach the parse dispatch and that an invalid Block produces no Block.
  const cases = [
    {
      name: "unknown mode",
      body: "- kind: node\n  name: a\n",
      header: "mode: state\n",
      codes: ["azeforge.diagram#unknown-mode"],
    },
    {
      name: "unresolved reference",
      body: "- kind: edge\n  from: a\n  to: b\n- kind: node\n  name: a\n",
      header: "mode: flowchart\n",
      codes: ["azeforge.diagram#unresolved-reference"],
    },
    {
      name: "undirected outside graph",
      body:
        "- kind: node\n  name: a\n- kind: node\n  name: b\n- kind: edge\n  from: a\n  to: b\n  direction: undirected\n",
      header: "mode: flowchart\n",
      codes: ["azeforge.diagram#undirected-not-permitted"],
    },
    {
      name: "tree with a self-loop",
      body:
        "- kind: node\n  name: a\n- kind: node\n  name: b\n- kind: edge\n  from: a\n  to: b\n- kind: edge\n  from: b\n  to: b\n",
      header: "mode: tree\n",
      codes: ["azeforge.diagram#invalid-tree"],
    },
  ];

  const compiler = createCompiler();
  for (const entry of cases) {
    const result = compiler.parse(diagramSource(entry.body, { header: entry.header }));
    assert.deepEqual(
      [...new Set(errorCodes(result))],
      entry.codes,
      `${entry.name}: expected ${entry.codes.join(", ")} got ${errorCodes(result).join(", ")}`,
    );
    assert.deepEqual(warnings(result), [], `${entry.name}: no warnings for an invalid Block`);
    assert.equal(
      result.document?.blocks.some((block) => block.kind === "diagram"),
      false,
      `${entry.name}: an invalid Block never yields a partial diagram`,
    );
  }
});

test("Diagram reports structure warnings per mode without failing the Block", async () => {
  const compiler = createCompiler();
  const isolated = `- kind: node
  name: a
  label: A
- kind: node
  name: b
  label: B
- kind: node
  name: loner
  label: Loner`;
  const codes = (result) => [...new Set(warnings(result).map(({ code }) => code))].sort();
  const flowchart = compiler.parse(diagramSource(isolated));
  assert.deepEqual(errorCodes(flowchart), []);
  assert.deepEqual(codes(flowchart), [
    "azeforge.diagram#disconnected-component",
    "azeforge.diagram#isolated-node",
  ]);
  const graph = compiler.parse(diagramSource(isolated, { header: "mode: graph\n" }));
  assert.deepEqual(
    codes(graph),
    ["azeforge.diagram#disconnected-component"],
    "graph stays silent about isolated nodes",
  );

  const unusedPort = `- kind: node
  name: a
  label: A
  ports:
    - name: spare
- kind: node
  name: b
  label: B
- kind: edge
  from: a
  to: b
- kind: group
  name: empty
  label: Empty`;
  const result = compiler.parse(diagramSource(unusedPort));
  assert.deepEqual(errorCodes(result), []);
  assert.deepEqual(codes(result), [
    "azeforge.diagram#empty-group",
    "azeforge.diagram#unused-port",
  ]);
});

test("Diagram enforces its ceiling matrix before layout", async () => {
  const compiler = createCompiler();
  const over = Array.from(
    { length: 129 },
    (_, index) => `- kind: node\n  name: n${index}\n  label: N${index}`,
  ).join("\n");
  const result = compiler.parse(diagramSource(over, { header: "mode: graph\n" }));
  const limit = result.diagnostics.find(
    (diagnostic) => diagnostic.code === "azeforge.diagram#limit-exceeded",
  );
  assert.ok(limit, "expected a limit diagnostic");
  assert.equal(limit.data.subject, "node count");
  assert.equal(limit.data.count, 129);
  assert.equal(limit.data.limit, 128);
});

test("Diagram renders the documented scenarios with deterministic output", async () => {
  const compiler = createCompiler();
  for (const id of [
    "diagram-branching-process",
    "diagram-tree-forward-refs",
    "diagram-service-architecture",
  ]) {
    const source = await documentedDiagramSource("08-diagram-scenarios.aze.md", id);
    const first = await compiler.compile(source, { format: "html" });
    const second = await compiler.compile(source, { format: "html" });
    assert.deepEqual(errorCodes(first), [], `${id} parses clean`);
    assert.equal(first.contentHash, second.contentHash, `${id} content hash is stable`);
    assert.deepEqual(
      Buffer.from(first.artifact.bytes),
      Buffer.from(second.artifact.bytes),
      `${id} renders byte-identically`,
    );
    const html = Buffer.from(first.artifact.bytes).toString("utf8");
    assert.match(html, /class="aze-diagram"/);
    const viewBox = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(html);
    assert.ok(viewBox, `${id} carries a viewBox`);
    assert.ok(Number(viewBox[1]) > 0 && Number(viewBox[2]) > 0, `${id} occupied extent`);
    assert.ok(Number(viewBox[1]) <= 4096 && Number(viewBox[2]) <= 16384, `${id} stays in bounds`);
  }
});

test("Diagram adjacency survives a Theme change while geometry does not", async () => {
  const compiler = createCompiler();
  const source = diagramSource(SERVICE_ARCHITECTURE, { header: "mode: architecture\n" });
  const light = await compiler.compile(source, { format: "svg", theme: "default" });
  const dark = await compiler.compile(source, { format: "svg", theme: "dark-presentation" });
  assert.equal(light.contentHash, dark.contentHash);

  // Incidence is authored, so the semantic enumeration of `<desc>` is
  // Theme-invariant, and so is the number and order of positional edge paths.
  const described = (bytes) =>
    /<desc id="aze-d-0-desc">([\s\S]*?)<\/desc>/.exec(Buffer.from(bytes).toString("utf8"))[1];
  assert.equal(described(light.artifact.bytes), described(dark.artifact.bytes));
  assert.match(described(light.artifact.bytes), /gateway\.upstream -&gt; replica \(fallback\)/);
  const edgeIds = (bytes) =>
    [...Buffer.from(bytes).toString("utf8").matchAll(new RegExp(/id="aze-d-0-e-(\d+)"/, "g"))].map(
      (match) => match[1],
    );
  assert.deepEqual(edgeIds(light.artifact.bytes), edgeIds(dark.artifact.bytes));
  assert.equal(edgeIds(light.artifact.bytes).length, 4);

  // Coordinates are measured, so a Theme with larger label type re-lays-out
  // the figure: the same adjacency, different pixels.
  const paths = (bytes) =>
    [...Buffer.from(bytes).toString("utf8").matchAll(/ d="([^"]*)"/g)].map((match) => match[1]);
  assert.notDeepEqual(paths(light.artifact.bytes), paths(dark.artifact.bytes));
  assert.notDeepEqual(
    Buffer.from(light.artifact.bytes),
    Buffer.from(dark.artifact.bytes),
  );
});
