import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const PUBLIC_SCHEMAS = [
  ["acceptance", "acceptanceJsonSchema", "../dist/acceptance.js"],
  ["capabilities", "capabilitiesJsonSchema", "../dist/capabilities-json.js"],
  ["diagnostics", "diagnosticsJsonSchema", "../dist/diagnostics-json.js"],
  ["version", "versionJsonSchema", "../dist/version.js"],
];

test("every packaged schema is byte-identical to its public export", async () => {
  for (const [name, exportName, modulePath] of PUBLIC_SCHEMAS) {
    const module = await import(modulePath);
    const packaged = await readFile(
      new URL(`../schemas/${name}.json`, import.meta.url),
      "utf8",
    );
    assert.equal(packaged, `${JSON.stringify(module[exportName], null, 2)}\n`, name);
  }
});
