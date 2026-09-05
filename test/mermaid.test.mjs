import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  assertRegistryDescriptorsImmutable,
  CHROME_HEADLESS_SHELL_VERSION,
  createCompiler,
  defaultTheme,
  deriveMermaidSeed,
  getBuiltInRegistry,
  MERMAID_PLUGIN_VERSION,
  MERMAID_VERSION,
  MermaidBrowserUnavailableError,
  MermaidCapabilityError,
  mermaidHtmlBlockRenderer,
  mermaidPlugin,
  renderMermaidInBrowser,
  sanitizeMermaidSvg,
} from "../dist/index.js";

const CLI_PATH = new URL("../dist/cli.js", import.meta.url);

const FLOWCHART = `flowchart TD
  measure[Measure beam] --> zero[Zero indicator]
  zero --> load[Apply next load]
  load --> read[Record deflection]
  read --> more{More loads?}
  more -- Yes --> load
  more -- No --> unload[Unload and verify zero]
`;

function sourceWith(body, header = "") {
  return `---\nazemark: 1\n---\n\n:::: mermaid\n${header}${body}::::\n`;
}

function runCli(arguments_, cwd) {
  return spawnSync(process.execPath, [CLI_PATH.pathname, ...arguments_], {
    cwd,
    encoding: null,
  });
}

function embeddedSvg(html) {
  const match = /<figure class="aze-mermaid"[\s\S]*?(<svg[\s\S]*?<\/svg>)/.exec(html);
  assert.ok(match !== null, "expected one embedded mermaid SVG");
  return match[1];
}

test("a valid flowchart becomes a versioned Block with sanitized SVG", async () => {
  const compiler = createCompiler();
  const parsed = compiler.parse(sourceWith(`${FLOWCHART}`, "id: beam-flow\n"), {
    sourceName: "flow.aze.md",
  });
  assert.deepEqual(parsed.diagnostics.map(({ code }) => code), []);
  const block = parsed.document.blocks[0];
  assert.equal(block?.kind, "mermaid");
  assert.equal(block?.pluginVersion, MERMAID_PLUGIN_VERSION);
  assert.equal(block?.diagramType, "flowchart TD");
  assert.equal(block?.id, "beam-flow");

  const compiled = await compiler.compile(
    sourceWith(`${FLOWCHART}`, "id: beam-flow\n"),
    { format: "html", sourceName: "flow.aze.md" },
  );
  assert.deepEqual(compiled.diagnostics.map(({ code }) => code), []);
  const html = Buffer.from(compiled.artifact.bytes).toString("utf8");
  assert.match(html, /<figure class="aze-mermaid"/);
  const svg = embeddedSvg(html);
  assert.match(svg, /viewBox="0 0 [0-9.]+ [0-9.]+"/);
  assert.match(svg, /<title id="aze-m-0-title">/);
  assert.match(svg, /Measure beam/);
  assert.match(svg, /data-seed="[0-9a-f]{16}"/);
});

test("valid diagrams render locally with zero non-loopback requests", async () => {
  const compiler = createCompiler();
  const compiled = await compiler.compile(sourceWith(`${FLOWCHART}`), {
    format: "html",
  });
  assert.deepEqual(compiled.diagnostics.map(({ code }) => code), []);
  const html = Buffer.from(compiled.artifact.bytes).toString("utf8");
  assert.equal(html.includes('src="http'), false);
  assert.equal(html.includes('href="http'), false);
  assert.equal(html.includes("@import"), false);
  assert.equal(/url\((?!#|data:)/i.test(html), false);

  const block = compiled.document.blocks[0];
  assert.equal(block?.kind, "mermaid");
  const rendered = await renderMermaidInBrowser({
    source: block.source,
    elementId: "aze-m-test",
    seed: "0123456789abcdef",
    theme: defaultTheme,
  });
  assert.match(rendered.browserVersion, /^HeadlessChrome\//);
  for (const request of rendered.requests) {
    assert.ok(
      request === "about:blank" || request.startsWith("data:"),
      `non-loopback request: ${request}`,
    );
  }
  assert.match(rendered.svg, /<svg/);
});

test("identical Source, ordinal, Plugin version, and Theme produce byte-identical SVG", async () => {
  const compiler = createCompiler();
  const source = sourceWith(`${FLOWCHART}`, "title: Beam procedure\n");
  const first = await compiler.compile(source, { format: "html" });
  const second = await compiler.compile(source, { format: "html" });
  assert.deepEqual(first.diagnostics, []);
  assert.deepEqual(second.diagnostics, []);
  assert.deepEqual(first.artifact.bytes, second.artifact.bytes);
  assert.equal(
    first.artifact.metadata.artifactHash,
    second.artifact.metadata.artifactHash,
  );
  const firstHtml = Buffer.from(first.artifact.bytes).toString("utf8");
  const secondHtml = Buffer.from(second.artifact.bytes).toString("utf8");
  assert.equal(embeddedSvg(firstHtml), embeddedSvg(secondHtml));

  const seed = deriveMermaidSeed({
    source: FLOWCHART.trim(),
    ordinal: 0,
    pluginVersion: MERMAID_PLUGIN_VERSION,
    theme: { id: "default", version: "1.0.0" },
  });
  assert.match(seed, /^[0-9a-f]{16}$/);
  assert.equal(
    seed,
    deriveMermaidSeed({
      source: FLOWCHART.trim(),
      ordinal: 0,
      pluginVersion: MERMAID_PLUGIN_VERSION,
      theme: { id: "default", version: "1.0.0" },
    }),
  );
});

test("embedded graphics carry finite viewBox, names, deterministic IDs, and no unsafe content", async () => {
  const compiler = createCompiler();
  const compiled = await compiler.compile(
    sourceWith(`${FLOWCHART}`, "title: Beam procedure\ndescription: Load loop\n"),
    { format: "html" },
  );
  const html = Buffer.from(compiled.artifact.bytes).toString("utf8");
  const svg = embeddedSvg(html);
  const viewBox = /viewBox="0 0 ([0-9.]+) ([0-9.]+)"/.exec(svg);
  assert.ok(viewBox !== null);
  const width = Number(viewBox[1]);
  const height = Number(viewBox[2]);
  assert.ok(Number.isFinite(width) && width > 0);
  assert.ok(Number.isFinite(height) && height > 0);
  assert.match(svg, /<title id="aze-m-0-title">Beam procedure<\/title>/);
  assert.match(svg, /<desc id="aze-m-0-desc">Load loop<\/desc>/);
  const ids = [...svg.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(ids.length > 0);
  for (const id of ids) {
    assert.match(id, /^aze-m-0(?:-title|-desc|-n-\d+(?:-r\d+)?)?$/);
  }
  const lowered = svg.toLowerCase();
  for (const forbidden of [
    "<script",
    "onclick",
    "onload",
    "onerror",
    "<foreignobject",
    "<iframe",
    "<image",
    "<use",
    "<animate",
    "javascript:",
  ]) {
    assert.equal(lowered.includes(forbidden), false, forbidden);
  }
  const withoutNamespace = lowered.replace(
    'xmlns="http://www.w3.org/2000/svg"',
    "",
  );
  assert.equal(withoutNamespace.includes("http://"), false);
  assert.equal(withoutNamespace.includes("https://"), false);
  assert.equal(MERMAID_VERSION, "11.17.2");
});

test("invalid diagrams produce one scoped diagnostic and no Artifact", async () => {
  const compiler = createCompiler();
  // Parse-time rejections: unknown diagram, empty Source.
  const parseCases = [
    {
      body: "piechart\n  A -- B\n",
      code: "azeforge.mermaid#unsupported-diagram",
    },
    { body: "   \n", code: "azeforge.mermaid#empty" },
  ];
  for (const { body, code } of parseCases) {
    const parsed = compiler.parse(sourceWith(body), {
      sourceName: "bad.aze.md",
    });
    assert.equal(parsed.document.blocks[0]?.kind, "invalid");
    assert.deepEqual(
      parsed.diagnostics.map((diagnostic) => diagnostic.code),
      [code],
    );
    assert.ok(parsed.diagnostics[0]?.location?.range !== undefined);
    const compiled = await compiler.compile(sourceWith(body), {
      format: "html",
      sourceName: "bad.aze.md",
    });
    assert.equal(compiled.artifact, undefined);
    assert.equal(compiled.document, undefined);
    assert.ok(
      compiled.diagnostics.some((diagnostic) => diagnostic.code === code),
    );
    assert.equal(
      Buffer.from(JSON.stringify(compiled.diagnostics)).toString("utf8").includes("<svg"),
      false,
    );
  }
  // Deep syntax is owned by pinned Mermaid at compile time: the broken
  // block parses clean, then fails with exactly one scoped diagnostic.
  const broken = "flowchart TD\n  A - broken ???\n";
  const parsedBroken = compiler.parse(sourceWith(broken), {
    sourceName: "bad.aze.md",
  });
  assert.equal(parsedBroken.document.blocks[0]?.kind, "mermaid");
  assert.deepEqual(
    parsedBroken.diagnostics.map((diagnostic) => diagnostic.code),
    [],
  );
  const compiledBroken = await compiler.compile(sourceWith(broken), {
    format: "html",
    sourceName: "bad.aze.md",
  });
  assert.equal(compiledBroken.artifact, undefined);
  assert.equal(compiledBroken.document, undefined);
  assert.deepEqual(
    compiledBroken.diagnostics.map((diagnostic) => diagnostic.code),
    ["azeforge.mermaid#invalid-syntax"],
  );
  assert.ok(compiledBroken.diagnostics[0]?.location?.range !== undefined);
  assert.equal(
    Buffer.from(JSON.stringify(compiledBroken.diagnostics)).toString("utf8").includes("<svg"),
    false,
  );
});

test("throwing mermaid renderer fails closed with unexpected-failure", async () => {
  const throwing = {
    descriptor: { ...mermaidHtmlBlockRenderer.descriptor },
    render: () => {
      throw new Error("boom");
    },
  };
  const compiled = await createCompiler({
    blockRenderers: [throwing],
  }).compile(sourceWith(`${FLOWCHART}`), { format: "html" });
  assert.deepEqual(
    compiled.diagnostics.map(({ code }) => code),
    ["azeforge.renderer#unexpected-failure"],
  );
  assert.equal(compiled.artifact, undefined);
  assert.equal(compiled.document, undefined);
});

test("active content and external resources are rejected, never rewritten", async () => {
  const compiler = createCompiler();
  const active = sourceWith(
    "flowchart TD\n  a[<script>alert(1)</script>] --> b[B]\n",
  );
  const parsedActive = compiler.parse(active, { sourceName: "xss.aze.md" });
  assert.deepEqual(
    parsedActive.diagnostics.map(({ code }) => code),
    ["azeforge.mermaid#active-content"],
  );
  const compiledActive = await compiler.compile(active, { format: "html" });
  assert.equal(compiledActive.artifact, undefined);

  const external = sourceWith(
    "flowchart TD\n  a[A] --> b[B]\n  click a https://example.com\n",
  );
  const parsedExternal = compiler.parse(external);
  assert.deepEqual(
    parsedExternal.diagnostics.map(({ code }) => code),
    ["azeforge.mermaid#external-resource"],
  );
  const compiledExternal = await compiler.compile(external, {
    format: "html",
  });
  assert.equal(compiledExternal.artifact, undefined);

  assert.throws(
    () =>
      sanitizeMermaidSvg(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><title id="aze-m-0-title">T</title><script>alert(1)</script></svg>',
        { ordinal: 0 },
      ),
    /Forbidden SVG/,
  );
});

test("browser-adjacent work uses approved capability handles", async () => {
  assert.equal(new MermaidCapabilityError("denied").code, "AZE_CAPABILITY_DENIED");
  assert.equal(CHROME_HEADLESS_SHELL_VERSION, "152.0.7977.75");
  // An unavailable engine fails closed with a reinstall remedy, never a hang.
  const unavailable = {
    resolveExecutable: () => "/nonexistent/chrome-headless-shell",
    loadMermaidScript: () => Promise.reject(new Error("unreachable")),
    loadFontCss: () => Promise.reject(new Error("unreachable")),
    launch: () => Promise.reject(new Error("no engine here")),
    openPage: () => Promise.reject(new Error("unreachable")),
    settleLayout: () => Promise.reject(new Error("unreachable")),
  };
  await assert.rejects(
    renderMermaidInBrowser(
      {
        source: FLOWCHART.trim(),
        elementId: "aze-m-test",
        seed: "0123456789abcdef",
        theme: defaultTheme,
      },
      unavailable,
    ),
    (error) => {
      assert.ok(error instanceof MermaidBrowserUnavailableError);
      assert.match(error.message, /Reinstall AzeForge browser dependencies/);
      return true;
    },
  );
  // The real isolated context renders end to end through the Block renderer.
  const compiler = createCompiler();
  const parsed = compiler.parse(sourceWith(`${FLOWCHART}`, "id: caps\n"));
  const block = parsed.document.blocks[0];
  assert.equal(block?.kind, "mermaid");
  const fragment = await mermaidHtmlBlockRenderer.render(block, { ordinal: 3 });
  assert.match(fragment, /aze-m-3-title/);
});

test("sequence diagrams and repeated blocks render deterministically", async () => {
  const compiler = createCompiler();
  const sequence = `sequenceDiagram
  participant A
  participant B
  A->>B: Hello
  B-->>A: Ack
`;
  const first = await compiler.compile(sourceWith(sequence), { format: "html" });
  const second = await compiler.compile(sourceWith(sequence), {
    format: "html",
  });
  assert.deepEqual(first.diagnostics, []);
  const firstHtml = Buffer.from(first.artifact.bytes).toString("utf8");
  assert.match(firstHtml, /Hello/);
  assert.match(firstHtml, /Ack/);
  assert.deepEqual(first.artifact.bytes, second.artifact.bytes);

  const two = `---\nazemark: 1\n---\n\n:::: mermaid\n${FLOWCHART}::::\n\n:::: mermaid\n${sequence}::::\n`;
  const both = await compiler.compile(two, { format: "html" });
  assert.deepEqual(both.diagnostics, []);
  const bothHtml = Buffer.from(both.artifact.bytes).toString("utf8");
  assert.match(bothHtml, /aze-m-0-title/);
  assert.match(bothHtml, /aze-m-1-title/);
});

test("descriptors are inert, immutable, and versioned through the conformance seam", () => {
  const registry = getBuiltInRegistry();
  assertRegistryDescriptorsImmutable(registry);
  const plugin = registry.plugins.find(
    (entry) => entry.descriptor.type === "mermaid",
  );
  assert.ok(plugin !== undefined);
  assert.equal(plugin.descriptor.version, "1.0.0");
  assert.equal(plugin.descriptor.sourceSchema.$id, "azeforge.mermaid/source/v1");
  assert.equal(plugin.descriptor.dataSchema.$id, "azeforge.mermaid/data/v1");
  assert.equal(mermaidPlugin.descriptor.diagnosticNamespace, "azeforge.mermaid");
  assert.equal(
    mermaidHtmlBlockRenderer.descriptor.pluginVersionRange,
    "1.0.0",
  );
  assert.ok(Object.isFrozen(mermaidPlugin));
  assert.ok(Object.isFrozen(mermaidHtmlBlockRenderer));
});

test("mermaid validates and renders through real CLI calls", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-mermaid-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "flow.aze.md"), sourceWith(`${FLOWCHART}`));
  await writeFile(
    join(directory, "bad.aze.md"),
    sourceWith("not a diagram\n  ???\n"),
  );
  await writeFile(
    join(directory, "xss.aze.md"),
    sourceWith("flowchart TD\n  a[<script>x</script>] --> b[B]\n"),
  );
  await writeFile(
    join(directory, "link.aze.md"),
    sourceWith("flowchart TD\n  a[A] --> b[B]\n  click a https://example.com\n"),
  );

  assert.equal(runCli(["validate", "flow.aze.md"], directory).status, 0);
  const rendered = runCli(
    ["render", "flow.aze.md", "--output", "flow.html"],
    directory,
  );
  assert.equal(rendered.status, 0);
  const html = await readFile(join(directory, "flow.html"), "utf8");
  assert.match(html, /<figure class="aze-mermaid"/);
  assert.match(html, /viewBox="0 0 [0-9.]+ [0-9.]+"/);

  const again = runCli(
    ["render", "flow.aze.md", "--output", "flow-again.html"],
    directory,
  );
  assert.equal(again.status, 0);
  assert.equal(
    await readFile(join(directory, "flow-again.html"), "utf8"),
    html,
  );

  assert.equal(runCli(["validate", "bad.aze.md"], directory).status, 1);
  assert.equal(
    runCli(["render", "bad.aze.md", "--output", "bad.html"], directory).status,
    1,
  );
  assert.equal(runCli(["validate", "xss.aze.md"], directory).status, 1);
  assert.equal(runCli(["validate", "link.aze.md"], directory).status, 1);
});
