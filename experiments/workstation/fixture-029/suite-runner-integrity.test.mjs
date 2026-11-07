import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  assertFixture029SuiteAnalysis,
  assertFixture029SuiteConfig,
} from "./suite-contract.mjs";
import {
  computeFixture029SuiteAnalysis,
  executeFixture029Suite,
} from "./suite-runner.mjs";
import { createFixture029SuiteTestSupport } from "./suite-runner.test-support.mjs";
import { swapJsonlRows } from "../lib/runner-test-helpers.mjs";

const support = createFixture029SuiteTestSupport();
let base;

test.before(async () => {
  base = await support.temporaryOutput("fixture-029-suite-integrity-base-");
  await executeFixture029Suite({ profile: "smoke", output: base.output });
});

test.after(async () => {
  await support.cleanup();
});

test("suite validation rejects subrun tamper even when the receipt ledger is untouched", async () => {
  const fixture = await support.clonedBase(base, "fixture-029-suite-subrun-tamper-");
  const rawPath = path.join(fixture.output, "cmb-x04", "raw-events.jsonl");
  const rows = (await readFile(rawPath, "utf8")).trimEnd().split("\n");
  const record = JSON.parse(rows[0]);
  record.resources.logical_operations += 1;
  rows[0] = JSON.stringify(record);
  await writeFile(rawPath, `${rows.join("\n")}\n`);
  await assert.rejects(
    () => computeFixture029SuiteAnalysis(fixture.output),
    /runtime contract|hash-chain|no longer binds/iu,
  );
});

test("suite receipt ledger rejects tamper and reordering", async () => {
  const tampered = await support.clonedBase(base, "fixture-029-suite-receipt-tamper-");
  const rankingText = await support.clonedBase(base, "fixture-029-suite-receipt-ranking-");
  const reordered = await support.clonedBase(base, "fixture-029-suite-receipt-reorder-");

  const tamperPath = path.join(tampered.output, "suite-receipts.jsonl");
  const tamperRows = (await readFile(tamperPath, "utf8")).trimEnd().split("\n");
  const hostile = JSON.parse(tamperRows[0]);
  hostile.subrun_summary.ledger_records -= 1;
  tamperRows[0] = JSON.stringify(hostile);
  await writeFile(tamperPath, `${tamperRows.join("\n")}\n`);
  await assert.rejects(
    () => computeFixture029SuiteAnalysis(tampered.output),
    /closed runtime contract|hash-chain/iu,
  );

  const rankingPath = path.join(rankingText.output, "suite-receipts.jsonl");
  const rankingRows = (await readFile(rankingPath, "utf8")).trimEnd().split("\n");
  const rankingHostile = JSON.parse(rankingRows[1]);
  rankingHostile.interpretation = "NO_RESULT: CMB-X04 ranks ahead of CMB-X01.";
  rankingRows[1] = JSON.stringify(rankingHostile);
  await writeFile(rankingPath, `${rankingRows.join("\n")}\n`);
  await assert.rejects(
    () => computeFixture029SuiteAnalysis(rankingText.output),
    /closed runtime contract|hash-chain/iu,
  );

  await swapJsonlRows(path.join(reordered.output, "suite-receipts.jsonl"));
  await assert.rejects(
    () => computeFixture029SuiteAnalysis(reordered.output),
    /closed runtime contract|hash-chain/iu,
  );
});

test("runtime schema rejects result, comparison, ranking, and expanded claim authority", async () => {
  const analysis = structuredClone(await computeFixture029SuiteAnalysis(base.output));
  for (const mutate of [
    (value) => { value.result_label = "RESULT"; },
    (value) => { value.comparison_inference_permitted = true; },
    (value) => { value.ranking_permitted = true; },
    (value) => { value.execution_claims.push("C-9999"); },
  ]) {
    const hostile = structuredClone(analysis);
    mutate(hostile);
    assert.throws(
      () => assertFixture029SuiteAnalysis(hostile),
      /closed runtime schema/iu,
    );
  }
});

test("persisted suite run rejects authority, ranking text, and subrun metadata tampering", async () => {
  const hostiles = [
    ["authority", (run) => { run.claim_eligible = true; }],
    ["ranking-text", (run) => {
      run.interpretation = "NO_RESULT: CMB-X01 ranks ahead of CMB-X04.";
    }],
    ["subrun-id", (run) => { run.subrun_ids["CMB-X01"] = "f".repeat(64); }],
    ["subrun-summary", (run) => {
      run.subrun_summaries["CMB-X04"].ledger_records -= 1;
    }],
    ["expanded", (run) => { run.unregistered_authority = "none"; }],
  ];
  for (const [label, mutate] of hostiles) {
    const fixture = await support.clonedBase(base, `fixture-029-suite-run-${label}-`);
    const runPath = path.join(fixture.output, "suite-run.json");
    const run = JSON.parse(await readFile(runPath, "utf8"));
    mutate(run);
    await writeFile(runPath, `${JSON.stringify(run, null, 2)}\n`);
    await assert.rejects(
      () => computeFixture029SuiteAnalysis(fixture.output),
      /closed persisted contract|no longer binds/iu,
      label,
    );
  }
});

test("configuration validator rejects reordered tracks and a second *_per_seed field", async () => {
  const config = JSON.parse(await readFile(
    new URL("./configs/suite-smoke.json", import.meta.url),
    "utf8",
  ));
  const reordered = structuredClone(config);
  reordered.tracks.reverse();
  assert.throws(() => assertFixture029SuiteConfig(reordered), /closed runtime schema/iu);

  const expanded = structuredClone(config);
  expanded.artifacts_per_seed = 24;
  assert.throws(() => assertFixture029SuiteConfig(expanded), /closed runtime schema/iu);
});
