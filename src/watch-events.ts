import type { ArtifactMetadata, ContentHash, Diagnostic } from "./model.js";
import { TOOL_VERSION } from "./tool-version.js";
export const WATCH_EVENT_SCHEMA_ID = "azeforge.event/v1" as const;

export type WatchCommand = "watch" | "serve";
export type WatchEventKind = "started" | "result" | "stopped";

interface WatchEventBase {
  readonly schema: typeof WATCH_EVENT_SCHEMA_ID;
  readonly schemaVersion: 1;
  readonly tool: Readonly<{ name: "azeforge"; version: typeof TOOL_VERSION }>;
  readonly command: WatchCommand;
  readonly seq: number;
  readonly kind: WatchEventKind;
}

export interface WatchStartedEvent extends WatchEventBase {
  readonly kind: "started";
  readonly source: string;
  /** Watch only: the file Artifact destination. */
  readonly artifact?: string;
  /** Watch only: the Artifact format. */
  readonly format?: "html" | "svg" | "png" | "pdf";
  /** Serve only: the loopback preview URL. */
  readonly url?: string;
}

export interface WatchResultEvent extends WatchEventBase {
  readonly kind: "result";
  readonly success: boolean;
  readonly diagnostics: readonly Diagnostic[];
  readonly contentHash?: ContentHash;
  readonly artifact?: ArtifactMetadata;
  /** Serve only: the loopback preview URL. */
  readonly url?: string;
  /** Serve only: opaque asset URLs for the current manifest. */
  readonly assets?: readonly Readonly<{
    url: string;
    mediaType: string;
    byteLength: number;
  }>[];
}

export interface WatchStoppedEvent extends WatchEventBase {
  readonly kind: "stopped";
  readonly reason: string;
}

export type WatchEvent = WatchStartedEvent | WatchResultEvent | WatchStoppedEvent;

function toolIdentity(): WatchEventBase["tool"] {
  return { name: "azeforge", version: TOOL_VERSION };
}

function baseEvent(command: WatchCommand, seq: number): Omit<WatchEventBase, "kind"> {
  return {
    schema: WATCH_EVENT_SCHEMA_ID,
    schemaVersion: 1,
    tool: toolIdentity(),
    command,
    seq,
  };
}

export function createStartedEvent(
  command: WatchCommand,
  seq: number,
  details: Omit<WatchStartedEvent, "schema" | "schemaVersion" | "tool" | "command" | "seq" | "kind">,
): WatchStartedEvent {
  return { ...baseEvent(command, seq), kind: "started", ...details };
}

export function createResultEvent(
  command: WatchCommand,
  seq: number,
  details: Omit<WatchResultEvent, "schema" | "schemaVersion" | "tool" | "command" | "seq" | "kind">,
): WatchResultEvent {
  return { ...baseEvent(command, seq), kind: "result", ...details };
}

export function createStoppedEvent(
  command: WatchCommand,
  seq: number,
  reason: string,
): WatchStoppedEvent {
  return { ...baseEvent(command, seq), kind: "stopped", reason };
}
export function serializeEvent(event: WatchEvent): string {
  return JSON.stringify(event);
}

