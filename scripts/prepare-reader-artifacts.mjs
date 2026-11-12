import { copyFile, lstat, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { listRepositoryFiles } from "./lib/repository-inventory.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const defaultRepositoryRoot = path.resolve(path.dirname(scriptPath), "..");
const SOURCE_EXTENSIONS = new Set([
  ".csv", ".js", ".json", ".mjs", ".py", ".sh", ".toml",
  ".ts", ".tsx", ".tsv", ".yaml", ".yml",
]);
const LINK_PATTERN = /(?<!!)\[[^\]]+\]\((?<target>[^)]+)\)/gu;
const FORBIDDEN_PUBLIC_PREFIXES = Object.freeze([
  ".git/", ".openai/", "node_modules/", "public/", "sources/",
]);

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function sourceExtension(file) {
  const lower = file.toLowerCase();
  return [...SOURCE_EXTENSIONS].find((extension) => lower.endsWith(extension)) ?? null;
}

function linkPath(target) {
  const trimmed = target.trim();
  if (/^(?:https?:|mailto:|#)/iu.test(trimmed)) return null;
  const withoutTitle = trimmed.startsWith("<")
    ? trimmed.match(/^<([^>]+)>/u)?.[1]
    : trimmed.split(/\s+"/u, 1)[0];
  if (!withoutTitle) return null;
  const rawPath = withoutTitle.split("#", 1)[0];
  if (!rawPath) return null;
  try {
    return decodeURIComponent(rawPath);
  } catch {
    return null;
  }
}

function resolveOutputRoot(root, outputRoot) {
  const resolvedOutput = path.resolve(outputRoot);
  const expectedDefault = path.resolve(root, "public", "repository-files");
  if (!isInside(root, resolvedOutput) || resolvedOutput === root) {
    throw new Error("Reader-artifact output must be a bounded repository subdirectory.");
  }
  if (path.resolve(outputRoot) === path.resolve(defaultRepositoryRoot, "public", "repository-files")
      && resolvedOutput !== expectedDefault) {
    throw new Error("Reader-artifact default output does not match the resolved repository root.");
  }

  return resolvedOutput;
}

function validateArtifactPath(artifact) {
  if (typeof artifact !== "string"
      || artifact.length === 0
      || artifact.includes("\\")
      || path.posix.isAbsolute(artifact)
      || artifact.split("/").includes("..")
      || !sourceExtension(artifact)
      || FORBIDDEN_PUBLIC_PREFIXES.some((prefix) => artifact.startsWith(prefix))) {
    throw new Error(`Reader-artifact allowlist contains an unsafe path: ${artifact}`);
  }
}

function validateAllowlistArtifacts(artifacts) {
  const allowedArtifacts = new Set();
  for (const artifact of artifacts) {
    validateArtifactPath(artifact);
    if (allowedArtifacts.has(artifact)) {
      throw new Error(`Reader-artifact allowlist contains a duplicate: ${artifact}`);
    }
    allowedArtifacts.add(artifact);
  }
  const sortedAllowedArtifacts = [...allowedArtifacts].sort();
  if (JSON.stringify(artifacts) !== JSON.stringify(sortedAllowedArtifacts)) {
    throw new Error("Reader-artifact allowlist must be sorted.");
  }

  return allowedArtifacts;
}

async function loadAllowlist(root, allowlistPath) {
  const resolvedAllowlist = path.resolve(allowlistPath);
  if (!isInside(root, resolvedAllowlist)) {
    throw new Error("Reader-artifact allowlist must stay inside the repository.");
  }
  const allowlistInformation = await lstat(resolvedAllowlist);
  if (!allowlistInformation.isFile() || allowlistInformation.isSymbolicLink()) {
    throw new Error("Reader-artifact allowlist must be a regular file.");
  }
  const realAllowlist = await realpath(resolvedAllowlist);
  if (!isInside(root, realAllowlist)) {
    throw new Error("Reader-artifact allowlist resolves outside the repository.");
  }
  const allowlist = JSON.parse(await readFile(realAllowlist, "utf8"));
  if (allowlist?.schema !== 1 || !Array.isArray(allowlist.artifacts)) {
    throw new Error("Reader-artifact allowlist has an unsupported schema.");
  }
  return validateAllowlistArtifacts(allowlist.artifacts);
}

async function resolveLinkedTarget(root, markdown, linked) {
  const candidate = path.resolve(
    linked.startsWith("/") ? root : path.dirname(markdown),
    linked.replace(/^[/\\]+/u, ""),
  );
  if (!isInside(root, candidate)) {
    throw new Error(`Reader artifact escapes the repository: ${linked}`);
  }
  const information = await lstat(candidate);
  if (!information.isFile() || information.isSymbolicLink()) {
    throw new Error(`Reader artifact is not a regular file: ${linked}`);
  }
  const realCandidate = await realpath(candidate);
  if (!isInside(root, realCandidate)) {
    throw new Error(`Reader artifact resolves outside the repository: ${linked}`);
  }
  const relative = path.relative(root, realCandidate).replaceAll("\\", "/");
  return relative;
}

async function collectLinkedTargets(root, resolvedOutput, allowedArtifacts) {
  const markdownFiles = listRepositoryFiles(root)
    .filter((file) => file.endsWith(".md"))
    .map((file) => path.join(root, file))
    .filter((file) => !isInside(resolvedOutput, file));
  const targets = new Set();
  for (const markdown of markdownFiles) {
    const body = await readFile(markdown, "utf8");
    for (const match of body.matchAll(LINK_PATTERN)) {
      const linked = linkPath(match.groups?.target ?? "");
      if (!linked || !sourceExtension(linked)) continue;
      const relative = await resolveLinkedTarget(root, markdown, linked);
      if (!allowedArtifacts.has(relative)) {
        continue;
      }
      targets.add(relative);
    }
  }

  for (const artifact of allowedArtifacts) {
    if (!targets.has(artifact)) {
      throw new Error(`Public reader-artifact allowlist entry is not linked: ${artifact}`);
    }
  }

  return targets;
}

async function writeArtifacts(root, resolvedOutput, targets) {
  await rm(resolvedOutput, { recursive: true, force: true });
  await mkdir(resolvedOutput, { recursive: true });
  const artifacts = [...targets].sort();
  for (const relative of artifacts) {
    const destination = path.join(resolvedOutput, ...relative.split("/")) + ".txt";
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(path.join(root, ...relative.split("/")), destination);
  }
  await writeFile(
    path.join(resolvedOutput, "manifest.json"),
    `${JSON.stringify({ schema: 1, artifacts }, null, 2)}\n`,
    "utf8",
  );
  return Object.freeze({ outputRoot: resolvedOutput, artifacts: Object.freeze(artifacts) });
}

export async function prepareReaderArtifacts({
  repositoryRoot = defaultRepositoryRoot,
  outputRoot = path.join(repositoryRoot, "public", "repository-files"),
  allowlistPath = path.join(repositoryRoot, "github-pages", "public-artifacts.json"),
} = {}) {
  const root = await realpath(repositoryRoot);
  const resolvedOutput = resolveOutputRoot(root, outputRoot);
  const allowedArtifacts = await loadAllowlist(root, allowlistPath);
  const targets = await collectLinkedTargets(root, resolvedOutput, allowedArtifacts);
  return writeArtifacts(root, resolvedOutput, targets);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(scriptPath)) {
  const prepared = await prepareReaderArtifacts();
  process.stdout.write(`Prepared ${prepared.artifacts.length} linked repository artifacts.\n`);
}
