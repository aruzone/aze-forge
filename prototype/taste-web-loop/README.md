# Taste the web edit-preview-export loop

Throwaway prototype for [wayfinder ticket #49](https://github.com/aruzone/aze-forge/issues/49).

This is a single-user AzeForge Web loop: pick an example, edit Source, run Analyze or Export, inspect diagnostics, preview the HTML Artifact, and download HTML/SVG/PNG/PDF. It is intentionally rough — no accounts, no persistence, no production styling, and no copied compiler source.

## Run it

```bash
cd prototype/taste-web-loop
node server.mjs
```

Open http://127.0.0.1:8080 (or `PORT=...` to change).

## What you're tasting

- The example picker, source editor, Analyze button, and export format buttons.
- Diagnostics surfaced from the real compiler library (ranged codes, severities, fixes).
- HTML preview in a sandboxed iframe using the normal compile path.
- Theme selector populated from the compiler's built-in Themes.
- SVG, PNG, and PDF downloads through a separate Artifact endpoint.
- A minimal Node service shaped like the HTTP contract from [Define the compiler library and web service boundary](https://github.com/aruzone/aze-forge/issues/46#issuecomment-5566160900): `/api/capabilities`, `/api/jobs`, polling, and `/api/jobs/:id/artifact`.

## Constraints honored

- Compiles through the local `@aruzone/aze-forge` library in this repo.
- No browser-only compiler; service runs in Node.
- No accounts, saved projects, collaboration, AI integration, or production styling.
- Theme and format selection are caller-side render choices.

## Current limitations of the prototype

- The compiler in this repo still speaks **AzeMark 1**. The live examples are therefore AzeMark 1. Once the AzeMark 2 parser/renderer cutover lands, the same loop swaps in the approved [authoring-form examples](https://github.com/aruzone/aze-forge/tree/prototype/taste-authoring-forms) without changing the web interaction decisions.
- Asset upload, cancellation, and multi-job queueing are not wired; the prototype runs one job per request synchronously and returns immediately.
- The `/api/capabilities` endpoint reports the current built-in themes (`default`, `academic`, `dark-presentation`) rather than the alpha target names (`AzeForge Light`, `AzeForge Dark`, `AzeForge Print`) because the compiler still carries the temporary names.

## Taste questions for the owner

1. Does the three-pane layout (source | diagnostics + preview) match how you expect to write and review AzeMark?
2. Should Analyze and Export be separate buttons, or one "Compile" action that always refreshes both diagnostics and preview?
3. Does the Theme dropdown belong in the top toolbar, or would you expect to pick Theme once per preview/export?
4. Is it okay that non-HTML exports download immediately instead of previewing inline?
5. Should the example picker expose the full alpha catalog (one per family) or only the report-style Document preview used in web review?
6. Do the diagnostic cards show enough author-facing detail, or are the codes/locations too prominent?
7. Is the iframe preview trusted-enough, or would you rather preview inside a sandboxed `<iframe>` with stricter isolation?
