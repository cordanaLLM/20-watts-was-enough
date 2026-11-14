import assert from "node:assert/strict";
import test from "node:test";
import { generateFixture020World } from "./generator.mjs";
import { IcpRandom, uniformFromUint64 } from "./random.mjs";
import { aggregateScheduleAccepted, applySchedule, generateArPath, generateForcing, nonOverlapping } from "./forcing.mjs";
import { baselineFeasible, dinicMaxFlow } from "./max-flow.mjs";
import { generateGraph, GenerationFailure } from "./graph.mjs";
import { sha256, binary64Bytes } from "./contract.mjs";
import { evaluateArmA } from "./evaluator.mjs";

const FIRST_HOTSPOTS = [
  [1169, 14, 56, 2.546381078489672], [1019, 26, 69, 1.9641329396134144],
  [570, 53, 48, 2.6888456386727904], [685, 76, 83, 1.5131895687199812],
  [788, 46, 80, 2.926622919839558], [1238, 61, 96, 1.611516371293575],
  [928, 20, 77, 1.6920197289866374], [953, 60, 90, 2.2379348988963805],
  [628, 44, 47, 2.693155517144235], [457, 22, 91, 2.3131697676843364],
  [525, 10, 60, 1.5123501865298192], [249, 90, 111, 2.2980087093126995],
  [1315, 16, 29, 1.9667576684918395], [127, 22, 37, 1.5642424303164557],
  [1135, 30, 54, 2.7791129510326362], [857, 69, 85, 2.585748797509052],
  [1081, 47, 93, 2.920538126601855],
];

test("frozen hotspot vector keeps K fixed while placing ICP-T01-0x54010000", () => {
  const world = generateFixture020World({ seed: 0x54010000 });
  assert.equal(world.graph.nodes.length - 1, 112);
  assert.equal(world.forcing.hotspots.length, 17);
  assert.equal(world.forcing.attempts, 1);
  assert.equal(world.forcing.overload_minutes, 0);
  assert.deepEqual(world.forcing.hotspots.map(({ start, duration, centre, multiplier }) => (
    [start, duration, centre, multiplier]
  )), FIRST_HOTSPOTS);
  assert.deepEqual(world.forcing.hotspots.map(({ id }) => id), Array.from({ length: 17 }, (_, id) => id));
  assert.ok(Math.abs(world.forcing.maximum_loss / 11084.515497362665 - 1) <= 1e-12);
});

test("second public seed agrees with its frozen hotspot vector", () => {
  const world = generateFixture020World({ seed: 0x54010001 });
  assert.equal(world.graph.nodes.length - 1, 98);
  assert.equal(world.forcing.hotspots.length, 12);
  assert.equal(world.forcing.attempts, 1);
  assert.equal(world.forcing.overload_minutes, 0);
  assert.deepEqual(world.forcing.hotspots.map(({ start, duration, centre, multiplier }) => (
    [start, duration, centre, multiplier]
  )), [
    [901, 20, 75, 2.9645969396043075], [841, 34, 54, 2.9292728494161757],
    [488, 56, 69, 2.9850645260882334], [945, 69, 96, 1.9807426936162673],
    [1304, 54, 4, 2.1700045379835715], [1063, 20, 64, 2.845976296431222],
    [352, 36, 32, 1.8506017270178134], [747, 13, 51, 2.4359629617899183],
    [1089, 16, 44, 2.378444078383307], [1179, 73, 92, 2.6353199293275313],
    [808, 21, 9, 2.1978929478737412], [444, 15, 79, 2.3313140970244333],
  ]);
});

test("F-020 uniforms use single rounding, including the upper endpoint event", () => {
  const events = { uniform_upper_round: 0 };
  const random = new IcpRandom("ICP-v2|T01|graph|ICP-T01-0x54010000", events);
  assert.deepEqual(Array.from({ length: 4 }, () => random.uniform()), [
    0.8005521365443289, 0.44583144047910556, 0.7775501982183093, 0.03132728261016388,
  ]);
  assert.equal(uniformFromUint64(0n, events), 2 ** -65);
  assert.equal(uniformFromUint64(2n ** 64n - 1n, events), 1 - 2 ** -53);
  assert.equal(events.uniform_upper_round, 1);
});

test("cosine-only Gaussian, clamping, inclusive integer and Dirichlet transforms", () => {
  const random = new IcpRandom("transforms", { uniform_upper_round: 0 });
  const uniforms = [0.25, 0.75];
  random.uniform = () => uniforms.shift();
  assert.equal(random.gaussian(), Math.sqrt(-2 * Math.log(0.25)) * Math.cos(2 * Math.PI * 0.75));
  assert.equal(uniforms.length, 0);
  random.uniform = () => 1 - 2 ** -53;
  assert.equal(random.integer(8, 20), 20);
  random.uniform = () => 0.5;
  const shares = random.dirichlet(3);
  assert.ok(shares.every((value) => Math.abs(value - 1 / 3) < 1e-15));
  assert.ok(Math.abs(shares.reduce((sum, value) => sum + value, 0) - 1) < 1e-15);
  assert.equal(random.range(7, 10), 8.5);
  assert.equal(random.logRange(1, 4), 2);
});

test("world hash and forcing are deterministic; tree and complete graph are feasible", () => {
  const left = generateFixture020World({ seed: 0x54010000 });
  const right = generateFixture020World({ seed: 0x54010000 });
  assert.equal(left.manifest.terminal_failure, null);
  assert.equal(left.world_sha256, right.world_sha256);
  assert.equal(left.manifest.demand_sha256, sha256(binary64Bytes(right.forcing.demand)));
  assert.equal(left.world_id, "ICP-T01-0x54010000");
  const graph = left.graph;
  assert.equal(graph.nodes[0].x, 0.5);
  assert.ok(graph.nodes.length >= 49 && graph.nodes.length <= 129);
  for (let i = 0; i < graph.nodes.length; i += 1) {
    for (let j = i + 1; j < graph.nodes.length; j += 1) {
      assert.ok(Math.hypot(graph.nodes[i].x - graph.nodes[j].x, graph.nodes[i].y - graph.nodes[j].y) >= 0.01);
    }
  }
  assert.equal(graph.edges.filter((edge) => edge.primary).length, graph.nodes.length - 1);
  assert.equal(new Set(graph.edges.map((edge) => edge.id)).size, graph.edges.length);
  assert.equal(baselineFeasible(graph), true);
  assert.equal(baselineFeasible({ ...graph, edges: graph.edges.map((edge) => ({ ...edge, capacity: 0 })) }), false);
  assert.ok(left.forcing.overload_minutes <= 120);
  assert.equal(nonOverlapping(left.forcing.hotspots), true);
});

test("iterative Dinic handles residual rerouting and disconnected negative graph", () => {
  const arcs = [
    { from: 0, to: 1, capacity: 2 }, { from: 0, to: 2, capacity: 1 },
    { from: 1, to: 2, capacity: 1 }, { from: 1, to: 3, capacity: 1 },
    { from: 2, to: 3, capacity: 2 },
  ];
  assert.equal(dinicMaxFlow(4, arcs, 0, 3), 3);
  assert.equal(dinicMaxFlow(4, arcs.filter((arc) => arc.to !== 3), 0, 3), 0);
});

test("aggregate overload boundary accepts exactly 120 minutes and rejects 121", () => {
  const demand = new Float64Array(1440).fill(1);
  demand.fill(2, 0, 120);
  assert.equal(aggregateScheduleAccepted(demand, 1, 1), true);
  demand[120] = 2;
  assert.equal(aggregateScheduleAccepted(demand, 1, 1), false);
  assert.equal(nonOverlapping([{ id: 0, start: 60, duration: 10 }, { id: 1, start: 70, duration: 10 }]), true);
  assert.equal(nonOverlapping([{ id: 0, start: 60, duration: 10 }, { id: 1, start: 69, duration: 10 }]), false);
});

test("hotspots use primary-tree descendants only and half/quarter excess", () => {
  const graph = { nodes: [{ id: 0 }, { id: 1, parent: 0 }, { id: 2, parent: 1 },
    { id: 3, parent: 2 }, { id: 4, parent: 3 }] };
  const demand = applySchedule(graph, new Float64Array(1440 * 4).fill(1), [
    { start: 60, duration: 10, centre: 1, multiplier: 3 },
  ]);
  assert.deepEqual([...demand.slice(60 * 4, 61 * 4)], [3, 2, 1.5, 1]);
  assert.equal(demand[70 * 4], 1);
});

test("rejection exhaustion keeps a typed terminal-failure world; invalid seed rejected", () => {
  const world = generateFixture020World({ seed: 0x54010000, rejectionLimit: 0 });
  assert.equal(world.manifest.terminal_failure.reason, "generator-failure");
  assert.ok(Number.isFinite(world.manifest.maximum_loss_mmol));
  assert.throws(() => generateFixture020World({ seed: 0x54010040 }), /registered public seed/);
  const random = { integer: () => 48, uniform: () => 0.5 };
  assert.throws(() => generateGraph(random, 2), /pair-separation/);
  const infeasible = new IcpRandom("infeasible-graph", { uniform_upper_round: 0 });
  const range = infeasible.range.bind(infeasible);
  infeasible.range = (a, b) => a === 1.10 ? 0 : range(a, b);
  assert.throws(() => generateGraph(infeasible, 1), /graph-max-flow/);
});

test("AR minute zero is initial state; extreme Gaussian innovations clamp instead of redraw", () => {
  const graph = { nodes: [{ id: 0 }, { id: 1, m0: 1 }] };
  let draws = 0;
  const path = generateArPath(graph, { gaussian: () => { draws += 1; return 100; } });
  assert.equal(path[0], 1);
  assert.equal(path[1], Math.exp(0.3));
  assert.equal(path[2], Math.exp(0.94 * 0.3 + 0.3));
  assert.equal(draws, 1439);
  const negative = generateArPath(graph, { gaussian: () => -100 });
  assert.equal(negative[1], Math.exp(-0.3));
});

test("K histogram over all 64 development seeds matches the frozen registration", () => {
  const histogram = {};
  const attempts = [];
  let overloadedWorlds = 0;
  let maximumOverload = 0;
  for (let offset = 0; offset < 64; offset += 1) {
    const world = generateFixture020World({ seed: 0x54010000 + offset });
    assert.equal(world.manifest.terminal_failure, null, world.world_id);
    assert.ok(Number.isFinite(world.manifest.maximum_loss_mmol));
    assert.equal(baselineFeasible(world.graph), true);
    const k = world.forcing.hotspots.length;
    histogram[k] = (histogram[k] ?? 0) + 1;
    attempts.push(world.forcing.attempts);
    if (world.forcing.overload_minutes > 0) overloadedWorlds += 1;
    maximumOverload = Math.max(maximumOverload, world.forcing.overload_minutes);
  }
  assert.deepEqual(histogram, { 8: 4, 9: 6, 10: 5, 11: 5, 12: 3, 13: 3, 14: 8,
    15: 2, 16: 2, 17: 3, 18: 8, 19: 11, 20: 4 });
  assert.deepEqual(attempts, new Array(64).fill(1));
  assert.equal(overloadedWorlds, 3);
  assert.equal(maximumOverload, 8);
});

function hotspotDraws(start, duration = 10, multiplier = 1.5) {
  return [[60, 1320, start], [10, 90, duration], [1, 1, 1], [1.5, 3, multiplier]];
}

function scriptedForcing(draws) {
  let position = 0;
  const take = (a, b) => {
    assert.ok(position < draws.length, `unexpected forcing draw ${position}`);
    const [lower, upper, value] = draws[position];
    assert.deepEqual([a, b], [lower, upper], `forcing draw ${position}`);
    position += 1;
    return value;
  };
  return { random: { gaussian: () => 0, integer: take, range: take },
    drawn: () => position };
}

function forcingCell() {
  return { nodes: [{ id: 0 }, { id: 1, parent: 0, m0: 1 }],
    concentration: 1, source_flow: 2 / 1.15 };
}

test("placement redraws an overlapping try without K; touching intervals are accepted", () => {
  const starts = [60, 69, 70, 80, 90, 100, 110, 120, 130];
  const draws = [[8, 20, 8], ...starts.flatMap((start) => hotspotDraws(start))];
  const scripted = scriptedForcing(draws);
  const forcing = generateForcing(forcingCell(), scripted.random);
  assert.deepEqual(forcing.hotspots.map(({ start }) => start), [60, 70, 80, 90, 100, 110, 120, 130]);
  assert.equal(forcing.hotspots.length, 8);
  assert.equal(forcing.attempts, 1);
  assert.equal(scripted.drawn(), 37);
});

test("aggregate overload rejection draws a fresh K for the next complete schedule", () => {
  const first = Array.from({ length: 8 }, (_, i) => 60 + i * 20);
  const second = Array.from({ length: 9 }, (_, i) => 60 + i * 10);
  const draws = [[8, 20, 8], ...first.flatMap((start) => hotspotDraws(start, 20, 3)),
    [8, 20, 9], ...second.flatMap((start) => hotspotDraws(start))];
  const scripted = scriptedForcing(draws);
  const forcing = generateForcing(forcingCell(), scripted.random, () => {}, 2);
  assert.equal(forcing.attempts, 2);
  assert.equal(forcing.hotspots.length, 9);
  assert.equal(forcing.overload_minutes, 0);
  assert.equal(scripted.drawn(), draws.length);
  assert.throws(() => generateForcing(forcingCell(), scriptedForcing(draws).random, () => {}, 1),
    (error) => error instanceof GenerationFailure && error.stage === "hotspot-schedule");
});

function assertRetainedGenerationFailure(world, stage) {
  assert.deepEqual(world.manifest.terminal_failure, { reason: stage, stage });
  assert.equal(world.forcing, null);
  assert.equal(world.manifest.maximum_loss_mmol, 1440 * 8 * Math.exp(5) * 3);
  const evaluation = evaluateArmA(world);
  assert.equal(evaluation.failure_reason, stage);
  assert.equal(evaluation.loss_mmol, world.manifest.maximum_loss_mmol);
  assert.equal(evaluation.terminated, true);
  assert.equal(evaluation.truth_steps, 0);
}

test("placement exhaustion is typed and retains the world with its finite envelope", () => {
  const scripted = scriptedForcing([[8, 20, 8], ...hotspotDraws(60), ...hotspotDraws(69)]);
  assert.throws(() => generateForcing(forcingCell(), scripted.random, () => {}, 1, 1),
    (error) => error instanceof GenerationFailure && error.stage === "hotspot-placement");
  assert.equal(scripted.drawn(), 9);
  const world = generateFixture020World({ seed: 0x54010000, hotspotPlacementLimit: 0 });
  assertRetainedGenerationFailure(world, "hotspot-placement");
  assert.equal(world.graph.nodes.length - 1, 112);
  assert.throws(() => generateFixture020World({ seed: 0x54010000, hotspotPlacementLimit: 10001 }),
    /hotspot placement limit/);
});

test("all Dinic bound exhaustions are typed and retain generation-failure worlds", () => {
  const arcs = [{ from: 0, to: 1, capacity: 1 }];
  const cases = [["searchSteps", "layered-search"], ["augmentations", "augmentation"], ["phases", "phase"]];
  for (const [key, message] of cases) {
    assert.throws(() => dinicMaxFlow(2, arcs, 0, 1, { [key]: 0 }),
      (error) => error instanceof GenerationFailure && error.stage === "max-flow-bound"
        && error.message.includes(message));
    assertRetainedGenerationFailure(generateFixture020World({ seed: 0x54010000,
      maxFlowBounds: { [key]: 0 } }), "max-flow-bound");
  }
  assert.equal(dinicMaxFlow(2, arcs, 0, 1), 1);
  assert.throws(() => dinicMaxFlow(2, arcs, 0, 1, { phases: 3 }), /phases limit/);
});
