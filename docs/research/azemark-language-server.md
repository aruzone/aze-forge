# AzeMark language server: protocol and tooling research

This note records what building an AzeMark language server on Node/TypeScript
would require. It is research only: no production code, no dependency changes.
Every factual claim cites its authoritative primary source (the LSP
specification, the Microsoft `vscode-languageserver-node` sources, or the
official VS Code extension docs).

## Protocol baseline

- The base protocol is a header plus a JSON-RPC 2.0 content part. The only
  required header is `Content-Length` (bytes); `Content-Type` defaults to
  `application/vscode-jsonrpc; charset=utf-8`, and the header is ASCII-encoded
  with `\r\n\r\n` separating header from content. See the [LSP 3.17 base
  protocol](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#baseProtocol)
  (source: [specification.md](https://raw.githubusercontent.com/microsoft/language-server-protocol/gh-pages/_specifications/lsp/3.17/specification.md)).
- LSP 3.17 is the last fully documented stable specification release; the
  [spec repository](https://github.com/microsoft/language-server-protocol)
  hosts it alongside the 3.18 draft. The Microsoft Node SDK already ships
  protocol `3.18.4`, whose new surface includes `textDocument/inlineCompletion`,
  `textDocument/rangesFormatting`, snippet text edits in workspace edits, and
  pull-model notebook diagnostics. See the [SDK README history](https://github.com/microsoft/vscode-languageserver-node).
- Protocol evolution is capability-negotiated: client and server exchange
  capability flags during `initialize`, so a server adapts to what each client
  supports rather than assuming a fixed feature set. See the [LSP 3.17
  specification](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/).

## Relevant capabilities for AzeMark

- Text synchronization (`textDocument/didOpen`, `textDocument/didChange`,
  `textDocument/didClose`) with `TextDocumentSyncKind.None | Full |
  Incremental` and the `TextDocumentSyncOptions` open/close/change/save shape.
  See the [synchronization section](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textSynchronization).
- Language features worth mapping to AzeMark: completion
  (`textDocument/completion` + `completionItem/resolve`), hover, document
  symbols, folding ranges, semantic tokens, formatting, code actions, rename,
  and diagnostics. The candidate feature list is the [language-features
  section](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#languageFeatures);
  completion's filter/sort and resolve-lazily model is defined in
  [completion.md](https://raw.githubusercontent.com/microsoft/language-server-protocol/gh-pages/_specifications/lsp/3.17/language/completion.md).
- Workspace features: configuration pull (`workspace/configuration`), file
  watching (`workspace/didChangeWatchedFiles`), and command execution
  (`workspace/executeCommand`). See [configuration.md](https://raw.githubusercontent.com/microsoft/language-server-protocol/gh-pages/_specifications/lsp/3.17/workspace/configuration.md)
  and [executeCommand.md](https://raw.githubusercontent.com/microsoft/language-server-protocol/gh-pages/_specifications/lsp/3.17/workspace/executeCommand.md).
- For AzeMark the natural first slice is sync + push diagnostics + completion
  for directive names, theme tokens, and asset paths, with hover/document
  symbols as a second slice. Formatting and code actions come later; they all
  compute against the synchronized document state, not disk.

## Transport and editor-extension packaging

- A VS Code language extension has two parts: a Language Client (a normal
  extension with full `vscode` API access) that launches and manages a Language
  Server running in a separate process, communicating only over LSP. The
  separate process isolates CPU/memory-heavy analysis from the editor. See the
  [Language Server Extension Guide](https://code.visualstudio.com/api/language-extensions/language-server-extension-guide).
- The client's `TransportKind` enum offers `stdio`, `ipc`, `pipe`, and `socket`
  (plus a `{ kind: socket, port }` object form). Pipes and sockets are owned by
  the VS Code process; the server connects to the passed pipe/port. Source:
  [client/src/node/main.ts](https://github.com/microsoft/vscode-languageserver-node/blob/main/client/src/node/main.ts).
- The server side is created with `createConnection`, which accepts
  command-line-arg defaults, explicit stdin/stdout streams, or explicit
  `MessageReader`/`MessageWriter` pairs. Source:
  [server/src/node/main.ts](https://github.com/microsoft/vscode-languageserver-node/blob/main/server/src/node/main.ts).
- The underlying framing and JSON-RPC channel is the `vscode-jsonrpc` package
  (`StreamMessageReader`/`StreamMessageWriter`, `IPCMessageReader`/
  `IPCMessageWriter`, pipe/socket transports). See the [jsonrpc package
  README](https://github.com/microsoft/vscode-languageserver-node/tree/main/jsonrpc).
- Recommendation: ship the AzeMark server as a Node process over **stdio**
  (simplest, works outside VS Code too), with the VS Code client defaulting to
  `TransportKind.stdio` and keeping `ipc` for debugging. Because LSP is
  editor-neutral, the same server binary can later serve Neovim, Emacs, Zed, or
  any LSP-compliant client with no protocol changes — that reuse is the point
  of the protocol. See the [extension
  guide](https://code.visualstudio.com/api/language-extensions/language-server-extension-guide).
- Packaging a VS Code extension (manifest, `documentSelector` with an `azemark`
  language id, `vsce` publish flow) follows [Publishing
  Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension).
  The sample's client registers `{ scheme: 'file', language: 'plaintext' }`,
  synchronizes config, and watches config files — the exact pattern an AzeMark
  extension would copy with its own language id. See the [extension
  guide](https://code.visualstudio.com/api/language-extensions/language-server-extension-guide)
  and [lsp-sample](https://github.com/microsoft/vscode-extension-samples/tree/main/lsp-sample).

## Official libraries (npm)

All from the [vscode-languageserver-node monorepo](https://github.com/microsoft/vscode-languageserver-node)
(current: server/client `10.1.2`, protocol/types `3.18.4`, jsonrpc `9.0.3`,
textdocument `1.0.15`):

- `vscode-languageserver` — server framework: `createConnection`,
  `ProposedFeatures`, capability declaration, request/notification handlers.
  See the [server package](https://github.com/microsoft/vscode-languageserver-node/tree/main/server).
- `vscode-languageclient` — VS Code-side client: `LanguageClient`,
  `LanguageClientOptions`, `ServerOptions`, transports. Consumed via
  `vscode-languageclient/node` in the extension host.
- `vscode-languageserver-protocol` — generated protocol types, request/
  notification constants, and node/browser message transports.
- `vscode-languageserver-types` — shared data types (`Position`, `Range`,
  `Diagnostic`, `TextEdit`, …).
- `vscode-languageserver-textdocument` — `TextDocument` model with
  `update()` (incremental application), `positionAt`/`offsetAt`, and
  `applyEdits`. Source:
  [textDocument/src/main.ts](https://github.com/microsoft/vscode-languageserver-node/blob/main/textDocument/src/main.ts).
- `vscode-jsonrpc` — standalone JSON-RPC channel; usable without the rest of
  the SDK.

## Incremental-text synchronization implications

- Client support for `didOpen`/`didChange`/`didClose` is mandatory; the server
  implements all three or none, governed by one combined capability. Clients
  must sync before requesting features (e.g. send `didChange` v5 before
  `textDocument/completion` on v5). See
  [didChange.md](https://raw.githubusercontent.com/microsoft/language-server-protocol/gh-pages/_specifications/lsp/3.17/textDocument/didChange.md).
- `didChange` carries an ordered array of content changes: entry `c1` applies
  to state S producing S′, `c2` applies to S′, and the document version in the
  params is the version *after* all changes. Partial entries carry a `range`
  (plus optional `rangeLength`) and replacement text; a change without a range
  is a full-document replacement. Same source as above.
- The official `TextDocuments` manager wires the three notifications to an
  in-memory document collection and exposes `onDidOpen`/`onDidChangeContent`
  events; `listen()` defaults the sync kind to `Incremental`. Source:
  [server/src/common/textDocuments.ts](https://github.com/microsoft/vscode-languageserver-node/blob/main/server/src/common/textDocuments.ts).
- Implications for AzeMark:
  - Request `TextDocumentSyncKind.Incremental` and apply ranged edits to the
    in-memory buffer via `TextDocument.update`; never read from disk for
    feature requests.
  - Incremental offsets are UTF-16 code units per LSP `Position`; the AzeMark
    compiler's byte/char offsets need a conversion layer at the boundary
    (the `positionAt`/`offsetAt` helpers in `vscode-languageserver-textdocument`
    are the reference implementation).
  - Debounce validation after `onDidChangeContent`; re-parse only the open
    buffer. `rangeLength` lets a fast path skip re-lexing when the edit is
    small, but correctness first: full re-parse of the (small) buffer is fine
    until profiling says otherwise.

## Diagnostic publishing (push vs pull)

- Push: `textDocument/publishDiagnostics` notification, server → client.
  Diagnostics are server-owned: the server must re-push (including the empty
  array to clear) on every change; the client never merges. Single-file
  languages clear on close; project-system languages recompute on open. Client
  capability flags advertise `relatedInformation`, `tagSupport`, `versionSupport`,
  `codeDescriptionSupport`, and code-action `dataSupport`. See
  [publishDiagnostics.md](https://raw.githubusercontent.com/microsoft/language-server-protocol/gh-pages/_specifications/lsp/3.17/language/publishDiagnostics.md).
- Pull (since 3.17): `textDocument/diagnostic` and `workspace/diagnostic`
  requests let the client control *which* documents get validated and *when*,
  avoiding false positives from ownership notifications. The sample server
  advertises `diagnosticProvider: { interFileDependencies: false,
  workspaceDiagnostics: false }` alongside push. See
  [pullDiagnostics.md](https://raw.githubusercontent.com/microsoft/language-server-protocol/gh-pages/_specifications/lsp/3.17/language/pullDiagnostics.md)
  and the [extension guide](https://code.visualstudio.com/api/language-extensions/language-server-extension-guide).
- Implication for AzeMark: start with **push** (`connection.sendDiagnostics`
  on open/change/config-change, capped at a `maxNumberOfProblems` setting as
  in the sample), mapping compiler errors to `Diagnostic` with range, severity,
  code, and `codeDescription` links where stable. Add pull later for
  visible-editor prioritization and workspace-wide validation; the two models
  coexist. Diagnostic `data` round-trips into `textDocument/codeAction`, which
  is the hook for future quick-fixes.

## Test tooling (official)

- `client-node-tests` in the SDK monorepo runs real client/server pairs under
  `@vscode/test-electron`: text-sync servers, crash/shutdown/timeout servers,
  notebook servers, and converter/workspace-folder suites. It is the reference
  for end-to-end harness design. See
  [client-node-tests](https://github.com/microsoft/vscode-languageserver-node/tree/main/client-node-tests).
- The documented sample ships an end-to-end test for its client/server pair.
  See [lsp-sample](https://github.com/microsoft/vscode-extension-samples/tree/main/lsp-sample).
- `vscode-languageserver-protocol` ships a JSON meta-model
  (`generate:metaModel`) describing the protocol; a future AzeMark conformance
  suite could generate cases from it, but that is not needed for a first
  implementation.
- Implication: plan three layers — unit tests over the offset-conversion and
  diagnostic-mapping functions, protocol-level tests driving the server over
  stdio with scripted `didOpen`/`didChange`/feature requests, and one
  `@vscode/test-electron` smoke test reusing the `lsp-sample` shape. No new
  test infrastructure exists yet; this note proposes no test changes.

## Version compatibility concerns

- SDK versions move together: client/server `10.1.2` depend on protocol
  `3.18.4` and jsonrpc `9.0.3` (per each package's `package.json` in the
  [monorepo](https://github.com/microsoft/vscode-languageserver-node)).
  Upgrading the server package pulls the protocol types with it; pin all six
  packages to one release line.
- `vscode-languageclient` `10.1.2` declares `engines.vscode ^1.91.0`, and the
  current client source requires `^1.106.0` after its update script runs
  (source:
  [client/src/node/main.ts](https://github.com/microsoft/vscode-languageserver-node/blob/main/client/src/node/main.ts)).
  Newer client features (e.g. `LogOutputChannel`-based trace channels) are
  breaking changes against older editors — set the extension's `engines.vscode`
  floor deliberately and test against it.
- Protocol 3.18 additions used by the SDK (inline completions, multi-range
  formatting, snippet workspace edits) need matching client capability flags;
  older editors ignore unknown capabilities, so advertise 3.18 features only
  behind the negotiated flags, never unconditionally.
- The SDK targets Node 22 / ES2022 (per the [SDK README](https://github.com/microsoft/vscode-languageserver-node)),
  which fits this repo's `engines` (`node >=22 <23 || >=24 <25`, see
  `package.json`): no toolchain conflict for a Node-based server.
- AzeMark grammar stability matters more than protocol churn: keep the
  compiler-to-`Diagnostic` mapping behind a small adapter module so grammar
  changes touch one file, not every handler.

## Recommendation

Build the first AzeMark server with the official stack only:
`vscode-languageserver` + `vscode-languageserver-textdocument` for the server,
`vscode-languageclient` for a thin VS Code extension, stdio transport, sync
kind Incremental, push diagnostics, and the `lsp-sample` project shape
(client + server + e2e test). Scope the first milestone to open/change/close
sync, compiler-error diagnostics with a `maxNumberOfProblems` setting, and
directive/asset-path completions; defer pull diagnostics, formatting, and
multi-editor packaging until the core loop is proven. Effort is small-to-medium:
the SDK removes all protocol plumbing, leaving the AzeMark-specific work —
UTF-16 offset conversion, error-to-`Diagnostic` mapping, and completion data —
as the real cost.
