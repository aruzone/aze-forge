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

test("validate JSON mode emits one finite diagnostics report on success", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-json-valid-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "report.aze.md"), VALID_SOURCE);

  const result = runCli(
    ["validate", "report.aze.md", "--diagnostics", "json"],
    directory,
  );

  assert.equal(result.status, 0);
  assert.deepEqual(result.stderr, Buffer.alloc(0));
  assert.deepEqual(JSON.parse(result.stdout.toString("utf8")), {
    schema: "azeforge.diagnostics/v1",
    schemaVersion: 1,
    tool: { name: "azeforge", version: "0.1.0" },
    command: "validate",
    success: true,
    diagnostics: [],
  });
  assert.equal(result.stdout.toString("utf8").endsWith("\n"), true);
});

test("render JSON mode emits diagnostics and preserves the last Artifact", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-json-failed-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "invalid.aze.md"), "Before\n\n<div>\n\nAfter\n");
  await writeFile(join(directory, "report.html"), "last successful Artifact");

  const result = runCli(
    [
      "render",
      "invalid.aze.md",
      "--output",
      "report.html",
      "--diagnostics",
      "json",
    ],
    directory,
  );

  assert.equal(result.status, 1);
  assert.deepEqual(result.stderr, Buffer.alloc(0));
  const payload = JSON.parse(result.stdout.toString("utf8"));
  assert.equal(payload.schema, "azeforge.diagnostics/v1");
  assert.equal(payload.command, "render");
  assert.equal(payload.success, false);
  assert.deepEqual(
    payload.diagnostics.map(({ code }) => code),
    ["azeforge.security#raw-html-disabled"],
  );
  assert.equal("artifact" in payload, false);
  assert.equal("contentHash" in payload, false);
  assert.equal(
    await readFile(join(directory, "report.html"), "utf8"),
    "last successful Artifact",
  );
});

test("valid JSON mode frames malformed operations as one diagnostics report", () => {
  const result = runCli(
    [
      "render",
      "report.aze.md",
      "--stdout",
      "--format",
      "html",
      "--diagnostics",
      "json",
    ],
    process.cwd(),
  );

  assert.equal(result.status, 2);
  assert.deepEqual(result.stderr, Buffer.alloc(0));
  const payload = JSON.parse(result.stdout.toString("utf8"));
  assert.equal(payload.schema, "azeforge.diagnostics/v1");
  assert.equal(payload.success, false);
  assert.deepEqual(
    payload.diagnostics.map(({ code }) => code),
    ["azeforge.cli#invalid-operation"],
  );
});

test("missing arguments exit 2 while unreadable Source exits 1", () => {
  const malformed = runCli(
    ["validate", "--diagnostics", "json"],
    process.cwd(),
  );
  const failed = runCli(
    ["validate", "does-not-exist.aze.md", "--diagnostics", "json"],
    process.cwd(),
  );

  assert.equal(malformed.status, 2);
  assert.deepEqual(
    JSON.parse(malformed.stdout.toString("utf8")).diagnostics.map(
      ({ code }) => code,
    ),
    ["azeforge.cli#invalid-operation"],
  );
  assert.equal(failed.status, 1);
  assert.deepEqual(
    JSON.parse(failed.stdout.toString("utf8")).diagnostics.map(
      ({ code }) => code,
    ),
    ["azeforge.source#read-failed"],
  );
});

test("invalid UTF-8 is an accepted Source failure without a stack trace", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-utf8-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "invalid.aze.md"), Buffer.from([0x23, 0x20, 0xff]));

  const result = runCli(["validate", "invalid.aze.md"], directory);

  assert.equal(result.status, 1);
  assert.deepEqual(result.stdout, Buffer.alloc(0));
  const stderr = result.stderr.toString("utf8");
  assert.match(stderr, /error \[azeforge\.source#invalid-utf8\]/);
  assert.doesNotMatch(stderr, /\n\s+at /);
});

test("invalid UTF-8 remains a finite JSON Source failure", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-utf8-json-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "invalid.aze.md"), Buffer.from([0xff]));

  const result = runCli(
    ["validate", "invalid.aze.md", "--diagnostics", "json"],
    directory,
  );

  assert.equal(result.status, 1);
  assert.deepEqual(result.stderr, Buffer.alloc(0));
  const payload = JSON.parse(result.stdout.toString("utf8"));
  assert.equal(payload.success, false);
  assert.deepEqual(
    payload.diagnostics.map(({ code }) => code),
    ["azeforge.source#invalid-utf8"],
  );
});

test("human diagnostics use author vocabulary with help and safe fixes", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-human-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(
    join(directory, "recover.aze.md"),
    "Before\n\n:::: mystery\nbroken\n\n# After\n",
  );

  const result = runCli(["validate", "recover.aze.md"], directory);

  assert.equal(result.status, 1);
  assert.deepEqual(result.stdout, Buffer.alloc(0));
  const stderr = result.stderr.toString("utf8");
  assert.match(
    stderr,
    /recover\.aze\.md:3:6: error \[azeforge\.source#unclosed-directive\]/,
  );
  assert.match(stderr, /Help: Add a closing `::::` delimiter/);
  assert.match(stderr, /\n  :::: mystery\n       \^{7}\n/);
  assert.match(stderr, /Fix: Declare AzeMark version 1\./);
  assert.doesNotMatch(stderr, /parser|token|stack/i);
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
  assert.match(result.stderr.toString("utf8"), /azeforge\.source#version-unsupported/);
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

test("destination failures are reported as Artifact failures", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-artifact-failure-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "report.aze.md"), VALID_SOURCE);

  const result = runCli(
    [
      "render",
      "report.aze.md",
      "--output",
      "missing/report.html",
      "--diagnostics",
      "json",
    ],
    directory,
  );

  assert.equal(result.status, 1);
  assert.deepEqual(result.stderr, Buffer.alloc(0));
  assert.deepEqual(
    JSON.parse(result.stdout.toString("utf8")).diagnostics.map(
      ({ code }) => code,
    ),
    ["azeforge.artifact#commit-failed"],
  );
});
