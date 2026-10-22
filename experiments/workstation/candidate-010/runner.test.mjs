import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  access, cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { validateCapsuleLaunchReceipt } from "./capsule-bootstrap.mjs";
import { buildExecutionCapsule, destroyExecutionCapsule } from "./execution-capsule.mjs";
import { buildFactorialDesign } from "./factorial-design.mjs";
import { generateOpportunities } from "./generator.mjs";
import { executeFilesystemTrial } from "./filesystem-track.mjs";
import { canonicalize, nextRecordHash } from "./checkpoint.mjs";
import { armNames, decide } from "./policies.mjs";
import { createFrozenSeedReleaseContract } from "./release-contract.mjs";
import { captureRuntimeIdentity } from "./runtime-identity.mjs";
import { seedListCommitment } from "./seeds/seed-pack.mjs";
import {
  computeSourceBundle,
  discoverCandidate010SourceFiles,
} from "./source-bundle.mjs";
import {
  analyzeRun,
  attachEnergyReading,
  parseCapsuleConfirmationOptions,
  parseCapsulePromotionBuildOptions,
  runCapsuleConfirmationOperator,
  runCapsulePromotionBuildOperator,
  runCapsulePromotionValidationOperator,
  runExperiment,
  scientificPayload,
  validateRun,
} from "./runner.mjs";

const benchmarkRoot = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(.:)/, "$1"));
const repositoryRoot = path.resolve(benchmarkRoot, "..", "..", "..");
const execFileAsync = promisify(execFile);
const config = JSON.parse(await readFile(path.join(benchmarkRoot, "configs", "smoke.json"), "utf8"));
const golden = JSON.parse(await readFile(path.join(benchmarkRoot, "golden-smoke.json"), "utf8"));

function deterministicSummary(summary) {
  return {
    ...summary,
    arms: Object.fromEntries(Object.entries(summary.arms).map(([arm, row]) => {
      const deterministic = { ...row };
      delete deterministic.filesystem_boundary_ms;
      delete deterministic.mean_filesystem_boundary_ms;
      return [arm, deterministic];
    })),
  };
}

async function capsuleOperatorFixture() {
  const container = await mkdtemp(path.join(os.tmpdir(), "20w-c010-operator-"));
  const bindingRoot = path.join(container, "release-root");
  const capsuleParent = path.join(container, "capsules");
  await mkdir(path.join(bindingRoot, "bound"), { recursive: true });
  await mkdir(capsuleParent);
  const documents = {
    "source.json": { schema: 1, source_sha256: "a".repeat(64) },
    "config.json": { profile: "confirmation-fixture" },
    "design.json": { scenarios: [{ id: "fixture-scenario" }] },
    "disjoint.json": { partition: "held-out", seeds: [11, 12] },
  };
  await Promise.all(Object.entries(documents).map(([name, document]) => (
    writeFile(path.join(bindingRoot, "bound", name), `${JSON.stringify(document)}\n`)
  )));
  const release = {
    schema: 1,
    contract_version: "candidate-010.frozen-seed-release.v3",
    state: "sealed-release",
    partition: "confirmation",
    phase: "confirmation",
    bindings: {
      source_bundle: { path: "bound/source.json" },
      config: { path: "bound/config.json" },
      design: { path: "bound/design.json" },
    },
  };
  await writeFile(path.join(bindingRoot, "release.json"), `${JSON.stringify(release)}\n`);
  return {
    container,
    bindingRoot,
    capsuleParent,
    options: {
      "release-root": bindingRoot,
      release: "release.json",
      "disjoint-with": "bound/disjoint.json",
      output: path.join(container, "output"),
      "capsule-parent": capsuleParent,
    },
  };
}

async function writeJson(filePath, document) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(document, null, 2)}\n`);
}

async function git(cwd, ...args) {
  return execFileAsync("git", ["-c", "core.autocrlf=false", ...args], {
    cwd,
    windowsHide: true,
  });
}

async function copyFrozenCandidateSource(destinationRoot) {
  const coverage = await discoverCandidate010SourceFiles({ root: repositoryRoot });
  for (const relative of [...coverage.source_files, coverage.manifest_file]) {
    const destination = path.join(destinationRoot, ...relative.split("/"));
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(path.join(repositoryRoot, ...relative.split("/")), destination);
  }
  await mkdir(path.join(destinationRoot, "node_modules"));
  await cp(
    path.join(repositoryRoot, "node_modules", "es-module-lexer"),
    path.join(destinationRoot, "node_modules", "es-module-lexer"),
    { recursive: true },
  );
  return coverage.source_files;
}

async function invokeRealCapsuleOperator(repository, options) {
  const runnerUrl = pathToFileURL(path.join(
    repository,
    "experiments",
    "workstation",
    "candidate-010",
    "runner.mjs",
  )).href;
  const script = [
    `const { runCapsuleConfirmationOperator } = await import(${JSON.stringify(runnerUrl)});`,
    "const result = await runCapsuleConfirmationOperator(JSON.parse(process.argv[1]));",
    "process.stdout.write(JSON.stringify(result));",
  ].join("\n");
  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    ["--input-type=module", "--eval", script, JSON.stringify(options)],
    {
      cwd: repository,
      windowsHide: true,
      timeout: 120_000,
      maxBuffer: 1024 * 1024,
    },
  );
  assert.equal(stderr, "");
  return JSON.parse(stdout);
}

test("capsule-confirmation operator uses only child launch and forwards resume", async () => {
  const value = await capsuleOperatorFixture();
  const calls = [];
  const fakeCapsule = { descriptor: { descriptor_sha256: "b".repeat(64) }, local: {} };
  const storedPrecommit = { contract_version: "fixture-precommit" };
  try {
    await writeJson(
      path.join(value.options.output, "provenance", "capsule-launch-precommit.json"),
      storedPrecommit,
    );
    const result = await runCapsuleConfirmationOperator(
      { ...value.options, resume: "true" },
      {
        captureRuntime: async (input) => {
          calls.push(["runtime", input]);
          return { identity_sha256: "c".repeat(64) };
        },
        buildCapsule: async (input) => {
          calls.push(["build", input]);
          return fakeCapsule;
        },
        verifyCapsule: async (input) => {
          calls.push(["verify", input]);
          return {};
        },
        launchCapsule: async (input) => {
          calls.push(["launch", input]);
          return { status: "verified", receipt: { receipt_sha256: "d".repeat(64) } };
        },
        persistLaunchProvenance: async (input) => {
          calls.push(["persist", input]);
          return {};
        },
        destroyCapsule: async (input) => {
          calls.push(["destroy", input]);
          return true;
        },
        runFactorialExperiment: () => {
          throw new Error("direct in-process confirmation must never be called");
        },
      },
    );
    assert.equal(result.status, "verified");
    assert.equal(result.capsule_destroyed, true);
    assert.deepEqual(
      calls.map(([name]) => name),
      ["runtime", "build", "verify", "launch", "persist", "destroy"],
    );
    const launch = calls.find(([name]) => name === "launch")[1];
    assert.equal(launch.action, "candidate-010-confirmation");
    assert.deepEqual(launch.launchPrecommit, storedPrecommit);
    assert.equal(launch.confirmationRequest.resume, true);
    assert.deepEqual(launch.confirmationRequest.scenarios, [{ id: "fixture-scenario" }]);
    assert.deepEqual(launch.confirmationRequest.release.disjointWith, [{
      partition: "held-out",
      seeds: [11, 12],
    }]);
    assert.equal("seeds" in launch.confirmationRequest, false);
  } finally {
    await rm(value.container, { recursive: true, force: true });
  }
});

test("capsule-confirmation destroys its owned capsule after child failure", async () => {
  const value = await capsuleOperatorFixture();
  let destroyed = null;
  const fakeCapsule = { descriptor: {}, local: {} };
  try {
    await assert.rejects(runCapsuleConfirmationOperator(value.options, {
      captureRuntime: async () => ({}),
      buildCapsule: async () => fakeCapsule,
      verifyCapsule: async () => ({}),
      launchCapsule: async () => { throw new Error("child failure fixture"); },
      destroyCapsule: async (capsule) => { destroyed = capsule; },
    }), /child failure fixture/);
    assert.equal(destroyed, fakeCapsule);
  } finally {
    await rm(value.container, { recursive: true, force: true });
  }
});

test("promotion validation operator grants only a fresh fixed child action", async () => {
  const container = await mkdtemp(path.join(os.tmpdir(), "20w-c010-promotion-operator-"));
  const capsuleParent = path.join(container, "capsules");
  await mkdir(capsuleParent);
  const evidence = { contract_version: "fixture", evidence_sha256: "a".repeat(64) };
  const paths = { runDirectory: "fixture-run" };
  const calls = [];
  const fakeCapsule = {
    descriptor: {
      descriptor_sha256: "b".repeat(64),
      source: { inventory_sha256: "c".repeat(64) },
      dependencies: { inventory: { inventory_sha256: "d".repeat(64) } },
    },
    local: {},
  };
  try {
    const result = await runCapsulePromotionValidationOperator({ evidence, paths, capsuleParent }, {
      loadBindings: async () => ({
        runtimeIdentity: { identity_sha256: "e".repeat(64) },
        expectedSourceBundle: { vcs: { source_commit: "f".repeat(40) } },
        executionDescriptor: fakeCapsule.descriptor,
      }),
      buildCapsule: async () => fakeCapsule,
      verifyCapsule: async () => ({}),
      launchCapsule: async (input) => {
        calls.push(input);
        return {
          status: "verified",
          action_result: evidence,
          launch_receipt: { receipt_sha256: "1".repeat(64) },
        };
      },
      validateLaunchReceipt: () => ({ valid: true }),
      destroyCapsule: async () => true,
    });
    assert.equal(result.capsule_destroyed, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].action, "candidate-010-promotion-evidence");
    assert.equal(calls[0].maxOutputBytes, 1024 * 1024);
    assert.deepEqual(calls[0].promotionRequest, { operation: "validate", evidence, paths });
    assert.equal("executionAuthority" in calls[0].promotionRequest, false);
    await assert.rejects(
      runCapsulePromotionValidationOperator({
        evidence,
        paths,
        capsuleParent,
        executionAuthority: () => {},
      }),
      /requires exactly evidence, paths, and capsuleParent/,
    );
  } finally {
    await rm(container, { recursive: true, force: true });
  }
});

test("promotion build operator atomically creates evidence and receipt together", async () => {
  const container = await mkdtemp(path.join(os.tmpdir(), "20w-c010-promotion-build-"));
  const capsuleParent = path.join(container, "capsules");
  const outputDirectory = path.join(container, "previously-absent-parent", "promotion-artifacts");
  const evidenceOutput = path.join(outputDirectory, "evidence.json");
  const receiptOutput = path.join(outputDirectory, "receipt.json");
  await mkdir(capsuleParent);
  const evidence = { contract_version: "fixture", evidence_sha256: "a".repeat(64) };
  const receipt = { receipt_sha256: "1".repeat(64) };
  const fakeCapsule = {
    descriptor: {
      descriptor_sha256: "b".repeat(64),
      source: { inventory_sha256: "c".repeat(64) },
      dependencies: { inventory: { inventory_sha256: "d".repeat(64) } },
    },
    local: {},
  };
  const dependencies = {
    loadBindings: async () => ({
      runtimeIdentity: { identity_sha256: "e".repeat(64) },
      expectedSourceBundle: { vcs: { source_commit: "f".repeat(40) } },
      executionDescriptor: fakeCapsule.descriptor,
    }),
    buildCapsule: async () => fakeCapsule,
    verifyCapsule: async () => ({}),
    launchCapsule: async (input) => {
      assert.equal(input.promotionRequest.operation, "build");
      assert.equal("evidence" in input.promotionRequest, false);
      assert.equal(input.maxOutputBytes, 1024 * 1024);
      return { status: "verified", action_result: evidence, launch_receipt: receipt };
    },
    validateLaunchReceipt: () => ({ valid: true }),
    destroyCapsule: async () => true,
  };
  try {
    const result = await runCapsulePromotionBuildOperator({
      paths: { runDirectory: "fixture-run" },
      capsuleParent,
      evidenceOutput,
      receiptOutput,
    }, dependencies);
    assert.equal(result.capsule_destroyed, true);
    assert.deepEqual(JSON.parse(await readFile(evidenceOutput, "utf8")), evidence);
    assert.deepEqual(JSON.parse(await readFile(receiptOutput, "utf8")), receipt);
    await assert.rejects(
      runCapsulePromotionBuildOperator({
        paths: { runDirectory: "fixture-run" },
        capsuleParent,
        evidenceOutput,
        receiptOutput,
      }, dependencies),
      /already exists; evidence is never overwritten/,
    );
    assert.throws(
      () => parseCapsulePromotionBuildOptions([
        "node", "runner.mjs", "capsule-promotion-build",
        "--run-directory", "run",
        "--run-directory", "duplicate",
      ]),
      /Duplicate capsule-promotion-build option/,
    );
  } finally {
    await rm(container, { recursive: true, force: true });
  }
});

test("capsule-confirmation refuses path escapes, legacy releases, raw seeds, and extra options", async () => {
  const value = await capsuleOperatorFixture();
  try {
    await assert.rejects(
      runCapsuleConfirmationOperator({ ...value.options, release: "../escape.json" }),
      /escapes release-root/,
    );
    const releasePath = path.join(value.bindingRoot, "release.json");
    const legacy = JSON.parse(await readFile(releasePath, "utf8"));
    legacy.contract_version = "candidate-010.frozen-seed-release.v2";
    await writeFile(releasePath, `${JSON.stringify(legacy)}\n`);
    await assert.rejects(runCapsuleConfirmationOperator(value.options), /exact v3/);
    await assert.rejects(
      runCapsuleConfirmationOperator({ ...value.options, profile: "confirmation" }),
      /missing or extra options/,
    );
    assert.throws(
      () => parseCapsuleConfirmationOptions([
        "node", "runner.mjs", "capsule-confirmation", "--seeds", "1,2",
      ]),
      /Unknown capsule-confirmation option --seeds/,
    );
    assert.throws(
      () => parseCapsuleConfirmationOptions([
        "node", "runner.mjs", "capsule-confirmation", "--profile", "confirmation",
      ]),
      /Unknown capsule-confirmation option --profile/,
    );
    assert.throws(
      () => parseCapsuleConfirmationOptions(["node", "runner.mjs", "capsule-confirmation"]),
      /requires --release-root/,
    );
    assert.throws(
      () => parseCapsuleConfirmationOptions([
        "node", "runner.mjs", "capsule-confirmation",
        "--release-root", value.bindingRoot,
        "--release", "release.json",
        "--disjoint-with", "bound/disjoint.json",
        "--output", "unused",
        "--resume", "false",
      ]),
      /only accepts --resume true/,
    );
  } finally {
    await rm(value.container, { recursive: true, force: true });
  }
});

test("capsule-confirmation operator executes the real frozen child path and removes its capsule", async () => {
  const container = await mkdtemp(path.join(os.tmpdir(), "20w-c010-operator-e2e-"));
  const fixtureRepository = path.join(container, "repository");
  const candidateRelative = "experiments/workstation/candidate-010";
  const fixtureCandidateRoot = path.join(fixtureRepository, ...candidateRelative.split("/"));
  const previewParent = path.join(container, "preview-capsules");
  const operatorParent = path.join(container, "operator-capsules");
  const bindingRoot = path.join(container, "release-bindings");
  const outputDirectory = path.join(container, "confirmation-output");
  let previewCapsule = null;
  try {
    await mkdir(fixtureRepository);
    await mkdir(previewParent);
    await mkdir(operatorParent);
    await mkdir(bindingRoot);
    const sourceFiles = await copyFrozenCandidateSource(fixtureRepository);
    await git(fixtureRepository, "init");
    await git(fixtureRepository, "config", "user.email", "operator-e2e@example.invalid");
    await git(fixtureRepository, "config", "user.name", "Candidate 010 Operator E2E");
    await git(
      fixtureRepository,
      "add",
      "--",
      ...sourceFiles,
      "experiments/workstation/manifests/candidate-010.json",
    );
    await git(fixtureRepository, "commit", "-m", "frozen operator fixture");
    const sourceCommit = (await git(fixtureRepository, "rev-parse", "HEAD")).stdout.trim();
    const expectedSourceBundle = await computeSourceBundle({
      root: fixtureRepository,
      sourceFiles,
      vcs: {
        source_commit: sourceCommit,
        worktree_state: "temporary-clean-operator-e2e-fixture",
      },
    });
    const runtimeIdentity = await captureRuntimeIdentity({
      repositoryRoot: fixtureRepository,
      candidateRoot: fixtureCandidateRoot,
    });
    previewCapsule = await buildExecutionCapsule({
      repositoryRoot: fixtureRepository,
      executionParent: previewParent,
      runtimeIdentity,
      candidateDirectory: candidateRelative,
    });

    const confirmationConfig = {
      ...config,
      profile: "capsule-confirmation-operator-e2e",
      opportunities_per_seed: 1,
    };
    const scenarios = buildFactorialDesign({ splits: ["confirmation"] }).slice(0, 1);
    const seeds = [7_070_701];
    const commitment = seedListCommitment(seeds);
    const files = {
      sourceBundlePath: "source-bundle.json",
      executionDescriptorPath: "execution-descriptor.json",
      runtimeIdentityPath: "runtime-identity.json",
      configPath: "config.json",
      designPath: "design.json",
      backendRegistryPath: "backend-registry.mjs",
      preregistrationPath: "preregistration.json",
      commitmentPath: "confirmation.commit.json",
      revealPath: "confirmation.reveal.json",
    };
    await writeJson(path.join(bindingRoot, files.sourceBundlePath), expectedSourceBundle);
    await writeJson(path.join(bindingRoot, files.executionDescriptorPath), previewCapsule.descriptor);
    await writeJson(
      path.join(bindingRoot, files.runtimeIdentityPath),
      previewCapsule.descriptor.runtime_identity,
    );
    await writeJson(path.join(bindingRoot, files.configPath), confirmationConfig);
    await writeJson(path.join(bindingRoot, files.designPath), { scenarios });
    await cp(
      path.join(previewCapsule.local.source_root, ...candidateRelative.split("/"), "backend-registry.mjs"),
      path.join(bindingRoot, files.backendRegistryPath),
    );
    await writeJson(path.join(bindingRoot, files.preregistrationPath), {
      id: "candidate-010-operator-e2e-preregistration",
    });
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
    const release = await createFrozenSeedReleaseContract({
      bindingRoot,
      sourceRoot: previewCapsule.local.source_root,
      releaseVersion: 1,
      partition: "confirmation",
      phase: "confirmation",
      ...files,
    });
    await writeJson(path.join(bindingRoot, "release.json"), release);
    await writeJson(path.join(bindingRoot, "held-out.reveal.json"), {
      partition: "held-out",
      seeds: [8_080_801],
    });
    const previewDescriptor = previewCapsule.descriptor;
    const previewOuterRoot = previewCapsule.local.outer_root;
    assert.equal(await destroyExecutionCapsule(previewCapsule), true);
    previewCapsule = null;

    const operatorOptions = {
      "release-root": bindingRoot,
      release: "release.json",
      "disjoint-with": "held-out.reveal.json",
      output: outputDirectory,
      "capsule-parent": operatorParent,
    };
    await assert.rejects(
      invokeRealCapsuleOperator(fixtureRepository, {
        ...operatorOptions,
        "stop-after-records": "3",
      }),
      /Confirmation run did not complete|INCOMPLETE|capsule child exited nonzero/,
    );
    const interruptedPrecommit = JSON.parse(await readFile(path.join(
      outputDirectory,
      "provenance",
      "capsule-launch-precommit.json",
    ), "utf8"));
    assert.match(interruptedPrecommit.request_nonce, /^[0-9a-f]{64}$/);
    assert.deepEqual(await readdir(operatorParent), []);

    const result = await invokeRealCapsuleOperator(fixtureRepository, {
      ...operatorOptions,
      resume: "true",
    });
    assert.equal(result.status, "verified");
    assert.equal(result.action, "candidate-010-confirmation");
    assert.equal(result.cleanup_owner, "operator");
    assert.equal(result.capsule_destroyed, true);
    assert.equal(result.receipt.status, "verified");
    assert.equal(result.receipt.execution_descriptor_sha256, previewDescriptor.descriptor_sha256);
    assert.deepEqual(await readdir(operatorParent), []);

    const provenanceRoot = path.join(outputDirectory, "provenance");
    const run = JSON.parse(await readFile(path.join(provenanceRoot, "run.json"), "utf8"));
    const checkpoint = JSON.parse(await readFile(path.join(provenanceRoot, "checkpoint.json"), "utf8"));
    const seedProvenance = JSON.parse(await readFile(path.join(provenanceRoot, "seeds.json"), "utf8"));
    const capsuleAuthority = JSON.parse(await readFile(
      path.join(provenanceRoot, "capsule-execution-authority.json"),
      "utf8",
    ));
    const durableLaunchReceipt = JSON.parse(await readFile(
      path.join(provenanceRoot, "capsule-launch-receipt.json"),
      "utf8",
    ));
    const setupAccounting = JSON.parse(await readFile(
      path.join(provenanceRoot, "confirmation-setup-accounting.json"),
      "utf8",
    ));
    assert.equal(run.execution_mode, "confirmation");
    assert.equal(run.records, run.expected_records);
    assert.equal(run.records > 0, true);
    assert.equal(checkpoint.complete, true);
    assert.equal(run.run_identity.frozen_release.release_sha256, release.release_sha256);
    assert.deepEqual(run.run_identity.frozen_release.execution_binding, {
      descriptor_sha256: previewDescriptor.descriptor_sha256,
      source_inventory_sha256: previewDescriptor.source.inventory_sha256,
      dependency_inventory_sha256: previewDescriptor.dependencies.inventory.inventory_sha256,
    });
    assert.deepEqual(run.run_identity.frozen_release.runtime_binding, {
      identity_sha256: previewDescriptor.runtime_identity.identity_sha256,
      executable_sha256: previewDescriptor.runtime_identity.runtime.executable_sha256,
      package_lock_sha256: previewDescriptor.runtime_identity.package_lock.sha256,
    });
    assert.equal(
      run.run_identity.capsule_execution_authority.execution_descriptor_sha256,
      previewDescriptor.descriptor_sha256,
    );
    assert.deepEqual(seedProvenance.execution_binding, run.run_identity.frozen_release.execution_binding);
    assert.deepEqual(seedProvenance.runtime_binding, run.run_identity.frozen_release.runtime_binding);
    assert.deepEqual(capsuleAuthority, run.run_identity.capsule_execution_authority);
    assert.deepEqual(durableLaunchReceipt, result.launch_receipt);
    assert.deepEqual(result.launch_precommit, interruptedPrecommit);
    assert.equal(setupAccounting.launch_receipt_sha256, durableLaunchReceipt.receipt_sha256);
    assert.equal(setupAccounting.allocation, "run-level-unallocated");
    assert.equal(setupAccounting.arm_level_allocation, false);
    assert.equal(setupAccounting.calibrated_energy, false);
    assert.equal(setupAccounting.modeled_energy_j, null);
    assert.equal(setupAccounting.measured_energy_j, null);
    assert.equal(setupAccounting.launch_envelope_diagnostic.additive, false);
    assert.equal(
      setupAccounting.launch_envelope_diagnostic.elapsed_ms
        - setupAccounting.launch_envelope_diagnostic.child_action_elapsed_ms,
      setupAccounting.launch_envelope_diagnostic.setup_overhead_elapsed_ms,
    );
    assert.equal(
      setupAccounting.phases.child_spawn_and_verification_overhead.elapsed_ms,
      setupAccounting.launch_envelope_diagnostic.setup_overhead_elapsed_ms,
    );
    assert.equal(Object.values(setupAccounting.phases).every((phase) => (
      Number.isFinite(phase.elapsed_ms)
      && Number.isSafeInteger(phase.bytes_processed)
      && phase.modeled_energy_j === null
      && phase.measured_energy_j === null
      && phase.calibrated === false
    )), true);
    assert.throws(
      () => validateCapsuleLaunchReceipt({
        ...durableLaunchReceipt,
        result_sha256: "0".repeat(64),
      }),
      /launch receipt shape or canonical digest is invalid/,
    );
    assert.throws(
      () => validateCapsuleLaunchReceipt(result.receipt),
      /launch receipt shape or canonical digest is invalid/,
    );

    const provenanceFiles = await readdir(provenanceRoot);
    const serializedProvenance = (await Promise.all(provenanceFiles
      .filter((name) => name.endsWith(".json"))
      .map((name) => readFile(path.join(provenanceRoot, name), "utf8")))).join("\n");
    const serializedResult = JSON.stringify(result);
    for (const forbidden of [
      "ownership_token",
      "outer_root",
      "source_root",
      "dependency_root",
      previewOuterRoot,
      operatorParent,
    ]) {
      assert.equal(serializedProvenance.includes(forbidden), false, `provenance leaked ${forbidden}`);
      assert.equal(serializedResult.includes(forbidden), false, `operator receipt leaked ${forbidden}`);
    }
  } finally {
    if (previewCapsule) await destroyExecutionCapsule(previewCapsule);
    await rm(container, { recursive: true, force: true });
  }
});

async function rewriteSmokeLedger(outputDirectory, mutate) {
  const rawPath = path.join(outputDirectory, "raw", "events.ndjson");
  const runPath = path.join(outputDirectory, "provenance", "run.json");
  const checkpointPath = path.join(outputDirectory, "provenance", "checkpoint.json");
  const records = (await readFile(rawPath, "utf8")).trim().split(/\r?\n/).map(JSON.parse);
  mutate(records);
  const digest = createHash("sha256");
  let previous = "0".repeat(64);
  for (const [sequence, record] of records.entries()) {
    delete record.integrity;
    const payload = canonicalize(scientificPayload(record));
    const recordSha256 = nextRecordHash(previous, payload);
    record.integrity = {
      sequence,
      previous_sha256: previous,
      record_sha256: recordSha256,
    };
    digest.update(payload);
    previous = recordSha256;
  }
  const scientificPayloadSha256 = digest.digest("hex");
  await writeFile(rawPath, `${records.map(JSON.stringify).join("\n")}\n`, "utf8");
  const run = JSON.parse(await readFile(runPath, "utf8"));
  run.scientific_payload_sha256 = scientificPayloadSha256;
  run.hash_chain_sha256 = previous;
  await writeFile(runPath, `${JSON.stringify(run, null, 2)}\n`, "utf8");
  const checkpoint = JSON.parse(await readFile(checkpointPath, "utf8"));
  checkpoint.scientific_payload_sha256 = scientificPayloadSha256;
  checkpoint.hash_chain_sha256 = previous;
  delete checkpoint.checkpoint_sha256;
  checkpoint.checkpoint_sha256 = createHash("sha256")
    .update(canonicalize(checkpoint))
    .digest("hex");
  await writeFile(checkpointPath, `${JSON.stringify(checkpoint, null, 2)}\n`, "utf8");
}

test("generator is deterministic and does not use scheduling state", () => {
  assert.deepEqual(generateOpportunities(config, 101), generateOpportunities(config, 101));
  assert.notDeepEqual(generateOpportunities(config, 101), generateOpportunities(config, 202));
  assert.equal("verifier" in generateOpportunities(config, 101)[0], false);
});

test("conditioned SPRT uses the declared evidence correlation", () => {
  const opportunity = generateOpportunities(config, 101)[0];
  const lowCorrelation = decide("conditioned-sprt", opportunity, { ...config, cheap_evidence_correlation: 0.1 });
  const highCorrelation = decide("conditioned-sprt", opportunity, { ...config, cheap_evidence_correlation: 0.9 });
  assert.notEqual(lowCorrelation.score, highCorrelation.score);
  assert.ok([1, 2].includes(lowCorrelation.observations));
});

test("temporary execution reveals a constructed trace only to eligible policies", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "20w-c010-fs-"));
  try {
    const opportunity = generateOpportunities(config, 303)[0];
    const revealed = await executeFilesystemTrial({
      root: path.join(temporary, "revealed"),
      opportunity,
      arm: "reset-coupled",
      config,
      revealTrace: true,
      decideWithTrace: (trace) => ({ stage: true, commit: trace < 0, reset: !(trace < 0) }),
    });
    const withheld = await executeFilesystemTrial({
      root: path.join(temporary, "withheld"),
      opportunity,
      arm: "reset-coupled-no-trace",
      config,
      revealTrace: false,
      decideWithTrace: (trace) => {
        assert.equal(trace, null);
        return { stage: true, commit: false, reset: true };
      },
    });
    assert.equal(Number.isFinite(revealed.revealedVerifier), true);
    assert.equal(withheld.revealedVerifier, null);
    assert.equal(revealed.filesystem.trace_output_sha256, withheld.filesystem.trace_output_sha256);
    assert.equal(revealed.filesystem.staged_bytes_written, withheld.filesystem.staged_bytes_written);
    assert.equal(revealed.decision.commit ? revealed.filesystem.commitComplete : revealed.filesystem.rollbackComplete, true);
    assert.equal(withheld.filesystem.rollbackComplete, true);
  } finally {
    assert.ok(temporary.startsWith(os.tmpdir()));
    await rm(temporary, { recursive: true, force: true });
  }
});

test("smoke scientific payload and analysis are reproducible", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "20w-c010-run-"));
  try {
    const first = await runExperiment({ config, seeds: [101, 202], outputDirectory: path.join(temporary, "a") });
    const second = await runExperiment({ config, seeds: [101, 202], outputDirectory: path.join(temporary, "b") });
    assert.equal(first.run.scientific_payload_sha256, second.run.scientific_payload_sha256);
    assert.equal(first.run.config_sha256, golden.config_sha256);
    assert.equal(first.run.scientific_payload_sha256, golden.scientific_payload_sha256);
    assert.equal(first.run.hash_chain_sha256, golden.hash_chain_sha256);
    assert.equal(first.run.ordered_seed_pack_sha256, golden.ordered_seed_pack_sha256);
    assert.equal(first.run.records, golden.records);
    const checkpoint = JSON.parse(await readFile(path.join(temporary, "a", "provenance", "checkpoint.json"), "utf8"));
    assert.equal(checkpoint.completed_work_units_sha256, golden.completed_work_units_sha256);
    assert.equal(checkpoint.checkpoint_sha256, golden.checkpoint_sha256);
    const firstSummary = await analyzeRun(path.join(temporary, "a"));
    const secondSummary = await analyzeRun(path.join(temporary, "b"));
    assert.deepEqual(deterministicSummary(firstSummary), deterministicSummary(secondSummary));
    assert.equal(firstSummary.measured_energy_j, null);
    assert.equal(firstSummary.interpretation.includes("no superiority"), true);
    assert.deepEqual(await analyzeRun(path.join(temporary, "a")), firstSummary);
    const validation = await validateRun(path.join(temporary, "a"));
    assert.equal(validation.valid, true);
    assert.equal(validation.records, golden.records);
    const events = (await readFile(path.join(temporary, "a", "raw", "events.ndjson"), "utf8"))
      .trim().split(/\r?\n/).map(JSON.parse);
    assert.deepEqual(new Set(events.map((event) => event.arm)), new Set(armNames));
    assert.ok(events.every((event) => event.filesystem?.boundary === "filesystem-stage-execute-finalize-v1"));
    assert.ok(events.every((event) => event.decision.stage && event.decision.commit !== event.decision.reset));
    assert.ok(events.some((event) => event.arm === "reset-coupled" && event.trace.revealed));
    assert.ok(events.every((event) => event.arm !== "reset-coupled-no-trace" || !event.trace.revealed));
  } finally {
    assert.ok(temporary.startsWith(os.tmpdir()));
    await rm(temporary, { recursive: true, force: true });
  }
});

test("runner resumes from its raw ledger without changing scientific results", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "20w-c010-resume-runner-"));
  const resumable = path.join(temporary, "resumable");
  const uninterrupted = path.join(temporary, "uninterrupted");
  const smallConfig = { ...config, opportunities_per_seed: 2, checkpoint_interval_records: 3 };
  try {
    const partial = await runExperiment({
      config: smallConfig,
      seeds: [101],
      outputDirectory: resumable,
      stopAfterRecords: 7,
    });
    assert.equal(partial.complete, false);
    assert.equal(partial.run.records, 7);

    const resumed = await runExperiment({
      config: smallConfig,
      seeds: [101],
      outputDirectory: resumable,
      resume: true,
    });
    const baseline = await runExperiment({
      config: smallConfig,
      seeds: [101],
      outputDirectory: uninterrupted,
    });
    assert.equal(resumed.complete, true);
    assert.equal(resumed.resumed, true);
    assert.equal(resumed.run.scientific_payload_sha256, baseline.run.scientific_payload_sha256);
    assert.equal(resumed.run.hash_chain_sha256, baseline.run.hash_chain_sha256);
    assert.equal((await validateRun(resumable)).valid, true);

    await assert.rejects(
      runExperiment({
        config: { ...smallConfig, threshold: 99 },
        seeds: [101],
        outputDirectory: resumable,
        resume: true,
      }),
      /Resume config differs/,
    );
    await assert.rejects(
      runExperiment({
        config: smallConfig,
        seeds: [202],
        outputDirectory: resumable,
        resume: true,
      }),
      /Resume seed order differs/,
    );
  } finally {
    assert.ok(temporary.startsWith(os.tmpdir()));
    await rm(temporary, { recursive: true, force: true });
  }
});

test("runner binds external energy provenance without allocating it to arms", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "20w-c010-energy-runner-"));
  const output = path.join(temporary, "run");
  const readingPath = path.join(temporary, "reading.json");
  try {
    const result = await runExperiment({
      config: { ...config, opportunities_per_seed: 1 },
      seeds: [101],
      outputDirectory: output,
    });
    const reading = {
      contract_version: "candidate-010.external-energy-reading.v1",
      reading_id: "runner-fixture-only",
      record_kind: "test-fixture",
      provider: {
        type: "external-meter",
        medium: "wall",
        provider_id: "fixture-provider",
        meter_id: "fixture-not-hardware",
        boundary: "fixture whole-run boundary",
        hardware_configuration: "fixture only",
        software_telemetry: false,
      },
      calibration: {
        calibration_id: "fixture-not-a-certificate",
        calibrated_at: "2026-01-01T00:00:00.000Z",
        valid_until: "2027-01-01T00:00:00.000Z",
        relative_standard_uncertainty: 0.01,
        coverage_factor: 2,
        traceability_reference: "test fixture only",
      },
      interval: {
        started_at: result.run.started_utc,
        ended_at: result.run.completed_utc,
        clock_id: "fixture-clock",
        clock_uncertainty_s: 0.001,
        clock_discontinuity_observed: false,
      },
      integrity: { meter_reset_observed: false, negative_reading_observed: false },
      measurement: {
        method: "counter-delta",
        start: { value: 1, unit: "Wh", observed_at: result.run.started_utc },
        end: { value: 1.1, unit: "Wh", observed_at: result.run.completed_utc },
      },
    };
    await writeFile(readingPath, `${JSON.stringify(reading, null, 2)}\n`, "utf8");
    const energy = await attachEnergyReading(output, readingPath);
    assert.equal(energy.measured.claim_eligibility, "fixture-ineligible");
    assert.equal(energy.arm_level_energy_claim_eligible, false);
    const summary = await analyzeRun(output);
    assert.ok(Math.abs(summary.measured_energy_j - 360) < 1e-9);
    assert.equal(summary.external_energy.allocation, "whole-run-only");
    const validation = await validateRun(output);
    assert.equal(validation.valid, true);
    assert.equal(validation.external_energy_bound, true);
    assert.equal(validation.arm_level_energy_claim_eligible, false);
  } finally {
    assert.ok(temporary.startsWith(os.tmpdir()));
    await rm(temporary, { recursive: true, force: true });
  }
});

test("hash chain rejects raw-ledger corruption", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "20w-c010-corrupt-"));
  const output = path.join(temporary, "run");
  try {
    await runExperiment({
      config: { ...config, opportunities_per_seed: 1 },
      seeds: [101],
      outputDirectory: output,
    });
    const rawPath = path.join(output, "raw", "events.ndjson");
    const lines = (await readFile(rawPath, "utf8")).trim().split(/\r?\n/);
    const first = JSON.parse(lines[0]);
    first.outcome.consequence_weighted_loss += 1;
    lines[0] = JSON.stringify(first);
    await writeFile(rawPath, `${lines.join("\n")}\n`, "utf8");
    await assert.rejects(validateRun(output), /hash-chain mismatch|scientific payload digest/);
  } finally {
    assert.ok(temporary.startsWith(os.tmpdir()));
    await rm(temporary, { recursive: true, force: true });
  }
});

test("validation recomputes smoke science instead of trusting consistently rehashed values", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "20w-c010-rehashed-science-"));
  const output = path.join(temporary, "run");
  try {
    await runExperiment({
      config: { ...config, opportunities_per_seed: 1 },
      seeds: [101],
      outputDirectory: output,
    });
    await rewriteSmokeLedger(output, (records) => {
      for (const record of records) {
        record.resources.modeled_energy_j += 1;
      }
    });

    await assert.rejects(
      validateRun(output),
      /scientific result differs from independent recomputation/,
    );
    await assert.rejects(
      analyzeRun(output),
      /scientific result differs from independent recomputation/,
    );
    await assert.rejects(
      access(path.join(output, "analysis", "summary.json")),
      (error) => error.code === "ENOENT",
    );
  } finally {
    assert.ok(temporary.startsWith(os.tmpdir()));
    await rm(temporary, { recursive: true, force: true });
  }
});
