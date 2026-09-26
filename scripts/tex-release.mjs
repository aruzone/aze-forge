import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PROTOCOL_VERSION = "azeforge.tex-renderer/v1";
const REVIEW_SCHEMA = "azeforge.tex-renderer.gpl-publication-review/v1";
const ISO_SHA512 = "4a9071bb567c3bdd6443378dedc8e485aea4a2f1203ec8ed7c17f6787093b9c37636a037032c0be63352e3d0bf98cf5616dab19fdcd7cb83f766b3e085b620ff";
const BASE_IMAGE = "ubuntu@sha256:496754492fb28b4d3049432f2ca787449331e23fb14f0dd3fffea86bf5a93eb4";
const PACKAGE_LOCK = fileURLToPath(new URL("../tex-renderer/package-closure.lock", import.meta.url));
const PROFILES = ["chemfig", "circuitikz", "pgfplots", "tikz", "tikz-cd"];
const REVIEWED_ASSETS = ["tex-renderer-v1.NOTICES", "tex-renderer-v1.provenance.json", "tex-renderer-v1.sbom.spdx.json"];
const LATEX_ARGV = ["latex", "-interaction=nonstopmode", "-halt-on-error", "-no-shell-escape", "-output-format=dvi", "figure.tex"];
const DVISVGM_ARGV = ["dvisvgm", "--page=1", "--no-fonts=1", "--precision=6", "--output=output.svg", "figure.dvi"];
const LATEX_VERSION = "pdfTeX 3.141592653-2.6-1.40.29 (TeX Live 2026)";
const DVISVGM_VERSION = "dvisvgm 3.6";
const PROFILE_PACKAGES = {
  chemfig: ["chemfig", "pgf"],
  circuitikz: ["circuitikz", "pgf", "xstring"],
  pgfplots: ["pgf", "pgfplots"],
  tikz: ["pgf"],
  "tikz-cd": ["pgf", "tikz-cd"],
};

const sha256 = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const fail = (message) => { throw new Error(message); };
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const equalArray = (left, right) => Array.isArray(left) && left.length === right.length && left.every((value, index) => value === right[index]);

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || process.argv[index + 1] === undefined) fail(`Missing ${name}.`);
  return process.argv[index + 1];
}
function digest(value, field) {
  if (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value)) fail(`${field} must be a sha256 digest.`);
  return value;
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (isObject(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}
function jsonBytes(value) { return Buffer.from(`${JSON.stringify(canonical(value))}\n`); }
async function readText(path) { return readFile(path, "utf8"); }
async function readJson(path, label) {
  try { return JSON.parse(await readText(path)); } catch { fail(`${label} must be valid JSON.`); }
}
async function fileHash(path) { return sha256(await readFile(path)); }
async function fontHashes(directory) {
  const fonts = [];
  async function collect(path, relative = "") {
    const entries = await readdir(path, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const entryPath = join(path, entry.name);
      const entryRelative = relative === "" ? entry.name : join(relative, entry.name);
      if (entry.isDirectory()) await collect(entryPath, entryRelative);
      else if (entry.isFile()) fonts.push({ path: `fonts/${entryRelative.replaceAll("\\", "/")}`, sha256: await fileHash(entryPath) });
      else fail(`Font inventory entry must be a regular file or directory: ${entryRelative}`);
    }
  }
  await collect(directory);
  if (fonts.length === 0) fail("Font inventory must not be empty.");
  return fonts;
}
async function packageClosure(text) {
  const packages = text.trim().split("\n").filter(Boolean).map((line) => {
    const [name, revision, ...rest] = line.trim().split(/\s+/);
    if (name === undefined || revision === undefined || rest.length > 0 || !/^\d+$/.test(revision)) fail(`Invalid package closure entry: ${line}`);
    return { name, revision: Number(revision) };
  }).sort((left, right) => left.name.localeCompare(right.name));
  if (new Set(packages.map(({ name }) => name)).size !== packages.length) fail("Resolved package closure contains duplicate packages.");
  const expected = await readText(PACKAGE_LOCK);
  if (`${packages.map(({ name, revision }) => `${name} ${revision}`).join("\n")}\n` !== expected) fail("Resolved package closure is incomplete or does not match the approved lock.");
  return packages;
}
function tlpdbClosure(text) {
  const packages = [];
  let name;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("name ")) {
      name = line.slice("name ".length);
      continue;
    }
    if (name !== undefined && line.startsWith("revision ")) {
      const revision = line.slice("revision ".length);
      if (name === "" || !/^\d+$/.test(revision)) fail("Installed texlive.tlpdb contains an invalid package revision.");
      packages.push({ name, revision: Number(revision) });
      name = undefined;
    }
  }
  if (name !== undefined) fail("Installed texlive.tlpdb contains an incomplete package entry.");
  packages.sort((left, right) => left.name.localeCompare(right.name));
  if (new Set(packages.map(({ name }) => name)).size !== packages.length) fail("Installed texlive.tlpdb contains duplicate packages.");
  return packages;
}
function equalClosures(left, right) {
  return left.length === right.length && left.every(({ name, revision }, index) => name === right[index].name && revision === right[index].revision);
}
function nonempty(value) { return typeof value === "string" && value.trim() !== ""; }
function validateCorpus(corpus) {
  if (!isObject(corpus) || !Array.isArray(corpus.fixtures) || corpus.fixtures.length !== PROFILES.length) fail("Corpus must contain one fixture for every approved profile.");
  const profiles = corpus.fixtures.map((fixture) => fixture?.profile).sort();
  if (!equalArray(profiles, PROFILES)) fail("Corpus must contain one fixture for every approved profile.");
  for (const fixture of corpus.fixtures) {
    if (!isObject(fixture)) fail("Corpus fixture must be an object.");
    digest(fixture.inputHash, `Corpus input hash for ${fixture.profile}`);
    digest(fixture.outputHash, `Corpus output hash for ${fixture.profile}`);
  }
  return { ...corpus, fixtures: [...corpus.fixtures].sort((left, right) => left.profile.localeCompare(right.profile)) };
}
function validateTools(tools) {
  if (!isObject(tools)) fail("Tool evidence must be an object.");
  for (const [name, version, argv] of [["latex", LATEX_VERSION, LATEX_ARGV], ["dvisvgm", DVISVGM_VERSION, DVISVGM_ARGV]]) {
    if (!isObject(tools[name]) || tools[name].version !== version || !equalArray(tools[name].argv, argv)) fail(`${name} evidence must record its frozen version and approved argv.`);
  }
}
function validateProvenance(provenance, imageDigest) {
  if (!isObject(provenance) || provenance.imageDigest !== imageDigest || !nonempty(provenance.builder) || !nonempty(provenance.sourceRevision)) fail("Provenance must identify the builder, source revision, and requested image digest.");
}
function validateReview(review, imageDigest) {
  const approvedOn = review?.approvedOn;
  const validDate = typeof approvedOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(approvedOn) && new Date(`${approvedOn}T00:00:00.000Z`).toISOString().slice(0, 10) === approvedOn;
  if (!isObject(review) || review.schema !== REVIEW_SCHEMA || review.imageDigest !== imageDigest || !nonempty(review.correspondingSource) || !nonempty(review.approvedBy) || !validDate || !Array.isArray(review.reviewedAssets) || !equalArray([...review.reviewedAssets].sort(), REVIEWED_ASSETS)) fail("GPL publication review is incomplete or malformed.");
  return { ...review, reviewedAssets: [...review.reviewedAssets].sort() };
}
async function absent(path) {
  try { await lstat(path); fail(`Release output already exists: ${basename(path)}.`); } catch (error) { if (error.code !== "ENOENT") throw error; }
}

async function create() {
  const input = argument("--input");
  const output = argument("--output");
  const imageDigest = digest(argument("--image-digest"), "--image-digest");
  const reviewPath = argument("--gpl-review");
  await absent(output);

  const packages = await packageClosure(await readText(join(input, "packages.txt")));
  const tlpdbBytes = await readFile(join(input, "texlive.tlpdb"));
  if (!equalClosures(tlpdbClosure(tlpdbBytes.toString("utf8")), packages)) fail("Installed texlive.tlpdb does not match the resolved package closure.");
  const corpus = validateCorpus(await readJson(join(input, "corpus.json"), "Corpus evidence"));
  const tools = await readJson(join(input, "tools.json"), "Tool evidence");
  validateTools(tools);
  const sbom = await readJson(join(input, "sbom.spdx.json"), "SBOM");
  if (!isObject(sbom) || sbom.SPDXID !== "SPDXRef-DOCUMENT" || typeof sbom.spdxVersion !== "string" || !/^SPDX-\d+\.\d+$/.test(sbom.spdxVersion)) fail("SBOM must identify an SPDX document.");
  const notices = await readText(join(input, "NOTICES"));
  if (notices.trim() === "") fail("NOTICES must not be empty.");
  const provenance = await readJson(join(input, "provenance.json"), "Provenance");
  validateProvenance(provenance, imageDigest);
  const review = validateReview(await readJson(reviewPath, "GPL publication review"), imageDigest);
  const profiles = Object.fromEntries(await Promise.all(PROFILES.map(async (profile) => [profile, { preambleSha256: await fileHash(join(input, "preambles", `${profile}.tex`)), packages: PROFILE_PACKAGES[profile] }])));
  const assets = {
    sbom: { path: "tex-renderer-v1.sbom.spdx.json", bytes: jsonBytes(sbom) },
    notices: { path: "tex-renderer-v1.NOTICES", bytes: Buffer.from(notices) },
    provenance: { path: "tex-renderer-v1.provenance.json", bytes: jsonBytes(provenance) },
    gplPublicationReview: { path: "tex-renderer-v1.gpl-publication-review.json", bytes: jsonBytes(review) },
  };
  const manifest = {
    protocol: { version: PROTOCOL_VERSION }, image: { digest: imageDigest },
    baseImage: { reference: BASE_IMAGE, digest: "sha256:496754492fb28b4d3049432f2ca787449331e23fb14f0dd3fffea86bf5a93eb4", platform: "linux/amd64" },
    texlive: { version: 2026, iso: { sha512: ISO_SHA512 }, tlpdbSha256: sha256(tlpdbBytes), packages },
    profiles, tools, fonts: await fontHashes(join(input, "fonts")), normalizer: { version: "azeforge.tex-svg-normalizer/v2" }, resourcePolicy: { version: "azeforge.tex-resource-policy/v1" }, corpus,
    assets: Object.fromEntries(Object.entries(assets).map(([name, asset]) => [name, { path: asset.path, sha256: sha256(asset.bytes) }])),
  };
  const manifestBytes = Buffer.from(`${JSON.stringify(canonical(manifest), null, 2)}\n`);
  const rendererIdentity = sha256(manifestBytes);
  await mkdir(dirname(output), { recursive: true });
  const staging = await mkdtemp(join(dirname(output), ".tex-release-"));
  try {
    for (const asset of Object.values(assets)) await writeFile(join(staging, asset.path), asset.bytes, { flag: "wx" });
    await writeFile(join(staging, "tex-renderer-v1.manifest.json"), manifestBytes, { flag: "wx" });
    for (const asset of Object.values(assets)) await chmod(join(staging, asset.path), 0o444);
    await chmod(join(staging, "tex-renderer-v1.manifest.json"), 0o444);
    await absent(output);
    await rename(staging, output);
    await chmod(output, 0o555);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
  process.stdout.write(`${JSON.stringify({ rendererIdentity })}\n`);
}

if (process.argv[2] !== "create") fail("Usage: tex-release.mjs create --input DIR --output DIR --image-digest sha256:... --gpl-review PATH");
create().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
