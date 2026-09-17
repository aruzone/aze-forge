import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { access, chmod, copyFile, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TEX_PROFILES, documentFor } from "./tex-renderer-document.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PACKAGE_LOCK = join(ROOT, "tex-renderer", "package-closure.lock");
const LATEX_ARGV = ["latex", "-interaction=nonstopmode", "-halt-on-error", "-no-shell-escape", "-output-format=dvi", "figure.tex"];
const DVISVGM_ARGV = ["dvisvgm", "--page=1", "--no-fonts=1", "--precision=6", "--output=output.svg", "figure.dvi"];
const FIXTURES = Object.freeze({
  chemfig: "\\chemfig{H-C(-[2]H)(-[6]H)-H}",
  circuitikz: "\\draw (0,0) to[R] (2,0) to[C] (2,-2) node[ground] {};",
  pgfplots: "\\begin{axis}\\addplot coordinates {(0,0) (1,1)};\\end{axis}",
  tikz: "\\draw (0,0) -- (1,1);",
  "tikz-cd": "\\begin{tikzcd} A \\arrow[r] & B \\end{tikzcd}",
});

function fail(message) { throw new Error(message); }
function sha256(value) { return `sha256:${createHash("sha256").update(value).digest("hex")}`; }
function option(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || process.argv[index + 1] === undefined) fail(`Missing ${name}.`);
  return process.argv[index + 1];
}
function digestImage(image) {
  if (!/^.+@sha256:[a-f0-9]{64}$/.test(image)) fail("--image must be an OCI image reference pinned to a sha256 digest.");
  const reference = image.slice(0, image.lastIndexOf("@"));
  if (reference.slice(reference.lastIndexOf("/") + 1).includes(":")) fail("--image must not include a mutable tag.");
  return image.slice(image.lastIndexOf("@") + 1);
}
function nonempty(value, name) {
  if (value.trim() === "") fail(`${name} must not be empty.`);
  return value;
}
function run(command, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: ROOT, stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) resolve(Buffer.concat(stdout));
      else reject(new Error(`${command} ${args.slice(0, 3).join(" ")}… failed (${signal ?? `exit ${code}`}): ${Buffer.concat(stderr).toString("utf8").trim()}`));
    });
    if (input !== undefined) child.stdin.end(input);
  });
}
async function docker(image, command, input) {
  return run("docker", ["run", "--rm", "--interactive", "--platform", "linux/amd64", "--network", "none", "--read-only", "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m", "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--pids-limit", "64", "--memory", "512m", image, "sh", "-ceu", command], input);
}
async function dockerShell(image, command) {
  return run("docker", ["run", "--rm", "--platform", "linux/amd64", "--network", "none", "--read-only", "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m", "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--pids-limit", "64", "--memory", "512m", "--entrypoint", "/bin/sh", image, "-ceu", command]);
}
function packageClosure(tlpdb) {
  const entries = [];
  let name;
  for (const line of tlpdb.toString("utf8").split("\n")) {
    if (line.startsWith("name ")) name = line.slice(5);
    if (line.startsWith("revision ") && name !== undefined) {
      entries.push(`${name} ${line.slice(9)}`);
      name = undefined;
    }
  }
  return `${entries.sort().join("\n")}\n`;
}
async function absent(path) {
  try { await lstat(path); fail(`Evidence output already exists: ${path}.`); } catch (error) { if (error.code !== "ENOENT") throw error; }
}
async function makeWritable(path) {
  await chmod(path, 0o755).catch(() => {});
  for (const entry of await readdir(path, { withFileTypes: true }).catch(() => [])) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) await makeWritable(child);
    else await chmod(child, 0o644).catch(() => {});
  }
}
async function removeTree(path) {
  await makeWritable(path);
  await rm(path, { recursive: true, force: true });
}
async function captureFonts(image, staging) {
  const archive = join(staging, "fonts.tar");
  const bytes = await dockerShell(image, "tar -C /opt/texlive/texmf-dist -cf - fonts");
  await writeFile(archive, bytes, { flag: "wx" });
  await run("tar", ["-xf", archive, "-C", staging]);
  await makeWritable(join(staging, "fonts"));
  await rm(archive);
}
async function publish(staging, output) {
  try {
    await mkdir(output);
  } catch (error) {
    if (error.code === "EEXIST") fail(`Evidence output already exists: ${output}.`);
    throw error;
  }
  try {
    for (const entry of await readdir(staging)) await rename(join(staging, entry), join(output, entry));
    await rm(staging, { recursive: true });
  } catch (error) {
    await removeTree(output);
    throw error;
  }
}
async function collect() {
  const image = option("--image");
  const imageDigest = digestImage(image);
  const output = option("--output");
  const notices = option("--notices");
  const builder = nonempty(option("--builder"), "--builder");
  const sourceRevision = nonempty(option("--source-revision"), "--source-revision");
  await absent(output);
  await access(notices);
  const staging = await mkdtemp(join(dirname(output), ".tex-evidence-"));
  try {
    const [tlpdb, packageLock, sbom, toolLines] = await Promise.all([
      dockerShell(image, "cat /opt/texlive/tlpkg/texlive.tlpdb"),
      readFile(PACKAGE_LOCK),
      run("docker", ["scout", "sbom", "--format", "spdx", "--platform", "linux/amd64", image]),
      dockerShell(image, "latex --version | sed -n '1p'; dvisvgm --version | sed -n '1p'"),
    ]);
    const packages = packageClosure(tlpdb);
    if (!Buffer.from(packageLock).equals(Buffer.from(packages))) fail("Published image TeX Live closure differs from tex-renderer/package-closure.lock.");
    const [latexVersion, dvisvgmVersion] = toolLines.toString("utf8").trim().split("\n");
    if (latexVersion === undefined || dvisvgmVersion === undefined) fail("Published image did not report both TeX tool versions.");
    await writeFile(join(staging, "texlive.tlpdb"), tlpdb, { flag: "wx" });
    await writeFile(join(staging, "packages.txt"), packages, { flag: "wx" });
    await writeFile(join(staging, "sbom.spdx.json"), sbom, { flag: "wx" });
    await copyFile(notices, join(staging, "NOTICES"));
    await mkdir(join(staging, "preambles"));
    for (const profile of TEX_PROFILES) await writeFile(join(staging, "preambles", `${profile}.tex`), documentFor(profile, ""), { flag: "wx" });
    await captureFonts(image, staging);
    const fixtures = [];
    for (const profile of TEX_PROFILES) {
      const input = documentFor(profile, FIXTURES[profile]);
      let svg;
      try {
        svg = await docker(image, "cat > figure.tex; latex -interaction=nonstopmode -halt-on-error -no-shell-escape -output-format=dvi figure.tex >/dev/null; dvisvgm --page=1 --no-fonts=1 --precision=6 --output=output.svg figure.dvi >/dev/null; cat output.svg", input);
      } catch (error) {
        fail(`Corpus fixture ${profile} failed: ${error.message}`);
      }
      fixtures.push({ profile, inputHash: sha256(input), outputHash: sha256(svg) });
    }
    await writeFile(join(staging, "corpus.json"), `${JSON.stringify({ fixtures })}\n`, { flag: "wx" });
    await writeFile(join(staging, "tools.json"), `${JSON.stringify({ latex: { version: latexVersion, argv: LATEX_ARGV }, dvisvgm: { version: dvisvgmVersion, argv: DVISVGM_ARGV } })}\n`, { flag: "wx" });
    await writeFile(join(staging, "provenance.json"), `${JSON.stringify({ builder, imageDigest, sourceRevision })}\n`, { flag: "wx" });
    await publish(staging, output);
    process.stdout.write(`${JSON.stringify({ image, output, imageDigest })}\n`);
  } catch (error) {
    await removeTree(staging);
    throw error;
  }
}

if (process.argv[2] !== "collect") fail("Usage: tex-release-evidence.mjs collect --image IMAGE@sha256:... --output DIR --notices FILE --builder NAME --source-revision REVISION");
collect().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
