import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { gitEnvironment } from "./lib/repository-inventory.mjs";
import { prepareReaderArtifacts } from "./prepare-reader-artifacts.mjs";

test("linked source artifacts are copied as inert text without external or image links", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "reader-artifacts-"));
  try {
    execFileSync("git", ["init", "-q", root], { env: gitEnvironment(root), timeout: 30_000, stdio: ["ignore", "pipe", "pipe"] });
    await mkdir(path.join(root, "docs"), { recursive: true });
    await mkdir(path.join(root, "code"), { recursive: true });
    await mkdir(path.join(root, "github-pages"), { recursive: true });
    await writeFile(path.join(root, "code", "runner.mjs"), "export const value = 1;\n");
    await writeFile(path.join(root, "docs", "contract.json"), "{\"schema\":1}\n");
    await writeFile(
      path.join(root, "docs", "README.md"),
      [
        "[runner](../code/runner.mjs)",
        "[contract](contract.json#schema)",
        "[external](https://example.com/file.py)",
        "![image](figure.json)",
        "",
      ].join("\n"),
    );
    await writeFile(
      path.join(root, "github-pages", "public-artifacts.json"),
      `${JSON.stringify({ schema: 1, artifacts: ["code/runner.mjs", "docs/contract.json"] }, null, 2)}\n`,
    );
    execFileSync("git", ["add", "docs/README.md"], { cwd: root, env: gitEnvironment(root), timeout: 30_000, stdio: ["ignore", "pipe", "pipe"] });
    const outputRoot = path.join(root, "public", "repository-files");
    const prepared = await prepareReaderArtifacts({ repositoryRoot: root, outputRoot });
    assert.deepEqual(prepared.artifacts, ["code/runner.mjs", "docs/contract.json"]);
    assert.equal(
      await readFile(path.join(outputRoot, "code", "runner.mjs.txt"), "utf8"),
      "export const value = 1;\n",
    );
    assert.equal(
      await readFile(path.join(outputRoot, "docs", "contract.json.txt"), "utf8"),
      "{\"schema\":1}\n",
    );
    const manifest = JSON.parse(await readFile(path.join(outputRoot, "manifest.json"), "utf8"));
    assert.deepEqual(manifest, { schema: 1, artifacts: prepared.artifacts });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("linked source artifacts outside the explicit public allowlist remain uncopied", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "reader-artifacts-unlisted-"));
  try {
    execFileSync("git", ["init", "-q", root], { env: gitEnvironment(root), timeout: 30_000, stdio: ["ignore", "pipe", "pipe"] });
    await mkdir(path.join(root, "docs"), { recursive: true });
    await mkdir(path.join(root, "github-pages"), { recursive: true });
    await writeFile(path.join(root, "docs", "contract.json"), "{\"schema\":1}\n");
    await writeFile(path.join(root, "docs", "README.md"), "[contract](contract.json)\n");
    await writeFile(
      path.join(root, "github-pages", "public-artifacts.json"),
      `${JSON.stringify({ schema: 1, artifacts: [] }, null, 2)}\n`,
    );
    const outputRoot = path.join(root, "public", "repository-files");
    const prepared = await prepareReaderArtifacts({ repositoryRoot: root, outputRoot });
    assert.deepEqual(prepared.artifacts, []);
    const manifest = JSON.parse(await readFile(path.join(outputRoot, "manifest.json"), "utf8"));
    assert.deepEqual(manifest, { schema: 1, artifacts: [] });
    await assert.rejects(
      readFile(path.join(outputRoot, "docs", "contract.json.txt")),
      (error) => error?.code === "ENOENT",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("generated GitHub Pages Markdown is never rescanned as canonical source", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "reader-artifacts-pages-output-"));
  try {
    execFileSync("git", ["init", "-q", root], { env: gitEnvironment(root), timeout: 30_000, stdio: ["ignore", "pipe", "pipe"] });
    await writeFile(path.join(root, ".gitignore"), "dist-github-pages/\n");
    await mkdir(path.join(root, "dist-github-pages", "documents"), { recursive: true });
    await mkdir(path.join(root, "github-pages"), { recursive: true });
    await writeFile(
      path.join(root, "dist-github-pages", "documents", "generated.md"),
      "[generated-relative-link](assets/not-a-source.json)\n",
    );
    await writeFile(
      path.join(root, "github-pages", "public-artifacts.json"),
      `${JSON.stringify({ schema: 1, artifacts: [] }, null, 2)}\n`,
    );
    const prepared = await prepareReaderArtifacts({
      repositoryRoot: root,
      outputRoot: path.join(root, "public", "repository-files"),
    });
    assert.deepEqual(prepared.artifacts, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ignored local notes with missing targets and dangling links do not affect tracked reader artifacts", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "reader-artifacts-ignored-"));
  try {
    execFileSync("git", ["init", "-q", root], { env: gitEnvironment(root), timeout: 30_000, stdio: ["ignore", "pipe", "pipe"] });
    await writeFile(path.join(root, ".gitignore"), ".workingdir/\n");
    await mkdir(path.join(root, ".workingdir"));
    await writeFile(path.join(root, ".workingdir", "notes.md"), "[missing](missing.json)\n[dangling](dangling.json)\n");
    await symlink("missing.json", path.join(root, ".workingdir", "dangling.json"));
    await mkdir(path.join(root, "github-pages"));
    await writeFile(path.join(root, "contract.json"), "{\"schema\":1}\n");
    await writeFile(path.join(root, "README.md"), "[contract](contract.json)\n");
    await writeFile(path.join(root, "github-pages", "public-artifacts.json"),
      `${JSON.stringify({ schema: 1, artifacts: ["contract.json"] })}\n`);
    execFileSync("git", ["add", "README.md", "contract.json"], { cwd: root, env: gitEnvironment(root), timeout: 30_000, stdio: ["ignore", "pipe", "pipe"] });
    const outputRoot = path.join(root, "public", "repository-files");
    const prepared = await prepareReaderArtifacts({ repositoryRoot: root, outputRoot });
    assert.deepEqual(prepared.artifacts, ["contract.json"]);
    assert.equal(await readFile(path.join(outputRoot, "contract.json.txt"), "utf8"), "{\"schema\":1}\n");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("reader artifact collection excludes Markdown inside a custom output directory", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "reader-artifacts-custom-output-"));
  try {
    execFileSync("git", ["init", "-q", root], { env: gitEnvironment(root), timeout: 30_000, stdio: ["ignore", "pipe", "pipe"] });
    const outputRoot = path.join(root, "custom-output");
    await mkdir(outputRoot);
    await writeFile(path.join(outputRoot, "generated.md"), "[missing](missing.json)\n");
    await mkdir(path.join(root, "github-pages"));
    await writeFile(path.join(root, "github-pages", "public-artifacts.json"),
      `${JSON.stringify({ schema: 1, artifacts: [] })}\n`);
    const prepared = await prepareReaderArtifacts({ repositoryRoot: root, outputRoot });
    assert.deepEqual(prepared.artifacts, []);
    assert.deepEqual(JSON.parse(await readFile(path.join(outputRoot, "manifest.json"), "utf8")),
      { schema: 1, artifacts: [] });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
