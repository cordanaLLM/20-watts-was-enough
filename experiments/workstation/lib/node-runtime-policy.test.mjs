import assert from "node:assert/strict";
import test from "node:test";

import {
  NODE_NUMERIC_SENTINEL,
  REQUIRED_NODE_VERSION,
  assertNodeRuntimePolicy,
  observeNodeRuntime,
  validateNodeRuntimePolicy,
} from "./node-runtime-policy.mjs";

const validObservation = Object.freeze({
  node_version: REQUIRED_NODE_VERSION,
  numeric_sentinel_id: NODE_NUMERIC_SENTINEL.id,
  numeric_sentinel_json: NODE_NUMERIC_SENTINEL.expected_json,
});

test("the current Node runtime matches the exact numeric execution policy", () => {
  assert.deepEqual(validateNodeRuntimePolicy(observeNodeRuntime()), []);
  assert.equal(assertNodeRuntimePolicy().node_version, REQUIRED_NODE_VERSION);
});

test("the runtime policy rejects version drift before experiment work starts", () => {
  assert.deepEqual(validateNodeRuntimePolicy({
    ...validObservation,
    node_version: "26.7.0",
  }), ["Node.js 26.11.1 is required; observed 26.7.0"]);
});

test("the runtime policy rejects a numerically divergent vendor build", () => {
  assert.deepEqual(validateNodeRuntimePolicy({
    ...validObservation,
    numeric_sentinel_json: "2.6077625303838716",
  }), [
    "the Node numeric sentinel serialized as 2.6077625303838716; expected 2.607762530383872",
  ]);
  assert.throws(
    () => assertNodeRuntimePolicy({
      ...validObservation,
      numeric_sentinel_json: "2.6077625303838716",
    }),
    /official Node\.js 26\.11\.1 binary or the pinned experiment container/u,
  );
});
