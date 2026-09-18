# How TeX rendering works in AzeForge

AzeForge treats an `.aze.md` file as source code for a document. The general flow is:

```text
aze.md source
    -> parser
    -> validated semantic Document
    -> math and figure renderers
    -> HTML, SVG, PNG, or PDF Artifact
```

There are two different meanings of "TeX" in AzeForge:

1. Native mathematical notation, such as an equation.
2. An explicit `tex` Technical object, where the author writes TeX commands for drawings, plots, circuits, or chemical structures.

These paths use different renderers.

## Native equations

For ordinary equations, authors usually write AzeForge's readable math notation rather than raw LaTeX.

Example:

```text
:::: equation
id: decay
number: true
----
y = y_0 * e^(-k * t)
::::
```

### Components

#### The AzeMark parser

The parser reads the `.aze.md` file and recognizes Markdown paragraphs, headings, lists, equations, diagrams, tables, and other typed Blocks. An equation becomes an internal `EquationBlock`.

The source does not go straight to KaTeX. AzeForge first understands and validates the equation.

#### The native math parser

`src/math.ts` contains AzeForge's mathematics grammar. It converts readable notation into a semantic tree, roughly like this:

```text
y = y₀ * e^(-k * t)
```

becomes a tree containing concepts such as an equality, multiplication, exponent, and identifiers.

The semantic tree lets AzeForge validate notation itself. Unsupported notation produces a diagnostic instead of being silently passed to a renderer. The tree also supports canonical formatting, stable document identity, deterministic output, and renderer-specific output later.

#### Tree-to-TeX conversion

After validation, AzeForge converts the math tree into renderer-oriented TeX. For example, readable input may become something similar to:

```tex
y = y_0 \\cdot e^{-k \\cdot t}
```

The compiler generates this TeX. The author does not need to write it.

The key rule is that TeX is a derived rendering format, not the source representation of native mathematics.

#### KaTeX

AzeForge uses the pinned KaTeX package, version `0.18.5`.

KaTeX receives the generated TeX and produces HTML containing visual HTML elements and MathML for accessibility and screen readers. The renderer uses display mode, emits both HTML and MathML, and sets `trust: false` so unsafe TeX features stay disabled.

#### Sanitization

AzeForge sanitizes the KaTeX HTML. If the result contains executable markup or unsafe URLs, AzeForge fails closed instead of trying to repair the result silently.

#### Embedded CSS and fonts

The final HTML includes KaTeX CSS. AzeForge replaces KaTeX font references with embedded font data, so the Artifact does not need to download KaTeX fonts from the network.

### Native equation flow

```text
Readable equation in aze.md
        -> AzeMark parser
        -> native math parser
        -> semantic math tree
        -> deterministic tree-to-TeX conversion
        -> pinned KaTeX
        -> sanitized HTML and MathML
        -> embedded in the final Artifact
```

This path is used for `equation` Blocks, `derivation` Blocks, mathematical cells in typed tables, and other native math-capable Blocks.

## Explicit `tex` Blocks

AzeForge also supports a special Block named `tex`. It is an advanced escape hatch for author-supplied TeX commands.

Example:

```text
:::: tex
id: triangle
title: Triangle figure
description: A triangle drawn with three connected line segments
profile: tikz
----
\\draw (0,0) -- (1,1) -- (2,0) -- cycle;
::::
```

The `tex` Block supports these profiles:

- `circuitikz` for circuits
- `tikz` for custom vector figures
- `pgfplots` for technical plots
- `chemfig` for chemical structures
- `tikz-cd` for commutative diagrams

### Components

#### The `tex` Block validator

`src/tex.ts` validates the Block. It requires:

- `title`
- `description`
- a supported `profile`

It also checks that:

- the body is not empty
- the body is no longer than 50,000 characters
- the body contains only printable ASCII, tabs, and newlines
- document and package declarations are absent
- file access commands are absent
- shell escape is absent
- font manipulation commands are absent

The author supplies the drawing body, but not the document wrapper or package setup.

#### The profile-owned preamble

The trusted renderer supplies the surrounding TeX document. For a TikZ body, it effectively creates something like this:

```tex
\\documentclass{article}
\\def\\pgfsysdriver{pgfsys-dvisvgm.def}
\\usepackage{tikz}
\\pagestyle{empty}
\\begin{document}
\\begin{tikzpicture}
...author's body...
\\end{tikzpicture}
\\end{document}
```

The body runs inside a controlled environment. The author cannot choose arbitrary packages or declare an arbitrary document.

#### TeX Live

The TeX renderer uses a pinned TeX Live installation. The image contains only the approved packages needed by the supported profiles, including TikZ, CircuitikZ, PGFPlots, Chemfig, TikZ-CD, DVI-to-SVG support, and the required fonts and supporting packages.

The TeX compiler produces DVI output.

#### `dvisvgm`

`dvisvgm` converts the DVI output to SVG. The renderer uses settings that avoid external font dependencies. The SVG is returned to AzeForge.

#### SVG validation and accessibility metadata

AzeForge checks that the returned SVG is safe and well-formed. It then adds accessibility metadata:

```html
<title>Triangle figure</title>
<desc>A triangle drawn with three connected line segments</desc>
```

The SVG is wrapped in a figure element:

```html
<figure class="aze-tex" data-tex-profile="tikz">
  ...SVG...
</figure>
```

The `title` and `description` provide accessibility metadata. They are not visible captions. Use a `figure` wrapper when visible captions or figure numbering are required.

### Explicit TeX flow

```text
tex Block in aze.md
        -> AzeMark parser
        -> TeX Block validation
        -> compiler writes one batch request for the invocation
        -> trusted TeX renderer command
        -> profile-owned TeX document per figure
        -> TeX Live and latex
        -> DVI
        -> dvisvgm
        -> raw dvisvgm SVG per figure
        -> one batch response
        -> canonical projection (parse, validate, namespace, re-serialize)
        -> embedded unchanged in the final Artifact
```

## Canonical projection

The renderer's raw `dvisvgm` SVG is never embedded directly. The compiler
parses the returned document and re-serializes exactly one canonical
projection. It refuses malformed XML, a DOCTYPE, unsafe elements, an internal
`<style>` element whose selectors the namespace rewrite cannot follow,
event-handler attributes, external references and `@import`, a figure without
the SVG namespace or finite bounded geometry, and any `#id`/`url(#id)`
reference to an identifier the figure does not declare. A refusal is reported
as `azeforge.tex#protocol-invalid` and suppresses the whole Artifact rather
than publishing a partial figure.

The projection prefixes every identifier and rewrites every reference with the
figure's zero-based batch index (`tex-<index>-`), removes comments, metadata,
and formatting whitespace, fixes attribute order and XML escaping, and
quantizes generated numbers to six decimals without touching authored text. It
then injects the authored `title` and `description` as the root's accessible
`<title>` and `<desc>`, sets `role="img"`, and wraps the result in
`<figure class="aze-tex" data-tex-profile="…">`.

The projection is frozen as `TEX_SVG_NORMALIZER_VERSION`
(`azeforge.tex-svg-normalizer/v1`), matching the sealed renderer manifest's
`normalizer.version`. This one validated SVG is embedded unchanged in the HTML
layout, and the whole-document SVG, PNG, and PDF Artifacts all derive from that
same layout — TeX runs once per compilation and never once per format.

## How the compiler connects the pieces

The compiler in `src/compiler.ts` coordinates the process:

1. It parses the `.aze.md` source.
2. It validates the whole Document.
3. It finds every renderable Block.
4. It renders each family with its own renderer.
5. It stops if validation or rendering produces an error.
6. It assembles the rendered fragments into the final HTML layout.
7. It embeds CSS, fonts, figures, links, numbering, accessibility metadata, and dependency fingerprints.
8. It produces the requested Artifact format.

For `tex` Blocks, the compiler finds every Block, checks that a renderer is
configured, spawns the configured fixed-argv command once for the whole
compiler invocation, writes one batch request on its standard input, and reads
one batch response. It validates each returned SVG, stores it against its
Block, and gives the resulting map to the HTML renderer. A failed figure or a
malformed response suppresses the whole Artifact.

The configured renderer is a deployment-owned command:

```ts
createCompiler({
  texRenderer: {
    rendererIdentity: "sha256:<64 hex>", // SHA-256 of the release manifest
    command: "docker",                    // resolved from deployment config
    args: ["run", "--rm", "-i", "..."],   // fixed argv
  },
});
```

`command` and `args` come from deployment configuration only. Author Source
never contributes an executable, an argv entry, a path, or a limit setting. The
compiler enforces the batch limits: a 1 MiB request, an 8 MiB response, and a
15-second wall-clock deadline (`texRenderTimeoutMs`, which hosts may only
lower). A missing TeX renderer is an error. AzeForge does not omit the figure,
insert a blank placeholder, fall back to another renderer, or continue
silently.

## Local development

### Files containing only native equations

For native equations, the regular AzeForge installation is enough:

```text
Node.js
AzeForge package
KaTeX dependency
```

KaTeX is bundled as an npm dependency. No TeX Live installation is needed.

Example:

```bash
azeforge render equation.aze.md --output equation.html
```

### Files containing explicit `tex` Blocks

A file containing a `tex` Block needs a trusted `TexRenderer`: a
deployment-configured fixed-argv command plus the manifest SHA-256 as
`rendererIdentity`. For local authoring, use the reviewed local wrapper:

```bash
node scripts/tex-local-render.mjs \
  --source report.aze.md \
  --output report.html \
  --image aze-forge-tex-renderer:local \
  --renderer-manifest /tmp/tex-local.manifest.json
```

The wrapper hashes the manifest for `rendererIdentity`, passes it to the
container as `AZEFORGE_TEX_RENDERER_IDENTITY`, and starts the fixed-argv
renderer container once for the whole compilation. It writes the
`azeforge.tex-renderer/v1` batch request on the container's standard input and
reads one batch response on standard output. The image entrypoint, not the
compiler or wrapper, owns the private workspace, builds each profile-owned
preamble, and invokes `latex` then `dvisvgm` per figure.

The Docker invocation has no network, a read-only root filesystem, a 64 MiB
temporary workspace, dropped capabilities, `no-new-privileges`, one CPU,
512 MiB memory, 64 processes, and a 15-second wall clock. Local output is
always noncanonical. Use `scripts/tex-canonical-render.mjs` with
`docker.io/kkumaresan/aze-forge-tex-renderer@sha256:befbadc886338638d5b2e6ac4e564a95c62bd47822f1118b226dee02deffad56`
and the sealed release manifest for CI or server compilation.

The container has temporary writable storage only.

The local Docker image must first be built from `Dockerfile.tex-renderer`. That image targets Linux/amd64, so Docker may need to emulate amd64 on Apple Silicon.

A locally installed TeX distribution may produce different SVG after package or font updates. Use the pinned renderer when output reproducibility matters.

## Deployment

Production should not let web requests execute a host TeX installation directly.

The recommended arrangement is:

```text
Web app or API
      -> compilation worker
      -> pinned TeX-renderer container or short-lived job
      -> SVG returned to compiler
      -> final Artifact served to the user
```

The browser must never run TeX. A browser client may submit an `.aze.md` file, but the trusted server-side compilation path must handle TeX rendering.

### Production components

#### AzeForge compiler

This performs parsing, validation, native math rendering, and final Artifact assembly.

#### TeX renderer service or job

This runs the pinned TeX Live environment and converts TeX to SVG. It can be a sidecar container, a container launched by a worker, a short-lived container per compilation, or an internal renderer service.

#### Pinned renderer identity

The renderer must provide a SHA-256 identity based on its immutable release manifest. AzeForge includes this identity in the rendering fingerprint.

This matters because changing TeX Live, package versions, fonts, `dvisvgm`, or profile preambles can change the SVG even when the `.aze.md` source stays the same.

The Document content hash describes authored content. The renderer identity describes the rendering environment.

## Production security requirements

The renderer container must have:

- shell escape disabled
- no network access
- no host filesystem mounts
- a temporary workspace only
- CPU limits
- memory limits
- a wall-clock timeout
- an output-size limit
- only the approved TeX packages
- pinned TeX Live, package, font, and SVG conversion versions
- a read-only TeX installation

The repository's renderer image removes package-management tools from the runtime image and makes the TeX tree read-only.

These controls prevent an input document from installing packages, downloading files, reading host files, writing arbitrary files, executing shell commands, selecting arbitrary fonts, or escaping the temporary workspace.

If the configured renderer is unavailable, compilation of a document containing a `tex` Block must fail with an actionable diagnostic. It must not fall back to another renderer or omit the object.

## Local and deployed behavior

| Concern | Local development | Production deployment |
|---|---|---|
| Native equations | In-process KaTeX | In-process KaTeX in the compiler worker |
| Explicit `tex` Blocks | Docker renderer or trusted local renderer | Pinned isolated renderer container or job |
| Browser involvement | None required | Browser never runs TeX |
| Network | Docker renderer uses no network | Renderer must use no network |
| Renderer versions | May use a local image | Must use a sealed pinned release |
| Reproducibility | Local package updates can change output | Manifest, packages, fonts, and tools are pinned |
| Failure behavior | Diagnostic if the renderer is missing or fails | Compilation fails with an actionable diagnostic |
| Output | HTML, SVG, PNG, or PDF | HTML, SVG, PNG, or PDF |
| Security | Local machine trust boundary | Container and resource isolation are required |

## Simple mental model

Think of AzeForge as having two printers.

### The KaTeX printer

For ordinary equations:

```text
AzeForge math notation -> math tree -> generated TeX -> KaTeX HTML and MathML
```

This printer runs inside the Node.js application.

### The TeX drawing printer

For explicit `tex` Blocks:

```text
TeX body -> isolated TeX Live -> DVI -> dvisvgm -> SVG
```

This printer runs outside the main compiler and should run in a locked-down container.

Both printers return a rendered fragment to the same document composer. The composer places the fragment into the final AzeForge Artifact.
