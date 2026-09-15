import assert from "node:assert/strict";
import test from "node:test";

import { readFile } from "node:fs/promises";
import { createCompiler } from "../dist/index.js";

function timingSource(
  body,
  { header = "title: Clocked bus transaction\nscale: cycles\n", fence = "::::" } = {},
) {
  return `---\nazemark: 2\n---\n\n${fence} timing\n${header}----\n${body}\n${fence}\n`;
}

function errorCodes(result) {
  return result.diagnostics
    .filter(({ severity }) => severity === "error")
    .map(({ code }) => code)
    .sort();
}

function warnings(result) {
  return result.diagnostics.filter(({ severity }) => severity === "warning");
}

function timingBlock(result) {
  const block = result.document?.blocks.find((candidate) => candidate.kind === "timing");
  assert.ok(block, "missing timing block");
  return block;
}

async function documentedTimingSource(documentName, id) {
  const source = await readFile(new URL(`../docs/language/${documentName}`, import.meta.url), "utf8");
  const directive = source.match(
    new RegExp(String.raw`(?<fence>:{4,}) timing\nid: ${id}\n[\s\S]*?\n\k<fence>(?=\n|$)`),
  );
  assert.ok(directive, `missing ${id} timing fixture in ${documentName}`);
  const fence = directive.groups?.fence;
  assert.ok(fence);
  return `---\nazemark: 2\n---\n\n${directive[0].replaceAll(fence, "::::")}\n`;
}

const CLOCKED_BUS_TRANSACTION = `- kind: signal
  ref: clk
  clock: true
  wave: 2p2n2p2n
- kind: signal
  ref: valid
  wave: 0011
- kind: signal
  ref: ready
  wave: 1100
- kind: signal
  ref: addr
  width: 8
  wave: x={A5}={A6}.
- kind: signal
  ref: data
  width: 8
  phase: 1
  wave: ={D0}xz.
- kind: group
  label: Transaction
  signals: addr, data
- kind: marker
  at: 0
  label: Reset
- kind: arrow
  from: addr@4
  to: valid@4
  label: t_{su}`;

const TIME_SCALE_TRANSACTION = `- kind: signal
  ref: clk
  clock: true
  intervals:
    - state: rise
      duration: 2
    - state: fall
      duration: 2
    - state: rise
      duration: 2
    - state: fall
      duration: 2
- kind: signal
  ref: valid
  intervals:
    - state: low
      duration: 1
    - state: low
      duration: 1
    - state: high
      duration: 1
    - state: high
      duration: 1
- kind: signal
  ref: ready
  intervals:
    - state: high
      duration: 1
    - state: high
      duration: 1
    - state: low
      duration: 1
    - state: low
      duration: 1
- kind: signal
  ref: addr
  width: 8
  intervals:
    - state: unknown
      duration: 1
    - state: bus
      duration: 1
      value: A5
    - state: bus
      duration: 1
      value: A6
    - state: continue
      duration: 1
- kind: signal
  ref: data
  width: 8
  phase: 1
  intervals:
    - state: bus
      duration: 1
      value: D0
    - state: unknown
      duration: 1
    - state: impedance
      duration: 1
    - state: continue
      duration: 1
- kind: group
  label: Transaction
  signals: addr, data
- kind: marker
  at: 0
  label: Reset
- kind: arrow
  from: addr@4
  to: valid@4
  label: t_{su}`;

const TIME_HEADER = "title: Clocked bus transaction\nscale: time\nunit: ns\n";

test("Timing parses the clocked bus transaction into inspectable interval semantics", () => {
  const parsed = createCompiler().parse(timingSource(CLOCKED_BUS_TRANSACTION), {
    sourceName: "transaction.aze.md",
  });

  assert.deepEqual(errorCodes(parsed), []);
  assert.deepEqual(warnings(parsed), []);
  const block = timingBlock(parsed);
  assert.equal(block.scale, "cycles");
  assert.deepEqual(block.signals.map(({ ref }) => ref), ["clk", "valid", "ready", "addr", "data"]);
  assert.equal(block.signals[0].clock, true);
  assert.equal(block.signals[0].phase, "0");
  assert.equal(block.signals[3].width, 8);
  assert.equal(block.signals[4].phase, "1");
  assert.deepEqual(
    block.signals[3].intervals.map(({ state, count, value }) => ({
      state,
      count,
      value: value?.map(({ kind, value: text }) => ({ kind, text })),
    })),
    [
      { state: "unknown", count: "1", value: undefined },
      { state: "bus", count: "1", value: [{ kind: "text", text: "A5" }] },
      { state: "bus", count: "1", value: [{ kind: "text", text: "A6" }] },
      { state: "continue", count: "1", value: undefined },
    ],
  );
  assert.deepEqual(
    block.groups.map(({ label, signals }) => ({ label, signals })),
    [{ label: [{ kind: "text", value: "Transaction" }], signals: ["addr", "data"] }],
  );
  assert.equal(block.markers[0].at, "0");
  assert.deepEqual(block.markers[0].label, [{ kind: "text", value: "Reset" }]);
  assert.equal(block.arrows[0].from.signal, "addr");
  assert.equal(block.arrows[0].from.boundary, "4");
  assert.equal(block.arrows[0].to.signal, "valid");
  assert.deepEqual(block.arrows[0].label, [
    { kind: "text", value: "t" },
    { kind: "subscript", value: "su" },
  ]);
  assert.equal(block.signals[4].intervals.some(({ state }) => state === "impedance"), true);
});

test("Timing carries the same authored timing across the cycle and time scales", async () => {
  const compiler = createCompiler();
  const cycles = compiler.parse(timingSource(CLOCKED_BUS_TRANSACTION));
  const time = compiler.parse(timingSource(TIME_SCALE_TRANSACTION, { header: TIME_HEADER }));

  assert.deepEqual(errorCodes(time), []);
  assert.deepEqual(warnings(time), []);
  const cyclesBlock = timingBlock(cycles);
  const timeBlock = timingBlock(time);
  assert.equal(timeBlock.scale, "time");
  assert.equal(timeBlock.unit, "ns");
  assert.deepEqual(
    timeBlock.signals.map(({ ref, clock, phase, width }) => ({ ref, clock, phase, width })),
    cyclesBlock.signals.map(({ ref, clock, phase, width }) => ({ ref, clock, phase, width })),
  );
  assert.deepEqual(
    timeBlock.signals.map((signal) => signal.intervals.map(({ state }) => state)),
    cyclesBlock.signals.map((signal) => signal.intervals.map(({ state }) => state)),
  );
  assert.deepEqual(
    timeBlock.signals.map((signal) => signal.intervals.map(({ state, duration, count }) => duration ?? count)),
    cyclesBlock.signals.map((signal) => signal.intervals.map(({ count }) => count)),
  );
  assert.deepEqual(timeBlock.arrows.map(({ from, to }) => [from.signal, from.boundary, to.signal, to.boundary]), [
    ["addr", "4", "valid", "4"],
  ]);

  const rendered = await Promise.all([
    compiler.compile(timingSource(CLOCKED_BUS_TRANSACTION), { format: "svg" }),
    compiler.compile(timingSource(TIME_SCALE_TRANSACTION, { header: TIME_HEADER }), { format: "svg" }),
  ]);
  for (const result of rendered) {
    assert.deepEqual(errorCodes(result), []);
    assert.ok(result.artifact);
  }
});

test("Timing identity follows parsed intervals, not waveform spelling", async () => {
  const compiler = createCompiler();
  const header = "title: Identity\nscale: cycles\n";
  const compact = await compiler.compile(
    timingSource("- kind: signal\n  ref: d\n  wave: 1=4.", { header }),
    { format: "html" },
  );
  const expanded = await compiler.compile(
    timingSource("- kind: signal\n  ref: d\n  wave: 1=....", { header }),
    { format: "html" },
  );
  const folded = await compiler.compile(
    timingSource("- kind: signal\n  ref: d\n  wave: 1=4.x", { header }),
    { format: "html" },
  );
  const annotated = await compiler.compile(
    timingSource("- kind: signal\n  ref: d\n  wave: 1={A5}4.", { header }),
    { format: "html" },
  );

  assert.equal(compact.contentHash, expanded.contentHash);
  assert.notEqual(compact.contentHash, folded.contentHash);
  assert.notEqual(compact.contentHash, annotated.contentHash);
  const shifted = await compiler.compile(
    timingSource(CLOCKED_BUS_TRANSACTION.replace("phase: 1", "phase: 3")),
    { format: "html" },
  );
  const unshifted = await compiler.compile(timingSource(CLOCKED_BUS_TRANSACTION), { format: "html" });
  assert.notEqual(shifted.contentHash, unshifted.contentHash);
});

test("Timing emits shape-distinguishable state geometry into a finite viewBox", async () => {
  const result = await createCompiler().compile(timingSource(CLOCKED_BUS_TRANSACTION), {
    format: "svg",
    sourceName: "transaction.aze.md",
  });

  assert.deepEqual(errorCodes(result), []);
  const svg = Buffer.from(result.artifact.bytes).toString("utf8");
  assert.match(svg, /class="aze-timing"/);
  assert.match(svg, /data-timing-scale="cycles"/);
  for (const state of ["low", "high", "unknown", "impedance", "bus", "continue", "rise", "fall"]) {
    assert.match(svg, new RegExp(`aze-timing-${state}`), `missing ${state} geometry`);
  }
  assert.match(svg, /A5/);
  assert.match(svg, /aze-timing-marker/);
  assert.match(svg, /aze-timing-arrow/);
  assert.match(svg, /aze-timing-group/);
  assert.match(svg, /aze-timing-edge/);
  const viewBox = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  assert.ok(viewBox, "missing viewBox");
  assert.ok(Number(viewBox[1]) > 0 && Number(viewBox[2]) > 0);
  assert.ok(Number(viewBox[1]) <= 4096 && Number(viewBox[2]) <= 16384);
  const figure = /<figure class="aze-timing"[\s\S]*?<\/figure>/.exec(svg);
  assert.ok(figure, "missing timing figure");
  for (const coordinate of figure[0].match(/-?\d+\.\d{4,}/g) ?? []) {
    assert.fail(`coordinate ${coordinate} is not 3-decimal quantized`);
  }
});

test("Timing diagnoses every unsupported declaration as an error, never a warning", async () => {
  const cases = [
    {
      name: "invalid interval character",
      body: CLOCKED_BUS_TRANSACTION.replace("wave: 2p2n2p2n", "wave: 2q"),
      header: undefined,
      codes: ["azeforge.timing#invalid-wave"],
    },
    {
      name: "leading continue interval",
      body: CLOCKED_BUS_TRANSACTION.replace("wave: 2p2n2p2n", "wave: .2p"),
      header: undefined,
      codes: ["azeforge.timing#invalid-wave"],
    },
    {
      name: "wave form on the time scale",
      body: TIME_SCALE_TRANSACTION.replace("- kind: signal\n  ref: ready\n", "- kind: signal\n  ref: ready\n  wave: 10\n"),
      header: TIME_HEADER,
      codes: ["azeforge.timing#invalid-field"],
    },
    {
      name: "record form on the cycles scale",
      body: TIME_SCALE_TRANSACTION,
      header: "title: Wrong form\nscale: cycles\n",
      codes: [
        "azeforge.timing#invalid-anchor",
        "azeforge.timing#invalid-field",
        "azeforge.timing#missing-field",
        "azeforge.timing#unknown-signal-ref",
      ],
    },
    {
      name: "time scale without a unit",
      body: TIME_SCALE_TRANSACTION,
      header: "title: Missing unit\nscale: time\n",
      codes: ["azeforge.timing#missing-field"],
    },
    {
      name: "unit with the cycles scale",
      body: CLOCKED_BUS_TRANSACTION,
      header: "title: Unit on cycles\nscale: cycles\nunit: ns\n",
      codes: ["azeforge.timing#invalid-field"],
    },
    {
      name: "non-contiguous group",
      body: CLOCKED_BUS_TRANSACTION.replace("signals: addr, data", "signals: valid, data"),
      header: undefined,
      codes: ["azeforge.timing#invalid-group"],
    },
    {
      name: "unknown group member",
      body: CLOCKED_BUS_TRANSACTION.replace("signals: addr, data", "signals: addr, latency"),
      header: undefined,
      codes: ["azeforge.timing#unknown-signal-ref"],
    },
    {
      name: "out-of-range arrow anchor",
      body: CLOCKED_BUS_TRANSACTION.replace("to: valid@4", "to: valid@9"),
      header: undefined,
      codes: ["azeforge.timing#invalid-anchor"],
    },
    {
      name: "malformed arrow anchor",
      body: CLOCKED_BUS_TRANSACTION.replace("from: addr@4", "from: addr4"),
      header: undefined,
      codes: ["azeforge.timing#invalid-anchor"],
    },
    {
      name: "marker without a position",
      body: CLOCKED_BUS_TRANSACTION.replace("at: 0", "at: start"),
      header: undefined,
      codes: ["azeforge.timing#invalid-marker"],
    },
    {
      name: "duplicate signal ref",
      body: `${CLOCKED_BUS_TRANSACTION}\n- kind: signal\n  ref: clk\n  wave: 10`,
      header: undefined,
      codes: ["azeforge.timing#duplicate-signal-ref"],
    },
    {
      name: "unknown declaration",
      body: `${CLOCKED_BUS_TRANSACTION}\n- kind: phase-shift\n  by: 1`,
      header: undefined,
      codes: ["azeforge.timing#unknown-declaration"],
    },
    {
      name: "unknown header field",
      body: CLOCKED_BUS_TRANSACTION,
      header: "title: Unknown header\nperiod: 10\n",
      codes: ["azeforge.timing#unknown-field"],
    },
    {
      name: "over-long label text",
      body: CLOCKED_BUS_TRANSACTION.replace("label: Reset", `label: ${"R".repeat(33)}`),
      header: undefined,
      codes: ["azeforge.timing#limit-exceeded"],
    },
  ];
  const compiler = createCompiler();
  for (const entry of cases) {
    const result = compiler.parse(timingSource(entry.body, entry.header === undefined ? {} : { header: entry.header }));
    assert.deepEqual(
      [...new Set(errorCodes(result))],
      entry.codes,
      `${entry.name}: expected ${entry.codes.join(", ")}`,
    );
    assert.deepEqual(warnings(result), [], `${entry.name}: the family registers no warnings`);
    assert.equal(
      result.document?.blocks.some((block) => block.kind === "timing"),
      false,
      `${entry.name}: an invalid Block never yields a partial diagram`,
    );
  }
});

test("Timing enforces its ceiling matrix before layout", () => {
  const signals = Array.from({ length: 33 }, (_, index) => `- kind: signal\n  ref: s${index}\n  wave: 10`).join("\n");
  const overflow = createCompiler().parse(timingSource(signals));
  const limit = overflow.diagnostics.find(({ code }) => code === "azeforge.timing#limit-exceeded");
  assert.ok(limit, "missing limit diagnostic");
  assert.deepEqual(limit.data, { subject: "signal count", count: 33, limit: 32 });

  const span = createCompiler().parse(
    timingSource(CLOCKED_BUS_TRANSACTION.replace("wave: 2p2n2p2n", "wave: 999x")),
  );
  assert.equal(errorCodes(span).includes("azeforge.timing#limit-exceeded"), true);
});

test("Timing rejects a signal without its authored waveform", () => {
  const missing = createCompiler().parse(
    timingSource(CLOCKED_BUS_TRANSACTION.replace("  wave: 2p2n2p2n\n", "")),
  );
  assert.deepEqual(errorCodes(missing), ["azeforge.timing#missing-field"]);
  assert.deepEqual(warnings(missing), []);
});

test("Timing renders the documented clocked bus transaction and its time-scale twin", async () => {
  const source = await documentedTimingSource("07-timing-scenarios.aze.md", "timing-clocked-bus-transaction");
  const twin = await documentedTimingSource("07-timing-scenarios.aze.md", "timing-transaction-time-scale");
  const compiler = createCompiler();
  const [cycles, time] = await Promise.all([
    compiler.compile(source, { format: "svg" }),
    compiler.compile(twin, { format: "svg" }),
  ]);

  assert.deepEqual(errorCodes(cycles), []);
  assert.deepEqual(errorCodes(time), []);
  for (const result of [cycles, time]) {
    const svg = Buffer.from(result.artifact.bytes).toString("utf8");
    assert.match(svg, /aze-timing/);
    assert.match(svg, /aze-timing-impedance/);
    assert.match(svg, /aze-timing-marker/);
  }
});
