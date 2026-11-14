import { createHash } from "node:crypto";
import { EVALUATION_NUMBERS, ExecutionStop, sha256 } from "./contract.mjs";
import { MINUTES, TRUTH_DT } from "./forcing.mjs";
import { checkOxygenRow, closureError, closureState, oxygenStep, percentileType7, pumpPower } from "./accounting.mjs";
import { armInput, fixedTreePolicy, validateFlows } from "./policy.mjs";
import { arrivedPanels, observationState, observeMinute, observePanel } from "./observations.mjs";

export { closureState, oxygenStep, checkOxygenRow, percentileType7, validateFlows };

const ROW_FIELDS = Object.freeze(["storage_before", "delivery", "demand", "leaked", "consumed",
  "storage_after", "exported", "deficit"]);

function initialState(world) {
  const graph = world.graph;
  const count = graph.nodes.length;
  return { storage: Float64Array.from(graph.nodes, (node) => node.storage_initial ?? 0),
    consumption: new Float64Array(count), node_debt: new Float64Array(count),
    episodes: new Uint32Array(count), episode_steps: new Uint32Array(count), durations: [],
    observations: observationState(world), oxygen_hash: createHash("sha256"), flow_hash: createHash("sha256"),
    oxygen_buffer: Buffer.alloc(80), flow_buffer: Buffer.alloc((graph.edges.length + 1) * 8),
    loss: 0, delivered: 0, consumed: 0, exported: 0, leaked: 0,
    minimum_storage: Math.min(...graph.nodes.slice(1).map((node) => node.storage_initial)),
    work: 0, exposure: 0, variation: 0, max_closure: 0, consecutive: 0,
    failure: null, terminated: false, steps: 0, flows: null, recipients: null,
    aggregates: [], interval: emptyInterval(0) };
}

function emptyInterval(minute) {
  return { start_minute: minute, steps: 0, delivered_mmol: 0, consumed_mmol: 0,
    exported_mmol: 0, leaked_mmol: 0, deficit_mmol: 0, work_j: 0 };
}

function decision(state, world, minute, policy) {
  const visible = armInput(world, minute, state.observations.latest_source,
    arrivedPanels(state.observations, minute));
  let flows;
  try {
    flows = policy(visible, state.flows);
  } catch (error) {
    return error.message === "oracle-key-leak" ? "oracle-key-leak" : "policy-exception";
  }
  const checked = validateFlows(world.graph, flows, state.flows);
  if (checked.failure) return checked.failure;
  if (state.flows) state.variation += flows.reduce((sum, value, i) => sum + Math.abs(value - state.flows[i]), 0);
  state.flows = flows;
  state.recipients = checked.recipients;
  return null;
}

function updateNode(state, world, step, node, rowStep) {
  const minute = Math.floor(step / 4);
  const demand = world.forcing.demand[minute * (world.graph.nodes.length - 1) + node - 1] * TRUTH_DT;
  const delivery = world.graph.concentration * state.recipients[node] * TRUTH_DT;
  const row = rowStep(state.storage[node], delivery, demand, world.graph.nodes[node].storage_cap);
  const failure = checkOxygenRow(row);
  const error = closureError(row);
  state.max_closure = Math.max(state.max_closure, Number.isFinite(error) ? error : 1);
  hashOxygenRow(state, step, node, row);
  if (failure) return failure;
  state.storage[node] = row.storage_after;
  state.minimum_storage = Math.min(state.minimum_storage, row.storage_after);
  state.node_debt[node] += row.deficit;
  state.consumption[node] += row.consumed;
  updateEpisodes(state, node, row.deficit);
  accumulateRow(state, row);
  return null;
}

function hashOxygenRow(state, step, node, row) {
  state.oxygen_buffer.writeDoubleLE(step, 0);
  state.oxygen_buffer.writeDoubleLE(node, 8);
  for (let index = 0; index < ROW_FIELDS.length; index += 1) {
    state.oxygen_buffer.writeDoubleLE(row[ROW_FIELDS[index]], (index + 2) * 8);
  }
  state.oxygen_hash.update(state.oxygen_buffer);
}

function hashFlowRow(state, step) {
  state.flow_buffer.writeDoubleLE(step, 0);
  for (let index = 0; index < state.flows.length; index += 1) {
    state.flow_buffer.writeDoubleLE(state.flows[index], (index + 1) * 8);
  }
  state.flow_hash.update(state.flow_buffer);
}

function updateEpisodes(state, node, deficit) {
  if (deficit > 0) {
    if (state.episode_steps[node] === 0) state.episodes[node] += 1;
    state.episode_steps[node] += 1;
  } else if (state.episode_steps[node] > 0) {
    state.durations.push(state.episode_steps[node] * TRUTH_DT);
    state.episode_steps[node] = 0;
  }
}

function accumulateRow(state, row) {
  state.loss += row.deficit;
  state.delivered += row.delivery;
  state.consumed += row.consumed;
  state.exported += row.exported;
  state.leaked += row.leaked;
  state.interval.delivered_mmol += row.delivery;
  state.interval.consumed_mmol += row.consumed;
  state.interval.exported_mmol += row.exported;
  state.interval.leaked_mmol += row.leaked;
  state.interval.deficit_mmol += row.deficit;
}

function updateNodes(state, world, step, rowStep) {
  let failure = null;
  for (let node = 1; node < world.graph.nodes.length; node += 1) {
    const nodeFailure = updateNode(state, world, step, node, rowStep);
    if (!nodeFailure) continue;
    failure ??= nodeFailure;
    if (nodeFailure !== "broken-closure") return { failure, terminated: true };
  }
  return { failure, terminated: false };
}

function truthStep(state, world, step, rowStep) {
  const { failure, terminated } = updateNodes(state, world, step, rowStep);
  const closure = closureState(state.consecutive, failure);
  state.consecutive = closure.consecutive;
  if (failure) state.failure = failure;
  state.terminated = closure.terminate || terminated;
  const work = pumpPower(world.graph, state.flows) * TRUTH_DT * 60;
  state.work += work;
  state.interval.work_j += work;
  state.exposure += state.flows.reduce((sum, flow) => sum + Math.abs(flow) * TRUTH_DT, 0);
  hashFlowRow(state, step);
  state.steps += 1;
  state.interval.steps += 1;
}

function finish(state, world) {
  if (state.interval.steps > 0) state.aggregates.push(state.interval);
  for (const steps of state.episode_steps) if (steps > 0) state.durations.push(steps * TRUTH_DT);
  const maxLoss = world.manifest.maximum_loss_mmol;
  return { failure_reason: state.failure, loss_mmol: state.failure ? maxLoss : state.loss,
    maximum_loss_mmol: maxLoss, observed_loss_mmol: state.loss, truth_steps: state.steps,
    terminated: state.terminated, closure_failures_consecutive: state.consecutive,
    maximum_relative_closure: state.max_closure, delivered_mmol: state.delivered,
    consumed_mmol: state.consumed, exported_mmol: state.exported, leaked_mmol: state.leaked,
    minimum_storage_mmol: state.minimum_storage, simulated_work_j: state.work,
    resource_cap_j: pumpPower(world.graph, world.graph.edges.map((edge) => edge.capacity)) * MINUTES * 60,
    edge_flow_exposure_l: state.exposure, edge_flow_total_variation_l_min: state.variation,
    deprived_node_episodes: state.episodes.reduce((sum, count) => sum + count, 0),
    deprived_episode_durations_min: state.durations,
    node_debt_p95_mmol: percentileType7([...state.node_debt.slice(1)], 0.95),
    oxygen_ledger_sha256: state.oxygen_hash.digest("hex"), flows_sha256: state.flow_hash.digest("hex"),
    uniform_upper_round: state.observations.events.uniform_upper_round,
    aggregates: state.aggregates, observations: state.observations.raw, fallbacks: [] };
}

function generationFailure(world) {
  return { ...Object.fromEntries(EVALUATION_NUMBERS.map((key) => [key, 0])),
    failure_reason: world.manifest.terminal_failure.reason, loss_mmol: world.manifest.maximum_loss_mmol,
    maximum_loss_mmol: world.manifest.maximum_loss_mmol, terminated: true,
    deprived_episode_durations_min: [], oxygen_ledger_sha256: sha256(""), flows_sha256: sha256(""),
    aggregates: [], observations: [], fallbacks: [] };
}

function minuteBoundary(state, world, step, policy) {
  const minute = step / 4;
  if (step % 4 === 0) observeMinute(state.observations, world, minute, state.storage, state.consumption);
  if (step % 20 !== 0) return;
  const failure = decision(state, world, minute, policy);
  if (failure) { state.failure = failure; state.terminated = true; }
}

function checkArmBoundary(check, state) {
  try { check(); return true; } catch (error) {
    if (!(error instanceof ExecutionStop)) throw error;
    state.failure = "missing-output";
    state.terminated = true;
    return false;
  }
}

export function evaluateArmA(world, { check = () => {}, policy = fixedTreePolicy, rowStep = oxygenStep } = {}) {
  if (world.manifest.terminal_failure) return generationFailure(world);
  const state = initialState(world);
  for (let step = 0; step < MINUTES * 4; step += 1) {
    if (!checkArmBoundary(check, state)) break;
    minuteBoundary(state, world, step, policy);
    if (state.terminated) break;
    truthStep(state, world, step, rowStep);
    if ((step + 1) % 20 === 0 || state.terminated) {
      state.aggregates.push(state.interval);
      state.interval = emptyInterval((step + 1) * TRUTH_DT);
    }
    if (state.terminated) break;
  }
  if (state.steps === MINUTES * 4) {
    observePanel(state.observations, world, MINUTES, state.storage, state.consumption);
  }
  if (state.steps === 0) state.minimum_storage = Math.min(...state.storage.slice(1));
  return finish(state, world);
}
