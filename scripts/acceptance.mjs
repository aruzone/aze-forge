#!/usr/bin/env node
// P0-14 automated acceptance runner.
//
// Exercises the installed CLI (dist/cli.js) from fresh temporary directories:
// the versioned acceptance catalog, the Golden report matrix, determinism,
// cache-identity mutation, pagination boundaries, the modify/diagnose/repair
// loop, visual bounds, and the developer-only baseline refresh.
//
// Usage:
//   node scripts/acceptance.mjs [--json] [--refresh]
//
// --refresh rewrites acceptance/expected.json with the current live evidence
// and reports semantic/structural/visual diffs. It refuses under CI.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cp,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { inflateSync } from "node:zlib";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = join(ROOT, "dist", "cli.js");
const ACCEPTANCE_DIR = join(ROOT, "acceptance");
const GOLDEN_SOURCE = join(ACCEPTANCE_DIR, "golden-report.aze.md");
const PAGINATION_DIR = join(ACCEPTANCE_DIR, "pagination");
const EXPECTED_PATH = join(ACCEPTANCE_DIR, "expected.json");
const EXPECTED_PNG_DIR = join(ACCEPTANCE_DIR, "expected-png");

const FORMATS = ["html", "svg", "png", "pdf"];
const THEMES = ["default", "academic", "dark-presentation"];
const EXTENSION = { html: "html", svg: "svg", png: "png", pdf: "pdf" };

const args = new Set(process.argv.slice(2));
const JSON_MODE = args.has("--json");
const REFRESH_MODE = args.has("--refresh");

const results = [];
function check(id, name, pass, detail = "") {
  results.push({ id, name, pass: pass === true, detail: String(detail ?? "") });
  if (!JSON_MODE) {
    process.stderr.write(`${pass === true ? "PASS" : "FAIL"} [${id}] ${name}${detail ? ` — ${detail}` : ""}\n`);
  }
  return pass === true;
}

function fail(id, name, detail) {
  return check(id, name, false, detail);
}

function runCli(cliArgs, cwd, options = {}) {
  return spawnSync(process.execPath, [CLI, ...cliArgs], {
    cwd,
    encoding: null,
    ...options,
  });
}

function parseReport(result, what) {
  if (result.status !== 0) {
    throw new Error(`${what} exited ${result.status}: ${result.stderr.toString("utf8").slice(0, 400)}`);
  }
  return JSON.parse(result.stdout.toString("utf8"));
}

async function freshDir(prefix) {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  return directory;
}

async function renderFresh(sourcePath, format, theme, prefix, extraFiles = {}) {
  const directory = await freshDir(prefix);
  try {
    const name = `report.aze.md`;
    await writeFile(join(directory, name), await readFile(sourcePath));
    for (const [file, bytes] of Object.entries(extraFiles)) {
      await writeFile(join(directory, file), bytes);
    }
    const out = `report.${EXTENSION[format]}`;
    const cliArgs = ["render", name, "--output", out, "--format", format, "--diagnostics", "json"];
    if (theme !== undefined) cliArgs.push("--theme", theme);
    const result = runCli(cliArgs, directory);
    const report = parseReport(result, `render ${format}/${theme}`);
    const bytes = await readFile(join(directory, out));
    return { directory, report, bytes };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

// --- PNG helpers: exact dimensions/profile plus bounded comparison ---

function pngChunks(bytes) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let index = 0; index < 8; index += 1) {
    if (bytes[index] !== signature[index]) throw new Error("Not a PNG.");
  }
  const chunks = [];
  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const length =
      bytes[offset] * 0x1_00_00_00 +
      (bytes[offset + 1] << 16) +
      (bytes[offset + 2] << 8) +
      bytes[offset + 3];
    const type = Buffer.from(bytes.subarray(offset + 4, offset + 8)).toString("latin1");
    chunks.push({ type, data: bytes.subarray(offset + 8, offset + 8 + length) });
    offset += 12 + length;
    if (type === "IEND") break;
  }
  return chunks;
}

function pngPixels(bytes) {
  const chunks = pngChunks(bytes);
  const ihdr = chunks.find((chunk) => chunk.type === "IHDR").data;
  const width = (ihdr[0] << 24) + (ihdr[1] << 16) + (ihdr[2] << 8) + ihdr[3];
  const height = (ihdr[4] << 24) + (ihdr[5] << 16) + (ihdr[6] << 8) + ihdr[7];
  const colorType = ihdr[9];
  const stride = colorType === 2 ? 3 : colorType === 6 ? 4 : 0;
  if (stride === 0) throw new Error(`Unsupported PNG color type ${colorType}.`);
  const idat = chunks.filter((chunk) => chunk.type === "IDAT").map((chunk) => Buffer.from(chunk.data));
  const raw = inflateSync(Buffer.concat(idat));
  const rowLength = 1 + stride * width;
  if (raw.length !== rowLength * height) throw new Error("Unexpected PNG scanline length.");
  const pixels = new Uint8Array(width * height * 3);
  for (let row = 0; row < height; row += 1) {
    if (raw[row * rowLength] !== 0) throw new Error("Only fixed None filtering is accepted.");
    for (let column = 0; column < width; column += 1) {
      for (let channel = 0; channel < 3; channel += 1) {
        pixels[(row * width + column) * 3 + channel] = raw[row * rowLength + 1 + column * stride + channel];
      }
    }
  }
  return { width, height, pixels };
}

function downsampleGray(pixels, width, height, targetWidth) {
  const scale = Math.max(1, Math.floor(width / targetWidth));
  const outWidth = Math.floor(width / scale);
  const outHeight = Math.floor(height / scale);
  const out = new Float64Array(outWidth * outHeight);
  for (let y = 0; y < outHeight; y += 1) {
    for (let x = 0; x < outWidth; x += 1) {
      let sum = 0;
      let count = 0;
      for (let dy = 0; dy < scale; dy += 1) {
        for (let dx = 0; dx < scale; dx += 1) {
          const px = x * scale + dx;
          const py = y * scale + dy;
          if (px >= width || py >= height) continue;
          const base = (py * width + px) * 3;
          sum += 0.299 * pixels[base] + 0.587 * pixels[base + 1] + 0.114 * pixels[base + 2];
          count += 1;
        }
      }
      out[y * outWidth + x] = sum / count;
    }
  }
  return { gray: out, width: outWidth, height: outHeight };
}

// Deterministic whole-image SSIM approximation over downsampled luminance.
// Identical inputs score exactly 1; structural changes lower the score.
function approximateSsim(first, second) {
  const a = downsampleGray(first.pixels, first.width, first.height, 160);
  const b = downsampleGray(second.pixels, second.width, second.height, 160);
  if (a.width !== b.width || a.height !== b.height) return 0;
  const n = a.width * a.height;
  let meanA = 0;
  let meanB = 0;
  for (let index = 0; index < n; index += 1) {
    meanA += a.gray[index];
    meanB += b.gray[index];
  }
  meanA /= n;
  meanB /= n;
  let varA = 0;
  let varB = 0;
  let cov = 0;
  for (let index = 0; index < n; index += 1) {
    const da = a.gray[index] - meanA;
    const db = b.gray[index] - meanB;
    varA += da * da;
    varB += db * db;
    cov += da * db;
  }
  varA /= n;
  varB /= n;
  cov /= n;
  const c1 = 6.5025;
  const c2 = 58.5225;
  return ((2 * meanA * meanB + c1) * (2 * cov + c2)) /
    ((meanA * meanA + meanB * meanB + c1) * (varA + varB + c2));
}

function comparePng(firstBytes, secondBytes) {
  const first = pngPixels(firstBytes);
  const second = pngPixels(secondBytes);
  const dimensionsEqual = first.width === second.width && first.height === second.height;
  let changed = 0;
  let maxDelta = 0;
  if (dimensionsEqual) {
    const total = first.width * first.height;
    for (let pixel = 0; pixel < total; pixel += 1) {
      const d0 = Math.abs(first.pixels[pixel * 3] - second.pixels[pixel * 3]);
      const d1 = Math.abs(first.pixels[pixel * 3 + 1] - second.pixels[pixel * 3 + 1]);
      const d2 = Math.abs(first.pixels[pixel * 3 + 2] - second.pixels[pixel * 3 + 2]);
      if (Math.max(d0, d1, d2) > 8) changed += 1;
    }
    return {
      dimensionsEqual,
      width: first.width,
      height: first.height,
      changedFraction: changed / total,
      maxDelta,
      ssim: approximateSsim(first, second),
    };
  }
  return { dimensionsEqual, width: first.width, height: first.height, changedFraction: 1, maxDelta: 255, ssim: 0 };
}

// --- PDF helpers ---

function pdfPageCount(bytes) {
  const text = Buffer.from(bytes).toString("latin1");
  const match = /\/Type\s*\/Pages[\s\S]{0,300}?\/Count\s+(\d+)/.exec(text);
  if (match === null) throw new Error("PDF page count not found.");
  return Number(match[1]);
}

function pdfMediaBoxes(bytes) {
  const text = Buffer.from(bytes).toString("latin1");
  return [...text.matchAll(/\/MediaBox\s*\[([^\]]*)\]/g)].map((match) =>
    match[1].trim().split(/\s+/).map(Number),
  );
}

function pdfContentStreams(bytes) {
  const text = Buffer.from(bytes).toString("latin1");
  const out = [];
  for (const match of text.matchAll(/(\d+) (\d+) obj/g)) {
    const rest = text.slice(match.index, match.index + 12000);
    const streamAt = /stream(?:\r\n|\n|\r)/.exec(rest);
    if (streamAt === null) continue;
    if (!rest.slice(0, streamAt.index).includes("/FlateDecode")) continue;
    const length = /\/Length\s+(\d+)/.exec(rest.slice(0, streamAt.index));
    if (length === null) continue;
    const start = match.index + streamAt.index + streamAt[0].length;
    try {
      out.push(inflateSync(bytes.subarray(start, start + Number(length[1]))).toString("latin1"));
    } catch {
      continue;
    }
  }
  return out;
}

function pdfContentText(bytes) {
  return pdfContentStreams(bytes).join("\n");
}

function pdfHexField(bytes, name) {
  const text = Buffer.from(bytes).toString("latin1");
  const match = new RegExp(`/${name} <([0-9A-F]+)>`).exec(text);
  if (match === null) return undefined;
  const raw = Buffer.from(match[1], "hex").subarray(2);
  const swapped = Buffer.alloc(raw.length);
  for (let index = 0; index < swapped.length; index += 2) {
    swapped[index] = raw[index + 1];
    swapped[index + 1] = raw[index];
  }
  return swapped.toString("utf16le");
}

// --- Catalog ---

async function stepCatalog() {
  const { createAcceptanceCatalog, checkAcceptanceCoverage, AUTOMATED_P0_IDS } =
    await import("../dist/acceptance.js");
  const canonical = createAcceptanceCatalog();
  let onDisk;
  try {
    onDisk = JSON.parse(await readFile(join(ACCEPTANCE_DIR, "catalog.json"), "utf8"));
  } catch (error) {
    fail("P0-CLI-007", "canonical catalog is packaged", String(error));
    return;
  }
  check(
    "P0-CLI-007",
    "canonical catalog matches the source of truth",
    JSON.stringify(onDisk) === JSON.stringify(canonical),
    `azeforge.acceptance/v1 with ${canonical.entries.length} entries`,
  );
  const p0 = canonical.entries.filter((item) => item.gate === "p0");
  check("P0-CLI-007", "catalog covers every required P0 contract", p0.length === 30 && p0.every((item) => item.required), `${p0.length} P0 entries`);
  const ids = new Set(canonical.entries.map((item) => item.id));
  check("P0-CLI-007", "catalog IDs are unique", ids.size === canonical.entries.length, `${ids.size} unique IDs`);
  const coverage = checkAcceptanceCoverage(AUTOMATED_P0_IDS);
  check("P0-CLI-007", "coverage rejects missing and unknown IDs", coverage.missing.length === 0 && coverage.unknown.length === 0, `${AUTOMATED_P0_IDS.length} automated P0 IDs`);
  const unknown = checkAcceptanceCoverage([...AUTOMATED_P0_IDS, "P0-NOPE-000"]);
  check("P0-CLI-007", "coverage rejects unknown IDs", unknown.unknown.length === 1, unknown.unknown.join(","));
}

// --- Golden matrix ---

function assertGoldenHtml(id, html) {
  const failures = [];
  if (!/<h1/.test(html)) failures.push("h1");
  if ((html.match(/<h2/g) ?? []).length < 3) failures.push("h2x3");
  if ((html.match(/class="katex"/g) ?? []).length !== 3) failures.push("katex-x3");
  if ((html.match(/<math/g) ?? []).length !== 3) failures.push("mathml-x3");
  for (const eq of ["gaussian-integral", "arithmetic-series", "heat-equation"]) {
    if (!html.includes(`data-equation-id="${eq}"`)) failures.push(eq);
  }
  if (!/<figure class="aze-mermaid"/.test(html)) failures.push("mermaid");
  if (!html.includes('href="https://example.com/engineering-notation"')) failures.push("link");
  if (!/<table id="materials">[\s\S]*?<caption>Representative material properties/.test(html)) failures.push("caption");
  if (!/text-align:left/.test(html) || !/text-align:center/.test(html) || !/text-align:right/.test(html)) failures.push("align");
  return failures;
}

function countOccurrences(text, needle) {
  return text.split(needle).length - 1;
}

async function stepGoldenMatrix(live) {
  for (const theme of THEMES) {
    for (const format of FORMATS) {
      const cell = `${format}/${theme}`;
      let attempt;
      try {
        attempt = await renderFresh(GOLDEN_SOURCE, format, theme, "azeforge-acceptance-");
      } catch (error) {
        fail("P0-OUT-001", `golden renders ${cell}`, String(error).slice(0, 200));
        continue;
      }
      const { directory, report, bytes } = attempt;
      try {
        const artifact = report.artifact ?? {};
        check("P0-OUT-002", `${cell} manifest is truthful`, artifact.artifactHash === `sha256:${createHash("sha256").update(bytes).digest("hex")}` && artifact.byteLength === bytes.length, artifact.profile);
        live.golden[cell] = {
          contentHash: report.contentHash,
          assetManifestHash: artifact.assetManifestHash,
          rendererFingerprint: artifact.rendererFingerprint,
          artifactHash: artifact.artifactHash,
          byteLength: artifact.byteLength,
          profile: artifact.profile,
        };
        if (format === "html") {
          const html = bytes.toString("utf8");
          const failures = assertGoldenHtml(cell, html);
          check("P0-OUT-001", `${cell} carries every semantic object`, failures.length === 0, failures.join(",") || "h1,h2,equations,table,mermaid,link");
          const tampered = html.replace("gaussian-integral", "missing-integral");
          check("P0-OUT-001", `${cell} mismatch always fails`, assertGoldenHtml(cell, tampered).length > 0, "tampered id detected");
        }
        if (format === "svg") {
          const svg = bytes.toString("utf8");
          const failures = [];
          if (countOccurrences(svg, 'class="katex"') !== 3) failures.push("katex-x3");
          if (!svg.includes("aze-mermaid")) failures.push("mermaid");
          if (!/Representative material properties/.test(svg)) failures.push("caption");
          check("P0-OUT-001", `${cell} carries every semantic object`, failures.length === 0, failures.join(",") || "equations,mermaid,table");
        }
        if (format === "png") {
          const chunks = pngChunks(bytes);
          const types = chunks.map((chunk) => chunk.type).join(",");
          const srgb = chunks.find((chunk) => chunk.type === "sRGB");
          const ihdr = chunks[0].data;
          const width = (ihdr[0] << 24) + (ihdr[1] << 16) + (ihdr[2] << 8) + ihdr[3];
          const expectedWidth = report.artifact.cssDimensions.canvasWidthPx * 2;
          live.pngBytes[cell] = bytes;
          const profileOk = types === "IHDR,sRGB,IDAT,IEND" && ihdr[8] === 8 && srgb !== undefined && [...srgb.data][0] === 0;
          check("P0-OUT-001", `${cell} uses the exact sRGB profile`, profileOk, types);
          check("P0-OUT-001", `${cell} matches theme dimensions`, width === expectedWidth, `${width}px`);
          live.pngDimensions[cell] = { width, height: (ihdr[4] << 24) + (ihdr[5] << 16) + (ihdr[6] << 8) + ihdr[7] };
        }
        if (format === "pdf") {
          const failures = [];
          let pages = 0;
          try {
            pages = pdfPageCount(bytes);
          } catch {
            failures.push("pages");
          }
          if (pages < 1) failures.push("pages");
          const boxes = pdfMediaBoxes(bytes);
          if (boxes.length === 0 || boxes.some((box) => box.some((value) => !Number.isFinite(value) || value < 0))) failures.push("geometry");
          if (pdfHexField(bytes, "Title") !== "Engineering notation sampler") failures.push("title");
          if (pdfHexField(bytes, "Author") !== "AzeForge acceptance") failures.push("authors");
          if (!Buffer.from(bytes).toString("latin1").includes("https://example.com/engineering-notation")) failures.push("link");
          if (!Buffer.from(bytes).toString("latin1").includes("/Outlines")) failures.push("bookmarks");
          const content = pdfContentText(bytes);
          const textOps = (content.match(/\bT[Jj]\b/g) ?? []).length;
          if (textOps < 500) failures.push(`text-ops:${textOps}`);
          if ((bytes.toString("latin1").match(/\/ToUnicode/g) ?? []).length < 1) failures.push("table-text");
          check("P0-OUT-001", `${cell} carries title, authors, links, bookmarks, geometry, and page text`, failures.length === 0, failures.join(",") || `${pages} pages`);
        }
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }
  }
}

// --- Determinism ---

async function checkPair(id, label, first, second) {
  const a = first.report;
  const b = second.report;
  const identities = [
    a.contentHash === b.contentHash,
    a.artifact.assetManifestHash === b.artifact.assetManifestHash,
    a.artifact.rendererFingerprint === b.artifact.rendererFingerprint,
    a.artifact.artifactHash === b.artifact.artifactHash,
  ];
  check(id, `${label} builds share every identity`, identities.every(Boolean), a.artifact.artifactHash);
  check(id, `${label} bytes are equal`, Buffer.from(first.bytes).equals(Buffer.from(second.bytes)), `${first.bytes.length} bytes`);
}

async function stepDeterminism(live) {
  for (const format of FORMATS) {
    const themes = format === "html" ? THEMES : ["default"];
    for (const theme of themes) {
      const first = await renderFresh(GOLDEN_SOURCE, format, theme, "azeforge-det-a-");
      const second = await renderFresh(GOLDEN_SOURCE, format, theme, "azeforge-det-b-");
      try {
        await checkPair("P0-OUT-004", `${format}/${theme} same-fingerprint`, first, second);
        if (format === "png") {
          const compared = comparePng(first.bytes, second.bytes);
          check("P0-OUT-004", "png visual evidence is pixel-identical within approved bounds", compared.changedFraction === 0 && compared.ssim === 1, `ssim=${compared.ssim}`);
        }
      } finally {
        await rm(first.directory, { recursive: true, force: true });
        await rm(second.directory, { recursive: true, force: true });
      }
    }
  }
  for (const fixture of ["table-split.aze.md", "code-split.aze.md"]) {
    const first = await freshDir("azeforge-det-pag-a-");
    const second = await freshDir("azeforge-det-pag-b-");
    try {
      await cp(join(PAGINATION_DIR, fixture), join(first, "case.aze.md"));
      await cp(join(PAGINATION_DIR, fixture), join(second, "case.aze.md"));
      const renderA = runCli(["render", "case.aze.md", "--output", "case.pdf", "--diagnostics", "json"], first);
      const renderB = runCli(["render", "case.aze.md", "--output", "case.pdf", "--diagnostics", "json"], second);
      const reportA = parseReport(renderA, `${fixture} first`);
      const reportB = parseReport(renderB, `${fixture} second`);
      const bytesA = await readFile(join(first, "case.pdf"));
      const bytesB = await readFile(join(second, "case.pdf"));
      await checkPair("P0-OUT-004", `${fixture} same-fingerprint`, { report: reportA, bytes: bytesA }, { report: reportB, bytes: bytesB });
    } finally {
      await rm(first, { recursive: true, force: true });
      await rm(second, { recursive: true, force: true });
    }
  }
  void live;
}

// --- Identity mutation ---

async function renderSourceText(directory, sourceText, fileName, format, theme) {
  await writeFile(join(directory, fileName), sourceText);
  const out = `out.${EXTENSION[format]}`;
  const cliArgs = ["render", fileName, "--output", out, "--format", format, "--diagnostics", "json"];
  if (theme !== undefined) cliArgs.push("--theme", theme);
  const result = runCli(cliArgs, directory);
  const report = parseReport(result, "renderSourceText");
  return { report, bytes: await readFile(join(directory, out)) };
}

async function stepIdentities() {
  const golden = await readFile(GOLDEN_SOURCE, "utf8");
  const directory = await freshDir("azeforge-ident-");
  try {
    const base = await renderSourceText(directory, golden, "base.aze.md", "html", "default");
    const trivia = golden.replace("Measurement notes:", "Measurement notes:   \n");
    const triviaResult = await renderSourceText(directory, `${trivia}\n\n`, "trivia.aze.md", "html", "default");
    check("P0-OUT-004", "trivia-only edits preserve content identity", triviaResult.report.contentHash === base.report.contentHash, base.report.contentHash);
    check("P0-OUT-004", "trivia-only edits preserve artifact identity", triviaResult.report.artifact.artifactHash === base.report.artifact.artifactHash, "");
    const moved = join(directory, "nested", "moved.aze.md");
    await mkdir(join(directory, "nested"), { recursive: true });
    await writeFile(moved, golden);
    const movedOut = join(directory, "nested", "out.html");
    const movedResult = runCli(["render", moved, "--output", movedOut, "--format", "html", "--diagnostics", "json"], directory);
    const movedReport = parseReport(movedResult, "path move");
    check("P0-OUT-004", "path moves preserve content identity", movedReport.contentHash === base.report.contentHash, "");
    check("P0-OUT-004", "path moves preserve artifact identity", movedReport.artifact.artifactHash === base.report.artifact.artifactHash, "");
    const semantic = golden.replace("| Aluminum | 2700 | 205 |", "| Aluminum | 2710 | 205 |");
    const semanticResult = await renderSourceText(directory, semantic, "semantic.aze.md", "html", "default");
    check("P0-OUT-004", "semantic edits change content identity", semanticResult.report.contentHash !== base.report.contentHash, "");
    check("P0-OUT-004", "semantic edits change artifact identity", semanticResult.report.artifact.artifactHash !== base.report.artifact.artifactHash, "");
    const themed = await renderSourceText(directory, golden, "themed.aze.md", "html", "academic");
    check("P0-OUT-004", "theme changes preserve content identity", themed.report.contentHash === base.report.contentHash, "");
    check("P0-OUT-004", "theme changes change artifact identity", themed.report.artifact.artifactHash !== base.report.artifact.artifactHash, "");
    // Used-asset probe: identical prose, one byte changed in the used image.
    const logoA = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#ffffff"/></svg>`;
    const logoB = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#000000"/></svg>`;
    const probe = `---\nazemark: 1\ntitle: Asset probe\n---\n\n# Probe\n\n![logo](logo.svg)\n`;
    await writeFile(join(directory, "probe.aze.md"), probe);
    await writeFile(join(directory, "logo.svg"), logoA);
    const probeA = runCli(["render", "probe.aze.md", "--output", "a.html", "--format", "html", "--diagnostics", "json"], directory);
    const reportA = parseReport(probeA, "asset probe A");
    await writeFile(join(directory, "logo.svg"), logoB);
    const probeB = runCli(["render", "probe.aze.md", "--output", "b.html", "--format", "html", "--diagnostics", "json"], directory);
    const reportB = parseReport(probeB, "asset probe B");
    check("P0-OUT-004", "used-asset bytes change the manifest identity", reportA.artifact.assetManifestHash !== reportB.artifact.assetManifestHash, "");
    check("P0-OUT-004", "used-asset bytes preserve content identity", reportA.contentHash === reportB.contentHash, "");
    check("P0-OUT-004", "renderer fingerprint is stable and versioned", /^sha256:[0-9a-f]{64}$/.test(base.report.artifact.rendererFingerprint), base.report.artifact.rendererFingerprint.slice(0, 15));
    check("P0-OUT-004", "theme changes change the renderer configuration identity", themed.report.artifact.rendererFingerprint !== base.report.artifact.rendererFingerprint, "theme is a fingerprinted render option");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

// --- Pagination ---

async function stepPagination(live) {
  const cases = [
    { file: "keep-next.aze.md", min: 1, max: 1, id: "P0-OUT-003" },
    { file: "widows.aze.md", min: 1, max: 1, id: "P0-OUT-003" },
    { file: "table-split.aze.md", min: 2, max: 8, id: "P0-OUT-003" },
    { file: "code-split.aze.md", min: 2, max: 8, id: "P0-OUT-003" },
    { file: "atomic-scale.aze.md", min: 1, max: 1, id: "P0-OUT-003" },
    { file: "long-callout-split.aze.md", min: 2, max: 8, id: "P0-OUT-003" },
  ];
  for (const { file, min, max, id } of cases) {
    const directory = await freshDir("azeforge-pag-");
    try {
      await cp(join(PAGINATION_DIR, file), join(directory, "case.aze.md"));
      const result = runCli(["render", "case.aze.md", "--output", "case.pdf"], directory);
      if (result.status !== 0) {
        fail(id, `${file} renders`, result.stderr.toString("utf8").slice(0, 200));
        continue;
      }
      const bytes = await readFile(join(directory, "case.pdf"));
      const pages = pdfPageCount(bytes);
      const boxes = pdfMediaBoxes(bytes);
      const finite = boxes.length > 0 && boxes.every((box) => box.length === 4 && box.every((value) => Number.isFinite(value)) && box[0] >= 0 && box[1] >= 0 && box[2] > 0 && box[3] > 0);
      live.pagination[file] = pages;
      check(id, `${file} splits or keeps as specified`, pages >= min && pages <= max, `${pages} pages`);
      check(id, `${file} page boxes are finite and within bounds`, finite, boxes.map((box) => box.join("x")).join(","));
      const streams = pdfContentStreams(bytes);
      const carried = streams.length >= pages && streams.every((stream) => stream.length > 0);
      check(id, `${file} every page carries content`, carried, `${streams.length} streams over ${pages} pages`);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
  const over = await freshDir("azeforge-pag-over-");
  try {
    await cp(join(PAGINATION_DIR, "oversize-error.aze.md"), join(over, "case.aze.md"));
    await cp(join(PAGINATION_DIR, "tall.svg"), join(over, "tall.svg"));
    const result = runCli(["render", "case.aze.md", "--output", "case.pdf"], over);
    const stderr = result.stderr.toString("utf8");
    check("P0-OUT-003", "oversize atomic content errors instead of clipping", result.status === 1 && /artifact-limit/.test(stderr), `exit=${result.status}`);
    let committed = true;
    try {
      await stat(join(over, "case.pdf"));
    } catch {
      committed = false;
    }
    check("P0-CLI-001", "oversize failure commits no Artifact", result.status === 1 && committed === false, "");
  } finally {
    await rm(over, { recursive: true, force: true });
  }
}

// --- Modify / diagnose / repair loop ---

async function stepAuthorLoop(live) {
  const directory = await freshDir("azeforge-author-");
  try {
    const golden = await readFile(GOLDEN_SOURCE, "utf8");
    await writeFile(join(directory, "report.aze.md"), golden);
    const validate = (file) => runCli(["validate", file, "--diagnostics", "json"], directory);
    const render = (file, out, format = "html") =>
      runCli(["render", file, "--output", out, "--format", format, "--diagnostics", "json"], directory);

    const valid = validate("report.aze.md");
    check("P0-AUTHOR-001", "unchanged report validates", valid.status === 0, "");
    const first = render("report.aze.md", "first.html");
    const firstReport = parseReport(first, "unchanged render");
    const firstHash = firstReport.contentHash;
    const firstArtifact = firstReport.artifact.artifactHash;

    const edited = golden
      .replace("sum i=1..n of i = n (n + 1) / 2", "sum i=1..n of i^2 = n (n + 1) (2 n + 1) / 6")
      .replace("| Aluminum | 2700 | 205 |", "| Aluminum | 2710 | 205 |");
    await writeFile(join(directory, "report.aze.md"), edited);
    const editedRender = render("report.aze.md", "edited.html");
    const editedReport = parseReport(editedRender, "edited render");
    check("P0-AUTHOR-001", "equation and table edits change content identity", editedReport.contentHash !== firstHash, "");
    check("P0-AUTHOR-001", "equation and table edits change artifact identity", editedReport.artifact.artifactHash !== firstArtifact, "");
    const editedHtml = await readFile(join(directory, "edited.html"), "utf8");
    check("P0-AUTHOR-001", "edited report keeps every presence check", assertGoldenHtml("edited", editedHtml).length === 0, "");
    live.authorLoop = { before: firstHash, afterEdit: editedReport.contentHash };

    const broken = edited.replace("integral x=-infinity..infinity of exp(-x^2) dx = sqrt(pi)", "integral x=-infinity..infinity of exp(-x^2) = sqrt(pi)");
    await writeFile(join(directory, "report.aze.md"), broken);
    const brokenValidate = validate("report.aze.md");
    let brokenReport;
    try {
      brokenReport = JSON.parse(brokenValidate.stdout.toString("utf8"));
    } catch {
      brokenReport = undefined;
    }
    const diagnostic = brokenReport?.diagnostics?.[0];
    check("P0-AUTHOR-001", "missing dx fails validation", brokenValidate.status === 1, `exit=${brokenValidate.status}`);
    check(
      "P0-AUTHOR-001",
      "missing dx diagnoses the stable line-specific code",
      diagnostic?.code === "azeforge.equation#missing-integration-variable" &&
        Number.isInteger(diagnostic?.location?.range?.start?.line),
      diagnostic?.code ?? "no diagnostic",
    );
    const stale = await readFile(join(directory, "edited.html"));
    const brokenRender = render("report.aze.md", "edited.html");
    const after = await readFile(join(directory, "edited.html"));
    check("P0-AUTHOR-001", "failure commits no Artifact", brokenRender.status === 1 && Buffer.from(after).equals(Buffer.from(stale)), `exit=${brokenRender.status}`);

    await writeFile(join(directory, "report.aze.md"), edited);
    const restored = validate("report.aze.md");
    const restoredRender = render("report.aze.md", "restored.html");
    check("P0-AUTHOR-001", "restoration passes", restored.status === 0 && restoredRender.status === 0, "");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  void live;
}

// --- Visual bounds negative control ---

async function stepVisualBounds() {
  const first = await renderFresh(GOLDEN_SOURCE, "png", "default", "azeforge-vis-a-");
  const second = await renderFresh(GOLDEN_SOURCE, "png", "default", "azeforge-vis-b-");
  try {
    const compared = comparePng(first.bytes, second.bytes);
    check("P0-OUT-004", "repeat png passes the approved pixel and SSIM bounds", compared.dimensionsEqual && compared.changedFraction <= 0.001 && compared.ssim >= 0.999, `changed=${compared.changedFraction} ssim=${compared.ssim}`);
  } finally {
    await rm(first.directory, { recursive: true, force: true });
    await rm(second.directory, { recursive: true, force: true });
  }
  const directory = await freshDir("azeforge-vis-c-");
  try {
    const golden = await readFile(GOLDEN_SOURCE, "utf8");
    const reference = await renderSourceText(directory, golden, "ref.aze.md", "png", "default");
    const changed = golden.replaceAll("Engineering notation sampler", "Engineering notation SAMPLE");
    const altered = await renderSourceText(directory, changed, "alt.aze.md", "png", "default");
    const compared = comparePng(reference.bytes, altered.bytes);
    check("P0-OUT-001", "structural semantic mismatches always fail the visual bound", compared.changedFraction > 0.001 || compared.ssim < 0.999, `changed=${compared.changedFraction.toFixed(4)} ssim=${compared.ssim.toFixed(4)}`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

// --- Expected baselines ---

async function readExpected() {
  try {
    return JSON.parse(await readFile(EXPECTED_PATH, "utf8"));
  } catch {
    return undefined;
  }
}

function buildExpected(live, fingerprints) {
  return {
    schema: "azeforge.acceptance-expected/v1",
    tool: "azeforge",
    fingerprints,
    golden: live.golden,
    pngDimensions: live.pngDimensions,
    pagination: live.pagination,
    authorLoop: live.authorLoop,
  };
}

function diffExpected(oldExpected, next) {
  const lines = [];
  if (oldExpected === undefined) {
    lines.push("no previous expected.json; recording initial baselines");
    return lines;
  }
  for (const [cell, entry] of Object.entries(next.golden)) {
    const previous = oldExpected.golden?.[cell];
    if (previous?.artifactHash !== entry.artifactHash) {
      lines.push(`${cell}: artifact ${previous?.artifactHash ?? "none"} -> ${entry.artifactHash} (P0-OUT-001, P0-OUT-002)`);
    }
    if (previous?.rendererFingerprint !== entry.rendererFingerprint) {
      lines.push(`${cell}: fingerprint ${previous?.rendererFingerprint ?? "none"} -> ${entry.rendererFingerprint} (P0-OUT-004)`);
    }
  }
  for (const [file, pages] of Object.entries(next.pagination)) {
    if (oldExpected.pagination?.[file] !== pages) {
      lines.push(`${file}: pages ${oldExpected.pagination?.[file] ?? "none"} -> ${pages} (P0-OUT-003)`);
    }
  }
  return lines;
}

async function isCanonicalRefreshHost() {
  if (
    process.platform !== "linux" ||
    process.arch !== "x64" ||
    Number(process.versions.node.split(".")[0]) !== 24
  ) {
    return false;
  }
  try {
    const osRelease = await readFile("/etc/os-release", "utf8");
    return (
      /^ID=ubuntu$/m.test(osRelease) &&
      /^VERSION_ID="?24\.04"?$/m.test(osRelease)
    );
  } catch {
    return false;
  }
}

async function main() {
  if (REFRESH_MODE && process.env.CI !== undefined && process.env.CI !== "") {
    process.stderr.write("REFUSE --refresh under CI: baselines are developer-only.\n");
    process.exit(2);
  }
  if (REFRESH_MODE && !(await isCanonicalRefreshHost())) {
    process.stderr.write(
      "REFUSE --refresh outside Ubuntu 24.04 x64 with Node 24.\n",
    );
    process.exit(2);
  }
  const live = { golden: {}, pngDimensions: {}, pngBytes: {}, pagination: {}, authorLoop: {} };
  await stepCatalog();
  await stepGoldenMatrix(live);
  await stepDeterminism(live);
  await stepIdentities();
  await stepPagination(live);
  await stepAuthorLoop(live);
  await stepVisualBounds();

  const fingerprints = {};
  for (const [cell, entry] of Object.entries(live.golden)) {
    fingerprints[entry.rendererFingerprint] = true;
  }
  if (REFRESH_MODE) {
    const previous = await readExpected();
    const next = buildExpected(live, Object.keys(fingerprints));
    const diffs = diffExpected(previous, next);
    await writeFile(EXPECTED_PATH, `${JSON.stringify(next, null, 2)}\n`);
    await mkdir(EXPECTED_PNG_DIR, { recursive: true });
    for (const [cell, bytes] of Object.entries(live.pngBytes)) {
      await writeFile(join(EXPECTED_PNG_DIR, `${cell.replace("/", "-")}.png`), bytes);
    }
    for (const line of diffs) process.stderr.write(`DIFF ${line}\n`);
    if (diffs.length === 0) process.stderr.write("DIFF no baseline changes\n");
  } else {
    const expected = await readExpected();
    if (
      expected === undefined ||
      expected === null ||
      typeof expected !== "object" ||
      Array.isArray(expected)
    ) {
      fail(
        "P0-OUT-002",
        "approved baseline is available",
        "acceptance/expected.json is missing or invalid",
      );
    } else {
      const completeManifest = buildExpected(live, Object.keys(fingerprints));
      const manifestMatches = isDeepStrictEqual(expected, completeManifest);
      check(
        "P0-OUT-002",
        "approved evidence matches the complete live manifest",
        manifestMatches,
        manifestMatches
          ? "all manifest fields match"
          : "committed manifest fields differ",
      );
      const manifestFields = [
        "contentHash",
        "assetManifestHash",
        "rendererFingerprint",
        "artifactHash",
        "byteLength",
        "profile",
      ];
      for (const [cell, entry] of Object.entries(live.golden)) {
        const previous = expected.golden?.[cell];
        if (previous === undefined) {
          fail(
            "P0-OUT-002",
            `${cell} has an approved baseline`,
            "missing Golden cell",
          );
          continue;
        }
        const mismatches = manifestFields.filter(
          (field) => previous[field] !== entry[field],
        );
        check(
          "P0-OUT-002",
          `${cell} matches the approved manifest`,
          mismatches.length === 0,
          mismatches.length === 0
            ? entry.artifactHash
            : `mismatched fields: ${mismatches.join(", ")}`,
        );
        if (cell.startsWith("png/")) {
          let referenceDetail = "byte-identical";
          let referenceMatches = false;
          try {
            const reference = await readFile(
              join(EXPECTED_PNG_DIR, `${cell.replace("/", "-")}.png`),
            );
            referenceMatches = reference.equals(live.pngBytes[cell]);
            if (!referenceMatches) {
              const compared = comparePng(reference, live.pngBytes[cell]);
              referenceDetail = `changed=${compared.changedFraction.toFixed(4)} maxDelta=${compared.maxDelta} ssim=${compared.ssim.toFixed(4)} ${compared.width}x${compared.height}`;
            }
          } catch (error) {
            referenceDetail =
              error instanceof Error
                ? `invalid or missing PNG evidence: ${error.message}`
                : "invalid or missing PNG evidence";
          }
          check(
            "P0-OUT-002",
            `${cell} reference PNG matches live Artifact bytes`,
            referenceMatches,
            referenceDetail,
          );
        }
      }
      for (const [file, pages] of Object.entries(live.pagination)) {
        const expectedPages = expected.pagination?.[file];
        check(
          "P0-OUT-003",
          `${file} matches the approved pagination`,
          expectedPages === pages,
          expectedPages === undefined
            ? "approved pagination is missing"
            : `${pages} pages`,
        );
      }
    }
  }
  const failures = results.filter((result) => result.pass !== true);
  if (JSON_MODE) {
    process.stdout.write(`${JSON.stringify({ schema: "azeforge.acceptance-report/v1", failures: failures.length, results }, null, 2)}\n`);
  } else {
    process.stderr.write(`\n${results.length - failures.length}/${results.length} acceptance checks passed.\n`);
  }
  process.exit(failures.some((result) => result.pass !== true) ? 1 : 0);
}

await main();
