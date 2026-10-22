import { exactKeys } from "../lib/exact-keys.mjs";

const OPAQUE_WORLD_ID = /^w23_[0-9a-f]{32}$/;

const EVALUATOR_ONLY_KEYS = Object.freeze(new Set([
  "seed",
  "world_index",
  "hidden_duration_s",
  "target_probability",
  "target_label",
  "evaluator_probability",
  "intervention_cell",
  "corruption_family",
  "rho",
]));

function assertEvaluatorFieldsAbsent(value, location = "policy input") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertEvaluatorFieldsAbsent(item, `${location}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (EVALUATOR_ONLY_KEYS.has(key)) {
      throw new Error(`Fixture 023 evaluator-only field ${key} reached ${location}.`);
    }
    assertEvaluatorFieldsAbsent(child, `${location}.${key}`);
  }
}

function validateVisibleTask(task, dimensions) {
  if (
    !exactKeys(task, ["features", "label"])
    || !Array.isArray(task.features)
    || task.features.length !== dimensions
    || task.features.some((value) => !Number.isFinite(value))
    || !new Set([0, 1]).has(task.label)
  ) throw new Error("Fixture 023 visible lifecycle task is invalid or not closed.");
}

export function assertT01PolicyInput(input) {
  assertEvaluatorFieldsAbsent(input, "PLM-T01 policy input");
  if (
    !exactKeys(input, ["schema", "artifact", "track", "world_id", "observations"])
    || input.schema !== 1
    || input.artifact !== "fixture-023"
    || input.track !== "PLM-T01"
    || !OPAQUE_WORLD_ID.test(input.world_id)
    || !Array.isArray(input.observations)
    || input.observations.length < 1
    || input.observations.some((value) => value !== null && value !== 0 && value !== 1)
  ) throw new Error("Fixture 023 PLM-T01 visible policy input is invalid or not closed.");
  return input;
}

export function assertT02PolicyInput(input) {
  assertEvaluatorFieldsAbsent(input, "PLM-T02 policy input");
  if (
    !exactKeys(input, [
      "schema",
      "artifact",
      "track",
      "world_id",
      "boundary_event",
      "previous_tasks",
      "adaptation_tasks",
      "evaluation_features",
    ])
    || input.schema !== 1
    || input.artifact !== "fixture-023"
    || input.track !== "PLM-T02"
    || !OPAQUE_WORLD_ID.test(input.world_id)
    || !exactKeys(input.boundary_event, ["state", "authenticated"])
    || !new Set(["authentic", "duplicate", "delayed", "missing"]).has(input.boundary_event.state)
    || input.boundary_event.authenticated !== (input.boundary_event.state === "authentic")
    || !Array.isArray(input.previous_tasks)
    || !Array.isArray(input.adaptation_tasks)
    || !Array.isArray(input.evaluation_features)
    || input.previous_tasks.length < 1
    || input.adaptation_tasks.length < 1
    || input.evaluation_features.length < 1
    || input.adaptation_tasks.length !== input.evaluation_features.length
  ) throw new Error("Fixture 023 PLM-T02 visible policy input is invalid or not closed.");
  const dimensions = input.previous_tasks[0]?.features?.length;
  if (!Number.isSafeInteger(dimensions) || dimensions < 1) {
    throw new Error("Fixture 023 PLM-T02 visible feature dimension is invalid.");
  }
  input.previous_tasks.forEach((task) => validateVisibleTask(task, dimensions));
  input.adaptation_tasks.forEach((task) => validateVisibleTask(task, dimensions));
  if (input.evaluation_features.some((features) => (
    !Array.isArray(features)
    || features.length !== dimensions
    || features.some((value) => !Number.isFinite(value))
  ))) throw new Error("Fixture 023 visible evaluation feature row is invalid.");
  return input;
}
