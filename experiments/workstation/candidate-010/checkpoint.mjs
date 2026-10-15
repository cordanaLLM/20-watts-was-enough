import { createHash } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";

const ZERO_HASH = "0".repeat(64);

export const LEDGER_DURABILITY_CONTRACT = Object.freeze({
  version: "candidate-010-file-fsync-v1",
  raw_append: "write-complete-record-then-filehandle-sync",
  checkpoint_replace: "write-temporary-sync-rename-then-destination-sync",
  torn_tail_policy: "detect-and-refuse; never silently truncate",
  limitation: "File fsync is requested, but directory-entry persistence and arbitrary power-loss recovery are not claimed.",
});

export async function appendDurableRecord(file, recordLine) {
  if (typeof recordLine !== "string" || !recordLine.endsWith("\n")) {
    throw new TypeError("Durable ledger records must be complete newline-terminated strings.");
  }
  const handle = await open(file, "a");
  try {
    await handle.writeFile(recordLine, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function replaceDurableCheckpoint(file, body) {
  if (typeof body !== "string" || !body.endsWith("\n")) {
    throw new TypeError("Durable checkpoint bodies must be complete newline-terminated strings.");
  }
  const temporaryPath = `${file}.tmp-${process.pid}-${Date.now()}`;
  let renamed = false;
  try {
    const temporary = await open(temporaryPath, "wx");
    try {
      await temporary.writeFile(body, "utf8");
      await temporary.sync();
    } finally {
      await temporary.close();
    }
    await rename(temporaryPath, file);
    renamed = true;
    // Windows rejects fsync on a read-only handle. Open the renamed file for
    // update without modifying it so the final pathname is explicitly synced.
    const destination = await open(file, "r+");
    try {
      await destination.sync();
    } finally {
      await destination.close();
    }
  } finally {
    if (!renamed) await rm(temporaryPath, { force: true });
  }
}

export function canonicalize(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Canonical JSON does not permit non-finite numbers.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.keys(value).sort().map((key) => {
      if (value[key] === undefined) throw new TypeError(`Canonical JSON does not permit undefined at ${key}.`);
      return `${JSON.stringify(key)}:${canonicalize(value[key])}`;
    });
    return `{${entries.join(",")}}`;
  }
  throw new TypeError(`Canonical JSON does not permit ${typeof value}.`);
}

export function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function nextRecordHash(previousRecordHash, canonicalScientificPayload) {
  if (!/^[0-9a-f]{64}$/.test(previousRecordHash)) throw new TypeError("Invalid previous record hash.");
  return sha256Hex(`${previousRecordHash}\n${canonicalScientificPayload}`);
}

async function readOptional(file) {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function checkpointBody(state, extra) {
  const body = {
    schema: 1,
    artifact: "candidate-010",
    ledger_format: "candidate-010-resume-ledger-v1",
    records: state.records,
    scientific_payload_sha256: state.digest.copy().digest("hex"),
    hash_chain_sha256: state.previousRecordHash,
    completed_work_units_sha256: sha256Hex(canonicalize([...state.completedKeys].sort())),
    ...extra,
  };
  return { ...body, checkpoint_sha256: sha256Hex(canonicalize(body)) };
}

function verifyCheckpoint(document) {
  if (
    document?.schema !== 1
    || document.artifact !== "candidate-010"
    || document.ledger_format !== "candidate-010-resume-ledger-v1"
  ) {
    throw new Error("Checkpoint identity mismatch.");
  }
  const { checkpoint_sha256: actual, ...body } = document;
  if (actual !== sha256Hex(canonicalize(body))) throw new Error("Checkpoint digest mismatch.");
}

/**
 * Opens an append-only scientific ledger and derives resume state from the raw
 * events, never from the checkpoint alone. A checkpoint may safely lag the
 * ledger when a process stops after append and before checkpoint replacement.
 */
export async function openCheckpointLedger({
  rawPath,
  checkpointPath,
  scientificPayload,
  workKey,
  runIdentity = {},
  durableIo = null,
}) {
  if (typeof scientificPayload !== "function" || typeof workKey !== "function") {
    throw new TypeError("scientificPayload and workKey functions are required.");
  }
  canonicalize(runIdentity);
  const io = durableIo ?? {
    appendRecord: appendDurableRecord,
    replaceCheckpoint: replaceDurableCheckpoint,
  };
  if (typeof io.appendRecord !== "function" || typeof io.replaceCheckpoint !== "function") {
    throw new TypeError("durableIo must provide appendRecord and replaceCheckpoint functions.");
  }
  await mkdir(path.dirname(rawPath), { recursive: true });
  await mkdir(path.dirname(checkpointPath), { recursive: true });

  const raw = await readOptional(rawPath);
  if (raw !== null && raw.length > 0 && !raw.endsWith("\n")) {
    throw new Error("Raw ledger has an incomplete trailing record; refusing silent truncation.");
  }
  const lines = raw?.split(/\r?\n/).filter(Boolean) ?? [];
  const digest = createHash("sha256");
  const completedKeys = new Set();
  let previousRecordHash = ZERO_HASH;

  for (const [index, line] of lines.entries()) {
    let event;
    try {
      event = JSON.parse(line);
    } catch (error) {
      throw new Error(`Raw ledger line ${index + 1} is invalid JSON: ${error.message}`, { cause: error });
    }
    const key = workKey(event);
    if (typeof key !== "string" || key.length === 0) throw new Error(`Invalid work key at raw line ${index + 1}.`);
    if (completedKeys.has(key)) throw new Error(`Duplicate completed work unit: ${key}`);
    const payload = canonicalize(scientificPayload(event));
    const expectedHash = nextRecordHash(previousRecordHash, payload);
    if (
      event.integrity?.sequence !== index
      || event.integrity.previous_sha256 !== previousRecordHash
      || event.integrity.record_sha256 !== expectedHash
    ) {
      throw new Error(`Hash-chain mismatch at raw line ${index + 1}.`);
    }
    digest.update(payload);
    previousRecordHash = expectedHash;
    completedKeys.add(key);
  }

  const state = { records: lines.length, digest, previousRecordHash, completedKeys };
  const checkpointRaw = await readOptional(checkpointPath);
  let checkpointStatus = "missing";
  if (checkpointRaw !== null) {
    const checkpoint = JSON.parse(checkpointRaw);
    verifyCheckpoint(checkpoint);
    if (canonicalize(checkpoint.run_identity ?? {}) !== canonicalize(runIdentity)) {
      throw new Error("Checkpoint run identity does not match the requested configuration and seed pack.");
    }
    if (checkpoint.records > state.records) throw new Error("Checkpoint is ahead of the append-only raw ledger.");
    checkpointStatus = checkpoint.records === state.records ? "current" : "stale";
    if (checkpointStatus === "current") {
      const derived = checkpointBody(state, Object.fromEntries(
        Object.entries(checkpoint).filter(([key]) => ![
          "schema", "artifact", "ledger_format", "records", "scientific_payload_sha256",
          "hash_chain_sha256", "completed_work_units_sha256", "checkpoint_sha256", "run_identity",
        ].includes(key)),
      ));
      if (
        checkpoint.scientific_payload_sha256 !== derived.scientific_payload_sha256
        || checkpoint.hash_chain_sha256 !== derived.hash_chain_sha256
        || checkpoint.completed_work_units_sha256 !== derived.completed_work_units_sha256
      ) {
        throw new Error("Current checkpoint disagrees with the raw ledger.");
      }
    }
  }

  async function append(event) {
    const key = workKey(event);
    if (typeof key !== "string" || key.length === 0) throw new Error("Invalid work key.");
    if (state.completedKeys.has(key)) throw new Error(`Work unit already completed: ${key}`);
    if (event.integrity !== undefined) throw new Error("Caller must not pre-populate event integrity.");
    const payload = canonicalize(scientificPayload(event));
    const recordHash = nextRecordHash(state.previousRecordHash, payload);
    const record = {
      ...event,
      integrity: {
        sequence: state.records,
        previous_sha256: state.previousRecordHash,
        record_sha256: recordHash,
      },
    };
    await io.appendRecord(rawPath, `${JSON.stringify(record)}\n`);
    state.digest.update(payload);
    state.previousRecordHash = recordHash;
    state.completedKeys.add(key);
    state.records += 1;
    return record;
  }

  async function saveCheckpoint(extra = {}) {
    for (const reserved of ["schema", "artifact", "ledger_format", "records", "scientific_payload_sha256", "hash_chain_sha256", "completed_work_units_sha256", "checkpoint_sha256", "run_identity"]) {
      if (reserved in extra) throw new Error(`Checkpoint metadata cannot replace reserved field ${reserved}.`);
    }
    const document = checkpointBody(state, { run_identity: runIdentity, ...extra });
    await io.replaceCheckpoint(checkpointPath, `${JSON.stringify(document, null, 2)}\n`);
    checkpointStatus = "current";
    return document;
  }

  function summary() {
    return {
      records: state.records,
      scientific_payload_sha256: state.digest.copy().digest("hex"),
      hash_chain_sha256: state.previousRecordHash,
      completed_work_units: state.completedKeys.size,
      checkpoint_status: checkpointStatus,
    };
  }

  return {
    append,
    saveCheckpoint,
    summary,
    hasCompleted: (key) => state.completedKeys.has(key),
    completedWorkKeys: () => new Set(state.completedKeys),
  };
}

export function* deterministicWorkUnits({ seeds, config, arms, generateOpportunities }) {
  const observed = new Set();
  for (const seed of seeds) {
    for (const opportunity of generateOpportunities(config, seed)) {
      for (const arm of arms) {
        const key = `${opportunity.id}\u0000${arm}`;
        if (observed.has(key)) throw new Error(`Deterministic schedule produced duplicate work unit: ${key}`);
        observed.add(key);
        yield { key, seed, opportunity, arm };
      }
    }
  }
}

export function* remainingWorkUnits(schedule, completedWorkKeys) {
  for (const unit of schedule) {
    if (!completedWorkKeys.has(unit.key)) yield unit;
  }
}
