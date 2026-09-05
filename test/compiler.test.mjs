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

test("HTML renders Source text as inert content", async () => {
  const source = `---
azemark: 1
title: "</title><script>title()</script>"
---

# <script>heading()</script>

<img src=x onerror=paragraph()>
`;
  const result = await createCompiler().compile(source, { format: "html" });

  assert.ok(result.artifact);
  const html = new TextDecoder().decode(result.artifact.bytes);
  assert.doesNotMatch(html, /<script\b/i);
  assert.doesNotMatch(html, /<img\b/i);
  assert.match(html, /&lt;script&gt;heading\(\)&lt;\/script&gt;/);
  assert.match(html, /&lt;img src=x onerror=paragraph\(\)&gt;/);
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

test("unsupported directives fail through an InvalidBlock without identities", async () => {
  const source = "Before\n\n:::: equation\nx = 1\n::::\n\nAfter\n";
  const compiler = createCompiler();
  const parsed = compiler.parse(source);
  const invalid = parsed.document.blocks[1];

  assert.deepEqual(parsed.document.blocks.map(({ kind }) => kind), [
    "paragraph",
    "invalid",
    "paragraph",
  ]);
  assert.equal(invalid?.kind, "invalid");
  assert.equal(invalid?.raw, ":::: equation\nx = 1\n::::");
  assert.equal(invalid?.originalType, "equation");
  assert.deepEqual(invalid?.diagnosticIndexes, [0]);

  const compiled = await compiler.compile(source, { format: "html" });
  assert.equal(compiled.document, undefined);
  assert.equal(compiled.contentHash, undefined);
  assert.equal(compiled.artifact, undefined);
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
      ({ code }) => code === "AZE_FRONT_MATTER_MERGE_KEY",
    ),
  );
  assert.ok(quoted.document);
  assert.equal(
    quoted.diagnostics.some(
      ({ code }) => code === "AZE_FRONT_MATTER_MERGE_KEY",
    ),
    false,
  );
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
    ["AZE_DOCUMENT_SCHEMA"],
  );
});

test("validation rejects duplicate document-wide Block IDs", () => {
  const range = {
    start: { line: 1, column: 1, offset: 0 },
    end: { line: 1, column: 2, offset: 1 },
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
          range,
        },
        {
          kind: "paragraph",
          id: "shared",
          children: [{ kind: "text", value: "Two" }],
          range,
        },
      ],
    },
    diagnostics: [],
  };

  const validation = createCompiler().validate(parsed);

  assert.equal(validation.document, undefined);
  assert.deepEqual(
    validation.diagnostics.map(({ code }) => code),
    ["AZE_BLOCK_ID_DUPLICATE"],
  );
});

test("unknown metadata warnings include a typo suggestion", () => {
  const parsed = createCompiler().parse(
    "---\nazemark: 1\ntitel: Typo\n---\n\nBody\n",
  );
  const warning = parsed.diagnostics.find(
    ({ code }) => code === "AZE_FRONT_MATTER_KEY",
  );

  assert.equal(warning?.severity, "warning");
  assert.equal(warning?.suggestion, 'Did you mean "title"?');
});
