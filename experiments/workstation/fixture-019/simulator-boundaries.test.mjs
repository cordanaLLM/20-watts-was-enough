import assert from "node:assert/strict";
import test from "node:test";

import { runFixture019Python } from "./test-helpers.mjs";

function forcedBoundaries() {
  const source = String.raw`
import json
import simulator
from generator import generate_world

world = generate_world("6050310934014137086", 0.35)
cap = simulator.simulate_forecast(world, eta=0.10, funding_enabled=False, max_rounds=1)
floor = simulator.simulate_forecast(world, eta=100.0, funding_enabled=False)

funding_world = dict(world)
funding_world["reference_equity"] = 10000.0
missing_call = simulator.simulate_forecast(
    funding_world,
    eta=0.10,
    funding_enabled=True,
    max_rounds=2,
)

original_world_arrays = simulator.world_arrays
holdings, liabilities, prices, supply = original_world_arrays(world)
holdings[0, 0] = -1.0
simulator.world_arrays = lambda _: (holdings, liabilities, prices, supply)
try:
    negative = simulator.simulate_forecast(world, eta=0.10, funding_enabled=False)
finally:
    simulator.world_arrays = original_world_arrays

print(json.dumps({
    "cap": cap,
    "floor": floor,
    "missing_call": missing_call,
    "negative": negative,
}, sort_keys=True))
`;
  return JSON.parse(runFixture019Python(["-B", "-c", source]));
}

test("forced cap, floor, missing-call, and negative-balance boundaries fail closed", () => {
  const result = forcedBoundaries();
  assert.equal(result.cap.rounds, 1);
  assert.equal(result.cap.converged, false);
  assert.equal(result.floor.price_floor_hit, true);
  assert.equal(result.missing_call.funding_triggered, true);
  assert.equal(result.missing_call.funding_call_executed, false);
  assert.equal(result.missing_call.converged, false);
  assert.equal(result.negative.terminal_status, "hard_gate_failed");
  assert.equal(result.negative.max_negative_quantity, 1);
});
