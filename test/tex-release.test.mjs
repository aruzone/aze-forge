import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const SCRIPT = fileURLToPath(new URL("../scripts/tex-release.mjs", import.meta.url));
const sha256 = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;

async function releaseInputs(directory) {
  const input = join(directory, "input");
  await mkdir(join(input, "fonts"), { recursive: true });
  await mkdir(join(input, "preambles"), { recursive: true });
  await writeFile(join(input, "texlive.tlpdb"), "name circuitikz\nrevision 123\n");
  await writeFile(join(input, "packages.txt"), await readFile(join(REPO_ROOT, "tex-renderer", "package-closure.lock"), "utf8"));
  await writeFile(join(input, "fonts", "lmroman10-regular.otf"), "font");
  for (const profile of ["chemfig", "circuitikz", "pgfplots", "tikz", "tikz-cd"]) await writeFile(join(input, "preambles", `${profile}.tex`), `\\usepackage{${profile}}\n`);
  await writeFile(join(input, "corpus.json"), JSON.stringify({ fixtures: ["chemfig", "circuitikz", "pgfplots", "tikz", "tikz-cd"].map((profile) => ({ profile, inputHash: sha256(`input:${profile}`), outputHash: sha256(`output:${profile}`) })) }));
  await writeFile(join(input, "sbom.spdx.json"), JSON.stringify({ SPDXID: "SPDXRef-DOCUMENT", spdxVersion: "SPDX-2.3" }));
  await writeFile(join(input, "NOTICES"), "GPL-3.0-or-later components: circuitikz, dvisvgm, pgfplots.\n");
  await writeFile(join(input, "provenance.json"), JSON.stringify({ builder: "test", sourceRevision: "abc123" }));
  await writeFile(join(input, "tools.json"), JSON.stringify({ latex: { version: "pdfTeX 3.141592653-2.6-1.40.27", argv: ["latex", "-interaction=nonstopmode", "-halt-on-error", "-no-shell-escape", "-output-format=dvi", "figure.tex"] }, dvisvgm: { version: "3.4", argv: ["dvisvgm", "--page=1", "--no-fonts=1", "--precision=6", "--output=output.svg", "figure.dvi"] } }));
  return input;
}

function release(directory, ...args) {
  return spawnSync(process.execPath, [SCRIPT, "create", "--input", join(directory, "input"), "--output", join(directory, "release"), ...args], { cwd: REPO_ROOT, encoding: "utf8" });
}

test("TeX release creator seals a complete manifest and immutable release assets", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-tex-release-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await releaseInputs(directory);

  const result = release(directory, "--image-digest", "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  assert.equal(result.status, 0, result.stderr);
  const published = JSON.parse(result.stdout);
  assert.match(published.rendererIdentity, /^sha256:[a-f0-9]{64}$/);
  const manifestBytes = await readFile(join(directory, "release", "tex-renderer-v1.manifest.json"));
  const manifest = JSON.parse(manifestBytes);
  assert.equal(sha256(manifestBytes), published.rendererIdentity);
  assert.equal(manifest.protocol.version, "azeforge.tex-renderer/v1");
  assert.equal(manifest.image.digest, "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  assert.equal(manifest.baseImage.platform, "linux/amd64");
  assert.equal(manifest.texlive.iso.sha512.length, 128);
  assert.deepEqual(manifest.texlive.packages, [...manifest.texlive.packages].sort((left, right) => left.name.localeCompare(right.name)));
  assert.deepEqual(Object.keys(manifest.profiles), ["chemfig", "circuitikz", "pgfplots", "tikz", "tikz-cd"]);
  assert.equal(manifest.assets.sbom.path, "tex-renderer-v1.sbom.spdx.json");
  assert.equal(manifest.assets.notices.path, "tex-renderer-v1.NOTICES");
  assert.deepEqual(JSON.parse(await readFile(join(directory, "release", "tex-renderer-v1.sbom.spdx.json"), "utf8")), { SPDXID: "SPDXRef-DOCUMENT", spdxVersion: "SPDX-2.3" });
  assert.match(await readFile(join(directory, "release", "GPL-PUBLICATION-REVIEW.md"), "utf8"), /Approved by:/);

  const repeated = release(directory, "--image-digest", "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  assert.notEqual(repeated.status, 0);
  assert.match(repeated.stderr, /immutable/i);
});

test("TeX release creator refuses an unrecorded package closure", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-tex-release-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const input = await releaseInputs(directory);
  await writeFile(join(input, "packages.txt"), "circuitikz 123\nunknown-package 1\n");

  const result = release(directory, "--image-digest", "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /closure/i);
});
