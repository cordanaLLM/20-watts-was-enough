import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { canonicalize, sha256Hex } from "../lib/checkpoint-ledger.mjs";
import { writeRehashedCheckpoint } from "../lib/runner-test-helpers.mjs";
import { executeFixture026RsdT02 } from "./rsd-t02-runner.mjs";
import {
  CHECKPOINT_FILE,
  RAW_FILE,
  cleanup,
  corruptPartial,
  rechain,
  temporaryOutput,
} from "./rsd-t02-runner.test-support.mjs";

test("resume rejects self-consistently reordered and duplicate work records", async () => {
  for (const duplicate of [false, true]) {
    const fixture = await temporaryOutput("fixture-026-rsd-t02-prefix-hostile-");
    try {
      await executeFixture026RsdT02({
        profile: "smoke",
        output: fixture.output,
        maxWorkUnits: 2,
      });
      const rawPath = path.join(fixture.output, RAW_FILE);
      const records = (await readFile(rawPath, "utf8")).trimEnd().split("\n").map(
        (line) => JSON.parse(line),
      );
      const hostile = duplicate
        ? [structuredClone(records[0]), structuredClone(records[0])]
        : [records[1], records[0]];
      await writeFile(rawPath, rechain(hostile));
      await rm(path.join(fixture.output, CHECKPOINT_FILE));
      await assert.rejects(
        () => executeFixture026RsdT02({
          profile: "smoke",
          output: fixture.output,
          resume: true,
        }),
        duplicate ? /duplicate completed work unit/iu : /ordered work-grid prefix/u,
      );
    } finally {
      await cleanup(fixture);
    }
  }
});

test("resume rejects a validly rehashed checkpoint ahead of raw authority", async () => {
  const fixture = await temporaryOutput("fixture-026-rsd-t02-ahead-checkpoint-");
  try {
    await executeFixture026RsdT02({
      profile: "smoke",
      output: fixture.output,
      maxWorkUnits: 1,
    });
    const checkpointPath = path.join(fixture.output, CHECKPOINT_FILE);
    await writeRehashedCheckpoint(checkpointPath, (checkpoint) => {
      checkpoint.records += 1;
    });
    await assert.rejects(
      () => executeFixture026RsdT02({
        profile: "smoke",
        output: fixture.output,
        resume: true,
      }),
      /checkpoint is ahead of raw ledger/iu,
    );
  } finally {
    await cleanup(fixture);
  }
});

test("resume rejects validly rehashed impossible scientific records", async () => {
  const fixture = await corruptPartial(async ({ fixture: current, rawPath, raw }) => {
    const record = JSON.parse(raw.trimEnd());
    assert.equal(record.evaluator.reported_output_max, 1);
    record.evaluator.reported_output_max = 2;
    const payload = { ...record };
    delete payload.integrity;
    record.integrity.record_sha256 = sha256Hex(
      `${record.integrity.previous_sha256}\n${canonicalize(payload)}`,
    );
    const mutated = `${JSON.stringify(record)}\n`;
    assert.equal(Buffer.byteLength(mutated), Buffer.byteLength(raw));
    await writeFile(rawPath, mutated);
    await rm(path.join(current.output, CHECKPOINT_FILE));
  });
  try {
    await assert.rejects(
      () => executeFixture026RsdT02({ profile: "smoke", output: fixture.output, resume: true }),
      /semantic replay mismatch|closed cross-field or authority contract/iu,
    );
  } finally {
    await cleanup(fixture);
  }
});
