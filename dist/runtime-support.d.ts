import type { JsonValue } from "./model.js";
/** Tested Node majors. Node Current is out of scope for P0. */
export declare const SUPPORTED_NODE_VERSIONS: readonly [22, 24];
export declare const CANONICAL_NODE_VERSION: 24;
/** Consumer operating systems in issue language. */
export declare const SUPPORTED_OPERATING_SYSTEMS: readonly ["ubuntu", "macos"];
export declare const CANONICAL_OPERATING_SYSTEM: "ubuntu";
/** Pinned canonical build host architecture. */
export declare const CANONICAL_ARCH: "x64";
export interface RuntimeSupport {
    readonly node: Readonly<{
        supported: typeof SUPPORTED_NODE_VERSIONS;
        canonical: typeof CANONICAL_NODE_VERSION;
    }>;
    readonly os: Readonly<{
        supported: typeof SUPPORTED_OPERATING_SYSTEMS;
        canonical: typeof CANONICAL_OPERATING_SYSTEM;
    }>;
    readonly canonical: Readonly<{
        os: typeof CANONICAL_OPERATING_SYSTEM;
        arch: typeof CANONICAL_ARCH;
        node: typeof CANONICAL_NODE_VERSION;
    }>;
}
export declare const RUNTIME_SUPPORT: RuntimeSupport;
export declare const runtimeSupportJsonSchema: JsonValue;
