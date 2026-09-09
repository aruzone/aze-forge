// PROTOTYPE: throwaway single-user AzeForge Web loop.
// Serves a rough frontend plus an ephemeral Node service that compiles
// Source through the local compiler library. No accounts, persistence, or
// production styling.

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { createCompiler, buildCapabilities, TOOL_VERSION } from "../../dist/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATIC_ROOT = __dirname;
const PORT = Number(process.env.PORT ?? 8080);

const compiler = createCompiler();
let capabilitiesReport = null;

try {
  capabilitiesReport = await buildCapabilities({ probe: false });
} catch {
  // If probing crashes for any reason, leave capabilities empty so the
  // prototype UI can still demonstrate compile loop failures.
  capabilitiesReport = { schema: "azeforge.capabilities/v1", schemaVersion: 1, tool: { name: "azeforge", version: TOOL_VERSION }, formats: [], commands: [], themes: [], engines: [], limits: [] };
}

const jobs = new Map();

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".pdf": "application/pdf",
};

function send(res, status, data, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Access-Control-Allow-Origin": "*" });
  res.end(typeof data === "string" ? data : JSON.stringify(data));
}

async function readBodyJSON(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function artifactFileName(format) {
  return `artifact.${format}`;
}

async function executeJob(operation, payload) {
  const sourceText = payload.source?.text ?? "";
  const sourceName = payload.source?.name ?? "untitled.aze.md";
  const theme = payload.theme ?? "default";

  if (operation === "format") {
    const result = compiler.format(sourceText, { sourceName });
    return {
      ok: result.success,
      diagnostics: [...result.diagnostics],
      proposal: result.success ? result.formatted : undefined,
    };
  }

  if (operation === "migrate") {
    return {
      ok: false,
      diagnostics: [{ severity: "error", code: "prototype.migrate-unsupported", message: "Explicit migrate operation is not wired in this prototype.", range: { start: { line: 1, column: 1, byte: 0 }, end: { line: 1, column: 1, byte: 0 } } }],
    };
  }

  if (operation === "analyze") {
    const parse = compiler.parse(sourceText, { sourceName });
    const validation = compiler.validate(parse);
    return {
      ok: validation.success,
      diagnostics: [...validation.diagnostics],
      contentHash: validation.contentHash,
    };
  }

  // compile
  const format = payload.format ?? "html";
  const result = await compiler.compile(sourceText, { format, theme, sourceName, allowRawLatex: false });
  return {
    ok: result.artifact !== undefined,
    diagnostics: [...result.diagnostics],
    contentHash: result.contentHash,
    artifactMeta: result.artifact
      ? {
          format: result.artifact.metadata.format,
          mimeType: result.artifact.metadata.mimeType,
          byteLength: result.artifact.metadata.byteLength,
          artifactHash: result.artifact.metadata.artifactHash,
          theme: result.artifact.metadata.theme,
        }
      : undefined,
    artifactBytes: result.artifact ? Buffer.from(result.artifact.bytes) : undefined,
  };
}

function createJob(operation, payload) {
  const id = randomUUID().slice(0, 8);
  const requestId = payload.requestId ?? randomUUID();
  const revision = payload.revision ?? randomUUID();
  const job = { id, state: "running", operation, requestId, revision, createdAt: Date.now() };
  jobs.set(id, job);
  executeJob(operation, payload)
    .then((result) => {
      job.state = "completed";
      job.ok = result.ok;
      job.diagnostics = result.diagnostics;
      job.contentHash = result.contentHash;
      job.artifactMeta = result.artifactMeta;
      job.artifactBytes = result.artifactBytes;
      job.proposal = result.proposal;
    })
    .catch((error) => {
      job.state = "failed";
      job.serviceError = { code: "service.internal", message: error.message };
    });
  return job;
}

function jobResult(job) {
  const base = {
    id: job.id,
    state: job.state,
    operation: job.operation,
    requestId: job.requestId,
    revision: job.revision,
    compiler: { name: "azeforge", version: TOOL_VERSION },
  };
  if (job.state === "completed") {
    return {
      ...base,
      ok: job.ok,
      diagnostics: job.diagnostics,
      contentHash: job.contentHash,
      artifactMeta: job.artifactMeta,
      proposal: job.proposal,
    };
  }
  if (job.state === "failed") {
    return { ...base, serviceError: job.serviceError };
  }
  return { ...base, diagnostics: [] };
}

async function serveStatic(res, pathname) {
  const safe = pathname.replace(/\.{2,}/g, "");
  const filePath = resolve(STATIC_ROOT, safe === "/" ? "index.html" : safe.slice(1));
  const ext = extname(filePath).toLowerCase();
  try {
    const s = await stat(filePath);
    if (!s.isFile()) throw new Error("not a file");
    const body = await readFile(filePath);
    send(res, 200, body, MIME_TYPES[ext] ?? "application/octet-stream");
  } catch {
    send(res, 404, { code: "not-found", message: `No file at ${pathname}` });
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  if (req.method === "OPTIONS") return send(res, 204, "");

  try {
    if (pathname === "/api/capabilities" && req.method === "GET") {
      return send(res, 200, capabilitiesReport);
    }

    if (pathname === "/api/examples" && req.method === "GET") {
      const examples = JSON.parse(await readFile(join(STATIC_ROOT, "examples.json"), "utf8"));
      return send(res, 200, examples);
    }

    if (pathname === "/api/jobs" && req.method === "POST") {
      const body = await readBodyJSON(req);
      const operation = body.operation ?? "compile";
      const job = createJob(operation, body);
      res.writeHead(202, { "Content-Type": "application/json; charset=utf-8", "Location": `/api/jobs/${job.id}` });
      return res.end(JSON.stringify({ id: job.id, state: job.state, operation, location: `/api/jobs/${job.id}` }));
    }

    const jobMatch = pathname.match(/^\/api\/jobs\/([a-zA-Z0-9-]+)$/);
    if (jobMatch && req.method === "GET") {
      const job = jobs.get(jobMatch[1]);
      if (!job) return send(res, 404, { code: "not-found", message: "Unknown job" });
      return send(res, 200, jobResult(job));
    }

    const artifactMatch = pathname.match(/^\/api\/jobs\/([a-zA-Z0-9-]+)\/artifact$/);
    if (artifactMatch && req.method === "GET") {
      const job = jobs.get(artifactMatch[1]);
      if (!job || job.state !== "completed" || !job.artifactBytes) return send(res, 404, { code: "not-found", message: "No artifact available" });
      res.writeHead(200, {
        "Content-Type": job.artifactMeta.mimeType,
        "Content-Length": String(job.artifactBytes.length),
        "Content-Disposition": `inline; filename="${artifactFileName(job.artifactMeta.format)}"`,
        "Access-Control-Allow-Origin": "*",
      });
      return res.end(job.artifactBytes);
    }

    await serveStatic(res, pathname);
  } catch (error) {
    send(res, 500, { code: "service.internal", message: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`AzeForge Web prototype listening on http://127.0.0.1:${PORT}/`);
  console.log("Ctrl+C to stop");
});
