import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_BIBLIOGRAPHY_ENTRIES,
  MAX_FOOTNOTE_DEFINITIONS,
  MAX_LOCATOR_VALUE_LENGTH,
  MAX_REFERENCE_GROUP_TARGETS,
  referenceGroupDelimiters,
  renderEndnotesSection,
  resolveDocumentComposition,
} from "../dist/composition.js";

/* ------------------------------------------------------------------ *
 * Synthetic Document builders. The resolver reads authored fields only,
 * so these carry the shape and the fields each case exercises.
 * ------------------------------------------------------------------ */

function range(line) {
  return {
    start: { line, column: 1, offset: (line - 1) * 20 },
    end: { line, column: 2, offset: (line - 1) * 20 + 1 },
  };
}

const text = (value) => ({ kind: "text", value });

const reference = (target, line, extra = {}) => ({
  kind: "reference",
  target,
  form: "in-text",
  range: range(line),
  ...extra,
});

const footnoteToken = (label, line) => ({
  kind: "footnote",
  label,
  range: range(line),
});

const group = (line, targets) => ({
  kind: "referenceGroup",
  targets,
  range: range(line),
});

const paragraph = (line, children = [], extra = {}) => ({
  kind: "paragraph",
  children,
  range: range(line),
  ...extra,
});

const heading = (line, children = [], extra = {}) => ({
  kind: "heading",
  level: 2,
  children,
  range: range(line),
  ...extra,
});

const blockquote = (line, children = [], extra = {}) => ({
  kind: "blockquote",
  children,
  range: range(line),
  ...extra,
});

const callout = (line, children = [], extra = {}) => ({
  kind: "callout",
  variant: "note",
  children,
  range: range(line),
  ...extra,
});

function figure(line, id, options = {}) {
  return {
    kind: "figure",
    children: options.children ?? [],
    range: range(line),
    id,
    ...(options.number === undefined ? {} : { number: options.number }),
    ...(options.caption === undefined ? {} : { caption: options.caption }),
    pluginVersion: "1.0.0",
  };
}

function table(line, id, options = {}) {
  return {
    kind: "table",
    data: options.data ?? { columns: [], rows: [] },
    range: range(line),
    id,
    ...(options.number === undefined ? {} : { number: options.number }),
    ...(options.caption === undefined ? {} : { caption: options.caption }),
    pluginVersion: "2.0.0",
  };
}

const typedTable = (line, id, options) =>
  table(line, id, {
    ...options,
    data: {
      columns: [{ key: "note", name: "Note", type: "prose" }],
      rows: [{ note: { kind: "prose", value: options.note ?? [] } }],
    },
  });

function equation(line, id, options = {}) {
  return {
    kind: "equation",
    notation: "plain",
    spelling: "x = y",
    range: range(line),
    id,
    ...(options.number === undefined ? {} : { number: options.number }),
    pluginVersion: "1.0.0",
  };
}

function statement(line, id, statementKind, options = {}) {
  return {
    kind: "statement",
    statementKind,
    text: options.text ?? [],
    ...(options.proof === undefined ? {} : { proof: options.proof }),
    range: range(line),
    id,
    ...(options.number === undefined ? {} : { number: options.number }),
    pluginVersion: "1.0.0",
  };
}

function example(line, id, options = {}) {
  return {
    kind: "example",
    problem: options.problem ?? [],
    givens: [],
    steps: options.steps ?? [],
    ...(options.result === undefined ? {} : { result: options.result }),
    range: range(line),
    id,
    ...(options.number === undefined ? {} : { number: options.number }),
    pluginVersion: "1.0.0",
  };
}

function entry(key, options = {}) {
  return {
    key,
    entryType: options.entryType ?? "book",
    title: options.title ?? key,
    authors: options.authors ?? [],
    ...(options.year === undefined ? {} : { year: options.year }),
    range: range(options.line ?? 1),
  };
}

const author = (name, family) => ({
  name,
  ...(family === undefined ? {} : { family }),
});

const bibliography = (line, entries) => ({
  kind: "bibliography",
  entries,
  range: range(line),
  pluginVersion: "1.0.0",
});

const definition = (line, label, children = []) => ({
  kind: "footnoteDefinition",
  label,
  children,
  range: range(line),
});

function document(blocks, options = {}) {
  return {
    azemarkVersion: 2,
    schemaVersion: 3,
    metadata: {
      authors: [],
      extensions: {},
      ...(options.citationStyle === undefined
        ? {}
        : { citationStyle: options.citationStyle }),
    },
    blocks,
  };
}

/* ------------------------------------------------------------------ *
 * Assertions
 * ------------------------------------------------------------------ */

function codes(result, severity = "error") {
  return result.diagnostics
    .filter((diagnostic) => diagnostic.severity === severity)
    .map((diagnostic) => diagnostic.code);
}

function contained(block) {
  switch (block.kind) {
    case "figure":
    case "callout":
    case "blockquote":
      return block.children;
    case "list":
      return block.items.flatMap((item) => item.blocks);
    case "statement":
      return [...block.text, ...(block.proof ?? [])];
    case "example":
      return [
        ...block.problem,
        ...block.steps.flatMap((step) => step.text),
        ...(block.result ?? []),
      ];
    default:
      return [];
  }
}

function everyBlock(blocks, out = []) {
  for (const block of blocks) {
    out.push(block);
    everyBlock(contained(block), out);
  }
  return out;
}

function findBlock(result, kind, id) {
  const found = everyBlock(result.document.blocks).find(
    (block) => block.kind === kind && block.id === id,
  );
  assert.ok(found, `expected a ${kind} Block with id ${id}`);
  return found;
}

function paragraphs(result) {
  return result.document.blocks.filter((block) => block.kind === "paragraph");
}

function assertOneCode(result, code, severity = "error") {
  const matches = result.diagnostics.filter(
    (diagnostic) => diagnostic.code === code && diagnostic.severity === severity,
  );
  assert.equal(
    matches.length,
    1,
    `expected one ${code}, saw [${result.diagnostics.map((diagnostic) => diagnostic.code).join(", ")}]`,
  );
  return matches[0];
}

/** Bibliography entries keyed by `key`, from the derived works-cited list. */
function worksCitedKeys(result) {
  const bibliographyBlock = result.document.blocks.find(
    (block) => block.kind === "bibliography",
  );
  assert.ok(bibliographyBlock);
  return (bibliographyBlock.worksCited ?? []).map((record) => record.key);
}

/** Citation labels in the order the resolved tokens appear. */
function citationLabels(result) {
  const labels = [];
  const visit = (nodes) => {
    for (const node of nodes) {
      if (node.kind === "reference" && node.resolved?.citation === true) {
        labels.push(node.resolved.label);
      }
      if (node.kind === "referenceGroup") visit(node.targets);
      if (node.kind === "emphasis" || node.kind === "strong" || node.kind === "link") {
        visit(node.children);
      }
    }
  };
  for (const block of result.document.blocks) {
    if (block.kind === "paragraph" || block.kind === "heading") visit(block.children);
  }
  return labels;
}

/* ------------------------------------------------------------------ *
 * Numbering
 * ------------------------------------------------------------------ */

const NESTED_NUMBERING = document([
  figure(1, "outer-figure", {
    number: true,
    caption: [text("Cooling curve")],
    children: [],
  }),
  blockquote(2, [table(3, "table-in-quote", { number: true })], {
    number: true,
  }),
  table(4, "table-one", { number: true }),
  table(5, "table-two"),
  table(6, "table-three", { number: true }),
  statement(7, "theorem-one", "theorem", {
    number: true,
    text: [paragraph(8)],
    proof: [table(9, "table-in-proof", { number: true })],
  }),
  statement(10, "lemma-one", "lemma", { number: true, text: [paragraph(11)] }),
  example(12, "example-one", {
    number: true,
    problem: [paragraph(13)],
    steps: [{ text: [table(14, "table-in-step", { number: true })], range: range(14) }],
    result: [figure(15, "figure-in-result", { number: true })],
  }),
  callout(16, [figure(17, "figure-in-callout", { number: true })]),
  figure(18, "figure-unnumbered", { caption: [text("Unnumbered sketch")] }),
  equation(19, "equation-one", { number: true }),
]);

test("numbers one class per kind in document order, including nested Blocks", () => {
  const result = resolveDocumentComposition(NESTED_NUMBERING);
  assert.deepEqual(codes(result), []);

  assert.equal(findBlock(result, "figure", "outer-figure").numberLabel, "Figure 1");
  assert.equal(findBlock(result, "figure", "figure-in-result").numberLabel, "Figure 2");
  assert.equal(findBlock(result, "figure", "figure-in-callout").numberLabel, "Figure 3");
  assert.equal(findBlock(result, "table", "table-in-quote").numberLabel, "Table 1");
  assert.equal(findBlock(result, "table", "table-one").numberLabel, "Table 2");
  assert.equal(findBlock(result, "table", "table-three").numberLabel, "Table 3");
  assert.equal(findBlock(result, "table", "table-in-proof").numberLabel, "Table 4");
  assert.equal(findBlock(result, "table", "table-in-step").numberLabel, "Table 5");
  assert.equal(findBlock(result, "statement", "theorem-one").numberLabel, "Theorem 1");
  assert.equal(findBlock(result, "statement", "lemma-one").numberLabel, "Lemma 1");
  assert.equal(findBlock(result, "example", "example-one").numberLabel, "Example 1");
});

test("writes numberLabel only on numbered Blocks of a labelling kind", () => {
  const result = resolveDocumentComposition(NESTED_NUMBERING);

  const unnumbered = findBlock(result, "table", "table-two");
  assert.equal(unnumbered.numberLabel, undefined);
  assert.equal(Object.hasOwn(unnumbered, "numberLabel"), false);

  const unnumberedFigure = findBlock(result, "figure", "figure-unnumbered");
  assert.equal(Object.hasOwn(unnumberedFigure, "numberLabel"), false);

  // The equation consumes Equation 1 but its Block type carries no label field.
  const equationBlock = findBlock(result, "equation", "equation-one");
  assert.equal(Object.hasOwn(equationBlock, "numberLabel"), false);
});

test("a number: false Block consumes no counter value", () => {
  const result = resolveDocumentComposition(
    document([
      table(1, "first", { number: true }),
      table(2, "skipped", { number: false }),
      table(3, "second", { number: true }),
    ]),
  );
  assert.equal(findBlock(result, "table", "first").numberLabel, "Table 1");
  assert.equal(findBlock(result, "table", "second").numberLabel, "Table 2");
});

test("counts and resolves Blocks nested in a list item", () => {
  const result = resolveDocumentComposition(
    document([
      paragraph(1, [reference("table-in-item", 1)]),
      {
        kind: "list",
        ordered: true,
        items: [
          { blocks: [table(2, "table-in-item", { number: true })], range: range(2) },
        ],
        range: range(2),
      },
    ]),
  );
  assert.deepEqual(codes(result), []);
  assert.equal(findBlock(result, "table", "table-in-item").numberLabel, "Table 1");
  assert.deepEqual(paragraphs(result)[0].children[0].resolved, {
    href: "#table-in-item",
    label: "Table 1",
    citation: false,
  });
});

/* ------------------------------------------------------------------ *
 * Identifier namespace
 * ------------------------------------------------------------------ */

test("resolves forward references to the final number and href", () => {
  const result = resolveDocumentComposition(
    document([
      paragraph(1, [
        text("See "),
        reference("table-later", 1),
        text(", "),
        reference("figure-later", 1),
        text(", "),
        reference("figure-unnumbered", 1),
        text(", and "),
        reference("figure-plain", 1),
      ]),
      figure(2, "figure-first", { number: true }),
      table(3, "table-first", { number: true }),
      table(4, "table-later", { number: true }),
      figure(5, "figure-later", { number: true }),
      figure(6, "figure-unnumbered", { caption: [text("Sketch of the rig")] }),
      figure(7, "figure-plain"),
      equation(8, "equation-one", { number: true }),
      paragraph(9, [reference("equation-one", 9)]),
    ]),
  );
  assert.deepEqual(codes(result), []);

  const [first, second] = paragraphs(result);
  const [later, laterFigure, captionTarget, bareKind] = first.children.filter(
    (node) => node.kind === "reference",
  );
  assert.deepEqual(later.resolved, {
    href: "#table-later",
    label: "Table 2",
    citation: false,
  });
  assert.deepEqual(laterFigure.resolved, {
    href: "#figure-later",
    label: "Figure 2",
    citation: false,
  });
  assert.deepEqual(captionTarget.resolved, {
    href: "#figure-unnumbered",
    label: "Sketch of the rig",
    citation: false,
  });
  assert.deepEqual(bareKind.resolved, {
    href: "#figure-plain",
    label: "Figure",
    citation: false,
  });
  assert.equal(
    second.children[0].resolved.label,
    "Equation 1",
    "a numbered kind without a label field still numbers",
  );
});

test("numbers a numbered bibliography directive and labels references to it", () => {
  const result = resolveDocumentComposition(
    document([
      paragraph(1, [reference("references", 1)]),
      { ...bibliography(2, [entry("knuth-1984", { line: 3 })]), id: "references", number: true },
    ]),
  );
  assert.deepEqual(codes(result), []);
  assert.equal(findBlock(result, "bibliography", "references").numberLabel, "Bibliography 1");
  assert.deepEqual(paragraphs(result)[0].children[0].resolved, {
    href: "#references",
    label: "Bibliography 1",
    citation: false,
  });
});

test("reports an unresolved reference and leaves it unresolved", () => {
  const result = resolveDocumentComposition(
    document([paragraph(4, [text("See "), reference("missing-one", 4)])]),
  );
  const diagnostic = assertOneCode(result, "azeforge.reference#unresolved-reference");
  assert.deepEqual(diagnostic.data, { target: "missing-one" });
  assert.equal(diagnostic.location.range.start.line, 4);
  assert.equal(paragraphs(result)[0].children[1].resolved, undefined);
});

test("reports a duplicate identifier with every site as a relatedLocation", () => {
  const result = resolveDocumentComposition(
    document([
      paragraph(1, [], { id: "cooling-trial" }),
      paragraph(2, [], { id: "other" }),
      table(3, "cooling-trial"),
      bibliography(4, [entry("cooling-trial", { line: 4 })]),
    ]),
  );
  const diagnostic = assertOneCode(result, "azeforge.reference#duplicate-id");
  assert.deepEqual(diagnostic.data, { id: "cooling-trial", count: 3 });
  const sites = [
    diagnostic.location.range.start.line,
    ...diagnostic.relatedLocations.map((related) => related.range.start.line),
  ];
  assert.deepEqual([...new Set(sites)].sort((a, b) => a - b), [1, 3, 4]);
  assert.equal(diagnostic.relatedLocations.length, 3);
});

test("reports a malformed Block id and keeps it out of the namespace", () => {
  const result = resolveDocumentComposition(
    document([
      paragraph(1, [], { id: "Bad_ID" }),
      paragraph(2, [reference("Bad_ID", 2)]),
    ]),
  );
  const invalid = assertOneCode(result, "azeforge.reference#invalid-id");
  assert.deepEqual(invalid.data, { id: "Bad_ID" });
  assert.deepEqual(codes(result), [
    "azeforge.reference#invalid-id",
    "azeforge.reference#unresolved-reference",
  ]);
});

/* ------------------------------------------------------------------ *
 * Locators and groups
 * ------------------------------------------------------------------ */

const CITATION_DOCUMENT = (citationStyle) =>
  document(
    [
      paragraph(1, [reference("lamport-1986", 1, { form: "parenthetical" })]),
      paragraph(2, [
        group(2, [
          reference("knuth-1984", 2, {
            form: "parenthetical",
            locator: { word: "page", value: "12" },
          }),
          reference("knuth-1984-companion", 2, { form: "parenthetical" }),
        ]),
      ]),
      bibliography(3, [
        entry("knuth-1984", {
          line: 4,
          title: "The TeXbook",
          authors: [author("Donald E. Knuth", "Knuth")],
          year: "1984",
        }),
        entry("lamport-1986", {
          line: 5,
          title: "LaTeX",
          authors: [author("Leslie Lamport", "Lamport")],
          year: "1986",
        }),
        entry("knuth-1984-companion", {
          line: 6,
          title: "Companion to the TeXbook",
          authors: [author("Donald E. Knuth", "Knuth")],
          year: "1984",
        }),
        entry("never-cited", {
          line: 7,
          title: "Unreferenced",
          authors: [author("Ada Lovelace", "Lovelace")],
          year: "1843",
        }),
      ]),
    ],
    { citationStyle },
  );

test("locators attach only to Citations", () => {
  const result = resolveDocumentComposition(
    document([
      paragraph(1, [
        reference("table-one", 1, {
          form: "parenthetical",
          locator: { word: "page", value: "7" },
        }),
      ]),
      table(2, "table-one", { number: true }),
    ]),
  );
  const diagnostic = assertOneCode(result, "azeforge.citation#locator-on-reference");
  assert.deepEqual(diagnostic.data, { target: "table-one" });
  const token = paragraphs(result)[0].children[0];
  assert.deepEqual(token.resolved, {
    href: "#table-one",
    label: "Table 1",
    citation: false,
  });
});

test("numeric citations number in first-citation order and cite every used entry", () => {
  const result = resolveDocumentComposition(CITATION_DOCUMENT("numeric"));
  assert.deepEqual(codes(result), []);

  assert.deepEqual(citationLabels(result), ["1", "2, p. 12", "3"]);
  assert.deepEqual(worksCitedKeys(result), [
    "lamport-1986",
    "knuth-1984",
    "knuth-1984-companion",
  ]);

  const uncited = assertOneCode(result, "azeforge.citation#uncited-entry", "warning");
  assert.deepEqual(uncited.data, { key: "never-cited" });

  const citation = paragraphs(result)[0].children[0];
  assert.deepEqual(citation.resolved, {
    href: "#lamport-1986",
    label: "1",
    citation: true,
  });
});

test("author-year sorts, disambiguates and labels cited entries", () => {
  const result = resolveDocumentComposition(CITATION_DOCUMENT("author-year"));
  assert.deepEqual(codes(result), []);

  assert.deepEqual(citationLabels(result), [
    "Lamport 1986",
    "Knuth 1984b, page 12",
    "Knuth 1984a",
  ]);
  assert.deepEqual(worksCitedKeys(result), [
    "knuth-1984-companion",
    "knuth-1984",
    "lamport-1986",
  ]);

  const groupBlock = paragraphs(result)[1].children[0];
  assert.deepEqual(groupBlock.resolved, {
    open: "(",
    close: ")",
    separator: "; ",
  });
  assert.equal(groupBlock.targets[0].resolved.href, "#knuth-1984");
});

test("author-year labels sort by author, then year, then title", () => {
  const result = resolveDocumentComposition(
    document(
      [
        paragraph(1, [
          reference("zed", 1, { form: "parenthetical" }),
          reference("alpha", 1, { form: "parenthetical" }),
          reference("anon", 1, { form: "parenthetical" }),
        ]),
        bibliography(2, [
          entry("zed", {
            line: 3,
            title: "Zed",
            authors: [author("Zed Zulu", "Zulu")],
            year: "2001",
          }),
          entry("alpha", {
            line: 4,
            title: "Alpha",
            authors: [author("Alpha Able", "Able")],
            year: "1999",
          }),
          entry("anon", {
            line: 5,
            title: "Anon",
            authors: [author("Anon Author", "Anon")],
            year: "unspecified",
          }),
        ]),
      ],
      { citationStyle: "author-year" },
    ),
  );
  assert.deepEqual(worksCitedKeys(result), ["alpha", "anon", "zed"]);
  assert.deepEqual(citationLabels(result), ["Zulu 2001", "Able 1999", "Anon n.d."]);
});

test("author-year errors per entry when an author family name is absent", () => {
  const result = resolveDocumentComposition(
    document(
      [
        paragraph(1, [reference("no-family", 1, { form: "parenthetical" })]),
        bibliography(2, [
          entry("no-family", {
            line: 3,
            title: "Anonymous collective",
            authors: [author("Anonymous Collective")],
            year: "2001",
          }),
        ]),
      ],
      { citationStyle: "author-year" },
    ),
  );
  const diagnostic = assertOneCode(result, "azeforge.citation#missing-family-name");
  assert.deepEqual(diagnostic.data, { key: "no-family" });
});

test("numeric style does not require an author family name", () => {
  const result = resolveDocumentComposition(
    document([
      paragraph(1, [reference("no-family", 1, { form: "parenthetical" })]),
      bibliography(2, [
        entry("no-family", {
          line: 3,
          title: "Anonymous collective",
          authors: [author("Anonymous Collective")],
          year: "2001",
        }),
      ]),
    ]),
  );
  assert.deepEqual(codes(result), []);
});

test("citation without a bibliography errors missing-bibliography", () => {
  const result = resolveDocumentComposition(
    document([
      paragraph(1, [
        reference("knuth-1984", 1, {
          form: "parenthetical",
          locator: { word: "page", value: "12" },
        }),
        reference("knuth-1984", 1, { form: "in-text" }),
      ]),
    ]),
  );
  assert.deepEqual(codes(result), [
    "azeforge.citation#missing-bibliography",
    "azeforge.reference#unresolved-reference",
  ]);
});

test("a second bibliography directive errors", () => {
  const result = resolveDocumentComposition(
    document([
      bibliography(1, [entry("first", { line: 2 })]),
      bibliography(3, [entry("second", { line: 4 })]),
    ]),
  );
  const diagnostic = assertOneCode(result, "azeforge.citation#duplicate-bibliography");
  assert.equal(diagnostic.location.range.start.line, 3);
  assert.equal(diagnostic.relatedLocations[0].range.start.line, 1);
});

test("a reference group reports its delimiters and each target label", () => {
  assert.deepEqual(referenceGroupDelimiters("numeric"), {
    open: "[",
    close: "]",
    separator: "; ",
  });
  assert.deepEqual(referenceGroupDelimiters("author-year"), {
    open: "(",
    close: ")",
    separator: "; ",
  });

  const result = resolveDocumentComposition(CITATION_DOCUMENT("numeric"));
  const resolvedGroup = paragraphs(result)[1].children[0];
  assert.deepEqual(resolvedGroup.resolved, {
    open: "[",
    close: "]",
    separator: "; ",
  });
});

/* ------------------------------------------------------------------ *
 * Footnotes
 * ------------------------------------------------------------------ */

const FOOTNOTE_DOCUMENT = document([
  paragraph(1, [text("First"), footnoteToken("note-b", 1)]),
  paragraph(2, [
    footnoteToken("note-a", 2),
    text(" and "),
    footnoteToken("note-b", 2),
  ]),
  definition(3, "note-b", [text("Note B text")]),
  definition(4, "note-a", [text("Note A text")]),
  definition(5, "note-orphan", [text("Never referenced")]),
]);

test("numbers footnote markers in first-reference order and shares one number", () => {
  const result = resolveDocumentComposition(FOOTNOTE_DOCUMENT);
  assert.deepEqual(codes(result), []);

  const first = paragraphs(result)[0].children[1];
  const second = paragraphs(result)[1].children[0];
  const repeat = paragraphs(result)[1].children[2];
  assert.deepEqual(first.resolved, { href: "#fn-note-b", number: 1, marker: 1 });
  assert.deepEqual(second.resolved, { href: "#fn-note-a", number: 2, marker: 1 });
  assert.deepEqual(repeat.resolved, { href: "#fn-note-b", number: 1, marker: 2 });

  assert.deepEqual(
    result.document.composition.endnotes.map((note) => ({
      label: note.label,
      number: note.number,
      markers: note.markers,
    })),
    [
      { label: "note-b", number: 1, markers: 2 },
      { label: "note-a", number: 2, markers: 1 },
    ],
  );

  const orphan = assertOneCode(
    result,
    "azeforge.footnote#unreferenced-definition",
    "warning",
  );
  assert.deepEqual(orphan.data, { label: "note-orphan" });
});

test("renders the endnotes section in first-reference order with one backlink per marker", () => {
  const result = resolveDocumentComposition(FOOTNOTE_DOCUMENT);
  const html = renderEndnotesSection(result.document);

  assert.match(html, /<section class="aze-endnotes"/);
  assert.ok(
    html.indexOf('id="fn-note-b"') < html.indexOf('id="fn-note-a"'),
    "definitions follow first-reference order",
  );
  assert.match(html, /href="#fnref-note-b-1"/);
  assert.match(html, /href="#fnref-note-b-2"/);
  assert.match(html, /href="#fnref-note-a-1"/);
  assert.equal(html.includes("fnref-note-a-2"), false);
  assert.match(html, /Note B text/);

  assert.equal(renderEndnotesSection(document([paragraph(1)])), "");
});

test("footnote diagnostics: missing, duplicate and nested markers", () => {
  const missing = resolveDocumentComposition(
    document([paragraph(1, [footnoteToken("ghost", 1)])]),
  );
  const missingDiagnostic = assertOneCode(missing, "azeforge.footnote#missing-definition");
  assert.deepEqual(missingDiagnostic.data, { label: "ghost" });
  assert.equal(paragraphs(missing)[0].children[0].resolved, undefined);

  const duplicate = resolveDocumentComposition(
    document([
      definition(1, "note-a", [text("First")]),
      definition(2, "note-a", [text("Second")]),
    ]),
  );
  const duplicateDiagnostic = assertOneCode(
    duplicate,
    "azeforge.footnote#duplicate-definition",
  );
  assert.equal(duplicateDiagnostic.location.range.start.line, 2);
  assert.equal(duplicateDiagnostic.relatedLocations[0].range.start.line, 1);

  const nested = resolveDocumentComposition(
    document([
      definition(1, "note-a", [text("Outer"), footnoteToken("note-b", 1)]),
      definition(2, "note-b", [text("Inner")]),
    ]),
  );
  assertOneCode(nested, "azeforge.footnote#nested-marker");
  assert.equal(
    nested.document.composition.endnotes.some((note) => note.label === "note-b"),
    false,
  );
});

test("footnote labels never join the identifier namespace", () => {
  const result = resolveDocumentComposition(
    document([
      paragraph(1, [reference("note-a", 1)]),
      definition(2, "note-a", [text("Body")]),
    ]),
  );
  assertOneCode(result, "azeforge.reference#unresolved-reference");
});

/* ------------------------------------------------------------------ *
 * Inline contexts
 * ------------------------------------------------------------------ */

test("resolves tokens in captions, headings, table prose cells and footnote content", () => {
  const result = resolveDocumentComposition(
    document([
      heading(1, [reference("table-one", 1)], {}),
      table(2, "table-one", { number: true, caption: [reference("table-one", 2)] }),
      typedTable(3, "table-two", { note: [reference("table-one", 3)] }),
      definition(4, "note-a", [reference("table-one", 4)]),
      paragraph(5, [footnoteToken("note-a", 5)]),
    ]),
  );
  assert.deepEqual(codes(result), []);

  const headingToken = result.document.blocks.find((block) => block.kind === "heading")
    .children[0];
  assert.equal(headingToken.resolved.label, "Table 1");

  const caption = findBlock(result, "table", "table-one").caption[0];
  assert.equal(caption.resolved.label, "Table 1");

  const cell = findBlock(result, "table", "table-two").data.rows[0].note.value[0];
  assert.equal(cell.resolved.href, "#table-one");

  const endnote = result.document.composition.endnotes[0];
  assert.equal(endnote.children[0].resolved.label, "Table 1");
});

/* ------------------------------------------------------------------ *
 * Ceilings
 * ------------------------------------------------------------------ */

test("enforces the fail-closed ceilings", () => {
  const oversizedGroup = resolveDocumentComposition(
    document([
      paragraph(1, [
        group(
          1,
          Array.from({ length: MAX_REFERENCE_GROUP_TARGETS + 1 }, () =>
            reference("table-one", 1),
          ),
        ),
      ]),
      table(2, "table-one", { number: true }),
    ]),
  );
  const groupDiagnostic = assertOneCode(oversizedGroup, "azeforge.reference#limit-exceeded");
  assert.deepEqual(groupDiagnostic.data, {
    subject: "reference-group-targets",
    count: MAX_REFERENCE_GROUP_TARGETS + 1,
    limit: MAX_REFERENCE_GROUP_TARGETS,
  });

  const longLocator = resolveDocumentComposition(
    document([
      paragraph(1, [
        reference("entry-one", 1, {
          form: "parenthetical",
          locator: {
            word: "page",
            value: "9".repeat(MAX_LOCATOR_VALUE_LENGTH + 1),
          },
        }),
      ]),
      bibliography(2, [entry("entry-one", { line: 3 })]),
    ]),
  );
  const locatorDiagnostic = longLocator.diagnostics.find(
    (diagnostic) => diagnostic.data.subject === "locator-value",
  );
  assert.deepEqual(locatorDiagnostic.data, {
    subject: "locator-value",
    count: MAX_LOCATOR_VALUE_LENGTH + 1,
    limit: MAX_LOCATOR_VALUE_LENGTH,
  });

  const manyEntries = resolveDocumentComposition(
    document([
      bibliography(
        1,
        Array.from({ length: MAX_BIBLIOGRAPHY_ENTRIES + 1 }, (_unused, index) =>
          entry(`entry-${index}`, { line: index + 2 }),
        ),
      ),
    ]),
  );
  const entryDiagnostic = manyEntries.diagnostics.find(
    (diagnostic) => diagnostic.data.subject === "bibliography-entries",
  );
  assert.deepEqual(entryDiagnostic.data, {
    subject: "bibliography-entries",
    count: MAX_BIBLIOGRAPHY_ENTRIES + 1,
    limit: MAX_BIBLIOGRAPHY_ENTRIES,
  });

  const manyDefinitions = resolveDocumentComposition(
    document(
      Array.from({ length: MAX_FOOTNOTE_DEFINITIONS + 1 }, (_unused, index) =>
        definition(index + 1, `note-${index}`),
      ),
    ),
  );
  const definitionDiagnostic = manyDefinitions.diagnostics.find(
    (diagnostic) => diagnostic.data.subject === "footnote-definitions",
  );
  assert.deepEqual(definitionDiagnostic.data, {
    subject: "footnote-definitions",
    count: MAX_FOOTNOTE_DEFINITIONS + 1,
    limit: MAX_FOOTNOTE_DEFINITIONS,
  });
});

/* ------------------------------------------------------------------ *
 * Determinism
 * ------------------------------------------------------------------ */

test("resolution is deterministic and idempotent", () => {
  const source = document(
    [
      paragraph(1, [
        text("See "),
        reference("table-later", 1),
        text(" and "),
        reference("knuth-1984", 1, {
          form: "parenthetical",
          locator: { word: "chapter", value: "3" },
        }),
        text(" plus "),
        footnoteToken("note-a", 1),
      ]),
      table(2, "table-later", { number: true }),
      bibliography(3, [
        entry("knuth-1984", {
          line: 4,
          title: "The TeXbook",
          authors: [author("Donald E. Knuth", "Knuth")],
          year: "1984",
        }),
      ]),
      definition(5, "note-a", [reference("table-later", 5)]),
    ],
    { citationStyle: "author-year" },
  );

  const first = resolveDocumentComposition(source);
  const second = resolveDocumentComposition(source);
  assert.deepEqual(first.document, second.document);
  assert.deepEqual(first.diagnostics, second.diagnostics);

  const replayed = resolveDocumentComposition(first.document);
  assert.deepEqual(replayed.document, first.document);
  assert.deepEqual(replayed.diagnostics, first.diagnostics);
});

/* ------------------------------------------------------------------ *
 * End-to-end acceptance through the real compiler (contract: issue #67 §12)
 * ------------------------------------------------------------------ */

const compilerPromise = import("../dist/index.js");

async function render(source, { format = "html", ...options } = {}) {
  const { createCompiler } = await compilerPromise;
  return createCompiler().compile(source, {
    format,
    sourceName: "report.aze.md",
    ...options,
  });
}

async function renderedBody(source, options = {}) {
  const result = await render(source, options);
  assert.deepEqual(
    result.diagnostics.map(({ code }) => code),
    [],
  );
  assert.ok(result.artifact);
  return new TextDecoder().decode(result.artifact.bytes);
}

const SCENARIO = `---
azemark: 2
title: Report
${"citation-style: STYLE"}
author: AzeForge Proto
---

See @later-figure for the trend and [@knuth-1984, page 23] for the source.[^note]

:::: figure
id: later-figure
number: true
caption: Trend over time
----
A later figure.
::::

:::: bibliography
----
- key: knuth-1984
  type: book
  title: The TeXbook
  authors:
    - name: Donald E. Knuth
      family: Knuth
  year: 1984
::::

[^note]: A footnote body.
`;

test("a forward reference resolves to the final number in every Artifact format", async () => {
  const html = await renderedBody(SCENARIO.replace("STYLE", "numeric"));
  assert.match(html, /href="#later-figure"[^>]*>Figure 1</);
  assert.match(html, /<span class="aze-number">Figure 1<\/span> Trend over time/);
  for (const format of ["svg", "png", "pdf"]) {
    const result = await render(SCENARIO.replace("STYLE", "numeric"), { format });
    assert.deepEqual(result.diagnostics, [], format);
    assert.ok(result.artifact, format);
  }
});

test("a page-specific citation renders under both styles", async () => {
  const numeric = await renderedBody(SCENARIO.replace("STYLE", "numeric"));
  assert.match(numeric, /aze-citation-group">\[<a class="aze-reference" href="#knuth-1984">1, p\. 23<\/a>\]/);
  assert.match(numeric, /<li id="knuth-1984"/);

  const authorYear = await renderedBody(SCENARIO.replace("STYLE", "author-year"));
  assert.match(
    authorYear,
    /aze-citation-group">\(<a class="aze-reference" href="#knuth-1984">Knuth 1984, page 23<\/a>\)/,
  );
});

test("footnote markers render as endnotes with one backlink per marker", async () => {
  const html = await renderedBody(SCENARIO.replace("STYLE", "numeric"));
  assert.match(html, /<sup id="fnref-note-1" class="aze-footnote-ref"><a href="#fn-note"/);
  assert.match(html, /<section class="aze-endnotes"[\s\S]*id="fn-note"/);
  assert.match(html, /href="#fnref-note-1"/);
});

test("duplicate identifiers and unresolved targets each report a ranged error", async () => {
  const duplicate = await render(
    `---
azemark: 2
---

# One

:::: figure
id: shared
----
x
::::

:::: figure
id: shared
----
y
::::
`,
  );
  const duplicateDiagnostics = duplicate.diagnostics.filter(
    ({ code }) => code === "azeforge.reference#duplicate-id",
  );
  assert.equal(duplicateDiagnostics.length, 1);
  assert.equal(duplicateDiagnostics[0]?.relatedLocations.length, 2);
  assert.equal(duplicate.document, undefined);

  const unresolved = await render(
    `---
azemark: 2
---

See @nowhere and [@elsewhere, page 3].

A missing footnote marker.[^gone]
`,
  );
  const unresolvedCodes = unresolved.diagnostics.map(({ code }) => code);
  assert.ok(unresolvedCodes.includes("azeforge.reference#unresolved-reference"));
  assert.ok(unresolvedCodes.includes("azeforge.citation#missing-bibliography"));
  assert.ok(unresolvedCodes.includes("azeforge.footnote#missing-definition"));
  assert.equal(unresolved.document, undefined);
});

test("a locator on a non-citation target is refused", async () => {
  const result = await render(
    `---
azemark: 2
---

[@figure-one, page 4]

:::: figure
id: figure-one
----
x
::::
`,
  );
  assert.ok(
    result.diagnostics.some(
      ({ code }) => code === "azeforge.citation#locator-on-reference",
    ),
  );
});

test("the derived numbering projection never enters contentHash", async () => {
  const { documentContentHash } = await import("../dist/hash.js");
  const numeric = await render(SCENARIO.replace("STYLE", "numeric"));
  const authorYear = await render(SCENARIO.replace("STYLE", "author-year"));
  assert.ok(numeric.document?.composition);
  assert.ok(numeric.document.blocks.some((block) => block.numberLabel !== undefined));

  // Stripping every derived field leaves the identity untouched.
  const stripped = {
    ...numeric.document,
    composition: undefined,
    blocks: numeric.document.blocks.map(({ numberLabel, ...block }) => block),
  };
  assert.equal(
    documentContentHash(stripped),
    documentContentHash(numeric.document),
  );

  // The citation style is an authored document setting, so it is identity.
  assert.notEqual(numeric.contentHash, authorYear.contentHash);
});

test("the documented composition forms compile and resolve as authored", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(
    new URL("../docs/language/11-composition-forms.aze.md", import.meta.url),
    "utf8",
  );
  const html = await renderedBody(source);

  // Forward references resolve to the numbers the projection assigned.
  for (const [id, label] of [
    ["trend-figure", "Figure 1"],
    ["wrapped-diagram", "Figure 2"],
  ]) {
    assert.match(html, new RegExp(`<span class="aze-number">${label}</span>`), id);
  }

  // The wrapped Mermaid diagram keeps its own escape-hatch figure.
  assert.match(html, /<figure class="aze-mermaid"/);

  // A page-specific citation renders its locator, and the rendered list sorts
  // the cited entry last.
  assert.match(html, /href="#knuth-1984">1, p\. 23</);
  assert.match(html, /<section class="aze-bibliography"[\s\S]*<li id="knuth-1984"/);
  assert.match(html, /<section class="aze-endnotes"[\s\S]*id="fn-method"/);
});

test("the works-cited list renders under the document's citation style", async () => {
  const authorYear = await renderedBody(SCENARIO.replace("STYLE", "author-year"));
  assert.match(
    authorYear,
    /<section class="aze-bibliography"><ul class="aze-works-cited"><li id="knuth-1984"><span class="aze-citation-label">Knuth 1984<\/span>/,
  );

  const numeric = await renderedBody(SCENARIO.replace("STYLE", "numeric"));
  assert.match(
    numeric,
    /<section class="aze-bibliography"><ol class="aze-works-cited"><li id="knuth-1984"><span class="aze-citation-label">1<\/span>/,
  );
});

test("a footnote marker in a caption is refused", async () => {
  const result = await render(
    `---
azemark: 2
---

:::: figure
id: captioned
caption: Trend [^note]
----
Body.
::::

[^note]: A note.
`,
  );
  assert.ok(
    result.diagnostics.some(
      ({ code }) => code === "azeforge.footnote#marker-in-caption",
    ),
  );
  assert.equal(result.document, undefined);
});
