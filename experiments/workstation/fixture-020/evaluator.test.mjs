import assert from "node:assert/strict";
import test from "node:test";
import { evaluateArmA, oxygenStep, closureState, checkOxygenRow, percentileType7, validateFlows } from "./evaluator.mjs";
import { generateFixture020World } from "./generator.mjs";
import { armInput, assertArmInput, fixedTreePolicy } from "./policy.mjs";
import { pumpPower } from "./accounting.mjs";
import { observationState, observeMinute, arrivedPanels } from "./observations.mjs";
import { ExecutionStop } from "./contract.mjs";
import { LabelSeededPcg64Dxsm } from "../lib/pcg64-dxsm.mjs";

function cell() {
  return { world_id: "ICP-T01-0x54010000", graph: {
    source_flow: 1.2, concentration: 1,
    nodes: [{ id: 0 }, { id: 1, m0: 1, q0: 1, storage_cap: 10, storage_initial: 5 }],
    edges: [{ id: "000:001", from: 0, to: 1, primary: true, tree_flow: 1.2,
      capacity: 2, radius: 0.001, length: 1 }],
  }, forcing: { demand: new Float64Array(1440).fill(1) }, manifest: {
    maximum_loss_mmol: 1440, uniform_upper_round: 0, terminal_failure: null,
    streams: { observation: "ICP-v2|T01|observation|ICP-T01-0x54010000" },
  } };
}

test("analytic cell obeys leak/consume/store/export/deficit order and closes", () => {
  const row = oxygenStep(5, 3, 2, 5);
  assert.equal(row.leaked, 0.0025);
  assert.equal(row.consumed, 2);
  assert.equal(row.storage_after, 5);
  assert.ok(Math.abs(row.exported - 0.9975) < 1e-14);
  assert.equal(row.deficit, 0);
  assert.equal(checkOxygenRow(row), null);
  assert.equal(oxygenStep(0, 0.1, 1, 5).deficit, 0.9);
  assert.equal(checkOxygenRow({ ...row, exported: row.exported + 0.001 }), "broken-closure");
});

test("A closes exact tree/source identity, uses no chords, and records secondary units", () => {
  const world = generateFixture020World({ seed: 0x54010000 });
  const result = evaluateArmA(world);
  assert.equal(result.failure_reason, null);
  assert.equal(result.truth_steps, 5760);
  assert.ok(result.maximum_relative_closure < 1e-8);
  assert.ok(result.loss_mmol >= 0 && result.loss_mmol <= result.maximum_loss_mmol);
  assert.ok(result.simulated_work_j <= result.resource_cap_j);
  assert.equal(result.edge_flow_total_variation_l_min, 0);
  assert.equal(result.aggregates.length, 288);
  assert.equal(result.observations.filter((row) => row.kind === "local").length, 288);
  assert.equal(result.observations.at(-1).measurement_minute, 1440);
  const flows = world.graph.edges.map((edge) => edge.tree_flow);
  assert.ok(world.graph.edges.every((edge, i) => edge.primary || flows[i] === 0));
  const checked = validateFlows(world.graph, flows);
  assert.equal(checked.failure, null);
  assert.ok(Math.abs(-checked.recipients[0] - world.graph.source_flow) < 1e-10);
  assert.equal(validateFlows({ ...world.graph, source_flow: world.graph.source_flow + 1e-8 }, flows).failure, "infeasible-flow");
});

test("frozen forcing preserves reference maximum loss and arm A accounting", (t) => {
  const world = generateFixture020World({ seed: 0x54010000 });
  const result = evaluateArmA(world);
  const expected = { maximum_loss_mmol: 11084.515497362665, loss_mmol: 513.4054078188917,
    delivered_mmol: 12295.093363789085, consumed_mmol: 10571.110089543761,
    exported_mmol: 1564.88377344659, leaked_mmol: 142.33637482933906,
    simulated_work_j: 1915.8707532099559, edge_flow_exposure_l: 8677.04976416392 };
  t.diagnostic(JSON.stringify({ reference: expected,
    actual: Object.fromEntries(Object.keys(expected).map((key) => [key, result[key]])) }));
  for (const key of ["maximum_loss_mmol", "loss_mmol"]) {
    const value = expected[key];
    assert.ok(Math.abs(result[key] / value - 1) <= 1e-12, `${key}: ${result[key]} versus ${value}`);
  }
  assert.equal(result.minimum_storage_mmol, 0);
  assert.equal(result.failure_reason, null);
  const second = evaluateArmA(generateFixture020World({ seed: 0x54010001 }));
  t.diagnostic(JSON.stringify({ seed: "0x54010001", maximum_loss_mmol: second.maximum_loss_mmol,
    loss_mmol: second.loss_mmol }));
  assert.ok(Math.abs(second.maximum_loss_mmol / 10855.006851991686 - 1) <= 1e-12);
  assert.ok(Math.abs(second.loss_mmol / 459.9679501308705 - 1) <= 1e-12);
  assert.equal(second.failure_reason, null);
});

function threeCells() {
  const world = cell();
  world.graph.nodes.push(...[2, 3].map((id) => ({ ...world.graph.nodes[1], id })));
  world.graph.edges.push(...[2, 3].map((to) => ({ ...world.graph.edges[0],
    id: `000:00${to}`, to })));
  world.graph.source_flow = 3.6;
  world.forcing.demand = new Float64Array(1440 * 3).fill(1);
  return world;
}

function closureTrace(failingSteps, failedNodes = 1) {
  const before = [];
  let calls = 0;
  const rowStep = (...args) => {
    const step = Math.floor(calls / 3);
    const node = calls % 3;
    if (step < 2) before.push(args[0]);
    calls += 1;
    const row = oxygenStep(...args);
    return step < failingSteps && node < failedNodes ? { ...row, exported: 1 } : row;
  };
  return { before, rowStep, calls: () => calls };
}

test("broken closure on first node preserves later storage updates and one failure per step", () => {
  const trace = closureTrace(1);
  const result = evaluateArmA(threeCells(), trace);
  const updated = oxygenStep(5, 0.3, 0.25, 10).storage_after;
  assert.deepEqual(trace.before, [5, 5, 5, 5, updated, updated]);
  assert.equal(result.failure_reason, "broken-closure");
  assert.equal(result.terminated, false);
  assert.equal(result.truth_steps, 5760);
  assert.equal(trace.calls(), 5760 * 3);
  assert.equal(result.closure_failures_consecutive, 0);
  assert.equal(result.loss_mmol, 1440);
  const everyStep = closureTrace(3, 2);
  const stopped = evaluateArmA(threeCells(), everyStep);
  assert.equal(everyStep.calls(), 9);
  assert.equal(everyStep.before[5], updated);
  assert.equal(stopped.truth_steps, 3);
  assert.equal(stopped.closure_failures_consecutive, 3);
  assert.equal(stopped.failure_reason, "broken-closure");
  assert.equal(stopped.terminated, true);
});

test("first failing node stays recorded when a later terminating row stops the step", () => {
  let calls = 0;
  const result = evaluateArmA(threeCells(), { rowStep: (...args) => {
    calls += 1;
    const row = oxygenStep(...args);
    return calls === 1 ? { ...row, exported: 1 } : { ...row, storage_after: -1 };
  } });
  assert.equal(calls, 2);
  assert.equal(result.failure_reason, "broken-closure");
  assert.equal(result.truth_steps, 1);
  assert.equal(result.terminated, true);
  assert.equal(result.loss_mmol, 1440);
});

test("every terminal-loss path gets L_max with retained failure typing", () => {
  const world = cell();
  const missing = evaluateArmA(world, { policy: () => null });
  assert.equal(missing.failure_reason, "missing-output");
  const infeasible = evaluateArmA(world, { policy: () => [3] });
  assert.equal(infeasible.failure_reason, "infeasible-flow");
  const negative = evaluateArmA(world, { rowStep: (...args) => ({ ...oxygenStep(...args), leaked: -1 }) });
  assert.equal(negative.failure_reason, "negative-amount");
  const leak = evaluateArmA(world, { policy: (input) => fixedTreePolicy({ ...input, demand: [] }) });
  assert.equal(leak.failure_reason, "oracle-key-leak");
  const closure = evaluateArmA(world, { rowStep: (...args) => ({ ...oxygenStep(...args), exported: 1 }) });
  assert.equal(closure.failure_reason, "broken-closure");
  for (const result of [missing, infeasible, negative, leak, closure]) {
    assert.equal(result.loss_mmol, world.manifest.maximum_loss_mmol);
    assert.equal(result.terminated, true);
  }
  assert.equal(closure.truth_steps, 3);
  assert.equal(closure.closure_failures_consecutive, 3);
});

test("isolated closure failure stays terminal-loss charged, resets streak, negative storage stops immediately", () => {
  let calls = 0;
  const result = evaluateArmA(cell(), { rowStep: (...args) => {
    calls += 1;
    const row = oxygenStep(...args);
    return calls <= 2 ? { ...row, exported: 1 } : row;
  } });
  assert.equal(result.failure_reason, "broken-closure");
  assert.equal(result.loss_mmol, 1440);
  assert.equal(result.terminated, false);
  assert.equal(result.closure_failures_consecutive, 0);
  assert.deepEqual(closureState(2, null), { consecutive: 0, terminate: false });
  const negative = evaluateArmA(cell(), { rowStep: (...args) => ({ ...oxygenStep(...args), storage_after: -1e-15 }) });
  assert.equal(negative.failure_reason, "negative-storage");
  assert.equal(negative.truth_steps, 1);
});

test("oracle allow-list rejects unknown fields at every nested arm boundary", () => {
  const world = cell();
  const state = observationState(world);
  observeMinute(state, world, 0, new Float64Array([0, 5]), new Float64Array(2));
  const input = armInput(world, 0, state.latest_source, []);
  assert.equal(assertArmInput(input), input);
  assert.throws(() => assertArmInput({ ...input, oracle: true }), /oracle-key-leak/);
  const graph = structuredClone(input.graph);
  graph.nodes[0].latent_demand = 1;
  assert.throws(() => assertArmInput({ ...input, graph }), /oracle-key-leak/);
  assert.throws(() => assertArmInput({ ...input, source: { ...input.source, future: 1 } }), /oracle-key-leak/);
  assert.throws(() => assertArmInput({ ...input, panels: [{ demand: 1 }] }), /oracle-key-leak/);
  assert.throws(() => assertArmInput({ ...input, source: { ...input.source, flow_raw: { demand: 1 } } }), /oracle-key-leak/);
  const returned = fixedTreePolicy(input, [0.8]);
  assert.deepEqual(returned, [1.2]);
  assert.deepEqual(fixedTreePolicy(input, [0]), [0.5]);
  assert.equal(validateFlows(world.graph, [1.2], [0]).failure, "infeasible-flow");
});

test("delayed observations retain raw signed noise, 5-minute amounts, and arrival time", () => {
  const world = cell();
  const state = observationState(world);
  state.random.gaussian = () => -100;
  const consumed = new Float64Array([0, 5]);
  observeMinute(state, world, 5, new Float64Array([0, 5]), consumed);
  assert.ok(Math.abs(state.raw[0].flow_raw + 2.4) < 1e-14);
  assert.equal(state.raw[1].consumption_raw[0], -10);
  assert.equal(state.raw[1].storage_raw[0], -10);
  assert.equal(consumed[1], 0);
  assert.equal(arrivedPanels(state, 4).length, 0);
  assert.equal(arrivedPanels(state, 9).length, 1);
});

test("Poiseuille units integrate in joules and p95 uses type 7 interpolation", () => {
  const power = pumpPower(cell().graph, [1.2]);
  const independent = 8 * 0.0035 * (1.2 / 60000) ** 2 / (Math.PI * 0.001 ** 4);
  assert.ok(Math.abs(power - independent) < 1e-12);
  assert.equal(percentileType7([0, 10, 20, 30], 0.95), 28.499999999999996);
  assert.equal(percentileType7([7], 0.95), 7);
  assert.equal(percentileType7([], 0.95), null);
});

test("a maximal deprivation episode spans consecutive truth steps without extra counts", () => {
  const world = cell();
  world.graph.source_flow = 0.5;
  world.graph.edges[0].tree_flow = 0.5;
  world.graph.nodes[1].storage_initial = 0;
  world.graph.nodes[1].storage_cap = 0;
  const result = evaluateArmA(world);
  assert.equal(result.failure_reason, null);
  assert.equal(result.deprived_node_episodes, 1);
  assert.deepEqual(result.deprived_episode_durations_min, [1440]);
  assert.equal(result.node_debt_p95_mmol, 720);
  assert.equal(result.loss_mmol, 720);
});

test("a cancelled in-flight arm retains partial accounting and receives L_max", () => {
  let checks = 0;
  const result = evaluateArmA(cell(), { check: () => {
    checks += 1;
    if (checks === 5) throw new ExecutionStop("cancelled");
  } });
  assert.equal(result.failure_reason, "missing-output");
  assert.equal(result.loss_mmol, 1440);
  assert.equal(result.truth_steps, 4);
  assert.equal(result.aggregates[0].steps, 4);
  assert.equal(result.terminated, true);
});

test("capacity and rate constraints reject independently of source conservation", () => {
  const world = cell();
  world.graph.edges[0].capacity = 1;
  const result = evaluateArmA(world);
  assert.equal(result.failure_reason, "infeasible-flow");
  assert.equal(result.loss_mmol, 1440);
  world.graph.edges[0].capacity = 2;
  assert.equal(validateFlows(world.graph, [1.2], [0]).failure, "infeasible-flow");
  assert.equal(validateFlows(world.graph, [1.2], [1.2]).failure, null);
});

test("three consecutive closure failures stop at the third; a valid step resets", () => {
  assert.deepEqual(closureState(1, "broken-closure"), { consecutive: 2, terminate: false });
  assert.deepEqual(closureState(2, "broken-closure"), { consecutive: 3, terminate: true });
  assert.deepEqual(closureState(2, null), { consecutive: 0, terminate: false });
  assert.equal(closureState(0, "negative-storage").terminate, true);
});

test("replaying the seed-delay draw counts its upper rounding event exactly once", () => {
  const original = LabelSeededPcg64Dxsm.prototype.nextUint64;
  try {
    LabelSeededPcg64Dxsm.prototype.nextUint64 = () => 2n ** 64n - 1n;
    const world = cell();
    world.manifest.uniform_upper_round = 1;
    const state = observationState(world);
    assert.equal(state.delay, 4);
    assert.equal(state.events.uniform_upper_round, 1);
  } finally { LabelSeededPcg64Dxsm.prototype.nextUint64 = original; }
});
