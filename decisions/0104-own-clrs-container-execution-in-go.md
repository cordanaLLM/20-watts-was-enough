# 0104 — Own CLRS container execution in Go

- **Status:** accepted
- **Date:** 2026-10-16
- **Extends:** [0079](0079-run-the-frozen-clrs-development-tree-through-20w.md)
- **Related:** [issue #12](https://github.com/cordanaLLM/20-watts-was-enough/issues/12)

## Context

The frozen development tree already runs through the Go CLI, including inside
the general tooling image. Contributors still have to assemble two Docker
commands, preserve their exits and clean up a timed-out container themselves.
That outer lifecycle needs one maintained owner, just as the inner controller
and verifier already have one.

## Decision

1. `20w experiment run-clrs-shakedown-container --execute` owns one execution
   followed by a separate read-only container check. It requires the existing
   fixture tree, independently retained tree hash, run identity, a fresh output
   parent and an exact already-loaded `sha256:` image ID. It never builds,
   pulls, tags or publishes an image. The native command remains separate.
2. Accept only an operator-trusted tooling image on the reviewed local Linux
   `amd64`, cgroup-v2 Docker configuration. Use the fixed Unix socket, an empty
   private Docker configuration and an explicit environment, without inherited
   remote routing or credentials. Inspect image and container configuration
   before starting work; unsupported or changed controls fail closed.
3. Both containers use a read-only root, no network, a non-root operator UID
   and GID, no added capabilities, no new privileges, 1 CPU, 128 MiB without
   swap, 64 PIDs and bounded local logs. Only the execution's `outputs/` bind
   is writable. The checker has all three binds read-only. Host-written
   `witness/` files cannot be reached through a writable bind, but may be
   visible through the read-only repository bind when output is inside it.
4. Use no retries. Work has a 240-second context and a separate 60-second
   owned-cleanup context. Execute, check and control commands have 90-, 45-
   and 10-second contexts; stop grace is five seconds. Each process has a
   bounded two-second pipe-wait allowance after cancellation or process exit.
   Cap work and
   cleanup at 16 and 14 commands. Combined command output is at most 64 KiB
   for control and 4 MiB for attached execution or checking; the host witness
   has a 16 MiB aggregate cap. These are not hard bounds on blocked filesystem
   calls or the writable bind's disk use.
5. Preserve command arguments, outputs, external exits, observed container
   exits and OOM state, plus cleanup outcome. Distinguish a start attempt from
   observed execution and an unknown exit from zero. Clean up only containers
   whose name, identity and ownership are verified; join cleanup errors with
   the original failure. Keep partial files and refuse existing output names.
6. Reuse the unchanged inner runner and host checker. Compare the attached
   execution report with the host-checked bundle, run its container checker
   with read-only mounts, then recheck the bundle and original inputs. The
   separate outer schema-1 report binds the selected image and inner receipt
   hash; fixture and source identities remain in that inner receipt. A
   successful external exit is required alongside either unsigned report.
7. Keep the six tasks, 48 examples, 192 complete-run events, candidate routes,
   inner schema and `NO_RESULT` authority unchanged. Neither this command nor
   its local image establishes image admission, authenticated compilation,
   whole-task resource accounting or a scientific result. Energy stays
   unavailable and joules null. An operator-trusted image is required: the
   writable bind has no hard disk quota, so this is not a hostile-image sandbox.

## Consequences and review

Contributors can retain a failed or completed development run without copying
the container lifecycle into another script. The
[usage contract](../tooling/clrs-specialist/README.md) owns its walkthrough.
Decision 0076's existing support inventory records the new production helpers;
its parser, package allowlist and renderer authority do not change.

The terminal witness precedes its own write and final file closes. A later
I/O failure remains a non-zero external failure, not a rewritten success
receipt. Output cleanup is an operator decision, not an automatic retry path.

Codex was materially used for implementation, prose, source review and tests
under maintainer direction. Mocked lifecycle checks and any separately
retained local execution witness are engineering evidence, not independent
human research review. No third-party dependency, imported source body,
dataset, measurement protocol or claim status changes. Existing licensing,
SBOM, source-provenance and experiment-image release gates remain open.

## Supersession

Supersede this record before changing the frozen experiment, granting remote
Docker routing or image acquisition, widening the accepted execution profile,
or promoting this development witness into a claim-eligible protocol.
