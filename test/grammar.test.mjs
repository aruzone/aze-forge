import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { createCompiler } from "../dist/compiler.js";
import { buildGrammarDocument, grammarDirectiveTypes, serializeGrammar } from "../dist/grammar.js";
import { grammarJsonSchema } from "../dist/grammar-json.js";
import { getBuiltInRegistry } from "../dist/registry.js";

const CLI_PATH = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const ROOT = fileURLToPath(new URL("../", import.meta.url));
const LANGUAGE_DIR = fileURLToPath(new URL("../docs/language/", import.meta.url));

function runCli(arguments_) {
  return spawnSync(process.execPath, [CLI_PATH, ...arguments_], {
    cwd: ROOT,
    encoding: null,
  });
}

/* ------------------------------------------------------------------ *
 * The anti-drift harness: the grammar must be self-consistent with the
 * compiler it describes, in both directions.
 *
 * Forward (described ⇒ accepted): every header key, every record kind and
 * every field the grammar lists is compiled from a Source generated out of
 * the grammar itself; the compiler must not reject it as unknown.
 *
 * Reverse (authored ⇒ described): every surface key and record kind used by
 * a real Block in `docs/language/` must be described by the grammar.
 *
 * The reverse direction is the one that catches omission; the forward
 * direction catches invention. Neither direction is expressed as "an
 * omitted key is rejected", because the validators do not agree on that
 * today: `diagram` ignores unlisted header keys, and `geometry` discards
 * header diagnostics on its success path.
 * ------------------------------------------------------------------ */

const compiler = createCompiler();

function diagnosticsFor(source) {
  const parsed = compiler.parse(source, { sourceName: "probe.aze.md" });
  const validation = compiler.validate(parsed);
  return [...parsed.diagnostics, ...validation.diagnostics];
}

const UNKNOWN_KEY_CODES =
  /#unknown-(?:field|header|declaration|item|kind|key|attribute|record|opener|type|form)$/;

/** The forward probe: the compiler must not call anything described "unknown". */
function unknownDiagnostics(source) {
  return diagnosticsFor(source).filter(({ code }) => UNKNOWN_KEY_CODES.test(code));
}

function valueFor(field, directiveType) {
  const override =
    FIELD_VALUES.get(`${directiveType}/${field.key}`) ??
    FIELD_VALUES.get(`${directiveType}/${field.valueType}`);
  if (override !== undefined) return override;
  switch (field.valueType) {
    case "boolean":
      return "true";
    case "integer":
    case "decimal":
      return "1";
    case "quantity":
      return "1";
    case "enum":
      return field.values?.[0] ?? "probe";
    case "string-list":
      return field.values?.[0] ?? "probe";
    case "point-list":
      return "[0, 0]";
    case "expression":
      return "1";
    case "identifier":
    case "name":
      return "probe";
    case "record":
    case "record-list":
      return undefined;
    default:
      return "probe";
  }
}

function groupFor(groups, key) {
  return (groups ?? []).find((entry) => entry.of === key);
}

/**
 * Values a generic probe cannot guess, keyed by `directive/field` or
 * `directive/valueType`: a circuit terminal is a qualified `ref.port`, a
 * component ref an uppercase token, an analog value a dimensioned quantity.
 */
const FIELD_VALUES = new Map([
  ["circuit/terminal", "R1.a"],
  ["circuit/name", "R1"],
  ["circuit/quantity", "1 ohm"],
  ["free-body/at", "probe"],
  ["free-body/from", "probe"],
  ["free-body/to", "probe"],
]);

/**
 * `string-list` fields the language spells as an authored collection rather
 * than an inline comma list. Every other list is inline (`signs: [+, -]`,
 * `signals: clk, rst`), which is why this is an explicit short list.
 */
const COLLECTION_LISTS = new Set([
  "example/givens",
  "geometry/vertices",
  "geometry/segments",
  "free-body/vertices",
]);

function collectionValueLines(field, indent) {
  return [
    `${indent}${field.key}:`,
    ...(field.values ?? ["probe"]).slice(0, 3).map((value) => `${indent}  - ${value}`),
  ];
}

/** One field line, descending into the field's group when it has one. */
function fieldLines(directive, fields, groups, indent) {
  const lines = [];
  for (const field of fields) {
    const nested = groupFor(groups, field.key);
    if (nested !== undefined) {
      lines.push(`${indent}${field.key}:`);
      lines.push(...nestedLines(directive, nested, field.valueType, `${indent}  `));
      continue;
    }
    const value = valueFor(field, directive.type);
    if (COLLECTION_LISTS.has(`${directive.type}/${field.key}`)) {
      lines.push(...collectionValueLines(field, indent));
      continue;
    }
    lines.push(
      value === undefined ? `${indent}${field.key}:` : `${indent}${field.key}: ${value}`,
    );
  }
  return lines;
}

/** One nested record: the first child opens it, the rest indent under it. */
function nestedLines(directive, nested, valueType, indent) {
  const lines = [];
  if (nested.records !== undefined && nested.records.length > 0) {
    const [entry] = nested.records;
    const opener = acceptedOpener(directive, { entry });
    lines.push(...recordLines(directive, entry, indent, opener ?? openerCandidates(entry, directive.type)[0]));
    return lines;
  }
  const fields = nested.fields ?? [];
  const [first, ...rest] = fields;
  if (first === undefined) return lines;
  const isList = valueType === "record-list" || valueType === "point-list";
  const opener = isList ? `${indent}- ` : indent;
  const firstValue = valueFor(first, directive.type);
  lines.push(
    firstValue === undefined ? `${opener}${first.key}:` : `${opener}${first.key}: ${firstValue}`,
  );
  for (const child of rest) {
    const value = valueFor(child, directive.type);
    const line = `${indent}${isList ? "  " : ""}${child.key}:`;
    lines.push(value === undefined ? line : `${line} ${value}`);
  }
  return lines;
}

/**
 * The surface opens a record three ways: `- kind: <kind>`, `- <kind>:` (the
 * opener is the kind word, e.g. chemistry `- atom:`), or `- <first key>: <v>`
 * (bibliography, chart). The probe searches for the spelling the compiler
 * accepts rather than pinning it here, and fails if none is accepted.
 */
function openerCandidates(entry, directiveType) {
  const candidates = [];
  const [first] = entry.fields;
  if (entry.fields.some((field) => field.key === "kind")) {
    candidates.push({ key: "kind", value: entry.kind });
  }
  // `- <first key>: <value>` is the commonest opener: `- expression:`,
  // `- key:`, chart's `- label:`.
  const firstValue = first === undefined ? undefined : valueFor(first, directiveType);
  if (first !== undefined && firstValue !== undefined) {
    candidates.push({ key: first.key, value: firstValue });
  }
  // `- <kind>: <name>` opens a record by its kind word with the record's name
  // on the opener line (`- atom: o` in a chemistry structure).
  candidates.push({ key: entry.kind, value: "probe" });
  // `- <kind>:` opens a record by its kind word alone (`- bond:`).
  candidates.push({ key: entry.kind, value: "" });
  // Last resort: the discriminator is a record-level convention, so a record
  // whose parser reads the kind from the opener opens `- kind: <kind>`.
  candidates.push({ key: "kind", value: entry.kind, implicit: true });
  return candidates;
}

/** One record opened by `opener`; `drop` omits a field, `onlyRequired` trims. */
function recordLines(directive, entry, indent, opener, drop, onlyRequired = false) {
  const lines = [];
  if (drop !== opener.key) {
    lines.push(
      opener.key === "kind"
        ? `${indent}- kind: ${entry.kind}`
        : `${indent}- ${opener.key}: ${opener.value ?? ""}`.trimEnd(),
    );
  }
  for (const field of entry.fields) {
    if (field.key === opener.key && opener.key !== "kind") continue;
    if (field.key === "kind" && opener.key === "kind") continue;
    if (field.key === drop) continue;
    if (onlyRequired && !field.required) continue;
    const nested = groupFor(entry.groups, field.key);
    if (nested !== undefined) {
      lines.push(`${indent}  ${field.key}:`);
      lines.push(...nestedLines(directive, nested, field.valueType, `${indent}    `));
      continue;
    }
    const value = valueFor(field, directive.type);
    if (COLLECTION_LISTS.has(`${directive.type}/${field.key}`)) {
      lines.push(...collectionValueLines(field, `${indent}  `));
      continue;
    }
    lines.push(
      value === undefined
        ? `${indent}  ${field.key}:`
        : `${indent}  ${field.key}: ${value}`,
    );
  }
  return lines;
}

const openerCache = new Map();

/**
 * Every record the grammar describes, with the section it lives under when it
 * is not a body-level record (algorithm's `steps:` holders, sequence's
 * `timeline:` items).
 */
function probeTargets(directive) {
  const targets = (directive.body.records ?? []).map((entry) => ({ entry }));
  for (const section of directive.body.groups ?? []) {
    for (const entry of section.records ?? []) targets.push({ entry, section });
  }
  for (const entry of directive.body.records ?? []) {
    for (const section of entry.groups ?? []) {
      for (const nested of section.records ?? []) targets.push({ entry: nested, section });
    }
  }
  return targets;
}

/** The body lines for one target under the opener the compiler accepts. */
function targetBody(directive, target, opener, drop, onlyRequired = false, withSiblings = true) {
  const lines = [];
  if (target.section === undefined) {
    // A record may reference a sibling declaration (a free-body force names the
    // body it acts on), so the other body records are emitted first.
    if (withSiblings) {
      // One sibling of a different kind is enough to resolve the references a
      // target may carry without flooding the probe with duplicate declarations.
      const sibling = (directive.body.records ?? []).find(
        (entry) => entry.kind !== target.entry.kind,
      );
      if (sibling !== undefined) {
        const siblingOpener = acceptedOpener(directive, { entry: sibling });
        if (siblingOpener !== undefined) {
          lines.push(...recordLines(directive, sibling, "", siblingOpener, undefined, true));
        }
      }
    }
    lines.push(...recordLines(directive, target.entry, "", opener, drop, onlyRequired));
    return lines;
  }
  // A section record may reference another section's records (a message names
  // its participants), so every sibling section is emitted first.
  for (const sibling of directive.body.groups ?? []) {
    if (sibling.of === target.section.of) continue;
    lines.push(`${sibling.of}:`);
    lines.push(...nestedLines(directive, sibling, "record-list", "  "));
  }
  lines.push(`${target.section.of}:`);
  lines.push(...recordLines(directive, target.entry, "  ", opener, drop, onlyRequired));
  return lines;
}

/** The opener spelling the compiler accepts for one target, or `undefined`. */
function acceptedOpener(directive, target) {
  const cacheKey = `${directive.type}/${target.section?.of ?? ""}/${target.entry.kind}`;
  if (openerCache.has(cacheKey)) return openerCache.get(cacheKey);
  let accepted;
  for (const candidate of openerCandidates(target.entry, directive.type)) {
    const source = probeSource(directive, {
      records: [],
      body: targetBody(directive, target, candidate, undefined, false, false),
    });
    if (unknownDiagnostics(source).length === 0) {
      accepted = candidate;
      break;
    }
  }
  openerCache.set(cacheKey, accepted);
  return accepted;
}

function bodyLines(directive, records, drop) {
  const body = directive.body;
  const lines = fieldLines(directive, body.fields ?? [], body.groups, "");
  for (const entry of records) {
    const target = { entry };
    const opener = acceptedOpener(directive, target);
    lines.push(
      ...recordLines(directive, entry, "", opener ?? openerCandidates(entry, directive.type)[0], drop),
    );
  }
  return lines;
}

/** The header keys a probe must carry: the required ones only. */
function requiredHeaderLines(directive) {
  return fieldLines(
    directive,
    directive.header.fields.filter((field) => field.required),
    directive.header.groups,
    "",
  );
}

function probeSource(directive, { records, header, body }) {
  return [
    "---",
    "azemark: 2",
    "---",
    "",
    `:::: ${directive.type}`,
    ...(header ?? requiredHeaderLines(directive)),
    "----",
    ...(body ?? bodyLines(directive, records ?? directive.body.records ?? [])),
    "::::",
    "",
  ].join("\n");
}

/* ------------------------------------------------------------------ *
 * Completeness and canonical order
 * ------------------------------------------------------------------ */

test("every registered directive is described exactly once, in registry order", () => {
  const report = buildGrammarDocument();
  const registered = getBuiltInRegistry().plugins.map((plugin) => plugin.descriptor.type);
  assert.deepEqual(
    report.directives.map((directive) => directive.type),
    registered,
  );
  assert.deepEqual(grammarDirectiveTypes(), registered);
  assert.equal(report.directives.length, 26);
});

test("each described directive carries its registry identity verbatim", () => {
  const report = buildGrammarDocument();
  for (const plugin of getBuiltInRegistry().plugins) {
    const descriptor = plugin.descriptor;
    const directive = report.directives.find((entry) => entry.type === descriptor.type);
    assert.equal(directive.title, descriptor.title, descriptor.type);
    assert.equal(directive.pluginVersion, descriptor.version, descriptor.type);
    assert.equal(directive.namespace, descriptor.diagnosticNamespace, descriptor.type);
    assert.deepEqual(directive.bodySyntax, { ...descriptor.bodySyntax }, descriptor.type);
  }
});

test("the described directives match the capabilities plugin set exactly", () => {
  const grammar = runCli(["grammar", "--json"]);
  const capabilities = runCli(["capabilities", "--json"]);
  assert.equal(grammar.status, 0);
  assert.equal(capabilities.status, 0);
  const grammarTypes = JSON.parse(grammar.stdout.toString("utf8")).directives.map(({ type }) => type);
  const pluginTypes = JSON.parse(capabilities.stdout.toString("utf8")).plugins.map(({ type }) => type);
  assert.deepEqual([...grammarTypes].sort(), [...pluginTypes].sort());
  assert.deepEqual(grammarTypes, grammarDirectiveTypes());
});

/* ------------------------------------------------------------------ *
 * Forward fidelity: everything described is accepted by the compiler
 * ------------------------------------------------------------------ */

test("every described header key and body field is accepted by the compiler", () => {
  const report = buildGrammarDocument();
  for (const directive of report.directives) {
    const unknown = unknownDiagnostics(
      probeSource(directive, {
        header: fieldLines(
          directive,
          directive.header.fields,
          directive.header.groups,
          "",
        ),
      }),
    );
    assert.deepEqual(
      unknown.map(({ code, message }) => `${code}: ${message}`),
      [],
      `${directive.type} rejects a key the grammar describes`,
    );
  }
});

test("every described record kind is accepted on its own", () => {
  const report = buildGrammarDocument();
  for (const directive of report.directives) {
    for (const target of probeTargets(directive)) {
      if (acceptedOpener(directive, target) !== undefined) continue;
      const [candidate] = openerCandidates(target.entry, directive.type);
      const source = probeSource(directive, {
        records: [],
        body: targetBody(directive, target, candidate),
      });
      assert.fail(
        `${directive.type} rejects record kind "${target.entry.kind}": ` +
          unknownDiagnostics(source).map(({ code, message }) => `${code}: ${message}`).join("; "),
      );
    }
  }
});

function signature(diagnostic) {
  return `${diagnostic.code}|${diagnostic.message}`;
}

/** Positions shift when a line is dropped, so they are stripped before comparing. */
function stripPositions(value) {
  if (Array.isArray(value)) return value.map(stripPositions);
  if (value !== null && typeof value === "object") {
    const stripped = {};
    for (const [key, item] of Object.entries(value)) {
      if (key === "range" || key === "location" || key === "source" || key === "sourceName") {
        continue;
      }
      stripped[key] = stripPositions(item);
    }
    return stripped;
  }
  return value;
}

/** What the compiler made of a probe: the parsed document without positions. */
function parsedShape(source) {
  const parsed = compiler.parse(source, { sourceName: "probe.aze.md" });
  return JSON.stringify(stripPositions(parsed.document.blocks));
}

/**
 * Required-ness is observable as a change of verdict: dropping the field either
 * draws a diagnostic the complete record did not, or changes what the compiler
 * made of the probe (a declaration it silently dropped). The diagnostic name is
 * not asserted, because the validators word it per family ("An operand is
 * expected here." for a derivation step with no `expression:`).
 */
test("a required field is one the compiler misses when it is dropped", () => {
  const report = buildGrammarDocument();
  for (const directive of report.directives) {
    for (const target of probeTargets(directive)) {
      const opener = acceptedOpener(directive, target);
      if (opener === undefined) continue;
      const chosen = target.entry.fields.filter((field) => field.required);
      if (chosen.length === 0) continue;
      for (const dropped of chosen) {
        // `kind` is the record discriminator, not a droppable field: a record
        // without it is not a record of that kind. It stays `required` so the
        // derived schema's `oneOf` branches cannot all match one instance.
        if (dropped.key === "kind") continue;
        // Two baselines: the minimal record (the issue's formulation) and the
        // complete one. A record whose minimal form already trips a cross-field
        // rule — out of scope for this artifact — still attributes its required
        // keys against the complete form.
        const attributed = [true, false].some((onlyRequired) => {
          const source = (drop) =>
            probeSource(directive, {
              records: [],
              body: targetBody(directive, target, opener, drop, onlyRequired),
            });
          const baselineSource = source(undefined);
          const partialSource = source(dropped.key);
          const knownBaseline = new Set(
            diagnosticsFor(baselineSource).map(signature),
          );
          const newDiagnostic = diagnosticsFor(partialSource).some(
            (diagnostic) => !knownBaseline.has(signature(diagnostic)),
          );
          // A validator may drop the record without complaining, leaving only
          // the parsed document to show that the key was required.
          return newDiagnostic || parsedShape(partialSource) !== parsedShape(baselineSource);
        });
        assert.ok(
          attributed,
          `${directive.type}/${target.entry.kind}: dropping required "${dropped.key}" changed nothing`,
        );
      }
    }
  }
});

/* ------------------------------------------------------------------ *
 * Reverse fidelity: everything the corpus authors is described
 * ------------------------------------------------------------------ */

async function corpusBlocks() {
  const files = (await readdir(LANGUAGE_DIR)).filter(
    (name) => name.endsWith(".aze.md") && !name.startsWith("13-"),
  );
  const blocks = new Map();
  for (const name of files) {
    const text = await readFile(`${LANGUAGE_DIR}${name}`, "utf8");
    const lines = text.split("\n");
    for (let index = 0; index < lines.length; index += 1) {
      const opener = /^(:{4,})[ \t]*([a-z][a-z0-9-]*)[ \t]*$/.exec(lines[index] ?? "");
      if (opener === null) continue;
      const [fence, type] = [opener[1], opener[2]];
      let end = index + 1;
      while (end < lines.length && lines[end] !== fence) end += 1;
      const body = lines.slice(index + 1, end);
      if (!blocks.has(type)) blocks.set(type, []);
      blocks.get(type).push(body);
      index = end;
    }
  }
  return blocks;
}

function surfaceTokens(body) {
  const header = [];
  const keys = [];
  const kinds = [];
  let pastSeparator = false;
  for (const line of body) {
    if (/^ {0,3}-{4}[ \t]*$/.test(line)) {
      pastSeparator = true;
      continue;
    }
    const target = pastSeparator ? keys : header;
    const kind = /^-[ \t]*kind[ \t]*:[ \t]*([a-z][a-z0-9-]*)/.exec(line);
    if (kind !== null) kinds.push(kind[1]);
    const opener = /^-[ \t]*([a-z][a-z0-9-]*)[ \t]*:/.exec(line);
    const field = /^([a-z][a-z0-9-]*)[ \t]*:/.exec(line);
    const key = opener?.[1] ?? field?.[1];
    if (key !== undefined) target.push(key);
  }
  return { header, keys, kinds };
}

function describedKeys(directive) {
  // `caption` is the universal composition header key: `block-header.ts` states
  // that `id`, `number` and `caption` register on every kind, and the frozen
  // corpus authors it on directives whose own parser reads a narrower set.
  // `kind` is never a field: it is the record discriminator itself.
  const keys = new Set(["caption", "kind"]);
  const kinds = new Set();
  const visitGroup = (entry) => {
    keys.add(entry.of);
    for (const field of entry.fields ?? []) keys.add(field.key);
    for (const nested of entry.records ?? []) visitRecord(nested);
  };
  const visitRecord = (entry) => {
    kinds.add(entry.kind);
    for (const field of entry.fields) {
      keys.add(field.key);
      if (field.key !== "kind") kinds.add(field.key);
    }
    for (const nested of entry.groups ?? []) visitGroup(nested);
  };
  for (const field of directive.header.fields) keys.add(field.key);
  for (const entry of directive.header.groups ?? []) visitGroup(entry);
  for (const field of directive.body.fields ?? []) keys.add(field.key);
  for (const entry of directive.body.groups ?? []) visitGroup(entry);
  for (const entry of directive.body.records ?? []) visitRecord(entry);
  return { keys, kinds };
}

test("every surface key and record kind the corpus authors is described", async () => {
  const report = buildGrammarDocument();
  const blocks = await corpusBlocks();
  const described = new Map(
    report.directives.map((directive) => [directive.type, describedKeys(directive)]),
  );
  for (const [type, bodies] of blocks) {
    const entry = described.get(type);
    assert.ok(entry !== undefined, `corpus authors undocumented directive "${type}"`);
    const directive = report.directives.find((item) => item.type === type);
    if (directive.body.form === "keyed-sections") continue;
    for (const body of bodies) {
      const { header, keys, kinds } = surfaceTokens(body);
      for (const key of header) {
        assert.ok(entry.keys.has(key), `${type} header key "${key}" is not described`);
      }
      for (const key of keys) {
        assert.ok(
          entry.keys.has(key) || entry.kinds.has(key),
          `${type} body key "${key}" is not described`,
        );
      }
      for (const kind of kinds) {
        assert.ok(entry.kinds.has(kind), `${type} record kind "${kind}" is not described`);
      }
    }
  }
});

/** Inline node kinds, which are not records: `title`/`description` hold them. */
const INLINE_KINDS = new Set([
  "text",
  "emphasis",
  "strong",
  "code",
  "link",
  "break",
  "image",
]);

/** Every record object the parsed Block carries directly: `kind`-bearing arrays. */
function parsedRecordKinds(blocks) {
  const kinds = new Set();
  for (const block of blocks) {
    for (const value of Object.values(block)) {
      if (!Array.isArray(value)) continue;
      for (const item of value) {
        if (item === null || typeof item !== "object") continue;
        if (typeof item.kind !== "string" || INLINE_KINDS.has(item.kind)) continue;
        kinds.add(item.kind);
      }
    }
  }
  return kinds;
}

/** The record kinds the grammar describes, groups included. */
function recordKinds(directive) {
  const kinds = new Set();
  const visitRecord = (entry) => {
    kinds.add(entry.kind);
    for (const nested of entry.groups ?? []) visitGroup(nested);
  };
  const visitGroup = (entry) => {
    for (const nested of entry.records ?? []) visitRecord(nested);
  };
  for (const entry of directive.body.records ?? []) visitRecord(entry);
  for (const entry of directive.body.groups ?? []) visitGroup(entry);
  return kinds;
}

test("a real corpus Block parses into the record kinds the grammar describes", async () => {
  const report = buildGrammarDocument();
  const blocks = await corpusBlocks();
  const checked = [];
  for (const [type, bodies] of blocks) {
    const directive = report.directives.find((item) => item.type === type);
    if (directive.body.form === "keyed-sections") continue;
    const described = recordKinds(directive);
    // The corpus Block is re-fenced so the compiler sees the same Block the
    // documented source authors; positions are irrelevant here.
    const source = [
      "---",
      "azemark: 2",
      "x-circuit-symbol-convention: iec",
      "---",
      "",
      `:::: ${type}`,
      ...(bodies[0] ?? []),
      "::::",
      "",
    ].join("\n");
    const parsed = compiler.parse(source, { sourceName: "corpus.aze.md" });
    const kinds = parsedRecordKinds(parsed.document.blocks);
    if (kinds.size === 0) continue;
    checked.push(type);
    for (const kind of kinds) {
      assert.ok(
        described.has(kind),
        `${type}: the compiler parsed a ${kind} record the grammar does not describe`,
      );
    }
  }
  // `keyed-sections` bodies are excluded (their records live under a section
  // key), and so are directives whose parsed records carry no discriminator
  // (`timing` signals, `structure` atoms, `bibliography` entries). The floor and
  // the named families keep the check from passing vacuously.
  assert.ok(
    checked.length >= 10,
    `only ${checked.length} directives were checked against the corpus: ${checked.join(", ")}`,
  );
  for (const type of ["plot", "chart", "geometry", "circuit", "diagram", "control", "entity"]) {
    assert.ok(checked.includes(type), `${type} was not checked against the corpus`);
  }
});

test("the corpus covers every directive family the grammar describes", async () => {
  const blocks = await corpusBlocks();
  const covered = new Set(blocks.keys());
  for (const type of ["plot", "chart", "timing", "diagram", "sequence", "class"]) {
    assert.ok(covered.has(type), `docs/language authors no ${type} Block`);
  }
});

/* ------------------------------------------------------------------ *
 * Schema fidelity
 * ------------------------------------------------------------------ */

function schemaErrors(schema, value, path = "$") {
  const errors = [];
  if (schema === true || schema === undefined) return errors;
  const fail = (message) => errors.push(`${path}: ${message}`);

  if (schema.const !== undefined && value !== schema.const) {
    fail(`expected ${JSON.stringify(schema.const)}`);
  }
  if (schema.enum !== undefined && !schema.enum.includes(value)) {
    fail(`expected one of ${schema.enum.join(", ")}`);
  }
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actual =
      value === null
        ? "null"
        : Array.isArray(value)
          ? "array"
          : Number.isInteger(value)
            ? "integer"
            : typeof value;
    const matches = types.some(
      (type) => type === actual || (type === "number" && actual === "integer"),
    );
    if (!matches) fail(`expected ${types.join(" | ")}, found ${actual}`);
  }
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      fail(`shorter than ${schema.minLength}`);
    }
    if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(value)) {
      fail(`does not match ${schema.pattern}`);
    }
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) fail("below minimum");
    if (schema.maximum !== undefined && value > schema.maximum) fail("above maximum");
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      fail(`fewer than ${schema.minItems} items`);
    }
    if (schema.items !== undefined) {
      value.forEach((item, index) => errors.push(...schemaErrors(schema.items, item, `${path}[${index}]`)));
    }
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const key of schema.required ?? []) {
      if (value[key] === undefined) fail(`missing required "${key}"`);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (schema.properties?.[key] === undefined) fail(`unexpected property "${key}"`);
      }
    }
    for (const [key, subschema] of Object.entries(schema.properties ?? {})) {
      if (value[key] !== undefined) {
        errors.push(...schemaErrors(subschema, value[key], `${path}.${key}`));
      }
    }
  }
  if (schema.oneOf !== undefined) {
    const matching = schema.oneOf.filter(
      (branch) => schemaErrors(branch, value, path).length === 0,
    );
    if (matching.length !== 1) fail(`matched ${matching.length} of the oneOf branches`);
  }
  return errors;
}

test("the machine document validates against the published report schema", async () => {
  const packaged = JSON.parse(
    await readFile(new URL("../schemas/grammar.json", import.meta.url), "utf8"),
  );
  assert.deepEqual(Object.keys(packaged), Object.keys(grammarJsonSchema));
  const report = JSON.parse(serializeGrammar(buildGrammarDocument()));
  assert.deepEqual(schemaErrors(packaged, report), []);
  assert.equal(report.schema, "azeforge.grammar/v1");
  assert.equal(report.schemaVersion, 1);
  assert.deepEqual(report.azemarkVersions, [2]);
});

test("every body schema is a draft 2020-12 schema consistent with its records", () => {
  for (const directive of buildGrammarDocument().directives) {
    const { schema } = directive.body;
    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema", directive.type);
    assert.equal(schema.$id, `azeforge.${directive.type}/grammar/v1`, directive.type);
    if (directive.body.records !== undefined && directive.body.records.length > 0) {
      assert.equal(schema.type, "array", directive.type);
      const branches = schema.items.oneOf;
      assert.equal(branches.length, directive.body.records.length, directive.type);
      directive.body.records.forEach((entry, index) => {
        const branch = branches[index];
        assert.deepEqual(
          Object.keys(branch.properties).sort(),
          entry.fields.map((field) => field.key).sort(),
          `${directive.type}/${entry.kind}`,
        );
        assert.deepEqual(
          [...branch.required].sort(),
          entry.fields.filter((field) => field.required).map((field) => field.key).sort(),
          `${directive.type}/${entry.kind}`,
        );
      });
      continue;
    }
    assert.equal(schema.type, "object", directive.type);
  }
});

test("the grammar schema id and version are published by version --json", () => {
  const result = runCli(["version", "--json"]);
  assert.equal(result.status, 0);
  const payload = JSON.parse(result.stdout.toString("utf8"));
  const entry = payload.schemas.find(({ id }) => id === "azeforge.grammar/v1");
  assert.deepEqual(entry, { id: "azeforge.grammar/v1", version: 1 });
});

/* ------------------------------------------------------------------ *
 * Determinism and the machine/human split
 * ------------------------------------------------------------------ */

test("the document is deterministic and carries no workstation facts", () => {
  const first = serializeGrammar(buildGrammarDocument());
  const second = serializeGrammar(buildGrammarDocument());
  assert.equal(first, second);
  assert.doesNotMatch(first, /Users|home|darwin|linux|win32|arm64|\d{4}-\d{2}-\d{2}T/);
});

test("--json writes the machine document to stdout and nothing to stderr", () => {
  const result = runCli(["grammar", "--json"]);
  assert.equal(result.status, 0);
  assert.deepEqual(result.stderr, Buffer.alloc(0));
  assert.deepEqual(
    JSON.parse(result.stdout.toString("utf8")),
    JSON.parse(serializeGrammar(buildGrammarDocument())),
  );
});

test("the human report goes to stderr with empty stdout and exit 0", () => {
  const result = runCli(["grammar"]);
  assert.equal(result.status, 0);
  assert.deepEqual(result.stdout, Buffer.alloc(0));
  const human = result.stderr.toString("utf8");
  assert.match(human, /azeforge \d+\.\d+\.\d+ grammar/);
  assert.match(human, /directives: 26/);
  assert.match(human, /grammar --json/);
});

test("--directive narrows to exactly one directive", () => {
  const result = runCli(["grammar", "--json", "--directive", "plot"]);
  assert.equal(result.status, 0);
  assert.deepEqual(result.stderr, Buffer.alloc(0));
  const payload = JSON.parse(result.stdout.toString("utf8"));
  assert.deepEqual(payload.directives.map(({ type }) => type), ["plot"]);
  assert.deepEqual(
    payload.document,
    JSON.parse(serializeGrammar(buildGrammarDocument())).document,
  );
});

test("an unknown directive and unknown options are usage errors on exit 2", () => {
  for (const arguments_ of [
    ["grammar", "--directive", "mystery"],
    ["grammar", "--directive"],
    ["grammar", "--directive", "plot", "--directive", "chart"],
    ["grammar", "--bogus"],
    ["grammar", "source.aze.md"],
  ]) {
    const result = runCli(arguments_);
    assert.equal(result.status, 2, arguments_.join(" "));
    assert.match(
      result.stderr.toString("utf8"),
      /azeforge\.cli#invalid-operation/,
      arguments_.join(" "),
    );
  }
});

test("an unknown directive is refused by the library too", () => {
  for (const name of ["mystery", "toString", "constructor", "__proto__"]) {
    assert.throws(
      () => buildGrammarDocument({ directive: name }),
      /not a registered AzeMark 2 directive/,
      name,
    );
  }
  for (const type of grammarDirectiveTypes()) {
    assert.equal(buildGrammarDocument({ directive: type }).directives.length, 1);
  }
});

test("a returned document cannot be edited into a later one", () => {
  const first = buildGrammarDocument();
  assert.throws(() => {
    first.directives[0].limits.maxStatements = 0;
  }, TypeError);
  assert.throws(() => {
    first.limits.diagnostics.perBlock = 0;
  }, TypeError);
  assert.deepEqual(
    serializeGrammar(buildGrammarDocument()),
    serializeGrammar(first),
  );
});
