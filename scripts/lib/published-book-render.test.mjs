import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { assertPublishedBookRender } from "./published-book-render.mjs";

const publishedImage = `sha256:${"1".repeat(64)}`;
const hostImage = `sha256:${"2".repeat(64)}`;
const pdfDigest = "3".repeat(64);

function serialize(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function manifestFixture(overrides = {}) {
  return {
    schema_version: 3,
    source_ref: "main",
    source_revision: null,
    source_digest: "4".repeat(64),
    renderer: { lock: "tooling/pdf-renderer/lock.json", image_id: publishedImage },
    size_bytes: 120_000,
    pdf_sha256: pdfDigest,
    ...overrides,
  };
}

function pairFor(manifest, imageId) {
  const text = serialize({ ...manifest, renderer: { ...manifest.renderer, image_id: imageId } });
  return {
    pdf_sha256: `sha256:${manifest.pdf_sha256}`,
    pdf_bytes: manifest.size_bytes,
    manifest_sha256: `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`,
    manifest_bytes: Buffer.byteLength(text, "utf8"),
  };
}

function buildReceipt(manifest, overrides = {}) {
  const build = (sequence) => ({
    sequence,
    image_id: hostImage,
    generated_pair: pairFor(manifest, hostImage),
  });
  return {
    schema: 6,
    status: "pass",
    scope: "pdf-renderer-build-reproducibility",
    source_ref: "main",
    builds: [build(1), build(2)],
    ...overrides,
  };
}

function check(manifest, receipt) {
  return assertPublishedBookRender({
    manifestText: serialize(manifest),
    receiptText: JSON.stringify(receipt),
  });
}

test("two fresh builds that reproduce the published pair pass", () => {
  const manifest = manifestFixture();
  assert.deepEqual(check(manifest, buildReceipt(manifest)), { renders: 2, pdf_sha256: pdfDigest });
});

test("a render-pair receipt counts its single build and both renders", () => {
  const manifest = manifestFixture();
  const receipt = buildReceipt(manifest, {
    schema: 5,
    scope: "pdf-render-pair-reproducibility",
  });
  receipt.builds = receipt.builds.slice(0, 1);
  receipt.renders = [pairFor(manifest, hostImage), pairFor(manifest, hostImage)];
  assert.equal(check(manifest, receipt).renders, 3);
});

test("a fresh render with other PDF bytes fails, in either build", () => {
  const manifest = manifestFixture();
  for (const index of [0, 1]) {
    const receipt = buildReceipt(manifest);
    receipt.builds[index].generated_pair.pdf_sha256 = `sha256:${"5".repeat(64)}`;
    assert.throws(() => check(manifest, receipt), /differs from the published PDF/u);
  }
  const sized = buildReceipt(manifest);
  sized.builds[0].generated_pair.pdf_bytes += 1;
  assert.throws(() => check(manifest, sized), /differs from the published PDF/u);
});

test("a published source digest that the fresh render did not compute fails", () => {
  const manifest = manifestFixture();
  const receipt = buildReceipt(manifestFixture({ source_digest: "6".repeat(64) }));
  assert.throws(() => check(manifest, receipt), /produced another manifest than the published record/u);
});

test("a failed, foreign, single or malformed receipt is refused", () => {
  const manifest = manifestFixture();
  assert.throws(() => check(manifest, buildReceipt(manifest, { status: "fail" })), /did not pass/u);
  assert.throws(() => check(manifest, buildReceipt(manifest, { scope: "other" })), /unknown scope/u);
  assert.throws(
    () => check(manifest, buildReceipt(manifest, { source_ref: "v0.4.1" })),
    /another source identity/u,
  );
  assert.throws(
    () => check(manifest, buildReceipt(manifest, { source_revision: "7".repeat(40) })),
    /another source identity/u,
  );
  const single = buildReceipt(manifest);
  single.builds = single.builds.slice(0, 1);
  assert.throws(() => check(manifest, single), /fewer than two renders/u);
  assert.throws(() => check(manifest, buildReceipt(manifest, { builds: [] })), /records no build/u);
  const unnamed = buildReceipt(manifest);
  unnamed.builds[1].image_id = "421c";
  assert.throws(() => check(manifest, unnamed), /no valid renderer image identity/u);
  const crowded = buildReceipt(manifest);
  crowded.renders = Array.from({ length: 7 }, () => pairFor(manifest, hostImage));
  assert.throws(() => check(manifest, crowded), /more renders than the proof can produce/u);
});
