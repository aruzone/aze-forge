// Advance metric (#76 / contract #60 §3): the generated Inter advance table,
// the measurement rules built on it, and the generator's byte-stability.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  ADVANCE_METRIC_VERSION,
  SCRIPT_SCALE,
  advanceMetricDependencyClosure,
  advanceMetricTable,
  advanceWidth,
  labelAdvance,
  labelLines,
} from "../dist/advance-metric.js";

const ROOT = new URL("../", import.meta.url);
const DATA_PATH = new URL("../src/advance-metric-data.ts", import.meta.url);
const SCRIPT_PATH = new URL("../scripts/generate-advance-metric.mjs", import.meta.url);

const text = (...values) => values.map((value) => ({ kind: "text", value }));
const script = (kind, value) => [{ kind, value }];
const quantity = (coefficient, prefix, unit) => [{ kind: "quantity", coefficient, prefix, unit }];

const advanceOf = (character) => advanceMetricTable.advances[String(character.codePointAt(0))];

test("the table describes the pinned Inter bytes", () => {
  assert.equal(ADVANCE_METRIC_VERSION, "1.0.0");
  assert.equal(advanceMetricTable.family, "Inter");
  assert.equal(advanceMetricTable.weight, 400);
  assert.ok(Number.isInteger(advanceMetricTable.unitsPerEm));
  assert.ok(advanceMetricTable.unitsPerEm > 0);

  const codePoints = Object.keys(advanceMetricTable.advances).map(Number);
  assert.ok(codePoints.length > 1000, "the table covers more than a stub alphabet");
  assert.deepEqual(
    codePoints,
    [...codePoints].sort((left, right) => left - right),
    "code points are emitted in ascending order",
  );
  assert.ok(codePoints.every((codePoint) => Number.isInteger(codePoint) && codePoint >= 0));
  for (const [key, advance] of Object.entries(advanceMetricTable.advances)) {
    assert.equal(String(Number(key)), key, `key ${key} is a decimal code point`);
    assert.ok(
      Number.isInteger(advance) && advance >= 0,
      `advance for U+${Number(key).toString(16)} is a non-negative integer`,
    );
  }

  // U+0078 is the documented fallback, so it must be a covered code point.
  assert.equal(advanceMetricTable.defaultAdvance, advanceOf("x"));
});

test("the recorded sources are the installed woff2 bytes", async () => {
  assert.ok(advanceMetricTable.sources.length > 0);
  const hashes = [];
  for (const source of advanceMetricTable.sources) {
    assert.equal(source.package, "@fontsource/inter");
    assert.match(source.version, /^\d+\.\d+\.\d+/);
    assert.match(source.hash, /^sha256:[0-9a-f]{64}$/);
    hashes.push(source.hash);
  }
  assert.equal(new Set(hashes).size, hashes.length, "each subset is recorded once");

  const manifest = JSON.parse(
    await readFile(new URL("node_modules/@fontsource/inter/package.json", ROOT), "utf8"),
  );
  assert.equal(
    advanceMetricTable.sources[0].version,
    manifest.version,
    "the recorded version is the installed @fontsource/inter",
  );

  const latin = advanceMetricTable.sources.at(-1);
  const bytes = await readFile(
    new URL("node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2", ROOT),
  );
  assert.equal(latin.hash, `sha256:${createHash("sha256").update(bytes).digest("hex")}`);
});

test("Latin advances are sane and ordered", () => {
  const widths = ["W", "M", "A", "x", "i"].map((character) => advanceOf(character));
  assert.ok(widths.every((width) => typeof width === "number"));
  for (let index = 1; index < widths.length; index += 1) {
    assert.ok(
      widths[index - 1] > widths[index],
      `${widths[index - 1]} does not exceed ${widths[index]}`,
    );
  }
  assert.ok(widths.at(-1) > 0);

  // Diacritics combine with the preceding glyph and take no advance.
  assert.equal(advanceOf("\u0301"), 0);

  // Every advance is a fraction of the em, never an unbounded number.
  assert.ok(Math.max(...Object.values(advanceMetricTable.advances)) < 4 * advanceMetricTable.unitsPerEm);
});

test("advanceWidth measures at the em and scales linearly", () => {
  assert.equal(advanceWidth([], 100), 0);
  assert.equal(advanceWidth(text(""), 100), 0);

  const narrow = advanceWidth(text("x"), 100);
  const wide = advanceWidth(text("x"), 200);
  assert.ok(narrow > 0);
  assert.ok(Math.abs(wide / narrow - 2) < 1e-12, "font size scales the advance linearly");
  assert.equal(advanceWidth(text("x"), 0), 0);
  assert.ok(Math.abs(advanceWidth(text("xx"), 100) - 2 * narrow) < 1e-9);

  assert.ok(advanceWidth(text("W"), 100) > advanceWidth(text("i"), 100));
  assert.equal(
    advanceWidth(text("a", "b"), 100),
    advanceWidth(text("ab"), 100),
    "adjacent runs measure like their concatenation",
  );
});

test("subscripts and superscripts measure at SCRIPT_SCALE em", () => {
  assert.equal(SCRIPT_SCALE, 0.7);
  const full = advanceWidth(text("i"), 100);
  for (const kind of ["subscript", "superscript"]) {
    const scripted = advanceWidth(script(kind, "i"), 100);
    assert.ok(scripted < full, `${kind} text is narrower than the same text at full size`);
    assert.ok(Math.abs(scripted / full - SCRIPT_SCALE) < 1e-12);
  }
  assert.equal(advanceWidth(script("subscript", ""), 100), 0);
});

test("a quantity run measures its value as plain text", () => {
  assert.equal(
    advanceWidth(quantity("4", "k", "\u03a9"), 100),
    advanceWidth(text("4k\u03a9"), 100),
  );
});

test("uncovered code points fall back to defaultAdvance", () => {
  const uncovered = "\u2264";
  assert.equal(advanceMetricTable.advances[String("\u2264".codePointAt(0))], undefined);

  const fallback = (advanceMetricTable.defaultAdvance / advanceMetricTable.unitsPerEm) * 100;
  assert.ok(Math.abs(advanceWidth(text(uncovered), 100) - fallback) < 1e-12);
  assert.equal(advanceWidth(text(uncovered), 100), advanceWidth(text("x"), 100));

  // The fallback is per code point, never per run.
  assert.ok(Math.abs(advanceWidth(text(uncovered, uncovered), 100) - 2 * fallback) < 1e-12);

  // An astral code point is one code point, not two surrogate units.
  assert.equal(advanceWidth(text("\u{1f600}"), 100), advanceWidth(text("x"), 100));
});

test("labelAdvance takes the widest line and labelLines the authored count", () => {
  const lines = [text("i"), text("MMMM"), text("A")];
  assert.equal(labelAdvance(lines, 100), advanceWidth(text("MMMM"), 100));
  assert.equal(labelAdvance([], 100), 0);
  assert.equal(labelAdvance([text("W"), text("W")], 100), advanceWidth(text("W"), 100));

  assert.equal(labelLines(undefined), 1);
  assert.equal(labelLines([]), 1);
  assert.equal(labelLines(lines), 3);
  assert.equal(labelLines([text(""), text("")]), 2);
});

test("advanceMetricDependencyClosure fingerprints the metric", () => {
  const closure = advanceMetricDependencyClosure();
  assert.deepEqual(closure, advanceMetricDependencyClosure());
  assert.equal(closure.metric, ADVANCE_METRIC_VERSION);
  assert.equal(closure.unitsPerEm, advanceMetricTable.unitsPerEm);
  assert.equal(closure.family, "Inter");
  assert.equal(closure.weight, 400);
  assert.equal(closure.sources.length, advanceMetricTable.sources.length);
  assert.ok(closure.sources.every((entry) => entry.includes("@fontsource/inter@")));
});

test("the generator reproduces the committed table byte for byte", async () => {
  const committed = await readFile(DATA_PATH, "utf8");
  assert.ok(
    committed.startsWith("// generated by scripts/generate-advance-metric.mjs"),
    "the generated file carries the do-not-edit header",
  );
  assert.ok(committed.endsWith(";\n"), "the generated file ends with a newline");

  const run = spawnSync(process.execPath, [SCRIPT_PATH.pathname], {
    cwd: ROOT.pathname,
    encoding: "utf8",
  });
  const regenerated = await readFile(DATA_PATH, "utf8");
  if (regenerated !== committed) await writeFile(DATA_PATH, committed);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(regenerated, committed, "re-running the generator is a no-op");

  const [first, second] = await Promise.all([
    import("../dist/advance-metric-data.js?fresh=1"),
    import("../dist/advance-metric-data.js?fresh=2"),
  ]);
  assert.notEqual(first.ADVANCE_METRIC_DATA, advanceMetricTable, "a fresh read is a fresh object");
  assert.deepEqual(first.ADVANCE_METRIC_DATA, advanceMetricTable);
  assert.deepEqual(first.ADVANCE_METRIC_DATA, second.ADVANCE_METRIC_DATA);
  assert.deepEqual(first.ADVANCE_METRIC_DATA.advances, advanceMetricTable.advances);
  assert.ok(Object.isFrozen(advanceMetricTable.advances));
  assert.ok(Object.isFrozen(advanceMetricTable.sources));
  assert.ok(Object.isFrozen(advanceMetricTable.sources[0]));
});
