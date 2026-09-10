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
  getBuiltInRegistry,
  PDF_MAX_PAGES,
  PdfArtifactLimitError,
} from "../dist/adapters.js";
import { defaultTheme } from "../dist/index.js";
import { canonicalizePdf } from "../dist/render-pdf.js";

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
title: Probe report
author: ["Ada Lovelace", "Alan Turing"]
---

# Result

Ordered **semantic** content with a [link](https://example.com) and <mailto:a@b.c>.

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

function pdfText(bytes) {
  return Buffer.from(bytes).toString("latin1");
}

function contentText(bytes) {
  const text = pdfText(bytes);
  const out = [];
  const header = /(\d+) (\d+) obj/g;
  let match;
  while ((match = header.exec(text)) !== null) {
    const rest = text.slice(match.index, match.index + 8000);
    const streamAt = /stream(?:\r\n|\n|\r)/.exec(rest);
    if (streamAt === null || streamAt.index === undefined) continue;
    const dict = rest.slice(0, streamAt.index);
    if (!dict.includes("/FlateDecode")) continue;
    const length = /\/Length\s+(\d+)/.exec(dict);
    if (length === null || length[1] === undefined) continue;
    const start = match.index + streamAt.index + streamAt[0].length;
    try {
      out.push(inflateSync(bytes.subarray(start, start + Number(length[1]))).toString("latin1"));
    } catch {
      continue;
    }
  }
  return out.join("\n");
}

function trailerOf(text) {
  const trailerAt = text.lastIndexOf("trailer");
  const xrefAt = text.lastIndexOf("startxref");
  assert.ok(trailerAt !== -1 && xrefAt > trailerAt);
  return text.slice(trailerAt, xrefAt);
}

function infoBody(text) {
  const trailer = trailerOf(text);
  const infoRef = /\/Info\s+(\d+) (\d+) R/.exec(trailer);
  assert.ok(infoRef !== null, "The trailer must reference a document Info dictionary.");
  const body = new RegExp(`${infoRef[1]} ${infoRef[2]} obj([\\s\\S]*?)endobj`).exec(text);
  assert.ok(body !== null && body[1] !== undefined);
  return body[1];
}

function hexToText(hex) {
  const bytes = Buffer.from(hex, "hex");
  assert.equal(bytes[0], 0xfe);
  assert.equal(bytes[1], 0xff);
  const swapped = Buffer.alloc(bytes.length - 2);
  for (let index = 0; index < swapped.length; index += 2) {
    swapped[index] = bytes[index + 3];
    swapped[index + 1] = bytes[index + 2];
  }
  return swapped.toString("utf16le");
}
function infoField(body, name) {
  const match = new RegExp(`/${name} <([0-9A-F]+)>`).exec(body);
  assert.ok(match !== null && match[1] !== undefined, `Info must carry /${name}.`);
  return hexToText(match[1]);
}

function pageCountOf(text) {
  const match = /\/Type\s*\/Pages[\s\S]{0,300}?\/Count\s+(\d+)/.exec(text);
  assert.ok(match !== null && match[1] !== undefined);
  return Number(match[1]);
}

function mediaBoxes(text) {
  const boxes = [];
  for (const match of text.matchAll(/\/MediaBox\s*\[([^\]]*)\]/g)) {
    boxes.push(match[1].trim().split(/\s+/).map(Number));
  }
  return boxes;
}

function urisOf(text) {
  const uris = [];
  for (const match of text.matchAll(/\/URI\s*\(([^)]*)\)/g)) {
    uris.push(match[1]);
  }
  return uris;
}

function outlineTitles(text) {
  const titles = [];
  for (const match of text.matchAll(/\/Title\s*\(([^)]*)\)/g)) {
    titles.push(match[1]);
  }
  return titles;
}

test("CLI renders one deterministic paged PDF Artifact", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-pdf-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "report.aze.md"), SOURCE);

  const explicit = runCli(
    [
      "render",
      "report.aze.md",
      "--output",
      "explicit.pdf",
      "--format",
      "pdf",
      "--diagnostics",
      "json",
    ],
    directory,
  );
  assert.equal(explicit.status, 0, explicit.stderr.toString("utf8"));
  assert.deepEqual(explicit.stderr, Buffer.alloc(0));
  const report = JSON.parse(explicit.stdout.toString("utf8"));
  assert.equal(report.artifact.format, "pdf");
  assert.equal(report.artifact.mimeType, "application/pdf");
  assert.equal(report.artifact.profile, "azeforge.pdf.paged/v1");
  assert.deepEqual(report.artifact.requiredCapabilities, ["pdf-paged"]);
  assert.equal(report.artifact.pageCount, 1);
  assert.deepEqual(report.artifact.pageGeometry, {
    widthPt: 594.96,
    heightPt: 841.92,
    marginPt: 51.024,
  });
  assert.deepEqual(report.artifact.cssDimensions, defaultTheme.geometry);

  const inferred = runCli(["render", "report.aze.md", "--output", "inferred.pdf"], directory);
  assert.equal(inferred.status, 0, inferred.stderr.toString("utf8"));
  const first = await readFile(join(directory, "explicit.pdf"));
  const second = await readFile(join(directory, "inferred.pdf"));
  assert.deepEqual(second, first);
  assert.equal(
    report.artifact.artifactHash,
    `sha256:${createHash("sha256").update(first).digest("hex")}`,
  );

  const text = pdfText(first);
  assert.ok(text.startsWith("%PDF-"));
  assert.ok(text.trimEnd().endsWith("%%EOF"));
  assert.equal(text.includes("CreationDate"), false);
  assert.equal(text.includes("ModDate"), false);
  const trailer = trailerOf(text);
  assert.match(trailer, /\/ID\s*\[<[0-9a-f]{32}><[0-9a-f]{32}>\]/);
  const body = infoBody(text);
  assert.equal(infoField(body, "Title"), "Probe report");
  assert.equal(infoField(body, "Author"), "Ada Lovelace, Alan Turing");
  assert.match(body, /\/Creator \(AzeForge\)/);
  assert.match(body, /\/Producer \(AzeForge pdf\/1\.0\.0 \\\(HeadlessChrome\//);
});

test("PDF preserves equations, diagrams, and callouts through pdf adapters", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-pdf-blocks-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(
    join(directory, "report.aze.md"),
    `---\nazemark: 2\ntitle: Blocks\n---\n\n# Blocks\n\n:::: callout\nvariant: note\ntitle: A note\n----\nKeep this together.\n::::\n\n:::: equation\nid: pythagoras\n----\na^2 + b^2 = c^2\n::::\n\n:::: mermaid\nid: loop\ntitle: Loop\ndescription: A tiny loop\n----\nflowchart TD\n  a[Start] --> b[End]\n::::\n`,
  );
  const result = runCli(["render", "report.aze.md", "--output", "report.pdf"], directory);
  assert.equal(result.status, 0, result.stderr.toString("utf8"));
  const bytes = await readFile(join(directory, "report.pdf"));
  assert.ok(pageCountOf(pdfText(bytes)) >= 1);
  assert.ok(contentText(bytes).includes("BT"));
  assert.ok(outlineTitles(pdfText(bytes)).includes("Blocks"));
  const again = runCli(["render", "report.aze.md", "--output", "again.pdf"], directory);
  assert.equal(again.status, 0, again.stderr.toString("utf8"));
  assert.deepEqual(await readFile(join(directory, "again.pdf")), bytes);
});

test("PDF preserves theme geometry, links, bookmarks, and selectable text", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-pdf-content-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "report.aze.md"), SOURCE);
  const result = runCli(["render", "report.aze.md", "--output", "report.pdf"], directory);
  assert.equal(result.status, 0, result.stderr.toString("utf8"));
  const bytes = await readFile(join(directory, "report.pdf"));
  const text = pdfText(bytes);
  const content = contentText(bytes);
  const boxes = mediaBoxes(text);
  assert.ok(boxes.length >= 1);
  for (const box of boxes) {
    assert.ok(Math.abs(box[2] - 595.276) < 0.5, `width ${box[2]}`);
    assert.ok(Math.abs(box[3] - 841.89) < 0.5, `height ${box[3]}`);
  }

  const uris = urisOf(text);
  assert.ok(uris.includes("https://example.com/"), JSON.stringify(uris));
  assert.ok(uris.includes("mailto:a@b.c"), JSON.stringify(uris));
  assert.equal(
    uris.some((uri) => /^(javascript|data|vbscript|file|ftp):/i.test(uri)),
    false,
  );

  const titles = outlineTitles(text);
  assert.ok(titles.includes("Result"), JSON.stringify(titles));
  assert.ok(titles.includes("Results"), JSON.stringify(titles));

  assert.ok(text.includes("/Font"), "Text must reference embedded fonts.");
  assert.ok(content.includes("BT"), "Text must use text blocks.");
  assert.ok(/T[Jj]/.test(content), "Text must use text-showing operators.");
});

test("canonicalizePdf is deterministic, idempotent, and bounded", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-pdf-canon-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "report.aze.md"), SOURCE);
  const result = runCli(["render", "report.aze.md", "--output", "report.pdf"], directory);
  assert.equal(result.status, 0, result.stderr.toString("utf8"));
  const raw = await readFile(join(directory, "report.pdf"));

  const identity = {
    title: "Probe report",
    authors: ["Ada Lovelace", "Alan Turing"],
    documentId: "0".repeat(32),
  };
  const once = canonicalizePdf(raw, identity);
  const twice = canonicalizePdf(once.bytes, identity);
  assert.deepEqual(Buffer.from(twice.bytes), Buffer.from(once.bytes));
  assert.equal(twice.pageCount, once.pageCount);
  assert.equal(once.pageCount, 1);

  const renamed = canonicalizePdf(raw, { ...identity, title: "Other title" });
  assert.notDeepEqual(Buffer.from(renamed.bytes), Buffer.from(once.bytes));

  const patched = pdfText(raw).replace(/\/Count\s+1/, `/Count ${PDF_MAX_PAGES + 1}`);
  assert.throws(() => canonicalizePdf(Buffer.from(patched, "latin1"), identity), (error) => {
    assert.ok(error instanceof PdfArtifactLimitError);
    return true;
  });
});

test("pagination splits tables and code while dark sections break on headings", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-pdf-pages-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const rows = Array.from({ length: 60 }, (_, index) => `| Row ${index} | ${index} N |`).join("\n");
  const code = Array.from({ length: 80 }, (_, index) => `line ${index}`).join("\n");
  const long = `# Long report\n\n| Name | Value |\n| --- | ---: |\n${rows}\n\n\`\`\`text\n${code}\n\`\`\`\n`;
  await writeFile(join(directory, "long.aze.md"), `---\nazemark: 2\ntitle: Long\n---\n\n${long}`);

  const result = runCli(["render", "long.aze.md", "--output", "long.pdf"], directory);
  assert.equal(result.status, 0, result.stderr.toString("utf8"));
  assert.ok(pageCountOf(pdfText(await readFile(join(directory, "long.pdf")))) >= 2);

  const sections = `# First\n\nOpening text.\n\n# Second\n\nMiddle text.\n\n# Third\n\nClosing text.\n`;
  await writeFile(join(directory, "sections.aze.md"), `---\nazemark: 2\ntitle: Sections\n---\n\n${sections}`);
  const dark = runCli(
    ["render", "sections.aze.md", "--output", "dark.pdf", "--theme", "dark-presentation"],
    directory,
  );
  assert.equal(dark.status, 0, dark.stderr.toString("utf8"));
  const darkText = pdfText(await readFile(join(directory, "dark.pdf")));
  assert.ok(pageCountOf(darkText) >= 3);
  for (const box of mediaBoxes(darkText)) {
    assert.ok(Math.abs(box[2] - 960) < 0.5, `width ${box[2]}`);
    assert.ok(Math.abs(box[3] - 540) < 0.5, `height ${box[3]}`);
  }
});

test("oversized atomic content fails closed without partial output", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-pdf-atomic-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(
    join(directory, "tall.svg"),
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="3000" viewBox="0 0 400 3000"><rect width="400" height="3000" fill="#ffffff"/></svg>`,
  );
  await writeFile(
    join(directory, "report.aze.md"),
    `---\nazemark: 2\ntitle: Tall\n---\n\n# Tall\n\n![tall graphic](tall.svg)\n`,
  );
  const result = runCli(["render", "report.aze.md", "--output", "report.pdf"], directory);
  assert.equal(result.status, 1, result.stderr.toString("utf8"));
  assert.deepEqual(result.stdout, Buffer.alloc(0));
  assert.match(result.stderr.toString("utf8"), /artifact-limit/);
  await assert.rejects(readFile(join(directory, "report.pdf")));
});

test("a missing browser fails closed with a reinstall remedy while HTML remains usable", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-pdf-engine-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "report.aze.md"), SOURCE);
  const withoutEngine = { env: { ...process.env, HOME: directory } };

  const pdfResult = runCli(
    ["render", "report.aze.md", "--output", "report.pdf"],
    directory,
    withoutEngine,
  );
  assert.equal(pdfResult.status, 1, pdfResult.stderr.toString("utf8"));
  assert.deepEqual(pdfResult.stdout, Buffer.alloc(0));
  assert.match(pdfResult.stderr.toString("utf8"), /browser-unavailable/);
  assert.match(pdfResult.stderr.toString("utf8"), /Reinstall AzeForge browser dependencies/);
  await assert.rejects(readFile(join(directory, "report.pdf")));

  const htmlResult = runCli(
    ["render", "report.aze.md", "--output", "report.html"],
    directory,
    withoutEngine,
  );
  assert.equal(htmlResult.status, 0, htmlResult.stderr.toString("utf8"));
  assert.match(await readFile(join(directory, "report.html"), "utf8"), /^<!doctype html>\n/);
});

test("azeforge render --stdout writes only exact PDF Artifact bytes", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-pdf-stdout-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "report.aze.md"), SOURCE);

  const result = runCli(["render", "report.aze.md", "--stdout", "--format", "pdf"], directory);
  assert.equal(result.status, 0, result.stderr.toString("utf8"));
  assert.deepEqual(result.stderr, Buffer.alloc(0));

  const fileResult = runCli(["render", "report.aze.md", "--output", "report.pdf"], directory);
  assert.equal(fileResult.status, 0);
  assert.deepEqual(result.stdout, await readFile(join(directory, "report.pdf")));
});

test("binary PDF stdout refuses an interactive terminal", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-pdf-tty-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "report.aze.md"), SOURCE);
  let result;
  try {
    result = spawnSync(
      "script",
      ptyArguments([process.execPath, CLI_PATH, "render", "report.aze.md", "--stdout", "--format", "pdf"]),
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
  assert.equal(result.stdout.subarray(0, 5).equals(Buffer.from("%PDF-")), false);
});

test("PDF capabilities describe the paged browser profile", () => {
  const pdfRenderer = getBuiltInRegistry().renderers.find(({ id }) => id === "pdf");
  assert.deepEqual(pdfRenderer?.capabilities, ["browser"]);
  assert.deepEqual(pdfRenderer?.formats, ["pdf"]);
  const pdfBlocks = getBuiltInRegistry().blockRenderers.filter(
    ({ descriptor }) => descriptor.rendererId === "pdf",
  );
  assert.equal(pdfBlocks.length, 11);
});
