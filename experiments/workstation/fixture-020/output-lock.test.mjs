import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import test from "node:test";
import { acquireLock } from "../lib/output-lock.mjs";
import { cleanup, temporaryOutput } from "../lib/runner-test-helpers.mjs";

test("shared fixture-019 lock keeps its path, document bytes and ownership error", async () => {
  const fixture = await temporaryOutput("fixture-020-shared-lock-");
  const file = `${fixture.output}.fixture-019.lock`;
  const lock = await acquireLock(fixture.output, "fixture-019");
  const original = await readFile(file, "utf8");
  try {
    assert.match(original, /^\{"schema":1,"artifact":"fixture-019","token_sha256":"[0-9a-f]{64}"\}\n$/);
    await assert.rejects(() => acquireLock(fixture.output, "fixture-019"), { code: "EEXIST" });
    const forged = JSON.parse(original);
    forged.token_sha256 = "f".repeat(64);
    await writeFile(file, `${JSON.stringify(forged)}\n`);
    await assert.rejects(() => lock.release(), { message: "Fixture 019 lock ownership changed." });
    assert.equal(await readFile(file, "utf8"), `${JSON.stringify(forged)}\n`);
  } finally {
    await writeFile(file, original);
    await lock.release();
    await cleanup(fixture);
  }
  await assert.rejects(() => readFile(file), /ENOENT/);
});
