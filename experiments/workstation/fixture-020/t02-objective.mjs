import { binary64Bytes, sha256 } from "./contract.mjs";
import { T02_R_MIN, T02_R_MAX } from "./t02-contract.mjs";

export function effectiveViscosity(mu0, r, regimeParams = {}) {
  if (regimeParams?.a !== undefined) return mu0 * (1 + regimeParams.a * Math.exp(-r / regimeParams.r_c));
  return mu0;
}

function hasPositiveEdgeFlows(tree) {
  if (!tree || !Array.isArray(tree.edge_flows) || tree.edge_flows.length !== tree.edge_count) return false;
  if (tree.edge_count < 1 || tree.node_count !== tree.edge_count + 1) return false;
  return tree.edge_flows.every((q) => Number.isFinite(q) && q > 0);
}

function terminalFlowsMatch(tree) {
  if (tree.terminal_flows === undefined) return true;
  if (!Array.isArray(tree.terminal_flows) || tree.terminal_flows.length !== tree.terminal_count) return false;
  for (let t = 0; t < tree.terminal_count; t += 1) {
    if (tree.edge_flows[tree.first_terminal + t - 1] !== tree.terminal_flows[t]) return false;
  }
  return true;
}

export function checkFlowClosure(tree) {
  if (!hasPositiveEdgeFlows(tree) || !terminalFlowsMatch(tree)) return false;
  const childSums = new Float64Array(tree.first_terminal);
  for (let n = tree.node_count - 1; n >= 1; n -= 1) {
    const parent = tree.parents ? tree.parents[n] : Math.floor((n - 1) / 2);
    if (parent >= 0 && parent < tree.first_terminal) childSums[parent] += tree.edge_flows[n - 1];
  }
  for (let n = 1; n < tree.first_terminal; n += 1) {
    if (tree.edge_flows[n - 1] !== childSums[n]) return false;
  }
  return true;
}

function computeEdgePower(tree, radii, regimeParams) {
  const { edge_count, edge_lengths, edge_flows, mu0, lambda_V } = tree;
  const edgeComponents = new Array(edge_count);
  let totalPumping = 0, totalVolume = 0, totalPulsatile = 0, totalWallFloor = 0;
  for (let e = 0; e < edge_count; e += 1) {
    const L = edge_lengths[e];
    const Q = edge_flows[e];
    const r = radii[e];
    const mu_e = effectiveViscosity(mu0, r, regimeParams);
    const pumping = 8 * mu_e * L * Q * Q / (Math.PI * r ** 4);
    const volume = lambda_V * Math.PI * r * r * L;
    const pulsatile = regimeParams?.lambda_I !== undefined
      ? regimeParams.lambda_I * regimeParams.f * regimeParams.rho * L * Q * Q / (Math.PI * r * r) : 0;
    const wallFloor = regimeParams?.lambda_A !== undefined
      ? regimeParams.lambda_A * 2 * Math.PI * r * L : 0;
    edgeComponents[e] = { radius_m: r, mu_e_pa_s: mu_e, pressure_drop_pa: 0,
      pumping_w: pumping, volume_w: volume, pulsatile_w: pulsatile, wall_floor_w: wallFloor };
    totalPumping += pumping; totalVolume += volume;
    totalPulsatile += pulsatile; totalWallFloor += wallFloor;
  }
  return { edgeComponents, totalPumping, totalVolume, totalPulsatile, totalWallFloor,
    totalPower: totalPumping + totalVolume + totalPulsatile + totalWallFloor };
}

function propagatePressure(tree, radii, edgeComponents) {
  const nodePressures = new Float64Array(tree.node_count);
  nodePressures[0] = tree.P_root;
  for (let n = 1; n < tree.node_count; n += 1) {
    const eIdx = n - 1;
    const parent = tree.parents ? tree.parents[n] : Math.floor((n - 1) / 2);
    const mu_e = edgeComponents[eIdx].mu_e_pa_s;
    const dP = 8 * mu_e * tree.edge_lengths[eIdx] * tree.edge_flows[eIdx] / (Math.PI * radii[eIdx] ** 4);
    edgeComponents[eIdx].pressure_drop_pa = dP;
    nodePressures[n] = nodePressures[parent] - dP;
  }
  return nodePressures;
}

function singleTerminalMargin(p, required) {
  const margin = p - required;
  if (!Number.isFinite(margin)) return { margin: NaN, shortfall: NaN, ok: false };
  return { margin, shortfall: margin < 0 ? -margin : 0, ok: margin > 0 };
}

function radiiWithinBounds(radii, edgeCount, radiusLimits) {
  const rMin = radiusLimits ? radiusLimits.r_min : T02_R_MIN;
  const rMax = radiusLimits ? radiusLimits.r_max : T02_R_MAX;
  for (let e = 0; e < edgeCount; e += 1) {
    if (!(radii[e] >= rMin && radii[e] <= rMax)) return false;
  }
  return true;
}

function checkFeasibility(tree, radii, nodePressures, regimeParams, radiusLimits) {
  const required = regimeParams?.required_terminal_pressure ?? 0;
  let minMargin = Infinity, maxShortfall = 0, sumShortfall = 0;
  let feasible = radiiWithinBounds(radii, tree.edge_count, radiusLimits);
  for (let t = 0; t < tree.terminal_count; t += 1) {
    const term = singleTerminalMargin(nodePressures[tree.first_terminal + t], required);
    if (!term.ok) feasible = false;
    minMargin = Math.min(minMargin, term.margin);
    maxShortfall = Math.max(maxShortfall, term.shortfall);
    sumShortfall += term.shortfall;
  }
  const meanShortfall = tree.terminal_count > 0 ? sumShortfall / tree.terminal_count : 0;
  return { feasible, minMargin, maxShortfall, meanShortfall };
}

function hasNonFiniteResult(ep, nodePressures, feas, materialVolume) {
  if (![ep.totalPower, ep.totalPumping, ep.totalVolume, ep.totalPulsatile, ep.totalWallFloor,
    feas.minMargin, feas.maxShortfall, feas.meanShortfall, materialVolume].every(Number.isFinite)) {
    return true;
  }
  for (let n = 0; n < nodePressures.length; n += 1) {
    if (!Number.isFinite(nodePressures[n])) return true;
  }
  for (let e = 0; e < ep.edgeComponents.length; e += 1) {
    const c = ep.edgeComponents[e];
    if (![c.radius_m, c.mu_e_pa_s, c.pressure_drop_pa, c.pumping_w, c.volume_w,
      c.pulsatile_w, c.wall_floor_w].every(Number.isFinite)) return true;
  }
  return false;
}

export function computeObjective(tree, radii, regimeParams = {}, radiusLimits) {
  const brokenClosure = !checkFlowClosure(tree);
  const ep = computeEdgePower(tree, radii, regimeParams);
  const nodePressures = propagatePressure(tree, radii, ep.edgeComponents);
  const feas = checkFeasibility(tree, radii, nodePressures, regimeParams, radiusLimits);
  let rawVolume = 0;
  for (let e = 0; e < tree.edge_count; e += 1) {
    rawVolume += Math.PI * radii[e] * radii[e] * tree.edge_lengths[e];
  }
  const nonFinite = hasNonFiniteResult(ep, nodePressures, feas, rawVolume);
  const materialVolume = nonFinite ? 0 : rawVolume;
  return { feasible: feas.feasible && !brokenClosure && !nonFinite, brokenClosure, nonFinite,
    power: ep.totalPower, pumping: ep.totalPumping, volume: ep.totalVolume,
    pulsatile: ep.totalPulsatile, wallFloor: ep.totalWallFloor, materialVolume,
    edgeComponents: ep.edgeComponents, nodePressures, minMargin: feas.minMargin,
    maxShortfall: feas.maxShortfall, meanShortfall: feas.meanShortfall };
}

export function designSha256(radii) {
  return sha256(binary64Bytes(Array.isArray(radii) ? radii : Array.from(radii)));
}

function hasDistinctRadii(radii) {
  for (let e = 1; e < radii.length; e += 1) {
    if (radii[e] !== radii[0]) return true;
  }
  return false;
}

export function fittedExponent(edgeFlows, radii) {
  const n = radii.length;
  if (n < 2 || edgeFlows.length !== n || !hasDistinctRadii(radii)) return 0;
  let sumX = 0, sumY = 0;
  for (let e = 0; e < n; e += 1) {
    sumX += Math.log(edgeFlows[e]);
    sumY += Math.log(radii[e]);
  }
  const meanX = sumX / n, meanY = sumY / n;
  let num = 0, den = 0;
  for (let e = 0; e < n; e += 1) {
    const dx = Math.log(edgeFlows[e]) - meanX;
    num += dx * (Math.log(radii[e]) - meanY);
    den += dx * dx;
  }
  const slope = num / den;
  return Number.isFinite(slope) && den !== 0 ? slope : 0;
}

export function analyticAlphaStar(mu0, lambda_V) {
  return (16 * mu0 / (Math.PI ** 2 * lambda_V)) ** (1 / 6);
}

export function analyticPowerStar(tree, alphaStar) {
  let sumQtwoThirdsL = 0;
  for (let e = 0; e < tree.edge_count; e += 1) {
    sumQtwoThirdsL += tree.edge_flows[e] ** (2 / 3) * tree.edge_lengths[e];
  }
  return sumQtwoThirdsL * (8 * tree.mu0 / (Math.PI * alphaStar ** 4) + tree.lambda_V * Math.PI * alphaStar ** 2);
}
