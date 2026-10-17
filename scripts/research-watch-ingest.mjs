import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

import { replaceFilePair } from "./lib/atomic-file-pair.mjs";
import { readStableOpenedFile } from "./lib/opened-file.mjs";
import { parseStrictJson } from "./lib/strict-json.mjs";

const schemaVersion = "1.0.0";
const maximumRecords = 100_000;
const maximumText = 1_048_576;
const maximumFileBytes = 128 * 1024 * 1024;
const tiers = ["news", "paper", "release", "followed"];
const linkFields = ["urls", "dois", "arxiv_ids", "release_tags"];
const recordFields = [
  "stable_key", "node_id", "title", "url", "state", "visibility", "labels",
  "milestone_title", "created_at", "updated_at", "closed_at", "author_type",
  "tier", "source_links", "content_hash", "fetched_at", "watermark",
];
const defaultRoot = fileURLToPath(new URL("../", import.meta.url));

function requireValue(condition, field) {
  if (!condition) throw new Error(`Invalid ${field}`);
}

function boundedArray(value, field, maximum = maximumRecords) {
  requireValue(Array.isArray(value) && value.length <= maximum, field);
}

function textValue(value, field) {
  requireValue(typeof value === "string" && value.length <= maximumText, field);
}

function compareText(left, right) {
  return left < right ? -1 : Number(left > right);
}

function sortedUnique(values) {
  return [...new Set(values)].sort(compareText);
}

export function loadOwners(text) {
  const value = parseStrictJson(text, { label: "owners.json" });
  requireValue(value?.schema_version === schemaVersion, "owners.schema_version");
  requireValue(Object.keys(value).length === 2, "owners fields");
  boundedArray(value.owners, "owners", 125);
  requireValue(value.owners.length > 0, "owners: empty list");
  const seen = new Set();
  return value.owners.map((owner) => {
    requireValue(["org", "user"].includes(owner?.kind), "owners.kind");
    requireValue(Object.keys(owner).length === 2, "owners entry fields");
    requireValue(typeof owner.login === "string" && /^[a-z0-9][a-z0-9-]{0,38}$/iu.test(owner.login), "owners.login");
    const key = owner.login.toLowerCase();
    requireValue(!seen.has(key), "owners: duplicate login");
    seen.add(key);
    return { kind: owner.kind, login: owner.login };
  });
}

export function buildSearchQueries(owners, watermark) {
  boundedArray(owners, "owners", 125);
  const queries = [];
  for (let index = 0; index < owners.length; index += 5) {
    const qualifiers = owners.slice(index, index + 5).map(({ kind, login }) => `${kind}:${login}`);
    queries.push(["is:issue label:research-watch", ...qualifiers, watermark && `updated:>=${watermark}`].filter(Boolean).join(" "));
  }
  return queries;
}

function normalizedUrl(raw) {
  const url = new URL(raw);
  const keys = [...url.searchParams.keys()];
  for (const key of keys) {
    if (/^utm_/iu.test(key) || key.toLowerCase() === "ref") url.searchParams.delete(key);
  }
  url.hash = "";
  url.searchParams.sort();
  return url.href;
}

function trimLink(value) {
  let result = value.replace(/[.,;:!?]+$/u, "");
  // Markdown's closing delimiter is not part of a URL; balanced DOI parentheses are.
  for (let index = 0; index < value.length && result.endsWith(")"); index += 1) {
    if ((result.match(/\)/gu) ?? []).length <= (result.match(/\(/gu) ?? []).length) break;
    result = result.slice(0, -1);
  }
  return result;
}

export function extractLinks(body) {
  textValue(body, "body");
  const urls = sortedUnique((body.match(/https?:\/\/[^\s<>"[\]]+/giu) ?? []).map(trimLink).map(normalizedUrl));
  const dois = sortedUnique((body.match(/\b10\.\d{4,9}\/[-._;()/:a-z0-9]+/giu) ?? []).map(trimLink).map((doi) => doi.toLowerCase()));
  const arxiv = /(?:arxiv\s*:\s*|https?:\/\/(?:www\.)?arxiv\.org\/(?:abs|pdf)\/)(\d{4}\.\d{4,5})(?:v\d+)?\b/giu;
  const arxivIds = [...body.matchAll(arxiv)].map((match) => match[1]);
  const releaseTags = urls.flatMap((url) => {
    const parsed = new URL(url);
    const match = /^\/([^/]+)\/([^/]+)\/releases\/tag\/(.+)$/u.exec(parsed.pathname);
    if (parsed.hostname !== "github.com" || !match) return [];
    return [`${match[1]}/${match[2]}@${decodeURIComponent(match[3])}`];
  });
  return { urls, dois, arxiv_ids: sortedUnique(arxivIds), release_tags: sortedUnique(releaseTags) };
}

export function assignTier(labels, links) {
  const selected = tiers.filter((tier) => labels.includes(`research-watch:${tier}`));
  if (selected.length === 1) return selected[0];
  if (selected.length > 1) return "untiered";
  if (links.dois.length > 0 || links.arxiv_ids.length > 0) return "paper";
  return links.release_tags.length > 0 ? "release" : "untiered";
}

export function contentHash(title, body) {
  textValue(title, "title");
  textValue(body, "body");
  const content = `${title}\n${body}`.replace(/\r\n/gu, "\n")
    .split("\n").map((line) => line.trimEnd()).join("\n").trimEnd();
  return createHash("sha256").update(content).digest("hex");
}

export function canonicalKeys(links) {
  return sortedUnique([
    ...links.dois.map((doi) => `doi:${doi.toLowerCase()}`),
    ...links.arxiv_ids.map((id) => `arxiv:${id.replace(/v\d+$/u, "")}`),
    ...links.release_tags,
    ...links.urls.map((url) => `url:${normalizedUrl(url)}`),
  ]);
}

export function normalizeIssue(apiIssue, repoMeta, fetchedAt, watermark) {
  requireValue(repoMeta.visibility !== undefined || typeof repoMeta.private === "boolean", "repository.visibility");
  const labels = sortedUnique(apiIssue.labels.map((label) => typeof label === "string" ? label : label.name));
  const links = extractLinks(apiIssue.body ?? "");
  const record = {
    stable_key: `${repoMeta.full_name}#${apiIssue.number}`,
    node_id: apiIssue.node_id,
    title: apiIssue.title,
    url: apiIssue.html_url,
    state: apiIssue.state,
    visibility: repoMeta.visibility ?? (repoMeta.private ? "private" : "public"),
    labels,
    milestone_title: apiIssue.milestone?.title ?? null,
    created_at: apiIssue.created_at,
    updated_at: apiIssue.updated_at,
    closed_at: apiIssue.closed_at,
    author_type: apiIssue.user?.type,
    tier: assignTier(labels, links),
    source_links: links,
    content_hash: contentHash(apiIssue.title, apiIssue.body ?? ""),
    fetched_at: fetchedAt,
    watermark: watermark ?? "",
  };
  validateRecord(record);
  return record;
}

function validateDate(value, field) {
  requireValue(typeof value === "string" && /^\d{4}-\d\d-\d\dT/u.test(value) && Number.isFinite(Date.parse(value)), field);
}

export function validateRecord(record) {
  requireValue(record !== null && typeof record === "object", "record");
  for (const field of recordFields) requireValue(Object.hasOwn(record, field), field);
  requireValue(Object.keys(record).length === recordFields.length, "record fields");
  for (const field of ["stable_key", "node_id", "title", "url", "content_hash", "watermark"]) textValue(record[field], field);
  requireValue(/^[^/\s]+\/[^#\s]+#[1-9][0-9]*$/u.test(record.stable_key), "stable_key");
  requireValue(record.node_id.length > 0, "node_id");
  requireValue(/^https:\/\/github\.com\/[^/]+\/[^/]+\/issues\/[1-9][0-9]*$/u.test(record.url), "url");
  requireValue(["open", "closed"].includes(record.state), "state");
  requireValue(["public", "private", "internal"].includes(record.visibility), "visibility");
  requireValue(["User", "Bot"].includes(record.author_type), "author_type");
  requireValue([...tiers, "untiered"].includes(record.tier), "tier");
  requireValue(/^[a-f0-9]{64}$/u.test(record.content_hash), "content_hash");
  boundedArray(record.labels, "labels", 1000);
  record.labels.forEach((label) => textValue(label, "labels"));
  for (const field of ["created_at", "updated_at", "fetched_at"]) validateDate(record[field], field);
  if (record.closed_at !== null) validateDate(record.closed_at, "closed_at");
  if (record.milestone_title !== null) textValue(record.milestone_title, "milestone_title");
  if (record.watermark !== "") validateDate(record.watermark, "watermark");
  validateLinks(record.source_links);
  return record;
}

function validateLinks(links) {
  requireValue(links !== null && typeof links === "object", "source_links");
  requireValue(Object.keys(links).length === linkFields.length, "source_links fields");
  for (const field of linkFields) {
    boundedArray(links[field], `source_links.${field}`, 10_000);
    links[field].forEach((value) => textValue(value, `source_links.${field}`));
  }
}

function latestRecords(records) {
  boundedArray(records, "records");
  const byId = new Map();
  for (const record of records) {
    validateRecord(record);
    const previous = byId.get(record.node_id);
    if (!previous || Date.parse(record.updated_at) >= Date.parse(previous.updated_at)) byId.set(record.node_id, record);
  }
  return [...byId.values()].sort((a, b) => compareText(a.stable_key, b.stable_key));
}

function recordKeys(record) {
  const keys = canonicalKeys(record.source_links);
  return keys.length > 0 ? keys : [`issue:${record.node_id}`];
}

function groupRecords(records) {
  const byKey = new Map();
  const groups = new Set();
  for (const record of records) {
    const keys = recordKeys(record);
    const matches = new Set(keys.map((key) => byKey.get(key)).filter(Boolean));
    const group = { keys: new Set(keys), origins: [record] };
    for (const match of matches) {
      match.keys.forEach((key) => group.keys.add(key));
      group.origins.push(...match.origins);
      groups.delete(match);
    }
    group.keys.forEach((key) => byKey.set(key, group));
    groups.add(group);
  }
  return [...groups];
}

function catalogEntry(origins, privateCount) {
  return {
    canonical_key: sortedUnique(origins.flatMap(recordKeys))[0],
    origins: [...origins].sort((a, b) => compareText(a.stable_key, b.stable_key)),
    private_origin_count: privateCount,
    content_duplicate_of: [],
  };
}

function finishCatalog(entries) {
  entries.sort((a, b) => compareText(a.canonical_key, b.canonical_key) || compareText(a.origins[0].stable_key, b.origins[0].stable_key));
  const hashes = new Map();
  for (const entry of entries) {
    for (const origin of entry.origins) {
      if (!hashes.has(origin.content_hash)) hashes.set(origin.content_hash, []);
      hashes.get(origin.content_hash).push(origin.stable_key);
    }
  }
  for (const entry of entries) {
    entry.content_duplicate_of = sortedUnique(entry.origins.flatMap((origin) => (
      hashes.get(origin.content_hash).filter((key) => key !== origin.stable_key)
    )));
  }
  return { schema_version: schemaVersion, entries };
}

export function buildLeads(records) {
  const publicEntries = [];
  const privateEntries = [];
  for (const group of groupRecords(latestRecords(records))) {
    const publicOrigins = group.origins.filter((record) => record.visibility === "public");
    const privateOrigins = group.origins.filter((record) => record.visibility !== "public");
    if (publicOrigins.length > 0) publicEntries.push(catalogEntry(publicOrigins, privateOrigins.length));
    if (privateOrigins.length > 0) privateEntries.push(catalogEntry(privateOrigins, privateOrigins.length));
  }
  return { publicCatalog: finishCatalog(publicEntries), privateCatalog: finishCatalog(privateEntries) };
}

export function assertNoPrivateLeak(publicCatalog, privateRecords) {
  const serialized = JSON.stringify(publicCatalog);
  boundedArray(privateRecords, "privateRecords");
  for (const record of privateRecords) {
    for (const field of ["stable_key", "node_id", "title", "url"]) {
      const value = record[field];
      requireValue(typeof value === "string" && value.length > 0, `private ${field}`);
      if (serialized.includes(value) || serialized.includes(JSON.stringify(value).slice(1, -1))) {
        throw new Error(`Private origin leak in public catalog: ${field}`);
      }
    }
  }
}

function integerOption(value, maximum, field) {
  requireValue(Number.isSafeInteger(value) && value >= 1 && value <= maximum, field);
}

function requestOptions(options) {
  const result = { fetchImpl: fetch, maxRetries: 3, timeoutMs: 15_000, sleep: delay, ...options };
  requireValue(Number.isSafeInteger(result.maxRetries) && result.maxRetries >= 0 && result.maxRetries <= 3, "maxRetries");
  integerOption(result.timeoutMs, 15_000, "timeoutMs");
  return result;
}

function retryWait(response, attempt) {
  const reset = response.headers.get("x-ratelimit-reset");
  const backoff = 2000 * (2 ** attempt);
  if (!reset || ![403, 429].includes(response.status)) return backoff;
  const milliseconds = Math.max(0, Number(reset) * 1000 - Date.now());
  requireValue(Number.isFinite(milliseconds) && milliseconds <= 300_000, "x-ratelimit-reset: exceeds 300 seconds");
  return Math.max(backoff, milliseconds);
}

async function responseJson(response) {
  const maximumBytes = 16 * 1024 * 1024;
  // Small injected fetch adapters may expose json() alone; native fetch streams are bounded below.
  if (!response.body?.getReader) {
    const value = await response.json();
    requireValue(Buffer.byteLength(JSON.stringify(value)) <= maximumBytes, "GitHub response size");
    return value;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    for (let chunk = 0; chunk < 16_384; chunk += 1) {
      const { value, done } = await reader.read();
      if (done) return parseStrictJson(Buffer.concat(chunks), { label: "GitHub JSON response" });
      bytes += value.byteLength;
      requireValue(bytes <= maximumBytes, "GitHub response size");
      chunks.push(Buffer.from(value));
    }
    throw new Error("GitHub response chunk bound exhausted");
  } finally {
    await reader.cancel();
  }
}

async function requestJson(url, options, searchBudget) {
  for (let attempt = 0; attempt <= options.maxRetries; attempt += 1) {
    if (searchBudget) {
      requireValue(searchBudget.count < 25, "search request budget: maximum 25");
      searchBudget.count += 1;
    }
    try {
      const response = await options.fetchImpl(url.href, {
        method: "GET",
        headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${options.token}`, "X-GitHub-Api-Version": "2026-03-10" },
        redirect: "error",
        signal: AbortSignal.timeout(options.timeoutMs),
      });
      if (response.ok) return await responseJson(response);
      const retryable = [403, 429].includes(response.status) || (response.status >= 500 && response.status < 600);
      await response.body?.cancel();
      requireValue(retryable && attempt < options.maxRetries, `GitHub response HTTP ${response.status}; retries exhausted or not retryable`);
      await options.sleep(retryWait(response, attempt));
    } catch (cause) {
      throw new Error("GitHub read failed", { cause });
    }
  }
  throw new Error("GitHub retry bound exhausted");
}

export async function searchAll({ queries, maxPages = 10, perPage = 100, ...input }) {
  boundedArray(queries, "queries", 1000);
  integerOption(maxPages, 10, "maxPages");
  integerOption(perPage, 100, "perPage");
  const options = requestOptions(input);
  const budget = { count: 0 };
  const issues = [];
  let capped = false;
  for (const query of queries) {
    for (let page = 1; page <= maxPages; page += 1) {
      const url = new URL("https://api.github.com/search/issues");
      url.search = new URLSearchParams({ q: query, per_page: String(perPage), page: String(page) });
      const data = await requestJson(url, options, budget);
      boundedArray(data.items, "search.items", perPage);
      requireValue(Number.isSafeInteger(data.total_count) && data.total_count >= 0, "search.total_count");
      requireValue(!data.incomplete_results, "search.incomplete_results");
      issues.push(...data.items.filter((issue) => !issue.pull_request));
      capped ||= data.total_count >= 1000 || data.total_count > maxPages * perPage;
      if (page * perPage >= Math.min(data.total_count, 1000) || data.items.length < perPage) break;
    }
  }
  return { issues, capped };
}

async function listPages(url, options, maxPages) {
  const items = [];
  for (let page = 1; page <= maxPages; page += 1) {
    url.searchParams.set("page", String(page));
    const data = await requestJson(url, options);
    boundedArray(data, "listing page", 100);
    items.push(...data);
    requireValue(items.length <= maximumRecords, "listing record limit");
    if (data.length < 100) return items;
  }
  throw new Error("Repository listing page bound exhausted; previous catalogs retained");
}

export async function listRepoIssues({ owner, repo, watermark, maxPages = 50, ...input }) {
  integerOption(maxPages, 50, "maxPages");
  requireValue(/^[a-z0-9-]+$/iu.test(owner) && /^[a-z0-9._-]+$/iu.test(repo), "repository name");
  const url = new URL(`https://api.github.com/repos/${owner}/${repo}/issues`);
  url.search = new URLSearchParams({ state: "all", labels: "research-watch", per_page: "100" });
  if (watermark) url.searchParams.set("since", watermark);
  const issues = await listPages(url, requestOptions(input), maxPages);
  return issues.filter((issue) => !issue.pull_request);
}

async function discoverRepositories(owners, options) {
  const repositories = new Map();
  // /user/repos supplies accessible private user repositories absent from /users/{login}/repos.
  const endpoints = ["/user/repos?affiliation=owner,collaborator,organization_member"];
  for (const owner of owners) endpoints.push(`/${owner.kind === "org" ? "orgs" : "users"}/${owner.login}/repos?type=all`);
  const logins = new Set(owners.map((owner) => owner.login.toLowerCase()));
  for (const endpoint of endpoints) {
    const url = new URL(`https://api.github.com${endpoint}&per_page=100`);
    const repos = await listPages(url, options, 50);
    for (const repo of repos) {
      requireValue(typeof repo.full_name === "string", "repository.full_name");
      if (logins.has(repo.full_name.split("/")[0].toLowerCase())) repositories.set(repo.full_name, repo);
    }
  }
  requireValue(repositories.size <= 5000, "repository inventory limit");
  return [...repositories.keys()].sort(compareText);
}

function issueRepository(issue) {
  const match = /^https:\/\/api\.github\.com\/repos\/([^/]+\/[^/]+)$/u.exec(issue.repository_url);
  requireValue(match, "issue.repository_url");
  return match[1];
}

async function collectIssues(owners, watermark, options) {
  const search = await searchAll({ queries: buildSearchQueries(owners, watermark), ...options });
  if (!search.capped) return search.issues;
  const issues = [];
  for (const fullName of await discoverRepositories(owners, options)) {
    const [owner, repo] = fullName.split("/");
    issues.push(...await listRepoIssues({ owner, repo, watermark, ...options }));
    requireValue(issues.length <= maximumRecords, "issue inventory limit");
  }
  return issues;
}

async function normalizeAll(issues, previous, fetchedAt, watermark, options) {
  boundedArray(issues, "issues");
  const metadata = new Map();
  const records = [];
  // Recheck retained origins too: a formerly public repository may now be private.
  const repositories = sortedUnique([...issues.map(issueRepository), ...previous.map((record) => record.stable_key.split("#")[0])]);
  requireValue(repositories.length <= 5000, "repository metadata limit");
  for (const fullName of repositories) {
    const meta = await requestJson(new URL(`https://api.github.com/repos/${fullName}`), options);
    requireValue(typeof meta.full_name === "string", "repository.full_name");
    requireValue(["public", "private", "internal"].includes(meta.visibility), "repository.visibility");
    metadata.set(fullName, meta);
  }
  for (const record of previous) {
    const meta = metadata.get(record.stable_key.split("#")[0]);
    records.push({ ...record, stable_key: `${meta.full_name}#${record.stable_key.split("#")[1]}`, visibility: meta.visibility });
  }
  for (const issue of issues) records.push(normalizeIssue(issue, metadata.get(issueRepository(issue)), fetchedAt, watermark));
  return records;
}

async function readOptional(file) {
  try {
    const data = await readStableOpenedFile(file, { label: "ingest artifact", maximumBytes: maximumFileBytes });
    requireValue(data.length <= maximumFileBytes, "catalog file size");
    return data.toString("utf8");
  } catch (cause) {
    if (cause.code === "ENOENT") return undefined;
    throw new Error("Cannot read ingest artifact", { cause });
  }
}

function catalogRecords(text) {
  if (text === undefined) return [];
  const catalog = parseStrictJson(text, { label: "leads catalog" });
  requireValue(catalog.schema_version === schemaVersion, "catalog.schema_version");
  boundedArray(catalog.entries, "catalog.entries");
  return catalog.entries.flatMap((entry) => {
    boundedArray(entry.origins, "catalog.origins");
    return entry.origins.map(validateRecord);
  });
}

function cliOptions(args, root) {
  boundedArray(args, "arguments", 7);
  const options = { out: "research/ingest/leads.json", privateOut: ".workingdir/ingest/private-leads.json", check: false };
  const flags = { "--out": "out", "--private-out": "privateOut", "--watermark": "watermark" };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === "--check") options.check = true;
    else {
      requireValue(Object.hasOwn(flags, flag) && typeof args[index + 1] === "string" && !args[index + 1].startsWith("--"), "CLI arguments");
      options[flags[flag]] = args[++index];
    }
  }
  if (options.watermark !== undefined) validateDate(options.watermark, "watermark");
  options.out = path.resolve(root, options.out);
  options.privateOut = path.resolve(root, options.privateOut);
  const privateRoot = path.join(root, ".workingdir");
  requireValue(options.privateOut.startsWith(`${privateRoot}${path.sep}`), "private-out must remain inside .workingdir");
  const reserved = ["owners.json", "runs.jsonl", ".watermark"].map((name) => path.join(root, "research/ingest", name));
  requireValue(!reserved.includes(options.out), "output must not replace ingest inputs or run log");
  requireValue(options.out !== options.privateOut, "distinct output paths");
  return options;
}

async function rejectSymlinkParents(file, root) {
  const relative = path.relative(root, file);
  requireValue(!relative.startsWith("..") && !path.isAbsolute(relative), "output inside repository");
  const segments = relative.split(path.sep);
  requireValue(segments.length <= 64, "output path depth");
  let current = root;
  for (const segment of segments) {
    current = path.join(current, segment);
    try {
      requireValue(!(await lstat(current)).isSymbolicLink(), "output symlink");
    } catch (cause) {
      if (cause.code === "ENOENT") return;
      throw new Error("Unsafe ingest output path", { cause });
    }
  }
}

async function writeCatalogs(files) {
  const staged = files.map(({ destination }) => `${destination}.${randomUUID()}.tmp`);
  try {
    for (let index = 0; index < files.length; index += 1) {
      await mkdir(path.dirname(files[index].destination), { recursive: true, mode: 0o700 });
      await writeFile(staged[index], files[index].text, { flag: "wx", mode: 0o600 });
    }
    await replaceFilePair(files.map(({ destination }, index) => ({ destination, staged: staged[index] })));
  } catch (cause) {
    throw new Error("Cannot atomically replace ingest catalogs", { cause });
  } finally {
    await Promise.all(staged.map((file) => rm(file, { force: true })));
  }
}

async function advanceWatermark(root, fetchedAt) {
  const destination = path.join(root, "research/ingest/.watermark");
  await rejectSymlinkParents(destination, root);
  const staged = `${destination}.${randomUUID()}.tmp`;
  try {
    await writeFile(staged, `${fetchedAt}\n`, { flag: "wx", mode: 0o600 });
    await rename(staged, destination);
  } finally {
    await rm(staged, { force: true });
  }
}

async function appendRunMetrics(root, metrics) {
  const destination = path.join(root, "research/ingest/runs.jsonl");
  await rejectSymlinkParents(destination, root);
  const previous = await readOptional(destination) ?? "";
  requireValue(previous === "" || previous.endsWith("\n"), "run log newline");
  const text = `${previous}${JSON.stringify(metrics)}\n`;
  requireValue(Buffer.byteLength(text) <= maximumFileBytes, "run log size");
  const staged = `${destination}.${randomUUID()}.tmp`;
  try {
    await writeFile(staged, text, { flag: "wx", mode: 0o600 });
    await rename(staged, destination);
  } catch (cause) {
    throw new Error("Cannot append ingest run metrics", { cause });
  } finally {
    await rm(staged, { force: true });
  }
}

async function logRun(root, owners, issues, records, fetchedAt, startedAt) {
  const unique = latestRecords(records);
  const leadsCount = groupRecords(unique).length;
  try {
    await appendRunMetrics(root, {
      timestamp: fetchedAt,
      duration_ms: Math.round(performance.now() - startedAt),
      owners_queried: owners,
      issues_inspected: issues.length,
      leads_count: leadsCount,
      dedupe_count: unique.length - leadsCount,
      errors: [],
    });
    return "";
  } catch {
    // Catalog publication succeeded; a separate log failure must be visible.
    return " Run metrics could not be appended; previous log retained.";
  }
}

function cliEnvironment({ args = process.argv.slice(2), env = process.env, root = defaultRoot, fetchImpl = fetch, fetchedAt = new Date().toISOString(), sleep = delay }) {
  return { args, env, root, fetchImpl, fetchedAt, sleep };
}

export async function runCli(input = {}) {
  const startedAt = performance.now();
  const { args, env, root: requestedRoot, fetchImpl, fetchedAt, sleep } = cliEnvironment(input);
  const token = env.GH_TOKEN || env.GITHUB_TOKEN;
  if (!token) return { exitCode: 2, message: "Set GH_TOKEN or GITHUB_TOKEN for read-only research-watch ingestion." };
  const root = await realpath(requestedRoot);
  const cli = cliOptions(args, root);
  await rejectSymlinkParents(cli.out, root);
  await rejectSymlinkParents(cli.privateOut, root);
  const owners = loadOwners(await readStableOpenedFile(path.join(root, "research/ingest/owners.json"), { maximumBytes: 64 * 1024 }));
  const oldPublic = await readOptional(cli.out);
  const oldPrivate = await readOptional(cli.privateOut);
  const previous = [...catalogRecords(oldPublic), ...catalogRecords(oldPrivate)];
  const watermark = cli.watermark ?? (await readOptional(path.join(root, "research/ingest/.watermark")))?.trim() ?? "";
  if (watermark) validateDate(watermark, "watermark");
  const options = requestOptions({ token, fetchImpl, sleep });
  const issues = await collectIssues(owners, watermark, options);
  const records = await normalizeAll(issues, previous, fetchedAt, watermark, options);
  const { publicCatalog, privateCatalog } = buildLeads(records);
  assertNoPrivateLeak(publicCatalog, latestRecords(records).filter((record) => record.visibility !== "public"));
  const publicText = `${JSON.stringify(publicCatalog, null, 2)}\n`;
  const privateText = `${JSON.stringify(privateCatalog, null, 2)}\n`;
  requireValue(Buffer.byteLength(publicText) + Buffer.byteLength(privateText) <= maximumFileBytes, "catalog output size");
  if (cli.check) return { exitCode: Number(oldPublic !== publicText), message: oldPublic === publicText ? "Research-watch catalog is current." : "Research-watch catalog differs." };
  await writeCatalogs([{ destination: cli.privateOut, text: privateText }, { destination: cli.out, text: publicText }]);
  try {
    await advanceWatermark(root, fetchedAt);
  } catch {
    return { exitCode: 1, message: "Research-watch catalogs written, watermark not advanced. Check local ingest output permissions and paths." };
  }
  const logMessage = await logRun(root, owners, issues, records, fetchedAt, startedAt);
  return { exitCode: 0, message: `Research-watch ingestion: ${publicCatalog.entries.length} public leads.${logMessage}` };
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (invokedPath === import.meta.url) {
  try {
    const result = await runCli();
    console.error(result.message);
    process.exitCode = result.exitCode;
  } catch (error) {
    // Remote errors can contain private titles or URLs. Print only our field diagnostics.
    const field = /^Invalid [a-zA-Z .:_]+$/u.test(error.message) ? ` ${error.message}.` : "";
    console.error(`Research-watch ingestion failed; catalogs were not published.${field} Check inputs, visibility, request limits and credentials locally.`);
    process.exitCode = 1;
  }
}
