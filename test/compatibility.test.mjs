import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const CLI_PATH = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

const MINIMAL_SOURCE = `---
azemark: 1
title: Compatibility probe
---

# Probe

Deterministic prose for the compatibility matrix.
`;
const EXPECTED_RUNTIME = {
  node: { supported: [22, 24], canonical: 24 },
  os: { supported: ["ubuntu", "macos"], canonical: "ubuntu" },
  canonical: { os: "ubuntu", arch: "x64", node: 24 },
};

function runCli(arguments_, workingDirectory, environment = {}) {
  return spawnSync(process.execPath, [CLI_PATH, ...arguments_], {
    cwd: workingDirectory,
    encoding: null,
    env: { ...process.env, ...environment },
  });
}

function renderAsync(sourcePath, outputArguments, workingDirectory, environment) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [CLI_PATH, "render", sourcePath, ...outputArguments, "--diagnostics", "json"],
      { cwd: workingDirectory, env: { ...process.env, ...environment } },
    );
    const chunks = { stdout: [], stderr: [] };
    child.stdout.on("data", (chunk) => chunks.stdout.push(chunk));
    child.stderr.on("data", (chunk) => chunks.stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (status) => {
      resolve({
        status,
        stdout: Buffer.concat(chunks.stdout),
        stderr: Buffer.concat(chunks.stderr),
      });
    });
  });
}

function parseReport(result, what) {
  assert.equal(result.status, 0, `${what} exited ${result.status}: ${result.stderr.toString("utf8").slice(0, 400)}`);
  return JSON.parse(result.stdout.toString("utf8"));
}

function contentHashOf(html) {
  const match = html.toString("utf8").match(/name="azeforge-content-hash" content="([^"]*)"/);
  assert.ok(match, "artifact carries its semantic content hash");
  return match[1];
}

async function renderHtmlInFreshDir(prefix, environment) {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  const source = "probe.aze.md";
  await writeFile(join(directory, source), MINIMAL_SOURCE);
  const result = runCli(["render", source, "--output", "probe.html", "--diagnostics", "json"], directory, environment);
  const report = parseReport(result, `render under ${prefix}`);
  const bytes = await readFile(join(directory, "probe.html"));
  return { report, bytes };
}

test("compatibility matrix matches the declared Node and OS support", () => {
  const result = runCli(["capabilities", "--json"], tmpdir());
  assert.equal(result.status, 0);
  const payload = JSON.parse(result.stdout.toString("utf8"));
  assert.deepEqual(payload.runtime, EXPECTED_RUNTIME);
});

test("version metadata matches support without workstation facts", () => {
  const result = runCli(["version", "--json"], tmpdir());
  assert.equal(result.status, 0);
  const text = result.stdout.toString("utf8");
  assert.deepEqual(JSON.parse(text).runtime, EXPECTED_RUNTIME);
  assert.doesNotMatch(text, /Users|home|darwin|linux|win32|arm64/i);
});

test("system-font absence cannot change eligibility or substitute glyphs", async (context) => {
  context.plan(2);
  await context.test("render succeeds without system fonts", async () => {
    const scrubbed = {
      FONTCONFIG_PATH: join(tmpdir(), "azeforge-no-system-fonts"),
      LANG: "C",
      LC_ALL: "C",
      TZ: "UTC",
    };
    const { bytes } = await renderHtmlInFreshDir("compat-fonts-", scrubbed);
    const text = bytes.toString("utf8");
    assert.ok(text.includes("data:font/woff2;base64"), "pinned fonts stay embedded");
    assert.ok(text.includes("font-family:Inter"), "prose keeps the pinned family");
    assert.ok(!text.includes("local("), "no system-font fallback source");
  });

  await context.test("uncovered glyphs fail closed instead of substituting", async () => {
    const directory = await mkdtemp(join(tmpdir(), "compat-coverage-"));
    const source = "emoji.aze.md";
    await writeFile(join(directory, source), `---\nazemark: 1\ntitle: Emoji\n---\n\n# Hi \u{1F600}\n`);
    await writeFile(join(directory, "out.html"), "last successful Artifact");
    const result = runCli(["render", source, "--output", "out.html", "--diagnostics", "json"], directory);
    assert.equal(result.status, 1);
    const report = JSON.parse(result.stdout.toString("utf8"));
    assert.equal(report.success, false);
    assert.deepEqual(
      report.diagnostics.map(({ code }) => code),
      ["azeforge.renderer#font-coverage"],
    );
    assert.equal(await readFile(join(directory, "out.html"), "utf8"), "last successful Artifact");
  });
});

test("locale, timezone, env ordering, paths, and temp dirs do not change output", async () => {
  const alternateTmp = await mkdtemp(join(tmpdir(), "compat-tmpdir-"));
  const reversedProcessEnvironment = Object.fromEntries(Object.entries(process.env).reverse());
  const variations = [
    ["compat-base-", {}],
    ["compat path with spaces-", {}],
    ["compat-lang-", { LANG: "C", LC_ALL: "C" }],
    ["compat-locale-", { LANG: "tr_TR.UTF-8", LC_ALL: "tr_TR.UTF-8", LANGUAGE: "tr_TR:tr" }],
    ["compat-tz-east-", { TZ: "Pacific/Kiritimati" }],
    ["compat-tz-west-", { TZ: "America/New_York" }],
    ["compat-tmpdir-", { TMPDIR: alternateTmp, TEMP: alternateTmp, TMP: alternateTmp }],
  ];
  const renders = [];
  for (const [prefix, environment] of variations) {
    renders.push(await renderHtmlInFreshDir(prefix, environment));
  }
  renders.push(
    await (async () => {
      const directory = await mkdtemp(join(tmpdir(), "compat-env-order-"));
      await writeFile(join(directory, "probe.aze.md"), MINIMAL_SOURCE);
      const result = spawnSync(
        process.execPath,
        [CLI_PATH, "render", "probe.aze.md", "--output", "probe.html", "--diagnostics", "json"],
        { cwd: directory, encoding: null, env: reversedProcessEnvironment },
      );
      const report = parseReport(result, "render with reversed environment order");
      return { report, bytes: await readFile(join(directory, "probe.html")) };
    })(),
  );
  const [first, ...rest] = renders;
  for (const [index, other] of rest.entries()) {
    assert.deepEqual(other.bytes, first.bytes, `variation ${index} changes artifact bytes`);
    assert.equal(other.report.artifact.artifactHash, first.report.artifact.artifactHash, `variation ${index} changes artifactHash`);
    assert.equal(other.report.artifact.rendererFingerprint, first.report.artifact.rendererFingerprint, `variation ${index} changes rendererFingerprint`);
  }
  assert.equal(contentHashOf(first.bytes), first.report.contentHash);
});

test("concurrent renders share one deterministic identity", async () => {
  const directories = await Promise.all(
    ["compat-race-a-", "compat-race-b-", "compat-race-c-", "compat-race-d-"].map((prefix) => mkdtemp(join(tmpdir(), prefix))),
  );
  await Promise.all(directories.map((directory) => writeFile(join(directory, "probe.aze.md"), MINIMAL_SOURCE)));
  const results = await Promise.all(
    directories.map((directory) => renderAsync("probe.aze.md", ["--output", "probe.html"], directory)),
  );
  const rendered = await Promise.all(
    results.map(async (result, index) => {
      assert.equal(result.status, 0, `concurrent render ${index} exited ${result.status}`);
      return readFile(join(directories[index], "probe.html"));
    }),
  );
  for (const bytes of rendered.slice(1)) {
    assert.deepEqual(bytes, rendered[0]);
  }
});
