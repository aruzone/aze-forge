# AzeMark language server proposal

## Decision

Build an editor-neutral AzeMark language server on top of the existing compiler. Ship a VS Code extension first, but keep the server independent so other LSP clients can use the same process.

The server must consume compiler results and grammar artifacts. It must not create a second parser, duplicate Plugin validation, or expose the compiler's private concrete syntax tree. This preserves ADR-0001's separation between Source syntax, the semantic Document, and rendering.

## Existing foundation

AzeForge already provides the prerequisites for a useful server:

- `createCompiler().parse()` returns recoverable parse results, stable diagnostic codes, source ranges, related locations, suggestions, and safe fixes.
- `Compiler.format()` delegates to the existing source formatter.
- `schemas/grammar.json` and `buildGrammarDocument()` describe directive types, fields, enum values, limits, and fence rules.
- Plugins own parsing and validation of one directive Block type, while renderers remain separate adapters. The language server should use that same division rather than interpreting technical Blocks itself.

The first server capability is validation, not rendering. Artifact production can invoke browser or TeX adapters and must stay outside the edit loop.

## Architecture

```text
AzeForge compiler library
  └─ AzeMark language server
       ├─ LSP lifecycle and in-memory Source store
       ├─ source-range to LSP-range adapter
       ├─ compiler diagnostic adapter
       ├─ grammar-driven completion and hover providers
       └─ compiler-backed formatter and document-symbol provider
  └─ VS Code extension
       └─ starts the server over stdio
```

The compiler remains the semantic owner. The language server is an adapter that synchronizes unsaved Source text, calls compiler operations, and translates results to LSP protocol types.

## Recommended tools

Use the official Microsoft Node implementation:

- `vscode-languageserver` for the server lifecycle, capabilities, handlers, and stdio connection.
- `vscode-languageserver-textdocument` to store synchronized Source text and apply incremental changes.
- `vscode-languageclient` for the VS Code extension.
- `vscode` extension tooling and `@vscode/test-electron` for extension smoke tests.
- The official `vscode-extension-samples/lsp-sample` project shape as the initial packaging and end-to-end test reference.

Use stdio transport. It is the least complex transport, works outside VS Code, and leaves the server usable by other LSP clients without protocol changes.

Request incremental text synchronization, but start with a debounced full compiler reparse after every change. AzeMark Sources are expected to be small enough for that to be correct and responsive. Do not implement incremental parsing until profiling proves it necessary.

## Critical adapter: source coordinates

AzeMark source ranges use one-based lines and columns, with UTF-8 byte offsets. LSP uses zero-based lines and UTF-16 code-unit columns. The server needs one isolated, well-tested conversion module between the compiler and the protocol.

Do not forward source coordinates directly. That would misplace diagnostics and edits, especially in Sources containing astral Unicode characters, combining characters, or CRLF line endings.

Tests for this module must cover:

- ASCII and non-ASCII text.
- Astral Unicode characters and combining marks.
- CRLF, LF, and final empty lines.
- Zero-length insertion ranges and end-of-line ranges.
- Diagnostic fixes and related locations.

## First release

The first release should provide:

1. Recognition of `*.aze.md` Sources and an `azemark` language identifier.
2. Open, change, save, and close synchronization against the in-memory buffer.
3. Push diagnostics from `Compiler.parse()` and validation, including severity, stable code, range, related locations, and safe code actions where the compiler supplies a fix.
4. Completion for directive types, front-matter keys, directive header and body fields, closed enum values, and asset paths where applicable.
5. Hover documentation drawn from the grammar report and language reference.
6. Formatting through `Compiler.format()`.
7. Document symbols for headings and directive Block identifiers.
8. Basic syntax highlighting, snippets, comment configuration, and four-colon directive fence support in the VS Code extension.

Push diagnostics are the right first choice. The server re-publishes the complete diagnostic set for each affected Source, including an empty set to clear stale errors. Pull diagnostics can wait until workspace-wide analysis is needed.

## Later releases

Add these only after the compiler-backed edit loop is reliable:

- Scoped reference completion and go-to-definition.
- Workspace indexing and cross-Source references.
- Asset and bibliography path discovery.
- Semantic tokens for declarations, references, and directive-specific values.
- Editor preview integration.
- Pull diagnostics and prioritization for visible editors.
- Packaging and smoke tests for additional clients.

A TextMate grammar should provide initial syntax highlighting. Semantic tokens should wait until the server has sufficient contextual information to improve on it.

## Effort estimate

| Slice | Scope | Estimated effort |
| --- | --- | --- |
| Editor recognition | Language identifier, file association, TextMate grammar, snippets, comment rules, directive fence pairing | 2 to 4 days |
| Useful LSP MVP | Stdio server, synchronization, compiler diagnostics, coordinate conversion, completions, thin VS Code extension | 1 to 2 weeks |
| Authoring-quality release | Hover, symbols, formatting, safe fixes, protocol tests, VS Code smoke test | 2 to 4 weeks |
| Mature tooling | Workspace indexing, scoped references, semantic tokens, preview, cross-editor packaging | 4 to 8 or more weeks |

The MVP is a small-to-medium effort because the compiler and grammar artifacts already exist. The largest AzeMark-specific work is the coordinate adapter, diagnostic mapping, and completion context across many directive families.

## Design risks

### Coordinate conversion

This is the main correctness risk. Keep all conversion logic in one module and test it through the same interface used by diagnostics, formatting, and code actions.

### Completion context

The grammar report supplies vocabulary, but some valid values depend on the directive, body record, declaration order, or scope. Start with grammar-driven completions. Add directive-specific context only where the generic provider is insufficient.

### Formatting

Formatting must apply to the synchronized unsaved Source and return ordinary LSP edits. It must not read the on-disk file during a request. Cursor preservation and edits around invalid input need explicit editor-level tests.

### Extension ownership

Keep the server and VS Code client in this repository initially, with independent package manifests. The compiler-to-server interface then evolves in the same change set as grammar and diagnostic contracts. Consider separate publication only after the client has a stable release process.

### Rendering

Do not render artifacts in the server's validation path. Browser and TeX work can be slow, unavailable, and unrelated to source correctness. A preview feature, if added, needs cancellation, debouncing, and its own failure model.

## Protocol references

- [Language Server Protocol 3.17 specification](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/)
- [Microsoft Node language-server implementation](https://github.com/microsoft/vscode-languageserver-node)
- [VS Code language server extension guide](https://code.visualstudio.com/api/language-extensions/language-server-extension-guide)
- [Official LSP sample](https://github.com/microsoft/vscode-extension-samples/tree/main/lsp-sample)
- [VS Code extension publishing guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)

See `docs/research/azemark-language-server.md` for protocol and implementation-source notes.