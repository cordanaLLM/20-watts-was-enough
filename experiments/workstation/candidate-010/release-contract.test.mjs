import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile as executeFileCallback } from "node:child_process";
import fs, {
  cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { createAjv } from "../lib/ajv.mjs";
import { BACKEND_METADATA } from "./backend-registry.mjs";
import { createConfirmatoryPreregistration } from "./confirmatory-analysis.mjs";
import { buildFactorialDesign } from "./factorial-design.mjs";
import {
  RELEASE_CONTRACT_VERSION,
  createFrozenSeedReleaseContract,
  openFrozenSeedRelease,
} from "./release-contract.mjs";
import { acquireRunLock, runLockPath } from "./run-lock.mjs";
import { observeFilesystemSnapshot } from "./retry-rollback-comparator.mjs";
import { seedListCommitment } from "./seeds/seed-pack.mjs";
import {
  CANDIDATE_010_MANIFEST_FILE,
  CANDIDATE_010_SOURCE_FILES,
  computeSourceBundle,
  discoverCandidate010SourceFiles,
} from "./source-bundle.mjs";
import {
  revealSeedReleaseSet,
  sealSeedReleaseSet,
  validateSeedReleaseOperatorArtifacts,
} from "./seed-release-operator.mjs";
import { canonicalJson } from "../lib/canonical-json.mjs";

const executeFile = promisify(executeFileCallback);

async function seedArtifactValidator() {
  const schema = JSON.parse(await readFile(
    path.join(
      process.cwd(),
      "experiments",
      "workstation",
      "candidate-010",
      "seeds",
      "seed-release-artifacts.schema.json",
    ),
    "utf8",
  ));
  return createAjv({ allErrors: true }).compile(schema);
}

function assertSeedArtifactSchema(validate, document, label) {
  assert.equal(validate(document), true, `${label}: ${JSON.stringify(validate.errors)}`);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonical(value) {
  return canonicalJson(value, { strict: false, label: "Test" });
}

function sourceInventoryDigest(files) {
  const digest = createHash("sha256");
  for (const row of files) {
    digest.update(`${Buffer.byteLength(row.path)}:${row.path}:${row.bytes}:${row.sha256}\n`);
  }
  return digest.digest("hex");
}

function rehashRuntime(document) {
  const clone = structuredClone(document);
  delete clone.identity_sha256;
  return { ...clone, identity_sha256: sha256(canonical(clone)) };
}

function rehashDescriptor(document) {
  const clone = structuredClone(document);
  delete clone.descriptor_sha256;
  return { ...clone, descriptor_sha256: sha256(canonical(clone)) };
}

function makeRuntimeIdentity(tag) {
  const body = {
    schema: 1,
    artifact: "candidate-010",
    contract_version: "candidate-010.runtime-identity.v1",
    confirmation_claim_eligible: false,
    limits: { confirmation_claim_eligible: false, toctou_guarantee: false },
    runtime: {
      version: `v-test-${tag}`,
      versions: { node: `test-${tag}` },
      platform: "test",
      arch: "x64",
      exec_path: `C:/fixture/${tag}/node.exe`,
      exec_path_realpath: `C:/fixture/${tag}/node.exe`,
      executable_sha256: sha256(`executable-${tag}`),
      executable_bytes: 1024,
    },
    package_lock: {
      path: "package-lock.json",
      lockfile_version: 3,
      sha256: sha256(`lock-${tag}`),
      bytes: 128,
    },
    external_production_dependencies: [],
    external_production_dependency_names: [],
  };
  return { ...body, identity_sha256: sha256(canonical(body)) };
}

function makeExecutionDescriptor(sourceBundle, runtimeIdentity) {
  const sourceFiles = sourceBundle.files.map((row) => ({ ...row }));
  const sourceInventory = {
    files: sourceFiles,
    file_count: sourceFiles.length,
    total_bytes: sourceFiles.reduce((sum, row) => sum + row.bytes, 0),
    inventory_sha256: sourceInventoryDigest(sourceFiles),
  };
  const dependencies = {
    names: [],
    inventory: {
      files: [],
      files_count: 0,
      bytes: 0,
      inventory_sha256: sha256(canonical([])),
    },
  };
  const body = {
    schema: 1,
    artifact: "candidate-010",
    contract_version: "candidate-010.execution-capsule.v1",
    confirmation_claim_eligible: false,
    layout: {
      immutable_source_role: "source/generated-immutable-capsule",
      dependency_root: "node_modules",
      shared_node_modules: false,
    },
    source: {
      contract_version: "candidate-010-immutable-capsule-v1",
      head_commit: sourceBundle.vcs.source_commit,
      source_paths: sourceFiles.map((row) => row.path),
      git_objects: sourceFiles.map((row) => ({
        path: row.path,
        git_mode: "100644",
        git_object_id: sha256(`git:${row.path}`).slice(0, 40),
      })),
      inventory: sourceInventory,
      inventory_sha256: sourceInventory.inventory_sha256,
    },
    runtime_identity: runtimeIdentity,
    dependencies,
    limits: {
      confirmation_claim_eligible: false,
      execution_authority: "none",
      shared_node_modules_allowed: false,
      malicious_host_toctou_closed: false,
    },
  };
  return { ...body, descriptor_sha256: sha256(canonical(body)) };
}

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeFixtureBindingFiles({
  bindingRoot,
  files,
  sourceBundle,
  runtimeIdentity,
  executionDescriptor,
  partition,
  seeds,
}) {
  await writeJson(path.join(bindingRoot, files.sourceBundlePath), sourceBundle);
  await writeJson(path.join(bindingRoot, files.executionDescriptorPath), executionDescriptor);
  await writeJson(path.join(bindingRoot, files.runtimeIdentityPath), runtimeIdentity);
  await writeJson(path.join(bindingRoot, files.configPath), { profile: "test" });
  await writeJson(path.join(bindingRoot, files.designPath), { scenarios: ["test"] });
  await writeFile(path.join(bindingRoot, files.backendRegistryPath), "export const registry = 'test';\n", "utf8");
  await writeJson(path.join(bindingRoot, files.preregistrationPath), { id: "test-preregistration" });
  const commitment = seedListCommitment(seeds);
  await writeJson(path.join(bindingRoot, files.commitmentPath), {
    schema: 1,
    partition,
    state: "sealed",
    algorithm: "sha256-json-array-v1",
    seed_count: seeds.length,
    commitment,
  });
  await writeJson(path.join(bindingRoot, files.revealPath), {
    schema: 1,
    partition,
    state: "frozen-reveal",
    algorithm: "sha256-json-array-v1",
    commitment,
    seeds,
  });
}

async function prepareFixtureSource(sourceRoot, sourceTag) {
  const sourceBodies = {
    "source-a.mjs": `export const value = ${JSON.stringify(sourceTag)};\n`,
    "source-b.json": `${JSON.stringify({ schema: 1, sourceTag })}\n`,
  };
  for (const [relative, body] of Object.entries(sourceBodies)) {
    await writeFile(path.join(sourceRoot, relative), body, "utf8");
  }
  return computeSourceBundle({
    root: sourceRoot,
    sourceFiles: Object.keys(sourceBodies).sort(),
    vcs: {
      source_commit: sha256(`commit-${sourceTag}`).slice(0, 40),
      worktree_state: "frozen-fixture",
    },
  });
}

async function fixture({
  partition = "confirmation",
  seeds = [11, 22],
  sourceTag = "source-a",
  runtimeTag = "runtime-a",
} = {}) {
  const container = await mkdtemp(path.join(os.tmpdir(), "20w-c010-release-v3-"));
  const bindingRoot = path.join(container, "bindings");
  const sourceRoot = path.join(container, "capsule-source");
  await mkdir(bindingRoot);
  await mkdir(sourceRoot);
  const files = {
    sourceBundlePath: "freeze/source-bundle.json",
    executionDescriptorPath: "freeze/execution-descriptor.json",
    runtimeIdentityPath: "freeze/runtime-identity.json",
    configPath: "freeze/config.json",
    designPath: "freeze/design.json",
    backendRegistryPath: "freeze/backend-registry.mjs",
    preregistrationPath: "freeze/preregistration.json",
    commitmentPath: "freeze/seeds.commit.json",
    revealPath: "freeze/seeds.reveal.json",
  };
  const sourceBundle = await prepareFixtureSource(sourceRoot, sourceTag);
  const runtimeIdentity = makeRuntimeIdentity(runtimeTag);
  const executionDescriptor = makeExecutionDescriptor(sourceBundle, runtimeIdentity);
  await writeFixtureBindingFiles({
    bindingRoot,
    files,
    sourceBundle,
    runtimeIdentity,
    executionDescriptor,
    partition,
    seeds,
  });
  const createArguments = {
    bindingRoot,
    sourceRoot,
    releaseVersion: 1,
    partition,
    phase: partition,
    ...files,
  };
  const release = await createFrozenSeedReleaseContract(createArguments);
  const releasePath = path.join(bindingRoot, "freeze", "release.json");
  await writeJson(releasePath, release);
  return {
    container,
    bindingRoot,
    sourceRoot,
    files,
    release,
    releasePath,
    seeds,
    sourceBundle,
    runtimeIdentity,
    executionDescriptor,
    createArguments,
  };
}

async function usingFixture(run, options = {}) {
  const value = await fixture(options);
  try {
    await run(value);
  } finally {
    assert.ok(value.container.startsWith(os.tmpdir()));
    await rm(value.container, { recursive: true, force: true });
  }
}

function openArguments(value, overrides = {}) {
  return {
    bindingRoot: value.bindingRoot,
    sourceRoot: value.sourceRoot,
    releasePath: value.releasePath,
    expectedPartition: value.release.partition,
    phase: value.release.phase,
    disjointWith: [{
      partition: value.release.partition === "confirmation" ? "held-out" : "confirmation",
      seeds: [33, 44],
    }],
    executionDescriptor: value.executionDescriptor,
    runtimeIdentity: value.runtimeIdentity,
    ...overrides,
  };
}

test("v3 confirmation open binds actual source, execution descriptor, and runtime identities", async () => {
  await usingFixture(async (value) => {
    const opened = await openFrozenSeedRelease(openArguments(value));
    assert.equal(value.release.contract_version, RELEASE_CONTRACT_VERSION);
    assert.equal(opened.frozen_release, true);
    assert.equal(opened.source_root_mode, "separate-exact-capsule-root-v1");
    assert.deepEqual(opened.seeds, value.seeds);
    assert.deepEqual(opened.execution_binding, {
      descriptor_sha256: value.executionDescriptor.descriptor_sha256,
      source_inventory_sha256: value.executionDescriptor.source.inventory_sha256,
      dependency_inventory_sha256: value.executionDescriptor.dependencies.inventory.inventory_sha256,
    });
    assert.deepEqual(opened.runtime_binding, {
      identity_sha256: value.runtimeIdentity.identity_sha256,
      executable_sha256: value.runtimeIdentity.runtime.executable_sha256,
      package_lock_sha256: value.runtimeIdentity.package_lock.sha256,
    });
  });
});
test("confirmation refuses legacy single-root development mode", async () => {
  await usingFixture(async (value) => {
    await assert.rejects(createFrozenSeedReleaseContract({
      ...value.createArguments,
      bindingRoot: undefined,
      sourceRoot: undefined,
      root: value.bindingRoot,
    }), /Legacy single-root development mode cannot create a confirmation/);
    await assert.rejects(openFrozenSeedRelease({
      ...openArguments(value),
      bindingRoot: undefined,
      sourceRoot: undefined,
      root: value.bindingRoot,
    }), /Legacy single-root development mode cannot open a confirmation/);
  });
});

test("bound descriptor and runtime bytes are independently substitution-sensitive", async () => {
  await usingFixture(async (value) => {
    await writeFile(
      path.join(value.bindingRoot, value.files.executionDescriptorPath),
      `${JSON.stringify(value.executionDescriptor)} `,
      "utf8",
    );
    await assert.rejects(openFrozenSeedRelease(openArguments(value)), /Bound execution_descriptor file hash mismatch/);
  });
  await usingFixture(async (value) => {
    const file = path.join(value.bindingRoot, value.files.runtimeIdentityPath);
    const body = await readFile(file);
    body[body.length - 2] ^= 1;
    await writeFile(file, body);
    await assert.rejects(openFrozenSeedRelease(openArguments(value)), /Bound runtime_identity file hash mismatch/);
  });
});

test("validly rehashed descriptor cannot disagree with bound source bundle", async () => {
  await usingFixture(async (value) => {
    const changed = structuredClone(value.executionDescriptor);
    changed.source.head_commit = "f".repeat(40);
    await writeJson(path.join(value.bindingRoot, value.files.executionDescriptorPath), rehashDescriptor(changed));
    await assert.rejects(
      createFrozenSeedReleaseContract(value.createArguments),
      /do not describe one release identity/,
    );
  });
});

test("validly rehashed runtime cannot be mixed with descriptor runtime binding", async () => {
  await usingFixture(async (value) => {
    const changed = structuredClone(value.runtimeIdentity);
    changed.package_lock.sha256 = sha256("different-lock");
    await writeJson(path.join(value.bindingRoot, value.files.runtimeIdentityPath), rehashRuntime(changed));
    await assert.rejects(
      createFrozenSeedReleaseContract(value.createArguments),
      /do not describe one release identity/,
    );
  });
});

test("current descriptor and runtime objects must exactly match bound artifacts", async () => {
  await usingFixture(async (value) => {
    const changedDescriptor = structuredClone(value.executionDescriptor);
    changedDescriptor.layout.dependency_root = "alternate-node_modules";
    await assert.rejects(openFrozenSeedRelease(openArguments(value, {
      executionDescriptor: rehashDescriptor(changedDescriptor),
    })), /Current verified execution descriptor or runtime identity differs/);

    const changedRuntime = structuredClone(value.runtimeIdentity);
    changedRuntime.runtime.executable_sha256 = sha256("alternate-executable");
    await assert.rejects(openFrozenSeedRelease(openArguments(value, {
      runtimeIdentity: rehashRuntime(changedRuntime),
    })), /Current verified execution descriptor or runtime identity differs/);
  });
});

test("cross-release execution/runtime identity mix is refused", async () => {
  const first = await fixture({ sourceTag: "same-source", runtimeTag: "runtime-one" });
  const second = await fixture({ sourceTag: "same-source", runtimeTag: "runtime-two" });
  try {
    await assert.rejects(openFrozenSeedRelease(openArguments(first, {
      executionDescriptor: second.executionDescriptor,
      runtimeIdentity: second.runtimeIdentity,
    })), /Current verified execution descriptor or runtime identity differs/);
  } finally {
    await rm(first.container, { recursive: true, force: true });
    await rm(second.container, { recursive: true, force: true });
  }
});

test("source bytes, ordinary bindings, and seed disjointness remain fail-closed", async () => {
  await usingFixture(async (value) => {
    await writeFile(path.join(value.sourceRoot, "source-a.mjs"), "export const substituted = true;\n", "utf8");
    await assert.rejects(openFrozenSeedRelease(openArguments(value)), /bytes or hashes/);
  });
  await usingFixture(async (value) => {
    await writeJson(path.join(value.bindingRoot, value.files.configPath), { profile: "tampered" });
    await assert.rejects(openFrozenSeedRelease(openArguments(value)), /Bound config file hash mismatch/);
  });
  await usingFixture(async (value) => {
    await assert.rejects(openFrozenSeedRelease(openArguments(value, {
      disjointWith: [{ partition: "held-out", seeds: [22, 99] }],
    })), /Seed 22 occurs in both confirmation and held-out/);
  });
});

test("linked artifact paths and source inventory additions are refused", async (context) => {
  await usingFixture(async (value) => {
    await writeFile(path.join(value.sourceRoot, "unbound.mjs"), "export {};\n", "utf8");
    await assert.rejects(openFrozenSeedRelease(openArguments(value)), /inventory does not exactly match/);
  });
  await usingFixture(async (value) => {
    const target = path.join(value.container, "external-runtime.json");
    const bound = path.join(value.bindingRoot, value.files.runtimeIdentityPath);
    await writeFile(target, await readFile(bound));
    await rm(bound);
    try {
      await symlink(target, bound, "file");
    } catch (error) {
      if (["EPERM", "EACCES", "ENOSYS", "UNKNOWN"].includes(error?.code)) {
        context.skip(`symlink creation unavailable: ${error.code}`);
        return;
      }
      throw error;
    }
    await assert.rejects(openFrozenSeedRelease(openArguments(value)), /symbolic-link|reparse-point/);
  });
});

test("missing actual objects and a correctly rehashed v2 release cannot open v3 confirmation", async () => {
  await usingFixture(async (value) => {
    await assert.rejects(openFrozenSeedRelease(openArguments(value, {
      executionDescriptor: undefined,
    })), /invalid exact shape|self-digest/);
    await assert.rejects(openFrozenSeedRelease(openArguments(value, {
      runtimeIdentity: undefined,
    })), /invalid exact shape|self-digest/);

    const oldBody = structuredClone(value.release);
    delete oldBody.release_sha256;
    oldBody.contract_version = "candidate-010.frozen-seed-release.v2";
    const oldRelease = { ...oldBody, release_sha256: sha256(canonical(oldBody)) };
    await writeJson(value.releasePath, oldRelease);
    await assert.rejects(
      openFrozenSeedRelease(openArguments(value)),
      /Invalid or corrupted frozen release contract/,
    );
  });
});

async function operatorGit(cwd, ...args) {
  return executeFile("git", ["-c", "core.autocrlf=false", ...args], { cwd, windowsHide: true });
}

function deterministicFixtureEntropy() {
  let counter = 0;
  return (size) => {
    const chunks = [];
    let length = 0;
    while (length < size) {
      const chunk = createHash("sha256").update(`candidate-010-seed-fixture-${counter}`).digest();
      counter += 1;
      chunks.push(chunk);
      length += chunk.length;
    }
    return Buffer.concat(chunks).subarray(0, size);
  };
}

async function writeSeedOperatorInputs(repositoryRoot, inputsRoot) {
  const developmentConfig = JSON.parse(await readFile(
    path.join(repositoryRoot, "experiments", "workstation", "candidate-010", "configs", "development.json"),
    "utf8",
  ));
  const inputPaths = {
    configPath: path.join(inputsRoot, "confirmation-config.json"),
    designPath: path.join(inputsRoot, "confirmation-design.json"),
    backendRegistryPath: path.join(inputsRoot, "backend-registry.json"),
    preregistrationPath: path.join(inputsRoot, "preregistration.json"),
  };
  await writeJson(inputPaths.configPath, { ...developmentConfig, profile: "confirmation" });
  await writeJson(inputPaths.designPath, {
    scenarios: buildFactorialDesign({ splits: ["confirmation"] }),
  });
  await writeJson(inputPaths.backendRegistryPath, { backends: BACKEND_METADATA });
  await writeJson(inputPaths.preregistrationPath, createConfirmatoryPreregistration({
    irreversible_violation_margin: 0,
    false_commit_margin: 0,
  }));
  return inputPaths;
}

async function makeSeedOperatorFixture() {
  const repositoryRoot = process.cwd();
  const container = await mkdtemp(path.join(os.tmpdir(), "20w-c010-seed-operator-"));
  const repository = path.join(container, "repository");
  const candidateRoot = path.join(repository, "experiments", "workstation", "candidate-010");
  const inputsRoot = path.join(repository, "seed-release-inputs");
  const capsuleParent = path.join(container, "capsules");
  const bindingDirectory = path.join(container, "bindings");
  const escrowDirectory = path.join(container, "private-escrow");
  await mkdir(candidateRoot, { recursive: true });
  await mkdir(inputsRoot);
  await mkdir(capsuleParent);
  const coverage = await discoverCandidate010SourceFiles({
    root: repositoryRoot,
    productionFiles: [...new Set([
      ...CANDIDATE_010_SOURCE_FILES,
      "experiments/workstation/candidate-010/energy-acquisition.mjs",
      "experiments/workstation/candidate-010/seed-release-operator.mjs",
    ])].sort(),
  });
  for (const relative of [...coverage.source_files, CANDIDATE_010_MANIFEST_FILE]) {
    const destination = path.join(repository, ...relative.split("/"));
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(path.join(repositoryRoot, ...relative.split("/")), destination);
  }
  await mkdir(path.join(repository, "node_modules"));
  await cp(
    path.join(repositoryRoot, "node_modules", "es-module-lexer"),
    path.join(repository, "node_modules", "es-module-lexer"),
    { recursive: true },
  );
  const inputPaths = await writeSeedOperatorInputs(repositoryRoot, inputsRoot);
  await operatorGit(repository, "init");
  await operatorGit(repository, "config", "user.email", "seed-operator@example.invalid");
  await operatorGit(repository, "config", "user.name", "Seed Operator Fixture");
  await operatorGit(repository, "add", "--", ".");
  await operatorGit(repository, "commit", "-m", "freeze seed operator fixture");
  return {
    container,
    repository,
    candidateRoot,
    capsuleParent,
    bindingDirectory,
    escrowDirectory,
    inputPaths,
    encryptionKey: Buffer.alloc(32, 0x5a),
  };
}

async function filesBelow(root, maximumEntries = 10000) {
  const values = [];
  const stack = [root];
  let count = 0;
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of await readdir(current, { withFileTypes: true })) {
      if (++count > maximumEntries) {
        throw new RangeError(`filesBelow exceeded maximum entries limit of ${maximumEntries}.`);
      }
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolute);
      } else {
        values.push(absolute);
      }
    }
  }
  return values.sort();
}

test("seed-release operator seals unseen disjoint packs and fixture provenance cannot be relabelled", async () => {
  const value = await makeSeedOperatorFixture();
  try {
    const validateSeedArtifact = await seedArtifactValidator();
    for (const partition of ["confirmation", "held-out"]) {
      const pending = JSON.parse(await readFile(path.join(
        process.cwd(),
        "experiments",
        "workstation",
        "candidate-010",
        "seeds",
        `${partition}.commit.json`,
      ), "utf8"));
      assertSeedArtifactSchema(validateSeedArtifact, pending, `${partition} pending commitment`);
    }
    const sealOptions = {
      repositoryRoot: value.repository,
      bindingDirectory: value.bindingDirectory,
      escrowDirectory: value.escrowDirectory,
      capsuleParent: value.capsuleParent,
      ...value.inputPaths,
      confirmationSeedCount: 3,
      heldOutSeedCount: 2,
      releaseVersion: 1,
      encryptionKey: value.encryptionKey,
    };
    await assert.rejects(sealSeedReleaseSet({
      ...sealOptions,
      seeds: [1, 2],
      claimEligible: true,
    }, { randomBytes: deterministicFixtureEntropy() }), /never accepts caller-provided seeds or eligibility flags/);
    const sealed = await sealSeedReleaseSet(sealOptions, {
      randomBytes: deterministicFixtureEntropy(),
    });
    assert.equal(sealed.state, "commitments-sealed");
    assert.equal(sealed.claim_eligible, false);
    assert.equal(sealed.reveal_paths, null);
    assert.deepEqual(await readdir(value.capsuleParent), []);
    const sealedFiles = await filesBelow(value.bindingDirectory);
    assert.equal(sealedFiles.some((file) => file.endsWith(".reveal.json")), false);
    for (const partition of ["confirmation", "held-out"]) {
      const commitment = JSON.parse(await readFile(
        path.join(value.bindingDirectory, `${partition}.commit.json`),
        "utf8",
      ));
      const escrow = JSON.parse(await readFile(
        path.join(value.escrowDirectory, `${partition}.seed-escrow.json`),
        "utf8",
      ));
      assert.equal(Object.hasOwn(commitment, "seeds"), false);
      assert.equal(Object.hasOwn(escrow, "seeds"), false);
      assertSeedArtifactSchema(validateSeedArtifact, commitment, `${partition} sealed commitment`);
    }
    assertSeedArtifactSchema(
      validateSeedArtifact,
      JSON.parse(await readFile(path.join(value.bindingDirectory, "seed-release-plan.json"), "utf8")),
      "sealed release plan",
    );
    assert.equal(JSON.stringify(sealed).includes("encryptionKey"), false);
    assert.equal(JSON.stringify(sealed).includes(value.encryptionKey.toString("hex")), false);
    assert.deepEqual(await validateSeedReleaseOperatorArtifacts({
      bindingDirectory: value.bindingDirectory,
    }), {
      valid: true,
      state: "commitments-sealed",
      claim_eligible: false,
      release_set_id: sealed.release_set_id,
      plan_sha256: sealed.plan_sha256,
      attestation_sha256: null,
    });
    await assert.rejects(validateSeedReleaseOperatorArtifacts({
      bindingDirectory: value.bindingDirectory,
      requireClaimEligible: true,
    }), /permanently claim-ineligible/);
    await assert.rejects(revealSeedReleaseSet({
      repositoryRoot: value.repository,
      bindingDirectory: value.bindingDirectory,
      escrowDirectory: value.escrowDirectory,
      capsuleParent: value.capsuleParent,
      encryptionKey: value.encryptionKey,
      claimEligible: true,
    }), /never accepts caller eligibility flags/);

    await writeFile(path.join(value.repository, "seed-release-metadata.txt"), "metadata-only commit\n");
    await operatorGit(value.repository, "add", "--", "seed-release-metadata.txt");
    await operatorGit(value.repository, "commit", "-m", "publish metadata only");
    await assert.rejects(revealSeedReleaseSet({
      repositoryRoot: value.repository,
      bindingDirectory: value.bindingDirectory,
      escrowDirectory: value.escrowDirectory,
      capsuleParent: value.capsuleParent,
      encryptionKey: Buffer.alloc(32, 0x33),
    }), /authentication or decryption failed/);
    assert.equal(await readdir(value.bindingDirectory).then((rows) => rows.includes("revealed")), false);

    const policyPath = path.join(value.candidateRoot, "policies.mjs");
    const originalPolicy = await readFile(policyPath);
    await writeFile(policyPath, Buffer.concat([originalPolicy, Buffer.from("\n// hostile source mutation\n")]));
    await operatorGit(value.repository, "add", "--", path.relative(value.repository, policyPath));
    await operatorGit(value.repository, "commit", "-m", "mutate frozen source");
    await assert.rejects(revealSeedReleaseSet({
      repositoryRoot: value.repository,
      bindingDirectory: value.bindingDirectory,
      escrowDirectory: value.escrowDirectory,
      capsuleParent: value.capsuleParent,
      encryptionKey: value.encryptionKey,
    }), /source, execution capsule, or runtime differs/);
    await writeFile(policyPath, originalPolicy);
    await operatorGit(value.repository, "add", "--", path.relative(value.repository, policyPath));
    await operatorGit(value.repository, "commit", "-m", "restore exact frozen source");

    const revealed = await revealSeedReleaseSet({
      repositoryRoot: value.repository,
      bindingDirectory: value.bindingDirectory,
      escrowDirectory: value.escrowDirectory,
      capsuleParent: value.capsuleParent,
      encryptionKey: value.encryptionKey,
    });
    assert.equal(revealed.state, "explicitly-revealed");
    assert.equal(revealed.claim_eligible, false);
    assert.equal(revealed.release_v3_arguments, null);
    assert.deepEqual(await readdir(value.capsuleParent), []);
    const confirmationReveal = JSON.parse(await readFile(
      path.join(revealed.reveal_directory, "confirmation.reveal.json"),
      "utf8",
    ));
    const heldOutReveal = JSON.parse(await readFile(
      path.join(revealed.reveal_directory, "held-out.reveal.json"),
      "utf8",
    ));
    assert.equal(seedListCommitment(confirmationReveal.seeds), confirmationReveal.commitment);
    assert.equal(seedListCommitment(heldOutReveal.seeds), heldOutReveal.commitment);
    assert.equal(confirmationReveal.seeds.some((seed) => heldOutReveal.seeds.includes(seed)), false);
    assertSeedArtifactSchema(validateSeedArtifact, confirmationReveal, "confirmation reveal");
    assertSeedArtifactSchema(validateSeedArtifact, heldOutReveal, "held-out reveal");
    const revealAttestationPath = path.join(revealed.reveal_directory, "seed-reveal-attestation.json");
    const revealAttestationBody = await readFile(revealAttestationPath);
    assertSeedArtifactSchema(
      validateSeedArtifact,
      JSON.parse(revealAttestationBody),
      "seed reveal attestation",
    );
    const validated = await validateSeedReleaseOperatorArtifacts({
      bindingDirectory: value.bindingDirectory,
    });
    assert.equal(validated.state, "explicitly-revealed");
    assert.equal(validated.claim_eligible, false);

    const confirmationRevealPath = path.join(revealed.reveal_directory, "confirmation.reveal.json");
    const confirmationRevealBody = await readFile(confirmationRevealPath);
    const mutatedReveal = JSON.parse(confirmationRevealBody);
    mutatedReveal.seeds[0] += 1;
    await writeJson(confirmationRevealPath, mutatedReveal);
    await assert.rejects(validateSeedReleaseOperatorArtifacts({
      bindingDirectory: value.bindingDirectory,
    }), /does not satisfy its sealed commitment/);
    await writeFile(confirmationRevealPath, confirmationRevealBody);

    const mutatedAttestation = JSON.parse(revealAttestationBody);
    mutatedAttestation.unregistered_authority = true;
    delete mutatedAttestation.attestation_sha256;
    mutatedAttestation.attestation_sha256 = sha256(canonical(mutatedAttestation));
    await writeJson(revealAttestationPath, mutatedAttestation);
    await assert.rejects(validateSeedReleaseOperatorArtifacts({
      bindingDirectory: value.bindingDirectory,
    }), /Invalid or relabelled seed reveal attestation/);
    await writeFile(revealAttestationPath, revealAttestationBody);

    const planPath = path.join(value.bindingDirectory, "seed-release-plan.json");
    const plan = JSON.parse(await readFile(planPath, "utf8"));
    plan.claim_eligible = true;
    delete plan.plan_sha256;
    plan.plan_sha256 = sha256(canonical(plan));
    await writeJson(planPath, plan);
    await assert.rejects(validateSeedReleaseOperatorArtifacts({
      bindingDirectory: value.bindingDirectory,
    }), /Invalid or corrupted/);
  } finally {
    await rm(value.container, { recursive: true, force: true });
  }
});

test("filesBelow enforces maximumEntries limit", async () => {
  const container = await mkdtemp(path.join(os.tmpdir(), "20w-filesbelow-"));
  try {
    for (let i = 0; i < 5; i++) {
      await writeFile(path.join(container, `file-${i}.txt`), "ok\n");
    }
    const found = await filesBelow(container, 10);
    assert.equal(found.length, 5);
    await assert.rejects(
      filesBelow(container, 2),
      (error) => error instanceof RangeError && /filesBelow exceeded maximum entries limit of 2/.test(error.message),
    );
  } finally {
    await rm(container, { recursive: true, force: true });
  }
});

test("observeFilesystemSnapshot enforces scalar maximumEntries bound", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "20w-c010-snapshot-bound-"));
  try {
    await writeFile(path.join(temporary, "a.txt"), "hello", "utf8");
    await writeFile(path.join(temporary, "b.txt"), "world", "utf8");

    const snapshot = await observeFilesystemSnapshot(temporary, 10);
    assert.equal(snapshot.files, 2);

    const atLimit = await observeFilesystemSnapshot(temporary, 2);
    assert.equal(atLimit.files, 2);

    await assert.rejects(
      observeFilesystemSnapshot(temporary, 1),
      (error) => error instanceof RangeError && /exceeded maximum entries limit/.test(error.message),
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("acquireRunLock propagates AggregateError if cleanup handle.close fails", async (t) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "20w-c010-lock-close-err-"));
  const outputDirectory = path.join(temporary, "out");
  const origOpen = fs.open.bind(fs);

  t.mock.method(fs, "open", async (...args) => {
    const handle = await origOpen(...args);
    handle.writeFile = async () => {
      throw new Error("simulated write failure");
    };
    handle.close = async () => {
      throw new Error("simulated close failure");
    };
    return handle;
  });

  try {
    await assert.rejects(
      acquireRunLock({ outputDirectory, runnerId: "test-runner" }),
      (error) => {
        assert.ok(error instanceof AggregateError, "Expected AggregateError when cleanup fails");
        assert.match(error.message, /Failed to acquire run lock/);
        assert.equal(error.errors.length, 2);
        assert.match(error.errors[0].message, /simulated write failure/);
        assert.match(error.errors[1].message, /simulated close failure/);
        return true;
      },
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("run-lock release rejects with cause if handle.close fails on ownership change", async (t) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "20w-c010-lock-own-err-"));
  const outputDirectory = path.join(temporary, "out");
  const lockPath = runLockPath(outputDirectory);
  const origOpen = fs.open.bind(fs);
  let createdHandle = null;

  t.mock.method(fs, "open", async (...args) => {
    const handle = await origOpen(...args);
    createdHandle = handle;
    return handle;
  });

  const lease = await acquireRunLock({ outputDirectory, runnerId: "test-runner" });

  try {
    await writeFile(lockPath, `${JSON.stringify({ schema: 1, lock_id: "other" })}\n`, "utf8");
    createdHandle.close = async () => {
      throw new Error("simulated close failure on ownership mismatch");
    };

    await assert.rejects(
      lease.release(),
      (error) => {
        assert.match(error.message, /refusing to remove a lock not owned/);
        assert.ok(error.cause instanceof Error, "Expected cause to be attached");
        assert.match(error.cause.message, /simulated close failure on ownership mismatch/);
        return true;
      },
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("run-lock release rejects with AggregateError if handle.close fails on unreadable lock", async (t) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "20w-c010-lock-unreadable-err-"));
  const outputDirectory = path.join(temporary, "out");
  const lockPath = runLockPath(outputDirectory);
  const origOpen = fs.open.bind(fs);
  let createdHandle = null;

  t.mock.method(fs, "open", async (...args) => {
    const handle = await origOpen(...args);
    createdHandle = handle;
    return handle;
  });

  const lease = await acquireRunLock({ outputDirectory, runnerId: "test-runner" });

  try {
    await writeFile(lockPath, "{ corrupt json", "utf8");
    createdHandle.close = async () => {
      throw new Error("simulated close failure on unreadable");
    };

    await assert.rejects(
      lease.release(),
      (error) => {
        assert.ok(error instanceof AggregateError, "Expected AggregateError on unreadable lock with close failure");
        assert.match(error.message, /Run lock disappeared or became unreadable/);
        assert.equal(error.errors.length, 2);
        assert.match(error.errors[1].message, /simulated close failure on unreadable/);
        return true;
      },
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});


