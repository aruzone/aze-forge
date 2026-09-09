import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { installPackedCli, runInstalledCli } from "./package-install.mjs";

const MINIMAL_SOURCE = `---
azemark: 2
title: Browser smoke
---

# Probe

Pinned-browser compatibility smoke.
`;


function parseReport(result, what) {
  assert.equal(
    result.status,
    0,
    `${what} exited ${result.status}: ${result.stderr.toString("utf8").slice(0, 400)}`,
  );
  return JSON.parse(result.stdout.toString("utf8"));
}

test("packaged pinned engine renders deterministic SVG under changed host settings", async () => {
  const installation = await installPackedCli("browser package path ");
  const probe = runInstalledCli(installation, ["capabilities", "--probe", "--json"]);
  const capabilities = parseReport(probe, "capabilities probe");
  assert.equal(capabilities.engines.browser.pinnedVersion, "152.0.7977.75");
  assert.equal(capabilities.engines.browser.availability, "available");

  const first = await mkdtemp(join(tmpdir(), "browser-smoke-a-"));
  const second = await mkdtemp(join(tmpdir(), "browser smoke b-"));
  for (const directory of [first, second]) {
    await writeFile(join(directory, "probe.aze.md"), MINIMAL_SOURCE);
  }

  function renderArgumentsFor(directory) {
    return [
      "render",
      join(directory, "probe.aze.md"),
      "--output",
      join(directory, "probe.svg"),
      "--format",
      "svg",
      "--diagnostics",
      "json",
    ];
  }
  const firstReport = parseReport(
    runInstalledCli(installation, renderArgumentsFor(first)),
    "browser-backed SVG render",
  );
  const secondReport = parseReport(
    runInstalledCli(installation, renderArgumentsFor(second), {
      env: {
        ...process.env,
        LANG: "C",
        LC_ALL: "C",
        TZ: "Pacific/Kiritimati",
        TMPDIR: second,
        TEMP: second,
        TMP: second,
      },
    }),
    "browser-backed SVG render under changed host settings",
  );

  assert.equal(firstReport.artifact.format, "svg");
  assert.deepEqual(
    await readFile(join(second, "probe.svg")),
    await readFile(join(first, "probe.svg")),
  );
  assert.equal(
    secondReport.artifact.artifactHash,
    firstReport.artifact.artifactHash,
  );
  assert.equal(
    secondReport.artifact.rendererFingerprint,
    firstReport.artifact.rendererFingerprint,
  );
});
