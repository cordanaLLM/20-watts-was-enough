# 0108 — Run the two image-build chains concurrently

- **Status:** accepted
- **Date:** 2026-10-18
- **Extends:** [0045](0045-rewrite-renderer-layer-timestamps-before-recording-image-identity.md), [0077](0077-separate-render-pair-and-image-build-proofs.md), [0078](0078-reuse-verified-renderer-build-cache.md)
- **Related:** [issue #7](https://github.com/cordanaLLM/20-watts-was-enough/issues/7), [issue #302](https://github.com/cordanaLLM/20-watts-was-enough/issues/302)

## Context

After the CI fan-out in [Decision 0106](0106-fan-out-full-ci-to-impact-lanes.md) and the packing in [Decision 0107](0107-pack-short-workstation-fixtures.md), the `pdf-renderer-reproducibility` job bounds the full gate. Every recent main run selected the `image-build` proof, and its proof step took between 8m15 and 9m26. The step ran its two chains one after the other: create a locked builder, build without cache, verify the loaded image, remove the builder, then render. The second chain waited for the first although no decision requires that order and the second chain reads nothing the first one produces.

## Decision

1. In `image-build` mode, `collectProofBuilds` in `tooling/internal/pdfrender/reproducibility.go` starts both chains at once. The fan-out is bounded by `reproducibilityBuildCount` (two).
2. Each chain keeps its own fresh `docker-container` builder, `--no-cache` build, metadata and image ID files, render output and temporary directories. Both image tags are reserved for cleanup before either chain starts.
3. The first chain that fails cancels the other through a shared context. Each chain still removes its own builder, the owned image tags are still removed, and the errors are joined in build order. The builds enter the receipt in build order, so the receipt schema and its fields do not change.
4. Renderer retry diagnostics are serialised by a mutex, because both renders may now report at the same time.
5. `render-pair` mode stays serial: its second render needs the image of the first build.

## Why the proof stays independent

The image-build proof claims that two builders that share no state produce the same image and the same PDF bytes. Running them at the same time does not give them shared state. The builders are separate BuildKit containers with their own state. Neither build imports a cache: build 1 may export the cache seed of [Decision 0078](0078-reuse-verified-renderer-build-cache.md), and build 2 never reads it. Both loaded images go into the same Docker image store, as they did when the chains ran in sequence. Image identity is still read from the build's own metadata and checked against the loaded config, as [Decision 0045](0045-rewrite-renderer-layer-timestamps-before-recording-image-identity.md) requires.

## Consequences

- The proof step should approach one build plus one render instead of two of each. The hosted runner has 4 vCPUs and 16 GB of memory, so two concurrent builds compete for both. The gain is measured on the first main run after this change, not claimed here.
- The per-build timeout from the renderer lock still applies to each chain. A build slowed by contention fails at the same bound as before.
- When one build fails, the other stops early instead of running to completion. The failure evidence names the build that failed; the cancelled sibling reports a cancellation.
- Tests cover concurrent start (a barrier that the serial loop cannot pass), cancellation and builder cleanup when build 2 fails, and the serial render pair. Both mutants (the serial loop, and no sibling cancellation) fail them.

Antigravity (Gemini 3.8 Flash) drafted this engineering change and Claude Code reviewed it. Automated tests and retained command receipts describe the exercised boundaries, not independent scientific review.
