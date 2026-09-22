import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  ACCEPTANCE_ENTRIES,
  ACCEPTANCE_SUITE_EVIDENCE,
  ACCEPTANCE_SUITE_FILES,
  AUTOMATED_P0_IDS,
  catalogResultsFromSuites,
  checkAcceptanceSuiteEvidence,
  parseTestSummary,
} from "../dist/acceptance.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const ENTRY_BY_ID = new Map(ACCEPTANCE_ENTRIES.map((entry) => [entry.id, entry]));

/** One outcome per declared suite, all green. */
function greenOutcomes() {
  return ACCEPTANCE_SUITE_FILES.map((suite) => ({ suite, pass: true, detail: "3 pass, 0 fail" }));
}

test("every automated P0 entry declares one existing suite", () => {
  assert.deepEqual(checkAcceptanceSuiteEvidence(ACCEPTANCE_SUITE_EVIDENCE), {
    missing: [],
    unknown: [],
    duplicate: [],
  });
  for (const suite of ACCEPTANCE_SUITE_FILES) {
    assert.ok(existsSync(`${ROOT}${suite}`), `${suite} does not exist`);
  }
});

test("suite coverage rejects a missing, unknown, or repeated declaration", () => {
  const [first, second] = ACCEPTANCE_SUITE_EVIDENCE;
  const missing = checkAcceptanceSuiteEvidence([first]);
  assert.equal(missing.missing.length, AUTOMATED_P0_IDS.length - 1);
  assert.equal(missing.missing.includes(first.id), false);

  const unknown = checkAcceptanceSuiteEvidence([...ACCEPTANCE_SUITE_EVIDENCE, { id: "P0-NOPE-000", suite: "test/cli.test.mjs" }]);
  assert.deepEqual(unknown.unknown, ["P0-NOPE-000"]);

  const duplicate = checkAcceptanceSuiteEvidence([...ACCEPTANCE_SUITE_EVIDENCE, second]);
  assert.deepEqual(duplicate.duplicate, [second.id]);
});

test("a suite outcome summary is read from the TAP reporter", () => {
  const tap = [
    "TAP version 13",
    "ok 1 - first thing",
    "not ok 2 - second thing",
    "# tests 3",
    "# pass 2",
    "# fail 1",
  ].join("\n");
  assert.deepEqual(parseTestSummary(tap), {
    pass: 2,
    fail: 1,
    failure: "not ok 2 - second thing",
  });

  const green = ["# tests 26", "# pass 26", "# fail 0"].join("\n");
  const summary = parseTestSummary(green);
  assert.deepEqual(summary, { pass: 26, fail: 0 });
  assert.equal(summary.failure, undefined);

  assert.equal(parseTestSummary("✔ first thing\nℹ pass 26\nℹ fail 0"), undefined);
  assert.equal(parseTestSummary("no summary here"), undefined);
  assert.equal(parseTestSummary(""), undefined);
});

test("catalog results name every not-directly-executed automated entry", () => {
  const results = catalogResultsFromSuites(greenOutcomes());
  assert.deepEqual(
    results.map((result) => result.id).sort(),
    [...AUTOMATED_P0_IDS].sort(),
  );
  for (const result of results) {
    assert.equal(result.pass, true);
    assert.equal(result.name, ENTRY_BY_ID.get(result.id).when);
    assert.match(result.detail, /^test\/[a-z-]+\.test\.mjs: 3 pass, 0 fail$/);
  }
});

test("an entry the runner executed directly is not reported twice", () => {
  const results = catalogResultsFromSuites(greenOutcomes(), ["P0-EQN-001"]);
  assert.equal(results.some((result) => result.id === "P0-EQN-001"), false);
  assert.equal(results.length, AUTOMATED_P0_IDS.length - 1);
});

test("a failing suite fails exactly the entries it evidences", () => {
  const failing = "test/plot.test.mjs";
  const outcomes = greenOutcomes().map((outcome) =>
    outcome.suite === failing ? { ...outcome, pass: false, detail: "1 pass, 1 fail: y = x^2" } : outcome,
  );
  const results = catalogResultsFromSuites(outcomes);
  const owned = ACCEPTANCE_SUITE_EVIDENCE.filter((evidence) => evidence.suite === failing).map((evidence) => evidence.id);
  const failed = results.filter((result) => result.pass !== true).map((result) => result.id).sort();

  assert.deepEqual(failed, [...owned].sort());
  for (const result of results.filter((item) => failed.includes(item.id))) {
    assert.match(result.detail, /1 pass, 1 fail: y = x\^2$/);
  }
});

test("a suite that never ran fails its entries rather than passing silently", () => {
  const missing = ACCEPTANCE_SUITE_FILES[0];
  const outcomes = greenOutcomes().filter((outcome) => outcome.suite !== missing);
  const results = catalogResultsFromSuites(outcomes);
  const owned = ACCEPTANCE_SUITE_EVIDENCE.filter((evidence) => evidence.suite === missing).map((evidence) => evidence.id);

  for (const id of owned) {
    const result = results.find((item) => item.id === id);
    assert.equal(result.pass, false, `${id} passed without running`);
    assert.match(result.detail, /did not run$/);
  }
});
