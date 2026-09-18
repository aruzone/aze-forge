/**
 * TeX renderer batch transport: builds the compiler-owned request, spawns the
 * configured fixed-argv command once per compiler invocation, validates the
 * single JSON response, and maps adapter failures to stable categories.
 *
 * The command receives one UTF-8 JSON request on standard input and writes one
 * UTF-8 JSON response on standard output. Author Source never contributes an
 * executable, argv entry, path, or resource-limit setting.
 */

import { spawn } from "node:child_process";
import type {
  SourcePosition,
  SourceRange,
  TexBlock,
  TexBodyLocation,
  TexRenderDiagnostic,
  TexRenderFigureRequest,
  TexRenderRequest,
  TexRenderResponse,
  TexRenderResult,
  TexRenderer,
  TexRendererFailureCategory,
} from "./model.js";
import {
  TEX_RENDERER_PROTOCOL,
  TEX_RENDER_REQUEST_MAX_BYTES,
  TEX_RENDER_RESPONSE_MAX_BYTES,
} from "./model.js";
import { rangeFromLineSlice } from "./source-map.js";
import type { SourceLine } from "./source-map.js";

/** Maximum captured standard-error bytes used only for failure classification. */
const STDERR_CAPTURE_MAX_BYTES = 4_194_304;

/** Adapter-reported error codes mapped onto the compiler's failure categories. */
const ADAPTER_ERROR_CATEGORIES: Readonly<Record<string, TexRendererFailureCategory>> = {
  "adapter-unavailable": "adapter-unavailable",
  timeout: "timeout",
  "resource-limit": "resource-limit",
  "output-limit": "resource-limit",
  "sandbox-denied": "sandbox-denied",
  "compile-failed": "compile-failed",
  "protocol-invalid": "protocol-invalid",
};

/** A stable, host-path-free TeX renderer failure category. */
export class TexAdapterFailure extends Error {
  override readonly name = "TexAdapterFailure";

  constructor(readonly category: TexRendererFailureCategory) {
    super(category);
  }
}

/** The compiler cancelled the batch; the command process group is dead. */
export class TexAdapterCancelled extends Error {
  override readonly name = "TexAdapterCancelled";

  constructor() {
    super("The TeX renderer batch was cancelled.");
  }
}

export function buildTexRenderRequest(blocks: readonly TexBlock[]): TexRenderRequest {
  const figures: TexRenderFigureRequest[] = blocks.map((block, index) => ({
    index,
    profile: block.profile,
    title: block.title,
    description: block.description,
    body: block.body,
    range: block.range,
  }));
  return { protocol: TEX_RENDERER_PROTOCOL, figures };
}

function adapterCategory(code: string): TexRendererFailureCategory {
  return ADAPTER_ERROR_CATEGORIES[code] ?? "compile-failed";
}

/**
 * Runs one renderer command for one compiler invocation. Resolves with the
 * validated response; every transport or protocol violation rejects with a
 * `TexAdapterFailure` whose category the compiler reports at the affected
 * Blocks.
 */
export async function runTexRendererBatch(
  renderer: TexRenderer,
  request: TexRenderRequest,
  options: { readonly timeoutMs: number; readonly signal?: AbortSignal },
): Promise<TexRenderResponse> {
  const payload = Buffer.from(JSON.stringify(request), "utf8");
  if (payload.byteLength > TEX_RENDER_REQUEST_MAX_BYTES) {
    throw new TexAdapterFailure("resource-limit");
  }
  if (options.signal?.aborted === true) throw new TexAdapterCancelled();

  return await new Promise<TexRenderResponse>((resolve, reject) => {
    const child = spawn(renderer.command, [...(renderer.args ?? [])], {
      stdio: ["pipe", "pipe", "pipe"],
      detached: true,
      windowsHide: true,
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    let timedOut = false;
    let cancelled = false;
    let overflowed = false;
    let killTimer: NodeJS.Timeout | undefined;

    const finish = (error?: Error, value?: TexRenderResponse): void => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      clearTimeout(killTimer);
      options.signal?.removeEventListener("abort", onAbort);
      if (error === undefined) resolve(value as TexRenderResponse);
      else reject(error);
    };

    const killGroup = (): void => {
      const pid = child.pid;
      if (pid === undefined) return;
      try {
        process.kill(-pid, "SIGTERM");
      } catch {
        try {
          child.kill("SIGTERM");
        } catch {
          // The process already exited.
        }
      }
      killTimer ??= setTimeout(() => {
        try {
          process.kill(-pid, "SIGKILL");
        } catch {
          // The process group already exited.
        }
      }, 1000);
    };

    const onAbort = (): void => {
      cancelled = true;
      killGroup();
    };

    const deadline = setTimeout(() => {
      timedOut = true;
      killGroup();
    }, options.timeoutMs);

    if (options.signal !== undefined) {
      if (options.signal.aborted) {
        onAbort();
      } else {
        options.signal.addEventListener("abort", onAbort, { once: true });
      }
    }

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.byteLength;
      if (stdoutBytes > TEX_RENDER_RESPONSE_MAX_BYTES) {
        overflowed = true;
        killGroup();
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.byteLength;
      if (stderrBytes > STDERR_CAPTURE_MAX_BYTES) return;
      stderr.push(chunk);
    });
    child.once("error", () => finish(new TexAdapterFailure("adapter-unavailable")));
    child.stdin.once("error", () => {
      // A command that exits before reading all input closes the pipe; the
      // exit code below owns the category.
    });
    child.once("close", (code, signal) => {
      if (cancelled) {
        finish(new TexAdapterCancelled());
        return;
      }
      if (timedOut) {
        finish(new TexAdapterFailure("timeout"));
        return;
      }
      if (overflowed) {
        finish(new TexAdapterFailure("resource-limit"));
        return;
      }
      const log = Buffer.concat(stderr, Math.min(stderrBytes, STDERR_CAPTURE_MAX_BYTES)).toString("utf8");
      if (code !== 0) {
        finish(new TexAdapterFailure(classifyExit(code, signal, log)));
        return;
      }
      let response: unknown;
      try {
        response = JSON.parse(Buffer.concat(stdout, stdoutBytes).toString("utf8"));
      } catch {
        finish(new TexAdapterFailure("protocol-invalid"));
        return;
      }
      try {
        finish(undefined, validateTexRenderResponse(response, request, renderer.rendererIdentity));
      } catch (error) {
        finish(error instanceof Error ? error : new TexAdapterFailure("protocol-invalid"));
      }
    });

    child.stdin.end(payload);
  });
}

function classifyExit(
  code: number | null,
  signal: NodeJS.Signals | null,
  log: string,
): TexRendererFailureCategory {
  if (signal !== null) return "timeout";
  if (code === 125) return "adapter-unavailable";
  if (code === 137 || /limit|quota|no space|file too large|resource temporarily unavailable/i.test(log)) {
    return "resource-limit";
  }
  if (/denied|not permitted|not allowed|shell escape|network is unreachable|read-only file system/i.test(log)) {
    return "sandbox-denied";
  }
  return "compile-failed";
}

/**
 * Validates transport framing, the protocol discriminant, renderer identity,
 * and the exact one-result-per-index set. Any violation throws a
 * `protocol-invalid` failure.
 */
function validateTexRenderResponse(
  value: unknown,
  request: TexRenderRequest,
  rendererIdentity: string,
): TexRenderResponse {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TexAdapterFailure("protocol-invalid");
  }
  const record = value as Record<string, unknown>;
  if (record.protocol !== TEX_RENDERER_PROTOCOL) {
    throw new TexAdapterFailure("protocol-invalid");
  }
  if (record.rendererIdentity !== rendererIdentity) {
    throw new TexAdapterFailure("protocol-invalid");
  }
  if (!Array.isArray(record.results) || record.results.length !== request.figures.length) {
    throw new TexAdapterFailure("protocol-invalid");
  }
  const results: TexRenderResult[] = [];
  const seen = new Set<number>();
  for (const entry of record.results) {
    const result = validateTexRenderResult(entry, request.figures.length);
    if (seen.has(result.index)) throw new TexAdapterFailure("protocol-invalid");
    seen.add(result.index);
    if (result.status === "error" && result.diagnostic.bodyLocation !== undefined) {
      validateBodyLocationInBody(result.diagnostic.bodyLocation, request.figures[result.index]?.body ?? "");
    }
    results.push(result);
  }
  for (let index = 0; index < request.figures.length; index += 1) {
    if (!seen.has(index)) throw new TexAdapterFailure("protocol-invalid");
  }
  results.sort((left, right) => left.index - right.index);
  return {
    protocol: TEX_RENDERER_PROTOCOL,
    rendererIdentity: rendererIdentity as TexRenderResponse["rendererIdentity"],
    results,
  };
}

function validateTexRenderResult(value: unknown, figureCount: number): TexRenderResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TexAdapterFailure("protocol-invalid");
  }
  const record = value as Record<string, unknown>;
  const index = record.index;
  if (typeof index !== "number" || !Number.isInteger(index) || index < 0 || index >= figureCount) {
    throw new TexAdapterFailure("protocol-invalid");
  }
  if (record.status === "ok") {
    if (typeof record.svg !== "string" || record.svg.length === 0) {
      throw new TexAdapterFailure("protocol-invalid");
    }
    return { index, status: "ok", svg: record.svg };
  }
  if (record.status === "error") {
    return { index, status: "error", diagnostic: validateTexRenderDiagnostic(record.diagnostic) };
  }
  throw new TexAdapterFailure("protocol-invalid");
}

function validateTexRenderDiagnostic(value: unknown): TexRenderDiagnostic {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TexAdapterFailure("protocol-invalid");
  }
  const record = value as Record<string, unknown>;
  if (typeof record.code !== "string" || typeof record.message !== "string") {
    throw new TexAdapterFailure("protocol-invalid");
  }
  const diagnostic: {
    code: string;
    message: string;
    bodyLocation?: TexBodyLocation;
    detail?: string;
  } = { code: record.code, message: record.message };
  if (record.detail !== undefined) {
    if (typeof record.detail !== "string") throw new TexAdapterFailure("protocol-invalid");
    diagnostic.detail = record.detail;
  }
  if (record.bodyLocation !== undefined) {
    diagnostic.bodyLocation = validateTexBodyLocation(record.bodyLocation);
  }
  return diagnostic;
}

/**
 * Rejects an adapter location that cannot exist inside the figure body: past
 * the last line, or an end before its start. Columns are clamped when mapped.
 */
function validateBodyLocationInBody(location: TexBodyLocation, body: string): void {
  const lineCount = body.split("\n").length;
  if (location.line > lineCount) throw new TexAdapterFailure("protocol-invalid");
  if (location.endLine === undefined || location.endColumn === undefined) return;
  if (location.endLine > lineCount) throw new TexAdapterFailure("protocol-invalid");
  if (
    location.endLine < location.line ||
    (location.endLine === location.line && location.endColumn < location.column)
  ) {
    throw new TexAdapterFailure("protocol-invalid");
  }
}

function validateTexBodyLocation(value: unknown): TexBodyLocation {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TexAdapterFailure("protocol-invalid");
  }
  const record = value as Record<string, unknown>;
  const line = record.line;
  const column = record.column;
  if (typeof line !== "number" || !Number.isInteger(line) || line < 1) {
    throw new TexAdapterFailure("protocol-invalid");
  }
  if (typeof column !== "number" || !Number.isInteger(column) || column < 1) {
    throw new TexAdapterFailure("protocol-invalid");
  }
  const location: {
    line: number;
    column: number;
    endLine?: number;
    endColumn?: number;
  } = { line, column };
  if (record.endLine !== undefined || record.endColumn !== undefined) {
    if (
      typeof record.endLine !== "number" ||
      !Number.isInteger(record.endLine) ||
      record.endLine < 1 ||
      typeof record.endColumn !== "number" ||
      !Number.isInteger(record.endColumn) ||
      record.endColumn < 1
    ) {
      throw new TexAdapterFailure("protocol-invalid");
    }
    location.endLine = record.endLine;
    location.endColumn = record.endColumn;
  }
  return location;
}

/** The failure category an adapter-reported result carries, host-path-free. */
export function texResultCategory(result: Extract<TexRenderResult, { status: "error" }>): TexRendererFailureCategory {
  return adapterCategory(result.diagnostic.code);
}

function positionAt(line: SourceLine, column: number): SourcePosition {
  const index = Math.max(0, Math.min(column - 1, [...line.text].length));
  return rangeFromLineSlice(line, index, index).start;
}

/**
 * Maps a body-relative TeX location onto the authored Source. The body is the
 * contiguous run of Source lines immediately preceding a tex Block's closing
 * fence, so its first line number follows from the block end and body length.
 */
export function texBodyRange(
  block: TexBlock,
  location: TexBodyLocation,
  lines: readonly SourceLine[],
): SourceRange {
  const bodyLineCount = block.body.split("\n").length;
  const firstLine = block.range.end.line - bodyLineCount;
  const lineAt = (offset: number): SourceLine | undefined => lines[firstLine - 1 + offset];
  const startLine = lineAt(location.line - 1);
  if (startLine === undefined) return block.range;
  const start = positionAt(startLine, location.column);
  if (location.endLine === undefined || location.endColumn === undefined) {
    return { start, end: start };
  }
  const endLine = lineAt(location.endLine - 1);
  if (endLine === undefined) return { start, end: start };
  return { start, end: positionAt(endLine, location.endColumn) };
}
