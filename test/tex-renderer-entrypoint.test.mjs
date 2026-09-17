import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const ENTRYPOINT = join(ROOT, "tex-renderer", "entrypoint.sh");

async function executable(path, source) {
  await writeFile(path, source, { mode: 0o755 });
  await chmod(path, 0o755);
}

test("TeX renderer accepts stdin only, runs frozen argv, and removes its private workspace", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "azeforge-tex-entrypoint-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const bin = join(directory, "bin");
  const record = join(directory, "record");
  await mkdir(bin);
  await writeFile(record, "");
  const append = 'printf "%s\n" "$*" >> "$RENDERER_RECORD"';
  await executable(join(bin, "setsid"), '#!/bin/sh\nexec "$@"\n');
  await executable(join(bin, "timeout"), '#!/bin/sh\nshift 2\nexec "$@"\n');
  await executable(join(bin, "latex"), `#!/bin/sh\npwd >> "$RENDERER_RECORD"\n${append}\nprintf 'input=' >> "$RENDERER_RECORD"\ncat figure.tex >> "$RENDERER_RECORD"\ntouch figure.dvi\n`);
  await executable(join(bin, "dvisvgm"), `#!/bin/sh\n${append}\nprintf '<svg role="img"/>\n' > output.svg\n`);
  await executable(join(bin, "arbitrary-command"), '#!/bin/sh\nprintf invoked >> "$RENDERER_RECORD"\nexit 99\n');

  const result = spawnSync(
    "bash",
    [
      "-c",
      'ulimit() { return 0; }; export -f ulimit; exec bash "$0" "$@"',
      ENTRYPOINT,
      "arbitrary-command",
      "attacker-argument",
    ],
    {
      cwd: directory,
      input: "\\documentclass{article}\\n",
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, RENDERER_RECORD: record },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '<svg role="img"/>\n');
  const lines = (await readFile(record, "utf8")).split("\n");
  assert.equal(
    lines.slice(1).join("\n"),
    "-interaction=nonstopmode -halt-on-error -no-shell-escape -output-format=dvi figure.tex\ninput=\\documentclass{article}\\n--page=1 --no-fonts=1 --precision=6 --output=output.svg figure.dvi\n",
  );
  await assert.rejects(stat(lines[0] ?? ""));
});

