import { lstatSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function assertCanonicalDirectory(directory, label) {
  const information = lstatSync(directory);
  invariant(
    information.isDirectory() && !information.isSymbolicLink(),
    `${label} must be a non-symlink directory.`,
  );
  invariant(realpathSync(directory) === directory, `${label} must be canonical.`);
}

function assertOutputAncestors(directory) {
  let candidate = directory;
  for (let depth = 0; depth < 128; depth += 1) {
    try {
      assertCanonicalDirectory(candidate, "PAGES_OUTPUT_DIR ancestor");
      return;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    candidate = path.dirname(candidate);
  }
  throw new Error("PAGES_OUTPUT_DIR exceeds 128 ancestor directories.");
}

function isWithin(directory, root) {
  const relative = path.relative(root, directory);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

export function resolvePagesOutputDirectory({ override, repositoryRoot } = {}) {
  invariant(path.isAbsolute(repositoryRoot ?? ""), "Vite repository root must be absolute.");
  if (override === undefined) return path.join(repositoryRoot, "dist-github-pages");
  invariant(typeof override === "string" && override.trim() !== "" && override === override.trim(),
    "PAGES_OUTPUT_DIR must be one absolute path or a path beneath repository tmp/.");
  const output = path.resolve(repositoryRoot, override);
  const temporaryRoot = path.join(repositoryRoot, "tmp");
  const temporaryChild = output !== temporaryRoot && isWithin(output, temporaryRoot);
  invariant(output !== path.parse(output).root && output !== repositoryRoot,
    "PAGES_OUTPUT_DIR must not be a filesystem or repository root.");
  invariant(temporaryChild || (path.isAbsolute(override) && !isWithin(output, repositoryRoot)),
    "PAGES_OUTPUT_DIR must be outside the repository or beneath repository tmp/; source directories are forbidden.");
  assertOutputAncestors(output);
  return output;
}

/**
 * @param {{
 *   override?: string,
 *   repositoryRoot?: string,
 *   systemTemporaryDirectory?: string,
 * }} [options]
 */
export function resolveViteCacheDirectory({
  override,
  repositoryRoot,
  systemTemporaryDirectory = tmpdir(),
} = {}) {
  invariant(path.isAbsolute(repositoryRoot ?? ""), "Vite repository root must be absolute.");
  if (typeof override !== "string" || override.trim() === "") {
    return path.join(repositoryRoot, "node_modules", ".vite");
  }
  invariant(override === override.trim() && path.isAbsolute(override), "VITE_CACHE_DIR must be one absolute path.");
  const temporaryRoot = path.resolve(systemTemporaryDirectory);
  assertCanonicalDirectory(temporaryRoot, "The operating-system temporary root");
  const expected = path.join(temporaryRoot, "vite-cache");
  invariant(path.resolve(override) === expected, `VITE_CACHE_DIR must be exactly ${expected}.`);
  try {
    assertCanonicalDirectory(expected, "VITE_CACHE_DIR");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  return expected;
}
