/** Tested Node majors. Node Current is out of scope for P0. */
export const SUPPORTED_NODE_VERSIONS = Object.freeze([22, 24]);
export const CANONICAL_NODE_VERSION = 24;
/** Consumer operating systems in issue language. */
export const SUPPORTED_OPERATING_SYSTEMS = Object.freeze([
    "ubuntu",
    "macos",
]);
export const CANONICAL_OPERATING_SYSTEM = "ubuntu";
/** Pinned canonical build host architecture. */
export const CANONICAL_ARCH = "x64";
export const RUNTIME_SUPPORT = Object.freeze({
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
export const runtimeSupportJsonSchema = Object.freeze({
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
                supported: { const: ["ubuntu", "macos"] },
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
//# sourceMappingURL=runtime-support.js.map