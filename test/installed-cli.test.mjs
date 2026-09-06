import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  installPackedCli,
  packCli,
  runInstalledCli,
} from "./package-install.mjs";

const SOURCE = `---
azemark: 1
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
      join(directory, "node_modules", "azeforge", "package.json"),
      "utf8",
    ),
  );
  assert.equal(packageJson.private, undefined);
  assert.deepEqual(packageJson.files, ["dist", "schemas"]);
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
