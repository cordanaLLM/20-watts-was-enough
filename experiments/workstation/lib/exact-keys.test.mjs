import assert from "node:assert/strict";
import test from "node:test";

import { exactKeys } from "./exact-keys.mjs";

test("exactKeys accepts objects whose own enumerable keys match exactly", () => {
  assert.ok(exactKeys({ a: 1, b: 2 }, ["a", "b"]));
  assert.ok(exactKeys({ b: 2, a: 1 }, ["a", "b"]));
  assert.ok(exactKeys({ a: 1, b: 2 }, ["b", "a"]));
  assert.ok(exactKeys({}, []));
  assert.ok(exactKeys({ schema: 1, artifact: "fixture-012" }, ["artifact", "schema"]));
  assert.ok(exactKeys({ x: 10 }, new Set(["x"])));
});

test("exactKeys rejects missing, extraneous, or mismatched keys", () => {
  assert.equal(exactKeys({ a: 1 }, ["a", "b"]), false);
  assert.equal(exactKeys({ a: 1, b: 2, c: 3 }, ["a", "b"]), false);
  assert.equal(exactKeys({ a: 1, b: 2 }, ["a", "c"]), false);
  assert.equal(exactKeys({}, ["a"]), false);
  assert.equal(exactKeys({ a: 1 }, []), false);
});

test("exactKeys rejects non-object and array values", () => {
  assert.equal(exactKeys(null, []), null);
  assert.equal(exactKeys(undefined, []), undefined);
  assert.equal(exactKeys([], []), false);
  assert.equal(exactKeys([1, 2], ["0", "1"]), false);
  assert.equal(exactKeys("string", ["0"]), false);
  assert.equal(exactKeys(42, []), false);
  assert.equal(exactKeys(true, []), false);
});

test("exactKeys handles duplicate keys in expected list and boundary values", () => {
  // [...keys].sort() contains duplicates while Object.keys() cannot, so it returns false
  assert.equal(exactKeys({ a: 1 }, ["a", "a"]), false);

  // Prototype properties are not counted
  const proto = { inherited: true };
  const child = Object.create(proto);
  child.own = "val";
  assert.ok(exactKeys(child, ["own"]));
  assert.equal(exactKeys(child, ["own", "inherited"]), false);
});
