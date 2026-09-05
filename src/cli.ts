#!/usr/bin/env node

import { readFile, realpath } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";

import { commitArtifact } from "./atomic-write.js";
import { createCompiler } from "./compiler.js";
import type { ArtifactFormat, Diagnostic } from "./model.js";

const FORMAT_BY_EXTENSION: Readonly<Record<string, ArtifactFormat>> = {
  ".html": "html",
  ".svg": "svg",
  ".png": "png",
  ".pdf": "pdf",
};

class CliUsageError extends Error {}

interface ValidateArguments {
  readonly command: "validate";
  readonly sourcePath: string;
}

interface RenderArguments {
  readonly command: "render";
  readonly sourcePath: string;
  readonly artifactPath?: string;
  readonly stdout: boolean;
  readonly format: "html";
  readonly theme?: string;
}

type CliArguments = ValidateArguments | RenderArguments;

function parseArguments(arguments_: readonly string[]): CliArguments {
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
    return { command, sourcePath };
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
    ...(artifactPath === undefined ? {} : { artifactPath }),
    stdout,
    format: "html",
    ...(theme === undefined ? {} : { theme }),
  };
}

function formatDiagnostic(diagnostic: Diagnostic): string {
  const source = diagnostic.source ?? "<source>";
  const location =
    diagnostic.range === undefined
      ? source
      : `${source}:${diagnostic.range.start.line}:${diagnostic.range.start.column}`;
  return `${location}: ${diagnostic.severity} ${diagnostic.code}: ${diagnostic.message}\n`;
}

async function readSource(path: string): Promise<string> {
  const bytes = await readFile(path);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`Source "${path}" is not valid UTF-8.`);
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

async function main(): Promise<void> {
  let arguments_: CliArguments;
  try {
    arguments_ = parseArguments(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid command line.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 2;
    return;
  }

  try {
    if (arguments_.command === "render" && arguments_.artifactPath !== undefined) {
      const [canonicalSourcePath, canonicalArtifactPath] = await Promise.all([
        realpath(arguments_.sourcePath),
        canonicalDestinationPath(arguments_.artifactPath),
      ]);
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
      for (const diagnostic of result.diagnostics) {
        process.stderr.write(formatDiagnostic(diagnostic));
      }
      if (result.document === undefined) process.exitCode = 1;
      return;
    }

    const result = await compiler.compile(source, {
      format: arguments_.format,
      sourceName: arguments_.sourcePath,
      ...(arguments_.theme === undefined ? {} : { theme: arguments_.theme }),
    });
    for (const diagnostic of result.diagnostics) {
      process.stderr.write(formatDiagnostic(diagnostic));
    }
    if (result.artifact === undefined) {
      process.exitCode = 1;
      return;
    }
    if (arguments_.stdout) {
      process.stdout.write(result.artifact.bytes);
    } else if (arguments_.artifactPath !== undefined) {
      await commitArtifact(arguments_.artifactPath, result.artifact.bytes);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to compile Source.";
    process.stderr.write(`${message}\n`);
    process.exitCode = error instanceof CliUsageError ? 2 : 1;
  }
}

await main();
