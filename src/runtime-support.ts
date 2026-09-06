import type { JsonValue } from "./model.js";

/** Tested Node majors. Node Current is out of scope for P0. */
export const SUPPORTED_NODE_VERSIONS = Object.freeze([22, 24] as const);
export const CANONICAL_NODE_VERSION = 24 as const;
/** Consumer operating systems in issue language. */
export const SUPPORTED_OPERATING_SYSTEMS = Object.freeze([
  "ubuntu",
  "macos",
  "windows",
] as const);
export const CANONICAL_OPERATING_SYSTEM = "ubuntu" as const;
/** Pinned canonical build host architecture. */
export const CANONICAL_ARCH = "x64" as const;

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

export const RUNTIME_SUPPORT: RuntimeSupport = Object.freeze({
  node: Object.freeze({
    supported: SUPPORTED_NODE_VERSIONS,
    canonical: CANONICAL_NODE_VERSION,
  }),
  os: Object.freeze({
    supported: SUPPORTED_OPERATING_SYSTEMS,
    canonical: CANONICAL_OPERATING_SYSTEM,
  }),
  canonical: Object.freeze({
    os: CANONICAL_OPERATING_SYSTEM,
    arch: CANONICAL_ARCH,
    node: CANONICAL_NODE_VERSION,
  }),
});

export const runtimeSupportJsonSchema: JsonValue = Object.freeze({
  type: "object",
  required: ["node", "os", "canonical"],
  additionalProperties: false,
  properties: {
    node: {
      type: "object",
      required: ["supported", "canonical"],
      additionalProperties: false,
      properties: {
        supported: { const: [22, 24] },
        canonical: { const: 24 },
      },
    },
    os: {
      type: "object",
      required: ["supported", "canonical"],
      additionalProperties: false,
      properties: {
        supported: { const: ["ubuntu", "macos", "windows"] },
        canonical: { const: "ubuntu" },
      },
    },
    canonical: {
      type: "object",
      required: ["os", "arch", "node"],
      additionalProperties: false,
      properties: {
        os: { const: "ubuntu" },
        arch: { const: "x64" },
        node: { const: 24 },
      },
    },
  },
});
