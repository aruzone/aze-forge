/**
 * Directive fences are exactly four colons (`::::`) on both the opening and
 * the closing line. Five-colon fences are not a registered spelling: the
 * compiler reads `::::: equation` as a four-colon fence whose header starts
 * with a `:` field line and refuses the Block, and the 5s spelling spreads
 * through agent-authored docs because it looks plausible. This test keeps it
 * burnt and buried: any tracked Markdown file carrying a 5+-colon fence line
 * fails the suite here and in CI, before any human or agent reads it.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

const tracked = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" })
  .split("\n")
  .filter((name) => /\.md$/.test(name));

test("directive fences use exactly four colons in every tracked Markdown file", () => {
  const offenders = [];
  for (const name of tracked) {
    let text;
    try {
      text = readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
    } catch {
      continue; // Deleted in the working tree; git is the source of truth.
    }
    const lines = text.split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      const match = /^:+/.exec(line);
      if (match !== null && match[0].length >= 5) {
        offenders.push(`${name}:${index + 1}: ${line.trim().slice(0, 60)}`);
      }
    }
  }
  if (offenders.length > 0) {
    throw new Error(
      `Directive fences are exactly four colons (\`::::\`); found ${offenders.length} line(s) with five or more:\n${offenders.join("\n")}\nRewrite every fence as \`::::\` on the opening and closing line.`,
    );
  }
});
