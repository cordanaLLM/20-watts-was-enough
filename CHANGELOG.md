# Changelog

All notable conceptual and structural changes are recorded here. Git retains
the exact diff; this file records why the project changed.

## [Unreleased]

### Fixed

- Documentation validation skips generated agent harnesses, identified by the
  compiled-from-`AGENTS.md` banner they carry. Their repository-relative links
  resolve against their own directory rather than the repository root, and the
  harness diagram would otherwise be counted once per vendor target. The
  canonical `AGENTS.md` is validated unchanged.

- Repository manifest paths are compared slash-normalised, so every manifest
  beneath `.github` was rejected on Windows where `filepath.Clean` returns the
  host separator. Path confinement, traversal refusal and absolute-path refusal
  are unchanged; only the separator comparison moved.

- Directory synchronisation after an atomic write is skipped on Windows, where
  flushing a directory handle fails with a permission error. POSIX keeps its
  `fsync` on the containing directory; on Windows the rename itself carries the
  ordering guarantee. Affects CLRS fixture generation and shakedown writes.

- Framework build output under `.next`, `.vinext` and `.wrangler` is excluded
  from linting and from version control, alongside the existing `dist` and
  `build` exclusions. Generated route types are not project source, and were
  both gating the lint run and offered for commit.

- Ordinary PDF generation retains both exact PDF/manifest pairs when they
  disagree, without replacing the public edition. Completed evidence survives
  a later retention or cleanup failure; incomplete bundles are reported as
  such. These local diagnostics do not impersonate a reproducibility proof.

- CLRS development receipts start their diagnostic run interval before fixture
  loading, task binding and executable hashing. Deadlines and `NO_RESULT`
  authority stay unchanged. Final receipt writing and output-root closing remain
  outside this interval; it is not complete task-resource accounting.

- Successful PDF renderer runs preserve bounded retry warnings on standard
  error, with a separate identity for each render. Warning delivery errors
  are reported after comparison and cleanup. The reproducibility proof keeps
  its original outcome and retained mismatch artifacts if delivery fails.
  Rendering settings, receipt formats and the existing retry limit stay unchanged.

- The printed book uses its white page canvas without a redundant body fill.
  That fill's final-page extent differed between two otherwise identical PDF
  renders. Content surfaces and screen styles retain their existing owners;
  publication checks still require byte-identical independently rendered pairs.

- Math validation and delimiter formatting use parsed Markdown code boundaries,
  so literal shell examples are not treated as equations. Both commands share
  a bounded inventory that excludes worktrees, evidence and generated copies
  while retaining nested canonical documentation. Formatting preflights the
  complete change plan and replaces files atomically one at a time, reporting
  any completed replacements if a later write fails. Equation checks remain
  strict; exact math-script edits select research and site checks, with full
  fallback for unknown paths or shared validation authority.

- Local pre-commit checks follow changed contracts and downstream consumers,
  with a full-gate fallback for unknown, unsafe or shared-authority scope.
  Complete integration, merge, release and publication checks remain required.
  Reusing earlier test evidence requires unchanged tested inputs and fresh
  checks of the affected scope; it cannot establish an exact-tree full pass.
  The README and contribution guide link to this same validation sequence.

- Frozen CLRS runner leaves select the existing container, Go and release
  checks. Publication-inventory changes add site checks; shared or unknown
  authority still selects the full gate. Its usage README also selects the
  existing research checks, including notation validation of command examples.

- Browser startup waits now report process termination signals and the last
  HTTP status or recognised fetch failure on timeout. Diagnostics omit URL
  credentials, queries, fragments and response bodies; the existing deadlines
  remain unchanged.

- Presentation-only PDF checks build the locked renderer once and still
  compare two isolated PDF/manifest pairs. Toolchain changes, full plans,
  unknown companion paths and tagged releases retain independent two-builder
  proofs. Eligible CI runs can reuse a digest-checked BuildKit layer cache
  seeded by trusted main pushes; loaded image identities and both renders
  remain checked. Cache use is explicit in receipts and forbidden for releases.

- Printed readiness-stage values remain with their labels before the following
  evidence table, without changing the card layout or screen positioning.

- Printed chapter titles preserve word separation without changing font size
  or screen typography. Semantic audit failures
  distinguish remaining debt from the full retained sentinel inventory.

- CI planning and the hosted PDF proof now use private Go drivers with tested
  minimal dependency closures. They share argument handling with the public
  command and reject failed or short output writes. Experiment help, dispatch
  and handlers now have one package owner, selecting container, Go and release
  checks without scheduling unrelated workstation or renderer work. Tagged
  release proofs and full-gate authority remain unchanged.

- PDF reproducibility receipts now hash the actual image config bytes instead
  of assuming Docker's loaded image ID always names a config. Schema 4 retains
  exact proof bytes for both config-ID and manifest-ID Docker stores, while
  keeping their different manifest-evidence boundaries explicit. The bounded
  export admits the locked image's larger uncompressed classic-store layers.

- Pages browser checks wait for the document root during navigation before
  reading layout dimensions. Unexpected browser errors still fail the check.

- Pull-request path labels now cover the Go PDF renderer, PDF-tools and CI
  planner owners. Renderer-only changes retain their publication and CI labels
  when the existing labeler synchronizes metadata.
- The browser print regression now waits for Chrome's matching media-change
  event before inspecting overflow semantics, including the return to screen.
  Full-book pagination has its own bounded transition stage; the existing
  five-second semantic checks and their assertions remain unchanged.
- Focused research documents now expose the book and PDF routes once, compact
  exact identity pairs into labelled rows on narrow screens, and show at least
  one complete line of canonical prose in the initial `390 x 844` viewport.
  The 320-pixel reflow boundary still keeps long revisions and routes inside
  the document width.
- Both PDF commands now reject a stale or incomplete installed npm dependency
  tree before image work, and stop if package metadata changes before rendering
  or publication. This catches copied installs such as KaTeX 0.18.4 against a
  0.18.5 lock without downloading packages or claiming payload-byte attestation.
- Decision 0072 runs the three independent site-browser contracts in
  process-isolated Node workers with a concurrency ceiling of two instead of
  one serial process. The first live three-worker run exhausted its unchanged
  fragment-stability deadline under contention despite ending on a visible
  target, so two workers retain overlap without repeating that level of
  contention.
  Every assertion,
  viewport, route, source identity and deadline stays exact. Vite now binds all
  three ephemeral listeners in-process with private caches and in-memory config
  loading; Chrome owns each ephemeral debug port until shutdown. Test
  cancellation reaches HTTP and DevTools waits, and ordered cleanup settles
  every browser, server and profile step. Direct CSS, research-object and CDP
  test leaves now select only their executable site or release consumers;
  package and shared renderer-helper changes remain full-gate authority. The
  301-second group from full-plan run 33950189857 is the comparison baseline;
  issue 7 remains open until a complete live gate proves the three-to-five-
  minute target.
- PDF semantic baseline tests and their dedicated audit helper now select the
  release lane rather than expanding to full CI plus renderer reproducibility.
  Production PDF finalisation, the manual Poppler audit, unknown scripts and
  selector changes remain fail-closed.
- Decision 0073 makes one deterministic USTAR the only PDF-tools candidate
  publication and consumer authority. It contains the canonical `NO_RESULT`
  receipt and all three hash-bound candidate streams, is reproduced twice from
  unnamed staged descriptors, and becomes visible through one no-replace
  `linkat`. Separately named files remain non-authoritative convenience copies;
  successful candidate preparation leaves no standalone receipt. The consumer
  verifier requires an independently recorded outer SHA-256 and rehashes every
  member. Descriptor traversal closes ancestor-symlink and cleanup races while
  retaining exact partial evidence; arbitrary same-UID mutation remains outside
  the producer boundary. Unsupported platforms and filesystems fail closed.
- Decision 0070 makes Fixture 026 check a missing arm commitment against
  existing evaluator state before invoking the isolated policy bank, so a
  bounded policy timeout cannot mask deterministic resume corruption. The
  policy regexes and frozen VM deadlines do not change. The complete local Go
  workstation aggregate now defaults to four active process trees inside its
  hard ceiling of eight; the separate GitHub matrix keeps its eight-job bound.
  All paths remain development validation with `NO_RESULT`.
- The deterministic PDF finaliser now gives Chromium's `Strong` and `Em`
  structure types an explicit PDF 1.x compatibility mapping. Poppler's 627
  unknown-type diagnostics are removed without changing the page content or
  canonical HTML. Six nonlinear reading-order sentinels remain `known-debt`;
  this is not a PDF/UA or WCAG conformance claim.
- Decision 0069 makes the CI impact planner map a deleted file through its
  former repository path instead of sending every deletion through the complete
  workstation and container gate. Loadable selector and full-authority changes,
  plus unknown paths, still select full; a missing or invalid mapping blocks
  planning. Git-classified renames and copies, type changes, and non-regular
  object modes remain full-plan boundaries. The projected plan schema is now 2
  so the changed reason and mode contract cannot be mistaken for schema-1
  output.

### Added

- The repository is prepared for transfer to `cordanaLLM/20-watts-was-enough`.
  The Go module path, repository URLs, `CITATION.cff` and the standards manifest
  owner follow the new owner; the name is unchanged so published citations keep
  resolving. Historical decision records keep the owner they were written with,
  and published container images keep their pinned identity until they are next
  rebuilt. See [decision 0083](decisions/0083-transfer-the-repository-to-cordanallm.md).

- Praetor repository governance, with `AGENTS.md` compiled to six vendor agent
  harnesses. The canonical contract is unchanged and keeps its authority;
  `CLAUDE.md` is now generated from it and must not be edited directly. The
  `planning-artifacts` archetype is pinned explicitly because auto-detection
  selects a backend-service profile from `package.json`. Existing HISS
  infractions are baselined so current code stays legal while new code is
  gated; a baseline records what was already present, not quality. See
  [decision 0082](decisions/0082-adopt-praetor-repository-governance.md).

- `run-clrs-shakedown` executes the frozen 48-example local Go development
  tree through the existing controller, specialists and held verifiers. It
  requires an independently retained input hash and preserves bounded,
  no-overwrite event evidence. Its read-only checker replays the existing
  policy and verification rules; both modes remain `NO_RESULT`, with energy
  unavailable and image admission unchanged.

- `prepare-clrs-loaded-image` connects a checked CLRS archive to an
  already-loaded local image and writes the original metadata and bounded
  receipt for managed generation. Docker checks are read-only; preparation
  neither acquires an image nor changes `NO_RESULT` or admission.

- The read-only Go command `inspect-clrs-image-archive` verifies a supplied
  candidate archive, preserves original image metadata and checks ordered
  layer identities within fixed byte and time limits. It needs no Docker or
  network access; a match does not admit or publish an image.

- One explicit `generate-clrs-fixtures --execute` command runs the fixed CLRS
  generator in an already-loaded local image, validates six files and 48
  examples, and preserves bounded execution and cleanup evidence. Its portable
  `--check` mode verifies a retained bundle without Docker or writes. Both
  remain `NO_RESULT`; neither admits an image or authenticates external runs.

- A Go command renders the fixed CLRS generation program directly from the
  existing source, grid and image contracts. It preserves the tested upstream
  configuration binding without maintaining a separate task or seed list;
  rendering a program does not execute it or admit the generator image.

- A read-only Go command compares two complete CLRS fixture directories and
  checks both through the existing source-bound importer. Its bounded JSON
  report records exact file and tree identities, byte differences and imported
  counts without treating matching construction fixtures as a research result
  or admitting the generator image.

- A read-only Go checker verifies retained CLRS scanner-bundle identities and
  matches locked wheels to installed Python metadata. It reuses the original
  scanner records without rerunning the scan or treating consistent metadata
  as authenticated execution, licence approval or image admission.

- A Go candidate-context command packages the pinned CLRS source, selected
  wheels and verified historical Promise evidence into a deterministic tar.
  Its read-only checker uses the same explicit inputs; offline-install
  Dockerfile generation and no-replace publication leave image admission
  blocked and preserve `NO_RESULT`.
- A Go-owned candidate command reproduces the locked Promise 2.3 wheel in two
  bounded, offline containers, checks the exact wheel and embedded MIT bytes,
  and retains a source-bound receipt with a read-only consumer. Input
  verification precedes effects; cleanup verifies ownership and removal.
  The CLRS generator image remains blocked and all output has `NO_RESULT`
  authority.
- Decision 0071 locks one 61-file, 823,932,066-byte Linux `amd64` wheel
  selection for the pinned CLRS generator graph. Sixty files map directly to
  `uv.lock`; the sole `promise==2.3` source build binds its sdist, three build
  tools, candidate step arguments, twice-observed local byte identity and MIT
  licence provenance while the complete build procedure and reproduction
  receipt remain explicitly missing. Go now renders a candidate manifest to a
  new path and verifies a materialised directory without Python, resolution or
  network access. Compatibility is bound to CPython 3.13, Linux `amd64` and
  glibc 2.36 from the pinned Bookworm base; verification bounds enumeration and
  bytes before hashing and rejects concurrent directory drift. No wheel payload
  enters Git, the generator image remains blocked, and all construction state
  remains `NO_RESULT`.
- Decision 0068 makes the Go workstation catalogue own each artifact's exact
  package script as well as its creation rank in one embedded machine-readable
  authority. CI consumes the projected, validated `{artifact, script}` objects
  without repeating a nineteen-arm shell dispatch. The local aggregate now
  runs core and all nineteen unchanged scripts through the same creation-ordered
  catalogue with at most eight active process trees, a 30-minute and 2 MiB
  combined-output bound per job, a closed environment, cancellation and
  post-wait tree cleanup, and a deterministic complete-failure summary. The
  strict preflight freezes exact Node argument vectors before concurrency, so a
  later package-file rewrite and npm lifecycle hooks cannot change execution.
  It also proves that the catalogue covers every discovered workstation test
  exactly once and each manifest `full_tests` path exactly once through its own
  artifact jobs. The test files, assertions, seeds, horizons and `NO_RESULT`
  boundaries do not change; issue 7 remains open for a measured complete live
  workflow.
- The Go CI projection now lists the longer recently measured workstation jobs
  first inside the unchanged eight-job concurrency bound. The exact
  nineteen jobs, static commands, tests and fail-closed success authority stay
  intact. Replaying two completed runs with unchanged durations and ideal slot
  availability projects 78–87-second shorter matrix spans. Separate renderer
  and full-quality bottlenecks remain, so issue 7 stays open until a live full
  run measures the new order and complete workflow.
- Fixture 026's three ledger-semantic resume hostiles now run in an eighth
  exact workstation shard. Two recent full-plan runs measured those tests at
  162–172 seconds inside a 377–405-second shard-5 payload; the four retained
  files accounted for 215–233 seconds. The planner, workflow and policy checks
  keep every registered test in exactly one bounded shard, while the aggregate
  local gate, assertions, seeds, horizons and `NO_RESULT` boundary remain
  unchanged. The first live full-plan run measured both new shard jobs
  successfully, while the separate PDF-renderer and full-quality bottlenecks
  keep issue 7 open.
  The first eight-shard run made the new shard green and exposed a contradictory
  150-second outer bound around tighter browser phases whose combined budgets
  are longer. The outer bound is now 240 seconds while every render, navigation,
  reflow and cleanup phase keeps its existing tighter deadline and assertion.
- Decision 0063 gives the public overview, document reader, and help route one
  parsed CSS authority with one ordered responsive family. A deterministic
  PostCSS guard now rejects same-scope selector duplication, ownership leaks,
  breakpoint drift, global CSS growth beyond its reduced ceiling, and loss of
  the publication measure or leading bounds. Book, shared-control, and print
  rules remain in the global owner; the 12-route viewport comparison stayed
  pixel-identical while `app/globals.css` fell from 4,973 to 2,302 lines. At the
  360-by-225-pixel reflow boundary, the shared mobile navigation now scrolls
  locally so every destination and its keyboard focus remain in the viewport.
- Decision 0059 makes dependency advisory checking a single explicit security
  decision in each full CI or release gate. Every locked install now suppresses
  npm's implicit audit submission; the enforcing command audits the canonical
  lock rather than the mutable installed tree. Policy tests reject audit
  fan-out, duplicate or reordered audit commands and failure bypasses.
- Decision 0057 and a trusted-main Go projection now derive pull-request
  milestones and complete managed classifications from one explicit mapped
  issue reference. The bounded workflow refreshes path labels, never checks out
  pull-request code, preserves concurrent unrelated-label edits, refuses
  ambiguous references, confirms both records before targeted writes and
  verifies both records by bounded readback. The canonical label manifest now
  also closes the accepted Conventional Commit type set across CI and metadata;
  the live ruleset now requires the separate title gate, so title edits rerun
  that small check without retaining the transitional CI bootstrap or
  restarting code tests.
- Managed issue status now follows the issue lifecycle from trusted `main`.
  Close events and the canonical metadata repair remove active status labels,
  an existing `status:wontfix` remains explicit, and reopen events reset the
  mapped issue to `status:needs-triage`. Canonical repair also restores triage
  when an open issue has no active status and removes stale `status:wontfix`
  beside one active status; multiple active states still fail closed. The
  bounded Go path preflights every mapped issue, preserves non-status labels,
  validates each mutation response and reads the result back. GitHub's maximum
  pending queues avoid the default single-slot replacement of non-coalescible
  issue and pull-request lifecycle events. Issues 54 and 55 are bound to M0 as
  tracked work items.
- Managed pull requests now use the same closed status vocabulary. Merge
  removes every status; an unmerged close removes active statuses while
  retaining an existing `status:wontfix`; reopen reruns the linked issue
  projection. The trusted workflow verifies merge state, skips path labeling
  and preserves every other label and the existing milestone on close, and
  refuses ambiguous or unknown status identities. Full metadata repair now
  discovers candidates through separately bounded managed-status and open-PR
  queries and reuses the same reconciler. The exact-reference open scan repairs
  missed reopen drift even when no managed status remains; irreducibly
  unreferenced or closed unknown-status items still require an event or number.
- A static Linux `amd64` CLRS shakedown image definition now exposes all six
  frozen exact-program specialists through one bounded stdin/stdout JSON
  contract. Its scratch runtime is exercised without network, mounts, a
  writable root or elevated privileges, and every candidate response remains
  `NO_RESULT`.
  Dataset membership, decision recording, independent exact verification and
  release admission remain outside this construction-only process boundary.
- Decision 0067 and one shared research-object projection now bind each focused
  English Pages document, its no-JavaScript fallback and the web-book cover to
  the continuous-edition label and available exact build commit. A parsed,
  non-inferred route index exposes only authored claim, principle, audit and
  experiment links, including exact claim-ledger `Used by` backlinks. Book and
  PDF routes stay adjacent; edition-specific disclosure is omitted without an
  explicit mapping; typed feedback retains the path, route, edition, revision
  and available fragment in a bounded one-line locator. Release PDF rendering
  now requires, displays and records both the verified tag and commit in its
  manifest and reproducibility receipt, while public hosts ignore query-
  provided renderer identity. Bounded Markdown traversal, source-closure
  mutation coverage, static mutants and rendered-browser checks through the
  100-record narrow-screen case reject resource exhaustion, stale or duplicate
  identity, hidden disclosure state, lost identity and Pages-base-path drift.
- The existing specialist controller now admits a route only from an explicit,
  time-bounded positive-fit and ready observation. It distinguishes
  `measured-fit`, `known-no-fit`, and `unknown`. Measured fit binds a caller-owned
  basis identifier, measurement time, and bounded expiry, after which it becomes
  unknown; the local CLRS adapters retain a separate construction-only
  `task-compatible` state. Per-request resource limits remain at the policy and
  adapter boundaries. Each frozen task accepts at most two route candidates.
  Selection and a token-backed, one-shot capacity
  reservation are atomic; per-specialist and aggregate queue and active-work
  limits, wait and readiness retries are bounded; FIFO capacity matching keeps
  overlapping routes from starving older eligible work; equal ranks break by
  specialist identity; and cancellation, deadlines and freshness are checked
  inside serialised state before invocation and after timer wakes. Typed
  rejection and fallback remain empty `NO_RESULT` construction outcomes. The
  pre-effect recheck also falls back when its positive evidence differs from
  the already recorded binding. The CLRS registry projects its six closed
  adapters into this same admission surface without adding another controller
  or operational constants.
- A digest-pinned apko/Wolfi foundation now closes the Linux `amd64` Poppler
  26.08.0 PDF-tools graph at 45 APKs. Its offline Go validator binds the config,
  lock, exact APK retention metadata, upstream source identities, the pinned
  Wolfi root recipe licence, five missing notice files, runtime containment and
  the deterministic final-layer design.
  Recorded construction checks remain `NO_RESULT`; source delivery, publication
  and exact-digest CI consumption stay open behind issue 20.
- A local-only Go reproducer now runs the exact pinned apko assembler twice,
  canonicalises the two SPDX relationship graphs, projects the base archives
  into private OCI layouts and builds the final notice layer in two fresh
  pinned BuildKit 0.32.2 instances. Their daemon networks, memory, PID, CPU,
  parallelism and exact daemon-side entitlement are checked explicitly; the
  final builds request no entitlement and use no cache or build network. It compares complete archives
  and image identities, checks licence bytes, Poppler versions, configured
  UID/GID, forbidden paths and runtime containment, then writes a bounded
  atomic `NO_RESULT` receipt. It does not create a source
  bundle, publish an image or admit a release digest. Runtime cleanup removes
  only its random alias and leaves shared untagged digest content under Docker
  cache management, so concurrent local reproductions cannot delete each
  other's image.
- The same reproducer can now prepare the issue-20 candidate at four explicit
  new paths after the complete two-build and runtime checks pass. A bounded Go
  downloader retains the 45 exact APKs and Poppler source archive by URL, size
  and SHA-256; the deterministic source bundle adds the maintained authority,
  notices, Wolfi recipe and licence, and one canonical apko SPDX document under
  a sorted `SHA256SUMS`. Relationship order is the only admitted semantic
  normalisation; the receipt preserves both raw build identities and binds the
  canonical document, source bundle and one final OCI archive inside one
  deterministic publication bundle while keeping remote publication, digest
  admission, legal conclusions and scientific use blocked under `NO_RESULT`.
  The three separately named files are convenience
  copies; the independently hash-bound outer bundle is the consumer authority.
- Decision 0055 and a source-bound Go contract now freeze the CLRS-Text
  controller shakedown to six named task families, a bounded 48-example
  construction plan and explicit fixed-four-endpoint semantics for segment
  intersection. The shared registry removes the controller's parallel task
  list; no generator image, dataset, model run or scientific result is added.
- The CLRS-Text importer now admits only the exact task files and length/seed
  cells selected by that source-bound generation contract. Candidate and held-
  reference records carry versioned source-and-contract identities, remain
  separated, and must pass deterministic pairing validation before controller
  use. No dataset is generated or executed; every record remains `NO_RESULT`.
- The CLRS generator-image foundation now binds a checksum-closed official
  source archive, the newest reviewed CPython/TensorFlow/JAX wheel intersection,
  pinned resolver, exact 62-package dependency graph, shared builder identities,
  finite runtime containment and an offline Go validator. Pinned upstream
  licence material and finite SBOM retention remain mandatory admission gates.
  The state remains `NO_RESULT` and blocked: dependency resolution is closed,
  but no Dockerfile, wheelhouse, image, SBOM, runtime smoke or byte-compared
  fixture generation is claimed.
  The same slice hardens the shared renderer-authority reader against ancestor
  links, pathname replacement and same-size byte mutation without rejecting a
  valid Windows path solely because its canonical drive spelling differs. The
  CI impact map now routes the importer and all six contract-named specialist
  packages through the Go lane instead of treating each new package as an
  unknown path.
- The insertion-sort construction vertical now accepts only the validated
  candidate and held-reference sets selected by that contract. Candidate IDs
  become controller request IDs, prompt length and no-hint semantics are checked
  against the parsed input, and the exact answer stays in a separate verifier.
  Synthetic tests exercise the boundary; no dataset or scientific result is
  added.
- The binary-search construction vertical now reproduces the pinned CLRS
  lower-bound operation in Go: it returns the first index whose key is not below
  the target, clamped to the final index. A separate linear verifier checks the
  contract-selected references while candidate requests retain only source-bound
  prompts and IDs. Synthetic tests add no dataset or scientific result.
- The matrix-chain construction vertical now reproduces the pinned synchronous
  split-cost operation and the generator's full split-pointer probe matrix in
  Go. A separate interval-order verifier proves each held split is cost-minimal
  without calling the specialist solver; source-bound requests remain isolated
  from held answers, and all construction output remains `NO_RESULT`.
- The Bellman-Ford construction vertical now reproduces the pinned synchronous
  relaxation and predecessor-vector grammar in Go. A separate Dijkstra verifier
  checks each held predecessor forest against the same bounded non-negative
  graph without calling the specialist solver; source-bound requests remain
  isolated from held answers, and all construction output remains `NO_RESULT`.
- The KMP construction vertical now parses the pinned categorical string split
  and returns the first haystack match, or the haystack length when none exists.
  A separate naive matcher validates held references without calling the KMP
  solver; source-bound requests retain no answer bytes, and all construction
  output remains `NO_RESULT`.
- The segment-intersection construction vertical now reproduces the pinned
  closed-segment operation and exact no-hint scalar-mask grammar in Go. A
  separately held orientation verifier covers endpoint contact, collinear
  overlap and degenerate point-segments without calling the specialist solver.
  The sole task size remains a fixed four-endpoint geometry control, not a
  length-extrapolation probe, and all construction output remains `NO_RESULT`.
- A source-bound breadth-first-search catalogue candidate now reproduces the
  pinned unweighted-graph grammar, synchronous reachability waves and
  row-major predecessor tie rule in Go. An independently arranged shortest-hop
  verifier cross-checks deterministic synthetic graphs. BFS is not admitted to
  Decision 0055's frozen six-task fixture or controller contract, and every
  output remains `NO_RESULT`.
- A versioned PDF semantic sentinel now binds the current source, book, A4 and
  tag metadata, Poppler tool identity, separate structure and text streams,
  exact diagnostics, and six nonlinear content anchors. Atomic evidence keeps
  both validated reports and failure envelopes. Recognized structure and
  reading-order defects remain explicit `known-debt` failures; the sentinel
  makes no PDF/UA or WCAG conformance claim.
- A project-local publication-design skill now treats the continuous web book
  and generated PDF as one source-bound publication. It requires bounded
  page-class sampling, rendered PNG inspection, extracted reading-order checks,
  explicit accessibility limits, and focused generation/integrity evidence
  instead of approving print design from CSS or tag state alone.
- Decision 0047 keeps Cloudflare as the public Pages TLS authority, records the
  current automatic Full origin-mode limitation, and adds a bounded Go probe
  after every successful Pages deployment for the exact redirect, Cloudflare
  response headers, HTTPS status and trusted certificate lifetime.
- A project-local maintenance-automation skill now admits only recurring,
  machine-checkable upkeep and routes it through existing Go, manifest,
  validator, Renovate, or GitHub-workflow authorities with bounded check,
  repair, idempotence, permission, and removal contracts. Its pinned prior-art
  audit records retained patterns from `obra/superpowers` and K-Dense AI's
  `scientific-agent-skills` without importing their runtime machinery.
- The six research-roadmap stages now project into declarative GitHub
  milestones and one repository-bound issue map through a bounded
  standard-library Go command and least-privilege trusted-main workflow. The
  command preflights every remote scope before writing, validates mutation
  responses, reads the result back and resumes safely after partial transport
  failure. It does not infer pull-request assignments. GitHub counts
  coordination records; the roadmap, claim ledger and qualifying result path
  retain their separate scientific authority.
- A project-local research-design skill and design-system contract now ground
  layout, typography, colour, diagrams and visual identity in reader tasks,
  semantic ownership, accessibility and retained rendered evidence. An audited
  prior-art record preserves the useful external skill patterns without runtime
  instruction fetching, taste scores or automatic humanising.
- The Go command now exports deterministic, source-bound translation candidate
  bundles, validates returned bundles without writing, and imports structurally
  valid drafts into candidate-only working artifacts. The provider-neutral
  exchange preserves glossary choices, drafting-tool disclosure and
  language/domain review metadata, rejects stale English source, and cannot
  write to the reviewed translation tree or publication manifest. Structural
  validation does not assess translation quality or grant publication authority.
- Pull-request CI now derives a bounded Go impact plan from the exact base and
  head commits, then runs a common gate plus only the selected Go, release,
  research, site, container, and workstation lanes. Workstation artifacts use
  an allowlisted matrix; selector changes,
  unknown paths, Git-classified renames and copies, type changes, non-regular
  object modes, and invalid plans fail closed to the full gate. Mapped regular
  file deletions select their owning lanes. Pushes to `main`, manual runs, and
  release verification retain the complete repository gate.
- A standard-library-only Go scaffold encodes the six-task CLRS-Text
  development slice as a pure typed policy and a decision-record-before-effect
  runner seam. It bounds request and result bytes, requires a separate exact
  verifier, terminates unsafe states through typed refusal or abstention, and
  keeps every output at `NO_RESULT`; generator, fixture, model and resource-
  receipt identities remain unfrozen.
- A strict CLRS-Text source lock pins the inspected Apache-2.0 upstream commit,
  tree, generator and requirements file. Its standard-library Go importer
  rejects ambiguous or unbounded JSON, separates candidate-visible prompts
  from verifier-only answers, records requested length versus fixed-four-
  endpoint semantics, and emits deterministic `NO_RESULT` identities without
  selecting tasks, sizes, seeds or a generator image.

### Changed

- Selected experiment-source provenance now has one bounded book inventory.
  Its exact CI owner selects release and site checks alongside other changed
  sources, while the parser, strict JSON helper and renderer dependencies stay
  protected. Source bytes and PDF freshness remain bound; no timing gain is
  claimed. Decision 0076 extends the private-driver split.

- Candidate 010's inline staged-verification diagram is now its sole editable
  owner; the unused standalone copy and its exact-duplicate allowance are gone
  without changing the diagram body or experiment contract.
- Candidate 014's inline observation-chain diagram is now its sole editable
  owner; the unused standalone copy and its exact-duplicate allowance are gone
  without changing either candidate diagram or the experiment contract.
- Workflow-policy checks now parse dynamic npm command prefixes with bounded,
  linear scans instead of one backtracking-prone expression. Long assignment
  and wrapper-flag prefixes remain covered, while variable arguments outside
  command position do not become false positives.
- The pinned book renderer now retries exactly once, within its existing
  300-second print budget, only when Chrome returns the terminal `Printing
  failed` result. Other protocol failures still stop immediately, diagnostics
  retain the CDP method and code, and the two-render byte comparison remains
  the publication gate.
- The reviewed patch set now uses Goldmark 2.0.1, KaTeX 0.18.5,
  `@types/node` 26.4.1, `@types/react-dom` 19.2.7, `globals` 17.12.0 and
  `typescript-eslint` 8.69.0. TypeScript remains at 6.0.3 because
  `typescript-eslint` requires a version below 6.1.0; ESLint remains at 9.39.5
  because the React and JSX accessibility plugins do not yet declare ESLint 10
  support. The exact package graphs and source-bound book provenance are
  regenerated without changing experiment or result status.
- The document reader now keeps only its section outline beside the article.
  Corpus search, filters, current-document context and native document links
  move into a keyboard-operable drawer that returns focus when it closes.
- The shared language control and no-JavaScript reading fallback now list only
  English and reviewed translations published for the current source route.
  Other EU languages use a separate source-bound contribution route instead of
  appearing as readable editions. Canonical and translated routes expose the
  same self-and-peer language metadata, and hydrated navigation retains an
  explicit Pages subpath. Schema-2 entries now also require an exact source
  commit and canonical UTC review instant, and translated pages expose those
  maintained values instead of inferring them from the build. This does not
  publish or assess a German translation; that pilot still requires the human
  language/domain review recorded in issue 51.
- Focused Pages documents now present one generated research-object header
  derived from the canonical document index, publication identity and package
  version. A Pages build records its exact `GITHUB_SHA` when available; local
  builds do not invent a revision. Source history, citation, disclosure and
  licence records remain adjacent to separate clarity and evidence-correction
  routes, with the same locator context in the no-JavaScript document.
- A failed two-builder PDF reproducibility check now retains both exact PDF and
  manifest pairs beside its comparison receipt. CI uploads the bounded mismatch
  bundle for 30 days, so a rare renderer disagreement can be byte-diffed without
  rerunning or weakening the acceptance gate.
- Public-repository workflows remain on ephemeral GitHub-hosted runners rather
  than exposing fork-controlled code to the privileged office ARC boundary.
  External-fork runs now require approval for every outside contributor.
  Exact-diff CI selection reduces unaffected test work; scheduled and manual
  runs, plus pushes without comparable ancestry, remain full. Decision 0062
  records that comparable `main` pushes use this same bounded, fail-closed
  impact plan without becoming aggregate or release evidence. Required CodeQL
  remains outside impact scoping and now emits both configured language results
  on every protected pull request and `main` commit, so code-scanning merge
  protection never waits for a skipped language.
- Documentation validation now treats byte-identical Mermaid bodies as staged
  source-ownership debt. The exact checked baseline may shrink through reviewed
  owner repairs, while unknown, changed, malformed, or stale groups fail closed.
- Every pull-request code update now uses the exact Go impact plan regardless
  of draft state, so mapped site, prose and isolated experiment changes do not
  execute unrelated workstation shards. Unknown, unsafe-shape, shared and
  loadable selector-authority changes still expand to full CI; missing or
  invalid mapping authority blocks planning, and mapped regular-file deletions
  use their former path owner. `main`, manual and exact-tag release validation
  remain complete. Workstation manifests retain their coverage, readiness and
  reader consumers, and dependency review runs only for full pull requests or
  an explicit dependency lane.
- Script impact now follows exact executable consumers instead of a blanket
  `scripts/**` full-gate rule. The browser reader regression selects the site
  lane and the checked PDF semantic baseline selects its release validation;
  shared script authorities stay explicitly full, while every unclassified or
  newly added script still expands to the full gate.
- The README, contribution guide and public help route now expose current
  status, roadmap stages, live milestone work, authority boundaries and focused
  entry checks before implementation detail. The portal overview leads with the
  research question a new reader must be able to recover.
- Full CI now runs non-workstation quality checks beside a fail-closed
  workstation matrix. After the first complete run measured one Fixture 026
  shard at eight minutes, that shard was rebalanced into two exact file-level
  jobs. The planner and workflow now dispatch seven Fixture 026 shards and two
  Fixture 029 shards, capped at eight concurrent jobs; local `npm run check`
  still runs the complete serial inventory. The new shard-duration projections
  remain planning estimates until a complete live run remeasures them, so issue
  #7 stays open.
- The contribution map and issue picker now lead readers to bounded open work
  before they open a parallel issue.
- The typed-specialist audit now separates two related engineering donors:
  VMAFx's tiny typed estimators and Pelorus's proposed non-language content
  router. Exact source snapshots, implementation status, related-party limits,
  and a non-circular applied video shakedown are recorded without promoting a
  controller result.
- The `lusoris/k8s` engineering-transfer audit now binds its 503-test campaign
  and chart-harness disagreement to the exact historical source commit, then
  records a separate dated live/source observation and bounded drift at the
  later commit without presenting deployment health as a current test run or
  scientific result.
- The focused Pages reader now has one publication-owned CSS cascade. Dead
  legacy shell rules and their sticky-stack observer were removed; the
  document rail uses a two-row filter at compact desktop widths so the full
  Mathematics label remains visible without changing the 68ch prose
  measure or narrow-screen reading order.

### Fixed

- Trusted repository-metadata repair now has the pull-request write permission
  required to remove stale lifecycle labels from merged pull requests. Shared
  GitHub API reads retry only bounded transport failures and 500/502/503/504
  responses; writes remain single-attempt so an uncertain mutation is never
  replayed blindly.
- Release PDF rendering now receives the exact commit produced by the tag
  preflight and refuses a checkout at any other revision. Policy validation
  requires the unique reviewed step, its exact tag-and-commit command and only
  the two verified outputs; missing, ambient, reordered, conditional or
  failure-tolerant variants fail closed.
- The locked browser-targeting toolchain now uses Browserslist 4.28.8, closing
  the two high-severity unbounded-memory advisories reported by Dependabot and
  OpenSSF Scorecard. The regenerated book manifest and semantic sentinel bind
  the dependency change without changing the rendered PDF bytes.
- Portal document changes now focus the destination heading and keep fragment,
  back and forward navigation aligned with that focus. The document rail uses
  native links, so new-tab, modifier-click and copied-route behaviour remain
  available alongside same-tab client navigation.
- The assembled web book now exposes one title-level heading, nests chapter
  headings beneath it without shrinking their visual role, and offers a
  keyboard skip path to the first chapter. Its generated no-JavaScript surface
  now contains the same canonical manuscript instead of only a link index and
  gives every table an explicit keyboard-scroll fallback where runtime overflow
  measurement is unavailable. Hydrated tables remain focusable only when they
  actually overflow. Shared inventory and real-browser checks bind all 51
  chapter fragments, heading levels and skip-link continuation to the canonical
  source corpus. This is a bounded semantic repair, not a WCAG or PDF/UA
  conformance claim.
- In the hydrated reader, code blocks, display equations, tables and diagrams
  now enter the keyboard sequence only when they actually overflow. Each active
  region has a contextual accessible name, a visible scroll cue and a focus
  ring; resize observation removes that extra navigation stop when the content
  fits again. Generated no-JavaScript book and help surfaces retain their
  explicit keyboard-scroll fallback because they cannot measure runtime
  overflow.
- Continuous-book deep links now restore every chapter and heading below the
  responsive action bar on cold load and later hash navigation. Internal book
  links remain in the namespaced edition while preserving the current Pages
  base path, query and route; a real-browser desktop/mobile regression guards
  the observable clearance.
- The page-27 biomimetic-transfer figure now uses a print-safe vertical flow.
  Print hides the screen-only overflow cue and resets the diagram caption from
  sticky positioning so the caption stays with the figure before the following
  prose. The diagram's nodes, edges, labels and scientific meaning are unchanged.
- Long entries in the continuous book's generated field-coverage lists now
  wrap within the reading column at 320 CSS pixels while wide diagrams retain
  their labelled local scroll regions. Browser coverage now also verifies the
  existing action bar in a 720 CSS pixel viewport rendered at DPR 2.
- Linked operational manifests outside the public reader-artifact allowlist
  now remain canonical GitHub-source links instead of being copied under
  hidden static paths that the Pages safety validator rejects.
- Renderer image identity is now stable across the locked two-fresh-builder
  comparison. Lock schema 3 requires BuildKit's layer-timestamp rewrite and
  records compatibility version 30 as the reviewed BuildKit 0.32.2 default;
  the Go renderer rejects rewrite warnings before it records the image ID. A
  real-Docker release acceptance now rebuilds the final context without cache
  in two separate pinned builders, compares the image, config and manifest
  identities and complete PDF/manifest outputs, and retains a bounded receipt.
- Release preflight now locates an exact tag through GitHub's GraphQL API and
  reads the resulting numeric release through REST. Draft releases are no
  longer misclassified as absent, while malformed, ambiguous and changed
  identities still fail closed.
- Candidate 010 source identity now resolves loose and packed branch references
  through Git's linked-worktree common directory. Its normal checkout and
  Git-free frozen-capsule verification paths retain their existing authority.
- Browser verification now waits through a bounded termination grace and
  forced-exit interval, then retries temporary-profile removal through a
  bounded filesystem backoff. This covers both a still-running Chromium
  process and late child-process writes after the main process exits.

## [0.3.0] - 2026-08-30

### Added

- The Go 1.27 `20w` command now provides bounded documentation validation,
  experiment discovery and deterministic native release construction. The
  v0.3.0 release publishes its static `scratch` image for Linux `amd64` after
  the release workflow passes; Linux `arm64` remains
  withheld until its release path is exercised. The only native file currently
  exercised and admitted is `20w-linux-amd64`; both forms bind source identity,
  checksums, a Go-module SPDX inventory, third-party notices, provenance and
  attestations.
- Experiment distribution now defines one scoped OCI image per released
  experiment. The passing v0.3.0 release publishes Fixture 007's closed Node
  image and Fixture 019's digest-pinned Node, CPython and NumPy image;
  pull-request CI executes their bounded `NO_RESULT` smoke paths without
  network access. Future static Go runners use the same per-experiment identity
  rather than a shared all-harness runtime.
- Reviewed translations now have a Git-native manifest contract, exact English
  source digests, named human review, generated static locale routes, focused
  fail-closed bounded validation, contribution guidance and a dedicated GitHub
  issue route.
- A project-local reader-editor skill now separates conservative readability
  review from claim authority. Pull requests record intended readers and
  domain/readability review, while site issues can identify the exact point and
  interpretation where a non-expert lost the argument.
- A public how-to-help map now turns reader, translation, container, evidence,
  experiment, Go and security work into bounded entry points with named
  authority limits, review evidence, focused checks and exact issue routes.
  Failed release-image launches have a separate short, redaction-aware form so
  contributors need not complete the full protocol and authority report.
  Pages generates `/help/` directly from that Markdown as a zero-client-
  JavaScript reading surface.
- An external infrastructure audit compares repository, publication and
  specification evidence from IBEX, The Turing Way, JOSS, ReScience C, Real
  World Data Science, research compendia, FAIR4RS, RO-Crate, GitHub Pages, OCI,
  Weblate, po4a and W3C guidance. A separate implementation audit records the
  old and replacement Pages renders, explicit limits and falsifiable reader-
  task hypotheses.
- A bounded architecture audit now tests an explicit non-language controller
  over task-derived small typed specialists against a capacity-matched general
  model and tuned sparse mixture of experts. Gardner's eight categories remain
  only a disputed coverage prompt, while independently demonstrated Pareto
  gains enter a trigger-gated portfolio and retest backlog rather than becoming
  a fixed eight-part architecture.
- A read-only audit of the current `lusoris/k8s` AI control surfaces separates
  reusable controller, measured-admission, readiness, queue and recovery
  mechanisms from cluster-specific plumbing and operational outcomes. It
  reproduces 503 focused tests, records one separate chart-harness disagreement
  plus non-atomic and authority gaps, and retains only dependency-light Go
  adapter and stress-fixture leads.
- The fungal-network audit now gives common mycorrhizal networks their own
  bounded section. It separates shared fungal identity, continuous paths,
  material transfer, receiver effects and community benefit, and records the
  live dispute over forest-scale inference without turning the “wood wide web”
  metaphor into an architecture claim.

### Changed

- GitHub Pages is now the sole hosted reader and local web target. The obsolete
  owner-only ChatGPT Site was deleted, and its Vinext routes, Cloudflare Worker,
  hosting metadata, private-reader code, framework dependencies, and duplicate
  build validator were removed. PDF generation now renders the same static
  Pages book entry used online.
- The language control no longer delegates research prose to Google Translate.
  It opens only reviewed, source-version-bound translations and otherwise
  routes the selected language and page into the translation contribution
  workflow.
- Publication identity now comes from one shared registry, document and book
  surfaces link directly to typed feedback routes, compact supporting text is
  more readable, and duplicate Pages checks were removed from CI and tagged
  release verification. The publication workflow now documents the single
  source-to-Pages/PDF/container/translation graph.
- Pages now opens as a research publication rather than a status dashboard: a
  source-derived research-cycle figure, neutral evidence boundary, quiet
  ordered evidence trail and manuscript-first navigation replace the oversized
  dark hero, red `NO_RESULT` alert, rainbow process cards and heavy reader
  rails. Focused documents use a wider text tier and mobile navigation retains
  the title and source context before the body.
- The repository-wide documentation validator now runs in the small Go 1.27
  module and the validation command is also available as a static container;
  portable tooling no longer depends on a platform-specific shell. Fixture
  012's development-only physical acquisition lane and its separate supervisor,
  build harness and operator surface were retired; a future physical lane must
  expose one Go command and test each admitted platform's containment contract.
- Compatible direct dependencies, scientific runtimes and GitHub Actions were
  moved to their current stable releases: Node 26.8.1, npm 12.0.2, CPython
  3.14.7, NumPy 2.5.2, TypeScript 6.0.3, Vite 8.2.2 and Go 1.27.1. ESLint 9 and
  TypeScript 6 remain at the newest versions accepted by their current plugin
  peer ranges; unsupported major upgrades are reported rather than forced.
  Because the locked Node distribution includes npm 11.19.0, workflows now
  install npm 12.0.2 from one URL-, byte-count- and SHA-256-bound archive and
  verify the installed version before `npm ci`.
- Release SBOM generation now pins BuildKit's Syft scanner by its
  multi-platform digest.
- Full-book generation now runs through the Go command in two isolated bounded
  Linux `amd64` containers. One lock binds the exact Buildx client revision,
  BuildKit image, Node and browser-environment images, Chrome for Testing
  archive and executable hashes, platform and resource limits. Go projects its
  two runtime image identities into a temporary
  Dockerfile with literal digests, so no second maintained file or build
  argument can redirect a base image. Schema-3 manifests record that renderer
  identity; two fresh renders must reproduce the same PDF and manifest bytes
  before Go installs the pair under an exclusive rollback-capable publication
  lock. The source digest covers the complete local static module graph,
  renderer Go dependency closure, translation manifest and every rendered
  local image. Release CI realizes the JavaScript lock once with exact Node and
  npm versions; the two isolated render containers share that read-only tree,
  so their comparison is conditional on one clean realization rather than two
  independent installs. The offline print surface keeps remote badge links and
  text without fetching their mutable image endpoints. A dedicated
  change-scoped CI gate now repeats the final schema-3 image and publication
  pair with two fresh no-cache builders; tagged releases always run the same
  acceptance and checksum its deterministic engineering receipt.
- GitHub immutable releases are now enabled for future publications. The
  workflow assembles and verifies the checksum-derived asset set in a draft
  before publishing its locked tag and assets; a same-tag published rerun is
  read-only, while an incomplete draft may add only missing, byte-checked
  assets. The workflow also proves that each final OCI digest can be pulled
  without registry credentials before the public release is published.
- Main ruleset `21746706` now has no bypass actor and requires pull requests,
  strict `CI success`, resolved review threads, linear history and CodeQL.
  The approval count remains zero so the one-maintainer repository is not
  deadlocked; a second-human gate waits for an actual second reviewer.
- Fixture 007 and Fixture 019 now write one shared execution receipt containing
  the image, source, runtime, platform, command and `NO_RESULT` boundary.
  Release images require the caller's exact resolved digest before any action;
  local and development runs retain typed unavailable states without changing
  the scientific `run_id`.
- Both released experiment images now build from deterministic closed contexts
  packaged by the Go command. Catalogue validation rejects missing, non-regular
  or symlink-traversed lockfiles, and release verification checks the exact Go,
  Node.js, CPython and NumPy identities from immutable image digests.
- Container release publication is now two-phase. Builds push untagged
  canonical digests; exact inspection, offline execution and provenance
  verification must pass before the workflow attaches a release tag and checks
  its final digest binding. Only current-run build outputs receive new build
  attestations. An existing digest must already have source-bound provenance;
  missing provenance fails closed instead of being attributed to a later run.
  Tag attachment is serialized and absence-checked; package writers remain
  trusted because GHCR has no documented atomic create-if-absent operation for
  this path.
- Release asset and tag admission now use the Go command as their shared
  authority. It performs bounded two-pass asset reads with directory snapshots,
  compares source and publication checksum manifests, validates downloaded
  remote bytes, and peels only a bounded remote annotated-tag chain.
- Managed GitHub issue labels now come from one closed JSON manifest. A bounded
  Go command validates and applies it from canonical `main`, creating or
  repairing managed labels without deleting repository labels outside the
  manifest. Manifest reads compare opened-descriptor size, modification time
  and change time before and after bounded duplicate reads, rejecting
  same-inode mutation as well as path replacement.
- Node-based reruns now fail before expensive work unless the process is exact
  Node.js 26.8.1 and reproduces a frozen Fixture 026 exponential-ramp numeric
  sentinel. Experiment manifests use the same exact runtime instead of a broad
  semver range that admitted numerically divergent vendor builds.
- Release-plan generation now writes inside the repository's bounded
  `build/release-inputs` directory; policy tests reject shell redirections that
  would escape it before release-asset preparation.
- The local Pages development server now renders the canonical, styled
  `/help/` contribution page. Its wide tables and receipt example scroll
  locally on mobile instead of widening the document.

## [0.2.0] - 2026-08-28

### Added

- The portal and web book now offer an explicit automatic-translation handoff
  for all 24 official EU languages while retaining one reviewed English source
  corpus, canonical route set, and PDF. Translation starts only after a reader
  follows the labelled Google Translate link; no translator script, silent
  redirect, copied translation corpus, or unreviewed `hreflang` surface was
  added.
- A project-local research-writing skill now guides direct, natural,
  evidence-aware prose. A tested canonical-Markdown tripwire catches a narrow
  set of high-confidence generated filler while protecting quotations and code
  and allowing only reasoned, line-local suppressions.
- A deduplicated research-integrity baseline now derives project rules from
  ALLEA, EU, and DFG authority and compares their implementation across major
  German, British, Swiss, and French research institutions. It closes policy
  gaps for contributor credit, funding and conflicts, material AI and external
  services, research-object stewardship, pre-start ethics and misuse review,
  collaboration, correction, formal review, and confidential concerns without
  claiming that foreign institutional rules automatically apply.

### Changed

- Repository discovery metadata now uses 20 focused topics spanning biological
  inspiration, sensing, memory, sparse and conditional computation, continual
  learning, causal inference, embodiment, energy, and the EU AI Act instead of
  a short generic topic list.

- Candidate 010 now separates its 10-second verified-handshake deadline from
  the bounded 120-second confirmation and promotion actions. The previous
  shared default reproducibly terminated a valid capsule child before the real
  action completed on both Linux CI and Windows.

- Fixture 012 now guards shared ancestor directories with stable identity
  handles while reserving namespace oplocks for the guarded leaves. Unrelated
  writes beside broad ancestors such as `C:\` no longer create false path-
  identity failures, and descendant detection excludes the already-signalled
  leader from the bounded Job process-ID list. Supervisor failures also retain
  a bounded escaped stderr diagnostic alongside its digest.

- The generated book uses a compact `20W · page` footer that remains visible on
  sparsely filled and final pages; the longer title was intermittently clipped
  by the paged-media margin box.

- The public corpus now has 49 clean document routes with static fallback
  content, unique canonical and social metadata, truthful JSON-LD, crawlable
  internal links, a generated 51-URL sitemap, and an explicit robots policy.
  Legacy `?doc=` links resolve to the corresponding canonical route, while
  root and explicit subpath builds remain validated from one route registry.

- The repository front page is now a concise public entry point instead of an
  exhaustive inventory. It exposes the portal, book, PDF, evidence, tests,
  citation, support, split licences, truthful status badges, and a separate
  durable repository map. Verified GitHub Sponsors and Ko-fi identities now
  drive the repository funding button, and issue routing includes private
  security, support, and repository/tooling paths.

- CI and release verification now provision the exact CPython 3.13.13 and
  NumPy 2.4.6 environment required by Fixture 019. The Linux wheel is also
  bound to its PyPI SHA-256 digest and installed with pip hash enforcement,
  rather than trusting a mutable package-index version lookup. Platform-specific
  environment tests no longer fail on Linux for behavior that exists only on
  Windows, and the authoritative quality job has enough bounded time to run the
  complete workstation suite on GitHub-hosted hardware.

- The code-scanning remediation replaced predictable temporary paths, removed
  quality findings, anchored URL and text processing, and hardened publication,
  release, and workstation file reads around validated opened-file identities.
  Symbolic-link, pathname-swap, incomplete-sanitization, and bounded-input
  regressions now have focused tests; the remote scan remains the authority for
  whether GitHub closes each previously reported alert.

- GitHub Pages now builds for the custom-domain root at
  `https://www.cordana.dev/`; canonical metadata, public downloads, local
  preview guidance, and regression checks no longer assume the repository-name
  subpath. Cloudflare now permanently redirects the HTTP root and deep links
  to the same HTTPS paths.

- The repository now has one deduplicated engineering and research contract,
  a root operational guide, and bounded local instructions for research,
  experiment contracts, workstation execution, the reader, generators, and
  GitHub automation. The Power of Ten is adapted to the actual Node, document,
  and scientific authority boundaries, with CI, review, guidance, and staged
  rules distinguished explicitly.

- Strict TypeScript checking and parsed repository-policy validation now join
  the aggregate local gate. The new validator rejects mutable GitHub Action
  tags, unbounded workflow jobs, malformed research issue forms, missing public
  governance surfaces, and unsafe dependency-automation drift.

- P10-4 now has a measured no-regression gate instead of an aspirational line:
  294 source files establish a 195-finding legacy baseline, while CI rejects
  new file/rule groups, higher finding counts, worse maxima, and attempts to
  reset the baseline against the previous revision. Existing debt may only
  shrink.

- Direct npm dependencies are now exact-version declarations as well as
  lockfile-resolved, and all no-isolation test commands use the spelling
  supported by the declared Node 22 baseline. Repository policy rejects a
  future range declaration or a Node-newer-only test flag.

- Full-book generation now separates continuously updated `main` snapshots
  from immutable release-tag snapshots. The manifest records that source ref,
  releases require it to match the tag, and PDF metadata plus Chromium's
  unstable tagged-structure IDs are normalized for byte-identical fixed-input
  generation.

- Tagged releases now prove that the tag commit belongs to `origin/main`, bind
  tag-push execution to the triggering event SHA, and reconfirm the tag before
  publication. This closes both unmerged-tag and moved-tag publication paths.

- The contribution workflow now treats the GitHub Pages portal as the normal
  live preview and publication path, uses Conventional Commits, documents
  breaking migrations, and requires the complete `npm run check` merge floor.

- Replaced two multi-megabyte PNG social-preview assets with one visually
  equivalent progressive JPEG, reducing the production upload without changing
  the page or book content.
- Opened every document group by default in the private reader and added
  explicit `Show all` and `Current section` controls; the previous collapsed
  default made most of the 228-file library look absent.
- Contained every Markdown table in a keyboard-accessible horizontal region,
  widened the document canvas without widening prose, and gave six-column-plus
  tables an explicit scroll cue and sticky first column.
- Repaired four exact claim-to-test gaps: contestable audits, producer-product
  locality, fuel-coupled physical leases, and correlation-qualified replica
  diversity now have explicit tracks and bidirectional traceability.
- Completed the confirmatory analysis contracts for Candidates 005–020, so all
  31 candidate and fixture artifacts now pass the same eight-facet protocol
  gate with explicit resource parity, units, uncertainty handling, and frozen
  decision rules.
- Added direct claim-range links to every fixture, exposed coverage by evidence
  status, and made documentation, mathematics, and generated coverage freshness
  mandatory parts of the normal test command.
- Strengthened the private reader's palette, text hierarchy, secondary-text
  contrast, table and equation treatment, full page outline, and mathematical
  figure presentation.
- Gave Mermaid nodes a shared high-contrast semantic palette and made wide
  diagrams fit the reading surface instead of forcing a cropped canvas.
- Extended documentation validation to four-digit claim IDs, claim-anchor
  consistency, and all bibliography keys named in primary-source fields.
- Wide Mermaid diagrams now retain their intrinsic geometry while fitting the
  available reading surface; the constitutional control diagram follows a
  horizontal reading path.
- Display-equation validation now renders canonical Markdown through KaTeX and
  flags likely missing command escapes before a commit can pass `npm test`.

- GitHub Pages now opens as a web-native research portal instead of mounting the
  entire book at the site root. The portal provides a concise thesis and live
  readiness surface, purpose-based navigation, a searchable concept and
  mathematics library, and an in-page document reader. The complete linear
  edition remains available at `/book/`, and the generated PDF remains the
  offline/print export. Routine deployment of the redundant owner-only hosted
  reader has stopped.

- The focused reader now derives sticky offsets from the rendered toolbar
  height, keeps the active library entry visible, removes the duplicate source
  title, and preserves unobscured section anchors for long document names.
  Narrow research funnels collapse before their text and link targets become
  cramped, while heading-only search matches are labelled explicitly. Direct
  Pages builds now reject a stale PDF before bundling.

- Fixture F-029 now has bounded public-development construction harnesses for
  CMB-X01 recruited maintenance and CMB-X04 phase-qualified preservation and
  release. A suite runner co-receipts both independent tracks while preserving
  their separate actionable observations, evaluator truth, append-only records,
  resume paths, recomputed analyses, and fail-closed authority checks. The
  fixture remains the eleventh `smoke-ready` artifact and remains `NO_RESULT`:
  CMB-X02/CMB-X03, scientific comparison, strongest-null selection,
  confirmation, measured energy, performance conclusions, and
  workstation-executable evidence are absent.

- An adversarial F-029 pass closed previously permissive boundaries: CMB-X01
  now gates harmful burden and terminal misses, treats an unserved backlog as a
  tail failure, charges requeues, uses an arm-independent service opportunity,
  binds all reachable retry draws, and validates a closed JSON Schema. CMB-X04
  now replays seeded record semantics and separates reconstruction writes from
  transport writes. Suite authority and subrun metadata are closed and bound to
  their receipts, while the manifest verifies the referenced seed/configuration
  hash closure. All of these remain construction checks, not research results.

- The evidence ledger now contains 1,571 claims: 1,475 have reciprocal,
  protocol-complete routes and 96 remain explicitly classified evidence inputs
  or source reproductions. All 49 written experiment artifacts pass the
  protocol gate; eleven are development-smoke-ready, while no claim is presented
  as workstation-executable or as a result.

- The full-book screen layout now constrains readiness grids to the available
  inline size, so the 390-pixel reader no longer expands to the intrinsic width
  of its 760-pixel evidence matrix. Wide Mermaid diagrams retain a readable
  760-pixel inspection canvas inside a local horizontal scroller on narrow
  screens instead of shrinking labels to near-zero height; tables, formulas and
  diagrams remain contained without page-level horizontal overflow.

- Candidate 010's seed-release boundary now binds release plans, frozen
  snapshots, runtime/configuration/design/preregistration identities,
  commitments, reveals and attestations under one schema-validated operator
  release. Confirmation and held-out partitions must be disjoint members of
  that release, and promotion evidence must consume the exact same snapshots,
  commitment, reveals, configuration and design. Symlink/reparse paths,
  independently rehashed seed pairs, and a valid operator release paired with
  evidence from a different release are rejected. The candidate remains
  honestly `smoke-ready` at 6/9 structural gates because no claim-eligible
  workstation seed release or measurement evidence exists.

- The generated shareable PDF now uses a dedicated public-link surface: links
  to claims, audits, fixtures, decisions and repository artifacts resolve to
  the public Git repository rather than the owner-only reader. Generated
  readiness copy also handles the zero proposed-family state without presenting
  an empty backlog as active work.

- Fixture F-026 now gives C-1565--C-1568 an exact, reciprocal
  `RSD-T02-POP` test route covering experimental-unit invariance, blocked
  lineage leakage, episode/parameter/lineage shift, and calibrated selective
  risk. This promotes four ledger-only records to protocol-complete and closes
  the unnumbered engineering-protocol backlog without claiming execution or a
  result; the remaining ledger-only records are evidence inputs or
  source-domain reproductions.

- Current-release documentation now describes the Google Doc and Gemini inputs
  consistently as link-only provenance records. Their origin bodies are not
  published in the current tree and cannot support or relicense a claim.

- Full-book manifest schema v2 binds the exact PDF bytes by SHA-256 and includes
  the locked renderer dependency graph in source identity. Repository and
  GitHub Pages validation now reject a stale or same-size substituted PDF.

- The web and build dependency set has been refreshed to patched compatible
  releases, including React/RSC 19.2.8, Vite 8.0.16, Vinext 1.0.0-beta.8, the
  Cloudflare Vite plugin 1.54.1, and Wrangler 4.127.0. A clean locked install
  reports no registry-audit vulnerabilities, and browser-bundle third-party
  notices have been regenerated from the updated build.

### Added

- A cross-repository adoption ledger records which conventions from
  `golusoris`, `sveltesentio`, `goenvoy`, and organization defaults were
  adopted, adapted, staged, rejected, or found inapplicable, including explicit
  exit conditions for complexity linting, repository rules, REUSE, secret-scan
  CI, dependency automerge, and attested releases.

- Decision 0028 preserves `0.1.0` as a changelog-only historical milestone and
  establishes `v0.2.0` as the first public tagged release. This avoids
  pretending that an arbitrary pre-publication commit was a frozen, tested
  release or republishing its historical source tree through a new archive.

- A tag-bound release workflow now reruns the complete repository and Pages
  gates before publishing the full-book PDF and manifest, split-licence
  material, third-party notices, a deterministic locked-graph SPDX SBOM,
  sorted SHA-256 checksums, and GitHub build-provenance attestations. The PDF
  identifies its exact edition and links repository material through the
  immutable release tag.

- Project-specific ownership, contribution, issue, conduct, governance,
  security, support, citation, dependency-management, CodeQL, Scorecard, and
  pull-request CI surfaces for the public repository. GitHub private
  vulnerability reporting is enabled and its confidential reporting route is
  verified. Repository Actions now require immutable full-SHA references, keep
  the default workflow token read-only, and cannot approve pull-request
  reviews.

- A three-frontier research cycle audits clinical biotechnology, hybrid natural
  mechanisms, and institutional information allocation against primary papers
  and European authoritative sources. Forty-one bibliography records, eight
  central claims, Decision 0026, and specification-only Fixture F-029 preserve
  the source-domain evidence while routing four new endogenous-machinery
  transfers through strong queueing, distribution, routing, and reconstruction
  nulls. Cross-field mechanisms already represented by existing principle
  families remain deduplicated instead of becoming aliases.

- The phase-selective preservation model now exposes the product of survival
  and release probabilities as an editable equation and generated SVG plot.
  Every curve is explicitly hypothetical and dimensioned; it is an
  interpretation aid for F-029, not a biological fit, benchmark, energy result,
  or claimed advantage.

- A fail-closed source-publication boundary now admits exactly 17 byte-pinned
  files: the source index, ten provenance records and six reviewed taxonomy
  files. Size and SHA-256 checks reject additions, removals, path replacement,
  taxonomy substitution and appended Google/Gemini body content; focused tests
  and the GitHub Pages workflow enforce the boundary before publication.

- The parasitology frontier audit contributes eleven primary DOI records and
  four bounded claims: observable-surface versus latent identity, costed
  lifecycle commitment, host/control-plane capture and intervention-induced
  competitive release. Decision 0025 and Fixture F-028 keep those mechanisms
  separate, deduplicate them against existing principles, and expose complete
  specification-only `PAR-X01`--`PAR-X04` tests without adding a principle,
  architecture candidate, execution result or energy claim. Source findings
  and project syntheses are explicitly separated; non-identifiable identity is
  bounded by prior-only Bayes risk and charged selective abstention, while
  witness-root compromise is an uncovered fail-closed stratum rather than an
  assurance-advantage condition.

- Decision 0024 makes the GitHub repository public, retains the interactive
  reader as owner-only, and adds a static full-book GitHub Pages release built
  from the same committed source. Split open licensing uses EUPL
  v1.2-or-later for project-authored software and technical execution material,
  and CC BY-SA 4.0 for original research
  prose, mathematical exposition, diagrams, plots, and generated presentation.
  The scope document expressly excludes imported `sources/`, official taxonomy
  snapshots, citations, and all other third-party material from accidental
  relicensing, while the package remains marked private against accidental npm
  publication independently of the public GitHub repository.

- RSD-T02 now has four adversarially hardened public-development execution
  layers. A compact population runner traverses all 20 canonical parameter
  instances and receipts 520 episodes, 799,240 transcript rows and 180 arm
  invocations without inflating the independent-system denominator. A separate
  content-addressed policy overlay uses a fresh restricted child and an owner-
  bound, synchronized, hostile-restart fixed-instance ledger. The integrated
  layer binds all 20 identity-keyed directories to one bounded durable outer
  ledger and recovers the instance-complete/outer-append crash window exactly
  once. A synthetic
  transcript calibrator invokes the exact existing bootstrap/Holm analyzer:
  the null interval spans its reference, the alternative interval misses the
  illustrative target, and both small-sample hostiles fail bootstrap resolution,
  so the current planning assumptions are rejected rather than frozen. Receipt
  forgery, workload
  contradictions, hash-chain overclaiming, role relabeling, interval
  miscoverage, identity collisions, all-refused completion, concurrent I/O,
  path aliases, mutable evidence, oversized recovery input, raw-leaf and live
  instances-directory replacement, and lock-retirement races are now explicit
  hostile tests. Verified retired
  lock artifacts are retained under randomized names instead of being
  pathname-deleted. An exact 20-member local runtime closure promotes only the
  parameterized-runner infrastructure gate. The layers remain `NO_RESULT` and
  do not create mature-model, comparison, confirmation, workstation-measurement
  or energy authority.

- The RSD-T02 fixed-instance execution foundation now materializes one exact
  26-schedule, 39,962-row causal transcript and nine append-only terminal
  response/resource records from a generated system instance. Its validator
  closes the policy view, binds full transcript receipts, charges explicit
  failures, and reproduces object-level resume. The successful executor remains
  an in-process digest abstention; the separately exact-bound overlay and
  integrated population release now supply a content-addressed 26-projection
  bundle, fresh child isolation, semantic replay, and durable disk checkpoints
  without changing the base artifact. A post-validation adapter can feed the
  transcript into deterministic learned state-space and GRU-style level-two
  prototypes without exposing schedule, identity, truth, or provenance fields.
  Every artifact remains `NO_RESULT`.

- Decision 0023 binds future power claims to the exact executable analysis law.
  A public method check now collapses hash-identical systems, preserves equal
  fixed-family weighting, retains failures at explicit penalties, performs a
  deterministic centered stratified bootstrap-$t$, and applies one Holm
  step-down family over the four registered hypotheses. It exposes the
  data-dependent $p$-value floor caused by zero-standard-error resamples. The
  companion normal/binomial calculator and editable sensitivity plot expose
  units, assumptions, inverse-square scaling and exact attrition assurance, but
  explicitly do not estimate bootstrap power or freeze a sample size until
  pilot transcripts are simulated through the released analyzer.

- Decision 0022 separates RSD-T02 fixed-instance construction from the old
  mixed-time-constant conformance runner. A versioned five-family registry and
  domain-separated HMAC-SHA-256 generator now produce four exact integer
  conformance draws per family, 20 canonical metadata artifacts, and one
  fixed-parameter 26-episode packet per artifact. Complete rational parameter,
  nuisance-interface, equation-certificate and declared equation-template
  documents enter scientific identity; draw coordinates and non-scientific
  registry metadata do not. A complete episode-protocol digest binds schedules
  and execution constants to packet identity, while population design and model
  source stay byte-exact provenance. Twelve focused generator tests now cover
  exact goldens, output schemas, rejection sampling, deduplication, identity
  separation, deterministic replay, coverage failure and hostile mutation.

- The RSD-T02 null-maturation design replaces ambiguous estimator names with a
  six-level state machine; only a level-five confirmation-frozen model
  qualifies as mature. Exact parent hashes, a common three-property
  probabilistic output interface, fit/calibration separation, abstention,
  resource ledgers and freeze order are machine-checked. Two deterministic
  trainable public prototypes now satisfy the level-two state-space and
  recurrent gates, and the exact-bound isolated durable population release now
  satisfies the parameterized-runner infrastructure gate. Calibration,
  selected-model, resource-audit, development-evaluation and confirmation gates
  remain open. Across the 20 applicable non-energy gates, five are satisfied
  and 15 remain open; affected fitting remains blocked by three explicit
  prerequisites.

- A primary-literature audit of experimental units, identifiability,
  structured holdouts, dynamical parameter shift, calibration and selective
  risk adds C-1565--C-1568, extends C-1541/C-1562, corrects the Hamadeh journal
  issue, and adds nine bibliography records. A generated lineage-coverage SVG
  shows that log-fold, feedback-present, channel-local-present and memory-
  negative remain below the two-lineage floor; parameter draws cannot repair
  those gaps.

- Decision 0021 closes the RSD-T02 population unit: structural lineage →
  family → independently drawn fixed-parameter instance → packet → episode →
  realization. Procedural seeds remain replay keys, the old mixed-time-constant
  35-projection packet is rejected as a population instance, and the first
  prospective scope is an equal-family-weighted finite panel with lineage-
  disjoint development, sealed confirmation and sealed transfer partitions.
  A hashed machine contract enforces the fixed time constant, invariant-memory
  exclusion, four-hypothesis experiment-level Holm rule, effective-$n$
  accounting by recomputing each instance ID from its family/version,
  structural lineage, parameter vector, fixed time constant, nuisance vector
  and property-certificate set; aliases and unknown instance IDs fail closed.
  Power, custody and energy authority remain blocked. The six previously
  inactive RSD-T02 policy roles now have fixed Stage-2b conformance
  implementations, bringing the ordered bank to nine active policies and zero
  inactive placeholders. A deterministic builder reproduces the 34,244-byte
  content-addressed isolated bundle, and a generated SVG plots each arm's exact
  policy-specific scalar work above the common traversal charge. These are
  public construction artifacts and remain `NO_RESULT`.

- The private research reader now preserves links to checked-in source and data
  artifacts as authenticated inert-text files generated during the site build,
  instead of silently falling back to the project README. Experiment contracts,
  JSON Schemas, research data and editable plot sources receive distinct labels;
  the generated raw-file directory stays out of Git and is rebuilt from the
  canonical Markdown link graph.

- Decision 0020 and a closed RSD-T02 Stage-3 design now separate procedural
  information cuts from scientific replication. The ordered 64-seed public
  pack is assigned once to 32 fit, 16 calibration and 16 evaluation roles with
  phase-specific allowed actions and hostile leakage checks. Because the
  current seed changes only an opaque state-handle permutation, the design
  forbids seed-level inference, declares the split unpowered and retains
  `NO_RESULT`. It also freezes the two generic-null targets, endpoint families,
  prospective Holm rule, resource obligations and the independent-system and
  outer-family holdouts required before comparison. An editable SVG generated
  from the actual initialization and permutation functions plots all 64 labels,
  their two handle maps and the three information-cut regions.

- F-026 now executes the bounded `T02-MECH` construction/conformance slice
  through the fixture runner. Each canonical seed produces 175 closed-schema
  records: three O0 episode descriptors crossed with three conditioned time
  scales for five recipes, plus an exact 26-episode O1 panel for the same
  recipes. An independent evaluator, policy firewall, canonical uint64 seed
  encoding, append-only LF JSONL ledger, semantic replay, checkpoint/resume,
  path-containment checks and an exclusive writer lease fail closed to
  `NO_RESULT`. The exact 64-seed source pack is frozen; the one- and two-seed
  prefixes are plumbing runs, not substitutes for that pack. O2, T02-FLOOR,
  mature/actionable estimator arms, comparisons, confirmation custody and
  result or energy authority remain absent. A pre-evaluator whole-system stage
  now commits all nine public-prior policy-conformance references before any
  raw evaluator ledger exists; it records exact
  acquisition, prior and inference costs without treating those fixed
  references as trained estimators or mature nulls. Each packet runs in a fresh
  permission-restricted child, with one hardened VM for the ordered policy bank
  and a reproducibly built verified SHA-named bundle; canonical request/response framing, resource caps,
  replay binding and typed fail-closed abstention replace the former
  same-process execution path. Boundary failures are atomically retained in a
  self-hashed, replay-bound abstention artifact that cannot coexist with
  evaluator-bearing state. Commitment creation is exclusive and
  file-synchronized; parsed JSON, hashes and byte counts share their input
  buffers. The remaining parent generator/evaluator static-ESM load-time
  mutation window is explicitly outside this public-development authority. The C-1561
  repeated-pulse subtrack now also has a six-world machine constructor with
  adaptive exact-edge integration, support, refractory, count, latency and
  period-skipping gates.
  Bounded positive and hostile construction cells execute as `NO_RESULT`; the
  full 229-unit schedule is now frozen in a source/runtime-bound append-only
  runner with explicit incompleteness, eight-unit invocation limits and a
  256 MiB whole-run result cap. The six-duration, robustness and mixed-window
  executions and actionable comparison remain absent. Generated coverage records 1,463 of
  1,555 claims as protocol-covered and zero as workstation-executable.

- Decision 0019 and the F-026 `RSD-T02` foundation now separate four scored
  interventional properties, exact input-output equivalence and justified
  abstention from generator-recipe names. Five initialized two-state recipes
  share one canonical fold-step trajectory before a fixed 26-episode panel;
  three observation regimes, nine ineligible actionable arms, one
  evaluator-only graph oracle, all ten recipe-pair certificates and a typed
  acquisition-cost vector were machine frozen at the foundation checkpoint. A
  separate 105-cell singular
  perturbation grid makes the source-supported fast-boundary-layer supremum
  norm primary and keeps RMS diagnostic. That checkpoint created no T02 arm,
  result artifact, confirmation custody, comparison authority or execution
  claim, and `NO_RESULT` remains mandatory. Its focused tests include
  closed-registry mutation checks and numerical reproduction of every declared
  separating episode.

- Decision 0018 and an isolated F-026 scientific-grid contract now freeze the
  prerequisite for any RSD-T01 comparator expansion. The contract enumerates
  five generator recipes × four histories × three scale roles (`2×` and `4×`
  observed-development, `8×` withheld-prospective), six valid scientific
  hostile cases, eight actionable arms, and a separate evaluator-only oracle.
  Its family-label-independent reducer classifies from the worst complete
  history × scale cell for one bound initialization, uses frozen discrepancy
  thresholds, preserves endpoint and peak matrices, and fails closed to
  abstention on missing, rejected, abstained, duplicate, or mixed-system cells.
  Scientific support is recorded on six separate axes rather than one ambiguous
  bit. Forty-seven focused F-026 tests now pass. The module remains outside the
  v2 runner; the public
  prospective role is not a private partition, no predictive information cut
  has been registered, and no comparison or result authority is created.

- The private full-book route now keeps the 49-document corpus outside the
  Cloudflare Worker render path. A lightweight server shell preserves the PDF
  download while the browser loads the complete edition after hydration, with
  an error/retry boundary. A dedicated book-only corpus reduces the lazy
  browser chunk from 14.19 MB to 1.21 MB. Source and compiled-artifact gates
  enforce a sub-100 KB server entry and loader, a dynamic-only book edition,
  and a sub-3 MB book corpus. Local production QA confirms 50 rendered book
  sections, 48 diagrams, no unresolved contents links, no wide tables and no
  horizontal overflow.

- F-026 now has a versioned generator-only public-development contract for the
  `RSD-T01` / `C-1540` slice. Thirty-seven focused tests cover canonical
  decimal-string uint64 seeds over the full unsigned range and exact
  little-endian encoding; an exact five-generator-family × four-history grid
  plus four distinct malformed sentinels per seed; shared initialization and
  distinct world identities; and replayable seed-dependent band-limited
  stochastic histories. Endpoint-return and equal-peak delayed-trajectory
  lookalikes are causal and history-responsive. Family-qualified parameters
  make unused values explicitly `null`, while the evaluator separately records
  cross-cutting per-world trace facts and leaves structural causal memory
  unassessed. System symmetry is now reduced from the maximum discrepancy over
  the complete history × scale grid; endpoint and peak matrices retain a frozen
  `all`/`partial`/`none` reducer. Directly exposed trace properties remain
  conformance-and-cost endpoints, not learned-symmetry evidence. Decision 0017
  and a new editable high-contrast property-overlap graphic preserve these
  boundaries. Resume now verifies an exact ordered prefix and semantic replay,
  repairs stale or missing final checkpoints, accepts canonical LF JSONL only,
  and closes event, run, ledger and checkpoint metadata against unknown result
  authority. The generic full-profile gate binds each artifact to its exact
  schema and per-seed cardinality contract. The full comparator and hostile
  stacks, private partitions, powered statistics, calibrated energy,
  RSD-T02--RSD-T10, and claim authority remain absent. Every event and
  successful command response is `NO_RESULT`; the repository still has ten
  smoke-ready harnesses and zero workstation-ready or workstation-executable
  scientific claims.

- A history-conditioned modular-succession package separates observed
  microbial succession, randomized ecological priority effects, continual-
  learning task order, curriculum optimization and ordinary scheduling. It
  maps the residue onto C-008/C-056/C-057/C-574, F-014 and Candidates 004/019,
  adds fourteen deduplicated source records, and freezes all 24 task orders
  plus a fresh-seed four-order × $2^6$ mechanism factorial under
  fixed-task-multiset and module-eligibility-set,
  equal-exogenous-presentation/update-ceiling/capacity/optimizer/evaluator/
  budget parity, with routed acceptance retained as a mediator and separately
  equalized in exposure-cut cells. Decision 0016 and
  the mathematical contract require canonical replay, scheduling, mature
  continual-learning, MoE, curriculum-search, PBT and QD nulls and explicit
  age, capacity, shared-state, facilitation and lock-in cuts. No claim,
  principle, candidate, protocol, fixture or result is added.

- An interface-qualified retroactivity package adds ten bounded claims
  (`C-1550`--`C-1559`) and Fixture F-027. Fourteen primary papers plus a
  published model-qualification comment-and-reply exchange separate
  direct downstream sequestration, pathway-specific substrate competition,
  generic shared-resource contention and intended feedback; operating regime,
  observation interface, delivered service, weak-coupling limits and complete
  lifecycle cost remain explicit. A mathematical contract, editable
  RK4/reduced-model plot, Decision 0015, six new child routes and three extended
  EuroSciVoc/DFG/ANZSRC routes integrate the result without promoting a new
  principle or candidate.

- F-027 includes a deterministic public-development RIN-T01 smoke harness.
  Sixteen focused tests cover the ten-track evidence/claim registry, balanced
  source--load worlds, mass closure, two edge-removal interventions, malformed
  interface rejection before simulation, closed JSON Schema coverage,
  run/profile-bound resume, observed serialized-byte accounting,
  bounded-insulation saturation, append-only integrity, byte-identical replay
  and exact resume. The smoke run returned
  `diagnostic-pass` with `NO_RESULT`; confirmation, transfer, full dimensional
  comparison, physical systems, calibrated energy and claim authority remain
  absent. Regenerated coverage records 1,458/1,550 protocol-covered claims, 92
  reviewed ledger-only claims, 47/47 complete written artifacts, nine
  smoke-ready harnesses and zero workstation-ready or workstation-executable
  research claims.

- A relative-sensing and scale-symmetry depth package adds ten bounded claims
  (`C-1540`--`C-1549`) and Fixture F-026. It distinguishes full-trajectory
  fold-change detection from adaptation, equal peaks, static normalization and
  additive-change coding; keeps every conclusion tied to its observation
  interface and validity range; and separates robust relative readout from
  recoverability of absolute scale. Twelve primary bibliography records, six
  exact ANZSRC child routes, a mathematical equivariance contract and an
  editable state-orbit/trajectory plot make the package traceable and
  falsifiable. All ten protocols are written but unexecuted, and no principle,
  architecture candidate, performance result or energy result is promoted.

- Fixture F-025 now has a deterministic public-development smoke harness for
  the `ECM-T03` validity-gate slice. Thirteen focused tests cover the frozen
  registry, binary64 generator, corruption families, gate ordering,
  append-only hash chain, byte-identical replay, resume and tamper rejection.
  A complete smoke execution returned `diagnostic-pass` with `NO_RESULT`;
  confirmation, hostile transfer, physical apparatus, calibrated energy and
  claim authority remain absent. Regenerated coverage now records 1,448/1,540
  protocol-covered claims, 92 reviewed ledger-only claims, 46/46 complete
  written artifacts, eight smoke-ready harnesses and zero workstation-ready or
  workstation-executable research claims.

- A field-gap audit adds electrochemistry as a direct research domain rather
  than a loose battery metaphor. Ten bounded claims (`C-1530`--`C-1539`) and
  Fixture F-025 separate interface kinetics from terminal command, finite
  diffusion memory from a boundary-free kernel, impedance validity from
  mechanism identification, inverse timescale resolution from visually
  persuasive peaks, driven phase regime from universal morphology,
  passivation from free protection, local depletion from mean load, parameter
  fit from identifiability, scalar occupancy from path state, and early policy
  ranking from final degradation evidence. Fifteen deduplicated primary-source
  records and six exact DFG/ANZSRC/EuroSciVoc child routes make the package
  traceable; all ten CPU-only protocols remain unexecuted and add no P-series
  principle or architecture candidate.

- Three independently reviewed depth packages add 24 bounded claims
  (`C-1506`--`C-1529`) and Fixtures F-022--F-024. Developmental and
  regenerative biology now separates positional instruction, repair workforce,
  writable state, compensating sources, finite scaling, receiver geometry,
  load-path reinforcement, boundaries, conditional redundancy, field
  composition, and organizer selection. Plant plasticity now separates digital
  population memory, lifecycle reset, writer/trace/retrieval, localized
  regenerative preparedness, common alarms and typed context, route identity,
  sense-by-growth admission, future capacity, boundary sensing, and integrated
  environmental state. Applied mathematics adds exact projection memory,
  normal-hyperbolicity limits, heterogeneous micro-query reconstruction, and
  lift--heal--evolve--restrict closure tests. Forty-four new scientific
  bibliography records were imported after key/DOI/title deduplication; the
  existing New Phytologist DOI `10.1111/nph.20418` remains a research-agenda
  Letter rather than evidence for a duplicate claim. Exact child routing now
  contains 54 assignments from these three packages across EuroSciVoc, DFG,
  and ANZSRC without inherited parent coverage or a new P-series
  principle/candidate; electrochemistry raises the repository total to 60.

- Decision 0014, a dedicated multiscale-reduction math contract, and two
  editable analytical plots make coarse-state validity visible: memory-tail
  truncation is priced against tolerance, and slow reduction is bounded by its
  spectral margin and fold sensitivity. The concept chapters now carry these
  results as architecture constraints alongside substantive developmental and
  plant-memory text. F-024 also provides a deterministic development-only
  AMR-T01 smoke harness with Markov-only, finite-memory, and exact augmented
  paths, immutable-input hashes, append-only hash chaining, checkpoint/resume,
  and nine focused tests. It explicitly forbids energy and scientific-result
  conclusions. Generated coverage now records 1,438/1,530 protocol-covered
  claims, 92 reviewed ledger-only claims, 45/45 complete written artifacts,
  seven smoke-ready harnesses, and zero workstation-executable research claims.

- Fixtures F-022 and F-023 now have deterministic development-only smoke
  harnesses. F-022 exercises balanced positional-memory corruption, explicit
  abstention, and a fully charged robust-null fallback across 24 records.
  F-023 exercises population duration memory and authenticated lifecycle reset
  across 84 records, including typed corrupt-boundary abstention. Forty-seven
  focused tests independently verify closed schemas, immutable-input hashes,
  exact regenerated work content and order, observed-versus-charged loss and
  resources, denominator-preserving cap/invalid/numerical/exception paths, generator
  cardinality, append-only chains, byte-identical replay, transient-failure
  resume, checkpoint and derived-run recovery, tamper rejection, and uniform
  `NO_RESULT` authority. The repository therefore has seven smoke-ready
  harnesses and still has zero workstation-ready or claim-eligible scientific
  executions.

- A new editable analytical hysteresis plot replaces prose-only discussion of
  binary retained state with an inspectable Schmitt-rule loop. It shows the
  two history-qualified states available inside the threshold band, defines
  every symbol, names the mature finite-state null, and keeps persistence
  mechanics separate from lifecycle reset authority. The parameter source and
  deterministic SVG generator remain versioned beside the rendered figure.

- A second editable memory figure plots the exact normalized semi-infinite,
  finite-transmissive, and finite-blocking diffusion impedances. It makes the
  boundary turnover and low-frequency disagreement visible even when all three
  laws share an apparent high-frequency $q^{-1/2}$ tail, directly supporting
  the finite-memory identification contract in C-1531.

- The independently reviewed tribology and adaptive-contact-interface audit is
  now central as Fixture F-021. Nine bounded claims (`C-1497`--`C-1505`) and
  nine reciprocal CPU-only contracts separate friction coefficient from
  transmitted work, aggregate load from contact-state distribution,
  lubrication regime from scalar friction, wear rate from cumulative damage,
  stick--slip stability from mean friction, third-body inventory from
  unobserved disturbance, texture from universal benefit, reversible adaptive
  interfaces from fixed policies, and coupon metrics from accepted-service and
  lifecycle burden. Twenty new scientific and DIN/EN/ISO bibliography records
  were added after DOI, title, and semantic deduplication; the existing DFG and
  ANZSRC taxonomy records were reused. Explicit child routing marks DFG
  4.12-01, ANZSRC 401708, and EuroSciVoc `tribology` and `lubrication` as
  dedicated, with DFG 4.12-02/4.31-03 and ANZSRC 401706 adjacent; no parent
  inheritance, new P-series principle, candidate, runner, result, or energy
  claim is introduced. Generated coverage now records 1,404/1,496
  protocol-covered claims, 92 reviewed ledger-only claims, 41/41 complete
  written artifacts, four smoke-ready harnesses, and zero
  workstation-executable research claims.

- The independently reviewed integrative comparative-physiology depth audit is
  now central: nine bounded claims (`C-1488`--`C-1496`; eight established and
  one plausible) separate aggregate supply from local delivery/utilisation,
  conditional branching from universal rules, geometry from exchanger
  effectiveness, filtration from transport/excretion/balance, mean state from
  delayed control, regional benefit from global cost, prospective regulation
  from cumulative burden, synchrony from coupling/function, and fast action
  from slow structural adaptation. Fixture F-020 preserves all nine complete
  CPU-only contracts and frozen A/B/C policies without a runner, manifest,
  output, physiological result, AI-performance result, or energy result.
  Twenty-one new scientific DOI records and two new EU/German animal-research
  applicability sentinels were added after key, DOI, and semantic deduplication.
  Explicit child routing marks DFG 2.13-05, ANZSRC 310912, and EuroSciVoc
  `physiology` as dedicated, and ANZSRC 310910/320803 as adjacent; no parent
  route, ANZSRC 310303 ecological-physiology route, new principle, or candidate
  is inferred.
  Generated coverage now records 1,395/1,487 protocol-covered claims, 92
  reviewed ledger-only claims, 40/40 complete written artifacts, four
  smoke-ready harnesses, and zero workstation-executable research claims.

- EuroSciVoc 1.6 adds an official EU concept-level discovery lens: 1,064
  English/German concepts are preserved beside 214 DFG subjects, 213 ANZSRC
  groups, and 1,967 ANZSRC fields. Generated routing pages and validators keep
  every child unassigned until an exact field audit is linked; parent coverage
  never propagates. Cross-platform generation now produces byte-stable LF
  artifacts with checked source hashes and hierarchy closure.

- Fixture F-019 implements the FM-T02 endogenous-feedback forecast as a fourth
  deterministic smoke harness. Twenty-three focused tests and 16 adversarial
  readiness tests bind its independent evaluator, exact sign enumeration,
  corruption-evident resume, staged funding fallback, uint64 seed contract,
  and fail-closed promotion validator. Development execution exposed an
  effectively seed-invariant aggregate endpoint, so Decision 0013 blocks the
  current protocol before confirmation; it is not a scientific result and
  remains 0% workstation-ready. The same decision permits a claim-bound
  non-energy test only when every energy conclusion is explicitly forbidden.

- Five editable mathematical figures now visualize Pareto dominance under
  uncertainty, active evidence pricing, recovery-time fragility, memory action
  regions, and mission-profile damage. Semantic continuous figure numbering,
  contextual Mermaid captions, stronger contrast, and bounded responsive
  layout make both the private site and full book easier to read without
  presenting illustrative curves as measurements.

- Independently reviewed environmental-engineering and finance/management
  depth audits add 17 bounded claims (`C-1470`--`C-1476`, `C-1478`--`C-1487`),
  20 CPU-only falsification protocols, and Fixtures F-018 and F-019 as complete
  pre-implementation contracts. The environmental track closes residence-time,
  coupled-control, anomaly-isolation, fouling, adsorption, anaerobic-buffering,
  transformation-product, lifecycle, and infrastructure-topology boundaries;
  the finance track closes tail-risk, endogenous-feedback, portfolio-estimation,
  attention-queue, real-option, internal-control, operational-resilience,
  queueing, transfer-price, and incentive-gaming boundaries. All 47 new
  scientific and authoritative records passed a separate metadata audit; two
  incorrect/incomplete records were corrected before release. No principle or
  architecture candidate was promoted, and neither fixture contains a
  scientific, legal-compliance, financial, or energy result. The generated
  census now records 1,386/1,478 protocol-covered claims, 92 reviewed
  ledger-only claims, 39 complete written artifacts, three smoke-ready
  harnesses, and zero workstation-executable research claims.

- Three independently reviewed depth audits add operating/distributed-system,
  geotechnical/long-life-asset, and spatial-geography boundaries. They add 23
  scoped ledger claims (`C-1440`--`C-1469`, with the existing numbering gap
  retained), 24 CPU-only falsification protocol specifications, and a
  deduplicated primary/authoritative-source bibliography without promoting a
  new universal principle or architecture candidate. Review hardened exact
  epoch activation and release, world-cluster inference, native-Linux evidence
  limits, Eurocode factor formats, rare-event uncertainty, change-of-support
  conservation, spatial transfer splits, preferential-sampling comparators,
  and protocol-versus-result wording.

- Two maintainable analytical plots now expose path-dependent internal state
  and support-width spatial filtering from editable JSON. The full A4 book now
  includes all 24 mathematical notes alongside the concept chapters and field-
  coverage appendix. Mathematical source normalization and validation reject
  unsupported delimiters, unbalanced inline notation, and multiline inline
  equations before publication.

- The Windows live-preview watcher excludes workspace `tmp/` and workstation
  `runs/` output directories and treats Markdown, Mermaid, and BibTeX inputs as
  raw assets during hot
  reload. This prevents locked F012 test DLLs from terminating Vite and prevents
  edited research documents from being reparsed as JavaScript while preserving
  immediate canonical-source updates.

- Fixture F-012 now has a claim-ineligible workstation-development acquisition
  lane with true process launch-to-exit timing, frozen executable/environment/
  workload identities, an exact counterbalanced schedule, structural layout
  proofs, exclusive locking, authoritative-ledger checkpoint recovery, closed-
  schema rejection evidence, calibrated-meter bindings, and full validation
  recomputation. Its native Windows lane uses atomic pre-resume Job Object
  assignment, `KILL_ON_JOB_CLOSE`, QPC timing, directory R oplocks, persistent
  per-file NTFS USNs, and file-ID, attribute, reparse-tag, and link-count
  validation. The 21 scoped acquisition tests cover real CLI execution, spaces,
  immediate descendants, timeout/output containment, directory and transient
  leaf mutation, multi-hardlink, reparse and SUBST refusal, supervisor-assembly
  substitution, and supervisor-host crash containment. This is a measurement
  boundary, not a security sandbox: it requires a protected Windows system-
  volume NTFS path, single-link identified files, and operator-qualified
  PowerShell/.NET trust roots. No scientific or energy result exists, readiness
  remains `smoke-ready`, and timing/energy overhead characterization remains
  pending.

- Fixtures F-015--F-017 close the remaining engineering-protocol backlog with
  bounded contracts for hidden sensorimotor transfer (`C-007`), versioned
  evidence retrieval and hostile feedback (`C-797`, `C-798`), and a matched
  ternary-model/native-hardware crossover (`C-013`). The low-bit ledger now
  distinguishes current open checkpoint/kernel evidence from this project's
  unexecuted quality, native-path, and lifecycle-energy hypotheses. The
  contracts survived a separate adversarial pass that closed chronology
  recovery, boundary-null randomization, planning-alternative, comparator-
  selection, repeated-block allocation, multiplicity, lineage, and joint-stage
  power ambiguities. The
  generated coverage answer is 1,346/1,438 protocol-covered claims (93.6%), 92
  reviewed ledger-only evidence or source-reproduction claims, 37 complete
  written artifacts, three smoke-ready harnesses, zero partial descriptions,
  zero unresolved engineering dispositions, and zero workstation-executable
  claims. Protocol numbering records a falsifiable design, not a result.

- A political science, public-administration, stratification, and media-depth
  audit adds nine bounded claims (`C-1431`--`C-1439`), nine CPU-only
  falsification protocols, and 22 deduplicated bibliography records. Independent
  review corrected a disclosed/overlapping confirmation-seed formula,
  abstention gaming, one mixed metric unit, an overbroad audience-dependency
  claim, an unsupported absolute, and an infeasible undifferentiated compute
  cap. The audit now has separate smoke/full feasibility gates, sealed disjoint
  seed bundles, answer-coverage noninferiority, and an explicit `not measured`
  energy boundary. A generated high-contrast set-union plot shows why summed
  platform account counts can overstate person-level reach without presenting
  synthetic values as audience evidence.

- Fixtures F-013 and F-014 convert 17 reviewed ledger-only claims into complete
  falsification contracts: 13 bounded immunology reproductions plus two
  immune-state systems claims, and two fast/slow-memory and offline-replay
  claims. Post-draft review tightened F-013 to 39 fixed conjunctive component
  contrasts with exact ablation signatures and separated source/AI authority;
  F-014 now isolates replay presence, offline timing, replay selection, and both
  memory tiers against frozen mature nulls, with an exact causal event order,
  deterministic numeric privacy canaries, and joint 18-entry power and Pareto
  procedures. Neither fixture contains an empirical result.

- Six bounded field-depth audits spanning analytical measurement and Earth
  observation, clinical and agricultural biotechnology, economy and education,
  computing systems, medical engineering, and atomic/molecular/condensed-matter/
  plasma science. They add 54 ledger claims (`C-1377`--`C-1430`), 55 complete
  CPU-only falsification protocols, and 212 deduplicated bibliography records.
  The updated census records 37/5/0 OECD and 42/7/0 DFG fields as
  dedicated/adjacent/unreviewed while retaining explicit subfield gaps; all 23
  ANZSRC divisions remain entry-audited. Documentation validation now also
  rejects duplicate or out-of-order claim definitions and duplicate BibTeX
  keys, after catching and correcting one misplaced integration block.

- Fixture F-012 adds a deterministic layout-population performance-inference
  smoke harness for `C-1407`. Its original sixteen tests cover a 1,536-event smoke profile
  and a frozen 27,648-event development profile, including an exact noise-free
  population-null check, equal modeled work and energy, append-only SHA-256 raw
  records, replay/corruption refusal, and byte-identical mature/operator paths.
  Its generated analytical plot makes the synthetic failure visible: selecting
  one favorable layout reports a false 7.53% speedup while the complete,
  counterbalanced layout population and its operator-qualified copy both return
  exactly 0.00%. The harness remains smoke-only and claim-ineligible.

- Decision 0012 and the second executable smoke harness: Fixture F-007 now has
  a deterministic null-space-honesty track for claims `C-970` and `C-972`.
  Eight registered tests cover the full 8,192-event development profile,
  byte-identical replay, runtime-schema validation, hash-chain corruption,
  false-specificity detection, justified abstention, active-measurement
  resource accounting, and exact parity with the complete mature active null.
  Its analytical identifiability plot exposes where information enters the
  operator. The readiness registry now validates two smoke-ready manifests;
  the new fixture output remains outside workstation promotion authority.

- Decision 0009 and a generated global field-coverage census anchored to all
  42 OECD FORD second-level fields, checked against all 49 DFG review boards
  and all 23 ANZSRC 2020 divisions. The final entry-audit census is 30
  dedicated, 12 adjacent, and 0 wholly unreviewed OECD fields; 33/16/0 across
  the DFG boards; and 23/0/0 across ANZSRC divisions. These are not completion
  claims: the 214 DFG subjects, 213 ANZSRC groups, and 1,967 ANZSRC fields
  remain explicit resolution debt. A high-contrast SVG, machine record,
  path-closure validator, anti-bias scheduler, taxonomy-disagreement probe,
  completed-wave record, and next gap wave keep subfield depth visible.

- Five field-centered audits plus a third-taxonomy control in the third breadth
  wave: residual humanities/living heritage; molecular chemistry; polymer
  research; mineralogy/petrology/geochemistry; and direct social research,
  ethnography, and media. Together they add 54 scoped central claims and 42
  exact CPU-only protocol tracks while converting the last wholly unreviewed
  OECD and DFG cells into bounded entry audits. No redundant principle or
  architecture candidate was added.

- Seven deliberately distant field audits in the second breadth wave: nursing
  and care science; animal/veterinary population health; environmental and
  industrial biotechnology; accounting/audit/actuarial/insurance; theology and
  religious practice; forestry/fisheries/aquatic food systems; and
  particle/nuclear experimentation. Together they add 57 central claims and 42
  exact synthetic protocol tracks, deepen EU/German applicability records, and
  change observation, cohort, welfare, reserve, rights, response, selection,
  lifecycle, and search-family boundaries without adding a redundant principle
  or architecture candidate.

- Four field-centered breadth audits: soil/crop multi-resource co-limitation,
  philosophy of science and theory choice, Indigenous data and knowledge
  governance, and textual criticism/variant traditions. They add scoped claims
  `C-1204`--`C-1240`, centralized scholarly or authoritative sources, hostile
  tests, and exact candidate routing without inventing another principle.
- A generated `/readiness` surface and shared book front matter separating
  1,350 claims, 1,237 protocol-covered claims, zero workstation-executable
  claims, 31 complete written protocols, one smoke harness, and zero
  workstation-ready experiments. Candidate 010 exposes nine machine-checkable
  structural promotion gates, six of which currently pass.
- Candidate 010's smoke harness now sends every arm through the same real
  stage--temporary-execution--commit/reset boundary, constructs verifier
  information only during temporary execution, includes a trace-withholding
  ablation, records a corruption-evident hash chain, and limits its execution
  scope to `C-170`. It remains smoke-ready and cannot promote that claim.
- Candidate 010 now reconstructs deterministic resume state from its
  append-only ledger, binds checkpoints to config and ordered seed identity,
  rejects changed or corrupt continuations, freezes the byte-exact executable
  source bundle and Git commit, validates a source/design/preregistration-bound
  seed-release contract without creating a real release, and validates strict external
  wall/rail-meter records without treating fixtures or telemetry as measured
  energy, and freezes bounded factorial and confirmatory-analysis contracts.
  Its full implementation test now executes all 48 scenarios through isolated
  filesystem, transactional-KV, signed-publication, and simulated-actuator
  boundaries with six registered comparator policies, one candidate arm, equal
  budgets, rollback proofs, resume mutation refusal, and no physical actuation.
  The executable source freeze now includes both the release validator and the
  strict promotion-evidence builder. Retry/rollback now executes and charges two
  real effect lifecycles, and the independent-verifier comparator uses a
  separate implementation and provenance line. A longitudinal diagnostic
  exercises persistent transactional-KV and simulated-actuator histories across
  commit, reset, later commit, stale refusal, and declared-interruption
  reconciliation, binds resume to the executable source identity, and verifies
  complete durable history against the ledger. Atomic ownership-checked leases
  reject concurrent factorial and persistent writers before mutation without
  automatically breaking stale locks. An eight-case nonphysical fault campaign actively tests reset
  leakage, incomplete rollback, precommit effects, delayed cleanup, stale or
  corrupt verification, failed finalization, and an irreversible-effect
  sentinel. Complete ledger appends and checkpoint replacements request file
  `fsync`; directory-entry persistence, torn-tail repair, arbitrary power-loss,
  concurrent shared-service contention, and external failure rates remain
  outside the contract. No real
  frozen release, interval-owned calibrated energy observation, or validated
  promotion evidence exists. The 6/9 count remains structural, and no
  experimental result is claimed.

- Candidate 010 source identity now hashes the execution manifest and discovers
  every production module, manifest-registered test, golden fixture, classified
  support file, and production/test relative import edge; an unlisted module,
  unregistered test, unclassified file, symlink, or import outside the frozen
  closure fails the build. A shared executable raw-
  event contract is named by the JSON Schema and runs before smoke/factorial
  append and before analysis, recomputing identities, interval ownership,
  privilege, finalization, byte accounting, energy separation, and nonphysical
  boundaries. Independent-verifier lineage is recomputed from frozen input and
  output; retry/rollback validates two independently observed filesystem
  lifecycles and their total paid work. Persistent identity, pending receipts,
  checkpoints, and final metadata use synced file replacement; tested receipt
  recovery begins only after destination-file `fsync` and before ledger append,
  while directory fsync and arbitrary power-loss recovery remain unclaimed. The promotion
  state remains 6/9 structural gates, zero workstation-ready experiments, and
  zero executable claims. A real confirmation remains blocked until a fresh
  immutable process binds loaded ESM code, source bytes, runtime, and installed
  dependencies to one identity.

- Decision 0010 and Candidate 010's claim-ineligible fresh-process boundary: a typed
  runtime identity for the exact Node executable, runtime fields, root lockfile,
  and installed production-dependency bytes; an isolated, practically read-
  only capsule materialized only from clean regular blobs at Git `HEAD`; a
  dependency-local execution capsule; and a fixed child that verifies those
  identities before dynamic import. A callback-scoped nonserializable
  capability is now required by confirmation run, resume, validation, and
  analysis, while release v3 separately binds source, descriptor, runtime,
  dependencies, config, design, registry, preregistration, and seed authority.
  The strict `capsule-confirmation` operator builds and destroys its owned
  capsule, accepts only release-bound config/design and disjoint seed artifacts,
  and returns a canonical child receipt. Exact launch precommits now support a
  fresh-process resume, and setup work is recorded separately without adding
  the inclusive experiment action twice. A committed execution-manifest
  projection separates mutable readiness/result metadata from frozen code,
  tests, schema, dependencies, commands, and claim scope. Promotion-evidence v2
  can be built only inside the live capsule capability, is persisted atomically
  with its validation receipt, and is later recomputed from the release-bound
  historical commit rather than trusted from stored self-hashes.
  This does not change the 6/9 structural state because no real frozen release,
  calibrated interval-owned energy data, or validated promotion bundle exists.

- Decision 0011 replaces Candidate 010's operationally infeasible per-work-unit
  energy plan with claim-ineligible paired meter blocks. Exact ordered input
  manifests, deterministic arm rotation/reversal, separate warm-up and idle
  observations, configurable sampling/clock/resolution/uncertainty thresholds,
  immutable reviewed imports, and a calculated scale plot reduce the nominal
  two-seed energy artifact count from 6,720,000 to 1,728 without pretending that
  a block is an independent replicate. A new preflight requires seed-level pilot
  variance, powered endpoint effects, complete hardware/meter/calibration/clock/
  thermal/power-plan identities, and explicit record/block/time/byte/file/disk
  ceilings before any reveal. A separate clean-freeze operator can publish
  disjoint confirmation/held-out commitments while retaining their values in
  AES-256-GCM escrow. These layers generate no real seeds, do not open Gate 3,
  and remain ineligible until seed-level block analysis, key custody, release
  binding, target-meter acquisition, and scaled rehearsal are complete.

- Candidate 010 now carries the paired design through a complete fixture
  rehearsal path: an exact-order block executor with block-boundary resume, a
  seed-level analyzer that collapses all repetitions and scenarios before
  paired inference, and a release-v4 envelope binding the seed operator,
  powered preflight, held-out evidence, acquisition policy, and schedule to the
  existing v3 source authority. The analyzer exposes Student-t and conservative
  measurement-uncertainty intervals while explicitly reporting that blocks and
  scenarios contribute zero independent replicates. All three layers remain
  non-promotable until the production entrypoint uses the block bundle and real
  calibrated target-meter evidence exists.

- Three field-depth audits add 25 bounded claims and 23 CPU-only hostile-test
  contracts across clinical intervention pathways; production, maintenance,
  nanomanufacturing, communications, and material qualification; and
  institutions, inequality, collective action, recorded crime, digital traces,
  and media systems. The audits keep measurement operators, implementation
  pathways, decision utility, authority, traceability, and EU/German normative
  applicability explicit. They deepen existing candidate protocols without
  inventing a redundant principle or architecture candidate, and they do not
  convert synthetic protocol descriptions into experimental results.

- A provenance capture and primary-source audit for empirical-versus-formal
  scientific-discovery evaluators, correcting the supplied dusty-plasma date
  and method, scoping FunSearch to executable program search, and defining
  separate observation, identification, intervention, and formal-checking
  contracts without adding another principle or architecture candidate.
- A sixth Google-Doc source capture and coupling-qualified selective-relaxation
  extension to the discovery audit. It replaces the unsupported pinned/unpinned
  terminology and fixed `99%/1%` split with typed formal, numerical, empirical,
  and heuristic assurance classes; corrects the ice-storage phase-change
  example; and adds ten hostile test regimes without adding a principle or
  candidate.
- A generated, downloadable 205-page A4 full-concept book assembled from the
  README and all nineteen concept chapters, with generated readiness front
  matter, the global-field-coverage appendix, a cover, contents page, chapter
  boundaries, print-safe tables, equations, plots, and 47 rendered Mermaid
  diagrams. A source digest makes the build reject a stale PDF.
- Exact visible-text captures of the four supplied Google Docs, retained as
  dated research leads and routed into the existing endogenous-generation,
  constraint, mathematical-practice, and verification queues without being
  promoted to evidence.
- Decision 0008 and a research-wide normative baseline that make the European
  Union and Germany the default context, distinguish binding requirements,
  conformity routes, technical practice, comparative foreign material, and
  drafts, and require exact applicability, version, date, adoption, and
  recheck metadata without invalidating existing foreign audits.
- A biomimetics transfer-method audit, provenance capture for the two supplied
  overview links, ten centralized methodology references, and a colored
  bidirectional workflow that joins phenomenon-push and problem-pull discovery
  at functional abstraction, deduplication, substrate redesign, and
  equal-budget falsification; no claim, principle, or candidate was added.

- The first executable experiment layer: a native-Node Candidate 010 smoke
  harness with deterministic correlated evidence, all declared decision arms,
  real filesystem stage/reset/commit behavior, append-only raw events,
  reproducibility digests, and raw-axis analysis. It remains explicitly
  smoke-ready rather than workstation-ready.
- A strict workstation-manifest schema and validator that checks readiness,
  commands, referenced lockfiles, seed packs, generators, output schemas,
  entrypoints, and tests before claim coverage can become executable.
- Rillig et al. (2025) on concurrent common fungal networks across fungal
  guilds, integrated as a perspective-level causal-attribution boundary with a
  guild-specific intervention refinement to the existing fungal audit; no new
  principle, central claim, or architecture candidate was promoted.
- A generated test-coverage ledger that maps all 1,350 central claims to both
  claim-side and experiment-side relations, applies an eight-facet protocol
  gate, and now separates 1,237 protocol-covered claims from zero
  workstation-ready executions.
- Reviewed, machine-validated dispositions for every remaining ledger-only
  claim and a five-family proposed-artifact backlog covering the eight genuine
  unresolved engineering hypotheses without counting them as tested.
- A workstation execution contract defining commands, frozen environments,
  hardware assumptions, seeds, data, raw outputs, smoke runs, resumability, and
  measured-energy records required before prose becomes a runnable package.
- Four deterministic mathematical SVG plots for finite-error erasure,
  finite-time adiabatic crossover, sparse/locality break-even, and lifecycle
  payback, with editable JSON parameters and explicit non-measurement labels.

- An information-thermodynamics and physical-computation audit separating
  generalized erasure bounds, finite-time/error/stability work, device and
  circuit transitions, workload/data movement, facility/cooling, and embodied
  lifecycle cost.
- Fifty-two thermodynamics claims (`C-1100`–`C-1151`), sixty-two new
  centralized references plus ten deduplicated records, Fixture F-010, its
  boundary-qualified mathematics and editable diagram, and a dedicated
  physical-computation chapter; no principle or candidate was added.
- An olfaction, chemical-sensing, and plume-tracking audit covering receptor
  and sensor operators, mixtures, temporal concentration, active sampling,
  turbulent transport, adaptation, calibration, poisoning, drift, analytical
  confirmation, exposure, and lifecycle work.
- Fifty-two chemical-sensing claims (`C-1152`–`C-1203`), seventy new
  centralized references plus three deduplicated records, Fixture F-011, its
  operator-qualified mathematics and editable diagram, and a dedicated active
  chemical-sensing chapter; no principle or candidate was added.
- A causal-inference and adaptive-experimentation audit with sixty-four scoped
  audit-local claims, sixty primary or authoritative references, thirteen
  equal-budget experiments, and exact routing across the current principles,
  candidates, and fixtures; central promotion remains pending.
- A semiconductor-device and circuit-reliability audit spanning hierarchical
  variation, yield, accelerated qualification, aging, electrothermal coupling,
  radiation, fault geometry, correction, adaptive margins, analog and
  in-memory drift, endurance, fabrication, and lifecycle burden.
- Fifty-two scoped semiconductor claims (`C-1002`–`C-1053`), sixty-five new
  centralized references plus three deduplicated records, Fixture F-008, its
  mission-profile mathematical contract and editable diagram, and a dedicated
  reliability chapter; no principle or candidate was added.
- An acoustics, hearing, auditory-scene-analysis, and echolocation audit that
  binds calibrated pressure and time, propagation, nonlinear filtering,
  binaural geometry, reverberation, grouping, masking, separation, active
  emission, receiver action, exposure, and lifecycle cost.
- Forty-six scoped acoustic claims (`C-1054`–`C-1099`), forty-seven new
  centralized references, Fixture F-009, its operator/action mathematical
  contract and editable diagram, and a dedicated active-acoustic-inference
  chapter; no principle or candidate was added.
- A sports-expertise, adaptive-performance, and team-coordination audit that
  keeps anticipation, physical interception, practice, retention, transfer,
  useful exploration, pacing, readiness, staged return, coordination, shared
  information, deception, selection, and complete cost distinct.
- Forty-four scoped sports claims (`C-926`–`C-969`), forty-seven centralized
  sources, Fixture F-006, its mathematical contract and editable diagram, and
  a dedicated representative-adaptive-performance chapter; no principle or
  candidate was added.
- An optics, photonics, and inverse-sensing audit covering finite measurement
  channels, photon budgets, inverse and computational imaging, active sensing,
  calibration, saturation, fusion, physical transforms, conversion,
  fabrication spread, thermal control, and lifecycle energy.
- Thirty-two scoped optics claims (`C-970`–`C-1001`), sixty-one new centralized
  references plus two deduplicated existing records, Fixture F-007, its
  operator-qualified mathematical contract and editable diagram, and a
  dedicated physical-inference chapter; no principle or candidate was added.
- A comparative-cognition and tool-use audit spanning manufacture, causal
  transfer, future preparation, event memory, costed uncertainty, copying,
  teaching, exploration, social acquisition, negative transfer, and
  central/local/mechanical control.
- Thirty-eight scoped comparative-cognition claims (`C-804`–`C-841`), fifty-one
  new centralized sources, an opportunity- and history-qualified action
  diagram and mathematical contract, and Fixture F-003 with eight independent
  diagnostic tracks; no principle or candidate was added.
- A visual-art and design-cognition audit covering external representations,
  epistemic action, reconstructive generation, representation change,
  expertise, analogy, fixation, parallel prototypes, material feedback,
  qualified evaluation, cultural accumulation, conservation, and provenance.
- Nineteen scoped visual/design claims (`C-842`–`C-860`) and thirty-five new
  centralized sources; no principle or candidate was added.
- Fixture F-002, its editable reconstruction/inspection/transform/evaluation
  diagram, and its mathematical contract for exposure, retrieval, relative
  novelty, fixation, constraint validity, selection regret, lineage,
  reconstructability, and lifecycle cost.
- A mathematical-practice and proof-discovery audit spanning conjecture,
  analogy, abstraction, counterexamples, proof decomposition, lemma libraries,
  notation, invariants, local/global composition, ITP/ATP, SAT/SMT, constraint
  solving, experimental mathematics, collaboration, and proof learning.
- Twenty scoped mathematical-practice claims (`C-861`–`C-880`) and twenty-eight
  new centralized sources; no principle or candidate was added.
- Fixture F-004, an editable propose/challenge/decompose/prove/check/publish/
  invalidate diagram, and a mathematical contract for immutable problem
  identity, leakage-safe splits, proof-DAG reconstruction, certificates, typed
  publication, reverse-dependency invalidation, human effort, and energy.
- A fluid-dynamics and turbulence audit spanning multiscale transfer,
  intermittency, coherent structures, closure and model-form error,
  reduced-order models, adaptive resolution, assimilation and observability,
  sensor placement, control, mixing, transition, extremes, measurement, and
  complete energy accounting.
- Forty-five scoped fluid-dynamics claims (`C-881`–`C-925`) and fifty-eight
  new centralized primary or authoritative sources; no principle or candidate
  was added.
- Fixture F-005, its editable regime-qualified flow diagram, and a mathematical
  contract for signed flux, detector/filter identity, closure support,
  reduced-state adequacy, refinement, assimilation, tail calibration,
  stability, and net lifecycle energy.
- A music-cognition and improvisation audit covering sequence expectation,
  grouping, learned tonal/rhythmic priors, phase correction, motif
  transformation, audio–motor control, expression, ensemble coordination,
  practice, improvisation, and cultural transmission.
- Thirty-six scoped music claims (`C-748`–`C-783`), forty-two new centralized
  sources, a local-clock temporal-control math note, and Fixture F-001 for
  shared-clock-free partner and phrase co-adaptation; no principle or candidate
  was added.
- A library, archival, and information-science audit covering record context,
  provenance, appraisal, retention, fixity, designated communities,
  representation dependencies, migration, authority/vocabulary drift,
  retrieval, citation limits, data curation, and institutional memory.
- Twenty scoped information-science claims (`C-784`–`C-803`), a
  query-registered preservation diagram and mathematical contract, and a
  designated-community/representation-dependency track in Candidate 017; no
  new principle was promoted.
- Decision 0007 and a dedicated `experiments/fixtures/` index separating
  reusable cross-candidate stress regimes from architecture candidates.
- A built-environment and urban-systems audit that keeps plans, sensed state,
  verified physical state, occupants, accessible and emergency routes, life
  safety, utilities, material commitments, acceptance, and recovery distinct
  through topology-changing work.
- Twenty-two scoped built-environment claims (`C-705`–`C-726`), thirty-eight
  centralized sources, an occupied-transition diagram and mathematical
  contract, and a physical stress track in Candidate 001; no new principle was
  promoted.
- An immune tolerance and trained-immunity audit that separates
  representation, recognition, permission, activation, quarantine,
  suppression, impairment, contraction, maintained memory, reactivation, and
  recovery.
- Twenty-one scoped immune claims (`C-727`–`C-747`), forty-four new centralized
  sources, and an editable typed-lifecycle diagram and math note; the result is
  an evaluation contract, not a new principle or candidate.
- A legal evidence/procedure audit that separates normative authority,
  doctrinal validity, empirical effect, formal inference, authentication,
  admissibility, weight, sufficiency, review, remedy, and finality.
- Twenty-six scoped claims (`C-679`–`C-704`), twenty-nine centralized sources,
  an editable contestable-decision diagram, a unit-bearing math note, and
  burden-qualified tracks in Candidates 009/010/011/014/015/020.
- Paired operations-research/supply-chain and learning-science audits that
  share a calibrated proxy-versus-state firewall while keeping physical
  commitment and durable skill acquisition as different transitions.
- Fifty-two deduplicated claims (`C-627`–`C-678`), sixty-nine centralized
  sources, two editable diagrams, two unit-bearing math notes, and experiment
  refinements spanning material service and horizon-qualified instruction.
- A pharmacology/toxicology audit separating commanded dose, realized
  exposure, engagement, response, benefit, harm, adaptation, dependence,
  withdrawal, interaction nulls, and population support.
- Twenty scoped intervention claims (`C-607`–`C-626`), thirty-two centralized
  sources, an editable intervention-chain diagram, unit-bearing mathematical
  notes, and a state/withdrawal-qualified track across Candidates 005/007/012/014.
- Paired animal-navigation/sensory-ecology and biomechanics/motor-control
  audits that bind evidence to the sensing action, body, controller, mechanics,
  calibration, and environment that made it valid.
- Twenty-one deduplicated sensorimotor claims (`C-586`–`C-606`), seventy-seven
  centralized sources, an editable controlled-observability/plant-binding
  diagram, and new stress tracks in Candidates 006/007/012/014.
- Paired microbial-ecology/biofilm and fungal-network audits that keep
  signaling, physiology, transport, ecology, lineage selection, symbiosis, and
  ecosystem consequences at their correct scales.
- Twenty-three deduplicated shared claims (`C-563`–`C-585`), fifty-nine new
  centralized sources, an editable transported-field diagram, and typed in-
  flight inventory tracks in Candidates 001 and 013.
- A developmental-biology and morphogenesis audit separating signal from
  competence, specification from implementation, and current causal function
  from evolutionary origin across patterning, commitment, sculpting, repair,
  metamorphosis, canalization, and plasticity.
- Twenty-four scoped developmental claims (`C-539`–`C-562`), twenty-six
  centralized sources, an editable competence-transition state machine, and a
  cross-candidate fixture spanning Candidates 002/006/009/010/014.
- A metrology and measurement-science audit separating measurand, indication,
  result, calibration, adjustment, verification, validation, traceability,
  uncertainty, reproducibility, comparison, decision, drift, and provenance.
- Twenty scoped measurement claims (`C-519`–`C-538`), twenty-four centralized
  sources, a dedicated mathematical note, an editable assurance flow, and
  dependency-invalidation gates in Candidates 009/014 and the energy chapter.
- A chemical/process-engineering audit separating conservation, nonlinear
  reaction dynamics, separation, recycle, heat integration, MPC/RTO, fault
  diagnosis, safety layers, operability, and structural reconfiguration.
- Eighteen scoped process claims (`C-501`–`C-518`), thirty centralized sources,
  an editable conservation-qualified reconfiguration diagram, and a physical
  stress track in Candidate 001 and chapter 10.
- A mechanical/civil-resilience audit separating compliant/passive physics,
  monitoring, redundancy, robustness, degradation, damage tolerance,
  fatigue/fracture, maintenance, reserve, network flow, and recovery.
- Twenty scoped mechanics/network claims (`C-481`–`C-500`), twenty-eight new
  centralized sources, an editable residual-capacity diagram, and new
  second-event/redistributed-load gates in Candidates 005, 012, and 014.
- A soft/active-matter audit separating passive relaxation, continuous fixed
  drive, external feedback, and adaptive policy across flocking, nematics,
  phase separation, jamming, granular flow, and colloidal assembly.
- Eighteen scoped physical-order claims (`C-463`–`C-480`), twenty-two
  centralized sources, and an editable phase-field compilation lifecycle;
  the only held residue becomes Track E in Candidate 006 and chapter 60.
- An aerospace, maritime, and safety-critical-autonomy audit separating
  stabilization, navigation integrity, operational envelopes, fault stages,
  degraded behavior, fallback, authority, assurance, maintenance, and inquiry.
- Eighteen scoped vehicle/autonomy claims (`C-445`–`C-462`), thirty-five new
  centralized sources, an editable asynchronous authority-transfer state
  machine, and integrity/handoff gates in Candidate 012 and chapter 20.
- A quantitative-history and demography audit separating stock, flow, cohort,
  age, period, migration, momentum, diffusion, selected archives, causal
  identification, multivariate recovery, retrospective fit, and forecasting.
- Twenty-eight scoped population/history claims (`C-417`–`C-444`), twenty-six
  centralized sources, a dedicated mathematical note, and an editable cohort-
  observation diagram; the residual contract extends Candidate 014.
- A human–computer-interaction and human-factors audit separating initiative,
  interruption, mode, automation bias, trust/reliance, explanation, shared
  control, recovery, display, cognitive load, accessibility, and adaptation.
- Twenty-one scoped HCI claims (`C-396`–`C-416`), forty-one centralized
  sources, an editable recoverable-initiative diagram, and new effective-human-
  authority test gates in Candidates 009, 011, 012, and 015.
- A social-choice and institutional-governance audit separating formal,
  empirical, and normative claims across aggregation, strategy, delegation,
  polycentricity, veto, agenda, capture, amendment, participation, and lock-in.
- Twenty-eight scoped governance claims (`C-368`–`C-395`), twenty-five new
  centralized sources, Candidate 020, and an editable multi-level authority
  lifecycle diagram with applicability, null, cost, and retirement gates.
- A cultural-evolution and archaeological-inference audit separating
  generation, transmission, evaluation, retention, governance, model access,
  path dependence, and transformed material evidence.
- Twenty-five scoped cultural-inheritance claims (`C-343`–`C-367`), thirty-two
  centralized sources, Candidate 019, and an editable turnover lifecycle
  diagram testing population inheritance against a complete centralized null.
- A databases and storage audit separating transaction, isolation, ordering,
  replication, quorum, index, cache, compaction, reclamation, event replay,
  temporal, coded repair, and tiering contracts as mature memory nulls.
- Eighteen scoped storage claims (`C-325`–`C-342`), twenty-eight new centralized
  sources, Candidates 017 and 018, and two editable diagrams for finite semantic
  compaction contracts and value/reconstructability-aware artifact placement.
- A pathology and rehabilitation audit covering somatic evolution, recurrence,
  layered tolerance, proteostasis capacity, seeded propagation, compensation,
  forced use, intervention timing, reserve, and adverse plasticity.
- Twenty-three scoped pathology/recovery claims (`C-302`–`C-324`), thirty-five
  centralized sources, and an editable compensation-aware recovery diagram;
  Candidate 005 now separates endpoint success from restored capability,
  compensator dependence, transfer, recurrence, reserve, and adverse effects.
- A paleobiology and major-transitions audit separating demographic from
  reproductive bottlenecks, survival from recovery, acquisition from
  integration, aggregation from individuality, and current utility from origin.
- Twenty scoped paleobiology claims (`C-282`–`C-301`), twenty-seven centralized
  sources, and Candidate 016 with an editable collective-lifecycle diagram,
  multilevel selection accounting, founder-risk tests, conventional modular
  nulls, ablations, and cost-adjusted conflict gates.
- A linguistics and communication-science audit separating formal composition,
  pragmatics, common ground, repair, turn timing, channel coding, compression,
  language change, iterated learning, grounding, and convention formation.
- Fourteen scoped communication claims (`C-268`–`C-281`), twenty-eight
  centralized sources, and Candidate 015 with an editable convention-lifecycle
  diagram, typed message contract, cross-play gates, mature protocol nulls,
  ablations, and equal-budget semantic-drift tests.
- A security and cryptography audit that separates authentication,
  authorization, information flow, detection, containment, revocation, and
  compromise recovery while naming adversaries, trust roots, timing, and cost.
- Eighteen security claims (`C-250`–`C-267`), twenty-two new centralized
  references, and an editable compromise-bounded authority diagram; explicit
  epoch, revocation, independence, and clean-root fields refine Candidates 009
  and 012 instead of being promoted as a redundant principle.
- A geology and geomorphology audit separating physical thresholds,
  self-organized networks, conductance, conservation, hysteresis, topology
  change, record destruction, warning rules, sparse resolution, and mixed
  observation clocks from adaptive control.
- Eighteen scoped geological claims (`C-232`–`C-249`) and thirty-three
  centralized sources; support-qualified evidence fusion is folded into
  Candidate 014 rather than duplicated as a new experiment.
- An astronomy and planetary remote-inference audit that turns calibration,
  response, selection, non-detection, association, model checking, trials,
  alerting, finite-realization uncertainty, and adaptive follow-up into an
  explicit end-to-end observation chain.
- Fourteen scoped remote-inference claims (`C-218`–`C-231`), twenty-two
  centralized sources, and Candidate 014 for versioned observation contracts
  with an editable observation-chain diagram.
- A plant distributed-control audit that keeps individual-plant signaling,
  plant–fungus exchange, and community outcomes at separate causal scales,
  including explicit rejection of generalized forest-network claims that
  outrun path-identifying evidence.
- Fourteen scoped plant claims (`C-204`–`C-217`), twenty-nine centralized
  sources, and Candidate 013 for bidirectional deficit–capability routing with
  an editable signal-and-gate diagram.
- High-reliability-organization and power-grid audits that replace vague
  reliability language with explicit observation, authority, topology,
  reserve, latency, containment, restoration, learning, and maintenance paths.
- Thirty-one scoped claims (`C-173`–`C-203`) and fifty-six centralized sources
  covering incident command, reporting bias, memory-in-use, local protection,
  adaptive relaying, state estimation, synchronization, finite reserve,
  islanding, cascades, and black-start restoration.
- Candidate 011 for dual-loop operational assurance and Candidate 012 for
  latency-qualified authority, each with a compact editable diagram, complete
  accounting vector, mature engineering nulls, ablations, and kill criteria.
- A chemistry and reaction-network audit separating equilibrium recognition,
  kinetic proofreading, nonequilibrium work, autocatalysis,
  compartmentalization, reaction–diffusion, transient assembly, molecular
  computation, oscillators, and stochastic integral control.
- Fifteen scoped chemistry claims (`C-158`–`C-172`), thirty-three centralized
  primary references, and explicit vessel-to-wall energy-accounting boundaries.
- Candidate 010 and an editable verification-loop diagram testing reversible
  execution, conditionally informative checks, reset, and commitment against
  sequential-testing, cascade, abstention, retry, redundancy, and coding nulls.
- Eight new primary-source audits spanning endocrine/circadian control,
  fault-tolerant reconstruction, cellular quality control, Earth-system
  transition signals, adaptive materials, epidemiological surveillance,
  economic incentive design, and programming-language assurance.
- Ninety-one scoped claims (`C-067`–`C-157`) with centralized bibliography
  entries, boundaries, conventional nulls, affected chapters, and open tests.
- Candidate 005 for severity-ordered containment, Candidate 006 for reversible
  physical skill compilation, Candidate 007 for endogenous observation,
  Candidate 008 for contestable modular allocation, and Candidate 009 for
  versioned graded assurance envelopes.
- Five editable candidate diagrams separating repair triage, physical
  compilation, action-altered observation, contestable allocation, and graded
  assurance; Candidate 004 also gains an editable endogenous-curriculum loop.
- Explicit distinctions among exact restoration, encoded reconstruction,
  legitimate-set convergence, and underdetermined functional repair; among
  bifurcation, noise, rate, flickering, hysteretic, hidden-mode, boundary, and
  abrupt transitions; and among proof, monitored behavior, authority,
  provenance, rollback, and empirical evidence.
- A canonical cross-domain convergence chapter that groups thirteen existing
  principles into five navigational families while preserving causal,
  topological, timescale, and failure-boundary differences.
- Experiment-facing rewrites of structural growth and routing, multimodal
  sensorimotor grounding, and hardening/factual memory.
- Five editable Mermaid figures for cross-domain solution families, structural
  growth, grounded learning, hardening paths, and the recurring research loop.
- A staged research program with explicit evidence, synthesis, decision, null-
  model, rejection, integration, and substrate gates plus an immediate field
  queue.
- Candidate 004, a two-track equal-budget contract that separates copying,
  retrieval, stochastic and evolutionary search, targeted intervention,
  independent evaluation, controlled variation, and lineage memory.
- Readable, experiment-facing rewrites of sparse adaptive compute, memory
  lifecycle, reversible structural consolidation, system synthesis, and energy
  evaluation.
- Four editable Mermaid figures for adaptive compute control, memory lifecycle,
  maturity and fragility, and the efficiency evaluation loop.
- A traceable 17–20 W whole-brain metabolic range in C-001 and its primary
  source, replacing the previously under-sourced title shorthand.
- Dimensionally closed notation for grounding, routing, adaptive compute,
  consolidation, lifecycle efficiency, and Candidate 002's control objective.
- A narrative working-architecture chapter that connects the evidence ledger
  to fast runtime, adaptation, maintenance, resource, and generative-
  recombination loops.
- Editable Mermaid diagrams for the three-loop system and the
  copy–compress–vary–test–retain cycle.
- A refreshed private-site preview image aligned with the reader's restrained
  biological-to-silicon visual language.
- Explicit unordered, ordered, and nested list markers in the rendered reader
  so Markdown structure remains visible after the CSS reset.

- An open-world discovery policy treating every empirical, formal, and
  engineering science as a potential source, organized by shared problem
  classes and constrained by evidence, deduplication, engineering null models,
  and rejection tests.
- A wider domain horizon spanning physical, earth, medical, formal,
  engineering, and social sciences without lowering the evidence bar.
- Five dated audits covering memory lifecycle, neural development and global
  control, collective/ecological resilience, engineering null models, and
  endogenous generation and creativity.
- Thirty-one scoped claims (`C-036`–`C-066`) and primary references covering
  selective replay, active forgetting, reversible plasticity, multiscale
  modulation, local resource allocation, quorum decisions, ecological
  fragility, active exploration, imitation, and regulated variability.
- Three pre-implementation experiment contracts for adaptive topology,
  multiscale context broadcast, and recovery-based fragility sensing, with
  equal budgets, conventional baselines, ablations, and hard rejection gates.
- An Experiments section in the private research reader so the contracts are
  searchable and navigable alongside the evidence and concept chapters.
- A dimensioned, constrained memory-lifecycle model separating replay, merge,
  externalization, weakening, deletion, and deferral actions.

- Canonical modular concept covering the developmental pipeline, runtime
  synthesis, energy model, and research roadmap.
- Stable evidence ledger, primary-source bibliography, mathematical notation,
  open-question register, and documentation validator.
- Editable Mermaid sources for the developmental and runtime architectures.
- Decision records establishing Git as canonical and requiring evidence before
  assertion.
- A substrate-aware chapter treating biology as a launchpad rather than a
  ceiling.
- Neuroscience and comparative-biology opportunity maps with concrete rejection
  tests.
- A deduplicated `P-` principle registry that bundles recurring solutions across
  disciplines while preserving domain-specific evidence.
- An adoption matrix, imported-source crosswalk, 19 new scoped evidence claims,
  and primary references for the initial cross-domain literature passes.
- A domain inventory that keeps audited, partial, and queued scientific fields
  visible while their recurring principles are deduplicated.
- A Mermaid source for the evidence-to-principle research workflow.
- A searchable private research edition that live-renders canonical Markdown,
  LaTeX, BibTeX, and Mermaid sources without duplicating the documents.
- A committed production build path and owner-only online publishing policy.

### Fixed

- The private reader now sends only document metadata plus the selected body to
  the browser, and renders oversized files as complete, addressable bounded
  sections. Previously every route hydrated roughly 13 MiB of canonical source
  text and a 1.5 MiB ledger still produced one enormous DOM, which could make
  content appear missing or hang navigation. Cross-document links now request
  the selected document section from the server, deep claim anchors resolve to
  their exact section, and same-section anchors remain local.
- Full-book heading anchors now clear the sticky action bar at desktop widths;
  the previous 28-pixel offset could hide the selected heading.
- Mathematical validation now excludes ephemeral workstation-test directories,
  so concurrent harness cleanup cannot invalidate a documentation scan.
- The new evidence wave now freezes all three source-audit hashes, links every
  C-1506--C-1529 record back to its audit and affected chapter, classifies the
  two composed mechanisms as plausible, and keeps the multiscale remainder,
  vector-field units, and development-runner state dimensionally and
  operationally consistent.
- Mermaid SVG decoration now parses renderer output as HTML-compatible SVG,
  eliminating the XML `<br>` parser failures that could replace diagrams with
  error boxes in the private site.
- Book-internal links no longer retain local preview origins in the exported
  PDF; included chapters use document anchors and supporting research links use
  the canonical private-site URL.
- Printed table headers repeat across page breaks and rows remain intact where
  the PDF renderer paginates long research tables.

## [0.1.0] - 2026-08-05

### Added

- Preserved captures of the starting Google Doc and two Gemini conversations.
- Explicitly classified all imported material as non-authoritative.
