import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { createCompiler } from "../dist/index.js";

const CLI_PATH = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

function runCli(arguments_, cwd, stdinBytes) {
  return spawnSync(process.execPath, [CLI_PATH, ...arguments_], {
    cwd,
    encoding: null,
    ...(stdinBytes === undefined ? {} : { input: stdinBytes }),
  });
}

const MESSY_SOURCE = [
  "---",
  "azemark: 2",
  "title: Messy",
  "---",
  "#   Spaced heading   ###",
  "",
  "",
  "Paragraph with trailing space.   ",
  "",
  ":::: equation",
  "id:euler",
  "number:true",
  "----",
  "alpha + sqrt(x)   ",
  "::::",
].join("\n");

const FORMATTED_SOURCE = [
  "---",
  "azemark: 2",
  "title: Messy",
  "---",
  "",
  "# Spaced heading",
  "",
  "Paragraph with trailing space.",
  "",
  ":::: equation",
  "id: euler",
  "number: true",
  "----",
  "alpha + sqrt(x)",
  "::::",
  "",
].join("\n");

test("format writes LF-formatted Source to stdout only", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-format-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "messy.aze.md"), MESSY_SOURCE);

  const result = runCli(["format", "messy.aze.md"], directory);

  assert.equal(result.status, 0);
  assert.equal(result.stdout.toString("utf8"), FORMATTED_SOURCE);
  assert.deepEqual(result.stderr, Buffer.alloc(0));
});

test("compiler format preserves the semantic AzeDocument and contentHash", async () => {
  const compiler = createCompiler();
  const before = await compiler.compile(MESSY_SOURCE, { format: "html" });
  assert.ok(before.contentHash !== undefined);

  const formatted = compiler.format(MESSY_SOURCE);
  assert.deepEqual(formatted.diagnostics, []);
  assert.equal(formatted.source, FORMATTED_SOURCE);

  const after = await compiler.compile(formatted.source ?? "", {
    format: "html",
  });
  assert.equal(after.contentHash, before.contentHash);
});

test("format preserves unknown directive bodies byte-for-byte", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-format-unknown-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const source = [
    "---",
    "azemark: 2",
    "title: Unknown",
    "---",
    "Before",
    "",
    ":::: mystery",
    "x = 1   ",
    "::::",
    "",
    "After",
  ].join("\n");
  await writeFile(join(directory, "unknown.aze.md"), `${source}\n`);

  const result = runCli(["format", "unknown.aze.md"], directory);

  assert.equal(result.status, 0);
  assert.equal(
    result.stdout.toString("utf8"),
    [
      "---",
      "azemark: 2",
      "title: Unknown",
      "---",
      "",
      "Before",
      "",
      ":::: mystery",
      "x = 1   ",
      "::::",
      "",
      "After",
      "",
    ].join("\n"),
  );
});

test("format preserves denied raw regions and comments", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-format-raw-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const source = [
    "---",
    "azemark: 2",
    "title: Raw",
    "---",
    "",
    "Before",
    "",
    "<div>never rendered</div>",
    "",
    "<!-- a comment -->",
    "",
    "After",
    "",
  ].join("\n");
  await writeFile(join(directory, "raw.aze.md"), source);

  const result = runCli(["format", "raw.aze.md"], directory);

  assert.equal(result.status, 0);
  assert.equal(result.stdout.toString("utf8"), source);
});

test("format rejects ambiguous unclosed directives without output", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-format-ambiguous-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const source = "---\nazemark: 2\n---\n\nBefore\n\n:::: mystery\nbroken\n\n# After\n";
  await writeFile(join(directory, "ambiguous.aze.md"), source);

  const result = runCli(["format", "ambiguous.aze.md"], directory);

  assert.equal(result.status, 1);
  assert.deepEqual(result.stdout, Buffer.alloc(0));
  assert.match(
    result.stderr.toString("utf8"),
    /error \[azeforge\.format#ambiguous-structure\]/,
  );

  const formatted = createCompiler().format(source, {
    sourceName: "ambiguous.aze.md",
  });
  assert.equal(formatted.source, undefined);
  assert.deepEqual(
    formatted.diagnostics.map(({ code }) => code),
    ["azeforge.format#ambiguous-structure"],
  );
});

test("format rejects unclosed front matter without output", async () => {
  const formatted = createCompiler().format("---\ntitle: No close\n\n# Body\n");
  assert.equal(formatted.source, undefined);
  assert.deepEqual(
    formatted.diagnostics.map(({ code }) => code),
    ["azeforge.format#ambiguous-structure"],
  );
});

test("format leaves hash-led paragraphs without heading space untouched", async () => {
  const source = "---\nazemark: 2\n---\n\n#Title\n";
  const formatted = createCompiler().format(source);
  assert.deepEqual(formatted.diagnostics, []);
  assert.equal(formatted.source, source);
});

test("format strips BOM and normalizes CRLF to LF", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-format-crlf-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(
    join(directory, "crlf.aze.md"),
    Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from("---\r\nazemark: 2\r\n---\r\n\r\n# Title\r\n", "utf8"),
    ]),
  );

  const result = runCli(["format", "crlf.aze.md"], directory);

  assert.equal(result.status, 0);
  assert.equal(result.stdout.toString("utf8"), "---\nazemark: 2\n---\n\n# Title\n");
  assert.ok(!result.stdout.includes(Buffer.from([0xef, 0xbb, 0xbf])));
  assert.ok(!result.stdout.includes(Buffer.from("\r")));
});

test("format --check emits no Source and exits 1 only when formatting is required", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-format-check-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "check.aze.md");
  await writeFile(path, MESSY_SOURCE);

  const dirty = runCli(["format", "--check", "check.aze.md"], directory);
  assert.equal(dirty.status, 1);
  assert.deepEqual(dirty.stdout, Buffer.alloc(0));
  assert.match(
    dirty.stderr.toString("utf8"),
    /check\.aze\.md: error \[azeforge\.format#format-required\]/,
  );
  assert.equal(await readFile(path, "utf8"), MESSY_SOURCE);

  await writeFile(path, FORMATTED_SOURCE);
  const clean = runCli(["format", "--check", "check.aze.md"], directory);
  assert.equal(clean.status, 0);
  assert.deepEqual(clean.stdout, Buffer.alloc(0));
  assert.deepEqual(clean.stderr, Buffer.alloc(0));
  assert.equal(await readFile(path, "utf8"), FORMATTED_SOURCE);
});

test("format --check reports an ambiguous Source without rewriting it", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-format-check-amb-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "amb.aze.md");
  const source = "---\nazemark: 2\n---\n\n:::: broken\nno end\n\n# After\n";
  await writeFile(path, source);

  const result = runCli(["format", "--check", "amb.aze.md"], directory);

  assert.equal(result.status, 1);
  assert.deepEqual(result.stdout, Buffer.alloc(0));
  assert.equal(await readFile(path, "utf8"), source);
});

test("format --write atomically replaces the file and is idempotent", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-format-write-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "write.aze.md");
  await writeFile(path, MESSY_SOURCE);

  const first = runCli(["format", "--write", "write.aze.md"], directory);
  assert.equal(first.status, 0);
  assert.deepEqual(first.stdout, Buffer.alloc(0));
  assert.equal(await readFile(path, "utf8"), FORMATTED_SOURCE);

  const second = runCli(["format", "--write", "write.aze.md"], directory);
  assert.equal(second.status, 0);
  assert.equal(await readFile(path, "utf8"), FORMATTED_SOURCE);

  const check = runCli(["format", "--check", "write.aze.md"], directory);
  assert.equal(check.status, 0);
});

test("format --write refuses to rewrite ambiguous Source", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-format-write-amb-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "amb.aze.md");
  const source = "---\nazemark: 2\n---\n\n:::: broken\nno end\n\n# After\n";
  await writeFile(path, source);

  const result = runCli(["format", "--write", "amb.aze.md"], directory);

  assert.equal(result.status, 1);
  assert.deepEqual(result.stdout, Buffer.alloc(0));
  assert.equal(await readFile(path, "utf8"), source);
});

test("format --stdin reads Source from stdin and rejects --write", async () => {
  const stdin = runCli(["format", "--stdin"], undefined, Buffer.from(MESSY_SOURCE, "utf8"));
  assert.equal(stdin.status, 0);
  assert.equal(stdin.stdout.toString("utf8"), FORMATTED_SOURCE);
  assert.deepEqual(stdin.stderr, Buffer.alloc(0));

  const checkStdin = runCli(
    ["format", "--stdin", "--check"],
    undefined,
    Buffer.from(MESSY_SOURCE, "utf8"),
  );
  assert.equal(checkStdin.status, 1);
  assert.deepEqual(checkStdin.stdout, Buffer.alloc(0));

  const writeStdin = runCli(
    ["format", "--stdin", "--write"],
    undefined,
    Buffer.from(MESSY_SOURCE, "utf8"),
  );
  assert.equal(writeStdin.status, 2);
  assert.match(
    writeStdin.stderr.toString("utf8"),
    /azeforge\.cli#invalid-operation/,
  );
});

test("format rejects conflicting paths and options with exit 2", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-format-conflicts-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "one.aze.md"), MESSY_SOURCE);

  const bothPaths = runCli(
    ["format", "--stdin", "one.aze.md"],
    directory,
    Buffer.from(MESSY_SOURCE, "utf8"),
  );
  assert.equal(bothPaths.status, 2);

  const noInput = runCli(["format"], directory);
  assert.equal(noInput.status, 2);

  const bothFlags = runCli(["format", "--write", "--check", "one.aze.md"], directory);
  assert.equal(bothFlags.status, 2);

  const unknownFlag = runCli(["format", "--frobnicate", "one.aze.md"], directory);
  assert.equal(unknownFlag.status, 2);

  const extraPath = runCli(["format", "one.aze.md", "two.aze.md"], directory);
  assert.equal(extraPath.status, 2);

  const jsonStdout = runCli(["format", "one.aze.md", "--diagnostics", "json"], directory);
  assert.equal(jsonStdout.status, 2);
});

test("format --diagnostics json emits one finite report instead of Source", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-format-json-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "amb.aze.md");
  await writeFile(path, "---\nazemark: 2\n---\n\n:::: broken\nno end\n\n# After\n");

  const result = runCli(
    ["format", "--check", "amb.aze.md", "--diagnostics", "json"],
    directory,
  );

  assert.equal(result.status, 1);
  const payload = JSON.parse(result.stdout.toString("utf8"));
  assert.equal(payload.schema, "azeforge.diagnostics/v1");
  assert.equal(payload.command, "format");
  assert.equal(payload.success, false);
  assert.deepEqual(
    payload.diagnostics.map(({ code }) => code),
    ["azeforge.format#ambiguous-structure"],
  );
  assert.deepEqual(result.stderr, Buffer.alloc(0));
});

test("format preserves multiline denied raw HTML while emitting LF", async () => {
  const source = [
    "---",
    "azemark: 2",
    "---",
    "",
    "Before",
    "",
    "<div>\r",
    "content  \r",
    "</div>\r",
    "",
    "After",
    "",
  ].join("\n");

  const formatted = createCompiler().format(source);

  assert.deepEqual(formatted.diagnostics, []);
  assert.equal(
    formatted.source,
    "---\nazemark: 2\n---\n\nBefore\n\n<div>\ncontent  \n</div>\n\nAfter\n",
  );
});

test("format preserves denied raw LaTeX body trivia while emitting LF", async () => {
  const source = [
    "---\r",
    "azemark: 2\r",
    "---\r",
    "\r",
    ":::: equation\r",
    "syntax:latex\r",
    "----\r",
    "\\begin{aligned}  \r",
    "\r",
    "x &= y\t\r",
    "\\end{aligned}\r",
    "::::\r",
    "",
  ].join("\n");

  const formatted = createCompiler().format(source);

  assert.deepEqual(formatted.diagnostics, []);
  assert.equal(
    formatted.source,
    [
      "---",
      "azemark: 2",
      "---",
      "",
      ":::: equation",
      "syntax: latex",
      "----",
      "\\begin{aligned}  ",
      "",
      "x &= y\t",
      "\\end{aligned}",
      "::::",
      "",
    ].join("\n"),
  );
});
