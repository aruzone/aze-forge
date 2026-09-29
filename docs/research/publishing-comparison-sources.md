# Publishing comparison sources

This note supports the comparison in `README.md`. It records only claims that
can be stated without ranking the other tools.

- AzeForge's shipped capability catalog defines native, controlled AzeMark
  declarations and distinguishes Mermaid and KaTeX-compatible math escape
  hatches from native coverage. See [the native plugin family tree](../native-plugin-family-tree.md).
- AzeForge publishes its directive grammar through `azeforge grammar --json`.
  See [the README](../../README.md#try-it-ask-what-the-language-accepts).
- [Typst's syntax reference](https://typst.app/docs/reference/syntax/) describes
  Typst markup, and [its math reference](https://typst.app/docs/reference/math/)
  describes built-in mathematical notation. [Typst Universe](https://typst.app/universe/)
  distributes extensions, including [Mermaid](https://typst.app/universe/package/merman/),
  [circuit](https://typst.app/universe/package/circuiteria/), and
  [chemistry](https://typst.app/universe/package/alchemist/) packages. The
  [Typst web app](https://typst.app/docs/web-app/export-and-preview/) previews
  and exports PDF, SVG, and PNG.
- [Quarto's Markdown reference](https://quarto.org/docs/authoring/markdown-basics)
  documents Pandoc Markdown, mathematics, and Mermaid diagrams. Its
  [extension directory](https://quarto.org/docs/extensions/) lists diagram
  extensions, and its [troubleshooting guide](https://quarto.org/docs/troubleshooting/)
  documents render diagnostics.
- The [LaTeX Project documentation index](https://www.latex-project.org/help/documentation/)
  is the first-party starting point for LaTeX and package documentation.

The README table deliberately compares authoring and extension models. It does
not claim that the other tools lack a feature merely because it is not built
into their core language.