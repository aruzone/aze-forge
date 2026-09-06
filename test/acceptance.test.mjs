import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  AUTOMATED_P0_IDS,
  checkAcceptanceCoverage,
  createAcceptanceCatalog,
} from "../dist/acceptance.js";

const CLI_PATH = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const ROOT = fileURLToPath(new URL("../", import.meta.url));
const GOLDEN_PATH = new URL("../acceptance/golden-report.aze.md", import.meta.url);
const PAGINATION_URL = new URL("../acceptance/pagination/", import.meta.url);

// Every required automated P0 entry and the test file that evidences it.
// acceptance.test.mjs proves the catalog, Golden, determinism, pagination,
// author-loop, and visual-bound entries directly; the remaining entries name
// the existing suite file that owns their observable contract.
const SUITE_EVIDENCE = [
  ["P0-DOC-001", "test/compiler.test.mjs"],
  ["P0-DOC-002", "test/compiler.test.mjs"],
  ["P0-DOC-003", "test/cli.test.mjs"],
  ["P0-DOC-004", "test/acceptance.test.mjs"],
  ["P0-DIAG-001", "test/cli.test.mjs"],
  ["P0-DIAG-002", "test/cli.test.mjs"],
  ["P0-DIAG-003", "test/fail-closed.test.mjs"],
  ["P0-PLUGIN-001", "test/equation.test.mjs"],
  ["P0-PLUGIN-002", "test/fail-closed.test.mjs"],
  ["P0-CLI-001", "test/acceptance.test.mjs"],
  ["P0-CLI-002", "test/cli.test.mjs"],
  ["P0-CLI-003", "test/format.test.mjs"],
  ["P0-CLI-004", "test/watch-serve.test.mjs"],
  ["P0-CLI-005", "test/watch-serve.test.mjs"],
  ["P0-CLI-006", "test/cli.test.mjs"],
  ["P0-CLI-007", "test/acceptance.test.mjs"],
  ["P0-EQN-001", "test/equation.test.mjs"],
  ["P0-EQN-002", "test/equation.test.mjs"],
  ["P0-MMD-001", "test/mermaid.test.mjs"],
  ["P0-OUT-001", "test/acceptance.test.mjs"],
  ["P0-OUT-002", "test/acceptance.test.mjs"],
  ["P0-OUT-003", "test/acceptance.test.mjs"],
  ["P0-OUT-004", "test/acceptance.test.mjs"],
  ["P0-OUT-005", "test/pdf.test.mjs"],
  ["P0-SEC-001", "test/fail-closed.test.mjs"],
  ["P0-SEC-002", "test/mermaid.test.mjs"],
  ["P0-SEC-003", "test/equation.test.mjs"],
  ["P0-SEC-004", "test/fail-closed.test.mjs"],
  ["P0-COMPAT-001", "test/capabilities.test.mjs"],
  ["P0-AUTHOR-001", "test/acceptance.test.mjs"],
];

function runCli(arguments_, cwd, options = {}) {
  return spawnSync(process.execPath, [CLI_PATH, ...arguments_], {
    cwd,
    encoding: null,
    ...options,
  });
}

function parseReport(result, what) {
  assert.equal(result.status, 0, `${what}: ${result.stderr.toString("utf8").slice(0, 400)}`);
  return JSON.parse(result.stdout.toString("utf8"));
}

function goldenFailures(html) {
  const failures = [];
  if (!/<h1/.test(html)) failures.push("h1");
  if ((html.match(/<h2/g) ?? []).length < 3) failures.push("h2x3");
  if ((html.match(/class="katex"/g) ?? []).length !== 3) failures.push("katex-x3");
  if ((html.match(/<math/g) ?? []).length !== 3) failures.push("mathml-x3");
  for (const id of ["gaussian-integral", "arithmetic-series", "heat-equation"]) {
    if (!html.includes(`data-equation-id="${id}"`)) failures.push(id);
  }
  if (!/<table id="materials">[\s\S]*?<caption>Representative material properties/.test(html)) {
    failures.push("caption");
  }
  if (!/<figure class="aze-mermaid"/.test(html)) failures.push("mermaid");
  if (!html.includes('href="https://example.com/engineering-notation"')) failures.push("link");
  return failures;
}

function pdfPageCount(bytes) {
  const match = /\/Type\s*\/Pages[\s\S]{0,300}?\/Count\s+(\d+)/.exec(Buffer.from(bytes).toString("latin1"));
  assert.ok(match !== null && match[1] !== undefined);
  return Number(match[1]);
}

function pngWidth(bytes) {
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  return (bytes[16] << 24) + (bytes[17] << 16) + (bytes[18] << 8) + bytes[19];
}

test("acceptance catalog is canonical and coverage rejects missing or unknown IDs", async () => {

  const canonical = createAcceptanceCatalog();
  const onDisk = JSON.parse(await readFile(new URL("../acceptance/catalog.json", import.meta.url), "utf8"));
  assert.deepEqual(onDisk, JSON.parse(JSON.stringify(canonical)));
  assert.equal(canonical.catalog.id, "azeforge.acceptance/v1");
  assert.equal(canonical.entries.filter((item) => item.gate === "p0").length, 30);

  const declared = SUITE_EVIDENCE.map(([id]) => id);
  assert.deepEqual(checkAcceptanceCoverage(declared), { missing: [], unknown: [] });
  assert.deepEqual(checkAcceptanceCoverage([...AUTOMATED_P0_IDS, "P0-NOPE-000"]).unknown, ["P0-NOPE-000"]);
  for (const [, file] of SUITE_EVIDENCE) {
    await stat(new URL(`../${file}`, import.meta.url));
  }
});

test("golden report validates and carries every object through HTML under all themes", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-acceptance-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const golden = await readFile(GOLDEN_PATH, "utf8");
  await writeFile(join(directory, "golden.aze.md"), golden);

  const valid = runCli(["validate", "golden.aze.md", "--diagnostics", "json"], directory);
  assert.equal(valid.status, 0, valid.stderr.toString("utf8"));

  for (const theme of ["default", "academic", "dark-presentation"]) {
    const result = runCli(
      ["render", "golden.aze.md", "--output", `${theme}.html`, "--format", "html", "--theme", theme, "--diagnostics", "json"],
      directory,
    );
    const report = parseReport(result, `golden html/${theme}`);
    const html = await readFile(join(directory, `${theme}.html`), "utf8");
    assert.deepEqual(goldenFailures(html), [], theme);
    assert.equal(
      report.artifact.artifactHash,
      `sha256:${createHash("sha256").update(html).digest("hex")}`,
      "the manifest hash must match the committed bytes",
    );
  }
});

test("two fresh builds share every identity and trivia or moves preserve it", async (context) => {
  const golden = await readFile(GOLDEN_PATH, "utf8");
  const first = await mkdtemp(join(tmpdir(), "azeforge-accept-a-"));
  const second = await mkdtemp(join(tmpdir(), "azeforge-accept-b-"));
  context.after(() => rm(first, { recursive: true, force: true }));
  context.after(() => rm(second, { recursive: true, force: true }));
  await writeFile(join(first, "report.aze.md"), golden);
  await writeFile(join(second, "report.aze.md"), golden);

  const renderA = parseReport(runCli(["render", "report.aze.md", "--output", "a.html", "--diagnostics", "json"], first), "first build");
  const renderB = parseReport(runCli(["render", "report.aze.md", "--output", "b.html", "--diagnostics", "json"], second), "second build");
  assert.equal(renderB.contentHash, renderA.contentHash);
  assert.equal(renderB.artifact.assetManifestHash, renderA.artifact.assetManifestHash);
  assert.equal(renderB.artifact.rendererFingerprint, renderA.artifact.rendererFingerprint);
  assert.equal(renderB.artifact.artifactHash, renderA.artifact.artifactHash);
  assert.deepEqual(await readFile(join(second, "b.html")), await readFile(join(first, "a.html")));

  await writeFile(join(first, "trivia.aze.md"), `${golden.replace("Measurement notes:", "Measurement notes:   \n")}\n\n`);
  const trivia = parseReport(runCli(["render", "trivia.aze.md", "--output", "t.html", "--diagnostics", "json"], first), "trivia build");
  assert.equal(trivia.contentHash, renderA.contentHash);
  assert.equal(trivia.artifact.artifactHash, renderA.artifact.artifactHash);

  const semantic = golden.replace("| Aluminum | 2700 | 205 |", "| Aluminum | 2710 | 205 |");
  await writeFile(join(first, "semantic.aze.md"), semantic);
  const changed = parseReport(runCli(["render", "semantic.aze.md", "--output", "s.html", "--diagnostics", "json"], first), "semantic build");
  assert.notEqual(changed.contentHash, renderA.contentHash);
  assert.notEqual(changed.artifact.artifactHash, renderA.artifact.artifactHash);
});

test("pagination fixtures split, keep, and fail closed on oversize atoms", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-accept-pag-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  async function renderPdf(fixture, output) {
    await writeFile(join(directory, fixture), await readFile(new URL(fixture, PAGINATION_URL)));
    const result = runCli(["render", fixture, "--output", output], directory);
    assert.equal(result.status, 0, `${fixture}: ${result.stderr.toString("utf8").slice(0, 300)}`);
    return readFile(join(directory, output));
  }
  assert.ok(pdfPageCount(await renderPdf("table-split.aze.md", "table.pdf")) >= 2);
  assert.equal(pdfPageCount(await renderPdf("atomic-scale.aze.md", "atomic.pdf")), 1);

  await writeFile(join(directory, "oversize-error.aze.md"), await readFile(new URL("oversize-error.aze.md", PAGINATION_URL)));
  await writeFile(join(directory, "tall.svg"), await readFile(new URL("tall.svg", PAGINATION_URL)));
  const over = runCli(["render", "oversize-error.aze.md", "--output", "over.pdf"], directory);
  assert.equal(over.status, 1);
  assert.match(over.stderr.toString("utf8"), /artifact-limit/);
  await assert.rejects(readFile(join(directory, "over.pdf")));
});

test("modify, diagnose, and repair loop changes, fails line-specifically, and restores", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-accept-loop-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const golden = await readFile(GOLDEN_PATH, "utf8");
  await writeFile(join(directory, "report.aze.md"), golden);
  const validate = () => runCli(["validate", "report.aze.md", "--diagnostics", "json"], directory);

  assert.equal(validate().status, 0);
  const before = parseReport(runCli(["render", "report.aze.md", "--output", "before.html", "--diagnostics", "json"], directory), "unchanged");

  const edited = golden
    .replace("sum i=1..n of i = n (n + 1) / 2", "sum i=1..n of i^2 = n (n + 1) (2 n + 1) / 6")
    .replace("| Aluminum | 2700 | 205 |", "| Aluminum | 2710 | 205 |");
  await writeFile(join(directory, "report.aze.md"), edited);
  const after = parseReport(runCli(["render", "report.aze.md", "--output", "edited.html", "--diagnostics", "json"], directory), "edited");
  assert.notEqual(after.contentHash, before.contentHash);
  assert.notEqual(after.artifact.artifactHash, before.artifact.artifactHash);
  assert.deepEqual(goldenFailures(await readFile(join(directory, "edited.html"), "utf8")), []);

  const broken = edited.replace(
    "integral x=-infinity..infinity of exp(-x^2) dx = sqrt(pi)",
    "integral x=-infinity..infinity of exp(-x^2) = sqrt(pi)",
  );
  await writeFile(join(directory, "report.aze.md"), broken);
  const failed = validate();
  assert.equal(failed.status, 1);
  const report = JSON.parse(failed.stdout.toString("utf8"));
  assert.equal(report.diagnostics[0]?.code, "azeforge.equation#missing-integration-variable");
  assert.ok(Number.isInteger(report.diagnostics[0]?.location?.range?.start?.line));
  const stale = await readFile(join(directory, "edited.html"));
  const brokenRender = runCli(["render", "report.aze.md", "--output", "edited.html", "--diagnostics", "json"], directory);
  assert.equal(brokenRender.status, 1);
  assert.deepEqual(await readFile(join(directory, "edited.html")), stale);

  await writeFile(join(directory, "report.aze.md"), edited);
  assert.equal(validate().status, 0);
  assert.equal(runCli(["render", "report.aze.md", "--output", "restored.html"], directory).status, 0);
});

test("png evidence uses the exact profile, theme dimensions, and approved bounds", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-accept-vis-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const golden = await readFile(GOLDEN_PATH, "utf8");
  await writeFile(join(directory, "golden.aze.md"), golden);
  async function renderPng(name) {
    const result = runCli(["render", "golden.aze.md", "--output", name, "--format", "png", "--diagnostics", "json"], directory);
    const report = parseReport(result, name);
    return { report, bytes: await readFile(join(directory, name)) };
  }
  const { report, bytes } = await renderPng("first.png");
  assert.equal(report.artifact.profile, "azeforge.png.continuous/v1");
  assert.equal(pngWidth(bytes), report.artifact.cssDimensions.canvasWidthPx * 2);
  const second = await renderPng("second.png");
  assert.deepEqual(second.bytes, bytes);

  const normalized = (await import("../dist/index.js")).normalizePng(bytes);
  assert.deepEqual(Buffer.from(normalized), bytes);
});

test("baseline refresh is developer-only and refused under CI", () => {
  const script = fileURLToPath(new URL("../scripts/acceptance.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [script, "--refresh"], {
    cwd: ROOT,
    encoding: null,
    env: { ...process.env, CI: "true" },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr.toString("utf8"), /developer-only/);
});
