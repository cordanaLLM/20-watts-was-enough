import { GenerationFailure } from "./graph.mjs";

export const MINUTES = 1440;
export const TRUTH_DT = 0.25;

export function generateArPath(graph, random, check = () => {}) {
  const count = graph.nodes.length - 1;
  const demand = new Float64Array(MINUTES * count);
  const z = new Float64Array(count);
  for (let minute = 0; minute < MINUTES; minute += 1) {
    check();
    for (let node = 0; node < count; node += 1) {
      if (minute > 0) z[node] = 0.94 * z[node] + 0.12 * Math.max(-2.5, Math.min(2.5, random.gaussian()));
      demand[minute * count + node] = graph.nodes[node + 1].m0 * Math.exp(z[node]);
    }
  }
  return demand;
}

function placeHotspot(graph, random, id, schedule, check, limit) {
  for (let attempt = 0; attempt < limit; attempt += 1) {
    check();
    const hotspot = { id, start: random.integer(60, 1320), duration: random.integer(10, 90),
      centre: random.integer(1, graph.nodes.length - 1), multiplier: random.range(1.5, 3) };
    if (nonOverlapping([...schedule, hotspot])) return hotspot;
  }
  throw new GenerationFailure("hotspot-placement");
}

function drawSchedule(graph, random, check, placementLimit) {
  const count = random.integer(8, 20);
  const hotspots = [];
  for (let id = 0; id < count; id += 1) {
    hotspots.push(placeHotspot(graph, random, id, hotspots, check, placementLimit));
  }
  return hotspots;
}

export function nonOverlapping(schedule) {
  const ordered = [...schedule].sort((a, b) => a.start - b.start || a.id - b.id);
  return ordered.every((hotspot, index) => index === 0
    || ordered[index - 1].start + ordered[index - 1].duration <= hotspot.start);
}

function hotspotWeights(graph, centre, multiplier) {
  return graph.nodes.slice(1).map((node) => {
    if (node.id === centre) return multiplier;
    if (node.parent === centre) return 1 + (multiplier - 1) / 2;
    if (graph.nodes[node.parent]?.parent === centre) return 1 + (multiplier - 1) / 4;
    return 1;
  });
}

export function applySchedule(graph, baseDemand, schedule) {
  const count = graph.nodes.length - 1;
  const demand = baseDemand.slice();
  for (const hotspot of schedule) {
    const weights = hotspotWeights(graph, hotspot.centre, hotspot.multiplier);
    const end = Math.min(MINUTES, hotspot.start + hotspot.duration);
    for (let minute = hotspot.start; minute < end; minute += 1) {
      for (let node = 0; node < count; node += 1) demand[minute * count + node] *= weights[node];
    }
  }
  return demand;
}

export function overloadMinutes(demand, count, threshold) {
  let overload = 0;
  for (let minute = 0; minute < MINUTES; minute += 1) {
    let aggregate = 0;
    for (let node = 0; node < count; node += 1) aggregate += demand[minute * count + node];
    if (aggregate > threshold) overload += 1;
  }
  return overload;
}

export function aggregateScheduleAccepted(demand, count, threshold) {
  return overloadMinutes(demand, count, threshold) <= 120;
}

export function generateForcing(graph, random, check = () => {}, limit = 10000, placementLimit = limit) {
  const base = generateArPath(graph, random, check);
  const count = graph.nodes.length - 1;
  const threshold = 1.15 * graph.concentration * graph.source_flow;
  for (let attempt = 0; attempt < limit; attempt += 1) {
    check();
    const hotspots = drawSchedule(graph, random, check, placementLimit);
    const demand = applySchedule(graph, base, hotspots);
    const overloaded = overloadMinutes(demand, count, threshold);
    if (overloaded > 120) continue;
    const maximumLoss = demand.reduce((sum, value) => sum + value, 0);
    return { demand, hotspots, overload_minutes: overloaded,
      attempts: attempt + 1, maximum_loss: maximumLoss };
  }
  throw new GenerationFailure("hotspot-schedule");
}
