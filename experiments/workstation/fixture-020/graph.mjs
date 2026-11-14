import { baselineFeasible } from "./max-flow.mjs";

export class GenerationFailure extends Error {
  constructor(stage) {
    super(`ICP-T01 generation exhausted at ${stage}.`);
    this.stage = stage;
  }
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function drawPoint(id, nodes, random, limit, check) {
  for (let attempt = 0; attempt < limit; attempt += 1) {
    check();
    const point = { id, x: random.uniform(), y: random.uniform() };
    if (nodes.every((other) => distance(point, other) >= 0.01)) return point;
  }
  throw new GenerationFailure("pair-separation");
}

function topology(nodes) {
  const order = nodes.slice(1).sort((a, b) => distance(a, nodes[0]) - distance(b, nodes[0]) || a.id - b.id);
  const earlier = [nodes[0]];
  const edges = [];
  for (const node of order) {
    const nearest = [...earlier].sort((a, b) => distance(a, node) - distance(b, node) || a.id - b.id);
    node.parent = nearest[0].id;
    for (const [rank, parent] of nearest.slice(0, 3).entries()) {
      edges.push({ id: `${String(parent.id).padStart(3, "0")}:${String(node.id).padStart(3, "0")}`,
        from: parent.id, to: node.id, primary: rank === 0 });
    }
    earlier.push(node);
  }
  return { edges: edges.sort((a, b) => a.id.localeCompare(b.id)), order: order.map(({ id }) => id) };
}

function baseline(nodes, order, random) {
  const shares = random.dirichlet(nodes.length - 1);
  const concentration = random.range(7, 10);
  const baselineDemand = random.range(1, 8);
  for (const node of nodes.slice(1)) {
    node.share = shares[node.id - 1];
    node.m0 = node.share * baselineDemand;
    node.q0 = node.m0 / concentration;
    node.storage_cap = 10 * node.m0;
    node.storage_initial = 0.5 * node.storage_cap;
  }
  const tree = nodes.map((node) => 1.20 * (node.q0 ?? 0));
  for (let index = order.length - 1; index >= 0; index -= 1) {
    const id = order[index];
    tree[nodes[id].parent] += tree[id];
  }
  return { concentration, baseline_demand: baselineDemand,
    source_flow: 1.20 * baselineDemand / concentration, tree };
}

function decorateEdges(edges, nodes, values, random) {
  // All capacities precede all radii in the written draw order.
  for (const edge of edges) {
    edge.tree_flow = edge.primary ? values.tree[edge.to] : 0;
    edge.capacity = edge.primary ? random.range(1.10, 1.50) * edge.tree_flow
      : random.range(0.05, 0.25) * values.source_flow;
    edge.length = distance(nodes[edge.from], nodes[edge.to]);
  }
  for (const edge of edges) edge.radius = random.logRange(0.001, 0.004);
}

export function generateGraph(random, limit = 10000, check = () => {}) {
  for (let attempt = 0; attempt < limit; attempt += 1) {
    check();
    const count = random.integer(48, 128);
    const nodes = [{ id: 0, x: 0.5, y: 0.5 }];
    for (let id = 1; id <= count; id += 1) nodes.push(drawPoint(id, nodes, random, limit, check));
    const { edges, order } = topology(nodes);
    const { tree, ...values } = baseline(nodes, order, random);
    decorateEdges(edges, nodes, { ...values, tree }, random);
    const graph = { nodes, edges, order, ...values, attempts: attempt + 1 };
    if (baselineFeasible(graph)) return graph;
  }
  throw new GenerationFailure("graph-max-flow");
}
