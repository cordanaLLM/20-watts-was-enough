import assert from "node:assert/strict";
import {
  appendFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import { testWithHostDeadline } from "../../../scripts/lib/host-test-deadline.mjs";
import path from "node:path";
import { before, test } from "node:test";
import { fileURLToPath } from "node:url";

import { createAjv } from "../lib/ajv.mjs";

import { canonicalize, sha256Hex } from "../lib/checkpoint-ledger.mjs";
import {
  openFixture026RsdT02FixedInstanceIsolatedDurableRun,
} from "./rsd-t02-fixed-instance-isolated-durable-runner.mjs";
import {
  FIXTURE_026_RSD_T02_PUBLIC_DEVELOPMENT_ISOLATED_DURABLE_POPULATION_CONFIG_SHA256,
  assertFixture026RsdT02PublicDevelopmentIsolatedDurablePopulationConfig,
  openFixture026RsdT02PublicDevelopmentIsolatedDurablePopulationRun,
} from "./rsd-t02-public-development-isolated-durable-population-runner.mjs";
import { Fixture026RsdT02RunLockContentionError } from "./rsd-t02-run-lock.mjs";
import { generateFixture026RsdT02DevelopmentPanel } from "./rsd-t02-system-family-generator.mjs";

const fixtureRoot = path.dirname(fileURLToPath(import.meta.url));
const OWNER = "fixture-026-integrated-population-owner-v1";
const FOREIGN_OWNER = "fixture-026-integrated-foreign-owner-v1";

let config;
let populationConfig;
let populationDesign;
let registry;
let plan;
let runnerConfig;
let fixedDurableConfig;
let validateSchema;
let instances;

function request(outputDirectory, ownerId = OWNER) {
  return {
    config,
    population_config: populationConfig,
    population_design: populationDesign,
    registry,
    plan,
    fixed_instance_runner_config: runnerConfig,
    fixed_instance_isolated_durable_config: fixedDurableConfig,
    output_directory: outputDirectory,
    owner_id: ownerId,
  };
}

function openRun(outputDirectory, ownerId = OWNER) {
  return openFixture026RsdT02PublicDevelopmentIsolatedDurablePopulationRun(
    request(outputDirectory, ownerId),
  );
}

function instanceDirectoryName(sequence) {
  return `${String(sequence).padStart(3, "0")}--${instances[sequence].manifest.instance_id}`;
}

function directFixedRun(outputDirectory, sequence = 0) {
  return openFixture026RsdT02FixedInstanceIsolatedDurableRun({
    config: fixedDurableConfig,
    runner_config: runnerConfig,
    registry,
    instance: instances[sequence],
    output_directory: path.join(
      outputDirectory,
      "instances",
      instanceDirectoryName(sequence),
      config.population_contract.fixed_instance_output_leaf,
    ),
    owner_id: OWNER,
  });
}

before(async () => {
  const texts = await Promise.all([
    "configs/rsd-t02-public-development-isolated-durable-population.json",
    "configs/rsd-t02-public-development-population-runner.json",
    "configs/rsd-t02-population-design.json",
    "configs/rsd-t02-system-family-registry.json",
    "configs/rsd-t02-development-instance-plan.json",
    "configs/rsd-t02-fixed-instance-runner.json",
    "configs/rsd-t02-fixed-instance-isolated-durable.json",
    "rsd-t02-public-development-isolated-durable-population-runner.schema.json",
  ].map((relativePath) => readFile(path.join(fixtureRoot, relativePath), "utf8")));
  [
    config,
    populationConfig,
    populationDesign,
    registry,
    plan,
    runnerConfig,
    fixedDurableConfig,
  ] = texts.slice(0, 7).map(JSON.parse);
  validateSchema = createAjv({ allErrors: true }).compile(
    JSON.parse(texts[7]),
  );
  const panel = generateFixture026RsdT02DevelopmentPanel({ registry, plan });
  const drawOrder = new Map(plan.conformance_draw_indices.map((draw, index) => [draw, index]));
  const familyOrder = new Map(registry.families.map((family, index) => [family.family_id, index]));
  instances = [...panel.instances].sort((left, right) => (
    drawOrder.get(left.draw_receipt.draw_index) - drawOrder.get(right.draw_receipt.draw_index)
      || familyOrder.get(left.family_id) - familyOrder.get(right.family_id)
  ));
});

test("integrated config is canonical, schema-valid, public-development-only, and NO_RESULT", () => {
  assert.equal(
    assertFixture026RsdT02PublicDevelopmentIsolatedDurablePopulationConfig(config),
    config,
  );
  assert.equal(validateSchema(config), true, JSON.stringify(validateSchema.errors));
  assert.equal(
    sha256Hex(canonicalize(config)),
    FIXTURE_026_RSD_T02_PUBLIC_DEVELOPMENT_ISOLATED_DURABLE_POPULATION_CONFIG_SHA256,
  );
  assert.equal(config.population_contract.canonical_instance_count, 20);
  assert.equal(config.population_contract.registered_arms_per_instance, 9);
  assert.equal(config.population_contract.endpoint_aggregation_executed, false);
  assert.equal(config.population_contract.model_comparison_executed, false);
  assert.equal(config.comparison_inference_permitted, false);
  assert.equal(config.claim_eligible, false);
  assert.equal(config.result_label, "NO_RESULT");
});

testWithHostDeadline("completed per-instance work without an outer record resumes exactly once", {
  timeout: 300_000,
}, async () => {
  const outputDirectory = await mkdtemp(path.join(os.tmpdir(), "20w-f026-pop-orphan-"));
  try {
    const fixed = await directFixedRun(outputDirectory);
    const fixedSummary = await fixed.appendRemaining();
    assert.equal(fixedSummary.status, "complete");
    assert.equal(fixedSummary.checkpoint_status, "current");
    await fixed.close();

    const population = await openRun(outputDirectory);
    assert.equal(population.summary().records, 0);
    const appended = await population.appendNextInstance();
    assert.equal(appended.records, 1);
    assert.equal(appended.checkpoint_status, "stale");
    await population.saveCheckpoint();
    await population.close();

    const resumed = await openRun(outputDirectory);
    assert.equal(resumed.summary().records, 1);
    assert.equal(resumed.summary().next_instance_index, 1);
    await resumed.close();
    const raw = (await readFile(path.join(outputDirectory, config.durability.raw_path), "utf8"))
      .trimEnd().split("\n");
    assert.equal(raw.length, 1);
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
});

testWithHostDeadline("outer writer refuses raw-ledger leaf replacement between instance appends", {
  timeout: 300_000,
}, async () => {
  const outputDirectory = await mkdtemp(path.join(os.tmpdir(), "20w-f026-pop-replace-"));
  const rawPath = path.join(outputDirectory, config.durability.raw_path);
  const displacedPath = path.join(outputDirectory, "hostile-displaced-population-run.jsonl");
  try {
    const population = await openRun(outputDirectory);
    await population.appendNextInstance();
    try {
      try {
        await rename(rawPath, displacedPath);
        await writeFile(rawPath, "", "utf8");
        await assert.rejects(
          population.appendNextInstance(),
          /identity|pathname|length|replaced|changed|disappeared/u,
        );
      } catch (error) {
        if (!["EPERM", "EBUSY", "EACCES"].includes(error?.code)) throw error;
      }
    } finally {
      await population.close();
    }
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
});

testWithHostDeadline("open population session refuses and poisons on live instances-directory replacement", {
  timeout: 300_000,
}, async () => {
  const outputDirectory = await mkdtemp(path.join(os.tmpdir(), "20w-f026-pop-instances-replace-"));
  const instancesPath = path.join(outputDirectory, config.durability.instances_directory);
  const displacedPath = path.join(outputDirectory, "hostile-displaced-instances");
  const rawPath = path.join(outputDirectory, config.durability.raw_path);
  let population;
  try {
    population = await openRun(outputDirectory);
    const one = await population.appendNextInstance();
    assert.equal(one.records, 1);

    await rename(instancesPath, displacedPath);
    await mkdir(instancesPath);
    await assert.rejects(
      async () => population.appendNextInstance(),
      /instances-directory identity changed|Output directory identity changed/u,
    );
    assert.equal(population.summary().records, 1);
    assert.equal((await readFile(rawPath, "utf8")).trimEnd().split("\n").length, 1);
    assert.deepEqual(await readdir(instancesPath), []);
    assert.deepEqual(await readdir(displacedPath), [instanceDirectoryName(0)]);
    const displacedDurableEntries = await readdir(path.join(
      displacedPath,
      instanceDirectoryName(0),
      config.population_contract.fixed_instance_output_leaf,
    ));
    assert.equal(displacedDurableEntries.includes(fixedDurableConfig.durability.raw_path), true);
    assert.equal(
      displacedDurableEntries.includes(fixedDurableConfig.durability.checkpoint_path),
      true,
    );
    await assert.rejects(
      async () => population.appendNextInstance(),
      /session is poisoned after an instances-directory identity failure/u,
    );
  } finally {
    if (population !== undefined) await population.close();
    await rm(outputDirectory, { recursive: true, force: true });
  }
});

testWithHostDeadline("partial restart completes all 20, zero-remaining restart revalidates, and hostiles fail closed", {
  timeout: 900_000,
}, async () => {
  const outputDirectory = await mkdtemp(path.join(os.tmpdir(), "20w-f026-pop-full-"));
  const rawPath = path.join(outputDirectory, config.durability.raw_path);
  const checkpointPath = path.join(outputDirectory, config.durability.checkpoint_path);
  try {
    const first = await openRun(outputDirectory);
    const initial = first.summary();
    assert.equal(initial.records, 0);
    assert.equal(initial.checkpoint_status, "missing");
    assert.equal(validateSchema(initial), true, JSON.stringify(validateSchema.errors));
    await assert.rejects(
      openRun(outputDirectory, FOREIGN_OWNER),
      (error) => error instanceof Fixture026RsdT02RunLockContentionError,
    );
    const one = await first.appendNextInstance();
    assert.equal(one.records, 1);
    assert.equal(one.checkpoint_status, "stale");
    const oneCurrent = await first.saveCheckpoint();
    assert.equal(oneCurrent.checkpoint_status, "current");
    await first.close();

    const resumed = await openRun(outputDirectory);
    assert.equal(resumed.summary().records, 1);
    const complete = await resumed.appendRemaining();
    assert.equal(complete.status, "complete");
    assert.equal(complete.records, 20);
    assert.equal(complete.next_instance_index, 20);
    assert.equal(complete.checkpoint_status, "current");
    assert.equal(validateSchema(complete), true, JSON.stringify(validateSchema.errors));
    assert.equal(complete.full_causal_payload_retained_in_outer_ledger, false);
    assert.equal(complete.endpoint_aggregation_executed, false);
    assert.equal(complete.model_comparison_executed, false);
    await resumed.close();

    const zeroRemaining = await openRun(outputDirectory);
    assert.equal(zeroRemaining.summary().status, "complete");
    const unchanged = await zeroRemaining.appendRemaining();
    assert.equal(canonicalize(unchanged), canonicalize(zeroRemaining.summary()));
    await zeroRemaining.close();

    const rawOriginal = await readFile(rawPath, "utf8");
    const checkpointOriginal = await readFile(checkpointPath, "utf8");
    const records = rawOriginal.trimEnd().split("\n").map((line) => JSON.parse(line));
    assert.equal(records.length, 20);
    assert.equal(new Set(records.map((record) => record.instance_id)).size, 20);
    assert.deepEqual(records.map((record) => record.integrity.sequence), [
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
    ]);
    assert.equal(records.every((record) => (
      validateSchema(record)
      && record.isolated_durable_summary.status === "complete"
      && record.isolated_durable_summary.records === 9
      && record.isolated_durable_summary.checkpoint_status === "current"
      && record.full_causal_payload_retained === false
      && record.endpoint_aggregation_executed === false
      && record.model_comparison_executed === false
      && record.result_label === "NO_RESULT"
    )), true, JSON.stringify(validateSchema.errors));
    assert.equal(rawOriginal.includes('"projections"'), false);
    assert.equal(rawOriginal.includes('"samples"'), false);
    assert.equal((await readdir(path.join(outputDirectory, "instances"))).length, 20);

    await assert.rejects(
      openRun(outputDirectory, FOREIGN_OWNER),
      /Checkpoint identity mismatch|outer population record 0|owner/u,
    );

    await writeFile(rawPath, `${records.slice(0, 19).map(JSON.stringify).join("\n")}\n`, "utf8");
    await assert.rejects(openRun(outputDirectory), /Checkpoint is ahead of raw ledger/u);
    await writeFile(rawPath, rawOriginal, "utf8");

    await appendFile(rawPath, "{\"torn\":", "utf8");
    await assert.rejects(openRun(outputDirectory), /torn trailing record/u);
    await writeFile(rawPath, rawOriginal, "utf8");

    await writeFile(
      rawPath,
      rawOriginal.replace(records[0].instance_id, "0".repeat(64)),
      "utf8",
    );
    await assert.rejects(openRun(outputDirectory), /outer population record 0|Hash-chain mismatch/u);
    await writeFile(rawPath, rawOriginal, "utf8");

    await writeFile(rawPath, Buffer.alloc(config.durability.max_raw_bytes + 1, 0x78));
    await assert.rejects(openRun(outputDirectory), /exceeds its frozen byte bound/u);
    await writeFile(rawPath, rawOriginal, "utf8");

    const firstInstanceRaw = path.join(
      outputDirectory,
      "instances",
      records[0].instance_directory,
      config.population_contract.fixed_instance_output_leaf,
      fixedDurableConfig.durability.raw_path,
    );
    const firstInstanceOriginal = await readFile(firstInstanceRaw, "utf8");
    await writeFile(
      firstInstanceRaw,
      firstInstanceOriginal.replace('"arm_id":"A-RAW"', '"arm_id":"C-DUAL"'),
      "utf8",
    );
    await assert.rejects(
      openRun(outputDirectory),
      /disk ledger record 0|Hash-chain mismatch/u,
    );
    await writeFile(firstInstanceRaw, firstInstanceOriginal, "utf8");

    const unexpected = path.join(outputDirectory, "instances", `019--${"f".repeat(64)}`);
    await mkdir(unexpected);
    await assert.rejects(openRun(outputDirectory), /entry bound|unexpected or redirected entry/u);
    await rm(unexpected, { recursive: true, force: true });

    const alias = `${outputDirectory}-alias`;
    let aliasCreated = false;
    try {
      await symlink(outputDirectory, alias, process.platform === "win32" ? "junction" : "dir");
      aliasCreated = true;
      await assert.rejects(openRun(alias), /not a real directory|redirected|reparse/u);
    } catch (error) {
      if (error?.code !== "EPERM") throw error;
    } finally {
      if (aliasCreated) await unlink(alias);
    }

    await writeFile(rawPath, rawOriginal, "utf8");
    await writeFile(checkpointPath, checkpointOriginal, "utf8");
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
});

test("integrated evidence stops before endpoints, model comparison, and claims", () => {
  assert.equal(config.population_contract.full_causal_payload_retained_in_outer_ledger, false);
  assert.equal(config.population_contract.endpoint_aggregation_executed, false);
  assert.equal(config.population_contract.model_comparison_executed, false);
  assert.equal(config.durability.raw_ledger_is_resume_authority, true);
  assert.equal(config.durability.foreign_lock_auto_break, false);
  assert.equal(
    config.durability.owner_authentication,
    "not-provided-caller-custodies-owner-id",
  );
  assert.equal(config.durability.abandoned_lock_recovery, "manual-only-no-auto-break");
  assert.equal(
    config.durability.lock_retirement,
    "retain-randomized-retired-lock-artifact-manual-cleanup-only",
  );
  assert.equal(
    config.durability.integrity_scope,
    "bounded-raw-and-checkpoint-consistency-no-external-rollback-head",
  );
  assert.equal(config.comparison_inference_permitted, false);
  assert.equal(config.claim_eligible, false);
  assert.equal(config.result_label, "NO_RESULT");
});
