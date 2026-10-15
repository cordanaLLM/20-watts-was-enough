import { createHash, randomBytes } from "node:crypto";
import {
  lstat,
  mkdir,
  open,
  realpath,
  rename,
} from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { canonicalize, sha256Hex } from "../lib/checkpoint-ledger.mjs";

const ZERO_HASH = "0".repeat(64);
const CHECKPOINT_KEYS = Object.freeze([
  "schema", "artifact", "ledger_format", "records", "scientific_payload_sha256",
  "hash_chain_sha256", "completed_work_units_sha256", "run_identity",
  "checkpoint_sha256",
]);

function exactKeys(value, keys) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function normalizedPath(value) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function samePath(left, right) {
  return normalizedPath(left) === normalizedPath(right);
}

function fileIdentity(stat) {
  return Object.freeze({ dev: String(stat.dev), ino: String(stat.ino) });
}

function sameIdentity(left, right) {
  return String(left.dev) === String(right.dev) && String(left.ino) === String(right.ino);
}

function assertUsableIdentity(stat, label) {
  const identity = fileIdentity(stat);
  if (identity.dev === "0" && identity.ino === "0") {
    throw new Error(`${label} filesystem does not expose a usable file identity.`);
  }
  return identity;
}

async function optionalLstat(file) {
  try {
    return await lstat(file, { bigint: true });
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function assertRealDirectory(directory, label) {
  const information = await lstat(directory, { bigint: true });
  if (!information.isDirectory() || information.isSymbolicLink()) {
    throw new Error(`${label} is not a real directory.`);
  }
  const canonical = await realpath(directory);
  if (!samePath(canonical, directory)) {
    throw new Error(`${label} resolves through a redirected or reparse path.`);
  }
  return information;
}

export async function prepareFixture026RsdT02SafeOutputDirectory(outputDirectory) {
  if (typeof outputDirectory !== "string" || outputDirectory.trim() === "") {
    throw new TypeError("Safe output preparation requires a non-empty path.");
  }
  const resolved = path.resolve(outputDirectory);
  const parsed = path.parse(resolved);
  let cursor = parsed.root;
  await assertRealDirectory(cursor, "Output filesystem root");
  const components = resolved.slice(parsed.root.length).split(path.sep).filter(Boolean);
  for (const component of components) {
    cursor = path.join(cursor, component);
    let information = await optionalLstat(cursor);
    if (information === null) {
      try {
        await mkdir(cursor);
      } catch (error) {
        if (error?.code !== "EEXIST") throw error;
      }
      information = await optionalLstat(cursor);
    }
    if (information === null || !information.isDirectory() || information.isSymbolicLink()) {
      throw new Error(`Output component is not a real directory: ${cursor}`);
    }
    const canonical = await realpath(cursor);
    if (!samePath(canonical, cursor)) {
      throw new Error(`Output component resolves through a redirected or reparse path: ${cursor}`);
    }
  }
  const information = await assertRealDirectory(resolved, "Output directory");
  return Object.freeze({
    path: resolved,
    realpath: await realpath(resolved),
    ...assertUsableIdentity(information, "Output directory"),
  });
}

async function assertOutputIdentity(identity) {
  const information = await assertRealDirectory(identity.path, "Output directory");
  if (
    !samePath(await realpath(identity.path), identity.realpath)
    || !sameIdentity(information, identity)
  ) throw new Error("Output directory identity changed during the run.");
}

export async function assertFixture026RsdT02SafeOutputDirectoryIdentity(identity) {
  await assertOutputIdentity(identity);
  return identity;
}

function leafPath(identity, filename, label) {
  if (
    typeof filename !== "string"
    || filename.length < 1
    || filename !== path.basename(filename)
    || filename === "."
    || filename === ".."
  ) throw new Error(`${label} must be one plain output filename.`);
  const resolved = path.resolve(identity.path, filename);
  if (!samePath(path.dirname(resolved), identity.path)) {
    throw new Error(`${label} escapes its canonical output directory.`);
  }
  return resolved;
}

async function assertSafeLeaf(file, identity, { optional = false, label }) {
  await assertOutputIdentity(identity);
  const information = await optionalLstat(file);
  if (information === null) {
    if (optional) return null;
    throw new Error(`${label} disappeared.`);
  }
  if (
    !information.isFile()
    || information.isSymbolicLink()
    || information.nlink !== 1n
  ) throw new Error(`${label} is redirected, reparse-backed, or hard-linked.`);
  if (!samePath(await realpath(file), file)) {
    throw new Error(`${label} resolves through a redirected path.`);
  }
  return information;
}

async function assertHandlePathIdentity(handle, file, outputIdentity, label) {
  const handleInformation = await handle.stat({ bigint: true });
  if (!handleInformation.isFile() || handleInformation.nlink !== 1n) {
    throw new Error(`${label} handle is not a private regular file.`);
  }
  const pathInformation = await assertSafeLeaf(file, outputIdentity, { label });
  if (!sameIdentity(handleInformation, pathInformation)) {
    throw new Error(`${label} pathname no longer names the opened file.`);
  }
  assertUsableIdentity(handleInformation, label);
  return handleInformation;
}

async function readHandleBounded(handle, maximumBytes, label) {
  const chunks = [];
  let total = 0;
  while (total <= maximumBytes) {
    const capacity = Math.min(64 * 1024, maximumBytes + 1 - total);
    if (capacity < 1) break;
    const buffer = Buffer.allocUnsafe(capacity);
    const { bytesRead } = await handle.read(buffer, 0, capacity, total);
    if (bytesRead === 0) break;
    chunks.push(buffer.subarray(0, bytesRead));
    total += bytesRead;
  }
  if (total > maximumBytes) throw new Error(`${label} exceeds its frozen byte bound.`);
  return Buffer.concat(chunks, total);
}

async function readOptionalBounded(file, outputIdentity, maximumBytes, label) {
  const present = await assertSafeLeaf(file, outputIdentity, { optional: true, label });
  if (present === null) return null;
  if (present.size > BigInt(maximumBytes)) {
    throw new Error(`${label} exceeds its frozen byte bound.`);
  }
  const handle = await open(file, "r");
  try {
    await assertHandlePathIdentity(handle, file, outputIdentity, label);
    const bytes = await readHandleBounded(handle, maximumBytes, label);
    await assertHandlePathIdentity(handle, file, outputIdentity, label);
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } finally {
    await handle.close();
  }
}

async function openPersistentRaw(file, outputIdentity, maximumBytes) {
  const present = await assertSafeLeaf(file, outputIdentity, {
    optional: true,
    label: "Raw disk ledger",
  });
  if (present?.size > BigInt(maximumBytes)) {
    throw new Error("Raw disk ledger exceeds its frozen byte bound.");
  }
  const handle = await open(file, "a+", 0o600);
  try {
    const opened = await assertHandlePathIdentity(
      handle,
      file,
      outputIdentity,
      "Raw disk ledger",
    );
    if (opened.size > BigInt(maximumBytes)) {
      throw new Error("Raw disk ledger exceeds its frozen byte bound.");
    }
    const identity = assertUsableIdentity(opened, "Raw disk ledger");
    const bytes = await readHandleBounded(handle, maximumBytes, "Raw disk ledger");
    const verified = await assertHandlePathIdentity(
      handle,
      file,
      outputIdentity,
      "Raw disk ledger",
    );
    if (!sameIdentity(verified, identity) || verified.size !== opened.size) {
      throw new Error("Raw disk ledger changed during bounded recovery.");
    }
    return Object.freeze({
      handle,
      identity,
      bytes,
      initialBytes: opened.size,
    });
  } catch (error) {
    await handle.close().catch(() => {});
    throw error;
  }
}

async function replaceCheckpointBounded(file, body, outputIdentity, maximumBytes) {
  if (!body.endsWith("\n") || body.includes("\r")) {
    throw new TypeError("Checkpoint writes must be canonical LF-terminated JSON.");
  }
  const bytes = Buffer.from(body, "utf8");
  if (bytes.length > maximumBytes) {
    throw new Error("Checkpoint exceeds its frozen byte bound.");
  }
  await assertSafeLeaf(file, outputIdentity, { optional: true, label: "Checkpoint" });
  const temporary = leafPath(
    outputIdentity,
    `.checkpoint-${process.pid}-${randomBytes(16).toString("hex")}.tmp`,
    "Checkpoint temporary path",
  );
  const handle = await open(temporary, "wx", 0o600);
  let renamed = false;
  try {
    await assertHandlePathIdentity(handle, temporary, outputIdentity, "Checkpoint temporary file");
    await handle.writeFile(bytes);
    await handle.sync();
    await assertHandlePathIdentity(handle, temporary, outputIdentity, "Checkpoint temporary file");
    await assertSafeLeaf(file, outputIdentity, { optional: true, label: "Checkpoint" });
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
    renamed = true;
    await assertHandlePathIdentity(handle, file, outputIdentity, "Checkpoint");
    await handle.sync();
  } finally {
    await handle.close();
    if (!renamed) {
      const remaining = await optionalLstat(temporary);
      if (remaining !== null && remaining.isFile() && remaining.nlink === 1n) {
        // The caller receives the exact temporary path in the thrown error context through
        // the output directory. It is deliberately retained rather than deleting a path
        // that could have been replaced by an adversary.
      }
    }
  }
}

function strictJsonlLines(raw, maximumRecords) {
  if (raw === null || raw.length === 0) return [];
  if (raw.includes("\r")) throw new Error("Raw disk ledger must use canonical LF JSONL.");
  if (!raw.endsWith("\n")) throw new Error("Raw disk ledger has a torn trailing record.");
  const body = raw.slice(0, -1);
  if (body.length === 0) throw new Error("Raw disk ledger contains a blank line.");
  const lines = body.split("\n");
  if (lines.length > maximumRecords) throw new Error("Raw disk ledger exceeds its record bound.");
  if (lines.some((line) => line.length === 0)) {
    throw new Error("Raw disk ledger contains a blank line.");
  }
  return lines;
}

function nextHash(previous, payload) {
  return sha256Hex(`${previous}\n${payload}`);
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

function verifyCheckpoint(document, { artifact, ledgerFormat, runIdentity, maximumRecords }) {
  if (
    !exactKeys(document, CHECKPOINT_KEYS)
    || document.schema !== 1
    || document.artifact !== artifact
    || document.ledger_format !== ledgerFormat
    || !Number.isSafeInteger(document.records)
    || document.records < 0
    || document.records > maximumRecords
    || !/^[0-9a-f]{64}$/u.test(document.scientific_payload_sha256)
    || !/^[0-9a-f]{64}$/u.test(document.hash_chain_sha256)
    || !/^[0-9a-f]{64}$/u.test(document.completed_work_units_sha256)
    || canonicalize(document.run_identity) !== canonicalize(runIdentity)
    || !/^[0-9a-f]{64}$/u.test(document.checkpoint_sha256)
  ) throw new Error("Checkpoint identity mismatch.");
  const { checkpoint_sha256: digest, ...body } = document;
  if (digest !== sha256Hex(canonicalize(body))) throw new Error("Checkpoint digest mismatch.");
}

export async function openFixture026RsdT02BoundedCheckpointLedger({
  artifact,
  ledgerFormat,
  outputIdentity,
  rawFilename,
  checkpointFilename,
  maximumRecords,
  maximumRawBytes,
  maximumCheckpointBytes,
  runIdentity,
  scientificPayload,
  workKey,
  assertRecord,
}) {
  if (
    artifact !== "fixture-026"
    || typeof ledgerFormat !== "string"
    || !Number.isSafeInteger(maximumRecords)
    || maximumRecords < 1
    || !Number.isSafeInteger(maximumRawBytes)
    || maximumRawBytes < 1
    || !Number.isSafeInteger(maximumCheckpointBytes)
    || maximumCheckpointBytes < 1
    || typeof scientificPayload !== "function"
    || typeof workKey !== "function"
  ) throw new TypeError("Bounded checkpoint ledger inputs are invalid.");
  canonicalize(runIdentity);
  await assertOutputIdentity(outputIdentity);
  const rawPath = leafPath(outputIdentity, rawFilename, "Raw disk ledger path");
  const checkpointPath = leafPath(outputIdentity, checkpointFilename, "Checkpoint path");
  const heldRaw = await openPersistentRaw(rawPath, outputIdentity, maximumRawBytes);
  const raw = new TextDecoder("utf-8", { fatal: true }).decode(heldRaw.bytes);
  let rawHandleClosed = false;
  let expectedRawBytes = heldRaw.initialBytes;
  try {
  const lines = strictJsonlLines(raw, maximumRecords);
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
      throw new Error(`Raw disk ledger line ${sequence + 1} is invalid JSON: ${error.message}`, { cause: error });
    }
    if (typeof assertRecord === "function") {
      assertRecord(record, { sequence, previousHash: state.previousHash });
    }
    const key = workKey(record);
    if (typeof key !== "string" || key.length < 1 || state.completed.has(key)) {
      throw new Error(`Raw disk ledger work key is invalid or duplicated at line ${sequence + 1}.`);
    }
    const payload = canonicalize(scientificPayload(record));
    const expectedHash = nextHash(state.previousHash, payload);
    if (
      record.integrity?.sequence !== sequence
      || record.integrity?.previous_sha256 !== state.previousHash
      || record.integrity?.record_sha256 !== expectedHash
    ) throw new Error(`Hash-chain mismatch at raw disk ledger line ${sequence + 1}.`);
    state.digest.update(payload);
    state.previousHash = expectedHash;
    state.completed.add(key);
    state.records += 1;
  }

  const checkpointRaw = await readOptionalBounded(
    checkpointPath,
    outputIdentity,
    maximumCheckpointBytes,
    "Checkpoint",
  );
  let checkpointStatus = "missing";
  if (checkpointRaw !== null) {
    let checkpoint;
    try {
      checkpoint = JSON.parse(checkpointRaw);
    } catch (error) {
      throw new Error(`Checkpoint is invalid JSON: ${error.message}`, { cause: error });
    }
    verifyCheckpoint(checkpoint, { artifact, ledgerFormat, runIdentity, maximumRecords });
    if (checkpoint.records > state.records) throw new Error("Checkpoint is ahead of raw ledger.");
    checkpointStatus = checkpoint.records === state.records ? "current" : "stale";
    if (checkpointStatus === "current") {
      const expected = checkpointDocument({ artifact, ledgerFormat, state, runIdentity });
      for (const field of [
        "scientific_payload_sha256", "hash_chain_sha256", "completed_work_units_sha256",
      ]) {
        if (checkpoint[field] !== expected[field]) {
          throw new Error(`Checkpoint ${field} disagrees with raw ledger.`);
        }
      }
    }
  }

  let poisoned = false;
  const assertWritable = () => {
    if (rawHandleClosed) throw new Error("Disk ledger session is closed.");
    if (poisoned) throw new Error("Disk ledger session is poisoned after a failed I/O boundary.");
  };
  const assertHeldRaw = async (expectedBytes) => {
    const information = await assertHandlePathIdentity(
      heldRaw.handle,
      rawPath,
      outputIdentity,
      "Raw disk ledger",
    );
    if (
      !sameIdentity(information, heldRaw.identity)
      || information.size !== expectedBytes
    ) throw new Error("Raw disk ledger pathname, identity, or byte length changed.");
    return information;
  };
  return Object.freeze({
    paths: Object.freeze({ rawPath, checkpointPath }),
    async append(event) {
      assertWritable();
      if (state.records >= maximumRecords) throw new Error("Disk ledger record bound reached.");
      if (event.integrity !== undefined) throw new Error("Caller cannot supply ledger integrity.");
      const key = workKey(event);
      if (typeof key !== "string" || key.length < 1 || state.completed.has(key)) {
        throw new Error(`Work unit already completed or invalid: ${key}`);
      }
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
      try {
        const line = `${JSON.stringify(record)}\n`;
        if (line.includes("\r")) throw new TypeError("Disk ledger record contains CR bytes.");
        const lineBytes = Buffer.from(line, "utf8");
        await assertHeldRaw(expectedRawBytes);
        if (expectedRawBytes + BigInt(lineBytes.length) > BigInt(maximumRawBytes)) {
          throw new Error("Raw disk ledger append exceeds its frozen byte bound.");
        }
        const { bytesWritten } = await heldRaw.handle.write(
          lineBytes,
          0,
          lineBytes.length,
          null,
        );
        if (bytesWritten !== lineBytes.length) {
          throw new Error("Raw disk ledger append was incomplete.");
        }
        expectedRawBytes += BigInt(lineBytes.length);
        await heldRaw.handle.sync();
        await assertHeldRaw(expectedRawBytes);
      } catch (error) {
        poisoned = true;
        throw error;
      }
      state.digest.update(payload);
      state.previousHash = record.integrity.record_sha256;
      state.completed.add(key);
      state.records += 1;
      checkpointStatus = "stale";
      return record;
    },
    async saveCheckpoint() {
      assertWritable();
      const document = checkpointDocument({ artifact, ledgerFormat, state, runIdentity });
      try {
        await assertHeldRaw(expectedRawBytes);
        await replaceCheckpointBounded(
          checkpointPath,
          `${JSON.stringify(document, null, 2)}\n`,
          outputIdentity,
          maximumCheckpointBytes,
        );
        await assertHeldRaw(expectedRawBytes);
      } catch (error) {
        poisoned = true;
        throw error;
      }
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
    async close() {
      if (rawHandleClosed) return false;
      rawHandleClosed = true;
      await heldRaw.handle.close();
      return true;
    },
  });
  } catch (error) {
    if (!rawHandleClosed) {
      rawHandleClosed = true;
      await heldRaw.handle.close().catch(() => {});
    }
    throw error;
  }
}
