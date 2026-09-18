import type { AnyBlockRenderer, AzeBlockPlugin, RendererDescriptor } from "./model.js";
export declare const REGISTRY_CONFORMANCE_SEAM_VERSION: "2.0.0";
export interface ResolvedRegistry {
    readonly plugins: readonly AzeBlockPlugin[];
    readonly blockRenderers: readonly AnyBlockRenderer[];
    readonly renderers: readonly RendererDescriptor[];
}
export declare function getBuiltInRegistry(): ResolvedRegistry;
export declare function satisfiesSemverRange(version: string, range: string): boolean;
export declare function isWellFormedVersionRange(range: string): boolean;
export declare function validateRegistry(plugins: readonly AzeBlockPlugin[], blockRenderers: readonly AnyBlockRenderer[], renderers: readonly RendererDescriptor[]): void;
export declare function resolveRegistry(options: {
    readonly plugins?: readonly AzeBlockPlugin[];
    readonly blockRenderers?: readonly AnyBlockRenderer[];
    readonly renderers?: readonly RendererDescriptor[];
}): ResolvedRegistry;
/**
 * Reusable conformance seam: verifies descriptors are inert, immutable,
 * and versioned. Built-in equation Plugin plus HTML Block renderer must
 * pass; third-party registries reuse the same entry point.
 */
export declare function assertRegistryDescriptorsImmutable(registry: ResolvedRegistry): void;
/**
 * Defensive immutable snapshot for Compiler construction. Built-in
 * descriptors are already frozen; custom descriptors are cloned and
 * frozen so downstream reads observe immutability without mutating
 * caller-owned objects.
 */
export declare function freezeRegistryForCompiler(registry: ResolvedRegistry): ResolvedRegistry;
