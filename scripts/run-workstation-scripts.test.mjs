import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { runWorkstationScripts } from "./run-workstation-scripts.mjs";

const runnerScript = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "run-workstation-scripts.mjs");

function createStubWorkspace(scripts) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "workstation-runner-test-"));
  const packageJson = {
    name: "stub-workstation-tests",
    private: true,
    scripts,
  };
  fs.writeFileSync(path.join(directory, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
  return directory;
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

test("negative: a script past its timeout is terminated and reported as exit 124", () => {
  const dir = createStubWorkspace({
    "test:workstation:stub-hang": "node -e 'setTimeout(() => {}, 60000)'",
    "test:workstation:stub-after": "node -e 'process.exit(0)'",
  });
  try {
    const started = Date.now();
    const result = spawnSync(process.execPath, [runnerScript], {
      cwd: dir,
      env: {
        ...process.env,
        SCRIPTS: "test:workstation:stub-hang test:workstation:stub-after",
        WORKSTATION_SCRIPT_TIMEOUT_MS: "1000",
      },
      encoding: "utf8",
      timeout: 30000,
    });
    const output = `${result.stdout}\n${result.stderr}`;
    assert.strictEqual(result.status, 1);
    assert.ok(Date.now() - started < 30000, "runner must not wait for the hung script");
    assert.match(output, /workstation script failed: test:workstation:stub-hang \(exit 124\)/u);
    assert.match(output, /workstation script passed: test:workstation:stub-after/u);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
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

test("negative: a hung script whose descendant ignores SIGTERM is killed and the next script still passes", () => {
  const dir = createStubWorkspace({
    "test:workstation:stub-descendant":
      "node -e \"const { spawn } = require('node:child_process'); const fs = require('node:fs'); const child = spawn(process.execPath, ['-e', 'process.on(\\\"SIGTERM\\\",()=>{}); setTimeout(()=>{},60000)'], { stdio: 'ignore' }); fs.writeFileSync('descendant.pid', String(child.pid)); setTimeout(()=>{}, 60000);\"",
    "test:workstation:stub-next":
      "node -e \"const fs = require('node:fs'); const pid = Number(fs.readFileSync('descendant.pid', 'utf8')); try { process.kill(pid, 0); process.exit(42); } catch (err) { process.exit(0); }\"",
  });
  const pidPath = path.join(dir, "descendant.pid");
  try {
    const started = Date.now();
    const result = spawnSync(process.execPath, [runnerScript], {
      cwd: dir,
      env: {
        ...process.env,
        SCRIPTS: "test:workstation:stub-descendant test:workstation:stub-next",
        WORKSTATION_SCRIPT_TIMEOUT_MS: "1000",
      },
      encoding: "utf8",
      timeout: 30000,
    });
    const output = `${result.stdout}\n${result.stderr}`;
    assert.strictEqual(result.status, 1);
    assert.ok(Date.now() - started < 30000, "runner must not wait for the hung script");
    assert.match(output, /workstation script failed: test:workstation:stub-descendant \(exit 124\)/u);
    assert.match(output, /workstation script passed: test:workstation:stub-next/u);
    assert.ok(fs.existsSync(pidPath), "descendant pid must have been recorded");
    const descendantPid = Number(fs.readFileSync(pidPath, "utf8"));
    assert.throws(() => process.kill(descendantPid, 0), { code: "ESRCH" });
  } finally {
    if (fs.existsSync(pidPath)) {
      try {
        const descendantPid = Number(fs.readFileSync(pidPath, "utf8"));
        process.kill(descendantPid, "SIGKILL");
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
