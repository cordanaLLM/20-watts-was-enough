import { binary64Bytes, sha256 } from "./contract.mjs";
import { T02_R_MIN, T02_R_MAX } from "./t02-contract.mjs";

export function effectiveViscosity(mu0, r, regimeParams) {
  if (regimeParams.a !== undefined) return mu0 * (1 + regimeParams.a * Math.exp(-r / regimeParams.r_c));
  return mu0;
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
    let pulsatile = 0;
    let wallFloor = 0;
    if (regimeParams.lambda_I !== undefined) {
      pulsatile = regimeParams.lambda_I * regimeParams.f * regimeParams.rho * L * Q * Q / (Math.PI * r * r);
    }
    if (regimeParams.lambda_A !== undefined) {
      wallFloor = regimeParams.lambda_A * 2 * Math.PI * r * L;
    }
    edgeComponents[e] = { radius_m: r, mu_e_pa_s: mu_e, pressure_drop_pa: 0,
      pumping_w: pumping, volume_w: volume, pulsatile_w: pulsatile, wall_floor_w: wallFloor };
    totalPumping += pumping; totalVolume += volume;
    totalPulsatile += pulsatile; totalWallFloor += wallFloor;
  }
  return { edgeComponents, totalPumping, totalVolume, totalPulsatile, totalWallFloor,
    totalPower: totalPumping + totalVolume + totalPulsatile + totalWallFloor };
}

function propagatePressure(tree, radii, regimeParams, edgeComponents) {
  const nodePressures = new Float64Array(tree.node_count);
  nodePressures[0] = tree.P_root;
  for (let n = 1; n < tree.node_count; n += 1) {
    const eIdx = n - 1;
    const parent = tree.parents ? tree.parents[n] : Math.floor((n - 1) / 2);
    const mu_e = effectiveViscosity(tree.mu0, radii[eIdx], regimeParams);
    const dP = 8 * mu_e * tree.edge_lengths[eIdx] * tree.edge_flows[eIdx] / (Math.PI * radii[eIdx] ** 4);
    edgeComponents[eIdx].pressure_drop_pa = dP;
    nodePressures[n] = nodePressures[parent] - dP;
  }
  return nodePressures;
}

function checkFeasibility(tree, radii, nodePressures, regimeParams) {
  const required = regimeParams.required_terminal_pressure ?? 0;
  let minMargin = Infinity, maxShortfall = 0, sumShortfall = 0, feasible = true;
  for (let t = 0; t < tree.terminal_count; t += 1) {
    const p = nodePressures[tree.first_terminal + t];
    const margin = p - required;
    if (margin < minMargin) minMargin = margin;
    if (p <= required) feasible = false;
    const shortfall = required > p ? required - p : 0;
    maxShortfall = Math.max(maxShortfall, shortfall);
    sumShortfall += shortfall;
  }
  for (let e = 0; e < tree.edge_count; e += 1) {
    if (radii[e] < T02_R_MIN || radii[e] > T02_R_MAX) feasible = false;
  }
  const meanShortfall = tree.terminal_count > 0 ? sumShortfall / tree.terminal_count : 0;
  return { feasible, minMargin, maxShortfall, meanShortfall };
}

export function computeObjective(tree, radii, regimeParams) {
  const ep = computeEdgePower(tree, radii, regimeParams);
  const nodePressures = propagatePressure(tree, radii, regimeParams, ep.edgeComponents);
  const feas = checkFeasibility(tree, radii, nodePressures, regimeParams);
  let nonFinite = !Number.isFinite(ep.totalPower);
  for (let e = 0; e < tree.edge_count && !nonFinite; e += 1) {
    const c = ep.edgeComponents[e];
    if (!Number.isFinite(c.pumping_w) || !Number.isFinite(c.volume_w)
      || !Number.isFinite(c.pulsatile_w) || !Number.isFinite(c.wall_floor_w)) nonFinite = true;
  }
  const materialVolume = nonFinite ? 0
    : radii.reduce((s, r, e) => s + Math.PI * r * r * tree.edge_lengths[e], 0);
  return { feasible: feas.feasible && !nonFinite, nonFinite, power: ep.totalPower,
    pumping: ep.totalPumping, volume: ep.totalVolume, pulsatile: ep.totalPulsatile,
    wallFloor: ep.totalWallFloor, materialVolume, edgeComponents: ep.edgeComponents,
    nodePressures, minMargin: feas.minMargin, maxShortfall: feas.maxShortfall,
    meanShortfall: feas.meanShortfall };
}

export function designSha256(radii) {
  return sha256(binary64Bytes(Array.isArray(radii) ? radii : Array.from(radii)));
}

export function fittedExponent(edgeFlows, radii) {
  const n = radii.length;
  if (n < 2) return 0;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let e = 0; e < n; e += 1) {
    const x = Math.log(edgeFlows[e]);
    const y = Math.log(radii[e]);
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
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
