# 0112 — Keep the 20w command line and release module graph without kong or spdx/tools-golang

- **Status:** accepted
- **Date:** 2026-10-18
- **Related:** [`LICENSING.md`](../LICENSING.md)

## Context

A reuse survey of the repository on 2026-10-16 proposed adopting two Go
modules in the `tooling` module, which builds the released `20w` binary:

| Candidate | Version | Would replace | Module graph it adds |
| --- | --- | --- | --- |
| `github.com/alecthomas/kong` | v1.16.1, MIT | the hand-written dispatch and usage text in `tooling/cmd/20w/main.go` and the `flag.FlagSet` parsing of about 40 subcommands in 24 files | kong, plus its test-only modules `alecthomas/assert/v2`, `alecthomas/repr` and `hexops/gotextdiff` in `go.sum` |
| `github.com/spdx/tools-golang` | v0.5.7, Apache-2.0 | about 30 of the 233 lines in `tooling/internal/pdftools/spdx.go` | 5 direct modules (`spdx/gordf`, `anchore/go-struct-converter`, `google/go-cmp`, `stretchr/testify`, `sigs.k8s.io/yaml`) and 4 indirect ones |

The release graph of `20w` is reviewed as a single module:

- `tooling/internal/releasebuild/build.go` refuses any Go release dependency
  graph other than `github.com/yuin/goldmark/v2` v2.1.6, and checks the
  retained licence text `LICENSES/goldmark-MIT.txt` against a fixed SHA-256
  before it writes the Go SBOM and third-party notices.
- `scripts/validate-engineering-policy.mjs` requires `tooling/go.mod` and
  `tooling/go.sum` to name only that module.
- `LICENSING.md` states that release preparation fails when the compiled
  module graph or the retained licence text differs from the reviewed
  identity.

Each added module would need its own licence review, retained text, notice
entry and SBOM entry.

The `20w` command line is a public interface of the release binary
(HISS-14, append-only). Go's `flag` package accepts `-root` and `--root`
alike. Kong accepts only the double-dash form and formats usage and errors
differently, so adopting it changes the contract for callers outside this
repository. A search on 2026-10-18 found no in-tree caller of the
single-dash form.

`spdx/tools-golang` parses SPDX 2.3 documents, but it does not enforce what
`spdx.go` exists for: the closed set of admitted relationship types and the
canonical byte identity that the PDF tool image receipts bind. Those checks
would stay hand-written either way.

## Decision

1. Do not adopt `github.com/alecthomas/kong`. The `20w` dispatch,
   usage text and `flag` parsing stay as they are.
2. Do not adopt `github.com/spdx/tools-golang`. `tooling/internal/pdftools/spdx.go`
   stays the SPDX validator and canonicaliser of the PDF tool image.
3. `tooling/go.mod` keeps Goldmark as its only dependency. A later proposal
   to add a module to the release graph comes with a licence review and an
   update of `releasebuild`, the policy validator and `LICENSING.md`
   together, in one decision record.

## Consequences

- The 2026-10-16 survey rows for kong and spdx/tools-golang are closed as
  rejected. No Go source or module file changes.
- The roughly 230 lines of hand-written dispatch and SPDX checks remain
  maintained in this repository.
- The survey row for ajv, already a development dependency, is not affected.
