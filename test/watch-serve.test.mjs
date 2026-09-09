import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const CLI_PATH = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const VALID_SOURCE = `---
azemark: 2
title: Watch report
---

# Result

Deterministic prose.
`;
const INVALID_SOURCE = "Before\n\n<div>\n\nAfter\n";
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function runCliSync(arguments_, cwd) {
  return spawnSync(process.execPath, [CLI_PATH, ...arguments_], {
    cwd,
    encoding: null,
  });
}

function startCli(arguments_, cwd) {
  const child = spawn(process.execPath, [CLI_PATH, ...arguments_], {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  return {
    child,
    output: () => ({ stdout, stderr }),
  };
}

async function waitFor(condition, timeoutMs, label) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`timed out waiting for ${label}`);
}

function stopAfter(context, handle) {
  context.after(async () => {
    if (handle.child.exitCode !== null || handle.child.signalCode !== null) return;
    handle.child.kill("SIGKILL");
    await new Promise((resolve) => handle.child.on("close", resolve));
  });
}
async function serveUrl(handle, timeoutMs) {
  let url = "";
  await waitFor(() => {
    const match = handle.output().stderr.match(/serve: listening on (http:\/\/127\.0\.0\.1:\d+\/) for/);
    if (match?.[1] !== undefined) {
      url = match[1];
      return true;
    }
    return false;
  }, timeoutMs, "serve listen");
  return url;
}

test("watch usage errors exit 2 without stdout Artifacts", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-watch-usage-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "report.aze.md"), VALID_SOURCE);

  for (const args of [
    ["watch", "report.aze.md"],
    ["watch", "report.aze.md", "--stdout", "--format", "html"],
    ["watch", "report.aze.md", "--output", "report.html", "--format", "pdf"],
  ]) {
    const result = runCliSync(args, directory);
    assert.equal(result.status, 2, args.join(" "));
  }
});

test("watch JSON usage errors stay one finite diagnostics document", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-watch-json-usage-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "report.aze.md"), VALID_SOURCE);

  const result = runCliSync(
    ["watch", "report.aze.md", "--diagnostics", "json"],
    directory,
  );
  assert.equal(result.status, 2);
  const payload = JSON.parse(result.stdout.toString("utf8"));
  assert.equal(payload.schema, "azeforge.diagnostics/v1");
  assert.equal(payload.command, "watch");
  assert.equal(payload.success, false);
});

test("serve rejects format, output, host, and bad port options", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-serve-usage-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "report.aze.md"), VALID_SOURCE);

  for (const args of [
    ["serve", "report.aze.md", "--format", "html"],
    ["serve", "report.aze.md", "--output", "report.html"],
    ["serve", "report.aze.md", "--stdout"],
    ["serve", "report.aze.md", "--host", "0.0.0.0"],
    ["serve", "report.aze.md", "--port", "99999"],
    ["serve", "report.aze.md", "--port", "often"],
  ]) {
    const result = runCliSync(args, directory);
    assert.equal(result.status, 2, args.join(" "));
  }
});

test("watch compiles immediately, rebuilds, and keeps stdout pure", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-watch-cycle-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "report.aze.md"), VALID_SOURCE);

  const handle = startCli(["watch", "report.aze.md", "--output", "report.html"], directory);
  stopAfter(context, handle);
  const artifact = join(directory, "report.html");
  await waitFor(async () => {
    try {
      return (await readFile(artifact, "utf8")).includes("Result");
    } catch {
      return false;
    }
  }, 20000, "initial compile");

  await writeFile(join(directory, "report.aze.md"), VALID_SOURCE.replace("Result", "Rebuilt"));
  await waitFor(async () => (await readFile(artifact, "utf8")).includes("Rebuilt"), 20000, "rebuild");

  handle.child.kill("SIGTERM");
  const code = await new Promise((resolve) => handle.child.on("close", resolve));
  if (process.platform !== "win32") assert.equal(code, 143);
  assert.equal(handle.output().stdout, "");
  assert.match(handle.output().stderr, /watch: watching .* → report\.html/);
});

test("failed watch cycles preserve the last Artifact and continue", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-watch-failure-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "report.aze.md"), VALID_SOURCE);

  const handle = startCli(["watch", "report.aze.md", "--output", "report.html"], directory);
  stopAfter(context, handle);
  const artifact = join(directory, "report.html");
  await waitFor(async () => {
    try {
      return (await readFile(artifact, "utf8")).includes("Result");
    } catch {
      return false;
    }
  }, 20000, "initial compile");

  await writeFile(join(directory, "report.aze.md"), INVALID_SOURCE);
  await waitFor(() => handle.output().stderr.includes("watch: failed"), 20000, "failure report");
  assert.match(handle.output().stderr, /azeforge\.security#raw-html-disabled/);
  assert.ok((await readFile(artifact, "utf8")).includes("Result"));

  await writeFile(join(directory, "report.aze.md"), VALID_SOURCE.replace("Result", "Recovered"));
  await waitFor(async () => (await readFile(artifact, "utf8")).includes("Recovered"), 20000, "recovery");
});

test("watch file Artifacts never contain the preview shell", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-watch-shell-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "report.aze.md"), VALID_SOURCE);

  const rendered = runCliSync(["render", "report.aze.md", "--output", "rendered.html"], directory);
  assert.equal(rendered.status, 0);

  const handle = startCli(["watch", "report.aze.md", "--output", "watched.html"], directory);
  stopAfter(context, handle);
  await waitFor(async () => {
    try {
      await readFile(join(directory, "watched.html"), "utf8");
      return true;
    } catch {
      return false;
    }
  }, 20000, "watch compile");
  handle.child.kill("SIGTERM");
  await new Promise((resolve) => handle.child.on("close", resolve));

  const [renderedBytes, watchedBytes] = await Promise.all([
    readFile(join(directory, "rendered.html"), "utf8"),
    readFile(join(directory, "watched.html"), "utf8"),
  ]);
  assert.equal(watchedBytes, renderedBytes);
  assert.ok(!watchedBytes.includes('EventSource("/events")'));
});

test("watch machine mode emits ordered events with increasing sequences", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-watch-events-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "report.aze.md"), VALID_SOURCE);

  const handle = startCli(
    ["watch", "report.aze.md", "--output", "report.html", "--diagnostics", "json"],
    directory,
  );
  stopAfter(context, handle);
  const lines = () => handle.output().stdout.split("\n").filter((line) => line.trim() !== "");
  await waitFor(() => lines().length >= 2, 20000, "started and result events");

  await writeFile(join(directory, "report.aze.md"), INVALID_SOURCE);
  await waitFor(() => lines().length >= 3, 20000, "failure result event");

  const events = lines().map((line) => JSON.parse(line));
  assert.deepEqual(
    events.map(({ seq, kind }) => ({ seq, kind })),
    [
      { seq: 0, kind: "started" },
      { seq: 1, kind: "result" },
      { seq: 2, kind: "result" },
    ],
  );
  for (const event of events) {
    assert.equal(event.schema, "azeforge.event/v1");
    assert.equal(event.command, "watch");
  }
  assert.equal(events[0].artifact, "report.html");
  assert.equal(events[0].format, "html");
  assert.equal(events[1].success, true);
  assert.ok("artifact" in events[1]);
  assert.equal(events[2].success, false);
  assert.ok(!("artifact" in events[2]));
  assert.equal(handle.output().stderr, "");
});

test("watch observes a previously missing asset when created", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-watch-missing-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "doc.aze.md"), "---\nazemark: 2\n---\n\n# Doc\n\n![alt](late.png)\n");

  const handle = startCli(["watch", "doc.aze.md", "--output", "doc.html"], directory);
  stopAfter(context, handle);
  await waitFor(() => handle.output().stderr.includes("watch: failed"), 20000, "missing asset failure");

  await writeFile(join(directory, "late.png"), PNG_BYTES);
  await waitFor(async () => {
    try {
      return (await readFile(join(directory, "doc.html"), "utf8")).includes("data:image/png;base64");
    } catch {
      return false;
    }
  }, 20000, "rebuild after asset creation");
});

test("serve previews on loopback with preview, SSE, and opaque asset routes", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-serve-routes-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "report.aze.md"), VALID_SOURCE);
  const handle = startCli(["serve", "report.aze.md", "--port", "0"], directory);
  stopAfter(context, handle);
  const url = await serveUrl(handle, 20000);
  assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
  await waitFor(async () => (await (await fetch(url)).text()).includes("Result"), 20000, "initial preview");

  const preview = await fetch(url);
  assert.equal(preview.status, 200);
  assert.equal(preview.headers.get("content-type"), "text/html; charset=utf-8");
  assert.match(preview.headers.get("content-security-policy") ?? "", /script-src 'sha256-[A-Za-z0-9+/=]+'/);
  assert.match(preview.headers.get("content-security-policy") ?? "", /connect-src http:\/\/127\.0\.0\.1:\*/);
  assert.equal(preview.headers.get("cache-control"), "no-store");
  assert.equal(preview.headers.get("access-control-allow-origin"), null);
  const previewBody = await preview.text();
  assert.ok(previewBody.includes('new EventSource("/events")'));
  assert.ok(previewBody.includes("Result"));

  const events = await fetch(`${url}events`);
  assert.equal(events.status, 200);
  assert.equal(events.headers.get("content-type"), "text/event-stream; charset=utf-8");
  const reader = events.body.getReader();
  const first = await reader.read();
  assert.match(new TextDecoder().decode(first.value).slice(0, 40), /event: ready/);
  await reader.cancel();

  assert.equal((await fetch(`${url}missing`)).status, 404);
  assert.equal((await fetch(`${url}assets/${"0".repeat(64)}`)).status, 404);
  assert.equal((await fetch(url, { method: "POST" })).status, 404);

  handle.child.kill("SIGINT");
  const code = await new Promise((resolve) => handle.child.on("close", resolve));
  if (process.platform !== "win32") assert.equal(code, 130);
  assert.equal(handle.output().stdout, "");
});


test("serve replaces stale preview with current diagnostics", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-serve-diagnostics-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "report.aze.md"), VALID_SOURCE);

  const handle = startCli(["serve", "report.aze.md", "--port", "0"], directory);
  stopAfter(context, handle);
  const url = await serveUrl(handle, 20000);
  await waitFor(async () => (await (await fetch(url)).text()).includes("Result"), 20000, "initial preview");

  await writeFile(join(directory, "report.aze.md"), INVALID_SOURCE);
  await waitFor(
    async () => (await (await fetch(url)).text()).includes("Preview diagnostics"),
    20000,
    "diagnostics page",
  );
  const stale = await (await fetch(url)).text();
  assert.ok(!stale.includes("Result"));
  assert.ok(stale.includes('new EventSource("/events")'));

  await writeFile(join(directory, "report.aze.md"), VALID_SOURCE.replace("Result", "Restored"));
  await waitFor(async () => (await (await fetch(url)).text()).includes("Restored"), 20000, "preview restore");
});

test("serve machine mode reports the preview URL and Artifact metadata", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-serve-events-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "report.aze.md"), VALID_SOURCE);

  const handle = startCli(["serve", "report.aze.md", "--port", "0", "--diagnostics", "json"], directory);
  stopAfter(context, handle);
  const lines = () => handle.output().stdout.split("\n").filter((line) => line.trim() !== "");
  await waitFor(() => lines().length >= 2, 20000, "serve started and result events");

  const events = lines().map((line) => JSON.parse(line));
  assert.equal(events[0].schema, "azeforge.event/v1");
  assert.equal(events[0].command, "serve");
  assert.equal(events[0].seq, 0);
  assert.equal(events[0].kind, "started");
  assert.match(events[0].url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
  assert.equal(events[1].seq, 1);
  assert.equal(events[1].kind, "result");
  assert.equal(events[1].success, true);
  assert.equal(events[1].url, events[0].url);
  assert.equal(events[1].artifact.format, "html");
  assert.equal(handle.output().stderr, "");

  const preview = await fetch(events[0].url);
  assert.equal(preview.status, 200);
});

test("serve notifies reload clients after a rebuild", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-serve-reload-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "report.aze.md"), VALID_SOURCE);

  const handle = startCli(["serve", "report.aze.md", "--port", "0"], directory);
  stopAfter(context, handle);
  const url = await serveUrl(handle, 20000);
  await waitFor(async () => (await (await fetch(url)).text()).includes("Result"), 20000, "initial preview");

  const events = await fetch(`${url}events`);
  const reader = events.body.getReader();
  const decoder = new TextDecoder();
  let seen = "";
  const pump = (async () => {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      seen += decoder.decode(chunk.value);
      if (seen.includes("event: reload")) break;
    }
  })();
  await writeFile(join(directory, "report.aze.md"), VALID_SOURCE.replace("Result", "Reloaded"));
  await waitFor(async () => (await (await fetch(url)).text()).includes("Reloaded"), 20000, "rebuilt preview");
  await pump;
  assert.ok(seen.includes("event: reload"));
  await reader.cancel();
});

test("serve on an occupied port fails with one finite diagnostics document", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-serve-port-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "report.aze.md"), VALID_SOURCE);

  const blocker = createServer((_request, response) => response.end("busy"));
  await new Promise((resolve) => blocker.listen(0, "127.0.0.1", resolve));
  const address = blocker.address();
  assert.ok(typeof address === "object" && address !== null);
  const port = String(address.port);
  context.after(() => blocker.close());

  const result = runCliSync(["serve", "report.aze.md", "--port", port, "--diagnostics", "json"], directory);
  assert.equal(result.status, 1);
  const payload = JSON.parse(result.stdout.toString("utf8"));
  assert.equal(payload.schema, "azeforge.diagnostics/v1");
  assert.equal(payload.command, "serve");
  assert.equal(payload.success, false);
});
