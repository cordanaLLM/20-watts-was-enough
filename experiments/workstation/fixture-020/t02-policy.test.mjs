import assert from "node:assert/strict";
import test from "node:test";
import { T02_L_MAX, T02_R_MAX, T02_R_MIN, T02_SEEDS } from "./t02-contract.mjs";
import { evaluateArmAT02 } from "./t02-evaluator.mjs";
import { calibrationCell, calibrationRegimeParams, generateT02World } from "./t02-generator.mjs";
import { computeObjective } from "./t02-objective.mjs";
import { assertT02ArmInput, clampCubicRadii, cubicArmAPolicy, developmentCalibration,
  MAX_GOLDEN_ITERATIONS, selectBestCandidate, T02_CANDIDATE_ORDER,
  t02ArmInput, T02PolicyError } from "./t02-policy.mjs";

test("t02ArmInput strips manifest/stream internals and assertT02ArmInput rejects oracle leaks", () => {
  const world = generateT02World({ seed: T02_SEEDS[0] });
  const view = t02ArmInput(world);
  assert.equal(assertT02ArmInput(view), view);
  const serialized = JSON.stringify(view);
  assert.equal(/ICP-v2|streams|attempts|uniform_upper_round|tree_sha256|world_sha256/.test(serialized), false);
  const cellView = t02ArmInput({ tree: calibrationCell(), regime: "classic",
    regime_params: calibrationRegimeParams() }, { r_min: 1e-3, r_max: 1e-3 });
  assert.equal(cellView.radius_limits.r_min, 1e-3);

  const leaks = [
    (v) => { v.streams = world.manifest.streams; },
    (v) => { v.geometry.tree_sha256 = "0".repeat(64); },
    (v) => { v.regime_coefficients.oracle = 1; },
    (v) => { v.radius_limits.extra = 1; },
    (v) => { v.pressure_constraints.extra = 1; },
    (v) => { v.radius_limits.r_min = 0.01; v.radius_limits.r_max = 0.001; },
  ];
  for (let i = 0; i < leaks.length; i += 1) {
    const mutated = structuredClone(view);
    leaks[i](mutated);
    assert.throws(() => assertT02ArmInput(mutated), T02PolicyError);
  }
});

test("clampCubicRadii allows <=1e-12 relative drift and throws policy error above 1e-12 relative", () => {
  const interior = clampCubicRadii(0.1, [1e-2, 2e-2]);
  assert.deepEqual(interior, [1e-3, 2e-3]);
  const nearMin = clampCubicRadii(1 - 0.5e-12, [T02_R_MIN]);
  assert.deepEqual(nearMin, [T02_R_MIN]);
  const nearMax = clampCubicRadii(1 + 0.5e-12, [T02_R_MAX]);
  assert.deepEqual(nearMax, [T02_R_MAX]);
  assert.throws(() => clampCubicRadii(1 - 2e-12, [T02_R_MIN]), T02PolicyError);
  assert.throws(() => clampCubicRadii(1 + 2e-12, [T02_R_MAX]), T02PolicyError);
  assert.throws(() => clampCubicRadii(0, [1e-2]), T02PolicyError);
});

test("selectBestCandidate preserves canonical order on <=1e-12 objective ties and picks strictly lower P", () => {
  assert.equal(selectBestCandidate([]), null);
  assert.equal(selectBestCandidate([{ candidate: "lower", objective_w: 1, feasible: false }]), null);
  const tied = [
    { candidate: "lower", objective_w: 10, feasible: true },
    { candidate: "midpoint", objective_w: 10 - 0.5e-11, feasible: true },
    { candidate: "upper", objective_w: 10 - 0.9e-11, feasible: true },
  ];
  assert.equal(selectBestCandidate(tied).candidate, "lower");
  const distinct = [
    { candidate: "lower", objective_w: 10, feasible: true },
    { candidate: "midpoint", objective_w: 10 - 2e-11, feasible: true },
  ];
  assert.equal(selectBestCandidate(distinct).candidate, "midpoint");
  const subUnitTie = [
    { candidate: "golden-a", objective_w: 6e-4, feasible: true },
    { candidate: "golden-b", objective_w: 6e-4 - 5e-13, feasible: true },
  ];
  assert.equal(selectBestCandidate(subUnitTie).candidate, "golden-a");
});

test("cubicArmAPolicy evaluates canonical candidates, respects exact cap boundary, and throws on 200-iter cap", () => {
  const tree = calibrationCell();
  const rp = calibrationRegimeParams();
  const input = t02ArmInput({ tree, regime: "classic", regime_params: rp });
  const oracle = (radii) => computeObjective(tree, radii, rp);
  const res = cubicArmAPolicy(input, oracle);
  assert.deepEqual(res.candidates.map((c) => c.candidate), [...T02_CANDIDATE_ORDER]);
  assert.equal(res.solverLog.length, res.goldenIterations);

  const exactCap = cubicArmAPolicy(input, oracle, { maxGoldenIterations: res.goldenIterations });
  assert.equal(exactCap.goldenIterations, res.goldenIterations);
  assert.throws(() => cubicArmAPolicy(input, oracle, { maxGoldenIterations: res.goldenIterations - 1 }),
    T02PolicyError);

  const world = { tree, regime: "classic", regime_params: rp,
    manifest: { uniform_upper_round: 0, terminal_failure: null } };
  const capHit = evaluateArmAT02(world, { goldenRelativeWidth: 1e-16 });
  assert.equal(capHit.failure_reason, "policy-exception");
  assert.equal(capHit.golden_iterations, MAX_GOLDEN_ITERATIONS);
  assert.equal(capHit.loss_j, T02_L_MAX);
});

test("developmentCalibration passes at 1/3 and fails under exponent 0.34 mutation with closed keys", () => {
  const passed = developmentCalibration();
  assert.deepEqual(Object.keys(passed),
    ["status", "alpha_relative_error", "power_relative_error", "murray_relative_error", "b_agreement"]);
  assert.equal(passed.status, "passed");
  assert.equal(passed.b_agreement, "not-built");
  assert.ok(passed.alpha_relative_error <= 1e-6);
  assert.ok(passed.power_relative_error <= 1e-6);
  assert.ok(passed.murray_relative_error <= 1e-12);

  const mutated = developmentCalibration({ exponent: 0.34 });
  assert.deepEqual(Object.keys(mutated), Object.keys(passed));
  assert.equal(mutated.status, "failed");
  assert.ok(mutated.murray_relative_error > 1e-3);
});
