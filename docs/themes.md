# Themes and native figure colour

A Theme controls page colour, typography, document width, and the drawing
colours used by native figures. A Source selects a registered Theme with the
front matter `theme` field, or a render command selects one with `--theme`.
A library host can register another Theme when it creates the compiler.

This page concentrates on figure colour and geometry. The complete `Theme`
contract is the exported TypeScript interface in `src/model.ts`.

## Built-in figure tokens

The three built-in Themes define separate geometry and plot token groups.
`chart` uses the plot tokens because plots and charts share axes, grids, and
series palettes.

| Theme | `geometry.ink` | `geometry.guide` | `geometry.mark` |
| --- | --- | --- | --- |
| `default` | `#171717` | `#5f6368` | `#b45309` |
| `academic` | `#1c1917` | `#78716c` | `#b45309` |
| `dark-presentation` | `#e2e8f0` | `#94a3b8` | `#fbbf24` |

`geometry.ink` paints ordinary strokes, point markers, and labels.
`geometry.guide` paints visible construction guides. `geometry.mark` paints
right-angle marks, equal-length ticks, and measured annotations.

| Theme | `plot.axisInk` | `plot.gridInk` | `plot.seriesColors` |
| --- | --- | --- | --- |
| `default` | `#171717` | `#d1d5db` | `#2563eb`, `#dc2626`, `#16a34a`, `#d97706`, `#7c3aed`, `#0891b2` |
| `academic` | `#1c1917` | `#e2ddd3` | `#2563eb`, `#dc2626`, `#16a34a`, `#d97706`, `#7c3aed`, `#0891b2` |
| `dark-presentation` | `#e2e8f0` | `#334155` | `#3b82f6`, `#ef4444`, `#22c55e`, `#f59e0b`, `#a78bfa`, `#22d3ee` |

`plot.axisInk` paints the axis frame, ticks, axis labels, and legend labels.
`plot.gridInk` is deliberately quieter than the axis on the same background.
The renderer walks `plot.seriesColors` in order and cycles when a figure has
more series than palette entries.

The regression suite checks that dark geometry ink, geometry marks, and every
dark series colour have at least 4:1 contrast against the dark Theme's own
background. A custom Theme remains responsible for the contrast of its own
colours.

## Register a custom Theme

Start with a built-in Theme, replace the groups you own, and register the result
with `createCompiler`. Copying a built-in Theme keeps the unrelated typography,
diagram, model, control, and free-body contracts intact.

```ts
import {
  createCompiler,
  defaultTheme,
  type Theme,
} from "@aruzone/aze-forge";

const blueprint: Theme = {
  ...defaultTheme,
  id: "blueprint",
  version: "1.0.0",
  title: "Blueprint",
  geometry: {
    ...defaultTheme.geometry,
    ink: "#1d4ed8",
    guide: "#93c5fd",
    mark: "#c2410c",
  },
  plot: {
    ...defaultTheme.plot,
    axisInk: "#1e3a8a",
    gridInk: "#bfdbfe",
    seriesColors: ["#1d4ed8", "#b91c1c", "#15803d"],
  },
};

const compiler = createCompiler({
  themes: [blueprint],
  defaultTheme: "blueprint",
});
```

A Source can select the registered Theme explicitly:

```yaml
---
azemark: 2
theme: blueprint
---
```

The compiler validates `colors`, `geometry.ink`, `geometry.guide`,
`geometry.mark`, `plot.axisInk`, `plot.gridInk`, and every
`plot.seriesColors` entry as six-digit hexadecimal strings of the form
`#RRGGBB`. Those values reject colour names, short hex values, CSS variables,
and text that could escape an SVG attribute. The compiler also validates the
Theme's geometry dimensions and typography bounds before compiling a Source.

Other family token groups do not yet receive this hex-only validation. A host
must supply safe solid colour values for them. Extending validation to every
family token is a compiler hardening change, not an AzeMark authoring change.

## Native figure colour policy

Native figures use one of two colour paths.

| Families | Colour path |
| --- | --- |
| `geometry`, `plot`, `chart`, `diagram`, `sequence`, `state`, `entity`, `class`, `control`, `free-body` | The renderer writes family-owned Theme tokens into the SVG. Labels that must follow document text may still use `currentColor`. |
| `formula`, `reaction`, `structure`, `circuit`, `timing` | Figure ink follows the document foreground through `currentColor`. |

Chemistry atom labels add a `Canvas` stroke behind their text. That system
colour creates a halo matching the page canvas without inventing a chemistry
palette.

There is no `theme.circuit` group. Circuit wires and symbols follow
`currentColor`. An inverted-gate bubble masks with `theme.colors.background`,
so the bubble and page cannot disagree.

This split is intentional. A family gets dedicated tokens when it needs
several stable visual roles, such as guide versus mark or axis versus data. A
single-ink family follows the page foreground instead of defining another copy
of the same colour.

## Geometry rendering policy

Geometry annotation size follows the drawn figure rather than the full canvas.
The nominal label height is 4.5% of the characteristic length, which is the
geometric mean of the drawn extents clipped to the viewBox. Labels never fall
below the Theme's 10px readable floor. Line weight follows the ISO 3098-1
nominal 10:1 label-height-to-line-width ratio within a bounded range.

The renderer measures labels with the shared character advance table. It tries
candidate positions in a fixed order and chooses the first one that does not
collide with a point, line, arc, or mark. This makes label placement
deterministic.

Infinite constructions still produce finite graphics. A `line` extends to the
viewBox edges. A `ray` starts at its origin and stops where its direction meets
the viewBox. Neither draws beyond the frame.

See the compile-verified [geometry theorem and rendering
showcase](language/15-showcase.aze.md) for Thales theorem, tangent branches,
computed marks, a frame-clipped ray, and the same triangle under two frame
scales.

## Plot and chart rendering policy

Numeric plot axes derive ticks from their linear or logarithmic scales. A
logarithmic axis labels major powers only.

A categorical bar chart uses a band axis. The category names already occupy the
x-axis baseline, so the renderer omits the otherwise meaningless numeric x
ticks. The axis title remains. This prevents numeric labels such as `0.5`,
`1.5`, and `2.5` from printing over the category names.

## Internal dimension projection

`cssDimensionsOf` returns only `canvasWidthPx`, `contentWidthPx`, and
`paddingPx`. Renderers use that projection so figure colour tokens never leak
into Artifact capacity metadata.

The function remains an internal module export. It is not re-exported from the
package's public entry point. Changing that API status requires a separate
public API decision; theme authors do not need it to register or use a Theme.
