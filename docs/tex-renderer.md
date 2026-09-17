# TeX renderer prerequisites

Aze Forge compiles the closed `tex` Technical object into self-contained SVG through a trusted renderer. Its approved profiles are `circuitikz` for circuit diagrams, `tikz` for custom vector figures, `pgfplots` for technical plots, `chemfig` for chemical structures, and `tikz-cd` for commutative diagrams.

`tex` is captionless and unnumbered. Its required `title` and `description` are unrestricted UTF-8 accessibility metadata, never visible captions. Use a `figure` wrapper when Figure numbering or a visible caption is required.

```azemark
:::: tex
id: optional-stable-id
title: Accessible title
description: Accessible description
profile: tikz
----
\draw (0,0) -- (1,1);
::::
```

The body is preserved after `----`, must be non-empty printable ASCII plus tabs/newlines, and is limited to 50,000 characters. Source rejects document/package declarations, filesystem/import commands, shell escape, and font selection; the profile-owned preamble and sandbox remain renderer responsibilities.

## Local authoring

Install the configured TeX toolchain and SVG converter on the machine running `azeforge`. The toolchain must include the packages required by the selected profile. Aze Forge invokes it only when the document contains a `tex` Technical object.

Use the project's pinned renderer version where reproducible output matters. A locally installed TeX distribution may produce different SVG after package or font updates.

## Server and CI deployment

Run the pinned Aze Forge TeX-renderer container beside the Aze Forge compiler, or start it as a short-lived job for each compilation. The compiler sends the `tex` profile body and accessibility metadata to that renderer and embeds the returned SVG.

Do not expose a host TeX installation directly to document compilation requests. The renderer container must:

- disable TeX shell escape;
- have no network access;
- read and write only its temporary workspace;
- enforce CPU, memory, output-size, and wall-clock limits;
- include only the approved packages for supported profiles; and
- pin the TeX Live, package, font, and SVG conversion versions.

If the configured renderer is unavailable, compilation of a document that contains a `tex` Technical object must fail with an actionable diagnostic. It must not fall back to the native Circuit renderer or omit the object.

## Web integration

`aze-forge-web` needs a renderer endpoint or container-job integration available to its compilation workers. Browser clients must never run TeX. The web application sends the authored TeX body, profile, title, and description to its trusted server-side compilation path, then serves only Aze Forge's final artifact.

The web deployment should treat TeX as an optional capability. Documents without `tex` Technical objects compile without this renderer. Documents with one require the pinned renderer before compilation begins.
