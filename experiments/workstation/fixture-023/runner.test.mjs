import assert from "node:assert/strict";
import {
  appendFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  canonical,
  fixture023ScientificPayload,
  sha256,
} from "./contract.mjs";

import {
  analyzeFixture023,
  executeFixture023,
  main,
  prepareFixture023,
  validateFixture023Output,
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

function rechain(records) {
  let previous = "0".repeat(64);
  return records.map((record, sequence) => {
    const payload = fixture023ScientificPayload(record);
    const chained = {
      ...payload,
      integrity: {
        sequence,
        previous_sha256: previous,
        record_sha256: sha256(`${previous}\n${canonical(payload)}`),
      },
    };
    previous = chained.integrity.record_sha256;
    return chained;
  });
}

test("smoke preparation exposes two public tracks and no private partition", async () => {
  assert.deepEqual(await prepareFixture023("smoke"), {
    valid: true,
    artifact: "fixture-023",
    tracks: ["PLM-T01", "PLM-T02"],
    profile: "smoke",
    partition: "public-development-only",
    track_seed_counts: { "PLM-T01": 2, "PLM-T02": 2 },
    work_units: 84,
    confirmation_seeds_created: false,
    transfer_seeds_created: false,
    measured_energy_required: false,
    energy_conclusion_allowed: false,
    claim_eligible: false,
    no_result: true,
  });
});

test("smoke run validates duration, reset, corruption, typed-null, and authority plumbing", async () => {
  const fixture = await temporaryOutput("fixture-023-smoke-");
  try {
    const execution = await executeFixture023({ profile: "smoke", output: fixture.output });
    assert.equal(execution.complete, true);
    assert.equal(execution.run.expected_work_units, 84);
    const summary = await analyzeFixture023(fixture.output);
    const validation = await validateFixture023Output(fixture.output);
    assert.equal(summary.decision, "diagnostic-pass");
    assert.ok(Object.values(summary.checks).every(Boolean));
    assert.ok(summary.metrics["PLM-T01"]["independent-latches"].records > 0);
    assert.ok(summary.metrics["PLM-T02"]["evidence-gated-reset"].abstentions > 0);
    const diagnostic = summary.metrics["PLM-T02"]["evidence-gated-reset"];
    for (const field of [
      "observed_loss_sum",
      "charged_loss_sum",
      "persistent_writes",
      "persistent_writes_charged",
      "reset_operations",
      "reset_operations_charged",
      "cleared_bytes",
      "cleared_bytes_charged",
      "rng_updates",
      "rng_updates_charged",
      "operation_count",
      "operation_count_charged",
    ]) assert.equal(Object.hasOwn(diagnostic, field), true, `missing diagnostic ${field}`);
    assert.equal(summary.comparison_inference_permitted, false);
    assert.equal(summary.energy_conclusion_allowed, false);
    assert.equal(summary.claim_eligible, false);
    assert.equal(summary.no_result, true);
    const records = (await readFile(path.join(fixture.output, "raw-events.jsonl"), "utf8"))
      .trimEnd().split("\n").map(JSON.parse);
    const t02 = records.find((record) => record.track === "PLM-T02" && !record.failure.failed);
    assert.equal(t02.outcome.evaluation_predictions.length, t02.outcome.evaluation_count);
    assert.equal(t02.outcome.evaluation_labels.length, t02.outcome.evaluation_count);
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
  const left = await temporaryOutput("fixture-023-left-");
  const right = await temporaryOutput("fixture-023-right-");
  try {
    await assertDeterministicSmokeExecution(executeFixture023, left.output, right.output);
  } finally {
    await cleanup(left, right);
  }
});

test("checkpoint resume reproduces uninterrupted raw and checkpoint bytes", async () => {
  const resumed = await temporaryOutput("fixture-023-resume-");
  const complete = await temporaryOutput("fixture-023-complete-");
  try {
    const partial = await executeFixture023({
      profile: "smoke",
      output: resumed.output,
      maxWorkUnits: 17,
    });
    assert.equal(partial.complete, false);
    const finished = await executeFixture023({
      profile: "smoke",
      output: resumed.output,
      resume: true,
    });
    assert.equal(finished.complete, true);
    await executeFixture023({ profile: "smoke", output: complete.output });
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

test("transient policy and evaluator exceptions remain retained after clean resume", async () => {
  const policy = await temporaryOutput("fixture-023-policy-exception-resume-");
  const evaluator = await temporaryOutput("fixture-023-evaluator-exception-resume-");
  try {
    await executeFixture023({
      profile: "smoke",
      output: policy.output,
      maxWorkUnits: 1,
      runtime: { runT01Policy() { throw new Error("transient policy test fault"); } },
    });
    await executeFixture023({
      profile: "smoke",
      output: evaluator.output,
      maxWorkUnits: 1,
      runtime: { evaluateT01() { throw new Error("transient evaluator test fault"); } },
    });
    for (const [fixture, reason] of [
      [policy, "policy-exception"],
      [evaluator, "evaluator-exception"],
    ]) {
      const first = JSON.parse(
        (await readFile(path.join(fixture.output, "raw-events.jsonl"), "utf8")).trimEnd(),
      );
      assert.equal(first.failure.reason, reason);
      assert.equal(first.outcome.observed_loss, null);
      assert.equal(first.outcome.finite_loss, 100);
      const resumed = await executeFixture023({
        profile: "smoke",
        output: fixture.output,
        resume: true,
      });
      assert.equal(resumed.complete, true);
      const summary = await analyzeFixture023(fixture.output);
      assert.equal(summary.decision, "diagnostic-pass");
      assert.equal(summary.metrics["PLM-T01"]["quantized-accumulator"].failures, 1);
    }
  } finally {
    await cleanup(policy, evaluator);
  }
});

test("resume reconciles a final raw record written after the last checkpoint", async () => {
  const crashed = await temporaryOutput("fixture-023-final-record-");
  const complete = await temporaryOutput("fixture-023-final-reference-");
  try {
    const partial = await executeFixture023({
      profile: "smoke",
      output: crashed.output,
      maxWorkUnits: 83,
    });
    assert.equal(partial.complete, false);
    await executeFixture023({ profile: "smoke", output: complete.output });
    const completeRaw = await readFile(path.join(complete.output, "raw-events.jsonl"), "utf8");
    const finalRecord = completeRaw.trimEnd().split("\n").at(-1);
    await appendFile(path.join(crashed.output, "raw-events.jsonl"), `${finalRecord}\n`);
    const resumed = await executeFixture023({
      profile: "smoke",
      output: crashed.output,
      resume: true,
    });
    assert.equal(resumed.complete, true);
    assert.equal(
      await readFile(path.join(crashed.output, "raw-events.jsonl"), "utf8"),
      completeRaw,
    );
    assert.equal(
      await readFile(path.join(crashed.output, "checkpoint.json"), "utf8"),
      await readFile(path.join(complete.output, "checkpoint.json"), "utf8"),
    );
    const summary = await analyzeFixture023(crashed.output);
    assert.equal(summary.decision, "diagnostic-pass");
  } finally {
    await cleanup(crashed, complete);
  }
});

test("analysis rejects corruption in the append-only chain", async () => {
  const fixture = await temporaryOutput("fixture-023-corrupt-");
  try {
    await executeFixture023({ profile: "smoke", output: fixture.output });
    const rawPath = path.join(fixture.output, "raw-events.jsonl");
    const rows = (await readFile(rawPath, "utf8")).trimEnd().split("\n");
    const first = JSON.parse(rows[0]);
    first.outcome.finite_loss += 0.01;
    rows[0] = JSON.stringify(first);
    await writeFile(rawPath, `${rows.join("\n")}\n`);
    await assert.rejects(() => analyzeFixture023(fixture.output), /runtime contract|hash/i);
  } finally {
    await cleanup(fixture);
  }
});

test("analysis derives completion and rejects embedded run identity drift", async () => {
  const completion = await temporaryOutput("fixture-023-completion-identity-");
  const identity = await temporaryOutput("fixture-023-source-identity-");
  try {
    await executeFixture023({ profile: "smoke", output: completion.output });
    const completionPath = path.join(completion.output, "run.json");
    const shortened = JSON.parse(await readFile(completionPath, "utf8"));
    shortened.expected_work_units -= 1;
    await writeFile(completionPath, `${JSON.stringify(shortened, null, 2)}\n`);
    await assert.rejects(
      () => analyzeFixture023(completion.output),
      /run, checkpoint, and raw ledger disagree/,
    );

    await executeFixture023({ profile: "smoke", output: identity.output });
    const identityPath = path.join(identity.output, "run.json");
    const drifted = JSON.parse(await readFile(identityPath, "utf8"));
    drifted.run_identity.input_sha256.public_seeds = "a".repeat(64);
    await writeFile(identityPath, `${JSON.stringify(drifted, null, 2)}\n`);
    await assert.rejects(
      () => analyzeFixture023(identity.output),
      /run identity differs/,
    );
  } finally {
    await cleanup(completion, identity);
  }
});

test("resume rejects canonical work-order and generated-content substitutions", async () => {
  const order = await temporaryOutput("fixture-023-order-forgery-");
  const content = await temporaryOutput("fixture-023-content-forgery-");
  try {
    await executeFixture023({ profile: "smoke", output: order.output });
    const orderPath = path.join(order.output, "raw-events.jsonl");
    const reordered = (await readFile(orderPath, "utf8")).trimEnd().split("\n").map(JSON.parse);
    [reordered[0], reordered[1]] = [reordered[1], reordered[0]];
    await writeFile(orderPath, `${rechain(reordered).map(JSON.stringify).join("\n")}\n`);
    await rm(path.join(order.output, "checkpoint.json"));
    await assert.rejects(
      () => executeFixture023({ profile: "smoke", output: order.output, resume: true }),
      /canonical work content or order mismatch/,
    );

    await executeFixture023({ profile: "smoke", output: content.output });
    const contentPath = path.join(content.output, "raw-events.jsonl");
    const substituted = (await readFile(contentPath, "utf8")).trimEnd().split("\n").map(JSON.parse);
    substituted[0].world_id = `w23_${"f".repeat(32)}`;
    await writeFile(contentPath, `${rechain(substituted).map(JSON.stringify).join("\n")}\n`);
    await rm(path.join(content.output, "checkpoint.json"));
    await assert.rejects(
      () => executeFixture023({ profile: "smoke", output: content.output, resume: true }),
      /canonical work content or order mismatch/,
    );
  } finally {
    await cleanup(order, content);
  }
});

test("unknown checkpoint fields are rejected before shared-ledger recovery", async () => {
  const fixture = await temporaryOutput("fixture-023-checkpoint-closure-");
  try {
    await executeFixture023({ profile: "smoke", output: fixture.output, maxWorkUnits: 4 });
    const checkpointPath = path.join(fixture.output, "checkpoint.json");
    const checkpoint = JSON.parse(await readFile(checkpointPath, "utf8"));
    checkpoint.unregistered = true;
    await writeFile(checkpointPath, `${JSON.stringify(checkpoint, null, 2)}\n`);
    await assert.rejects(
      () => executeFixture023({ profile: "smoke", output: fixture.output, resume: true }),
      /checkpoint has missing or unknown fields/,
    );
  } finally {
    await cleanup(fixture);
  }
});

test("resume atomically rebuilds a torn derivable run document", async () => {
  const fixture = await temporaryOutput("fixture-023-torn-run-");
  try {
    await executeFixture023({ profile: "smoke", output: fixture.output });
    const runPath = path.join(fixture.output, "run.json");
    const expected = await readFile(runPath, "utf8");
    await writeFile(runPath, expected.slice(0, Math.floor(expected.length / 2)));
    const recovered = await executeFixture023({
      profile: "smoke",
      output: fixture.output,
      resume: true,
    });
    assert.equal(recovered.complete, true);
    assert.equal(await readFile(runPath, "utf8"), expected);
    assert.equal((await readdir(fixture.output)).some((name) => name.includes("run.json.tmp-")), false);
    assert.equal((await analyzeFixture023(fixture.output)).decision, "diagnostic-pass");
  } finally {
    await cleanup(fixture);
  }
});

test("CLI exposes no confirmation or transfer action and cannot inject seed files", async () => {
  await assert.rejects(
    () => main(["node", "runner.mjs", "confirmation", "--profile", "development"]),
    /confirmation and transfer are inaccessible/,
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
