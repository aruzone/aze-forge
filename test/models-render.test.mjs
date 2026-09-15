import assert from "node:assert/strict";
import test from "node:test";

import { readFileSync } from "node:fs";
import {
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
  wrapText,
} from "../dist/models-layout.js";
import {
  MODELS_EMITTER_VERSION,
  MODELS_HTML_BLOCK_RENDERER_VERSION,
  ModelsRenderError,
  modelsDependencyClosure,
  renderClassFragment,
  renderEntityFragment,
  renderSequenceFragment,
  renderStateFragment,
} from "../dist/models-render.js";
import { darkPresentationTheme, defaultTheme } from "../dist/theme.js";

const GOLDEN = readFileSync(
  new URL("../acceptance/golden-report.aze.md", import.meta.url),
  "utf8",
);
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

/** The authored `:::: <directive>` Blocks of the Golden report, in document order. */
function goldenBlocks(directive) {
  const blocks = [];
  for (const match of GOLDEN.matchAll(
    new RegExp(String.raw`^:::: ${directive}\r?\n([\s\S]*?)^::::$`, "gm"),
  )) {
    const lines = match[1].split("\n");
    const divider = lines.indexOf("----");
    assert.ok(divider > 0, `authored ${directive} Block carries a header divider`);
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
      sourceName: "acceptance/golden-report.aze.md",
    });
    assert.deepEqual(
      result.diagnostics.filter((diagnostic) => diagnostic.severity === "error"),
      [],
      `the Golden ${directive} scenario validates`,
    );
    assert.notEqual(result.block, undefined);
    blocks.push(result.block);
  }
  return blocks;
}

test("Models emits the Golden sequence as a static, accessible figure", () => {
  const [block] = goldenBlocks("sequence");
  const svg = renderSequenceFragment(block, { ordinal: 3, theme: defaultTheme });
  assert.match(svg, /^<figure class="aze-sequence" id="aze-seq-3"/);
  assert.match(svg, /data-sequence-id="login-exchange"/);
  assert.match(svg, /data-sequence-number="true"/);
  assert.match(svg, /<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /role="img" aria-labelledby="aze-seq-3-title aze-seq-3-desc"/);
  assert.match(svg, /<title id="aze-seq-3-title">/);
  assert.match(svg, /<desc id="aze-seq-3-desc">/);
  for (const className of [
    "aze-sequence-participant",
    "aze-sequence-lifeline",
    "aze-sequence-activation",
    "aze-sequence-message",
    "aze-sequence-arrow",
    "aze-sequence-fragment",
    "aze-sequence-note",
  ]) {
    assert.ok(svg.includes(className), `expected ${className}`);
  }
  for (const text of [
    "User",
    "Web app",
    "Submit credentials",
    "Verify session",
    "Load user",
    "Session token",
    "Sign-in page",
    "Credentials valid",
    "Retry budget remains",
  ]) {
    assert.ok(svg.includes(text), `expected authored text ${text}`);
  }
  assert.ok(svg.includes("Credentials never reach the user store"));
  assert.match(svg, /aria-hidden="true"/);
  assert.doesNotMatch(svg, /<script/i);
  assert.doesNotMatch(svg, /\son[a-z]+=/i);
  assert.doesNotMatch(svg, /-?\d+\.\d{4,}/, "coordinates are quantized to three decimals");
  const summary = /<desc id="aze-seq-3-desc">([\s\S]*?)<\/desc>/.exec(svg);
  assert.ok(summary, "the figure carries a description");
  assert.ok(summary[1].includes("Submit credentials"));
});

test("Models emits the Golden class hierarchy with members, dividers and diamonds", () => {
  const [block] = goldenBlocks("class");
  const svg = renderClassFragment(block, { ordinal: 1, theme: defaultTheme });
  assert.match(svg, /class="aze-class"/);
  assert.match(svg, /data-class-id="payment-classes"/);
  for (const className of [
    "aze-class-box",
    "aze-class-header",
    "aze-class-member",
    "aze-class-divider",
    "aze-class-relationship",
    "aze-class-diamond",
    "aze-class-arrow",
  ]) {
    assert.ok(svg.includes(className), `expected ${className}`);
  }
  for (const text of ["PaymentGateway", "StripeGateway", "RefundableOrder", "api_key", "total(): Money"]) {
    assert.ok(svg.includes(text), `expected ${text}`);
  }
  assert.doesNotMatch(svg, /<script/i);
  assert.doesNotMatch(svg, /-?\d+\.\d{4,}/);
});

test("Models emits the state and entity figures over their own geometry", () => {
  const state = renderStateFragment(
    {
      kind: "state",
      pluginVersion: "1.0.0",
      range: BLOCK_RANGE,
      id: "order-lifecycle",
      number: true,
      items: [
        { kind: "initial", name: "entry", range: BLOCK_RANGE },
        { kind: "state", name: "Draft", states: [], range: BLOCK_RANGE },
        { kind: "final", name: "Done", range: BLOCK_RANGE },
        {
          kind: "transition",
          from: "entry",
          to: "Draft",
          trigger: "checkout",
          guard: "cart is not empty",
          action: "reserve stock",
          range: BLOCK_RANGE,
        },
        { kind: "transition", from: "Draft", to: "Done", range: BLOCK_RANGE },
      ],
    },
    { ordinal: 0, theme: defaultTheme },
  );
  assert.match(state, /class="aze-state"/);
  assert.match(state, /data-state-id="order-lifecycle"/);
  assert.ok(state.includes("aze-state-initial"));
  assert.ok(state.includes("aze-state-final"));
  assert.ok(state.includes("aze-state-transition"));
  assert.ok(state.includes("checkout"));
  assert.ok(!/>entry</.test(state), "an initial pseudo-state never shows its name");

  const entity = renderEntityFragment(
    {
      kind: "entity",
      pluginVersion: "1.0.0",
      range: BLOCK_RANGE,
      id: "shop-schema",
      items: [
        {
          kind: "entity",
          name: "Order",
          attributes: [
            { name: "id", type: "uuid", keys: ["primary"], optional: false, range: BLOCK_RANGE },
            { name: "note", type: "text", keys: [], optional: true, range: BLOCK_RANGE },
          ],
          range: BLOCK_RANGE,
        },
        { kind: "entity", name: "Customer", attributes: [], range: BLOCK_RANGE },
        {
          kind: "relationship",
          first: { entity: "Customer", cardinality: "one", range: BLOCK_RANGE },
          second: { entity: "Order", cardinality: "one-or-many", range: BLOCK_RANGE },
          range: BLOCK_RANGE,
        },
      ],
    },
    { ordinal: 0, theme: defaultTheme },
  );
  assert.match(entity, /class="aze-entity"/);
  assert.match(entity, /data-entity-id="shop-schema"/);
  assert.ok(entity.includes("aze-entity-attribute"));
  assert.ok(entity.includes("1..*"), "cardinality renders its registered display form");
  assert.ok(!entity.includes("one-or-many"), "authored cardinality words never reach output");
  assert.ok(!entity.includes(">Customer<") === false, "entity names render as authored");
});

test("Models layout is total and deterministic across themes", () => {
  for (const directive of ["sequence", "class"]) {
    const [block] = goldenBlocks(directive);
    const layout = (directive === "sequence" ? layoutSequence : layoutClass)(block, defaultTheme);
    const again = (directive === "sequence" ? layoutSequence : layoutClass)(block, defaultTheme);
    assert.deepEqual(layout, again, `${directive} layout is deterministic`);
    assert.ok(layout.widthPx > 0 && layout.heightPx > 0);
    const dark = (directive === "sequence" ? layoutSequence : layoutClass)(block, darkPresentationTheme);
    assert.ok(dark.widthPx > 0 && dark.heightPx > 0);
  }
  const state = layoutState(
    { kind: "state", pluginVersion: "1.0.0", range: BLOCK_RANGE, items: [] },
    defaultTheme,
  );
  const entity = layoutEntity(
    { kind: "entity", pluginVersion: "1.0.0", range: BLOCK_RANGE, items: [] },
    defaultTheme,
  );
  assert.ok(state.widthPx > 0 && entity.widthPx > 0);
});

test("Models wraps without losing a code point and hard-breaks overlong tokens", () => {
  const text = "Credentials never reach the user store";
  const lines = wrapText(text, 120, 12);
  assert.ok(lines.length > 1);
  assert.equal(lines.join(" "), text);
  for (const line of lines) assert.notEqual(line.trim(), "");

  const token = "x".repeat(400);
  const broken = wrapText(token, 120, 12);
  assert.equal(broken.join(""), token, "a hard break never drops a code point");
  assert.ok(broken.length > 1);

  assert.equal(wrapText("", 120, 12).join(""), "");
});

test("Models dependency closure fingerprints layout, wrap, emitter and metric", () => {
  const closure = modelsDependencyClosure();
  assert.equal(closure.layout, MODELS_LAYOUT_VERSION);
  assert.equal(closure.wrap, MODELS_WRAP_VERSION);
  assert.equal(closure.emitter, MODELS_EMITTER_VERSION);
  assert.equal(closure.quantization, 3);
  assert.ok(closure.advanceMetric !== undefined);
  assert.equal(MODELS_HTML_BLOCK_RENDERER_VERSION, "1.0.0");
  assert.equal(new ModelsRenderError("x").code, "azeforge.renderer#models-render");
});

test("Models fails closed when a valid Block exceeds the pixel ceiling", () => {
  const label = "w".repeat(200);
  const participants = Array.from({ length: 12 }, (_, index) => ({
    name: `participant ${index}`,
    kind: "participant",
    label,
    range: BLOCK_RANGE,
  }));
  // 12 lanes and a full timeline of long labels stay inside every Source
  // ceiling yet exceed the 4096 x 16384 px per-Block render budget.
  const timeline = Array.from({ length: 256 }, (_, index) => ({
    kind: "message",
    form: "sync",
    from: participants[index % 12].name,
    to: participants[(index + 1) % 12].name,
    text: label,
    activate: false,
    deactivate: false,
    range: BLOCK_RANGE,
  }));
  assert.throws(
    () =>
      renderSequenceFragment(
        {
          kind: "sequence",
          pluginVersion: "1.0.0",
          range: BLOCK_RANGE,
          participants,
          timeline,
        },
        { ordinal: 0, theme: defaultTheme },
      ),
    (error) => {
      assert.ok(error instanceof ModelsRenderError);
      assert.match(error.message, /4096/);
      return true;
    },
  );
});
