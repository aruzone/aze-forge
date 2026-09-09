import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  installPackedCli,
  packCli,
  packPackage,
  runInstalledCli,
} from "./package-install.mjs";

const SOURCE = `---
azemark: 2
title: Installed CLI
---

# Packaged command

The installed command renders this Source.
`;

test("packed installation exposes the supported CLI and ignores installation paths", async () => {
  const archive = await packCli();
  const directory = await installPackedCli("azeforge consumer path ", archive);
  const secondDirectory = await installPackedCli("aze-b-", archive);
  const packageJson = JSON.parse(
    await readFile(
      join(directory, "node_modules", "@aruzone", "aze-forge", "package.json"),
      "utf8",
    ),
  );
  assert.equal(packageJson.private, undefined);
  assert.deepEqual(packageJson.files, [
    "dist",
    "schemas",
    "docs/assets/azeforge-logo-03-2.jpg",
  ]);
  assert.equal(packageJson.engines.node, ">=22 <23 || >=24 <25");

  const helpResult = runInstalledCli(directory, ["--help"]);
  assert.equal(helpResult.status, 0, helpResult.stderr.toString("utf8"));
  assert.match(helpResult.stderr.toString("utf8"), /azeforge/);

  const versionResult = runInstalledCli(directory, ["version", "--json"]);
  assert.equal(versionResult.status, 0, versionResult.stderr.toString("utf8"));
  const version = JSON.parse(versionResult.stdout.toString("utf8"));
  assert.equal(version.tool.name, "azeforge");
  assert.equal(version.tool.version, packageJson.version);
  await Promise.all([
    writeFile(join(directory, "installed.aze.md"), SOURCE),
    writeFile(join(secondDirectory, "installed.aze.md"), SOURCE),
  ]);
  const validateResult = runInstalledCli(directory, [
    "validate",
    "installed.aze.md",
    "--diagnostics",
    "json",
  ]);
  assert.equal(validateResult.status, 0, validateResult.stderr.toString("utf8"));
  assert.equal(JSON.parse(validateResult.stdout.toString("utf8")).success, true);

  const renderResult = runInstalledCli(directory, [
    "render",
    "installed.aze.md",
    "--output",
    "installed.html",
    "--diagnostics",
    "json",
  ]);
  assert.equal(renderResult.status, 0, renderResult.stderr.toString("utf8"));
  const report = JSON.parse(renderResult.stdout.toString("utf8"));
  assert.equal(report.success, true);
  assert.equal(report.artifact.format, "html");
  assert.match(
    await readFile(join(directory, "installed.html"), "utf8"),
    /<h1>Packaged command<\/h1>/,
  );
  const secondRender = runInstalledCli(secondDirectory, [
    "render",
    "installed.aze.md",
    "--output",
    "installed.html",
    "--diagnostics",
    "json",
  ]);
  assert.equal(secondRender.status, 0, secondRender.stderr.toString("utf8"));
  const secondReport = JSON.parse(secondRender.stdout.toString("utf8"));
  assert.deepEqual(
    await readFile(join(secondDirectory, "installed.html")),
    await readFile(join(directory, "installed.html")),
  );
  assert.equal(secondReport.artifact.artifactHash, report.artifact.artifactHash);
  assert.equal(
    secondReport.artifact.rendererFingerprint,
    report.artifact.rendererFingerprint,
  );
  const emptyHome = await mkdtemp(join(tmpdir(), "azeforge no browser "));
  const missingBrowser = runInstalledCli(
    directory,
    [
      "render",
      "installed.aze.md",
      "--output",
      "missing.svg",
      "--format",
      "svg",
      "--diagnostics",
      "json",
    ],
    { env: { ...process.env, HOME: emptyHome } },
  );
  assert.equal(missingBrowser.status, 1);
  const missingReport = JSON.parse(missingBrowser.stdout.toString("utf8"));
  assert.equal(missingReport.success, false);
  assert.ok(
    missingReport.diagnostics.some(
      (diagnostic) =>
        /browser-unavailable|adapter-missing/.test(diagnostic.code) &&
        /Reinstall AzeForge browser dependencies/.test(diagnostic.suggestion ?? ""),
    ),
    JSON.stringify(missingReport.diagnostics.map((diagnostic) => diagnostic.code)),
  );
  assert.doesNotMatch(missingBrowser.stderr.toString("utf8"), /^\s+at\s/m);
});

test("packed installation resolves the supported entry points by their package paths", async () => {
  const archive = await packPackage("azeforge entry points ");
  const directory = await installPackedCli("azeforge entry consumer ", archive);
  const writeConsumer = async (name, source) => {
    const path = join(directory, name);
    await writeFile(path, source);
    return path;
  };

  const compilerConsumer = await writeConsumer(
    "compiler-consumer.mjs",
    `import { createCompiler } from "@aruzone/aze-forge";
import { createVersionReport } from "@aruzone/aze-forge/contracts";
const report = createCompiler().parse("---\\nazemark: 2\\n---\\n\\n# Consumer\\n");
const version = createVersionReport();
process.stdout.write(JSON.stringify({
  parsed: report.diagnostics.length,
  version: version.tool.version,
}));
`,
  );
  const contractsConsumer = await writeConsumer(
    "contracts-consumer.mjs",
    `import { createVersionReport, equationSourceSchema } from "@aruzone/aze-forge/contracts";
import { CAPABILITIES_SCHEMA_ID } from "@aruzone/aze-forge/contracts";
process.stdout.write(JSON.stringify({
  schemas: createVersionReport().schemas.length,
  equationId: equationSourceSchema.\\u0024id,
  capabilities: CAPABILITIES_SCHEMA_ID,
}));
`,
  );
  const adaptersConsumer = await writeConsumer(
    "adapters-consumer.mjs",
    `import { getBuiltInRegistry, assertRegistryDescriptorsImmutable } from "@aruzone/aze-forge/adapters";
const registry = getBuiltInRegistry();
assertRegistryDescriptorsImmutable(registry);
process.stdout.write(JSON.stringify({ plugins: registry.plugins.length }));
`,
  );

  const run = async (file) => {
    const result = spawnSync(process.execPath, [file], { cwd: directory, encoding: null });
    assert.equal(result.status, 0, `${file}: ${result.stderr.toString("utf8")}`);
    return JSON.parse(result.stdout.toString("utf8"));
  };

  const compilerResult = await run(compilerConsumer);
  assert.equal(compilerResult.parsed, 0);
  assert.match(compilerResult.version, /^0\.\d+\.\d+$/);

  const contractsResult = await run(contractsConsumer);
  assert.ok(contractsResult.schemas > 0);
  assert.equal(contractsResult.equationId, "azeforge.equation/source/v2");
  assert.equal(contractsResult.capabilities, "azeforge.capabilities/v1");

  const adaptersResult = await run(adaptersConsumer);
  assert.ok(adaptersResult.plugins > 0);

  // Deep subpaths are not exported by the map: a bare package subpath must
  // resolve to ERR_PACKAGE_PATH_NOT_EXPORTED, never to an implementation module.
  const deepConsumer = await writeConsumer(
    "deep-import-consumer.mjs",
    `try {
  await import("@aruzone/aze-forge/dist/equation.js");
  process.stdout.write("loaded");
} catch (error) {
  process.stdout.write(error.code ?? error.constructor.name);
}
`,
  );
  const deepResult = spawnSync(process.execPath, [deepConsumer], {
    cwd: directory,
    encoding: null,
  });
  assert.equal(deepResult.status, 0, deepResult.stderr.toString("utf8"));
  assert.ok(
    /ERR_PACKAGE_PATH_NOT_EXPORTED|ERR_MODULE_NOT_FOUND/.test(
      deepResult.stdout.toString("utf8"),
    ),
    deepResult.stdout.toString("utf8"),
  );
});
