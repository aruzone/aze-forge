import type { CapabilitiesReport } from "./capabilities.js";
import type { VersionReport } from "./version.js";
import { CAPABILITY_COMMANDS } from "./capabilities.js";
import { TOOL_VERSION } from "./tool-version.js";

export const HELP_COMMANDS = [
  "render",
  "validate",
  "watch",
  "serve",
  "format",
  "capabilities",
  "version",
] as const;

export type HelpCommand = (typeof HELP_COMMANDS)[number];

function usageFor(name: string): string {
  const entry = CAPABILITY_COMMANDS.find((command) => command.name === name);
  return entry?.usage ?? `azeforge ${name}`;
}

function summaryFor(name: string): string {
  const entry = CAPABILITY_COMMANDS.find((command) => command.name === name);
  return entry?.summary ?? "";
}

export function globalHelp(): string {
  const lines = [
    "azeforge — deterministic semantic publishing compiler.",
    "",
    "Usage:",
    "  azeforge <command> [options]",
    "  azeforge --help | -h | help [command]   (takes no other options)",
    "  azeforge --version",
    "",
    "Commands:",
  ];
  for (const name of HELP_COMMANDS) {
    lines.push(`  ${name.padEnd(12, " ")} ${summaryFor(name)}`);
  }
  lines.push(
    "",
    "Machine output:",
    "  --diagnostics json   validate, render, format, watch, serve emit one JSON report on stdout;",
    "                       also selects machine output for capabilities and version.",
    "  --json               capabilities and version emit the machine payload on stdout.",
    "  Human reports, help, and diagnostics use stderr; stdout carries only the requested payload.",
    "",
    "Exit codes:",
    "  0  success; an optionally unavailable engine is reported in the payload, not as a failure.",
    "  1  validation or compilation failure, or no trustworthy manifest could be produced.",
    "  2  invalid CLI usage or conflicting options.",
    "",
    `Run \`azeforge <command> --help\` for command details (azeforge ${TOOL_VERSION}).`,
  );
  return `${lines.join("\n")}\n`;
}

export function commandHelp(command: HelpCommand): string {
  const lines = [
    `azeforge ${command} — ${summaryFor(command)}`,
    "",
    "Usage:",
    `  ${usageFor(command)}`,
    "",
  ];
  switch (command) {
    case "render": {
      lines.push(
        "Options:",
        "  --output <artifact>   Artifact destination (.html, .svg, .png, .pdf).",
        "  --stdout              Write the Artifact to stdout (requires --format).",
        "  --format <format>     One of html, svg, png, pdf.",
        "  --theme <theme>       One of default, academic, dark-presentation.",
        "  --allow-raw-latex     Permit raw LaTeX escape hatches.",
        "  --diagnostics json    Emit one JSON diagnostics report on stdout.",
      );
      break;
    }
    case "validate": {
      lines.push(
        "Options:",
        "  --allow-raw-latex     Permit raw LaTeX escape hatches.",
        "  --diagnostics json    Emit one JSON diagnostics report on stdout.",
      );
      break;
    }
    case "watch": {
      lines.push(
        "Options:",
        "  --output <artifact>   Required Artifact destination.",
        "  --format <format>     One of html, svg, png, pdf.",
        "  --theme <theme>       One of default, academic, dark-presentation.",
        "  --allow-raw-latex     Permit raw LaTeX escape hatches.",
        "  --diagnostics json    Emit newline-delimited JSON events on stdout.",
      );
      break;
    }
    case "serve": {
      lines.push(
        "Options:",
        "  --port <port>         Loopback port (0-65535, default 0). Binds 127.0.0.1 only.",
        "  --theme <theme>       One of default, academic, dark-presentation.",
        "  --allow-raw-latex     Permit raw LaTeX escape hatches.",
        "  --diagnostics json    Emit newline-delimited JSON events on stdout.",
      );
      break;
    }
    case "format": {
      lines.push(
        "Options:",
        "  --write               Rewrite the Source file in place.",
        "  --check               Exit 1 when the Source needs formatting.",
        "  --stdin               Read Source from stdin (rejects --write).",
        "  --diagnostics json    Emit one JSON diagnostics report on stdout.",
      );
      break;
    }
    case "capabilities": {
      lines.push(
        "Options:",
        "  --probe               Perform local-only availability checks.",
        "  --json                Emit the machine manifest on stdout.",
        "",
        "Without --json, a human report goes to stderr and stdout stays empty.",
        "Static output reports engine availability as unknown.",
      );
      break;
    }
    case "version": {
      lines.push(
        "Options:",
        "  --json                Emit the machine version document on stdout.",
        "",
        "Without --json, a human report goes to stderr and stdout stays empty.",
      );
      break;
    }
  }
  lines.push("", "Conflicting or unknown options exit 2.");
  return `${lines.join("\n")}\n`;
}

export function versionLine(): string {
  return `azeforge ${TOOL_VERSION}\n`;
}

export function humanVersionReport(report: VersionReport): string {
  return [
    `azeforge ${report.tool.version}`,
    `azemark versions: ${report.source.azemarkVersions.join(", ")}`,
    `document schema versions: ${report.document.schemaVersions.join(", ")}`,
    "",
  ].join("\n");
}

export function humanCapabilitiesReport(report: CapabilitiesReport): string {
  return [
    `azeforge ${report.tool.version} capabilities`,
    `commands: ${report.commands.length} (${report.commands.map((command) => command.name).join(", ")})`,
    `plugins: ${report.plugins.length} (${report.plugins.map((plugin) => plugin.type).join(", ")})`,
    `renderers: ${report.renderers.length} (${report.renderers.map((renderer) => renderer.id).join(", ")})`,
    `themes: ${report.themes.length} (${report.themes.map((theme) => theme.id).join(", ")})`,
    `source: azemark ${report.source.azemarkVersions.join(", ")}`,
    "Run `azeforge capabilities --json` for the complete machine manifest.",
    "",
  ].join("\n");
}
