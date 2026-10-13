import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFile, mkdtemp, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  acquireExclusiveFileLock,
  parseLockOwner,
  replaceFilePair,
} from "./atomic-file-pair.mjs";

test("paired replacement publishes both staged files", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "20w-atomic-pair-success-"));
  try {
    const first = { staged: path.join(root, "first.new"), destination: path.join(root, "first") };
    const second = { staged: path.join(root, "second.new"), destination: path.join(root, "second") };
    await Promise.all([
      writeFile(first.destination, "old first"),
      writeFile(second.destination, "old second"),
      writeFile(first.staged, "new first"),
      writeFile(second.staged, "new second"),
    ]);

    await replaceFilePair([first, second]);

    assert.equal(await readFile(first.destination, "utf8"), "new first");
    assert.equal(await readFile(second.destination, "utf8"), "new second");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("paired replacement restores both prior files when the second publish fails", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "20w-atomic-pair-failure-"));
  try {
    const first = { staged: path.join(root, "first.new"), destination: path.join(root, "first") };
    const second = { staged: path.join(root, "second.new"), destination: path.join(root, "second") };
    await Promise.all([
      writeFile(first.destination, "old first"),
      writeFile(second.destination, "old second"),
      writeFile(first.staged, "new first"),
      writeFile(second.staged, "new second"),
    ]);
    let renameCalls = 0;
    const operations = {
      copyFile,
      rm,
      rename: async (...arguments_) => {
        renameCalls += 1;
        if (renameCalls === 2) throw new Error("simulated second publish failure");
        await rename(...arguments_);
      },
    };

    await assert.rejects(
      replaceFilePair([first, second], operations),
      /simulated second publish failure/u,
    );

    assert.equal(await readFile(first.destination, "utf8"), "old first");
    assert.equal(await readFile(second.destination, "utf8"), "old second");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("paired replacement rejects a symlinked destination before publication", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "20w-atomic-pair-symlink-"));
  try {
    const target = path.join(root, "target");
    const first = { staged: path.join(root, "first.new"), destination: path.join(root, "first") };
    const second = { staged: path.join(root, "second.new"), destination: path.join(root, "second") };
    await Promise.all([
      writeFile(target, "old first"),
      writeFile(first.staged, "new first"),
      writeFile(second.staged, "new second"),
      writeFile(second.destination, "old second"),
    ]);
    await symlink(target, first.destination);
    await assert.rejects(
      replaceFilePair([first, second]),
      /regular non-symlink file/u,
    );
    assert.equal(await readFile(target, "utf8"), "old first");
    assert.equal(await readFile(second.destination, "utf8"), "old second");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("exclusive publication lock rejects overlap and is reusable after release", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "20w-publication-lock-"));
  try {
    const file = path.join(root, "book.lock");
    const first = await acquireExclusiveFileLock(file, "book render");
    await assert.rejects(
      acquireExclusiveFileLock(file, "book render"),
      /already locked/u,
    );
    await first.release();
    const next = await acquireExclusiveFileLock(file, "book render");
    await next.release();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function exitedProcessId() {
  const child = spawnSync(process.execPath, ["-e", ""], { timeout: 30_000 });
  assert.equal(child.status, 0);
  return child.pid;
}

const lockOwner = (pid, host, token = "token") => `pid=${pid}\nhost=${host}\ntoken=${token}\n`;

test("exclusive publication lock recovers a lock whose owner process exited", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "20w-publication-lock-"));
  try {
    const file = path.join(root, "book.lock");
    await writeFile(file, lockOwner(exitedProcessId(), os.hostname(), "stale"));
    const lock = await acquireExclusiveFileLock(file, "book render");
    assert.equal(parseLockOwner(await readFile(file, "utf8"))?.pid, process.pid);
    await lock.release();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("exclusive publication lock keeps every lock it cannot prove stale", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "20w-publication-lock-"));
  try {
    const kept = {
      "running parent process": lockOwner(process.ppid, os.hostname()),
      "this process": lockOwner(process.pid, os.hostname()),
      "exited owner elsewhere": lockOwner(exitedProcessId(), `${os.hostname()}-other`),
      "earlier pid and identity record": `${exitedProcessId()} 0123\n`,
      "oversized record": "x".repeat(4097),
    };
    for (const [name, body] of Object.entries(kept)) {
      const file = path.join(root, `${name.replaceAll(" ", "-")}.lock`);
      await writeFile(file, body);
      await assert.rejects(acquireExclusiveFileLock(file, "book render"), /already locked/u, name);
      assert.equal(await readFile(file, "utf8"), body, name);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("lock owner records match the Go renderer format exactly", () => {
  assert.deepEqual(parseLockOwner(lockOwner(1, "host")), { pid: 1, host: "host" });
  for (const body of [
    lockOwner(0, "host"), lockOwner("-1", "host"), lockOwner("+1", "host"), lockOwner("01", "host"),
    lockOwner(1, ""), lockOwner(1, "host", ""), `${lockOwner(1, "host")}extra=1\n`,
    "host=host\npid=1\ntoken=token\n", lockOwner(1, "host").slice(0, -1),
  ]) {
    assert.equal(parseLockOwner(body), undefined, JSON.stringify(body));
  }
});
