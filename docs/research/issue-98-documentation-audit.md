# Issue #98 documentation audit

Issue: [aruzone/aze-forge#98](https://github.com/aruzone/aze-forge/issues/98), "Docs and grammar session: figure colour tokens, annotation policy, and the family showcase". State `OPEN`, label `ready-for-human`, no comments when fetched with `gh issue view 98`.

## Result

| Issue section | Status after this documentation change | Evidence |
| --- | --- | --- |
| Theme token values | Documented | `docs/themes.md` lists `theme.geometry` and `theme.plot` values from `src/theme.ts` for `default`, `academic`, and `dark-presentation`. |
| Host Theme override | Documented | `docs/themes.md` shows `createCompiler({ themes, defaultTheme })`, matching the exercised API in `test/geometry.test.mjs` and `test/plot.test.mjs`. |
| Theme validation | Documented with scope | `docs/themes.md` identifies the six-digit hex rule enforced by `THEME_COLOR` and `validateTheme` in `src/compiler.ts` for `colors`, geometry tokens, and plot tokens. Other family token groups remain outside that validation and need a separate compiler hardening change. |
| Circuit colour policy | Documented | `docs/themes.md` records that no `theme.circuit` group exists, circuit ink uses `currentColor`, and inversion bubbles use `theme.colors.background`, matching `src/model.ts` and `src/circuit-render.ts`. |
| Figure colour policy | Documented | `docs/themes.md` distinguishes family-owned inline tokens, `currentColor`, and chemistry's `Canvas` text halo. Implementations live in the family renderers and `src/render-html.ts`. |
| Geometry annotation policy | Already documented, now cross-linked | `docs/capabilities/README.md` describes the 4.5% characteristic-length rule, 10px floor, ISO 3098-1 ratio, and collision-free placement. `docs/themes.md` explains the same policy for Theme authors. |
| Frame-clipped lines and rays | Documented | `docs/themes.md` states that lines and rays stop at the viewBox. `docs/language/15-showcase.aze.md` supplies a rendered ray example. The implementation is `lineChordWithinFrame` in `src/geometry.ts`. |
| Categorical band axis | Documented | `docs/capabilities/README.md` and `docs/themes.md` state why categorical charts omit numeric x ticks. The behavior is implemented by `xNumericTicks: false` in `src/plot.ts` and covered by `test/plot.test.mjs`. |
| Geometry showcase | Shipped | `docs/language/15-showcase.aze.md` contains the six issue-proposed Blocks with stable ids: `thales-circle`, `tangent-pair`, `marked-triangle`, `sector-wedge`, `frame-filled`, and `frame-sparse`. |
| Theme-audit fixture | Still a candidate | The scratch theme-audit Source is reference material under the user-owned `docs/language/0.6.X/` directory. No permanent all-families by all-themes test was added in this documentation change. |
| `cssDimensionsOf` API decision | Remains internal | `src/theme.ts` exports it to internal renderers, but `src/index.ts` does not expose it from the package entry point. `docs/themes.md` records the current status without changing the public API. |

## Contrast evidence

The issue proposes a general 4:1 target for figure ink and series colours and a 3:1 graphics floor. Repository tests currently establish a narrower contract:

- `test/geometry.test.mjs` checks at least 4:1 for dark Theme geometry ink and marks against the dark background.
- `test/plot.test.mjs` checks at least 4:1 for every dark Theme series colour against the dark background.

No repository check establishes a universal 3:1 floor for every graphics token. The Theme guide therefore documents the tested 4:1 dark-Theme checks and leaves custom Theme contrast with the host. It does not claim an unverified universal floor.

## Documentation routing

- End users get the copyable geometry examples in `docs/language/15-showcase.aze.md` and the named example catalog at the end of `docs/language/README.md`.
- Theme hosts and contributors get token, colour, clipping, and axis policy in `docs/themes.md`.
- `docs/capabilities/README.md` links the Theme guide and states the categorical chart rule where chart authors will find it.
- The theme-audit fixture and the `cssDimensionsOf` export decision remain separate testing and public API work. Neither changes AzeMark authoring syntax.
