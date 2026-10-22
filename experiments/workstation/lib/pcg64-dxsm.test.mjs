import assert from "node:assert/strict";
import test from "node:test";

import { littleEndianBigInt, Pcg64Dxsm } from "./pcg64-dxsm.mjs";

test("littleEndianBigInt decodes bytes in little-endian order and handles boundaries", () => {
  assert.equal(littleEndianBigInt(Buffer.alloc(0)), 0n);
  assert.equal(littleEndianBigInt(Uint8Array.from([0x01])), 1n);
  assert.equal(littleEndianBigInt(Uint8Array.from([0x00, 0x01])), 256n);
  assert.equal(
    littleEndianBigInt(Uint8Array.from([0x01, 0x02, 0x03, 0x04])),
    0x04030201n,
  );
});

test("Pcg64Dxsm reproduces frozen public-seed golden sequences", () => {
  const r22 = new Pcg64Dxsm(1516001);
  assert.equal(r22.nextUint64().toString(16), "60b9ed21511058c1");
  assert.equal(r22.nextUint64().toString(16), "682911cad8f7ff9d");

  const r24 = new Pcg64Dxsm(1536001);
  assert.equal(r24.nextUint64().toString(16), "53453339a1008e08");
  assert.equal(r24.nextUint64().toString(16), "d216eaf00c4281f3");

  const r25 = new Pcg64Dxsm(1560001);
  assert.equal(r25.nextUint64().toString(16), "db41bf843271d096");
  assert.equal(r25.nextUint64().toString(16), "59825f71530d3798");

  const left = new Pcg64Dxsm("PLM-T01|1526001");
  const right = new Pcg64Dxsm("PLM-T01|1526001");
  assert.equal(left.nextUint64(), right.nextUint64());
});

test("Pcg64Dxsm uniform and range distributions stay within bounds", () => {
  const rng = new Pcg64Dxsm("range-test");
  for (let index = 0; index < 50; index += 1) {
    const u = rng.uniform();
    assert.ok(u >= 0 && u < 1);
    const r = rng.range(10, 20);
    assert.ok(r >= 10 && r < 20);
    const lr = rng.logRange(1, 100);
    assert.ok(lr >= 1 && lr <= 100);
  }
});

test("Pcg64Dxsm openUniform stays strictly positive", () => {
  const rng = new Pcg64Dxsm("open-uniform-test");
  for (let index = 0; index < 50; index += 1) {
    const val = rng.openUniform();
    assert.ok(val > 0 && val < 1);
  }
});

test("Pcg64Dxsm gaussian and normal match and produce finite values", () => {
  const rG = new Pcg64Dxsm("gaussian-seed");
  const rN = new Pcg64Dxsm("gaussian-seed");
  for (let index = 0; index < 50; index += 1) {
    const g = rG.gaussian();
    const n = rN.normal();
    assert.equal(g, n);
    assert.ok(Number.isFinite(g));
  }
});

test("Pcg64Dxsm integer and boundedInteger boundary and positive cases", () => {
  const rng = new Pcg64Dxsm("integer-test");
  assert.equal(rng.integer(42, 42), 42);
  assert.equal(rng.boundedInteger(1), 0);

  for (let index = 0; index < 50; index += 1) {
    const intVal = rng.integer(5, 12);
    assert.ok(Number.isInteger(intVal));
    assert.ok(intVal >= 5 && intVal <= 12);

    const bVal = rng.boundedInteger(10);
    assert.ok(Number.isInteger(bVal));
    assert.ok(bVal >= 0 && bVal < 10);
  }

  const maxBound = rng.boundedInteger(0x1_0000_0000);
  assert.ok(maxBound >= 0 && maxBound < 0x1_0000_0000);
});

test("Pcg64Dxsm integer and boundedInteger throw on invalid bounds", () => {
  const rng = new Pcg64Dxsm("error-test");

  assert.throws(
    () => rng.integer(10, 5),
    { name: "TypeError", message: "PCG integer bounds must be ordered safe integers." },
  );
  assert.throws(
    () => rng.integer(1.5, 5),
    { name: "TypeError", message: "PCG integer bounds must be ordered safe integers." },
  );
  assert.throws(
    () => rng.integer(1, 5.5),
    { name: "TypeError", message: "PCG integer bounds must be ordered safe integers." },
  );

  assert.throws(
    () => rng.boundedInteger(0),
    { name: "TypeError", message: "PCG bound must be an integer in [1, 2^32]." },
  );
  assert.throws(
    () => rng.boundedInteger(-5),
    { name: "TypeError", message: "PCG bound must be an integer in [1, 2^32]." },
  );
  assert.throws(
    () => rng.boundedInteger(0x1_0000_0001),
    { name: "TypeError", message: "PCG bound must be an integer in [1, 2^32]." },
  );
  assert.throws(
    () => rng.boundedInteger(3.14),
    { name: "TypeError", message: "PCG bound must be an integer in [1, 2^32]." },
  );
});

test("Pcg64Dxsm derived draws keep the values of the fixture copies", () => {
  // Golden values computed from the fixture 022-025 generator copies on main before they moved here.
  const continuous = new Pcg64Dxsm(1536001);
  assert.deepEqual(
    [continuous.uniform(), continuous.range(-1, 4), continuous.logRange(0.01, 100)],
    [0.32527465969997327, 3.1033109836837856, 0.014688697723136905],
  );
  const gaussian = new Pcg64Dxsm("PLM-T01|1526001");
  assert.deepEqual(
    [gaussian.openUniform(), gaussian.gaussian(), gaussian.boundedInteger(7), gaussian.boundedInteger(0x1_0000_0000)],
    [0.04031470948544802, 0.004799280446702124, 2, 1892285944],
  );
  const integers = new Pcg64Dxsm(1516001);
  assert.deepEqual([integers.integer(3, 17), integers.integer(-2, 2)], [17, 2]);
  assert.equal(new Pcg64Dxsm(1560001).normal(), -0.3261912708371033);
});
