import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { main, validateAdditions } from "./research-watch-publish.mjs";

const instant = "2026-10-15T12:00:00Z";
const defaultToken = "fixture-secret-token-xyz123";

function sampleLeads(entries = []) {
  return JSON.stringify({ schema_version: "1.0.0", entries }, null, 2) + "\n";
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function handleInspectRepository(options) {
  return jsonResponse({
    data: {
      repository: {
        id: "R_TEST_REPO",
        object: options.remoteLeadsText !== undefined
          ? { text: options.remoteLeadsText }
          : null,
        branchObject: options.branchLeadsText !== undefined
          ? { text: options.branchLeadsText }
          : null,
        mainRef: {
          id: "REF_MAIN",
          target: { oid: options.mainHeadOid ?? "main_head_oid_1111111111111111111111111111111111111111" },
        },
        branchRef: options.branchRef !== undefined
          ? options.branchRef
          : null,
        pullRequests: {
          nodes: options.openPRs ?? [],
        },
      },
    },
  });
}

function handleCreateRef() {
  return jsonResponse({
    data: {
      createRef: {
        ref: { id: "REF_CREATED", name: "refs/heads/research-watch/ingest" },
      },
    },
  });
}

function handleUpdateRef() {
  return jsonResponse({
    data: {
      updateRef: {
        ref: { id: "REF_UPDATED", name: "refs/heads/research-watch/ingest" },
      },
    },
  });
}

function handleCreateCommitOnBranch() {
  return jsonResponse({
    data: {
      createCommitOnBranch: {
        commit: { oid: "commit_oid_9999", url: "https://github.com/commit/9999" },
      },
    },
  });
}

function handleCreatePullRequest() {
  return jsonResponse({
    data: {
      createPullRequest: {
        pullRequest: { id: "PR_CREATED", number: 42, url: "https://github.com/pr/42" },
      },
    },
  });
}

const mockDispatchTable = {
  InspectRepository: handleInspectRepository,
  CreateRef: handleCreateRef,
  UpdateRef: handleUpdateRef,
  CreateCommitOnBranch: handleCreateCommitOnBranch,
  CreatePullRequest: handleCreatePullRequest,
};

function dispatchMockQuery(query, options) {
  for (const [kind, fn] of Object.entries(mockDispatchTable)) {
    if (query.includes(kind)) {
      return fn(options);
    }
  }
  assert.fail(`Unexpected GraphQL call: ${query.slice(0, 40)}`);
}

function assertMockRequest(input, init, expectedToken) {
  assert.equal(input, "https://api.github.com/graphql");
  assert.equal(init.method, "POST");
  assert.equal(init.headers.Authorization, `Bearer ${expectedToken}`);
  assert.ok(init.signal instanceof AbortSignal);
}

function mockGraphQLHandler(options = {}) {
  const calls = [];
  const expectedToken = options.expectedToken ?? defaultToken;

  const handler = async (input, init) => {
    assertMockRequest(input, init, expectedToken);
    const body = JSON.parse(init.body);
    calls.push(body);

    if (options.status && options.status !== 200) {
      return new Response(options.body ?? "error", {
        status: options.status,
        headers: options.headers ?? {},
      });
    }

    if (options.graphQLErrors) {
      return jsonResponse({
        errors: [{ message: "Confidential remote error details" }],
      });
    }

    return dispatchMockQuery(body.query, options);
  };

  return { handler, calls };
}

async function createFixture(t, options = {}) {
  const base = path.resolve(".workingdir/publish-tests");
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(path.join(base, "pub-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const ingestDir = path.join(root, "research/ingest");
  await mkdir(ingestDir, { recursive: true });

  const leads = options.leadsText ?? sampleLeads([
    { canonical_key: "doi:10.1234/test", origins: [], private_origin_count: 0 },
  ]);
  const watermark = options.watermarkText ?? `${instant}\n`;
  const runs = options.runsText ?? '{"timestamp":"2026-10-15T12:00:00Z","duration_ms":100}\n';

  await writeFile(path.join(ingestDir, "leads.json"), leads);
  await writeFile(path.join(ingestDir, ".watermark"), watermark);
  await writeFile(path.join(ingestDir, "runs.jsonl"), runs);

  const tokenPath = path.join(root, "research-watch-token");
  await writeFile(tokenPath, options.tokenContent ?? `${defaultToken}\n`);
  await chmod(tokenPath, options.tokenMode ?? 0o600);

  const runIngest = options.runIngest ?? (async () => ({ exitCode: 0, message: "ingest ok" }));

  return {
    root,
    tokenPath,
    runIngest,
    leads,
    watermark,
    runs,
  };
}

// Positive tests
test("positive: no lead change exits 0 and performs zero mutations", async (t) => {
  const fix = await createFixture(t);
  const { handler, calls } = mockGraphQLHandler({
    remoteLeadsText: fix.leads, // leads unchanged!
  });

  const result = await main({
    args: ["--token-file", fix.tokenPath],
    env: {},
    fetchImpl: handler,
    runIngest: fix.runIngest,
    root: fix.root,
  });

  assert.equal(result.exitCode, 0);
  assert.match(result.message, /no lead change/u);
  assert.equal(calls.length, 1); // Only the inspection query
  assert.ok(calls[0].query.includes("InspectRepository"));
});

test("positive: change + no branch -> createRef + commit + PR", async (t) => {
  const fix = await createFixture(t);
  const mainOid = "main_head_oid_1111111111111111111111111111111111111111";
  const { handler, calls } = mockGraphQLHandler({
    remoteLeadsText: null, // remote leads absent/different
    mainHeadOid: mainOid,
    branchRef: null, // branch absent
    openPRs: [],
  });

  const result = await main({
    args: ["--token-file", fix.tokenPath],
    env: {},
    fetchImpl: handler,
    runIngest: fix.runIngest,
    root: fix.root,
  });

  assert.equal(result.exitCode, 0);
  assert.match(result.message, /Research-watch leads published/u);

  assert.equal(calls.length, 4);
  assert.ok(calls[0].query.includes("InspectRepository"));

  // 1. createRef
  assert.ok(calls[1].query.includes("CreateRef"));
  assert.equal(calls[1].variables.input.name, "refs/heads/research-watch/ingest");
  assert.equal(calls[1].variables.input.oid, mainOid);

  // 2. createCommitOnBranch
  assert.ok(calls[2].query.includes("CreateCommitOnBranch"));
  assert.equal(calls[2].variables.input.expectedHeadOid, mainOid);
  assert.equal(calls[2].variables.input.message.headline, "chore(research): refresh research-watch leads");
  assert.match(calls[2].variables.input.message.body, /Lead count: 1/u);

  // 3. createPullRequest
  assert.ok(calls[3].query.includes("CreatePullRequest"));
  assert.equal(calls[3].variables.input.headRefName, "research-watch/ingest");
  assert.equal(calls[3].variables.input.baseRefName, "main");
  assert.match(calls[3].variables.input.body, /Public leads count: 1/u);
});

test("positive: branch + open PR -> commit only onto branch in place", async (t) => {
  const fix = await createFixture(t);
  const branchOid = "branch_head_oid_2222222222222222222222222222222222222222";
  const { handler, calls } = mockGraphQLHandler({
    remoteLeadsText: "old leads text",
    branchRef: { id: "REF_BRANCH", target: { oid: branchOid } },
    openPRs: [{ id: "PR_EXISTING", number: 77 }],
  });

  const result = await main({
    args: ["--token-file", fix.tokenPath],
    env: {},
    fetchImpl: handler,
    runIngest: fix.runIngest,
    root: fix.root,
  });

  assert.equal(result.exitCode, 0);
  assert.match(result.message, /Research-watch leads published/u);

  assert.equal(calls.length, 2);
  assert.ok(calls[0].query.includes("InspectRepository"));

  // Commit only
  assert.ok(calls[1].query.includes("CreateCommitOnBranch"));
  assert.equal(calls[1].variables.input.expectedHeadOid, branchOid);
});

test("positive: open PR already carrying the leads -> no mutation", async (t) => {
  const fix = await createFixture(t);
  const { handler, calls } = mockGraphQLHandler({
    remoteLeadsText: "old leads text",
    branchLeadsText: fix.leads,
    branchRef: { id: "REF_BRANCH", target: { oid: "branch_head_oid" } },
    openPRs: [{ id: "PR_EXISTING", number: 77 }],
  });

  const result = await main({
    args: ["--token-file", fix.tokenPath],
    env: {},
    fetchImpl: handler,
    runIngest: fix.runIngest,
    root: fix.root,
  });

  assert.equal(result.exitCode, 0);
  assert.match(result.message, /already on the open pull request/u);
  assert.equal(calls.length, 1);
});

test("positive: branch no PR -> reset + commit + PR", async (t) => {
  const fix = await createFixture(t);
  const mainOid = "main_head_oid_3333333333333333333333333333333333333333";
  const { handler, calls } = mockGraphQLHandler({
    remoteLeadsText: "old leads text",
    mainHeadOid: mainOid,
    branchRef: { id: "REF_BRANCH", target: { oid: "stale_branch_oid" } },
    openPRs: [], // no open PR
  });

  const result = await main({
    args: ["--token-file", fix.tokenPath],
    env: {},
    fetchImpl: handler,
    runIngest: fix.runIngest,
    root: fix.root,
  });

  assert.equal(result.exitCode, 0);
  assert.match(result.message, /Research-watch leads published/u);

  assert.equal(calls.length, 4);
  assert.ok(calls[0].query.includes("InspectRepository"));

  // 1. updateRef with force
  assert.ok(calls[1].query.includes("UpdateRef"));
  assert.equal(calls[1].variables.input.refId, "REF_BRANCH");
  assert.equal(calls[1].variables.input.oid, mainOid);
  assert.equal(calls[1].variables.input.force, true);

  // 2. createCommitOnBranch
  assert.ok(calls[2].query.includes("CreateCommitOnBranch"));
  assert.equal(calls[2].variables.input.expectedHeadOid, mainOid);

  // 3. createPullRequest
  assert.ok(calls[3].query.includes("CreatePullRequest"));
});

// Negative tests
test("negative: extra path rejected by additions allow-list validation", () => {
  assert.throws(() => {
    validateAdditions([
      { path: "research/ingest/leads.json" },
      { path: "research/ingest/.watermark" },
      { path: "research/ingest/runs.jsonl" },
      { path: "unauthorized/file.txt" },
    ]);
  }, /allow-list/u);

  assert.throws(() => {
    validateAdditions([
      { path: "research/ingest/leads.json" },
      { path: "research/ingest/.watermark" },
      { path: "research/ingest/other.jsonl" },
    ]);
  }, /Invalid addition path/u);
});

test("negative: ingest failure exits with same code and publishes nothing", async (t) => {
  const fix = await createFixture(t, {
    runIngest: async () => ({ exitCode: 2, message: "Ingest credential failure" }),
  });
  const { handler, calls } = mockGraphQLHandler();

  const result = await main({
    args: ["--token-file", fix.tokenPath],
    env: {},
    fetchImpl: handler,
    runIngest: fix.runIngest,
    root: fix.root,
  });

  assert.equal(result.exitCode, 2);
  assert.match(result.message, /Ingest credential failure/u);
  assert.equal(calls.length, 0); // No network calls made
});

test("negative: token missing or unreadable exits 2 with fixed message", async (t) => {
  const fix = await createFixture(t);
  const { handler, calls } = mockGraphQLHandler();

  // Missing token file argument and missing CREDENTIALS_DIRECTORY
  const result1 = await main({
    args: [],
    env: {},
    fetchImpl: handler,
    runIngest: fix.runIngest,
    root: fix.root,
  });
  assert.equal(result1.exitCode, 2);
  assert.match(result1.message, /Research-watch token missing, unreadable, empty or insecure/u);

  // Insecure file mode (0644 when outside CREDENTIALS_DIRECTORY)
  await chmod(fix.tokenPath, 0o644);
  const result2 = await main({
    args: ["--token-file", fix.tokenPath],
    env: {},
    fetchImpl: handler,
    runIngest: fix.runIngest,
    root: fix.root,
  });
  assert.equal(result2.exitCode, 2);
  assert.match(result2.message, /Research-watch token missing, unreadable, empty or insecure/u);

  // Environment tokens are never a fallback for the credential file
  const result3 = await main({
    args: [],
    env: { GITHUB_TOKEN: "github_pat_env", GH_TOKEN: "github_pat_env" },
    fetchImpl: handler,
    runIngest: fix.runIngest,
    root: fix.root,
  });
  assert.equal(result3.exitCode, 2);
  assert.match(result3.message, /Research-watch token missing, unreadable, empty or insecure/u);

  assert.equal(calls.length, 0);
});

test("negative: token never appears in any output or thrown message", async (t) => {
  const secret = "SUPER_SECRET_TOKEN_DO_NOT_LEAK_98765";
  const fix = await createFixture(t, { tokenContent: secret });

  // 1. GraphQL error
  const { handler: handlerErrors } = mockGraphQLHandler({
    expectedToken: secret,
    graphQLErrors: true,
  });

  const result1 = await main({
    args: ["--token-file", fix.tokenPath],
    env: {},
    fetchImpl: handlerErrors,
    runIngest: fix.runIngest,
    root: fix.root,
  });
  assert.equal(result1.exitCode, 1);
  assert.ok(!result1.message.includes(secret));

  // 2. HTTP 500 error
  const { handler: handler500 } = mockGraphQLHandler({
    expectedToken: secret,
    status: 500,
    body: "Internal server error containing token: " + secret,
  });

  const result2 = await main({
    args: ["--token-file", fix.tokenPath],
    env: {},
    fetchImpl: handler500,
    runIngest: fix.runIngest,
    root: fix.root,
    sleep: async () => {},
  });
  assert.equal(result2.exitCode, 1);
  assert.ok(!result2.message.includes(secret));
});

test("negative: >1 open PR exits 1", async (t) => {
  const fix = await createFixture(t);
  const { handler, calls } = mockGraphQLHandler({
    remoteLeadsText: "old text",
    openPRs: [{ id: "PR_1", number: 1 }, { id: "PR_2", number: 2 }],
  });

  const result = await main({
    args: ["--token-file", fix.tokenPath],
    env: {},
    fetchImpl: handler,
    runIngest: fix.runIngest,
    root: fix.root,
  });

  assert.equal(result.exitCode, 1);
  assert.match(result.message, /More than one open pull request/u);
  assert.equal(calls.length, 1); // Only the inspection query
});

test("negative: GraphQL errors array exits 1 without echoing message", async (t) => {
  const fix = await createFixture(t);
  const { handler } = mockGraphQLHandler({
    graphQLErrors: true,
  });

  const result = await main({
    args: ["--token-file", fix.tokenPath],
    env: {},
    fetchImpl: handler,
    runIngest: fix.runIngest,
    root: fix.root,
  });

  assert.equal(result.exitCode, 1);
  assert.match(result.message, /GitHub GraphQL request failed/u);
  assert.ok(!result.message.includes("Confidential remote error details"));
});

// Boundary tests
test("boundary: file exactly at 1 MiB cap is accepted", async (t) => {
  const cap = 1_048_576; // 1 MiB
  const leadObj = { schema_version: "1.0.0", entries: [], pad: "" };
  const initial = JSON.stringify(leadObj, null, 2) + "\n";
  const diff = cap - Buffer.byteLength(initial, "utf8");
  leadObj.pad = "a".repeat(diff);
  const paddedLeads = JSON.stringify(leadObj, null, 2) + "\n";
  assert.equal(Buffer.byteLength(paddedLeads, "utf8"), cap);

  const fix = await createFixture(t, {
    leadsText: paddedLeads,
    watermarkText: "",
    runsText: "",
  });

  const { handler, calls } = mockGraphQLHandler({
    remoteLeadsText: null,
  });

  const result = await main({
    args: ["--token-file", fix.tokenPath],
    env: {},
    fetchImpl: handler,
    runIngest: fix.runIngest,
    root: fix.root,
  });

  assert.equal(result.exitCode, 0);
  assert.ok(calls.length > 1);
});

test("boundary: cap+1 byte is rejected", async (t) => {
  const capPlusOne = 1_048_576 + 1;
  const leadObj = { schema_version: "1.0.0", entries: [], pad: "" };
  const initial = JSON.stringify(leadObj, null, 2) + "\n";
  const diff = capPlusOne - Buffer.byteLength(initial, "utf8");
  leadObj.pad = "a".repeat(diff);
  const oversizedLeads = JSON.stringify(leadObj, null, 2) + "\n";
  assert.equal(Buffer.byteLength(oversizedLeads, "utf8"), capPlusOne);

  const fix = await createFixture(t, {
    leadsText: oversizedLeads,
  });

  const { handler, calls } = mockGraphQLHandler({
    remoteLeadsText: null,
  });

  await assert.rejects(main({
    args: ["--token-file", fix.tokenPath],
    env: {},
    fetchImpl: handler,
    runIngest: fix.runIngest,
    root: fix.root,
  }), /payload size cap/u);

  assert.equal(calls.length, 0);
});

test("boundary: dry-run makes zero mutations and outputs plan", async (t) => {
  const fix = await createFixture(t);
  const { handler, calls } = mockGraphQLHandler({
    remoteLeadsText: "old text",
    branchRef: null,
    openPRs: [],
  });

  const result = await main({
    args: ["--token-file", fix.tokenPath, "--dry-run"],
    env: {},
    fetchImpl: handler,
    runIngest: fix.runIngest,
    root: fix.root,
  });

  assert.equal(result.exitCode, 0);
  assert.match(result.message, /\[dry-run\] create-branch, create-pr, paths: research\/ingest\/leads\.json, research\/ingest\/\.watermark, research\/ingest\/runs\.jsonl/u);
  assert.equal(calls.length, 1); // Only the inspection query, ZERO mutations
});

test("token under CREDENTIALS_DIRECTORY admits systemd managed mode", async (t) => {
  const fix = await createFixture(t, { tokenMode: 0o644 });
  const credDir = path.dirname(fix.tokenPath);
  const tokenFile = path.basename(fix.tokenPath);

  const { handler } = mockGraphQLHandler({
    remoteLeadsText: fix.leads,
  });

  // Provide CREDENTIALS_DIRECTORY
  const result = await main({
    args: ["--token-file", fix.tokenPath],
    env: { CREDENTIALS_DIRECTORY: credDir },
    fetchImpl: handler,
    runIngest: fix.runIngest,
    root: fix.root,
  });

  assert.equal(result.exitCode, 0);
});

test("retry recovers from transient 500 error", async (t) => {
  const fix = await createFixture(t);
  let attempt = 0;
  const retryHandler = async (input, init) => {
    attempt += 1;
    if (attempt === 1) {
      return new Response("Internal Server Error", { status: 500 });
    }
    return new Response(JSON.stringify({
      data: {
        repository: {
          id: "R_TEST",
          object: { text: fix.leads },
          mainRef: { id: "REF_MAIN", target: { oid: "1111111111111111111111111111111111111111" } },
          branchRef: null,
          pullRequests: { nodes: [] },
        },
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const result = await main({
    args: ["--token-file", fix.tokenPath],
    env: {},
    fetchImpl: retryHandler,
    runIngest: fix.runIngest,
    root: fix.root,
    sleep: async () => {},
  });

  assert.equal(result.exitCode, 0);
  assert.equal(attempt, 2);
});

test("custom additions parameter rejects extra paths during main call", async (t) => {
  const fix = await createFixture(t);
  const { handler } = mockGraphQLHandler({
    remoteLeadsText: "old text",
    branchRef: null,
    openPRs: [],
  });

  await assert.rejects(main({
    args: ["--token-file", fix.tokenPath],
    env: {},
    fetchImpl: handler,
    runIngest: fix.runIngest,
    root: fix.root,
    additions: [
      { path: "research/ingest/leads.json" },
      { path: "research/ingest/.watermark" },
      { path: "research/ingest/runs.jsonl" },
      { path: "extra/rogue.json" },
    ],
  }), /Invalid additions allow-list/u);
});

