import { exactKeys } from "../lib/exact-keys.mjs";

function assertVisibleGraph(graph) {
  if (!exactKeys(graph, ["nodes", "edges", "source_flow"])) throw new Error("oracle-key-leak");
  if (!graph.nodes.every((node) => exactKeys(node, ["id", "storage_cap", "storage_initial"]))
    || !graph.edges.every((edge) => exactKeys(edge, ["id", "from", "to", "capacity", "tree_flow"]))) {
    throw new Error("oracle-key-leak");
  }
  if (!graph.nodes.every((node) => Object.values(node).every(Number.isFinite))
    || !graph.edges.every((edge) => typeof edge.id === "string"
      && [edge.from, edge.to, edge.capacity, edge.tree_flow].every(Number.isFinite))
    || !Number.isFinite(graph.source_flow)) throw new Error("oracle-key-leak");
}

export function assertArmInput(input) {
  if (!exactKeys(input, ["schema", "world_id", "minute", "graph", "source", "panels"])) {
    throw new Error("oracle-key-leak");
  }
  assertVisibleGraph(input.graph);
  if (!exactKeys(input.source, ["measurement_minute", "flow_raw", "concentration_raw"])
    || !input.panels.every((panel) => exactKeys(panel,
      ["measurement_minute", "arrival_minute", "storage_raw", "consumption_raw"]))) {
    throw new Error("oracle-key-leak");
  }
  assertVisibleReadings(input);
  return input;
}

function assertVisibleReadings(input) {
  if (input.schema !== 1 || typeof input.world_id !== "string" || !Number.isFinite(input.minute)
    || !Object.values(input.source).every(Number.isFinite)) throw new Error("oracle-key-leak");
  for (const panel of input.panels) {
    if (![panel.measurement_minute, panel.arrival_minute].every(Number.isFinite)
      || !numericPanel(panel.storage_raw, input.graph.nodes.length)
      || !numericPanel(panel.consumption_raw, input.graph.nodes.length)) throw new Error("oracle-key-leak");
  }
}

function numericPanel(values, count) {
  return Array.isArray(values) && values.length === count && values.every(Number.isFinite);
}

export function armInput(world, minute, source, panels) {
  const graph = world.graph;
  return assertArmInput({ schema: 1, world_id: world.world_id, minute,
    graph: { nodes: graph.nodes.slice(1).map(({ id, storage_cap, storage_initial }) => (
      { id, storage_cap, storage_initial }
    )), edges: graph.edges.map(({ id, from, to, capacity, tree_flow }) => (
      { id, from, to, capacity, tree_flow }
    )), source_flow: graph.source_flow }, source, panels });
}

export function fixedTreePolicy(input, previous = null) {
  assertArmInput(input);
  return input.graph.edges.map((edge, index) => {
    if (previous === null) return edge.tree_flow;
    const change = 0.25 * edge.capacity;
    return Math.max(previous[index] - change, Math.min(previous[index] + change, edge.tree_flow));
  });
}

export function validateFlows(graph, flows, previous = null) {
  if (!Array.isArray(flows) || flows.length !== graph.edges.length) return { failure: "missing-output" };
  const recipients = new Float64Array(graph.nodes.length);
  for (let index = 0; index < graph.edges.length; index += 1) {
    const edge = graph.edges[index];
    const q = flows[index];
    if (!validEdgeFlow(edge, q, previous?.[index])) return { failure: "infeasible-flow" };
    recipients[edge.from] -= q;
    recipients[edge.to] += q;
  }
  return validateRecipients(graph, flows, recipients);
}

function validateRecipients(graph, flows, recipients) {
  if (Math.abs(-recipients[0] - graph.source_flow) > 1e-10
    || recipients.slice(1).some((value) => value < -1e-10)) return { failure: "infeasible-flow" };
  if (flows.some((value) => value < 0) || recipients.slice(1).some((value) => value < 0)) {
    return { failure: "negative-amount" };
  }
  return { failure: null, recipients };
}

function validEdgeFlow(edge, q, previous) {
  if (!Number.isFinite(q) || q < -1e-10 || q > edge.capacity + 1e-10) return false;
  return previous === undefined || Math.abs(q - previous) <= 0.25 * edge.capacity + 1e-10;
}
