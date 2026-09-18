/**
 * Native chemistry formulas, reactions, and 2D molecular structures
 * (catalog Chemistry family, contract #64).
 *
 * One family module owns three plain-name directives — `:::: formula`,
 * `:::: reaction`, `:::: structure` — each a standalone captionable,
 * numbered, referenceable Technical object. Formulas parse a bounded
 * case-sensitive expression grammar into a semantic tree; reactions hold
 * one species line with a closed arrow registry and an opt-in balance
 * assertion over the author's own declarations; structures hold flat
 * atom/bond/label records with mandatory authored coordinates and
 * zero-inference identity. Rendering reuses the plots' owned SVG emission
 * layer (fixed attribute order, deterministic ids, quantized 3-decimal
 * ASCII formatter, no text measurement).
 *
 * R4 is satisfied by construction: normalization touches only expression
 * whitespace and the registered `.`/`·` alias; there is no
 * canonicalization path, and specified / explicitly-unspecified / omitted
 * stereo, isotope, charge, element order, and Kekulé/aromatic forms stay
 * distinct in the hashed semantic tree.
 */
import type { AzeBlockPlugin, AzeBlockRenderer, BlockRendererContext, ChemistryFormulaUnit, Diagnostic, FormulaBlock, JsonValue, ReactionBlock, SourceRange, StructureBlock } from "./model.js";
export declare const MAX_FORMULA_EXPRESSION_CHARS = 512;
export declare const MAX_REACTION_SPECIES = 32;
export declare const MAX_REACTION_SPECIES_CHARS = 128;
export declare const MAX_REACTION_CONDITION_CHARS = 256;
export declare const MAX_STRUCTURE_ATOMS = 512;
export declare const MAX_STRUCTURE_WIDTH = 4096;
export declare const MAX_STRUCTURE_HEIGHT = 4096;
export declare const MAX_STRUCTURE_LABEL_CHARS = 500;
export declare const MAX_ISOTOPE_MASS = 299;
export declare const MAX_FORMULA_CHARGE = 8;
export declare const MAX_SUBSCRIPT = 999;
export declare const MAX_GROUP_NESTING = 3;
export declare const MAX_COEFFICIENT = 999;
export declare const DEFAULT_STRUCTURE_WIDTH = 640;
export declare const DEFAULT_STRUCTURE_HEIGHT = 400;
/** The registry as the ordered spelling list the grammar publishes. */
export declare const ELEMENT_SYMBOLS: readonly string[];
export declare const REACTION_STATES: readonly ["s", "l", "g", "aq"];
/** Source line handed from the envelope parser (text + exact line range). */
export interface ChemistryInputLine {
    readonly text: string;
    readonly range: SourceRange;
}
export interface ParsedFormula {
    readonly expression: string;
    readonly units: readonly ChemistryFormulaUnit[];
    readonly charge: number;
    readonly chargeSpecified: boolean;
    readonly electron: boolean;
}
/**
 * Parse one normalized formula expression. chargeText carries the peeled
 * trailing charge suffix (sign plus optional magnitude digit).
 */
export declare function parseFormulaExpression(options: {
    readonly raw: string;
    readonly line: ChemistryInputLine;
    readonly columnOffset: number;
    readonly namespace: string;
    readonly sourceName: string | undefined;
    readonly diagnostics: Diagnostic[];
}): ParsedFormula | undefined;
/** Element-count multiset of one parsed formula (adduct multipliers applied). */
export declare function formulaAtomCounts(formula: ParsedFormula): Map<string, number>;
export interface ValidatedFormula {
    readonly block?: FormulaBlock;
    readonly diagnostics: readonly Diagnostic[];
}
export declare function validateFormulaBlock(options: {
    readonly headerLines: readonly ChemistryInputLine[];
    readonly bodyLines: readonly ChemistryInputLine[];
    readonly blockRange: SourceRange;
    readonly sourceName: string | undefined;
}): ValidatedFormula;
export interface ValidatedReaction {
    readonly block?: ReactionBlock;
    readonly diagnostics: readonly Diagnostic[];
}
export declare function validateReactionBlock(options: {
    readonly headerLines: readonly ChemistryInputLine[];
    readonly bodyLines: readonly ChemistryInputLine[];
    readonly blockRange: SourceRange;
    readonly sourceName: string | undefined;
}): ValidatedReaction;
export declare const STRUCTURE_OPENERS: readonly ["atom", "bond", "label"];
export declare const ATOM_FIELDS: readonly string[];
export declare const BOND_FIELDS: readonly string[];
export declare const LABEL_FIELDS: readonly string[];
export interface ValidatedStructure {
    readonly block?: StructureBlock;
    readonly diagnostics: readonly Diagnostic[];
}
export declare function validateStructureBlock(options: {
    readonly headerLines: readonly ChemistryInputLine[];
    readonly bodyLines: readonly ChemistryInputLine[];
    readonly blockRange: SourceRange;
    readonly sourceName: string | undefined;
}): ValidatedStructure;
export declare class ChemistrySanitizerError extends Error {
    readonly code: "azeforge.chemistry#sanitizer-compromise";
    constructor(message: string);
}
export declare function assertChemistryFragmentSafe(svg: string): void;
export declare function renderFormulaFragment(block: FormulaBlock, _context: BlockRendererContext): string;
export declare function renderReactionFragment(block: ReactionBlock, _context: BlockRendererContext): string;
export declare function renderStructureFragment(block: StructureBlock, _context: BlockRendererContext): string;
/** Fingerprint closure joining the plot/geometry closures (contract §7). */
export declare function chemistryDependencyClosure(): JsonValue;
export declare const formulaPlugin: AzeBlockPlugin;
export declare const reactionPlugin: AzeBlockPlugin;
export declare const structurePlugin: AzeBlockPlugin;
export declare const FORMULA_HTML_BLOCK_RENDERER_ID: "azeforge.formula.html/v1";
export declare const REACTION_HTML_BLOCK_RENDERER_ID: "azeforge.reaction.html/v1";
export declare const STRUCTURE_HTML_BLOCK_RENDERER_ID: "azeforge.structure.html/v1";
export declare const CHEMISTRY_HTML_BLOCK_RENDERER_VERSION: "1.0.3";
export declare const formulaHtmlBlockRenderer: AzeBlockRenderer<FormulaBlock>;
export declare const reactionHtmlBlockRenderer: AzeBlockRenderer<ReactionBlock>;
export declare const structureHtmlBlockRenderer: AzeBlockRenderer<StructureBlock>;
