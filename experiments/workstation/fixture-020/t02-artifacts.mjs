import path from "node:path";
import { createHash } from "node:crypto";
import { canonical } from "./contract.mjs";
import { stableRows, hashFile } from "./storage.mjs";

export const T02_ARTIFACT_FILES_LIST = Object.freeze([
  "world-manifest.json", "tree.json", "regime.json", "designs.jsonl",
  "pressure-ledger.csv", "objective-components.csv", "solver-log.jsonl",
]);

function* singleRow(value) {
  yield `${canonical(value)}\n`;
}

function* jsonlRows(rows) {
  for (const row of rows) yield `${canonical(row)}\n`;
}

function* csvRows(header, rows) {
  yield `${header}\n`;
  for (const row of rows) yield `${row.map(String).join(",")}\n`;
}

export function t02WorldArtifacts(world, evaluation) {
  const { solverLog, designCandidates, edgeComponents, nodePressures } = evaluation;
  const metrics = { ...evaluation };
  delete metrics.radii; delete metrics.solverLog; delete metrics.designCandidates;
  delete metrics.edgeComponents; delete metrics.nodePressures;
  const manifest = world.manifest;
  const tree = world.tree;
  const pressureLedger = [];
  const objectiveComponents = [];
  if (tree && nodePressures && nodePressures.length > 0) {
    const required = world.regime_params?.required_terminal_pressure ?? 0;
    for (let t = 0; t < tree.terminal_count; t += 1) {
      const nodeId = tree.first_terminal + t;
      const p = nodePressures[nodeId];
      pressureLedger.push([nodeId, p, required, p - required]);
    }
    for (let e = 0; e < tree.edge_count; e += 1) {
      const c = edgeComponents[e];
      objectiveComponents.push([e + 1, c.radius_m, c.mu_e_pa_s, c.pressure_drop_pa,
        c.pumping_w, c.volume_w, c.pulsatile_w, c.wall_floor_w]);
    }
  }
  const designRows = (designCandidates ?? []).map((c) => ({
    candidate: c.candidate, alpha: c.alpha, objective_w: c.objective_w,
    feasible: c.feasible, chosen: c.chosen,
  }));
  const sources = {
    "world-manifest.json": () => singleRow(manifest),
    "tree.json": () => singleRow(tree ?? null),
    "regime.json": () => singleRow(world.regime_params ?? null),
    "designs.jsonl": () => jsonlRows(designRows),
    "pressure-ledger.csv": () => csvRows("node_id,pressure_pa,required_pa,margin_pa", pressureLedger),
    "objective-components.csv": () => csvRows(
      "edge_id,radius_m,mu_e_pa_s,pressure_drop_pa,pumping_w,volume_w,pulsatile_w,wall_floor_w",
      objectiveComponents),
    "solver-log.jsonl": () => jsonlRows(solverLog ?? []),
  };
  const hashes = {};
  for (const [name, rows] of Object.entries(sources)) {
    const hash = createHash("sha256");
    for (const row of rows()) hash.update(row);
    hashes[name] = hash.digest("hex");
  }
  return { sources, hashes, metrics };
}

export async function writeT02WorldArtifacts(directory, artifacts) {
  for (const [name, rows] of Object.entries(artifacts.sources)) {
    await stableRows(path.join(directory, name), rows, artifacts.hashes[name]);
  }
}

export async function verifyT02WorldArtifacts(directory, artifacts) {
  for (const [name, digest] of Object.entries(artifacts.hashes)) {
    if (await hashFile(path.join(directory, name)) !== digest) {
      throw new Error(`ICP-T02 artifact replay differs: ${name}.`);
    }
  }
}
