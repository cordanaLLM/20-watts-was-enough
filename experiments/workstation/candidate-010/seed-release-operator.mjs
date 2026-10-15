import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes as systemRandomBytes,
  randomUUID,
} from "node:crypto";
import { execFile as executeFileCallback } from "node:child_process";
import {
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { BACKEND_METADATA } from "./backend-registry.mjs";
import {
  CONFIRMATORY_PREREGISTRATION,
  createConfirmatoryPreregistration,
} from "./confirmatory-analysis.mjs";
import { buildExecutionCapsule, destroyExecutionCapsule } from "./execution-capsule.mjs";
import { buildFactorialDesign } from "./factorial-design.mjs";
import { captureRuntimeIdentity } from "./runtime-identity.mjs";
import {
  assertDisjointSeedPacks,
  seedListCommitment,
  validateSeedList,
} from "./seeds/seed-pack.mjs";
import { captureCandidate010SourceBundle } from "./source-bundle.mjs";

const executeFile = promisify(executeFileCallback);

export const SEED_RELEASE_OPERATOR_VERSION = "candidate-010.seed-release-operator.v1";
export const SEED_RELEASE_PLAN_VERSION = "candidate-010.seed-release-plan.v1";
export const SEED_ESCROW_VERSION = "candidate-010.encrypted-seed-escrow.v1";
export const SEED_REVEAL_ATTESTATION_VERSION = "candidate-010.seed-reveal-attestation.v1";

const candidateDirectory = "experiments/workstation/candidate-010";
const partitionNames = Object.freeze(["confirmation", "held-out"]);
const snapshotNames = Object.freeze({
  source_bundle: "source-bundle.json",
  execution_descriptor: "execution-descriptor.json",
  runtime_identity: "runtime-identity.json",
  config: "config.json",
  design: "design.json",
  backend_registry: "backend-registry.json",
  preregistration: "preregistration.json",
});

function canonical(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Seed-release canonicalization rejects non-finite numbers.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => {
      if (value[key] === undefined) throw new TypeError(`Seed-release canonicalization rejects undefined at ${key}.`);
      return `${JSON.stringify(key)}:${canonical(value[key])}`;
    }).join(",")}}`;
  }
  throw new TypeError(`Seed-release canonicalization rejects ${typeof value}.`);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function digestDocument(document, digestKey) {
  const { [digestKey]: ignored, ...body } = document;
  void ignored;
  return sha256(canonical(body));
}

function exactKeys(value, keys) {
  return value
    && typeof value === "object"
    && !Array.isArray(value)
    && canonical(Object.keys(value).sort()) === canonical([...keys].sort());
}

function exactOptions(value, required, optional = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return required.every((key) => Object.hasOwn(value, key))
    && keys.every((key) => required.includes(key) || optional.includes(key));
}

function inside(root, target) {
  const relation = path.relative(root, target);
  return relation === "" || (!relation.startsWith("..") && !path.isAbsolute(relation));
}

function samePath(left, right) {
  return path.relative(left, right) === "" && path.relative(right, left) === "";
}

async function strictDirectory(value, label) {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty path.`);
  const absolute = path.resolve(value);
  const information = await lstat(absolute);
  if (information.isSymbolicLink() || !information.isDirectory()) {
    throw new Error(`${label} must be a real directory, not a symbolic link or reparse point.`);
  }
  const resolved = await realpath(absolute);
  if (!samePath(absolute, resolved)) throw new Error(`${label} refuses linked path traversal.`);
  return resolved;
}

async function absentTarget(value, label) {
  const absolute = path.resolve(value);
  const parent = await strictDirectory(path.dirname(absolute), `${label} parent`);
  if (!samePath(parent, path.dirname(absolute))) throw new Error(`${label} parent is not an exact real path.`);
  try {
    await lstat(absolute);
    throw new Error(`${label} already exists; seed-release artifacts are never overwritten.`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return { absolute, parent };
}

async function containedFile(repositoryRoot, value, label) {
  const absolute = path.resolve(value);
  if (!inside(repositoryRoot, absolute) || samePath(repositoryRoot, absolute)) {
    throw new Error(`${label} must be a file contained by the frozen repository.`);
  }
  let current = repositoryRoot;
  for (const component of path.relative(repositoryRoot, absolute).split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    const information = await lstat(current);
    if (information.isSymbolicLink()) throw new Error(`${label} traverses a symbolic link or reparse point.`);
  }
  const [information, resolved] = await Promise.all([lstat(absolute), realpath(absolute)]);
  if (!information.isFile() || !inside(repositoryRoot, resolved)) throw new Error(`${label} is not a contained regular file.`);
  return resolved;
}

async function git(repositoryRoot, args) {
  try {
    const result = await executeFile("git", ["-C", repositoryRoot, ...args], {
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
    });
    return result.stdout;
  } catch (error) {
    throw new Error(`Seed-release Git ${args[0]} failed: ${error.stderr?.trim() || error.message}`, { cause: error });
  }
}

async function assertCleanRepository(repositoryRoot) {
  const status = await git(repositoryRoot, ["status", "--porcelain=v1", "--untracked-files=all"]);
  if (status !== "") throw new Error("Seed release requires a completely clean implementation freeze.");
  const head = (await git(repositoryRoot, ["rev-parse", "--verify", "HEAD^{commit}"])).trim();
  if (!/^[0-9a-f]{40,64}$/.test(head)) throw new Error("Seed release requires one exact Git commit.");
  return head;
}

async function trackedInput(repositoryRoot, value, label) {
  const file = await containedFile(repositoryRoot, value, label);
  const relative = path.relative(repositoryRoot, file).replaceAll("\\", "/");
  await git(repositoryRoot, ["ls-files", "--error-unmatch", "--", relative]);
  return { file, relative, body: await readFile(file) };
}

function parseJson(buffer, label) {
  try {
    return JSON.parse(buffer.toString("utf8"));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`, { cause: error });
  }
}

function assertFrozenInputs({ config, design, backendRegistry, preregistration }) {
  if (config?.schema !== 1 || config.artifact !== "candidate-010" || config.profile !== "confirmation") {
    throw new Error("Seed release requires a Candidate 010 confirmation config, not a development or fixture profile.");
  }
  const expectedDesign = { scenarios: buildFactorialDesign({ splits: ["confirmation"] }) };
  if (canonical(design) !== canonical(expectedDesign)) {
    throw new Error("Seed release design must exactly equal the registered confirmation factorial design.");
  }
  if (canonical(backendRegistry) !== canonical({ backends: BACKEND_METADATA })) {
    throw new Error("Seed release backend registry must exactly equal the executable backend metadata.");
  }
  const margins = {
    irreversible_violation_margin: preregistration?.endpoints?.irreversible_violations?.margin,
    false_commit_margin: preregistration?.endpoints?.false_commits?.margin,
  };
  let expectedPreregistration;
  try {
    expectedPreregistration = createConfirmatoryPreregistration(margins);
  } catch {
    throw new Error("Seed release requires a fully frozen Candidate 010 confirmatory preregistration.");
  }
  if (
    preregistration?.id !== `${CONFIRMATORY_PREREGISTRATION.id}-frozen`
    || canonical(preregistration) !== canonical(expectedPreregistration)
  ) throw new Error("Seed release preregistration differs from the registered frozen confirmatory plan.");
}

function encryptionKey(value) {
  if (!(value instanceof Uint8Array) || value.byteLength !== 32) {
    throw new Error("Seed escrow encryptionKey must be exactly 32 bytes and is never persisted by the operator.");
  }
  return Buffer.from(value);
}

function randomBuffer(randomBytes, size) {
  const value = randomBytes(size);
  if (!(value instanceof Uint8Array) || value.byteLength !== size) {
    throw new Error("Seed entropy provider returned an invalid byte count.");
  }
  return Buffer.from(value);
}

function drawDisjointSeeds(counts, randomBytes) {
  for (const count of counts) {
    if (!Number.isSafeInteger(count) || count < 1 || count > 1_000_000) {
      throw new Error("Each seed partition count must be an integer from 1 through 1,000,000.");
    }
  }
  const required = counts.reduce((sum, count) => sum + count, 0);
  const unique = new Set();
  const values = [];
  const maximumDraws = required * 64 + 1024;
  for (let draw = 0; values.length < required && draw < maximumDraws; draw += 1) {
    const seed = randomBuffer(randomBytes, 4).readUInt32LE(0);
    if (!unique.has(seed)) {
      unique.add(seed);
      values.push(seed);
    }
  }
  if (values.length !== required) throw new Error("Seed entropy provider could not produce the required unique seed set.");
  return [values.slice(0, counts[0]), values.slice(counts[0])];
}

async function writeSynced(file, body) {
  const handle = await open(file, "wx", 0o600);
  try {
    await handle.writeFile(body);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function writeJson(file, document) {
  await writeSynced(file, `${JSON.stringify(document, null, 2)}\n`);
}

function commitmentDocument({ partition, seeds, releaseSetId, freezeIdentitySha256, claimEligible, generationMethod }) {
  return Object.freeze({
    schema: 1,
    partition,
    state: "sealed",
    algorithm: "sha256-json-array-v1",
    seed_count: seeds.length,
    commitment: seedListCommitment(seeds),
    operator_contract_version: SEED_RELEASE_OPERATOR_VERSION,
    release_set_id: releaseSetId,
    freeze_identity_sha256: freezeIdentitySha256,
    claim_eligible: claimEligible,
    generation_method: generationMethod,
  });
}

function escrowDocument({ partition, seeds, commitment, releaseSetId, freezeIdentitySha256, claimEligible, key, randomBytes }) {
  const aad = {
    contract_version: SEED_ESCROW_VERSION,
    release_set_id: releaseSetId,
    partition,
    freeze_identity_sha256: freezeIdentitySha256,
    commitment,
    claim_eligible: claimEligible,
  };
  const plaintext = Buffer.from(canonical({
    schema: 1,
    release_set_id: releaseSetId,
    partition,
    freeze_identity_sha256: freezeIdentitySha256,
    commitment,
    claim_eligible: claimEligible,
    seeds,
  }));
  const iv = randomBuffer(randomBytes, 12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(canonical(aad)));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  plaintext.fill(0);
  return Object.freeze({
    schema: 1,
    contract_version: SEED_ESCROW_VERSION,
    state: "encrypted-seed-escrow",
    ...aad,
    encryption: "aes-256-gcm",
    iv_base64: iv.toString("base64"),
    auth_tag_base64: cipher.getAuthTag().toString("base64"),
    ciphertext_base64: ciphertext.toString("base64"),
    plaintext_bytes: plaintext.byteLength,
    escrow_sha256: sha256(ciphertext),
  });
}

function validatePlan(plan) {
  const exactDigestRecord = (value, keys) => exactKeys(value, keys)
    && keys.every((key) => /^[0-9a-f]{64}$/.test(value[key] ?? ""));
  const validBindings = exactKeys(plan?.bindings, Object.keys(snapshotNames))
    && Object.entries(snapshotNames).every(([name, expectedPath]) => (
      exactKeys(plan.bindings[name], ["path", "sha256"])
      && plan.bindings[name].path === expectedPath
      && /^[0-9a-f]{64}$/.test(plan.bindings[name].sha256 ?? "")
    ));
  const validPartitions = exactKeys(plan?.partitions, partitionNames)
    && partitionNames.every((partition) => (
      exactKeys(plan.partitions[partition], ["commitment_path", "seed_count", "commitment", "escrow_sha256"])
      && plan.partitions[partition].commitment_path === `${partition}.commit.json`
      && Number.isSafeInteger(plan.partitions[partition].seed_count)
      && plan.partitions[partition].seed_count > 0
      && /^[0-9a-f]{64}$/.test(plan.partitions[partition].commitment ?? "")
      && /^[0-9a-f]{64}$/.test(plan.partitions[partition].escrow_sha256 ?? "")
    ));
  const validCrossPartition = exactKeys(
    plan?.cross_partition,
    ["freeze_identity_sha256", "uniqueness_rule", "total_seed_count"],
  )
    && /^[0-9a-f]{64}$/.test(plan.cross_partition.freeze_identity_sha256 ?? "")
    && plan.cross_partition.uniqueness_rule
      === "one jointly generated unsigned-32-bit set split once; duplicates refused"
    && Number.isSafeInteger(plan.cross_partition.total_seed_count)
    && plan.cross_partition.total_seed_count
      === partitionNames.reduce((sum, partition) => sum + (plan.partitions?.[partition]?.seed_count ?? 0), 0);
  const reconstructedFreezeIdentity = {
    source_sha256: plan?.source_identity?.source_sha256,
    source_commit: plan?.source_identity?.source_commit,
    execution_descriptor_sha256: plan?.execution_identity?.descriptor_sha256,
    source_inventory_sha256: plan?.execution_identity?.source_inventory_sha256,
    dependency_inventory_sha256: plan?.execution_identity?.dependency_inventory_sha256,
    runtime_identity_sha256: plan?.runtime_identity?.identity_sha256,
    runtime_executable_sha256: plan?.runtime_identity?.executable_sha256,
    package_lock_sha256: plan?.runtime_identity?.package_lock_sha256,
    bindings: plan?.bindings,
    release_version: plan?.release_version,
    confirmation_seed_count: plan?.partitions?.confirmation?.seed_count,
    held_out_seed_count: plan?.partitions?.["held-out"]?.seed_count,
  };
  if (
    !exactKeys(plan, [
      "schema", "contract_version", "state", "artifact", "release_set_id", "release_version",
      "claim_eligible", "generation_method", "source_identity", "execution_identity", "runtime_identity",
      "bindings", "partitions", "cross_partition", "plan_sha256",
    ])
    || plan.schema !== 1
    || plan.contract_version !== SEED_RELEASE_PLAN_VERSION
    || plan.state !== "commitments-sealed"
    || plan.artifact !== "candidate-010"
    || !/^[0-9a-f]{64}$/.test(plan.release_set_id ?? "")
    || !Number.isSafeInteger(plan.release_version)
    || plan.release_version < 1
    || typeof plan.claim_eligible !== "boolean"
    || !["system-cryptographic-entropy-v1", "injected-fixture-entropy-v1"].includes(plan.generation_method)
    || plan.claim_eligible !== (plan.generation_method === "system-cryptographic-entropy-v1")
    || !exactKeys(plan.source_identity, ["source_sha256", "source_commit"])
    || !/^[0-9a-f]{64}$/.test(plan.source_identity.source_sha256 ?? "")
    || !/^[0-9a-f]{40,64}$/.test(plan.source_identity.source_commit ?? "")
    || !exactDigestRecord(plan.execution_identity, [
      "descriptor_sha256", "source_inventory_sha256", "dependency_inventory_sha256",
    ])
    || !exactDigestRecord(plan.runtime_identity, [
      "identity_sha256", "executable_sha256", "package_lock_sha256",
    ])
    || !validBindings
    || !validPartitions
    || !validCrossPartition
    || plan.cross_partition.freeze_identity_sha256 !== sha256(canonical(reconstructedFreezeIdentity))
    || plan.plan_sha256 !== digestDocument(plan, "plan_sha256")
  ) throw new Error("Invalid or corrupted Candidate 010 seed-release plan.");
  return plan;
}

function validateCommitment(document, plan, partition) {
  if (
    !exactKeys(document, [
      "schema", "partition", "state", "algorithm", "seed_count", "commitment",
      "operator_contract_version", "release_set_id", "freeze_identity_sha256",
      "claim_eligible", "generation_method",
    ])
    || document.schema !== 1
    || document.partition !== partition
    || document.state !== "sealed"
    || document.algorithm !== "sha256-json-array-v1"
    || !Number.isSafeInteger(document.seed_count)
    || document.seed_count < 1
    || !/^[0-9a-f]{64}$/.test(document.commitment ?? "")
    || document.operator_contract_version !== SEED_RELEASE_OPERATOR_VERSION
    || document.release_set_id !== plan.release_set_id
    || document.freeze_identity_sha256 !== plan.cross_partition.freeze_identity_sha256
    || document.claim_eligible !== plan.claim_eligible
    || document.generation_method !== plan.generation_method
    || canonical(plan.partitions[partition]) !== canonical({
      commitment_path: `${partition}.commit.json`,
      seed_count: document.seed_count,
      commitment: document.commitment,
      escrow_sha256: plan.partitions[partition].escrow_sha256,
    })
  ) throw new Error(`Invalid or relabelled ${partition} operator commitment.`);
  return document;
}

function validateReveal(document, plan, commitment, partition) {
  if (
    !exactKeys(document, [
      "schema", "partition", "state", "algorithm", "commitment", "seeds",
      "operator_contract_version", "release_set_id", "plan_sha256", "claim_eligible",
    ])
    || document.schema !== 1
    || document.partition !== partition
    || document.state !== "frozen-reveal"
    || document.algorithm !== "sha256-json-array-v1"
    || document.operator_contract_version !== SEED_RELEASE_OPERATOR_VERSION
    || document.release_set_id !== plan.release_set_id
    || document.plan_sha256 !== plan.plan_sha256
    || document.claim_eligible !== plan.claim_eligible
    || document.commitment !== commitment.commitment
  ) throw new Error(`Invalid or relabelled ${partition} operator reveal.`);
  const seeds = validateSeedList(document.seeds, `${partition} operator reveal`);
  if (
    seeds.length !== commitment.seed_count
    || seedListCommitment(seeds) !== commitment.commitment
  ) throw new Error(`${partition} operator reveal does not satisfy its sealed commitment.`);
  return Object.freeze({ ...document, seeds: Object.freeze(seeds) });
}

function validateRevealAttestation(document, plan, commitments, reveals) {
  if (
    !exactKeys(document, [
      "schema", "contract_version", "state", "artifact", "release_set_id", "plan_sha256",
      "claim_eligible", "partitions", "disjointness", "attestation_sha256",
    ])
    || document.schema !== 1
    || document.contract_version !== SEED_REVEAL_ATTESTATION_VERSION
    || document.state !== "explicitly-revealed"
    || document.artifact !== "candidate-010"
    || document.release_set_id !== plan.release_set_id
    || document.plan_sha256 !== plan.plan_sha256
    || document.claim_eligible !== plan.claim_eligible
    || !exactKeys(document.partitions, partitionNames)
    || document.disjointness !== "verified"
    || document.attestation_sha256 !== digestDocument(document, "attestation_sha256")
  ) throw new Error("Invalid or relabelled seed reveal attestation.");
  for (const partition of partitionNames) {
    const row = document.partitions[partition];
    if (
      !exactKeys(row, ["commitment", "seed_count", "reveal_sha256"])
      || row.commitment !== commitments[partition].commitment
      || row.seed_count !== commitments[partition].seed_count
      || row.reveal_sha256 !== sha256(canonical(reveals[partition]))
    ) throw new Error(`Seed reveal attestation does not bind the exact ${partition} reveal.`);
  }
  assertDisjointSeedPacks(partitionNames.map((partition) => reveals[partition]));
  return document;
}

function validateEscrow(document, plan, commitment, partition) {
  if (
    !exactKeys(document, [
      "schema", "contract_version", "state", "release_set_id", "partition",
      "freeze_identity_sha256", "commitment", "claim_eligible", "encryption",
      "iv_base64", "auth_tag_base64", "ciphertext_base64", "plaintext_bytes", "escrow_sha256",
    ])
    || document.schema !== 1
    || document.contract_version !== SEED_ESCROW_VERSION
    || document.state !== "encrypted-seed-escrow"
    || document.release_set_id !== plan.release_set_id
    || document.partition !== partition
    || document.freeze_identity_sha256 !== plan.cross_partition.freeze_identity_sha256
    || document.commitment !== commitment.commitment
    || document.claim_eligible !== plan.claim_eligible
    || document.encryption !== "aes-256-gcm"
    || !Number.isSafeInteger(document.plaintext_bytes)
    || document.plaintext_bytes < 1
  ) throw new Error(`Invalid or relabelled ${partition} seed escrow.`);
  const ciphertext = Buffer.from(document.ciphertext_base64, "base64");
  if (sha256(ciphertext) !== document.escrow_sha256 || document.escrow_sha256 !== plan.partitions[partition].escrow_sha256) {
    throw new Error(`${partition} seed escrow ciphertext hash mismatch.`);
  }
  return { escrow: document, ciphertext };
}

function decryptEscrow({ escrow, ciphertext, key }) {
  const aad = {
    contract_version: SEED_ESCROW_VERSION,
    release_set_id: escrow.release_set_id,
    partition: escrow.partition,
    freeze_identity_sha256: escrow.freeze_identity_sha256,
    commitment: escrow.commitment,
    claim_eligible: escrow.claim_eligible,
  };
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(escrow.iv_base64, "base64"),
    );
    decipher.setAAD(Buffer.from(canonical(aad)));
    decipher.setAuthTag(Buffer.from(escrow.auth_tag_base64, "base64"));
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    if (plaintext.byteLength !== escrow.plaintext_bytes) throw new Error("plaintext length mismatch");
    return JSON.parse(plaintext.toString("utf8"));
  } catch (error) {
    throw new Error(`Seed escrow authentication or decryption failed: ${error.message}`, { cause: error });
  }
}

async function loadPlanAndBindings(bindingDirectory) {
  const root = await strictDirectory(bindingDirectory, "seed bindingDirectory");
  const planPath = await containedFile(
    root,
    path.join(root, "seed-release-plan.json"),
    "seed-release plan",
  );
  const plan = validatePlan(parseJson(await readFile(planPath), "seed-release plan"));
  const bodies = {};
  for (const [name, relative] of Object.entries(snapshotNames)) {
    const snapshotPath = await containedFile(root, path.join(root, relative), `seed-release ${name}`);
    const body = await readFile(snapshotPath);
    if (sha256(body) !== plan.bindings[name]?.sha256 || plan.bindings[name]?.path !== relative) {
      throw new Error(`Seed-release plan binding mismatch for ${name}.`);
    }
    bodies[name] = body;
  }
  const sourceBundle = parseJson(bodies.source_bundle, "bound source bundle");
  const descriptor = parseJson(bodies.execution_descriptor, "bound execution descriptor");
  const runtimeIdentity = parseJson(bodies.runtime_identity, "bound runtime identity");
  if (
    sourceBundle?.source_sha256 !== plan.source_identity.source_sha256
    || sourceBundle?.vcs?.source_commit !== plan.source_identity.source_commit
    || descriptor?.descriptor_sha256 !== plan.execution_identity.descriptor_sha256
    || descriptor?.source?.inventory_sha256 !== plan.execution_identity.source_inventory_sha256
    || descriptor?.dependencies?.inventory?.inventory_sha256
      !== plan.execution_identity.dependency_inventory_sha256
    || runtimeIdentity?.identity_sha256 !== plan.runtime_identity.identity_sha256
    || runtimeIdentity?.runtime?.executable_sha256 !== plan.runtime_identity.executable_sha256
    || runtimeIdentity?.package_lock?.sha256 !== plan.runtime_identity.package_lock_sha256
    || canonical(descriptor.runtime_identity) !== canonical(runtimeIdentity)
  ) throw new Error("Seed-release source, execution, or runtime snapshot differs from its plan identity.");
  assertFrozenInputs({
    config: parseJson(bodies.config, "bound confirmation config"),
    design: parseJson(bodies.design, "bound confirmation design"),
    backendRegistry: parseJson(bodies.backend_registry, "bound backend registry"),
    preregistration: parseJson(bodies.preregistration, "bound confirmatory preregistration"),
  });
  const commitments = {};
  for (const partition of partitionNames) {
    const commitmentPath = await containedFile(
      root,
      path.join(root, `${partition}.commit.json`),
      `${partition} seed commitment`,
    );
    const body = await readFile(commitmentPath);
    commitments[partition] = validateCommitment(parseJson(body, `${partition} commitment`), plan, partition);
  }
  return { root, plan, bodies, commitments };
}

export async function sealSeedReleaseSet(options, dependencies = {}) {
  const requiredOptions = [
    "repositoryRoot", "bindingDirectory", "escrowDirectory", "capsuleParent",
    "configPath", "designPath", "backendRegistryPath", "preregistrationPath",
    "confirmationSeedCount", "heldOutSeedCount", "encryptionKey",
  ];
  if (!exactOptions(options, requiredOptions, ["releaseVersion"])) {
    throw new Error("Seed sealing requires exact operator inputs and never accepts caller-provided seeds or eligibility flags.");
  }
  const {
    repositoryRoot,
    bindingDirectory,
    escrowDirectory,
    capsuleParent,
    configPath,
    designPath,
    backendRegistryPath,
    preregistrationPath,
    confirmationSeedCount,
    heldOutSeedCount,
    releaseVersion = 1,
    encryptionKey: rawEncryptionKey,
  } = options;
  if (!exactKeys(dependencies, Object.keys(dependencies).length === 0 ? [] : ["randomBytes"])) {
    throw new Error("Seed-release dependencies accept only a test entropy provider.");
  }
  const randomBytes = dependencies.randomBytes ?? systemRandomBytes;
  if (typeof randomBytes !== "function") throw new Error("Seed entropy provider must be a function.");
  const claimEligible = dependencies.randomBytes === undefined;
  const generationMethod = claimEligible
    ? "system-cryptographic-entropy-v1"
    : "injected-fixture-entropy-v1";
  const key = encryptionKey(rawEncryptionKey);
  if (!Number.isSafeInteger(releaseVersion) || releaseVersion < 1) {
    throw new Error("Seed releaseVersion must be a positive integer.");
  }
  const repository = await strictDirectory(repositoryRoot, "seed repositoryRoot");
  const headCommit = await assertCleanRepository(repository);
  const bindingTarget = await absentTarget(bindingDirectory, "seed bindingDirectory");
  const escrowTarget = await absentTarget(escrowDirectory, "seed escrowDirectory");
  if (inside(repository, escrowTarget.absolute) || samePath(repository, escrowTarget.absolute)) {
    throw new Error("Encrypted seed escrow must be outside the Git repository.");
  }
  if (samePath(bindingTarget.absolute, escrowTarget.absolute)) {
    throw new Error("Seed binding and encrypted escrow directories must be distinct.");
  }
  const capsuleRoot = await strictDirectory(capsuleParent, "seed capsuleParent");
  const inputEntries = {
    config: await trackedInput(repository, configPath, "confirmation config"),
    design: await trackedInput(repository, designPath, "confirmation design"),
    backend_registry: await trackedInput(repository, backendRegistryPath, "backend registry"),
    preregistration: await trackedInput(repository, preregistrationPath, "confirmatory preregistration"),
  };
  assertFrozenInputs({
    config: parseJson(inputEntries.config.body, "confirmation config"),
    design: parseJson(inputEntries.design.body, "confirmation design"),
    backendRegistry: parseJson(inputEntries.backend_registry.body, "backend registry"),
    preregistration: parseJson(inputEntries.preregistration.body, "confirmatory preregistration"),
  });

  const sourceBundle = await captureCandidate010SourceBundle(repository);
  if (sourceBundle.vcs.source_commit !== headCommit) {
    throw new Error("Captured source bundle does not match the clean implementation freeze commit.");
  }
  const runtimeIdentity = await captureRuntimeIdentity({
    repositoryRoot: repository,
    candidateRoot: path.join(repository, ...candidateDirectory.split("/")),
  });
  let executionCapsule;
  let descriptor;
  try {
    executionCapsule = await buildExecutionCapsule({
      repositoryRoot: repository,
      executionParent: capsuleRoot,
      runtimeIdentity,
      candidateDirectory,
    });
    descriptor = executionCapsule.descriptor;
  } finally {
    if (executionCapsule) await destroyExecutionCapsule(executionCapsule);
  }
  const generatedBodies = {
    source_bundle: Buffer.from(`${JSON.stringify(sourceBundle, null, 2)}\n`),
    execution_descriptor: Buffer.from(`${JSON.stringify(descriptor, null, 2)}\n`),
    runtime_identity: Buffer.from(`${JSON.stringify(runtimeIdentity, null, 2)}\n`),
    config: inputEntries.config.body,
    design: inputEntries.design.body,
    backend_registry: inputEntries.backend_registry.body,
    preregistration: inputEntries.preregistration.body,
  };
  const bindings = Object.fromEntries(Object.entries(snapshotNames).map(([name, relative]) => [name, {
    path: relative,
    sha256: sha256(generatedBodies[name]),
  }]));
  const freezeIdentity = {
    source_sha256: sourceBundle.source_sha256,
    source_commit: sourceBundle.vcs.source_commit,
    execution_descriptor_sha256: descriptor.descriptor_sha256,
    source_inventory_sha256: descriptor.source.inventory_sha256,
    dependency_inventory_sha256: descriptor.dependencies.inventory.inventory_sha256,
    runtime_identity_sha256: runtimeIdentity.identity_sha256,
    runtime_executable_sha256: runtimeIdentity.runtime.executable_sha256,
    package_lock_sha256: runtimeIdentity.package_lock.sha256,
    bindings,
    release_version: releaseVersion,
    confirmation_seed_count: confirmationSeedCount,
    held_out_seed_count: heldOutSeedCount,
  };
  const freezeIdentitySha256 = sha256(canonical(freezeIdentity));
  const releaseSetId = sha256(randomBuffer(randomBytes, 32));
  const [confirmationSeeds, heldOutSeeds] = drawDisjointSeeds(
    [confirmationSeedCount, heldOutSeedCount],
    randomBytes,
  );
  assertDisjointSeedPacks([
    { partition: "confirmation", seeds: confirmationSeeds },
    { partition: "held-out", seeds: heldOutSeeds },
  ]);
  const seedSets = { confirmation: confirmationSeeds, "held-out": heldOutSeeds };
  const commitments = {};
  const escrows = {};
  for (const partition of partitionNames) {
    commitments[partition] = commitmentDocument({
      partition,
      seeds: seedSets[partition],
      releaseSetId,
      freezeIdentitySha256,
      claimEligible,
      generationMethod,
    });
    escrows[partition] = escrowDocument({
      partition,
      seeds: seedSets[partition],
      commitment: commitments[partition].commitment,
      releaseSetId,
      freezeIdentitySha256,
      claimEligible,
      key,
      randomBytes,
    });
  }
  confirmationSeeds.fill(0);
  heldOutSeeds.fill(0);
  const planBody = {
    schema: 1,
    contract_version: SEED_RELEASE_PLAN_VERSION,
    state: "commitments-sealed",
    artifact: "candidate-010",
    release_set_id: releaseSetId,
    release_version: releaseVersion,
    claim_eligible: claimEligible,
    generation_method: generationMethod,
    source_identity: {
      source_sha256: sourceBundle.source_sha256,
      source_commit: sourceBundle.vcs.source_commit,
    },
    execution_identity: {
      descriptor_sha256: descriptor.descriptor_sha256,
      source_inventory_sha256: descriptor.source.inventory_sha256,
      dependency_inventory_sha256: descriptor.dependencies.inventory.inventory_sha256,
    },
    runtime_identity: {
      identity_sha256: runtimeIdentity.identity_sha256,
      executable_sha256: runtimeIdentity.runtime.executable_sha256,
      package_lock_sha256: runtimeIdentity.package_lock.sha256,
    },
    bindings,
    partitions: Object.fromEntries(partitionNames.map((partition) => [partition, {
      commitment_path: `${partition}.commit.json`,
      seed_count: commitments[partition].seed_count,
      commitment: commitments[partition].commitment,
      escrow_sha256: escrows[partition].escrow_sha256,
    }])),
    cross_partition: {
      freeze_identity_sha256: freezeIdentitySha256,
      uniqueness_rule: "one jointly generated unsigned-32-bit set split once; duplicates refused",
      total_seed_count: confirmationSeeds.length + heldOutSeeds.length,
    },
  };
  const plan = Object.freeze({ ...planBody, plan_sha256: sha256(canonical(planBody)) });
  const bindingStaging = path.join(bindingTarget.parent, `.candidate-010-seed-bindings-${randomUUID()}.tmp`);
  const escrowStaging = path.join(escrowTarget.parent, `.candidate-010-seed-escrow-${randomUUID()}.tmp`);
  let escrowPublished = false;
  await mkdir(bindingStaging);
  await mkdir(escrowStaging);
  try {
    for (const [name, relative] of Object.entries(snapshotNames)) {
      await writeSynced(path.join(bindingStaging, relative), generatedBodies[name]);
    }
    for (const partition of partitionNames) {
      await writeJson(path.join(bindingStaging, `${partition}.commit.json`), commitments[partition]);
      await writeJson(path.join(escrowStaging, `${partition}.seed-escrow.json`), escrows[partition]);
    }
    await writeJson(path.join(bindingStaging, "seed-release-plan.json"), plan);
    await rename(escrowStaging, escrowTarget.absolute);
    escrowPublished = true;
    await rename(bindingStaging, bindingTarget.absolute);
  } catch (error) {
    await rm(bindingStaging, { recursive: true, force: true }).catch(() => {});
    await rm(escrowStaging, { recursive: true, force: true }).catch(() => {});
    if (escrowPublished) await rm(escrowTarget.absolute, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
  return Object.freeze({
    contract_version: SEED_RELEASE_OPERATOR_VERSION,
    state: "commitments-sealed",
    claim_eligible: claimEligible,
    release_set_id: releaseSetId,
    plan_sha256: plan.plan_sha256,
    source_commit: sourceBundle.vcs.source_commit,
    binding_directory: bindingTarget.absolute,
    escrow_directory: escrowTarget.absolute,
    commitment_paths: Object.freeze(Object.fromEntries(partitionNames.map((partition) => [
      partition,
      path.join(bindingTarget.absolute, `${partition}.commit.json`),
    ]))),
    reveal_paths: null,
  });
}

export async function revealSeedReleaseSet(options) {
  const requiredOptions = [
    "repositoryRoot", "bindingDirectory", "escrowDirectory", "capsuleParent", "encryptionKey",
  ];
  if (!exactOptions(options, requiredOptions)) {
    throw new Error("Seed reveal requires exact operator inputs and never accepts caller eligibility flags.");
  }
  const {
    repositoryRoot,
    bindingDirectory,
    escrowDirectory,
    capsuleParent,
    encryptionKey: rawEncryptionKey,
  } = options;
  const key = encryptionKey(rawEncryptionKey);
  const repository = await strictDirectory(repositoryRoot, "seed repositoryRoot");
  await assertCleanRepository(repository);
  const binding = await loadPlanAndBindings(bindingDirectory);
  const escrowRoot = await strictDirectory(escrowDirectory, "seed escrowDirectory");
  if (inside(repository, escrowRoot) || samePath(repository, escrowRoot)) {
    throw new Error("Encrypted seed escrow must remain outside the Git repository.");
  }
  const sourceBundle = await captureCandidate010SourceBundle(repository);
  const expectedSourceBundle = parseJson(binding.bodies.source_bundle, "bound source bundle");
  const expectedRuntimeIdentity = parseJson(binding.bodies.runtime_identity, "bound runtime identity");
  const expectedDescriptor = parseJson(binding.bodies.execution_descriptor, "bound execution descriptor");
  const runtimeIdentity = await captureRuntimeIdentity({
    repositoryRoot: repository,
    candidateRoot: path.join(repository, ...candidateDirectory.split("/")),
  });
  const capsuleRoot = await strictDirectory(capsuleParent, "seed capsuleParent");
  let executionCapsule;
  let descriptor;
  try {
    executionCapsule = await buildExecutionCapsule({
      repositoryRoot: repository,
      executionParent: capsuleRoot,
      runtimeIdentity: expectedRuntimeIdentity,
      candidateDirectory,
      sourceCommit: binding.plan.source_identity.source_commit,
    });
    descriptor = executionCapsule.descriptor;
  } finally {
    if (executionCapsule) await destroyExecutionCapsule(executionCapsule);
  }
  if (
    sourceBundle.source_sha256 !== binding.plan.source_identity.source_sha256
    || canonical(sourceBundle.files) !== canonical(expectedSourceBundle.files)
    || canonical(sourceBundle.execution_manifest_projection)
      !== canonical(expectedSourceBundle.execution_manifest_projection)
    || canonical(runtimeIdentity) !== canonical(expectedRuntimeIdentity)
    || canonical(descriptor) !== canonical(expectedDescriptor)
    || descriptor.descriptor_sha256 !== binding.plan.execution_identity.descriptor_sha256
    || descriptor.source.inventory_sha256 !== binding.plan.execution_identity.source_inventory_sha256
    || descriptor.dependencies.inventory.inventory_sha256 !== binding.plan.execution_identity.dependency_inventory_sha256
    || runtimeIdentity.identity_sha256 !== binding.plan.runtime_identity.identity_sha256
    || runtimeIdentity.runtime.executable_sha256 !== binding.plan.runtime_identity.executable_sha256
    || runtimeIdentity.package_lock.sha256 !== binding.plan.runtime_identity.package_lock_sha256
  ) throw new Error("Current source, execution capsule, or runtime differs from the sealed seed-release plan.");

  const revealed = {};
  for (const partition of partitionNames) {
    const escrowBody = parseJson(
      await readFile(await containedFile(
        escrowRoot,
        path.join(escrowRoot, `${partition}.seed-escrow.json`),
        `${partition} encrypted seed escrow`,
      )),
      `${partition} seed escrow`,
    );
    const validated = validateEscrow(escrowBody, binding.plan, binding.commitments[partition], partition);
    const plaintext = decryptEscrow({ ...validated, key });
    if (
      !exactKeys(plaintext, [
        "schema", "release_set_id", "partition", "freeze_identity_sha256",
        "commitment", "claim_eligible", "seeds",
      ])
      || plaintext.schema !== 1
      || plaintext.release_set_id !== binding.plan.release_set_id
      || plaintext.partition !== partition
      || plaintext.freeze_identity_sha256 !== binding.plan.cross_partition.freeze_identity_sha256
      || plaintext.commitment !== binding.commitments[partition].commitment
      || plaintext.claim_eligible !== binding.plan.claim_eligible
    ) throw new Error(`${partition} decrypted seed escrow identity mismatch.`);
    const seeds = validateSeedList(plaintext.seeds, `${partition} operator reveal`);
    if (
      seeds.length !== binding.commitments[partition].seed_count
      || seedListCommitment(seeds) !== binding.commitments[partition].commitment
    ) throw new Error(`${partition} decrypted seeds do not satisfy the sealed commitment.`);
    revealed[partition] = Object.freeze({
      schema: 1,
      partition,
      state: "frozen-reveal",
      algorithm: "sha256-json-array-v1",
      commitment: binding.commitments[partition].commitment,
      seeds: Object.freeze(seeds),
      operator_contract_version: SEED_RELEASE_OPERATOR_VERSION,
      release_set_id: binding.plan.release_set_id,
      plan_sha256: binding.plan.plan_sha256,
      claim_eligible: binding.plan.claim_eligible,
    });
  }
  assertDisjointSeedPacks(partitionNames.map((partition) => revealed[partition]));
  const attestationBody = {
    schema: 1,
    contract_version: SEED_REVEAL_ATTESTATION_VERSION,
    state: "explicitly-revealed",
    artifact: "candidate-010",
    release_set_id: binding.plan.release_set_id,
    plan_sha256: binding.plan.plan_sha256,
    claim_eligible: binding.plan.claim_eligible,
    partitions: Object.fromEntries(partitionNames.map((partition) => [partition, {
      commitment: binding.commitments[partition].commitment,
      seed_count: binding.commitments[partition].seed_count,
      reveal_sha256: sha256(canonical(revealed[partition])),
    }])),
    disjointness: "verified",
  };
  const attestation = Object.freeze({
    ...attestationBody,
    attestation_sha256: sha256(canonical(attestationBody)),
  });
  const revealedTarget = await absentTarget(path.join(binding.root, "revealed"), "seed reveal directory");
  const staging = path.join(revealedTarget.parent, `.candidate-010-seed-reveal-${randomUUID()}.tmp`);
  await mkdir(staging);
  try {
    for (const [name, relative] of Object.entries(snapshotNames)) {
      await writeSynced(path.join(staging, relative), binding.bodies[name]);
    }
    for (const partition of partitionNames) {
      await writeJson(path.join(staging, `${partition}.commit.json`), binding.commitments[partition]);
      await writeJson(path.join(staging, `${partition}.reveal.json`), revealed[partition]);
    }
    await writeJson(path.join(staging, "seed-release-plan.json"), binding.plan);
    await writeJson(path.join(staging, "seed-reveal-attestation.json"), attestation);
    await rename(staging, revealedTarget.absolute);
  } catch (error) {
    await rm(staging, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
  return Object.freeze({
    contract_version: SEED_RELEASE_OPERATOR_VERSION,
    state: "explicitly-revealed",
    claim_eligible: binding.plan.claim_eligible,
    release_set_id: binding.plan.release_set_id,
    plan_sha256: binding.plan.plan_sha256,
    attestation_sha256: attestation.attestation_sha256,
    reveal_directory: revealedTarget.absolute,
    release_v3_arguments: binding.plan.claim_eligible
      ? Object.freeze(Object.fromEntries(partitionNames.map((partition) => [partition, Object.freeze({
        releaseVersion: binding.plan.release_version,
        partition,
        phase: partition,
        sourceBundlePath: snapshotNames.source_bundle,
        executionDescriptorPath: snapshotNames.execution_descriptor,
        runtimeIdentityPath: snapshotNames.runtime_identity,
        configPath: snapshotNames.config,
        designPath: snapshotNames.design,
        backendRegistryPath: snapshotNames.backend_registry,
        preregistrationPath: snapshotNames.preregistration,
        commitmentPath: `${partition}.commit.json`,
        revealPath: `${partition}.reveal.json`,
      })])))
      : null,
  });
}

export async function validateSeedReleaseOperatorArtifacts(options) {
  if (!exactOptions(options, ["bindingDirectory"], ["requireClaimEligible"])) {
    throw new Error("Seed-release artifact validation requires exact inputs.");
  }
  const { bindingDirectory, requireClaimEligible = false } = options;
  if (typeof requireClaimEligible !== "boolean") {
    throw new Error("requireClaimEligible must be boolean.");
  }
  const binding = await loadPlanAndBindings(bindingDirectory);
  let revealedRoot = null;
  try {
    revealedRoot = await strictDirectory(path.join(binding.root, "revealed"), "seed reveal directory");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (requireClaimEligible && !binding.plan.claim_eligible) {
    throw new Error("Injected-entropy fixture seed releases are permanently claim-ineligible and cannot be relabelled.");
  }
  let attestation = null;
  if (revealedRoot !== null) {
    for (const [name, relative] of Object.entries(snapshotNames)) {
      const body = await readFile(await containedFile(
        revealedRoot,
        path.join(revealedRoot, relative),
        `revealed seed-release ${name}`,
      ));
      if (
        sha256(body) !== binding.plan.bindings[name].sha256
        || canonical(parseJson(body, `revealed ${name}`)) !== canonical(parseJson(binding.bodies[name], `bound ${name}`))
      ) throw new Error(`Revealed seed-release snapshot mismatch for ${name}.`);
    }
    const reveals = {};
    for (const partition of partitionNames) {
      const copiedCommitment = parseJson(
        await readFile(await containedFile(
          revealedRoot,
          path.join(revealedRoot, `${partition}.commit.json`),
          `revealed ${partition} commitment`,
        )),
        `revealed ${partition} commitment`,
      );
      validateCommitment(copiedCommitment, binding.plan, partition);
      if (canonical(copiedCommitment) !== canonical(binding.commitments[partition])) {
        throw new Error(`Revealed ${partition} commitment differs from the sealed binding.`);
      }
      reveals[partition] = validateReveal(
        parseJson(
          await readFile(await containedFile(
            revealedRoot,
            path.join(revealedRoot, `${partition}.reveal.json`),
            `${partition} revealed seed pack`,
          )),
          `${partition} reveal`,
        ),
        binding.plan,
        binding.commitments[partition],
        partition,
      );
    }
    attestation = validateRevealAttestation(
      parseJson(
        await readFile(await containedFile(
          revealedRoot,
          path.join(revealedRoot, "seed-reveal-attestation.json"),
          "seed reveal attestation",
        )),
        "seed reveal attestation",
      ),
      binding.plan,
      binding.commitments,
      reveals,
    );
  }
  return Object.freeze({
    valid: true,
    state: attestation === null ? "commitments-sealed" : "explicitly-revealed",
    claim_eligible: binding.plan.claim_eligible,
    release_set_id: binding.plan.release_set_id,
    plan_sha256: binding.plan.plan_sha256,
    attestation_sha256: attestation?.attestation_sha256 ?? null,
  });
}
