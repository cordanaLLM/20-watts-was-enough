import { lstat, mkdir, open, readFile, readdir, rename, realpath, unlink } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { canonical } from "./contract.mjs";

export const OUTPUT_CAP = 52428800;
const IO_TIMEOUT_MS = 30000;

export class IoDeadline extends Error {
  constructor(label, settled) {
    super(`I/O deadline: ${label}; operation settled=${settled}.`);
    this.name = "IoDeadline";
    this.label = label;
    this.settled = settled;
  }
}

export async function io(operation, label, timeoutMs = IO_TIMEOUT_MS) {
  const controller = new AbortController();
  const timers = [];
  const timeout = () => new Promise((resolve) => {
    timers.push(setTimeout(() => resolve(null), timeoutMs));
  });
  try {
    const pending = Promise.resolve().then(() => operation(controller.signal)).then(
      (value) => ({ value }), (error) => ({ error, failed: true }));
    const result = await Promise.race([pending, timeout()]);
    if (result === null) {
      controller.abort();
      const settlement = await Promise.race([pending, timeout()]);
      throw new IoDeadline(label, settlement !== null);
    }
    if (result.failed) throw result.error;
    return result.value;
  } catch (error) {
    throw new Error(`ICP-T01 ${label}: ${error?.message ?? String(error)}`, { cause: error });
  } finally {
    for (const timer of timers) clearTimeout(timer);
  }
}

export async function readText(file) {
  const info = await io(() => lstat(file), `stat ${file}`);
  if (!info.isFile() || info.size > OUTPUT_CAP) throw new Error(`ICP-T01 unsafe or oversized file ${file}.`);
  return io((signal) => readFile(file, { encoding: "utf8", signal }), `read ${file}`);
}

export async function optionalText(file) {
  try {
    return await readText(file);
  } catch (error) {
    if (error.cause?.code === "ENOENT") return null;
    throw error;
  }
}

export async function json(file) {
  try {
    return JSON.parse(await readText(file));
  } catch (error) {
    throw new Error(`ICP-T01 JSON ${file}: ${error.message}`, { cause: error });
  }
}

export async function atomicText(file, body) {
  if (Buffer.byteLength(body) > OUTPUT_CAP) throw new Error("ICP-T01 output cap exceeded.");
  const temporary = `${file}.pending`;
  const existing = await optionalText(temporary);
  if (existing !== null && !body.startsWith(existing)) throw new Error(`ICP-T01 conflicting interrupted write ${temporary}.`);
  const handle = await pendingHandle(temporary, existing === null);
  try {
    if (existing !== body) await io((signal) => handle.writeFile(body, { signal }), `write ${temporary}`);
    await io(() => handle.sync(), `sync ${temporary}`);
  } finally {
    await io(() => handle.close(), `close ${temporary}`);
  }
  await io(() => rename(temporary, file), `rename ${file}`);
  await syncDirectory(path.dirname(file));
}

function pendingHandle(file, fresh) {
  const flags = fresh ? "wx" : constants.O_RDWR | (constants.O_NOFOLLOW ?? 0);
  return io(() => open(file, flags, 0o600), `open ${file}`);
}

export async function syncDirectory(directory) {
  // Windows cannot open directories for fsync.
  if (process.platform === "win32") return;
  const handle = await io(() => open(directory, "r"), `open directory ${directory}`);
  try { await io(() => handle.sync(), `sync directory ${directory}`); }
  finally { await io(() => handle.close(), `close directory ${directory}`); }
}

export async function removeText(file) {
  await io(() => unlink(file), `remove ${file}`);
  await syncDirectory(path.dirname(file));
}

export async function stableText(file, body) {
  const previous = await optionalText(file);
  if (previous !== null && previous !== body) throw new Error(`ICP-T01 artifact differs: ${file}.`);
  if (previous === null) await atomicText(file, body);
}

export async function stableJson(file, value) {
  return stableText(file, `${canonical(value)}\n`);
}

export async function hashFile(file) {
  const info = await io(() => lstat(file), `stat ${file}`);
  if (!info.isFile() || info.isSymbolicLink() || info.size > OUTPUT_CAP) {
    throw new Error(`ICP-T01 unsafe or oversized hash input ${file}.`);
  }
  const handle = await io(() => open(file, "r"), `open ${file}`);
  const buffer = Buffer.alloc(65536);
  const hash = createHash("sha256");
  try {
    for (let offset = 0; offset < info.size; offset += buffer.length) {
      const length = Math.min(buffer.length, info.size - offset);
      const { bytesRead } = await io(() => handle.read(buffer, 0, length, offset), `hash ${file}`);
      if (bytesRead !== length) throw new Error(`ICP-T01 short hash read ${file}.`);
      hash.update(buffer.subarray(0, bytesRead));
    }
  } finally {
    await io(() => handle.close(), `close ${file}`);
  }
  return hash.digest("hex");
}

export async function stableRows(file, rows, digest) {
  const previous = await optionalTextSmall(file);
  if (previous) {
    if (await hashFile(file) !== digest) throw new Error(`ICP-T01 artifact differs: ${file}.`);
    return;
  }
  const temporary = `${file}.pending`;
  const prefix = await optionalText(temporary);
  assertRowPrefix(rows, prefix, temporary);
  const handle = await pendingHandle(temporary, prefix === null);
  try {
    await writeRows(handle, rows, file);
    await io(() => handle.sync(), `sync ${temporary}`);
  } finally {
    await io(() => handle.close(), `close ${temporary}`);
  }
  if (await hashFile(temporary) !== digest) throw new Error(`ICP-T01 pending digest differs: ${temporary}.`);
  await io(() => rename(temporary, file), `rename ${file}`);
  await syncDirectory(path.dirname(file));
}

async function optionalTextSmall(file) {
  try {
    const info = await io(() => lstat(file), `inspect ${file}`);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error(`ICP-T01 unsafe artifact ${file}.`);
    return true;
  } catch (error) {
    if (error.cause?.code === "ENOENT") return false;
    throw error;
  }
}

function assertRowPrefix(rows, prefix, file) {
  if (prefix === null) return;
  let expected = "";
  for (const row of rows()) {
    expected += row;
    if (expected.length >= prefix.length) break;
  }
  if (!expected.startsWith(prefix)) throw new Error(`ICP-T01 conflicting interrupted write ${file}.`);
}

async function writeRows(handle, rows, file) {
  let batch = "";
  let bytes = 0;
  for (const row of rows()) {
    bytes += Buffer.byteLength(row);
    if (bytes > OUTPUT_CAP) throw new Error(`ICP-T01 output cap exceeded: ${file}.`);
    batch += row;
    if (batch.length >= 65536) {
      await io((signal) => handle.writeFile(batch, { signal }), `write ${file}`);
      batch = "";
    }
  }
  if (batch !== "") await io((signal) => handle.writeFile(batch, { signal }), `write ${file}`);
}

function inside(root, file) {
  const relative = path.relative(root, file);
  return !relative.startsWith("..") && !path.isAbsolute(relative);
}

export async function outputDirectory(root, output, create = false) {
  const directory = path.resolve(root, output);
  if (!inside(root, directory) || directory === root) throw new Error("ICP-T01 output must stay inside repository.");
  const segments = path.relative(root, directory).split(path.sep);
  let current = root;
  for (const segment of segments) {
    current = path.join(current, segment);
    await directorySegment(current, create);
  }
  if (create && await io(() => realpath(directory), "resolve output") !== directory) {
    throw new Error("ICP-T01 output real path differs.");
  }
  return directory;
}

async function directorySegment(current, create) {
  try {
    const info = await io(() => lstat(current), `inspect output ${current}`);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("ICP-T01 output path substitution rejected.");
  } catch (error) {
    if (error.cause?.code !== "ENOENT") throw error;
    if (create) await io(() => mkdir(current), `mkdir ${current}`);
  }
}

export async function outputBytes(directory, maximum = OUTPUT_CAP) {
  const queue = [directory];
  let total = 0;
  for (let index = 0; index < queue.length && index < 256; index += 1) {
    const entries = await io(() => readdir(queue[index], { withFileTypes: true }), "count output files");
    if (entries.length > 1024) throw new Error("ICP-T01 output file-count cap exceeded.");
    for (const entry of entries) {
      const file = path.join(queue[index], entry.name);
      const info = await io(() => lstat(file), "count output bytes");
      if (info.isSymbolicLink()) throw new Error("ICP-T01 output symlink rejected.");
      if (info.isDirectory()) queue.push(file);
      else total += info.size;
    }
  }
  if (queue.length > 256 || total > maximum) throw new Error("ICP-T01 output cap exceeded.");
  return total;
}
