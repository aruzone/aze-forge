import { createHash } from "node:crypto";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { Socket } from "node:net";

import { previewContentSecurityPolicy } from "./preview-shell.js";

export interface ServedAsset {
  readonly token: string;
  readonly mediaType: string;
  readonly bytes: Uint8Array;
}

/** Opaque, path-hiding identifier for one manifest entry. */
export function assetToken(logicalPath: string): string {
  return createHash("sha256").update(`azeforge.asset/v1:${logicalPath}`, "utf8").digest("hex");
}

const SSE_READY = `event: ready\ndata: {"preview":"current"}\n\n`;

export interface PreviewServerOptions {
  readonly port: number;
  readonly onError: (error: unknown) => void;
}

/**
 * Loopback-only preview server. Serves exactly three route families: the
 * current preview (`/`), the reload stream (`/events`), and opaque asset
 * bytes (`/assets/<token>`). No directory listing, Source download, write
 * API, proxy, or CORS.
 */
export class PreviewServer {
  private readonly server: Server;
  private readonly sockets = new Set<Socket>();
  private readonly clients = new Set<import("node:http").ServerResponse>();
  private preview = Buffer.alloc(0);
  private assets = new Map<string, ServedAsset>();
  private generation = 0;
  private closed = false;

  private constructor(
    server: Server,
    private readonly options: PreviewServerOptions,
  ) {
    this.server = server;
  }

  static async listen(options: PreviewServerOptions): Promise<PreviewServer> {
    const holder: { current?: PreviewServer } = {};
    const server = createServer((request, response) => {
      holder.current?.handle(request, response);
    });
    const preview = new PreviewServer(server, options);
    holder.current = preview;
    server.on("connection", (socket) => {
      preview.sockets.add(socket);
      socket.on("close", () => preview.sockets.delete(socket));
    });
    server.on("clientError", (_error, socket) => socket.destroy());
    await new Promise<void>((resolvePromise, rejectPromise) => {
      server.on("error", rejectPromise);
      server.listen(options.port, "127.0.0.1", () => {
        server.removeListener("error", rejectPromise);
        server.on("error", (error) => {
          if (!preview.closed) preview.options.onError(error);
        });
        resolvePromise();
      });
    });
    return preview;
  }

  get port(): number {
    const address = this.server.address();
    return typeof address === "object" && address !== null ? address.port : 0;
  }

  get url(): string {
    return `http://127.0.0.1:${this.port}/`;
  }

  /** Replace the current preview and notify reload clients. */
  update(previewHtml: string, assets: readonly ServedAsset[]): void {
    this.preview = Buffer.from(previewHtml, "utf8");
    this.assets = new Map(assets.map((asset) => [asset.token, asset]));
    this.generation += 1;
    const message = `event: reload\ndata: {"generation":${this.generation}}\n\n`;
    for (const client of this.clients) {
      client.write(message);
    }
  }

  private handle(
    request: import("node:http").IncomingMessage,
    response: import("node:http").ServerResponse,
  ): void {
    const method = request.method ?? "GET";
    let pathname: string;
    try {
      pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    } catch {
      this.notFound(response);
      return;
    }
    if (method !== "GET") {
      this.notFound(response);
      return;
    }
    if (pathname === "/") {
      this.servePreview(response);
      return;
    }
    if (pathname === "/events") {
      this.serveEvents(response);
      return;
    }
    if (pathname.startsWith("/assets/")) {
      this.serveAsset(pathname.slice("/assets/".length), response);
      return;
    }
    this.notFound(response);
  }

  private servePreview(response: import("node:http").ServerResponse): void {
    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": previewContentSecurityPolicy(),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Length": this.preview.byteLength,
    });
    response.end(this.preview);
  }

  private serveEvents(response: import("node:http").ServerResponse): void {
    response.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      "X-Content-Type-Options": "nosniff",
    });
    response.write(SSE_READY);
    this.clients.add(response);
    response.on("close", () => this.clients.delete(response));
  }

  private serveAsset(token: string, response: import("node:http").ServerResponse): void {
    const asset = /^[0-9a-f]{64}$/.test(token) ? this.assets.get(token) : undefined;
    if (asset === undefined) {
      this.notFound(response);
      return;
    }
    response.writeHead(200, {
      "Content-Type": asset.mediaType,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Length": asset.bytes.byteLength,
    });
    response.end(asset.bytes);
  }

  private notFound(response: import("node:http").ServerResponse): void {
    const body = Buffer.from("Not found.", "utf8");
    response.writeHead(404, {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Length": body.byteLength,
    });
    response.end(body);
  }

  async close(): Promise<void> {
    this.closed = true;
    for (const client of this.clients) client.end();
    this.clients.clear();
    await new Promise<void>((resolvePromise) => {
      this.server.close(() => resolvePromise());
    });
    for (const socket of this.sockets) socket.destroy();
    this.sockets.clear();
  }
}
