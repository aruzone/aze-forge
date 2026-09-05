# AzeForge Product and Engineering Blueprint

Status: Approved direction v0.2; remaining details are non-blocking  
Product name: AzeForge  
Source-language name: AzeMark  
Organization: aruzone  
Repository visibility and license: public, MIT  
Primary implementation: Node.js and TypeScript  
Primary delivery: deterministic CLI and reusable compiler library; browser and MCP integrations follow the CLI

## 1. Executive summary

AzeForge is a source-first technical publishing compiler. A user, an LLM, or another application provides a readable Markdown-style document containing ordinary prose plus structured blocks for equations, diagrams, plots, tables, chemistry, geometry, circuits, and other technical objects. AzeForge validates that source and deterministically renders shareable output such as HTML, SVG, PNG, and PDF.

The product is broader than an exam-paper generator. Exams, lecture notes, handouts, research reports, technical specifications, presentations, posters, formula cards, manuals, and web documents are templates and use cases built on the same document model.

The core compiler must not require an LLM. AI is an optional interpretation layer that converts free-form human instructions into editable AzeMark source. When AzeForge is invoked by ChatGPT, Claude, Codex, or another agent harness, the host LLM already provides this interpretation and AzeForge only needs to validate and render.

The initial product should follow the Mermaid model:

~~~text
Readable source
    -> deterministic compiler
    -> rendered artifact
~~~

The architecture must eventually allow the same compiler to be called through:

- a Node.js API;
- a command-line interface;
- a local or remote MCP server;
- a Markdown plugin;
- a VS Code extension;
- a browser editor;
- a hosted rendering API.

## 2. Product vision

### Vision statement

Write what you mean. Produce a polished technical document that can be shared anywhere.

### Product category

Semantic technical publishing compiler.

### Core promise

Users should be able to create sophisticated, technically accurate documents without first learning LaTeX, TikZ, KaTeX, Mermaid, or another renderer-specific language.

### Positioning

AzeForge occupies the space between:

- Overleaf and Typst, which are powerful but require markup knowledge;
- Gamma and Canva, which simplify visual creation but are not notation-first technical compilers;
- Mathpix and Equatio, which simplify technical input but are not general semantic publishing systems;
- Quarto and MyST, which provide strong multi-format technical publishing but remain authoring-language-first;
- worksheet generators, which are education-specific and commonly focus on content generation rather than deterministic source compilation.

The differentiator is the combination of readable semantic source, technically capable object renderers, deterministic builds, and agent-friendly interfaces.

## 3. Problem statement

Teachers, professors, researchers, engineers, and technical communicators regularly need documents containing equations, matrices, plots, diagrams, circuits, reactions, code, tables, citations, and other complex objects. Current choices force them to learn specialist syntax, use cumbersome visual editors, move content between multiple applications, or trust an AI system that may rewrite or misinterpret their material.

The result is wasted formatting time, inconsistent output, poor reproducibility, broken exports, and difficulty converting the same content into different shareable forms.

AzeForge should make technical document production:

- readable;
- reproducible;
- automatable;
- inspectable;
- multi-format;
- compatible with AI agents;
- usable without AI.

## 4. Target users

### Primary early adopters

- A university pilot group using AzeForge for engineering courses.
- Developers and technically comfortable educators who are willing to use a CLI.
- Professors and researchers who already use Markdown, Git, notebooks, or LaTeX.
- AI-agent users who want a reliable rendering tool available to ChatGPT, Claude, Codex, or similar harnesses.
- Technical content creators who need equations and diagrams embedded in shareable documents.

### Secondary users

- Schoolteachers using a future browser editor.
- Engineers producing reports, specifications, diagrams, and documentation.
- Publishers creating reusable technical templates.
- Institutions requiring standardized branding and reproducible document builds.
- LMS, documentation, and collaboration platforms integrating through an API or MCP.

## 5. Supported use cases

AzeForge is intended to support:

- lecture notes;
- classroom handouts;
- assignments and examinations;
- worked examples and tutorials;
- formula and reference sheets;
- research papers and preprints;
- laboratory reports and manuals;
- engineering reports and specifications;
- standard operating procedures;
- technical documentation;
- white papers;
- mathematical proofs;
- scientific posters;
- presentation slides;
- textbooks and course modules;
- project reports;
- technical blog posts;
- shareable equation or diagram images;
- interactive or responsive web documents.

## 6. Goals

### User goals

1. A new user can render a useful document within five minutes.
2. A user can understand and edit generated source without learning a complex language.
3. The same valid source produces reproducible output.
4. The same source can target more than one output format.
5. Errors identify the affected source line and suggest a correction.
6. AI-generated source is always visible and editable before final publication.

### Product goals

1. Establish a stable semantic document schema independent of rendering backends.
2. Provide a CLI suitable for humans, scripts, CI, and agent harnesses.
3. Make domain capabilities extensible through plugins.
4. Keep the base compiler model-free, offline-capable, and deterministic.
5. Validate the product with a university engineering-course pilot.

## 7. Non-goals for the first release

- A full visual word processor.
- Real-time multi-user collaboration.
- Arbitrary natural-language understanding inside the base compiler.
- Generating or solving academic content automatically.
- Replacing CAD, SPICE, GeoGebra, Mathematica, or chemical simulation tools.
- Supporting every LaTeX package.
- Pixel-perfect parity between all output backends.
- Arbitrary user-supplied executable code.
- Hosting and account management.
- A complete presentation or poster editor.

These may become separate layers or future integrations.

## 8. Finalized product decisions

The following decisions were established during discovery:

1. The product is not limited to examinations or education.
2. The initial implementation should be a Node.js CLI comparable to Mermaid CLI.
3. The compiler core must be independent from the CLI.
4. A browser application is optional and should later wrap the same compiler.
5. The source should be readable Markdown plus typed blocks.
6. Users should not be required to know the full source language.
7. Raw LaTeX and other backend-specific languages should be escape hatches, not the default interface.
8. The compiler must not embed an LLM or require network access.
9. AI interpretation must be an optional provider layer.
10. Rendering must remain deterministic after source has been produced.
11. AzeForge should expose an MCP server for ChatGPT, Claude, Codex, and other compatible harnesses.
12. Host applications may display static artifacts or an optional MCP App UI.
13. Model weights must not be bundled into the main npm package or binary.
14. If managed local models are added later, they should be downloaded separately, checksummed, licensed, versioned, and removable.
15. The semantic AST is the source of truth between parsing and rendering.
16. Rendering backends must be replaceable adapters.
17. Domain features such as chemistry, geometry, circuits, and plotting should be plugins.
18. AzeForge, AzeMark, and .aze.md are the approved working naming system.
19. The repository will be public and the project will use the MIT license.
20. P0 must render HTML, SVG, PNG, and PDF.
21. The CLI ships first; a browser application and MCP integration are deferred until after the CLI.
22. The first golden document is a technical report containing equations, tables, and a diagram.
23. The first external pilot is a university group using AzeForge for engineering courses.

### Licensing and future business model

The compiler, CLI, source language, and built-in P0 blocks will be public under the MIT license. A future business model must not be required to validate the CLI thesis. Potential paid layers can be considered later without weakening the open CLI:

- managed LLM interpretation and document assistance;
- hosted rendering and collaboration;
- institutional templates, governance, and private plugin registries;
- managed storage, audit history, and integrations;
- support, training, and service-level agreements.

Any future AI feature must remain optional, identify the provider and data path, and preserve the ability to compile deterministically without an LLM.

## 9. Naming recommendation

### Why not DocForge

DocForge has substantial existing usage. Current examples include:

- [gardener/docforge](https://github.com/gardener/docforge), a documentation-as-code CLI;
- [@precisionutilityguild/docforge](https://www.npmjs.com/package/%40precisionutilityguild/docforge), an existing npm-published Typst-based document-production MCP server;
- several document conversion and AI document applications;
- [docforge.app](https://docforge.app/).

The overlap is close enough to cause search, package, product, and user confusion. The working name should be changed before publishing.

### Recommended naming system

- Product: AzeForge
- CLI executable: azeforge
- Short CLI alias: azf, if available
- Source language: AzeMark
- Default source extension: .aze.md
- Structured AST MIME type: application/vnd.azeforge.document+json
- Source MIME type: text/x-azemark
- GitHub repository: aruzone/aze-forge
- npm package scope: @aruzone

Suggested packages:

~~~text
@aruzone/aze-core
@aruzone/aze-cli
@aruzone/aze-mcp
@aruzone/aze-render-html
@aruzone/aze-render-pdf
@aruzone/aze-block-math
@aruzone/aze-block-mermaid
@aruzone/aze-ai
~~~

This connects naturally to the existing aze-mini repository while retaining the forge metaphor.

### Alternate names

1. AzeForge
   - Strongest recommendation.
   - Communicates compilation and transformation.
   - Fits aze-mini and the aruzone organization.

2. AzeMark
   - Excellent name for the language.
   - Could also be the product if markup authoring becomes the central identity.

3. AzeDoc
   - Clear and approachable.
   - More generic and less distinctive.

4. AruForge
   - Strong connection to aruzone.
   - Slightly less consistent with aze-mini.

5. AzePress
   - Good for publishing.
   - May imply print or editorial workflows more than rendering.

6. AruPress
   - Friendly publishing identity.
   - Less descriptive of the compiler and agent use case.

7. AzeRender
   - Very clear for an engine.
   - Too narrow if authoring, validation, transformation, and publishing expand.

8. AzeType
   - Conveys typesetting.
   - Requires a more thorough collision and trademark search.

[AruType](https://arutype.com/) should be avoided because an established type foundry already uses that name.

This is only a preliminary web search, not trademark, domain, npm, or company-name clearance. Before release, check the relevant trademark registries, npm namespace, GitHub repository name, package-manager names, major domains, and social handles.

## 10. Authoring experience

AzeForge should support progressive disclosure.

### Level 1: ordinary Markdown

Users write headings, paragraphs, lists, links, tables, code, and images normally.

### Level 2: AzeMark blocks

Typed blocks describe equations, callouts, plots, diagrams, geometry, circuits, chemistry, and other semantic objects.

### Level 3: native escape hatches

Advanced users may include raw LaTeX, Mermaid, Graphviz, TikZ, HTML, or another supported backend language.

### Interaction modes

Nontechnical users may:

- describe the document to an LLM;
- use templates or a guided editor;
- insert blocks through editor controls;
- inspect source only when desired.

Intermediate users may edit generated source directly.

Advanced users may author source, version it with Git, and automate compilation.

## 11. AzeMark source format

### File structure

A source file is Markdown with optional YAML front matter and typed directive blocks.

~~~text
---
azemark: 1
title: Introduction to Fourier Transforms
author: Dr. Sharma
theme: academic
outputs:
  - html
  - pdf
---

# Definition

The Fourier transform converts a time-domain function into its
frequency-domain representation.

::: equation
F(omega) =
  integral t=-infinity..infinity of
  f(t) exp(-i omega t) dt
:::

::: note
The transform describes which frequencies are present in a signal.
:::
~~~

### Design principles

- The common case must be understandable without documentation.
- Markdown remains valid and useful on its own.
- Block delimiters must be easy for parsers and humans to identify.
- Attributes are optional unless required by the block type.
- Renderer-specific details must not leak into ordinary semantic blocks.
- The same source must parse into a versioned AST.
- Source versions must be explicit and migratable.
- Diagnostics must use document vocabulary, not parser internals.

### Initial block syntax

#### Equation

~~~text
::: equation
I_n(alpha, beta) =
  integral x=0..infinity of
  x^n exp(-alpha x^2) / sqrt(1 + beta x^2) dx
:::
~~~

Optional properties:

~~~text
::: equation
id: gaussian-integral
number: true
align: center

integral x=-infinity..infinity of exp(-x^2) dx = sqrt(pi)
:::
~~~

#### Plot

~~~text
::: plot
functions:
  y1 = sin(x)
  y2 = cos(x)

x-range: -2pi..2pi
x-label: Angle
y-label: Amplitude
grid: true
legend: true
:::
~~~

#### Geometry

~~~text
::: geometry
triangle ABC
AB = 5cm
AC = 5cm
angle BAC = 60deg
midpoint D of BC

show:
  labels
  measurements
  equal-side-marks
:::
~~~

#### Circuit

~~~text
::: circuit
voltage-source V1 = 12V
resistor R1 = 1kohm
resistor R2 = 2kohm

connect:
  V1.positive -> R1 -> R2 -> V1.negative
:::
~~~

#### Chemistry

~~~text
::: chemistry
reaction:
  H2SO4 + 2NaOH -> Na2SO4 + 2H2O
:::
~~~

#### Flowchart

~~~text
::: flowchart
Start -> Read input
Read input -> Validate
Validate -> Render when valid
Validate -> Show errors when invalid
Render -> Export
:::
~~~

#### Callout

~~~text
::: warning
Do not confuse mass with weight.
:::
~~~

#### Raw LaTeX

~~~text
::: latex
\begin{align}
\nabla \times \mathbf{E}
  &= -\frac{\partial\mathbf{B}}{\partial t}
\end{align}
:::
~~~

Raw backend blocks must be disabled or sandboxed by default when source is untrusted.

## 12. Mathematical input language

The default equation language should support readable ASCII aliases:

~~~text
alpha              -> α
beta               -> β
infinity           -> ∞
sqrt(x)             -> square root
sum i=1..n of expr  -> summation
integral x=0..1 of expr dx
limit x->0 of expr
matrix [[a,b],[c,d]]
partial f / partial x
~~~

The parser should support:

- named Greek letters;
- superscripts using caret syntax;
- subscripts using underscore syntax;
- common functions;
- fractions;
- roots;
- limits;
- sums and products;
- integrals;
- derivatives and partial derivatives;
- matrices;
- cases;
- relations and set notation.

Unicode input may also be accepted.

Raw LaTeX remains an escape hatch for notation not covered by the initial grammar.

## 13. Diagnostics

Diagnostics are a first-class product feature.

Bad:

~~~text
Unexpected token at offset 31
~~~

Required:

~~~text
lecture.aze.md:18:3

The integral is missing an integration variable.

Did you mean:

  integral x=0..infinity of x^2 dx
~~~

Each diagnostic should contain:

- stable diagnostic code;
- severity;
- source file;
- start and end position;
- human-readable message;
- optional suggestion;
- optional machine-applicable fix;
- related locations where appropriate.

The CLI must support human and JSON diagnostic formats.

## 14. High-level architecture

~~~text
Source file or stdin
        |
        v
Markdown and directive parser
        |
        v
Versioned semantic AST
        |
        +--> schema validation
        +--> reference validation
        +--> block-plugin validation
        |
        v
Transformation pipeline
        |
        +--> theme resolution
        +--> numbering and references
        +--> backend-independent layout hints
        |
        v
Renderer adapter
        |
        +--> HTML
        +--> SVG
        +--> PNG
        +--> PDF
        +--> LaTeX source
        +--> future Typst source
~~~

### Architectural boundaries

1. Core
   - Source parsing.
   - AST types and JSON Schema.
   - Validation.
   - Diagnostics.
   - Reference resolution.
   - Transformation pipeline.
   - Plugin registry.

2. Block plugins
   - Parse block-specific content.
   - Validate block-specific semantics.
   - Produce backend-neutral render models where practical.
   - Render or delegate to a renderer.

3. Renderers
   - Convert the semantic model into a target artifact.
   - Must not reinterpret user intent.

4. CLI
   - File and stdin handling.
   - Configuration.
   - command dispatch.
   - progress and diagnostics.

5. MCP
   - Post-CLI integration, not a P0 package.
   - Schema-described tools around core APIs.
   - Static artifact and optional MCP App UI responses.

6. AI adapters
   - Optional natural-language-to-AST interpretation.
   - Must not be imported by core.

## 15. Proposed repository structure

~~~text
aze-forge/
  package.json
  pnpm-workspace.yaml
  tsconfig.base.json
  README.md
  LICENSE
  docs/
    architecture.md
    azemark-language.md
    plugin-authoring.md
    security.md
    adr/
  examples/
    minimal.aze.md
    engineering-report.aze.md
    circuits/                  # added for P0.5
  packages/
    core/
    cli/
    renderer-html/
    renderer-image/
    renderer-pdf/
    block-math/
    block-mermaid/
    block-code/
    block-callout/
    block-circuit/             # added for P0.5
  integrations/               # created only after CLI MVP
    mcp/
    ai/
  tests/
    fixtures/
    golden/
    integration/
~~~

Use the current supported Node.js LTS line and TypeScript. A reasonable compatibility floor at implementation time is Node.js 22 or newer, subject to confirmation before publishing.

## 16. Core API

The public API should be small and stable.

~~~typescript
type CompileOptions = {
  format: "html" | "svg" | "png" | "pdf";
  theme?: string;
  plugins?: string[];
  allowRaw?: boolean;
};

type Diagnostic = {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  file?: string;
  range?: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  suggestion?: string;
};

type CompileResult = {
  artifact?: Uint8Array | string;
  mimeType?: string;
  diagnostics: Diagnostic[];
  document?: AzeDocument;
  contentHash?: string;
};

parse(source, options): ParseResult
validate(document, options): Diagnostic[]
compile(sourceOrDocument, options): Promise<CompileResult>
format(source, options): FormatResult
~~~

The AST must be serializable and versioned.

## 17. Plugin contract

A block plugin should declare:

- unique type name;
- version;
- source schema;
- AST schema;
- validator;
- supported renderers;
- renderer or renderer adapter;
- security classification;
- capability description for LLMs.

Conceptual interface:

~~~typescript
interface AzeBlockPlugin<TBlock> {
  type: string;
  version: string;
  schema: object;

  parse(input: BlockSource, context: ParseContext): TBlock;
  validate(block: TBlock, context: ValidationContext): Diagnostic[];
  render(
    block: TBlock,
    context: RenderContext
  ): Promise<RenderedBlock>;
}
~~~

Plugin failures must become diagnostics rather than crash the entire process.

## 18. CLI specification

### Executable

~~~text
azeforge
~~~

### P0 commands

~~~text
azeforge render
azeforge validate
azeforge watch
azeforge serve
azeforge format
azeforge capabilities
azeforge version
~~~

### Examples

~~~bash
azeforge render lesson.aze.md --output lesson.html
azeforge render lesson.aze.md --format png --output lesson.png
azeforge validate lesson.aze.md
azeforge validate lesson.aze.md --diagnostics json
azeforge watch lesson.aze.md
azeforge serve lesson.aze.md
azeforge capabilities --json
~~~

### Stdin support

~~~bash
cat lesson.aze.md |
  azeforge render --stdin --format svg --output lesson.svg
~~~

### CLI requirements

- stdout contains requested machine output only.
- stderr contains logs and human diagnostics.
- Binary stdout is supported only through an explicit flag.
- Exit code 0 means success without errors.
- Exit code 1 means validation or compilation failure.
- Exit code 2 means invalid CLI usage or configuration.
- JSON output schemas are versioned.
- Render is deterministic and performs no AI or network call.
- Offline mode prevents all network access.
- The CLI supports a quiet mode for agent harnesses.

## 19. Output strategy

### Initial targets

1. HTML
   - Primary document representation.
   - KaTeX for equations.
   - Sanitized SVG for diagrams.
   - CSS themes.

2. SVG
   - Best for individual fragments and diagrams.
   - Useful for embedding in presentations and web pages.
   - Whole-document output uses one continuous-layout SVG unless a page-output option is explicitly selected.

3. PNG
   - Universal preview format for chat applications.
   - Produced from HTML or SVG.
   - Whole-document output uses one continuous-layout image; paginated images are written as a numbered page set.

4. PDF
   - Produced initially from paged HTML using a controlled headless-browser renderer.

### Future targets

- LaTeX source;
- Typst source;
- DOCX;
- PPTX;
- EPUB;
- responsive hosted documents.

### Why HTML-first

- Reuses the Node.js ecosystem.
- KaTeX and Mermaid integrate naturally.
- Browser preview and PDF share a rendering path.
- MCP App UI can reuse the same components.
- Avoids requiring a TeX installation for the initial release.

Publication-grade LaTeX or Typst backends can be added after the source model and plugin boundaries stabilize.

## 20. Deferred MCP specification

This contract is preserved for post-CLI planning. Do not create or publish the MCP package until the CLI MVP and university pilot workflow have been evaluated. When scheduled, publish it as a separate package around the same core API.

### Suggested package

~~~text
@aruzone/aze-mcp
~~~

### Example local configuration

~~~json
{
  "mcpServers": {
    "azeforge": {
      "command": "npx",
      "args": ["-y", "@aruzone/aze-mcp"]
    }
  }
}
~~~

### First MCP-release tools

1. render_document
   - Input: source, output format, theme, optional safety flags.
   - Output: artifact plus metadata and diagnostics.

2. render_fragment
   - Input: one block or short source fragment.
   - Output: normally PNG or SVG.

3. validate_document
   - Input: source.
   - Output: structured diagnostics.

4. get_capabilities
   - Output: supported source version, blocks, formats, and limits.

5. get_language_guide
   - Output: concise syntax guidance suitable for an LLM.

### Result formats

- PNG returned as image content when supported.
- SVG or PDF returned as a resource or downloadable file.
- Structured content contains MIME type, dimensions, content hash, warnings, and source version.
- Tools remain useful without custom UI.

### Optional MCP App

An optional UI component may provide:

- paged document preview;
- zoom;
- source view;
- diagnostics;
- theme switching;
- download actions;
- follow-up edit requests.

The MCP server and UI must be separately deployable.

## 21. AI-provider strategy

### Principle

AI converts natural language to AzeMark or the semantic AST. It does not render.

~~~text
Human instructions
    -> optional interpretation provider
    -> editable AzeMark
    -> deterministic compiler
    -> artifact
~~~

### No model inside the binary

Do not bundle model weights into:

- the CLI binary;
- the base npm package;
- the MCP package.

Reasons:

- unnecessary when a host LLM is already present;
- package size;
- platform-specific inference dependencies;
- model-license risk;
- slow installation;
- independent compiler and model release cycles;
- users may prefer cloud, local, or no AI.

### Optional providers

~~~text
@aruzone/aze-ai-openai
@aruzone/aze-ai-anthropic
@aruzone/aze-ai-ollama
@aruzone/aze-ai-local
~~~

The provider must emit schema-constrained output and return confidence and warnings where possible.

### Future managed local models

If added, use:

~~~text
azeforge models list
azeforge models pull interpreter-small
azeforge models verify interpreter-small
azeforge models remove interpreter-small
~~~

Model packs must be:

- downloaded only with explicit consent;
- checksummed;
- independently versioned;
- accompanied by complete license notices;
- stored in the platform application-data or cache directory;
- removable;
- compatible with offline use after download.

## 22. Security requirements

### Source safety

- Treat all source as untrusted.
- Disable arbitrary shell execution.
- Disable TeX shell escape.
- Restrict filesystem reads to explicit project roots.
- Disable network access during render by default.
- Sanitize generated HTML and SVG.
- Apply content-security policy to interactive components.
- Place time, memory, recursion, file-size, and output-size limits on plugins.
- Reject path traversal.
- Do not allow plugins to escape their declared capability boundary.

### Remote rendering

- Run compilation in an isolated process or container.
- Use per-request temporary directories.
- Delete temporary artifacts after the retention window.
- Authenticate remote MCP and HTTP endpoints.
- Apply rate limits.
- Log diagnostic metadata, not private document content, by default.

### AI safety

- Never send source to an external provider without explicit configuration.
- Display which provider will receive content.
- Provide an offline mode.
- Preserve user text unless transformation was explicitly requested.
- Do not treat imported document content as system instructions.

## 23. P0 MVP scope

The first releasable CLI version must include:

1. TypeScript monorepo and package boundaries.
2. Markdown plus directive parser.
3. Versioned AST and JSON Schema.
4. Human and JSON diagnostics.
5. Blocks:
   - ordinary Markdown;
   - equation;
   - callout;
   - code;
   - Markdown table;
   - image;
   - Mermaid.
6. Basic readable math aliases plus raw LaTeX math.
7. HTML renderer.
8. SVG and PNG fragment output.
9. PDF from the HTML rendering path.
10. CLI commands:
    - render;
    - validate;
    - format;
    - capabilities;
    - watch;
    - serve.
11. Stdin and stdout support.
12. Themes:
    - default;
    - academic;
    - dark presentation.
13. Golden render tests.
14. One golden technical report containing:
    - prose and headings;
    - at least three equations;
    - a table with alignment and a caption;
    - one Mermaid diagram;
    - cross-format HTML, SVG/PNG preview, and PDF output.
15. A concise human language guide and a machine-readable capabilities manifest.
16. No required network connection and no embedded model.
17. A public MIT-licensed repository with CI on macOS, Linux, and Windows.

MCP, a browser editor, chemistry, geometry, and a general circuit system are not P0. This keeps the first vertical slice focused on proving the document compiler and all four output formats.

## 24. University engineering pilot extension (P0.5)

Circuit support should be included before the university pilot, but only after the P0 CLI and plugin boundary are stable. It is important enough to the pilot to test early, but too specialized and layout-heavy to put on the critical path of the first compiler build.

### P0.5 circuit scope

Ship a trusted built-in `circuit` plugin supporting common instructional schematics:

- DC and AC voltage/current sources;
- ground and named nodes;
- resistors, capacitors, and inductors;
- diodes and LEDs;
- switches;
- basic dependent sources;
- op-amps;
- basic BJT and MOSFET symbols;
- component references and values;
- voltage, current, and node labels;
- horizontal and vertical orientation;
- simple series, parallel, and branched topologies;
- SVG output that can be embedded consistently in HTML, PNG, and PDF.

The authoring form should describe circuit meaning, not renderer coordinates. An initial example:

~~~text
::: circuit
title: RC low-pass filter
direction: left-to-right

source V1 5 V from gnd to vin
resistor R1 1 kOhm from vin to vout
capacitor C1 100 nF from vout to gnd
ground gnd
label vout as "Output"
:::
~~~

This grammar is illustrative; finalize it with fixtures from the pilot lecturers before freezing the schema.

### Renderer decision

Use a renderer adapter rather than placing circuit layout in the document core. The first investigation should translate the semantic circuit AST to [CircuiTikZ](https://circuitikz.github.io/), a mature academic circuit renderer, and compile it in a restricted process. [CTAN lists CircuiTikZ under the LaTeX Project Public License](https://ctan.org/pkg/circuitikz), so preserve notices and complete a dependency-distribution review before packaging it.

The main `azeforge` install must continue to render non-circuit documents without requiring a TeX distribution. Circuit support may initially be installed as an optional adapter or supplied through a documented container. If a reliable cross-platform installation cannot be demonstrated within a time-boxed spike, implement a deliberately small SVG renderer for the whitelisted components instead of delaying P0.

For digital-electronics courses, add a separate `timing` block backed by [WaveDrom](https://github.com/wavedrom/wavedrom) after basic schematics. WaveDrom already provides a JavaScript/CLI path from textual WaveJSON to SVG and uses the MIT license. Timing diagrams and circuit schematics must remain separate semantic block types.

### Explicit circuit non-goals

- SPICE simulation or numerical circuit analysis;
- PCB layout and routing;
- importing arbitrary KiCad, EDA, or vendor project files;
- unrestricted automatic layout of large industrial schematics;
- guaranteeing every IEC, ANSI, or vendor-specific symbol in the pilot release;
- silently inferring electrically significant connections from visual proximity;
- using an LLM to decide circuit connectivity during deterministic rendering.

### P0.5 acceptance criteria

- Given the approved RC-filter fixture, when it is rendered, then component identity, values, nodes, and connectivity match the source.
- Given a reference to an unknown node, when validation runs, then the diagnostic identifies the component and missing node.
- Given a duplicate component reference, when validation runs, then compilation fails with a line-specific diagnostic.
- Given a circuit with disconnected components, when validation runs, then a warning identifies each disconnected subgraph.
- Given the same valid circuit and compiler version, when rendered repeatedly, then the SVG is deterministic.
- Given a circuit block on a machine without its optional backend, when rendering runs, then AzeForge reports the exact installation remedy and continues to work for non-circuit documents.
- Given circuit labels containing units and mathematical notation, when rendered to HTML, PNG, and PDF, then labels remain legible and consistent.
- Pilot lecturers approve at least five representative course circuits before the circuit grammar is declared stable.

## 25. P1 document maturity

- Plot block.
- Cross-references and automatic numbering.
- Footnotes and citations.
- Table of contents.
- Multiple-page templates.
- Project configuration file.
- Plugin discovery restricted to trusted packages.
- Watch-mode incremental builds.
- LaTeX export.
- VS Code extension or language server.
- Remark and Rehype integrations.
- A small engineering fixture suite covering an RC filter, RLC circuit, diode circuit, op-amp circuit, and transistor switch.

## 26. P2 integrations and future capabilities

- MCP server and optional MCP App preview.
- Visual browser editor.
- Optional AI-provider adapters.
- Geometry constraint solver and renderer.
- Chemistry reactions and molecular structures.
- Control-system diagrams.
- Typst backend.
- DOCX and PPTX export.
- Presentation and poster templates.
- Collaborative hosted workspaces.
- Question banks and parameterized document variants.
- Verified mathematical answer generation using a CAS.
- OCR and image-to-source conversion.
- Accessibility-oriented MathML and tagged PDF.
- Institutional templates and brand governance.

## 27. User stories

### P0 CLI

- As an engineering lecturer, I want to author a technical report with equations, tables, and diagrams so that I can distribute polished course material without assembling it in several tools.
- As a technical author, I want to write Markdown with readable equation blocks so that I can create professional material without learning LaTeX.
- As a developer, I want to render a source file from the CLI so that I can automate document generation.
- As a shell or CI user, I want to submit source through stdin and receive PNG, SVG, HTML, or PDF so that AzeForge composes with other tools.
- As an author, I want line-specific diagnostics so that I can repair invalid source quickly.
- As a Git user, I want deterministic source and output so that changes are reviewable and reproducible.
- As a privacy-sensitive user, I want rendering to work offline without an AI provider.

### P0.5 engineering pilot

- As an electrical-engineering lecturer, I want to describe common teaching circuits using named components and nodes so that I can include correct schematics without drawing them manually.
- As a lecturer reviewing generated source, I want connectivity to be explicit so that I can verify the electrical meaning before publication.
- As a student reading a report, I want component names, values, and measurement labels to remain legible in both screen and print output.
- As a lecturer, I want invalid or disconnected circuitry reported before export so that a visually plausible diagram does not conceal a source error.

### Later releases

- As a professor, I want the same source rendered as a handout and presentation so that I do not duplicate content.
- As an advanced author, I want controlled raw LaTeX and Mermaid escape hatches so that uncommon notation remains possible.
- As a plugin author, I want to register new semantic blocks so that specialized domains can extend AzeForge.
- As a nontechnical user, I want an optional browser or AI layer to translate instructions into editable source.
- As an agent harness, I want to discover capabilities and request artifacts through MCP so that the renderer can be used without shell integration.

## 28. Acceptance criteria

### Parser and AST

- Given a valid .aze.md file, when it is parsed, then a versioned serializable AST is produced.
- Given an unknown block, when validation runs, then a diagnostic names the unsupported block and lists available alternatives.
- Given invalid front matter, when validation runs, then the affected key and source range are reported.
- Given the same source and compiler version, when compiled twice with identical options, then content hashes match.

### Equation and diagram rendering

- Given a supported readable equation, when rendered, then it produces accessible HTML with a visual equation.
- Given raw LaTeX math, when allowed, then it renders through the math backend.
- Given an ambiguous or invalid equation, when validation runs, then the diagnostic proposes a valid form.
- Given a valid Mermaid block, when rendered offline, then sanitized SVG is embedded without executable content.

### CLI and outputs

- Given a source file and output path, when render succeeds, then the artifact exists and exit code is zero.
- Given invalid source, when render runs, then no misleading successful artifact is reported and exit code is nonzero.
- Given JSON diagnostics mode, when an error occurs, then stdout contains valid versioned JSON.
- Given stdin source, when render runs, then no temporary user-managed file is required.
- Given the golden technical report, when rendered to HTML, PNG, SVG, and PDF, then every output contains its equations, table, and diagram.
- Given a document spanning multiple PDF pages, when rendered, then headings, tables, and technical objects do not overlap or disappear at page boundaries.

### Security

- Given a source file containing path traversal, when rendering runs, then access is denied.
- Given raw HTML or SVG with executable content, when output is generated, then unsafe content is removed or blocked.
- Given offline mode, when rendering runs, then no network request is attempted.

## 29. Testing strategy

### Unit tests

- Markdown and directive parsing.
- Math tokenization and AST construction.
- Schema validation.
- Diagnostic ranges and suggestions.
- Content hashing.
- Plugin registration and failure isolation.
- Circuit node, component, and connectivity validation after P0.

### Golden tests

Maintain checked-in source fixtures and expected normalized outputs:

- AST snapshots;
- HTML snapshots;
- SVG snapshots;
- image comparisons with defined tolerances;
- PDF metadata and page-count assertions;
- the approved technical report;
- five approved engineering-circuit fixtures for P0.5.

### Integration tests

- CLI file input.
- CLI stdin and stdout.
- watch mode.
- local preview server.
- cross-platform path handling.
- untrusted input and timeout cases.
- optional circuit-backend detection and failure messages.

### Compatibility tests

- Supported Node.js LTS versions.
- macOS, Linux, and Windows.
- light and dark themes.
- representative system fonts.
- circuit backend installation path on every platform claimed by the pilot release.

## 30. Success metrics

Initial metrics are hypotheses to validate with the university group.

- At least 80 percent of curated example documents compile without manual backend code.
- At least 90 percent of syntax errors produce a line-specific diagnostic.
- Median time from installation to first successful render is below five minutes.
- The golden technical report passes all four output targets in CI.
- Determinism tests pass across repeated builds on the same platform.
- At least five pilot users successfully modify the technical report without reading the full language specification.
- At least 80 percent of the university pilot's agreed representative circuits can be expressed without raw CircuiTikZ.
- No pilot circuit is accepted solely because it looks plausible; connectivity must match its semantic AST fixture.
- Pilot participants rate the CLI workflow and output quality separately, so authoring friction is not hidden by attractive rendering.

## 31. Delivery plan

### Milestone 0: public project foundation

- Reserve `aruzone/aze-forge` and package names.
- Add the MIT license and dependency-notice policy.
- Establish the TypeScript monorepo and cross-platform CI.
- Record the architectural decisions in ADRs.

### Milestone 1: compiler foundation

- Parser.
- AST and schema.
- Diagnostics.
- Formatter.
- Markdown, callout, table, image, and code blocks.
- Basic HTML renderer.

### Milestone 2: technical rendering

- Equation grammar and KaTeX adapter.
- Mermaid adapter.
- SVG and PNG rendering.
- Themes.
- Golden tests.

### Milestone 3: complete CLI MVP

- PDF.
- Watch and serve.
- Capability discovery.
- Technical-report golden document.
- Install, usage, language, and security documentation.
- Public tagged CLI release.

### Milestone 4: engineering pilot pack

- Time-box the initial CircuiTikZ adapter feasibility spike to one engineering week; do not let it delay the CLI release.
- Gather five representative circuits from the university group.
- Finalize the smallest useful circuit grammar.
- Implement validation, deterministic rendering, and circuit fixtures.
- Package the optional dependency path and run the university pilot.
- Add WaveDrom timing diagrams only after schematic fixtures pass.

### Milestone 5: document maturity

- Plot plugin.
- Cross-references, numbering, citations, and contents.
- Project configuration and trusted plugin discovery.
- Editor or language-server support.

### Milestone 6: integrations and commercial experiments

- Evaluate MCP after the CLI workflow is stable.
- Evaluate a browser editor using the same compiler.
- Define optional AI-provider interfaces and privacy contracts.
- Test managed rendering, institutional tooling, or support as business-model candidates.

## 32. Open decisions

These do not block Milestone 1:

1. Initial PDF backend
   - Default: HTML/CSS rendered through a controlled headless browser.

2. Math authoring balance
   - Default: readable aliases for common expressions plus raw LaTeX compatibility.

3. Raw HTML and raw LaTeX policy
   - Default: disabled for untrusted source and opt-in for trusted local source.

4. Third-party plugins
   - Default: trusted built-in plugins only for P0 and P0.5.

5. Project structure
   - Default: single-file P0 with multi-file projects in P1.

6. Circuit symbol convention
   - The pilot group should choose IEC, ANSI, or a documented per-document setting.

7. Circuit backend distribution
   - Decide after the adapter spike whether to require an external TeX install, offer a container, or build the limited SVG renderer.

8. Pilot operating systems and installation restrictions
   - Obtain these before packaging the P0.5 adapter.

9. Business model and AI providers
   - Deliberately deferred until the open CLI demonstrates repeated use.

## 33. Questions for the university pilot group

Ask these while Milestones 1 through 3 are being built; they do not block the CLI foundation:

1. Which engineering departments and courses will participate first?
2. Which operating systems and managed-computer restrictions do lecturers use?
3. Can the group provide five real technical documents and five representative circuit diagrams with expected output?
4. Does the group require IEC symbols, ANSI symbols, or both?
5. Which circuit objects appear most often: passive networks, op-amps, digital logic, transistors, power electronics, or control blocks?
6. Are citations, equation numbering, cross-references, accessibility, or institutional templates required for the pilot?
7. Will lecturers author AzeMark directly, use an LLM to draft it, or have a technical assistant manage the CLI?
8. What information may never leave university machines if an optional hosted or AI feature is tested later?

## 34. Instructions for Codex

Build vertical slices in the milestone order. Do not begin with circuits, geometry, chemistry, a browser editor, MCP, or embedded AI before the CLI MVP passes its golden technical report.

Start with one complete path:

~~~text
minimal .aze.md source
    -> parser
    -> AST
    -> validation
    -> HTML renderer
    -> CLI artifact
~~~

Then extend the same path:

~~~text
equation + table + Mermaid blocks
    -> HTML
    -> SVG/PNG preview
    -> PDF
    -> golden technical report
~~~

Only then begin the engineering pilot extension:

~~~text
semantic circuit block
    -> circuit AST validation
    -> restricted renderer adapter
    -> deterministic SVG
    -> HTML/PNG/PDF embedding
~~~

Engineering constraints:

- Keep core independent of CLI, MCP, AI, circuits, and specific renderers.
- Use explicit TypeScript types and JSON Schema for public structures.
- Preserve source positions through parsing.
- Treat diagnostics as public API.
- Keep rendering deterministic.
- Avoid network access during rendering.
- Isolate plugins and renderer failures.
- Add fixtures before expanding the language.
- Do not silently repair semantics.
- Allow machine-applicable syntax fixes only when they preserve meaning.
- Include capability metadata designed for humans, automation, and future LLM use.
- Add security tests before enabling raw backend blocks.
- Never infer electrical connectivity from drawing placement.
- Do not let the circuit spike delay the tagged CLI MVP.

## 35. Definition of the first successful CLI prototype

The prototype is successful when all of the following work:

~~~bash
azeforge validate examples/engineering-report.aze.md
azeforge render examples/engineering-report.aze.md --output report.html
azeforge render examples/engineering-report.aze.md --output report.svg
azeforge render examples/engineering-report.aze.md --output report.png
azeforge render examples/engineering-report.aze.md --output report.pdf
azeforge serve examples/engineering-report.aze.md
~~~

The report must contain prose, at least three equations, a captioned table, and a Mermaid diagram. A user must be able to modify one equation and one table value, rerender all formats, and understand any error using line-specific diagnostics.

This proves the compiler, source language, renderer abstraction, CLI, and multi-format document thesis without relying on a browser, MCP, or an LLM.

## 36. Definition of pilot-ready circuit support

The engineering pilot extension is ready only when:

1. five circuits supplied or approved by the university group have semantic source fixtures;
2. connectivity is validated independently of visual output;
3. HTML, SVG/PNG, and PDF embed consistent schematics;
4. optional-backend installation works on every supported pilot platform;
5. missing backends and invalid circuits produce actionable diagnostics;
6. the main CLI remains usable without TeX or circuit dependencies;
7. lecturers confirm that the limited grammar covers the selected course examples.

Broader symbol libraries, simulation, EDA interchange, and automatic industrial schematic layout remain later products, not pilot blockers.
