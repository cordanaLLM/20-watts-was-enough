import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, symlink, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  analyzeFixture019,
  executeFixture019,
  main,
  prepareFixture019,
  validateFixture019,
} from "./runner.mjs";

const root = process.cwd();

function releaseEnvironment() {
  return {
    EXPERIMENT_ARTIFACT: "fixture-019",
    EXPERIMENT_IMAGE_NAME: "ghcr.io/cordanallm/20-watts-was-enough-fixture-019",
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

test("smoke execution covers all mandatory FM-T02 cells while private seed packs remain unavailable", async () => {
  const parent = await mkdtemp(path.join(root, "tmp-f019-runner-"));
  const output = path.join(parent, "run");
  const relative = path.relative(root, output);
  try {
    const prepared = await prepareFixture019("smoke");
    assert.equal(prepared.work_units, 32);
    assert.equal(prepared.confirmation_seed_state, "pending-private-escrow-unavailable");
    assert.equal(prepared.held_out_seed_state, "pending-private-escrow-unavailable");
    const environment = releaseEnvironment();
    const executed = await executeFixture019({
      profile: "smoke",
      output: relative,
      resume: false,
      executionEnvironment: environment,
    });
    assert.equal(executed.run.expected_work_units, 32);
    assert.equal(executed.run.ledger.completed_work_units, 32);
    assert.match(executed.run.source_hashes["../lib/checkpoint-ledger.mjs"], /^[0-9a-f]{64}$/);
    assert.equal(executed.run.execution_receipt.execution_mode, "release-image");
    assert.equal(executed.run.execution_receipt.runtime.os, process.platform);
    assert.deepEqual(executed.run.execution_receipt.image.digest, {
      state: "explicit",
      value: `sha256:${"b".repeat(64)}`,
    });
    const checkpoint = JSON.parse(await readFile(path.join(output, "checkpoint.json"), "utf8"));
    assert.equal(checkpoint.run_identity.run_id, executed.run.run_id);
    assert.equal(Object.hasOwn(checkpoint.run_identity, "execution_receipt"), false);
    const current = { executionEnvironment: environment };
    const analysis = await analyzeFixture019(relative, current);
    assert.equal(analysis.decision, "diagnostic-pass");
    assert.equal(analysis.confirmation_executed, false);
    assert.equal(analysis.transfer_executed, false);
    assert.equal(analysis.claim_eligible, false);
    assert.equal(analysis.scientific_result, false);
    assert.equal(analysis.energy_conclusion_allowed, false);
    assert.equal(analysis.scientific_eligibility.confirmation_eligible, false);
    assert.equal(analysis.scientific_eligibility.seed_variation_reaches_primary_at_1e_12, false);
    assert.match(analysis.scientific_eligibility.blockers.join(" "), /seed-invariant/);
    assert.deepEqual(await validateFixture019(relative, current), {
      valid: true,
      decision: "diagnostic-pass",
      claim_eligible: false,
      scientific_result: false,
    });
    for (const mismatch of releaseIdentityMismatches(environment)) {
      const mismatched = { executionEnvironment: mismatch };
      await assert.rejects(
        () => analyzeFixture019(relative, mismatched),
        /does not match the stored execution receipt/u,
      );
      await assert.rejects(
        () => validateFixture019(relative, mismatched),
        /does not match the stored execution receipt/u,
      );
    }
    const resumed = await executeFixture019({
      profile: "smoke",
      output: relative,
      resume: true,
      executionEnvironment: environment,
    });
    assert.equal(resumed.run.ledger.completed_work_units, 32);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("release image execution fails before output without an explicit digest", async () => {
  const parent = await mkdtemp(path.join(root, "tmp-f019-release-identity-"));
  const output = path.join(parent, "run");
  const environment = releaseEnvironment();
  delete environment.EXPERIMENT_IMAGE_DIGEST;
  try {
    await assert.rejects(
      () => executeFixture019({
        profile: "smoke",
        output: path.relative(root, output),
        resume: false,
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
    await assert.rejects(() => readFile(path.join(output, "run.json")), /ENOENT/u);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("analysis refuses a mutated scientific record", async () => {
  const parent = await mkdtemp(path.join(root, "tmp-f019-mutation-"));
  const output = path.join(parent, "run");
  const relative = path.relative(root, output);
  try {
    await executeFixture019({ profile: "smoke", output: relative, resume: false });
    const rawPath = path.join(output, "raw-events.jsonl");
    const body = await readFile(rawPath, "utf8");
    await writeFile(rawPath, body.replace('"forecast_loss":', '"forecast_loss":0.999,"tampered_loss":'));
    await assert.rejects(() => analyzeFixture019(relative), /Fixture 019|hash/i);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("analysis refuses run metadata not bound to the current source identity", async () => {
  const parent = await mkdtemp(path.join(root, "tmp-f019-identity-"));
  const output = path.join(parent, "run");
  const relative = path.relative(root, output);
  try {
    await executeFixture019({ profile: "smoke", output: relative, resume: false });
    const runPath = path.join(output, "run.json");
    const run = JSON.parse(await readFile(runPath, "utf8"));
    run.source_hashes["worker.py"] = "f".repeat(64);
    await writeFile(runPath, `${JSON.stringify(run, null, 2)}\n`);
    await assert.rejects(() => analyzeFixture019(relative), /frozen run identity changed at source_hashes/);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("output creation refuses a repository junction redirected outside the repository", async () => {
  const parent = await mkdtemp(path.join(root, "tmp-f019-path-"));
  const outside = await mkdtemp(path.join(os.tmpdir(), "f019-outside-"));
  const junction = path.join(parent, "redirected");
  try {
    await symlink(outside, junction, "junction");
    await assert.rejects(
      () => executeFixture019({
        profile: "smoke",
        output: path.relative(root, path.join(junction, "run")),
        resume: false,
      }),
      /symbolic-link|reparse-point|outside the repository/,
    );
  } finally {
    await unlink(junction).catch(() => {});
    await rm(parent, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("analysis refuses a redirected analysis descendant before writing resamples", async () => {
  const parent = await mkdtemp(path.join(root, "tmp-f019-analysis-path-"));
  const outside = await mkdtemp(path.join(os.tmpdir(), "f019-analysis-outside-"));
  const output = path.join(parent, "run");
  const relative = path.relative(root, output);
  const junction = path.join(output, "analysis");
  try {
    await executeFixture019({ profile: "smoke", output: relative, resume: false });
    await symlink(outside, junction, "junction");
    await assert.rejects(
      () => analyzeFixture019(relative),
      /symbolic-link|reparse-point|outside the repository/,
    );
    assert.deepEqual(await import("node:fs/promises").then(({ readdir }) => readdir(outside)), []);
  } finally {
    await unlink(junction).catch(() => {});
    await rm(parent, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("confirmation and held-out records are explicitly pending and contain no public derivation", async () => {
  for (const name of ["confirmation.commit.json", "held-out.commit.json"]) {
    const document = JSON.parse(await readFile(path.join(
      root,
      "experiments",
      "workstation",
      "fixture-019",
      "seeds",
      name,
    ), "utf8"));
    assert.equal(document.state, "pending-private-escrow");
    assert.equal("seeds" in document, false);
    assert.equal(document.commitment, null);
    assert.equal(document.escrow_sha256, null);
    assert.equal(Object.keys(document).some((key) => /derivation/i.test(key)), false);
    assert.match(document.note, /Public label-derived seeds are ineligible/);
  }
});
