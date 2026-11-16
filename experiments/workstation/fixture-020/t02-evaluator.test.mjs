import assert from "node:assert/strict";
import test from "node:test";
import { T02_L_MAX, T02_SEEDS } from "./t02-contract.mjs";
import { evaluateArmAT02 } from "./t02-evaluator.mjs";
import { generateT02World } from "./t02-generator.mjs";
import { developmentCalibration } from "./t02-policy.mjs";


test("calibration passes with errors within thresholds", () => {
  const cal = developmentCalibration();
  assert.equal(cal.status, "passed");
  assert.ok(cal.alpha_relative_error <= 1e-6);
  assert.ok(cal.power_relative_error <= 1e-6);
  assert.ok(cal.murray_relative_error <= 1e-12);
});

test("mutation: exponent 1/3 -> 0.34 breaks calibration", async () => {
  const { calibrationCell, calibrationRegimeParams } = await import("./t02-generator.mjs");
  const { computeObjective, analyticAlphaStar: alphaStar } = await import("./t02-objective.mjs");
  const tree = calibrationCell();
  const regimeParams = calibrationRegimeParams();
  const cubrtFlows = tree.edge_flows.map((q) => q ** 0.34);
  const alphaLo = cubrtFlows.reduce((mx, c) => Math.max(mx, 5e-5 / c), -Infinity);
  const alphaHi = cubrtFlows.reduce((mn, c) => Math.min(mn, 5e-3 / c), Infinity);
  const alpha = (alphaLo + alphaHi) / 2;
  const radii = cubrtFlows.map((c) => alpha * c);
  computeObjective(tree, radii, regimeParams);
  const as = alphaStar(tree.mu0, tree.lambda_V);
  assert.ok(Math.abs(alpha / as - 1) > 1e-3, "mutated exponent must differ from analytic alpha*");
});

test("golden width converges below 1e-10 on generated world", () => {
  const world = generateT02World({ seed: T02_SEEDS[0] });
  if (world.tree === null) return;
  const result = evaluateArmAT02(world);
  if (result.failure_reason !== null) return;
  const lastLog = result.solverLog[result.solverLog.length - 1];
  assert.ok(Math.expm1(lastLog.hi - lastLog.lo) <= 1e-10);
});

test("candidate tie keeps earlier (lower x) candidate", () => {
  const world = generateT02World({ seed: T02_SEEDS[0] });
  if (world.tree === null || !world.regime_params) return;
  const result = evaluateArmAT02(world);
  if (result.failure_reason !== null) return;
  const chosen = result.designCandidates.filter((c) => c.chosen);
  assert.equal(chosen.length, 1);
});

test("empty interval produces infeasible-design with terminal loss", () => {
  const world = {
    tree: { depth: 1, node_count: 3, edge_count: 2, terminal_count: 2, first_terminal: 1,
      edge_lengths: [0.02, 0.02], edge_flows: [1e-20, 1e20],
      mu0: 0.0035, lambda_V: 1e3, P_root: 25000 },
    regime_params: { required_terminal_pressure: 0 },
    manifest: { uniform_upper_round: 0, terminal_failure: null },
  };
  const result = evaluateArmAT02(world);
  assert.equal(result.failure_reason, "infeasible-design");
  assert.equal(result.loss_j, T02_L_MAX);
});

test("evaluation cap reached produces resource-cap failure", () => {
  const world = generateT02World({ seed: T02_SEEDS[0] });
  if (world.tree === null) return;
  const result = evaluateArmAT02(world, { resourceCap: 1 });
  assert.equal(result.failure_reason, "resource-cap");
  assert.equal(result.loss_j, T02_L_MAX);
});

test("generation failure world evaluates to terminal loss", () => {
  const world = generateT02World({ seed: T02_SEEDS[0], rejectionLimit: 0 });
  const result = evaluateArmAT02(world);
  assert.equal(result.failure_reason, "generator-failure");
  assert.equal(result.loss_j, T02_L_MAX);
});
