# 0129 — Run the pre-push gate on the pinned Node

- **Status:** accepted
- **Date:** 2026-11-12
- **Decided by:** the rulings recorded as
  `20-watts-was-enough-push-node-drift` (paraphrased: isolate the gate from
  host Node drift) and `20-watts-was-enough-gate-npm-runner-scope`
  (paraphrased: use mise for the repository pin within the gate job, and
  admit the whole gate through the pinned engine).
- **Authority:** the pre-push jobs in `lefthook-local.yml`,
  `tooling/internal/pinnednode`, `tooling/cmd/20w/hooks.go`, and the
  hook-skip list and `pinnedNodeGate` in
  `scripts/validate-engineering-policy.mjs`. No claim, principle or status
  changes.
- **Related:** [0095](0095-pin-the-praetor-engine-and-refresh-the-adoption.md)

## Context

The host distribution moved Node from 26.13.0 to 26.13.1 on 2026-11-12 at
07:31. The pretest `validate:runtime` check refuses 26.13.1: its numeric
sentinel produces `2.6077625303838716` where the repository requires
`2.607762530383872`. The engine's npm stages resolve Node from inherited
`PATH`, with no engine setting to select the repository version, so every
push from that host failed.

The dispatching session measured mise 2026.11.5 with global locked mode on
2026-11-12. With only `.node-version` and idiomatic Node version-file
support enabled, `mise install node` installed 26.13.0 and verified the
signed checksums. A tampered archive failed with a checksum mismatch.
`mise where node` alone could return an installed version without selecting
it from project configuration, so the wrapper also checks `node --version`.

## Decision

1. Read the exact release from `.node-version` and install it through mise,
   the established version manager. Force checksum and signature verification
   with `MISE_NODE_VERIFY=true` and `MISE_NODE_GPG_VERIFY=true`; enable the
   Node idiomatic version file for the mise calls. Add no `mise.toml`, so
   interactive shells keep the host Node. `.node-version` must be a regular
   file; a symlink, a directory or a file replaced between inspection and
   opening refuses the push.
2. Put that installation's `bin` directory first on `PATH` only inside the
   gate job. Missing mise, fetch failure, checksum mismatch or a reported
   version different from the pin refuses the push with the reason.
3. Run the whole gate under the pinned engine's `admit`, using its defaults
   of 16 GiB memory high, 24 GiB memory maximum and 4 GiB swap maximum. Wait
   at most 30 minutes for admission and run for at most 3 hours. Bound
   installation to 10 minutes, each query to 1 minute and captured output
   to 64 KiB; a failing command's diagnostic keeps the last 2 KiB of its
   output, so a reason printed after long output survives. Cancellation
   stops the command's whole process group. On a platform without Unix
   process groups the wrapper refuses the push with that reason.
4. Set `npm_config_cache` to `20-watts-was-enough/npm` beneath the user cache
   directory for this job.
5. Skip only the generated pre-push `gate` job through 2027-03-12, a category
   D exception of 120 days from this decision. The local `pinned-node-gate`
   job replays its exact engine command. The policy validator pins both
   command lines, requires the replacement while the skip exists and
   refuses the skip from 2027-03-13. Revisit when the engine selects Node
   from the repository pin.

## Rejected alternatives

- A container runner would need the npm test dependencies: Go, Python with
  NumPy, Chromium and a loopback network namespace.
- A runtime-only container would loosen the pretest boundary.
- A hand-written fetcher would duplicate the version manager's download,
  checksum and signature handling.

## Consequences

Contributors need mise on `PATH` and a Linux or macOS host to push; the
Windows CI lane still compiles and tests the package. The wrapper leaves
the shell's Node selection unchanged and preserves the gate's exit status.
Re-pinning the repository to 26.13.1 remains a separate unit.

## Verification and disclosure

The Go runner tests inject tool discovery, subprocess results and cache
locations; they install nothing and do not execute the repository gate.
On Unix hosts, further tests run the test binary itself as the child
process to check the output bounds and the failure tail.
Policy fixtures cover replacement omission, command drift, extra job keys,
duplicate execution and exception expiry. The dispatching session runs the
repository gates; these fixture contracts do not establish a successful
live push.
