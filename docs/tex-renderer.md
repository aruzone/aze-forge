# TeX renderer prerequisites

Aze Forge can compile curated TeX figure profiles into self-contained SVG. The planned profiles are `circuitikz` for circuit diagrams, `tikz` for custom vector figures, `pgfplots` for technical plots, `chemfig` for chemical structures, and `tikz-cd` for commutative diagrams.

The TeX renderer runs only while Aze Forge compiles a document. Published HTML, SVG, PNG, and PDF artifacts contain the rendered figure and do not require TeX.

## Local authoring

Install the configured TeX toolchain and SVG converter on the machine running `azeforge`. The toolchain must include the packages required by the selected profile. Aze Forge invokes it only when the document contains a TeX figure block.

Use the project's pinned renderer version where reproducible output matters. A locally installed TeX distribution may produce different SVG after package or font updates.

## Server and CI deployment

Run the pinned Aze Forge TeX-renderer container beside the Aze Forge compiler, or start it as a short-lived job for each compilation. The compiler sends TeX figure input to that renderer and embeds the returned SVG.

Do not expose a host TeX installation directly to document compilation requests. The renderer container must:

- disable TeX shell escape;
- have no network access;
- read and write only its temporary workspace;
- enforce CPU, memory, output-size, and wall-clock limits;
- include only the approved packages for supported profiles; and
- pin the TeX Live, package, font, and SVG conversion versions.

If the configured renderer is unavailable, compilation of a document that contains a TeX figure block must fail with an actionable diagnostic. It must not fall back to the native circuit renderer or omit the figure.

## Web integration

`aze-forge-web` needs a renderer endpoint or container-job integration available to its compilation workers. Browser clients must never run TeX. The web application sends the authored TeX body, profile, title, and description to its trusted server-side compilation path, then serves only Aze Forge's final artifact.

The web deployment should treat TeX as an optional capability. Documents without TeX figure blocks compile without this renderer. Documents with one require the pinned renderer before the compile begins.
