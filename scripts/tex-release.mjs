import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
const PROTOCOL_VERSION = "azeforge.tex-renderer/v1";
const ISO_SHA512 = "4a9071bb567c3bdd6443378dedc8e485aea4a2f1203ec8ed7c17f6787093b9c37636a037032c0be63352e3d0bf98cf5616dab19fdcd7cb83f766b3e085b620ff";
const BASE_IMAGE = "ubuntu@sha256:496754492fb28b4d3049432f2ca787449331e23fb14f0dd3fffea86bf5a93eb4";
const PACKAGE_LOCK = fileURLToPath(new URL("../tex-renderer/package-closure.lock", import.meta.url));
const PROFILES = ["chemfig", "circuitikz", "pgfplots", "tikz", "tikz-cd"];
const sha256 = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;

function fail(message) { throw new Error(message); }
function argument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || process.argv[index + 1] === undefined) fail(`Missing ${name}.`);
  return process.argv[index + 1];
}
function digest(value, field) {
  if (!/^sha256:[a-f0-9]{64}$/.test(value)) fail(`${field} must be a sha256 digest.`);
  return value;
}
async function readText(path) { return readFile(path, "utf8"); }
async function fileHash(path) { return sha256(await readFile(path)); }
async function fontHashes(directory) {
  const names = (await readdir(directory)).sort();
  return Promise.all(names.map(async (name) => ({ path: `fonts/${name}`, sha256: await fileHash(join(directory, name)) })));
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
async function copyImmutable(source, destination) {
  try { await stat(destination); fail(`Release asset is immutable: ${basename(destination)} already exists.`); } catch (error) { if (error.code !== "ENOENT") throw error; }
  await cp(source, destination, { errorOnExist: true });
}

async function create() {
  const input = argument("--input");
  const output = argument("--output");
  const imageDigest = digest(argument("--image-digest"), "--image-digest");
  const packages = await packageClosure(await readText(join(input, "packages.txt")));
  const tlpdb = join(input, "texlive.tlpdb");
  const corpus = JSON.parse(await readText(join(input, "corpus.json")));
  if (!Array.isArray(corpus.fixtures) || corpus.fixtures.map(({ profile }) => profile).sort().join(",") !== PROFILES.join(",")) fail("Corpus must contain one fixture for every approved profile.");
  const sbom = join(input, "sbom.spdx.json");
  const notices = join(input, "NOTICES");
  const provenance = join(input, "provenance.json");
  const profiles = Object.fromEntries(await Promise.all(PROFILES.map(async (profile) => [profile, { preambleSha256: await fileHash(join(input, "preambles", `${profile}.tex`)), packages: profile === "tikz" ? ["pgf"] : [profile, "pgf"] }])));
  const manifest = {
    protocol: { version: PROTOCOL_VERSION },
    image: { digest: imageDigest },
    baseImage: { reference: BASE_IMAGE, digest: "sha256:496754492fb28b4d3049432f2ca787449331e23fb14f0dd3fffea86bf5a93eb4", platform: "linux/amd64" },
    texlive: { version: 2026, iso: { sha512: ISO_SHA512 }, tlpdbSha256: await fileHash(tlpdb), packages },
    profiles,
    tools: JSON.parse(await readText(join(input, "tools.json"))),
    fonts: await fontHashes(join(input, "fonts")),
    normalizer: { version: "azeforge.tex-svg-normalizer/v1" },
    resourcePolicy: { version: "azeforge.tex-resource-policy/v1" },
    corpus,
    assets: { sbom: { path: "tex-renderer-v1.sbom.spdx.json", sha256: await fileHash(sbom) }, notices: { path: "tex-renderer-v1.NOTICES", sha256: await fileHash(notices) }, provenance: { path: "tex-renderer-v1.provenance.json", sha256: await fileHash(provenance) } },
  };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  const rendererIdentity = sha256(manifestBytes);
  await mkdir(output, { recursive: true });
  const manifestPath = join(output, "tex-renderer-v1.manifest.json");
  await copyImmutable(sbom, join(output, manifest.assets.sbom.path));
  await copyImmutable(notices, join(output, manifest.assets.notices.path));
  await copyImmutable(provenance, join(output, manifest.assets.provenance.path));
  await writeFile(manifestPath, manifestBytes, { flag: "wx" }).catch((error) => { if (error.code === "EEXIST") fail("Release asset is immutable: tex-renderer-v1.manifest.json already exists."); throw error; });
  await writeFile(join(output, "GPL-PUBLICATION-REVIEW.md"), "# GPL-bearing renderer image publication review\n\nComponents: CircuiTikZ, dvisvgm, and PGFPlots.\n\nReview scope: corresponding-source availability, notices, SBOM, registry publication, and release provenance.\n\nApproved by: ____________________\nDate: ____________________\n", { flag: "wx" }).catch((error) => { if (error.code === "EEXIST") fail("Release asset is immutable: GPL-PUBLICATION-REVIEW.md already exists."); throw error; });
  process.stdout.write(`${JSON.stringify({ rendererIdentity })}\n`);
}

if (process.argv[2] !== "create") fail("Usage: tex-release.mjs create --input DIR --output DIR --image-digest sha256:...");
create().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
