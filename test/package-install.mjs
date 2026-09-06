import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const NPM = process.platform === "win32" ? "npm.cmd" : "npm";

function run(command, arguments_, options) {
  const result = spawnSync(command, arguments_, {
    encoding: null,
    shell: process.platform === "win32",
    ...options,
  });
  assert.equal(
    result.status,
    0,
    `${command} ${arguments_.join(" ")} exited ${result.status}: ${result.stderr.toString("utf8").slice(0, 2_000)}`,
  );
  return result;
}
export async function packCli() {
  const directory = await mkdtemp(join(tmpdir(), "azeforge package "));
  const pack = run(
    NPM,
    ["pack", "--json", "--pack-destination", directory],
    { cwd: ROOT },
  );
  const [{ filename }] = JSON.parse(pack.stdout.toString("utf8"));
  return join(directory, filename);
}

export async function installPackedCli(
  prefix = "azeforge consumer path ",
  packageArchive,
) {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  const archive = packageArchive ?? (await packCli());
  run(
    NPM,
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--no-save",
      "--package-lock=false",
      archive,
    ],
    { cwd: directory },
  );
  return directory;
}

export function runInstalledCli(directory, arguments_, options = {}) {
  return spawnSync(
    NPM,
    ["--silent", "exec", "--offline", "--", "azeforge", ...arguments_],
    {
      cwd: directory,
      encoding: null,
      env: process.env,
      shell: process.platform === "win32",
      ...options,
    },
  );
}
