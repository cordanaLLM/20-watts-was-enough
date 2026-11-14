import { percentile } from "../lib/percentile.mjs";

export function oxygenStep(storage, delivery, demand, cap, dt = 0.25) {
  const leaked = Math.min(storage, 0.002 * storage * dt);
  const available = storage - leaked + delivery;
  const consumed = Math.min(demand, available);
  const residue = available - consumed;
  return { storage_before: storage, delivery, demand, leaked, consumed,
    storage_after: Math.min(cap, residue), exported: Math.max(0, residue - cap), deficit: demand - consumed };
}

export function closureError(row) {
  const left = row.storage_before + row.delivery;
  const right = row.storage_after + row.leaked + row.consumed + row.exported;
  const material = Math.abs(left - right) / Math.max(Math.abs(left), Math.abs(right), Number.MIN_VALUE);
  const demand = Math.abs(row.demand - row.consumed - row.deficit)
    / Math.max(Math.abs(row.demand), Number.MIN_VALUE);
  return Math.max(material, demand);
}

export function checkOxygenRow(row) {
  if (!Object.values(row).every(Number.isFinite)) return "broken-closure";
  if (row.storage_after < 0) return "negative-storage";
  if (Object.values(row).some((value) => value < 0)) return "negative-amount";
  return closureError(row) > 1e-8 ? "broken-closure" : null;
}

export function pumpPower(graph, flows) {
  return graph.edges.reduce((sum, edge, index) => sum
    + 8 * 0.0035 * edge.length * (flows[index] * 1e-3 / 60) ** 2 / (Math.PI * edge.radius ** 4), 0);
}

// Type 7 interpolates two existing shared order-statistic queries.
export function percentileType7(values, fraction) {
  if (values.length === 0) return null;
  const h = (values.length - 1) * fraction;
  const lower = Math.floor(h);
  const upper = Math.ceil(h);
  const a = percentile(values, (lower + 0.5) / values.length);
  const b = percentile(values, (upper + 0.5) / values.length);
  return a + (h - lower) * (b - a);
}

export function closureState(previous, failure) {
  const consecutive = failure === "broken-closure" ? previous + 1 : 0;
  return { consecutive, terminate: failure === "negative-storage" || consecutive >= 3 };
}
