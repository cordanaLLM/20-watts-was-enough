import { canonical, GenerationFailure, sha256 } from "./contract.mjs";
import { IcpRandom } from "./random.mjs";
import { T02_L_MAX, T02_R_MAX, T02_REGISTRATIONS, T02_REGIME_LABELS, t02WorldId } from "./t02-contract.mjs";
import { computeObjective } from "./t02-objective.mjs";

export const T02_GENERATOR_VERSION = "fixture-020.icp-t02-generator.v1";

export function acceptT02Attempt(tree, regimeParams) {
  const radii = new Array(tree.edge_count).fill(T02_R_MAX);
  const obj = computeObjective(tree, radii, regimeParams);
  if (!obj.feasible) return false;
  return 3600 * obj.power < T02_L_MAX;
}

export function generateT02World({ seed, check = () => {}, rejectionLimit = 10000 }) {
  const id = t02WorldId(seed);
  if (!Number.isSafeInteger(rejectionLimit) || rejectionLimit < 0 || rejectionLimit > 10000) {
    throw new Error("ICP-T02 rejection limit must be in [0,10000].");
  }
  const events = { uniform_upper_round: 0 };
  const streams = { regime: `ICP-v2|T02|regime|${id}`, tree: `ICP-v2|T02|tree|${id}` };
  let regime = null;
  try {
    check();
    const regimeRng = new IcpRandom(streams.regime, events);
    regime = T02_REGIME_LABELS[regimeRng.integer(0, 3)];
    const treeRng = new IcpRandom(streams.tree, events);
    for (let attempt = 0; attempt < rejectionLimit; attempt += 1) {
      if (attempt > 0) check();
      const tree = drawTree(treeRng);
      const regimeParams = drawRegimeParams(regimeRng, regime, tree.P_root);
      if (acceptT02Attempt(tree, regimeParams)) {
        return acceptedT02World(seed, id, tree, regime, regimeParams, streams, attempt + 1, events);
      }
    }
    throw new GenerationFailure("rejection-limit", "", "ICP-T02");
  } catch (error) {
    if (!(error instanceof GenerationFailure)) throw error;
    return failedT02World(seed, id, streams, events, regime, rejectionLimit, error.stage);
  }
}

function acceptedT02World(seed, id, tree, regime, regimeParams, streams, attempts, events) {
  const manifest = { schema: 1, seed, world_id: id, family: "base", regime,
    registrations: T02_REGISTRATIONS, generator_version: T02_GENERATOR_VERSION,
    streams, attempts, tree_sha256: sha256(canonical(tree)),
    uniform_upper_round: events.uniform_upper_round, terminal_failure: null };
  return { seed, world_id: id, tree, regime, regime_params: regimeParams, manifest,
    world_sha256: sha256(canonical(manifest)) };
}

function drawTree(rng) {
  const depth = rng.integer(4, 7);
  const nodeCount = (1 << (depth + 1)) - 1;
  const edgeCount = nodeCount - 1;
  const terminalCount = 1 << depth;
  const firstTerminal = (1 << depth) - 1;
  const edgeLengths = new Array(edgeCount);
  for (let e = 0; e < edgeCount; e += 1) edgeLengths[e] = rng.logRange(0.005, 0.05);
  const baseFlows = new Array(terminalCount);
  for (let t = 0; t < terminalCount; t += 1) baseFlows[t] = rng.logRange(1e-10, 1e-8);
  const total = rng.logRange(1e-7, 1e-5);
  const baseSum = baseFlows.reduce((s, v) => s + v, 0);
  const terminalFlows = baseFlows.map((b) => b * total / baseSum);
  const edgeFlows = new Array(edgeCount).fill(0);
  for (let n = nodeCount - 1; n >= 1; n -= 1) {
    edgeFlows[n - 1] = n >= firstTerminal
      ? terminalFlows[n - firstTerminal]
      : edgeFlows[2 * n] + edgeFlows[2 * n + 1];
  }
  const mu0 = rng.logRange(0.001, 0.006);
  const lambda_V = rng.logRange(1e2, 1e5);
  const P_root = rng.range(5000, 25000);
  return { depth, node_count: nodeCount, edge_count: edgeCount, terminal_count: terminalCount,
    first_terminal: firstTerminal, edge_lengths: edgeLengths, edge_flows: edgeFlows,
    terminal_flows: terminalFlows, mu0, lambda_V, P_root, total_flow: total };
}

function drawRegimeParams(rng, regime, P_root) {
  if (regime === "classic") return { required_terminal_pressure: 0 };
  if (regime === "rheology") {
    return { a: rng.range(0.5, 4), r_c: rng.logRange(1e-4, 1e-3), required_terminal_pressure: 0 };
  }
  if (regime === "pulsatile") {
    return { lambda_I: rng.range(0.1, 2), f: rng.range(0.5, 4), rho: 1000,
      required_terminal_pressure: 0 };
  }
  const lambda_A = rng.logRange(1, 1e3);
  const P_min = rng.range(0.2, 0.8) * P_root;
  return { lambda_A, P_min, required_terminal_pressure: P_min };
}

function failedT02World(seed, id, streams, events, regime, attempts, stage) {
  const manifest = { schema: 1, seed, world_id: id, family: "base", regime,
    registrations: T02_REGISTRATIONS, generator_version: T02_GENERATOR_VERSION,
    streams, attempts, tree_sha256: null, uniform_upper_round: events.uniform_upper_round,
    terminal_failure: { reason: "generator-failure", stage } };
  return { seed, world_id: id, tree: null, regime: null, regime_params: null, manifest,
    world_sha256: sha256(canonical(manifest)) };
}

export function interruptedT02World(seed, stage) {
  const id = t02WorldId(seed);
  const streams = { regime: `ICP-v2|T02|regime|${id}`, tree: `ICP-v2|T02|tree|${id}` };
  return failedT02World(seed, id, streams, { uniform_upper_round: 0 }, null, 0, stage);
}

export function calibrationCell() {
  return {
    depth: 2, node_count: 4, edge_count: 3, terminal_count: 2, first_terminal: 2,
    edge_lengths: [0.02, 0.02, 0.02],
    edge_flows: [2e-6, 1e-6, 1e-6],
    terminal_flows: [1e-6, 1e-6],
    parents: [null, 0, 1, 1],
    mu0: 0.0035, lambda_V: 1e3, P_root: 25000, total_flow: 2e-6,
  };
}

export function calibrationRegimeParams() {
  return { required_terminal_pressure: 0 };
}
