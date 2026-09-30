## Agent skills

### Issue tracker

Issues live in GitHub Issues (via `gh`). See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (label string equals role name). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### AzeMark directive fences

Fences are **exactly four colons** (`::::`) on the opening line (`:::: equation`) and the closing line. Five colons (`:::::`) are not a registered spelling and are rejected by `test/fence.test.mjs` on every `npm test` / CI run. Never emit or copy 5-colon fences; when you see one in older material, rewrite it to 4.
