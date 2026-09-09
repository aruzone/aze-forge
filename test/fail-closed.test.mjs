import assert from "node:assert/strict";
import test from "node:test";

import {
  BrowserCapabilityError,
  calloutHtmlBlockRenderer,
  equationHtmlBlockRenderer,
} from "../dist/adapters.js";
import { createCompiler } from "../dist/index.js";
import { renderEquationToHtml, sanitizeKatexHtml } from "../dist/equation.js";
import { renderInlineHtml } from "../dist/html-fragment.js";

const EQUATION_SOURCE = `---
azemark: 2
---

:::: equation
id: newton
----
F = m * a
::::
`;

const CALLOUT_SOURCE = `---
azemark: 2
---

:::: callout
variant: note
title: Plain note
----
A short note.
::::
`;

test("clean KaTeX output passes the final sanitizer unchanged", () => {
  const clean = renderEquationToHtml("F = m * a");
  assert.equal(sanitizeKatexHtml(clean), clean);
});

test("KaTeX sanitizer fails closed on executable markup", () => {
  assert.throws(
    () => sanitizeKatexHtml('<span class="katex"><script>alert(1)</script></span>'),
    /executable markup/,
  );
  assert.throws(
    () => sanitizeKatexHtml('<span class="katex" onclick="alert(1)">x</span>'),
    /executable markup/,
  );
});

test("KaTeX sanitizer fails closed on unsafe URL schemes", () => {
  for (const scheme of ["javascript:", "vbscript:", "file:", "ftp:"]) {
    assert.throws(
      () => sanitizeKatexHtml(`<a href="${scheme}payload">x</a>`),
      /unsafe URL/,
      scheme,
    );
  }
});

test("inline HTML emission fails closed on unsafe link targets", () => {
  assert.throws(
    () =>
      renderInlineHtml([
        {
          kind: "link",
          href: "javascript:alert(1)",
          title: undefined,
          children: [{ kind: "text", value: "x" }],
        },
      ]),
    /unsafe link target/,
  );
  const safe = renderInlineHtml([
    {
      kind: "link",
      href: "https://example.com/report",
      title: undefined,
      children: [{ kind: "text", value: "x" }],
    },
  ]);
  assert.match(safe, /href="https:\/\/example\.com\/report"/);
});

test("inline HTML emission fails closed on unsafe image sources", () => {
  assert.throws(
    () =>
      renderInlineHtml([
        {
          kind: "image",
          src: "javascript:alert(1)",
          alt: "x",
          title: undefined,
        },
      ]),
    /unsafe image source/,
  );
  const embedded = renderInlineHtml([
    {
      kind: "image",
      src: "data:image/png;base64,iVBORw0KGgo=",
      alt: "x",
      title: undefined,
    },
  ]);
  assert.match(embedded, /src="data:image\/png;base64,/);
  const relative = renderInlineHtml([
    { kind: "image", src: "figures/plot.png", alt: "x", title: undefined },
  ]);
  assert.match(relative, /src="figures\/plot\.png"/);
});

test("inline HTML emission rescans SVG data URLs for active content", () => {
  const cleanSvg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10"><rect width="20" height="10" fill="#123456"/></svg>',
    "utf8",
  ).toString("base64");
  const clean = renderInlineHtml([
    {
      kind: "image",
      src: `data:image/svg+xml;base64,${cleanSvg}`,
      alt: "x",
      title: undefined,
    },
  ]);
  assert.match(clean, /src="data:image\/svg\+xml;base64,/);
  const scriptedSvg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    "utf8",
  ).toString("base64");
  assert.throws(
    () =>
      renderInlineHtml([
        {
          kind: "image",
          src: `data:image/svg+xml;base64,${scriptedSvg}`,
          alt: "x",
          title: undefined,
        },
      ]),
    /unsafe image source/,
  );
});

test("capability-denied adapter work becomes a bounded diagnostic", async () => {
  const denying = {
    descriptor: equationHtmlBlockRenderer.descriptor,
    render: () => {
      throw new BrowserCapabilityError("Browser request was denied: https://example.com/");
    },
  };
  const result = await createCompiler({ blockRenderers: [denying] }).compile(
    EQUATION_SOURCE,
    { format: "html" },
  );
  assert.equal(result.artifact, undefined);
  assert.deepEqual(
    result.diagnostics.map(({ code }) => code),
    ["azeforge.security#capability-denied"],
  );
});

test("asynchronous callout Block renderers fail closed with adapter identity", async () => {
  const asyncCallout = {
    descriptor: calloutHtmlBlockRenderer.descriptor,
    render: async () => "<aside>late</aside>",
  };
  const result = await createCompiler({ blockRenderers: [asyncCallout] }).compile(
    CALLOUT_SOURCE,
    { format: "html" },
  );
  assert.equal(result.artifact, undefined);
  assert.deepEqual(
    result.diagnostics.map(({ code }) => code),
    ["azeforge.renderer#adapter-sync"],
  );
  assert.equal(
    result.diagnostics[0]?.data?.adapterId,
    calloutHtmlBlockRenderer.descriptor.id,
  );
});

test("render timeouts above the default are rejected as host policy", () => {
  assert.throws(
    () => createCompiler({ renderTimeoutMs: 6000 }),
    /Render timeout must be a positive integer no greater than the default/,
  );
  createCompiler({ renderTimeoutMs: 5000 });
  createCompiler({ renderTimeoutMs: 100 });
});

test("cancelled compilation publishes no Artifact", async () => {
  const controller = new AbortController();
  controller.abort();
  const result = await createCompiler().compile(EQUATION_SOURCE, {
    format: "html",
    signal: controller.signal,
  });
  assert.equal(result.artifact, undefined);
  assert.deepEqual(
    result.diagnostics.map(({ code }) => code),
    ["azeforge.compiler#cancelled"],
  );
});
