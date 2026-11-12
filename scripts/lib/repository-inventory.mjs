import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Discover repository-local Git variables and remove them from a copied
 * environment, bounding discovery time and preventing parent traversal.
 */
export function gitEnvironment(root) {
  let variables;
  try {
    variables = execFileSync("git", ["rev-parse", "--local-env-vars"], {
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

/**
 * Inventory existing tracked and unignored untracked files with bounded
 * Git output and time, preventing discovery outside the requested root.
 */
export function listRepositoryFiles(root) {
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
  return [...new Set(output.split("\0"))].filter((file) => (
    file && fs.existsSync(path.join(root, file))
  )).sort();
}
