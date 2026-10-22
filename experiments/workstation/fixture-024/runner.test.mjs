import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  analyzeFixture024,
  executeFixture024,
  main,
  prepareFixture024,
  validateFixture024Output,
} from "./runner.mjs";
import { assertDeterministicSmokeExecution } from "../lib/runner-test-helpers.mjs";

const root = process.cwd();
const temporaryRoot = path.join(root, "tmp");

async function temporaryOutput(prefix) {
  await mkdir(temporaryRoot, { recursive: true });
  const parent = await mkdtemp(path.join(temporaryRoot, prefix));
  return { parent, output: path.join(parent, "run") };
}

async function cleanup(...fixtures) {
  for (const fixture of fixtures) {
    assert.ok(fixture.parent.startsWith(temporaryRoot));
    await rm(fixture.parent, { recursive: true, force: true });
  }
}

test("smoke preparation exposes only bounded public-development work", async () => {
  assert.deepEqual(await prepareFixture024("smoke"), {
    valid: true,
    artifact: "fixture-024",
    track: "AMR-T01",
    profile: "smoke",
    partition: "public-development-only",
    seeds: 2,
    opportunities_per_seed: 2,
    work_units: 12,
    confirmation_seeds_created: false,
    transfer_seeds_created: false,
    measured_energy_required: false,
    energy_conclusion_allowed: false,
    claim_eligible: false,
    no_result: true,
  });
});

test("smoke run executes all three arms without creating result authority", async () => {
  const fixture = await temporaryOutput("fixture-024-smoke-");
  try {
    const execution = await executeFixture024({
      profile: "smoke",
      output: fixture.output,
      resume: false,
    });
    assert.equal(execution.complete, true);
    assert.equal(execution.run.expected_work_units, 12);
    const summary = await analyzeFixture024(fixture.output);
    const validation = await validateFixture024Output(fixture.output);
    assert.equal(summary.decision, "diagnostic-pass");
    assert.equal(summary.metrics["exact-augmented-state"].max_abs_error_u, 0);
    assert.ok(summary.metrics["finite-memory"].history_terms > 0);
    assert.equal(summary.comparison_inference_permitted, false);
    assert.equal(summary.energy_conclusion_allowed, false);
    assert.equal(summary.claim_eligible, false);
    assert.equal(summary.no_result, true);
    assert.deepEqual(validation, {
      valid: true,
      run_id: summary.run_id,
      decision: "diagnostic-pass",
      no_result: true,
    });
  } finally {
    await cleanup(fixture);
  }
});

test("same public inputs produce byte-identical raw ledgers", async () => {
  const left = await temporaryOutput("fixture-024-left-");
  const right = await temporaryOutput("fixture-024-right-");
  try {
    await assertDeterministicSmokeExecution(executeFixture024, left.output, right.output);
  } finally {
    await cleanup(left, right);
  }
});

test("checkpoint resume reproduces uninterrupted output exactly", async () => {
  const resumed = await temporaryOutput("fixture-024-resume-");
  const complete = await temporaryOutput("fixture-024-complete-");
  try {
    const partial = await executeFixture024({
      profile: "smoke",
      output: resumed.output,
      maxWorkUnits: 5,
    });
    assert.equal(partial.complete, false);
    const finished = await executeFixture024({
      profile: "smoke",
      output: resumed.output,
      resume: true,
    });
    assert.equal(finished.complete, true);
    await executeFixture024({ profile: "smoke", output: complete.output });
    assert.equal(
      await readFile(path.join(resumed.output, "raw-events.jsonl"), "utf8"),
      await readFile(path.join(complete.output, "raw-events.jsonl"), "utf8"),
    );
    assert.equal(
      await readFile(path.join(resumed.output, "checkpoint.json"), "utf8"),
      await readFile(path.join(complete.output, "checkpoint.json"), "utf8"),
    );
  } finally {
    await cleanup(resumed, complete);
  }
});

test("analysis rejects an altered chained record", async () => {
  const fixture = await temporaryOutput("fixture-024-corrupt-");
  try {
    await executeFixture024({ profile: "smoke", output: fixture.output });
    const rawPath = path.join(fixture.output, "raw-events.jsonl");
    const rows = (await readFile(rawPath, "utf8")).trimEnd().split("\n");
    const first = JSON.parse(rows[0]);
    first.rmse_u += 0.01;
    rows[0] = JSON.stringify(first);
    await writeFile(rawPath, `${rows.join("\n")}\n`);
    await assert.rejects(() => analyzeFixture024(fixture.output), /runtime contract|hash/i);
  } finally {
    await cleanup(fixture);
  }
});

test("CLI has no confirmation or transfer action and requires explicit outputs", async () => {
  await assert.rejects(
    () => main(["node", "runner.mjs", "confirmation", "--profile", "development"]),
    /private partitions are not executable/,
  );
  await assert.rejects(
    () => main(["node", "runner.mjs", "smoke", "--profile", "smoke"]),
    /requires --output/,
  );
  await assert.rejects(
    () => main(["node", "runner.mjs", "prepare", "--profile", "smoke", "--seeds", "private.json"]),
    /Unknown or duplicate/,
  );
});
