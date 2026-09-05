import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { createCompiler } from "../dist/index.js";

const CLI_PATH = new URL("../dist/cli.js", import.meta.url);
const VALID_SOURCE = `---
azemark: 1
title: CLI report
---

# Result

Deterministic prose.
`;

function runCli(arguments_, cwd) {
  return spawnSync(process.execPath, [CLI_PATH.pathname, ...arguments_], {
    cwd,
    encoding: null,
  });
}

test("azeforge validate is silent for a valid Source path", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-validate-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "report.aze.md"), VALID_SOURCE);

  const result = runCli(["validate", "report.aze.md"], directory);

  assert.equal(result.status, 0);
  assert.deepEqual(result.stdout, Buffer.alloc(0));
  assert.deepEqual(result.stderr, Buffer.alloc(0));
});

test("azeforge render atomically commits one self-contained HTML Artifact", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-render-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "report.aze.md"), VALID_SOURCE);
  await writeFile(join(directory, "report.html"), "previous Artifact");

  const result = runCli(
    ["render", "report.aze.md", "--output", "report.html"],
    directory,
  );

  assert.equal(result.status, 0);
  assert.deepEqual(result.stdout, Buffer.alloc(0));
  assert.deepEqual(result.stderr, Buffer.alloc(0));
  const artifact = await readFile(join(directory, "report.html"), "utf8");
  assert.match(artifact, /^<!doctype html>\n/);
  assert.match(
    artifact,
    /<main><article><h1>Result<\/h1><p>Deterministic prose\.<\/p><\/article><\/main>/,
  );
  assert.doesNotMatch(artifact, /<script\b/i);
  assert.doesNotMatch(artifact, /\b(?:src|href)="(?:https?:|file:|\/)/i);
});

test("azeforge render --stdout writes only exact HTML Artifact bytes", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-stdout-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "report.aze.md"), VALID_SOURCE);
  const expected = await createCompiler().compile(VALID_SOURCE, {
    format: "html",
    sourceName: "report.aze.md",
  });
  assert.ok(expected.artifact);

  const result = runCli(
    ["render", "report.aze.md", "--stdout", "--format", "html"],
    directory,
  );

  assert.equal(result.status, 0);
  assert.deepEqual(result.stderr, Buffer.alloc(0));
  assert.deepEqual(result.stdout, Buffer.from(expected.artifact.bytes));
});

test("failed render preserves the last committed Artifact", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-failure-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(
    join(directory, "invalid.aze.md"),
    "---\nazemark: 2\n---\n\nFuture Source\n",
  );
  await writeFile(join(directory, "report.html"), "last successful Artifact");

  const result = runCli(
    ["render", "invalid.aze.md", "--output", "report.html"],
    directory,
  );

  assert.equal(result.status, 1);
  assert.deepEqual(result.stdout, Buffer.alloc(0));
  assert.match(result.stderr.toString("utf8"), /AZE_VERSION_UNSUPPORTED/);
  assert.equal(
    await readFile(join(directory, "report.html"), "utf8"),
    "last successful Artifact",
  );
});

test("render rejects an Artifact path resolving to its Source", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-symlink-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const sourcePath = join(directory, "report.aze.md");
  await writeFile(sourcePath, VALID_SOURCE);
  await symlink(sourcePath, join(directory, "report.html"));

  const result = runCli(
    ["render", "report.aze.md", "--output", "report.html"],
    directory,
  );

  assert.equal(result.status, 2);
  assert.match(result.stderr.toString("utf8"), /cannot replace its Source/);
  assert.equal(await readFile(sourcePath, "utf8"), VALID_SOURCE);
});

test("render rejects HTML paired with a recognized non-HTML extension", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-extension-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "report.aze.md"), VALID_SOURCE);

  const result = runCli(
    [
      "render",
      "report.aze.md",
      "--output",
      "report.svg",
      "--format",
      "html",
    ],
    directory,
  );

  assert.equal(result.status, 2);
  assert.match(result.stderr.toString("utf8"), /format and destination extension disagree/);
});
