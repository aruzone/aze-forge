---
azemark: 2
title: Document basics
author:
  - AzeForge examples
theme: default
outputs:
  - html
---

# Document basics

This document is the entry point to AzeMark. It demonstrates the ordinary
prose surfaces, front matter, headings and paragraphs, inline text, lists,
code, links, quotes, pipe tables and callouts, and shows how each one
composes around the native directives. The examples follow one bench
measurement campaign, so the prose reads as a technical narrative instead of
a syntax list.

## Front matter

Front matter is a YAML mapping between the `---` delimiters at the top of the
Source. It is optional in the language, and every document in this library
opens with it. `azemark: 2` selects the language version and becomes required
as soon as the document carries a directive; `title` and `author` carry
document identity; `theme`, `outputs`, `defaults` and `citation-style` are the
remaining known keys, and a key outside that set must be an `x-` extension.

The smallest usable envelope declares the version and nothing else, which is
enough for a document without directives.

```yaml
---
azemark: 2
---
```

A working report adds the identity keys, the render targets and the citation
style, so the same source reproduces the same artifacts.

```yaml
---
azemark: 2
title: Thermal conductivity of drawn aluminum
author:
  - AzeForge examples
theme: academic
outputs:
  - html
  - pdf
citation-style: author-year
---
```

A diagram-free bench note needs no key beyond the version and one private
extension, which the compiler carries through into document metadata
unchanged.

```yaml
---
azemark: 2
x-measurement-log: bench-4
---

# Bench note

The bar reached steady state after 40 min.
```

## Headings and paragraphs

Headings are ATX, one to six `#` characters followed by the text, or Setext,
where a line of `=` under a paragraph marks a level-one heading and a line of
`-` marks a level-two heading. Paragraphs separate on a blank line. A line
break inside a paragraph collapses to a space unless the line ends with two
spaces or a backslash.

Three ATX levels are enough to outline a procedure, and each level nests
inside the one above it.

### Instrument check

Record the ambient temperature before the first run of the day.

#### Probe placement

Seat the probe at one third of the bar length, measured from the hot end.

#### Thermal contact

Coat the probe tip with the compound used on the reference bar.

A Setext underline declares the same two heading levels ATX does, which keeps
long documents readable in raw source.

Steady-state criterion
----------------------

A run is complete when two readings taken 60 s apart agree to within 1%.

Drift correction
----------------

Correct every reading by the drift measured on the unloaded reference bar.

A two-space or backslash line ending becomes a hard break, so the next line
stays on its own row in the rendered paragraph.

Run A1 ended with two spaces  
so this line stays on its own row.

Run A2 used a backslash\
and this line stays on its own row as well.

## Inline emphasis and code

Emphasis and strong text use `*` or `_` as matched delimiters, and an
underscore inside a word is left as written. Backticks mark an inline code
span, and a backslash escapes the punctuation that would otherwise carry
meaning.

Emphasis marks the corrected reading and strong text marks the value the
operator must transcribe.

The *drift-corrected* reading for run A1 is **344.2 K**, and the _reference_
bar holds **295.1 K** throughout.

A code span takes the shortest run of backticks that encloses it, so a span
holding a backtick uses two delimiters.

Evaluate `T = 21.4 + 0.98 * raw` once per channel, and read the literal
`` `backtick` `` from the probe configuration file.

A backslash escapes punctuation, so a paragraph can discuss a delimiter
without opening a span.

Write \*emphasis\* and \_strong\_ as literals, and print the fence opener
\`\`\` without starting a code block.

## Lists

Lists use `-`, `*` or `+` for unordered items and `1.` for ordered items. A
child list or continuation paragraph indents by the width of the parent
marker, which is two spaces under `- ` and three spaces under `1. `.

An unordered list carries the steps of a short check with no defined order.

- record the ambient temperature
- clamp the bar at both ends
- start the heater at 40 W

An ordered list carries a procedure whose steps must replay in order, and each
step may open a nested list of its own.

1. Prepare the specimen
   - machine both faces flat
   - clean the faces with acetone
2. Mount the thermocouples
   - hot end 20 mm from the heater
   - cold end 20 mm from the sink
3. Run the steady-state sweep

Items hold the same inline content as paragraphs, including code spans and
safe links.

- read the gradient from the two inner thermocouples
- convert each reading with `T = 295.1 + 0.98 * raw`
- record the run in the bench log, written as a relative target `[bench log](methods/bench-log.md)`
- keep the raw trace until the report is signed off

## Code blocks

A fenced code block opens with three or more backticks or tildes and an
optional language tag. The tag names the language for the rendered class and
never changes the content.

A language tag marks the block for syntax-aware styling while the body stays
verbatim.

```python
def conductance(power, length, area, gradient):
    """Return the mean conductivity in W/(m K)."""
    return power * length / (area * gradient)
```

Angle-bracket text inside a fence is text. The renderer escapes the body, so
a markup sample never becomes markup.

```html
<figure class="sheet">
  <div class="caption">Bar mount, plan view</div>
</figure>
```

A longer fence delimits a sample that itself contains a fence, which is how a
Markdown example is written inside Markdown documentation.

````text
```yaml
azemark: 2
title: Nested sample
```
````

## Links

An inline link carries a destination and an optional title, and an autolink
wraps a bare URL in angle brackets. The compiler accepts `http:`, `https:`,
`mailto:`, `#fragment` and relative targets. A `javascript:` target is refused
with an error instead of being rewritten into an accepted form.

A titled inline link records where a value came from.

The reference value follows [the published data sheet](https://example.com/thermal-conductivity "Reference data sheet, 2026 edition").

An autolink renders the URL as its own label, which suits a bare citation of
an address.

The instrument firmware is published at <https://example.com/instruments/tc-4/firmware>.

A relative target resolves against the document it sits in and is written
`[method note](methods/thermal-conductivity.md)`, while a fragment target
addresses a Block id authored in the same document.

The shortcut to the steady-state definition appears under [the steady-state note](#steady-state-note).

## Blockquotes and thematic breaks

A thematic break is a line of three or more `-`, `*` or `_` characters, and it
separates two paragraphs at the same level. A blockquote prefixes its lines
with `>` and nests every other content form, including lists, code fences and
further quotes.

A thematic break closes the first sweep and opens the second on equal
footing.

The first sweep held the reference bar at 295.1 K for eleven runs.

---

The second sweep repeated every position after the heater was replaced.

A blockquote sets quoted material apart, and it nests a list and a further
quote without any change in syntax.

> The sink stayed within 0.2 K of setpoint for the whole run:
>
> - inlet at 295.4 K
> - outlet at 295.6 K
>
> The next run will use a colder sink.
>
> > A colder sink shortens the time to steady state.

A blockquote also holds a code fence, which is how a verbatim log is quoted
inside prose.

> The calibration log carries one line per run:
>
> ```text
> 2026-04-02  ambient 295.1 K  heater 40 W
> 2026-04-03  ambient 295.3 K  heater 60 W
> ```

## Pipe tables

A GFM pipe table is a header row, a delimiter row and zero or more body rows.
The delimiter row fixes each column's alignment: `:--` left, `--:` right and
`:-:` center.

A plain pipe table lists the runs of the campaign in document order.

| Run | Material | Gradient (K/m) | Conductivity (W/(m K)) |
| --- | --- | --- | --- |
| A1 | Aluminum | 41.2 | 205 |
| A2 | Aluminum | 40.8 | 207 |
| S1 | Steel | 162.5 | 50.2 |

Alignment markers right-align numeric columns and center the acceptance flag,
which keeps a wide table readable.

| Trial | Reading (K) | Drift (K) | Accepted |
| :--- | ---: | ---: | :---: |
| 1 | 344.2 | 0.02 | yes |
| 2 | 344.5 | -0.01 | yes |
| 3 | 344.4 | 0.05 | no |

Cells hold inline content, so a table can name a command and link to the
procedure that explains it.

| Stage | Command | Reference |
| :--- | :--- | :--- |
| fit | `least-squares fit` | slope and intercept |
| check | `residual < 1%` | [steady state](#steady-state-note) |

## Callouts

Callouts are `:::: callout` directives with a closed variant set of `note`,
`tip`, `important`, `warning` and `caution`, plus an optional title. The body
is ordinary Markdown and may nest supported directives.

A note records context the reader needs but that does not change the
procedure.

:::: callout
id: steady-state-note
variant: note
title: Steady state
----
A run is complete when two readings taken 60 s apart agree to within 1%.
::::

A warning marks a condition that invalidates a run if it is ignored.

:::: callout
id: probe-drift
variant: warning
title: Probe drift
----
The reference bar drifts after 30 minutes of continuous heating. Re-zero the
probe whenever the reference reading moves by more than 0.05 K.

- re-zero before every sweep
- discard a run whose drift exceeds 0.1 K
- note the drift in the run table
::::

A tip carries a shortcut together with the nested mathematics and the list
that bound its use.

:::: callout
id: conductivity-shortcut
variant: tip
title: Shortcut for the gradient
----
In steady state the gradient follows from the two inner thermocouples alone.

  :: equation
  id: two-point-gradient
  ----
  dT / dx = (T_2 - T_1) / (x_2 - x_1)
  ::

- `T_1` and `T_2` are the inner thermocouple readings
- `x_2 - x_1` is 120 mm on the long bar
- the shortcut fails once the heater power changes
::::
