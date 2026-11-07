import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import {
  lstat,
  mkdtemp,
  rm,
  unlink,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

import { readStableOpenedFile } from "./lib/opened-file.mjs";
import { parseStrictJson } from "./lib/strict-json.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const scriptDirectory = path.dirname(scriptPath);
const lockPath = path.join(scriptDirectory, "npm-runtime-lock.json");
const execFileAsync = promisify(execFile);
const lockFields = Object.freeze(["schema", "sha256", "size", "url", "version"]);
const maximumLockBytes = 1_024;
const fetchTimeoutMilliseconds = 60_000;
const installTimeoutMilliseconds = 120_000;
const verifyTimeoutMilliseconds = 10_000;
const installOutputBytes = 1_048_576;
const verifyOutputBytes = 4_096;

export const EXPECTED_NPM_RUNTIME_LOCK = Object.freeze({
  schema: 1,
  version: "12.2.1",
  url: "https://registry.npmjs.org/npm/-/npm-12.2.1.tgz",
  size: 3_062_824,
  sha256: "228bd64aaef23270dbdbd2cf3d5ef5c467602ef38c4066246cef1984adab9a67",
});

function refuse(reason) {
  throw new Error(`Refusing locked npm bootstrap: ${reason}`);
}

function exactLockFields(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    refuse("scripts/npm-runtime-lock.json must contain one JSON object");
  }
  const actualFields = Object.keys(value).sort();
  if (actualFields.length !== lockFields.length
    || actualFields.some((field, index) => field !== lockFields[index])) {
    refuse(`scripts/npm-runtime-lock.json must contain exactly: ${lockFields.join(", ")}`);
  }
}

export function parseNpmRuntimeLock(bytes) {
  const value = parseStrictJson(bytes, {
    label: "scripts/npm-runtime-lock.json",
    maximumDepth: 2,
    maximumContainerEntries: 8,
  });
  exactLockFields(value);
  for (const field of lockFields) {
    if (value[field] !== EXPECTED_NPM_RUNTIME_LOCK[field]) {
      refuse(`scripts/npm-runtime-lock.json has an unexpected ${field}`);
    }
  }
  return EXPECTED_NPM_RUNTIME_LOCK;
}

export async function loadNpmRuntimeLock(file = lockPath) {
  const bytes = await readStableOpenedFile(file, {
    containedBy: scriptDirectory,
    label: "locked npm runtime manifest",
    maximumBytes: maximumLockBytes,
  });
  return parseNpmRuntimeLock(bytes);
}

function validateDownloadContract(lock, archivePath, fetchImplementation) {
  if (lock === null || typeof lock !== "object") refuse("download lock is missing");
  if (lock.url !== EXPECTED_NPM_RUNTIME_LOCK.url) refuse("download URL is not the locked npm URL");
  if (!Number.isSafeInteger(lock.size) || lock.size < 1 || lock.size > EXPECTED_NPM_RUNTIME_LOCK.size) {
    refuse("download size is outside the locked bound");
  }
  if (typeof lock.sha256 !== "string" || !/^[0-9a-f]{64}$/u.test(lock.sha256)) {
    refuse("download SHA-256 is invalid");
  }
  if (typeof archivePath !== "string" || archivePath.length === 0) refuse("archive path is missing");
  if (typeof fetchImplementation !== "function") refuse("fetch is unavailable");
}

function createIntegrityTransform(lock, observation) {
  return new Transform({
    transform(chunk, encoding, callback) {
      void encoding;
      observation.size += chunk.byteLength;
      if (observation.size > lock.size) {
        callback(new Error(`npm tarball exceeds the locked ${lock.size}-byte size`));
        return;
      }
      observation.hash.update(chunk);
      callback(null, chunk);
    },
  });
}

function validateResponse(response, lock) {
  if (response === null || typeof response !== "object") refuse("npm registry returned no response");
  if (response.status !== 200) refuse(`npm registry returned HTTP ${response.status}`);
  if (response.url !== lock.url) refuse("npm registry response URL differs from the locked URL");
  if (response.headers?.get("content-length") !== String(lock.size)) {
    refuse("npm registry Content-Length differs from the locked size");
  }
  const contentEncoding = response.headers.get("content-encoding");
  if (contentEncoding !== null && contentEncoding !== "identity") {
    refuse(`npm registry applied unexpected Content-Encoding ${contentEncoding}`);
  }
  if (typeof response.body?.getReader !== "function") refuse("npm registry response body is unavailable");
}

async function removePartialArchive(archivePath, operationError) {
  try {
    await unlink(archivePath);
  } catch (cleanupError) {
    if (cleanupError?.code !== "ENOENT") {
      throw new AggregateError([operationError, cleanupError], "npm archive download and cleanup both failed", { cause: cleanupError });
    }
  }
  throw operationError;
}

export async function downloadLockedNpmArchive(
  lock,
  archivePath,
  { fetchImplementation = globalThis.fetch } = {},
) {
  validateDownloadContract(lock, archivePath, fetchImplementation);
  const signal = AbortSignal.timeout(fetchTimeoutMilliseconds);
  const response = await fetchImplementation(lock.url, {
    credentials: "omit",
    headers: { accept: "application/octet-stream", "accept-encoding": "identity" },
    redirect: "error",
    signal,
  });
  validateResponse(response, lock);
  const observation = { hash: createHash("sha256"), size: 0 };
  try {
    await pipeline(
      Readable.fromWeb(response.body),
      createIntegrityTransform(lock, observation),
      createWriteStream(archivePath, { flags: "wx", mode: 0o600 }),
    );
    const information = await lstat(archivePath, { bigint: true });
    if (!information.isFile() || information.isSymbolicLink()) refuse("downloaded npm archive is not a regular file");
    if (observation.size !== lock.size || information.size !== BigInt(lock.size)) {
      refuse("downloaded npm archive is shorter than the locked size");
    }
    const sha256 = observation.hash.digest("hex");
    if (sha256 !== lock.sha256) refuse("downloaded npm archive SHA-256 differs from the lock");
    return Object.freeze({ archivePath, sha256, size: observation.size });
  } catch (error) {
    return removePartialArchive(archivePath, error);
  }
}

async function verifyArchive(lock, archivePath) {
  const bytes = await readStableOpenedFile(archivePath, {
    containedBy: path.dirname(archivePath),
    label: "downloaded npm archive",
    maximumBytes: lock.size,
  });
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (bytes.byteLength !== lock.size || digest !== lock.sha256) {
    refuse("downloaded npm archive changed after verification");
  }
}

function npmExecutable() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function npmEnvironment() {
  return {
    ...process.env,
    NPM_CONFIG_AUDIT: "false",
    NPM_CONFIG_FUND: "false",
    NPM_CONFIG_IGNORE_SCRIPTS: "true",
    NPM_CONFIG_OFFLINE: "true",
    NPM_CONFIG_UPDATE_NOTIFIER: "false",
  };
}

async function runNpm(arguments_, timeout, maxBuffer) {
  return execFileAsync(npmExecutable(), arguments_, {
    encoding: "utf8",
    env: npmEnvironment(),
    killSignal: "SIGKILL",
    maxBuffer,
    timeout,
    windowsHide: true,
  });
}

export async function installLockedNpm(lock, archivePath) {
  await verifyArchive(lock, archivePath);
  await runNpm([
    "install",
    "--global",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "--offline",
    archivePath,
  ], installTimeoutMilliseconds, installOutputBytes);
  const result = await runNpm(["--version"], verifyTimeoutMilliseconds, verifyOutputBytes);
  if (result.stdout.trim() !== lock.version) {
    refuse(`npm reported ${JSON.stringify(result.stdout.trim())} after installing ${lock.version}`);
  }
  await verifyArchive(lock, archivePath);
}

export function parseInstallerArguments(argv) {
  if (!Array.isArray(argv) || argv.length !== 0) refuse("this command accepts no arguments");
}

export async function installLockedNpmRuntime() {
  const lock = await loadNpmRuntimeLock();
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "20w-npm-bootstrap-"));
  const archivePath = path.join(temporaryRoot, `npm-${lock.version}.tgz`);
  try {
    await downloadLockedNpmArchive(lock, archivePath);
    await installLockedNpm(lock, archivePath);
    return lock.version;
  } finally {
    await rm(temporaryRoot, { force: true, maxRetries: 3, recursive: true, retryDelay: 50 });
  }
}

async function main() {
  parseInstallerArguments(process.argv.slice(2));
  const version = await installLockedNpmRuntime();
  console.log(`Installed and verified locked npm ${version}.`);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
