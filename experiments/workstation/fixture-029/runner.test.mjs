import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { canonicalize, sha256Hex } from "../lib/checkpoint-ledger.mjs";
import { fixture029ScientificPayload, fixture029WorkKey } from "./contract.mjs";
import {
  analyzeFixture029, executeFixture029, main, prepareFixture029, validateFixture029Output,
} from "./runner.mjs";
import {
  assertDeterministicSmokeExecution,
  cleanup,
  duplicateJsonlRow,
  swapJsonlRows,
  tearJsonlFile,
  temporaryOutput,
} from "../lib/runner-test-helpers.mjs";

async function rewriteFullyRechainedLedger(output, mutateRecords) {
  const rawPath = path.join(output, "raw-events.jsonl");
  const checkpointPath = path.join(output, "checkpoint.json");
  const runPath = path.join(output, "run.json");
  const records = (await readFile(rawPath, "utf8")).trimEnd().split("\n").map(JSON.parse);
  mutateRecords(records);

  const scientificDigest = createHash("sha256");
  let previousHash = "0".repeat(64);
  for (const [sequence, record] of records.entries()) {
    const payload = canonicalize(fixture029ScientificPayload(record));
    record.integrity = {
      sequence,
      previous_sha256: previousHash,
      record_sha256: sha256Hex(`${previousHash}\n${payload}`),
    };
    scientificDigest.update(payload);
    previousHash = record.integrity.record_sha256;
  }
  await writeFile(rawPath, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`);

  const priorCheckpoint = JSON.parse(await readFile(checkpointPath, "utf8"));
  const completed = [...new Set(records.map(fixture029WorkKey))].sort();
  const checkpointBody = {
    schema: priorCheckpoint.schema,
    artifact: priorCheckpoint.artifact,
    ledger_format: priorCheckpoint.ledger_format,
    records: records.length,
    scientific_payload_sha256: scientificDigest.digest("hex"),
    hash_chain_sha256: previousHash,
    completed_work_units_sha256: sha256Hex(canonicalize(completed)),
    run_identity: priorCheckpoint.run_identity,
  };
  const checkpoint = {
    ...checkpointBody,
    checkpoint_sha256: sha256Hex(canonicalize(checkpointBody)),
  };
  await writeFile(checkpointPath, `${JSON.stringify(checkpoint, null, 2)}\n`);

  const run = JSON.parse(await readFile(runPath, "utf8"));
  run.ledger = {
    records: records.length,
    scientific_payload_sha256: checkpoint.scientific_payload_sha256,
    hash_chain_sha256: checkpoint.hash_chain_sha256,
    completed_work_units: completed.length,
    checkpoint_status: "current",
  };
  await writeFile(runPath, `${JSON.stringify(run, null, 2)}\n`);
}

test("prepare fixes CMB-X04 to C-1580 and bounded public work", async () => {
  assert.deepEqual(await prepareFixture029("smoke"), {
    valid: true,
    artifact: "fixture-029",
    track: "CMB-X04",
    execution_claims: ["C-1580"],
    profile: "smoke",
    partition: "public-development-only",
    seeds: 2,
    worlds_per_seed: 8,
    artifacts_per_world: 24,
    arms: 8,
    work_units: 128,
    confirmation_seeds_created: false,
    held_out_seeds_created: false,
    measured_energy_required: false,
    energy_conclusion_allowed: false,
    claim_eligible: false,
    no_result: true,
  });
});

test("smoke run exercises gates, strong nulls, and mechanism controls without authority", async () => {
  const fixture = await temporaryOutput("fixture-029-smoke-");
  try {
    const execution = await executeFixture029({ profile: "smoke", output: fixture.output });
    assert.equal(execution.complete, true);
    const analysis = await analyzeFixture029(fixture.output);
    assert.equal(analysis.decision, "diagnostic-pass");
    assert.ok(Object.values(analysis.checks).every(Boolean));
    assert.equal(analysis.checks.transport_and_wrapper_accounting_hold, true);
    assert.equal(analysis.checks.independently_regenerated_records_match, true);
    assert.equal(analysis.checks.sequential_lifecycle_costs_are_visible, true);
    assert.equal(analysis.metrics["X04-PERSIST"].accepted_service_nsu, 0);
    assert.ok(analysis.metrics["X04-RETRY"].logical_operations > 0);
    assert.ok(analysis.metrics["X04-REPLICA"].transported_bytes > 0);
    for (const metrics of Object.values(analysis.metrics)) {
      assert.equal(
        metrics.transported_bytes,
        metrics.copies_transported * 4096 + metrics.wrapper_state_bytes_created,
      );
      assert.equal(metrics.transport_bytes_written, metrics.transported_bytes);
      assert.equal(metrics.reconstruction_bytes_written, metrics.rebuilt * 4096);
      assert.equal(
        metrics.bytes_written,
        metrics.transport_bytes_written + metrics.reconstruction_bytes_written,
      );
    }
    assert.ok(
      analysis.metrics["X04-RETRY"].accepted_service_nsu
        > analysis.metrics["X04-RELOAD"].accepted_service_nsu,
    );
    assert.ok(
      analysis.metrics["X04-RELOAD"].accepted_service_nsu
        > analysis.metrics["X04-REBUILD"].accepted_service_nsu,
    );
    assert.equal(analysis.claim_eligible, false);
    assert.equal(analysis.energy_conclusion_allowed, false);
    assert.deepEqual(await validateFixture029Output(fixture.output), {
      valid: true, run_id: analysis.run_id, decision: "diagnostic-pass", no_result: true,
    });
  } finally {
    await cleanup(fixture);
  }
});

test("same public inputs produce byte-identical append-only ledgers", async () => {
  const left = await temporaryOutput("fixture-029-left-");
  const right = await temporaryOutput("fixture-029-right-");
  try {
    await assertDeterministicSmokeExecution(executeFixture029, left.output, right.output);
  } finally {
    await cleanup(left, right);
  }
});

test("resume reconstructs authority from raw events and reproduces uninterrupted output", async () => {
  const resumed = await temporaryOutput("fixture-029-resume-");
  const complete = await temporaryOutput("fixture-029-complete-");
  try {
    const partial = await executeFixture029({ profile: "smoke", output: resumed.output, maxWorkUnits: 11 });
    assert.equal(partial.complete, false);
    const finished = await executeFixture029({ profile: "smoke", output: resumed.output, resume: true });
    assert.equal(finished.complete, true);
    await executeFixture029({ profile: "smoke", output: complete.output });
    assert.equal(
      await readFile(path.join(resumed.output, "raw-events.jsonl"), "utf8"),
      await readFile(path.join(complete.output, "raw-events.jsonl"), "utf8"),
    );
  } finally {
    await cleanup(resumed, complete);
  }
});

test("analysis rejects a modified event in the hash-bound ledger", async () => {
  const fixture = await temporaryOutput("fixture-029-corrupt-");
  try {
    await executeFixture029({ profile: "smoke", output: fixture.output });
    const rawPath = path.join(fixture.output, "raw-events.jsonl");
    const rows = (await readFile(rawPath, "utf8")).trimEnd().split("\n");
    const first = JSON.parse(rows[0]);
    first.resources.logical_operations += 1;
    rows[0] = JSON.stringify(first);
    await writeFile(rawPath, `${rows.join("\n")}\n`);
    await assert.rejects(() => analyzeFixture029(fixture.output), /runtime contract|hash/i);
  } finally {
    await cleanup(fixture);
  }
});

test("exact replay rejects a semantically fabricated but fully rechained ledger", async () => {
  const fixture = await temporaryOutput("fixture-029-semantic-forgery-");
  try {
    await executeFixture029({ profile: "smoke", output: fixture.output });
    await rewriteFullyRechainedLedger(fixture.output, (records) => {
      const forged = records.find((record) => (
        record.arm === "X04-NONE" && record.outcomes.accepted_service_nsu > 1
      ));
      assert.ok(forged);
      forged.outcomes.accepted_service_nsu -= 1;
      forged.outcomes.active_artifact_steps -= 1;
    });
    await assert.rejects(
      () => analyzeFixture029(fixture.output),
      /independently regenerated payload differs/,
    );
  } finally {
    await cleanup(fixture);
  }
});

test("ledger rejects reordered, duplicated, and torn construction records", async () => {
  const reordered = await temporaryOutput("fixture-029-reorder-");
  const duplicated = await temporaryOutput("fixture-029-duplicate-");
  const torn = await temporaryOutput("fixture-029-torn-");
  try {
    await Promise.all([
      executeFixture029({ profile: "smoke", output: reordered.output }),
      executeFixture029({ profile: "smoke", output: duplicated.output }),
      executeFixture029({ profile: "smoke", output: torn.output }),
    ]);
    await swapJsonlRows(path.join(reordered.output, "raw-events.jsonl"));
    await assert.rejects(() => analyzeFixture029(reordered.output), /runtime contract|hash/i);

    await duplicateJsonlRow(path.join(duplicated.output, "raw-events.jsonl"));
    await assert.rejects(() => analyzeFixture029(duplicated.output), /duplicate|runtime contract|hash/i);

    await tearJsonlFile(path.join(torn.output, "raw-events.jsonl"));
    await assert.rejects(() => analyzeFixture029(torn.output), /torn trailing record|canonical LF/i);
  } finally {
    await cleanup(reordered, duplicated, torn);
  }
});

test("runner refuses overwrite, missing resume, and cross-profile resume", async () => {
  const fixture = await temporaryOutput("fixture-029-resume-boundary-");
  const missing = await temporaryOutput("fixture-029-resume-missing-");
  try {
    await executeFixture029({ profile: "smoke", output: fixture.output });
    await assert.rejects(
      () => executeFixture029({ profile: "smoke", output: fixture.output, resume: false }),
      /already exists/,
    );
    await assert.rejects(
      () => executeFixture029({ profile: "development", output: fixture.output, resume: true }),
      /runtime contract|identity mismatch|profile/i,
    );
    await assert.rejects(
      () => executeFixture029({ profile: "smoke", output: missing.output, resume: true }),
      /cannot resume a missing/,
    );
  } finally {
    await cleanup(fixture, missing);
  }
});

test("unavailable private-partition stubs disclose neither seeds nor commitments", async () => {
  for (const name of ["confirmation.unavailable.json", "transfer.unavailable.json"]) {
    const document = JSON.parse(await readFile(new URL(`./seeds/${name}`, import.meta.url), "utf8"));
    assert.equal(document.state, "not-created");
    assert.equal("seeds" in document, false);
    assert.equal("commitment" in document, false);
  }
});

test("CLI exposes no confirmation, held-out, meter, or implicit output action", async () => {
  await assert.rejects(() => main(["node", "runner.mjs", "confirmation", "--profile", "development"]), /private partitions are not executable/);
  await assert.rejects(() => main(["node", "runner.mjs", "smoke", "--profile", "smoke"]), /requires --output/);
  await assert.rejects(() => main(["node", "runner.mjs", "prepare", "--profile", "smoke", "--meter", "device.json"]), /^Error: Unknown or duplicate Fixture 029 option --meter\.$/);
  await assert.rejects(() => main(["node", "runner.mjs", "prepare", "--Profile", "smoke"]), /^Error: Invalid option pair\.$/);
  await assert.rejects(() => main(["node", "runner.mjs", "prepare", "--profile"]), /^Error: Options require explicit --name value pairs\.$/);
});
