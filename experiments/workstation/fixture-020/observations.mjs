import { IcpRandom } from "./random.mjs";

export function observationState(world) {
  const events = { uniform_upper_round: 0 };
  const random = new IcpRandom(world.manifest.streams.observation, events);
  const delay = random.integer(0, 4);
  // The manifest already counts this replayed prefix draw.
  events.uniform_upper_round = world.manifest.uniform_upper_round;
  return { random, events, delay, pending: [], raw: [], latest_source: null };
}

function noisy(value, random) {
  return value + 0.03 * Math.abs(value) * random.gaussian();
}

export function observeMinute(state, world, minute, storage, consumption) {
  const source = { measurement_minute: minute,
    flow_raw: noisy(world.graph.source_flow, state.random),
    concentration_raw: noisy(world.graph.concentration, state.random) };
  state.latest_source = source;
  state.raw.push({ kind: "source", ...source });
  if (minute === 0 || minute % 5 !== 0) return;
  observePanel(state, world, minute, storage, consumption);
}

export function observePanel(state, world, minute, storage, consumption) {
  const panel = { measurement_minute: minute, arrival_minute: minute + state.delay,
    storage_raw: [], consumption_raw: [] };
  for (let node = 1; node < world.graph.nodes.length; node += 1) {
    panel.storage_raw.push(noisy(storage[node], state.random));
    panel.consumption_raw.push(noisy(consumption[node], state.random));
  }
  state.raw.push({ kind: "local", ...panel });
  state.pending.push(panel);
  consumption.fill(0);
}

export function arrivedPanels(state, minute) {
  const arrived = state.pending.filter((panel) => panel.arrival_minute <= minute);
  state.pending = state.pending.filter((panel) => panel.arrival_minute > minute);
  return arrived;
}
