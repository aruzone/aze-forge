import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { SaxesParser } from "saxes";
import {
  createCompiler,
  defaultTheme,
  getBuiltInRegistry,
  sanitizeWholeDocumentSvg,
} from "../dist/index.js";

const CLI_PATH = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const SOURCE = `---
azemark: 2
title: SVG report
---

# Result

Ordered **semantic** content with [details](#azeforge-svg-title) and \`button onclick=handler\`.

:::: callout
id: azeforge-svg-title
variant: note
----
Renderer and author identifiers remain separate.
::::

## Results

| Quantity | Value |
| --- | ---: |
| Force | 12 N |
`;

function runCli(arguments_, cwd) {
  return spawnSync(process.execPath, [CLI_PATH, ...arguments_], {
    cwd,
    encoding: null,
  });
}

function parseXml(xml) {
  const elements = [];
  const parser = new SaxesParser({ xmlns: true });
  parser.on("opentag", (tag) => elements.push(tag));
  parser.write(xml).close();
  return elements;
}

test("CLI renders one deterministic whole-Document SVG Artifact", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-svg-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "report.aze.md"), SOURCE);

  const explicit = runCli(
    [
      "render",
      "report.aze.md",
      "--output",
      "explicit.svg",
      "--format",
      "svg",
      "--diagnostics",
      "json",
    ],
    directory,
  );
  assert.equal(explicit.status, 0, explicit.stderr.toString("utf8"));
  assert.deepEqual(explicit.stderr, Buffer.alloc(0));
  const report = JSON.parse(explicit.stdout.toString("utf8"));
  assert.equal(report.artifact.format, "svg");
  assert.equal(report.artifact.mimeType, "image/svg+xml");
  assert.equal(report.artifact.profile, "azeforge.svg.foreign-object/v1");

  const inferred = runCli(
    ["render", "report.aze.md", "--output", "inferred.svg"],
    directory,
  );
  assert.equal(inferred.status, 0, inferred.stderr.toString("utf8"));
  const first = await readFile(join(directory, "explicit.svg"));
  const second = await readFile(join(directory, "inferred.svg"));
  assert.deepEqual(second, first);
  assert.equal(
    report.artifact.artifactHash,
    `sha256:${createHash("sha256").update(first).digest("hex")}`,
  );

  const svg = first.toString("utf8");
  const elements = parseXml(svg);
  assert.equal(elements[0]?.uri, "http://www.w3.org/2000/svg");
  assert.equal(elements.filter(({ local }) => local === "foreignObject").length, 1);
  assert.equal(
    elements.find(({ local }) => local === "html")?.uri,
    "http://www.w3.org/1999/xhtml",
  );
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" /);
  assert.match(svg, /role="img" aria-labelledby="azeforge:svg:title azeforge:svg:desc"/);
  assert.match(svg, /<title id="azeforge:svg:title">SVG report<\/title>/);
  assert.match(svg, /id="azeforge-svg-title"/);
  assert.match(svg, /<h1>Result<\/h1>.*<table>/s);
  assert.doesNotMatch(svg, /<script\b/i);
  assert.doesNotMatch(svg, /\b(?:src|href)="(?:https?:|file:|\/)/i);

  const root = elements[0];
  const width = Number(root?.attributes.width?.value);
  const height = Number(root?.attributes.height?.value);
  assert.ok(Number.isFinite(width) && width > 0);
  assert.ok(Number.isFinite(height) && height > 0);
  assert.equal(root?.attributes.viewBox?.value, `0 0 ${width} ${height}`);
});

test("SVG capabilities and final sanitizer fail closed", async () => {
  const svgRenderer = getBuiltInRegistry().renderers.find(({ id }) => id === "svg");
  assert.deepEqual(svgRenderer?.capabilities, ["browser"]);
  assert.throws(
    () =>
      sanitizeWholeDocumentSvg(
        '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><html xmlns="http://www.w3.org/1999/xhtml"><body><svg xmlns="http://www.w3.org/2000/svg"><foreignObject/></svg></body></html></foreignObject></svg>',
      ),
    /Only the Renderer-owned root foreignObject is permitted/,
  );
  const withoutHtmlRenderer = await createCompiler({
    policy: { disabledRendererIds: ["html"] },
  }).compile(SOURCE, { format: "svg" });
  assert.deepEqual(withoutHtmlRenderer.diagnostics, []);
  assert.equal(withoutHtmlRenderer.artifact?.metadata.format, "svg");
});

test("SVG preserves equations, images, and strictly sanitized Mermaid graphics", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-svg-content-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(
    join(directory, "figure.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10"><rect width="20" height="10" fill="#123456"/></svg>',
  );
  await writeFile(
    join(directory, "technical.aze.md"),
    `---
azemark: 2
title: Technical SVG
---

# Technical content

![Embedded plot](figure.svg)

:::: equation
id: force
----
F = m * a
::::

:::: mermaid
id: process
----
flowchart LR
  input[Input] --> result[Result]
::::
`,
  );

  const result = runCli(
    [
      "render",
      "technical.aze.md",
      "--output",
      "technical.svg",
      "--diagnostics",
      "json",
    ],
    directory,
  );
  assert.equal(result.status, 0, result.stderr.toString("utf8"));
  const report = JSON.parse(result.stdout.toString("utf8"));
  assert.deepEqual(report.diagnostics, []);
  assert.deepEqual(report.artifact.requiredCapabilities, [
    "svg2",
    "xhtml-foreign-object",
  ]);

  const svg = await readFile(join(directory, "technical.svg"), "utf8");
  const elements = parseXml(svg);
  assert.equal(elements.filter(({ local }) => local === "foreignObject").length, 1);
  assert.ok(elements.filter(({ local }) => local === "svg").length >= 2);
  assert.match(svg, /class="katex"/);
  assert.match(svg, /<math/);
  assert.match(svg, /<figure class="aze-mermaid"/);
  assert.match(svg, /<title id="aze-m-0-title">/);
  assert.match(svg, /src="data:image\/svg\+xml;base64,/);
  assert.match(
    svg,
    /&quot;requiredCapabilities&quot;:\[&quot;svg2&quot;,&quot;xhtml-foreign-object&quot;\]/,
  );
  assert.doesNotMatch(svg, /figure\.svg/);
  assert.doesNotMatch(svg, /<script\b|\son[a-z]+=/i);
});

test("non-positive canvas width fails closed before any Artifact", () => {
  const zeroWidth = {
    ...defaultTheme,
    geometry: { ...defaultTheme.geometry, canvasWidthPx: 0 },
  };
  assert.throws(() => createCompiler({ themes: [zeroWidth] }), (error) => {
    assert.equal(error.code, "AZE_CONFIG_THEME_VALUES");
    return true;
  });
});
