import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { createCompiler } from "../dist/index.js";
import { TEX_PLUGIN_VERSION, TEX_PROFILES, TEX_RENDERER_PROTOCOL } from "../dist/contracts.js";

const CLI_PATH = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const IDENTITY = `sha256:${"a".repeat(64)}`;
const OTHER_IDENTITY = `sha256:${"b".repeat(64)}`;
const source = (profile = "circuitikz") => `---\nazemark: 2\n---\n\n:::: tex\nid: analog-filter\ntitle: Analog filter\ndescription: A passive low-pass filter.\nprofile: ${profile}\n----\n\\draw (0,0) to[R] (2,0) to[C] (2,-2) -- (0,-2) -- cycle;\n::::\n`;
const twoBlockSource = () => `${source("tikz")}\n${source("tikz").replace("analog-filter", "second-figure").replace("Analog filter", "Second figure")}`;

const svg = (width = 20, height = 10) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img"><path d="M0 0H${width}"/></svg>`;

async function adapter(directory, name, body) {
  const path = join(directory, name);
  await writeFile(path, body, { mode: 0o755 });
  await chmod(path, 0o755);
  return { command: process.execPath, args: [path] };
}

/** An adapter that approves a fixed request shape and returns per-figure results. */
async function fixedAdapter(directory, name, identity, figureResult) {
  return await adapter(
    directory,
    name,
    `const chunks = [];
process.stdin.on("data", (chunk) => chunks.push(chunk));
process.stdin.on("end", () => {
  const request = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  const results = request.figures.map((figure) => (${figureResult})(figure));
  process.stdout.write(JSON.stringify({ protocol: request.protocol, rendererIdentity: ${JSON.stringify(identity)}, results }));
});
`,
  );
}

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

test("one command renders every tex Block of one invocation with accessible SVG", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-tex-adapter-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const record = join(directory, "record.json");
  const renderer = await adapter(
    directory,
    "adapter.mjs",
    `import { appendFileSync } from "node:fs";
const chunks = [];
process.stdin.on("data", (chunk) => chunks.push(chunk));
process.stdin.on("end", () => {
  const request = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  appendFileSync(${JSON.stringify(record)}, JSON.stringify(request) + "\\n");
  const results = request.figures.map((figure) => ({ index: figure.index, status: "ok", svg: ${JSON.stringify(svg())} }));
  process.stdout.write(JSON.stringify({ protocol: request.protocol, rendererIdentity: ${JSON.stringify(IDENTITY)}, results }));
});
`,
  );
  assert.equal(renderer.args.length, 1);
  const compiled = await createCompiler({
    texRenderer: { rendererIdentity: IDENTITY, ...renderer },
  }).compile(twoBlockSource(), { format: "html" });

  assert.deepEqual(compiled.diagnostics, []);
  const html = Buffer.from(compiled.artifact.bytes).toString("utf8");
  assert.match(html, /<figure class="aze-tex" data-tex-profile="tikz">/);
  assert.match(html, /<title>Analog filter<\/title><desc>A passive low-pass filter\.<\/desc>/);
  assert.match(html, /<title>Second figure<\/title>/);

  const requests = (await readFile(record, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(requests.length, 1, "the adapter command runs once per compiler invocation");
  const request = requests[0];
  assert.equal(request.protocol, TEX_RENDERER_PROTOCOL);
  assert.deepEqual(request.figures.map(({ index }) => index), [0, 1]);
  assert.deepEqual(request.figures.map(({ profile }) => profile), ["tikz", "tikz"]);
  assert.equal(request.figures[0].title, "Analog filter");
  assert.equal(request.figures[0].description, "A passive low-pass filter.");
  assert.match(request.figures[0].body, /\\draw/);
  assert.equal(request.figures[0].range.start.line, 5);
  assert.equal(request.figures[1].range.start.line > request.figures[0].range.end.line, true);
});

test("compiler strips the renderer XML declaration and generator comment", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-tex-preamble-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const renderer = await fixedAdapter(
    directory,
    "dvisvgm-shape.mjs",
    IDENTITY,
    `(figure) => ({ index: figure.index, status: "ok", svg: "<?xml version='1.0' encoding='UTF-8'?>\\n<!-- This file was generated by dvisvgm 3.6 -->\\n" + ${JSON.stringify(svg())} })`,
  );
  const compiled = await createCompiler({
    texRenderer: { rendererIdentity: IDENTITY, ...renderer },
  }).compile(source("tikz"), { format: "html" });
  assert.deepEqual(compiled.diagnostics, []);
  const html = Buffer.from(compiled.artifact.bytes).toString("utf8");
  assert.match(html, /<figure class="aze-tex" data-tex-profile="tikz"><svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(html, /<title>Analog filter<\/title><desc>A passive low-pass filter\.<\/desc>/);
  assert.doesNotMatch(html, /dvisvgm|<\?xml/);
});

test("TeX renderer failures map to stable source diagnostics without host details", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-tex-failures-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const cases = [
    ["adapter-unavailable", 125, "no such image"],
    ["resource-limit", 137, "killed"],
    ["sandbox-denied", 1, "operation not permitted"],
    ["compile-failed", 1, "/private/var/folders/secret/figure.tex:12: Undefined control sequence."],
  ];
  for (const [category, exitCode, stderr] of cases) {
    const renderer = await adapter(
      directory,
      `${category}.mjs`,
      `process.stdin.resume();
process.stdin.on("end", () => { process.stderr.write(${JSON.stringify(`${stderr}\n`)}); process.exit(${exitCode}); });
`,
    );
    const compiled = await createCompiler({
      texRenderer: { rendererIdentity: IDENTITY, ...renderer },
    }).compile(source("tikz"), { format: "html", sourceName: "figure.aze.md" });
    assert.equal(compiled.artifact, undefined, category);
    assert.deepEqual(compiled.diagnostics.map(({ code }) => code), [`azeforge.tex#${category}`], category);
    assert.equal(compiled.diagnostics[0]?.location.source, "figure.aze.md", category);
    assert.doesNotMatch(JSON.stringify(compiled.diagnostics), /private\/var\/folders/, category);
  }

  const missing = await createCompiler({
    texRenderer: { rendererIdentity: IDENTITY, command: join(directory, "absent-renderer"), args: [] },
  }).compile(source("tikz"), { format: "html", sourceName: "figure.aze.md" });
  assert.equal(missing.artifact, undefined);
  assert.deepEqual(missing.diagnostics.map(({ code }) => code), ["azeforge.tex#adapter-unavailable"]);

  const slow = await adapter(directory, "slow.mjs", `process.stdin.resume(); setInterval(() => {}, 1000);\n`);
  const timedOut = await createCompiler({
    texRenderer: { rendererIdentity: IDENTITY, ...slow },
    texRenderTimeoutMs: 200,
  }).compile(source("tikz"), { format: "html", sourceName: "figure.aze.md" });
  assert.equal(timedOut.artifact, undefined);
  assert.deepEqual(timedOut.diagnostics.map(({ code }) => code), ["azeforge.tex#timeout"]);

  const garbage = await adapter(directory, "garbage.mjs", `process.stdin.resume(); process.stdin.on("end", () => { process.stdout.write("not json"); });\n`);
  const invalid = await createCompiler({
    texRenderer: { rendererIdentity: IDENTITY, ...garbage },
  }).compile(source("tikz"), { format: "html", sourceName: "figure.aze.md" });
  assert.equal(invalid.artifact, undefined);
  assert.deepEqual(invalid.diagnostics.map(({ code }) => code), ["azeforge.tex#protocol-invalid"]);
});

test("TeX renderer cancellation aborts the command and reports compiler cancellation", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-tex-cancel-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const renderer = await adapter(
    directory,
    "blocking.mjs",
    `import { writeFileSync } from "node:fs";
writeFileSync(process.argv[2], "");
process.stdin.resume();
setInterval(() => {}, 1000);
`,
  );
  const started = join(directory, "started");
  const controller = new AbortController();
  const compiling = createCompiler({
    texRenderer: { rendererIdentity: IDENTITY, ...renderer, args: [...renderer.args, started] },
  }).compile(source("tikz"), { format: "html", signal: controller.signal });
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      await readFile(started);
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  controller.abort();
  const compiled = await compiling;
  assert.deepEqual(compiled.diagnostics.map(({ code }) => code), ["azeforge.compiler#cancelled"]);
});

test("TeX renderer identity is protocol-checked and affects artifact fingerprints", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-tex-identity-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const compile = async (identity) => {
    const renderer = await fixedAdapter(directory, `adapter-${identity.slice(7, 12)}.mjs`, identity, `() => ({ index: figure.index, status: "ok", svg: ${JSON.stringify(svg())} })`);
    return await createCompiler({ texRenderer: { rendererIdentity: identity, ...renderer } }).compile(source("tikz"), { format: "html" });
  };
  const first = await compile(IDENTITY);
  const second = await compile(OTHER_IDENTITY);
  assert.deepEqual(first.diagnostics, []);
  assert.deepEqual(second.diagnostics, []);
  assert.equal(first.contentHash, second.contentHash);
  assert.notEqual(first.artifact?.metadata.rendererFingerprint, second.artifact?.metadata.rendererFingerprint);

  const mismatched = await fixedAdapter(directory, "mismatch.mjs", OTHER_IDENTITY, `() => ({ index: figure.index, status: "ok", svg: ${JSON.stringify(svg())} })`);
  const rejected = await createCompiler({
    texRenderer: { rendererIdentity: IDENTITY, ...mismatched },
  }).compile(source("tikz"), { format: "html" });
  assert.equal(rejected.artifact, undefined);
  assert.deepEqual(rejected.diagnostics.map(({ code }) => code), ["azeforge.tex#protocol-invalid"]);
});

test("TeX refuses a renderer without an immutable manifest identity", async () => {
  const compiled = await createCompiler({
    texRenderer: { command: "absent", args: [] },
  }).compile(source("tikz"), { format: "html" });
  assert.equal(compiled.artifact, undefined);
  assert.deepEqual(compiled.diagnostics.map(({ code }) => code), ["azeforge.tex#protocol-invalid"]);
});

test("invalid protocol framing produces one protocol diagnostic", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-tex-protocol-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const responses = {
    duplicate: (request) => ({ protocol: request.protocol, rendererIdentity: identity, results: request.figures.map(() => ({ index: 0, status: "ok", svg })) }),
    missing: (request) => ({ protocol: request.protocol, rendererIdentity: identity, results: request.figures.map((figure) => ({ index: figure.index + 1, status: "ok", svg })) }),
    unsafe: (request) => ({ protocol: request.protocol, rendererIdentity: identity, results: request.figures.map((figure) => ({ index: figure.index, status: "ok", svg: "<html><script/></html>" })) }),
    wrongProtocol: (request) => ({ protocol: "azeforge.tex-renderer/v0", rendererIdentity: identity, results: request.figures.map((figure) => ({ index: figure.index, status: "ok", svg })) }),
  };
  for (const [name, respond] of Object.entries(responses)) {
    const renderer = await adapter(
      directory,
      `${name}.mjs`,
      `const svg = ${JSON.stringify(svg())};
const identity = ${JSON.stringify(IDENTITY)};
const chunks = [];
process.stdin.on("data", (chunk) => chunks.push(chunk));
process.stdin.on("end", () => {
  const request = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  process.stdout.write(JSON.stringify((${respond.toString()})(request)));
});
`,
    );
    const compiled = await createCompiler({
      texRenderer: { rendererIdentity: IDENTITY, ...renderer },
    }).compile(twoBlockSource(), { format: "html", sourceName: "figure.aze.md" });
    assert.equal(compiled.artifact, undefined, name);
    const codes = compiled.diagnostics.map(({ code }) => code);
    assert.equal(codes.length > 0, true, name);
    assert.equal(codes.every((code) => code === "azeforge.tex#protocol-invalid"), true, name);
  }
});

test("TeX body locations map back onto the authored Source", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-tex-location-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const renderer = await fixedAdapter(
    directory,
    "body-location.mjs",
    IDENTITY,
    `(figure) => ({ index: figure.index, status: "error", diagnostic: { code: "compile-failed", message: "Undefined control sequence.", bodyLocation: { line: 1, column: 1 } } })`,
  );
  const compiled = await createCompiler({
    texRenderer: { rendererIdentity: IDENTITY, ...renderer },
  }).compile(source("tikz"), { format: "html", sourceName: "figure.aze.md" });
  assert.equal(compiled.artifact, undefined);
  assert.deepEqual(compiled.diagnostics.map(({ code }) => code), ["azeforge.tex#compile-failed"]);
  assert.equal(compiled.diagnostics[0]?.location.range.start.line, 11);

  const outside = await fixedAdapter(
    directory,
    "outside-body.mjs",
    IDENTITY,
    `(figure) => ({ index: figure.index, status: "error", diagnostic: { code: "compile-failed", message: "Out of range.", bodyLocation: { line: 99, column: 1 } } })`,
  );
  const rejected = await createCompiler({
    texRenderer: { rendererIdentity: IDENTITY, ...outside },
  }).compile(source("tikz"), { format: "html" });
  assert.equal(rejected.artifact, undefined);
  assert.deepEqual(rejected.diagnostics.map(({ code }) => code), ["azeforge.tex#protocol-invalid"]);
});

test("adapter error codes map onto compiler categories", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-tex-codes-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const codes = [["output-limit", "resource-limit"], ["sandbox-denied", "sandbox-denied"], ["mystery", "compile-failed"]];
  for (const [adapterCode, category] of codes) {
    const renderer = await fixedAdapter(
      directory,
      `${adapterCode}.mjs`,
      IDENTITY,
      `(figure) => ({ index: figure.index, status: "error", diagnostic: { code: ${JSON.stringify(adapterCode)}, message: "failure" } })`,
    );
    const compiled = await createCompiler({
      texRenderer: { rendererIdentity: IDENTITY, ...renderer },
    }).compile(source("tikz"), { format: "html" });
    assert.deepEqual(compiled.diagnostics.map(({ code }) => code), [`azeforge.tex#${category}`], adapterCode);
  }
});

test("TeX rejects document and package commands in authored figure bodies", () => {
  const parsed = createCompiler().parse(source().replace("\\draw", "\\usepackage{unsafe}\n\\draw"));
  assert.deepEqual(parsed.diagnostics.map(({ code }) => code), ["azeforge.tex#forbidden-command"]);
});

test("TeX preserves raw printable bodies and rejects every closed-envelope violation at its source", () => {
  const compiler = createCompiler();
  const valid = source("tikz").replace(
    "\\draw (0,0) to[R] (2,0) to[C] (2,-2) -- (0,-2) -- cycle;",
    "\t\\draw (0,0) -- (1,1);\n",
  );
  const parsed = compiler.parse(valid);
  assert.deepEqual(parsed.diagnostics, []);
  assert.equal(parsed.document.blocks[0]?.body, "\t\\draw (0,0) -- (1,1);\n");
  const accessibleMetadata = compiler.parse(
    source().replace("Analog filter", "滤波器".repeat(100)).replace("A passive low-pass filter.", "شرح".repeat(300)),
  );
  assert.deepEqual(accessibleMetadata.diagnostics, []);

  const empty = compiler.parse(source().replace("\\draw (0,0) to[R] (2,0) to[C] (2,-2) -- (0,-2) -- cycle;", ""));
  assert.deepEqual(empty.diagnostics.map(({ code }) => code), ["azeforge.tex#empty"]);
  const oversized = compiler.parse(source().replace("\\draw (0,0) to[R] (2,0) to[C] (2,-2) -- (0,-2) -- cycle;", "x".repeat(50001)));
  assert.deepEqual(oversized.diagnostics.map(({ code }) => code), ["azeforge.tex#limit-exceeded"]);

  const bodyViolations = [
    ["\\documentclass{article}", "azeforge.tex#forbidden-command"],
    ["\\usepackage{unsafe}", "azeforge.tex#forbidden-command"],
    ["\\input{secret.tex}", "azeforge.tex#forbidden-command"],
    ["\\import{./}{secret.tex}", "azeforge.tex#forbidden-command"],
    ["\\openout0=secret", "azeforge.tex#forbidden-command"],
    ["\\ShellEscape{touch /tmp/pwned}", "azeforge.tex#forbidden-command"],
    ["\\fontfamily{Unsafe}\\selectfont", "azeforge.tex#forbidden-command"],
    ["\\write18{whoami}", "azeforge.tex#forbidden-command"],
    ["\\fontspec{Unsafe}", "azeforge.tex#forbidden-command"],
    ["\\setmainfont{Unsafe}", "azeforge.tex#forbidden-command"],
    ["é", "azeforge.tex#invalid-body"],
  ];
  for (const [body, code] of bodyViolations) {
    const result = compiler.parse(source().replace("\\draw (0,0) to[R] (2,0) to[C] (2,-2) -- (0,-2) -- cycle;", body));
    assert.deepEqual(result.diagnostics.map(({ code: actual }) => actual), [code], body);
    assert.equal(result.diagnostics[0]?.location.range.start.line, 11, body);
  }

  const invalidAttribute = compiler.parse(source().replace("profile: circuitikz", "caption: forbidden"));
  assert.deepEqual(
    invalidAttribute.diagnostics.map(({ code }) => code).sort(),
    ["azeforge.tex#invalid-attribute", "azeforge.tex#required-attribute"],
  );
  assert.equal(
    invalidAttribute.diagnostics.find(({ code }) => code === "azeforge.tex#invalid-attribute")?.location.range.start.line,
    9,
  );
});

test("CLI exposes missing TeX renderer as a source diagnostic", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-tex-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "figure.aze.md"), source());
  const result = spawnSync(process.execPath, [CLI_PATH, "render", "figure.aze.md", "--output", "figure.html", "--diagnostics", "json"], { cwd: directory, encoding: null });
  assert.equal(result.status, 1);
  assert.deepEqual(JSON.parse(result.stdout.toString("utf8")).diagnostics.map(({ code }) => code), ["azeforge.renderer#adapter-missing"]);
});

/** One renderer document shaped the way dvisvgm writes it. */
const DVISVGM_SVG =
  "<?xml version='1.0' encoding='UTF-8'?>\n<!-- This file was generated by dvisvgm 3.6 -->\n" +
  "<svg version='1.1' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' width='20pt' height='10pt' viewBox='0 0 20 10'>" +
  "<title>renderer</title><clipPath id='clip1'><path d='M0 0L1.50 1.50'/></clipPath>" +
  "<g id='page1' clip-path='url(#clip1)'><use xlink:href='#clip1'/></g></svg>";

/** The checked-in native Circuit corpus Source: the compatibility baseline. */
const CIRCUIT_CORPUS = fileURLToPath(
  new URL("../docs/language/06-circuit.aze.md", import.meta.url),
);

const circuitFigures = (html) => [
  ...html.matchAll(/<figure class="aze-circuit"[\s\S]*?<\/figure>/g),
].map((match) => match[0]);

test("the compiler embeds one canonical, namespaced TeX projection", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-tex-projection-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const renderer = await fixedAdapter(directory, "dvisvgm.mjs", IDENTITY, `(figure) => ({ index: figure.index, status: "ok", svg: ${JSON.stringify(DVISVGM_SVG)} })`);
  const compiled = await createCompiler({
    texRenderer: { rendererIdentity: IDENTITY, ...renderer },
  }).compile(twoBlockSource(), { format: "html" });
  assert.deepEqual(compiled.diagnostics, []);
  const html = Buffer.from(compiled.artifact.bytes).toString("utf8");

  assert.doesNotMatch(html, /dvisvgm|<\?xml/);
  assert.match(
    html,
    /<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" xmlns:xlink="http:\/\/www\.w3\.org\/1999\/xlink" height="10pt" role="img" version="1\.1" viewBox="0 0 20 10" width="20pt"><title>Analog filter<\/title><desc>A passive low-pass filter\.<\/desc>/,
  );
  // The renderer's own title is replaced, not duplicated; geometry is quantized.
  assert.doesNotMatch(html, /<title>renderer<\/title>/);
  assert.equal(html.match(/<desc>/g)?.length, 2);
  assert.match(html, /d="M0 0L1\.5 1\.5"/);
  // Identifiers carry each figure's batch index and references follow them.
  assert.match(html, /<clipPath id="tex-0-clip1">/);
  assert.match(html, /clip-path="url\(#tex-0-clip1\)"/);
  assert.match(html, /xlink:href="#tex-0-clip1"/);
  assert.match(html, /<clipPath id="tex-1-clip1">/);
  assert.doesNotMatch(html, /id="page1"|id="clip1"/);
});

test("TeX figures inherit the active theme color instead of renderer black", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-tex-theme-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const rendererSvg = DVISVGM_SVG.replace("<g id='page1'", "<g fill='#000' stroke='#000' id='page1'");
  const renderer = await fixedAdapter(directory, "dark-theme.mjs", IDENTITY, `(figure) => ({ index: figure.index, status: "ok", svg: ${JSON.stringify(rendererSvg)} })`);
  const compiled = await createCompiler({
    texRenderer: { rendererIdentity: IDENTITY, ...renderer },
  }).compile(source(), { format: "html", theme: "dark-presentation" });
  assert.deepEqual(compiled.diagnostics, []);

  const html = Buffer.from(compiled.artifact?.bytes).toString("utf8");
  assert.match(html, /fill="currentColor" id="tex-0-page1" stroke="currentColor"/);
  assert.match(html, /color:#e2e8f0/);
});

test("an unsafe or non-self-contained renderer SVG suppresses the whole Artifact", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-tex-unsafe-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const SVG = "http://www.w3.org/2000/svg";
  const responses = [
    ["an embedded script", `<svg xmlns='${SVG}' viewBox='0 0 1 1'><script/></svg>`],
    ["a remote reference", `<svg xmlns='${SVG}' viewBox='0 0 1 1'><image href='https://example.invalid/a.png'/></svg>`],
    ["a dangling identifier", `<svg xmlns='${SVG}' viewBox='0 0 1 1'><g clip-path='url(#missing)'/></svg>`],
    ["malformed XML", "<svg"],
    ["an unbounded extent", `<svg xmlns='${SVG}' viewBox='0 0 50000 1'/>`],
  ];
  for (const [name, svg] of responses) {
    const renderer = await fixedAdapter(directory, `${name.replaceAll(" ", "-")}.mjs`, IDENTITY, `(figure) => ({ index: figure.index, status: "ok", svg: ${JSON.stringify(svg)} })`);
    const compiled = await createCompiler({
      texRenderer: { rendererIdentity: IDENTITY, ...renderer },
    }).compile(twoBlockSource(), { format: "html" });
    assert.equal(compiled.artifact, undefined, name);
    const codes = compiled.diagnostics.map(({ code }) => code);
    assert.equal(codes.length, 2, name);
    assert.equal(codes.every((code) => code === "azeforge.tex#protocol-invalid"), true, name);
  }
});

test("a Circuit-only corpus Source is byte-identical and never invokes a configured TeX renderer", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-tex-circuit-parity-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const invoked = join(directory, "invoked");
  const renderer = await adapter(
    directory,
    "must-not-run.mjs",
    `import { writeFileSync } from "node:fs";
writeFileSync(${JSON.stringify(invoked)}, "");
process.stdin.resume();
`,
  );
  const circuit = await readFile(CIRCUIT_CORPUS, "utf8");
  const withoutRenderer = await createCompiler().compile(circuit, { format: "html" });
  const withRenderer = await createCompiler({
    texRenderer: { rendererIdentity: IDENTITY, ...renderer },
  }).compile(circuit, { format: "html" });

  assert.deepEqual(withRenderer.diagnostics, withoutRenderer.diagnostics);
  assert.equal(withRenderer.contentHash, withoutRenderer.contentHash);
  assert.equal(withRenderer.artifact?.metadata.artifactHash, withoutRenderer.artifact?.metadata.artifactHash);
  assert.equal(withRenderer.artifact?.metadata.rendererFingerprint, withoutRenderer.artifact?.metadata.rendererFingerprint);
  assert.deepEqual(withRenderer.artifact?.bytes, withoutRenderer.artifact?.bytes);
  await assert.rejects(readFile(invoked), { code: "ENOENT" });
});

test("a mixed document preserves the native Circuit fragments and adds only the TeX figure", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-tex-mixed-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const renderer = await fixedAdapter(directory, "mixed.mjs", IDENTITY, `(figure) => ({ index: figure.index, status: "ok", svg: ${JSON.stringify(svg())} })`);
  const circuit = await readFile(CIRCUIT_CORPUS, "utf8");
  const mixed = await createCompiler({
    texRenderer: { rendererIdentity: IDENTITY, ...renderer },
  }).compile(`${circuit}\n${source("tikz")}`, { format: "html" });
  const circuitOnly = await createCompiler().compile(circuit, { format: "html" });
  assert.ok(mixed.artifact !== undefined);
  // The added TeX Block contributes no diagnostic; the native Circuit
  // warnings are exactly the ones the corpus has on its own.
  assert.deepEqual(mixed.diagnostics, circuitOnly.diagnostics);

  const mixedHtml = Buffer.from(mixed.artifact.bytes).toString("utf8");
  const circuitOnlyHtml = Buffer.from(circuitOnly.artifact.bytes).toString("utf8");
  const nativeFragments = circuitFigures(circuitOnlyHtml);
  assert.ok(nativeFragments.length > 1, "the corpus renders native Circuit fragments");
  assert.deepEqual(circuitFigures(mixedHtml), nativeFragments);
  assert.match(mixedHtml, /<figure class="aze-tex" data-tex-profile="tikz">/);
});
