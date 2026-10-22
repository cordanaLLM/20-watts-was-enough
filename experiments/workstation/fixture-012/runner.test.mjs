import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  analyzeFixture012,
  executeFixture012,
  main,
  prepareFixture012,
  validateFixture012Output,
} from "./runner.mjs";
import { generateLayoutStudy } from "./generator.mjs";
import {
  assertCliOptionRejections,
  assertDeterministicSmokeExecution,
} from "../lib/runner-test-helpers.mjs";

const root = process.cwd();
const temporaryRoot = path.join(root, "tmp");

async function temporaryOutput(prefix) {
  await mkdir(temporaryRoot, { recursive: true });
  const parent = await mkdtemp(path.join(temporaryRoot, prefix));
  return { parent, output: path.join(parent, "run") };
}

async function removeTemporary(...fixtures) {
  for (const fixture of fixtures) {
    assert.ok(fixture.parent.startsWith(`${temporaryRoot}${path.sep}`));
    await rm(fixture.parent, { recursive: true, force: true });
  }
}

test("smoke preparation declares the exact bounded design and event count", async () => {
  assert.deepEqual(await prepareFixture012("smoke"), {
    valid: true,
    artifact: "fixture-012",
    profile: "smoke",
    seeds: 2,
    studies_per_seed: 4,
    layouts_per_study: 8,
    observations_per_arm: 512,
    events: 1536,
    measured_energy_required: false,
    modeled_work_and_energy_only: true,
    claim_eligible: false,
  });
});

test("the noise-free complete layout population has an exact zero aggregate-mean estimand", async () => {
  for (const profile of ["smoke", "development"]) {
    const config = JSON.parse(await readFile(
      path.join(root, "experiments", "workstation", "fixture-012", "configs", `${profile}.json`),
      "utf8",
    ));
    config.process_noise_fraction = 0;
    config.repeat_noise_fraction = 0;
    const rows = generateLayoutStudy({ seed: 1217, study: 0, config }).randomized;
    const baseline = rows
      .filter((row) => row.variant === "baseline")
      .reduce((sum, row) => sum + row.latency_ns, 0);
    const candidate = rows
      .filter((row) => row.variant === "candidate")
      .reduce((sum, row) => sum + row.latency_ns, 0);
    assert.equal(candidate, baseline, profile);
  }
});

test("the smoke diagnostic exposes a false fixed-layout speedup and rejects it under the mature null", async () => {
  const fixture = await temporaryOutput("fixture-012-smoke-");
  try {
    await executeFixture012({ profile: "smoke", output: fixture.output });
    const summary = await analyzeFixture012(fixture.output);
    const fixed = summary.metrics["fixed-layout-negative-control"];
    const mature = summary.metrics["mature-randomized-counterbalanced"];
    assert.equal(summary.decision, "diagnostic-pass");
    assert.equal(fixed.decision, "speedup");
    assert.ok(fixed.apparent_speedup_fraction >= 0.02);
    assert.equal(mature.decision, "no-detectable-effect");
    assert.ok(Math.abs(mature.mean_effect_fraction) <= 0.01);
    assert.equal(summary.claim_eligible, false);
    assert.equal(summary.scientific_result, false);
    assert.equal(summary.measured_energy_present, false);
    assert.equal(summary.modeled_work_and_energy_only, true);
    assert.equal((await validateFixture012Output(fixture.output)).valid, true);
  } finally {
    await removeTemporary(fixture);
  }
});

test("identical smoke profiles reproduce byte-identical append-only ledgers", async () => {
  const left = await temporaryOutput("fixture-012-left-");
  const right = await temporaryOutput("fixture-012-right-");
  try {
    await assertDeterministicSmokeExecution(executeFixture012, left.output, right.output);
  } finally {
    await removeTemporary(left, right);
  }
});

test("the full development profile is complete and deterministic", async () => {
  const left = await temporaryOutput("fixture-012-development-left-");
  const right = await temporaryOutput("fixture-012-development-right-");
  try {
    const leftRun = await executeFixture012({ profile: "development", output: left.output });
    const rightRun = await executeFixture012({ profile: "development", output: right.output });
    assert.equal(leftRun.run.seeds.length, 4);
    assert.equal(leftRun.run.total_events, 27648);
    assert.equal(rightRun.run.total_events, 27648);
    assert.equal(
      await readFile(path.join(left.output, "raw-events.jsonl"), "utf8"),
      await readFile(path.join(right.output, "raw-events.jsonl"), "utf8"),
    );
    const [leftSummary, rightSummary] = await Promise.all([
      analyzeFixture012(left.output),
      analyzeFixture012(right.output),
    ]);
    assert.deepEqual(leftSummary, rightSummary);
    assert.equal(leftSummary.profile, "development");
    assert.ok(Object.values(leftSummary.checks).every(Boolean));
  } finally {
    await removeTemporary(left, right);
  }
});

test("the operator-qualified and mature arms have exact information and metric parity", async () => {
  const fixture = await temporaryOutput("fixture-012-parity-");
  try {
    await executeFixture012({ profile: "smoke", output: fixture.output });
    const summary = await analyzeFixture012(fixture.output);
    assert.deepEqual(
      summary.metrics["mature-randomized-counterbalanced"],
      summary.metrics["operator-qualified-randomized"],
    );
    assert.equal(summary.checks.complete_mature_null_matches_operator_qualified_exactly, true);
    assert.equal(summary.checks.identical_randomized_information_path, true);
  } finally {
    await removeTemporary(fixture);
  }
});

test("all eligible comparisons receive equal observation, work, and modeled-energy budgets", async () => {
  const fixture = await temporaryOutput("fixture-012-budget-");
  try {
    await executeFixture012({ profile: "smoke", output: fixture.output });
    const summary = await analyzeFixture012(fixture.output);
    const metrics = Object.values(summary.metrics);
    assert.equal(new Set(metrics.map((value) => value.observations)).size, 1);
    assert.equal(new Set(metrics.map((value) => value.modeled_work_units)).size, 1);
    assert.equal(new Set(metrics.map((value) => value.modeled_energy_j)).size, 1);
    assert.equal(summary.checks.exact_observation_budget_parity, true);
    assert.equal(summary.checks.equal_modeled_work_accounting, true);
    assert.equal(summary.checks.equal_modeled_energy_accounting, true);
  } finally {
    await removeTemporary(fixture);
  }
});

test("analysis refuses content corruption in the raw event ledger", async () => {
  const fixture = await temporaryOutput("fixture-012-corrupt-");
  try {
    await executeFixture012({ profile: "smoke", output: fixture.output });
    const rawPath = path.join(fixture.output, "raw-events.jsonl");
    const rows = (await readFile(rawPath, "utf8")).trimEnd().split("\n");
    const first = JSON.parse(rows[0]);
    first.latency_ns += 1;
    rows[0] = JSON.stringify(first);
    await writeFile(rawPath, `${rows.join("\n")}\n`);
    await assert.rejects(() => analyzeFixture012(fixture.output), /runtime contract/);
  } finally {
    await removeTemporary(fixture);
  }
});

test("analysis refuses a replayed or forged ledger append", async () => {
  const fixture = await temporaryOutput("fixture-012-append-");
  try {
    await executeFixture012({ profile: "smoke", output: fixture.output });
    const rawPath = path.join(fixture.output, "raw-events.jsonl");
    const body = await readFile(rawPath, "utf8");
    const last = body.trimEnd().split("\n").at(-1);
    await writeFile(rawPath, `${body}${last}\n`);
    await assert.rejects(() => analyzeFixture012(fixture.output), /sequence|hash chain/);
  } finally {
    await removeTemporary(fixture);
  }
});

test("validation refuses a stored summary that claims scientific authority", async () => {
  const fixture = await temporaryOutput("fixture-012-authority-");
  try {
    await main([
      "node",
      "runner.mjs",
      "smoke",
      "--profile",
      "smoke",
      "--output",
      fixture.output,
    ]);
    const summaryPath = path.join(fixture.output, "analysis", "summary.json");
    const summary = JSON.parse(await readFile(summaryPath, "utf8"));
    summary.claim_eligible = true;
    await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
    await assert.rejects(
      () => validateFixture012Output(fixture.output),
      /not reproducible|scientific/,
    );
  } finally {
    await removeTemporary(fixture);
  }
});

test("CLI parsing refuses implicit outputs and undeclared options", async () => {
  await assertCliOptionRejections(main);
});
