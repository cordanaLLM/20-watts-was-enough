import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { releaseStepRun, releaseStepRunPattern } from "./validate-engineering-policy.mjs";

test("release step script run form executes scripts from WORKFLOW_SHA on older tag checkout", () => {
  const probeRunForm = releaseStepRun("scripts/release/probe.sh");
  assert.match(probeRunForm, releaseStepRunPattern);
  assert.equal(
    probeRunForm,
    'script="$(git show "${WORKFLOW_SHA}:scripts/release/probe.sh")"\nbash -c "$script"',
  );

  const missingRunForm = releaseStepRun("scripts/release/missing.sh");
  assert.match(missingRunForm, releaseStepRunPattern);

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "release-step-scripts-test-"));
  try {
    const originDir = path.join(tempDir, "origin");
    fs.mkdirSync(originDir);

    const gitOrigin = (args, options = {}) =>
      execFileSync("git", args, { cwd: originDir, timeout: 30000, ...options });

    gitOrigin(["init", "-b", "main"]);
    fs.writeFileSync(path.join(originDir, "README.md"), "# repo\n", "utf8");
    gitOrigin(["add", "."]);
    gitOrigin([
      "-c",
      "user.name=t",
      "-c",
      "user.email=t@t",
      "-c",
      "commit.gpgSign=false",
      "commit",
      "-m",
      "commit A",
    ]);
    gitOrigin(["-c", "tag.gpgSign=false", "tag", "v0.0.1"]);
    const commitASha = gitOrigin(["rev-parse", "HEAD"], { encoding: "utf8" }).trim();

    fs.mkdirSync(path.join(originDir, "scripts", "release"), { recursive: true });
    fs.writeFileSync(
      path.join(originDir, "scripts", "release", "probe.sh"),
      "#!/usr/bin/env bash\necho probe-ran\n",
      { encoding: "utf8", mode: 0o755 },
    );
    gitOrigin(["add", "."]);
    gitOrigin([
      "-c",
      "user.name=t",
      "-c",
      "user.email=t@t",
      "-c",
      "commit.gpgSign=false",
      "commit",
      "-m",
      "commit B",
    ]);
    const commitBSha = gitOrigin(["rev-parse", "HEAD"], { encoding: "utf8" }).trim();

    const cloneDir = path.join(tempDir, "clone");
    execFileSync("git", ["clone", "--no-local", originDir, cloneDir], { timeout: 30000 });

    const gitClone = (args, options = {}) =>
      execFileSync("git", args, { cwd: cloneDir, timeout: 30000, ...options });

    gitClone(["fetch", "--tags", "origin", "+refs/heads/*:refs/remotes/origin/*"]);
    gitClone(["checkout", "v0.0.1"]);

    const stdout = execFileSync("bash", ["-e", "-o", "pipefail", "-c", probeRunForm], {
      cwd: cloneDir,
      env: { ...process.env, WORKFLOW_SHA: commitBSha },
      encoding: "utf8",
      timeout: 30000,
    });
    assert.match(stdout, /probe-ran/);

    assert.throws(
      () => {
        execFileSync("bash", ["-e", "-o", "pipefail", "-c", missingRunForm], {
          cwd: cloneDir,
          env: { ...process.env, WORKFLOW_SHA: commitBSha },
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 30000,
        });
      },
      (error) => {
        assert.notEqual(error.status, 0);
        assert.doesNotMatch(String(error.stdout || ""), /probe-ran/);
        return true;
      },
    );

    assert.throws(
      () => {
        execFileSync("bash", ["-e", "-o", "pipefail", "-c", probeRunForm], {
          cwd: cloneDir,
          env: { ...process.env, WORKFLOW_SHA: commitASha },
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 30000,
        });
      },
      (error) => {
        assert.notEqual(error.status, 0);
        return true;
      },
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
