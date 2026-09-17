import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const SCRIPT = fileURLToPath(new URL("../scripts/tex-local-render.mjs", import.meta.url));
const CANONICAL_SCRIPT = fileURLToPath(new URL("../scripts/tex-canonical-render.mjs", import.meta.url));
const IMAGE_DIGEST = `sha256:${"a".repeat(64)}`;

function render(source, output, manifest, image, script = SCRIPT) {
  return spawnSync(process.execPath, [script, "--source", source, "--output", output, "--renderer-manifest", manifest, "--image", image], { cwd: REPO_ROOT, encoding: "utf8" });
}

test("local renderer refuses a tag when a sealed manifest names an image digest", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-tex-local-render-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const source = join(directory, "report.aze.md");
  const output = join(directory, "report.html");
  const manifest = join(directory, "manifest.json");
  await writeFile(source, "---\nazemark: 2\n---\n\n# Report\n");
  await writeFile(manifest, JSON.stringify({ image: { digest: IMAGE_DIGEST } }));

  const result = render(source, output, manifest, "azeforge-tex-renderer:local");

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /digest-pinned image reference/i);
  await assert.rejects(readFile(output));
});

test("local renderer allows a scratch manifest for a non-TeX visual smoke", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-tex-local-render-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const source = join(directory, "report.aze.md");
  const output = join(directory, "report.html");
  const manifest = join(directory, "manifest.json");
  await writeFile(source, "---\nazemark: 2\n---\n\n# Report\n");
  await writeFile(manifest, JSON.stringify({ kind: "local-smoke" }));

  const result = render(source, output, manifest, "azeforge-tex-renderer:local");

  assert.equal(result.status, 0, result.stderr);
  assert.match(await readFile(output, "utf8"), /<h1[^>]*>Report<\/h1>/);
  assert.equal(JSON.parse(result.stdout).canonical, false);
});


test("canonical renderer requires the official digest-pinned image", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-tex-canonical-render-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const source = join(directory, "report.aze.md");
  const output = join(directory, "report.html");
  const manifest = join(directory, "manifest.json");
  await writeFile(source, "---\nazemark: 2\n---\n\n# Report\n");
  await writeFile(manifest, JSON.stringify({ image: { digest: IMAGE_DIGEST } }));

  const result = render(source, output, manifest, `registry.example/renderer@${IMAGE_DIGEST}`, CANONICAL_SCRIPT);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /official.*digest-pinned image/i);
});

test("canonical renderer marks an official digest-pinned non-TeX compilation canonical", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-tex-canonical-render-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const source = join(directory, "report.aze.md");
  const output = join(directory, "report.html");
  const manifest = join(directory, "manifest.json");
  await writeFile(source, "---\nazemark: 2\n---\n\n# Report\n");
  await writeFile(manifest, JSON.stringify({ image: { digest: IMAGE_DIGEST } }));

  const result = render(source, output, manifest, `ghcr.io/aruzone/aze-forge-tex-renderer@${IMAGE_DIGEST}`, CANONICAL_SCRIPT);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).canonical, true);
});