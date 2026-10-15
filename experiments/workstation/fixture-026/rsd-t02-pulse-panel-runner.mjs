import { createHash } from "node:crypto";
import {
  access,
  mkdir,
  readFile,
  stat,
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
  FIXTURE_026_RSD_T02_PULSE_COST_KEYS,
  FIXTURE_026_RSD_T02_PULSE_PUBLIC_SEEDS,
  FIXTURE_026_RSD_T02_PULSE_REFRACTORY_DURATIONS_S,
  FIXTURE_026_RSD_T02_PULSE_SKIPPING_PERIODS_S,
  FIXTURE_026_RSD_T02_PULSE_VERSION,
  assertFixture026RsdT02PulseCostVector,
  constructFixture026RsdT02RefractoryDuration,
  constructFixture026RsdT02SkippingCell,
} from "./rsd-t02-pulse.mjs";
import {
  acquireFixture026RsdT02RunLock,
} from "./rsd-t02-run-lock.mjs";

export const FIXTURE_026_RSD_T02_PULSE_PANEL_RUNNER_VERSION =
  "fixture-026.rsd-t02-pulse-panel-runner.v1";
export const FIXTURE_026_RSD_T02_PULSE_PANEL_EVENT_VERSION =
  "fixture-026.rsd-t02-pulse-panel-event.v1";

const fixtureRoot = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CONFIG_PATH = path.join(fixtureRoot, "configs", "rsd-t02-pulse-panel.json");
const RUNNER_SOURCE_PATH = fileURLToPath(import.meta.url);
const CONSTRUCTOR_SOURCE_PATH = path.join(fixtureRoot, "rsd-t02-pulse.mjs");
const EVENT_SCHEMA_PATH = path.join(fixtureRoot, "rsd-t02-pulse-panel-output.schema.json");
const LEDGER_FORMAT = "fixture-026.rsd-t02-pulse-panel-ledger.v1";
const RAW_FILE = "rsd-t02-pulse-panel-events.jsonl";
const CHECKPOINT_FILE = "rsd-t02-pulse-panel-checkpoint.json";
const RUN_FILE = "rsd-t02-pulse-panel-run.json";
const HASH_PATTERN = /^[0-9a-f]{64}$/u;
const TERMINAL_STATES = new Set(["resolved", "unresolved", "out_of_support", "malformed"]);
const REFRACTORY_WORLD_IDS = Object.freeze(["PS-NFL-H4", "PS-IFFL-H4", "PS-NFL-LTI"]);
const SKIPPING_WORLD_IDS = Object.freeze([
  "PS-NFL-H4", "PS-IFFL-H4", "PS-NFL-LTI", "PS-DEADTIME", "PS-ALIAS",
]);

export const FIXTURE_026_RSD_T02_PULSE_PANEL_RUNTIME_FINGERPRINT = deepFreeze({
  schema: 1,
  node_version: process.versions.node,
  v8_version: process.versions.v8,
  uv_version: process.versions.uv,
  platform: process.platform,
  architecture: process.arch,
  endianness: endianness(),
  os_release: release(),
  numeric_model: "IEEE-754 binary64 via Node/V8 Number",
});

function exactKeys(value, keys) {
  return value
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function equalArray(left, right) {
  return Array.isArray(left)
    && left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}

function exists(file) {
  return access(file).then(() => true, () => false);
}

function zeroCostVector() {
  return Object.fromEntries(FIXTURE_026_RSD_T02_PULSE_COST_KEYS.map((key) => [
    key,
    new Set(["serialized_bytes", "scalar_operations", "wall_seconds", "later_joules"]).has(key)
      ? null
      : 0,
  ]));
}

function unitKey(unit) {
  return unit.work_key;
}

function canonicalDuration(value) {
  return value.toFixed(2);
}

function assertNoAuthorityPromotion(value, trail = "result") {
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    if (key === "result_label" && nested !== "NO_RESULT") {
      throw new Error(`Fixture 026 pulse-panel ${trail}.${key} attempts authority promotion.`);
    }
    if (
      new Set([
        "claim_eligible", "comparison_authority", "comparison_inference_permitted",
        "scientific_result", "performance_result", "energy_conclusion_allowed",
      ]).has(key)
      && nested !== false
    ) throw new Error(`Fixture 026 pulse-panel ${trail}.${key} attempts authority promotion.`);
    assertNoAuthorityPromotion(nested, `${trail}.${key}`);
  }
}

export function assertFixture026RsdT02PulsePanelConfig(config) {
  if (!exactKeys(config, [
    "schema", "contract_version", "artifact", "track", "claim", "partition", "authority",
    "constructor_version", "refractory", "skipping", "mixed_windows", "robustness", "budgets",
    "result_label", "claim_eligible", "comparison_authority", "full_panel_executed",
  ])) throw new Error("Fixture 026 pulse-panel config has missing or unknown fields.");
  if (
    config.schema !== 1
    || config.contract_version !== "fixture-026.rsd-t02-pulse-panel-config.v1"
    || config.artifact !== "fixture-026"
    || config.track !== "RSD-T02-PULSE"
    || config.claim !== "C-1561"
    || config.partition !== "public-development"
    || config.authority !== "construction-only"
    || config.constructor_version !== FIXTURE_026_RSD_T02_PULSE_VERSION
    || config.result_label !== "NO_RESULT"
    || config.claim_eligible !== false
    || config.comparison_authority !== false
    || config.full_panel_executed !== false
  ) throw new Error("Fixture 026 pulse-panel config violates its authority boundary.");
  if (
    !exactKeys(config.refractory, ["world_ids", "durations_s"])
    || !equalArray(config.refractory.world_ids, REFRACTORY_WORLD_IDS)
    || !equalArray(config.refractory.durations_s, FIXTURE_026_RSD_T02_PULSE_REFRACTORY_DURATIONS_S)
    || !exactKeys(config.skipping, ["world_ids", "duration_s", "periods_s"])
    || !equalArray(config.skipping.world_ids, SKIPPING_WORLD_IDS)
    || config.skipping.duration_s !== 0.20
    || !equalArray(config.skipping.periods_s, FIXTURE_026_RSD_T02_PULSE_SKIPPING_PERIODS_S)
  ) throw new Error("Fixture 026 pulse-panel deterministic panel differs from the constructor.");
  if (
    !exactKeys(config.mixed_windows, [
      "world_id", "ends_s", "start_width_state", "execution_policy",
    ])
    || config.mixed_windows.world_id !== "PS-MIXED"
    || !equalArray(config.mixed_windows.ends_s, [50, 150, 250, 350])
    || config.mixed_windows.start_width_state !== "unfrozen"
    || config.mixed_windows.execution_policy !== "emit-unresolved-contract-only"
  ) throw new Error("Fixture 026 pulse-panel mixed-window contract is invalid.");
  if (
    !exactKeys(config.robustness, [
      "target", "correlation_time_s", "sigma_ratios", "seeds",
    ])
    || config.robustness.target !== "deterministic-panel-after-construction-gates"
    || config.robustness.correlation_time_s !== 0.05
    || !equalArray(config.robustness.sigma_ratios, [0.01, 0.05, 0.10])
    || !equalArray(config.robustness.seeds, FIXTURE_026_RSD_T02_PULSE_PUBLIC_SEEDS)
  ) throw new Error("Fixture 026 pulse-panel robustness grid differs from the constructor.");
  if (
    !exactKeys(config.budgets, [
      "maximum_work_units_per_invocation",
      "maximum_serialized_result_bytes_per_unit",
      "maximum_total_serialized_result_bytes",
      "declared_total_work_units",
    ])
    || !Number.isSafeInteger(config.budgets.maximum_work_units_per_invocation)
    || config.budgets.maximum_work_units_per_invocation < 1
    || !Number.isSafeInteger(config.budgets.maximum_serialized_result_bytes_per_unit)
    || config.budgets.maximum_serialized_result_bytes_per_unit < 1024
    || !Number.isSafeInteger(config.budgets.maximum_total_serialized_result_bytes)
    || config.budgets.maximum_total_serialized_result_bytes < 1
    || config.budgets.declared_total_work_units !== 229
  ) throw new Error("Fixture 026 pulse-panel budgets are invalid.");
  return config;
}

export async function loadFixture026RsdT02PulsePanelConfig(configPath = DEFAULT_CONFIG_PATH) {
  const [bytes, runnerBytes, constructorBytes, schemaBytes] = await Promise.all([
    readFile(configPath),
    readFile(RUNNER_SOURCE_PATH),
    readFile(CONSTRUCTOR_SOURCE_PATH),
    readFile(EVENT_SCHEMA_PATH),
  ]);
  const config = assertFixture026RsdT02PulsePanelConfig(JSON.parse(bytes.toString("utf8")));
  const eventSchema = JSON.parse(schemaBytes.toString("utf8"));
  if (
    eventSchema?.["x-runtime-validator"]?.contract_version
      !== FIXTURE_026_RSD_T02_PULSE_PANEL_EVENT_VERSION
    || eventSchema?.["x-runtime-validator"]?.module !== path.basename(RUNNER_SOURCE_PATH)
    || eventSchema?.["x-runtime-validator"]?.export
      !== "assertFixture026RsdT02PulsePanelEvent"
  ) throw new Error("Fixture 026 pulse-panel event schema does not bind its runtime validator.");
  const fingerprint = (label, sourcePath, sourceBytes) => deepFreeze({
    label,
    repository_path: `experiments/workstation/fixture-026/${path.basename(sourcePath)}`,
    sha256: createHash("sha256").update(sourceBytes).digest("hex"),
    bytes: sourceBytes.length,
  });
  return deepFreeze({
    config,
    canonical_sha256: sha256Hex(canonicalize(config)),
    file_sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.length,
    source_hashes: {
      runner: fingerprint("runner", RUNNER_SOURCE_PATH, runnerBytes),
      constructor: fingerprint("constructor", CONSTRUCTOR_SOURCE_PATH, constructorBytes),
      event_schema: fingerprint("event-schema", EVENT_SCHEMA_PATH, schemaBytes),
    },
  });
}

export function buildFixture026RsdT02PulsePanelWorkUnits(config) {
  assertFixture026RsdT02PulsePanelConfig(config);
  const units = [];
  for (const windowEndS of config.mixed_windows.ends_s) {
    units.push({
      work_key: `mixed-window:${String(windowEndS).padStart(3, "0")}`,
      kind: "mixed-window-output",
      world_id: config.mixed_windows.world_id,
      window_end_s: windowEndS,
      execution_policy: "emit-unresolved-contract-only",
    });
  }
  for (const worldId of config.refractory.world_ids) {
    for (const durationS of config.refractory.durations_s) {
      units.push({
        work_key: `refractory:${worldId}:${canonicalDuration(durationS)}`,
        kind: "refractory-duration",
        world_id: worldId,
        duration_s: durationS,
        execution_policy: "explicit-constructor-executor-required",
      });
    }
  }
  for (const worldId of config.skipping.world_ids) {
    for (const periodS of config.skipping.periods_s) {
      units.push({
        work_key: `skipping:${worldId}:${canonicalDuration(periodS)}`,
        kind: "skipping-cell",
        world_id: worldId,
        duration_s: config.skipping.duration_s,
        period_s: periodS,
        execution_policy: "explicit-constructor-executor-required",
      });
    }
  }
  for (const seed of config.robustness.seeds) {
    for (const sigmaRatio of config.robustness.sigma_ratios) {
      units.push({
        work_key: `ou-noise:${seed}:${sigmaRatio.toFixed(2)}`,
        kind: "ou-noise-grid",
        seed,
        sigma_ratio: sigmaRatio,
        correlation_time_s: config.robustness.correlation_time_s,
        target: config.robustness.target,
        execution_policy: "requires-complete-deterministic-panel-and-clean-samples",
      });
    }
  }
  if (units.length !== config.budgets.declared_total_work_units) {
    throw new Error("Fixture 026 pulse-panel schedule cardinality differs from its budget.");
  }
  if (new Set(units.map(unitKey)).size !== units.length) {
    throw new Error("Fixture 026 pulse-panel schedule contains duplicate work keys.");
  }
  return deepFreeze(units);
}

function runIdentity(configState, units) {
  const body = {
    schema: 1,
    artifact: "fixture-026",
    track: "RSD-T02-PULSE",
    claim: "C-1561",
    runner_version: FIXTURE_026_RSD_T02_PULSE_PANEL_RUNNER_VERSION,
    event_contract_version: FIXTURE_026_RSD_T02_PULSE_PANEL_EVENT_VERSION,
    constructor_version: FIXTURE_026_RSD_T02_PULSE_VERSION,
    ledger_format: LEDGER_FORMAT,
    config_canonical_sha256: configState.canonical_sha256,
    config_file_sha256: configState.file_sha256,
    source_hashes: configState.source_hashes,
    runtime_fingerprint: FIXTURE_026_RSD_T02_PULSE_PANEL_RUNTIME_FINGERPRINT,
    runtime_fingerprint_sha256: sha256Hex(canonicalize(
      FIXTURE_026_RSD_T02_PULSE_PANEL_RUNTIME_FINGERPRINT,
    )),
    schedule_sha256: sha256Hex(canonicalize(units)),
    expected_work_units: units.length,
    partition: "public-development",
    authority: "construction-only",
    result_label: "NO_RESULT",
    no_result: true,
    claim_eligible: false,
    comparison_inference_permitted: false,
    scientific_result: false,
    performance_result: false,
    measured_energy_present: false,
    energy_conclusion_allowed: false,
  };
  return deepFreeze({ ...body, run_id: sha256Hex(canonicalize(body)) });
}

function mixedWindowResult(unit) {
  return {
    state: "unresolved",
    summary: {
      world_id: unit.world_id,
      window_end_s: unit.window_end_s,
      window_start_s: null,
      window_width_s: null,
      signature: "unresolved",
      reason: "mixed-window-starts-or-widths-not-frozen",
      topology_disposition: "mixed/window-qualified",
      exclusive_topology_allowed: false,
    },
    cost_vector: zeroCostVector(),
  };
}

function assertExecutorResult(result, unit, byteCap) {
  if (!exactKeys(result, ["state", "summary", "cost_vector"])) {
    throw new Error(`Fixture 026 pulse-panel executor returned an invalid ${unit.kind} result.`);
  }
  if (!TERMINAL_STATES.has(result.state)) {
    throw new Error("Fixture 026 pulse-panel executor returned a nonterminal state.");
  }
  if (!result.summary || typeof result.summary !== "object" || Array.isArray(result.summary)) {
    throw new Error("Fixture 026 pulse-panel executor summary must be an object.");
  }
  canonicalize(result.summary);
  assertNoAuthorityPromotion(result.summary);
  assertFixture026RsdT02PulseCostVector(result.cost_vector);
  const bytes = Buffer.byteLength(canonicalize(result), "utf8");
  if (bytes > byteCap) throw new Error("Fixture 026 pulse-panel executor result exceeds its byte budget.");
  return { ...result, serialized_result_bytes: bytes };
}

function eventPayload(record) {
  const { integrity: ignored, ...payload } = record;
  void ignored;
  return payload;
}

function assertPanelEvent(record, identity, unitByKey, boundary = {}) {
  if (!exactKeys(record, [
    "schema", "contract_version", "artifact", "track", "claim", "run_id",
    "config_canonical_sha256", "work_key", "unit", "output", "result_label", "no_result",
    "claim_eligible", "comparison_inference_permitted", "scientific_result", "performance_result",
    "measured_energy_present", "energy_conclusion_allowed", "integrity",
  ])) throw new Error("Fixture 026 pulse-panel event has missing or unknown fields.");
  const expectedUnit = unitByKey.get(record.work_key);
  if (
    record.schema !== 1
    || record.contract_version !== FIXTURE_026_RSD_T02_PULSE_PANEL_EVENT_VERSION
    || record.artifact !== "fixture-026"
    || record.track !== "RSD-T02-PULSE"
    || record.claim !== "C-1561"
    || record.run_id !== identity.run_id
    || record.config_canonical_sha256 !== identity.config_canonical_sha256
    || !expectedUnit
    || canonicalize(record.unit) !== canonicalize(expectedUnit)
    || record.result_label !== "NO_RESULT"
    || record.no_result !== true
    || record.claim_eligible !== false
    || record.comparison_inference_permitted !== false
    || record.scientific_result !== false
    || record.performance_result !== false
    || record.measured_energy_present !== false
    || record.energy_conclusion_allowed !== false
  ) throw new Error("Fixture 026 pulse-panel event identity or authority mismatch.");
  if (!exactKeys(record.output, [
    "state", "summary", "cost_vector", "serialized_result_bytes",
  ])) throw new Error("Fixture 026 pulse-panel output has missing or unknown fields.");
  const validatedOutput = assertExecutorResult(
    {
      state: record.output.state,
      summary: record.output.summary,
      cost_vector: record.output.cost_vector,
    },
    expectedUnit,
    Number.MAX_SAFE_INTEGER,
  );
  if (
    !Number.isSafeInteger(record.output.serialized_result_bytes)
    || record.output.serialized_result_bytes < 1
    || record.output.serialized_result_bytes !== validatedOutput.serialized_result_bytes
  ) throw new Error("Fixture 026 pulse-panel serialized result charge is invalid.");
  if (
    boundary.sequence !== undefined
    && (
      !exactKeys(record.integrity, ["sequence", "previous_sha256", "record_sha256"])
      || record.integrity.sequence !== boundary.sequence
      || record.integrity.previous_sha256 !== boundary.previousHash
      || !HASH_PATTERN.test(record.integrity.record_sha256)
    )
  ) throw new Error("Fixture 026 pulse-panel event integrity boundary is invalid.");
  return record;
}

export function assertFixture026RsdT02PulsePanelEvent(record, {
  identity,
  units,
  sequence,
  previousHash,
}) {
  const unitByKey = new Map(units.map((unit) => [unit.work_key, unit]));
  return assertPanelEvent(record, identity, unitByKey, { sequence, previousHash });
}

function eventFor(unit, output, identity) {
  return {
    schema: 1,
    contract_version: FIXTURE_026_RSD_T02_PULSE_PANEL_EVENT_VERSION,
    artifact: "fixture-026",
    track: "RSD-T02-PULSE",
    claim: "C-1561",
    run_id: identity.run_id,
    config_canonical_sha256: identity.config_canonical_sha256,
    work_key: unit.work_key,
    unit,
    output,
    result_label: "NO_RESULT",
    no_result: true,
    claim_eligible: false,
    comparison_inference_permitted: false,
    scientific_result: false,
    performance_result: false,
    measured_energy_present: false,
    energy_conclusion_allowed: false,
  };
}

async function writeRunOnce(file, value) {
  const body = `${JSON.stringify(value, null, 2)}\n`;
  try {
    await writeFile(file, body, { flag: "wx" });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const stored = JSON.parse(await readFile(file, "utf8"));
    if (canonicalize(stored) !== canonicalize(value)) {
      throw new Error("Fixture 026 pulse-panel refuses to replace a different run manifest.", { cause: error });
    }
  }
}

export async function executeFixture026RsdT02PulseConstructorUnit(unit) {
  if (unit.kind === "refractory-duration") {
    const row = await constructFixture026RsdT02RefractoryDuration(unit.world_id, unit.duration_s);
    return {
      state: row.maximizer?.status === "qualified" ? "resolved" : "unresolved",
      summary: row,
      cost_vector: row.cost_vector,
    };
  }
  if (unit.kind === "skipping-cell") {
    const row = constructFixture026RsdT02SkippingCell(unit.world_id, unit.period_s);
    const status = row.skipping_signature?.status;
    return {
      state: status === "out_of_support"
        ? "out_of_support"
        : new Set(["supported", "absent"]).has(status) ? "resolved" : "unresolved",
      summary: row,
      cost_vector: row.cost_vector,
    };
  }
  throw new Error(
    "Fixture 026 pulse-panel constructor executor does not synthesize OU source samples or mixed windows.",
  );
}

export async function runFixture026RsdT02PulsePanel({
  output,
  resume = false,
  maxWorkUnits = 0,
  configPath = DEFAULT_CONFIG_PATH,
  executor = null,
} = {}) {
  if (typeof output !== "string" || output.trim() === "") {
    throw new TypeError("Fixture 026 pulse-panel output directory is required.");
  }
  if (typeof resume !== "boolean") {
    throw new TypeError("Fixture 026 pulse-panel resume flag must be boolean.");
  }
  if (!Number.isSafeInteger(maxWorkUnits) || maxWorkUnits < 0) {
    throw new TypeError("Fixture 026 pulse-panel maxWorkUnits must be a nonnegative integer.");
  }
  if (executor !== null && typeof executor !== "function") {
    throw new TypeError("Fixture 026 pulse-panel executor must be a function or null.");
  }
  const configState = await loadFixture026RsdT02PulsePanelConfig(configPath);
  const cap = configState.config.budgets.maximum_work_units_per_invocation;
  if (maxWorkUnits > cap) {
    throw new RangeError(`Fixture 026 pulse-panel maxWorkUnits exceeds the configured cap of ${cap}.`);
  }
  const units = buildFixture026RsdT02PulsePanelWorkUnits(configState.config);
  const identity = runIdentity(configState, units);
  const directory = path.resolve(output);
  const present = await exists(directory);
  if (present && !resume) throw new Error("Fixture 026 pulse-panel output exists; use resume.");
  if (!present && resume) throw new Error("Fixture 026 pulse-panel cannot resume a missing output directory.");
  if (!present) await mkdir(directory, { recursive: false });
  if (!(await stat(directory)).isDirectory()) {
    throw new Error("Fixture 026 pulse-panel output is not a directory.");
  }
  const lease = await acquireFixture026RsdT02RunLock({
    outputDirectory: directory,
    runnerId: FIXTURE_026_RSD_T02_PULSE_PANEL_RUNNER_VERSION,
  });
  try {
    const rawPath = path.join(directory, RAW_FILE);
    const checkpointPath = path.join(directory, CHECKPOINT_FILE);
    const runPath = path.join(directory, RUN_FILE);
    const unitByKey = new Map(units.map((unit) => [unit.work_key, unit]));
    const totalResultByteCap =
      configState.config.budgets.maximum_total_serialized_result_bytes;
    const perResultByteCap =
      configState.config.budgets.maximum_serialized_result_bytes_per_unit;
    let validatedSerializedResultBytes = 0;
    const ledger = await openCheckpointLedger({
      artifact: "fixture-026",
      ledgerFormat: LEDGER_FORMAT,
      rawPath,
      checkpointPath,
      runIdentity: identity,
      scientificPayload: eventPayload,
      workKey: (record) => record.work_key,
      assertRecord: (record, boundary) => {
        const validated = assertPanelEvent(record, identity, unitByKey, boundary);
        if (validated.output.serialized_result_bytes > perResultByteCap) {
          throw new Error(
            "Fixture 026 pulse-panel persisted result exceeds the per-unit byte budget.",
          );
        }
        const nextTotal = validatedSerializedResultBytes
          + validated.output.serialized_result_bytes;
        if (nextTotal > totalResultByteCap) {
          throw new Error(
            "Fixture 026 pulse-panel cumulative serialized results exceed the whole-run byte budget.",
          );
        }
        validatedSerializedResultBytes = nextTotal;
        return validated;
      },
    });
    const remaining = remainingWorkUnits(units, ledger.completedWorkKeys(), unitKey);
    let consumed = 0;
    let stoppedReason = maxWorkUnits === 0 ? "zero-work-budget" : null;
    for (const unit of remaining) {
      if (consumed >= maxWorkUnits) {
        if (stoppedReason === null) stoppedReason = "invocation-work-budget-exhausted";
        break;
      }
      let result;
      if (unit.kind === "mixed-window-output") {
        result = mixedWindowResult(unit);
      } else if (executor === null) {
        stoppedReason = "explicit-scientific-executor-required";
        break;
      } else {
        result = await executor(unit);
      }
      const outputResult = assertExecutorResult(
        result,
        unit,
        perResultByteCap,
      );
      await ledger.append(eventFor(unit, outputResult, identity));
      await ledger.saveCheckpoint();
      consumed += 1;
    }
    if (ledger.summary().checkpoint_status !== "current") await ledger.saveCheckpoint();
    const completedKeys = ledger.completedWorkKeys();
    const complete = ledger.summary().completed_work_units === units.length;
    if (complete) stoppedReason = null;
    const status = {
      schema: 1,
      contract_version: FIXTURE_026_RSD_T02_PULSE_PANEL_RUNNER_VERSION,
      artifact: "fixture-026",
      track: "RSD-T02-PULSE",
      claim: "C-1561",
      run_id: identity.run_id,
      complete,
      incomplete_reason: complete ? null : stoppedReason ?? "work-remains",
      expected_work_units: units.length,
      completed_work_units: ledger.summary().completed_work_units,
      remaining_work_units: units.length - ledger.summary().completed_work_units,
      completed_by_kind: Object.fromEntries([
        "mixed-window-output", "refractory-duration", "skipping-cell", "ou-noise-grid",
      ].map((kind) => [kind, units.filter((unit) => (
        unit.kind === kind && completedKeys.has(unit.work_key)
      )).length])),
      budgets: {
        configured_maximum_work_units_per_invocation: cap,
        requested_work_units_this_invocation: maxWorkUnits,
        consumed_work_units_this_invocation: consumed,
        maximum_serialized_result_bytes_per_unit:
          perResultByteCap,
        maximum_total_serialized_result_bytes: totalResultByteCap,
        consumed_serialized_result_bytes: validatedSerializedResultBytes,
        remaining_serialized_result_bytes:
          totalResultByteCap - validatedSerializedResultBytes,
      },
      ledger: ledger.summary(),
      result_label: "NO_RESULT",
      no_result: true,
      claim_eligible: false,
      comparison_inference_permitted: false,
      scientific_result: false,
      performance_result: false,
      measured_energy_present: false,
      energy_conclusion_allowed: false,
    };
    if (complete) await writeRunOnce(runPath, status);
    return deepFreeze({ directory, identity, status });
  } finally {
    await lease.release();
  }
}
