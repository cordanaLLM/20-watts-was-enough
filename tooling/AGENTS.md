# Go tooling rules

These instructions extend repository-wide [`AGENTS.md`](../AGENTS.md) and
[`docs/principles.md`](../docs/principles.md).

## Scope and structure

- Go is default language for portable repository tooling. Keep the
  user-facing command in `cmd/20w`; put validation, catalogue, generation, and
  release logic in narrowly named `internal/` packages.
- Prefer one coherent command with stable subcommands over collection of
  one-file executables. Package owns one contract and exposes smallest
  API needed by command or another package.
  Private `cmd/ci-plan` and `cmd/pdf-proof` drivers are bounded
  exception under [decision 0075](../decisions/0075-isolate-ci-driver-dependency-closures.md):
  they share public CLI adapters and enforce minimal dependency closures for
  their existing CI jobs. Do not add public commands or release artifacts there.
  Experiment help, dispatch, handlers and command-specific tests belong in
  `internal/experimentcli`; keep public command's delegation stable.
- Start with standard library. Add dependency only when it removes more
  parser, protocol, or security risk than it adds to module graph. Verify
  its current upstream documentation, licence, maintenance state, and exact
  version before adoption.
- Translate useful rules from another repository to failure they prevent
  here. Do not import Golusoris service framework or copy its Fx modules,
  service-specific exceptions, or complete lint configuration into this
  command.

## Deterministic and bounded behaviour

- Accept repository root explicitly. Resolve it once, keep subsequent
  paths beneath it, and treat manifests, Markdown, JSON, generated metadata,
  and filesystem entries as untrusted input.
- Put finite limits on file count, file size, decoded records, traversal depth,
  concurrency, subprocess duration, captured output, and retries wherever the
  boundary exists. Reject exceeded limit; do not truncate authority
  input and continue.
- Sort filesystem-derived collections before validation or output. Fixed input
  and build identity must produce byte-stable machine output where format
  permits it.
- Reject symlinks, trailing data, duplicate identities, unknown authority
  fields, and paths outside declared root at boundary that consumes
  them. Do not rely on later package to repair ambiguous input.
- Repository validators do not use network by default. Command that
  needs remote state must have explicit timeout, cancellation path, and
  output contract, and must keep remote observations separate from Git
  authority.
- Avoid platform-specific shell orchestration in portable tooling. If a
  subprocess is unavoidable, invoke it directly with `exec.CommandContext`, a
  bounded environment and output buffer, and checked exit status.

## Command contract

- Use exit code `0` for completed successful command, `1` for validation or
  operational failure, and `2` for invalid command-line use.
- Human output goes to standard output on success and standard error for
  warnings or failures. Machine output uses explicit flag and documented,
  versionable schema; never mix progress prose into JSON.
- Build identity includes release version, source revision, Go version,
  target operating system, and target architecture. It identifies software;
  it does not confer experiment or scientific authority.
- Errors name operation and affected path or artifact without exposing
  secrets. Preserve wrapped causes for programmatic checks.

## Tests and release evidence

- Tests use isolated temporary roots and cover success, malformed input,
  boundary exhaustion, path escape, symlink, duplicate, trailing-data, and
  deterministic-order cases where applicable.
- During local development, test changed packages and their affected
  downstream consumers, including CLI and integration contracts; `go test`
  does not select reverse-dependency tests automatically. Run race checks and
  vet for that scope. At complete Go integration/release gate, or when
  scope is unknown, unsafe or shared authority, run `go test -race ./...` and
  `go vet ./...` from `tooling/`, following
  [decision 0088](../decisions/0088-impact-scope-ci-and-local-validation.md).
  Formatting and static analysis must be clean without blanket suppressions.
- Keep `CGO_ENABLED=0` for release binaries unless reviewed capability proves
  that native linkage is required. Publish only operating-system and
  architecture combinations exercised by release gate.
- Native `20w` archives are optional parallel tooling; they do not replace the
  per-experiment OCI artifact required for released experiment. Go-native
  experiment runner uses static binary in minimal `scratch` or equivalent
  runtime image unless its declared boundary requires more.
- Released `20w` binary may validate, generate, catalogue, or launch bounded
  development paths. It must not relabel smoke, construction, or development
  run as scientific result.
