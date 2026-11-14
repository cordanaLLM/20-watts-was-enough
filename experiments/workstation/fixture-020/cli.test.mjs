import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { cleanup, temporaryOutput } from "../lib/runner-test-helpers.mjs";

async function firstCompleteLine(file, child) {
  for (let attempt = 0; attempt < 600; attempt += 1) {
    try { if ((await readFile(file, "utf8")).includes("\n")) return; } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    assert.equal(child.exitCode, null, "child exited before its first complete record");
    await delay(50);
  }
  throw new Error("first record polling deadline exceeded");
}

test("SIGINT retains an ordinary in-flight world then stops at the next yield", { timeout: 60000 }, async () => {
  const fixture = await temporaryOutput("fixture-020-cli-cancel-");
  const child = spawn(process.execPath, ["experiments/workstation/fixture-020/runner.mjs", "run",
    "--profile", "development", "--output", fixture.output], { stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); if (stderr.length > 65536) child.kill("SIGKILL"); });
  const exited = new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); });
  const guard = setTimeout(() => child.kill("SIGKILL"), 55000);
  try {
    const rawPath = path.join(fixture.output, "raw-events.jsonl");
    await firstCompleteLine(rawPath, child);
    assert.equal(child.kill("SIGINT"), true);
    assert.equal(await exited, 1);
    assert.match(stderr, /execution interrupted.*cancelled/);
    const files = (await readdir(fixture.output)).filter((name) => /^interruption-\d+\.json$/.test(name));
    assert.equal(files.length, 1);
    const interruption = JSON.parse(await readFile(path.join(fixture.output, files[0]), "utf8"));
    const n = interruption.completed_worlds;
    assert.ok(n >= 1 && n < 64);
    assert.equal(files[0], `interruption-${n}.json`);
    assert.match(interruption.reason, /cancelled/);
    const raw = await readFile(rawPath, "utf8");
    assert.ok(raw.endsWith("\n"));
    const records = raw.trim().split("\n").map(JSON.parse);
    assert.equal(records.length, n);
    assert.ok(records.every((record) => record.execution_stop === null));
  } finally {
    clearTimeout(guard);
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await exited;
    await cleanup(fixture);
  }
});
