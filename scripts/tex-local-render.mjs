import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { documentFor } from "./tex-renderer-document.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
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


function run(command, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: ROOT, stdio: ["pipe", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (code, signal) => {
      const result = { code, signal, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) };
      if (code === 0) resolve(result);
      else reject(new Error(`docker run failed (${signal ?? `exit ${code}`}): ${result.stderr.toString("utf8")}`));
    });
    child.stdin.end(input);
  });
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
const canonical = imageDigest !== undefined;
const rendererIdentity = `sha256:${createHash("sha256").update(manifestBytes).digest("hex")}`;
const { createCompiler } = await import("../dist/index.js");
const compiler = createCompiler({
  texRenderer: {
    rendererIdentity,
    async render({ profile, body }) {
      const result = await run("docker", [
        "run", "--rm", "--interactive", "--platform", "linux/amd64", "--network", "none", "--read-only",
        "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m", "--cap-drop", "ALL",
        "--security-opt", "no-new-privileges", "--pids-limit", "64", "--memory", "512m",
        image, "sh", "-ceu",
        "cat > figure.tex; latex -interaction=nonstopmode -halt-on-error -no-shell-escape -output-format=dvi figure.tex >/dev/null; dvisvgm --page=1 --no-fonts=1 --precision=6 --output=output.svg figure.dvi >/dev/null; cat output.svg",
      ], documentFor(profile, body));
      return result.stdout.toString("utf8").replace(/^\s*(?:<\?xml[^?]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)?/, "");
    },
  },
});
const compiled = await compiler.compile(source, { format: "html", sourceName: sourcePath });
if (compiled.artifact === undefined) fail(JSON.stringify(compiled.diagnostics));
await writeFile(outputPath, compiled.artifact.bytes);
process.stdout.write(`${JSON.stringify({ source: sourcePath, output: outputPath, rendererIdentity, canonical, artifactHash: compiled.artifact.metadata.artifactHash, bytes: compiled.artifact.bytes.length })}\n`);
