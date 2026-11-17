import path from "node:path";
import { fileURLToPath } from "node:url";
import { createExperimentExecutionReceipt } from "../lib/execution-receipt.mjs";
import { observeNodeRuntime } from "../lib/node-runtime-policy.mjs";
import { canonical, sha256 } from "./contract.mjs";
import { json, readText } from "./storage.mjs";
import { getTrack } from "./tracks.mjs";

export const fixtureRoot = path.dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = path.resolve(fixtureRoot, "../../..");
const SOURCES = Object.freeze([
  "accounting.mjs", "artifacts.mjs", "contract.mjs", "evaluator.mjs", "forcing.mjs", "generator.mjs",
  "graph.mjs", "inputs.mjs", "max-flow.mjs", "observations.mjs", "policy.mjs", "random.mjs",
  "runner.mjs", "resources.mjs", "storage.mjs", "output.schema.json",
  "t02-contract.mjs", "t02-generator.mjs", "t02-objective.mjs", "t02-evaluator.mjs",
  "t02-policy.mjs", "t02-artifacts.mjs", "tracks.mjs",
  "configs/smoke.json", "configs/development.json",
  "configs/t02-smoke.json", "configs/t02-development.json",
  "seeds/development.reveal.json", "seeds/t02-development.reveal.json",
  "seeds/confirmation.unavailable.json", "seeds/transfer.unavailable.json",
  "../lib/pcg64-dxsm.mjs", "../lib/exact-keys.mjs", "../lib/canonical-json.mjs",
  "../lib/checkpoint-ledger.mjs", "../lib/output-lock.mjs", "../lib/execution-receipt.mjs", "../lib/node-runtime-policy.mjs",
  "../lib/percentile.mjs", "../../fixtures/020-integrative-comparative-physiology.md",
]);

export async function loadInputs(profile, trackId = "ICP-T01") {
  const track = getTrack(trackId);
  if (!new Set(["smoke", "development"]).has(profile)) throw new Error(`${track.id} public profiles only.`);
  const config = track.validateConfig(await json(path.join(fixtureRoot, track.configFile(profile))));
  if (config.profile !== profile) throw new Error(`${track.id} profile/config mismatch.`);
  const document = await json(path.join(fixtureRoot, track.seedDocument));
  if (document.algorithm !== track.seedAlgorithm
    || canonical(document.seeds) !== canonical(track.seeds)) throw new Error(`${track.id} public seed pack mismatch.`);
  const hashes = {};
  for (let index = 0; index < SOURCES.length; index += 1) {
    const relative = SOURCES[index];
    hashes[relative] = sha256(await readText(path.resolve(fixtureRoot, relative)));
  }
  const receipt = createExperimentExecutionReceipt({ artifact: "fixture-020",
    command: profile === "smoke" ? "smoke" : "run", profile });
  const runtime = observeNodeRuntime();
  if (!runtime.node_version.startsWith("26.")) throw new Error("fixture-020 requires Node 26.x.");
  const body = { schema: 1, artifact: "fixture-020", track: track.id, profile, config,
    seeds: profile === "smoke" ? track.seeds.slice(0, 2) : track.seeds,
    source_hashes: hashes, execution_receipt: receipt, node_runtime: runtime };
  return { ...body, run_id: sha256(canonical(body)) };
}
