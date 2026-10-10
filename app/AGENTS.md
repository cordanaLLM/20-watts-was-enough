# Reader and site rules

These instructions extend root [`AGENTS.md`](../AGENTS.md).

- Canonical prose remains in repository Markdown and data files. Reader may
  index and render it but must not maintain edited copy.
- Preserve direct links, heading anchors, keyboard navigation, visible focus,
  semantic structure, and readable layouts from narrow to wide screens.
- Tables, equations, code, and diagrams may scroll locally; they must not force
  page-level horizontal overflow or clip content silently.
- Treat Markdown, Mermaid, bibliography data, and copied repository artifacts
  as untrusted input. Do not introduce dynamic evaluation.
- Keep public portal, `/book/`, downloadable PDF, and source links bound to
  same canonical revision and publication allowlist.
- Verify with focused reader tests, lint, typecheck, static build, and Pages
  artifact validation.
