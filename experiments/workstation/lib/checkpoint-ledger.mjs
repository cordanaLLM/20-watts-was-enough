import { createHash } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const ZERO_HASH = "0".repeat(64);
const CHECKPOINT_KEYS = Object.freeze([
  "schema",
  "artifact",
  "ledger_format",
  "records",
  "scientific_payload_sha256",
  "hash_chain_sha256",
  "completed_work_units_sha256",
  "run_identity",
  "checkpoint_sha256",
]);

function exactKeys(value, keys) {
  return value
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

export function canonicalize(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => {
      if (value[key] === undefined) throw new TypeError(`Undefined canonical field ${key}.`);
      return `${JSON.stringify(key)}:${canonicalize(value[key])}`;
    }).join(",")}}`;
  }
  throw new TypeError(`Unsupported canonical value ${typeof value}.`);
}

export function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

function nextHash(previous, payload) {
  if (!/^[0-9a-f]{64}$/.test(previous)) throw new TypeError("Invalid previous ledger hash.");
  return sha256Hex(`${previous}\n${payload}`);
}

async function readOptional(file) {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function strictJsonlLines(raw) {
  if (raw === null || raw.length === 0) return [];
  if (raw.includes("\r")) {
    throw new Error("Raw ledger must use canonical LF JSONL; CRLF is forbidden.");
  }
  if (!raw.endsWith("\n")) {
    throw new Error("Raw ledger has a torn trailing record; refusing silent repair.");
  }
  const body = raw.slice(0, -1);
  if (body.length === 0) throw new Error("Raw ledger contains a blank JSONL line.");
  const lines = body.split("\n");
  if (lines.some((line) => line.length === 0)) {
    throw new Error("Raw ledger contains a blank JSONL line.");
  }
  return lines;
}

async function appendDurable(file, line) {
  if (!line.endsWith("\n") || line.includes("\r")) {
    throw new TypeError("Ledger writes must use canonical LF termination.");
  }
  const handle = await open(file, "a", 0o600);
  try {
    await handle.writeFile(line, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function replaceDurable(file, body) {
  if (!body.endsWith("\n")) throw new TypeError("Checkpoint writes must be newline terminated.");
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  let replaced = false;
  try {
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(body, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    // Windows can transiently reject an atomic replacement while virus
    // scanners or another reader still hold the old checkpoint.  Preserve the
    // temp file and retry only the two documented sharing violations; every
    // other error remains fail-closed.
    for (let attempt = 0; ; attempt += 1) {
      try {
        await rename(temporary, file);
        break;
      } catch (error) {
        const retryable = error?.code === "EPERM" || error?.code === "EBUSY";
        if (!retryable || attempt >= 5) throw error;
        await delay(10 * (2 ** attempt));
      }
    }
    replaced = true;
    const destination = await open(file, "r+");
    try {
      await destination.sync();
    } finally {
      await destination.close();
    }
  } finally {
    if (!replaced) await rm(temporary, { force: true });
  }
}

function checkpointDocument({ artifact, ledgerFormat, state, runIdentity }) {
  const body = {
    schema: 1,
    artifact,
    ledger_format: ledgerFormat,
    records: state.records,
    scientific_payload_sha256: state.digest.copy().digest("hex"),
    hash_chain_sha256: state.previousHash,
    completed_work_units_sha256: sha256Hex(canonicalize([...state.completed].sort())),
    run_identity: runIdentity,
  };
  return { ...body, checkpoint_sha256: sha256Hex(canonicalize(body)) };
}

function verifyCheckpoint(document, { artifact, ledgerFormat, runIdentity }) {
  if (!exactKeys(document, CHECKPOINT_KEYS)) {
    throw new Error("Checkpoint has missing or unknown fields.");
  }
  if (
    document.schema !== 1
    || document.artifact !== artifact
    || document.ledger_format !== ledgerFormat
    || !Number.isSafeInteger(document.records)
    || document.records < 0
    || !/^[0-9a-f]{64}$/u.test(document.scientific_payload_sha256)
    || !/^[0-9a-f]{64}$/u.test(document.hash_chain_sha256)
    || !/^[0-9a-f]{64}$/u.test(document.completed_work_units_sha256)
    || !exactKeys(document.run_identity, Object.keys(runIdentity))
    || canonicalize(document.run_identity) !== canonicalize(runIdentity)
    || !/^[0-9a-f]{64}$/u.test(document.checkpoint_sha256)
  ) throw new Error("Checkpoint identity mismatch.");
  const { checkpoint_sha256: digest, ...body } = document;
  if (digest !== sha256Hex(canonicalize(body))) throw new Error("Checkpoint digest mismatch.");
}

export function remainingWorkUnits(units, completedKeys, keyOf) {
  if (!Array.isArray(units) || !(completedKeys instanceof Set) || typeof keyOf !== "function") {
    throw new TypeError("remainingWorkUnits requires units, a Set, and keyOf.");
  }
  return units.filter((unit) => !completedKeys.has(keyOf(unit)));
}

/**
 * Opens an append-only scientific ledger. Resume authority is reconstructed
 * from the raw ledger; a checkpoint may lag but can never override raw facts.
 */
export async function openCheckpointLedger({
  artifact,
  ledgerFormat,
  rawPath,
  checkpointPath,
  runIdentity,
  scientificPayload,
  workKey,
  assertRecord,
}) {
  if (!/^fixture-[0-9]{3}$|^candidate-[0-9]{3}$/.test(artifact ?? "")) {
    throw new TypeError("A canonical artifact ID is required.");
  }
  if (typeof ledgerFormat !== "string" || !ledgerFormat) throw new TypeError("ledgerFormat is required.");
  if (typeof scientificPayload !== "function" || typeof workKey !== "function") {
    throw new TypeError("scientificPayload and workKey are required.");
  }
  if (!runIdentity || typeof runIdentity !== "object" || Array.isArray(runIdentity)) {
    throw new TypeError("runIdentity must be a closed object.");
  }
  canonicalize(runIdentity);
  await mkdir(path.dirname(rawPath), { recursive: true });
  await mkdir(path.dirname(checkpointPath), { recursive: true });

  const raw = await readOptional(rawPath);
  const lines = strictJsonlLines(raw);
  const state = {
    records: 0,
    digest: createHash("sha256"),
    previousHash: ZERO_HASH,
    completed: new Set(),
  };
  for (const [sequence, line] of lines.entries()) {
    let record;
    try {
      record = JSON.parse(line);
    } catch (error) {
      throw new Error(`Raw ledger line ${sequence + 1} is invalid JSON: ${error.message}`, { cause: error });
    }
    if (typeof assertRecord === "function") assertRecord(record, { sequence, previousHash: state.previousHash });
    const key = workKey(record);
    if (typeof key !== "string" || !key) throw new Error(`Invalid work key at line ${sequence + 1}.`);
    if (state.completed.has(key)) throw new Error(`Duplicate completed work unit ${key}.`);
    const payload = canonicalize(scientificPayload(record));
    const expected = nextHash(state.previousHash, payload);
    if (
      record.integrity?.sequence !== sequence
      || record.integrity?.previous_sha256 !== state.previousHash
      || record.integrity?.record_sha256 !== expected
    ) throw new Error(`Hash-chain mismatch at raw line ${sequence + 1}.`);
    state.digest.update(payload);
    state.previousHash = expected;
    state.completed.add(key);
    state.records += 1;
  }

  const checkpointRaw = await readOptional(checkpointPath);
  let checkpointStatus = "missing";
  if (checkpointRaw !== null) {
    const checkpoint = JSON.parse(checkpointRaw);
    verifyCheckpoint(checkpoint, { artifact, ledgerFormat, runIdentity });
    if (checkpoint.records > state.records) throw new Error("Checkpoint is ahead of raw ledger.");
    checkpointStatus = checkpoint.records === state.records ? "current" : "stale";
    if (checkpointStatus === "current") {
      const expected = checkpointDocument({ artifact, ledgerFormat, state, runIdentity });
      for (const field of [
        "scientific_payload_sha256",
        "hash_chain_sha256",
        "completed_work_units_sha256",
      ]) {
        if (checkpoint[field] !== expected[field]) throw new Error(`Checkpoint ${field} disagrees with raw ledger.`);
      }
    }
  }

  return Object.freeze({
    hasCompleted: (key) => state.completed.has(key),
    completedWorkKeys: () => new Set(state.completed),
    async append(event) {
      if (event.integrity !== undefined) throw new Error("Caller cannot supply ledger integrity.");
      const key = workKey(event);
      if (state.completed.has(key)) throw new Error(`Work unit already completed: ${key}.`);
      const payload = canonicalize(scientificPayload(event));
      const record = {
        ...event,
        integrity: {
          sequence: state.records,
          previous_sha256: state.previousHash,
          record_sha256: nextHash(state.previousHash, payload),
        },
      };
      if (typeof assertRecord === "function") {
        assertRecord(record, { sequence: state.records, previousHash: state.previousHash });
      }
      await appendDurable(rawPath, `${JSON.stringify(record)}\n`);
      state.digest.update(payload);
      state.previousHash = record.integrity.record_sha256;
      state.completed.add(key);
      state.records += 1;
      return record;
    },
    async saveCheckpoint() {
      const document = checkpointDocument({ artifact, ledgerFormat, state, runIdentity });
      await replaceDurable(checkpointPath, `${JSON.stringify(document, null, 2)}\n`);
      checkpointStatus = "current";
      return document;
    },
    summary() {
      return {
        records: state.records,
        scientific_payload_sha256: state.digest.copy().digest("hex"),
        hash_chain_sha256: state.previousHash,
        completed_work_units: state.completed.size,
        checkpoint_status: checkpointStatus,
      };
    },
  });
}
