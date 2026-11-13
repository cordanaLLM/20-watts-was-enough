import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { gitEnvironment, listRepositoryFiles } from "./repository-inventory.mjs";

function git(root, arguments_) {
  return execFileSync("git", arguments_, {
    cwd: root, env: gitEnvironment(root), encoding: "utf8", timeout: 30_000,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

test("repository inventory sorts tracked and untracked files while excluding ignored directories", () => {
  const root = mkdtempSync(path.join(tmpdir(), "20w-inventory-"));
  try {
    git(root, ["init", "-q"]);
    mkdirSync(path.join(root, "ignored"));
    mkdirSync(path.join(root, "lib"));
    writeFileSync(path.join(root, ".gitignore"), "ignored/\n");
    writeFileSync(path.join(root, "ignored/local.cmd"), "");
    writeFileSync(path.join(root, "lib/z.json"), "{}");
    writeFileSync(path.join(root, "a.md"), "");
    git(root, ["add", ".gitignore", "lib/z.json"]);
    writeFileSync(path.join(root, ".gitignore"), "ignored/\nlib/z.json\n");
    assert.deepEqual(listRepositoryFiles(root), [".gitignore", "a.md", "lib/z.json"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("repository inventory drops tracked files deleted from disk", () => {
  const root = mkdtempSync(path.join(tmpdir(), "20w-inventory-deleted-"));
  try {
    git(root, ["init", "-q"]);
    writeFileSync(path.join(root, "deleted.json"), "{}");
    git(root, ["add", "deleted.json"]);
    assert.deepEqual(listRepositoryFiles(root), ["deleted.json"]);
    rmSync(path.join(root, "deleted.json"));
    assert.deepEqual(listRepositoryFiles(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("repository inventory accepts the entry limit and rejects one entry over it", () => {
  const root = mkdtempSync(path.join(tmpdir(), "20w-inventory-limit-"));
  try {
    git(root, ["init", "-q"]);
    for (const file of ["a.md", "b.md", "c.md"]) writeFileSync(path.join(root, file), "");
    assert.deepEqual(listRepositoryFiles(root, { maxEntries: 3 }), ["a.md", "b.md", "c.md"]);
    assert.throws(() => listRepositoryFiles(root, { maxEntries: 2 }), /exceeds 2 entries/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("repository inventory retains a dangling tracked symlink", { skip: process.platform === "win32" }, () => {
  const root = mkdtempSync(path.join(tmpdir(), "20w-inventory-symlink-"));
  try {
    git(root, ["init", "-q"]);
    symlinkSync("missing.md", path.join(root, "dangling.md"));
    git(root, ["add", "dangling.md"]);
    assert.deepEqual(listRepositoryFiles(root), ["dangling.md"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("repository inventory reports an unreadable tracked path", {
  skip: process.platform === "win32" || process.getuid?.() === 0,
}, () => {
  const root = mkdtempSync(path.join(tmpdir(), "20w-inventory-unreadable-"));
  const directory = path.join(root, "locked");
  try {
    git(root, ["init", "-q"]);
    mkdirSync(directory);
    writeFileSync(path.join(directory, "tracked.md"), "");
    git(root, ["add", "locked/tracked.md"]);
    chmodSync(directory, 0o000);
    assert.throws(() => listRepositoryFiles(root), /cannot inspect repository entry/u);
  } finally {
    if (existsSync(directory)) chmodSync(directory, 0o755);
    rmSync(root, { recursive: true, force: true });
  }
});

test("repository inventory rejects a non-Git directory with operation context", () => {
  const root = mkdtempSync(path.join(tmpdir(), "20w-inventory-no-git-"));
  try {
    assert.throws(() => listRepositoryFiles(root), { name: "Error", message: /^git ls-files failed:/u });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("repository inventory ignores an outer Git directory and index", () => {
  const root = mkdtempSync(path.join(tmpdir(), "20w-inventory-inner-"));
  const outer = mkdtempSync(path.join(tmpdir(), "20w-inventory-outer-"));
  const originalGitDir = process.env.GIT_DIR;
  const originalGitIndexFile = process.env.GIT_INDEX_FILE;
  try {
    git(root, ["init", "-q"]);
    git(outer, ["init", "-q"]);
    writeFileSync(path.join(root, "inner.md"), "");
    writeFileSync(path.join(outer, "outer.md"), "");
    process.env.GIT_DIR = path.join(outer, ".git");
    process.env.GIT_INDEX_FILE = path.join(outer, ".git", "index");
    git(root, ["add", "inner.md"]);
    assert.deepEqual(listRepositoryFiles(root), ["inner.md"]);
    assert.equal(git(outer, ["ls-files"]), "");
    assert.equal(existsSync(path.join(outer, ".git", "index")), false);
  } finally {
    if (originalGitDir === undefined) delete process.env.GIT_DIR;
    else process.env.GIT_DIR = originalGitDir;
    if (originalGitIndexFile === undefined) delete process.env.GIT_INDEX_FILE;
    else process.env.GIT_INDEX_FILE = originalGitIndexFile;
    rmSync(root, { recursive: true, force: true });
    rmSync(outer, { recursive: true, force: true });
  }
});
