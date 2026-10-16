import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  assertNoPrivateLeak, assignTier, buildLeads, buildSearchQueries, canonicalKeys,
  contentHash, extractLinks, listRepoIssues, loadOwners, normalizeIssue, runCli,
  searchAll, validateRecord,
} from "./research-watch-ingest.mjs";

const instant = "2026-10-15T12:00:00Z";
const watermark = "2026-10-14T00:00:00Z";
const ownersText = JSON.stringify({ schema_version: "1.0.0", owners: [{ kind: "org", login: "cordanaLLM" }] });
const emptyLinks = { urls: [], dois: [], arxiv_ids: [], release_tags: [] };

function issue(overrides = {}) {
  return {
    number: 1, node_id: "I_PUBLIC_FIRST", title: "Paper lead", body: "https://arxiv.org/abs/2501.01234v2",
    html_url: "https://github.com/cordanaLLM/a/issues/1",
    repository_url: "https://api.github.com/repos/cordanaLLM/a",
    state: "open", labels: [{ name: "research-watch" }], milestone: null,
    created_at: watermark, updated_at: instant, closed_at: null, user: { type: "User" },
    ...overrides,
  };
}

function record(overrides = {}, meta = {}) {
  return normalizeIssue(issue(overrides), { full_name: "cordanaLLM/a", visibility: "public", ...meta }, instant, watermark);
}

function privateRecord(body = "Private standalone details") {
  return record({
    node_id: "I_PRIVATE_CONFIDENTIAL", title: "Confidential unpublished lead",
    html_url: "https://github.com/secret-org/hidden/issues/1", body,
  }, { full_name: "secret-org/hidden", visibility: "private" });
}

function response(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers });
}

function searchResponse(items = [], total = items.length) {
  return response({ items, total_count: total, incomplete_results: false });
}

function errorChain(error) {
  return `${error.message} ${error.cause?.message ?? ""}`;
}

function transport(overrides = {}) {
  return async (input, options) => {
    const url = new URL(input);
    assert.equal(options.method, "GET");
    assert.equal(options.redirect, "error");
    assert.equal(options.headers.Authorization, "Bearer fixture-token");
    assert.ok(options.signal instanceof AbortSignal);
    if (overrides[url.pathname]) return overrides[url.pathname](url);
    if (url.pathname === "/search/issues") return searchResponse([issue()]);
    if (url.pathname === "/repos/cordanaLLM/a") return response({ full_name: "cordanaLLM/a", visibility: "public" });
    assert.fail(`Unexpected offline request: ${url.pathname}`);
  };
}

async function fixture(t) {
  const base = path.resolve(".workingdir/ingest-tests");
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(path.join(base, "run-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "research/ingest"), { recursive: true });
  await writeFile(path.join(root, "research/ingest/owners.json"), ownersText);
  return { root, env: { GH_TOKEN: "fixture-token" }, fetchedAt: instant, fetchImpl: transport(), args: [] };
}

test("owner queries use repeated qualifiers, chunks of five and a watermark", async () => {
  const text = await readFile(new URL("../research/ingest/owners.json", import.meta.url), "utf8");
  const owners = loadOwners(text);
  assert.equal(owners.length, 9);
  assert.deepEqual(owners.map((owner) => owner.login), ["cordanaLLM", "goph-arr", "golusoris", "VMAFx", "jellysin", "plurano", "vidiko", "tekmora", "lusoris"]);
  const queries = buildSearchQueries(owners, watermark);
  assert.deepEqual(queries, [
    `is:issue label:research-watch org:cordanaLLM org:goph-arr org:golusoris org:VMAFx org:jellysin updated:>=${watermark}`,
    `is:issue label:research-watch org:plurano org:vidiko org:tekmora user:lusoris updated:>=${watermark}`,
  ]);
  assert.ok(queries.every((query) => !/[()]/u.test(query) && !query.includes(" OR ")));
  assert.deepEqual(buildSearchQueries(owners.slice(0, 5)), [queries[0].split(" updated:")[0]]);
});

test("owners refuse duplicate logins, JSON members, unknown kinds and empty inventories", () => {
  const encoded = (owners) => JSON.stringify({ schema_version: "1.0.0", owners });
  assert.throws(() => loadOwners(encoded([{ kind: "org", login: "X" }, { kind: "user", login: "x" }])), /duplicate/u);
  assert.throws(() => loadOwners(encoded([{ kind: "team", login: "x" }])), /kind/u);
  assert.throws(() => loadOwners(encoded([])), /empty/u);
  assert.throws(() => loadOwners('{"schema_version":"1.0.0","owners":[],"owners":[]}'), /repeats/u);
  assert.throws(() => loadOwners(encoded([{ kind: "org", login: "x org:other" }])), /login/u);
});

test("tier labels take precedence; conflicts remain untiered; link inference is explicit", () => {
  const paper = extractLinks("doi:10.1234/EXAMPLE");
  const release = extractLinks("https://github.com/upstream/tool/releases/tag/v1.0");
  for (const tier of ["news", "paper", "release", "followed"]) {
    assert.equal(assignTier([`research-watch:${tier}`], paper), tier);
  }
  assert.equal(assignTier(["research-watch:news", "research-watch:paper"], paper), "untiered");
  assert.equal(assignTier([], paper), "paper");
  assert.equal(assignTier([], release), "release");
  assert.equal(assignTier([], extractLinks("https://arxiv.org/pdf/2501.01234v3.pdf")), "paper");
  assert.equal(assignTier(["research-watch:imagined"], emptyLinks), "untiered");
  assert.equal(assignTier([], extractLinks("A promising scientific breakthrough https://example.org/news")), "untiered");
});

test("link extraction normalizes identifiers, release tags, tracking and fragments", () => {
  const links = extractLinks("[paper](https://doi.org/10.1234/EXAMPLE) arXiv:2501.01234v3 https://arxiv.org/pdf/2501.01234v2.pdf https://github.com/Upstream/tool/releases/tag/v1%2Frc https://example.org/a?utm_source=fleet&ref=hub&b=2&a=1#part");
  assert.deepEqual(links.dois, ["10.1234/example"]);
  assert.deepEqual(links.arxiv_ids, ["2501.01234"]);
  assert.deepEqual(links.release_tags, ["Upstream/tool@v1/rc"]);
  assert.ok(links.urls.includes("https://example.org/a?a=1&b=2"));
  const keys = canonicalKeys(links);
  assert.ok(keys.includes("doi:10.1234/example"));
  assert.ok(keys.includes("arxiv:2501.01234"));
  assert.ok(keys.includes("Upstream/tool@v1/rc"));
  assert.ok(keys.includes("url:https://example.org/a?a=1&b=2"));
  assert.deepEqual(extractLinks("No links here"), emptyLinks);
  assert.deepEqual(extractLinks("https://doi.org/10.1234/test(foo)" ).dois, ["10.1234/test(foo)"]);
});

test("content hashes normalize CRLF and trailing whitespace with a fixed SHA-256 vector", () => {
  const expected = createHash("sha256").update("Title\nFirst\nSecond").digest("hex");
  assert.equal(contentHash("Title  ", "First \r\nSecond\t\r\n  "), expected);
  assert.equal(contentHash("Title", "First\nSecond"), expected);
  assert.notEqual(contentHash("Title", " First\nSecond"), expected);
});

test("records retain closed dates, sorted labels, milestone and author type", () => {
  const value = record({ state: "closed", closed_at: instant, user: { type: "Bot" }, milestone: { title: "Watch" }, labels: [{ name: "z" }, { name: "research-watch" }] });
  assert.equal(value.stable_key, "cordanaLLM/a#1");
  assert.deepEqual(value.labels, ["research-watch", "z"]);
  assert.equal(value.author_type, "Bot");
  assert.equal(value.milestone_title, "Watch");
  assert.equal(value.closed_at, instant);
  const { publicCatalog } = buildLeads([value]);
  assert.equal(publicCatalog.entries[0].origins[0].state, "closed");
  assert.equal(publicCatalog.entries[0].origins[0].closed_at, instant);
});

test("records reject every missing field, incorrect types and malformed stable keys", () => {
  const valid = record();
  for (const field of Object.keys(valid)) {
    const incomplete = { ...valid };
    delete incomplete[field];
    assert.throws(() => validateRecord(incomplete), new RegExp(field, "u"));
  }
  for (const key of ["repo#1", "org/repo#0", "org/repo#01", "org/repo name#1"]) {
    assert.throws(() => validateRecord({ ...valid, stable_key: key }), /stable_key/u);
  }
  assert.throws(() => validateRecord({ ...valid, labels: "research-watch" }), /labels/u);
  assert.throws(() => validateRecord({ ...valid, source_links: {} }), /source_links/u);
  assert.throws(() => validateRecord({ ...valid, author_type: "Organization" }), /author_type/u);
  assert.throws(() => validateRecord({ ...valid, fetched_at: "yesterday" }), /fetched_at/u);
});

test("cross-repository arXiv duplicates merge both origins into one entry", () => {
  const first = record();
  const second = record({ number: 2, node_id: "I_OTHER", title: "Another lead", html_url: "https://github.com/golusoris/b/issues/2", body: "arxiv:2501.01234" }, { full_name: "golusoris/b" });
  const { publicCatalog, privateCatalog } = buildLeads([second, first]);
  assert.equal(publicCatalog.schema_version, "1.0.0");
  assert.equal(publicCatalog.entries.length, 1);
  assert.equal(publicCatalog.entries[0].canonical_key, "arxiv:2501.01234");
  assert.deepEqual(publicCatalog.entries[0].origins.map((origin) => origin.stable_key), ["cordanaLLM/a#1", "golusoris/b#2"]);
  assert.equal(privateCatalog.entries.length, 0);
});

test("link bridges merge transitively, while plain prose stays untiered", () => {
  const a = record({ body: "https://example.org/a" });
  const b = record({ node_id: "I_B", number: 2, body: "https://example.org/b" });
  const bridge = record({ node_id: "I_BRIDGE", number: 3, body: "https://example.org/a https://example.org/b" });
  const prose = record({ node_id: "I_PROSE", number: 4, body: "Plain prose for human triage" });
  const { publicCatalog } = buildLeads([a, b, bridge, prose]);
  assert.equal(publicCatalog.entries.length, 2);
  assert.equal(publicCatalog.entries.find((entry) => entry.origins.length === 3).origins.length, 3);
  const proseEntry = publicCatalog.entries.find((entry) => entry.canonical_key === "issue:I_PROSE");
  assert.equal(proseEntry.origins[0].tier, "untiered");
});

test("node identity follows transfers and later updated_at wins", () => {
  const original = record({ updated_at: watermark });
  const renamed = record({ html_url: "https://github.com/golusoris/renamed/issues/1" }, { full_name: "golusoris/renamed" });
  const { publicCatalog } = buildLeads([renamed, original]);
  assert.equal(publicCatalog.entries[0].origins.length, 1);
  assert.equal(publicCatalog.entries[0].origins[0].stable_key, "golusoris/renamed#1");
});

test("private-only entries stay local; mixed public entries expose only a private count", () => {
  const hidden = privateRecord();
  const shared = privateRecord("https://arxiv.org/abs/2501.01234v1 https://private.invalid/hidden");
  shared.node_id = "I_SHARED_SECRET";
  shared.stable_key = "secret-org/hidden#2";
  shared.url = "https://github.com/secret-org/hidden/issues/2";
  shared.title = "Secret shared result";
  const { publicCatalog, privateCatalog } = buildLeads([record(), hidden, shared]);
  assert.equal(publicCatalog.entries.length, 1);
  assert.equal(publicCatalog.entries[0].private_origin_count, 1);
  assert.deepEqual(publicCatalog.entries[0].origins.map((origin) => origin.visibility), ["public"]);
  assert.equal(privateCatalog.entries.length, 2);
  assert.ok(privateCatalog.entries.every((entry) => entry.origins.every((origin) => origin.visibility === "private")));
  assertNoPrivateLeak(publicCatalog, [hidden, shared]);
  assert.ok(!JSON.stringify(publicCatalog).includes("private.invalid"));
});

test("PLANTED LEAK: private title, escaped title, identity and URL are refused anywhere", () => {
  const hidden = privateRecord();
  for (const field of ["title", "stable_key", "node_id", "url"]) {
    assert.throws(() => assertNoPrivateLeak({ entries: [{ arbitrary: hidden[field] }] }, [hidden]), new RegExp(field, "u"));
  }
  const escaped = { ...hidden, title: 'Secret "quoted"\nline' };
  assert.throws(() => assertNoPrivateLeak({ nested: { title: escaped.title } }, [escaped]), /title/u);
});

test("identical content across unlinked issues is flagged and never dropped", () => {
  const a = record({ body: "Same plain prose" });
  const b = record({ node_id: "I_DUPLICATE", number: 2, body: "Same plain prose" });
  const { publicCatalog } = buildLeads([a, b]);
  assert.equal(publicCatalog.entries.length, 2);
  assert.deepEqual(publicCatalog.entries[0].content_duplicate_of, ["cordanaLLM/a#1"]);
  assert.deepEqual(publicCatalog.entries[1].content_duplicate_of, ["cordanaLLM/a#2"]);
});

test("fixed input produces byte-identical JSON and does not mutate records", () => {
  const records = [record(), privateRecord(), record({ node_id: "I_PROSE", number: 2, body: "An unlinked lead" })];
  const before = JSON.stringify(records);
  const first = JSON.stringify(buildLeads(records), null, 2);
  assert.equal(first, JSON.stringify(buildLeads(records), null, 2));
  assert.equal(first, JSON.stringify(buildLeads([...records].reverse()), null, 2));
  assert.equal(JSON.stringify(records), before);
});

test("retry stops after three retries, using 2/4/8 second injected sleeps", async () => {
  const sleeps = [];
  let calls = 0;
  await assert.rejects(searchAll({ queries: ["fixture"], token: "stub", fetchImpl: async () => { calls += 1; return response({}, 503); }, sleep: async (ms) => sleeps.push(ms) }), (error) => /HTTP 503/u.test(errorChain(error)));
  assert.equal(calls, 4);
  assert.deepEqual(sleeps, [2000, 4000, 8000]);
});

test("403 and 429 recover; rate-limit reset is honoured and bounded at 300 seconds", async () => {
  for (const status of [403, 429]) {
    const sleeps = [];
    let calls = 0;
    const result = await searchAll({ queries: ["fixture"], fetchImpl: async () => ++calls === 1 ? response({}, status, { "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 60) }) : searchResponse(), sleep: async (ms) => sleeps.push(ms) });
    assert.equal(result.capped, false);
    assert.equal(calls, 2);
    assert.ok(sleeps[0] >= 58_000 && sleeps[0] <= 60_000);
  }
  let sleeps = 0;
  await assert.rejects(searchAll({ queries: ["fixture"], fetchImpl: async () => response({}, 429, { "x-ratelimit-reset": String(Math.ceil(Date.now() / 1000) + 301) }), sleep: async () => { sleeps += 1; } }), (error) => /300 seconds/u.test(errorChain(error)));
  assert.equal(sleeps, 0);
});

test("non-retryable HTTP errors and incomplete results fail closed", async () => {
  let calls = 0;
  await assert.rejects(searchAll({ queries: ["fixture"], fetchImpl: async () => { calls += 1; return response({}, 422); } }), (error) => /422/u.test(errorChain(error)));
  assert.equal(calls, 1);
  await assert.rejects(searchAll({ queries: ["fixture"], fetchImpl: async () => response({ items: [], total_count: 0, incomplete_results: true }) }), /incomplete_results/u);
});

test("search paginates, skips pull requests and reports the 1,000-result cap", async () => {
  const calls = [];
  const result = await searchAll({ queries: ["is:issue label:research-watch"], perPage: 1, maxPages: 2, fetchImpl: async (input, options) => {
    const url = new URL(input);
    calls.push(url);
    assert.equal(url.origin + url.pathname, "https://api.github.com/search/issues");
    assert.equal(url.searchParams.get("q"), "is:issue label:research-watch");
    assert.ok(options.signal instanceof AbortSignal);
    return searchResponse([calls.length === 1 ? issue() : issue({ pull_request: {} })], 1001);
  } });
  assert.equal(result.capped, true);
  assert.equal(result.issues.length, 1);
  assert.deepEqual(calls.map((url) => url.searchParams.get("page")), ["1", "2"]);
});

test("the 26th search request is refused, including retries in the budget", async () => {
  let calls = 0;
  await assert.rejects(searchAll({ queries: ["one", "two", "three"], perPage: 1, fetchImpl: async () => { calls += 1; return searchResponse([issue()], 1001); } }), /maximum 25/u);
  assert.equal(calls, 25);
  calls = 0;
  await assert.rejects(searchAll({ queries: Array(25).fill("fixture"), fetchImpl: async () => { calls += 1; return calls === 1 ? response({}, 503) : searchResponse(); }, sleep: async () => {} }), /maximum 25/u);
  assert.equal(calls, 25);
});

test("repository fallback lists all states with label/since filters and refuses truncation", async () => {
  const issues = await listRepoIssues({ owner: "cordanaLLM", repo: "a", watermark, fetchImpl: async (input) => {
    const url = new URL(input);
    assert.equal(url.pathname, "/repos/cordanaLLM/a/issues");
    assert.equal(url.searchParams.get("state"), "all");
    assert.equal(url.searchParams.get("labels"), "research-watch");
    assert.equal(url.searchParams.get("since"), watermark);
    assert.equal(url.searchParams.get("per_page"), "100");
    return response([issue({ state: "closed", closed_at: instant }), issue({ pull_request: {} })]);
  } });
  assert.equal(issues.length, 1);
  assert.equal(issues[0].closed_at, instant);
  await assert.rejects(listRepoIssues({ owner: "x", repo: "a", maxPages: 1, fetchImpl: async () => response(Array(100).fill(issue())) }), /page bound/u);
});

test("CLI missing token exits 2 before any fetch or file write", async () => {
  const result = await runCli({ env: {}, root: "/does-not-exist", fetchImpl: () => assert.fail("network forbidden") });
  assert.equal(result.exitCode, 2);
  assert.match(result.message, /GH_TOKEN.*GITHUB_TOKEN/u);
});

test("CLI reports invalid argument field diagnostics with exit 1", () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("./research-watch-ingest.mjs", import.meta.url)), "--unknown"], {
    env: { ...process.env, GH_TOKEN: "fixture-token" }, encoding: "utf8", timeout: 5000,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Invalid CLI arguments\./u);
  assert.doesNotMatch(result.stderr, /fixture-token/u);
});

test("CLI advances the watermark to run start and uses it in the next search", async (t) => {
  const options = await fixture(t);
  const queries = [];
  options.fetchImpl = transport({ "/search/issues": (url) => {
    queries.push(url.searchParams.get("q"));
    return searchResponse([issue()]);
  } });
  const watermarkPath = path.join(options.root, "research/ingest/.watermark");
  await writeFile(watermarkPath, `${watermark}\n`);
  assert.equal((await runCli(options)).exitCode, 0);
  assert.equal(await readFile(watermarkPath, "utf8"), `${options.fetchedAt}\n`);
  const secondStart = "2026-10-15T13:00:00Z";
  assert.equal((await runCli({ ...options, fetchedAt: secondStart })).exitCode, 0);
  assert.deepEqual(queries, [
    `is:issue label:research-watch org:cordanaLLM updated:>=${watermark}`,
    `is:issue label:research-watch org:cordanaLLM updated:>=${options.fetchedAt}`,
  ]);
  assert.equal(await readFile(watermarkPath, "utf8"), `${secondStart}\n`);
  const catalog = JSON.parse(await readFile(path.join(options.root, "research/ingest/leads.json"), "utf8"));
  assert.equal(catalog.entries[0].origins.length, 1);
});

test("CLI retains the previous watermark on catalog building failures", async (t) => {
  for (const failure of ["leak", "HTTP 500"]) {
    await t.test(failure, async (t) => {
      const options = await fixture(t);
      const watermarkPath = path.join(options.root, "research/ingest/.watermark");
      await writeFile(watermarkPath, `${watermark}\n`);
      let calls = 0;
      const secret = issue({ node_id: "I_PRIVATE", repository_url: "https://api.github.com/repos/secret/hidden", html_url: "https://github.com/secret/hidden/issues/1" });
      options.fetchImpl = transport({
        "/search/issues": () => {
          calls += 1;
          return failure === "leak" ? searchResponse([issue(), secret]) : response({}, 500);
        },
        "/repos/secret/hidden": () => response({ full_name: "secret/hidden", visibility: "private" }),
      });
      await assert.rejects(runCli({ ...options, sleep: async () => {} }), failure === "leak" ? /Private origin leak/u : /GitHub read failed/u);
      assert.equal(calls, failure === "leak" ? 1 : 4);
      assert.equal(await readFile(watermarkPath, "utf8"), `${watermark}\n`);
      assert.deepEqual((await readdir(path.dirname(watermarkPath))).sort(), [".watermark", "owners.json"]);
    });
  }
});

test("CLI fails visibly after publication when the watermark cannot be advanced", async (t) => {
  for (const failure of ["symlink", "rename"]) {
    await t.test(failure, async (t) => {
      const options = await fixture(t);
      const watermarkPath = path.join(options.root, "research/ingest/.watermark");
      const target = path.join(options.root, "retained-watermark");
      await writeFile(target, `${watermark}\n`);
      options.fetchImpl = transport({ "/search/issues": async () => {
        if (failure === "symlink") await symlink(target, watermarkPath);
        else await mkdir(watermarkPath);
        return searchResponse([issue()]);
      } });
      const result = await runCli(options);
      assert.equal(result.exitCode, 1);
      assert.match(result.message, /catalogs written, watermark not advanced/u);
      const catalog = JSON.parse(await readFile(path.join(options.root, "research/ingest/leads.json"), "utf8"));
      assert.equal(catalog.entries[0].origins[0].node_id, "I_PUBLIC_FIRST");
      assert.equal(await readFile(target, "utf8"), `${watermark}\n`);
      assert.ok((await readdir(path.dirname(watermarkPath))).every((file) => !file.endsWith(".tmp")));
    });
  }
});

test("CLI writes atomically, caches visibility, and check mode is non-mutating", async (t) => {
  const options = await fixture(t);
  let metadataCalls = 0;
  options.fetchImpl = transport({
    "/search/issues": () => searchResponse([issue(), issue({ number: 2, node_id: "I_SECOND", body: "Plain prose" })]),
    "/repos/cordanaLLM/a": () => { metadataCalls += 1; return response({ full_name: "cordanaLLM/a", visibility: "public" }); },
  });
  const publicPath = path.join(options.root, "research/ingest/leads.json");
  const privatePath = path.join(options.root, ".workingdir/ingest/private-leads.json");
  assert.equal((await runCli({ ...options, args: ["--check"] })).exitCode, 1);
  assert.deepEqual(await readdir(path.dirname(publicPath)), ["owners.json"]);
  assert.equal((await runCli(options)).exitCode, 0);
  assert.equal(metadataCalls, 2);
  const before = await readFile(publicPath, "utf8");
  const hiddenBefore = await readFile(privatePath, "utf8");
  const watermarkPath = path.join(options.root, "research/ingest/.watermark");
  const watermarkBefore = await readFile(watermarkPath, "utf8");
  options.fetchImpl = transport({ "/search/issues": () => searchResponse() });
  const checkOptions = { ...options, fetchedAt: "2026-10-15T14:00:00Z", args: ["--check"] };
  assert.equal((await runCli(checkOptions)).exitCode, 0);
  assert.equal(await readFile(publicPath, "utf8"), before);
  assert.equal(await readFile(privatePath, "utf8"), hiddenBefore);
  assert.equal(await readFile(watermarkPath, "utf8"), watermarkBefore);
  options.fetchImpl = transport({ "/search/issues": () => searchResponse([issue({ title: "Changed title", updated_at: "2026-10-15T13:00:00Z" })]) });
  assert.equal((await runCli({ ...checkOptions, fetchImpl: options.fetchImpl })).exitCode, 1);
  assert.equal(await readFile(publicPath, "utf8"), before);
  assert.equal(await readFile(watermarkPath, "utf8"), watermarkBefore);
});

test("incremental CLI preserves previous closed records and rechecks private visibility", async (t) => {
  const options = await fixture(t);
  options.fetchImpl = transport({ "/search/issues": () => searchResponse([issue({ state: "closed", closed_at: instant })]) });
  await runCli(options);
  options.fetchImpl = transport({ "/search/issues": () => searchResponse(), "/repos/cordanaLLM/a": () => response({ full_name: "cordanaLLM/a", visibility: "private" }) });
  await runCli({ ...options, args: ["--watermark", instant] });
  const publicCatalog = JSON.parse(await readFile(path.join(options.root, "research/ingest/leads.json"), "utf8"));
  const privateCatalog = JSON.parse(await readFile(path.join(options.root, ".workingdir/ingest/private-leads.json"), "utf8"));
  assert.equal(publicCatalog.entries.length, 0);
  assert.equal(privateCatalog.entries[0].origins[0].closed_at, instant);
  assert.equal(privateCatalog.entries[0].origins[0].visibility, "private");
});

test("CLI cap fallback discovers repositories absent from search results", async (t) => {
  const options = await fixture(t);
  const absent = issue({ node_id: "I_ABSENT", repository_url: "https://api.github.com/repos/cordanaLLM/absent", html_url: "https://github.com/cordanaLLM/absent/issues/1" });
  options.fetchImpl = transport({
    "/search/issues": () => searchResponse([issue()], 1001),
    "/user/repos": () => response([{ full_name: "cordanaLLM/a" }]),
    "/orgs/cordanaLLM/repos": () => response([{ full_name: "cordanaLLM/absent" }]),
    "/repos/cordanaLLM/a/issues": () => response([issue()]),
    "/repos/cordanaLLM/absent/issues": () => response([absent]),
    "/repos/cordanaLLM/absent": () => response({ full_name: "cordanaLLM/absent", visibility: "public" }),
  });
  assert.equal((await runCli(options)).exitCode, 0);
  const catalog = JSON.parse(await readFile(path.join(options.root, "research/ingest/leads.json"), "utf8"));
  assert.deepEqual(catalog.entries[0].origins.map((origin) => origin.node_id), ["I_PUBLIC_FIRST", "I_ABSENT"]);
});

test("CLI rejects private path escapes, symlinks, malformed records and leaks without replacing files", async (t) => {
  const options = await fixture(t);
  await runCli(options);
  const publicPath = path.join(options.root, "research/ingest/leads.json");
  const privatePath = path.join(options.root, ".workingdir/ingest/private-leads.json");
  const before = await readFile(publicPath, "utf8");
  const privateBefore = await readFile(privatePath, "utf8");
  await assert.rejects(runCli({ ...options, args: ["--private-out", "research/ingest/private.json"] }), /private-out/u);
  options.fetchImpl = transport({ "/search/issues": () => searchResponse([issue({ node_id: null })]) });
  await assert.rejects(runCli(options), /node_id/u);
  const secret = issue({ node_id: "I_PRIVATE_SAME_TITLE", repository_url: "https://api.github.com/repos/secret/hidden", html_url: "https://github.com/secret/hidden/issues/1" });
  options.fetchImpl = transport({ "/search/issues": () => searchResponse([issue(), secret]), "/repos/secret/hidden": () => response({ full_name: "secret/hidden", visibility: "private" }) });
  await assert.rejects(runCli(options), /Private origin leak/u);
  assert.equal(await readFile(publicPath, "utf8"), before);
  assert.equal(await readFile(privatePath, "utf8"), privateBefore);
  await symlink(path.join(options.root, "research"), path.join(options.root, ".workingdir/escape"));
  await assert.rejects(runCli({ ...options, args: ["--private-out", ".workingdir/escape/secret.json"] }), /Unsafe ingest output/u);
});

test("content duplicates remain flagged even when external links merge the entry", () => {
  const a = record();
  const b = record({ node_id: "I_LINKED_DUPLICATE", number: 2 });
  const { publicCatalog } = buildLeads([a, b]);
  assert.equal(publicCatalog.entries.length, 1);
  assert.equal(publicCatalog.entries[0].origins.length, 2);
  assert.deepEqual(publicCatalog.entries[0].content_duplicate_of, ["cordanaLLM/a#1", "cordanaLLM/a#2"]);
});

test("a staging/replacement failure retains both previous catalogs and cleans temporary files", async (t) => {
  const options = await fixture(t);
  await runCli(options);
  const publicPath = path.join(options.root, "research/ingest/leads.json");
  const privatePath = path.join(options.root, ".workingdir/ingest/private-leads.json");
  const before = await readFile(publicPath, "utf8");
  const privateBefore = await readFile(privatePath, "utf8");
  await mkdir(path.join(options.root, "research/ingest/occupied"));
  await assert.rejects(runCli({ ...options, args: ["--out", "research/ingest/occupied"] }));
  assert.equal(await readFile(publicPath, "utf8"), before);
  assert.equal(await readFile(privatePath, "utf8"), privateBefore);
  assert.ok((await readdir(path.dirname(publicPath))).every((file) => !file.endsWith(".tmp")));
  assert.ok((await readdir(path.dirname(privatePath))).every((file) => !file.endsWith(".tmp")));
});

test("26 separate queries also stop before dispatching a 26th search request", async () => {
  let calls = 0;
  await assert.rejects(searchAll({ queries: Array(26).fill("fixture"), fetchImpl: async () => { calls += 1; return searchResponse(); } }), /maximum 25/u);
  assert.equal(calls, 25);
});

test("successful CLI runs append metrics; check mode leaves the run log untouched", async (t) => {
  const options = await fixture(t);
  await runCli(options);
  const logPath = path.join(options.root, "research/ingest/runs.jsonl");
  const before = await readFile(logPath, "utf8");
  const metrics = JSON.parse(before);
  assert.equal(metrics.timestamp, instant);
  assert.equal(metrics.issues_inspected, 1);
  assert.equal(metrics.leads_count, 1);
  assert.equal(metrics.dedupe_count, 0);
  assert.deepEqual(metrics.errors, []);
  await runCli({ ...options, args: ["--check"] });
  assert.equal(await readFile(logPath, "utf8"), before);
  await runCli(options);
  assert.equal((await readFile(logPath, "utf8")).trim().split("\n").length, 2);
  await assert.rejects(runCli({ ...options, args: ["--out", "research/ingest/owners.json"] }), /ingest inputs/u);
});

test("HTTP response size is bounded and invalid JSON retains its cause", async () => {
  await assert.rejects(searchAll({ queries: ["fixture"], fetchImpl: async () => new Response("x".repeat(16 * 1024 * 1024 + 1)) }), (error) => /response size/u.test(errorChain(error)));
  await assert.rejects(searchAll({ queries: ["fixture"], fetchImpl: async () => new Response('{"items":[],"items":[]}') }), (error) => /repeats name/u.test(errorChain(error)));
});
