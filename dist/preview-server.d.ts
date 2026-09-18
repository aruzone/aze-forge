export interface ServedAsset {
    readonly token: string;
    readonly mediaType: string;
    readonly bytes: Uint8Array;
}
/** Opaque, path-hiding identifier for one manifest entry. */
export declare function assetToken(logicalPath: string): string;
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
export declare class PreviewServer {
    private readonly options;
    private readonly server;
    private readonly sockets;
    private readonly clients;
    private preview;
    private assets;
    private generation;
    private closed;
    private constructor();
    static listen(options: PreviewServerOptions): Promise<PreviewServer>;
    get port(): number;
    get url(): string;
    /** Replace the current preview and notify reload clients. */
    update(previewHtml: string, assets: readonly ServedAsset[]): void;
    private handle;
    private servePreview;
    private serveEvents;
    private serveAsset;
    private notFound;
    close(): Promise<void>;
}
