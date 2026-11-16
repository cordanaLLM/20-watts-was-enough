import assert from "node:assert/strict";
import test from "node:test";
import { T02_SEEDS, T02_REGIME_LABELS, t02WorldId } from "./t02-contract.mjs";
import { generateT02World, interruptedT02World, calibrationCell, calibrationRegimeParams } from "./t02-generator.mjs";

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

test("regime label is stable across rejection attempts", () => {
  const a = generateT02World({ seed: T02_SEEDS[1] });
  assert.ok(T02_REGIME_LABELS.includes(a.regime));
  const b = generateT02World({ seed: T02_SEEDS[1] });
  assert.equal(a.regime, b.regime);
});

test("rejectionLimit 0 produces generator-failure", () => {
  const world = generateT02World({ seed: T02_SEEDS[0], rejectionLimit: 0 });
  assert.equal(world.tree, null);
  assert.equal(world.manifest.terminal_failure.reason, "generator-failure");
});

test("unregistered seed is refused", () => {
  assert.throws(() => generateT02World({ seed: 0xDEADBEEF }), /registered public seed/);
});

test("interrupted world has terminal failure", () => {
  const world = interruptedT02World(T02_SEEDS[0], "timeout");
  assert.equal(world.tree, null);
  assert.equal(world.manifest.terminal_failure.reason, "timeout");
  assert.equal(world.world_id, t02WorldId(T02_SEEDS[0]));
});

test("calibration cell has 3 edges with correct flows and parents", () => {
  const cell = calibrationCell();
  assert.equal(cell.edge_count, 3);
  assert.deepEqual(cell.edge_flows, [2e-6, 1e-6, 1e-6]);
  assert.deepEqual(cell.edge_lengths, [0.02, 0.02, 0.02]);
  assert.deepEqual(cell.parents, [null, 0, 1, 1]);
  assert.equal(cell.mu0, 0.0035);
  assert.equal(cell.lambda_V, 1e3);
  assert.equal(cell.P_root, 25000);
});

test("calibration regime params are classic with zero required pressure", () => {
  const params = calibrationRegimeParams();
  assert.equal(params.required_terminal_pressure, 0);
  assert.equal(params.a, undefined);
  assert.equal(params.lambda_I, undefined);
  assert.equal(params.lambda_A, undefined);
});
