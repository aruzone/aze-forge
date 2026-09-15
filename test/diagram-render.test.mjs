/**
 * Native diagram emitter (contract: issue #76 §5).
 *
 * The corpus is the three contract scenarios Main already publishes in
 * `acceptance/golden-report.aze.md`, parsed through the family validator so the
 * emitter is proven against the authored Blocks a Document actually carries,
 * not against hand-built objects. Together the three cover all seven shapes,
 * a cyclic flowchart, forward references, nested groups, ports, labelled edges
 * and undirected multi-edges.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { validateDiagramBlock } from "../dist/diagram.js";
import {
  DIAGRAM_EMITTER_VERSION,
  DIAGRAM_HTML_BLOCK_RENDERER_ID,
  DIAGRAM_HTML_BLOCK_RENDERER_VERSION,
  DiagramRenderError,
  diagramDependencyClosure,
  diagramHtmlBlockRenderer,
  renderDiagramFragment,
} from "../dist/diagram-render.js";
import { academicTheme, darkPresentationTheme, defaultTheme } from "../dist/theme.js";

const SHAPES = ["rectangle", "rounded", "diamond", "parallelogram", "circle", "hexagon", "cylinder"];
const MAX_WIDTH_PX = 4096;
const MAX_HEIGHT_PX = 16384;
const BLOCK_RANGE = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 100, offset: 100 },
};

/** Element and attribute vocabulary the emitter is allowed to touch. */
const ELEMENTS = new Set(["figure", "svg", "title", "desc", "g", "rect", "ellipse", "polygon", "path", "text", "tspan"]);
const ATTRIBUTES = new Set([
  "class",
  "id",
  "data-ordinal",
  "data-diagram-id",
  "data-diagram-mode",
  "xmlns",
  "viewBox",
  "width",
  "height",
  "role",
  "aria-labelledby",
  "x",
  "y",
  "rx",
  "ry",
  "cx",
  "cy",
  "d",
  "points",
  "dy",
]);

const GOLDEN = readFileSync(new URL("../acceptance/golden-report.aze.md", import.meta.url), "utf8");

function toLines(lines, startLine) {
  return lines.map((text, index) => {
    const line = startLine + index;
    return {
      text,
      range: {
        start: { line, column: 1, offset: 0 },
        end: { line, column: 1 + text.length, offset: text.length },
      },
    };
  });
}

/** The three authored `:::: diagram` Blocks of the Golden report, in document order. */
function contractBlocks() {
  const blocks = [];
  for (const match of GOLDEN.matchAll(/^:::: diagram\r?\n([\s\S]*?)^::::$/gm)) {
    const lines = match[1]
      .split("\n")
      .filter((line) => line !== "" && !line.startsWith("//"));
    const divider = lines.indexOf("----");
    assert.ok(divider > 0, "authored diagram Block carries a header divider");
    const result = validateDiagramBlock({
      headerLines: toLines(lines.slice(0, divider), 10),
      bodyLines: toLines(lines.slice(divider + 1), 100),
      blockRange: BLOCK_RANGE,
      sourceName: "acceptance/golden-report.aze.md",
    });
    assert.deepEqual(
      result.diagnostics.filter((diagnostic) => diagnostic.severity === "error"),
      [],
      "the contract scenarios validate",
    );
    assert.notEqual(result.block, undefined);
    blocks.push(result.block);
  }
  assert.equal(blocks.length, 3, "the Golden report carries three diagram scenarios");
  return blocks;
}

const BLOCKS = contractBlocks();
const FLOWCHART = BLOCKS.find((block) => block.id === "branching-process");
const TREE = BLOCKS.find((block) => block.id === "compiler-tree");
const ARCHITECTURE = BLOCKS.find((block) => block.id === "service-architecture");

const DIRECTED_BY_ID = {
  "branching-process": [true, true, true, true, true, true],
  "compiler-tree": [true, true, true, true, true, true],
  "service-architecture": [true, true, true, false, false, false, false],
};
const LABELS_BY_ID = {
  "branching-process": [false, true, true, false, true, true],
  "compiler-tree": [false, false, false, false, false, false],
  "service-architecture": [false, false, false, false, false, false, true],
};

function render(block, options = {}) {
  return renderDiagramFragment(block, { ordinal: 0, ...options });
}

function nodesOf(block) {
  return block.declarations.filter((declaration) => declaration.kind === "node");
}

function groupsOf(block) {
  return block.declarations.filter((declaration) => declaration.kind === "group");
}

/** Per-edge markup, split on the positional path ids so an arrow is attributed to its edge. */
function edgeSegments(fragment) {
  const group = /<g class="aze-diagram-edges">([\s\S]*?)<\/g>/.exec(fragment);
  assert.notEqual(group, null, "the fragment groups its edges");
  return group[1]
    .split(/(?=<path id=")/)
    .filter((segment) => segment.startsWith("<path "))
    .map((segment) => {
      const id = /^<path id="([^"]+)"/.exec(segment)[1];
      return {
        id,
        index: Number(/\d+$/.exec(id)[0]),
        d: / d="([^"]*)"/.exec(segment)[1],
        arrow: segment.includes('class="aze-diagram-arrow"'),
        label: segment.includes('class="aze-diagram-edge-label-background"'),
      };
    });
}

function groupRects(fragment) {
  return [...fragment.matchAll(/class="aze-diagram-group( aze-diagram-group-depth-(\d))?"/g)].map(
    (match) => ({ depth: match[2] === undefined ? 0 : Number(match[2]) }),
  );
}

function elementTags(fragment) {
  return [...fragment.matchAll(/<([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g)].map((match) => ({
    name: match[1],
    attributes: [...match[2].matchAll(/([a-zA-Z-:]+)="/g)].map((attribute) => attribute[1]),
  }));
}

function titleText(fragment) {
  const match = /<title id="([^"]+)">([\s\S]*?)<\/title>/.exec(fragment);
  assert.notEqual(match, null, "the fragment carries a title");
  return { id: match[1], text: match[2] };
}

function descText(fragment) {
  const match = /<desc id="([^"]+)">([\s\S]*?)<\/desc>/.exec(fragment);
  assert.notEqual(match, null, "the fragment carries a desc");
  return { id: match[1], text: match[2] };
}

function count(fragment, needle) {
  return fragment.split(needle).length - 1;
}

test("every contract scenario emits exactly one figure and one svg with a clamped viewBox", async () => {
  for (const block of BLOCKS) {
    const fragment = await render(block);
    assert.ok(fragment.startsWith('<figure class="aze-diagram" '), fragment.slice(0, 60));
    assert.ok(fragment.endsWith("</svg></figure>"));
    assert.equal(count(fragment, "<figure"), 1);
    assert.equal(count(fragment, "<svg "), 1);
    assert.equal(count(fragment, "</svg>"), 1);
    assert.equal(count(fragment, "<title"), 1);
    assert.equal(count(fragment, "<desc"), 1);
    assert.ok(!fragment.includes("\n"), "the fragment is one line");
    assert.ok(fragment.includes('data-ordinal="0"'));
    assert.ok(fragment.includes(`data-diagram-id="${block.id}"`));
    assert.ok(fragment.includes(`data-diagram-mode="${block.mode}"`));
    assert.ok(fragment.includes('role="img"'));
    assert.ok(fragment.includes('aria-labelledby="aze-d-0-title aze-d-0-desc"'));
    assert.ok(fragment.includes('xmlns="http://www.w3.org/2000/svg"'));

    const viewBox = /viewBox="0 0 ([0-9.]+) ([0-9.]+)"/.exec(fragment);
    assert.notEqual(viewBox, null, "the svg carries a viewBox");
    const [, width, height] = viewBox;
    assert.ok(Number(width) > 0 && Number(width) <= MAX_WIDTH_PX, width);
    assert.ok(Number(height) > 0 && Number(height) <= MAX_HEIGHT_PX, height);
    assert.ok(fragment.includes(`width="${width}" height="${height}"`));
    assert.equal(titleText(fragment).id, "aze-d-0-title");
    assert.equal(descText(fragment).id, "aze-d-0-desc");
  }
});

test("the title carries the authored text and the desc enumerates the whole graph", async () => {
  const titles = {
    "branching-process": "Request branching process",
    "compiler-tree": "Compiler component tree",
    "service-architecture": "Service architecture",
  };
  for (const block of BLOCKS) {
    assert.equal(titleText(await render(block)).text, titles[block.id]);
  }

  const expected =
    "flowchart diagram, flow top to bottom. 5 nodes, 6 edges, 0 groups, 0 ports. " +
    "Nodes in authored order: start: Start; classify: Classify request?; " +
    "cache: Serve from cache; origin: Fetch from origin; store: Store result. " +
    "Edges in authored order: start -> classify; classify -> cache (hit); " +
    "classify -> origin (miss); origin -> store; store -> cache (warm); " +
    "cache -> classify (recheck). Group membership: none.";
  assert.equal(descText(await render(FLOWCHART)).text, expected.replaceAll("->", "-&gt;"));

  const architecture = descText(await render(ARCHITECTURE)).text;
  assert.ok(
    architecture.startsWith(
      "architecture diagram, flow left to right. 6 nodes, 7 edges, 4 groups, 4 ports.",
    ),
    architecture,
  );
  assert.ok(architecture.includes("gateway: API gateway"));
  assert.ok(architecture.includes("client -&gt; gateway.inbound"));
  assert.ok(architecture.includes("catalog -&gt; replica (fallback)"));
  assert.ok(architecture.includes("service-tier contains auth"));
  assert.ok(architecture.includes("persistence contains replica"));

  const tree = descText(await render(TREE)).text;
  assert.ok(tree.includes("tree diagram, flow top to bottom. 7 nodes, 6 edges, 1 groups"));
  assert.ok(tree.includes("printing contains pdf-writer"));
});

test("all seven shape classes appear across the corpus and only on node shapes", async () => {
  const seen = new Set();
  for (const block of BLOCKS) {
    const fragment = await render(block);
    for (const match of fragment.matchAll(/aze-diagram-shape-([a-z]+)/g)) seen.add(match[1]);
    const cylinders = nodesOf(block).filter((node) => node.shape === "cylinder").length;
    // A cylinder is a body plus its top ellipse, so its class repeats once per node.
    assert.equal(count(fragment, "aze-diagram-shape-cylinder"), cylinders * 2);
    assert.equal(
      count(fragment, 'class="aze-diagram-node-shape aze-diagram-shape-'),
      nodesOf(block).length + cylinders,
    );
  }
  assert.deepEqual([...seen].sort(), [...SHAPES].sort());

  const flowchart = await render(FLOWCHART);
  assert.ok(flowchart.includes('class="aze-diagram-node-shape aze-diagram-shape-circle"'));
  assert.ok(flowchart.includes('class="aze-diagram-node-shape aze-diagram-shape-diamond"'));
  assert.ok(flowchart.includes('class="aze-diagram-node-shape aze-diagram-shape-rectangle"'));
  assert.ok(flowchart.includes('class="aze-diagram-node-shape aze-diagram-shape-cylinder"'));
  assert.ok(
    (await render(TREE)).includes('class="aze-diagram-node-shape aze-diagram-shape-parallelogram"'),
  );
  assert.ok(
    (await render(TREE)).includes('class="aze-diagram-node-shape aze-diagram-shape-rounded"'),
  );
});

test("directed edges carry an arrowhead polygon and undirected edges carry no terminator", async () => {
  for (const block of BLOCKS) {
    const fragment = await render(block);
    const segments = edgeSegments(fragment);
    const authored = block.declarations.filter(
      (declaration) => declaration.kind === "edge",
    );
    assert.deepEqual(
      segments.map((segment) => segment.id),
      authored.map((_, index) => `aze-d-0-e-${index}`),
    );
    assert.deepEqual(
      segments.map((segment) => segment.index),
      authored.map((_, index) => index),
    );
    for (const [index, segment] of segments.entries()) {
      assert.ok(segment.d.startsWith("M"), segment.d);
      assert.equal(
        segment.arrow,
        DIRECTED_BY_ID[block.id][index],
        `${block.id} edge ${index} (${segment.id}) arrowhead`,
      );
      assert.equal(
        segment.label,
        LABELS_BY_ID[block.id][index],
        `${block.id} edge ${index} (${segment.id}) label`,
      );
    }
    assert.equal(
      segments.filter((segment) => segment.arrow).length,
      DIRECTED_BY_ID[block.id].filter(Boolean).length,
    );
  }

  // An arrowhead polygon is the only terminator the emitter can produce: no
  // markers, no defs and no second head anywhere, so the four undirected
  // architecture edges stay distinguishable without colour. Edges stay in
  // authored order, which is what the positional path ids encode.
  const architecture = await render(ARCHITECTURE);
  assert.ok(!architecture.includes("marker"));
  assert.ok(!/<(?:marker|defs|use)[\s>]/.test(architecture));
  assert.deepEqual(
    edgeSegments(architecture).map((segment) => segment.index),
    [0, 1, 2, 3, 4, 5, 6],
  );
  assert.deepEqual(
    edgeSegments(architecture)
      .filter((segment) => !segment.arrow)
      .map((segment) => segment.index),
    [3, 4, 5, 6],
  );
  // Contract §10: semantic names never appear in an SVG attribute. The edge
  // endpoints are therefore not observable here at all — only in `<desc>`.
  assert.ok(!architecture.includes("data-edge"));
  assert.deepEqual(
    [...architecture.matchAll(/\sdata-[a-z-]+="([^"]*)"/g)].map((match) => match[1]),
    ["0", "service-architecture", "architecture"],
  );
});

test("nodes, groups, ports, node labels and edge labels are all present and positional", async () => {
  for (const block of BLOCKS) {
    const fragment = await render(block);
    const nodes = nodesOf(block);
    const groups = groupsOf(block);
    const ports = nodes.reduce((total, node) => total + node.ports.length, 0);
    assert.equal(count(fragment, 'class="aze-diagram-label aze-diagram-node-label"'), nodes.length);
    assert.equal(groupRects(fragment).length, groups.length);
    assert.equal(count(fragment, 'class="aze-diagram-port"'), ports);
    const ids = [...fragment.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]);
    assert.ok(ids.length > 0);
    for (const id of ids) assert.match(id, /^aze-d-0-(?:title|desc|n-\d+|g-\d+|e-\d+|p-\d+)$/, id);
    for (const id of new Set(ids)) {
      assert.equal(ids.filter((value) => value === id).length, 1, `duplicate id ${id}`);
    }
  }

  const architecture = await render(ARCHITECTURE);
  assert.ok(architecture.includes('id="aze-d-0-n-1"'));
  assert.ok(architecture.includes(">API gateway<"), "grouped node label");
  assert.ok(architecture.includes(">Read replica<"), "nested-group node label");
  assert.ok(architecture.includes('class="aze-diagram-label aze-diagram-group-label"'));
  assert.ok(architecture.includes(">Edge tier<"));
  assert.ok(architecture.includes(">Persistence<"));
  assert.deepEqual(
    groupRects(architecture).map((rect) => rect.depth),
    [0, 0, 0, 1],
    "the nested container is the only depth-1 group",
  );
  assert.ok(architecture.includes('id="aze-d-0-g-3" class="aze-diagram-group aze-diagram-group-depth-1"'));
  for (const port of ["aze-d-0-p-0", "aze-d-0-p-1", "aze-d-0-p-2", "aze-d-0-p-3"]) {
    assert.ok(architecture.includes(`id="${port}" class="aze-diagram-port"`), port);
  }
  assert.ok(architecture.includes('class="aze-diagram-label aze-diagram-edge-label"'));
  assert.ok(architecture.includes('class="aze-diagram-edge-label-background"'));
  assert.ok(architecture.includes(">fallback<"));
  assert.equal(count(architecture, 'class="aze-diagram-edge-label-background"'), 1);
  assert.equal(count(await render(FLOWCHART), 'class="aze-diagram-edge-label-background"'), 4);
  assert.equal(count(await render(TREE), "aze-diagram-edge-label-background"), 0);
  // The label is painted over its background rect.
  assert.ok(
    architecture.indexOf('class="aze-diagram-edge-label-background"') <
      architecture.indexOf('class="aze-diagram-label aze-diagram-edge-label"'),
  );
});

test("ids are positional and never contain an authored name", async () => {
  for (const block of BLOCKS) {
    const fragment = await render(block);
    const ids = [...fragment.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]);
    assert.ok(ids.length > 0);
    const names = block.declarations
      .map((declaration) => declaration.name)
      .filter((name) => typeof name === "string");
    assert.ok(names.length > 0);
    for (const id of ids) {
      for (const name of names) {
        assert.ok(!id.includes(name), `id ${id} leaks the authored name ${name}`);
      }
    }
    // Authored names do reach the accessible text and the figure attributes.
    assert.ok(fragment.includes(`data-diagram-id="${block.id}"`));
  }
  const architecture = await render(ARCHITECTURE);
  assert.ok(!/ id="[^"]*(?:gateway|catalog|persistence|client)[^"]*"/.test(architecture));
  assert.ok(architecture.includes(">API gateway<"));
});

test("a label carrying markup is escaped and no script reaches the fragment", async () => {
  const hostile = structuredClone(FLOWCHART);
  hostile.declarations[0].label = [
    [{ kind: "text", value: "</script><script>alert(1)</script> & <b>x</b>" }],
  ];
  const fragment = await render(hostile);
  assert.ok(
    fragment.includes("&lt;script&gt;alert(1)&lt;/script&gt; &amp; &lt;b&gt;x&lt;/b&gt;"),
  );
  assert.ok(!fragment.includes("<script"));
  assert.ok(!/<script[\s>]/i.test(fragment));
  assert.ok(!/<\/script/i.test(fragment));
  assert.ok(!/\son[a-z]+\s*=/i.test(fragment), "no event attributes");
  assert.ok(!fragment.includes("href="));
  assert.ok(!fragment.includes("<foreignObject"));
  assert.ok(!fragment.includes("url("));
  const desc = descText(fragment).text;
  assert.ok(desc.includes("&lt;script&gt;"));
  assert.ok(!/<script/i.test(desc));

  const tagged = structuredClone(FLOWCHART);
  tagged.title = [{ kind: "text", value: "A & B < C" }];
  assert.equal(titleText(await render(tagged)).text, "A &amp; B &lt; C");

  const quoted = structuredClone(FLOWCHART);
  quoted.id = 'a"b<c';
  const fragmentWithId = await render(quoted);
  assert.ok(fragmentWithId.includes('data-diagram-id="a&quot;b&lt;c"'));
});

test("no presentation attributes: only the role classes and geometry leave the emitter", async () => {
  for (const block of BLOCKS) {
    const fragment = await render(block);
    for (const tag of elementTags(fragment)) {
      assert.ok(ELEMENTS.has(tag.name), `unexpected element ${tag.name}`);
      for (const attribute of tag.attributes) {
        assert.ok(ATTRIBUTES.has(attribute), `unexpected attribute ${attribute}`);
      }
    }
    const roles = ['class="aze-diagram"', "aze-diagram-node-shape", 'class="aze-diagram-label '];
    if (block.declarations.some((declaration) => declaration.kind === "edge")) {
      roles.push('class="aze-diagram-edge"', 'class="aze-diagram-edges"');
    }
    if (DIRECTED_BY_ID[block.id].some(Boolean)) roles.push('class="aze-diagram-arrow"');
    if (groupsOf(block).length > 0) roles.push("aze-diagram-group");
    if (nodesOf(block).some((node) => node.ports.length > 0)) roles.push('class="aze-diagram-port"');
    for (const role of roles) {
      assert.ok(fragment.includes(role), role);
    }
    assert.ok(!/\s(?:style|fill|stroke|font-size|font-family|opacity|text-anchor|dominant-baseline)\s*=/.test(fragment));
  }
});

test("multi-line labels emit one tspan per authored line", async () => {
  const block = structuredClone(FLOWCHART);
  block.declarations[1].label = [
    [{ kind: "text", value: "Classify" }],
    [{ kind: "text", value: "request?" }],
  ];
  const fragment = await render(block);
  const labels = [
    ...fragment.matchAll(
      /<text class="aze-diagram-label aze-diagram-node-label"[^>]*>([\s\S]*?)<\/text>/g,
    ),
  ].map((match) => match[1]);
  const multiline = labels.find((label) => label.includes("Classify"));
  assert.notEqual(multiline, undefined);
  const spans = [...multiline.matchAll(/<tspan x="([^"]+)" dy="([^"]+)">([^<]*)<\/tspan>/g)].map(
    (match) => ({ x: match[1], dy: match[2], text: match[3] }),
  );
  assert.deepEqual(
    spans.map((span) => [span.text, span.dy]),
    [
      ["Classify", "0"],
      ["request?", String(defaultTheme.diagram.nodeLabelLineHeightPx)],
    ],
  );
  assert.equal(new Set(spans.map((span) => span.x)).size, 1, "every line shares the node centre");
  assert.ok(descText(fragment).text.includes("classify: Classify / request?"));
});

test("two renders of the same Block and Theme are byte-identical", async () => {
  for (const block of BLOCKS) {
    const first = await render(block);
    assert.equal(await render(block), first);
    assert.equal(await render(block, { theme: academicTheme }), await render(block, { theme: academicTheme }));
  }
  assert.equal(await renderDiagramFragment(FLOWCHART, {}), await render(FLOWCHART, { theme: defaultTheme }));
});

test("adjacency is Theme-invariant while geometry is layout-derived", async () => {
  const themes = [defaultTheme, academicTheme, darkPresentationTheme];
  const rendered = [];
  for (const theme of themes) rendered.push(await render(ARCHITECTURE, { theme }));
  const adjacency = rendered.map((fragment) =>
    edgeSegments(fragment).map((segment) => [segment.index, segment.arrow, segment.label]),
  );
  assert.deepEqual(adjacency[1], adjacency[0]);
  assert.deepEqual(adjacency[2], adjacency[0]);
  assert.deepEqual(
    adjacency[0],
    DIRECTED_BY_ID["service-architecture"].map((directed, index) => [
      index,
      directed,
      LABELS_BY_ID["service-architecture"][index],
    ]),
  );

  const extent = (fragment) => /viewBox="0 0 ([0-9.]+) ([0-9.]+)"/.exec(fragment).slice(1);
  const defaultExtent = extent(rendered[0]);
  const darkExtent = extent(rendered[2]);
  assert.notDeepEqual(darkExtent, defaultExtent, "a larger label font resizes the figure");
  const paths = (fragment) =>
    [...fragment.matchAll(/ d="([^"]*)"/g)].map((match) => match[1]);
  assert.notDeepEqual(
    paths(rendered[2]),
    paths(rendered[0]),
    "edge geometry is measured, not authored",
  );
});

test("the renderer descriptor, its exports and the dependency closure are frozen", async () => {
  assert.equal(DIAGRAM_HTML_BLOCK_RENDERER_ID, "azeforge.diagram.html/v1");
  assert.equal(DIAGRAM_HTML_BLOCK_RENDERER_VERSION, "1.0.0");
  assert.equal(DIAGRAM_EMITTER_VERSION, "1.0.0");
  const closure = diagramDependencyClosure();
  assert.deepEqual(Object.keys(closure), [
    "layout",
    "elkjs",
    "emitter",
    "advanceMetric",
    "quantization",
    "options",
  ]);
  assert.equal(closure.layout, "diagram-layout/v1");
  assert.equal(closure.elkjs, "0.12.0");
  assert.equal(closure.emitter, DIAGRAM_EMITTER_VERSION);
  assert.equal(closure.quantization, 3);
  assert.equal(closure.options, "diagram-options/v1");
  // §12: the metric half of the closure carries its version *and* the pinned
  // font sources, so regenerating the table moves every renderer fingerprint.
  assert.equal(closure.advanceMetric.metric, "1.0.0");
  assert.equal(closure.advanceMetric.family, "Inter");
  assert.equal(closure.advanceMetric.monospace.family, "JetBrains Mono");
  const sources = closure.advanceMetric.sources;
  assert.equal(sources.length, 13);
  assert.deepEqual(
    [...new Set(sources.map((source) => `@${source.split(":")[0].split("@")[1]}`))].sort(),
    ["@fontsource/inter", "@fontsource/jetbrains-mono"],
  );
  for (const source of sources) {
    assert.match(source, /^@fontsource\/[a-z-]+@\d+\.\d+\.\d+:sha256:[0-9a-f]{64}$/);
  }
  assert.deepEqual(diagramHtmlBlockRenderer.descriptor, {
    id: DIAGRAM_HTML_BLOCK_RENDERER_ID,
    version: DIAGRAM_HTML_BLOCK_RENDERER_VERSION,
    blockType: "diagram",
    pluginVersionRange: "1.0.0",
    rendererId: "html",
    rendererVersionRange: "1.0.0",
  });
  const fragment = await diagramHtmlBlockRenderer.render(FLOWCHART, { ordinal: 2 });
  assert.ok(fragment.startsWith('<figure class="aze-diagram" data-ordinal="2"'));
  assert.ok(fragment.includes('aria-labelledby="aze-d-2-title aze-d-2-desc"'));
  assert.ok(fragment.includes('id="aze-d-2-n-0"'));
  assert.ok(fragment.includes('id="aze-d-2-e-0"'));
});

test("a Block with no authored id or title still names itself positionally", async () => {
  const block = structuredClone(TREE);
  delete block.id;
  delete block.title;
  const fragment = await render(block, { ordinal: 3 });
  assert.ok(!fragment.includes("data-diagram-id"));
  assert.equal(titleText(fragment).text, "Diagram 3");
  const titled = structuredClone(TREE);
  delete titled.title;
  assert.equal(titleText(await render(titled)).text, "Diagram compiler-tree");
});

test("a wide but valid layout renders: the emitter registers no extent ceiling", async () => {
  const wide = {
    kind: "diagram",
    pluginVersion: "1.0.0",
    range: BLOCK_RANGE,
    id: "wide",
    mode: "graph",
    flow: "left-to-right",
    declarations: Array.from({ length: 128 }, (_, index) => ({
      kind: "node",
      name: `n${index}`,
      label: [[{ kind: "text", value: "W".repeat(500) }]],
      shape: "rectangle",
      ports: [],
      range: BLOCK_RANGE,
    })),
  };
  const fragment = await render(wide);
  const box = /viewBox="0 0 ([0-9.]+) ([0-9.]+)"/.exec(fragment);
  assert.ok(box !== null, "the wide figure still carries a viewBox");
  assert.ok(Number(box[1]) > 4096, `expected an extent beyond 4096 px, got ${box[1]}`);
  assert.ok(fragment.includes("aze-diagram-shape-rectangle"));
  // Layout is total, so nothing throws here; the Artifact-format legs own
  // their published byte and pixel limits and fail closed on their own terms.
});
