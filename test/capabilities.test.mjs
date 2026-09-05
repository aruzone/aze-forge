import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

const CLI_PATH = new URL("../dist/cli.js", import.meta.url);
const SCHEMAS_PATH = new URL("../schemas/", import.meta.url);

function runCli(arguments_) {
  return spawnSync(process.execPath, [CLI_PATH.pathname, ...arguments_], {
    cwd: new URL("../", import.meta.url).pathname,
    encoding: null,
  });
}

async function packagedSchema(name) {
  const raw = await readFile(new URL(`../schemas/${name}.json`, import.meta.url), "utf8");
  return { raw, schema: JSON.parse(raw) };
}

test("packaged schemas are byte-identical to the exported schema objects", async () => {
  const { capabilitiesJsonSchema } = await import("../dist/capabilities-json.js");
  const { versionJsonSchema } = await import("../dist/version.js");
  const { diagnosticsJsonSchema } = await import("../dist/diagnostics-json.js");
  for (const [name, exported] of [
    ["capabilities", capabilitiesJsonSchema],
    ["version", versionJsonSchema],
    ["diagnostics", diagnosticsJsonSchema],
  ]) {
    const { raw } = await packagedSchema(name);
    assert.equal(raw, `${JSON.stringify(exported, null, 2)}\n`);
  }
  assert.ok((await packagedSchema("capabilities")).raw.length > 0);
  void SCHEMAS_PATH;
});

test("version --json emits the packaged version document on stdout only", async () => {
  const result = runCli(["version", "--json"]);
  assert.equal(result.status, 0);
  assert.deepEqual(result.stderr, Buffer.alloc(0));

  const payload = JSON.parse(result.stdout.toString("utf8"));
  const { schema } = await packagedSchema("version");
  for (const key of schema.required) {
    assert.ok(key in payload, `missing required key ${key}`);
  }
  assert.equal(payload.schema, "azeforge.version/v1");
  assert.equal(payload.schemaVersion, 1);
  assert.deepEqual(payload.tool, { name: "azeforge", version: "0.1.0" });
  assert.deepEqual(payload.source, { azemarkVersions: [1] });
  assert.deepEqual(payload.document, { schemaVersions: [1] });
  const ids = payload.schemas.map(({ id }) => id);
  assert.ok(ids.includes("azeforge.diagnostics/v1"));
  assert.ok(ids.includes("azeforge.capabilities/v1"));
  assert.ok(ids.includes("azeforge.version/v1"));
  // No workstation facts in the version document.
  assert.match(result.stdout.toString("utf8"), /"version":"0\.1\.0"/);
  assert.doesNotMatch(result.stdout.toString("utf8"), /Users|home|darwin|linux|win32/i);
});

test("capabilities --json enumerates the P0 contract in canonical order", async () => {
  const result = runCli(["capabilities", "--json"]);
  assert.equal(result.status, 0);
  assert.deepEqual(result.stderr, Buffer.alloc(0));

  const payload = JSON.parse(result.stdout.toString("utf8"));
  const { schema } = await packagedSchema("capabilities");
  for (const key of schema.required) {
    assert.ok(key in payload, `missing required key ${key}`);
  }
  assert.deepEqual(Object.keys(payload), schema.required);
  assert.equal(payload.schema, "azeforge.capabilities/v1");
  assert.equal(payload.schemaVersion, 1);

  assert.deepEqual(
    payload.commands.map(({ name }) => name),
    ["render", "validate", "watch", "serve", "format", "capabilities", "version"],
  );
  assert.deepEqual(
    payload.plugins.map(({ type }) => type),
    ["callout", "equation", "mermaid", "table"],
  );
  assert.deepEqual(
    payload.renderers.map(({ id }) => id),
    ["html", "pdf", "png", "svg"],
  );
  assert.equal(payload.blockRenderers.length, 16);
  assert.deepEqual(
    payload.themes.map(({ id }) => id),
    ["academic", "dark-presentation", "default"],
  );
  assert.deepEqual(payload.formats, ["html", "svg", "png", "pdf"]);
  assert.deepEqual(payload.source.azemarkVersions, [1]);
  assert.deepEqual(payload.document.schemaVersions, [1]);

  // Static output is deterministic and reports availability as unknown.
  assert.equal(payload.engines.browser.availability, "unknown");
  assert.ok(!("reason" in payload.engines.browser));
  assert.equal(payload.engines.katex.availability, "unknown");
  assert.equal(payload.engines.mermaid.availability, "unknown");

  // Limits match the resolved defaults and state the lowerable-only policy.
  assert.deepEqual(payload.limits.diagnostics, {
    perBlock: 20,
    perDocument: 200,
    policy: "lowerable-only",
  });
  assert.deepEqual(payload.policy.active.disabledBlockRendererIds, []);
  assert.deepEqual(payload.policy.active.disabledRendererIds, []);
  assert.deepEqual(payload.policy.active.disabledThemeIds, []);

  const again = runCli(["capabilities", "--json"]);
  assert.deepEqual(again.stdout, result.stdout);
});

test("capabilities --probe reports local availability and stays exit 0", async () => {
  const result = runCli(["capabilities", "--probe", "--json"]);
  assert.equal(result.status, 0);
  assert.deepEqual(result.stderr, Buffer.alloc(0));

  const payload = JSON.parse(result.stdout.toString("utf8"));
  assert.ok(["available", "unavailable"].includes(payload.engines.browser.availability));
  if (payload.engines.browser.availability === "unavailable") {
    assert.equal(typeof payload.engines.browser.reason, "string");
    assert.ok(payload.engines.browser.reason.length > 0);
    assert.equal(typeof payload.engines.browser.remedy, "string");
    assert.ok(payload.engines.browser.remedy.length > 0);
  }
  assert.equal(payload.engines.katex.availability, "available");
  assert.equal(payload.engines.mermaid.availability, "available");
});

test("human version, capabilities, and help use stderr with empty stdout", () => {
  for (const arguments_ of [["version"], ["capabilities"], ["--help"], ["-h"], ["help"], ["render", "--help"]]) {
    const result = runCli(arguments_);
    assert.equal(result.status, 0, arguments_.join(" "));
    assert.deepEqual(result.stdout, Buffer.alloc(0), arguments_.join(" "));
    assert.ok(result.stderr.length > 0, arguments_.join(" "));
  }
  assert.match(runCli(["--help"]).stderr.toString("utf8"), /capabilities/);
  assert.match(runCli(["render", "--help"]).stderr.toString("utf8"), /--output/);
  assert.match(runCli(["version"]).stderr.toString("utf8"), /azeforge 0\.1\.0/);

  const versionLine = runCli(["--version"]);
  assert.equal(versionLine.status, 0);
  assert.equal(versionLine.stdout.toString("utf8"), "azeforge 0.1.0\n");
  assert.deepEqual(versionLine.stderr, Buffer.alloc(0));
});
test("bare invocation shows global help instead of an error", () => {
  const result = runCli([]);
  assert.equal(result.status, 0);
  assert.deepEqual(result.stdout, Buffer.alloc(0));
  assert.match(result.stderr.toString("utf8"), /deterministic semantic publishing compiler/);
  assert.match(result.stderr.toString("utf8"), /capabilities/);
});
test("help takes no other options and supports both flag orders", () => {
  const helpForRender = runCli(["--help", "render"]);
  assert.equal(helpForRender.status, 0);
  assert.deepEqual(helpForRender.stdout, Buffer.alloc(0));
  assert.match(helpForRender.stderr.toString("utf8"), /--output/);

  for (const arguments_ of [
    ["render", "--bogus", "--help"],
    ["render", "does-not-exist.aze.md", "--help"],
    ["bogus", "--help"],
    ["capabilities", "--probe", "--help"],
  ]) {
    const result = runCli(arguments_);
    assert.equal(result.status, 2, arguments_.join(" "));
    assert.match(result.stderr.toString("utf8"), /azeforge\.cli#invalid-operation/, arguments_.join(" "));
  }
});

test("human reports derive names and versions from the canonical model", () => {
  const capabilities = runCli(["capabilities"]);
  assert.equal(capabilities.status, 0);
  const human = capabilities.stderr.toString("utf8");
  for (const name of ["render", "validate", "watch", "serve", "format", "capabilities", "version", "callout", "equation", "mermaid", "table", "html", "svg", "png", "pdf", "default", "academic", "dark-presentation"]) {
    assert.ok(human.includes(name), `human capabilities missing ${name}`);
  }
  const version = runCli(["version"]);
  assert.equal(version.status, 0);
  assert.match(version.stderr.toString("utf8"), /azeforge 0\.1\.0\nazemark versions: 1\ndocument schema versions: 1/);
});

test("capability and version option conflicts exit 2 as invalid operations", () => {
  const conflicts = [
    ["capabilities", "--json", "--json"],
    ["capabilities", "--probe", "--probe"],
    ["capabilities", "source.aze.md"],
    ["capabilities", "--bogus"],
    ["version", "--json", "--json"],
    ["version", "source.aze.md"],
    ["version", "--probe"],
    ["help", "bogus"],
    ["help", "render", "extra"],
    ["--version", "extra"],
  ];
  for (const arguments_ of conflicts) {
    const result = runCli(arguments_);
    assert.equal(result.status, 2, arguments_.join(" "));
    assert.match(result.stderr.toString("utf8"), /azeforge\.cli#invalid-operation/, arguments_.join(" "));
  }
  // Combining both machine flags reports the conflict as one JSON report.
  for (const arguments_ of [
    ["capabilities", "--json", "--diagnostics", "json"],
    ["version", "--json", "--diagnostics", "json"],
  ]) {
    const result = runCli(arguments_);
    assert.equal(result.status, 2, arguments_.join(" "));
    assert.deepEqual(result.stderr, Buffer.alloc(0), arguments_.join(" "));
    assert.deepEqual(
      JSON.parse(result.stdout.toString("utf8")).diagnostics.map(({ code }) => code),
      ["azeforge.cli#invalid-operation"],
      arguments_.join(" "),
    );
  }
});
