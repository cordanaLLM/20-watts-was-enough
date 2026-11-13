import assert from "node:assert/strict";
import { mkdir, mkdtemp, realpath, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { resolvePagesOutputDirectory, resolveViteCacheDirectory } from "./vite-cache-directory.mjs";

test("Pages output defaults to the existing build directory", () => {
  assert.equal(resolvePagesOutputDirectory({ repositoryRoot: "/workspace" }), "/workspace/dist-github-pages");
});

test("Pages output permits staging beneath tmp or an absolute external directory", async (t) => {
  const repositoryRoot = await mkdtemp(path.join(os.tmpdir(), "pages-output-"));
  t.after(() => rm(repositoryRoot, { recursive: true, force: true }));
  for (const override of ["tmp/pages", path.join(repositoryRoot, "tmp/pages"), `${repositoryRoot}-external`]) {
    assert.equal(resolvePagesOutputDirectory({ repositoryRoot, override }), path.resolve(repositoryRoot, override));
  }
});

test("Pages output rejects roots, sources and relative paths outside tmp", () => {
  for (const override of ["/workspace", "/workspace/app", "/", "app", "../pages", "tmp/../app", "tmp", " tmp/pages", ""]) {
    assert.throws(() => resolvePagesOutputDirectory({ repositoryRoot: "/workspace", override }), /PAGES_OUTPUT_DIR/u);
  }
});

test("Pages output rejects canonical repository parents and grandparents", async (t) => {
  const temporaryRoot = await realpath(await mkdtemp(path.join(os.tmpdir(), "pages-output-")));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  await mkdir(path.join(temporaryRoot, "parent"), { mode: 0o750 });
  const repositoryRoot = await mkdtemp(path.join(temporaryRoot, "parent", "repository-"));
  for (const override of [path.dirname(repositoryRoot), path.dirname(path.dirname(repositoryRoot))]) {
    await t.test(`reject ${override}`, () => {
      assert.throws(() => resolvePagesOutputDirectory({ repositoryRoot, override }), /PAGES_OUTPUT_DIR/u);
    });
  }
});

test("Pages output rejects staging through a symlink", async (t) => {
  const repositoryRoot = await mkdtemp(path.join(os.tmpdir(), "pages-output-"));
  t.after(() => rm(repositoryRoot, { recursive: true, force: true }));
  await mkdir(path.join(repositoryRoot, "app"), { mode: 0o750 });
  await symlink(path.join(repositoryRoot, "app"), path.join(repositoryRoot, "tmp"));
  assert.throws(() => resolvePagesOutputDirectory({ repositoryRoot, override: "tmp/pages" }), /PAGES_OUTPUT_DIR/u);
});

test("shared directory validation preserves the locked cache boundary", async (t) => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "vite-cache-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const override = path.join(temporaryRoot, "vite-cache");
  const options = { repositoryRoot: "/workspace", override, systemTemporaryDirectory: temporaryRoot };
  assert.equal(resolveViteCacheDirectory({ repositoryRoot: "/workspace" }), "/workspace/node_modules/.vite");
  assert.equal(resolveViteCacheDirectory(options), override);
  await mkdir(override, { mode: 0o750 });
  assert.equal(resolveViteCacheDirectory(options), override);
  assert.throws(() => resolveViteCacheDirectory({ ...options, override: `${override}-other` }), /must be exactly/u);
  assert.throws(() => resolveViteCacheDirectory({ ...options, override: "vite-cache" }), /absolute/u);
  await rm(override, { recursive: true });
  await symlink(temporaryRoot, override);
  assert.throws(() => resolveViteCacheDirectory(options), /non-symlink/u);
});
