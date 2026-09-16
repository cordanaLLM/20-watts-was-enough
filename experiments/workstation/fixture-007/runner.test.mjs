import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  analyzeFixture007,
  executeFixture007,
  main,
  prepareFixture007,
  validateFixture007Output,
} from "./runner.mjs";

const root = process.cwd();
const temporaryRoot = path.join(root, "tmp");

function releaseEnvironment(artifact) {
  return {
    EXPERIMENT_ARTIFACT: artifact,
    EXPERIMENT_IMAGE_NAME: `ghcr.io/cordanallm/20-watts-was-enough-${artifact}`,
    EXPERIMENT_IMAGE_VERSION: "v1.2.3",
    EXPERIMENT_SOURCE_REVISION: "a".repeat(40),
    EXPERIMENT_RESULT_AUTHORITY: "NO_RESULT",
    EXPERIMENT_IMAGE_DIGEST: `sha256:${"b".repeat(64)}`,
  };
}

function releaseIdentityMismatches(environment) {
  return [
    { ...environment, EXPERIMENT_IMAGE_NAME: `${environment.EXPERIMENT_IMAGE_NAME}-other` },
    { ...environment, EXPERIMENT_IMAGE_VERSION: "v1.2.4" },
    { ...environment, EXPERIMENT_SOURCE_REVISION: "c".repeat(40) },
    { ...environment, EXPERIMENT_IMAGE_DIGEST: `sha256:${"d".repeat(64)}` },
  ];
}

async function temporaryOutput(prefix) {
  await mkdir(temporaryRoot, { recursive: true });
  const parent = await mkdtemp(path.join(temporaryRoot, prefix));
  return { parent, output: path.join(parent, "run") };
}

test("smoke preparation declares its exact bounded event count", async () => {
  const prepared = await prepareFixture007("smoke");
  assert.deepEqual(prepared, {
    valid: true,
    artifact: "fixture-007",
    profile: "smoke",
    seeds: 2,
    opportunities_per_seed: 64,
    events: 512,
    measured_energy_required: false,
    claim_eligible: false,
  });
});

test("null-space smoke run exposes false specificity without beating the mature active null", async () => {
  const fixture = await temporaryOutput("fixture-007-run-");
  try {
    const execution = await executeFixture007({ profile: "smoke", output: fixture.output });
    assert.equal(execution.run.execution_receipt.execution_mode, "source");
    assert.equal(execution.run.execution_receipt.result_authority, "NO_RESULT");
    assert.equal(execution.run.execution_receipt.command, "smoke");
    const summary = await analyzeFixture007(fixture.output);
    const validation = await validateFixture007Output(fixture.output);
    assert.equal(summary.decision, "diagnostic-pass");
    assert.equal(summary.claim_eligible, false);
    assert.equal(summary.scientific_result, false);
    assert.equal(summary.metrics["mature-selective"].abstention_rate, 1);
    assert.deepEqual(
      summary.metrics["mature-active"],
      summary.metrics["operator-qualified-active"],
    );
    assert.ok(summary.metrics["unqualified-point"].false_specificity_rate >= 0.25);
    assert.deepEqual(validation, {
      valid: true,
      run_id: summary.run_id,
      decision: "diagnostic-pass",
    });
  } finally {
    assert.ok(fixture.parent.startsWith(temporaryRoot));
    await rm(fixture.parent, { recursive: true, force: true });
  }
});

test("identical profile and seeds reproduce byte-identical raw ledgers", async () => {
  const left = await temporaryOutput("fixture-007-left-");
  const right = await temporaryOutput("fixture-007-right-");
  try {
    const source = await executeFixture007({ profile: "smoke", output: left.output });
    const environment = releaseEnvironment("fixture-007");
    const released = await executeFixture007({
      profile: "smoke",
      output: right.output,
      executionEnvironment: environment,
    });
    assert.equal(
      await readFile(path.join(left.output, "raw-events.jsonl"), "utf8"),
      await readFile(path.join(right.output, "raw-events.jsonl"), "utf8"),
    );
    assert.equal(source.run.run_id, released.run.run_id);
    assert.equal(released.run.execution_receipt.execution_mode, "release-image");
    assert.deepEqual(released.run.execution_receipt.image.digest, {
      state: "explicit",
      value: `sha256:${"b".repeat(64)}`,
    });
    const current = { executionEnvironment: environment };
    await analyzeFixture007(right.output, current);
    assert.equal((await validateFixture007Output(right.output, current)).valid, true);
    for (const mismatch of releaseIdentityMismatches(environment)) {
      const mismatched = { executionEnvironment: mismatch };
      await assert.rejects(
        () => analyzeFixture007(right.output, mismatched),
        /does not match the stored execution receipt/u,
      );
      await assert.rejects(
        () => validateFixture007Output(right.output, mismatched),
        /does not match the stored execution receipt/u,
      );
    }
  } finally {
    await rm(left.parent, { recursive: true, force: true });
    await rm(right.parent, { recursive: true, force: true });
  }
});

test("full development profile executes every frozen seed and acceptance check", async () => {
  const fixture = await temporaryOutput("fixture-007-development-");
  try {
    const execution = await executeFixture007({
      profile: "development",
      output: fixture.output,
    });
    assert.equal(execution.run.seeds.length, 4);
    assert.equal(execution.run.total_events, 4 * 512 * 4);
    const summary = await analyzeFixture007(fixture.output);
    assert.equal(summary.profile, "development");
    assert.equal(summary.decision, "diagnostic-pass");
    assert.ok(Object.values(summary.checks).every(Boolean));
    assert.equal((await validateFixture007Output(fixture.output)).valid, true);
  } finally {
    await rm(fixture.parent, { recursive: true, force: true });
  }
});

test("analysis refuses a corrupted append-only event", async () => {
  const fixture = await temporaryOutput("fixture-007-corrupt-");
  try {
    await executeFixture007({ profile: "smoke", output: fixture.output });
    const rawPath = path.join(fixture.output, "raw-events.jsonl");
    const rows = (await readFile(rawPath, "utf8")).trimEnd().split("\n");
    const first = JSON.parse(rows[0]);
    first.base_observation += 1;
    rows[0] = JSON.stringify(first);
    await writeFile(rawPath, `${rows.join("\n")}\n`);
    await assert.rejects(() => analyzeFixture007(fixture.output), /runtime contract/);
  } finally {
    await rm(fixture.parent, { recursive: true, force: true });
  }
});

test("CLI parsing refuses implicit outputs and unknown options", async () => {
  await assert.rejects(
    () => main(["node", "runner.mjs", "smoke", "--profile", "smoke"]),
    /requires --output/,
  );
  await assert.rejects(
    () => main(["node", "runner.mjs", "prepare", "--profile", "smoke", "--oracle", "yes"]),
    /Unknown or duplicate/,
  );
});

test("release image execution fails before output without an explicit digest", async () => {
  const fixture = await temporaryOutput("fixture-007-release-identity-");
  const environment = releaseEnvironment("fixture-007");
  delete environment.EXPERIMENT_IMAGE_DIGEST;
  try {
    await assert.rejects(
      () => executeFixture007({
        profile: "smoke",
        output: fixture.output,
        executionEnvironment: environment,
      }),
      /requires EXPERIMENT_IMAGE_DIGEST/u,
    );
    await assert.rejects(
      () => main(
        ["node", "runner.mjs", "prepare", "--profile", "smoke"],
        environment,
      ),
      /requires EXPERIMENT_IMAGE_DIGEST/u,
    );
    await assert.rejects(() => readFile(path.join(fixture.output, "run.json")), /ENOENT/u);
  } finally {
    await rm(fixture.parent, { recursive: true, force: true });
  }
});
