import { T02_L_MAX, T02_R_MIN, T02_R_MAX } from "./t02-contract.mjs";
import { computeObjective, designSha256, fittedExponent } from "./t02-objective.mjs";

const GOLDEN_RATIO = (Math.sqrt(5) - 1) / 2;
const MAX_GOLDEN_ITERATIONS = 200;

function goldenSectionSearch(tree, cubrtFlows, params, xLo, xHi, check, state) {
  let a = xLo;
  let b = xHi;
  let xA = a + (1 - GOLDEN_RATIO) * (b - a);
  let xB = a + GOLDEN_RATIO * (b - a);
  const evalX = (x) => {
    check();
    state.evaluations += 1;
    if (state.evaluations > state.resourceCap) return { power: Infinity, resourceCapHit: true };
    const alpha = Math.exp(x);
    const radii = cubrtFlows.map((c) => Math.max(T02_R_MIN, Math.min(T02_R_MAX, alpha * c)));
    return computeObjective(tree, radii, params);
  };
  let fA = evalX(xA);
  let fB = evalX(xB);
  if (fA.resourceCapHit || fB.resourceCapHit) return null;
  state.solverLog.push({ iteration: 0, x_a: xA, x_b: xB, f_a: fA.power, f_b: fB.power, lo: a, hi: b });
  while (Math.expm1(b - a) > 1e-10 && state.goldenIterations < MAX_GOLDEN_ITERATIONS) {
    state.goldenIterations += 1;
    if (fA.power <= fB.power) {
      b = xB; xB = xA; fB = fA;
      xA = a + (1 - GOLDEN_RATIO) * (b - a);
      fA = evalX(xA);
    } else {
      a = xA; xA = xB; fA = fB;
      xB = a + GOLDEN_RATIO * (b - a);
      fB = evalX(xB);
    }
    if (fA.resourceCapHit || fB.resourceCapHit) return null;
    state.solverLog.push({ iteration: state.goldenIterations, x_a: xA, x_b: xB, f_a: fA.power, f_b: fB.power, lo: a, hi: b });
  }
  if (state.goldenIterations >= MAX_GOLDEN_ITERATIONS) return "policy";
  return { xA, xB };
}

function evaluateCandidates(tree, cubrtFlows, params, xLo, xHi, xA, xB, check, state) {
  const candidates = [
    { candidate: "lower", x: xLo },
    { candidate: "midpoint", x: (xLo + xHi) / 2 },
    { candidate: "upper", x: xHi },
    { candidate: "golden-a", x: xA },
    { candidate: "golden-b", x: xB },
  ];
  const evaluated = [];
  for (const c of candidates) {
    check();
    const alpha = Math.exp(c.x);
    const rawRadii = cubrtFlows.map((cf) => alpha * cf);
    const clampedRadii = rawRadii.map((r) => Math.max(T02_R_MIN, Math.min(T02_R_MAX, r)));
    let clampExceeded = false;
    for (let e = 0; e < rawRadii.length; e += 1) {
      if (rawRadii[e] !== 0 && Math.abs(clampedRadii[e] - rawRadii[e]) > 1e-12 * Math.max(1, Math.abs(rawRadii[e]))) {
        clampExceeded = true;
        break;
      }
    }
    if (clampExceeded) return "policy";
    state.evaluations += 1;
    if (state.evaluations > state.resourceCap) return null;
    const result = computeObjective(tree, clampedRadii, params);
    if (result.nonFinite) return { nonFinite: true, result, radii: clampedRadii };
    evaluated.push({ ...c, alpha, radii: clampedRadii, result, feasible: result.feasible });
  }
  return evaluated;
}

function selectBest(evaluated) {
  let best = null;
  for (const c of evaluated) {
    if (!c.feasible) continue;
    if (best === null) { best = c; continue; }
    const diff = Math.abs(c.x - best.x);
    const scale = Math.max(1, Math.abs(c.x), Math.abs(best.x));
    if (diff <= 1e-12 * scale) continue;
    if (c.result.power < best.result.power) best = c;
  }
  return best;
}

function buildSuccessResult(best, tree, world, evaluated, state) {
  const obj = best.result;
  const radii = best.radii;
  const fe = fittedExponent(tree.edge_flows, radii);
  const dSha = designSha256(radii);
  const designCandidates = evaluated.map((c) => ({
    candidate: c.candidate, alpha: c.alpha, objective_w: c.result.power, feasible: c.feasible,
    chosen: c === best,
  }));
  return { loss_j: 3600 * obj.power, maximum_loss_j: T02_L_MAX,
    objective_w: obj.power, pumping_w: obj.pumping, volume_w: obj.volume,
    pulsatile_w: obj.pulsatile, wall_floor_w: obj.wallFloor,
    pumping_j: 3600 * obj.pumping, volume_j: 3600 * obj.volume,
    pulsatile_j: 3600 * obj.pulsatile, wall_floor_j: 3600 * obj.wallFloor,
    material_volume_m3: obj.materialVolume, alpha: best.alpha,
    fitted_exponent: fe, minimum_terminal_margin_pa: obj.minMargin,
    maximum_pressure_shortfall_pa: obj.maxShortfall, mean_pressure_shortfall_pa: obj.meanShortfall,
    evaluations: state.evaluations, golden_iterations: state.goldenIterations,
    resource_cap_evaluations: state.resourceCap,
    edges: tree.edge_count, terminals: tree.terminal_count,
    uniform_upper_round: world.manifest.uniform_upper_round,
    failure_reason: null, design_sha256: dSha,
    radii, solverLog: state.solverLog, designCandidates, edgeComponents: obj.edgeComponents,
    nodePressures: obj.nodePressures };
}

export function evaluateArmAT02(world, { check = () => {}, resourceCap = 200000 } = {}) {
  if (world.manifest.terminal_failure) return generationFailure(world);
  const tree = world.tree;
  const params = world.regime_params;
  const cubrtFlows = tree.edge_flows.map((q) => Math.cbrt(q));
  const alphaLo = cubrtFlows.reduce((mx, c) => Math.max(mx, T02_R_MIN / c), -Infinity);
  const alphaHi = cubrtFlows.reduce((mn, c) => Math.min(mn, T02_R_MAX / c), Infinity);
  if (alphaLo > alphaHi) return infeasibleDesign(world, resourceCap);
  const xLo = Math.log(alphaLo);
  const xHi = Math.log(alphaHi);
  const state = { evaluations: 0, goldenIterations: 0, solverLog: [], resourceCap };
  const gss = goldenSectionSearch(tree, cubrtFlows, params, xLo, xHi, check, state);
  if (gss === null) return resourceCapFailure(world, state.evaluations, state.goldenIterations, state.solverLog, resourceCap);
  if (gss === "policy") return policyException(world, state.evaluations, state.goldenIterations, state.solverLog, resourceCap);
  const cands = evaluateCandidates(tree, cubrtFlows, params, xLo, xHi, gss.xA, gss.xB, check, state);
  if (cands === null) return resourceCapFailure(world, state.evaluations, state.goldenIterations, state.solverLog, resourceCap);
  if (cands === "policy") return policyException(world, state.evaluations, state.goldenIterations, state.solverLog, resourceCap);
  if (cands.nonFinite) return nonFiniteFailure(world, state.evaluations, state.goldenIterations, state.solverLog, resourceCap, cands.result, cands.radii);
  const best = selectBest(cands);
  if (best === null) return infeasibleDesign(world, resourceCap);
  return buildSuccessResult(best, tree, world, cands, state);
}

function generationFailure(world) {
  return { ...zeroEval(world), failure_reason: world.manifest.terminal_failure.reason,
    loss_j: T02_L_MAX, maximum_loss_j: T02_L_MAX,
    uniform_upper_round: world.manifest.uniform_upper_round,
    design_sha256: designSha256([]),
    radii: [], solverLog: [], designCandidates: [], edgeComponents: [], nodePressures: new Float64Array(0) };
}

function infeasibleDesign(world, resourceCap) {
  return { ...zeroEval(world), failure_reason: "infeasible-design",
    loss_j: T02_L_MAX, maximum_loss_j: T02_L_MAX, resource_cap_evaluations: resourceCap,
    uniform_upper_round: world.manifest.uniform_upper_round,
    design_sha256: designSha256([]),
    radii: [], solverLog: [], designCandidates: [], edgeComponents: [], nodePressures: new Float64Array(0) };
}

function resourceCapFailure(world, evaluations, goldenIterations, solverLog, resourceCap) {
  return { ...zeroEval(world), failure_reason: "resource-cap",
    loss_j: T02_L_MAX, maximum_loss_j: T02_L_MAX,
    evaluations, golden_iterations: goldenIterations, resource_cap_evaluations: resourceCap,
    uniform_upper_round: world.manifest.uniform_upper_round,
    design_sha256: designSha256([]),
    radii: [], solverLog, designCandidates: [], edgeComponents: [], nodePressures: new Float64Array(0) };
}

function policyException(world, evaluations, goldenIterations, solverLog, resourceCap) {
  return { ...zeroEval(world), failure_reason: "policy-exception",
    loss_j: T02_L_MAX, maximum_loss_j: T02_L_MAX,
    evaluations, golden_iterations: goldenIterations, resource_cap_evaluations: resourceCap,
    uniform_upper_round: world.manifest.uniform_upper_round,
    design_sha256: designSha256([]),
    radii: [], solverLog, designCandidates: [], edgeComponents: [], nodePressures: new Float64Array(0) };
}

function nonFiniteFailure(world, evaluations, goldenIterations, solverLog, resourceCap, obj, radii) {
  return { ...zeroEval(world), failure_reason: "non-finite-objective",
    loss_j: T02_L_MAX, maximum_loss_j: T02_L_MAX,
    evaluations, golden_iterations: goldenIterations, resource_cap_evaluations: resourceCap,
    uniform_upper_round: world.manifest.uniform_upper_round,
    design_sha256: designSha256(radii),
    objective_w: obj.power, pumping_w: obj.pumping, volume_w: obj.volume,
    pulsatile_w: obj.pulsatile, wall_floor_w: obj.wallFloor,
    radii, solverLog, designCandidates: [], edgeComponents: obj.edgeComponents ?? [],
    nodePressures: obj.nodePressures ?? new Float64Array(0) };
}

function zeroEval(world) {
  const ec = world.tree?.edge_count ?? 0;
  const tc = world.tree?.terminal_count ?? 0;
  return { loss_j: 0, maximum_loss_j: T02_L_MAX, objective_w: 0, pumping_w: 0, volume_w: 0,
    pulsatile_w: 0, wall_floor_w: 0, pumping_j: 0, volume_j: 0, pulsatile_j: 0,
    wall_floor_j: 0, material_volume_m3: 0, alpha: 0, fitted_exponent: 0,
    minimum_terminal_margin_pa: 0, maximum_pressure_shortfall_pa: 0,
    mean_pressure_shortfall_pa: 0, evaluations: 0, golden_iterations: 0,
    resource_cap_evaluations: 200000, edges: ec, terminals: tc, uniform_upper_round: 0,
    failure_reason: null, design_sha256: "" };
}
