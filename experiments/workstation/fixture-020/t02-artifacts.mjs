import { canonicalRows, hashArtifactSources, singleRow,
  verifyWorldArtifacts, writeWorldArtifacts } from "./artifacts.mjs";
import { T02_ARTIFACT_FILES } from "./t02-contract.mjs";

export const T02_ARTIFACT_FILES_LIST = T02_ARTIFACT_FILES;
export const writeT02WorldArtifacts = writeWorldArtifacts;
export const verifyT02WorldArtifacts = verifyWorldArtifacts;

function* csvRows(header, rows) {
  yield `${header}\n`;
  for (let index = 0; index < rows.length; index += 1) {
    yield `${rows[index].map(String).join(",")}\n`;
  }
}

function chosenDesignTables(world, edgeComponents, nodePressures) {
  const tree = world.tree;
  const pressureLedger = [];
  const objectiveComponents = [];
  if (!tree || !nodePressures || nodePressures.length === 0) {
    return { pressureLedger, objectiveComponents };
  }
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
  return { pressureLedger, objectiveComponents };
}

export function t02WorldArtifacts(world, evaluation) {
  const { solverLog = [], designCandidates = [], edgeComponents = [], nodePressures, ...metrics } = evaluation;
  delete metrics.radii;
  const { pressureLedger, objectiveComponents } = chosenDesignTables(world, edgeComponents, nodePressures);
  const designRows = designCandidates.map((c) => ({
    candidate: c.candidate, alpha: c.alpha, objective_w: c.objective_w,
    feasible: c.feasible, chosen: c.chosen,
  }));
  const sources = {
    "world-manifest.json": () => singleRow(world.manifest),
    "tree.json": () => singleRow(world.tree ?? null),
    "regime.json": () => singleRow(world.regime_params ?? null),
    "designs.jsonl": () => canonicalRows(designRows),
    "pressure-ledger.csv": () => csvRows("node_id,pressure_pa,required_pa,margin_pa", pressureLedger),
    "objective-components.csv": () => csvRows(
      "edge_id,radius_m,mu_e_pa_s,pressure_drop_pa,pumping_w,volume_w,pulsatile_w,wall_floor_w",
      objectiveComponents),
    "solver-log.jsonl": () => canonicalRows(solverLog),
  };
  return { sources, hashes: hashArtifactSources(sources), metrics };
}
