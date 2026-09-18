import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dockerTexRendererArgs } from "./tex-renderer-command.mjs";

const OFFICIAL_IMAGE_REPOSITORY = "docker.io/kkumaresan/aze-forge-tex-renderer";

function fail(message) {
  throw new Error(message);
}

function option(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || process.argv[index + 1] === undefined) fail(`Missing ${name}.`);
  return process.argv[index + 1];
}

function officialImage(manifest, suppliedImage) {
  const digest = manifest?.image?.digest;
  if (typeof digest !== "string" || !/^sha256:[a-f0-9]{64}$/.test(digest)) fail("The canonical renderer requires a sealed manifest image digest.");
  const image = `${OFFICIAL_IMAGE_REPOSITORY}@${digest}`;
  if (suppliedImage !== image) fail("The canonical renderer requires the official digest-pinned image.");
  return image;
}

const sourcePath = option("--source");
const outputPath = option("--output");
const manifestPath = option("--renderer-manifest");
const suppliedImage = option("--image");
const [source, manifestBytes] = await Promise.all([readFile(sourcePath, "utf8"), readFile(manifestPath)]);
let manifest;
try {
  manifest = JSON.parse(manifestBytes);
} catch {
  fail("Renderer manifest must be valid JSON.");
}
const image = officialImage(manifest, suppliedImage);
const rendererIdentity = `sha256:${createHash("sha256").update(manifestBytes).digest("hex")}`;
const { createCompiler } = await import("../dist/index.js");
const compiler = createCompiler({
  texRenderer: {
    rendererIdentity,
    command: "docker",
    args: dockerTexRendererArgs(image, rendererIdentity),
  },
});
const compiled = await compiler.compile(source, { format: "html", sourceName: sourcePath });
if (compiled.artifact === undefined) fail(JSON.stringify(compiled.diagnostics));
await writeFile(outputPath, compiled.artifact.bytes);
process.stdout.write(`${JSON.stringify({ source: sourcePath, output: outputPath, rendererIdentity, canonical: true, artifactHash: compiled.artifact.metadata.artifactHash, bytes: compiled.artifact.bytes.length })}\n`);
