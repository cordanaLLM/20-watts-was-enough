import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { bookPdfName, bookSourceDigest } from "./book-source.mjs";
import { acquireExclusiveFileLock, replaceFilePair } from "./lib/atomic-file-pair.mjs";
import { assertBookManifestContract } from "./lib/book-manifest-contract.mjs";
import { assertBookPdfIntegrity } from "./lib/book-pdf-integrity.mjs";
import { planBookProvenanceRecord } from "./lib/book-provenance-record.mjs";
import {
  bookRendererLockPath,
  bookRendererLockSHA256,
} from "./lib/book-renderer-identity.mjs";

const run = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(projectRoot, "public", "downloads", "book-manifest.json");
const baselinePath = path.join(projectRoot, "scripts", "book-pdf-semantic-baseline.json");
const pdfPath = path.join(projectRoot, "public", "downloads", bookPdfName);
const lockPath = path.join(projectRoot, "tmp", "pdf-renderer-book.lock");
const gitLimits = Object.freeze({ cwd: projectRoot, maxBuffer: 8 * 1024 * 1024, timeout: 30_000 });
const usage = "Usage: node scripts/record-book-provenance.mjs [--check] [--base <revision>]";

function parseArguments(argv) {
  const options = { base: "origin/main", check: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--check") {
      options.check = true;
    } else if (argv[index] === "--base" && argv[index + 1] && !argv[index + 1].startsWith("-")) {
      index += 1;
      options.base = argv[index];
    } else {
      throw new Error(usage);
    }
  }
  return options;
}

async function git(...argumentsList) {
  const { stdout } = await run("git", argumentsList, gitLimits);
  return stdout;
}

function pathList(output) {
  return output.split("\0").filter((entry) => entry.length > 0);
}

// changedPathsSince lists tracked changes against the merge base with the
// revision that holds the current record, plus untracked files. The record at
// that merge base must be the one being replaced; otherwise the list would
// not explain the stale digest.
async function changedPathsSince(base, recordedDigest) {
  const mergeBase = (await git("merge-base", "HEAD", base)).trim();
  const recorded = JSON.parse(await git("show", `${mergeBase}:public/downloads/book-manifest.json`));
  if (recorded.source_digest !== recordedDigest) {
    throw new Error(
      `The record at ${base} (${mergeBase.slice(0, 12)}) is not the one in this tree; pass --base with the revision that holds it.`,
    );
  }
  const tracked = await git("diff", "--name-only", "--no-renames", "-z", mergeBase, "--");
  const untracked = await git("ls-files", "--others", "--exclude-standard", "-z");
  return [...pathList(tracked), ...pathList(untracked)];
}

async function assertPublishedPair(manifestText) {
  const manifest = JSON.parse(manifestText);
  const packageManifest = JSON.parse(await readFile(path.join(projectRoot, "package.json"), "utf8"));
  assertBookManifestContract({
    manifest,
    expectedVersion: packageManifest.version,
    expectedPdf: `public/downloads/${bookPdfName}`,
    expectedSourceRef: "main",
    expectedSourceRevision: null,
    expectedRendererLockSHA256: bookRendererLockSHA256(
      await readFile(path.join(projectRoot, bookRendererLockPath)),
    ),
  });
  await assertBookPdfIntegrity(pdfPath, manifest);
  return manifest;
}

async function writeRecord(plan) {
  const identity = randomUUID();
  const pairs = [
    { staged: `${manifestPath}.${identity}.tmp`, destination: manifestPath, text: plan.manifestText },
    { staged: `${baselinePath}.${identity}.tmp`, destination: baselinePath, text: plan.baselineText },
  ];
  try {
    for (const { staged, text } of pairs) {
      await writeFile(staged, text, { encoding: "utf8", flag: "wx", mode: 0o644 });
    }
    await replaceFilePair(pairs.map(({ staged, destination }) => ({ staged, destination })));
  } finally {
    await Promise.all(pairs.map(({ staged }) => rm(staged, { force: true })));
  }
}

async function record(options) {
  const [manifestText, baselineText] = await Promise.all([
    readFile(manifestPath, "utf8"),
    readFile(baselinePath, "utf8"),
  ]);
  const manifest = await assertPublishedPair(manifestText);
  const source = await bookSourceDigest(projectRoot);
  const moved = manifest.source_digest !== source.digest;
  const changedPaths = moved ? await changedPathsSince(options.base, manifest.source_digest) : [];
  const plan = planBookProvenanceRecord({ manifestText, baselineText, source, changedPaths });
  if (plan.state === "current") {
    console.log(`Book provenance record is current: ${source.files.length} source files, digest ${source.digest}.`);
    return 0;
  }
  if (options.check) {
    console.error(
      `Book provenance record is stale: recorded ${plan.recordedDigest}, sources ${plan.sourceDigest}. Run npm run record:book-provenance.`,
    );
    return 1;
  }
  await writeRecord(plan);
  console.log(
    `Recorded book provenance ${plan.sourceDigest} without a render (changed: ${plan.changedSources.join(", ") || "record only"}). The CI renderer job proves the published PDF against these sources.`,
  );
  return 0;
}

const options = parseArguments(process.argv.slice(2));
await mkdir(path.dirname(lockPath), { recursive: true });
const lock = await acquireExclusiveFileLock(lockPath, "full-book PDF generation");
try {
  process.exitCode = await record(options);
} finally {
  await lock.release();
}
