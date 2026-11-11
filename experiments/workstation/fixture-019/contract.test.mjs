import assert from "node:assert/strict";
import test from "node:test";

import { canonicalize, sha256Hex } from "../lib/checkpoint-ledger.mjs";
import {
  assertFixture019Record,
  fixture019ScientificPayload,
} from "./contract.mjs";
import { firstDevelopmentSeed, runFixture019Python, workerRequest } from "./test-helpers.mjs";

function recordFor(cell = "base") {
  const event = workerRequest({
    action: "simulate",
    seed: firstDevelopmentSeed,
    split: "development",
    cell,
    replicate: 0,
  });
  const previous = "0".repeat(64);
  const payload = canonicalize(event);
  return {
    ...event,
    integrity: {
      sequence: 0,
      previous_sha256: previous,
      record_sha256: sha256Hex(`${previous}\n${payload}`),
    },
  };
}

test("independent evaluator, identities, and eta-zero boundary satisfy the runtime contract", () => {
  const base = recordFor("base");
  const zero = recordFor("eta-zero");
  assertFixture019Record(base, { sequence: 0, previousHash: "0".repeat(64) });
  assertFixture019Record(zero, { sequence: 0, previousHash: "0".repeat(64) });
  assert.equal(base.checks.independent_evaluator_agreement, true);
  assert.equal(base.checks.balance_and_sale_identities, true);
  assert.equal(zero.checks.eta_zero_boundary, true);
  assert.ok(Math.abs(
    zero.arms["one-pass"].delta_equity - zero.arms["full-fixed-point"].delta_equity,
  ) <= 1e-10);
});

test("runtime contract rejects tampering, unknown fields, invalid seeds, and broken chain links", () => {
  const cases = [];
  const changedLoss = structuredClone(recordFor());
  changedLoss.arms["one-pass"].forecast_loss += 0.01;
  cases.push(changedLoss);
  const unknown = structuredClone(recordFor());
  unknown.oracle_future_state = true;
  cases.push(unknown);
  const invalidSeed = structuredClone(recordFor());
  invalidSeed.seed_uint64 = "18446744073709551616";
  cases.push(invalidSeed);
  const brokenPrevious = structuredClone(recordFor());
  brokenPrevious.integrity.previous_sha256 = "a".repeat(64);
  cases.push(brokenPrevious);
  for (const value of cases) {
    assert.throws(
      () => assertFixture019Record(value, { sequence: 0, previousHash: "0".repeat(64) }),
      /Fixture 019/,
    );
  }
});

test("scientific payload strips only the integrity envelope", () => {
  const record = recordFor();
  const payload = fixture019ScientificPayload(record);
  assert.equal("integrity" in payload, false);
  assert.equal(payload.world_sha256, record.world_sha256);
  assert.equal(payload.resources.worker_cpu_ns, record.resources.worker_cpu_ns);
});

test("staged fallback always restarts the full funding model", () => {
  const source = String.raw`
import json
from generator import generate_world
from simulator import forecast_arms

world = generate_world("6050310934014137086", 0.35)
disabled = forecast_arms(world, eta=0.1, funding_enabled=False)
enabled = forecast_arms(world, eta=0.1, funding_enabled=True)
print(json.dumps({
    "fallback_disabled_cell": disabled["staged-liquidation-fallback"],
    "fallback_enabled_cell": enabled["staged-liquidation-fallback"],
    "ordinary_disabled": disabled["full-fixed-point"],
    "ordinary_enabled": enabled["full-fixed-point"],
}, sort_keys=True))
`;
  const result = JSON.parse(runFixture019Python(["-B", "-c", source]));

  assert.deepEqual(result.fallback_disabled_cell, result.fallback_enabled_cell);
  assert.equal(result.fallback_disabled_cell.funding_triggered, true);
  assert.equal(result.fallback_disabled_cell.funding_call_executed, true);
  assert.equal(result.fallback_disabled_cell.funding_call_count, 1);
  assert.equal(result.fallback_disabled_cell.rounds, 34);
  assert.ok(Math.abs(result.fallback_disabled_cell.delta_equity - 209.46388) < 1e-5);
  assert.equal(result.ordinary_disabled.funding_triggered, false);
  assert.equal(result.ordinary_enabled.funding_triggered, true);
});
