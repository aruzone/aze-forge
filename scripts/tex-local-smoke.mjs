import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LOCAL_RENDERER = fileURLToPath(new URL("./tex-local-render.mjs", import.meta.url));
const SOURCE = `---
azemark: 2
---

# TeX local smoke

:::: tex
id: rc-low-pass
title: RC low-pass filter
description: A resistor and capacitor connected as a low-pass filter.
profile: circuitikz
----
\\draw
  (0,0) to[short, o-] (1,0)
  to[R=$R$] (3,0) coordinate (output)
  to[short, -o] (4,0);
\\draw (output) to[C=$C$] (3,-2) node[ground] {};
::::
`;

function option(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  if (value === undefined) throw new Error(`Missing ${name} value.`);
  return value;
}

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [LOCAL_RENDERER, ...args], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve(Buffer.concat(stdout).toString("utf8"));
      else reject(new Error(Buffer.concat(stderr).toString("utf8").trim() || `Local TeX smoke failed with exit ${code}.`));
    });
  });
}

const image = option("--image") ?? "aze-forge-tex-renderer:local";
const directory = await mkdtemp(join(tmpdir(), "azeforge-tex-local-smoke-"));
try {
  const sourcePath = join(directory, "smoke.aze.md");
  const outputPath = join(directory, "smoke.html");
  const manifestPath = join(directory, "manifest.json");
  await Promise.all([
    writeFile(sourcePath, SOURCE),
    writeFile(manifestPath, '{"kind":"local-tex-smoke"}\n'),
  ]);
  const result = JSON.parse(await run([
    "--source", sourcePath,
    "--output", outputPath,
    "--image", image,
    "--renderer-manifest", manifestPath,
  ]));
  const html = await readFile(outputPath, "utf8");
  if (!html.includes('<figure class="aze-tex" data-tex-profile="circuitikz">')) throw new Error("The local renderer did not produce the CircuitikZ figure.");
  process.stdout.write(`${JSON.stringify({ ...result, smoke: "circuitikz" })}\n`);
} finally {
  await rm(directory, { recursive: true, force: true });
}
