import path from "node:path";
import { createHash } from "node:crypto";
import { canonical } from "./contract.mjs";
import { stableRows, hashFile } from "./storage.mjs";

function* singleRow(value) {
  yield `${canonical(value)}\n`;
}

function* canonicalRows(rows) {
  for (const row of rows) yield `${canonical(row)}\n`;
}

function* demandRows(world) {
  if (!world.forcing) return;
  const count = world.graph.nodes.length - 1;
  for (let minute = 0; minute < 1440; minute += 1) {
    // Fixed key order is canonical; native array encoding avoids a token tree.
    yield `${JSON.stringify({ minute,
      rates_mmol_min: [...world.forcing.demand.subarray(minute * count, (minute + 1) * count)] })}\n`;
  }
}

function* observationRows(rows) {
  for (const row of rows) {
    const ordered = row.kind === "source"
      ? { concentration_raw: row.concentration_raw, flow_raw: row.flow_raw,
        kind: row.kind, measurement_minute: row.measurement_minute }
      : { arrival_minute: row.arrival_minute, consumption_raw: row.consumption_raw,
        kind: row.kind, measurement_minute: row.measurement_minute, storage_raw: row.storage_raw };
    yield `${JSON.stringify(ordered)}\n`;
  }
}

export function worldArtifacts(world, evaluation) {
  const { aggregates, observations, fallbacks, ...metrics } = evaluation;
  const manifest = { ...world.manifest,
    uniform_upper_round: evaluation.uniform_upper_round ?? world.manifest.uniform_upper_round };
  const sources = {
    "world-manifest.json": () => singleRow(manifest),
    "graph.json": () => singleRow(world.graph),
    "demand.jsonl": () => demandRows(world),
    "oxygen-ledger.jsonl": () => canonicalRows(aggregates),
    "flows.json": () => singleRow({ edge_order: world.graph?.edges.map((edge) => edge.id) ?? [],
      fixed_flow_l_min: world.graph?.edges.map((edge) => edge.tree_flow) ?? [],
      truth_sha256: evaluation.flows_sha256 ?? null }),
    "observations.jsonl": () => observationRows(observations),
    "fallbacks.jsonl": () => canonicalRows(fallbacks),
  };
  const hashes = {};
  for (const [name, rows] of Object.entries(sources)) {
    const hash = createHash("sha256");
    for (const row of rows()) hash.update(row);
    hashes[name] = hash.digest("hex");
  }
  return { sources, hashes, metrics };
}

export async function writeWorldArtifacts(directory, artifacts) {
  for (const [name, rows] of Object.entries(artifacts.sources)) {
    await stableRows(path.join(directory, name), rows, artifacts.hashes[name]);
  }
}

export async function verifyWorldArtifacts(directory, artifacts) {
  for (const [name, digest] of Object.entries(artifacts.hashes)) {
    if (await hashFile(path.join(directory, name)) !== digest) {
      throw new Error(`ICP-T01 artifact replay differs: ${name}.`);
    }
  }
}
