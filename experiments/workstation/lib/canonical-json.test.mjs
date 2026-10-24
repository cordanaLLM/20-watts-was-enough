import assert from "node:assert/strict";
import test from "node:test";

import { canonicalJson, MAXIMUM_CANONICAL_DEPTH } from "./canonical-json.mjs";

function nested(depth) {
  let value = 1;
  for (let level = 0; level < depth; level += 1) value = level % 2 === 0 ? [value] : { k: value };
  return value;
}

test("canonicalJson sorts object keys and matches JSON.stringify on sorted data", () => {
  assert.equal(canonicalJson({ b: [1, { d: "x", c: null }], a: true }), '{"a":true,"b":[1,{"c":null,"d":"x"}]}');
  const sorted = { a: [1, 2, { b: "z", c: [false, null, 0.5] }], d: {} };
  assert.equal(canonicalJson(sorted), JSON.stringify(sorted));
  assert.equal(canonicalJson([]), "[]");
  assert.equal(canonicalJson("s"), '"s"');
});

test("canonicalJson loose mode keeps the JSON.stringify text for undefined leaves", () => {
  assert.equal(canonicalJson([1, undefined], { strict: false }), "[1,]");
  assert.equal(canonicalJson({ a: undefined }, { strict: false }), '{"a":undefined}');
  assert.equal(canonicalJson({ a: Number.NaN }, { strict: false }), '{"a":null}');
});

test("canonicalJson strict mode refuses non-JSON values with the caller label", () => {
  assert.throws(() => canonicalJson({ a: Number.POSITIVE_INFINITY }, { label: "Release" }), {
    name: "TypeError",
    message: "Release canonicalization rejects non-finite numbers.",
  });
  assert.throws(() => canonicalJson({ a: undefined }, { label: "Release" }), {
    message: "Release canonicalization rejects undefined at a.",
  });
  assert.throws(() => canonicalJson([1n]), { message: "JSON canonicalization rejects bigint." });
  assert.throws(() => canonicalJson({ b: undefined, a: Number.NaN }), {
    message: "JSON canonicalization rejects non-finite numbers.",
  });
});

test("canonicalJson accepts nesting up to its depth bound and refuses one level more", () => {
  assert.doesNotThrow(() => canonicalJson(nested(MAXIMUM_CANONICAL_DEPTH)));
  assert.throws(() => canonicalJson(nested(MAXIMUM_CANONICAL_DEPTH + 1)), {
    name: "RangeError",
    message: `JSON canonicalization exceeds nesting depth ${MAXIMUM_CANONICAL_DEPTH}.`,
  });
});
