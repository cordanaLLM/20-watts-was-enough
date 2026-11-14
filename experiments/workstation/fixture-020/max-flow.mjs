import { GenerationFailure } from "./contract.mjs";

function addArc(adjacency, from, to, capacity) {
  const forward = { to, capacity };
  const backward = { to: from, capacity: 0 };
  forward.reverse = backward;
  backward.reverse = forward;
  adjacency[from].push(forward);
  adjacency[to].push(backward);
}

function levels(adjacency, source) {
  const level = new Int32Array(adjacency.length).fill(-1);
  const queue = [source];
  level[source] = 0;
  for (let head = 0; head < queue.length && head < adjacency.length; head += 1) {
    const from = queue[head];
    for (const arc of adjacency[from]) {
      if (arc.capacity > 0 && level[arc.to] < 0) {
        level[arc.to] = level[from] + 1;
        queue.push(arc.to);
      }
    }
  }
  return level;
}

function augment(adjacency, level, cursor, source, sink, searchSteps) {
  const nodes = [source];
  const path = [];
  // A layered search advances a cursor at most once per residual arc.
  for (let step = 0; step < searchSteps; step += 1) {
    const from = nodes.at(-1);
    if (from === sink) return sendPath(adjacency, path);
    if (from === undefined) return 0;
    const arc = adjacency[from][cursor[from]];
    if (!arc) {
      nodes.pop();
      const parent = path.pop();
      if (parent) cursor[parent.from] += 1;
    } else if (arc.capacity > 0 && level[arc.to] === level[from] + 1) {
      path.push({ from, arc });
      nodes.push(arc.to);
    } else {
      cursor[from] += 1;
    }
  }
  throw new GenerationFailure("max-flow-bound", "Dinic layered-search bound exhausted.");
}

function sendPath(adjacency, path) {
  const amount = path.reduce((minimum, { arc }) => Math.min(minimum, arc.capacity), Infinity);
  for (const { arc } of path) {
    arc.capacity -= amount;
    arc.reverse.capacity += amount;
  }
  return amount;
}

function flowBounds(nodeCount, arcCount, overrides) {
  const natural = { searchSteps: 4 * arcCount + nodeCount + 1,
    augmentations: arcCount + 1, phases: nodeCount };
  return Object.fromEntries(Object.entries(natural).map(([key, upper]) => {
    const value = overrides[key] ?? upper;
    if (!Number.isSafeInteger(value) || value < 0 || value > upper) {
      throw new Error(`ICP-T01 Dinic ${key} limit must be in [0,${upper}].`);
    }
    return [key, value];
  }));
}

function blockingFlow(adjacency, level, source, sink, bounds) {
  const cursor = new Int32Array(adjacency.length);
  let flow = 0;
  for (let push = 0; push < bounds.augmentations; push += 1) {
    const amount = augment(adjacency, level, cursor, source, sink, bounds.searchSteps);
    if (amount === 0) return flow;
    flow += amount;
  }
  throw new GenerationFailure("max-flow-bound", "Dinic augmentation bound exhausted.");
}

export function dinicMaxFlow(nodeCount, arcs, source, sink, overrides = {}) {
  const bounds = flowBounds(nodeCount, arcs.length, overrides);
  const adjacency = Array.from({ length: nodeCount }, () => []);
  const ordered = [...arcs].sort((a, b) => a.from - b.from || a.to - b.to);
  for (const edge of ordered) addArc(adjacency, edge.from, edge.to, edge.capacity);
  for (const neighbors of adjacency) neighbors.sort((a, b) => a.to - b.to);
  let flow = 0;
  for (let phase = 0; phase < bounds.phases; phase += 1) {
    const level = levels(adjacency, source);
    if (level[sink] < 0) return flow;
    flow += blockingFlow(adjacency, level, source, sink, bounds);
  }
  throw new GenerationFailure("max-flow-bound", "Dinic phase bound exhausted.");
}

export function baselineFeasible(graph, bounds = {}) {
  const sink = graph.nodes.length;
  const arcs = graph.edges.map(({ from, to, capacity }) => ({ from, to, capacity }));
  for (const node of graph.nodes.slice(1)) {
    arcs.push({ from: node.id, to: sink, capacity: 1.20 * node.q0 });
  }
  return Math.abs(dinicMaxFlow(sink + 1, arcs, 0, sink, bounds) - graph.source_flow) <= 1e-12;
}
