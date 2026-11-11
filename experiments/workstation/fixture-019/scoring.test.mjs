import assert from "node:assert/strict";
import test from "node:test";

import { runFixture019Python } from "./test-helpers.mjs";

function registeredScoringCases() {
  const source = String.raw`
import json
from worker import apply_registered_scoring

def arm(raw, *, status="ok", converged=True, floor=False, rounds=4, nonconvergence=False):
    return {
        "raw_forecast_loss": raw,
        "forecast_loss": raw,
        "terminal_status": status,
        "converged": converged,
        "price_floor_hit": floor,
        "rounds": rounds,
        "nonconvergence": nonconvergence,
        "abstained": False,
        "abstention_charge": 0.0,
        "score_assignment": "ordinary",
    }

truth = {"terminal_status": "ok", "converged": True}
base = {
    "zero-impact": arm(0.0, status="hard_gate_failed"),
    "one-pass": arm(0.12, converged=False, nonconvergence=False),
    "full-fixed-point": arm(0.0, converged=False, rounds=1000, nonconvergence=True),
    "full-fixed-point-with-funding": arm(0.0, converged=False, rounds=12, nonconvergence=True),
    "staged-liquidation-fallback": arm(0.20),
}
cap = apply_registered_scoring(base, truth)

floor_arms = {
    name: arm(0.20) if name == "staged-liquidation-fallback" else arm(0.0)
    for name in base
}
floor_arms["full-fixed-point"]["price_floor_hit"] = True
floor = apply_registered_scoring(floor_arms, truth)

failed_fallback = {
    name: arm(0.0)
    for name in base
}
failed_fallback["full-fixed-point"].update({"converged": False, "rounds": 1000, "nonconvergence": True})
failed_fallback["staged-liquidation-fallback"].update({"converged": False, "rounds": 1000, "nonconvergence": True})
failed = apply_registered_scoring(failed_fallback, truth)

print(json.dumps({"cap": cap, "floor": floor, "failed": failed}, sort_keys=True))
`;
  return JSON.parse(runFixture019Python(["-B", "-c", source]));
}

test("registered scoring assigns Lmax and restarts the staged fallback with its charge", () => {
  const cases = registeredScoringCases();
  assert.equal(cases.cap["zero-impact"].forecast_loss, 1);
  assert.equal(cases.cap["zero-impact"].score_assignment, "lmax-hard-gate");
  assert.equal(cases.cap["one-pass"].forecast_loss, 0.12);
  assert.equal(cases.cap["one-pass"].score_assignment, "ordinary");
  assert.ok(Math.abs(cases.cap["full-fixed-point"].forecast_loss - 0.21) <= 1e-15);
  assert.equal(cases.cap["full-fixed-point"].abstention_charge, 0.01);
  assert.equal(cases.cap["full-fixed-point"].score_assignment, "staged-fallback-plus-charge");
  assert.equal(cases.cap["full-fixed-point-with-funding"].forecast_loss, 1);
  assert.equal(cases.cap["full-fixed-point-with-funding"].score_assignment, "lmax-nonconvergence");
  assert.ok(Math.abs(cases.floor["full-fixed-point"].forecast_loss - 0.21) <= 1e-15);
  assert.equal(cases.floor["full-fixed-point"].score_assignment, "staged-fallback-plus-charge");
  assert.equal(cases.failed["full-fixed-point"].forecast_loss, 1);
  assert.equal(cases.failed["full-fixed-point"].score_assignment, "lmax-fallback-failure");
  assert.equal(cases.failed["staged-liquidation-fallback"].forecast_loss, 1);
});
