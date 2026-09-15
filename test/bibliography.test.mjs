import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_BIBLIOGRAPHY_ENTRIES,
  bibliographyCitationLabels,
  parseBibliographyBody,
  parseBibliographyHeader,
  renderBibliographyFragment,
} from "../dist/bibliography.js";

const BLOCK_RANGE = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 40, offset: 40 },
};

const START_LINE = 10;

/** Real `SourceLine` values, so record ranges prove the authored line coverage. */
function toLines(text, startLine = START_LINE) {
  const rows = text.split("\n");
  while (rows.length > 0 && rows[rows.length - 1] === "") rows.pop();
  let offset = 0;
  return rows.map((row, index) => {
    const startOffset = offset;
    const endOffset = startOffset + Buffer.byteLength(row, "utf8");
    offset = endOffset + 1;
    return {
      number: startLine + index,
      text: row,
      startIndex: 0,
      endIndex: row.length,
      startOffset,
      endOffset,
    };
  });
}

function parse(body) {
  return parseBibliographyBody({
    bodyLines: toLines(body),
    blockRange: BLOCK_RANGE,
    sourceName: "bib.aze.md",
  });
}

function lineOf(body, line, occurrence = 0) {
  const rows = body.split("\n");
  let seen = 0;
  for (let index = 0; index < rows.length; index += 1) {
    if (rows[index].trim() !== line.trim()) continue;
    if (seen === occurrence) return START_LINE + index;
    seen += 1;
  }
  assert.fail(`no line "${line}" at occurrence ${occurrence}`);
}

function lastLineOf(body) {
  const rows = body.split("\n");
  while (rows.length > 0 && rows[rows.length - 1] === "") rows.pop();
  return START_LINE + rows.length - 1;
}

function codes(result) {
  return result.diagnostics.map((diagnostic) => diagnostic.code);
}

function assertCode(result, code, data) {
  const matches = result.diagnostics.filter((diagnostic) =>
    diagnostic.code.endsWith(`#${code}`),
  );
  assert.equal(
    matches.length,
    1,
    `expected one ${code}, saw [${codes(result).join(", ")}]`,
  );
  if (data !== undefined) assert.deepEqual(matches[0].data, data);
  return matches[0];
}

function bibliographyBlock(entries, worksCited) {
  return {
    kind: "bibliography",
    entries,
    ...(worksCited === undefined ? {} : { worksCited }),
    range: BLOCK_RANGE,
    pluginVersion: "1.0.0",
  };
}

const CONTEXT = { sourceName: "bib.aze.md", renderBlocks: () => "" };

const CLEAN_BODY = `- key: knuth-1984
  type: book
  title: The TeXbook
  authors:
    - name: Donald E. Knuth
      family: Knuth
  year: 1984
  venue: Computers & Typesetting
  publisher: Addison-Wesley
  edition: third
  pages: 1-483
  url: https://example.com/texbook
  doi: 10.1000/texbook
  note: Volume A of the series
- key: lamport-1994
  type: article
  title: LaTeX: A Document Preparation System
  authors:
    - name: Leslie Lamport
  year: unspecified
  publisher: Addison-Wesley
`;

function cleanEntries() {
  const result = parse(CLEAN_BODY);
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.entries);
  return result.entries;
}

test("a clean bibliography parses every closed field of every record", () => {
  const result = parse(CLEAN_BODY);
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.entries.length, 2);

  const [knuth, lamport] = result.entries;
  assert.equal(knuth.key, "knuth-1984");
  assert.equal(knuth.entryType, "book");
  assert.equal(knuth.title, "The TeXbook");
  assert.deepEqual(knuth.authors, [
    { name: "Donald E. Knuth", family: "Knuth" },
  ]);
  assert.equal(knuth.year, "1984");
  assert.equal(knuth.venue, "Computers & Typesetting");
  assert.equal(knuth.publisher, "Addison-Wesley");
  assert.equal(knuth.edition, "third");
  assert.equal(knuth.pages, "1-483");
  assert.equal(knuth.url, "https://example.com/texbook");
  assert.equal(knuth.doi, "10.1000/texbook");
  assert.equal(knuth.note, "Volume A of the series");

  // Both records keep their authored shape; a bare `name:` carries no family.
  assert.deepEqual(lamport.authors, [{ name: "Leslie Lamport" }]);
  assert.equal(lamport.year, "unspecified");
  assert.equal(lamport.venue, undefined);

  // A record's range covers exactly its authored lines.
  const rows = CLEAN_BODY.split("\n");
  const firstStart = rows.findIndex((row) => row.startsWith("- key: knuth-1984"));
  const secondStart = rows.findIndex((row) => row.startsWith("- key: lamport-1994"));
  assert.equal(knuth.range.start.line, START_LINE + firstStart);
  assert.equal(knuth.range.end.line, START_LINE + secondStart - 1);
  assert.equal(lamport.range.start.line, START_LINE + secondStart);
  assert.equal(lamport.range.end.line, lastLineOf(CLEAN_BODY));
});

test("an unknown citation field errors on its own line", () => {
  const body = CLEAN_BODY.replace("  edition: third", "  editor: Someone");
  const result = parse(body);
  assert.deepEqual(codes(result), ["azeforge.citation#unknown-field"]);
  const diagnostic = result.diagnostics[0];
  assert.deepEqual(diagnostic.data, { field: "editor" });
  assert.equal(diagnostic.severity, "error");
  assert.equal(diagnostic.location.range.start.line, lineOf(body, "editor: Someone"));
  assert.equal(result.entries, undefined);
});

test("a duplicate field, including key:, errors with the first site related", () => {
  const body = CLEAN_BODY.replace(
    "  title: The TeXbook",
    "  title: The TeXbook\n  key: knuth-1984",
  );
  const result = parse(body);
  assert.equal(assertCode(result, "duplicate-field").data.field, "key");
  const diagnostic = result.diagnostics.find(
    (entry) => entry.code.endsWith("#duplicate-field"),
  );
  assert.equal(diagnostic.relatedLocations.length, 1);
  assert.equal(diagnostic.location.range.start.line, lineOf(body, "key: knuth-1984"));
  assert.equal(
    diagnostic.relatedLocations[0].range.start.line,
    lineOf(body, "- key: knuth-1984"),
  );
  assert.equal(diagnostic.relatedLocations[0].source, "bib.aze.md");
});

test("two records declaring one key error with every site", () => {
  const body = CLEAN_BODY.replace("- key: lamport-1994", "- key: knuth-1984");
  const result = parse(body);
  const diagnostic = assertCode(result, "duplicate-key", { key: "knuth-1984" });
  assert.equal(
    diagnostic.location.range.start.line,
    lineOf(body, "- key: knuth-1984", 1),
  );
  assert.deepEqual(
    diagnostic.relatedLocations.map((related) => related.range.start.line),
    [lineOf(body, "- key: knuth-1984", 0)],
  );
  assert.equal(result.entries, undefined);
});

test("a missing required field errors at the record, not at a guess", () => {
  const result = parse(CLEAN_BODY.replace("  type: book\n", ""));
  assert.deepEqual(codes(result), ["azeforge.citation#missing-field"]);
  const diagnostic = result.diagnostics[0];
  assert.deepEqual(diagnostic.data, { field: "type" });
  assert.equal(diagnostic.location.range.start.line, lineOf(CLEAN_BODY, "- key: knuth-1984"));
  assert.equal(result.entries, undefined);
});

test("a citation key must be lowercase-kebab", () => {
  const result = parse(CLEAN_BODY.replace("- key: knuth-1984", "- key: Knuth_1984"));
  assert.equal(assertCode(result, "invalid-key").data.value, "Knuth_1984");
});

test("a year is an integer or the registered unspecified spelling", () => {
  const body = CLEAN_BODY.replace("  year: 1984", "  year: circa 1984");
  const result = parse(body);
  const diagnostic = assertCode(result, "invalid-year", {
    field: "year",
    value: "circa 1984",
  });
  assert.equal(diagnostic.location.range.start.line, lineOf(body, "year: circa 1984"));
});

test("an unsafe url is refused and publishes nothing", () => {
  const body = CLEAN_BODY.replace(
    "  url: https://example.com/texbook",
    "  url: javascript:alert(1)",
  );
  const result = parse(body);
  const diagnostic = assertCode(result, "unsafe-url", {
    field: "url",
    value: "javascript:alert(1)",
  });
  assert.equal(diagnostic.location.range.start.line, lineOf(body, "url: javascript:alert(1)"));
  assert.equal(result.entries, undefined);
});

test("a malformed collection shape or an empty record errors", () => {
  const scalarBody = CLEAN_BODY.replace(
    "  authors:\n    - name: Donald E. Knuth\n      family: Knuth",
    "  authors: Donald E. Knuth",
  );
  const scalar = parse(scalarBody);
  assert.equal(
    assertCode(scalar, "invalid-entry").location.range.start.line,
    lineOf(scalarBody, "authors: Donald E. Knuth"),
  );

  const empty = parse("- key: knuth-1984\n  type: book\n  title: T\n-\n");
  assert.equal(
    assertCode(empty, "invalid-entry").message,
    "A citation record requires at least a `key:` field.",
  );

  const emptyCollection = parse(
    CLEAN_BODY.replace(
      "  authors:\n    - name: Donald E. Knuth\n      family: Knuth\n",
      "  authors:\n",
    ),
  );
  assert.ok(
    codes(emptyCollection).includes("azeforge.citation#invalid-entry"),
    `expected an invalid-entry, saw [${codes(emptyCollection).join(", ")}]`,
  );
});

test("a multiline marker is refused rather than guessed", () => {
  const result = parse(CLEAN_BODY.replace("  note: Volume A of the series", "  note: |"));
  const diagnostic = assertCode(result, "invalid-text", { field: "note" });
  assert.match(diagnostic.message, /single-line/);
});

test("the entry ceiling is fail-closed at 512 and silent below it", () => {
  const generated = (count) =>
    Array.from(
      { length: count },
      (_, index) => `- key: ref-${index}\n  type: web\n  title: Title ${index}`,
    ).join("\n");

  const atLimit = parse(generated(MAX_BIBLIOGRAPHY_ENTRIES));
  assert.deepEqual(atLimit.diagnostics, []);
  assert.equal(atLimit.entries.length, MAX_BIBLIOGRAPHY_ENTRIES);

  const exceeded = parse(generated(MAX_BIBLIOGRAPHY_ENTRIES + 1));
  assert.deepEqual(codes(exceeded), ["azeforge.citation#limit-exceeded"]);
  assert.deepEqual(exceeded.diagnostics[0].data, {
    subject: "bibliography-entries",
    limit: MAX_BIBLIOGRAPHY_ENTRIES,
    count: MAX_BIBLIOGRAPHY_ENTRIES + 1,
  });
  assert.equal(
    exceeded.diagnostics[0].location.range.start.line,
    START_LINE + MAX_BIBLIOGRAPHY_ENTRIES * 3,
  );
  assert.equal(exceeded.entries, undefined);
});

test("an empty bibliography is legal and silent", () => {
  for (const body of ["", "\n\n", "// no works cited yet\n  // indented comment\n"]) {
    const result = parse(body);
    assert.deepEqual(result.diagnostics, []);
    assert.deepEqual(result.entries, []);
  }
});

test("records read from the body's own structural baseline", () => {
  const indented = CLEAN_BODY.split("\n")
    .map((row) => (row === "" ? row : `  ${row}`))
    .join("\n");
  const result = parse(indented);
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(
    result.entries.map((entry) => entry.key),
    ["knuth-1984", "lamport-1994"],
  );
  assert.deepEqual(result.entries[0].authors, [
    { name: "Donald E. Knuth", family: "Knuth" },
  ]);

  const tabbed = parse("- key: knuth-1984\n  type: web\n  title: T\n\tstray line\n");
  assert.deepEqual(codes(tabbed), ["azeforge.citation#invalid-entry"]);
  assert.match(tabbed.diagnostics[0].message, /spaces only/);
  assert.equal(tabbed.entries, undefined);
});

test("double-quoted values decode the shared escape form", () => {
  const body = [
    "- key: knuth-1984",
    '  type: book',
    '  title: "The TeXbook: \\"a \\\\ b\\""',
    "  authors:",
    '    - name: "Knuth, Donald E."',
    "  year: 1984",
  ].join("\n");
  const result = parse(body);
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.entries[0].title, 'The TeXbook: "a \\ b"');
  assert.deepEqual(result.entries[0].authors, [{ name: "Knuth, Donald E." }]);

  const html = renderBibliographyFragment(
    bibliographyBlock(result.entries),
    CONTEXT,
  );
  assert.match(html, /The TeXbook: &quot;a \\ b&quot;/);
});

test("the header resolves the shared fields and refuses an unknown key", () => {
  const entries = [
    { key: "id", value: "works-cited", range: BLOCK_RANGE },
    { key: "number", value: "true", range: BLOCK_RANGE },
    { key: "caption", value: "Works cited", range: BLOCK_RANGE },
  ];
  const parseCaption = (text) => [{ kind: "text", value: text }];
  const header = parseBibliographyHeader(
    entries,
    BLOCK_RANGE,
    "bib.aze.md",
    parseCaption,
  );
  assert.deepEqual(header.diagnostics, []);
  assert.equal(header.id, "works-cited");
  assert.equal(header.number, true);
  assert.deepEqual(header.caption, [{ kind: "text", value: "Works cited" }]);

  const unknown = parseBibliographyHeader(
    [...entries, { key: "style", value: "numeric", range: BLOCK_RANGE }],
    BLOCK_RANGE,
    "bib.aze.md",
    parseCaption,
  );
  assert.deepEqual(
    unknown.diagnostics.map((diagnostic) => diagnostic.code),
    ["azeforge.bibliography#unknown-header"],
  );
});

test("the fragment anchors every entry by key and links safe targets", () => {
  const html = renderBibliographyFragment(bibliographyBlock(cleanEntries()), CONTEXT);
  assert.match(html, /^<section class="aze-bibliography"><ol class="aze-works-cited">/);
  assert.match(html, /<li id="knuth-1984"><span class="aze-citation-label">1<\/span>/);
  assert.match(html, /<li id="lamport-1994"><span class="aze-citation-label">2<\/span>/);
  assert.match(html, /Donald E\. Knuth \(1984\)/);
  assert.match(html, /Leslie Lamport \(n\.d\.\)/);
  assert.match(html, /<span class="aze-citation-title">The TeXbook<\/span>/);
  assert.match(html, /Addison-Wesley/);
  assert.match(html, /<a href="https:\/\/example\.com\/texbook">https:\/\/example\.com\/texbook<\/a>/);
  assert.match(html, /doi: <a href="https:\/\/doi\.org\/10\.1000\/texbook">10\.1000\/texbook<\/a>/);
  assert.match(html, /<span class="aze-citation-note">Volume A of the series<\/span>/);
});

test("worksCited sets the rendered order and the numeric labels", () => {
  const entries = cleanEntries();
  const reversed = [...entries].reverse();
  const html = renderBibliographyFragment(
    bibliographyBlock(entries, reversed),
    CONTEXT,
  );
  assert.ok(html.indexOf('id="lamport-1994"') < html.indexOf('id="knuth-1984"'));
  assert.match(html, /<li id="lamport-1994"><span class="aze-citation-label">1<\/span>/);
  assert.match(html, /<li id="knuth-1984"><span class="aze-citation-label">2<\/span>/);
});

test("author-year labels disambiguate colliding labels in list order", () => {
  const entries = [
    {
      key: "knuth-1984a",
      entryType: "book",
      title: "The TeXbook",
      authors: [{ name: "Donald E. Knuth", family: "Knuth" }],
      year: "1984",
      range: BLOCK_RANGE,
    },
    {
      key: "knuth-1984b",
      entryType: "article",
      title: "Literate Programming",
      authors: [{ name: "Donald E. Knuth", family: "Knuth" }],
      year: "1984",
      range: BLOCK_RANGE,
    },
    {
      key: "knuth-1994",
      entryType: "article",
      title: "The Stanford GraphBase",
      authors: [{ name: "Donald E. Knuth", family: "Knuth" }],
      year: "1994",
      range: BLOCK_RANGE,
    },
  ];
  assert.deepEqual(bibliographyCitationLabels(entries, "author-year"), [
    "Knuth 1984a",
    "Knuth 1984b",
    "Knuth 1994",
  ]);
  assert.deepEqual(bibliographyCitationLabels(entries, "numeric"), ["1", "2", "3"]);

  // Suffix groups follow the rendered label, so an explicit `unspecified` and
  // an omitted year — both `n.d.` — share one group and disambiguate a/b,
  // exactly as the composition layer derives its in-text labels.
  const parity = [
    { ...entries[0], key: "one", year: "unspecified" },
    { ...entries[0], key: "two" },
  ];
  delete parity[1].year;
  assert.deepEqual(bibliographyCitationLabels(parity, "author-year"), [
    "Knuth n.d.a",
    "Knuth n.d.b",
  ]);

  const html = renderBibliographyFragment(
    bibliographyBlock(entries),
    CONTEXT,
    "author-year",
  );
  assert.match(html, /<ul class="aze-works-cited">/);
  assert.match(html, /<span class="aze-citation-label">Knuth 1984a<\/span>/);
  assert.match(html, /<span class="aze-citation-label">Knuth 1994<\/span>/);
});

test("an unsafe url is never rendered as a link", () => {
  const html = renderBibliographyFragment(
    bibliographyBlock([
      {
        key: "hostile",
        entryType: "web",
        title: "Hostile",
        authors: [],
        url: "javascript:alert(1)",
        doi: "javascript:alert(2)",
        range: BLOCK_RANGE,
      },
    ]),
    CONTEXT,
  );
  assert.doesNotMatch(html, /href="javascript/);
  assert.match(html, /javascript:alert\(1\)/);
  assert.match(html, /doi: javascript:alert\(2\)/);
  assert.match(html, /<li id="hostile">/);
});

test("a doi resolves through doi.org and a scheme-bearing doi stays literal", () => {
  const html = renderBibliographyFragment(
    bibliographyBlock([
      {
        key: "knuth-1984",
        entryType: "book",
        title: "The TeXbook",
        authors: [{ name: "Donald E. Knuth", family: "Knuth" }],
        year: "1984",
        doi: "https://doi.org/10.1000/texbook",
        range: BLOCK_RANGE,
      },
      {
        key: "lamport-1994",
        entryType: "article",
        title: "LaTeX",
        authors: [{ name: "Leslie Lamport", family: "Lamport" }],
        doi: "mailto:lamport@example.com",
        range: BLOCK_RANGE,
      },
    ]),
    CONTEXT,
  );
  assert.match(html, /doi: <a href="https:\/\/doi\.org\/10\.1000\/texbook">/);
  assert.match(html, /doi: mailto:lamport@example\.com/);
});

test("an authored caption renders with the list and never as markup", () => {
  const withCaption = {
    ...bibliographyBlock(cleanEntries()),
    caption: [{ kind: "text", value: "Works cited <not markup>" }],
  };
  const html = renderBibliographyFragment(withCaption, CONTEXT);
  assert.match(
    html,
    /^<section class="aze-bibliography"><p class="aze-bibliography-caption">Works cited &lt;not markup&gt;<\/p><ol class="aze-works-cited">/,
  );
  assert.equal(
    renderBibliographyFragment(bibliographyBlock([]), CONTEXT),
    '<section class="aze-bibliography"><ol class="aze-works-cited"></ol></section>',
  );
});
