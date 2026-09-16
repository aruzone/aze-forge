import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { advanceWidth } from "../dist/advance-metric.js";
import {
  BLOCK_PADDING_X,
  CONTROL_LAYOUT_ERROR_CODE,
  CONTROL_LAYOUT_OPTIONS_VERSION,
  ControlLayoutError,
  ELKJS_VERSION,
  layoutControl,
} from "../dist/control-layout.js";
import { CONTROL_OPTIONS_VERSION, CONTROL_LAYOUT_VERSION } from "../dist/control-schemas.js";
import { validateControlBlock } from "../dist/control.js";
import { academicTheme, darkPresentationTheme, defaultTheme } from "../dist/theme.js";

const SCENARIOS = readFileSync(
  new URL("../docs/language/09-engineering.aze.md", import.meta.url),
  "utf8",
);
const SOURCE_NAME = "docs/language/09-engineering.aze.md";
const BLOCK_RANGE = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 100, offset: 100 },
};

function toLines(text, startLine) {
  const lines = text.split("\n");
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

function scenarioBlock(id) {
  const match = new RegExp(`^:::: control\\r?\\n([\\s\\S]*?)^::::$`, "gm");
  for (const found of SCENARIOS.matchAll(match)) {
    const [header, body] = found[1].split(/\r?\n----\r?\n/);
    if (!header.includes(`id: ${id}`)) continue;
    const result = validateControlBlock({
      headerLines: toLines(header, 1),
      bodyLines: toLines(body, 30),
      blockRange: BLOCK_RANGE,
      sourceName: SOURCE_NAME,
    });
    assert.deepEqual(result.diagnostics.filter(({ severity }) => severity === "error"), []);
    assert.ok(result.block !== undefined);
    return result.block;
  }
  throw new Error(`no control Block with id ${id}`);
}

function quantized(value) {
  return Number(value.toFixed(3)) === value;
}

test("control layout: the pinned engine and option set are the shared ones", () => {
  const pinned = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ).dependencies.elkjs;
  assert.equal(pinned, ELKJS_VERSION);
  assert.equal(CONTROL_LAYOUT_OPTIONS_VERSION, CONTROL_OPTIONS_VERSION);
  assert.equal(CONTROL_LAYOUT_VERSION, "control-layout/v1");
  assert.equal(CONTROL_LAYOUT_ERROR_CODE, "azeforge.renderer#control-layout");
});

test("control layout: every Block lays out totally and deterministically", async () => {
  const block = scenarioBlock("pitch-loop");
  const first = await layoutControl(block, defaultTheme);
  const second = await layoutControl(block, defaultTheme);
  assert.deepEqual(first, second);

  assert.ok(first.width > 0 && first.height > 0);
  assert.equal(first.nodes.length, 5);
  assert.equal(first.edges.length, 5);
  for (const node of first.nodes) {
    for (const value of [node.x, node.y, node.width, node.height]) {
      assert.ok(Number.isFinite(value));
      assert.ok(quantized(value), `unquantized ${value}`);
    }
    assert.ok(node.x >= 0 && node.y >= 0);
    assert.ok(node.x + node.width <= first.width + 1e-9);
    assert.ok(node.y + node.height <= first.height + 1e-9);
  }
  for (const edge of first.edges) {
    assert.ok(edge.sections.length >= 1);
    for (const section of edge.sections) {
      for (const point of [section.startPoint, section.endPoint, ...section.bendPoints]) {
        assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
        assert.ok(quantized(point.x) && quantized(point.y));
      }
    }
  }
  assert.deepEqual(
    first.nodes.map(({ name, declarationIndex }) => [name, declarationIndex]),
    [
      ["ref", 0],
      ["err", 1],
      ["ctrl", 2],
      ["plant", 3],
      ["out", 4],
    ],
  );
});

test("control layout: node boxes cover their measured labels", async () => {
  const block = scenarioBlock("pitch-loop");
  const layout = await layoutControl(block, academicTheme);
  const blockItem = block.declarations.find(({ kind }) => kind === "block");
  const node = layout.nodes.find(({ name }) => name === blockItem.name);
  const measured = advanceWidth(blockItem.tf, academicTheme.control.blockLabelFontSizePx);
  assert.ok(
    node.width >= measured + 2 * BLOCK_PADDING_X - 1e-3,
    `${node.width} < ${measured} + padding`,
  );
});

test("control layout: a bigger Theme typography yields a bigger canvas", async () => {
  const block = scenarioBlock("pitch-loop");
  const light = await layoutControl(block, defaultTheme);
  const dark = await layoutControl(block, darkPresentationTheme);
  assert.ok(dark.width > light.width);
});

test("control layout: the authored flow picks the rank direction", async () => {
  const block = scenarioBlock("pitch-loop");
  const horizontal = await layoutControl(block, defaultTheme);
  const vertical = await layoutControl({ ...block, flow: "top-to-bottom" }, defaultTheme);
  assert.ok(horizontal.width > horizontal.height);
  assert.ok(vertical.height > vertical.width);
  assert.notDeepEqual(
    horizontal.nodes.map(({ name, x, y }) => [name, x, y]),
    vertical.nodes.map(({ name, x, y }) => [name, x, y]),
  );
});

test("control layout: a self-loop routes as an ordinary loopback", async () => {
  const block = scenarioBlock("floating-trim");
  const layout = await layoutControl(block, defaultTheme);
  const loop = layout.edges.find(({ from, to }) => from === to);
  assert.ok(loop !== undefined, "expected the self-loop edge");
  assert.ok(loop.sections.length >= 1);
  for (const section of loop.sections) {
    assert.ok(Number.isFinite(section.startPoint.x) && Number.isFinite(section.startPoint.y));
  }
});

test("control layout: an unsound Block fails closed with a remedy", async () => {
  const block = scenarioBlock("pitch-loop");
  const broken = {
    ...block,
    declarations: block.declarations.filter(({ kind }) => kind !== "block"),
  };
  await assert.rejects(
    () => layoutControl(broken, defaultTheme),
    (error) => {
      assert.ok(error instanceof ControlLayoutError);
      assert.equal(error.code, CONTROL_LAYOUT_ERROR_CODE);
      assert.ok(error.remedy.length > 0);
      return true;
    },
  );
});
