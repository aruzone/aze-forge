# Give Documents and Artifacts separate identities

`contentHash` identifies an error-free semantic AzeDocument: SHA-256 over its UTF-8 RFC 8785 canonical projection, excluding source ranges, diagnostics, private syntax trivia, generated renderer IDs, file paths, and render options. `artifactHash` separately identifies the exact rendered bytes (or a canonical manifest for a page set). One hash could not safely serve both caching semantics and byte-integrity checks: equivalent formatting should retain document identity, while HTML, SVG, PNG, and PDF must remain independently verifiable.
