import { createHash } from "node:crypto";
import { parseStrictJson } from "./strict-json.mjs";

const receiptScopes = Object.freeze([
  "pdf-render-pair-reproducibility",
  "pdf-renderer-build-reproducibility",
]);
const imageIdPattern = /^sha256:[0-9a-f]{64}$/u;
const maximumObservations = 8;

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function prefixedSha256(text) {
  return `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;
}

// The renderer writes the identity of the image it ran in into the manifest,
// and that identity depends on the host's image store. Every other manifest
// byte must equal the published record.
function manifestTextForImage(manifest, imageId) {
  return `${JSON.stringify({ ...manifest, renderer: { ...manifest.renderer, image_id: imageId } }, null, 2)}\n`;
}

function receiptObservations(receipt) {
  const builds = Array.isArray(receipt.builds) ? receipt.builds : [];
  const renders = Array.isArray(receipt.renders) ? receipt.renders : [];
  invariant(builds.length > 0, "PDF reproducibility receipt records no build.");
  invariant(
    builds.length + renders.length <= maximumObservations,
    "PDF reproducibility receipt records more renders than the proof can produce.",
  );
  const observations = [
    ...builds.map((build) => ({ imageId: build?.image_id, pair: build?.generated_pair })),
    ...renders.map((pair) => ({ imageId: builds[0]?.image_id, pair })),
  ];
  invariant(observations.length >= 2, "PDF reproducibility receipt records fewer than two renders.");
  return observations;
}

function assertObservation({ imageId, pair }, manifest, index) {
  const label = `Fresh render ${index + 1}`;
  invariant(imageIdPattern.test(imageId ?? ""), `${label} has no valid renderer image identity.`);
  invariant(pair && typeof pair === "object", `${label} has no generated pair.`);
  invariant(
    pair.pdf_sha256 === `sha256:${manifest.pdf_sha256}` && pair.pdf_bytes === manifest.size_bytes,
    `${label} differs from the published PDF (${pair.pdf_sha256}, ${pair.pdf_bytes} bytes); the sources need npm run generate:book-pdf.`,
  );
  const expected = manifestTextForImage(manifest, imageId);
  invariant(
    pair.manifest_sha256 === prefixedSha256(expected)
      && pair.manifest_bytes === Buffer.byteLength(expected, "utf8"),
    `${label} produced another manifest than the published record; run npm run record:book-provenance or npm run generate:book-pdf.`,
  );
}

// assertPublishedBookRender proves the published pair against the fresh
// renders a passing reproducibility receipt observed for the same tree.
export function assertPublishedBookRender({ manifestText, receiptText }) {
  const manifest = parseStrictJson(manifestText, { label: "Full-book manifest" });
  const receipt = parseStrictJson(receiptText, { label: "PDF reproducibility receipt" });
  invariant(receipt?.status === "pass", "PDF reproducibility receipt did not pass.");
  invariant(receiptScopes.includes(receipt.scope), "PDF reproducibility receipt has an unknown scope.");
  invariant(
    receipt.source_ref === manifest?.source_ref
      && (receipt.source_revision ?? null) === (manifest.source_revision ?? null),
    "PDF reproducibility receipt was rendered for another source identity than the published manifest.",
  );
  invariant(
    manifest.renderer && typeof manifest.renderer === "object",
    "Full-book manifest has no renderer identity.",
  );
  const observations = receiptObservations(receipt);
  for (const [index, observation] of observations.entries()) {
    assertObservation(observation, manifest, index);
  }
  return Object.freeze({ renders: observations.length, pdf_sha256: manifest.pdf_sha256 });
}
