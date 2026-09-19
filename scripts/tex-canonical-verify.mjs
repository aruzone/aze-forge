/**
 * Canonical TeX renderer acceptance.
 *
 * Renders the five-profile corpus through the digest-pinned official renderer
 * twice on canonical Linux/amd64 and requires, per approved profile:
 *
 * - one raw renderer SVG per run, byte-identical across the two runs;
 * - one canonical projection per run (`azeforge.tex-svg-normalizer/v1`,
 *   `dist/tex-svg.js`), byte-identical across the two runs;
 * - HTML and SVG Artifacts carrying exactly that projection;
 * - PNG and PDF Artifacts rendered twice with zero-tolerance byte equality
 *   (equal bytes mean equal pixels), with the PNG's pixel dimensions recorded.
 *
 * The renderer is contacted only in the two corpus batches: the Artifact phase
 * answers the compiler with the already-validated projection, so this script
 * also proves that no Artifact format reruns TeX.
 *
 * Usage:
 *   node scripts/tex-canonical-verify.mjs \
 *     --renderer-manifest release/tex-renderer-v2/tex-renderer-v1.manifest.json \
 *     [--image <official repository>@sha256:...] [--output report.json]
 *
 * `--local` accepts a locally built image (for example
 * `azeforge-tex-renderer:canonical`), and marks the report `canonical:false`.
 */

import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { dockerTexRendererArgs } from "./tex-renderer-command.mjs";
import { TEX_PROFILES, documentFor } from "./tex-renderer-document.mjs";
import { TEX_PROFILE_BODIES, texCorpusDescription } from "./tex-fixtures.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OFFICIAL_IMAGE_REPOSITORY = "docker.io/kkumaresan/aze-forge-tex-renderer";

function fail(message) {
  throw new Error(message);
}

function option(name, required = true) {
  const index = process.argv.indexOf(name);
  if (index < 0 || process.argv[index + 1] === undefined) {
    if (required) fail(`Missing ${name}.`);
    return undefined;
  }
  return process.argv[index + 1];
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function run(command, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) {
        resolve(Buffer.concat(stdout));
        return;
      }
      reject(
        new Error(
          `${command} failed (${signal ?? `exit ${code}`}): ${Buffer.concat(stderr).toString("utf8").trim()}`,
        ),
      );
    });
    if (input !== undefined) child.stdin.end(input);
  });
}

async function officialImage(manifest, supplied) {
  const digest = manifest?.image?.digest;
  if (typeof digest !== "string" || !/^sha256:[a-f0-9]{64}$/.test(digest)) {
    fail("The renderer manifest must pin an image digest.");
  }
  const image = `${OFFICIAL_IMAGE_REPOSITORY}@${digest}`;
  if (supplied !== undefined && supplied !== image) {
    fail("The canonical renderer requires the official digest-pinned image.");
  }
  return image;
}

/** One corpus batch: the whole profile set in one request, one response. */
async function renderCorpus(image, identity, request) {
  const bytes = await run(
    "docker",
    dockerTexRendererArgs(image, identity),
    Buffer.from(JSON.stringify(request), "utf8"),
  );
  let response;
  try {
    response = JSON.parse(bytes.toString("utf8"));
  } catch {
    fail("The canonical renderer did not answer with one JSON batch response.");
  }
  if (response?.protocol !== "azeforge.tex-renderer/v1" || !Array.isArray(response.results)) {
    fail("The canonical renderer answered with an invalid batch response.");
  }
  if (response.rendererIdentity !== identity) {
    fail("The canonical renderer answered with a different renderer identity.");
  }
  const results = new Map(response.results.map((result) => [result.index, result]));
  return TEX_PROFILES.map((profile, index) => {
    const result = results.get(index);
    if (result?.status !== "ok" || typeof result.svg !== "string" || result.svg === "") {
      fail(
        `Canonical corpus fixture ${profile} failed: ${result?.diagnostic?.code ?? "invalid response"}.`,
      );
    }
    return result.svg;
  });
}

/**
 * The checked-in fixture Source for one profile, read through the compiler so
 * its parsed body must equal the sealed corpus body: the release corpus and
 * the compiler acceptance can never drift apart.
 */
async function readFixture(compiler, profile) {
  const path = join(ROOT, "test-files", "tex", `${profile}.aze.md`);
  const source = await readFile(path, "utf8");
  const parsed = compiler.parse(source, { sourceName: path });
  const block = parsed.document?.blocks[0];
  if (parsed.diagnostics.length > 0 || block === undefined || block.kind !== "tex") {
    fail(`The ${profile} fixture does not parse as one TeX Block: ${JSON.stringify(parsed.diagnostics)}`);
  }
  if (block.body !== TEX_PROFILE_BODIES[profile]) {
    fail(`The ${profile} fixture body differs from the sealed corpus body.`);
  }
  return { source, title: block.title, description: block.description };
}

/** An adapter that answers with one already-validated projection. */
async function stubAdapter(directory, profile, svg, record, identity) {
  const path = join(directory, `${profile}.mjs`);
  await writeFile(
    path,
    `import { appendFileSync } from "node:fs";
const chunks = [];
process.stdin.on("data", (chunk) => chunks.push(chunk));
process.stdin.on("end", () => {
  const request = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  appendFileSync(${JSON.stringify(record)}, JSON.stringify(request) + "\\n");
  const results = request.figures.map((figure) => ({ index: figure.index, status: "ok", svg: ${JSON.stringify(svg)} }));
  process.stdout.write(JSON.stringify({ protocol: request.protocol, rendererIdentity: ${JSON.stringify(identity)}, results }));
});
`,
    { mode: 0o755 },
  );
  await chmod(path, 0o755);
  return { rendererIdentity: identity, command: process.execPath, args: [path] };
}

function pngDimensions(bytes) {
  if (bytes.length < 24) return undefined;
  const view = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.toString("latin1", 1, 4) !== "PNG") return undefined;
  return { width: view.readUInt32BE(16), height: view.readUInt32BE(20) };
}

async function verify() {
  const manifestPath = option("--renderer-manifest");
  const local = process.argv.includes("--local");
  const supplied = option("--image", false);
  const output = option("--output", false);
  if (local && supplied === undefined) fail("--local requires --image.");
  const manifestBytes = await readFile(manifestPath);
  let manifest;
  try {
    manifest = JSON.parse(manifestBytes.toString("utf8"));
  } catch {
    fail("The renderer manifest must be valid JSON.");
  }
  const identity = sha256(manifestBytes);
  const image = local ? supplied : await officialImage(manifest, supplied);

  const { projectTexSvg, TEX_SVG_NORMALIZER_VERSION } = await import(
    join(ROOT, "dist", "tex-svg.js")
  ).catch(() => {
    fail("Build the compiler first: npm run build.");
  });
  const { createCompiler } = await import(join(ROOT, "dist", "index.js"));
  if (manifest.normalizer?.version !== TEX_SVG_NORMALIZER_VERSION) {
    fail("The sealed renderer manifest declares a different SVG normalizer version.");
  }
  const sealedCorpus = new Map(
    (manifest.corpus?.fixtures ?? []).map((fixture) => [fixture.profile, fixture.outputHash]),
  );

  const request = {
    protocol: "azeforge.tex-renderer/v1",
    figures: TEX_PROFILES.map((profile, index) => ({
      index,
      profile,
      title: profile,
      description: texCorpusDescription(profile),
      body: TEX_PROFILE_BODIES[profile],
      range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } },
    })),
  };
  const [firstRun, secondRun] = [
    await renderCorpus(image, identity, request),
    await renderCorpus(image, identity, request),
  ];

  const directory = await mkdtemp(join(tmpdir(), "azeforge-tex-canonical-"));
  // Only a native Linux/amd64 run is canonical evidence: the pixel comparison
  // renders through the host's pinned browser, so a macOS or arm64 host can
  // reproduce the same bytes locally while still not being the canonical
  // environment the workflow asserts.
  const canonicalHost = process.platform === "linux" && process.arch === "x64";
  const report = { canonical: !local && canonicalHost, image, rendererIdentity: identity, profiles: [] };
  try {
    for (const [index, profile] of TEX_PROFILES.entries()) {
      const raw = firstRun[index];
      const again = secondRun[index];
      if (raw !== again) fail(`The canonical renderer is not byte-identical for ${profile}.`);
      // The sealed manifest's corpus hashes are the approved renderer bytes:
      // a different renderer or toolchain must not pass as canonical.
      const sealed = sealedCorpus.get(profile);
      if (sealed === undefined) {
        fail(`The sealed renderer manifest carries no corpus fixture for ${profile}.`);
      }
      if (sha256(raw) !== sealed) {
        fail(`The ${profile} renderer SVG differs from the sealed corpus hash.`);
      }
      const record = join(directory, `${profile}.requests.jsonl`);
      const renderer = await stubAdapter(directory, profile, raw, record, identity);
      const compiler = createCompiler({ texRenderer: renderer });
      const fixture = await readFixture(compiler, profile);
      // The fixture Source holds one TeX Block, so the compiler embeds it as
      // batch figure 0 with the fixture's own accessible metadata.
      const projection = projectTexSvg({
        svg: raw,
        requestIndex: 0,
        title: fixture.title,
        description: fixture.description,
      });
      const reprojected = projectTexSvg({
        svg: again,
        requestIndex: 0,
        title: fixture.title,
        description: fixture.description,
      });
      if (projection !== reprojected) {
        fail(`The canonical projection is not byte-identical for ${profile}.`);
      }

      const html = await compiler.compile(fixture.source, {
        format: "html",
        sourceName: join(ROOT, "test-files", "tex", `${profile}.aze.md`),
      });
      const svg = await compiler.compile(fixture.source, { format: "svg" });
      const pngFirst = await compiler.compile(fixture.source, { format: "png" });
      const pngSecond = await compiler.compile(fixture.source, { format: "png" });
      const pdfFirst = await compiler.compile(fixture.source, { format: "pdf" });
      const pdfSecond = await compiler.compile(fixture.source, { format: "pdf" });
      for (const [format, compiled] of Object.entries({
        html,
        svg,
        png: pngFirst,
        pdf: pdfFirst,
      })) {
        if (compiled.artifact === undefined) {
          fail(`${profile} ${format} produced no Artifact: ${JSON.stringify(compiled.diagnostics)}`);
        }
      }
      const projectionText = `<figure class="aze-tex" data-tex-profile="${profile}">${projection}</figure>`;
      if (!Buffer.from(html.artifact.bytes).toString("utf8").includes(projectionText)) {
        fail(`The ${profile} HTML Artifact does not carry the canonical projection.`);
      }
      if (!Buffer.from(svg.artifact.bytes).toString("utf8").includes(projectionText)) {
        fail(`The ${profile} SVG Artifact does not carry the canonical projection.`);
      }
      if (pngFirst.artifact.metadata.artifactHash !== pngSecond.artifact.metadata.artifactHash) {
        fail(`The ${profile} PNG Artifact is not pixel-identical across two renders.`);
      }
      if (pdfFirst.artifact.metadata.artifactHash !== pdfSecond.artifact.metadata.artifactHash) {
        fail(`The ${profile} PDF Artifact is not byte-identical across two renders.`);
      }
      const invocations = (await readFile(record, "utf8")).trim().split("\n").length;
      if (invocations !== 6) {
        fail(
          `The ${profile} Artifact phase ran TeX ${invocations} times for six compilations.`,
        );
      }
      report.profiles.push({
        profile,
        rendererSvgSha256: sha256(raw),
        projectionSha256: sha256(projection),
        png: {
          artifactHash: pngFirst.artifact.metadata.artifactHash,
          ...pngDimensions(pngFirst.artifact.bytes),
        },
        pdfArtifactHash: pdfFirst.artifact.metadata.artifactHash,
      });
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (output !== undefined) await writeFile(output, serialized);
  process.stdout.write(serialized);
}

if (process.argv.includes("--help")) {
  process.stdout.write(
    "Usage: tex-canonical-verify.mjs --renderer-manifest PATH [--image IMAGE@sha256:...] [--local] [--output FILE]\n",
  );
} else {
  verify().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
