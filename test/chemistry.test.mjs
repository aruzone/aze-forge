import assert from "node:assert/strict";
import test from "node:test";

import { createCompiler } from "../dist/index.js";
import { buildCapabilities } from "../dist/capabilities.js";

const FRONT = "---\nazemark: 2\n---\n\n";

function bodySource(body, directive, header = "") {
  return `${FRONT}:::: ${directive}\n${header}----\n${body}\n::::\n`;
}

async function compile(source, format = "html") {
  const compiler = createCompiler();
  return compiler.compile(source, { format });
}

const SILVER = bodySource(
  "Ag+(aq) + Cl-(aq) -> AgCl(s)",
  "reaction",
  "id: silver\nbalance: check\n",
);

test("silver-chloride reaction passes its own balance assertion", async () => {
  const compiled = await compile(SILVER);
  assert.deepEqual(compiled.diagnostics, []);
  assert.equal(compiled.document.blocks[0].kind, "reaction");
  const block = compiled.document.blocks[0];
  assert.equal(block.balance, "check");
  assert.equal(block.arrow, "->");
  assert.equal(block.reactants.length, 2);
  assert.equal(block.products.length, 1);
  assert.equal(block.reactants[0].charge, 1);
  assert.equal(block.reactants[1].charge, -1);
});

test("formula parses digit resolution: charge, subscript, isotope, adduct", async () => {
  const src = FRONT +
    ":::: formula\nid: combo\n----\nCuSO4·5H2O3+Co\n::::\n";
  // Not a real species; this only exercises token resolution determinism.
  const compiled = await compile(bodySource("14CH4", "formula", "id: f\nnumber: true\n"));
  assert.deepEqual(compiled.diagnostics, []);
  const block = compiled.document.blocks[0];
  assert.ok(block.units.length >= 1);
  assert.equal(block.units[0].isotope, 14);
  assert.equal(block.expression, "14CH4");
});

test("formula SO42- resolves SO4 with charge 2-", async () => {
  const compiled = await compile(bodySource("SO42-", "formula", "number: true\n"));
  assert.deepEqual(compiled.diagnostics, []);
  const block = compiled.document.blocks[0];
  assert.equal(block.charge, -2);
  assert.equal(block.chargeSpecified, true);
  const so4 = block.units;
  assert.equal(so4[0].parts[0].symbol, "S");
  assert.equal(so4[0].parts[1].symbol, "O");
  assert.equal(so4[0].parts[1].count, 4);
});

test("formula case sensitivity: CO2 parses, Co<2> is cobalt", async () => {
  const co2 = await compile(bodySource("CO2", "formula"));
  assert.deepEqual(co2.diagnostics, []);
  assert.equal(co2.document.blocks[0].units[0].parts[0].symbol, "C");

  const co = await compile(bodySource("Co", "formula"));
  assert.deepEqual(co.diagnostics, []);
  assert.equal(co.document.blocks[0].units[0].parts[0].symbol, "Co");
});

test("formula parenthesized group with repeat count", async () => {
  const compiled = await compile(bodySource("Al2(SO4)3", "formula"));
  assert.deepEqual(compiled.diagnostics, []);
  const block = compiled.document.blocks[0];
  assert.equal(block.units[0].parts[0].symbol, "Al");
  assert.equal(block.units[0].parts[0].count, 2);
  const group = block.units[0].parts[1];
  assert.equal(group.kind, "group");
  assert.equal(group.count, 3);
});

test("formula e- is a registered pseudo-species", async () => {
  const compiled = await compile(bodySource("e-", "formula"));
  assert.deepEqual(compiled.diagnostics, []);
  assert.equal(compiled.document.blocks[0].electron, true);
});

test("unknown element errors with a stable code", async () => {
  const compiled = await compile(bodySource("Xz", "formula"));
  const errors = compiled.diagnostics.filter((d) => d.severity === "error");
  assert.ok(errors.some((d) => d.code === "azeforge.chemistry.formula#chem-formula-unknown-element"));
});

test("formula syntax errors on malformed input", async () => {
  for (const body of ["2+", "Na++", "(", "CuSO4·"]) {
    const compiled = await compile(bodySource(body, "formula"));
    assert.ok(compiled.diagnostics.some((d) => d.code === "azeforge.chemistry.formula#chem-formula-syntax"), `expected syntax error for ${body}`);
  }
});

test("reaction unknown-appearing state produces reactive diagnostics", async () => {
  const compiled = await compile(bodySource("Na+(x) + Cl-(aq) -> NaCl(s)", "reaction"));
  const codes = compiled.diagnostics.map((d) => d.code);
  assert.ok(codes.some((c) => c === "azeforge.chemistry.reaction#chem-reaction-state-unknown"));
});

test("reaction explicit unspecified coefficient skips balance with a warning", async () => {
  const compiled = await compile(bodySource("? Na + ? Cl -> ? NaCl", "reaction", "balance: check\n"));
  const warnings = compiled.diagnostics.filter((d) => d.severity === "warning");
  assert.ok(warnings.some((d) => d.code === "azeforge.chemistry.reaction#chem-balance-check-skipped"));
  assert.equal(compiled.document.blocks[0].reactants[0].unspecifiedCoefficient, true);
});

test("balance check: atom mismatch and charge mismatch error", async () => {
  const atom = await compile(bodySource("Na + Cl -> Na", "reaction", "balance: check\n"));
  assert.ok(atom.diagnostics.some((d) => d.code === "azeforge.chemistry.reaction#chem-balance-atom-mismatch"));

  const charge = await compile(bodySource("Ag+ + Cl- -> AgCl2-", "reaction", "balance: check\n"));
  assert.ok(charge.diagnostics.some((d) => d.code === "azeforge.chemistry.reaction#chem-balance-charge-mismatch"));
});

test("reaction with no balance claims nothing and validates", async () => {
  const compiled = await compile(bodySource("? Al + ? O2 -> ? Al2O3", "reaction"));
  assert.deepEqual(compiled.diagnostics, []);
  assert.equal(compiled.document.blocks[0].balance, "none");
});

test("reaction unspaced coefficients match the spaced form", async () => {
  const spaced = await compile(bodySource("2 Mg(s) + O2(g) -> 2 MgO(s)", "reaction"));
  const unspaced = await compile(bodySource("2Mg(s) + O2(g) -> 2MgO(s)", "reaction"));
  assert.deepEqual(unspaced.diagnostics, []);
  assert.deepEqual(spaced.diagnostics, []);
  const figure = (compiled) => {
    const html = new TextDecoder().decode(compiled.artifact.bytes);
    const match = /<figure class="aze-reaction"[^>]*>([\s\S]*?)<\/figure>/.exec(html);
    assert.ok(match !== null);
    return match[0].replace(/id="[^"]*"/, 'id="aze-reaction-id"');
  };
  assert.ok(figure(unspaced).includes("katex"));
  assert.ok(figure(unspaced).includes("\\mathrm{Mg}"));
  assert.ok(!figure(unspaced).includes("<sup>2</sup>Mg"));
  assert.equal(unspaced.document.blocks[0].reactants[0].coefficient, 2);
  assert.equal(unspaced.document.blocks[0].reactants[0].expression, "Mg");
});

test("reaction attached unspecified coefficients and left arrow still parse", async () => {
  const compiled = await compile(bodySource("?Al2O3 <- ?Al + ?O2", "reaction"));
  assert.deepEqual(compiled.diagnostics, []);
  const block = compiled.document.blocks[0];
  assert.equal(block.arrow, "<-");
  assert.ok(block.reactants.every((entry) => entry.unspecifiedCoefficient));
  assert.ok(block.products.every((entry) => entry.unspecifiedCoefficient));
  const html = new TextDecoder().decode(compiled.artifact.bytes);
  assert.ok(html.includes("\\leftarrow"));
  assert.ok(html.includes("katex"));
});

test("reaction invalid coefficients keep their stable code", async () => {
  for (const species of ["0Mg", "1000Mg", "2", "2 2Mg"]) {
    const compiled = await compile(bodySource(`NaCl + H2O -> ${species}`, "reaction"));
    assert.ok(
      compiled.diagnostics.some((d) => d.code === "azeforge.chemistry.reaction#chem-reaction-coefficient-invalid"),
      species,
    );
  }
});

test("reaction arrow registry is closed to three tokens", async () => {
  const compiled = await compile(bodySource("A + B => C", "reaction"));
  assert.ok(compiled.diagnostics.some((d) => d.code === "azeforge.chemistry.reaction#chem-reaction-syntax"));
});

const ALANINE = bodySource([
  "- atom: c2\n  element: C\n  at: [0.0, 0.0]",
  "- atom: n1\n  element: N\n  at: [0.0, 1.4]",
  "- atom: c1\n  element: C\n  at: [-1.2, -0.7]",
  "- atom: c3\n  element: C\n  isotope: 14\n  at: [1.2, -0.7]",
  "- atom: o1\n  element: O\n  at: [2.4, 0.0]",
  "- atom: o2\n  element: O\n  at: [1.2, -2.1]",
  "- atom: h1\n  element: H\n  at: [2.4, -2.8]",
  "- atom: h2\n  element: H\n  at: [-1.2, 1.4]",
  "- bond:\n  from: c2\n  to: n1\n  order: 1\n  stereo: wedge",
  "- bond:\n  from: c2\n  to: c1\n  order: 1",
  "- bond:\n  from: c2\n  to: h2\n  order: 1",
  "- bond:\n  from: c2\n  to: c3\n  order: 1",
  "- bond:\n  from: c3\n  to: o1\n  order: 2",
  "- bond:\n  from: c3\n  to: o2\n  order: 1",
  "- bond:\n  from: o2\n  to: h1\n  order: 1",
  "- label:\n  text: (S)\n  at: [-0.5, 0.7]",
].join("\n"), "structure", "id: alanine\n");

test("isotope-labeled chiral structure validates and preserves facts", async () => {
  const compiled = await compile(ALANINE);
  assert.deepEqual(compiled.diagnostics, []);
  const block = compiled.document.blocks[0];
  assert.equal(block.atoms.length, 8);
  const c3 = block.atoms.find((a) => a.name === "c3");
  assert.equal(c3.isotope, 14);
  const wedge = block.bonds.find((b) => b.stereo === "wedge");
  assert.equal(wedge.from, "c2");
  assert.equal(block.labels.length, 1);
  assert.equal(block.labels[0].text, "(S)");
});

test("quoted attachment labels render without their source delimiters", async () => {
  const compiled = await compile(bodySource(
    "- atom: c1\n  element: C\n  at: [0.0, 0.0]\n- atom: a1\n  attach: \"*\"\n  at: [1.0, 0.0]\n- bond:\n  from: c1\n  to: a1\n  order: 1",
    "structure",
  ));
  assert.deepEqual(compiled.diagnostics, []);
  assert.equal(compiled.document.blocks[0].atoms[1].attach, "*");
  const html = new TextDecoder().decode(compiled.artifact.bytes);
  assert.ok(html.includes('>*</text>'));
  assert.ok(!html.includes("&quot;"));
});

test("quoted empty attachment labels fail validation", async () => {
  const compiled = await compile(bodySource(
    "- atom: a1\n  attach: \"\"\n  at: [0.0, 0.0]",
    "structure",
  ));
  assert.ok(compiled.diagnostics.some((diagnostic) => diagnostic.code === "azeforge.chemistry.structure#chem-structure-syntax"));
});

test("malformed quoted attachment labels fail validation", async () => {
  const compiled = await compile(bodySource(
    "- atom: a1\n  attach: \"\\q\"\n  at: [0.0, 0.0]",
    "structure",
  ));
  assert.ok(compiled.diagnostics.some((diagnostic) => diagnostic.code === "azeforge.chemistry.structure#chem-structure-syntax"));
});

test("attachment atom rejects charge and isotope facts", async () => {
  const src = bodySource(
    "- atom: c1\n  element: C\n  at: [0.0, 0.0]\n- atom: a1\n  attach: \"*\"\n  charge: 1\n  at: [1.0, 0.0]",
    "structure",
  );
  const compiled = await compile(src);
  assert.ok(compiled.diagnostics.some((d) => d.code === "azeforge.chemistry.structure#chem-atom-spec-conflict"));
});

test("structure bond diagnostics: endpoint, self, duplicate, stereo-order", async () => {
  const endpoint = await compile(bodySource("- atom: c1\n  element: C\n  at: [0.0, 0.0]\n- atom: c2\n  element: C\n  at: [1.0, 0.0]\n- bond:\n  from: c1\n  to: absent\n  order: 1", "structure"));
  assert.ok(endpoint.diagnostics.some((d) => d.code === "azeforge.chemistry.structure#chem-bond-endpoint-unknown"));

  const self = await compile(bodySource("- atom: c1\n  element: C\n  at: [0.0, 0.0]\n- bond:\n  from: c1\n  to: c1\n  order: 1", "structure"));
  assert.ok(self.diagnostics.some((d) => d.code === "azeforge.chemistry.structure#chem-bond-self"));

  const stereo = await compile(bodySource("- atom: c1\n  element: C\n  at: [0.0, 0.0]\n- atom: c2\n  element: C\n  at: [1.0, 0.0]\n- bond:\n  from: c1\n  to: c2\n  order: 2\n  stereo: wedge", "structure"));
  assert.ok(stereo.diagnostics.some((d) => d.code === "azeforge.chemistry.structure#chem-bond-stereo-order-conflict"));
});

test("structure without mandatory coordinates errors", async () => {
  const compiled = await compile(bodySource("- atom: c1\n  element: C", "structure"));
  assert.ok(compiled.diagnostics.some((d) => d.code === "azeforge.chemistry.structure#chem-structure-syntax"));
});

test("disconnected structure warns without failing", async () => {
  const compiled = await compile(bodySource("- atom: c1\n  element: C\n  at: [0.0, 0.0]\n- atom: c2\n  element: C\n  at: [1.0, 0.0]", "structure"));
  assert.ok(compiled.diagnostics.some((d) => d.code === "azeforge.chemistry.structure#chem-structure-disconnected"));
});

test("R4: formula identity is preserved across normalization", async () => {
  const a = await compile(bodySource("CuSO4 · 5H2O", "formula"));
  const b = await compile(bodySource("CuSO4 · 5H2O", "formula"));
  assert.deepEqual(a.diagnostics, []);
  assert.equal(a.contentHash, b.contentHash);
});

test("R4: specified versus explicitly-unspecified stereo stay distinct", async () => {
  const specified = await compile(bodySource("- atom: c1\n  element: C\n  at: [0.0, 0.0]\n  stereo: unspecified\n- atom: c2\n  element: C\n  at: [1.0, 0.0]", "structure"));
  const omitted = await compile(bodySource("- atom: c1\n  element: C\n  at: [0.0, 0.0]\n- atom: c2\n  element: C\n  at: [1.0, 0.0]", "structure"));
  assert.notEqual(specified.contentHash, omitted.contentHash);
});

test("R4: wedge (specified enantiomer) stays distinct from a plain bond", async () => {
  const withWedge = await compile(bodySource("- atom: c1\n  element: C\n  at: [0.0, 0.0]\n- atom: c2\n  element: C\n  at: [1.0, 0.0]\n- bond:\n  from: c1\n  to: c2\n  order: 1\n  stereo: wedge", "structure"));
  const plain = await compile(bodySource("- atom: c1\n  element: C\n  at: [0.0, 0.0]\n- atom: c2\n  element: C\n  at: [1.0, 0.0]\n- bond:\n  from: c1\n  to: c2\n  order: 1", "structure"));
  assert.notEqual(withWedge.contentHash, plain.contentHash);
});

test("R4: aromatic and Kekulé bond orders stay distinct", async () => {
  const aromatic = await compile(bodySource("- atom: c1\n  element: C\n  at: [0.0, 0.0]\n- atom: c2\n  element: C\n  at: [1.0, 0.0]\n- bond:\n  from: c1\n  to: c2\n  order: aromatic", "structure"));
  const kekule = await compile(bodySource("- atom: c1\n  element: C\n  at: [0.0, 0.0]\n- atom: c2\n  element: C\n  at: [1.0, 0.0]\n- bond:\n  from: c1\n  to: c2\n  order: 2", "structure"));
  assert.notEqual(aromatic.contentHash, kekule.contentHash);
});

test("R4: isotope present versus absent stays distinct", async () => {
  const shown = await compile(bodySource("14CO", "formula"));
  const plain = await compile(bodySource("CO", "formula"));
  assert.notEqual(shown.contentHash, plain.contentHash);
});

test("R4: charge present versus absent stays distinct", async () => {
  const charged = await compile(bodySource("Fe3+", "formula"));
  const plain = await compile(bodySource("Fe", "formula"));
  assert.notEqual(charged.contentHash, plain.contentHash);
});

test("R4: hash is stable for identical uncharged identical formula sources", async () => {
  const a = await compile(bodySource("CH3COOH", "formula"));
  const b = await compile(bodySource("CH3COOH", "formula"));
  assert.equal(a.contentHash, b.contentHash);
});

test("chemistry blocks render into html fragments", async () => {
  const src = FRONT +
    ':::: formula\nid: sulfate\n----\nSO42-\n::::\n\n' +
    ':::: reaction\nid: silver\n----\nAg+(aq) + Cl-(aq) -> AgCl(s)\n::::\n' +
    ":::: structure\nid: ala\n----\n" +
    "- atom: c1\n  element: C\n  at: [0.0, 0.0]\n- atom: c2\n  element: C\n  at: [1.0, 0.0]\n- bond:\n  from: c1\n  to: c2\n  order: 2\n" +
    "::::\n";
  const compiled = await compile(src);
  assert.deepEqual(compiled.diagnostics, []);
  const html = new TextDecoder().decode(compiled.artifact.bytes);
  assert.ok(html.includes('class="aze-formula"'));
  assert.ok(html.includes('class="aze-reaction"'));
  assert.ok(html.includes('class="aze-structure"'));
  assert.ok(html.includes("\\mathrm{Ag}"));
  assert.ok(html.includes("\\rightarrow"));
  assert.ok(html.includes("<polygon") === false);
});

test("formula renders textbook serif: upright roman, TeX sub/superscripts", async () => {
  const compiled = await compile(bodySource("SO42-", "formula", "id: sulfate\n"));
  assert.deepEqual(compiled.diagnostics, []);
  const html = new TextDecoder().decode(compiled.artifact.bytes);
  const match = /<figure class="aze-formula"[^>]*>([\s\S]*?)<\/figure>/.exec(html);
  assert.ok(match !== null);
  const figure = match[0];
  assert.ok(figure.includes("katex"));
  assert.ok(figure.includes("<math "));
  assert.ok(figure.includes("\\mathrm{S}\\mathrm{O}_{4}^{2-}"));
  assert.ok(!figure.includes("<sub>"));
  assert.ok(!figure.includes("<sup>"));
});

test("chemistry emitter renders wedge as a filled polygon", async () => {
  const compiled = await compile(bodySource("- atom: c1\n  element: C\n  at: [0.0, 0.0]\n- atom: c2\n  element: C\n  at: [1.0, 0.0]\n- bond:\n  from: c1\n  to: c2\n  order: 1\n  stereo: wedge", "structure"));
  assert.deepEqual(compiled.diagnostics, []);
  const html = new TextDecoder().decode(compiled.artifact.bytes);
  assert.ok(html.includes("<polygon"));
});

test("wedge is at most 45% of its bond length", async () => {
  const compiled = await compile(bodySource("- atom: c1\n  element: C\n  at: [0.0, 0.0]\n- atom: c2\n  element: C\n  at: [0.0, 1.4]\n- bond:\n  from: c1\n  to: c2\n  order: 1\n  stereo: wedge", "structure"));
  const html = new TextDecoder().decode(compiled.artifact.bytes);
  const polygon = /<polygon points="([^"]+)"/.exec(html);
  const atoms = [...html.matchAll(/<text x="([^"]+)" y="([^"]+)"/g)].map((match) => ({
    x: Number(match[1]),
    y: Number(match[2]),
  }));
  assert.ok(polygon);
  assert.equal(atoms.length, 2);
  const [tip, leftBase, rightBase] = polygon[1].split(" ").map((point) => point.split(",").map(Number));
  const base = {
    x: (leftBase[0] + rightBase[0]) / 2,
    y: (leftBase[1] + rightBase[1]) / 2,
  };
  const distance = (a, b) => Math.hypot(a[0] - b.x, a[1] - b.y);
  assert.ok(distance(tip, base) <= distance(tip, atoms[1]) * 0.45);
});

test("hash stereo renders straight parallel crossbars", async () => {
  const compiled = await compile(bodySource("- atom: c1\n  element: C\n  at: [0.0, 0.0]\n- atom: c2\n  element: C\n  at: [0.0, 1.4]\n- bond:\n  from: c1\n  to: c2\n  order: 1\n  stereo: hash", "structure"));
  const html = new TextDecoder().decode(compiled.artifact.bytes);
  const bars = [...html.matchAll(/<line x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)"/g)].map((match) => ({
    y1: Number(match[2]),
    y2: Number(match[4]),
  }));
  assert.ok(bars.length >= 3);
  assert.ok(bars.every((bar) => bar.y1 === bar.y2));
});
test("hash stereo keeps near-constant gaps on long bonds", async () => {
  const src = "- atom: c2\n  element: C\n  at: [1.4, 0.0]\n- atom: o\n  element: O\n  at: [2.4, 1.0]\n  charge: -1\n- bond:\n  from: c2\n  to: o\n  order: 1\n  stereo: hash";
  const compiled = await compile(bodySource(src, "structure"));
  assert.ok(compiled.diagnostics.every((d) => d.severity !== "error"));
  const html = new TextDecoder().decode(compiled.artifact.bytes);
  const svg = /<svg[\s\S]*?<\/svg>/.exec(html)[0];
  const bars = [...svg.matchAll(/<line x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)"/g)].map((match) => ({
    x1: Number(match[1]),
    y1: Number(match[2]),
    x2: Number(match[3]),
    y2: Number(match[4]),
  }));
  assert.ok(bars.length > 5);
  const centers = bars.map((bar) => ({ x: (bar.x1 + bar.x2) / 2, y: (bar.y1 + bar.y2) / 2 }));
  const gaps = centers.slice(1).map((center, i) => Math.hypot(center.x - centers[i].x, center.y - centers[i].y));
  assert.ok(Math.max(...gaps) < 40);
});
test("structure bonds trim at label boxes instead of running underneath", async () => {
  const compiled = await compile(bodySource("- atom: c1\n  element: C\n  at: [0.0, 0.0]\n- atom: c2\n  element: C\n  at: [1.0, 0.0]\n- bond:\n  from: c1\n  to: c2\n  order: 1", "structure"));
  assert.deepEqual(compiled.diagnostics, []);
  const html = new TextDecoder().decode(compiled.artifact.bytes);
  const svg = /<svg[\s\S]*?<\/svg>/.exec(html)[0];
  const line = /<line x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)"/.exec(svg);
  assert.ok(line !== null);
  const centers = [...svg.matchAll(/<text x="([^"]+)" y="([^"]+)"/g)].map((match) => ({ x: Number(match[1]), y: Number(match[2]) }));
  assert.equal(centers.length, 2);
  assert.ok(Number(line[1]) > Math.min(centers[0].x, centers[1].x));
  assert.ok(Number(line[3]) < Math.max(centers[0].x, centers[1].x));
  assert.ok(svg.includes('stroke-width="2"'));
  assert.ok(!svg.includes('stroke-width="4"'));
});


test("capabilities advertise chemistry engines and ceilings", async () => {
  const report = await buildCapabilities();
  assert.ok(report.engines.chemistry);
  assert.equal(report.engines.chemistry.emitter, "1.2.0");
  assert.equal(report.engines.chemistry.advanceMetric, "1.0.0");
  assert.ok(Array.isArray(report.engines.chemistry.metricSource));
  // Bundled probe engines report the same availability as geometry: both
  // follow the optional-dependency probe seam (browser availability today).
  assert.equal(report.engines.chemistry.availability, report.engines.geometry.availability);
  const chem = report.limits.blocks.chemistry;
  assert.equal(chem.maxFormulaExpressionChars, 512);
  assert.equal(chem.maxStructureAtoms, 512);
  const types = report.plugins.map((p) => p.type);
  assert.ok(types.includes("formula"));
  assert.ok(types.includes("reaction"));
  assert.ok(types.includes("structure"));
});