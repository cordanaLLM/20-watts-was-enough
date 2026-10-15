import { createHash } from "node:crypto";
import {
  access,
  link,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { endianness, release } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  canonicalize,
  openCheckpointLedger,
  remainingWorkUnits,
  sha256Hex,
} from "../lib/checkpoint-ledger.mjs";
import {
  FIXTURE_026_RSD_T02_ACTIVE_ARM_IDS,
  FIXTURE_026_RSD_T02_ARM_BANK_VERSION,
  FIXTURE_026_RSD_T02_INACTIVE_ARM_IDS,
  assertFixture026RsdT02ArmCommitment,
  buildFixture026RsdT02SystemPacket,
  validateFixture026RsdT02ArmBankConfig,
} from "./rsd-t02-arm-bank.mjs";
import {
  FIXTURE_026_RSD_T02_ISOLATED_POLICY_VERSION,
  buildFixture026RsdT02IsolatedArmCommitment,
  loadFixture026RsdT02PolicyBundleInventory,
} from "./rsd-t02-isolated-policy.mjs";
import {
  FIXTURE_026_RSD_T02_ACTIONABLE_ARM_IDS,
  FIXTURE_026_RSD_T02_PAIR_CERTIFICATES,
  FIXTURE_026_RSD_T02_PROPERTY_KEYS,
  FIXTURE_026_RSD_T02_RECIPES,
} from "./rsd-t02-contract.mjs";
import {
  FIXTURE_026_RSD_T02_EVALUATOR_VERSION,
  aggregateFixture026RsdT02System,
  assertFixture026RsdT02Evaluation,
  evaluateFixture026RsdT02MatchedStepPair,
  evaluateFixture026RsdT02Pair,
  evaluateFixture026RsdT02Transcript,
} from "./rsd-t02-evaluator.mjs";
import {
  FIXTURE_026_RSD_T02_EVENT_INTERPRETATION,
  FIXTURE_026_RSD_T02_EVENT_VERSION,
  assertFixture026RsdT02Event,
  buildFixture026RsdT02FrozenResponse,
  fixture026RsdT02EventPayload,
  fixture026RsdT02WorkKey,
} from "./rsd-t02-event.mjs";
import {
  FIXTURE_026_RSD_T02_GENERATOR_VERSION,
  assertFixture026RsdT02Transcript,
  buildFixture026RsdT02EpisodeCommand,
  buildFixture026RsdT02ExecutionDescriptors,
  buildFixture026RsdT02WorkUnits,
  fixture026RsdT02Projection,
  fixture026RsdT02InputCommandCount,
  fixture026RsdT02ScheduleSha256,
  generateFixture026RsdT02Transcript,
} from "./rsd-t02-generator.mjs";
import { readStableOpenedFile } from "./opened-file.mjs";
import {
  acquireFixture026RsdT02RunLock,
  fixture026RsdT02RunLockPath,
} from "./rsd-t02-run-lock.mjs";

export const FIXTURE_026_RSD_T02_RUNNER_VERSION = "fixture-026.rsd-t02-runner.v3";
export const FIXTURE_026_RSD_T02_RUNTIME_FINGERPRINT = Object.freeze({
  schema: 1,
  node_version: process.versions.node,
  v8_version: process.versions.v8,
  uv_version: process.versions.uv,
  platform: process.platform,
  architecture: process.arch,
  endianness: endianness(),
  os_release: release(),
  numeric_model: "IEEE-754 binary64 via Node/V8 Number",
  math_boundary: "runtime-bound Math.exp, Math.log, and RK4 binary64 arithmetic",
});

const fixtureRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(fixtureRoot, "../../..");
const LEDGER_FORMAT = "fixture-026.rsd-t02-ledger.v1";
const RAW_FILE = "rsd-t02-raw-events.jsonl";
const CHECKPOINT_FILE = "rsd-t02-checkpoint.json";
const RUN_FILE = "rsd-t02-run.json";
const ARM_COMMITMENT_FILE = "rsd-t02-arm-commitment.json";
const ARM_ABSTENTION_FILE = "rsd-t02-arm-abstention.json";
const ARM_ABSTENTION_PENDING_FILE = `${ARM_ABSTENTION_FILE}.pending`;
const SUMMARY_FILE = path.join("analysis", "rsd-t02-summary.json");
const DEFAULT_POLICY_TIMEOUT_MS = 30_000;
export const FIXTURE_026_RSD_T02_BOUNDARY_ABSTENTION_VERSION =
  "fixture-026.rsd-t02-policy-boundary-abstention.v1";
const BOUNDARY_ABSTENTION_AUTHORITY =
  "bounded-pre-evaluator-isolated-policy-abstention-only";
const RUN_INTERPRETATION = "NO_RESULT: complete bounded public-development RSD-T02 mechanism-panel and pre-evaluator fresh-child isolated nine-arm policy-conformance run; every registry role has a fixed construction policy, but the two comparator references are not mature nulls and no calibrated comparison, fixed-instance population run, T02-FLOOR, O2, or claim authority exists.";
const RUN_IDENTITY_KEYS = Object.freeze([
  "schema", "artifact", "track", "execution_claims", "excluded_claims", "runner_version",
  "generator_version", "evaluator_version", "event_contract_version", "arm_bank_version",
  "ledger_format",
  "runtime_fingerprint", "runtime_fingerprint_sha256", "profile", "seeds", "source_hashes",
  "seed_scope", "source_seed_count", "construction_seed_count",
  "configured_work_units", "full_public_development_pack_executed",
  "partition", "information_cut_status", "execution_mode", "gpu_permitted",
  "observation_regimes_executed", "observation_regimes_not_executed", "floor_runtime_state",
  "actionable_arms", "actionable_arms_implemented", "actionable_arms_not_implemented",
  "arm_policy_authority", "evaluator_only_arm",
  "arm_policy_execution_boundary", "isolated_policy_children", "policy_bundle_sha256",
  "policy_bundle_inventory_sha256",
  "policy_source_inventory_sha256", "policy_worker_sha256",
  "result_label", "no_result", "claim_eligible", "comparison_inference_permitted",
  "scientific_result", "performance_result", "measured_energy_present",
  "energy_conclusion_allowed", "run_id",
]);
const RUN_KEYS = Object.freeze([
  ...RUN_IDENTITY_KEYS,
  "expected_work_units", "ledger", "raw_path", "checkpoint_path", "arm_commitment_path",
  "arm_commitment_sha256", "arm_commitment_file_sha256", "arm_packet_records",
  "arm_boundary_receipts_sha256", "arm_boundary_invocations",
  "interpretation",
]);
const LEDGER_KEYS = Object.freeze([
  "records", "scientific_payload_sha256", "hash_chain_sha256", "completed_work_units",
  "checkpoint_status",
]);
const ANALYSIS_KEYS = Object.freeze([
  "schema", "contract_version", "artifact", "track", "run_id", "profile", "seeds",
  "expected_records", "observed_records", "records_per_seed", "o0_records_per_seed",
  "o1_records_per_seed", "sample_rows_per_record", "system_aggregation",
  "matched_step_pair_matrix", "pair_matrix",
  "cost_totals", "arm_bank", "checks", "decision", "result_label", "no_result", "claim_eligible",
  "comparison_inference_permitted", "scientific_result", "performance_result",
  "measured_energy_present", "energy_conclusion_allowed", "interpretation",
]);
const BOUNDARY_ABSTENTION_KEYS = Object.freeze([
  "schema", "contract_version", "artifact", "track", "run_id", "profile", "partition",
  "boundary_version", "packet_ordinal", "seed", "system_slot", "system_packet_sha256",
  "system_packet_utf8_bytes", "failed_arm_id", "active_arm_outcomes",
  "boundary_receipt_sha256", "boundary_receipts_sha256", "boundary_invocations",
  "policy_bundle_sha256",
  "policy_bundle_inventory_sha256", "policy_source_inventory_sha256", "policy_worker_sha256",
  "policy_config_sha256", "policy_config_utf8_bytes", "evaluator_ledger_opened",
  "raw_ledger_opened", "authority", "comparison_inference_permitted", "claim_eligible",
  "result_label", "no_result", "abstention_sha256",
]);
const BOUNDARY_ARM_OUTCOME_KEYS = Object.freeze([
  "arm_id", "action", "reason_codes", "retry_invocations", "fallback_invocations",
  "authority", "comparison_inference_permitted", "claim_eligible", "result_label",
  "no_result",
]);
const BOUNDARY_ABSTENTION_REASON_CODES = Object.freeze(new Set([
  "isolated-policy-timeout",
  "isolated-policy-protocol-over-budget",
  "isolated-policy-child-crash",
  "isolated-policy-malformed-response",
  "isolated-policy-work-over-budget",
  "isolated-policy-request-over-budget",
  "isolated-worker-request-rejected",
  "isolated-worker-bundle-rejected",
  "isolated-worker-bootstrap-rejected",
  "isolated-policy-runtime-rejected",
  "isolated-policy-bank-incomplete",
]));
const sourceFiles = Object.freeze([
  "../lib/checkpoint-ledger.mjs",
  "rsd-t02-contract.mjs",
  "rsd-t02-models.mjs",
  "rsd-t02-generator.mjs",
  "rsd-t02-evaluator.mjs",
  "rsd-t02-event.mjs",
  "rsd-t02-arm-bank.mjs",
  "rsd-t02-transform-policies.mjs",
  "rsd-t02-isolated-policy.mjs",
  "rsd-t02-policy-worker.mjs",
  "rsd-t02-policy-bundle.source.js",
  "build-rsd-t02-policy-bundle.mjs",
  "rsd-t02-policy-bundle.inventory.json",
  "policy-bundles/ee05826b7e83c08c9c8e08209b8895e3f1c6d7fd6a3229548944a95f08bada21.js",
  "rsd-t02-population-contract.mjs",
  "rsd-t02-population-design.schema.json",
  "configs/rsd-t02-population-design.json",
  "rsd-t02-run-lock.mjs",
  "rsd-t02-runner.mjs",
  "runner.mjs",
  "rsd-t02-output.schema.json",
  "rsd-t02-arm-bank.schema.json",
  "../../fixtures/026-interface-qualified-relative-sensing.md",
  "../../../math/interventional-mechanism-equivalence.md",
  "../../../research/audits/2026-08-26-rsd-t02-mechanism-equivalence.md",
  "seeds/development.reveal.json",
  "configs/rsd-t02-bounded-conformance.json",
  "configs/rsd-t02-arm-bank.json",
  "../../../.gitattributes",
  "seeds/confirmation.unavailable.json",
  "seeds/transfer.unavailable.json",
]);

function exactKeys(value, keys) {
  return value
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function samePath(left, right) {
  const normalize = (value) => process.platform === "win32"
    ? path.resolve(value).toLowerCase()
    : path.resolve(value);
  return normalize(left) === normalize(right);
}

async function informationOrNull(target) {
  try {
    return await lstat(target);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function assertSafeRepositoryPath(target, {
  allowMissing = false,
  finalType = null,
  label = "Fixture 026 RSD-T02 output",
} = {}) {
  const rootAbsolute = path.resolve(repositoryRoot);
  const targetAbsolute = path.resolve(target);
  if (!isInside(rootAbsolute, targetAbsolute)) {
    throw new Error(`${label} escapes the repository.`);
  }
  const rootInformation = await informationOrNull(rootAbsolute);
  if (!rootInformation?.isDirectory() || rootInformation.isSymbolicLink()) {
    throw new Error(`${label} repository root must be a real directory.`);
  }
  const rootReal = await realpath(rootAbsolute);
  let current = rootAbsolute;
  let missing = false;
  for (const component of path.relative(rootAbsolute, targetAbsolute).split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    const information = await informationOrNull(current);
    if (!information) {
      missing = true;
      if (!allowMissing) throw new Error(`${label} does not exist.`);
      continue;
    }
    if (missing) throw new Error(`${label} has an existing descendant below a missing ancestor.`);
    if (information.isSymbolicLink()) {
      throw new Error(`${label} traverses a symbolic link or junction.`);
    }
    const resolved = await realpath(current);
    if (!isInside(rootReal, resolved)) throw new Error(`${label} resolves outside the repository.`);
    const expected = path.join(rootReal, path.relative(rootAbsolute, current));
    if (!samePath(expected, resolved)) {
      throw new Error(`${label} traverses a reparse point or redirected ancestor.`);
    }
  }
  const finalInformation = await informationOrNull(targetAbsolute);
  if (finalInformation && finalType === "directory" && !finalInformation.isDirectory()) {
    throw new Error(`${label} must be a directory.`);
  }
  if (finalInformation && finalType === "file" && !finalInformation.isFile()) {
    throw new Error(`${label} must be a regular file.`);
  }
  return targetAbsolute;
}

async function assertSafeRunArtifacts(directory, { complete = false } = {}) {
  await assertSafeRepositoryPath(directory, { finalType: "directory" });
  for (const name of [RAW_FILE, CHECKPOINT_FILE, RUN_FILE, ARM_COMMITMENT_FILE]) {
    await assertSafeRepositoryPath(path.join(directory, name), {
      allowMissing: !complete,
      finalType: "file",
      label: `Fixture 026 RSD-T02 ${name}`,
    });
  }
  for (const name of [ARM_ABSTENTION_FILE, ARM_ABSTENTION_PENDING_FILE]) {
    const target = path.join(directory, name);
    await assertSafeRepositoryPath(target, {
      allowMissing: true,
      finalType: "file",
      label: `Fixture 026 RSD-T02 ${name}`,
    });
    if (complete && await exists(target)) {
      throw new Error("Fixture 026 RSD-T02 completed evaluator state cannot coexist with a boundary abstention artifact.");
    }
  }
}

function canonicalRepositoryPath(file) {
  const relative = path.relative(repositoryRoot, file);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Fixture 026 RSD-T02 artifact path must remain inside the repository.");
  }
  return relative.replaceAll("\\", "/");
}

function outputDirectory(value) {
  const resolved = path.resolve(repositoryRoot, value);
  if (!isInside(repositoryRoot, resolved) || resolved === repositoryRoot) {
    throw new Error("Fixture 026 RSD-T02 output must remain inside the repository.");
  }
  return resolved;
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function fileSha256(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

async function fileFingerprint(file) {
  const bytes = await readFile(file);
  return Object.freeze({
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.length,
  });
}

async function loadJsonFingerprint(file) {
  const bytes = await readFile(file);
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  return Object.freeze({
    document: JSON.parse(text),
    utf8: text,
    fingerprint: Object.freeze({
      sha256: createHash("sha256").update(bytes).digest("hex"),
      bytes: bytes.length,
    }),
  });
}

async function loadJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function syncParentDirectory(file) {
  let directoryHandle;
  try {
    directoryHandle = await open(path.dirname(file), "r");
    await directoryHandle.sync();
  } catch (error) {
    if (
      process.platform !== "win32"
      || !new Set(["EACCES", "EBADF", "EISDIR", "EINVAL", "EPERM"]).has(error.code)
    ) throw error;
  } finally {
    await directoryHandle?.close();
  }
}

async function writeJsonStable(file, value, { durable = false } = {}) {
  const body = `${JSON.stringify(value, null, 2)}\n`;
  try {
    if (durable) {
      const handle = await open(file, "wx");
      try {
        await handle.writeFile(body, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
      await syncParentDirectory(file);
    } else {
      await writeFile(file, body, { flag: "wx" });
    }
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const current = JSON.parse(await readFile(file, "utf8"));
    if (canonicalize(current) !== canonicalize(value)) {
      throw new Error(`Refusing to replace non-identical ${path.basename(file)}.`, { cause: error });
    }
  }
}

async function readCanonicalJsonArtifact(file, label) {
  const bytes = await readStableOpenedFile(file, {
    label,
    containedBy: repositoryRoot,
  });
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`${label} is not valid UTF-8.`);
  }
  let document;
  try {
    document = JSON.parse(text);
  } catch {
    throw new Error(`${label} is not valid JSON.`);
  }
  if (text !== `${canonicalize(document)}\n`) {
    throw new Error(`${label} is not canonical LF JSON.`);
  }
  return Object.freeze({
    document,
    bytes,
    file_sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}

async function publishCanonicalJsonAtomic(file, value, label) {
  const pendingPath = `${file}.pending`;
  await assertSafeRepositoryPath(file, {
    allowMissing: true,
    finalType: "file",
    label,
  });
  await assertSafeRepositoryPath(pendingPath, {
    allowMissing: true,
    finalType: "file",
    label: `${label} pending publication`,
  });
  const body = `${canonicalize(value)}\n`;
  let handle;
  try {
    handle = await open(pendingPath, "wx");
    await handle.writeFile(body, "utf8");
    await handle.sync();
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    await assertSafeRepositoryPath(pendingPath, {
      finalType: "file",
      label: `${label} pending publication`,
    });
    const existing = await readStableOpenedFile(pendingPath, {
      label: `${label} pending publication`,
      containedBy: repositoryRoot,
    });
    if (existing.toString("utf8") !== body) {
      throw new Error(`Refusing to replace non-identical ${path.basename(pendingPath)}.`, { cause: error });
    }
  } finally {
    await handle?.close();
  }
  try {
    await link(pendingPath, file);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    await assertSafeRepositoryPath(file, { finalType: "file", label });
    const existing = await readStableOpenedFile(file, {
      label,
      containedBy: repositoryRoot,
    });
    if (existing.toString("utf8") !== body) {
      throw new Error(`Refusing to replace non-identical ${path.basename(file)}.`, { cause: error });
    }
  }
  await syncParentDirectory(file);
  await assertSafeRepositoryPath(file, { finalType: "file", label });
  try {
    await unlink(pendingPath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await syncParentDirectory(file);
  const published = await readCanonicalJsonArtifact(file, label);
  if (published.bytes.toString("utf8") !== body) {
    throw new Error(`${label} changed during atomic publication.`);
  }
  return published;
}

export function validateFixture026RsdT02SeedDocument(document) {
  if (
    !exactKeys(document, [
      "schema", "artifact", "partition", "state", "algorithm", "encoding", "seeds",
    ])
    || document.schema !== 2
    || document.artifact !== "fixture-026"
    || document.partition !== "development"
    || document.state !== "public-development"
    || document.algorithm !== "literal-public-seed-list-v2"
    || document.encoding !== "unsigned-little-endian-uint64"
    || !Array.isArray(document.seeds)
    || document.seeds.length !== 64
    || document.seeds.some((seed) => (
      typeof seed !== "string"
      || !/^(0|[1-9][0-9]{0,19})$/u.test(seed)
      || BigInt(seed) > 0xffff_ffff_ffff_ffffn
    ))
    || new Set(document.seeds).size !== document.seeds.length
  ) throw new Error("Fixture 026 RSD-T02 public seed document is invalid.");
  return document;
}

export function validateFixture026RsdT02Unavailable(document, partition) {
  if (
    !exactKeys(document, [
      "schema", "artifact", "partition", "state", "contains_seeds",
      "contains_commitment", "result_label", "reason",
    ])
    || document.schema !== 1
    || document.artifact !== "fixture-026"
    || document.partition !== partition
    || document.state !== "not-created"
    || document.contains_seeds !== false
    || document.contains_commitment !== false
    || document.result_label !== "NO_RESULT"
    || typeof document.reason !== "string"
    || document.reason.length < 1
  ) throw new Error(`Fixture 026 RSD-T02 ${partition} absence record is invalid.`);
  return document;
}

export function validateFixture026RsdT02BoundedConformanceConfig(document) {
  if (
    !exactKeys(document, [
      "schema", "artifact", "track", "partition", "authority", "seed_selection",
      "source_seed_count", "profiles", "full_public_development_pack_executed",
      "result_label", "claim_eligible",
    ])
    || document.schema !== 1
    || document.artifact !== "fixture-026"
    || document.track !== "RSD-T02"
    || document.partition !== "public-development"
    || document.authority !== "bounded-construction-conformance-only"
    || document.seed_selection !== "ordered-prefix-of-public-development-reveal"
    || document.source_seed_count !== 64
    || !exactKeys(document.profiles, ["smoke", "development"])
    || !exactKeys(document.profiles.smoke, ["construction_seed_count", "work_units"])
    || !exactKeys(document.profiles.development, ["construction_seed_count", "work_units"])
    || document.profiles.smoke.construction_seed_count !== 1
    || document.profiles.smoke.work_units !== 175
    || document.profiles.development.construction_seed_count !== 2
    || document.profiles.development.work_units !== 350
    || document.full_public_development_pack_executed !== false
    || document.result_label !== "NO_RESULT"
    || document.claim_eligible !== false
  ) throw new Error("Fixture 026 RSD-T02 bounded conformance configuration is invalid.");
  return document;
}

async function loadInputs(profile) {
  if (!new Set(["smoke", "development"]).has(profile)) {
    throw new Error("Fixture 026 RSD-T02 profile must be smoke or development.");
  }
  const inputFiles = Object.freeze({
    "seeds/development.reveal.json": path.join(
      fixtureRoot, "seeds", "development.reveal.json",
    ),
    "configs/rsd-t02-bounded-conformance.json": path.join(
      fixtureRoot, "configs", "rsd-t02-bounded-conformance.json",
    ),
    "configs/rsd-t02-arm-bank.json": path.join(
      fixtureRoot, "configs", "rsd-t02-arm-bank.json",
    ),
    "seeds/confirmation.unavailable.json": path.join(
      fixtureRoot, "seeds", "confirmation.unavailable.json",
    ),
    "seeds/transfer.unavailable.json": path.join(
      fixtureRoot, "seeds", "transfer.unavailable.json",
    ),
  });
  const loadedInputs = Object.fromEntries(await Promise.all(Object.entries(inputFiles).map(
    async ([relative, absolute]) => [relative, await loadJsonFingerprint(absolute)],
  )));
  const policyInventory = await loadFixture026RsdT02PolicyBundleInventory();
  const seedDocument = validateFixture026RsdT02SeedDocument(
    loadedInputs["seeds/development.reveal.json"].document,
  );
  const confirmationUnavailable = validateFixture026RsdT02Unavailable(
    loadedInputs["seeds/confirmation.unavailable.json"].document,
    "confirmation",
  );
  const transferUnavailable = validateFixture026RsdT02Unavailable(
    loadedInputs["seeds/transfer.unavailable.json"].document,
    "held-out",
  );
  void confirmationUnavailable;
  void transferUnavailable;
  const boundedConfig = validateFixture026RsdT02BoundedConformanceConfig(
    loadedInputs["configs/rsd-t02-bounded-conformance.json"].document,
  );
  const armConfig = validateFixture026RsdT02ArmBankConfig(
    loadedInputs["configs/rsd-t02-arm-bank.json"].document,
  );
  const constructionSeedCount = boundedConfig.profiles[profile].construction_seed_count;
  const configuredWorkUnits = boundedConfig.profiles[profile].work_units;
  if (seedDocument.seeds.length !== boundedConfig.source_seed_count) {
    throw new Error("Fixture 026 RSD-T02 source seed pack cardinality differs from its hashed bounded configuration.");
  }
  const seeds = seedDocument.seeds.slice(0, constructionSeedCount);
  const sourceFingerprints = Object.fromEntries(await Promise.all(sourceFiles.map(
    async (relative) => {
      const normalized = relative.replaceAll("\\", "/");
      return [
        normalized,
        loadedInputs[normalized]?.fingerprint
          ?? await fileFingerprint(path.resolve(fixtureRoot, relative)),
      ];
    },
  )));
  const sourceHashes = Object.fromEntries(Object.entries(sourceFingerprints).map(
    ([relative, fingerprint]) => [relative, fingerprint.sha256],
  ));
  const policyConfigBytes = sourceFingerprints["configs/rsd-t02-arm-bank.json"].bytes;
  return Object.freeze({
    profile,
    seeds: Object.freeze(seeds),
    sourceSeedCount: seedDocument.seeds.length,
    constructionSeedCount,
    configuredWorkUnits,
    armConfig,
    armConfigUtf8: loadedInputs["configs/rsd-t02-arm-bank.json"].utf8,
    policyArtifactSha256: policyInventory.bundle_sha256,
    policyArtifactBytes: policyInventory.bundle_bytes,
    policyConfigSha256: sourceHashes["configs/rsd-t02-arm-bank.json"],
    policyConfigBytes,
    policyBundleInventorySha256: policyInventory.inventory_sha256,
    policySourceInventorySha256: policyInventory.source_inventory_sha256,
    policyWorkerSha256: policyInventory.worker_sha256,
    sourceHashes: Object.freeze(sourceHashes),
    runtimeFingerprint: FIXTURE_026_RSD_T02_RUNTIME_FINGERPRINT,
    runtimeFingerprintSha256: sha256Hex(canonicalize(FIXTURE_026_RSD_T02_RUNTIME_FINGERPRINT)),
  });
}

function runIdentity(inputs) {
  const body = {
    schema: 1,
    artifact: "fixture-026",
    track: "RSD-T02",
    execution_claims: [],
    excluded_claims: ["C-1561", "C-1564"],
    runner_version: FIXTURE_026_RSD_T02_RUNNER_VERSION,
    generator_version: FIXTURE_026_RSD_T02_GENERATOR_VERSION,
    evaluator_version: FIXTURE_026_RSD_T02_EVALUATOR_VERSION,
    event_contract_version: FIXTURE_026_RSD_T02_EVENT_VERSION,
    arm_bank_version: FIXTURE_026_RSD_T02_ARM_BANK_VERSION,
    ledger_format: LEDGER_FORMAT,
    runtime_fingerprint: inputs.runtimeFingerprint,
    runtime_fingerprint_sha256: inputs.runtimeFingerprintSha256,
    profile: inputs.profile,
    seeds: inputs.seeds,
    source_hashes: inputs.sourceHashes,
    seed_scope: "bounded-ordered-prefix-construction-conformance",
    source_seed_count: inputs.sourceSeedCount,
    construction_seed_count: inputs.constructionSeedCount,
    configured_work_units: inputs.configuredWorkUnits,
    full_public_development_pack_executed: false,
    partition: "public-development-only",
    information_cut_status: "registered-projection-no-secret-custody",
    execution_mode: "deterministic-cpu-only-with-fresh-isolated-policy-child",
    gpu_permitted: false,
    observation_regimes_executed: ["O0-MATCHED-STEP", "O1-FULL-PANEL"],
    observation_regimes_not_executed: ["O2-SELECT6"],
    floor_runtime_state: "foundation-only-not-executed",
    actionable_arms: FIXTURE_026_RSD_T02_ACTIONABLE_ARM_IDS,
    actionable_arms_implemented: FIXTURE_026_RSD_T02_ACTIVE_ARM_IDS,
    actionable_arms_not_implemented: FIXTURE_026_RSD_T02_INACTIVE_ARM_IDS,
    arm_policy_authority: "bounded-pre-evaluator-conformance-references-not-mature-comparators",
    arm_policy_execution_boundary: FIXTURE_026_RSD_T02_ISOLATED_POLICY_VERSION,
    isolated_policy_children: inputs.seeds.length * FIXTURE_026_RSD_T02_RECIPES.length,
    policy_bundle_sha256: inputs.policyArtifactSha256,
    policy_bundle_inventory_sha256: inputs.policyBundleInventorySha256,
    policy_source_inventory_sha256: inputs.policySourceInventorySha256,
    evaluator_only_arm: "O-GRAPH",
    policy_worker_sha256: inputs.policyWorkerSha256,
    result_label: "NO_RESULT",
    no_result: true,
    claim_eligible: false,
    comparison_inference_permitted: false,
    scientific_result: false,
    performance_result: false,
    measured_energy_present: false,
    energy_conclusion_allowed: false,
  };
  return Object.freeze({ ...body, run_id: sha256Hex(canonicalize(body)) });
}

function allWorkUnits(inputs, identity) {
  const units = buildFixture026RsdT02WorkUnits({ profile: inputs.profile, seeds: inputs.seeds }).map(
    (unit) => Object.freeze({ ...unit, run_id: identity.run_id }),
  );
  if (units.length !== inputs.configuredWorkUnits) {
    throw new Error("Fixture 026 RSD-T02 computed grid differs from the hashed bounded conformance configuration.");
  }
  return units;
}

function armPacketInputs(inputs, units) {
  return Object.freeze(inputs.seeds.flatMap((seed) => (
    FIXTURE_026_RSD_T02_RECIPES.map((recipe, systemSlot) => {
      const projections = units.filter((unit) => (
        unit.seed === seed && unit.recipe_id === recipe.recipe_id
      )).map((unit) => {
        const command = buildFixture026RsdT02EpisodeCommand(unit);
        const transcript = assertFixture026RsdT02Transcript(
          generateFixture026RsdT02Transcript(command),
        );
        return fixture026RsdT02Projection(transcript);
      });
      return Object.freeze({
        seed,
        system_slot: systemSlot,
        packet: buildFixture026RsdT02SystemPacket(projections).packet,
      });
    })
  )));
}

function armPacketInputAt(inputs, units, packetOrdinal) {
  const systemSlot = packetOrdinal % FIXTURE_026_RSD_T02_RECIPES.length;
  const seed = inputs.seeds[Math.floor(packetOrdinal / FIXTURE_026_RSD_T02_RECIPES.length)];
  const recipe = FIXTURE_026_RSD_T02_RECIPES[systemSlot];
  const projections = units.filter((unit) => (
    unit.seed === seed && unit.recipe_id === recipe.recipe_id
  )).map((unit) => {
    const command = buildFixture026RsdT02EpisodeCommand(unit);
    const transcript = assertFixture026RsdT02Transcript(
      generateFixture026RsdT02Transcript(command),
    );
    return fixture026RsdT02Projection(transcript);
  });
  return Object.freeze({
    seed,
    system_slot: systemSlot,
    packet: buildFixture026RsdT02SystemPacket(projections).packet,
  });
}

function expectedFailedArmId(activeArmOutcomes) {
  const directFailures = activeArmOutcomes.filter(
    (outcome) => outcome.reason_codes[0] !== "isolated-policy-bank-incomplete",
  );
  return directFailures.length === 1 ? directFailures[0].arm_id : null;
}

export function validateFixture026RsdT02BoundaryAbstention(document, {
  identity,
  inputs,
  units,
}) {
  const packetCount = inputs.seeds.length * FIXTURE_026_RSD_T02_RECIPES.length;
  if (
    !exactKeys(document, BOUNDARY_ABSTENTION_KEYS)
    || document.schema !== 1
    || document.contract_version !== FIXTURE_026_RSD_T02_BOUNDARY_ABSTENTION_VERSION
    || document.artifact !== "fixture-026"
    || document.track !== "RSD-T02"
    || document.run_id !== identity.run_id
    || document.profile !== inputs.profile
    || document.partition !== identity.partition
    || document.boundary_version !== FIXTURE_026_RSD_T02_ISOLATED_POLICY_VERSION
    || !Number.isSafeInteger(document.packet_ordinal)
    || document.packet_ordinal < 0
    || document.packet_ordinal >= packetCount
    || typeof document.seed !== "string"
    || !Number.isSafeInteger(document.system_slot)
    || !/^[0-9a-f]{64}$/u.test(document.system_packet_sha256)
    || !Number.isSafeInteger(document.system_packet_utf8_bytes)
    || document.system_packet_utf8_bytes < 1
    || !Array.isArray(document.active_arm_outcomes)
    || document.active_arm_outcomes.length !== FIXTURE_026_RSD_T02_ACTIVE_ARM_IDS.length
    || !/^[0-9a-f]{64}$/u.test(document.boundary_receipt_sha256)
    || !/^[0-9a-f]{64}$/u.test(document.boundary_receipts_sha256)
    || !Number.isSafeInteger(document.boundary_invocations)
    || document.boundary_invocations !== document.packet_ordinal + 1
    || document.policy_bundle_sha256 !== identity.policy_bundle_sha256
    || document.policy_bundle_inventory_sha256 !== identity.policy_bundle_inventory_sha256
    || document.policy_source_inventory_sha256 !== identity.policy_source_inventory_sha256
    || document.policy_worker_sha256 !== identity.policy_worker_sha256
    || document.policy_config_sha256 !== inputs.policyConfigSha256
    || document.policy_config_utf8_bytes !== inputs.policyConfigBytes
    || document.evaluator_ledger_opened !== false
    || document.raw_ledger_opened !== false
    || document.authority !== BOUNDARY_ABSTENTION_AUTHORITY
    || document.comparison_inference_permitted !== false
    || document.claim_eligible !== false
    || document.result_label !== "NO_RESULT"
    || document.no_result !== true
    || !/^[0-9a-f]{64}$/u.test(document.abstention_sha256)
  ) throw new Error("Fixture 026 RSD-T02 boundary abstention violates its closed contract.");
  for (const [index, outcome] of document.active_arm_outcomes.entries()) {
    if (
      !exactKeys(outcome, BOUNDARY_ARM_OUTCOME_KEYS)
      || outcome.arm_id !== FIXTURE_026_RSD_T02_ACTIVE_ARM_IDS[index]
      || outcome.action !== "abstain"
      || !Array.isArray(outcome.reason_codes)
      || outcome.reason_codes.length !== 1
      || !BOUNDARY_ABSTENTION_REASON_CODES.has(outcome.reason_codes[0])
      || outcome.retry_invocations !== 0
      || outcome.fallback_invocations !== 0
      || outcome.authority !== "public-development-policy-conformance-only"
      || outcome.comparison_inference_permitted !== false
      || outcome.claim_eligible !== false
      || outcome.result_label !== "NO_RESULT"
      || outcome.no_result !== true
    ) throw new Error("Fixture 026 RSD-T02 boundary abstention arm outcome violates its closed contract.");
  }
  if (
    document.failed_arm_id !== expectedFailedArmId(document.active_arm_outcomes)
  ) throw new Error("Fixture 026 RSD-T02 boundary abstention failed-arm binding is false.");
  const packetInput = armPacketInputAt(inputs, units, document.packet_ordinal);
  const builtPacket = buildFixture026RsdT02SystemPacket(packetInput.packet.projections);
  if (
    document.seed !== packetInput.seed
    || document.system_slot !== packetInput.system_slot
    || document.system_packet_sha256 !== builtPacket.system_packet_sha256
    || document.system_packet_utf8_bytes !== builtPacket.system_packet_utf8_bytes
  ) throw new Error("Fixture 026 RSD-T02 boundary abstention packet binding is false.");
  const hashBody = { ...document };
  delete hashBody.abstention_sha256;
  if (document.abstention_sha256 !== sha256Hex(canonicalize(hashBody))) {
    throw new Error("Fixture 026 RSD-T02 boundary abstention hash is false.");
  }
  return document;
}

function buildBoundaryAbstentionArtifact({ outcome, identity, inputs, units }) {
  const body = {
    schema: 1,
    contract_version: FIXTURE_026_RSD_T02_BOUNDARY_ABSTENTION_VERSION,
    artifact: "fixture-026",
    track: "RSD-T02",
    run_id: identity.run_id,
    profile: inputs.profile,
    partition: identity.partition,
    boundary_version: FIXTURE_026_RSD_T02_ISOLATED_POLICY_VERSION,
    packet_ordinal: outcome.packet_ordinal,
    seed: outcome.seed,
    system_slot: outcome.system_slot,
    system_packet_sha256: outcome.system_packet_sha256,
    system_packet_utf8_bytes: outcome.system_packet_utf8_bytes,
    failed_arm_id: outcome.failed_arm_id,
    active_arm_outcomes: outcome.active_arm_outcomes,
    boundary_receipt_sha256: outcome.receipt_sha256,
    boundary_receipts_sha256: outcome.receipts_sha256,
    boundary_invocations: outcome.receipts.length,
    policy_bundle_sha256: outcome.policy_bundle_sha256,
    policy_bundle_inventory_sha256: outcome.policy_bundle_inventory_sha256,
    policy_source_inventory_sha256: outcome.policy_source_inventory_sha256,
    policy_worker_sha256: inputs.policyWorkerSha256,
    policy_config_sha256: inputs.policyConfigSha256,
    policy_config_utf8_bytes: inputs.policyConfigBytes,
    evaluator_ledger_opened: false,
    raw_ledger_opened: false,
    authority: BOUNDARY_ABSTENTION_AUTHORITY,
    comparison_inference_permitted: false,
    claim_eligible: false,
    result_label: "NO_RESULT",
    no_result: true,
  };
  const artifact = Object.freeze({
    ...body,
    abstention_sha256: sha256Hex(canonicalize(body)),
  });
  return validateFixture026RsdT02BoundaryAbstention(artifact, { identity, inputs, units });
}

async function assertNoEvaluatorStateForBoundaryAbstention(directory) {
  for (const name of [RAW_FILE, CHECKPOINT_FILE, RUN_FILE, ARM_COMMITMENT_FILE, SUMMARY_FILE]) {
    const target = path.join(directory, name);
    await assertSafeRepositoryPath(target, {
      allowMissing: true,
      finalType: "file",
      label: `Fixture 026 RSD-T02 pre-evaluator boundary conflict ${name}`,
    });
    if (await exists(target)) {
      throw new Error("Fixture 026 RSD-T02 boundary abstention cannot coexist with evaluator, raw-ledger, or arm-commitment state.");
    }
  }
}

async function readBoundaryAbstentionState({ directory, identity, inputs, units }) {
  const abstentionPath = path.join(directory, ARM_ABSTENTION_FILE);
  const pendingPath = path.join(directory, ARM_ABSTENTION_PENDING_FILE);
  await assertSafeRepositoryPath(abstentionPath, {
    allowMissing: true,
    finalType: "file",
    label: "Fixture 026 RSD-T02 boundary abstention",
  });
  await assertSafeRepositoryPath(pendingPath, {
    allowMissing: true,
    finalType: "file",
    label: "Fixture 026 RSD-T02 boundary abstention pending publication",
  });
  const hasAbstention = await exists(abstentionPath);
  const hasPending = await exists(pendingPath);
  if (!hasAbstention && !hasPending) return null;
  let pending = null;
  if (hasPending) {
    pending = await readCanonicalJsonArtifact(
      pendingPath,
      "Fixture 026 RSD-T02 pending boundary abstention",
    );
    validateFixture026RsdT02BoundaryAbstention(pending.document, { identity, inputs, units });
  }
  if (hasAbstention) {
    const existing = await readCanonicalJsonArtifact(
      abstentionPath,
      "Fixture 026 RSD-T02 boundary abstention",
    );
    validateFixture026RsdT02BoundaryAbstention(existing.document, { identity, inputs, units });
    if (pending && canonicalize(pending.document) !== canonicalize(existing.document)) {
      throw new Error("Fixture 026 RSD-T02 pending boundary abstention differs from the durable artifact.");
    }
  }
  if (pending) {
    await publishCanonicalJsonAtomic(
      abstentionPath,
      pending.document,
      "Fixture 026 RSD-T02 boundary abstention",
    );
  }
  await assertSafeRepositoryPath(abstentionPath, {
    finalType: "file",
    label: "Fixture 026 RSD-T02 boundary abstention",
  });
  const stored = await readCanonicalJsonArtifact(
    abstentionPath,
    "Fixture 026 RSD-T02 boundary abstention",
  );
  validateFixture026RsdT02BoundaryAbstention(stored.document, { identity, inputs, units });
  await assertNoEvaluatorStateForBoundaryAbstention(directory);
  return Object.freeze({
    artifact: stored.document,
    path: abstentionPath,
    file_sha256: stored.file_sha256,
  });
}

async function persistBoundaryAbstention({ directory, outcome, identity, inputs, units }) {
  await assertNoEvaluatorStateForBoundaryAbstention(directory);
  const artifact = buildBoundaryAbstentionArtifact({ outcome, identity, inputs, units });
  await publishCanonicalJsonAtomic(
    path.join(directory, ARM_ABSTENTION_FILE),
    artifact,
    "Fixture 026 RSD-T02 boundary abstention",
  );
  const stored = await readBoundaryAbstentionState({ directory, identity, inputs, units });
  await assertNoEvaluatorStateForBoundaryAbstention(directory);
  return stored;
}

function boundaryAbstentionExecution(directory, state, replayed) {
  const artifact = state.artifact;
  return Object.freeze({
    directory,
    complete: false,
    boundary_status: "abstained",
    run_id: artifact.run_id,
    packet_ordinal: artifact.packet_ordinal,
    seed: artifact.seed,
    system_slot: artifact.system_slot,
    system_packet_sha256: artifact.system_packet_sha256,
    system_packet_utf8_bytes: artifact.system_packet_utf8_bytes,
    failed_arm_id: artifact.failed_arm_id,
    active_arm_outcomes: artifact.active_arm_outcomes,
    boundary_receipt_sha256: artifact.boundary_receipt_sha256,
    boundary_receipts_sha256: artifact.boundary_receipts_sha256,
    boundary_invocations: artifact.boundary_invocations,
    boundary_abstention_path: canonicalRepositoryPath(state.path),
    boundary_abstention_sha256: artifact.abstention_sha256,
    boundary_abstention_file_sha256: state.file_sha256,
    replayed_boundary_abstention: replayed,
    evaluator_ledger_opened: false,
    raw_ledger_opened: false,
    authority: artifact.authority,
    claim_eligible: false,
    comparison_inference_permitted: false,
    result_label: "NO_RESULT",
    no_result: true,
  });
}

export class Fixture026RsdT02PolicyBoundaryAbstentionError extends Error {
  constructor(outcome) {
    super("Fixture 026 RSD-T02 isolated policy bank abstained before evaluator execution.");
    this.name = "Fixture026RsdT02PolicyBoundaryAbstentionError";
    this.code = "FIXTURE_026_RSD_T02_POLICY_BOUNDARY_ABSTENTION";
    this.outcome = outcome;
  }
}

async function expectedArmCommitment(inputs, units, timeoutMs = DEFAULT_POLICY_TIMEOUT_MS) {
  const outcome = await buildFixture026RsdT02IsolatedArmCommitment({
    profile: inputs.profile,
    packetInputs: armPacketInputs(inputs, units),
    config: inputs.armConfig,
    policyConfigUtf8: inputs.armConfigUtf8,
    timeoutMs,
  });
  if (outcome.status !== "completed") {
    throw new Fixture026RsdT02PolicyBoundaryAbstentionError(outcome);
  }
  assertFixture026RsdT02ArmCommitment(outcome.commitment);
  return outcome;
}

function armPacketRecordForUnit(commitment, unit) {
  const systemSlot = FIXTURE_026_RSD_T02_RECIPES.findIndex(
    ({ recipe_id: recipeId }) => recipeId === unit.recipe_id,
  );
  const record = commitment.packet_records.find((candidate) => (
    candidate.seed === unit.seed && candidate.system_slot === systemSlot
  ));
  if (!record) throw new Error("Fixture 026 RSD-T02 work unit lacks a pre-evaluator arm packet.");
  return record;
}

function workUnitKey(unit) {
  return `${unit.run_id}:${unit.profile}:${unit.seed}:${unit.recipe_id}:${unit.execution_id}`;
}

function assertOrderedPrefix(records, units) {
  if (records.length > units.length) throw new Error("Fixture 026 RSD-T02 ledger exceeds the frozen work grid.");
  for (const [index, record] of records.entries()) {
    if (fixture026RsdT02WorkKey(record) !== workUnitKey(units[index])) {
      throw new Error("Fixture 026 RSD-T02 ledger is not an exact ordered work-grid prefix.");
    }
  }
  return records;
}

function interventionCosts(command, transcript) {
  const family = command.intervention_family;
  return Object.freeze({
    episodes: 1,
    sample_rows: transcript.samples.length,
    serialized_observation_bytes: transcript.projection_utf8_bytes,
    input_commands: fixture026RsdT02InputCommandCount(command),
    internal_resets: family === "opaque-state-reset" ? 1 : 0,
    internal_freezes: family === "opaque-state-freeze" ? 1 : 0,
    output_clamps: family === "reported-output-clamp" ? 1 : 0,
    channel_switches: command.schedule.kind === "two-pulse-channel-restimulation"
      && command.schedule.first_channel !== command.schedule.second_channel ? 1 : 0,
    state_writes: family === "opaque-state-reset" ? 1 : 0,
    scalar_operations: null,
    transcendental_evaluations: null,
    retained_state_bytes: 16,
    parameter_bytes: null,
    tuning_trials: 0,
    wall_seconds: null,
    later_joules: null,
  });
}

function eventBody(unit, inputs, identity) {
  const command = buildFixture026RsdT02EpisodeCommand(unit);
  const transcript = assertFixture026RsdT02Transcript(generateFixture026RsdT02Transcript(command));
  const commitment = buildFixture026RsdT02FrozenResponse({
    executionId: command.execution_id,
    projectionSha256: transcript.projection_sha256,
  });
  // The response commitment is deliberately complete before evaluator truth is opened.
  const evaluation = assertFixture026RsdT02Evaluation(
    evaluateFixture026RsdT02Transcript(transcript, commitment),
  );
  const transcriptSha256 = sha256Hex(canonicalize(transcript));
  return {
    schema: 1,
    contract_version: FIXTURE_026_RSD_T02_EVENT_VERSION,
    artifact: "fixture-026",
    track: "RSD-T02",
    run_id: identity.run_id,
    profile: inputs.profile,
    partition: "public-development",
    seed: unit.seed,
    execution_id: command.execution_id,
    work_key: workUnitKey(unit),
    command_id: command.command_id,
    recipe_id: command.recipe_id,
    equation_id: command.equation_id,
    initialization_id: command.initialization_id,
    episode_id: command.episode_id,
    intervention_family: command.intervention_family,
    regime_membership: [...command.regime_membership],
    background_u: command.background_u,
    time_constant_s: command.time_constant_s,
    schedule_sha256: fixture026RsdT02ScheduleSha256(command),
    transcript_sha256: transcriptSha256,
    reported_output_sha256: transcript.reported_output_sha256,
    internal_output_sha256: transcript.internal_output_sha256,
    projection_sha256: transcript.projection_sha256,
    projection_hashes_by_actionable_arm: Object.fromEntries(
      FIXTURE_026_RSD_T02_ACTIONABLE_ARM_IDS.map((armId) => [armId, transcript.projection_sha256]),
    ),
    projection_utf8_bytes: transcript.projection_utf8_bytes,
    response: commitment.response,
    response_sha256: commitment.response_sha256,
    evaluator: evaluation,
    gate_decision: "accepted",
    cost_vector: interventionCosts(command, transcript),
    serialized_event_bytes_written: 0,
    execution_claims: [],
    excluded_claims: ["C-1561", "C-1564"],
    status: "public-development-conformance-only",
    result_label: "NO_RESULT",
    no_result: true,
    claim_eligible: false,
    comparison_inference_permitted: false,
    scientific_result: false,
    performance_result: false,
    measured_energy_present: false,
    energy_conclusion_allowed: false,
    interpretation: FIXTURE_026_RSD_T02_EVENT_INTERPRETATION,
  };
}

function chargeSerializedEventBytes(body, { sequence, previousHash }) {
  let bytes = 0;
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const payload = { ...body, serialized_event_bytes_written: bytes };
    const record = {
      ...payload,
      integrity: {
        sequence,
        previous_sha256: previousHash,
        record_sha256: sha256Hex(`${previousHash}\n${canonicalize(payload)}`),
      },
    };
    const observed = Buffer.byteLength(`${JSON.stringify(record)}\n`, "utf8");
    if (observed === bytes) return payload;
    bytes = observed;
  }
  throw new Error("Fixture 026 RSD-T02 event byte charge did not converge.");
}

function simulateWorkUnit(unit, inputs, identity, ledgerState) {
  return chargeSerializedEventBytes(eventBody(unit, inputs, identity), ledgerState);
}

function runBoundValidator(identity, inputs) {
  return (record, context = {}) => assertFixture026RsdT02Event(record, {
    ...context,
    runId: identity.run_id,
    profile: inputs.profile,
  });
}

async function semanticReplay(record, inputs, identity) {
  const expected = simulateWorkUnit({
    run_id: identity.run_id,
    profile: inputs.profile,
    seed: record.seed,
    recipe_id: record.recipe_id,
    execution_id: record.execution_id,
    episode_id: record.episode_id,
    background_u: record.background_u,
    time_constant_s: record.time_constant_s,
    regime_membership: record.regime_membership,
  }, inputs, identity, {
    sequence: record.integrity.sequence,
    previousHash: record.integrity.previous_sha256,
  });
  if (canonicalize(expected) !== canonicalize(fixture026RsdT02EventPayload(record))) {
    throw new Error(`Fixture 026 RSD-T02 semantic replay mismatch at sequence ${record.integrity.sequence}.`);
  }
  return record;
}

function assertRunShape(run) {
  if (
    !exactKeys(run, RUN_KEYS)
    || !exactKeys(run.ledger, LEDGER_KEYS)
    || run.schema !== 1
    || run.artifact !== "fixture-026"
    || run.track !== "RSD-T02"
    || !Number.isSafeInteger(run.expected_work_units)
    || run.expected_work_units < 1
    || !Number.isSafeInteger(run.ledger.records)
    || run.ledger.records < 1
    || !Number.isSafeInteger(run.ledger.completed_work_units)
    || run.ledger.completed_work_units < 1
    || !/^[0-9a-f]{64}$/u.test(run.ledger.scientific_payload_sha256)
    || !/^[0-9a-f]{64}$/u.test(run.ledger.hash_chain_sha256)
    || !/^[0-9a-f]{64}$/u.test(run.arm_commitment_sha256)
    || !/^[0-9a-f]{64}$/u.test(run.arm_commitment_file_sha256)
    || !Number.isSafeInteger(run.arm_packet_records)
    || run.arm_packet_records < 1
    || !/^[0-9a-f]{64}$/u.test(run.arm_boundary_receipts_sha256)
    || !Number.isSafeInteger(run.arm_boundary_invocations)
    || run.arm_boundary_invocations < 1
    || run.ledger.checkpoint_status !== "current"
    || run.interpretation !== RUN_INTERPRETATION
  ) throw new Error("Fixture 026 RSD-T02 run document violates its closed contract.");
  return run;
}

async function reconstructAndBindLedger({ directory, inputs, identity, run }) {
  const ledger = await openCheckpointLedger({
    artifact: "fixture-026",
    ledgerFormat: LEDGER_FORMAT,
    rawPath: path.join(directory, RAW_FILE),
    checkpointPath: path.join(directory, CHECKPOINT_FILE),
    runIdentity: identity,
    scientificPayload: fixture026RsdT02EventPayload,
    workKey: fixture026RsdT02WorkKey,
    assertRecord: runBoundValidator(identity, inputs),
  });
  const reconstructed = ledger.summary();
  if (
    reconstructed.checkpoint_status !== "current"
    || canonicalize(reconstructed) !== canonicalize(run.ledger)
  ) throw new Error("Fixture 026 RSD-T02 run ledger is not exactly bound to raw events and the current checkpoint.");
  return reconstructed;
}

function assertRun(run, {
  identity,
  directory,
  expectedWorkUnits,
  armCommitmentState,
}) {
  assertRunShape(run);
  if (
    Object.entries(identity).some(([key, value]) => canonicalize(run[key]) !== canonicalize(value))
    || run.expected_work_units !== expectedWorkUnits
    || run.ledger.records !== expectedWorkUnits
    || run.ledger.completed_work_units !== expectedWorkUnits
    || run.raw_path !== canonicalRepositoryPath(path.join(directory, RAW_FILE))
    || run.checkpoint_path !== canonicalRepositoryPath(path.join(directory, CHECKPOINT_FILE))
    || run.arm_commitment_path
      !== canonicalRepositoryPath(path.join(directory, ARM_COMMITMENT_FILE))
    || run.arm_commitment_sha256 !== armCommitmentState.commitment.commitment_sha256
    || run.arm_commitment_file_sha256 !== armCommitmentState.file_sha256
    || run.arm_packet_records !== armCommitmentState.commitment.packet_records.length
    || run.arm_boundary_receipts_sha256
      !== armCommitmentState.boundary_receipts_sha256
    || run.arm_boundary_invocations !== armCommitmentState.boundary_invocations
  ) throw new Error("Fixture 026 RSD-T02 run identity, counts, or paths differ from current inputs.");
  return run;
}

async function readValidatedRecords(directory, identity = null, profile = null) {
  const rawPath = path.join(directory, RAW_FILE);
  const text = await readFile(rawPath, "utf8");
  if (text.includes("\r")) throw new Error("Fixture 026 RSD-T02 raw ledger forbids CRLF.");
  if (text.length > 0 && !text.endsWith("\n")) throw new Error("Fixture 026 RSD-T02 raw ledger has a torn tail.");
  const lines = text.length === 0 ? [] : text.slice(0, -1).split("\n");
  if (lines.some((line) => line.length === 0)) throw new Error("Fixture 026 RSD-T02 raw ledger contains a blank line.");
  const records = [];
  let previousHash = "0".repeat(64);
  for (const [sequence, line] of lines.entries()) {
    const record = JSON.parse(line);
    assertFixture026RsdT02Event(record, {
      sequence,
      previousHash,
      runId: identity?.run_id ?? null,
      profile,
    });
    if (record.serialized_event_bytes_written !== Buffer.byteLength(`${line}\n`, "utf8")) {
      throw new Error(`Fixture 026 RSD-T02 raw line ${sequence + 1} has a false byte charge.`);
    }
    previousHash = record.integrity.record_sha256;
    records.push(record);
  }
  return Object.freeze({
    records: Object.freeze(records),
    raw_sha256: createHash("sha256").update(text).digest("hex"),
    terminal_hash: previousHash,
  });
}

async function ensurePreEvaluatorArmCommitment({ directory, inputs, units, policyTimeoutMs }) {
  const commitmentPath = path.join(directory, ARM_COMMITMENT_FILE);
  await assertSafeRepositoryPath(commitmentPath, {
    allowMissing: true,
    finalType: "file",
    label: "Fixture 026 RSD-T02 pre-evaluator arm commitment",
  });
  const hasCommitment = await exists(commitmentPath);
  if (!hasCommitment) {
    const rawPath = path.join(directory, RAW_FILE);
    const rawHasEvaluatorRecords = await exists(rawPath) && (await stat(rawPath)).size > 0;
    if (
      rawHasEvaluatorRecords
      || await exists(path.join(directory, CHECKPOINT_FILE))
      || await exists(path.join(directory, RUN_FILE))
      || await exists(path.join(directory, SUMMARY_FILE))
    ) {
      throw new Error("Fixture 026 RSD-T02 refuses to create an arm commitment after evaluator-bearing run state exists.");
    }
  }
  const isolated = await expectedArmCommitment(inputs, units, policyTimeoutMs);
  const expected = isolated.commitment;
  if (hasCommitment) {
    const stored = assertFixture026RsdT02ArmCommitment(await loadJson(commitmentPath));
    if (canonicalize(stored) !== canonicalize(expected)) {
      throw new Error("Fixture 026 RSD-T02 stored arm commitment differs from the frozen policies and packet grid.");
    }
  } else {
    await writeJsonStable(commitmentPath, expected, { durable: true });
  }
  await assertSafeRepositoryPath(commitmentPath, {
    finalType: "file",
    label: "Fixture 026 RSD-T02 pre-evaluator arm commitment",
  });
  return Object.freeze({
    commitment: expected,
    path: commitmentPath,
    file_sha256: await fileSha256(commitmentPath),
    boundary_receipts_sha256: isolated.receipts_sha256,
    boundary_invocations: isolated.receipts.length,
  });
}

async function readBoundArmCommitment({ directory, inputs, units }) {
  const commitmentPath = path.join(directory, ARM_COMMITMENT_FILE);
  await assertSafeRepositoryPath(commitmentPath, {
    finalType: "file",
    label: "Fixture 026 RSD-T02 pre-evaluator arm commitment",
  });
  const isolated = await expectedArmCommitment(inputs, units);
  const expected = isolated.commitment;
  const stored = assertFixture026RsdT02ArmCommitment(await loadJson(commitmentPath));
  if (canonicalize(stored) !== canonicalize(expected)) {
    throw new Error("Fixture 026 RSD-T02 arm commitment is not reproducible from frozen pre-evaluator inputs.");
  }
  return Object.freeze({
    commitment: stored,
    path: commitmentPath,
    file_sha256: await fileSha256(commitmentPath),
    boundary_receipts_sha256: isolated.receipts_sha256,
    boundary_invocations: isolated.receipts.length,
  });
}

export async function executeFixture026RsdT02({
  profile,
  output,
  resume = false,
  maxWorkUnits = Infinity,
  policyTimeoutMs = DEFAULT_POLICY_TIMEOUT_MS,
}) {
  if (maxWorkUnits !== Infinity && (!Number.isSafeInteger(maxWorkUnits) || maxWorkUnits < 1)) {
    throw new Error("Fixture 026 RSD-T02 maxWorkUnits must be a positive integer or Infinity.");
  }
  if (!Number.isSafeInteger(policyTimeoutMs) || policyTimeoutMs < 1) {
    throw new Error("Fixture 026 RSD-T02 policyTimeoutMs must be a positive integer.");
  }
  const inputs = await loadInputs(profile);
  const identity = runIdentity(inputs);
  const units = allWorkUnits(inputs, identity);
  const directory = outputDirectory(output);
  await assertSafeRepositoryPath(directory, { allowMissing: true, finalType: "directory" });
  const parentDirectory = path.dirname(directory);
  await assertSafeRepositoryPath(parentDirectory, { allowMissing: true, finalType: "directory" });
  await mkdir(parentDirectory, { recursive: true });
  await assertSafeRepositoryPath(parentDirectory, { finalType: "directory" });
  const lockPath = fixture026RsdT02RunLockPath(directory);
  await assertSafeRepositoryPath(lockPath, {
    allowMissing: true,
    finalType: "file",
    label: "Fixture 026 RSD-T02 exclusive run lease",
  });
  const lease = await acquireFixture026RsdT02RunLock({
    outputDirectory: directory,
    runnerId: FIXTURE_026_RSD_T02_RUNNER_VERSION,
  });
  try {
  const present = await exists(directory);
  if (present && !resume) throw new Error("Fixture 026 RSD-T02 output exists; use resume.");
  if (!present && resume) throw new Error("Fixture 026 RSD-T02 cannot resume a missing output directory.");
  if (!present) {
    await mkdir(path.dirname(directory), { recursive: true });
    await mkdir(directory);
  } else if (!(await stat(directory)).isDirectory()) throw new Error("Fixture 026 RSD-T02 output is not a directory.");
  await assertSafeRepositoryPath(directory, { finalType: "directory" });
  const rawPath = path.join(directory, RAW_FILE);
  const checkpointPath = path.join(directory, CHECKPOINT_FILE);
  const runPath = path.join(directory, RUN_FILE);
  await assertSafeRunArtifacts(directory);
  const priorBoundaryAbstention = await readBoundaryAbstentionState({
    directory,
    identity,
    inputs,
    units,
  });
  if (priorBoundaryAbstention) {
    return boundaryAbstentionExecution(directory, priorBoundaryAbstention, true);
  }
  let armCommitmentState;
  try {
    armCommitmentState = await ensurePreEvaluatorArmCommitment({
      directory,
      inputs,
      units,
      policyTimeoutMs,
    });
  } catch (error) {
    if (!(error instanceof Fixture026RsdT02PolicyBoundaryAbstentionError)) throw error;
    const boundaryAbstention = await persistBoundaryAbstention({
      directory,
      outcome: error.outcome,
      identity,
      inputs,
      units,
    });
    return boundaryAbstentionExecution(directory, boundaryAbstention, false);
  }
  const armCommitment = armCommitmentState.commitment;
  if (await exists(runPath)) {
    assertRun(await loadJson(runPath), {
      identity,
      directory,
      expectedWorkUnits: units.length,
      armCommitmentState,
    });
  }
  const ledger = await openCheckpointLedger({
    artifact: "fixture-026",
    ledgerFormat: LEDGER_FORMAT,
    rawPath,
    checkpointPath,
    runIdentity: identity,
    scientificPayload: fixture026RsdT02EventPayload,
    workKey: fixture026RsdT02WorkKey,
    assertRecord: runBoundValidator(identity, inputs),
  });
  if (ledger.summary().records > 0) {
    const raw = await readValidatedRecords(directory, identity, profile);
    assertOrderedPrefix(raw.records, units);
    for (const record of raw.records) await semanticReplay(record, inputs, identity);
  }
  const remaining = remainingWorkUnits(units, ledger.completedWorkKeys(), workUnitKey);
  for (const unit of remaining.slice(0, maxWorkUnits)) {
    const state = ledger.summary();
    const record = await ledger.append(simulateWorkUnit(unit, inputs, identity, {
      sequence: state.records,
      previousHash: state.hash_chain_sha256,
    }));
    if (record.serialized_event_bytes_written !== Buffer.byteLength(`${JSON.stringify(record)}\n`, "utf8")) {
      throw new Error("Fixture 026 RSD-T02 appended event byte charge differs.");
    }
    await ledger.saveCheckpoint();
  }
  const complete = ledger.summary().completed_work_units === units.length;
  if (!complete) return Object.freeze({
    directory,
    complete: false,
    run_id: identity.run_id,
    ledger: ledger.summary(),
    result_label: "NO_RESULT",
    no_result: true,
  });
  if (ledger.summary().checkpoint_status !== "current") await ledger.saveCheckpoint();
  const run = {
    ...identity,
    expected_work_units: units.length,
    ledger: ledger.summary(),
    raw_path: canonicalRepositoryPath(rawPath),
    checkpoint_path: canonicalRepositoryPath(checkpointPath),
    arm_commitment_path: canonicalRepositoryPath(armCommitmentState.path),
    arm_commitment_sha256: armCommitment.commitment_sha256,
    arm_commitment_file_sha256: armCommitmentState.file_sha256,
    arm_packet_records: armCommitment.packet_records.length,
    arm_boundary_receipts_sha256: armCommitmentState.boundary_receipts_sha256,
    arm_boundary_invocations: armCommitmentState.boundary_invocations,
    interpretation: RUN_INTERPRETATION,
  };
  assertRun(run, {
    identity,
    directory,
    expectedWorkUnits: units.length,
    armCommitmentState,
  });
  await writeJsonStable(runPath, run);
  await assertSafeRepositoryPath(runPath, {
    finalType: "file",
    label: `Fixture 026 RSD-T02 ${RUN_FILE}`,
  });
  return Object.freeze({ directory, complete: true, run, result_label: "NO_RESULT", no_result: true });
  } finally {
    await lease.release();
  }
}

async function pairMatrixForSeed(seed, profile) {
  const units = buildFixture026RsdT02WorkUnits({ profile, seeds: [seed] });
  const rows = [];
  for (const certificate of FIXTURE_026_RSD_T02_PAIR_CERTIFICATES) {
    const episodeId = certificate.separating_episode_id ?? "RAMP-LIN-UP-0P5";
    const executionId = `O1-${episodeId}`;
    const transcripts = [certificate.left_recipe_id, certificate.right_recipe_id].map((recipeId) => {
      const unit = units.find((candidate) => (
        candidate.recipe_id === recipeId && candidate.execution_id === executionId
      ));
      return generateFixture026RsdT02Transcript(buildFixture026RsdT02EpisodeCommand(unit));
    });
    const evaluated = evaluateFixture026RsdT02Pair(transcripts[0], transcripts[1]);
    rows.push(Object.freeze({
      seed,
      pair_id: certificate.pair_id,
      episode_id: episodeId,
      expected_status: certificate.full_panel_status,
      observed_status: evaluated.status,
      distance_infinity: evaluated.distance_infinity,
      numerical_refinement_error: evaluated.numerical_refinement_error,
      certified_lower_bound: evaluated.certified_lower_bound,
      certificate_status: evaluated.certificate_status,
    }));
  }
  return Object.freeze(rows);
}

async function matchedStepPairMatrixForSeed(seed, profile) {
  const units = buildFixture026RsdT02WorkUnits({ profile, seeds: [seed] }).filter(
    ({ regime_membership: membership }) => membership[0] === "O0-MATCHED-STEP",
  );
  const transcripts = new Map(units.map((unit) => [
    `${unit.execution_id}:${unit.recipe_id}`,
    generateFixture026RsdT02Transcript(buildFixture026RsdT02EpisodeCommand(unit)),
  ]));
  const rows = [];
  for (const descriptor of buildFixture026RsdT02ExecutionDescriptors().filter(
    ({ regime_membership: membership }) => membership[0] === "O0-MATCHED-STEP",
  )) {
    for (let leftIndex = 0; leftIndex < FIXTURE_026_RSD_T02_RECIPES.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < FIXTURE_026_RSD_T02_RECIPES.length; rightIndex += 1) {
        const leftId = FIXTURE_026_RSD_T02_RECIPES[leftIndex].recipe_id;
        const rightId = FIXTURE_026_RSD_T02_RECIPES[rightIndex].recipe_id;
        const evaluated = evaluateFixture026RsdT02MatchedStepPair(
          transcripts.get(`${descriptor.execution_id}:${leftId}`),
          transcripts.get(`${descriptor.execution_id}:${rightId}`),
        );
        rows.push(Object.freeze({ seed, ...evaluated }));
      }
    }
  }
  return Object.freeze(rows);
}

function sumCost(records, field) {
  return records.reduce((sum, record) => sum + (record.cost_vector[field] ?? 0), 0);
}

function summarizeArmBank(commitment) {
  const responses = commitment.packet_records.flatMap((record) => record.active_arm_responses);
  const byArm = Object.fromEntries(FIXTURE_026_RSD_T02_ACTIVE_ARM_IDS.map((armId) => {
    const armResponses = responses.filter(({ arm_id: responseArmId }) => responseArmId === armId);
    return [armId, {
      packet_responses: armResponses.length,
      shared_acquisition_per_packet: armResponses[0].resource_ledger.shared_acquisition,
      policy_construction: armResponses[0].resource_ledger.policy_construction,
      decisions: Object.fromEntries(FIXTURE_026_RSD_T02_PROPERTY_KEYS.map((key) => [
        key,
        {
          decide: armResponses.filter((response) => response.properties[key].action === "decide").length,
          abstain: armResponses.filter((response) => response.properties[key].action === "abstain").length,
        },
      ])),
      scalar_operations: armResponses.reduce(
        (sum, response) => sum + response.resource_ledger.inference.actual.scalar_operations,
        0,
      ),
      packet_traversal_scalar_operations: armResponses.reduce(
        (sum, response) => sum
          + response.resource_ledger.inference.actual.packet_traversal_scalar_operations,
        0,
      ),
      policy_sample_rows_read: armResponses.reduce(
        (sum, response) => sum
          + response.resource_ledger.inference.actual.policy_sample_rows_read,
        0,
      ),
      transcendental_evaluations: armResponses.reduce(
        (sum, response) => sum + response.resource_ledger.inference.actual.transcendental_evaluations,
        0,
      ),
      retained_state_bytes_peak: Math.max(...armResponses.map(
        (response) => response.resource_ledger.inference.actual.retained_state_bytes,
      )),
      influential_parameter_bytes_peak: Math.max(...armResponses.map(
        (response) => response.resource_ledger.inference.actual.influential_parameter_bytes,
      )),
      tuning_trials: 0,
      training_labels_seen: 0,
      wall_seconds: null,
      later_joules: null,
    }];
  }));
  return Object.freeze({
    contract_version: commitment.contract_version,
    commitment_sha256: commitment.commitment_sha256,
    packet_records: commitment.packet_records.length,
    active_arm_ids: commitment.active_arm_ids,
    inactive_arm_ids: commitment.inactive_arm_ids,
    response_frozen_before_any_packet_evaluator: true,
    exact_information_parity: commitment.packet_records.every((record) => (
      new Set(record.active_arm_responses.map(
        ({ information_ledger: ledger }) => canonicalize(ledger),
      )).size === 1
    )),
    identical_common_caps_without_padding: commitment.packet_records.every((record) => (
      new Set(record.active_arm_responses.map(
        ({ resource_ledger: ledger }) => ledger.common_caps_sha256,
      )).size === 1
    )),
    three_resource_ledgers_closed: responses.every((response) => (
      response.resource_ledger.shared_acquisition.sample_rows_acquired === 53795
      && response.resource_ledger.policy_construction.training_labels_seen === 0
      && response.resource_ledger.policy_construction.tuning_trials === 0
      && response.resource_ledger.inference.actual.sample_rows_validated === 53795
      && response.compatible_property_vectors.length > 0
    )),
    inactive_roles_force_abstention: commitment.packet_records.every((record) => (
      record.inactive_arm_responses.every((response) => response.action === "abstain")
    )),
    training_labels_seen: 0,
    tuning_trials: 0,
    comparator_maturity_claimed: false,
    by_arm: byArm,
    comparison_inference_permitted: false,
    claim_eligible: false,
    result_label: "NO_RESULT",
  });
}

function assertAnalysis(summary) {
  if (
    !exactKeys(summary, ANALYSIS_KEYS)
    || summary.schema !== 1
    || summary.contract_version !== "fixture-026.rsd-t02-analysis.v1"
    || summary.artifact !== "fixture-026"
    || summary.track !== "RSD-T02"
    || summary.decision !== "contract-validation-pass"
    || summary.result_label !== "NO_RESULT"
    || summary.no_result !== true
    || summary.claim_eligible !== false
    || summary.comparison_inference_permitted !== false
    || summary.scientific_result !== false
    || summary.performance_result !== false
    || summary.measured_energy_present !== false
    || summary.energy_conclusion_allowed !== false
  ) throw new Error("Fixture 026 RSD-T02 analysis violates its closed authority contract.");
  return summary;
}

export async function computeFixture026RsdT02Analysis(output) {
  const directory = outputDirectory(output);
  await assertSafeRunArtifacts(directory, { complete: true });
  const run = assertRunShape(await loadJson(path.join(directory, RUN_FILE)));
  const inputs = await loadInputs(run.profile);
  const identity = runIdentity(inputs);
  const units = allWorkUnits(inputs, identity);
  const armCommitmentState = await readBoundArmCommitment({ directory, inputs, units });
  const armCommitment = armCommitmentState.commitment;
  assertRun(run, {
    identity,
    directory,
    expectedWorkUnits: units.length,
    armCommitmentState,
  });
  const reconstructedLedger = await reconstructAndBindLedger({ directory, inputs, identity, run });
  const raw = await readValidatedRecords(directory, identity, run.profile);
  if (
    raw.records.length !== reconstructedLedger.records
    || raw.terminal_hash !== reconstructedLedger.hash_chain_sha256
  ) throw new Error("Fixture 026 RSD-T02 raw ledger differs from its reconstructed ledger authority.");
  assertOrderedPrefix(raw.records, units);
  if (raw.records.length !== units.length) throw new Error("Fixture 026 RSD-T02 run is incomplete.");
  for (const record of raw.records) await semanticReplay(record, inputs, identity);
  const aggregation = Object.freeze(inputs.seeds.flatMap((seed) => (
    FIXTURE_026_RSD_T02_RECIPES.flatMap(({ recipe_id: recipeId }) => (
      ["O0-MATCHED-STEP", "O1-FULL-PANEL"].map((regimeId) => {
        const systemUnits = units.filter((unit) => (
          unit.seed === seed
          && unit.recipe_id === recipeId
          && unit.regime_membership[0] === regimeId
        ));
        const systemRecords = raw.records.filter((record) => (
          record.seed === seed
          && record.recipe_id === recipeId
          && record.regime_membership[0] === regimeId
        ));
        const expectedCells = systemUnits.map((unit) => {
          const command = buildFixture026RsdT02EpisodeCommand(unit);
          return { work_key: workUnitKey(unit), initialization_id: command.initialization_id };
        });
        return Object.freeze({
          seed,
          recipe_id: recipeId,
          ...aggregateFixture026RsdT02System({
            expected_cells: expectedCells,
            records: systemRecords,
            observation_regime_id: regimeId,
            true_recipe_id: recipeId,
          }),
        });
      })
    ))
  )));
  const pairMatrix = Object.freeze((await Promise.all(
    inputs.seeds.map((seed) => pairMatrixForSeed(seed, run.profile)),
  )).flat());
  const matchedStepPairMatrix = Object.freeze((await Promise.all(
    inputs.seeds.map((seed) => matchedStepPairMatrixForSeed(seed, run.profile)),
  )).flat());
  const armBank = summarizeArmBank(armCommitment);
  const bySeed = (seed) => raw.records.filter((record) => record.seed === seed);
  const checks = {
    exact_work_grid_cardinality: raw.records.length === inputs.seeds.length * 175,
    every_seed_has_45_o0_records: inputs.seeds.every((seed) => (
      bySeed(seed).filter((record) => record.regime_membership[0] === "O0-MATCHED-STEP").length === 45
    )),
    every_seed_has_130_o1_records: inputs.seeds.every((seed) => (
      bySeed(seed).filter((record) => record.regime_membership[0] === "O1-FULL-PANEL").length === 130
    )),
    every_record_has_1537_samples: raw.records.every((record) => record.evaluator.sample_count === 1537),
    schedule_and_half_open_masks_validate: raw.records.every((record) => (
      record.evaluator.schedule_semantics_valid
      && record.evaluator.maximum_input_schedule_residual_u <= 1e-14
    )),
    initialization_and_matched_steps_validate: raw.records.every((record) => (
      record.evaluator.initialization_residual <= 1e-12
      && (record.intervention_family !== "canonical-step" || record.evaluator.canonical_step_residual <= 1e-10)
    )),
    all_actionable_arms_receive_one_projection_hash: raw.records.every((record) => (
      Object.values(record.projection_hashes_by_actionable_arm).every(
        (hash) => hash === record.projection_sha256,
      )
    )),
    arm_bank_is_precommitted_and_bound_before_evaluator: units.every((unit) => (
      armPacketRecordForUnit(armCommitment, unit).system_packet_sha256.length === 64
    )) && run.arm_commitment_sha256 === armCommitment.commitment_sha256,
    active_arm_information_and_caps_are_exactly_equal: armBank.exact_information_parity
      && armBank.identical_common_caps_without_padding,
    active_arm_acquisition_construction_and_inference_ledgers_are_closed:
      armBank.three_resource_ledgers_closed,
    inactive_arm_roles_force_visible_abstention: armBank.inactive_roles_force_abstention,
    arm_policies_use_no_labels_or_tuning: armBank.training_labels_seen === 0
      && armBank.tuning_trials === 0,
    bounded_comparator_references_are_not_called_mature: armBank.comparator_maturity_claimed === false,
    response_precedes_evaluator_and_oracle_is_excluded: raw.records.every((record) => (
      record.response.evaluator_oracle_access === false
      && record.evaluator.evaluator_id === "O-GRAPH"
      && record.evaluator.evaluator_opened_after_response === true
      && record.evaluator.response_commitment_sha256 === record.response_sha256
    )),
    system_grid_complete_without_silent_deletion: aggregation.length === inputs.seeds.length * 10
      && aggregation.every((row) => row.decision === "construction-complete" && row.reason_codes.length === 0),
    every_conditioned_matched_step_pair_is_equivalent: matchedStepPairMatrix.length
      === inputs.seeds.length * 9 * 10
      && matchedStepPairMatrix.every((row) => row.matched_step_status === "equivalent"),
    exact_registered_pair_matrix_reproduced: pairMatrix.length === inputs.seeds.length * 10
      && pairMatrix.every((row) => row.expected_status === row.observed_status),
    cost_vector_is_separate_and_unmeasured_fields_stay_null: raw.records.every((record) => (
      record.cost_vector.scalar_operations === null
      && record.cost_vector.transcendental_evaluations === null
      && record.cost_vector.wall_seconds === null
      && record.cost_vector.later_joules === null
    )),
    authority_is_uniform_no_result: raw.records.every((record) => (
      record.result_label === "NO_RESULT"
      && record.no_result === true
      && record.execution_claims.length === 0
      && canonicalize(record.excluded_claims) === canonicalize(["C-1561", "C-1564"])
      && record.claim_eligible === false
      && record.comparison_inference_permitted === false
      && record.scientific_result === false
      && record.performance_result === false
      && record.measured_energy_present === false
      && record.energy_conclusion_allowed === false
    )),
    o2_and_floor_remain_non_executable: run.observation_regimes_not_executed[0] === "O2-SELECT6"
      && run.floor_runtime_state === "foundation-only-not-executed",
  };
  const passed = Object.values(checks).every(Boolean);
  const summary = {
    schema: 1,
    contract_version: "fixture-026.rsd-t02-analysis.v1",
    artifact: "fixture-026",
    track: "RSD-T02",
    run_id: run.run_id,
    profile: run.profile,
    seeds: inputs.seeds,
    expected_records: units.length,
    observed_records: raw.records.length,
    records_per_seed: 175,
    o0_records_per_seed: 45,
    o1_records_per_seed: 130,
    sample_rows_per_record: 1537,
    system_aggregation: aggregation,
    matched_step_pair_matrix: matchedStepPairMatrix,
    pair_matrix: pairMatrix,
    cost_totals: {
      episodes: sumCost(raw.records, "episodes"),
      sample_rows: sumCost(raw.records, "sample_rows"),
      serialized_observation_bytes: sumCost(raw.records, "serialized_observation_bytes"),
      input_commands: sumCost(raw.records, "input_commands"),
      internal_resets: sumCost(raw.records, "internal_resets"),
      internal_freezes: sumCost(raw.records, "internal_freezes"),
      output_clamps: sumCost(raw.records, "output_clamps"),
      channel_switches: sumCost(raw.records, "channel_switches"),
      state_writes: sumCost(raw.records, "state_writes"),
      retained_state_bytes_peak_per_record: Math.max(...raw.records.map((record) => record.cost_vector.retained_state_bytes)),
      tuning_trials: sumCost(raw.records, "tuning_trials"),
      scalar_operations: null,
      transcendental_evaluations: null,
      parameter_bytes: null,
      wall_seconds: null,
      later_joules: null,
    },
    arm_bank: armBank,
    checks,
    decision: passed ? "contract-validation-pass" : "contract-validation-fail",
    result_label: "NO_RESULT",
    no_result: true,
    claim_eligible: false,
    comparison_inference_permitted: false,
    scientific_result: false,
    performance_result: false,
    measured_energy_present: false,
    energy_conclusion_allowed: false,
    interpretation: RUN_INTERPRETATION,
  };
  if (!passed) throw new Error("Fixture 026 RSD-T02 construction analysis failed.");
  return assertAnalysis(summary);
}

export async function analyzeFixture026RsdT02(output) {
  const directory = outputDirectory(output);
  const summary = await computeFixture026RsdT02Analysis(output);
  const analysisDirectory = path.join(directory, "analysis");
  const summaryPath = path.join(directory, SUMMARY_FILE);
  await assertSafeRepositoryPath(analysisDirectory, {
    allowMissing: true,
    finalType: "directory",
    label: "Fixture 026 RSD-T02 analysis directory",
  });
  await mkdir(analysisDirectory, { recursive: true });
  await assertSafeRepositoryPath(analysisDirectory, {
    finalType: "directory",
    label: "Fixture 026 RSD-T02 analysis directory",
  });
  await assertSafeRepositoryPath(summaryPath, {
    allowMissing: true,
    finalType: "file",
    label: "Fixture 026 RSD-T02 analysis summary",
  });
  await writeJsonStable(summaryPath, summary);
  await assertSafeRepositoryPath(summaryPath, {
    finalType: "file",
    label: "Fixture 026 RSD-T02 analysis summary",
  });
  return summary;
}

export async function validateFixture026RsdT02Output(output) {
  const directory = outputDirectory(output);
  await assertSafeRepositoryPath(path.join(directory, SUMMARY_FILE), {
    finalType: "file",
    label: "Fixture 026 RSD-T02 analysis summary",
  });
  const [expected, stored] = await Promise.all([
    computeFixture026RsdT02Analysis(output),
    loadJson(path.join(directory, SUMMARY_FILE)),
  ]);
  assertAnalysis(stored);
  if (canonicalize(expected) !== canonicalize(stored)) {
    throw new Error("Fixture 026 RSD-T02 stored analysis is not reproducible from raw events.");
  }
  return Object.freeze({
    valid: true,
    run_id: stored.run_id,
    decision: stored.decision,
    result_label: "NO_RESULT",
    no_result: true,
  });
}

export async function prepareFixture026RsdT02(profile) {
  const inputs = await loadInputs(profile);
  const identity = runIdentity(inputs);
  const units = allWorkUnits(inputs, identity);
  return Object.freeze({
    valid: true,
    artifact: "fixture-026",
    track: "RSD-T02",
    profile,
    seeds: inputs.seeds.length,
    seed_scope: "bounded-ordered-prefix-construction-conformance",
    source_seed_count: inputs.sourceSeedCount,
    construction_seed_count: inputs.constructionSeedCount,
    configured_work_units: inputs.configuredWorkUnits,
    full_public_development_pack_executed: false,
    executions_per_recipe_per_seed: buildFixture026RsdT02ExecutionDescriptors().length,
    recipes: FIXTURE_026_RSD_T02_RECIPES.length,
    work_units: units.length,
    o0_records_per_seed: 45,
    o1_records_per_seed: 130,
    o2_executed: false,
    floor_executed: false,
    arm_packet_records: inputs.seeds.length * FIXTURE_026_RSD_T02_RECIPES.length,
    arm_responses: inputs.seeds.length
      * FIXTURE_026_RSD_T02_RECIPES.length
      * FIXTURE_026_RSD_T02_ACTIVE_ARM_IDS.length,
    actionable_arms_implemented: FIXTURE_026_RSD_T02_ACTIVE_ARM_IDS,
    actionable_arms_not_implemented: FIXTURE_026_RSD_T02_INACTIVE_ARM_IDS,
    arm_policy_authority: "bounded-pre-evaluator-conformance-references-not-mature-comparators",
    arm_policy_execution_boundary: FIXTURE_026_RSD_T02_ISOLATED_POLICY_VERSION,
    isolated_policy_children: inputs.seeds.length * FIXTURE_026_RSD_T02_RECIPES.length,
    policy_bundle_sha256: inputs.policyArtifactSha256,
    policy_bundle_inventory_sha256: inputs.policyBundleInventorySha256,
    policy_source_inventory_sha256: inputs.policySourceInventorySha256,
    result_label: "NO_RESULT",
    no_result: true,
    claim_eligible: false,
    comparison_inference_permitted: false,
  });
}

function parseOptions(argv) {
  const action = argv[2];
  if (!new Set(["t02-prepare", "t02-smoke", "t02-run", "t02-analyze", "t02-validate"]).has(action)) {
    throw new Error("Fixture 026 RSD-T02 action is invalid.");
  }
  if ((argv.length - 3) % 2 !== 0) throw new Error("Fixture 026 RSD-T02 options require name/value pairs.");
  const options = {};
  for (let index = 3; index < argv.length; index += 2) {
    const token = argv[index];
    const value = argv[index + 1];
    if (!/^--[a-z][a-z-]*$/u.test(token ?? "") || !value || value.startsWith("--")) {
      throw new Error("Fixture 026 RSD-T02 option syntax is invalid.");
    }
    const key = token.slice(2);
    if (!new Set(["profile", "output", "resume"]).has(key) || Object.hasOwn(options, key)) {
      throw new Error(`Fixture 026 RSD-T02 option is unknown or duplicated: ${token}`);
    }
    options[key] = value;
  }
  if (action === "t02-prepare") {
    if (!new Set(["smoke", "development"]).has(options.profile) || options.output || options.resume) {
      throw new Error("t02-prepare requires only --profile smoke|development.");
    }
  } else if (new Set(["t02-smoke", "t02-run"]).has(action)) {
    const expectedProfile = action === "t02-smoke" ? "smoke" : "development";
    if (options.profile !== expectedProfile || !options.output || !new Set([undefined, "true", "false"]).has(options.resume)) {
      throw new Error(`${action} requires --profile ${expectedProfile}, --output, and optional --resume true|false.`);
    }
  } else if (!options.output || options.profile || options.resume) {
    throw new Error(`${action} requires only --output.`);
  }
  return { action, options };
}

export async function mainFixture026RsdT02(argv = process.argv) {
  const { action, options } = parseOptions(argv);
  if (action === "t02-prepare") return prepareFixture026RsdT02(options.profile);
  if (action === "t02-smoke") {
    await executeFixture026RsdT02({
      profile: "smoke",
      output: options.output,
      resume: options.resume === "true",
    });
    await analyzeFixture026RsdT02(options.output);
    return validateFixture026RsdT02Output(options.output);
  }
  if (action === "t02-run") return executeFixture026RsdT02({
    profile: "development",
    output: options.output,
    resume: options.resume === "true",
  });
  if (action === "t02-analyze") return analyzeFixture026RsdT02(options.output);
  return validateFixture026RsdT02Output(options.output);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  mainFixture026RsdT02().then(
    (result) => process.stdout.write(`${JSON.stringify(result)}\n`),
    (error) => {
      process.stderr.write(`${error.stack ?? error.message}\n`);
      process.exitCode = 1;
    },
  );
}
