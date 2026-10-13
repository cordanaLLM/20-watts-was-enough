import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Runs after `npm run build`: the validator accepts a copy of the built Pages
// artifact and refuses the same copy once a defect is planted in it.

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const validatorName = "validate-github-pages-build.mjs";
const outputName = "dist-github-pages";
const validatorTimeoutMs = 300_000;
// Evidence readers refuse paths that resolve outside the repository root, so
// the repository is copied; only dependencies and local-only state are linked.
const linkedEntries = new Set([
  ".cache", ".claude", ".standards", ".vite", ".workingdir", ".workingdir2",
  "build", "dist", "node_modules", "tmp",
]);

async function withBuiltArtifactCopy(callback) {
  const root = await mkdtemp(path.join(os.tmpdir(), "pages-build-gate-"));
  try {
    for (const entry of await readdir(projectRoot)) {
      if (entry === ".git") continue;
      const source = path.join(projectRoot, entry);
      if (linkedEntries.has(entry)) await symlink(source, path.join(root, entry));
      else await cp(source, path.join(root, entry), { recursive: true, verbatimSymlinks: true });
    }
    await callback(root, path.join(root, outputName));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function runValidator(root) {
  const result = spawnSync(process.execPath, [path.join(root, "scripts", validatorName)], {
    cwd: root,
    encoding: "utf8",
    timeout: validatorTimeoutMs,
  });
  assert.equal(result.error, undefined, `validator did not finish: ${result.error}`);
  return { status: result.status, output: `${result.stdout}\n${result.stderr}` };
}

async function withPlantedFile(filePath, plant, callback) {
  let original = null;
  try {
    original = await readFile(filePath);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  try {
    await plant();
    await callback();
  } finally {
    await rm(filePath, { force: true });
    if (original !== null) await writeFile(filePath, original);
  }
}

function assertRefused(run, pattern) {
  assert.notEqual(run.status, 0, `validator accepted a planted defect:\n${run.output}`);
  assert.match(run.output, pattern);
}

test("Pages build validator accepts the built artifact and refuses planted defects", async (t) => {
  await withBuiltArtifactCopy(async (root, output) => {
    await t.test("baseline passes", () => {
      const result = runValidator(root);
      assert.equal(result.status, 0, result.output);
      assert.match(result.output, /GitHub Pages build validation passed:/u);
    });
    await t.test("a symbolic link in place of a required page is refused", async () => {
      const page = path.join(output, "help", "index.html");
      await withPlantedFile(
        page,
        async () => {
          await rm(page);
          await symlink(path.join(output, "index.html"), page);
        },
        () => assertRefused(runValidator(root), /help\/index\.html must be a regular file/u),
      );
    });
    await t.test("an edited robots.txt is refused", async () => {
      const robots = path.join(output, "robots.txt");
      await withPlantedFile(
        robots,
        async () => writeFile(robots, `${await readFile(robots, "utf8")}Disallow: /planted\n`),
        () => assertRefused(runValidator(root), /robots\.txt is stale or malformed/u),
      );
    });
    await t.test("a server worker at the artifact root is refused", async () => {
      const worker = path.join(output, "_worker.js");
      await withPlantedFile(
        worker,
        () => writeFile(worker, "export default {};\n"),
        () => assertRefused(runValidator(root), /_worker\.js must not be part of the static Pages artifact/u),
      );
    });
    await t.test("a public source map is refused", async () => {
      const sourceMap = path.join(output, "assets", "planted.js.map");
      await withPlantedFile(
        sourceMap,
        () => writeFile(sourceMap, "{}\n"),
        () => assertRefused(runValidator(root), /source map must not be public: assets\/planted\.js\.map/u),
      );
    });
  });
});
