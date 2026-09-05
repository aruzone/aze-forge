import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { createCompiler } from "../dist/index.js";

const VALID_SOURCE = `---
azemark: 1
title: Stable systems
author:
  - Ada Lovelace
---

# Overview

First line
continues.
`;

test("parse returns a serializable versioned Document with ordered Blocks and SourceRanges", () => {
  const compiler = createCompiler();
  const result = compiler.parse(VALID_SOURCE, { sourceName: "report.aze.md" });

  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.document.metadata, {
    authors: ["Ada Lovelace"],
    extensions: {},
    title: "Stable systems",
  });
  assert.equal(result.document.azemarkVersion, 1);
  assert.equal(result.document.schemaVersion, 1);
  assert.deepEqual(
    result.document.blocks.map(({ kind }) => kind),
    ["heading", "paragraph"],
  );
  assert.deepEqual(result.document.blocks[0], {
    kind: "heading",
    level: 1,
    children: [{ kind: "text", value: "Overview" }],
    range: {
      start: { line: 8, column: 1, offset: 67 },
      end: { line: 8, column: 11, offset: 77 },
    },
  });
  assert.deepEqual(result.document.blocks[1], {
    kind: "paragraph",
    children: [{ kind: "text", value: "First line continues." }],
    range: {
      start: { line: 10, column: 1, offset: 79 },
      end: { line: 11, column: 11, offset: 100 },
    },
  });
  assert.doesNotThrow(() => JSON.stringify(result.document));
  const validation = compiler.validate(result);
  assert.deepEqual(validation.diagnostics, []);
  assert.deepEqual(validation.document?.blocks, result.document.blocks);
});

test("compile produces stable semantic and byte identities", async () => {
  const compiler = createCompiler();
  const rewrappedSource = VALID_SOURCE.replace(
    "First line\ncontinues.",
    "First line continues.",
  );

  const first = await compiler.compile(VALID_SOURCE, {
    format: "html",
    sourceName: "first/report.aze.md",
  });
  const second = await compiler.compile(rewrappedSource, {
    format: "html",
    sourceName: "moved/report.aze.md",
  });

  assert.equal(Object.isFrozen(compiler), true);
  assert.deepEqual(first.diagnostics, []);
  assert.ok(first.document);
  assert.ok(first.contentHash);
  assert.ok(first.artifact);
  assert.equal(first.contentHash, second.contentHash);
  assert.equal(first.artifact.metadata.artifactHash, second.artifact?.metadata.artifactHash);
  assert.deepEqual(first.artifact.bytes, second.artifact?.bytes);
  assert.match(first.contentHash, /^sha256:[a-f0-9]{64}$/);
  assert.equal(
    first.artifact.metadata.artifactHash,
    `sha256:${createHash("sha256").update(first.artifact.bytes).digest("hex")}`,
  );
  assert.deepEqual(first.artifact.metadata, {
    format: "html",
    mimeType: "text/html; charset=utf-8",
    profile: "azeforge.html.self-contained/v1",
    byteLength: first.artifact.bytes.byteLength,
    contentHash: first.contentHash,
    assetManifestHash:
      "sha256:4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    rendererFingerprint: first.artifact.metadata.rendererFingerprint,
    artifactHash: first.artifact.metadata.artifactHash,
    theme: { id: "default", version: "1.0.0" },
    cssDimensions: {
      canvasWidthPx: 960,
      contentWidthPx: 800,
      paddingPx: 48,
    },
  });
  const html = new TextDecoder().decode(first.artifact.bytes);
  assert.match(html, /^<!doctype html>\n<html lang="und">/);
  assert.match(html, /<main><article><h1>Overview<\/h1><p>First line continues\.<\/p><\/article><\/main>/);
  assert.doesNotMatch(html, /<script\b/i);
  assert.match(html, /@font-face\{font-family:Inter;/);
  assert.match(html, /src:url\(data:font\/woff2;base64,/);
  assert.match(html, /font-weight:700/);
  assert.doesNotMatch(html, /ui-sans-serif|system-ui/);
});

test("raw HTML is isolated without discarding surrounding valid Blocks", async () => {
  const source = "\uFEFFPréface\r\n\r\n<div>\r\n\r\n# Après\r\n";
  const compiler = createCompiler();
  const parsed = compiler.parse(source, { sourceName: "unicode.aze.md" });

  assert.deepEqual(
    parsed.document.blocks.map(({ kind }) => kind),
    ["paragraph", "invalid", "heading"],
  );
  assert.deepEqual(parsed.diagnostics, [
    {
      code: "azeforge.security#raw-html-disabled",
      severity: "error",
      message: "Raw HTML is disabled in AzeMark Source.",
      data: {},
      location: {
        source: "unicode.aze.md",
        range: {
          start: { line: 3, column: 1, offset: 15 },
          end: { line: 3, column: 6, offset: 20 },
        },
      },
      relatedLocations: [],
    },
  ]);

  const compiled = await compiler.compile(source, {
    format: "html",
    sourceName: "unicode.aze.md",
  });
  assert.equal(compiled.document, undefined);
  assert.equal(compiled.artifact, undefined);
});

test("escaped and inline-code HTML literals remain valid Source text", async () => {
  const source = "Escaped \\<div>\n\n`<span>`\n";
  const result = await createCompiler().compile(source, { format: "html" });

  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.artifact);
  const html = new TextDecoder().decode(result.artifact.bytes);
  assert.match(html, /Escaped &lt;div&gt;/);
  assert.match(html, /<code>&lt;span&gt;<\/code>/);
});

test("Renderer preflight failures produce diagnostics without partial results", async () => {
  const result = await createCompiler().compile("# 😀\n", {
    format: "html",
    sourceName: "emoji.aze.md",
  });

  assert.equal(result.document, undefined);
  assert.equal(result.contentHash, undefined);
  assert.equal(result.artifact, undefined);
  assert.deepEqual(result.diagnostics, [
    {
      code: "azeforge.renderer#font-coverage",
      severity: "error",
      message: "The default Theme font does not contain U+1F600.",
      data: { codePoint: 0x1f600 },
      location: { source: "emoji.aze.md" },
      relatedLocations: [],
    },
  ]);
});

test("validation errors expose no validated Document, identity, or Artifact", async () => {
  const compiler = createCompiler();
  const invalidSource = `---
azemark: 2
---

Text
`;

  const validation = compiler.validate(
    compiler.parse(invalidSource, { sourceName: "future.aze.md" }),
  );
  const compilation = await compiler.compile(invalidSource, {
    format: "html",
    sourceName: "future.aze.md",
  });

  assert.equal(validation.document, undefined);
  assert.ok(validation.diagnostics.some(({ severity }) => severity === "error"));
  assert.equal(compilation.document, undefined);
  assert.equal(compilation.contentHash, undefined);
  assert.equal(compilation.artifact, undefined);
});

test("parser handles BOM, ATX variants, Setext headings, and Unicode whitespace", () => {
  const result = createCompiler().parse(
    "\uFEFF#\n\n  # C# ##   \n\nkeeps\u00a0space\n\nSetext title\n---\n",
  );

  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(
    result.document.blocks.map((block) => ({
      kind: block.kind,
      level: block.kind === "heading" ? block.level : undefined,
      text:
        block.kind === "invalid"
          ? block.raw
          : block.children.map((child) => child.value).join(""),
    })),
    [
      { kind: "heading", level: 1, text: "" },
      { kind: "heading", level: 1, text: "C#" },
      { kind: "paragraph", level: undefined, text: "keeps\u00a0space" },
      { kind: "heading", level: 2, text: "Setext title" },
    ],
  );
});

test("unknown directives expose stable alternatives through an InvalidBlock", async () => {
  const source = `---
azemark: 1
---

Before

:::: mystery
x = 1
::::

After
`;
  const compiler = createCompiler();
  const parsed = compiler.parse(source, { sourceName: "unknown.aze.md" });
  const invalid = parsed.document.blocks[1];

  assert.deepEqual(parsed.document.blocks.map(({ kind }) => kind), [
    "paragraph",
    "invalid",
    "paragraph",
  ]);
  assert.equal(invalid?.kind, "invalid");
  assert.equal(invalid?.raw, ":::: mystery\nx = 1\n::::");
  assert.equal(invalid?.originalType, "mystery");
  assert.deepEqual(invalid?.diagnosticIndexes, [0]);
  assert.deepEqual(parsed.diagnostics[0]?.data, {
    type: "mystery",
    availableTypes: ["callout", "equation", "mermaid", "table"],
  });
  assert.equal(
    parsed.diagnostics[0]?.code,
    "azeforge.source#unknown-directive",
  );

  const compiled = await compiler.compile(source, { format: "html" });
  assert.equal(compiled.document, undefined);
  assert.equal(compiled.contentHash, undefined);
  assert.equal(compiled.artifact, undefined);
});

test("directive envelope IDs report invalid and duplicate references", () => {
  const source = `---
azemark: 1
---

:::: one
id: Bad

body
::::

:::: two
id: shared

body
::::

:::: three
id: shared

body
::::
`;
  const parsed = createCompiler().parse(source);

  assert.deepEqual(
    parsed.diagnostics.map(({ code }) => code),
    [
      "azeforge.source#unknown-directive",
      "azeforge.source#unknown-directive",
      "azeforge.source#unknown-directive",
      "azeforge.reference#invalid-id",
      "azeforge.reference#duplicate-id",
    ],
  );
  const duplicate = parsed.diagnostics[4];
  assert.deepEqual(duplicate?.data, { id: "shared" });
  assert.equal(duplicate?.relatedLocations.length, 1);
});

test("an unclosed directive recovers at the next independent region", () => {
  const source = "Before\n\n:::: mystery\nbroken\n\n# After\n\nStill valid\n";
  const parsed = createCompiler().parse(source, {
    sourceName: "recover.aze.md",
  });

  assert.deepEqual(
    parsed.document.blocks.map(({ kind }) => kind),
    ["paragraph", "invalid", "heading", "paragraph"],
  );
  assert.deepEqual(
    parsed.diagnostics.map(({ code }) => code),
    [
      "azeforge.source#version-required",
      "azeforge.source#unclosed-directive",
    ],
  );
  assert.deepEqual(parsed.document.blocks[1]?.diagnosticIndexes, [1]);
  assert.deepEqual(parsed.diagnostics[0]?.fix, {
    title: "Declare AzeMark version 1.",
    applicability: "safe",
    edits: [
      {
        range: {
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: 1, offset: 0 },
        },
        expectedText: "",
        replacementText: "---\nazemark: 1\n---\n\n",
      },
    ],
  });
});

test("nested azemark metadata does not declare the Source version", () => {
  const parsed = createCompiler().parse(
    "---\nx-settings:\n  azemark: 1\n---\n\n:::: mystery\n::::\n",
  );

  assert.equal(
    parsed.diagnostics.some(
      ({ code }) => code === "azeforge.source#version-required",
    ),
    true,
  );
});

test("BOM bytes remain part of first-line directive ranges", () => {
  const parsed = createCompiler().parse("\uFEFF:::: mystery\n::::\n", {
    sourceName: "bom.aze.md",
  });
  const unknown = parsed.diagnostics.find(
    ({ code }) => code === "azeforge.source#unknown-directive",
  );

  assert.deepEqual(unknown?.location?.range, {
    start: { line: 1, column: 7, offset: 8 },
    end: { line: 1, column: 14, offset: 15 },
  });
  assert.deepEqual(parsed.diagnostics[0]?.fix?.edits[0]?.range, {
    start: { line: 1, column: 2, offset: 3 },
    end: { line: 1, column: 2, offset: 3 },
  });
});

test("an unclosed directive at EOF has a guarded safe fix", () => {
  const source = "---\nazemark: 1\n---\n\n:::: mystery\nbody\n";
  const parsed = createCompiler().parse(source);
  const unclosed = parsed.diagnostics.find(
    ({ code }) => code === "azeforge.source#unclosed-directive",
  );

  assert.deepEqual(unclosed?.fix, {
    title: "Add the closing directive delimiter.",
    applicability: "safe",
    edits: [
      {
        range: {
          start: { line: 7, column: 1, offset: 38 },
          end: { line: 7, column: 1, offset: 38 },
        },
        expectedText: "",
        replacementText: "::::\n",
      },
    ],
  });
});

test("diagnostic limits retain Source order and reserve truncation", () => {
  const source = `---
azemark: 1
---

:::: one
::::

:::: two
::::

:::: three
::::

:::: four
::::
`;
  const parsed = createCompiler({
    diagnosticLimits: { perDocument: 3 },
  }).parse(source);

  assert.deepEqual(
    parsed.diagnostics.map(({ code, data }) => ({ code, data })),
    [
      {
        code: "azeforge.source#unknown-directive",
        data: {
          type: "one",
          availableTypes: ["callout", "equation", "mermaid", "table"],
        },
      },
      {
        code: "azeforge.source#unknown-directive",
        data: {
          type: "two",
          availableTypes: ["callout", "equation", "mermaid", "table"],
        },
      },
      {
        code: "azeforge.diagnostics#truncated",
        data: {
          omittedBySeverity: { error: 2, warning: 0, info: 0 },
          omittedBlocks: 2,
        },
      },
    ],
  );

  assert.equal(parsed.diagnostics[2]?.severity, "error");
});
test("per-Block limits group diagnostics across collection phases", () => {
  const source = `---
azemark: 1
---

:::: mystery
id: Bad

body
::::
`;
  const parsed = createCompiler({
    diagnosticLimits: { perBlock: 1, perDocument: 10 },
  }).parse(source);

  assert.deepEqual(
    parsed.diagnostics.map(({ code }) => code),
    [
      "azeforge.source#unknown-directive",
      "azeforge.diagnostics#truncated",
    ],
  );
  assert.deepEqual(parsed.diagnostics[1]?.data, {
    omittedBySeverity: { error: 1, warning: 0, info: 0 },
    omittedBlocks: 1,
  });
});

test("Renderer preflight diagnostics honor the Document limit", async () => {
  const compiler = createCompiler({
    diagnosticLimits: { perDocument: 1 },
  });
  const result = await compiler.compile(
    "---\nazemark: 1\ntitel: typo\n---\n\nBody\n",
    { format: "html", theme: "missing" },
  );

  assert.deepEqual(
    result.diagnostics.map(({ code }) => code),
    ["azeforge.diagnostics#truncated"],
  );
  assert.equal(result.diagnostics[0]?.severity, "error");
  assert.deepEqual(result.diagnostics[0]?.data, {
    omittedBySeverity: { error: 1, warning: 1, info: 0 },
    omittedBlocks: 0,
  });
});

test("validation deduplicates and deterministically orders parse diagnostics", () => {
  const range = {
    start: { line: 1, column: 1, offset: 0 },
    end: { line: 1, column: 2, offset: 1 },
  };
  const makeDiagnostic = (code, severity) => ({
    code,
    severity,
    message: code,
    data: {},
    location: { range },
    relatedLocations: [],
  });
  const duplicate = makeDiagnostic("azeforge.source#a-error", "error");
  const validation = createCompiler().validate({
    document: {
      azemarkVersion: 1,
      schemaVersion: 1,
      metadata: { authors: [], extensions: {} },
      blocks: [],
    },
    diagnostics: [
      makeDiagnostic("azeforge.source#warning", "warning"),
      makeDiagnostic("azeforge.source#z-error", "error"),
      duplicate,
      { ...duplicate },
    ],
  });

  assert.deepEqual(
    validation.diagnostics.map(({ code }) => code),
    [
      "azeforge.source#a-error",
      "azeforge.source#z-error",
      "azeforge.source#warning",
    ],
  );
});

test("front matter rejects structural merge keys but permits quoted text keys", () => {
  const compiler = createCompiler();
  const merged = compiler.validate(
    compiler.parse(
      "---\nazemark: 1\nx-settings:\n  nested:\n    <<: { title: merged }\n---\n\nBody\n",
    ),
  );
  const quoted = compiler.validate(
    compiler.parse(
      '---\nazemark: 1\nx-settings:\n  nested:\n    "<<": literal\n---\n\nBody\n',
    ),
  );

  assert.equal(merged.document, undefined);
  assert.ok(
    merged.diagnostics.some(
      ({ code }) => code === "azeforge.metadata#merge-key-disabled",
    ),
  );
  assert.ok(quoted.document);
  assert.equal(
    quoted.diagnostics.some(
      ({ code }) => code === "azeforge.metadata#merge-key-disabled",
    ),
    false,
  );
});

test("malformed front matter preserves body Blocks without parser internals", () => {
  const parsed = createCompiler().parse(
    "---\nazemark: 1\ntitle: [broken\n---\n\n# Survives\n",
    { sourceName: "front-matter.aze.md" },
  );

  assert.deepEqual(
    parsed.document.blocks.map(({ kind }) => kind),
    ["heading"],
  );
  const yamlDiagnostic = parsed.diagnostics.find(
    ({ code }) => code === "azeforge.metadata#invalid-yaml",
  );
  assert.equal(yamlDiagnostic?.message, "Front matter contains invalid YAML.");
  assert.deepEqual(yamlDiagnostic?.data, {});
  assert.deepEqual(yamlDiagnostic?.relatedLocations, []);
});

test("validation rejects malformed serialized ParsedDocuments", () => {
  const compiler = createCompiler();
  const malformed = {
    document: {
      azemarkVersion: 1,
      schemaVersion: 1,
      metadata: { authors: [], extensions: {} },
      blocks: [
        {
          kind: "heading",
          level: 9,
          children: [{ kind: "text", value: "Impossible" }],
          range: {
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 1, column: 2, offset: 1 },
          },
        },
      ],
    },
    diagnostics: [],
  };

  const validation = compiler.validate(malformed);

  assert.equal(validation.document, undefined);
  assert.deepEqual(
    validation.diagnostics.map(({ code }) => code),
    ["azeforge.document#schema-invalid"],
  );
});

test("duplicate Block IDs point back to the first definition", () => {
  const firstRange = {
    start: { line: 1, column: 1, offset: 0 },
    end: { line: 1, column: 4, offset: 3 },
  };
  const duplicateRange = {
    start: { line: 3, column: 1, offset: 5 },
    end: { line: 3, column: 4, offset: 8 },
  };
  const parsed = {
    document: {
      azemarkVersion: 1,
      schemaVersion: 1,
      metadata: { authors: [], extensions: {} },
      blocks: [
        {
          kind: "paragraph",
          id: "shared",
          children: [{ kind: "text", value: "One" }],
          range: firstRange,
        },
        {
          kind: "paragraph",
          id: "shared",
          children: [{ kind: "text", value: "Two" }],
          range: duplicateRange,
        },
      ],
    },
    diagnostics: [],
  };

  const validation = createCompiler().validate(parsed);

  assert.equal(validation.document, undefined);
  assert.deepEqual(validation.diagnostics, [
    {
      code: "azeforge.reference#duplicate-id",
      severity: "error",
      message: 'Block ID "shared" is used more than once.',
      data: { id: "shared" },
      location: { range: duplicateRange },
      relatedLocations: [
        {
          range: firstRange,
          message: 'Block ID "shared" was first defined here.',
        },
      ],
    },
  ]);
});

test("invalid Block IDs receive a reference diagnostic", () => {
  const range = {
    start: { line: 1, column: 1, offset: 0 },
    end: { line: 1, column: 5, offset: 4 },
  };
  const validation = createCompiler().validate({
    document: {
      azemarkVersion: 1,
      schemaVersion: 1,
      metadata: { authors: [], extensions: {} },
      blocks: [
        {
          kind: "paragraph",
          id: "Bad ID",
          children: [{ kind: "text", value: "Text" }],
          range,
        },
      ],
    },

    diagnostics: [],
  });

  assert.deepEqual(validation.diagnostics, [
    {
      code: "azeforge.reference#invalid-id",
      severity: "error",
      message: 'Block ID "Bad ID" is not a valid AzeMark ID.',
      data: { id: "Bad ID" },
      location: { range },
      suggestion:
        "Use lowercase letters, digits, and single hyphens, starting with a letter.",
      relatedLocations: [],
    },
  ]);
});
test("independent unknown front-matter keys are not deduplicated", () => {
  const parsed = createCompiler().parse(
    "---\nazemark: 1\nfirst-key: one\nsecond-key: two\n---\n\nBody\n",
  );
  const unknownKeys = parsed.diagnostics.filter(
    ({ code }) => code === "azeforge.metadata#unknown-key",
  );

  assert.deepEqual(
    unknownKeys.map(({ data }) => data),
    [{ key: "first-key" }, { key: "second-key" }],
  );
});

test("unknown metadata warnings include a typo suggestion", () => {
  const parsed = createCompiler().parse(
    "---\nazemark: 1\ntitel: Typo\n---\n\nBody\n",
  );
  const warning = parsed.diagnostics.find(
    ({ code }) => code === "azeforge.metadata#unknown-key",
  );

  assert.equal(warning?.severity, "warning");
  assert.equal(warning?.suggestion, 'Did you mean "title"?');
});
