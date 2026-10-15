import { createHash, randomBytes } from "node:crypto";
import { access, open, readFile, unlink } from "node:fs/promises";
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

export async function acquireRunLock({ outputDirectory, runnerId }) {
  if (typeof runnerId !== "string" || runnerId.trim() === "") {
    throw new TypeError("Run lock requires a non-empty runnerId.");
  }
  const resolvedOutput = resolvedOutputDirectory(outputDirectory);
  const lockPath = runLockPath(resolvedOutput);
  await access(path.dirname(resolvedOutput));
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
    handle = await open(lockPath, "wx", 0o600);
  } catch (error) {
    if (error.code === "EEXIST") throw new RunLockContentionError(lockPath);
    throw error;
  }
  try {
    await handle.writeFile(`${JSON.stringify(ownership, null, 2)}\n`, "utf8");
    await handle.sync();
  } catch (error) {
    await handle.close().catch(() => {});
    await unlink(lockPath).catch(() => {});
    throw error;
  }

  let closed = false;
  return Object.freeze({
    lockPath,
    ownership,
    async release() {
      if (closed) return false;
      let document;
      try {
        document = JSON.parse(await readFile(lockPath, "utf8"));
      } catch (error) {
        await handle.close().catch(() => {});
        closed = true;
        throw new Error(`Run lock disappeared or became unreadable before release: ${error.message}`, { cause: error });
      }
      if (!ownershipMatches(document, ownership, token)) {
        await handle.close().catch(() => {});
        closed = true;
        throw new Error("Run lock ownership changed; refusing to remove a lock not owned by this lease.");
      }
      await handle.close();
      closed = true;
      await unlink(lockPath);
      return true;
    },
  });
}
