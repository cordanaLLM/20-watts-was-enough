import assert from "node:assert/strict";
import test from "node:test";

import {
  formatSeedHex,
  formatStreamPreimage,
  STANDARD_STREAM_PHASES,
  uint32SeedBytes,
} from "./stream-seed.mjs";

// Golden seed bytes and hex values computed from origin/main:
// git show origin/main:experiments/workstation/fixture-025/generator.mjs
// git show origin/main:experiments/workstation/fixture-026/generator.mjs
// git show origin/main:experiments/workstation/fixture-027/generator.mjs
const GOLDEN_SEEDS = Object.freeze([
  {
    seed: 0,
    expectedBytes: Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
    expectedHex: "0000000000000000",
  },
  {
    seed: 1560001,
    expectedBytes: Buffer.from([0xc1, 0xcd, 0x17, 0x00, 0x00, 0x00, 0x00, 0x00]),
    expectedHex: "C1CD170000000000",
  },
  {
    seed: 0xffff_ffff,
    expectedBytes: Buffer.from([0xff, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x00]),
    expectedHex: "FFFFFFFF00000000",
  },
]);

test("uint32SeedBytes pins golden little-endian 8-byte buffers from origin/main", () => {
  for (const { seed, expectedBytes } of GOLDEN_SEEDS) {
    const actualBytes = uint32SeedBytes(seed);
    assert.deepEqual(actualBytes, expectedBytes);
    assert.equal(actualBytes.length, 8);
    assert.equal(actualBytes.readBigUInt64LE(0), BigInt(seed));
  }
});

test("formatSeedHex pins golden 16-hex representations from origin/main", () => {
  for (const { expectedBytes, expectedHex } of GOLDEN_SEEDS) {
    assert.equal(formatSeedHex(expectedBytes), expectedHex);
  }

  // 64-bit seed from fixture-026 (18446744073709551615n -> 16 Fs)
  const uint64MaxBytes = Buffer.alloc(8);
  uint64MaxBytes.writeBigUInt64LE(0xffff_ffff_ffff_ffffn);
  assert.equal(formatSeedHex(uint64MaxBytes), "FFFFFFFFFFFFFFFF");

  // Fixture-026 seed 1540001 (0x177FA1 -> A17F170000000000)
  const fx026SeedBytes = Buffer.alloc(8);
  fx026SeedBytes.writeBigUInt64LE(1540001n);
  assert.equal(formatSeedHex(fx026SeedBytes), "A17F170000000000");
});

test("uint32SeedBytes rejects invalid types, signs, and out-of-range bounds", () => {
  assert.throws(
    () => uint32SeedBytes(-1, "Fixture 025 public"),
    /Fixture 025 public seed must be an unsigned integer\./,
  );
  assert.throws(
    () => uint32SeedBytes(0x1_0000_0000, "Fixture 027 public"),
    /Fixture 027 public seed must be an unsigned integer\./,
  );
  assert.throws(
    () => uint32SeedBytes(1.5, "Custom"),
    /Custom seed must be an unsigned integer\./,
  );
  assert.throws(
    () => uint32SeedBytes(Number.NaN),
    /Fixture public seed must be an unsigned integer\./,
  );
  assert.throws(
    () => uint32SeedBytes(Number.POSITIVE_INFINITY),
    /Fixture public seed must be an unsigned integer\./,
  );
  assert.throws(
    () => uint32SeedBytes("1560001"),
    /Fixture public seed must be an unsigned integer\./,
  );
  assert.throws(
    () => uint32SeedBytes(null),
    /Fixture public seed must be an unsigned integer\./,
  );
});

test("formatStreamPreimage pins golden preimages from fixtures 025, 026, 027 on origin/main", () => {
  const fx025Preimage = formatStreamPreimage({
    version: "F025-v1",
    phase: "development",
    protocol: "ECM-T03",
    seedHex: "C1CD170000000000",
    scope: "dgp",
    canonicalId: 0,
    label: "Fixture 025",
    isValidProtocol: (p) => /^ECM-T(?:0[1-9]|10)$/.test(p),
    validScopes: new Set(["dgp", "observation", "arm-init", "action-outcome", "analysis"]),
  });
  assert.equal(fx025Preimage, "F025-v1|development|ECM-T03|C1CD170000000000|dgp|0");

  const fx027Preimage = formatStreamPreimage({
    version: "F027-v1",
    phase: "development",
    protocol: "RIN-T01",
    seedHex: "C1CD170000000000",
    scope: "dgp",
    canonicalId: 0,
    label: "Fixture 027",
    isValidProtocol: (p) => p === "RIN-T01",
    validScopes: new Set(["dgp", "observation", "arm-init", "action-outcome", "analysis"]),
  });
  assert.equal(fx027Preimage, "F027-v1|development|RIN-T01|C1CD170000000000|dgp|0");

  const fx026Preimage = formatStreamPreimage({
    version: "F026-v2",
    phase: "development",
    protocol: "RSD-T01",
    seedHex: "A17F170000000000",
    scope: "dgp",
    canonicalId: 0,
    label: "Fixture 026",
    isValidProtocol: (p) => p === "RSD-T01",
    validScopes: new Set(["dgp", "observation", "policy", "evaluation", "analysis"]),
  });
  assert.equal(fx026Preimage, "F026-v2|development|RSD-T01|A17F170000000000|dgp|0");
});

test("formatStreamPreimage exercises all standard phases and boundary canonical IDs", () => {
  const scopes = new Set(["dgp"]);
  for (const phase of STANDARD_STREAM_PHASES) {
    const preimage = formatStreamPreimage({
      version: "TEST-v1",
      phase,
      protocol: "P1",
      seedHex: "0000000000000000",
      scope: "dgp",
      canonicalId: 42,
      label: "Test",
      isValidProtocol: (p) => p === "P1",
      validScopes: scopes,
    });
    assert.equal(preimage, `TEST-v1|${phase}|P1|0000000000000000|dgp|42`);
  }

  // CanonicalId boundary: 0
  const zeroId = formatStreamPreimage({
    version: "TEST-v1",
    phase: "development",
    protocol: "P1",
    seedHex: "0000000000000000",
    scope: "dgp",
    canonicalId: 0,
    label: "Test",
    isValidProtocol: (p) => p === "P1",
    validScopes: scopes,
  });
  assert.equal(zeroId, "TEST-v1|development|P1|0000000000000000|dgp|0");
});

test("formatStreamPreimage throws exact byte-identical errors for invalid fields", () => {
  const base = {
    version: "F025-v1",
    phase: "development",
    protocol: "ECM-T03",
    seedHex: "C1CD170000000000",
    scope: "dgp",
    canonicalId: 0,
    label: "Fixture 025",
    isValidProtocol: (p) => /^ECM-T(?:0[1-9]|10)$/.test(p),
    validScopes: new Set(["dgp", "observation"]),
  };

  assert.throws(
    () => formatStreamPreimage({ ...base, phase: "production" }),
    /Fixture 025 stream phase is invalid\./,
  );
  assert.throws(
    () => formatStreamPreimage({ ...base, protocol: "INVALID" }),
    /Fixture 025 stream protocol is invalid\./,
  );
  assert.throws(
    () => formatStreamPreimage({ ...base, scope: "unknown" }),
    /Fixture 025 stream scope is invalid\./,
  );
  assert.throws(
    () => formatStreamPreimage({ ...base, canonicalId: "01" }),
    /Fixture 025 stream canonical ID must be unpadded ASCII decimal\./,
  );
  assert.throws(
    () => formatStreamPreimage({ ...base, canonicalId: -1 }),
    /Fixture 025 stream canonical ID must be unpadded ASCII decimal\./,
  );
  assert.throws(
    () => formatStreamPreimage({ ...base, canonicalId: "abc" }),
    /Fixture 025 stream canonical ID must be unpadded ASCII decimal\./,
  );
});

test("STANDARD_STREAM_PHASES holds exactly the four stream phases", () => {
  assert.deepEqual(
    [...STANDARD_STREAM_PHASES],
    ["development", "confirmation", "transfer", "ablation"],
  );
  assert.ok(Object.isFrozen(STANDARD_STREAM_PHASES));
});
