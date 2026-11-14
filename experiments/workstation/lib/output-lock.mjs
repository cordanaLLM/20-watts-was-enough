import { randomBytes } from "node:crypto";
import { open, readFile, rm } from "node:fs/promises";
import { sha256Hex } from "./checkpoint-ledger.mjs";

async function lockIo(operation, label, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      operation(AbortSignal.timeout(timeoutMs)),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Output lock deadline: ${label}.`)), timeoutMs);
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

export async function acquireLock(directory, artifact, timeoutMs = 30000,
  { open: openLock = open, rm: removeLock = rm } = {}) {
  const lockPath = `${directory}.${artifact}.lock`;
  const token = randomBytes(32).toString("hex");
  const handle = await lockIo(() => openLock(lockPath, "wx", 0o600), `open ${lockPath}`, timeoutMs);
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
      const raw = await lockIo((signal) => readFile(lockPath, { encoding: "utf8", signal }),
        `read ${lockPath}`, timeoutMs);
      const document = JSON.parse(raw);
      if (document.token_sha256 !== sha256Hex(token)) {
        throw new Error(`Fixture ${artifact.slice(8)} lock ownership changed.`);
      }
      await lockIo(() => handle.close(), `close ${lockPath}`, timeoutMs);
      await lockIo(() => removeLock(lockPath), `remove ${lockPath}`, timeoutMs);
    },
  });
}
