import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { BACKEND_METADATA } from "./backend-registry.mjs";
import { launchVerifiedCapsuleAction } from "./capsule-bootstrap.mjs";
import { createConfirmatoryPreregistration } from "./confirmatory-analysis.mjs";
import {
  EXTERNAL_ENERGY_CONTRACT_VERSION,
  bindExternalEnergyObservation,
  evaluateExternalEnergyReading,
  hashNormalizedExternalEnergyObservation,
  hashProvenanceReviewRecord,
} from "./energy-provider.mjs";
import { buildFactorialDesign } from "./factorial-design.mjs";
import { generateOpportunities } from "./generator.mjs";
import {
  PROMOTION_EVIDENCE_VERSION,
  validateDurablePromotionEvidence,
  validatePromotionEvidence,
} from "./promotion-evidence.mjs";
import { buildExecutionCapsule, destroyExecutionCapsule } from "./execution-capsule.mjs";
import { captureRuntimeIdentity } from "./runtime-identity.mjs";
import { seedListCommitment } from "./seeds/seed-pack.mjs";
import {
  SEED_RELEASE_OPERATOR_VERSION,
  SEED_RELEASE_PLAN_VERSION,
  SEED_REVEAL_ATTESTATION_VERSION,
} from "./seed-release-operator.mjs";
import {
  CANDIDATE_010_MANIFEST_FILE,
  captureCandidate010SourceBundle,
  discoverCandidate010SourceFiles,
} from "./source-bundle.mjs";
import { canonicalJson } from "../lib/canonical-json.mjs";

const executeFile = promisify(execFile);
const benchmarkRoot = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(.:)/, "$1"));
const repositoryRoot = path.resolve(benchmarkRoot, "..", "..", "..");
const candidateRelative = "experiments/workstation/candidate-010";

function canonical(value) {
  return canonicalJson(value, { strict: false, label: "Promotion test" });
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeManifestSnapshotFiles(bindingRoot, revealedRoot, snapshotBodies, snapshotNames) {
  const bindings = {};
  for (const [name, relative] of Object.entries(snapshotNames)) {
    const body = `${JSON.stringify(snapshotBodies[name], null, 2)}\n`;
    await writeFile(path.join(bindingRoot, relative), body, "utf8");
    await writeFile(path.join(revealedRoot, relative), body, "utf8");
    bindings[name] = { path: relative, sha256: sha256(body) };
  }
  return bindings;
}

function buildManifestFreezeIdentity(sourceBundle, executionDescriptor, confirmationSeedList, heldOutSeeds, bindings) {
  return {
    source_sha256: sourceBundle.source_sha256,
    source_commit: sourceBundle.vcs.source_commit,
    execution_descriptor_sha256: executionDescriptor.descriptor_sha256,
    source_inventory_sha256: executionDescriptor.source.inventory_sha256,
    dependency_inventory_sha256: executionDescriptor.dependencies.inventory.inventory_sha256,
    runtime_identity_sha256: executionDescriptor.runtime_identity.identity_sha256,
    runtime_executable_sha256: executionDescriptor.runtime_identity.runtime.executable_sha256,
    package_lock_sha256: executionDescriptor.runtime_identity.package_lock.sha256,
    bindings,
    release_version: 1,
    confirmation_seed_count: confirmationSeedList.length,
    held_out_seed_count: heldOutSeeds.length,
  };
}

function buildManifestOperatorPlan({
  sourceBundle,
  executionDescriptor,
  confirmationSeedList,
  heldOutSeeds,
  bindings,
  releaseSetId,
  seedSets,
}) {
  const freezeIdentity = buildManifestFreezeIdentity(
    sourceBundle, executionDescriptor, confirmationSeedList, heldOutSeeds, bindings,
  );
  const freezeIdentitySha256 = sha256(canonical(freezeIdentity));
  const commitments = Object.fromEntries(Object.entries(seedSets).map(([partition, seeds]) => [partition, {
    schema: 1,
    partition,
    state: "sealed",
    algorithm: "sha256-json-array-v1",
    seed_count: seeds.length,
    commitment: seedListCommitment(seeds),
    operator_contract_version: SEED_RELEASE_OPERATOR_VERSION,
    release_set_id: releaseSetId,
    freeze_identity_sha256: freezeIdentitySha256,
    claim_eligible: true,
    generation_method: "system-cryptographic-entropy-v1",
  }]));
  const planBody = {
    schema: 1,
    contract_version: SEED_RELEASE_PLAN_VERSION,
    state: "commitments-sealed",
    artifact: "candidate-010",
    release_set_id: releaseSetId,
    release_version: 1,
    claim_eligible: true,
    generation_method: "system-cryptographic-entropy-v1",
    source_identity: {
      source_sha256: sourceBundle.source_sha256,
      source_commit: sourceBundle.vcs.source_commit,
    },
    execution_identity: {
      descriptor_sha256: executionDescriptor.descriptor_sha256,
      source_inventory_sha256: executionDescriptor.source.inventory_sha256,
      dependency_inventory_sha256: executionDescriptor.dependencies.inventory.inventory_sha256,
    },
    runtime_identity: {
      identity_sha256: executionDescriptor.runtime_identity.identity_sha256,
      executable_sha256: executionDescriptor.runtime_identity.runtime.executable_sha256,
      package_lock_sha256: executionDescriptor.runtime_identity.package_lock.sha256,
    },
    bindings,
    partitions: Object.fromEntries(Object.entries(commitments).map(([partition, commitment]) => [partition, {
      commitment_path: `${partition}.commit.json`,
      seed_count: commitment.seed_count,
      commitment: commitment.commitment,
      escrow_sha256: sha256(`candidate-010-manifest-gate-fixture-escrow:${partition}`),
    }])),
    cross_partition: {
      freeze_identity_sha256: freezeIdentitySha256,
      uniqueness_rule: "one jointly generated unsigned-32-bit set split once; duplicates refused",
      total_seed_count: confirmationSeedList.length + heldOutSeeds.length,
    },
  };
  return { commitments, plan: { ...planBody, plan_sha256: sha256(canonical(planBody)) } };
}

async function writeManifestRevealsAndAttestation({
  bindingRoot,
  revealedRoot,
  seedSets,
  commitments,
  releaseSetId,
  plan,
}) {
  await writeJson(path.join(bindingRoot, "seed-release-plan.json"), plan);
  const reveals = {};
  for (const [partition, seeds] of Object.entries(seedSets)) {
    reveals[partition] = {
      schema: 1,
      partition,
      state: "frozen-reveal",
      algorithm: "sha256-json-array-v1",
      commitment: commitments[partition].commitment,
      seeds,
      operator_contract_version: SEED_RELEASE_OPERATOR_VERSION,
      release_set_id: releaseSetId,
      plan_sha256: plan.plan_sha256,
      claim_eligible: true,
    };
    await writeJson(path.join(bindingRoot, `${partition}.commit.json`), commitments[partition]);
    await writeJson(path.join(revealedRoot, `${partition}.commit.json`), commitments[partition]);
    await writeJson(path.join(revealedRoot, `${partition}.reveal.json`), reveals[partition]);
  }
  await writeJson(path.join(revealedRoot, "seed-release-plan.json"), plan);
  const attestationBody = {
    schema: 1,
    contract_version: SEED_REVEAL_ATTESTATION_VERSION,
    state: "explicitly-revealed",
    artifact: "candidate-010",
    release_set_id: releaseSetId,
    plan_sha256: plan.plan_sha256,
    claim_eligible: true,
    partitions: Object.fromEntries(Object.entries(commitments).map(([partition, commitment]) => [partition, {
      commitment: commitment.commitment,
      seed_count: commitment.seed_count,
      reveal_sha256: sha256(canonical(reveals[partition])),
    }])),
    disjointness: "verified",
  };
  await writeJson(path.join(revealedRoot, "seed-reveal-attestation.json"), {
    ...attestationBody,
    attestation_sha256: sha256(canonical(attestationBody)),
  });
}

async function writeManifestSeedOperatorFixture({
  bindingRoot,
  sourceBundle,
  executionDescriptor,
  config,
  design,
  backendRegistry,
  preregistration,
  confirmationSeeds: confirmationSeedList,
  heldOutSeeds,
}) {
  const revealedRoot = path.join(bindingRoot, "revealed");
  await mkdir(revealedRoot, { recursive: true });
  const snapshotBodies = {
    source_bundle: sourceBundle,
    execution_descriptor: executionDescriptor,
    runtime_identity: executionDescriptor.runtime_identity,
    config,
    design,
    backend_registry: backendRegistry,
    preregistration,
  };
  const snapshotNames = {
    source_bundle: "source-bundle.json",
    execution_descriptor: "execution-descriptor.json",
    runtime_identity: "runtime-identity.json",
    config: "config.json",
    design: "design.json",
    backend_registry: "backend-registry.json",
    preregistration: "preregistration.json",
  };
  const bindings = await writeManifestSnapshotFiles(bindingRoot, revealedRoot, snapshotBodies, snapshotNames);
  const releaseSetId = sha256(canonical({
    fixture: "candidate-010-manifest-gate-fixture-release-set",
    confirmation: confirmationSeedList,
    held_out: heldOutSeeds,
  }));
  const seedSets = { confirmation: confirmationSeedList, "held-out": heldOutSeeds };
  const { commitments, plan } = buildManifestOperatorPlan({
    sourceBundle,
    executionDescriptor,
    confirmationSeedList,
    heldOutSeeds,
    bindings,
    releaseSetId,
    seedSets,
  });
  await writeManifestRevealsAndAttestation({
    bindingRoot,
    revealedRoot,
    seedSets,
    commitments,
    releaseSetId,
    plan,
  });
  return { bindingRoot, revealedRoot };
}

async function createTestLink(target, link, type, context) {
  try {
    await symlink(target, link, type);
    return true;
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP", "UNKNOWN"].includes(error?.code)) {
      context.diagnostic(`link hostile unavailable on this host: ${error.code}`);
      return false;
    }
    throw error;
  }
}

async function git(cwd, ...args) {
  return executeFile("git", ["-c", "core.autocrlf=false", ...args], { cwd, windowsHide: true });
}

function confirmationSeeds(config, scenarios) {
  let safeSeed = null;
  const unsafeSeeds = [];
  for (let seed = 1; seed < 10_000 && (safeSeed === null || unsafeSeeds.length < 2); seed += 1) {
    const rows = scenarios.flatMap((scenario) => generateOpportunities({
      ...config,
      ...scenario.config_overlay,
      modeled_energy_j: {
        ...config.modeled_energy_j,
        ...(scenario.config_overlay?.modeled_energy_j ?? {}),
      },
    }, seed));
    if (safeSeed === null && rows.every((row) => (
      !row.unsafe && (row.evidence[0] + row.evidence[1]) / 2 < 0
    ))) safeSeed = seed;
    if (unsafeSeeds.length < 2 && rows.every((row) => (
      row.unsafe && (row.evidence[0] + row.evidence[1]) / 2 >= 0
    ))) unsafeSeeds.push(seed);
  }
  if (safeSeed === null || unsafeSeeds.length !== 2) {
    throw new Error("Could not construct balanced test-only confirmation clusters.");
  }
  return [safeSeed, ...unsafeSeeds];
}

async function copyPromotionFixtureFiles(fixtureRepository, sourceFiles) {
  for (const relative of [
    ...sourceFiles,
    CANDIDATE_010_MANIFEST_FILE,
    "experiments/workstation/candidate-010/seeds/development.json",
  ]) {
    const destination = path.join(fixtureRepository, ...relative.split("/"));
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(path.join(repositoryRoot, ...relative.split("/")), destination);
  }
  await mkdir(path.join(fixtureRepository, "node_modules"));
  await cp(
    path.join(repositoryRoot, "node_modules", "es-module-lexer"),
    path.join(fixtureRepository, "node_modules", "es-module-lexer"),
    { recursive: true },
  );
  await git(fixtureRepository, "init");
  await git(fixtureRepository, "config", "user.email", "promotion-fixture@example.invalid");
  await git(fixtureRepository, "config", "user.name", "Promotion Fixture");
  await git(fixtureRepository, "add", "--", ".");
  await git(fixtureRepository, "commit", "-m", "promotion capsule fixture");
}

async function setupPromotionFixtureRepository(container) {
  const fixtureRepository = path.join(container, "repository");
  const fixtureCandidateRoot = path.join(fixtureRepository, ...candidateRelative.split("/"));
  const executionParent = path.join(container, "execution-parent");
  const releaseBindingRoot = path.join(
    fixtureRepository,
    "experiments",
    "workstation",
    "releases",
    "candidate-010",
  );
  const runDirectory = path.join(
    fixtureRepository,
    "experiments",
    "workstation",
    "runs",
    "candidate-010-confirmation",
  );
  await mkdir(fixtureCandidateRoot, { recursive: true });
  await mkdir(executionParent);
  await mkdir(releaseBindingRoot, { recursive: true });
  const sourceFiles = (await discoverCandidate010SourceFiles({ root: repositoryRoot })).source_files;
  await copyPromotionFixtureFiles(fixtureRepository, sourceFiles);
  const expectedSourceBundle = await captureCandidate010SourceBundle(fixtureRepository);
  const runtimeIdentity = await captureRuntimeIdentity({
    repositoryRoot: fixtureRepository,
    candidateRoot: fixtureCandidateRoot,
  });
  const executionCapsule = await buildExecutionCapsule({
    repositoryRoot: fixtureRepository,
    executionParent,
    runtimeIdentity,
    sourcePaths: sourceFiles,
    candidateDirectory: candidateRelative,
  });
  const capsuleCandidateRoot = path.join(executionCapsule.local.source_root, ...candidateRelative.split("/"));
  const modules = Object.fromEntries(await Promise.all([
    "capsule-execution-authority",
    "factorial-runner",
    "promotion-evidence",
    "release-contract",
  ].map(async (name) => [name, await import(pathToFileURL(path.join(capsuleCandidateRoot, `${name}.mjs`)).href)])));

  return {
    fixtureRepository,
    fixtureCandidateRoot,
    releaseBindingRoot,
    runDirectory,
    expectedSourceBundle,
    executionCapsule,
    modules,
  };
}

async function setupPromotionRelease({
  releaseBindingRoot,
  executionCapsule,
  expectedSourceBundle,
  modules,
}) {
  const config = {
    ...JSON.parse(await readFile(path.join(benchmarkRoot, "configs", "smoke.json"), "utf8")),
    profile: "confirmation",
    opportunities_per_seed: 1,
    checkpoint_interval_records: 8,
    unsafe_base_rate: 0.5,
    threshold: 10,
    abstention_band: 0,
    verifier_gate: 100,
    verifier_threshold: 0,
    reversible_trace_band: 0,
    sprt_log_odds_threshold: 100,
  };
  const fullDesign = buildFactorialDesign({ splits: ["confirmation"] });
  const scenarios = fullDesign;
  const seeds = confirmationSeeds(config, scenarios);
  const preregistration = createConfirmatoryPreregistration({
    irreversible_violation_margin: 0.01,
    false_commit_margin: 0.01,
  });
  const disjointSeeds = [303, 404];
  const seedOperator = await writeManifestSeedOperatorFixture({
    bindingRoot: path.join(releaseBindingRoot, "seed-operator"),
    sourceBundle: expectedSourceBundle,
    executionDescriptor: executionCapsule.descriptor,
    config,
    design: { scenarios },
    backendRegistry: { backends: BACKEND_METADATA },
    preregistration,
    confirmationSeeds: seeds,
    heldOutSeeds: disjointSeeds,
  });
  const operatorRelative = path.relative(releaseBindingRoot, seedOperator.revealedRoot).replaceAll("\\", "/");
  const files = {
    sourceBundlePath: `${operatorRelative}/source-bundle.json`,
    executionDescriptorPath: `${operatorRelative}/execution-descriptor.json`,
    runtimeIdentityPath: `${operatorRelative}/runtime-identity.json`,
    configPath: `${operatorRelative}/config.json`,
    designPath: `${operatorRelative}/design.json`,
    backendRegistryPath: `${operatorRelative}/backend-registry.json`,
    preregistrationPath: `${operatorRelative}/preregistration.json`,
    commitmentPath: `${operatorRelative}/confirmation.commit.json`,
    revealPath: `${operatorRelative}/confirmation.reveal.json`,
  };
  const release = await modules["release-contract"].createFrozenSeedReleaseContract({
    bindingRoot: releaseBindingRoot,
    sourceRoot: executionCapsule.local.source_root,
    releaseVersion: 1,
    partition: "confirmation",
    phase: "confirmation",
    ...files,
  });
  const releasePath = path.join(releaseBindingRoot, "confirmation.release.json");
  await writeJson(releasePath, release);
  const disjointPath = path.join(seedOperator.revealedRoot, "held-out.reveal.json");
  return { config, scenarios, seeds, seedOperator, releasePath, disjointPath, files };
}

async function makeFixture() {
  const container = await mkdtemp(path.join(os.tmpdir(), "20w-c010-promotion-v2-"));
  let executionCapsule;
  try {
    const setup = await setupPromotionFixtureRepository(container);
    executionCapsule = setup.executionCapsule;
    const releaseData = await setupPromotionRelease({
      releaseBindingRoot: setup.releaseBindingRoot,
      executionCapsule,
      expectedSourceBundle: setup.expectedSourceBundle,
      modules: setup.modules,
    });
    return {
      container,
      ...setup,
      ...releaseData,
    };
  } catch (error) {
    let destroyError = null;
    if (executionCapsule) {
      try {
        await destroyExecutionCapsule(executionCapsule);
      } catch (err) {
        if (err?.code !== "ENOENT") destroyError = err;
      }
    }
    let rmError = null;
    try {
      await rm(container, { recursive: true, force: true });
    } catch (err) {
      if (err?.code !== "ENOENT") rmError = err;
    }
    const cleanupErrors = [destroyError, rmError].filter(Boolean);
    if (cleanupErrors.length > 0) {
      throw new AggregateError([error, ...cleanupErrors], "makeFixture failed with cleanup errors", { cause: error });
    }
    throw error;
  }
}

async function runFixtureConfirmation(value) {
  const capsuleParent = path.join(value.container, "confirmation-capsules");
  await mkdir(capsuleParent);
  const runnerUrl = pathToFileURL(path.join(
    value.fixtureRepository,
    ...candidateRelative.split("/"),
    "runner.mjs",
  )).href;
  const options = {
    "release-root": value.releaseBindingRoot,
    release: path.basename(value.releasePath),
    "disjoint-with": path.relative(value.releaseBindingRoot, value.disjointPath).replaceAll("\\", "/"),
    output: value.runDirectory,
    "capsule-parent": capsuleParent,
  };
  const script = [
    `const { runCapsuleConfirmationOperator } = await import(${JSON.stringify(runnerUrl)});`,
    "const result = await runCapsuleConfirmationOperator(JSON.parse(process.argv[1]));",
    "process.stdout.write(JSON.stringify(result));",
  ].join("\n");
  const { stdout, stderr } = await executeFile(
    process.execPath,
    ["--input-type=module", "--eval", script, JSON.stringify(options)],
    {
      cwd: value.fixtureRepository,
      windowsHide: true,
      timeout: 180_000,
      maxBuffer: 1024 * 1024,
    },
  );
  assert.equal(stderr, "");
  assert.deepEqual(await readdir(capsuleParent), []);
  return JSON.parse(stdout);
}

async function runFixturePromotionOperator(value, exportName, options, label) {
  const runnerUrl = pathToFileURL(path.join(value.fixtureCandidateRoot, "runner.mjs")).href;
  const requestPath = path.join(value.container, `${label}.request.json`);
  const resultPath = path.join(value.container, `${label}.result.json`);
  await writeJson(requestPath, options);
  const script = [
    'import { readFile, writeFile } from "node:fs/promises";',
    `const { ${exportName} } = await import(${JSON.stringify(runnerUrl)});`,
    "const request = JSON.parse(await readFile(process.argv[1], 'utf8'));",
    `const result = await ${exportName}(request);`,
    "await writeFile(process.argv[2], JSON.stringify(result));",
  ].join("\n");
  const { stderr } = await executeFile(
    process.execPath,
    ["--input-type=module", "--eval", script, requestPath, resultPath],
    {
      cwd: value.fixtureRepository,
      windowsHide: true,
      timeout: 180_000,
      maxBuffer: 1024 * 1024,
    },
  );
  assert.equal(stderr, "");
  return JSON.parse(await readFile(resultPath, "utf8"));
}

async function runFixtureManifestValidator(value, label) {
  const validatorUrl = pathToFileURL(path.join(
    value.fixtureRepository,
    "scripts",
    "lib",
    "workstation-manifests.mjs",
  )).href;
  const resultPath = path.join(value.container, `${label}.result.json`);
  const script = [
    `const { validateExecutionManifest } = await import(${JSON.stringify(validatorUrl)});`,
    "const { join } = await import('node:path');",
    "const root = process.cwd();",
    "const manifestPath = join(root, 'experiments', 'workstation', 'manifests', 'candidate-010.json');",
    "const result = await validateExecutionManifest(root, manifestPath, 'candidate-010');",
    "await import('node:fs/promises').then(({ writeFile }) => writeFile(process.argv[1], JSON.stringify(result)));",
  ].join("\n");
  const { stderr } = await executeFile(
    process.execPath,
    ["--input-type=module", "--eval", script, resultPath],
    {
      cwd: value.fixtureRepository,
      windowsHide: true,
      timeout: 180_000,
      maxBuffer: 1024 * 1024,
    },
  );
  assert.equal(stderr, "");
  return JSON.parse(await readFile(resultPath, "utf8"));
}

async function cleanupFixture(value) {
  if (!value) return;
  let destroyError = null;
  if (value.executionCapsule) {
    try {
      await destroyExecutionCapsule(value.executionCapsule);
    } catch (err) {
      if (err?.code !== "ENOENT") destroyError = err;
    }
  }
  let rmError = null;
  if (value.container) {
    try {
      await rm(value.container, { recursive: true, force: true });
    } catch (err) {
      if (err?.code !== "ENOENT") rmError = err;
    }
  }
  const cleanupErrors = [destroyError, rmError].filter(Boolean);
  if (cleanupErrors.length === 1) throw cleanupErrors[0];
  if (cleanupErrors.length > 1) throw new AggregateError(cleanupErrors, "cleanupFixture failed");
}

function createFixtureEnergyReading(index, interval, arm) {
  return {
    contract_version: EXTERNAL_ENERGY_CONTRACT_VERSION,
    reading_id: `fixture-energy-${index}`,
    record_kind: "hardware-observation",
    provider: {
      type: "external-meter",
      medium: "wall",
      provider_id: "temporary-contract-test-provider",
      meter_id: `temporary-contract-test-meter-${index}`,
      boundary: "temporary schema/plumbing work unit only",
      hardware_configuration: "synthetic contract-valid fixture; not a workstation measurement",
      software_telemetry: false,
    },
    calibration: {
      calibration_id: "temporary-contract-test-calibration",
      calibrated_at: "2026-01-01T00:00:00.000Z",
      valid_until: "2027-01-01T00:00:00.000Z",
      relative_standard_uncertainty: 0.01,
      coverage_factor: 2,
      traceability_reference: "test-only contract fixture; no empirical claim",
    },
    interval: {
      started_at: interval.started_at,
      ended_at: interval.ended_at,
      clock_id: "fixture-clock",
      clock_uncertainty_s: 0.001,
      clock_discontinuity_observed: false,
    },
    integrity: { meter_reset_observed: false, negative_reading_observed: false },
    measurement: {
      method: "counter-delta",
      start: { value: 0, unit: "J", observed_at: interval.started_at },
      end: {
        value: arm === "reset-coupled" ? 1 : 10,
        unit: "J",
        observed_at: interval.ended_at,
      },
    },
  };
}

function createFixtureObservation(record, index, measured) {
  const interval = record.measurement_interval;
  const ownership = {
    run_id: record.run_id,
    pair_id: record.pair_id,
    work_unit_id: record.work_unit_id,
    scenario_id: record.scenario_id,
    task_family: record.task_family,
    backend_id: record.backend_id,
    cluster_id: record.cluster_id,
    opportunity_id: record.opportunity_id,
    arm: record.arm,
    interval_started_at: interval.started_at,
    interval_ended_at: interval.ended_at,
  };
  const unsignedReview = {
    schema: 1,
    review_id: `fixture-review-${index}`,
    reviewer_id: "temporary-contract-test-reviewer",
    reviewed_at: "2026-08-22T00:00:00.000Z",
    decision: "approved",
    observation_sha256: hashNormalizedExternalEnergyObservation(measured),
  };
  const review = { ...unsignedReview, review_sha256: hashProvenanceReviewRecord(unsignedReview) };
  return {
    review,
    observation: bindExternalEnergyObservation(measured, { ownership, provenanceReview: review }),
  };
}

async function writeEnergyAssignments(value, energyRoot = value.releaseBindingRoot) {
  const records = await value.modules["factorial-runner"].readFactorialRecords(value.runDirectory);
  const assignments = [];
  for (const [index, record] of records.entries()) {
    const reading = createFixtureEnergyReading(index, record.measurement_interval, record.arm);
    const measured = evaluateExternalEnergyReading(reading).measured;
    const { review, observation } = createFixtureObservation(record, index, measured);
    const rawReadingPath = `energy/raw-${index}.json`;
    const reviewPath = `energy/review-${index}.json`;
    await writeJson(path.join(energyRoot, rawReadingPath), reading);
    await writeJson(path.join(energyRoot, reviewPath), review);
    assignments.push({
      work_unit_id: record.work_unit_id,
      raw_reading_path: rawReadingPath,
      provenance_review_path: reviewPath,
      observation,
    });
  }
  const energyAssignmentsPath = path.join(energyRoot, "energy-assignments.json");
  await writeJson(energyAssignmentsPath, { schema: 1, assignments });
  return energyAssignmentsPath;
}


function evidencePaths(value, executionAuthority, energyAssignmentsPath) {
  return {
    executionAuthority,
    executionCapsule: value.executionCapsule,
    expectedSourceBundle: value.expectedSourceBundle,
    runDirectory: value.runDirectory,
    releaseBindingRoot: value.releaseBindingRoot,
    releasePath: value.releasePath,
    energyAssignmentsPath,
    disjointSeedPackPaths: [value.disjointPath],
  };
}

test("summary booleans and hash-looking strings are never promotion evidence", async () => {
  await assert.rejects(validatePromotionEvidence(true, {}), /complete bundle, not a summary boolean/);
  const body = {
    schema: 1,
    contract_version: PROMOTION_EVIDENCE_VERSION,
    source: { commit: "a".repeat(40), bundle_sha256: "b".repeat(64) },
  };
  const fake = { ...body, evidence_sha256: sha256(canonical(body)) };
  await assert.rejects(validatePromotionEvidence(fake, {}), /not promotion-eligible/);
});

test("promotion evidence is created only inside a live matching capsule capability", async (context) => {
  const value = await makeFixture();
  const authority = value.modules["capsule-execution-authority"];
  const capsulePromotion = value.modules["promotion-evidence"];
  let revoked;
  let completedPaths;
  let completedEvidence;
  let energyAssignmentsPath;
  try {
    const confirmation = await runFixtureConfirmation(value);
    assert.equal(confirmation.status, "verified");
    assert.equal(confirmation.action, "candidate-010-confirmation");
    energyAssignmentsPath = await writeEnergyAssignments(value, value.runDirectory);
    await authority.withVerifiedCapsuleExecutionAuthority({
      executionCapsule: value.executionCapsule,
      expectedSourceBundle: value.expectedSourceBundle,
    }, async (executionAuthority) => {
      revoked = executionAuthority;
      await assert.rejects(capsulePromotion.buildPromotionEvidence({
        ...evidencePaths(value, null, "unused"),
      }), /forged, cloned, foreign, or revoked/);
      await assert.rejects(capsulePromotion.buildPromotionEvidence({
        ...evidencePaths(value, Object.freeze(function forged() {}), "unused"),
      }), /forged, cloned, foreign, or revoked/);
      await assert.rejects(capsulePromotion.buildPromotionEvidence({
        ...evidencePaths(value, executionAuthority, "unused"),
        repositoryRoot: value.fixtureRepository,
        releaseRoot: value.releaseBindingRoot,
      }), /legacy worktree roots are refused/);

      completedPaths = evidencePaths(value, executionAuthority, energyAssignmentsPath);
      const evidence = await capsulePromotion.buildPromotionEvidence(completedPaths);
      completedEvidence = evidence;
      assert.equal(evidence.analysis.eligible_for_superiority_claim, true);
      assert.equal(evidence.analysis.decision, "eligible");
      assert.equal(evidence.capsule.execution_descriptor_sha256, value.executionCapsule.descriptor.descriptor_sha256);
      assert.equal(evidence.capsule.runtime_identity_sha256, value.executionCapsule.descriptor.runtime_identity.identity_sha256);
      assert.equal(evidence.release.execution_descriptor_file_sha256.length, 64);
      assert.equal(evidence.release.runtime_identity_file_sha256.length, 64);
      assert.equal(JSON.stringify(evidence).includes(value.executionCapsule.local.outer_root), false);
      assert.equal(JSON.stringify(evidence).includes(value.executionCapsule.local.source_root), false);
      assert.equal(JSON.stringify(evidence).includes("ownership_token"), false);
      assert.equal((await capsulePromotion.validatePromotionEvidence(evidence, completedPaths)).valid, true);
      await assert.rejects(
        readFile(path.join(value.container, "promotion-evidence.json")),
        (error) => error?.code === "ENOENT",
      );

      const runAlias = path.join(value.container, "linked-run-root");
      if (await createTestLink(
        value.runDirectory,
        runAlias,
        process.platform === "win32" ? "junction" : "dir",
        context,
      )) {
        await assert.rejects(
          capsulePromotion.buildPromotionEvidence({ ...completedPaths, runDirectory: runAlias }),
          /symbolic link|reparse point|resolves through/i,
        );
        await rm(runAlias, { force: true });
      }

      const runConfigPath = path.join(value.runDirectory, "provenance", "config.json");
      const runConfigBody = await readFile(runConfigPath);
      const externalRunConfig = path.join(value.container, "outside-run-config.json");
      await writeFile(externalRunConfig, runConfigBody);
      await rm(runConfigPath);
      try {
        if (await createTestLink(externalRunConfig, runConfigPath, "file", context)) {
          await assert.rejects(
            capsulePromotion.buildPromotionEvidence(completedPaths),
            /symbolic link|reparse point/i,
          );
          await rm(runConfigPath, { force: true });
        }
      } finally {
        await writeFile(runConfigPath, runConfigBody, { flag: "wx" }).catch(async (error) => {
          if (error.code !== "EEXIST") throw error;
          await rm(runConfigPath, { force: true });
          await writeFile(runConfigPath, runConfigBody, { flag: "wx" });
        });
      }

      const assignmentAlias = path.join(value.releaseBindingRoot, "linked-energy-assignments.json");
      if (await createTestLink(energyAssignmentsPath, assignmentAlias, "file", context)) {
        await assert.rejects(
          capsulePromotion.buildPromotionEvidence({
            ...completedPaths,
            energyAssignmentsPath: assignmentAlias,
          }),
          /symbolic link|reparse point/i,
        );
        await rm(assignmentAlias, { force: true });
      }

      const disjointAlias = path.join(value.releaseBindingRoot, "linked-disjoint.json");
      if (await createTestLink(value.disjointPath, disjointAlias, "file", context)) {
        await assert.rejects(
          capsulePromotion.buildPromotionEvidence({
            ...completedPaths,
            disjointSeedPackPaths: [disjointAlias],
          }),
          /symbolic link|reparse point/i,
        );
        await rm(disjointAlias, { force: true });
      }
      await assert.rejects(
        capsulePromotion.buildPromotionEvidence({
          ...completedPaths,
          disjointSeedPackPaths: [path.join(value.container, "outside-disjoint.json")],
        }),
        /escapes its declared root/i,
      );

      const assignmentsBody = await readFile(energyAssignmentsPath);
      const assignments = JSON.parse(assignmentsBody);
      const firstRawRelative = assignments.assignments[0].raw_reading_path;
      const energyInputRoot = path.dirname(energyAssignmentsPath);
      const firstRaw = path.join(energyInputRoot, ...firstRawRelative.split("/"));
      const rawAliasRelative = "energy/raw-linked.json";
      const rawAlias = path.join(energyInputRoot, ...rawAliasRelative.split("/"));
      if (await createTestLink(firstRaw, rawAlias, "file", context)) {
        assignments.assignments[0].raw_reading_path = rawAliasRelative;
        await writeJson(energyAssignmentsPath, assignments);
        await assert.rejects(
          capsulePromotion.buildPromotionEvidence(completedPaths),
          /symbolic link|reparse point/i,
        );
        await writeFile(energyAssignmentsPath, assignmentsBody);
        await rm(rawAlias, { force: true });
      }
      const firstReviewRelative = JSON.parse(assignmentsBody).assignments[0].provenance_review_path;
      const firstReview = path.join(energyInputRoot, ...firstReviewRelative.split("/"));
      const reviewAliasRelative = "energy/review-linked.json";
      const reviewAlias = path.join(energyInputRoot, ...reviewAliasRelative.split("/"));
      if (await createTestLink(firstReview, reviewAlias, "file", context)) {
        const reviewLinkedAssignments = JSON.parse(assignmentsBody);
        reviewLinkedAssignments.assignments[0].provenance_review_path = reviewAliasRelative;
        await writeJson(energyAssignmentsPath, reviewLinkedAssignments);
        await assert.rejects(
          capsulePromotion.buildPromotionEvidence(completedPaths),
          /symbolic link|reparse point/i,
        );
        await writeFile(energyAssignmentsPath, assignmentsBody);
        await rm(reviewAlias, { force: true });
      }

      const externalEnergy = path.join(value.container, "external-energy");
      const energyJunction = path.join(energyInputRoot, "energy-junction");
      await mkdir(externalEnergy);
      await writeFile(path.join(externalEnergy, "raw.json"), await readFile(firstRaw));
      if (await createTestLink(
        externalEnergy,
        energyJunction,
        process.platform === "win32" ? "junction" : "dir",
        context,
      )) {
        const linkedAssignments = JSON.parse(assignmentsBody);
        linkedAssignments.assignments[0].raw_reading_path = "energy-junction/raw.json";
        await writeJson(energyAssignmentsPath, linkedAssignments);
        await assert.rejects(
          capsulePromotion.buildPromotionEvidence(completedPaths),
          /symbolic link|reparse point/i,
        );
        await writeFile(energyAssignmentsPath, assignmentsBody);
        await rm(energyJunction, { force: true });
      }

      const duplicatedAssignments = JSON.parse(assignmentsBody);
      duplicatedAssignments.assignments[1].raw_reading_path = firstRawRelative.replace(
        "energy/",
        "energy/../energy/",
      );
      await writeJson(energyAssignmentsPath, duplicatedAssignments);
      await assert.rejects(
        capsulePromotion.buildPromotionEvidence(completedPaths),
        /duplicates another promotion input real path/i,
      );
      await writeFile(energyAssignmentsPath, assignmentsBody);

      const releaseBody = await readFile(value.releasePath);
      const release = JSON.parse(releaseBody);
      const v2Body = { ...release, contract_version: "candidate-010.frozen-seed-release.v2" };
      delete v2Body.release_sha256;
      await writeJson(value.releasePath, { ...v2Body, release_sha256: sha256(canonical(v2Body)) });
      await assert.rejects(capsulePromotion.buildPromotionEvidence(completedPaths), /Invalid or corrupted frozen release contract/);
      await writeFile(value.releasePath, releaseBody);

      const descriptorPath = path.join(value.releaseBindingRoot, value.files.executionDescriptorPath);
      const descriptorBody = await readFile(descriptorPath);
      await writeFile(descriptorPath, Buffer.concat([descriptorBody, Buffer.from(" ")]));
      await assert.rejects(capsulePromotion.buildPromotionEvidence(completedPaths), /execution_descriptor file hash mismatch/);
      await writeFile(descriptorPath, descriptorBody);

      const runtimePath = path.join(value.releaseBindingRoot, value.files.runtimeIdentityPath);
      const runtimeBody = await readFile(runtimePath);
      await writeFile(runtimePath, Buffer.concat([runtimeBody, Buffer.from(" ")]));
      await assert.rejects(capsulePromotion.buildPromotionEvidence(completedPaths), /runtime_identity file hash mismatch/);
      await writeFile(runtimePath, runtimeBody);

      const provenancePath = path.join(value.runDirectory, "provenance", "capsule-execution-authority.json");
      const provenanceBody = await readFile(provenancePath);
      const provenance = JSON.parse(provenanceBody);
      provenance.runtime_identity_sha256 = "0".repeat(64);
      await writeJson(provenancePath, provenance);
      await assert.rejects(capsulePromotion.buildPromotionEvidence(completedPaths), /authority differs|validation/i);
      await writeFile(provenancePath, provenanceBody);
    });

    const persistedPaths = {
      runDirectory: value.runDirectory,
      releaseBindingRoot: value.releaseBindingRoot,
      releasePath: value.releasePath,
      energyAssignmentsPath,
      disjointSeedPackPaths: [value.disjointPath],
    };

    // This is a temp-only contract/plumbing proof. Commit B changes only mutable
    // registry state; the genuine operator must still rebuild commit A from the
    // release and must never persist evidence in the real repository.
    const registryPath = path.join(
      value.fixtureRepository,
      ...CANDIDATE_010_MANIFEST_FILE.split("/"),
    );
    const mutableRegistry = JSON.parse(await readFile(registryPath, "utf8"));
    mutableRegistry.readiness = "workstation-ready";
    mutableRegistry.seeds.confirmation = "experiments/workstation/releases/candidate-010/seed-operator/revealed/confirmation.reveal.json";
    mutableRegistry.seeds.held_out = "experiments/workstation/releases/candidate-010/seed-operator/revealed/held-out.reveal.json";
    mutableRegistry.promotion_evidence.status = "present";
    mutableRegistry.promotion_evidence.evidence_path = "experiments/workstation/promotion/candidate-010/evidence.json";
    mutableRegistry.promotion_evidence.promotion_validation_receipt_path = "experiments/workstation/promotion/candidate-010/promotion-validation.launch-receipt.json";
    mutableRegistry.promotion_evidence.disjoint_seed_pack_paths = [
      "experiments/workstation/releases/candidate-010/seed-operator/revealed/held-out.reveal.json",
    ];
    await writeJson(registryPath, mutableRegistry);
    await git(value.fixtureRepository, "add", "--", CANDIDATE_010_MANIFEST_FILE);
    await git(value.fixtureRepository, "commit", "-m", "publish mutable readiness only");
    const commitB = (await git(value.fixtureRepository, "rev-parse", "HEAD")).stdout.trim();
    assert.notEqual(commitB, value.expectedSourceBundle.vcs.source_commit);

    const operatorCapsuleParent = path.join(value.container, "promotion-operator-capsules");
    await mkdir(operatorCapsuleParent);
    const promotionPair = path.join(
      value.fixtureRepository,
      "experiments",
      "workstation",
      "promotion",
      "candidate-010",
    );
    await mkdir(path.dirname(promotionPair), { recursive: true });
    const evidenceOutput = path.join(promotionPair, "evidence.json");
    const receiptOutput = path.join(promotionPair, "promotion-validation.launch-receipt.json");
    const built = await runFixturePromotionOperator(
      value,
      "runCapsulePromotionBuildOperator",
      {
        paths: persistedPaths,
        capsuleParent: operatorCapsuleParent,
        evidenceOutput,
        receiptOutput,
      },
      "promotion-build-at-commit-b",
    );
    assert.equal(built.capsule_destroyed, true);
    assert.deepEqual(await readdir(operatorCapsuleParent), []);
    const persistedEvidence = JSON.parse(await readFile(evidenceOutput, "utf8"));
    const persistedReceipt = JSON.parse(await readFile(receiptOutput, "utf8"));
    assert.equal(persistedEvidence.source.commit, value.expectedSourceBundle.vcs.source_commit);
    assert.deepEqual(persistedEvidence, built.action_result);
    assert.deepEqual(persistedReceipt, built.launch_receipt);
    const revalidated = await runFixturePromotionOperator(
      value,
      "runCapsulePromotionValidationOperator",
      {
        evidence: persistedEvidence,
        paths: persistedPaths,
        capsuleParent: operatorCapsuleParent,
      },
      "promotion-validate-at-commit-b",
    );
    assert.equal(revalidated.capsule_destroyed, true);
    assert.deepEqual(revalidated.action_result, persistedEvidence);
    assert.deepEqual(await readdir(operatorCapsuleParent), []);

    const readyManifest = await runFixtureManifestValidator(value, "manifest-nine-of-nine");
    const manifestDiagnostic = {
      readiness: readyManifest.readiness,
      errors: readyManifest.errors,
      failed_checks: readyManifest.promotionChecks.filter((check) => !check.passed),
    };
    assert.equal(readyManifest.ready, true, JSON.stringify(manifestDiagnostic));
    assert.equal(readyManifest.readiness, "workstation-ready");
    assert.deepEqual(readyManifest.errors, []);
    assert.equal(readyManifest.promotionChecks.length, 9);
    assert.ok(readyManifest.promotionChecks.every((check) => check.passed));

    // Regression: a fully valid operator release must not be accepted beside
    // promotion evidence built from a different legacy release. Before the
    // cross-binding gate, Gates 7/8 and Gate 9 could each pass independently.
    const alternateSeedOperator = await writeManifestSeedOperatorFixture({
      bindingRoot: path.join(value.releaseBindingRoot, "seed-operator-alternate"),
      sourceBundle: value.expectedSourceBundle,
      executionDescriptor: value.executionCapsule.descriptor,
      config: value.config,
      design: { scenarios: value.scenarios },
      backendRegistry: { backends: BACKEND_METADATA },
      preregistration: createConfirmatoryPreregistration({
        irreversible_violation_margin: 0.01,
        false_commit_margin: 0.01,
      }),
      confirmationSeeds: [101_001, 101_002],
      heldOutSeeds: [202_001, 202_002],
    });
    const mismatchedRegistry = structuredClone(mutableRegistry);
    const alternateRelative = path.relative(
      value.fixtureRepository,
      alternateSeedOperator.revealedRoot,
    ).replaceAll("\\", "/");
    mismatchedRegistry.seeds.confirmation = `${alternateRelative}/confirmation.reveal.json`;
    mismatchedRegistry.seeds.held_out = `${alternateRelative}/held-out.reveal.json`;
    await writeJson(registryPath, mismatchedRegistry);
    const mismatchedManifest = await runFixtureManifestValidator(
      value,
      "manifest-refuses-valid-operator-with-different-legacy-release",
    );
    assert.equal(mismatchedManifest.ready, false);
    assert.equal(mismatchedManifest.promotionChecks.find((check) => check.id === "confirmation-seeds")?.passed, true);
    assert.equal(mismatchedManifest.promotionChecks.find((check) => check.id === "held_out-seeds")?.passed, true);
    const mismatchedPromotion = mismatchedManifest.promotionChecks.find((check) => check.id === "promotion-evidence");
    assert.equal(mismatchedPromotion?.passed, false);
    assert.match(
      mismatchedPromotion?.detail ?? "",
      /selected seed-operator|exact operator|operator held-out/i,
    );
    await writeJson(registryPath, mutableRegistry);

    const evidenceBytes = await readFile(evidenceOutput);
    await writeJson(evidenceOutput, {
      eligible_for_superiority_claim: true,
      decision: "eligible",
      all_gates_passed: true,
      evidence_sha256: "e".repeat(64),
    });
    const summaryManifest = await runFixtureManifestValidator(value, "manifest-summary-refusal");
    assert.equal(summaryManifest.ready, false);
    assert.ok(summaryManifest.promotionChecks.find((check) => check.id === "promotion-evidence")?.passed === false);
    await writeFile(evidenceOutput, evidenceBytes);

    const launched = await launchVerifiedCapsuleAction({
      executionCapsule: value.executionCapsule,
      action: "candidate-010-promotion-evidence",
      promotionRequest: {
        operation: "validate",
        paths: persistedPaths,
        evidence: completedEvidence,
      },
      expectedSourceBundle: value.expectedSourceBundle,
      requestParent: value.container,
      timeoutMs: 120_000,
      maxOutputBytes: 1024 * 1024,
    });
    assert.deepEqual(launched.action_result, completedEvidence);
    const durable = await validateDurablePromotionEvidence(
      completedEvidence,
      launched.launch_receipt,
      persistedPaths,
    );
    assert.equal(durable.valid, true);
    assert.equal(durable.evidence_sha256, completedEvidence.evidence_sha256);
    assert.equal(durable.launch_receipt_sha256, launched.launch_receipt.receipt_sha256);
    const forgedReceiptBody = {
      ...launched.launch_receipt,
      result_sha256: "0".repeat(64),
    };
    delete forgedReceiptBody.receipt_sha256;
    const rehashedForgedReceipt = {
      ...forgedReceiptBody,
      receipt_sha256: sha256(canonical(forgedReceiptBody)),
    };
    await assert.rejects(
      validateDurablePromotionEvidence(completedEvidence, rehashedForgedReceipt, persistedPaths),
      /does not bind the exact evidence result/i,
    );

    const energyRoot = path.dirname(energyAssignmentsPath);
    for (const scope of ["raw-energy-reading", "energy-provenance-review"]) {
      const row = completedEvidence.input_files.find((entry) => entry.scope === scope);
      const target = path.join(energyRoot, ...row.path.split("/"));
      const original = await readFile(target);
      await writeFile(target, Buffer.concat([original, Buffer.from(" ")]));
      await assert.rejects(
        validateDurablePromotionEvidence(completedEvidence, launched.launch_receipt, persistedPaths),
        /differs from evidence/i,
      );
      await writeFile(target, original);
    }

    await assert.rejects(
      capsulePromotion.buildPromotionEvidence({ ...completedPaths, executionAuthority: revoked }),
      /forged, cloned, foreign, or revoked/,
    );

    const substitutedRunnerPath = path.join(value.fixtureCandidateRoot, "runner.mjs");
    await writeFile(
      substitutedRunnerPath,
      `${await readFile(substitutedRunnerPath, "utf8")}\n// executable substitution at commit C\n`,
    );
    await git(value.fixtureRepository, "add", "--", `${candidateRelative}/runner.mjs`);
    await git(value.fixtureRepository, "commit", "-m", "substitute executable source");
    await assert.rejects(
      runFixturePromotionOperator(
        value,
        "runCapsulePromotionValidationOperator",
        {
          evidence: persistedEvidence,
          paths: persistedPaths,
          capsuleParent: operatorCapsuleParent,
        },
        "promotion-refuse-at-commit-c",
      ),
      /source, execution, and runtime bindings disagree/,
    );

    // A stored v1 receipt is integrity/diagnostic provenance, not an
    // authenticity token. Even a self-consistently rehashed substitution
    // cannot bypass the fresh live capsule recomputation required by Gate 9.
    const rehashedStoredReceiptBody = {
      ...persistedReceipt,
      elapsed_ms: persistedReceipt.elapsed_ms + 1,
    };
    delete rehashedStoredReceiptBody.receipt_sha256;
    await writeJson(receiptOutput, {
      ...rehashedStoredReceiptBody,
      receipt_sha256: sha256(canonical(rehashedStoredReceiptBody)),
    });
    const forgedReceiptAfterSourceChange = await runFixtureManifestValidator(
      value,
      "manifest-rehashed-receipt-cannot-bypass-fresh-source-check",
    );
    assert.equal(forgedReceiptAfterSourceChange.ready, false);
    const failedPromotion = forgedReceiptAfterSourceChange.promotionChecks.find(
      (check) => check.id === "promotion-evidence",
    );
    assert.equal(failedPromotion?.passed, false);
    assert.match(failedPromotion?.detail ?? "", /source, execution, and runtime bindings disagree/);
  } finally {
    await cleanupFixture(value);
  }
});

test("worktree promotion path cannot manufacture confirmation authority", async () => {
  await assert.rejects(
    import(`${pathToFileURL(path.join(benchmarkRoot, "capsule-execution-authority.mjs")).href}?promotion-worktree=1`),
    /worktree|non-generated source root/i,
  );
});

test("source-byte substitution invalidates the active capsule before recomputation", async () => {
  const value = await makeFixture();
  const authority = value.modules["capsule-execution-authority"];
  try {
    const target = path.join(value.executionCapsule.local.source_root, "package.json");
    await assert.rejects(authority.withVerifiedCapsuleExecutionAuthority({
      executionCapsule: value.executionCapsule,
      expectedSourceBundle: value.expectedSourceBundle,
    }, async () => {
      await chmod(target, 0o600);
      await writeFile(target, "{}\n", "utf8");
    }), /source|capsule|inventory|validation/i);
  } finally {
    await cleanupFixture(value);
  }
});

test("cleanupFixture propagates non-ENOENT destroy errors", async () => {
  await assert.rejects(
    () => cleanupFixture({ executionCapsule: {}, container: null }),
    /capsule|handle/i,
  );
});

