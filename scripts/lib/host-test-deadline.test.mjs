import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { hostDeadlineFailure, testWithHostDeadline } from "./host-test-deadline.mjs";

test("wall failure becomes UNDECIDED only above the stated load boundary", () => {
  for (const load of [0, 2]) {
    assert.equal(hostDeadlineFailure(300_000, load).message.startsWith("UNDECIDED"), false);
  }
  assert.match(hostDeadlineFailure(300_000, 2.01).message, /^UNDECIDED: host starved; test exceeded 300000 wall ms/u);
});

testWithHostDeadline("a completed test clears its host deadline", { timeout: 5_000 }, async () => {
  assert.equal(await Promise.resolve(42), 42);
});

test("deadline cancellation remains a failing node:test result", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "20w-host-deadline-"));
  try {
    const fixture = path.join(directory, "deadline.test.mjs");
    await writeFile(fixture, `import { testWithHostDeadline } from ${JSON.stringify(new URL("./host-test-deadline.mjs", import.meta.url).href)};
      testWithHostDeadline("deadline fixture", { timeout: 1 }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
      });`);
    const environment = { ...process.env };
    delete environment.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, ["--test", fixture], { encoding: "utf8", timeout: 20_000, maxBuffer: 65_536, env: environment });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout + result.stderr, /test exceeded 1 wall ms; load per available CPU/u);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});
