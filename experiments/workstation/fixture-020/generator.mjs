import { binary64Bytes, canonical, REGISTRATIONS, sha256, worldId } from "./contract.mjs";
import { generateGraph, GenerationFailure } from "./graph.mjs";
import { generateForcing } from "./forcing.mjs";
import { IcpRandom } from "./random.mjs";

export const FIXTURE_020_GENERATOR_VERSION = "fixture-020.icp-t01-generator.v1";

export function generateFixture020World({ seed, check = () => {}, rejectionLimit = 10000,
  hotspotPlacementLimit = rejectionLimit, maxFlowBounds = {} }) {
  const id = worldId(seed);
  if (!Number.isSafeInteger(rejectionLimit) || rejectionLimit < 0 || rejectionLimit > 10000) {
    throw new Error("ICP-T01 rejection limit must be in [0,10000].");
  }
  if (!Number.isSafeInteger(hotspotPlacementLimit) || hotspotPlacementLimit < 0 || hotspotPlacementLimit > 10000) {
    throw new Error("ICP-T01 hotspot placement limit must be in [0,10000].");
  }
  const events = { uniform_upper_round: 0 };
  const streams = Object.fromEntries(["graph", "forcing", "observation"].map((name) => (
    [name, `ICP-v2|T01|${name}|${id}`]
  )));
  let graph = null;
  try {
    check();
    graph = generateGraph(new IcpRandom(streams.graph, events), rejectionLimit, check, maxFlowBounds);
    const forcing = generateForcing(graph, new IcpRandom(streams.forcing, events), check,
      rejectionLimit, hotspotPlacementLimit);
    const delay = new IcpRandom(streams.observation, events).integer(0, 4);
    const manifest = { schema: 1, seed, world_id: id, family: "base", registrations: REGISTRATIONS,
      generator_version: FIXTURE_020_GENERATOR_VERSION, streams,
      graph_sha256: sha256(canonical(graph)), demand_sha256: sha256(binary64Bytes(forcing.demand)),
      hotspots: forcing.hotspots, hotspot_attempts: forcing.attempts,
      overload_minutes: forcing.overload_minutes, maximum_loss_mmol: forcing.maximum_loss,
      observation_delay_min: delay, uniform_upper_round: events.uniform_upper_round,
      terminal_failure: null };
    return { seed, world_id: id, graph, forcing, manifest, world_sha256: sha256(canonical(manifest)) };
  } catch (error) {
    if (!(error instanceof GenerationFailure)) throw error;
    return failedWorld(seed, id, streams, events, graph, error.stage);
  }
}

function failedWorld(seed, id, streams, events, graph, stage) {
  // Conservative finite envelope: clipped AR <= 5; one hotspot <= 3.
  const maximumLoss = 1440 * 8 * Math.exp(5) * 3;
  const reason = ["hotspot-placement", "max-flow-bound"].includes(stage) ? stage : "generator-failure";
  const manifest = { schema: 1, seed, world_id: id, family: "base", registrations: REGISTRATIONS,
    generator_version: FIXTURE_020_GENERATOR_VERSION, streams, uniform_upper_round: events.uniform_upper_round,
    terminal_failure: { reason, stage }, maximum_loss_mmol: maximumLoss };
  return { seed, world_id: id, graph, forcing: null, manifest,
    world_sha256: sha256(canonical(manifest)) };
}

export function interruptedWorld(seed, reason) {
  const id = worldId(seed);
  const streams = Object.fromEntries(["graph", "forcing", "observation"].map((name) => (
    [name, `ICP-v2|T01|${name}|${id}`]
  )));
  return failedWorld(seed, id, streams, { uniform_upper_round: 0 }, null, reason);
}
