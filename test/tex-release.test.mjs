import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const SCRIPT = fileURLToPath(new URL("../scripts/tex-release.mjs", import.meta.url));
const sha256 = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
function tlpdbFor(closure) {
  return closure.trim().split("\n").map((entry) => {
    const [name, revision] = entry.split(" ");
    return `name ${name}\nrevision ${revision}\n`;
  }).join("");
}


const IMAGE_DIGEST = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const REVIEWED_ASSETS = ["tex-renderer-v1.sbom.spdx.json", "tex-renderer-v1.NOTICES", "tex-renderer-v1.provenance.json"];
async function cleanup(directory) {
  async function makeRemovable(path) {
    await chmod(path, 0o755).catch(() => {});
    const entries = await readdir(path, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) if (entry.isDirectory()) await makeRemovable(join(path, entry.name));
  }
  await makeRemovable(directory);
  await rm(directory, { recursive: true, force: true });
}


async function releaseInputs(directory) {
  const input = join(directory, "input");
  await mkdir(join(input, "fonts", "ams"), { recursive: true });
  await mkdir(join(input, "preambles"), { recursive: true });
  const closure = await readFile(join(REPO_ROOT, "tex-renderer", "package-closure.lock"), "utf8");
  await writeFile(join(input, "texlive.tlpdb"), tlpdbFor(closure));
  await writeFile(join(input, "packages.txt"), closure);
  await writeFile(join(input, "fonts", "lmroman10-regular.otf"), "font");
  await writeFile(join(input, "fonts", "ams", "symbol.pfb"), "ams-font");
  for (const profile of ["chemfig", "circuitikz", "pgfplots", "tikz", "tikz-cd"]) await writeFile(join(input, "preambles", `${profile}.tex`), `\\usepackage{${profile}}\n`);
  await writeFile(join(input, "corpus.json"), JSON.stringify({ fixtures: ["chemfig", "circuitikz", "pgfplots", "tikz", "tikz-cd"].map((profile) => ({ profile, inputHash: sha256(`input:${profile}`), outputHash: sha256(`output:${profile}`) })) }));
  await writeFile(join(input, "sbom.spdx.json"), JSON.stringify({ SPDXID: "SPDXRef-DOCUMENT", spdxVersion: "SPDX-2.3" }));
  await writeFile(join(input, "NOTICES"), "GPL-3.0-or-later components: circuitikz, dvisvgm, pgfplots.\n");
  await writeFile(join(input, "provenance.json"), JSON.stringify({ builder: "test", imageDigest: IMAGE_DIGEST, sourceRevision: "abc123" }));
  await writeFile(join(input, "tools.json"), JSON.stringify({ latex: { version: "pdfTeX 3.141592653-2.6-1.40.29 (TeX Live 2026)", argv: ["latex", "-interaction=nonstopmode", "-halt-on-error", "-no-shell-escape", "-output-format=dvi", "figure.tex"] }, dvisvgm: { version: "dvisvgm 3.6", argv: ["dvisvgm", "--page=1", "--no-fonts=1", "--precision=6", "--output=output.svg", "figure.dvi"] } }));
  await writeFile(join(directory, "gpl-review.json"), JSON.stringify({ schema: "azeforge.tex-renderer.gpl-publication-review/v1", imageDigest: IMAGE_DIGEST, correspondingSource: "https://example.test/source", approvedBy: "Release Engineering", approvedOn: "2026-09-17", reviewedAssets: REVIEWED_ASSETS }));
  return input;
}

function release(directory, ...args) {
  return spawnSync(process.execPath, [SCRIPT, "create", "--input", join(directory, "input"), "--output", join(directory, "release"), "--gpl-review", join(directory, "gpl-review.json"), ...args], { cwd: REPO_ROOT, encoding: "utf8" });
}

test("TeX release creator seals a complete manifest and immutable release assets", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-tex-release-"));
  context.after(() => cleanup(directory));
  await releaseInputs(directory);
  const result = release(directory, "--image-digest", IMAGE_DIGEST);
  assert.equal(result.status, 0, result.stderr);
  const published = JSON.parse(result.stdout);
  assert.match(published.rendererIdentity, /^sha256:[a-f0-9]{64}$/);
  const manifestBytes = await readFile(join(directory, "release", "tex-renderer-v1.manifest.json"));
  const manifest = JSON.parse(manifestBytes);
  assert.equal(sha256(manifestBytes), published.rendererIdentity);
  assert.equal(manifest.protocol.version, "azeforge.tex-renderer/v1");
  assert.equal(manifest.image.digest, IMAGE_DIGEST);
  assert.equal(manifest.baseImage.platform, "linux/amd64");
  assert.equal(manifest.texlive.iso.sha512.length, 128);
  assert.deepEqual(manifest.texlive.packages, [...manifest.texlive.packages].sort((left, right) => left.name.localeCompare(right.name)));
  assert.deepEqual(Object.keys(manifest.profiles), ["chemfig", "circuitikz", "pgfplots", "tikz", "tikz-cd"]);
  assert.equal(manifest.assets.sbom.path, "tex-renderer-v1.sbom.spdx.json");
  assert.equal(manifest.assets.notices.path, "tex-renderer-v1.NOTICES");
  assert.equal(manifest.assets.gplPublicationReview.path, "tex-renderer-v1.gpl-publication-review.json");
  assert.deepEqual(manifest.fonts.map(({ path }) => path), ["fonts/ams/symbol.pfb", "fonts/lmroman10-regular.otf"]);
  assert.deepEqual(JSON.parse(await readFile(join(directory, "release", "tex-renderer-v1.sbom.spdx.json"), "utf8")), { SPDXID: "SPDXRef-DOCUMENT", spdxVersion: "SPDX-2.3" });
  assert.equal(sha256(await readFile(join(directory, "release", "tex-renderer-v1.gpl-publication-review.json"))), manifest.assets.gplPublicationReview.sha256);
  assert.equal((await stat(join(directory, "release", "tex-renderer-v1.manifest.json"))).mode & 0o222, 0);
  assert.equal((await stat(join(directory, "release"))).mode & 0o222, 0);
  const repeated = release(directory, "--image-digest", IMAGE_DIGEST);
  assert.notEqual(repeated.status, 0);
  assert.match(repeated.stderr, /already exists/i);

});

test("TeX release creator refuses an unrecorded package closure", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-tex-release-"));
  context.after(() => cleanup(directory));
  const input = await releaseInputs(directory);
  await writeFile(join(input, "packages.txt"), "circuitikz 123\nunknown-package 1\n");

  const result = release(directory, "--image-digest", "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /closure/i);
});

test("TeX release creator rejects missing or malformed review and evidence before publishing", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-tex-release-"));
  context.after(() => cleanup(directory));
  const input = await releaseInputs(directory);
  await rm(join(directory, "gpl-review.json"));
  const noArgument = spawnSync(process.execPath, [SCRIPT, "create", "--input", join(directory, "input"), "--output", join(directory, "release"), "--image-digest", IMAGE_DIGEST], { cwd: REPO_ROOT, encoding: "utf8" });
  assert.notEqual(noArgument.status, 0);
  assert.match(noArgument.stderr, /--gpl-review/);
  await assert.rejects(readFile(join(directory, "release", "tex-renderer-v1.manifest.json")));

  const missingReview = release(directory, "--image-digest", IMAGE_DIGEST);
  assert.notEqual(missingReview.status, 0);
  await assert.rejects(readFile(join(directory, "release", "tex-renderer-v1.manifest.json")));

  await writeFile(join(directory, "gpl-review.json"), JSON.stringify({ schema: "azeforge.tex-renderer.gpl-publication-review/v1", imageDigest: IMAGE_DIGEST, correspondingSource: "https://example.test/source", approvedBy: "Release Engineering", approvedOn: "2026-09-17", reviewedAssets: ["tex-renderer-v1.NOTICES"] }));
  const malformedReview = release(directory, "--image-digest", IMAGE_DIGEST);
  assert.notEqual(malformedReview.status, 0);
  await assert.rejects(readFile(join(directory, "release", "tex-renderer-v1.manifest.json")));

  await writeFile(join(directory, "gpl-review.json"), JSON.stringify({ schema: "azeforge.tex-renderer.gpl-publication-review/v1", imageDigest: IMAGE_DIGEST, correspondingSource: "https://example.test/source", approvedBy: "Release Engineering", approvedOn: "2026-09-17", reviewedAssets: REVIEWED_ASSETS }));
  const validTools = await readFile(join(input, "tools.json"), "utf8");
  const malformedTools = JSON.parse(validTools);
  malformedTools.latex.version = "unknown";
  await writeFile(join(input, "tools.json"), JSON.stringify(malformedTools));
  const malformedToolVersion = release(directory, "--image-digest", IMAGE_DIGEST);
  assert.notEqual(malformedToolVersion.status, 0);
  assert.match(malformedToolVersion.stderr, /latex evidence/i);
  await assert.rejects(readFile(join(directory, "release", "tex-renderer-v1.manifest.json")));
  await writeFile(join(input, "tools.json"), validTools);
  const validTlpdb = await readFile(join(input, "texlive.tlpdb"), "utf8");
  await writeFile(join(input, "texlive.tlpdb"), "name circuitikz\nrevision 123\n");
  const mismatchedTlpdb = release(directory, "--image-digest", IMAGE_DIGEST);
  assert.notEqual(mismatchedTlpdb.status, 0);
  assert.match(mismatchedTlpdb.stderr, /texlive\.tlpdb/i);
  await assert.rejects(readFile(join(directory, "release", "tex-renderer-v1.manifest.json")));
  await writeFile(join(input, "texlive.tlpdb"), validTlpdb);
  await writeFile(join(input, "corpus.json"), JSON.stringify({ fixtures: [{ profile: "tikz", inputHash: "not-a-digest", outputHash: sha256("output") }] }));
  const malformedEvidence = release(directory, "--image-digest", IMAGE_DIGEST);
  assert.notEqual(malformedEvidence.status, 0);
  await assert.rejects(readFile(join(directory, "release", "tex-renderer-v1.manifest.json")));
});

test("TeX release identity is independent of evidence object and set ordering", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-tex-release-"));
  context.after(() => cleanup(directory));
  await releaseInputs(directory);
  const first = release(directory, "--image-digest", IMAGE_DIGEST);
  assert.equal(first.status, 0, first.stderr);

  const reordered = join(directory, "reordered");
  await mkdir(reordered);
  const input = await releaseInputs(reordered);
  await writeFile(join(input, "sbom.spdx.json"), JSON.stringify({ spdxVersion: "SPDX-2.3", SPDXID: "SPDXRef-DOCUMENT" }));
  const corpus = JSON.parse(await readFile(join(input, "corpus.json"), "utf8"));
  corpus.fixtures.reverse();
  await writeFile(join(input, "corpus.json"), JSON.stringify(corpus));
  const review = JSON.parse(await readFile(join(reordered, "gpl-review.json"), "utf8"));
  review.reviewedAssets.reverse();
  await writeFile(join(reordered, "gpl-review.json"), JSON.stringify(review));
  const second = release(reordered, "--image-digest", IMAGE_DIGEST);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(JSON.parse(second.stdout).rendererIdentity, JSON.parse(first.stdout).rendererIdentity);
});
