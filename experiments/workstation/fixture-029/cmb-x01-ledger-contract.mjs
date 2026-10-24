import {
  CMB_X01_ARMS,
  CMB_X01_FAMILIES,
  CMB_X01_SMOKE_CONFIG,
  validateCmbX01Config,
} from "./cmb-x01-generator.mjs";
import {
  assertCmbX01ConstructionRecord,
  canonicalCmbX01,
  exactKeys,
  sha256CmbX01,
} from "./cmb-x01-contract.mjs";

export const CMB_X01_LEDGER_CONTRACT_VERSION =
  "fixture-029.cmb-x01-public-development-ledger-event.v3";

export const CMB_X01_LEDGER_FORMAT =
  "fixture-029.cmb-x01-public-development-ledger.v3";

const RECORD_KEYS = Object.freeze([
  "schema",
  "ledger_contract_version",
  "artifact",
  "track",
  "claim_scope",
  "run_id",
  "profile",
  "partition",
  "seed",
  "world_index",
  "world_id",
  "generator_family",
  "arm",
  "work_key",
  "construction",
  "result_label",
  "no_result",
  "measured_energy_present",
  "energy_conclusion_allowed",
  "comparison_inference_permitted",
  "claim_eligible",
  "scientific_result",
  "performance_result",
  "integrity",
]);

const LEDGER_INTEGRITY_KEYS = Object.freeze([
  "sequence", "previous_sha256", "record_sha256",
]);

function hash64(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
}

export function cmbX01WorkKey(value) {
  return [
    value?.track,
    value?.seed,
    value?.world_index,
    value?.generator_family,
    value?.arm,
  ].join("/");
}

export function cmbX01LedgerScientificPayload(record) {
  const payload = { ...record };
  delete payload.integrity;
  return payload;
}

/**
 * Validate one outer ledger event and re-run the complete inner construction
 * contract.  `record.integrity` belongs only to the append-only ledger;
 * `record.construction.integrity.payload_sha256` remains the independently
 * recomputed core payload digest.
 */
export function assertCmbX01LedgerRecord(record, {
  config = CMB_X01_SMOKE_CONFIG,
  runId = null,
  sequence = null,
  previousHash = null,
} = {}) {
  const checked = validateCmbX01Config(config);
  const construction = record?.construction;
  const integrity = record?.integrity;
  let expectedRecordHash = null;
  if (hash64(integrity?.previous_sha256)) {
    try {
      expectedRecordHash = sha256CmbX01(
        `${integrity.previous_sha256}\n${canonicalCmbX01(cmbX01LedgerScientificPayload(record))}`,
      );
    } catch {
      expectedRecordHash = null;
    }
  }

  // This is deliberately not replaced by trusting either digest layer.
  // Every raw-ledger read executes the complete core validator again.
  assertCmbX01ConstructionRecord(construction, { config: checked });

  const expectedWorkKey = cmbX01WorkKey(record);
  if (
    !exactKeys(record, RECORD_KEYS)
    || !exactKeys(integrity, LEDGER_INTEGRITY_KEYS)
    || record.schema !== 1
    || record.ledger_contract_version !== CMB_X01_LEDGER_CONTRACT_VERSION
    || record.artifact !== "fixture-029"
    || record.track !== "CMB-X01"
    || canonicalCmbX01(record.claim_scope) !== canonicalCmbX01(["C-1574"])
    || !hash64(record.run_id)
    || (runId !== null && record.run_id !== runId)
    || record.profile !== checked.profile
    || record.partition !== "public-development-only"
    || !Number.isSafeInteger(record.seed)
    || record.seed < 0
    || record.seed > 0xffff_ffff
    || !Number.isSafeInteger(record.world_index)
    || record.world_index < 0
    || !hash64(record.world_id)
    || !CMB_X01_FAMILIES.includes(record.generator_family)
    || !CMB_X01_ARMS.includes(record.arm)
    || record.work_key !== expectedWorkKey
    || construction.artifact !== record.artifact
    || construction.track !== record.track
    || construction.profile !== record.profile
    || construction.seed !== record.seed
    || construction.world_index !== record.world_index
    || construction.world_id !== record.world_id
    || construction.generator_family !== record.generator_family
    || construction.arm !== record.arm
    || record.result_label !== "NO_RESULT"
    || record.no_result !== true
    || record.measured_energy_present !== false
    || record.energy_conclusion_allowed !== false
    || record.comparison_inference_permitted !== false
    || record.claim_eligible !== false
    || record.scientific_result !== false
    || record.performance_result !== false
    || !Number.isSafeInteger(integrity.sequence)
    || integrity.sequence < 0
    || !hash64(integrity.previous_sha256)
    || !hash64(integrity.record_sha256)
    || integrity.record_sha256 !== expectedRecordHash
    || Object.hasOwn(integrity, "payload_sha256")
    || !exactKeys(construction.integrity, ["payload_sha256"])
    || (sequence !== null && integrity.sequence !== sequence)
    || (previousHash !== null && integrity.previous_sha256 !== previousHash)
  ) throw new Error("CMB-X01 ledger record violates its closed outer contract.");
  return record;
}
