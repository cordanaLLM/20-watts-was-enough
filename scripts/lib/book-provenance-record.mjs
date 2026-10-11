import { createHash } from "node:crypto";
import { parseStrictJson } from "./strict-json.mjs";
import renderFreeSources from "../book-render-free-sources.json" with { type: "json" };

// Dependency records whose change always selects the CI renderer job with two
// independent builds; that job compares the fresh renders with the published
// pair. The planner test TestRenderFreeBookSourcesSelectTheIndependentBuildProof
// reads the same list. Every other book source still needs a local render.
export const renderFreeBookSourcePaths = Object.freeze([...renderFreeSources.paths]);

const sha256Pattern = /^[0-9a-f]{64}$/u;

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function serialize(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function parseCanonical(text, label) {
  const value = parseStrictJson(text, { label });
  invariant(
    serialize(value) === text,
    `${label} is not in canonical two-space JSON form; a re-record would rewrite unrelated bytes.`,
  );
  return value;
}

function sameList(left, right) {
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

function assertRecordShape(manifest, baseline, source) {
  invariant(sha256Pattern.test(source?.digest ?? ""), "Book source digest is invalid.");
  invariant(
    Array.isArray(source.files) && source.files.every((file) => typeof file === "string"),
    "Book source inventory is invalid.",
  );
  invariant(sha256Pattern.test(manifest?.source_digest ?? ""), "Full-book manifest has no valid source digest.");
  invariant(Array.isArray(manifest.source_files), "Full-book manifest has no source inventory.");
  invariant(
    baseline?.artifact && typeof baseline.artifact === "object",
    "Book PDF semantic baseline has no artifact record.",
  );
  invariant(
    baseline.artifact.pdf_sha256 === manifest.pdf_sha256
      && baseline.artifact.size_bytes === manifest.size_bytes,
    "Book PDF semantic baseline names another PDF than the manifest; run npm run generate:book-pdf and the semantic audit.",
  );
}

function changedBookSources(manifest, source, changedPaths) {
  const sources = new Set([...manifest.source_files, ...source.files]);
  return [...new Set(changedPaths)].filter((file) => sources.has(file)).sort();
}

function assertRenderFree(manifest, source, changedPaths) {
  invariant(Array.isArray(changedPaths), "Changed paths must be a list.");
  const changed = changedBookSources(manifest, source, changedPaths);
  invariant(
    changed.length > 0,
    "No changed book source explains the stale source digest; compare against the revision that holds the current record.",
  );
  const rendered = changed.filter((file) => !renderFreeBookSourcePaths.includes(file));
  invariant(
    rendered.length === 0,
    `These changed book sources need a render: ${rendered.join(", ")}. Run npm run generate:book-pdf.`,
  );
  return changed;
}

// planBookProvenanceRecord derives the manifest and baseline bytes that bind
// the published PDF to the current sources. It renders nothing: equality of
// the PDF with a fresh render of these sources is proven by the CI renderer
// job, which is why only fully gated dependency records may be re-recorded.
export function planBookProvenanceRecord({ manifestText, baselineText, source, changedPaths }) {
  const manifest = parseCanonical(manifestText, "Full-book manifest");
  const baseline = parseCanonical(baselineText, "Book PDF semantic baseline");
  assertRecordShape(manifest, baseline, source);
  const nextManifestText = serialize({
    ...manifest,
    source_digest: source.digest,
    source_files: [...source.files],
  });
  const nextBaselineText = serialize({
    ...baseline,
    artifact: {
      ...baseline.artifact,
      manifest_sha256: sha256(nextManifestText),
      source_digest: source.digest,
    },
  });
  const current = nextManifestText === manifestText && nextBaselineText === baselineText;
  const sourcesMoved = manifest.source_digest !== source.digest
    || !sameList(manifest.source_files, source.files);
  return Object.freeze({
    state: current ? "current" : "stale",
    changedSources: Object.freeze(sourcesMoved ? assertRenderFree(manifest, source, changedPaths) : []),
    manifestText: nextManifestText,
    baselineText: nextBaselineText,
    recordedDigest: manifest.source_digest,
    sourceDigest: source.digest,
  });
}
