import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dockerTexRendererArgs } from "./tex-renderer-command.mjs";

const DEFAULT_IMAGE = "azeforge-tex-renderer:local";

function fail(message) {
  throw new Error(message);
}

function option(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || process.argv[index + 1] === undefined) fail(`Missing ${name}.`);
  return process.argv[index + 1];
}
function sealedImageDigest(manifest) {
  const digest = manifest?.image?.digest;
  if (digest === undefined) return undefined;
  if (typeof digest !== "string" || !/^sha256:[a-f0-9]{64}$/.test(digest)) fail("Renderer manifest image.digest must be a sha256 digest.");
  return digest;
}


const sourcePath = option("--source");
const outputPath = option("--output");
const manifestPath = option("--renderer-manifest");
const image = process.argv.includes("--image") ? option("--image") : DEFAULT_IMAGE;
const [source, manifestBytes] = await Promise.all([readFile(sourcePath, "utf8"), readFile(manifestPath)]);
let manifest;
try {
  manifest = JSON.parse(manifestBytes);
} catch {
  fail("Renderer manifest must be valid JSON.");
}
const imageDigest = sealedImageDigest(manifest);
if (imageDigest !== undefined && !image.endsWith(`@${imageDigest}`)) fail("A sealed renderer manifest requires a digest-pinned image reference.");
const canonical = false;
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
process.stdout.write(`${JSON.stringify({ source: sourcePath, output: outputPath, rendererIdentity, canonical, artifactHash: compiled.artifact.metadata.artifactHash, bytes: compiled.artifact.bytes.length })}\n`);
