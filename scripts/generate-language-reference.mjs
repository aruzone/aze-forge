import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { buildGrammarDocument } from "../dist/grammar.js";

const OUTPUT = fileURLToPath(new URL("../docs/language/directive-reference.md", import.meta.url));
const CHECK = process.argv.includes("--check");

const categories = [
  ["Mathematics", "02-mathematics.aze.md", ["equation", "derivation"]],
  ["Visualization", "03-visualization.aze.md", ["plot", "chart"]],
  ["Geometry", "04-geometry.aze.md", ["geometry"]],
  ["Chemistry", "05-chemistry.aze.md", ["formula", "reaction", "structure"]],
  ["Electrical engineering", "06-circuit.aze.md", ["circuit"]],
  ["Digital timing", "07-timing.aze.md", ["timing"]],
  ["Diagrams", "08-diagrams.aze.md", ["diagram", "mermaid"]],
  ["Engineering diagrams", "09-engineering.aze.md", ["control", "free-body"]],
  ["Software and data models", "10-models.aze.md", ["sequence", "state", "entity", "class"]],
  ["Structured technical content", "11-structured-content.aze.md", ["table", "algorithm", "statement", "example"]],
  ["Document composition", "12-composition.aze.md", ["figure", "bibliography", "callout"]],
  ["Backend-authored TeX", "14-tex.aze.md", ["tex"]],
];

const grammar = buildGrammarDocument();
const directives = new Map(grammar.directives.map((directive) => [directive.type, directive]));
const categoryTypes = categories.flatMap(([, , types]) => types);
const registeredTypes = new Set(directives.keys());
const duplicateTypes = categoryTypes.filter((type, index) => categoryTypes.indexOf(type) !== index);
const missingTypes = [...registeredTypes].filter((type) => !categoryTypes.includes(type));
const unknownTypes = categoryTypes.filter((type) => !registeredTypes.has(type));
if (duplicateTypes.length > 0 || missingTypes.length > 0 || unknownTypes.length > 0) {
  throw new Error(
    `Language reference categories do not match the grammar: duplicates [${duplicateTypes.join(", ")}], missing [${missingTypes.join(", ")}], unknown [${unknownTypes.join(", ")}].`,
  );
}

function code(value) {
  return `\`${String(value).replaceAll("`", "\\`")}\``;
}

function typeOf(field) {
  const values = field.values?.map(code).join(", ");
  return values === undefined ? code(field.valueType) : `${code(field.valueType)}: ${values}`;
}

function fieldRows(fields = [], prefix = "") {
  return fields.map((field) => [
    code(`${prefix}${field.key}`),
    typeOf(field),
    field.required ? "yes" : "no",
  ]);
}

function groupRows(groups = [], prefix = "") {
  const rows = [];
  for (const group of groups) {
    const groupPrefix = `${prefix}${group.of}.`;
    rows.push(...fieldRows(group.fields, groupPrefix));
    for (const record of group.records ?? []) {
      rows.push(...recordRows(record, `${groupPrefix}${record.kind}.`));
    }
  }
  return rows;
}

function recordRows(record, prefix = `${record.kind}.`) {
  const rows = (record.fields ?? []).map((field) => [
    code(`${prefix}${field.key}`),
    field.key === "kind" ? `${code("enum")}: ${code(record.kind)}` : typeOf(field),
    field.required ? "yes" : "no",
  ]);
  return [...rows, ...groupRows(record.groups, prefix)];
}

function table(headers, rows) {
  const lines = [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
  ];
  for (const row of rows) lines.push(`| ${row.join(" | ")} |`);
  return lines.join("\n");
}

function bodyRows(body) {
  return [
    ...fieldRows(body.fields),
    ...groupRows(body.groups),
    ...(body.records ?? []).flatMap((record) => recordRows(record)),
  ];
}

function limitRows(limits) {
  return Object.entries(limits).map(([name, value]) => [code(name), code(JSON.stringify(value))]);
}

function directiveSection(directive) {
  const headerRows = [
    ...fieldRows(directive.header.fields),
    ...groupRows(directive.header.groups),
  ];
  const rows = bodyRows(directive.body);
  const bodyDescription = {
    "scalar-lines": "scalar lines",
    "record-list": `a record list opened with ${code(directive.body.recordOpener)}`,
    "keyed-sections": "keyed sections",
  }[directive.body.form];
  const output = [
    `### ${code(directive.type)}`,
    "",
    `Namespace ${code(directive.namespace)}. Body syntax ${code(directive.bodySyntax.id)} version ${code(directive.bodySyntax.version)}. The body uses ${bodyDescription}.`,
    "",
    "#### Header fields",
    "",
    table(["Path", "Type or accepted values", "Required"], headerRows),
    "",
    "#### Body fields",
    "",
    rows.length === 0
      ? "The body has no named fields. Its scalar content follows the directive's language guide."
      : table(["Path", "Type or accepted values", "Required"], rows),
    "",
  ];
  const limits = limitRows(directive.limits);
  if (limits.length > 0) {
    output.push("#### Limits", "", table(["Limit", "Value"], limits), "");
  }
  return output.join("\n");
}

const frontMatterRows = fieldRows(grammar.document.frontMatter.fields);
const categoryRows = categories.map(([name, guide, types]) => [
  `[${name}](${guide})`,
  types.map(code).join(", "),
]);

const output = [
  "# AzeMark directive grammar reference",
  "",
  "> Generated from the same grammar tables the AzeForge compiler uses. Do not edit this file by hand. Run `npm run build --silent && node scripts/generate-language-reference.mjs` after a grammar change.",
  "",
  "Use this page to check exact field names, accepted values, required fields, body forms, and compiler ceilings. The linked category guides explain the notation and provide complete examples that move from small Blocks to demanding documents.",
  "",
  "## Capability map",
  "",
  table(["Guide", "Directives"], categoryRows),
  "",
  "The first eleven rows correspond to the native capability families. `tex` is a separate, explicitly backend-authored escape hatch. It is not native AzeMark notation.",
  "",
  "## Document envelope",
  "",
  `Front matter opens and closes with ${code(grammar.document.frontMatter.delimiters[0])}. A document that contains a directive must declare ${code("azemark: 2")}.`,
  "",
  table(["Front matter field", "Type or accepted values", "Required"], frontMatterRows),
  "",
  `Directive fences are exactly ${code(grammar.document.fences.outer)} at document level and ${code(grammar.document.fences.nested)} when nested. The header/body separator is ${code(grammar.document.fences.separator)}. Structural indentation is ${grammar.document.fences.indent} spaces. Standalone structural comments start with ${code(grammar.document.comments.prefix)}.`,
  "",
  `Document identifiers match ${code(grammar.document.identifier.pattern)} and share one document-wide namespace.`,
  "",
  "## Reading the field tables",
  "",
  "A path such as `x-axis.scale` means `scale` is nested under `x-axis`. A path such as `function.domain.min` starts with a record kind, then follows its nested fields. `required` applies inside that record or group, not to every Block of the directive.",
  "",
  "The tables describe syntax. Semantic rules still apply. For example, a reference must resolve to a compatible earlier declaration, a logarithmic axis accepts only positive values, and a checked reaction must balance. The category guides explain those rules and show accepted Sources.",
  "",
];

for (const [name, guide, types] of categories) {
  output.push(`## ${name}`, "", `Examples and explanation: [${guide}](${guide}).`, "");
  for (const type of types) {
    const directive = directives.get(type);
    if (directive === undefined) throw new Error(`Grammar is missing directive ${type}.`);
    output.push(directiveSection(directive));
  }
}

const generated = `${output.join("\n").trimEnd()}\n`;
if (CHECK) {
  const existing = await readFile(OUTPUT, "utf8");
  if (existing !== generated) {
    console.error("docs/language/directive-reference.md is stale");
    process.exitCode = 1;
  }
} else {
  await writeFile(OUTPUT, generated);
}
