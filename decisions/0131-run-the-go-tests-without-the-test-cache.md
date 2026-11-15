# 0131 — Run the Go tests without the test cache

- **Status:** accepted
- **Date:** 2026-11-15
- **Decided by:** the coordination order recorded as
  `20-watts-gocache-masks-fixture-20261114` (2026-11-14; paraphrased: make the
  gate unable to replay a cached pass for tests that read files outside the
  module root); issue #459.
- **Authority:** `test:go` in `package.json`, `lane-go`, `lane-go-windows` and
  `lane-go-macos` in `.github/workflows/ci.yml`, and `goRaceTestCommand` and
  `crossPlatformGoTestCommand` in `scripts/validate-engineering-policy.mjs`.
  No claim, principle or status changes.
- **Related:** [0103](0103-run-the-go-tests-on-windows-and-macos-runners.md)

## Context

The Go module root is `tooling/`. In Go 1.27.4, the `cmd/go` test cache check
skips `stat` and `open` log entries for paths outside the module, `GOPATH` or
`GOROOT` root (`GOROOT/src/cmd/go/internal/test/test.go:2051-2061`). When a
test under `tooling/` reads a repository file outside `tooling/`, changing that
file leaves the cached test action valid, and a cached `go test` run replays
the prior `PASS`.

At commit `b7aa7a9d`, appending an undeclared relative import to
`experiments/workstation/fixture-019/runner.mjs` left `npm run test:go`
exiting `0` with `internal/nodeimage` reported as `(cached)`, whereas
`go -C tooling test -race -count=1 ./internal/nodeimage/` exited `1` in
`TestDescriptorsCloseOverRepositoryModuleImports/fixture-019`. Fifteen of the
52 packages under `tooling/` read repository files outside `tooling/`,
including `internal/clrsfixture` on the critical path.

## Decision

1. Pass `-count=1` on every suite-wide `go test` command: `test:go` in
   `package.json` and the `Test and vet Go packages` step of `lane-go` in
   `.github/workflows/ci.yml` run
   `go -C tooling test -race -count=1 ./... && go -C tooling vet ./...`, and
   the `Test Go packages` steps of `lane-go-windows` and `lane-go-macos` run
   `go -C tooling test -count=1 ./...`.
2. Leave the bounded fuzz step in `.github/workflows/ci.yml` (`-fuzztime=30s`)
   and the scheduled soak step in `.github/workflows/soak.yml` (which already
   passes `-count=1`) unchanged.
3. Update `goRaceTestCommand`, `crossPlatformGoTestCommand` and the three
   finding messages in `scripts/validate-engineering-policy.mjs` so the policy
   validator requires `-count=1` on `test:go`, `lane-go`, `lane-go-windows` and
   `lane-go-macos`, and update `docs/agent-working-sequence.md` to show the
   exact `test:go` command.

## Rejected alternatives

- Per-package bypass: 15 of 52 packages read outside-root files, and
  `internal/clrsfixture` holds about 87 of 89 s of suite wall time. Running
  only the affected packages measured 89.5 s and 91.0 s against 88.5 s for all
  packages, saving no wall time, and `go test` access logs miss files read by
  child processes.
- Inputs moved beneath the module root: moving outside-root inputs under
  `tooling/` would displace fixture-owned files from their canonical
  directories.

## Consequences

Suite-wide Go runs execute test binaries directly and no longer replay a cached
pass after an outside-root file changes. On the development host,
`go -C tooling test -race ./...` replayed from the cache in a median 5.2 s
(two runs) and took a median 83.0 s with `-count=1` (four runs, 81.1 to
91.3 s), at a 1-minute load average of 31 to 41 from parallel builds, so each
Go suite run costs about 78 s more. `make verify-all` runs the suite twice
(`npm run check` and `npm test`), about 160 s more per gate run.

## Verification and disclosure

`scripts/engineering-policy.test.mjs` updates valid fixtures to the `-count=1`
commands, keeps existing race-detector and platform-vet negative cases invalid,
and adds planted negative cases for the prior cached `test:go`, `lane-go`,
`lane-go-windows` and `lane-go-macos` commands with exact finding assertions.

The planted case from the context section is the regression check: with the
plant in place and the cache populated, the old `test:go` command exits `0`
and the new one exits `1` in
`TestDescriptorsCloseOverRepositoryModuleImports/fixture-019`.

Antigravity (Gemini 4 Carbon) drafted the edits and this record, and Claude
Code reviewed the draft, corrected the cost figures and ran the checks on the
workstation. Automated tests and retained command receipts describe the
exercised boundaries, not independent scientific review.
