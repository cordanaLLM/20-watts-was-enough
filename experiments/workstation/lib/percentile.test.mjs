import assert from "node:assert/strict";
import test from "node:test";

import { percentile } from "./percentile.mjs";

test("percentile computes correct quantiles for sorted and unsorted numeric arrays", () => {
  const values = [50, 20, 10, 40, 30];
  const p50 = percentile(values, 0.5);
  const p95 = percentile(values, 0.95);
  const p100 = percentile(values, 1.0);

  assert.equal(p50, 30);
  assert.equal(p95, 50);
  assert.equal(p100, 50);
  // Verify original array was not mutated in place
  assert.deepEqual(values, [50, 20, 10, 40, 30]);
});

test("percentile matches golden quantile rankings for 100 integers", () => {
  const array = Array.from({ length: 100 }, (_, index) => index + 1);
  assert.equal(percentile(array, 0.95), 95);
  assert.equal(percentile(array, 0.99), 99);
  assert.equal(percentile(array, 0.5), 50);
});

test("percentile returns null for empty or non-array inputs", () => {
  assert.equal(percentile([], 0.95), null);
  assert.equal(percentile(null, 0.95), null);
  assert.equal(percentile(undefined, 0.95), null);
});

test("percentile handles boundary cases: single element, duplicates, and negative numbers", () => {
  assert.equal(percentile([42], 0.95), 42);
  assert.equal(percentile([42], 1.0), 42);

  const duplicates = [5, 5, 5, 5, 5];
  assert.equal(percentile(duplicates, 0.5), 5);
  assert.equal(percentile(duplicates, 0.99), 5);

  const negatives = [-50, -20, -100, -10];
  assert.equal(percentile(negatives, 0.5), -50);
  assert.equal(percentile(negatives, 1.0), -10);
});
