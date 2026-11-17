import assert from "node:assert/strict";
import test from "node:test";
import { sha256 } from "./contract.mjs";
import { T02_R_MAX, T02_R_MIN } from "./t02-contract.mjs";
import { calibrationCell } from "./t02-generator.mjs";
import { analyticAlphaStar, analyticPowerStar, checkFlowClosure, computeObjective,
  designSha256, effectiveViscosity, fittedExponent } from "./t02-objective.mjs";

test("classic viscosity returns mu0 unchanged and rheology adds Fåhræus–Lindqvist term", () => {
  assert.equal(effectiveViscosity(0.0035, 1e-3, {}), 0.0035);
  assert.equal(effectiveViscosity(0.0035, 1e-3), 0.0035);
  const params = { a: 2, r_c: 5e-4 };
  const mu = effectiveViscosity(0.0035, 1e-4, params);
  assert.ok(mu > 0.0035);
  assert.ok(Math.abs(mu - 0.0035 * (1 + 2 * Math.exp(-1e-4 / 5e-4))) < 1e-15);
});

test("single-edge pumping, volume, pulsatile, and wall-floor terms match exact formulas", () => {
  const mu0 = 0.0035, L = 0.02, Q = 1e-6, r = 1e-3;
  const baseTree = { edge_count: 1, edge_lengths: [L], edge_flows: [Q], mu0, lambda_V: 1e3,
    P_root: 100000, first_terminal: 1, terminal_count: 1, node_count: 2 };
  const classic = computeObjective(baseTree, [r], { required_terminal_pressure: 0 });
  assert.ok(Math.abs(classic.pumping / (8 * mu0 * L * Q * Q / (Math.PI * r ** 4)) - 1) < 1e-12);
  assert.ok(Math.abs(classic.volume / (1e3 * Math.PI * r * r * L) - 1) < 1e-12);
  assert.equal(classic.pulsatile, 0);
  assert.equal(classic.wallFloor, 0);

  const pulsatile = computeObjective(baseTree, [r],
    { lambda_I: 0.5, f: 2, rho: 1000, required_terminal_pressure: 0 });
  assert.ok(Math.abs(pulsatile.pulsatile / (0.5 * 2 * 1000 * L * Q * Q / (Math.PI * r * r)) - 1) < 1e-12);

  const wallFloor = computeObjective(baseTree, [r], { lambda_A: 100, required_terminal_pressure: 0 });
  assert.ok(Math.abs(wallFloor.wallFloor / (100 * 2 * Math.PI * r * L) - 1) < 1e-12);
});

test("pressure propagation on depth-1 tree computes exact terminal pressures", () => {
  const mu0 = 0.0035, L = 0.02, Q1 = 2e-6, Q2 = 1e-6, r1 = 1e-3, r2 = 1e-3;
  const tree = { edge_count: 2, edge_lengths: [L, L], edge_flows: [Q1, Q2], mu0,
    lambda_V: 0, P_root: 25000, first_terminal: 1, terminal_count: 2, node_count: 3 };
  const result = computeObjective(tree, [r1, r2], { required_terminal_pressure: 0 });
  const dP1 = 8 * mu0 * L * Q1 / (Math.PI * r1 ** 4);
  const dP2 = 8 * mu0 * L * Q2 / (Math.PI * r2 ** 4);
  assert.ok(Math.abs(result.nodePressures[1] - (25000 - dP1)) < 1e-6);
  assert.ok(Math.abs(result.nodePressures[2] - (25000 - dP2)) < 1e-6);
  assert.equal(result.feasible, true);
});

test("terminal pressure strict inequality and exact radius bounds", () => {
  const tree = { edge_count: 1, edge_lengths: [0.001], edge_flows: [1e-10], mu0: 0.001,
    lambda_V: 0, P_root: 100, first_terminal: 1, terminal_count: 1, node_count: 2 };
  const r = 1e-3;
  const dP = 8 * 0.001 * 0.001 * 1e-10 / (Math.PI * r ** 4);
  assert.equal(computeObjective(tree, [r], { required_terminal_pressure: 100 - dP }).feasible, false);
  assert.equal(computeObjective(tree, [T02_R_MIN], { required_terminal_pressure: 0 }).feasible, true);
  assert.equal(computeObjective(tree, [T02_R_MAX], { required_terminal_pressure: 0 }).feasible, true);
  assert.equal(computeObjective(tree, [T02_R_MIN * (1 - Number.EPSILON)],
    { required_terminal_pressure: 0 }).feasible, false);
  assert.equal(computeObjective(tree, [T02_R_MAX * (1 + Number.EPSILON)],
    { required_terminal_pressure: 0 }).feasible, false);
});

test("checkFlowClosure accepts exact conservation and rejects internal or terminal flow drift", () => {
  const cell = calibrationCell();
  assert.equal(checkFlowClosure(cell), true);
  const single = { edge_count: 1, node_count: 2, first_terminal: 1, terminal_count: 1,
    edge_flows: [1e-6], terminal_flows: [1e-6] };
  assert.equal(checkFlowClosure(single), true);
  assert.equal(checkFlowClosure({ ...cell, edge_flows: [2e-6 + 1e-18, 1e-6, 1e-6] }), false);
  assert.equal(checkFlowClosure({ ...cell, terminal_flows: [1e-6 + 1e-18, 1e-6] }), false);
  assert.equal(checkFlowClosure({ ...cell, edge_flows: [0, 0, 0] }), false);
  assert.equal(checkFlowClosure(null), false);

  const broken = computeObjective({ ...cell, edge_flows: [2.1e-6, 1e-6, 1e-6] }, [1e-3, 1e-3, 1e-3]);
  assert.equal(broken.brokenClosure, true);
  assert.equal(broken.feasible, false);
});

test("NaN in length, pressure, or radius produces non-finite objective", () => {
  const base = { edge_count: 1, edge_lengths: [0.02], edge_flows: [1e-6], mu0: 0.0035,
    lambda_V: 0, P_root: 100000, first_terminal: 1, terminal_count: 1, node_count: 2 };
  for (const [tree, radii, rp] of [
    [{ ...base, edge_lengths: [NaN] }, [1e-3], {}],
    [{ ...base, P_root: NaN }, [1e-3], {}],
    [base, [NaN], {}],
    [base, [1e-3], { required_terminal_pressure: NaN }],
  ]) {
    const result = computeObjective(tree, radii, rp);
    assert.equal(result.nonFinite, true);
    assert.equal(result.feasible, false);
  }
});

test("fittedExponent, designSha256, analyticAlphaStar, and analyticPowerStar cover boundaries", () => {
  const flows = [1e-6, 2e-6, 4e-6, 8e-6];
  const radii = flows.map((q) => 0.1 * Math.cbrt(q));
  assert.ok(Math.abs(fittedExponent(flows, radii) - 1 / 3) < 1e-12);
  assert.equal(fittedExponent([1e-6], [1e-3]), 0);
  assert.equal(fittedExponent(flows, [1e-3, 1e-3, 1e-3, 1e-3]), 0);
  assert.equal(fittedExponent(flows, [1e-3, 2e-3]), 0);

  assert.equal(designSha256([]), sha256(Buffer.alloc(0)));
  assert.equal(designSha256([1e-3, 2e-3]), designSha256(Float64Array.from([1e-3, 2e-3])));

  const cell = calibrationCell();
  const alphaStar = analyticAlphaStar(cell.mu0, cell.lambda_V);
  assert.ok(Math.abs(alphaStar - (16 * cell.mu0 / (Math.PI ** 2 * cell.lambda_V)) ** (1 / 6)) < 1e-15);
  const powerStar = analyticPowerStar(cell, alphaStar);
  const exactObj = computeObjective(cell, cell.edge_flows.map((q) => alphaStar * Math.cbrt(q)));
  assert.ok(Math.abs(exactObj.power / powerStar - 1) < 1e-14);
});
