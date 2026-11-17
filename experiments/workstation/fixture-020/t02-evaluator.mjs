import { ExecutionStop } from "./contract.mjs";
import { T02_L_MAX, T02_R_MAX, T02_R_MIN } from "./t02-contract.mjs";
import { checkFlowClosure, computeObjective, designSha256, fittedExponent } from "./t02-objective.mjs";
import { cubicArmAPolicy, MAX_GOLDEN_ITERATIONS, t02ArmInput, T02PolicyError } from "./t02-policy.mjs";

function zeroEval(world, resourceCap = 200000) {
  const ec = world.tree?.edge_count ?? 0;
  const tc = world.tree?.terminal_count ?? 0;
  return { loss_j: T02_L_MAX, maximum_loss_j: T02_L_MAX, objective_w: 0, pumping_w: 0, volume_w: 0,
    pulsatile_w: 0, wall_floor_w: 0, pumping_j: 0, volume_j: 0, pulsatile_j: 0,
    wall_floor_j: 0, material_volume_m3: 0, alpha: 0, fitted_exponent: 0,
    minimum_terminal_margin_pa: 0, maximum_pressure_shortfall_pa: 0,
    mean_pressure_shortfall_pa: 0, evaluations: 0, golden_iterations: 0,
    resource_cap_evaluations: resourceCap, edges: ec, terminals: tc,
    uniform_upper_round: world.manifest?.uniform_upper_round ?? 0,
    failure_reason: null, design_sha256: designSha256([]),
    radii: [], solverLog: [], designCandidates: [], edgeComponents: [],
    nodePressures: new Float64Array(0) };
}

function failedEval(world, reason, { resourceCap = 200000, evaluations = 0,
  goldenIterations = 0, solverLog = [], designCandidates = [] } = {}) {
  return { ...zeroEval(world, resourceCap), failure_reason: reason,
    evaluations, golden_iterations: goldenIterations, solverLog, designCandidates };
}

function hasTreeArrays(tree) {
  return Boolean(tree)
    && Array.isArray(tree.edge_lengths) && Array.isArray(tree.edge_flows)
    && tree.edge_lengths.length === tree.edge_count
    && tree.edge_flows.length === tree.edge_count;
}

function hasFiniteWorldParameters(world, radiusLimits) {
  const { tree, regime_params: rp } = world;
  if (!hasTreeArrays(tree)) return false;
  const scalars = [tree.mu0, tree.lambda_V, tree.P_root, radiusLimits.r_min, radiusLimits.r_max,
    rp?.required_terminal_pressure ?? 0];
  for (const key of ["a", "r_c", "lambda_I", "f", "rho", "lambda_A"]) {
    if (rp?.[key] !== undefined) scalars.push(rp[key]);
  }
  return scalars.every(Number.isFinite)
    && tree.edge_lengths.every(Number.isFinite)
    && tree.edge_flows.every(Number.isFinite);
}

function buildSuccessResult(chosen, world, candidates, state) {
  const obj = chosen.result;
  const radii = chosen.radii;
  const tree = world.tree;
  return { loss_j: 3600 * obj.power, maximum_loss_j: T02_L_MAX,
    objective_w: obj.power, pumping_w: obj.pumping, volume_w: obj.volume,
    pulsatile_w: obj.pulsatile, wall_floor_w: obj.wallFloor,
    pumping_j: 3600 * obj.pumping, volume_j: 3600 * obj.volume,
    pulsatile_j: 3600 * obj.pulsatile, wall_floor_j: 3600 * obj.wallFloor,
    material_volume_m3: obj.materialVolume, alpha: chosen.alpha,
    fitted_exponent: fittedExponent(tree.edge_flows, radii),
    minimum_terminal_margin_pa: obj.minMargin,
    maximum_pressure_shortfall_pa: obj.maxShortfall,
    mean_pressure_shortfall_pa: obj.meanShortfall,
    evaluations: state.evaluations, golden_iterations: state.goldenIterations,
    resource_cap_evaluations: state.resourceCap,
    edges: tree.edge_count, terminals: tree.terminal_count,
    uniform_upper_round: world.manifest.uniform_upper_round,
    failure_reason: null, design_sha256: designSha256(radii),
    radii, solverLog: state.solverLog, designCandidates: candidates,
    edgeComponents: obj.edgeComponents, nodePressures: obj.nodePressures };
}

function makeOracle(world, radiusLimits, check, state) {
  return (radii) => {
    try { check(); } catch (error) {
      if (!(error instanceof ExecutionStop)) throw error;
      state.abortReason = "missing-output";
      return { aborted: true };
    }
    if (!Array.isArray(radii) || radii.length !== world.tree.edge_count) {
      state.abortReason = "missing-output";
      return { aborted: true };
    }
    if (state.evaluations >= state.resourceCap) {
      state.abortReason = "resource-cap";
      return { aborted: true };
    }
    state.evaluations += 1;
    const obj = computeObjective(world.tree, radii, world.regime_params, radiusLimits);
    if (obj.brokenClosure) { state.abortReason = "broken-closure"; return { aborted: true }; }
    if (obj.nonFinite) { state.abortReason = "non-finite-objective"; return { aborted: true }; }
    return obj;
  };
}

function invokePolicySafely(world, radiusLimits, check, state, policy, options) {
  try {
    check();
    const input = t02ArmInput(world, radiusLimits);
    return { outcome: policy(input, makeOracle(world, radiusLimits, check, state), options), failure: null };
  } catch (error) {
    if (error instanceof ExecutionStop) return { outcome: null, failure: "missing-output" };
    if (error instanceof T02PolicyError) {
      state.goldenIterations = error.goldenIterations;
      state.solverLog = error.solverLog;
    }
    return { outcome: null, failure: "policy-exception" };
  }
}

function validChosenRadii(outcome, edgeCount) {
  if (!outcome) return false;
  if (outcome.chosen === null) return true;
  return Array.isArray(outcome.chosen.radii) && outcome.chosen.radii.length === edgeCount;
}

function precheckWorld(world, radiusLimits) {
  if (world.manifest.terminal_failure) return world.manifest.terminal_failure.reason;
  if (!hasFiniteWorldParameters(world, radiusLimits)) return "non-finite-objective";
  if (!checkFlowClosure(world.tree)) return "broken-closure";
  return null;
}

export function evaluateArmAT02(world, {
  check = () => {},
  resourceCap = 200000,
  goldenRelativeWidth = 1e-10,
  maxGoldenIterations = MAX_GOLDEN_ITERATIONS,
  exponent = 1 / 3,
  policy = cubicArmAPolicy,
  radiusLimits = { r_min: T02_R_MIN, r_max: T02_R_MAX },
} = {}) {
  const precheckFailure = precheckWorld(world, radiusLimits);
  if (precheckFailure) return failedEval(world, precheckFailure, { resourceCap });
  const state = { evaluations: 0, goldenIterations: 0, solverLog: [], resourceCap, abortReason: null };
  const { outcome, failure } = invokePolicySafely(world, radiusLimits, check, state, policy,
    { goldenRelativeWidth, maxGoldenIterations, exponent });
  if (failure) return failedEval(world, failure, state);
  state.goldenIterations = outcome.goldenIterations ?? 0;
  state.solverLog = outcome.solverLog ?? [];
  if (state.abortReason) return failedEval(world, state.abortReason, state);
  if (!validChosenRadii(outcome, world.tree.edge_count)) return failedEval(world, "missing-output", state);
  const candidates = outcome.candidates ?? [];
  if (!outcome.chosen?.result?.feasible) {
    return failedEval(world, "infeasible-design", { ...state, designCandidates: candidates });
  }
  return buildSuccessResult(outcome.chosen, world, candidates, state);
}
