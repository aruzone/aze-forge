import assert from "node:assert/strict";
import { chmod, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const COLLECTOR = join(ROOT, "scripts", "tex-release-evidence.mjs");
const RELEASE = join(ROOT, "scripts", "tex-release.mjs");
const IMAGE = "docker.io/example/renderer@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

async function removable(path) {
  async function unlock(entry) {
    await chmod(entry, 0o755).catch(() => {});
    for (const child of await readdir(entry, { withFileTypes: true }).catch(() => [])) {
      if (child.isDirectory()) await unlock(join(entry, child.name));
    }
  }
  await unlock(path);
  await rm(path, { recursive: true, force: true });
}

async function fakeDocker(directory) {
  const bin = join(directory, "bin");
  const fonts = join(directory, "fonts");
  await mkdir(join(fonts, "fonts", "lm"), { recursive: true });
  await writeFile(join(fonts, "fonts", "lm", "font.otf"), "font");
  const archive = join(directory, "fonts.tar");
  assert.equal(spawnSync("tar", ["-cf", archive, "-C", fonts, "fonts"]).status, 0);
  await mkdir(bin);
  const source = `import { readFileSync } from "node:fs";
const args = process.argv.slice(2);
const command = args.at(-1) ?? "";
if (args[0] === "scout" && args[1] === "sbom") process.stdout.write(JSON.stringify({ SPDXID: "SPDXRef-DOCUMENT", spdxVersion: "SPDX-2.3" }));
else if (command.includes("cat /opt/texlive/tlpkg/texlive.tlpdb")) process.stdout.write(readFileSync(process.env.FAKE_TLPDB));
else if (command.includes("latex --version")) process.stdout.write("pdfTeX 3.141592653-2.6-1.40.29 (TeX Live 2026)\\ndvisvgm 3.6\\n");
else if (command.includes("tar -C /opt/texlive/texmf-dist")) process.stdout.write(readFileSync(process.env.FAKE_FONTS_TAR));
else if (command.includes("cat > figure.tex")) process.stdout.write("<svg/>\\n");
else process.exitCode = 1;
`;
  const docker = join(bin, "docker");
  await writeFile(docker, `#!/usr/bin/env node\n${source}`);
  await chmod(docker, 0o755);
  return { bin, archive };
}

test("release evidence collector creates sealable evidence from a digest-pinned image", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-tex-evidence-"));
  context.after(() => removable(directory));
  const tlpdb = join(directory, "texlive.tlpdb");
  const closure = await readFile(join(ROOT, "tex-renderer", "package-closure.lock"), "utf8");
  await writeFile(tlpdb, closure.trim().split("\n").map((line) => { const [name, revision] = line.split(" "); return `name ${name}\nrevision ${revision}\n`; }).join(""));
  const { bin, archive } = await fakeDocker(directory);
  const notices = join(directory, "NOTICES");
  await writeFile(notices, "GPL notices reviewed.\n");
  const evidence = join(directory, "evidence");
  const environment = { ...process.env, PATH: `${bin}:${process.env.PATH}`, FAKE_TLPDB: tlpdb, FAKE_FONTS_TAR: archive };
  const collected = spawnSync(process.execPath, [COLLECTOR, "collect", "--image", IMAGE, "--output", evidence, "--notices", notices, "--builder", "release-test", "--source-revision", "abc123"], { cwd: ROOT, env: environment, encoding: "utf8" });
  assert.equal(collected.status, 0, collected.stderr);
  assert.deepEqual(JSON.parse(await readFile(join(evidence, "provenance.json"), "utf8")), { builder: "release-test", imageDigest: IMAGE.slice(IMAGE.indexOf("@") + 1), sourceRevision: "abc123" });
  assert.ok((await readFile(join(evidence, "fonts", "lm", "font.otf"))).equals(Buffer.from("font")));
  const review = join(directory, "gpl-review.json");
  await writeFile(review, JSON.stringify({ schema: "azeforge.tex-renderer.gpl-publication-review/v1", imageDigest: IMAGE.slice(IMAGE.indexOf("@") + 1), correspondingSource: "https://example.test/source", approvedBy: "Release Engineering", approvedOn: "2026-09-17", reviewedAssets: ["tex-renderer-v1.sbom.spdx.json", "tex-renderer-v1.NOTICES", "tex-renderer-v1.provenance.json"] }));
  const sealed = spawnSync(process.execPath, [RELEASE, "create", "--input", evidence, "--output", join(directory, "release"), "--image-digest", IMAGE.slice(IMAGE.indexOf("@") + 1), "--gpl-review", review], { cwd: ROOT, encoding: "utf8" });
  assert.equal(sealed.status, 0, sealed.stderr);
});

test("release evidence collector rejects mutable image references", () => {
  for (const image of ["docker.io/example/renderer:tag", `${IMAGE.replace("@", ":tag@")}`]) {
    const result = spawnSync(process.execPath, [COLLECTOR, "collect", "--image", image], { cwd: ROOT, encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /pinned|tag/i);
  }
});
