import assert from "node:assert/strict";
import test from "node:test";
import { T02_R_MIN, T02_R_MAX } from "./t02-contract.mjs";
import { effectiveViscosity, computeObjective, fittedExponent,
  analyticAlphaStar } from "./t02-objective.mjs";

test("classic viscosity returns mu0 unchanged", () => {
  assert.equal(effectiveViscosity(0.0035, 1e-3, {}), 0.0035);
});

test("rheology viscosity increases with Fåhræus–Lindqvist term", () => {
  const params = { a: 2, r_c: 5e-4 };
  const mu = effectiveViscosity(0.0035, 1e-4, params);
  assert.ok(mu > 0.0035);
  assert.ok(Math.abs(mu - 0.0035 * (1 + 2 * Math.exp(-1e-4 / 5e-4))) < 1e-15);
});

test("single-edge pumping matches Poiseuille formula", () => {
  const mu0 = 0.0035;
  const L = 0.02;
  const Q = 1e-6;
  const r = 1e-3;
  const tree = { edge_count: 1, edge_lengths: [L], edge_flows: [Q], mu0, lambda_V: 0,
    P_root: 100000, first_terminal: 1, terminal_count: 1, node_count: 2 };
  const result = computeObjective(tree, [r], { required_terminal_pressure: 0 });
  const expected = 8 * mu0 * L * Q * Q / (Math.PI * r ** 4);
  assert.ok(Math.abs(result.pumping / expected - 1) < 1e-12);
  assert.equal(result.volume, 0);
  assert.equal(result.pulsatile, 0);
  assert.equal(result.wallFloor, 0);
});

test("volume term matches lambda_V * pi * r^2 * L", () => {
  const tree = { edge_count: 1, edge_lengths: [0.02], edge_flows: [1e-6], mu0: 0,
    lambda_V: 1e3, P_root: 100000, first_terminal: 1, terminal_count: 1, node_count: 2 };
  const r = 1e-3;
  const result = computeObjective(tree, [r], { required_terminal_pressure: 0 });
  const expected = 1e3 * Math.PI * r * r * 0.02;
  assert.ok(Math.abs(result.volume / expected - 1) < 1e-12);
});

test("pulsatile term present only with lambda_I", () => {
  const tree = { edge_count: 1, edge_lengths: [0.02], edge_flows: [1e-6], mu0: 0.0035,
    lambda_V: 0, P_root: 100000, first_terminal: 1, terminal_count: 1, node_count: 2 };
  const r = 1e-3;
  const params = { lambda_I: 0.5, f: 1, rho: 1000, required_terminal_pressure: 0 };
  const result = computeObjective(tree, [r], params);
  const Q = 1e-6;
  const expected = 0.5 * 1 * 1000 * 0.02 * Q * Q / (Math.PI * r * r);
  assert.ok(Math.abs(result.pulsatile / expected - 1) < 1e-12);
});

test("wall-floor term present only with lambda_A", () => {
  const tree = { edge_count: 1, edge_lengths: [0.02], edge_flows: [1e-6], mu0: 0.0035,
    lambda_V: 0, P_root: 100000, first_terminal: 1, terminal_count: 1, node_count: 2 };
  const r = 1e-3;
  const params = { lambda_A: 100, required_terminal_pressure: 0 };
  const result = computeObjective(tree, [r], params);
  const expected = 100 * 2 * Math.PI * r * 0.02;
  assert.ok(Math.abs(result.wallFloor / expected - 1) < 1e-12);
});

test("pressure propagation on depth-1 tree: terminals have correct pressure", () => {
  const mu0 = 0.0035;
  const L = 0.02;
  const Q1 = 2e-6;
  const Q2 = 1e-6;
  const r1 = 1e-3;
  const r2 = 1e-3;
  const tree = { edge_count: 2, edge_lengths: [L, L], edge_flows: [Q1, Q2], mu0,
    lambda_V: 0, P_root: 25000, first_terminal: 1, terminal_count: 2, node_count: 3 };
  const result = computeObjective(tree, [r1, r2], { required_terminal_pressure: 0 });
  const dP1 = 8 * mu0 * L * Q1 / (Math.PI * r1 ** 4);
  const dP2 = 8 * mu0 * L * Q2 / (Math.PI * r2 ** 4);
  assert.ok(Math.abs(result.nodePressures[1] - (25000 - dP1)) < 1e-6);
  assert.ok(Math.abs(result.nodePressures[2] - (25000 - dP2)) < 1e-6);
  assert.ok(result.feasible);
});

test("terminal at exactly P_min is infeasible (strict inequality)", () => {
  const tree = { edge_count: 1, edge_lengths: [0.001], edge_flows: [1e-10], mu0: 0.001,
    lambda_V: 0, P_root: 100, first_terminal: 1, terminal_count: 1, node_count: 2 };
  const r = 1e-3;
  const dP = 8 * 0.001 * 0.001 * 1e-10 / (Math.PI * r ** 4);
  const result = computeObjective(tree, [r], { required_terminal_pressure: 100 - dP });
  assert.equal(result.feasible, false);
});

test("radius 1 ulp outside bounds is infeasible", () => {
  const tree = { edge_count: 1, edge_lengths: [0.02], edge_flows: [1e-6], mu0: 0.0035,
    lambda_V: 0, P_root: 100000, first_terminal: 1, terminal_count: 1, node_count: 2 };
  const justBelow = T02_R_MIN * (1 - Number.EPSILON);
  const justAbove = T02_R_MAX * (1 + Number.EPSILON);
  assert.equal(computeObjective(tree, [justBelow], { required_terminal_pressure: 0 }).feasible, false);
  assert.equal(computeObjective(tree, [justAbove], { required_terminal_pressure: 0 }).feasible, false);
});

test("NaN coefficient produces non-finite objective", () => {
  const tree = { edge_count: 1, edge_lengths: [NaN], edge_flows: [1e-6], mu0: 0.0035,
    lambda_V: 0, P_root: 100000, first_terminal: 1, terminal_count: 1, node_count: 2 };
  const result = computeObjective(tree, [1e-3], { required_terminal_pressure: 0 });
  assert.equal(result.nonFinite, true);
  assert.equal(result.feasible, false);
});

test("fitted exponent with cubic-law radii returns 1/3", () => {
  const flows = [1e-6, 2e-6, 4e-6, 8e-6];
  const alpha = 0.1;
  const radii = flows.map((q) => alpha * Math.cbrt(q));
  const exponent = fittedExponent(flows, radii);
  assert.ok(Math.abs(exponent - 1 / 3) < 1e-12);
});

test("analytic alpha star matches closed-form formula", () => {
  const mu0 = 0.0035;
  const lambda_V = 1e3;
  const alpha = analyticAlphaStar(mu0, lambda_V);
  assert.ok(Math.abs(alpha - (16 * mu0 / (Math.PI ** 2 * lambda_V)) ** (1 / 6)) < 1e-15);
});
