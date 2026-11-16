import path from "node:path";
import { fileURLToPath } from "node:url";
import { createExperimentExecutionReceipt } from "../lib/execution-receipt.mjs";
import { observeNodeRuntime } from "../lib/node-runtime-policy.mjs";
import { canonical, PUBLIC_SEEDS, sha256, validateFixture020Config } from "./contract.mjs";
import { T02_SEEDS, validateT02Config } from "./t02-contract.mjs";
import { json, readText } from "./storage.mjs";

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

const TRACK_PARAMS = Object.freeze({
  "ICP-T01": { seeds: PUBLIC_SEEDS, seedDocument: "seeds/development.reveal.json",
    seedAlgorithm: "fixture-020-icp-t01-public-seeds-v1", configFile: (p) => `configs/${p}.json`,
    validateConfig: validateFixture020Config },
  "ICP-T02": { seeds: T02_SEEDS, seedDocument: "seeds/t02-development.reveal.json",
    seedAlgorithm: "fixture-020-icp-t02-public-seeds-v1", configFile: (p) => `configs/t02-${p}.json`,
    validateConfig: validateT02Config },
});

export async function loadInputs(profile, track = "ICP-T01") {
  const tp = TRACK_PARAMS[track];
  if (!tp) throw new Error(`fixture-020 unknown track ${track}.`);
  if (!new Set(["smoke", "development"]).has(profile)) throw new Error(`${track} public profiles only.`);
  const config = tp.validateConfig(await json(path.join(fixtureRoot, tp.configFile(profile))));
  if (config.profile !== profile) throw new Error(`${track} profile/config mismatch.`);
  const document = await json(path.join(fixtureRoot, tp.seedDocument));
  if (document.algorithm !== tp.seedAlgorithm
    || canonical(document.seeds) !== canonical(tp.seeds)) throw new Error(`${track} public seed pack mismatch.`);
  const hashes = {};
  for (const relative of SOURCES) hashes[relative] = sha256(await readText(path.resolve(fixtureRoot, relative)));
  const receipt = createExperimentExecutionReceipt({ artifact: "fixture-020",
    command: profile === "smoke" ? "smoke" : "run", profile });
  const runtime = observeNodeRuntime();
  if (!runtime.node_version.startsWith("26.")) throw new Error("fixture-020 requires Node 26.x.");
  const body = { schema: 1, artifact: "fixture-020", track, profile, config,
    seeds: profile === "smoke" ? tp.seeds.slice(0, 2) : tp.seeds,
    source_hashes: hashes, execution_receipt: receipt, node_runtime: runtime };
  return { ...body, run_id: sha256(canonical(body)) };
}
