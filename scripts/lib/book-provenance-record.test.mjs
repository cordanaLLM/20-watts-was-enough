import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  planBookProvenanceRecord,
  renderFreeBookSourcePaths,
} from "./book-provenance-record.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const recordedDigest = "a".repeat(64);
const movedDigest = "b".repeat(64);
const files = Object.freeze(["concept/00-thesis-and-principles.md", "package-lock.json", "package.json"]);

function serialize(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function recordFixture(overrides = {}) {
  const manifestText = serialize({
    schema_version: 3,
    source_digest: recordedDigest,
    source_files: [...files],
    size_bytes: 120_000,
    pdf_sha256: "c".repeat(64),
    ...overrides.manifest,
  });
  const baselineText = serialize({
    schema_version: 1,
    artifact: {
      pdf_sha256: "c".repeat(64),
      manifest_sha256: sha256(manifestText),
      size_bytes: 120_000,
      pages: 4,
      source_digest: recordedDigest,
      ...overrides.artifact,
    },
    sentinels: [],
  });
  return { manifestText, baselineText };
}

test("a current record plans no change and needs no changed-path list", () => {
  const plan = planBookProvenanceRecord({
    ...recordFixture(),
    source: { digest: recordedDigest, files },
    changedPaths: [],
  });
  assert.equal(plan.state, "current");
  assert.deepEqual(plan.changedSources, []);
});

test("a dependency record change re-records the three digests and nothing else", () => {
  const fixture = recordFixture();
  const plan = planBookProvenanceRecord({
    ...fixture,
    source: { digest: movedDigest, files },
    changedPaths: ["package-lock.json", "CHANGELOG.md", "package-lock.json"],
  });
  assert.equal(plan.state, "stale");
  assert.deepEqual(plan.changedSources, ["package-lock.json"]);
  const manifest = JSON.parse(plan.manifestText);
  const baseline = JSON.parse(plan.baselineText);
  assert.equal(manifest.source_digest, movedDigest);
  assert.equal(baseline.artifact.source_digest, movedDigest);
  assert.equal(baseline.artifact.manifest_sha256, sha256(plan.manifestText));
  assert.deepEqual(
    { ...manifest, source_digest: recordedDigest },
    JSON.parse(fixture.manifestText),
  );
  assert.deepEqual(
    { ...baseline.artifact, manifest_sha256: null, source_digest: null },
    { ...JSON.parse(fixture.baselineText).artifact, manifest_sha256: null, source_digest: null },
  );
  const replay = planBookProvenanceRecord({
    manifestText: plan.manifestText,
    baselineText: plan.baselineText,
    source: { digest: movedDigest, files },
    changedPaths: [],
  });
  assert.equal(replay.state, "current");
});

test("a changed chapter is refused and sent to the renderer", () => {
  assert.throws(
    () => planBookProvenanceRecord({
      ...recordFixture(),
      source: { digest: movedDigest, files },
      changedPaths: ["package.json", "concept/00-thesis-and-principles.md"],
    }),
    /need a render: concept\/00-thesis-and-principles\.md\. Run npm run generate:book-pdf/u,
  );
});

test("a removed or added book source is judged by the same rule", () => {
  assert.throws(
    () => planBookProvenanceRecord({
      ...recordFixture(),
      source: { digest: movedDigest, files: files.slice(1) },
      changedPaths: ["concept/00-thesis-and-principles.md"],
    }),
    /need a render/u,
  );
  assert.throws(
    () => planBookProvenanceRecord({
      ...recordFixture(),
      source: { digest: movedDigest, files: [...files, "math/notation.md"] },
      changedPaths: ["math/notation.md"],
    }),
    /need a render: math\/notation\.md/u,
  );
});

test("a stale digest that no changed source explains is refused", () => {
  assert.throws(
    () => planBookProvenanceRecord({
      ...recordFixture(),
      source: { digest: movedDigest, files },
      changedPaths: ["CHANGELOG.md"],
    }),
    /No changed book source explains/u,
  );
});

test("a baseline that lags a current manifest is re-bound without a path list", () => {
  const plan = planBookProvenanceRecord({
    ...recordFixture({ artifact: { manifest_sha256: "d".repeat(64) } }),
    source: { digest: recordedDigest, files },
    changedPaths: [],
  });
  assert.equal(plan.state, "stale");
  assert.equal(JSON.parse(plan.baselineText).artifact.manifest_sha256, sha256(plan.manifestText));
});

test("a baseline for another PDF, a reformatted record and a bad digest are refused", () => {
  assert.throws(
    () => planBookProvenanceRecord({
      ...recordFixture({ artifact: { pdf_sha256: "e".repeat(64) } }),
      source: { digest: movedDigest, files },
      changedPaths: ["package.json"],
    }),
    /names another PDF than the manifest/u,
  );
  const fixture = recordFixture();
  assert.throws(
    () => planBookProvenanceRecord({
      ...fixture,
      manifestText: JSON.stringify(JSON.parse(fixture.manifestText)),
      source: { digest: movedDigest, files },
      changedPaths: ["package.json"],
    }),
    /not in canonical two-space JSON form/u,
  );
  assert.throws(
    () => planBookProvenanceRecord({
      ...fixture,
      source: { digest: "short", files },
      changedPaths: ["package.json"],
    }),
    /Book source digest is invalid/u,
  );
});

test("the render-free list is the reviewed set of dependency records in the book sources", async () => {
  assert.deepEqual(renderFreeBookSourcePaths, [
    "package-lock.json",
    "package.json",
    "tooling/go.mod",
    "tooling/go.sum",
  ]);
  assert.equal(Object.isFrozen(renderFreeBookSourcePaths), true);
  const manifest = JSON.parse(
    await readFile(path.join(repositoryRoot, "public", "downloads", "book-manifest.json"), "utf8"),
  );
  for (const file of renderFreeBookSourcePaths) {
    assert.equal(manifest.source_files.includes(file), true, `${file} must be a book source`);
  }
});
