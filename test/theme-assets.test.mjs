import assert from "node:assert/strict";
import { cp, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { deflateSync } from "node:zlib";
import test from "node:test";

import { academicTheme, createCompiler, darkPresentationTheme } from "../dist/index.js";

const CLI_PATH = new URL("../dist/cli.js", import.meta.url);

// --- Minimal binary builders (self-contained, no fixtures on disk) ---

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(data.length, 0);
  header.write(type, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 0);
  return Buffer.concat([header, data, crc]);
}

function makePng(width, height, { animated = false } = {}) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolor
  const raw = Buffer.alloc(height * (1 + width * 3), 0);
  const parts = [
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
  ];
  if (animated) {
    const actl = Buffer.alloc(8);
    actl.writeUInt32BE(1, 0);
    actl.writeUInt32BE(0, 4);
    parts.push(chunk("acTL", actl));
  }
  parts.push(chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0)));
  return Buffer.concat(parts);
}

function makeJpeg(width, height) {
  const sof = Buffer.from([
    0xff, 0xc0, 0x00, 0x0b, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x01, 0x01, 0x11, 0x00,
  ]);
  return Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
    Buffer.from("JFIF\0", "ascii"),
    Buffer.from([0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]),
    sof,
    Buffer.from([0xff, 0xd9]),
  ]);
}

const VALID_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60">` +
  `<rect width="120" height="60" fill="#123456"/></svg>`;

async function makeProject(files) {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-theme-assets-"));
  for (const [name, bytes] of Object.entries(files)) {
    await mkdir(join(directory, "figures"), { recursive: true });
    await writeFile(join(directory, name), bytes);
  }
  return directory;
}

const PROSE = `---
azemark: 1
title: Project report
---

# Overview

Body text with coverage.
`;

test("built-in themes report fixed versions", () => {
  assert.deepEqual(
    [academicTheme, darkPresentationTheme].map(({ id, version }) => ({ id, version })),
    [
      { id: "academic", version: "1.0.0" },
      { id: "dark-presentation", version: "1.0.0" },
    ],
  );
});

test("every theme renders deterministic canonical CSS with bundled fonts", async () => {
  const compiler = createCompiler();
  const seen = new Map();
  for (const theme of ["default", "academic", "dark-presentation"]) {
    const first = await compiler.compile(PROSE, { format: "html", theme });
    const second = await compiler.compile(PROSE, { format: "html", theme });
    assert.deepEqual(first.diagnostics, []);
    assert.ok(first.artifact);
    assert.deepEqual(first.artifact.bytes, second.artifact?.bytes);
    const html = Buffer.from(first.artifact.bytes).toString("utf8");
    assert.match(html, /@font-face\{font-family:Inter;/);
    assert.doesNotMatch(html, /<script\b/i);
    assert.match(
      html,
      /<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:">/,
    );
    assert.deepEqual(first.artifact.metadata.theme, { id: theme, version: "1.0.0" });
    seen.set(theme, html);
  }
  assert.notEqual(seen.get("default"), seen.get("academic"));
  assert.notEqual(seen.get("default"), seen.get("dark-presentation"));
  assert.match(seen.get("dark-presentation"), /color-scheme:dark/);
  assert.match(seen.get("default"), /color-scheme:light/);
  assert.match(seen.get("academic"), /color-scheme:light/);
});

test("theme selection follows CLI option, metadata, then default", async () => {
  const compiler = createCompiler();
  const withMetadata = `---\nazemark: 1\ntheme: academic\n---\n\n# T\n\nBody.\n`;
  const metadataOnly = await compiler.compile(withMetadata, { format: "html" });
  assert.equal(metadataOnly.artifact?.metadata.theme.id, "academic");
  const override = await compiler.compile(withMetadata, {
    format: "html",
    theme: "dark-presentation",
  });
  assert.equal(override.artifact?.metadata.theme.id, "dark-presentation");
  const fallback = await compiler.compile(`# T\n\nBody.\n`, { format: "html" });
  assert.equal(fallback.artifact?.metadata.theme.id, "default");
});

test("unknown or disabled themes fail without an artifact", async () => {
  const missing = await createCompiler().compile(PROSE, {
    format: "html",
    theme: "missing",
  });
  assert.equal(missing.artifact, undefined);
  assert.deepEqual(
    missing.diagnostics.map(({ code }) => code),
    ["azeforge.renderer#unknown-theme"],
  );
  const disabled = await createCompiler({
    policy: { disabledThemeIds: ["academic"] },
  }).compile(PROSE, { format: "html", theme: "academic" });
  assert.equal(disabled.artifact, undefined);
  assert.deepEqual(
    disabled.diagnostics.map(({ code }) => code),
    ["azeforge.renderer#disabled-theme"],
  );
});

test("project images embed as data and hash only used assets", async (context) => {
  const directory = await makeProject({
    "report.aze.md":
      `${PROSE}\n![plot](figures/plot.png)\n\n![logo](figures/logo.svg)\n\n![photo](figures/photo.jpg)\n`,
    "figures/plot.png": makePng(4, 3),
    "figures/logo.svg": VALID_SVG,
    "figures/photo.jpg": makeJpeg(8, 6),
    "figures/unused.png": makePng(2, 2),
  });
  context.after(() => rm(directory, { recursive: true, force: true }));
  const source = await readFile(join(directory, "report.aze.md"), "utf8");
  const compiler = createCompiler();

  const first = await compiler.compile(source, {
    format: "html",
    projectRoot: directory,
  });
  assert.deepEqual(first.diagnostics, []);
  assert.ok(first.artifact);
  const html = Buffer.from(first.artifact.bytes).toString("utf8");
  assert.match(html, /<img src="data:image\/png;base64,/);
  assert.match(html, /<img src="data:image\/svg\+xml;base64,/);
  assert.match(html, /<img src="data:image\/jpeg;base64,/);
  assert.doesNotMatch(html, /figures\//);
  assert.doesNotMatch(html, new RegExp(directory.replaceAll("/", "\\/")));
  assert.match(
    first.artifact.metadata.assetManifestHash,
    /^sha256:[a-f0-9]{64}$/,
  );
  assert.notEqual(
    first.artifact.metadata.assetManifestHash,
    "sha256:4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
  );

  await writeFile(join(directory, "figures/unused.png"), makePng(3, 3));
  const afterUnused = await compiler.compile(source, {
    format: "html",
    projectRoot: directory,
  });
  assert.equal(
    afterUnused.artifact?.metadata.assetManifestHash,
    first.artifact.metadata.assetManifestHash,
  );

  await writeFile(join(directory, "figures/plot.png"), makePng(5, 3));
  const afterUsed = await compiler.compile(source, {
    format: "html",
    projectRoot: directory,
  });
  assert.notEqual(
    afterUsed.artifact?.metadata.assetManifestHash,
    first.artifact.metadata.assetManifestHash,
  );
});

test("images inside callout titles embed as data", async (context) => {
  const directory = await makeProject({
    "report.aze.md":
      `${PROSE}\n::::: callout\nvariant: note\ntitle: ![badge](figures/plot.png)\n\nBody.\n:::::\n`,
    "figures/plot.png": makePng(4, 3),
  });
  context.after(() => rm(directory, { recursive: true, force: true }));
  const result = await createCompiler().compile(
    await readFile(join(directory, "report.aze.md"), "utf8"),
    { format: "html", projectRoot: directory },
  );
  assert.deepEqual(result.diagnostics, []);
  const html = Buffer.from(result.artifact?.bytes ?? new Uint8Array()).toString("utf8");
  assert.match(html, /<p class="aze-callout-title"><img src="data:image\/png;base64,/);
  assert.doesNotMatch(html, /figures\//);
});

test("moved projects render byte-identical artifacts", async (context) => {
  const firstDir = await makeProject({
    "report.aze.md": `${PROSE}\n![plot](figures/plot.png)\n`,
    "figures/plot.png": makePng(4, 3),
  });
  const secondDir = await mkdtemp(join(tmpdir(), "azeforge-moved-"));
  context.after(() => rm(firstDir, { recursive: true, force: true }));
  context.after(() => rm(secondDir, { recursive: true, force: true }));
  await cp(join(firstDir, "report.aze.md"), join(secondDir, "report.aze.md"));
  await mkdir(join(secondDir, "figures"), { recursive: true });
  await cp(join(firstDir, "figures/plot.png"), join(secondDir, "figures/plot.png"));

  const compiler = createCompiler();
  const first = await compiler.compile(await readFile(join(firstDir, "report.aze.md"), "utf8"), {
    format: "html",
    projectRoot: firstDir,
  });
  const second = await compiler.compile(
    await readFile(join(secondDir, "report.aze.md"), "utf8"),
    { format: "html", projectRoot: secondDir },
  );
  assert.deepEqual(second.artifact?.bytes, first.artifact?.bytes);
  assert.equal(second.contentHash, first.contentHash);
});

test("image abuse fails before artifact publication", async (context) => {
  const outside = await mkdtemp(join(tmpdir(), "azeforge-outside-"));
  context.after(() => rm(outside, { recursive: true, force: true }));
  await writeFile(join(outside, "secret.png"), makePng(2, 2));
  const directory = await makeProject({
    "figures/real.png": makePng(2, 2),
    "figures/fake.png": makeJpeg(8, 8),
    "figures/truncated.png": makePng(4, 4).subarray(0, 40),
    "figures/moving.png": makePng(2, 2, { animated: true }),
    "figures/active.svg": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><script>alert(1)</script></svg>`,
    "figures/remote.svg": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><image href="https://example.com/x.png"/></svg>`,
    "figures/frames.svg": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><style>@keyframes spin{to{transform:rotate(360deg)}}.a{animation:spin 1s linear infinite}</style><rect class="a" width="10" height="10"/></svg>`,
    "figures/sibling.svg": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><image href="other.png" width="10" height="10"/></svg>`,
  });
  await symlink(
    join(outside, "secret.png"),
    join(directory, "figures/escape.png"),
  );
  const compiler = createCompiler();
  const cases = {
    "![a](https://example.com/x.png)": "azeforge.asset#unsupported-type",
    "![a](data:image/png;base64,iVBORw0KGgo=)": "azeforge.link#unsafe-protocol",
    "![a](figures/anim.gif)": "azeforge.asset#unsupported-type",
    "![a](/absolute.png)": "azeforge.asset#path-escape",
    "![a](../outside.png)": "azeforge.asset#path-escape",
    "![a](figures/escape.png)": "azeforge.asset#path-escape",
    "![a](figures/gone.png)": "azeforge.asset#unreadable",
    "![a](figures/fake.png)": "azeforge.asset#mime-mismatch",
    "![a](figures/active.svg)": "azeforge.asset#active-content",
    "![a](figures/remote.svg)": "azeforge.asset#external-resource",
    "![a](figures/frames.svg)": "azeforge.asset#animated",
    "![a](figures/sibling.svg)": "azeforge.asset#external-resource",
  };
  for (const [image, code] of Object.entries(cases)) {
    const result = await compiler.compile(`${PROSE}\n${image}\n`, {
      format: "html",
      projectRoot: directory,
    });
    assert.equal(result.artifact, undefined, image);
    assert.deepEqual(
      result.diagnostics.map(({ code: actual }) => actual),
      [code],
      image,
    );
  }
  const rootless = await compiler.compile(`${PROSE}\n![a](figures/real.png)\n`, {
    format: "html",
  });
  assert.equal(rootless.artifact, undefined);
  assert.deepEqual(
    rootless.diagnostics.map(({ code }) => code),
    ["azeforge.asset#root-required"],
  );
});

test("decompression bombs fail before artifact publication", async (context) => {
  const directory = await makeProject({
    "figures/huge.png": makePng(12000, 2),
  });
  context.after(() => rm(directory, { recursive: true, force: true }));
  const result = await createCompiler().compile(`${PROSE}\n![a](figures/huge.png)\n`, {
    format: "html",
    projectRoot: directory,
  });
  assert.equal(result.artifact, undefined);
  assert.deepEqual(
    result.diagnostics.map(({ code }) => code),
    ["azeforge.asset#decompression-bomb"],
  );
});

test("titles resolve from metadata, first heading, then fallback", async () => {
  const compiler = createCompiler();
  const metadata = await compiler.compile(
    `---\nazemark: 1\ntitle: Chosen\n---\n\n# Heading\n\nBody.\n`,
    { format: "html" },
  );
  assert.match(
    Buffer.from(metadata.artifact?.bytes ?? new Uint8Array()).toString("utf8"),
    /<title>Chosen<\/title>/,
  );
  const heading = await compiler.compile(`# First\n\nBody.\n`, { format: "html" });
  assert.match(
    Buffer.from(heading.artifact?.bytes ?? new Uint8Array()).toString("utf8"),
    /<title>First<\/title>/,
  );
  const fallback = await compiler.compile(`Body without a heading.\n`, {
    format: "html",
  });
  assert.match(
    Buffer.from(fallback.artifact?.bytes ?? new Uint8Array()).toString("utf8"),
    /<title>AzeForge document<\/title>/,
  );
});

test("CLI renders rooted projects under every theme", async (context) => {
  const directory = await makeProject({
    "report.aze.md": `${PROSE}\n![plot](figures/plot.png)\n`,
    "figures/plot.png": makePng(4, 3),
  });
  context.after(() => rm(directory, { recursive: true, force: true }));
  for (const theme of ["default", "academic", "dark-presentation"]) {
    const result = spawnSync(
      process.execPath,
      [
        CLI_PATH.pathname,
        "render",
        "report.aze.md",
        "--output",
        `report-${theme}.html`,
        "--theme",
        theme,
      ],
      { cwd: directory, encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    const html = await readFile(join(directory, `report-${theme}.html`), "utf8");
    assert.match(html, /<img src="data:image\/png;base64,/);
    assert.doesNotMatch(html, /<script\b/i);
  }
});
