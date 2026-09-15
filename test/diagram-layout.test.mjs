import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { labelAdvance } from "../dist/advance-metric.js";
import {
  DIAGRAM_LAYOUT_ERROR_CODE,
  DIAGRAM_LAYOUT_VERSION,
  ELKJS_VERSION,
  DiagramLayoutError,
  layoutDiagram,
} from "../dist/diagram-layout.js";
import { defaultTheme } from "../dist/theme.js";

const BLOCK_RANGE = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 200, column: 1, offset: 4000 },
};
const RANGE = { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 20, offset: 19 } };
const EPSILON = 0.01;

/* ------------------------------------------------------------------ *
 * Authored Blocks, built directly (no compiler wiring)
 * ------------------------------------------------------------------ */

function text(value) {
  return [{ kind: "text", value }];
}

function label(...lines) {
  return lines.map((line) => text(line));
}

function port(name, side) {
  const value = { name, range: RANGE };
  if (side !== undefined) value.side = side;
  return value;
}

function node(name, options = {}) {
  const { shape = "rectangle", label: lines, parent, ports = [] } = options;
  const value = { kind: "node", name, shape, ports, range: RANGE };
  if (lines !== undefined) value.label = lines;
  if (parent !== undefined) value.parent = parent;
  return value;
}

function group(name, options = {}) {
  const { label: lines, parent } = options;
  const value = { kind: "group", name, range: RANGE };
  if (lines !== undefined) value.label = lines;
  if (parent !== undefined) value.parent = parent;
  return value;
}

function endpoint(reference) {
  const dot = reference.indexOf(".");
  return dot === -1
    ? { name: reference, range: RANGE }
    : { name: reference.slice(0, dot), port: reference.slice(dot + 1), range: RANGE };
}

function edge(from, to, options = {}) {
  const { direction = "directed", label: lines } = options;
  const value = { kind: "edge", from: endpoint(from), to: endpoint(to), direction, range: RANGE };
  if (lines !== undefined) value.label = lines;
  return value;
}

function block(mode, flow, declarations) {
  return { kind: "diagram", pluginVersion: "1.0.0", range: BLOCK_RANGE, mode, flow, declarations };
}

/** A branching process with a cycle, a self-loop and a disconnected node. */
const BRANCH_FLOW = block("flowchart", "top-to-bottom", [
  node("start", { shape: "circle", label: label("Start") }),
  node("split", { shape: "diamond", label: label("Split", "the work") }),
  node("worker-a", { label: label("Worker A") }),
  node("worker-b", { label: label("Worker B") }),
  node("join", { label: label("Join") }),
  node("idle", { label: label("Idle") }),
  edge("start", "split"),
  edge("split", "worker-a"),
  edge("split", "worker-b"),
  edge("worker-a", "join"),
  edge("worker-b", "join"),
  edge("join", "split", { label: label("retry") }),
  edge("join", "join", { label: label("nudge") }),
]);

/** A tree whose edges and parents are all declared before their targets. */
const TREE_FORWARD = block("tree", "top-to-bottom", [
  edge("t-root", "t-left"),
  edge("t-root", "t-right"),
  edge("t-left", "t-leaf-1"),
  edge("t-left", "t-leaf-2"),
  node("t-root", { label: label("Root"), parent: "cluster" }),
  node("t-left", { label: label("Left branch"), parent: "cluster" }),
  node("t-right", { label: label("Right"), parent: "cluster" }),
  node("t-leaf-1", { shape: "rounded", label: label("Leaf 1"), parent: "cluster" }),
  node("t-leaf-2", { shape: "rounded", label: label("Leaf 2"), parent: "cluster" }),
  group("cluster", { label: label("Cluster"), parent: "outer-band" }),
  group("outer-band", { label: label("Outer band") }),
]);

/** Three nesting levels, authored ports, undirected parallel edges, an empty group. */
const ARCHITECTURE = block("architecture", "left-to-right", [
  node("gateway", {
    shape: "hexagon",
    label: label("Gateway"),
    ports: [port("in", "left"), port("out", "right"), port("ops")],
  }),
  node("service", {
    shape: "rounded",
    label: label("Service", "(api)"),
    ports: [port("request", "top"), port("response", "bottom")],
  }),
  node("store", { shape: "cylinder", label: label("Store") }),
  node("metric", { shape: "circle", label: label("Metric") }),
  node("queue", { label: label("Queue"), parent: "outer" }),
  node("worker", { label: label("Worker"), parent: "inner", ports: [port("publish", "right")] }),
  node("cache", { label: label("Cache"), parent: "inner" }),
  node("ledger", { shape: "parallelogram", label: label("Ledger"), parent: "deep" }),
  group("outer", { label: label("Outer") }),
  group("inner", { label: label("Inner"), parent: "outer" }),
  group("deep", { label: label("Deep"), parent: "inner" }),
  group("vacant", { label: label("Vacant") }),
  edge("gateway.out", "service.request"),
  edge("service.response", "store", { direction: "undirected" }),
  edge("service", "worker", { direction: "undirected" }),
  edge("worker.publish", "cache", { direction: "undirected" }),
  edge("worker", "cache", { direction: "undirected", label: label("shard 2") }),
  edge("cache", "ledger", { direction: "undirected" }),
  edge("ledger", "metric", { direction: "undirected" }),
  edge("gateway", "gateway", { direction: "undirected" }),
]);

const ARCH_MEMBERS = {
  outer: ["inner", "queue"],
  inner: ["worker", "cache", "deep"],
  deep: ["ledger"],
};

/** The outer group is declared first; its only member is a nested group. */
const NESTED_ONLY = block("architecture", "left-to-right", [
  group("data-tier", { label: label("Data tier") }),
  group("persistence", { label: label("Persistence"), parent: "data-tier" }),
]);

const FIXTURES = [
  { name: "branching flowchart with a cycle", block: BRANCH_FLOW },
  { name: "tree with forward references", block: TREE_FORWARD },
  { name: "nested architecture with ports", block: ARCHITECTURE },
  { name: "group whose only member is a group", block: NESTED_ONLY },
];

const layouts = new Map(
  await Promise.all(
    FIXTURES.map(async (fixture) => [fixture.name, await layoutDiagram(fixture.block, defaultTheme)]),
  ),
);

/* ------------------------------------------------------------------ *
 * Deep scans
 * ------------------------------------------------------------------ */

function collectNumbers(value, out = []) {
  if (typeof value === "number") out.push(value);
  else if (Array.isArray(value)) for (const item of value) collectNumbers(item, out);
  else if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) collectNumbers(item, out);
  }
  return out;
}

function collectStrings(value, key = "", out = []) {
  if (typeof value === "string") out.push([key, value]);
  else if (Array.isArray(value)) for (const item of value) collectStrings(item, key, out);
  else if (value !== null && typeof value === "object") {
    for (const [childKey, item] of Object.entries(value)) collectStrings(item, childKey, out);
  }
  return out;
}

function collectKeys(value, out = []) {
  if (Array.isArray(value)) for (const item of value) collectKeys(item, out);
  else if (value !== null && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      out.push(key);
      collectKeys(item, out);
    }
  }
  return out;
}

/** Every returned number is finite and already quantized to three decimals. */
function assertQuantizedFinite(layout) {
  const numbers = collectNumbers(layout);
  assert.ok(numbers.length > 0, "layout carries geometry");
  for (const value of numbers) {
    assert.ok(Number.isFinite(value), `${value} is finite`);
    assert.ok(
      Math.abs(value - Number(value.toFixed(3))) < 1e-9,
      `${value} is quantized to three decimals`,
    );
  }
}

function authoredNames(declarations) {
  const names = new Set();
  for (const declaration of declarations) {
    if (declaration.kind !== "edge") names.add(declaration.name);
    if (declaration.kind === "node") for (const item of declaration.ports) names.add(item.name);
  }
  return names;
}

function byName(entries) {
  return new Map(entries.map((entry) => [entry.name, entry]));
}

function assertContains(outer, inner, what) {
  assert.ok(inner.x >= outer.x - EPSILON, `${what}: left edge inside`);
  assert.ok(inner.y >= outer.y - EPSILON, `${what}: top edge inside`);
  assert.ok(
    inner.x + inner.width <= outer.x + outer.width + EPSILON,
    `${what}: right edge inside`,
  );
  assert.ok(
    inner.y + inner.height <= outer.y + outer.height + EPSILON,
    `${what}: bottom edge inside`,
  );
}

/* ------------------------------------------------------------------ *
 * Tests
 * ------------------------------------------------------------------ */

test("the registered identity pins the installed engine", () => {
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(DIAGRAM_LAYOUT_VERSION, "diagram-layout/v1");
  assert.equal(DIAGRAM_LAYOUT_ERROR_CODE, "azeforge.renderer#diagram-layout");
  assert.equal(ELKJS_VERSION, manifest.dependencies.elkjs.replace(/^[^\d]*/, ""));
});

for (const fixture of FIXTURES) {
  test(`${fixture.name} lays out deterministically with finite quantized geometry`, async () => {
    const first = layouts.get(fixture.name);
    const second = await layoutDiagram(fixture.block, defaultTheme);
    assert.deepEqual(second, first);
    assert.equal(JSON.stringify(second), JSON.stringify(first));
    assertQuantizedFinite(first);
    assert.ok(first.width > 0 && first.height > 0, "the drawing has an extent");
    assert.equal(first.nodes.length, fixture.block.declarations.filter((d) => d.kind === "node").length);
    assert.equal(first.groups.length, fixture.block.declarations.filter((d) => d.kind === "group").length);
    assert.equal(first.edges.length, fixture.block.declarations.filter((d) => d.kind === "edge").length);
  });
}

test("returned declarations keep authored order and align one-to-one", () => {
  const layout = layouts.get("nested architecture with ports");
  const authoredNodes = ARCHITECTURE.declarations.filter((d) => d.kind === "node");
  const authoredGroups = ARCHITECTURE.declarations.filter((d) => d.kind === "group");
  assert.deepEqual(layout.nodes.map((item) => item.name), authoredNodes.map((item) => item.name));
  assert.deepEqual(layout.groups.map((item) => item.name), authoredGroups.map((item) => item.name));
  assert.deepEqual(
    layout.nodes.map((item, index) => item.shape),
    authoredNodes.map((item) => item.shape),
  );
  assert.deepEqual(
    layout.groups.map((item) => item.depth),
    [0, 1, 2, 0],
  );
});

test("every node carries a box above its label advance, disconnected included", () => {
  for (const fixture of FIXTURES) {
    const layout = layouts.get(fixture.name);
    const authoredNodes = fixture.block.declarations.filter((d) => d.kind === "node");
    const measured = byName(layout.nodes);
    for (const declaration of authoredNodes) {
      const box = measured.get(declaration.name);
      assert.ok(box !== undefined, `${declaration.name} has a box`);
      assert.ok(box.width > 0 && box.height > 0, `${declaration.name} has a positive box`);
      if (declaration.label !== undefined) {
        const advance = labelAdvance(declaration.label, defaultTheme.diagram.nodeLabelFontSizePx);
        assert.ok(
          box.width > advance,
          `${declaration.name} box (${box.width}) clears its label (${advance})`,
        );
      }
    }
  }

  const disconnected = byName(layouts.get("branching flowchart with a cycle").nodes).get("idle");
  assert.ok(disconnected.width > 0 && disconnected.height > 0);
  assert.ok(Number.isFinite(disconnected.x) && Number.isFinite(disconnected.y));
});

test("a group box contains its members, nested groups included", () => {
  const layout = layouts.get("nested architecture with ports");
  const groups = byName(layout.groups);
  const nodes = byName(layout.nodes);
  for (const [groupName, members] of Object.entries(ARCH_MEMBERS)) {
    const box = groups.get(groupName);
    assert.ok(box !== undefined, `${groupName} has a box`);
    for (const member of members) {
      const inner = nodes.get(member) ?? groups.get(member);
      assert.ok(inner !== undefined, `${member} has a box`);
      assertContains(box, inner, `${groupName} contains ${member}`);
    }
  }

  const tree = layouts.get("tree with forward references");
  const band = byName(tree.groups).get("outer-band");
  const cluster = byName(tree.groups).get("cluster");
  assertContains(band, cluster, "outer band contains cluster");
  for (const declaration of TREE_FORWARD.declarations) {
    if (declaration.kind !== "node") continue;
    const box = byName(tree.nodes).get(declaration.name);
    assertContains(cluster, box, `cluster contains ${declaration.name}`);
  }
});

test("authored ports carry coordinates on their authored sides", () => {
  const layout = layouts.get("nested architecture with ports");
  const nodes = byName(layout.nodes);

  const gateway = nodes.get("gateway");
  assert.deepEqual(gateway.ports.map((item) => item.name), ["in", "out", "ops"]);
  const [west, east, free] = gateway.ports;
  assert.equal(west.side, "left");
  assert.equal(east.side, "right");
  assert.equal(Object.hasOwn(free, "side"), false, "an unsided port carries no side");
  for (const item of gateway.ports) {
    assert.ok(item.width > 0 && item.height > 0, `${item.name} has a port box`);
    assert.ok(Number.isFinite(item.x) && Number.isFinite(item.y));
  }
  assert.ok(Math.abs(west.x - (gateway.x - west.width)) < EPSILON, "left port sits on the west border");
  assert.ok(Math.abs(east.x - (gateway.x + gateway.width)) < EPSILON, "right port sits on the east border");

  const service = nodes.get("service");
  const [north, south] = service.ports;
  assert.equal(north.side, "top");
  assert.equal(south.side, "bottom");
  assert.ok(Math.abs(north.y - (service.y - north.height)) < EPSILON, "top port sits on the north border");
  assert.ok(Math.abs(south.y - (service.y + service.height)) < EPSILON, "bottom port sits on the south border");

  const worker = nodes.get("worker");
  assert.deepEqual(worker.ports.map((item) => item.name), ["publish"]);
  assert.ok(Math.abs(worker.ports[0].x - (worker.x + worker.width)) < EPSILON, "publish sits on the east border");

  for (const name of ["store", "metric", "queue", "cache", "ledger"]) {
    assert.deepEqual(nodes.get(name).ports, [], `${name} declares no ports`);
  }
});

test("a group whose only member is a group lays out, outer declared first", () => {
  const layout = layouts.get("group whose only member is a group");
  const groups = byName(layout.groups);
  assert.deepEqual(layout.groups.map((item) => item.depth), [0, 1]);
  assertContains(
    groups.get("data-tier"),
    groups.get("persistence"),
    "data tier contains persistence",
  );
  for (const box of layout.groups) {
    assert.ok(box.width > 0 && box.height > 0, `${box.name} has a positive box`);
  }
});

test("the projection leaks neither the engine payload nor off-field names", () => {
  for (const fixture of FIXTURES) {
    const layout = layouts.get(fixture.name);
    const serialized = JSON.stringify(layout);
    assert.ok(!serialized.includes("$H"), "no engine-private key");

    for (const key of [
      "layoutOptions",
      "container",
      "children",
      "incomingShape",
      "outgoingShape",
      "incomingSections",
      "outgoingSections",
      "junctionPoints",
      "sources",
      "targets",
      "labels",
      "id",
    ]) {
      assert.ok(!collectKeys(layout).includes(key), `no leaked engine key "${key}"`);
    }

    // §4 puts authored names on the returned nodes, groups and ports — and
    // nowhere else. Any other string would be an authored name or a
    // positional engine id that escaped the projection.
    const names = authoredNames(fixture.block.declarations);
    const sides = new Set(["left", "right", "top", "bottom"]);
    const shapes = new Set([
      "rectangle",
      "rounded",
      "diamond",
      "parallelogram",
      "circle",
      "hexagon",
      "cylinder",
    ]);
    const seen = new Set();
    for (const [key, value] of collectStrings(layout)) {
      if (key === "name") {
        assert.ok(names.has(value), `"${value}" is an authored name`);
        assert.ok(!seen.has(value), `"${value}" appears once`);
        seen.add(value);
        continue;
      }
      assert.ok(
        sides.has(value) || shapes.has(value),
        `"${value}" at ${key} is neither an authored name nor a registered token`,
      );
    }
    assert.deepEqual([...seen].sort(), [...names].sort(), "every authored name is present");
  }
});

test("a declaration the engine cannot be given fails closed with a remedy", async () => {
  const broken = block("flowchart", "top-to-bottom", [
    node("only", { label: label("Only") }),
    edge("only", "missing"),
  ]);
  await assert.rejects(
    () => layoutDiagram(broken, defaultTheme),
    (error) => {
      assert.ok(error instanceof DiagramLayoutError, "typed failure");
      assert.equal(error.code, DIAGRAM_LAYOUT_ERROR_CODE);
      assert.match(error.remedy, /\.$/, "the remedy is a sentence");
      return true;
    },
  );

  const cyclic = block("flowchart", "top-to-bottom", [
    node("a", { label: label("A"), parent: "b" }),
    group("b", { parent: "c" }),
    group("c", { parent: "b" }),
  ]);
  await assert.rejects(
    () => layoutDiagram(cyclic, defaultTheme),
    (error) => error instanceof DiagramLayoutError,
  );
});
