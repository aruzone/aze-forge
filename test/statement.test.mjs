import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  MAX_STATEMENT_MARKDOWN_CHARS,
  STATEMENT_KINDS,
  parseStatementBody,
  parseStatementHeader,
  renderStatementFragment,
} from "../dist/statement.js";
import { sourceLines } from "../dist/source-map.js";

const BLOCK_RANGE = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 40, column: 1, offset: 4000 },
};

/** One header entry with its own range, so location assertions mean something. */
function headerEntry(key, value, index) {
  return {
    key,
    value,
    range: {
      start: { line: 2 + index, column: 1, offset: index * 100 },
      end: {
        line: 2 + index,
        column: 1 + value.length,
        offset: index * 100 + value.length,
      },
    },
  };
}

function header(pairs) {
  return parseStatementHeader(
    pairs.map(([key, value], index) => headerEntry(key, value, index)),
    BLOCK_RANGE,
    "statement.aze.md",
    (text) => [{ kind: "text", value: text }],
  );
}

/** The authored directive body, exactly as the envelope hands it over. */
function bodyLines(text) {
  const lines = [...sourceLines(text)];
  while (lines.length > 0 && lines[lines.length - 1].text === "") lines.pop();
  return lines;
}

function codes(result, severity = "error") {
  return result.diagnostics
    .filter((diagnostic) => diagnostic.severity === severity)
    .map((diagnostic) => diagnostic.code);
}

/** A stand-in for the compiler's nested-block parser: records and echoes. */
function recordingParseBlocks() {
  const calls = [];
  const parseBlocks = (lines) => {
    calls.push(lines);
    const value = lines
      .map((line) => line.text.trim())
      .filter((text) => text !== "")
      .join(" ");
    return [
      { kind: "paragraph", children: [{ kind: "text", value }], range: BLOCK_RANGE },
    ];
  };
  return { calls, parseBlocks };
}

function renderContext() {
  return {
    sourceName: "statement.aze.md",
    renderBlocks: (blocks) =>
      blocks
        .map(
          (block) =>
            `<p>${block.children.map((node) => node.value).join("")}</p>`,
        )
        .join(""),
  };
}

function parseBody(authored, { kind = "theorem", parseBlocks = () => [] } = {}) {
  return parseStatementBody({
    header: header([["kind", kind]]),
    bodyLines: bodyLines(authored),
    blockRange: BLOCK_RANGE,
    sourceName: "statement.aze.md",
    parseBlocks,
  });
}

function authoredStatement() {
  return parseStatementBody({
    header: header([
      ["id", "triangle-inequality"],
      ["number", "true"],
      ["kind", "theorem"],
      ["caption", "Triangle inequality in the plane"],
    ]),
    bodyLines: bodyLines(TRIANGLE_BODY),
    blockRange: BLOCK_RANGE,
    sourceName: "statement.aze.md",
    parseBlocks: recordingParseBlocks().parseBlocks,
  });
}

function statementBlock(parsed, overrides = {}) {
  const body = parsed.body;
  return {
    kind: "statement",
    statementKind: body.statementKind,
    text: body.text,
    ...(body.proof === undefined ? {} : { proof: body.proof }),
    range: BLOCK_RANGE,
    id: "triangle-inequality",
    number: true,
    caption: [{ kind: "text", value: "Triangle inequality in the plane" }],
    numberLabel: "Theorem 3",
    pluginVersion: "1.0.0",
    ...overrides,
  };
}

/** docs/language/11-structured-content.aze.md, verbatim between the fences. */
const TRIANGLE_BODY = `text: |
  For any three points \`A\`, \`B\`, \`C\` in the Euclidean plane, the sum of
  the lengths of two sides of a triangle is at least the length of the
  third side.
proof: |
  Place the points in a coordinate system. Let \`d(X, Y)\` denote the
  Euclidean distance between points \`X\` and \`Y\`. Then

  :: equation
  ----
  abs(A - C) <= abs(A - B) + abs(B - C)
  ::

  by expanding each distance via the Pythagorean identity and comparing
  the squared lengths.
`;

/* ------------------------------------------------------------------ *
 * The published statement
 * ------------------------------------------------------------------ */

test("statement: the report theorem renders its label, caption and QED-closed proof", () => {
  const parsed = authoredStatement();
  assert.deepEqual(parsed.diagnostics, []);
  assert.equal(parsed.body?.statementKind, "theorem");
  assert.equal(parsed.body?.proof?.length, 1);

  const html = renderStatementFragment(statementBlock(parsed), renderContext());
  assert.match(
    html,
    /^<figure class="aze-statement" data-statement-id="triangle-inequality" data-statement-number="true" data-statement-kind="theorem">/,
  );
  assert.match(
    html,
    /<figcaption><span class="aze-number">Theorem 3<\/span> Triangle inequality in the plane<\/figcaption>/,
  );
  assert.doesNotMatch(html, /aze-statement-kind">Theorem/, "the label already spells the kind");
  assert.match(html, /For any three points `A`, `B`, `C` in the Euclidean plane/);
  assert.match(html, /<div class="aze-statement-proof"><p>Place the points/);
  assert.match(html, /<span class="aze-statement-qed">&#9633;<\/span><\/div><\/figure>$/);
  assert.ok(
    html.indexOf("aze-statement-proof") < html.indexOf("aze-statement-qed"),
    "the QED mark closes the proof",
  );
  assert.doesNotMatch(html, /\sid="/);
});

test("statement: an unnumbered caption stands on its kind word, a barer one on nothing", () => {
  const parsed = authoredStatement();
  const unnumbered = renderStatementFragment(
    statementBlock(parsed, { numberLabel: undefined, statementKind: "lemma" }),
    renderContext(),
  );
  assert.match(
    unnumbered,
    /<figcaption><strong><span class="aze-statement-kind">Lemma<\/span><\/strong> Triangle inequality in the plane<\/figcaption>/,
  );
  assert.doesNotMatch(unnumbered, /aze-number/);

  const bare = renderStatementFragment(
    statementBlock(parsed, {
      id: undefined,
      number: undefined,
      caption: undefined,
      numberLabel: undefined,
    }),
    renderContext(),
  );
  assert.match(bare, /^<figure class="aze-statement" data-statement-kind="theorem">/);
  assert.doesNotMatch(bare, /<figcaption>/);
  assert.doesNotMatch(bare, /data-statement-id|data-statement-number/);
  assert.doesNotMatch(bare, /aze-number/);
});

/* ------------------------------------------------------------------ *
 * Header contract
 * ------------------------------------------------------------------ */

test("statement: the kind enum is closed and the remedy enumerates it", () => {
  const parsed = header([["id", "some-claim"], ["kind", "axiom"]]);
  assert.deepEqual(codes(parsed), ["azeforge.statement#unknown-kind"]);
  assert.equal(parsed.statementKind, undefined);
  const [diagnostic] = parsed.diagnostics;
  assert.equal(diagnostic.severity, "error");
  assert.deepEqual(diagnostic.data, { kind: "axiom" });
  assert.deepEqual(diagnostic.location, {
    source: "statement.aze.md",
    range: headerEntry("kind", "axiom", 1).range,
  });
  for (const kind of STATEMENT_KINDS) {
    assert.match(diagnostic.suggestion, new RegExp(`\\b${kind}\\b`));
  }

  const none = header([["id", "some-claim"]]);
  assert.deepEqual(codes(none), ["azeforge.statement#missing-field"]);
  assert.equal(none.statementKind, undefined);
});

/* ------------------------------------------------------------------ *
 * Body contract
 * ------------------------------------------------------------------ */

test("statement: text is required and the absent block publishes nothing", () => {
  const result = parseBody("proof: |\n  Square both sides of the inequality.\n");
  assert.deepEqual(codes(result), ["azeforge.statement#missing-text"]);
  assert.equal(result.body, undefined);
  assert.equal(result.diagnostics[0].data.field, "text");
  assert.match(result.diagnostics[0].suggestion, /text: \|/);
});

test("statement: a present but empty proof errors while an absent proof is legal", () => {
  const recorded = recordingParseBlocks();
  const fenced = parseStatementBody({
    header: header([["kind", "lemma"]]),
    bodyLines: bodyLines("text: |\n  Squaring preserves order.\nproof: |\n"),
    blockRange: BLOCK_RANGE,
    sourceName: "statement.aze.md",
    parseBlocks: recorded.parseBlocks,
  });
  assert.deepEqual(codes(fenced), ["azeforge.statement#empty-proof"]);
  assert.equal(fenced.body, undefined);
  assert.equal(fenced.diagnostics[0].data.field, "proof");

  const bare = parseBody("text: |\n  Squaring preserves order.\nproof:\n", {
    kind: "lemma",
  });
  assert.deepEqual(codes(bare), ["azeforge.statement#empty-proof"]);

  const none = parseBody("text: |\n  Squaring preserves order.\n", {
    kind: "lemma",
    parseBlocks: recorded.parseBlocks,
  });
  assert.deepEqual(none.diagnostics, []);
  assert.equal(none.body?.proof, undefined);
  assert.equal(recorded.calls.length, 1);
});

test("statement: the proof dedents one structural level and keeps nested directives", () => {
  const recorded = recordingParseBlocks();
  const parsed = parseStatementBody({
    header: header([
      ["id", "triangle-inequality"],
      ["number", "true"],
      ["kind", "theorem"],
      ["caption", "Triangle inequality in the plane"],
    ]),
    bodyLines: bodyLines(TRIANGLE_BODY),
    blockRange: BLOCK_RANGE,
    sourceName: "statement.aze.md",
    parseBlocks: recorded.parseBlocks,
  });
  assert.deepEqual(parsed.diagnostics, []);
  assert.equal(recorded.calls.length, 2);

  const [textCall, proofCall] = recorded.calls;
  assert.equal(textCall.length, 3);
  assert.ok(textCall.every((line) => !line.text.startsWith(" ")));

  const opener = proofCall.find((line) => line.text === ":: equation");
  assert.ok(opener !== undefined, "the nested opener survives at the field baseline");
  const openerIndex = proofCall.indexOf(opener);
  assert.equal(proofCall[openerIndex - 1].text, "");
  assert.equal(proofCall[openerIndex + 1].text, "----");
  assert.equal(
    proofCall[openerIndex + 2].text,
    "abs(A - C) <= abs(A - B) + abs(B - C)",
  );
  assert.equal(proofCall.at(-1).text, "the squared lengths.");

  // Exactly the removed prefix shifts: character and byte positions stay true.
  const authored = bodyLines(TRIANGLE_BODY).find((line) =>
    line.text.includes("Place the points"),
  );
  assert.equal(proofCall[0].text, authored.text.slice(2));
  assert.equal(proofCall[0].startIndex, authored.startIndex + 2);
  assert.equal(proofCall[0].startOffset, authored.startOffset + 2);
  assert.equal(proofCall[0].endIndex, authored.endIndex);
  assert.equal(proofCall[0].endOffset, authored.endOffset);
  assert.equal(proofCall[0].number, authored.number);

  // Deeper indentation is content, never structure: it survives the dedent.
  const deep = parseBody(
    "text: |\n  A remark.\nproof: |\n  First:\n\n  - outer item\n    - inner item\n",
    { kind: "remark", parseBlocks: recorded.parseBlocks },
  );
  assert.deepEqual(deep.diagnostics, []);
  assert.deepEqual(
    recorded.calls[3].map((line) => line.text),
    ["First:", "", "- outer item", "  - inner item"],
  );

  const html = renderStatementFragment(statementBlock(parsed), renderContext());
  assert.match(html, /:: equation/);
  assert.match(html, /abs\(A - C\) <= abs\(A - B\) \+ abs\(B - C\)/);
});

test("statement: each Markdown field stays inside its character ceiling", () => {
  const atLimit = "x".repeat(MAX_STATEMENT_MARKDOWN_CHARS);
  const within = parseBody(`text: |\n  ${atLimit}\n`);
  assert.deepEqual(within.diagnostics, []);
  assert.notEqual(within.body, undefined);

  const over = parseBody(`text: |\n  ${atLimit}x\n`);
  assert.deepEqual(codes(over), ["azeforge.statement#limit-exceeded"]);
  assert.equal(over.body, undefined);
  assert.deepEqual(over.diagnostics[0].data, {
    subject: "text",
    count: MAX_STATEMENT_MARKDOWN_CHARS + 1,
    limit: MAX_STATEMENT_MARKDOWN_CHARS,
  });
});

test("statement: the body admits only text and proof, each once and fenced", () => {
  const unknown = parseBody("text: |\n  A statement.\nreason: |\n  Because.\n");
  assert.deepEqual(codes(unknown), ["azeforge.statement#unknown-field"]);
  assert.equal(unknown.diagnostics[0].data.field, "reason");
  assert.match(unknown.diagnostics[0].suggestion, /text or proof/);

  const duplicated = parseBody("text: |\n  A statement.\ntext: |\n  Another.\n");
  assert.deepEqual(codes(duplicated), ["azeforge.statement#duplicate-field"]);
  assert.equal(duplicated.diagnostics[0].relatedLocations.length, 1);
  assert.match(
    duplicated.diagnostics[0].relatedLocations[0].message,
    /first declared here/,
  );

  const inline = parseBody("text: A statement.\n");
  assert.deepEqual(codes(inline), ["azeforge.statement#invalid-field"]);
  assert.equal(inline.body, undefined);
});

/* ------------------------------------------------------------------ *
 * The authored source in the composition report
 * ------------------------------------------------------------------ */

/** The statement envelope's body lines, with their authored positions. */
function reportStatementBody(source) {
  const lines = [...sourceLines(source)];
  const open = lines.findIndex(
    (line, index) =>
      line.text.trim() === ":::: statement" &&
      lines[index + 1]?.text.trim() === "id: triangle-inequality",
  );
  assert.notEqual(open, -1, "the report authors the triangle-inequality statement");
  const close = lines.findIndex(
    (line, index) => index > open && line.text.trim() === "::::",
  );
  const separator = lines.findIndex(
    (line, index) =>
      index > open && index < close && /^ {0,3}-{4}[ \t]*$/.test(line.text),
  );
  assert.notEqual(separator, -1, "the statement separates its header");
  return { lines: lines.slice(separator + 1, close), first: lines[open], last: lines[close] };
}

test("statement: the composition report's theorem parses at its authored offsets", async () => {
  const source = await readFile(
    new URL("../docs/language/11-structured-content.aze.md", import.meta.url),
    "utf8",
  );
  const body = reportStatementBody(source);
  const recorded = recordingParseBlocks();
  const parsed = parseStatementBody({
    header: header([
      ["id", "triangle-inequality"],
      ["number", "true"],
      ["kind", "theorem"],
      ["caption", "Triangle inequality in the plane"],
    ]),
    bodyLines: body.lines,
    blockRange: {
      start: { line: body.first.number, column: 1, offset: body.first.startOffset },
      end: { line: body.last.number, column: 1, offset: body.last.endOffset },
    },
    sourceName: "11-structured-content.aze.md",
    parseBlocks: recorded.parseBlocks,
  });
  assert.deepEqual(parsed.diagnostics, []);
  assert.equal(parsed.body?.statementKind, "theorem");

  const textLines = recorded.calls[0].map((line) => line.text);
  assert.deepEqual(textLines, [
    "For any three points `A`, `B`, `C` in the Euclidean plane, the sum of",
    "the lengths of two sides of a triangle is at least the length of the",
    "third side.",
  ]);
  const proofLines = recorded.calls[1].map((line) => line.text);
  const nested = proofLines.indexOf(":: equation");
  assert.notEqual(nested, -1, "the nested equation survives the dedent");
  assert.deepEqual(proofLines.slice(nested, nested + 4), [
    ":: equation",
    "----",
    "abs(A - C) <= abs(A - B) + abs(B - C)",
    "::",
  ]);

  const authored = body.lines.find((line) =>
    line.text.includes("Place the points"),
  );
  assert.equal(recorded.calls[1][0].startIndex, authored.startIndex + 2);
  assert.equal(recorded.calls[1][0].startOffset, authored.startOffset + 2);

  const html = renderStatementFragment(statementBlock(parsed), renderContext());
  assert.match(
    html,
    /<figcaption><span class="aze-number">Theorem 3<\/span> Triangle inequality in the plane<\/figcaption>/,
  );
  assert.match(html, /<div class="aze-statement-proof">/);
  assert.match(html, /<span class="aze-statement-qed">&#9633;<\/span><\/div><\/figure>$/);
});
