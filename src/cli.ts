#!/usr/bin/env node

import { readFile, realpath } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";

import { commitArtifact } from "./atomic-write.js";
import { createCompiler } from "./compiler.js";
import { createDiagnostic } from "./diagnostics.js";
import { createDiagnosticsReport } from "./diagnostics-json.js";
import type {
  Artifact,
  ArtifactFormat,
  ArtifactMetadata,
  CompileResult,
  ContentHash,
  Diagnostic,
} from "./model.js";
import {
  extractServedAssets,
  renderDiagnosticsPage,
  renderStartingPage,
  wrapPreviewShell,
} from "./preview-shell.js";
import { PreviewServer } from "./preview-server.js";
import { collectImageSources, resolveWatchPaths } from "./watch-dependencies.js";
import {
  createResultEvent,
  createStartedEvent,
  createStoppedEvent,
  serializeEvent,
} from "./watch-events.js";
import type { WatchEvent } from "./watch-events.js";
import { WatchDriver } from "./watch-loop.js";

const FORMAT_BY_EXTENSION: Readonly<Record<string, ArtifactFormat>> = {
  ".html": "html",
  ".svg": "svg",
  ".png": "png",
  ".pdf": "pdf",
};

class CliUsageError extends Error {}
class ArtifactCommitError extends Error {}
class InvalidUtf8Error extends Error {
  readonly sourcePath: string;

  constructor(sourcePath: string) {
    super(`Source "${sourcePath}" is not valid UTF-8.`);
    this.name = "InvalidUtf8Error";
    this.sourcePath = sourcePath;
  }
}


type DiagnosticsMode = "human" | "json";

interface CommonArguments {
  readonly sourcePath: string;
  readonly diagnosticsMode: DiagnosticsMode;
  readonly allowRawLatex: boolean;
}

interface ValidateArguments extends CommonArguments {
  readonly command: "validate";
}

interface RenderArguments extends CommonArguments {
  readonly command: "render";
  readonly artifactPath?: string;
  readonly stdout: boolean;
  readonly format: "html" | "svg" | "png" | "pdf";
  readonly theme?: string;
}

interface FormatArguments {
  readonly command: "format";
  readonly sourcePath?: string;
  readonly stdin: boolean;
  readonly write: boolean;
  readonly check: boolean;
  readonly diagnosticsMode: DiagnosticsMode;
}

interface WatchArguments extends CommonArguments {
  readonly command: "watch";
  readonly artifactPath: string;
  readonly format: "html" | "svg" | "png" | "pdf";
  readonly theme?: string;
}

interface ServeArguments extends CommonArguments {
  readonly command: "serve";
  readonly port: number;
  readonly theme?: string;
}

type CliArguments =
  | ValidateArguments
  | RenderArguments
  | WatchArguments
  | ServeArguments
  | FormatArguments;

function requestedDiagnosticsMode(arguments_: readonly string[]): DiagnosticsMode {
  return arguments_.some(
    (argument, index) =>
      argument === "--diagnostics" && arguments_[index + 1] === "json",
  )
    ? "json"
    : "human";
}
function claimAllowRawLatex(current: boolean): boolean {
  if (current) {
    throw new CliUsageError('Option "--allow-raw-latex" was provided more than once.');
  }
  return true;
}

function claimFormatFlag(name: "--stdin" | "--write" | "--check", current: boolean): boolean {
  if (current) {
    throw new CliUsageError(`Option "${name}" was provided more than once.`);
  }
  return true;
}

function parseFormatArguments(
  first: string | undefined,
  rest: readonly string[],
  diagnosticsMode: DiagnosticsMode,
): FormatArguments {
  const tokens = first === undefined ? [...rest] : [first, ...rest];
  let stdin = false;
  let write = false;
  let check = false;
  let sourcePath: string | undefined;
  for (const token of tokens) {
    if (token === "--stdin") {
      stdin = claimFormatFlag("--stdin", stdin);
    } else if (token === "--write") {
      write = claimFormatFlag("--write", write);
    } else if (token === "--check") {
      check = claimFormatFlag("--check", check);
    } else if (token.startsWith("-")) {
      throw new CliUsageError(`Unknown option "${token}".`);
    } else if (sourcePath !== undefined) {
      throw new CliUsageError("Format accepts one Source path.");
    } else {
      sourcePath = token;
    }
  }
  if (sourcePath === undefined && !stdin) {
    throw new CliUsageError(
      "Usage: azeforge format <source> [--write | --check] | azeforge format --stdin [--check]",
    );
  }
  if (sourcePath !== undefined && stdin) {
    throw new CliUsageError("Format accepts either a Source path or --stdin, not both.");
  }
  if (write && check) {
    throw new CliUsageError('Options "--write" and "--check" cannot be combined.');
  }
  if (write && stdin) {
    throw new CliUsageError('Option "--write" rejects stdin Source.');
  }
  if (!write && !check && diagnosticsMode === "json") {
    throw new CliUsageError(
      "JSON diagnostics cannot be combined with formatted Source stdout.",
    );
  }
  return {
    command: "format",
    ...(sourcePath === undefined ? {} : { sourcePath }),
    stdin,
    write,
    check,
    diagnosticsMode,
  };
}

function parseArguments(
  rawArguments: readonly string[],
  diagnosticsMode: DiagnosticsMode,
): CliArguments {
  const arguments_: string[] = [];
  let diagnosticsSeen = false;
  for (let index = 0; index < rawArguments.length; index += 1) {
    const argument = rawArguments[index];
    if (argument !== "--diagnostics") {
      arguments_.push(argument ?? "");
      continue;
    }
    const value = rawArguments[index + 1];
    if (value !== "json") {
      throw new CliUsageError('Option "--diagnostics" requires the value "json".');
    }
    if (diagnosticsSeen) {
      throw new CliUsageError('Option "--diagnostics" was provided more than once.');
    }
    diagnosticsSeen = true;
    index += 1;
  }

  const [command, sourcePath, ...rest] = arguments_;
  if (command === "format") {
    return parseFormatArguments(sourcePath, rest, diagnosticsMode);
  }
  if (command === "watch") {
    if (sourcePath === undefined || sourcePath.startsWith("-")) {
      throw new CliUsageError("Usage: azeforge watch <source> --output <artifact.html>");
    }
    return parseWatchArguments(sourcePath, rest, diagnosticsMode);
  }
  if (command === "serve") {
    if (sourcePath === undefined || sourcePath.startsWith("-")) {
      throw new CliUsageError("Usage: azeforge serve <source> [--port <port>]");
    }
    return parseServeArguments(sourcePath, rest, diagnosticsMode);
  }
  if (
    (command !== "validate" && command !== "render") ||
    sourcePath === undefined ||
    sourcePath.startsWith("-")
  ) {
    throw new CliUsageError(
      "Usage: azeforge validate <source> | azeforge render <source> --output <artifact.html> | azeforge watch <source> --output <artifact.html> | azeforge serve <source> [--port <port>]",
    );
  }
  if (command === "validate") {
    let allowRawLatex = false;
    for (const option of rest) {
      if (option !== "--allow-raw-latex") {
        throw new CliUsageError("Validate accepts one Source path.");
      }
      allowRawLatex = claimAllowRawLatex(allowRawLatex);
    }
    return { command, sourcePath, diagnosticsMode, allowRawLatex };
  }


  let artifactPath: string | undefined;
  let stdout = false;
  let allowRawLatex = false;
  let format: string | undefined;
  let theme: string | undefined;
  for (let index = 0; index < rest.length; index += 1) {
    const option = rest[index];
    if (option === "--stdout") {
      if (stdout) throw new CliUsageError('Option "--stdout" was provided more than once.');
      stdout = true;
      continue;
    }
    if (option === "--allow-raw-latex") {
      allowRawLatex = claimAllowRawLatex(allowRawLatex);
      continue;
    }
    const value = rest[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new CliUsageError(`Option "${option}" needs a value.`);
    }
    index += 1;
    if (option === "--output") {
      if (artifactPath !== undefined) {
        throw new CliUsageError('Option "--output" was provided more than once.');
      }
      artifactPath = value;
    } else if (option === "--format") {
      if (format !== undefined) {
        throw new CliUsageError('Option "--format" was provided more than once.');
      }
      format = value;
    } else if (option === "--theme") {
      if (theme !== undefined) {
        throw new CliUsageError('Option "--theme" was provided more than once.');
      }
      theme = value;
    } else {
      throw new CliUsageError(`Unknown option "${option}".`);
    }
  }
  if (
    (artifactPath === undefined && !stdout) ||
    (artifactPath !== undefined && stdout)
  ) {
    throw new CliUsageError("Render requires exactly one of --output or --stdout.");
  }
  if (stdout && diagnosticsMode === "json") {
    throw new CliUsageError(
      "JSON diagnostics cannot be combined with Artifact stdout.",
    );
  }
  if (stdout && format === undefined) {
    throw new CliUsageError("Render --stdout requires an explicit --format.");
  }
  const selectedFormat = selectArtifactFormat(format, artifactPath);
  return {
    command,
    sourcePath,
    diagnosticsMode,
    ...(artifactPath === undefined ? {} : { artifactPath }),
    stdout,
    format: selectedFormat,
    allowRawLatex,
    ...(theme === undefined ? {} : { theme }),
  };
}
function selectArtifactFormat(
  format: string | undefined,
  artifactPath: string | undefined,
): "html" | "svg" | "png" | "pdf" {
  const extension =
    artifactPath === undefined ? "" : extname(artifactPath).toLowerCase();
  const inferredFormat = FORMAT_BY_EXTENSION[extension];
  const selectedFormat = format ?? inferredFormat;
  if (
    (selectedFormat !== "html" && selectedFormat !== "svg" && selectedFormat !== "png" && selectedFormat !== "pdf") ||
    (format !== undefined && inferredFormat !== undefined && format !== inferredFormat)
  ) {
    throw new CliUsageError("The Artifact format and destination extension disagree.");
  }
  return selectedFormat;
}

function parseWatchArguments(
  sourcePath: string,
  rest: readonly string[],
  diagnosticsMode: DiagnosticsMode,
): WatchArguments {
  let artifactPath: string | undefined;
  let allowRawLatex = false;
  let format: string | undefined;
  let theme: string | undefined;
  for (let index = 0; index < rest.length; index += 1) {
    const option = rest[index];
    if (option === "--stdout") {
      throw new CliUsageError("Watch requires --output and rejects --stdout.");
    }
    if (option === "--allow-raw-latex") {
      allowRawLatex = claimAllowRawLatex(allowRawLatex);
      continue;
    }
    const value = rest[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new CliUsageError(`Option "${option}" needs a value.`);
    }
    index += 1;
    if (option === "--output") {
      if (artifactPath !== undefined) {
        throw new CliUsageError('Option "--output" was provided more than once.');
      }
      artifactPath = value;
    } else if (option === "--format") {
      if (format !== undefined) {
        throw new CliUsageError('Option "--format" was provided more than once.');
      }
      format = value;
    } else if (option === "--theme") {
      if (theme !== undefined) {
        throw new CliUsageError('Option "--theme" was provided more than once.');
      }
      theme = value;
    } else {
      throw new CliUsageError(`Unknown option "${option}".`);
    }
  }
  if (artifactPath === undefined) {
    throw new CliUsageError("Watch requires --output <artifact>.");
  }
  return {
    command: "watch",
    sourcePath,
    diagnosticsMode,
    allowRawLatex,
    artifactPath,
    format: selectArtifactFormat(format, artifactPath),
    ...(theme === undefined ? {} : { theme }),
  };
}

function parseServeArguments(
  sourcePath: string,
  rest: readonly string[],
  diagnosticsMode: DiagnosticsMode,
): ServeArguments {
  let allowRawLatex = false;
  let theme: string | undefined;
  let port: number | undefined;
  for (let index = 0; index < rest.length; index += 1) {
    const option = rest[index];
    if (
      option === "--output" ||
      option === "--stdout" ||
      option === "--format"
    ) {
      throw new CliUsageError("Serve accepts no --format, --output, or --stdout.");
    }
    if (option === "--host") {
      throw new CliUsageError("Serve binds only 127.0.0.1.");
    }
    if (option === "--allow-raw-latex") {
      allowRawLatex = claimAllowRawLatex(allowRawLatex);
      continue;
    }
    const value = rest[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new CliUsageError(`Option "${option}" needs a value.`);
    }
    index += 1;
    if (option === "--port") {
      if (port !== undefined) {
        throw new CliUsageError('Option "--port" was provided more than once.');
      }
      if (!/^\d+$/.test(value) || Number(value) > 65535) {
        throw new CliUsageError('Option "--port" needs a value between 0 and 65535.');
      }
      port = Number(value);
    } else if (option === "--theme") {
      if (theme !== undefined) {
        throw new CliUsageError('Option "--theme" was provided more than once.');
      }
      theme = value;
    } else {
      throw new CliUsageError(`Unknown option "${option}".`);
    }
  }
  return {
    command: "serve",
    sourcePath,
    diagnosticsMode,
    allowRawLatex,
    port: port ?? 0,
    ...(theme === undefined ? {} : { theme }),
  };
}

function formatDiagnostic(
  diagnostic: Diagnostic,
  sourceText?: string,
): string {
  const source = diagnostic.location?.source ?? "<source>";
  const range = diagnostic.location?.range;
  const location =
    range === undefined
      ? source
      : `${source}:${range.start.line}:${range.start.column}`;
  const lines = [
    `${location}: ${diagnostic.severity} [${diagnostic.code}]`,
    diagnostic.message,
  ];
  if (sourceText !== undefined && range !== undefined) {
    const sourceLine = sourceText.split(/\r\n|\n|\r/)[range.start.line - 1];
    if (sourceLine !== undefined) {
      const codePoints = [...sourceLine];
      const boundedLine = codePoints.slice(0, 120).join("");
      lines.push(`  ${boundedLine}`);
      if (
        codePoints.length <= 120 &&
        /^[\x20-\x7e]*$/.test(sourceLine)
      ) {
        const caretStart = Math.max(0, range.start.column - 1);
        const caretLength = Math.max(
          1,
          range.end.line === range.start.line
            ? range.end.column - range.start.column
            : 1,
        );
        lines.push(`  ${" ".repeat(caretStart)}${"^".repeat(caretLength)}`);
      }
    }
  }
  if (diagnostic.suggestion !== undefined) {
    lines.push(`Help: ${diagnostic.suggestion}`);
  }
  if (diagnostic.fix !== undefined) {
    lines.push(`Fix: ${diagnostic.fix.title}`);
  }
  for (const related of diagnostic.relatedLocations) {
    const relatedSource = related.source ?? source;
    lines.push(
      `Related: ${relatedSource}:${related.range.start.line}:${related.range.start.column}: ${related.message}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

function decodeSource(bytes: Uint8Array, sourceLabel: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new InvalidUtf8Error(sourceLabel);
  }
}

async function readSource(path: string): Promise<string> {
  return decodeSource(await readFile(path), path);
}

async function readStdin(sourceLabel: string): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk);
  }
  return decodeSource(Buffer.concat(chunks), sourceLabel);
}

async function canonicalDestinationPath(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      error.code !== "ENOENT"
    ) {
      throw error;
    }
    const absolutePath = resolve(path);
    return join(await realpath(dirname(absolutePath)), basename(absolutePath));
  }
}

async function assertArtifactSeparate(
  sourcePath: string,
  artifactPath: string,
): Promise<void> {
  const canonicalSourcePath = await realpath(sourcePath);
  const canonicalArtifactPath = await canonicalDestinationPath(artifactPath);
  if (canonicalSourcePath === canonicalArtifactPath) {
    throw new CliUsageError("The Artifact destination cannot replace its Source.");
  }
}

function emitDiagnostics(
  diagnosticsMode: DiagnosticsMode,
  command: string,
  success: boolean,
  diagnostics: readonly Diagnostic[],
  sourceText?: string,
  details: {
    readonly contentHash?: ContentHash;
    readonly artifact?: ArtifactMetadata;
  } = {},
): void {
  if (diagnosticsMode === "json") {
    process.stdout.write(
      `${JSON.stringify(
        createDiagnosticsReport(command, success, diagnostics, details),
      )}\n`,
    );
    return;
  }
  for (const diagnostic of diagnostics) {
    process.stderr.write(formatDiagnostic(diagnostic, sourceText));
  }
}

interface WatchCycleOutcome {
  readonly sourceText?: string;
  readonly diagnostics: readonly Diagnostic[];
  readonly contentHash?: ContentHash;
  readonly artifact?: Artifact;
  readonly imageSources: readonly string[];
}

function scanImageSourcesFromText(sourceText: string): string[] {
  const pattern = /!\[[^\]\n]*\]\(\s*<?([^)\s>]+)>?(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g;
  const sources: string[] = [];
  for (
    let match = pattern.exec(sourceText);
    match !== null;
    match = pattern.exec(sourceText)
  ) {
    const src = match[1];
    if (src !== undefined) sources.push(src);
  }
  return sources;
}

async function compileWatchSource(options: {
  readonly sourcePath: string;
  readonly projectRoot: string;
  readonly format: "html" | "svg" | "png" | "pdf";
  readonly theme?: string;
  readonly allowRawLatex: boolean;
}): Promise<WatchCycleOutcome> {
  let sourceText: string;
  try {
    sourceText = await readSource(options.sourcePath);
  } catch {
    return {
      diagnostics: [
        createDiagnostic(
          "azeforge.source#read-failed",
          "error",
          "The Source could not be read.",
          { location: { source: options.sourcePath } },
        ),
      ],
      imageSources: [],
    };
  }
  const compiler = createCompiler();
  let result: CompileResult;
  try {
    result = await compiler.compile(sourceText, {
      format: options.format,
      sourceName: options.sourcePath,
      projectRoot: options.projectRoot,
      ...(options.theme === undefined ? {} : { theme: options.theme }),
      ...(options.allowRawLatex ? { allowRawLatex: true } : {}),
    });
  } catch {
    return {
      sourceText,
      diagnostics: [
        createDiagnostic(
          "azeforge.cli#operation-failed",
          "error",
          "The accepted operation failed unexpectedly.",
        ),
      ],
      imageSources: scanImageSourcesFromText(sourceText),
    };
  }
  return {
    sourceText,
    diagnostics: result.diagnostics,
    ...(result.contentHash === undefined ? {} : { contentHash: result.contentHash }),
    ...(result.artifact === undefined ? {} : { artifact: result.artifact }),
    imageSources:
      result.document === undefined
        ? scanImageSourcesFromText(sourceText)
        : collectImageSources(result.document),
  };
}

async function resolveSourcePath(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    return resolve(path);
  }
}

function reportCycleHuman(
  sourceText: string | undefined,
  diagnostics: readonly Diagnostic[],
): void {
  for (const diagnostic of diagnostics) {
    process.stderr.write(formatDiagnostic(diagnostic, sourceText));
  }
}

function closedStdoutErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  if (!("code" in error)) return undefined;
  const code: unknown = error.code;
  return typeof code === "string" ? code : undefined;
}

function installClosedStdoutGuard(onClosed: () => void): void {
  process.stdout.on("error", (error) => {
    if (closedStdoutErrorCode(error) === "EPIPE") onClosed();
  });
}

async function runWatch(watchArguments: WatchArguments): Promise<void> {
  const machine = watchArguments.diagnosticsMode === "json";
  let seq = 0;
  const emit = (event: WatchEvent): void => {
    if (machine) process.stdout.write(`${serializeEvent(event)}\n`);
  };
  try {
    const canonicalSourcePath = await realpath(watchArguments.sourcePath);
    const canonicalArtifactPath = await canonicalDestinationPath(
      watchArguments.artifactPath,
    );
    if (canonicalSourcePath === canonicalArtifactPath) {
      throw new CliUsageError("The Artifact destination cannot replace its Source.");
    }
  } catch (error) {
    if (error instanceof CliUsageError) throw error;
  }
  const sourceRealPath = await resolveSourcePath(watchArguments.sourcePath);
  const projectRoot = dirname(sourceRealPath);
  let driver: WatchDriver | undefined;
  let settling = false;
  let compiling = false;
  let pending = false;
  let inflight: Promise<void> | undefined;

  const shutdown = (code: number, reason?: string): void => {
    if (settling) return;
    settling = true;
    const done = async (): Promise<void> => {
      try {
        await inflight;
      } catch {
        // Settle: cleanup continues without a stack trace.
      }
      await driver?.close();
      if (machine && reason !== undefined) {
        try {
          process.stdout.write(
            `${serializeEvent(createStoppedEvent("watch", seq, reason))}\n`,
          );
        } catch {
          // Best effort: consumers cannot require a final event.
        }
      }
      process.exit(code);
    };
    void done();
  };
  process.once("SIGINT", () => shutdown(130, "signal"));
  process.once("SIGTERM", () => shutdown(143, "signal"));
  if (machine) installClosedStdoutGuard(() => shutdown(0));

  const compileOnce = async (): Promise<void> => {
    const outcome = await compileWatchSource({
      sourcePath: watchArguments.sourcePath,
      projectRoot,
      format: watchArguments.format,
      ...(watchArguments.theme === undefined ? {} : { theme: watchArguments.theme }),
      allowRawLatex: watchArguments.allowRawLatex,
    });
    if (settling) return;
    let success = outcome.artifact !== undefined;
    let diagnostics = outcome.diagnostics;
    let contentHash = outcome.contentHash;
    let artifact = outcome.artifact;
    if (success && artifact !== undefined) {
      try {
        await assertArtifactSeparate(
          watchArguments.sourcePath,
          watchArguments.artifactPath,
        );
        await commitArtifact(watchArguments.artifactPath, artifact.bytes);
      } catch {
        success = false;
        diagnostics = [
          createDiagnostic(
            "azeforge.artifact#commit-failed",
            "error",
            "The Artifact could not be committed.",
          ),
        ];
        contentHash = undefined;
        artifact = undefined;
      }
    }
    if (machine) {
      emit(
        createResultEvent("watch", seq, {
          success,
          diagnostics,
          ...(success && contentHash !== undefined ? { contentHash } : {}),
          ...(success && artifact !== undefined ? { artifact: artifact.metadata } : {}),
        }),
      );
      seq += 1;
    } else {
      reportCycleHuman(outcome.sourceText, diagnostics);
      process.stderr.write(
        success
          ? `watch: updated ${watchArguments.artifactPath}\n`
          : `watch: failed; preserved ${watchArguments.artifactPath}\n`,
      );
    }
    await driver?.rearm({ imageSources: outcome.imageSources });
  };
  const runLoop = async (): Promise<void> => {
    for (;;) {
      compiling = true;
      const iteration = compileOnce();
      inflight = iteration;
      try {
        await iteration;
      } finally {
        compiling = false;
        if (inflight === iteration) inflight = undefined;
      }
      if (settling || !pending) break;
      pending = false;
    }
  };
  const onChange = (): void => {
    if (settling) return;
    if (compiling) {
      pending = true;
      return;
    }
    void runLoop();
  };

  driver = await WatchDriver.start(
    {
      sourcePath: sourceRealPath,
      projectRoot,
      debounceMs: 60,
      watchPathsFor: (outcome) =>
        resolveWatchPaths(projectRoot, outcome?.imageSources ?? []),
      onChange,
      onWatcherFailed: () => shutdown(1, "watcher-failed"),
    },
    undefined,
  );
  emit(
    createStartedEvent("watch", seq, {
      source: watchArguments.sourcePath,
      artifact: watchArguments.artifactPath,
      format: watchArguments.format,
    }),
  );
  seq += 1;
  if (!machine) {
    process.stderr.write(
      `watch: watching ${watchArguments.sourcePath} → ${watchArguments.artifactPath}\n`,
    );
  }
  await runLoop();
}

async function runServe(serveArguments: ServeArguments): Promise<void> {
  const machine = serveArguments.diagnosticsMode === "json";
  let seq = 0;
  const emit = (event: WatchEvent): void => {
    if (machine) process.stdout.write(`${serializeEvent(event)}\n`);
  };
  const sourceRealPath = await resolveSourcePath(serveArguments.sourcePath);
  const projectRoot = dirname(sourceRealPath);
  let preview: PreviewServer;
  try {
    preview = await PreviewServer.listen({
      port: serveArguments.port,
      onError: () => shutdown(1, "listener-failed"),
    });
  } catch {
    emitDiagnostics(serveArguments.diagnosticsMode, "serve", false, [
      createDiagnostic(
        "azeforge.cli#operation-failed",
        "error",
        `The preview server could not listen on port ${serveArguments.port}.`,
        { suggestion: "Choose another --port." },
      ),
    ]);
    process.exitCode = 1;
    return;
  }
  preview.update(renderStartingPage(serveArguments.sourcePath), []);
  let driver: WatchDriver | undefined;
  let settling = false;
  let compiling = false;
  let pending = false;
  let inflight: Promise<void> | undefined;

  const shutdown = (code: number, reason?: string): void => {
    if (settling) return;
    settling = true;
    const done = async (): Promise<void> => {
      try {
        await inflight;
      } catch {
        // Settle: cleanup continues without a stack trace.
      }
      await driver?.close();
      await preview.close();
      if (machine && reason !== undefined) {
        try {
          process.stdout.write(
            `${serializeEvent(createStoppedEvent("serve", seq, reason))}\n`,
          );
        } catch {
          // Best effort: consumers cannot require a final event.
        }
      }
      process.exit(code);
    };
    void done();
  };
  process.once("SIGINT", () => shutdown(130, "signal"));
  process.once("SIGTERM", () => shutdown(143, "signal"));
  if (machine) installClosedStdoutGuard(() => shutdown(0));

  const compileOnce = async (): Promise<void> => {
    const outcome = await compileWatchSource({
      sourcePath: serveArguments.sourcePath,
      projectRoot,
      format: "html",
      ...(serveArguments.theme === undefined ? {} : { theme: serveArguments.theme }),
      allowRawLatex: serveArguments.allowRawLatex,
    });
    if (settling) return;
    const success = outcome.artifact !== undefined;
    if (success && outcome.artifact !== undefined) {
      const html = new TextDecoder().decode(outcome.artifact.bytes);
      const assets = extractServedAssets(html);
      preview.update(wrapPreviewShell(html), assets);
      if (machine) {
        emit(
          createResultEvent("serve", seq, {
            success: true,
            diagnostics: outcome.diagnostics,
            ...(outcome.contentHash === undefined
              ? {}
              : { contentHash: outcome.contentHash }),
            artifact: outcome.artifact.metadata,
            url: preview.url,
            assets: assets.map((asset) => ({
              url: `${preview.url}assets/${asset.token}`,
              mediaType: asset.mediaType,
              byteLength: asset.bytes.byteLength,
            })),
          }),
        );
        seq += 1;
      } else {
        reportCycleHuman(outcome.sourceText, outcome.diagnostics);
        process.stderr.write("serve: updated preview\n");
      }
    } else {
      preview.update(
        renderDiagnosticsPage(outcome.diagnostics, serveArguments.sourcePath),
        [],
      );
      if (machine) {
        emit(
          createResultEvent("serve", seq, {
            success: false,
            diagnostics: outcome.diagnostics,
            url: preview.url,
            assets: [],
          }),
        );
        seq += 1;
      } else {
        reportCycleHuman(outcome.sourceText, outcome.diagnostics);
        process.stderr.write("serve: showing current diagnostics\n");
      }
    }
    await driver?.rearm({ imageSources: outcome.imageSources });
  };
  const runLoop = async (): Promise<void> => {
    for (;;) {
      compiling = true;
      const iteration = compileOnce();
      inflight = iteration;
      try {
        await iteration;
      } finally {
        compiling = false;
        if (inflight === iteration) inflight = undefined;
      }
      if (settling || !pending) break;
      pending = false;
    }
  };
  const onChange = (): void => {
    if (settling) return;
    if (compiling) {
      pending = true;
      return;
    }
    void runLoop();
  };

  driver = await WatchDriver.start(
    {
      sourcePath: sourceRealPath,
      projectRoot,
      debounceMs: 60,
      watchPathsFor: (outcome) =>
        resolveWatchPaths(projectRoot, outcome?.imageSources ?? []),
      onChange,
      onWatcherFailed: () => shutdown(1, "watcher-failed"),
    },
    undefined,
  );
  emit(
    createStartedEvent("serve", seq, {
      source: serveArguments.sourcePath,
      url: preview.url,
    }),
  );
  seq += 1;
  if (!machine) {
    process.stderr.write(
      `serve: listening on ${preview.url} for ${serveArguments.sourcePath}\n`,
    );
  }
  await runLoop();
}

async function main(): Promise<void> {
  const rawArguments = process.argv.slice(2);
  const diagnosticsMode = requestedDiagnosticsMode(rawArguments);
  const commandName = rawArguments[0] ?? "unknown";
  let arguments_: CliArguments;
  try {
    arguments_ = parseArguments(rawArguments, diagnosticsMode);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid command line.";
    emitDiagnostics(diagnosticsMode, commandName, false, [
      createDiagnostic("azeforge.cli#invalid-operation", "error", message),
    ]);
    process.exitCode = 2;
    return;
  }

  try {
    if (arguments_.command === "watch") {
      await runWatch(arguments_);
      return;
    }
    if (arguments_.command === "serve") {
      await runServe(arguments_);
      return;
    }
    if (
      arguments_.command === "render" &&
      arguments_.stdout &&
      (arguments_.format === "png" || arguments_.format === "pdf") &&
      process.stdout.isTTY === true
    ) {
      emitDiagnostics(diagnosticsMode, arguments_.command, false, [
        createDiagnostic(
          "azeforge.cli#invalid-operation",
          "error",
          "Binary Artifact stdout requires a redirected destination, not an interactive terminal.",
        ),
      ]);
      process.exitCode = 2;
      return;
    }
    if (arguments_.command === "render" && arguments_.artifactPath !== undefined) {
      const canonicalSourcePath = await realpath(arguments_.sourcePath);
      let canonicalArtifactPath: string;
      try {
        canonicalArtifactPath = await canonicalDestinationPath(
          arguments_.artifactPath,
        );
      } catch {
        throw new ArtifactCommitError();
      }
      if (canonicalSourcePath === canonicalArtifactPath) {
        throw new CliUsageError("The Artifact destination cannot replace its Source.");
      }
    }
    if (arguments_.command === "format") {
      const filePath = arguments_.sourcePath;
      const sourceLabel = filePath ?? "<stdin>";
      const formatSourceText =
        arguments_.stdin || filePath === undefined
          ? await readStdin(sourceLabel)
          : await readSource(filePath);
      const compiler = createCompiler();
      const formatted = compiler.format(formatSourceText, {
        sourceName: sourceLabel,
      });
      if (formatted.source === undefined) {
        emitDiagnostics(
          arguments_.diagnosticsMode,
          arguments_.command,
          false,
          formatted.diagnostics,
          formatSourceText,
        );
        process.exitCode = 1;
        return;
      }
      if (arguments_.check) {
        if (formatted.source === formatSourceText) {
          emitDiagnostics(arguments_.diagnosticsMode, arguments_.command, true, []);
          return;
        }
        emitDiagnostics(
          arguments_.diagnosticsMode,
          arguments_.command,
          false,
          [
            createDiagnostic(
              "azeforge.format#format-required",
              "error",
              "Source requires formatting.",
              {
                location: { source: sourceLabel },
                suggestion: "Run `azeforge format` to apply formatting.",
              },
            ),
          ],
          formatSourceText,
        );
        process.exitCode = 1;
        return;
      }
      if (arguments_.write && filePath !== undefined) {
        if (formatted.source !== formatSourceText) {
          await commitArtifact(filePath, new TextEncoder().encode(formatted.source));
        }
        emitDiagnostics(arguments_.diagnosticsMode, arguments_.command, true, []);
        return;
      }
      process.stdout.write(formatted.source);
      return;
    }
    const source = await readSource(arguments_.sourcePath);
    const compiler = createCompiler();
    if (arguments_.command === "validate") {
      const result = compiler.validate(
        compiler.parse(source, {
          sourceName: arguments_.sourcePath,
          ...(arguments_.allowRawLatex ? { allowRawLatex: true } : {}),
        }),
      );
      emitDiagnostics(
        arguments_.diagnosticsMode,
        arguments_.command,
        result.document !== undefined,
        result.diagnostics,
        source,
      );
      if (result.document === undefined) process.exitCode = 1;
      return;
    }

    const result = await compiler.compile(source, {
      format: arguments_.format,
      sourceName: arguments_.sourcePath,
      projectRoot: dirname(await realpath(arguments_.sourcePath)),
      ...(arguments_.theme === undefined ? {} : { theme: arguments_.theme }),
      ...(arguments_.allowRawLatex ? { allowRawLatex: true } : {}),
    });

    if (result.artifact === undefined) {
      emitDiagnostics(
        arguments_.diagnosticsMode,
        arguments_.command,
        false,
        result.diagnostics,
        source,
      );
      process.exitCode = 1;
      return;
    }
    if (arguments_.stdout) {
      process.stdout.write(result.artifact.bytes);
    } else if (arguments_.artifactPath !== undefined) {
      try {
        await assertArtifactSeparate(
          arguments_.sourcePath,
          arguments_.artifactPath,
        );
        await commitArtifact(arguments_.artifactPath, result.artifact.bytes);
      } catch (error) {
        if (error instanceof CliUsageError) throw error;
        throw new ArtifactCommitError();
      }
    }
    emitDiagnostics(
      arguments_.diagnosticsMode,
      arguments_.command,
      true,
      result.diagnostics,
      source,
      {
        ...(result.contentHash === undefined
          ? {}
          : { contentHash: result.contentHash }),
        artifact: result.artifact.metadata,
      },
    );
  } catch (error) {
    const failure =
      error instanceof InvalidUtf8Error
        ? createDiagnostic(
            "azeforge.source#invalid-utf8",
            "error",
            "Source must contain valid UTF-8.",
            { location: { source: error.sourcePath } },
          )
        : error instanceof CliUsageError
          ? createDiagnostic(
              "azeforge.cli#invalid-operation",
              "error",
              error.message,
            )
          : error instanceof ArtifactCommitError
            ? createDiagnostic(
                "azeforge.artifact#commit-failed",
                "error",
                "The Artifact could not be committed.",
              )
            : error instanceof Error &&
                "code" in error &&
                (error.code === "ENOENT" || error.code === "EACCES")
              ? createDiagnostic(
                  "azeforge.source#read-failed",
                  "error",
                  "The Source could not be read.",
                  { location: { source: arguments_.sourcePath ?? "<stdin>" } },
                )
              : createDiagnostic(
                  "azeforge.cli#operation-failed",
                  "error",
                  "The accepted operation failed unexpectedly.",
                );
    emitDiagnostics(
      arguments_.diagnosticsMode,
      arguments_.command,
      false,
      [failure],
    );
    process.exitCode = error instanceof CliUsageError ? 2 : 1;
  }
}

await main();
