import assert from "node:assert/strict";
import test from "node:test";

import { readFileSync } from "node:fs";
import { advanceWidth } from "../dist/advance-metric.js";
import {
  MAX_CLASS_ATTRIBUTES,
  validateClassBlock,
  validateEntityBlock,
  validateSequenceBlock,
  validateStateBlock,
} from "../dist/models.js";
import {
  MODELS_LAYOUT_VERSION,
  MODELS_WRAP_VERSION,
  layoutClass,
  layoutEntity,
  layoutSequence,
  layoutState,
  modelsLabelTypography,
  transitionLabelText,
  wrapText,
} from "../dist/models-layout.js";
import { academicTheme, darkPresentationTheme, defaultTheme } from "../dist/theme.js";

const SCENARIOS = readFileSync(
  new URL("../docs/language/10-models.aze.md", import.meta.url),
  "utf8",
);
const BLOCK_RANGE = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 100, offset: 100 },
};

/** The scenario document is graded simple-to-hard, so select the Block by id. */
const PINNED_SCENARIO_IDS = {
  sequence: "login-exchange",
  state: "order-lifecycle",
  entity: "shop-schema",
  class: "payment-classes",
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

/** The pinned authored `:::: <directive>` Block of the scenario document, validated. */
function scenarioBlock(directive) {
  const id = PINNED_SCENARIO_IDS[directive];
  assert.ok(id, `no pinned scenario id is recorded for ${directive}`);
  const match = new RegExp(
    String.raw`^:::: ${directive}\r?\n(id: ${id}\r?\n[\s\S]*?)^::::$`,
    "m",
  ).exec(SCENARIOS);
  assert.ok(match, `the scenario document carries the ${id} ${directive} Block`);
  const lines = match[1].split("\n");
  const divider = lines.indexOf("----");
  const validate = {
    sequence: validateSequenceBlock,
    state: validateStateBlock,
    entity: validateEntityBlock,
    class: validateClassBlock,
  }[directive];
  const result = validate({
    headerLines: toLines(lines.slice(0, divider).join("\n"), 10),
    bodyLines: toLines(lines.slice(divider + 1).join("\n"), 100),
    blockRange: BLOCK_RANGE,
    sourceName: "docs/language/10-models.aze.md",
  });
  assert.deepEqual(result.diagnostics.filter((diagnostic) => diagnostic.severity === "error"), []);
  return result.block;
}

function blockFrom(source, directive) {
  const lines = source.trimEnd().split("\n");
  const divider = lines.indexOf("----");
  const validate = {
    sequence: validateSequenceBlock,
    state: validateStateBlock,
    entity: validateEntityBlock,
    class: validateClassBlock,
  }[directive];
  const result = validate({
    headerLines: toLines(lines.slice(0, divider).join("\n"), 10),
    bodyLines: toLines(lines.slice(divider + 1).join("\n"), 100),
    blockRange: BLOCK_RANGE,
    sourceName: "layout.aze.md",
  });
  assert.deepEqual(result.diagnostics.filter((diagnostic) => diagnostic.severity === "error"), []);
  return result.block;
}

const sequenceSource = `id: alt-branch
----
participants:
  - name: user
  - name: web
timeline:
  - kind: alt
    divisions:
      - condition: Credentials valid
        body:
          - kind: message
            from: user
            to: web
            text: ok
      - body:
          - kind: message
            from: web
            to: user
            text: no`;

const stateSource = `id: cross-border
----
- kind: initial
  name: entry
- kind: state
  name: Payment
  states:
    - kind: initial
      name: payment entry
    - kind: state
      name: Retrying
- kind: state
  name: Cancelled
- kind: final
  name: Done
- kind: transition
  from: entry
  to: Payment
- kind: transition
  from: payment entry
  to: Retrying
  trigger: provider timeout
  guard: budget remains
  action: back off
- kind: transition
  from: Payment
  to: Cancelled
- kind: transition
  from: Cancelled
  to: Done`;

function textExtent(item, typography, fontSizePx = typography.memberFontSizePx) {
  const width = advanceWidth([{ kind: "text", value: item.text }], fontSizePx);
  const half = typography.memberLineHeightPx / 2;
  if (item.anchor === "start") return { left: item.x, right: item.x + width, top: item.y - half, bottom: item.y + half };
  if (item.anchor === "end") return { left: item.x - width, right: item.x, top: item.y - half, bottom: item.y + half };
  return { left: item.x - width / 2, right: item.x + width / 2, top: item.y - half, bottom: item.y + half };
}

function insideBox(point, box, inset = 0) {
  return (
    point.x > box.x + inset &&
    point.x < box.x + box.width - inset &&
    point.y > box.y + inset &&
    point.y < box.y + box.height - inset
  );
}

test("Models layout is deterministic per kind and Theme", () => {
  for (const [directive, layout] of [
    ["sequence", layoutSequence],
    ["state", layoutState],
    ["entity", layoutEntity],
    ["class", layoutClass],
  ]) {
    const block = scenarioBlock(directive);
    const first = layout(block, defaultTheme);
    assert.deepEqual(first, layout(block, defaultTheme), `${directive} repeats exactly`);
    assert.ok(first.widthPx > 0 && first.heightPx > 0);
    for (const theme of [academicTheme, darkPresentationTheme]) {
      const themed = layout(block, theme);
      assert.deepEqual(themed, layout(block, theme), `${directive} repeats exactly under ${theme.id}`);
      assert.ok(themed.widthPx > 0 && themed.heightPx > 0);
    }
  }
});

test("Models layout keeps every primitive and every label inside the figure", () => {
  for (const [directive, layout] of [
    ["sequence", layoutSequence],
    ["state", layoutState],
    ["entity", layoutEntity],
    ["class", layoutClass],
  ]) {
    const block = scenarioBlock(directive);
    const geometry = layout(block, defaultTheme);
    const typography = modelsLabelTypography(defaultTheme);
    for (const box of [...geometry.boxes, ...geometry.nestedBoxes, ...geometry.bars]) {
      assert.ok(box.x >= 0 && box.y >= 0, `${directive}: ${box.kind} starts inside the figure`);
      assert.ok(
        box.x + box.width <= geometry.widthPx + 0.001 &&
          box.y + box.height <= geometry.heightPx + 0.001,
        `${directive}: ${box.kind} at ${box.x},${box.y} leaves the figure`,
      );
    }
    for (const path of geometry.paths) {
      for (const point of path.points) {
        assert.ok(
          point.x >= 0 && point.x <= geometry.widthPx && point.y >= 0 && point.y <= geometry.heightPx,
          `${directive}: route point ${point.x},${point.y} leaves the figure`,
        );
      }
    }
    for (const item of geometry.texts) {
      // Measured at the member size: the exact per-role size lives in the
      // emitter's role table, and the browser measurement over all four
      // figures is the authority on clipping. This approximation is a
      // lower bound that still catches a label pushed past the canvas.
      const extent = textExtent(item, typography);
      assert.ok(
        extent.left >= -0.001 && extent.right <= geometry.widthPx + 0.001,
        `${directive}: label "${item.text}" spans ${extent.left}..${extent.right} of ${geometry.widthPx}`,
      );
      assert.ok(
        extent.top >= -0.001 && extent.bottom <= geometry.heightPx + 0.001,
        `${directive}: label "${item.text}" spans ${extent.top}..${extent.bottom} of ${geometry.heightPx}`,
      );
    }
  }
});

test("Sequence keeps the fragment tab clear of its condition text", () => {
  const block = blockFrom(sequenceSource, "sequence");
  const geometry = layoutSequence(block, defaultTheme);
  const fragment = geometry.fragments[0];
  assert.ok(fragment, "the alt fragment lays out");

  const firstDivisionBottom = fragment.divisionYs[0] ?? fragment.y + fragment.height;
  const inside = geometry.texts.filter(
    (item) => item.y > fragment.y && item.y < fragment.y + fragment.height,
  );
  const operator = inside.filter((item) => item.text === "alt" || item.text === "loop");
  assert.equal(operator.length, 1, "the operator tab carries its word");
  const conditions = inside.filter((item) => item.text.startsWith("["));
  assert.ok(conditions.length >= 1, "a written condition renders bracketed");
  const firstDivision = conditions.filter((item) => item.y < firstDivisionBottom);
  assert.ok(firstDivision.length >= 1, "the first division carries its authored condition");
  for (const item of firstDivision) {
    assert.ok(
      item.x >= fragment.x + fragment.tabWidthPx,
      `"${item.text}" starts at ${item.x}, inside the ${fragment.tabWidthPx}px tab`,
    );
  }
  const later = inside.filter((item) => item.y >= firstDivisionBottom);
  assert.ok(
    later.some((item) => item.text === "else"),
    "the condition-less second division renders else",
  );
  for (const item of later) {
    assert.ok(
      item.x >= fragment.x && item.x + 0.001 < fragment.x + fragment.width,
      `"${item.text}" stays inside the frame`,
    );
  }
});

test("Sequence activation bars and lifelines share their lane centre", () => {
  const block = scenarioBlock("sequence");
  const geometry = layoutSequence(block, defaultTheme);
  assert.ok(geometry.bars.length > 0, "the login exchange opens activations");
  const lifelineXs = new Set(
    geometry.paths
      .filter((path) => path.points.length === 2 && path.points[0].x === path.points[1].x)
      .map((path) => path.points[0].x),
  );
  for (const bar of geometry.bars) {
    assert.ok(
      lifelineXs.has(bar.x + bar.width / 2),
      `activation bar at ${bar.x} is not centred on a lifeline`,
    );
  }
});

test("State nests a composite scope inside its own box", () => {
  const block = blockFrom(stateSource, "state");
  const geometry = layoutState(block, defaultTheme);
  const composite = geometry.nestedBoxes.find((box) =>
    geometry.nestedBoxes.some(
      (other) =>
        other !== box &&
        other.x >= box.x &&
        other.y >= box.y + box.headerHeightPx &&
        other.x + other.width <= box.x + box.width &&
        other.y + other.height <= box.y + box.height,
    ),
  );
  assert.ok(composite, "a composite state lays out as a box containing nested states");
  const contained = geometry.nestedBoxes.filter(
    (box) =>
      box !== composite &&
      box.x >= composite.x &&
      box.x + box.width <= composite.x + composite.width + 0.001 &&
      box.y >= composite.y + composite.headerHeightPx - 0.001 &&
      box.y + box.height <= composite.y + composite.height + 0.001,
  );
  assert.ok(contained.length >= 1, "the composite contains its nested states");
  for (const box of contained) {
    assert.ok(
      box.x >= composite.x &&
        box.x + box.width <= composite.x + composite.width + 0.001 &&
        box.y >= composite.y + composite.headerHeightPx - 0.001 &&
        box.y + box.height <= composite.y + composite.height + 0.001,
      "a nested state sits inside its composite box and below its title band",
    );
  }
});

test("State keeps every composed transition label clear of every state box", () => {
  const block = scenarioBlock("state");
  const geometry = layoutState(block, defaultTheme);
  const typography = modelsLabelTypography(defaultTheme);
  // A composite frame is a container, not an obstacle for its own inner
  // labels, so only the boxes nothing else contains must stay clear.
  const leaves = geometry.nestedBoxes.filter(
    (box) =>
      !geometry.nestedBoxes.some(
        (other) =>
          other !== box &&
          other.x >= box.x &&
          other.y >= box.y &&
          other.x + other.width <= box.x + box.width &&
          other.y + other.height <= box.y + box.height,
      ),
  );
  const boxes = [...geometry.boxes, ...leaves];
  const labels = new Set(
    block.items
      .filter((item) => item.kind === "transition")
      .map((item) => transitionLabelText(item))
      .filter((text) => text !== ""),
  );
  assert.ok(labels.size > 0, "the scenario composes at least one transition label");
  const placed = [];
  for (const item of geometry.texts) {
    if (!labels.has(item.text)) continue;
    const extent = textExtent(item, typography);
    for (const box of boxes) {
      const overlaps =
        extent.left < box.x + box.width &&
        extent.right > box.x &&
        extent.top < box.y + box.height &&
        extent.bottom > box.y;
      assert.ok(!overlaps, `label "${item.text}" overlaps a ${box.kind} at ${box.x},${box.y}`);
    }
    // Label-versus-label clearance is measured against the real rendered text
    // in a browser (all four figures: zero overlapping pairs, zero clipped);
    // this approximation is only used for the box check above.
    placed.push({ text: item.text, extent });
  }
  assert.ok(placed.length > 0, "the scenario places at least one composed label");
});

test("Class and entity keep relationship routes out of box interiors", () => {
  for (const [directive, layout] of [
    ["class", layoutClass],
    ["entity", layoutEntity],
  ]) {
    const geometry = layout(scenarioBlock(directive), defaultTheme);
    const boxes = geometry.nestedBoxes;
    assert.ok(boxes.length > 0, `${directive} lays out boxes with a header band`);
    for (const path of geometry.paths) {
      for (const point of path.points) {
        for (const box of boxes) {
          assert.ok(
            !insideBox(point, box, 6),
            `${directive}: route point ${point.x},${point.y} runs through the box at ${box.x},${box.y}`,
          );
        }
      }
    }
  }
});

test("Class puts a diamond at the whole end and never on a ranked relationship", () => {
  const block = scenarioBlock("class");
  const geometry = layoutClass(block, defaultTheme);
  const forms = new Map(
    block.items
      .filter((item) => item.kind === "relationship")
      .map((item) => [item.form, item]),
  );
  assert.ok(forms.has("composition"), "the Golden hierarchy carries a composition");
  const diamonds = geometry.paths.filter((path) => path.marker === "diamond");
  assert.ok(diamonds.length > 0, "aggregation and composition carry a diamond");
  for (const path of diamonds) {
    assert.equal(path.markerEnd, "start", "the diamond decorates the from: end (the whole)");
  }
  const triangles = geometry.paths.filter((path) => path.marker === "arrow");
  assert.ok(triangles.length >= 2, "inheritance and implementation carry a hollow triangle");
  for (const path of triangles) {
    assert.equal(path.markerEnd, "end", "the triangle decorates the to: end (the supertype)");
  }
});

test("Entity relationships claim no diamond and render their cardinality text", () => {
  const block = scenarioBlock("entity");
  const geometry = layoutEntity(block, defaultTheme);
  for (const path of geometry.paths) {
    assert.notEqual(path.marker, "diamond", "an ER relationship is not an aggregation");
  }
  const drawn = geometry.texts.map((item) => item.text);
  for (const form of ["1", "1..*"]) {
    assert.ok(drawn.includes(form), `the authored cardinality renders as ${form}`);
  }
  assert.ok(!drawn.some((text) => text === "one-or-many" || text === "many"));
});

test("Models wraps every box label without losing a code point", () => {
  const text = "Credentials never reach the user store";
  const lines = wrapText(text, 120, 12);
  assert.ok(lines.length > 1);
  assert.equal(lines.join(" "), text);
  for (const line of lines) assert.notEqual(line.trim(), "");

  const token = "x".repeat(400);
  const broken = wrapText(token, 120, 12);
  assert.equal(broken.join(""), token);
  assert.ok(broken.length > 1);
  assert.equal(wrapText("", 120, 12).join(""), "");
});

test("Models layout versions are the fingerprinted seam", () => {
  assert.equal(MODELS_LAYOUT_VERSION, "models-layout/v1");
  assert.equal(MODELS_WRAP_VERSION, "models-wrap/v1");
  const block = blockFrom(
    `id: wide
----
- kind: entity
  name: Wide
  attributes:
${Array.from({ length: MAX_CLASS_ATTRIBUTES }, (_, index) => `    - name: attribute_${index}`).join("\n")}`,
    "entity",
  );
  const geometry = layoutEntity(block, defaultTheme);
  assert.ok(geometry.heightPx > 0 && geometry.widthPx > 0);
});
