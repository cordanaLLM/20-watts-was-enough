import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { copyFile, lstat, open, readFile, rename, rm } from "node:fs/promises";
import { hostname } from "node:os";
import path from "node:path";

// Same owner record as tooling/internal/pdfrender/publication_lock_owner.go,
// so either writer can recover a lock the other left behind.
const maximumLockOwnerBytes = 4096;
const lockOwnerPattern = /^pid=([1-9][0-9]*)\nhost=([^\n]+)\ntoken=([^\n]+)\n$/u;

export function parseLockOwner(body) {
  const match = lockOwnerPattern.exec(body);
  if (!match || !Number.isSafeInteger(Number(match[1]))) return undefined;
  return { pid: Number(match[1]), host: match[2] };
}

function processExited(pid) {
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return error?.code === "ESRCH";
  }
}

// Removes the lock only when its owner record names an exited process on this
// host and the file is still the one that was read; returns why it was kept.
async function removeStaleLock(file) {
  const before = await lstat(file);
  if (!before.isFile() || before.size > maximumLockOwnerBytes) return "lock is not a small regular file";
  const owner = parseLockOwner(await readFile(file, "utf8"));
  if (!owner) return "lock owner record is not pid, host and token lines";
  if (owner.host !== hostname()) return `lock is held by host ${owner.host}, not this host`;
  if (owner.pid === process.pid || !processExited(owner.pid)) {
    return `lock owner process ${owner.pid} is still running`;
  }
  const current = await lstat(file);
  if (current.dev !== before.dev || current.ino !== before.ino) return "lock changed while its owner was checked";
  await rm(file);
  return undefined;
}

async function regularFileExists(file, operations) {
  try {
    const information = await operations.lstat(file);
    if (!information.isFile() || information.isSymbolicLink()) {
      throw new Error(`Generated publication path must be a regular non-symlink file: ${file}`);
    }
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function restore(destination, backup, hadPrevious, operations) {
  await operations.rm(destination, { force: true });
  if (hadPrevious) await operations.rename(backup, destination);
}

export async function replaceFilePair(
  pairInput,
  operationOverrides = {},
) {
  if (!Array.isArray(pairInput) || pairInput.length !== 2) {
    throw new Error("Generated publication replacement requires exactly two files.");
  }
  const operations = { copyFile, lstat, rename, rm, ...operationOverrides };
  const [first, second] = pairInput;
  const identities = [first, second].flatMap((pair) => [pair?.staged, pair?.destination]);
  if (
    identities.some((file) => typeof file !== "string" || !path.isAbsolute(file))
    || new Set(identities).size !== identities.length
    || [first, second].some((pair) => path.dirname(pair.staged) !== path.dirname(pair.destination))
  ) {
    throw new Error("Generated publication paths must be distinct absolute files staged beside their destinations.");
  }
  const backupIdentity = randomUUID();
  const pairs = [first, second].map((pair, index) => ({
    ...pair,
    backup: `${pair.destination}.backup-${backupIdentity}-${index}`,
  }));
  await Promise.all(pairs.map(({ staged }) => regularFileExists(staged, operations).then((exists) => {
    if (!exists) throw new Error(`Generated publication stage is missing: ${staged}`);
  })));
  const previous = await Promise.all(pairs.map(({ destination }) => (
    regularFileExists(destination, operations)
  )));
  let publicationStarted = false;
  let preserveBackups = false;

  try {
    for (const [index, pair] of pairs.entries()) {
      if (previous[index]) {
        await operations.copyFile(pair.destination, pair.backup, constants.COPYFILE_EXCL);
      }
    }
    publicationStarted = true;
    await operations.rename(pairs[0].staged, pairs[0].destination);
    await operations.rename(pairs[1].staged, pairs[1].destination);
  } catch (error) {
    if (!publicationStarted) throw error;
    const rollback = await Promise.allSettled(pairs.map((pair, index) => (
      restore(pair.destination, pair.backup, previous[index], operations)
    )));
    const rollbackFailures = rollback.filter((result) => result.status === "rejected");
    if (rollbackFailures.length > 0) {
      preserveBackups = true;
      throw new AggregateError(
        [error, ...rollbackFailures.map((result) => result.reason)],
        `Generated artifact replacement and rollback both failed; recovery backups remain at ${pairs.map(({ backup }) => backup).join(", ")}.`,
      );
    }
    throw error;
  } finally {
    if (!preserveBackups) {
      await Promise.allSettled(pairs.map(({ backup }) => operations.rm(backup, { force: true })));
    }
  }
}

async function openExclusiveLock(file, label) {
  try {
    return await open(file, "wx", 0o600);
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    // A lock that disappears while it is checked is simply retried.
    const kept = await removeStaleLock(file).catch((failure) => {
      if (failure?.code === "ENOENT") return undefined;
      throw failure;
    });
    if (kept) throw new Error(`${label} is already locked: ${file}: ${kept}`, { cause: error });
  }
  try {
    return await open(file, "wx", 0o600);
  } catch (error) {
    if (error?.code === "EEXIST") throw new Error(`${label} is already locked: ${file}`, { cause: error });
    throw error;
  }
}

export async function acquireExclusiveFileLock(file, label = "generated publication") {
  let handle = await openExclusiveLock(file, label);
  try {
    await handle.writeFile(`pid=${process.pid}\nhost=${hostname()}\ntoken=${randomUUID()}\n`, "utf8");
    const identity = await handle.stat();
    let released = false;
    return Object.freeze({
      async release() {
        if (released) throw new Error(`${label} lock was already released.`);
        const current = await lstat(file);
        if (!current.isFile() || current.isSymbolicLink()
            || current.dev !== identity.dev || current.ino !== identity.ino) {
          throw new Error(`${label} lock changed while held: ${file}`);
        }
        await handle.close();
        handle = undefined;
        await rm(file);
        released = true;
      },
    });
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await rm(file, { force: true }).catch(() => undefined);
    throw error;
  }
}
