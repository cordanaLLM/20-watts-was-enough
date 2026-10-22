import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export const RUN_LOCK_SCHEMA = 1;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function resolvedOutputDirectory(outputDirectory) {
  if (typeof outputDirectory !== "string" || outputDirectory.trim() === "") {
    throw new TypeError("Run lock requires a non-empty outputDirectory.");
  }
  return path.resolve(outputDirectory);
}

export function runLockPath(outputDirectory) {
  return `${resolvedOutputDirectory(outputDirectory)}.run.lock`;
}

function ownershipMatches(document, ownership, token) {
  return document?.schema === RUN_LOCK_SCHEMA
    && document.lock_id === ownership.lock_id
    && document.runner_id === ownership.runner_id
    && document.output_directory_sha256 === ownership.output_directory_sha256
    && document.ownership_token_sha256 === sha256(token)
    && document.auto_break === false;
}

export class RunLockContentionError extends Error {
  constructor(lockPath) {
    super(`Run output is already exclusively locked: ${lockPath}`);
    this.name = "RunLockContentionError";
    this.code = "CANDIDATE_010_RUN_LOCK_CONTENDED";
    this.lockPath = lockPath;
  }
}

async function closeHandleSafely(handle) {
  try {
    await handle.close();
  } catch (error) {
    if (error?.code !== "ENOENT") return error;
  }
  return null;
}

async function cleanupFailedLock(handle, lockPath, error) {
  const cleanupErrors = [];
  const closeError = await closeHandleSafely(handle);
  if (closeError) cleanupErrors.push(closeError);
  try {
    await fs.unlink(lockPath);
  } catch (unlinkError) {
    if (unlinkError?.code !== "ENOENT") {
      cleanupErrors.push(unlinkError);
    }
  }
  if (cleanupErrors.length > 0) {
    throw new AggregateError([error, ...cleanupErrors], `Failed to acquire run lock: ${error.message}`, { cause: error });
  }
  throw error;
}

async function executeRelease(handle, lockPath, ownership, token) {
  let document;
  try {
    document = JSON.parse(await fs.readFile(lockPath, "utf8"));
  } catch (error) {
    const closeError = await closeHandleSafely(handle);
    if (closeError) {
      throw new AggregateError([error, closeError], `Run lock disappeared or became unreadable before release: ${error.message}`, { cause: error });
    }
    throw new Error(`Run lock disappeared or became unreadable before release: ${error.message}`, { cause: error });
  }
  if (!ownershipMatches(document, ownership, token)) {
    const closeError = await closeHandleSafely(handle);
    if (closeError) {
      throw new Error("Run lock ownership changed; refusing to remove a lock not owned by this lease.", { cause: closeError });
    }
    throw new Error("Run lock ownership changed; refusing to remove a lock not owned by this lease.");
  }
  await handle.close();
  await fs.unlink(lockPath);
}

export async function acquireRunLock({ outputDirectory, runnerId }) {
  if (typeof runnerId !== "string" || runnerId.trim() === "") {
    throw new TypeError("Run lock requires a non-empty runnerId.");
  }
  const resolvedOutput = resolvedOutputDirectory(outputDirectory);
  const lockPath = runLockPath(resolvedOutput);
  await fs.access(path.dirname(resolvedOutput));
  const token = randomBytes(32);
  const ownership = Object.freeze({
    schema: RUN_LOCK_SCHEMA,
    lock_id: randomBytes(16).toString("hex"),
    runner_id: runnerId,
    process_id: process.pid,
    acquired_at: new Date().toISOString(),
    output_directory_sha256: sha256(resolvedOutput),
    ownership_token_sha256: sha256(token),
    auto_break: false,
  });
  let handle;
  try {
    handle = await fs.open(lockPath, "wx", 0o600);
  } catch (error) {
    if (error.code === "EEXIST") throw new RunLockContentionError(lockPath);
    throw error;
  }
  try {
    await handle.writeFile(`${JSON.stringify(ownership, null, 2)}\n`, "utf8");
    await handle.sync();
  } catch (error) {
    await cleanupFailedLock(handle, lockPath, error);
  }

  let closed = false;
  return Object.freeze({
    lockPath,
    ownership,
    async release() {
      if (closed) return false;
      closed = true;
      await executeRelease(handle, lockPath, ownership, token);
      return true;
    },
  });
}
