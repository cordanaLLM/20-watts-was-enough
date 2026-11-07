import assert from "node:assert/strict";
import { appendFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  canonicalize,
  openCheckpointLedger,
  remainingWorkUnits,
  sha256Hex,
} from "../lib/checkpoint-ledger.mjs";
import { assertCheckpointSchemaRejections } from "../lib/runner-test-helpers.mjs";

const root = process.cwd();

function assertTestRecord(record, { sequence, previousHash }) {
  assert.equal(record.integrity.sequence, sequence);
  assert.equal(record.integrity.previous_sha256, previousHash);
  assert.equal(
    record.integrity.record_sha256,
    sha256Hex(`${previousHash}\n${canonicalize({ id: record.id, value: record.value })}`),
  );
}

async function openLedger(directory) {
  return openCheckpointLedger({
    artifact: "fixture-019",
    ledgerFormat: "fixture-019.test-ledger.v1",
    rawPath: path.join(directory, "raw.jsonl"),
    checkpointPath: path.join(directory, "checkpoint.json"),
    runIdentity: { profile: "test", source: "frozen" },
    scientificPayload: (record) => ({ id: record.id, value: record.value }),
    workKey: (record) => record.id,
    assertRecord: assertTestRecord,
  });
}

test("resume derives authority from raw records and completes only remaining work", async () => {
  const temporary = await mkdtemp(path.join(root, "tmp-f019-checkpoint-"));
  try {
    const ledger = await openLedger(temporary);
    await ledger.append({ id: "a", value: 1 });
    await ledger.saveCheckpoint();
    const reopened = await openLedger(temporary);
    const remaining = remainingWorkUnits(
      [{ id: "a" }, { id: "b" }, { id: "c" }],
      reopened.completedWorkKeys(),
      (row) => row.id,
    );
    assert.deepEqual(remaining, [{ id: "b" }, { id: "c" }]);
    await reopened.append({ id: "b", value: 2 });
    await reopened.append({ id: "c", value: 3 });
    await reopened.saveCheckpoint();
    const final = await openLedger(temporary);
    assert.equal(final.summary().completed_work_units, 3);
    await assert.rejects(() => final.append({ id: "c", value: 4 }), /already completed/);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("torn tails and altered chained records fail closed", async () => {
  const torn = await mkdtemp(path.join(root, "tmp-f019-torn-"));
  const altered = await mkdtemp(path.join(root, "tmp-f019-altered-"));
  try {
    const first = await openLedger(torn);
    await first.append({ id: "a", value: 1 });
    await appendFile(path.join(torn, "raw.jsonl"), "{\"partial\":");
    await assert.rejects(() => openLedger(torn), /torn trailing record/);

    const second = await openLedger(altered);
    await second.append({ id: "a", value: 1 });
    const body = await readFile(path.join(altered, "raw.jsonl"), "utf8");
    await writeFile(path.join(altered, "raw.jsonl"), body.replace('"value":1', '"value":9'));
    await assert.rejects(() => openLedger(altered), /strictly equal|record hash|Hash-chain/i);
  } finally {
    await rm(torn, { recursive: true, force: true });
    await rm(altered, { recursive: true, force: true });
  }
});

test("checkpoint documents reject unknown fields and type drift after digest recomputation", async () => {
  const temporary = await mkdtemp(path.join(root, "tmp-f019-checkpoint-closure-"));
  try {
    const ledger = await openLedger(temporary);
    await ledger.append({ id: "a", value: 1 });
    await ledger.saveCheckpoint();
    const checkpointPath = path.join(temporary, "checkpoint.json");
    await assertCheckpointSchemaRejections({
      checkpointPath,
      assertRejection: () => assert.rejects(() => openLedger(temporary), /missing or unknown fields|identity mismatch/),
    });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("raw ledgers reject CRLF instead of silently changing byte semantics", async () => {
  const temporary = await mkdtemp(path.join(root, "tmp-f019-checkpoint-crlf-"));
  try {
    const ledger = await openLedger(temporary);
    await ledger.append({ id: "a", value: 1 });
    const rawPath = path.join(temporary, "raw.jsonl");
    const raw = await readFile(rawPath, "utf8");
    await writeFile(rawPath, raw.replaceAll("\n", "\r\n"));
    await assert.rejects(() => openLedger(temporary), /canonical LF JSONL|CRLF/);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
