import assert from "node:assert/strict";
import test from "node:test";

import { createCompiler } from "../dist/index.js";

const SOURCE = `---
azemark: 2
title: Derivation and quantities
---

:::: derivation
id: force-law
number: true
----
- expression: F = m * a
  annotation: Newton's second law
- expression: F = 60 kg * 3 m/s^2
  annotation: substituting the trial values
::::

:::: table
id: materials
caption: Material sample
----
columns:
  - key: material
    name: Material
    type: text
  - key: density
    name: Density
    type: quantity
    unit: kg/m^3
rows:
  - material: Aluminum
    density: 2700
  - material: Steel
    density: 7850
::::
`;

test("derivation parses, validates, and renders with numbered steps", async () => {
  const compiler = createCompiler();
  const parsed = compiler.parse(SOURCE, { sourceName: "deriv.aze.md" });
  assert.deepEqual(parsed.diagnostics, []);
  const derivation = parsed.document.blocks.find(
    (block) => block.kind === "derivation",
  );
  assert.equal(derivation?.kind, "derivation");
  if (derivation?.kind !== "derivation") return;
  assert.equal(derivation.number, true);
  assert.equal(derivation.steps.length, 2);
  assert.equal(derivation.steps[0]?.expression, "F = m * a");
  assert.deepEqual(derivation.steps[0]?.annotation?.map((n) => n.value), [
    "Newton's second law",
  ]);

  const validation = compiler.validate(parsed);
  assert.deepEqual(validation.diagnostics, []);
  assert.ok(validation.document);

  const result = await compiler.compile(SOURCE, {
    format: "html",
    sourceName: "deriv.aze.md",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.artifact);
  const html = new TextDecoder().decode(result.artifact.bytes);
  assert.match(html, /class="aze-derivation"/);
  assert.match(html, /katex-display/);
  assert.match(html, /Newton&apos;s second law|Newton\x27s second law|Newton&#x27;s second law/);
  assert.match(html, /data-derivation-number="true"/);
});

test("typed quantity table cells choose the shared exact-decimal style", async () => {
  const compiler = createCompiler();
  const result = await compiler.compile(SOURCE, {
    format: "html",
    sourceName: "deriv.aze.md",
  });
  assert.deepEqual(result.diagnostics, []);
  const html = new TextDecoder().decode(result.artifact.bytes);
  assert.match(html, /2700 kg\/m\^3 <span class="aze-unit">kg\/m\^3<\/span>/);
  assert.match(html, /7850 kg\/m\^3 <span class="aze-unit">kg\/m\^3<\/span>/);
});

test("quantity grammar canonicalizes exact decimals without float round trips", async () => {
  const { canonicalExactDecimal, parseQuantitySpelling } = await import(
    "../dist/quantity.js"
  );
  assert.equal(canonicalExactDecimal("1e3"), "1000");
  assert.equal(canonicalExactDecimal("1.00"), "1");
  assert.equal(canonicalExactDecimal("0.5"), "0.5");
  assert.equal(canonicalExactDecimal("1.2345e-3"), "0.0012345");
  const glued = parseQuantitySpelling("1kohm");
  assert.deepEqual(glued, { coefficient: "1", unit: "kohm" });
});

test("quantity grammar rejects unregistered units and malformed decimals", async () => {
  const { QuantityError, parseQuantitySpelling } = await import(
    "../dist/quantity.js"
  );
  for (const bad of ["5 furlong", "10 volt", "1..2 m", "0.5"]) {
    let threw = false;
    try {
      parseQuantitySpelling(bad);
    } catch (error) {
      threw = error instanceof QuantityError;
    }
    assert.equal(threw, true, `expected rejection of ${bad}`);
  }
});

test("table rejects a quantity column with an unknown unit", () => {
  const compiler = createCompiler();
  const bad = SOURCE.replace("unit: kg/m^3", "unit: furlong");
  const parsed = compiler.parse(bad);
  assert.ok(
    parsed.diagnostics.some(
      ({ code }) => code === "azeforge.table#invalid-quantity-unit",
    ),
  );
});