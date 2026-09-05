#!/usr/bin/env node

import { readFile, realpath } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";

import { commitArtifact } from "./atomic-write.js";
import { createCompiler } from "./compiler.js";
import { createDiagnostic } from "./diagnostics.js";
import { createDiagnosticsReport } from "./diagnostics-json.js";
import type {
  ArtifactFormat,
  ArtifactMetadata,
  ContentHash,
  Diagnostic,
} from "./model.js";

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
}

interface ValidateArguments extends CommonArguments {
  readonly command: "validate";
}

interface RenderArguments extends CommonArguments {
  readonly command: "render";
  readonly artifactPath?: string;
  readonly stdout: boolean;
  readonly format: "html";
  readonly theme?: string;
}

type CliArguments = ValidateArguments | RenderArguments;

function requestedDiagnosticsMode(arguments_: readonly string[]): DiagnosticsMode {
  return arguments_.some(
    (argument, index) =>
      argument === "--diagnostics" && arguments_[index + 1] === "json",
  )
    ? "json"
    : "human";
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
  if (
    (command !== "validate" && command !== "render") ||
    sourcePath === undefined ||
    sourcePath.startsWith("-")
  ) {
    throw new CliUsageError(
      "Usage: azeforge validate <source> | azeforge render <source> --output <artifact.html>",
    );
  }
  if (command === "validate") {
    if (rest.length !== 0) {
      throw new CliUsageError("Validate accepts one Source path.");
    }
    return { command, sourcePath, diagnosticsMode };
  }

  let artifactPath: string | undefined;
  let stdout = false;
  let format: string | undefined;
  let theme: string | undefined;
  for (let index = 0; index < rest.length; index += 1) {
    const option = rest[index];
    if (option === "--stdout") {
      if (stdout) throw new CliUsageError('Option "--stdout" was provided more than once.');
      stdout = true;
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
    throw new CliUsageError("Render --stdout requires --format html.");
  }
  const extension =
    artifactPath === undefined ? "" : extname(artifactPath).toLowerCase();
  const inferredFormat = FORMAT_BY_EXTENSION[extension];
  const selectedFormat = format ?? inferredFormat;
  if (
    selectedFormat !== "html" ||
    (format !== undefined && inferredFormat !== undefined && format !== inferredFormat)
  ) {
    throw new CliUsageError("The Artifact format and destination extension disagree.");
  }
  return {
    command,
    sourcePath,
    diagnosticsMode,
    ...(artifactPath === undefined ? {} : { artifactPath }),
    stdout,
    format: "html",
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

async function readSource(path: string): Promise<string> {
  const bytes = await readFile(path);
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new InvalidUtf8Error(path);
  }
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
    const source = await readSource(arguments_.sourcePath);
    const compiler = createCompiler();
    if (arguments_.command === "validate") {
      const result = compiler.validate(
        compiler.parse(source, { sourceName: arguments_.sourcePath }),
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
      ...(arguments_.theme === undefined ? {} : { theme: arguments_.theme }),
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
        await commitArtifact(arguments_.artifactPath, result.artifact.bytes);
      } catch {
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
                  { location: { source: arguments_.sourcePath } },
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
