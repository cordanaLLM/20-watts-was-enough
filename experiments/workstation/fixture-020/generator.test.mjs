import assert from "node:assert/strict";
import test from "node:test";
import { generateFixture020World } from "./generator.mjs";
import { IcpRandom, uniformFromUint64 } from "./random.mjs";
import { aggregateScheduleAccepted, applySchedule, generateArPath, nonOverlapping } from "./forcing.mjs";
import { baselineFeasible, dinicMaxFlow } from "./max-flow.mjs";
import { generateGraph } from "./graph.mjs";
import { sha256, binary64Bytes } from "./contract.mjs";

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

test("all 64 public development seeds retain a finite registered base world", () => {
  for (let offset = 0; offset < 64; offset += 1) {
    const world = generateFixture020World({ seed: 0x54010000 + offset });
    assert.equal(world.manifest.terminal_failure, null, world.world_id);
    assert.ok(Number.isFinite(world.manifest.maximum_loss_mmol));
    assert.equal(baselineFeasible(world.graph), true);
  }
});
