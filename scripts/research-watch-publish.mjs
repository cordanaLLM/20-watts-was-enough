import { execFile } from "node:child_process";
import { stat, readFile as fsReadFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

import { runCli as defaultRunIngest } from "./research-watch-ingest.mjs";
import { parseStrictJson } from "./lib/strict-json.mjs";

const defaultOwner = "cordanaLLM";
const defaultRepo = "20-watts-was-enough";
const defaultBranch = "research-watch/ingest";
const baseBranch = "main";
const defaultRepoRegex = /^[a-zA-Z0-9-]+\/[a-zA-Z0-9._-]+$/u;
const maximumPayloadBytes = 1_048_576; // 1 MiB
const maximumTimeoutMs = 15_000; // 15 seconds
const maxRetries = 3;
const totalDeadlineMs = 15 * 60 * 1000; // 15 minutes
const gitConfigTimeoutMs = 5_000;
const gitConfigMaxBytes = 4_096;
const signoffNamePattern = /^[^\s<>][^\n\r<>]{0,126}[^\s<>]$|^[^\s<>]$/u;
const signoffEmailPattern = /^[^\s<>@]{1,64}@[^\s<>@]{1,190}$/u;
const allowListedPaths = [
  "research/ingest/leads.json",
  "research/ingest/.watermark",
  "research/ingest/runs.jsonl",
];
const defaultRoot = fileURLToPath(new URL("../", import.meta.url));

const inspectQuery = `query InspectRepository($owner: String!, $name: String!, $expression: String!, $branchExpression: String!, $branchRef: String!, $mainRef: String!, $headRefName: String!) {
  repository(owner: $owner, name: $name) {
    id
    object(expression: $expression) {
      ... on Blob {
        text
      }
    }
    branchObject: object(expression: $branchExpression) {
      ... on Blob {
        text
      }
    }
    mainRef: ref(qualifiedName: $mainRef) {
      id
      target {
        oid
      }
    }
    branchRef: ref(qualifiedName: $branchRef) {
      id
      target {
        oid
      }
    }
    pullRequests(headRefName: $headRefName, states: OPEN, first: 10) {
      nodes {
        id
        number
      }
    }
  }
}`;

const createRefMutation = `mutation CreateRef($input: CreateRefInput!) {
  createRef(input: $input) {
    ref {
      id
      name
    }
  }
}`;

const updateRefMutation = `mutation UpdateRef($input: UpdateRefInput!) {
  updateRef(input: $input) {
    ref {
      id
      name
    }
  }
}`;

const createCommitOnBranchMutation = `mutation CreateCommitOnBranch($input: CreateCommitOnBranchInput!) {
  createCommitOnBranch(input: $input) {
    commit {
      oid
      url
    }
  }
}`;

const createPullRequestMutation = `mutation CreatePullRequest($input: CreatePullRequestInput!) {
  createPullRequest(input: $input) {
    pullRequest {
      id
      number
      url
    }
  }
}`;

function retryWait(response, attempt) {
  const reset = response.headers.get("x-ratelimit-reset");
  const backoff = 2000 * (2 ** attempt);
  if (!reset || ![403, 429].includes(response.status)) return backoff;
  const milliseconds = Math.max(0, Number(reset) * 1000 - Date.now());
  if (!Number.isFinite(milliseconds) || milliseconds > 300_000) {
    return backoff;
  }
  return Math.max(backoff, milliseconds);
}

async function resolveToken({ tokenFileArg, env, readFileImpl }) {
  let tokenPath = tokenFileArg;
  const credDir = env.CREDENTIALS_DIRECTORY ? path.resolve(env.CREDENTIALS_DIRECTORY) : null;
  if (!tokenPath) {
    if (credDir) {
      tokenPath = path.join(credDir, "research-watch-token");
    } else {
      return { ok: false, error: "Token credential missing or unspecified" };
    }
  }

  const resolvedPath = path.resolve(tokenPath);
  let fileStat;
  try {
    fileStat = await stat(resolvedPath);
  } catch {
    return { ok: false, error: "Token file missing or unreadable" };
  }

  if (!fileStat.isFile()) {
    return { ok: false, error: "Token path is not a file" };
  }

  const isUnderCredDir = credDir !== null && (resolvedPath === credDir || resolvedPath.startsWith(`${credDir}${path.sep}`));
  if (!isUnderCredDir) {
    const mode = fileStat.mode & 0o777;
    if ((mode & 0o077) !== 0) {
      return { ok: false, error: "Token file has insecure permissions" };
    }
  }

  let content;
  try {
    content = (await readFileImpl(resolvedPath, "utf8")).trim();
  } catch {
    return { ok: false, error: "Token file could not be read" };
  }

  if (!content) {
    return { ok: false, error: "Token is empty" };
  }

  return { ok: true, token: content };
}

function parseArgs(args) {
  const options = {
    dryRun: false,
    tokenFile: undefined,
    repo: `${defaultOwner}/${defaultRepo}`,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--token-file") {
      if (i + 1 >= args.length || args[i + 1].startsWith("--")) {
        throw new Error("Invalid --token-file argument");
      }
      options.tokenFile = args[++i];
    } else if (arg === "--repo") {
      if (i + 1 >= args.length || args[i + 1].startsWith("--")) {
        throw new Error("Invalid --repo argument");
      }
      const repoVal = args[++i];
      if (!defaultRepoRegex.test(repoVal)) {
        throw new Error("Invalid repository name format");
      }
      options.repo = repoVal;
    } else {
      throw new Error(`Invalid CLI argument: ${arg}`);
    }
  }

  return options;
}

export function validateAdditions(additions) {
  const allowed = new Set(allowListedPaths);
  if (!Array.isArray(additions) || additions.length !== allowListedPaths.length) {
    throw new Error("Invalid additions allow-list: must match exact allow-list set");
  }
  const paths = new Set();
  for (const item of additions) {
    if (!item || typeof item.path !== "string" || !allowed.has(item.path)) {
      throw new Error(`Invalid addition path: ${item?.path}`);
    }
    if (paths.has(item.path)) {
      throw new Error(`Duplicate addition path: ${item.path}`);
    }
    paths.add(item.path);
  }
  if (paths.size !== allowed.size || ![...allowed].every((p) => paths.has(p))) {
    throw new Error("Invalid additions allow-list: set equality assertion failed");
  }
}

async function loadAllowListedFiles(root, readFileImpl) {
  const contents = {};
  let totalBytes = 0;

  for (const relPath of allowListedPaths) {
    const fullPath = path.join(root, relPath);
    let text;
    try {
      text = await readFileImpl(fullPath, "utf8");
    } catch (cause) {
      throw new Error(`Cannot read required ingest artifact: ${relPath}`, { cause });
    }
    const byteLength = Buffer.byteLength(text, "utf8");
    if (byteLength > maximumPayloadBytes) {
      throw new Error(`File exceeds payload size cap: ${relPath}`);
    }
    totalBytes += byteLength;
    contents[relPath] = text;
  }

  if (totalBytes > maximumPayloadBytes) {
    throw new Error("Combined payload size exceeds 1 MiB cap for allow-listed files");
  }

  return { contents, totalBytes };
}

async function parseGraphQLResponse(response) {
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error("GitHub GraphQL request failed");
  }
  if (body.errors && Array.isArray(body.errors) && body.errors.length > 0) {
    const err = new Error("GitHub GraphQL request returned errors");
    err.graphQLErrors = true;
    throw err;
  }
  return body.data;
}

async function requestGraphQL({ query, variables, token, fetchImpl, sleep, deadline, timeoutMs = maximumTimeoutMs, maxRetriesCount = maxRetries }) {
  const endpoint = "https://api.github.com/graphql";

  for (let attempt = 0; attempt <= maxRetriesCount; attempt += 1) {
    if (deadline && Date.now() > deadline) {
      throw new Error("Research-watch publish deadline exceeded");
    }

    const remaining = deadline ? Math.max(0, deadline - Date.now()) : timeoutMs;
    const currentTimeout = Math.min(timeoutMs, remaining);

    let response;
    try {
      response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          "Accept": "application/vnd.github+json",
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2026-03-10",
        },
        body: JSON.stringify({ query, variables }),
        redirect: "error",
        signal: AbortSignal.timeout(currentTimeout),
      });
    } catch {
      if (attempt < maxRetriesCount) {
        await sleep(2000 * (2 ** attempt));
        continue;
      }
      throw new Error("GitHub GraphQL request failed");
    }

    if (response.ok) {
      return await parseGraphQLResponse(response);
    }

    const retryable = [403, 429].includes(response.status) || (response.status >= 500 && response.status < 600);
    await response.body?.cancel();
    if (retryable && attempt < maxRetriesCount) {
      await sleep(retryWait(response, attempt));
      continue;
    }
    throw new Error("GitHub GraphQL request failed");
  }

  throw new Error("GitHub GraphQL request failed");
}

async function obtainToken({ cliOptions, env, readFile }) {
  const tokenResult = await resolveToken({
    tokenFileArg: cliOptions.tokenFile,
    env,
    readFileImpl: readFile,
  });
  if (!tokenResult.ok) {
    return { ok: false, result: { exitCode: 2, message: "Research-watch token missing, unreadable, empty or insecure." } };
  }
  return { ok: true, token: tokenResult.token };
}

async function executeIngestPhase({ runIngest, token, root, fetchImpl }) {
  const ingestResult = await runIngest({
    args: [],
    env: { GH_TOKEN: token },
    root,
    fetchImpl,
  });

  if (ingestResult.exitCode !== 0) {
    return { ok: false, exitCode: ingestResult.exitCode, message: ingestResult.message };
  }
  return { ok: true };
}

async function loadAndValidateFiles(root, readFile) {
  const { contents } = await loadAllowListedFiles(root, readFile);
  const leadsParsed = parseStrictJson(contents["research/ingest/leads.json"], { label: "leads.json" });
  const publicLeadsCount = Array.isArray(leadsParsed?.entries) ? leadsParsed.entries.length : 0;
  const fetchedAt = contents["research/ingest/.watermark"].trim();
  return { fileContents: contents, publicLeadsCount, fetchedAt };
}

async function inspectRemoteRepository({ owner, repo, token, fetchImpl, sleep, deadline }) {
  let inspectData;
  try {
    inspectData = await requestGraphQL({
      query: inspectQuery,
      variables: {
        owner,
        name: repo,
        expression: "main:research/ingest/leads.json",
        branchExpression: `${defaultBranch}:research/ingest/leads.json`,
        branchRef: `refs/heads/${defaultBranch}`,
        mainRef: `refs/heads/${baseBranch}`,
        headRefName: defaultBranch,
      },
      token,
      fetchImpl,
      sleep,
      deadline,
    });
  } catch {
    return { ok: false, error: { exitCode: 1, message: "GitHub GraphQL request failed; changes were not published." } };
  }

  const repoData = inspectData?.repository;
  if (!repoData) {
    return { ok: false, error: { exitCode: 1, message: "Repository not found on GitHub." } };
  }

  return { ok: true, repoData };
}

function determineBranchAction(branchRef, openPRsCount, mainHeadOid) {
  if (branchRef && openPRsCount === 1) {
    return { branchAction: "update-branch", expectedHeadOid: branchRef.target.oid };
  }
  if (branchRef && openPRsCount === 0) {
    return { branchAction: "reset-branch", expectedHeadOid: mainHeadOid };
  }
  return { branchAction: "create-branch", expectedHeadOid: mainHeadOid };
}

function planBranchAndPullRequestAction(repoData, localLeadsText) {
  const remoteLeadsText = repoData.object?.text;
  if (remoteLeadsText !== undefined && remoteLeadsText === localLeadsText) {
    return { done: true, result: { exitCode: 0, message: "Research-watch leads unchanged; no lead change." } };
  }

  const mainHeadOid = repoData.mainRef?.target?.oid;
  if (!mainHeadOid) {
    return { done: true, result: { exitCode: 1, message: "Could not find main branch HEAD oid." } };
  }

  const openPRs = repoData.pullRequests?.nodes ?? [];
  if (openPRs.length > 1) {
    return { done: true, result: { exitCode: 1, message: "More than one open pull request found for research-watch/ingest." } };
  }

  const { branchAction, expectedHeadOid } = determineBranchAction(repoData.branchRef, openPRs.length, mainHeadOid);
  if (branchAction === "update-branch" && repoData.branchObject?.text === localLeadsText) {
    return { done: true, result: { exitCode: 0, message: "Research-watch leads already on the open pull request; no lead change." } };
  }

  const prAction = openPRs.length === 0 ? "create-pr" : "existing-pr";
  return {
    done: false,
    plan: { branchAction, expectedHeadOid, prAction, mainHeadOid, branchRef: repoData.branchRef },
  };
}

function formatDryRunResult(branchAction, prAction) {
  return {
    exitCode: 0,
    message: `[dry-run] ${branchAction}, ${prAction}, paths: ${allowListedPaths.join(", ")}`,
  };
}

function prepareAdditions(fileContents, customAdditions) {
  const additions = allowListedPaths.map((relPath) => ({
    path: relPath,
    contents: Buffer.from(fileContents[relPath], "utf8").toString("base64"),
  }));
  const effective = customAdditions || additions;
  validateAdditions(effective);
  return effective;
}

async function applyBranchRefMutation({ branchAction, repoData, branchRef, mainHeadOid, context }) {
  if (branchAction === "create-branch") {
    await requestGraphQL({
      query: createRefMutation,
      variables: {
        input: {
          repositoryId: repoData.id,
          name: `refs/heads/${defaultBranch}`,
          oid: mainHeadOid,
        },
      },
      ...context,
    });
  } else if (branchAction === "reset-branch") {
    await requestGraphQL({
      query: updateRefMutation,
      variables: {
        input: {
          refId: branchRef.id,
          oid: mainHeadOid,
          force: true,
        },
      },
      ...context,
    });
  }
}

export function commitBody({ publicLeadsCount, fetchedAt, signoff }) {
  if (!signoffIsValid(signoff)) throw new Error("Invalid sign-off identity");
  return `Lead count: ${publicLeadsCount}\nFetched at: ${fetchedAt}\n\nSigned-off-by: ${signoff.name} <${signoff.email}>\n`;
}

function signoffIsValid(signoff) {
  return signoffNamePattern.test(signoff?.name ?? "") && signoffEmailPattern.test(signoff?.email ?? "");
}

const runGitConfig = promisify(execFile);

export async function readGitIdentity({ root }) {
  const read = async (key) => {
    const { stdout } = await runGitConfig("git", ["config", "--get", key], {
      cwd: root,
      timeout: gitConfigTimeoutMs,
      maxBuffer: gitConfigMaxBytes,
      encoding: "utf8",
    });
    return stdout.replace(/\r?\n$/u, "");
  };
  return { name: await read("user.name"), email: await read("user.email") };
}

async function obtainSignoff({ readIdentity, root }) {
  let signoff;
  try {
    signoff = await readIdentity({ root });
  } catch {
    signoff = null;
  }
  if (!signoffIsValid(signoff)) {
    return { ok: false, result: { exitCode: 2, message: "Research-watch sign-off identity missing or invalid in git config." } };
  }
  return { ok: true, signoff };
}

async function applyCommitMutation({ owner, repo, expectedHeadOid, publicLeadsCount, fetchedAt, signoff, additions, context }) {
  await requestGraphQL({
    query: createCommitOnBranchMutation,
    variables: {
      input: {
        branch: {
          repositoryNameWithOwner: `${owner}/${repo}`,
          branchName: defaultBranch,
        },
        expectedHeadOid,
        message: {
          headline: "chore(research): refresh research-watch leads",
          body: commitBody({ publicLeadsCount, fetchedAt, signoff }),
        },
        fileChanges: {
          additions,
        },
      },
    },
    ...context,
  });
}

async function applyPullRequestMutation({ repoId, publicLeadsCount, context }) {
  await requestGraphQL({
    query: createPullRequestMutation,
    variables: {
      input: {
        repositoryId: repoId,
        baseRefName: baseBranch,
        headRefName: defaultBranch,
        title: "chore(research): refresh research-watch leads",
        body: `Public leads count: ${publicLeadsCount}\n`,
      },
    },
    ...context,
  });
}

async function executeMutations({
  owner,
  repo,
  repoData,
  plan,
  publicLeadsCount,
  fetchedAt,
  signoff,
  additions,
  context,
}) {
  await applyBranchRefMutation({
    branchAction: plan.branchAction,
    repoData,
    branchRef: plan.branchRef,
    mainHeadOid: plan.mainHeadOid,
    context,
  });

  await applyCommitMutation({
    owner,
    repo,
    expectedHeadOid: plan.expectedHeadOid,
    publicLeadsCount,
    fetchedAt,
    signoff,
    additions,
    context,
  });

  if (plan.prAction === "create-pr") {
    await applyPullRequestMutation({
      repoId: repoData.id,
      publicLeadsCount,
      context,
    });
  }
}

function mapPublicationError(error) {
  if (
    error.message?.startsWith("Invalid additions allow-list") ||
    error.message?.startsWith("File exceeds payload") ||
    error.message?.startsWith("Combined payload size")
  ) {
    throw error;
  }
  return {
    exitCode: 1,
    message: "Research-watch publication failed; changes were not published. Check credentials, branch state and network.",
  };
}

export async function main({
  args = process.argv.slice(2),
  env = process.env,
  fetchImpl = fetch,
  runIngest = defaultRunIngest,
  root = defaultRoot,
  readFile = fsReadFile,
  sleep = delay,
  readIdentity = readGitIdentity,
  additions: customAdditions = null,
} = {}) {
  const deadline = Date.now() + totalDeadlineMs;
  const cliOptions = parseArgs(args);

  const tokenState = await obtainToken({ cliOptions, env, readFile });
  if (!tokenState.ok) return tokenState.result;
  const token = tokenState.token;

  const signoffState = await obtainSignoff({ readIdentity, root });
  if (!signoffState.ok) return signoffState.result;

  const ingestPhase = await executeIngestPhase({ runIngest, token, root, fetchImpl });
  if (!ingestPhase.ok) return { exitCode: ingestPhase.exitCode, message: ingestPhase.message };

  const { fileContents, publicLeadsCount, fetchedAt } = await loadAndValidateFiles(root, readFile);
  const [owner, repo] = cliOptions.repo.split("/");

  const inspectResult = await inspectRemoteRepository({ owner, repo, token, fetchImpl, sleep, deadline });
  if (!inspectResult.ok) return inspectResult.error;

  const actionPlan = planBranchAndPullRequestAction(inspectResult.repoData, fileContents["research/ingest/leads.json"]);
  if (actionPlan.done) return actionPlan.result;

  if (cliOptions.dryRun) {
    return formatDryRunResult(actionPlan.plan.branchAction, actionPlan.plan.prAction);
  }

  const additions = prepareAdditions(fileContents, customAdditions);
  const context = { token, fetchImpl, sleep, deadline };

  try {
    await executeMutations({
      owner, repo, repoData: inspectResult.repoData, plan: actionPlan.plan,
      publicLeadsCount, fetchedAt, signoff: signoffState.signoff, additions, context,
    });
  } catch (error) {
    return mapPublicationError(error);
  }

  return { exitCode: 0, message: `Research-watch leads published: ${publicLeadsCount} public leads.` };
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (invokedPath === import.meta.url) {
  try {
    const result = await main();
    if (result.message) console.error(result.message);
    process.exitCode = result.exitCode;
  } catch (error) {
    const field = /^Invalid [a-zA-Z .:_]+$/u.test(error.message) ? ` ${error.message}.` : "";
    console.error(`Research-watch publication failed; changes were not published.${field} Check credentials, branch state and network.`);
    process.exitCode = 1;
  }
}
