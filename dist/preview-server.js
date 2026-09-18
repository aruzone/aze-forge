import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { previewContentSecurityPolicy } from "./preview-shell.js";
/** Opaque, path-hiding identifier for one manifest entry. */
export function assetToken(logicalPath) {
    return createHash("sha256").update(`azeforge.asset/v1:${logicalPath}`, "utf8").digest("hex");
}
const SSE_READY = `event: ready\ndata: {"preview":"current"}\n\n`;
/**
 * Loopback-only preview server. Serves exactly three route families: the
 * current preview (`/`), the reload stream (`/events`), and opaque asset
 * bytes (`/assets/<token>`). No directory listing, Source download, write
 * API, proxy, or CORS.
 */
export class PreviewServer {
    options;
    server;
    sockets = new Set();
    clients = new Set();
    preview = Buffer.alloc(0);
    assets = new Map();
    generation = 0;
    closed = false;
    constructor(server, options) {
        this.options = options;
        this.server = server;
    }
    static async listen(options) {
        const holder = {};
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
        await new Promise((resolvePromise, rejectPromise) => {
            server.on("error", rejectPromise);
            server.listen(options.port, "127.0.0.1", () => {
                server.removeListener("error", rejectPromise);
                server.on("error", (error) => {
                    if (!preview.closed)
                        preview.options.onError(error);
                });
                resolvePromise();
            });
        });
        return preview;
    }
    get port() {
        const address = this.server.address();
        return typeof address === "object" && address !== null ? address.port : 0;
    }
    get url() {
        return `http://127.0.0.1:${this.port}/`;
    }
    /** Replace the current preview and notify reload clients. */
    update(previewHtml, assets) {
        this.preview = Buffer.from(previewHtml, "utf8");
        this.assets = new Map(assets.map((asset) => [asset.token, asset]));
        this.generation += 1;
        const message = `event: reload\ndata: {"generation":${this.generation}}\n\n`;
        for (const client of this.clients) {
            client.write(message);
        }
    }
    handle(request, response) {
        const method = request.method ?? "GET";
        let pathname;
        try {
            pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
        }
        catch {
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
    servePreview(response) {
        response.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
            "Content-Security-Policy": previewContentSecurityPolicy(),
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Length": this.preview.byteLength,
        });
        response.end(this.preview);
    }
    serveEvents(response) {
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
    serveAsset(token, response) {
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
    notFound(response) {
        const body = Buffer.from("Not found.", "utf8");
        response.writeHead(404, {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Length": body.byteLength,
        });
        response.end(body);
    }
    async close() {
        this.closed = true;
        for (const client of this.clients)
            client.end();
        this.clients.clear();
        await new Promise((resolvePromise) => {
            this.server.close(() => resolvePromise());
        });
        for (const socket of this.sockets)
            socket.destroy();
        this.sockets.clear();
    }
}
//# sourceMappingURL=preview-server.js.map