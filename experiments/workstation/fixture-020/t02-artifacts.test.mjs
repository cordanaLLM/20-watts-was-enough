import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { cleanup, temporaryOutput } from "../lib/runner-test-helpers.mjs";
import { verifyWorldArtifacts, worldArtifacts, writeWorldArtifacts } from "./artifacts.mjs";
import { canonical, sha256 } from "./contract.mjs";
import { evaluateArmA } from "./evaluator.mjs";
import { generateFixture020World } from "./generator.mjs";
import { t02WorldArtifacts, verifyT02WorldArtifacts, writeT02WorldArtifacts } from "./t02-artifacts.mjs";
import { T02_ARTIFACT_FILES, T02_R_MAX, T02_R_MIN, T02_SEEDS } from "./t02-contract.mjs";
import { evaluateArmAT02 } from "./t02-evaluator.mjs";
import { calibrationCell, calibrationRegimeParams, generateT02World } from "./t02-generator.mjs";

function collectText(rows) {
  let output = "";
  for (const row of rows()) output += row;
  return output;
}

test("t02WorldArtifacts emits closed JSONL and CSV shapes with one solver-log row per iteration", () => {
  const world = generateT02World({ seed: T02_SEEDS[0] });
  const evaluation = evaluateArmAT02(world);
  assert.equal(evaluation.failure_reason, null);
  const artifacts = t02WorldArtifacts(world, evaluation);
  assert.deepEqual(Object.keys(artifacts.sources), [...T02_ARTIFACT_FILES]);
  for (const key of ["radii", "solverLog", "designCandidates", "edgeComponents", "nodePressures"]) {
    assert.equal(Object.hasOwn(artifacts.metrics, key), false, key);
  }
  for (const name of T02_ARTIFACT_FILES) {
    assert.equal(sha256(collectText(artifacts.sources[name])), artifacts.hashes[name], name);
  }
  assert.equal(sha256(collectText(artifacts.sources["world-manifest.json"]).trim()), world.world_sha256);
  assert.equal(collectText(artifacts.sources["tree.json"]), `${canonical(world.tree)}\n`);
  assert.equal(collectText(artifacts.sources["regime.json"]), `${canonical(world.regime_params)}\n`);
  const designs = collectText(artifacts.sources["designs.jsonl"]).trim().split("\n").map(JSON.parse);
  assert.deepEqual(designs.map((row) => row.candidate), ["lower", "midpoint", "upper", "golden-a", "golden-b"]);
  for (const row of designs) {
    assert.deepEqual(Object.keys(row), ["alpha", "candidate", "chosen", "feasible", "objective_w"]);
  }
  assert.equal(designs.filter((row) => row.chosen).length, 1);
  const pressureLines = collectText(artifacts.sources["pressure-ledger.csv"]).trim().split("\n");
  assert.equal(pressureLines[0], "node_id,pressure_pa,required_pa,margin_pa");
  assert.equal(pressureLines.length, 1 + world.tree.terminal_count);
  const componentLines = collectText(artifacts.sources["objective-components.csv"]).trim().split("\n");
  assert.equal(componentLines[0],
    "edge_id,radius_m,mu_e_pa_s,pressure_drop_pa,pumping_w,volume_w,pulsatile_w,wall_floor_w");
  assert.equal(componentLines.length, 1 + world.tree.edge_count);
  assert.equal(componentLines[1].split(",")[0], "1");
  assert.equal(componentLines.at(-1).split(",")[0], String(world.tree.edge_count));
  const solverLines = collectText(artifacts.sources["solver-log.jsonl"]).trim().split("\n").map(JSON.parse);
  assert.equal(solverLines.length, evaluation.golden_iterations);
  assert.equal(solverLines[0].iteration, 1);
  assert.equal(solverLines.at(-1).iteration, evaluation.golden_iterations);
});

test("t02WorldArtifacts emits header-only CSVs on generator failure and pressure-infeasible worlds", () => {
  const genFail = generateT02World({ seed: T02_SEEDS[0], rejectionLimit: 0 });
  const genArtifacts = t02WorldArtifacts(genFail, evaluateArmAT02(genFail));
  assert.equal(collectText(genArtifacts.sources["tree.json"]), "null\n");
  assert.equal(collectText(genArtifacts.sources["regime.json"]), "null\n");
  assert.equal(collectText(genArtifacts.sources["designs.jsonl"]), "");
  assert.equal(collectText(genArtifacts.sources["solver-log.jsonl"]), "");
  assert.equal(collectText(genArtifacts.sources["pressure-ledger.csv"]),
    "node_id,pressure_pa,required_pa,margin_pa\n");
  assert.equal(collectText(genArtifacts.sources["objective-components.csv"]),
    "edge_id,radius_m,mu_e_pa_s,pressure_drop_pa,pumping_w,volume_w,pulsatile_w,wall_floor_w\n");

  const world = {
    seed: T02_SEEDS[0], world_id: "ICP-T02-0x54020000", regime: "wall-floor",
    tree: calibrationCell(),
    regime_params: { lambda_A: 10, P_min: 30000, required_terminal_pressure: 30000 },
    manifest: { uniform_upper_round: 0, terminal_failure: null },
  };
  const infeasEval = evaluateArmAT02(world);
  assert.equal(infeasEval.failure_reason, "infeasible-design");
  assert.ok(infeasEval.evaluations > 0);
  const infeasArtifacts = t02WorldArtifacts(world, infeasEval);
  assert.equal(collectText(infeasArtifacts.sources["pressure-ledger.csv"]),
    "node_id,pressure_pa,required_pa,margin_pa\n");
  assert.equal(collectText(infeasArtifacts.sources["objective-components.csv"]),
    "edge_id,radius_m,mu_e_pa_s,pressure_drop_pa,pumping_w,volume_w,pulsatile_w,wall_floor_w\n");
  const designs = collectText(infeasArtifacts.sources["designs.jsonl"]).trim().split("\n").map(JSON.parse);
  assert.equal(designs.length, 5);
  assert.ok(designs.every((row) => row.feasible === false && row.chosen === false));
});

test("t02WorldArtifacts boundary: single-point alpha interval emits zero solver-log rows", () => {
  const qLow = T02_R_MIN ** 3;
  const qHigh = T02_R_MAX ** 3 * (1 - 1e-11);
  const tree = {
    depth: 1, node_count: 3, edge_count: 2, terminal_count: 2, first_terminal: 1,
    edge_lengths: [0.01, 0.01], edge_flows: [qLow, qHigh], terminal_flows: [qLow, qHigh],
    mu0: 0.003, lambda_V: 1e3, P_root: 25000, total_flow: qLow + qHigh,
  };
  const world = {
    seed: T02_SEEDS[0], world_id: "ICP-T02-0x54020000", regime: "classic",
    tree, regime_params: calibrationRegimeParams(),
    manifest: { uniform_upper_round: 0, terminal_failure: null },
  };
  const evaluation = evaluateArmAT02(world);
  assert.equal(evaluation.failure_reason, null);
  assert.equal(evaluation.golden_iterations, 0);
  const artifacts = t02WorldArtifacts(world, evaluation);
  assert.equal(collectText(artifacts.sources["solver-log.jsonl"]), "");
  const designs = collectText(artifacts.sources["designs.jsonl"]).trim().split("\n").map(JSON.parse);
  assert.equal(designs[0].candidate, "lower");
  assert.equal(designs[0].chosen, true);
});

test("write and verify world artifacts pass intact and reject tampered files with fixture-020 prefix", async () => {
  const fixture = await temporaryOutput("fixture-020-t02-artifacts-");
  try {
    const t02Dir = path.join(fixture.output, "t02");
    const t01Dir = path.join(fixture.output, "t01");
    await mkdir(t02Dir, { recursive: true });
    await mkdir(t01Dir, { recursive: true });
    const world = generateT02World({ seed: T02_SEEDS[0] });
    const artifacts = t02WorldArtifacts(world, evaluateArmAT02(world));
    await writeT02WorldArtifacts(t02Dir, artifacts);
    await verifyT02WorldArtifacts(t02Dir, artifacts);
    await writeFile(path.join(t02Dir, "objective-components.csv"), "tampered\n");
    await assert.rejects(() => verifyT02WorldArtifacts(t02Dir, artifacts),
      /^Error: fixture-020 artifact replay differs: objective-components\.csv\.$/);

    const t01World = generateFixture020World({ seed: 0x54010000 });
    const t01Artifacts = worldArtifacts(t01World, evaluateArmA(t01World));
    await writeWorldArtifacts(t01Dir, t01Artifacts);
    await writeFile(path.join(t01Dir, "graph.json"), "{}\n");
    await assert.rejects(() => verifyWorldArtifacts(t01Dir, t01Artifacts),
      /^Error: fixture-020 artifact replay differs: graph\.json\.$/);
  } finally {
    await cleanup(fixture);
  }
});
