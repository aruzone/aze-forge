import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { documentFor } from "./tex-renderer-document.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
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

function failureCategory(code, signal, stderr) {
  if (signal !== null || code === 124) return "timeout";
  if (code === 125) return "adapter-unavailable";
  if (code === 137 || /limit|quota|no space|file too large|resource temporarily unavailable/i.test(stderr)) return "resource-limit";
  if (/denied|not permitted|not allowed|shell escape|network is unreachable|read-only file system/i.test(stderr)) return "sandbox-denied";
  return "compile-failed";
}

function run(image, input, signal, failRenderer) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", [
      "run", "--rm", "--interactive", "--platform", "linux/amd64", "--network", "none", "--read-only",
      "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m", "--cap-drop", "ALL",
      "--security-opt", "no-new-privileges", "--pids-limit", "64", "--memory", "512m", "--cpus", "1",
      image,
    ], { cwd: ROOT, detached: true, stdio: ["pipe", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    const cancel = () => { if (child.pid !== undefined) process.kill(-child.pid, "SIGTERM"); };
    signal?.addEventListener("abort", cancel, { once: true });
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (code, exitSignal) => {
      signal?.removeEventListener("abort", cancel);
      const result = { code, signal: exitSignal, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) };
      if (code === 0) resolve(result);
      else reject(failRenderer(failureCategory(code, exitSignal, result.stderr.toString("utf8"))));
    });
    child.stdin.end(input);
  });
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
const { createCompiler, TexRendererFailure } = await import("../dist/index.js");
const compiler = createCompiler({
  texRenderer: {
    rendererIdentity,
    async render({ profile, body, signal }) {
      const result = await run(image, documentFor(profile, body), signal, (category) => new TexRendererFailure(category));
      return result.stdout.toString("utf8").replace(/^\s*(?:<\?xml[^?]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)?/, "");
    },
  },
});
const compiled = await compiler.compile(source, { format: "html", sourceName: sourcePath });
if (compiled.artifact === undefined) fail(JSON.stringify(compiled.diagnostics));
await writeFile(outputPath, compiled.artifact.bytes);
process.stdout.write(`${JSON.stringify({ source: sourcePath, output: outputPath, rendererIdentity, canonical: true, artifactHash: compiled.artifact.metadata.artifactHash, bytes: compiled.artifact.bytes.length })}\n`);
