#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(root, "dist", "cli.js");
const report = {
  schema: "azeforge.compatibility-diagnostics/v1",
  runtime: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
  },
  runner: {
    os: process.env.RUNNER_OS ?? "local",
    arch: process.env.RUNNER_ARCH ?? process.arch,
  },
};

if (existsSync(cli)) {
  const result = spawnSync(
    process.execPath,
    [cli, "capabilities", "--probe", "--json"],
    { encoding: "utf8" },
  );
  report.capabilities = {
    status: result.status,
    ...(result.status === 0
      ? { report: JSON.parse(result.stdout) }
      : { stderr: result.stderr.slice(0, 4_000) }),
  };
} else {
  report.capabilities = {
    status: null,
    stderr: "dist/cli.js is unavailable; the build did not complete.",
  };
}

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
