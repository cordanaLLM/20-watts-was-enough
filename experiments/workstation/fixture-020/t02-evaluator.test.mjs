import assert from "node:assert/strict";
import test from "node:test";
import { ExecutionStop } from "./contract.mjs";
import { assertT02Record, T02_L_MAX, T02_SEEDS, t02WorldId } from "./t02-contract.mjs";
import { t02WorldArtifacts } from "./t02-artifacts.mjs";
import { evaluateArmAT02 } from "./t02-evaluator.mjs";
import { calibrationCell, calibrationRegimeParams, generateT02World } from "./t02-generator.mjs";
import { developmentCalibration } from "./t02-policy.mjs";
import { getTrack } from "./tracks.mjs";

test("calibration passes with errors within thresholds", () => {
  const cal = developmentCalibration();
  assert.equal(cal.status, "passed");
  assert.ok(cal.alpha_relative_error <= 1e-6);
  assert.ok(cal.power_relative_error <= 1e-6);
  assert.ok(cal.murray_relative_error <= 1e-12);
  assert.equal(cal.b_agreement, "not-built");
});

test("mutation: exponent 1/3 -> 0.34 makes developmentCalibration fail", () => {
  const cal = developmentCalibration({ exponent: 0.34 });
  assert.equal(cal.status, "failed");
  assert.ok(cal.murray_relative_error > 1e-12);
});

test("golden width converges below 1e-10 on generated world", () => {
  const world = generateT02World({ seed: T02_SEEDS[0] });
  const result = evaluateArmAT02(world);
  assert.equal(result.failure_reason, null);
  const lastLog = result.solverLog.at(-1);
  assert.ok(Math.expm1(lastLog.hi - lastLog.lo) <= 1e-10);
});

test("candidate tie keeps earlier canonical candidate when objective values tie", () => {
  const cell = { ...calibrationCell(), mu0: 0, lambda_V: 0 };
  const world = {
    seed: T02_SEEDS[0], world_id: t02WorldId(T02_SEEDS[0]), regime: "classic",
    tree: cell, regime_params: calibrationRegimeParams(),
    manifest: { uniform_upper_round: 0, terminal_failure: null },
  };
  const result = evaluateArmAT02(world);
  assert.equal(result.failure_reason, null);
  const chosen = result.designCandidates.filter((c) => c.chosen);
  assert.equal(chosen.length, 1);
  assert.equal(chosen[0].candidate, "lower");
});

test("empty interval and all-infeasible candidates produce infeasible-design with terminal loss", () => {
  const emptyWorld = {
    tree: { depth: 1, node_count: 3, edge_count: 2, terminal_count: 2, first_terminal: 1,
      edge_lengths: [0.02, 0.02], edge_flows: [1e-20, 1e20], terminal_flows: [1e-20, 1e20],
      mu0: 0.0035, lambda_V: 1e3, P_root: 25000 },
    regime: "classic",
    regime_params: { required_terminal_pressure: 0 },
    manifest: { uniform_upper_round: 0, terminal_failure: null },
  };
  const emptyRes = evaluateArmAT02(emptyWorld);
  assert.equal(emptyRes.failure_reason, "infeasible-design");
  assert.equal(emptyRes.loss_j, T02_L_MAX);
  assert.equal(emptyRes.evaluations, 0);

  const infeasWorld = {
    tree: calibrationCell(), regime: "wall-floor",
    regime_params: { lambda_A: 10, P_min: 50000, required_terminal_pressure: 50000 },
    manifest: { uniform_upper_round: 0, terminal_failure: null },
  };
  const infeasRes = evaluateArmAT02(infeasWorld);
  assert.equal(infeasRes.failure_reason, "infeasible-design");
  assert.equal(infeasRes.loss_j, T02_L_MAX);
  assert.ok(infeasRes.evaluations > 5);
  assert.equal(infeasRes.designCandidates.length, 5);
});

test("resource cap, generation failure, broken closure, non-finite, stop, and policy failures retain finite L_max", () => {
  const world = generateT02World({ seed: T02_SEEDS[0] });
  const capRes = evaluateArmAT02(world, { resourceCap: 1 });
  assert.equal(capRes.failure_reason, "resource-cap");
  assert.equal(capRes.loss_j, T02_L_MAX);

  const genFail = generateT02World({ seed: T02_SEEDS[0], rejectionLimit: 0 });
  const genRes = evaluateArmAT02(genFail);
  assert.equal(genRes.failure_reason, "generator-failure");
  assert.equal(genRes.loss_j, T02_L_MAX);

  const brokenTree = { ...calibrationCell(), edge_flows: [2.5e-6, 1e-6, 1e-6] };
  const brokenRes = evaluateArmAT02({ tree: brokenTree, regime: "classic",
    regime_params: calibrationRegimeParams(), manifest: { uniform_upper_round: 0, terminal_failure: null } });
  assert.equal(brokenRes.failure_reason, "broken-closure");
  assert.equal(brokenRes.loss_j, T02_L_MAX);

  const nanWorld = { ...world, tree: { ...world.tree, mu0: NaN } };
  const nanEval = evaluateArmAT02(nanWorld);
  assert.equal(nanEval.failure_reason, "non-finite-objective");
  const overflowEval = evaluateArmAT02(world, {
    policy: (_input, evaluateDesign) => {
      evaluateDesign(new Array(world.tree.edge_count).fill(1e-100));
      return { chosen: null, candidates: [], solverLog: [], goldenIterations: 0 };
    },
  });
  assert.equal(overflowEval.failure_reason, "non-finite-objective");
  const t02 = getTrack("ICP-T02");
  const artifacts = t02WorldArtifacts(world, overflowEval);
  const record = t02.makeRecord({ run_id: "a".repeat(64), profile: "smoke" }, world, artifacts, null);
  record.integrity = { sequence: 0, previous_sha256: "0".repeat(64), record_sha256: "0".repeat(64) };
  assert.throws(() => assertT02Record(record), /hash chain digest/);

  let calls = 0;
  const stopped = evaluateArmAT02(world, {
    check: () => { calls += 1; if (calls === 3) throw new ExecutionStop("timeout", "ICP-T02"); },
  });
  assert.equal(stopped.failure_reason, "missing-output");
  assert.equal(stopped.loss_j, T02_L_MAX);

  const badPolicy = evaluateArmAT02(world, { policy: () => ({ chosen: { radii: [1e-3] } }) });
  assert.equal(badPolicy.failure_reason, "missing-output");
  const throwPolicy = evaluateArmAT02(world, { policy: () => { throw new Error("boom"); } });
  assert.equal(throwPolicy.failure_reason, "policy-exception");
});
