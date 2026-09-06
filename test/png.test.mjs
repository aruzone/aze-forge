import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { inflateSync } from "node:zlib";

import {
  createCompiler,
  defaultTheme,
  getBuiltInRegistry,
  normalizePng,
} from "../dist/index.js";

const CLI_PATH = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

function ptyArguments(commandArguments) {
  if (process.platform === "linux") {
    const command = commandArguments
      .map((part) => `'${part.replace(/'/g, `'\\''`)}'`)
      .join(" ");
    return ["-qec", command, "/dev/null"];
  }
  return ["-q", "/dev/null", ...commandArguments];
}
const SOURCE = `---
azemark: 1
title: PNG report
---

# Result

Ordered **semantic** content with a table.

## Results

| Quantity | Value |
| --- | ---: |
| Force | 12 N |
`;

function runCli(arguments_, cwd, options = {}) {
  return spawnSync(process.execPath, [CLI_PATH, ...arguments_], {
    cwd,
    encoding: null,
    ...options,
  });
}

function parseChunks(bytes) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  assert.deepEqual(
    [...bytes.subarray(0, 8)],
    signature,
    "The Artifact must start with the PNG signature.",
  );
  const chunks = [];
  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const length =
      bytes[offset] * 0x1_00_00_00 +
      (bytes[offset + 1] << 16) +
      (bytes[offset + 2] << 8) +
      bytes[offset + 3];
    const type = Buffer.from(bytes.subarray(offset + 4, offset + 8)).toString(
      "latin1",
    );
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    chunks.push({ type, data });
    offset += 12 + length;
    if (type === "IEND") break;
  }
  return chunks;
}

function ihdrDimensions(ihdr) {
  return {
    width:
      ihdr[0] * 0x1_00_00_00 + (ihdr[1] << 16) + (ihdr[2] << 8) + ihdr[3],
    height:
      ihdr[4] * 0x1_00_00_00 + (ihdr[5] << 16) + (ihdr[6] << 8) + ihdr[7],
    bitDepth: ihdr[8],
    colorType: ihdr[9],
  };
}

function decodeFirstPixel(chunks) {
  const ihdr = chunks.find(({ type }) => type === "IHDR");
  const idat = chunks
    .filter(({ type }) => type === "IDAT")
    .map(({ data }) => Buffer.from(data));
  const { width, height, colorType } = ihdrDimensions(ihdr.data);
  const stride = colorType === 2 ? 3 : 4;
  const raw = inflateSync(Buffer.concat(idat));
  const rowLength = 1 + stride * width;
  assert.equal(raw.length, rowLength * height);
  for (let row = 0; row < height; row += 1) {
    assert.equal(
      raw[row * rowLength],
      0,
      "Every scanline must use fixed None filtering.",
    );
  }
  return { red: raw[1], green: raw[2], blue: raw[3] };
}

test("CLI renders one deterministic whole-Document PNG Artifact", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-png-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "report.aze.md"), SOURCE);

  const explicit = runCli(
    [
      "render",
      "report.aze.md",
      "--output",
      "explicit.png",
      "--format",
      "png",
      "--diagnostics",
      "json",
    ],
    directory,
  );
  assert.equal(explicit.status, 0, explicit.stderr.toString("utf8"));
  assert.deepEqual(explicit.stderr, Buffer.alloc(0));
  const report = JSON.parse(explicit.stdout.toString("utf8"));
  assert.equal(report.artifact.format, "png");
  assert.equal(report.artifact.mimeType, "image/png");
  assert.equal(report.artifact.profile, "azeforge.png.continuous/v1");
  assert.deepEqual(report.artifact.requiredCapabilities, [
    "png-continuous",
    "srgb",
  ]);

  const inferred = runCli(
    ["render", "report.aze.md", "--output", "inferred.png"],
    directory,
  );
  assert.equal(inferred.status, 0, inferred.stderr.toString("utf8"));
  const first = await readFile(join(directory, "explicit.png"));
  const second = await readFile(join(directory, "inferred.png"));
  assert.deepEqual(second, first);
  assert.equal(
    report.artifact.artifactHash,
    `sha256:${createHash("sha256").update(first).digest("hex")}`,
  );

  const chunks = parseChunks(first);
  assert.deepEqual(
    chunks.map(({ type }) => type),
    ["IHDR", "sRGB", "IDAT", "IEND"],
  );
  const { width, height, bitDepth } = ihdrDimensions(
    chunks[0].data,
  );
  assert.equal(bitDepth, 8);
  assert.deepEqual(report.artifact.cssDimensions, defaultTheme.geometry);
  assert.equal(width, defaultTheme.geometry.canvasWidthPx * 2);

  const svgDirectory = await mkdtemp(join(tmpdir(), "azeforge-png-svg-"));
  context.after(() => rm(svgDirectory, { recursive: true, force: true }));
  await writeFile(join(svgDirectory, "report.aze.md"), SOURCE);
  const svgResult = runCli(
    ["render", "report.aze.md", "--output", "report.svg"],
    svgDirectory,
  );
  assert.equal(svgResult.status, 0, svgResult.stderr.toString("utf8"));
  const svg = await readFile(join(svgDirectory, "report.svg"), "utf8");
  const svgHeight = Number(svg.match(/ height="(\d+)"/)?.[1]);
  assert.equal(height, svgHeight * 2);
});

test("PNG normalization fixes sRGB output over the opaque Theme background", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-png-profile-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "report.aze.md"), SOURCE);

  for (const name of ["first.png", "second.png"]) {
    const result = runCli(
      ["render", "report.aze.md", "--output", name],
      directory,
    );
    assert.equal(result.status, 0, result.stderr.toString("utf8"));
  }
  const first = await readFile(join(directory, "first.png"));
  const second = await readFile(join(directory, "second.png"));
  assert.deepEqual(second, first);

  const renormalized = normalizePng(first);
  assert.deepEqual(Buffer.from(renormalized), first);

  const chunks = parseChunks(first);
  const srgb = chunks.find(({ type }) => type === "sRGB");
  assert.deepEqual([...srgb.data], [0]);
  const idatCount = chunks.filter(({ type }) => type === "IDAT").length;
  assert.equal(idatCount, 1);

  const { red, green, blue } = decodeFirstPixel(chunks);
  assert.deepEqual([red, green, blue], [0xff, 0xff, 0xff]);
});

test("PNG capabilities and oversized geometry fail closed", async () => {
  const pngRenderer = getBuiltInRegistry().renderers.find(
    ({ id }) => id === "png",
  );
  assert.deepEqual(pngRenderer?.capabilities, ["browser"]);
  assert.deepEqual(pngRenderer?.formats, ["png"]);

  const wideTheme = {
    ...defaultTheme,
    id: "wide",
    geometry: { ...defaultTheme.geometry, canvasWidthPx: 20_000 },
  };
  const compiler = createCompiler({
    themes: [wideTheme],
    defaultTheme: "wide",
  });
  const result = await compiler.compile(SOURCE, { format: "png" });
  assert.equal(result.artifact, undefined);
  assert.deepEqual(
    result.diagnostics.map(({ code }) => code),
    ["azeforge.renderer#artifact-limit"],
  );

  assert.throws(
    () =>
      createCompiler({
        themes: [
          {
            ...defaultTheme,
            geometry: { ...defaultTheme.geometry, canvasWidthPx: 0 },
          },
        ],
      }),
    (error) => {
      assert.equal(error.code, "AZE_CONFIG_THEME_VALUES");
      return true;
    },
  );
});

test("azeforge render --stdout writes only exact PNG Artifact bytes", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-png-stdout-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "report.aze.md"), SOURCE);

  const result = runCli(
    ["render", "report.aze.md", "--stdout", "--format", "png"],
    directory,
  );
  assert.equal(result.status, 0, result.stderr.toString("utf8"));
  assert.deepEqual(result.stderr, Buffer.alloc(0));

  const fileResult = runCli(
    ["render", "report.aze.md", "--output", "report.png"],
    directory,
  );
  assert.equal(fileResult.status, 0);
  assert.deepEqual(
    result.stdout,
    await readFile(join(directory, "report.png")),
  );
});

test("binary stdout refuses an interactive terminal", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-png-tty-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "report.aze.md"), SOURCE);
  let result;
  try {
    result = spawnSync(
      "script",
      ptyArguments([
        process.execPath,
        CLI_PATH,
        "render",
        "report.aze.md",
        "--stdout",
        "--format",
        "png",
      ]),
      { cwd: directory, encoding: null, stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (error) {
    if (error?.code === "ENOENT") {
      context.skip("The script pty helper is unavailable.");
      return;
    }
    throw error;
  }
  if (result.error?.code === "ENOENT") {
    context.skip("The script pty helper is unavailable.");
    return;
  }
  if (/Operation not supported on socket/.test(result.stderr.toString("utf8"))) {
    context.skip("No controlling terminal is available for pty allocation.");
    return;
  }
  assert.equal(result.status, 2, result.stderr?.toString("utf8"));
  const combined = Buffer.concat([result.stdout, result.stderr]).toString("utf8");
  assert.match(combined, /interactive terminal/);
  assert.equal(
    result.stdout.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    false,
  );

  const textResult = spawnSync(
    "script",
    ptyArguments([
      process.execPath,
      CLI_PATH,
      "render",
      "report.aze.md",
      "--stdout",
      "--format",
      "html",
    ]),
    { cwd: directory, encoding: null, stdio: ["ignore", "pipe", "pipe"] },
  );
  assert.equal(textResult.status, 0, textResult.stderr?.toString("utf8"));
  assert.match(
    Buffer.concat([textResult.stdout, textResult.stderr]).toString("utf8"),
    /<!doctype html>/,
  );
});

test("a missing browser fails closed with a reinstall remedy while HTML remains usable", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-png-engine-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "report.aze.md"), SOURCE);
  const withoutEngine = { env: { ...process.env, HOME: directory } };

  const pngResult = runCli(
    ["render", "report.aze.md", "--output", "report.png"],
    directory,
    withoutEngine,
  );
  assert.equal(pngResult.status, 1, pngResult.stderr.toString("utf8"));
  assert.deepEqual(pngResult.stdout, Buffer.alloc(0));
  assert.match(
    pngResult.stderr.toString("utf8"),
    /browser-unavailable/,
  );
  assert.match(
    pngResult.stderr.toString("utf8"),
    /Reinstall AzeForge browser dependencies/,
  );
  await assert.rejects(readFile(join(directory, "report.png")));

  const htmlResult = runCli(
    ["render", "report.aze.md", "--output", "report.html"],
    directory,
    withoutEngine,
  );
  assert.equal(htmlResult.status, 0, htmlResult.stderr.toString("utf8"));
  assert.match(
    await readFile(join(directory, "report.html"), "utf8"),
    /^<!doctype html>\n/,
  );
});
