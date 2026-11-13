import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const MAX_REPOSITORY_ENTRIES = 100_000;

/**
 * Discover repository-local Git variables and remove them from a copied
 * environment, bounding discovery time and preventing parent traversal.
 */
export function gitEnvironment(root) {
  let variables;
  try {
    variables = execFileSync("git", ["rev-parse", "--local-env-vars"], {
      cwd: root,
      encoding: "utf8",
      timeout: 30_000,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    throw new Error(`git rev-parse --local-env-vars failed: ${error.message}`, { cause: error });
  }
  const env = { ...process.env };
  for (const name of variables.trim().split(/\s+/u)) delete env[name];
  env.GIT_CEILING_DIRECTORIES = path.dirname(path.resolve(root));
  return env;
}

/** Reject excess NUL-delimited entries before allocating an inventory. */
function assertEntryLimit(output, maxEntries) {
  let offset = 0;
  for (let count = 0; count <= maxEntries; count += 1) {
    const separator = output.indexOf("\0", offset);
    if (separator === -1) return;
    if (count === maxEntries) {
      throw new Error(`repository inventory exceeds ${maxEntries} entries`);
    }
    offset = separator + 1;
  }
}

/** Keep existing entries, including dangling symlinks; report inspection errors. */
function repositoryEntryExists(root, file) {
  try {
    fs.lstatSync(path.join(root, file));
    return true;
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return false;
    throw new Error(`cannot inspect repository entry ${file}: ${error.message}`, { cause: error });
  }
}

/**
 * Inventory existing tracked and unignored untracked files with bounded
 * Git output and time, preventing discovery outside the requested root.
 */
export function listRepositoryFiles(root, { maxEntries = MAX_REPOSITORY_ENTRIES } = {}) {
  let output;
  try {
    output = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
      cwd: root,
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
      env: gitEnvironment(root),
    });
  } catch (error) {
    throw new Error(`git ls-files failed: ${error.message}`, { cause: error });
  }
  assertEntryLimit(output, maxEntries);
  return [...new Set(output.split("\0"))].filter((file) => (
    file && repositoryEntryExists(root, file)
  )).sort();
}
