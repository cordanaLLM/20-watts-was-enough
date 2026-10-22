import assert from "node:assert/strict";
import test from "node:test";

import { mulberry32, normal } from "./mulberry32.mjs";

test("mulberry32 generates deterministic bounded pseudo-random numbers", () => {
  const rng1 = mulberry32(1337);
  const rng2 = mulberry32(1337);
  const values1 = Array.from({ length: 10 }, () => rng1());
  const values2 = Array.from({ length: 10 }, () => rng2());

  assert.deepEqual(values1, values2);
  for (const value of values1) {
    assert.ok(Number.isFinite(value));
    assert.ok(value >= 0 && value < 1);
  }

  const diffRng = mulberry32(1338);
  const diffValues = Array.from({ length: 10 }, () => diffRng());
  assert.notDeepEqual(values1, diffValues);
});

test("mulberry32 handles unsigned 32-bit integer boundaries", () => {
  const rngZero = mulberry32(0);
  const valZero = rngZero();
  assert.ok(valZero >= 0 && valZero < 1);

  const rngMax = mulberry32(0xffff_ffff);
  const valMax = rngMax();
  assert.ok(valMax >= 0 && valMax < 1);

  const rngNegative = mulberry32(-1);
  const rngEquivalent = mulberry32(0xffff_ffff);
  assert.equal(rngNegative(), rngEquivalent());
});

test("normal generates standard normal variates deterministically", () => {
  const rng1 = mulberry32(42);
  const rng2 = mulberry32(42);
  const sample1 = Array.from({ length: 10 }, () => normal(rng1));
  const sample2 = Array.from({ length: 10 }, () => normal(rng2));

  assert.deepEqual(sample1, sample2);
  for (const value of sample1) {
    assert.ok(Number.isFinite(value));
  }
});

test("normal handles Box-Muller boundary conditions safely", () => {
  // Boundary when random returns 0: Math.max ensures Number.MIN_VALUE avoids log(0) = -Infinity
  const zeroRng = () => 0;
  const atZero = normal(zeroRng);
  assert.ok(Number.isFinite(atZero));

  // Boundary when random returns near 1
  const nearOneRng = () => 1 - Number.EPSILON;
  const atNearOne = normal(nearOneRng);
  assert.ok(Number.isFinite(atNearOne));
});

test("normal fails closed on invalid generator input", () => {
  assert.throws(() => normal(null), { name: "TypeError" });
  assert.throws(() => normal(undefined), { name: "TypeError" });
  assert.throws(() => normal("invalid"), { name: "TypeError" });
});

test("mulberry32 and normal keep the values of the fixture 007 and 012 copies", () => {
  // Golden values computed from the generator copies on main before they moved here.
  const random = mulberry32(20261022);
  assert.deepEqual([random(), random(), random()], [0.5591592639684677, 0.21883013984188437, 0.5584872781764716]);
  const gaussian = mulberry32(7);
  assert.deepEqual([normal(gaussian), normal(gaussian)], [2.759372987028844, -0.06805135650735404]);
});

test("normal clamps a zero draw at Number.MIN_VALUE", () => {
  const draws = [0, 0];
  assert.equal(normal(() => draws.shift()), 38.58600969059592);
});
