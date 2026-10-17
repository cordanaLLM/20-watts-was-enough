import { lstat, opendir, realpath } from "node:fs/promises";
import path from "node:path";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { withStableOpenedFile } from "./opened-file.mjs";

export const mathLimits = Object.freeze({
  maximumDepth: 16,
  maximumEntries: 20_000,
  maximumFiles: 10_000,
  maximumFileBytes: 8 * 1024 * 1024,
  maximumTotalBytes: 256 * 1024 * 1024,
  maximumNodes: 200_000,
  maximumDiagnostics: 2_000,
  maximumDiagnosticBytes: 1024 * 1024,
});

const ignoredRoots = new Set([
  ".cache", ".git", ".next", ".openai", ".vinext", ".vite", ".workingdir", ".workingdir2", ".wrangler",
  "build", "coverage", "dist", "dist-github-pages", "node_modules", "sources", "tmp",
  "experiments/workstation/runs", "public/repository-files",
]);
const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath);
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

export function checkedMathLimits(overrides = {}) {
  const limits = { ...mathLimits, ...overrides };
  for (const [key, value] of Object.entries(limits)) {
    if (!Object.hasOwn(mathLimits, key) || !Number.isSafeInteger(value)
        || value < 1 || value > mathLimits[key]) throw new Error(`Invalid math boundary limit: ${key}`);
  }
  return Object.freeze(limits);
}

async function requireDirectory(directory) {
  const before = await lstat(directory, { bigint: true });
  if (!before.isDirectory() || before.isSymbolicLink()
      || path.resolve(await realpath(directory)) !== directory) {
    throw new Error(`Math inventory directory must not be linked: ${directory}`);
  }
  return before;
}

function sameDirectory(first, second) {
  return ["dev", "ino", "mtimeNs", "ctimeNs"].every((key) => first[key] === second[key]);
}

// Cooperative filesystem preflight, not an atomic snapshot of a hostile writer.
export async function assertMathInventoryUnchanged(inventory) {
  for (const { directory, identity } of inventory.directories) {
    if (!sameDirectory(identity, await requireDirectory(directory))) {
      throw new Error(`Math inventory directory changed during preflight: ${directory}`);
    }
  }
}

export async function collectMathMarkdown(repositoryRoot, overrides = {}, openDirectory = opendir) {
  const limits = checkedMathLimits(overrides);
  const root = path.resolve(repositoryRoot);
  const pending = [{ directory: root, depth: 0 }];
  const files = [];
  const directories = [];
  let scanned = 0;
  while (pending.length > 0) {
    const { directory, depth } = pending.pop();
    const before = await requireDirectory(directory);
    directories.push({ directory, identity: before });
    const entries = await openDirectory(directory);
    for await (const entry of entries) {
      if (++scanned > limits.maximumEntries) throw new Error("Math inventory entry limit exceeded");
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join("/");
      if (ignoredRoots.has(relative) || entry.name === "node_modules" || entry.name === ".git") continue;
      if (Buffer.byteLength(relative) > 1024
          || [...relative].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
        throw new Error("Math inventory path is excessive or contains a control character");
      }
      if (entry.isSymbolicLink()) throw new Error(`Math inventory path must not be linked: ${relative}`);
      if (entry.isDirectory()) {
        if (depth >= limits.maximumDepth) throw new Error(`Math inventory depth limit exceeded: ${relative}`);
        pending.push({ directory: absolute, depth: depth + 1 });
      } else if (!entry.isFile()) {
        throw new Error(`Math inventory entry is not a regular file: ${relative}`);
      } else if (entry.name.endsWith(".md")) {
        if (files.length >= limits.maximumFiles) throw new Error("Math Markdown file count limit exceeded");
        files.push(absolute);
      }
    }
  }
  const inventory = { root, limits, files: files.sort(), directories };
  await assertMathInventoryUnchanged(inventory);
  if (files.length === 0) throw new Error("No canonical Markdown files found");
  return inventory;
}

export async function readMathSnapshot(file, maximumBytes = mathLimits.maximumFileBytes) {
  checkedMathLimits({ maximumFileBytes: maximumBytes });
  return withStableOpenedFile(file, {
    label: `math Markdown ${file}`, containedBy: path.dirname(file), maximumBytes,
  }, async (handle) => {
    const identity = await handle.stat({ bigint: true });
    if (identity.size > BigInt(maximumBytes)) throw new Error(`Math Markdown file byte limit exceeded: ${file}`);
    const buffer = Buffer.alloc(Number(identity.size) + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    if (offset !== Number(identity.size)) throw new Error(`Math Markdown changed size while reading: ${file}`);
    const bytes = buffer.subarray(0, offset);
    try {
      return { bytes, body: decoder.decode(bytes), identity };
    } catch (error) {
      throw new Error(`Math Markdown is not valid UTF-8: ${file}`, { cause: error });
    }
  });
}

export async function loadMathDocuments(root, overrides = {}, readSnapshot = readMathSnapshot) {
  const inventory = await collectMathMarkdown(root, overrides);
  const documents = [];
  let total = 0;
  for (const file of inventory.files) {
    const snapshot = await readSnapshot(file, inventory.limits.maximumFileBytes);
    total += snapshot.bytes.length;
    if (total > inventory.limits.maximumTotalBytes) throw new Error("Math Markdown total byte limit exceeded");
    documents.push({ ...snapshot, file, relative: path.relative(inventory.root, file).split(path.sep).join("/") });
  }
  await assertMathInventoryUnchanged(inventory);
  return { ...inventory, documents };
}

export function maskMarkdownCode(source, overrides = {}) {
  const limits = checkedMathLimits(overrides);
  if (Buffer.byteLength(source) > limits.maximumFileBytes) throw new Error("Math Markdown file byte limit exceeded");
  const pending = [parser.parse(source)];
  const ranges = [];
  let nodes = 0;
  while (pending.length > 0) {
    if (++nodes > limits.maximumNodes) throw new Error("Math Markdown syntax node limit exceeded");
    const node = pending.pop();
    if (node.type === "code" || node.type === "inlineCode") {
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)
          || start < 0 || end < start || end > source.length) throw new Error("Invalid Markdown code position");
      ranges.push([start, end]);
    } else if (node.children) {
      if (nodes + pending.length + node.children.length > limits.maximumNodes) {
        throw new Error("Math Markdown syntax node limit exceeded");
      }
      for (const child of node.children) pending.push(child);
    }
  }
  ranges.sort((left, right) => left[0] - right[0]);
  let offset = 0;
  const chunks = [];
  for (const [start, end] of ranges) {
    if (start < offset) throw new Error("Overlapping Markdown code positions");
    chunks.push(source.slice(offset, start), source.slice(start, end).replace(/[^\r\n]/g, " "));
    offset = end;
  }
  return chunks.join("") + source.slice(offset);
}

export function unchangedMathSnapshot(first, second) {
  return first.bytes.equals(second.bytes) && ["dev", "ino", "size", "mtimeNs", "ctimeNs", "mode"]
    .every((key) => first.identity[key] === second.identity[key]);
}
