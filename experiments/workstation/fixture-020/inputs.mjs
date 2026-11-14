import path from "node:path";
import { fileURLToPath } from "node:url";
import { createExperimentExecutionReceipt } from "../lib/execution-receipt.mjs";
import { observeNodeRuntime } from "../lib/node-runtime-policy.mjs";
import { canonical, PUBLIC_SEEDS, sha256, validateFixture020Config } from "./contract.mjs";
import { json, readText } from "./storage.mjs";

export const fixtureRoot = path.dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = path.resolve(fixtureRoot, "../../..");
const SOURCES = Object.freeze([
  "accounting.mjs", "artifacts.mjs", "contract.mjs", "evaluator.mjs", "forcing.mjs", "generator.mjs",
  "graph.mjs", "inputs.mjs", "max-flow.mjs", "observations.mjs", "policy.mjs", "random.mjs",
  "runner.mjs", "resources.mjs", "storage.mjs", "output.schema.json", "configs/smoke.json", "configs/development.json",
  "seeds/development.reveal.json", "seeds/confirmation.unavailable.json", "seeds/transfer.unavailable.json",
  "../lib/pcg64-dxsm.mjs", "../lib/exact-keys.mjs", "../lib/canonical-json.mjs",
  "../lib/checkpoint-ledger.mjs", "../lib/execution-receipt.mjs", "../lib/node-runtime-policy.mjs",
  "../lib/percentile.mjs", "../../fixtures/020-integrative-comparative-physiology.md",
]);

export async function loadInputs(profile) {
  if (!new Set(["smoke", "development"]).has(profile)) throw new Error("ICP-T01 public profiles only.");
  const config = validateFixture020Config(await json(path.join(fixtureRoot, "configs", `${profile}.json`)));
  if (config.profile !== profile) throw new Error("ICP-T01 profile/config mismatch.");
  const document = await json(path.join(fixtureRoot, "seeds/development.reveal.json"));
  if (document.algorithm !== "fixture-020-icp-t01-public-seeds-v1"
    || canonical(document.seeds) !== canonical(PUBLIC_SEEDS)) throw new Error("ICP-T01 public seed pack mismatch.");
  const hashes = {};
  for (const relative of SOURCES) hashes[relative] = sha256(await readText(path.resolve(fixtureRoot, relative)));
  const receipt = createExperimentExecutionReceipt({ artifact: "fixture-020", command: "run", profile });
  const runtime = observeNodeRuntime();
  if (!runtime.node_version.startsWith("26.")) throw new Error("ICP-T01 requires Node 26.x.");
  const body = { schema: 1, artifact: "fixture-020", profile, config,
    seeds: profile === "smoke" ? PUBLIC_SEEDS.slice(0, 2) : PUBLIC_SEEDS,
    source_hashes: hashes, execution_receipt: receipt, node_runtime: runtime };
  return { ...body, run_id: sha256(canonical(body)) };
}
