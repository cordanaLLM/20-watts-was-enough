import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  access, cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { BACKEND_METADATA } from "./backend-registry.mjs";
import { canonicalize, nextRecordHash } from "./checkpoint.mjs";
import { analyzeConfirmatory, CONFIRMATORY_PREREGISTRATION } from "./confirmatory-analysis.mjs";
import { buildFactorialDesign } from "./factorial-design.mjs";
import { buildExecutionCapsule, destroyExecutionCapsule } from "./execution-capsule.mjs";
import { createFrozenSeedReleaseContract } from "./release-contract.mjs";
import { captureRuntimeIdentity } from "./runtime-identity.mjs";
import { RunLockContentionError, acquireRunLock } from "./run-lock.mjs";
import { seedListCommitment } from "./seeds/seed-pack.mjs";
import { CANDIDATE_010_SOURCE_FILES, computeSourceBundle } from "./source-bundle.mjs";
import {
  analyzeFactorialRun,
  deriveFactorialRecordIdentities,
  factorialScientificPayload,
  readFactorialRecords,
  runFactorialExperiment,
  validateFactorialRun,
} from "./factorial-runner.mjs";

const execFileAsync = promisify(execFile);

async function withTemporaryOutput(prefix, callback) {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    return await callback(path.join(root, "output"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("factorial writers fail closed before output mutation when another lease owns the run", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "20w-c010-factorial-lock-"));
  const outputDirectory = path.join(temporary, "contended-output");
  const lease = await acquireRunLock({ outputDirectory, runnerId: "hostile-existing-writer" });
  try {
    await assert.rejects(
      runFactorialExperiment({
        config: smokeConfig,
        seeds: [1101],
        scenarios: buildFactorialDesign({ splits: ["development"] }).slice(0, 1),
        outputDirectory,
      }),
      (error) => error instanceof RunLockContentionError,
    );
    await assert.rejects(
      analyzeFactorialRun(outputDirectory),
      (error) => error instanceof RunLockContentionError,
    );
    await assert.rejects(
      validateFactorialRun(outputDirectory),
      (error) => error instanceof RunLockContentionError,
    );
    await assert.rejects(access(outputDirectory), (error) => error.code === "ENOENT");
  } finally {
    await lease.release();
    await rm(temporary, { recursive: true, force: true });
  }
});

test("factorial execution releases its lease when a post-acquisition check fails", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "20w-c010-factorial-unlock-"));
  const outputDirectory = path.join(temporary, "existing-output");
  try {
    await mkdir(outputDirectory);
    await assert.rejects(
      runFactorialExperiment({
        config: smokeConfig,
        seeds: [1101],
        scenarios: buildFactorialDesign({ splits: ["development"] }).slice(0, 1),
        outputDirectory,
      }),
      /already exists/,
    );
    const nextLease = await acquireRunLock({ outputDirectory, runnerId: "verified-next-writer" });
    assert.equal(await nextLease.release(), true);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

const benchmarkRoot = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(.:)/, "$1"));
const repositoryRoot = path.resolve(benchmarkRoot, "..", "..", "..");
const smokeConfig = JSON.parse(await readFile(path.join(benchmarkRoot, "configs", "smoke.json"), "utf8"));

function stableProjection(record) {
  return {
    run_id: record.run_id,
    scenario_id: record.scenario_id,
    task_family: record.task_family,
    backend_id: record.backend_id,
    cluster_id: record.cluster_id,
    pair_id: record.pair_id,
    work_unit_id: record.work_unit_id,
    paired_input_sha256: record.paired_input_sha256,
    arm_order_schedule_id: record.arm_order_schedule_id,
    arm_order_index: record.arm_order_index,
    opportunity_id: record.opportunity_id,
    seed: record.seed,
    arm: record.arm,
    candidate_variant: record.candidate_variant,
    truth_unsafe: record.truth_unsafe,
    evidence: record.evidence,
    trace: record.trace,
    decision: record.decision,
    outcome: record.outcome,
    budget: {
      arm: record.budget.arm,
      assigned_allowance: record.budget.assigned_allowance,
      observed: {
        ...record.budget.observed,
        wall_time_ms: 0,
      },
    },
    filesystem: {
      boundary: record.filesystem.boundary,
      task_family: record.filesystem.task_family,
      backend_id: record.filesystem.backend_id,
      trace_output_sha256: record.filesystem.trace_output_sha256,
      staged_bytes_written: record.filesystem.staged_bytes_written,
      durable_bytes_written: record.filesystem.durable_bytes_written,
      rollbackComplete: record.filesystem.rollbackComplete,
      commitComplete: record.filesystem.commitComplete,
      irreversible_violation: record.filesystem.irreversible_violation,
    },
  };
}

async function rewriteLedger(outputDirectory, mutate) {
  const rawPath = path.join(outputDirectory, "raw", "events.ndjson");
  const runPath = path.join(outputDirectory, "provenance", "run.json");
  const checkpointPath = path.join(outputDirectory, "provenance", "checkpoint.json");
  const records = (await readFile(rawPath, "utf8")).trim().split(/\r?\n/).map(JSON.parse);
  mutate(records);
  const digest = createHash("sha256");
  let previous = "0".repeat(64);
  for (const [sequence, record] of records.entries()) {
    delete record.integrity;
    const payload = canonicalize(factorialScientificPayload(record));
    const recordSha256 = nextRecordHash(previous, payload);
    record.integrity = {
      sequence,
      previous_sha256: previous,
      record_sha256: recordSha256,
    };
    digest.update(payload);
    previous = recordSha256;
  }
  await writeFile(rawPath, `${records.map(JSON.stringify).join("\n")}\n`, "utf8");
  const run = JSON.parse(await readFile(runPath, "utf8"));
  run.scientific_payload_sha256 = digest.digest("hex");
  run.hash_chain_sha256 = previous;
  await writeFile(runPath, `${JSON.stringify(run, null, 2)}\n`, "utf8");
  const checkpoint = JSON.parse(await readFile(checkpointPath, "utf8"));
  checkpoint.scientific_payload_sha256 = run.scientific_payload_sha256;
  checkpoint.hash_chain_sha256 = run.hash_chain_sha256;
  checkpoint.completed_work_units_sha256 = createHash("sha256")
    .update(canonicalize(records.map((record) => {
      const identities = deriveFactorialRecordIdentities(record);
      return [
        identities.cluster_id,
        identities.pair_id,
        identities.work_unit_id,
        identities.paired_input_sha256,
      ].join("\u0000");
    }).sort()))
    .digest("hex");
  delete checkpoint.checkpoint_sha256;
  checkpoint.checkpoint_sha256 = createHash("sha256")
    .update(canonicalize(checkpoint))
    .digest("hex");
  await writeFile(checkpointPath, `${JSON.stringify(checkpoint, null, 2)}\n`, "utf8");
}

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function candidateProductionFiles(directory, repositoryRootPath) {
  const files = [];
  const directories = [directory];
  for (let index = 0; index < directories.length; index += 1) {
    const entries = await readdir(directories[index], { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(directories[index], entry.name);
      if (entry.isDirectory()) directories.push(absolute);
      else if (entry.isFile() && entry.name.endsWith(".mjs") && !entry.name.endsWith(".test.mjs")) {
        files.push(path.relative(repositoryRootPath, absolute).replaceAll("\\", "/"));
      }
    }
  }
  return files.sort();
}

async function git(cwd, ...args) {
  return execFileAsync("git", ["-c", "core.autocrlf=false", ...args], { cwd, windowsHide: true });
}

async function commitFixtureSourceBundle(fixtureRepository, candidateRelative) {
  const sharedLibraryPrefix = "experiments/workstation/lib/";
  const currentCandidateRoot = path.join(repositoryRoot, ...candidateRelative.split("/"));
  const sourceFiles = [
    ...await candidateProductionFiles(currentCandidateRoot, repositoryRoot),
    ...CANDIDATE_010_SOURCE_FILES.filter((file) => file.startsWith(sharedLibraryPrefix)),
  ].sort();
  for (const relative of [...sourceFiles, "package.json", "package-lock.json"]) {
    const destination = path.join(fixtureRepository, ...relative.split("/"));
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(path.join(repositoryRoot, ...relative.split("/")), destination);
  }
  await cp(
    path.join(repositoryRoot, "node_modules", "es-module-lexer"),
    path.join(fixtureRepository, "node_modules", "es-module-lexer"),
    { recursive: true },
  );
  await git(fixtureRepository, "init");
  await git(fixtureRepository, "config", "user.email", "candidate-010-fixture@example.invalid");
  await git(fixtureRepository, "config", "user.name", "Candidate 010 Fixture");
  await git(fixtureRepository, "add", "--", "package.json", "package-lock.json", candidateRelative, sharedLibraryPrefix);
  await git(fixtureRepository, "commit", "-m", "candidate 010 capsule fixture");
  const { stdout } = await git(fixtureRepository, "rev-parse", "HEAD");
  return computeSourceBundle({
    root: fixtureRepository,
    sourceFiles,
    vcs: { source_commit: stdout.trim(), worktree_state: "temporary-committed-capsule-fixture" },
  });
}

async function writeReleaseBindings({
  bindingRoot,
  executionCapsule,
  expectedSourceBundle,
  candidateRelative,
  config,
  scenarios,
  seeds,
}) {
  const files = {
    sourceBundlePath: "source-bundle.json",
    executionDescriptorPath: "execution-descriptor.json",
    runtimeIdentityPath: "runtime-identity.json",
    configPath: "config.json",
    designPath: "design.json",
    backendRegistryPath: "backend-registry.mjs",
    preregistrationPath: "preregistration.json",
    commitmentPath: "seeds.commit.json",
    revealPath: "seeds.reveal.json",
  };
  const commitment = seedListCommitment(seeds);
  await writeJson(path.join(bindingRoot, files.sourceBundlePath), expectedSourceBundle);
  await writeJson(
    path.join(bindingRoot, files.executionDescriptorPath),
    executionCapsule.descriptor,
  );
  await writeJson(
    path.join(bindingRoot, files.runtimeIdentityPath),
    executionCapsule.descriptor.runtime_identity,
  );
  await writeJson(path.join(bindingRoot, files.configPath), config);
  await writeJson(path.join(bindingRoot, files.designPath), { scenarios });
  await cp(
    path.join(executionCapsule.local.source_root, ...candidateRelative.split("/"), "backend-registry.mjs"),
    path.join(bindingRoot, files.backendRegistryPath),
  );
  await writeJson(path.join(bindingRoot, files.preregistrationPath), { id: "fixture-preregistration" });
  await writeJson(path.join(bindingRoot, files.commitmentPath), {
    schema: 1,
    partition: "confirmation",
    state: "sealed",
    algorithm: "sha256-json-array-v1",
    seed_count: seeds.length,
    commitment,
  });
  await writeJson(path.join(bindingRoot, files.revealPath), {
    schema: 1,
    partition: "confirmation",
    state: "frozen-reveal",
    algorithm: "sha256-json-array-v1",
    commitment,
    seeds,
  });
  return { files, commitment };
}

async function writeFrozenRelease(bindingRoot, executionCapsule, files) {
  const contract = await createFrozenSeedReleaseContract({
    bindingRoot,
    sourceRoot: executionCapsule.local.source_root,
    releaseVersion: 1,
    partition: "confirmation",
    phase: "confirmation",
    ...files,
  });
  const releasePath = path.join(bindingRoot, "release.json");
  await writeJson(releasePath, contract);
  return { contract, releasePath };
}

async function temporaryCapsuleConfirmationFixture({ config, scenarios, seeds = [4_040_401] }) {
  const container = await mkdtemp(path.join(os.tmpdir(), "20w-c010-authority-integration-"));
  const fixtureRepository = path.join(container, "repository");
  const candidateRelative = "experiments/workstation/candidate-010";
  const fixtureCandidateRoot = path.join(fixtureRepository, ...candidateRelative.split("/"));
  const executionParent = path.join(container, "execution-parent");
  const bindingRoot = path.join(container, "release-bindings");
  let executionCapsule = null;
  try {
    await mkdir(fixtureCandidateRoot, { recursive: true });
    await mkdir(executionParent);
    await mkdir(bindingRoot);
    const expectedSourceBundle = await commitFixtureSourceBundle(fixtureRepository, candidateRelative);
    const runtimeIdentity = await captureRuntimeIdentity({
      repositoryRoot: fixtureRepository,
      candidateRoot: fixtureCandidateRoot,
    });
    executionCapsule = await buildExecutionCapsule({
      repositoryRoot: fixtureRepository,
      executionParent,
      runtimeIdentity,
      sourcePaths: expectedSourceBundle.files.map((entry) => entry.path),
      candidateDirectory: candidateRelative,
    });
    const { files, commitment } = await writeReleaseBindings({
      bindingRoot,
      executionCapsule,
      expectedSourceBundle,
      candidateRelative,
      config,
      scenarios,
      seeds,
    });
    const { contract, releasePath } = await writeFrozenRelease(bindingRoot, executionCapsule, files);
    return {
      container,
      executionCapsule,
      expectedSourceBundle,
      bindingRoot,
      contract,
      commitment,
      release: {
        bindingRoot,
        releasePath,
        disjointWith: [{ partition: "held-out", seeds: [9_090_901] }],
      },
    };
  } catch (error) {
    const failures = [error];
    if (executionCapsule) await destroyExecutionCapsule(executionCapsule).catch((cleanupError) => failures.push(cleanupError));
    await rm(container, { recursive: true, force: true });
    if (failures.length > 1) throw new AggregateError(failures, "Capsule fixture setup and cleanup failed.", { cause: error });
    throw error;
  }
}

async function usingTemporaryCapsuleConfirmationFixture(options, run) {
  const fixture = await temporaryCapsuleConfirmationFixture(options);
  try {
    return await run(fixture);
  } finally {
    await destroyExecutionCapsule(fixture.executionCapsule);
    await rm(fixture.container, { recursive: true, force: true });
  }
}

function confirmationContext(phase = "implementation-test") {
  return {
    schema: 1,
    phase,
    frozen_release: false,
    preregistration_id: CONFIRMATORY_PREREGISTRATION.id,
    task_families: Object.fromEntries(BACKEND_METADATA.map((backend) => [backend.task_family, {
      implemented: backend.implemented,
      backend_ids: [backend.backend_id],
    }])),
    budget: {
      contract_id: "candidate-010-equal-budget-v1",
      validated: true,
      within_budget: true,
    },
  };
}

function confirmationLaunchProvenance(marker = "a") {
  const hashes = [marker, "b", "c", "d", "e"].map((value) => value.repeat(64));
  return {
    launch_request_sha256: hashes[0],
    request_nonce_sha256: hashes[1],
    sanitized_environment_sha256: hashes[2],
    exec_argv_sha256: hashes[3],
    parent_pre_verification_sha256: hashes[4],
  };
}

test("the complete 48-scenario matrix executes through four real isolated backends", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "20w-c010-factorial-all-"));
  const outputDirectory = path.join(temporary, "run");
  const config = { ...smokeConfig, profile: "implementation-test", opportunities_per_seed: 1 };
  const scenarios = buildFactorialDesign();
  try {
    const result = await runFactorialExperiment({
      config,
      seeds: [919_191],
      scenarios,
      outputDirectory,
      executionMode: "implementation-test",
    });
    assert.equal(result.complete, true);
    assert.equal(result.run.scenario_count, 48);
    assert.equal(result.run.records, 48 * 7);
    assert.deepEqual(result.run.task_families, [
      "actuator-command",
      "filesystem-publish",
      "signed-publication",
      "transactional-kv",
    ]);
    assert.equal(result.run.claim_eligible, false);
    assert.equal(result.run.physical_actuation, false);
    assert.match(result.run.run_identity.source_bundle_sha256, /^[0-9a-f]{64}$/);
    assert.match(result.run.run_identity.source_commit, /^[0-9a-f]{40}$/);
    const frozenSource = JSON.parse(await readFile(
      path.join(outputDirectory, "provenance", "source-bundle.json"),
      "utf8",
    ));
    assert.equal(frozenSource.source_sha256, result.run.run_identity.source_bundle_sha256);

    const validation = await validateFactorialRun(outputDirectory);
    assert.equal(validation.valid, true);
    assert.equal(validation.records, 336);
    assert.equal(validation.assignments, 48);
    assert.equal(validation.claim_eligible, false);

    const summary = await analyzeFactorialRun(outputDirectory);
    assert.equal(summary.claim_eligible, false);
    assert.equal(summary.rows.length, 4 * 7);
    assert.ok(summary.rows.every((row) => row.irreversible_violations === 0));

    const records = await readFactorialRecords(outputDirectory);
    assert.equal(new Set(records.map((record) => record.filesystem.backend_id)).size, 4);
    assert.ok(records.every((record) => record.filesystem.physical_actuation === false));
    assert.ok(records.every((record) => (
      record.cluster_id === deriveFactorialRecordIdentities(record).cluster_id
    )));
    assert.equal(new Set(records.map((record) => record.work_unit_id)).size, records.length);
    assert.equal(new Set(records.map((record) => record.pair_id)).size, records.length / 7);
    assert.equal(new Set(records.map((record) => record.cluster_id)).size, 4);
    assert.ok(records.every((record) => (
      Date.parse(record.measurement_interval.ended_at)
      > Date.parse(record.measurement_interval.started_at)
    )));
    assert.ok(records.every((record) => record.resources.external_energy === null));
    const retryRecords = records.filter((record) => record.arm === "retry-rollback");
    assert.ok(retryRecords.every((record) => (
      record.comparator_lineage?.implementation_id === "candidate-010-two-lifecycle-retry-rollback-v1"
      && record.comparator_lineage.first_rollback_validated === true
      && record.comparator_lineage.attempts.length === 2
      && record.resources.policy_evaluations === 2
      && record.filesystem.staged_bytes_written
        === record.comparator_lineage.attempts.reduce((sum, attempt) => sum + attempt.staged_bytes_written, 0)
      && record.comparator_lineage.attempts.every((attempt) => (
        /^[0-9a-f]{64}$/.test(attempt.filesystem_snapshot?.snapshot_sha256 ?? "")
      ))
    )));
    const recordsByPair = Map.groupBy(records, (record) => record.pair_id);
    assert.ok([...recordsByPair.values()].every((pair) => {
      const singleLifecycleBytes = pair
        .filter((record) => record.arm !== "retry-rollback")
        .map((record) => record.filesystem.staged_bytes_written);
      const retry = pair.find((record) => record.arm === "retry-rollback");
      return new Set(singleLifecycleBytes).size === 1
        && retry.comparator_lineage.attempts.every((attempt) => (
          attempt.staged_bytes_written === singleLifecycleBytes[0]
        ))
        && retry.filesystem.staged_bytes_written === singleLifecycleBytes[0] * 2;
    }));
    const independentRecords = records.filter((record) => record.arm === "independent-verifier");
    assert.ok(independentRecords.every((record) => (
      record.comparator_lineage?.implementation_id === "candidate-010-independent-sha512-verifier-v1"
      && record.comparator_lineage.shared_trace_implementation === false
      && record.trace.revealed === false
      && record.trace.verifier === null
    )));
    const boundaryNames = await readdir(path.join(outputDirectory, "boundaries"));
    assert.ok(boundaryNames.every((name) => /^[0-9a-f]{64}$/.test(name)));
    assert.deepEqual(
      new Set(records.filter((record) => record.arm === "reset-coupled").map((record) => record.candidate_variant)),
      new Set([
        "verifier-coupled-finalization-v1",
        "verifier-observed-finalization-decoupled-v1",
        "verifier-withheld-coupling-unobservable-v1",
        "verifier-withheld-finalization-decoupled-v1",
      ]),
    );

    const confirmatory = analyzeConfirmatory({
      records,
      context: confirmationContext(),
    });
    assert.equal(confirmatory.decision, "abstain");
    assert.equal(confirmatory.eligible_for_superiority_claim, false);
    assert.ok(confirmatory.abstain_reasons.includes("not a frozen held-out confirmation release"));

    let retryRoot = null;
    for (const name of boundaryNames) {
      const candidate = path.join(outputDirectory, "boundaries", name, "retry-action");
      try {
        await access(candidate);
        retryRoot = candidate;
        break;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    assert.ok(retryRoot, "a retry-action boundary must exist");
    await writeFile(path.join(retryRoot, "unreported-state.bin"), "post-evidence mutation");
    await assert.rejects(
      validateFactorialRun(outputDirectory),
      /retry\/rollback lifecycle invalid/,
    );
  } finally {
    assert.ok(temporary.startsWith(os.tmpdir()));
    await rm(temporary, { recursive: true, force: true });
  }
});

test("factorial resume refuses mutations and reproduces stable decisions across all backends", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "20w-c010-factorial-resume-"));
  const interruptedDirectory = path.join(root, "interrupted");
  const uninterruptedDirectory = path.join(root, "uninterrupted");
  const config = { ...smokeConfig, profile: "implementation-test", opportunities_per_seed: 1 };
  const completeDesign = buildFactorialDesign();
  const scenarios = [
    "filesystem-publish",
    "transactional-kv",
    "signed-publication",
    "actuator-command",
  ].map((family) => completeDesign.find((scenario) => (
    scenario.task_family === family
    && scenario.factors.trace_revelation === "revealed"
    && scenario.factors.verifier_decision_coupling === "coupled"
  )));
  try {
    const interrupted = await runFactorialExperiment({
      config,
      seeds: [717_171],
      scenarios,
      outputDirectory: interruptedDirectory,
      executionMode: "implementation-test",
      stopAfterRecords: 9,
    });
    assert.equal(interrupted.complete, false);
    assert.equal(interrupted.run.records, 9);

    await assert.rejects(
      runFactorialExperiment({
        config: { ...config, threshold: config.threshold + 0.1 },
        seeds: [717_171],
        scenarios,
        outputDirectory: interruptedDirectory,
        executionMode: "implementation-test",
        resume: true,
      }),
      /Resume config differs/,
    );
    await assert.rejects(
      runFactorialExperiment({
        config,
        seeds: [717_172],
        scenarios,
        outputDirectory: interruptedDirectory,
        executionMode: "implementation-test",
        resume: true,
      }),
      /Resume seeds differ/,
    );

    const resumed = await runFactorialExperiment({
      config,
      seeds: [717_171],
      scenarios,
      outputDirectory: interruptedDirectory,
      executionMode: "implementation-test",
      resume: true,
    });
    const uninterrupted = await runFactorialExperiment({
      config,
      seeds: [717_171],
      scenarios,
      outputDirectory: uninterruptedDirectory,
      executionMode: "implementation-test",
    });
    assert.equal(resumed.run.records, 28);
    assert.equal(uninterrupted.run.records, 28);
    assert.equal((await validateFactorialRun(interruptedDirectory)).valid, true);
    assert.deepEqual(
      (await readFactorialRecords(interruptedDirectory)).map(stableProjection),
      (await readFactorialRecords(uninterruptedDirectory)).map(stableProjection),
    );
  } finally {
    assert.ok(root.startsWith(os.tmpdir()));
    await rm(root, { recursive: true, force: true });
  }
});

test("confirmation task families cannot run as development evidence", async () => {
  await withTemporaryOutput("20w-c010-forbidden-confirmation-", async (output) => {
    await assert.rejects(
      runFactorialExperiment({
        config: { ...smokeConfig, profile: "development", opportunities_per_seed: 1 },
        seeds: [123],
        scenarios: buildFactorialDesign({ splits: ["confirmation"] }),
        outputDirectory: output,
        executionMode: "development",
      }),
      /fresh frozen seed release/,
    );
  });
});

test("canonical task-family binding rejects split relabeling before execution", async () => {
  const signed = buildFactorialDesign({ splits: ["confirmation"] })[0];
  const relabeled = {
    ...signed,
    id: "../../adversarial-scenario-id",
    split: "validation",
  };
  await withTemporaryOutput("20w-c010-mutated-split-", async (output) => {
    await assert.rejects(
      runFactorialExperiment({
        config: { ...smokeConfig, profile: "implementation-test", opportunities_per_seed: 1 },
        seeds: [808_081],
        scenarios: [relabeled],
        outputDirectory: output,
        executionMode: "implementation-test",
      }),
      /canonically bound/,
    );
    await assert.rejects(readdir(output), (error) => error?.code === "ENOENT");
  });
});

test("validation rejects arm-asymmetric paired input against the frozen schedule", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "20w-c010-pair-hostile-"));
  const output = path.join(root, "run");
  const scenario = buildFactorialDesign({ splits: ["development"] })[0];
  try {
    await runFactorialExperiment({
      config: { ...smokeConfig, profile: "identity-test", opportunities_per_seed: 1 },
      seeds: [606_061],
      scenarios: [scenario],
      outputDirectory: output,
      executionMode: "development",
    });
    await rewriteLedger(output, (records) => {
      records[0].evidence = [...records[0].evidence];
      records[0].evidence[0] += 1;
      records[0].paired_input_sha256 = deriveFactorialRecordIdentities(records[0]).paired_input_sha256;
    });
    await assert.rejects(
      validateFactorialRun(output),
      /record is not in the frozen factorial schedule|paired input differs across arms/,
    );
  } finally {
    assert.ok(root.startsWith(os.tmpdir()));
    await rm(root, { recursive: true, force: true });
  }
});

test("validation recomputes independent-verifier lineage from frozen input", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "20w-c010-independent-hostile-"));
  const output = path.join(root, "run");
  const scenario = buildFactorialDesign({ splits: ["development"] })[0];
  try {
    await runFactorialExperiment({
      config: { ...smokeConfig, profile: "independent-hostile", opportunities_per_seed: 1 },
      seeds: [606_062],
      scenarios: [scenario],
      outputDirectory: output,
      executionMode: "development",
    });
    await rewriteLedger(output, (records) => {
      const record = records.find((row) => row.arm === "independent-verifier");
      record.comparator_lineage.output_sha256 = "f".repeat(64);
    });
    await assert.rejects(
      validateFactorialRun(output),
      /lineage hashes do not match|independent implementation identity/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("validation refuses retry accounting that hides the first lifecycle's staged work", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "20w-c010-retry-work-hostile-"));
  const output = path.join(root, "run");
  const scenario = buildFactorialDesign({ splits: ["development"] })[0];
  try {
    await runFactorialExperiment({
      config: { ...smokeConfig, profile: "retry-work-hostile", opportunities_per_seed: 1 },
      seeds: [606_063],
      scenarios: [scenario],
      outputDirectory: output,
      executionMode: "development",
    });
    await rewriteLedger(output, (records) => {
      const record = records.find((row) => row.arm === "retry-rollback");
      const hiddenTotal = record.comparator_lineage.attempts[1].staged_bytes_written;
      record.filesystem.staged_bytes_written = hiddenTotal;
      record.resources.staged_bytes_written = hiddenTotal;
      record.budget.observed.staged_bytes = hiddenTotal;
    });
    await assert.rejects(
      validateFactorialRun(output),
      /did not pay or report all lifecycle work|total actual staged work is incomplete/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ledger reopening rejects tampered stable IDs after record rehashing", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "20w-c010-id-hostile-"));
  const output = path.join(root, "run");
  const scenario = buildFactorialDesign({ splits: ["development"] })[0];
  try {
    await runFactorialExperiment({
      config: { ...smokeConfig, profile: "identity-test", opportunities_per_seed: 1 },
      seeds: [707_071],
      scenarios: [scenario],
      outputDirectory: output,
      executionMode: "development",
    });
    await rewriteLedger(output, (records) => {
      records[0].pair_id = `c010-pair-${"0".repeat(64)}`;
    });
    await assert.rejects(validateFactorialRun(output), /pair_id identity mismatch/);
  } finally {
    assert.ok(root.startsWith(os.tmpdir()));
    await rm(root, { recursive: true, force: true });
  }
});

test("frozen arm ordering counterbalances every arm across opportunity positions", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "20w-c010-arm-order-"));
  const output = path.join(root, "run");
  const scenario = buildFactorialDesign({ splits: ["development"] })[0];
  try {
    await runFactorialExperiment({
      config: { ...smokeConfig, profile: "arm-order-test", opportunities_per_seed: 7 },
      seeds: [909_091],
      scenarios: [scenario],
      outputDirectory: output,
      executionMode: "development",
    });
    const records = await readFactorialRecords(output);
    for (const arm of scenario.eligible_arms) {
      assert.deepEqual(
        new Set(records.filter((record) => record.arm === arm).map((record) => record.arm_order_index)),
        new Set([0, 1, 2, 3, 4, 5, 6]),
      );
    }
    const byPair = new Map();
    for (const record of records) {
      const rows = byPair.get(record.pair_id) ?? [];
      rows.push(record);
      byPair.set(record.pair_id, rows);
    }
    assert.equal(byPair.size, 7);
    assert.ok([...byPair.values()].every((rows) => (
      new Set(rows.map((record) => record.arm_order_schedule_id)).size === 1
      && new Set(rows.map((record) => record.arm_order_index)).size === 7
    )));
  } finally {
    assert.ok(root.startsWith(os.tmpdir()));
    await rm(root, { recursive: true, force: true });
  }
});

test("validation rejects a nonpositive record-owned measurement interval", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "20w-c010-interval-hostile-"));
  const output = path.join(root, "run");
  const scenario = buildFactorialDesign({ splits: ["development"] })[0];
  try {
    await runFactorialExperiment({
      config: { ...smokeConfig, profile: "interval-test", opportunities_per_seed: 1 },
      seeds: [505_051],
      scenarios: [scenario],
      outputDirectory: output,
      executionMode: "development",
    });
    await rewriteLedger(output, (records) => {
      records[0].measurement_interval.ended_at = records[0].measurement_interval.started_at;
    });
    await assert.rejects(
      validateFactorialRun(output),
      /measurement interval is not strictly positive|positive ordered UTC instants/,
    );
  } finally {
    assert.ok(root.startsWith(os.tmpdir()));
    await rm(root, { recursive: true, force: true });
  }
});

test("confirmation executes, resumes, validates, and analyzes only inside one live capsule authority", async () => {
  const config = { ...smokeConfig, profile: "confirmation-fixture", opportunities_per_seed: 1 };
  const scenarios = [buildFactorialDesign({ splits: ["confirmation"] })[0]];
  await usingTemporaryCapsuleConfirmationFixture({ config, scenarios }, async (fixture) => {
    const capsuleCandidateRoot = path.join(
      fixture.executionCapsule.local.source_root,
      "experiments",
      "workstation",
      "candidate-010",
    );
    const capsuleRunner = await import(pathToFileURL(path.join(capsuleCandidateRoot, "factorial-runner.mjs")).href);
    const authorityModule = await import(pathToFileURL(path.join(
      capsuleCandidateRoot,
      "capsule-execution-authority.mjs",
    )).href);
    const output = path.join(fixture.bindingRoot, "confirmation-run");
    let revokedAuthority;
    await authorityModule.withVerifiedCapsuleExecutionAuthority({
      executionCapsule: fixture.executionCapsule,
      expectedSourceBundle: fixture.expectedSourceBundle,
    }, async (executionAuthority) => {
      revokedAuthority = executionAuthority;
      const authorityOptions = {
        executionAuthority,
        executionCapsule: fixture.executionCapsule,
        expectedSourceBundle: fixture.expectedSourceBundle,
        launchProvenance: confirmationLaunchProvenance(),
      };
      const interrupted = await capsuleRunner.runFactorialExperiment({
        config,
        scenarios,
        outputDirectory: output,
        executionMode: "confirmation",
        release: fixture.release,
        stopAfterRecords: 5,
        ...authorityOptions,
      });
      assert.equal(interrupted.complete, false);
      const resumed = await capsuleRunner.runFactorialExperiment({
        config,
        scenarios,
        outputDirectory: output,
        executionMode: "confirmation",
        release: fixture.release,
        resume: true,
        ...authorityOptions,
      });
      assert.equal(resumed.complete, true);
      assert.equal(resumed.run.run_identity.frozen_release.release_sha256, fixture.contract.release_sha256);
      assert.equal(resumed.run.run_identity.frozen_release.seed_commitment, fixture.commitment);
      assert.equal(resumed.run.run_identity.frozen_release.partition, "confirmation");
      assert.equal(
        resumed.run.run_identity.frozen_release.execution_binding.descriptor_sha256,
        fixture.executionCapsule.descriptor.descriptor_sha256,
      );
      assert.equal(
        resumed.run.run_identity.frozen_release.runtime_binding.identity_sha256,
        fixture.executionCapsule.descriptor.runtime_identity.identity_sha256,
      );
      assert.equal(
        resumed.run.run_identity.capsule_execution_authority.execution_descriptor_sha256,
        fixture.executionCapsule.descriptor.descriptor_sha256,
      );
      assert.equal(
        resumed.run.run_identity.capsule_execution_authority.runtime_identity_sha256,
        fixture.executionCapsule.descriptor.runtime_identity.identity_sha256,
      );
      assert.equal(
        resumed.run.run_identity.official_launch_precommit.launch_request_sha256,
        authorityOptions.launchProvenance.launch_request_sha256,
      );
      assert.match(resumed.run.run_identity.run_id, /^c010-run-[0-9a-f]{64}$/);
      assert.equal((await capsuleRunner.validateFactorialRun(output, authorityOptions)).valid, true);
      assert.equal((await capsuleRunner.analyzeFactorialRun(output, authorityOptions)).claim_eligible, false);
      const {
        launchProvenance: omittedLaunchProvenance,
        ...authorityWithoutActiveLaunch
      } = authorityOptions;
      void omittedLaunchProvenance;
      await assert.rejects(
        capsuleRunner.analyzeFactorialRun(output, authorityWithoutActiveLaunch),
        /capsule-launch-receipt\.json/,
      );
      const durableReceiptPath = path.join(output, "provenance", "capsule-launch-receipt.json");
      await writeJson(durableReceiptPath, {
        ...authorityOptions.launchProvenance,
        action: "candidate-010-confirmation",
        status: "verified",
      });
      await assert.rejects(
        capsuleRunner.validateFactorialRun(output, authorityWithoutActiveLaunch),
        /launch receipt shape or canonical digest is invalid/,
      );
      await rm(durableReceiptPath);

      await assert.rejects(capsuleRunner.runFactorialExperiment({
        config,
        scenarios,
        outputDirectory: path.join(fixture.bindingRoot, "forged-authority-run"),
        executionMode: "confirmation",
        release: fixture.release,
        executionAuthority: Object.freeze(function forgedAuthority() {}),
        executionCapsule: fixture.executionCapsule,
        expectedSourceBundle: fixture.expectedSourceBundle,
        launchProvenance: confirmationLaunchProvenance(),
      }), /forged, cloned, foreign, or revoked/);
      const serialized = JSON.parse(JSON.stringify({ executionAuthority }));
      await assert.rejects(capsuleRunner.runFactorialExperiment({
        config,
        scenarios,
        outputDirectory: path.join(fixture.bindingRoot, "serialized-authority-run"),
        executionMode: "confirmation",
        release: fixture.release,
        executionAuthority: serialized.executionAuthority,
        executionCapsule: fixture.executionCapsule,
        expectedSourceBundle: fixture.expectedSourceBundle,
        launchProvenance: confirmationLaunchProvenance(),
      }), /forged, cloned, foreign, or revoked/);
      await assert.rejects(capsuleRunner.runFactorialExperiment({
        config: { ...config, threshold: config.threshold + 1 },
        scenarios,
        outputDirectory: path.join(fixture.bindingRoot, "config-substitution"),
        executionMode: "confirmation",
        release: fixture.release,
        ...authorityOptions,
      }), /config binding does not match/);
      await assert.rejects(capsuleRunner.runFactorialExperiment({
        config,
        scenarios: [{ ...scenarios[0], id: `${scenarios[0].id}-substituted` }],
        outputDirectory: path.join(fixture.bindingRoot, "design-substitution"),
        executionMode: "confirmation",
        release: fixture.release,
        ...authorityOptions,
      }), /design binding does not match/);
      await assert.rejects(capsuleRunner.runFactorialExperiment({
        config,
        scenarios,
        outputDirectory: output,
        executionMode: "confirmation",
        release: fixture.release,
        resume: true,
        ...authorityOptions,
        launchProvenance: confirmationLaunchProvenance("f"),
      }), /launch provenance differs/);

      const authorityPath = path.join(output, "provenance", "capsule-execution-authority.json");
      const frozenAuthority = JSON.parse(await readFile(authorityPath, "utf8"));
      await writeJson(authorityPath, {
        ...frozenAuthority,
        runtime_identity_sha256: "0".repeat(64),
      });
      await assert.rejects(
        capsuleRunner.validateFactorialRun(output, authorityOptions),
        /differs from frozen factorial provenance/,
      );
      await writeJson(authorityPath, frozenAuthority);
    });
    await assert.rejects(capsuleRunner.validateFactorialRun(output, {
      executionAuthority: revokedAuthority,
      executionCapsule: fixture.executionCapsule,
      expectedSourceBundle: fixture.expectedSourceBundle,
    }), /forged, cloned, foreign, or revoked/);
  });
});

test("confirmation rejects raw seeds and caller-authored frozen flags", async () => {
  const config = { ...smokeConfig, profile: "confirmation-hostile", opportunities_per_seed: 1 };
  const scenarios = [buildFactorialDesign({ splits: ["confirmation"] })[0]];
  await withTemporaryOutput("20w-c010-raw-confirmation-", async (output) => {
    await assert.rejects(
      runFactorialExperiment({
        config,
        seeds: [123],
        scenarios,
        outputDirectory: output,
        executionMode: "confirmation",
      }),
      /refuses raw caller-provided seeds/,
    );
  });
  await withTemporaryOutput("20w-c010-flag-confirmation-", async (output) => {
    await assert.rejects(
      runFactorialExperiment({
        config,
        scenarios,
        outputDirectory: output,
        executionMode: "confirmation",
        frozen_release: true,
      }),
      /flags have no authority/,
    );
  });
});

test("direct worktree confirmation cannot open any release or mint capsule authority", async () => {
  const config = { ...smokeConfig, profile: "confirmation-hostile", opportunities_per_seed: 1 };
  const scenarios = [buildFactorialDesign({ splits: ["confirmation"] })[0]];
  await withTemporaryOutput("20w-c010-worktree-confirmation-", async (output) => {
    await assert.rejects(runFactorialExperiment({
      config,
      scenarios,
      outputDirectory: output,
      executionMode: "confirmation",
      release: {
        bindingRoot: repositoryRoot,
        releasePath: path.join(repositoryRoot, "nonexistent-release.json"),
        disjointWith: [],
      },
      executionAuthority: Object.freeze(function forgedAuthority() {}),
      executionCapsule: {},
      expectedSourceBundle: {},
      launchProvenance: confirmationLaunchProvenance(),
    }), /refuses import from a worktree|non-generated source root/);
  });
});

test("validation recomputes factorial science instead of trusting consistently rehashed values", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "20w-c010-factorial-rehashed-science-"));
  const output = path.join(root, "run");
  try {
    await runFactorialExperiment({
      config: { ...smokeConfig, profile: "rehashed-science-hostile", opportunities_per_seed: 1 },
      seeds: [818_181],
      scenarios: buildFactorialDesign({ splits: ["development"] }).slice(0, 1),
      outputDirectory: output,
      executionMode: "development",
    });
    await rewriteLedger(output, (records) => {
      for (const record of records) {
        record.resources.modeled_energy_j += 1;
      }
    });

    await assert.rejects(
      validateFactorialRun(output),
      /scientific result differs from independent recomputation/,
    );
    await assert.rejects(
      analyzeFactorialRun(output),
      /scientific result differs from independent recomputation/,
    );
    await assert.rejects(
      access(path.join(output, "analysis", "factorial-summary.json")),
      (error) => error.code === "ENOENT",
    );
  } finally {
    assert.ok(root.startsWith(os.tmpdir()));
    await rm(root, { recursive: true, force: true });
  }
});

test("completed factorial analysis requires a current complete checkpoint authority", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "20w-c010-factorial-incomplete-checkpoint-"));
  const output = path.join(root, "run");
  const checkpointPath = path.join(output, "provenance", "checkpoint.json");
  try {
    await runFactorialExperiment({
      config: { ...smokeConfig, profile: "checkpoint-hostile", opportunities_per_seed: 1 },
      seeds: [828_282],
      scenarios: buildFactorialDesign({ splits: ["development"] }).slice(0, 1),
      outputDirectory: output,
      executionMode: "development",
    });
    const checkpoint = JSON.parse(await readFile(checkpointPath, "utf8"));
    checkpoint.complete = false;
    delete checkpoint.checkpoint_sha256;
    checkpoint.checkpoint_sha256 = createHash("sha256")
      .update(canonicalize(checkpoint))
      .digest("hex");
    await writeFile(checkpointPath, `${JSON.stringify(checkpoint, null, 2)}\n`, "utf8");

    await assert.rejects(
      validateFactorialRun(output),
      /completed factorial run lacks a current complete checkpoint authority/,
    );
    await assert.rejects(
      analyzeFactorialRun(output),
      /completed factorial run lacks a current complete checkpoint authority/,
    );
    await assert.rejects(
      access(path.join(output, "analysis", "factorial-summary.json")),
      (error) => error.code === "ENOENT",
    );
  } finally {
    assert.ok(root.startsWith(os.tmpdir()));
    await rm(root, { recursive: true, force: true });
  }
});
