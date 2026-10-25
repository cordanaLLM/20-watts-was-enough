import { canonicalize, sha256Hex } from "../lib/checkpoint-ledger.mjs";

export const FIXTURE_026_RSD_T02_NULL_MATURATION_DESIGN_VERSION =
  "fixture-026.rsd-t02-null-maturation-design.v1";
export const FIXTURE_026_RSD_T02_NULL_MATURATION_DESIGN_SHA256 =
  "6ea5a873c4cbd0770feba459e5e46e438e778bcce5f821ca8a4ec8f83d0ed90b";
export const FIXTURE_026_RSD_T02_NULL_PROTOTYPE_IMPLEMENTATION_SHA256 =
  "2a0440334adfc51b50ff22848ac0f675d1efa600b384462ad39dfa6068a0b405";
export const FIXTURE_026_RSD_T02_PARAMETERIZED_RUNNER_RELEASE_VERSION =
  "fixture-026.rsd-t02-parameterized-runner-release.v1";
export const FIXTURE_026_RSD_T02_PARAMETERIZED_RUNNER_RELEASE_SHA256 =
  "8e85ac8d8df855f498883230086443e06bf518a849149f8cad75aa77b2a45ae4";
export const FIXTURE_026_RSD_T02_PARAMETERIZED_RUNNER_RELEASE_EXACT_BYTES_SHA256 =
  "379b5d67b2833b023df24860238ce2163055a549b681e769aef4fd2782a6aef2";

const REQUIRED_NULLS = Object.freeze(["B-STATE-SPACE", "B-RECURRENT"]);
const REQUIRED_PRIMARY_PROPERTIES = Object.freeze([
  "drive_transform",
  "reported_output_feedback_edge",
  "channel_local_state",
]);

function digest(value) {
  try {
    return sha256Hex(canonicalize(value));
  } catch {
    throw new Error("Fixture 026 RSD-T02 null maturation refused: noncanonical input");
  }
}

function refuse(message) {
  throw new Error(`Fixture 026 RSD-T02 null maturation refused: ${message}`);
}

function exactKeys(value, keys) {
  return value
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

export function assertFixture026RsdT02ParameterizedRunnerRelease(release) {
  const requiredFoundationGates = [
    "complete_twenty_instance_traversal",
    "content_addressed_twenty_six_projection_policy",
    "fresh_restricted_child_per_fixed_packet",
    "semantic_response_replay",
    "durable_fixed_instance_and_outer_resume",
    "live_directory_identity_revalidation",
  ];
  const requiredLimitations = [
    "no-authenticated-owner-custody",
    "no-automatic-abandoned-lock-recovery",
    "no-external-rollback-head",
    "no-power-loss-guarantee-beyond-requested-file-sync",
    "no-trained-estimator-execution",
    "no-endpoint-aggregation",
    "no-model-comparison",
  ];
  const artifacts = release?.release_artifacts;
  if (
    digest(release) !== FIXTURE_026_RSD_T02_PARAMETERIZED_RUNNER_RELEASE_SHA256
    || !exactKeys(release, [
      "schema", "contract_version", "artifact", "track", "gate", "authority",
      "closure_rule", "release_artifacts", "foundation_gates", "limitations",
      "comparison_inference_permitted", "claim_eligible", "result_label",
    ])
    || release.schema !== 1
    || release.contract_version !== FIXTURE_026_RSD_T02_PARAMETERIZED_RUNNER_RELEASE_VERSION
    || release.artifact !== "fixture-026"
    || release.track !== "RSD-T02"
    || release.gate !== "validated-parameterized-transcript-policy-resource-runner"
    || release.authority !== "public-development-infrastructure-release-binding-only"
    || release.closure_rule !== "all-listed-local-runtime-artifacts-required-at-exact-bytes"
    || !Array.isArray(artifacts)
    || artifacts.length !== 22
    || new Set(artifacts.map(({ role }) => role)).size !== 22
    || new Set(artifacts.map(({ path }) => path)).size !== 22
    || artifacts.some((entry) => (
      !exactKeys(entry, ["role", "path", "sha256_exact_bytes"])
      || typeof entry.role !== "string"
      || !/^[a-z0-9-]+$/u.test(entry.role)
      || typeof entry.path !== "string"
      || entry.path.length < 3
      || (/^\.\./u.test(entry.path) && ![
        "../lib/checkpoint-ledger.mjs",
        "../lib/node-runtime-policy.mjs",
      ].includes(entry.path))
      || /^(?:[a-z]:|[/\\])/iu.test(entry.path)
      || typeof entry.sha256_exact_bytes !== "string"
      || !/^[0-9a-f]{64}$/u.test(entry.sha256_exact_bytes)
    ))
    || !exactKeys(release.foundation_gates, requiredFoundationGates)
    || requiredFoundationGates.some((gate) => release.foundation_gates[gate] !== true)
    || release.limitations?.join("|") !== requiredLimitations.join("|")
    || release.comparison_inference_permitted !== false
    || release.claim_eligible !== false
    || release.result_label !== "NO_RESULT"
  ) refuse("parameterized runner release differs from its exact NO_RESULT closure");
  return release;
}

export function deriveFixture026RsdT02NullAuthority({
  promotion_gates: promotionGates,
  active_fitting_blockers: activeFittingBlockers,
  measured_energy_claim: measuredEnergyClaim,
}) {
  const scopes = ["null_maturity", "comparison_release", "energy_comparison_conditional"];
  if (
    !exactKeys(promotionGates, scopes)
    || typeof measuredEnergyClaim !== "boolean"
    || !Array.isArray(activeFittingBlockers)
    || activeFittingBlockers.some((blocker) => typeof blocker !== "string" || blocker.length < 3)
    || new Set(activeFittingBlockers).size !== activeFittingBlockers.length
  ) refuse("gate derivation needs closed scopes, unique blockers, and an explicit energy-claim boolean");

  const gateIds = new Set();
  for (const scope of scopes) {
    const gates = promotionGates[scope];
    if (
      !Array.isArray(gates)
      || gates.length < 1
      || gates.some((gate) => (
        !exactKeys(gate, ["gate", "satisfied"])
        || typeof gate.gate !== "string"
        || gate.gate.length < 3
        || typeof gate.satisfied !== "boolean"
      ))
    ) refuse(`invalid ${scope} gate array`);
    for (const { gate } of gates) {
      if (gateIds.has(gate)) refuse(`duplicate gate ${gate}`);
      gateIds.add(gate);
    }
  }

  const affectedFittingPermitted = activeFittingBlockers.length === 0;
  const intrinsicNullGatesSatisfied = promotionGates.null_maturity
    .every(({ satisfied }) => satisfied);
  const matureNullGateSatisfied = affectedFittingPermitted && intrinsicNullGatesSatisfied;
  const comparisonReleaseGateSatisfied = matureNullGateSatisfied
    && promotionGates.comparison_release.every(({ satisfied }) => satisfied);
  const energyGatesSatisfied = promotionGates.energy_comparison_conditional
    .every(({ satisfied }) => satisfied);
  const applicableScopes = measuredEnergyClaim
    ? scopes
    : ["null_maturity", "comparison_release"];
  const applicableGates = applicableScopes.flatMap((scope) => (
    promotionGates[scope].map((gate) => ({ scope, ...gate }))
  ));
  const satisfiedGates = applicableGates
    .filter(({ satisfied }) => satisfied)
    .map(({ scope, gate }) => `${scope}:${gate}`);
  const unsatisfiedGates = applicableGates
    .filter(({ satisfied }) => !satisfied)
    .map(({ scope, gate }) => `${scope}:${gate}`);

  return Object.freeze({
    affected_fitting_permitted: affectedFittingPermitted,
    active_fitting_blocker_count: activeFittingBlockers.length,
    intrinsic_null_gates_satisfied: intrinsicNullGatesSatisfied,
    mature_null_gate_satisfied: matureNullGateSatisfied,
    comparison_release_gate_satisfied: comparisonReleaseGateSatisfied,
    energy_comparison_gate_applicable: measuredEnergyClaim,
    energy_comparison_gate_satisfied: measuredEnergyClaim ? energyGatesSatisfied : null,
    claim_release_gate_satisfied: comparisonReleaseGateSatisfied
      && (!measuredEnergyClaim || energyGatesSatisfied),
    registered_gate_count: scopes.reduce(
      (count, scope) => count + promotionGates[scope].length,
      0,
    ),
    applicable_gate_count: applicableGates.length,
    satisfied_gate_count: satisfiedGates.length,
    unsatisfied_gate_count: unsatisfiedGates.length,
    satisfied_gates: Object.freeze(satisfiedGates),
    unsatisfied_gates: Object.freeze(unsatisfiedGates),
  });
}

export function assertFixture026RsdT02NullMaturationDesign(design) {
  const ladderStatuses = design?.maturity_ladder?.map(({ status }) => status);
  const currentArms = design?.current_implementations?.map(({ arm_id: armId }) => armId);
  const targetArms = design?.target_null_contract?.required_arm_ids;
  const prototypeParent = design?.parent_artifacts?.find(({ path }) => (
    path === "rsd-t02-null-prototypes.mjs"
  ));
  const runnerReleaseParent = design?.parent_artifacts?.find(({ path }) => (
    path === "configs/rsd-t02-parameterized-runner-release.json"
  ));
  const currentAuthority = deriveFixture026RsdT02NullAuthority({
    promotion_gates: design?.promotion_gates,
    active_fitting_blockers: design?.fit_contract?.affected_fitting_blockers,
    measured_energy_claim: false,
  });
  if (
    digest(design) !== FIXTURE_026_RSD_T02_NULL_MATURATION_DESIGN_SHA256
    || design?.schema !== 1
    || design.contract_version !== FIXTURE_026_RSD_T02_NULL_MATURATION_DESIGN_VERSION
    || design.artifact !== "fixture-026"
    || design.track !== "RSD-T02"
    || design.authority !== "prospective-null-maturation-design-only"
    || !Array.isArray(design.parent_artifacts)
    || design.parent_artifacts.length !== 12
    || new Set(design.parent_artifacts.map(({ path }) => path)).size !== 12
    || prototypeParent?.role !== "level-two-null-prototype-implementation"
    || prototypeParent.sha256_exact_bytes
      !== FIXTURE_026_RSD_T02_NULL_PROTOTYPE_IMPLEMENTATION_SHA256
    || runnerReleaseParent?.role !== "parameterized-runner-release-closure"
    || runnerReleaseParent.sha256_exact_bytes
      !== FIXTURE_026_RSD_T02_PARAMETERIZED_RUNNER_RELEASE_EXACT_BYTES_SHA256
    || !Array.isArray(ladderStatuses)
    || ladderStatuses.join("|") !== [
      "fixed-conformance-reference",
      "trainable-public-prototype",
      "fit-frozen-development-estimator",
      "calibrated-development-comparator",
      "confirmation-frozen-mature-null",
      "confirmation-evaluated",
    ].join("|")
    || currentArms?.join("|") !== REQUIRED_NULLS.join("|")
    || targetArms?.join("|") !== REQUIRED_NULLS.join("|")
    || design.current_implementations.some((arm) => (
      arm.current_level !== 2
      || arm.current_status !== "trainable-public-prototype"
      || arm.current_property_coverage.join("|") !== REQUIRED_PRIMARY_PROPERTIES.join("|")
      || (arm.arm_id === "B-STATE-SPACE"
        && arm.trainable_state_space_estimator_exists !== true)
      || (arm.arm_id === "B-RECURRENT"
        && arm.trainable_gru_style_estimator_exists !== true)
      || arm.calibrated_probability_output_exists !== false
      || arm.satisfies_mature_null_gate !== false
    ))
    || design.target_null_contract.primary_property_keys.join("|")
      !== REQUIRED_PRIMARY_PROPERTIES.join("|")
    || design.target_null_contract.same_fixed_parameter_packet_schema !== true
    || design.target_null_contract.same_allowlisted_causal_fields !== true
    || design.target_null_contract.joint_property_vector_domain_before_causal_memory_activation
      .join("|") !== REQUIRED_PRIMARY_PROPERTIES.join("|")
    || design.target_null_contract.joint_property_vector_domain_after_causal_memory_activation
      .join("|") !== [...REQUIRED_PRIMARY_PROPERTIES, "causal_memory"].join("|")
    || design.development_role_contract.assignment_unit !== "canonical-system-instance-id"
    || design.development_role_contract.current_public_plan_role_assignment_state
      !== "not-created"
    || design.fit_contract.affected_fitting_permitted_now !== false
    || design.fit_contract.training_objective_weight_symbol !== "a_q"
    || design.fit_contract.training_objective_weight_constraints
      !== "nonnegative-and-sum-over-active-properties-equals-one"
    || design.fit_contract.endpoint_aggregation_weight_symbol !== "w_q"
    || design.fit_contract.endpoint_aggregation_weight_constraints
      !== "nonnegative-and-sum-over-active-properties-equals-one"
    || design.fit_contract.endpoint_aggregation_weights_used_for_training !== false
    || design.fit_contract.objective_coefficient_domains?.lambda_E?.lower_bound !== 0
    || design.fit_contract.objective_coefficient_domains.lambda_E.lower_bound_inclusive !== false
    || design.fit_contract.objective_coefficient_domains.lambda_E.unit !== "1"
    || design.fit_contract.objective_coefficient_domains.lambda_E.selection_role !== "fit-only"
    || ["lambda_P", "lambda_R"].some((coefficient) => (
      design.fit_contract.objective_coefficient_domains?.[coefficient]?.lower_bound !== 0
      || design.fit_contract.objective_coefficient_domains[coefficient].lower_bound_inclusive
        !== true
      || design.fit_contract.objective_coefficient_domains[coefficient].unit !== "1"
      || design.fit_contract.objective_coefficient_domains[coefficient].selection_role
        !== "fit-only"
    ))
    || ![
      "equivalence-mass-coefficient-lambda_E",
      "predictive-loss-coefficient-lambda_P",
      "regularizer-coefficient-lambda_R",
    ].every((coefficient) => (
      design.fit_contract.hyperparameters_selected_inside_fit_only.includes(coefficient)
    ))
    || design.fit_contract.deterministic_tie_break_frozen_before_trial_outcomes !== true
    || design.fit_contract.affected_fitting_blockers?.length !== 3
    || design.calibration_and_abstention_contract.calibration_may_change_model_weights
      !== false
    || design.calibration_and_abstention_contract.final_numeric_common_resource_caps_frozen_before_calibration
      !== true
    || design.calibration_and_abstention_contract.support_threshold_tie_rule
      !== "equal-to-threshold-abstains"
    || design.calibration_and_abstention_contract.non_abstention_action_tie_rule
      !== "equal-minimum-expected-loss-across-actions-abstains"
    || design.resource_contract.provisional_pilot_envelope.active_cap !== false
    || design.resource_contract.measured_joules_required_for_energy_comparison !== true
    || design.freeze_order.length !== 14
    || design.freeze_order[7]
      !== "precalibration-support-coverage-floor-frozen-from-fit-only-data"
    || design.freeze_order[8] !== "calibrator-support-and-abstention"
    || design.freeze_order[9] !== "one-pass-development-evaluation-and-pilot-variance"
    || design.freeze_order[10]
      !== "null-work-ledger-and-resource-accounting-audited"
    || design.promotion_gates?.null_maturity?.length !== 10
    || design.promotion_gates?.comparison_release?.length !== 10
    || design.promotion_gates?.energy_comparison_conditional?.length !== 1
    || Object.values(design.promotion_gates).flat()
      .filter(({ satisfied }) => satisfied).length !== 5
    || design.promotion_gates.null_maturity.some(({ gate, satisfied }) => (
      satisfied && ![
        "validated-parameterized-transcript-policy-resource-runner",
        "trainable-state-space-prototype-passes",
        "trainable-recurrent-prototype-passes",
      ].includes(gate)
    ))
    || [
      "validated-parameterized-transcript-policy-resource-runner",
      "trainable-state-space-prototype-passes",
      "trainable-recurrent-prototype-passes",
    ].some((requiredGate) => !design.promotion_gates.null_maturity.some(({ gate, satisfied }) => (
      gate === requiredGate && satisfied
    )))
    || design.promotion_gates.energy_comparison_conditional.some(({ satisfied }) => satisfied)
    || design.promotion_gates.comparison_release.some(({ gate, satisfied }) => (
      satisfied && ![
        "versioned-public-family-registry",
        "validated-fixed-parameter-instance-generator",
      ].includes(gate)
    ))
    || !design.promotion_gates.null_maturity.some(({ gate }) => (
      gate === "null-work-ledger-and-resource-accounting-audited"
    ))
    || !design.promotion_gates.comparison_release.some(({ gate }) => (
      gate === "experiment-wide-paired-resource-accounting-audited"
    ))
    || design.promotion_gates.energy_comparison_conditional[0].gate
      !== "measured-energy-meter-protocol-frozen"
    || currentAuthority.active_fitting_blocker_count !== 3
    || currentAuthority.applicable_gate_count !== 20
    || currentAuthority.registered_gate_count !== 21
    || currentAuthority.satisfied_gate_count !== 5
    || currentAuthority.unsatisfied_gate_count !== 15
    || design.mature_null_gate_satisfied !== currentAuthority.mature_null_gate_satisfied
    || design.affected_fitting_permitted !== currentAuthority.affected_fitting_permitted
    || design.comparison_inference_permitted !== false
    || design.claim_eligible !== false
    || design.result_label !== "NO_RESULT"
  ) refuse("design differs from the closed prospective NO_RESULT contract");
  return design;
}

export function assertFixture026RsdT02NullMaturationParents({ design, sourceBytesByPath }) {
  assertFixture026RsdT02NullMaturationDesign(design);
  if (!(sourceBytesByPath instanceof Map)) refuse("parent sources must be a path-to-bytes Map");
  for (const parent of design.parent_artifacts) {
    const bytes = sourceBytesByPath.get(parent.path);
    if (!(bytes instanceof Uint8Array)) refuse(`missing exact parent bytes for ${parent.path}`);
    if (sha256Hex(bytes) !== parent.sha256_exact_bytes) {
      refuse(`parent bytes drifted for ${parent.path}`);
    }
  }
  const releaseParent = design.parent_artifacts.find(({ role }) => (
    role === "parameterized-runner-release-closure"
  ));
  let release;
  try {
    release = JSON.parse(Buffer.from(sourceBytesByPath.get(releaseParent.path)).toString("utf8"));
  } catch {
    refuse("parameterized runner release is not valid UTF-8 JSON");
  }
  assertFixture026RsdT02ParameterizedRunnerRelease(release);
  for (const artifact of release.release_artifacts) {
    const bytes = sourceBytesByPath.get(artifact.path);
    if (!(bytes instanceof Uint8Array)) {
      refuse(`missing exact runner-release bytes for ${artifact.path}`);
    }
    if (sha256Hex(bytes) !== artifact.sha256_exact_bytes) {
      refuse(`runner-release bytes drifted for ${artifact.path}`);
    }
  }
  const registeredPaths = new Set([
    ...design.parent_artifacts.map(({ path }) => path),
    ...release.release_artifacts.map(({ path }) => path),
  ]);
  if (sourceBytesByPath.size !== registeredPaths.size) {
    refuse("parent source map contains unregistered files");
  }
  return true;
}

export function summarizeFixture026RsdT02NullMaturity(
  design,
  { measured_energy_claim: measuredEnergyClaim = false } = {},
) {
  assertFixture026RsdT02NullMaturationDesign(design);
  const authority = deriveFixture026RsdT02NullAuthority({
    promotion_gates: design.promotion_gates,
    active_fitting_blockers: design.fit_contract.affected_fitting_blockers,
    measured_energy_claim: measuredEnergyClaim,
  });
  const unsatisfiedNullMaturityGates = design.promotion_gates.null_maturity
    .filter(({ satisfied }) => !satisfied)
    .map(({ gate }) => gate);
  return Object.freeze({
    arms: Object.freeze(design.current_implementations.map((arm) => Object.freeze({
      arm_id: arm.arm_id,
      current_level: arm.current_level,
      current_status: arm.current_status,
      current_property_coverage: Object.freeze([...arm.current_property_coverage]),
      calibrated_probability_output_exists: arm.calibrated_probability_output_exists,
      satisfies_mature_null_gate: arm.satisfies_mature_null_gate,
    }))),
    highest_common_level: 2,
    highest_common_status: "trainable-public-prototype",
    registered_gate_count: authority.registered_gate_count,
    total_gate_count: authority.applicable_gate_count,
    satisfied_gate_count: authority.satisfied_gate_count,
    unsatisfied_gate_count: authority.unsatisfied_gate_count,
    satisfied_gates: authority.satisfied_gates,
    unsatisfied_gates: authority.unsatisfied_gates,
    null_maturity_gate_count: design.promotion_gates.null_maturity.length,
    unsatisfied_null_maturity_gate_count: unsatisfiedNullMaturityGates.length,
    unsatisfied_null_maturity_gates: Object.freeze(unsatisfiedNullMaturityGates),
    active_fitting_blocker_count: authority.active_fitting_blocker_count,
    affected_fitting_permitted: authority.affected_fitting_permitted,
    mature_null_gate_satisfied: authority.mature_null_gate_satisfied,
    comparison_inference_permitted: authority.comparison_release_gate_satisfied,
    energy_comparison_gate_applicable: authority.energy_comparison_gate_applicable,
    energy_comparison_gate_satisfied: authority.energy_comparison_gate_satisfied,
    claim_eligible: authority.claim_release_gate_satisfied,
    result_label: "NO_RESULT",
  });
}

export function assertFixture026RsdT02MatureNullAuthority(design) {
  const summary = summarizeFixture026RsdT02NullMaturity(design);
  if (summary.mature_null_gate_satisfied) return true;
  refuse(
    `mature-null authority is absent; ${summary.unsatisfied_null_maturity_gate_count} null-maturity gates and ${summary.active_fitting_blocker_count} fitting blockers remain`,
  );
}
