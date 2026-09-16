import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { createCompiler } from "../dist/index.js";
import { TEX_PLUGIN_VERSION, TEX_PROFILES } from "../dist/contracts.js";

const CLI_PATH = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const source = (profile = "circuitikz") => `---\nazemark: 2\n---\n\n:::: tex\nid: analog-filter\ntitle: Analog filter\ndescription: A passive low-pass filter.\nprofile: ${profile}\n----\n\\draw (0,0) to[R] (2,0) to[C] (2,-2) -- (0,-2) -- cycle;\n::::\n`;

test("TeX profiles parse as semantic blocks and fail closed without a renderer", async () => {
  const compiler = createCompiler();
  for (const profile of TEX_PROFILES) {
    const parsed = compiler.parse(source(profile));
    assert.deepEqual(parsed.diagnostics, []);
    const block = parsed.document.blocks[0];
    assert.equal(block?.kind, "tex");
    assert.equal(block?.pluginVersion, TEX_PLUGIN_VERSION);
    assert.equal(block?.profile, profile);
    const compiled = await compiler.compile(source(profile), { format: "html", sourceName: "figure.aze.md" });
    assert.equal(compiled.artifact, undefined);
    assert.ok(compiled.diagnostics.some(({ code }) => code === "azeforge.renderer#adapter-missing"));
  }
});

test("a trusted renderer embeds accessible SVG in the HTML artifact", async () => {
  const compiled = await createCompiler({
    texRenderer: {
      render: ({ profile, body }) => {
        assert.equal(profile, "tikz");
        assert.match(body, /\\draw/);
        return '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10" viewBox="0 0 20 10" role="img"><path d="M0 0H20"/></svg>';
      },
    },
  }).compile(source("tikz"), { format: "html" });
  assert.deepEqual(compiled.diagnostics, []);
  const html = Buffer.from(compiled.artifact.bytes).toString("utf8");
  assert.match(html, /<figure class="aze-tex" data-tex-profile="tikz">/);
  assert.match(html, /<title>Analog filter<\/title><desc>A passive low-pass filter\.<\/desc>/);
});

test("TeX rejects document and package commands in authored figure bodies", () => {
  const parsed = createCompiler().parse(source().replace("\\draw", "\\usepackage{unsafe}\n\\draw"));
  assert.deepEqual(parsed.diagnostics.map(({ code }) => code), ["azeforge.tex#forbidden-command"]);
});

test("CLI exposes missing TeX renderer as a source diagnostic", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-tex-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "figure.aze.md"), source());
  const result = spawnSync(process.execPath, [CLI_PATH, "render", "figure.aze.md", "--output", "figure.html", "--diagnostics", "json"], { cwd: directory, encoding: null });
  assert.equal(result.status, 1);
  assert.deepEqual(JSON.parse(result.stdout.toString("utf8")).diagnostics.map(({ code }) => code), ["azeforge.renderer#adapter-missing"]);
});
