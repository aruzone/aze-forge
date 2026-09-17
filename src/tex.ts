import { createDiagnostic } from "./diagnostics.js";
import type { AzeBlockPlugin, Diagnostic, SourceRange, TexBlock } from "./model.js";
import { TEX_BODY_SYNTAX_ID, TEX_BODY_SYNTAX_VERSION, TEX_PLUGIN_TYPE, TEX_PLUGIN_VERSION, TEX_PROFILES, type TexProfile, texDataSchema, texSourceSchema } from "./tex-schemas.js";

export const TEX_HEADER_FIELDS = Object.freeze(["id", "title", "description", "profile"] as const);
export const MAX_TEX_BODY_LENGTH = 50_000;


export interface TexBodyLine {
  readonly text: string;
  readonly range: SourceRange;
}

const FORBIDDEN_COMMAND = /\\(?:documentclass|usepackage|input|InputIfFileExists|include|import|subimport|openin|openout|read|write|shellescape|font(?:[A-Za-z]*)|setmainfont|setsansfont|setmonofont|newfontfamily|addfontfeatures|usefont|selectfont|declarefontfamily|declarefontshape|declarefontsubstitution)(?![A-Za-z@])/i;
const NON_PRINTABLE_BODY_CHARACTER = /[^\t\n\x20-\x7e]/;
export interface TexHeader { readonly id?: string; readonly title?: string; readonly description?: string; readonly profile?: TexProfile; readonly diagnostics: readonly Diagnostic[]; }
function diagnostic(code: string, message: string, range: SourceRange, sourceName: string | undefined, data?: Record<string, string>): Diagnostic {
  return createDiagnostic(code, "error", message, { location: sourceName === undefined ? { range } : { source: sourceName, range }, ...(data === undefined ? {} : { data }) });
}
export function parseTexHeader(entries: readonly { readonly key: string; readonly value: string; readonly range: SourceRange }[], sourceName: string | undefined): TexHeader {
  const diagnostics: Diagnostic[] = []; let id: string | undefined; let title: string | undefined; let description: string | undefined; let profile: TexProfile | undefined;
  const declared = new Set<string>();
  for (const entry of entries) {
    if (!(TEX_HEADER_FIELDS as readonly string[]).includes(entry.key)) { diagnostics.push(diagnostic("azeforge.tex#invalid-attribute", `TeX attribute "${entry.key}" is not supported.`, entry.range, sourceName, { attribute: entry.key })); continue; }
    if (declared.has(entry.key)) { diagnostics.push(diagnostic("azeforge.tex#invalid-attribute", `TeX attribute "${entry.key}" is declared more than once.`, entry.range, sourceName, { attribute: entry.key })); continue; }
    declared.add(entry.key);
    if (entry.key === "id") { if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(entry.value)) diagnostics.push(diagnostic("azeforge.tex#invalid-attribute", "TeX attribute id must be a lowercase identifier.", entry.range, sourceName, { attribute: "id" })); else id = entry.value; continue; }
    if (entry.key === "title" || entry.key === "description") { if (entry.value.length === 0) diagnostics.push(diagnostic("azeforge.tex#invalid-attribute", `TeX attribute ${entry.key} must not be empty.`, entry.range, sourceName, { attribute: entry.key })); else if (entry.key === "title") title = entry.value; else description = entry.value; continue; }
    if (!(TEX_PROFILES as readonly string[]).includes(entry.value)) diagnostics.push(diagnostic("azeforge.tex#unsupported-profile", `TeX profile "${entry.value}" is not supported.`, entry.range, sourceName, { profile: entry.value })); else profile = entry.value as TexProfile;
  }
  return { ...(id === undefined ? {} : { id }), ...(title === undefined ? {} : { title }), ...(description === undefined ? {} : { description }), ...(profile === undefined ? {} : { profile }), diagnostics };
}
export function validateTexBody(options: { readonly header: TexHeader; readonly bodyLines: readonly TexBodyLine[]; readonly blockRange: SourceRange; readonly sourceName?: string }): { readonly block?: TexBlock; readonly diagnostics: readonly Diagnostic[] } {
  const diagnostics = [...options.header.diagnostics];
  if (options.header.title === undefined) diagnostics.push(diagnostic("azeforge.tex#required-attribute", "TeX Blocks require a title attribute.", options.blockRange, options.sourceName, { attribute: "title" }));
  if (options.header.description === undefined) diagnostics.push(diagnostic("azeforge.tex#required-attribute", "TeX Blocks require a description attribute.", options.blockRange, options.sourceName, { attribute: "description" }));
  if (options.header.profile === undefined) diagnostics.push(diagnostic("azeforge.tex#required-attribute", "TeX Blocks require a supported profile attribute.", options.blockRange, options.sourceName, { attribute: "profile" }));
  const body = options.bodyLines.map(({ text }) => text).join("\n");
  if (body.trim().length === 0) diagnostics.push(diagnostic("azeforge.tex#empty", "TeX Block body must not be empty.", options.blockRange, options.sourceName));
  if (body.length > MAX_TEX_BODY_LENGTH) diagnostics.push(diagnostic("azeforge.tex#limit-exceeded", `TeX Block body exceeds ${MAX_TEX_BODY_LENGTH} characters.`, options.blockRange, options.sourceName));
  const nonPrintableLine = options.bodyLines.find(({ text }) => NON_PRINTABLE_BODY_CHARACTER.test(text));
  if (nonPrintableLine !== undefined) diagnostics.push(diagnostic("azeforge.tex#invalid-body", "TeX Block body permits only printable ASCII, tabs, and newlines.", nonPrintableLine.range, options.sourceName));
  const forbiddenLine = options.bodyLines.find(({ text }) => FORBIDDEN_COMMAND.test(text));
  if (forbiddenLine !== undefined) diagnostics.push(diagnostic("azeforge.tex#forbidden-command", "TeX Block body may not declare documents, packages, files, shell escape, or fonts.", forbiddenLine.range, options.sourceName));
  if (diagnostics.length > 0 || options.header.title === undefined || options.header.description === undefined || options.header.profile === undefined) return { diagnostics };
  return { diagnostics, block: { kind: "tex", pluginVersion: TEX_PLUGIN_VERSION, range: options.blockRange, title: options.header.title, description: options.header.description, profile: options.header.profile, body, ...(options.header.id === undefined ? {} : { id: options.header.id }) } };
}
const pluginDescriptor = Object.freeze({ type: TEX_PLUGIN_TYPE, version: TEX_PLUGIN_VERSION, title: "Curated TeX figure", summary: "Trusted server-side TeX compilation to accessible SVG.", diagnosticNamespace: "azeforge.tex", sourceSchema: texSourceSchema, bodySyntax: Object.freeze({ id: TEX_BODY_SYNTAX_ID, version: TEX_BODY_SYNTAX_VERSION }), dataSchema: texDataSchema });
export const texPlugin: AzeBlockPlugin = Object.freeze({ descriptor: pluginDescriptor });
