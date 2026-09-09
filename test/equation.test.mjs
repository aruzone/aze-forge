import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  assertRegistryDescriptorsImmutable,
  equationHtmlBlockRenderer,
  equationPlugin,
  getBuiltInRegistry,
  htmlRendererDescriptor,
  satisfiesSemverRange,
} from "../dist/adapters.js";
import { createCompiler } from "../dist/index.js";
import { EQUATION_PLUGIN_VERSION, KATEX_VERSION } from "../dist/contracts.js";

const CLI_PATH = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

function sourceWith(body, header = "") {
  return `---\nazemark: 2\n---\n\n:::: equation\n${header}----\n${body}::::\n`;
}

function runCli(arguments_, cwd) {
  return spawnSync(process.execPath, [CLI_PATH, ...arguments_], {
    cwd,
    encoding: null,
  });
}

test("a valid readable equation becomes a versioned Block with KaTeX HTML+MathML", async () => {
  const compiler = createCompiler();
  const parsed = compiler.parse(
    sourceWith("F(omega) = integral x=0..infinity of x^2 dx\n", "id: euler\n"),
    { sourceName: "eq.aze.md" },
  );
  assert.deepEqual(parsed.diagnostics.map(({ code }) => code), []);
  const block = parsed.document.blocks[0];
  assert.equal(block?.kind, "equation");
  assert.equal(block?.pluginVersion, EQUATION_PLUGIN_VERSION);
  assert.equal(block?.notation, "native");
  assert.equal(block?.id, "euler");
  assert.equal(typeof block?.tree, "object");

  const compiled = await compiler.compile(
    sourceWith("F(omega) = integral x=0..infinity of x^2 dx\n", "id: euler\n"),
    { format: "html", sourceName: "eq.aze.md" },
  );
  assert.deepEqual(compiled.diagnostics.map(({ code }) => code), []);
  const html = Buffer.from(compiled.artifact.bytes).toString("utf8");
  assert.match(html, /class="katex"/);
  assert.match(html, /<math/);
  assert.match(html, /data-equation-id="euler"/);
  assert.equal(html.includes('src="http'), false);
  assert.equal(html.includes('href="http'), false);
  assert.equal(html.includes('@import'), false);
  assert.match(html, /\.katex-mathml\{[^}]*position:absolute/);
  assert.equal(html.includes("url(fonts/"), false);
});

test("equation headers tolerate blank lines between entries", async () => {
  const compiler = createCompiler();
  const spaced = "---\nazemark: 2\n---\n\n:::: equation\nid: spaced\n\nsyntax: latex\n\n----\n\\frac{a}{b}\n::::\n";
  const parsed = compiler.parse(spaced, {
    sourceName: "spaced.aze.md",
    allowRawLatex: true,
  });
  assert.deepEqual(parsed.diagnostics.map(({ code }) => code), []);
  assert.equal(parsed.document.blocks[0]?.kind, "equation");
  assert.equal(parsed.document.blocks[0]?.id, "spaced");
  const compiled = await compiler.compile(spaced, {
    format: "html",
    allowRawLatex: true,
  });
  assert.deepEqual(compiled.diagnostics.map(({ code }) => code), []);
  assert.match(
    Buffer.from(compiled.artifact.bytes).toString("utf8"),
    /data-equation-id="spaced"/,
  );
});

test("every readable alias maps to pinned KaTeX offline", async () => {
  assert.equal(KATEX_VERSION, "0.18.5");
  const bodies = [
    "alpha + Gamma + infinity",
    "sqrt(x) + frac(a, b) + root(3, x)",
    "sum i=1..n of i^2 + product k=1..m of k",
    "integral t=-infinity..infinity of f(t) dt",
    "limit x->0 of sin(x)",
    "partial f / partial t + pmatrix [[a, b], [c, d]]",
    "matrix [[a,b],[c,d]]",
    "cases(x when x > 0; y otherwise)",
    "x in A union B intersect C",
    "a != b <= c >= d",
  ];
  const compiler = createCompiler();
  for (const body of bodies) {
    const parsed = compiler.parse(sourceWith(`${body}\n`));
    assert.equal(
      parsed.document.blocks[0]?.kind,
      "equation",
      `alias body failed: ${body}`,
    );
    const compiled = await compiler.compile(sourceWith(`${body}\n`), {
      format: "html",
    });
    assert.deepEqual(
      compiled.diagnostics.map(({ code }) => code),
      [],
      `alias body failed: ${body}`,
    );
    assert.match(
      Buffer.from(compiled.artifact.bytes).toString("utf8"),
      /class="katex"/,
    );
  }
});

test("invalid equations produce stable ranged diagnostics", () => {
  const compiler = createCompiler();
  const missing = compiler.parse(
    "---\nazemark: 2\n---\n\n# T\n\n:::: equation\n----\nintegral x=0..1 of x^2\n::::\n",
    { sourceName: "missing.aze.md" },
  );
  assert.deepEqual(
    missing.diagnostics.map(({ code }) => code),
    ["azeforge.equation#missing-integration-variable"],
  );
  assert.equal(
    missing.diagnostics[0]?.location?.range?.start?.line,
    9,
  );

  const garbage = compiler.parse(sourceWith("a } b\n"));
  assert.equal(garbage.document.blocks[0]?.kind, "invalid");
  assert.equal(
    garbage.diagnostics[0]?.code,
    "azeforge.equation#unsupported-notation",
  );
  assert.ok(garbage.diagnostics[0]?.location?.range !== undefined);
});

test("raw LaTeX fails by default and renders with explicit approval", async () => {
  const compiler = createCompiler();
  const body = ":::: equation\nsyntax: latex\n----\n\\frac{a}{b}\n::::\n";
  const raw = `---\nazemark: 2\n---\n\n${body}`;
  const denied = compiler.parse(raw, { sourceName: "raw.aze.md" });
  assert.deepEqual(
    denied.diagnostics.map(({ code }) => code),
    ["azeforge.security#raw-latex-disabled"],
  );
  assert.equal(denied.document.blocks[0]?.kind, "invalid");

  const allowed = compiler.parse(raw, {
    sourceName: "raw.aze.md",
    allowRawLatex: true,
  });
  assert.equal(allowed.document.blocks[0]?.kind, "equation");
  assert.equal(allowed.document.blocks[0]?.notation, "latex");

  const rendered = await compiler.compile(raw, {
    format: "html",
    allowRawLatex: true,
  });
  assert.deepEqual(rendered.diagnostics.map(({ code }) => code), []);
  assert.match(
    Buffer.from(rendered.artifact.bytes).toString("utf8"),
    /class="katex"/,
  );
});

test("construction rejects ambiguous registrations deterministically", () => {
  const duplicate = (options) => {
    assert.throws(() => createCompiler(options), (error) => {
      assert.ok(error instanceof Error);
      return true;
    });
  };
  duplicate({ plugins: [equationPlugin, equationPlugin] });
  duplicate({
    blockRenderers: [equationHtmlBlockRenderer, equationHtmlBlockRenderer],
  });
  duplicate({ renderers: [htmlRendererDescriptor, htmlRendererDescriptor] });
  duplicate({
    blockRenderers: [
      equationHtmlBlockRenderer,
      {
        descriptor: {
          ...equationHtmlBlockRenderer.descriptor,
          id: "other-equation-renderer",
        },
        render: equationHtmlBlockRenderer.render,
      },
    ],
  });
  duplicate({
    blockRenderers: [
      {
        descriptor: {
          ...equationHtmlBlockRenderer.descriptor,
          pluginVersionRange: "banana",
        },
        render: equationHtmlBlockRenderer.render,
      },
    ],
  });
  assert.equal(
    (() => {
      try {
        createCompiler({
          plugins: [equationPlugin, equationPlugin],
          blockRenderers: [equationHtmlBlockRenderer],
        });
      } catch (error) {
        return error.code;
      }
      return "no-throw";
    })(),
    "azeforge.config#duplicate-plugin",
  );
  assert.equal(satisfiesSemverRange("1.0.0", "^1.2.3"), false);
  assert.equal(satisfiesSemverRange("1.3.0", "^1.2.3"), true);
});

test("missing, incompatible, disabled, throwing, and timed-out adapters never produce Artifacts", async () => {
  const valid = sourceWith("x = 1\n");
  const throwing = {
    descriptor: { ...equationHtmlBlockRenderer.descriptor },
    render: () => {
      throw new Error("boom");
    },
  };
  const slow = {
    descriptor: { ...equationHtmlBlockRenderer.descriptor },
    render: () =>
      new Promise((resolve) => setTimeout(() => resolve("x"), 500)),
  };
  const incompatible = {
    descriptor: {
      ...equationHtmlBlockRenderer.descriptor,
      pluginVersionRange: "3.0.0",
    },
    render: equationHtmlBlockRenderer.render,
  };
  const cases = [
    {
      options: { blockRenderers: [] },
      code: "azeforge.renderer#adapter-missing",
    },
    {
      options: { blockRenderers: [incompatible] },
      code: "azeforge.renderer#adapter-incompatible",
    },
    {
      options: {
        policy: {
          disabledBlockRendererIds: [equationHtmlBlockRenderer.descriptor.id],
        },
      },
      code: "azeforge.renderer#adapter-disabled",
    },
    {
      options: { blockRenderers: [throwing] },
      code: "azeforge.renderer#unexpected-failure",
    },
    {
      options: { blockRenderers: [slow], renderTimeoutMs: 20 },
      code: "azeforge.renderer#timeout",
    },
  ];
  for (const { options, code } of cases) {
    const compiled = await createCompiler(options).compile(valid, {
      format: "html",
    });
    assert.deepEqual(
      compiled.diagnostics.map(({ code: actual }) => actual),
      [code],
    );
    assert.equal(compiled.artifact, undefined);
    assert.equal(compiled.document, undefined);
  }
});

test("descriptors are inert, immutable, and versioned through the conformance seam", () => {
  const registry = getBuiltInRegistry();
  assertRegistryDescriptorsImmutable(registry);
  assert.equal(registry.plugins[0]?.descriptor.type, "equation");
  assert.equal(registry.plugins[0]?.descriptor.version, "2.0.0");
  assert.equal(
    registry.plugins[0]?.descriptor.sourceSchema.$id,
    "azeforge.equation/source/v2",
  );
  assert.equal(
    registry.plugins[0]?.descriptor.dataSchema.$id,
    "azeforge.equation/data/v2",
  );
  assert.equal(
    registry.blockRenderers[0]?.descriptor.pluginVersionRange,
    "2.0.0",
  );
  assert.ok(Object.isFrozen(registry.plugins[0]));
  assert.ok(Object.isFrozen(registry.blockRenderers[0]));
});

test("equations validate and render through real CLI calls", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-equation-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "eq.aze.md"), sourceWith("E = sqrt(m)\n"));
  await writeFile(
    join(directory, "raw.aze.md"),
    `---\nazemark: 2\n---\n\n:::: equation\nsyntax: latex\n----\n\\frac{a}{b}\n::::\n`,
  );

  assert.equal(runCli(["validate", "eq.aze.md"], directory).status, 0);
  const rendered = runCli(
    ["render", "eq.aze.md", "--output", "eq.html"],
    directory,
  );
  assert.equal(rendered.status, 0);
  assert.match(await readFile(join(directory, "eq.html"), "utf8"), /<math/);

  assert.equal(runCli(["validate", "raw.aze.md"], directory).status, 1);
  assert.equal(
    runCli(["validate", "raw.aze.md", "--allow-raw-latex"], directory).status,
    0,
  );
  assert.equal(
    runCli(
      ["render", "raw.aze.md", "--output", "raw.html", "--allow-raw-latex"],
      directory,
    ).status,
    0,
  );
});
