import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createAjv } from "../lib/ajv.mjs";

import { canonicalize, sha256Hex } from "../lib/checkpoint-ledger.mjs";
import {
  FIXTURE_026_RSD_T02_ACTIVE_ARM_IDS,
  FIXTURE_026_RSD_T02_INACTIVE_ARM_IDS,
  assertFixture026RsdT02ArmCommitment,
  assertFixture026RsdT02ArmResponse,
  assertFixture026RsdT02SystemPacket,
  attachFixture026RsdT02ArmResponse,
  buildFixture026RsdT02ArmCommitment,
  buildFixture026RsdT02SystemPacket,
  evaluateFixture026RsdT02ArmBase,
  runFixture026RsdT02Arm,
  validateFixture026RsdT02ArmBankConfig,
} from "./rsd-t02-arm-bank.mjs";
import { FIXTURE_026_RSD_T02_RECIPES } from "./rsd-t02-contract.mjs";
import {
  buildFixture026RsdT02EpisodeCommand,
  buildFixture026RsdT02WorkUnits,
  fixture026RsdT02Projection,
  generateFixture026RsdT02Transcript,
} from "./rsd-t02-generator.mjs";

const SEED = "1561001";
const CONFIG_PATH = "experiments/workstation/fixture-026/configs/rsd-t02-arm-bank.json";
const POLICY_PATH = "experiments/workstation/fixture-026/rsd-t02-arm-bank.mjs";
const SCHEMA_PATH = "experiments/workstation/fixture-026/rsd-t02-arm-bank.schema.json";
const units = buildFixture026RsdT02WorkUnits({ profile: "smoke", seeds: [SEED] });
const packets = new Map();

async function inputs() {
  const configText = await readFile(CONFIG_PATH, "utf8");
  const policyBytes = await readFile(POLICY_PATH);
  return {
    config: validateFixture026RsdT02ArmBankConfig(JSON.parse(configText)),
    policyArtifactSha256: sha256Hex(policyBytes),
    policyArtifactBytes: policyBytes.byteLength,
    policyConfigSha256: sha256Hex(configText),
    policyConfigBytes: Buffer.byteLength(configText, "utf8"),
  };
}

function packetFor(recipeId) {
  if (!packets.has(recipeId)) {
    const projections = units
      .filter(({ recipe_id: registeredId }) => registeredId === recipeId)
      .map((unit) => fixture026RsdT02Projection(
        generateFixture026RsdT02Transcript(buildFixture026RsdT02EpisodeCommand(unit)),
      ));
    packets.set(recipeId, buildFixture026RsdT02SystemPacket(projections));
  }
  return packets.get(recipeId);
}

function rehashCommitment(commitment) {
  const body = { ...commitment };
  delete body.commitment_sha256;
  commitment.commitment_sha256 = sha256Hex(canonicalize(body));
  return commitment;
}

test("one whole-system packet is an exact 35-episode causal firewall", () => {
  const built = packetFor("M-I1-FFL");
  assert.equal(assertFixture026RsdT02SystemPacket(built.packet), built.packet);
  assert.equal(built.packet.projections.length, 35);
  assert.equal(
    built.packet.projections.reduce((sum, projection) => sum + projection.samples.length, 0),
    53795,
  );
  const serialized = canonicalize(built.packet);
  for (const forbidden of [
    "seed", "profile", "run_id", "recipe_id", "equation_id", "initialization_id",
    "regime_membership", "execution_id", "episode_id", "internal_output",
    "property_vector", "equivalence_class", "certificate", "evaluator",
  ]) assert.equal(serialized.includes(`"${forbidden}"`), false, forbidden);
  assert.equal(built.system_packet_sha256, sha256Hex(serialized));

  const reordered = structuredClone(built.packet);
  [reordered.projections[0], reordered.projections[1]] = [
    reordered.projections[1], reordered.projections[0],
  ];
  assert.throws(
    () => assertFixture026RsdT02SystemPacket(reordered),
    /projection 0 violates/u,
  );
});

test("a built packet is a sealed copy whose checked identity arm responses reuse", async () => {
  const provenance = await inputs();
  const built = packetFor("M-I1-FFL");
  const armId = FIXTURE_026_RSD_T02_ACTIVE_ARM_IDS[0];
  const projections = structuredClone(built.packet.projections);
  const rebuilt = buildFixture026RsdT02SystemPacket(projections);
  projections[0].samples[0].reported_output += 1;
  assert.equal(rebuilt.system_packet_sha256, built.system_packet_sha256);
  assert.equal(sha256Hex(canonicalize(rebuilt.packet)), built.system_packet_sha256);
  assert.throws(() => {
    rebuilt.packet.projections[0].samples[0].reported_output += 1;
  }, TypeError);
  assert.throws(() => rebuilt.packet.projections.pop(), TypeError);

  const sealed = runFixture026RsdT02Arm({ armId, packet: built.packet, ...provenance });
  const unsealed = runFixture026RsdT02Arm({
    armId, packet: structuredClone(built.packet), ...provenance,
  });
  assert.equal(canonicalize(sealed), canonicalize(unsealed));
  assert.equal(sealed.system_packet_sha256, built.system_packet_sha256);
  assert.equal(sealed.information_ledger.canonical_packet_bytes, built.system_packet_utf8_bytes);
});

test("an arm response over an unsealed packet still checks and hashes that packet", async () => {
  const provenance = await inputs();
  const built = packetFor("M-I1-FFL");
  const armId = FIXTURE_026_RSD_T02_ACTIVE_ARM_IDS[0];
  const baseResult = evaluateFixture026RsdT02ArmBase({
    armId, packet: built.packet, config: provenance.config,
  });
  const reordered = structuredClone(built.packet);
  assert.equal(
    attachFixture026RsdT02ArmResponse({ armId, packet: reordered, ...provenance, baseResult })
      .system_packet_sha256,
    built.system_packet_sha256,
  );
  [reordered.projections[0], reordered.projections[1]] = [
    reordered.projections[1], reordered.projections[0],
  ];
  assert.throws(
    () => attachFixture026RsdT02ArmResponse({ armId, packet: reordered, ...provenance, baseResult }),
    /projection 0 violates/u,
  );
  assert.throws(
    () => evaluateFixture026RsdT02ArmBase({ armId, packet: reordered, config: provenance.config }),
    /projection 0 violates/u,
  );
});

test("nine bounded policies decide only their frozen scopes without labels or tuning", async () => {
  const provenance = await inputs();
  for (const recipe of FIXTURE_026_RSD_T02_RECIPES) {
    const built = packetFor(recipe.recipe_id);
    const responses = FIXTURE_026_RSD_T02_ACTIVE_ARM_IDS.map((armId) => (
      runFixture026RsdT02Arm({ armId, packet: built.packet, ...provenance })
    ));
    assert.equal(new Set(responses.map((response) => canonicalize(
      response.information_ledger,
    ))).size, 1);
    assert.equal(new Set(responses.map(
      (response) => response.resource_ledger.common_caps_sha256,
    )).size, 1);
    for (const response of responses) {
      assert.equal(response.information_ledger.training_labels_seen, 0);
      assert.equal(response.information_ledger.tuning_trials, 0);
      assert.equal(response.information_ledger.evaluator_fields_seen, false);
      assert.equal(response.information_ledger.canonical_packet_bytes, built.system_packet_utf8_bytes);
      const actual = response.resource_ledger.inference.actual;
      assert.ok(actual.scalar_operations >= 53795 * 12);
      assert.ok(
        actual.scalar_operations
        <= response.resource_ledger.common_caps.scalar_operations,
      );
      assert.equal(response.resource_ledger.shared_acquisition.sample_rows_acquired, 53795);
      assert.equal(response.resource_ledger.shared_acquisition.input_commands, 197);
      assert.equal(response.resource_ledger.policy_construction.training_labels_seen, 0);
      assert.equal(response.resource_ledger.policy_construction.tuning_trials, 0);
      assert.ok(response.compatible_property_vectors.length >= 1);
      for (const vector of response.compatible_property_vectors) {
        for (const [key, result] of Object.entries(response.properties)) {
          if (result.action === "decide") assert.equal(vector.property_vector[key], result.decision);
        }
      }
      assert.equal(response.result_label, "NO_RESULT");
      assert.equal(response.comparison_inference_permitted, false);
    }
    const byArm = Object.fromEntries(responses.map((response) => [response.arm_id, response]));
    const stateSpace = byArm["B-STATE-SPACE"];
    assert.equal(
      stateSpace.properties.drive_transform.decision,
      recipe.property_vector.drive_transform,
    );
    assert.equal(stateSpace.properties.causal_memory.decision, true);
    assert.equal(stateSpace.properties.reported_output_feedback_edge.action, "abstain");
    assert.equal(stateSpace.properties.channel_local_state.action, "abstain");

    const recurrent = byArm["B-RECURRENT"];
    assert.equal(
      recurrent.properties.reported_output_feedback_edge.decision,
      recipe.property_vector.reported_output_feedback_edge,
    );
    assert.equal(
      recurrent.properties.channel_local_state.decision,
      recipe.property_vector.channel_local_state,
    );
    assert.equal(recurrent.properties.drive_transform.action, "abstain");
    assert.equal(recurrent.properties.causal_memory.action, "abstain");

    const mechanism = byArm["C-MECHANISM-BANK"];
    for (const key of Object.keys(recipe.property_vector)) {
      assert.equal(mechanism.properties[key].decision, recipe.property_vector[key]);
    }
    if (["M-I1-FFL", "M-STATIC-HIGHPASS"].includes(recipe.recipe_id)) {
      assert.deepEqual(
        mechanism.compatible_hypothesis_ids,
        ["M-I1-FFL", "M-STATIC-HIGHPASS"],
      );
    } else assert.deepEqual(mechanism.compatible_hypothesis_ids, [recipe.recipe_id]);

    assert.equal(byArm["A-RAW"].properties.drive_transform.action, "abstain");
    assert.equal(
      byArm["A-RAW"].properties.reported_output_feedback_edge.decision,
      recipe.property_vector.reported_output_feedback_edge,
    );
    for (const armId of ["B-STATIC-DIV", "B-LOG-RATIO", "B-DIFFERENCE"]) {
      assert.equal(
        byArm[armId].properties.drive_transform.decision,
        recipe.property_vector.drive_transform,
      );
    }
    assert.equal(
      byArm["B-STREAM"].properties.channel_local_state.decision,
      recipe.property_vector.channel_local_state,
    );
    for (const key of Object.keys(recipe.property_vector)) {
      assert.equal(byArm["C-DUAL"].properties[key].decision, recipe.property_vector[key]);
    }
    assert.equal(byArm["C-DUAL"].resource_ledger.inference.actual.fallback_invocations, 0);
  }
});

test("the pre-evaluator commitment binds every packet, active response, and inactive abstention", async () => {
  const provenance = await inputs();
  const packetInputs = FIXTURE_026_RSD_T02_RECIPES.map((recipe, systemSlot) => ({
    seed: SEED,
    system_slot: systemSlot,
    packet: packetFor(recipe.recipe_id).packet,
  }));
  const commitment = buildFixture026RsdT02ArmCommitment({
    profile: "smoke",
    packetInputs,
    ...provenance,
  });
  assert.equal(assertFixture026RsdT02ArmCommitment(commitment), commitment);
  assert.equal(commitment.packet_records.length, 5);
  assert.deepEqual(commitment.active_arm_ids, FIXTURE_026_RSD_T02_ACTIVE_ARM_IDS);
  assert.deepEqual(commitment.inactive_arm_ids, FIXTURE_026_RSD_T02_INACTIVE_ARM_IDS);
  assert.ok(commitment.packet_records.every((record) => (
    record.inactive_arm_responses.every((response) => response.action === "abstain")
  )));

  const forged = structuredClone(commitment);
  forged.packet_records[0].active_arm_responses[0].properties.drive_transform.decision = "log-fold";
  rehashCommitment(forged);
  assert.throws(
    () => assertFixture026RsdT02ArmCommitment(forged),
    /false compatible-hypothesis set|closed contract/u,
  );
  const duplicate = structuredClone(commitment);
  duplicate.packet_records[1].seed = duplicate.packet_records[0].seed;
  duplicate.packet_records[1].system_slot = duplicate.packet_records[0].system_slot;
  rehashCommitment(duplicate);
  assert.throws(() => assertFixture026RsdT02ArmCommitment(duplicate), /duplicate packet/u);
});

test("the arm-bank JSON schema and runtime validator accept the same materialized commitment", async () => {
  const provenance = await inputs();
  const commitment = buildFixture026RsdT02ArmCommitment({
    profile: "smoke",
    packetInputs: FIXTURE_026_RSD_T02_RECIPES.map((recipe, systemSlot) => ({
      seed: SEED,
      system_slot: systemSlot,
      packet: packetFor(recipe.recipe_id).packet,
    })),
    ...provenance,
  });
  const schema = JSON.parse(await readFile(SCHEMA_PATH, "utf8"));
  const validate = createAjv({ allErrors: true }).compile(schema);
  assert.equal(validate(commitment), true, JSON.stringify(validate.errors));
  assert.equal(assertFixture026RsdT02ArmCommitment(commitment), commitment);

  const forged = structuredClone(commitment);
  forged.packet_records[0].active_arm_responses[0].compatible_property_vectors[0]
    .property_vector.drive_transform = "log-fold";
  rehashCommitment(forged);
  assert.equal(validate(forged), true, JSON.stringify(validate.errors));
  assert.throws(
    () => assertFixture026RsdT02ArmCommitment(forged),
    /joint property-vector set|marginals contradict/u,
  );

  const response = commitment.packet_records[0].active_arm_responses.find(
    ({ arm_id: armId }) => armId === "C-MECHANISM-BANK",
  );
  for (const mutate of [
    (value) => { value.resource_ledger.shared_acquisition.input_commands = 198; },
    (value) => { value.resource_ledger.policy_construction.embedded_candidate_equations = 4; },
    (value) => { value.resource_ledger.inference.actual.scalar_operations = 1; },
    (value) => { value.policy_id = "forged-policy"; },
  ]) {
    const mutant = structuredClone(response);
    mutate(mutant);
    assert.throws(
      () => assertFixture026RsdT02ArmResponse(mutant),
      /ledger|cap envelope|closed contract/u,
    );
  }
});

test("policy thresholds and common caps are closed construction-tuned inputs", async () => {
  const { config } = await inputs();
  assert.equal(validateFixture026RsdT02ArmBankConfig(config), config);
  for (const mutate of [
    (value) => { value.common_caps.scalar_operations = 100000; },
    (value) => { value.policies["B-STATE-SPACE"].threshold_provenance = "confirmation"; },
    (value) => { value.information.training_labels = 1; },
    (value) => { value.information.tuning_trials = 1; },
    (value) => { value.packet.input_commands = 196; },
    (value) => { value.active_arm_ids = value.active_arm_ids.slice(0, -1); },
  ]) {
    const mutant = structuredClone(config);
    mutate(mutant);
    assert.throws(
      () => validateFixture026RsdT02ArmBankConfig(mutant),
      /configuration|policy configuration/u,
    );
  }
});
