import assert from "node:assert/strict";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  assertCheckpointSchemaRejections,
  assertCliExecutionRejections,
  assertCliOptionRejections,
  assertDeterministicSmokeExecution,
  assertReleaseExecutionRequiresDigest,
  assertResumeMatchesUninterruptedExecution,
  cleanup,
  cleanupSymlinkFixture,
  corruptRawEventsFirstRow,
  duplicateJsonlRow,
  rehashCheckpoint,
  releaseEnvironment,
  releaseIdentityMismatches,
  swapJsonlRows,
  tearJsonlFile,
  temporaryOutput,
  writeRehashedCheckpoint,
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

test("corruptRawEventsFirstRow mutates the first row with default loss increment and keeps trailing newline", async () => {
  const tempDir = await mkdtemp(path.join(process.cwd(), "tmp-corrupt-raw-"));
  try {
    const rawPath = path.join(tempDir, "raw-events.jsonl");
    const row1 = { id: 1, loss: 0.5 };
    const row2 = { id: 2, loss: 0.8 };
    await writeFile(rawPath, `${JSON.stringify(row1)}\n${JSON.stringify(row2)}\n`);

    await corruptRawEventsFirstRow(tempDir);

    const content = await readFile(rawPath, "utf8");
    assert.ok(content.endsWith("\n"));
    const rows = content.trimEnd().split("\n").map(JSON.parse);
    assert.equal(rows.length, 2);
    assert.equal(Math.abs(rows[0].loss - 0.6) < 1e-9, true);
    assert.equal(rows[1].loss, 0.8);
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

test("corruptRawEventsFirstRow accepts a custom mutator callback", async () => {
  const tempDir = await mkdtemp(path.join(process.cwd(), "tmp-corrupt-custom-"));
  try {
    const rawPath = path.join(tempDir, "raw-events.jsonl");
    await writeFile(rawPath, `${JSON.stringify({ value: 10 })}\n`);

    await corruptRawEventsFirstRow(tempDir, (record) => {
      record.value = 99;
    });

    const rows = (await readFile(rawPath, "utf8")).trimEnd().split("\n").map(JSON.parse);
    assert.equal(rows[0].value, 99);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("corruptRawEventsFirstRow rejects on missing directory or non-existent raw-events.jsonl", async () => {
  const tempDir = await mkdtemp(path.join(process.cwd(), "tmp-corrupt-missing-"));
  try {
    await assert.rejects(() => corruptRawEventsFirstRow(tempDir), /ENOENT/u);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("temporaryOutput and cleanup manage frozen directory fixtures under tmp", async () => {
  const fixture1 = await temporaryOutput("test-helper-tmp-1-");
  const fixture2 = await temporaryOutput("test-helper-tmp-2-");
  assert.ok(Object.isFrozen(fixture1));
  assert.equal(fixture1.output, path.join(fixture1.parent, "run"));
  assert.ok(fixture1.parent.startsWith(path.join(process.cwd(), "tmp")));

  await writeFile(path.join(fixture1.parent, "marker.txt"), "ok");
  await writeFile(path.join(fixture2.parent, "marker.txt"), "ok");

  await cleanup(fixture1, fixture2);
  await assert.rejects(() => readFile(path.join(fixture1.parent, "marker.txt")), /ENOENT/u);
  await assert.rejects(() => readFile(path.join(fixture2.parent, "marker.txt")), /ENOENT/u);
});

test("cleanup fails closed when fixture parent is outside the temporary root", async () => {
  const unsafeFixture = { parent: "/var/tmp/unsafe-escape" };
  await assert.rejects(() => cleanup(unsafeFixture), assert.AssertionError);
  await assert.rejects(() => cleanup({}), TypeError);
  const many = Array.from({ length: 33 }, () => ({ parent: path.join(process.cwd(), "tmp", "never-created") }));
  await assert.rejects(() => cleanup(...many), /at most 32 fixtures/);
});

test("assertResumeMatchesUninterruptedExecution validates clean resume reproducibility", async () => {
  const resumed = await temporaryOutput("test-helper-resume-resumed-");
  const complete = await temporaryOutput("test-helper-resume-complete-");
  try {
    await mkdir(resumed.output, { recursive: true });
    await mkdir(complete.output, { recursive: true });

    const mockExecute = async (options) => {
      if (options.maxWorkUnits) {
        await writeFile(path.join(options.output, "raw-events.jsonl"), '{"step":1}\n');
        await writeFile(path.join(options.output, "checkpoint.json"), '{"step":1}\n');
        return { complete: false, extra: "checked" };
      }
      if (options.resume) {
        await writeFile(path.join(options.output, "raw-events.jsonl"), '{"step":1}\n{"step":2}\n');
        await writeFile(path.join(options.output, "checkpoint.json"), '{"step":2}\n');
        return { complete: true, extra: "checked" };
      }
      await writeFile(path.join(options.output, "raw-events.jsonl"), '{"step":1}\n{"step":2}\n');
      await writeFile(path.join(options.output, "checkpoint.json"), '{"step":2}\n');
      return { complete: true, extra: "checked" };
    };

    let checkedCount = 0;
    const extraChecks = (result) => {
      assert.equal(result.extra, "checked");
      checkedCount += 1;
    };

    await assertResumeMatchesUninterruptedExecution({
      execute: mockExecute,
      resumed,
      complete,
      extraChecks,
    });
    assert.equal(checkedCount, 2);
  } finally {
    await cleanup(resumed, complete);
  }
});

test("assertResumeMatchesUninterruptedExecution rejects when execution diverges or fails contract", async () => {
  const resumed = await temporaryOutput("test-helper-diverge-resumed-");
  const complete = await temporaryOutput("test-helper-diverge-complete-");
  try {
    await mkdir(resumed.output, { recursive: true });
    await mkdir(complete.output, { recursive: true });

    const prematureCompleteExecute = async (options) => {
      if (options.maxWorkUnits) return { complete: true };
      return { complete: true };
    };

    await assert.rejects(
      () => assertResumeMatchesUninterruptedExecution({
        execute: prematureCompleteExecute,
        resumed,
        complete,
      }),
      assert.AssertionError,
    );

    const stalledResumeExecute = async () => ({ complete: false });
    await assert.rejects(
      () => assertResumeMatchesUninterruptedExecution({
        execute: stalledResumeExecute,
        resumed,
        complete,
      }),
      assert.AssertionError,
    );
  } finally {
    await cleanup(resumed, complete);
  }
});

test("assertCliExecutionRejections validates expected rejections for CLI partition and options", async () => {
  const createMockMain = (allowConfirmation = false) => async (argv) => {
    if (!allowConfirmation && argv[2] === "confirmation") {
      throw new Error("private partitions are not executable.");
    }
    if (argv[2] === "smoke" && !argv.includes("--output")) {
      throw new Error("smoke requires --output.");
    }
    if (argv[2] === "prepare" && argv.includes("--seeds")) {
      throw new Error("Unknown or duplicate option --seeds.");
    }
    return true;
  };

  const confirmationPattern = /private partitions are not executable/;
  await assertCliExecutionRejections({ main: createMockMain(false), confirmationPattern });

  await assert.rejects(
    () => assertCliExecutionRejections({ main: createMockMain(true), confirmationPattern }),
    assert.AssertionError,
  );
  await assert.rejects(
    () => assertCliExecutionRejections({
      main: createMockMain(false),
      confirmationPattern: /confirmation and transfer are inaccessible/,
    }),
    assert.AssertionError,
  );
});

test("rehashCheckpoint recomputes checkpoint_sha256 digest over stripped body", () => {
  const original = {
    schema: 1,
    artifact: "fixture-019",
    records: 1,
    checkpoint_sha256: "stale-hash",
  };
  const rehashed = rehashCheckpoint(original);
  assert.notEqual(rehashed.checkpoint_sha256, "stale-hash");
  assert.match(rehashed.checkpoint_sha256, /^[0-9a-f]{64}$/);
  assert.equal(rehashed.records, 1);
  assert.equal(rehashed, original);
  assert.deepEqual(Object.keys(rehashed), ["schema", "artifact", "records", "checkpoint_sha256"]);

  const custom = rehashCheckpoint({ ...original, checkpoint_sha256: "stale-hash" }, {
    hash: (data) => `mock:${data}`,
    canonical: (obj) => JSON.stringify(obj),
  });
  assert.equal(custom.checkpoint_sha256, 'mock:{"schema":1,"artifact":"fixture-019","records":1}');
});

test("writeRehashedCheckpoint mutates and writes checkpoint to disk", async () => {
  const tempDir = await mkdtemp(path.join(process.cwd(), "tmp-rehash-write-"));
  try {
    const checkpointPath = path.join(tempDir, "checkpoint.json");
    await writeFile(checkpointPath, `${JSON.stringify({ schema: 1, records: 1 })}\n`);

    await writeRehashedCheckpoint(checkpointPath, (checkpoint) => {
      checkpoint.records += 1;
    });
    const written = JSON.parse(await readFile(checkpointPath, "utf8"));
    assert.equal(written.records, 2);
    assert.match(written.checkpoint_sha256, /^[0-9a-f]{64}$/);

    await writeRehashedCheckpoint(checkpointPath, { schema: 1, records: 5 });
    const direct = JSON.parse(await readFile(checkpointPath, "utf8"));
    assert.equal(direct.records, 5);
    assert.match(direct.checkpoint_sha256, /^[0-9a-f]{64}$/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("assertCheckpointSchemaRejections iterates mutations, asserts rejections, and leaves the last mutation on disk", async () => {
  const tempDir = await mkdtemp(path.join(process.cwd(), "tmp-schema-rejections-"));
  try {
    const checkpointPath = path.join(tempDir, "checkpoint.json");
    const baseline = { schema: 1, records: 1, claim_eligible: false };
    await writeFile(checkpointPath, `${JSON.stringify(baseline, null, 2)}\n`);

    const observedMutations = [];
    await assertCheckpointSchemaRejections({
      checkpointPath,
      assertRejection: async () => {
        const current = JSON.parse(await readFile(checkpointPath, "utf8"));
        observedMutations.push(current);
        if (current.claim_eligible !== true && current.records !== "1") {
          throw new Error("expected mutation");
        }
      },
    });

    assert.equal(observedMutations.length, 2);
    assert.equal(observedMutations[0].claim_eligible, true);
    assert.equal(observedMutations[1].records, "1");

    const last = JSON.parse(await readFile(checkpointPath, "utf8"));
    assert.equal(last.records, "1");
    assert.equal(last.claim_eligible, false);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("cleanupSymlinkFixture safely cleans junction, parent, and outside directories", async () => {
  const tempDir = await mkdtemp(path.join(process.cwd(), "tmp-cleanup-symlink-"));
  const parent = path.join(tempDir, "parent");
  const outside = path.join(tempDir, "outside");
  const junction = path.join(tempDir, "standalone-link");
  await mkdir(parent, { recursive: true });
  await mkdir(outside, { recursive: true });
  await symlink(outside, junction, "junction");
  try {
    await cleanupSymlinkFixture({ junction, parent, outside });

    await assert.rejects(() => lstat(junction), /ENOENT/u);
    await assert.rejects(() => stat(parent), /ENOENT/u);
    await assert.rejects(() => stat(outside), /ENOENT/u);

    await cleanupSymlinkFixture({ junction, parent, outside });
    await cleanupSymlinkFixture({ junction: null, parent: null, outside: null });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("swapJsonlRows swaps specified rows and rejects out-of-range index", async () => {
  const tempDir = await mkdtemp(path.join(process.cwd(), "tmp-swap-rows-"));
  try {
    const filePath = path.join(tempDir, "records.jsonl");
    await writeFile(filePath, '{"row":1}\n{"row":2}\n{"row":3}\n');

    await swapJsonlRows(filePath, 0, 1);
    const content = await readFile(filePath, "utf8");
    assert.equal(content, '{"row":2}\n{"row":1}\n{"row":3}\n');

    await assert.rejects(() => swapJsonlRows(filePath, 0, 5), /out of range/u);
    await assert.rejects(() => swapJsonlRows(filePath, -1, 1), /out of range/u);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("duplicateJsonlRow appends a duplicate of the specified row and rejects out-of-range index", async () => {
  const tempDir = await mkdtemp(path.join(process.cwd(), "tmp-duplicate-row-"));
  try {
    const filePath = path.join(tempDir, "records.jsonl");
    await writeFile(filePath, '{"row":1}\n{"row":2}\n');

    await duplicateJsonlRow(filePath, 0);
    const content = await readFile(filePath, "utf8");
    assert.equal(content, '{"row":1}\n{"row":2}\n{"row":1}\n');

    await assert.rejects(() => duplicateJsonlRow(filePath, 5), /out of range/u);
    await assert.rejects(() => duplicateJsonlRow(filePath, -1), /out of range/u);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("tearJsonlFile removes the specified number of bytes from the end and rejects invalid byte counts", async () => {
  const tempDir = await mkdtemp(path.join(process.cwd(), "tmp-tear-file-"));
  try {
    const filePath = path.join(tempDir, "records.jsonl");
    await writeFile(filePath, '{"row":1}\n{"row":2}\n');

    await tearJsonlFile(filePath, 1);
    const content = await readFile(filePath, "utf8");
    assert.equal(content, '{"row":1}\n{"row":2}');

    await assert.rejects(() => tearJsonlFile(filePath, 0), /out of range/u);
    await assert.rejects(() => tearJsonlFile(filePath, 9999), /out of range/u);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
