# Research watch

Research watch tracks cross-fleet research leads and candidate literature
relevant to 20 Watts Was Enough.

## What it does

Fleet repositories use GitHub issues labelled `research-watch` to record candidate
papers, releases, and observations. Research watch ingests those issues and
publishes verified public leads into the repository.

1. **Ingestion** (`scripts/research-watch-ingest.mjs`, `npm run ingest:research-watch`):
   - Queries issues labelled `research-watch` across fleet owners declared in
     [`owners.json`](owners.json).
   - Normalises external links (DOIs, arXiv identifiers, release tags, canonical
     URLs) and merges duplicate reports into shared lead entries.
   - Isolates private or internal origin metadata in `.workingdir/ingest/private-leads.json`.
   - Validates that no private identifiers, titles, or URLs leak into the public
     catalog before writing `leads.json`.
   - Advances `.watermark` and appends run telemetry to `runs.jsonl`.

2. **Publication** (`scripts/research-watch-publish.mjs`, `npm run publish:research-watch`):
   - Runs on a daily systemd timer to execute the ingester and check for updates.
   - Compares the generated `leads.json` against the current `main` branch
     version via the GitHub GraphQL API (`repository.object`). If `leads.json` is
     unchanged, the run exits 0 immediately without modifying remote state.
   - If public leads changed, builds a commit containing exactly the three
     allow-listed files (`leads.json`, `.watermark`, `runs.jsonl`).
   - Uses GitHub GraphQL `createCommitOnBranch` to create a web-flow signed commit
     directly on branch `research-watch/ingest` without requiring local Git push
     credentials. The commit message ends in a `Signed-off-by:` trailer for
     `user.name` and `user.email` from the checkout's Git configuration; a
     missing or malformed identity fails closed with exit code `2` before the
     ingester runs.
   - Creates a pull request against `main` if none exists, or updates the branch
     under an existing open pull request.

## Credentials

The publisher reads its GitHub authentication token strictly from a systemd
credential file:

```text
$CREDENTIALS_DIRECTORY/research-watch-token
```

For test environments and manual execution, the path is overridable via
`--token-file <path>`.

When not located under `$CREDENTIALS_DIRECTORY`, the token file must have POSIX
permissions of `0600` or narrower. Any missing file, unreadable file, empty token,
or wider permission mode fails closed with exit code `2`. The token is never read
from ambient environment variables (`GH_TOKEN`, `GITHUB_TOKEN`) and is never
printed in diagnostics or logs.

## Dry run

To verify planned actions without mutating remote branches or pull requests, run
the publisher with `--dry-run`:

```bash
node scripts/research-watch-publish.mjs --dry-run --token-file /path/to/token
```

Dry-run mode inspects repository state on GitHub and outputs the planned branch
action (`create-branch`, `reset-branch`, or `update-branch`), pull request action
(`create-pr` or `existing-pr`), and allow-listed file paths. No remote mutations
are dispatched.

## Invariants and safety bounds

- **Allow-list**: Only `research/ingest/leads.json`, `research/ingest/.watermark`,
  and `research/ingest/runs.jsonl` may be published. Any additional path in the
  payload fails closed.
- **Payload cap**: Combined payload size is capped at 1 MiB.
- **Bounds**: Every GraphQL request carries a 15-second timeout, with up to three
  exponential backoff retries for rate limits or server errors, and an overall
  15-minute run deadline.
- **Diagnostics**: Network and remote errors emit only fixed local diagnostics to
  prevent sensitive remote text from leaking to process output.
