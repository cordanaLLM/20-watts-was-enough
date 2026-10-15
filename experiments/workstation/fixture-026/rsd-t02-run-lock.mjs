import { createHash, randomBytes } from "node:crypto";
import { link, lstat, open, realpath, rename } from "node:fs/promises";
import path from "node:path";

export const FIXTURE_026_RSD_T02_RUN_LOCK_VERSION = "fixture-026.rsd-t02-run-lock.v1";
export const FIXTURE_026_RSD_T02_RETIRED_LOCK_POLICY = Object.freeze({
  policy: "retain-randomized-retired-lock-artifact-v1",
  canonical_path_released_by: "atomic-rename-to-randomized-sibling",
  retired_path_unlink_permitted: false,
  automatic_cleanup_permitted: false,
  authority: "operational-lock-retirement-only",
  result_label: "NO_RESULT",
});

const MAX_LOCK_BYTES = 16 * 1024;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizedPath(value) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function samePath(left, right) {
  return normalizedPath(left) === normalizedPath(right);
}

function resolvedOutputDirectory(outputDirectory) {
  if (typeof outputDirectory !== "string" || outputDirectory.trim() === "") {
    throw new TypeError("Fixture 026 RSD-T02 run lease requires an output directory.");
  }
  return path.resolve(outputDirectory);
}

export function fixture026RsdT02RunLockPath(outputDirectory) {
  return `${resolvedOutputDirectory(outputDirectory)}.rsd-t02.run.lock`;
}

export class Fixture026RsdT02RunLockContentionError extends Error {
  constructor(lockPath) {
    super(`Fixture 026 RSD-T02 output has a live exclusive writer: ${lockPath}`);
    this.name = "Fixture026RsdT02RunLockContentionError";
    this.code = "FIXTURE_026_RSD_T02_RUN_LOCK_CONTENDED";
    this.lockPath = lockPath;
  }
}

function ownershipMatches(document, ownership, token) {
  return document?.schema === 1
    && document.contract_version === FIXTURE_026_RSD_T02_RUN_LOCK_VERSION
    && document.lock_id === ownership.lock_id
    && document.runner_id === ownership.runner_id
    && document.output_directory_sha256 === ownership.output_directory_sha256
    && document.ownership_token_sha256 === sha256(token)
    && document.auto_break === false;
}

function fileIdentity(stat, label) {
  const identity = Object.freeze({ dev: String(stat.dev), ino: String(stat.ino) });
  if (identity.dev === "0" && identity.ino === "0") {
    throw new Error(`${label} filesystem does not expose a usable file identity.`);
  }
  return identity;
}

function sameIdentity(left, right) {
  return String(left.dev) === String(right.dev) && String(left.ino) === String(right.ino);
}

async function optionalLstat(file) {
  try {
    return await lstat(file, { bigint: true });
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function pathIdentity(file, label) {
  const information = await optionalLstat(file);
  if (information === null) throw new Error(`${label} disappeared.`);
  if (
    !information.isFile()
    || information.isSymbolicLink()
    || information.nlink !== 1n
    || !samePath(await realpath(file), file)
  ) throw new Error(`${label} is redirected, reparse-backed, or hard-linked.`);
  return { information, identity: fileIdentity(information, label) };
}

async function handleIdentity(handle, label) {
  const information = await handle.stat({ bigint: true });
  if (!information.isFile() || information.nlink !== 1n) {
    throw new Error(`${label} handle is not a private regular file.`);
  }
  return { information, identity: fileIdentity(information, label) };
}

async function assertHandleNamesPath(handle, file, expectedIdentity, label) {
  const [opened, named] = await Promise.all([
    handleIdentity(handle, label),
    pathIdentity(file, label),
  ]);
  if (
    !sameIdentity(opened.identity, expectedIdentity)
    || !sameIdentity(named.identity, expectedIdentity)
  ) throw new Error(`${label} pathname no longer names the acquired handle.`);
}

async function readOwnershipFromHandle(handle) {
  const information = await handle.stat({ bigint: true });
  if (information.size > BigInt(MAX_LOCK_BYTES)) {
    throw new Error("Fixture 026 RSD-T02 run lease exceeds its byte bound.");
  }
  const buffer = Buffer.alloc(Number(information.size));
  let offset = 0;
  while (offset < buffer.length) {
    const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
    if (bytesRead === 0) break;
    offset += bytesRead;
  }
  if (offset !== buffer.length) throw new Error("Fixture 026 RSD-T02 run lease read was torn.");
  const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  if (text.includes("\r") || !text.endsWith("\n")) {
    throw new Error("Fixture 026 RSD-T02 run lease is not canonical LF JSON.");
  }
  return JSON.parse(text);
}

async function restoreQuarantinedPath(quarantinePath, lockPath) {
  try {
    await link(quarantinePath, lockPath);
    return true;
  } catch {
    return false;
  }
}

async function acquireRunLock({ outputDirectory, runnerId }, testHooks = null) {
  if (typeof runnerId !== "string" || runnerId.trim() === "") {
    throw new TypeError("Fixture 026 RSD-T02 run lease requires a runner ID.");
  }
  const resolvedOutput = resolvedOutputDirectory(outputDirectory);
  const lockPath = fixture026RsdT02RunLockPath(resolvedOutput);
  const token = randomBytes(32);
  const ownership = Object.freeze({
    schema: 1,
    contract_version: FIXTURE_026_RSD_T02_RUN_LOCK_VERSION,
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
    handle = await open(lockPath, "wx+", 0o600);
  } catch (error) {
    if (error.code === "EEXIST") throw new Fixture026RsdT02RunLockContentionError(lockPath);
    throw error;
  }
  let acquiredIdentity;
  try {
    await handle.writeFile(`${JSON.stringify(ownership, null, 2)}\n`, "utf8");
    await handle.sync();
    acquiredIdentity = (await handleIdentity(handle, "Fixture 026 RSD-T02 run lease")).identity;
    await testHooks?.after_acquired_identity?.({ lockPath, ownership });
    await assertHandleNamesPath(
      handle,
      lockPath,
      acquiredIdentity,
      "Fixture 026 RSD-T02 run lease",
    );
  } catch (error) {
    await handle.close().catch(() => {});
    // An acquisition failure after exclusive creation has no portable
    // unlink-by-handle primitive. Retain every possibly replaced pathname for
    // explicit manual recovery instead of risking deletion of a foreign file.
    throw error;
  }
  let closed = false;
  return Object.freeze({
    lockPath,
    ownership,
    async release() {
      if (closed) return false;
      try {
        await assertHandleNamesPath(
          handle,
          lockPath,
          acquiredIdentity,
          "Fixture 026 RSD-T02 run lease",
        );
        const document = await readOwnershipFromHandle(handle);
        if (!ownershipMatches(document, ownership, token)) {
          throw new Error("Fixture 026 RSD-T02 run lease ownership changed.");
        }
        await testHooks?.after_identity_verified?.({ lockPath, ownership });
        const quarantinePath = `${lockPath}.release-${ownership.lock_id}-${randomBytes(16).toString("hex")}`;
        await rename(lockPath, quarantinePath);
        try {
          await assertHandleNamesPath(
            handle,
            quarantinePath,
            acquiredIdentity,
            "Fixture 026 RSD-T02 quarantined run lease",
          );
          const quarantinedDocument = await readOwnershipFromHandle(handle);
          if (!ownershipMatches(quarantinedDocument, ownership, token)) {
            throw new Error("Fixture 026 RSD-T02 quarantined run lease ownership changed.");
          }
          await testHooks?.after_quarantine_verified?.({
            lockPath,
            quarantinePath,
            ownership,
          });
          await assertHandleNamesPath(
            handle,
            quarantinePath,
            acquiredIdentity,
            "Fixture 026 RSD-T02 retired run lease",
          );
          const retiredDocument = await readOwnershipFromHandle(handle);
          if (!ownershipMatches(retiredDocument, ownership, token)) {
            throw new Error("Fixture 026 RSD-T02 retired run lease ownership changed.");
          }
        } catch (error) {
          await restoreQuarantinedPath(quarantinePath, lockPath);
          throw error;
        }
        await handle.close();
        closed = true;
        return true;
      } catch (error) {
        await handle.close().catch(() => {});
        closed = true;
        const changed = /ownership changed/u.test(error.message)
          ? "ownership changed"
          : "identity changed";
        throw new Error(
          `Fixture 026 RSD-T02 run lease ${changed}; refusing foreign-lock removal. `
          + error.message,
          { cause: error },
        );
      }
    },
  });
}

export function acquireFixture026RsdT02RunLock(options) {
  return acquireRunLock(options);
}

export function acquireFixture026RsdT02RunLockForReleaseRaceTest(options, testHooks) {
  if (
    !testHooks
    || typeof testHooks !== "object"
    || typeof testHooks.after_identity_verified !== "function"
  ) throw new TypeError("Release-race test hook is required.");
  return acquireRunLock(options, testHooks);
}
