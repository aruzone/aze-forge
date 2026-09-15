import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  CONTROL_HTML_BLOCK_RENDERER_ID,
  CONTROL_HTML_BLOCK_RENDERER_VERSION,
  ControlRenderError,
  assertControlFragmentSafe,
  controlDependencyClosure,
  controlHtmlBlockRenderer,
  renderControlFragment,
} from "../dist/control-render.js";
import {
  FREE_BODY_HTML_BLOCK_RENDERER_ID,
  FREE_BODY_HTML_BLOCK_RENDERER_VERSION,
  FreeBodyRenderError,
  assertFreeBodyFragmentSafe,
  freeBodyDependencyClosure,
  freeBodyHtmlBlockRenderer,
  renderFreeBodyFragment,
} from "../dist/free-body-render.js";
import { controlLabelTypography } from "../dist/control-layout.js";
import { validateControlBlock } from "../dist/control.js";
import { createHtmlLayout } from "../dist/render-html.js";
import { validateFreeBodyBlock } from "../dist/free-body.js";
import { academicTheme, darkPresentationTheme, defaultTheme } from "../dist/theme.js";

const GOLDEN = readFileSync(
  new URL("../acceptance/golden-report.aze.md", import.meta.url),
  "utf8",
);
const SOURCE_NAME = "acceptance/golden-report.aze.md";
const BLOCK_RANGE = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 100, offset: 100 },
};
const THEMES = [defaultTheme, academicTheme, darkPresentationTheme];

function toLines(text, startLine) {
  return text.split("\n").map((line, index) => {
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

function goldenBlocks(directive) {
  const blocks = [];
  for (const found of GOLDEN.matchAll(new RegExp(`^:::: ${directive}\\r?\\n([\\s\\S]*?)^::::$`, "gm"))) {
    const [header, body] = found[1].split(/\r?\n----\r?\n/);
    const envelope = {
      headerLines: toLines(header, 1),
      bodyLines: toLines(body, 30),
      blockRange: BLOCK_RANGE,
      sourceName: SOURCE_NAME,
    };
    const result =
      directive === "control" ? validateControlBlock(envelope) : validateFreeBodyBlock(envelope);
    assert.deepEqual(
      result.diagnostics.filter(({ severity }) => severity === "error"),
      [],
      `golden ${directive} Block must validate`,
    );
    assert.ok(result.block !== undefined);
    blocks.push(result.block);
  }
  return blocks;
}

/** Every numeric attribute/coordinate the emitter wrote must be 3-decimal quantized. */
function unquantizedNumbers(markup) {
  const offenders = [];
  for (const match of markup.matchAll(/="(-?\d+\.\d{4,})"/g)) offenders.push(match[1]);
  for (const match of markup.matchAll(/[ML]\s?(-?\d+\.\d{4,})/g)) offenders.push(match[1]);
  for (const match of markup.matchAll(/points="([^"]+)"/g)) {
    for (const pair of match[1].split(" ")) {
      if (/^-?\d+\.\d{4,}$/.test(pair)) offenders.push(pair);
    }
  }
  return offenders;
}

/* ------------------------------------------------------------------ *
 * Control
 * ------------------------------------------------------------------ */

test("control emitter: the golden controller is a self-contained static figure", async () => {
  const [block] = goldenBlocks("control");
  const markup = await renderControlFragment(block, {
    sourceName: SOURCE_NAME,
    ordinal: 0,
    theme: defaultTheme,
  });
  assertControlFragmentSafe(markup);
  assert.ok(markup.startsWith('<figure class="aze-control" id="aze-c-0"'));
  assert.ok(markup.includes('data-control-id="pitch-loop"'));
  assert.ok(markup.includes('data-control-number="true"'));
  assert.ok(markup.includes('role="img"'));
  assert.ok(markup.includes('aria-labelledby="aze-c-0-title aze-c-0-desc"'));
  assert.ok(markup.indexOf('<title id="aze-c-0-title">') < markup.indexOf('<desc id="aze-c-0-desc">'));
  assert.ok(markup.includes(">Feedback controller<"));
  for (const needle of [
    "aze-control-block",
    "aze-control-sum",
    "aze-control-input",
    "aze-control-output",
    "aze-control-edge",
    "aze-control-takeoff",
    "aze-control-arrow",
  ]) {
    assert.ok(markup.includes(needle), `missing ${needle}`);
  }
  for (let index = 0; index <= 4; index += 1) {
    assert.ok(markup.includes(`id="aze-c-0-n-${index}"`), `missing node id ${index}`);
  }
  for (let index = 0; index <= 4; index += 1) {
    assert.ok(markup.includes(`id="aze-c-0-e-${index}"`), `missing edge id ${index}`);
  }
  assert.ok(markup.includes('id="aze-c-0-t-3"'), "the plant takeoff dot is missing");
  assert.deepEqual(unquantizedNumbers(markup), []);
  assert.ok(!/<script|on[a-z]+\s*=|javascript:/i.test(markup));
});

test("control emitter: drawn text uses the layout's floored typography", async () => {
  const [block] = goldenBlocks("control");
  const tiny = {
    ...defaultTheme,
    control: { ...defaultTheme.control, blockLabelFontSizePx: 6, minimumLabelFontSizePx: 11 },
  };
  const markup = await renderControlFragment(block, { ordinal: 0, theme: tiny });
  assert.ok(markup.includes('font-size="11"'), "the drawn size is the layout's floored size");
  assert.ok(!markup.includes('font-size="6"'));
  const typography = controlLabelTypography(tiny);
  assert.equal(typography.blockFontSizePx, 11);
  assert.equal(typography.blockLineHeightPx, tiny.control.blockLabelLineHeightPx);
});

test("free-body emitter: drawn labels use the Theme's legibility floor", () => {
  const [block] = goldenBlocks("free-body");
  const tiny = {
    ...defaultTheme,
    freeBody: { ...defaultTheme.freeBody, labelFontSizePx: 5, markFontSizePx: 6, minimumLabelFontSizePx: 12 },
  };
  const markup = renderFreeBodyFragment(
    { ...block, declarations: block.declarations.map((declaration) => declaration.kind === "point" ? { ...declaration, label: [{ kind: "text", value: "P" }] } : declaration) },
    { ordinal: 0, theme: tiny },
  );
  assert.ok(!markup.includes('font-size="5"'));
  assert.ok(!markup.includes('font-size="6"'));
  assert.ok(markup.includes('font-size="12"'));
});

test("control emitter: label ink and figure sizing come from the document stylesheet", async () => {
  const [block] = goldenBlocks("control");
  const markup = await renderControlFragment(block, { ordinal: 0, theme: darkPresentationTheme });
  const layout = createHtmlLayout(
    { azemarkVersion: 2, schemaVersion: 2, metadata: { authors: [], extensions: {} }, blocks: [block] },
    darkPresentationTheme,
    [],
    new Map(),
    {},
    new Map(),
    new Map(),
    {},
    new Map(),
    {},
    new Map(),
    new Map(markup ? [[block, markup]] : []),
    {},
    {},
  );
  assert.ok(layout.css.includes(".aze-control-label{"));
  assert.ok(layout.css.includes("fill:currentColor"));
  assert.ok(layout.css.includes(".aze-control svg,.aze-free-body svg{display:block;max-width:100%"));
  assert.equal(layout.body.includes('class="aze-control"'), true);
});

test("control emitter: layout follows the Theme and identity does not", async () => {
  const [block] = goldenBlocks("control");
  const light = await renderControlFragment(block, { ordinal: 0, theme: defaultTheme });
  const dark = await renderControlFragment(block, { ordinal: 0, theme: darkPresentationTheme });
  assert.notEqual(light, dark);
  const again = await renderControlFragment(block, { ordinal: 0, theme: defaultTheme });
  assert.equal(light, again);
});

test("control emitter: authored names never reach an SVG attribute", async () => {
  const [block] = goldenBlocks("control");
  const markup = await renderControlFragment(block, { ordinal: 2, theme: defaultTheme });
  const attributes = [...markup.matchAll(/\sid="([^"]*)"/g)].map((match) => match[1]);
  for (const id of attributes) {
    assert.match(id, /^aze-c-2(?:-(?:title|desc)|-(?:n|e|t)-\d+)?$/);
  }
  const figureAttributes = [...markup.matchAll(/data-control-[a-z]+="([^"]*)"/g)].map(
    (match) => match[1],
  );
  assert.deepEqual(figureAttributes, ["pitch-loop", "true"]);
});

test("control emitter: escaping and the dependency closure", async () => {
  const [block] = goldenBlocks("control");
  const markup = await renderControlFragment(block, { ordinal: 0, theme: defaultTheme });
  assert.ok(!markup.includes("<script"));
  const closure = controlDependencyClosure();
  assert.deepEqual(Object.keys(closure).sort(), [
    "advanceMetric",
    "elkjs",
    "emitter",
    "layout",
    "options",
    "quantization",
  ]);
  assert.equal(closure.layout, "control-layout/v1");
  assert.equal(closure.elkjs, "0.12.0");
  assert.equal(closure.options, "control-options/v1");

  await assert.rejects(
    () => renderControlFragment(block, { ordinal: 0 }),
    (error) => {
      assert.ok(error instanceof ControlRenderError);
      assert.equal(error.code, "azeforge.renderer#control-render");
      return true;
    },
  );
});

test("control emitter: the registered renderer is frozen and versioned", async () => {
  assert.equal(controlHtmlBlockRenderer.descriptor.id, CONTROL_HTML_BLOCK_RENDERER_ID);
  assert.equal(controlHtmlBlockRenderer.descriptor.version, CONTROL_HTML_BLOCK_RENDERER_VERSION);
  assert.equal(controlHtmlBlockRenderer.descriptor.blockType, "control");
  assert.equal(controlHtmlBlockRenderer.descriptor.rendererId, "html");
  assert.ok(Object.isFrozen(controlHtmlBlockRenderer));
  assert.ok(Object.isFrozen(controlHtmlBlockRenderer.descriptor));
});

/* ------------------------------------------------------------------ *
 * Free-body
 * ------------------------------------------------------------------ */

test("free-body emitter: the golden incline renders every declaration kind", () => {
  const [block] = goldenBlocks("free-body");
  const markup = renderFreeBodyFragment(block, {
    sourceName: SOURCE_NAME,
    ordinal: 0,
    theme: defaultTheme,
  });
  assertFreeBodyFragmentSafe(markup);
  assert.ok(markup.startsWith('<figure class="aze-free-body" id="aze-fb-0"'));
  assert.ok(markup.includes('data-free-body-id="incline-block"'));
  assert.ok(markup.includes('aria-labelledby="aze-fb-0-title aze-fb-0-desc"'));
  assert.ok(markup.includes('viewBox="0 0 640 400"'));
  for (const needle of [
    "aze-free-body-polygon",
    "aze-free-body-block",
    "aze-free-body-point",
    "aze-free-body-force",
    "aze-free-body-axes",
    "aze-free-body-angle-mark",
    "aze-free-body-dimension",
  ]) {
    assert.ok(markup.includes(needle), `missing ${needle}`);
  }
  // Invisible bodies, points and lines draw nothing at all, so they carry no
  // element; every other declaration carries its authored-order positional id.
  const drawn = block.declarations
    .map((declaration, index) => ({ declaration, index }))
    .filter(({ declaration }) =>
      "visible" in declaration
        ? declaration.kind === "line"
          ? declaration.visible
          : declaration.visible
        : true,
    )
    .map(({ index }) => index);
  const found = [...markup.matchAll(/id="aze-fb-0-n-(\d+)"/g)].map((match) => Number(match[1]));
  assert.deepEqual(found, drawn);
  assert.deepEqual(unquantizedNumbers(markup), []);
  assert.ok(!/<script|on[a-z]+\s*=|javascript:/i.test(markup));
});

test("free-body emitter: a visible dashed line draws as a segment", () => {
  const [block] = goldenBlocks("free-body");
  const visible = {
    ...block,
    declarations: block.declarations.map((declaration) =>
      declaration.kind === "line"
        ? { ...declaration, visible: true, style: "dashed" }
        : declaration,
    ),
  };
  const markup = renderFreeBodyFragment(visible, { ordinal: 0, theme: defaultTheme });
  assert.ok(markup.includes("aze-free-body-line"));
  assert.ok(/stroke-dasharray="6 4"/.test(markup));
});

test("free-body emitter: the explicit scale derives force lengths", () => {
  const [block] = goldenBlocks("free-body");
  const markup = renderFreeBodyFragment(block, { ordinal: 0, theme: defaultTheme });
  const desc = /<desc id="aze-fb-0-desc">([\s\S]*?)<\/desc>/.exec(markup);
  assert.ok(desc !== null);
  assert.ok(desc[1].includes("Explicit scale: 0.15 frame units per force unit."));
  assert.ok(desc[1].includes("perpendicular to slope-face"));
  assert.ok(desc[1].includes("parallel to slope-face"));
  assert.ok(!/\bNaN\b|\bInfinity\b/.test(markup));
});

test("free-body emitter: a schematic Block has no scale claim", () => {
  const block = {
    ...goldenBlocks("free-body")[0],
    scale: undefined,
    declarations: goldenBlocks("free-body")[0].declarations.map((declaration) =>
      declaration.kind === "force"
        ? { ...declaration, magnitude: undefined, length: "1.4" }
        : declaration,
    ),
  };
  const markup = renderFreeBodyFragment(block, { ordinal: 1, theme: defaultTheme });
  const desc = /<desc id="aze-fb-1-desc">([\s\S]*?)<\/desc>/.exec(markup);
  assert.ok(desc !== null);
  assert.ok(/[Ss]chematic/.test(desc[1]));
});

test("free-body emitter: identity is Theme-invariant and the closure is stable", () => {
  const [block] = goldenBlocks("free-body");
  const closure = freeBodyDependencyClosure();
  assert.deepEqual(Object.keys(closure).sort(), ["emitter", "eval", "quantization", "scale"]);
  for (const theme of THEMES) {
    const markup = renderFreeBodyFragment(block, { ordinal: 0, theme });
    assert.ok(markup.includes('data-free-body-id="incline-block"'));
    assert.deepEqual(unquantizedNumbers(markup), []);
  }
  assert.throws(
    () => renderFreeBodyFragment(block, { ordinal: 0 }),
    (error) => {
      assert.ok(error instanceof FreeBodyRenderError);
      assert.equal(error.code, "azeforge.renderer#free-body-render");
      return true;
    },
  );
});

test("free-body emitter: the registered renderer is frozen and versioned", () => {
  assert.equal(freeBodyHtmlBlockRenderer.descriptor.id, FREE_BODY_HTML_BLOCK_RENDERER_ID);
  assert.equal(freeBodyHtmlBlockRenderer.descriptor.version, FREE_BODY_HTML_BLOCK_RENDERER_VERSION);
  assert.equal(freeBodyHtmlBlockRenderer.descriptor.blockType, "free-body");
  assert.equal(freeBodyHtmlBlockRenderer.descriptor.rendererId, "html");
  assert.ok(Object.isFrozen(freeBodyHtmlBlockRenderer.descriptor));
});

test("the fragment guards reject executable content", () => {
  assert.throws(() => assertControlFragmentSafe('<svg onload="x()"></svg>'));
  assert.throws(() => assertFreeBodyFragmentSafe("<script>alert(1)</script>"));
});
