import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { buildCapabilities, serializeCapabilities } from "../dist/capabilities.js";
import { capabilitiesJsonSchema } from "../dist/capabilities-json.js";

const CLI_PATH = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const ROOT = fileURLToPath(new URL("../", import.meta.url));
const EXPECTED_RUNTIME = {
  node: { supported: [22, 24], canonical: 24 },
  os: { supported: ["ubuntu", "macos"], canonical: "ubuntu" },
  canonical: { os: "ubuntu", arch: "x64", node: 24 },
};

function runCli(arguments_) {
  return spawnSync(process.execPath, [CLI_PATH, ...arguments_], {
    cwd: ROOT,
    encoding: null,
  });
}

async function packagedSchema(name) {
  const raw = await readFile(new URL(`../schemas/${name}.json`, import.meta.url), "utf8");
  return { raw, schema: JSON.parse(raw) };
}


test("version --json emits the packaged version document on stdout only", async () => {
  const result = runCli(["version", "--json"]);
  assert.equal(result.status, 0);
  assert.deepEqual(result.stderr, Buffer.alloc(0));

  const payload = JSON.parse(result.stdout.toString("utf8"));
  const { schema } = await packagedSchema("version");
  for (const key of schema.required) {
    assert.ok(key in payload, `missing required key ${key}`);
  }
  assert.deepEqual(Object.keys(payload), schema.required);
  assert.equal(payload.schema, "azeforge.version/v1");
  assert.equal(payload.schemaVersion, 1);
  assert.deepEqual(payload.tool, { name: "azeforge", version: "0.3.1" });
  assert.deepEqual(payload.runtime, EXPECTED_RUNTIME);
  assert.deepEqual(payload.source, { azemarkVersions: [2] });
  assert.deepEqual(payload.document, { schemaVersions: [3] });
  const ids = payload.schemas.map(({ id }) => id);
  assert.ok(ids.includes("azeforge.diagnostics/v1"));
  assert.ok(ids.includes("azeforge.capabilities/v1"));
  assert.ok(ids.includes("azeforge.version/v1"));
  assert.ok(ids.includes("azeforge.derivation/source/v1"));
  assert.ok(ids.includes("azeforge.derivation/data/v1"));
  // Static support facts are release metadata, never facts about this workstation.
  assert.match(result.stdout.toString("utf8"), /"version":"0\.3\.1"/);
  assert.doesNotMatch(result.stdout.toString("utf8"), /Users|home|darwin|linux|win32|arm64/i);
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
    ["algorithm", "bibliography", "callout", "chart", "circuit", "class", "control", "derivation", "diagram", "entity", "equation", "example", "figure", "formula", "free-body", "geometry", "mermaid", "plot", "reaction", "sequence", "state", "statement", "structure", "table", "timing"],
  );
  assert.deepEqual(
    payload.plugins.map(({ version }) => version),
    ["1.0.0", "1.0.0", "1.0.0", "1.0.0", "1.0.0", "1.0.0", "1.0.0", "1.0.0", "1.0.0", "1.0.0", "2.0.0", "1.0.0", "1.0.0", "1.0.0", "1.0.0", "1.0.0", "1.0.0", "1.0.0", "1.0.0", "1.0.0", "1.0.0", "1.0.0", "1.0.0", "2.0.0", "1.0.0"],
  );

  assert.deepEqual(
    payload.renderers.map(({ id }) => id),
    ["html", "pdf", "png", "svg"],
  );
  assert.equal(payload.blockRenderers.length, 100);
  assert.deepEqual(
    payload.themes.map(({ id }) => id),
    ["academic", "dark-presentation", "default"],
  );
  assert.deepEqual(payload.formats, ["html", "svg", "png", "pdf"]);
  assert.deepEqual(payload.source.azemarkVersions, [2]);
  assert.deepEqual(payload.document.schemaVersions, [3]);
  assert.deepEqual(payload.runtime, EXPECTED_RUNTIME);

  // Static output is deterministic and reports availability as unknown.
  assert.equal(payload.engines.browser.availability, "unknown");
  assert.ok(!("reason" in payload.engines.browser));
  assert.equal(payload.engines.katex.availability, "unknown");
  assert.equal(payload.engines.mermaid.availability, "unknown");
  assert.equal(payload.engines.plot.availability, "unknown");
  assert.equal(payload.engines.plot.emitter, "1.0.0");
  assert.equal(payload.engines.plot.eval, "plot-eval/v1");
  assert.equal(payload.engines.geometry.availability, "unknown");
  assert.equal(payload.engines.geometry.emitter, "1.0.0");
  assert.equal(payload.engines.geometry.eval, "geometry-eval/v1");
  assert.equal(payload.engines.geometry.epsilon, 1e-9);
  assert.equal(payload.engines.diagram.availability, "unknown");
  assert.equal(payload.engines.diagram.layout, "diagram-layout/v1");
  assert.equal(payload.engines.diagram.elkjs, "0.12.0");
  assert.equal(payload.engines.diagram.emitter, "1.0.0");
  assert.equal(payload.engines.diagram.advanceMetric, "1.0.0");
  assert.deepEqual(payload.engines.diagram.metricSource, [
    "@fontsource/inter@5.3.0",
    "@fontsource/jetbrains-mono@5.2.8",
  ]);
  assert.equal(payload.engines.models.availability, "unknown");
  assert.equal(payload.engines.models.layout, "models-layout/v1");
  assert.equal(payload.engines.models.wrap, "models-wrap/v1");
  assert.equal(payload.engines.models.emitter, "1.0.0");
  assert.equal(payload.engines.models.advanceMetric, "1.0.0");
  assert.deepEqual(payload.engines.models.directiveTypes, ["sequence", "state", "entity", "class"]);
  assert.deepEqual(payload.limits.blocks.models, {
    sequence: {
      maxParticipants: 12,
      maxTimelineItems: 256,
      maxFragmentDepth: 4,
      maxAltDivisions: 8,
      maxNoteSpan: 2,
      maxNoteTextChars: 1000,
      maxNoteTextLines: 20,
    },
    state: {
      maxStates: 64,
      maxDepth: 3,
      maxTransitions: 128,
    },
    entity: {
      maxEntities: 32,
      maxAttributesPerEntity: 64,
      maxRelationships: 64,
    },
    class: {
      maxClassifiers: 32,
      maxAttributesPerClass: 64,
      maxOperationsPerClass: 64,
      maxParametersPerOperation: 16,
      maxRelationships: 64,
    },
    maxTextChars: 200,
    maxNameChars: 64,
    maxWidthPx: 4096,
    maxHeightPx: 16384,
  });
  assert.deepEqual(payload.limits.blocks.diagram, {
    maxDeclarations: 512,
    maxNodes: 128,
    maxEdges: 256,
    maxGroups: 32,
    maxGroupDepth: 4,
    maxPortsPerNode: 12,
    maxPorts: 128,
    maxParallelEdges: 4,
    maxLabelCodePoints: 500,
    maxLabelLines: 8,
    maxTotalLabelCodePoints: 16384,
  });

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
  assert.equal(payload.engines.plot.availability, "available");
  assert.equal(payload.engines.geometry.availability, "available");
  assert.equal(payload.engines.diagram.availability, "available");
});

test("every reported engine validates against the published capabilities schema", async () => {
  const payload = JSON.parse(serializeCapabilities(await buildCapabilities()));
  const engines = capabilitiesJsonSchema.properties.engines;
  assert.deepEqual(Object.keys(payload.engines).sort(), [...engines.required].sort());
  for (const [id, entry] of Object.entries(payload.engines)) {
    const schema = engines.properties[id];
    assert.ok(schema !== undefined, `engines.${id} needs a schema property`);
    // `fonts` is an array of records; every other engine is a closed object.
    if (schema.type !== "object") continue;
    for (const key of Object.keys(entry)) {
      assert.ok(
        schema.properties[key] !== undefined,
        `engines.${id}.${key} is not allowed by the schema`,
      );
    }
    for (const key of schema.required) {
      assert.ok(entry[key] !== undefined, `engines.${id}.${key} is required but missing`);
    }
  }
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
  assert.match(runCli(["version"]).stderr.toString("utf8"), /azeforge 0\.3\.1/);

  const versionLine = runCli(["--version"]);
  assert.equal(versionLine.status, 0);
  assert.equal(versionLine.stdout.toString("utf8"), "azeforge 0.3.1\n");
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
  for (const name of ["render", "validate", "watch", "serve", "format", "capabilities", "version", "callout", "chart", "derivation", "equation", "geometry", "mermaid", "plot", "table", "html", "svg", "png", "pdf", "default", "academic", "dark-presentation"]) {
    assert.ok(human.includes(name), `human capabilities missing ${name}`);
  }
  const version = runCli(["version"]);
  assert.equal(version.status, 0);
  assert.match(version.stderr.toString("utf8"), /azeforge 0\.3\.1\nazemark versions: 2\ndocument schema versions: 3/);
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
