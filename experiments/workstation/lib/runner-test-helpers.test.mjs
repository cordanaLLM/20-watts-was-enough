import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  assertCliOptionRejections,
  assertDeterministicSmokeExecution,
  assertReleaseExecutionRequiresDigest,
  releaseEnvironment,
  releaseIdentityMismatches,
} from "./runner-test-helpers.mjs";

test("releaseEnvironment produces valid default and artifact-specific configs", () => {
  const def = releaseEnvironment();
  assert.equal(def.EXPERIMENT_ARTIFACT, "fixture-019");
  assert.equal(def.EXPERIMENT_IMAGE_NAME, "ghcr.io/cordanallm/20-watts-was-enough-fixture-019");
  assert.equal(def.EXPERIMENT_IMAGE_VERSION, "v1.2.3");
  assert.equal(def.EXPERIMENT_SOURCE_REVISION.length, 40);
  assert.equal(def.EXPERIMENT_RESULT_AUTHORITY, "NO_RESULT");
  assert.match(def.EXPERIMENT_IMAGE_DIGEST, /^sha256:[0-9a-f]{64}$/);

  const custom = releaseEnvironment("fixture-007");
  assert.equal(custom.EXPERIMENT_ARTIFACT, "fixture-007");
  assert.equal(custom.EXPERIMENT_IMAGE_NAME, "ghcr.io/cordanallm/20-watts-was-enough-fixture-007");
});

test("releaseIdentityMismatches creates four single-field divergences", () => {
  const env = releaseEnvironment("fixture-007");
  const mismatches = releaseIdentityMismatches(env);
  assert.equal(mismatches.length, 4);

  assert.equal(mismatches[0].EXPERIMENT_IMAGE_NAME, `${env.EXPERIMENT_IMAGE_NAME}-other`);
  assert.equal(mismatches[1].EXPERIMENT_IMAGE_VERSION, "v1.2.4");
  assert.equal(mismatches[2].EXPERIMENT_SOURCE_REVISION, "c".repeat(40));
  assert.equal(mismatches[3].EXPERIMENT_IMAGE_DIGEST, `sha256:${"d".repeat(64)}`);
});

test("assertCliOptionRejections validates expected rejections for CLI arguments", async () => {
  const calls = [];
  const mockMain = async (argv) => {
    calls.push(argv);
    if (argv[2] === "smoke" && !argv.includes("--output")) {
      throw new Error("smoke requires --output.");
    }
    if (argv[2] === "prepare" && argv.includes("--oracle")) {
      throw new Error("Unknown or duplicate option --oracle.");
    }
    return true;
  };

  await assertCliOptionRejections(mockMain);
  assert.equal(calls.length, 2);
});

test("assertCliOptionRejections fails when CLI does not reject missing output or unknown option", async () => {
  const passingMain = async () => true;
  await assert.rejects(() => assertCliOptionRejections(passingMain));

  const onlyOutputRejection = async (argv) => {
    if (argv[2] === "smoke" && !argv.includes("--output")) {
      throw new Error("smoke requires --output.");
    }
    return true;
  };
  await assert.rejects(() => assertCliOptionRejections(onlyOutputRejection));
});

test("assertReleaseExecutionRequiresDigest verifies release failures and absence of run.json", async () => {
  const tempDir = await mkdtemp(path.join(process.cwd(), "tmp-test-helpers-"));
  const outputDir = path.join(tempDir, "run");

  const mockExecute = async () => {
    throw new Error("A release experiment image requires EXPERIMENT_IMAGE_DIGEST=sha256:...");
  };
  const mockMain = async () => {
    throw new Error("A release experiment image requires EXPERIMENT_IMAGE_DIGEST=sha256:...");
  };

  try {
    await assertReleaseExecutionRequiresDigest({
      execute: mockExecute,
      main: mockMain,
      environment: {},
      output: outputDir,
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("assertReleaseExecutionRequiresDigest fails if run.json exists or execution does not throw", async () => {
  const tempDir = await mkdtemp(path.join(process.cwd(), "tmp-test-helpers-fail-"));
  const outputDir = path.join(tempDir, "run");
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "run.json"), "{}");

  const mockExecute = async () => {
    throw new Error("A release experiment image requires EXPERIMENT_IMAGE_DIGEST=sha256:...");
  };
  const mockMain = async () => {
    throw new Error("A release experiment image requires EXPERIMENT_IMAGE_DIGEST=sha256:...");
  };

  try {
    // Fails because run.json exists (ENOENT rejection fails)
    await assert.rejects(() => assertReleaseExecutionRequiresDigest({
      execute: mockExecute,
      main: mockMain,
      environment: {},
      output: outputDir,
    }));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("assertDeterministicSmokeExecution passes when runs yield identical event logs", async () => {
  const tempDir = await mkdtemp(path.join(process.cwd(), "tmp-test-helpers-det-"));
  const leftDir = path.join(tempDir, "left");
  const rightDir = path.join(tempDir, "right");
  await mkdir(leftDir, { recursive: true });
  await mkdir(rightDir, { recursive: true });

  const profiles = [];
  const mockExecute = async ({ profile, output }) => {
    profiles.push(profile);
    await writeFile(path.join(output, "raw-events.jsonl"), '{"event":1}\n');
  };

  try {
    await assertDeterministicSmokeExecution(mockExecute, leftDir, rightDir);
    assert.deepEqual(profiles, ["smoke", "smoke"]);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("assertDeterministicSmokeExecution rejects when runs diverge", async () => {
  const tempDir = await mkdtemp(path.join(process.cwd(), "tmp-test-helpers-diverge-"));
  const leftDir = path.join(tempDir, "left");
  const rightDir = path.join(tempDir, "right");
  await mkdir(leftDir, { recursive: true });
  await mkdir(rightDir, { recursive: true });

  let counter = 0;
  const divergingExecute = async ({ output }) => {
    counter += 1;
    await writeFile(path.join(output, "raw-events.jsonl"), `{"event":${counter}}\n`);
  };

  try {
    await assert.rejects(
      () => assertDeterministicSmokeExecution(divergingExecute, leftDir, rightDir),
      assert.AssertionError,
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
