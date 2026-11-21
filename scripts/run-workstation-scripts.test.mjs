import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { KILL_GRACE_MS, runWorkstationScripts, signalProcessGroup } from "./run-workstation-scripts.mjs";

const runnerScript = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "run-workstation-scripts.mjs");
const HANG_MS = 60000;
const STARTUP_SAMPLES = 3;
// The deadline tests race the passing stub against the deadline that kills the hung one. Measured 2026-11-20
// on a 32-CPU host (issue 451), ratio = that stub's raced start-up / slowest of the three runner runs before
// it: through real npm up to 3.11 at load 19-26 and 11.92 beside the full gate (load 29-54, 700 runs).
// Through NPM_STAND_IN the worst beside the full gate was 0.44 for an `exit 0` stub and 1.19 for a node stub,
// so the margin of 6 covers the worst measured case five times.
const STARTUP_MARGIN = 6;
const SLOW_START_MS = 1200;
// Stands in for npm on PATH in the deadline tests: `npm run <name>` runs the stub command without npm's own
// start-up. The other tests keep real npm.
const NPM_STAND_IN = '#!/bin/sh\n[ "$#" -eq 2 ] && [ "$1" = run ] || exit 2\nexec sh "$(dirname "$0")/scripts/$2"\n';
const STAND_IN_DIRECTORY = "npm-stand-in";

function createStubWorkspace(scripts, { npmStandIn = false } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "workstation-runner-test-"));
  const packageJson = {
    name: "stub-workstation-tests",
    private: true,
    scripts,
  };
  fs.writeFileSync(path.join(directory, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
  if (npmStandIn) {
    const scriptDirectory = path.join(directory, STAND_IN_DIRECTORY, "scripts");
    fs.mkdirSync(scriptDirectory, { recursive: true });
    for (const [name, command] of Object.entries(scripts)) {
      fs.writeFileSync(path.join(scriptDirectory, name), `${command}\n`, "utf8");
    }
    fs.writeFileSync(path.join(directory, STAND_IN_DIRECTORY, "npm"), NPM_STAND_IN, { encoding: "utf8", mode: 0o755 });
  }
  return directory;
}

function standInEnv(dir, variables) {
  const env = { ...process.env, PATH: `${path.join(dir, STAND_IN_DIRECTORY)}${path.delimiter}${process.env.PATH}` };
  delete env.WORKSTATION_SCRIPT_TIMEOUT_MS;
  return { ...env, ...variables };
}

function measureStubStartupMs(dir, scriptName) {
  const env = standInEnv(dir, { SCRIPTS: scriptName });
  let baselineMs = 0;
  for (let sample = 0; sample < STARTUP_SAMPLES; sample += 1) {
    const started = Date.now();
    const result = spawnSync(process.execPath, [runnerScript], {
      cwd: dir,
      env,
      encoding: "utf8",
      timeout: HANG_MS,
    });
    baselineMs = Math.max(baselineMs, Date.now() - started);
    assert.strictEqual(result.status, 0, `startup sample for ${scriptName}: ${result.stdout}\n${result.stderr}`);
  }
  return baselineMs;
}

function stubDeadlineMs(t, baselineMs) {
  const deadlineMs = Math.ceil(baselineMs * STARTUP_MARGIN);
  if (2 * deadlineMs + KILL_GRACE_MS >= HANG_MS) {
    assert.fail(`UNDECIDED: host starved; measured baseline ${baselineMs} ms; deadline ${deadlineMs} ms; HANG_MS ${HANG_MS}`);
  }
  t.diagnostic(`stub baseline ${baselineMs} ms; deadline ${deadlineMs} ms`);
  return deadlineMs;
}

test("positive: runs two passing stub scripts in order", () => {
  const dir = createStubWorkspace({
    "test:workstation:pass-1": "node -e 'process.exit(0)'",
    "test:workstation:pass-2": "node -e 'process.exit(0)'",
  });
  try {
    const result = spawnSync(process.execPath, [runnerScript], {
      cwd: dir,
      env: { ...process.env, SCRIPTS: "test:workstation:pass-1 test:workstation:pass-2" },
      encoding: "utf8",
    });
    const output = `${result.stdout}\n${result.stderr}`;
    assert.strictEqual(result.status, 0);
    assert.match(output, /workstation script passed: test:workstation:pass-1/u);
    assert.match(output, /workstation script passed: test:workstation:pass-2/u);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("negative: one failing stub exits 1, names it, and later script still ran", () => {
  const dir = createStubWorkspace({
    "test:workstation:stub-fail": "node -e 'process.exit(42)'",
    "test:workstation:stub-later": "node -e 'process.exit(0)'",
  });
  const summaryFile = path.join(dir, "step-summary.md");
  try {
    const result = spawnSync(process.execPath, [runnerScript], {
      cwd: dir,
      env: {
        ...process.env,
        SCRIPTS: "test:workstation:stub-fail test:workstation:stub-later",
        GITHUB_STEP_SUMMARY: summaryFile,
      },
      encoding: "utf8",
    });
    const output = `${result.stdout}\n${result.stderr}`;
    assert.strictEqual(result.status, 1);
    assert.match(output, /workstation script failed: test:workstation:stub-fail \(exit 42\)/u);
    assert.match(output, /workstation script passed: test:workstation:stub-later/u);
    const lines = output.trim().split("\n");
    assert.match(lines.at(-1), /workstation scripts failed: test:workstation:stub-fail/u);

    assert.ok(fs.existsSync(summaryFile));
    const summary = fs.readFileSync(summaryFile, "utf8");
    assert.match(summary, /`test:workstation:stub-fail` \(exit 42\)/u);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("negative: unknown script in SCRIPTS exits 2 and runs nothing", () => {
  const dir = createStubWorkspace({
    "test:workstation:sentinel": "node -e 'require(\"fs\").writeFileSync(\"sentinel.txt\", \"ran\")'",
  });
  const sentinelPath = path.join(dir, "sentinel.txt");
  try {
    const result = spawnSync(process.execPath, [runnerScript], {
      cwd: dir,
      env: { ...process.env, SCRIPTS: "test:workstation:not-in-pkg test:workstation:sentinel" },
      encoding: "utf8",
    });
    const output = `${result.stdout}\n${result.stderr}`;
    assert.strictEqual(result.status, 2);
    assert.ok(!fs.existsSync(sentinelPath), "sentinel script must not have run");
    assert.match(output, /test:workstation:not-in-pkg/u);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("negative: malformed script name or excessive count exits 2", () => {
  const dir = createStubWorkspace({});
  try {
    const malformed = spawnSync(process.execPath, [runnerScript], {
      cwd: dir,
      env: { ...process.env, SCRIPTS: "invalid_script_name" },
      encoding: "utf8",
    });
    assert.strictEqual(malformed.status, 2);
    assert.match(`${malformed.stdout}\n${malformed.stderr}`, /invalid_script_name/u);

    const excessiveNames = Array.from({ length: 20 }, (_, idx) => `test:workstation:item-${idx}`).join(" ");
    const excessive = spawnSync(process.execPath, [runnerScript], {
      cwd: dir,
      env: { ...process.env, SCRIPTS: excessiveNames },
      encoding: "utf8",
    });
    assert.strictEqual(excessive.status, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function testScriptTimeout(t, passingCommand) {
  const dir = createStubWorkspace({
    "test:workstation:stub-hang": `node -e 'setTimeout(() => {}, ${HANG_MS})'`,
    "test:workstation:stub-after": passingCommand,
  }, { npmStandIn: true });
  try {
    const baselineMs = measureStubStartupMs(dir, "test:workstation:stub-after");
    const deadlineMs = stubDeadlineMs(t, baselineMs);
    const started = Date.now();
    const result = spawnSync(process.execPath, [runnerScript], {
      cwd: dir,
      env: standInEnv(dir, {
        SCRIPTS: "test:workstation:stub-hang test:workstation:stub-after",
        WORKSTATION_SCRIPT_TIMEOUT_MS: String(deadlineMs),
      }),
      encoding: "utf8",
      timeout: HANG_MS,
    });
    const output = `${result.stdout}\n${result.stderr}`;
    assert.strictEqual(result.status, 1);
    assert.ok(Date.now() - started < HANG_MS, "runner must not wait for the hung script");
    assert.match(output, /workstation script failed: test:workstation:stub-hang \(exit 124\)/u);
    assert.match(output, /workstation script passed: test:workstation:stub-after/u);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("negative: a script past its timeout is terminated and reported as exit 124", (t) => {
  testScriptTimeout(t, "exit 0");
});

test("boundary: a passing stub starting beyond the old 1000 ms limit survives the derived deadline", (t) => {
  testScriptTimeout(t, `node -e 'setTimeout(() => process.exit(0), ${SLOW_START_MS})'`);
});

test("boundary: single script execution succeeds", () => {
  const dir = createStubWorkspace({
    "test:workstation:single": "node -e 'process.exit(0)'",
  });
  try {
    const result = spawnSync(process.execPath, [runnerScript], {
      cwd: dir,
      env: { ...process.env, SCRIPTS: "test:workstation:single" },
      encoding: "utf8",
    });
    assert.strictEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /workstation script passed: test:workstation:single/u);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("negative: invalid timeout values exit 2 and run nothing", () => {
  const invalidValues = ["-1", "3000000000", "abc", "0"];
  for (const value of invalidValues) {
    const dir = createStubWorkspace({
      "test:workstation:sentinel": "node -e 'require(\"node:fs\").writeFileSync(\"sentinel.txt\", \"ran\")'",
    });
    const sentinelPath = path.join(dir, "sentinel.txt");
    try {
      const result = spawnSync(process.execPath, [runnerScript], {
        cwd: dir,
        env: {
          ...process.env,
          SCRIPTS: "test:workstation:sentinel",
          WORKSTATION_SCRIPT_TIMEOUT_MS: value,
        },
        encoding: "utf8",
      });
      const output = `${result.stdout}\n${result.stderr}`;
      assert.strictEqual(result.status, 2, `expected status 2 for timeout ${value}`);
      assert.ok(!fs.existsSync(sentinelPath), `sentinel script must not have run for timeout ${value}`);
      assert.match(
        output,
        new RegExp(`invalid WORKSTATION_SCRIPT_TIMEOUT_MS: ${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "u")
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("negative: a hung script whose descendant ignores SIGTERM is killed and the next script still passes", (t) => {
  const dir = createStubWorkspace({
    "test:workstation:stub-baseline": "node -e 'process.exit(0)'",
    "test:workstation:stub-descendant":
      `node -e "const { spawn } = require('node:child_process'); const fs = require('node:fs'); const child = spawn(process.execPath, ['-e', 'process.on(\\"SIGTERM\\",()=>{}); setTimeout(()=>{},${HANG_MS})'], { stdio: 'ignore' }); fs.writeFileSync('descendant.pid', String(child.pid)); setTimeout(()=>{}, ${HANG_MS});"`,
    "test:workstation:stub-next":
      "node -e \"const fs = require('node:fs'); const pid = Number(fs.readFileSync('descendant.pid', 'utf8')); if (!Number.isInteger(pid) || pid <= 1) process.exit(43); try { process.kill(pid, 0); process.exit(42); } catch (err) { process.exit(0); }\"",
  }, { npmStandIn: true });
  const pidPath = path.join(dir, "descendant.pid");
  try {
    const baselineMs = measureStubStartupMs(dir, "test:workstation:stub-baseline");
    const deadlineMs = stubDeadlineMs(t, baselineMs);
    const started = Date.now();
    const result = spawnSync(process.execPath, [runnerScript], {
      cwd: dir,
      env: standInEnv(dir, {
        SCRIPTS: "test:workstation:stub-descendant test:workstation:stub-next",
        WORKSTATION_SCRIPT_TIMEOUT_MS: String(deadlineMs),
      }),
      encoding: "utf8",
      timeout: HANG_MS,
    });
    const output = `${result.stdout}\n${result.stderr}`;
    assert.strictEqual(result.status, 1);
    assert.ok(Date.now() - started < HANG_MS, "runner must not wait for the hung script");
    assert.match(output, /workstation script failed: test:workstation:stub-descendant \(exit 124\)/u);
    assert.match(output, /workstation script passed: test:workstation:stub-next/u);
    assert.ok(fs.existsSync(pidPath), "descendant pid must have been recorded");
    const descendantPid = Number(fs.readFileSync(pidPath, "utf8"));
    assert.ok(Number.isInteger(descendantPid) && descendantPid > 1, "descendant pid must be an integer above 1");
    assert.throws(() => process.kill(descendantPid, 0), { code: "ESRCH" });
  } finally {
    if (fs.existsSync(pidPath)) {
      try {
        const descendantPid = Number(fs.readFileSync(pidPath, "utf8"));
        if (Number.isInteger(descendantPid) && descendantPid > 1) {
          process.kill(descendantPid, "SIGKILL");
        }
      } catch (cleanupError) {
        if (cleanupError?.code !== "ESRCH") {
          process.stderr.write(`cleanup failed: ${cleanupError?.message}\n`);
        }
      }
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("negative: win32 platform refusal logs reason and returns 2", async () => {
  const errors = [];
  const status = await runWorkstationScripts({
    platform: "win32",
    rawScripts: "test:workstation:stub",
    logError: (msg) => errors.push(msg),
  });
  assert.strictEqual(status, 2);
  assert.ok(
    errors.includes("workstation script runner supports POSIX process groups only; CI runs it on Linux"),
    "must log POSIX process groups only refusal"
  );
});

test("negative: process-group signals refuse pids that would reach other processes", () => {
  const sent = [];
  const recordKill = (target, signal) => sent.push([target, signal]);
  for (const pid of [1, 0, -1, -4242, 1.5, Number.NaN, "4242"]) {
    assert.throws(
      () => signalProcessGroup(pid, "SIGTERM", recordKill),
      /pid must be an integer above 1/u,
      `pid ${String(pid)} must be refused`,
    );
  }
  assert.deepStrictEqual(sent, [], "no signal may be sent for a refused pid");
});

test("boundary: process-group signals reach the group of pid 2 and skip an unspawned child", () => {
  const sent = [];
  const recordKill = (target, signal) => sent.push([target, signal]);
  signalProcessGroup(2, "SIGKILL", recordKill);
  signalProcessGroup(undefined, "SIGKILL", recordKill);
  assert.deepStrictEqual(sent, [[-2, "SIGKILL"]]);
});
