/** Single source of truth for the CLI SemVer reported in every machine envelope. */
export const TOOL_VERSION = "0.1.0" as const;

export type ToolVersion = typeof TOOL_VERSION;
