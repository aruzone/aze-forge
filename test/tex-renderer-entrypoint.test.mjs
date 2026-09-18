import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { documentFor } from "../scripts/tex-renderer-document.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const ENTRYPOINT = join(ROOT, "tex-renderer", "entrypoint.sh");
const PROTOCOL = "azeforge.tex-renderer/v1";
const REAL_PERL =
  spawnSync("sh", ["-c", "command -v perl"], { encoding: "utf8" }).stdout.trim() || "/usr/bin/perl";

const LATEX_ARGV =
  "-interaction=nonstopmode -halt-on-error -no-shell-escape -output-format=dvi figure.tex";
const DVISVGM_ARGV = "--page=1 --no-fonts=1 --precision=6 --output=output.svg figure.dvi";
const SVG = '<svg role="img"/>\n';
const IDENTITY = `sha256:${"a".repeat(64)}`;

async function executable(path, source) {
  await writeFile(path, source, { mode: 0o755 });
  await chmod(path, 0o755);
}

/**
 * A harness of stand-ins for the container runtime and TeX tools. The perl
 * stand-in records how the adapter was passed its program and then defers to
 * the real interpreter; the TeX stand-ins record their argv and working
 * directory, capture the exact figure.tex bytes, and can be made to fail based
 * on sentinels in the generated document.
 */
async function fixture(context) {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-tex-entrypoint-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const bin = join(directory, "bin");
  const capture = join(directory, "capture");
  const record = join(directory, "record");
  await mkdir(bin);
  await mkdir(capture);
  await writeFile(record, "");

  await executable(join(bin, "setsid"), '#!/bin/sh\nexec "$@"\n');
  await executable(join(bin, "timeout"), '#!/bin/sh\nshift 2\nexec "$@"\n');
  await executable(
    join(bin, "perl"),
    `#!/bin/sh\nprintf 'perl\\t%s\\n' "$1" >> "$RENDERER_RECORD"\nexec "${REAL_PERL}" "$@"\n`,
  );
  await executable(
    join(bin, "latex"),
    [
      "#!/bin/sh",
      'doc=$(mktemp "$RENDERER_CAPTURE/doc.XXXXXX")',
      'cp figure.tex "$doc"',
      `printf 'latex\\t%s\\t%s\\t%s\\n' "$*" "$PWD" "$doc" >> "$RENDERER_RECORD"`,
      "if grep -q 'AZEFORGE-REJECT-LATEX' figure.tex; then printf '! Undefined control sequence.\\nl.8 \\\\obviously-bad\\n'; exit 1; fi",
      "if grep -q 'AZEFORGE-REJECT-SIZE' figure.tex; then kill -25 $$; fi",
      "touch figure.dvi",
      "",
    ].join("\n"),
  );
  await executable(
    join(bin, "dvisvgm"),
    [
      "#!/bin/sh",
      `printf 'dvisvgm\\t%s\\t%s\\n' "$*" "$PWD" >> "$RENDERER_RECORD"`,
      "if grep -q 'AZEFORGE-REJECT-SVG' figure.tex; then exit 1; fi",
      "if grep -q 'AZEFORGE-REJECT-OUTPUT' figure.tex; then head -c 9437184 /dev/zero | tr '\\0' 'x' > output.svg; exit 0; fi",
      'printf \'%s\' "$RENDERER_SVG" > output.svg',
      "",
    ].join("\n"),
  );
  await executable(
    join(bin, "arbitrary-command"),
    '#!/bin/sh\nprintf \'INVOKED\\tattacker\\n\' >> "$RENDERER_RECORD"\nexit 99\n',
  );

  return { directory, bin, capture, record };
}

function render(harness, { request, identity, argv = [] }) {
  const env = {
    ...process.env,
    PATH: `${harness.bin}:${process.env.PATH}`,
    RENDERER_RECORD: harness.record,
    RENDERER_CAPTURE: harness.capture,
    RENDERER_SVG: SVG,
  };
  if (identity === undefined) delete env.AZEFORGE_TEX_RENDERER_IDENTITY;
  else env.AZEFORGE_TEX_RENDERER_IDENTITY = identity;
  return spawnSync(
    "bash",
    [
      "-c",
      'ulimit() { return 0; }; export -f ulimit; exec bash "$0" "$@"',
      ENTRYPOINT,
      ...argv,
    ],
    { cwd: harness.directory, input: Buffer.from(request, "utf8"), env },
  );
}

async function events(harness) {
  const lines = (await readFile(harness.record, "utf8")).split("\n").filter((line) => line.length > 0);
  return lines.map((line) => {
    const [tool, ...fields] = line.split("\t");
    return { tool, fields };
  });
}

function figure(index, profile, body, title = `Figure ${index}`) {
  return {
    index,
    profile,
    title,
    description: `Description ${index}`,
    body,
    range: {
      start: { line: 5, column: 1, offset: 20 },
      end: { line: 13, column: 5, offset: 175 },
    },
  };
}

test("renders every figure in ascending index order with frozen argv and removes its workspace", async (context) => {
  const harness = await fixture(context);
  const figures = [
    figure(1, "chemfig", "\\chemfig{A}", "arbitrary-command"),
    figure(0, "tikz", "\\draw (0,0) -- (1,1);", "attacker-argument"),
  ];
  const request = JSON.stringify({
    protocol: PROTOCOL,
    figures,
    command: "arbitrary-command",
    argv: ["arbitrary-command", "attacker-argument"],
  });

  const result = render(harness, {
    request,
    identity: IDENTITY,
    argv: ["arbitrary-command", "attacker-argument"],
  });
  assert.equal(result.status, 0, result.stderr.toString());

  const response = JSON.parse(result.stdout.toString("utf8"));
  assert.equal(response.protocol, PROTOCOL);
  assert.equal(response.rendererIdentity, IDENTITY);
  assert.deepEqual(
    response.results.map((entry) => entry.index),
    [0, 1],
  );
  assert.deepEqual(
    response.results.map((entry) => entry.status),
    ["ok", "ok"],
  );
  assert.deepEqual(
    response.results.map((entry) => entry.svg),
    [SVG, SVG],
  );

  const recorded = await events(harness);
  assert.equal(recorded.some((entry) => entry.tool === "INVOKED"), false, "attacker argv ran");
  const latex = recorded.filter((entry) => entry.tool === "latex");
  const dvisvgm = recorded.filter((entry) => entry.tool === "dvisvgm");
  assert.deepEqual(
    latex.map((entry) => entry.fields[0]),
    [LATEX_ARGV, LATEX_ARGV],
  );
  assert.deepEqual(
    dvisvgm.map((entry) => entry.fields[0]),
    [DVISVGM_ARGV, DVISVGM_ARGV],
  );

  // The adapter receives its program on standard input, never as a workspace
  // script (the workspace lives on a noexec tmpfs in the container).
  assert.deepEqual(
    recorded.filter((entry) => entry.tool === "perl").map((entry) => entry.fields[0]),
    ["-"],
  );

  // Documents follow ascending index order and are byte-identical to the
  // profile-owned preamble the compiler expects.
  const ordered = [...figures].sort((left, right) => left.index - right.index);
  const documents = await Promise.all(latex.map((entry) => readFile(entry.fields[2], "utf8")));
  assert.deepEqual(
    documents,
    ordered.map((entry) => documentFor(entry.profile, entry.body)),
  );

  // Each figure runs in its own private directory, and the workspace is gone.
  const directories = latex.map((entry) => entry.fields[1]);
  assert.equal(new Set(directories).size, 2);
  for (const directory of directories) {
    await assert.rejects(stat(directory));
    await assert.rejects(stat(dirname(directory)));
  }
});

test("continues after a per-figure failure so every index gets exactly one result", async (context) => {
  const harness = await fixture(context);
  const figures = [
    figure(0, "tikz", "\\draw (0,0) -- (1,1);\n\\obviously-bad % AZEFORGE-REJECT-LATEX"),
    figure(1, "chemfig", "\\chemfig{A}"),
    figure(2, "pgfplots", "\\addplot {x}; % AZEFORGE-REJECT-SVG"),
  ];
  const result = render(harness, {
    request: JSON.stringify({ protocol: PROTOCOL, figures }),
    identity: IDENTITY,
  });
  assert.equal(result.status, 0, result.stderr.toString());

  const response = JSON.parse(result.stdout.toString("utf8"));
  assert.deepEqual(
    response.results.map((entry) => entry.index),
    [0, 1, 2],
  );
  assert.deepEqual(
    response.results.map((entry) => entry.status),
    ["error", "ok", "error"],
  );
  assert.equal(response.results[0].diagnostic.code, "compile-failed");
  assert.equal(response.results[2].diagnostic.code, "compile-failed");
  // The body-relative location is recovered from the compiler's `l.<line>` log.
  assert.deepEqual(response.results[0].diagnostic.bodyLocation, { line: 2, column: 1 });

  // The diagnostic never leaks a host path or a raw log line.
  for (const entry of response.results) {
    if (entry.status !== "error") continue;
    assert.equal(entry.diagnostic.message.includes("figure-"), false);
    assert.equal(entry.diagnostic.message.includes("/tmp"), false);
    assert.equal(entry.diagnostic.message.includes("obviously-bad"), false);
  }

  const recorded = await events(harness);
  const latex = recorded.filter((entry) => entry.tool === "latex");
  const dvisvgm = recorded.filter((entry) => entry.tool === "dvisvgm");
  assert.equal(latex.length, 3, "every figure reaches the compiler");
  assert.equal(dvisvgm.length, 2, "a failed compile skips the converter");
});

test("reports a workspace file bound as a resource limit", async (context) => {
  const harness = await fixture(context);
  const figures = [figure(0, "tikz", "\\draw (0,0) -- (1,1); % AZEFORGE-REJECT-SIZE")];
  const result = render(harness, {
    request: JSON.stringify({ protocol: PROTOCOL, figures }),
    identity: IDENTITY,
  });
  assert.equal(result.status, 0, result.stderr.toString());
  const response = JSON.parse(result.stdout.toString("utf8"));
  assert.equal(response.results[0].status, "error");
  assert.equal(response.results[0].diagnostic.code, "resource-limit");
});

test("echoes the renderer identity from the environment, empty when unset", async (context) => {
  const harness = await fixture(context);
  const figures = [figure(0, "tikz", "\\draw (0,0) -- (1,1);")];
  const request = JSON.stringify({ protocol: PROTOCOL, figures });

  const set = render(harness, { request, identity: IDENTITY });
  assert.equal(set.status, 0, set.stderr.toString());
  assert.equal(JSON.parse(set.stdout.toString("utf8")).rendererIdentity, IDENTITY);

  const unset = render(harness, { request });
  assert.equal(unset.status, 0, unset.stderr.toString());
  assert.equal(JSON.parse(unset.stdout.toString("utf8")).rendererIdentity, "");
});

test("round-trips quoted, backslashed, tabbed, newlined, and non-ASCII content", async (context) => {
  const harness = await fixture(context);
  const body = '\\draw (0,0) -- (1,1);\n"quoted"\t\\backslash ünïcode 図';
  const figures = [figure(0, "tikz", body, "Διάγραμμα — 図 \u{1f600}")];
  const result = render(harness, {
    request: JSON.stringify({ protocol: PROTOCOL, figures }),
    identity: IDENTITY,
  });
  assert.equal(result.status, 0, result.stderr.toString());
  const response = JSON.parse(result.stdout.toString("utf8"));
  assert.deepEqual(
    response.results.map((entry) => entry.status),
    ["ok"],
  );

  const latex = (await events(harness)).filter((entry) => entry.tool === "latex");
  const document = await readFile(latex[0].fields[2], "utf8");
  assert.equal(document, documentFor("tikz", body));

  // A request whose title uses \u escapes (including a surrogate pair) parses
  // without corrupting the body that follows it.
  const escaped = String.raw`{"protocol":"azeforge.tex-renderer/v1","figures":[{"index":0,"profile":"chemfig","title":"\u0394\u00e9\ud83d\ude00","description":"D","body":"\\chemfig{A}","range":{"start":{"line":1,"column":1,"offset":0},"end":{"line":1,"column":1,"offset":0}}}]}`;
  const escapedResult = render(harness, { request: escaped, identity: IDENTITY });
  assert.equal(escapedResult.status, 0, escapedResult.stderr.toString());
  const escapedResponse = JSON.parse(escapedResult.stdout.toString("utf8"));
  assert.deepEqual(
    escapedResponse.results.map((entry) => entry.status),
    ["ok"],
  );

  const escapedLatex = (await events(harness)).filter((entry) => entry.tool === "latex");
  const escapedDocument = await readFile(escapedLatex[1].fields[2], "utf8");
  assert.equal(escapedDocument, documentFor("chemfig", "\\chemfig{A}"));
});

test("builds the profile-owned preamble byte-identically to documentFor", async (context) => {
  const harness = await fixture(context);
  const profiles = ["circuitikz", "tikz", "pgfplots", "chemfig", "tikz-cd"];
  const bodies = [
    "\\draw (0,0) to[R] (2,0);",
    "\\draw (0,0) -- (1,1);",
    "\\addplot {x};",
    "\\chemfig{A}",
    "\\arrow[r] & B",
  ];
  const figures = profiles.map((profile, index) => figure(index, profile, bodies[index]));
  const result = render(harness, {
    request: JSON.stringify({ protocol: PROTOCOL, figures }),
    identity: IDENTITY,
  });
  assert.equal(result.status, 0, result.stderr.toString());
  const response = JSON.parse(result.stdout.toString("utf8"));
  assert.deepEqual(
    response.results.map((entry) => entry.status),
    profiles.map(() => "ok"),
  );

  const latex = (await events(harness)).filter((entry) => entry.tool === "latex");
  const documents = await Promise.all(latex.map((entry) => readFile(entry.fields[2], "utf8")));
  assert.deepEqual(
    documents,
    profiles.map((profile, index) => documentFor(profile, bodies[index])),
  );
});

test("reports an SVG exceeding the response bound as an output limit", async (context) => {
  const harness = await fixture(context);
  const figures = [figure(0, "tikz", "\\draw (0,0) -- (1,1); % AZEFORGE-REJECT-OUTPUT")];
  const result = render(harness, {
    request: JSON.stringify({ protocol: PROTOCOL, figures }),
    identity: IDENTITY,
  });
  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.length <= 8388608, true, "response stays inside the 8 MiB bound");
  const response = JSON.parse(result.stdout.toString("utf8"));
  assert.equal(response.results[0].status, "error");
  assert.equal(response.results[0].diagnostic.code, "output-limit");
});

test("rejects a request larger than 1 MiB before rendering", async (context) => {
  const harness = await fixture(context);
  const result = render(harness, { request: "x".repeat(1048577), identity: IDENTITY });
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout.length, 0);
  assert.match(result.stderr.toString("utf8"), /1 MiB/);
  assert.equal((await events(harness)).length, 0, "no tool runs for an oversized request");
});
