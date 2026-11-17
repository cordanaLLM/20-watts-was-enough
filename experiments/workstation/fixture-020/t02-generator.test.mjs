import assert from "node:assert/strict";
import test from "node:test";
import { exactKeys } from "../lib/exact-keys.mjs";
import { IcpRandom } from "./random.mjs";
import { T02_L_MAX, T02_R_MAX, T02_REGIME_LABELS, T02_SEEDS, t02WorldId } from "./t02-contract.mjs";
import { acceptT02Attempt, calibrationCell, calibrationRegimeParams,
  generateT02World, interruptedT02World } from "./t02-generator.mjs";
import { computeObjective } from "./t02-objective.mjs";

const MANIFEST_KEYS = [
  "schema", "seed", "world_id", "family", "regime", "registrations",
  "generator_version", "streams", "attempts", "tree_sha256",
  "uniform_upper_round", "terminal_failure",
];

test("deterministic generation: same seed produces identical world", () => {
  const a = generateT02World({ seed: T02_SEEDS[0] });
  const b = generateT02World({ seed: T02_SEEDS[0] });
  assert.equal(a.world_sha256, b.world_sha256);
  assert.equal(a.world_id, b.world_id);
  assert.equal(a.regime, b.regime);
});

test("tree depth is in [4,7] and terminal count equals 2^depth", () => {
  const world = generateT02World({ seed: T02_SEEDS[0] });
  assert.ok(world.tree.depth >= 4 && world.tree.depth <= 7);
  assert.equal(world.tree.terminal_count, 1 << world.tree.depth);
  assert.equal(world.tree.first_terminal, (1 << world.tree.depth) - 1);
  assert.equal(world.tree.node_count, (1 << (world.tree.depth + 1)) - 1);
  assert.equal(world.tree.edge_count, world.tree.node_count - 1);
});

test("terminal flows sum to total_flow within 1e-12 relative", () => {
  const world = generateT02World({ seed: T02_SEEDS[0] });
  const sum = world.tree.terminal_flows.reduce((s, v) => s + v, 0);
  assert.ok(Math.abs(sum / world.tree.total_flow - 1) < 1e-12);
});

test("edge flow closure: each internal node's flow equals sum of children", () => {
  const world = generateT02World({ seed: T02_SEEDS[0] });
  const tree = world.tree;
  for (let n = 1; n < tree.first_terminal; n += 1) {
    const left = tree.edge_flows[2 * n];
    const right = tree.edge_flows[2 * n + 1];
    assert.equal(tree.edge_flows[n - 1], left + right);
  }
});

test("accepted worlds pass all-upper-bound pressure feasibility and 3600*P(r_max) < L_max", () => {
  const regimesSeen = new Set();
  for (let i = 0; i < 16; i += 1) {
    const world = generateT02World({ seed: T02_SEEDS[i] });
    assert.equal(exactKeys(world.manifest, MANIFEST_KEYS), true);
    assert.ok(world.tree !== null);
    regimesSeen.add(world.regime);
    const upperRadii = new Array(world.tree.edge_count).fill(T02_R_MAX);
    const obj = computeObjective(world.tree, upperRadii, world.regime_params);
    assert.equal(obj.feasible, true);
    assert.ok(3600 * obj.power < T02_L_MAX);
    assert.equal(acceptT02Attempt(world.tree, world.regime_params), true);
  }
  assert.equal(regimesSeen.size, 4);
});

test("acceptT02Attempt enforces strict pressure and strict 3600*P(r_max) < L_max boundaries", () => {
  const cell = calibrationCell();
  const rp = calibrationRegimeParams();
  assert.equal(acceptT02Attempt(cell, rp), true);

  const upperObj = computeObjective(cell, [T02_R_MAX, T02_R_MAX, T02_R_MAX], rp);
  const terminalP = upperObj.nodePressures[2];
  assert.equal(acceptT02Attempt(cell, { required_terminal_pressure: terminalP }), false);
  assert.equal(acceptT02Attempt(cell, { required_terminal_pressure: terminalP - 1e-6 }), true);

  const volUnit = 3 * Math.PI * T02_R_MAX * T02_R_MAX * 0.02;
  const criticalLambdaV = (T02_L_MAX / 3600 - upperObj.pumping) / volUnit;
  assert.equal(acceptT02Attempt({ ...cell, lambda_V: criticalLambdaV * 1.001 }, rp), false);
  assert.equal(acceptT02Attempt({ ...cell, lambda_V: criticalLambdaV * 0.999 }, rp), true);
});

test("regime label is drawn once before attempts and stays fixed across rejections", () => {
  for (let i = 0; i < 8; i += 1) {
    const seed = T02_SEEDS[i];
    const id = t02WorldId(seed);
    const expected = T02_REGIME_LABELS[new IcpRandom(`ICP-v2|T02|regime|${id}`, { uniform_upper_round: 0 }).integer(0, 3)];
    const accepted = generateT02World({ seed });
    assert.equal(accepted.regime, expected);
    const exhausted = generateT02World({ seed, rejectionLimit: 0 });
    assert.equal(exhausted.manifest.regime, expected);
    assert.equal(exhausted.regime, null);
  }
});

test("rejectionLimit bounds and generator-failure / interrupted world manifests are closed", () => {
  for (const bad of [-1, 10001, 1.5, NaN]) {
    assert.throws(() => generateT02World({ seed: T02_SEEDS[0], rejectionLimit: bad }),
      /rejection limit must be in \[0,10000\]/);
  }
  const world = generateT02World({ seed: T02_SEEDS[0], rejectionLimit: 0 });
  assert.equal(world.tree, null);
  assert.equal(world.regime, null);
  assert.equal(exactKeys(world.manifest, MANIFEST_KEYS), true);
  assert.equal(world.manifest.attempts, 0);
  assert.equal(world.manifest.tree_sha256, null);
  assert.deepEqual(world.manifest.terminal_failure, { reason: "generator-failure", stage: "rejection-limit" });

  const stopped = interruptedT02World(T02_SEEDS[0], "timeout");
  assert.equal(stopped.tree, null);
  assert.equal(stopped.regime, null);
  assert.equal(exactKeys(stopped.manifest, MANIFEST_KEYS), true);
  assert.equal(stopped.manifest.regime, null);
  assert.equal(stopped.manifest.attempts, 0);
  assert.equal(stopped.manifest.tree_sha256, null);
  assert.deepEqual(stopped.manifest.terminal_failure, { reason: "generator-failure", stage: "timeout" });
  assert.equal(stopped.world_id, t02WorldId(T02_SEEDS[0]));
});

test("unregistered seed is refused", () => {
  assert.throws(() => generateT02World({ seed: 0xDEADBEEF }), /registered public seed/);
  assert.throws(() => interruptedT02World(0xDEADBEEF, "timeout"), /registered public seed/);
});

test("calibration cell and regime params match frozen classic 3-edge specification", () => {
  const cell = calibrationCell();
  assert.equal(cell.edge_count, 3);
  assert.deepEqual(cell.edge_flows, [2e-6, 1e-6, 1e-6]);
  assert.deepEqual(cell.edge_lengths, [0.02, 0.02, 0.02]);
  assert.deepEqual(cell.parents, [null, 0, 1, 1]);
  assert.equal(cell.mu0, 0.0035);
  assert.equal(cell.lambda_V, 1e3);
  assert.equal(cell.P_root, 25000);
  const params = calibrationRegimeParams();
  assert.equal(params.required_terminal_pressure, 0);
  assert.equal(params.a, undefined);
  assert.equal(params.lambda_I, undefined);
  assert.equal(params.lambda_A, undefined);
});
