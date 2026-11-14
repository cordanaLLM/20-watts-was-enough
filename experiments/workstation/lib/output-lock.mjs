import { randomBytes } from "node:crypto";
import { open, rm } from "node:fs/promises";
import { constants } from "node:fs";
import { sha256Hex } from "./checkpoint-ledger.mjs";

const LOCK_DOCUMENT_MAX_BYTES = 4096;

class OutputLockDeadline extends Error {}

async function lockIo(operation, label, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      operation(AbortSignal.timeout(timeoutMs)),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new OutputLockDeadline(`Output lock deadline: ${label}.`)), timeoutMs);
      }),
    ]);
  } finally { clearTimeout(timer); }
}

async function cleanupFailedLock(handle, lockPath, timeoutMs, removeLock, error) {
  const cleanupErrors = [];
  const operations = [
    [() => handle.close(), "close"],
    [() => removeLock(lockPath), "remove"],
  ];
  for (const [operation, label] of operations) {
    try { await lockIo(operation, label + " " + lockPath, timeoutMs); }
    catch (cleanupError) { cleanupErrors.push(cleanupError); }
  }
  if (cleanupErrors.length > 0) error.cleanupErrors = cleanupErrors;
}

async function openWithLateCleanup(operation, label, timeoutMs, cleanupLateHandle) {
  const pending = Promise.resolve().then(operation);
  try {
    return await lockIo(() => pending, label, timeoutMs);
  } catch (error) {
    if (error instanceof OutputLockDeadline) {
      void pending.then(
        (handle) => cleanupLateHandle(handle, error),
        (openError) => { error.lateOpenError = openError; },
      ).catch((cleanupError) => { (error.cleanupErrors ??= []).push(cleanupError); });
    }
    throw error;
  }
}

async function openLockHandle(lockPath, timeoutMs, openLock, removeLock) {
  return openWithLateCleanup(() => openLock(lockPath, "wx", 0o600), `open ${lockPath}`, timeoutMs,
    (handle, error) => cleanupFailedLock(handle, lockPath, timeoutMs, removeLock, error));
}

async function readLockDocument(lockPath, artifact, timeoutMs, openLock) {
  const flags = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);
  const reader = await openWithLateCleanup(() => openLock(lockPath, flags), `open read ${lockPath}`, timeoutMs,
    (handle) => lockIo(() => handle.close(), `close read ${lockPath}`, timeoutMs));
  try {
    const buffer = Buffer.alloc(LOCK_DOCUMENT_MAX_BYTES);
    const { bytesRead } = await lockIo(() => reader.read(buffer, 0, buffer.length, 0), `read ${lockPath}`, timeoutMs);
    const { size } = await lockIo(() => reader.stat(), `stat ${lockPath}`, timeoutMs);
    if (size > LOCK_DOCUMENT_MAX_BYTES) {
      throw new Error(`Fixture ${artifact.slice(8)} lock document exceeds ${LOCK_DOCUMENT_MAX_BYTES} bytes.`);
    }
    if (bytesRead !== size) throw new Error(`Fixture ${artifact.slice(8)} lock document read incomplete.`);
    return JSON.parse(buffer.subarray(0, bytesRead).toString("utf8"));
  } finally {
    await lockIo(() => reader.close(), `close read ${lockPath}`, timeoutMs);
  }
}

export async function acquireLock(directory, artifact, timeoutMs = 30000,
  { open: openLock = open, rm: removeLock = rm } = {}) {
  const lockPath = `${directory}.${artifact}.lock`;
  const token = randomBytes(32).toString("hex");
  const handle = await openLockHandle(lockPath, timeoutMs, openLock, removeLock);
  try {
    const body = `${JSON.stringify({ schema: 1, artifact, token_sha256: sha256Hex(token) })}\n`;
    await lockIo((signal) => handle.writeFile(body, { signal }), `write ${lockPath}`, timeoutMs);
    await lockIo(() => handle.sync(), `sync ${lockPath}`, timeoutMs);
  } catch (error) {
    await cleanupFailedLock(handle, lockPath, timeoutMs, removeLock, error);
    throw error;
  }
  return Object.freeze({
    async release() {
      const document = await readLockDocument(lockPath, artifact, timeoutMs, openLock);
      if (document.token_sha256 !== sha256Hex(token)) {
        throw new Error(`Fixture ${artifact.slice(8)} lock ownership changed.`);
      }
      await lockIo(() => handle.close(), `close ${lockPath}`, timeoutMs);
      await lockIo(() => removeLock(lockPath), `remove ${lockPath}`, timeoutMs);
    },
  });
}
